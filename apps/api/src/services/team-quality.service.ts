/**
 * Team Quality Service
 *
 * Story 8.3: Field Team Analytics — Supervisor view
 * Per-enumerator quality metrics + team averages + temporal patterns.
 *
 * Scoped: Supervisor sees their team, Super Admin can specify supervisorId or get system-wide.
 */

import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type {
  TeamQualityData,
  EnumeratorQualityMetric,
  TrendDataPoint,
  FrequencyBucket,
} from '@oslsr/types';
import { TeamAssignmentService } from './team-assignment.service.js';


const SUPPRESSION_MIN_N = 5;

/** Optional fields used for skip rate calculation */
const OPTIONAL_FIELDS = [
  'training_interest',
  'skills_other',
  'monthly_income',
  'apprentice_count',
  'bio_short',
  'portfolio_url',
  'consent_enriched',
] as const;

export interface TeamQualityParams {
  dateFrom?: string;
  dateTo?: string;
  enumeratorId?: string;
}

export class TeamQualityService {
  /**
   * Get per-enumerator quality metrics for a supervisor's team.
   * Super Admin can pass supervisorId to view any team, or omit for system-wide.
   */
  static async getTeamQuality(
    enumeratorIds: string[],
    params: TeamQualityParams = {},
  ): Promise<TeamQualityData> {
    if (enumeratorIds.length === 0) {
      return TeamQualityService.emptyResult();
    }

    // If filtering to a single enumerator, narrow the scope
    const targetIds = params.enumeratorId
      ? enumeratorIds.filter((id) => id === params.enumeratorId)
      : enumeratorIds;

    if (targetIds.length === 0) {
      return TeamQualityService.emptyResult();
    }

    const dateConditions = TeamQualityService.buildDateConditions(params);

    const [enumeratorMetrics, fraudMetrics, skipMetrics, dayOfWeek, hourOfDay, dailyTrend] =
      await Promise.all([
        TeamQualityService.getEnumeratorMetrics(targetIds, dateConditions),
        TeamQualityService.getFraudMetrics(targetIds, dateConditions),
        TeamQualityService.getSkipRates(targetIds, dateConditions),
        TeamQualityService.getDayOfWeekPattern(targetIds, dateConditions),
        TeamQualityService.getHourOfDayPattern(targetIds, dateConditions),
        TeamQualityService.getDailyTrend(targetIds, dateConditions),
      ]);

    // Merge metrics per enumerator
    const enumerators = TeamQualityService.mergeMetrics(
      enumeratorMetrics,
      fraudMetrics,
      skipMetrics,
    );

    // Team averages
    const teamAverages = TeamQualityService.computeTeamAverages(enumerators);

    return {
      enumerators,
      teamAverages,
      submissionsByDay: dailyTrend,
      dayOfWeekPattern: dayOfWeek,
      hourOfDayPattern: hourOfDay,
    };
  }

  /**
   * Resolve enumerator IDs for a supervisor, or return null for system-wide (Super Admin).
   */
  static async resolveEnumeratorIds(
    supervisorId?: string,
  ): Promise<string[]> {
    if (supervisorId) {
      return TeamAssignmentService.getEnumeratorIdsForSupervisor(supervisorId);
    }
    // System-wide: get all enumerator IDs that have submitted
    const rows = await db.execute(sql`
      SELECT DISTINCT s.enumerator_id
      FROM submissions s
      WHERE s.enumerator_id IS NOT NULL
    `);
    return (rows.rows as Array<{ enumerator_id: string }>).map((r) => r.enumerator_id);
  }

  private static buildDateConditions(params: TeamQualityParams) {
    const conditions: ReturnType<typeof sql>[] = [];
    if (params.dateFrom) {
      conditions.push(sql`s.submitted_at >= ${params.dateFrom}::timestamptz`);
    }
    if (params.dateTo) {
      conditions.push(sql`s.submitted_at <= ${params.dateTo}::timestamptz`);
    }
    return conditions;
  }

  private static async getEnumeratorMetrics(
    enumeratorIds: string[],
    dateConditions: ReturnType<typeof sql>[],
  ) {
    const where = sql.join(
      [
        sql`s.enumerator_id = ANY(${enumeratorIds})`,
        ...dateConditions,
      ],
      sql` AND `,
    );

    const rows = await db.execute(sql`
      SELECT
        s.enumerator_id,
        u.full_name AS name,
        COUNT(*) AS submission_count,
        AVG(s.completion_time_seconds) AS avg_completion_time,
        COUNT(*) FILTER (WHERE s.gps_latitude IS NOT NULL)::float / NULLIF(COUNT(*), 0) AS gps_rate,
        COUNT(*) FILTER (
          WHERE s.raw_data->>'nin' IS NOT NULL
            AND length(s.raw_data->>'nin') = 11
        )::float / NULLIF(COUNT(*), 0) AS nin_rate
      FROM submissions s
      JOIN users u ON s.enumerator_id = u.id::text
      WHERE ${where}
      GROUP BY s.enumerator_id, u.full_name
    `);

    return rows.rows as Array<{
      enumerator_id: string;
      name: string;
      submission_count: string;
      avg_completion_time: string | null;
      gps_rate: string | null;
      nin_rate: string | null;
    }>;
  }

  private static async getFraudMetrics(
    enumeratorIds: string[],
    dateConditions: ReturnType<typeof sql>[],
  ) {
    // fraud_detections.enumerator_id is uuid, submissions.enumerator_id is text
    // Join through submissions to apply date filters
    const dateConds = dateConditions.length > 0
      ? sql` AND ${sql.join(dateConditions, sql` AND `)}`
      : sql``;

    const rows = await db.execute(sql`
      SELECT
        fd.enumerator_id::text AS enumerator_id,
        COUNT(*) FILTER (WHERE fd.severity IN ('medium', 'high', 'critical'))::float
          / NULLIF(COUNT(*), 0) AS fraud_rate
      FROM fraud_detections fd
      JOIN submissions s ON fd.submission_id = s.id
      WHERE fd.enumerator_id::text = ANY(${enumeratorIds})${dateConds}
      GROUP BY fd.enumerator_id
    `);

    return rows.rows as Array<{
      enumerator_id: string;
      fraud_rate: string | null;
    }>;
  }

  private static async getSkipRates(
    enumeratorIds: string[],
    dateConditions: ReturnType<typeof sql>[],
  ) {
    const where = sql.join(
      [
        sql`s.enumerator_id = ANY(${enumeratorIds})`,
        sql`s.raw_data IS NOT NULL`,
        ...dateConditions,
      ],
      sql` AND `,
    );

    // Count null optional fields across all submissions per enumerator
    const fieldChecks = OPTIONAL_FIELDS.map(
      (f) => sql`CASE WHEN s.raw_data->>${f} IS NULL THEN 1 ELSE 0 END`,
    );
    const nullSum = sql.join(fieldChecks, sql` + `);
    const totalFields = OPTIONAL_FIELDS.length;

    const rows = await db.execute(sql`
      SELECT
        s.enumerator_id,
        AVG((${nullSum})::float / ${totalFields}) AS skip_rate
      FROM submissions s
      WHERE ${where}
      GROUP BY s.enumerator_id
    `);

    return rows.rows as Array<{
      enumerator_id: string;
      skip_rate: string | null;
    }>;
  }

  private static async getDayOfWeekPattern(
    enumeratorIds: string[],
    dateConditions: ReturnType<typeof sql>[],
  ): Promise<FrequencyBucket[]> {
    const where = sql.join(
      [
        sql`s.enumerator_id = ANY(${enumeratorIds})`,
        ...dateConditions,
      ],
      sql` AND `,
    );

    const rows = await db.execute(sql`
      SELECT
        EXTRACT(DOW FROM s.submitted_at AT TIME ZONE 'Africa/Lagos') AS day_of_week,
        COUNT(*) AS count
      FROM submissions s
      WHERE ${where}
      GROUP BY day_of_week
      ORDER BY day_of_week
    `);

    interface DayOfWeekRow {
      day_of_week: string | number;
      count: string | number;
    }

    const typedRows = rows.rows as DayOfWeekRow[];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const total = typedRows.reduce((sum, r) => sum + Number(r.count), 0);

    return dayNames.map((name, i) => {
      const row = typedRows.find((r) => Number(r.day_of_week) === i);
      const count = row ? Number(row.count) : 0;
      return {
        label: name,
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      };
    });
  }

  private static async getHourOfDayPattern(
    enumeratorIds: string[],
    dateConditions: ReturnType<typeof sql>[],
  ): Promise<FrequencyBucket[]> {
    const where = sql.join(
      [
        sql`s.enumerator_id = ANY(${enumeratorIds})`,
        ...dateConditions,
      ],
      sql` AND `,
    );

    const rows = await db.execute(sql`
      SELECT
        EXTRACT(HOUR FROM s.submitted_at AT TIME ZONE 'Africa/Lagos') AS hour,
        COUNT(*) AS count
      FROM submissions s
      WHERE ${where}
      GROUP BY hour
      ORDER BY hour
    `);

    interface HourRow {
      hour: string | number;
      count: string | number;
    }

    const typedHourRows = rows.rows as HourRow[];
    const total = typedHourRows.reduce((sum, r) => sum + Number(r.count), 0);

    return Array.from({ length: 24 }, (_, i) => {
      const row = typedHourRows.find((r) => Number(r.hour) === i);
      const count = row ? Number(row.count) : 0;
      return {
        label: `${String(i).padStart(2, '0')}:00`,
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      };
    });
  }

  private static async getDailyTrend(
    enumeratorIds: string[],
    dateConditions: ReturnType<typeof sql>[],
  ): Promise<TrendDataPoint[]> {
    const where = sql.join(
      [
        sql`s.enumerator_id = ANY(${enumeratorIds})`,
        ...dateConditions,
      ],
      sql` AND `,
    );

    const rows = await db.execute(sql`
      SELECT
        TO_CHAR(s.submitted_at AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD') AS date,
        COUNT(*) AS count
      FROM submissions s
      WHERE ${where}
      GROUP BY date
      ORDER BY date
    `);

    return (rows.rows as Array<{ date: string; count: string }>).map((r) => ({
      date: String(r.date),
      count: Number(r.count),
    }));
  }

  private static mergeMetrics(
    enumeratorMetrics: Array<{
      enumerator_id: string;
      name: string;
      submission_count: string;
      avg_completion_time: string | null;
      gps_rate: string | null;
      nin_rate: string | null;
    }>,
    fraudMetrics: Array<{ enumerator_id: string; fraud_rate: string | null }>,
    skipMetrics: Array<{ enumerator_id: string; skip_rate: string | null }>,
  ): EnumeratorQualityMetric[] {
    const fraudMap = new Map(fraudMetrics.map((r) => [r.enumerator_id, r.fraud_rate]));
    const skipMap = new Map(skipMetrics.map((r) => [r.enumerator_id, r.skip_rate]));

    return enumeratorMetrics.map((row) => {
      const submissionCount = Number(row.submission_count);
      const suppressed = submissionCount < SUPPRESSION_MIN_N;

      return {
        enumeratorId: row.enumerator_id,
        name: row.name,
        submissionCount,
        avgCompletionTimeSec: suppressed ? null : row.avg_completion_time != null ? Number(row.avg_completion_time) : null,
        gpsRate: suppressed ? null : row.gps_rate != null ? Number(row.gps_rate) : null,
        ninRate: suppressed ? null : row.nin_rate != null ? Number(row.nin_rate) : null,
        skipRate: suppressed ? null : skipMap.has(row.enumerator_id) ? Number(skipMap.get(row.enumerator_id)) : null,
        fraudFlagRate: suppressed ? null : fraudMap.has(row.enumerator_id) ? Number(fraudMap.get(row.enumerator_id)) : null,
        status: 'active' as const,
      };
    });
  }

  private static computeTeamAverages(
    enumerators: EnumeratorQualityMetric[],
  ): TeamQualityData['teamAverages'] {
    // Only use non-suppressed enumerators for averages
    const unsuppressed = enumerators.filter((e) => e.submissionCount >= SUPPRESSION_MIN_N);

    if (unsuppressed.length === 0) {
      return {
        avgCompletionTime: null,
        gpsRate: null,
        ninRate: null,
        skipRate: null,
        fraudRate: null,
      };
    }

    const avg = (values: (number | null)[]): number | null => {
      const valid = values.filter((v): v is number => v !== null);
      if (valid.length === 0) return null;
      return valid.reduce((sum, v) => sum + v, 0) / valid.length;
    };

    return {
      avgCompletionTime: avg(unsuppressed.map((e) => e.avgCompletionTimeSec)),
      gpsRate: avg(unsuppressed.map((e) => e.gpsRate)),
      ninRate: avg(unsuppressed.map((e) => e.ninRate)),
      skipRate: avg(unsuppressed.map((e) => e.skipRate)),
      fraudRate: avg(unsuppressed.map((e) => e.fraudFlagRate)),
    };
  }

  private static emptyResult(): TeamQualityData {
    return {
      enumerators: [],
      teamAverages: {
        avgCompletionTime: null,
        gpsRate: null,
        ninRate: null,
        skipRate: null,
        fraudRate: null,
      },
      submissionsByDay: [],
      dayOfWeekPattern: [],
      hourOfDayPattern: [],
    };
  }
}

/**
 * Personal Stats Service
 *
 * Story 8.3: Field Team Analytics — Enumerator/Clerk personal view
 * Personal submission analytics with team comparison and quality scorecard.
 */

import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type {
  PersonalStatsData,
  TrendDataPoint,
  FrequencyBucket,
  SkillsFrequency,
  DataQualityScorecard,
} from '@oslsr/types';
import { TeamAssignmentService } from './team-assignment.service.js';
import { toBuckets } from '../utils/analytics-suppression.js';

/** Optional fields for skip rate calculation */
const OPTIONAL_FIELDS = [
  'training_interest',
  'skills_other',
  'monthly_income',
  'apprentice_count',
  'bio_short',
  'portfolio_url',
  'consent_enriched',
] as const;

export interface PersonalStatsParams {
  dateFrom?: string;
  dateTo?: string;
}

export class PersonalStatsService {
  /**
   * Get personal stats for an enumerator or clerk.
   * isClerk flag adjusts the composite quality score weights.
   */
  static async getPersonalStats(
    userId: string,
    params: PersonalStatsParams = {},
    isClerk = false,
  ): Promise<PersonalStatsData> {
    const dateConditions = PersonalStatsService.buildDateConditions(params);

    const [
      basicMetrics,
      dailyTrend,
      fraudMetrics,
      teamFraudRate,
      skipRate,
      teamCompletion,
      diversity,
      topSkills,
    ] = await Promise.all([
      PersonalStatsService.getBasicMetrics(userId, dateConditions),
      PersonalStatsService.getDailyTrend(userId, dateConditions),
      PersonalStatsService.getFraudRate(userId, dateConditions),
      PersonalStatsService.getTeamFraudRate(userId, dateConditions),
      PersonalStatsService.getSkipRate(userId, dateConditions),
      PersonalStatsService.getTeamAvgCompletionTime(userId, dateConditions),
      PersonalStatsService.getRespondentDiversity(userId, dateConditions),
      PersonalStatsService.getTopSkills(userId, dateConditions),
    ]);

    const gpsRate = basicMetrics.gpsRate;
    const ninRate = basicMetrics.ninRate;
    const avgCompletionTimeSec = basicMetrics.avgCompletionTime;
    const fraudFlagRate = fraudMetrics;
    const teamAvgFraudRate = teamFraudRate;
    const teamAvgCompletionTimeSec = teamCompletion;

    // Compute composite quality score
    const scorecard = PersonalStatsService.computeScorecard(
      { gpsRate, ninRate, avgCompletionTimeSec, skipRate, fraudFlagRate, teamAvgCompletionTimeSec },
      diversity,
      isClerk,
    );

    return {
      dailyTrend,
      cumulativeCount: basicMetrics.cumulativeCount,
      avgCompletionTimeSec,
      teamAvgCompletionTimeSec,
      gpsRate,
      ninRate,
      skipRate,
      fraudFlagRate,
      teamAvgFraudRate,
      respondentDiversity: diversity,
      topSkillsCollected: topSkills,
      compositeQualityScore: scorecard.compositeScore,
    };
  }

  /**
   * Get the full scorecard breakdown (for the DataQualityScorecard component).
   */
  static computeScorecard(
    metrics: {
      gpsRate: number | null;
      ninRate: number | null;
      avgCompletionTimeSec: number | null;
      skipRate: number | null;
      fraudFlagRate: number | null;
      teamAvgCompletionTimeSec: number | null;
    },
    diversity: { genderSplit: FrequencyBucket[]; ageSpread: FrequencyBucket[] },
    isClerk = false,
  ): DataQualityScorecard {
    const gpsScore = metrics.gpsRate != null ? metrics.gpsRate * 100 : null;
    const ninScore = metrics.ninRate != null ? metrics.ninRate * 100 : null;

    // Completion time score: 100 if within ±1 SD of team avg, scaled down for outliers
    let completionTimeScore: number | null = null;
    if (metrics.avgCompletionTimeSec != null && metrics.teamAvgCompletionTimeSec != null) {
      const ratio = metrics.avgCompletionTimeSec / metrics.teamAvgCompletionTimeSec;
      // Within ±50% of team avg = 100, scaled linearly outside
      if (ratio >= 0.5 && ratio <= 1.5) {
        completionTimeScore = 100;
      } else {
        completionTimeScore = Math.max(0, 100 - Math.abs(ratio - 1) * 100);
      }
    }

    const skipScore = metrics.skipRate != null ? (1 - metrics.skipRate) * 100 : null;
    const rejectionScore = metrics.fraudFlagRate != null ? (1 - metrics.fraudFlagRate) * 100 : null;

    // Diversity score: Shannon diversity index normalized to 0-100
    const diversityScore = PersonalStatsService.computeDiversityScore(diversity);

    // Weighted composite
    let compositeScore: number | null = null;
    if (isClerk) {
      // Clerk: exclude GPS, redistribute weight
      const scores = [
        { score: ninScore, weight: 0.25 },
        { score: completionTimeScore, weight: 0.20 },
        { score: skipScore, weight: 0.20 },
        { score: rejectionScore, weight: 0.25 },
        { score: diversityScore, weight: 0.10 },
      ];
      compositeScore = PersonalStatsService.weightedAvg(scores);
    } else {
      const scores = [
        { score: gpsScore, weight: 0.20 },
        { score: ninScore, weight: 0.20 },
        { score: completionTimeScore, weight: 0.15 },
        { score: skipScore, weight: 0.15 },
        { score: rejectionScore, weight: 0.20 },
        { score: diversityScore, weight: 0.10 },
      ];
      compositeScore = PersonalStatsService.weightedAvg(scores);
    }

    return {
      gpsScore: isClerk ? null : gpsScore,
      ninScore,
      completionTimeScore,
      skipScore,
      rejectionScore,
      diversityScore,
      compositeScore,
    };
  }

  private static weightedAvg(
    scores: Array<{ score: number | null; weight: number }>,
  ): number | null {
    let totalWeight = 0;
    let totalScore = 0;
    for (const { score, weight } of scores) {
      if (score !== null) {
        totalWeight += weight;
        totalScore += score * weight;
      }
    }
    if (totalWeight === 0) return null;
    return Math.round((totalScore / totalWeight) * 10) / 10;
  }

  private static computeDiversityScore(
    diversity: { genderSplit: FrequencyBucket[]; ageSpread: FrequencyBucket[] },
  ): number | null {
    // Shannon diversity on gender + age combined
    const allBuckets = [...diversity.genderSplit, ...diversity.ageSpread];
    const total = allBuckets.reduce((sum, b) => sum + (b.count ?? 0), 0);
    if (total === 0) return null;

    let shannonH = 0;
    for (const bucket of allBuckets) {
      const p = (bucket.count ?? 0) / total;
      if (p > 0) {
        shannonH -= p * Math.log(p);
      }
    }

    // Normalize: max entropy = ln(number of categories)
    const maxH = Math.log(allBuckets.length);
    if (maxH === 0) return null;

    return Math.round((shannonH / maxH) * 100 * 10) / 10;
  }

  private static buildDateConditions(params: PersonalStatsParams) {
    const conditions: ReturnType<typeof sql>[] = [];
    if (params.dateFrom) {
      conditions.push(sql`s.submitted_at >= ${params.dateFrom}::timestamptz`);
    }
    if (params.dateTo) {
      conditions.push(sql`s.submitted_at <= ${params.dateTo}::timestamptz`);
    }
    return conditions;
  }

  private static async getBasicMetrics(
    userId: string,
    dateConditions: ReturnType<typeof sql>[],
  ) {
    const where = sql.join(
      [sql`s.submitter_id = ${userId}`, ...dateConditions],
      sql` AND `,
    );

    const rows = await db.execute(sql`
      SELECT
        COUNT(*) AS cumulative_count,
        AVG(s.completion_time_seconds) AS avg_completion_time,
        COUNT(*) FILTER (WHERE s.gps_latitude IS NOT NULL)::float / NULLIF(COUNT(*), 0) AS gps_rate,
        COUNT(*) FILTER (
          WHERE s.raw_data->>'nin' IS NOT NULL
            AND length(s.raw_data->>'nin') = 11
        )::float / NULLIF(COUNT(*), 0) AS nin_rate
      FROM submissions s
      WHERE ${where}
    `);

    const row = rows.rows[0] as any;
    return {
      cumulativeCount: Number(row?.cumulative_count ?? 0),
      avgCompletionTime: row?.avg_completion_time != null ? Number(row.avg_completion_time) : null,
      gpsRate: row?.gps_rate != null ? Number(row.gps_rate) : null,
      ninRate: row?.nin_rate != null ? Number(row.nin_rate) : null,
    };
  }

  private static async getDailyTrend(
    userId: string,
    dateConditions: ReturnType<typeof sql>[],
  ): Promise<TrendDataPoint[]> {
    const defaultDateCond = dateConditions.length > 0
      ? dateConditions
      : [sql`s.submitted_at >= NOW() - INTERVAL '30 days'`];

    const where = sql.join(
      [sql`s.submitter_id = ${userId}`, ...defaultDateCond],
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

  private static async getFraudRate(
    userId: string,
    dateConditions: ReturnType<typeof sql>[],
  ): Promise<number | null> {
    const dateConds = dateConditions.length > 0
      ? sql` AND ${sql.join(dateConditions, sql` AND `)}`
      : sql``;

    const rows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE fd.severity IN ('medium', 'high', 'critical'))::float
          / NULLIF(COUNT(*), 0) AS fraud_rate
      FROM fraud_detections fd
      JOIN submissions s ON fd.submission_id = s.id
      WHERE fd.enumerator_id = ${userId}::uuid${dateConds}
    `);

    const row = rows.rows[0] as any;
    return row?.fraud_rate != null ? Number(row.fraud_rate) : null;
  }

  private static async getTeamFraudRate(
    userId: string,
    dateConditions: ReturnType<typeof sql>[],
  ): Promise<number | null> {
    // Find team members through supervisor assignment
    const teamIds = await PersonalStatsService.getTeamMemberIds(userId);
    if (teamIds.length === 0) return null;

    const dateConds = dateConditions.length > 0
      ? sql` AND ${sql.join(dateConditions, sql` AND `)}`
      : sql``;

    const rows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE fd.severity IN ('medium', 'high', 'critical'))::float
          / NULLIF(COUNT(*), 0) AS fraud_rate
      FROM fraud_detections fd
      JOIN submissions s ON fd.submission_id = s.id
      WHERE fd.enumerator_id::text = ANY(${teamIds})${dateConds}
    `);

    const row = rows.rows[0] as any;
    return row?.fraud_rate != null ? Number(row.fraud_rate) : null;
  }

  private static async getTeamAvgCompletionTime(
    userId: string,
    dateConditions: ReturnType<typeof sql>[],
  ): Promise<number | null> {
    // Try team via supervisor assignment first
    const teamIds = await PersonalStatsService.getTeamMemberIds(userId);

    if (teamIds.length > 0) {
      const where = sql.join(
        [sql`s.submitter_id = ANY(${teamIds})`, ...dateConditions],
        sql` AND `,
      );

      const rows = await db.execute(sql`
        SELECT AVG(s.completion_time_seconds) AS avg_time
        FROM submissions s
        WHERE ${where}
      `);

      const row = rows.rows[0] as any;
      if (row?.avg_time != null) return Number(row.avg_time);
    }

    // Fallback: LGA-wide average
    const lgaRows = await db.execute(sql`
      SELECT u.lga_id
      FROM users u
      WHERE u.id = ${userId}::uuid
    `);
    const lgaId = (lgaRows.rows[0] as any)?.lga_id;
    if (!lgaId) return null;

    const where = sql.join(
      [
        sql`r.lga_id = ${lgaId}`,
        ...dateConditions,
      ],
      sql` AND `,
    );

    const rows = await db.execute(sql`
      SELECT AVG(s.completion_time_seconds) AS avg_time
      FROM submissions s
      LEFT JOIN respondents r ON r.id = s.respondent_id
      WHERE ${where}
    `);

    const row = rows.rows[0] as any;
    return row?.avg_time != null ? Number(row.avg_time) : null;
  }

  private static async getSkipRate(
    userId: string,
    dateConditions: ReturnType<typeof sql>[],
  ): Promise<number | null> {
    const where = sql.join(
      [sql`s.submitter_id = ${userId}`, sql`s.raw_data IS NOT NULL`, ...dateConditions],
      sql` AND `,
    );

    const fieldChecks = OPTIONAL_FIELDS.map(
      (f) => sql`CASE WHEN s.raw_data->>${f} IS NULL THEN 1 ELSE 0 END`,
    );
    const nullSum = sql.join(fieldChecks, sql` + `);
    const totalFields = OPTIONAL_FIELDS.length;

    const rows = await db.execute(sql`
      SELECT AVG((${nullSum})::float / ${totalFields}) AS skip_rate
      FROM submissions s
      WHERE ${where}
    `);

    const row = rows.rows[0] as any;
    return row?.skip_rate != null ? Number(row.skip_rate) : null;
  }

  private static async getRespondentDiversity(
    userId: string,
    dateConditions: ReturnType<typeof sql>[],
  ): Promise<{ genderSplit: FrequencyBucket[]; ageSpread: FrequencyBucket[] }> {
    const where = sql.join(
      [sql`s.submitter_id = ${userId}`, ...dateConditions],
      sql` AND `,
    );

    const [genderRows, ageRows] = await Promise.all([
      db.execute(sql`
        SELECT s.raw_data->>'gender' AS label, COUNT(*) AS count
        FROM submissions s
        WHERE ${where} AND s.raw_data->>'gender' IS NOT NULL
        GROUP BY label ORDER BY count DESC
      `),
      db.execute(sql`
        SELECT
          CASE
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 15 AND 24 THEN '15-24'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 25 AND 34 THEN '25-34'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 35 AND 44 THEN '35-44'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) BETWEEN 45 AND 54 THEN '45-54'
            WHEN EXTRACT(YEAR FROM AGE(NOW(), (s.raw_data->>'dob')::date)) >= 55 THEN '55+'
            ELSE 'unknown'
          END AS label,
          COUNT(*) AS count
        FROM submissions s
        WHERE ${where} AND s.raw_data->>'dob' IS NOT NULL
        GROUP BY label ORDER BY label
      `),
    ]);

    const genderTotal = (genderRows.rows as any[]).reduce((s, r) => s + Number(r.count), 0);
    const ageTotal = (ageRows.rows as any[]).reduce((s, r) => s + Number(r.count), 0);

    return {
      genderSplit: toBuckets(genderRows.rows as any, genderTotal),
      ageSpread: toBuckets(ageRows.rows as any, ageTotal),
    };
  }

  private static async getTopSkills(
    userId: string,
    dateConditions: ReturnType<typeof sql>[],
  ): Promise<SkillsFrequency[]> {
    const where = sql.join(
      [
        sql`s.submitter_id = ${userId}`,
        sql`s.raw_data->>'skills_possessed' IS NOT NULL`,
        sql`s.raw_data->>'skills_possessed' != ''`,
        ...dateConditions,
      ],
      sql` AND `,
    );

    const totalResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM submissions s
      WHERE ${where}
    `);
    const total = Number((totalResult.rows[0] as any)?.total ?? 0);

    const rows = await db.execute(sql`
      SELECT skill, COUNT(*) AS count
      FROM submissions s,
           unnest(string_to_array(s.raw_data->>'skills_possessed', ' ')) AS skill
      WHERE ${where}
      GROUP BY skill
      ORDER BY count DESC
      LIMIT 10
    `);

    return (rows.rows as Array<{ skill: string; count: string }>).map((r) => ({
      skill: String(r.skill),
      count: Number(r.count),
      percentage: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
    }));
  }

  /**
   * Find team member IDs via supervisor assignment.
   * Fallback chain: supervisor assignment → LGA-wide → empty.
   */
  private static async getTeamMemberIds(userId: string): Promise<string[]> {
    // Find supervisor for this user via team_assignments
    const supervisorRows = await db.execute(sql`
      SELECT ta.supervisor_id
      FROM team_assignments ta
      WHERE ta.enumerator_id = ${userId}
        AND ta.unassigned_at IS NULL
      LIMIT 1
    `);

    const supervisorId = (supervisorRows.rows[0] as any)?.supervisor_id;
    if (supervisorId) {
      return TeamAssignmentService.getEnumeratorIdsForSupervisor(supervisorId);
    }

    // Fallback: LGA-scoped enumerators
    const lgaRows = await db.execute(sql`
      SELECT u.lga_id FROM users u WHERE u.id = ${userId}::uuid
    `);
    const lgaId = (lgaRows.rows[0] as any)?.lga_id;
    if (!lgaId) return [];

    const rows = await db.execute(sql`
      SELECT u.id::text AS id
      FROM users u
      WHERE u.lga_id = ${lgaId}
        AND u.role IN ('enumerator', 'data_entry_clerk')
        AND u.status IN ('active', 'verified')
    `);

    return (rows.rows as Array<{ id: string }>).map((r) => r.id);
  }
}

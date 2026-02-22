/**
 * Report Service
 *
 * Aggregation queries for the Government Official Policy Dashboard.
 * Story 5.1: High-Level Policy Dashboard
 *
 * All queries return state-wide aggregated data (no PII).
 * Authorized for: government_official, super_admin
 */

import { db } from '../db/index.js';
import { respondents } from '../db/schema/respondents.js';
import { sql, gte } from 'drizzle-orm';
import type { OverviewStats, SkillDistribution, LgaBreakdown, DailyTrend } from '@oslsr/types';

export type { OverviewStats, SkillDistribution, LgaBreakdown, DailyTrend };

export class ReportService {
  /**
   * Get overview statistics: total respondents, today's count,
   * LGAs with data, and source channel breakdown.
   */
  static async getOverviewStats(): Promise<OverviewStats> {
    // Use WAT (UTC+1) boundary so "today" aligns with Nigeria local time
    const WAT_OFFSET_MS = 1 * 60 * 60 * 1000;
    const now = new Date();
    const watNow = new Date(now.getTime() + WAT_OFFSET_MS);
    const todayStart = new Date(Date.UTC(watNow.getUTCFullYear(), watNow.getUTCMonth(), watNow.getUTCDate()));
    todayStart.setTime(todayStart.getTime() - WAT_OFFSET_MS);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    const rows = await db
      .select({
        totalRespondents: sql<number>`COUNT(*)`,
        todayRegistrations: sql<number>`COUNT(*) FILTER (WHERE ${respondents.createdAt} >= ${todayStart})`,
        yesterdayRegistrations: sql<number>`COUNT(*) FILTER (WHERE ${respondents.createdAt} >= ${yesterdayStart} AND ${respondents.createdAt} < ${todayStart})`,
        lgasCovered: sql<number>`COUNT(DISTINCT ${respondents.lgaId}) FILTER (WHERE ${respondents.lgaId} IS NOT NULL)`,
        enumeratorCount: sql<number>`COUNT(*) FILTER (WHERE ${respondents.source} = 'enumerator')`,
        publicCount: sql<number>`COUNT(*) FILTER (WHERE ${respondents.source} = 'public')`,
        clerkCount: sql<number>`COUNT(*) FILTER (WHERE ${respondents.source} = 'clerk')`,
      })
      .from(respondents);

    const row = rows[0];

    return {
      totalRespondents: Number(row?.totalRespondents ?? 0),
      todayRegistrations: Number(row?.todayRegistrations ?? 0),
      yesterdayRegistrations: Number(row?.yesterdayRegistrations ?? 0),
      lgasCovered: Number(row?.lgasCovered ?? 0),
      sourceBreakdown: {
        enumerator: Number(row?.enumeratorCount ?? 0),
        public: Number(row?.publicCount ?? 0),
        clerk: Number(row?.clerkCount ?? 0),
      },
    };
  }

  /**
   * Get skills/occupation distribution from submission rawData JSONB.
   * Extracts the occupation/skill field from form responses and groups by value.
   */
  static async getSkillsDistribution(): Promise<SkillDistribution[]> {
    // Extract skill/occupation from rawData JSONB.
    // TODO(5.1-review): The COALESCE chain uses generic key names ('occupation', 'primary_skill', etc.)
    // that match the performance seed data but may NOT match actual ODK form submissions.
    // The oslsr_master_v3 questionnaire uses question IDs (e.g. Section 5 skills questions)
    // that could differ. Before production launch, inspect the active form_schema in
    // questionnaire_forms to identify the correct rawData key for occupation/skill extraction.
    // Fallback approach: query questionnaire_forms.form_schema dynamically.
    const rows = await db.execute(sql`
      SELECT
        COALESCE(
          raw_data->>'occupation',
          raw_data->>'primary_skill',
          raw_data->>'skill',
          raw_data->>'primary_occupation',
          'Unknown'
        ) AS skill,
        COUNT(*) AS count
      FROM submissions
      WHERE raw_data IS NOT NULL
        AND respondent_id IS NOT NULL
      GROUP BY skill
      ORDER BY count DESC
      LIMIT 20
    `);

    return (rows.rows as Array<{ skill: string; count: string | number }>).map((r) => ({
      skill: String(r.skill || 'Unknown'),
      count: Number(r.count),
    }));
  }

  /**
   * Get respondent count per LGA, joined with LGA names.
   * Returns all 33 Oyo State LGAs (some may have count 0).
   */
  static async getLgaBreakdown(): Promise<LgaBreakdown[]> {
    const rows = await db.execute(sql`
      SELECT
        l.code AS "lgaCode",
        l.name AS "lgaName",
        COUNT(r.id) AS count
      FROM lgas l
      LEFT JOIN respondents r ON r.lga_id = l.code
      GROUP BY l.code, l.name
      ORDER BY count DESC, l.name ASC
    `);

    return (rows.rows as Array<{ lgaCode: string; lgaName: string; count: string | number }>).map((r) => ({
      lgaCode: String(r.lgaCode),
      lgaName: String(r.lgaName),
      count: Number(r.count),
    }));
  }

  /**
   * Get daily registration trends for the specified number of days.
   * Uses respondents.createdAt for registration dates.
   */
  static async getRegistrationTrends(days: 7 | 30 = 7): Promise<DailyTrend[]> {
    // Use WAT timezone for date grouping
    const WAT_OFFSET_MS = 1 * 60 * 60 * 1000;
    const now = new Date();
    const watNow = new Date(now.getTime() + WAT_OFFSET_MS);
    const startDate = new Date(Date.UTC(watNow.getUTCFullYear(), watNow.getUTCMonth(), watNow.getUTCDate()));
    startDate.setUTCDate(startDate.getUTCDate() - days);
    startDate.setTime(startDate.getTime() - WAT_OFFSET_MS);

    const rows = await db
      .select({
        date: sql<string>`TO_CHAR(${respondents.createdAt} AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD')`,
        count: sql<number>`COUNT(*)`,
      })
      .from(respondents)
      .where(gte(respondents.createdAt, startDate))
      .groupBy(sql`TO_CHAR(${respondents.createdAt} AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${respondents.createdAt} AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD')`);

    return rows.map((r) => ({
      date: String(r.date),
      count: Number(r.count),
    }));
  }
}

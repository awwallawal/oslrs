/**
 * Verification Analytics Service
 *
 * Story 8.4: Assessor Verification Analytics & Quality Dashboard
 * Aggregates from fraud_detections, submissions, respondents, and users tables.
 *
 * All methods support optional filters: lgaId, severity[], dateFrom, dateTo.
 * numeric(5,2) columns return strings from Drizzle — parseFloat before returning.
 */

import { db } from '../db/index.js';
import { sql, type SQL } from 'drizzle-orm';
import type {
  VerificationFunnel,
  FraudTypeBreakdown,
  ReviewThroughput,
  TopFlaggedEnumerator,
  BacklogTrend,
  RejectionReasonFrequency,
  VerificationPipelineData,
  VerificationPipelineQueryParams,
} from '@oslsr/types';

const SUPPRESSION_MIN = 5;
const DEFAULT_DAYS = 30;

function buildFilterFragments(params: VerificationPipelineQueryParams = {}): SQL[] {
  const conditions: SQL[] = [];

  if (params.lgaId) {
    conditions.push(sql`r.lga_id = ${params.lgaId}`);
  }
  if (params.severity && params.severity.length > 0) {
    const severityParams = params.severity.map(s => sql`${s}`);
    conditions.push(sql`fd.severity IN (${sql.join(severityParams, sql`, `)})`);
  }
  if (params.dateFrom) {
    conditions.push(sql`fd.computed_at >= ${params.dateFrom}::timestamptz`);
  }
  if (params.dateTo) {
    conditions.push(sql`fd.computed_at <= ${params.dateTo}::timestamptz`);
  }

  return conditions;
}

function whereClause(conditions: SQL[]): SQL {
  if (conditions.length === 0) return sql`TRUE`;
  return sql.join(conditions, sql` AND `);
}

export class VerificationAnalyticsService {
  static async getVerificationFunnel(params?: VerificationPipelineQueryParams): Promise<VerificationFunnel> {
    const filters = buildFilterFragments(params);
    const needsJoin = params?.lgaId;

    const joinClause = needsJoin
      ? sql`FROM fraud_detections fd INNER JOIN submissions s ON fd.submission_id = s.id LEFT JOIN respondents r ON s.respondent_id = r.id`
      : sql`FROM fraud_detections fd INNER JOIN submissions s ON fd.submission_id = s.id`;

    // Total processed submissions
    const submissionFilters: SQL[] = [];
    if (params?.lgaId) submissionFilters.push(sql`r.lga_id = ${params.lgaId}`);
    if (params?.dateFrom) submissionFilters.push(sql`s.submitted_at >= ${params.dateFrom}::timestamptz`);
    if (params?.dateTo) submissionFilters.push(sql`s.submitted_at <= ${params.dateTo}::timestamptz`);

    const subJoin = params?.lgaId
      ? sql`FROM submissions s LEFT JOIN respondents r ON s.respondent_id = r.id`
      : sql`FROM submissions s`;

    const totalSubResult = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::int AS count ${subJoin}
      WHERE s.processed = true ${submissionFilters.length > 0 ? sql`AND ${sql.join(submissionFilters, sql` AND `)}` : sql``}
    `);
    const totalSub = totalSubResult.rows[0];

    const funnelResult = await db.execute<{
      flagged: string;
      reviewed: string;
      approved: string;
      rejected: string;
    }>(sql`
      SELECT
        COUNT(*)::int AS flagged,
        COUNT(*) FILTER (WHERE fd.resolution IS NOT NULL)::int AS reviewed,
        COUNT(*) FILTER (WHERE fd.assessor_resolution = 'final_approved')::int AS approved,
        COUNT(*) FILTER (WHERE fd.assessor_resolution = 'final_rejected')::int AS rejected
      ${joinClause}
      WHERE TRUE ${filters.length > 0 ? sql`AND ${whereClause(filters)}` : sql``}
    `);
    const funnelRow = funnelResult.rows[0];

    return {
      totalSubmissions: Number(totalSub?.count ?? 0),
      totalFlagged: Number(funnelRow?.flagged ?? 0),
      totalReviewed: Number(funnelRow?.reviewed ?? 0),
      totalApproved: Number(funnelRow?.approved ?? 0),
      totalRejected: Number(funnelRow?.rejected ?? 0),
    };
  }

  static async getFraudTypeBreakdown(params?: VerificationPipelineQueryParams): Promise<FraudTypeBreakdown> {
    const filters = buildFilterFragments(params);
    const needsJoin = params?.lgaId;

    const joinClause = needsJoin
      ? sql`FROM fraud_detections fd INNER JOIN submissions s ON fd.submission_id = s.id LEFT JOIN respondents r ON s.respondent_id = r.id`
      : sql`FROM fraud_detections fd`;

    // Only count non-clean detections
    const allFilters = [...filters, sql`fd.severity != 'clean'`];

    const fraudResult = await db.execute<{
      gps_cluster: string;
      speed_run: string;
      straight_lining: string;
      duplicate_response: string;
      off_hours: string;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE CAST(fd.gps_score AS numeric) > 0)::int AS gps_cluster,
        COUNT(*) FILTER (WHERE CAST(fd.speed_score AS numeric) > 0)::int AS speed_run,
        COUNT(*) FILTER (WHERE CAST(fd.straightline_score AS numeric) > 0)::int AS straight_lining,
        COUNT(*) FILTER (WHERE CAST(fd.duplicate_score AS numeric) > 0)::int AS duplicate_response,
        COUNT(*) FILTER (WHERE CAST(fd.timing_score AS numeric) > 0)::int AS off_hours
      ${joinClause}
      WHERE ${whereClause(allFilters)}
    `);
    const row = fraudResult.rows[0];

    return {
      gpsCluster: Number(row?.gps_cluster ?? 0),
      speedRun: Number(row?.speed_run ?? 0),
      straightLining: Number(row?.straight_lining ?? 0),
      duplicateResponse: Number(row?.duplicate_response ?? 0),
      offHours: Number(row?.off_hours ?? 0),
    };
  }

  static async getReviewThroughput(params?: VerificationPipelineQueryParams, days = DEFAULT_DAYS): Promise<ReviewThroughput[]> {
    const filters = buildFilterFragments(params);
    const needsJoin = params?.lgaId;

    const joinClause = needsJoin
      ? sql`FROM fraud_detections fd INNER JOIN submissions s ON fd.submission_id = s.id LEFT JOIN respondents r ON s.respondent_id = r.id`
      : sql`FROM fraud_detections fd`;

    const allFilters = [...filters, sql`fd.assessor_reviewed_at IS NOT NULL`];

    // If no date range specified, default to last N days
    if (!params?.dateFrom && !params?.dateTo) {
      allFilters.push(sql`fd.assessor_reviewed_at >= NOW() - ${days}::int * INTERVAL '1 day'`);
    }

    const throughputResult = await db.execute<{
      date: string;
      reviewed_count: string;
      approved_count: string;
      rejected_count: string;
    }>(sql`
      SELECT
        (fd.assessor_reviewed_at AT TIME ZONE 'Africa/Lagos')::date::text AS date,
        COUNT(*)::int AS reviewed_count,
        COUNT(*) FILTER (WHERE fd.assessor_resolution = 'final_approved')::int AS approved_count,
        COUNT(*) FILTER (WHERE fd.assessor_resolution = 'final_rejected')::int AS rejected_count
      ${joinClause}
      WHERE ${whereClause(allFilters)}
      GROUP BY (fd.assessor_reviewed_at AT TIME ZONE 'Africa/Lagos')::date
      ORDER BY date
    `);

    return (throughputResult.rows as Array<{ date: string; reviewed_count: string; approved_count: string; rejected_count: string }>).map(r => ({
      date: r.date,
      reviewedCount: Number(r.reviewed_count),
      approvedCount: Number(r.approved_count),
      rejectedCount: Number(r.rejected_count),
    }));
  }

  static async getTopFlaggedEnumerators(params?: VerificationPipelineQueryParams, limit = 10): Promise<TopFlaggedEnumerator[]> {
    const filters = buildFilterFragments(params);
    const needsJoin = params?.lgaId;

    const joinClause = needsJoin
      ? sql`FROM fraud_detections fd
        INNER JOIN submissions s ON fd.submission_id = s.id
        LEFT JOIN respondents r ON s.respondent_id = r.id
        INNER JOIN users u ON fd.enumerator_id = u.id`
      : sql`FROM fraud_detections fd INNER JOIN users u ON fd.enumerator_id = u.id`;

    const allFilters = [...filters, sql`fd.severity != 'clean'`];

    type EnumeratorRow = {
      enumerator_id: string;
      name: string;
      flag_count: string;
      critical_count: string;
      high_count: string;
      total_assessed: string;
      approved_count: string;
    };
    const enumResult = await db.execute<EnumeratorRow>(sql`
      SELECT
        fd.enumerator_id,
        u.full_name AS name,
        COUNT(*)::int AS flag_count,
        COUNT(*) FILTER (WHERE fd.severity = 'critical')::int AS critical_count,
        COUNT(*) FILTER (WHERE fd.severity = 'high')::int AS high_count,
        COUNT(*) FILTER (WHERE fd.assessor_resolution IS NOT NULL)::int AS total_assessed,
        COUNT(*) FILTER (WHERE fd.assessor_resolution = 'final_approved')::int AS approved_count
      ${joinClause}
      WHERE ${whereClause(allFilters)}
      GROUP BY fd.enumerator_id, u.full_name
      HAVING COUNT(*) >= ${SUPPRESSION_MIN}
      ORDER BY flag_count DESC
      LIMIT ${limit}
    `);

    return (enumResult.rows as EnumeratorRow[]).map(r => ({
      enumeratorId: r.enumerator_id,
      name: r.name,
      flagCount: Number(r.flag_count),
      criticalCount: Number(r.critical_count),
      highCount: Number(r.high_count),
      approvalRate: Number(r.total_assessed) > 0
        ? Number(r.approved_count) / Number(r.total_assessed)
        : 0,
    }));
  }

  static async getBacklogTrend(params?: VerificationPipelineQueryParams, days = DEFAULT_DAYS): Promise<BacklogTrend[]> {
    const dateFrom = params?.dateFrom ?? null;
    const dateTo = params?.dateTo ?? null;

    // Build additional filter for lgaId if needed
    const lgaFilter = params?.lgaId
      ? sql`AND s.respondent_id IS NOT NULL AND r.lga_id = ${params.lgaId}`
      : sql``;

    const lgaJoin = params?.lgaId
      ? sql`INNER JOIN submissions s ON fd.submission_id = s.id LEFT JOIN respondents r ON s.respondent_id = r.id`
      : sql``;

    type BacklogRow = { day: string; pending_count: string; high_critical_count: string };
    const backlogResult = await db.execute<BacklogRow>(sql`
      WITH date_series AS (
        SELECT generate_series(
          COALESCE(${dateFrom}::date, (CURRENT_DATE - ${days}::int * INTERVAL '1 day')::date),
          COALESCE(${dateTo}::date, CURRENT_DATE),
          '1 day'::interval
        )::date AS day
      )
      SELECT
        ds.day::text,
        COUNT(*) FILTER (
          WHERE fd.computed_at::date <= ds.day
            AND (fd.assessor_reviewed_at IS NULL OR fd.assessor_reviewed_at::date > ds.day)
            AND (fd.resolution IS NOT NULL OR fd.severity IN ('high', 'critical'))
        )::int AS pending_count,
        COUNT(*) FILTER (
          WHERE fd.computed_at::date <= ds.day
            AND (fd.assessor_reviewed_at IS NULL OR fd.assessor_reviewed_at::date > ds.day)
            AND fd.severity IN ('high', 'critical')
        )::int AS high_critical_count
      FROM date_series ds
      CROSS JOIN fraud_detections fd ${lgaJoin}
      WHERE TRUE ${lgaFilter}
      GROUP BY ds.day
      ORDER BY ds.day
    `);

    return (backlogResult.rows as BacklogRow[]).map(r => ({
      date: r.day,
      pendingCount: Number(r.pending_count),
      highCriticalCount: Number(r.high_critical_count),
    }));
  }

  static async getRejectionReasons(params?: VerificationPipelineQueryParams): Promise<RejectionReasonFrequency[]> {
    const filters = buildFilterFragments(params);
    const needsJoin = params?.lgaId;

    const joinClause = needsJoin
      ? sql`FROM fraud_detections fd INNER JOIN submissions s ON fd.submission_id = s.id LEFT JOIN respondents r ON s.respondent_id = r.id`
      : sql`FROM fraud_detections fd`;

    const allFilters = [...filters, sql`fd.resolution IS NOT NULL`];

    type ReasonRow = { reason: string; count: string };
    const reasonResult = await db.execute<ReasonRow>(sql`
      SELECT
        fd.resolution AS reason,
        COUNT(*)::int AS count
      ${joinClause}
      WHERE ${whereClause(allFilters)}
      GROUP BY fd.resolution
      ORDER BY count DESC
    `);
    const reasonRows = reasonResult.rows as ReasonRow[];

    const total = reasonRows.reduce((sum, r) => sum + Number(r.count), 0);

    return reasonRows
      .filter(r => Number(r.count) >= SUPPRESSION_MIN)
      .map(r => ({
        reason: r.reason,
        count: Number(r.count),
        percentage: total > 0 ? Math.round((Number(r.count) / total) * 10000) / 100 : 0,
      }));
  }

  static async getAvgReviewTime(params?: VerificationPipelineQueryParams): Promise<number | null> {
    const filters = buildFilterFragments(params);
    const needsJoin = params?.lgaId;

    const joinClause = needsJoin
      ? sql`FROM fraud_detections fd INNER JOIN submissions s ON fd.submission_id = s.id LEFT JOIN respondents r ON s.respondent_id = r.id`
      : sql`FROM fraud_detections fd`;

    const allFilters = [...filters, sql`fd.assessor_reviewed_at IS NOT NULL`, sql`fd.reviewed_at IS NOT NULL`];

    const avgResult = await db.execute<{ avg_minutes: string | null }>(sql`
      SELECT AVG(EXTRACT(EPOCH FROM (fd.assessor_reviewed_at - fd.reviewed_at)) / 60)::numeric(10,1) AS avg_minutes
      ${joinClause}
      WHERE ${whereClause(allFilters)}
    `);
    const avgRow = avgResult.rows[0];

    return avgRow?.avg_minutes !== null ? parseFloat(String(avgRow.avg_minutes)) : null;
  }

  static async getTimeToResolution(params?: VerificationPipelineQueryParams): Promise<number | null> {
    const filters = buildFilterFragments(params);
    const needsJoin = params?.lgaId;

    const joinClause = needsJoin
      ? sql`FROM fraud_detections fd INNER JOIN submissions s ON fd.submission_id = s.id LEFT JOIN respondents r ON s.respondent_id = r.id`
      : sql`FROM fraud_detections fd INNER JOIN submissions s ON fd.submission_id = s.id`;

    const allFilters = [...filters, sql`fd.assessor_resolution IS NOT NULL`];

    const medianResult = await db.execute<{ median_days: string | null }>(sql`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (fd.assessor_reviewed_at - s.submitted_at)) / 86400
      )::numeric(10,1) AS median_days
      ${joinClause}
      WHERE ${whereClause(allFilters)}
    `);
    const medianRow = medianResult.rows[0];

    return medianRow?.median_days !== null ? parseFloat(String(medianRow.median_days)) : null;
  }

  static async getDataQualityScore(params?: VerificationPipelineQueryParams): Promise<{ completenessRate: number; consistencyRate: number }> {
    const subFilters: SQL[] = [];
    if (params?.lgaId) subFilters.push(sql`r.lga_id = ${params.lgaId}`);
    if (params?.dateFrom) subFilters.push(sql`s.submitted_at >= ${params.dateFrom}::timestamptz`);
    if (params?.dateTo) subFilters.push(sql`s.submitted_at <= ${params.dateTo}::timestamptz`);

    const subJoin = params?.lgaId
      ? sql`FROM submissions s LEFT JOIN respondents r ON s.respondent_id = r.id`
      : sql`FROM submissions s`;

    // Completeness: % of processed submissions with all required fields non-null
    const completenessResult = await db.execute<{ total: string; complete: string }>(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE s.respondent_id IS NOT NULL AND s.raw_data IS NOT NULL)::int AS complete
      ${subJoin}
      WHERE s.processed = true ${subFilters.length > 0 ? sql`AND ${sql.join(subFilters, sql` AND `)}` : sql``}
    `);
    const completeness = completenessResult.rows[0];

    // Consistency: % of fraud detections that are clean
    const fdFilters = buildFilterFragments(params);
    const fdJoin = params?.lgaId
      ? sql`FROM fraud_detections fd INNER JOIN submissions s ON fd.submission_id = s.id LEFT JOIN respondents r ON s.respondent_id = r.id`
      : sql`FROM fraud_detections fd`;

    const consistencyResult = await db.execute<{ total: string; clean: string }>(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE fd.severity = 'clean')::int AS clean
      ${fdJoin}
      WHERE TRUE ${fdFilters.length > 0 ? sql`AND ${whereClause(fdFilters)}` : sql``}
    `);
    const consistency = consistencyResult.rows[0];

    const totalSub = Number(completeness?.total ?? 0);
    const completeSub = Number(completeness?.complete ?? 0);
    const totalDet = Number(consistency?.total ?? 0);
    const cleanDet = Number(consistency?.clean ?? 0);

    return {
      completenessRate: totalSub > 0 ? Math.round((completeSub / totalSub) * 10000) / 100 : 0,
      consistencyRate: totalDet > 0 ? Math.round((cleanDet / totalDet) * 10000) / 100 : 0,
    };
  }

  static async getFullPipelineData(params?: VerificationPipelineQueryParams): Promise<VerificationPipelineData> {
    const [
      funnel,
      fraudTypeBreakdown,
      throughputTrend,
      topFlaggedEnumerators,
      backlogTrend,
      rejectionReasons,
      avgReviewTimeMinutes,
      medianTimeToResolutionDays,
      dataQualityScore,
    ] = await Promise.all([
      this.getVerificationFunnel(params),
      this.getFraudTypeBreakdown(params),
      this.getReviewThroughput(params),
      this.getTopFlaggedEnumerators(params),
      this.getBacklogTrend(params),
      this.getRejectionReasons(params),
      this.getAvgReviewTime(params),
      this.getTimeToResolution(params),
      this.getDataQualityScore(params),
    ]);

    return {
      funnel,
      fraudTypeBreakdown,
      throughputTrend,
      topFlaggedEnumerators,
      backlogTrend,
      rejectionReasons,
      avgReviewTimeMinutes,
      medianTimeToResolutionDays,
      dataQualityScore,
    };
  }
}

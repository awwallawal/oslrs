/**
 * Export Query Service — Respondent data queries for CSV/PDF exports
 *
 * Provides filtered, deduplicated respondent data with PII fields
 * for authorized export operations (Story 5.4).
 *
 * Uses DISTINCT ON (respondents.id) to avoid duplicate rows when
 * a respondent has multiple submissions. Returns the latest submission
 * context (fraud severity, verification status) per respondent.
 */

import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/**
 * Extensible filter interface for export queries.
 * Story 5.5 will add gender, formType, enumeratorId, search filters.
 * Unknown keys are accepted and ignored.
 */
export interface ExportFilters {
  lgaId?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  severity?: string;
  verificationStatus?: string;
  [key: string]: unknown;
}

/** Flattened export row with all PII + context columns */
export interface ExportRow {
  firstName: string;
  lastName: string;
  nin: string;
  phoneNumber: string;
  dateOfBirth: string;
  lgaName: string;
  source: string;
  registeredAt: string;
  fraudSeverity: string;
  verificationStatus: string;
}

export class ExportQueryService {
  /**
   * Fetch respondent export data with applied filters.
   * Uses DISTINCT ON to deduplicate respondents with multiple submissions.
   * Returns the latest submission's fraud/verification context per respondent.
   */
  static async getRespondentExportData(
    filters: ExportFilters,
  ): Promise<{ data: ExportRow[]; totalCount: number }> {
    const whereClause = ExportQueryService.buildWhereClause(filters);

    const query = sql`
      SELECT DISTINCT ON (r.id)
        r.first_name, r.last_name, r.nin, r.phone_number, r.date_of_birth,
        l.name as lga_name, r.source, r.created_at as registered_at,
        fd.severity as fraud_severity, fd.resolution as verification_status
      FROM respondents r
      LEFT JOIN lgas l ON r.lga_id = l.code
      LEFT JOIN submissions s ON s.respondent_id = r.id
      LEFT JOIN fraud_detections fd ON fd.submission_id = s.id
      ${whereClause}
      ORDER BY r.id, s.submitted_at DESC NULLS LAST
    `;

    const result = await db.execute(query);
    const rows = result.rows as Record<string, unknown>[];

    const data: ExportRow[] = rows.map((row) => ({
      firstName: String(row.first_name ?? ''),
      lastName: String(row.last_name ?? ''),
      nin: String(row.nin ?? ''),
      phoneNumber: String(row.phone_number ?? ''),
      dateOfBirth: String(row.date_of_birth ?? ''),
      lgaName: String(row.lga_name ?? ''),
      source: String(row.source ?? ''),
      registeredAt: row.registered_at
        ? new Date(row.registered_at as string | number | Date).toISOString()
        : '',
      fraudSeverity: String(row.fraud_severity ?? ''),
      verificationStatus: String(row.verification_status ?? ''),
    }));

    return { data, totalCount: data.length };
  }

  /**
   * COUNT query for record count preview (no full data fetch).
   * Uses COUNT(DISTINCT) to handle respondent deduplication.
   */
  static async getFilteredCount(filters: ExportFilters): Promise<number> {
    const whereClause = ExportQueryService.buildWhereClause(filters);

    const query = sql`
      SELECT COUNT(DISTINCT r.id) as count
      FROM respondents r
      LEFT JOIN submissions s ON s.respondent_id = r.id
      LEFT JOIN fraud_detections fd ON fd.submission_id = s.id
      ${whereClause}
    `;

    const result = await db.execute(query);
    const rows = result.rows as Record<string, unknown>[];
    return Number(rows[0]?.count ?? 0);
  }

  /** Build dynamic WHERE clause from known filter keys */
  private static buildWhereClause(filters: ExportFilters): SQL {
    const conditions: SQL[] = [];

    if (filters.lgaId) conditions.push(sql`r.lga_id = ${filters.lgaId}`);
    if (filters.source) conditions.push(sql`r.source = ${filters.source}`);
    if (filters.dateFrom) conditions.push(sql`r.created_at >= ${filters.dateFrom}::timestamptz`);
    if (filters.dateTo) conditions.push(sql`r.created_at <= ${filters.dateTo}::timestamptz`);
    if (filters.severity) conditions.push(sql`fd.severity = ${filters.severity}`);
    if (filters.verificationStatus === 'pending') {
      conditions.push(sql`fd.resolution IS NULL`);
    } else if (filters.verificationStatus) {
      conditions.push(sql`fd.resolution = ${filters.verificationStatus}`);
    }

    if (conditions.length === 0) return sql``;
    return sql`WHERE ${sql.join(conditions, sql` AND `)}`;
  }
}

/**
 * Export Query Service — Respondent & Submission data queries for CSV/PDF exports
 *
 * Provides filtered, deduplicated respondent data with PII fields
 * for authorized export operations (Story 5.4).
 *
 * Extended for Full Questionnaire Response CSV Export:
 * - Submission-level queries (one row per submission, not per respondent)
 * - Dynamic column building from NativeFormSchema
 * - Label mapping for select_one/select_multiple coded values
 */

import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { NativeFormSchema, Question } from '@oslsr/types';
import type { ExportColumn } from './export.service.js';
import { deriveDataStatus, hasNonEmptyRawData } from './registry-data-status.js';
import type { RegistryDataStatus } from './registry-data-status.js';

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
  consentMarketplace: string;
  consentEnriched: string;
  registeredAt: string;
  totalSubmissions: string;
  fraudScore: string;
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
        COALESCE(
          NULLIF(r.first_name, ''),
          NULLIF(s.raw_data->>'first_name', ''),
          NULLIF(s.raw_data->>'firstName', ''),
          NULLIF(s.raw_data->>'firstname', ''),
          first_name_fallback.first_name
        ) as first_name,
        COALESCE(
          NULLIF(r.last_name, ''),
          NULLIF(s.raw_data->>'last_name', ''),
          NULLIF(s.raw_data->>'lastName', ''),
          NULLIF(s.raw_data->>'lastname', ''),
          NULLIF(s.raw_data->>'surname', ''),
          last_name_fallback.last_name
        ) as last_name,
        r.nin, r.phone_number, r.date_of_birth,
        l.name as lga_name, r.source,
        r.consent_marketplace, r.consent_enriched,
        r.created_at as registered_at,
        (SELECT COUNT(*) FROM submissions sub WHERE sub.respondent_id = r.id) as total_submissions,
        fd.total_score as fraud_score,
        fd.severity as fraud_severity, fd.resolution as verification_status
      FROM respondents r
      LEFT JOIN lgas l ON r.lga_id = l.code
      LEFT JOIN submissions s ON s.respondent_id = r.id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            NULLIF(sx.raw_data->>'first_name', ''),
            NULLIF(sx.raw_data->>'firstName', ''),
            NULLIF(sx.raw_data->>'firstname', '')
          ) as first_name
        FROM submissions sx
        WHERE sx.respondent_id = r.id
          AND COALESCE(
            NULLIF(sx.raw_data->>'first_name', ''),
            NULLIF(sx.raw_data->>'firstName', ''),
            NULLIF(sx.raw_data->>'firstname', '')
          ) IS NOT NULL
        ORDER BY sx.submitted_at DESC NULLS LAST
        LIMIT 1
      ) first_name_fallback ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            NULLIF(sx.raw_data->>'last_name', ''),
            NULLIF(sx.raw_data->>'lastName', ''),
            NULLIF(sx.raw_data->>'lastname', ''),
            NULLIF(sx.raw_data->>'surname', '')
          ) as last_name
        FROM submissions sx
        WHERE sx.respondent_id = r.id
          AND COALESCE(
            NULLIF(sx.raw_data->>'last_name', ''),
            NULLIF(sx.raw_data->>'lastName', ''),
            NULLIF(sx.raw_data->>'lastname', ''),
            NULLIF(sx.raw_data->>'surname', '')
          ) IS NOT NULL
        ORDER BY sx.submitted_at DESC NULLS LAST
        LIMIT 1
      ) last_name_fallback ON true
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
      consentMarketplace: row.consent_marketplace ? 'Yes' : 'No',
      consentEnriched: row.consent_enriched ? 'Yes' : 'No',
      registeredAt: row.registered_at
        ? new Date(row.registered_at as string | number | Date).toISOString().split('T')[0]
        : '',
      totalSubmissions: String(row.total_submissions ?? '0'),
      fraudScore: row.fraud_score ? String(Number(row.fraud_score).toFixed(1)) : '',
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

  /**
   * Fetch submission-level export data for Full Response mode.
   * One row per submission (no DISTINCT ON). Includes rawData JSONB for flattening.
   */
  static async getSubmissionExportData(
    filters: ExportFilters & { formId: string },
  ): Promise<{ data: SubmissionExportRow[]; totalCount: number }> {
    const whereClause = ExportQueryService.buildSubmissionWhereClause(filters);

    const query = sql`
      SELECT
        r.nin,
        COALESCE(
          NULLIF(r.last_name, ''),
          NULLIF(s.raw_data->>'last_name', ''),
          NULLIF(s.raw_data->>'lastName', ''),
          NULLIF(s.raw_data->>'lastname', ''),
          NULLIF(s.raw_data->>'surname', '')
        ) as surname,
        COALESCE(
          NULLIF(r.first_name, ''),
          NULLIF(s.raw_data->>'first_name', ''),
          NULLIF(s.raw_data->>'firstName', ''),
          NULLIF(s.raw_data->>'firstname', '')
        ) as first_name,
        l.name as lga_name, r.source,
        s.submitted_at,
        u.full_name as enumerator_name,
        s.completion_time_seconds,
        s.gps_latitude, s.gps_longitude,
        fd.total_score as fraud_score,
        fd.severity as fraud_severity,
        fd.resolution as verification_status,
        s.raw_data
      FROM submissions s
      LEFT JOIN respondents r ON s.respondent_id = r.id
      LEFT JOIN lgas l ON r.lga_id = l.code
      LEFT JOIN users u ON s.enumerator_id = u.id::text
      LEFT JOIN fraud_detections fd ON fd.submission_id = s.id
      ${whereClause}
      ORDER BY s.submitted_at DESC NULLS LAST
    `;

    const result = await db.execute(query);
    const rows = result.rows as Record<string, unknown>[];

    const data: SubmissionExportRow[] = rows.map((row) => ({
      nin: String(row.nin ?? ''),
      surname: String(row.surname ?? ''),
      firstName: String(row.first_name ?? ''),
      lgaName: String(row.lga_name ?? ''),
      source: String(row.source ?? ''),
      submissionDate: row.submitted_at
        ? new Date(row.submitted_at as string | number | Date).toISOString().split('T')[0]
        : '',
      enumeratorName: String(row.enumerator_name ?? '').trim(),
      completionTimeSeconds: row.completion_time_seconds != null ? String(row.completion_time_seconds) : '',
      gpsLatitude: row.gps_latitude != null ? String(row.gps_latitude) : '',
      gpsLongitude: row.gps_longitude != null ? String(row.gps_longitude) : '',
      fraudScore: row.fraud_score ? String(Number(row.fraud_score).toFixed(1)) : '',
      fraudSeverity: String(row.fraud_severity ?? ''),
      verificationStatus: String(row.verification_status ?? ''),
      rawData: (row.raw_data as Record<string, unknown>) ?? {},
    }));

    return { data, totalCount: data.length };
  }

  /**
   * COUNT query for submission-level record count preview (Full Response mode).
   */
  static async getSubmissionFilteredCount(
    filters: ExportFilters & { formId: string },
  ): Promise<number> {
    const whereClause = ExportQueryService.buildSubmissionWhereClause(filters);

    const query = sql`
      SELECT COUNT(*) as count
      FROM submissions s
      LEFT JOIN respondents r ON s.respondent_id = r.id
      LEFT JOIN fraud_detections fd ON fd.submission_id = s.id
      ${whereClause}
    `;

    const result = await db.execute(query);
    const rows = result.rows as Record<string, unknown>[];
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Fetch UNIFIED export data (Story 9-59): every respondent + their latest
   * submission's answers where present, plus a canonical `data_status`.
   *
   * LEFT JOINs respondents → latest submission per respondent (DISTINCT ON +
   * latest `submitted_at`, mirroring the Summary dedup) so EVERY respondent row
   * exports — `rawData` is populated when a submission exists and `{}` when not.
   * Reuses the respondent-level WHERE clause + filters; the row count therefore
   * equals `getFilteredCount` (distinct respondents). `data_status` is derived
   * from the canonical taxonomy (`deriveDataStatus`) — the same model the
   * forthcoming analytics epic consumes.
   *
   * Uses `SELECT r.*` (introspection) for the respondent columns so the query
   * cannot break on schema drift (e.g. the 9-58 `reference_code` column) —
   * guarded by the real-DB smoke test.
   */
  static async getUnifiedExportData(
    filters: ExportFilters,
  ): Promise<{ data: UnifiedExportRow[]; totalCount: number }> {
    const whereClause = ExportQueryService.buildWhereClause(filters);

    const query = sql`
      SELECT DISTINCT ON (r.id)
        r.*,
        COALESCE(
          NULLIF(r.first_name, ''),
          NULLIF(s.raw_data->>'first_name', ''),
          NULLIF(s.raw_data->>'firstName', ''),
          NULLIF(s.raw_data->>'firstname', ''),
          NULLIF(s.raw_data->>'surname', '')
        ) as resolved_first_name,
        COALESCE(
          NULLIF(r.last_name, ''),
          NULLIF(s.raw_data->>'last_name', ''),
          NULLIF(s.raw_data->>'lastName', ''),
          NULLIF(s.raw_data->>'lastname', ''),
          NULLIF(s.raw_data->>'surname', '')
        ) as resolved_last_name,
        l.name as lga_name,
        (SELECT COUNT(*) FROM submissions sub WHERE sub.respondent_id = r.id) as total_submissions,
        s.submitted_at,
        s.gps_latitude, s.gps_longitude,
        -- Answers come from the latest submission that ACTUALLY has answers, not
        -- merely the latest submission (a later empty/correction submission must
        -- not mask an earlier completed one). Mirrors the name-fallback LATERAL
        -- used by the Summary export. submitted_at/gps/fraud stay sourced from
        -- the latest submission overall (recency context).
        answers.raw_data as raw_data,
        fd.total_score as fraud_score,
        fd.severity as fraud_severity,
        fd.resolution as verification_status
      FROM respondents r
      LEFT JOIN lgas l ON r.lga_id = l.code
      LEFT JOIN submissions s ON s.respondent_id = r.id
      LEFT JOIN LATERAL (
        SELECT sx.raw_data
        FROM submissions sx
        WHERE sx.respondent_id = r.id
          AND sx.raw_data IS NOT NULL
          AND sx.raw_data <> '{}'::jsonb
        ORDER BY sx.submitted_at DESC NULLS LAST
        LIMIT 1
      ) answers ON true
      LEFT JOIN fraud_detections fd ON fd.submission_id = s.id
      ${whereClause}
      ORDER BY r.id, s.submitted_at DESC NULLS LAST
    `;

    const result = await db.execute(query);
    const rows = result.rows as Record<string, unknown>[];

    const data: UnifiedExportRow[] = rows.map((row) => {
      const rawData = (row.raw_data as Record<string, unknown>) ?? {};
      const metadata = (row.metadata as { questionnaire_data_lost?: boolean; defer_reason_nin?: string; guardian?: unknown } | null) ?? null;
      const dataStatus = deriveDataStatus({
        hasSubmissionData: hasNonEmptyRawData(row.raw_data),
        status: row.status as string | null,
        source: row.source as string | null,
        metadata,
      });

      return {
        referenceCode: String(row.reference_code ?? ''),
        nin: String(row.nin ?? ''),
        firstName: String(row.resolved_first_name ?? ''),
        lastName: String(row.resolved_last_name ?? ''),
        dateOfBirth: String(row.date_of_birth ?? ''),
        phoneNumber: String(row.phone_number ?? ''),
        lgaName: String(row.lga_name ?? ''),
        source: String(row.source ?? ''),
        status: String(row.status ?? ''),
        dataStatus,
        consentMarketplace: row.consent_marketplace ? 'Yes' : 'No',
        consentEnriched: row.consent_enriched ? 'Yes' : 'No',
        registeredAt: row.created_at
          ? new Date(row.created_at as string | number | Date).toISOString().split('T')[0]
          : '',
        submissionDate: row.submitted_at
          ? new Date(row.submitted_at as string | number | Date).toISOString().split('T')[0]
          : '',
        totalSubmissions: String(row.total_submissions ?? '0'),
        gpsLatitude: row.gps_latitude != null ? String(row.gps_latitude) : '',
        gpsLongitude: row.gps_longitude != null ? String(row.gps_longitude) : '',
        fraudScore: row.fraud_score ? String(Number(row.fraud_score).toFixed(1)) : '',
        fraudSeverity: String(row.fraud_severity ?? ''),
        verificationStatus: String(row.verification_status ?? ''),
        // AC5 — explode operator-useful metadata keys (no PII beyond the row).
        hasGuardian: metadata?.guardian ? 'Yes' : 'No',
        questionnaireDataLost: metadata?.questionnaire_data_lost === true ? 'Yes' : 'No',
        deferReasonNin: String(metadata?.defer_reason_nin ?? ''),
        rawData,
      };
    });

    return { data, totalCount: data.length };
  }

  /**
   * Build dynamic WHERE clause from known filter keys (respondent-level).
   *
   * NOTE on the fraud filters (Story 9-59 review M4): `severity` and a concrete
   * `verificationStatus` reference `fd.*`, so applying either narrows the result
   * to respondents that HAVE a matching fraud detection — even though the join
   * is a LEFT JOIN. This is intentional and consistent with the Summary export
   * (both use this clause, so the unified row count still equals
   * `getFilteredCount`). The "all respondents" guarantee of the unified mode
   * therefore holds only when no fraud filter is applied; with one, the export
   * is correctly scoped to the matching fraud cohort. `verificationStatus =
   * 'pending'` (`fd.resolution IS NULL`) is the exception — it keeps no-fraud
   * rows because their resolution is NULL.
   */
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

  /** Build dynamic WHERE clause for submission-level queries (includes formId) */
  private static buildSubmissionWhereClause(filters: ExportFilters & { formId: string }): SQL {
    const conditions: SQL[] = [
      sql`s.questionnaire_form_id = ${filters.formId}`,
    ];

    if (filters.lgaId) conditions.push(sql`r.lga_id = ${filters.lgaId}`);
    if (filters.source) conditions.push(sql`r.source = ${filters.source}`);
    if (filters.dateFrom) conditions.push(sql`s.submitted_at >= ${filters.dateFrom}::timestamptz`);
    if (filters.dateTo) conditions.push(sql`s.submitted_at <= ${filters.dateTo}::timestamptz`);
    if (filters.severity) conditions.push(sql`fd.severity = ${filters.severity}`);
    if (filters.verificationStatus === 'pending') {
      conditions.push(sql`fd.resolution IS NULL`);
    } else if (filters.verificationStatus) {
      conditions.push(sql`fd.resolution = ${filters.verificationStatus}`);
    }

    return sql`WHERE ${sql.join(conditions, sql` AND `)}`;
  }
}

/** Flattened submission export row with metadata + rawData JSONB */
export interface SubmissionExportRow {
  nin: string;
  surname: string;
  firstName: string;
  lgaName: string;
  source: string;
  submissionDate: string;
  enumeratorName: string;
  completionTimeSeconds: string;
  gpsLatitude: string;
  gpsLongitude: string;
  fraudScore: string;
  fraudSeverity: string;
  verificationStatus: string;
  rawData: Record<string, unknown>;
}

/**
 * Unified export row (Story 9-59) — one row per respondent. Carries the
 * respondent identity + context columns, the canonical `dataStatus`, exploded
 * operator-useful metadata (AC5), and the latest submission's `rawData` (to be
 * key-normalized + label-mapped into answer columns by the controller).
 */
export interface UnifiedExportRow {
  referenceCode: string;
  nin: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  lgaName: string;
  source: string;
  status: string;
  dataStatus: RegistryDataStatus;
  consentMarketplace: string;
  consentEnriched: string;
  registeredAt: string;
  submissionDate: string;
  totalSubmissions: string;
  gpsLatitude: string;
  gpsLongitude: string;
  fraudScore: string;
  fraudSeverity: string;
  verificationStatus: string;
  hasGuardian: string;
  questionnaireDataLost: string;
  deferReasonNin: string;
  rawData: Record<string, unknown>;
}

/**
 * Fixed metadata columns for the Unified export (Story 9-59), in display order.
 * `dataStatus` is placed early so "139 rows, 76 with answers" reads as legible
 * rather than broken. The form-schema answer columns are appended after these.
 * NIN/phone use `format: 'text'` for the same Excel-coercion reason as the
 * Summary export (Story 9-26 Part I).
 */
export const UNIFIED_METADATA_COLUMNS: ExportColumn[] = [
  { key: 'referenceCode', header: 'Reference Code', width: 90, format: 'text' },
  { key: 'dataStatus', header: 'Data Status', width: 70 },
  { key: 'nin', header: 'NIN', width: 90, format: 'text' },
  { key: 'firstName', header: 'First Name', width: 80 },
  { key: 'lastName', header: 'Last Name', width: 80 },
  { key: 'dateOfBirth', header: 'Date of Birth', width: 70 },
  { key: 'phoneNumber', header: 'Phone', width: 85, format: 'text' },
  { key: 'lgaName', header: 'LGA', width: 80 },
  { key: 'source', header: 'Source', width: 70 },
  { key: 'status', header: 'Lifecycle Status', width: 80 },
  { key: 'registeredAt', header: 'Registration Date', width: 80 },
  { key: 'submissionDate', header: 'Latest Submission Date', width: 80 },
  // GPS is captured on the submission; populated for rows that have one, blank
  // otherwise. Parity with Full Response mode (Story 9-59 review H1 — the query
  // already selects + the row already carries these; without the columns they
  // were silently dropped from the CSV).
  { key: 'gpsLatitude', header: 'GPS Latitude', width: 70 },
  { key: 'gpsLongitude', header: 'GPS Longitude', width: 70 },
  { key: 'totalSubmissions', header: 'Submissions', width: 50 },
  { key: 'consentMarketplace', header: 'Marketplace Consent', width: 60 },
  { key: 'consentEnriched', header: 'Enriched Consent', width: 60 },
  { key: 'fraudScore', header: 'Fraud Score', width: 50 },
  { key: 'fraudSeverity', header: 'Fraud Severity', width: 60 },
  { key: 'verificationStatus', header: 'Verification Status', width: 70 },
  { key: 'hasGuardian', header: 'Has Guardian', width: 50 },
  { key: 'questionnaireDataLost', header: 'Questionnaire Data Lost', width: 60 },
  { key: 'deferReasonNin', header: 'NIN Defer Reason', width: 90 },
];

/** Fixed metadata columns for Full Response export (in exact spec order) */
export const SUBMISSION_METADATA_COLUMNS: ExportColumn[] = [
  { key: 'nin', header: 'NIN', width: 90 },
  { key: 'surname', header: 'Surname', width: 80 },
  { key: 'firstName', header: 'First Name', width: 80 },
  { key: 'lgaName', header: 'LGA Name', width: 80 },
  { key: 'source', header: 'Source', width: 60 },
  { key: 'submissionDate', header: 'Submission Date', width: 80 },
  { key: 'enumeratorName', header: 'Enumerator Name', width: 100 },
  { key: 'completionTimeSeconds', header: 'Completion Time (seconds)', width: 70 },
  { key: 'gpsLatitude', header: 'GPS Latitude', width: 70 },
  { key: 'gpsLongitude', header: 'GPS Longitude', width: 70 },
  { key: 'fraudScore', header: 'Fraud Score', width: 50 },
  { key: 'fraudSeverity', header: 'Fraud Severity', width: 60 },
  { key: 'verificationStatus', header: 'Verification Status', width: 70 },
];

/**
 * Build ExportColumn[] from a NativeFormSchema.
 * Iterates sections in order, skips note and geopoint question types.
 */
export function buildColumnsFromFormSchema(schema: NativeFormSchema): ExportColumn[] {
  const columns: ExportColumn[] = [];

  for (const section of schema.sections) {
    for (const question of section.questions) {
      if (question.type === 'note' || question.type === 'geopoint') continue;
      columns.push({
        key: question.name,
        header: question.label,
        width: 80,
      });
    }
  }

  return columns;
}

/**
 * Build a value→label lookup Map for each choice list in the schema.
 * Pre-computing avoids O(n) Array.find() per value during row iteration.
 */
export function buildChoiceMaps(
  schema: NativeFormSchema,
): Map<string, Map<string, string>> {
  const maps = new Map<string, Map<string, string>>();
  for (const [listName, choices] of Object.entries(schema.choiceLists)) {
    const m = new Map<string, string>();
    for (const c of choices) {
      m.set(c.value, c.label);
    }
    maps.set(listName, m);
  }
  return maps;
}

/**
 * Flatten a single row's rawData using the form schema for label mapping.
 * - select_one: coded value → human-readable label
 * - select_multiple: space-delimited codes → semicolon-delimited labels
 * - text/number/date: pass through as string
 * - Missing keys → empty string
 * - Unknown codes → raw value fallback
 *
 * Accepts optional pre-built choiceMaps for O(1) lookups (recommended
 * when flattening many rows). Falls back to building them on the fly.
 */
export function flattenRawDataRow(
  rawData: Record<string, unknown>,
  schema: NativeFormSchema,
  choiceMaps?: Map<string, Map<string, string>>,
): Record<string, string> {
  const result: Record<string, string> = {};
  const maps = choiceMaps ?? buildChoiceMaps(schema);

  const allQuestions: Question[] = [];
  for (const section of schema.sections) {
    for (const question of section.questions) {
      if (question.type === 'note' || question.type === 'geopoint') continue;
      allQuestions.push(question);
    }
  }

  for (const question of allQuestions) {
    const rawValue = rawData[question.name];

    if (rawValue == null || rawValue === '') {
      result[question.name] = '';
      continue;
    }

    if (question.type === 'select_one' && question.choices) {
      const choiceMap = maps.get(question.choices);
      if (choiceMap) {
        const label = choiceMap.get(String(rawValue));
        result[question.name] = label ?? String(rawValue);
      } else {
        result[question.name] = String(rawValue);
      }
    } else if (question.type === 'select_multiple' && question.choices) {
      const choiceMap = maps.get(question.choices);
      const codes = String(rawValue).split(' ').filter(Boolean);
      if (choiceMap) {
        const labels = codes.map((code) => choiceMap.get(code) ?? code);
        result[question.name] = labels.join('; ');
      } else {
        result[question.name] = codes.join('; ');
      }
    } else {
      result[question.name] = String(rawValue);
    }
  }

  return result;
}

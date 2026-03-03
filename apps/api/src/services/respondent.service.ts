/**
 * Respondent Service — Individual Detail + Registry List + Submission Responses
 *
 * Story 5.3: Individual Record PII View (Authorized Roles).
 * Story 5.5: Respondent Data Registry Table — server-paginated, filterable list.
 * PII stripping for supervisor role, LGA scope enforcement.
 */

import { db } from '../db/index.js';
import { respondents } from '../db/schema/respondents.js';
import { submissions } from '../db/schema/submissions.js';
import { fraudDetections } from '../db/schema/fraud-detections.js';
import { users } from '../db/schema/users.js';
import { questionnaireForms } from '../db/schema/questionnaires.js';
import { lgas } from '../db/schema/lgas.js';
import { eq, desc, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import { TeamAssignmentService } from './team-assignment.service.js';
import type {
  RespondentDetailResponse,
  SubmissionSummary,
  SubmissionResponseDetail,
  FraudSummary,
  RespondentListItem,
  RespondentFilterParams,
  CursorPaginatedResponse,
} from '@oslsr/types';
import { QuestionnaireService } from './questionnaire.service.js';
import { buildChoiceMaps } from './export-query.service.js';

const SEVERITY_ORDER: Record<string, number> = {
  clean: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// Guard UUID casts from legacy/non-UUID questionnaire_form_id values in submissions.
const UUID_V4_REGEX_SQL = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

export class RespondentService {
  /**
   * Get full respondent detail with submission history and fraud context.
   *
   * @param respondentId - UUID of the respondent
   * @param userRole - Role of the requesting user
   * @param userId - ID of the requesting user (for supervisor scope check)
   */
  static async getRespondentDetail(
    respondentId: string,
    userRole: string,
    userId: string,
  ): Promise<RespondentDetailResponse> {
    // 1. Fetch respondent with LGA name
    const [respondent] = await db
      .select({
        id: respondents.id,
        nin: respondents.nin,
        firstName: respondents.firstName,
        lastName: respondents.lastName,
        phoneNumber: respondents.phoneNumber,
        dateOfBirth: respondents.dateOfBirth,
        lgaId: respondents.lgaId,
        lgaName: lgas.name,
        source: respondents.source,
        consentMarketplace: respondents.consentMarketplace,
        consentEnriched: respondents.consentEnriched,
        createdAt: respondents.createdAt,
        updatedAt: respondents.updatedAt,
      })
      .from(respondents)
      .leftJoin(lgas, eq(respondents.lgaId, lgas.code))
      .where(eq(respondents.id, respondentId))
      .limit(1);

    if (!respondent) {
      throw new AppError('NOT_FOUND', 'Respondent not found', 404);
    }

    // 2. Fetch submissions with fraud enrichment (includes enumeratorId for supervisor scope check)
    const submissionRows = await db
      .select({
        id: submissions.id,
        submittedAt: submissions.submittedAt,
        source: submissions.source,
        processed: submissions.processed,
        processingError: submissions.processingError,
        rawData: submissions.rawData,
        enumeratorId: submissions.enumeratorId,
        enumeratorName: users.fullName,
        formName: questionnaireForms.title,
        fraudDetectionId: fraudDetections.id,
        fraudSeverity: fraudDetections.severity,
        fraudTotalScore: fraudDetections.totalScore,
        fraudResolution: fraudDetections.resolution,
      })
      .from(submissions)
      .leftJoin(users, sql`${submissions.enumeratorId} = ${users.id}::text`)
      .leftJoin(
        questionnaireForms,
        sql`${submissions.questionnaireFormId} ~ ${UUID_V4_REGEX_SQL} AND ${submissions.questionnaireFormId}::uuid = ${questionnaireForms.id}`,
      )
      .leftJoin(fraudDetections, eq(fraudDetections.submissionId, submissions.id))
      .where(eq(submissions.respondentId, respondentId))
      .orderBy(desc(submissions.submittedAt))
      .limit(50);

    // 3. Supervisor scope check — must have a team member who submitted for this respondent
    // Note: respondents with zero submissions are always out-of-scope for supervisors (edge case)
    if (userRole === 'supervisor') {
      const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(userId);

      const hasSubmissionFromTeam = submissionRows.some(
        (s) => s.enumeratorId && enumeratorIds.includes(s.enumeratorId),
      );

      if (!hasSubmissionFromTeam) {
        throw new AppError('FORBIDDEN', 'Respondent not in your team scope', 403);
      }
    }

    // Fallback name resolution for legacy records where respondent table names are blank.
    const normalizeName = (value: unknown): string | null => {
      const s = typeof value === 'string' ? value.trim() : '';
      return s.length > 0 ? s : null;
    };
    const pickFromRaw = (
      raw: unknown,
      keys: string[],
    ): string | null => {
      if (!raw || typeof raw !== 'object') return null;
      const asRecord = raw as Record<string, unknown>;
      for (const key of keys) {
        const candidate = normalizeName(asRecord[key]);
        if (candidate) return candidate;
      }
      return null;
    };

    let resolvedFirstName = normalizeName(respondent.firstName);
    let resolvedLastName = normalizeName(respondent.lastName);
    if (!resolvedFirstName || !resolvedLastName) {
      for (const row of submissionRows) {
        if (!resolvedFirstName) {
          resolvedFirstName = pickFromRaw(row.rawData, ['first_name', 'firstName', 'firstname']);
        }
        if (!resolvedLastName) {
          resolvedLastName = pickFromRaw(row.rawData, ['last_name', 'lastName', 'lastname', 'surname']);
        }
        if (resolvedFirstName && resolvedLastName) break;
      }
    }

    // 4. Build submission summaries
    const submissionSummaries: SubmissionSummary[] = submissionRows.map((row) => ({
      id: row.id,
      submittedAt: row.submittedAt.toISOString(),
      formName: row.formName ?? null,
      source: row.source ?? 'webapp',
      enumeratorName: row.enumeratorName ?? null,
      processed: row.processed,
      processingError: row.processingError ?? null,
      fraudDetectionId: row.fraudDetectionId ?? null,
      fraudSeverity: row.fraudSeverity ?? null,
      fraudTotalScore: row.fraudTotalScore ? parseFloat(String(row.fraudTotalScore)) : null,
      fraudResolution: row.fraudResolution ?? null,
    }));

    // 5. Build fraud summary
    const flaggedSubmissions = submissionSummaries.filter(
      (s) => s.fraudSeverity && s.fraudSeverity !== 'clean',
    );

    let fraudSummary: FraudSummary | null = null;
    if (flaggedSubmissions.length > 0 || submissionSummaries.some((s) => s.fraudSeverity)) {
      const allSeverities = submissionSummaries
        .filter((s) => s.fraudSeverity)
        .map((s) => s.fraudSeverity!);

      const highestSeverity = allSeverities.reduce<string>((highest, current) => {
        return (SEVERITY_ORDER[current] ?? 0) > (SEVERITY_ORDER[highest] ?? 0) ? current : highest;
      }, 'clean') as FraudSummary['highestSeverity'];

      // Get latest resolution from submissions with fraud detections
      const withResolution = submissionSummaries
        .filter((s) => s.fraudResolution)
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      fraudSummary = {
        highestSeverity,
        flaggedSubmissionCount: flaggedSubmissions.length,
        latestResolution: withResolution[0]?.fraudResolution ?? null,
      };
    }

    // 6. Build response — strip PII for supervisor
    const response: RespondentDetailResponse = {
      id: respondent.id,
      nin: userRole === 'supervisor' ? null : respondent.nin,
      firstName: userRole === 'supervisor' ? null : resolvedFirstName,
      lastName: userRole === 'supervisor' ? null : resolvedLastName,
      phoneNumber: userRole === 'supervisor' ? null : respondent.phoneNumber,
      dateOfBirth: userRole === 'supervisor' ? null : respondent.dateOfBirth,
      lgaId: respondent.lgaId,
      lgaName: respondent.lgaName ?? null,
      source: respondent.source as RespondentDetailResponse['source'],
      consentMarketplace: respondent.consentMarketplace,
      consentEnriched: respondent.consentEnriched,
      createdAt: respondent.createdAt.toISOString(),
      updatedAt: respondent.updatedAt.toISOString(),
      submissions: submissionSummaries,
      fraudSummary,
    };

    return response;
  }

  // ── Submission Response Detail ──────────────────────────────────────

  /**
   * Get a single submission's full form responses, flattened with human-readable labels.
   * Grouped by form sections. Includes sibling submission IDs for navigation.
   */
  static async getSubmissionResponses(
    respondentId: string,
    submissionId: string,
    userRole: string,
    userId: string,
  ): Promise<SubmissionResponseDetail> {
    // 1. Fetch the submission with metadata
    const [row] = await db.execute(sql`
      SELECT
        s.id, s.respondent_id, s.submitted_at, s.source,
        s.questionnaire_form_id, s.enumerator_id,
        s.completion_time_seconds, s.gps_latitude, s.gps_longitude,
        s.raw_data,
        u.full_name as enumerator_name,
        fd.total_score as fraud_score,
        fd.severity as fraud_severity,
        fd.resolution as verification_status,
        qf.title as form_title, qf.version as form_version
      FROM submissions s
      LEFT JOIN users u ON s.enumerator_id = u.id::text
      LEFT JOIN fraud_detections fd ON fd.submission_id = s.id
      LEFT JOIN questionnaire_forms qf ON s.questionnaire_form_id ~ ${UUID_V4_REGEX_SQL} AND s.questionnaire_form_id::uuid = qf.id
      WHERE s.id = ${submissionId}
    `).then(r => r.rows as Record<string, unknown>[]);

    if (!row) {
      throw new AppError('NOT_FOUND', 'Submission not found', 404);
    }

    // IDOR prevention: submission must belong to the specified respondent
    if (String(row.respondent_id) !== respondentId) {
      throw new AppError('NOT_FOUND', 'Submission not found for this respondent', 404);
    }

    // Supervisor scope check: submission's enumerator must be in their team
    if (userRole === 'supervisor') {
      const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(userId);
      const submissionEnumeratorId = row.enumerator_id ? String(row.enumerator_id) : null;
      if (!submissionEnumeratorId || !enumeratorIds.includes(submissionEnumeratorId)) {
        throw new AppError('FORBIDDEN', 'Submission not in your team scope', 403);
      }
    }

    // 2. Build sections from form schema
    const formId = row.questionnaire_form_id ? String(row.questionnaire_form_id) : null;
    let sections: SubmissionResponseDetail['sections'] = [];

    if (formId) {
      const formSchema = await QuestionnaireService.getFormSchemaById(formId);
      if (formSchema) {
        const choiceMaps = buildChoiceMaps(formSchema);
        const rawData = (row.raw_data as Record<string, unknown>) ?? {};

        sections = formSchema.sections.map((section) => ({
          title: section.title,
          fields: section.questions
            .filter((q) => q.type !== 'note' && q.type !== 'geopoint')
            .map((question) => {
              const rawValue = rawData[question.name];

              if (rawValue == null || rawValue === '') {
                return { label: question.label, value: '' };
              }

              if (question.type === 'select_one' && question.choices) {
                const choiceMap = choiceMaps.get(question.choices);
                const label = choiceMap?.get(String(rawValue));
                return { label: question.label, value: label ?? String(rawValue) };
              }

              if (question.type === 'select_multiple' && question.choices) {
                const choiceMap = choiceMaps.get(question.choices);
                const codes = String(rawValue).split(' ').filter(Boolean);
                const labels = codes.map((code) => choiceMap?.get(code) ?? code);
                return { label: question.label, value: labels.join('; ') };
              }

              return { label: question.label, value: String(rawValue) };
            }),
        }));
      }
    }

    // 3. Fetch sibling submission IDs for navigator
    const siblingResult = await db.execute(sql`
      SELECT id FROM submissions
      WHERE respondent_id = ${respondentId}
      ORDER BY submitted_at DESC
    `);
    const siblingSubmissionIds = (siblingResult.rows as { id: string }[]).map((r) => r.id);

    // 4. Build response
    return {
      submissionId: String(row.id),
      respondentId,
      submittedAt: row.submitted_at ? new Date(row.submitted_at as string | number | Date).toISOString() : '',
      source: String(row.source ?? ''),
      enumeratorName: row.enumerator_name ? String(row.enumerator_name) : null,
      completionTimeSeconds: row.completion_time_seconds != null ? Number(row.completion_time_seconds) : null,
      gpsLatitude: row.gps_latitude != null ? Number(row.gps_latitude) : null,
      gpsLongitude: row.gps_longitude != null ? Number(row.gps_longitude) : null,
      fraudSeverity: row.fraud_severity ? String(row.fraud_severity) : null,
      fraudScore: row.fraud_score ? parseFloat(String(row.fraud_score)) : null,
      verificationStatus: row.verification_status ? String(row.verification_status) : null,
      formTitle: row.form_title ? String(row.form_title) : 'Unknown Form',
      formVersion: row.form_version ? String(row.form_version) : '',
      sections,
      siblingSubmissionIds,
    };
  }

  // ── Story 5.5: Registry List ──────────────────────────────────────

  /**
   * Verification status filter category → SQL conditions mapping.
   * Maps the 4 user-facing filter categories to the 8 derived states.
   */
  private static readonly STATUS_FILTER_MAP: Record<string, string> = {
    pending: `(fd.id IS NULL OR (fd.severity IN ('low','medium') AND fd.resolution IS NULL) OR (fd.resolution IS NOT NULL AND fd.assessor_resolution IS NULL))`,
    verified: `((fd.severity = 'clean' AND fd.resolution IS NULL) OR fd.assessor_resolution = 'final_approved')`,
    rejected: `fd.assessor_resolution = 'final_rejected'`,
    quarantined: `(fd.severity IN ('high','critical') AND fd.resolution IS NULL)`,
  };

  /**
   * Build WHERE conditions from filters and role-based scope.
   * Shared by listRespondents and getRespondentCount to avoid duplication.
   * Returns null if supervisor has no team (caller should return empty).
   */
  private static async buildFilterConditions(
    filters: RespondentFilterParams,
    userRole: string,
    userId: string,
  ): Promise<{ conditions: SQL[]; whereClause: SQL } | null> {
    const conditions: SQL[] = [];

    // Supervisor scope: restrict to team enumerators' respondents
    if (userRole === 'supervisor') {
      const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(userId);
      if (enumeratorIds.length === 0) return null;
      conditions.push(sql`s.enumerator_id IN (${sql.join(enumeratorIds.map(id => sql`${id}`), sql`, `)})`);
    }

    if (filters.lgaId) conditions.push(sql`r.lga_id = ${filters.lgaId}`);
    if (filters.gender) conditions.push(sql`s.raw_data->>'gender' = ${filters.gender}`);
    if (filters.source) conditions.push(sql`r.source = ${filters.source}`);
    if (filters.dateFrom) conditions.push(sql`r.created_at >= ${filters.dateFrom}::timestamptz`);
    if (filters.dateTo) conditions.push(sql`r.created_at <= ${filters.dateTo}::timestamptz`);

    if (filters.verificationStatus && RespondentService.STATUS_FILTER_MAP[filters.verificationStatus]) {
      conditions.push(sql.raw(RespondentService.STATUS_FILTER_MAP[filters.verificationStatus]));
    }

    if (filters.severity) {
      const severities = filters.severity.split(',').map(s => s.trim()).filter(Boolean);
      if (severities.length > 0) {
        conditions.push(sql`fd.severity IN (${sql.join(severities.map(s => sql`${s}`), sql`, `)})`);
      }
    }

    if (filters.formId) conditions.push(sql`s.questionnaire_form_id = ${filters.formId}`);
    if (filters.enumeratorId) conditions.push(sql`s.enumerator_id = ${filters.enumeratorId}`);

    if (filters.search) {
      const searchTerm = filters.search;
      conditions.push(sql`(r.first_name ILIKE ${'%' + searchTerm + '%'} OR r.last_name ILIKE ${'%' + searchTerm + '%'} OR r.nin LIKE ${searchTerm + '%'})`);
    }

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    return { conditions, whereClause };
  }

  /**
   * List respondents with cursor-based pagination, filtering, and role-based access.
   * Uses DISTINCT ON (r.id) to show the latest submission context per respondent.
   */
  static async listRespondents(
    filters: RespondentFilterParams,
    userRole: string,
    userId: string,
  ): Promise<CursorPaginatedResponse<RespondentListItem>> {
    const pageSize = filters.pageSize ?? 20;
    const sortBy = filters.sortBy ?? 'registeredAt';
    const sortOrder = filters.sortOrder ?? 'desc';

    const filterResult = await RespondentService.buildFilterConditions(filters, userRole, userId);
    if (!filterResult) return RespondentService.emptyPage(pageSize);

    const { whereClause } = filterResult;

    // Cursor pagination
    let cursorClause = sql``;
    if (filters.cursor) {
      const pipeIndex = filters.cursor.lastIndexOf('|');
      if (pipeIndex === -1) {
        throw new AppError('VALIDATION_ERROR', 'Invalid cursor format', 400);
      }
      const cursorDate = filters.cursor.substring(0, pipeIndex);
      const cursorId = filters.cursor.substring(pipeIndex + 1);
      const parsedDate = new Date(cursorDate);
      if (isNaN(parsedDate.getTime())) {
        throw new AppError('VALIDATION_ERROR', 'Invalid cursor date', 400);
      }

      // Sort column mapping for cursor comparison
      const sortCol = RespondentService.getSortColumn(sortBy);
      if (sortOrder === 'desc') {
        cursorClause = sql`AND (${sql.raw(sortCol)} < ${parsedDate} OR (${sql.raw(sortCol)} = ${parsedDate} AND sub.id < ${cursorId}))`;
      } else {
        cursorClause = sql`AND (${sql.raw(sortCol)} > ${parsedDate} OR (${sql.raw(sortCol)} = ${parsedDate} AND sub.id > ${cursorId}))`;
      }
    }

    // Sort column + direction
    const sortCol = RespondentService.getSortColumn(sortBy);
    const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const idDir = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Main query: DISTINCT ON (r.id) with latest submission per respondent
    const dataQuery = sql`
      SELECT * FROM (
        SELECT DISTINCT ON (r.id)
          r.id,
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
          r.nin, r.phone_number,
          r.lga_id, l.name as lga_name, r.source, r.created_at as registered_at,
          s.raw_data->>'gender' as gender,
          s.enumerator_id,
          u.full_name as enumerator_name,
          qf.title as form_name,
          fd.severity as fraud_severity,
          fd.total_score as fraud_total_score,
          CASE
            WHEN fd.id IS NULL AND s.processing_error IS NOT NULL THEN 'processing_error'
            WHEN fd.id IS NULL THEN 'unprocessed'
            WHEN fd.assessor_resolution = 'final_approved' THEN 'verified'
            WHEN fd.assessor_resolution = 'final_rejected' THEN 'rejected'
            WHEN fd.severity IN ('high','critical') AND fd.resolution IS NULL THEN 'flagged'
            WHEN fd.resolution IS NOT NULL AND fd.assessor_resolution IS NULL THEN 'under_audit'
            WHEN fd.severity = 'clean' AND fd.resolution IS NULL THEN 'auto_clean'
            ELSE 'pending_review'
          END as verification_status
        FROM respondents r
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
        LEFT JOIN lgas l ON r.lga_id = l.code
        LEFT JOIN users u ON s.enumerator_id = u.id::text
        LEFT JOIN questionnaire_forms qf ON s.questionnaire_form_id ~ ${UUID_V4_REGEX_SQL} AND s.questionnaire_form_id::uuid = qf.id
        LEFT JOIN fraud_detections fd ON fd.submission_id = s.id
        ${whereClause}
        ORDER BY r.id, s.submitted_at DESC NULLS LAST
      ) sub
      WHERE 1=1 ${cursorClause}
      ORDER BY ${sql.raw(sortCol)} ${sql.raw(orderDir)}, sub.id ${sql.raw(idDir)}
      LIMIT ${pageSize + 1}
    `;

    const result = await db.execute(dataQuery);
    const allRows = result.rows as Record<string, unknown>[];

    const hasNextPage = allRows.length > pageSize;
    const dataRows = hasNextPage ? allRows.slice(0, pageSize) : allRows;

    // Build response items
    const isSupervisor = userRole === 'supervisor';
    const items: RespondentListItem[] = dataRows.map((row) => ({
      id: String(row.id),
      firstName: isSupervisor ? null : row.first_name ? String(row.first_name) : null,
      lastName: isSupervisor ? null : row.last_name ? String(row.last_name) : null,
      nin: isSupervisor ? null : row.nin ? String(row.nin) : null,
      phoneNumber: isSupervisor ? null : row.phone_number ? String(row.phone_number) : null,
      gender: row.gender ? String(row.gender) : null,
      lgaId: row.lga_id ? String(row.lga_id) : null,
      lgaName: row.lga_name ? String(row.lga_name) : null,
      source: String(row.source || 'enumerator') as RespondentListItem['source'],
      enumeratorId: row.enumerator_id ? String(row.enumerator_id) : null,
      enumeratorName: row.enumerator_name ? String(row.enumerator_name) : null,
      formName: row.form_name ? String(row.form_name) : null,
      registeredAt: row.registered_at
        ? new Date(row.registered_at as string | number | Date).toISOString()
        : new Date().toISOString(),
      fraudSeverity: (row.fraud_severity as RespondentListItem['fraudSeverity']) ?? null,
      fraudTotalScore: row.fraud_total_score ? parseFloat(String(row.fraud_total_score)) : null,
      verificationStatus: (row.verification_status as RespondentListItem['verificationStatus']) ?? 'unprocessed',
    }));

    // Build cursors
    const lastItem = dataRows[dataRows.length - 1];
    const nextCursor = hasNextPage && lastItem
      ? `${new Date(lastItem.registered_at as string | number | Date).toISOString()}|${lastItem.id}`
      : null;

    // Get total count (separate lightweight query)
    const totalItems = await RespondentService.getRespondentCount(filters, userRole, userId);

    return {
      data: items,
      meta: {
        pagination: {
          pageSize,
          hasNextPage,
          hasPreviousPage: !!filters.cursor,
          nextCursor,
          previousCursor: null, // Forward-only cursor
          totalItems,
        },
      },
    };
  }

  /**
   * Lightweight COUNT query for total filtered respondents.
   * Reuses buildFilterConditions to stay in sync with listRespondents.
   */
  static async getRespondentCount(
    filters: RespondentFilterParams,
    userRole: string,
    userId: string,
  ): Promise<number> {
    const filterResult = await RespondentService.buildFilterConditions(filters, userRole, userId);
    if (!filterResult) return 0;

    const { whereClause } = filterResult;

    const countQuery = sql`
      SELECT COUNT(DISTINCT r.id) as count
      FROM respondents r
      LEFT JOIN submissions s ON s.respondent_id = r.id
      LEFT JOIN fraud_detections fd ON fd.submission_id = s.id
      ${whereClause}
    `;

    const result = await db.execute(countQuery);
    const rows = result.rows as Record<string, unknown>[];
    return Number(rows[0]?.count ?? 0);
  }

  /** Map sort field name to SQL column reference */
  private static getSortColumn(sortBy: string): string {
    const mapping: Record<string, string> = {
      registeredAt: 'sub.registered_at',
      fraudScore: 'sub.fraud_total_score',
      lgaName: 'sub.lga_name',
      verificationStatus: 'sub.verification_status',
    };
    return mapping[sortBy] ?? 'sub.registered_at';
  }

  /** Return an empty paginated response */
  private static emptyPage(pageSize: number): CursorPaginatedResponse<RespondentListItem> {
    return {
      data: [],
      meta: {
        pagination: {
          pageSize,
          hasNextPage: false,
          hasPreviousPage: false,
          nextCursor: null,
          previousCursor: null,
          totalItems: 0,
        },
      },
    };
  }
}

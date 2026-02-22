/**
 * Respondent Service — Individual Respondent Detail
 *
 * Story 5.3: Individual Record PII View (Authorized Roles).
 * Provides full respondent detail with submission history and fraud context.
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
import { AppError } from '@oslsr/utils';
import { TeamAssignmentService } from './team-assignment.service.js';
import type { RespondentDetailResponse, SubmissionSummary, FraudSummary } from '@oslsr/types';

const SEVERITY_ORDER: Record<string, number> = {
  clean: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

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
        enumeratorId: submissions.enumeratorId,
        enumeratorName: users.fullName,
        formName: questionnaireForms.title,
        fraudDetectionId: fraudDetections.id,
        fraudSeverity: fraudDetections.severity,
        fraudTotalScore: fraudDetections.totalScore,
        fraudResolution: fraudDetections.resolution,
      })
      .from(submissions)
      .leftJoin(users, eq(submissions.enumeratorId, users.id))
      .leftJoin(questionnaireForms, sql`${submissions.questionnaireFormId}::uuid = ${questionnaireForms.id}`)
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
      firstName: userRole === 'supervisor' ? null : respondent.firstName,
      lastName: userRole === 'supervisor' ? null : respondent.lastName,
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
}

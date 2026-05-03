/**
 * Submission Processing Service
 *
 * Extracts respondent identity from processed submissions,
 * creates/finds respondent records, and links submissions.
 *
 * Created in Story 3.4 (Idempotent Submission Ingestion).
 */

import { db } from '../db/index.js';
import { submissions, respondents } from '../db/schema/index.js';
import { questionnaireForms } from '../db/schema/index.js';
import { users, roles } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { queueFraudDetection } from '../queues/fraud-detection.queue.js';
import { queueMarketplaceExtraction } from '../queues/marketplace-extraction.queue.js';
import type { NativeFormSchema, Section, Question } from '@oslsr/types';
import type { RespondentMetadata, RespondentSource, RespondentStatus } from '../db/schema/respondents.js';
import {
  normaliseFullName,
  normaliseNigerianPhone,
  normaliseDate,
} from '../lib/normalise/index.js';
import pino from 'pino';

const logger = pino({ name: 'submission-processing-service' });

/**
 * Convention-based field mapping from rawData question names to respondent fields.
 * Supports both snake_case (XLSForm convention) and camelCase variants.
 */
export const RESPONDENT_FIELD_MAP: Record<string, string> = {
  // NIN (REQUIRED)
  'nin': 'nin',
  'national_id': 'nin',
  // Name (supports XLSForm, camelCase, and snake_case conventions)
  'first_name': 'firstName',
  'firstName': 'firstName',
  'firstname': 'firstName',
  'last_name': 'lastName',
  'lastName': 'lastName',
  'surname': 'lastName',
  // Personal
  'date_of_birth': 'dateOfBirth',
  'dob': 'dateOfBirth',
  'phone': 'phoneNumber',
  'phone_number': 'phoneNumber',
  // Location
  'lga': 'lgaId',
  'lga_id': 'lgaId',
  // Consent
  'consent_marketplace': 'consentMarketplace',
  'consent_enriched': 'consentEnriched',
};

/** Maps user role names to respondent source types */
const ROLE_TO_SOURCE: Record<string, RespondentSource> = {
  'enumerator': 'enumerator',
  'data_entry_clerk': 'clerk',
  'public_user': 'public',
};

/**
 * Permanent processing error — should NOT be retried by BullMQ.
 */
export class PermanentProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentProcessingError';
  }
}

interface ProcessingResult {
  action: 'processed' | 'skipped';
  submissionId: string;
  respondentId?: string;
}

interface ExtractedRespondentData {
  // NIN is optional at this layer post Story 11-1 — `extractRespondentData()`
  // still requires it (the field-survey path), but the public-wizard /
  // pending-NIN code path (Story 9-12) calls `findOrCreateRespondent` directly
  // without NIN, producing a `pending_nin_capture` respondent. FR21 stays in
  // force for every NIN-carrying row via the partial unique index.
  nin?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  phoneNumber?: string;
  lgaId?: string;
  consentMarketplace: boolean;
  consentEnriched: boolean;
}

/**
 * Normalise the PII fields on extracted respondent data prior to insert.
 *
 * Returns the canonical values plus a metadata object containing any
 * normalisation warnings (or `null` if no warnings fired). Exported for
 * direct unit testing; consumed by `findOrCreateRespondent`.
 *
 * Warning codes are field-prefixed (`first_name:all_caps`, `phone_number:...`)
 * so the audit-log viewer (Story 9-11) can filter by `(field, code)` tuple.
 */
export function normaliseRespondentPii(data: ExtractedRespondentData): {
  canonical: {
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null;
    phoneNumber: string | null;
  };
  metadata: RespondentMetadata | null;
} {
  const warnings: string[] = [];
  const canonical = {
    firstName: data.firstName ?? null,
    lastName: data.lastName ?? null,
    dateOfBirth: data.dateOfBirth ?? null,
    phoneNumber: data.phoneNumber ?? null,
  };

  // `firstName` and `lastName` are stored as separate columns, so the
  // `single_word` warning from `normaliseFullName` is a guaranteed false
  // positive for these fields — we suppress it. All other warnings (e.g.
  // `all_caps`) remain meaningful and pass through.
  if (data.firstName) {
    const r = normaliseFullName(data.firstName);
    canonical.firstName = r.value || null;
    for (const w of r.warnings) {
      if (w !== 'single_word') warnings.push(`first_name:${w}`);
    }
  }
  if (data.lastName) {
    const r = normaliseFullName(data.lastName);
    canonical.lastName = r.value || null;
    for (const w of r.warnings) {
      if (w !== 'single_word') warnings.push(`last_name:${w}`);
    }
  }
  if (data.phoneNumber) {
    const r = normaliseNigerianPhone(data.phoneNumber);
    canonical.phoneNumber = r.value || null;
    for (const w of r.warnings) warnings.push(`phone_number:${w}`);
  }
  if (data.dateOfBirth) {
    const r = normaliseDate(data.dateOfBirth, 'DMY');
    // Persist as canonical ISO YYYY-MM-DD string; column stays TEXT until
    // the deferred strict-type migration runs after back-fill is verified.
    canonical.dateOfBirth = r.value
      ? r.value.toISOString().slice(0, 10)
      : (data.dateOfBirth ?? null);
    for (const w of r.warnings) warnings.push(`date_of_birth:${w}`);
  }

  const metadata: RespondentMetadata | null =
    warnings.length > 0 ? { normalisation_warnings: warnings } : null;

  return { canonical, metadata };
}

/**
 * Submission Processing Service
 *
 * Handles respondent extraction, dedup, linking, and fraud queue trigger.
 */
export class SubmissionProcessingService {
  /**
   * Process a single submission: extract respondent, link, queue fraud detection.
   */
  static async processSubmission(submissionId: string): Promise<ProcessingResult> {
    // Load submission
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });

    if (!submission) {
      throw new PermanentProcessingError(`Submission not found: ${submissionId}`);
    }

    // Idempotent check — skip if already processed
    if (submission.processed) {
      logger.info({
        event: 'submission_processing.skipped',
        submissionId,
        reason: 'already_processed',
      });
      return { action: 'skipped', submissionId };
    }

    // Load form schema (AC 3.4.8)
    const form = await db.query.questionnaireForms.findFirst({
      where: eq(questionnaireForms.id, submission.questionnaireFormId),
    });

    if (!form || !form.formSchema) {
      throw new PermanentProcessingError(
        `Form schema not found for questionnaireFormId: ${submission.questionnaireFormId}`
      );
    }

    // Extract respondent data from rawData, validated against form schema
    const rawData = submission.rawData as Record<string, unknown> | null;
    if (!rawData) {
      throw new PermanentProcessingError(`Submission ${submissionId} has no rawData`);
    }

    const formSchema = form.formSchema as NativeFormSchema;
    const respondentData = this.extractRespondentData(rawData, formSchema);

    // Determine submitter role from users table (AC 3.4.4)
    const submitterRole = await this.determineSubmitterRole(submission.submitterId ?? null);

    // Find or create respondent by NIN
    let respondent: { id: string; _isNew: boolean };
    try {
      respondent = await this.findOrCreateRespondent(
        respondentData,
        submitterRole,
        submission.submitterId ?? undefined
      );
    } catch (error) {
      if (error instanceof PermanentProcessingError) {
        // NIN duplicate rejection — log and re-throw; worker persists the error (AC 3.7.1)
        logger.info({
          event: 'submission_processing.nin_rejected',
          submissionId,
          error: error.message,
        });

        throw error;
      }
      throw error;
    }

    // Determine enumeratorId: only set when submitter is an enumerator (AC 3.4.4)
    const enumeratorId = submitterRole === 'enumerator' ? (submission.submitterId ?? null) : null;

    // Update submission: link respondent, mark processed
    await db.update(submissions).set({
      respondentId: respondent.id,
      enumeratorId,
      processed: true,
      processedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(submissions.id, submissionId));

    logger.info({
      event: 'submission_processing.processed',
      submissionId,
      respondentId: respondent.id,
      enumeratorId,
      submitterRole,
      isNewRespondent: respondent._isNew,
    });

    // Queue fraud detection if GPS coordinates present
    if (submission.gpsLatitude != null && submission.gpsLongitude != null) {
      await queueFraudDetection({
        submissionId,
        respondentId: respondent.id,
        gpsLatitude: submission.gpsLatitude,
        gpsLongitude: submission.gpsLongitude,
      });

      logger.info({
        event: 'submission_processing.fraud_queued',
        submissionId,
        respondentId: respondent.id,
      });
    }

    // Queue marketplace profile extraction if consent given
    if (respondentData.consentMarketplace) {
      await queueMarketplaceExtraction({
        respondentId: respondent.id,
        submissionId,
      });

      logger.info({
        event: 'submission_processing.marketplace_queued',
        submissionId,
        respondentId: respondent.id,
      });
    }

    return {
      action: 'processed',
      submissionId,
      respondentId: respondent.id,
    };
  }

  /**
   * Determine the respondent source type from the submitter's user role.
   * Maps role names to respondent source: enumerator→'enumerator', data_entry_clerk→'clerk',
   * public_user→'public'. Unknown/missing submitter defaults to 'public'.
   */
  static async determineSubmitterRole(submitterId: string | null): Promise<RespondentSource> {
    if (!submitterId) return 'public';

    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, submitterId),
        columns: { roleId: true },
      });

      if (!user) return 'public';

      const role = await db.query.roles.findFirst({
        where: eq(roles.id, user.roleId),
        columns: { name: true },
      });

      if (!role) return 'public';

      return ROLE_TO_SOURCE[role.name] ?? 'enumerator';
    } catch (error) {
      logger.warn({
        event: 'submission_processing.role_lookup_failed',
        submitterId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 'public';
    }
  }

  /**
   * Extract respondent identity fields from rawData using convention-based mapping.
   * Validates against form schema that NIN field exists (AC 3.4.8).
   * Throws PermanentProcessingError if NIN is missing.
   */
  static extractRespondentData(
    rawData: Record<string, unknown>,
    formSchema?: NativeFormSchema
  ): ExtractedRespondentData {
    // AC 3.4.8: Validate that the form schema contains a NIN-mapped question
    if (formSchema) {
      const allQuestions: Question[] = formSchema.sections.flatMap((s: Section) => s.questions);
      const hasNinQuestion = allQuestions.some(
        (q: Question) => RESPONDENT_FIELD_MAP[q.name] === 'nin'
      );
      if (!hasNinQuestion) {
        throw new PermanentProcessingError(
          'Form schema does not contain a NIN question (required for respondent extraction)'
        );
      }
    }

    const extracted: Record<string, unknown> = {};

    for (const [questionName, value] of Object.entries(rawData)) {
      const fieldName = RESPONDENT_FIELD_MAP[questionName];
      if (fieldName && value != null && value !== '') {
        extracted[fieldName] = value;
      }
    }

    // NIN is required
    if (!extracted['nin']) {
      throw new PermanentProcessingError(
        'Required field NIN is missing from submission rawData'
      );
    }

    // Convert consent fields to boolean
    const consentMarketplace = String(extracted['consentMarketplace'] ?? '').toLowerCase() === 'yes';
    const consentEnriched = String(extracted['consentEnriched'] ?? '').toLowerCase() === 'yes';

    return {
      nin: String(extracted['nin']),
      firstName: extracted['firstName'] != null ? String(extracted['firstName']) : undefined,
      lastName: extracted['lastName'] != null ? String(extracted['lastName']) : undefined,
      dateOfBirth: extracted['dateOfBirth'] != null ? String(extracted['dateOfBirth']) : undefined,
      phoneNumber: extracted['phoneNumber'] != null ? String(extracted['phoneNumber']) : undefined,
      lgaId: extracted['lgaId'] != null ? String(extracted['lgaId']) : undefined,
      consentMarketplace,
      consentEnriched,
    };
  }

  /**
   * Find respondent by NIN, or create a new one.
   * Rejects duplicate NINs with PermanentProcessingError (Story 3.7).
   * Handles race condition: if unique constraint violation on NIN, reject.
   *
   * Story 11-1: NIN is now optional at this entry point. When `data.nin` is
   * undefined, the dedup checks are skipped and a `pending_nin_capture`
   * respondent is created. FR21 still applies to every NIN-carrying row via
   * the `respondents_nin_unique_when_present` partial unique index.
   */
  static async findOrCreateRespondent(
    data: ExtractedRespondentData,
    source: RespondentSource,
    submitterId?: string
  ): Promise<{ id: string; _isNew: boolean }> {
    // FR21 dedup branch — only when the incoming submission carries a NIN.
    // The public-wizard / pending-NIN flow (Story 9-12) calls into this method
    // without a NIN; FR21 will run later when the respondent completes
    // registration and a NIN is attached.
    if (data.nin) {
      // Check respondents table for existing NIN — reject if found (AC 3.7.1)
      const existing = await db.query.respondents.findFirst({
        where: eq(respondents.nin, data.nin),
      });

      if (existing) {
        throw new PermanentProcessingError(
          `NIN_DUPLICATE: This individual was already registered on ${existing.createdAt.toISOString()} via ${existing.source}`
        );
      }

      // Check users table for existing NIN — reject if staff member (AC 3.7.2)
      const staffUser = await db.query.users.findFirst({
        where: eq(users.nin, data.nin),
        columns: { id: true },
      });

      if (staffUser) {
        throw new PermanentProcessingError(
          'NIN_DUPLICATE_STAFF: This NIN belongs to a registered staff member'
        );
      }
    }

    // Normalise incoming PII before insert so the DB always holds canonical
    // values; non-blocking warnings are merged into `respondents.metadata`
    // for super-admin review (Audit Log Viewer — Story 9-11).
    const { canonical, metadata } = normaliseRespondentPii(data);

    // Status reflects the lifecycle stage of this row: NIN-carrying rows are
    // 'active' immediately; rows without NIN start in 'pending_nin_capture'
    // and graduate to 'active' once the respondent completes registration via
    // the Story 9-12 magic-link flow.
    const status: RespondentStatus = data.nin ? 'active' : 'pending_nin_capture';

    // Create new respondent
    try {
      const [created] = await db.insert(respondents).values({
        nin: data.nin ?? null,
        firstName: canonical.firstName,
        lastName: canonical.lastName,
        dateOfBirth: canonical.dateOfBirth,
        phoneNumber: canonical.phoneNumber,
        lgaId: data.lgaId ?? null,
        consentMarketplace: data.consentMarketplace,
        consentEnriched: data.consentEnriched,
        source,
        submitterId: submitterId ?? null,
        status,
        metadata,
      }).returning();

      return { id: created.id, _isNew: true };
    } catch (error: unknown) {
      // Handle race condition: PostgreSQL unique constraint violation (code 23505)
      // Reject instead of linking (AC 3.7.7). Only meaningful when NIN was
      // supplied — pending-NIN inserts cannot trip the partial unique index.
      const pgError = error as { code?: string };
      if (pgError.code === '23505' && data.nin) {
        const retried = await db.query.respondents.findFirst({
          where: eq(respondents.nin, data.nin),
        });
        if (retried) {
          throw new PermanentProcessingError(
            `NIN_DUPLICATE: This individual was already registered on ${retried.createdAt.toISOString()} via ${retried.source}`
          );
        }
      }
      throw error;
    }
  }
}

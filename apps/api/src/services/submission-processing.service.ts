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
import { eq, sql } from 'drizzle-orm';
import { queueFraudDetection } from '../queues/fraud-detection.queue.js';
import { queueMarketplaceExtraction } from '../queues/marketplace-extraction.queue.js';
import type { NativeFormSchema, Section, Question } from '@oslsr/types';
import type { RespondentMetadata, RespondentSource, RespondentStatus } from '../db/schema/respondents.js';
import {
  normaliseFullName,
  normaliseNigerianPhone,
  normaliseDate,
} from '../lib/normalise/index.js';
import { evaluateMinorGuardianConsent, isValidReferenceCode, type GuardianData } from '@oslsr/utils';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from './audit.service.js';
import { ReferenceCodeService } from './reference-code.service.js';
import { EmailService } from './email.service.js';
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
  // still requires it (the field-survey path); the imported_* code paths
  // (Story 11-1) bypass this function entirely.
  //
  // CORRECTED 2026-05-20 by Story 9-26 Part C: the previous claim that
  // "the public-wizard / pending-NIN code path (Story 9-12) calls
  // findOrCreateRespondent directly without NIN" was inaccurate
  // documentation-drift. The wizard handler at
  // registration.controller.ts:submitWizard inserts BOTH a `respondents` row
  // AND a `submissions` row in the same transaction (post Story 9-26) —
  // bypassing this function entirely. It NEVER called findOrCreateRespondent
  // even pre-9-26. The drift dated to Story 9-12 code review.
  nin?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  phoneNumber?: string;
  lgaId?: string;
  consentMarketplace: boolean;
  consentEnriched: boolean;
  /**
   * Story 9-55 — captured guardian consent for an under-15 registrant. Derived
   * from the server-authoritative `age` (stamped into rawData by the submit
   * controller's calculate recompute) + the guardian answers. `null` for adults
   * / unknown-age. Persisted to `respondents.metadata.guardian`.
   */
  guardian?: GuardianData | null;
  /**
   * Story 9-58 — pre-generated human-friendly reference code threaded from the
   * synchronous `submitForm` controller (enumerator / clerk path) via the
   * `_referenceCode` rawData key, so the code echoed to the field officer at
   * submit time matches the code persisted on the created respondent. Absent
   * for legacy submissions / direct ingestion — `findOrCreateRespondent` then
   * mints one. NOT applied to the merge path (a promoted pending row keeps its
   * original code).
   */
  referenceCode?: string;
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
    let respondent: { id: string; _isNew: boolean; referenceCode?: string; status?: RespondentStatus };
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

    // Story 9-58 (AC5 enhancement, operator-chosen 2026-06-15) — when an
    // enumerator/clerk submission captured the respondent's email, proactively
    // send a registration confirmation carrying their reference code + status +
    // a pointer to the self-service status check. Fire-and-forget: a comms
    // failure must NEVER fail the ingestion (data integrity > notification, the
    // 9-26 unified-ingestion lesson). Only on a NEW respondent (not a merge).
    if (respondent._isNew && respondent.referenceCode) {
      const emailRaw = rawData['email'] ?? rawData['email_address'];
      const email = typeof emailRaw === 'string' && emailRaw.includes('@') ? emailRaw.trim() : null;
      if (email) {
        void this.sendReferenceConfirmationEmail({
          respondentId: respondent.id,
          email,
          referenceCode: respondent.referenceCode,
          status: respondent.status ?? 'active',
        });
      }
    }

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
   *
   * Story 9-12 (Universal pending-NIN, Option 1): NIN is no longer REQUIRED on the
   * extracted shape. When rawData lacks NIN OR carries the explicit `_pendingNin: true`
   * defer-flag, the function returns nin: undefined; downstream `findOrCreateRespondent`
   * creates a `pending_nin_capture` respondent (Story 11-1 path). The form schema must
   * still carry a NIN question (line 342 below) — only the per-submission NIN value is optional.
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

    // Story 9-12 Task 3.1 — NIN is OPTIONAL at this layer. Submissions can carry
    // `_pendingNin: true` to explicitly opt in to deferral, OR simply omit the
    // NIN value (frontend defer-toggle clears the answer before submit). Either
    // path produces a `pending_nin_capture` respondent downstream.
    const isExplicitlyPending = rawData['_pendingNin'] === true;
    const ninValue =
      !isExplicitlyPending && extracted['nin'] != null
        ? String(extracted['nin'])
        : undefined;

    // Convert consent fields to boolean
    const consentMarketplace = String(extracted['consentMarketplace'] ?? '').toLowerCase() === 'yes';
    const consentEnriched = String(extracted['consentEnriched'] ?? '').toLowerCase() === 'yes';

    // Story 9-55 — extract guardian consent for under-15 registrants. The age
    // here is the server-recomputed value the submit controller stamped into
    // rawData (`...computed`), so a client cannot forge it to dodge the gate.
    // The synchronous submitForm gate already rejected an incomplete minor
    // submission, so a minor reaching this worker carries a complete guardian.
    const ageRaw = rawData['age'];
    const age =
      typeof ageRaw === 'number'
        ? ageRaw
        : ageRaw != null && ageRaw !== '' && !Number.isNaN(Number(ageRaw))
          ? Number(ageRaw)
          : null;
    const guardian = evaluateMinorGuardianConsent(rawData, age).guardian;

    // Story 9-58 — the synchronous submitForm controller (server-authoritative,
    // review M2) mints the reference code and threads it here via
    // `_referenceCode` so the value echoed to the field officer matches the
    // persisted respondent's code. Review L2: validate the shape with
    // `isValidReferenceCode` before trusting it; a malformed string (legacy /
    // direct ingestion / tampering) is ignored and `findOrCreateRespondent`
    // mints a fresh one.
    const referenceCodeRaw = rawData['_referenceCode'];
    const referenceCode =
      typeof referenceCodeRaw === 'string' && isValidReferenceCode(referenceCodeRaw)
        ? referenceCodeRaw
        : undefined;

    return {
      nin: ninValue,
      firstName: extracted['firstName'] != null ? String(extracted['firstName']) : undefined,
      lastName: extracted['lastName'] != null ? String(extracted['lastName']) : undefined,
      dateOfBirth: extracted['dateOfBirth'] != null ? String(extracted['dateOfBirth']) : undefined,
      phoneNumber: extracted['phoneNumber'] != null ? String(extracted['phoneNumber']) : undefined,
      lgaId: extracted['lgaId'] != null ? String(extracted['lgaId']) : undefined,
      consentMarketplace,
      consentEnriched,
      guardian,
      referenceCode,
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
  ): Promise<{ id: string; _isNew: boolean; referenceCode?: string; status?: RespondentStatus }> {
    // Normalise incoming PII once up front. Race-resolution merge (Story 9-12 Task 3.5)
    // queries against pending rows using the SAME canonical values the DB stores, so
    // normalisation must run BEFORE the merge attempt — not just before insert.
    const { canonical, metadata } = normaliseRespondentPii(data);

    // Story 9-55 — fold captured guardian consent (under-15 only) into the row
    // metadata. Merged with the normalisation-warnings metadata so neither
    // clobbers the other.
    const metadataWithGuardian = data.guardian
      ? { ...(metadata ?? {}), guardian: data.guardian }
      : metadata;

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

      // Story 9-12 Task 3.5 — Race-resolution merge.
      // When NIN arrives later for a respondent who was previously deferred
      // (any source — public/enumerator/clerk), promote the existing pending
      // row in place rather than creating a duplicate.
      // Strict equality on lower(first_name)+lower(last_name)+phone_number;
      // ALL three fields must be present and match. Name typos / missing
      // phone fall through to a fresh insert (acceptable: better one duplicate
      // than wrong-person merge — supervisor can reconcile via Story 9-11).
      const promoted = await this.tryRaceResolutionMerge({
        nin: data.nin,
        firstName: canonical.firstName,
        lastName: canonical.lastName,
        phoneNumber: canonical.phoneNumber,
        submitterId,
        source,
        guardian: data.guardian ?? null,
      });
      if (promoted) {
        return { id: promoted.id, _isNew: false };
      }
    }

    // Status reflects the lifecycle stage of this row: NIN-carrying rows are
    // 'active' immediately; rows without NIN start in 'pending_nin_capture'
    // and graduate to 'active' once the respondent completes registration via
    // the Story 9-12 magic-link flow.
    const status: RespondentStatus = data.nin ? 'active' : 'pending_nin_capture';

    // Story 9-58 — every respondent gets a human-friendly reference code at
    // creation (pending rows too — so a later NIN-completion promotion keeps a
    // stable code). SERVER IS AUTHORITATIVE (review M2): the controller already
    // minted a server-side unique code and threaded it via `data.referenceCode`
    // (validated in `extractRespondentData`, review L2). Reuse it when present;
    // otherwise mint a fresh server-side code (legacy / direct ingestion). The
    // UNIQUE index remains the true backstop — see the 23505 retry below.
    let referenceCode = data.referenceCode ?? (await ReferenceCodeService.generateUnique(db));

    // Story 9-58 (review M3) — bounded retry on a reference_code unique
    // violation. The insert can trip the `respondents.reference_code` UNIQUE
    // index independently of NIN (e.g. a pending-NIN insert racing another, or
    // a re-used threaded code), which previously surfaced as a raw Postgres
    // error. Re-mint a fresh code and retry a bounded number of times.
    const MAX_REF_CODE_RETRIES = 5;

    // Create new respondent
    for (let attempt = 0; ; attempt++) {
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
        referenceCode,
        metadata: metadataWithGuardian,
      }).returning();

      // Story 9-12 Task 3.8 — emit PENDING_NIN_CREATED on every pending-NIN
      // row creation regardless of source. Fire-and-forget; downstream audit
      // chain serialises via SELECT...FOR UPDATE on its own.
      if (status === 'pending_nin_capture') {
        AuditService.logAction({
          actorId: submitterId ?? null,
          action: AUDIT_ACTIONS.PENDING_NIN_CREATED,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: created.id,
          details: { source },
        });
      } else {
        // Story 9-33 Bug #2 — emit DATA_CREATE for ACTIVE-respondent creation via
        // the submission-ingestion queue (enumerator / clerk / public with a
        // valid NIN). Without this, the Story 6-1 hash-chain audit ledger has
        // zero record of these respondents' provenance — an NDPA forensic gap.
        // Mutually exclusive with the PENDING_NIN_CREATED branch above, so
        // exactly one audit event fires per respondent creation. Fire-and-forget
        // to mirror the sibling branch (audit-chain failure must not block the
        // INSERT that already succeeded). `creation_path` distinguishes this
        // queue-processor channel from the wizard controller's DATA_CREATE
        // emissions; `source` records the actual collection channel
        // (enumerator / clerk / public-with-NIN — all flow through this worker).
        // NOTE: this branch only runs when status === 'active', which is exactly
        // when data.nin is truthy, so a `has_nin` detail would be a constant
        // `true` — omitted as redundant (Story 9-33 review L1).
        AuditService.logAction({
          actorId: submitterId ?? null,
          action: AUDIT_ACTIONS.DATA_CREATE,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: created.id,
          details: {
            source,
            creation_path: 'submission_queue_processor',
          },
        });
      }

      // Story 9-55 AC5 — NDPA evidentiary record of the captured guardian
      // consent for an under-15 registrant (enumerator / clerk path). Unlike the
      // best-effort sibling creation audits above, this evidentiary record is
      // AWAITED and its failure is logged loudly (`audit.*_failed`, AC5.3) so a
      // missing consent record is detectable — without undoing the INSERT that
      // already succeeded (M2 review fix).
      if (data.guardian) {
        await this.writeGuardianConsentAudit({
          respondentId: created.id,
          guardian: data.guardian,
          source,
          submitterId,
        });
      }

      return { id: created.id, _isNew: true, referenceCode, status };
    } catch (error: unknown) {
      // Handle race condition: PostgreSQL unique constraint violation (code 23505).
      const pgError = error as { code?: string; constraint?: string };

      // Story 9-58 (review M3) — a reference_code unique violation is
      // independent of NIN (it can trip on a pending-NIN insert too). Re-mint a
      // fresh server-side code and retry the insert (bounded), instead of
      // surfacing a raw Postgres error. Detect via the constraint name when
      // available; otherwise infer it (a 23505 that is NOT the NIN index — i.e.
      // no NIN supplied — must be the reference_code index).
      const isRefCodeViolation =
        pgError.code === '23505' &&
        (pgError.constraint?.includes('reference_code') ||
          (!pgError.constraint && !data.nin));
      if (isRefCodeViolation && attempt < MAX_REF_CODE_RETRIES) {
        referenceCode = await ReferenceCodeService.generateUnique(db);
        continue;
      }

      // Reject instead of linking (AC 3.7.7). Only meaningful when NIN was
      // supplied — pending-NIN inserts cannot trip the partial NIN unique index.
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

  /**
   * Story 9-12 Task 3.5 — Race-resolution merge.
   *
   * Looks for an existing pending-NIN respondent whose normalised name+phone
   * triple matches the incoming submission. On match, atomically updates that
   * row to active with the new NIN — preserving the original `submitter_id`
   * (productivity credit policy D3: outreach > data-entry).
   *
   * The UPDATE filters on `status = 'pending_nin_capture' AND nin IS NULL`,
   * so concurrent merge attempts are race-safe — only the first transaction
   * wins; the second sees zero rows updated and falls through to a fresh
   * insert (which then trips the partial unique index → standard 23505 path).
   *
   * Returns the promoted row on success, null on miss / missing-fields.
   */
  private static async tryRaceResolutionMerge(args: {
    nin: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string | null;
    submitterId?: string;
    source?: RespondentSource;
    guardian?: GuardianData | null;
  }): Promise<{ id: string } | null> {
    const { nin, firstName, lastName, phoneNumber, submitterId, source, guardian } = args;

    // All three identity fields are required for a safe merge. If any is
    // missing the merge is silently skipped — caller falls through to insert.
    if (!firstName || !lastName || !phoneNumber) {
      return null;
    }

    // Story 9-55 (M1 review fix) — when the promoted submission carries captured
    // guardian consent (under-15 registrant), fold it into the existing row's
    // metadata as part of the same atomic UPDATE so the merge path persists the
    // consent record exactly like the fresh-insert path. JSONB `||` preserves
    // any sibling metadata keys (e.g. defer_reason_nin) while setting `guardian`.
    const guardianMetadataSet = guardian
      ? sql`,
        "metadata" = COALESCE("metadata", '{}'::jsonb) || ${JSON.stringify({ guardian })}::jsonb`
      : sql``;

    // Atomic match-and-promote. The UPDATE itself enforces the
    // status/nin-IS-NULL guard so concurrent attempts cannot both succeed.
    const result = await db.execute(sql`
      UPDATE "respondents"
      SET
        "nin" = ${nin},
        "status" = 'active',
        "updated_at" = now()${guardianMetadataSet}
      WHERE
        "id" = (
          SELECT "id" FROM "respondents"
          WHERE "status" = 'pending_nin_capture'
            AND "nin" IS NULL
            AND lower("first_name") = lower(${firstName})
            AND lower("last_name") = lower(${lastName})
            AND "phone_number" = ${phoneNumber}
          LIMIT 1
        )
        AND "status" = 'pending_nin_capture'
        AND "nin" IS NULL
      RETURNING "id"
    `);

    const rows = (result as unknown as { rows: Array<{ id: string }> }).rows;
    if (!rows || rows.length === 0) {
      return null;
    }

    const promotedId = rows[0].id;

    AuditService.logAction({
      actorId: submitterId ?? null,
      action: AUDIT_ACTIONS.PENDING_NIN_PROMOTED,
      targetResource: AUDIT_TARGETS.RESPONDENT,
      targetId: promotedId,
      details: { trigger: 'race_resolution_merge' },
    });

    // Story 9-55 (M1 review fix) — write the NDPA consent audit on the merge
    // path too, so a minor whose NIN-completion promotes an existing pending row
    // still gets the MINOR_GUARDIAN_CONSENT_CAPTURED evidentiary record.
    if (guardian) {
      await this.writeGuardianConsentAudit({
        respondentId: promotedId,
        guardian,
        source,
        submitterId,
        trigger: 'race_resolution_merge',
      });
    }

    logger.info({
      event: 'submission_processing.pending_nin_promoted',
      respondentId: promotedId,
      trigger: 'race_resolution_merge',
    });

    return { id: promotedId };
  }

  /**
   * Story 9-55 AC5 / AC5.3 (M2 review fix) — write the NDPA evidentiary record
   * of a captured under-15 guardian consent for the async (enumerator / clerk)
   * ingestion path. Unlike the best-effort sibling creation audits, this is
   * AWAITED and its failure is surfaced loudly via `audit.*_failed` so a missing
   * consent record is detectable — while still NOT undoing the INSERT/merge that
   * already succeeded (the established criticality pattern for a post-commit
   * worker audit; the synchronous wizard path remains fully transactional).
   */
  private static async writeGuardianConsentAudit(args: {
    respondentId: string;
    guardian: GuardianData;
    source?: RespondentSource;
    submitterId?: string;
    trigger?: string;
  }): Promise<void> {
    try {
      await AuditService.logAction({
        actorId: args.submitterId ?? null,
        action: AUDIT_ACTIONS.MINOR_GUARDIAN_CONSENT_CAPTURED,
        targetResource: AUDIT_TARGETS.RESPONDENT,
        targetId: args.respondentId,
        details: {
          ...(args.source ? { source: args.source } : {}),
          ...(args.trigger ? { trigger: args.trigger } : {}),
          guardianName: args.guardian.name,
          guardianRelationship: args.guardian.relationship,
          guardianPhone: args.guardian.phone,
          isSupervisedApprentice: args.guardian.isSupervisedApprentice,
        },
      });
    } catch (err) {
      logger.error({
        event: 'audit.minor_guardian_consent_captured_failed',
        respondentId: args.respondentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Story 9-58 — proactive registration-confirmation email for an
   * enumerator/clerk-entered respondent who supplied an email. Carries the
   * human-friendly reference code + plain-language status + a pointer to the
   * self-service status check. NO magic-link (the respondent didn't initiate
   * this; they self-serve a secure link via /check-registration if needed) and
   * an explicit anti-phishing line. Fully best-effort: any failure is logged,
   * never thrown (ingestion must not depend on email).
   */
  private static readonly STATUS_CONFIRMATION_TEXT: Record<string, string> = {
    active: 'Active — your registration is complete.',
    pending_nin_capture: 'Pending — we still need your NIN to finish your registration.',
    nin_unavailable: 'Pending — your details are saved.',
    imported_unverified: 'On file — your record is awaiting verification.',
  };

  private static async sendReferenceConfirmationEmail(args: {
    respondentId: string;
    email: string;
    referenceCode: string;
    status: RespondentStatus | string;
  }): Promise<void> {
    try {
      // Story 9-58 (review L1) — explicit idempotency guard: only send when the
      // respondent has no `metadata.confirmation_email_sent_at` stamp. Makes the
      // "send once" guarantee a stored fact rather than emergent from the
      // `_isNew` flag (which a re-run on a partially-processed submission could
      // in theory mis-evaluate). Set the stamp AFTER a successful dispatch.
      const existing = await db.query.respondents.findFirst({
        where: eq(respondents.id, args.respondentId),
        columns: { metadata: true },
      });
      const existingMetadata = (existing?.metadata ?? null) as RespondentMetadata | null;
      if (existingMetadata?.confirmation_email_sent_at) {
        logger.info({
          event: 'registration_confirmation.email_skipped_already_sent',
          respondentId: args.respondentId,
        });
        return;
      }

      const brand = '#9C1E23';
      const statusText =
        SubmissionProcessingService.STATUS_CONFIRMATION_TEXT[args.status] ??
        'Your registration is on file.';
      const checkUrl = `${process.env.SUPPORT_URL || 'https://oyoskills.com'}/check-registration`;
      const subject = "You've been registered — Oyo State Skills Registry";
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${brand}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour &amp; Skills Registry</p>
  </div>
  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <p>You've been registered in the Oyo State Skills Registry.</p>
    <p style="font-weight: bold;">${statusText}</p>
    <p style="margin:20px 0;padding:12px 16px;background:#f6f6f6;border-radius:6px;font-size:14px;">Your application reference: <strong style="font-family:ui-monospace,monospace;letter-spacing:0.5px;">${args.referenceCode}</strong></p>
    <p style="color: #666; font-size: 14px;">Quote this reference if you contact support, or check your status anytime at <a href="${checkUrl}" style="color: ${brand};">${checkUrl}</a>.</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    <p style="color: #999; font-size: 12px;">We will never ask for your password or NIN by email.</p>
    <p style="color: #999; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} Government of Oyo State. All rights reserved.</p>
  </div>
</body></html>`;
      const text = `You've been registered in the Oyo State Skills Registry.\n\n${statusText}\n\nYour application reference: ${args.referenceCode}\n\nQuote this reference if you contact support, or check your status anytime at ${checkUrl}.\n\nWe will never ask for your password or NIN by email.\n\n— Oyo State Labour & Skills Registry`;

      const result = await EmailService.sendGenericEmail({ to: args.email, subject, html, text });
      if (!result.success) {
        logger.warn({ event: 'registration_confirmation.email_failed', error: result.error });
        return;
      }

      // Story 9-58 (review L1) — stamp the explicit idempotency marker only after
      // a confirmed dispatch. JSONB `||` preserves any sibling metadata keys
      // (guardian, normalisation_warnings, etc.). A failure to record the stamp
      // is logged but never thrown (ingestion must not depend on email).
      await db.execute(sql`
        UPDATE "respondents"
        SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${JSON.stringify({ confirmation_email_sent_at: new Date().toISOString() })}::jsonb
        WHERE "id" = ${args.respondentId}
      `);
    } catch (err) {
      logger.warn({
        event: 'registration_confirmation.email_error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

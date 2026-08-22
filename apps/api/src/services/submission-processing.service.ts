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
  findRespondentByIdentity,
  promoteRespondentToActive,
} from './respondent-identity.js';
import {
  normaliseFullName,
  normaliseNigerianPhone,
  normaliseDate,
  isStorableNigerianPhone,
  RESPONDENT_PHONE_CONSTRAINT,
} from '../lib/normalise/index.js';
import { evaluateMinorGuardianConsent, isValidReferenceCode, type GuardianData } from '@oslsr/utils';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from './audit.service.js';
import { ReferenceCodeService } from './reference-code.service.js';
import { canonicalizeLgaId } from './lga-canonical.service.js';
import { EmailService } from './email.service.js';
import { getSuppressedEmails } from './email-events.service.js'; // Story 13-12 (13-9 suppression)
import { buildThankYouEmail, buildThankYouReferralUrl, firstNameFrom } from './thankyou-email.js'; // Story 13-12
import { recordAutoSendFailure } from './email-autosend-monitor.js'; // Story 13-21 (AC4)
// Story 13-46 (AC2) — the SAME gap query + gap constant the four blast/backfill scripts inherit via
// `filterMarketingCohort`; this is the one in-request path that never consumed it.
import { getRecentlyContactedEmails, resolveGapDays } from './campaign-contact.service.js';
import { toCanonicalEmail } from '../lib/canonical-email.js';
import {
  recordRegistrationAutoSend,
  recordThankYouSuppressed,
} from '../middleware/registration-burst.js'; // Story 13-46 (AC3 / review A3)

/**
 * Story 13-46 (review A3) — the ONLY category the auto thank-you's gap read considers.
 * Deliberately NOT the whole marketing set; see the block in `sendThankYouReferralEmail`.
 */
const AUTO_SEND_GAP_CATEGORY = 'thankyou-referral';
import pino from 'pino';

const logger = pino({ name: 'submission-processing-service' });

/**
 * Convention-based field mapping from rawData question names to respondent fields.
 *
 * ⚠️ MOVED to `respondent-field-map.ts` by Story 13-57 and re-exported here, so
 * every existing importer keeps working. It moved because AC5's publish/pin
 * guard has to assert against THIS map — that is what stops the guard drifting
 * from the consumer it protects — and importing it from here would have dragged
 * the whole ingestion service (db, queues, email, audit) into the form-publish
 * and settings-write paths.
 */
import { RESPONDENT_FIELD_MAP } from './respondent-field-map.js';
export { RESPONDENT_FIELD_MAP };

/**
 * Maps user role names to respondent source types. **EVERY role in the `roles` table must appear
 * here** — see the fallback in `determineSubmitterRole`.
 *
 * 13-4 R1 (adjudication, 2026-08-06): this map held three of the seven roles that exist on prod,
 * and the fallback was `?? 'enumerator'`. That was harmless while `source` was only a label. It
 * stopped being harmless the moment AC1b made `source` decide **whether the identity merge is
 * skipped** — `super_admin` (2 real users), `government_official`, `supervisor` and
 * `verification_assessor` were all silently exempted, and all four were being written to
 * `respondents.source` as `'enumerator'`, which analytics reads as field capture.
 *
 * The rule that resolves it: **the only role that is not staff is `public_user`.** Anyone else
 * holding a role is submitting on someone else's behalf, which is clerk-shaped data entry — a
 * stack of forms from one compound, sharing a handset and surnames. So they map to `clerk`:
 * accurate as a label, and correct for the merge exemption.
 */
const ROLE_TO_SOURCE: Record<string, RespondentSource> = {
  'public_user': 'public',
  'enumerator': 'enumerator',
  'data_entry_clerk': 'clerk',
  // Staff who may key a submission on someone's behalf. Not field enumerators, but the DATA has
  // the same shape (see STAFF_CAPTURED_SOURCES), which is what the exemption turns on.
  'super_admin': 'clerk',
  'government_official': 'clerk',
  'supervisor': 'clerk',
  'verification_assessor': 'clerk',
};

/**
 * Story 13-4 AC1b — sources where a STAFF MEMBER captured the submission on someone else's
 * behalf, and is therefore exempt from the R13 no-NIN identity merge (see the guard below).
 *
 * ⚠️ BRANCH ON SOURCE, NEVER ON `submitterId` ALONE. An authenticated `public_user` carries a
 * submitterId too (`determineSubmitterRole` maps it to source `public`), and a public user
 * re-registering themselves is precisely the case R13 exists to catch. Widening this to "any
 * submitterId" reinstates the defect that gave 7 citizens two records on 2026-08-04.
 *
 * WHY `clerk` IS IN HERE WHEN AC1b ONLY NAMED `enumerator` (code review M2, 2026-08-06)
 * -------------------------------------------------------------------------------------
 * The first draft justified the set with "a human is standing in the room", which is TRUE of an
 * enumerator and FALSE of a `data_entry_clerk` keying paper forms in an office. The rationale was
 * wrong; the membership is still right, for a different reason.
 *
 * What actually decides this is the SHAPE OF THE DATA, not the presence of a witness. The R13
 * threshold assumes one-person-one-handset — the distribution of SELF registration. A clerk keys a
 * stack of paper forms collected from a compound, and that stack carries the same shared handset
 * and the same shared surnames as the enumerator's tablet does. Merging two citizens is the worse
 * error in both channels; only `public` (a person submitting for themselves, where a name+phone
 * repeat really does mean a repeat) keeps the merge.
 *
 * The cost is accepted with eyes open: a clerk who double-keys the SAME paper form now mints a
 * duplicate that R13 used to absorb. That is the documented trade ("better one duplicate than a
 * wrong-person merge"), it is recoverable via Story 9-11 reconciliation, and it is no longer
 * invisible — every skipped merge emits `identity_match_exempted_staff_capture` below.
 *
 * 13-53 — THIS SET NOW GOVERNS BOTH DIRECTIONS. It began as an exemption from the no-NIN attach;
 * it now also exempts the NIN-ARRIVAL promote, because the reason is identical and does not depend
 * on which side carries the NIN: a shared handset plus a shared surname is ordinary in a compound,
 * and collapsing two household members into one record is the worse error either way.
 */
const STAFF_CAPTURED_SOURCES: ReadonlySet<RespondentSource> = new Set<RespondentSource>([
  'enumerator',
  'clerk',
]);

/**
 * Permanent processing error — should NOT be retried by BullMQ.
 *
 * ⭐ `constraint` (Story 13-57 AC2.2, added by code review 2026-08-14 M1).
 * AC2.2 asks the ERROR log to carry "the constraint that rejected it", and
 * `constraintOf()` reads that off the Postgres error object. But the AC1 guard
 * deliberately throws BEFORE the insert — which is the whole point, a value the
 * column would refuse never reaches it — so Postgres never gets to name the
 * constraint, and the field the AC asked for was `null` for exactly the failure
 * class the AC was written about. The thrower names it instead: it is the same
 * fact, and it is the one an operator needs to act without opening the code.
 */
export class PermanentProcessingError extends Error {
  /** Read by `constraintOf()`; matches the shape of a `pg` error. */
  readonly constraint?: string;

  constructor(message: string, constraint?: string) {
    super(message);
    this.name = 'PermanentProcessingError';
    if (constraint) this.constraint = constraint;
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
 * Story 13-57 (AC1/AC2) — a normalised field the destination column cannot
 * accept. Carries enough to be the `processing_error` reason verbatim.
 */
export interface PiiRejection {
  /** Destination column, snake_case, as it appears in the CHECK constraint. */
  field: string;
  /** The normaliser's own warnings, so the reason names the mechanism. */
  warnings: string[];
  /** The value as submitted — never the canonicalised attempt. */
  rawValue: string;
  /**
   * The CHECK constraint that WOULD have refused this value (AC2.2). Named by
   * the guard rather than by Postgres, because the guard fires first — see
   * `PermanentProcessingError`.
   */
  constraint: string;
}

/**
 * Normalise the PII fields on extracted respondent data prior to insert.
 *
 * Returns the canonical values, a metadata object containing any normalisation
 * warnings (or `null` if no warnings fired), and — Story 13-57 — the list of
 * fields whose canonical value the destination column would REJECT. Exported
 * for direct unit testing; consumed by `findOrCreateRespondent`.
 *
 * Warning codes are field-prefixed (`first_name:all_caps`, `phone_number:...`)
 * so the audit-log viewer (Story 9-11) can filter by `(field, code)` tuple.
 *
 * ⭐ STORY 13-57 AC1 — THE CONTRACT COLLISION, AND WHICH SIDE GIVES WAY.
 *
 * `normaliseNigerianPhone` returns the RAW input when it cannot canonicalise
 * ("Return the canonical-attempt anyway so back-fill can flag the row"), and
 * that contract is deliberate and depended upon — it is NOT changed here. What
 * was wrong is that this function then handed the raw value to a caller which
 * writes it into a column carrying `CHECK (phone_number ~ '^\+234\d{10}$')`.
 * The insert threw, the submission was left `processed = false`, and nothing
 * retried, alerted or logged an actionable error. Two rows sat like that for
 * five days in August 2026 and were found by accident.
 *
 * So the never-lose-the-row contract keeps its return value, and the CALLER
 * learns that the value is unstorable — via `rejections` — before it can write
 * it. The rejected field is reported, not silently blanked: a phone number is
 * how the register reaches a citizen and how the identity guard recognises
 * them, so NULL-filling it would turn a loud failure into a quiet
 * data-loss (and this story exists because quiet is the defect).
 */
export function normaliseRespondentPii(data: ExtractedRespondentData): {
  canonical: {
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null;
    phoneNumber: string | null;
  };
  metadata: RespondentMetadata | null;
  rejections: PiiRejection[];
} {
  const warnings: string[] = [];
  const rejections: PiiRejection[] = [];
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
    // Test the OUTPUT SHAPE against the column's CHECK, not the warning list —
    // `unknown_mobile_prefix` warns about a perfectly storable value, and a
    // future warning code would otherwise silently escape this guard.
    if (!isStorableNigerianPhone(canonical.phoneNumber)) {
      rejections.push({
        field: 'phone_number',
        warnings: r.warnings,
        rawValue: data.phoneNumber,
        constraint: RESPONDENT_PHONE_CONSTRAINT,
      });
    }
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

  return { canonical, metadata, rejections };
}

/**
 * Story 13-57 AC1.2/AC2.2 — the stable reason string written to
 * `submissions.processing_error` and carried on the ERROR log.
 *
 * Prefixed `UNPROCESSABLE_INPUT` so it is greppable next to the pre-existing
 * `NIN_DUPLICATE*` reasons, and it names the column that refused the value so
 * an operator can act without opening the code.
 */
export function describePiiRejections(rejections: PiiRejection[]): string {
  const parts = rejections.map(
    (r) => `${r.field} (${r.warnings.join(', ') || 'not canonicalisable'})`,
  );
  return `UNPROCESSABLE_INPUT: ${parts.join('; ')} — the value could not be canonicalised to the shape respondents requires, so it was not written`;
}

/**
 * The constraint to report for a rejection set (AC2.2). One rejection, one
 * constraint; more than one and the log names them together rather than
 * silently picking a winner.
 */
export function constraintForRejections(rejections: PiiRejection[]): string | undefined {
  const names = [...new Set(rejections.map((r) => r.constraint))];
  return names.length > 0 ? names.join(', ') : undefined;
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

    logger.info({
      event: 'submission_processing.processed',
      submissionId,
      respondentId: respondent.id,
      enumeratorId,
      submitterRole,
      isNewRespondent: respondent._isNew,
    });

    // Story 13-27 (AC1/AC2) — ALL post-submission side-effects (auto-emails +
    // GPS-gated fraud detection + consent-gated marketplace extraction) now route
    // through ONE shared entrypoint so the enumerator/clerk QUEUE path (here) and
    // the public WIZARD path (registration.controller.submitWizard — which writes
    // its submission as processed:true and DELIBERATELY bypasses this worker) run
    // the identical set. Previously marketplace extraction lived ONLY here, so the
    // whole public channel never queued a profile (124 opted in → 0 profiles; the
    // 3rd bypass victim after 13-21 emails + 13-23 form-binding). Awaited here so
    // the worker's semantics are unchanged (a queue failure surfaces as before);
    // the wizard calls it fire-and-forget with a .catch (a comms/queue failure
    // must never sink a committed registration — the 9-26 data-integrity lesson).
    const autoEmailRaw = rawData['email'] ?? rawData['email_address'];
    const autoEmail =
      typeof autoEmailRaw === 'string' && autoEmailRaw.includes('@') ? autoEmailRaw.trim() : null;
    await this.runPostSubmissionSideEffects({
      respondentId: respondent.id,
      submissionId,
      email: autoEmail,
      referenceCode: respondent.referenceCode,
      status: respondent.status ?? 'active',
      isNew: respondent._isNew,
      consentMarketplace: respondentData.consentMarketplace,
      gps:
        submission.gpsLatitude != null && submission.gpsLongitude != null
          ? { latitude: submission.gpsLatitude, longitude: submission.gpsLongitude }
          : null,
    });

    return {
      action: 'processed',
      submissionId,
      respondentId: respondent.id,
    };
  }

  /**
   * Determine the respondent source type from the submitter's user role.
   * Maps role names to respondent source: enumerator→'enumerator', data_entry_clerk→'clerk',
   * public_user→'public', all other staff roles→'clerk'. No submitter / no user / no role
   * → 'public'. An UNMAPPED role name logs an ERROR and falls back to 'clerk' (13-4 R1).
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

      const mapped = ROLE_TO_SOURCE[role.name];
      if (mapped) return mapped;

      /**
       * 13-4 R1 — an UNMAPPED role means a role was added to the database without updating
       * ROLE_TO_SOURCE. That is a code change waiting to happen, so it is logged at ERROR, not
       * swallowed: the previous silent `?? 'enumerator'` is exactly how four roles came to be
       * mislabelled and exempted without anyone deciding it.
       *
       * The fallback is `clerk`, chosen on the two axes separately:
       *   - LABEL: the holder has a role, so they are staff; `clerk` is nearer the truth than
       *     `enumerator` (which asserts fieldwork) or `public` (which asserts self-registration).
       *   - MERGE: `clerk` is staff-captured, so the merge is SKIPPED. That is the safe direction —
       *     the standing trade is "better one duplicate than two citizens collapsed into one",
       *     and a duplicate is recoverable while a wrong-person merge is not.
       */
      logger.error(
        {
          event: 'submission_processing.unmapped_role',
          roleName: role.name,
          submitterId,
        },
        'Role is not in ROLE_TO_SOURCE — defaulting to `clerk` (staff-captured, merge skipped). ' +
          'Add it to the map: `source` is written to respondents and now also decides the ' +
          'R13 identity-merge exemption (13-4 R1).',
      );
      return 'clerk';
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

    /**
     * ⭐ STORY 13-57 AC4 — THE SILENT `false`, WHICH IS THE SAME DEFECT ONE
     * FIELD OVER.
     *
     * `=== 'yes'` means anything that is not exactly `yes` becomes `false`, and
     * a coerced `false` is INDISTINGUISHABLE from a person who actually
     * declined. A renamed choice value, a `Yes ` with a trailing space, a
     * localised label — each silently removes someone from the marketplace they
     * agreed to join, and nothing anywhere says so. Exactly the shape of the
     * phone failure this story exists for: input the boundary cannot interpret,
     * absorbed without a word.
     *
     * ⚠️ THE DEFAULT IS NOT FLIPPED, DELIBERATELY (AC4.2). `false` is the right
     * answer for a privacy consent we could not read — the harm of wrongly
     * publishing someone's details is not symmetric with the harm of wrongly
     * withholding them. (Contrast `EMAIL_TIER`, where the safe default WAS the
     * permissive one; what differs is who is hurt by a wrong guess.) The defect
     * is the SILENCE, and only the silence is fixed here.
     *
     * ⚠️ AN ABSENT ANSWER IS NOT LOGGED, ALSO DELIBERATELY. AC4.1 is scoped to
     * "the answer parses to neither yes nor no" — a question that was never
     * shown (a `showWhen` branch, a section skipped for an under-15) has no
     * answer to misread, and logging those would bury the real signal in noise
     * the operator learns to skip. A field that is missing when it should be
     * present is AC5's job, at publish/pin time, where it can still be fixed.
     */
    const rawConsentMarketplace = extracted['consentMarketplace'];
    if (rawConsentMarketplace != null && rawConsentMarketplace !== '') {
      const normalised = String(rawConsentMarketplace).toLowerCase().trim();
      if (normalised !== 'yes' && normalised !== 'no') {
        logger.warn(
          {
            event: 'marketplace.consent_unparsed',
            rawValue: String(rawConsentMarketplace),
            interpretedAs: consentMarketplace,
          },
          'A marketplace-consent answer parsed to neither yes nor no and was therefore ' +
            'treated as a decline. That is the safe direction, but it is a GUESS — the ' +
            'person may have opted in. Check the form\'s choice list (Story 13-57 AC4).',
        );
      }
    }

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
    const { canonical, metadata, rejections } = normaliseRespondentPii(data);

    /**
     * Story 13-57 AC1.1 — a value the normaliser could NOT canonicalise never
     * reaches `respondents`.
     *
     * This throws BEFORE the identity lookups as well as before the insert, and
     * that ordering is deliberate: `findRespondentByIdentity` matches on
     * `phone_number`, so a raw un-normalised phone would also be a lookup that
     * cannot match — it would fall through to a fresh insert and mint a
     * duplicate on the way to failing. Rejecting first makes the failure one
     * event with one reason.
     *
     * `PermanentProcessingError` (not a bare throw) is what routes this to
     * AC2's terminal state: the queue worker records the reason on the
     * submission and stops retrying, because no number of retries will make
     * `+234 0812…` fit a column that requires ten digits after the country code.
     */
    if (rejections.length > 0) {
      throw new PermanentProcessingError(
        describePiiRejections(rejections),
        // AC2.2 — name the constraint ourselves; we threw before Postgres could.
        constraintForRejections(rejections),
      );
    }

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

      /**
       * 13-53 — THE SAME SEAM, ON THIS PATH.
       *
       * `tryRaceResolutionMerge` above already handles "NIN arrives later", but only on STRICT
       * equality of lower(first)+lower(last)+phone. That is the identity key R13 tried FIRST and
       * abandoned: it caught NONE of four real collisions, because surname-first is normal here
       * and middle names come and go. So a strict miss is not evidence that we do not hold this
       * person — `Bashiru / Yusuff Titilope` returning as `Yusuff / Bashiru` misses it and mints a
       * second record, which is exactly what happened on the wizard.
       *
       * Same lookup, same NIN-less restriction, same promote — and the same staff-capture
       * exemption, which matters MORE here than anywhere: this path is where enumerators and
       * clerks land, and 13-4 AC1b exists because a household shares a handset and a surname.
       * Regressing that would be a worse outcome than the bug this fixes.
       */
      if (canonical.firstName && canonical.lastName && canonical.phoneNumber) {
        const ninlessSelf = await findRespondentByIdentity(
          db,
          {
            firstName: canonical.firstName,
            lastName: canonical.lastName,
            phoneNumber: canonical.phoneNumber,
          },
          { requireNoNin: true },
        );

        if (ninlessSelf && STAFF_CAPTURED_SOURCES.has(source)) {
          // The lookup ran deliberately even though the answer is "do not merge" — see the
          // no-NIN sibling below. The counterfactual is the denominator that makes the exemption
          // reviewable instead of an article of faith.
          logger.info(
            {
              event: 'submission_processing.identity_match_exempted_staff_capture',
              // 13-53 — the exemption now has two triggers. Same event name so the 13-4 runbook
              // grep still finds both, `trigger` so they stay separately countable.
              trigger: 'nin_arrival',
              wouldHaveMergedInto: ninlessSelf.id,
              referenceCode: ninlessSelf.referenceCode,
              existingStatus: ninlessSelf.status,
              source,
              submitterId: submitterId ?? null,
            },
            'A NIN-bearing staff-captured submission matched an existing NIN-LESS respondent on ' +
              'name + phone, but was NOT promoted — a household shares a handset (13-4 AC1b). ' +
              'Creating a distinct record.',
          );
        } else if (ninlessSelf) {
          /**
           * 13-55 — the promote and its audit row are now ONE call inside ONE transaction.
           *
           * Before, the UPDATE ran on bare `db` and the audit was a fire-and-forget
           * `AuditService.logAction` immediately after it: a `void`-returning call that cannot be
           * awaited, so the promote could commit with its evidentiary row still in flight. The
           * 13-49 AC14 batch proved that is not theoretical — 10 promotions, 9 audit rows.
           *
           * ⚠️ KEEPS `nin_arrival_identity_match`. The wizard took the new `nin_arrival_wizard`
           * label instead, because THIS path's rows already exist on production and renaming a
           * trigger orphans every historical row that carries it.
           */
          // Resolved BEFORE the transaction opens. Both are independent reads, and doing them
          // inside would hold the promote's transaction open across unrelated round-trips.
          // Review M1 — only minted when the held record actually lacks a code, so the normal
          // path costs nothing. Without it a promoted respondent can end up with no reference
          // code at all and the caller echoes `undefined`.
          const promoteReferenceCode =
            ninlessSelf.referenceCode ??
            data.referenceCode ??
            (await ReferenceCodeService.generateUnique(db));
          // Review L3 — the LGA goes through the SAME canonicaliser the insert below uses
          // (`:813`); filling a blank with a raw client string would poison the row the
          // fresh-insert path protects.
          const promoteLgaId = (await canonicalizeLgaId(data.lgaId)) ?? null;
          // Captured out here because TypeScript's narrowing of `data.nin` (a mutable property)
          // does not survive into the transaction callback below.
          const arrivingNin = data.nin;

          const promotedByIdentity = await db.transaction(async (tx) =>
            promoteRespondentToActive(tx, {
              respondentId: ninlessSelf.id,
              nin: arrivingNin,
              trigger: 'nin_arrival_identity_match',
              actorId: submitterId ?? null,
              auditDetails: { source },
              // Review H2 — the sibling merge below folds guardian consent into the promoted row
              // (9-55 M1, added because a promote path was dropping it). This is the same promote
              // on a fuzzier key; dropping it here would reproduce the bug that fix closed.
              guardian: data.guardian ?? null,
              fallbackReferenceCode: promoteReferenceCode,
              // NULL-fill only; COALESCE cannot overwrite what the record already holds.
              dateOfBirth: canonical.dateOfBirth ?? null,
              lgaId: promoteLgaId,
            }),
          );
          if (promotedByIdentity) {
            logger.info(
              {
                event: 'submission_processing.promoted_existing_identity_on_nin_arrival',
                respondentId: promotedByIdentity.id,
                referenceCode: promotedByIdentity.referenceCode,
                promotedStatus: promotedByIdentity.status,
                source,
              },
              'A NIN-bearing submission matched an existing NIN-LESS respondent on phone + name ' +
                'tokens — filling the NIN in place and keeping the ORIGINAL reference code ' +
                'instead of creating a second record (13-53)',
            );
            // 13-55 — the PENDING_NIN_PROMOTED row used to be written here with the un-awaitable
            // `logAction`. It is now written by the promote itself, inside the promote's own
            // transaction, so it cannot be lost.
            /**
             * Review H2 — the 9-55 AC5 evidentiary record, on THIS promote too.
             *
             * `tryRaceResolutionMerge` writes it (`:1000`) and the fresh-insert path writes it
             * (`:872`); the first cut of this branch wrote it nowhere, so an under-15 whose NIN
             * arrived on a fuzzy match would have had their guardian consent persisted to the row
             * (above) with NO audit record of the capture. AWAITED and loudly-failing, exactly as
             * its siblings are — a missing consent record must be detectable.
             */
            if (data.guardian) {
              await this.writeGuardianConsentAudit({
                respondentId: promotedByIdentity.id,
                guardian: data.guardian,
                source,
                submitterId,
                trigger: 'nin_arrival_identity_match',
              });
            }
            return {
              id: promotedByIdentity.id,
              _isNew: false,
              referenceCode: promotedByIdentity.referenceCode ?? undefined,
              status: promotedByIdentity.status as RespondentStatus,
            };
          }
          // Lost the race (the row gained a NIN between read and write) — fall through to a fresh
          // insert, exactly as the strict merge above does.
        }
      }
    }

    /**
     * R13 — THE MIRROR OF THE RACE-RESOLUTION MERGE, AND THE GAP THAT DUPLICATED 7 CITIZENS.
     *
     * The FR21 branch above only runs `if (data.nin)`. A submission arriving WITHOUT a NIN was
     * therefore deduped against nothing at all, no matter how complete a record we already held
     * for that person — the docblock's "the dedup checks are skipped" is doing more work than it
     * looks. On 2026-08-04 the 13-49 adoption programme created records for 174 people and 7 of
     * them then registered again through the no-NIN path within 90 minutes, each minting a
     * SECOND respondent with a SECOND reference code. Five had to be deleted and seven people
     * written to.
     *
     * `tryRaceResolutionMerge` already solved the opposite direction (NIN arrives later for a
     * pending row) and its identity key is the precedent reused here verbatim: strict equality
     * on lower(first_name) + lower(last_name) + phone_number, ALL THREE REQUIRED. A missing or
     * mistyped field falls through to a fresh insert, which is the documented trade — "better
     * one duplicate than a wrong-person merge", and a supervisor can reconcile via Story 9-11.
     *
     * Deliberately NOT a rejection. The NIN branch throws NIN_DUPLICATE because a duplicate NIN
     * is an identity conflict a human must see. This is a person re-submitting their own details
     * with less information than we already have: attaching the submission to their existing
     * record is the correct, silent outcome. Nothing on the existing row is overwritten — an
     * incoming row with no NIN has nothing to add, and clobbering an `active` record with
     * pending-shaped data is the one thing worse than a duplicate.
     *
     * `rolled_back` rows are excluded: they are soft-deleted and must not adopt new submissions.
     */
    if (!data.nin && canonical.firstName && canonical.lastName && canonical.phoneNumber) {
      // Shared with the public wizard — see services/respondent-identity.ts. It lived HERE only
      // and the wizard bypasses this function entirely, so the guard never ran on the path that
      // produced every duplicate this register has had (R21).
      const match = await findRespondentByIdentity(db, {
        firstName: canonical.firstName,
        lastName: canonical.lastName,
        phoneNumber: canonical.phoneNumber,
      });

      if (match && STAFF_CAPTURED_SOURCES.has(source)) {
        /**
         * 13-4 AC1b — DO NOT ATTACH, BUT DO RECORD THAT WE WOULD HAVE.
         *
         * The lookup deliberately still ran. R21's lesson was that a guard which never executes
         * is indistinguishable from a guard that finds nothing — the only evidence either way was
         * a counter reading zero. This log line is the denominator: it makes "how often would a
         * staff-captured row have merged?" answerable, which is the measurement AC1b.3's fallback
         * (DOB match, or >=3 shared tokens) would have to be judged on if the exemption is ever
         * judged too broad.
         */
        logger.info(
          {
            event: 'submission_processing.identity_match_exempted_staff_capture',
            // 13-53 — the sibling trigger. See the `nin_arrival` case above.
            trigger: 'no_nin',
            wouldHaveMergedInto: match.id,
            referenceCode: match.referenceCode,
            existingStatus: match.status,
            source,
            submitterId: submitterId ?? null,
          },
          'A no-NIN staff-captured submission matched an existing respondent on name + phone, ' +
            'but was NOT attached — a household shares a handset and the enumerator is in the ' +
            'room (13-4 AC1b). Creating a distinct record.',
        );
      } else if (match) {
        logger.info(
          {
            event: 'submission_processing.no_nin_identity_match',
            respondentId: match.id,
            referenceCode: match.referenceCode,
            existingStatus: match.status,
            source,
          },
          'A no-NIN submission matched an existing respondent on name + phone — attaching ' +
            'instead of creating a second record (R13)',
        );
        return {
          id: match.id,
          _isNew: false,
          referenceCode: match.referenceCode ?? undefined,
          status: match.status as RespondentStatus,
        };
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

    // Story 13-16 (review M3) — respondents.lga_id is canonically the SLUG
    // (lgas.code). The live published form's lga_list still carries 6 retired
    // alias values until the 13-14 re-publish/re-pin, so canonicalize here
    // (fossil alias or stray UUID → slug) exactly like the public write-sites.
    const lgaSlug = (await canonicalizeLgaId(data.lgaId)) ?? null;

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
        lgaId: lgaSlug,
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

    /**
     * 13-55 — MATCH, THEN PROMOTE THROUGH THE SHARED IMPLEMENTATION.
     *
     * This was one statement: an `UPDATE … WHERE id = (SELECT … LIMIT 1)` that matched and promoted
     * together. It is now a locked SELECT followed by `promoteRespondentToActive`, inside one
     * transaction, and the concurrency guarantee is UNCHANGED-OR-STRONGER:
     *
     *   • `FOR UPDATE` takes a row lock, so a second arrival BLOCKS on the same candidate rather
     *     than racing it. The old form relied on the UPDATE's own re-assertion of
     *     `status/nin IS NULL` to make the loser see zero rows; that re-assertion is still there,
     *     inside the shared promote, so the loser branch is preserved exactly.
     *   • The identity key is UNTOUCHED — STRICT `lower(first)+lower(last)+phone`. 13-53 explains
     *     at `:616-627` why the fuzzy key sits BESIDE this one rather than replacing it, and
     *     loosening this to the token key would merge a household on a shared handset.
     *
     * What it gains: the `PENDING_NIN_PROMOTED` row is written by the same transaction that fills
     * the NIN. Before, this path had NO transaction at all and its audit was a fire-and-forget
     * `logAction` — the widest instance of the gap 13-55 exists to close.
     */
    const promotedId = await db.transaction(async (tx) => {
      const found = await tx.execute(sql`
        SELECT "id" FROM "respondents"
        WHERE "status" = 'pending_nin_capture'
          AND "nin" IS NULL
          AND lower("first_name") = lower(${firstName})
          AND lower("last_name") = lower(${lastName})
          AND "phone_number" = ${phoneNumber}
        LIMIT 1
        FOR UPDATE
      `);
      const candidateId = (found as unknown as { rows?: Array<{ id: string }> } | undefined)
        ?.rows?.[0]?.id;
      if (!candidateId) return null;

      const promoted = await promoteRespondentToActive(tx, {
        respondentId: candidateId,
        nin,
        trigger: 'race_resolution_merge',
        // Narrower than the NIN-arrival default, and deliberately so: this route's whole premise
        // is "a row that is still waiting for its NIN". `nin_unavailable` / `active` belong to the
        // arrival journey, not to this one.
        allowedStatuses: ['pending_nin_capture'],
        actorId: submitterId ?? null,
        auditDetails: { source },
        // Story 9-55 (M1) — fold captured guardian consent into the promoted row in the SAME
        // statement, so the merge path persists it exactly like the fresh-insert path.
        guardian: guardian ?? null,
      });
      return promoted?.id ?? null;
    });

    if (!promotedId) {
      return null;
    }

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
   * Story 13-27 (AC1/AC2) — the SINGLE post-submission side-effects entrypoint.
   *
   * Both the enumerator/clerk QUEUE path (`processSubmission`) and the public
   * WIZARD path (`registration.controller.submitWizard`, which writes its own
   * respondent + submission in a transaction and DELIBERATELY bypasses the queue
   * worker) call this ONCE the respondent + submission are durably committed, so
   * there is exactly one place every post-submission effect lives. This
   * generalises the 13-21 `sendRegistrationAutoEmails` shared-entrypoint pattern
   * to STOP the recurring "wizard silently skips a processSubmission side-effect"
   * bug class (13-21 emails, 13-23 form-binding, 13-27 marketplace).
   *
   * SIDE-EFFECT AUDIT (AC2) — every effect processSubmission performs, and how
   * the wizard path is covered:
   *   1. Link respondent + mark processed  — wizard does its OWN in-tx (writes
   *      processed:true); NOT shared here (wizard-native).
   *   2. Provenance audit (DATA_CREATE / PENDING_NIN_CREATED / guardian consent)
   *      — wizard emits its OWN in-tx (registration.controller); NOT shared here.
   *   3. Registration auto-emails (9-58 confirmation + 13-12 thank-you) — SHARED
   *      (13-21). Fire-and-forget; each send self-gates + is fail-soft.
   *   4. Marketplace extraction (consent-gated) — SHARED (13-27, the fix). Was
   *      queue-path-only → the whole public channel produced 0 profiles.
   *   5. Fraud detection (GPS-gated) — SHARED here but a NO-OP for the wizard:
   *      public wizard submissions carry no GPS (gps=null), so the gate never
   *      fires. AC4 (product, 2026-07-12): the GPS-clustering/speed-run engine
   *      keys on enumerator field-collection signals that don't exist for an
   *      anonymous public submission; NIN partial-unique is the duplicate defense.
   *      The controller.ts:658 skip is CORRECT — routing it through here keeps the
   *      code path uniform and future-proofs a wizard that ever captures GPS.
   *   6. PII normalisation / form-schema resolution — wizard is structured +
   *      pre-validated (controller.ts:658); INTENTIONALLY not run for the wizard.
   *
   * The emails are fired void (fail-soft internally); the GPS/consent QUEUE ops
   * are awaited so the queue worker preserves its existing throw-on-failure
   * behaviour. The wizard invokes this fire-and-forget (`void ...catch`) so a
   * transient queue/comms failure can never sink a committed registration.
   */
  static async runPostSubmissionSideEffects(args: {
    respondentId: string;
    submissionId: string;
    email: string | null;
    referenceCode?: string;
    // Story 13-27 (review L2) — the enum, not `| string`: both callers pass the
    // typed `respondents.status` column, so widening only lets a typo compile.
    // (`sendRegistrationAutoEmails` keeps `| string` for its own broader callers.)
    status?: RespondentStatus;
    isNew: boolean;
    consentMarketplace: boolean;
    gps?: { latitude: number; longitude: number } | null;
  }): Promise<void> {
    // 3. Registration auto-emails — fire-and-forget + internally fail-soft, so a
    //    slow/failing provider never delays (or sinks) the queue side-effects.
    void this.sendRegistrationAutoEmails({
      respondentId: args.respondentId,
      email: args.email,
      referenceCode: args.referenceCode,
      status: args.status ?? 'active',
      isNew: args.isNew,
    });

    // 5. Fraud detection — GPS-gated (no GPS ⇒ skipped; see AC4 note above).
    if (args.gps) {
      await queueFraudDetection({
        submissionId: args.submissionId,
        respondentId: args.respondentId,
        gpsLatitude: args.gps.latitude,
        gpsLongitude: args.gps.longitude,
      });
      logger.info({
        event: 'submission_processing.fraud_queued',
        submissionId: args.submissionId,
        respondentId: args.respondentId,
      });
    }

    // 4. Marketplace profile extraction — consent-gated (Story 13-27 fix). Fires
    //    for BOTH channels now; the worker self-gates on consent + UPSERTs by
    //    respondent, so a re-queue is idempotent.
    if (args.consentMarketplace) {
      await queueMarketplaceExtraction({
        respondentId: args.respondentId,
        submissionId: args.submissionId,
      });
      logger.info({
        event: 'submission_processing.marketplace_queued',
        submissionId: args.submissionId,
        respondentId: args.respondentId,
      });
    }
  }

  /**
   * Story 13-21 (AC1/AC2) — the SINGLE entrypoint for the two registration
   * auto-emails. Previously both were inlined in `processSubmission`, so the
   * PUBLIC WIZARD path (registration.controller.submitWizard) — which writes its
   * submission as `processed:true` and DELIBERATELY bypasses this worker — never
   * sent EITHER for the entire public channel (0/140 markers; 13-12's evergreen
   * thank-you was dead-on-arrival since it shipped). Both the queue path and the
   * wizard controller now call this, so there is one code path and no drift.
   *
   * Fully fire-and-forget + fail-soft: each send self-contains its try/catch and
   * never throws, and a failure records to the AC4 monitor (loud + counted). The
   * confirmation is gated on a NEW respondent carrying a reference code; the
   * thank-you self-gates on source='public' + the send-once marker + suppression.
   */
  static async sendRegistrationAutoEmails(args: {
    respondentId: string;
    email: string | null;
    referenceCode?: string;
    status?: RespondentStatus | string;
    isNew: boolean;
  }): Promise<void> {
    if (!args.email) return;
    // 9-58 reference-code confirmation — only for a NEW respondent with a code.
    if (args.isNew && args.referenceCode) {
      await this.sendReferenceConfirmationEmail({
        respondentId: args.respondentId,
        email: args.email,
        referenceCode: args.referenceCode,
        status: args.status ?? 'active',
      });
    }
    // 13-12 evergreen thank-you/referral — self-gates on source='public' inside.
    await this.sendThankYouReferralEmail({ respondentId: args.respondentId, email: args.email });
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
        // Story 13-21 (AC4) — was a swallowed warn; now a counted ERROR that can page.
        await recordAutoSendFailure({
          kind: 'confirmation',
          respondentId: args.respondentId,
          error: result.error,
        });
        return;
      }

      // Story 9-58 (review L1) — stamp the explicit idempotency marker only after
      // a confirmed dispatch. JSONB `||` preserves any sibling metadata keys
      // (guardian, normalisation_warnings, etc.).
      // Story 13-21 (review M1) — the email ALREADY dispatched successfully here;
      // a marker-stamp failure must NOT route through recordAutoSendFailure — that
      // would false-count a good send and could trip a spurious AC4 page. It DOES
      // risk a duplicate on the next backfill/re-process (the marker is the
      // idempotency guard), so log it loudly at warn. Own try so it can't reach
      // the outer send-failure catch.
      try {
        await db.execute(sql`
          UPDATE "respondents"
          SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${JSON.stringify({ confirmation_email_sent_at: new Date().toISOString() })}::jsonb
          WHERE "id" = ${args.respondentId}
        `);
      } catch (stampErr) {
        logger.warn({
          event: 'registration_confirmation.marker_stamp_failed',
          respondentId: args.respondentId,
          error: stampErr instanceof Error ? stampErr.message : String(stampErr),
        });
      }
    } catch (err) {
      // Story 13-21 (AC4) — a genuine pre/at-send failure: counted + loud.
      await recordAutoSendFailure({
        kind: 'confirmation',
        respondentId: args.respondentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Story 13-12 — evergreen thank-you + referral auto-send on end-to-end completion.
   * Gated to SELF-SERVICE (`source='public'`) completers (they hold the link + can refer peers;
   * enumerator/clerk/imported rows get the 9-58 confirmation instead). Idempotent via the
   * `metadata.thankyou_referral_sent_at` send-once marker; honors the 13-9 suppression list; tagged
   * `thankyou-referral-auto` (DISTINCT from the one-off blast) so the funnel separates organic
   * onboarding referrals from the campaign blast. Fully FAIL-SOFT — any error is logged, never thrown
   * (a registration must succeed even if this email doesn't), mirroring sendReferenceConfirmationEmail.
   */
  private static async sendThankYouReferralEmail(args: { respondentId: string; email: string }): Promise<void> {
    const AUTO_CAMPAIGN_ID = 'thankyou-referral-auto';
    try {
      const r = await db.query.respondents.findFirst({
        where: eq(respondents.id, args.respondentId),
        columns: { source: true, firstName: true, metadata: true },
      });
      if (!r) return;
      if (r.source !== 'public') return; // referral ask is for self-service registrants only
      const metadata = (r.metadata ?? null) as RespondentMetadata | null;
      if (metadata?.thankyou_referral_sent_at) {
        logger.info({ event: 'thankyou_referral_auto.skipped_already_sent', respondentId: args.respondentId });
        return;
      }
      const suppressed = await getSuppressedEmails([args.email]);
      if (suppressed.has(args.email.trim().toLowerCase())) {
        logger.info({ event: 'thankyou_referral_auto.skipped_suppressed', respondentId: args.respondentId });
        return;
      }

      /**
       * Story 13-46 (AC2) — PER-ADDRESS THROTTLE. This is the ONE marketing path that skips the
       * shared cohort guard: `filterMarketingCohort` is inherited by all four blast/backfill
       * scripts and by NO in-request path.
       *
       * ⚠️ WHY THE EXISTING GUARDS DO NOT COVER THIS. The send-once marker above is stamped on the
       * RESPONDENT row, and there is no `email` column on `respondents` at all — the address lives
       * in `submissions.raw_data` and `users.email`, and the wizard's user insert is
       * `onConflictDoNothing`, so it REUSES an account rather than rejecting the registration.
       * A second registration with the same address therefore mints a NEW respondent row that
       * walks straight past the marker. One address, N registrations, N emails — the mail cannon.
       * The ADDRESS is the only key that holds.
       *
       * Reuses `getRecentlyContactedEmails` — the exact gap query `filterMarketingCohort` runs
       * (`campaign-contact.service.ts:179-188`) — and `MARKETING_CONTACT_GAP_DAYS`. A second gap
       * constant here would drift from the blasts' within days.
       *
       * ─── THE FAIL-SOFT-LEDGER DIRECTION, DECIDED AND RECORDED (AC2's warning) ───
       * `recordCampaignSend` is fail-soft: a ledger write can fail and only log
       * (`campaign-contact.service.ts:89-96`). So a MISSING row is genuinely ambiguous — it can
       * mean "never contacted" or "contacted, write failed" — and reading it as the former is what
       * licenses a send.
       *
       * CHOSEN: on a ledger READ ERROR, and on a missing row, ALLOW the send.
       * WHY, explicitly:
       *   - The opposite direction converts a degraded INSTRUMENTATION event into total loss of a
       *     citizen-facing email. If the ledger is unavailable, "treat everyone as recently
       *     contacted" silently stops every thank-you the jingle earns, and nothing distinguishes
       *     that from the feature working.
       *   - The residual risk of the permissive direction is BOUNDED by AC1's cap, which is
       *     evaluated independently at `EmailService.dispatch` from Redis, not from this ledger.
       *     Two guards with two different failure modes: the address gap fails open, the volume
       *     cap fails closed. The cap is what makes this direction survivable.
       *   - A soft-failed ledger write is already LOUD (`campaign_contact.record_failed` at error),
       *     so the ambiguous state is detectable rather than silent.
       */
      const canonicalEmail = toCanonicalEmail(args.email);
      try {
        /**
         * Story 13-46 (review A3 / finding H3) — SCOPED TO THIS CATEGORY. ⚖️ Awwal's ruling, 2026-08-22.
         *
         * ⚠️ THIS READ USED TO SPAN ALL MARKETING CATEGORIES, AND THAT LOST REAL EMAIL. Because
         * `dispatch` ledgers EVERY marketing send, a re-engagement blast on Monday suppressed the
         * thank-you for someone who registered on Tuesday — permanently, since nothing re-drives it
         * and the blast script applies the same gap. That is the growth loop the jingle exists to
         * feed, silently dropped.
         *
         * The narrower read is also the MORE PRECISE guard for AC2's own stated threat. AC2 exists
         * to stop the mail cannon — *one address, N registrations, N thank-yous* — so the question
         * is "has this address already had a THANK-YOU recently", not "has it had any marketing at
         * all". Scoped this way the only suppressed send is a DUPLICATE thank-you, which is not
         * mail anyone wants redelivered late; it is mail that should be dropped. That is why the
         * defer-and-catch-up alternative was NOT built — it would be machinery whose job is to
         * eventually deliver email that should not be sent, plus an unbounded-deferral failure mode
         * (every new marketing contact inside the window re-defers).
         *
         * ⚠️ Blast-then-register now yields two emails inside the gap. That is intended: "please
         * finish registering" followed by "thanks, you're registered" is a conversation, not two
         * campaigns.
         *
         * ⚠️ TOCTOU, NAMED (review A14 / finding L1): this reads `campaign_sends` BEFORE the send,
         * and the row is written AFTER it. Two registrations for the same address landing inside the
         * same instant therefore both pass this check and both send — which is precisely the burst
         * shape the story is written for. The window is milliseconds and the overshoot is one extra
         * email, so it is accepted rather than closed: an atomic reserve-then-send would have to
         * decide what to do when the reserve fails, and every answer there is worse than a duplicate
         * thank-you. Stated because every other number in this story carries its derivation, and a
         * guard's bound deserves the same treatment.
         */
        const recentlyContacted = await getRecentlyContactedEmails([args.email], undefined, undefined, {
          categories: [AUTO_SEND_GAP_CATEGORY],
        });
        if (recentlyContacted.has(canonicalEmail)) {
          // COUNTED, not just logged — the half of the defer-and-catch-up instinct that survives.
          // If this ruling is wrong we learn it from a rising counter, not from a citizen who never
          // got their referral link. REOPEN TRIGGER: a non-trivial count on a day with no
          // duplicate-registration activity.
          recordThankYouSuppressed();
          logger.info({
            event: 'thankyou_referral_auto.skipped_duplicate_thankyou',
            respondentId: args.respondentId,
            gapDays: resolveGapDays(),
            category: AUTO_SEND_GAP_CATEGORY,
            note: 'this ADDRESS already had a thank-you inside the gap — the mail-cannon case AC2 exists for',
          });
          return;
        }
      } catch (gapErr) {
        // Fail-OPEN, per the decision recorded above. Loud so a persistent failure is visible.
        logger.warn({
          event: 'thankyou_referral_auto.contact_gap_check_failed',
          respondentId: args.respondentId,
          error: gapErr instanceof Error ? gapErr.message : String(gapErr),
          note: 'contact-gap read failed — ALLOWING the send; AC1 volume cap remains the ceiling',
        });
      }

      const referralUrl = buildThankYouReferralUrl(AUTO_CAMPAIGN_ID);
      const content = buildThankYouEmail(firstNameFrom(r.firstName), referralUrl);
      const result = await EmailService.sendGenericEmail(
        { to: args.email, subject: content.subject, html: content.html, text: content.text },
        'thankyou-referral',
        AUTO_CAMPAIGN_ID,
      );
      if (!result.success) {
        /**
         * Story 13-46 (review A2 / finding H2) — A DELIBERATE CAP REFUSAL IS NOT A FAILURE.
         *
         * `recordAutoSendFailure` pages at its 5th occurrence with "Registration auto-emails are
         * FAILING… the confirmation + thank-you/referral loop may be down. Check the Resend
         * dashboard." Routing cap refusals into it would hand the operator the WRONG DIAGNOSIS at
         * the exact moment the right one matters, bypass `reportCapRefusal`'s one-page-per-window
         * cooldown, and corrupt 13-21's failure metric with the system working as designed.
         *
         * The operator has already been told, once per window, by `notification.cap_exceeded`.
         */
        if (result.refusedByCap) {
          logger.warn({
            event: 'thankyou_referral_auto.refused_by_cap',
            respondentId: args.respondentId,
            reason: result.error,
            note: 'marketing cap refused this send — NOT an auto-send failure; no marker stamped, so it can be re-driven once the cap clears',
          });
          return;
        }
        // Story 13-21 (AC4) — was a swallowed warn; now a counted ERROR that can page.
        await recordAutoSendFailure({
          kind: 'thankyou',
          respondentId: args.respondentId,
          error: result.error,
        });
        return;
      }

      // Story 13-46 (AC3) — count a DISPATCHED auto thank-you for the burst alert's
      // "auto-sends in window". Counted here, after a confirmed send, so a refused or failed send
      // never inflates the number the operator uses to judge outbound pressure.
      recordRegistrationAutoSend();

      // Stamp the send-once marker only after a confirmed dispatch (JSONB merge preserves siblings).
      // Story 13-21 (review M1) — the email already dispatched; a stamp failure
      // must NOT count as a send failure (false AC4 page). It risks a duplicate on
      // re-run, so log loudly at warn instead. Own try so a stamp error can't reach
      // the outer send-failure catch.
      try {
        await db.execute(sql`
          UPDATE "respondents"
          SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${JSON.stringify({ thankyou_referral_sent_at: new Date().toISOString() })}::jsonb
          WHERE "id" = ${args.respondentId}
        `);
      } catch (stampErr) {
        logger.warn({
          event: 'thankyou_referral_auto.marker_stamp_failed',
          respondentId: args.respondentId,
          error: stampErr instanceof Error ? stampErr.message : String(stampErr),
        });
      }

      AuditService.logAction({
        actorId: null,
        action: AUDIT_ACTIONS.OPERATOR_THANKYOU_REFERRAL_SENT,
        targetResource: AUDIT_TARGETS.RESPONDENT,
        targetId: args.respondentId,
        details: {
          email: args.email,
          channel: 'email',
          campaign: AUTO_CAMPAIGN_ID,
          auto: true,
          provider_message_id: result.messageId ?? null,
        },
        ipAddress: 'system',
        userAgent: 'submission-processing.auto-thankyou',
      });
    } catch (err) {
      // Story 13-21 (AC4) — counted + loud (was a swallowed warn).
      await recordAutoSendFailure({
        kind: 'thankyou',
        respondentId: args.respondentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

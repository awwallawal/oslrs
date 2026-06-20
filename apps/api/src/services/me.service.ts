/**
 * Story 9-38 (AC#10) — authenticated public-user registration-status read-model.
 *
 * The SHARED SPINE for the public-user journey: the dashboard state machine
 * (Story 9-40) and the entry wrong-door recovery (Story 9-39) both read THIS
 * one source of truth for "what is this user's registration state?".
 *
 * NOT to be confused with the Story 9-58 PUBLIC registration-status check
 * (`POST /registration-status/request`), which is UNauthenticated, takes an
 * arbitrary email/phone/reference-code, and never reveals status on-screen
 * (anti-enumeration via deliver-to-registered-channel). THIS endpoint is the
 * opposite: authenticated, returns the CALLER'S OWN status only (resolved from
 * the JWT), and never accepts an arbitrary identifier.
 *
 * Resolution order:
 *   1. Respondent linked to the account via `respondents.user_id` (AC#3) →
 *      `complete` (active) or `pending_nin` (pending_nin_capture).
 *   2. Else an in-progress wizard draft keyed by the user's email → `draft`.
 *   3. Else `none`.
 */
import { eq, and, desc } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import pino from 'pino';
import { AppError } from '@oslsr/utils';
import type { MinorGuardianResult } from '@oslsr/utils';
import { db } from '../db/index.js';
import { respondents, wizardDrafts, submissions, type WizardDraftData } from '../db/schema/index.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from './audit.service.js';
import { NativeFormService } from './native-form.service.js';
import {
  validateSubmissionCompleteness,
  validateMinorGuardianConsent,
} from './form-submission-validation.service.js';

const logger = pino({ name: 'me.service' });

/**
 * The partial unique index `respondents_nin_unique_when_present` is the true
 * backstop for NIN uniqueness (the read-then-write pre-checks only narrow the
 * window). Detect a concurrent-NIN race that slipped past the pre-check so the
 * authenticated edit/complete-nin paths return the same clean 409 the public
 * wizard submit does (registration.controller) instead of a raw 500. Matched on
 * the constraint name in the driver error message — identical to the public
 * handler + its test (registration.routes.test). (Story 9-60 review.)
 */
function isNinUniqueRace(error: unknown): boolean {
  return error instanceof Error && /respondents_nin_unique_when_present/.test(error.message);
}

export type RegistrationState = 'none' | 'draft' | 'pending_nin' | 'complete';

/** NIN sub-status surfaced in the respondent summary. */
export type NinStatus = 'provided' | 'pending' | 'none';

export interface RegistrationStatusRespondentSummary {
  id: string;
  status: string;
  lgaId: string | null;
  ninStatus: NinStatus;
  consentMarketplace: boolean;
  referenceCode: string | null;
}

export interface RegistrationStatusReadModel {
  state: RegistrationState;
  /** Last visited wizard step (only present for `state === 'draft'`). */
  draftStep?: number;
  /**
   * Total wizard steps is intentionally NOT returned by the server: the wizard
   * step count is a frontend composition concern (fixed identity/contact/consent
   * steps + one step per pinned-form section + the review step), owned by the
   * wizard config the dashboard (Story 9-40) renders. The server returns the
   * authoritative `draftStep`; the client supplies the "of N". Documented here
   * so the optional `draftTotalSteps` in AC#10's shape is a deliberate omission,
   * not an oversight.
   */
  draftTotalSteps?: number;
  /** Present for `pending_nin` + `complete` (a linked respondent exists). */
  respondent?: RegistrationStatusRespondentSummary;
}

/**
 * Story 9-60 — wizard-shaped registration data. Mirrors the `submitWizardSchema`
 * input (registration.controller). Used as BOTH the prefill the authenticated
 * wizard hydrates from (AC#1) and the edit payload it submits (AC#2), so the
 * dashboard edit reuses the exact wizard fields + validators (no parallel
 * surface, AC#5).
 */
export interface WizardShapedData {
  givenName: string;
  familyName?: string;
  dateOfBirth?: string;
  gender?: string;
  phone: string;
  email: string;
  lgaId: string;
  nin?: string;
  pendingNin?: boolean;
  consentMarketplace: boolean;
  consentEnriched?: boolean;
  questionnaireResponses?: Record<string, unknown>;
}

export type EditableMode = 'none' | 'draft' | 'pending_nin' | 'edit';

export interface EditableRegistration {
  mode: EditableMode;
  /** Present for `draft` — last visited wizard step. */
  draftStep?: number;
  /** Present for `pending_nin` + `edit` — the linked respondent id. */
  respondentId?: string;
  /** Prefill for the wizard (absent for `none`). */
  wizardData?: WizardShapedData;
}

/**
 * Identity / consent / server-computed keys written into `submissions.raw_data`
 * by the wizard submit (registration.controller) — everything ELSE in raw_data
 * is a questionnaire answer. The respondent→wizard mapper strips these to
 * recover the Step-4 answers for edit-prefill (Story 9-60 AC#1).
 */
const RAW_DATA_NON_ANSWER_KEYS = new Set([
  'first_name',
  'last_name',
  'date_of_birth',
  'phone_number',
  'lga_id',
  'nin',
  'consent_marketplace',
  'consent_enriched',
  'email',
  'gender',
  'auth_choice',
  'age',
]);

export class MeService {
  /**
   * Resolve the caller's registration state. Caller identity comes from the
   * authenticated session (never an arbitrary param) — anti-enumeration by
   * construction.
   */
  static async getRegistrationStatus(args: {
    userId: string;
    email: string;
  }): Promise<RegistrationStatusReadModel> {
    const { userId } = args;
    const email = args.email.toLowerCase().trim();

    // 1. Linked respondent (the durable AC#3 link).
    const respondent = await db.query.respondents.findFirst({
      where: eq(respondents.userId, userId),
      columns: {
        id: true,
        status: true,
        nin: true,
        lgaId: true,
        consentMarketplace: true,
        referenceCode: true,
      },
    });

    if (respondent) {
      const ninStatus: NinStatus = respondent.nin
        ? 'provided'
        : respondent.status === 'pending_nin_capture'
          ? 'pending'
          : 'none';

      const summary: RegistrationStatusRespondentSummary = {
        id: respondent.id,
        status: respondent.status,
        lgaId: respondent.lgaId ?? null,
        ninStatus,
        consentMarketplace: respondent.consentMarketplace,
        referenceCode: respondent.referenceCode ?? null,
      };

      return {
        state: respondent.status === 'pending_nin_capture' ? 'pending_nin' : 'complete',
        respondent: summary,
      };
    }

    // 2. In-progress wizard draft (pre-account identifier is the email).
    const draft = await db.query.wizardDrafts.findFirst({
      where: eq(wizardDrafts.email, email),
      columns: { currentStep: true },
    });
    if (draft) {
      return { state: 'draft', draftStep: draft.currentStep };
    }

    // 3. Nothing yet.
    return { state: 'none' };
  }

  /**
   * Story 9-40 (AC#4) — self-service edit of the caller's OWN registration.
   *
   * Currently scoped to the marketplace-consent flag — the safe, low-blast-
   * radius field surfaced on the dashboard. Identity / NIN / survey-answer
   * editing would re-run the validated wizard write path in an authenticated
   * edit mode (documented as the heavier enhancement in the 9-40 story); this
   * endpoint deliberately does NOT touch those fields. Audited: actor IS the
   * subject. Returns the refreshed respondent summary so the dashboard can
   * update without a second round-trip.
   */
  static async updateMarketplaceConsent(args: {
    userId: string;
    consentMarketplace: boolean;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<RegistrationStatusRespondentSummary> {
    const { userId, consentMarketplace } = args;

    const existing = await db.query.respondents.findFirst({
      where: eq(respondents.userId, userId),
      columns: { id: true, consentMarketplace: true },
    });
    if (!existing) {
      throw new AppError(
        'NO_REGISTRATION',
        'No registration is linked to your account yet.',
        404,
      );
    }

    const [updated] = await db
      .update(respondents)
      .set({ consentMarketplace })
      .where(eq(respondents.id, existing.id))
      .returning({
        id: respondents.id,
        status: respondents.status,
        nin: respondents.nin,
        lgaId: respondents.lgaId,
        consentMarketplace: respondents.consentMarketplace,
        referenceCode: respondents.referenceCode,
      });

    // Forensic trail (fire-and-forget; never blocks the response).
    AuditService.logAction({
      actorId: userId,
      action: AUDIT_ACTIONS.RESPONDENT_SELF_UPDATED,
      targetResource: AUDIT_TARGETS.RESPONDENT,
      targetId: updated.id,
      details: {
        field: 'consentMarketplace',
        from: existing.consentMarketplace,
        to: consentMarketplace,
      },
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });

    const ninStatus: NinStatus = updated.nin
      ? 'provided'
      : updated.status === 'pending_nin_capture'
        ? 'pending'
        : 'none';

    return {
      id: updated.id,
      status: updated.status,
      lgaId: updated.lgaId ?? null,
      ninStatus,
      consentMarketplace: updated.consentMarketplace,
      referenceCode: updated.referenceCode ?? null,
    };
  }

  /**
   * Story 9-60 (AC#1) — session-authed read of the caller's editable
   * registration, mapped into wizard-shaped data the dashboard wizard hydrates
   * from. Resolution order mirrors `getRegistrationStatus`:
   *   1. Linked respondent (`respondents.user_id`) → `edit` (active) or
   *      `pending_nin` (pending_nin_capture). Questionnaire answers + gender are
   *      recovered from the latest `submissions.raw_data` (the wizard submit
   *      persists them there, not on the respondent row).
   *   2. Else an in-progress wizard draft keyed by email → `draft`.
   *   3. Else `none`.
   */
  static async getEditableRegistration(args: {
    userId: string;
    email: string;
  }): Promise<EditableRegistration> {
    const email = args.email.toLowerCase().trim();

    const respondent = await db.query.respondents.findFirst({
      where: eq(respondents.userId, args.userId),
      columns: {
        id: true,
        status: true,
        nin: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        phoneNumber: true,
        lgaId: true,
        consentMarketplace: true,
        consentEnriched: true,
      },
    });

    if (respondent) {
      // Recover Step-4 answers + gender from the most recent submission.
      const sub = await db.query.submissions.findFirst({
        where: eq(submissions.respondentId, respondent.id),
        orderBy: [desc(submissions.submittedAt)],
        columns: { rawData: true },
      });
      const raw = (sub?.rawData ?? {}) as Record<string, unknown>;
      const questionnaireResponses: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (!RAW_DATA_NON_ANSWER_KEYS.has(k)) questionnaireResponses[k] = v;
      }

      const wizardData: WizardShapedData = {
        givenName: respondent.firstName ?? '',
        familyName: respondent.lastName ?? undefined,
        dateOfBirth: respondent.dateOfBirth ?? undefined,
        gender: typeof raw.gender === 'string' ? raw.gender : undefined,
        phone: respondent.phoneNumber ?? '',
        email: typeof raw.email === 'string' ? raw.email : email,
        lgaId: respondent.lgaId ?? '',
        nin: respondent.nin ?? undefined,
        pendingNin: respondent.status === 'pending_nin_capture',
        consentMarketplace: respondent.consentMarketplace,
        consentEnriched: respondent.consentEnriched,
        questionnaireResponses,
      };

      return {
        mode: respondent.status === 'pending_nin_capture' ? 'pending_nin' : 'edit',
        respondentId: respondent.id,
        wizardData,
      };
    }

    const draft = await db.query.wizardDrafts.findFirst({
      where: eq(wizardDrafts.email, email),
      columns: { currentStep: true, formData: true },
    });
    if (draft) {
      const fd = (draft.formData ?? {}) as WizardDraftData;
      const wizardData: WizardShapedData = {
        givenName: fd.givenName ?? '',
        familyName: fd.familyName,
        dateOfBirth: fd.dateOfBirth,
        gender: fd.gender,
        phone: fd.phone ?? '',
        email,
        lgaId: fd.lgaId ?? '',
        nin: fd.nin,
        pendingNin: fd.pendingNinToggle === true || !fd.nin,
        consentMarketplace: false,
        questionnaireResponses: fd.questionnaireResponses,
      };
      return { mode: 'draft', draftStep: draft.currentStep, wizardData };
    }

    return { mode: 'none' };
  }

  /**
   * Story 9-60 (AC#2/#5/#6) — session-authed EDIT of the caller's registration
   * through the wizard's validated path, keyed off `user_id` (NOT a fresh
   * NIN-dedupe insert). Reuses the same validators the public submit uses
   * (`validateSubmissionCompleteness` + `validateMinorGuardianConsent`) — no
   * parallel validation surface. Writes a fresh `submissions` row (unified-
   * ingestion parity) + a hash-chain audit row (actor = subject) inside one
   * transaction. NIN-dedupe is SELF-AWARE: the caller may re-submit their own
   * NIN (self-match allowed); a different respondent's NIN is still rejected.
   *
   * The respondent must already exist (the 9-38 account-at-submit model means an
   * authenticated user is `edit`/`pending_nin`); a `none`/`draft` caller has no
   * row to edit and goes through the normal public submit.
   */
  static async updateRegistrationFromWizard(args: {
    userId: string;
    data: WizardShapedData;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<RegistrationStatusReadModel> {
    const r = await db.query.respondents.findFirst({
      where: eq(respondents.userId, args.userId),
      columns: { id: true },
    });
    if (!r) {
      throw new AppError('NO_REGISTRATION', 'No registration is linked to your account yet.', 404);
    }

    const data = args.data;
    const normalisedEmail = data.email.toLowerCase().trim();
    const pendingNin = data.pendingNin === true || !data.nin;
    const ninValue = pendingNin ? null : data.nin ?? null;
    const responses = (data.questionnaireResponses ?? {}) as Record<string, unknown>;

    // Completeness gate + authoritative computed fields (reuse the wizard's
    // validators — AC#5). PUBLIC_FORM_NOT_CONFIGURED → Step 4 was empty.
    let computedFields: Record<string, number> = {};
    try {
      const flattened = await NativeFormService.getPublicActiveForm();
      const { computed } = validateSubmissionCompleteness(flattened, responses, {
        pendingNin,
        today: new Date(),
      });
      computedFields = computed;
    } catch (err) {
      // INCOMPLETE_SUBMISSION is the authoritative rejection — re-throw it.
      if (err instanceof AppError && err.code === 'INCOMPLETE_SUBMISSION') throw err;
      // PUBLIC_FORM_NOT_CONFIGURED (no form pinned) → Step 4 empty; proceed.
      // Anything else is swallowed-but-LOGGED, mirroring the public wizard submit
      // (registration.controller `wizard.completeness_skipped`) so a silently
      // skipped validation is observable rather than invisible. (9-60 review L2.)
      logger.warn({
        event: 'me.registration_edit.completeness_skipped',
        reason: err instanceof AppError ? err.code : 'unknown',
      });
    }

    const minorResult: MinorGuardianResult = validateMinorGuardianConsent(
      responses,
      typeof computedFields.age === 'number' ? computedFields.age : null,
    );

    // FR21 dedupe — SELF-AWARE (AC#2). Allow the caller's own NIN; reject another
    // respondent's. Generic message (no prior-registration leak — 9-12 M7).
    if (ninValue) {
      const collision = await db.query.respondents.findFirst({
        where: eq(respondents.nin, ninValue),
        columns: { id: true },
      });
      if (collision && collision.id !== r.id) {
        throw new AppError(
          'NIN_DUPLICATE',
          'This NIN is already registered. If you believe this is an error, please contact support.',
          409,
        );
      }
    }

    const firstName = data.givenName.trim().replace(/\s+/g, ' ');
    const lastName = data.familyName?.trim().replace(/\s+/g, ' ') || null;
    const status = pendingNin ? 'pending_nin_capture' : 'active';
    const metadata: Record<string, unknown> = {};
    if (pendingNin) metadata.defer_reason_nin = 'public_dashboard_user_self_deferred';
    if (minorResult.guardian) metadata.guardian = minorResult.guardian;

    try {
    await db.transaction(async (tx) => {
      await tx
        .update(respondents)
        .set({
          nin: ninValue,
          firstName,
          lastName,
          dateOfBirth: data.dateOfBirth ?? null,
          phoneNumber: data.phone,
          lgaId: data.lgaId,
          consentMarketplace: data.consentMarketplace,
          consentEnriched: data.consentEnriched ?? false,
          status,
          metadata: Object.keys(metadata).length > 0 ? (metadata as never) : null,
          updatedAt: new Date(),
        })
        .where(eq(respondents.id, r.id));

      // Unified-ingestion parity — capture the edited state as a new submission.
      const now = new Date();
      await tx.insert(submissions).values({
        submissionUid: uuidv7(),
        questionnaireFormId: 'self-edit',
        submitterId: null,
        respondentId: r.id,
        enumeratorId: null,
        rawData: {
          first_name: firstName,
          last_name: lastName,
          date_of_birth: data.dateOfBirth ?? null,
          phone_number: data.phone,
          lga_id: data.lgaId,
          nin: ninValue,
          consent_marketplace: data.consentMarketplace,
          consent_enriched: data.consentEnriched ?? false,
          email: normalisedEmail,
          gender: data.gender ?? null,
          auth_choice: 'session',
          ...responses,
          ...computedFields,
        } as Record<string, unknown>,
        gpsLatitude: null,
        gpsLongitude: null,
        completionTimeSeconds: null,
        submittedAt: now,
        source: 'public',
        processed: true,
        processedAt: now,
      });

      await AuditService.logActionTx(tx, {
        actorId: args.userId,
        action: AUDIT_ACTIONS.RESPONDENT_SELF_EDITED,
        targetResource: AUDIT_TARGETS.RESPONDENT,
        targetId: r.id,
        details: {
          // 9-60 review L3 — PII minimisation: actorId + targetId already
          // identify the subject + record; don't duplicate the raw email here.
          trigger: 'authenticated_dashboard_edit',
          lgaId: data.lgaId,
          ninProvided: !!ninValue,
          pendingNin,
        },
        ipAddress: args.ipAddress,
        userAgent: args.userAgent,
      });
    });
    } catch (error) {
      // TOCTOU backstop — a concurrent NIN registration tripped the partial
      // unique index after the pre-check. Surface the same 409 as the public
      // submit (registration.controller), not a raw 500.
      if (isNinUniqueRace(error)) {
        throw new AppError(
          'NIN_DUPLICATE',
          'This NIN was registered while you were saving. If you believe this is an error, please contact support.',
          409,
        );
      }
      throw error;
    }

    return MeService.getRegistrationStatus({ userId: args.userId, email: normalisedEmail });
  }

  /**
   * Story 9-60 (AC#3) — session-authed pending-NIN completion. The logged-in
   * `pending_nin_capture` caller supplies their NIN; we promote the row to
   * active in-session, replacing the magic-link TOKEN gate (which stays intact
   * for unauthenticated email-link returns via `CompleteNinPage`). NIN-dedupe is
   * self-aware. The Modulus-11 checksum is enforced at the controller (Zod).
   */
  static async completeNinAuthenticated(args: {
    userId: string;
    email: string;
    nin: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<RegistrationStatusReadModel> {
    const r = await db.query.respondents.findFirst({
      where: eq(respondents.userId, args.userId),
      columns: { id: true, status: true },
    });
    if (!r) {
      throw new AppError('NO_REGISTRATION', 'No registration is linked to your account yet.', 404);
    }
    if (r.status !== 'pending_nin_capture') {
      throw new AppError('NOT_PENDING_NIN', 'Your registration is not awaiting a NIN.', 409);
    }

    const collision = await db.query.respondents.findFirst({
      where: eq(respondents.nin, args.nin),
      columns: { id: true },
    });
    if (collision && collision.id !== r.id) {
      throw new AppError(
        'NIN_DUPLICATE',
        'This NIN is already registered. If you believe this is an error, please contact support.',
        409,
      );
    }

    try {
    await db.transaction(async (tx) => {
      // Status-filtered UPDATE so a concurrent promotion can't double-apply.
      const rows = await tx
        .update(respondents)
        .set({ nin: args.nin, status: 'active', updatedAt: new Date() })
        .where(and(eq(respondents.id, r.id), eq(respondents.status, 'pending_nin_capture')))
        .returning({ id: respondents.id });
      if (rows.length === 0) {
        throw new AppError('NIN_ALREADY_COMPLETED', 'Your NIN was already completed.', 409);
      }
      await AuditService.logActionTx(tx, {
        actorId: args.userId,
        action: AUDIT_ACTIONS.RESPONDENT_SELF_NIN_COMPLETED,
        targetResource: AUDIT_TARGETS.RESPONDENT,
        targetId: r.id,
        details: { trigger: 'authenticated_dashboard_nin' },
        ipAddress: args.ipAddress,
        userAgent: args.userAgent,
      });
    });
    } catch (error) {
      // TOCTOU backstop — same as the edit path: map a concurrent-NIN partial
      // unique-index violation to a clean 409 rather than a raw 500.
      if (isNinUniqueRace(error)) {
        throw new AppError(
          'NIN_DUPLICATE',
          'This NIN was registered while you were completing it. If you believe this is an error, please contact support.',
          409,
        );
      }
      throw error;
    }

    return MeService.getRegistrationStatus({ userId: args.userId, email: args.email });
  }
}

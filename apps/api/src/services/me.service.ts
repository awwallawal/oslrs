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
import { eq } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import { db } from '../db/index.js';
import { respondents, wizardDrafts } from '../db/schema/index.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from './audit.service.js';

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
}

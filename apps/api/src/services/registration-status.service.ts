/**
 * Story 9-58 (Deliverable A) — public registration-status check.
 *
 * Privacy-first "status-to-your-channel" flow (the forgot-password pattern):
 * the public endpoint NEVER reveals registration status on-screen for an
 * arbitrary identifier (that would be an NDPA enumeration oracle). Instead, on
 * a match, the registrant's status + a magic-link are delivered to their
 * REGISTERED channel (email-first via Resend). The endpoint always returns the
 * same neutral response regardless of match (mirrors the marketplace
 * `not_found`-not-`forbidden` discipline).
 *
 * Identifier auto-detection (single free-text field):
 *   - reference code  → `respondents.reference_code` (exact, uppercased)
 *   - email           → `submissions.raw_data->>'email'` (JOIN, case-insensitive)
 *   - phone           → `respondents.phone_number` (normalised E.164)
 *
 * Channel abstraction (`notifyRegistrationStatus`) keeps a future SMS (Termii)
 * channel a drop-in — SMS itself is OUT OF SCOPE here.
 */
import { eq, sql } from 'drizzle-orm';
import { isValidReferenceCode, sha256Hex } from '@oslsr/utils';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { EmailService } from './email.service.js';
import { MagicLinkService } from './magic-link.service.js';
import { AuthService } from './auth.service.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
import { buildRegistrantFullName } from '../utils/registrant-name.js';
import { normaliseNigerianPhone } from '../lib/normalise/index.js';
import { getRedisClient } from '../lib/redis.js';
import pino from 'pino';

const logger = pino({ name: 'registration-status-service' });

const BRAND_COLOR = '#9C1E23';

/**
 * H2 (Story 9-58 code review) — per-EMAIL magic-link send throttle.
 *
 * The public status endpoint is gated only by a per-IP limiter (10/15min) +
 * captcha. Because {@link RegistrationStatusService.handleRequest} mints a
 * 72h magic-link by calling `MagicLinkService.issueToken` DIRECTLY from the
 * service layer, it BYPASSES the per-email throttle that normally lives in the
 * `magic-link-rate-limit` route middleware (`magic-link.service.ts:24` —
 * "3/email/hour, handled by route middleware"). An attacker who knows a
 * victim's email could otherwise deliver many live magic-links to that inbox
 * from rotating IPs (email-bombing).
 *
 * This adds a service-layer per-email cap mirroring that same 3/hour budget,
 * keyed on a SHA-256 of the lowercased email (NEVER the raw email — no PII in
 * Redis), via the standard INCR + EXPIRE pattern.
 */
const EMAIL_SEND_THROTTLE = {
  /** Mirrors the magic-link route middleware budget (NFR4.4: 3/email/hour). */
  MAX_PER_WINDOW: 3,
  WINDOW_SECONDS: 60 * 60, // rolling 1 hour
  KEY_PREFIX: 'rl:regstatus-email:',
} as const;

/**
 * Returns true when a magic-link send is ALLOWED for this email, false when the
 * per-email cap has been hit (caller must SKIP the send, not throw).
 *
 * Fail-OPEN on any Redis error or unavailability — matches the route-layer
 * `express-rate-limit` + `RedisStore` behavior (a store error lets the request
 * through). The per-IP limiter + captcha remain as the outer line of defense,
 * so failing open here does not remove all protection while preserving
 * availability for legitimate registrants during a Redis outage.
 */
export async function isEmailSendAllowed(email: string): Promise<boolean> {
  let client: ReturnType<typeof getRedisClient> | null;
  try {
    client = getRedisClient();
  } catch {
    // No Redis configured (e.g. test mode / misconfig) → fail open.
    return true;
  }
  if (!client) return true;

  const key = `${EMAIL_SEND_THROTTLE.KEY_PREFIX}${sha256Hex(email.trim().toLowerCase())}`;
  try {
    const count = await client.incr(key);
    if (count === 1) {
      // First hit in this window — set the rolling TTL.
      await client.expire(key, EMAIL_SEND_THROTTLE.WINDOW_SECONDS);
    }
    return count <= EMAIL_SEND_THROTTLE.MAX_PER_WINDOW;
  } catch (err) {
    logger.warn({
      event: 'registration_status.email_throttle_unavailable',
      error: err instanceof Error ? err.message : String(err),
    });
    return true; // fail open
  }
}

export type IdentifierClass = 'reference_code' | 'email' | 'phone';
export type StatusChannel = 'email' | 'sms';

interface ResolvedRespondent {
  id: string;
  status: string;
  referenceCode: string | null;
  phoneNumber: string | null;
  /** Durable respondent↔account link (Story 9-38). Null for enumerator/clerk/adopted rows. */
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Story 13-50 AC1 — WHICH LINK DOES SOMEBODY CHECKING THEIR STATUS ACTUALLY NEED?
 *
 * Until 13-50 this surface minted `wizard_resume` for EVERY match. For a person whose
 * registration is already complete that link is a trap:
 *
 *   /check-registration → emailed a wizard_resume link → resume the wizard →
 *   refill → submit → 409 NIN_DUPLICATE
 *
 * To the person receiving it that error reads as "the Registry has lost me", and the volume of it
 * grows with engagement — every adopted person who checks their status added one.
 *
 * ⚠️ THE BRANCH IS ON REGISTRATION COMPLETENESS, NOT ON THE PURPOSE (AC1.3). `wizard_resume` is
 * NOT disabled: it stays correct for a genuinely mid-wizard person, and the recovery / adoption
 * scripts keep minting it. What changed is that this surface stops asserting "has a magic link"
 * where it meant "still has wizard work to do".
 *
 * Worth stating because it is the reason the defect was invisible: `resolveRespondent` only ever
 * returns people who ALREADY HAVE A RESPONDENT ROW. A genuinely mid-wizard person has no row and
 * never resolves here at all — so at THIS call site `wizard_resume` was never the right answer for
 * anybody. It survives below only as the conservative default for statuses nobody has ruled on.
 *
 * The mapping:
 *   - `active` / `imported_unverified` → **`login`**. Nothing left to collect; they need to LAND
 *     ON THEIR RECORD. Story 9-40's `PublicUserHome` (`/dashboard/public`) is that surface today
 *     and renders exactly what AC1.1 asks for — reference code + current state.
 *   - `pending_nin_capture` → **`pending_nin_complete`**. Pinned to
 *     `registration.controller.ts` `allowedStatuses: ['pending_nin_capture']`: the 9-12
 *     complete-NIN endpoint accepts that status ALONE, so it is the only status for which this
 *     purpose is redeemable. Widening it would hand out a link that 400s.
 *   - anything else (incl. `nin_unavailable`) → **`wizard_resume`**, i.e. UNCHANGED. See the
 *     residual on `nin_unavailable`: the 9-12 ladder refuses that status and no other surface
 *     exists for it today, so this story does not move it rather than moving it somewhere wrong.
 */
export type StatusLinkPurpose = 'login' | 'pending_nin_complete' | 'wizard_resume';

/**
 * 13-50 AC1.4 — the CTA a completed registrant reads. "Finish my registration" on a record that
 * is already finished is the same lie as the link that used to sit under it.
 */
export function statusCtaLabel(purpose: StatusLinkPurpose | null): string {
  switch (purpose) {
    case 'login':
      return 'View my registration';
    case 'pending_nin_complete':
      return 'Add my NIN';
    case 'wizard_resume':
      return 'Finish my registration';
    default:
      return '';
  }
}

export function statusLinkPurposeFor(status: string): StatusLinkPurpose {
  switch (status) {
    case 'active':
    case 'imported_unverified':
      return 'login';
    case 'pending_nin_capture':
      return 'pending_nin_complete';
    default:
      return 'wizard_resume';
  }
}

/** Auto-detect the identifier class from a single free-text input. */
export function classifyIdentifier(identifier: string): IdentifierClass {
  const trimmed = identifier.trim();
  if (isValidReferenceCode(trimmed.toUpperCase())) return 'reference_code';
  if (trimmed.includes('@')) return 'email';
  return 'phone';
}

/** Plain-language registration status for the registrant-facing message. */
export function statusToPlainLanguage(status: string): string {
  switch (status) {
    case 'active':
      return 'Active — your registration is complete and on the Oyo State Skills Registry.';
    case 'pending_nin_capture':
      return 'Pending — your details are saved, but we still need your NIN to finish. The link below lets you add it.';
    case 'nin_unavailable':
      return 'Pending — your details are saved. The link below lets you complete your registration.';
    case 'imported_unverified':
      return 'On file — your record is on the registry and awaiting verification.';
    default:
      return 'Your registration is on file.';
  }
}

export class RegistrationStatusService {
  /**
   * Resolve a registrant by the auto-detected identifier. Returns null on no
   * match (no existence signal escapes this method — the caller's response is
   * constant either way).
   *
   * ⚠️ AN AMBIGUOUS IDENTIFIER RESOLVES TO NOTHING (13-4 code review H2, 2026-08-06)
   * --------------------------------------------------------------------------------
   * `phone` and `email` are NOT unique keys on `respondents`, and as of 13-4 AC1b they are
   * deliberately not even close to unique. The enumerator/clerk exemption in
   * `submission-processing.service.ts` exists so that a household enumerated on ONE handset
   * yields one row PER PERSON instead of silently collapsing into one — which means "four
   * respondents share this phone" is now the EXPECTED shape of field data, not an anomaly.
   *
   * This method used to answer that with `ORDER BY created_at DESC LIMIT 1`: pick the newest and
   * say nothing. `handleRequest` then issues a `wizard_resume` magic link **bound to that
   * respondentId**, so a mother checking her status on the family handset would have been handed
   * a session that resumes — and can complete the NIN on — her daughter's record. That is the
   * exact two-citizens-merged failure AC1b was written to prevent, moved one hop downstream.
   *
   * So: when an identifier matches MORE THAN ONE living respondent we return null and let the
   * caller emit its constant neutral response. Refusing is strictly better than confidently
   * answering about the wrong person, and there is a working alternative that IS unique — the
   * reference code, which 9-58 prints for every registrant and the enumerator reads out at
   * capture. `rolled_back` rows are excluded from the count for the same reason
   * `findRespondentByIdentity` excludes them: they are soft-deleted and must not resolve.
   */
  static async resolveRespondent(
    identifier: string,
    identifierClass: IdentifierClass,
  ): Promise<ResolvedRespondent | null> {
    const trimmed = identifier.trim();
    let rows: Array<{
      id: string;
      status: string;
      reference_code: string | null;
      phone_number: string | null;
      // 13-50 AC1.3 — the `login` branch needs to know whether a sign-in account already exists
      // (and, when it does not, what to name the one it provisions).
      user_id: string | null;
      first_name: string | null;
      last_name: string | null;
    }> = [];

    if (identifierClass === 'reference_code') {
      // The one genuinely unique identifier — no ambiguity check needed.
      const result = (await db.execute(sql`
        SELECT id, status, reference_code, phone_number, user_id, first_name, last_name
        FROM "respondents"
        WHERE "reference_code" = ${trimmed.toUpperCase()}
        LIMIT 1
      `)) as { rows: typeof rows };
      rows = result.rows;
    } else if (identifierClass === 'email') {
      // GROUP BY the respondent, not the submission: one person with three submissions under
      // the same address is ONE match, not three. LIMIT 2 is all the ambiguity check needs.
      const result = (await db.execute(sql`
        SELECT r.id, r.status, r.reference_code, r.phone_number,
               r.user_id, r.first_name, r.last_name,
               max(s.submitted_at) AS last_submitted_at
        FROM "respondents" r
        JOIN "submissions" s ON s.respondent_id = r.id
        WHERE lower(s.raw_data->>'email') = ${trimmed.toLowerCase()}
          AND r."status" <> 'rolled_back'
        GROUP BY r.id, r.status, r.reference_code, r.phone_number,
                 r.user_id, r.first_name, r.last_name
        ORDER BY last_submitted_at DESC
        LIMIT 2
      `)) as { rows: typeof rows };
      rows = result.rows;
    } else {
      // phone — normalise to the canonical stored form before matching.
      const normalised = normaliseNigerianPhone(trimmed).value || trimmed;
      const result = (await db.execute(sql`
        SELECT id, status, reference_code, phone_number, user_id, first_name, last_name
        FROM "respondents"
        WHERE "phone_number" = ${normalised}
          AND "status" <> 'rolled_back'
        ORDER BY "created_at" DESC
        LIMIT 2
      `)) as { rows: typeof rows };
      rows = result.rows;
    }

    if (rows.length === 0) return null;

    if (rows.length > 1) {
      // Class + count only — never the raw identifier (AC8). This is also the operator's signal
      // that shared-handset households are arriving from the field: a rising count here is the
      // cue to give enumerators the "read the reference code back to them" instruction.
      logger.info(
        {
          event: 'registration_status.identifier_ambiguous',
          identifierClass,
          matchCount: rows.length,
        },
        'Identifier matched more than one respondent — refusing to guess. Responding as if no ' +
          'match; the registrant must use their reference code (13-4 review H2).',
      );
      return null;
    }

    return {
      id: rows[0].id,
      status: rows[0].status,
      referenceCode: rows[0].reference_code,
      phoneNumber: rows[0].phone_number,
      userId: rows[0].user_id ?? null,
      firstName: rows[0].first_name ?? null,
      lastName: rows[0].last_name ?? null,
    };
  }

  /**
   * Story 13-50 AC1.3 — make the `login` link REDEEMABLE for this respondent.
   *
   * `AuthService.loginByMagicLinkToken` resolves the account by the token's email; with no
   * `users` row it throws `AUTH_INVALID_CREDENTIALS`, and the frontend's copy for that code is
   * *"Let's get you registered first"* + a Register CTA. Handing that to somebody who IS
   * registered is a second dead-end, not a fix for the first — and it lands squarely on the
   * cohort this story exists for: `_draft-adoption-programme.ts` creates respondents with
   * `source: 'public'` and never provisions an account, so the adopted people have a complete
   * registration and nothing to sign in to.
   *
   * `provisionPublicUserForWizard` is the SAME idempotent no-clobber primitive the wizard submit
   * path and the 9-38 backfill use: `onConflictDoNothing` on `users.email`, never overwriting an
   * existing account's password / status / role. The account is passwordless and reachable only
   * through a magic link sent to the person's own registered address.
   *
   * Returns the user id, or **null** when no account could be made ready — in which case the
   * caller sends a LINKLESS status email rather than a link that cannot work.
   *
   * NON-FATAL throughout, in both halves and for different reasons:
   *   - provisioning throws  → no account, no link; the status email still answers the question.
   *   - the link-stamp throws → the ACCOUNT EXISTS and the link works; only the durable
   *     `respondents.user_id` bookkeeping is missing, so returning null here would withhold a
   *     working link over a bookkeeping failure.
   */
  static async ensureSignInAccount(args: {
    respondent: ResolvedRespondent;
    email: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string | null> {
    const { respondent, email, ipAddress, userAgent } = args;

    /**
     * ⚠️ CODE REVIEW 2026-08-24 (C1) — RESOLVE THE ACCOUNT THE REDEEMER WILL ACTUALLY READ.
     *
     * The first cut of this method short-circuited on `respondent.userId` and otherwise trusted
     * `provisionPublicUserForWizard` to mean "a link can be redeemed". Neither is that claim.
     * `AuthService.loginByMagicLinkToken` resolves strictly by `users.email = token.email` and
     * then applies THREE further gates (auth.service.ts): locked → 429, suspended/deactivated →
     * 403, and `role.name !== 'public_user'` → `AUTH_INVALID_CREDENTIALS`.
     *
     * MEASURED, not argued (review probe, real Postgres, 2026-08-24): a COMPLETE registrant whose
     * address already carries an `enumerator` account got a `login` link, had
     * `respondents.user_id` stamped with the ENUMERATOR's id, and redeeming the link returned
     * *"Please use the staff login for staff accounts"* — which `MagicLinkLandingPage` renders as
     * **"Let's get you registered first" + a Register CTA**. That is verbatim the second dead-end
     * Task 1.3 exists to prevent, on the surface built to end dead-ends.
     *
     * So the predicate is not "does a users row exist" and not "is this respondent linked" — it
     * is **"will `loginByMagicLinkToken` accept this account for THIS address"**. We therefore read
     * the same row it reads, through the same relation, and apply the same three gates.
     */
    const loadAccount = () =>
      db.query.users.findFirst({
        where: eq(users.email, email.toLowerCase().trim()),
        columns: { id: true, status: true, lockedUntil: true },
        with: { role: { columns: { name: true } } },
      });

    let account = await loadAccount();

    if (!account) {
      try {
        await AuthService.provisionPublicUserForWizard({
          email,
          fullName: buildRegistrantFullName(respondent.firstName, respondent.lastName),
          ipAddress,
          userAgent,
        });
      } catch (err) {
        logger.warn({
          event: 'registration_status.account_provision_failed',
          respondentId: respondent.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
      account = await loadAccount();
      if (!account) {
        logger.warn({
          event: 'registration_status.account_absent_after_provision',
          respondentId: respondent.id,
        });
        return null;
      }
    }

    // The three gates `loginByMagicLinkToken` applies, in its order. A link we cannot predict a
    // redemption for is a link we do not send — the status email still answers the question.
    const unredeemable =
      account.lockedUntil && new Date() < new Date(account.lockedUntil)
        ? 'locked'
        : account.status === 'suspended' || account.status === 'deactivated'
          ? 'suspended'
          : account.role?.name !== 'public_user'
            ? 'not_public_user'
            : null;
    if (unredeemable) {
      logger.warn({
        event: 'registration_status.account_not_redeemable',
        respondentId: respondent.id,
        reason: unredeemable,
      });
      return null;
    }

    const userId = account.id;
    if (respondent.userId) return userId;

    try {
      // Guarded on `user_id IS NULL` so a row linked between the SELECT and here is a no-op
      // (same TOCTOU discipline as the 9-38 backfill).
      await db.execute(sql`
        UPDATE "respondents"
        SET "user_id" = ${userId}, "updated_at" = now()
        WHERE "id" = ${respondent.id} AND "user_id" IS NULL
      `);
    } catch (err) {
      logger.warn({
        event: 'registration_status.account_link_failed',
        respondentId: respondent.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return userId;
  }

  /** Most-recent email on file for a respondent (from their submissions). */
  static async resolveEmail(respondentId: string): Promise<string | null> {
    const result = (await db.execute(sql`
      SELECT lower(s.raw_data->>'email') AS email
      FROM "submissions" s
      WHERE s.respondent_id = ${respondentId}
        AND s.raw_data->>'email' IS NOT NULL
        AND s.raw_data->>'email' <> ''
      ORDER BY s.submitted_at DESC
      LIMIT 1
    `)) as { rows: Array<{ email: string | null }> };
    return result.rows[0]?.email ?? null;
  }

  /**
   * Channel abstraction — deliver the status + magic-link to the registered
   * channel. Only `email` is implemented; `sms` is a documented no-op until
   * Termii lands (Story 9-27 Part B). Returns true if a message was dispatched.
   */
  static async notifyRegistrationStatus(args: {
    channel: StatusChannel;
    email: string;
    statusText: string;
    /**
     * 13-50 AC1 — NULL when there is no link worth sending. A completed registrant whose
     * sign-in account could not be provisioned gets the status text and their reference code
     * and NO button, because the alternative is a link that dead-ends. The email is still the
     * answer they asked for.
     */
    magicLinkUrl: string | null;
    /** Drives the CTA copy so a completed record never reads "finish your registration". */
    linkPurpose: StatusLinkPurpose | null;
    referenceCode: string | null;
  }): Promise<boolean> {
    if (args.channel !== 'email') {
      logger.info({ event: 'registration_status.channel_not_implemented', channel: args.channel });
      return false;
    }

    const refBlock = args.referenceCode
      ? `<p style="margin:20px 0;padding:12px 16px;background:#f6f6f6;border-radius:6px;font-size:14px;">Your application reference: <strong style="font-family:ui-monospace,monospace;letter-spacing:0.5px;">${args.referenceCode}</strong></p>`
      : '';
    const refText = args.referenceCode ? `Your application reference: ${args.referenceCode}\n\n` : '';

    const ctaLabel = statusCtaLabel(args.linkPurpose);
    /**
     * ⚠️ CODE REVIEW 2026-08-24 (L1) — DO NOT POINT AT SOMETHING THE EMAIL DOES NOT CONTAIN.
     *
     * The linkless footer read "Keep the reference above safe" unconditionally, but the reference
     * block is only rendered when `referenceCode` is non-null — and it can be null on this branch
     * (an `imported_unverified` row need not carry one; the AC2.2 trigger test already drives
     * `reference_code: null`). An email that cites a reference it never printed reads exactly like
     * the "the Registry has lost me" experience this whole story exists to end.
     */
    const noLinkFooter = args.referenceCode
      ? 'Keep the reference above safe — it is the quickest way for our team to find your record if you ever need help.'
      : 'Reply to this email if you need help finding your record and our team will look it up for you.';
    const ctaBlock =
      args.magicLinkUrl
        ? `<div style="text-align: center; margin: 30px 0;">
      <a href="${args.magicLinkUrl}" style="background-color: ${BRAND_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">${ctaLabel}</a>
    </div>
    <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: ${BRAND_COLOR}; font-size: 14px;">${args.magicLinkUrl}</p>`
        : `<p style="color: #666; font-size: 14px;">${noLinkFooter}</p>`;
    const ctaText = args.magicLinkUrl
      ? `${ctaLabel}: ${args.magicLinkUrl}\n\n`
      : `${noLinkFooter}

`;

    const subject = 'Your Oyo State Skills Registry status';
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${BRAND_COLOR}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour &amp; Skills Registry</p>
  </div>
  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <p>You asked us to check your registration status. Here it is:</p>
    <p style="font-weight: bold;">${args.statusText}</p>
    ${refBlock}
    ${ctaBlock}
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    <p style="color: #999; font-size: 12px;">We will never ask for your password or NIN by email. If you didn't request this, you can safely ignore it.</p>
    <p style="color: #999; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} Government of Oyo State. All rights reserved.</p>
  </div>
</body></html>`;
    const text = `Your Oyo State Skills Registry status\n\n${args.statusText}\n\n${refText}${ctaText}We will never ask for your password or NIN by email. If you didn't request this, you can safely ignore it.\n\n— Oyo State Labour & Skills Registry`;

    const result = await EmailService.sendGenericEmail({ to: args.email, subject, html, text });
    if (!result.success) {
      logger.warn({ event: 'registration_status.email_failed', error: result.error });
      return false;
    }
    return true;
  }

  /**
   * Handle a status request end-to-end: resolve → (on match) issue a magic-link
   * + deliver to the registered channel → audit by identifier CLASS.
   *
   * Returns nothing meaningful to the caller (the public response is constant /
   * neutral regardless of outcome). NEVER throws to the caller — designed to be
   * fired WITHOUT await so match and no-match paths take indistinguishable
   * wall-clock time on the request (AC2.2 timing-oracle mitigation).
   *
   * AC8 — audit records ONLY the identifier class + whether a send was
   * dispatched; never the raw PII identifier value.
   */
  static async handleRequest(args: {
    identifier: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<void> {
    const identifierClass = classifyIdentifier(args.identifier);
    let dispatched = false;
    let throttled = false;
    try {
      const respondent = await this.resolveRespondent(args.identifier, identifierClass);
      if (respondent) {
        const email =
          identifierClass === 'email'
            ? args.identifier.trim().toLowerCase()
            : await this.resolveEmail(respondent.id);

        if (email && !(await isEmailSendAllowed(email))) {
          // H2 — per-email cap hit. SKIP the magic-link send (do NOT throw —
          // the public response stays neutral/constant). No PII recorded;
          // only the class-level `throttled` flag goes to the audit.
          throttled = true;
          logger.info({ event: 'registration_status.email_send_throttled', identifierClass });
        } else if (email) {
          /**
           * Story 13-50 AC1 — BRANCH ON REGISTRATION COMPLETENESS.
           *
           * This used to mint `wizard_resume` unconditionally, with a comment conceding that it
           * "degrades gracefully to the wizard resume/summary surface". It does not degrade
           * gracefully for somebody already in the register — it degrades into
           * `409 NIN_DUPLICATE`.
           *
           * 9-40 has since landed, so the destination that comment was waiting for exists:
           * `PublicUserHome` at `/dashboard/public` renders the reference code and the current
           * state. A `login` link reaches it, and reaching it is prefetch-safe — `GET
           * /auth/magic` only PEEKS (code review C1, 2026-05-11); the token is consumed by an
           * explicit user-driven POST after the Continue click, so a Gmail or corporate scanner
           * fetching the URL cannot burn the link.
           */
          const linkPurpose = statusLinkPurposeFor(respondent.status);

          // A completed registrant needs somewhere to sign IN to. Null = provisioning failed;
          // send the status without a link rather than a link that cannot be redeemed.
          const accountReady =
            linkPurpose !== 'login' ||
            (await this.ensureSignInAccount({
              respondent,
              email,
              ipAddress: args.ipAddress,
              userAgent: args.userAgent,
            })) !== null;

          let magicLinkUrl: string | null = null;
          if (accountReady) {
            const issued = await MagicLinkService.issueToken({
              email,
              purpose: linkPurpose,
              // The token stays BOUND to the resolved respondent for every purpose — that
              // binding is what 13-4 review H2's ambiguity refusal protects.
              respondentId: respondent.id,
              trigger: 'check_registration_status',
              requestedIp: args.ipAddress,
              userAgent: args.userAgent,
            });
            // Build the URL for the SAME purpose that was issued. A mismatch hands the person a
            // token the destination page cannot redeem — the dead-end wearing a different hat.
            magicLinkUrl = MagicLinkService.buildMagicLinkUrl(issued.tokenPlaintext, linkPurpose);
          }

          dispatched = await this.notifyRegistrationStatus({
            channel: 'email',
            email,
            statusText: statusToPlainLanguage(respondent.status),
            magicLinkUrl,
            linkPurpose: magicLinkUrl ? linkPurpose : null,
            referenceCode: respondent.referenceCode,
          });
        } else {
          // EMAIL-FIRST policy: a registrant with an email on file always
          // receives the status by email (the branch above) — even when they
          // searched by phone or reference code. We fall back to PHONE only when
          // NO email is on file. That phone fallback is delivered by SMS, which
          // is OUT OF SCOPE here (Termii deferred — Story 9-27 Part B), so a
          // phone-only match gets no send today; the response stays neutral.
          // This is the wiring point for the SMS fallback when Termii lands.
          logger.info({
            event: 'registration_status.phone_fallback_pending_sms',
            hasPhone: respondent.phoneNumber != null && respondent.phoneNumber !== '',
          });
        }
      }
    } catch (err) {
      logger.error({
        event: 'registration_status.handle_failed',
        identifierClass,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // AC8 — identifier CLASS + send flags only; NO raw PII. targetId null (no
      // queryable per-person PII trail). `throttled` is a class-level flag (H2)
      // distinguishing "no send because per-email cap hit" from other no-send
      // paths, with no PII attached.
      AuditService.logAction({
        actorId: null,
        action: AUDIT_ACTIONS.REGISTRATION_STATUS_REQUESTED,
        targetResource: 'registration_status',
        targetId: null,
        details: { identifierClass, dispatched, throttled },
        ipAddress: args.ipAddress,
        userAgent: args.userAgent,
      });
    }
  }
}

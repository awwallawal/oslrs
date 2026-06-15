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
import { sql } from 'drizzle-orm';
import { isValidReferenceCode, sha256Hex } from '@oslsr/utils';
import { db } from '../db/index.js';
import { EmailService } from './email.service.js';
import { MagicLinkService } from './magic-link.service.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
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
    }> = [];

    if (identifierClass === 'reference_code') {
      const result = (await db.execute(sql`
        SELECT id, status, reference_code, phone_number
        FROM "respondents"
        WHERE "reference_code" = ${trimmed.toUpperCase()}
        LIMIT 1
      `)) as { rows: typeof rows };
      rows = result.rows;
    } else if (identifierClass === 'email') {
      const result = (await db.execute(sql`
        SELECT r.id, r.status, r.reference_code, r.phone_number
        FROM "respondents" r
        JOIN "submissions" s ON s.respondent_id = r.id
        WHERE lower(s.raw_data->>'email') = ${trimmed.toLowerCase()}
        ORDER BY s.submitted_at DESC
        LIMIT 1
      `)) as { rows: typeof rows };
      rows = result.rows;
    } else {
      // phone — normalise to the canonical stored form before matching.
      const normalised = normaliseNigerianPhone(trimmed).value || trimmed;
      const result = (await db.execute(sql`
        SELECT id, status, reference_code, phone_number
        FROM "respondents"
        WHERE "phone_number" = ${normalised}
        ORDER BY "created_at" DESC
        LIMIT 1
      `)) as { rows: typeof rows };
      rows = result.rows;
    }

    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      status: rows[0].status,
      referenceCode: rows[0].reference_code,
      phoneNumber: rows[0].phone_number,
    };
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
    magicLinkUrl: string;
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
    <div style="text-align: center; margin: 30px 0;">
      <a href="${args.magicLinkUrl}" style="background-color: ${BRAND_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View or finish my registration</a>
    </div>
    <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: ${BRAND_COLOR}; font-size: 14px;">${args.magicLinkUrl}</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    <p style="color: #999; font-size: 12px;">We will never ask for your password or NIN by email. If you didn't request this, you can safely ignore it.</p>
    <p style="color: #999; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} Government of Oyo State. All rights reserved.</p>
  </div>
</body></html>`;
    const text = `Your Oyo State Skills Registry status\n\n${args.statusText}\n\n${refText}View or finish your registration: ${args.magicLinkUrl}\n\nWe will never ask for your password or NIN by email. If you didn't request this, you can safely ignore it.\n\n— Oyo State Labour & Skills Registry`;

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
          // Issue a wizard_resume magic-link. It lands on the authenticated
          // status home (9-40) when shipped; today it degrades gracefully to
          // the wizard resume/summary surface — and the email states the
          // status in text regardless (AC3.2).
          const issued = await MagicLinkService.issueToken({
            email,
            purpose: 'wizard_resume',
            respondentId: respondent.id,
            requestedIp: args.ipAddress,
            userAgent: args.userAgent,
          });
          const magicLinkUrl = MagicLinkService.buildMagicLinkUrl(
            issued.tokenPlaintext,
            'wizard_resume',
          );
          dispatched = await this.notifyRegistrationStatus({
            channel: 'email',
            email,
            statusText: statusToPlainLanguage(respondent.status),
            magicLinkUrl,
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

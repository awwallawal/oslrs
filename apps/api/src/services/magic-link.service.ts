import { randomBytes, createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { magicLinkTokens, type MagicLinkToken, type MagicLinkPurpose } from '../db/schema/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import { EmailService } from './email.service.js';
import pino from 'pino';

const logger = pino({ name: 'magic-link-service' });

/**
 * Story 9-12 AC#6 — magic-link primary auth.
 *
 * Per Architecture Decision 2.5:
 *   - Plaintext token is sent in email exactly once. NEVER persisted.
 *   - `token_hash` stores SHA-256 hex of the plaintext.
 *   - Lookup at redemption: hash submitted plaintext → query token_hash +
 *     expires_at > now() + used_at IS NULL.
 *   - Atomic UPDATE on `used_at` enforces single-use under concurrent redemption.
 *   - Three TTLs by purpose:
 *       wizard_resume        = 72h
 *       pending_nin_complete = 72h
 *       login                = 15min
 *   - Rate limit: 3/email/hour (handled by route middleware).
 */

const TTL_MS_BY_PURPOSE: Record<MagicLinkPurpose, number> = {
  wizard_resume: 72 * 60 * 60 * 1000, // 72h
  pending_nin_complete: 72 * 60 * 60 * 1000, // 72h
  login: 15 * 60 * 1000, // 15min
};

const APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:5173';
const BRAND_COLOR = '#9C1E23'; // Oyo State Red — match EmailService.BRAND_COLOR

const TOKEN_BYTES = 32;

interface IssueTokenArgs {
  email: string;
  purpose: MagicLinkPurpose;
  userId?: string;
  respondentId?: string;
  requestedIp?: string;
  userAgent?: string;
}

interface IssueTokenResult {
  id: string;
  tokenPlaintext: string;
  expiresAt: Date;
}

interface RedeemTokenArgs {
  plaintext: string;
  purpose: MagicLinkPurpose;
}

export class MagicLinkService {
  /**
   * Generate a cryptographically random token, persist its SHA-256 hash with
   * an expiry, return the plaintext (caller emails it; we never store it).
   *
   * Story 9-12 AC#6 + Architecture Decision 2.5.
   */
  static async issueToken(args: IssueTokenArgs): Promise<IssueTokenResult> {
    const { email, purpose, userId, respondentId, requestedIp, userAgent } = args;

    if (!email) {
      throw new AppError('MAGIC_LINK_EMAIL_REQUIRED', 'Email is required to issue a magic link', 400);
    }

    const tokenPlaintext = randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHash = createHash('sha256').update(tokenPlaintext).digest('hex');
    const expiresAt = new Date(Date.now() + TTL_MS_BY_PURPOSE[purpose]);

    const [row] = await db
      .insert(magicLinkTokens)
      .values({
        tokenHash,
        purpose,
        email: email.toLowerCase().trim(),
        userId: userId ?? null,
        respondentId: respondentId ?? null,
        expiresAt,
        requestedIp: requestedIp ?? null,
        userAgent: userAgent ?? null,
      })
      .returning();

    logger.info({
      event: 'magic_link.issued',
      tokenId: row.id,
      purpose,
      email: row.email,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      id: row.id,
      tokenPlaintext,
      expiresAt,
    };
  }

  /**
   * Validate + atomically consume a magic-link token. Returns the persisted row
   * on success. Throws AppError with structured codes on any failure.
   *
   * Story 9-12 AC#6 + Architecture Decision 2.5 — atomic single-use enforcement.
   */
  static async redeemToken(args: RedeemTokenArgs): Promise<MagicLinkToken> {
    const { plaintext, purpose } = args;

    if (!plaintext) {
      throw new AppError('MAGIC_LINK_INVALID', 'Magic-link token is missing or empty', 400);
    }

    const tokenHash = createHash('sha256').update(plaintext).digest('hex');

    // Atomic: only matches an unused, unexpired token of the requested purpose.
    // The single UPDATE marks `used_at = NOW()` returning the row — race-safe
    // because PostgreSQL serializes the UPDATE inside an MVCC transaction.
    const result = await db.execute(sql`
      UPDATE "magic_link_tokens"
      SET "used_at" = now()
      WHERE "token_hash" = ${tokenHash}
        AND "purpose" = ${purpose}
        AND "used_at" IS NULL
        AND "expires_at" > now()
      RETURNING
        "id",
        "token_hash" AS "tokenHash",
        "purpose",
        "email",
        "user_id" AS "userId",
        "respondent_id" AS "respondentId",
        "expires_at" AS "expiresAt",
        "used_at" AS "usedAt",
        "requested_ip" AS "requestedIp",
        "user_agent" AS "userAgent",
        "created_at" AS "createdAt"
    `);

    // drizzle execute returns { rows } shape under node-postgres
    const rows = (result as unknown as { rows: MagicLinkToken[] }).rows;

    if (!rows || rows.length === 0) {
      // Differentiate between "no such hash" / "expired" / "already used" by a follow-up read.
      // Keeps the error surface specific without leaking timing oracle.
      const existing = await db.query.magicLinkTokens.findFirst({
        where: and(
          eq(magicLinkTokens.tokenHash, tokenHash),
          eq(magicLinkTokens.purpose, purpose),
        ),
      });

      if (!existing) {
        logger.warn({ event: 'magic_link.redeem_failed', reason: 'invalid', purpose });
        throw new AppError('MAGIC_LINK_INVALID', 'Invalid or unknown magic-link token', 400);
      }
      if (existing.usedAt !== null) {
        logger.warn({ event: 'magic_link.redeem_failed', reason: 'already_used', tokenId: existing.id, purpose });
        throw new AppError('MAGIC_LINK_ALREADY_USED', 'This magic link has already been used', 400);
      }
      if (existing.expiresAt.getTime() < Date.now()) {
        logger.warn({ event: 'magic_link.redeem_failed', reason: 'expired', tokenId: existing.id, purpose });
        throw new AppError('MAGIC_LINK_EXPIRED', 'This magic link has expired', 400);
      }
      // Should be unreachable, but be defensive.
      throw new AppError('MAGIC_LINK_INVALID', 'Magic link could not be redeemed', 400);
    }

    const row = rows[0];
    logger.info({
      event: 'magic_link.redeemed',
      tokenId: row.id,
      purpose: row.purpose,
      email: row.email,
    });
    return row;
  }

  /**
   * Manually revoke a token (e.g., on user-requested invalidation, email change).
   * Idempotent — already-revoked tokens are a no-op.
   */
  static async revokeToken(id: string): Promise<void> {
    await db
      .update(magicLinkTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(magicLinkTokens.id, id), sql`${magicLinkTokens.usedAt} IS NULL`));
    logger.info({ event: 'magic_link.revoked', tokenId: id });
  }

  /**
   * Build a magic-link URL the operator pastes into a browser. The plaintext
   * token IS in the URL — that's the contract; the URL is the secret.
   */
  static buildMagicLinkUrl(plaintext: string, purpose: MagicLinkPurpose): string {
    const u = new URL('/auth/magic', APP_URL);
    u.searchParams.set('token', plaintext);
    u.searchParams.set('purpose', purpose);
    return u.toString();
  }

  /**
   * Send a magic-link email. Templates are inline per the existing
   * EmailService pattern (verified 2026-04-30 — flat-file inline strings, no
   * subdirectory). Subject + body vary by purpose.
   *
   * Returns nothing; failures are swallowed (logged at warn) so the request
   * handler can return success even if email is undeliverable — security
   * trade-off: never reveal whether a target email exists.
   */
  static async sendMagicLinkEmail(args: {
    email: string;
    tokenPlaintext: string;
    purpose: MagicLinkPurpose;
    expiresAt: Date;
  }): Promise<void> {
    const { email, tokenPlaintext, purpose, expiresAt } = args;
    const url = this.buildMagicLinkUrl(tokenPlaintext, purpose);
    const expiryHours = Math.round((expiresAt.getTime() - Date.now()) / (60 * 60 * 1000));

    const { subject, intro, ctaLabel, footer } = this.getCopyForPurpose(purpose);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${BRAND_COLOR}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour &amp; Skills Registry</p>
  </div>
  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <p>${intro}</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${url}" style="background-color: ${BRAND_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">${ctaLabel}</a>
    </div>
    <p style="color: #666; font-size: 14px;">This link expires in ${expiryHours} hour(s) and can only be used once.</p>
    <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: ${BRAND_COLOR}; font-size: 14px;">${url}</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    <p style="color: #999; font-size: 12px;">${footer}</p>
    <p style="color: #999; font-size: 12px; text-align: center;">
      &copy; ${new Date().getFullYear()} Government of Oyo State. All rights reserved.
    </p>
  </div>
</body>
</html>`;

    const text = `${subject}\n\n${intro.replace(/<[^>]+>/g, '')}\n\n${ctaLabel}: ${url}\n\nThis link expires in ${expiryHours} hour(s) and can only be used once.\n\n${footer.replace(/<[^>]+>/g, '')}\n\n— Oyo State Labour & Skills Registry`;

    const result = await EmailService.sendGenericEmail({ to: email, subject, html, text });

    if (!result.success) {
      logger.warn({
        event: 'magic_link.email_failed',
        email,
        purpose,
        error: result.error,
      });
      // Do NOT re-throw — security trade-off (never leak whether an email exists).
    }
  }

  private static getCopyForPurpose(purpose: MagicLinkPurpose): {
    subject: string;
    intro: string;
    ctaLabel: string;
    footer: string;
  } {
    switch (purpose) {
      case 'wizard_resume':
        return {
          subject: 'Continue your Oyo State Skills Registry registration',
          intro: 'You started registering for the Oyo State Skills Registry but didn\'t finish. Pick up exactly where you left off — no need to re-enter what you\'ve already typed.',
          ctaLabel: 'Resume my registration',
          footer: 'If you didn\'t start a registration, you can safely ignore this email.',
        };
      case 'pending_nin_complete':
        return {
          subject: 'Add your NIN to complete your Oyo State Skills Registry registration',
          intro: 'Your registration was saved as pending because you didn\'t have your NIN to hand. Click below to add your NIN now and finish your registration.',
          ctaLabel: 'Add my NIN',
          footer: 'If you didn\'t request this email, you can safely ignore it. We will send a reminder again in a few days.',
        };
      case 'login':
        return {
          subject: 'Sign in to your Oyo State Skills Registry account',
          intro: 'You requested a sign-in link for your Oyo State Skills Registry account. The button below will sign you in.',
          ctaLabel: 'Sign in',
          footer: 'If you didn\'t request this sign-in link, you can safely ignore this email.',
        };
    }
  }
}

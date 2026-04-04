import { createHash, randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { marketplaceProfiles } from '../db/schema/marketplace.js';
import { respondents } from '../db/schema/respondents.js';
import { SMSService } from './sms.service.js';
import { getRedisClient } from '../lib/redis.js';
import pino from 'pino';

const logger = pino({ name: 'marketplace-edit-service' });

const EDIT_TOKEN_EXPIRY_DAYS = 90;
const RATE_LIMIT_PER_NIN = 3;
const RATE_LIMIT_WINDOW_SECONDS = 86400; // 24 hours

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateEditToken(): string {
  return randomBytes(16).toString('hex'); // 16 bytes = 32 hex chars
}

export interface MarketplaceProfileEditView {
  bio: string | null;
  portfolioUrl: string | null;
}

export class MarketplaceEditService {
  /**
   * Request an edit token for a marketplace profile.
   * Finds profile by phone number → generates token → sends SMS.
   *
   * ALWAYS returns 'success' to the controller (prevents phone enumeration).
   * Only sends SMS when profile exists and rate limit not exceeded.
   */
  static async requestEditToken(
    phoneNumber: string,
  ): Promise<{ status: 'success' | 'rate_limited' }> {
    // 1. Find respondent by phone number
    const [respondent] = await db
      .select({ id: respondents.id, nin: respondents.nin })
      .from(respondents)
      .where(eq(respondents.phoneNumber, phoneNumber))
      .limit(1);

    if (!respondent) {
      // No respondent → return success (prevent enumeration), no SMS sent
      logger.info({ event: 'marketplace.edit_token.phone_not_found' });
      return { status: 'success' };
    }

    // 2. Find marketplace profile
    const [profile] = await db
      .select({ id: marketplaceProfiles.id })
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.respondentId, respondent.id))
      .limit(1);

    if (!profile) {
      // Respondent exists but no marketplace profile → return success, no SMS
      logger.info({ event: 'marketplace.edit_token.no_profile', respondentId: respondent.id });
      return { status: 'success' };
    }

    // 3. Rate limit check: 3/day per NIN (falls back to respondent ID if NIN is null)
    const rateLimitKey = respondent.nin
      ? `rl:edit-token:${respondent.nin}`
      : `rl:edit-token:rid:${respondent.id}`;
    const redis = getRedisClient();
    const newCount = await redis.incr(rateLimitKey);
    if (newCount === 1) {
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
    }
    if (newCount > RATE_LIMIT_PER_NIN) {
      return { status: 'rate_limited' };
    }

    // 4. Generate token and store hash
    const token = generateEditToken();
    const hashedToken = hashToken(token);

    await db
      .update(marketplaceProfiles)
      .set({
        editToken: hashedToken,
        editTokenExpiresAt: new Date(
          Date.now() + EDIT_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        ),
        updatedAt: new Date(),
      })
      .where(eq(marketplaceProfiles.id, profile.id));

    // 5. Send SMS with edit link
    const domain = process.env.PUBLIC_APP_URL || 'http://localhost:5173';
    const editUrl = `${domain}/marketplace/edit/${token}`;
    const message = `Your OSLRS marketplace profile edit link: ${editUrl} — This link expires in 90 days and can only be used once.`;

    const smsResult = await SMSService.send(phoneNumber, message);
    if (!smsResult.success) {
      logger.warn({
        event: 'marketplace.edit_token.sms_failed',
        profileId: profile.id,
        error: smsResult.error,
      });
    }

    logger.info({ event: 'marketplace.edit_token.generated', profileId: profile.id });
    return { status: 'success' };
  }

  /**
   * Validate an edit token and return profile data for pre-population.
   */
  static async validateEditToken(
    token: string,
  ): Promise<
    | { status: 'valid'; profile: MarketplaceProfileEditView }
    | { status: 'expired' }
    | { status: 'invalid' }
  > {
    const hashedToken = hashToken(token);

    const [profile] = await db
      .select({
        editTokenExpiresAt: marketplaceProfiles.editTokenExpiresAt,
        bio: marketplaceProfiles.bio,
        portfolioUrl: marketplaceProfiles.portfolioUrl,
      })
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.editToken, hashedToken))
      .limit(1);

    if (!profile) {
      return { status: 'invalid' };
    }

    if (!profile.editTokenExpiresAt || profile.editTokenExpiresAt < new Date()) {
      return { status: 'expired' };
    }

    return {
      status: 'valid',
      profile: {
        bio: profile.bio,
        portfolioUrl: profile.portfolioUrl,
      },
    };
  }

  /**
   * Apply profile edit using edit token. Validates token, updates bio/portfolioUrl,
   * then consumes the token (set to null — single-use).
   */
  static async applyProfileEdit(
    token: string,
    bio: string | null,
    portfolioUrl: string | null,
  ): Promise<{ status: 'success' | 'expired' | 'invalid' }> {
    const hashedToken = hashToken(token);

    // Use a transaction to prevent TOCTOU race between validate and consume
    return await db.transaction(async (tx) => {
      const [profile] = await tx
        .select({
          id: marketplaceProfiles.id,
          editTokenExpiresAt: marketplaceProfiles.editTokenExpiresAt,
        })
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.editToken, hashedToken))
        .for('update')
        .limit(1);

      if (!profile) {
        return { status: 'invalid' as const };
      }

      if (!profile.editTokenExpiresAt || profile.editTokenExpiresAt < new Date()) {
        return { status: 'expired' as const };
      }

      // Update profile fields and consume token (single-use)
      await tx
        .update(marketplaceProfiles)
        .set({
          bio,
          portfolioUrl,
          editToken: null,
          editTokenExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceProfiles.id, profile.id));

      logger.info({ event: 'marketplace.profile_edit.applied', profileId: profile.id });
      return { status: 'success' as const };
    });
  }
}

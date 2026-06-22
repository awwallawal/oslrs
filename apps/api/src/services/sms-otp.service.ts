/**
 * Story 9-12 AC#7 / Task 2.2 — SMS OTP service.
 *
 * Mirrors the magic-link service shape: issue → store hash → verify atomic
 * single-use. Codes live for a short TTL (5min) and are stored as SHA-256
 * hashes keyed by phone number.
 *
 * Storage: Redis (string key with EX). Avoids a Drizzle migration; the OTP
 * lifecycle is short enough that Redis-only persistence is sufficient.
 *
 * The service is generic — its only feature-flag awareness is via the
 * adapter resolver. Routes 503 short-circuit when `auth.sms_otp_enabled = false`,
 * but if a caller invokes the service directly with the flag on, the noop
 * provider still rejects on send.
 */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError } from '@oslsr/utils';
import { getRedisClient } from '../lib/redis.js';
import { getSmsProvider } from './sms-provider.adapter.js';
import { NotificationMeter } from './notification-meter.service.js';
import pino from 'pino';

const logger = pino({ name: 'sms-otp-service' });

const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const OTP_LENGTH = 6;
const RATE_LIMIT_WINDOW_S = 60;

const REDIS_PREFIX = 'sms-otp:';

function otpKey(phone: string): string {
  return `${REDIS_PREFIX}code:${phone}`;
}
function lastSentKey(phone: string): string {
  return `${REDIS_PREFIX}last:${phone}`;
}

function generateCode(): string {
  // randomInt is uniformly distributed; left-pad to OTP_LENGTH digits.
  const max = 10 ** OTP_LENGTH;
  return String(randomInt(0, max)).padStart(OTP_LENGTH, '0');
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export class SmsOtpService {
  /**
   * Generate a 6-digit code, atomically claim the per-phone re-issue throttle
   * via `SET ... NX`, dispatch via the active SMS provider, then store the
   * hash for later verification.
   *
   * Code review MR-1 (2026-05-11, session 7) — atomic NX claim closes the
   * concurrent-call race where two simultaneous `requestOtp` calls for the
   * same phone could both see `lastSent = null` and both dispatch SMS. NX
   * also preserves the M2 invariant (provider failure releases the claim so
   * the user can retry without waiting for the 60-second window to elapse).
   *
   * Throws SMS_OTP_RATE_LIMITED if the same phone requested a code within the
   * last 60 seconds (per-phone re-issue throttle).
   */
  static async requestOtp(phone: string): Promise<{ expiresInSeconds: number }> {
    const redis = getRedisClient();

    // Atomic claim — if the key already exists, returns null and we abort.
    // If the key did not exist, NX sets it AND we own the dispatch slot.
    const claimed = await redis.set(
      lastSentKey(phone),
      '1',
      'EX',
      RATE_LIMIT_WINDOW_S,
      'NX',
    );
    if (!claimed) {
      throw new AppError(
        'SMS_OTP_RATE_LIMITED',
        'A code was sent recently. Please wait before requesting another.',
        429,
      );
    }

    const code = generateCode();
    const hash = hashCode(code);

    const provider = getSmsProvider();
    try {
      const result = await provider.sendOtp(phone, code);
      // Only persist the OTP hash after the provider confirmed dispatch.
      await redis.set(otpKey(phone), hash, 'EX', OTP_TTL_SECONDS);

      // Story 9-63 (Task 8 / AC7): count the SMS send through the same meter the
      // email chokepoint uses, so SMS volume + per-recipient abuse signals light
      // up automatically when a real provider (Termii) is bound. Fire-and-forget
      // AFTER a confirmed dispatch (the NoopSmsProvider throws before reaching
      // here, so the meter only ever counts a genuine send). Fail-open.
      await NotificationMeter.recordSmsSend({
        category: 'magiclink-login',
        recipient: phone,
      });

      logger.info({
        event: 'sms_otp.requested',
        phone,
        provider: provider.name,
        providerMessageId: result.providerMessageId,
      });
    } catch (err) {
      // Release the rate-limit claim so the user can retry immediately
      // rather than waiting out the 60-second window.
      await redis.del(lastSentKey(phone)).catch(() => { /* best-effort */ });
      throw err;
    }

    return { expiresInSeconds: OTP_TTL_SECONDS };
  }

  /**
   * Verify a 6-digit code against the stored hash. Atomic single-use: on
   * success the Redis key is DEL'd before returning so a replay throws
   * SMS_OTP_INVALID. Comparison uses `crypto.timingSafeEqual` (M4).
   */
  static async verifyOtp(phone: string, code: string): Promise<{ verified: true }> {
    const redis = getRedisClient();
    const stored = await redis.get(otpKey(phone));
    if (!stored) {
      throw new AppError('SMS_OTP_INVALID', 'Invalid or expired code', 400);
    }
    const submitted = hashCode(code);
    const a = Buffer.from(stored, 'hex');
    const b = Buffer.from(submitted, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AppError('SMS_OTP_INVALID', 'Invalid or expired code', 400);
    }
    await redis.del(otpKey(phone));
    logger.info({ event: 'sms_otp.verified', phone });
    return { verified: true };
  }
}

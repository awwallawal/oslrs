import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';

/**
 * Story 13-46 (AC1 / AC8) — the cap must be consulted from the REAL send chokepoint, BEFORE the
 * provider call. A unit test on the meter proves the counter; only this proves the cap is reached
 * from the path that actually sends.
 *
 * [[pattern-ship-a-fix-that-never-fires]] — a cap the send path never consults is the DEFAULT
 * outcome here, because `dispatch` has always called the meter AFTER the provider and thrown its
 * result away. The assertion that matters in this file is `getSentEmails()` being EMPTY.
 */

// The ledger write is not under test here and would need a DB.
vi.mock('../campaign-contact.service.js', () => ({
  recordCampaignSend: vi.fn().mockResolvedValue(undefined),
}));

// Spy on the operator page without needing a Telegram token. `isAlertSendEnabled` is false under
// vitest anyway (telegram-channel.ts:75) — mocking it TRUE is what proves the refusal actually
// reaches the dispatch call rather than being swallowed by the env gate.
const { mockSendTelegram, mockAlertEnabled } = vi.hoisted(() => ({
  mockSendTelegram: vi.fn().mockResolvedValue(true),
  mockAlertEnabled: vi.fn().mockReturnValue(true),
}));
vi.mock('../alerting/telegram-channel.js', () => ({
  sendTelegramMessage: (msg: string) => mockSendTelegram(msg),
  isAlertSendEnabled: () => mockAlertEnabled(),
}));

import { EmailService } from '../email.service.js';
import {
  NotificationMeter,
  METER_KEYS,
  MARKETING_DAILY_CAP,
} from '../notification-meter.service.js';
import { getMockEmailProvider, resetMockEmailProvider } from '../../providers/index.js';

describe('EmailService.dispatch → marketing cap (Story 13-46 AC1/AC8 — cap the SEND)', () => {
  let redis: InstanceType<typeof RedisMock>;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
    NotificationMeter.setRedisForTesting(redis as unknown as Redis);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'));
    resetMockEmailProvider();
    EmailService.initialize();
    mockSendTelegram.mockClear();
    // ⚠️ `vitest.base.ts` sets `mockReset: true`, so the implementation given at hoist time is
    // stripped before every test. Without this the mock resolves UNDEFINED, and since review A7 an
    // undelivered page releases the cooldown slot — so the cooldown test below would fail for a
    // reason that has nothing to do with cooldowns.
    mockSendTelegram.mockResolvedValue(true);
    mockAlertEnabled.mockReturnValue(true);
  });

  afterEach(async () => {
    vi.useRealTimers();
    NotificationMeter.setRedisForTesting(null);
    await redis.flushall();
    resetMockEmailProvider();
  });

  const payload = (to: string, subject = 'Thank you for registering') => ({
    to,
    subject,
    html: '<p>hi</p>',
    text: 'hi',
  });

  async function exhaustMarketingDailyCap(): Promise<void> {
    await redis.set(
      METER_KEYS.daily('email', 'thankyou-referral', '2026-08-20'),
      String(MARKETING_DAILY_CAP),
    );
  }

  describe('the refused direction', () => {
    it('makes NO PROVIDER CALL when the marketing cap is exhausted', async () => {
      await exhaustMarketingDailyCap();

      const result = await EmailService.sendGenericEmail(
        payload('listener@example.test'),
        'thankyou-referral',
        'thankyou-referral-auto',
      );

      // THE assertion this whole story turns on.
      expect(getMockEmailProvider().getSentEmails()).toHaveLength(0);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cap/i);
    });

    it('is LOUD — the refusal pages the operator, it is not a swallowed no-op', async () => {
      await exhaustMarketingDailyCap();

      await EmailService.sendGenericEmail(payload('listener@example.test'), 'reengagement-blast');

      expect(mockSendTelegram).toHaveBeenCalledTimes(1);
      const message = mockSendTelegram.mock.calls[0][0] as string;
      expect(message).toMatch(/cap/i);
      expect(message).toContain('reengagement-blast');
      expect(message).toContain(String(MARKETING_DAILY_CAP));
    });

    it('pages ONCE per window, not once per refused send — a burst must not flood Telegram', async () => {
      await exhaustMarketingDailyCap();

      for (let i = 0; i < 25; i++) {
        await EmailService.sendGenericEmail(payload(`listener${i}@example.test`), 'thankyou-referral');
      }

      expect(getMockEmailProvider().getSentEmails()).toHaveLength(0);
      expect(mockSendTelegram).toHaveBeenCalledTimes(1);
    });

    it('never pages from dev/test when the env gate is OFF (9-15 self-page incident)', async () => {
      mockAlertEnabled.mockReturnValue(false);
      await exhaustMarketingDailyCap();

      const result = await EmailService.sendGenericEmail(
        payload('listener@example.test'),
        'thankyou-referral',
      );

      // Still refused + still logged; only the PAGE is suppressed.
      expect(result.success).toBe(false);
      expect(getMockEmailProvider().getSentEmails()).toHaveLength(0);
      expect(mockSendTelegram).not.toHaveBeenCalled();
    });
  });

  describe('the ALLOWED direction — a cap that blocks everyone is as broken as no cap', () => {
    it('sends a marketing email normally below the cap', async () => {
      const result = await EmailService.sendGenericEmail(
        payload('listener@example.test'),
        'thankyou-referral',
        'thankyou-referral-auto',
      );

      expect(result.success).toBe(true);
      expect(getMockEmailProvider().getSentEmails()).toHaveLength(1);
      expect(mockSendTelegram).not.toHaveBeenCalled();
    });

    it.each([
      ['magiclink-login', 'Sign in to your Oyo State Skills Registry account'],
      ['password-reset', 'Password Reset Request - OSLSR'],
      ['health-alert-digest', '[CRITICAL] OSLRS System Health Digest (2 alerts)'],
    ] as const)(
      'still sends TRANSACTIONAL %s with the marketing cap fully exhausted',
      async (category, subject) => {
        await exhaustMarketingDailyCap();

        const result = await EmailService.sendGenericEmail(
          payload('citizen@example.test', subject),
          category,
        );

        expect(result.success).toBe(true);
        expect(getMockEmailProvider().getSentEmails()).toHaveLength(1);
      },
    );

    it('still sends MARKETING when Redis is unreachable — fail-open on infrastructure', async () => {
      const exploding = {
        mget: vi.fn().mockRejectedValue(new Error('connection refused')),
      } as unknown as Redis;
      NotificationMeter.setRedisForTesting(exploding);

      const result = await EmailService.sendGenericEmail(
        payload('listener@example.test'),
        'thankyou-referral',
      );

      expect(result.success).toBe(true);
      expect(getMockEmailProvider().getSentEmails()).toHaveLength(1);
    });
  });

  describe('an UNDELIVERED page must not burn the cooldown slot (review A7 / finding M5)', () => {
    /**
     * `sendTelegramMessage` never throws — it returns `false` on a missing token, a non-2xx from
     * Telegram, or a fetch failure. The cooldown key used to be claimed BEFORE the send and the
     * boolean discarded, so ONE transient failure at the moment the cap first bound cost the
     * operator the page for the whole 6-hour window while `logger.error` kept firing per refused
     * send — the "logged and forgotten" shape `reportCapRefusal` exists to prevent, inside itself.
     */
    it('retries the page on the NEXT refusal when the first dispatch reports failure', async () => {
      mockSendTelegram.mockResolvedValue(false); // Telegram 500, or no bot token configured
      await exhaustMarketingDailyCap();

      await EmailService.sendGenericEmail(payload('one@example.test'), 'thankyou-referral');
      await EmailService.sendGenericEmail(payload('two@example.test'), 'thankyou-referral');

      // Both refusals attempted a page, because neither landed.
      expect(mockSendTelegram).toHaveBeenCalledTimes(2);
    });

    it('still suppresses the second page once one has actually been DELIVERED', async () => {
      mockSendTelegram.mockResolvedValue(true);
      await exhaustMarketingDailyCap();

      await EmailService.sendGenericEmail(payload('one@example.test'), 'thankyou-referral');
      await EmailService.sendGenericEmail(payload('two@example.test'), 'thankyou-referral');

      expect(mockSendTelegram).toHaveBeenCalledTimes(1);
    });
  });
});

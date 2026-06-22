import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { NotificationMeter, METER_KEYS } from '../notification-meter.service.js';
import { classifyEmailSubject } from '../notification-category.js';

describe('NotificationMeter (Story 9-63 Task 2 / AC1, AC7)', () => {
  let redis: InstanceType<typeof RedisMock>;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
    NotificationMeter.setRedisForTesting(redis as unknown as Redis);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T12:00:00Z'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    NotificationMeter.setRedisForTesting(null);
    await redis.flushall();
  });

  describe('classifier (shared category mapping)', () => {
    it('buckets every known subject into its category', () => {
      expect(classifyEmailSubject('Sign in to your Oyo State Skills Registry account')).toBe('magiclink-login');
      expect(classifyEmailSubject('Continue your Oyo State Skills Registry registration')).toBe('magiclink-wizard-resume');
      expect(classifyEmailSubject('Add your NIN to complete your registration')).toBe('pending-nin-reminder');
      expect(classifyEmailSubject('One more step for your Oyo State Skills Registry profile')).toBe('supplemental-survey');
      expect(classifyEmailSubject('Registration Attempt Detected - OSLSR')).toBe('duplicate-registration');
      expect(classifyEmailSubject('Password Reset Request - OSLSR')).toBe('password-reset');
      expect(classifyEmailSubject("You've been invited to join OSLSR - Field Officer")).toBe('staff-invitation');
      expect(classifyEmailSubject('[OSLRS] Payment Recorded — Tranche 1')).toBe('payment-notification');
      expect(classifyEmailSubject('[OSLRS] Payment Dispute Raised — Jane')).toBe('dispute');
      expect(classifyEmailSubject('[OSLRS] Daily Backup Completed Successfully')).toBe('backup-success');
      expect(classifyEmailSubject('[OSLRS] CRITICAL: Daily Backup Failed')).toBe('backup-FAILURE');
      expect(classifyEmailSubject('[CRITICAL] OSLRS System Health Digest (2 alerts)')).toBe('health-alert-digest');
      expect(classifyEmailSubject('Your Oyo State Skills Registry status')).toBe('registration-status');
      expect(classifyEmailSubject('[OSLRS] You have 3 notifications')).toBe('notification-digest');
      expect(classifyEmailSubject('Some unrelated subject')).toBe('other');
    });
  });

  describe('record', () => {
    it('increments per-category daily + monthly counters on a sent email', async () => {
      await NotificationMeter.recordEmailSend({
        subject: 'Sign in to your Oyo State Skills Registry account',
        recipient: 'a@b.com',
      });

      const daily = await redis.get(METER_KEYS.daily('email', 'magiclink-login', '2026-06-22'));
      const monthly = await redis.get(METER_KEYS.monthly('email', 'magiclink-login', '2026-06'));
      expect(daily).toBe('1');
      expect(monthly).toBe('1');
    });

    it('accumulates repeated sends in the same category', async () => {
      for (let i = 0; i < 3; i++) {
        await NotificationMeter.recordEmailSend({
          subject: 'Add your NIN to complete your registration',
          recipient: `r${i}@b.com`,
        });
      }
      const daily = await redis.get(METER_KEYS.daily('email', 'pending-nin-reminder', '2026-06-22'));
      expect(daily).toBe('3');
    });

    it('sets a TTL on the daily key so it self-expires', async () => {
      await NotificationMeter.recordEmailSend({
        subject: 'Your Oyo State Skills Registry status',
        recipient: 'a@b.com',
      });
      const ttl = await redis.ttl(METER_KEYS.daily('email', 'registration-status', '2026-06-22'));
      expect(ttl).toBeGreaterThan(0);
    });

    it('tracks per-recipient frequency for abuse detection', async () => {
      for (let i = 0; i < 4; i++) {
        await NotificationMeter.recordEmailSend({
          subject: 'Sign in to your account',
          recipient: 'victim@b.com',
        });
      }
      // recipient key is hashed; read via the same builder the meter uses.
      const keys = await redis.keys('email:recipient:count:*');
      expect(keys.length).toBe(1);
      const count = await redis.get(keys[0]);
      expect(count).toBe('4');
    });

    it('honours an explicit category override (blast scripts)', async () => {
      await NotificationMeter.recordEmailSend({
        subject: 'whatever the blast subject is',
        recipient: 'a@b.com',
        category: 'reengagement-blast',
      });
      const daily = await redis.get(METER_KEYS.daily('email', 'reengagement-blast', '2026-06-22'));
      expect(daily).toBe('1');
    });

    it('separates bounce/complaint events from the positive volume', async () => {
      await NotificationMeter.recordEmailSend({
        subject: 'Sign in to your account',
        recipient: 'a@b.com',
        event: 'bounced',
      });
      const sent = await redis.get(METER_KEYS.daily('email', 'magiclink-login', '2026-06-22'));
      const bounced = await redis.get(METER_KEYS.daily('email', 'magiclink-login:bounced', '2026-06-22'));
      expect(sent).toBeNull();
      expect(bounced).toBe('1');
    });

    it('records SMS sends under the sms channel namespace (AC7 parity)', async () => {
      await NotificationMeter.recordSmsSend({ category: 'magiclink-login', recipient: '+2348012345678' });
      const daily = await redis.get(METER_KEYS.daily('sms', 'magiclink-login', '2026-06-22'));
      const monthly = await redis.get(METER_KEYS.monthly('sms', 'magiclink-login', '2026-06'));
      expect(daily).toBe('1');
      expect(monthly).toBe('1');
      // email namespace must be untouched
      expect(await redis.get(METER_KEYS.daily('email', 'magiclink-login', '2026-06-22'))).toBeNull();
    });

    it('fails open when no Redis is available (never throws)', async () => {
      NotificationMeter.setRedisForTesting(null);
      // Force getRedisClient path to also be unavailable by unsetting REDIS_URL.
      const prev = process.env.REDIS_URL;
      delete process.env.REDIS_URL;
      const prevNode = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production'; // makes getRedisClient throw without REDIS_URL
      try {
        await expect(
          NotificationMeter.recordEmailSend({ subject: 'x', recipient: 'a@b.com' }),
        ).resolves.toBe('other');
      } finally {
        if (prev !== undefined) process.env.REDIS_URL = prev;
        if (prevNode !== undefined) process.env.NODE_ENV = prevNode;
        else delete process.env.NODE_ENV;
      }
    });
  });
});

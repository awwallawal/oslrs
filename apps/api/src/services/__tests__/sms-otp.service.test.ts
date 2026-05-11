import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '@oslsr/utils';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockSendOtp = vi.fn();

// MR-1 (2026-05-11 session 7) — service now uses atomic `SET ... NX`
// instead of MULTI/EXEC. The mock matches the simpler shape.
vi.mock('../../lib/redis.js', () => ({
  getRedisClient: () => ({
    get: (...args: unknown[]) => mockGet(...args),
    set: (...args: unknown[]) => mockSet(...args),
    del: (...args: unknown[]) => mockDel(...args),
  }),
}));

vi.mock('../sms-provider.adapter.js', async () => {
  const actual = await vi.importActual<typeof import('../sms-provider.adapter.js')>('../sms-provider.adapter.js');
  return {
    ...actual,
    getSmsProvider: () => ({
      name: 'mock',
      sendOtp: (...args: unknown[]) => mockSendOtp(...args),
    }),
  };
});

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { SmsOtpService } from '../sms-otp.service.js';
import { NoopSmsProvider } from '../sms-provider.adapter.js';

describe('SmsOtpService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('requestOtp', () => {
    it('rate-limits a re-issue within 60 seconds (NX claim returns null)', async () => {
      // MR-1 (2026-05-11) — atomic claim via SET ... NX. When the key
      // already exists, the NX call resolves to null; we abort with
      // SMS_OTP_RATE_LIMITED before any dispatch.
      mockSet.mockResolvedValueOnce(null);
      await expect(SmsOtpService.requestOtp('+2348012345678')).rejects.toMatchObject({
        code: 'SMS_OTP_RATE_LIMITED',
        statusCode: 429,
      });
      expect(mockSendOtp).not.toHaveBeenCalled();
    });

    it('issues a code and dispatches it via the provider', async () => {
      // 1st set = NX claim (returns 'OK' → claim succeeded).
      mockSet.mockResolvedValueOnce('OK');
      mockSendOtp.mockResolvedValueOnce({ providerMessageId: 'mock-id' });
      // 2nd set = OTP hash storage after provider succeeds.
      mockSet.mockResolvedValueOnce('OK');

      const result = await SmsOtpService.requestOtp('+2348012345678');

      expect(result.expiresInSeconds).toBeGreaterThan(0);
      // NX claim + OTP hash store = 2 set calls.
      expect(mockSet).toHaveBeenCalledTimes(2);
      expect(mockSendOtp).toHaveBeenCalledTimes(1);
      // First arg is phone, second is the 6-digit code
      const [phoneArg, codeArg] = mockSendOtp.mock.calls[0] as [string, string];
      expect(phoneArg).toBe('+2348012345678');
      expect(codeArg).toMatch(/^\d{6}$/);
    });

    it('releases the rate-limit claim on provider failure (MR-1)', async () => {
      // Claim succeeds, provider throws → DEL should fire so the user can retry.
      mockSet.mockResolvedValueOnce('OK');
      mockSendOtp.mockRejectedValueOnce(new Error('provider unavailable'));
      mockDel.mockResolvedValueOnce(1);

      await expect(SmsOtpService.requestOtp('+2348012345678')).rejects.toThrow(/provider unavailable/);
      expect(mockDel).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyOtp', () => {
    it('rejects when no stored code exists', async () => {
      mockGet.mockResolvedValueOnce(null);
      await expect(SmsOtpService.verifyOtp('+2348012345678', '123456')).rejects.toThrow(/invalid|expired/i);
    });

    it('rejects on hash mismatch', async () => {
      mockGet.mockResolvedValueOnce('hash-of-something-else');
      await expect(SmsOtpService.verifyOtp('+2348012345678', '123456')).rejects.toThrow(/invalid|expired/i);
    });

    it('accepts a correct code and DELs the key (single-use)', async () => {
      // Compute expected hash deterministically
      const { createHash } = await import('node:crypto');
      const expected = createHash('sha256').update('123456').digest('hex');
      mockGet.mockResolvedValueOnce(expected);

      const result = await SmsOtpService.verifyOtp('+2348012345678', '123456');
      expect(result.verified).toBe(true);
      expect(mockDel).toHaveBeenCalledTimes(1);
    });
  });
});

describe('NoopSmsProvider', () => {
  it('rejects every send with SMS_OTP_DISABLED', async () => {
    const noop = new NoopSmsProvider();
    await expect(noop.sendOtp('+2348012345678', '123456')).rejects.toBeInstanceOf(AppError);
    await expect(noop.sendOtp('+2348012345678', '123456')).rejects.toMatchObject({
      code: 'SMS_OTP_DISABLED',
      statusCode: 503,
    });
  });
});

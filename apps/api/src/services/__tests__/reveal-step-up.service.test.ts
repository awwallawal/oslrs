import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockSet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
}));

vi.mock('../../lib/redis.js', () => ({
  getRedisClient: () => ({ get: mockGet, set: mockSet }),
}));

describe('RevealStepUpService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    // Disable test-mode so the Redis path is exercised.
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E', '');
  });

  describe('getSatisfiedLevel', () => {
    it('returns captcha baseline when no marker exists', async () => {
      mockGet.mockResolvedValue(null);
      const { RevealStepUpService } = await import('../reveal-step-up.service.js');
      expect(await RevealStepUpService.getSatisfiedLevel('v1')).toBe('captcha');
    });

    it('returns the stored rung', async () => {
      mockGet.mockResolvedValue('mfa');
      const { RevealStepUpService } = await import('../reveal-step-up.service.js');
      expect(await RevealStepUpService.getSatisfiedLevel('v1')).toBe('mfa');
    });

    it('fails toward the baseline (captcha) on a Redis error', async () => {
      mockGet.mockRejectedValue(new Error('redis down'));
      const { RevealStepUpService } = await import('../reveal-step-up.service.js');
      expect(await RevealStepUpService.getSatisfiedLevel('v1')).toBe('captcha');
    });

    it('treats a garbage stored value as baseline', async () => {
      mockGet.mockResolvedValue('not-a-rung');
      const { RevealStepUpService } = await import('../reveal-step-up.service.js');
      expect(await RevealStepUpService.getSatisfiedLevel('v1')).toBe('captcha');
    });
  });

  describe('recordSatisfied', () => {
    it('persists the rung with a TTL', async () => {
      mockGet.mockResolvedValue(null);
      const { RevealStepUpService } = await import('../reveal-step-up.service.js');
      await RevealStepUpService.recordSatisfied('v1', 'otp');
      expect(mockSet).toHaveBeenCalledWith('reveal:stepup:v1', 'otp', 'EX', expect.any(Number));
    });

    it('does NOT downgrade a stronger live marker', async () => {
      mockGet.mockResolvedValue('mfa');
      const { RevealStepUpService } = await import('../reveal-step-up.service.js');
      await RevealStepUpService.recordSatisfied('v1', 'otp');
      // Keeps mfa, not otp.
      expect(mockSet).toHaveBeenCalledWith('reveal:stepup:v1', 'mfa', 'EX', expect.any(Number));
    });

    it('upgrades a weaker live marker', async () => {
      mockGet.mockResolvedValue('otp');
      const { RevealStepUpService } = await import('../reveal-step-up.service.js');
      await RevealStepUpService.recordSatisfied('v1', 'mfa');
      expect(mockSet).toHaveBeenCalledWith('reveal:stepup:v1', 'mfa', 'EX', expect.any(Number));
    });

    it('never throws on a Redis error', async () => {
      mockGet.mockResolvedValue(null);
      mockSet.mockRejectedValue(new Error('redis down'));
      const { RevealStepUpService } = await import('../reveal-step-up.service.js');
      await expect(RevealStepUpService.recordSatisfied('v1', 'otp')).resolves.toBeUndefined();
    });
  });
});

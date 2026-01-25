import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import { EmailBudgetService } from '../email-budget.service.js';

describe('EmailBudgetService', () => {
  let redis: InstanceType<typeof RedisMock>;
  let service: EmailBudgetService;

  beforeEach(async () => {
    redis = new RedisMock();
    // Clear any existing data
    await redis.flushall();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-25T12:00:00Z'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await redis.flushall();
  });

  describe('Free Tier', () => {
    beforeEach(() => {
      service = new EmailBudgetService(redis as unknown as import('ioredis').Redis, 'free');
    });

    it('should allow sending when under daily limit', async () => {
      // Set daily count to 50 (under 100 limit)
      await redis.set('email:daily:count:2026-01-25', '50');

      const result = await service.checkBudget();

      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('free');
      expect(result.usage.dailyCount).toBe(50);
      expect(result.usage.dailyLimit).toBe(100);
    });

    it('should block sending when at daily limit', async () => {
      // Set daily count to 100 (at limit)
      await redis.set('email:daily:count:2026-01-25', '100');

      const result = await service.checkBudget();

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('daily_limit');
    });

    it('should block sending when at monthly limit', async () => {
      // Set monthly count to 3000 (at limit)
      await redis.set('email:monthly:count:2026-01', '3000');

      const result = await service.checkBudget();

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('monthly_limit');
    });

    it('should increment counters on recordSend', async () => {
      await service.recordSend();

      const dailyCount = await redis.get('email:daily:count:2026-01-25');
      const monthlyCount = await redis.get('email:monthly:count:2026-01');

      expect(dailyCount).toBe('1');
      expect(monthlyCount).toBe('1');
    });

    it('should return correct budget status', async () => {
      await redis.set('email:daily:count:2026-01-25', '80');
      await redis.set('email:monthly:count:2026-01', '2400');

      const status = await service.getBudgetStatus();

      expect(status.tier).toBe('free');
      expect(status.dailyUsage.count).toBe(80);
      expect(status.dailyUsage.limit).toBe(100);
      expect(status.dailyUsage.percentage).toBe(80);
      expect(status.dailyUsage.isWarning).toBe(true);
      expect(status.monthlyUsage.count).toBe(2400);
      expect(status.monthlyUsage.limit).toBe(3000);
      expect(status.monthlyUsage.percentage).toBe(80);
      expect(status.monthlyUsage.isWarning).toBe(true);
    });

    it('should calculate remaining daily capacity', async () => {
      await redis.set('email:daily:count:2026-01-25', '75');

      const remaining = await service.getRemainingDailyCapacity();

      expect(remaining).toBe(25);
    });

    it('should calculate remaining monthly capacity', async () => {
      await redis.set('email:monthly:count:2026-01', '2500');

      const remaining = await service.getRemainingMonthlyCapacity();

      expect(remaining).toBe(500);
    });
  });

  describe('Pro Tier', () => {
    beforeEach(() => {
      // $30 overage budget = 3000 cents
      service = new EmailBudgetService(redis as unknown as import('ioredis').Redis, 'pro', 3000);
    });

    it('should have no daily limit', async () => {
      // Set high daily count
      await redis.set('email:daily:count:2026-01-25', '5000');

      const result = await service.checkBudget();

      expect(result.allowed).toBe(true);
    });

    it('should allow overage within budget', async () => {
      // Set monthly count to 55000 (5000 over 50000 limit)
      await redis.set('email:monthly:count:2026-01', '55000');
      // Overage cost: 5000 emails * $0.0009 = $4.50 = 450 cents
      await redis.set('email:overage:cost:2026-01', '450');

      const result = await service.checkBudget();

      expect(result.allowed).toBe(true);
      expect(result.usage.overageCostCents).toBe(450);
    });

    it('should block when overage budget exhausted', async () => {
      // Set monthly count way over
      await redis.set('email:monthly:count:2026-01', '90000');
      // Overage cost exceeds $30 budget
      await redis.set('email:overage:cost:2026-01', '3500'); // $35

      const result = await service.checkBudget();

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('overage_budget');
    });

    it('should return -1 for remaining daily capacity (no limit)', async () => {
      const remaining = await service.getRemainingDailyCapacity();

      expect(remaining).toBe(-1);
    });

    it('should include overage info in budget status', async () => {
      await redis.set('email:monthly:count:2026-01', '55000');
      await redis.set('email:overage:cost:2026-01', '450');

      const status = await service.getBudgetStatus();

      expect(status.overage).toBeDefined();
      expect(status.overage?.costCents).toBe(450);
      expect(status.overage?.budgetCents).toBe(3000);
      expect(status.overage?.percentage).toBe(15);
      expect(status.overage?.isWarning).toBe(false);
    });

    it('should calculate overage cost on recordSend', async () => {
      // Set just over monthly limit
      await redis.set('email:monthly:count:2026-01', '50001');

      await service.recordSend();

      const monthlyCount = await redis.get('email:monthly:count:2026-01');
      expect(monthlyCount).toBe('50002');

      // Overage cost should be calculated
      const overageCost = await redis.get('email:overage:cost:2026-01');
      // 2 overage emails * $0.0009 = ~1 cent (rounded up)
      expect(parseInt(overageCost || '0')).toBeGreaterThan(0);
    });
  });

  describe('Scale Tier', () => {
    beforeEach(() => {
      service = new EmailBudgetService(redis as unknown as import('ioredis').Redis, 'scale', 5000);
    });

    it('should have 100k monthly limit', async () => {
      await redis.set('email:monthly:count:2026-01', '99000');

      const result = await service.checkBudget();

      expect(result.allowed).toBe(true);
      expect(result.usage.monthlyLimit).toBe(100000);
    });
  });

  describe('Warning Thresholds', () => {
    beforeEach(() => {
      service = new EmailBudgetService(redis as unknown as import('ioredis').Redis, 'free');
    });

    it('should flag warning at 80% daily usage', async () => {
      await redis.set('email:daily:count:2026-01-25', '80');

      const status = await service.getBudgetStatus();

      expect(status.dailyUsage.isWarning).toBe(true);
      expect(status.dailyUsage.isExhausted).toBe(false);
    });

    it('should flag exhausted at 100% daily usage', async () => {
      await redis.set('email:daily:count:2026-01-25', '100');

      const status = await service.getBudgetStatus();

      expect(status.dailyUsage.isExhausted).toBe(true);
    });

    it('should flag warning at 80% monthly usage', async () => {
      await redis.set('email:monthly:count:2026-01', '2400');

      const status = await service.getBudgetStatus();

      expect(status.monthlyUsage.isWarning).toBe(true);
      expect(status.monthlyUsage.isExhausted).toBe(false);
    });
  });

  describe('Bulk Import Scenarios', () => {
    it('should handle 132 staff import on free tier (2 days)', async () => {
      service = new EmailBudgetService(redis as unknown as import('ioredis').Redis, 'free');

      // Day 1: First 100 emails
      for (let i = 0; i < 100; i++) {
        const check = await service.checkBudget();
        expect(check.allowed).toBe(true);
        await service.recordSend();
      }

      // 101st email should be blocked
      const check101 = await service.checkBudget();
      expect(check101.allowed).toBe(false);
      expect(check101.reason).toBe('daily_limit');

      // Simulate next day
      vi.setSystemTime(new Date('2026-01-26T12:00:00Z'));

      // Day 2: Remaining 32 emails
      for (let i = 0; i < 32; i++) {
        const check = await service.checkBudget();
        expect(check.allowed).toBe(true);
        await service.recordSend();
      }

      // Total monthly should be 132
      const monthlyCount = await redis.get('email:monthly:count:2026-01');
      expect(parseInt(monthlyCount || '0')).toBe(132);
    });

    it('should handle 132 staff import on pro tier (immediate)', async () => {
      service = new EmailBudgetService(redis as unknown as import('ioredis').Redis, 'pro', 3000);

      // All 132 emails should be allowed immediately
      for (let i = 0; i < 132; i++) {
        const check = await service.checkBudget();
        expect(check.allowed).toBe(true);
        await service.recordSend();
      }

      const dailyCount = await redis.get('email:daily:count:2026-01-25');
      const monthlyCount = await redis.get('email:monthly:count:2026-01');
      expect(parseInt(dailyCount || '0')).toBe(132);
      expect(parseInt(monthlyCount || '0')).toBe(132);
    });
  });
});

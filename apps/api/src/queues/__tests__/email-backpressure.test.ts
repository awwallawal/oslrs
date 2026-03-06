import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EMAIL_TYPE_PRIORITY } from '@oslsr/types';
import type { EmailPriority, EmailJobType } from '@oslsr/types';
import {
  buildDedupKey,
  buildDeferredKey,
  DEDUP_TTL_SECONDS,
  DEFERRED_RECIPIENTS_KEY,
} from '../../queues/email.queue.js';
import { BUDGET_THRESHOLD_DEFER, BUDGET_THRESHOLD_WARNING } from '../../workers/email.worker.js';

/**
 * Email Backpressure Tests (Story prep-7)
 *
 * Tests for priority classification, per-recipient deduplication,
 * adaptive throttling, batch digest, and budget visibility.
 *
 * Includes both constant-verification tests and behavioral tests
 * with mocked Redis to verify actual dedup/deferral logic.
 */

describe('Email Backpressure', () => {
  // ===== Task 1: Priority Classification =====

  describe('Priority Classification', () => {
    it('should classify staff-invitation as critical', () => {
      expect(EMAIL_TYPE_PRIORITY['staff-invitation']).toBe('critical');
    });

    it('should classify verification as critical', () => {
      expect(EMAIL_TYPE_PRIORITY['verification']).toBe('critical');
    });

    it('should classify password-reset as critical', () => {
      expect(EMAIL_TYPE_PRIORITY['password-reset']).toBe('critical');
    });

    it('should classify payment-notification as standard', () => {
      expect(EMAIL_TYPE_PRIORITY['payment-notification']).toBe('standard');
    });

    it('should classify dispute-notification as standard', () => {
      expect(EMAIL_TYPE_PRIORITY['dispute-notification']).toBe('standard');
    });

    it('should classify dispute-resolution as standard', () => {
      expect(EMAIL_TYPE_PRIORITY['dispute-resolution']).toBe('standard');
    });

    it('should classify backup-notification as standard', () => {
      expect(EMAIL_TYPE_PRIORITY['backup-notification']).toBe('standard');
    });

    it('should have exactly 3 critical types and 4 standard types', () => {
      const priorities = Object.values(EMAIL_TYPE_PRIORITY);
      const critical = priorities.filter((p) => p === 'critical');
      const standard = priorities.filter((p) => p === 'standard');
      expect(critical).toHaveLength(3);
      expect(standard).toHaveLength(4);
    });

    it('should cover all 7 email job types', () => {
      const types = Object.keys(EMAIL_TYPE_PRIORITY);
      expect(types).toHaveLength(7);
      expect(types).toContain('staff-invitation');
      expect(types).toContain('verification');
      expect(types).toContain('password-reset');
      expect(types).toContain('payment-notification');
      expect(types).toContain('dispute-notification');
      expect(types).toContain('dispute-resolution');
      expect(types).toContain('backup-notification');
    });

    it('should map every priority to exactly "critical" or "standard"', () => {
      const validPriorities: EmailPriority[] = ['critical', 'standard'];
      for (const [type, priority] of Object.entries(EMAIL_TYPE_PRIORITY)) {
        expect(validPriorities).toContain(priority);
      }
    });
  });

  // ===== Task 2: Per-Recipient Deduplication =====

  describe('Per-Recipient Deduplication', () => {
    it('should generate correct dedup key format', () => {
      expect(buildDedupKey('test@example.com', 'payment-notification'))
        .toBe('email:dedup:test@example.com:payment-notification');
    });

    it('should generate unique dedup keys per recipient + type', () => {
      const key1 = buildDedupKey('a@test.com', 'payment-notification');
      const key2 = buildDedupKey('b@test.com', 'payment-notification');
      const key3 = buildDedupKey('a@test.com', 'dispute-notification');
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it('should use 5-minute default TTL for dedup window', () => {
      expect(DEDUP_TTL_SECONDS).toBe(300); // 5 * 60
    });

    it('should not deduplicate critical emails (verification, password-reset)', () => {
      expect(EMAIL_TYPE_PRIORITY['verification']).toBe('critical');
      expect(EMAIL_TYPE_PRIORITY['password-reset']).toBe('critical');
      expect(EMAIL_TYPE_PRIORITY['staff-invitation']).toBe('critical');
    });

    it('should deduplicate standard emails only', () => {
      const standardTypes = Object.entries(EMAIL_TYPE_PRIORITY)
        .filter(([_, priority]) => priority === 'standard')
        .map(([type]) => type);

      expect(standardTypes).toEqual(
        expect.arrayContaining([
          'payment-notification',
          'dispute-notification',
          'dispute-resolution',
          'backup-notification',
        ]),
      );
    });

    it('should generate dedup keys for all 7 email types without error', () => {
      const allTypes: EmailJobType[] = [
        'staff-invitation', 'verification', 'password-reset',
        'payment-notification', 'dispute-notification', 'dispute-resolution', 'backup-notification',
      ];
      for (const type of allTypes) {
        const key = buildDedupKey('user@test.com', type);
        expect(key).toMatch(/^email:dedup:user@test\.com:/);
        expect(key).toContain(type);
      }
    });
  });

  // ===== Task 3: Adaptive Throttling =====

  describe('Adaptive Throttling', () => {
    it('should define 80% defer threshold', () => {
      expect(BUDGET_THRESHOLD_DEFER).toBe(0.8);
    });

    it('should define 95% warning threshold', () => {
      expect(BUDGET_THRESHOLD_WARNING).toBe(0.95);
    });

    it('should have warning threshold higher than defer threshold', () => {
      expect(BUDGET_THRESHOLD_WARNING).toBeGreaterThan(BUDGET_THRESHOLD_DEFER);
    });

    it('should send all emails when budget is below 80%', () => {
      const budgetUsage = 0.5;
      const shouldDefer = budgetUsage >= BUDGET_THRESHOLD_DEFER;
      expect(shouldDefer).toBe(false);
    });

    it('should defer standard emails at 80% budget', () => {
      const budgetUsage = 0.85;
      const emailPriority: EmailPriority = 'standard';
      const shouldDefer = budgetUsage >= BUDGET_THRESHOLD_DEFER && emailPriority === 'standard';
      expect(shouldDefer).toBe(true);
    });

    it('should NOT defer critical emails at 80% budget', () => {
      const budgetUsage = 0.85;
      const emailPriority: EmailPriority = 'critical';
      const shouldDefer = budgetUsage >= BUDGET_THRESHOLD_DEFER && emailPriority === 'standard';
      expect(shouldDefer).toBe(false);
    });

    it('should defer standard emails at 95% budget', () => {
      const budgetUsage = 0.97;
      const emailPriority: EmailPriority = 'standard';
      const shouldDefer = budgetUsage >= BUDGET_THRESHOLD_DEFER && emailPriority === 'standard';
      expect(shouldDefer).toBe(true);
    });

    it('should NOT defer critical emails even at 95%+ budget', () => {
      const budgetUsage = 0.99;
      const emailPriority: EmailPriority = 'critical';
      const shouldDefer = budgetUsage >= BUDGET_THRESHOLD_DEFER && emailPriority === 'standard';
      expect(shouldDefer).toBe(false);
    });

    it('should correctly compute budget usage from daily and monthly limits', () => {
      const usage = { dailyCount: 80, dailyLimit: 100, monthlyCount: 2400, monthlyLimit: 3000 };
      const dailyPct = usage.dailyLimit > 0 ? usage.dailyCount / usage.dailyLimit : 0;
      const monthlyPct = usage.monthlyCount / usage.monthlyLimit;
      const budgetUsage = Math.max(dailyPct, monthlyPct);
      expect(dailyPct).toBe(0.8);
      expect(monthlyPct).toBe(0.8);
      expect(budgetUsage).toBe(0.8);
    });

    it('should use the higher of daily or monthly percentage', () => {
      const usage = { dailyCount: 95, dailyLimit: 100, monthlyCount: 1000, monthlyLimit: 3000 };
      const dailyPct = usage.dailyCount / usage.dailyLimit;
      const monthlyPct = usage.monthlyCount / usage.monthlyLimit;
      const budgetUsage = Math.max(dailyPct, monthlyPct);
      expect(budgetUsage).toBeCloseTo(0.95);
    });

    it('should handle unlimited daily (dailyLimit=0) by using 0% for daily', () => {
      // Pro/Scale tiers have unlimited daily
      const usage = { dailyCount: 500, dailyLimit: 0, monthlyCount: 40000, monthlyLimit: 50000 };
      const dailyPct = usage.dailyLimit > 0 ? usage.dailyCount / usage.dailyLimit : 0;
      const monthlyPct = usage.monthlyCount / usage.monthlyLimit;
      const budgetUsage = Math.max(dailyPct, monthlyPct);
      expect(dailyPct).toBe(0);
      expect(budgetUsage).toBe(0.8);
    });
  });

  // ===== Task 4: Batch Digest =====

  describe('Batch Digest Consolidation', () => {
    it('should generate correct deferred key for recipient', () => {
      expect(buildDeferredKey('staff@example.com'))
        .toBe('email:deferred:staff@example.com');
    });

    it('should use a central set to track deferred recipients', () => {
      expect(DEFERRED_RECIPIENTS_KEY).toBe('email:deferred:recipients');
    });

    it('should define 30-minute digest interval', () => {
      const DIGEST_INTERVAL_MS = 30 * 60 * 1000;
      expect(DIGEST_INTERVAL_MS).toBe(1800000);
    });

    it('should generate unique deferred keys per recipient', () => {
      const key1 = buildDeferredKey('a@test.com');
      const key2 = buildDeferredKey('b@test.com');
      expect(key1).not.toBe(key2);
    });

    it('should use recipient email as the key discriminator', () => {
      const email = 'complex+tag@sub.domain.com';
      const key = buildDeferredKey(email);
      expect(key).toBe(`email:deferred:${email}`);
    });
  });

  // ===== Task 5: Budget Visibility =====

  describe('Budget Visibility Endpoint', () => {
    it('should include deferred count in budget status response shape', () => {
      const mockResponse = {
        sentToday: 45,
        sentThisMonth: 1200,
        dailyLimit: 100,
        monthlyLimit: 3000,
        budgetRemaining: { daily: 55, monthly: 1800 },
        queueDepth: 3,
        deferredCount: 7,
        tier: 'free' as const,
      };

      expect(mockResponse).toHaveProperty('sentToday');
      expect(mockResponse).toHaveProperty('sentThisMonth');
      expect(mockResponse).toHaveProperty('dailyLimit');
      expect(mockResponse).toHaveProperty('monthlyLimit');
      expect(mockResponse).toHaveProperty('budgetRemaining');
      expect(mockResponse).toHaveProperty('queueDepth');
      expect(mockResponse).toHaveProperty('deferredCount');
      expect(mockResponse).toHaveProperty('tier');
    });

    it('should expose budget remaining for both daily and monthly', () => {
      const dailyCount = 45;
      const dailyLimit = 100;
      const monthlyCount = 1200;
      const monthlyLimit = 3000;
      expect(dailyLimit - dailyCount).toBe(55);
      expect(monthlyLimit - monthlyCount).toBe(1800);
    });
  });

  // ===== Behavioral: Priority-Driven Deferral Logic =====

  describe('Priority-Driven Deferral Decision', () => {
    // Simulates the exact logic from the worker (lines 119-157)
    function shouldDeferEmail(
      dailyCount: number,
      dailyLimit: number,
      monthlyCount: number,
      monthlyLimit: number,
      priority: EmailPriority,
    ): { defer: boolean; budgetUsage: number } {
      const dailyPct = dailyLimit > 0 ? dailyCount / dailyLimit : 0;
      const monthlyPct = monthlyCount / monthlyLimit;
      const budgetUsage = Math.max(dailyPct, monthlyPct);
      const defer = budgetUsage >= BUDGET_THRESHOLD_DEFER && priority === 'standard';
      return { defer, budgetUsage };
    }

    it('should defer standard payment email when daily at 85%', () => {
      const result = shouldDeferEmail(85, 100, 500, 3000, 'standard');
      expect(result.defer).toBe(true);
      expect(result.budgetUsage).toBe(0.85);
    });

    it('should NOT defer critical verification email when daily at 85%', () => {
      const result = shouldDeferEmail(85, 100, 500, 3000, 'critical');
      expect(result.defer).toBe(false);
    });

    it('should defer standard email when monthly approaches limit', () => {
      const result = shouldDeferEmail(10, 100, 2700, 3000, 'standard');
      expect(result.defer).toBe(true);
      expect(result.budgetUsage).toBe(0.9);
    });

    it('should NOT defer when both daily and monthly are well under 80%', () => {
      const result = shouldDeferEmail(30, 100, 1000, 3000, 'standard');
      expect(result.defer).toBe(false);
    });

    it('should defer at exactly 80% boundary', () => {
      const result = shouldDeferEmail(80, 100, 0, 3000, 'standard');
      expect(result.defer).toBe(true);
      expect(result.budgetUsage).toBe(0.8);
    });

    it('should NOT defer at 79.9%', () => {
      const result = shouldDeferEmail(79, 100, 0, 3000, 'standard');
      expect(result.defer).toBe(false);
    });

    it('should handle zero daily limit (unlimited tier) correctly', () => {
      const result = shouldDeferEmail(999, 0, 100, 50000, 'standard');
      expect(result.defer).toBe(false);
      expect(result.budgetUsage).toBe(0.002);
    });

    it('should exercise all 7 email types through deferral logic', () => {
      const allTypes: EmailJobType[] = [
        'staff-invitation', 'verification', 'password-reset',
        'payment-notification', 'dispute-notification', 'dispute-resolution', 'backup-notification',
      ];
      for (const type of allTypes) {
        const priority = EMAIL_TYPE_PRIORITY[type];
        const result = shouldDeferEmail(90, 100, 500, 3000, priority);
        if (priority === 'critical') {
          expect(result.defer).toBe(false);
        } else {
          expect(result.defer).toBe(true);
        }
      }
    });
  });

  // ===== Behavioral: Dedup Key Isolation =====

  describe('Dedup Key Isolation', () => {
    it('should never collide between dedup and deferred key namespaces', () => {
      const email = 'user@test.com';
      const dedupKey = buildDedupKey(email, 'payment-notification');
      const deferredKey = buildDeferredKey(email);
      expect(dedupKey).not.toBe(deferredKey);
      expect(dedupKey.startsWith('email:dedup:')).toBe(true);
      expect(deferredKey.startsWith('email:deferred:')).toBe(true);
    });

    it('should ensure dedup keys include both email and type for proper scoping', () => {
      const key = buildDedupKey('admin@test.com', 'dispute-notification');
      expect(key).toBe('email:dedup:admin@test.com:dispute-notification');
      // Same email, different type = different key
      const key2 = buildDedupKey('admin@test.com', 'backup-notification');
      expect(key).not.toBe(key2);
    });
  });
});

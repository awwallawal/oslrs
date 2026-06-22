import { Redis } from 'ioredis';
import pino from 'pino';
import type { EmailTier, BudgetCheckResult, EmailBudgetStatus } from '@oslsr/types';

const logger = pino({ name: 'email-budget-service' });

/**
 * Resend pricing tier limits
 * Source: https://resend.com/pricing (Verified 2026-01-25)
 */
const TIER_LIMITS = {
  free: {
    dailyLimit: 100,
    monthlyLimit: 3000,
    hasOverage: false,
  },
  pro: {
    dailyLimit: Infinity, // No daily limit
    monthlyLimit: 50000,
    hasOverage: true,
    overageCostPerThousand: 90, // $0.90 = 90 cents per 1000 emails
  },
  scale: {
    dailyLimit: Infinity, // No daily limit
    monthlyLimit: 100000,
    hasOverage: true,
    overageCostPerThousand: 90, // $0.90 = 90 cents per 1000 emails
  },
} as const;

/**
 * Warning threshold percentage (80%)
 */
const WARNING_THRESHOLD = 0.8;

/**
 * Redis key patterns for budget tracking
 */
const REDIS_KEYS = {
  dailyCount: (date: string) => `email:daily:count:${date}`,
  monthlyCount: (month: string) => `email:monthly:count:${month}`,
  overageCost: (month: string) => `email:overage:cost:${month}`,
} as const;

/**
 * Story 9-63 (Task 4 / AC2) — the NotificationMeter per-category counters share
 * the `email:daily:count:` / `email:monthly:count:` prefixes but carry a
 * `<category>:<date>` (resp. `<category>:<month>`) suffix, e.g.
 * `email:daily:count:magiclink-login:2026-06-22`. The budget guard previously
 * read ONLY the legacy total key (`email:daily:count:<date>`), which is
 * incremented solely by the email-WORKER path — so every high-volume direct
 * send (magic-link, reminder, status, backup, blasts) was invisible to the
 * 80%/95% defer + auto-pause throttle. Summing the meter's per-category keys
 * gives the budget guard the COMPLETE real volume.
 *
 * A `*:bounced` / `*:complained` suffixed key is excluded so negative-delivery
 * reconciliation never counts against the send budget.
 */
const METER_DAILY_PREFIX = 'email:daily:count:';
const METER_MONTHLY_PREFIX = 'email:monthly:count:';

/**
 * TTL values in seconds
 */
const TTL = {
  daily: 48 * 60 * 60, // 48 hours
  monthly: 35 * 24 * 60 * 60, // 35 days
} as const;

/**
 * Email Budget Service
 *
 * Tracks email usage against Resend pricing tiers and enforces budget limits.
 *
 * Free Tier: 100/day, 3,000/month
 * Pro Tier: 50,000/month (no daily limit), $0.90/1K overage
 * Scale Tier: 100,000/month (no daily limit), $0.90/1K overage
 */
export class EmailBudgetService {
  private redis: Redis;
  private tier: EmailTier;
  private overageBudgetCents: number;

  constructor(
    redis: Redis,
    tier: EmailTier = 'free',
    overageBudgetCents: number = 3000 // $30.00 default
  ) {
    this.redis = redis;
    this.tier = tier;
    this.overageBudgetCents = overageBudgetCents;
  }

  /**
   * Get current date in YYYY-MM-DD format
   */
  private getDateKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get current month in YYYY-MM format
   */
  private getMonthKey(): string {
    return new Date().toISOString().slice(0, 7);
  }

  /**
   * Story 9-63 (Task 4 / AC2) — sum the NotificationMeter per-category counters
   * for a period so the budget guard reflects TOTAL real volume, not just the
   * worker-path total. Uses a non-blocking SCAN (never `KEYS`, which blocks the
   * Redis event loop in production) over `<prefix><category>:<periodSuffix>`,
   * excluding `:bounced` / `:complained` event keys.
   *
   * Fail-OPEN (review nit, 9-63): on any Redis error returns 0 — `getEffective*`
   * then falls back to the legacy worker total via Math.max and NEVER throws or
   * blocks a send. Note the direction: this MAY under-report (the legacy floor is
   * < the true meter sum), so during a Redis outage a few sends could slip past a
   * defer threshold. Accepted — blocking mail on a transient Redis error is worse,
   * and any over-send is bounded by the legacy floor + the provider's hard quota.
   */
  private async sumMeterCounters(prefix: string, periodSuffix: string): Promise<number> {
    try {
      const pattern = `${prefix}*:${periodSuffix}`;
      let cursor = '0';
      let total = 0;
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        const realSendKeys = keys.filter(
          (k) => !k.includes(':bounced:') && !k.includes(':complained:'),
        );
        if (realSendKeys.length > 0) {
          const values = await this.redis.mget(...realSendKeys);
          for (const v of values) total += parseInt(v || '0', 10);
        }
      } while (cursor !== '0');
      return total;
    } catch {
      return 0;
    }
  }

  /**
   * Effective daily send count = MAX(legacy worker total, meter category sum).
   *
   * MAX (not sum) avoids double-counting the worker path, which increments BOTH
   * the legacy total key AND a per-category meter key. Every other send hits ONLY
   * the meter, so the meter sum is the authoritative complete figure; the legacy
   * total is kept as a floor in case an un-instrumented path still writes it.
   */
  private async getEffectiveDailyCount(dateKey: string): Promise<number> {
    const [legacyStr, meterSum] = await Promise.all([
      this.redis.get(REDIS_KEYS.dailyCount(dateKey)),
      this.sumMeterCounters(METER_DAILY_PREFIX, dateKey),
    ]);
    return Math.max(parseInt(legacyStr || '0', 10), meterSum);
  }

  /** Effective monthly send count — same MAX(legacy, meter-sum) reconciliation. */
  private async getEffectiveMonthlyCount(monthKey: string): Promise<number> {
    const [legacyStr, meterSum] = await Promise.all([
      this.redis.get(REDIS_KEYS.monthlyCount(monthKey)),
      this.sumMeterCounters(METER_MONTHLY_PREFIX, monthKey),
    ]);
    return Math.max(parseInt(legacyStr || '0', 10), meterSum);
  }

  /**
   * Check if an email can be sent based on budget constraints
   *
   * Returns whether sending is allowed and the reason if not.
   */
  async checkBudget(): Promise<BudgetCheckResult> {
    const dateKey = this.getDateKey();
    const monthKey = this.getMonthKey();
    const tierConfig = TIER_LIMITS[this.tier];

    // Story 9-63 (Task 4 / AC2) — effective counts reconcile the legacy
    // worker-only total with the NotificationMeter per-category sum so the
    // guard sees ALL traffic (magic-link / reminder / status / backup / blasts
    // previously bypassed this).
    const [dailyCount, monthlyCount, overageCostStr] = await Promise.all([
      this.getEffectiveDailyCount(dateKey),
      this.getEffectiveMonthlyCount(monthKey),
      this.redis.get(REDIS_KEYS.overageCost(monthKey)),
    ]);

    const overageCostCents = parseInt(overageCostStr || '0', 10);

    const usage = {
      dailyCount,
      dailyLimit: tierConfig.dailyLimit === Infinity ? -1 : tierConfig.dailyLimit,
      monthlyCount,
      monthlyLimit: tierConfig.monthlyLimit,
      overageCostCents: tierConfig.hasOverage ? overageCostCents : undefined,
      overageBudgetCents: tierConfig.hasOverage ? this.overageBudgetCents : undefined,
    };

    // Check daily limit (Free tier only)
    if (tierConfig.dailyLimit !== Infinity && dailyCount >= tierConfig.dailyLimit) {
      logger.warn({
        event: 'email.budget.daily_limit_reached',
        tier: this.tier,
        dailyCount,
        dailyLimit: tierConfig.dailyLimit,
      });

      return {
        allowed: false,
        reason: 'daily_limit',
        tier: this.tier,
        usage,
      };
    }

    // Check monthly limit
    if (monthlyCount >= tierConfig.monthlyLimit) {
      // For tiers with overage, check overage budget
      if (tierConfig.hasOverage) {
        if (overageCostCents >= this.overageBudgetCents) {
          logger.warn({
            event: 'email.budget.overage_budget_exhausted',
            tier: this.tier,
            overageCostCents,
            overageBudgetCents: this.overageBudgetCents,
          });

          return {
            allowed: false,
            reason: 'overage_budget',
            tier: this.tier,
            usage,
          };
        }
        // Overage allowed, continue
      } else {
        // Free tier - hard stop at monthly limit
        logger.warn({
          event: 'email.budget.monthly_limit_reached',
          tier: this.tier,
          monthlyCount,
          monthlyLimit: tierConfig.monthlyLimit,
        });

        return {
          allowed: false,
          reason: 'monthly_limit',
          tier: this.tier,
          usage,
        };
      }
    }

    return {
      allowed: true,
      tier: this.tier,
      usage,
    };
  }

  /**
   * Record a sent email (increment counters)
   *
   * Call this after successfully sending an email.
   *
   * Story 9-63 (Task 4 / AC2) — the legacy worker-path total key is still
   * incremented here for backward-compat, but the per-category NotificationMeter
   * keys (written at the EmailService chokepoint) are now the authoritative
   * volume source that `checkBudget()`/`getBudgetStatus()` read. The overage
   * cost below is computed from the EFFECTIVE monthly count (meter-inclusive) so
   * pro/scale overage billing reflects the high-volume direct sends too.
   */
  async recordSend(): Promise<void> {
    const dateKey = this.getDateKey();
    const monthKey = this.getMonthKey();
    const tierConfig = TIER_LIMITS[this.tier];

    // Increment counters with TTL
    const pipeline = this.redis.pipeline();

    // Daily count
    pipeline.incr(REDIS_KEYS.dailyCount(dateKey));
    pipeline.expire(REDIS_KEYS.dailyCount(dateKey), TTL.daily);

    // Monthly count
    pipeline.incr(REDIS_KEYS.monthlyCount(monthKey));
    pipeline.expire(REDIS_KEYS.monthlyCount(monthKey), TTL.monthly);

    await pipeline.exec();

    // Update overage cost if applicable
    if (tierConfig.hasOverage) {
      const monthlyCount = await this.getEffectiveMonthlyCount(monthKey);

      if (monthlyCount > tierConfig.monthlyLimit) {
        // Calculate overage: $0.90 per 1000 = 0.09 cents per email
        const overageEmails = monthlyCount - tierConfig.monthlyLimit;
        const overageCostCents = Math.ceil(
          (overageEmails * (tierConfig.overageCostPerThousand || 90)) / 1000
        );

        await this.redis.set(
          REDIS_KEYS.overageCost(monthKey),
          overageCostCents.toString(),
          'EX',
          TTL.monthly
        );
      }
    }

    logger.debug({
      event: 'email.budget.recorded',
      tier: this.tier,
      dateKey,
      monthKey,
    });
  }

  /**
   * Get detailed budget status for dashboard display
   */
  async getBudgetStatus(): Promise<EmailBudgetStatus> {
    const dateKey = this.getDateKey();
    const monthKey = this.getMonthKey();
    const tierConfig = TIER_LIMITS[this.tier];

    const [dailyCount, monthlyCount, overageCostStr, isPaused] = await Promise.all([
      this.getEffectiveDailyCount(dateKey),
      this.getEffectiveMonthlyCount(monthKey),
      this.redis.get(REDIS_KEYS.overageCost(monthKey)),
      this.isQueuePaused(),
    ]);

    const overageCostCents = parseInt(overageCostStr || '0', 10);

    const dailyLimit = tierConfig.dailyLimit === Infinity ? -1 : tierConfig.dailyLimit;
    const dailyPercentage =
      dailyLimit > 0 ? Math.round((dailyCount / dailyLimit) * 100) : 0;
    const monthlyPercentage = Math.round((monthlyCount / tierConfig.monthlyLimit) * 100);

    const status: EmailBudgetStatus = {
      tier: this.tier,
      dailyUsage: {
        count: dailyCount,
        limit: dailyLimit,
        percentage: dailyPercentage,
        isWarning: dailyLimit > 0 && dailyPercentage >= WARNING_THRESHOLD * 100,
        isExhausted: dailyLimit > 0 && dailyCount >= dailyLimit,
      },
      monthlyUsage: {
        count: monthlyCount,
        limit: tierConfig.monthlyLimit,
        percentage: monthlyPercentage,
        isWarning: monthlyPercentage >= WARNING_THRESHOLD * 100,
        isExhausted: !tierConfig.hasOverage && monthlyCount >= tierConfig.monthlyLimit,
      },
      queuePaused: isPaused,
      lastUpdated: new Date().toISOString(),
    };

    // Add overage info for pro/scale tiers
    if (tierConfig.hasOverage) {
      const overagePercentage = Math.round((overageCostCents / this.overageBudgetCents) * 100);
      status.overage = {
        costCents: overageCostCents,
        budgetCents: this.overageBudgetCents,
        percentage: overagePercentage,
        isWarning: overagePercentage >= WARNING_THRESHOLD * 100,
        isExhausted: overageCostCents >= this.overageBudgetCents,
      };
    }

    return status;
  }

  /**
   * Check if the email queue is paused
   */
  private async isQueuePaused(): Promise<boolean> {
    try {
      const paused = await this.redis.get('email:queue:paused');
      return paused === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Check budget and warn if approaching limits
   *
   * Logs warnings at 80% threshold.
   */
  async checkAndWarn(): Promise<void> {
    const status = await this.getBudgetStatus();

    if (status.dailyUsage.isWarning && !status.dailyUsage.isExhausted) {
      logger.warn({
        event: 'email.budget.daily_warning',
        tier: this.tier,
        count: status.dailyUsage.count,
        limit: status.dailyUsage.limit,
        percentage: status.dailyUsage.percentage,
      });
    }

    if (status.monthlyUsage.isWarning && !status.monthlyUsage.isExhausted) {
      logger.warn({
        event: 'email.budget.monthly_warning',
        tier: this.tier,
        count: status.monthlyUsage.count,
        limit: status.monthlyUsage.limit,
        percentage: status.monthlyUsage.percentage,
      });
    }

    if (status.overage?.isWarning && !status.overage.isExhausted) {
      logger.warn({
        event: 'email.budget.overage_warning',
        tier: this.tier,
        costCents: status.overage.costCents,
        budgetCents: status.overage.budgetCents,
        percentage: status.overage.percentage,
      });
    }
  }

  /**
   * Get remaining daily capacity
   * Returns -1 if no daily limit (pro/scale tiers)
   */
  async getRemainingDailyCapacity(): Promise<number> {
    const tierConfig = TIER_LIMITS[this.tier];

    if (tierConfig.dailyLimit === Infinity) {
      return -1;
    }

    const dateKey = this.getDateKey();
    // Story 9-63 (Task 4 / AC2) — meter-inclusive effective count.
    const count = await this.getEffectiveDailyCount(dateKey);

    return Math.max(0, tierConfig.dailyLimit - count);
  }

  /**
   * Get remaining monthly capacity (before hitting limit or overage budget)
   */
  async getRemainingMonthlyCapacity(): Promise<number> {
    const tierConfig = TIER_LIMITS[this.tier];
    const monthKey = this.getMonthKey();

    // Story 9-63 (Task 4 / AC2) — meter-inclusive effective count.
    const count = await this.getEffectiveMonthlyCount(monthKey);

    if (!tierConfig.hasOverage) {
      return Math.max(0, tierConfig.monthlyLimit - count);
    }

    // For overage tiers, calculate how many more emails until overage budget exhausted
    const overageCostStr = await this.redis.get(REDIS_KEYS.overageCost(monthKey));
    const overageCostCents = parseInt(overageCostStr || '0', 10);

    const remainingBudgetCents = this.overageBudgetCents - overageCostCents;
    const remainingOverageEmails = Math.floor(
      (remainingBudgetCents * 1000) / (tierConfig.overageCostPerThousand || 90)
    );

    if (count < tierConfig.monthlyLimit) {
      // Still within included quota
      return tierConfig.monthlyLimit - count + remainingOverageEmails;
    } else {
      // Already in overage
      return remainingOverageEmails;
    }
  }
}

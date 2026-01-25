/**
 * Email Service Configuration Constants
 *
 * Resend pricing tier limits and budget defaults.
 * Source: https://resend.com/pricing (Verified 2026-01-25)
 */

import { z } from 'zod';

/**
 * Resend pricing tier limits
 */
export const EMAIL_TIER_LIMITS = {
  free: {
    name: 'Free',
    monthlyPrice: 0,
    dailyLimit: 100,
    monthlyLimit: 3000,
    hasOverage: false,
  },
  pro: {
    name: 'Pro',
    monthlyPrice: 2000, // $20.00 in cents
    dailyLimit: Infinity,
    monthlyLimit: 50000,
    hasOverage: true,
    overageCostPerThousand: 90, // $0.90 = 90 cents per 1000 emails
  },
  scale: {
    name: 'Scale',
    monthlyPrice: 9000, // $90.00 in cents
    dailyLimit: Infinity,
    monthlyLimit: 100000,
    hasOverage: true,
    overageCostPerThousand: 90, // $0.90 = 90 cents per 1000 emails
  },
} as const;

/**
 * Warning threshold percentage (80%)
 */
export const EMAIL_WARNING_THRESHOLD = 0.8;

/**
 * Default overage budget in cents ($30.00)
 */
export const DEFAULT_OVERAGE_BUDGET_CENTS = 3000;

/**
 * Default max resend attempts per user per 24 hours
 */
export const DEFAULT_RESEND_MAX_PER_USER = 3;

/**
 * Token expiration times
 */
export const EMAIL_TOKEN_EXPIRY = {
  staffInvitation: 24, // hours
  emailVerification: 24, // hours
  passwordReset: 1, // hours
  otp: 10, // minutes
} as const;

/**
 * Redis key patterns
 */
export const EMAIL_REDIS_KEYS = {
  dailyCount: (date: string) => `email:daily:count:${date}`,
  monthlyCount: (month: string) => `email:monthly:count:${month}`,
  overageCost: (month: string) => `email:overage:cost:${month}`,
  resendLimit: (userId: string) => `resend:limit:${userId}`,
  queuePaused: 'email:queue:paused',
  otpVerify: (email: string) => `otp:verify:${email}`,
} as const;

/**
 * Redis TTL values in seconds
 */
export const EMAIL_REDIS_TTL = {
  daily: 48 * 60 * 60, // 48 hours
  monthly: 35 * 24 * 60 * 60, // 35 days
  resendLimit: 24 * 60 * 60, // 24 hours
  otp: 10 * 60, // 10 minutes
} as const;

/**
 * BullMQ email queue configuration
 */
export const EMAIL_QUEUE_CONFIG = {
  name: 'email-notification',
  attempts: 3,
  backoffType: 'exponential' as const,
  backoffDelay: 30000, // 30 seconds
  removeOnCompleteAge: 3600, // 1 hour
  removeOnCompleteCount: 1000,
  removeOnFailAge: 24 * 3600, // 24 hours
  concurrency: 5,
} as const;

/**
 * Email configuration schema
 */
export const emailConfigSchema = z.object({
  provider: z.enum(['resend', 'mock']).default('mock'),
  enabled: z.boolean().default(true),
  fromAddress: z.string().email().default('noreply@oyotradeministry.com.ng'),
  fromName: z.string().min(1).default('Oyo State Labour Registry'),
  tier: z.enum(['free', 'pro', 'scale']).default('free'),
  resendApiKey: z.string().optional(),
  monthlyOverageBudgetCents: z.number().int().nonnegative().default(3000),
  resendMaxPerUser: z.number().int().positive().default(3),
});

export type EmailConfigType = z.infer<typeof emailConfigSchema>;

/**
 * Parse email configuration from environment variables
 */
export function parseEmailConfig(): EmailConfigType {
  return emailConfigSchema.parse({
    provider: process.env.EMAIL_PROVIDER,
    enabled: process.env.EMAIL_ENABLED !== 'false',
    fromAddress: process.env.EMAIL_FROM_ADDRESS,
    fromName: process.env.EMAIL_FROM_NAME,
    tier: process.env.EMAIL_TIER,
    resendApiKey: process.env.RESEND_API_KEY,
    monthlyOverageBudgetCents: process.env.EMAIL_MONTHLY_OVERAGE_BUDGET
      ? parseInt(process.env.EMAIL_MONTHLY_OVERAGE_BUDGET, 10)
      : undefined,
    resendMaxPerUser: process.env.EMAIL_RESEND_MAX_PER_USER
      ? parseInt(process.env.EMAIL_RESEND_MAX_PER_USER, 10)
      : undefined,
  });
}

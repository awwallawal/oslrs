import { z } from 'zod';

// ============================================================================
// Email Provider Interface (Strategy Pattern)
// ============================================================================

/**
 * Result of an email send operation
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Base email data required for all email types
 */
export interface BaseEmailData {
  to: string;
  subject: string;
}

/**
 * Email with HTML and plain text content
 */
export interface EmailContent extends BaseEmailData {
  html: string;
  text: string;
}

/**
 * Email provider interface - implements strategy pattern for email delivery
 */
export interface EmailProvider {
  /**
   * Provider name for logging
   */
  readonly name: string;

  /**
   * Send an email with HTML and plain text content
   */
  send(email: EmailContent): Promise<EmailResult>;
}

// ============================================================================
// Staff Invitation Email Types
// ============================================================================

/**
 * Data required to send a staff invitation email
 */
export interface StaffInvitationEmailData {
  email: string;
  fullName: string;
  roleName: string;
  lgaName?: string; // Optional - only for field staff (Enumerator, Supervisor)
  activationUrl: string;
  expiresInHours: number;
}

/**
 * Zod schema for staff invitation email data validation
 */
export const staffInvitationEmailDataSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  roleName: z.string().min(1),
  lgaName: z.string().optional(),
  activationUrl: z.string().url(),
  expiresInHours: z.number().positive(),
});

// ============================================================================
// Verification Email Types (ADR-015 Hybrid: Magic Link + OTP)
// ============================================================================

/**
 * Data required to send a hybrid verification email
 */
export interface VerificationEmailData {
  email: string;
  fullName: string;
  verificationUrl: string;
  otpCode: string;
  magicLinkExpiresInHours: number;
  otpExpiresInMinutes: number;
}

/**
 * Zod schema for verification email data validation
 */
export const verificationEmailDataSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  verificationUrl: z.string().url(),
  otpCode: z.string().length(6).regex(/^\d{6}$/),
  magicLinkExpiresInHours: z.number().positive(),
  otpExpiresInMinutes: z.number().positive(),
});

// ============================================================================
// Password Reset Email Types
// ============================================================================

/**
 * Data required to send a password reset email
 */
export interface PasswordResetEmailData {
  email: string;
  fullName: string;
  resetUrl: string;
  expiresInHours: number;
}

/**
 * Zod schema for password reset email data validation
 */
export const passwordResetEmailDataSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  resetUrl: z.string().url(),
  expiresInHours: z.number().positive(),
});

// ============================================================================
// Duplicate Registration Email Types
// ============================================================================

/**
 * Data for duplicate registration attempt notification
 */
export interface DuplicateRegistrationEmailData {
  email: string;
  fullName: string;
  attemptedAt: string;
}

/**
 * Zod schema for duplicate registration email data validation
 */
export const duplicateRegistrationEmailDataSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  attemptedAt: z.string().datetime(),
});

// ============================================================================
// ODK Sync Alert Email Types (Story 2-5)
// ============================================================================

/**
 * Data required to send an ODK sync alert email to Super Admin
 */
export interface OdkSyncAlertEmailData {
  email: string;
  alertType: 'submission_gap' | 'unreachable';
  gapDetails?: {
    odkCount: number;
    appDbCount: number;
    gap: number;
    threshold: number;
    byForm: Array<{ formId: string; odkCount: number; appDbCount: number; gap: number }>;
  };
  unreachableDetails?: {
    consecutiveFailures: number;
    lastSuccessful: string | null;
    lastError: string;
  };
  dashboardUrl: string;
  checkedAt: string;
}

/**
 * Zod schema for ODK sync alert email data validation
 */
export const odkSyncAlertEmailDataSchema = z.object({
  email: z.string().email(),
  alertType: z.enum(['submission_gap', 'unreachable']),
  gapDetails: z.object({
    odkCount: z.number().int().nonnegative(),
    appDbCount: z.number().int().nonnegative(),
    gap: z.number().int(),
    threshold: z.number().int().positive(),
    byForm: z.array(z.object({
      formId: z.string(),
      odkCount: z.number().int().nonnegative(),
      appDbCount: z.number().int().nonnegative(),
      gap: z.number().int(),
    })),
  }).optional(),
  unreachableDetails: z.object({
    consecutiveFailures: z.number().int().positive(),
    lastSuccessful: z.string().nullable(),
    lastError: z.string(),
  }).optional(),
  dashboardUrl: z.string().url(),
  checkedAt: z.string().datetime(),
});

// ============================================================================
// Email Job Types (for BullMQ queue)
// ============================================================================

/**
 * Base job data for email queue
 */
interface BaseEmailJob {
  attemptNumber?: number;
  scheduledFor?: string; // ISO date for deferred emails
}

/**
 * Staff invitation email job payload
 */
export interface StaffInvitationJob extends BaseEmailJob {
  type: 'staff-invitation';
  data: StaffInvitationEmailData;
  userId: string;
}

/**
 * Verification email job payload
 */
export interface VerificationJob extends BaseEmailJob {
  type: 'verification';
  data: VerificationEmailData;
  userId: string;
}

/**
 * Password reset email job payload
 */
export interface PasswordResetJob extends BaseEmailJob {
  type: 'password-reset';
  data: PasswordResetEmailData;
  userId: string;
}

/**
 * ODK sync alert email job payload
 */
export interface OdkSyncAlertJob extends BaseEmailJob {
  type: 'odk-sync-alert';
  data: OdkSyncAlertEmailData;
}

/**
 * Union type for all email job payloads
 */
export type EmailJob = StaffInvitationJob | VerificationJob | PasswordResetJob | OdkSyncAlertJob;

// ============================================================================
// Email Configuration Types
// ============================================================================

/**
 * Supported email tiers for budget tracking
 */
export type EmailTier = 'free' | 'pro' | 'scale';

/**
 * Email provider type
 */
export type EmailProviderType = 'resend' | 'mock';

/**
 * Email configuration
 */
export interface EmailConfig {
  provider: EmailProviderType;
  enabled: boolean;
  fromAddress: string;
  fromName: string;
  tier: EmailTier;
  resendApiKey?: string;
  monthlyOverageBudgetCents: number;
  resendMaxPerUser: number;
}

/**
 * Zod schema for email configuration validation
 */
export const emailConfigSchema = z.object({
  provider: z.enum(['resend', 'mock']),
  enabled: z.boolean(),
  fromAddress: z.string().email(),
  fromName: z.string().min(1),
  tier: z.enum(['free', 'pro', 'scale']),
  resendApiKey: z.string().optional(),
  monthlyOverageBudgetCents: z.number().int().nonnegative(),
  resendMaxPerUser: z.number().int().positive(),
});

// ============================================================================
// Budget Tracking Types
// ============================================================================

/**
 * Result of a budget check
 */
export interface BudgetCheckResult {
  allowed: boolean;
  reason?: 'daily_limit' | 'monthly_limit' | 'overage_budget';
  tier: EmailTier;
  usage: {
    dailyCount: number;
    dailyLimit: number;
    monthlyCount: number;
    monthlyLimit: number;
    overageCostCents?: number;
    overageBudgetCents?: number;
  };
}

/**
 * Budget status for dashboard
 */
export interface EmailBudgetStatus {
  tier: EmailTier;
  dailyUsage: {
    count: number;
    limit: number;
    percentage: number;
    isWarning: boolean;
    isExhausted: boolean;
  };
  monthlyUsage: {
    count: number;
    limit: number;
    percentage: number;
    isWarning: boolean;
    isExhausted: boolean;
  };
  overage?: {
    costCents: number;
    budgetCents: number;
    percentage: number;
    isWarning: boolean;
    isExhausted: boolean;
  };
  queuePaused: boolean;
  lastUpdated: string;
}

// ============================================================================
// Email Status Tracking
// ============================================================================

/**
 * Email delivery status for user records
 */
export type EmailStatus = 'sent' | 'pending' | 'failed' | 'not_configured';

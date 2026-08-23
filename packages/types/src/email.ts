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
  /**
   * Story 13-46 (review A2 / finding H2) — TRUE when the send was DELIBERATELY REFUSED by the
   * marketing send cap, rather than having failed.
   *
   * ⚠️ WHY A TYPED FLAG AND NOT A STRING MATCH ON `error`: callers must branch on this, and a
   * caller that greps the message would silently stop branching the day the copy is reworded.
   * The 13-21 auto-send monitor treats ANY falsy `success` as a failure and pages
   * "Registration auto-emails are FAILING… the loop may be down" at its 5th occurrence — so
   * without this flag a WORKING cap produces a wrong-diagnosis page, routes around the cap's own
   * one-page-per-window cooldown, and pollutes 13-21's failure metric with successes.
   *
   * A refusal is NOT a failure: nothing is broken, no retry will help, and the operator has
   * already been told by `notification.cap_exceeded`.
   */
  refusedByCap?: boolean;
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
  /**
   * Story 13-9 (AC5) — optional campaign id. When set, the provider tags the send
   * (Resend tag `campaign_id`) so the inbound webhook events echo it back onto
   * `email_events.campaign_id`, building the per-campaign funnel. Resend tag values
   * are restricted to ASCII letters/numbers/`_`/`-`; campaign ids must comply
   * (e.g. `reengagement-2026-07`, `cohort_a_supplemental_survey`).
   */
  campaignId?: string;
  /**
   * Story 13-13 (AC3/AC4) — extra SMTP headers the provider attaches verbatim. Used to carry
   * `List-Unsubscribe` + `List-Unsubscribe-Post` on MARKETING sends only; the email service builds
   * these (it knows the NotificationCategory) and the provider stays a thin transport. Omitted for
   * transactional / ops mail, which is non-unsubscribable.
   */
  headers?: Record<string, string>;
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
// Staff Activation COMPLETION Email Types (Story 13-59)
// ============================================================================

/**
 * Data required to send the activation-completion email.
 *
 * ⛔ There is deliberately NO `attachments` field, here or on `EmailContent`.
 * Ruled out 2026-08-10: this sending domain is shared with the re-engagement
 * blasts and whatever the radio jingle generates, and plain attachment-free
 * transactional mail is the highest-deliverability shape there is. The email is
 * the PROMPT; the app is the delivery (AC5/AC6/AC7). This is a standing
 * constraint, not a scope cut.
 */
export interface StaffActivationCompleteEmailData {
  email: string;
  fullName: string;
  /** Canonical role slug (e.g. `enumerator`) — the copy map is keyed on it. */
  roleName: string;
  /** Field roles only; null/undefined for back-office. */
  lgaName?: string | null;
  /** Already formatted by `formatStaffId` — the same string the card prints. */
  staffId: string;
  /** MUST be the staff door. `/login` is the citizen page and rejects staff. */
  loginUrl: string;
}

// ============================================================================
// Story 9-12 Task 10.3 (2026-05-11 session 8) — Verification Email Types
// (ADR-015 Hybrid: Magic Link + OTP) RETIRED.
//
// `VerificationEmailData` + `verificationEmailDataSchema` removed alongside
// the legacy public-registration flow. The wizard at `/api/v1/registration/wizard`
// is the canonical public-registration entry-point; magic-link emails issued
// by `MagicLinkService.sendMagicLinkEmail` (Story 9-12 AC#6) are inline-rendered,
// not queued via this typed surface.
// ============================================================================

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
// Payment Notification Email Types
// ============================================================================

/**
 * Data required to send a payment notification email
 */
export interface PaymentNotificationEmailData {
  email: string;
  staffName: string;
  amount: number; // in kobo
  trancheName: string;
  date: string;
  bankReference: string;
}

// ============================================================================
// Dispute Notification Email Types
// ============================================================================

/**
 * Data required to send a dispute notification email to Super Admin
 * Story 6.5: Staff-initiated payment dispute.
 */
export interface DisputeNotificationEmailData {
  to: string; // Super Admin email address
  staffName: string;
  trancheName: string;
  amount: number; // in kobo
  commentExcerpt: string; // first 100 chars of staff comment
}

// ============================================================================
// Dispute Resolution Email Types
// ============================================================================

/**
 * Data required to send a dispute resolution email to staff
 * Story 6.6: Admin resolves/acknowledges payment dispute.
 */
export interface DisputeResolutionEmailData {
  staffEmail: string;
  staffName: string;
  trancheName: string;
  amount: number; // in kobo
  adminResponse: string;
  hasEvidence: boolean;
  action: 'acknowledged' | 'resolved';
}

// ============================================================================
// Backup Notification Email Types
// ============================================================================

/**
 * Data required to send a backup notification email
 */
export interface BackupNotificationEmailData {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// ============================================================================
// Registration Email Types (Story 13-65 — the three registration sends, queued)
// ============================================================================

/**
 * Story 13-65 (AC1) — payloads carry IDENTIFIERS, never a rendered body.
 *
 * A rendered HTML body in a Redis job record puts the very thing this story removes from the API
 * heap into Redis instead, and it goes stale between enqueue and send. All three are re-rendered by
 * the worker handler at send time, immediately after the guards re-run.
 */

/**
 * Pending-NIN resume magic link. The token is ALREADY ISSUED on the request
 * (`MagicLinkService.issueToken` stays awaited at the call site) — only the SEND is queued, so a
 * pending-NIN respondent can never exist with no token for the T+2d reminder worker to reference.
 */
export interface RegistrationMagicLinkEmailData {
  respondentId: string;
  email: string;
  tokenPlaintext: string;
  /** The only magic-link purpose the registration write path issues. */
  purpose: 'pending_nin_complete';
  /** ISO-8601. Serialised because a job record is JSON. */
  expiresAt: string;
}

/** Story 9-58 reference-code confirmation. Transactional — no category, no marketing cap. */
export interface RegistrationConfirmationEmailData {
  respondentId: string;
  email: string;
  referenceCode: string;
  /** `respondents.status` — drives the plain-language status line. */
  status: string;
}

/**
 * Story 13-12 evergreen thank-you / referral. MARKETING — category `thankyou-referral`,
 * campaign `thankyou-referral-auto`. Every 13-46 guard re-runs in the worker before the send.
 */
export interface RegistrationThankYouEmailData {
  respondentId: string;
  email: string;
}

// ============================================================================
// Email Priority Classification (Story prep-7: Backpressure)
// ============================================================================

/**
 * Email priority tiers for adaptive throttling.
 * - critical: User is actively waiting; delay = broken UX (verification, password-reset, staff-invitation)
 * - standard: Informational; 30-min delay is acceptable (payment, dispute, backup notifications)
 */
export type EmailPriority = 'critical' | 'standard';

/** All email job type strings */
// Story 9-12 Task 10.3 (2026-05-11 session 8) — `'verification'` removed.
// Story 13-65 — the three registration sends added ({domain}-{action} kebab-case, project-context
// §10), so a burst becomes bounded-concurrency queue work instead of unbounded in-request fan-out.
export type EmailJobType = 'staff-invitation' | 'password-reset' | 'payment-notification' | 'dispute-notification' | 'dispute-resolution' | 'backup-notification' | 'registration-magic-link' | 'registration-confirmation' | 'registration-thankyou';

/**
 * Maps each email job type to its priority tier.
 * Alert digests are out-of-scope — they bypass the queue entirely.
 */
/**
 * Story 13-65 (review C10 / finding R10) — the citizen-facing registration sends, AS A SET.
 *
 * ⚠️ This replaced `String(type).startsWith('registration-')` in the worker. A prefix test throws
 * away compile-time enforcement: a future registration job type that does not happen to match the
 * prefix would silently fall back into the ops-digest deferral — which is EXACTLY the bug review B2
 * fixed (a citizen's thank-you delivered as "[OSLRS] You have 1 notification", with no category, no
 * unsubscribe header, no cap and no ledger row, possibly to an unsubscribed address).
 *
 * ⚠️ Story 13-65 (review D4 / finding T4) — THE COMPILE-TIME GUARANTEE IS NOW REAL. It previously
 * was not: this JSDoc claimed "a `satisfies`-checked set", and no `satisfies` existed. Adding a new
 * `EmailJobType` compiled clean, so the regression the set was written to prevent was exactly as
 * open as before — with a comment asserting it could not happen, which is worse than no comment.
 *
 * An EXHAUSTIVE map is what actually buys the guarantee: `satisfies Record<EmailJobType, boolean>`
 * makes a missing key a compile error, so a new email type cannot be added without deciding, right
 * here, whether it is citizen-facing registration mail. A readonly array could never do that —
 * nothing in the type system requires an array to mention every member of a union.
 */
const CITIZEN_REGISTRATION_EMAIL_TYPE_MAP = {
  'staff-invitation': false,
  'password-reset': false,
  'payment-notification': false,
  'dispute-notification': false,
  'dispute-resolution': false,
  'backup-notification': false,
  'registration-magic-link': true,
  'registration-confirmation': true,
  'registration-thankyou': true,
} as const satisfies Record<EmailJobType, boolean>;

export const CITIZEN_REGISTRATION_EMAIL_TYPES = (
  Object.keys(CITIZEN_REGISTRATION_EMAIL_TYPE_MAP) as EmailJobType[]
).filter((t) => CITIZEN_REGISTRATION_EMAIL_TYPE_MAP[t]);

export function isCitizenRegistrationEmailType(type: string): boolean {
  return CITIZEN_REGISTRATION_EMAIL_TYPE_MAP[type as EmailJobType] === true;
}

export const EMAIL_TYPE_PRIORITY: Record<EmailJobType, EmailPriority> = {
  'staff-invitation': 'critical',
  'password-reset': 'critical',
  'payment-notification': 'standard',
  'dispute-notification': 'standard',
  'dispute-resolution': 'standard',
  'backup-notification': 'standard',
  // Story 13-65 (AC3/AC4) — the two TRANSACTIONAL registration sends are `critical`: they carry a
  // citizen's own login link and their own reference code. `critical` is what keeps them out of the
  // >=80%-budget deferral. ⚠️ CORRECTED 2026-08-22 (13-65 review C5): this also claimed the type
  // was held out of "the queue-wide budget-exhaustion pause". There is no such pause any more —
  // it was REMOVED (review B1) because BullMQ's Queue.pause() is global and parked citizen mail
  // that was enqueued after it. Budget exhaustion now refuses the offending `standard` job only, so an
  // exhausted MARKETING budget can never stop a citizen's login link.
  'registration-magic-link': 'critical',
  'registration-confirmation': 'critical',
  // The thank-you IS marketing: it stays `standard`, under 13-46's cap and inside the ledger.
  'registration-thankyou': 'standard',
};

// ============================================================================
// Email Job Types (for BullMQ queue)
// ============================================================================

/**
 * Base job data for email queue
 */
interface BaseEmailJob {
  attemptNumber?: number;
  scheduledFor?: string; // ISO date for deferred emails
  priority?: EmailPriority;
}

/**
 * Staff invitation email job payload
 */
export interface StaffInvitationJob extends BaseEmailJob {
  type: 'staff-invitation';
  data: StaffInvitationEmailData;
  userId: string;
}

// Story 9-12 Task 10.3 (2026-05-11 session 8) — `VerificationJob` removed.
// The hybrid Magic-Link/OTP verification flow was retired; magic-link emails
// for the wizard are issued synchronously by `MagicLinkService.sendMagicLinkEmail`.

/**
 * Password reset email job payload
 */
export interface PasswordResetJob extends BaseEmailJob {
  type: 'password-reset';
  data: PasswordResetEmailData;
  userId: string;
}

/**
 * Payment notification email job payload
 */
export interface PaymentNotificationJob extends BaseEmailJob {
  type: 'payment-notification';
  data: PaymentNotificationEmailData;
  userId: string;
}

/**
 * Dispute notification email job payload (Story 6.5)
 */
export interface DisputeNotificationJob extends BaseEmailJob {
  type: 'dispute-notification';
  data: DisputeNotificationEmailData;
  userId: string;
}

/**
 * Dispute resolution email job payload (Story 6.6)
 */
export interface DisputeResolutionJob extends BaseEmailJob {
  type: 'dispute-resolution';
  data: DisputeResolutionEmailData;
  userId: string;
}

/**
 * Backup notification email job payload
 */
export interface BackupNotificationJob extends BaseEmailJob {
  type: 'backup-notification';
  data: BackupNotificationEmailData;
  userId: string;
}

/**
 * Union type for all email job payloads
 */
/** Story 13-65 — pending-NIN magic-link send, queued. */
export interface RegistrationMagicLinkJob extends BaseEmailJob {
  type: 'registration-magic-link';
  data: RegistrationMagicLinkEmailData;
  userId: string;
}

/** Story 13-65 — reference-code confirmation send, queued. */
export interface RegistrationConfirmationJob extends BaseEmailJob {
  type: 'registration-confirmation';
  data: RegistrationConfirmationEmailData;
  userId: string;
}

/** Story 13-65 — evergreen thank-you/referral send, queued. */
export interface RegistrationThankYouJob extends BaseEmailJob {
  type: 'registration-thankyou';
  data: RegistrationThankYouEmailData;
  userId: string;
}

export type EmailJob = StaffInvitationJob | PasswordResetJob | PaymentNotificationJob | DisputeNotificationJob | DisputeResolutionJob | BackupNotificationJob | RegistrationMagicLinkJob | RegistrationConfirmationJob | RegistrationThankYouJob;

// ============================================================================
// Email Configuration Types
// ============================================================================

/**
 * Supported email tiers for budget tracking
 */
export type EmailTier = 'free' | 'pro' | 'scale';

/**
 * ⛔ THE CANONICAL RESEND TIER TABLE. THE ONLY ONE. (2026-08-05)
 *
 * This existed in FOUR places that disagreed, and the disagreement caused a real
 * prod incident on 2026-08-05:
 *
 *   1. `email-budget.service.ts` TIER_LIMITS — **live and ENFORCING**
 *   2. `packages/config/src/email.ts` EMAIL_TIER_LIMITS — **dead, zero consumers**
 *   3. `ops-thresholds.ts` RESEND_FREE_TIER_DAILY — doubling as an API page size
 *   4. four blast scripts, each with a local `RESEND_FREE_TIER_DAILY_LIMIT = 100`
 *
 * `EMAIL_TIER` was never set on prod, so the ENFORCER defaulted to `free` (100/day)
 * while the account is on **Pro**. At 140 sends the guard tripped and the email
 * digest flush was skipped — `email.budget.daily_limit_reached tier:"free"
 * dailyCount:140 dailyLimit:100`. The next worker job would have paused the queue
 * outright, and staff/enumerator invitations run through that queue.
 *
 * Adding a fifth copy is how this recurs. Import from here.
 */
export const EMAIL_TIER_LIMITS = {
  free: {
    name: 'Free',
    monthlyPriceCents: 0,
    /** The free tier really does cut off daily. This is the one tier where it bites. */
    dailyLimit: 100,
    monthlyLimit: 3_000,
    hasOverage: false,
    overageCostPerThousandCents: 0,
  },
  pro: {
    name: 'Pro',
    monthlyPriceCents: 2_000,
    /** No daily cap on Pro — monthly is the only real ceiling. */
    dailyLimit: Number.POSITIVE_INFINITY,
    monthlyLimit: 50_000,
    hasOverage: true,
    overageCostPerThousandCents: 90,
  },
  scale: {
    name: 'Scale',
    monthlyPriceCents: 9_000,
    dailyLimit: Number.POSITIVE_INFINITY,
    monthlyLimit: 100_000,
    hasOverage: true,
    overageCostPerThousandCents: 90,
  },
} as const satisfies Record<EmailTier, EmailTierLimits>;

export interface EmailTierLimits {
  name: string;
  monthlyPriceCents: number;
  dailyLimit: number;
  monthlyLimit: number;
  hasOverage: boolean;
  overageCostPerThousandCents: number;
}

/**
 * Resolve the ACTIVE tier from the environment — the one place that reads
 * `EMAIL_TIER`, so the enforcer, the digest and the blast scripts can never again
 * believe different things.
 *
 * ⚠️ **Defaults to `pro`, not `free`.** The old `|| 'free'` default is precisely what
 * caused the incident: an unset variable silently became the most restrictive tier
 * and started blocking mail. Defaulting to the plan we actually pay for makes an
 * unset variable *permissive* rather than *silently destructive* — and over-sending
 * is caught by Resend's own quota, whereas under-sending is invisible.
 * If the plan is ever downgraded, set `EMAIL_TIER=free` explicitly.
 */
export function resolveEmailTier(env?: Record<string, string | undefined>): EmailTier {
  // ⚠️ BROWSER-SAFE, DELIBERATELY. `@oslsr/types` is bundled into the web app, and
  // `ops-thresholds.ts` derives its quota constants from this at MODULE LOAD — so a
  // bare `process.env` default crashes the Operations dashboard at import time, in
  // the browser, before any code calls this. The pre-push web build caught it
  // (TS2591); `tsc -p apps/api` and vitest both passed, because neither bundles.
  //
  // In a browser there is no EMAIL_TIER, so this returns the default. The web UI
  // therefore shows the DEFAULT plan's ceiling, not necessarily the configured one —
  // fine today (we are on the default), and noted in 13-42 as a follow-up: the
  // authoritative tier should travel in the ops snapshot rather than be re-derived
  // client-side.
  // Reach through `globalThis`, never the bare `process` identifier: the web
  // tsconfig has no @types/node, so even `typeof process` is a TS2591 error there.
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const source = env ?? g.process?.env ?? {};
  const raw = (source.EMAIL_TIER ?? '').trim().toLowerCase();
  return raw === 'free' || raw === 'pro' || raw === 'scale' ? raw : 'pro';
}

/** Limits for the active tier (or an explicit one). */
export function getEmailTierLimits(tier: EmailTier = resolveEmailTier()): EmailTierLimits {
  return EMAIL_TIER_LIMITS[tier];
}

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

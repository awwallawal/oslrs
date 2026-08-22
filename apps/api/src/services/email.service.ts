import pino from 'pino';
import type {
  EmailProvider,
  EmailResult,
  EmailConfig,
  PasswordResetEmailData,
  // VerificationEmailData removed alongside the hybrid Magic-Link/OTP
  // template (Story 9-12 Task 10.3, 2026-05-11 session 8).
  DuplicateRegistrationEmailData,
  StaffInvitationEmailData,
  PaymentNotificationEmailData,
  DisputeNotificationEmailData,
  DisputeResolutionEmailData,
  StaffActivationCompleteEmailData, // Story 13-59
} from '@oslsr/types';
import { getRoleDisplayName } from '@oslsr/types';
import { getStaffActivationCopy } from './staff-activation-copy.js'; // Story 13-59
import { getEmailProvider, getEmailConfigFromEnv } from '../providers/index.js';
import { NotificationMeter } from './notification-meter.service.js';
import { classifyEmailSubject, type NotificationCategory } from './notification-category.js';
import { buildListUnsubscribeHeaders, isMarketingCategory } from './list-unsubscribe.js';
import { recordCampaignSend } from './campaign-contact.service.js'; // Story 13-24 (AC3a)

const logger = pino({ name: 'email-service' });

/**
 * Email Service for sending transactional emails
 *
 * Uses the provider pattern to abstract email delivery.
 * Supports Resend in production and mock provider for development/testing.
 *
 * Features:
 * - OSLSR branding (Oyo State Red #9C1E23)
 * - HTML and plain-text email formats
 * - Graceful error handling with structured logging
 * - Development preview logging
 */
export class EmailService {
  private static readonly APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:5173';
  private static readonly BRAND_COLOR = '#9C1E23'; // Oyo State Red
  private static readonly SUPPORT_URL = process.env.SUPPORT_URL || 'https://oyoskills.com';

  private static provider: EmailProvider | null = null;
  private static config: EmailConfig | null = null;

  /**
   * Initialize the email service with configuration
   * Call this during app startup or let it auto-initialize on first use
   */
  static initialize(config?: EmailConfig): void {
    this.config = config || getEmailConfigFromEnv();
    this.provider = getEmailProvider(this.config);

    logger.info({
      event: 'email.service.initialized',
      provider: this.provider.name,
      enabled: this.config.enabled,
      tier: this.config.tier,
    });
  }

  /**
   * Get the email provider, initializing if needed
   */
  private static getProvider(): EmailProvider {
    if (!this.provider) {
      this.initialize();
    }
    return this.provider!;
  }

  /**
   * Get current email configuration
   */
  static getConfig(): EmailConfig {
    if (!this.config) {
      this.initialize();
    }
    return this.config!;
  }

  /**
   * Check if email service is enabled
   */
  static isEnabled(): boolean {
    return this.getConfig().enabled;
  }

  /**
   * Story 9-63 (Task 3 / AC1) — the single counted email chokepoint.
   *
   * EVERY email leaves the building through here: each typed sender and
   * `sendGenericEmail` calls `dispatch()` instead of `getProvider().send()`
   * directly, so no send can bypass the NotificationMeter counter. The category
   * is derived from the subject via the shared classifier (the
   * `_diagnose-email-usage.ts` reference mapping), unless the caller passes an
   * explicit `category` (e.g. a blast script that knows its own bucket).
   *
   * Counting is fire-and-forget AFTER a successful provider send and fails open
   * (the meter swallows its own errors), so instrumentation can never change
   * send behaviour, recipients, or the returned `EmailResult`.
   */
  private static async dispatch(
    data: { to: string; subject: string; html: string; text: string },
    category?: NotificationCategory,
    /**
     * Story 13-9 (AC5) — optional campaign id forwarded to the provider as a
     * Resend tag (`campaign_id`), so inbound webhook events attribute to the
     * campaign in `email_events`. Pure pass-through; never affects send behaviour.
     */
    campaignId?: string,
  ): Promise<EmailResult> {
    /**
     * Story 13-46 (review A4 / finding H4) — RESOLVE THE CATEGORY ONCE, HERE, FOR EVERYTHING BELOW.
     *
     * ⚠️ THE BUG THIS CLOSES: the cap gated on the caller-DECLARED `category`, while
     * `recordEmailSend` fell back to `classifyEmailSubject(subject)` when the caller declared none.
     * So a send with no declared category could be COUNTED into the marketing bucket and never
     * CAPPED — "counted but not capped". Two consequences, both bad in the same direction:
     * transactional traffic could exhaust the marketing ceiling and cause real thank-yous to be
     * refused, and the `marketingHeadroom` the AC3 burst alert publishes would be wrong.
     *
     * Proven live by the reviewer against the real classifier: the supplemental-survey subject at
     * `magic-link.service.ts:420` classifies as `supplemental-survey` (marketing) and is sent at
     * `:377` with NO category. Dormant only because nothing calls it with that purpose today — one
     * caller away, and nothing guarded it.
     *
     * ⚠️ THIS DELIBERATELY WIDENS 13-13 AND 13-24 TOO, and that is stated rather than slid in: an
     * uncategorised send whose SUBJECT classifies as marketing now also gets the List-Unsubscribe
     * header and a `campaign_sends` ledger row. That is the correct reading of both stories — the
     * category is a property of the mail, not of how carefully the caller filled in an argument.
     */
    const resolvedCategory = category ?? classifyEmailSubject(data.subject);

    // Story 13-13 (AC3/AC4) — attach List-Unsubscribe headers for MARKETING categories only. The
    // category lives here (not in the provider), so this is the single decision point; the provider
    // stays a thin transport that forwards whatever headers it's handed. Returns undefined (→ no
    // headers) for transactional / ops mail.
    const headers = buildListUnsubscribeHeaders(resolvedCategory, data.to);

    /**
     * ATTRIBUTION TAG — default to the category so NO send is untagged (2026-08-04).
     *
     * `campaignId` was doing two unrelated jobs and only one of them is real. It is the tag
     * Resend echoes on webhook events, which is how `email_events.campaign_id` attributes a
     * delivery or a bounce. It was ALSO acting as an implicit "this is marketing" flag, purely
     * by convention: transactional callers passed nothing. That second job does not exist —
     * the ledger write below gates on `isMarketingCategory(category)`, never on `campaignId` —
     * so tagging transactional mail changes nothing about dedupe, suppression or
     * `campaign_sends`, and buys attribution for free.
     *
     * What it cost to leave untagged: on 2026-08-04, seven citizens were sent a correction
     * email after the adoption duplicate incident. Those sends carry no tag, so if one had
     * bounced we would have learned it only from the suppression list, with no way back to the
     * send. Bounce/complaint reconciliation is named as "a later task" a few lines below; this
     * is the piece that makes it possible at all.
     *
     * Every `NotificationCategory` is kebab-case and satisfies the provider's
     * `^[A-Za-z0-9_-]+$` tag rule (`resend.provider.ts:21`), so the default can never be
     * silently dropped as an invalid tag. An explicit campaignId still wins.
     */
    const attributionTag = campaignId ?? resolvedCategory;

    /**
     * Story 13-46 (AC1) — THE MARKETING SEND CAP, CONSULTED BEFORE THE PROVIDER CALL.
     *
     * ⚠️ POSITION IS THE WHOLE REQUIREMENT. `NotificationMeter.recordEmailSend(...)` below runs
     * AFTER `getProvider().send(...)` and its return value is discarded — by the time the meter
     * knows about a send, the send has left the building ("Counted, not blocked: the send already
     * happened", notification-meter.service.ts). A cap is therefore a NEW PRE-SEND CHECK, not a
     * new constant, and moving this call below the provider silently disarms it.
     *
     * CATEGORY-AWARE BY CONSTRUCTION: `checkCap` returns allowed for everything outside
     * MARKETING_CATEGORIES, so a magic link, a password reset and a critical alert keep today's
     * fail-open behaviour exactly. That is not an oversight to tidy up later — fail-open is the
     * CORRECT default for transactional mail, and a global cap would be a regression.
     *
     * Fail-open on infrastructure, fail-closed on the limit (see `checkCap`).
     */
    const capDecision = await NotificationMeter.checkCap(resolvedCategory);
    if (!capDecision.allowed) {
      await NotificationMeter.reportCapRefusal(capDecision, data.to);
      // A STRUCTURED failure, not a swallowed no-op: the caller learns the send did not happen.
      return {
        success: false,
        // A2/H2 — a typed marker, not a parseable message: a refusal is a DECISION, not a fault.
        refusedByCap: true,
        error: `Marketing send cap reached (${capDecision.reason}: ${capDecision.count}/${capDecision.cap} in the ${capDecision.window} window)`,
      };
    }

    const result = await this.getProvider().send({ ...data, campaignId: attributionTag, headers });
    if (result.success) {
      // Count only real sends; bounce/complaint reconciliation is a later task.
      // A4/H4 — pass the RESOLVED category so the thing that gates and the thing that counts can
      // never disagree again. (`recordEmailSend` would classify identically; passing it explicitly
      // is what makes the invariant local and testable rather than coincidental.)
      await NotificationMeter.recordEmailSend({
        subject: data.subject,
        recipient: data.to,
        category: resolvedCategory,
      });

      // Story 13-24 (AC3a) — record the marketing contact HERE, at the one chokepoint, rather than
      // in each blast script. Every initiator (the 3 operator blasts, the welcome backfill, the
      // 13-12 evergreen auto-send) funnels through dispatch(), so the ledger is complete by
      // construction and a future blast inherits it without opting in — the fragmentation that
      // created the double-send gap cannot recur (13-24 Dev Notes; PM validation §2).
      //
      // MARKETING categories only, reusing the 13-13 set: you don't "already contacted" someone out
      // of a password reset or a magic link. Fail-soft inside recordCampaignSend — instrumentation
      // must never change send behaviour or the returned EmailResult.
      if (isMarketingCategory(resolvedCategory)) {
        await recordCampaignSend({
          email: data.to,
          campaignId: campaignId ?? null,
          category: resolvedCategory ?? null,
          channel: 'email',
          messageId: result.messageId ?? null,
        });
      }
    }
    return result;
  }

  // ==========================================================================
  // Staff Invitation Email (AC2)
  // ==========================================================================

  /**
   * Sends a staff invitation email
   *
   * Email includes:
   * - OSLSR branding (Oyo State Red #9C1E23)
   * - Personalized greeting with staff name
   * - Role assignment information
   * - LGA assignment (for field staff)
   * - Secure activation link
   * - Link expiration notice (24 hours)
   * - Support contact information
   */
  static async sendStaffInvitationEmail(data: StaffInvitationEmailData): Promise<EmailResult> {
    if (!this.isEnabled()) {
      logger.warn({
        event: 'email.staff_invitation.disabled',
        to: data.email,
        note: 'Email service is disabled',
      });
      return { success: false, error: 'Email service is disabled' };
    }

    const subject = `You've been invited to join OSLSR - ${data.roleName}`;

    return this.dispatch({
      to: data.email,
      subject,
      html: this.getStaffInvitationHtml(data),
      text: this.getStaffInvitationText(data),
    }, 'staff-invitation');
  }

  /**
   * Generates staff invitation HTML email
   */
  static getStaffInvitationHtml(data: StaffInvitationEmailData): string {
    const lgaSection = data.lgaName
      ? `<p style="margin: 10px 0;"><strong>LGA Assignment:</strong> ${data.lgaName}</p>`
      : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Staff Invitation - OSLSR</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${this.BRAND_COLOR}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour & Skills Registry</p>
  </div>

  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">You've Been Invited!</h2>

    <p>Hello ${data.fullName},</p>

    <p>You have been invited to join the Oyo State Labour & Skills Registry as a staff member.</p>

    <div style="background-color: #fff; padding: 15px; border-radius: 5px; border-left: 4px solid ${this.BRAND_COLOR}; margin: 20px 0;">
      <p style="margin: 10px 0;"><strong>Role:</strong> ${data.roleName}</p>
      ${lgaSection}
    </div>

    <p>Click the button below to activate your account and complete your profile setup:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.activationUrl}" style="background-color: ${this.BRAND_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Activate Your Account</a>
    </div>

    <p style="color: #666; font-size: 14px;">This invitation link will expire in ${data.expiresInHours} hours.</p>

    <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: ${this.BRAND_COLOR}; font-size: 14px;">${data.activationUrl}</p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="color: #999; font-size: 12px;">
      <strong>Need help?</strong> Contact support at <a href="${this.SUPPORT_URL}" style="color: ${this.BRAND_COLOR};">${this.SUPPORT_URL}</a>
    </p>

    <p style="color: #999; font-size: 12px; text-align: center;">
      This email was sent by the Oyo State Labour & Skills Registry.<br>
      &copy; ${new Date().getFullYear()} Government of Oyo State. All rights reserved.
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generates staff invitation plain text email
   */
  static getStaffInvitationText(data: StaffInvitationEmailData): string {
    const lgaLine = data.lgaName ? `LGA Assignment: ${data.lgaName}\n` : '';

    return `
You've Been Invited to Join OSLSR - ${data.roleName}

Hello ${data.fullName},

You have been invited to join the Oyo State Labour & Skills Registry as a staff member.

Role: ${data.roleName}
${lgaLine}
Click the link below to activate your account and complete your profile setup:
${data.activationUrl}

This invitation link will expire in ${data.expiresInHours} hours.

Need help? Contact support at ${this.SUPPORT_URL}

---
Oyo State Labour & Skills Registry
Government of Oyo State
    `.trim();
  }

  // ==========================================================================
  // Staff Activation COMPLETION Email (Story 13-59, AC1/AC2/AC4)
  // ==========================================================================

  /**
   * Sends the email that closes the activation journey.
   *
   * Before this story the wizard finished, waited five seconds and redirected to
   * a login screen — that was the entire close of the flow, and the person was
   * left holding nothing.
   *
   * ⛔ **NO ATTACHMENTS** (AC4, standing ruling 2026-08-10). This domain also
   * carries the re-engagement blasts and the radio jingle's traffic; seven
   * months of sender reputation is not spent on a delivery convenience the
   * in-app modal provides for free. The body is self-sufficient (staff ID, LGA,
   * the read-out rule, the staff login URL) and instructs the person to log in
   * and download — which AC7's persistent modal then makes true.
   *
   * ⚠️ Throws nothing on a bad role: `getStaffActivationCopy` DOES throw, and
   * the caller in `auth.service.ts` catches it, because a failed courtesy email
   * must never fail an activation that has already committed (AC2.2).
   */
  static async sendStaffActivationCompleteEmail(
    data: StaffActivationCompleteEmailData,
  ): Promise<EmailResult> {
    if (!this.isEnabled()) {
      logger.warn({
        event: 'email.staff_activation_complete.disabled',
        to: data.email,
        note: 'Email service is disabled',
      });
      return { success: false, error: 'Email service is disabled' };
    }

    // Rendered BEFORE dispatch so a missing-copy role fails before any send.
    const html = this.getStaffActivationCompleteHtml(data);
    const text = this.getStaffActivationCompleteText(data);

    return this.dispatch({
      to: data.email,
      subject: this.getStaffActivationCompleteSubject(data.roleName),
      html,
      text,
    }, 'staff-activation-complete');
  }

  /**
   * "Your OSLRS account is active — [Role]".
   *
   * ⚠️ The word "onboarded" is banned from this whole surface: it is SaaS/HR
   * jargon that reads oddly in Nigerian government English — nobody says "I have
   * been onboarded."
   */
  static getStaffActivationCompleteSubject(roleName: string): string {
    return `Your OSLRS account is active — ${getRoleDisplayName(roleName)}`;
  }

  static getStaffActivationCompleteHtml(data: StaffActivationCompleteEmailData): string {
    const copy = getStaffActivationCopy(data.roleName, { lgaName: data.lgaName });
    const roleLabel = getRoleDisplayName(data.roleName);

    const detailBlocks = copy.details
      .map(
        (line) =>
          `<p style="margin: 12px 0; color: #333;">${line}</p>`,
      )
      .join('\n    ');

    const lgaRow = data.lgaName
      ? `<p style="margin: 5px 0;"><strong>LGA:</strong> ${data.lgaName}</p>`
      : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your OSLRS account is active - OSLSR</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${this.BRAND_COLOR}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour &amp; Skills Registry</p>
  </div>

  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">Your account is active</h2>

    <p>Hello ${data.fullName},</p>

    <p style="font-size: 16px;"><strong>${copy.headline}</strong></p>

    <div style="background-color: #fff; padding: 15px; border-radius: 5px; border-left: 4px solid ${this.BRAND_COLOR}; margin: 20px 0;">
      <p style="margin: 5px 0;"><strong>Name:</strong> ${data.fullName}</p>
      <p style="margin: 5px 0;"><strong>Role:</strong> ${roleLabel}</p>
      ${lgaRow}
      <p style="margin: 5px 0;"><strong>Staff ID:</strong> ${data.staffId}</p>
    </div>

    ${detailBlocks}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.loginUrl}" style="background-color: ${this.BRAND_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Sign in to OSLRS</a>
    </div>

    <p style="color: #666; font-size: 14px;">Staff sign-in page:</p>
    <p style="word-break: break-all; color: ${this.BRAND_COLOR}; font-size: 14px;">${data.loginUrl}</p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="color: #999; font-size: 12px;">
      <strong>Need help?</strong> Contact support at <a href="${this.SUPPORT_URL}" style="color: ${this.BRAND_COLOR};">${this.SUPPORT_URL}</a>
    </p>

    <p style="color: #999; font-size: 12px; text-align: center;">
      This email was sent by the Oyo State Labour &amp; Skills Registry.<br>
      &copy; ${new Date().getFullYear()} Government of Oyo State. All rights reserved.
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  static getStaffActivationCompleteText(data: StaffActivationCompleteEmailData): string {
    const copy = getStaffActivationCopy(data.roleName, { lgaName: data.lgaName });
    const roleLabel = getRoleDisplayName(data.roleName);
    const lgaLine = data.lgaName ? `LGA: ${data.lgaName}\n` : '';
    const detailLines = copy.details.length ? `\n${copy.details.join('\n\n')}\n` : '';

    return `
Your OSLRS account is active - ${roleLabel}

Hello ${data.fullName},

${copy.headline}

Name: ${data.fullName}
Role: ${roleLabel}
${lgaLine}Staff ID: ${data.staffId}
${detailLines}
Sign in here: ${data.loginUrl}

Need help? Contact support at ${this.SUPPORT_URL}

---
Oyo State Labour & Skills Registry
Government of Oyo State
    `.trim();
  }

  // ==========================================================================
  // Password Reset Email
  // ==========================================================================

  /**
   * Sends a password reset email
   */
  static async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<EmailResult> {
    if (!this.isEnabled()) {
      logger.warn({
        event: 'email.password_reset.disabled',
        to: data.email,
        note: 'Email service is disabled',
      });
      return { success: false, error: 'Email service is disabled' };
    }

    return this.dispatch({
      to: data.email,
      subject: 'Password Reset Request - OSLSR',
      html: this.getPasswordResetHtml(data),
      text: this.getPasswordResetText(data),
    }, 'password-reset');
  }

  /**
   * Generates a password reset URL
   */
  static generateResetUrl(token: string): string {
    return `${this.APP_URL}/reset-password/${token}`;
  }

  /**
   * Gets HTML content for password reset email
   */
  private static getPasswordResetHtml(data: PasswordResetEmailData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset - OSLSR</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${this.BRAND_COLOR}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour & Skills Registry</p>
  </div>

  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>

    <p>Hello ${data.fullName},</p>

    <p>We received a request to reset your password for your OSLSR account. Click the button below to create a new password:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.resetUrl}" style="background-color: ${this.BRAND_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
    </div>

    <p style="color: #666; font-size: 14px;">This link will expire in ${data.expiresInHours} hour(s). If you didn't request this, you can safely ignore this email.</p>

    <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: ${this.BRAND_COLOR}; font-size: 14px;">${data.resetUrl}</p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; text-align: center;">
      This email was sent by the Oyo State Labour & Skills Registry.<br>
      &copy; ${new Date().getFullYear()} Government of Oyo State. All rights reserved.
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Gets plain text content for password reset email
   */
  private static getPasswordResetText(data: PasswordResetEmailData): string {
    return `
Password Reset Request - OSLSR

Hello ${data.fullName},

We received a request to reset your password for your OSLSR account.

Click this link to reset your password:
${data.resetUrl}

This link will expire in ${data.expiresInHours} hour(s).

If you didn't request this password reset, you can safely ignore this email.

---
Oyo State Labour & Skills Registry
Government of Oyo State
    `.trim();
  }

  // ==========================================================================
  // Story 9-12 Task 10.3 (2026-05-11 session 8) — Hybrid Magic-Link/OTP
  // verification email retired. Replaced by per-purpose magic-link emails
  // rendered inline in `MagicLinkService.sendMagicLinkEmail` (Story 9-12 AC#6).
  // ADR-015 was rewritten alongside this story to drop the hybrid pattern.
  //
  // Removed surface (was here):
  //   - sendVerificationEmail(data: VerificationEmailData)
  //   - generateVerificationUrl(token: string)
  //   - getVerificationHtml(data: VerificationEmailData)
  //   - getVerificationText(data: VerificationEmailData)
  // ==========================================================================

  // ==========================================================================
  // Duplicate Registration Email
  // ==========================================================================

  /**
   * Sends notification when someone attempts to register with an existing email
   */
  static async sendDuplicateRegistrationAttemptEmail(
    data: DuplicateRegistrationEmailData
  ): Promise<EmailResult> {
    if (!this.isEnabled()) {
      logger.warn({
        event: 'email.duplicate_registration.disabled',
        to: data.email,
        note: 'Email service is disabled',
      });
      return { success: false, error: 'Email service is disabled' };
    }

    return this.dispatch({
      to: data.email,
      subject: 'Registration Attempt Detected - OSLSR',
      html: this.getDuplicateRegistrationHtml(data),
      text: this.getDuplicateRegistrationText(data),
    }, 'duplicate-registration');
  }

  /**
   * Gets HTML content for duplicate registration email
   */
  private static getDuplicateRegistrationHtml(data: DuplicateRegistrationEmailData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Registration Attempt Detected - OSLSR</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${this.BRAND_COLOR}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour & Skills Registry</p>
  </div>

  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">Registration Attempt Detected</h2>

    <p>Hello ${data.fullName},</p>

    <p>Someone attempted to create a new OSLSR account using your email address on ${data.attemptedAt}.</p>

    <p><strong>If this was you:</strong> You already have an account. Please use the login page to access your existing account, or use "Forgot Password" if needed.</p>

    <p><strong>If this wasn't you:</strong> Your account is secure. No action is required, but you may want to update your password as a precaution.</p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; text-align: center;">
      This email was sent by the Oyo State Labour & Skills Registry.<br>
      &copy; ${new Date().getFullYear()} Government of Oyo State. All rights reserved.
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Gets plain text content for duplicate registration email
   */
  private static getDuplicateRegistrationText(data: DuplicateRegistrationEmailData): string {
    return `
Registration Attempt Detected - OSLSR

Hello ${data.fullName},

Someone attempted to create a new OSLSR account using your email address on ${data.attemptedAt}.

If this was you: You already have an account. Please use the login page to access your existing account, or use "Forgot Password" if needed.

If this wasn't you: Your account is secure. No action is required, but you may want to update your password as a precaution.

---
Oyo State Labour & Skills Registry
Government of Oyo State
    `.trim();
  }

  // ==========================================================================
  // Staff Activation URL Generation
  // ==========================================================================

  /**
   * Generates a staff activation URL
   * Format: {APP_URL}/activate/{token}
   */
  static generateStaffActivationUrl(token: string): string {
    return `${this.APP_URL}/activate/${token}`;
  }

  // ==========================================================================
  // Payment Notification Email (Story 6.4)
  // ==========================================================================

  /**
   * Sends a payment notification email to a staff member.
   */
  static async sendPaymentNotificationEmail(data: PaymentNotificationEmailData): Promise<EmailResult> {
    if (!this.isEnabled()) {
      logger.warn({
        event: 'email.payment_notification.disabled',
        to: data.email,
        note: 'Email service is disabled',
      });
      return { success: false, error: 'Email service is disabled' };
    }

    const subject = `[OSLRS] Payment Recorded — ${data.trancheName}`;
    const amountFormatted = `₦${(data.amount / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

    return this.dispatch({
      to: data.email,
      subject,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Notification - OSLSR</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${this.BRAND_COLOR}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour & Skills Registry</p>
  </div>

  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">Payment Recorded</h2>

    <p>Hello ${data.staffName},</p>

    <p>A stipend payment has been recorded for you in the Oyo State Labour & Skills Registry.</p>

    <div style="background-color: #fff; padding: 15px; border-radius: 5px; border-left: 4px solid ${this.BRAND_COLOR}; margin: 20px 0;">
      <p style="margin: 5px 0;"><strong>Tranche:</strong> ${data.trancheName}</p>
      <p style="margin: 5px 0;"><strong>Amount:</strong> ${amountFormatted}</p>
      <p style="margin: 5px 0;"><strong>Date:</strong> ${data.date}</p>
      <p style="margin: 5px 0;"><strong>Bank Reference:</strong> ${data.bankReference}</p>
    </div>

    <p>If you have any questions about this payment, please contact your supervisor or the system administrator.</p>

    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

    <p style="font-size: 12px; color: #999;">
      This is an automated notification from the OSLSR system. Do not reply to this email.
    </p>
  </div>
</body>
</html>`,
      text: `Payment Recorded — ${data.trancheName}\n\nHello ${data.staffName},\n\nA stipend payment has been recorded for you.\n\nTranche: ${data.trancheName}\nAmount: ${amountFormatted}\nDate: ${data.date}\nBank Reference: ${data.bankReference}\n\nIf you have questions, contact your supervisor or administrator.`,
    }, 'payment-notification');
  }

  // ==========================================================================
  // Dispute Notification Email (Story 6.5)
  // ==========================================================================

  /**
   * Sends a dispute notification email to a Super Admin.
   * Called by the email worker when processing dispute-notification jobs.
   * Recipients are resolved by the caller (RemunerationService) and passed as `to`.
   */
  static async sendDisputeNotificationEmail(data: DisputeNotificationEmailData): Promise<EmailResult> {
    if (!this.isEnabled()) {
      logger.warn({
        event: 'email.dispute_notification.disabled',
        to: data.to,
        note: 'Email service is disabled',
      });
      return { success: false, error: 'Email service is disabled' };
    }

    const subject = `[OSLRS] Payment Dispute Raised — ${data.staffName}`;
    const amountFormatted = `₦${(data.amount / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

    return this.dispatch({
      to: data.to,
      subject,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Dispute - OSLSR</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${this.BRAND_COLOR}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour & Skills Registry</p>
  </div>

  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">Payment Dispute Raised</h2>

    <p>A staff member has raised a dispute regarding a payment record.</p>

    <div style="background-color: #fff; padding: 15px; border-radius: 5px; border-left: 4px solid #d97706; margin: 20px 0;">
      <p style="margin: 5px 0;"><strong>Staff:</strong> ${data.staffName}</p>
      <p style="margin: 5px 0;"><strong>Tranche:</strong> ${data.trancheName}</p>
      <p style="margin: 5px 0;"><strong>Amount:</strong> ${amountFormatted}</p>
      <p style="margin: 5px 0;"><strong>Issue:</strong> ${data.commentExcerpt}</p>
    </div>

    <p>Please review this dispute in the OSLRS administration dashboard.</p>

    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

    <p style="font-size: 12px; color: #999;">
      This is an automated notification from the OSLSR system. Do not reply to this email.
    </p>
  </div>
</body>
</html>`,
      text: `Payment Dispute Raised — ${data.staffName}\n\nA staff member has raised a dispute regarding a payment record.\n\nStaff: ${data.staffName}\nTranche: ${data.trancheName}\nAmount: ${amountFormatted}\nIssue: ${data.commentExcerpt}\n\nPlease review this dispute in the OSLRS administration dashboard.`,
    }, 'dispute');
  }

  // ==========================================================================
  // Dispute Resolution Email (Story 6.6)
  // ==========================================================================

  /**
   * Sends a dispute resolution email to staff when admin acknowledges/resolves their dispute.
   */
  static async sendDisputeResolutionEmail(data: DisputeResolutionEmailData): Promise<EmailResult> {
    if (!this.isEnabled()) {
      logger.warn({
        event: 'email.dispute_resolution.disabled',
        to: data.staffEmail,
        note: 'Email service is disabled',
      });
      return { success: false, error: 'Email service is disabled' };
    }

    const actionLabel = data.action === 'resolved' ? 'Resolved' : 'Acknowledged';
    const subject = `[OSLRS] Payment Dispute ${actionLabel} — ${data.trancheName}`;
    const amountFormatted = `₦${(data.amount / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    const borderColor = data.action === 'resolved' ? '#16a34a' : '#2563eb';

    return this.dispatch({
      to: data.staffEmail,
      subject,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dispute ${actionLabel} - OSLSR</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${this.BRAND_COLOR}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour & Skills Registry</p>
  </div>

  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">Payment Dispute ${actionLabel}</h2>

    <p>Dear ${data.staffName},</p>
    <p>Your payment dispute has been <strong>${actionLabel.toLowerCase()}</strong> by the administrator.</p>

    <div style="background-color: #fff; padding: 15px; border-radius: 5px; border-left: 4px solid ${borderColor}; margin: 20px 0;">
      <p style="margin: 5px 0;"><strong>Tranche:</strong> ${data.trancheName}</p>
      <p style="margin: 5px 0;"><strong>Amount:</strong> ${amountFormatted}</p>
      <p style="margin: 5px 0;"><strong>Admin Response:</strong> ${data.adminResponse}</p>
      ${data.hasEvidence ? '<p style="margin: 5px 0;"><strong>Evidence:</strong> Supporting documentation has been attached to the record.</p>' : ''}
    </div>

    <p>Log in to the OSLSR dashboard to view the full details.</p>

    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

    <p style="font-size: 12px; color: #999;">
      This is an automated notification from the OSLSR system. Do not reply to this email.
    </p>
  </div>
</body>
</html>`,
      text: `Payment Dispute ${actionLabel}\n\nDear ${data.staffName},\n\nYour payment dispute has been ${actionLabel.toLowerCase()} by the administrator.\n\nTranche: ${data.trancheName}\nAmount: ${amountFormatted}\nAdmin Response: ${data.adminResponse}\n${data.hasEvidence ? 'Evidence: Supporting documentation has been attached to the record.\n' : ''}\nLog in to the OSLSR dashboard to view the full details.`,
    }, 'dispute');
  }

  // ==========================================================================
  // Generic Email (for system alerts)
  // ==========================================================================

  /**
   * Sends a generic email (used by AlertService for system health alerts).
   */
  static async sendGenericEmail(
    data: {
      to: string;
      subject: string;
      html: string;
      text: string;
    },
    /**
     * Story 9-63 (Task 3 / AC1) — optional explicit category. Direct callers
     * whose subject doesn't self-classify (e.g. the re-engagement blast script)
     * pass their bucket here; everyone else relies on the subject classifier in
     * `dispatch()`. Magic-link, registration-status, backup, health-digest and
     * notification-digest subjects all classify correctly without this.
     */
    category?: NotificationCategory,
    /**
     * Story 13-9 (AC5) — optional campaign id. Blast scripts pass their run's
     * campaign id (e.g. `reengagement-2026-07`) so the Resend send is tagged and
     * the resulting webhook events populate `email_events.campaign_id` per campaign.
     */
    campaignId?: string,
  ): Promise<EmailResult> {
    if (!this.isEnabled()) {
      logger.warn({
        event: 'email.generic.disabled',
        to: data.to,
        note: 'Email service is disabled',
      });
      return { success: false, error: 'Email service is disabled' };
    }

    return this.dispatch(data, category, campaignId);
  }

}

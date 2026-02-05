import pino from 'pino';
import type {
  EmailProvider,
  EmailResult,
  EmailConfig,
  PasswordResetEmailData,
  VerificationEmailData,
  DuplicateRegistrationEmailData,
  StaffInvitationEmailData,
  OdkSyncAlertEmailData,
} from '@oslsr/types';
import { getEmailProvider, getEmailConfigFromEnv } from '../providers/index.js';

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
  private static readonly APP_URL = process.env.APP_URL || 'http://localhost:5173';
  private static readonly BRAND_COLOR = '#9C1E23'; // Oyo State Red
  private static readonly SUPPORT_URL = 'https://oyotradeministry.com.ng';

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

    return this.getProvider().send({
      to: data.email,
      subject,
      html: this.getStaffInvitationHtml(data),
      text: this.getStaffInvitationText(data),
    });
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

    return this.getProvider().send({
      to: data.email,
      subject: 'Password Reset Request - OSLSR',
      html: this.getPasswordResetHtml(data),
      text: this.getPasswordResetText(data),
    });
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
  // Verification Email (ADR-015 Hybrid: Magic Link + OTP)
  // ==========================================================================

  /**
   * Sends a hybrid verification email with both magic link and OTP
   *
   * Per ADR-015: Single email contains BOTH verification methods:
   * - Magic Link (primary): Click to verify
   * - 6-digit OTP (fallback): Enter code if link doesn't work
   */
  static async sendVerificationEmail(data: VerificationEmailData): Promise<EmailResult> {
    if (!this.isEnabled()) {
      logger.warn({
        event: 'email.verification.disabled',
        to: data.email,
        note: 'Email service is disabled',
      });
      return { success: false, error: 'Email service is disabled' };
    }

    return this.getProvider().send({
      to: data.email,
      subject: 'Verify Your Email - OSLSR',
      html: this.getVerificationHtml(data),
      text: this.getVerificationText(data),
    });
  }

  /**
   * Generates an email verification URL
   */
  static generateVerificationUrl(token: string): string {
    return `${this.APP_URL}/verify-email/${token}`;
  }

  /**
   * Gets HTML content for hybrid verification email (Magic Link + OTP)
   * Public for email preview routes
   */
  static getVerificationHtml(data: VerificationEmailData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - OSLSR</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${this.BRAND_COLOR}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour & Skills Registry</p>
  </div>

  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">Welcome to OSLSR!</h2>

    <p>Hello ${data.fullName},</p>

    <p>Thank you for registering with the Oyo State Labour & Skills Registry. Please verify your email address to complete your registration.</p>

    <p><strong>Click the link OR enter the code below:</strong></p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.verificationUrl}" style="background-color: ${this.BRAND_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verify Email Address</a>
    </div>

    <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #fff; border-radius: 8px; border: 2px dashed #ddd;">
      <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Or enter this code:</p>
      <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; color: ${this.BRAND_COLOR}; margin: 0; font-family: monospace;">${data.otpCode}</p>
      <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">Code expires in ${data.otpExpiresInMinutes} minutes</p>
    </div>

    <p style="color: #666; font-size: 14px;">The verification link expires in ${data.magicLinkExpiresInHours} hour(s). If you didn't create an account with OSLSR, you can safely ignore this email.</p>

    <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: ${this.BRAND_COLOR}; font-size: 14px;">${data.verificationUrl}</p>

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
   * Gets plain text content for hybrid verification email
   */
  private static getVerificationText(data: VerificationEmailData): string {
    return `
Welcome to OSLSR - Verify Your Email

Hello ${data.fullName},

Thank you for registering with the Oyo State Labour & Skills Registry.

CLICK THE LINK OR ENTER THE CODE:

Verification Link:
${data.verificationUrl}
(Link expires in ${data.magicLinkExpiresInHours} hour(s))

Verification Code: ${data.otpCode}
(Code expires in ${data.otpExpiresInMinutes} minutes)

If you didn't create an account with OSLSR, you can safely ignore this email.

---
Oyo State Labour & Skills Registry
Government of Oyo State
    `.trim();
  }

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

    return this.getProvider().send({
      to: data.email,
      subject: 'Registration Attempt Detected - OSLSR',
      html: this.getDuplicateRegistrationHtml(data),
      text: this.getDuplicateRegistrationText(data),
    });
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
  // ODK Sync Alert Email (Story 2-5, AC4, AC6)
  // ==========================================================================

  /**
   * Sends an ODK sync alert email to Super Admin
   *
   * Email includes:
   * - Alert type (submission gap or unreachable)
   * - Details about the issue
   * - Link to admin dashboard
   * - Timestamp of detection
   */
  static async sendOdkSyncAlertEmail(data: OdkSyncAlertEmailData): Promise<EmailResult> {
    if (!this.isEnabled()) {
      logger.warn({
        event: 'email.odk_sync_alert.disabled',
        to: data.email,
        alertType: data.alertType,
        note: 'Email service is disabled',
      });
      return { success: false, error: 'Email service is disabled' };
    }

    const subject = data.alertType === 'submission_gap'
      ? `OSLSR Alert: Submission Sync Gap Detected`
      : `OSLSR Alert: ODK Central Unreachable`;

    return this.getProvider().send({
      to: data.email,
      subject,
      html: this.getOdkSyncAlertHtml(data),
      text: this.getOdkSyncAlertText(data),
    });
  }

  /**
   * Generates ODK sync alert HTML email
   */
  static getOdkSyncAlertHtml(data: OdkSyncAlertEmailData): string {
    const alertTitle = data.alertType === 'submission_gap'
      ? 'Submission Sync Gap Detected'
      : 'ODK Central Unreachable';

    let detailsSection = '';

    if (data.alertType === 'submission_gap' && data.gapDetails) {
      const formRows = data.gapDetails.byForm
        .filter(f => f.gap > 0)
        .map(f => `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${f.formId}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${f.odkCount}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${f.appDbCount}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; color: ${this.BRAND_COLOR}; font-weight: bold;">${f.gap}</td>
          </tr>
        `).join('');

      detailsSection = `
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Total Gap:</strong> ${data.gapDetails.gap} submissions (threshold: ${data.gapDetails.threshold})</p>
          <p style="margin: 5px 0;"><strong>ODK Central:</strong> ${data.gapDetails.odkCount} submissions</p>
          <p style="margin: 5px 0;"><strong>App Database:</strong> ${data.gapDetails.appDbCount} submissions</p>
        </div>

        ${formRows ? `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f5f5f5;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Form</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">ODK</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">App DB</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Gap</th>
            </tr>
          </thead>
          <tbody>
            ${formRows}
          </tbody>
        </table>
        ` : ''}
      `;
    } else if (data.alertType === 'unreachable' && data.unreachableDetails) {
      detailsSection = `
        <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; border-left: 4px solid #dc3545; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Consecutive Failures:</strong> ${data.unreachableDetails.consecutiveFailures}</p>
          <p style="margin: 5px 0;"><strong>Last Successful Check:</strong> ${data.unreachableDetails.lastSuccessful || 'Never'}</p>
          <p style="margin: 5px 0;"><strong>Last Error:</strong> ${data.unreachableDetails.lastError}</p>
        </div>
      `;
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ODK Sync Alert - OSLSR</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${this.BRAND_COLOR}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour & Skills Registry</p>
  </div>

  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <h2 style="color: ${this.BRAND_COLOR}; margin-top: 0;">⚠️ ${alertTitle}</h2>

    <p>An issue has been detected with the ODK Central synchronization:</p>

    ${detailsSection}

    <p><strong>Detected at:</strong> ${new Date(data.checkedAt).toLocaleString()}</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.dashboardUrl}" style="background-color: ${this.BRAND_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Admin Dashboard</a>
    </div>

    ${data.alertType === 'submission_gap' ? `
    <p style="color: #666; font-size: 14px;">
      <strong>Recommended Action:</strong> Review the submission gap in the admin dashboard and use the "Pull Missing Submissions" feature if needed.
    </p>
    ` : `
    <p style="color: #666; font-size: 14px;">
      <strong>Recommended Action:</strong> Check the ODK Central server status and network connectivity. If the issue persists, contact your system administrator.
    </p>
    `}

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="color: #999; font-size: 12px;">
      <strong>Need help?</strong> Contact support at <a href="${this.SUPPORT_URL}" style="color: ${this.BRAND_COLOR};">${this.SUPPORT_URL}</a>
    </p>

    <p style="color: #999; font-size: 12px; text-align: center;">
      This is an automated alert from the Oyo State Labour & Skills Registry.<br>
      &copy; ${new Date().getFullYear()} Government of Oyo State. All rights reserved.
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generates ODK sync alert plain text email
   */
  static getOdkSyncAlertText(data: OdkSyncAlertEmailData): string {
    const alertTitle = data.alertType === 'submission_gap'
      ? 'Submission Sync Gap Detected'
      : 'ODK Central Unreachable';

    let detailsSection = '';

    if (data.alertType === 'submission_gap' && data.gapDetails) {
      const formDetails = data.gapDetails.byForm
        .filter(f => f.gap > 0)
        .map(f => `  - ${f.formId}: ODK ${f.odkCount}, App DB ${f.appDbCount}, Gap ${f.gap}`)
        .join('\n');

      detailsSection = `
Total Gap: ${data.gapDetails.gap} submissions (threshold: ${data.gapDetails.threshold})
ODK Central: ${data.gapDetails.odkCount} submissions
App Database: ${data.gapDetails.appDbCount} submissions

Forms with gaps:
${formDetails || '  None'}
`;
    } else if (data.alertType === 'unreachable' && data.unreachableDetails) {
      detailsSection = `
Consecutive Failures: ${data.unreachableDetails.consecutiveFailures}
Last Successful Check: ${data.unreachableDetails.lastSuccessful || 'Never'}
Last Error: ${data.unreachableDetails.lastError}
`;
    }

    const recommendedAction = data.alertType === 'submission_gap'
      ? 'Review the submission gap in the admin dashboard and use the "Pull Missing Submissions" feature if needed.'
      : 'Check the ODK Central server status and network connectivity. If the issue persists, contact your system administrator.';

    return `
OSLSR Alert: ${alertTitle}

An issue has been detected with the ODK Central synchronization:
${detailsSection}
Detected at: ${new Date(data.checkedAt).toLocaleString()}

View Admin Dashboard: ${data.dashboardUrl}

Recommended Action: ${recommendedAction}

---
This is an automated alert from the Oyo State Labour & Skills Registry.
Government of Oyo State
    `.trim();
  }
}

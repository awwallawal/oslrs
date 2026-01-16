import pino from 'pino';

const logger = pino({ name: 'email-service' });

// Email templates
interface PasswordResetEmailData {
  email: string;
  fullName: string;
  resetUrl: string;
  expiresInHours: number;
}

interface VerificationEmailData {
  email: string;
  fullName: string;
  verificationUrl: string;
  expiresInHours: number;
}

interface DuplicateRegistrationEmailData {
  email: string;
  fullName: string;
  attemptedAt: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Email Service for sending transactional emails
 *
 * NOTE: This is a mock implementation for development.
 * In production, integrate with AWS SES or similar service.
 */
export class EmailService {
  private static readonly FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@oslsr.gov.ng';
  private static readonly FROM_NAME = process.env.EMAIL_FROM_NAME || 'Oyo State Labour & Skills Registry';
  private static readonly APP_URL = process.env.APP_URL || 'http://localhost:5173';

  /**
   * Sends a password reset email
   */
  static async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<EmailResult> {
    const { email, fullName, resetUrl, expiresInHours } = data;

    // In development, just log the email
    if (process.env.NODE_ENV !== 'production') {
      logger.info({
        event: 'email.password_reset.sent',
        to: email,
        resetUrl,
        note: 'Development mode - email not actually sent',
      });

      // Log the reset URL for development testing
      logger.info({
        event: 'email.password_reset.dev_preview',
        to: email,
        fullName,
        resetUrl,
        expiresInHours,
      });

      return {
        success: true,
        messageId: `dev-${Date.now()}`,
      };
    }

    // Production: Use AWS SES
    try {
      // TODO: Implement AWS SES integration
      // const ses = new SESClient({ region: process.env.AWS_REGION });
      // const command = new SendEmailCommand({
      //   Source: `${this.FROM_NAME} <${this.FROM_EMAIL}>`,
      //   Destination: { ToAddresses: [email] },
      //   Message: {
      //     Subject: { Data: 'Password Reset Request - OSLSR' },
      //     Body: {
      //       Html: { Data: this.getPasswordResetHtml(data) },
      //       Text: { Data: this.getPasswordResetText(data) },
      //     },
      //   },
      // });
      // const result = await ses.send(command);

      logger.info({
        event: 'email.password_reset.sent',
        to: email,
      });

      return {
        success: true,
        messageId: `prod-${Date.now()}`,
      };
    } catch (error: any) {
      logger.error({
        event: 'email.password_reset.failed',
        to: email,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
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
  <div style="background-color: #9C1E23; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour & Skills Registry</p>
  </div>

  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>

    <p>Hello ${data.fullName},</p>

    <p>We received a request to reset your password for your OSLSR account. Click the button below to create a new password:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.resetUrl}" style="background-color: #9C1E23; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
    </div>

    <p style="color: #666; font-size: 14px;">This link will expire in ${data.expiresInHours} hour(s). If you didn't request this, you can safely ignore this email.</p>

    <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #9C1E23; font-size: 14px;">${data.resetUrl}</p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; text-align: center;">
      This email was sent by the Oyo State Labour & Skills Registry.<br>
      © ${new Date().getFullYear()} Government of Oyo State. All rights reserved.
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

  /**
   * Sends an email verification email
   */
  static async sendVerificationEmail(data: VerificationEmailData): Promise<EmailResult> {
    const { email, fullName, verificationUrl, expiresInHours } = data;

    // In development, just log the email
    if (process.env.NODE_ENV !== 'production') {
      logger.info({
        event: 'email.verification.sent',
        to: email,
        verificationUrl,
        note: 'Development mode - email not actually sent',
      });

      // Log the verification URL for development testing
      logger.info({
        event: 'email.verification.dev_preview',
        to: email,
        fullName,
        verificationUrl,
        expiresInHours,
      });

      return {
        success: true,
        messageId: `dev-${Date.now()}`,
      };
    }

    // Production: Use AWS SES
    try {
      // TODO: Implement AWS SES integration
      logger.info({
        event: 'email.verification.sent',
        to: email,
      });

      return {
        success: true,
        messageId: `prod-${Date.now()}`,
      };
    } catch (error: any) {
      logger.error({
        event: 'email.verification.failed',
        to: email,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generates an email verification URL
   */
  static generateVerificationUrl(token: string): string {
    return `${this.APP_URL}/verify-email/${token}`;
  }

  /**
   * Gets HTML content for verification email
   */
  private static getVerificationHtml(data: VerificationEmailData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - OSLSR</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #9C1E23; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">OSLSR</h1>
    <p style="color: #f0f0f0; margin: 5px 0 0 0;">Oyo State Labour & Skills Registry</p>
  </div>

  <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">Welcome to OSLSR!</h2>

    <p>Hello ${data.fullName},</p>

    <p>Thank you for registering with the Oyo State Labour & Skills Registry. Please verify your email address to complete your registration.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.verificationUrl}" style="background-color: #9C1E23; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verify Email Address</a>
    </div>

    <p style="color: #666; font-size: 14px;">This link will expire in ${data.expiresInHours} hour(s). If you didn't create an account with OSLSR, you can safely ignore this email.</p>

    <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #9C1E23; font-size: 14px;">${data.verificationUrl}</p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; text-align: center;">
      This email was sent by the Oyo State Labour & Skills Registry.<br>
      © ${new Date().getFullYear()} Government of Oyo State. All rights reserved.
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Gets plain text content for verification email
   */
  private static getVerificationText(data: VerificationEmailData): string {
    return `
Welcome to OSLSR - Verify Your Email

Hello ${data.fullName},

Thank you for registering with the Oyo State Labour & Skills Registry.

Please verify your email address by clicking the link below:
${data.verificationUrl}

This link will expire in ${data.expiresInHours} hour(s).

If you didn't create an account with OSLSR, you can safely ignore this email.

---
Oyo State Labour & Skills Registry
Government of Oyo State
    `.trim();
  }

  /**
   * Sends notification when someone attempts to register with an existing email
   */
  static async sendDuplicateRegistrationAttemptEmail(data: DuplicateRegistrationEmailData): Promise<EmailResult> {
    const { email, fullName, attemptedAt } = data;

    // In development, just log the email
    if (process.env.NODE_ENV !== 'production') {
      logger.info({
        event: 'email.duplicate_registration_attempt.sent',
        to: email,
        note: 'Development mode - email not actually sent',
      });

      // Log duplicate registration attempt for development
      logger.info({
        event: 'email.duplicate_registration.dev_preview',
        to: email,
        fullName,
        attemptedAt,
      });

      return {
        success: true,
        messageId: `dev-${Date.now()}`,
      };
    }

    // Production: Use AWS SES
    try {
      // TODO: Implement AWS SES integration
      logger.info({
        event: 'email.duplicate_registration_attempt.sent',
        to: email,
      });

      return {
        success: true,
        messageId: `prod-${Date.now()}`,
      };
    } catch (error: any) {
      logger.error({
        event: 'email.duplicate_registration_attempt.failed',
        to: email,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }
}

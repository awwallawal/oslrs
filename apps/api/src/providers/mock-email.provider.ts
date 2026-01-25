import pino from 'pino';
import type { EmailProvider, EmailContent, EmailResult } from '@oslsr/types';

const logger = pino({ name: 'mock-email-provider' });

/**
 * Mock email provider for development and testing
 *
 * Logs emails to console instead of sending them.
 * Used when:
 * - NODE_ENV !== 'production'
 * - EMAIL_PROVIDER=mock
 *
 * Useful for development and testing without consuming Resend quota.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';
  private readonly sentEmails: EmailContent[] = [];

  /**
   * "Send" an email by logging it
   * Returns success immediately without actual delivery
   */
  async send(email: EmailContent): Promise<EmailResult> {
    const messageId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Store for testing inspection
    this.sentEmails.push(email);

    // Log structured email data for development visibility
    logger.info({
      event: 'email.mock.sent',
      messageId,
      to: email.to,
      subject: email.subject,
      note: 'Mock provider - email logged but not actually sent',
    });

    // Log a more readable format for development debugging
    if (process.env.NODE_ENV !== 'test') {
      logger.info({
        event: 'email.mock.preview',
        to: email.to,
        subject: email.subject,
        textPreview: email.text.slice(0, 200) + (email.text.length > 200 ? '...' : ''),
      });
    }

    return {
      success: true,
      messageId,
    };
  }

  /**
   * Get all sent emails (for testing)
   */
  getSentEmails(): EmailContent[] {
    return [...this.sentEmails];
  }

  /**
   * Get the last sent email (for testing)
   */
  getLastEmail(): EmailContent | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  /**
   * Clear sent emails (for testing)
   */
  clearSentEmails(): void {
    this.sentEmails.length = 0;
  }

  /**
   * Find sent emails by recipient (for testing)
   */
  findEmailsTo(to: string): EmailContent[] {
    return this.sentEmails.filter((email) => email.to === to);
  }

  /**
   * Check if an email was sent to a specific address (for testing)
   */
  wasSentTo(to: string): boolean {
    return this.sentEmails.some((email) => email.to === to);
  }
}

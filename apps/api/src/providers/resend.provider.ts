import { Resend } from 'resend';
import pino from 'pino';
import type { EmailProvider, EmailContent, EmailResult } from '@oslsr/types';

const logger = pino({ name: 'resend-provider' });

/**
 * Resend email provider implementation
 *
 * Uses the Resend SDK to send transactional emails.
 * Handles API errors gracefully with structured logging.
 *
 * @see https://resend.com/docs
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  private readonly client: Resend;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(config: {
    apiKey: string;
    fromAddress: string;
    fromName: string;
  }) {
    if (!config.apiKey) {
      throw new Error('Resend API key is required');
    }
    if (!config.fromAddress) {
      throw new Error('From email address is required');
    }

    this.client = new Resend(config.apiKey);
    this.fromAddress = config.fromAddress;
    this.fromName = config.fromName || 'OSLSR';
  }

  /**
   * Send an email using Resend API
   */
  async send(email: EmailContent): Promise<EmailResult> {
    const from = `${this.fromName} <${this.fromAddress}>`;

    try {
      const response = await this.client.emails.send({
        from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      if (response.error) {
        logger.error({
          event: 'email.resend.api_error',
          to: email.to,
          subject: email.subject,
          error: response.error.message,
          errorName: response.error.name,
        });

        return {
          success: false,
          error: response.error.message,
        };
      }

      logger.info({
        event: 'email.resend.sent',
        to: email.to,
        subject: email.subject,
        messageId: response.data?.id,
      });

      return {
        success: true,
        messageId: response.data?.id,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : 'UnknownError';

      logger.error({
        event: 'email.resend.exception',
        to: email.to,
        subject: email.subject,
        error: errorMessage,
        errorName,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

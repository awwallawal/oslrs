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
  // Story 13-9 (AC5/L1) — Resend tag values are restricted to ASCII
  // letters/digits/underscore/hyphen. A non-compliant value makes Resend reject
  // the ENTIRE send (HTTP 422), which would silently break a whole blast — so we
  // validate here rather than trust callers.
  private static readonly TAG_VALUE_RE = /^[A-Za-z0-9_-]+$/;
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

    // Story 13-9 (AC5) — tag the send with the campaign id so Resend echoes it
    // back on every inbound webhook event (delivered/clicked/bounced/...), letting
    // `parseResendEvent` lift it onto `email_events.campaign_id` for the per-campaign
    // funnel. Omitted entirely when untagged. (AC5/L1) A campaignId that violates
    // Resend's tag-value charset is dropped + warned rather than sent — a mis-set
    // campaign id must NOT take down the blast; the email still goes out, untagged.
    let tags: { tags: { name: string; value: string }[] } | undefined;
    if (email.campaignId) {
      if (ResendEmailProvider.TAG_VALUE_RE.test(email.campaignId)) {
        tags = { tags: [{ name: 'campaign_id', value: email.campaignId }] };
      } else {
        logger.warn({
          event: 'email.resend.campaign_tag_skipped',
          to: email.to,
          campaignId: email.campaignId,
          reason: 'campaignId is not a valid Resend tag value ([A-Za-z0-9_-]) — sending untagged',
        });
      }
    }

    try {
      const response = await this.client.emails.send({
        from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        // Story 13-13 (AC3/AC4) — forward caller-supplied headers verbatim (List-Unsubscribe on
        // marketing sends). The email service decides which categories get them; the provider just
        // transports. Omitted entirely when absent.
        ...(email.headers ? { headers: email.headers } : {}),
        ...(tags ?? {}),
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

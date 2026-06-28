import type { Request, Response } from 'express';
import { Webhook } from 'svix';
import pino from 'pino';
import { parseResendEvent, recordEmailEvent } from '../services/email-events.service.js';

const logger = pino({ name: 'resend-webhook' });

function header(req: Request, key: string): string {
  const v = req.headers[key];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

/**
 * Story 13-9 (AC3) — POST /api/v1/webhooks/resend.
 *
 * Resend signs webhooks with Svix (`svix-id`/`svix-timestamp`/`svix-signature`). We verify against
 * RESEND_WEBHOOK_SECRET over the RAW body (express.raw is mounted for this path BEFORE the global
 * express.json — see app.ts). Bad/missing signature → 401, nothing written. Valid → store the event
 * (and suppress on bounce/complaint). Ignored types (incl. email.opened — AC4) still return 200 so
 * Resend doesn't retry.
 */
export async function handleResendWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    logger.error({ event: 'resend_webhook.no_secret' });
    res.status(503).json({ error: 'webhook not configured' });
    return;
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : typeof req.body === 'string'
      ? req.body
      : '';

  const svixId = header(req, 'svix-id');
  let payload: unknown;
  try {
    payload = new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': header(req, 'svix-timestamp'),
      'svix-signature': header(req, 'svix-signature'),
    });
  } catch {
    logger.warn({ event: 'resend_webhook.bad_signature' });
    res.status(401).json({ error: 'invalid signature' });
    return;
  }

  try {
    const ev = parseResendEvent(payload, new Date());
    if (ev) {
      await recordEmailEvent(ev, svixId || undefined); // svix-id → idempotency (code-review M1)
      logger.info({ event: 'resend_webhook.recorded', type: ev.eventType, campaignId: ev.campaignId ?? null });
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ event: 'resend_webhook.record_failed', err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'processing failed' });
  }
}

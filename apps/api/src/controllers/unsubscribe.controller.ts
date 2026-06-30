import type { Request, Response } from 'express';
import pino from 'pino';
import { verifyUnsubscribeToken } from '../services/unsubscribe-token.js';
import { suppressUnsubscribe } from '../services/email-events.service.js';

const logger = pino({ name: 'unsubscribe' });

/**
 * Story 13-13 (AC5) — PUBLIC one-click unsubscribe.
 *
 * Mounted for BOTH `POST /api/v1/unsubscribe` (RFC 8058 One-Click — mail clients POST in the
 * background; the token rides in the query string so no body parsing is needed) and
 * `GET /api/v1/unsubscribe` (a human clicking the link). The token is a stateless ENCRYPTED token
 * over the recipient address (AC6): a valid token suppresses exactly the encoded address, an
 * invalid/forged/missing one is a 4xx that writes nothing. Idempotent — repeat / already-suppressed
 * → still success.
 *
 * SAFE-BY-DESIGN (code-review AI-1): ONLY `POST` mutates. A bare `GET` renders a confirmation page
 * whose button POSTs back — so a link prefetcher / email-security scanner that GETs the
 * List-Unsubscribe URL can no longer silently suppress a recipient who never clicked. RFC 8058
 * one-click is unaffected (clients POST directly).
 *
 * This is the INLET only; enforcement already exists (13-9 `getSuppressedEmails` gates every
 * marketing send). We never touch the send-skip logic here.
 */
function getToken(req: Request): string | undefined {
  const t = req.query.token;
  if (typeof t === 'string') return t;
  if (Array.isArray(t) && typeof t[0] === 'string') return t[0];
  return undefined;
}

/**
 * Does this request want an HTML response? A browser GET always does; a POST does only when it came
 * from our own confirmation form (hidden `source=web`). A mail-client RFC 8058 one-click POST has no
 * such field → it gets a terse JSON body.
 */
function wantsHtml(req: Request): boolean {
  if (req.method === 'GET') return true;
  const body = req.body as { source?: unknown } | undefined;
  return body?.source === 'web';
}

const PAGE = (bodyHtml: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>Unsubscribe — Oyo State Skills Registry</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 540px; margin: 48px auto; padding: 0 20px; text-align: center;">
  <div style="background-color: #9C1E23; padding: 18px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #fff; margin: 0; font-size: 20px;">Oyo State Skills Registry</h1>
  </div>
  <div style="padding: 28px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
    ${bodyHtml}
  </div>
</body>
</html>`;

const MESSAGE_HTML = (heading: string, body: string) =>
  PAGE(`<h2 style="margin-top: 0; color: #333;">${heading}</h2><p style="color: #555;">${body}</p>`);

/**
 * The confirmation page rendered on GET. The button POSTs the SAME token back (with `source=web`) so
 * the actual suppression only happens on the explicit human click — never on a passive GET.
 */
const CONFIRM_PROMPT_HTML = (token: string) =>
  PAGE(
    `<h2 style="margin-top: 0; color: #333;">Unsubscribe from marketing emails?</h2>
     <p style="color: #555;">Click below to stop receiving marketing and referral emails from the Oyo State Skills Registry. Important account and registration emails are unaffected.</p>
     <form method="POST" action="/api/v1/unsubscribe?token=${encodeURIComponent(token)}" style="margin-top: 20px;">
       <input type="hidden" name="source" value="web" />
       <button type="submit" style="background-color: #9C1E23; color: #fff; border: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; font-weight: 600; cursor: pointer;">Confirm unsubscribe</button>
     </form>`,
  );

export async function handleUnsubscribe(req: Request, res: Response): Promise<void> {
  const token = getToken(req);
  const verified = verifyUnsubscribeToken(token);
  const html = wantsHtml(req);

  if (!verified) {
    logger.warn({ event: 'unsubscribe.invalid_token', method: req.method });
    if (html) {
      res
        .status(400)
        .type('html')
        .send(
          MESSAGE_HTML(
            'Invalid unsubscribe link',
            'This unsubscribe link is invalid or has been tampered with. If you keep receiving emails you don’t want, contact support@oyoskills.com.',
          ),
        );
    } else {
      res.status(400).json({ status: 'error', code: 'INVALID_TOKEN', message: 'Invalid or missing unsubscribe token' });
    }
    return;
  }

  // AI-1: a GET never mutates — it only asks the human to confirm. The form's POST does the work.
  if (req.method === 'GET') {
    res.status(200).type('html').send(CONFIRM_PROMPT_HTML(token!));
    return;
  }

  try {
    await suppressUnsubscribe(verified.email);
  } catch (err) {
    logger.error({ event: 'unsubscribe.suppress_failed', err: err instanceof Error ? err.message : String(err) });
    if (html) {
      res.status(500).type('html').send(MESSAGE_HTML('Something went wrong', 'Please try again shortly, or contact support@oyoskills.com.'));
    } else {
      res.status(500).json({ status: 'error', code: 'UNSUBSCRIBE_FAILED', message: 'Could not process unsubscribe' });
    }
    return;
  }

  logger.info({ event: 'unsubscribe.suppressed' });
  if (html) {
    res
      .status(200)
      .type('html')
      .send(
        MESSAGE_HTML(
          'You’ve been unsubscribed',
          'You will no longer receive marketing or referral emails from the Oyo State Skills Registry. Important account and registration emails are unaffected.',
        ),
      );
  } else {
    res.status(200).json({ status: 'ok', message: 'You have been unsubscribed.' });
  }
}

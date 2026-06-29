/**
 * Story 13-11/13-12 — shared thank-you + referral email builder.
 *
 * Single source of truth for the thank-you/referral copy + the campaign-tagged referral link, used
 * by BOTH the one-off operator blast (`scripts/_thankyou-referral-blast.ts`, campaign
 * `thankyou-referral-2026-07`) AND the evergreen auto-send on completion
 * (`submission-processing.service.ts`, campaign `thankyou-referral-auto`). Extracting it keeps the
 * two in lockstep — no copy drift between the backfill blast and the go-forward automation.
 *
 * NDPA: a thank-you to our own registrant + an invitation to SHARE A PUBLIC LINK (never a request
 * for a third party's personal data). Opt-out routes to the MONITORED support@ address (13-11 review
 * M1) — the sender is an unmonitored noreply@.
 */

const BRAND = '#9C1E23';
const SUPPORT_EMAIL = 'support@oyoskills.com';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function firstNameFrom(firstName: string | undefined | null): string {
  if (!firstName) return 'there';
  const trimmed = firstName.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

/**
 * The SHAREABLE public referral link, campaign-tagged so referred signups attribute (13-9/13-1).
 * `campaignId` distinguishes the channel: the blast passes `thankyou-referral-2026-07`, the auto-send
 * passes `thankyou-referral-auto`.
 */
export function buildThankYouReferralUrl(campaignId: string): string {
  const base = process.env.PUBLIC_APP_URL || 'http://localhost:5173';
  const u = new URL('/register', base);
  u.searchParams.set('utm_campaign', campaignId);
  u.searchParams.set('utm_source', 'referral');
  return u.toString();
}

export function buildThankYouEmail(firstName: string, referralUrl: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'Thank you for registering — help a friend join the Oyo State Skills Registry';
  const text = `Hi ${firstName},

Thank you for completing your profile on the Oyo State Skills Registry. Your registration helps
Oyo State match residents with the right training programs and job opportunities.

You can help expand the reach: if you know someone who would benefit, please share this registration
link with them:

  ${referralUrl}

It only takes a few minutes to register, and every profile helps build a stronger picture of Oyo
State's talent.

Thank you for being part of it.

The Oyo State Skills Registry team
${SUPPORT_EMAIL}

---
You are receiving this because you registered on the Oyo State Skills Registry. If you'd prefer not
to receive these messages, email ${SUPPORT_EMAIL} and we'll remove you. (Please do not reply to this
address — it is not monitored.)`;

  const safeFirstName = escapeHtml(firstName);
  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:${BRAND};margin:0 0 16px;">Thank you for registering</h2>
  <p>Hi <strong>${safeFirstName}</strong>,</p>
  <p>Thank you for completing your profile on the <strong>Oyo State Skills Registry</strong>. Your registration helps Oyo State match residents with the right training programs and job opportunities.</p>
  <p>You can help expand the reach — if you know someone who would benefit, please share this registration link with them:</p>
  <p style="margin:24px 0;text-align:center;">
    <a href="${referralUrl}" style="display:inline-block;background:${BRAND};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Share the registration link</a>
  </p>
  <p style="color:#555;font-size:13px;word-break:break-all;">Or copy this link: <a href="${referralUrl}" style="color:${BRAND};">${referralUrl}</a></p>
  <p>It only takes a few minutes to register, and every profile helps build a stronger picture of Oyo State's talent.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
  <p style="color:#777;font-size:12px;">The Oyo State Skills Registry team<br/><a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND};">${SUPPORT_EMAIL}</a></p>
  <p style="color:#999;font-size:11px;">You are receiving this because you registered on the Oyo State Skills Registry. If you'd prefer not to receive these messages, email <a href="mailto:${SUPPORT_EMAIL}" style="color:#999;">${SUPPORT_EMAIL}</a> and we'll remove you. (This address is not monitored for replies.)</p>
</body></html>`;

  return { subject, text, html };
}

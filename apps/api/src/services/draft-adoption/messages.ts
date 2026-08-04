/**
 * Story 13-49 AC6 + AC9 — the programme's two pieces of copy.
 *
 * The split is the story's central idea: an ADOPTED person is TOLD something ("here is your
 * OSLRS number, we already had your details"), a D4 person is ASKED something ("two minutes
 * to finish"). Sending the wrong one to the wrong cohort is exactly the incompetence the
 * whole programme exists to avoid — and for 67 of the 74 D4 rows there is no name and
 * therefore no record and no number that could be sent.
 *
 * Copy is inline here, matching the project's existing email pattern (flat strings, no
 * template directory — see `thankyou-email.ts` / `EmailService`).
 */
import { escapeHtml, firstNameFrom } from '../thankyou-email.js';

const BRAND = '#9C1E23';
const SUPPORT_EMAIL = 'support@oyoskills.com';

/** Campaign ids — distinct per cohort so `campaign_sends` and `email_events` separate them. */
export const ADOPTION_CAMPAIGN_ID = 'draft-adoption-2026-08';
export const INVITE_CAMPAIGN_ID = 'draft-invite-2026-08';

/**
 * The self-service registration check — the amend affordance for adopted people.
 *
 * ⚠️ WHY NOT A DIRECT EDIT LINK (decided 2026-08-01 with Awwal): AC9's original wording asked
 * for a "magic link to amend their registration", but the 9-61 edit surface
 * (`me.routes.ts:32-34`) is `authenticate`-gated and these people have NO user account — a
 * draft is by construction pre-account, and `AuthService` magic-login 401s on a missing
 * `users` row (`auth.service.ts:664-674`). A `wizard_resume` link is worse still: it reopens
 * the draft we just adopted, and submitting it would collide on NIN_DUPLICATE.
 * `/check-registration` already exists, already issues its own secure link to the address on
 * file, and is what the 9-58 confirmation points at. One extra click, zero broken links, and
 * no new public authentication surface. A true in-place amend link is follow-up work.
 */
export const buildCheckRegistrationUrl = (): string =>
  `${process.env.SUPPORT_URL || 'https://oyoskills.com'}/check-registration`;

const shell = (bodyHtml: string): string => `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;background:#ffffff;color:#222;">
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0;">
    <p style="font-size:12px;color:#777;">
      Oyo State Skilled Labour Register. Questions? Write to
      <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND};">${SUPPORT_EMAIL}</a>.
      This address is not monitored for replies.
    </p>
  </div>
</body></html>`;

const button = (href: string, label: string): string =>
  `<p style="margin:24px 0;">
     <a href="${href}" style="background:${BRAND};color:#ffffff;text-decoration:none;
        padding:12px 22px;border-radius:4px;display:inline-block;font-weight:bold;">${label}</a>
   </p>`;

export interface AdoptionConfirmationArgs {
  firstName: string;
  referenceCode: string;
  /**
   * D3: the record was created as `pending_nin_capture`, NOT `active`.
   *
   * ⚠️ THIS FLAG EXISTS BECAUSE THE ONE-SIZE COPY CAUSED REAL DUPLICATE RECORDS.
   * Until 2026-08-04 D1 and D3 received identical text, which told every recipient
   * "Your record is active" and offered "Review or update my details — check that nothing is
   * wrong, or add what is missing". For a D3 person the first claim is FALSE (their record is
   * pending their NIN) and the second is an invitation to go and supply it. Doing so starts a
   * fresh registration, and because dedupe fires on the INCOMING submission's NIN
   * (`submission-processing.service.ts:454`) a no-NIN self-registration matches nothing — so
   * they end up with a second record and a second number.
   *
   * Measured: 5 of 21 D3 adoptees (24%) self-registered within 90 minutes of this email,
   * against 1 of 138 for D1 (0.7%). Six people had to be written to and five records deleted.
   */
  pendingNin?: boolean;
}

/**
 * AC9 — the adopted person's confirmation. Confirmation, not invitation: it leads with the
 * number, states plainly that we already held their details, and makes the ask VERIFICATION
 * rather than work. The thank-you/referral arrives separately from the existing 13-12
 * evergreen auto-send, so this message stays one idea long.
 */
export function buildAdoptionConfirmationEmail({
  firstName,
  referenceCode,
  pendingNin = false,
}: AdoptionConfirmationArgs): {
  subject: string;
  text: string;
  html: string;
} {
  const name = firstNameFrom(firstName);
  const checkUrl = buildCheckRegistrationUrl();

  const subject = `Your Oyo State Skilled Labour Register number is ${referenceCode}`;

  const text = pendingNin
    ? `Hi ${name},

Your Oyo State Skilled Labour Register number is ${referenceCode}.

We had your registration details on file and have created your entry, so you do NOT need to
register again.

To finish your record we still need your National Identification Number (NIN). We will send
you a separate message with a secure link to add it — there is nothing you need to do now.

If you believe this record is not yours, write to ${SUPPORT_EMAIL} and we will remove it.
`
    : `Hi ${name},

Your Oyo State Skilled Labour Register number is ${referenceCode}.

We had your registration details on file and have completed your entry, so there is nothing
you need to do. Your record is active.

Review or update your details — check that nothing is wrong, or add what is missing:
${checkUrl}

You will be asked to confirm your email address, and we will send you a secure link.

If you believe this record is not yours, write to ${SUPPORT_EMAIL} and we will remove it.
`;

  const html = shell(`
    <p style="font-size:16px;">Hi ${escapeHtml(name)},</p>
    <p style="font-size:16px;">Your Oyo State Skilled Labour Register number is</p>
    <p style="font-size:24px;font-weight:bold;color:${BRAND};letter-spacing:1px;margin:8px 0 20px;">
      ${escapeHtml(referenceCode)}
    </p>
    ${
      pendingNin
        ? `<p style="font-size:15px;">
      We had your registration details on file and have created your entry, so you do
      <strong>not</strong> need to register again.
    </p>
    <p style="font-size:15px;">
      To finish your record we still need your National Identification Number (NIN). We will
      send you a separate message with a secure link to add it &mdash; there is nothing you
      need to do now.
    </p>`
        : `<p style="font-size:15px;">
      We had your registration details on file and have completed your entry, so there is
      nothing you need to do. Your record is active.
    </p>
    ${button(checkUrl, 'Review or update my details')}
    <p style="font-size:14px;color:#555;">
      Check that nothing is wrong, or add what is missing. You will be asked to confirm your
      email address, and we will send you a secure link.
    </p>`
    }
    <p style="font-size:13px;color:#777;">
      If you believe this record is not yours, write to
      <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND};">${SUPPORT_EMAIL}</a> and we
      will remove it.
    </p>
  `);

  return { subject, text, html };
}

export interface InvitationArgs {
  firstName: string;
  resumeUrl: string;
  /**
   * How long the `wizard_resume` link actually lives. Defaults to the real TTL
   * (`magic-link.service.ts:28` — 72h), NOT to the draft expiry.
   */
  linkValidHours?: number;
}

/** `magic_link_tokens.purpose = 'wizard_resume'` TTL. Kept beside the copy that states it. */
export const RESUME_LINK_VALID_HOURS = 72;

/**
 * AC6 — the D4 invitation. Copy is verbatim from the story Dev Notes, and its framing is a
 * DECIDED consequence of residual R2, not a style choice.
 *
 * R2 established by reading the code that identity does NOT prefill on resume:
 * `useWizardDraft.ts:114` hydrates through `migrateLegacyName(draft.formData ?? {})`, which
 * maps only the legacy `fullName`, and nothing anywhere reads
 * `questionnaireResponses.firstname`. The 208 drafts whose name lives in the questionnaire
 * therefore come back with EMPTY Basics/Contact steps. So the copy promises "finish in two
 * minutes" and names what to have ready — it must never say "pick up where you left off",
 * which the user would discover to be false one screen in.
 *
 * No OSLRS number appears here, ever: a D4 row has no registry record to number.
 *
 * ⚠️ THE LINK WINDOW IS STATED, ADDED BY CODE REVIEW 2026-08-02. The copy said "your place is
 * still held" and "removed when the registration expires" — and expiry is 2026-11-30 (AC1) —
 * while the `wizard_resume` token it carries lives **72 hours**. Anyone opening on day four met
 * a dead link with no explanation and no way back. Both facts are now in the message: the link
 * is short, the registration is not, and there is a stated route to a fresh one.
 */
export function buildInvitationEmail({
  firstName,
  resumeUrl,
  linkValidHours = RESUME_LINK_VALID_HOURS,
}: InvitationArgs): {
  subject: string;
  text: string;
  html: string;
} {
  const name = firstNameFrom(firstName);
  const days = Math.round(linkValidHours / 24);
  const window = days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : `${linkValidHours} hours`;

  const subject = 'Your Oyo Skills registration is still open — 2 minutes to finish';

  const text = `Hi ${name},

You started registering on the Oyo State Skilled Labour Register and we have your contact
details saved. The registration was never completed, so your record is not yet active.

This may have been a network interruption or simply a busy moment — either way, your place is
still held.

Continue my registration:
${resumeUrl}

It takes about two minutes. You'll need your NIN, your LGA, and your trade or occupation.
Once complete you'll receive your OSLRS number and be listed for skills programmes and
opportunities.

For your security this link works for ${window}. Your registration itself stays open for
longer — if the link has expired, write to ${SUPPORT_EMAIL} and we will send you a new one.

If you'd prefer not to continue, no action is needed and your details will be removed when
the registration expires.
`;

  const html = shell(`
    <p style="font-size:16px;">Hi ${escapeHtml(name)},</p>
    <p style="font-size:15px;">
      You started registering on the Oyo State Skilled Labour Register and we have your
      contact details saved. The registration was never completed, so your record is not yet
      active.
    </p>
    <p style="font-size:15px;">
      This may have been a network interruption or simply a busy moment — either way, your
      place is still held.
    </p>
    ${button(resumeUrl, 'Continue my registration')}
    <p style="font-size:14px;color:#555;">
      It takes about two minutes. You'll need your <strong>NIN</strong>, your <strong>LGA</strong>,
      and your <strong>trade or occupation</strong>. Once complete you'll receive your OSLRS
      number and be listed for skills programmes and opportunities.
    </p>
    <p style="font-size:14px;color:#555;">
      For your security this link works for <strong>${escapeHtml(window)}</strong>. Your
      registration itself stays open for longer — if the link has expired, write to
      <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND};">${SUPPORT_EMAIL}</a> and we will
      send you a new one.
    </p>
    <p style="font-size:13px;color:#777;">
      If you'd prefer not to continue, no action is needed and your details will be removed
      when the registration expires.
    </p>
  `);

  return { subject, text, html };
}

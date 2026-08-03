import { describe, it, expect } from 'vitest';
import {
  buildAdoptionConfirmationEmail,
  buildInvitationEmail,
  buildCheckRegistrationUrl,
  ADOPTION_CAMPAIGN_ID,
  INVITE_CAMPAIGN_ID,
  RESUME_LINK_VALID_HOURS,
} from '../draft-adoption/messages.js';

/**
 * Story 13-49 AC6 + AC9 — the two pieces of copy this programme writes.
 *
 * The distinction they encode is the whole point of the story: an ADOPTED person is told
 * something ("here is your number"), a D4 person is asked something ("two minutes to
 * finish"). Sending the wrong one is the incompetence the story exists to avoid — and 67
 * of the 74 D4 rows have no name, so there is literally no number to send them.
 */

describe('13-49 messages — adoption confirmation (AC9)', () => {
  const built = () =>
    buildAdoptionConfirmationEmail({
      firstName: 'Adebayo',
      referenceCode: 'OSLRS-2026-ABC123',
    });

  it('leads with the OSLRS number — the confirmation is the message, not a preamble', () => {
    const { subject, text } = built();
    expect(subject).toMatch(/OSLRS-2026-ABC123/);
    expect(text.indexOf('OSLRS-2026-ABC123')).toBeLessThan(text.indexOf('Review'));
  });

  it('says we already held their details — never asks them to register', () => {
    const { text } = built();
    expect(text).toMatch(/on file/i);
    // The failure mode this guards: asking 142 people to register when we hold their data.
    expect(text).not.toMatch(/please register|start your registration|sign up/i);
  });

  it('points at the self-service check-registration route, which issues its own secure link', () => {
    const { text, html } = built();
    const url = buildCheckRegistrationUrl();
    expect(text).toContain(url);
    expect(html).toContain(url);
    expect(url).toMatch(/\/check-registration$/);
  });

  it('greets by first name and falls back to a neutral greeting', () => {
    expect(built().text).toMatch(/Adebayo/);
    expect(
      buildAdoptionConfirmationEmail({ firstName: '', referenceCode: 'X' }).text,
    ).toMatch(/there/i);
  });

  it('escapes HTML in the name — an apostrophe in a surname is not markup', () => {
    const { html } = buildAdoptionConfirmationEmail({
      firstName: '<script>alert(1)</script>',
      referenceCode: 'OSLRS-2026-ABC123',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('carries a stable campaign id so the sends attribute in the ledger', () => {
    expect(ADOPTION_CAMPAIGN_ID).toBe('draft-adoption-2026-08');
  });
});

describe('13-49 messages — D4 invitation (AC6)', () => {
  const built = () =>
    buildInvitationEmail({ firstName: 'Ngozi', resumeUrl: 'https://oyoskills.com/auth/magic?token=x' });

  it('uses the agreed subject line', () => {
    expect(built().subject).toBe('Your Oyo Skills registration is still open — 2 minutes to finish');
  });

  /**
   * R2's decided consequence. Identity does NOT prefill on resume: `useWizardDraft.ts:114`
   * hydrates via `migrateLegacyName(draft.formData)`, which maps only the legacy `fullName`,
   * and nothing reads `questionnaireResponses.firstname`. So the 208 old drafts come back with
   * EMPTY Basics/Contact steps, and copy promising "pick up where you left off" would be a lie
   * the user discovers one screen later.
   */
  it('says FINISH and states what to have ready — never "pick up where you left off"', () => {
    const { text } = built();
    expect(text).toMatch(/two minutes|2 minutes/i);
    expect(text).toMatch(/NIN/);
    expect(text).toMatch(/LGA/);
    expect(text).toMatch(/trade or occupation/i);
    expect(text).not.toMatch(/where you left off|pick up where/i);
  });

  it('NEVER contains an OSLRS number — no record exists to number', () => {
    const { text, html } = built();
    expect(text).not.toMatch(/OSLRS-\d{4}-/);
    expect(html).not.toMatch(/OSLRS-\d{4}-/);
  });

  it('is neutral on fault and offers a no-action opt-out', () => {
    const { text } = built();
    expect(text).toMatch(/network interruption|busy moment/i);
    expect(text).toMatch(/no action is needed/i);
  });

  it('embeds the resume link in both parts', () => {
    const { text, html } = built();
    expect(text).toContain('https://oyoskills.com/auth/magic?token=x');
    expect(html).toContain('https://oyoskills.com/auth/magic?token=x');
  });

  it('carries its own campaign id, distinct from the adoption sends', () => {
    expect(INVITE_CAMPAIGN_ID).toBe('draft-invite-2026-08');
    expect(INVITE_CAMPAIGN_ID).not.toBe(ADOPTION_CAMPAIGN_ID);
  });

  /**
   * ⚠️ ADDED BY CODE REVIEW 2026-08-02 — the link window.
   *
   * The copy said "your place is still held" and "removed when the registration expires"
   * (2026-11-30 per AC1), while the `wizard_resume` token it carries lives 72 HOURS
   * (`magic-link.service.ts:28`). Anyone opening on day four met a dead link with no
   * explanation and no route back. Both facts belong in the message: the link is short, the
   * registration is not.
   */
  it('states how long the link actually works, in both parts', () => {
    const { text, html } = built();
    expect(text).toMatch(/this link works for 3 days/i);
    expect(html).toMatch(/3 days/i);
  });

  it('gives a route to a fresh link instead of leaving an expired one as a dead end', () => {
    const { text, html } = built();
    expect(text).toMatch(/send you a new one/i);
    expect(html).toMatch(/send you a new one/i);
  });

  it('does NOT conflate the link window with the registration window', () => {
    // The distinction is the whole point — "your registration itself stays open for longer".
    expect(built().text).toMatch(/registration itself stays open for\s+longer/i);
  });

  it('renders the window from the TTL it is given, not a hardcoded string', () => {
    const { text } = buildInvitationEmail({
      firstName: 'Bola',
      resumeUrl: 'https://oyoskills.com/auth/magic?token=x',
      linkValidHours: 24,
    });
    expect(text).toMatch(/works for 1 day\b/i);
  });

  it('defaults to the real wizard_resume TTL', () => {
    expect(RESUME_LINK_VALID_HOURS).toBe(72);
  });
});

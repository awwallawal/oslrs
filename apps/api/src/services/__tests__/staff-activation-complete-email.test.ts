/**
 * Story 13-59 (AC1, AC2, AC4) — the activation COMPLETION email.
 *
 * Until this story, activation ended with a bare `logger.info` and a redirect.
 * The person walked away with nothing. These tests pin the three properties
 * that make the email worth sending at all:
 *
 *   AC1 — role-specific copy, from ONE keyed source, that FAILS LOUDLY rather
 *         than sending a blank body for a role nobody wrote copy for.
 *   AC2 — it leaves through the counted chokepoint, like every other send.
 *   AC4 — it carries NO ATTACHMENTS. Standing ruling (2026-08-10): the sending
 *         domain is shared with the blast programme, and seven months of
 *         reputation is not spent on a delivery convenience.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { recordEmailSend } = vi.hoisted(() => ({
  recordEmailSend: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../notification-meter.service.js', () => ({
  NotificationMeter: { recordEmailSend },
}));
vi.mock('../campaign-contact.service.js', () => ({
  recordCampaignSend: vi.fn().mockResolvedValue(undefined),
}));

import { EmailService } from '../email.service.js';
import { getMockEmailProvider, resetMockEmailProvider } from '../../providers/index.js';
import { getStaffActivationCopy, ACTIVATION_COPY_ROLES } from '../staff-activation-copy.js';
import { UserRole, formatStaffId } from '@oslsr/types';

const baseData = {
  email: 'field.officer@example.com',
  fullName: 'Adewale Johnson',
  roleName: UserRole.ENUMERATOR as string,
  lgaName: 'Ibadan North',
  staffId: 'OSLSR-018E5F2A',
  loginUrl: 'https://oyoskills.com/staff/login',
};

describe('Story 13-59 AC1 — role copy lives in ONE place and fails loudly', () => {
  it('covers every role that can actually reach activation', () => {
    // The five in AC1's table PLUS supervisor, which the table omits but which
    // is a FIELD_ROLE and therefore activates through exactly this path. A role
    // that can activate and has no copy would throw on a real person.
    expect(ACTIVATION_COPY_ROLES).toEqual(
      expect.arrayContaining([
        UserRole.ENUMERATOR,
        UserRole.SUPERVISOR,
        UserRole.DATA_ENTRY_CLERK,
        UserRole.VERIFICATION_ASSESSOR,
        UserRole.GOVERNMENT_OFFICIAL,
        UserRole.SUPER_ADMIN,
      ]),
    );
  });

  it('gives the enumerator the sentence that matters, naming their LGA', () => {
    const copy = getStaffActivationCopy(UserRole.ENUMERATOR, { lgaName: 'Ibadan North' });
    expect(copy.headline).toContain('cleared for field registration');
    expect(copy.headline).toContain('Ibadan North');
  });

  it('carries the read-out rule and the download instruction for enumerators (AC1, AC4.1)', () => {
    const copy = getStaffActivationCopy(UserRole.ENUMERATOR, { lgaName: 'Ibadan North' });
    const body = copy.details.join(' ').toLowerCase();
    // 13-4 R8: telling someone a number that does not exist is worse than
    // telling them nothing.
    expect(body).toContain('do not read out');
    // AC4.2 — the attachment was buying OFFLINE ACCESS; this instruction is the
    // only thing that buys it back, so it is not optional prose.
    expect(body).toContain('before you go');
    expect(body).toContain('id card');
    expect(body).toContain('field briefing');
  });

  it('gives each remaining role its own distinct sentence', () => {
    expect(getStaffActivationCopy(UserRole.DATA_ENTRY_CLERK, {}).headline)
      .toContain('enter registrations from the office');
    expect(getStaffActivationCopy(UserRole.VERIFICATION_ASSESSOR, {}).headline)
      .toContain('review and score submissions');
    expect(getStaffActivationCopy(UserRole.GOVERNMENT_OFFICIAL, {}).headline)
      .toContain('read access to registry reports');
    expect(getStaffActivationCopy(UserRole.SUPER_ADMIN, {}).headline)
      .toContain('full administrative access');
  });

  it('the super admin gets a security line — that one earns it (AC1)', () => {
    const copy = getStaffActivationCopy(UserRole.SUPER_ADMIN, {});
    expect(copy.details.join(' ').toLowerCase()).toMatch(/security|never share|two-factor/);
  });

  /**
   * AC1.2 — "A new role added without copy must fail loudly, not send a blank
   * body." This is the test that would fail if someone added a role and the
   * copy map silently returned undefined.
   */
  it('THROWS for a role with no copy rather than rendering a blank body', () => {
    expect(() => getStaffActivationCopy('regional_coordinator', {})).toThrow(
      /no activation copy/i,
    );
    // public_user never activates through this path; it must be treated the
    // same as an unknown role, not given a silent fallback.
    expect(() => getStaffActivationCopy(UserRole.PUBLIC_USER, {})).toThrow();
  });

  it('an enumerator with no LGA still gets a sentence, never "undefined"', () => {
    const copy = getStaffActivationCopy(UserRole.ENUMERATOR, { lgaName: null });
    expect(copy.headline).not.toContain('undefined');
    expect(copy.headline).not.toContain('null');
  });
});

describe('Story 13-59 AC1 — the rendered email', () => {
  it('points at /staff/login and NEVER the citizen door', () => {
    const html = EmailService.getStaffActivationCompleteHtml(baseData);
    const text = EmailService.getStaffActivationCompleteText(baseData);

    expect(html).toContain('/staff/login');
    expect(text).toContain('/staff/login');
    // The 2026-08-09 redirect bug sent staff to /login, which hard-rejects
    // them. A bare `/login` anywhere in this copy reintroduces it.
    expect(html).not.toMatch(/["'\s>]\/login\b/);
    expect(text).not.toMatch(/[\s]\/login\b/);
  });

  it('never says "onboarded" — nobody in Nigerian government English says it', () => {
    expect(EmailService.getStaffActivationCompleteHtml(baseData).toLowerCase())
      .not.toContain('onboard');
    expect(EmailService.getStaffActivationCompleteText(baseData).toLowerCase())
      .not.toContain('onboard');
  });

  /**
   * ⚠️ What this proves: the EMAIL renders whatever `formatStaffId` produces.
   *
   * It does NOT prove the card agrees, and it used to claim it did — under the
   * name "shows the staff ID in the SAME format the printed card uses", with a
   * comment about "one formatter, two surfaces". At the time the card had its
   * own inline derivation and this test could not have noticed; the 2026-08-16
   * review diverged the card deliberately and this stayed green.
   *
   * The agreement now holds structurally (`id-card.service.ts` calls
   * `formatStaffId`) and is asserted in `id-card.service.test.ts`, which is the
   * only file that can watch the card render.
   */
  it('renders the staff ID exactly as formatStaffId produces it', () => {
    const html = EmailService.getStaffActivationCompleteHtml(baseData);
    const expected = formatStaffId('018e5f2a-1234-7890-abcd-1234567890ab');

    expect(expected).toBe('OSLSR-018E5F2A'); // the format, pinned once
    expect(html).toContain(expected); // the email, derived from it
  });

  it('addresses the person by name and states their role', () => {
    const html = EmailService.getStaffActivationCompleteHtml(baseData);
    expect(html).toContain('Adewale Johnson');
    expect(html).toContain('Enumerator');
  });
});

describe('Story 13-59 AC2/AC4 — the send itself', () => {
  beforeEach(() => {
    resetMockEmailProvider();
    recordEmailSend.mockClear();
    EmailService.initialize();
  });

  it('subject is "Your OSLRS account is active — [Role]"', async () => {
    await EmailService.sendStaffActivationCompleteEmail(baseData);
    expect(getMockEmailProvider().getLastEmail()?.subject).toBe(
      'Your OSLRS account is active — Enumerator',
    );
  });

  it('AC2.1 — it is COUNTED, not a bare provider call', async () => {
    await EmailService.sendStaffActivationCompleteEmail(baseData);

    expect(recordEmailSend).toHaveBeenCalledTimes(1);
    expect(recordEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: baseData.email,
        category: 'staff-activation-complete',
      }),
    );
  });

  it('AC4 — carries NO attachments, on the payload the provider receives', async () => {
    await EmailService.sendStaffActivationCompleteEmail(baseData);

    const sent = getMockEmailProvider().getLastEmail();
    expect(sent).toBeTruthy();
    expect(sent).not.toHaveProperty('attachments');
  });

  it('back-office roles get the email too — they are not field-only', async () => {
    await EmailService.sendStaffActivationCompleteEmail({
      ...baseData,
      roleName: UserRole.SUPER_ADMIN,
      lgaName: null,
    });

    expect(getMockEmailProvider().getLastEmail()?.subject).toBe(
      'Your OSLRS account is active — Super Admin',
    );
  });
});

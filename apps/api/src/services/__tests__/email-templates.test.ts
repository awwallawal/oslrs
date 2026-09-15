import { describe, it, expect } from 'vitest';
import { EmailService } from '../email.service.js';

describe('Email Templates', () => {
  describe('Staff Invitation Email', () => {
    const sampleData = {
      fullName: 'Adewale Johnson',
      roleName: 'Enumerator',
      lgaName: 'Ibadan North',
      activationUrl: 'http://localhost:5173/activate/test-token-123',
      expiresInHours: 24,
      email: 'adewale@example.com',
    };

    it('should generate HTML with OSLSR branding color #9C1E23', () => {
      const html = EmailService.getStaffInvitationHtml(sampleData);

      expect(html).toContain('#9C1E23');
      expect(html).toContain('OSLSR');
      expect(html).toContain('Oyo State Labour & Skills Registry');
    });

    it('should include personalized greeting', () => {
      const html = EmailService.getStaffInvitationHtml(sampleData);

      expect(html).toContain('Hello Adewale Johnson');
    });

    /**
     * ⛔ REGRESSION GUARD — the defect of 2026-09-06..15.
     *
     * Seven field enumerators could not log in for NINE DAYS. They were
     * provisioned with plus-addressed accounts (`name+test@…`) so the invitation
     * would reach an existing inbox — and that is exactly why the suffix was
     * invisible: the email lands in their NORMAL inbox, so the address they read
     * it in looks like the username. 36 `user_not_found` failures across the
     * cohort; one person 9 times; one typed `name+@…`, remembering a `+` but not
     * what followed.
     *
     * The instruction DID exist — in the operator's WhatsApp group, given with
     * the roster. It lived in a channel separated from the action by days and a
     * scroll, while this email — open at the exact moment of acting — said
     * nothing. **Put the instruction where the action is.**
     *
     * ⚠️ Asserting BOTH formats deliberately: a plain-text client is the likely
     * one on a field phone, and it is the easier of the two to forget.
     */
    it('⛔ states the LOGIN ADDRESS — the invitation is where the person acts', () => {
      const html = EmailService.getStaffInvitationHtml(sampleData);
      const text = EmailService.getStaffInvitationText(sampleData);

      // ⚠️ Assert the LABELLED occurrence, not a bare address match. A bare
      // `toContain` passed even with the login line deleted, because the address
      // also appears in the warning sentence below it — a test passing over the
      // exact hole it was written to guard. Found by RED-verifying this guard.
      expect(html).toContain('<strong>Your login:</strong> adewale@example.com');
      expect(text).toContain('Your login: adewale@example.com');
    });

    it('⛔ warns that the login may differ from the receiving inbox (the plus-address case)', () => {
      const plusAddressed = { ...sampleData, email: 'adewale+test@example.com' };

      const html = EmailService.getStaffInvitationHtml(plusAddressed);
      const text = EmailService.getStaffInvitationText(plusAddressed);

      // The exact address, suffix intact, in its LABELLED slot — not a generic
      // rule the reader must apply to themselves, and not a bare substring match.
      expect(html).toContain('<strong>Your login:</strong> adewale+test@example.com');
      expect(text).toContain('Your login: adewale+test@example.com');

      // And an explicit heads-up that it may not match where they read the mail.
      expect(html.toLowerCase()).toContain('even if you received this email at a different address');
      expect(text.toLowerCase()).toContain('even if you received this email at a different address');
    });

    it('should include role information', () => {
      const html = EmailService.getStaffInvitationHtml(sampleData);

      expect(html).toContain('Enumerator');
      expect(html).toContain('<strong>Role:</strong>');
    });

    it('should include LGA assignment for field staff', () => {
      const html = EmailService.getStaffInvitationHtml(sampleData);

      expect(html).toContain('Ibadan North');
      expect(html).toContain('<strong>LGA Assignment:</strong>');
    });

    it('should NOT include LGA section for non-field staff', () => {
      const dataWithoutLga = { ...sampleData, lgaName: undefined };
      const html = EmailService.getStaffInvitationHtml(dataWithoutLga);

      expect(html).not.toContain('LGA Assignment');
    });

    it('should include activation URL', () => {
      const html = EmailService.getStaffInvitationHtml(sampleData);

      expect(html).toContain(sampleData.activationUrl);
      expect(html).toContain('Activate Your Account');
    });

    it('should include expiration notice', () => {
      const html = EmailService.getStaffInvitationHtml(sampleData);

      expect(html).toContain('24 hours');
    });

    it('should include support URL', () => {
      const html = EmailService.getStaffInvitationHtml(sampleData);

      // SUPPORT_URL defaults to oyoskills.com (or process.env.SUPPORT_URL)
      const expectedUrl = process.env.SUPPORT_URL || 'https://oyoskills.com';
      expect(html).toContain(expectedUrl);
    });

    it('should match snapshot for HTML template', () => {
      const html = EmailService.getStaffInvitationHtml(sampleData);
      expect(html).toMatchSnapshot();
    });

    it('should match snapshot for plain text template', () => {
      const text = EmailService.getStaffInvitationText(sampleData);
      expect(text).toMatchSnapshot();
    });
  });

  // Story 9-12 Task 10.3 (2026-05-11 session 8) — Verification Email
  // (Hybrid Magic Link + OTP) template tests deleted alongside the retired
  // `EmailService.getVerificationHtml` / `getVerificationText` / `sendVerificationEmail` /
  // `generateVerificationUrl` surface. Magic-link emails for the wizard are
  // covered by `magic-link.service.test.ts`.

  describe('Email Subject Lines', () => {
    it('should generate correct staff invitation subject', async () => {
      // The subject is constructed in sendStaffInvitationEmail
      // We verify the pattern is correct
      const expectedSubject = "You've been invited to join OSLSR - Supervisor";
      expect(expectedSubject).toContain('OSLSR');
      expect(expectedSubject).toContain('Supervisor');
    });
  });

  describe('URL Generation', () => {
    it('should generate correct staff activation URL', () => {
      const token = 'abc123def456';
      const url = EmailService.generateStaffActivationUrl(token);

      expect(url).toContain('/activate/');
      expect(url).toContain(token);
    });

    // Story 9-12 Task 10.3 (2026-05-11 session 8) — `generateVerificationUrl`
    // test deleted alongside the retired surface.

    it('should generate correct password reset URL', () => {
      const token = 'reset123abc';
      const url = EmailService.generateResetUrl(token);

      expect(url).toContain('/reset-password/');
      expect(url).toContain(token);
    });
  });
});

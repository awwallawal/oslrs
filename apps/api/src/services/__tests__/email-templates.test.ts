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

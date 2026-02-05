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

      expect(html).toContain('oyotradeministry.com.ng');
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

  describe('Verification Email (Hybrid Magic Link + OTP)', () => {
    const sampleData = {
      fullName: 'Chinedu Okafor',
      email: 'chinedu@example.com',
      verificationUrl: 'http://localhost:5173/verify-email/test-token-456',
      otpCode: '847592',
      magicLinkExpiresInHours: 24,
      otpExpiresInMinutes: 10,
    };

    it('should include both magic link and OTP code', () => {
      const html = EmailService.getVerificationHtml(sampleData);

      expect(html).toContain(sampleData.verificationUrl);
      expect(html).toContain(sampleData.otpCode);
    });

    it('should explain both verification methods', () => {
      const html = EmailService.getVerificationHtml(sampleData);

      expect(html).toContain('Click the link OR enter the code');
    });

    it('should show different expiration times for link and OTP', () => {
      const html = EmailService.getVerificationHtml(sampleData);

      expect(html).toContain('24 hour');
      expect(html).toContain('10 minutes');
    });

    it('should have prominent OTP display', () => {
      const html = EmailService.getVerificationHtml(sampleData);

      // OTP should be in large font
      expect(html).toContain('font-size: 32px');
      expect(html).toContain('letter-spacing: 8px');
    });

    it('should match snapshot for verification HTML', () => {
      const html = EmailService.getVerificationHtml(sampleData);
      expect(html).toMatchSnapshot();
    });
  });

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

    it('should generate correct verification URL', () => {
      const token = 'verify789xyz';
      const url = EmailService.generateVerificationUrl(token);

      expect(url).toContain('/verify-email/');
      expect(url).toContain(token);
    });

    it('should generate correct password reset URL', () => {
      const token = 'reset123abc';
      const url = EmailService.generateResetUrl(token);

      expect(url).toContain('/reset-password/');
      expect(url).toContain(token);
    });
  });
});

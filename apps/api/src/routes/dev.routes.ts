import { Router, Request, Response } from 'express';
import { EmailService } from '../services/email.service.js';

const router = Router();

/**
 * Development-only email preview routes
 *
 * These routes are only available in non-production environments
 * and allow developers to preview email templates without sending actual emails.
 */

// Middleware to block access in production
const devOnlyMiddleware = (_req: Request, res: Response, next: () => void) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
};

router.use(devOnlyMiddleware);

/**
 * GET /api/v1/dev/email-preview/staff-invitation
 *
 * Preview the staff invitation email template with sample data
 */
router.get('/email-preview/staff-invitation', (_req: Request, res: Response) => {
  const sampleData = {
    fullName: 'Adewale Johnson',
    roleName: 'Enumerator',
    lgaName: 'Ibadan North',
    activationUrl: 'http://localhost:5173/staff/activate/sample-token-12345',
    expiresInHours: 24,
    email: 'adewale.johnson@example.com',
  };

  const html = EmailService.getStaffInvitationHtml(sampleData);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

/**
 * GET /api/v1/dev/email-preview/staff-invitation/text
 *
 * Preview the staff invitation email plain text version
 */
router.get('/email-preview/staff-invitation/text', (_req: Request, res: Response) => {
  const sampleData = {
    fullName: 'Adewale Johnson',
    roleName: 'Enumerator',
    lgaName: 'Ibadan North',
    activationUrl: 'http://localhost:5173/staff/activate/sample-token-12345',
    expiresInHours: 24,
    email: 'adewale.johnson@example.com',
  };

  const text = EmailService.getStaffInvitationText(sampleData);
  res.setHeader('Content-Type', 'text/plain');
  res.send(text);
});

/**
 * GET /api/v1/dev/email-preview/staff-invitation/no-lga
 *
 * Preview staff invitation for non-field staff (no LGA assignment)
 */
router.get('/email-preview/staff-invitation/no-lga', (_req: Request, res: Response) => {
  const sampleData = {
    fullName: 'Fatima Okonkwo',
    roleName: 'Verification Assessor',
    activationUrl: 'http://localhost:5173/staff/activate/sample-token-67890',
    expiresInHours: 24,
    email: 'fatima.okonkwo@example.com',
  };

  const html = EmailService.getStaffInvitationHtml(sampleData);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

/**
 * GET /api/v1/dev/email-preview/verification
 *
 * Preview the hybrid verification email (Magic Link + OTP)
 */
router.get('/email-preview/verification', (_req: Request, res: Response) => {
  const sampleData = {
    fullName: 'Chinedu Okafor',
    email: 'chinedu.okafor@example.com',
    verificationUrl: 'http://localhost:5173/verify-email/sample-verification-token',
    otpCode: '847592',
    magicLinkExpiresInHours: 24,
    otpExpiresInMinutes: 10,
  };

  const html = EmailService.getVerificationHtml(sampleData);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

/**
 * GET /api/v1/dev/email-preview/password-reset
 *
 * Preview the password reset email
 */
router.get('/email-preview/password-reset', (_req: Request, res: Response) => {
  const sampleData = {
    fullName: 'Olumide Adeyemi',
    email: 'olumide.adeyemi@example.com',
    resetUrl: 'http://localhost:5173/reset-password/sample-reset-token',
    expiresInHours: 1,
  };

  // Note: getPasswordResetHtml is private, so we'll use sendPasswordResetEmail logic
  // For preview, we'll construct a simple response showing what would be sent
  res.setHeader('Content-Type', 'application/json');
  res.json({
    message: 'Password reset email preview',
    data: sampleData,
    note: 'Use the EmailService directly to see full template',
  });
});

export default router;

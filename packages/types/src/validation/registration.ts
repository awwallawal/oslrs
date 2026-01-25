import { z } from 'zod';
import { emailSchema, passwordSchema, captchaTokenSchema } from './auth.js';
import { ninSchema } from './profile.js';

// Nigerian phone number validation (+234XXXXXXXXXX or 0XXXXXXXXXX)
export const nigerianPhoneSchema = z.string()
  .transform((phone) => {
    // Normalize to +234 format
    const cleaned = phone.replace(/\s+/g, '').replace(/-/g, '');
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      return '+234' + cleaned.slice(1);
    }
    if (cleaned.startsWith('234') && cleaned.length === 13) {
      return '+' + cleaned;
    }
    return cleaned;
  })
  .refine(
    (phone) => /^\+234\d{10}$/.test(phone),
    'Phone number must be a valid Nigerian number'
  );

// Full name validation
export const fullNameSchema = z.string()
  .min(2, 'Full name must be at least 2 characters')
  .max(100, 'Full name must be at most 100 characters')
  .regex(/^[a-zA-Z\s\-']+$/, 'Full name can only contain letters, spaces, hyphens and apostrophes')
  .transform((name) => name.trim());

// Public user registration request schema
// Note: captchaToken is optional here because the verifyCaptcha middleware
// handles CAPTCHA validation and returns proper error codes (AUTH_CAPTCHA_FAILED)
export const publicRegistrationRequestSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  phone: nigerianPhoneSchema,
  nin: ninSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  captchaToken: captchaTokenSchema.optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type PublicRegistrationRequestInput = z.infer<typeof publicRegistrationRequestSchema>;

// Email verification request schema
export const verifyEmailRequestSchema = z.object({
  token: z.string()
    .length(64, 'Invalid verification token'),
});

export type VerifyEmailRequestInput = z.infer<typeof verifyEmailRequestSchema>;

// Resend verification email request schema
// Note: captchaToken is optional here because the verifyCaptcha middleware
// handles CAPTCHA validation and returns proper error codes (AUTH_CAPTCHA_FAILED)
export const resendVerificationRequestSchema = z.object({
  email: emailSchema,
  captchaToken: captchaTokenSchema.optional(),
});

export type ResendVerificationRequestInput = z.infer<typeof resendVerificationRequestSchema>;

// OTP verification request schema (ADR-015)
// Note: captchaToken is optional here because the verifyCaptcha middleware
// handles CAPTCHA validation and returns proper error codes (AUTH_CAPTCHA_FAILED)
export const verifyOtpRequestSchema = z.object({
  email: emailSchema,
  otp: z.string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only digits'),
  captchaToken: captchaTokenSchema.optional(),
});

export type VerifyOtpRequestInput = z.infer<typeof verifyOtpRequestSchema>;

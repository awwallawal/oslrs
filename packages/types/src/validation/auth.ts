import { z } from 'zod';

// Password complexity requirements
// - Minimum 8 characters
// - At least one uppercase letter
// - At least one lowercase letter
// - At least one number
// - At least one special character
export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Email validation
export const emailSchema = z.string()
  .email('Invalid email format')
  .max(255, 'Email must be at most 255 characters')
  .transform((email) => email.toLowerCase().trim());

// CAPTCHA token validation
export const captchaTokenSchema = z.string()
  .min(1, 'CAPTCHA verification required');

// Login request schema
// Note: captchaToken is optional here because the verifyCaptcha middleware
// handles CAPTCHA validation and returns proper error codes (AUTH_CAPTCHA_FAILED)
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  captchaToken: captchaTokenSchema.optional(),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;

// Staff login schema (extends base)
export const staffLoginRequestSchema = loginRequestSchema.extend({
  type: z.literal('staff').default('staff'),
});

export type StaffLoginRequestInput = z.infer<typeof staffLoginRequestSchema>;

// Public login schema (extends base)
export const publicLoginRequestSchema = loginRequestSchema.extend({
  type: z.literal('public').default('public'),
});

export type PublicLoginRequestInput = z.infer<typeof publicLoginRequestSchema>;

// Forgot password request schema
// Note: captchaToken is optional here because the verifyCaptcha middleware
// handles CAPTCHA validation and returns proper error codes (AUTH_CAPTCHA_FAILED)
export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
  captchaToken: captchaTokenSchema.optional(),
});

export type ForgotPasswordRequestInput = z.infer<typeof forgotPasswordRequestSchema>;

// Reset password request schema
export const resetPasswordRequestSchema = z.object({
  token: z.string()
    .min(32, 'Invalid reset token')
    .max(64, 'Invalid reset token'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type ResetPasswordRequestInput = z.infer<typeof resetPasswordRequestSchema>;

// Re-authentication request schema
export const reAuthRequestSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export type ReAuthRequestInput = z.infer<typeof reAuthRequestSchema>;

// Token refresh schema (empty - token comes from cookie)
export const refreshTokenRequestSchema = z.object({});

export type RefreshTokenRequestInput = z.infer<typeof refreshTokenRequestSchema>;

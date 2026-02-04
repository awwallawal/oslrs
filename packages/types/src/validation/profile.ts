import { z } from 'zod';
import { modulus11Check } from '@oslsr/utils/src/validation';

export const ninSchema = z.string()
  .length(11, 'NIN must be exactly 11 digits')
  .regex(/^\d{11}$/, 'NIN must contain only digits')
  .refine(modulus11Check, 'Invalid NIN checksum');

export const activationSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  nin: ninSchema,
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format'),
  homeAddress: z.string().min(5, 'Home address is too short'),
  bankName: z.string().min(2, 'Bank name is required'),
  accountNumber: z.string().length(10, 'Account number must be 10 digits').regex(/^\d+$/),
  accountName: z.string().min(2, 'Account name is required'),
  nextOfKinName: z.string().min(2, 'Next of kin name is required'),
  nextOfKinPhone: z.string().min(10, 'Next of kin phone is required'),
});

export type ActivationPayload = z.infer<typeof activationSchema>;

/**
 * Base64 selfie schema for activation wizard
 * Accepts data URL format (data:image/jpeg;base64,...) or raw base64 string
 * Max size: ~2.67MB encoded (2MB decoded image)
 */
const MAX_SELFIE_BASE64_LENGTH = 2.67 * 1024 * 1024; // ~2MB decoded

export const selfieBase64Schema = z.string()
  .max(MAX_SELFIE_BASE64_LENGTH, 'Selfie image is too large (max 2MB)')
  .refine((val) => {
    // Accept data URL format or raw base64
    const base64Pattern = /^(data:image\/(jpeg|png|webp);base64,)?[A-Za-z0-9+/]+=*$/;
    return base64Pattern.test(val);
  }, 'Invalid base64 image format');

/**
 * Extended activation schema with optional selfie capture
 * Maintains backward compatibility - selfieBase64 is optional
 */
export const activationWithSelfieSchema = activationSchema.extend({
  selfieBase64: selfieBase64Schema.optional(),
});

export type ActivationWithSelfiePayload = z.infer<typeof activationWithSelfieSchema>;

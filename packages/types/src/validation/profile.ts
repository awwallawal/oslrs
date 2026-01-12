import { z } from 'zod';
import { verhoeffCheck } from '@oslsr/utils/src/validation';

export const ninSchema = z.string()
  .length(11, 'NIN must be exactly 11 digits')
  .regex(/^\d{11}$/, 'NIN must contain only digits')
  .refine(verhoeffCheck, 'Invalid NIN checksum');

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

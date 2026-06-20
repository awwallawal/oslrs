import { z } from 'zod';
import { modulus11Check } from '@oslsr/utils/src/validation';

/**
 * Canonical wizard-submission payload schema.
 *
 * Single source of truth for BOTH the public wizard submit
 * (`RegistrationController.submitWizard`) and the authenticated in-session edit
 * (`MeController.editRegistrationWizard`, Story 9-61 AC#5 — no parallel
 * validation surface). Lives in a db-free module so importing it never pulls in
 * the database layer (the controllers do, the schema must not).
 *
 * NIN: 11 digits + Modulus-11 checksum, enforced server-side for parity with the
 * enumerator/clerk path + the Step-1 client gate (registration.controller AI-Review L1).
 * `familyName` optional (mononym-inclusive). `questionnaireResponses` optional
 * (Step 4 may be empty when no public form is configured).
 */
export const submitWizardSchema = z.object({
  // Story 9-18 Part F — explicit given/family name (no first-token parse).
  givenName: z.string().min(2).max(80),
  familyName: z.string().min(2).max(80).optional(),
  dateOfBirth: z.string().min(4).max(64).optional(),
  gender: z.string().max(32).optional(),
  phone: z.string().min(10).max(32),
  email: z.string().email().max(255),
  lgaId: z.string().min(1).max(64),
  consentMarketplace: z.boolean(),
  consentEnriched: z.boolean().optional(),
  nin: z
    .string()
    .regex(/^\d{11}$/, 'NIN must be 11 digits')
    .refine(modulus11Check, 'NIN failed the Modulus 11 checksum')
    .optional(),
  pendingNin: z.boolean().optional(),
  deferReasonNin: z.string().max(500).optional(),
  questionnaireResponses: z.record(z.unknown()).optional(),
  authChoice: z.enum(['magic-link', 'password', 'skip']).default('magic-link'),
});

export type SubmitWizardInput = z.infer<typeof submitWizardSchema>;

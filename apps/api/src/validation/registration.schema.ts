import { z } from 'zod';

/**
 * Canonical wizard-submission payload schema.
 *
 * Single source of truth for BOTH the public wizard submit
 * (`RegistrationController.submitWizard`) and the authenticated in-session edit
 * (`MeController.editRegistrationWizard`, Story 9-61 AC#5 — no parallel
 * validation surface). Lives in a db-free module so importing it never pulls in
 * the database layer (the controllers do, the schema must not).
 *
 * NIN: FORMAT-ONLY (`^\d{11}$`). NINs are "11 randomly generated, non-intelligible
 * digits" (NIMC) — no check digit exists, so no offline checksum is possible
 * (Story 13-15: the Mod-11 gate rejected 74% of real NINs on prod).
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
    .optional(),
  pendingNin: z.boolean().optional(),
  deferReasonNin: z.string().max(500).optional(),
  questionnaireResponses: z.record(z.unknown()).optional(),
  authChoice: z.enum(['magic-link', 'password', 'skip']).default('magic-link'),
});

export type SubmitWizardInput = z.infer<typeof submitWizardSchema>;

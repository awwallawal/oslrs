import { z } from 'zod';

// Story 9-12 Task 10.3 (2026-05-11 session 8) — Legacy public-registration
// Zod schemas removed alongside the controller methods + routes they fed:
//   - publicRegistrationRequestSchema (POST /auth/public/register)
//   - verifyEmailRequestSchema        (GET  /auth/verify-email/:token)
//   - resendVerificationRequestSchema (POST /auth/resend-verification)
//   - verifyOtpRequestSchema          (POST /auth/verify-otp)
// The wizard at `/api/v1/registration/wizard` is the canonical public
// registration entry-point; its Zod schema lives in
// `apps/api/src/controllers/registration.controller.ts:submitWizardSchema`.
//
// `nigerianPhoneSchema` and `fullNameSchema` were ONLY referenced by the
// retired schemas in this file (verified via project-wide grep), so they
// have been removed along with the schemas. The wizard normalises phone +
// name via the `prep-input-sanitisation-layer` utilities and validates
// inline in `submitWizardSchema`.

// This file intentionally kept as an empty module so existing
// `export * from './validation/registration.js'` re-exports in
// `packages/types/src/index.ts` continue to load without error.
export const _registrationValidationModulePlaceholder = z.never();

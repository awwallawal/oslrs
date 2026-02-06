# Story 1.4: Staff Activation & Profile Completion

**ID:** 1.4
**Epic:** Epic 1: Foundation, Secure Access & Staff Onboarding
**Status:** ready-for-dev
**Priority:** High

## 1. User Story
As a Staff Member,
I want to complete my profile after accepting an invitation,
So that my identity is verified and my payroll details are captured.

## 2. Acceptance Criteria (BDD)

### Scenario 1: Invitation Acceptance
**Given** a valid, unused invitation token in the URL
**When** I access the activation page
**Then** the system should verify the token's validity
**And** present a form to set my password and complete my profile.

### Scenario 2: Profile Validation (NIN)
**Given** the profile completion form
**When** I provide an 11-digit NIN
**Then** the system should validate it using the Verhoeff checksum algorithm
**And** reject the submission if the checksum is invalid or if the NIN is already registered.

### Scenario 3: Profile Completion Submission
**Given** valid profile data (NIN, Age, Home Address, Bank Details, Next of Kin)
**When** I submit the form
**Then** the system should update my user record with the provided details
**And** set my status to 'active' or 'pending_verification' (per business rules)
**And** invalidate the invitation token
**And** record the profile update in the audit trail.

### Scenario 4: Profile Locking
**Given** a staff profile marked as "Verified" by an Admin
**When** I attempt to edit my NIN or Bank Details
**Then** the system should prevent the update and return a 403 Forbidden error.

## 3. Developer Context

### Technical Requirements
*   **Runtime:** Node.js 20 LTS (ESM).
*   **Database:** PostgreSQL 15 via Drizzle ORM.
*   **NIN Validation:** Implement `verhoeffCheck` utility in `packages/utils/src/validation.ts`.
*   **Validation:** Use `zod` for request validation. Create `packages/types/src/validation/profile.ts`.
*   **Error Handling:** Use the `AppError` class for all domain errors (e.g., `INVALID_TOKEN`, `NIN_DUPLICATE`).
*   **Audit Logging:** Every profile update must be logged in the `audit_logs` table.

### Files & Locations
*   **API Schema:** Update `apps/api/src/db/schema/users.ts` with profile fields:
    *   `nin`: text (unique)
    *   `dateOfBirth`: date
    *   `homeAddress`: text
    *   `bankName`: text
    *   `accountNumber`: text
    *   `accountName`: text
    *   `nextOfKinName`: text
    *   `nextOfKinPhone`: text
    *   `status`: enum ('invited', 'active', 'verified', 'suspended')
*   **Frontend:** Create `apps/web/src/features/auth/pages/ActivationPage.tsx` and `apps/web/src/features/auth/components/ActivationForm.tsx`.
*   **Utilities:** `packages/utils/src/validation.ts` (Verhoeff algorithm).
*   **Services:** `apps/api/src/services/auth.service.ts`.
*   **Controllers:** `apps/api/src/controllers/auth.controller.ts`.

### Implementation Guardrails
*   **Security:** Ensure the activation token is used only once. The token check and profile update must be an atomic transaction.
*   **Integrity:** NIN must be unique. Use Verhoeff algorithm to catch transcription errors.
*   **UX:** Use Skeleton screens in the ActivationPage while checking token validity.
*   **Logging:** Log `auth.activate_success` with `userId` and `timestamp`.
*   **RBAC:** Activation is public via token. Post-activation, the user status moves to `active`.

## 4. Architecture Compliance
*   **ADR-007 (Database Separation):** Write to `app_db`.
*   **ADR-010 (PostgreSQL):** Use UNIQUE constraints for NIN and Email.
*   **Project Context:** Use structured logging (Pino). All API responses must use the established camelCase JSON format.

## 5. Previous Story Intelligence (Story 1.3)
*   **Invitation Token:** The `users` table already has `invitation_token` and `invited_at` from Story 1.3.
*   **Audit Logs:** Use the established `audit_logs` service/pattern to record the activation.
*   **Error Handling:** Use `AppError` with codes like `AUTH_INVALID_TOKEN` or `PROFILE_NIN_DUPLICATE`.

## 6. Testing Requirements
*   **Unit Test:** Verhoeff algorithm in `packages/utils`.
*   **Unit Test:** Zod profile schema validation in `packages/types`.
*   **Integration Test:** `POST /api/v1/auth/activate/:token` with valid and invalid payloads.
*   **Frontend Test:** `ActivationForm` validation states and submission.
*   **Security Test:** Re-using an invitation token must return 401/403.

## 7. Implementation Tasks
- [x] **Core Utilities**
    - [x] Implement `verhoeffCheck` in `packages/utils/src/validation.ts`
    - [x] Add unit tests for `verhoeffCheck`
- [x] **Schema & Types**
    - [x] Update `users` table schema and generate migration
    - [x] Create shared Zod schema in `packages/types/src/validation/profile.ts`
- [x] **Backend Implementation**
    - [x] Implement `AuthService.activateAccount` (atomic transaction: update user + invalidate token + log audit)
    - [x] Create `AuthController` and mount `POST /api/v1/auth/activate/:token`
- [x] **Frontend Implementation**
    - [x] Create `ActivationPage` with token extraction from URL
    - [x] Implement `ActivationForm` using React Hook Form + Zod + shadcn/ui
    - [x] Handle success/error states with meaningful feedback
- [x] **Testing**
    - [x] Integration test for full activation flow
    - [x] NIN uniqueness check test
    - [x] Token replay attack prevention test

## 8. Dev Agent Record
### Implementation Notes
- **Utility:** Implemented Verhoeff algorithm for NIN validation. Covered with unit tests for checksum and generation.
- **Database:** Added 7 new fields to `users` table for profile completion. Generated migration `0003`.
- **Backend:** `AuthService.activateAccount` handles password hashing (bcrypt), NIN uniqueness check, and profile updates within a database transaction. Logged `user.activated` event.
- **Frontend:** Implemented `ActivationPage` and `ActivationForm`. Used `react-hook-form` with `zodResolver` for real-time validation (including NIN checksum).
- **Security:** Tokens are invalidated after successful activation. Token replay is prevented by `status === 'invited'` check and token nullification.

### File List
- `packages/utils/src/validation.ts`
- `packages/utils/src/__tests__/validation.test.ts`
- `packages/utils/src/crypto.ts`
- `apps/api/src/db/schema/users.ts`
- `apps/api/drizzle/0003_violet_prodigy.sql`
- `packages/types/src/validation/profile.ts`
- `apps/api/src/services/auth.service.ts`
- `apps/api/src/controllers/auth.controller.ts`
- `apps/api/src/routes/auth.routes.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/features/auth/components/ActivationForm.tsx`
- `apps/web/src/features/auth/pages/ActivationPage.tsx`
- `apps/web/src/App.tsx`
- `apps/api/src/__tests__/auth.activation.test.ts`

## 9. Retrospective Notes

### Scope Creep from Story 2.5-3
**Identified during Code Review #2 (2026-02-06):** Tasks 19-29 in Story 2.5-3 (Activation Wizard — multi-step wizard with selfie capture during activation) belong to the Story 1-4 scope (Staff Activation & Profile Completion), not Story 2.5-3 (Staff Management Dashboard). The wizard was implemented during 2.5-3 development because the activation flow was discovered to need enhancement during the "Add Staff → Invitation → Activation" end-to-end flow testing. Future sprints should scope activation-related features to this story to avoid cross-story tracking confusion.

**Affected Tasks (implemented in 2.5-3, should have been tracked here):**
- Task 19: Backend schema extension for `activationWithSelfieSchema`
- Task 20: Backend selfie processing during activation
- Task 21: `useActivationWizard` state management hook
- Task 22: Wizard UI components (WizardProgressBar, WizardNavigation, ActivationWizard)
- Tasks 23-27: Wizard steps (Password, PersonalInfo, BankDetails, NextOfKin, Selfie)
- Task 28: ActivationPage integration + token validation endpoint
- Task 29: Testing & verification (S3 integration, edge cases)

## 10. Status Update
*   **Created:** 2026-01-06
*   **Assigned:** BMad Master
**Status:** done

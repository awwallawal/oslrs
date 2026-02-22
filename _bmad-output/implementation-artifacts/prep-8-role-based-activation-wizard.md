# Prep 8: Role-Based Activation Wizard

Status: done

## Story

As a System Architect,
I want the staff activation wizard to be role-aware, showing only relevant steps per role,
so that back-office roles (Official, Assessor, Super Admin) have a streamlined password-only activation instead of the full 5-step field staff wizard.

## Context

Currently, ALL staff roles go through the same 5-step activation wizard (Password → Personal Info → Bank Details → Next of Kin → Selfie). Back-office roles (Government Official, Verification Assessor, Super Admin) don't need selfie capture, bank details for field stipends, or the same verification depth. This prep simplifies their onboarding experience.

## Acceptance Criteria

1. **Given** a staff invitation for a back-office role (Government Official, Verification Assessor, Super Admin), **when** they click the activation link, **then** they should see a simplified wizard: Password only (+ optional NIN if desired). No selfie capture, no bank details, no next of kin steps.
2. **Given** a staff invitation for a field role (Enumerator, Supervisor, Data Entry Clerk), **when** they activate, **then** they must complete all 5 steps as before: Password → Personal Info → Bank Details → Next of Kin → Selfie.
3. **Given** the activation flow, **when** a back-office user sets their password, **then** their account status transitions to `active` immediately (no pending verification state).
4. **Given** the role-based logic, **then** the determination of wizard steps must be based on the invited user's `roleId`, resolved at activation time from the invitation token.
5. **Given** the existing activation tests, **then** all pass without regression. New tests cover: back-office 1-step flow, field staff 5-step flow, correct step rendering per role.

## Tasks / Subtasks

- [x] Task 1: Backend — Role-aware activation endpoint (AC: #2, #3, #4)
  - [x] 1.1 Update `GET /api/v1/auth/activate/:token/validate` in `apps/api/src/services/auth.service.ts`:
    - Added `with: { role: true }` to validate query and `roleName: user.role.name` to response
  - [x] 1.2 Modify activation logic in `apps/api/src/services/auth.service.ts`:
    - Controller validates token first, determines role, selects appropriate schema
    - Service `activateAccount` accepts union type, conditionally includes profile fields
    - Back-office: sets passwordHash + status only; Field: full profile + NIN check + selfie
  - [x] 1.3 Add `BACK_OFFICE_ROLES` constant to `packages/types/src/roles.ts`:
    - Added `BACK_OFFICE_ROLES` (SUPER_ADMIN, GOVERNMENT_OFFICIAL, VERIFICATION_ASSESSOR)
    - Added `DATA_ENTRY_CLERK` to `FIELD_ROLES`
    - Added `isBackOfficeRole()` helper function
    - Added `backOfficeActivationSchema` to `packages/types/src/validation/profile.ts`
  - [x] 1.4 Tests: 22 backend tests pass — back-office password-only, field full validation, role classification

- [x] Task 2: Frontend — Conditional wizard steps (AC: #1, #2)
  - [x] 2.1 Modify `apps/web/src/features/auth/pages/ActivationPage.tsx`:
    - Added `roleName` to `TokenInfo` and `ValidateTokenResponse`, passes to wizard
  - [x] 2.2 Modify `apps/web/src/features/auth/components/activation-wizard/useActivationWizard.ts`:
    - Added `getStepsForRole()`, `ALL_STEPS`, `BACK_OFFICE_STEPS`
    - `activeSteps` computed from role via `useMemo`
    - Updated `nextStep`/`prevStep`/`goToStep` to work with filtered `activeSteps`
    - Updated `submitAll` to validate only active steps and use appropriate schema
  - [x] 2.3 Progress indicator: hidden for back-office (1 step), dynamic step count for field roles

- [x] Task 3: Tests (AC: #5)
  - [x] 3.1 Backend tests: 22 tests — back-office activation (3 roles), field activation, role classification (5)
  - [x] 3.2 Frontend tests: 29 tests — `getStepsForRole` (3), back-office wizard (5), field role wizard (3)

## Dev Notes

### Bank Data Retention for Epic 6

The back-office roles skip bank details during activation, but Epic 6 (Staff Remuneration) may need bank details for ALL staff. The architecture allows bank details to be added later via profile editing — no data loss.

### Current Activation Flow

The existing 5-step wizard consists of:

| Step | Constant | Component |
|------|----------|-----------|
| 1 | `PASSWORD` | `apps/web/src/features/auth/components/activation-wizard/steps/` |
| 2 | `PERSONAL_INFO` | Same directory — collects NIN, date of birth, home address |
| 3 | `BANK_DETAILS` | Same directory — bank name, account number, account name |
| 4 | `NEXT_OF_KIN` | Same directory — name, phone |
| 5 | `SELFIE` | Same directory — live selfie capture |

Key files:
- Entry point: `apps/web/src/features/auth/pages/ActivationPage.tsx`
- Wizard container: `apps/web/src/features/auth/components/activation-wizard/ActivationWizard.tsx`
- State management: `apps/web/src/features/auth/components/activation-wizard/useActivationWizard.ts` (step progression, validation, `completedSteps` Set, `submitAll()`)
- Backend activation: `apps/api/src/services/auth.service.ts` (token lookup at line ~74, role already fetched via `with: { role: true }`)
- Existing tests: `apps/api/src/__tests__/auth.activation.test.ts` (11 tests, no role-based variations)

### FIELD_ROLES Gap

The codebase `FIELD_ROLES` constant at `packages/types/src/roles.ts` only includes `[ENUMERATOR, SUPERVISOR]` — `DATA_ENTRY_CLERK` is missing. The implementer should either:
1. Add `DATA_ENTRY_CLERK` to `FIELD_ROLES`, or
2. Use `BACK_OFFICE_ROLES` as the primary check (recommended — cleaner since back-office is the smaller, well-defined set)

### Validate Endpoint Gap

The `GET /activate/:token/validate` endpoint currently returns `{ valid, email, fullName, expired }` — no role info. The frontend needs the role BEFORE rendering the wizard. Task 1.1 adds `roleName` to this response.

### References

- [Source: _bmad-output/implementation-artifacts/epic-4-retro-2026-02-20.md — prep-8 definition]
- [Source: apps/web/src/features/auth/pages/ActivationPage.tsx — activation entry point]
- [Source: apps/web/src/features/auth/components/activation-wizard/useActivationWizard.ts — wizard state management]
- [Source: apps/api/src/services/auth.service.ts — activation logic, role fetched at line ~74]
- [Source: apps/api/src/__tests__/auth.activation.test.ts — existing activation tests (11 tests)]
- [Source: packages/types/src/roles.ts — FIELD_ROLES constant (missing DATA_ENTRY_CLERK)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Backend test fix 1: Role names in DB are lowercase (`super_admin` not `SUPER_ADMIN`) — fixed test seeds
- Backend test fix 2: Existing tests used `limit(1)` which picked `super_admin` (back-office) — fixed to use explicit `fieldRoleId` from `enumerator` role

### Completion Notes List

- Used `isBackOfficeRole()` as primary check (recommended in Dev Notes) since back-office is the smaller, well-defined set
- Controller calls `validateActivationToken` then `activateAccount` (minor dual-lookup overhead acceptable for infrequent activation)
- `backOfficeActivationSchema` validates password only; `activationWithSelfieSchema` validates full profile
- Progress bar hidden for back-office (1 step); dynamic header text ("Set Your Password" vs "Complete Your Profile")
- 22 backend tests + 29 frontend wizard tests + 227 total auth tests — all pass with 0 regressions

### File List

- `packages/types/src/roles.ts` — Added `BACK_OFFICE_ROLES`, `DATA_ENTRY_CLERK` to `FIELD_ROLES`, `isBackOfficeRole()`
- `packages/types/src/validation/profile.ts` — Added `backOfficeActivationSchema`, `BackOfficeActivationPayload`
- `apps/api/src/services/auth.service.ts` — `validateActivationToken` returns `roleName`; `activateAccount` handles union type
- `apps/api/src/controllers/auth.controller.ts` — Role-aware schema selection in `activate` method
- `apps/api/src/__tests__/auth.activation.test.ts` — 22 tests (11 new role-based tests)
- `apps/web/src/features/auth/api/auth.api.ts` — `ValidateTokenResponse` includes `roleName`
- `apps/web/src/features/auth/components/activation-wizard/useActivationWizard.ts` — Role-aware steps, `getStepsForRole()`
- `apps/web/src/features/auth/components/activation-wizard/ActivationWizard.tsx` — Dynamic header, conditional progress bar
- `apps/web/src/features/auth/components/activation-wizard/WizardProgressBar.tsx` — Dynamic step count from `activeSteps`
- `apps/web/src/features/auth/pages/ActivationPage.tsx` — Passes `roleName` to wizard
- `apps/web/src/features/auth/components/activation-wizard/__tests__/useActivationWizard.test.tsx` — 29 tests (11 new role-based)
- `apps/web/src/features/auth/components/activation-wizard/__tests__/ActivationWizard.test.tsx` — 8 component rendering tests (role-conditional UI)

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: Replace `Promise<any>` return type on `activateAccount` with typed interface `{ id, email, fullName, status }` [auth.service.ts:78]
- [x] [AI-Review][MEDIUM] M1: Remove false File List entry for `packages/types/src/index.ts` — barrel already re-exports via wildcard
- [x] [AI-Review][MEDIUM] M2: Eliminate double DB lookup — pass `roleName` from controller to `activateAccount`, remove `with: { role: true }` from second query [auth.controller.ts + auth.service.ts]
- [x] [AI-Review][MEDIUM] M3: Rename misleading `activateWithSelfie` to `activateAccount` in auth.api.ts and update useActivationWizard.ts import
- [x] [AI-Review][MEDIUM] M4: Add 8 component rendering tests for role-conditional wizard UI (progress bar visibility, header text) [ActivationWizard.test.tsx]
- [x] [AI-Review][LOW] L1: Rename `TOTAL_STEPS` to `FIELD_ROLE_TOTAL_STEPS` — reflects it only applies to field roles [useActivationWizard.ts + index.ts + test]
- [x] [AI-Review][LOW] L2: Add integration tests for `supervisor` and `data_entry_clerk` activation flows + add missing role seeds [auth.activation.test.ts]
- [x] [AI-Review][LOW] L3: Replace non-deterministic `limit(1)` role lookups with explicit `fieldRoleId` in validate endpoint tests [auth.activation.test.ts]

# Story prep.2: Shared Role Constants

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want all role names, display labels, and role-related constants centralized in `packages/types` as a single source of truth,
so that frontend and backend cannot drift out of sync — preventing the class of runtime bug where "3 roles couldn't access their dashboards."

## Context & Background

**Source:** Combined Epic 2+2.5 Retrospective (2026-02-10), Action Item T3 (HIGH priority, Prep phase).

**The Incident (Story 2.5-7):** Frontend code used `admin` while the database stored `super_admin`. Three roles (Assessor, Official, Public User) were broken at runtime despite 53 RBAC tests passing. The root cause: role strings were hardcoded independently in frontend and backend without a shared constant.

**Team Agreement A10 (project-context.md):**
> "Role names, status enums, error codes, and any value used by both API and Web must be defined in `packages/types` as a single source of truth. Never hardcode these strings in application code."

**Current State Problem:** While `UserRole` enum exists in `packages/types/src/constants.ts`, the frontend re-defines its own `UserRole` type locally in `sidebarConfig.ts` and multiple files hardcode role-related strings independently. There is no shared mapping for display names, LGA requirements, or role formatting.

## Pre-Implementation Analysis (Codebase Scan Results)

### Current Role Definitions Inventory

| Location | What | Issue |
|----------|------|-------|
| `packages/types/src/constants.ts:1-9` | `UserRole` enum (7 roles) | SOURCE OF TRUTH — correct |
| `packages/types/src/auth.ts:7,44` | Imports `UserRole` for `JwtPayload`, `AuthUser` | Clean usage |
| `apps/web/src/features/dashboard/config/sidebarConfig.ts:44-51` | **LOCAL** `UserRole` type union (duplicate) | DUPLICATION — must import from @oslsr/types |
| `apps/web/src/features/dashboard/config/sidebarConfig.ts:79-87` | `roleDisplayNames` map | Should use shared constant |
| `apps/web/src/features/dashboard/config/sidebarConfig.ts:183-191` | `ALL_ROLES` array | Should use shared constant |
| `apps/web/src/features/staff/components/StaffTable.tsx:98` | Inline `replace(/_/g, ' ')` formatting | Duplicates backend logic |
| `apps/web/src/features/staff/components/AddStaffModal.tsx:43` | Hardcoded `LGA_REQUIRED_ROLES = ['enumerator', 'supervisor']` | Should be shared constant |
| `apps/web/src/features/staff/components/AddStaffModal.tsx:249,304` | Inline `replace(/_/g, ' ')` formatting (role dropdown + LGA help text) | Should use shared helper |
| `apps/web/src/features/staff/pages/StaffManagementPage.tsx:220` | Inline `replace(/_/g, ' ')` formatting (role filter dropdown) | Should use shared helper |
| `apps/web/src/features/staff/components/RoleChangeDialog.tsx:88` | Inline `replace(/_/g, ' ')` formatting (role select dropdown) | Should use shared helper |
| `apps/api/src/services/id-card.service.ts:183-185` | Inline `toSentenceCase()` function | Not exported, not reusable |
| `apps/api/src/db/seeds/roles.seed.ts:7-36` | `USER_ROLES` seed array with descriptions | Should reference shared source |
| `apps/api/src/middleware/rbac.ts:2,9,17` | Imports `UserRole` from @oslsr/types | Clean usage |

### What's Already Correct

- `UserRole` enum in `packages/types/src/constants.ts` with all 7 roles
- Backend RBAC middleware (`rbac.ts`) imports from `@oslsr/types`
- Auth context (`AuthContext.tsx`) imports `UserRole` from `@oslsr/types`
- All 7 role string values are consistent (`super_admin`, `supervisor`, etc.)

### What Must Change

1. **Remove** local `UserRole` type from `sidebarConfig.ts` → import from `@oslsr/types`
2. **Create** shared `ROLE_DISPLAY_NAMES` constant in `packages/types`
3. **Create** shared `ALL_ROLES` array in `packages/types`
4. **Create** shared `FIELD_ROLES` (LGA-required) constant in `packages/types`
5. **Create** shared `getRoleDisplayName()` helper in `packages/types`
6. **Update** frontend consumers to use shared constants (5 files: sidebarConfig, StaffTable, AddStaffModal, StaffManagementPage, RoleChangeDialog)
7. **Update** backend `id-card.service.ts` to use shared helper

## Acceptance Criteria

### AC1: UserRole Enum Is the Single Import Source
**Given** any file in `apps/web/` or `apps/api/` that references user roles
**When** checking import statements
**Then** `UserRole` is imported from `@oslsr/types` (NOT defined locally)
**And** zero local type definitions for `UserRole` exist outside `packages/types`

### AC2: Shared Role Display Names Constant Exists
**Given** `packages/types/src/roles.ts` (new file)
**When** importing `ROLE_DISPLAY_NAMES`
**Then** it provides a `Record<UserRole, string>` mapping every role to its human-readable name
**And** `getRoleDisplayName('super_admin')` returns `'Super Admin'`
**And** `getRoleDisplayName('data_entry_clerk')` returns `'Data Entry Clerk'`
**And** the function signature is `(role: string): string` to support both enum values and plain API response strings

### AC3: Shared Field Roles Constant Exists
**Given** `packages/types/src/roles.ts`
**When** importing `FIELD_ROLES`
**Then** it exports an array containing `UserRole.ENUMERATOR` and `UserRole.SUPERVISOR`
**And** it is used by `AddStaffModal.tsx` instead of hardcoded strings

### AC4: Shared ALL_ROLES Array Exists
**Given** `packages/types/src/roles.ts`
**When** importing `ALL_ROLES`
**Then** it exports an array of all 7 `UserRole` enum values
**And** `sidebarConfig.ts` uses it instead of defining its own `ALL_ROLES`

### AC5: Frontend Consumers Updated
**Given** the following files consume shared role constants:
- `apps/web/src/features/dashboard/config/sidebarConfig.ts`
- `apps/web/src/features/staff/components/StaffTable.tsx`
- `apps/web/src/features/staff/components/AddStaffModal.tsx`
- `apps/web/src/features/staff/pages/StaffManagementPage.tsx`
- `apps/web/src/features/staff/components/RoleChangeDialog.tsx`
**When** reviewing each file
**Then** no inline role formatting logic exists (no `replace(/_/g, ' ')`)
**And** no hardcoded role string arrays exist (no `['enumerator', 'supervisor']`)
**And** all use imports from `@oslsr/types`

### AC6: Backend Consumers Updated
**Given** `apps/api/src/services/id-card.service.ts`
**When** formatting role names for ID card display
**Then** it imports and uses `getRoleDisplayName()` from `@oslsr/types`
**And** the inline `toSentenceCase()` function is removed

### AC7: All Existing Tests Pass
**Given** the refactoring changes
**When** running `pnpm test`
**Then** all existing tests pass with zero regressions
**And** sidebarConfig tests still validate all roles have config entries

### AC8: New Unit Tests for Shared Constants
**Given** the new `packages/types/src/roles.ts` file
**When** running tests
**Then** tests verify:
- `ALL_ROLES` has exactly 7 entries
- `ROLE_DISPLAY_NAMES` maps every `UserRole` value
- `FIELD_ROLES` contains exactly `ENUMERATOR` and `SUPERVISOR`
- `getRoleDisplayName()` returns correct display names for all 7 roles

## Tasks / Subtasks

- [x] Task 1: Create shared role constants file (AC: #2, #3, #4)
  - [x] 1.1 Create `packages/types/src/roles.ts` with:
    - `ROLE_DISPLAY_NAMES: Record<UserRole, string>` mapping all 7 roles
    - `ALL_ROLES: UserRole[]` array of all enum values
    - `FIELD_ROLES: readonly UserRole[]` for LGA-required roles (Enumerator, Supervisor)
    - `getRoleDisplayName(role: string): string` helper function (accepts `string` — not just `UserRole` — because API responses return role names as plain strings; uses `ROLE_DISPLAY_NAMES` lookup with sentence-case fallback for unknown values)
  - [x] 1.2 Export from `packages/types/src/index.ts` — add re-exports for new constants
  - [x] 1.3 Verify build: `pnpm build` in packages/types succeeds

- [x] Task 2: Write unit tests for shared constants (AC: #8)
  - [x] 2.1 Create `packages/types/src/__tests__/roles.test.ts`
  - [x] 2.2 Test `ALL_ROLES` contains exactly 7 entries and matches `Object.values(UserRole)`
  - [x] 2.3 Test `ROLE_DISPLAY_NAMES` has entry for every `UserRole` value
  - [x] 2.4 Test `FIELD_ROLES` contains exactly `ENUMERATOR` and `SUPERVISOR`
  - [x] 2.5 Test `getRoleDisplayName()` for all 7 roles with expected display names
  - [x] 2.6 Test `getRoleDisplayName()` returns sentence-cased fallback for unknown input

- [x] Task 3: Update frontend — sidebarConfig.ts (AC: #1, #5)
  - [x] 3.1 Remove local `UserRole` type definition (lines 44-51)
  - [x] 3.2 Import `UserRole` from `@oslsr/types`
  - [x] 3.3 Replace local `roleDisplayNames` with import of `ROLE_DISPLAY_NAMES` from `@oslsr/types`
  - [x] 3.4 Replace local `ALL_ROLES` with import from `@oslsr/types`
  - [x] 3.5 Update `getRoleDisplayName()` helper to delegate to shared function
  - [x] 3.6 Keep `roleRouteMap` and `sidebarConfig` as-is (frontend-only routing concerns)
  - [x] 3.7 Update the `export type { UserRole }` in `dashboard/index.ts` to re-export from `@oslsr/types`
  - [x] 3.8 Verify existing sidebarConfig tests still pass

- [x] Task 4: Update frontend — StaffTable.tsx (AC: #5)
  - [x] 4.1 Replace inline `staff.roleName.replace(/_/g, ' ')` with `getRoleDisplayName()` import
  - [x] 4.2 Verify staff table renders role names correctly

- [x] Task 4b: Update frontend — StaffManagementPage.tsx (AC: #5)
  - [x] 4b.1 Import `getRoleDisplayName` from `@oslsr/types`
  - [x] 4b.2 Replace inline `role.name.replace(/_/g, ' ')` (line 220) with `getRoleDisplayName(role.name)`
  - [x] 4b.3 Verify role filter dropdown renders role names correctly

- [x] Task 4c: Update frontend — RoleChangeDialog.tsx (AC: #5)
  - [x] 4c.1 Import `getRoleDisplayName` from `@oslsr/types`
  - [x] 4c.2 Replace inline `role.name.replace(/_/g, ' ')` (line 88) with `getRoleDisplayName(role.name)`
  - [x] 4c.3 Verify role change dropdown renders role names correctly

- [x] Task 5: Update frontend — AddStaffModal.tsx (AC: #3, #5)
  - [x] 5.1 Replace hardcoded `LGA_REQUIRED_ROLES = ['enumerator', 'supervisor']` with import of `FIELD_ROLES` from `@oslsr/types`
  - [x] 5.2 Update the `includes()` check to use `FIELD_ROLES` array
  - [x] 5.3 Replace inline `role.name.replace(/_/g, ' ')` (line 249, role dropdown) with `getRoleDisplayName(role.name)`
  - [x] 5.4 Replace inline `selectedRole?.name.replace(/_/g, ' ')` (line 304, LGA help text) with `getRoleDisplayName(selectedRole?.name)`
  - [x] 5.5 Verify LGA dropdown still shows/hides correctly based on role selection

- [x] Task 6: Update backend — id-card.service.ts (AC: #6)
  - [x] 6.1 Import `getRoleDisplayName` from `@oslsr/types`
  - [x] 6.2 Remove inline `toSentenceCase()` function
  - [x] 6.3 Replace `toSentenceCase(data.role)` with `getRoleDisplayName(data.role)`
  - [x] 6.4 Verify ID card generation still formats role correctly

- [x] Task 7: Run full test suite (AC: #7)
  - [x] 7.1 Run `pnpm build` — verify all packages compile
  - [x] 7.2 Run `pnpm test` — verify all tests pass (957 web + cached API/types/utils)
  - [x] 7.3 Specifically run web tests: `pnpm --filter @oslsr/web test`
  - [x] 7.4 Specifically run API tests: `pnpm vitest run apps/api/src/`

- [x] Task 8: Verification sweep (AC: #1)
  - [x] 8.1 Search for any remaining local `UserRole` type definitions outside packages/types — ZERO found
  - [x] 8.2 Search for any remaining inline role formatting (`replace(/_/g, ' ')` patterns) — ZERO found
  - [x] 8.3 Search for any remaining hardcoded role string arrays — ZERO found (allowedRoles in routing are values, not display constants)
  - [x] 8.4 Confirm zero duplications remain — CONFIRMED

## Dev Notes

### Scope & Intent

This is a **refactoring story** — no new features, no new UI, no API changes. The goal is consolidation of existing role-related constants into a single shared package to prevent the class of bug that broke 3 dashboards in Story 2.5-7.

### Architecture Compliance

- **packages/types** is the correct location per architecture.md: "packages/types/ for shared TypeScript types"
- **Naming convention:** Constants use SCREAMING_SNAKE_CASE per project-context.md rule 5 (e.g., `ROLE_DISPLAY_NAMES`, `ALL_ROLES`, `FIELD_ROLES`)
- **Enum values stay lowercase:** `UserRole.SUPER_ADMIN = 'super_admin'` — this matches database `roles.name` column values
- **No new packages created** — only adding to existing `packages/types`

### What to Keep Frontend-Only

These items belong in `sidebarConfig.ts` and should NOT be moved to shared:
- `sidebarConfig` (nav items per role) — purely UI concern
- `roleRouteMap` (dashboard routes per role) — React Router concern
- `getSidebarItems()` — frontend-only helper

### What to Share

- `ROLE_DISPLAY_NAMES` — used by both frontend (tables, badges) and backend (ID cards)
- `ALL_ROLES` — used for validation, iteration, test assertions
- `FIELD_ROLES` — used by frontend (LGA assignment logic) and backend (LGA-lock middleware)
- `getRoleDisplayName(role: string): string` — universal role formatting function; accepts plain `string` (not `UserRole`) because API responses return role names as strings

### ESM Import Pattern

Backend files use `.js` extensions for relative imports. Since `@oslsr/types` is a workspace package, it resolves via pnpm workspace protocol — no `.js` extension needed:
```typescript
// Both apps/web and apps/api can use:
import { UserRole, ROLE_DISPLAY_NAMES, getRoleDisplayName } from '@oslsr/types';
```

### Project Structure Notes

- New file: `packages/types/src/roles.ts`
- New file: `packages/types/src/__tests__/roles.test.ts`
- Modified: `packages/types/src/index.ts` (add re-exports)
- Modified: `apps/web/src/features/dashboard/config/sidebarConfig.ts` (remove duplicates, add imports)
- Modified: `apps/web/src/features/dashboard/index.ts` (update UserRole re-export)
- Modified: `apps/web/src/features/staff/components/StaffTable.tsx` (use shared helper)
- Modified: `apps/web/src/features/staff/components/AddStaffModal.tsx` (use shared constant + shared helper)
- Modified: `apps/web/src/features/staff/pages/StaffManagementPage.tsx` (use shared helper)
- Modified: `apps/web/src/features/staff/components/RoleChangeDialog.tsx` (use shared helper)
- Modified: `apps/api/src/services/id-card.service.ts` (use shared helper)

### References

- [Source: _bmad-output/implementation-artifacts/epic-2-2.5-retrospective-2026-02-10.md#T3] — Action item origin
- [Source: _bmad-output/project-context.md#Team-Agreements] — Agreement A10: shared constants mandate
- [Source: packages/types/src/constants.ts:1-9] — Existing UserRole enum (source of truth)
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts:44-51] — Local UserRole duplicate to remove
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts:79-87] — roleDisplayNames to replace
- [Source: apps/web/src/features/staff/components/AddStaffModal.tsx:43] — Hardcoded LGA_REQUIRED_ROLES to replace
- [Source: apps/api/src/services/id-card.service.ts:183-185] — Inline toSentenceCase to replace
- [Source: apps/web/src/features/staff/pages/StaffManagementPage.tsx:220] — Inline role formatting to replace
- [Source: apps/web/src/features/staff/components/RoleChangeDialog.tsx:88] — Inline role formatting to replace

### Previous Story Intelligence

**From prep-1 (ODK Cleanup):**
- Minimal scope — all major cleanup was already done by SCP course correction
- Full test suite: 1,290 tests (API: 268, Web: 957, Utils: 65) — all passing
- Code review found 5 issues (0H, 2M, 3L) — all resolved
- `constants.ts` was deleted in prep-1 (empty file) — do NOT recreate it under the same name in web features
- Lesson: The `packages/` scope was flagged as containing ODK references (L1 from review) — review found issues the AC didn't cover. Be thorough in sweep (Task 8).

### Git Intelligence

Recent commits show:
- `f6b4fec` fix: resolve web build errors — **UserRole enum, AuthContext mock, apiBaseUrl prop** — directly relevant! Shows recent UserRole-related fix
- `a5b29b5` fix: resolve CI build errors in FormWithVersions type — type system fix pattern
- `637ac57` feat: Public User dashboard & RBAC tests (Story 2.5-8) — most recent feature story, RBAC tests pattern
- `1d11758` feat: Assessor & Official dashboards — the story where role mismatch was discovered

The `f6b4fec` commit is especially relevant — it fixed UserRole enum issues, which is exactly the class of problem this story prevents permanently.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- StaffTable test expected raw `'enumerator'` string; updated to `'Enumerator'` to match `getRoleDisplayName()` output
- sidebarConfig test expected fallback `'User'`; updated to `'Invalid Role'` to match sentence-case fallback behavior
- RBAC routes test had local `ALL_ROLES` const and derived `UserRole` type; updated to import from `@oslsr/types`

### Completion Notes List

- Created `packages/types/src/roles.ts` with `ROLE_DISPLAY_NAMES`, `ALL_ROLES`, `FIELD_ROLES`, `getRoleDisplayName()`
- 7 new unit tests in `packages/types/src/__tests__/roles.test.ts` — all passing
- Removed local `UserRole` type from `sidebarConfig.ts`, now imports from `@oslsr/types`
- `roleDisplayNames` in sidebarConfig now delegates to shared `ROLE_DISPLAY_NAMES`
- `ALL_ROLES` in sidebarConfig now delegates to shared constant
- `getRoleDisplayName()` in sidebarConfig now delegates to shared function (sentence-case fallback instead of `'User'`)
- Replaced all 4 inline `replace(/_/g, ' ')` patterns across StaffTable, StaffManagementPage, RoleChangeDialog, AddStaffModal
- Replaced hardcoded `LGA_REQUIRED_ROLES` in AddStaffModal with `FIELD_ROLES` from `@oslsr/types`
- Replaced `toSentenceCase()` in `id-card.service.ts` with `getRoleDisplayName()` from `@oslsr/types`
- Updated `dashboard/index.ts` to re-export `UserRole` type from `@oslsr/types`
- Updated `rbac-routes.test.tsx` to import `UserRole` and `ALL_ROLES` from `@oslsr/types`
- Full test suite: 957 web tests pass, all API/types/utils cached pass, zero regressions
- Verification sweep: zero local UserRole types, zero inline formatting, zero hardcoded arrays

### File List

**New files:**
- `packages/types/src/roles.ts`
- `packages/types/src/__tests__/roles.test.ts`

**Modified files:**
- `packages/types/src/index.ts` — added `roles.js` re-export
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — removed local UserRole/roleDisplayNames/ALL_ROLES, imports from @oslsr/types; [review] renamed roleDisplayNames→ROLE_DISPLAY_NAMES, ALL_ROLES now readonly
- `apps/web/src/features/dashboard/index.ts` — UserRole re-export from @oslsr/types; [review] roleDisplayNames→ROLE_DISPLAY_NAMES
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` — updated fallback expectation; [review] roleDisplayNames→ROLE_DISPLAY_NAMES
- `apps/web/src/features/dashboard/__tests__/rbac-routes.test.tsx` — imports from @oslsr/types
- `apps/web/src/features/staff/components/StaffTable.tsx` — uses getRoleDisplayName()
- `apps/web/src/features/staff/components/__tests__/StaffTable.test.tsx` — updated role text expectation
- `apps/web/src/features/staff/components/AddStaffModal.tsx` — uses FIELD_ROLES + getRoleDisplayName(); [review] removed intermediate LGA_REQUIRED_ROLES, removed .toLowerCase()
- `apps/web/src/features/staff/pages/StaffManagementPage.tsx` — uses getRoleDisplayName()
- `apps/web/src/features/staff/components/RoleChangeDialog.tsx` — uses getRoleDisplayName()
- `apps/api/src/services/id-card.service.ts` — uses getRoleDisplayName(), removed toSentenceCase()
- `apps/api/src/services/__tests__/id-card.service.test.ts` — [review] fixed mock role case: 'Enumerator'→'enumerator'
- `apps/web/src/layouts/components/DashboardHeader.tsx` — [review] getRoleDisplayName import from @oslsr/types
- `apps/web/src/layouts/components/ProfileDropdown.tsx` — [review] getRoleDisplayName import from @oslsr/types
- `apps/web/src/features/dashboard/pages/ProfilePage.tsx` — [review] getRoleDisplayName import from @oslsr/types

## Review Follow-ups (AI)

- [x] [AI-Review][HIGH] id-card.service.test.ts:95 — Test mock uses `role: 'Enumerator'` (capitalized) while production uses `'enumerator'` (DB value). Test passed via fallback path, not ROLE_DISPLAY_NAMES lookup. Fixed: changed to `role: 'enumerator'`.
- [x] [AI-Review][MEDIUM] sidebarConfig.ts:157 — `ALL_ROLES: UserRole[]` lost `readonly` from shared constant via spread copy. Fixed: changed to `readonly UserRole[]` direct reference (no spread).
- [x] [AI-Review][MEDIUM] DashboardHeader.tsx, ProfileDropdown.tsx, ProfilePage.tsx — imported `getRoleDisplayName` from sidebarConfig re-export instead of canonical `@oslsr/types`. Fixed: all 3 files now import from `@oslsr/types`.
- [x] [AI-Review][MEDIUM] AddStaffModal.tsx:63 — `.toLowerCase()` call on `selectedRole.name` is redundant (FIELD_ROLES values already lowercase from enum) and masks potential data inconsistency. Fixed: removed `.toLowerCase()`.
- [x] [AI-Review][LOW] sidebarConfig.ts:68, dashboard/index.ts, sidebarConfig.test.ts — `roleDisplayNames` (camelCase) aliased `ROLE_DISPLAY_NAMES` (SCREAMING_SNAKE). Fixed: renamed to `ROLE_DISPLAY_NAMES` across all 3 files.
- [x] [AI-Review][LOW] AddStaffModal.tsx:44 — Unnecessary intermediate `LGA_REQUIRED_ROLES` constant with type widening to `readonly string[]`. Fixed: removed intermediate, use inline `(FIELD_ROLES as readonly string[]).includes()`.
- [x] [AI-Review][LOW] roles.test.ts — Missing edge case test for `getRoleDisplayName('')`. Fixed: added test asserting empty string returns `''`.
- [x] [AI-Review][LOW] roles.ts:21 — `Object.values(UserRole)` returns `string[]`; `readonly UserRole[]` annotation relies on TypeScript trust. Accepted — no practical risk with current string enum; no fix needed.

## Change Log

- 2026-02-11: Story prep.2 implemented — Centralized role constants in packages/types. Created ROLE_DISPLAY_NAMES, ALL_ROLES, FIELD_ROLES, getRoleDisplayName(). Updated 5 frontend files and 1 backend file to use shared constants. 7 new unit tests. Zero regressions (957 web tests pass).
- 2026-02-11: Code review (AI) — 8 findings (1H, 3M, 4L). Fixed 7/8: id-card test mock case (H1), readonly ALL_ROLES (M1), canonical import paths for 3 layout files (M2), removed redundant .toLowerCase() (M3), renamed roleDisplayNames to ROLE_DISPLAY_NAMES (L1), removed intermediate LGA_REQUIRED_ROLES (L2), added empty-string edge case test (L3). Accepted L4 (Object.values type safety — no practical risk). 957 web tests + 8 types tests + 8 API id-card tests pass, zero regressions.

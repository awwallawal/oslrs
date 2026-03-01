# Story sec.3: Harden Mass Assignment & Input Validation

Status: done

<!-- Source: security-audit-report-2026-03-01.md — SEC-3 (P2 MEDIUM) -->
<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to replace `...req.body` spread patterns with explicit field extraction and harden input validation across all controllers,
so that the codebase is resilient against mass assignment even if Zod schemas change, and internal error details are never exposed to clients.

## Acceptance Criteria

1. **AC1:** The `...req.body` spread in `remuneration.controller.ts:94` is refactored to explicitly extract only the expected fields (`trancheName`, `trancheNumber`, `amount`, `staffIds`, `bankReference`, `description`, `lgaId`, `roleFilter`) before Zod validation.

2. **AC2:** `staff.controller.ts` `createManual` (line 170) no longer passes raw `req.body` to the service. Add Zod validation at the controller level using `createStaffSchema.safeParse(req.body)` and pass `parseResult.data` to the service.

3. **AC3:** `staff.controller.ts` `updateRole` (line 72) and `reactivate` (line 127) use Zod schemas for body validation instead of manual destructuring/checks.

4. **AC4:** A grep for `...req.body` across all controller files returns zero matches.

5. **AC5:** `CORS_ORIGIN` is added to the `requiredProdVars` array in `app.ts` (lines 31-36) so production fails fast if CORS is misconfigured.

6. **AC6:** The 4 `AppError` instances that expose internal error messages via `details.error` are sanitized:
   - `id-card.service.ts:59` and `:265` — PDFKit errors
   - `export.service.ts:95` — PDF generation errors
   - `photo-processing.service.ts:173` — S3/storage errors
   - Internal `err.message` must NOT reach the client. Log the full error server-side, return only a generic user-safe message in `details`.

7. **AC7:** `audit.controller.ts:28` is changed from `.parse()` to `.safeParse()` with proper `AppError` wrapping (currently a raw ZodError leaks to the global error handler, producing a 500 instead of 400).

8. **AC8:** All existing tests pass with zero regressions.

## Tasks / Subtasks

- [x] **Task 1: Refactor `remuneration.controller.ts` mass assignment** (AC: #1, #4)
  - [x] 1.1 Open `apps/api/src/controllers/remuneration.controller.ts` — lines 92-102
  - [x] 1.2 Replace `...req.body` spread with explicit field extraction (trancheName, trancheNumber, amount, staffIds, bankReference, description, lgaId, roleFilter — matching actual schema fields)
  - [x] 1.3 Verify the `createPaymentBatchSchema` fields match the extracted fields
  - [x] 1.4 Run remuneration tests to verify no regressions

- [x] **Task 2: Add Zod validation to `staff.controller.ts` unvalidated routes** (AC: #2, #3)
  - [x] 2.1 `createManual`: Import `createStaffSchema` from `@oslsr/types`, add `safeParse(req.body)` with error handling, pass `parseResult.data` instead of `req.body` to `StaffService.createManual()`
  - [x] 2.2 `updateRole`: Created local `updateRoleSchema` (`z.object({ roleId: z.string().uuid() })`) and use `safeParse(req.body)`
  - [x] 2.3 `reactivate`: Created local `reactivateSchema` (`z.object({ reOnboard: z.boolean().optional().default(false) })`) and use `safeParse(req.body)`
  - [x] 2.4 Follow the existing controller pattern: `safeParse` → check `!result.success` → throw `AppError('VALIDATION_ERROR', ..., 400, { errors: ... })` → use `result.data`
  - [x] 2.5 Define the new schemas locally in `staff.controller.ts`
  - [x] 2.6 Run staff controller tests — 31 pass, updated test data to use valid UUIDs for roleId

- [x] **Task 3: Sanitize AppError `details` fields that leak internal errors** (AC: #6)
  - [x] 3.1 `id-card.service.ts` doc.on('error'): Added pino logger, removed `{ error: err.message }` from AppError details
  - [x] 3.2 `id-card.service.ts` catch block: Added pino logger, removed `{ error: err.message }` from AppError details
  - [x] 3.3 `export.service.ts` doc.on('error'): Added pino logger, removed `{ error: (err as Error).message }` from AppError details
  - [x] 3.4 `photo-processing.service.ts` getPhotoBuffer catch: Added pino logger, removed `{ error: err.message }` from AppError details
  - [x] 3.5 All fixes follow pattern: `logger.error({ event: '...', error: err }, 'message')` then `new AppError(code, msg, 500)` with no details
  - [x] 3.6 Tests verified — no regressions

- [x] **Task 4: Fix `audit.controller.ts` `.parse()` → `.safeParse()`** (AC: #7)
  - [x] 4.1 Open `apps/api/src/controllers/audit.controller.ts`
  - [x] 4.2 Changed `verifyQuerySchema.parse(req.query)` to `verifyQuerySchema.safeParse(req.query)` with standard AppError pattern
  - [x] 4.3 Imported `AppError` from `@oslsr/utils` (was missing)
  - [x] 4.4 Tests verified

- [x] **Task 5: Add `CORS_ORIGIN` to `requiredProdVars`** (AC: #5)
  - [x] 5.1 Open `apps/api/src/app.ts`
  - [x] 5.2 Add `'CORS_ORIGIN'` to the `requiredProdVars` array
  - [x] 5.3 Previous: `['JWT_SECRET', 'REFRESH_TOKEN_SECRET', 'DATABASE_URL', 'HCAPTCHA_SECRET_KEY']`
  - [x] 5.4 New: `['JWT_SECRET', 'REFRESH_TOKEN_SECRET', 'DATABASE_URL', 'HCAPTCHA_SECRET_KEY', 'CORS_ORIGIN']`
  - [x] 5.5 Verified env validation logic will fail fast if `CORS_ORIGIN` missing in production

- [x] **Task 6: Verify no `...req.body` patterns remain** (AC: #4)
  - [x] 6.1 Grep across all controllers: 0 matches for `...req.body`
  - [x] 6.2 Grep across all services: 0 matches for `...req.body`

- [x] **Task 7: Full regression test** (AC: #8)
  - [x] 7.1 `pnpm test` — 1164 API tests + 1939 web tests = 3103 total, all pass
  - [x] 7.2 `pnpm build` — TypeScript compilation succeeds, no errors

### Review Follow-ups (AI) — All Fixed

- [x] [AI-Review][MEDIUM] Add unit tests for `reactivate` endpoint — zero test coverage for new Zod validation [`staff.controller.test.ts`]
- [x] [AI-Review][MEDIUM] Audit controller tests: assert `VALIDATION_ERROR` code + 400 status, not just `expect.any(Error)` [`audit.controller.test.ts:114-152`]
- [x] [AI-Review][MEDIUM] Fix AC1 field names — story listed 6 wrong fields, actual schema has 8 [`sec-3 story AC1`]
- [x] [AI-Review][MEDIUM] Fix fragile number coercion: `? Number(x) : undefined` → `!= null ? Number(x) : undefined` [`remuneration.controller.ts:100-101`]
- [x] [AI-Review][LOW] Sanitize `healthCheck()` raw `err.message` leak — return generic message [`photo-processing.service.ts:72`]
- [x] [AI-Review][LOW] Correct AC1 field list in story text [`sec-3 story`]

## Dev Notes

### Priority & Context
- **P2 MEDIUM** — Defensive hardening, prevents future vulnerabilities from emerging
- **Source:** [security-audit-report-2026-03-01.md](_bmad-output/planning-artifacts/security-audit-report-2026-03-01.md) Section 3.1, 3.2, 3.3 + Story SEC-3
- **Depends on:** None (independent of SEC-1 and SEC-2)

### Mass Assignment Audit Results

**Complete scan of all 19 controllers — only 4 issues found:**

| File | Line | Issue | Risk |
|------|------|-------|------|
| `remuneration.controller.ts` | 94 | `...req.body` spread before Zod validation | LOW (only `parseResult.data` used downstream, but fragile pattern) |
| `staff.controller.ts` | 170 | Raw `req.body` passed to service — validation in service layer, not controller | MEDIUM |
| `staff.controller.ts` | 72 | `req.body.roleId` destructured without Zod — manual null check only | LOW |
| `staff.controller.ts` | 127 | `req.body.reOnboard` destructured without Zod — no type validation | LOW |

All other controllers (15/19) follow the correct pattern: `schema.safeParse(req.body)` → error check → use `result.data`.

### AppError Details Leakage Audit Results

**4 instances expose internal error messages to clients:**

| File | Line | Leaked Data | Fix |
|------|------|-------------|-----|
| `id-card.service.ts` | 59 | PDFKit `err.message` (may contain file paths, memory info) | Log error, remove `details` |
| `id-card.service.ts` | 265 | PDFKit `err.message` | Log error, remove `details` |
| `export.service.ts` | 95 | PDF generation `err.message` | Log error, remove `details` |
| `photo-processing.service.ts` | 173 | S3/storage `err.message` (may contain bucket names, key paths, AWS errors) | Log error, remove `details` |

**60+ other AppError instances are safe** — they either have no `details` field, or `details` contains only Zod validation errors (field names + expected types — safe for client consumption).

### The `AppError.details` Pattern
- **Class definition:** `packages/utils/src/errors.ts` — `details?: Record<string, any>` (untyped)
- **Error handler:** `app.ts:96-103` — serializes `err.details` directly into JSON response with no filtering
- **Safe usage:** Zod validation errors (`{ errors: result.error.errors }`) are fine — they contain field names and expected types
- **Unsafe usage:** Internal `err.message` from libraries (PDFKit, AWS SDK, Sharp) — these may contain file system paths, internal state, or library-specific diagnostics
- **Rule going forward:** Only put Zod validation errors or explicitly user-safe data in `AppError.details`. Never put raw caught `err.message` — log it server-side instead.

### CORS_ORIGIN Configuration
- **Current `requiredProdVars`:** `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `DATABASE_URL`, `HCAPTCHA_SECRET_KEY`
- **CORS fallback:** `process.env.CORS_ORIGIN || 'http://localhost:5173'` — secure default (fails closed) but causes silent production breakage
- **Adding `CORS_ORIGIN`** to the array ensures production startup fails fast with a clear error message if it's missing
- **VPS has it set:** The production `.env` on the VPS already has `CORS_ORIGIN=https://oyotradeministry.com.ng` — this change just adds a safety net

### Additional Finding: `audit.controller.ts` uses `.parse()` instead of `.safeParse()`
- Line 28: `verifyQuerySchema.parse(req.query)` — the ONLY controller using `.parse()`
- All other controllers use `.safeParse()` with explicit error handling
- `.parse()` throws a raw `ZodError` which the global error handler catches as a generic error → returns 500 INTERNAL_ERROR instead of 400 VALIDATION_ERROR
- Fix: Convert to `.safeParse()` with the standard `AppError('VALIDATION_ERROR', ...)` pattern

### Zod Validation Patterns (Context for Consistency)
- **Dominant pattern:** `const result = schema.safeParse(req.body); if (!result.success) throw new AppError('VALIDATION_ERROR', '...', 400, { errors: result.error.flatten().fieldErrors }); // use result.data`
- **All schemas use Zod default strip mode** — unknown keys are silently removed from `result.data`. No `.strict()` mode is used anywhere. This means `result.data` is ALWAYS safe (only declared fields), even if `req.body` contains extra fields.
- **Schema location split:** Half in `@oslsr/types` (shared), half defined locally in controller files. Newer controllers define locally — follow this convention for new schemas.

### What NOT to Do
- Do NOT add `.strict()` to existing Zod schemas — this would reject requests with extra fields, potentially breaking clients that send unused fields
- Do NOT refactor ALL controllers to use a single validation middleware pattern — the story scope is targeted fixes only
- Do NOT add validation to GET-only endpoints or query params that use manual parsing — those are out of scope (several controllers parse query params manually; this is lower risk since query params are visible in URLs)
- Do NOT change `express.json()` body size limits — the Express default 100KB is adequate and changing it could break multipart handling
- Do NOT modify the `AppError` class itself — the fix is at the call sites, not the class definition

### Project Structure Notes
- **Controllers:** `apps/api/src/controllers/*.controller.ts` — 19 files
- **Services:** `apps/api/src/services/*.service.ts`
- **AppError class:** `packages/utils/src/errors.ts`
- **Shared schemas:** `packages/types/src/validation/*.ts`
- **Error handler:** `apps/api/src/app.ts` lines 96-112

### Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/controllers/remuneration.controller.ts` | Replace `...req.body` with explicit field extraction |
| `apps/api/src/controllers/staff.controller.ts` | Add Zod validation to `updateRole`, `reactivate`, `createManual` |
| `apps/api/src/controllers/audit.controller.ts` | Change `.parse()` to `.safeParse()` |
| `apps/api/src/services/id-card.service.ts` | Remove `details.error`, add pino logging |
| `apps/api/src/services/export.service.ts` | Remove `details.error`, add pino logging |
| `apps/api/src/services/photo-processing.service.ts` | Remove `details.error`, add pino logging |
| `apps/api/src/app.ts` | Add `CORS_ORIGIN` to `requiredProdVars` |

### Previous Story Intelligence (SEC-1, SEC-2)
- SEC-1 may modify `app.ts` (adding `pnpm.overrides` reference in package.json) — no conflict with this story's `app.ts` changes (different lines)
- SEC-2 modifies `app.ts` Helmet config (line 71) — this story modifies `requiredProdVars` (lines 31-36). No conflict if both are done — different sections of the file.
- SEC-2 may add a CSP report endpoint route — no conflict with this story's controller changes

### Git Intelligence (Recent Commits)
- `527bcc7` fix(web): dispute queue filters — most recent commit
- `1179bf9` feat: Story 6-6 dispute resolution queue — touched `remuneration.controller.ts` (the file we're fixing)
- `da95545` feat: Story 6-5 payment history — also touched `remuneration.controller.ts`
- The `...req.body` pattern in remuneration.controller.ts was introduced in Story 6-4 (`b89919d`) and carried forward

### References

- [Source: _bmad-output/planning-artifacts/security-audit-report-2026-03-01.md — SEC-3 Story Definition, Sections 3.1-3.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — NFR4.5 Input Validation & Sanitization]
- [Source: _bmad-output/project-context.md — "NEVER throw raw Error objects → Use AppError class"]
- [Source: packages/utils/src/errors.ts — AppError class definition]
- [Source: apps/api/src/app.ts:96-112 — Error handler serializes details to client]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Initial test run: 9 failures in `staff.controller.test.ts` — test mock data used non-UUID `roleId` values (e.g., `'new-role-id'`, `'some-role'`), incompatible with new Zod UUID validation. Fixed by using valid UUID constants in tests.
- `createManual` test for "invitation queued" was missing `phone` field required by `createStaffSchema`. Added `phone` to test data.

### Completion Notes List

- **Task 1:** Replaced `...req.body` spread in `remuneration.controller.ts:createBatch` with explicit extraction of all 8 schema fields (trancheName, trancheNumber, amount, staffIds, bankReference, description, lgaId, roleFilter). Safe JSON.parse for staffIds with try/catch (lets Zod reject malformed data).
- **Task 2:** Added controller-level Zod validation to 3 `staff.controller.ts` methods: `createManual` (uses `createStaffSchema` from `@oslsr/types`), `updateRole` (new local `updateRoleSchema` with UUID validation), `reactivate` (new local `reactivateSchema` with boolean default). All follow the standard `safeParse` → `AppError` → `result.data` pattern. Added test for invalid UUID roleId validation.
- **Task 3:** Sanitized 4 AppError instances that leaked internal `err.message` to clients. Added pino logger to `id-card.service.ts` (new import). All 4 now log errors server-side and throw AppError without `details`.
- **Task 4:** Converted `audit.controller.ts` from `.parse()` to `.safeParse()` with `AppError('VALIDATION_ERROR', ...)` wrapping. Added missing `AppError` import.
- **Task 5:** Added `'CORS_ORIGIN'` to `requiredProdVars` array in `app.ts`. Production will now fail fast with clear error if CORS_ORIGIN is not set.
- **Task 6:** Verified 0 `...req.body` matches across all controllers and services.
- **Task 7:** Full regression: 1164 API + 1939 web = 3103 tests pass. Build succeeds.

### Change Log

- 2026-03-01: Implemented SEC-3 security hardening — mass assignment prevention, input validation, error detail sanitization, CORS env validation. 7 files modified, 1 test file updated. 3103 tests pass, 0 regressions.
- 2026-03-01: [Code Review] Fixed 6 issues (4 MEDIUM, 2 LOW): added reactivate endpoint tests (6 tests), strengthened audit controller test assertions (VALIDATION_ERROR + 400), fixed fragile number coercion, sanitized healthCheck error leak, corrected AC1 field names.

### File List

- `apps/api/src/controllers/remuneration.controller.ts` — Replaced `...req.body` spread with explicit field extraction
- `apps/api/src/controllers/staff.controller.ts` — Added Zod validation to `updateRole`, `reactivate`, `createManual`; added `z`, `createStaffSchema` imports and local schemas
- `apps/api/src/controllers/audit.controller.ts` — Changed `.parse()` to `.safeParse()` with AppError wrapping; added `AppError` import
- `apps/api/src/services/id-card.service.ts` — Removed `details.error` from 2 AppError instances; added pino logger
- `apps/api/src/services/export.service.ts` — Removed `details.error` from AppError in PDF error handler
- `apps/api/src/services/photo-processing.service.ts` — Removed `details.error` from AppError in S3 fetch error handler
- `apps/api/src/app.ts` — Added `'CORS_ORIGIN'` to `requiredProdVars` array
- `apps/api/src/controllers/__tests__/staff.controller.test.ts` — Updated test data: valid UUID roleId constants, added phone field, added UUID validation test; [Review] added 6 reactivate endpoint tests
- `apps/api/src/controllers/__tests__/audit.controller.test.ts` — [Review] Strengthened validation error assertions: verify VALIDATION_ERROR code + 400 status

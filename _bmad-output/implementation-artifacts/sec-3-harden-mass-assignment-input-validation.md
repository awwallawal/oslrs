# Story sec.3: Harden Mass Assignment & Input Validation

Status: ready-for-dev

<!-- Source: security-audit-report-2026-03-01.md — SEC-3 (P2 MEDIUM) -->
<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to replace `...req.body` spread patterns with explicit field extraction and harden input validation across all controllers,
so that the codebase is resilient against mass assignment even if Zod schemas change, and internal error details are never exposed to clients.

## Acceptance Criteria

1. **AC1:** The `...req.body` spread in `remuneration.controller.ts:94` is refactored to explicitly extract only the expected fields (`title`, `description`, `trancheNumber`, `amount`, `staffIds`, `paymentDate`) before Zod validation.

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

- [ ] **Task 1: Refactor `remuneration.controller.ts` mass assignment** (AC: #1, #4)
  - [ ] 1.1 Open `apps/api/src/controllers/remuneration.controller.ts` — lines 92-102
  - [ ] 1.2 Replace `...req.body` spread with explicit field extraction:
    ```typescript
    // Safe JSON.parse — let Zod produce a clean 400 instead of unhandled 500
    let staffIds = req.body.staffIds;
    if (typeof staffIds === 'string') {
      try { staffIds = JSON.parse(staffIds); } catch { /* let Zod reject it */ }
    }
    const body = {
      title: req.body.title,
      description: req.body.description,
      trancheNumber: req.body.trancheNumber ? Number(req.body.trancheNumber) : undefined,
      amount: req.body.amount ? Number(req.body.amount) : undefined,
      paymentDate: req.body.paymentDate,
      staffIds,
    };
    ```
  - [ ] 1.3 Verify the `createPaymentBatchSchema` fields match the extracted fields (check the schema definition — it's local in the same file, lines ~16-78)
  - [ ] 1.4 Run remuneration tests to verify no regressions

- [ ] **Task 2: Add Zod validation to `staff.controller.ts` unvalidated routes** (AC: #2, #3)
  - [ ] 2.1 `createManual` (line 170): Import `createStaffSchema` from `@oslsr/types`, add `safeParse(req.body)` with error handling, pass `parseResult.data` instead of `req.body` to `StaffService.createManual()`
  - [ ] 2.2 `updateRole` (line 72): Create a small Zod schema (`z.object({ roleId: z.string().uuid() })`) and use `safeParse(req.body)` instead of direct destructuring with manual null check
  - [ ] 2.3 `reactivate` (line 127): Create a small Zod schema (`z.object({ reOnboard: z.boolean().optional().default(false) })`) and use `safeParse(req.body)` instead of direct destructuring
  - [ ] 2.4 Follow the existing controller pattern: `safeParse` → check `!result.success` → throw `AppError('VALIDATION_ERROR', ..., 400, { errors: ... })` → use `result.data`
  - [ ] 2.5 Define the new schemas locally in `staff.controller.ts` (consistent with how newer controllers like remuneration and productivity define schemas locally)
  - [ ] 2.6 Run staff controller tests to verify no regressions

- [ ] **Task 3: Sanitize AppError `details` fields that leak internal errors** (AC: #6)
  - [ ] 3.1 `apps/api/src/services/id-card.service.ts:59`:
    - Change: `new AppError('PDF_GENERATION_ERROR', 'Failed to generate ID card PDF', 500, { error: err.message })`
    - To: Log `err` at error level with pino, then `new AppError('PDF_GENERATION_ERROR', 'Failed to generate ID card PDF', 500)` (no details)
  - [ ] 3.2 `apps/api/src/services/id-card.service.ts:265`: Same fix as 3.1
  - [ ] 3.3 `apps/api/src/services/export.service.ts:95`:
    - Change: `new AppError('PDF_GENERATION_ERROR', 'Failed to generate PDF report', 500, { error: (err as Error).message })`
    - To: Log the error, return AppError without details
  - [ ] 3.4 `apps/api/src/services/photo-processing.service.ts:173`:
    - Change: `new AppError('IMAGE_FETCH_ERROR', 'Failed to fetch image from storage', 500, { error: err instanceof Error ? err.message : 'Unknown error' })`
    - To: Log the full error (includes S3 bucket names, key paths, AWS errors), return AppError without details
  - [ ] 3.5 **Pattern for all fixes:** Import pino logger, log `{ event: 'service.error', code: 'PDF_GENERATION_ERROR', error: err }` at error level, then throw AppError with only code + message + statusCode (no `details`)
  - [ ] 3.6 Run id-card, export, and photo-processing tests to verify

- [ ] **Task 4: Fix `audit.controller.ts` `.parse()` → `.safeParse()`** (AC: #7)
  - [ ] 4.1 Open `apps/api/src/controllers/audit.controller.ts:28`
  - [ ] 4.2 Change `verifyQuerySchema.parse(req.query)` to `verifyQuerySchema.safeParse(req.query)` with the standard error pattern
  - [ ] 4.3 This prevents a raw ZodError from reaching the global error handler (which would produce a 500 INTERNAL_ERROR instead of a 400 VALIDATION_ERROR)
  - [ ] 4.4 Run audit tests to verify

- [ ] **Task 5: Add `CORS_ORIGIN` to `requiredProdVars`** (AC: #5)
  - [ ] 5.1 Open `apps/api/src/app.ts` — lines 31-36
  - [ ] 5.2 Add `'CORS_ORIGIN'` to the `requiredProdVars` array
  - [ ] 5.3 Current array: `['JWT_SECRET', 'REFRESH_TOKEN_SECRET', 'DATABASE_URL', 'HCAPTCHA_SECRET_KEY']`
  - [ ] 5.4 New array: `['JWT_SECRET', 'REFRESH_TOKEN_SECRET', 'DATABASE_URL', 'HCAPTCHA_SECRET_KEY', 'CORS_ORIGIN']`
  - [ ] 5.5 Verify the env validation logic at startup (lines 37-42) will correctly fail if `CORS_ORIGIN` is missing in production

- [ ] **Task 6: Verify no `...req.body` patterns remain** (AC: #4)
  - [ ] 6.1 Run grep across all controllers: `grep -r "\.\.\.req\.body" apps/api/src/controllers/` — must return zero matches
  - [ ] 6.2 Also check services for any remaining `...req.body` patterns (none expected, but confirm)

- [ ] **Task 7: Full regression test** (AC: #8)
  - [ ] 7.1 Run `pnpm test` from project root — all tests must pass
  - [ ] 7.2 Run `pnpm build` to verify TypeScript compilation succeeds

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

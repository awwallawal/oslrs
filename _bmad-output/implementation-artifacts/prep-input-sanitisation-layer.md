# Prep Task: prep-input-sanitisation-layer

Status: ready-for-dev

<!--
Created 2026-04-25 by impostor-SM agent per SCP-2026-04-22 §A.5.

Standalone prep task — same shape as previous prep tasks (`prep-typescript-strict-mode`, `prep-test-baseline-stabilisation`). NOT part of any epic; consumed by every input-boundary service.

Sources:
  • PRD V8.3 Technical Assumptions §"Identity, Access & Data Sharing" — input normalisation flagged for ITF-SUPA hygiene
  • UX Form Pattern: Email-Typo Detection (Sally A.3) — frontend layer
  • SCP §4.1 prep-input-sanitisation-layer scope
  • Epics.md §Prep Task: prep-input-sanitisation-layer (line 2521)

FRC item #4 — field-survey-blocking until done.

Validation pass 2026-04-29 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template; 3 factual codebase errors corrected (staff-provisioning.service.ts → staff.service.ts; validate.ts middleware created as new deliverable per Awwal directive M2; metadata JSONB column added to respondents migration following established pattern at audit.ts:11 / fraud-detections.ts:69-73 / questionnaires.ts:65 / submissions.ts:58); AC#4 + AC#5 reframed from "wired into 11-2 / 9-12" to "documented for downstream consumption" (those stories don't exist yet — wiring happens at their impl time, not here).
-->

## Story

As a **Developer building input boundaries (submission ingest, secondary-data import, public registration, staff provisioning)**,
I want **centralised normalisation utilities for email, Nigerian phone E.164, full-name casing, date parsing, and trade vocabulary that I can wire into every input boundary**,
so that **the field survey does not surface ITF-SUPA-style data hygiene problems (email typos like `gmail.vom`, inconsistent phone formats `0801234567` vs `+2348012345678`, name-casing drift `john doe` vs `JOHN DOE`, date-format ambiguity `01/02/2026` interpreted as DD/MM vs MM/DD)**.

## Acceptance Criteria

1. **AC#1 — Normalisation library structure:** New directory `apps/api/src/lib/normalise/` with five modules:
   - `email.ts` — exports `normaliseEmail(input: string): { value: string; warnings: string[] }`. Lowercase + trim; warn on common typos (`gmail.vom`, `gmial.com`, etc.) using a published dictionary (`mailcheck` library or curated subset).
   - `phone.ts` — exports `normaliseNigerianPhone(input: string): { value: string; warnings: string[] }`. Accepts inputs like `0801234567`, `+2348012345678`, `234 801 234 5678`, `08012345678` (with spaces). Returns canonical E.164: `+2348012345678`. Warn on ambiguous cases (e.g. 10-digit input that doesn't fit Nigerian format).
   - `name.ts` — exports `normaliseFullName(input: string): { value: string; warnings: string[] }`. Trim, collapse whitespace, title case (`john doe` → `John Doe`). Preserve compound surnames (`Adeyemi-Bolade`). Warn on suspicious patterns (all-caps, single-word names).
   - `date.ts` — exports `normaliseDate(input: string, format: 'DMY' | 'MDY' | 'YMD' | 'auto'): { value: Date; warnings: string[] }`. Defaults to DMY (Nigerian convention). On `auto`, infers from context (year >31 = YMD, year <=12 + day >12 = DMY, etc.). Warn on ambiguous inputs.
   - `trade.ts` — exports `normaliseTrade(input: string): { value: string; warnings: string[] }`. Maps free-text trade names to canonical vocabulary (e.g. `Plumbing`, `Plumber`, `plumbing services` → `Plumber`). Uses a vocabulary table seeded from existing canonical trades. Warn on unmappable inputs (preserved verbatim with `[unmapped]` flag).

2. **AC#2 — Shared zod schemas + centralised validate middleware:**
   - New file `packages/types/src/normalised.ts` exports zod schemas using the normalisers above. Example:
     ```typescript
     export const NormalisedEmailSchema = z.string().transform((val) => normaliseEmail(val).value).pipe(z.string().email());
     export const NigerianPhoneSchema = z.string().transform((val) => normaliseNigerianPhone(val).value).pipe(z.string().regex(/^\+234\d{10}$/));
     ```
     Re-exported from `packages/types/src/index.ts`.
   - New file `apps/api/src/middleware/validate.ts` — centralised request-validation middleware factory. Signature:
     ```typescript
     export const validate = <T>(schema: z.ZodSchema<T>, source: 'body' | 'query' | 'params' = 'body') =>
       (req, res, next) => { /* safeParse + throw AppError('VALIDATION_ERROR', ..., 400, { errors }) on failure; attach parsed value to req[source] on success */ };
     ```
   - **Migration scope guard:** This story does NOT migrate the 30+ existing inline `safeParse()` controllers (e.g. `auth.controller.ts:119` pattern) to use the new middleware. Existing inline pattern stays as-is. The middleware exists for new endpoints (AC#3 wiring + future) and for opt-in migration in unrelated stories. Migrating all existing endpoints would 5x the scope of this prep task.
   - Consumed by: new endpoints added in AC#3 wiring + Story 11-2 import endpoints (AC#4 forward) + Story 9-12 wizard endpoints (AC#5 forward) + `apps/web/src/features/*/api/*.ts` client-side validation.

3. **AC#3 — Wired into Submission ingest:**
   - `apps/api/src/services/submission-processing.service.ts` `findOrCreateRespondent()` (line 310) calls the normalisers on incoming `email`, `phone`, `firstName + lastName`, `dateOfBirth` fields before the dedupe check + DB insert.
   - Warnings are captured in the `respondents.metadata` JSONB column for audit trail; non-blocking (warnings do not reject the submission). Read pattern: `respondent.metadata ?? {}`; write pattern: merge `{ ...existingMetadata, normalisation_warnings: warnings }` and update.
   - **Schema migration**: This story adds `metadata jsonb('metadata')` (nullable, no default — matches established pattern at `audit.ts:11`, `fraud-detections.ts:69-73`, `questionnaires.ts:65`, `submissions.ts:58`) to the `respondents` table.

4. **AC#4 — Documented for Story 11-2 Import Service consumption** (forward commitment, not wiring):
   - This story does NOT wire into Story 11-2 (which doesn't exist yet at impl time of this prep task — Wave 2 stories ship later).
   - Deliverable: `apps/api/src/lib/normalise/README.md` documents the API surface (one section per module) so Story 11-2 can consume cleanly.
   - Story 11-2's task list explicitly references this prep task; its dev agent reads the README and wires the normalisers into the parser layer at 11-2 impl time.

5. **AC#5 — Documented for Story 9-12 Public Wizard consumption** (forward commitment, not wiring):
   - This story does NOT wire into Story 9-12 (Wave 2; doesn't exist yet at impl time of this prep).
   - Deliverable: zod schemas (`NormalisedEmailSchema`, `NigerianPhoneSchema`, etc.) exported from `packages/types/src/normalised.ts` and re-exported from `packages/types/src/index.ts`. Story 9-12's wizard validation layer imports + wires these at its impl time.
   - Server-side validation only at this layer; the frontend Email-Typo Detection per Sally's Form Pattern (UX Form Pattern A.3) is a separate UX layer that surfaces warnings to the user in real time — Story 9-12 implements that piece.

6. **AC#6 — Wired into Staff Provisioning:** `apps/api/src/services/staff.service.ts` Bulk CSV Import + Manual Single-User Creation use the normalisers on incoming `email`, `phone`, `fullName` fields.

7. **AC#7 — Schema strengthening migration:**
   - `respondents.date_of_birth TEXT → DATE` migration
   - `respondents.phone CHECK (phone ~ '^\+234\d{10}$' OR phone IS NULL)` constraint
   - `respondents` ADD COLUMN `metadata JSONB` (nullable; per AC#3)
   - Drizzle migration includes back-fill script: existing `respondents` rows with non-canonical phone format are normalised in-place; existing `date_of_birth` values are parsed as DMY and converted; rows that fail normalisation are flagged with `metadata.backfill_failed = true` and surface in a `pnpm --filter @oslsr/api report:backfill-failures` command for manual review

8. **AC#8 — Back-fill script idempotent + dry-run mode:**
   - `apps/api/src/scripts/backfill-input-sanitisation.ts`
   - `--dry-run` flag prints what would change without writing
   - Idempotent: running twice produces same result
   - Audit-logged: every back-filled row gets an `audit_logs` entry via `AuditService.logAction({ action: 'respondent.backfilled_normalisation', details: { field, old_value_hash, new_value_hash } })` (hash, not plaintext, to avoid PII leakage in audit log for normalisation operations)

9. **AC#9 — Tests:**
   - Unit tests per normaliser module: edge cases for email typos, phone format variants, name casing edge cases (compound surnames, single-word names), date format ambiguity, trade vocabulary mapping
   - Integration tests: submission ingest with non-canonical inputs ends up with canonical values + warnings in `respondents.metadata.normalisation_warnings`
   - Migration test: schema strengthening migration succeeds against a seeded DB with mixed-format data
   - Back-fill script test: dry-run does not write; full run is idempotent
   - validate.ts middleware test: schema-validation success path attaches parsed value; failure path throws `AppError('VALIDATION_ERROR', ..., 400)`
   - Existing 4,191-test baseline maintained or grown (+ ~30 new tests expected)

10. **AC#10 — Field Readiness Certificate item #4 satisfied:** When all above ACs pass + schema migration applied to production + back-fill script run successfully + zero `backfill_failed` flagged rows (or all flagged rows manually resolved), flip FRC item #4 status in `epics.md` from `⏳ Backlog → ✅ Done <date>`.

## Tasks / Subtasks

- [ ] **Task 1 — Normalisation library** (AC: #1)
  - [ ] 1.1 Create `apps/api/src/lib/normalise/email.ts` with `normaliseEmail` + `mailcheck`-style typo dictionary
  - [ ] 1.2 Create `apps/api/src/lib/normalise/phone.ts` with `normaliseNigerianPhone` + E.164 format conversion
  - [ ] 1.3 Create `apps/api/src/lib/normalise/name.ts` with `normaliseFullName` + title case + compound-surname preservation
  - [ ] 1.4 Create `apps/api/src/lib/normalise/date.ts` with `normaliseDate` + DMY default + ambiguity warnings
  - [ ] 1.5 Create `apps/api/src/lib/normalise/trade.ts` with `normaliseTrade` + vocabulary table lookup
  - [ ] 1.6 Each module: unit tests in `__tests__/` subfolder
  - [ ] 1.7 Create `apps/api/src/lib/normalise/typo-dictionary.json` (config, not code — read at startup)
  - [ ] 1.8 Create `apps/api/src/lib/normalise/README.md` documenting the API surface (per AC#4, forward-consumer hand-off doc)

- [ ] **Task 2 — Shared zod schemas + centralised validate middleware** (AC: #2)
  - [ ] 2.1 Create `packages/types/src/normalised.ts` with `NormalisedEmailSchema`, `NigerianPhoneSchema`, `NormalisedNameSchema`, `NormalisedDateSchema`, `NormalisedTradeSchema`
  - [ ] 2.2 Re-export from `packages/types/src/index.ts`
  - [ ] 2.3 **Reminder:** schema files in `apps/api/src/db/schema/*` MUST NOT import from `@oslsr/types` (drizzle-kit constraint per MEMORY.md). Inline normaliser logic in schema files where needed; the shared zod schemas in `packages/types` are for non-schema validation only.
  - [ ] 2.4 Create `apps/api/src/middleware/validate.ts` with `validate(schema, source)` middleware factory. Signature per AC#2; throws `AppError('VALIDATION_ERROR', 'Invalid <source> data', 400, { errors })` on failure (matches existing pattern at `auth.controller.ts:119-122`).
  - [ ] 2.5 **DO NOT migrate existing inline `safeParse()` controllers** in this story — that's a separate refactor with 30+ touchpoints. Middleware exists for new endpoints + opt-in future migration.

- [ ] **Task 3 — Wire normalisers into existing input boundaries** (AC: #3, #6)
  - [ ] 3.1 `apps/api/src/services/submission-processing.service.ts` `findOrCreateRespondent` (line 310) — call normalisers on `email`, `phone`, `firstName + lastName`, `dateOfBirth`; capture warnings via merge into `respondents.metadata` JSONB column (`{ ...existing, normalisation_warnings: warnings }`)
  - [ ] 3.2 `apps/api/src/services/staff.service.ts` — call normalisers in Bulk CSV Import + Manual Single-User Creation. **Note:** the file is `staff.service.ts` (not `staff-provisioning.service.ts` — that file does not exist).
  - [ ] 3.3 Tests: integration tests at each boundary (per AC#9)

- [ ] **Task 4 — Schema strengthening migration** (AC: #7)
  - [ ] 4.1 Drizzle schema edit: `apps/api/src/db/schema/respondents.ts` — add `metadata: jsonb('metadata')` (nullable, no default). Pattern reference: `apps/api/src/db/schema/audit.ts:11` (`details: jsonb('details')`).
  - [ ] 4.2 Drizzle migration: `respondents.date_of_birth TEXT → DATE`
  - [ ] 4.3 Drizzle migration: `respondents.phone` CHECK constraint per AC#7
  - [ ] 4.4 Drizzle migration: `respondents` ADD COLUMN `metadata JSONB` (nullable)
  - [ ] 4.5 Migration file location: `apps/api/drizzle/<NNNN>_<descriptive_name>.sql` — sequential 4-digit prefix; confirm at impl time via `ls apps/api/drizzle/`. Current latest as of 2026-04-29 is `0007_audit_logs_immutable.sql`; this story may claim `0008`/`0009`/`0010` depending on Story 9-13 + Story 11-1 commit ordering. **Path `apps/api/src/db/migrations/` does NOT exist** — do not be confused.
  - [ ] 4.6 Migration includes back-fill: see Task 5
  - [ ] 4.7 Test on scratch DB with mixed-format data (use Story 11-1 seeder + manually inject some non-canonical values)

- [ ] **Task 5 — Back-fill script** (AC: #8)
  - [ ] 5.1 Create `apps/api/src/scripts/backfill-input-sanitisation.ts`
  - [ ] 5.2 `--dry-run` flag (prints what would change without writing)
  - [ ] 5.3 Idempotent processing
  - [ ] 5.4 Audit-logged via `AuditService.logAction()` (`apps/api/src/services/audit.service.ts:226`) with hashed values (not plaintext PII). Add `RESPONDENT_BACKFILLED_NORMALISATION: 'respondent.backfilled_normalisation'` to `AUDIT_ACTIONS` const at `audit.service.ts:35-64`.
  - [ ] 5.5 Create `apps/api/src/scripts/report-backfill-failures.ts` companion script for manual review of `metadata.backfill_failed = true` rows. Add to `apps/api/package.json` scripts as `report:backfill-failures`.
  - [ ] 5.6 Tests: dry-run / idempotent / failure-flag handling

- [ ] **Task 6 — Documentation hand-off prep** (AC: #4, #5)
  - [ ] 6.1 Document the normaliser API surface in `apps/api/src/lib/normalise/README.md` (also Task 1.8) — covers Story 11-2 (Import Service) and Story 9-12 (Public Wizard) consumption patterns
  - [ ] 6.2 Examples + edge case documentation
  - [ ] 6.3 Cross-reference from Story 11-2 task list (when 11-2 is implemented) and Story 9-12 task list (when 9-12 is implemented) to this README

- [ ] **Task 7 — Tests + sprint-status + FRC flip** (AC: #9, #10)
  - [ ] 7.1 Run full test suite — verify baseline 4,191 + new tests
  - [ ] 7.2 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `prep-input-sanitisation-layer` from `ready-for-dev` → `in-progress` → `review` → `done`
  - [ ] 7.3 On merge + back-fill complete + zero unresolved failures: flip FRC item #4 in `_bmad-output/planning-artifacts/epics.md` from `⏳ Backlog → ✅ Done <date>`

- [ ] **Task 8 — Code review** (cross-cutting AC: all)
  - [ ] 8.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree (per the existing "code review before commit" project pattern in MEMORY.md `feedback_review_before_commit.md`)
  - [ ] 8.2 Auto-fix all High/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI)
  - [ ] 8.3 Only after code review passes, commit and mark status `review`

## Dev Notes

### Dependencies

- **No story dependencies** — independent / parallelisable
- **Story 11-2 depends on this** — Import Service uses these normalisers (per AC#4 + Story 11-2 task list)
- **Story 9-12 consumes these** — wizard validation layer (per AC#5)

### Field Readiness Certificate Impact

**FRC item #4** (`prep-input-sanitisation-layer` merged) — this prep task IS that item. **Field-survey-blocking until done.**

### Why a prep task vs a Story

Prep tasks are infrastructure deliverables consumed by multiple stories. They ship with no user-visible feature change but unlock downstream stories. This task is consumed by Story 11-2 (Import Service), Story 9-12 (Public Wizard), Submission ingest (Epic 3), and Staff Provisioning (Epic 1). Treating it as part of any one of those stories would couple them artificially.

### Why DMY default for `normaliseDate`

Nigerian convention is DMY (per Nigerian standards body). UK convention also DMY. US convention MDY. Without explicit format hint, default to DMY since the user base is Nigerian. The `auto` mode is for cases where the source is unknown (e.g. ITF-SUPA imports may have either format).

### Trade vocabulary scope

The trade vocabulary table is **seeded from existing canonical trades** in the `respondents` table — i.e. we extract `SELECT DISTINCT trade FROM respondents` first, normalise the dominant casing as canonical, and use that as the seed. Future trades flagged as `[unmapped]` accumulate; periodic curation (super-admin task, not automated) folds them into canonical or marks as duplicates.

**Out of scope:** auto-correction with UX suggestion (that's UX work — separate Sally + frontend story). This task only normalises server-side.

### Why hashed values in back-fill audit log

The back-fill operation touches PII fields (email, phone, name) in millions of rows. Logging plaintext old/new values would create a massive PII footprint in `audit_logs`. Hashing (SHA-256) preserves the audit trail (who changed what) without re-introducing PII. If forensic recovery of old values is needed, the pre-migration DB snapshot is the source.

### Why JSONB metadata column matches established pattern

Adding `metadata: jsonb('metadata')` to respondents follows the codebase's established JSONB convention. Eight existing JSONB columns across the schema:
- `apps/api/src/db/schema/audit.ts:11` — `details: jsonb('details')` (audit metadata)
- `apps/api/src/db/schema/fraud-detections.ts:69-73` — 5 columns: `gpsDetails`, `speedDetails`, `straightlineDetails`, `duplicateDetails`, `timingDetails` (heuristic-specific data)
- `apps/api/src/db/schema/questionnaires.ts:65` — `formSchema: jsonb('form_schema')` (native form schemas)
- `apps/api/src/db/schema/submissions.ts:58` — `rawData: jsonb('raw_data')` (ODK raw payloads)

All nullable, none with `.default()`. Read pattern: `respondent.metadata ?? {}`; write pattern: merge object, then update. New `metadata` column inherits this convention exactly.

### Why centralised validate middleware does NOT migrate existing inline patterns

The `apps/api/src/middleware/validate.ts` middleware is a forward-looking helper: new endpoints added by this story (and future) use it; existing inline `safeParse()` controllers (e.g. `auth.controller.ts:119-122` pattern, repeated ~30 times across controllers) stay as-is. Migrating all existing endpoints would:
- 5x the touchpoint count of this prep task
- Risk regressions on auth-critical endpoints
- Conflate prep-input scope (normalisation) with controller-pattern refactor

The middleware exists. Future stories can opt in. A separate "prep-validate-middleware-migration" task can be filed if/when the inline pattern starts hurting maintenance.

### Story 11-2 is the largest consumer

Story 11-2 (Import Service + Parsers) parses ITF-SUPA PDF and similar sources. The PDF has rampant data hygiene issues — emails like `gmail.vom`, phones in 5+ formats, names in mixed casing. Without this prep task, every Import Service line would need its own normalisation logic — leading to drift. With this prep task, one normalisation pass at parser output guarantees canonical data hits the DB.

### Risks

1. **Back-fill on production may fail on edge cases.** Some real respondents may have unusual inputs that the normalisers reject. Mitigation: AC#7 + AC#8 capture failed rows as `metadata.backfill_failed = true` for manual review; back-fill never blocks the migration.
2. **Trade vocabulary may bloat.** Free-text trades from public registration could flood the `[unmapped]` list. Mitigation: periodic curation; eventual UX suggestion layer (out of scope here).
3. **Email typo dictionary may evolve.** New Nigerian-specific typos will surface in field. Mitigation: dictionary is a config (not code), surfaced via `apps/api/src/lib/normalise/typo-dictionary.json`; updates do not require deploys (read at startup).
4. **DMY default may cause silent corruption.** A user submitting `01/02/2026` intending Feb 1 (MDY) gets converted to Jan 2 (DMY). Mitigation: normaliseDate emits a warning when the input is ambiguous (`day <= 12 && month <= 12`); surfaced to admin via `audit_logs`; UI can prompt.
5. **Phone E.164 conversion edge cases.** Inputs like `070...` (7-prefix mobile) vs `080...` need different conversion logic. Mitigation: comprehensive unit tests covering all 4 Nigerian mobile prefixes (070, 080, 081, 090, 091); reject inputs that don't fit known prefixes with a warning.
6. **`validate.ts` middleware drift from inline pattern.** With both patterns coexisting (new middleware + 30+ existing inline `safeParse()`), error response shape may drift. Mitigation: `validate.ts` middleware throws the IDENTICAL `AppError('VALIDATION_ERROR', ..., 400, { errors })` shape as the inline pattern — no client-side change required. Test asserts shape equivalence.

### Project Structure Notes

- **Normaliser library** at `apps/api/src/lib/normalise/<module>.ts` + `__tests__/` subfolder per module. Five modules total: email, phone, name, date, trade. Plus `typo-dictionary.json` (config) and `README.md` (API surface for downstream consumers).
- **Shared zod schemas** at `packages/types/src/normalised.ts`, re-exported from `packages/types/src/index.ts`. **Drizzle constraint:** `apps/api/src/db/schema/*.ts` files MUST NOT import from `@oslsr/types` (drizzle-kit runs compiled JS; `@oslsr/types` has no `dist/`). Schema files use the underlying normaliser fns directly if needed; the zod schemas in `packages/types` are for application-layer validation only.
- **Validate middleware** at `apps/api/src/middleware/validate.ts` (NEW file). Existing middleware directory pattern: 1-purpose-per-file (e.g. `login-rate-limit.ts`, `password-reset-rate-limit.ts`, `real-ip.ts`, `sensitive-action.ts`, `auth.ts`, `captcha.ts`). New file follows that convention.
- **Existing inline validation pattern** (NOT migrated by this story): controllers use `<schema>.safeParse(req.body)` then throw `AppError('VALIDATION_ERROR', ...)` inline (e.g. `apps/api/src/controllers/auth.controller.ts:119-122`). The new middleware preserves the EXACT same error shape so client code is unaffected.
- **Drizzle JSONB pattern** (the load-bearing precedent for AC#3 metadata column): nullable, no default, write-merged-object-on-update. Eight existing examples: `audit.ts:11`, `fraud-detections.ts:69-73` (×5), `questionnaires.ts:65`, `submissions.ts:58`. New `respondents.metadata` follows this exactly.
- **Drizzle migrations** at `apps/api/drizzle/<NNNN>_<name>.sql` (sequential 4-digit prefix). Latest as of 2026-04-29 is `0007_audit_logs_immutable.sql`. Story 9-13 (Wave 0) + Story 11-1 (Wave 1) + this story all queue migrations; whichever ships first claims `0008`, then `0009`, etc. Confirm at impl time via `ls apps/api/drizzle/`. **Path `apps/api/src/db/migrations/` does NOT exist.**
- **Audit logging API**: `AuditService.logAction({...})` (fire-and-forget, `audit.service.ts:226`) for non-transactional logging; `AuditService.logActionTx(tx, {...})` (`audit.service.ts:267`) within `db.transaction()`. New `AUDIT_ACTIONS.RESPONDENT_BACKFILLED_NORMALISATION` added to const at `audit.service.ts:35-64` for AC#8.
- **Service-file naming**: actual file is `apps/api/src/services/staff.service.ts` — there is no `staff-provisioning.service.ts` (story v1 referenced a fictional path; corrected throughout this retrofit).
- **Scripts directory**: `apps/api/src/scripts/<name>.ts`. New scripts: `backfill-input-sanitisation.ts` + `report-backfill-failures.ts`. Run via `pnpm --filter @oslsr/api tsx src/scripts/<name>.ts`.
- **AC#4 + AC#5 are forward-consumer hand-offs, not wiring.** Stories 11-2 (Wave 2) and 9-12 (Wave 2) do not exist as implementations at this prep task's impl time. Wiring happens IN those stories at THEIR impl time, consuming the README + zod schemas this story exports. AC#4 + AC#5 deliverables are documentation only.
- **NEW directories created by this story**:
  - `apps/api/src/lib/normalise/` (with `__tests__/` subfolder)
  - `apps/api/src/lib/normalise/__tests__/` (per-module unit tests)

### References

- Epics — Prep Task entry: [Source: _bmad-output/planning-artifacts/epics.md:2521]
- Drizzle JSONB pattern (audit details — load-bearing precedent for AC#3 metadata): [Source: apps/api/src/db/schema/audit.ts:1,11]
- Drizzle JSONB pattern (fraud detection details — 5 columns): [Source: apps/api/src/db/schema/fraud-detections.ts:13,69-73]
- Drizzle JSONB pattern (questionnaire form schema): [Source: apps/api/src/db/schema/questionnaires.ts:1,65]
- Drizzle JSONB pattern (submission raw data): [Source: apps/api/src/db/schema/submissions.ts:13,58]
- Respondents schema current state (no metadata column yet — this story adds it): [Source: apps/api/src/db/schema/respondents.ts:6-48]
- Submission processing — `findOrCreateRespondent` (modify per AC#3): [Source: apps/api/src/services/submission-processing.service.ts:310]
- Staff service (modify per AC#6 — actual file, NOT staff-provisioning.service.ts): [Source: apps/api/src/services/staff.service.ts]
- Existing inline validation pattern (canonical reference for `validate.ts` middleware error shape): [Source: apps/api/src/controllers/auth.controller.ts:119-122]
- Audit service `logAction` API (AC#8 audit pattern): [Source: apps/api/src/services/audit.service.ts:226]
- Audit service `AUDIT_ACTIONS` const (extend with RESPONDENT_BACKFILLED_NORMALISATION): [Source: apps/api/src/services/audit.service.ts:35-64]
- Existing middleware directory layout (1-purpose-per-file convention): [Source: apps/api/src/middleware/login-rate-limit.ts, real-ip.ts, sensitive-action.ts, etc.]
- Drizzle migration directory + naming convention: [Source: apps/api/drizzle/0007_audit_logs_immutable.sql]
- Shared types barrel: [Source: packages/types/src/index.ts]
- Web feature API client pattern (AC#2 client-side validation consumers): [Source: apps/web/src/features/*/api/*.ts (24 files verified to exist)]
- MEMORY.md key pattern: drizzle schema files cannot import from `@oslsr/types`: [Source: MEMORY.md "Key Patterns"]
- MEMORY.md key pattern: code review before commit: [Source: MEMORY.md "Process Patterns" + `feedback_review_before_commit.md`]
- MEMORY.md feedback: db:push:force data-loss risk: [Source: MEMORY.md "Key Patterns" + `feedback_db_push_force.md`]

## Dev Agent Record

### Agent Model Used

_(Populated when prep task enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation. Implementer must include:)_

- Sequential migration number claimed (`0008`/`0009`/`0010` depending on Story 9-13 + Story 11-1 commit ordering)
- Back-fill dry-run output (sample of 100 rows showing planned changes)
- Back-fill production run output (rows changed, rows flagged `backfill_failed`)
- Manual review log of any flagged failure rows
- Code review findings + fixes (cross-reference Review Follow-ups (AI) below)

### File List

**Created:**
- `apps/api/src/lib/normalise/email.ts` + `__tests__/email.test.ts`
- `apps/api/src/lib/normalise/phone.ts` + `__tests__/phone.test.ts`
- `apps/api/src/lib/normalise/name.ts` + `__tests__/name.test.ts`
- `apps/api/src/lib/normalise/date.ts` + `__tests__/date.test.ts`
- `apps/api/src/lib/normalise/trade.ts` + `__tests__/trade.test.ts`
- `apps/api/src/lib/normalise/typo-dictionary.json`
- `apps/api/src/lib/normalise/README.md` (API surface for Story 11-2 / 9-12 consumption)
- `apps/api/src/middleware/validate.ts` (centralised validate middleware factory) + `__tests__/validate.test.ts`
- `packages/types/src/normalised.ts` (zod schemas)
- `apps/api/src/scripts/backfill-input-sanitisation.ts`
- `apps/api/src/scripts/report-backfill-failures.ts`
- `apps/api/drizzle/<NNNN>_*.sql` (new migration; sequential 4-digit prefix at impl time)

**Modified:**
- `packages/types/src/index.ts` — re-export `normalised.ts` schemas
- `apps/api/src/services/submission-processing.service.ts` — wire normalisers in `findOrCreateRespondent` (line 310); merge warnings into `respondents.metadata`
- `apps/api/src/services/staff.service.ts` — wire normalisers in Bulk CSV Import + Manual Single-User Creation (NOT staff-provisioning.service.ts — that file does not exist)
- `apps/api/src/db/schema/respondents.ts` — add `metadata: jsonb('metadata')` column; DOB type change
- `apps/api/src/services/audit.service.ts` — extend `AUDIT_ACTIONS` const with `RESPONDENT_BACKFILLED_NORMALISATION`
- `apps/api/package.json` — add scripts: `seed:projected-scale` (if not added by 11-1 first), `report:backfill-failures`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md` — FRC item #4 status flip on completion (Task 7.3)

**Out of scope (explicitly NOT modified):**
- 30+ existing controllers using inline `safeParse()` — migration to `validate.ts` middleware deferred to a separate prep task
- Story 11-2 / Story 9-12 wiring — happens at those stories' impl time, not here

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Prep task drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering normalisation library + zod schemas + wiring into 4 input boundaries + schema strengthening migration + idempotent back-fill script with hashed audit + tests + FRC flip. Independent / parallelisable. | FRC item #4 — field-survey-blocking. Without this layer, ITF-SUPA-style data hygiene issues would surface in field collection. Building it once before field is cheaper than retro-fitting after. |
| 2026-04-29 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: created `## Dev Notes` section (was entirely absent — top-level Dependencies / FRC Impact / Technical Notes / Risks all migrated under it); created `### Project Structure Notes` subsection covering normaliser library / shared types / validate middleware / JSONB pattern / migration directory / audit API / service-file naming corrections / new directories; created `### References` subsection with 16 verified `[Source: file:line]` cites including 4 JSONB pattern precedents (audit.ts:11, fraud-detections.ts:69-73, questionnaires.ts:65, submissions.ts:58). Moved top-level `## Change Log` under `## Dev Agent Record` as `### Change Log` subsection. Added `### Review Follow-ups (AI)` placeholder. Converted task headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks. **Three factual codebase fixes baked in throughout:** (a) `apps/api/src/services/staff-provisioning.service.ts` → `apps/api/src/services/staff.service.ts` (verified file path; the staff-provisioning version is fictional); (b) `respondents.metadata` JSONB column added to AC#3 + AC#7 + Task 4 (Awwal-confirmed JSONB pattern is established at audit.ts:11 / fraud-detections.ts:69-73 / questionnaires.ts:65 / submissions.ts:58 — 8 existing JSONB columns); (c) `apps/api/src/middleware/validate.ts` upgraded from "consumed by" reference to NEW deliverable per Awwal directive (AC#2 + Task 2.4) — centralised validate middleware factory with explicit migration scope guard preventing 5x scope creep on existing 30+ inline `safeParse()` controllers. **Two AC reframing fixes** (Awwal "make it better" M1): AC#4 + AC#5 changed from "wired into Story 11-2 / 9-12" to "documented for Story 11-2 / 9-12 consumption" — those Wave 2 stories don't exist at this prep task's impl time, so wiring happens at THEIR impl time consuming this story's README + zod schemas. Added Task 8 (code review) per `feedback_review_before_commit.md` cornerstone pattern. Added new audit action `RESPONDENT_BACKFILLED_NORMALISATION` to `AUDIT_ACTIONS` const callout. All substantive content from v1 preserved. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as Stories 9-13 / prep-tsc / prep-build-off-vps / 11-1. Three additional content-quality issues surfaced this pass (none seen in earlier retrofits): (1) `respondents.metadata` referenced by AC#3 but column doesn't exist and no migration adds it — gap closed via JSONB pattern alignment; (2) `staff-provisioning.service.ts` fictional file path — corrected to actual `staff.service.ts`; (3) AC#4 + AC#5 mis-framed as wiring into stories that don't exist yet — reframed as forward-consumer documentation deliverables. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 8.)_

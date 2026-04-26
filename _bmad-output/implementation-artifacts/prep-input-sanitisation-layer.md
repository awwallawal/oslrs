# Prep Task: prep-input-sanitisation-layer

Status: ready-for-dev

<!--
Created 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5.

Standalone prep task — same shape as previous prep tasks (`prep-typescript-strict-mode`, `prep-test-baseline-stabilisation`). NOT part of any epic; consumed by every input-boundary service.

Sources:
  • PRD V8.3 Technical Assumptions §"Identity, Access & Data Sharing" — input normalisation flagged for ITF-SUPA hygiene
  • UX Form Pattern: Email-Typo Detection (Sally A.3) — frontend layer
  • SCP §4.1 prep-input-sanitisation-layer scope
  • Epics.md §Prep Task: prep-input-sanitisation-layer

FRC item #4 — field-survey-blocking until done.
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

2. **AC#2 — Shared zod schemas:** New file `packages/types/src/normalised.ts` exports zod schemas using the normalisers above. Example:
   ```typescript
   export const NormalisedEmailSchema = z.string().transform((val) => normaliseEmail(val).value).pipe(z.string().email());
   export const NigerianPhoneSchema = z.string().transform((val) => normaliseNigerianPhone(val).value).pipe(z.string().regex(/^\+234\d{10}$/));
   ```
   Re-exported from `packages/types/src/index.ts`. Consumed by `apps/api/src/middleware/validate.ts` and `apps/web/src/features/*/api/*.ts`.

3. **AC#3 — Wired into Submission ingest:** `apps/api/src/services/submission-processing.service.ts` `findOrCreateRespondent()` calls the normalisers on incoming `email`, `phone`, `firstName + lastName`, `dateOfBirth` fields before the dedupe check + DB insert. Warnings are captured in the `respondent.metadata.normalisation_warnings` JSONB field for audit trail; non-blocking (warnings do not reject the submission).

4. **AC#4 — Wired into Story 11-2 Import Service:** When Story 11-2 ships, the Import Service uses the same normalisers. (Story 11-2's AC explicitly references this prep task as a dependency for the parser layer.)

5. **AC#5 — Wired into Story 9-12 Public Wizard:** The wizard's Step 2 (Contact + LGA) uses the same email + phone normalisers (server-side validation; the frontend Email-Typo Detection per Sally's Form Pattern is a separate UX layer that surfaces warnings to the user in real time).

6. **AC#6 — Wired into Staff Provisioning:** `apps/api/src/services/staff-provisioning.service.ts` Bulk CSV Import + Manual Single-User Creation use the normalisers on incoming `email`, `phone`, `fullName` fields.

7. **AC#7 — Schema strengthening migration:**
   - `respondents.date_of_birth TEXT → DATE` migration
   - `respondents.phone CHECK (phone ~ '^\+234\d{10}$' OR phone IS NULL)` constraint
   - Drizzle migration includes back-fill script: existing `respondents` rows with non-canonical phone format are normalised in-place; existing `date_of_birth` values are parsed as DMY and converted; rows that fail normalisation are flagged with `metadata.backfill_failed = true` and surface in a `pnpm --filter @oslsr/api report:backfill-failures` command for manual review

8. **AC#8 — Back-fill script idempotent + dry-run mode:**
   - `apps/api/src/scripts/backfill-input-sanitisation.ts`
   - `--dry-run` flag prints what would change without writing
   - Idempotent: running twice produces same result
   - Audit-logged: every back-filled row gets an `audit_logs` entry with `action: 'respondent.backfilled_normalisation'`, `meta: { field, old_value_hash, new_value_hash }` (hash, not plaintext, to avoid PII leakage in audit log for normalisation operations)

9. **AC#9 — Tests:**
   - Unit tests per normaliser module: edge cases for email typos, phone format variants, name casing edge cases (compound surnames, single-word names), date format ambiguity, trade vocabulary mapping
   - Integration tests: submission ingest with non-canonical inputs ends up with canonical values + warnings
   - Migration test: schema strengthening migration succeeds against a seeded DB with mixed-format data
   - Back-fill script test: dry-run does not write; full run is idempotent
   - Existing 4,191-test baseline maintained or grown (+ ~30 new tests expected)

10. **AC#10 — Field Readiness Certificate item #4 satisfied:** When all above ACs pass + schema migration applied to production + back-fill script run successfully + zero `backfill_failed` flagged rows (or all flagged rows manually resolved), flip FRC item #4 status in `epics.md` from `⏳ Backlog → ✅ Done <date>`.

## Dependencies

- **No story dependencies** — independent / parallelisable
- **Story 11-2 depends on this** — Import Service uses these normalisers (per AC#4 + Story 11-2 task list)
- **Story 9-12 consumes these** — wizard validation layer (per AC#5)

## Field Readiness Certificate Impact

**FRC item #4** (`prep-input-sanitisation-layer` merged) — this prep task IS that item. **Field-survey-blocking until done.**

## Tasks / Subtasks

### Task 1 — Normalisation library (AC#1)

1.1. Create `apps/api/src/lib/normalise/email.ts` with `normaliseEmail` + `mailcheck`-style typo dictionary
1.2. Create `apps/api/src/lib/normalise/phone.ts` with `normaliseNigerianPhone` + E.164 format conversion
1.3. Create `apps/api/src/lib/normalise/name.ts` with `normaliseFullName` + title case + compound-surname preservation
1.4. Create `apps/api/src/lib/normalise/date.ts` with `normaliseDate` + DMY default + ambiguity warnings
1.5. Create `apps/api/src/lib/normalise/trade.ts` with `normaliseTrade` + vocabulary table lookup
1.6. Each module: unit tests in `__tests__/` subfolder

### Task 2 — Shared zod schemas (AC#2)

2.1. Create `packages/types/src/normalised.ts` with NormalisedEmail, NigerianPhone, NormalisedName, NormalisedDate, NormalisedTrade schemas
2.2. Re-export from `packages/types/src/index.ts`
2.3. **Reminder:** schema files in `apps/api/src/db/schema/*` MUST NOT import from `@oslsr/types` (drizzle-kit constraint per MEMORY.md). Inline normaliser logic in schema files where needed; the shared zod schemas in `packages/types` are for non-schema validation only.

### Task 3 — Wire normalisers into existing input boundaries (AC#3, AC#5, AC#6)

3.1. `apps/api/src/services/submission-processing.service.ts` — call normalisers in `findOrCreateRespondent()`; capture warnings to `respondent.metadata.normalisation_warnings`
3.2. `apps/api/src/services/staff-provisioning.service.ts` — call normalisers in Bulk CSV Import + Manual Single-User Creation
3.3. Story 9-12 wizard validation layer — already covered by AC#2 zod schemas; verify wiring
3.4. Tests: integration tests at each boundary

### Task 4 — Schema strengthening migration (AC#7)

4.1. Drizzle migration: `respondents.date_of_birth TEXT → DATE`
4.2. Drizzle migration: `respondents.phone` CHECK constraint
4.3. Migration includes back-fill: see Task 5
4.4. Test on scratch DB with mixed-format data (use Story 11-1 seeder + manually inject some non-canonical values)

### Task 5 — Back-fill script (AC#8)

5.1. `apps/api/src/scripts/backfill-input-sanitisation.ts`
5.2. `--dry-run` flag
5.3. Idempotent processing
5.4. Audit-logged with hashed values (not plaintext PII)
5.5. `pnpm --filter @oslsr/api report:backfill-failures` companion script for manual review of `backfill_failed = true` rows
5.6. Tests: dry-run / idempotent / failure-flag handling

### Task 6 — Story 11-2 hand-off prep (AC#4)

6.1. Document the normaliser API surface in `apps/api/src/lib/normalise/README.md` so Story 11-2 (Import Service) can consume cleanly
6.2. Examples + edge case documentation

### Task 7 — Tests + sprint-status + FRC flip (AC#9, AC#10)

7.1. Run full test suite — verify baseline + new tests
7.2. Update `sprint-status.yaml`
7.3. On merge + back-fill complete + zero unresolved failures: flip FRC item #4 in `epics.md`

## Technical Notes

### Why a prep task vs a Story

Prep tasks are infrastructure deliverables consumed by multiple stories. They ship with no user-visible feature change but unlock downstream stories. This task is consumed by Story 11-2 (Import Service), Story 9-12 (Public Wizard), Submission ingest (Epic 3), and Staff Provisioning (Epic 1). Treating it as part of any one of those stories would couple them artificially.

### Why DMY default for `normaliseDate`

Nigerian convention is DMY (per Nigerian standards body). UK convention also DMY. US convention MDY. Without explicit format hint, default to DMY since the user base is Nigerian. The `auto` mode is for cases where the source is unknown (e.g. ITF-SUPA imports may have either format).

### Trade vocabulary scope

The trade vocabulary table is **seeded from existing canonical trades** in the `respondents` table — i.e. we extract `SELECT DISTINCT trade FROM respondents` first, normalise the dominant casing as canonical, and use that as the seed. Future trades flagged as `[unmapped]` accumulate; periodic curation (super-admin task, not automated) folds them into canonical or marks as duplicates.

**Out of scope:** auto-correction with UX suggestion (that's UX work — separate Sally + frontend story). This task only normalises server-side.

### Why hashed values in back-fill audit log

The back-fill operation touches PII fields (email, phone, name) in millions of rows. Logging plaintext old/new values would create a massive PII footprint in `audit_logs`. Hashing (SHA-256) preserves the audit trail (who changed what) without re-introducing PII. If forensic recovery of old values is needed, the pre-migration DB snapshot is the source.

### Story 11-2 is the largest consumer

Story 11-2 (Import Service + Parsers) parses ITF-SUPA PDF and similar sources. The PDF has rampant data hygiene issues — emails like `gmail.vom`, phones in 5+ formats, names in mixed casing. Without this prep task, every Import Service line would need its own normalisation logic — leading to drift. With this prep task, one normalisation pass at parser output guarantees canonical data hits the DB.

## Risks

1. **Back-fill on production may fail on edge cases.** Some real respondents may have unusual inputs that the normalisers reject. Mitigation: AC#7 + AC#8 capture failed rows as `backfill_failed = true` for manual review; back-fill never blocks the migration.
2. **Trade vocabulary may bloat.** Free-text trades from public registration could flood the `[unmapped]` list. Mitigation: periodic curation; eventual UX suggestion layer (out of scope here).
3. **Email typo dictionary may evolve.** New Nigerian-specific typos will surface in field. Mitigation: dictionary is a config (not code), surfaced via `apps/api/src/lib/normalise/typo-dictionary.json`; updates do not require deploys (read at startup).
4. **DMY default may cause silent corruption.** A user submitting `01/02/2026` intending Feb 1 (MDY) gets converted to Jan 2 (DMY). Mitigation: normaliseDate emits a warning when the input is ambiguous (`day <= 12 && month <= 12`); surfaced to admin via `audit_logs`; UI can prompt.
5. **Phone E.164 conversion edge cases.** Inputs like `070...` (7-prefix mobile) vs `080...` need different conversion logic. Mitigation: comprehensive unit tests covering all 4 Nigerian mobile prefixes (070, 080, 081, 090, 091); reject inputs that don't fit known prefixes with a warning.

## Dev Agent Record

### Agent Model Used

_(Populated when prep task enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Created:**
- `apps/api/src/lib/normalise/email.ts` + tests
- `apps/api/src/lib/normalise/phone.ts` + tests
- `apps/api/src/lib/normalise/name.ts` + tests
- `apps/api/src/lib/normalise/date.ts` + tests
- `apps/api/src/lib/normalise/trade.ts` + tests
- `apps/api/src/lib/normalise/typo-dictionary.json`
- `apps/api/src/lib/normalise/README.md`
- `packages/types/src/normalised.ts`
- `apps/api/src/scripts/backfill-input-sanitisation.ts`
- `apps/api/src/scripts/report-backfill-failures.ts`
- Drizzle migration files

**Modified:**
- `packages/types/src/index.ts` — re-exports
- `apps/api/src/services/submission-processing.service.ts` — wire normalisers
- `apps/api/src/services/staff-provisioning.service.ts` — wire normalisers
- `apps/api/src/db/schema/respondents.ts` — DOB type change + phone CHECK
- `apps/api/package.json` — new scripts
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md` — FRC item #4 status flip on completion

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Prep task created by Bob (SM) per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering normalisation library + zod schemas + wiring into 4 input boundaries + schema strengthening migration + idempotent back-fill script with hashed audit + tests + FRC flip. Independent / parallelisable. | FRC item #4 — field-survey-blocking. Without this layer, ITF-SUPA-style data hygiene issues would surface in field collection. Building it once before field is cheaper than retro-fitting after. |

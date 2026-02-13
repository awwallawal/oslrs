# Story 3.4: Idempotent Submission Ingestion (BullMQ)

Status: review

## Story

As a System,
I want to reliably ingest survey submissions from the native form renderer,
so that the data is available for reporting and fraud detection.

## Acceptance Criteria

1. **AC3.4.1 — Respondent Extraction:** Given a survey submission saved to the `submissions` table, when the ingestion worker processes it, then it extracts respondent identity fields (NIN, name, DOB, phone, LGA, consent) from `rawData` using the form schema's question `name` keys, creates a `respondents` record (or finds existing by NIN), and links the submission to the respondent via `respondent_id` FK. The respondent's `source` field is set from the submission's `source` value (`'enumerator'`, `'public'`, or `'clerk'`). When linking to an existing respondent (duplicate NIN), the original `source` is preserved (first-contact channel).

2. **AC3.4.2 — Idempotent Processing:** Given a submission that has already been processed (`processed=true`), when the ingestion worker encounters it again (requeue, retry), then it skips processing and returns success without creating duplicate respondent records or modifying existing data.

3. **AC3.4.3 — NIN Uniqueness Handling (FR21 Aligned):** Given a submission whose NIN matches an existing respondent, when the worker extracts respondent data, then it links the submission to the existing respondent (does NOT create a duplicate, does NOT reject the submission) and logs the event `{ event: 'respondent.duplicate_nin_linked', existingRespondentId, newSubmissionId, source }` for supervisor audit. Submissions from different forms or channels for the same person are linked to the same respondent record. This supports multi-channel registration, multi-form participation, and offline resilience per PRD FR21.

4. **AC3.4.4 — Enumerator Linking:** Given a submission with `source = 'enumerator'` and a `submitterId`, when the worker processes it, then it sets `enumerator_id` on the submission record to the submitter's user ID. For submissions with `source = 'public'` or `source = 'clerk'`, `enumerator_id` remains null. This distinguishes WHO collected the data in the field (enumerator) from WHO pressed submit (submitter), which may differ for clerk-digitized paper forms.

5. **AC3.4.5 — Processing Status Tracking:** Given a submission being processed, when processing succeeds, then `processed=true` and `processedAt` are set. When processing fails, then `processed=false`, `processingError` contains the error message, and the job is retried by BullMQ (3 attempts, exponential backoff 5s base).

6. **AC3.4.6 — Fraud Detection Queue Trigger:** Given a successfully processed submission with GPS coordinates, when the respondent is linked, then a `fraud-detection` job is added to a new BullMQ queue with the submission ID. The fraud detection worker is a stub (logs and completes) — actual heuristics are Epic 4 scope.

7. **AC3.4.7 — Worker Lifecycle:** Given the API application starts, when workers are initialized, then the `webhookIngestionWorker` is registered in `workers/index.ts`, included in `initializeWorkers()` and `closeAllWorkers()`, and participates in graceful shutdown on SIGTERM/SIGINT.

8. **AC3.4.8 — Form Schema Validation:** Given a submission's `rawData`, when the worker processes it, then it loads the form schema from `questionnaire_forms` by `questionnaireFormId` and validates that required respondent fields (NIN at minimum) are present in the responses. Missing required fields result in `processingError` without retries (permanent failure).

## Tasks / Subtasks

- [x] **Task 0: Add Modulus 11 NIN validation to native form renderer** (AC: FR21 — prerequisite for data quality)
  - [x] 0.1 Extend `ValidationType` in `packages/types/src/native-form.ts`: add `'modulus11'` to the `validationTypes` array
  - [x] 0.2 Update `checkRule()` in `apps/web/src/features/forms/pages/FormFillerPage.tsx`: add `case 'modulus11'` that calls `modulus11Check(strVal)` from `@oslsr/utils`, returning `rule.message` on failure
  - [x] 0.3 Update `parseConstraint()` in `apps/api/src/services/xlsform-to-native-converter.ts`: recognize `modulus11(.)` constraint and emit `{ type: 'modulus11', value: 1, message }` validation rule
  - [x] 0.4 Update the XLSForm NIN constraint in `scripts/generate-xlsform.cjs`: change from `"string-length(.) = 11 and regex(., '^[0-9]+$')"` to `"string-length(.) = 11 and regex(., '^[0-9]+$') and modulus11(.)"` with message `"Invalid NIN — please check for typos"`
  - [x] 0.5 Re-run XLSForm generation + conversion to update the form schema in the database: `pnpm --filter api xlsform:generate && pnpm --filter api xlsform:convert` (or equivalent seed/migration)
  - [x] 0.6 Write tests:
    - `packages/types` — verify `'modulus11'` is in `validationTypes`
    - `apps/web` — test `checkRule()` with `modulus11` type: valid NIN passes, invalid NIN fails, non-11-digit string fails
    - `apps/api` — test `parseConstraint()` recognizes `modulus11(.)` and emits correct `ValidationRule`
  - [x] 0.7 ~~Manual~~ Automated verification: Playwright E2E test `e2e/nin-validation.spec.ts` — enters invalid NIN (`12345678902`), asserts modulus11 error, then enters valid NIN, asserts error clears

- [x] **Task 1: Create `respondents` table schema + migration** (AC: 3.4.1, 3.4.3)
  - [x] 1.1 Create `apps/api/src/db/schema/respondents.ts`
  - [x] 1.2 Define fields: `id` (UUIDv7 PK), `nin` (text, UNIQUE NOT NULL), `firstName` (text), `lastName` (text), `dateOfBirth` (text nullable), `phoneNumber` (text nullable), `lgaId` (text nullable), `consentMarketplace` (boolean default false), `consentEnriched` (boolean default false), `source` (text — 'enumerator'|'public'|'clerk'), `submitterId` (text nullable — first submitter), `createdAt`, `updatedAt`
  - [x] 1.3 Add indexes: `uq_respondents_nin` (unique), `idx_respondents_lga_id`, `idx_respondents_created_at`
  - [x] 1.4 Export from `apps/api/src/db/schema/index.ts`
  - [x] 1.5 Create SQL migration `apps/api/drizzle/XXXX_create_respondents.sql`
  - [x] 1.6 Run `pnpm db:push` to apply schema

- [x] **Task 2: Add respondent/enumerator FK columns to `submissions` table** (AC: 3.4.1, 3.4.4)
  - [x] 2.1 Add `respondentId: uuid('respondent_id').references(() => respondents.id)` to submissions schema
  - [x] 2.2 Add `enumeratorId: text('enumerator_id')` to submissions schema (text, not FK — submitterId is already text)
  - [x] 2.3 Add index `idx_submissions_respondent_id` and `idx_submissions_enumerator_id`
  - [x] 2.4 Update `apps/api/src/db/schema/relations.ts` — add respondent ↔ submission relations
  - [x] 2.5 Create SQL migration for new columns
  - [x] 2.6 Run `pnpm db:push` to apply

- [x] **Task 3: Create `submission-processing.service.ts`** (AC: 3.4.1, 3.4.2, 3.4.3, 3.4.5, 3.4.8)
  - [x] 3.1 Create `apps/api/src/services/submission-processing.service.ts`
  - [x] 3.2 Method `processSubmission(submissionId: string)`:
    - Load submission from DB (with rawData, source, submitterId)
    - If `processed === true`: return early (idempotent skip)
    - Load form schema from `questionnaire_forms` by `questionnaireFormId`
    - Extract respondent fields from `rawData` using form schema question names
    - Create or find respondent by NIN (upsert pattern); set `respondent.source` from `submission.source` on create only (preserve original on duplicate)
    - Set `enumeratorId` conditionally: only when `submission.source === 'enumerator'` (null for 'public'/'clerk')
    - Update submission: `respondentId`, `enumeratorId` (conditional), `processed=true`, `processedAt`
    - Return processing result
  - [x] 3.3 Method `extractRespondentData(rawData, formSchema)`:
    - Map known question names to respondent fields: `nin` → NIN, `first_name`/`firstName` → firstName, `last_name`/`lastName` → lastName, `date_of_birth`/`dob` → dateOfBirth, `phone`/`phone_number` → phoneNumber, `lga`/`lga_id` → lgaId, `consent_marketplace` → consentMarketplace, `consent_enriched` → consentEnriched
    - Support both snake_case and camelCase question names (XLSForm migration uses snake_case)
    - Validate NIN is present (throw permanent error if missing)
  - [x] 3.4 Method `findOrCreateRespondent(data, source)`:
    - Query respondents by NIN
    - If exists: return existing + log `{ event: 'respondent.duplicate_nin_linked', existingRespondentId, source }` (do NOT overwrite existing respondent.source — preserve first-contact channel)
    - If new: insert with `source` from submission and return
    - Handle race condition: catch unique constraint violation on NIN, retry find
  - [x] 3.5 Write tests: `apps/api/src/services/__tests__/submission-processing.service.test.ts` (16 tests)
    - Test successful extraction with valid rawData
    - Test idempotent skip (already processed)
    - Test NIN duplicate handling (links to existing respondent)
    - Test missing NIN (permanent error)
    - Test missing form schema (error)
    - Test race condition on concurrent NIN insert
    - Test enumerator linking: source='enumerator' → enumeratorId set, source='public' → enumeratorId null
    - Test respondent source preservation: first submission sets source, second submission (different channel) preserves original

- [x] **Task 4: Enhance ingestion worker with processing** (AC: 3.4.1, 3.4.2, 3.4.5)
  - [x] 4.1 Update `apps/api/src/workers/webhook-ingestion.worker.ts`
  - [x] 4.2 After saving raw submission (existing flow), call `SubmissionProcessingService.processSubmission(submissionId)`
  - [x] 4.3 On processing success: log `webhook_ingestion.processed` event
  - [x] 4.4 On processing error:
    - If permanent (missing NIN, missing form): update submission `processingError`, do NOT re-throw (prevent retry)
    - If transient (DB timeout, connection error): re-throw for BullMQ retry
  - [x] 4.5 For idempotent re-runs: if submission already exists AND already processed, skip everything
  - [x] 4.6 Update worker tests: `apps/api/src/workers/__tests__/webhook-ingestion.worker.test.ts`

- [x] **Task 5: Create fraud detection queue + stub worker** (AC: 3.4.6)
  - [x] 5.1 Create `apps/api/src/queues/fraud-detection.queue.ts`
    - Queue name: `fraud-detection`
    - Job data: `{ submissionId: string, respondentId: string, gpsLatitude?: number, gpsLongitude?: number }`
    - Job options: 3 attempts, exponential backoff 5s
    - Export `queueFraudDetection(data)` function
  - [x] 5.2 Create `apps/api/src/workers/fraud-detection.worker.ts` (stub)
    - Log job received, return `{ processed: false, reason: 'stub — Epic 4 scope' }`
    - Concurrency: 4 (per architecture)
  - [x] 5.3 Trigger fraud detection from processing service after successful respondent linkage (only if GPS coordinates present)
  - [x] 5.4 Write tests for queue function (mock Redis)

- [x] **Task 6: Register workers in lifecycle management** (AC: 3.4.7)
  - [x] 6.1 Update `apps/api/src/workers/index.ts`:
    - Import `webhookIngestionWorker` from `./webhook-ingestion.worker.js`
    - Import `fraudDetectionWorker` from `./fraud-detection.worker.js`
    - Add both to `initializeWorkers()` logging
    - Add both to `closeAllWorkers()` shutdown
  - [x] 6.2 Verify workers start on app initialization
  - [x] 6.3 Verify graceful shutdown closes all workers

- [x] **Task 7: End-to-end integration test** (AC: 3.4.1-3.4.6)
  - [x] 7.1 Create `apps/api/src/services/__tests__/submission-ingestion.integration.test.ts`
  - [x] 7.2 Test full pipeline: raw submission → worker → respondent created → submission linked → fraud job queued
  - [x] 7.3 Test duplicate submission → idempotent skip
  - [x] 7.4 Test duplicate NIN → links to existing respondent
  - [x] 7.5 Test error scenarios: missing form, missing NIN, DB errors

## Dev Notes

### Architecture Compliance

**Submission Ingestion Pipeline (Architecture ADR-004, ADR-009):**
```
Enumerator completes form (Story 3.1)
  -> Draft marked 'completed' -> useDraftPersistence adds to submissionQueue
  -> SyncManager syncs (Story 3.3) -> POST /api/v1/forms/submissions
  -> Controller: queueSubmissionForIngestion() (dedup by submissionUid)
  -> BullMQ Queue: 'webhook-ingestion' (jobId: ingest-{submissionUid})
  -> Ingestion Worker (CURRENT - Story 3.3): saves raw submission, processed=false
  -> ✅ Story 3.4 ADDS:
     -> Load form schema, extract respondent fields from rawData
     -> Create/find respondent by NIN (idempotent)
     -> Link submission: respondentId, enumeratorId
     -> Mark processed=true, processedAt=now
     -> Queue fraud-detection job (stub worker)
```

**Idempotency Guarantees (3 layers):**
1. **BullMQ level:** `jobId: ingest-{submissionUid}` prevents duplicate job creation
2. **Worker level:** `submissionUid` UNIQUE constraint prevents duplicate submission records
3. **Processing level:** `processed=true` check prevents re-processing existing submissions
4. **Respondent level:** `nin` UNIQUE constraint prevents duplicate respondent records; race condition handled by catch-and-retry

### Existing Infrastructure — MUST Reuse

| Component | Location | Status |
|-----------|----------|--------|
| Submissions table | `apps/api/src/db/schema/submissions.ts` | Has `processed`, `processedAt`, `processingError` fields. Needs `respondentId`, `enumeratorId` columns added. |
| Ingestion queue | `apps/api/src/queues/webhook-ingestion.queue.ts` | Complete. `queueSubmissionForIngestion()` with dedup by `submissionUid`. |
| Ingestion worker | `apps/api/src/workers/webhook-ingestion.worker.ts` | Saves raw submission with `processed=false`. Needs processing step added. |
| Worker registry | `apps/api/src/workers/index.ts` | Missing `webhookIngestionWorker` — must add. |
| Form schema | `apps/api/src/db/schema/questionnaires.ts` | `questionnaire_forms` table with `form_schema` JSONB column. |
| Native form service | `apps/api/src/services/native-form.service.ts` | `getFormSchema(id)` method available. |
| Redis connection | Queue files create own connections | Pattern: `new Redis(process.env.REDIS_URL \|\| 'redis://localhost:6379', { maxRetriesPerRequest: null })` |
| Drizzle DB | `apps/api/src/db/index.ts` | `db` instance, use `db.query`, `db.insert`, `db.update`, `eq()` from `drizzle-orm` |

### Form Response Field Mapping

The `rawData` JSONB stores responses keyed by question `name` from the native form schema. The `Question` interface has `id` (UUID) and `name` (human-readable, from XLSForm migration):

```typescript
// Question names from oslsr_master_v3 migration (snake_case convention):
// Identity section: nin, first_name, last_name, date_of_birth, phone_number
// Location section: lga, lga_id
// Consent section: consent_marketplace, consent_enriched
// Geopoint: gps_latitude, gps_longitude (from geopoint question)

// Mapping strategy: convention-based with fallbacks
const RESPONDENT_FIELD_MAP: Record<string, string> = {
  // NIN (REQUIRED)
  'nin': 'nin',
  'national_id': 'nin',
  // Name
  'first_name': 'firstName',
  'firstName': 'firstName',
  'last_name': 'lastName',
  'lastName': 'lastName',
  // Personal
  'date_of_birth': 'dateOfBirth',
  'dob': 'dateOfBirth',
  'phone': 'phoneNumber',
  'phone_number': 'phoneNumber',
  // Location
  'lga': 'lgaId',
  'lga_id': 'lgaId',
  // Consent
  'consent_marketplace': 'consentMarketplace',
  'consent_enriched': 'consentEnriched',
};
```

### Technical Decisions

**Why NIN Modulus 11 validation is Task 0 (prerequisite):**
The public registration form (`RegistrationForm.tsx`) already validates NIN with `modulus11Check()` from `@oslsr/utils` — real-time green checkmark / red error feedback. But the enumerator native form only validates length (11 chars) and format (digits only). Without checksum validation, an enumerator fat-fingering a NIN creates a ghost respondent that can never be corrected downstream (the worker intentionally trusts submitted data). Adding `modulus11` as a custom `ValidationType` is a small, scoped change (4 files) that closes this gap and makes the "worker trusts client" anti-pattern safe. The `modulus11Check()` function already exists in the shared `@oslsr/utils` package — Task 0 just wires it into the form renderer.

**Why convention-based field mapping (not schema metadata):**
The form system doesn't have a `dataBinding` attribute on questions. Adding one would require form builder UI changes (scope creep). Convention-based mapping using question `name` is sufficient because: (a) the XLSForm migration produces consistent names, (b) the Form Builder UI lets admins set question names, (c) a mapping config can be added later without breaking the pipeline.

**Why NOT use a database transaction for respondent creation + submission update:**
The operations are intentionally NOT in a single transaction because: (a) respondent creation is idempotent (find-or-create), (b) if the respondent exists, we only need the UPDATE on submissions, (c) if the submission UPDATE fails after respondent creation, the respondent record is still valid (no orphan data), (d) keeping operations separate simplifies retry logic.

**Why permanent vs transient error distinction:**
BullMQ retries are wasted on permanent errors (missing NIN, missing form schema). The worker catches these and marks them as `processingError` without re-throwing, preventing wasted retry attempts. Transient errors (DB timeouts, Redis connection issues) are re-thrown for BullMQ's exponential backoff retry.

**Why stub fraud detection worker:**
The architecture specifies fraud detection during ingestion, but the actual heuristics (GPS clustering, speed runs, straight-lining) are Epic 4 scope. Creating the queue + stub worker now establishes the pipeline connection point. The stub logs and completes, allowing the ingestion pipeline to function end-to-end. Epic 4 replaces the stub with real heuristics.

### Project Structure Notes

**New Files:**
```
apps/api/src/
  db/schema/respondents.ts                              # Respondents table schema
  services/submission-processing.service.ts             # Extract respondent, link submission
  services/__tests__/submission-processing.service.test.ts
  services/__tests__/submission-ingestion.integration.test.ts
  queues/fraud-detection.queue.ts                       # Fraud detection job queue
  workers/fraud-detection.worker.ts                     # Stub worker (Epic 4 scope)
  workers/__tests__/webhook-ingestion.worker.test.ts    # Enhanced worker tests
apps/api/drizzle/
  XXXX_create_respondents.sql                           # Respondents table migration
  XXXX_add_submission_fks.sql                           # Add respondentId, enumeratorId
```

**Modified Files:**
```
apps/api/src/db/schema/submissions.ts          # Add respondentId, enumeratorId columns
apps/api/src/db/schema/index.ts                # Export respondents
apps/api/src/db/schema/relations.ts            # Add respondent ↔ submission relations
apps/api/src/workers/webhook-ingestion.worker.ts  # Add processing step after raw save
apps/api/src/workers/index.ts                  # Register webhook + fraud workers
```

**Frontend files (Task 0 only):**
```
packages/types/src/native-form.ts                            # Add 'modulus11' validation type
apps/web/src/features/forms/pages/FormFillerPage.tsx         # Add modulus11 case to checkRule()
```

**Other modified files (Task 0 only):**
```
apps/api/src/services/xlsform-to-native-converter.ts         # Parse modulus11(.) constraint
scripts/generate-xlsform.cjs                                 # Add modulus11(.) to NIN constraint
```

**Remaining tasks (1-7) are entirely backend (API) scope.**

### Anti-Pattern Prevention

- **DO NOT** create a separate API endpoint for processing — the worker handles it internally after saving raw data
- **DO NOT** use auto-increment IDs — ALL primary keys are UUIDv7 (`$defaultFn(() => uuidv7())`)
- **DO NOT** use `uuid` v4 package — use `uuidv7` package
- **DO NOT** use camelCase in database column names — use snake_case (e.g., `respondent_id`, NOT `respondentId` in SQL)
- **DO NOT** use `console.log` — use Pino structured logging (`logger.info({ event: '...', ... })`)
- **DO NOT** throw raw `Error` — use `AppError` from `@oslsr/utils` for API errors
- **DO NOT** co-locate backend tests — use `__tests__/` subdirectories
- **DO NOT** create separate worker connection files — each worker creates its own Redis connection (established pattern)
- **DO NOT** use CommonJS imports — use ESM with `.js` extensions for relative imports (e.g., `import { db } from '../db/index.js'`)
- **DO NOT** modify the existing queue dedup logic — the BullMQ jobId dedup is correct
- **DO NOT** implement full fraud heuristics — that is Epic 4 scope. Only create the queue trigger + stub worker
- **DO NOT** add NIN validation (Modulus 11 checksum) in the worker — NIN validation happens at the form renderer level (client-side, see Task 0). The worker trusts submitted data. Task 0 ensures this trust is warranted by adding `modulus11` validation to the native form renderer.
- **DO NOT** batch-process multiple submissions — process one at a time per job (BullMQ handles concurrency)

### Testing Strategy

**Task 0 tests (NIN validation — vitest):**
- `packages/types` — verify `'modulus11'` exists in `validationTypes` array
- `apps/web` — test `checkRule()` with `{ type: 'modulus11', value: true, message: 'Invalid NIN' }`:
  - Valid NIN (passes Modulus 11) → no error
  - Invalid NIN (wrong check digit, e.g., `12345678902`) → returns error message
  - Non-11-digit string → returns error message
  - Empty string → returns error message
- `apps/api` — test `parseConstraint()` with `"modulus11(.)"`:
  - Emits `{ type: 'modulus11', value: true, message: expectedMsg }`
  - Combined constraint `"string-length(.) = 11 and regex(., '^[0-9]+$') and modulus11(.)"` → 4 rules (minLength, maxLength, regex, modulus11)

**Service tests (vitest, `__tests__/` folder):**
- `submission-processing.service.test.ts`: Mock `db` + form schema service
  - Process valid submission → respondent created, submission linked
  - Process already-processed submission → idempotent skip
  - Process with duplicate NIN → links to existing respondent
  - Process with missing NIN in rawData → permanent error (processingError set)
  - Process with missing form schema → permanent error
  - Process with transient DB error → throws for retry
  - Verify `fraud-detection` job queued after successful processing

**Worker tests (vitest, `__tests__/` folder):**
- `webhook-ingestion.worker.test.ts`: Mock DB + processing service
  - New submission → saved + processed
  - Duplicate submission → skipped
  - Processing failure (permanent) → error stored, no retry
  - Processing failure (transient) → error thrown, BullMQ retries

**Integration tests (vitest):**
- `submission-ingestion.integration.test.ts`: Mock DB at query level
  - Full pipeline: submit → save → extract → respondent → link → fraud queue
  - Duplicate submission → idempotent end-to-end
  - Duplicate NIN → same respondent linked

**Mocking Patterns (from existing codebase):**
```typescript
// vi.hoisted() + vi.mock() pattern (established in codebase)
const mocks = vi.hoisted(() => ({
  db: {
    query: { submissions: { findFirst: vi.fn() } },
    insert: vi.fn().mockReturnValue({ values: vi.fn() }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
  },
  queueFraudDetection: vi.fn(),
}));
vi.mock('../db/index.js', () => ({ db: mocks.db }));
vi.mock('../queues/fraud-detection.queue.js', () => ({
  queueFraudDetection: mocks.queueFraudDetection,
}));
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Story-3.4] — AC definitions
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-004] — Offline Data Responsibility Model
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-009] — Ingestion Pipeline
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-003] — Fraud Detection Engine
- [Source: apps/api/src/db/schema/submissions.ts] — Submissions table schema (existing)
- [Source: apps/api/src/queues/webhook-ingestion.queue.ts] — BullMQ queue with dedup (existing)
- [Source: apps/api/src/workers/webhook-ingestion.worker.ts] — Ingestion worker (to be enhanced)
- [Source: apps/api/src/workers/index.ts] — Worker lifecycle (needs webhook + fraud workers)
- [Source: apps/api/src/services/native-form.service.ts] — Form schema retrieval
- [Source: packages/types/src/native-form.ts] — Question.name used for field mapping
- [Source: _bmad-output/implementation-artifacts/3-3-offline-queue-sync-status-ui.md] — Previous story learnings
- [Source: _bmad-output/project-context.md#Section-10-BullMQ-Job-Patterns] — Job naming + retry config

### Previous Story Intelligence

**From Story 3.3 (Offline Queue & Sync Status UI):**
- POST `/api/v1/forms/submissions` endpoint complete — validates with Zod, queues via `queueSubmissionForIngestion()`
- Frontend SyncManager sends: `{ submissionId, formId, formVersion, responses, gpsLatitude?, gpsLongitude?, submittedAt }`
- Queue maps: `submissionId → submissionUid`, `formId → questionnaireFormId`, `submitterId → req.user.id`
- Worker currently saves raw data with `processed=false` — Story 3.4 adds the processing step
- 1,143 web tests + 297 API tests passing — baseline for regression check
- Team Agreement A3: `data-testid` selectors only, no CSS class selectors in tests
- ESM: backend imports need `.js` extension for relative paths

**From Story 3.2 (PWA Service Worker):**
- Dual-layer caching: SW cache + Dexie fallback — form schemas available offline
- `formSchemaCache` Dexie table stores schemas client-side

**From Story 3.1 (Native Form Renderer):**
- `useDraftPersistence.completeDraft()` enriches payload with formVersion, submittedAt, GPS
- Draft ID (UUIDv7) becomes submission ID — critical for dedup chain
- Form responses keyed by question `name` in `formData` object

**From Story 3.0 (Google OAuth):**
- `req.user.id` available via authenticate middleware — used as `submitterId`

### Git Intelligence

Recent commits (2026-02-12/13):
```
8e925f1 fix: add workbox-window dependency to fix vite-plugin-pwa build
f4f9418 fix: resolve CI type errors and restore dual-layer form caching
911ebb4 fix: auto-convert XLSForm to native format on upload & add form preview
22a0f99 feat: Story 3.2 — PWA service worker, offline assets & code review fixes
```

Key patterns from recent work:
- Commit style: `feat: Story X.Y — brief description & code review fixes`
- Test baseline: ~1,143 web tests, ~297 API tests
- No regressions observed across Stories 3.0-3.3
- Architecture decision: no Workbox BackgroundSync (application-level sync via SyncManager)

### Review Follow-ups (AI)

- [x] [AI-Review][CRITICAL] C1: Source enum mismatch — `submissions.source` enum is `['webapp','mobile',...]` but AC 3.4.4 requires `'enumerator'/'public'/'clerk'`. Controller hardcodes `source:'webapp'`. `enumeratorId` never set, `respondent.source` gets invalid value via unsafe cast. Fix: derive submitter role from users table in processing service. [`submission-processing.service.ts:124,129,242`, `form.controller.ts:89`]
- [x] [AI-Review][CRITICAL] C2: GPS data never extracted to submission columns — controller puts GPS in `rawData._gpsLatitude`/`._gpsLongitude`, worker saves rawData but doesn't populate `gpsLatitude`/`gpsLongitude` columns. Fraud detection never triggers. Fix: extract GPS from rawData during worker insert. [`webhook-ingestion.worker.ts:106-115`, `submission-processing.service.ts:149`]
- [x] [AI-Review][HIGH] H1: Dev Agent Record → File List is empty — 25 files in git, 0 documented. Fix: populate File List section.
- [x] [AI-Review][HIGH] H2: Form schema loaded but not used for extraction — AC 3.4.8 says to use schema; service loads it then ignores it, using hardcoded RESPONDENT_FIELD_MAP instead. Fix: pass schema to extraction for NIN validation. [`submission-processing.service.ts:103-119`]
- [x] [AI-Review][HIGH] H3: Race condition detection uses fragile `error.message.includes('unique')` instead of PG error code `23505`. Fix: check error code. [`submission-processing.service.ts:249`]
- [x] [AI-Review][MEDIUM] M1: Redundant index `uq_respondents_nin` on `respondents.nin` — `.unique()` already creates implicit index; `uq_` prefix falsely implies unique index. Fix: remove redundant index. [`respondents.ts:42`, `0002_create_respondents.sql:20`]
- [x] [AI-Review][MEDIUM] M2: Tests don't verify `enumeratorId` actual value in update payload — only check mock was called. Fix: assert payload values. [`submission-processing.service.test.ts:192-213`]
- [x] [AI-Review][MEDIUM] M3: Integration test mocks ignore WHERE clauses — `findFirst` returns `entries[0]` regardless of query. Fix: improve mock filtering.
- [x] [AI-Review][MEDIUM] M4: Duplicate JSDoc comment block on `runProcessing`. Fix: remove duplicate. [`webhook-ingestion.worker.ts:147-155`]
- [x] [AI-Review][LOW] L1: Replaced manual Task 0.7 with Playwright E2E test `e2e/nin-validation.spec.ts`. Tests invalid NIN rejection (modulus11) and valid NIN acceptance in form filler.
- [x] [AI-Review][LOW] L2: Renamed `formXmlId` → `questionnaireFormId` across 18 files + migration `0004_rename_form_xml_id.sql`. Applied to Docker DB, schema check passed.
- [x] [AI-Review][LOW] L3: CRLF line ending warnings on several files — Windows `autocrlf` artifact, not mixed endings. No code fix needed.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

- 2026-02-13: Adversarial code review (Claude Opus 4.6) — 12 findings (2C, 3H, 4M, 3L), all fixed. Additionally: fixed pre-existing rate-limit test timeouts (dynamic worker import), renamed `formXmlId`→`questionnaireFormId` (18 files + migration 0004), replaced manual Task 0.7 with Playwright E2E test. 337 API + 1,164 web tests pass, 0 regressions.

### File List

**New files (Story 3.4):**
- `apps/api/src/db/schema/respondents.ts` — Respondents table schema
- `apps/api/src/services/submission-processing.service.ts` — Respondent extraction + linking
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` — 25 unit tests (expanded from 16 during review)
- `apps/api/src/services/__tests__/submission-ingestion.integration.test.ts` — 4 integration tests
- `apps/api/src/queues/fraud-detection.queue.ts` — Fraud detection BullMQ queue
- `apps/api/src/queues/__tests__/fraud-detection.queue.test.ts` — 3 queue tests
- `apps/api/src/workers/fraud-detection.worker.ts` — Stub fraud worker (Epic 4 scope)
- `apps/api/src/workers/__tests__/fraud-detection.worker.test.ts` — 2 worker tests
- `apps/api/src/workers/__tests__/webhook-ingestion.worker.test.ts` — 6 worker tests
- `apps/api/drizzle/0002_create_respondents.sql` — Respondents table migration
- `apps/api/drizzle/0003_add_submission_fks.sql` — Add respondentId/enumeratorId to submissions

**Modified files (Story 3.4 backend):**
- `apps/api/src/db/schema/submissions.ts` — Add respondentId, enumeratorId columns + indexes
- `apps/api/src/db/schema/index.ts` — Export respondents
- `apps/api/src/db/schema/relations.ts` — Add respondent ↔ submission relations
- `apps/api/src/workers/webhook-ingestion.worker.ts` — Add processing step + GPS extraction
- `apps/api/src/workers/index.ts` — Register webhook + fraud workers in lifecycle

**Modified files (Task 0 — NIN modulus11 validation):**
- `packages/types/src/native-form.ts` — Add 'modulus11' to validationTypes
- `packages/types/src/validation/__tests__/native-form.test.ts` — modulus11 validation rule test
- `apps/web/src/features/forms/pages/FormFillerPage.tsx` — Add modulus11 case to checkRule()
- `apps/web/src/features/forms/pages/__tests__/FormFillerPage.test.tsx` — 3 NIN validation tests
- `apps/api/src/services/xlsform-to-native-converter.ts` — Parse modulus11(.) constraint
- `scripts/__tests__/xlsform-to-native-converter.test.ts` — modulus11 constraint tests
- `scripts/generate-xlsform.cjs` — Add modulus11(.) to NIN constraint

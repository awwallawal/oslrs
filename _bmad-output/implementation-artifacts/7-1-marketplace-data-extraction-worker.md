# Story 7.1: Marketplace Data Extraction Worker

Status: done

## Story

As a **System**,
I want to automatically extract worker profiles from survey data,
So that the marketplace is populated without manual intervention.

## Context

This is the first story of Epic 7: Public Skills Marketplace & Search Security. It creates the data pipeline that populates the marketplace — a BullMQ background worker that extracts anonymous profiles from survey submissions when `consent_marketplace = 'Yes'`.

**Prerequisites:**
- **prep-4 (marketplace data model spike)** must be completed first — provides the validated schema DDL, field mapping, search vector design, and type definitions that this story implements.
- **prep-1 (text=uuid fix)** — done (fixed raw SQL type mismatches in respondent.service.ts)

**Dependency note:** The prep-4 spike outputs a design document (`spike-marketplace-data-model.md`). This story implements that design. If prep-4 decisions differ from what's documented here, **the spike output takes precedence** — it represents the most up-to-date validated design.

## Acceptance Criteria

1. **Given** an ingested survey submission, **when** the `consent_marketplace` field is 'Yes', **then** the background worker extracts Profession, LGA, and Experience Level and creates or updates a profile in the `marketplace_profiles` table.
2. **Given** a submission where `consent_marketplace` is 'No' or missing, **when** processing completes, **then** no marketplace profile is created or modified for that respondent.
3. **Given** a respondent who already has a marketplace profile, **when** a new submission is ingested, **then** the profile is updated (UPSERT on respondent_id — latest submission wins).
4. **Given** the marketplace profile, **when** created or updated, **then** the `search_vector` (tsvector) column is auto-populated via a PostgreSQL trigger using weighted field composition (A: profession, B: skills, C: lga, D: experience).
5. **Given** a respondent with at least one submission where `fraud_detections.assessor_resolution = 'final_approved'`, **when** their profile is extracted, **then** `verified_badge` is set to `true`.
6. **Given** the extraction worker, **when** it encounters a transient error (DB timeout, Redis connection), **then** BullMQ retries with exponential backoff (3 attempts). When it encounters a permanent error (invalid data), **then** the error is logged and the job is not retried.
7. **Given** the new schema, types, queue, and worker, **when** all tests run, **then** comprehensive tests cover: extraction happy path, consent gating, UPSERT idempotency, field mapping with variant names, verified badge derivation, error handling, and zero regressions on existing tests.

## Tasks / Subtasks

- [x] Task 1: Create `marketplace_profiles` schema (AC: #1, #3, #4)
  - [x] 1.1 Create `apps/api/src/db/schema/marketplace.ts` with schema from prep-4 spike (includes `skills` and `lgaName` fields per spike design)
  - [x] 1.2 Add indexes: GIN on searchVector (via custom-sql), btree on lgaId, profession, verifiedBadge
  - [x] 1.3 Create tsvector trigger SQL: `apps/api/src/db/custom-sql/marketplace-trigger.sql` with 4-weight composition (A:profession, B:skills, C:lga_name, D:experience_level). Created `apps/api/src/db/custom-sql/apply.ts` runner and `db:custom` npm script.
  - [x] 1.4 Export from `apps/api/src/db/schema/index.ts`
  - [x] 1.5 Run `db:push:force` + `db:custom` — schema and trigger applied
  - [x] 1.6 Schema convention followed: no @oslsr/types imports in schema file

- [x] Task 2: Create marketplace type definitions (AC: #1)
  - [x] 2.1 Create `packages/types/src/marketplace.ts` with all interfaces from prep-4 spike Section 5
  - [x] 2.2 Export from `packages/types/src/index.ts`

- [x] Task 3: Create marketplace extraction queue (AC: #1, #6)
  - [x] 3.1 Create `apps/api/src/queues/marketplace-extraction.queue.ts` following fraud-detection.queue.ts pattern. Queue name: `marketplace-extraction`, dedup key: `marketplace-${respondentId}`, 3 attempts with exponential backoff.

- [x] Task 4: Create marketplace extraction worker (AC: #1, #2, #3, #5, #6)
  - [x] 4.1 Create `apps/api/src/workers/marketplace-extraction.worker.ts`
  - [x] 4.2 Worker processor: load submission rawData, load respondent, consent gate, extract skills (space-delimited split), normalize experience level (5 canonical values with label fallbacks), resolve LGA name, derive verified badge, UPSERT profile
  - [x] 4.3 Error handling: permanent errors return result (no throw), transient errors throw for BullMQ retry
  - [x] 4.4 Worker config: concurrency 4, `maxRetriesPerRequest: null`
  - [x] 4.5 Event handlers: completed, failed, error

- [x] Task 5: Hook worker into submission processing pipeline (AC: #1, #2)
  - [x] 5.1 Added marketplace queue call in submission-processing.service.ts AFTER fraud detection block (consent-gated, not GPS-gated)
  - [x] 5.2 Import `queueMarketplaceExtraction` added
  - [x] 5.3 Worker registered in workers/index.ts with graceful shutdown

- [x] Task 6: ~~Create pg_trgm extension~~ — **REMOVED: not needed for this story**

- [x] Task 7: Write tests (AC: #7)
  - [x] 7.1 Unit tests for worker: 28 tests covering happy path, consent gating, UPSERT, field mapping variants, space-delimited skills, experience normalization (11 cases), verified badge derivation, LGA resolution, error handling
  - [x] 7.2 Unit tests for queue: 3 tests covering job queuing with dedup, duplicate handling, error re-throw
  - [x] 7.3 Full test suite: 3,237 tests pass (1,267 API + 1,970 web), zero regressions

## Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Integration test missing assertion for marketplace queue call — added `expect(mockQueueMarketplaceExtraction).toHaveBeenCalledOnce()` [submission-ingestion.integration.test.ts:200]
- [x] [AI-Review][MEDIUM] AC #3 UPSERT unreachable through normal pipeline — added comment documenting defensive intent [marketplace-extraction.worker.ts:233-236]
- [x] [AI-Review][MEDIUM] Missing test for `trade` field fallback — added test case [marketplace-extraction.worker.test.ts:248-261]
- [x] [AI-Review][MEDIUM] `extractSkills` uses `??` allowing empty string to prevent fallback — changed to `||` [marketplace-extraction.worker.ts:77]
- [x] [AI-Review][LOW] Story File List omits sprint-status.yaml modification — added below
- [ ] [AI-Review][LOW] Untracked `RegistryTestPage.tsx` not in any story — needs cleanup or tracking

## Dev Notes

### Submission Processing Pipeline (Existing)

The ingestion pipeline flows:
```
HTTP webhook / form submission
  → webhook-ingestion.queue (BullMQ, concurrency: 10)
    → webhook-ingestion.worker
      → SubmissionProcessingService.processSubmission()
        1. Load submission from DB
        2. Idempotency check (skip if processed=true)
        3. Load form schema
        4. extractRespondentData() from rawData
        5. determineSubmitterRole()
        6. findOrCreateRespondent() (UPSERT by NIN)
        7. Link submission to respondent
        8. queueFraudDetection() ← existing downstream worker
        9. *** queueMarketplaceExtraction() ← NEW hook point (Task 5) ***
```

### Field Mapping Convention (submission-processing.service.ts:26-46)

The project already uses a `RESPONDENT_FIELD_MAP` for multi-variant field extraction:
```typescript
export const RESPONDENT_FIELD_MAP: Record<string, string> = {
  'nin': 'nin',
  'national_id': 'nin',
  'first_name': 'firstName',
  'firstName': 'firstName',
  'phone': 'phoneNumber',
  'phone_number': 'phoneNumber',
  'consent_marketplace': 'consentMarketplace',
  'consent_enriched': 'consentEnriched',
  // etc.
};
```

The marketplace extraction worker should follow the same multi-variant pattern for its fields. See also `report.service.ts:64-94` for rawData JSONB extraction with COALESCE fallbacks.

### Consent Model (respondents.ts:31-32)

Two boolean flags already on the `respondents` table:
- `consentMarketplace: boolean` — Stage 1: can appear in anonymous marketplace search
- `consentEnriched: boolean` — Stage 2: name/phone visible to authenticated searchers

Consent values are converted from form data strings in `submission-processing.service.ts:273-274`:
```typescript
const consentMarketplace = String(extracted['consentMarketplace'] ?? '').toLowerCase() === 'yes';
const consentEnriched = String(extracted['consentEnriched'] ?? '').toLowerCase() === 'yes';
```

### OSLSR_REQUIRED_FIELDS (packages/types/src/questionnaire.ts:101-103)

These form fields are guaranteed to exist in submissions from forms that pass validation:
```
consent_marketplace, consent_enriched, nin, phone_number, lga_id, years_experience, skills_possessed
```

`skills_possessed` is the primary source for `profession`. It is a XLSForm `select_multiple` field stored as a **space-delimited string of coded values**:
- Single value: `"carpentry"` → use directly
- Multiple values: `"carpentry plumbing welding"` → split on spaces, use first value as primary profession
- Missing: fall back to `profession`, `primary_skill`, `occupation`, `skill`
- See `export-query.service.ts:424` for canonical split pattern: `String(rawValue).split(' ').filter(Boolean)`

### BullMQ Worker Pattern (follow fraud-detection.worker.ts)

```typescript
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'marketplace-extraction-worker' });

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const marketplaceExtractionWorker = new Worker<MarketplaceExtractionJobData>(
  'marketplace-extraction',
  async (job: Job<MarketplaceExtractionJobData>) => {
    // ... processor logic
  },
  { connection, concurrency: 4 }
);
```

### Verified Badge Derivation

A profile gets `verified_badge = true` when the respondent has at least one submission where the fraud detection assessment resulted in `assessor_resolution = 'final_approved'`. Query pattern:
```sql
SELECT EXISTS (
  SELECT 1 FROM fraud_detections fd
  JOIN submissions s ON fd.submission_id = s.id
  WHERE s.respondent_id = $1
  AND fd.assessor_resolution = 'final_approved'
) AS is_verified
```

Note: `fraud_detections` schema uses `assessor_resolution` (text enum), NOT `status`. See prep-11 story notes for the confirmed column names.

### UPSERT Strategy

One profile per respondent. Latest submission wins:
```typescript
await db.insert(marketplaceProfiles).values({
  id: uuidv7(),
  respondentId,
  profession,
  lgaId,
  experienceLevel,
  verifiedBadge,
  consentEnriched: respondent.consentEnriched,
}).onConflictDoUpdate({
  target: marketplaceProfiles.respondentId,
  set: {
    profession,
    experienceLevel,
    verifiedBadge,
    consentEnriched: respondent.consentEnriched,
    updatedAt: new Date(),
  },
});
```

### tsvector Trigger (PostgreSQL)

The search vector auto-updates on INSERT/UPDATE. Trigger SQL (adjust weights per prep-4 spike output):
```sql
CREATE OR REPLACE FUNCTION marketplace_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.profession, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.experience_level, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_marketplace_search_vector
  BEFORE INSERT OR UPDATE ON marketplace_profiles
  FOR EACH ROW
  EXECUTE FUNCTION marketplace_search_vector_update();
```

### What This Story Does NOT Include (Future Stories)

| Feature | Story | Why Not Here |
|---------|-------|-------------|
| Public search API | 7-2 | Separate endpoint, needs rate limiting + bot protection |
| Anonymous profile display | 7-3 | Frontend, verified badge UI |
| Contact reveal + CAPTCHA | 7-4 | Authentication flow, hCaptcha integration |
| Profile self-edit (bio, portfolio) | 7-5 | Edit token, SMS integration |
| Contact view logging + rate limiting | 7-6 | Audit trail, 50/user/24h enforcement |
| `contact_reveals` table | 7-4 or 7-6 | Not needed until contact reveal is built |

### Project Structure Notes

**New files:**
- `apps/api/src/db/schema/marketplace.ts` — Schema
- `packages/types/src/marketplace.ts` — Type definitions
- `apps/api/src/queues/marketplace-extraction.queue.ts` — Queue
- `apps/api/src/workers/marketplace-extraction.worker.ts` — Worker
- Test files in corresponding `__tests__/` directories

**Modified files:**
- `apps/api/src/db/schema/index.ts` — Add marketplace schema export
- `packages/types/src/index.ts` — Add marketplace types export
- `apps/api/src/services/submission-processing.service.ts` — Add extraction queue hook (~line 177)
- `apps/api/src/workers/index.ts` — Register new worker

### Anti-Patterns to Avoid

- **Do NOT query the search index in this story** — the tsvector trigger and GIN index are set up here, but search queries are Story 7-2's responsibility.
- **Do NOT import from `@oslsr/types` in schema files** — drizzle-kit constraint. Inline constants with comments.
- **Do NOT create a separate `MarketplaceExtractionService`** — the worker processor is simple enough to be inline. If it grows, extract later.
- **Do NOT store PII in `marketplace_profiles`** — no names, phone numbers, NIN, or date of birth. These stay in `respondents` and are only exposed via JOIN in Story 7-4 (contact reveal).
- **Do NOT add the `contact_reveals` table** — that's Story 7-4/7-6 scope.
- **Do NOT add REST endpoints for marketplace** — this story is backend-only (worker + schema). Endpoints come in Stories 7-2 through 7-6.
- **Do NOT use `auto-increment` for IDs** — UUIDv7 per project convention.
- **Do NOT skip the tsvector trigger** — even though search is Story 7-2, the trigger must be created with the table so that all profiles have search vectors from day one.

### References

- [Source: epics.md:1950-1962] — Story 7.1 acceptance criteria
- [Source: prep-4-marketplace-data-model-spike.md] — Schema design, field mapping, search strategy (PREREQUISITE — read spike output first)
- [Source: submission-processing.service.ts:91] — processSubmission() hook point
- [Source: submission-processing.service.ts:26-46] — RESPONDENT_FIELD_MAP (field variant convention)
- [Source: submission-processing.service.ts:273-274] — Consent boolean conversion from form strings
- [Source: fraud-detection.queue.ts] — Queue pattern to follow
- [Source: fraud-detection.worker.ts] — Worker pattern to follow
- [Source: workers/index.ts] — Worker registration
- [Source: respondents.ts:31-32] — consentMarketplace, consentEnriched columns
- [Source: submissions.ts:58] — rawData JSONB column
- [Source: questionnaire.ts:101-103] — OSLSR_REQUIRED_FIELDS (guaranteed form fields)
- [Source: report.service.ts:64-94] — rawData JSONB extraction with COALESCE fallbacks
- [Source: architecture.md:1795-1891] — Full-text search strategy
- [Source: epic-6-retro-2026-03-04.md#VPS] — 2GB VPS at 26% RAM, start Epic 7 on current droplet

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Drizzle 0.30.x does not support `.using('gin')` on index builder — moved GIN index to custom-sql
- Integration test `submission-ingestion.integration.test.ts` needed mock for `marketplace-extraction.queue.js` after adding import to submission-processing.service.ts

### Completion Notes List
- Implemented `marketplace_profiles` table per prep-4 spike design (includes `skills` and `lgaName` fields not in original story spec — spike takes precedence)
- Created reusable `db/custom-sql/` pattern for trigger/extension management outside Drizzle's scope (idempotent apply.ts runner)
- Experience level normalization handles numeric values, canonical strings, and 20+ label variants mapped to 5 canonical levels
- Worker uses consent gate from respondent record (not rawData) — consistent with submission-processing.service.ts pattern
- LGA name resolved from lgas table by code; graceful degradation if LGA not found (profile created, just unfiltered)
- Added Drizzle relations for marketplace_profiles ↔ respondents (1:1)
- 31 new tests across 2 test files

### Change Log
- 2026-03-06: Story 7.1 implementation complete. All 7 tasks done, 31 new tests, 0 regressions.
- 2026-03-06: Code review fixes — H1: integration test assertion, M1: UPSERT comment, M2: trade fallback test (+1 test → 32 total), M4: extractSkills `??`→`||` fix. 37 tests pass, 0 regressions.

### File List
**New files:**
- `apps/api/src/db/schema/marketplace.ts` — marketplace_profiles Drizzle schema
- `apps/api/src/db/custom-sql/marketplace-trigger.sql` — tsvector trigger + GIN index DDL
- `apps/api/src/db/custom-sql/apply.ts` — custom SQL runner script
- `packages/types/src/marketplace.ts` — marketplace type definitions (all stories 7-1 through 7-6)
- `apps/api/src/queues/marketplace-extraction.queue.ts` — BullMQ queue with respondentId dedup
- `apps/api/src/workers/marketplace-extraction.worker.ts` — extraction worker (consent gate, field extraction, UPSERT, badge derivation)
- `apps/api/src/queues/__tests__/marketplace-extraction.queue.test.ts` — 3 queue tests
- `apps/api/src/workers/__tests__/marketplace-extraction.worker.test.ts` — 28 worker tests

**Modified files:**
- `apps/api/src/db/schema/index.ts` — added marketplace export
- `apps/api/src/db/schema/relations.ts` — added marketplace relations + import
- `apps/api/package.json` — added `db:custom` script
- `packages/types/src/index.ts` — added marketplace export
- `apps/api/src/services/submission-processing.service.ts` — added marketplace queue hook + import
- `apps/api/src/workers/index.ts` — registered marketplace worker + graceful shutdown
- `apps/api/src/services/__tests__/submission-ingestion.integration.test.ts` — added marketplace queue mock + assertion
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — sprint status sync

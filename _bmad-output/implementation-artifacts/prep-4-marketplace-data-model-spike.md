# Story 7.prep-4: Marketplace Data Model Spike

Status: done

## Story

As the **development team**,
I want a researched data model design for the anonymous skills marketplace,
so that Stories 7-1 through 7-6 can be implemented with a validated schema, search strategy, and PII stripping model — avoiding architectural rework.

## Problem Statement

Epic 7 introduces the first public unauthenticated routes — a skills marketplace where employers search anonymous worker profiles. This requires:
- A new `marketplace_profiles` table extracted from survey submissions
- Full-text search infrastructure (tsvector + pg_trgm) on PostgreSQL
- A two-tier PII model (anonymous vs enriched) governed by consent fields
- A contact reveal logging/rate-limiting table
- A BullMQ extraction worker triggered on submission ingestion

The architecture doc pre-decides PostgreSQL full-text search over external engines, but the spike must validate schema design, field mapping, search performance, and the single-DB vs read-replica question.

**This is a research spike. The deliverable is a design document, not production code.**

## Acceptance Criteria

1. **Given** the spike output, **when** Story 7-1 begins, **then** the `marketplace_profiles` schema DDL is ready to implement with no ambiguity.
2. **Given** the spike output, **when** Story 7-2 begins, **then** the full-text search query pattern (tsvector + GIN index + pg_trgm fallback) is documented with expected latency at 300K profiles.
3. **Given** the spike output, **when** reviewed, **then** the PII stripping model defines exactly which fields are visible at each consent tier (anonymous vs enriched).
4. **Given** the spike output, **when** reviewed, **then** form field mapping is documented: which `raw_data` keys map to which profile columns, with handling for missing/variant field names.
5. **Given** the spike output, **when** reviewed, **then** the single-DB vs read-replica decision is made with evidence (current load metrics, projected query cost, VPS RAM headroom).
6. **Given** the spike output, **when** reviewed, **then** `contact_reveals` schema and rate-limiting strategy (50/user/24h) are documented.
7. **Given** the spike output, **when** reviewed, **then** all type definitions needed for `@oslsr/types` are drafted (MarketplaceProfile, SearchFilters, ContactReveal).

## Tasks / Subtasks

- [x] Task 1: Design `marketplace_profiles` schema (AC: #1, #3)
  - [x] 1.1 Define columns: respondent_id (FK), profession, skills, lga_id (FK), lga_name (denormalized), experience_level, verified_badge, bio, portfolio_url, edit_token, edit_token_expires_at, consent_enriched, search_vector (tsvector), created_at, updated_at
  - [x] 1.2 Define primary key strategy (UUIDv7, per project convention)
  - [x] 1.3 Define unique constraint: one profile per respondent (respondent_id UNIQUE)
  - [x] 1.4 Define indexes: GIN on search_vector, btree on lga_id, btree on profession, btree on verified_badge
  - [x] 1.5 Document PII tiers:
    - **Anonymous (public):** profession, skills, lga_name, experience_level, verified_badge, bio, portfolio_url
    - **Enriched (authenticated + CAPTCHA + consent_enriched=true):** + first_name, last_name, phone_number (from respondents table via JOIN)
  - [x] 1.6 Document verified_badge derivation: `true` when respondent has at least one submission with `fraud_detections.assessor_resolution = 'final_approved'` — materialized column updated by BullMQ job
- [x] Task 2: Design search infrastructure (AC: #2, #5)
  - [x] 2.1 Define tsvector column composition with field weights:
    - A: profession (highest relevance)
    - B: skills (if multi-select, concatenated)
    - C: lga_name
    - D: experience_level
  - [x] 2.2 Define trigger function for auto-updating search_vector on INSERT/UPDATE
  - [x] 2.3 Document query pattern: `plainto_tsquery()` with `ts_rank()` relevance scoring
  - [x] 2.4 Document pg_trgm fallback for typo tolerance ("did you mean?" suggestions)
  - [x] 2.5 Evaluate single-DB vs read-replica:
    - Current VPS: 2GB RAM, 26% utilization, single PostgreSQL
    - Projected: 300K searchable profiles (1M respondents * 30% consent rate)
    - GIN index size estimate: ~30MB for 300K profiles
    - **Decision: Single-DB. No replica needed.** 26% RAM + 30MB index = negligible. Upgrade trigger: p95 > 150ms or connections > 80%.
  - [x] 2.6 Document rate limiting: 30 searches/min/IP + CAPTCHA after 10 searches
- [x] Task 3: Design form field mapping (AC: #4)
  - [x] 3.1 Map OSLSR_REQUIRED_FIELDS to profile columns:
    - `skills_possessed` → profession (first skill) + skills (all concatenated) — handles select_one, select_multiple, text
    - `years_experience` → experience_level
    - `lga_id` → lga_id + lga_name (resolved via LGA lookup)
    - `consent_marketplace` → extraction gate (only extract if 'Yes')
    - `consent_enriched` → consent_enriched flag on profile
  - [x] 3.2 Document extraction from `submissions.raw_data` JSONB: key lookup, fallback variants, missing field handling
  - [x] 3.3 Define idempotency strategy: UPSERT on respondent_id (latest submission wins, search_vector auto-updates via trigger)
  - [x] 3.4 Document BullMQ worker pattern: hook into existing submission ingestion pipeline (`webhook-ingestion.worker.ts` → `SubmissionProcessingService.processSubmission()` in `submission-processing.service.ts:91`), add marketplace extraction as a downstream step via separate queue/worker
- [x] Task 4: Design `contact_reveals` schema (AC: #6)
  - [x] 4.1 Define columns: id, searcher_id (FK to users), profile_id (FK to marketplace_profiles), ip_address, created_at
  - [x] 4.2 Define rate-limiting strategy: 50 reveals per user per 24h (query-time check, not Redis — simpler for audit trail)
  - [x] 4.3 Document index for rate-limit query: composite btree on (searcher_id, created_at)
- [x] Task 5: Draft type definitions (AC: #7)
  - [x] 5.1 MarketplaceProfile interface (anonymous view + enriched view)
  - [x] 5.2 MarketplaceSearchParams (query, filters: lga, profession, experience range, verifiedOnly)
  - [x] 5.3 MarketplaceSearchResult (paginated, with ts_rank score, suggestions)
  - [x] 5.4 ContactReveal (logging shape + rate limit response)
  - [x] 5.5 ProfileEnrichmentPayload (bio, portfolio_url via edit token)
- [x] Task 6: Write spike document
  - [x] 6.1 Compile all designs into `_bmad-output/implementation-artifacts/spike-marketplace-data-model.md`
  - [x] 6.2 Include: schema DDL, trigger SQL, query examples, type definitions, decision rationale, open questions resolved
  - [x] 6.3 Reference architecture.md sections (lines 1795-1891 search strategy, line 912 marketplace search)

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: Architecture doc pagination conflict — spike uses offset-based but arch doc specifies cursor-based. Document as explicit override in spike Section 2.3 + Open Questions Q6 [spike:Section 2.3, architecture.md:914]
- [x] [AI-Review][HIGH] H2: Architecture doc Redis caching omission — arch doc specifies 5-min TTL search cache, spike doesn't address it. Add Section 2.7 with decision [spike:Section 2, architecture.md:906-909]
- [x] [AI-Review][HIGH] H3: Empty/browse-all query pattern not designed — marketplace needs filter-only browsing when no search term. Add browse-all pattern to Section 2.3 [spike:Section 2.3]
- [x] [AI-Review][HIGH] H4: Consent dual-source-of-truth — `consentEnriched` on both `respondents` and `marketplace_profiles` without sync strategy. Document canonical source in Section 1.5 [spike:Section 1.5, respondents.ts:32]
- [x] [AI-Review][MEDIUM] M1: DDL not copy-paste ready — `users` import missing for `contact_reveals.searcherId` FK. Add import to DDL [spike:Section 1.1, Section 4.1]
- [x] [AI-Review][MEDIUM] M2: LGA FK constraint risk — `marketplace_profiles` adds FK to `lgas.code` but `respondents.lgaId` has none. Invalid LGA codes will cause insertion failures. Document graceful handling [spike:Section 1.1, lgas.ts, respondents.ts:28]
- [x] [AI-Review][MEDIUM] M3: Trigger deployment mechanism undefined — project uses `db:push` only, no migration infrastructure. Propose concrete deployment approach [spike:Section 2.2]
- [x] [AI-Review][MEDIUM] M4: `experience_level` values not canonicalized — different forms may use different choice labels, making filtering unreliable. Define canonical enum + mapping [spike:Section 3.1]
- [x] [AI-Review][LOW] L1: Timestamp convention inconsistency — spike uses `$defaultFn(() => new Date())` but story conventions state `.defaultNow()`. Align to `.defaultNow()` [spike:Section 1.1, Section 4.1]
- [x] [AI-Review][LOW] L2: `ON DELETE` behavior unspecified on all 3 FKs — should be explicit for government registry with 7-year retention [spike:Section 1.1, Section 4.1]

## Dev Notes

### This Is a Research Spike

**Deliverable:** A design document (`spike-marketplace-data-model.md`) with schema DDL, search patterns, and type drafts.
**Not deliverable:** Production migrations, service code, or frontend components.
The spike output feeds directly into Story 7-1 (extraction worker) and Story 7-2 (search interface).

### Current Data Model (What Exists)

**Respondents** (`apps/api/src/db/schema/respondents.ts`):
- `id` (uuid PK), `nin` (unique), `firstName`, `lastName`, `phoneNumber`, `dateOfBirth`
- `lgaId` (text FK → lgas.code), `source` (enum)
- `consentMarketplace` (boolean) — Stage 1: anonymous profile consent
- `consentEnriched` (boolean) — Stage 2: name/phone enrichment consent

**Submissions** (`apps/api/src/db/schema/submissions.ts`):
- `id` (uuid PK), `respondentId` (uuid FK → respondents.id)
- `rawData` (jsonb) — flat key-value pairs from form responses
- `questionnaireFormId` (text), `source` (enum), `gpsLatitude`, `gpsLongitude`

**OSLSR_REQUIRED_FIELDS** (`packages/types/src/questionnaire.ts:101-103`):
```
consent_marketplace, consent_enriched, nin, phone_number, lga_id, years_experience, skills_possessed
```

### Architecture Decisions Already Made

| Decision | Choice | Source |
|----------|--------|--------|
| Search engine | PostgreSQL tsvector + GIN index | architecture.md:1795-1891 |
| Typo tolerance | pg_trgm trigram similarity | architecture.md:1809 |
| External engines | Rejected (Meilisearch 512MB, Elasticsearch 2GB — overkill) | architecture.md |
| Target latency | < 250ms (expected 20-80ms actual) | architecture.md |
| Index size | ~30MB for 300K profiles | architecture.md |
| Rate limit | 30 searches/min/IP + CAPTCHA after 10 | architecture.md |
| Contact reveal limit | 50/user/24h | epics.md Story 7.6 |

### Spike Must Decide (Open Questions)

1. **Single DB or read replica?** Current VPS is at 26% RAM. Architecture doc mentions replica but it may be unnecessary at current scale. Spike should estimate query cost and recommend.
2. **`skills_possessed` field type?** Could be select_one, select_multiple, or free text depending on form design. Extraction logic must handle all variants.
3. **Profile update strategy?** When a respondent submits a new survey, does the profile fully replace or merge? (Recommendation: latest submission wins — UPSERT.)
4. **Verification badge freshness?** Badge derived from fraud_detections table — should it be a materialized column updated by trigger, or computed at query time via JOIN?
5. **pg_trgm extension availability?** Need to confirm extension is installed on production PostgreSQL (Docker). If not, document the `CREATE EXTENSION` needed.

### Existing PII Stripping Pattern

`respondent.service.ts:198-215` — conditional null values for supervisor role:
```typescript
nin: userRole === 'supervisor' ? null : respondent.nin,
firstName: userRole === 'supervisor' ? null : resolvedFirstName,
// ... same pattern for lastName, phoneNumber, dateOfBirth
```

The marketplace model should follow the same pattern but tier by consent level rather than role.

### Epic 7 Stories That Consume This Spike

| Story | Consumes | Key Question Answered |
|-------|----------|----------------------|
| 7-1: Marketplace Data Extraction Worker | Schema DDL, field mapping, BullMQ pattern | What table to write to, what fields to extract |
| 7-2: Public Marketplace Search Interface | Search query pattern, tsvector config | How to query, what indexes exist |
| 7-3: Anonymous Profile & Verified Badges | PII tier model, badge derivation | What to show/hide, how badge is computed |
| 7-4: Authenticated Contact Reveal & CAPTCHA | Enriched tier model, contact_reveals schema | What to reveal, how to log it |
| 7-5: Profile Enrichment via Edit Token | edit_token column, profile update pattern | How self-edit works |
| 7-6: Contact View Logging & Rate Limiting | contact_reveals schema, rate-limit query | How to enforce 50/user/24h |

### NDPA Compliance Constraints

- **Data minimization:** Anonymous profiles show only profession/LGA/experience — no PII
- **Consent-gated enrichment:** Name/phone only visible when `consent_enriched = true`
- **Audit logging:** Every contact reveal logged (immutable audit trail from Story 6-1)
- **Data residency:** Nigerian VPS only — no external search services
- **7-year retention:** Profiles follow same retention as respondent data

### Project Conventions for Schema Design

- **Primary key:** UUIDv7 (`uuid('id').primaryKey().$defaultFn(() => uuidv7())`)
- **Timestamps:** `timestamp('column', { withTimezone: true }).defaultNow()`
- **Enums:** text type with inline constants (NOT PostgreSQL native enum)
- **Schema files:** Must NOT import from `@oslsr/types` (drizzle-kit constraint)
- **Foreign keys:** Use `.references(() => table.column)` for Drizzle
- **Indexes:** Named with `idx_tablename_column` convention

### Project Structure Notes

- Spike output: `_bmad-output/implementation-artifacts/spike-marketplace-data-model.md` (new file)
- Schema location (future): `apps/api/src/db/schema/marketplace.ts` (new file for Story 7-1)
- Types location (future): `packages/types/src/marketplace.ts` (new file for Story 7-1)
- Worker location (future): `apps/api/src/workers/marketplace.worker.ts` (new file for Story 7-1)
- Existing ingestion worker: `apps/api/src/workers/webhook-ingestion.worker.ts` (BullMQ worker, calls processing service at line 167)
- Processing logic: `apps/api/src/services/submission-processing.service.ts:91` (`processSubmission()` — hook point for marketplace extraction)

### References

- [Source: architecture.md:1795-1891] — Full-text search strategy with tsvector/pg_trgm
- [Source: architecture.md:912-913] — Marketplace Search architecture overview
- [Source: epics.md:1927-2026] — Epic 7 full story definitions (7.1-7.6)
- [Source: epics.md:1948] — Architecture note: single DB vs read-replica evaluation
- [Source: respondents.ts:31-32] — consentMarketplace, consentEnriched columns
- [Source: submissions.ts:58] — rawData JSONB column
- [Source: questionnaire.ts:101-103] — OSLSR_REQUIRED_FIELDS including skills_possessed, years_experience
- [Source: respondent.service.ts:198-215] — Existing PII stripping pattern
- [Source: epic-6-retro-2026-03-04.md#Prep Tasks prep-4] — Spike definition
- [Source: MarketplacePreviewSection.tsx] — Existing placeholder UI
- [Source: PublicMarketplacePage.tsx] — Existing empty-state dashboard page

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Loaded respondents.ts, submissions.ts, questionnaire.ts, fraud-detections.ts, lgas.ts schemas
- Loaded architecture.md sections: full-text search strategy (lines 1795-1891), marketplace overview (lines 900-920)
- Loaded submission-processing.service.ts:processSubmission() and webhook-ingestion.worker.ts for BullMQ hook point
- All 5 open questions resolved with evidence-based decisions

### Completion Notes List
- Task 1: Designed marketplace_profiles schema with 14 columns, UUIDv7 PK, respondent_id UNIQUE constraint, 4 indexes (GIN + 3 btree). Added `skills` column (not in original spec) for full-text search breadth. Added `lga_name` denormalization for tsvector (avoids JOIN). PII tier model: anonymous (7 fields) + enriched (3 PII fields via JOIN). Badge = materialized column, not computed.
- Task 2: Full tsvector config with A-D weights, trigger function SQL, plainto_tsquery + ts_rank query pattern, pg_trgm fallback with similarity threshold 0.3. Single-DB decision: 26% RAM + 30MB GIN = negligible, 20-80ms latency well under 250ms target. Recommended separate connection pool for future replica switch. Rate limiting: 30/min/IP + CAPTCHA after 10 + page cap at 50.
- Task 3: Mapped all OSLSR_REQUIRED_FIELDS to profile columns. skills_possessed extraction handles select_one/select_multiple/text variants. Documented fallback key variants with logging. UPSERT on respondent_id (latest submission wins). BullMQ pattern: separate marketplace-extraction queue/worker, hooked after successful processSubmission in webhook worker.
- Task 4: contact_reveals schema with 5 columns, composite index for rate-limit query. 50/user/24h via query-time COUNT check (not Redis) — audit trail for free, max 50 rows scanned.
- Task 5: 8 TypeScript interfaces/types drafted: MarketplaceProfileAnonymous, MarketplaceProfileEnriched, MarketplaceSearchParams, MarketplaceSearchHit, MarketplaceSearchResult, ContactRevealEntry, ContactRevealResponse, ProfileEnrichmentPayload, EditTokenValidation.
- Task 6: Comprehensive spike document with schema DDL, trigger SQL, query examples, type definitions, decision rationale, dependency map.

### Change Log
- 2026-03-06: All 6 tasks complete. Spike document created at `_bmad-output/implementation-artifacts/spike-marketplace-data-model.md`.
- 2026-03-06: Adversarial code review completed. 10 issues found (4H, 4M, 2L). All 10 fixed in spike document: architecture alignment (pagination override Q6, Redis caching Q7, browse-all pattern), consent canonical source, LGA FK removal, users import, trigger deployment mechanism, experience level canonicalization, timestamp convention, ON DELETE behavior. Action items added and resolved.

### File List
- `_bmad-output/implementation-artifacts/spike-marketplace-data-model.md` (new) — Complete spike design document
- `_bmad-output/implementation-artifacts/prep-4-marketplace-data-model-spike.md` (modified) — Story file updated

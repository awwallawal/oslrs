# Marketplace Data Model Spike

**Date:** 2026-03-06
**Author:** Dev Agent (prep-4-marketplace-data-model-spike)
**Consumers:** Stories 7-1 through 7-6
**Status:** Complete

---

## 1. `marketplace_profiles` Schema Design

### 1.1 Table DDL (Drizzle)

```typescript
// apps/api/src/db/schema/marketplace.ts
import { pgTable, uuid, text, timestamp, boolean, index, customType } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { respondents } from './respondents.js';
import { lgas } from './lgas.js';
import { users } from './users.js';

/**
 * Custom tsvector type for Drizzle — PostgreSQL full-text search vector.
 * Drizzle does not have a built-in tsvector type.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const marketplaceProfiles = pgTable('marketplace_profiles', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // One profile per respondent (UNIQUE constraint)
  // ON DELETE RESTRICT: respondent deletion must be handled explicitly (7-year retention)
  respondentId: uuid('respondent_id').notNull().unique().references(() => respondents.id, { onDelete: 'restrict' }),

  // Searchable fields (anonymous tier — always visible)
  profession: text('profession'),                    // Primary skill extracted from skills_possessed
  skills: text('skills'),                            // Full skills text (select_multiple concatenated)
  // NOTE: No FK constraint — respondents.lgaId has no FK either. Invalid LGA codes
  // are handled gracefully: extraction worker validates lgaId against lgas table,
  // sets lgaId=null and lgaName=null if code not found (profile still created, just unfiltered by LGA).
  lgaId: text('lga_id'),
  lgaName: text('lga_name'),                         // Denormalized for search_vector (avoids JOIN)
  experienceLevel: text('experience_level'),          // From years_experience field

  // Government verification badge
  verifiedBadge: boolean('verified_badge').notNull().default(false),

  // Self-enrichment fields (editable via edit token — Story 7-5)
  bio: text('bio'),
  portfolioUrl: text('portfolio_url'),

  // Edit token for self-service profile enrichment
  editToken: text('edit_token'),
  editTokenExpiresAt: timestamp('edit_token_expires_at', { withTimezone: true }),

  // Consent tier — controls whether PII (name, phone) is revealable
  consentEnriched: boolean('consent_enriched').notNull().default(false),

  // Full-text search vector (auto-updated by trigger)
  searchVector: tsvector('search_vector'),

  // Standard timestamps (defaultNow = server-side default, per project convention)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // GIN index for full-text search
  idxMarketplaceSearchVector: index('idx_marketplace_search_vector').using('gin', table.searchVector),
  // Filter indexes
  idxMarketplaceLgaId: index('idx_marketplace_lga_id').on(table.lgaId),
  idxMarketplaceProfession: index('idx_marketplace_profession').on(table.profession),
  // Verified badge filter
  idxMarketplaceVerifiedBadge: index('idx_marketplace_verified_badge').on(table.verifiedBadge),
}));

export type MarketplaceProfile = typeof marketplaceProfiles.$inferSelect;
export type NewMarketplaceProfile = typeof marketplaceProfiles.$inferInsert;
```

### 1.2 Primary Key Strategy

UUIDv7 per project convention: `uuid('id').primaryKey().$defaultFn(() => uuidv7())`

### 1.3 Unique Constraint

One profile per respondent: `respondentId: uuid('respondent_id').notNull().unique()`

The `.unique()` creates an implicit btree index on `respondent_id` — no additional index needed.

### 1.4 Index Summary

| Index | Type | Column(s) | Purpose |
|-------|------|-----------|---------|
| `idx_marketplace_search_vector` | GIN | `search_vector` | Full-text search queries |
| `idx_marketplace_lga_id` | btree | `lga_id` | LGA filter queries |
| `idx_marketplace_profession` | btree | `profession` | Profession filter queries |
| `idx_marketplace_verified_badge` | btree | `verified_badge` | Badge filter queries |
| (implicit from UNIQUE) | btree | `respondent_id` | UPSERT lookups |

### 1.5 PII Tier Model

**Tier 1 — Anonymous (public, unauthenticated):**

| Field | Source | Notes |
|-------|--------|-------|
| `profession` | Extracted from `skills_possessed` | Primary skill |
| `skills` | Full skills text | All skills concatenated |
| `lga_name` | Denormalized from `lgas.name` | Human-readable LGA |
| `experience_level` | From `years_experience` | Range string |
| `verified_badge` | Computed from fraud_detections | Boolean |
| `bio` | Self-entered via edit token | Optional enrichment |
| `portfolio_url` | Self-entered via edit token | Optional enrichment |

**Tier 2 — Enriched (authenticated + CAPTCHA + `consent_enriched = true`):**

All Tier 1 fields PLUS (via JOIN to `respondents` table):

| Field | Source | Condition |
|-------|--------|-----------|
| `first_name` | `respondents.first_name` | `consent_enriched = true` |
| `last_name` | `respondents.last_name` | `consent_enriched = true` |
| `phone_number` | `respondents.phone_number` | `consent_enriched = true` |

**PII stripping pattern** (follows existing `respondent.service.ts:198-215`):

```typescript
// In marketplace service — conditional JOIN
const profile = consent_enriched
  ? { ...anonymousFields, firstName: respondent.firstName, lastName: respondent.lastName, phoneNumber: respondent.phoneNumber }
  : { ...anonymousFields, firstName: null, lastName: null, phoneNumber: null };
```

PII fields are NEVER stored on `marketplace_profiles` — they live only on `respondents` and are JOINed at query time when authorized. This prevents accidental PII leakage through the marketplace table.

> **Canonical Source for `consentEnriched`:** Both `respondents.consentEnriched` and `marketplace_profiles.consentEnriched` store this value. **`respondents` is the canonical source.** The marketplace copy is a denormalized cache updated by the extraction worker's UPSERT (latest submission wins). The contact reveal endpoint (Story 7-4) MUST JOIN to `respondents.consentEnriched` for the authorization check — never rely on the marketplace copy alone. This prevents stale consent from granting unauthorized PII access if the two tables diverge (e.g., manual DB correction, future consent-revocation feature). The marketplace copy exists only for query-time filtering ("show only profiles willing to share contact info") where a false positive is acceptable (user sees a "consent withdrawn" message on reveal attempt).

### 1.6 Verified Badge Derivation

**Rule:** `verified_badge = true` when the respondent has at least one submission where `fraud_detections.assessor_resolution = 'final_approved'`.

**Query for badge computation:**

```sql
SELECT DISTINCT fd.submission_id
FROM fraud_detections fd
JOIN submissions s ON s.id = fd.submission_id
WHERE s.respondent_id = $1
  AND fd.assessor_resolution = 'final_approved'
LIMIT 1;
```

**Decision: Materialized column (not computed at query time).**

Rationale:
- Badge status changes rarely (only when an assessor resolves a fraud detection)
- Computing via JOIN on every search would add ~50ms per result at scale
- Update strategy: BullMQ job triggered when `assessor_resolution` changes to `final_approved`
- The extraction worker (Story 7-1) sets initial badge value; a separate listener updates it on assessor resolution changes

---

## 2. Search Infrastructure Design

### 2.1 tsvector Column Composition with Field Weights

```sql
search_vector :=
  setweight(to_tsvector('english', COALESCE(profession, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(skills, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(lga_name, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(experience_level, '')), 'D');
```

| Weight | Field | Rationale |
|--------|-------|-----------|
| A (1.0) | `profession` | Primary search intent — "find an electrician" |
| B (0.4) | `skills` | Secondary — broader keyword match across all skills |
| C (0.2) | `lga_name` | Location context — "electrician in Ibadan North" |
| D (0.1) | `experience_level` | Minimal text relevance — better as a filter than a search term |

### 2.2 Trigger Function for Auto-Updating search_vector

```sql
CREATE OR REPLACE FUNCTION update_marketplace_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.profession, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.skills, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.lga_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.experience_level, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketplace_search_vector_update
BEFORE INSERT OR UPDATE ON marketplace_profiles
FOR EACH ROW
EXECUTE FUNCTION update_marketplace_search_vector();
```

**Note for Story 7-1:** Drizzle's `db:push` does not manage triggers. The trigger must be created separately.

**Recommended deployment approach:**

1. Create `apps/api/src/db/custom-sql/marketplace-trigger.sql` containing the trigger DDL above
2. Create `apps/api/src/db/custom-sql/apply.ts` — a tsx script that reads all `.sql` files in the directory and executes them via `sql.raw()` with `IF NOT EXISTS` / `CREATE OR REPLACE` guards (idempotent)
3. Add `"db:custom": "tsx src/db/custom-sql/apply.ts"` to `apps/api/package.json`
4. CI deploy step: run `pnpm --filter @oslsr/api db:push:force && pnpm --filter @oslsr/api db:custom` (push schema, then apply triggers/extensions)

This pattern is reusable for future custom SQL (extensions like `pg_trgm`, materialized views, etc.) without introducing a full migration framework.

### 2.3 Query Pattern: `plainto_tsquery()` with `ts_rank()` Relevance Scoring

```typescript
// Primary search query
const results = await db
  .select({
    id: marketplaceProfiles.id,
    profession: marketplaceProfiles.profession,
    skills: marketplaceProfiles.skills,
    lgaName: marketplaceProfiles.lgaName,
    experienceLevel: marketplaceProfiles.experienceLevel,
    verifiedBadge: marketplaceProfiles.verifiedBadge,
    bio: marketplaceProfiles.bio,
    portfolioUrl: marketplaceProfiles.portfolioUrl,
    rank: sql<number>`ts_rank(${marketplaceProfiles.searchVector}, plainto_tsquery('english', ${query}))`,
  })
  .from(marketplaceProfiles)
  .where(
    and(
      sql`${marketplaceProfiles.searchVector} @@ plainto_tsquery('english', ${query})`,
      // Optional filters
      filters.lgaId ? eq(marketplaceProfiles.lgaId, filters.lgaId) : undefined,
      filters.profession ? eq(marketplaceProfiles.profession, filters.profession) : undefined,
      filters.verifiedOnly ? eq(marketplaceProfiles.verifiedBadge, true) : undefined,
    )
  )
  .orderBy(sql`ts_rank(${marketplaceProfiles.searchVector}, plainto_tsquery('english', ${query})) DESC`)
  .limit(20)
  .offset(page * 20);
```

**Pagination:** Offset-based for simplicity. Capped at page 50 (1000 results max) to prevent scraping.

> **Architecture Override (Q6):** The architecture doc (line 914) specifies cursor-based pagination ("last seen ID"). This spike overrides to offset-based because: (1) 300K profiles is well within PostgreSQL offset performance range, (2) ts_rank ordering makes cursor-based complex (rank values aren't unique/stable), (3) page cap at 50 prevents the deep-offset performance degradation that cursors solve. If dataset exceeds 1M profiles, revisit cursor-based with a composite cursor `(rank, id)`.

**Browse-all pattern (no search term):**

When `query` is empty or blank, skip the tsvector match and return filter-only results:

```typescript
// Browse-all: no search term, just filters
const isSearchQuery = query && query.trim().length > 0;

const results = await db
  .select({
    id: marketplaceProfiles.id,
    profession: marketplaceProfiles.profession,
    skills: marketplaceProfiles.skills,
    lgaName: marketplaceProfiles.lgaName,
    experienceLevel: marketplaceProfiles.experienceLevel,
    verifiedBadge: marketplaceProfiles.verifiedBadge,
    bio: marketplaceProfiles.bio,
    portfolioUrl: marketplaceProfiles.portfolioUrl,
    rank: isSearchQuery
      ? sql<number>`ts_rank(${marketplaceProfiles.searchVector}, plainto_tsquery('english', ${query}))`
      : sql<number>`1`, // No relevance ranking for browse-all
  })
  .from(marketplaceProfiles)
  .where(
    and(
      isSearchQuery
        ? sql`${marketplaceProfiles.searchVector} @@ plainto_tsquery('english', ${query})`
        : undefined, // No tsvector filter for browse-all
      filters.lgaId ? eq(marketplaceProfiles.lgaId, filters.lgaId) : undefined,
      filters.profession ? eq(marketplaceProfiles.profession, filters.profession) : undefined,
      filters.verifiedOnly ? eq(marketplaceProfiles.verifiedBadge, true) : undefined,
    )
  )
  .orderBy(
    isSearchQuery
      ? sql`ts_rank(${marketplaceProfiles.searchVector}, plainto_tsquery('english', ${query})) DESC`
      : desc(marketplaceProfiles.verifiedBadge), // Verified profiles first for browse
    desc(marketplaceProfiles.createdAt), // Then newest
  )
  .limit(20)
  .offset(page * 20);
```

This supports the common marketplace UX of "show all electricians in Ibadan North" without requiring a search term.

### 2.4 pg_trgm Fallback for Typo Tolerance

```sql
-- Ensure extension is installed (one-time, requires superuser)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram index on profession for fuzzy matching
CREATE INDEX idx_marketplace_profession_trgm
ON marketplace_profiles
USING GIN(profession gin_trgm_ops);
```

**"Did you mean?" fallback query** (when tsvector returns 0 results):

```typescript
// Trigram similarity fallback
const suggestions = await db
  .select({
    profession: marketplaceProfiles.profession,
    similarity: sql<number>`similarity(${marketplaceProfiles.profession}, ${query})`,
  })
  .from(marketplaceProfiles)
  .where(sql`similarity(${marketplaceProfiles.profession}, ${query}) > 0.3`)
  .orderBy(sql`similarity(${marketplaceProfiles.profession}, ${query}) DESC`)
  .limit(5);
```

**pg_trgm extension availability:** Must be enabled on production PostgreSQL. The Docker PostgreSQL image includes pg_trgm by default. Story 7-1 should include `CREATE EXTENSION IF NOT EXISTS pg_trgm;` in the migration script.

### 2.5 Single-DB vs Read-Replica Decision

| Factor | Current State | Projected (300K profiles) |
|--------|--------------|--------------------------|
| VPS RAM | 2GB, 26% utilization | ~35-40% with GIN index |
| GIN index size | N/A | ~30MB |
| Search query latency | N/A | 20-80ms (PostgreSQL FTS benchmarks) |
| Write load | ~100 submissions/day | Same (search is read-only) |
| Connection pool | 20 connections | 20 + 5 for search = 25 |

**Decision: Single-DB. No read replica needed.**

**Rationale:**
1. **RAM headroom:** 30MB GIN index on a system using 26% of 2GB (~520MB used) is negligible.
2. **Query isolation:** Search queries are read-only SELECTs with GIN index — they don't contend with write transactions (PostgreSQL MVCC handles this).
3. **Latency:** 20-80ms expected latency is 3-12x under the 250ms target on a single instance.
4. **Operational simplicity:** Replica adds streaming replication config, connection routing, and failover complexity.
5. **Cost:** No additional infrastructure cost.

**Upgrade trigger:** If monitoring (Story 6-2) shows:
- Search p95 latency > 150ms sustained
- PostgreSQL connection pool saturation (>80% of 20 connections)
- RAM utilization > 70%

Then add a read replica. The marketplace service should use a separate connection pool from day one (even if pointing at the same DB) so the switch is a config change, not a code change.

**Implementation recommendation for Story 7-2:**

```typescript
// Use a dedicated pool name for marketplace queries
// Initially points to same DB; can be redirected to replica later
const marketplacePool = createPool({
  connectionString: process.env.MARKETPLACE_DATABASE_URL || process.env.DATABASE_URL,
  max: 5, // Separate from main API pool
});
```

### 2.6 Search Rate Limiting

| Limit | Value | Enforcement |
|-------|-------|-------------|
| Search queries | 30/min/IP | Express rate-limiter middleware on `/api/v1/marketplace/search` |
| CAPTCHA gate | After 10 searches in session | Frontend session counter + hCaptcha challenge |
| Max pagination depth | Page 50 (1000 results) | API enforces `page <= 50` |
| Contact reveals | 50/user/24h | Query-time check (see Section 4) |

**Redis-based rate limiting** (aligns with existing rate-limiter in the project):

```typescript
// Dedicated rate limiter for marketplace search
const marketplaceSearchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many search requests. Please try again in a minute.' },
});
```

### 2.7 Redis Search Result Caching

> **Architecture Alignment:** The architecture doc (lines 906-909) specifies Redis caching for search results with 5-minute TTL.

**Decision: Adopt Redis caching for Story 7-2, but simplify the invalidation strategy.**

| Aspect | Architecture Spec | Spike Recommendation |
|--------|------------------|---------------------|
| Cache layer | Redis | Redis (same) |
| TTL | 5 minutes | 5 minutes (same) |
| Cache key | `marketplace:search:${JSON.stringify(queryParams)}` | `marketplace:search:${hash(queryParams)}` (hashed — raw JSON keys can be long) |
| Invalidation | BullMQ job on new profile creation | TTL-only (no active invalidation) |

**Why TTL-only invalidation (no active invalidation):**
- New profiles trickle in (~100 submissions/day), not burst arrivals
- 5-minute staleness is acceptable for a marketplace (not real-time)
- Active invalidation (flush all search cache on any new profile) is wasteful — most cached queries won't include the new profile
- Simplifies implementation: no invalidation queue, no cache key enumeration

**Implementation pattern for Story 7-2:**

```typescript
async function searchWithCache(params: MarketplaceSearchParams): Promise<MarketplaceSearchResult> {
  const cacheKey = `marketplace:search:${hashSearchParams(params)}`;

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const result = await executeSearch(params);

  await redis.setex(cacheKey, 300, JSON.stringify(result)); // 5-minute TTL
  return result;
}
```

---

## 3. Form Field Mapping Design

### 3.1 OSLSR_REQUIRED_FIELDS to Profile Column Mapping

| rawData Key | Profile Column | Extraction Strategy |
|-------------|---------------|---------------------|
| `skills_possessed` | `profession` + `skills` | See 3.1.1 below |
| `years_experience` | `experience_level` | Normalized to canonical enum (see 3.1.2 below) |
| `lga_id` | `lga_id` + `lga_name` | `lga_id` from rawData, `lga_name` resolved via LGA lookup |
| `consent_marketplace` | (extraction gate) | If `!= 'Yes'`, skip extraction entirely |
| `consent_enriched` | `consent_enriched` | Boolean: `value === 'Yes'` |

**3.1.1 `skills_possessed` Extraction Strategy:**

The `skills_possessed` field type depends on form design (select_one, select_multiple, or text):

```typescript
function extractSkills(rawData: Record<string, unknown>): { profession: string; skills: string } {
  const skillsValue = rawData['skills_possessed'];

  if (!skillsValue) {
    return { profession: '', skills: '' };
  }

  const skillsStr = String(skillsValue);

  // select_multiple: space-separated values (ODK/XLSForm convention)
  // select_one: single value
  // text: free-form string
  const skillsList = skillsStr.includes(' ')
    ? skillsStr.split(' ').map(s => s.trim()).filter(Boolean)
    : [skillsStr.trim()];

  return {
    profession: skillsList[0] || '',   // Primary skill = first selected
    skills: skillsList.join(', '),      // All skills concatenated for search
  };
}
```

**3.1.2 `years_experience` Normalization Strategy:**

Different forms may use different experience choice labels. The extraction worker must normalize to canonical values:

```typescript
/** Canonical experience levels for consistent filtering */
const EXPERIENCE_LEVELS = ['entry', '1-3', '4-7', '8-15', '15+'] as const;
type ExperienceLevel = typeof EXPERIENCE_LEVELS[number];

/** Maps raw form values to canonical experience levels */
function normalizeExperienceLevel(raw: string | undefined): ExperienceLevel | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();

  // Direct canonical match
  if (EXPERIENCE_LEVELS.includes(lower as ExperienceLevel)) return lower as ExperienceLevel;

  // Numeric extraction fallback
  const years = parseInt(lower, 10);
  if (!isNaN(years)) {
    if (years < 1) return 'entry';
    if (years <= 3) return '1-3';
    if (years <= 7) return '4-7';
    if (years <= 15) return '8-15';
    return '15+';
  }

  // Common label variants
  const labelMap: Record<string, ExperienceLevel> = {
    'none': 'entry', 'no experience': 'entry', 'beginner': 'entry', 'fresher': 'entry',
    '1-3 years': '1-3', '1 to 3': '1-3', 'junior': '1-3',
    '4-7 years': '4-7', '4 to 7': '4-7', 'mid': '4-7', 'intermediate': '4-7',
    '8-15 years': '8-15', '8 to 15': '8-15', 'senior': '8-15',
    '15+ years': '15+', 'over 15': '15+', 'expert': '15+',
  };
  return labelMap[lower] ?? null; // null = unrecognized, logged as warning
}
```

Story 7-2 can then offer a dropdown filter with these 5 canonical values.

**Note:** Skills choice labels (human-readable) vs codes (machine values) — the extraction should store **labels** for search relevance. If rawData stores codes, the extraction worker must resolve codes to labels via the form schema's choices list.

### 3.2 Extraction from `submissions.raw_data` JSONB

```typescript
function extractProfileData(
  rawData: Record<string, unknown>,
  formSchema: NativeFormSchema
): MarketplaceProfileInput | null {
  // Gate: consent_marketplace must be 'Yes'
  const consentMarketplace = rawData['consent_marketplace'];
  if (consentMarketplace !== 'Yes' && consentMarketplace !== 'yes' && consentMarketplace !== true) {
    return null; // Do not extract — respondent did not consent
  }

  const { profession, skills } = extractSkills(rawData);

  // Resolve LGA name from lga_id
  const lgaId = rawData['lga_id'] as string | undefined;

  const consentEnriched = rawData['consent_enriched'];

  return {
    profession,
    skills,
    lgaId: lgaId || null,
    // lgaName resolved by worker via DB lookup against lgas table.
    // If lgaId not found in lgas, set both lgaId=null and lgaName=null
    // (graceful degradation — profile still created, just unfiltered by LGA).
    experienceLevel: normalizeExperienceLevel(rawData['years_experience'] as string | undefined),
    consentEnriched: consentEnriched === 'Yes' || consentEnriched === 'yes' || consentEnriched === true,
  };
}
```

**Fallback variant handling:**

| Primary Key | Fallback Variants | Notes |
|-------------|-------------------|-------|
| `skills_possessed` | `skill`, `profession`, `trade` | Log warning if fallback used |
| `years_experience` | `experience`, `exp_years` | Log warning if fallback used |
| `consent_marketplace` | `marketplace_consent` | Log warning if fallback used |
| `consent_enriched` | `enriched_consent` | Log warning if fallback used |
| `lga_id` | `lga`, `local_government` | Already on respondents table; prefer respondent.lgaId |

**Missing field handling:** If a required field is missing from rawData, log a warning and extract with null values. A profile with null profession/skills is still valid (it just won't appear in search results effectively).

### 3.3 Idempotency Strategy: UPSERT on `respondent_id`

**Latest submission wins.** When a respondent submits multiple surveys, the most recent extraction overwrites the profile.

```typescript
await db
  .insert(marketplaceProfiles)
  .values({
    respondentId,
    profession,
    skills,
    lgaId,
    lgaName,
    experienceLevel,
    consentEnriched,
    // verifiedBadge computed separately
  })
  .onConflictDoUpdate({
    target: marketplaceProfiles.respondentId,
    set: {
      profession,
      skills,
      lgaId,
      lgaName,
      experienceLevel,
      consentEnriched,
      updatedAt: sql`now()`,
      // search_vector auto-updated by trigger
      // verifiedBadge NOT overwritten here (managed by badge worker)
    },
  });
```

**Note:** The `search_vector` trigger fires on both INSERT and UPDATE, so the tsvector is always current after an UPSERT.

### 3.4 BullMQ Worker Pattern

**Hook point:** After `SubmissionProcessingService.processSubmission()` completes successfully in `webhook-ingestion.worker.ts`.

The existing flow:
1. Webhook receives submission
2. `runProcessing()` calls `SubmissionProcessingService.processSubmission()`
3. processSubmission extracts respondent, links submission, queues fraud detection

**New step (Story 7-1):** After step 2 succeeds, queue marketplace extraction.

```typescript
// In webhook-ingestion.worker.ts, after successful processing:
if (result.action === 'processed' && result.respondentId) {
  await marketplaceExtractionQueue.add('extract-profile', {
    submissionId,
    respondentId: result.respondentId,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
  });
}
```

**Separate worker file:** `apps/api/src/workers/marketplace.worker.ts`

```typescript
// marketplace.worker.ts — processes profile extraction jobs
export const marketplaceWorker = new Worker('marketplace-extraction', async (job) => {
  const { submissionId, respondentId } = job.data;

  // 1. Load submission rawData
  // 2. Load respondent (for lgaId fallback)
  // 3. Extract profile data (consent gate, field mapping)
  // 4. Resolve lgaName from lgaId via lgas table
  // 5. Check verified badge status
  // 6. UPSERT into marketplace_profiles
}, { connection: redisConnection });
```

**Why a separate worker (not inline in processSubmission)?**
- Marketplace extraction failure should NOT block submission processing
- Separate retry policy (3 attempts vs submission processing's own policy)
- Can be disabled independently (feature flag) without touching ingestion
- Keeps processSubmission focused on its core responsibility

---

## 4. `contact_reveals` Schema Design

### 4.1 Table DDL (Drizzle)

```typescript
// In apps/api/src/db/schema/marketplace.ts (same file as marketplace_profiles)

// Note: users import already included at top of file (see Section 1.1)
export const contactReveals = pgTable('contact_reveals', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Who revealed whose contact info
  // ON DELETE RESTRICT: user deletion must handle audit trail (NDPA compliance)
  searcherId: uuid('searcher_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  // ON DELETE RESTRICT: profile deletion must not orphan audit records
  profileId: uuid('profile_id').notNull().references(() => marketplaceProfiles.id, { onDelete: 'restrict' }),

  // Audit metadata
  ipAddress: text('ip_address'),

  // Timestamp (defaultNow = server-side default, per project convention)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Rate-limit query: count reveals per searcher in last 24h
  idxContactRevealsSearcherCreatedAt: index('idx_contact_reveals_searcher_created_at')
    .on(table.searcherId, table.createdAt),
  // Audit: which profiles were revealed
  idxContactRevealsProfileId: index('idx_contact_reveals_profile_id').on(table.profileId),
}));

export type ContactReveal = typeof contactReveals.$inferSelect;
export type NewContactReveal = typeof contactReveals.$inferInsert;
```

### 4.2 Rate-Limiting Strategy: 50 Reveals per User per 24h

**Query-time check (not Redis)** — simpler and provides audit trail for free:

```typescript
async function checkRevealRateLimit(searcherId: string): Promise<{ allowed: boolean; remaining: number }> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactReveals)
    .where(
      and(
        eq(contactReveals.searcherId, searcherId),
        gte(contactReveals.createdAt, twentyFourHoursAgo),
      )
    );

  const used = result?.count ?? 0;
  const limit = 50;

  return {
    allowed: used < limit,
    remaining: Math.max(0, limit - used),
  };
}
```

**Why query-time check over Redis:**
- Every reveal is already persisted for NDPA audit compliance (immutable audit trail)
- The `idx_contact_reveals_searcher_created_at` index makes this a fast index scan
- No Redis-DB sync drift risk
- At 50/user/day, the query scans at most 50 rows per check — negligible cost

### 4.3 Index for Rate-Limit Query

Composite index: `(searcher_id, created_at DESC)`

The index `idx_contact_reveals_searcher_created_at` on `(searcherId, createdAt)` supports:
- Rate-limit COUNT query: exact match on searcherId + range scan on createdAt
- Audit lookups: all reveals by a specific user, ordered by time

---

## 5. Type Definitions Draft

```typescript
// packages/types/src/marketplace.ts

// ============================================================================
// Marketplace Profile Types
// ============================================================================

/**
 * Anonymous profile view — visible to all public visitors
 */
export interface MarketplaceProfileAnonymous {
  id: string;
  profession: string | null;
  skills: string | null;
  lgaName: string | null;
  experienceLevel: string | null;
  verifiedBadge: boolean;
  bio: string | null;
  portfolioUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Enriched profile view — visible after auth + CAPTCHA + consent check
 * Extends anonymous with PII fields from respondents table
 */
export interface MarketplaceProfileEnriched extends MarketplaceProfileAnonymous {
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  consentEnriched: true; // Only enriched profiles reach this interface
}

/**
 * Union type for profile responses
 */
export type MarketplaceProfileView = MarketplaceProfileAnonymous | MarketplaceProfileEnriched;

// ============================================================================
// Search Types
// ============================================================================

/**
 * Search request parameters
 */
export interface MarketplaceSearchParams {
  query: string;                        // Full-text search query
  lgaId?: string;                       // Filter by LGA code
  profession?: string;                  // Filter by exact profession
  experienceLevelMin?: string;          // Filter by minimum experience
  experienceLevelMax?: string;          // Filter by maximum experience
  verifiedOnly?: boolean;               // Only show verified badge profiles
  page?: number;                        // Pagination (0-indexed, max 50)
  pageSize?: number;                    // Results per page (default 20, max 50)
}

/**
 * Individual search result with relevance score
 */
export interface MarketplaceSearchHit {
  profile: MarketplaceProfileAnonymous;
  rank: number;                         // ts_rank relevance score (0-1)
}

/**
 * Paginated search results
 */
export interface MarketplaceSearchResult {
  data: MarketplaceSearchHit[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    query: string;
  };
  suggestions?: string[];               // pg_trgm "did you mean?" (when 0 results)
}

// ============================================================================
// Contact Reveal Types
// ============================================================================

/**
 * Contact reveal log entry
 */
export interface ContactRevealEntry {
  id: string;
  searcherId: string;
  profileId: string;
  ipAddress: string | null;
  createdAt: string;
}

/**
 * Contact reveal response (includes rate limit info)
 */
export interface ContactRevealResponse {
  profile: MarketplaceProfileEnriched;
  rateLimit: {
    remaining: number;                  // Reveals remaining in 24h window
    limit: number;                      // Total limit (50)
    resetsAt: string;                   // ISO timestamp of oldest reveal expiry
  };
}

// ============================================================================
// Profile Enrichment Types (Edit Token — Story 7-5)
// ============================================================================

/**
 * Payload for self-service profile enrichment via edit token
 */
export interface ProfileEnrichmentPayload {
  bio?: string;                         // Max 500 characters
  portfolioUrl?: string;                // Must be valid URL
}

/**
 * Edit token validation response
 */
export interface EditTokenValidation {
  valid: boolean;
  profileId?: string;
  expiresAt?: string;
}
```

---

## 6. Open Questions — Resolved

### Q1: Single DB or read replica?

**Decision: Single DB.** See Section 2.5 for full analysis. 26% RAM utilization with 30MB index overhead is negligible. Add replica only if monitoring triggers thresholds.

### Q2: `skills_possessed` field type?

**Decision: Handle all variants.** Split on spaces for select_multiple, use as-is for select_one/text. First skill becomes `profession`, all skills concatenated into `skills` field. See Section 3.1.1.

### Q3: Profile update strategy?

**Decision: Latest submission wins (UPSERT).** See Section 3.3. `ON CONFLICT (respondent_id) DO UPDATE` overwrites searchable fields. `verifiedBadge` managed separately.

### Q4: Verification badge freshness?

**Decision: Materialized column updated by worker.** See Section 1.6. A BullMQ job updates the badge when `assessor_resolution` changes. Not computed at query time (avoids JOIN overhead per search result).

### Q5: pg_trgm extension availability?

**Decision: Available by default in Docker PostgreSQL.** Story 7-1 migration script must include `CREATE EXTENSION IF NOT EXISTS pg_trgm;`. Requires superuser — the application DB user should have this role (already the case in our Docker setup).

### Q6: Offset-based or cursor-based pagination?

**Decision: Offset-based with page cap at 50.** Architecture doc (line 914) specifies cursor-based ("last seen ID"), but this spike overrides it because: (1) ts_rank ordering makes cursor-based complex — rank scores aren't unique or stable across page loads, (2) 300K rows is well within PostgreSQL offset performance range, (3) page cap at 50 prevents deep-offset degradation. Revisit if dataset exceeds 1M profiles.

### Q7: Redis caching for search results?

**Decision: Adopt with TTL-only invalidation (no active invalidation).** Architecture doc (lines 906-909) specifies Redis caching with 5-min TTL. Adopted in Section 2.7 with simplified invalidation — TTL expiry only, no BullMQ invalidation job on new profiles. See Section 2.7 for rationale.

---

## 7. Summary: Schema Relationships

```
respondents (existing)
  |-- id (PK, uuid)
  |-- nin, firstName, lastName, phoneNumber (PII)
  |-- lgaId (FK → lgas.code)
  |-- consentMarketplace, consentEnriched
  |
  └── marketplace_profiles (new, 1:1)
        |-- id (PK, uuid)
        |-- respondentId (FK → respondents.id, UNIQUE)
        |-- profession, skills, lgaName, experienceLevel (searchable)
        |-- verifiedBadge (computed from fraud_detections)
        |-- bio, portfolioUrl (self-enrichment)
        |-- editToken, editTokenExpiresAt
        |-- consentEnriched (controls PII reveal)
        |-- searchVector (tsvector, auto-updated by trigger)
        |
        └── contact_reveals (new, 1:N)
              |-- id (PK, uuid)
              |-- searcherId (FK → users.id)
              |-- profileId (FK → marketplace_profiles.id)
              |-- ipAddress
              |-- createdAt
```

## 8. Story Dependency Map

| Story | Depends on from this spike |
|-------|---------------------------|
| **7-1** Extraction Worker | `marketplace_profiles` DDL, field mapping, BullMQ pattern, trigger SQL, UPSERT pattern |
| **7-2** Search Interface | tsvector config, query pattern, pg_trgm fallback, rate limiting, pagination |
| **7-3** Anonymous Profile & Badges | PII tier model, badge derivation, anonymous view type |
| **7-4** Contact Reveal & CAPTCHA | `contact_reveals` DDL, enriched tier model, rate-limit query, reveal response type |
| **7-5** Profile Enrichment | edit_token columns, `ProfileEnrichmentPayload` type |
| **7-6** Contact View Logging | `contact_reveals` schema, rate-limit strategy, audit index |

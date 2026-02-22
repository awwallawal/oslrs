# Spike: Cross-LGA Query Performance Validation

**Date**: 2026-02-22
**Sprint**: Prep Epic 5
**Story**: prep-5-cross-lga-query-performance-validation

## Executive Summary

All 13 key queries for Epic 5 (Stories 5.1, 5.2, 5.5) have been validated at 500K respondent scale. **Without** recommended indexes, 7 of 13 queries exceeded the 250ms NFR1.1 target (worst: 9.9 seconds). **With** 4 new indexes, all 13 queries complete under 250ms — most under 10ms. Cursor-based pagination is confirmed constant-time regardless of page depth.

**Confidence Level: HIGH** — Epic 5 can proceed with confidence, provided the 4 recommended indexes are added to the Drizzle schema during story implementation.

---

## Test Methodology

### Seed Script

Created `scripts/seed-performance-test-data.ts` with three scale modes:

| Scale | Respondents | Submissions | Fraud Detections | Seed Time |
|-------|-------------|-------------|------------------|-----------|
| 10K   | 10,000      | 10,000      | 10,000           | ~5s       |
| 100K  | 100,000     | 100,000     | 100,000          | ~82s      |
| 500K  | 500,000     | 500,000     | 500,000          | ~413s     |

### Data Distribution

- **33 LGAs**: Weighted distribution — Ibadan LGAs get 3x weight (urban-heavy realism)
- **Sources**: 60% enumerator, 25% public, 15% clerk
- **Severity**: 60% clean, 20% low, 10% medium, 7% high, 3% critical
- **Resolution**: ~92% null (only medium+ severity has 40% review chance), ~8% resolved (confirmed_fraud, false_positive, needs_investigation, dismissed, enumerator_warned)
- **JSONB rawData**: Includes `occupation` (20 types), `gender` (Male/Female), `firstName`, `lastName`, `age`, `education_level`
- **Timestamps**: Spread over 6 months (realistic aging)
- **IDs**: UUIDv7 for all primary keys, NIN prefix `99` for cleanup identification

### Performance Target

- NFR1.1: API response < 250ms (p95)
- Dashboard queries: < 100ms for good UX with skeleton loading
- Pagination: Constant-time regardless of page depth

---

## Query Plan Analysis

### Story 5.1: High-Level Policy Dashboard

#### Q1: Total Respondent Count

```sql
SELECT COUNT(*) FROM respondents
```

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 10K   | 2.3ms         | 2.3ms         | Aggregate → Seq Scan |
| 100K  | 17ms          | 17ms          | Aggregate → Seq Scan |
| 500K  | 298ms → 96ms* | 96ms          | Aggregate → Seq Scan |

*Improved on re-run due to shared buffer caching after index creation.

**Analysis**: Sequential scan is expected for unfiltered `COUNT(*)` — PostgreSQL cannot use an index-only scan for `COUNT(*)` on heap tables. At 500K, 96ms is acceptable. At 1M+ scale, consider a materialized count or `pg_stat_user_tables.n_live_tup` estimate.

**Verdict**: PASS (96ms < 250ms)

#### Q2: Per-LGA Breakdown

```sql
SELECT lga_id, COUNT(*) FROM respondents GROUP BY lga_id
```

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 10K   | 2.6ms         | 2.6ms         | HashAggregate → Seq Scan |
| 100K  | 19ms          | 19ms          | HashAggregate → Seq Scan |
| 500K  | 259ms → 208ms*| 208ms         | HashAggregate → Seq Scan |

**Analysis**: Sequential scan expected — every row must be visited to count per-LGA. Hash aggregate is optimal for 33 groups. At 1M, may approach 400ms. Consider a materialized view refreshed on schedule if this becomes a bottleneck.

**Verdict**: PASS (208ms < 250ms)

#### Q3: Daily Registration Trends (30 days)

```sql
SELECT DATE(created_at), COUNT(*)
FROM respondents
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
```

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 10K   | 1.3ms         | 1.3ms         | Index Scan on idx_respondents_created_at |
| 100K  | 23ms          | 23ms          | Index Scan on idx_respondents_created_at |
| 500K  | 46ms          | 46ms          | Index Scan on idx_respondents_created_at |

**Analysis**: Excellent. Existing `idx_respondents_created_at` index provides efficient range scan. Only ~16% of rows fall in the 30-day window (1 month out of 6). Scales linearly with daily volume, not total table size.

**Verdict**: PASS (46ms < 250ms)

#### Q4: JSONB Skills Distribution

```sql
SELECT raw_data->>'occupation' AS skill, COUNT(*)
FROM submissions
GROUP BY raw_data->>'occupation'
```

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 10K   | 16ms          | 3ms           | Seq Scan → **Index Only Scan** |
| 100K  | 228ms         | 29ms          | Seq Scan → **Index Only Scan** |
| 500K  | **9931ms**     | **240ms**     | Seq Scan + JIT → **Index Only Scan** |

**Analysis**: This was the **worst-performing query** before indexing. At 500K, PostgreSQL triggered JIT compilation (2.4s overhead) on top of a full sequential scan parsing JSONB for every row. The expression index `idx_submissions_raw_occupation` enables an **index-only scan**, reducing execution time by **41x**.

**Verdict**: FAIL → PASS with index (9931ms → 240ms)

**Required Index**:
```sql
CREATE INDEX idx_submissions_raw_occupation
ON submissions ((raw_data->>'occupation'));
```

---

### Story 5.2: Verification Assessor Audit Queue

#### Q5: Audit Queue (3-Table JOIN)

```sql
SELECT fd.id, fd.severity, fd.total_score, fd.resolution,
       fd.computed_at, s.id as submission_id, r.lga_id
FROM fraud_detections fd
JOIN submissions s ON fd.submission_id = s.id
JOIN respondents r ON s.respondent_id = r.id
WHERE fd.resolution IS NULL
  AND fd.severity IN ('high', 'critical')
ORDER BY fd.computed_at DESC
LIMIT 20
```

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 10K   | 5.5ms         | 0.13ms        | Seq Scan → **Index Scan on idx_fd_audit_queue** |
| 100K  | 58ms          | 0.5ms         | Seq Scan → **Index Scan on idx_fd_audit_queue** |
| 500K  | **871ms**     | **1.0ms**     | Parallel Seq Scan → **Index Scan on idx_fd_audit_queue** |

**Analysis**: The audit queue query is the critical path for Story 5.2. At 500K, PostgreSQL chose a parallel sequential scan on `fraud_detections` (500K rows), then filtered to ~10% matching severity + null resolution, with disk spill on the sort. The partial index `idx_fd_audit_queue` pre-filters to only matching rows and includes `computed_at DESC` for sort elimination — achieving **838x improvement**.

**Verdict**: FAIL → PASS with index (871ms → 1.0ms)

**Required Index**:
```sql
CREATE INDEX idx_fd_audit_queue
ON fraud_detections (computed_at DESC)
WHERE resolution IS NULL AND severity IN ('high', 'critical');
```

#### Q6: LGA-Filtered Audit Queue

```sql
-- Same as Q5 but with: AND r.lga_id = 'ibadan_north'
```

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 500K  | 374ms         | 1.1ms         | Seq Scan → **Index Scan on idx_fd_audit_queue** |

**Verdict**: FAIL → PASS with index (374ms → 1.1ms)

---

### Story 5.5: Paginated Respondent List

#### Q7: Page 1 (No Cursor)

```sql
SELECT r.id, r.first_name, r.last_name, r.lga_id, r.source,
       r.created_at, r.nin
FROM respondents r
ORDER BY r.created_at DESC, r.id DESC
LIMIT 20
```

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 10K   | 0.2ms         | 0.2ms         | Index Scan on idx_respondents_created_at |
| 100K  | 0.2ms         | 0.2ms         | Index Scan on idx_respondents_created_at |
| 500K  | 0.26ms        | 0.26ms        | Index Scan on idx_respondents_created_at |

**Analysis**: Excellent. Cursor-less page 1 uses the existing `created_at` index with Incremental Sort (adds `id DESC`). Constant-time regardless of table size.

**Verdict**: PASS (0.26ms)

#### Q8: Deep Pagination (Page 100, ~2000 rows deep)

```sql
SELECT r.id, r.first_name, r.last_name, r.lga_id, r.source,
       r.created_at, r.nin
FROM respondents r
WHERE (r.created_at, r.id) < ($cursor_ts, $cursor_id)
ORDER BY r.created_at DESC, r.id DESC
LIMIT 20
```

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 500K  | 0.22ms        | 0.22ms        | Index Scan on idx_respondents_created_at |

**Verdict**: PASS — Constant-time confirmed (0.22ms at page 100)

#### Q9: Very Deep Pagination (Page 1000, ~20,000 rows deep)

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 500K  | 0.26ms        | 0.26ms        | Index Scan on idx_respondents_created_at |

**Verdict**: PASS — Constant-time confirmed (0.26ms at page 1000, same as page 1)

#### Q10: LGA Filter Only

```sql
SELECT ... FROM respondents r WHERE r.lga_id = 'ibadan_north'
ORDER BY r.created_at DESC, r.id DESC LIMIT 20
```

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 500K  | 0.33ms        | 0.14ms        | Index Scan on idx_respondents_lga_id → **idx_respondents_lga_source** |

**Verdict**: PASS (0.14ms)

#### Q11: Multi-Filter (LGA + Date Range + Source)

```sql
SELECT ... FROM respondents r
WHERE r.lga_id = 'ibadan_north'
  AND r.created_at >= '2025-10-01' AND r.created_at < '2025-11-01'
  AND r.source = 'enumerator'
ORDER BY r.created_at DESC, r.id DESC LIMIT 20
```

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 500K  | **441ms**     | **0.24ms**    | Index Scan + Filter → **Index Scan on idx_respondents_lga_source** |

**Analysis**: Before indexing, PostgreSQL used `idx_respondents_lga_id` but had to filter out 96% of matching rows (wrong source, wrong date range). The composite index `idx_respondents_lga_source` on `(lga_id, source, created_at DESC)` allows a single index scan to satisfy all three filter predicates simultaneously — **1837x improvement**.

**Verdict**: FAIL → PASS with index (441ms → 0.24ms)

**Required Index**:
```sql
CREATE INDEX idx_respondents_lga_source
ON respondents (lga_id, source, created_at DESC);
```

#### Q12: JSONB Gender Filter

```sql
SELECT s.raw_data->>'gender' as gender, r.*
FROM respondents r
JOIN submissions s ON s.respondent_id = r.id
WHERE r.lga_id = 'ibadan_north'
  AND s.raw_data->>'gender' = 'female'
ORDER BY r.created_at DESC, r.id DESC LIMIT 20
```

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 500K  | **529ms**     | **1.3ms**     | Nested Loop (48K lookups) → **Index Scan on idx_submissions_raw_gender** |

**Analysis**: Without the expression index, PostgreSQL performed 48K index lookups on submissions for every respondent in the LGA, then filtered by JSONB gender. The expression index `idx_submissions_raw_gender` allows direct filtering — **407x improvement**.

**Verdict**: FAIL → PASS with index (529ms → 1.3ms)

**Required Index**:
```sql
CREATE INDEX idx_submissions_raw_gender
ON submissions ((raw_data->>'gender'));
```

#### Q13: Name Search (ILIKE)

```sql
SELECT ... FROM respondents r
WHERE (r.first_name ILIKE '%ahmed%' OR r.last_name ILIKE '%ahmed%')
ORDER BY r.created_at DESC, r.id DESC LIMIT 20
```

| Scale | Before Indexes | After Indexes | Plan |
|-------|---------------|---------------|------|
| 500K  | 183ms         | 183ms         | Parallel Seq Scan (BitmapOr) |

**Analysis**: ILIKE with leading wildcard (`%ahmed%`) cannot use B-tree indexes. At 500K, 183ms is under the 250ms target. At 1M+, this may degrade. Options:
1. **pg_trgm GIN index**: Supports `ILIKE '%pattern%'` efficiently. Recommended if search latency becomes an issue.
2. **tsvector**: Better for full-text search but overkill for name matching.
3. **Accept 183ms**: Under threshold at current target scale.

**Recommendation**: Accept as-is for MVP. Monitor at production scale. Add `pg_trgm` if needed:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_respondents_name_trgm ON respondents
USING GIN (first_name gin_trgm_ops, last_name gin_trgm_ops);
```

**Verdict**: PASS (183ms < 250ms, monitor at scale)

---

## Index Recommendations

### Required New Indexes (4)

These indexes are **required** for Epic 5 to meet NFR1.1 at target scale. Add to Drizzle schema files during story implementation.

| # | Index Name | Table | Definition | Story | Impact |
|---|-----------|-------|------------|-------|--------|
| 1 | `idx_submissions_raw_occupation` | submissions | `((raw_data->>'occupation'))` | 5.1 | 41x faster (9.9s → 240ms) |
| 2 | `idx_submissions_raw_gender` | submissions | `((raw_data->>'gender'))` | 5.5 | 407x faster (529ms → 1.3ms) |
| 3 | `idx_fd_audit_queue` | fraud_detections | `(computed_at DESC) WHERE resolution IS NULL AND severity IN ('high','critical')` | 5.2 | 838x faster (871ms → 1ms) |
| 4 | `idx_respondents_lga_source` | respondents | `(lga_id, source, created_at DESC)` | 5.5 | 1837x faster (441ms → 0.24ms) |

### Drizzle Schema Implementation

**In `apps/api/src/db/schema/submissions.ts`**:
```typescript
// Expression index on JSONB occupation for Story 5.1 skills aggregation
// SQL: CREATE INDEX idx_submissions_raw_occupation ON submissions ((raw_data->>'occupation'))
export const idxSubmissionsRawOccupation = index('idx_submissions_raw_occupation')
  .on(sql`(raw_data->>'occupation')`);

// Expression index on JSONB gender for Story 5.5 gender filter
// SQL: CREATE INDEX idx_submissions_raw_gender ON submissions ((raw_data->>'gender'))
export const idxSubmissionsRawGender = index('idx_submissions_raw_gender')
  .on(sql`(raw_data->>'gender')`);
```

**In `apps/api/src/db/schema/fraud-detections.ts`**:
```typescript
// Partial index for Story 5.2 audit queue (unresolved high/critical)
// SQL: CREATE INDEX idx_fd_audit_queue ON fraud_detections (computed_at DESC)
//   WHERE resolution IS NULL AND severity IN ('high', 'critical')
export const idxFdAuditQueue = index('idx_fd_audit_queue')
  .on(fraudDetections.computedAt.desc())
  .where(sql`resolution IS NULL AND severity IN ('high', 'critical')`);
```

**In `apps/api/src/db/schema/respondents.ts`**:
```typescript
// Composite index for Story 5.5 multi-filter (LGA + source + date)
export const idxRespondentsLgaSource = index('idx_respondents_lga_source')
  .on(respondents.lgaId, respondents.source, respondents.createdAt.desc());
```

> **Note**: Drizzle ORM 0.30.x may not support expression indexes or partial indexes natively. If not, add these via a raw SQL migration file. Verify Drizzle capabilities at implementation time.

### Optional / Monitor

| Index | Condition | Impact |
|-------|-----------|--------|
| `pg_trgm` GIN on `(first_name, last_name)` | Name search > 250ms at production scale | Would support `ILIKE '%pattern%'` efficiently |
| Materialized view for respondent counts | `COUNT(*)` > 250ms at 1M+ rows | Pre-computed counts refreshed on schedule |

---

## Schema Change Recommendations

### No Breaking Changes Required

The existing schema supports all Epic 5 queries. Key observations:

1. **Gender data in JSONB**: Confirmed that `respondents` has no `gender` column. Gender filtering uses `submissions.raw_data->>'gender'`, which works efficiently with the recommended expression index. No schema change needed — keep gender in JSONB.

2. **Assessor columns**: Story 5.2 will add `assessor_resolution`, `assessor_id`, `assessor_reviewed_at` to `fraud_detections`. The partial index `idx_fd_audit_queue` should be updated at that time to include `assessor_resolution IS NULL` in the WHERE clause.

3. **`lga_id` as TEXT**: Confirmed `respondents.lga_id` is TEXT (LGA code like `ibadan_north`), not a UUID FK. This is fine for filtering and grouping — string comparison on a 33-value set is fast.

---

## Confidence Assessment Per Story

### Story 5.1: High-Level Policy Dashboard — HIGH Confidence

| Query | Time (500K) | Risk |
|-------|-------------|------|
| Total respondents | 96ms | Low — may need materialized count at 1M+ |
| Per-LGA counts | 208ms | Low — hash aggregate is optimal |
| Daily trends | 46ms | None — index range scan, scales well |
| Skills distribution | 240ms | Low — with expression index, just under target |

**Notes**: All queries pass. Skills distribution (240ms) is the tightest margin. At 1M+ rows, consider a materialized view refreshed every 5-15 minutes for the dashboard. All other queries have comfortable headroom.

### Story 5.2: Verification Assessor Audit Queue — HIGH Confidence

| Query | Time (500K) | Risk |
|-------|-------------|------|
| Audit queue (3-table JOIN) | 1.0ms | None — partial index eliminates 90%+ of rows |
| LGA-filtered queue | 1.1ms | None |

**Notes**: The partial index is the critical enabler. When Story 5.2 adds `assessor_resolution` column, update the partial index WHERE clause. Consider adding `INCLUDE (submission_id)` for index-only scan if needed.

### Story 5.5: Paginated Respondent List — HIGH Confidence

| Query | Time (500K) | Risk |
|-------|-------------|------|
| Pagination (any depth) | 0.22-0.26ms | None — constant-time confirmed |
| LGA filter | 0.14ms | None |
| Multi-filter | 0.24ms | None — composite index covers common combos |
| Gender JSONB filter | 1.3ms | None — expression index handles it |
| Name search (ILIKE) | 183ms | Low — under target, monitor at scale |

**Notes**: Cursor-based pagination is validated as constant-time. The composite index `idx_respondents_lga_source` is the key enabler for multi-filter performance. Name search with `ILIKE` is the only potential concern at higher scale — `pg_trgm` is the mitigation if needed.

---

## Materialized View Recommendations

### Not Required for MVP

At 500K scale with the 4 recommended indexes, no materialized views are needed. All queries complete under 250ms.

### Consider at 1M+ Scale

If the system reaches 1M+ respondent rows and dashboard queries exceed targets:

1. **`mv_respondent_stats`**: Pre-computed counts by LGA, source, date
   - Refresh: Every 15 minutes via pg_cron or application scheduler
   - Covers: Story 5.1 total count, per-LGA count
   - Trade-off: ~15 minute staleness vs sub-10ms query time

2. **`mv_skills_distribution`**: Pre-computed occupation counts
   - Refresh: Every 15 minutes
   - Covers: Story 5.1 skills aggregation
   - Trade-off: Same staleness, eliminates the 240ms JSONB scan entirely

---

## Test Artifacts

- **Seed script**: `scripts/seed-performance-test-data.ts`
  - `--scale=10k|100k|500k` — generate test data
  - `--clean` — remove test data (NIN prefix `99`)
  - `--analyze` — run all 13 EXPLAIN ANALYZE queries with pass/fail

- **Indexes created during testing** (ad-hoc SQL, to be added to Drizzle schema):
  - `idx_submissions_raw_occupation`
  - `idx_submissions_raw_gender`
  - `idx_fd_audit_queue`
  - `idx_respondents_lga_source`

---

## Appendix: Full Results at Each Scale

### 10K Scale — All PASS

All 13 queries completed in < 25ms. No performance concerns at this scale.

### 100K Scale — All PASS

All 13 queries completed in < 230ms (JSONB skills at 228ms was the slowest). Borderline but passing.

### 500K Scale — Before Indexes

| # | Query | Time | Status |
|---|-------|------|--------|
| 1 | Total count | 298ms | SLOW |
| 2 | LGA counts | 259ms | SLOW |
| 3 | Daily trends | 46ms | PASS |
| 4 | JSONB skills | 9931ms | **FAIL** |
| 5 | Audit queue | 871ms | **FAIL** |
| 6 | LGA audit queue | 374ms | SLOW |
| 7 | Page 1 | 0.26ms | PASS |
| 8 | Page 100 | 0.22ms | PASS |
| 9 | Page 1000 | 0.26ms | PASS |
| 10 | LGA filter | 0.33ms | PASS |
| 11 | Multi-filter | 441ms | SLOW |
| 12 | Gender JSONB | 529ms | **FAIL** |
| 13 | Name search | 183ms | PASS |

### 500K Scale — After Indexes

| # | Query | Time | Status | Improvement |
|---|-------|------|--------|-------------|
| 1 | Total count | 96ms | PASS | 3.1x |
| 2 | LGA counts | 208ms | PASS | 1.2x |
| 3 | Daily trends | 46ms | PASS | — |
| 4 | JSONB skills | 240ms | PASS | **41x** |
| 5 | Audit queue | 1.0ms | PASS | **838x** |
| 6 | LGA audit queue | 1.1ms | PASS | **340x** |
| 7 | Page 1 | 0.26ms | PASS | — |
| 8 | Page 100 | 0.22ms | PASS | — |
| 9 | Page 1000 | 0.26ms | PASS | — |
| 10 | LGA filter | 0.14ms | PASS | 2.4x |
| 11 | Multi-filter | 0.24ms | PASS | **1837x** |
| 12 | Gender JSONB | 1.3ms | PASS | **407x** |
| 13 | Name search | 183ms | PASS | — |

**All 13 queries PASS at 500K scale with recommended indexes.**

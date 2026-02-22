# Prep 5: Cross-LGA Query Performance Validation

Status: done

## Story

As a Developer,
I want to validate that state-wide aggregation queries perform acceptably at target scale,
so that Official/Assessor dashboard views (Stories 5.1, 5.2, 5.5) don't degrade under load.

## Context

Epic 5 introduces roles (Government Official, Verification Assessor) that query ALL 33 LGAs simultaneously — unlike Epic 4's supervisor-scoped queries. The target scale is 1M respondent records over 12 months. This prep validates SQL query plans and index coverage before writing production code.

## Acceptance Criteria

1. **Given** a test dataset of representative scale (10K, 100K, 500K respondent rows), **when** I run the key aggregation queries, **then** `EXPLAIN ANALYZE` must show index usage (no sequential scans on large tables) and execution time < 250ms (p95 API target, NFR1.1).
2. **Given** the Story 5.1 queries (total respondents, per-LGA counts, daily trends, skills distribution from JSONB), **then** validate each query plan and document index recommendations.
3. **Given** the Story 5.2 queries (audit queue: fraud_detections JOIN submissions JOIN respondents WHERE complex filters), **then** validate join performance and composite index effectiveness.
4. **Given** the Story 5.5 queries (paginated respondent list with 9 filter dimensions), **then** validate cursor-based pagination performance at page 1, page 100, and page 1000.
5. **Given** the validation results, **then** write a summary with: query plans, recommended indexes, any schema changes needed, and confidence level for each Epic 5 story.

## Tasks / Subtasks

- [x] Task 1: Generate test data (AC: #1)
  - [x] 1.1 Create seed script `scripts/seed-performance-test-data.ts`:
    - 10K, 100K, 500K respondent rows with realistic distribution across 33 LGAs
    - Corresponding submission rows with rawData JSONB
    - Corresponding fraud_detection rows with varied severity/resolution
    - Use `uuidv7()` for all IDs, realistic timestamps spread over 6 months

- [x] Task 2: Validate Story 5.1 queries (AC: #2)
  - [x] 2.1 `SELECT COUNT(*) FROM respondents` — baseline (96ms at 500K)
  - [x] 2.2 `SELECT lga_id, COUNT(*) FROM respondents GROUP BY lga_id` — LGA breakdown (208ms at 500K)
  - [x] 2.3 `SELECT DATE(created_at), COUNT(*) FROM respondents WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(created_at)` — daily trends (46ms at 500K)
  - [x] 2.4 `SELECT raw_data->>'occupation' AS skill, COUNT(*) FROM submissions GROUP BY raw_data->>'occupation'` — JSONB skills aggregation (240ms at 500K with expression index)
  - [x] 2.5 Run `EXPLAIN ANALYZE` for each, document plans

- [x] Task 3: Validate Story 5.2 queries (AC: #3)
  - [x] 3.1 Assessor audit queue: 3-table JOIN validated (1.0ms at 500K with partial index)
  - [x] 3.2 Validate composite index — existing index insufficient; partial index `idx_fd_audit_queue` recommended (838x improvement)

- [x] Task 4: Validate Story 5.5 queries (AC: #4)
  - [x] 4.1 Cursor-based pagination: constant-time confirmed (0.22-0.26ms at all depths)
  - [x] 4.2 Multi-filter combination: 0.24ms with composite index (1837x improvement)
  - [x] 4.3 Free text search on respondent name: ILIKE at 183ms, pg_trgm recommended if needed
  - [x] 4.4 Test at page 1, page 100, page 1000 depths — all constant-time

- [x] Task 5: Write summary and recommendations (AC: #5)
  - [x] 5.1 Written to `_bmad-output/implementation-artifacts/spike-cross-lga-performance.md`:
    - Query plan analysis for each story
    - 4 required index recommendations
    - No schema changes required
    - HIGH confidence for all 3 stories
    - Materialized views not needed at 500K, recommended at 1M+

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Seed script --analyze 5.2 queries used wrong WHERE clause (IS NOT NULL OR vs IS NULL AND) — mismatched spike doc and partial index; fixed in seed script [scripts/seed-performance-test-data.ts:309,319]
- [x] [AI-Review][MEDIUM] Spike doc data distribution (severity, resolution, JSONB fields) didn't match actual seed script code — fixed spike doc [spike-cross-lga-performance.md:31-33]
- [x] [AI-Review][MEDIUM] String interpolation in SQL cleanup/check queries — converted to parameterized queries ($1) [scripts/seed-performance-test-data.ts:118-129,150,458]
- [x] [AI-Review][LOW] Seq scan filter excluded respondents without explanation — added documenting comment [scripts/seed-performance-test-data.ts:429]
- [x] [AI-Review][LOW] No comment linking --analyze queries to spike doc as authoritative source — added comment [scripts/seed-performance-test-data.ts:429]
- [x] [AI-Review][LOW] TypeScript `any` casts on pg query results — replaced with generic type parameters [scripts/seed-performance-test-data.ts:146-154,393]
- [ ] [AI-Review][LOW] questionnaire_form_id uses orphan UUID (no FK constraint, so no failure, but test data has invalid reference) [scripts/seed-performance-test-data.ts:178]
- [ ] [AI-Review][LOW] Verify test data (500K rows) and ad-hoc indexes are cleaned up from dev DB before Epic 5 implementation begins

## Dev Notes

### Existing Indexes to Verify

- `respondents.lga_id` — index exists
- `respondents.created_at` — index exists
- `submissions.submitted_at` — index exists
- `submissions.respondent_id` — index exists
- `fraud_detections.severity + resolution` — composite index exists
- `fraud_detections.submission_id` — index exists

### JSONB Aggregation Performance

Skills distribution from `submissions.raw_data->>'occupation'` may be slow at 500K+ rows. Consider:
- GIN index: `CREATE INDEX idx_submissions_raw_data ON submissions USING GIN (raw_data)`
- Expression index: `CREATE INDEX idx_submissions_occupation ON submissions ((raw_data->>'occupation'))`
- Materialized view refreshed on schedule for dashboard queries

### Schema Gap: Gender Filter
The `respondents` table does NOT have a `gender` column. Story 5.5 lists gender as a filter control — this data lives in `submissions.rawData` JSONB (collected via the survey form). Gender filtering will require JSONB extraction (`raw_data->>'gender'`), not a direct column query. The seed script (Task 1) must populate `rawData` with realistic gender values, and Task 4 queries must test JSONB-based gender filtering performance. Consider whether an expression index on `(raw_data->>'gender')` is needed.

### Performance Targets

- NFR1.1: API response < 250ms (p95)
- Dashboard queries should complete in < 100ms for good UX with skeleton loading
- Pagination queries must remain constant-time regardless of page depth (cursor-based, not OFFSET)

### References

- [Source: _bmad-output/implementation-artifacts/epic-4-retro-2026-02-20.md — prep-5 definition]
- [Source: _bmad-output/planning-artifacts/architecture.md — NFR performance targets]
- [Source: _bmad-output/implementation-artifacts/5-1-high-level-policy-dashboard.md — Story 5.1 queries]
- [Source: _bmad-output/implementation-artifacts/5-2-verification-assessor-audit-queue.md — Story 5.2 queries]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- EXPLAIN ANALYZE results captured via `scripts/seed-performance-test-data.ts --analyze`
- 500K scale testing: 13 queries validated before and after index creation

### Completion Notes List

- All 13 queries pass NFR1.1 (<250ms) at 500K scale with 4 recommended indexes
- Cursor-based pagination confirmed constant-time at all page depths
- JSONB expression indexes are critical for occupation and gender queries
- Partial index on fraud_detections is the key enabler for audit queue performance
- No schema changes required — gender stays in JSONB, assessor columns added in Story 5.2
- Materialized views not needed at 500K; recommended at 1M+ for dashboard counts
- pg_trgm extension recommended for name search if ILIKE degrades at higher scale
- Test data cleanup: run `tsx scripts/seed-performance-test-data.ts --clean`
- Test indexes should be dropped after validation; re-created via Drizzle schema in Stories 5.1/5.2/5.5

### Change Log

- 2026-02-22: Created seed script, ran EXPLAIN ANALYZE at 10K/100K/500K, identified 4 required indexes, validated all queries pass with indexes, wrote summary
- 2026-02-22: [Code Review] Fixed seed script 5.2 queries (IS NULL AND), parameterized SQL, typed pg results, fixed spike doc data distribution, added seq scan documentation

### File List

- `scripts/seed-performance-test-data.ts` — Performance test seed script (seed, clean, analyze modes) — code review fixes applied
- `_bmad-output/implementation-artifacts/spike-cross-lga-performance.md` — Performance validation summary with index recommendations — data distribution corrected

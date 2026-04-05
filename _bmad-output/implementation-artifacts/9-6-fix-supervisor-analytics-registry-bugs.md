# Hotfix 9.6: Supervisor Analytics & Registry — "Unable to Load Data"

Status: done
Type: hotfix
Discovered: 2026-04-05
Fixed: 2026-04-05

## Summary

All cards on the Supervisor Analytics page (`/dashboard/supervisor/analytics`) and Registry page (`/dashboard/supervisor/registry`) showed "Unable to load data" / "Failed to load data". Three root causes discovered and fixed during a single debugging session.

## Root Cause Analysis

### Bug 1: `analytics-scope.ts` — Hard 403 for supervisors without `team_assignments` row

**Symptom:** Every analytics endpoint returned 403 "Supervisor has no active LGA assignment".

**Root cause:** The `resolveAnalyticsScope` middleware queried `team_assignments` to resolve the supervisor's LGA scope. If no active row existed, it returned 403 immediately — no fallback.

Meanwhile, `TeamAssignmentService.getEnumeratorIdsForSupervisor()` (used by the registry/respondent service) had a graceful fallback: if no `team_assignments` row, it checked the supervisor's `lga_id` on the `users` table. The two code paths were inconsistent.

**Fix:** Added the same LGA fallback to `resolveAnalyticsScope`. If no `team_assignments` row, query `users.lga_id` joined to `lgas` for the LGA code. Only 403 if both lookups fail. Added `logger.warn` on fallback path for monitoring.

**File:** `apps/api/src/middleware/analytics-scope.ts`

---

### Bug 2: `team-quality.service.ts` — `ANY(${array})` PostgreSQL type error

**Symptom:** `/analytics/team-quality` returned 500 Internal Error.

**Root cause:** Drizzle ORM's `sql` template tag passes JS arrays as individual parameterized values, not as PostgreSQL array types. The pattern `` sql`s.enumerator_id = ANY(${enumeratorIds})` `` produced `s.enumerator_id = ANY($1)` where `$1` was a single string, not a `text[]` array. PostgreSQL error: `op ANY/ALL (array) requires array on right side`.

**Fix:** Replaced all 7 `= ANY(${array})` patterns with `IN (...)` using `sql.join()`:
```ts
sql`col IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`
```

**Files changed:**
- `apps/api/src/services/team-quality.service.ts` — 6 occurrences (added `inList()` helper)
- `apps/api/src/services/personal-stats.service.ts` — 2 occurrences
- `apps/api/src/services/survey-analytics.service.ts` — 1 occurrence

---

### Bug 3: `survey-analytics.service.ts` — `text = uuid` type mismatch in enumerator reliability

**Symptom:** `/analytics/enumerator-reliability` returned 500 Internal Error. The `EnumeratorReliabilityPanel` card on the Data Quality tab showed "Failed to load enumerator reliability data."

**Root cause:** The query at line 1643 joined `submissions.submitter_id` (TEXT column) to `users.id` (UUID column) without a type cast: `JOIN users u ON s.submitter_id = u.id`. PostgreSQL error: `operator does not exist: text = uuid`.

Other similar joins in the codebase already used the correct pattern: `s.enumerator_id = u.id::text`.

**Fix:** Added `::text` cast: `JOIN users u ON s.submitter_id = u.id::text`.

**File:** `apps/api/src/services/survey-analytics.service.ts`

## Dev DB Fix

The `team_assignments` table was empty in dev. Seeded 3 assignments for `supervisor@dev.local` to Ibadan North LGA (enumerator, enumerator2, enumerator3).

## Tests

- Updated `analytics-scope.test.ts`: replaced single "rejects supervisor" test with two tests covering the fallback path (success + failure). 10 tests pass.
- All existing tests pass: `team-quality.service.test.ts` (11), `personal-stats.service.test.ts` (11), `enumerator-reliability.test.ts` (6), `analytics.routes.test.ts` (10), `analytics-8-7.routes.test.ts` (13).
- Zero regressions.

## Files Changed

| File | Change |
|------|--------|
| `apps/api/src/middleware/analytics-scope.ts` | Added user `lga_id` fallback for Supervisor scope |
| `apps/api/src/middleware/__tests__/analytics-scope.test.ts` | Updated tests for fallback path |
| `apps/api/src/services/team-quality.service.ts` | Replaced `ANY()` with `IN()`, added `inList()` helper |
| `apps/api/src/services/personal-stats.service.ts` | Replaced 2x `ANY()` with `IN()` |
| `apps/api/src/services/survey-analytics.service.ts` | Replaced `ANY()` with `IN()` + fixed `text = uuid` join cast |

## Lessons Learned

1. **Drizzle `sql` template + PostgreSQL `ANY()`**: Never use `= ANY(${jsArray})` in Drizzle raw SQL. The pg driver does not convert JS arrays to PostgreSQL array types. Use `IN (${sql.join(...)})` instead.

2. **Type consistency in joins**: When `submissions.submitter_id` and `submissions.enumerator_id` are TEXT but `users.id` is UUID, every join must explicitly cast with `::text`. Grep for `= u.id` periodically to catch uncast joins.

3. **Scope resolution consistency**: When two code paths resolve the same concept (supervisor LGA scope), they must have the same fallback behavior. The `TeamAssignmentService` had an LGA fallback; the `resolveAnalyticsScope` middleware did not. This inconsistency meant one feature worked while another silently failed.

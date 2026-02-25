# CI Fix: Seed Test Failures + ESLint Warning

Status: done

**Date:** 2026-02-24
**Commit triggering failure:** `7943a93` (prep-3: fix sidebar dual highlight + seed fraud thresholds)
**CI Status:** Resolved — `8bce578` (ci-fix commit, code review: 6 findings all fixed)

---

## Issue 1: Two Failing API Seed Tests

### Symptoms

```
should insert 27 records into an empty table (api)
    Error: AssertionError: expected [] to have a length of 27 but got +0

should be idempotent — no duplicates on re-run (api)
    Error: AssertionError: expected [] to have a length of 27 but got +0
```

**File:** `apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts`

### Root Cause

The test had a **scoping bug** — it only cleaned fraud thresholds `WHERE createdBy = testUserId`, but the seed function's idempotent guard checks for ANY active thresholds globally:

```typescript
// Seed function's guard (global check):
const existing = await db.query.fraudThresholds.findFirst({
  where: eq(fraudThresholds.isActive, true),
});
if (existing) { return; }  // SKIPS entirely
```

In CI, other integration tests create super_admin users who may have seeded fraud thresholds. When this test ran:
1. Cleanup only removed thresholds `WHERE createdBy = testUserId` (none exist yet — no-op)
2. `seedFraudThresholds()` found OTHER active thresholds from parallel tests → **skipped**
3. Test queried `WHERE createdBy = testUserId` → **0 results**

Secondary issue: `seedFraudThresholds` uses `findFirst` to pick a super_admin user for `createdBy`. In CI with multiple super_admin users from parallel tests, `findFirst` may return a different user than `testUserId`, making the `WHERE createdBy = testUserId` filter return 0 even if seeding ran.

### Fix

**File:** `apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts`

1. **`beforeAll` cleanup:** Changed from `db.delete(fraudThresholds).where(eq(fraudThresholds.createdBy, testUserId))` to `db.delete(fraudThresholds)` (clear ALL — seed tests need a clean slate)
2. **`afterAll` cleanup:** Same — clean ALL fraud thresholds, not just test-owned
3. **Assertions:** Changed query filter from `eq(fraudThresholds.createdBy, testUserId)` to `eq(fraudThresholds.isActive, true)` — seed function picks whichever admin `findFirst` returns, so filter by active status instead
4. **`createdBy` assertion:** Changed from `expect(threshold.createdBy).toBe(testUserId)` to `expect(threshold.createdBy).toBeTruthy()` — verifies a valid user was set without assuming which one

### Verification

- 3/3 integration tests pass
- 25/25 unit tests pass (fraud-thresholds.seed.test.ts)
- 28 total seed tests pass

---

## Issue 2: ESLint Warning — `toggleSelection` in useMemo Deps

### Symptom

```
lint-and-build: apps/web/src/features/dashboard/components/LgaComparisonTable.tsx#L73
The 'toggleSelection' function makes the dependencies of useMemo Hook (at line 179)
change on every render. Move it inside the useMemo callback. Alternatively, wrap the
definition of 'toggleSelection' in its own useCallback() Hook.
```

### Root Cause

`toggleSelection` was defined as a plain function inside the component body. Since JavaScript creates a new function reference on every render, it caused the `useMemo` at line 179 (which had `toggleSelection` in its dependency array) to recompute on every render — defeating memoization.

### Fix

**File:** `apps/web/src/features/dashboard/components/LgaComparisonTable.tsx`

1. Added `useCallback` to the import: `import { useMemo, useCallback } from 'react'`
2. Wrapped `toggleSelection` in `useCallback` with proper deps `[selectedLgaIds, onSelectionChange]`

### Verification

- ESLint clean (zero output)
- 10/10 LgaComparisonTable tests pass

---

## Files Changed

| File | Change |
|------|--------|
| `apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts` | Fix scoped cleanup → global cleanup; filter by `isActive` not `createdBy`; [Review] add category distribution test, UUID regex for createdBy |
| `apps/web/src/features/dashboard/components/LgaComparisonTable.tsx` | Wrap `toggleSelection` in `useCallback` to stabilize useMemo deps |
| `apps/api/src/db/seeds/index.ts` | [Review] Add atomic batch insert safety comment to idempotent guard |

### Review Follow-ups (AI) — Code Review 2026-02-24
- [x] [AI-Review][HIGH] H1: Document process lesson — prep-3 code review M2 shipped broken, causing immediate CI regression. Code review fixes that change test isolation must be CI-validated before merge. (Documented here + in prep-3 story Change Log)
- [x] [AI-Review][MEDIUM] M1: Add per-category distribution test — AC3 requires 6 specific categories (GPS:6, Speed:4, Straightline:5, Duplicate:4, Timing:4, Composite:4). Added `GROUP BY ruleCategory` assertion with expected counts. [apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts]
- [x] [AI-Review][MEDIUM] M2: Strengthen `createdBy` assertion — `toBeTruthy()` → UUID regex `/^[0-9a-f]{8}-...-[0-9a-f]{12}$/` [apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts:74]
- [x] [AI-Review][MEDIUM] M3: Sprint-status.yaml has unrelated changes (prep-4, 6-5/6-6/6-7) bundled — noted for separate commit at merge time
- [x] [AI-Review][LOW] L1: Added comment explaining atomic batch insert makes simple idempotent guard safe (no partial seed state possible) [apps/api/src/db/seeds/index.ts:319-321]
- [x] [AI-Review][LOW] L2: Full regression verified — API: 967 passed, 7 skipped. Web: 1,799 passed, 2 todo. Zero regressions.

## Test Results After Fix

- Seed tests: 28/28 pass (25 unit + 3 integration)
- LgaComparisonTable: 10/10 pass
- ESLint: clean

### Full Regression (post code-review fixes)

- **API**: 967 passed, 7 skipped (70 test files, 72 total)
- **Web**: 1,799 passed, 2 todo (154 test files)
- **sidebarConfig**: 27/27 pass (includes Settings `end: true` regression test)
- Zero regressions

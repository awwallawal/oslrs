# Prep 9: Fix Pre-Existing Test Failures

Status: done

## Story

As a developer,
I want all tests in `fraud-detections-bulk.controller.test.ts` to pass reliably,
so that the CI pipeline stays green and test failures are immediately attributable to new changes.

## Problem

**TD1** (discovered during Epic 5 retrospective, severity LOW): 4 pre-existing test failures in `apps/api/src/controllers/__tests__/fraud-detections-bulk.controller.test.ts`. Tests were intermittently failing due to mock state leakage between test cases.

## Resolution

**Already fixed.** The root cause was identified and resolved during Story 5.5 (commit `8a7014f`) before this prep task was formally created.

### Root Cause

The test file used `vi.clearAllMocks()` in `beforeEach`, which resets call counts and instances but **preserves mock implementations**. This caused mock state from earlier tests to leak into later tests, producing intermittent failures depending on test execution order.

### Fix Applied

**File:** `apps/api/src/controllers/__tests__/fraud-detections-bulk.controller.test.ts` line 71

```diff
- vi.clearAllMocks();
+ vi.resetAllMocks();
```

`vi.resetAllMocks()` fully resets both call tracking AND mock implementations, preventing cross-test contamination.

### Verification

- **19/19 tests pass** in isolation: `pnpm vitest run apps/api/src/controllers/__tests__/fraud-detections-bulk.controller.test.ts`
- **303/303 controller tests pass** in full suite: `pnpm vitest run apps/api/src/controllers/__tests__/`
- **0 regressions** across entire API test suite

### Pattern Note

This is the same resolution pattern as `prep-9-fileblob-base64-to-bytea` from prep-epic-4 — a retro-catalogued issue that was already resolved by the time the prep task was formally defined. The retro correctly identified the tech debt (TD1) but the fix had already been applied as part of normal Story 5.5 development.

**Lesson for future retros:** Verify tech debt items are still reproducible before adding them to the prep backlog.

## Acceptance Criteria

**AC1**: ~~Given the fraud-detections-bulk test file, when running all 19 tests, then all pass with 0 failures.~~ **Already satisfied** — 19/19 pass.

**AC2**: ~~Given the fix, when running the full controller test suite, then 0 regressions.~~ **Already satisfied** — 303/303 pass.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Completion Notes List

- Investigated 4 pre-existing test failures in `fraud-detections-bulk.controller.test.ts`
- Root cause: `vi.clearAllMocks()` → mock state leakage between tests
- Fix already applied in Story 5.5 (commit `8a7014f`): changed to `vi.resetAllMocks()`
- Verified: 19/19 tests pass in isolation, 303/303 controller tests pass in full suite
- No code changes needed — task is already resolved

### Change Log

- 2026-02-24: Investigated and confirmed already resolved. Closed as done (same pattern as prep-epic-4/prep-9).

### File List

- No files modified — fix was already applied in Story 5.5 (commit `8a7014f`)

# Technical Debt: Ironclad Test Dashboard Visibility

**Date:** 2026-01-13
**Status:** ✅ RESOLVED - Story 1.10 Created
**Priority:** Low (Engineering Visibility)
**Resolution:** Story 1.10 - Test Infrastructure & Dashboard Visibility

## Issue Description
The "Ironclad Monorepo Testing" infrastructure is correctly tagging and running tests across the monorepo (`apps/api`, `apps/web`, etc.). However, the **Visual Dashboard** (`test-pipeline.html`) currently displays 0 results.

This occurs because Vitest processes run in isolation under Turbo, and the `LiveReporter` fails to reliably persist or merge data into the centralized `.vitest-live.json` file due to concurrency and process lifecycle timing in the Windows environment.

## Current State
- ✅ **ADR-014** appended to Architecture.
- ✅ **Test Decorators** (`goldenPath`, `securityTest`) are functional.
- ✅ **Turbo Orchestration** is correctly sequencing stages (Golden -> Security -> Contract -> UI).
- ✅ **Tests are tagged** (e.g., ID Card Performance).
- ✅ **Dashboard Visibility**: Addressed via Story 1.10

## Resolution (Option B - implemented in Story 1.10)
The following approach has been documented in **Story 1.10: Test Infrastructure & Dashboard Visibility**:
1.  **Unique Output Files**: Modify `LiveReporter` to write results to unique files (e.g., `.vitest-live-${timestamp}-${pid}.json`).
2.  **Glob-based Merger**: Create `merger.ts` to glob all `.vitest-live-*.json` files and merge them before generating the HTML.
3.  **Cleanup**: Add cleanup step to remove temporary JSON files after dashboard generation.
4.  **Dashboard Enhancements**: Stage grouping, package grouping, tag filtering, performance metrics, error details.

## Story Reference
- **Story ID:** 1.10
- **File:** `_bmad-output/implementation-artifacts/1-10-test-infrastructure-dashboard.md`
- **Status:** ready-for-dev
- **Sprint Status:** Updated in `sprint-status.yaml`

## Path Forward
This technical debt item is now tracked as **Story 1.10** in Epic 1. Implementation will follow the completion of core functional stories (1.7, 1.8, 1.9).

---

## Test Category Enhancement Roadmap

**Date Added:** 2026-01-28
**Status:** Phase 1 Complete (Auto-detect). Phase 2 Optional.
**Priority:** Low (enhancement when time permits)

### Phase 1: Auto-Detection (✅ IMPLEMENTED)

The reporter now auto-detects category from filename patterns:

| Pattern | Category |
|---------|----------|
| `security.*.test.ts` or `*.security.test.ts` | Security |
| `performance.*.test.ts` or `*.performance.test.ts` | Performance |
| `contract.*.test.ts` or `*.contract.test.ts` | Contract |
| `*.ui.test.ts` or tests in `/ui/` directory | UI |
| All other `*.test.ts` files | GoldenPath (default) |

**Implementation:** `packages/testing/src/reporter.ts` - `detectCategory()` method.

### Phase 2: Explicit Decorators (OPTIONAL - Future)

For per-test control, SLA enforcement, or mixed-category files.

**Option A: Full Migration**
Update all tests to use decorators:
```typescript
import { goldenPath, securityTest, contractTest } from '@oslsr/testing';

// Replaces: it('should authenticate user', ...)
goldenPath('should authenticate user', async () => { ... });

// With SLA enforcement (2 second max)
goldenPath('should return results quickly', async () => { ... }, 2);

// Security tests
securityTest('should reject tampered tokens', async () => { ... });
```

**Benefits:**
- Explicit per-test categorization
- SLA enforcement (`sla` parameter in seconds)
- Blocking vs optional marking (`blocking: false`)
- Works for mixed-category test files

**Effort:** High - requires updating all test files

**Option B: Hybrid (RECOMMENDED for future)**
Keep auto-detect as fallback, add decorators only where needed:
- Auto-detect handles 90%+ of tests via naming convention
- Decorators for tests needing:
  - Explicit category override
  - SLA enforcement
  - Non-blocking flag

**When to Consider Phase 2:**
- Need per-test SLA enforcement for performance-critical paths
- Have files with mixed-category tests
- Want finer-grained dashboard filtering
- Implementing CI gating by category (e.g., "fail build if Security tests fail")

### Naming Convention Guide (for new tests)

To ensure proper auto-categorization, follow these patterns:

| Test Type | Naming Pattern | Example |
|-----------|---------------|---------|
| Security | `security.*.test.ts` | `security.auth.test.ts` |
| Performance | `*.performance.test.ts` | `id-card.performance.test.ts` |
| Contract | `*.contract.test.ts` | `api.contract.test.ts` |
| UI | `*.ui.test.ts` or in `/ui/` folder | `LoginForm.ui.test.tsx` |
| GoldenPath | `*.test.ts` (default) | `user.service.test.ts` |

### Files Modified

- `packages/testing/src/reporter.ts` - Added `detectCategory()` method
- `packages/testing/src/decorators.ts` - Existing decorator helpers
- `_bmad-output/project-context.md` - Section 9a documentation
- `_bmad-output/implementation-artifacts/2-4-*.md` - Enhancement note

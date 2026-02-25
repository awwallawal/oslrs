# Prep 3: Fix Fraud Thresholds Sidebar & Data Issue

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Super Admin,
I want the Fraud Thresholds page to display the configured thresholds and only highlight the correct sidebar item,
so that I can view and manage fraud detection parameters without UI confusion or missing data.

## Problem

**Bug B3** (discovered during Epic 5 UAT, severity MEDIUM): Two distinct issues on the Fraud Thresholds page.

### Issue 1: Sidebar Dual Highlight
Clicking "Fraud Thresholds" in the sidebar highlights **both** "Fraud Thresholds" AND "Settings" simultaneously. This is a route matching issue.

**Root Cause**: `SidebarNav.tsx` line 38 uses `end={item.href.split('/').length <= 3}` to determine whether NavLink uses exact matching. The paths are:
- Settings: `/dashboard/super-admin/settings` → 4 segments → `end=false` → **partial matching**
- Fraud Thresholds: `/dashboard/super-admin/settings/fraud-thresholds` → 5 segments → `end=false`

When on the fraud-thresholds URL, Settings NavLink also matches because `/dashboard/super-admin/settings` is a prefix of the current path. Both items appear "active."

### Issue 2: "No fraud thresholds configured"
Despite fraud thresholds being fully implemented in Story 4-3 (118 fraud-specific tests pass), the page shows "No fraud thresholds configured" on both local dev and production.

**Root Cause**: The seed data exists in `apps/api/src/db/seeds/fraud-thresholds.seed.ts` (27 default records across 6 categories) but **is never called** from the seed orchestrator (`apps/api/src/db/seeds/index.ts`). The `main()` function seeds roles, LGAs, productivity targets, and users — but never fraud thresholds. Result: empty `fraud_thresholds` table → API returns empty object → UI shows "No thresholds configured."

## Acceptance Criteria

**AC1**: Given the sidebar, when a Super Admin clicks "Fraud Thresholds", then ONLY "Fraud Thresholds" is highlighted — NOT "Settings".

**AC2**: Given the sidebar, when a Super Admin clicks "Settings", then ONLY "Settings" is highlighted — NOT "Fraud Thresholds".

**AC3**: Given a freshly seeded database (`pnpm db:seed:dev` or `pnpm db:seed --admin-from-env`), when a Super Admin navigates to the Fraud Thresholds page, then all 27 default thresholds across 6 categories (GPS: 6, Speed: 4, Straightline: 5, Duplicate: 4, Timing: 4, Composite: 4) are displayed.

**AC4**: Given the seed script changes, when running `pnpm db:seed:dev`, then fraud thresholds are seeded (idempotent — re-running does not duplicate).

**AC5**: Given an existing database with manually configured thresholds, when re-running the seed, then existing thresholds are NOT overwritten (respect existing data).

**AC6**: Given the fixes are applied, when running the existing test suites, then all existing tests pass with zero regressions.

**AC7**: Given the sidebar fix, when navigating to any other Super Admin page (Staff, Questionnaires, Reports, etc.), then only the correct single sidebar item is highlighted (no regressions in other nav items).

## Tasks / Subtasks

- [x] Task 1: Fix sidebar dual highlight (AC: #1, #2, #7)
  - [x] 1.1 Add optional `end?: boolean` property to `NavItem` interface in `sidebarConfig.ts` (line 46-51)
  - [x] 1.2 In `SidebarNav.tsx` line 38, change end prop logic from `end={item.href.split('/').length <= 3}` to `end={item.end !== undefined ? item.end : item.href.split('/').length <= 3}`
  - [x] 1.3 Set `end: true` on the Settings nav item in `sidebarConfig.ts` (line 147) to force exact matching
  - [x] 1.4 Verify: When on `/settings/fraud-thresholds`, only Fraud Thresholds highlights. When on `/settings`, only Settings highlights.
- [x] Task 2: Add fraud threshold seeding to seed orchestrator (AC: #3, #4, #5)
  - [x] 2.1 In `apps/api/src/db/seeds/index.ts`, import `FRAUD_THRESHOLD_DEFAULTS` from `./fraud-thresholds.seed.js`
  - [x] 2.2 Create `seedFraudThresholds()` async function that:
    - Checks if thresholds already exist in the table (idempotent guard)
    - If table is empty, inserts all `FRAUD_THRESHOLD_DEFAULTS` records with `version: 1`, `isActive: true`, `effectiveUntil: null`
    - Uses first super_admin user for `createdBy` (NOT NULL column requires a valid user reference)
    - Logs count of inserted records
  - [x] 2.3 Call `seedFraudThresholds()` in `main()` after user creation (both dev and production paths) — fraud thresholds need a super_admin user for the `createdBy` audit column
- [x] Task 3: Add tests for new seed function (AC: #4, #5, #6)
  - [x] 3.1 Add integration test: verify `seedFraudThresholds()` inserts 27 records into empty table (use real DB with `beforeAll`/`afterAll`, not unit test)
  - [x] 3.2 Add integration test: verify `seedFraudThresholds()` is idempotent (no duplicates on re-run)
  - [x] 3.3 Add integration test: verify existing thresholds are preserved (not overwritten)
  - Note: These are DB integration tests — create a new file `apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts` (the existing `fraud-thresholds.seed.test.ts` tests the constant data, not the DB insert function)
- [x] Task 4: Run full test suites and verify zero regressions (AC: #6)
  - [x] 4.1 Run API tests: `pnpm vitest run apps/api/src/` — 967 passed, 7 skipped
  - [x] 4.2 Run web tests: `cd apps/web && pnpm vitest run` — 1,798 passed, 2 todo
- [x] Task 5: Update story status and dev agent record

### Review Follow-ups (AI) — Code Review 2026-02-24
- [x] [AI-Review][HIGH] H1: Replace sequential INSERT loop with batch insert for atomicity — partial seed leaves unrecoverable state [apps/api/src/db/seeds/index.ts:345-358]
- [x] [AI-Review][MEDIUM] M1: Add test asserting Settings nav item has `end: true` to prevent dual-highlight regression [apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts]
- [x] [AI-Review][MEDIUM] M2: Fix destructive `beforeAll` — scope cleanup to test-owned rows only, not all fraud thresholds [apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts:41-47]
- [x] [AI-Review][MEDIUM] M3: Remove test order dependency — each test self-seeds if needed instead of relying on test 1 state [apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts:88-102]
- [x] [AI-Review][LOW] L1: Fix stale comments — "21 records" → "27 records", correct Duplicate/Timing category counts [apps/api/src/db/seeds/fraud-thresholds.seed.ts:4,27-35]
- [x] [AI-Review][LOW] L2: Remove redundant `insertedThresholdIds` tracking — `createdBy` cleanup is sufficient [apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts:12,52-56]

## Dev Notes

### Root Cause Deep-Dive

**Sidebar Issue**: The `end` prop on React Router's `NavLink` controls whether matching is exact (`end=true`) or prefix-based (`end=false`). The current heuristic `item.href.split('/').length <= 3` was designed to make the Home route (`/dashboard/super-admin`, 3 segments) use exact matching while deeper routes use prefix matching. However, when two sidebar items have a parent-child path relationship (Settings → Fraud Thresholds), the parent needs `end=true` too.

**Why not just change the threshold to `<= 4`**: That would make ALL 4-segment routes (Staff, Questionnaires, Reports, etc.) use exact matching. This breaks UX for routes with sub-pages — e.g., Questionnaires has `/questionnaires/builder/:id` sub-routes, and the Questionnaires sidebar item should still highlight when in the form builder. The explicit `end` property per-item is the correct approach.

**Seed Issue**: `FRAUD_THRESHOLD_DEFAULTS` was created in prep-7 (Fraud Detection Domain Research) and consumed by Story 4-3's tests. But the seed orchestrator was never updated to call a seeding function. The data constant exists, the schema exists, the API works — the INSERT step is simply missing.

### Existing Code to Reuse

| Component | Location | Pattern |
|-----------|----------|---------|
| NavItem interface | `apps/web/src/features/dashboard/config/sidebarConfig.ts:46-51` | Add `end?: boolean` |
| SidebarNav component | `apps/web/src/layouts/components/SidebarNav.tsx:38` | `end` prop logic |
| Settings nav item | `apps/web/src/features/dashboard/config/sidebarConfig.ts:147` | Add `end: true` |
| Fraud Thresholds nav item | `apps/web/src/features/dashboard/config/sidebarConfig.ts:148` | No change needed |
| FRAUD_THRESHOLD_DEFAULTS | `apps/api/src/db/seeds/fraud-thresholds.seed.ts:37` | 27 seed records (GPS:6, Speed:4, Straightline:5, Duplicate:4, Timing:4, Composite:4) |
| Seed orchestrator | `apps/api/src/db/seeds/index.ts:380-438` | `main()` function |
| seedProductivityTargets pattern | `apps/api/src/db/seeds/index.ts:399` | Idempotent seed pattern to follow |
| fraudThresholds schema | `apps/api/src/db/schema/fraud-thresholds.ts` | Table definition |
| Existing seed test (constants) | `apps/api/src/db/seeds/__tests__/fraud-thresholds.seed.test.ts` | Unit test patterns (tests constant data, NOT DB insert) |

### Key Implementation Details

1. **NavItem `end` property**: Only set `end: true` on the Settings nav item. All other items continue using the segment-count heuristic. This is minimal and explicit.
2. **SidebarNav end logic**: Use `item.end !== undefined ? item.end : item.href.split('/').length <= 3` — explicit property takes precedence, fallback to existing heuristic.
3. **Seed function placement**: Call `seedFraudThresholds()` BEFORE the `if (isDev)` block (line 401) so it runs in ALL seed modes — dev, production, and base. Fraud thresholds are required system configuration, like roles and LGAs.
4. **Idempotent guard**: Check `SELECT COUNT(*) FROM fraud_thresholds WHERE is_active = true` first. If > 0, skip seeding. This prevents overwriting manually-configured thresholds on production.
5. **Do NOT change the `FRAUD_THRESHOLD_DEFAULTS` constant** — it's already correct and well-tested.
6. **Do NOT change the fraud thresholds API endpoint, controller, or service** — they work correctly when data exists.
7. **Do NOT change the FraudThresholdsPage component** — it correctly renders when data is returned.

### File Change Scope

**Modified files (3):**
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Add `end?: boolean` to NavItem, set `end: true` on Settings item
- `apps/web/src/layouts/components/SidebarNav.tsx` — Line 38: explicit `end` property support
- `apps/api/src/db/seeds/index.ts` — Import seed data, add `seedFraudThresholds()` function, call in `main()`

**New test file (1):**
- `apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts` — Integration tests for `seedFraudThresholds()` (real DB, `beforeAll`/`afterAll`). Do NOT add to existing `fraud-thresholds.seed.test.ts` — that file tests the constant data, not DB operations.

**No new page components. No new routes. No API changes. No schema changes.**

### Project Structure Notes

- SidebarNav is in `apps/web/src/layouts/components/` (layout layer), not in `features/dashboard/`
- sidebarConfig is in `features/dashboard/config/` (feature layer) — NavItem type exported and imported by SidebarNav
- Seeds are in `apps/api/src/db/seeds/` with tests co-located in `__tests__/`
- Pattern follows existing seed functions: `seedRoles()`, `seedLGAs()`, `seedProductivityTargets()`

### Testing Standards

- Use `data-testid` selectors only in frontend tests (A3: no CSS class selectors)
- Follow existing mock pattern with `vi.hoisted()` + `vi.mock()` for frontend
- Seed tests should use real DB transactions (integration test pattern with `beforeAll`/`afterAll`)
- Must verify 403 for unauthorized roles on fraud-thresholds API endpoint (if not already covered by Story 4-3 tests)
- Run web tests: `cd apps/web && pnpm vitest run` (NOT from root)
- Run API tests: `pnpm vitest run apps/api/src/`

### References

- [Source: _bmad-output/implementation-artifacts/epic-5-retro-2026-02-24.md#Bug-B3] — Bug discovery during UAT
- [Source: apps/web/src/layouts/components/SidebarNav.tsx#L38] — Dual highlight root cause
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts#L46-51] — NavItem interface
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts#L147-148] — Settings + Fraud Thresholds nav items
- [Source: apps/api/src/db/seeds/fraud-thresholds.seed.ts#L37] — FRAUD_THRESHOLD_DEFAULTS (27 records; file header comment says 21 — stale)
- [Source: apps/api/src/db/seeds/index.ts#L380-438] — Seed orchestrator main() — missing fraud threshold call
- [Source: apps/api/src/db/seeds/__tests__/fraud-thresholds.seed.test.ts] — Existing seed constant unit tests (asserts 27 records at L7)
- [Source: _bmad-output/implementation-artifacts/4-3-fraud-engine-configurable-thresholds.md] — Story 4.3 (original fraud thresholds implementation)

### Previous Story Intelligence

**From prep-2-fix-dashboard-padding-consistency (previous prep task):**
- Simple frontend-only fix (CSS padding), no overlapping patterns with this story
- Confirms pattern: pages created in different epics sometimes miss established conventions

**From Story 4-3 (Fraud Engine Configurable Thresholds):**
- 118 fraud-specific tests pass — the API and UI work correctly when data exists
- Code review fixed 12 findings including DBSCAN O(n^2), query validation, DRY extraction
- FraudConfigService at `apps/api/src/services/fraud-config.service.ts` — do NOT modify

**From prep-7 (Fraud Detection Domain Research):**
- Created `FRAUD_THRESHOLD_DEFAULTS` with 27 records across 6 categories (file header comment says 21 — stale, tests confirm 27)
- E2E tests in `apps/web/e2e/fraud-threshold.spec.ts` assume seeded data but never actually seed it

### Git Intelligence

Recent commits are Epic 5 completions. Relevant:
- `bd5a443 docs: complete Epic 5 retrospective and define Epic 6 prep phase` — retro where Bug B3 was discovered
- `92f8a2b fix(api,web): use dynamic productivity targets across all dashboards` — shows pattern of fixing data-dependent features across roles

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Seed test initially failed: importing `seeds/index.ts` triggered `main()` which called `pool.end()`. Fixed by guarding the auto-execution with `fileURLToPath(import.meta.url)` === `process.argv[1]` check.
- `createdBy` column on `fraud_thresholds` is NOT NULL (schema constraint). Story suggested `createdBy: null` but this violates the schema. Fixed by looking up the first super_admin user and using their ID.
- Seed function placement: story said "before `if (isDev)` block" but `createdBy` NOT NULL requires a user to exist first. Restructured `main()` to call `seedFraudThresholds()` AFTER user creation but before completion messages.

### Completion Notes List

- **Task 1 (Sidebar fix)**: Added `end?: boolean` to `NavItem` interface. Settings nav item now uses `end: true` for exact route matching. SidebarNav respects explicit `end` property with fallback to existing segment-count heuristic. This prevents Settings from highlighting when on child routes like `/settings/fraud-thresholds`.
- **Task 2 (Seed function)**: Created idempotent `seedFraudThresholds()` that checks for existing active thresholds before inserting. Uses first super_admin user for `createdBy` audit column. Inserts all 27 `FRAUD_THRESHOLD_DEFAULTS` records (GPS:6, Speed:4, Straightline:5, Duplicate:4, Timing:4, Composite:4). Called after user creation in all seed modes.
- **Task 3 (Tests)**: 3 integration tests in new `seed-orchestrator.test.ts`: insert 27 records, idempotency, preservation. Also guarded `main()` auto-execution to prevent pool closure during test imports.
- **Task 4 (Regressions)**: API 967 passed, Web 1,798 passed. Zero regressions.

### Change Log

- 2026-02-24: Fix sidebar dual highlight — add `end?: boolean` to NavItem, set `end: true` on Settings item, update SidebarNav end prop logic
- 2026-02-24: Add `seedFraudThresholds()` to seed orchestrator — idempotent insert of 27 default fraud thresholds
- 2026-02-24: Guard seed `main()` auto-execution for ESM module import compatibility
- 2026-02-24: Add 3 integration tests for seed function (insert, idempotency, preservation)
- 2026-02-24: **Code Review** — 6 findings (1H, 3M, 2L), all 6 fixed:
  - H1: Batch insert replaces sequential loop (atomicity + performance)
  - M1: Added Settings `end: true` regression test in sidebarConfig.test.ts
  - M2: Seed test scoped to test-owned rows only (safe for shared dev DBs)
  - M3: Each test self-seeds if needed (no order dependency)
  - L1: Fixed stale "21 records" → "27 records" in fraud-thresholds.seed.ts comments
  - L2: Removed redundant insertedThresholdIds tracking
- 2026-02-24: **Code Review #2 (ci-fix)** — 6 findings (1H, 3M, 2L), all 6 fixed:
  - H1: [PROCESS] M2 from review #1 was incorrect — scoped cleanup broke CI because seedFraudThresholds uses findFirst (non-deterministic user). Reverted to global cleanup + isActive filter in ci-fix.
  - M1: Added per-category distribution test (GPS:6, Speed:4, Straightline:5, Duplicate:4, Timing:4, Composite:4)
  - M2: Strengthened createdBy assertion from toBeTruthy() to UUID regex
  - M3: Sprint-status unrelated changes noted for separate commit
  - L1: Added atomic batch insert safety comment
  - L2: Full regression documented (967 API + 1,799 web, 0 regressions)

### File List

- `apps/web/src/features/dashboard/config/sidebarConfig.ts` (modified) — Added `end?: boolean` to NavItem interface, set `end: true` on Settings nav item
- `apps/web/src/layouts/components/SidebarNav.tsx` (modified) — Updated end prop logic to respect explicit `end` property
- `apps/api/src/db/seeds/index.ts` (modified) — Imported FRAUD_THRESHOLD_DEFAULTS and fraudThresholds, added `seedFraudThresholds()` function with batch insert, restructured `main()` to call after user creation, guarded auto-execution
- `apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts` (new) — 3 integration tests for seedFraudThresholds (self-seeding, test-user-scoped cleanup)
- `apps/api/src/db/seeds/fraud-thresholds.seed.ts` (modified) — [Review] Fixed stale comments: 21→27 records, corrected Duplicate/Timing category counts
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` (modified) — [Review] Added Settings `end: true` regression test

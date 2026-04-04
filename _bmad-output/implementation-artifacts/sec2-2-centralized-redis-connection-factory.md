# Story sec2.2: Centralized Redis Connection Factory

Status: done

<!-- Source: infrastructure-security-audit-2026-04-04.md — SEC2-2 (P1 HIGH), Finding M-3 -->
<!-- Source: sprint-change-proposal-2026-04-04.md — Section 4 -->
<!-- Depends on: SEC2-1 (VPS must have REDIS_URL with password set) -->

## Story

As a developer,
I want a single centralized Redis connection factory that all consumers share,
so that adding Redis AUTH, TLS, or connection pooling is a one-line change instead of modifying 41 files.

## Acceptance Criteria

1. **AC1:** A new module `apps/api/src/lib/redis.ts` exists that exports:
   - `getRedisClient()` — returns a lazy-initialized singleton Redis instance for general use (rate limiters, services, caching)
   - `createRedisConnection(options?)` — returns a new Redis connection for BullMQ queues/workers (BullMQ requires dedicated connections)
   - Both functions read `REDIS_URL` from environment and throw `AppError('REDIS_CONNECTION_FAILED', ...)` if connection fails

2. **AC2:** All 41 scattered `new Redis(process.env.REDIS_URL || 'redis://localhost:6379')` calls across the codebase are replaced with imports from `lib/redis.ts`. Zero direct `new Redis()` instantiation remains outside of `lib/redis.ts`.

3. **AC3:** The fallback `|| 'redis://localhost:6379'` is removed. In production (`NODE_ENV=production`), missing `REDIS_URL` throws a startup error. In development/test, the fallback `redis://localhost:6379` is allowed.

4. **AC4:** `REDIS_URL` with password format (`redis://:PASSWORD@localhost:6379`) documented in `.env.example`.

5. **AC5:** Redis connection health is exposed via a `checkRedisHealth()` export that returns `{ connected: boolean, latencyMs: number }` — used by the existing monitoring service (`monitoring.service.ts`).

6. **AC6:** All existing tests pass (4,093+) with zero regressions. Tests that mock Redis continue to work (the factory must support the existing `vi.mock()` pattern).

7. **AC7:** BullMQ queues and workers use `createRedisConnection()` (not the singleton) — BullMQ requires separate connections for queue and worker to avoid blocking.

## Tasks / Subtasks

- [x] **Task 1: Create `apps/api/src/lib/redis.ts` factory module** (AC: #1, #3, #5)
  - [x] 1.1 Created with `getRedisClient()`, `createRedisConnection()`, `checkRedisHealth()`, `closeAllConnections()`
  - [x] 1.2 Base config: `enableReadyCheck: true`, `lazyConnect: false`. BullMQ connections add `maxRetriesPerRequest: null`.
  - [x] 1.3 Production throws `Error('REDIS_URL is required in production')`. Dev/test falls back to `redis://localhost:6379`.
  - [x] 1.4 Error handlers use `typeof .on === 'function'` guard for test mock compatibility.

- [x] **Task 2: Migrate rate limiter middleware (9 files)** (AC: #2)
  - [x] 2.1-2.9 All 9 rate limiters migrated. Files with test-mode guards (`login`, `password-reset`, `registration`, `google-auth`, `message`, `reveal`) use aliased import + null-in-test-mode wrapper. Files without (`rate-limit`, `export-rate-limit`, `sensitive-action`) import directly.
  - [x] 2.10 `import { Redis } from 'ioredis'` removed from all 9 files.

- [x] **Task 3: Migrate queue files (8 files)** (AC: #2, #7)
  - [x] 3.1-3.8 All 8 queue files migrated to `createRedisConnection()`. Lazy-init `getConnection()` wrappers preserved where existing.
  - [x] 3.9 `import { Redis } from 'ioredis'` replaced with `import { createRedisConnection }` + `import type { Redis }` where needed for variable typing.

- [x] **Task 4: Migrate worker files (8 files)** (AC: #2, #7)
  - [x] 4.1-4.8 All 8 workers migrated. Top-level `const connection = new Redis(...)` → `const connection = createRedisConnection()`. Conditional workers (dispute-autoclose, backup, productivity-snapshot) keep `if (!isTestMode())` guard.

- [x] **Task 5: Migrate service files (11 files)** (AC: #2)
  - [x] 5.1 `token.service.ts` — removed local `getRedisClient()` function (lines 20-28), import from factory
  - [x] 5.2-5.6 `session`, `view-as`, `fraud-config`, `password-reset`, `registration` — all migrated
  - [x] 5.7 `monitoring.service.ts` — replaced `getHealthRedis()` + dynamic import with `checkRedisHealth()` from factory
  - [x] 5.8-5.11 `public-insights`, `marketplace-edit`, `survey-analytics`, `productivity-target` — all migrated. `public-insights` and `survey-analytics` use aliased import + null-in-test-mode wrapper to preserve cache-skip behavior.

- [x] **Task 6: Migrate remaining files (3 files)** (AC: #2)
  - [x] 6.1 `staff.controller.ts` — replaced local `getRedis()` with `getRedisClient()` alias
  - [x] 6.2 `admin.routes.ts` — same pattern
  - [x] 6.3 `public-insights.routes.ts` — direct import
  - [N/A] 6.4 `realtime/index.ts` — no direct Redis usage found

- [x] **Task 7: Update `.env.example`** (AC: #4)
  - [x] 7.1 Updated to `REDIS_URL=redis://:YOUR_REDIS_PASSWORD@localhost:6379`
  - [x] 7.2 Added comments about password format and hex passwords

- [x] **Task 8: Update monitoring integration** (AC: #5)
  - [x] 8.1 `monitoring.service.ts` now uses `checkRedisHealth()` from factory instead of custom `getHealthRedis()` with dynamic import

- [x] **Task 9: Verify no remaining direct `new Redis()` usage** (AC: #2)
  - [x] 9.1 Verified: only `lib/redis.ts` (factory) has `new Redis()` in production code
  - [x] 9.2 Two test files retain direct Redis for integration setup — acceptable

- [x] **Task 10: Full regression test** (AC: #6)
  - [x] 10.1 API: 117/117 test files passed, 1,750 assertions, 0 failures
  - [x] 10.2 Build: TypeScript compilation succeeds (API + web)
  - [x] 10.3 Test mocking: `vi.mock('ioredis')` pattern still intercepts. Factory uses `typeof .on === 'function'` guards for mock compatibility.

## Dev Notes

### What Was Done
Centralized all Redis connection creation into a single factory module (`apps/api/src/lib/redis.ts`). Previously, 41+ files each created their own `new Redis()` connection with identical boilerplate. Now all production code imports from the factory. Adding Redis AUTH, TLS, or connection pooling is now a one-file change.

### Factory Design (lib/redis.ts)

**4 exports:**
| Export | Use Case | Pattern |
|--------|----------|---------|
| `getRedisClient()` | Rate limiters, services, caching | Lazy singleton — one shared connection |
| `createRedisConnection(options?)` | BullMQ queues/workers | New connection per call — BullMQ blocks on BRPOPLPUSH |
| `checkRedisHealth()` | Monitoring service | PING + latency measurement → `{ connected, latencyMs }` |
| `closeAllConnections()` | Graceful shutdown | Closes singleton + all tracked dedicated connections |

**Key design decisions:**
1. **Throw instead of `process.exit(1)`** for missing REDIS_URL in production — makes it testable. Uncaught error still crashes the process in production (same outcome, better DX).
2. **`typeof .on === 'function'` guards** on error handler registration — test mocks from `vi.mock('ioredis')` return minimal objects without `.on()`. Without this guard, every test that imports a migrated file would crash.
3. **`typeof .quit === 'function'` guards** in `closeAllConnections()` — same mock compatibility reason.
4. **No `maxRetriesPerRequest: null` on singleton** — only BullMQ connections need this (it disables the retry limit for blocking commands). Rate limiters and services use the default.

### Three Migration Patterns Used

**Pattern A — Services/middleware with test-mode guard (exported):**
Files that export `getRedisClient()` for other modules (e.g., `login-rate-limit.ts` → `marketplace-rate-limit.ts`) use aliased import to preserve the null-in-test-mode contract:
```typescript
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
export const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};
```
Used by: `login-rate-limit`, `password-reset-rate-limit`, `registration-rate-limit`, `google-auth-rate-limit`, `message-rate-limit`, `reveal-rate-limit`, `public-insights.service`, `survey-analytics.service`

**Pattern B — Services/middleware direct import:**
Files that don't export `getRedisClient` or don't need test-mode null guard import directly and delete local boilerplate:
```typescript
import { getRedisClient } from '../lib/redis.js';
// Delete: let redisClient, getRedisClient function
```
Used by: `rate-limit`, `export-rate-limit`, `sensitive-action`, `token.service`, `session.service`, `view-as.service`, `fraud-config.service`, `password-reset.service`, `registration.service`, `marketplace-edit.service`, `productivity-target.service`, `staff.controller`, `admin.routes`, `public-insights.routes`

**Pattern C — Queues/workers (dedicated connections):**
```typescript
import { createRedisConnection } from '../lib/redis.js';
const connection = createRedisConnection();
// Delete: import { Redis } from 'ioredis', local new Redis() call
```
Used by: all 8 queues, all 8 workers

### Issues Encountered During Implementation

#### Issue 1: TypeScript build errors (resolved)
- `Redis.quit()` returns `Promise<"OK">`, not `Promise<void>`. Fixed with `.then(() => {})` to coerce type.
- `email.queue.ts` used `Redis` type for variable but the value import was removed. Added `import type { Redis }` alongside factory import.

#### Issue 2: Test failures — `singletonClient.on is not a function` (26 failures → resolved)
Tests mock `ioredis` with minimal objects that lack `.on()`. The factory called `.on('error', ...)` unconditionally. Fixed with `typeof .on === 'function'` guard.

#### Issue 3: Test failures — `process.exit unexpectedly called with "1"` (8 failures → resolved)
`reveal-rate-limit.test.ts` sets `NODE_ENV=production` to test Redis path, but factory's original `process.exit(1)` for missing REDIS_URL killed the test runner. Two fixes:
1. Factory changed to `throw new Error(...)` instead of `process.exit(1)`
2. Test updated with `vi.stubEnv('REDIS_URL', 'redis://localhost:6379')`

#### Issue 4: Pre-existing bug — submission-processing timeout (5 failures → resolved)
`submission-processing.service.test.ts` had 5 tests timing out at 5s since Story 7.1. Root cause: `queueMarketplaceExtraction` was imported by the service but never mocked in the test. The real queue attempted a Redis connection and hung. Fixed by adding the missing mock:
```typescript
vi.mock('../../queues/marketplace-extraction.queue.js', () => ({
  queueMarketplaceExtraction: vi.fn().mockResolvedValue(undefined),
}));
```
All 28 tests now pass in 153ms (was 25s+ timeout).

### Verification Results

| Check | Result |
|-------|--------|
| `new Redis()` in production code outside factory | **0** (verified via grep) |
| `import { Redis } from 'ioredis'` in production code | **0** for instantiation (only `type` imports in 3 queue files; `staff.service.ts` and `email-budget.service.ts` use value imports for constructor parameter typing — pre-existing, not modified) |
| API test files | **117/117 passed** |
| API test assertions | **1,750 passed, 0 failed** |
| Web test files | **209/209 passed** |
| Web test assertions | **2,355 passed, 0 failed** |
| Total tests | **4,105 passed, 0 failures** |
| TypeScript build | **Passes (API + web)** |

### Project Structure Notes

- New directory: `apps/api/src/lib/` (created for this story)
- New file: `apps/api/src/lib/redis.ts`
- ESM imports use `.js` extension: `import { getRedisClient } from '../lib/redis.js'`
- `ioredis` remains a runtime dependency (the factory imports it)
- `email-budget.service.ts` and `staff.service.ts` still import `Redis` type from `ioredis` — they accept Redis as a constructor parameter, not for instantiation. No change needed.

### References

- [Source: infrastructure-security-audit-2026-04-04.md — Finding M-3 (41 scattered Redis connections)]
- [Source: sprint-change-proposal-2026-04-04.md — Section 4, SEC2-2]
- [Source: apps/api/src/services/token.service.ts:20-28 — original lazy-init pattern (now deleted)]
- [Source: project-context.md — Redis 7, BullMQ, ioredis, ES Modules]
- [Source: apps/api/src/middleware/__tests__/reveal-rate-limit.test.ts — production-mode test fix]
- [Source: apps/api/src/services/__tests__/submission-processing.service.test.ts — pre-existing bug fix]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context) — Dev agent (Amelia)

### Completion Notes List
1. Created `apps/api/src/lib/redis.ts` — centralized factory with 4 exports
2. Migrated 9 rate limiter middleware files — preserved test-mode null guards where exported
3. Migrated 8 queue files — `createRedisConnection()` for BullMQ dedicated connections
4. Migrated 8 worker files — replaced top-level `new Redis()` with factory
5. Migrated 11 service files — removed local `getRedisClient()` boilerplate from each
6. Migrated 3 remaining files (staff.controller, admin.routes, public-insights.routes)
7. Updated `.env.example` with password format documentation
8. Replaced `monitoring.service.ts` custom health check with `checkRedisHealth()` from factory
9. Fixed `reveal-rate-limit.test.ts` — added `vi.stubEnv('REDIS_URL', ...)` for production-mode tests
10. Fixed pre-existing bug: `submission-processing.service.test.ts` missing `marketplace-extraction.queue.js` mock (5 tests timing out → all 28 pass)
11. Factory uses `typeof .on === 'function'` guards for test mock compatibility
12. Factory throws `Error` instead of `process.exit(1)` for missing REDIS_URL — testable

### Bug Fix (Pre-existing)
`submission-processing.service.test.ts` had 5 tests timing out at 5s since at least Story 7.1 (when `queueMarketplaceExtraction` was added to the service). The queue was never mocked, causing real Redis connection attempts during tests. Added mock — all 28 tests now pass in 153ms.

### File List
**New (1):**
- `apps/api/src/lib/redis.ts` — centralized Redis connection factory

**Modified — Middleware (10):**
- `apps/api/src/middleware/rate-limit.ts`
- `apps/api/src/middleware/login-rate-limit.ts`
- `apps/api/src/middleware/password-reset-rate-limit.ts`
- `apps/api/src/middleware/registration-rate-limit.ts`
- `apps/api/src/middleware/google-auth-rate-limit.ts`
- `apps/api/src/middleware/export-rate-limit.ts`
- `apps/api/src/middleware/sensitive-action.ts`
- `apps/api/src/middleware/message-rate-limit.ts`
- `apps/api/src/middleware/reveal-rate-limit.ts`
- `apps/api/src/middleware/__tests__/reveal-rate-limit.test.ts`

**Modified — Queues (8):**
- `apps/api/src/queues/email.queue.ts`
- `apps/api/src/queues/import.queue.ts`
- `apps/api/src/queues/webhook-ingestion.queue.ts`
- `apps/api/src/queues/fraud-detection.queue.ts`
- `apps/api/src/queues/marketplace-extraction.queue.ts`
- `apps/api/src/queues/dispute-autoclose.queue.ts`
- `apps/api/src/queues/backup.queue.ts`
- `apps/api/src/queues/productivity-snapshot.queue.ts`

**Modified — Workers (8):**
- `apps/api/src/workers/email.worker.ts`
- `apps/api/src/workers/import.worker.ts`
- `apps/api/src/workers/webhook-ingestion.worker.ts`
- `apps/api/src/workers/fraud-detection.worker.ts`
- `apps/api/src/workers/marketplace-extraction.worker.ts`
- `apps/api/src/workers/dispute-autoclose.worker.ts`
- `apps/api/src/workers/backup.worker.ts`
- `apps/api/src/workers/productivity-snapshot.worker.ts`

**Modified — Services (11):**
- `apps/api/src/services/token.service.ts`
- `apps/api/src/services/session.service.ts`
- `apps/api/src/services/view-as.service.ts`
- `apps/api/src/services/fraud-config.service.ts`
- `apps/api/src/services/password-reset.service.ts`
- `apps/api/src/services/registration.service.ts`
- `apps/api/src/services/monitoring.service.ts`
- `apps/api/src/services/public-insights.service.ts`
- `apps/api/src/services/marketplace-edit.service.ts`
- `apps/api/src/services/survey-analytics.service.ts`
- `apps/api/src/services/productivity-target.service.ts`

**Modified — Controllers/Routes (3):**
- `apps/api/src/controllers/staff.controller.ts`
- `apps/api/src/routes/admin.routes.ts`
- `apps/api/src/routes/public-insights.routes.ts`

**Modified — Config/Tests (2):**
- `.env.example`
- `apps/api/src/services/__tests__/submission-processing.service.test.ts`

**Total: 1 new + 42 modified = 43 files**

## Senior Developer Review (AI)

**Reviewer:** Code Review Workflow (Adversarial) — Claude Opus 4.6
**Date:** 2026-04-04
**Outcome:** Changes Requested → All fixed

### Review Findings (10 issues: 3H, 3M, 4L — all resolved)

**HIGH:**
- [x] [AI-Review][H1] AC1 violation: factory threw plain `Error` instead of `AppError('REDIS_CONNECTION_FAILED', ...)` as specified in AC1. Fixed: imported `AppError` from `@oslsr/utils`, updated throw. [lib/redis.ts:15]
- [x] [AI-Review][H2] `closeAllConnections()` was dead code — never called by any shutdown handler. Fixed: wired into `workers/index.ts` closeAllWorkers(), added SIGTERM/SIGINT handler to main API server `index.ts`. [workers/index.ts:126, index.ts:37-43]
- [x] [AI-Review][H3] Zero unit tests for new factory module. Fixed: created `lib/__tests__/redis.test.ts` with 14 tests covering singleton behavior, createRedisConnection, checkRedisHealth, closeAllConnections, production enforcement, mock compatibility. [lib/__tests__/redis.test.ts]

**MEDIUM:**
- [x] [AI-Review][M1] Singleton `.quit()` missing `.catch()` in `closeAllConnections()` — dedicated connections had it but singleton didn't. Fixed: added `.catch()`. [lib/redis.ts:101]
- [x] [AI-Review][M2] Dual connection tracking (factory vs queue close functions) undocumented. Fixed: added JSDoc comments explaining double-quit safety. [lib/redis.ts:54-55, 91-92]
- [x] [AI-Review][M3] Unused `getRedisClient` import in `monitoring.service.ts` — only `checkRedisHealth` was used. Fixed: removed unused import, moved remaining import to top with other imports. [monitoring.service.ts:7]

**LOW:**
- [x] [AI-Review][L1] Unnecessary `getRedis` wrapper lambdas in `admin.routes.ts:16` and `staff.controller.ts:21`. Fixed: removed wrappers, call `getRedisClient()` directly. [admin.routes.ts, staff.controller.ts]
- [x] [AI-Review][L2] Story verification claim inaccuracy — said "only type imports remain" but `staff.service.ts` and `email-budget.service.ts` use value imports (pre-existing, not modified by story). Fixed: corrected verification table text.
- [x] [AI-Review][L3] Import ordering in `monitoring.service.ts` — redis import placed at line 53 after module-level declarations instead of at top with other imports. Fixed: moved to line 7.
- [x] [AI-Review][L4] `rate-limit.ts` used Pattern B (direct import) inconsistent with other rate limiters using Pattern A (guarded import). Fixed: aligned to Pattern A with aliased import + null-in-test-mode + optional chaining. [middleware/rate-limit.ts]

### Files Modified by Review
- `apps/api/src/lib/redis.ts` — H1 (AppError), M1 (.catch), M2 (docs)
- `apps/api/src/lib/__tests__/redis.test.ts` — H3 (new, 16 tests)
- `apps/api/src/index.ts` — H2 (SIGTERM/SIGINT handler)
- `apps/api/src/workers/index.ts` — H2 (closeAllConnections in shutdown)
- `apps/api/src/services/monitoring.service.ts` — M3 + L3 (import cleanup)
- `apps/api/src/routes/admin.routes.ts` — L1 (remove wrapper)
- `apps/api/src/controllers/staff.controller.ts` — L1 (remove wrapper)
- `apps/api/src/middleware/rate-limit.ts` — L4 (Pattern A alignment)
- `_bmad-output/implementation-artifacts/sec2-2-centralized-redis-connection-factory.md` — L2 (doc fix)

### Change Log
| Date | Change | Author |
|------|--------|--------|
| 2026-04-04 | Story implemented — 1 new + 42 modified files | Dev Agent (Amelia) |
| 2026-04-04 | Code review: 10 findings (3H, 3M, 4L), all 10 auto-fixed | Review Workflow |

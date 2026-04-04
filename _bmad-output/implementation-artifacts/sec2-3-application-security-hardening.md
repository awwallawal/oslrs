# Story sec2.3: Application Security Hardening

Status: ready-for-dev

<!-- Source: infrastructure-security-audit-2026-04-04.md — Findings C-3, H-1, H-2, H-3, M-2 -->
<!-- Source: sprint-change-proposal-2026-04-04.md — Section 4 -->
<!-- Depends on: SEC2-2 (Redis factory must exist before modifying token.service.ts) -->

## Story

As a security engineer,
I want to eliminate JWT fallback defaults, enforce CSP, add explicit body size limits, validate CORS, and harden WebSocket transport,
so that the application has no silent security degradation paths in production.

## Acceptance Criteria

1. **AC1:** `TokenService` in `token.service.ts` throws `AppError('MISSING_JWT_SECRET', ...)` on startup if `JWT_SECRET` or `JWT_REFRESH_SECRET` is undefined. No fallback default strings exist in the codebase. In test environments (`NODE_ENV=test` or `VITEST=true`), a deterministic test secret is used instead of throwing.

2. **AC2:** `express.json()` configured with explicit `{ limit: '1mb' }` in `app.ts`. Requests exceeding 1MB receive HTTP 413 (Payload Too Large).

3. **AC3:** CSP `reportOnly` is `false` in production (`NODE_ENV=production`). Report-only mode remains active in development/test for debugging. CSP violations are blocked AND reported in production.

4. **AC4:** CORS configuration rejects `CORS_ORIGIN='*'` in production. If `CORS_ORIGIN` is `*` and `NODE_ENV=production`, the application throws on startup with clear error message.

5. **AC5:** Socket.io `transports` configured as `['websocket']` only (no `polling` fallback). WebSocket upgrade header properly required.

6. **AC6:** All existing tests pass (4,093+) with zero regressions. New tests cover:
   - JWT secret validation (missing secret throws in production, uses test secret in test)
   - Body size limit (413 response for oversized payload)
   - CORS wildcard rejection in production mode

## Tasks / Subtasks

- [ ] **Task 1: Remove JWT fallback defaults** (AC: #1)
  - [ ] 1.1 In `apps/api/src/services/token.service.ts:31-32`, replace:
    ```
    private static jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    private static refreshSecret = process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-in-production';
    ```
    With logic that:
    - In test mode (`NODE_ENV=test` or `VITEST=true`): uses `'test-jwt-secret-minimum-32-characters-long'` (deterministic for test reproducibility)
    - In all other modes: reads from env var, throws `AppError('MISSING_JWT_SECRET', 'JWT_SECRET environment variable is required', 500)` if undefined
  - [ ] 1.2 Update `validateEnvironment()` in `app.ts` to also validate `JWT_REFRESH_SECRET` length >= 32 in production (currently only validates `JWT_SECRET`)
  - [ ] 1.3 Write tests:
    - Test that `TokenService.generateAccessToken()` works in test mode without env vars
    - Test that missing JWT_SECRET in non-test mode is caught (mock NODE_ENV)

- [ ] **Task 2: Add explicit body size limit** (AC: #2)
  - [ ] 2.1 In `apps/api/src/app.ts:152`, change:
    ```
    app.use(express.json());
    ```
    to:
    ```
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ limit: '1mb', extended: true }));
    ```
  - [ ] 2.2 Write test: POST to any endpoint with body > 1MB → receives 413 status code

- [ ] **Task 3: Graduate CSP to enforcement in production** (AC: #3)
  - [ ] 3.1 In `apps/api/src/app.ts:89`, change:
    ```
    reportOnly: true,
    ```
    to:
    ```
    reportOnly: process.env.NODE_ENV !== 'production',
    ```
  - [ ] 3.2 Verify the CSP violation report endpoint (`/api/v1/csp-report`) still receives reports even in enforcement mode (CSP `report-uri` directive works alongside enforcement)
  - [ ] 3.3 Write test: In production mode, CSP header should be `Content-Security-Policy` (not `Content-Security-Policy-Report-Only`)

- [ ] **Task 4: Validate CORS origin in production** (AC: #4)
  - [ ] 4.1 In `apps/api/src/app.ts`, after line 82 (`const corsOrigin = ...`), add validation:
    ```typescript
    if (process.env.NODE_ENV === 'production' && corsOrigin === '*') {
      console.error('[SECURITY] CORS_ORIGIN cannot be wildcard (*) in production. Set a specific origin.');
      process.exit(1);
    }
    ```
  - [ ] 4.2 Add `CORS_ORIGIN` format validation: must start with `http://` or `https://` in production
  - [ ] 4.3 Write test: Verify wildcard CORS is rejected when NODE_ENV=production

- [ ] **Task 5: Harden Socket.io transport** (AC: #5)
  - [ ] 5.1 In `apps/api/src/realtime/index.ts`, change `transports: ['websocket', 'polling']` to `transports: ['websocket']`
  - [ ] 5.2 Verify frontend socket.io client also uses `transports: ['websocket']` — check `apps/web/src/` for socket.io-client configuration
  - [ ] 5.3 If frontend socket config exists, update to match: `transports: ['websocket']`

- [ ] **Task 6: Full regression test** (AC: #6)
  - [ ] 6.1 Run `pnpm test` — all 4,093+ tests must pass
  - [ ] 6.2 Run `pnpm build` — TypeScript compilation succeeds
  - [ ] 6.3 Verify no test relies on the old fallback JWT secret strings

## Dev Notes

### JWT Secret Strategy by Environment
| Environment | JWT_SECRET source | Behavior if missing |
|-------------|------------------|---------------------|
| `production` | `process.env.JWT_SECRET` (required, >= 32 chars) | `process.exit(1)` in `validateEnvironment()` |
| `development` | `process.env.JWT_SECRET` (required) | Throws `AppError` at first token operation |
| `test` | Deterministic test constant | Never throws — test reproducibility |

### CSP Enforcement Risk
CSP has been in report-only mode since SEC-2 (2026-03-01). Before enforcing, check if any CSP violation reports have been logged at `/api/v1/csp-report`. If violations exist for legitimate resources, update the CSP directives before switching to enforcement. The `reportOnly` change is gated on `NODE_ENV === 'production'` so development remains unaffected.

### Socket.io Polling Removal Impact
Removing polling transport means clients that cannot establish WebSocket connections (some corporate proxies, very old browsers) will fail to connect. This is acceptable for OSLSR's user base (government staff on modern browsers + field workers on mobile). The polling transport was a CSRF attack surface via long-polling HTTP requests.

### Project Structure Notes

- Modified files: `app.ts`, `token.service.ts`, `realtime/index.ts`, possibly frontend socket config
- No new files created (modifications only)
- Pattern: ESM imports, AppError for errors, Zod for validation

### References

- [Source: infrastructure-security-audit-2026-04-04.md — Findings C-3, H-1, H-2, H-3, M-2]
- [Source: sprint-change-proposal-2026-04-04.md — Section 4, SEC2-3]
- [Source: apps/api/src/services/token.service.ts:31-32 — JWT fallback defaults]
- [Source: apps/api/src/app.ts:82,89,152 — CORS, CSP, body limit]
- [Source: security-audit-report-2026-03-01.md — SEC-2 CSP implementation history]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List

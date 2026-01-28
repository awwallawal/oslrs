# Story 2.6: ODK Mock Server for Integration Testing

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want a mock ODK Central server that simulates the real ODK Central API,
so that integration tests for `@oslsr/odk-integration` can verify full HTTP request/response flows without requiring a live ODK Central instance.

## Acceptance Criteria

1. **Given** the `@oslsr/odk-integration` test suite, **when** integration tests run, **then** a mock ODK Central server MUST be available that responds to all ODK endpoints used by the project (sessions, forms, drafts, publish).
2. **Given** the mock server, **when** `POST /v1/sessions` is called with valid credentials, **then** it MUST return a valid session token response matching the `OdkSessionResponse` type, **and** reject invalid credentials with 401.
3. **Given** the mock server, **when** `POST /v1/projects/{projectId}/forms?publish=true` is called with an XLSForm binary body, **then** it MUST return a valid `OdkFormResponse` for first-time publish, **and** return 409 if the form already exists (triggering version-update flow).
4. **Given** the mock server, **when** the draft+publish flow is used (`POST /forms/{xmlFormId}/draft` then `POST /forms/{xmlFormId}/draft/publish`), **then** the mock MUST track form state and return correct responses for the version-update workflow.
5. **Given** the mock server, **when** error scenarios are configured (network failure, 500, 401, 404, 409), **then** the mock MUST be programmable to simulate these failures per-test.
6. **Given** the mock server, **when** tests complete, **then** all HTTP requests received MUST be inspectable for assertion purposes (method, path, headers, body).
7. **Given** the mock server implementation, **then** it MUST use MSW (Mock Service Worker) for HTTP-level interception (NOT Express-based mock server) to keep tests fast and isolated.
8. **Given** the existing `odk-client.test.ts` (17 tests) and `odk-form.service.test.ts` (15 tests), **when** the mock server is available, **then** at least the `odk-form.service.test.ts` MUST be upgraded to use the mock server for more realistic request/response validation.

## Tasks / Subtasks

- [x] Task 1: Set up MSW for `@oslsr/odk-integration` (AC: 7)
  - [x] 1.1 Add `msw` as devDependency to `services/odk-integration/package.json`
  - [x] 1.2 Create `services/odk-integration/src/__tests__/msw/handlers.ts` — define all ODK Central API handlers
  - [x] 1.3 Create `services/odk-integration/src/__tests__/msw/server.ts` — MSW `setupServer()` with default handlers
  - [x] 1.4 Update `services/odk-integration/vitest.config.ts` — add comment noting MSW is opt-in per test file (not auto-loaded)
  - [x] 1.5 Create `services/odk-integration/src/__tests__/msw/setup.ts` — Vitest setup file with MSW server start/stop/reset

- [x] Task 2: Implement session endpoint handlers (AC: 2, 6)
  - [x] 2.1 `POST /v1/sessions` handler — accepts `email` + `password`, returns `OdkSessionResponse` with token, expiresAt, createdAt
  - [x] 2.2 Reject invalid credentials with 401 status and `OdkErrorResponse` body
  - [x] 2.3 Track all requests in a `requestLog` array for per-test assertion (method, path, headers, body)

- [x] Task 3: Implement form management handlers (AC: 3, 4, 5)
  - [x] 3.1 `POST /v1/projects/:projectId/forms` handler — first-time publish, returns `OdkFormResponse`, stores form in in-memory state
  - [x] 3.2 Return 409 when form with same `xmlFormId` already exists (trigger version-update flow)
  - [x] 3.3 `POST /v1/projects/:projectId/forms/:xmlFormId/draft` handler — accepts file body, returns 200
  - [x] 3.4 `POST /v1/projects/:projectId/forms/:xmlFormId/draft/publish` handler — transitions draft to published, returns `OdkFormResponse` with `publishedAt`
  - [x] 3.5 Implement configurable error injection: `mockServerState.setNextError(status, code, message)` for per-test failure simulation
  - [x] 3.6 Validate `Content-Type` header on form uploads (xlsx vs xml) to catch content-type detection bugs like the one found in Story 2-2 review

- [x] Task 4: Upgrade `odk-form.service.test.ts` to use MSW (AC: 8)
  - [x] 4.1 Created new `odk-form.service.msw.test.ts` for MSW-based tests (preserved existing vi.fn tests for fast unit testing)
  - [x] 4.2 Add test: first-time publish end-to-end (session → form upload → verify response)
  - [x] 4.3 Add test: version-update end-to-end (session → 409 → draft upload → draft publish → verify response)
  - [x] 4.4 Add test: verify correct `Content-Type` header sent for xlsx vs xml files
  - [x] 4.5 Add test: verify `Authorization` header included on form requests
  - [x] 4.6 Add test: partial failure — mock server succeeds but handler throws during DB update (verify orphaned deploy logging)
  - [x] 4.7 Add test: network failure simulation (MSW `HttpResponse.error()`)
  - [x] 4.8 Existing 15 vi.fn()-based tests preserved (now 54 total tests: 15 + 17 + 11 + 11)

- [x] Task 5: Add request inspection utilities (AC: 6)
  - [x] 5.1 Create `services/odk-integration/src/__tests__/msw/request-inspector.ts` — utility to query logged requests by path, method, or header
  - [x] 5.2 Add `getRequests(filter?)`, `getLastRequest()`, `clearRequests()`, `getRequestCount()`, `expectRequest()` helpers
  - [x] 5.3 Tests in `msw.integration.test.ts` verify request inspector correctly captures method, path, headers, body

- [x] Task 6: Documentation and cross-story readiness (AC: 1)
  - [x] 6.1 Add inline JSDoc to all handlers explaining the ODK Central API behavior they simulate
  - [x] 6.2 Add `services/odk-integration/src/__tests__/msw/README.md` — comprehensive usage guide for future stories (2-3, 2-4, 2-5)
  - [x] 6.3 Run full test suite to verify no regressions: 740 tests passing (208 API + 478 web + 54 odk-integration)

## Out of Scope

- **Docker-based ODK Central mock container** — MSW provides sufficient coverage for unit/integration tests; full Docker mock deferred unless E2E tests require it.
- **ODK Central webhook simulation** — Webhooks are Story 3-4 (BullMQ ingestion), not relevant here.
- **ODK App User endpoints** — Story 2-3 will add those handlers to the existing MSW setup created here.

## Dev Notes

- **MSW (Mock Service Worker) chosen over Express mock server** because:
  - No port binding needed → tests are faster and parallelizable
  - Intercepts at the `fetch` level → validates real HTTP requests from `odkRequest()`
  - Reset between tests → isolated state per test
  - Used by ODK Central's own test suite and widely adopted in Node.js testing

- **ADR-002 constraint**: All mock endpoints must match the real ODK Central API paths documented at `https://docs.getodk.org/central-api-form-management/`. The mock is NOT a creative interpretation — it must match production behavior.

- **Existing test migration**: The 15 tests in `odk-form.service.test.ts` currently use `vi.mock()` to mock the `odkRequest` function. Task 4 should upgrade these to use MSW for more realistic validation while preserving test coverage. If migration is impractical for some tests, keep `vi.mock()` versions and add MSW-based tests alongside.

- **Content-type bug prevention**: Story 2-2 code review found that `mimeType.includes('xml')` incorrectly matched xlsx files. The mock server MUST validate `Content-Type` headers to catch such regressions.

- **Request logging for assertions**: MSW's `server.events` API or a custom handler wrapper can log all requests. This enables tests like:
  ```typescript
  expect(getLastRequest('/v1/sessions').body).toEqual({
    email: 'admin@example.com',
    password: 'secret123',
  });
  ```

- **In-memory form state**: The mock server should maintain a simple `Map<string, OdkFormResponse>` to track which forms exist, enabling realistic 409 responses on duplicate creates.

- **ESM compatibility**: MSW v2 supports ESM natively. Import as `import { http, HttpResponse } from 'msw'` and `import { setupServer } from 'msw/node'`.

### Project Structure Notes

- All files go in `services/odk-integration/src/__tests__/msw/` (test infrastructure, co-located with tests)
- MSW handlers follow ODK Central REST API paths: `/v1/sessions`, `/v1/projects/:projectId/forms`, etc.
- Setup file registered in `vitest.config.ts` as `setupFiles: ['./src/__tests__/msw/setup.ts']`
- Naming: kebab-case files, camelCase exports

### Task Dependency Order

Tasks MUST be executed in order: 1 → 2 → 3 → 4 → 5 → 6. Task 1 (MSW setup) is prerequisite for Tasks 2-3 (handlers). Task 4 (test migration) requires Tasks 2-3 (handlers exist).

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-002] — ODK integration abstraction boundary
- [Source: _bmad-output/implementation-artifacts/2-2-odk-central-form-deployment.md] — Code review findings, existing test patterns
- [Source: ODK Central API docs](https://docs.getodk.org/central-api-form-management/) — Endpoint specifications
- [Source: MSW docs](https://mswjs.io/docs/getting-started/mocks/node) — Node.js mock server setup
- [Source: _bmad-output/project-context.md] — Testing patterns, ESM conventions, Vitest config

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- **Task 1**: MSW v2 installed, handlers/server/setup files created. Design decision: MSW not auto-loaded globally (preserves backward compatibility with existing vi.fn() tests). Tests opt-in via `initMswForTest()`.
- **Task 2**: Session handler with credential validation, request logging, error injection. Default credentials: admin@example.com / secret123.
- **Task 3**: Form handlers for create (with 409 detection), draft upload, draft publish. Content-Type validation implemented to catch Story 2-2 type bugs.
- **Task 4**: Created separate `odk-form.service.msw.test.ts` (11 MSW-based tests) rather than modifying existing vi.fn() tests. This provides both fast unit tests and realistic integration tests.
- **Task 5**: Request inspector with filtering by method/path/pattern/header. Includes `expectRequest()` helper for convenient assertions.
- **Task 6**: Comprehensive README with quick start, API reference, extension guide for Stories 2-3/2-4/2-5.

### Change Log

- 2026-01-28: Story 2-6 implementation complete. MSW mock ODK Central server ready for integration testing.

### File List

**New Files:**
- `services/odk-integration/src/__tests__/msw/handlers.ts` - ODK Central API handlers (sessions, forms, drafts)
- `services/odk-integration/src/__tests__/msw/server.ts` - MSW setupServer() instance
- `services/odk-integration/src/__tests__/msw/server-state.ts` - State management (forms, requests, errors)
- `services/odk-integration/src/__tests__/msw/setup.ts` - Vitest lifecycle hooks
- `services/odk-integration/src/__tests__/msw/index.ts` - Barrel exports + initMswForTest()
- `services/odk-integration/src/__tests__/msw/request-inspector.ts` - Request filtering utilities
- `services/odk-integration/src/__tests__/msw/README.md` - Usage documentation
- `services/odk-integration/src/__tests__/msw.integration.test.ts` - MSW handler verification tests (11 tests)
- `services/odk-integration/src/__tests__/odk-form.service.msw.test.ts` - MSW-based form service tests (11 tests)

**Modified Files:**
- `services/odk-integration/package.json` - Added msw@2 devDependency
- `services/odk-integration/vitest.config.ts` - Added comment noting MSW is opt-in

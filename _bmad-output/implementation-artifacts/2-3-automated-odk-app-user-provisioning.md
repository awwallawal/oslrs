# Story 2.3: Automated ODK App User Provisioning

Status: review

## Story

As a System,
I want to automatically create ODK App Users for every provisioned staff member,
so that they can collect data immediately without manual ODK Central configuration.

## Acceptance Criteria

1. **Given** a staff member with a field role (Enumerator or Supervisor), **when** their account is successfully activated (profile completion done), **then** the system MUST asynchronously trigger ODK App User creation via BullMQ job.
2. **Given** the ODK App User creation job, **when** executed, **then** the system MUST call `POST /v1/projects/{projectId}/app-users` with a display name matching the staff member's full name and role.
3. **Given** a successful ODK App User creation, **then** the system MUST store the returned `id`, `token`, `displayName`, and `createdAt` in the `odk_app_users` table, linked to the staff `user_id`.
4. **Given** the ODK App User token, **then** it MUST be encrypted using AES-256-GCM before storage in `odk_app_users.encrypted_token`, with IV stored alongside (per ADR-006 defense-in-depth).
5. **Given** a staff member who already has an ODK App User, **when** another activation event fires, **then** the system MUST skip creation and log `odk.appuser.already_exists` (idempotent operation).
6. **Given** an ODK Central API failure during App User creation, **then** the system MUST retry with exponential backoff (5 attempts, 5s base delay) and log `odk.appuser.create_failed` with structured error details.
7. **Given** the ODK integration module, **then** all ODK App User operations MUST be isolated within `@oslsr/odk-integration` per ADR-002 (no other service calls ODK directly).
8. **Given** ODK App User creation succeeds, **then** an audit log entry MUST be created with action `user.odk_app_user_provisioned` recording the ODK App User ID and project ID.
9. **Given** the MSW mock server from Story 2-6, **when** integration tests run, **then** App User endpoint handlers MUST be added to simulate ODK Central responses.
10. **Given** only field staff roles require ODK access, **when** a back-office role (Verification Assessor, Government Official, Super Admin) is activated, **then** NO ODK App User creation MUST be triggered.

## Tasks / Subtasks

- [x] Task 1: Add ODK App User schema and migration (AC: 3, 4)
  - [x] 1.1 Create `apps/api/src/db/schema/odk-app-users.ts` — new table `odk_app_users` with columns:
    - `id` (UUIDv7 PK)
    - `user_id` (UUID FK to users.id, UNIQUE)
    - `odk_app_user_id` (INTEGER, ODK Central's internal ID)
    - `display_name` (TEXT)
    - `encrypted_token` (TEXT, AES-256-GCM encrypted)
    - `token_iv` (TEXT, initialization vector for decryption)
    - `odk_project_id` (INTEGER)
    - `created_at`, `updated_at` timestamps
  - [x] 1.2 Update `apps/api/src/db/schema/index.ts` — export odk-app-users schema
  - [x] 1.3 Generate Drizzle migration via `pnpm --filter api db:generate`
  - [x] 1.4 Add TypeScript types in `packages/types/src/odk-app-user.ts`:
    - `OdkAppUserRecord` (DB shape)
    - `OdkAppUserResponse` (API response, WITHOUT encrypted token)
    - `CreateOdkAppUserPayload` (for job queue)

- [x] Task 2: Implement token encryption utilities (AC: 4)
  - [x] 2.1 Create `packages/utils/src/encryption.ts` — AES-256-GCM encrypt/decrypt functions:
    - `encryptToken(plaintext: string, key: Buffer): { ciphertext: string, iv: string }`
    - `decryptToken(ciphertext: string, iv: string, key: Buffer): string`
  - [x] 2.2 Add `ODK_TOKEN_ENCRYPTION_KEY` environment variable (32-byte hex string) to config validation
  - [x] 2.3 Create `packages/utils/src/__tests__/encryption.test.ts` — unit tests for encrypt/decrypt round-trip, IV uniqueness, tamper detection
  - [x] 2.4 Export encryption utilities from `packages/utils/src/index.ts`

- [x] Task 3: Implement ODK App User client methods (AC: 2, 7)
  - [x] 3.1 Add to `services/odk-integration/src/odk-client.ts`:
    - `createAppUser(config: OdkConfig, projectId: number, displayName: string): Promise<OdkAppUserApiResponse>`
    - Type: `OdkAppUserApiResponse` matching ODK Central API response `{ id, type, displayName, token, createdAt }`
  - [x] 3.2 Create `services/odk-integration/src/odk-app-user.service.ts`:
    - `provisionAppUser(userId: string, fullName: string, role: string): Promise<OdkAppUserRecord>`
    - Calls `createAppUser()`, encrypts token, stores in DB, creates audit log
    - Returns without token (never expose plaintext token)
  - [x] 3.3 Add barrel export in `services/odk-integration/src/index.ts`

- [x] Task 4: Create BullMQ job for async provisioning (AC: 1, 5, 6)
  - [x] 4.1 Create `apps/api/src/queues/odk-app-user.queue.ts`:
    - Job name: `odk-app-user-provision`
    - Payload: `{ userId: string, fullName: string, role: UserRole }`
    - Retry config: 5 attempts, exponential backoff (5s, 10s, 20s, 40s, 80s)
  - [x] 4.2 Create `apps/api/src/workers/odk-app-user.worker.ts`:
    - Checks if App User already exists (skip if yes, log `odk.appuser.already_exists`)
    - Filters out back-office roles (skip with log `odk.appuser.skipped_backoffice`)
    - Calls `OdkAppUserService.provisionAppUser()`
    - Logs `odk.appuser.created` on success, `odk.appuser.create_failed` on error
  - [x] 4.3 Worker uses db and auditLogs from apps/api
  - [x] 4.4 Create `apps/api/src/workers/__tests__/odk-app-user.worker.test.ts` — 20 unit tests with mocked ODK service

- [x] Task 5: Trigger provisioning on staff activation (AC: 1, 10)
  - [x] 5.1 Identified staff activation in `apps/api/src/services/auth.service.ts` — `activateAccount()` method
  - [x] 5.2 Added job dispatch after successful activation in `auth.service.ts`:
    - Imports `queueOdkAppUserProvision` and `isOdkAvailable`
    - Fetches user with role relation
    - Dispatches job if `isFieldRole(role)` and ODK is configured
    - Logs skipped back-office roles
  - [x] 5.3 `isFieldRole(role: UserRole): boolean` already in `packages/types/src/odk-app-user.ts` — returns true for ENUMERATOR, SUPERVISOR
  - [x] 5.4 Existing activation tests pass (security.auth.test.ts, email-templates.test.ts)

- [x] Task 6: Add audit logging integration (AC: 8)
  - [x] 6.1 Created `packages/types/src/audit.ts` with `AUDIT_ACTION_USER_ODK_APP_USER_PROVISIONED = 'user.odk_app_user_provisioned'`
  - [x] 6.2 Audit log creation in worker's OdkAppUserAudit implementation (odk-app-user.worker.ts:99-114):
    - `action: 'user.odk_app_user_provisioned'`
    - `targetResource: 'users'`, `targetId: userId`
    - `details: { odkAppUserId, odkProjectId, displayName }`
  - [x] 6.3 Audit log creation verified in unit tests

- [x] Task 7: Add MSW handlers for ODK App User endpoints (AC: 9)
  - [x] 7.1 Added to `services/odk-integration/src/__tests__/msw/handlers.ts`:
    - `POST /v1/projects/:projectId/app-users` — returns `OdkAppUserApiResponse` with generated token
    - Track created App Users in `mockServerState.appUsers`
  - [x] 7.2 Error injection support via `mockServerState.setNextError()` (401, 404, 500)
  - [x] 7.3 MockAppUser type added to server-state.ts with createAppUser, getAppUsers, getAppUser methods

- [x] Task 8: Write integration tests for full provisioning flow (AC: 1-10)
  - [x] 8.1 Created `services/odk-integration/src/__tests__/odk-app-user.service.test.ts` with 12 tests:
    - Test: successful App User creation with encryption (AC2)
    - Test: idempotent skip when user already has App User (AC5)
    - Test: retry on ODK API failure (AC6 - 401, 404, 500 error handling)
    - Test: audit log creation on success (AC8)
    - Test: encryption with unique IVs (AC4)
    - Test: no plaintext token in response (AC7)
  - [x] 8.2 MSW integration tests included in same file - full HTTP round-trip with MSW mock
  - [x] 8.3 Worker tests in `apps/api/src/workers/__tests__/odk-app-user.worker.test.ts` (20 tests):
    - Test: job payload validation
    - Test: field role detection (AC10)
    - Test: back-office role skipping (AC10)

## Out of Scope

- **Token decryption and Enketo launch** — Story 3.1 (Seamless Enketo Launch) will implement decryption and form launch using the stored tokens.
- **ODK App User deletion** — No requirement to remove ODK App Users when staff are deactivated. ODK Central allows inactive App Users.
- **Project assignment UI** — This story provisions to the single `ODK_PROJECT_ID`. Multi-project support is out of scope.
- **QR code generation for ODK Collect** — This system uses Enketo web forms (PWA), not ODK Collect mobile app.

## Dev Notes

- **ADR-002 is the critical constraint**: ALL ODK App User API calls MUST go through `@oslsr/odk-integration`. No other service may import HTTP clients or call ODK endpoints directly.

- **ODK Central App User API**:
  - `POST /v1/projects/{projectId}/app-users` creates an App User
  - Request body: `{ displayName: string }` (optional, defaults to auto-generated)
  - Response: `{ id: number, type: 'field_key', displayName: string, token: string, createdAt: string }`
  - The `token` is a long-lived key (never expires) used for Enketo authentication
  - **CRITICAL**: Token is returned ONLY on creation. ODK Central does NOT provide a way to retrieve it later. Must store securely on first creation.

- **Token encryption (AES-256-GCM)**:
  - Use Node.js `crypto.createCipheriv('aes-256-gcm', key, iv)`
  - Generate random 12-byte IV for each encryption
  - Store both ciphertext and IV (IV is not secret)
  - Auth tag included in ciphertext for tamper detection
  - Key from `ODK_TOKEN_ENCRYPTION_KEY` env var (32 bytes = 64 hex chars)

- **BullMQ job patterns** (from project-context.md):
  - Job name: `odk-app-user-provision` (kebab-case)
  - Retry with exponential backoff: `{ attempts: 5, backoff: { type: 'exponential', delay: 5000 } }`
  - Processor registered in `apps/api/src/jobs/index.ts`

- **Field roles vs Back-office roles**:
  - Field roles (need ODK App User): `ENUMERATOR`, `SUPERVISOR`
  - Back-office roles (NO ODK App User): `VERIFICATION_ASSESSOR`, `GOVERNMENT_OFFICIAL`, `SUPER_ADMIN`, `DATA_ENTRY_CLERK`
  - Data Entry Clerks use the web interface, not Enketo/ODK (per FR20)

- **Idempotency**: Check `odk_app_users` table for existing record before calling ODK API. If record exists with same `user_id`, skip and log. This prevents duplicate App Users if activation event fires multiple times.

- **Logging patterns** (from project-context.md):
  - `odk.appuser.created` — successful provisioning
  - `odk.appuser.already_exists` — skipped due to existing record
  - `odk.appuser.create_failed` — ODK API error (include statusCode, errorMessage)
  - `odk.appuser.skipped_backoffice` — skipped due to non-field role

- **Environment variables**:
  - `ODK_TOKEN_ENCRYPTION_KEY` — 32-byte hex string for AES-256 encryption (required)
  - Existing ODK vars from Story 2-2: `ODK_CENTRAL_URL`, `ODK_ADMIN_EMAIL`, `ODK_ADMIN_PASSWORD`, `ODK_PROJECT_ID`

- **MSW mock state**: Story 2-6 created `mockServerState` in `services/odk-integration/src/__tests__/msw/server-state.ts`. Extend it to track App Users:
  ```typescript
  appUsers: Map<number, OdkAppUserApiResponse>  // keyed by ODK App User ID
  ```

- **ESM imports**: All local imports in `apps/api/` and `services/odk-integration/` must use `.js` extension (per project-context.md ESM conventions).

### Project Structure Notes

- **IMPORTANT**: ODK App User service goes in `services/odk-integration/src/odk-app-user.service.ts` (existing workspace package), NOT in `apps/api/src/services/`.
- BullMQ job files go in `apps/api/src/jobs/` (job definitions and processors)
- Schema changes in `apps/api/src/db/schema/`
- Types in `packages/types/src/`
- Encryption utilities in `packages/utils/src/`

### Task Dependency Order

Tasks MUST be executed in order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Task 1 (schema) and Task 2 (encryption) are prerequisites for Task 3 (service). Task 3 (service) is prerequisite for Task 4 (job). Task 4 (job) is prerequisite for Task 5 (trigger).

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-002] — ODK integration abstraction boundary
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-006] — Defense-in-depth security (encryption at rest)
- [Source: _bmad-output/implementation-artifacts/2-2-odk-central-form-deployment.md] — ODK client patterns, session management
- [Source: _bmad-output/implementation-artifacts/2-6-odk-mock-server-integration-testing.md] — MSW setup, handler patterns
- [Source: _bmad-output/project-context.md] — UUIDv7, BullMQ patterns, Pino logging, ESM conventions
- [Source: ODK Central API docs](https://docs.getodk.org/central-api-app-user-management/) — `POST /v1/projects/{projectId}/app-users`
- [Source: Node.js crypto docs](https://nodejs.org/api/crypto.html#cryptoauthenticateddecryptoptionsalgorithm-key-iv-authtag) — AES-256-GCM implementation

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Tests verified via `pnpm --filter api test` and `pnpm --filter @oslsr/odk-integration test`
- All 260 API tests pass (228 existing + 32 new processor tests)
- All 66 odk-integration tests pass

### Completion Notes List

1. **Task 1-2**: Schema and encryption utilities - implemented in existing `crypto.ts` (extended)
2. **Task 3**: ODK client `createAppUser` method added to `odk-client.ts`
3. **Task 4**: BullMQ implemented using `queues/` and `workers/` directory pattern (not `jobs/` as originally planned)
4. **Task 5**: Trigger added to `auth.service.ts` (not `user.service.ts`) in `activateAccount` method
5. **Task 6**: Audit logging integrated via `OdkAppUserAudit` interface
6. **Task 7**: MSW handlers extended with `createAppUserHandler`
7. **Task 8**: Tests consolidated - MSW tests in `odk-app-user.service.test.ts`, processor tests in separate file
8. **Code Review Fix**: Extracted `processOdkAppUserJob` function for testability, added 32 comprehensive processor tests

### File List

**Backend - Schema & Types (Task 1):**
- `apps/api/src/db/schema/odk-app-users.ts` - NEW: ODK App Users table
- `apps/api/src/db/schema/index.ts` - Export odk-app-users
- `apps/api/src/db/schema/relations.ts` - Add odkAppUsers relation
- `apps/api/drizzle/0010_orange_exodus.sql` - NEW: Migration for odk_app_users table
- `packages/types/src/odk-app-user.ts` - NEW: ODK App User types + isFieldRole helper

**Backend - Encryption (Task 2):**
- `packages/utils/src/crypto.ts` - EXTENDED: Added encryptToken/decryptToken (AES-256-GCM)
- `packages/utils/src/__tests__/crypto.test.ts` - EXTENDED: Added encryption tests
- `packages/types/src/validation/odk-config.ts` - Added requireEncryptionKey helper

**Backend - ODK Integration (Task 3):**
- `services/odk-integration/src/odk-client.ts` - Added createAppUser method
- `services/odk-integration/src/odk-app-user.service.ts` - NEW: App User provisioning service
- `services/odk-integration/src/index.ts` - Export odk-app-user.service

**Backend - BullMQ Queue & Worker (Task 4):**
- `apps/api/src/queues/odk-app-user.queue.ts` - NEW: Queue definition with retry config
- `apps/api/src/workers/odk-app-user.worker.ts` - NEW: Worker with extracted processor function
- `apps/api/src/workers/__tests__/odk-app-user.worker.test.ts` - NEW: Schema/role validation tests
- `apps/api/src/workers/__tests__/odk-app-user.processor.test.ts` - NEW: Comprehensive processor tests (32 tests)

**Backend - Trigger Integration (Task 5):**
- `apps/api/src/services/auth.service.ts` - Add job dispatch in activateAccount method

**Backend - Audit Logging (Task 6):**
- Integrated via OdkAppUserAudit interface in worker

**Testing - MSW Handlers (Task 7):**
- `services/odk-integration/src/__tests__/msw/handlers.ts` - Add createAppUserHandler
- `services/odk-integration/src/__tests__/msw/server-state.ts` - Add MockAppUser type and createAppUser method

**Testing - Integration Tests (Task 8):**
- `services/odk-integration/src/__tests__/odk-app-user.service.test.ts` - NEW: 12 tests (includes MSW tests)

**Environment:**
- `.env.example` - Added ODK_TOKEN_ENCRYPTION_KEY, fixed ODK_CENTRAL_URL

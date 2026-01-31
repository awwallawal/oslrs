# Story 2.4: Encrypted ODK Token Management

Status: done

## Story

As a System,
I want to securely manage ODK App User tokens with proper access controls and audit logging,
so that tokens can be retrieved for Enketo authentication while maintaining defense-in-depth security.

## Acceptance Criteria

1. **Given** an encrypted ODK App User token stored in `odk_app_users`, **when** the backend service calls `getDecryptedToken(userId)`, **then** the system MUST decrypt using AES-256-GCM and return the plaintext token ONLY to authorized callers.

2. **Given** a request to retrieve an ODK token, **when** the requesting context is NOT authorized, **then** the system MUST throw an authorization error and log `odk.token.unauthorized_access`. **Authorization rules:**
   - `purpose: 'system'` → Always allowed (internal backend calls)
   - `purpose: 'enketo_launch'` → Allowed if `callerId === userId` (owner only)
   - `purpose: 'health_check'` → Allowed only for SUPER_ADMIN role (no plaintext returned)

3. **Given** a successful token retrieval (NOT health check), **then** the system MUST create an audit log entry with action `user.odk_token_accessed` recording the accessor, purpose, and timestamp.

4. **Given** a token decryption failure (corrupted ciphertext, wrong key, tampered data), **then** the system MUST throw a clear error, log `odk.token.decryption_failed` with details, and NOT expose cryptographic details in the error message.

5. **Given** the MSW mock server from Story 2-6, **when** integration tests run, **then** token management tests MUST verify the full encrypt → store → retrieve → decrypt flow. Note: Token retrieval is a database operation, not an ODK API call—MSW is only needed for the App User provisioning step.

6. **Given** a user with an ODK App User, **when** a SUPER_ADMIN requests a token health check, **then** the system MUST verify the token can be decrypted without exposing the plaintext (validation only, no audit log).

7. **Given** the `ODK_TOKEN_ENCRYPTION_KEY` environment variable, **when** the key is missing or invalid on startup, **then** ODK-related endpoints MUST fail gracefully with `ODK_CONFIG_ERROR` rather than crashing the application.

8. **Given** the odk-integration module isolation (ADR-002), **then** all token management operations MUST be encapsulated within `@oslsr/odk-integration` and exposed via clean service interfaces.

## Tasks / Subtasks

- [x] Task 1: Create ODK Token Management Service (AC: 1, 2, 8)
  - [x] 1.1 Create `services/odk-integration/src/odk-token.service.ts`:
    - `getDecryptedToken(userId: string, callerContext: TokenAccessContext): Promise<string>`
    - `validateTokenHealth(userId: string): Promise<{ valid: boolean; error?: string }>`
    - `TokenAccessContext` type: `{ callerId: string; purpose: 'enketo_launch' | 'health_check' | 'system'; role?: UserRole }`
  - [x] 1.2 Import `decryptToken` and `requireEncryptionKey` from `@oslsr/utils` (NOT local copy)
  - [x] 1.3 Extend `OdkAppUserPersistence` interface from Story 2-3 with `findByUserId(userId)` method
  - [x] 1.4 Implement authorization check per AC2 rules (see Implementation Reference below)
  - [x] 1.5 Add graceful error handling with sanitized messages
  - [x] 1.6 Export from `services/odk-integration/src/index.ts`

- [x] Task 2: Define Error Code Constants (AC: 4, 7)
  - [x] 2.1 Create or extend `packages/types/src/error-codes.ts`:
    - `ODK_TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND'`
    - `ODK_TOKEN_ACCESS_DENIED = 'TOKEN_ACCESS_DENIED'`
    - `ODK_TOKEN_DECRYPTION_ERROR = 'TOKEN_DECRYPTION_ERROR'`
    - `ODK_CONFIG_ERROR = 'ODK_CONFIG_ERROR'`
  - [x] 2.2 Export from `packages/types/src/index.ts`

- [x] Task 3: Implement Audit Logging for Token Access (AC: 3)
  - [x] 3.1 Define audit action constant in `packages/types/src/audit.ts`:
    - `AUDIT_ACTION_USER_ODK_TOKEN_ACCESSED = 'user.odk_token_accessed'`
  - [x] 3.2 Add audit logging in `odk-token.service.ts`:
    - Log on successful token retrieval (NOT on health check)
    - Include: `userId`, `accessorId`, `purpose`, `timestamp`
  - [x] 3.3 Use existing `OdkAppUserAudit` interface pattern from Story 2-3

- [x] Task 4: Add Structured Logging for Security Events (AC: 2, 4)
  - [x] 4.1 Add Pino logger to odk-token.service.ts
  - [x] 4.2 Log Pino events (operational monitoring—distinct from audit logs):
    - `odk.token.accessed` — successful decryption (info)
    - `odk.token.unauthorized_access` — authorization failure (warn)
    - `odk.token.decryption_failed` — crypto error (error)
    - `odk.token.not_found` — missing token (warn)
    - `odk.token.health_check` — validation result (info)

- [x] Task 5: Graceful Startup Validation (AC: 7)
  - [x] 5.1 Create `services/odk-integration/src/odk-config.ts`:
    - `validateOdkConfig(): { valid: boolean; errors: string[] }`
    - `isOdkFullyConfigured(): boolean` (checks URL, credentials, AND encryption key)
  - [x] 5.2 Update existing `isOdkAvailable()` to include encryption key check
  - [x] 5.3 Add startup warning log if ODK config incomplete (don't crash, just disable ODK features)
  - [x] 5.4 ODK token endpoints return 503 with `ODK_CONFIG_ERROR` if key missing

- [x] Task 6: Fix CI Tamper Detection Test (SECURITY BLOCKER) (AC: 4)
  - [x] 6.1 **Root cause:** Current test tampers with auth tag (last 16 bytes), not ciphertext. The hex string manipulation `slice(lastByteIndex)` targets wrong bytes.
  - [x] 6.2 **Fix:** Tamper with byte 0 (actual ciphertext) instead of last byte:
    ```typescript
    const ciphertextBuffer = Buffer.from(encrypted.ciphertext, 'hex');
    ciphertextBuffer[0] ^= 0xff;  // Flip bits in actual ciphertext, not auth tag
    const tamperedCiphertext = ciphertextBuffer.toString('hex');
    ```
  - [x] 6.3 Run test locally with debug output to verify fix before pushing
  - [x] 6.4 Add comment explaining GCM structure: `[ciphertext][16-byte auth tag]`

- [x] Task 7: Add Encryption Key Edge Case Tests (AC: 7)
  - [x] 7.1 Add tests in `packages/utils/src/__tests__/crypto.test.ts`:
    - Empty string: `''`
    - Wrong length (short): `'abc123'` (6 chars)
    - Wrong length (long): `'a'.repeat(128)` (128 chars)
    - Invalid hex chars: `'xyz'.repeat(21) + 'ab'` (64 chars, invalid)
    - Valid but wrong key: Different 64-char hex (decryption fails)

- [x] Task 8: Write Unit Tests for Token Service (AC: 1-4, 6)
  - [x] 8.1 Create `services/odk-integration/src/__tests__/odk-token.service.test.ts`:
    - Test: successful token retrieval with system context
    - Test: successful token retrieval with owner context
    - Test: authorization failure for wrong user (non-owner, non-admin)
    - Test: authorization success for SUPER_ADMIN on any user
    - Test: health check returns valid:true without exposing token
    - Test: health check requires SUPER_ADMIN role
    - Test: decryption failure with tampered ciphertext
    - Test: missing user returns TOKEN_NOT_FOUND
    - Test: audit log created on retrieval (not health check)

- [x] Task 9: Write Integration Tests with MSW Mock (AC: 5)
  - [x] 9.1 Create `services/odk-integration/src/__tests__/odk-token.integration.test.ts`:
    - Test: full flow - provision App User (MSW) → encrypt token → store → retrieve → decrypt
    - Test: multiple users with different tokens (isolation verification)
  - [x] 9.2 Use MSW server from Story 2-6 `setupServer()` for provisioning step only
  - [x] 9.3 Add error injection tests for decryption failure scenarios

## Out of Scope

- **Enketo form launch** — Story 3.1 will implement the actual form launch using retrieved tokens.
- **Token rotation/revocation** — No requirement to rotate or revoke existing tokens in MVP.
- **Key rotation** — Encryption key rotation would require re-encrypting all stored tokens. Deferred to post-MVP.
- **Multi-project support** — Single `ODK_PROJECT_ID` for all App Users per current architecture.

## Dev Notes

### Context from Story 2-3

Story 2-3 implemented the foundation this story builds upon:
- `encryptToken()` and `decryptToken()` in `packages/utils/src/crypto.ts`
- `odk_app_users` table with `encrypted_token` and `token_iv` columns
- `OdkAppUserService.provisionAppUser()` that encrypts and stores tokens
- `requireEncryptionKey()` helper for key validation
- `OdkAppUserPersistence` interface for dependency injection

**This story adds**: retrieval service, authorization, audit logging, health checks.

### Implementation Reference

**Authorization Model:**
```typescript
interface TokenAccessContext {
  callerId: string;
  purpose: 'enketo_launch' | 'health_check' | 'system';
  role?: UserRole;
}

function isAuthorized(userId: string, context: TokenAccessContext): boolean {
  if (context.purpose === 'system') return true;
  if (context.purpose === 'enketo_launch' && context.callerId === userId) return true;
  if (context.purpose === 'health_check' && context.role === UserRole.SUPER_ADMIN) return true;
  return false;
}
```

**Database Query Pattern (Drizzle):**
```typescript
import { decryptToken, requireEncryptionKey } from '@oslsr/utils';

const record = await deps.persistence.findByUserId(userId);
if (!record) throw new AppError('TOKEN_NOT_FOUND', 'No ODK App User found', 404);

const key = requireEncryptionKey(deps.config.encryptionKey);
return decryptToken(record.encryptedToken, record.tokenIv, key);
```

**Dependency Injection Pattern (from Story 2-3):**
```typescript
export const createOdkTokenService = (deps: {
  persistence: OdkAppUserPersistence;
  audit: OdkTokenAudit;
  config: { encryptionKey?: string };
  logger: Logger;
}) => { /* ... */ };
```

### Logging: Pino vs Audit Logs

| Type | Purpose | Storage | Example |
|------|---------|---------|---------|
| **Pino** | Operational monitoring | Log files/stdout | `odk.token.accessed` |
| **Audit** | Compliance/forensics | `audit_logs` table | `user.odk_token_accessed` |

Pino logs are for debugging and monitoring. Audit logs are immutable compliance records.

### Error Responses (AppError)

| Code | Message | HTTP Status |
|------|---------|-------------|
| `TOKEN_NOT_FOUND` | No ODK App User found for this user | 404 |
| `TOKEN_ACCESS_DENIED` | Not authorized to access this token | 403 |
| `TOKEN_DECRYPTION_ERROR` | Unable to decrypt token | 500 |
| `ODK_CONFIG_ERROR` | ODK integration is not fully configured | 503 |

### Common Pitfalls

1. **Don't import from `apps/api` directly** — The odk-integration service receives DB access via dependency injection, not direct imports.

2. **Don't expose crypto details in errors** — Log the full error internally, return sanitized message to caller.

3. **Don't audit health checks** — Health checks are administrative, not data access. Only audit actual token retrieval.

4. **GCM ciphertext structure** — The stored ciphertext is `[encrypted_data][16-byte_auth_tag]`. When tampering in tests, modify byte 0, not the last bytes.

### Project Structure

```
services/odk-integration/src/
├── odk-client.ts           # Existing: ODK API calls
├── odk-app-user.service.ts # Existing: App User provisioning
├── odk-token.service.ts    # NEW: Token retrieval & management
├── odk-config.ts           # NEW: Configuration validation
└── __tests__/
    ├── odk-token.service.test.ts      # NEW: Unit tests
    └── odk-token.integration.test.ts  # NEW: Integration tests
```

### Key References

- Story 2-3: `_bmad-output/implementation-artifacts/2-3-automated-odk-app-user-provisioning.md`
- Crypto utilities: `packages/utils/src/crypto.ts`
- ADR-002: ODK integration abstraction boundary
- ADR-006: Defense-in-depth security

## Enhancement Opportunities

### Test Dashboard Category Tagging (Optional - When Time Permits)

**Status:** Auto-detection implemented in Story 2-3. Optional decorator migration deferred.

**Current Behavior:** Tests are auto-categorized by filename pattern:
- `*.security.test.ts` → Security category
- `*.performance.test.ts` → Performance category
- Default → GoldenPath category

**Future Enhancement Options:**

1. **Full Decorator Migration** - Update tests to use explicit decorators:
   ```typescript
   import { securityTest } from '@oslsr/testing';
   securityTest('should reject tampered tokens', async () => { ... });
   ```
   Benefits: Per-test categorization, SLA enforcement, blocking flags.

2. **Hybrid Approach** - Keep auto-detect, add decorators for edge cases only.

**When to Implement:** Low priority. Consider when:
- Need per-test SLA enforcement
- Have mixed-category test files
- Want finer-grained dashboard filtering

**Reference:** `_bmad-output/TEST_DASHBOARD_DEBT.md`, `project-context.md` section 9a

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All odk-integration tests: 89/89 passing (post-review)
- All utils crypto tests: 22/22 passing

### Completion Notes List

- Created ODK Token Service with `getDecryptedToken()` and `validateTokenHealth()` methods
- Implemented authorization model: system (always), enketo_launch (owner only), health_check (SUPER_ADMIN)
- Added error codes: TOKEN_NOT_FOUND, TOKEN_ACCESS_DENIED, TOKEN_DECRYPTION_ERROR, ODK_CONFIG_ERROR
- Added audit action constant `user.odk_token_accessed` for compliance logging
- Created odk-config.ts with graceful startup validation (don't crash, just disable features)
- Fixed tamper detection test - now targets byte 0 (ciphertext) instead of auth tag
- Added 7 encryption key edge case tests for requireEncryptionKey()
- Added 13 unit tests for token service covering all authorization scenarios
- Added 8 integration tests verifying full encrypt→store→retrieve→decrypt flow

### Code Review Fixes (2026-01-29)

**H1 (AC2 Violation):** Fixed `getDecryptedToken()` to reject `health_check` purpose per AC2 ("no plaintext returned"). Health checks must use `validateTokenHealth()` instead.

**H2 (AppError):** Fixed `requireTokenEncryptionKey()` in odk-config.ts to use `AppError` class instead of plain object.

**M1 (Unused Import):** Removed unused `AUDIT_ACTION_USER_ODK_TOKEN_ACCESSED` import from odk-token.service.ts.

**M2 (Config Validation):** Fixed `validateOdkTokenConfig()` to check individual env vars instead of assuming all missing.

**M3 (Test Comment):** Updated test to correctly expect authorization rejection for health_check purpose.

**Additional:** Added `HealthCheckContext` type and optional context parameter to `validateTokenHealth()` for SUPER_ADMIN verification (AC6).

### Code Review Fixes (2026-01-31)

**M1 (Missing Tests):** Added `odk-config.test.ts` with 13 tests covering `requireTokenEncryptionKey()`, `validateOdkTokenConfig()`, and `isOdkFullyConfigured()`. Covers AC7 503 error responses.

**L1 (Audit Type):** Fixed `OdkTokenAudit.logTokenAccessed()` to use `TokenAccessPurpose` union type instead of `string`.

**L2 (Logger Interface):** Added optional `fatal()` method to `OdkTokenLogger` interface for Pino compatibility.

**L3 (UserId Validation):** Not fixed - validation would add complexity for minimal benefit. Invalid UUIDs return TOKEN_NOT_FOUND which is acceptable behavior.

### File List

**New Files:**
- services/odk-integration/src/odk-token.service.ts
- services/odk-integration/src/odk-config.ts
- services/odk-integration/src/__tests__/odk-token.service.test.ts
- services/odk-integration/src/__tests__/odk-token.integration.test.ts
- services/odk-integration/src/__tests__/odk-config.test.ts (Code Review: AC7 coverage)
- packages/types/src/error-codes.ts

**Modified Files:**
- packages/types/src/audit.ts (added AUDIT_ACTION_USER_ODK_TOKEN_ACCESSED)
- packages/types/src/index.ts (added export for error-codes.ts)
- packages/utils/src/__tests__/crypto.test.ts (fixed tamper test, added edge case tests)
- services/odk-integration/src/index.ts (added token service exports, HealthCheckContext type)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status: review)

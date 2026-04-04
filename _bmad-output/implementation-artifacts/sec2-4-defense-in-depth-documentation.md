# Story sec2.4: Defense-in-Depth & Documentation

Status: ready-for-dev

<!-- Source: infrastructure-security-audit-2026-04-04.md — Findings M-1, M-4, L-1 -->
<!-- Source: sprint-change-proposal-2026-04-04.md — Section 4 -->
<!-- Depends on: SEC2-2 (Redis factory must exist for token revocation implementation) -->

## Story

As a system architect,
I want token revocation on role changes, explicit database pool configuration, tightened dev route guards, and updated architecture documentation,
so that the system has defense-in-depth against privilege escalation and the architecture accurately reflects production security posture.

## Acceptance Criteria

1. **AC1:** When a staff member's role is changed via `staff.controller.ts`, all existing JWT access tokens and refresh tokens for that user are immediately invalidated in Redis. The user must re-authenticate to get tokens reflecting their new role.

2. **AC2:** Database connection pool in `db/index.ts` explicitly configures `max` (20), `idleTimeoutMillis` (30000), `connectionTimeoutMillis` (2000). No implicit defaults.

3. **AC3:** Dev routes guard in `dev.routes.ts` uses positive allowlist (`NODE_ENV === 'development' || NODE_ENV === 'test'`) instead of negative check (`NODE_ENV !== 'production'`). Any other value (undefined, staging, etc.) is blocked.

4. **AC4:** Architecture document (`_bmad-output/planning-artifacts/architecture.md`) updated with:
   - "Layer 0: Infrastructure Perimeter" added to ADR-006 Defense-in-Depth
   - Redis connection factory pattern documented in code patterns section
   - Infrastructure security requirements section (localhost binding, Redis AUTH, Cloud Firewall)

5. **AC5:** All existing tests pass (4,093+) with zero regressions. New tests cover:
   - Token revocation on role change (verify Redis DEL called for user's tokens)
   - Dev route guard blocks unknown NODE_ENV values
   - Database pool configuration values verified

## Tasks / Subtasks

- [ ] **Task 1: Implement token revocation on role change** (AC: #1)
  - [ ] 1.1 In `apps/api/src/controllers/staff.controller.ts`, find the role update handler (the endpoint that changes a user's role)
  - [ ] 1.2 After successful role update, call `TokenService.revokeAllUserTokens(userId)` to invalidate all existing tokens
  - [ ] 1.3 If `revokeAllUserTokens()` doesn't exist, add it to `TokenService`:
    - Scan Redis for keys matching `refresh:${userId}:*`
    - Delete all matching refresh token keys
    - Note: Access tokens (15 min expiry) are stateless JWTs — they can't be individually revoked without the blacklist. The existing blacklist pattern adds the JTI on logout. For role change, we revoke refresh tokens so the user can't get new access tokens with the old role.
  - [ ] 1.4 Add audit log entry for token revocation: `AuditService.log({ action: 'TOKENS_REVOKED_ROLE_CHANGE', targetUserId, performedBy, details: { oldRole, newRole } })`
  - [ ] 1.5 Write tests:
    - Role change triggers refresh token deletion in Redis
    - Audit log records the revocation
    - User's existing refresh token returns 401 after role change

- [ ] **Task 2: Configure database connection pool** (AC: #2)
  - [ ] 2.1 In `apps/api/src/db/index.ts`, update Pool configuration:
    ```typescript
    export const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    ```
  - [ ] 2.2 Add comment explaining the values:
    - `max: 20` — sufficient for 200 staff users + background workers. Postgres default is 100 max connections; 20 per pool leaves headroom.
    - `idleTimeoutMillis: 30000` — release idle connections after 30s to prevent exhaustion
    - `connectionTimeoutMillis: 2000` — fail fast on connection issues rather than hanging
  - [ ] 2.3 Write test: verify pool is configured with explicit values (not defaults)

- [ ] **Task 3: Tighten dev route guard** (AC: #3)
  - [ ] 3.1 In `apps/api/src/routes/dev.routes.ts`, change the guard middleware from:
    ```typescript
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    ```
    to:
    ```typescript
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    ```
  - [ ] 3.2 Write test: dev routes return 404 when NODE_ENV is undefined, 'staging', or 'production'
  - [ ] 3.3 Write test: dev routes are accessible when NODE_ENV is 'development' or 'test'

- [ ] **Task 4: Update architecture documentation** (AC: #4)
  - [ ] 4.1 In `_bmad-output/planning-artifacts/architecture.md`, find ADR-006 (Defense-in-Depth Security Architecture). Add **Layer 0: Infrastructure Perimeter** before the existing Layer 1:
    ```
    Layer 0: Infrastructure Perimeter
    - DigitalOcean Cloud Firewall (network-edge, Docker-bypass-proof)
    - Docker localhost binding (127.0.0.1:PORT:PORT for all non-public services)
    - Redis AUTH (--requirepass) on all Redis instances
    - Strong database credentials (not default user/password)
    ```
  - [ ] 4.2 Add Redis Connection Factory pattern to the code patterns section:
    ```
    Redis Connection Pattern:
    - Singleton via getRedisClient() for rate limiters, services, caching
    - Dedicated connection via createRedisConnection() for BullMQ queues/workers
    - Centralized in apps/api/src/lib/redis.ts
    - NEVER instantiate new Redis() directly outside lib/redis.ts
    ```
  - [ ] 4.3 Add Infrastructure Security Requirements section:
    ```
    Docker Port Binding:
    - All Docker services MUST use 127.0.0.1:HOST_PORT:CONTAINER_PORT
    - Docker bypasses UFW by writing directly to iptables
    - DigitalOcean Cloud Firewall is the true perimeter (hypervisor-level)
    
    Data Store Authentication:
    - Redis MUST require AUTH (--requirepass) in all environments
    - PostgreSQL MUST use strong, unique credentials per environment
    - Connection strings with passwords MUST use REDIS_URL/DATABASE_URL env vars
    ```

- [ ] **Task 5: Update infrastructure playbooks** (AC: #4)
  - [ ] 5.1 If not already done in SEC2-1, verify `docs/infrastructure-cicd-playbook.md` and `docs/portable-playbook.md` have secure Docker patterns
  - [ ] 5.2 Add "Docker-UFW Bypass" pitfall entry to both playbooks if not present

- [ ] **Task 6: Full regression test** (AC: #5)
  - [ ] 6.1 Run `pnpm test` — all 4,093+ tests must pass
  - [ ] 6.2 Run `pnpm build` — TypeScript compilation succeeds

## Dev Notes

### Token Revocation Strategy
JWT access tokens are stateless (15 min expiry). We can't individually revoke them without checking the blacklist on every request (which we already do via `jwt:blacklist:` prefix). The practical approach:
1. Delete all refresh tokens for the user from Redis (`refresh:{userId}:*` keys)
2. The user's current access token remains valid for up to 15 minutes
3. When it expires, the refresh attempt fails (token deleted), forcing re-login
4. The new login issues tokens with the updated role

This is the same pattern used for logout — we blacklist the current access token JTI and delete the refresh token. For role change, we skip blacklisting the access token (it expires in ≤15 min) and just kill all refresh tokens.

### Dev Route Guard Rationale
The current negative check (`!== 'production'`) means any typo in NODE_ENV (e.g., `'Production'`, `'prod'`, empty string) exposes dev routes. A positive allowlist (`=== 'development' || === 'test'`) is safer — only explicitly recognized environments get access.

### Database Pool Sizing
The 2GB VPS has ~1.5GB available for application. Each Postgres connection uses ~5-10MB. 20 connections = 100-200MB worst case. This leaves ample room for Node.js, Redis, and NGINX. If the VPS is upgraded (per monitoring thresholds), pool size can increase.

### Project Structure Notes

- Modified files: `staff.controller.ts`, `token.service.ts` (add revokeAllUserTokens), `db/index.ts`, `dev.routes.ts`, `architecture.md`, playbooks
- No new files created
- Pattern: AppError for errors, AuditService for security events

### References

- [Source: infrastructure-security-audit-2026-04-04.md — Findings M-1, M-4, L-1]
- [Source: sprint-change-proposal-2026-04-04.md — Section 4, SEC2-4]
- [Source: apps/api/src/controllers/staff.controller.ts:25 — role update handler]
- [Source: apps/api/src/db/index.ts:19-21 — current pool config]
- [Source: apps/api/src/routes/dev.routes.ts — current NODE_ENV guard]
- [Source: _bmad-output/planning-artifacts/architecture.md — ADR-006]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List

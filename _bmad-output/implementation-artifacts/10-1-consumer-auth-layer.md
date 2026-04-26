# Story 10.1: Consumer Authentication Layer

Status: ready-for-dev

<!--
Created 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5.

Foundation of Epic 10 (API Governance). Implements scoped API key auth with LGA-scoping + IP allowlist + time-bounded scope grants + 180-day rotation + 7-day overlap.

Sources:
  • PRD V8.3 FR24 + NFR10
  • Architecture Decision 1.5 (api_consumers/api_keys/api_key_scopes schema), Decision 2.4 (apiKeyAuth middleware), Decision 2.8 (ambiguous-auth), Decision 3.4 (partner namespace), Decision 5.4 (audit principal-exclusive)
  • Architecture ADR-019 (full decision rationale)
  • UX Custom Component #16 ApiConsumerScopeEditor + Journey 7 (admin provisioning)
  • Design brief: docs/epic-10-1-consumer-auth-design.md
  • Epics.md §Story 10.1

HARD dependency on Story 9-11 (audit viewer) — PII scope cannot be provisioned without working audit-read surface.
HARD dependency on Story 10-5 (DSA template) — PII scope cannot be assigned without DSA on file.
-->

## Story

As the **Super Admin provisioning a partner-API consumer**,
I want **scoped API keys (LGA-scoped, IP-allowlisted, time-bounded per scope, 180-day rotation with 7-day overlap, SHA-256 hashed at rest, plaintext shown once) protected by an `apiKeyAuth` middleware on `/api/v1/partner/*`**,
so that **third-party MDA partners (ITF-SUPA, NBS, NIMC) can integrate with the registry under formal data-sharing agreement, with revocation/rotation/audit posture suitable for NDPA Article 25 compliance**.

## Acceptance Criteria

1. **AC#1 — Schema migration: 4 new tables + audit_logs extension** (per Architecture Decision 1.5):
   - `api_consumers` — id (UUIDv7), name, organisation_type (enum: federal_mda / state_mda / research_institution / other), contact_email, dsa_document_url (nullable but enforced for `submissions:read_pii` per AC#7), status (active/suspended/terminated), created_at, updated_at
   - `api_keys` — id (UUIDv7), consumer_id (FK CASCADE), name (human label), token_hash (SHA-256 hex, UNIQUE), token_prefix (first 8 chars for admin UI ID), allowed_ip_cidrs (TEXT[] nullable = no restriction), issued_at, rotates_at (NOT NULL, default issued_at + 180d), supersedes_key_id (FK self-ref nullable, for 7-day overlap), revoked_at (nullable), last_used_at (nullable)
   - `api_key_scopes` — api_key_id (FK CASCADE), scope (enum), allowed_lga_ids (UUID[] nullable), granted_at, expires_at (nullable), PK (api_key_id, scope)
   - `audit_logs` extension: nullable `consumer_id UUID` FK + principal-exclusive CHECK constraint per Decision 5.4 (`(actor_id IS NOT NULL AND consumer_id IS NULL) OR (actor_id IS NULL AND consumer_id IS NOT NULL) OR (actor_id IS NULL AND consumer_id IS NULL)`)
   - Drizzle schemas in `apps/api/src/db/schema/api-consumers.ts` + `api-keys.ts` + `api-key-scopes.ts` (no `@oslsr/types` import per project pattern)

2. **AC#2 — Scope enum (5 initial scopes per Decision 3.4):** `aggregated_stats:read` | `marketplace:read_public` | `registry:verify_nin` | `submissions:read_aggregated` | `submissions:read_pii`. Enum stored as TEXT with CHECK constraint; future scopes require migration + PRD amendment.

3. **AC#3 — Token provisioning service:** New service `apps/api/src/services/api-key.service.ts` with method `provisionKey({ consumerId, name, scopes, allowedIpCidrs?, rotationDays = 180 })`:
   - Generate 32-byte random token: `crypto.randomBytes(32).toString('base64url')`
   - SHA-256 hash for storage; first 8 chars as prefix
   - Insert `api_keys` row + per-scope `api_key_scopes` rows in transaction
   - Return `{ id, plaintext, prefix }` to caller — **plaintext is NEVER persisted, NEVER logged**
   - Audit-logged: `action: 'api_key.provisioned'`, `meta: { consumer_id, key_id, key_prefix, rotation_at, scopes }`
   - **Pre-condition for `submissions:read_pii` scope:** raises `MissingDsaError` if `consumer.dsa_document_url IS NULL` (per AC#7 + Architecture Decision 3.4)

4. **AC#4 — `apiKeyAuth` middleware** (per Architecture Decision 2.4):
   - New middleware `apps/api/src/middleware/api-key-auth.ts`
   - Token extraction: `Authorization: Bearer <token>` header only; query-string tokens rejected
   - Lookup: SHA-256 hash submitted token, query `api_keys WHERE token_hash = $hash AND revoked_at IS NULL`
   - Timing-safe comparison: even on miss, perform `crypto.timingSafeEqual` against a constant-length placeholder to normalise response time (per Pattern Category 7 per ADR-019)
   - Revocation check: reject if `revoked_at IS NOT NULL AND revoked_at ≤ now()` → `401 API_KEY_REVOKED`
   - Expiry check: reject if `rotates_at ≤ now()` AND no successor within 7-day overlap → `401 API_KEY_EXPIRED`. During overlap, both old and new keys validate; old-key request audit-logged with `meta.rollover_window = true`
   - IP allowlist: if `allowed_ip_cidrs IS NOT NULL`, reject if `req.ip` (behind trusted proxy headers) does not match any CIDR → `403 IP_NOT_ALLOWED`
   - Request attribution: attach `req.consumer = { id, name, organisation_type }` and `req.apiKey = { id, scopes }` to context
   - Async update of `last_used_at` (non-blocking; debounced to once per minute per key to avoid write amplification)

5. **AC#5 — `requireScope(scope)` per-route helper:**
   - New helper in `apps/api/src/middleware/require-scope.ts`
   - Lookup: `api_key_scopes WHERE api_key_id = $req.apiKey.id AND scope = $requested`
   - Reject if missing → `403 SCOPE_INSUFFICIENT`
   - Reject if `expires_at IS NOT NULL AND expires_at ≤ now()` → `403 SCOPE_EXPIRED`
   - Attach `req.scopeContext = { allowed_lga_ids }` (nullable; null = all LGAs)

6. **AC#6 — Ambiguous-auth rejection** (per Decision 2.8):
   - Pre-middleware on `/api/v1/partner/*` rejects requests carrying both a JWT (cookie or Authorization header) AND an API key with `400 AMBIGUOUS_AUTH`
   - JWT detection: presence of `oslsr_jwt` cookie OR `Authorization: Bearer <jwt-shaped>` (3 base64 segments separated by dots)
   - API key detection: `Authorization: Bearer <token>` where token is base64url 43+ chars (token shape: 32-byte base64url-encoded ≈ 43 chars; JWT is typically much longer + has dots)
   - Distinct disambiguation rule: if Authorization header value contains a `.`, treat as JWT; if not, treat as API key — clean enough for MVP

7. **AC#7 — DSA precondition for PII scope:**
   - Service-layer enforcement (defence in depth alongside UI enforcement in Story 10-3): `provisionKey` raises `MissingDsaError` when `submissions:read_pii` is in requested scopes AND `consumer.dsa_document_url IS NULL`
   - Audit-logged on rejection: `action: 'api_key.pii_scope_rejected_no_dsa'`, `meta: { consumer_id, attempted_by_actor_id }`
   - Story 10-3 Admin UI must enforce this at the form layer (UI gate); this story enforces at service layer (defence in depth)

8. **AC#8 — Hard dependency check on Story 9-11:**
   - Service-layer check: provisioning ANY scope on a NEW consumer (not just PII) requires `audit_log_viewer_available` setting flag = true
   - Setting flag is initially false; flips to true when Story 9-11 is deployed to production (Story 9-11 deploy script sets it)
   - On false: provisioning rejected with `409 AUDIT_VIEWER_PREREQUISITE_NOT_MET` and helpful message ("Story 9-11 Admin Audit Log Viewer must be live before consumer provisioning can begin per ADR-019")
   - This is the architectural prerequisite enforced as a runtime gate

9. **AC#9 — Rotation flow:**
   - New service method `rotateKey(keyId, { emergencyRevoke?: boolean })`:
     - **Standard rotation (default):** create new `api_keys` row with `supersedes_key_id = oldKey.id`; copy scopes from old key; new `rotates_at = now() + 180d`; old key remains valid until 7 days from now (`rotates_at` of old key updated to now + 7d if not already past)
     - **Emergency revoke:** set old key `revoked_at = now()`; create new key without overlap; audit-logged with `meta.reason = 'emergency_rotation'`
   - Endpoint `POST /api/v1/admin/api-keys/:id/rotate` (super-admin only)
   - Returns new plaintext (one-time display per AC#3)

10. **AC#10 — Partner namespace mounting:**
    - New router `apps/api/src/routes/partner/index.ts` registered at `/api/v1/partner` with `apiKeyAuth` middleware applied at the router level
    - Sub-routers per scope-bearing resource (placeholders for now; controllers ship with their respective scope's first consuming story):
      - `/api/v1/partner/stats/aggregated` → `requireScope('aggregated_stats:read')`
      - `/api/v1/partner/marketplace/profiles` → `requireScope('marketplace:read_public')`
      - `/api/v1/partner/registry/verify-nin` → `requireScope('registry:verify_nin')`
      - `/api/v1/partner/submissions/aggregated` → `requireScope('submissions:read_aggregated')`
      - `/api/v1/partner/submissions/pii` → `requireScope('submissions:read_pii')`
    - Each route handler enforces LGA filter from `req.scopeContext.allowed_lga_ids` if non-null
    - LGA enforcement helper: `enforceLgaScope(req, queryBuilder)` — wraps Drizzle query to add `WHERE lga_id = ANY($allowed)` when filter present
    - Lint rule: every partner-route controller must call `enforceLgaScope` (custom ESLint rule or runtime guard test)

11. **AC#11 — Error envelope consistency** (per Pattern Category 4):
    - All errors returned in `{ code, message, details? }` shape
    - Error taxonomy from Decision 2.4 fully implemented:
      - `401 API_KEY_MISSING` / `API_KEY_INVALID` / `API_KEY_REVOKED` / `API_KEY_EXPIRED`
      - `403 IP_NOT_ALLOWED` / `SCOPE_INSUFFICIENT` / `SCOPE_EXPIRED`
      - `400 AMBIGUOUS_AUTH`
      - `409 DSA_REQUIRED` (raised from `MissingDsaError`)
      - `409 AUDIT_VIEWER_PREREQUISITE_NOT_MET` (per AC#8)
      - `429 RATE_LIMITED` (emitted by Story 10-2 middleware downstream of `apiKeyAuth`; placeholder here)

12. **AC#12 — Tests:**
    - Service tests: `provisionKey` happy path + DSA-required + audit-viewer-prerequisite; `rotateKey` standard + emergency
    - Middleware tests: `apiKeyAuth` (each error code path); `requireScope` (each error code path); ambiguous-auth pre-middleware
    - Timing-safe comparison: assert miss-path latency is within 10% of hit-path latency (timing oracle defence)
    - Schema tests: principal-exclusive CHECK rejects mixed-principal writes
    - Integration tests: full request flow against partner namespace with valid token + scope; validate audit log emits `consumer_id` principal correctly per Decision 5.4
    - End-to-end test: provision consumer → provision key → make request → verify audit log entry → rotate key (overlap window) → both keys work → after overlap, only new key works; emergency-revoke old key in middle → old key fails immediately
    - Existing 4,191-test baseline maintained or grown (~25 new tests)

## Dependencies

- **Story 11-1 (HARD)** — `audit_logs.consumer_id` column + principal-exclusive CHECK constraint live in 11-1's migration (per Architecture Decision 1.5). This story extends them but doesn't author them.
- **Story 9-11 (HARD)** — audit viewer must be live (per AC#8 prerequisite gate); architectural enforcement of "no PII scope without working audit-read surface" per ADR-019
- **Story 10-5 (HARD for PII scope)** — DSA template must exist + signed DSA must be on file before any `submissions:read_pii` provisioning
- **Architecture ADR-019 + Decisions 1.5 / 2.4 / 2.8 / 3.4 / 5.4** — design baseline
- **Design brief: docs/epic-10-1-consumer-auth-design.md** — pre-existing detailed design (read in full before implementation)

**Unblocks:**
- Story 10-2 (Per-Consumer Rate Limiting) — depends on `req.consumer` populated by `apiKeyAuth`
- Story 10-3 (Consumer Admin UI) — depends on service layer
- Story 10-4 (Developer Portal) — depends on OpenAPI spec generation from this story's routes
- Story 10-6 (Consumer Audit Dashboard) — depends on `consumer_id` audit-log writes

## Field Readiness Certificate Impact

**Tier B / post-field** — Epic 10 does not block field-survey start. Field survey can run for weeks/months without any Epic 10 partner active. Field-readiness gates only on Story 10-5 (DSA template DRAFTED) being adjacent-ready.

## Tasks / Subtasks

### Task 1 — Schema migration (AC#1, AC#2)

1.1. Create Drizzle schema files for `api_consumers`, `api_keys`, `api_key_scopes`
1.2. Extend `audit_logs.consumer_id` if not already added by Story 11-1 (cross-check)
1.3. Generate Drizzle migration; manually inspect for principal-exclusive CHECK + scope CHECK + UUID defaults
1.4. Test migration up/down on scratch DB

### Task 2 — Token provisioning service (AC#3, AC#7, AC#8, AC#9)

2.1. Create `apps/api/src/services/api-key.service.ts` with `provisionKey` + `rotateKey`
2.2. Implement DSA precondition check (AC#7)
2.3. Implement audit-viewer prerequisite check (AC#8) — read setting flag from new `system_settings` table or env var
2.4. Implement rotation logic with 7-day overlap + emergency revoke
2.5. Tests per AC#12

### Task 3 — `apiKeyAuth` middleware (AC#4)

3.1. Create `apps/api/src/middleware/api-key-auth.ts`
3.2. Token extraction + SHA-256 hash + lookup
3.3. Timing-safe comparison with miss-path normalisation
3.4. Revocation + expiry + IP allowlist checks
3.5. Async last_used_at update
3.6. Tests per AC#12 (including timing-oracle test)

### Task 4 — `requireScope` helper (AC#5)

4.1. Create `apps/api/src/middleware/require-scope.ts`
4.2. Scope lookup + expiry check + LGA context attachment
4.3. Tests per AC#12

### Task 5 — Ambiguous-auth pre-middleware (AC#6)

5.1. Create `apps/api/src/middleware/ambiguous-auth-guard.ts`
5.2. JWT vs API key disambiguation rule
5.3. Tests per AC#12

### Task 6 — Partner namespace mounting (AC#10)

6.1. Create `apps/api/src/routes/partner/index.ts` router
6.2. Sub-routers per scope (placeholder controllers — return `501 NOT_IMPLEMENTED` until first consuming story lands)
6.3. `enforceLgaScope` helper
6.4. ESLint rule OR runtime guard test for LGA scope enforcement

### Task 7 — Error envelope (AC#11)

7.1. Define error classes in `apps/api/src/errors/api-key-errors.ts`
7.2. Centralised error handler maps to HTTP status + envelope shape
7.3. Tests for each error code path

### Task 8 — Tests (AC#12) + sprint-status

8.1. Service + middleware + integration + E2E tests
8.2. Update `sprint-status.yaml`

## Technical Notes

### Why timing-safe comparison even on miss

Per Pattern Category 7 + Architecture Decision 2.4: even when the token hash isn't found in `api_keys`, we still perform a `crypto.timingSafeEqual` against a placeholder. Reason: a naive implementation returns 401 fast on hash miss (no further work) and 401 slower on hash hit + scope fail (more work). A timing attacker could exploit the differential to discover valid token hashes. Normalising the miss-path latency closes this oracle.

Implementation: compare submitted hash against a known-bad placeholder of the same length (`'0'.repeat(64)` for SHA-256 hex). The comparison itself is constant-time per `timingSafeEqual` semantics. The added cost is ~20µs per request — negligible.

### Why `last_used_at` is debounced async update

Updating `api_keys.last_used_at` on every request would create write amplification on the hot path (every partner request triggers a write). Debouncing to once-per-minute per key (in-memory map + flush on interval) reduces writes 60-3600x without losing significant precision (last_used_at granularity at the minute level is sufficient for observability).

### Why explicit scope enum (not free-form string)

Free-form strings invite typos + drift (`submission:read_pii` vs `submissions:read_pii` would both be accepted). The CHECK constraint forces a closed set. Adding a new scope requires:
1. PRD amendment (new FR or extension of FR24)
2. Architecture ADR amendment (Decision 3.4 scope catalogue)
3. Migration to extend the CHECK
4. New audit-loggable scope value

This deliberately raises the bar for adding scopes — preventing scope sprawl that would dilute the security model.

### Why `req.consumer` not `req.user` for partner requests

Per Architecture Decision 5.4 (audit-log principal dualism): `req.user` is reserved for human-actor JWT-authenticated requests; `req.consumer` is the parallel for machine consumers. Mixing the two would break the principal-exclusive audit log model + cause confusion for downstream code that branches on principal type.

### LGA scope enforcement is per-controller (not middleware)

Why not a middleware that adds the WHERE clause automatically? Because each controller's query shape differs — some join multiple tables, some use raw SQL for performance. A middleware can attach `req.scopeContext.allowed_lga_ids` but cannot universally inject it into every query.

The `enforceLgaScope(req, queryBuilder)` helper is called explicitly by each controller. Lint rule (or runtime guard test that walks all partner routes) ensures no controller skips it. Defence in depth: Story 10-2 additionally audit-logs every partner query with `meta.applied_lga_filter` so dropped enforcement is forensically detectable post-facto.

### 7-day overlap window — why 7 days not longer/shorter

7 days balances:
- **Long enough**: partner has time to rotate key in their CI/CD (typical change-management cycle is weekly)
- **Short enough**: exposure window for compromised superseded key is bounded
- **Industry alignment**: Stripe API key rotation default is 7 days overlap

Shorter would risk partner-deploy lag causing service outages; longer would dilute the security benefit of rotation.

### Emergency revoke is logged differently from standard rotation

`emergencyRotation` audit event: `meta.reason = 'emergency_rotation'`. Standard rotation: `meta.reason = 'scheduled_rotation'`. This semantic difference lets Story 10-6 dashboard surface emergency rotations as anomalies (high-priority alert) vs scheduled rotations as routine.

### Why `system_settings.audit_log_viewer_available` flag instead of just checking 9-11 deploy

Could check: "if Story 9-11 routes exist, allow provisioning." But that creates a runtime coupling between Epic 10 and Epic 9 (Epic 10 code reads Epic 9 routes). Cleaner: a settings flag in `system_settings` table that Story 9-11 deploy script flips. Loose coupling; explicit dependency surface.

## Risks

1. **Timing-oracle attack via miss-path normalisation imperfection.** If our placeholder constant-time-compare differs in cost from the real-key compare, oracle remains. Mitigation: timing-attack test in AC#12 explicitly measures miss vs hit latency; failure surfaces in CI.
2. **DSA precondition check race condition.** Two concurrent provisionings could both pass the DSA check then both succeed in inserting `submissions:read_pii` scopes. Mitigation: provisioning is single-Super-Admin operation in practice (UI-gated); race window is microseconds; not worth optimistic-locking complexity.
3. **`audit_log_viewer_available` flag mismanagement.** If 9-11 deploy fails to flip the flag, Epic 10 provisioning is blocked indefinitely. Mitigation: 9-11 deploy includes flag-flip in idempotent smoke-test step; documented in runbook.
4. **Partner stuck in 7-day overlap if their deploy fails.** Old key auto-expires at end of 7-day overlap; if partner hasn't rotated, their integration breaks. Mitigation: alert at T-2 days before overlap expiry (Story 10-6 dashboard); manual extension procedure (Super Admin extends old key's `rotates_at` by another 7 days, audit-logged).
5. **LGA scope enforcement skipped in a partner-route controller.** A future controller author forgets to call `enforceLgaScope`. Mitigation: ESLint rule + runtime test that walks all partner routes + Story 10-2 audit-log includes `meta.applied_lga_filter` for forensic detection.
6. **Token plaintext leaked in error logs.** A future error path accidentally logs the submitted token. Mitigation: error logger middleware sanitises `Authorization` header out of all log records; runtime test asserts no `Bearer ` substring appears in logged error context.

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Created:**
- `apps/api/src/db/schema/api-consumers.ts`
- `apps/api/src/db/schema/api-keys.ts`
- `apps/api/src/db/schema/api-key-scopes.ts`
- `apps/api/src/services/api-key.service.ts`
- `apps/api/src/middleware/api-key-auth.ts`
- `apps/api/src/middleware/require-scope.ts`
- `apps/api/src/middleware/ambiguous-auth-guard.ts`
- `apps/api/src/middleware/enforce-lga-scope.ts`
- `apps/api/src/routes/partner/index.ts`
- `apps/api/src/routes/partner/stats.routes.ts` (placeholder)
- `apps/api/src/routes/partner/marketplace.routes.ts` (placeholder)
- `apps/api/src/routes/partner/registry.routes.ts` (placeholder)
- `apps/api/src/routes/partner/submissions.routes.ts` (placeholder)
- `apps/api/src/errors/api-key-errors.ts`
- Drizzle migration files
- Tests for all of the above

**Modified:**
- `apps/api/src/db/schema/audit-logs.ts` — extend with `consumer_id` if not added by Story 11-1
- `apps/api/src/db/schema/index.ts` — re-exports
- `apps/api/src/routes/index.ts` — mount partner router
- `apps/api/src/middleware/error-handler.ts` — sanitise Authorization header
- `apps/api/src/lib/system-settings.ts` — add `audit_log_viewer_available` flag
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story created by Bob (SM) per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 12 ACs covering 4-table schema + scope enum + token provisioning service + apiKeyAuth middleware + requireScope helper + ambiguous-auth guard + DSA precondition + audit-viewer prerequisite + rotation flow with 7-day overlap + partner namespace mounting + error envelope + tests. HARD dependencies: Story 9-11 (audit viewer) + Story 10-5 (DSA template). | Foundation of Epic 10. Without this story, no partner-API exists. |

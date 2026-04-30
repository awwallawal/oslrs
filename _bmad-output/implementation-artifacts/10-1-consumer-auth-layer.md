# Story 10.1: Consumer Authentication Layer

Status: ready-for-dev

<!--
Created 2026-04-25 by impostor-SM agent per SCP-2026-04-22 §A.5.

Foundation of Epic 10 (API Governance). Implements scoped API key auth with LGA-scoping + IP allowlist + time-bounded scope grants + 180-day rotation + 7-day overlap.

Sources:
  • PRD V8.3 FR24 + NFR10
  • Architecture Decision 1.5 (api_consumers/api_keys/api_key_scopes schema), Decision 2.4 (apiKeyAuth middleware), Decision 2.8 (ambiguous-auth), Decision 3.4 (partner namespace), Decision 5.4 (audit principal-exclusive)
  • Architecture ADR-019 (full decision rationale)
  • UX Custom Component #16 ApiConsumerScopeEditor + Journey 7 (admin provisioning)
  • Design brief: docs/epic-10-1-consumer-auth-design.md
  • Epics.md §Story 10.1

HARD dependencies:
  • Story 9-11 (audit viewer) — PII scope cannot be provisioned without working audit-read surface
  • Story 10-5 (DSA template) — PII scope cannot be assigned without DSA on file
  • Story 11-1 (audit_logs.consumer_id column + principal-exclusive CHECK)
  • prep-settings-landing-and-feature-flags (system_settings table + lib/settings.ts for `audit_log_viewer_available` flag per AC#8)

Validation pass 2026-04-30 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template; AC#8 audit-viewer prerequisite flag relocated from one-off `system_settings` reference to canonical `getSetting<boolean>('audit_log_viewer_available')` accessor from `apps/api/src/lib/settings.ts` (created by `prep-settings-landing-and-feature-flags` Wave 1 prep — same generic key-value pattern as `auth.sms_otp_enabled`); File List `apps/api/src/lib/system-settings.ts` typo corrected to `apps/api/src/lib/settings.ts`; audit_logs.consumer_id column ownership clarified ("inherits from Story 11-1" rather than "extends in this story"); 4th HARD dependency added (prep-settings-landing).
-->

## Story

As the **Super Admin provisioning a partner-API consumer**,
I want **scoped API keys (LGA-scoped, IP-allowlisted, time-bounded per scope, 180-day rotation with 7-day overlap, SHA-256 hashed at rest, plaintext shown once) protected by an `apiKeyAuth` middleware on `/api/v1/partner/*`**,
so that **third-party MDA partners (ITF-SUPA, NBS, NIMC) can integrate with the registry under formal data-sharing agreement, with revocation/rotation/audit posture suitable for NDPA Article 25 compliance**.

## Acceptance Criteria

1. **AC#1 — Schema migration: 3 new tables** (per Architecture Decision 1.5):
   - `api_consumers` — id (UUIDv7), name, organisation_type (enum: federal_mda / state_mda / research_institution / other), contact_email, dsa_document_url (nullable but enforced for `submissions:read_pii` per AC#7), status (active/suspended/terminated), created_at, updated_at
   - `api_keys` — id (UUIDv7), consumer_id (FK CASCADE), name (human label), token_hash (SHA-256 hex, UNIQUE), token_prefix (first 8 chars for admin UI ID), allowed_ip_cidrs (TEXT[] nullable = no restriction), issued_at, rotates_at (NOT NULL, default issued_at + 180d), supersedes_key_id (FK self-ref nullable, for 7-day overlap), revoked_at (nullable), last_used_at (nullable)
   - `api_key_scopes` — api_key_id (FK CASCADE), scope (enum), allowed_lga_ids (UUID[] nullable), granted_at, expires_at (nullable), PK (api_key_id, scope)
   - **`audit_logs.consumer_id` column inherits from Story 11-1** (per Architecture Decision 1.5 — column + principal-exclusive CHECK constraint live in 11-1's migration; this story does NOT re-add). Verify column exists at impl time via `\d audit_logs` post-11-1 deploy; if missing, escalate as 11-1 implementation gap.
   - Drizzle schemas in `apps/api/src/db/schema/api-consumers.ts` + `api-keys.ts` + `api-key-scopes.ts` (no `@oslsr/types` import per drizzle-kit constraint at MEMORY.md "Key Patterns")

2. **AC#2 — Scope enum (5 initial scopes per Decision 3.4):** `aggregated_stats:read` | `marketplace:read_public` | `registry:verify_nin` | `submissions:read_aggregated` | `submissions:read_pii`. Enum stored as TEXT with CHECK constraint; future scopes require migration + PRD amendment.

3. **AC#3 — Token provisioning service:** New service `apps/api/src/services/api-key.service.ts` with method `provisionKey({ consumerId, name, scopes, allowedIpCidrs?, rotationDays = 180 })`:
   - Generate 32-byte random token: `crypto.randomBytes(32).toString('base64url')`
   - SHA-256 hash for storage; first 8 chars as prefix
   - Insert `api_keys` row + per-scope `api_key_scopes` rows in transaction (`db.transaction`)
   - Return `{ id, plaintext, prefix }` to caller — **plaintext is NEVER persisted, NEVER logged**
   - Audit-logged via `AuditService.logActionTx(tx, { action: 'api_key.provisioned', meta: { consumer_id, key_id, key_prefix, rotation_at, scopes } })` (`apps/api/src/services/audit.service.ts:267`); add `API_KEY_PROVISIONED: 'api_key.provisioned'` to `AUDIT_ACTIONS` const at `audit.service.ts:35-64`
   - **Pre-condition for `submissions:read_pii` scope:** raises `MissingDsaError` if `consumer.dsa_document_url IS NULL` (per AC#7 + Architecture Decision 3.4)

4. **AC#4 — `apiKeyAuth` middleware** (per Architecture Decision 2.4):
   - New middleware `apps/api/src/middleware/api-key-auth.ts`
   - Token extraction: `Authorization: Bearer <token>` header only; query-string tokens rejected
   - Lookup: SHA-256 hash submitted token, query `api_keys WHERE token_hash = $hash AND revoked_at IS NULL`
   - Timing-safe comparison: even on miss, perform `crypto.timingSafeEqual` against a constant-length placeholder to normalise response time (per Pattern Category 7 per ADR-019)
   - Revocation check: reject if `revoked_at IS NOT NULL AND revoked_at ≤ now()` → `401 API_KEY_REVOKED`
   - Expiry check: reject if `rotates_at ≤ now()` AND no successor within 7-day overlap → `401 API_KEY_EXPIRED`. During overlap, both old and new keys validate; old-key request audit-logged with `meta.rollover_window = true`
   - IP allowlist: if `allowed_ip_cidrs IS NOT NULL`, reject if `req.ip` (resolved via existing `realIpMiddleware` at `apps/api/src/middleware/real-ip.ts:28-40` which handles CF-Connecting-IP) does not match any CIDR → `403 IP_NOT_ALLOWED`
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
   - Audit-logged on rejection via `AuditService.logAction({ action: 'api_key.pii_scope_rejected_no_dsa', meta: { consumer_id, attempted_by_actor_id } })`; add `API_KEY_PII_SCOPE_REJECTED_NO_DSA: 'api_key.pii_scope_rejected_no_dsa'` to `AUDIT_ACTIONS` const
   - Story 10-3 Admin UI must enforce this at the form layer (UI gate); this story enforces at service layer (defence in depth)

8. **AC#8 — Hard dependency check on Story 9-11 (audit viewer):**
   - Service-layer check: provisioning ANY scope on a NEW consumer (not just PII) requires `audit_log_viewer_available` setting flag = `true`
   - Setting lives in the `system_settings` table (created by `prep-settings-landing-and-feature-flags` Wave 1 prep — same generic key-value pattern as `auth.sms_otp_enabled`). Read via `getSetting<boolean>('audit_log_viewer_available')` from `apps/api/src/lib/settings.ts` (created by that prep story; this story is a CONSUMER of the lib, NOT the author)
   - Setting flag is initially `false` (seeded by prep-settings-landing migration alongside `auth.sms_otp_enabled`); flips to `true` when Story 9-11 is deployed to production (Story 9-11 deploy script flips it via the Settings Landing UI OR via direct DB UPDATE in deploy script)
   - On false: provisioning rejected with `409 AUDIT_VIEWER_PREREQUISITE_NOT_MET` and helpful message ("Story 9-11 Admin Audit Log Viewer must be live before consumer provisioning can begin per ADR-019")
   - This is the architectural prerequisite enforced as a runtime gate

9. **AC#9 — Rotation flow:**
   - New service method `rotateKey(keyId, { emergencyRevoke?: boolean })`:
     - **Standard rotation (default):** create new `api_keys` row with `supersedes_key_id = oldKey.id`; copy scopes from old key; new `rotates_at = now() + 180d`; old key remains valid until 7 days from now (`rotates_at` of old key updated to now + 7d if not already past)
     - **Emergency revoke:** set old key `revoked_at = now()`; create new key without overlap; audit-logged with `meta.reason = 'emergency_rotation'`
   - Endpoint `POST /api/v1/admin/api-keys/:id/rotate` (super-admin only — gate via existing `authenticate` + `authorize(UserRole.SUPER_ADMIN)` clone from `apps/api/src/routes/admin.routes.ts:24-27`)
   - Returns new plaintext (one-time display per AC#3)
   - Audit-logged: `action: 'api_key.rotated'`, `meta: { reason: 'scheduled_rotation' | 'emergency_rotation', old_key_id, new_key_id }`; add `API_KEY_ROTATED: 'api_key.rotated'` to `AUDIT_ACTIONS` const

10. **AC#10 — Partner namespace mounting:**
    - New router `apps/api/src/routes/partner/index.ts` registered at `/api/v1/partner` with `apiKeyAuth` middleware applied at the router level. **NEW subdirectory pattern under `routes/`** — first instance in the codebase (existing routes are flat files: `audit.routes.ts`, `staff.routes.ts`, `respondent.routes.ts`, etc.). Justification: 5 sub-routers per scope-bearing resource make a flat naming convention `partner-stats.routes.ts`, `partner-marketplace.routes.ts`, etc. unwieldy; subdirectory matches the URL prefix structure
    - Sub-routers per scope-bearing resource (placeholders for now; controllers ship with their respective scope's first consuming story):
      - `apps/api/src/routes/partner/stats.routes.ts` → `/api/v1/partner/stats/aggregated` → `requireScope('aggregated_stats:read')`
      - `apps/api/src/routes/partner/marketplace.routes.ts` → `/api/v1/partner/marketplace/profiles` → `requireScope('marketplace:read_public')`
      - `apps/api/src/routes/partner/registry.routes.ts` → `/api/v1/partner/registry/verify-nin` → `requireScope('registry:verify_nin')`
      - `apps/api/src/routes/partner/submissions.routes.ts` → `/api/v1/partner/submissions/aggregated` → `requireScope('submissions:read_aggregated')` AND `/api/v1/partner/submissions/pii` → `requireScope('submissions:read_pii')`
    - Each route handler enforces LGA filter from `req.scopeContext.allowed_lga_ids` if non-null
    - LGA enforcement helper: `enforceLgaScope(req, queryBuilder)` — wraps Drizzle query to add `WHERE lga_id = ANY($allowed)` when filter present
    - Lint rule (or runtime guard test): every partner-route controller must call `enforceLgaScope`

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
    - Schema tests: principal-exclusive CHECK rejects mixed-principal writes (cross-cuts with Story 11-1 schema; verify here as defence in depth)
    - Integration tests: full request flow against partner namespace with valid token + scope; validate audit log emits `consumer_id` principal correctly per Decision 5.4
    - End-to-end test: provision consumer → provision key → make request → verify audit log entry → rotate key (overlap window) → both keys work → after overlap, only new key works; emergency-revoke old key in middle → old key fails immediately
    - Existing 4,191-test baseline maintained or grown (~25 new tests)

## Tasks / Subtasks

- [ ] **Task 1 — Schema migration** (AC: #1, #2)
  - [ ] 1.1 Create Drizzle schema files for `api_consumers`, `api_keys`, `api_key_scopes` at `apps/api/src/db/schema/api-consumers.ts`, `api-keys.ts`, `api-key-scopes.ts` (no `@oslsr/types` import per drizzle-kit constraint)
  - [ ] 1.2 Verify `audit_logs.consumer_id` column + principal-exclusive CHECK constraint exist (inherited from Story 11-1 migration); if missing, escalate as 11-1 implementation gap (do NOT re-add here — single source of truth)
  - [ ] 1.3 Append exports to schema barrel `apps/api/src/db/schema/index.ts:1-17` (currently re-exports 17 tables; this story adds 3 → 20 total)
  - [ ] 1.4 Generate Drizzle migration; manually inspect for principal-exclusive CHECK + scope CHECK + UUID defaults
  - [ ] 1.5 Migration file location: `apps/api/drizzle/<NNNN>_<descriptive_name>.sql` — sequential 4-digit prefix; confirm next number at impl time via `ls apps/api/drizzle/`. Multiple in-flight stories may collide; coordinate at impl time. **Path `apps/api/src/db/migrations/` does NOT exist.**
  - [ ] 1.6 Test migration up/down on scratch DB

- [ ] **Task 2 — Token provisioning service** (AC: #3, #7, #8, #9)
  - [ ] 2.1 Create `apps/api/src/services/api-key.service.ts` with `provisionKey` + `rotateKey` methods
  - [ ] 2.2 Implement DSA precondition check (AC#7) — raise `MissingDsaError` when consumer lacks `dsa_document_url` and PII scope is requested
  - [ ] 2.3 Implement audit-viewer prerequisite check (AC#8) — read flag via `getSetting<boolean>('audit_log_viewer_available')` from `apps/api/src/lib/settings.ts` (created by `prep-settings-landing-and-feature-flags` HARD dependency). Do NOT create alternative settings mechanism in this story.
  - [ ] 2.4 Implement rotation logic with 7-day overlap + emergency revoke
  - [ ] 2.5 Add new audit actions to `AUDIT_ACTIONS` const at `apps/api/src/services/audit.service.ts:35-64`: `API_KEY_PROVISIONED: 'api_key.provisioned'`, `API_KEY_PII_SCOPE_REJECTED_NO_DSA: 'api_key.pii_scope_rejected_no_dsa'`, `API_KEY_ROTATED: 'api_key.rotated'`, `API_KEY_REVOKED: 'api_key.revoked'`
  - [ ] 2.6 Tests per AC#12

- [ ] **Task 3 — `apiKeyAuth` middleware** (AC: #4)
  - [ ] 3.1 Create `apps/api/src/middleware/api-key-auth.ts`
  - [ ] 3.2 Token extraction + SHA-256 hash + lookup
  - [ ] 3.3 Timing-safe comparison with miss-path normalisation (constant-length placeholder via `crypto.timingSafeEqual`)
  - [ ] 3.4 Revocation + expiry + IP allowlist checks. IP resolution: read `req.ip` post-`realIpMiddleware` (`apps/api/src/middleware/real-ip.ts:28-40` already resolves CF-Connecting-IP per Phase 3 plumbing). Do NOT re-derive client IP from headers.
  - [ ] 3.5 Async last_used_at update (debounced once-per-minute per key via in-memory map + flush on interval)
  - [ ] 3.6 Tests per AC#12 (including timing-oracle test that asserts miss vs hit latency within 10%)

- [ ] **Task 4 — `requireScope` helper** (AC: #5)
  - [ ] 4.1 Create `apps/api/src/middleware/require-scope.ts`
  - [ ] 4.2 Scope lookup + expiry check + LGA context attachment
  - [ ] 4.3 Tests per AC#12

- [ ] **Task 5 — Ambiguous-auth pre-middleware** (AC: #6)
  - [ ] 5.1 Create `apps/api/src/middleware/ambiguous-auth-guard.ts`
  - [ ] 5.2 JWT vs API key disambiguation rule (presence of `.` in Authorization Bearer value)
  - [ ] 5.3 Tests per AC#12

- [ ] **Task 6 — Partner namespace mounting** (AC: #10)
  - [ ] 6.1 Create `apps/api/src/routes/partner/` directory + `index.ts` router (NEW subdirectory pattern under `routes/`; first instance in codebase — justified by 5 sub-routers per scope; existing convention is flat-file but flat naming `partner-stats.routes.ts` etc. would be unwieldy)
  - [ ] 6.2 Sub-routers per scope (placeholder controllers — return `501 NOT_IMPLEMENTED` until first consuming story lands): `stats.routes.ts`, `marketplace.routes.ts`, `registry.routes.ts`, `submissions.routes.ts`
  - [ ] 6.3 `enforceLgaScope` helper at `apps/api/src/middleware/enforce-lga-scope.ts`
  - [ ] 6.4 ESLint rule OR runtime guard test for LGA scope enforcement (decide at impl time based on ESLint plugin authoring complexity)

- [ ] **Task 7 — Error envelope** (AC: #11)
  - [ ] 7.1 Define error classes in `apps/api/src/errors/api-key-errors.ts` (NEW directory `apps/api/src/errors/`; first error-classes file in dedicated location — verify if existing pattern exists at impl time)
  - [ ] 7.2 Centralised error handler maps to HTTP status + envelope shape; sanitises Authorization header from logged error context (Risk #6 mitigation)
  - [ ] 7.3 Tests for each error code path

- [ ] **Task 8 — Tests + sprint-status** (AC: #12)
  - [ ] 8.1 Service + middleware + integration + E2E tests
  - [ ] 8.2 Run `pnpm test` from root — verify baseline 4,191 + ~25 new tests
  - [ ] 8.3 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `10-1-consumer-auth-layer: in-progress` → `review` → `done`

- [ ] **Task 9 — Code review** (cross-cutting AC: all)
  - [ ] 9.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree (per the existing "code review before commit" project pattern in MEMORY.md `feedback_review_before_commit.md`)
  - [ ] 9.2 Auto-fix all High/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI)
  - [ ] 9.3 Only after code review passes, commit and mark status `review`

## Dev Notes

### Dependencies

- **Story 11-1 (HARD)** — `audit_logs.consumer_id` column + principal-exclusive CHECK constraint live in 11-1's migration (per Architecture Decision 1.5). This story INHERITS them; does NOT re-add. Verify at impl time via `\d audit_logs`; if missing, escalate as 11-1 gap.
- **Story 9-11 (HARD)** — audit viewer must be live (per AC#8 prerequisite gate); architectural enforcement of "no PII scope without working audit-read surface" per ADR-019. Runtime check via `audit_log_viewer_available` setting flag.
- **Story 10-5 (HARD for PII scope)** — DSA template must exist + signed DSA must be on file before any `submissions:read_pii` provisioning. Service-layer enforcement via `MissingDsaError` per AC#7; UI enforcement via Story 10-3.
- **`prep-settings-landing-and-feature-flags` (HARD per AC#8)** — provides `system_settings` table + `apps/api/src/lib/settings.ts` typed accessor (`getSetting<T>(key)`). This story is a CONSUMER of the settings infrastructure for the `audit_log_viewer_available` flag. Cannot ship before prep-settings-landing lands.
- **Architecture ADR-019 + Decisions 1.5 / 2.4 / 2.8 / 3.4 / 5.4** — design baseline
- **Design brief: `docs/epic-10-1-consumer-auth-design.md`** — pre-existing detailed design (read in full before implementation; verify file exists at impl time)

**Unblocks:**
- Story 10-2 (Per-Consumer Rate Limiting) — depends on `req.consumer` populated by `apiKeyAuth`
- Story 10-3 (Consumer Admin UI) — depends on service layer
- Story 10-4 (Developer Portal) — depends on OpenAPI spec generation from this story's routes
- Story 10-6 (Consumer Audit Dashboard) — depends on `consumer_id` audit-log writes

### Field Readiness Certificate Impact

**Tier B / post-field** — Epic 10 does not block field-survey start. Field survey can run for weeks/months without any Epic 10 partner active. Field-readiness gates only on Story 10-5 (DSA template DRAFTED) being adjacent-ready.

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

### Why `audit_log_viewer_available` flag uses prep-settings-landing infrastructure

Could check: "if Story 9-11 routes exist, allow provisioning." But that creates a runtime coupling between Epic 10 and Epic 9 (Epic 10 code reads Epic 9 routes). Cleaner: a settings flag in `system_settings` table that Story 9-11 deploy script flips. Loose coupling; explicit dependency surface.

The settings infrastructure (`system_settings` table + `apps/api/src/lib/settings.ts` typed accessor) is provided by `prep-settings-landing-and-feature-flags` Wave 1 prep — generic key-value pattern shared with `auth.sms_otp_enabled` (Story 9-12). This story is a consumer:
```typescript
const auditViewerLive = await getSetting<boolean>('audit_log_viewer_available');
if (!auditViewerLive) throw new AppError('AUDIT_VIEWER_PREREQUISITE_NOT_MET', ..., 409);
```

The flag is seeded by prep-settings-landing migration as `false` (alongside `auth.sms_otp_enabled: false`); flips to `true` when Story 9-11 deploys (deploy script either uses Settings Landing UI or direct DB UPDATE — both acceptable; document in 9-11 deploy runbook).

### Routes subdirectory pattern — first instance

Story v1 specified `apps/api/src/routes/partner/index.ts` + sub-routers. This is the FIRST routes-subdirectory pattern in the codebase (existing routes are flat files). Justification: 5 scope-bearing sub-routers (`stats`, `marketplace`, `registry`, `submissions:aggregated`, `submissions:pii`) make a flat naming convention `partner-stats.routes.ts`, `partner-marketplace.routes.ts`, etc. unwieldy; subdirectory matches the URL prefix structure `/api/v1/partner/X`.

This deliberate exception to the flat-file convention is documented here so future stories (e.g. Wave 2 retrofit of 11-2 keeping `imports.routes.ts` flat) understand the rationale: subdirectory is acceptable when 4+ sub-routers share a URL prefix.

### Risks

1. **Timing-oracle attack via miss-path normalisation imperfection.** If our placeholder constant-time-compare differs in cost from the real-key compare, oracle remains. Mitigation: timing-attack test in AC#12 explicitly measures miss vs hit latency; failure surfaces in CI.
2. **DSA precondition check race condition.** Two concurrent provisionings could both pass the DSA check then both succeed in inserting `submissions:read_pii` scopes. Mitigation: provisioning is single-Super-Admin operation in practice (UI-gated); race window is microseconds; not worth optimistic-locking complexity.
3. **`audit_log_viewer_available` flag mismanagement.** If 9-11 deploy fails to flip the flag, Epic 10 provisioning is blocked indefinitely. Mitigation: 9-11 deploy includes flag-flip in idempotent smoke-test step; documented in runbook; flag can also be flipped manually via Settings Landing UI by super-admin if deploy script misses it.
4. **Partner stuck in 7-day overlap if their deploy fails.** Old key auto-expires at end of 7-day overlap; if partner hasn't rotated, their integration breaks. Mitigation: alert at T-2 days before overlap expiry (Story 10-6 dashboard); manual extension procedure (Super Admin extends old key's `rotates_at` by another 7 days, audit-logged).
5. **LGA scope enforcement skipped in a partner-route controller.** A future controller author forgets to call `enforceLgaScope`. Mitigation: ESLint rule + runtime test that walks all partner routes + Story 10-2 audit-log includes `meta.applied_lga_filter` for forensic detection.
6. **Token plaintext leaked in error logs.** A future error path accidentally logs the submitted token. Mitigation: error logger middleware sanitises `Authorization` header out of all log records; runtime test asserts no `Bearer ` substring appears in logged error context.
7. **Story 11-1 audit_logs.consumer_id missing at impl time.** If 11-1 migration didn't actually add the column, this story breaks at runtime. Mitigation: Task 1.2 verification check before proceeding; explicit escalation to 11-1 if missing.
8. **prep-settings-landing not yet shipped.** AC#8 setting flag access fails if `lib/settings.ts` doesn't exist. Mitigation: HARD dependency declared; sequencing in dev workflow must respect Wave 1 (prep-settings-landing) → Wave 3 (this story).

### Project Structure Notes

- **Service layer** at `apps/api/src/services/api-key.service.ts` — follows existing service-layer pattern (peer of `audit.service.ts`, `staff.service.ts`, `submission-processing.service.ts`, etc.).
- **Middleware** at `apps/api/src/middleware/<name>.ts` — 4 new middleware files (`api-key-auth.ts`, `require-scope.ts`, `ambiguous-auth-guard.ts`, `enforce-lga-scope.ts`). Each is single-purpose; mirrors existing pattern (`login-rate-limit.ts`, `real-ip.ts`, `sensitive-action.ts`, `auth.ts`, `captcha.ts`).
- **Routes subdirectory** at `apps/api/src/routes/partner/` — FIRST subdirectory pattern under `routes/`. Justified by 5 scope-bearing sub-routers; deliberate exception to flat-file convention. Future stories should default to flat unless they have similar 4+ sub-router justification.
- **Schema barrel** at `apps/api/src/db/schema/index.ts:1-17` — extend with 3 new exports (`api-consumers`, `api-keys`, `api-key-scopes`).
- **Drizzle constraint:** schema files MUST NOT import from `@oslsr/types` (drizzle-kit runs compiled JS; `@oslsr/types` has no `dist/`). Per MEMORY.md key pattern.
- **Drizzle migrations** at `apps/api/drizzle/<NNNN>_<name>.sql` — sequential 4-digit prefix. Multiple in-flight stories may collide; coordinate at impl time. **Path `apps/api/src/db/migrations/` does NOT exist.**
- **audit_logs.consumer_id column** is INHERITED from Story 11-1 migration; do NOT re-add. Verify presence at impl time.
- **Settings access** via `getSetting<T>(key)` from `apps/api/src/lib/settings.ts` (created by `prep-settings-landing-and-feature-flags` HARD dependency). Generic key-value pattern; new keys land via `system_settings` INSERT, NOT new lib functions.
- **Audit logging** via `AuditService.logActionTx()` (`apps/api/src/services/audit.service.ts:267`) for transactional emission within provisioning/rotation transactions; `AuditService.logAction()` (line 226) for non-transactional. New audit actions added to `AUDIT_ACTIONS` const at `audit.service.ts:35-64` per Task 2.5.
- **Real IP resolution** via existing `realIpMiddleware` at `apps/api/src/middleware/real-ip.ts:28-40` (handles CF-Connecting-IP for Cloudflare-proxied traffic). Read `req.ip` post-middleware; do NOT re-derive from headers.
- **Errors directory** at `apps/api/src/errors/` (NEW directory; verify pattern at impl time — existing errors may live elsewhere). Centralise `MissingDsaError` + other API-key-specific errors here.
- **Design brief** at `docs/epic-10-1-consumer-auth-design.md` (verify exists at impl time; pre-existing per Sources block).
- **NEW directories created by this story:**
  - `apps/api/src/routes/partner/` (with sub-routers per scope)
  - `apps/api/src/errors/` (if not yet existing)

### References

- Architecture ADR-019 (full decision rationale for Epic 10 consumer auth + DSA precondition + audit prerequisite): [Source: _bmad-output/planning-artifacts/architecture.md:3179]
- Architecture Decision 1.5 (api_consumers/api_keys/api_key_scopes schema + audit_logs.consumer_id): [Source: _bmad-output/planning-artifacts/architecture.md Decision 1.5]
- Architecture Decision 2.4 (apiKeyAuth middleware specification): [Source: _bmad-output/planning-artifacts/architecture.md Decision 2.4]
- Architecture Decision 2.8 (ambiguous-auth handling): [Source: _bmad-output/planning-artifacts/architecture.md Decision 2.8]
- Architecture Decision 3.4 (partner namespace + scope catalogue + DSA precondition): [Source: _bmad-output/planning-artifacts/architecture.md Decision 3.4]
- Architecture Decision 5.4 (audit-log principal dualism): [Source: _bmad-output/planning-artifacts/architecture.md Decision 5.4]
- Epics — Story 10.1 entry: [Source: _bmad-output/planning-artifacts/epics.md Epic 10 §10.1]
- Story 11-1 (HARD — audit_logs.consumer_id column + principal-exclusive CHECK): [Source: _bmad-output/implementation-artifacts/11-1-multi-source-registry-schema-foundation.md AC#1, Decision 1.5]
- Story 9-11 (HARD — audit viewer prerequisite per AC#8 gate): [Source: _bmad-output/implementation-artifacts/9-11-admin-audit-log-viewer.md]
- Story 10-5 (HARD for PII — DSA template precondition): [Source: _bmad-output/implementation-artifacts/10-5-data-sharing-agreement-template.md AC#1]
- prep-settings-landing-and-feature-flags (HARD — system_settings + lib/settings.ts for AC#8 flag): [Source: _bmad-output/implementation-artifacts/prep-settings-landing-and-feature-flags.md AC#1, AC#2]
- Schema barrel (extend with 3 new tables): [Source: apps/api/src/db/schema/index.ts:1-17]
- Audit service `logActionTx` API (transactional audit emission): [Source: apps/api/src/services/audit.service.ts:267]
- Audit service `logAction` API (non-transactional): [Source: apps/api/src/services/audit.service.ts:226]
- Audit service `AUDIT_ACTIONS` const (extend with 4+ new actions): [Source: apps/api/src/services/audit.service.ts:35-64]
- Real IP middleware (read req.ip post-middleware): [Source: apps/api/src/middleware/real-ip.ts:28-40]
- Admin routes auth pattern (super-admin gate clone for AC#9 endpoint): [Source: apps/api/src/routes/admin.routes.ts:24-27]
- Existing routes flat-file convention (deliberate exception with subdirectory in this story documented): [Source: apps/api/src/routes/audit.routes.ts, staff.routes.ts, etc.]
- Existing middleware single-purpose convention: [Source: apps/api/src/middleware/login-rate-limit.ts, real-ip.ts, sensitive-action.ts]
- Existing service-layer pattern: [Source: apps/api/src/services/audit.service.ts, staff.service.ts, submission-processing.service.ts]
- Drizzle migration directory + naming convention: [Source: apps/api/drizzle/0007_audit_logs_immutable.sql]
- Design brief: [Source: docs/epic-10-1-consumer-auth-design.md]
- MEMORY.md key pattern: drizzle schema cannot import `@oslsr/types`: [Source: MEMORY.md "Key Patterns"]
- MEMORY.md key pattern: integration tests use beforeAll/afterAll: [Source: MEMORY.md "Key Patterns"]
- MEMORY.md key pattern: code review before commit: [Source: MEMORY.md "Process Patterns" + `feedback_review_before_commit.md`]

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation. Implementer must include:)_

- Sequential migration number claimed (one of `0008` through `0015` depending on commit ordering across all in-flight stories)
- `audit_logs.consumer_id` column verified present (inherited from Story 11-1; if missing, escalation outcome)
- prep-settings-landing-and-feature-flags dependency verified (`getSetting<boolean>('audit_log_viewer_available')` works; `system_settings` table exists)
- Story 9-11 audit viewer deployed and `audit_log_viewer_available` flag flipped to `true` BEFORE first consumer provisioning attempt
- Story 10-5 DSA template signed BEFORE first `submissions:read_pii` scope provisioning attempt
- ESLint rule vs runtime guard test decision for `enforceLgaScope` (Task 6.4 outcome)
- Timing-oracle test result (miss vs hit latency within 10%; specific delta percentage)
- Code review findings + fixes (cross-reference Review Follow-ups (AI) below)

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
- `apps/api/src/routes/partner/index.ts` (NEW subdirectory pattern)
- `apps/api/src/routes/partner/stats.routes.ts` (placeholder)
- `apps/api/src/routes/partner/marketplace.routes.ts` (placeholder)
- `apps/api/src/routes/partner/registry.routes.ts` (placeholder)
- `apps/api/src/routes/partner/submissions.routes.ts` (placeholder)
- `apps/api/src/errors/api-key-errors.ts` (NEW errors directory; verify directory exists at impl time)
- `apps/api/drizzle/<NNNN>_*.sql` — migration with 3 new tables + scope CHECK constraint
- Tests for all of the above

**Modified:**
- `apps/api/src/db/schema/index.ts` — append 3 new schema re-exports
- `apps/api/src/routes/index.ts` — mount partner router
- `apps/api/src/middleware/error-handler.ts` (or equivalent) — sanitise Authorization header from logged error context
- `apps/api/src/services/audit.service.ts` — extend `AUDIT_ACTIONS` const with 4+ new actions
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Out of scope (explicitly NOT modified — happens in downstream / future stories or upstream / completed stories):**
- `audit_logs.consumer_id` column + principal-exclusive CHECK — INHERITED from Story 11-1 (do NOT re-add)
- `apps/api/src/lib/settings.ts` + `system_settings` table — INHERITED from prep-settings-landing-and-feature-flags (do NOT re-create)
- Per-consumer rate limiting — Story 10-2
- Consumer Admin UI — Story 10-3
- Developer Portal / OpenAPI spec — Story 10-4
- Consumer Audit Dashboard — Story 10-6
- Actual scope-bearing controllers — ship with their respective first consuming story (placeholders return `501 NOT_IMPLEMENTED`)

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 12 ACs covering 4-table schema + scope enum + token provisioning service + apiKeyAuth middleware + requireScope helper + ambiguous-auth guard + DSA precondition + audit-viewer prerequisite + rotation flow with 7-day overlap + partner namespace mounting + error envelope + tests. HARD dependencies: Story 9-11 (audit viewer) + Story 10-5 (DSA template). | Foundation of Epic 10. Without this story, no partner-API exists. |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 8 subsections — Why timing-safe comparison even on miss / Why last_used_at debounced async update / Why explicit scope enum / Why req.consumer not req.user / LGA scope enforcement is per-controller / 7-day overlap window rationale / Emergency revoke logged differently / Why audit_log_viewer_available flag uses prep-settings-landing infrastructure), "Risks" under Dev Notes; converted task-as-headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks; added `### Project Structure Notes` subsection covering service layer + middleware single-purpose pattern + NEW routes subdirectory pattern (deliberate exception to flat-file convention) + schema barrel + drizzle constraint + audit_logs.consumer_id inheritance from 11-1 + settings access from prep-settings-landing + audit logging triad + real IP middleware reuse + errors directory + design brief location; added `### References` subsection with 22 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record` as `### Change Log`; added `### Review Follow-ups (AI)` placeholder; added Task 9 (code review) per `feedback_review_before_commit.md`. **Two factual reference fixes:** (1) AC#1 + Task 1.2 + Risk #7 — `audit_logs.consumer_id` extension reframed from "this story extends" to "this story INHERITS from Story 11-1" (per Architecture Decision 1.5 — column ownership lives in 11-1; 10-1 verifies presence and escalates if missing); (2) AC#8 + Task 2.3 + File List — `apps/api/src/lib/system-settings.ts` (typo) corrected to `apps/api/src/lib/settings.ts` (matches `prep-settings-landing-and-feature-flags` AC#2 canonical name); audit-viewer-available flag access reframed from one-off `system_settings` reference to canonical `getSetting<boolean>('audit_log_viewer_available')` call from prep-settings-landing's typed accessor (same pattern as `auth.sms_otp_enabled` consumer in Story 9-12). **One new HARD dependency declared** (4th total): `prep-settings-landing-and-feature-flags` for AC#8 setting flag infrastructure. **Routes subdirectory pattern documented** as deliberate exception to flat-file convention (Project Structure Notes "Routes subdirectory pattern — first instance" + Dev Notes section): justified by 5 scope-bearing sub-routers; future stories should default to flat unless similar 4+ sub-router justification. **Three new audit actions added** to AUDIT_ACTIONS const callout (Task 2.5): `API_KEY_PROVISIONED`, `API_KEY_PII_SCOPE_REJECTED_NO_DSA`, `API_KEY_ROTATED`, `API_KEY_REVOKED`. **One soft cross-cut documented** (AC#4 + Task 3.4): real IP resolution via existing `realIpMiddleware` at `apps/api/src/middleware/real-ip.ts:28-40` for CF-Connecting-IP handling — do NOT re-derive client IP from headers. All 12 ACs preserved verbatim. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as Stories 9-13 / prep-tsc / prep-build-off-vps / 11-1 / prep-input-sanitisation-layer / 10-5 / 9-11 / 11-2 / 11-4 / 9-12 / 11-3. Two factual reference corrections (audit_logs.consumer_id ownership; settings.ts typo); one new HARD dependency declaration (prep-settings-landing); routes subdirectory pattern documented as the deliberate exception it is. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 9.)_

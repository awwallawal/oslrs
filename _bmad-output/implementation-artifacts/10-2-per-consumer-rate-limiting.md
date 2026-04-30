# Story 10.2: Per-Consumer Rate Limiting & Quotas

Status: ready-for-dev

<!--
Created 2026-04-25 by impostor-SM agent per SCP-2026-04-22 §A.5.

Per-consumer per-scope Redis-backed rate-limit + daily/monthly quotas. Builds on Story 10-1 req.consumer + req.apiKey populated by apiKeyAuth.

Sources:
  • PRD V8.3 FR24
  • Architecture Decisions 3.4 (per-scope limits) + 5.5 (per-consumer rate-limit metrics) + Pattern Category 5 (cache key naming) + Pattern Category 7 (Redis rate-limit keying)
  • UX Rate Limiting UX Patterns (429 with Retry-After + daily quota progress bar + per-scope vs per-consumer messaging)
  • Epics.md §Story 10.2

Depends on Story 10-1.

Validation pass 2026-04-30 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template; existing partner routes subdirectory pattern (`apps/api/src/routes/partner/`) consumed correctly per Story 10-1 retrofit; rate-limit middleware clone reference pinned to canonical pattern at `apps/api/src/middleware/login-rate-limit.ts:25-110`; real-IP middleware reference added (`apps/api/src/middleware/real-ip.ts:28-40`); audit logging consistency with Wave 0/1/2/3 retrofits.
-->

## Story

As an **Operator running the OSLSR partner API**,
I want **per-consumer per-scope rate limits enforced via Redis at request time + daily and monthly quotas + 429 response carrying retry-after and exhausted-scope info**,
so that **a runaway consumer integration cannot exhaust shared resources or hide its activity in noise, partners get clear self-service error messages naming the specific exhausted scope, and quota state is observable for both Super Admin and the consumer themselves**.

## Acceptance Criteria

1. **AC#1 — Per-minute rate-limit middleware:**
   - New middleware `apps/api/src/middleware/consumer-rate-limit.ts` mounted on `/api/v1/partner/*` after `apiKeyAuth` and `requireScope` (so `req.consumer` + `req.apiKey` + `req.scopeContext` are populated by Story 10-1's middleware chain)
   - Redis key format (per Pattern Category 5): `ratelimit:consumer:{consumer_id}:{scope}:{YYYY-MM-DDTHH:MM}` (UTC)
   - Atomic operation: ioredis `MULTI` wrapping `INCR` + `EXPIRE 70` (70-second TTL absorbs 1-minute boundary clock-drift)
   - Threshold per scope (per Decision 3.4 default — overridable per-consumer in Story 10-3):
     - `aggregated_stats:read` — 60 req/min
     - `marketplace:read_public` — 120 req/min
     - `registry:verify_nin` — 300 req/min
     - `submissions:read_aggregated` — 30 req/min
     - `submissions:read_pii` — 20 req/min
   - On exceed: emit `429 RATE_LIMITED` per AC#5

2. **AC#2 — Daily quota counters:**
   - Redis key: `quota:consumer:{consumer_id}:{scope}:daily:{YYYY-MM-DD}` (UTC)
   - Atomic `INCR` + `EXPIRE 90000` (~25h, absorbs day boundary clock-drift)
   - Default daily threshold (overridable):
     - `aggregated_stats:read` — 5,000 req/day
     - `marketplace:read_public` — 7,200 req/day
     - `registry:verify_nin` — 10,000 req/day
     - `submissions:read_aggregated` — 1,500 req/day
     - `submissions:read_pii` — 5,000 req/day
   - Evaluated AFTER per-minute pass; on exceed: 429 with `details.exhausted_scope` + `details.exhausted_at: 'daily'`

3. **AC#3 — Monthly quota counters:**
   - Redis key: `quota:consumer:{consumer_id}:{scope}:monthly:{YYYY-MM}` (UTC)
   - Atomic `INCR` + `EXPIRE 2764800` (~32d, absorbs longest-month + clock-drift)
   - Default monthly threshold (overridable): 30x daily for each scope (sane initial default; admin tunes per consumer)
   - Evaluated AFTER per-minute + daily pass; on exceed: 429 with `details.exhausted_at: 'monthly'`

4. **AC#4 — Per-consumer per-scope override:**
   - Extend existing `api_key_scopes` table (created by Story 10-1 AC#1) with nullable columns: `per_minute_limit INT NULL`, `daily_quota INT NULL`, `monthly_quota INT NULL`
   - When non-null, override defaults from AC#1-3
   - Surfaced in Story 10-3 Admin UI for adjustment

5. **AC#5 — 429 response shape (per Architecture Decision 3.4 + Sally's Pattern 3):**
   ```json
   {
     "code": "RATE_LIMITED",
     "message": "Per-minute rate limit reached for scope 'submissions:read_pii'. Other scopes for this consumer remain available.",
     "details": {
       "exhausted_scope": "submissions:read_pii",
       "exhausted_at": "minute" | "daily" | "monthly",
       "scope_limit": 20,
       "scope_used": 20,
       "retry_after_seconds": 43,
       "daily_quota_used": 4234,
       "daily_quota_limit": 5000,
       "monthly_quota_used": 12345,
       "monthly_quota_limit": 150000,
       "other_scopes_available": ["aggregated_stats:read", "marketplace:read_public"]
     }
   }
   ```
   - HTTP headers: `Retry-After: 43`, `X-Quota-Daily-Used: 4234`, `X-Quota-Daily-Limit: 5000`, `X-Exhausted-Scope: submissions:read_pii`
   - Error envelope shape matches Story 10-1 AC#11 taxonomy

6. **AC#6 — Quota visibility endpoint (lightweight):**
   - New endpoint `GET /api/v1/partner/quota` mounted via `apps/api/src/routes/partner/quota.routes.ts` (uses partner/ subdirectory pattern from Story 10-1)
   - Dual auth: super-admin OR consumer themselves
   - When called by consumer (apiKeyAuth-authenticated): returns own quotas across all granted scopes
   - When called by Super Admin (JWT-authenticated, with `?consumer_id=<id>` param): returns specified consumer's quotas
   - Response shape per Sally's Pattern 2: per-scope row with used/limit/reset-at for minute/daily/monthly
   - Cacheable (Cache-Control: max-age=30) — refreshed every 30s by Story 10-3 Admin UI + Story 10-4 Developer Portal

7. **AC#7 — Pino observability events** (per Architecture Decision 5.5):
   - Every partner request emits `api_partner_request` event with: `consumer_id, consumer_name, api_key_id, scope, status_code, latency_ms, applied_lga_filter (nullable), rate_limit_outcome (within|rejected_minute|rejected_daily|rejected_monthly)`
   - Tagged `principal_kind: 'consumer'` per Pattern Category 5
   - Pino child logger in `apiKeyAuth` middleware (modify `apps/api/src/middleware/api-key-auth.ts` from Story 10-1 to add the consumer-tagged context)
   - Real-IP for the event uses `req.ip` post-`realIpMiddleware` (`apps/api/src/middleware/real-ip.ts:28-40`)

8. **AC#8 — Health-digest fold-in** (per Architecture Decision 5.5):
   - Story 6-2 health-digest service (location to verify at impl time — likely `apps/api/src/services/health-digest.service.ts`) extends to include partner-API metrics:
     - p95 latency on partner endpoints
     - Rate-limit-rejection rate per consumer
     - DSA-precondition-violation attempts (from Story 10-1)
   - MIN_SAMPLES_FOR_P95 = 50 guard (per Story 9-9 pre-fix) applies to partner-API p95 too
   - On CRITICAL threshold breach: routes through Story 9-9 push channel (when shipped)

9. **AC#9 — Idempotency-key support (defensive):**
   - Optional header `Idempotency-Key: <uuid>` on partner-API write endpoints (not applicable to Epic 10 read-only scopes per FR24, but architecture allows future writes)
   - Cached response for 24h per `(api_key_id, idempotency_key)` tuple in Redis
   - Repeat with same key returns cached response without consuming rate-limit
   - Out of MVP scope for read-only scopes; flagged here as future hook

10. **AC#10 — Tests:**
    - Service tests: per-minute / daily / monthly rate-limit logic; threshold defaults + override application
    - Middleware tests: 429 response shape; correct headers; rate-limit-outcome Pino tag
    - Integration tests: hit a partner endpoint 60+ times in 1 minute → 429 on call 61; quota daily 5000+ → 429 on call 5001 with `exhausted_at: 'daily'`
    - Race-condition test: 100 concurrent requests at limit boundary — atomic INCR+EXPIRE prevents over-allow
    - Existing 4,191-test baseline maintained or grown

## Tasks / Subtasks

- [ ] **Task 1 — Schema extension: per-key per-scope override** (AC: #4)
  - [ ] 1.1 Drizzle migration: add `per_minute_limit`, `daily_quota`, `monthly_quota` (nullable INT) columns to `api_key_scopes` table (created by Story 10-1 AC#1)
  - [ ] 1.2 Update Drizzle schema file `apps/api/src/db/schema/api-key-scopes.ts` (created by Story 10-1)
  - [ ] 1.3 Migration file location: `apps/api/drizzle/<NNNN>_<descriptive_name>.sql` — sequential 4-digit prefix; confirm at impl time via `ls apps/api/drizzle/`. **Path `apps/api/src/db/migrations/` does NOT exist.**
  - [ ] 1.4 Test migration up/down on scratch DB

- [ ] **Task 2 — Rate-limit service** (AC: #1, #2, #3, #4)
  - [ ] 2.1 New service `apps/api/src/services/consumer-rate-limit.service.ts` with method `checkAndIncrement(consumerId, scope, perMinuteLimit, dailyLimit, monthlyLimit)` returning `{ allowed: boolean, exhaustedAt?: 'minute'|'daily'|'monthly', used, limit, retryAfterSeconds }`
  - [ ] 2.2 Use ioredis `MULTI` for atomic INCR+EXPIRE per key (singleton client from `apps/api/src/lib/redis.ts:37`)
  - [ ] 2.3 Threshold defaults from AC#1-3 in new file `apps/api/src/config/partner-rate-limits.ts`; override resolution: `row.per_minute_limit ?? defaults[scope].per_minute_limit`
  - [ ] 2.4 Tests per AC#10

- [ ] **Task 3 — Middleware** (AC: #1, #5, #7)
  - [ ] 3.1 New middleware `apps/api/src/middleware/consumer-rate-limit.ts` (single-purpose file matching existing convention at `apps/api/src/middleware/login-rate-limit.ts`, `real-ip.ts`, etc.)
  - [ ] 3.2 Mount in partner router (`apps/api/src/routes/partner/index.ts` from Story 10-1) AFTER `apiKeyAuth` + `requireScope` so `req.consumer` + `req.apiKey` + `req.scopeContext` are populated
  - [ ] 3.3 Call rate-limit service; on rejection emit 429 per AC#5 shape + headers
  - [ ] 3.4 Pino event per AC#7 — extend the Pino child logger from `apps/api/src/middleware/api-key-auth.ts` (Story 10-1) with `rate_limit_outcome` field
  - [ ] 3.5 Tests per AC#10

- [ ] **Task 4 — Quota visibility endpoint** (AC: #6)
  - [ ] 4.1 New file `apps/api/src/routes/partner/quota.routes.ts` (uses partner/ subdirectory pattern from Story 10-1 — see Story 10-1 retrofit "Routes subdirectory pattern" Dev Notes for the deliberate-exception rationale)
  - [ ] 4.2 `GET /api/v1/partner/quota` with dual auth (apiKeyAuth OR JWT-with-super-admin gate via existing `authorize(UserRole.SUPER_ADMIN)` from `apps/api/src/routes/admin.routes.ts:24-27`)
  - [ ] 4.3 Query Redis for current per-scope state across consumer's granted scopes
  - [ ] 4.4 Return per Sally's Pattern 2 shape
  - [ ] 4.5 Cacheable response (Cache-Control header)
  - [ ] 4.6 Tests

- [ ] **Task 5 — Health-digest fold-in** (AC: #8)
  - [ ] 5.1 Verify location of health-digest service at impl time (likely `apps/api/src/services/health-digest.service.ts` or similar from Story 6-2; confirm via `find apps/api/src -name "health-digest*"`)
  - [ ] 5.2 Extend with partner-API metrics queries (p95 latency, rejection rate, DSA-precondition violations)
  - [ ] 5.3 Apply MIN_SAMPLES_FOR_P95 = 50 guard (per MEMORY.md Story 9-9 pre-fix)
  - [ ] 5.4 Route CRITICAL through Story 9-9 push channel (when AC#6 of 9-9 lands)
  - [ ] 5.5 Tests

- [ ] **Task 6 — Idempotency-key hook** (AC: #9, deferred)
  - [ ] 6.1 Document the idempotency-key approach in Dev Notes
  - [ ] 6.2 Skeleton implementation guarded by feature flag (off by default; uses `getSetting<boolean>('partner.idempotency_enabled')` from `apps/api/src/lib/settings.ts` per `prep-settings-landing-and-feature-flags`)
  - [ ] 6.3 Future story can activate via Settings Landing UI

- [ ] **Task 7 — Tests** (AC: #10)
  - [ ] 7.1 Comprehensive tests per AC#10
  - [ ] 7.2 Run `pnpm test` from root — verify baseline 4,191 + new tests
  - [ ] 7.3 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `10-2-per-consumer-rate-limiting: in-progress` → `review` → `done`

- [ ] **Task 8 — Code review** (cross-cutting AC: all)
  - [ ] 8.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree (per the existing "code review before commit" project pattern in MEMORY.md `feedback_review_before_commit.md`)
  - [ ] 8.2 Auto-fix all High/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI)
  - [ ] 8.3 Only after code review passes, commit and mark status `review`

## Dev Notes

### Dependencies

- **Story 10-1 (HARD)** — `apiKeyAuth` middleware (`apps/api/src/middleware/api-key-auth.ts`) populates `req.consumer` + `req.apiKey`; `requireScope` middleware populates `req.scopeContext`; partner router (`apps/api/src/routes/partner/index.ts`) is the mount point; `api_key_scopes` table is the extension target for AC#4
- **prep-settings-landing-and-feature-flags (PREFERRED for AC#9 future flag)** — provides `getSetting<boolean>(key)` from `apps/api/src/lib/settings.ts` for the deferred idempotency-key feature flag
- **Architecture Decision 3.4 + Decision 5.5 + Pattern Category 5 + 7** — design baseline
- **Sally's Rate Limiting UX Patterns 1-3** — UX surface for 429 + quota progress bar + per-scope messaging
- **Story 6-2 health-digest service** — extend per AC#8 (verify location at impl time)

**Unblocks:**
- Story 10-3 (Consumer Admin UI) — needs `api_key_scopes` per-key per-scope override columns + quota visibility endpoint for AC#8 activity drawer
- Story 10-4 (Developer Portal) — needs quota visibility endpoint for partner-self-view (AC#6 of 10-4)
- Story 10-6 (Consumer Audit Dashboard) — needs `rate_limit_outcome` field in Pino events + audit_logs.meta for rejection-rate panel

### Field Readiness Certificate Impact

**Tier B / post-field.**

### Why ioredis MULTI for atomic INCR+EXPIRE

INCR alone is atomic. EXPIRE alone is atomic. But INCR + EXPIRE is NOT atomic without a transaction — between the two, another process could read the count without the TTL set, leading to stale keys. ioredis `MULTI` wraps both in a Redis transaction:

```typescript
const [count, _] = await redis.multi()
  .incr(key)
  .expire(key, ttlSeconds)
  .exec();
```

The cost is ~1 round-trip (Redis pipelines MULTI). At our scale, negligible.

### Why 70-second TTL on per-minute keys

The per-minute key is `ratelimit:consumer:X:scope:Y:2026-04-25T14:32`. At 14:33:00, the key for the previous minute should expire. Setting TTL=60 risks the key surviving past 14:33:00 if INCR happened at 14:32:59.99 (TTL evaluated at 14:33:59.99, so key exists during 14:33). Setting TTL=70 absorbs ~10s of clock-drift tolerance.

### Why daily counter has TTL=90000 (~25h, not 86400=24h)

Same reason — absorbs day-boundary clock-drift. Better to slightly over-keep counters than to occasionally double-count requests across the boundary.

### Why monthly counter has 32-day TTL

Months vary 28-31 days. 32-day TTL ensures the counter survives the longest month + a clock-drift buffer. Slight risk: a 28-day-month counter persists 4 days into the next month consuming Redis memory. At our scale (3-10 consumers × 5 scopes × 30 days = 1500 keys), negligible.

### Override resolution: row column vs default

Per AC#4, `api_key_scopes.per_minute_limit` is nullable. Resolution: `row.per_minute_limit ?? defaults[scope].per_minute_limit`. Same pattern for daily + monthly. This lets Story 10-3 admin override per-consumer per-scope without forcing a row when defaults suffice.

### Idempotency-key is deferred but architected

Per AC#9: Epic 10 MVP scopes are read-only, so idempotency is not needed. But the partner API's future may include write scopes (e.g. `submissions:create_via_partner` for a future MDA-direct-submission scope). Architecting the hook now (skeleton implementation, feature-flagged off via prep-settings-landing) costs little; retrofitting later costs more. Future activation is a configuration change via Settings Landing UI, not a code change.

### Health-digest fold-in semantics

Story 6-2 health-digest currently emails Super Admin every 30 minutes with system metrics. Adding partner-API metrics extends but doesn't replace that. Per Decision 5.5: partner-API p95 latency, rate-limit-rejection rate, DSA-precondition violations. The MIN_SAMPLES_FOR_P95 = 50 guard from Story 9-9 applies — early-stage low-traffic partners shouldn't trigger CRITICAL alerts on a single cold-start.

### Why per-scope rate limits and not per-consumer

Per-consumer would allow cross-scope budget arbitrage (consumer hits PII scope hard, exhausts budget that should have been for marketplace). Per-scope keeps the threat model clear: each scope has its own protection budget. Consumer with multiple scopes effectively gets sum-of-scope-budgets — which is intentional (more grants = more budget).

### Risks

1. **Redis is a SPOF for rate limiting.** If Redis goes down, the middleware must fail-open or fail-closed. Mitigation: fail-OPEN (allow request) with WARN log + alert — better to serve traffic than to block; rate limiting is a defence-in-depth layer not the primary security control.
2. **Threshold defaults may need tuning post-launch.** Defaults in AC#1-3 are educated guesses. Mitigation: per-consumer override per AC#4 lets admin tune without redeploy; production data informs default revision in a future story.
3. **Race conditions at limit boundary.** 100 concurrent requests at 50/60-limit could over-allow without atomic INCR+EXPIRE. Mitigation: AC#10 has explicit race-condition test; ioredis MULTI ensures atomicity.
4. **Quota visibility endpoint exposes consumer's own data — but to what extent?** Should consumer see other consumers' quotas? No — quota visibility is consumer-private (each consumer sees own); Super Admin sees all. Mitigation: AC#6 dual-auth ensures correct disclosure scope.
5. **429 retry-storm.** A partner whose integration ignores Retry-After and immediately retries could DDoS themselves. Mitigation: documentation in /developers (Story 10-4) emphasises Retry-After honouring; Bot-Fight-Mode at Cloudflare provides upstream throttling.

### Project Structure Notes

- **Service layer** at `apps/api/src/services/consumer-rate-limit.service.ts` — follows existing service-layer pattern (peer of `audit.service.ts`, `api-key.service.ts` from 10-1, etc.).
- **Middleware** at `apps/api/src/middleware/consumer-rate-limit.ts` — single-purpose file (matches `login-rate-limit.ts`, `real-ip.ts`, `sensitive-action.ts` precedent). NOT a clone of `login-rate-limit.ts`'s express-rate-limit pattern — uses raw ioredis MULTI for finer control over the per-scope keying scheme.
- **Routes file** at `apps/api/src/routes/partner/quota.routes.ts` — uses the `partner/` subdirectory established by Story 10-1 (deliberate exception to flat-file convention; documented in 10-1 Dev Notes "Routes subdirectory pattern — first instance"). Mounts at `/api/v1/partner/quota`.
- **Config layer** at `apps/api/src/config/partner-rate-limits.ts` (NEW file). Verify `apps/api/src/config/` directory exists at impl time (it should from Story 11-2 retrofit's `import-sources.ts`).
- **Schema extension**: `api_key_scopes` table from Story 10-1 — extend with 3 nullable INT columns. Schema file at `apps/api/src/db/schema/api-key-scopes.ts` (created by 10-1).
- **Drizzle constraint:** schema files MUST NOT import from `@oslsr/types`. Per MEMORY.md key pattern.
- **Drizzle migrations** at `apps/api/drizzle/<NNNN>_<name>.sql` — sequential 4-digit prefix.
- **Real-IP resolution** via existing `realIpMiddleware` at `apps/api/src/middleware/real-ip.ts:28-40` — read `req.ip` post-middleware for AC#7 Pino event IP attribution.
- **Settings access for AC#9 deferred flag** via `getSetting<boolean>('partner.idempotency_enabled')` from `apps/api/src/lib/settings.ts` (provided by `prep-settings-landing-and-feature-flags`). Generic key-value pattern — same shape as `auth.sms_otp_enabled`.
- **Pino child logger** from Story 10-1's `apiKeyAuth` middleware (`apps/api/src/middleware/api-key-auth.ts`) — extend to add `rate_limit_outcome` field per AC#7.
- **Audit logging** via `AuditService.logAction()` for rate-limit-rejection events if needed (consider for production-impact scenarios; not strictly required by AC#7 since Pino events are the primary observability channel).
- **Health-digest service** location to be verified at impl time (Story 6-2 reference; likely `apps/api/src/services/health-digest.service.ts` but search at impl time before extending).

### References

- Architecture Decision 3.4 (per-scope rate limits + partner namespace): [Source: _bmad-output/planning-artifacts/architecture.md Decision 3.4]
- Architecture Decision 5.5 (per-consumer rate-limit metrics + Pino observability): [Source: _bmad-output/planning-artifacts/architecture.md Decision 5.5]
- Architecture Pattern Category 5 (cache key naming): [Source: _bmad-output/planning-artifacts/architecture.md Pattern Category 5]
- Architecture Pattern Category 7 (Redis rate-limit keying): [Source: _bmad-output/planning-artifacts/architecture.md Pattern Category 7]
- Epics — Story 10.2 entry: [Source: _bmad-output/planning-artifacts/epics.md Epic 10 §10.2]
- Story 10-1 (HARD — apiKeyAuth + requireScope + partner router + api_key_scopes schema): [Source: _bmad-output/implementation-artifacts/10-1-consumer-auth-layer.md AC#4-#5, Task 6]
- Story 10-1 routes subdirectory pattern (justification for partner/ subdir): [Source: _bmad-output/implementation-artifacts/10-1-consumer-auth-layer.md Dev Notes "Routes subdirectory pattern — first instance"]
- prep-settings-landing-and-feature-flags (PREFERRED for AC#9 idempotency-enabled flag): [Source: _bmad-output/implementation-artifacts/prep-settings-landing-and-feature-flags.md AC#1, AC#2]
- Redis singleton: [Source: apps/api/src/lib/redis.ts:37]
- Real-IP middleware (read req.ip post-middleware): [Source: apps/api/src/middleware/real-ip.ts:28-40]
- Existing rate-limit middleware convention (single-purpose files): [Source: apps/api/src/middleware/login-rate-limit.ts]
- Admin routes auth pattern (super-admin gate clone for AC#6 dual-auth): [Source: apps/api/src/routes/admin.routes.ts:24-27]
- Drizzle migration directory + naming convention: [Source: apps/api/drizzle/0007_audit_logs_immutable.sql]
- MEMORY.md key pattern: drizzle schema cannot import `@oslsr/types`: [Source: MEMORY.md "Key Patterns"]
- MEMORY.md key pattern: Story 9-9 MIN_SAMPLES_FOR_P95 = 50 guard: [Source: MEMORY.md "Current State (as of 2026-04-12)"]
- MEMORY.md key pattern: code review before commit: [Source: MEMORY.md "Process Patterns" + `feedback_review_before_commit.md`]

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation. Implementer must include:)_

- Sequential migration number claimed
- Story 6-2 health-digest service exact location confirmed (file path)
- Story 10-1 dependency status verified (apiKeyAuth + requireScope shipped; api_key_scopes table exists)
- Race-condition test result (100 concurrent requests at boundary: pass / fail with details)
- Code review findings + fixes (cross-reference Review Follow-ups (AI) below)

### File List

**Created:**
- `apps/api/src/services/consumer-rate-limit.service.ts`
- `apps/api/src/middleware/consumer-rate-limit.ts`
- `apps/api/src/config/partner-rate-limits.ts`
- `apps/api/src/routes/partner/quota.routes.ts` (uses partner/ subdir pattern from Story 10-1)
- Tests for all of the above

**Modified:**
- `apps/api/src/db/schema/api-key-scopes.ts` (Story 10-1 file) — add `per_minute_limit`, `daily_quota`, `monthly_quota` nullable INT columns
- `apps/api/src/services/health-digest.service.ts` (or actual Story 6-2 location) — fold in partner-API metrics
- `apps/api/src/middleware/api-key-auth.ts` (Story 10-1 file) — Pino child logger with consumer-tagged context including `rate_limit_outcome` field
- `apps/api/src/routes/partner/index.ts` (Story 10-1 file) — mount `consumer-rate-limit.ts` middleware after apiKeyAuth + requireScope
- Drizzle migration files
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering per-minute Redis rate-limit + daily/monthly quotas + per-key per-scope override + 429 response with structured details + quota visibility endpoint + Pino observability + health-digest fold-in + deferred idempotency hook + tests. Depends on Story 10-1. | Per-consumer protection layer. Without it, a runaway partner could exhaust shared resources. |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 7 subsections — Why ioredis MULTI / Why 70-second TTL / Why 25h daily TTL / Why 32-day monthly TTL / Override resolution / Idempotency-key deferred but architected / Health-digest fold-in semantics / Why per-scope rate limits not per-consumer), "Risks" under Dev Notes; converted task-as-headings to canonical `[ ] Task N (AC: #X)` checkbox format; added `### Project Structure Notes` subsection covering service-layer pattern + middleware single-purpose convention + partner/ subdirectory inherited from 10-1 + config layer + schema extension target + real-IP middleware reuse + settings access for deferred AC#9 flag + Pino child logger reuse + health-digest location-verify + audit logging consideration; added `### References` subsection with 16 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record`; added `### Review Follow-ups (AI)` placeholder; added Task 8 (code review) per `feedback_review_before_commit.md`. **Cross-story coherence wiring:** AC#9 deferred idempotency-flag now consumes `prep-settings-landing-and-feature-flags` `getSetting<boolean>('partner.idempotency_enabled')` instead of one-off settings hack (consistent with Story 9-12 + Story 10-1 settings consumption pattern). AC#7 Pino event extends Story 10-1's `apiKeyAuth` child logger with `rate_limit_outcome` field — explicit reference to source middleware file. AC#6 quota visibility endpoint placement uses `partner/` subdirectory per Story 10-1 retrofit's documented exception. Real-IP middleware reference added (for AC#7 IP attribution). Health-digest service location flagged as verify-at-impl-time (Story 6-2 reference; exact path unverified). All 10 ACs preserved verbatim. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as 14 prior retrofits. Low-novelty drift; mechanical structural rebuild + cross-story coherence wiring with Wave 0/1/2/3 retrofitted stories. No factual codebase errors found this pass — all referenced existing infrastructure (apiKeyAuth, requireScope, partner router, api_key_scopes, Redis singleton, Pino) is correctly identified. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 8.)_

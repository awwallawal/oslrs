# Sprint Change Proposal — Infrastructure Security Hardening

**Date:** 2026-04-04
**Trigger:** DigitalOcean Ticket #11882585 (received 2026-03-24)
**Scope Classification:** Moderate
**Status:** Pending Approval

---

## Section 1: Issue Summary

On 2026-03-24, DigitalOcean's security operations notified us that the production Redis instance on VPS `159.89.146.93` is publicly accessible on port 6379, discovered via a Shadowserver Foundation IPv4 network scan. 

**Root cause:** The VPS deploys Redis and PostgreSQL using standalone `docker run -p 6379:6379` commands (documented in `docs/infrastructure-cicd-playbook.md:140-154`). Docker's port publishing writes directly to iptables, bypassing UFW firewall rules entirely. This exposes both services to the public internet. Redis has no authentication (`--requirepass` never configured), meaning anyone can read/write/flush all data — including JWT blacklist tokens, session state, BullMQ job payloads containing PII, and rate limiter state.

A subsequent full-codebase security audit on 2026-04-04 identified 3 critical, 3 high, and 4 medium additional vulnerabilities in application code.

**Key conflict:** The architecture document's Docker Compose configuration correctly keeps Redis internal (no port mapping). The deployment playbook diverged from the architecture intent by using standalone `docker run` commands with `0.0.0.0` binding. This is a deployment-level compliance gap, not an application design flaw.

**Evidence:**
- DigitalOcean Ticket #11882585 (2026-03-24)
- `telnet 159.89.146.93 6379` — connection successful (confirms exposure)
- `docs/infrastructure-cicd-playbook.md:150-154` — insecure `docker run` commands
- `_bmad-output/planning-artifacts/infrastructure-security-audit-2026-04-04.md` — full audit report

---

## Section 2: Impact Analysis

### Epic Impact

| Epic | Impact | Details |
|------|--------|---------|
| Epic 9 (in-progress) | **Paused** | Zero stories in-progress. 9-2 and 9-4 externally blocked on domain purchase. No disruption. |
| Epics 1-8 (done) | **None** | All completed work remains valid. |
| New section | **Added** | Security Hardening Phase 2 (4 stories) inserted before Epic 9 resumes. |

### Story Impact

No existing stories require modification. Four new stories are proposed:

| Story | Priority | Summary |
|-------|----------|---------|
| SEC2-1 | P0 CRITICAL | VPS Infrastructure Hardening (manual ops) |
| SEC2-2 | P1 HIGH | Centralized Redis Connection Factory |
| SEC2-3 | P1 HIGH | Application Security Hardening |
| SEC2-4 | P2 MEDIUM | Defense-in-Depth & Documentation |

### Artifact Conflicts

| Artifact | Change | Assigned To |
|----------|--------|-------------|
| `epics.md` | Add Security Hardening Phase 2 section | SM |
| `sprint-status.yaml` | Add SEC2 tracking entries | SM |
| `architecture.md` | Add infra security section, Redis factory pattern, ADR-006 Layer 0 | SEC2-4 |
| `docs/infrastructure-cicd-playbook.md` | Fix docker run commands (lines 140-154) | SEC2-1 |
| `docs/portable-playbook.md` | Fix docker run pattern (line ~747) | SEC2-1 / SEC2-4 |
| `.env.example` | Add REDIS_URL with password format | SEC2-2 |
| PRD (`prd.md`) | Optional: Strengthen NFR4.4 with explicit infra access controls | SEC2-4 (optional) |

### Technical Impact

- **20+ files modified** in SEC2-2 (Redis connection factory replaces scattered `new Redis()` calls)
- **app.ts, token.service.ts, realtime/index.ts** modified in SEC2-3
- **VPS Docker containers** recreated with new binding and auth in SEC2-1
- **All 4,093+ tests must pass** after each story — zero regressions tolerance

---

## Section 3: Recommended Approach

### Selected: Direct Adjustment (Option 1)

Insert Security Hardening Phase 2 as a standalone section (following the SEC-1 through SEC-4 precedent from post-Epic 6). Epic 9 pauses during execution and resumes after completion.

### Rationale

1. **Precedent-proven** — SEC-1 through SEC-4 used this exact pattern, completed in 1 day, zero regressions
2. **Zero disruption** — Epic 9 has no in-progress work; two stories externally blocked regardless
3. **Low risk** — Well-scoped changes, 4,093+ test safety net, no architectural pivots
4. **Compliance** — Brings deployment into compliance with existing NFR4.4/NFR4.7 and ADR-006
5. **Urgency** — 11-day-old production exposure; security before polish

### Alternatives Rejected

| Option | Reason |
|--------|--------|
| Rollback | Problem is infrastructure config, not application code |
| MVP scope reduction | MVP is functionally complete; this is compliance, not new features |
| Parallel with Epic 9 | SEC2-2 touches 20+ files — merge conflict risk with any concurrent work |

### Effort & Risk

| Metric | Estimate |
|--------|----------|
| Total effort | 2-4 days |
| Risk level | Low |
| Timeline impact on Epic 9 | Minimal (2 of 4 stories are blocked on domain purchase anyway) |
| Test regression risk | Low (4,093+ existing tests, proven CI pipeline) |

---

## Section 4: Detailed Change Proposals

### SEC2-1: VPS Infrastructure Hardening (P0 CRITICAL)

**Type:** Manual operations (Awwal via SSH) + documentation update

**Tasks:**
1. Rebind Redis to localhost with AUTH:
   ```
   OLD:  docker run -d --name oslsr-redis -p 6379:6379 ...
   NEW:  docker run -d --name oslsr-redis -p 127.0.0.1:6379:6379 ... redis-server --requirepass <STRONG_PASSWORD>
   ```
2. Rebind PostgreSQL to localhost with strong credentials:
   ```
   OLD:  docker run -d --name oslsr-postgres -p 5432:5432 -e POSTGRES_PASSWORD=password ...
   NEW:  docker run -d --name oslsr-postgres -p 127.0.0.1:5432:5432 -e POSTGRES_PASSWORD=<STRONG_PASSWORD> ...
   ```
3. Update VPS `.env`: `REDIS_URL=redis://:<PASSWORD>@localhost:6379`
4. Create DigitalOcean Cloud Firewall (inbound: 22, 80, 443 only)
5. Rotate all secrets (JWT, Resend API key, DO Spaces keys)
6. Restart application (`pm2 restart oslsr-api`)
7. Update `docs/infrastructure-cicd-playbook.md` lines 140-154 with secure patterns
8. Update `docs/portable-playbook.md` line ~747

**Verification:** `telnet 159.89.146.93 6379` → refused. `telnet 159.89.146.93 5432` → refused. App health check passes. BullMQ workers processing. Rate limiters functional.

### SEC2-2: Centralized Redis Connection Factory (P1 HIGH)

**Type:** Code change

**Scope:**
- Create `apps/api/src/lib/redis.ts` — centralized factory with AUTH support, connection health check, lazy initialization
- Replace 20+ scattered `new Redis(process.env.REDIS_URL || 'redis://localhost:6379')` calls across:
  - 8 queue files (`queues/*.queue.ts`)
  - 8 rate limiter files (`middleware/*-rate-limit.ts`)
  - 3 worker files (`workers/*.worker.ts`)
  - `services/token.service.ts`
  - `controllers/staff.controller.ts` (View-As)
  - `realtime/index.ts`
- Update `.env.example` with `REDIS_URL=redis://:YOUR_PASSWORD@localhost:6379`
- All existing tests must pass (4,093+)

**Rationale:** Currently, adding Redis AUTH requires modifying 20+ files. A single factory makes auth configuration a one-line change and provides a single point for health monitoring, TLS, and connection pooling in the future.

### SEC2-3: Application Security Hardening (P1 HIGH)

**Type:** Code change

**Changes:**

1. **Remove JWT fallback defaults** (`token.service.ts:31-32`):
   ```
   OLD:  private static jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
   NEW:  Throw on missing secret in ALL environments (not just production)
   ```

2. **Explicit body size limit** (`app.ts:152`):
   ```
   OLD:  app.use(express.json());
   NEW:  app.use(express.json({ limit: '1mb' }));
   ```

3. **Graduate CSP to enforcement** (`app.ts:89`):
   ```
   OLD:  reportOnly: true,
   NEW:  reportOnly: process.env.NODE_ENV !== 'production',
   ```

4. **CORS wildcard guard** (`app.ts:82`):
   ```
   OLD:  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
   NEW:  Add validation: reject CORS_ORIGIN='*' in production
   ```

5. **Socket.io transport hardening** (`realtime/index.ts`):
   ```
   OLD:  transports: ['websocket', 'polling'],
   NEW:  transports: ['websocket'],
   ```

### SEC2-4: Defense-in-Depth & Documentation (P2 MEDIUM)

**Type:** Code change + documentation

**Changes:**
1. **Token revocation on role change** — When staff role is updated in `staff.controller.ts`, invalidate all existing JWT/refresh tokens for that user in Redis
2. **Database connection pool configuration** — Explicit `max`, `idleTimeoutMillis`, `connectionTimeoutMillis` in `db/index.ts`
3. **Dev route guard tightening** — Change `!== 'production'` to `=== 'development' || === 'test'` in `dev.routes.ts`
4. **Architecture doc updates:**
   - Add "Layer 0: Infrastructure Perimeter" to ADR-006
   - Add Redis connection factory pattern to code patterns section
   - Add infrastructure security requirements section
5. **Optional:** Strengthen PRD NFR4.4 with explicit data store auth requirement

---

## Section 5: Implementation Handoff

### Scope Classification: Moderate

Requires backlog reorganization (SM) before development implementation.

### Handoff Matrix

| Step | Agent/Role | Action | Deliverables |
|------|-----------|--------|-------------|
| 1 | **Awwal** (manual) | Execute SEC2-1 VPS hardening via SSH | Redis/Postgres rebound, Cloud Firewall, secrets rotated, verification passed |
| 2 | **SM Agent** | Create 4 story files, update epics.md, update sprint-status.yaml | Story files with ACs/tasks/subtasks, sprint tracking updated |
| 3 | **Dev Agent** | Implement SEC2-2 | Redis factory, 20+ file migration, tests |
| 4 | **CR Agent** | Review SEC2-2 (fresh context, different LLM recommended) | Code review report |
| 5 | **Dev Agent** | Implement SEC2-3 | JWT, CSP, CORS, body limit, socket.io changes, tests |
| 6 | **CR Agent** | Review SEC2-3 | Code review report |
| 7 | **Dev Agent** | Implement SEC2-4 | Token revocation, pool config, docs, tests |
| 8 | **CR Agent** | Review SEC2-4 | Code review report |
| 9 | **All** | Resume Epic 9 | Stories 9-1, 9-3 unblocked; 9-2, 9-4 await domain |

### Success Criteria

- [ ] `telnet 159.89.146.93 6379` → connection refused
- [ ] `telnet 159.89.146.93 5432` → connection refused
- [ ] DigitalOcean Cloud Firewall active (inbound: 22, 80, 443 only)
- [ ] All Redis consumers use centralized factory with AUTH
- [ ] JWT throws on missing secrets (no fallback defaults)
- [ ] CSP enforced in production (not report-only)
- [ ] CORS rejects wildcard in production
- [ ] express.json body limit set explicitly
- [ ] Token revocation on role change implemented
- [ ] All playbooks updated with secure Docker patterns
- [ ] 4,093+ tests pass, zero regressions
- [ ] All 4 stories pass adversarial code review

### Dependencies & Sequencing

```
SEC2-1 (VPS, manual) ──→ SEC2-2 (Redis factory) ──→ SEC2-3 (App hardening) ──→ Epic 9 resumes
                                                  ──→ SEC2-4 (Defense + docs) ──↗
```

SEC2-1 must complete first (provides REDIS_URL with password). SEC2-2 must complete before SEC2-3 (factory must exist). SEC2-4 can run in parallel with SEC2-3.

---

**Prepared by:** Amelia (Dev Agent), Correct Course Workflow
**Date:** 2026-04-04
**Audit Reference:** `_bmad-output/planning-artifacts/infrastructure-security-audit-2026-04-04.md`
**Precedent:** Security Hardening Phase 1 (SEC-1 through SEC-4, post-Epic 6, 2026-03-01)

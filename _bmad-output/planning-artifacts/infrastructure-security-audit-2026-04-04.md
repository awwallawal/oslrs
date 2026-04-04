# OSLRS Infrastructure & Application Security Audit

**Date:** 2026-04-04
**Trigger:** DigitalOcean Ticket #11882585 — Redis instance publicly exposed on VPS `159.89.146.93:6379`
**Auditor:** Amelia (Dev Agent) + Automated Codebase Scan
**Scope:** VPS infrastructure configuration, Docker networking, Redis/Postgres exposure, full application security re-assessment
**Prior Audit:** `security-audit-report-2026-03-01.md` (OWASP Top 10, post-Epic 6)
**Codebase Snapshot:** Post Epic 8 + Epic 9 in-progress, 4,093+ tests

---

## Executive Summary

An external security scan by the Shadowserver Foundation (via DigitalOcean) identified that the production Redis instance is **publicly accessible without authentication** on port 6379. Investigation reveals this is caused by Docker bypassing UFW firewall rules via direct iptables manipulation — a known Docker networking behavior that was not accounted for during VPS provisioning.

This is a **CRITICAL infrastructure vulnerability**. Redis stores JWT blacklist tokens, session state, BullMQ job payloads (containing user data), rate limiter state, and fraud detection configuration. An attacker with Redis access could:
- Read/modify session tokens and bypass authentication
- Flush rate limiter state to enable brute-force attacks
- Inject malicious BullMQ jobs
- Read sensitive data in job payloads (emails, user IDs, fraud scores)
- Execute `FLUSHALL` to cause application-wide denial of service

The same Docker-bypasses-UFW vulnerability likely exposes **PostgreSQL on port 5432** as well.

Additionally, a full application security re-assessment identified **6 code-level vulnerabilities** that were not present or not caught in the March 2026 audit.

**Overall Verdict: CRITICAL — Immediate remediation required for infrastructure. Code hardening HIGH priority.**

---

## 1. Trigger Event

```
From: DigitalOcean Abuse <abuse-replies@digitalocean.com>
Date: Tue, Mar 24, 2026 at 7:37 PM
Subject: [DigitalOcean] Ticket #11882585: Important notice regarding a potentially
         misconfigured Redis instance on your Droplet oslsr-home-app
To: lawalkolade@gmail.com

A recent network security scan suggests your Droplet oslsr-home-app is running Redis
and that it may be unintentionally exposing data or misconfigured to allow unauthorized access.

Redis listens for traffic from everywhere on port 6379, and you can validate this report
by attempting to connect to your Redis on 6379 via a simple telnet command:
    telnet 159.89.146.93 6379

Important Note: If you are using Docker containers, be aware that Docker can bypass
UFW (Uncomplicated Firewall) rules by default.
```

---

## 2. Root Cause Analysis

### 2.1 The Docker-UFW Bypass

**UFW configuration** (from `docs/infrastructure-cicd-playbook.md` lines 66-72):
```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 9443/tcp    # Portainer
ufw enable
```

This correctly blocks port 6379 at the UFW level. However...

**Redis Docker run command** (from `docs/infrastructure-cicd-playbook.md` lines 150-154):
```bash
docker run -d --name oslsr-redis \
  -p 6379:6379 \          # <-- binds to 0.0.0.0:6379
  -v redis_data:/data \
  --restart=always \
  redis:7-alpine
```

**The `-p 6379:6379` flag** tells Docker to publish port 6379 on all interfaces (0.0.0.0). Docker accomplishes this by writing **directly to iptables**, completely bypassing UFW. The result: `ufw status` shows port 6379 as blocked, but it is actually wide open.

### 2.2 No Redis Authentication

The Redis container runs with **zero authentication**. No `--requirepass` flag, no custom `redis.conf`. Anyone who connects can execute any Redis command, including:
- `KEYS *` — enumerate all keys
- `GET jwt:blacklist:*` — read blacklisted tokens
- `GET refresh:*` — read refresh token metadata
- `FLUSHALL` — wipe all data
- `CONFIG SET` — modify Redis configuration at runtime

### 2.3 No Redis TLS

All Redis traffic is unencrypted. On the VPS loopback interface this is acceptable, but with port 6379 exposed to the internet, all data travels in cleartext.

### 2.4 Postgres Likely Exposed Identically

**Postgres Docker run command** (from `docs/infrastructure-cicd-playbook.md` lines 140-147):
```bash
docker run -d --name oslsr-postgres \
  -e POSTGRES_DB=app_db \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \           # <-- same 0.0.0.0 binding
  -v postgres_data:/var/lib/postgresql/data \
  --restart=always \
  postgres:15-alpine
```

Same Docker-UFW bypass. Port 5432 is likely publicly accessible. Combined with the weak default credentials (`user`/`password`), this could expose the **entire production database**.

---

## 3. Impact Assessment

### 3.1 Redis Data at Risk

| Data Type | Redis Key Pattern | Sensitivity | Impact if Compromised |
|-----------|-------------------|-------------|----------------------|
| JWT Blacklist | `jwt:blacklist:{jti}` | HIGH | Attacker can un-blacklist revoked tokens |
| Refresh Tokens | `refresh:{userId}:{jti}` | CRITICAL | Full account takeover via token theft |
| View-As Sessions | `view-as:{userId}` | HIGH | Impersonate any user role |
| Rate Limiter State | `rl:*` | MEDIUM | Bypass rate limits, enable brute force |
| BullMQ Jobs | `bull:*` | HIGH | Read PII in job payloads (emails, names, IDs) |
| Fraud Config Cache | `fraud:config:*` | MEDIUM | Modify fraud detection thresholds |
| Session Metadata | Various | HIGH | Session hijacking |

### 3.2 Redis Consumer Inventory (20+ connection points)

**Queues (8):** email, import, webhook-ingestion, fraud-detection, marketplace-extraction, dispute-autoclose, backup, productivity-snapshot
**Rate Limiters (8):** login, password-reset, registration, google-auth, export, sensitive-action, message, reveal
**Services (3):** token.service.ts, staff.controller.ts (View-As), realtime/index.ts
**Workers (3):** email.worker.ts, webhook-ingestion.worker.ts, import (inline)

All 20+ consumers use the pattern:
```typescript
new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
```

No centralized connection factory. Adding Redis AUTH requires modifying 20+ files.

### 3.3 Blast Radius

| Scenario | Likelihood | Impact |
|----------|------------|--------|
| Unauthorized data read (tokens, jobs) | HIGH | Account compromise, PII exposure |
| FLUSHALL (wipe Redis) | MEDIUM | App-wide DoS, rate limits reset, jobs lost |
| Key manipulation (un-blacklist tokens) | MEDIUM | Revoked sessions re-activated |
| Pivot to internal network | LOW | Docker network access from Redis CLI |

---

## 4. Application Security Findings

In addition to infrastructure issues, the following **code-level vulnerabilities** were identified or re-assessed:

### 4.1 CRITICAL

| # | Finding | Location | Notes |
|---|---------|----------|-------|
| C-1 | **Redis exposed without AUTH** | VPS Docker config | See Section 2 |
| C-2 | **Postgres likely exposed without strong credentials** | VPS Docker config | Same Docker-UFW bypass |
| C-3 | **JWT fallback to weak defaults** | `apps/api/src/services/token.service.ts:31-32` | `'default-secret-change-in-production'` — production validation in `app.ts:48-50` catches this, but only when `NODE_ENV=production`. If NODE_ENV is unset, weak secret activates silently. |

### 4.2 HIGH

| # | Finding | Location | Notes |
|---|---------|----------|-------|
| H-1 | **CSP still in report-only mode** | `apps/api/src/app.ts:89` | Deployed in SEC-2 (2026-03-01), never graduated to enforcement. XSS payloads execute — only logged. |
| H-2 | **No explicit `express.json()` body size limit** | `apps/api/src/app.ts:152` | Default 100KB is reasonable but implicit. Should be explicit and documented. |
| H-3 | **Socket.io polling transport enabled** | `apps/api/src/realtime/index.ts` | Long-polling susceptible to CSRF even with CORS. WebSocket-only is safer. |

### 4.3 MEDIUM

| # | Finding | Location | Notes |
|---|---------|----------|-------|
| M-1 | **No token revocation on role/permission change** | `apps/api/src/controllers/staff.controller.ts` | Existing JWTs remain valid for up to 15 min after role change. |
| M-2 | **CORS wildcard not validated in production** | `apps/api/src/app.ts:82` | If `CORS_ORIGIN=*` is set accidentally, no guard catches it. |
| M-3 | **20+ scattered Redis connections, no factory** | All queues, rate limiters, workers | Makes security changes (AUTH, TLS) a high-effort 20+ file modification. |
| M-4 | **No explicit database connection pool config** | `apps/api/src/db/index.ts:19-21` | Default pool settings. No idle timeout, connection timeout, or max connections configured. |

### 4.4 LOW

| # | Finding | Location | Notes |
|---|---------|----------|-------|
| L-1 | **Dev routes gate on `!== 'production'` not `=== 'development'`** | `apps/api/src/routes/dev.routes.ts` | Accessible if NODE_ENV is any value other than 'production'. |

### 4.5 Positive Findings (Unchanged from March 2026 Audit)

All previous security controls remain intact:
- bcrypt (12 rounds), AES-256-GCM, Zod validation, Drizzle ORM (SQL injection prevention)
- RBAC middleware, JWT blacklist with JTI, session timeouts (8h inactivity / 24h absolute)
- Cookie security (httpOnly, sameSite strict, secure in prod)
- Rate limiting on all auth endpoints with Redis-backed store
- CI security audit gate (`pnpm audit --audit-level=high --prod`)
- Dependency pinning via pnpm overrides
- `.env` is **NOT** committed to git (verified)

---

## 5. Remediation Plan

### Phase 1: Immediate VPS Hardening (Manual — within 24 hours)

**P1-1: Rebind Redis to localhost + add AUTH**
```bash
docker stop oslsr-redis && docker rm oslsr-redis
docker run -d --name oslsr-redis \
  -p 127.0.0.1:6379:6379 \
  -v redis_data:/data \
  --restart=always \
  redis:7-alpine \
  redis-server --requirepass <STRONG_PASSWORD>
```

**P1-2: Rebind Postgres to localhost**
```bash
docker stop oslsr-postgres && docker rm oslsr-postgres
docker run -d --name oslsr-postgres \
  -e POSTGRES_DB=app_db \
  -e POSTGRES_USER=<NEW_USER> \
  -e POSTGRES_PASSWORD=<STRONG_PASSWORD> \
  -p 127.0.0.1:5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  --restart=always \
  postgres:15-alpine
```

**P1-3: Update `.env` on VPS**
```
REDIS_URL=redis://:<REDIS_PASSWORD>@localhost:6379
DATABASE_URL=postgres://<NEW_USER>:<NEW_PASSWORD>@localhost:5432/app_db
```

**P1-4: Create DigitalOcean Cloud Firewall**
- Inbound: Allow 22 (SSH), 80 (HTTP), 443 (HTTPS) only
- This applies at the network edge — Docker cannot bypass it
- Free service, no performance impact

**P1-5: Restart application + verify**
```bash
pm2 restart oslsr-api
# Verify Redis is not reachable from outside:
# From local machine: telnet 159.89.146.93 6379  → should fail
# From VPS: redis-cli -a <password> ping  → PONG
```

**P1-6: Rotate all secrets**
- Generate new JWT_SECRET and REFRESH_TOKEN_SECRET (64+ chars)
- Rotate Resend API key, DigitalOcean Spaces keys
- Update all env vars on VPS

### Phase 2: Code Hardening (Stories — this sprint)

- **SEC2-1:** Centralize Redis connection into shared factory with AUTH support
- **SEC2-2:** Remove JWT fallback defaults, enforce secrets in all environments
- **SEC2-3:** Graduate CSP to enforcement, add express.json limit, validate CORS, harden socket.io
- **SEC2-4:** Update infrastructure playbook with secure Docker patterns

### Phase 3: Defense-in-Depth (Stories — next sprint)

- **SEC2-5:** Token revocation on role/permission changes
- **SEC2-6:** File upload magic-byte validation
- **SEC2-7:** Redis TLS for encrypted transit
- **SEC2-8:** Database connection pool tuning

---

## 6. Verification Checklist

After Phase 1 remediation:

- [ ] `telnet 159.89.146.93 6379` → connection refused
- [ ] `telnet 159.89.146.93 5432` → connection refused
- [ ] DigitalOcean Cloud Firewall shows only 22, 80, 443 inbound
- [ ] `docker exec oslsr-redis redis-cli ping` → requires AUTH
- [ ] `REDIS_URL` contains password in VPS `.env`
- [ ] Application health check responds normally
- [ ] All BullMQ workers processing jobs
- [ ] Rate limiters functional (test login rate limit)
- [ ] WebSocket connections working (real-time features)

After Phase 2 code changes:

- [ ] All 20+ Redis consumers use centralized factory
- [ ] `TokenService` throws on missing JWT secrets (no fallback)
- [ ] CSP violations blocked (not just reported) in production
- [ ] `express.json({ limit: '1mb' })` configured
- [ ] `CORS_ORIGIN=*` rejected in production
- [ ] Infrastructure playbook updated with `127.0.0.1:` binding pattern
- [ ] All existing tests pass (4,093+ expected)

---

## 7. Lessons Learned

1. **Docker bypasses UFW by default** — this is a well-known issue but was not accounted for in the original VPS provisioning guide. All future Docker port mappings must use explicit `127.0.0.1:` binding unless intentionally public.

2. **Defense-in-depth matters** — UFW alone is insufficient when Docker is in play. DigitalOcean Cloud Firewall (network-edge) should be the primary perimeter control, with host-level firewalls as secondary.

3. **Redis AUTH should be default** — even for localhost-only Redis, `--requirepass` adds a layer against lateral movement if the host is compromised.

4. **Centralized connection factories** — the scattered Redis connection pattern (20+ files) makes security changes unnecessarily expensive. A single factory would have made adding AUTH a one-line change.

5. **Playbook-as-code** — the insecure `docker run` commands were documented in `docs/infrastructure-cicd-playbook.md` and reproduced exactly. The playbook must be updated so future deployments don't repeat the pattern.

---

## 8. Timeline

| Date | Event |
|------|-------|
| 2026-03-24 | DigitalOcean Ticket #11882585 received |
| 2026-04-04 | Audit investigation and report completed |
| 2026-04-04 | Phase 1: VPS hardening (target: same day) |
| TBD | Phase 2: Code hardening stories (this sprint) |
| TBD | Phase 3: Defense-in-depth (next sprint) |

---

## Appendix A: Files Referenced

| File | Relevance |
|------|-----------|
| `docs/infrastructure-cicd-playbook.md:140-154` | Root cause — insecure Docker run commands |
| `docker/docker-compose.yml` | Production compose — Redis not exposed (correct) |
| `docker/docker-compose.dev.yml:24-25` | Dev compose — Redis on 0.0.0.0 (acceptable for dev) |
| `apps/api/src/services/token.service.ts:31-32` | JWT fallback defaults |
| `apps/api/src/app.ts:82,89,152` | CORS config, CSP report-only, JSON body limit |
| `apps/api/src/realtime/index.ts` | Socket.io transport config |
| `apps/api/src/controllers/staff.controller.ts` | View-As Redis usage, role change without token revoke |
| `apps/api/src/queues/*.queue.ts` | 8 BullMQ queue files with Redis connections |
| `apps/api/src/middleware/*-rate-limit.ts` | 8 rate limiter files with Redis connections |
| `apps/api/src/workers/*.worker.ts` | Worker files with Redis connections |
| `_bmad-output/planning-artifacts/security-audit-report-2026-03-01.md` | Prior audit (OWASP Top 10, post-Epic 6) |

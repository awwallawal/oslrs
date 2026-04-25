# Story 9.9: Infrastructure Security Hardening — WAF, Alerting & Field-Readiness

Status: backlog

<!-- Created 2026-04-12 during Story 9-8 dev-story session. Captures the full security posture assessment performed after Stories 9-7 (nginx headers + TLS hardening) and 9-8 (CSP nginx mirror). This story is BACKLOG — pick it up when computing resources and budget allow. Tasks are independently deployable: Task 1 alone delivers massive value in 30-60 minutes. -->

## Story

As the **Super Admin / platform operator**,
I want **the infrastructure security gaps identified in the 2026-04-12 security posture assessment closed — starting with Cloudflare WAF/CDN (30-min quick win), then centralized alerting, then automated vulnerability scanning**,
so that **the production site has defense-in-depth beyond code-level security: HTTP payload filtering blocks probing attacks, DDoS mitigation protects the 2GB VPS from volumetric floods, centralized alerting surfaces breaches within minutes instead of days, and recurring vulnerability scans catch regressions before attackers do**.

## Security Posture Assessment (2026-04-12)

### Current Grade: B+

Assessed after Stories sec2-1 through sec2-4 (Security Hardening Phase 2), Story 9-7 (nginx forward-fix + TLS hardening), and Story 9-8 (CSP nginx mirror). The code-level security is genuinely strong — the gaps are infrastructure and operational.

| Layer | Grade | What's covered | What's missing |
|---|---|---|---|
| **Code-level** | **A-** | RBAC per-route/controller with role isolation; JWT + httpOnly/secure/sameSite refresh cookies; Zod validation on all endpoints; CORS origin-locked; per-endpoint rate limiting (global + activation-specific); IDOR prevention (submission-respondent ownership checks); fraud detection engine with configurable thresholds; mass-assignment hardening (SEC-3); CSP enforcing on /api/* via Helmet (17 directives, sec2-3); CSP Report-Only on static HTML via nginx (9-8); dependency audit gate in CI; NIN uniqueness enforcement; offline-queue user isolation; Redis AUTH + localhost bind; Postgres localhost bind + credential rotation; Cloud Firewall (DO); 6 security headers + server_tokens off + TLS 1.2+ only. **25+ security stories/fixes across 9 epics.** | No Subresource Integrity (SRI) on third-party CDN resources (Google Fonts, hCaptcha JS loads without integrity hashes — a CDN compromise would inject code that CSP allows because the domain is allowlisted). No `'strict-dynamic'` CSP (requires nonce wiring through Vite build — multi-week effort, not this story). |
| **Infrastructure** | **B-** | TLS 1.2+/1.3 only (TLSv1 and TLSv1.1 disabled at nginx server block); `server_tokens off`; DO Cloud Firewall "OSLRS" active (port-level filtering); Redis rebound to 127.0.0.1 with AUTH; Postgres rebound to localhost with rotated credentials (`oslsr_user`/`oslsr_db`); CI deploy with `set -eo pipefail` + backup-test-reload nginx pattern; DO Spaces backups (daily + monthly). | **No WAF** — nginx exposed directly, no HTTP payload filtering (SQL injection in URL params, XSS in headers, path traversal attempts all reach Express unfiltered — Zod catches most but not all). **No DDoS mitigation** — rate limiting exists per-endpoint but a volumetric L3/L4 flood on the 2GB VPS would saturate bandwidth before rate limits engage. **Single-VPS SPOF** — no redundancy, no failover, no load balancer. |
| **Operational** | **C+** | 2-minute CSP rollback recipe documented; DO Spaces backups on schedule; infrastructure playbook (`docs/infrastructure-cicd-playbook.md`) covers deploy, nginx, CSP, CI; `docs/team-context-brief.md` has critical deployment notes; PM2 process management with auto-restart. | **No centralized logging/alerting** — PM2 logs to stdout on the VPS, no aggregation (ELK/Grafana Loki/Papertrail), no alerting on error rate spikes or anomalous patterns. The `/api/v1/csp-report` endpoint logs-and-drops — violations are invisible unless someone SSHs in and greps PM2 logs manually. A data breach or sustained attack would take hours to notice. **No recurring vulnerability scanning** — the pre-field security sweep (2026-04-06) was a one-time manual effort; no ZAP/Nuclei/OWASP Dependency-Check in CI. **No secrets management** — `.env` files on the VPS disk; if the VPS is compromised, all secrets (DB credentials, JWT signing keys, hCaptcha secret, S3 keys) are plaintext-readable. **Backup restore only tested once** (the 2026-04-04 `db:push:force` incident) — no regular restore drills. |

### Field-Readiness Assessment: READY

The site is field-ready for its current use case (Oyo State labour & skills registry with government staff + registered enumerators). Rationale:

1. **Attack surface is bounded** — no payment processing, PII limited to NIN/name/phone, user base is credentialed government staff (not open internet), domain is `.com.ng` (lower target profile than `.gov` or `.com`)
2. **Code-level security is comprehensive** — an attacker hitting the app layer faces RBAC + JWT + Zod + CORS + rate limiting + CSP + fraud detection. More hardened than most production government apps
3. **Remaining gaps are about SCALE, not BASELINE** — WAF and DDoS matter when you're a target; a labour registry in Oyo State is unlikely to attract sophisticated attackers before you have time to add Cloudflare
4. **Recovery is fast** — CSP rollback in 2 minutes, nginx backup-restore automatic, DO snapshots available, PM2 auto-restart on crash
5. **The CSP Report-Only phase IS field monitoring** — once real enumerators use the app, `/api/v1/csp-report` collects violations from real devices and browsers. Real signal for free
6. **VPS headroom exists** — 26% RAM utilization as of 2026-03-03. Current droplet supports initial field operations; upgrade only when monitoring triggers

**Recommended field launch sequence:**
1. Push to field now with current security posture
2. Add Cloudflare free tier within the first week (Task 1 below — 30 min, not blocking)
3. After 48 hours of field usage, promote CSP from Report-Only to enforcing (Story 9-8 Task 7)
4. Monitor CSP report endpoint for first 2 weeks — if clean, the CSP story is fully closed
5. Pick up Tasks 2-4 below when sprint capacity allows (nice-to-have, not blocking)

## Acceptance Criteria

1. **AC#1 — Cloudflare WAF/CDN active:** `curl -sI https://oyotradeministry.com.ng/ | grep -i 'cf-ray'` returns a Cloudflare ray ID, confirming traffic routes through Cloudflare's edge. `Server:` header shows `cloudflare` (or nginx behind CF, depending on config). The site loads correctly in a browser with no mixed-content or certificate errors.

2. **AC#2 — DDoS protection baseline:** Cloudflare dashboard shows "Under Attack Mode" toggle available and functional (test by enabling for 5 seconds, confirm the JS challenge page appears, then disable). Bot Fight Mode enabled. Rate limiting rules configured for `/api/v1/auth/*` (login/register — the most DDoS-able endpoints).

3. **AC#3 — Alerting pipeline wired (deferrable):** A new `/api/v1/admin/security-events` endpoint (super-admin only) returns the last 100 CSP violation reports + rate-limit trigger events + failed auth attempts, with timestamp + source IP + user-agent. Awwal can check this dashboard daily without SSHing into the VPS. Alternatively: Sentry free tier or Papertrail integration that emails on error-rate spikes.

4. **AC#4 — Automated vulnerability scan in CI (deferrable):** A new CI job runs `zap-baseline.py` (OWASP ZAP Docker baseline scan) against the staging/preview URL on every PR. Results are posted as a PR comment. Critical/High findings block the merge. Low/Medium findings are informational. False positives are suppressed via a `.zap-rules.conf` file in the repo.

5. **AC#5 — Secrets rotation runbook (deferrable):** `docs/infrastructure-cicd-playbook.md` gains a new Part 8: Secrets Management section documenting: current secret inventory (DB creds, JWT keys, hCaptcha, S3, CORS_ORIGIN), rotation procedure for each, and a recommendation for eventual migration to DO App Platform secrets or HashiCorp Vault (when budget allows).

6. **AC#6 — Zero regressions:** Full test suite passes after each task. Cloudflare proxy does not break any existing functionality (WebSocket upgrade through CF requires specific CF settings — verified in Task 1).

## Acceptance Criteria Priority Map

| AC | Priority | Effort | Can defer? | Why |
|---|---|---|---|---|
| AC#1 (Cloudflare) | **P0** | 30-60 min | No — do within first week of field launch | Closes the two biggest infrastructure gaps (WAF + DDoS) in one DNS change. Free tier. |
| AC#2 (DDoS config) | **P0** | 15 min | No — part of Cloudflare setup | Just toggling CF dashboard settings after AC#1 |
| AC#5 (Secrets runbook) | **P1** | 1-2 hours | Yes — document-only, no code | Captures institutional knowledge. Do before any team member leaves. |
| AC#3 (Alerting) | **P2** | 4-8 hours | Yes | Makes breaches visible. Important but not blocking field ops. |
| AC#4 (Vuln scanning) | **P2** | 4-6 hours | Yes | Catches future regressions. Important but not blocking field ops. |

## Prerequisites / Blockers

- **Cloudflare account** — Awwal needs to sign up at cloudflare.com (free tier sufficient). Requires access to the domain's DNS registrar to change nameservers.
- **DNS registrar access** — whoever controls `oyotradeministry.com.ng` DNS needs to update nameservers to Cloudflare's (CF provides the specific NS records during onboarding).
- **Story 9-8 CSP promotion** — ideally complete the CSP enforcing promotion before adding Cloudflare, to avoid debugging two changes at once. But not a hard blocker — Report-Only CSP works fine through Cloudflare.
- **No code blockers** — Tasks 1-2 are pure ops. Tasks 3-5 have no dependency on external services (Sentry/Papertrail are optional enhancements, not requirements).

## Tasks / Subtasks

- [ ] **Task 1: Cloudflare WAF + CDN setup** (AC: #1, #2, #6) — **P0, 30-60 min, no code changes**

  - [ ] 1.1 Sign up at cloudflare.com (free plan). Add `oyotradeministry.com.ng` as a site.
  - [ ] 1.2 Cloudflare will scan existing DNS records. Verify all records match what's currently configured at the registrar (A record → DO VPS IP `159.89.146.93`, any MX records for email, any TXT records for domain verification). Add any missing records.
  - [ ] 1.3 Update nameservers at the domain registrar to Cloudflare's NS records (CF provides these during onboarding — typically `NAME.ns.cloudflare.com` and `NAME2.ns.cloudflare.com`). DNS propagation takes 5 min to 48 hours (usually <1 hour for .com.ng).
  - [ ] 1.4 In Cloudflare dashboard → SSL/TLS → set mode to **Full (strict)** (the VPS already has a valid Let's Encrypt cert — CF validates it end-to-end). Do NOT use "Flexible" (that would serve HTTP between CF and the VPS, breaking HSTS).
  - [ ] 1.5 Enable **Always Use HTTPS** (SSL/TLS → Edge Certificates). This replaces the nginx HTTP→HTTPS redirect for clients that hit CF's edge first.
  - [ ] 1.6 Enable **Bot Fight Mode** (Security → Bots). Free tier includes basic bot detection.
  - [ ] 1.7 Verify **WebSocket support** — Cloudflare free tier supports WebSocket by default since 2014. Confirm by opening the live site in a browser, checking DevTools Network tab for `wss://oyotradeministry.com.ng/socket.io/` → 101 Switching Protocols. If CF blocks the upgrade, check CF dashboard → Network → WebSockets → ensure "On".
  - [ ] 1.8 **Critical: verify existing security headers survive CF proxy.** Run `curl -sI https://oyotradeministry.com.ng/` after DNS propagation. All 6 security headers + CSP Report-Only + Reporting-Endpoints should still be present. Cloudflare does NOT strip custom headers — but verify anyway. If any header is missing, check CF's "Transform Rules" for conflicting rules.
  - [ ] 1.9 **Verify Let's Encrypt cert renewal still works.** Certbot on the VPS uses HTTP-01 challenge (port 80). With Cloudflare proxying, the challenge request goes CF → VPS. This works IF Cloudflare's SSL mode is "Full (strict)" AND the `.well-known/acme-challenge/` path is not cached. Add a CF Page Rule: `oyotradeministry.com.ng/.well-known/*` → Cache Level: Bypass. Alternatively, switch certbot to DNS-01 challenge using the Cloudflare DNS API token (more robust long-term but requires API token setup).
  - [ ] 1.10 Test "Under Attack Mode" — enable in CF dashboard for 10 seconds. Confirm the JS challenge page appears in a fresh browser tab. Disable immediately. This validates the emergency DDoS button works. Document the toggle location in the playbook.
  - [ ] 1.11 Update `docs/infrastructure-cicd-playbook.md` with a new Part 7: Cloudflare section documenting: account credentials (who owns the CF account), DNS architecture (registrar → CF nameservers → CF proxy → VPS origin), SSL mode (Full strict), the Under Attack Mode toggle location, WebSocket verification procedure, cert renewal path, and any Page Rules created.
  - [ ] 1.12 Update `docs/team-context-brief.md` Critical Deployment Notes with: "Traffic routes through Cloudflare (free tier) — WAF + DDoS + CDN active. Under Attack Mode toggle in CF dashboard for emergencies. See Part 7 of the playbook."

- [ ] **Task 2: Cloudflare rate limiting for auth endpoints** (AC: #2) — **P0, 15 min, Cloudflare dashboard only**

  - [ ] 2.1 In Cloudflare dashboard → Security → WAF → Rate Limiting Rules, create a rule: `URI Path contains /api/v1/auth/` → Rate limit: 20 requests per 10 seconds per IP → Action: Block for 60 seconds. This supplements Express's per-endpoint rate limiting with a network-edge layer that blocks before traffic even reaches the VPS.
  - [ ] 2.2 Create a second rule: `URI Path contains /api/v1/csp-report` → Rate limit: 50 requests per 10 seconds per IP → Action: Block for 300 seconds. Prevents abuse of the CSP report endpoint as a reflection vector.
  - [ ] 2.3 Test by triggering a rate limit (rapid-fire `curl` in a loop) and confirming the CF block page appears. Document the rules in the playbook Part 7.

- [ ] **Task 3: Security event visibility dashboard** (AC: #3) — **P2, deferrable, 4-8 hours**

  > This task is deferrable. The current system logs CSP violations and rate-limit events to PM2 stdout. Task 3 makes them visible without SSH access. Pick this up when sprint capacity allows.

  - [ ] 3.1 Create `apps/api/src/services/security-events.service.ts` — in-memory ring buffer (last 500 events) with types: `csp-violation`, `rate-limit-triggered`, `auth-failed`, `auth-locked-out`. Events are written by the existing `/api/v1/csp-report` handler, the rate-limit `handler` callbacks, and the auth controller's catch blocks.
  - [ ] 3.2 Create `apps/api/src/routes/security-events.routes.ts` — `GET /api/v1/admin/security-events` (super-admin only, rate-limited to 12/min). Returns the ring buffer contents as JSON, newest-first.
  - [ ] 3.3 Create `apps/web/src/features/admin/pages/SecurityEventsPage.tsx` — simple table with columns: timestamp, type, source IP, user-agent, details. Auto-refresh every 30 seconds via TanStack Query `refetchInterval`. Add a nav link under the super-admin dashboard's System section.
  - [ ] 3.4 Tests: service unit tests (ring buffer push/evict/query), route integration test (auth guard + response shape), web component test (renders table, shows empty state).
  - [ ] 3.5 **Alternative (simpler):** skip the in-app dashboard and wire Papertrail or Sentry free tier instead. Papertrail: `remote_syslog2` daemon on VPS → Papertrail endpoint → email alerts on `"csp_violation"` or `"RATE_LIMIT_EXCEEDED"` patterns. Sentry: `@sentry/node` SDK, capture CSP violations as Sentry events, configure alert rules in Sentry dashboard. Either option is <1 hour setup. Document the choice in Dev Notes.

- [ ] **Task 4: Automated vulnerability scanning in CI** (AC: #4) — **P2, deferrable, 4-6 hours**

  > This task is deferrable. The pre-field security sweep (2026-04-06) was a one-time effort. Task 4 makes it recurring. Pick up when CI budget allows (ZAP Docker image adds ~2 min to CI runtime).

  - [ ] 4.1 Add a new CI job `security-scan` in `.github/workflows/ci-cd.yml` that runs after `test-api` passes (but does NOT block deploy — informational initially). Uses `ghcr.io/zaproxy/zaproxy:stable` Docker image with `zap-baseline.py -t https://oyotradeministry.com.ng -r report.html`.
  - [ ] 4.2 Create `.zap-rules.conf` in repo root to suppress known false positives (e.g., the `Server: nginx` information disclosure that we've accepted, the `X-Content-Type-Options` duplicate warning from static-asset location block headers).
  - [ ] 4.3 Parse ZAP output and post as a GitHub Actions job summary (or PR comment if running on PRs). Critical/High findings produce a `::warning` annotation. Low/Medium are informational.
  - [ ] 4.4 **Future upgrade path (when budget allows):** replace baseline scan with full active scan against a staging environment (not production — active scans send attack payloads). Requires a staging VPS or Docker-compose-based local stack.

- [ ] **Task 5: Secrets management runbook** (AC: #5) — **P1, deferrable, 1-2 hours, documentation only**

  - [ ] 5.1 Audit current secrets: enumerate every secret in `.env` on the VPS. Expected inventory (from project memory + infrastructure playbook):
    - `DATABASE_URL` (Postgres connection string with `oslsr_user` credentials)
    - `REDIS_URL` (with AUTH password)
    - `JWT_SECRET` + `JWT_REFRESH_SECRET` (hex, rotated 2026-04-04 in sec2-1)
    - `HCAPTCHA_SECRET_KEY`
    - `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` + `S3_BUCKET` + `S3_ENDPOINT` + `S3_REGION` (DO Spaces)
    - `CORS_ORIGIN`
    - `SUPPORT_URL`
    - `NODE_ENV`
    - Any others discovered during audit
  - [ ] 5.2 For each secret, document: last rotation date (if known), rotation procedure (step-by-step), blast radius if compromised (what an attacker gains), and rotation frequency recommendation.
  - [ ] 5.3 Add to `docs/infrastructure-cicd-playbook.md` as Part 8: Secrets Management.
  - [ ] 5.4 **Future upgrade path:** migrate secrets from `.env` files to either (a) DigitalOcean App Platform (if we move off raw VPS), (b) HashiCorp Vault (if we stay on VPS and need rotation automation), or (c) GitHub Actions secrets + SSH environment injection (lighter touch, already partially used for deploy). Document the trade-offs of each option.

- [ ] **Task 6: Traceability** (AC: none — process hygiene)
  - [ ] 6.1 `sprint-status.yaml`: transition `9-9-*` entry through status lifecycle as tasks are completed.
  - [ ] 6.2 Note in the entry comment which tasks were completed and which remain deferred, with reasoning.

### Review Follow-ups (AI)

_(To be populated by code-review workflow if/when this story is implemented.)_

## Dev Notes

### Pre-implementation: p95 false-alert fix (2026-04-12)

**Problem:** Production health-digest emails fired `api_p95_latency Critical 631` every 30 minutes. The VPS is low-traffic — fewer than 50 requests between digest intervals. A single slow request (cold PM2 restart, first DB connection, or SSR hydration probe) pushed p95 to 631ms with only ~20 samples in the rolling buffer. Statistically, p95 of 20 samples is noise, not signal.

**Fix:** `apps/api/src/middleware/metrics.ts` — `MIN_SAMPLES_FOR_P95 = 50`. Below this threshold `getP95Latency()` returns 0 (no alert). Above it, the existing rolling-buffer p95 calculation runs as before. The threshold was chosen because p95 needs at least ~40-50 data points to be statistically stable (rule of thumb: 1/(1-0.95) = 20 minimum, doubled for safety margin against clustering).

**Why this matters for 9-9:** The C+ operational security grade cites "no centralized logging/alerting" as the main gap. The health-digest system IS the current alerting mechanism. If it cries wolf every 30 minutes, operators learn to ignore it — exactly the alert-fatigue anti-pattern that makes breaches invisible. This fix ensures the alerts that DO fire are real.

**Also fixed:** Missing `zod` dependency in `packages/config/package.json` — runtime import error for config consumers using zod schemas.

**Files changed:**
- `apps/api/src/middleware/metrics.ts` — `MIN_SAMPLES_FOR_P95` threshold + test helpers
- `apps/api/src/middleware/__tests__/metrics.test.ts` — 7 tests (new file)
- `packages/config/package.json` — added `zod` dependency
- `pnpm-lock.yaml` — lockfile update

### Why this story exists

During Story 9-8's dev-story session (2026-04-12), Awwal asked three questions:
1. "Does the site need more security work before field deployment?"
2. "How do you grade the security?"
3. "Can we push to the field?"

The answers (B+ overall grade, field-ready NOW, with 4 infrastructure gaps that can be closed incrementally) warranted a dedicated story to capture the assessment and the actionable remediation plan so that when computing resources become available, no nuance is lost.

### The "Cloudflare solves two problems at once" insight

The two biggest infrastructure gaps — **no WAF** and **no DDoS mitigation** — are both closed by a single DNS change to Cloudflare's free tier. This is unusually high ROI:

| Gap | Without Cloudflare | With Cloudflare (free tier) |
|---|---|---|
| WAF | nginx exposes Express directly; SQL injection / XSS / path traversal in URL params reach the app (Zod catches most but not all) | CF's managed WAF rules filter OWASP Top 10 attack patterns at the edge before traffic hits the VPS |
| DDoS | Rate limiting exists per-endpoint but a volumetric L3/L4 flood saturates the 2GB VPS's bandwidth | CF absorbs volumetric traffic at their edge; only clean requests reach the VPS. "Under Attack Mode" adds a JS challenge during active attacks |
| CDN | All static assets served from the single VPS in DigitalOcean's datacenter | CF caches static assets at 300+ edge locations globally; reduces VPS bandwidth and improves LCP for geographically distant users |
| Bot detection | None | CF's Bot Fight Mode identifies and challenges automated traffic (scrapers, credential stuffers) |
| Analytics | None beyond PM2 logs | CF dashboard shows request volume, bandwidth, threat map, cached vs uncached ratio — instant visibility into traffic patterns |
| Cost | $0 | $0 (free tier) |
| Time to implement | N/A | 30-60 minutes (DNS change + dashboard config) |

The only gotcha: **Let's Encrypt cert renewal** through Cloudflare requires either a Page Rule to bypass CF's cache on `.well-known/acme-challenge/` OR switching certbot from HTTP-01 to DNS-01 challenge (using CF's DNS API token). Task 1.9 covers this explicitly.

### Why NOT to wait for Cloudflare before field launch

The assessment concludes "push to field now, add Cloudflare within the first week" rather than "add Cloudflare BEFORE field launch" because:

1. **DNS propagation is unpredictable** for `.com.ng` domains — could be 5 minutes, could be 48 hours. Blocking field launch on DNS propagation wastes calendar time.
2. **The code-level security is sufficient for initial field operations** — the user base during initial rollout is small (government staff, not the general public), the attack surface is bounded, and the fraud engine catches data-integrity attacks.
3. **Cloudflare's free WAF is probabilistic, not deterministic** — it catches common attack patterns but doesn't guarantee blocking all probes. Code-level defenses (Zod, RBAC, rate limiting) are the real protection layer; CF is belt-on-top-of-suspenders.
4. **Adding CF and fixing CF-related regressions simultaneously with field launch creates two variables** — better to launch first (one variable: "does the app work for real users?"), then add CF (second variable: "does CF proxy break anything?"), verifying each independently.

### What "B+" means in practice

The B+ grade is relative to the site's **threat model**, not to an abstract security standard:

- **Government labour registry in Oyo State** — not a financial institution, not a healthcare system, not a defense contractor. The data (NIN, name, phone, skills, survey responses) is sensitive but not high-value to sophisticated threat actors.
- **User base is credentialed** — enumerators, supervisors, clerks, and admins all require invitation + activation. Public users self-register but access is limited to their own profile + marketplace. No anonymous access to sensitive data.
- **The "A-" code security** means an attacker who gets past the infrastructure layer (no WAF) still faces 5+ independent code-level defenses. Compromising the app requires chaining multiple vulnerabilities (XSS bypass CSP AND bypass Zod validation AND escalate from their role to another role AND bypass IDOR checks) — this is a high bar.
- **The "C+" operational security** is the real risk — not that an attacker gets in, but that we **don't notice** for hours/days if they do. That's what Tasks 3 (alerting) and 4 (scanning) address.

### References

- Security Hardening Phase 2 (2026-04-04): sec2-1 through sec2-4 in sprint-status.yaml
- Story 9-7 (2026-04-11): nginx headers + TLS hardening, code review 11 findings all resolved
- Story 9-8 (2026-04-12): CSP nginx mirror, parity test, Report-Only deployed
- Pre-field security sweep (2026-04-06): `security-sweep-pre-field-2026-04-06` in sprint-status.yaml
- Infrastructure playbook: `docs/infrastructure-cicd-playbook.md` (Parts 1-6, to be extended with Parts 7-8)
- Project memory: VPS credentials (`project_vps_credentials.md`), backup storage (`project_backup_storage.md`), db:push:force data loss lesson (`feedback_db_push_force.md`)
- Cloudflare free tier docs: https://developers.cloudflare.com/fundamentals/
- OWASP ZAP baseline scan: https://www.zaproxy.org/docs/docker/baseline-scan/

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-12 | Story created as backlog with full security posture assessment + 6 tasks (2 P0 + 1 P1 + 2 P2 + 1 traceability). Field-readiness assessment: READY with Cloudflare recommended within first week. | Capture 9-8 session security assessment so no nuance is lost when resources become available |
| 2026-04-12 | **Pre-implementation fix: p95 latency false-alert suppression.** `apps/api/src/middleware/metrics.ts` — added `MIN_SAMPLES_FOR_P95 = 50` threshold. `getP95Latency()` now returns 0 when sample count < 50, preventing a single slow request on the low-traffic VPS from triggering Critical health-digest alerts (was: stuck at 631ms). Added `resetLatencyBuffer()` + `recordLatencySample()` test helpers. New `apps/api/src/middleware/__tests__/metrics.test.ts` — 7 tests covering zero/below-threshold/at-threshold/outlier/exact-production-scenario cases. | Production health-digest emails fired repeated `api_p95_latency Critical 631` alerts every 30 min. Root cause: on a low-traffic VPS, a single slow request (cold start or DB connection init) dominates the p95 with < 20 samples in the rolling buffer. The 50-sample minimum makes the statistic meaningful before it can trigger alerts. Directly addresses the C+ operational security grade — false-positive alert fatigue erodes trust in the monitoring system. |
| 2026-04-12 | **Bugfix: added missing `zod` dependency to `@oslsr/config` package.** `packages/config/package.json` + `pnpm-lock.yaml` updated. | Runtime import error when `@oslsr/config` consumers used zod schemas — dependency was consumed but not declared in the package's own `package.json`. |
| 2026-04-23 | **Subtask COMPLETE — Tailscale + SSH hardening (P0, per SCP 2026-04-22 scope expansion).** Tailscale installed on VPS (`oslsr-home-app` @ `100.93.100.28`) + laptop (`desktop-qe4lplq` @ `100.113.78.101`) under `lawalkolade@gmail.com` Free tier. Personal `id_ed25519` public key appended to `/root/.ssh/authorized_keys` (2 lines total: `github-actions-deploy` + `awwallawal@gmail.com`). Laptop `~/.ssh/config` created with `IdentitiesOnly yes` directive. `sshd_config` main + both drop-ins (`50-cloud-init.conf`, `60-cloudimg-settings.conf`) consistently set to `PasswordAuthentication no` + `PermitRootLogin prohibit-password` + `PubkeyAuthentication yes`. DO Cloud Firewall "OSLRS" SSH rule source narrowed from `0.0.0.0/0` + `::/0` to `100.64.0.0/10` (Tailscale CGNAT range only). fail2ban installed + enabled (default config: maxretry 5, bantime 10m, jail:sshd). Verified: (1) public-IP SSH → `Connection timed out` (2) key-disabled SSH → `Permission denied (publickey)` (3) Tailscale SSH → immediate login no password prompt. Emergency recovery runbook authored at `docs/emergency-recovery-runbook.md` (8 sections + panic-start block + quarterly drill). DO Web Console timed out on current ISP — confirmed as ISP WebSocket filtering issue, not VPS-side (both `serial-getty@ttyS0.service` and `droplet-agent.service` verified active). Alternative break-glass paths documented: DO Recovery Console + DO Snapshot + DO Support ticket. | Monday 2026-04-20 11:04 UTC brute-force attack from 14+ distributed IPs (`2.57.122.x`, `144.31.234.20`, `92.118.39.x`, `45.227.254.170`, `172.93.100.236`, `43.128.106.113`, `118.194.234.8`, `103.189.235.33`, `213.209.159.231`, `2.57.121.25`, `45.148.10.50`, `64.89.160.135`) hammering port 22 trying `root`, `ubuntu`, `oyotradeministry`, `test`, `user`, `hadi`, `amssys` drove CPU to 100% + Memory to 82% — monitoring alert fired as designed (Story 6-2), but detection-to-response was 19 hours. Pre-existing Story 9-9 backlog task (Cloudflare-only) didn't cover SSH surface; SCP 2026-04-22 expanded scope to include Tailscale + OS patching + port audit + app-layer rate-limit audit + backup encryption + alerting tier + logrotate + second super-admin + activity baseline + Cloudflare (domain-gated). This entry records completion of the P0 subtask; remaining 9 subtasks deferred to Bob's formal Story 9-9 regeneration after SCP-driven PRD/Architecture/UX amendments. |

### File List

**Expected created (Task 3 only, if implemented):**
- `apps/api/src/services/security-events.service.ts`
- `apps/api/src/routes/security-events.routes.ts`
- `apps/web/src/features/admin/pages/SecurityEventsPage.tsx`
- `.zap-rules.conf` (Task 4)

**Expected modified:**
- `docs/infrastructure-cicd-playbook.md` — Parts 7 (Cloudflare) + 8 (Secrets)
- `docs/team-context-brief.md` — Cloudflare note in Critical Deployment Notes
- `.github/workflows/ci-cd.yml` — new `security-scan` job (Task 4)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**No code changes for Tasks 1-2 (Cloudflare dashboard config only).**

### File List — Tailscale Hardening Subtask (2026-04-23)

**VPS-side state changes (not committed to repo — infrastructure configuration):**

- `/etc/ssh/sshd_config` — three directives enforced (see Change Log entry above)
- `/etc/ssh/sshd_config.d/50-cloud-init.conf` — `PasswordAuthentication yes` → `no`
- `/etc/ssh/sshd_config.d/60-cloudimg-settings.conf` — verified already `no`
- `/root/.ssh/authorized_keys` — appended 2nd line (`awwallawal@gmail.com` public key)
- `/usr/lib/systemd/system/tailscaled.service` — installed + enabled via `curl -fsSL https://tailscale.com/install.sh | sh`
- `/usr/lib/systemd/system/fail2ban.service` — installed + enabled via `apt install -y fail2ban`
- DO Cloud Firewall "OSLRS" — SSH rule source: `100.64.0.0/10` (CGNAT)
- DO droplet Tailscale hostname: `oslsr-home-app` (IP `100.93.100.28`)

**Laptop-side state changes (not committed to repo — local workstation configuration):**

- `C:\Users\DELL\.ssh\config` — new file with `oslsr-home-app` host definition, `IdentityFile ~/.ssh/id_ed25519`, `IdentitiesOnly yes`
- Tailscale Windows client installed + signed in to `lawalkolade@gmail.com`

**Repo files created:**

- `docs/emergency-recovery-runbook.md` — 8-section runbook + panic-start block + quarterly drill procedure

**Follow-up items flagged for later:**

- Remove `github_actions_deploy` private key from laptop (should exist only in GitHub Secrets — hygiene)
- Take DO droplet snapshot named `tailscale-hardening-complete-2026-04-23` (runbook §6.1 item 1)
- Reset + save VPS root password to password manager (runbook §6.1 item 3)
- Apply 51 pending OS updates + kernel 6.8.0-90 → 6.8.0-110 reboot (separate Story 9-9 subtask)
- PM2 restart counter 916+ over 89 days — separate Story 9-10 investigation

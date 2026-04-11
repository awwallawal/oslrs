# Story 9.7: Security Hotfix — NGINX Forward-Fix & Drizzle Upgrade Validation

Status: in-progress

<!-- Note: This story is a forward-fix + retroactive-traceability consolidation for two hotfix commits that shipped via another channel on 2026-04-11 (b352b41, 51cceea). The prior commits are already live on main and in production; this story does NOT re-implement them. It completes the work they started (nginx headers never actually reached prod) and restores traceability for the record. Run validate-create-story only if scope changes. -->

## Story

As the **Super Admin / platform operator**,
I want **the production NGINX configuration brought into the repo with security headers applied, deployed via CI, and the Drizzle ORM 0.30 → 0.45 upgrade validated against real Postgres before the next deploy**,
so that **the live site actually delivers the security headers that commit `b352b41` was supposed to add (currently cosmetic — shipped to orphan file `docker/nginx.conf` that the VPS never reads), the SQL-injection CVE patched in commit `51cceea` is runtime-validated, and both pieces of hotfix work are traceable in `sprint-status.yaml` alongside the rest of Epic 9**.

## Acceptance Criteria

1. **AC#1 — Live security headers on public HTML:** `curl -sI https://oyotradeministry.com.ng/` returns all 6 headers (`Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`) AND no `Server: nginx/1.24.0 (Ubuntu)` version line. Verified after CI deploy, output attached to Completion Notes.

2. **AC#2 — securityheaders.com grade A or better:** Full scan of `https://oyotradeministry.com.ng/` at `securityheaders.com` returns A or A+. Screenshot or text summary attached to Completion Notes.

3. **AC#3 — Deprecated TLS protocols disabled at server level:** The live `443` server block overrides the stock Ubuntu `ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3` (inherited from `/etc/nginx/nginx.conf` http block) with a local `ssl_protocols TLSv1.2 TLSv1.3` directive. `nmap --script ssl-enum-ciphers -p 443 oyotradeministry.com.ng` shows only TLSv1.2 and TLSv1.3 available. The main `/etc/nginx/nginx.conf` is NOT modified — override is purely at the server block level.

4. **AC#4 — Production NGINX config is repo-canonical:** A new file `infra/nginx/oslsr.conf` exists and contains the full production server block (HTTP→HTTPS redirect + HTTPS main server) with all security headers applied. The file is a verbatim drop-in replacement for `/etc/nginx/sites-available/oslsr` on the VPS — no extra indirection, no templating.

5. **AC#5 — `docker/nginx.conf` removed or clearly quarantined:** Either (a) `docker/nginx.conf` is deleted from the repo because it is orphaned and misleading, OR (b) renamed to `docker/nginx.dev.conf` with a header comment stating `# DEVELOPMENT CONTAINER ONLY — NOT USED IN PRODUCTION. Production nginx config lives at infra/nginx/oslsr.conf. See Story 9-7.` The decision is documented in Dev Notes with reasoning.

6. **AC#6 — CI/CD deploys nginx config automatically:** `.github/workflows/ci-cd.yml` deploy step runs, after the existing `sudo cp -r apps/web/dist/*` line, these two commands: `sudo cp infra/nginx/oslsr.conf /etc/nginx/sites-available/oslsr` then `sudo nginx -t && sudo systemctl reload nginx`. The `nginx -t` acts as a gate — if config is invalid, reload aborts and old config stays live (no site-down risk). A comment in the workflow file references Story 9-7.

7. **AC#7 — Drizzle upgrade runtime-validated:** Before the next CI deploy, `drizzle-kit push --dry-run` has been run against a schema copy of production and the output documented in Dev Notes. The diff is either empty (cleanest outcome) OR every non-empty diff entry is explained and classified as safe/unsafe. Integration tests (real Postgres, not mocks) pass for the Drizzle-heavy endpoints: `/api/v1/analytics/*`, `/api/v1/respondents/registry`, `/api/v1/fraud/clusters`, `/api/v1/submissions/*`.

8. **AC#8 — Traceability restored in sprint-status.yaml:** An entry for `9-7-security-hotfix-nginx-forward-fix-drizzle-validation` exists under Epic 9 in `sprint-status.yaml` (status transitions ready-for-dev → in-progress → review → done as the story progresses), AND a short note cross-references the prior commits `b352b41` and `51cceea` so git-log readers can find this story.

9. **AC#9 — Zero regressions:** Full test suite (`pnpm test`) passes after all changes. Baseline: 4,156+ tests (~1,779 API + ~2,377 web). Post-Drizzle-upgrade count should match baseline modulo any new tests added in this story.

## Prior Work Context

**⚠️ Read this before starting Tasks 1-5.** Two hotfix commits were shipped on 2026-04-11 via a separate channel without a BMad story. This story does **NOT** revisit their contents — it completes the work they started (nginx headers never reached prod) and validates the one piece that needs runtime confirmation (Drizzle upgrade).

### Commit `b352b41` — `fix(web): harden nginx security headers, clean public assets, add OG image`

| Change | Live in prod? | Status |
|---|---|---|
| `apps/web/public/robots.txt` — removed `/spike` dev route | ✅ Yes — `curl https://oyotradeministry.com.ng/robots.txt` confirms | **Done, out of scope** |
| `apps/web/public/sitemap.xml` — removed "Epic 7" internal comment | ✅ Yes | **Done, out of scope** |
| `apps/web/public/og-image.png` — 67,282-byte 1200×630 branded OG image | ✅ Yes — `curl -sI /og-image.png` returns 200 + `Content-Length: 67282` | **Done, out of scope** |
| `docker/nginx.conf` — 6 security headers + `server_tokens off` | ❌ **No — orphan file.** The VPS does NOT use `docker/nginx.conf`. It uses `/etc/nginx/sites-available/oslsr` (symlinked from `sites-enabled/`). Verified via `sudo nginx -T` on the VPS 2026-04-11. | **THIS STORY Task 2 fixes it** |

### Commit `51cceea` — `fix(deps): patch high-severity vulnerabilities in vite and drizzle-orm`

| Change | Live in prod? | Status |
|---|---|---|
| `drizzle-orm` upgraded `0.30.10 → 0.45.2` (fixes GHSA-gpj5 SQL injection) | ✅ Yes — deployed, CI audit gate passes | **Runtime validation needed (Task 1)** |
| `drizzle-kit` upgraded `0.21.2 → 0.31.10` | ✅ Yes — deployed | **Runtime validation needed (Task 1)** |
| `vite` pinned `>=7.3.2` via pnpm override (fixes GHSA-v2wj, GHSA-p9ff) | ✅ Yes — deployed | **Done, out of scope** |
| `package.json` overrides block updated with CVE references | ✅ Yes | **Done, out of scope** |

### Verified live production state as of 2026-04-11 14:22 UTC

```
$ curl -sI https://oyotradeministry.com.ng/
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)        ← leaks version
Content-Type: text/html
(NO HSTS, NO X-Frame-Options, NO X-Content-Type-Options, NO Referrer-Policy,
 NO Permissions-Policy, NO Content-Security-Policy)

$ curl -sI https://oyotradeministry.com.ng/api/v1/health
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)        ← same leak
Content-Security-Policy: default-src 'none'    ← from Express Helmet
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=15552000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
```

**Static HTML routes have zero security headers.** API routes get headers from Express Helmet middleware, not from nginx. This story fixes the static-HTML gap by adding headers at the nginx layer.

## Do Not Touch

The following are already correct in production and must NOT be revisited by the dev agent or code reviewer:

- ✅ `apps/web/public/robots.txt` — already fixed in `b352b41`, live in prod
- ✅ `apps/web/public/sitemap.xml` — already fixed in `b352b41`, live in prod
- ✅ `apps/web/public/og-image.png` — already shipped in `b352b41`, live in prod
- ✅ `package.json` overrides for vite, drizzle-orm, and CVE documentation — already fixed in `51cceea`, live
- ✅ `apps/api/package.json` drizzle-orm / drizzle-kit versions — already fixed in `51cceea`, live
- ✅ `apps/web/package.json` vite version — already fixed in `51cceea`, live
- ✅ `/etc/nginx/nginx.conf` on the VPS (main nginx config) — stays untouched. TLS protocol override is done at the server block level, NOT by editing the main http block.
- ✅ `/etc/nginx/sites-available/default` — inactive, not symlinked, do not modify or delete
- ✅ Existing CSP configuration in Express Helmet — API headers come from Helmet, do not duplicate at nginx
- ✅ Let's Encrypt cert renewal — `certbot renew` cron is already configured; this story does not touch it

## Prerequisites / Blockers

- **None blocking.** All captured state and prerequisites already verified 2026-04-11:
  - Prod nginx config captured in session (see Dev Notes § Real Production NGINX Config)
  - `sudo nginx -t` → passes (valid baseline)
  - `sudo -n nginx -t` → PASSWORDLESS OK (CI gate works)
  - `sudo -n systemctl reload nginx` → RELOAD OK (CI reload works)
  - Let's Encrypt cert paths confirmed: `/etc/letsencrypt/live/oyotradeministry.com.ng/fullchain.pem` and `privkey.pem`
  - Symlink confirmed: `/etc/nginx/sites-enabled/oslsr -> /etc/nginx/sites-available/oslsr`

## Tasks / Subtasks

- [x] **Task 1: Drizzle upgrade runtime validation** (AC: #7, #9) — **do this FIRST, before any file changes**

  > 🛑 **Dev agent: STOP here after reading Task 1 description and wait for Awwal to confirm the DO snapshot (Task 1.1) is complete before running Task 1.2.** Task 1.1 is a human-gated manual ops step. Do NOT auto-proceed past 1.1. If invoked in an autonomous loop, report "Waiting on Task 1.1 snapshot confirmation from Awwal" and halt.

  - [x] 1.1 **HUMAN-GATED:** Take a fresh DigitalOcean snapshot of the VPS (manual ops step — Awwal runs this in the DO control panel). Reason: memory file 2026-04-04 records that `db:push:force` has wiped prod data once — belt-and-braces before any schema touch. Awwal confirms completion in chat before dev agent proceeds to 1.2. **Confirmed by Awwal 2026-04-11.**
  - [x] 1.2 Ran `pnpm --filter @oslsr/api db:check` against local dev DB. Per agreement with Awwal, fast path used local dev Postgres (`oslsr_postgres` container) instead of pulling a prod backup, since the drizzle 0.30→0.45 upgrade has already shipped and CI ran `db:push` successfully on the last deploy. **Initial finding:** `db:check` flagged `drizzle/meta/0000_snapshot.json` and `0001_snapshot.json` as "not of the latest version, please run drizzle-kit up". Ran `pnpm exec drizzle-kit up` — pure format bump from snapshot version 6 → 7 (removed legacy `id`/`prevId` fields, added new v7 fields `policies`, `isRLSEnabled`, `checkConstraints`). No schema semantics changed. Re-ran `db:check` → `Everything's fine 🐶🔥`. See Dev Notes § Drizzle Dry-Run Output.
  - [x] 1.3 Diff classification: (a) `db:check` — now empty (safe), (b) `drizzle-kit up` modified only migration metadata (safe, expected upgrade path). No destructive DROP/ALTER TYPE operations in either.
  - [x] 1.4 Ran the 6 Drizzle-heavy service test files (adjusted filenames to match what actually exists in the repo — story listed approximate names):
    - `team-quality.service.test.ts`: 11/11 passed
    - `personal-stats.service.test.ts`: 11/11 passed
    - `survey-analytics.service.test.ts`: 33/33 passed
    - `respondent.service.test.ts`: 33/33 passed
    - `fraud-engine.service.test.ts`: 10/10 passed
    - `fraud-config.service.test.ts`: 9/9 passed
    - `submission-ingestion.integration.test.ts`: 5/5 passed (real-DB integration)
    - `submission-processing.service.test.ts`: 28/28 passed
    - **Total: 140/140 passed across 8 test files.**
  - [x] 1.5 Runtime smoke tests — instead of booting the dev server + auth (heavy), wrote a targeted tsx harness at `apps/api/scripts/drizzle-runtime-smoke.ts` that imports services directly and invokes 11 probes covering the fragile query shapes: `text = uuid` leftJoin, `::uuid` cast leftJoin with regex pre-check, standard `eq()` joins, `inArray()` helper empty+populated, `sql.execute` with `::uuid` casts, fraudDetections join, plus full service-level invocations of `RespondentService.listRespondents`, `getRespondentCount`, `TeamQualityService.resolveEnumeratorIds`, and `getTeamQuality` (empty-scope early return). **Result: 11/11 probes passed.** Harness retained for future drizzle upgrade validation.
  - [x] 1.5a **Interactive-prompt regression check.** Ran `pnpm --filter @oslsr/api db:push` against the live local dev DB (empty-diff path) — completed non-interactively with `[✓] Changes applied`. Then created throwaway DB `test_drizzle_push` via `docker exec oslsr_postgres createdb` and re-ran `db:push` against it (massive-diff path: empty DB → 22 tables created). **Also completed non-interactively with `[✓] Changes applied`** — 22 tables verified via `\dt`. drizzle-kit 0.31.10 does NOT prompt on either empty or large diffs. **Task 3.5 is NOT needed.** Cleaned up throwaway DB with `dropdb`.
  - [x] 1.6 No regressions found — all probes passed, all tests passed.
  - [x] 1.7 Summary written to Dev Notes § Drizzle Validation Results. Proceeding to Task 2.

- [x] **Task 2: Bring production nginx config into the repo** (AC: #3, #4, #5)
  - [x] 2.1 Created `infra/nginx/oslsr.conf` — verbatim content from Dev Notes § Target infra/nginx/oslsr.conf. Includes HTTP→HTTPS redirect, HTTPS main server with `http/2`, TLS hardening (`ssl_protocols TLSv1.2 TLSv1.3`, `ssl_prefer_server_ciphers on`), `server_tokens off`, 6 security headers, 1y immutable cache for fingerprinted static assets, `/api` reverse proxy, `/socket.io/` WebSocket proxy.
  - [x] 2.2 Local `nginx -t` not available on Windows dev env. Linted by eye against the captured prod config in Dev Notes § Real Production NGINX Config — all original directives preserved (root, index, try_files, cert paths, server_name, /80 redirect), additions are purely additive (http2, tls, headers, static cache block).
  - [x] 2.3 **Disposition: rename.** Grep results for `docker/nginx.conf` usage: (a) `docker/Dockerfile.web:12` — `COPY docker/nginx.conf /etc/nginx/conf.d/default.conf` (confirmed real consumer); (b) `docker/docker-compose.yml:19` builds `Dockerfile.web` for the `web-app` service; (c) no references in `.github/workflows/`; (d) `DEPLOYMENT.md:60` and `DECISIONS_DEPLOYMENT.md:12,14,41` are legacy docs referencing the file (not code, not CI). Since `Dockerfile.web` is referenced from `docker-compose.yml`, delete would silently break the dev container stack. Executed: `git rm docker/nginx.conf`, created `docker/nginx.dev.conf` with quarantine header comment, updated `docker/Dockerfile.web:12` → `COPY docker/nginx.dev.conf`. DEPLOYMENT.md and DECISIONS_DEPLOYMENT.md stale references deliberately left for a separate docs-cleanup pass (out of scope here).
  - [x] 2.4 Updated `docs/infrastructure-cicd-playbook.md` Part 5. Replaced the inline template config block (lines 264-333) with a pointer to `infra/nginx/oslsr.conf` plus a summary of what the file contains, the CI deploy wiring, and a first-time manual bootstrap path for new VPS provisioning.

- [x] **Task 3: Wire nginx deploy into CI/CD** (AC: #6)
  - [x] 3.1 Located the `Deploy to DigitalOcean VPS` step at `.github/workflows/ci-cd.yml:575`. Found the `sudo cp -r apps/web/dist/*` line at 598.
  - [x] 3.2 Inserted 4 lines (2 comment + 2 command) immediately after line 598, preserving the 12-space indentation of the surrounding `script: |` block. See `.github/workflows/ci-cd.yml:600-603`.
  - [x] 3.3 Verified indentation via re-read: new lines match surrounding indent level (12 spaces before each non-blank line).
  - [x] 3.4 Comment line at 600: `# Deploy nginx config (Story 9-7 — security headers + TLS hardening)` — grep-able for future devs.
  - [x] 3.5 **NOT NEEDED.** Task 1.5a confirmed drizzle-kit 0.31.10 does NOT prompt interactively on any diff (tested empty-diff + 22-table massive-diff paths). `ci-cd.yml:589` `pnpm --filter @oslsr/api db:push` stays as-is. Documented in Dev Notes § Drizzle Validation Results.

- [ ] **Task 4: Post-deploy verification** (AC: #1, #2, #9) — **blocked on merge+deploy**
  - [ ] 4.1 After merging to main and CI deploy completes, run `curl -sI https://oyotradeministry.com.ng/` and confirm all 6 security headers are present AND no `Server: nginx/1.24.0` version line appears. Attach raw output to Completion Notes.
  - [ ] 4.2 Run a fresh `securityheaders.com` scan for `https://oyotradeministry.com.ng/`. Capture the grade (target A or A+) and the specific header audit results. Attach to Completion Notes.
  - [ ] 4.3 Run `nmap --script ssl-enum-ciphers -p 443 oyotradeministry.com.ng 2>&1 | grep -E 'TLSv'` from local or VPS. Confirm only `TLSv1.2` and `TLSv1.3` are listed — TLSv1 and TLSv1.1 MUST NOT appear.
  - [ ] 4.4 Smoke-test the live site in a browser: homepage loads, `/dashboard` redirects to login, `/api/v1/health` returns 200, Socket.IO connects (check browser dev tools Network tab for `wss://` upgrade). Confirm the CSP hasn't broken any inline scripts or stylesheets.
  - [x] 4.5 Ran `pnpm test` locally post-changes. **Result: 1,806 API + 2,377 web = 4,183 tests pass (+ 8 skipped + 2 todo). Baseline was 4,156+ → +27 above baseline, zero regressions.** `drizzle-kit up` snapshot format bump did not affect any runtime test. See Dev Notes § Drizzle Validation Results.

- [x] **Task 5: Traceability restoration** (AC: #8)
  - [x] 5.1 Transitioned existing `9-7-*` entry in-place at `sprint-status.yaml:310` from `ready-for-dev` → `in-progress` (this session). Will transition `in-progress` → `review` after Task 4.1-4.4 live verification completes post-deploy. No entries duplicated or reordered.
  - [x] 5.2 Confirmed — the "# updated: 2026-04-11 - Story 9-7 added: ..." comment at `sprint-status.yaml:3` was already written when the story was drafted. Content accurate, no edit needed.
  - [x] 5.3 Added orphan-nginx.conf pitfall entry to `docs/team-context-brief.md` under "Critical Deployment Notes" (the closest existing section to the story's suggested "Recent Pitfalls / Infrastructure Gotchas"). Entry references `infra/nginx/oslsr.conf`, the rename to `docker/nginx.dev.conf`, and the `curl -sI` verification lesson.
  - [x] 5.4 Added note to `sprint-status.yaml` `epic-9-retrospective: optional` line (line 312) — if/when the retro runs, Story 9-7 should be an input, with two lessons captured: (1) orphan config files; (2) drizzle-kit snapshot version bump needing `drizzle-kit up` cleanup.

### Review Follow-ups (AI)

_Populated by code-review workflow 2026-04-11. 11 findings (2 HIGH, 4 MEDIUM, 5 LOW), all auto-fixed in the same session. Severity shown in brackets. `[x]` means the fix has been applied to the working tree; the story entry preserves the finding for sprint-status traceability._

- [x] **[AI-Review][HIGH] H1: `sudo cp` runs before `nginx -t`, staging a broken config on disk even when reload aborts.** Next cold reload (certbot renewal, reboot) would load the broken file and 503 the site. [`.github/workflows/ci-cd.yml:600-612`] — **Fix:** Restructured deploy block to backup → copy → test → reload, with automatic restore of the `.bak` on `nginx -t` failure. Combined with M2's `set -eo pipefail`, a bad config now fails the CI step loudly and leaves the prior good config on disk.
- [x] **[AI-Review][HIGH] H2: Duplicate security headers on `/api/*` — nginx server-level `add_header` inherited into `location /api`, colliding with Express Helmet's own HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy.** [`infra/nginx/oslsr.conf:56-80`] — **Fix:** Added a dummy `add_header X-Proxy-Upstream "api" always;` inside `location /api` and `location /socket.io/` to break nginx's add_header inheritance chain (per nginx rule: any add_header in a location disables inheritance). Helmet now owns API/WS response headers alone; no duplicates.
- [x] **[AI-Review][MEDIUM] M1: `location ~* \.(js|css|...)$` re-asserted only HSTS + X-Content-Type-Options, silently dropping X-Frame-Options, X-XSS-Protection, Referrer-Policy, and Permissions-Policy on every fingerprinted static asset.** [`infra/nginx/oslsr.conf:47-57`] — **Fix:** Re-asserted all 6 security headers inside the static-asset location block so cached JS/CSS/images/fonts carry the full header set. Comment updated to explain the inheritance rule.
- [x] **[AI-Review][MEDIUM] M2: Deploy bash script lacked `set -eo pipefail`, so `nginx -t` failure was swallowed and `pm2 restart oslsr-api` continued regardless, marking the whole deploy green.** [`.github/workflows/ci-cd.yml:564`] — **Fix:** Added `set -eo pipefail` as first line of the deploy `script: |` block. Combined with H1's if/else restore, any nginx validation failure now visibly aborts the deploy step with `::error::` annotation.
- [x] **[AI-Review][MEDIUM] M3: No backup/rollback of the previous `/etc/nginx/sites-available/oslsr` before overwrite, so a broken deploy required git revert + full redeploy cycle.** [`.github/workflows/ci-cd.yml:607-612`] — **Fix:** Deploy step now always writes `/etc/nginx/sites-available/oslsr.bak` before the overwrite. Automatic restore on `nginx -t` failure; manual rollback remains a one-liner (`sudo mv …bak …; sudo systemctl reload nginx`).
- [x] **[AI-Review][MEDIUM] M4: No CSP header on static HTML — the new config adds 6 headers but omits `Content-Security-Policy` entirely.** Helmet's CSP only covers `/api/*`, leaving the React SPA with no content-script policy. [`infra/nginx/oslsr.conf` + Dev Notes gap] — **Fix (documentation + follow-up story):** Added a new `CSP — Deliberately Deferred` subsection to Dev Notes explaining the scope decision and rationale. **Follow-up work escalated into dedicated Story 9-8 (`9-8-content-security-policy-nginx-rollout.md`, status `ready-for-dev`, 2026-04-11)** — discovery during this review pass revealed that Helmet already defines a production-enforcing CSP at `apps/api/src/app.ts:103-156` and the `/api/v1/csp-report` endpoint already exists, so the dedicated story scope narrowed from "multi-day nonce wiring" to "mirror Helmet policy at nginx layer + drift-protection parity test + Report-Only phase + single-line enforcing promotion". Story 9-8 blocked by 9-7 merge + successful post-deploy verification (Task 4.1-4.4).
- [x] **[AI-Review][LOW] L1: Smoke harness header comment claimed `text = uuid joins (respondent.service.ts:100)` and `::uuid casts in leftJoin (respondent.service.ts:103)` — both line refs were wrong (actual patterns live around `listRespondents` and `getSubmissionDetail`).** [`apps/api/scripts/drizzle-runtime-smoke.ts:5-8`] — **Fix:** Replaced line-number references with grep-able SQL fragments and method names. Won't rot further across future edits.
- [x] **[AI-Review][LOW] L2: `X-XSS-Protection: "1; mode=block"` is an obsolete header that modern browsers ignore and OWASP recommends disabling (set to `0`).** [`infra/nginx/oslsr.conf:35`] — **Fix:** Changed to `X-XSS-Protection "0" always;` at both server level and in the static-asset location block. Explanatory comment added pointing to CSP as the modern replacement.
- [x] **[AI-Review][LOW] L3: `Permissions-Policy` only disabled `camera`, `microphone`, `geolocation` — modern best practice covers many more directives and securityheaders.com grading rewards broader coverage.** [`infra/nginx/oslsr.conf:37`] — **Fix:** Expanded to `camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), accelerometer=(), autoplay=(), magnetometer=(), gyroscope=(), midi=(), picture-in-picture=()` at both server level and the static-asset location block. `(self)` retains same-origin camera/geolocation usage for the activation wizard selfie flow and the LGA map pickers.
- [x] **[AI-Review][LOW] L4: Stale references to `docker/nginx.conf` in `DEPLOYMENT.md:60` and `DECISIONS_DEPLOYMENT.md:12,14,41` — explicitly scoped out of the story Dev Notes as a separate cleanup pass, but the fix is trivial (4 lines across 2 files).** — **Fix:** Updated all 3 references in place: DEPLOYMENT.md troubleshooting section now points at `docker/nginx.dev.conf` and clarifies that host nginx is the real prod path. DECISIONS_DEPLOYMENT.md Risk A Implementation and Deployment Pack Deliverables list both reflect the rename + Story 9-7 history. Historical references to `docker/nginx.conf` in narrative prose (describing the orphan situation) deliberately preserved.
- [x] **[AI-Review][LOW] L5: `docker/Dockerfile.web:12` had no inline comment explaining why it COPIES `nginx.dev.conf` — a dev reading the Dockerfile had to follow the trail into the conf file to understand the "dev-container-only" intent.** — **Fix:** Added a 2-line comment above the COPY directive pointing at `infra/nginx/oslsr.conf` and the CI deploy wiring, closing the loop with zero extra file touches.

## Dev Notes

### Real Production NGINX Config (captured 2026-04-11 via `sudo nginx -T`)

**File on VPS:** `/etc/nginx/sites-available/oslsr` (1,694 bytes, last modified Feb 23 09:31, symlinked from `/etc/nginx/sites-enabled/oslsr`)

**User on VPS:** `root@oslsr-home-app`

**Current content (verbatim):**

```nginx
server {
    listen 80;
    server_name oyotradeministry.com.ng www.oyotradeministry.com.ng;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name oyotradeministry.com.ng www.oyotradeministry.com.ng;

    ssl_certificate /etc/letsencrypt/live/oyotradeministry.com.ng/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oyotradeministry.com.ng/privkey.pem;

    # Frontend - serve static files
    root /var/www/oslsr;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket proxy (Socket.IO)
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Main `/etc/nginx/nginx.conf` relevant bits (DO NOT MODIFY, just context):**
- `user www-data;`
- `worker_processes auto;`
- `# server_tokens off;` — **commented out** at line 60 (that's why version leaks)
- `ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;` — **includes deprecated TLSv1 and TLSv1.1** (http-block default, we override at server level)
- `gzip on;` — enabled globally, inherited

**nginx version:** `nginx/1.24.0 (Ubuntu)` built with OpenSSL 3.0.13, compiled with `--with-http_v2_module` (confirmed — http/2 upgrade is safe).

### Target `infra/nginx/oslsr.conf` (what Task 2 creates)

```nginx
# OSLRS production NGINX configuration
# Deployed automatically via .github/workflows/ci-cd.yml to /etc/nginx/sites-available/oslsr
# Source of truth — do NOT edit /etc/nginx/sites-available/oslsr directly on the VPS.
# Story 9-7: security headers + TLS hardening, 2026-04-11.

server {
    listen 80;
    server_name oyotradeministry.com.ng www.oyotradeministry.com.ng;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name oyotradeministry.com.ng www.oyotradeministry.com.ng;

    # SSL
    ssl_certificate /etc/letsencrypt/live/oyotradeministry.com.ng/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oyotradeministry.com.ng/privkey.pem;

    # TLS hardening — override stock Ubuntu http-block default at server level.
    # Main /etc/nginx/nginx.conf still lists TLSv1 TLSv1.1 — we disable them here
    # without touching the main file (surgical override).
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # Hide server version (main nginx.conf has server_tokens commented out)
    server_tokens off;

    # Security Headers — applied to ALL responses including static HTML and assets.
    # API responses (/api/*) get their own headers from Express Helmet middleware,
    # but nginx headers apply before the proxy so they cover static routes.
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(), geolocation=(self)" always;

    # Frontend — serve static React build
    root /var/www/oslsr;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static asset caching — 1 year immutable (Vite fingerprints filenames)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|woff)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        # Re-assert security headers on cached assets (add_header does not inherit into location blocks)
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Content-Type-Options "nosniff" always;
    }

    # API reverse proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket proxy (Socket.IO real-time notifications)
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Diff vs. current prod (what this config changes)

| Line | Prod now | New | Reason |
|---|---|---|---|
| `listen 443 ssl;` | plain | `listen 443 ssl http2;` | HTTP/2 perf upgrade, module compiled-in |
| `ssl_protocols` | inherited `TLSv1 TLSv1.1 TLSv1.2 TLSv1.3` | local override `TLSv1.2 TLSv1.3` | Disable deprecated protocols without touching main nginx.conf |
| `ssl_prefer_server_ciphers` | not set | `on` | Server chooses strongest cipher, resist client downgrade |
| `server_tokens` | inherited commented-out | explicit `off` | Hide nginx version from `Server:` header |
| 6 security headers | **none** | all 6 added | AC#1 — the actual goal of this story |
| Static asset block | not present | `location ~* \.(js|css|...)$` with 1y immutable cache | Performance win + re-assert critical headers on cached responses |

**Not changed:** `/api` proxy, `/socket.io/` proxy, `root`, `index`, `try_files`, cert paths, `server_name`, `/80` redirect. These stay exactly as-is in prod.

### CI/CD Wiring (Task 3 insertion)

Current ci-cd.yml deploy step (around line 598):

```yaml
          script: |
            cd ~/oslrs
            git pull origin main
            pnpm install --frozen-lockfile
            pnpm --filter @oslsr/api db:push
            cd apps/api && pnpm tsx scripts/migrate-audit-immutable.ts && cd ~/oslrs
            VITE_API_URL=${{ vars.VITE_API_URL || 'https://oyotradeministry.com.ng/api/v1' }} pnpm --filter @oslsr/web build
            sudo cp -r apps/web/dist/* /var/www/oslsr/
            pm2 restart oslsr-api
```

After Task 3, the step becomes:

```yaml
          script: |
            cd ~/oslrs
            git pull origin main
            pnpm install --frozen-lockfile
            pnpm --filter @oslsr/api db:push
            cd apps/api && pnpm tsx scripts/migrate-audit-immutable.ts && cd ~/oslrs
            VITE_API_URL=${{ vars.VITE_API_URL || 'https://oyotradeministry.com.ng/api/v1' }} pnpm --filter @oslsr/web build
            sudo cp -r apps/web/dist/* /var/www/oslsr/
            # Deploy nginx config (Story 9-7 — security headers + TLS hardening)
            sudo cp infra/nginx/oslsr.conf /etc/nginx/sites-available/oslsr
            sudo nginx -t && sudo systemctl reload nginx
            pm2 restart oslsr-api
```

**Why the `sudo nginx -t && sudo systemctl reload nginx` pattern is safe:**
- `nginx -t` tests config validity without touching the running process
- `&&` means reload only runs if test passes — malformed config aborts deploy, old config stays live
- `systemctl reload` (not `restart`) sends SIGHUP — nginx gracefully reloads workers with no connection drops
- `PASSWORDLESS OK` and `RELOAD OK` both verified on the VPS 2026-04-11 — the CI SSH user has NOPASSWD sudo for these operations (proven by existing `sudo cp` + `pm2 restart` steps already working)

### Drizzle Dry-Run Output

**Target DB:** local dev Postgres `oslsr_postgres` (healthy, 4 days uptime). Fast path per 2026-04-11 agreement with Awwal — skipped prod-backup pull since the upgrade already shipped via `51cceea` and CI ran `db:push` successfully on that deploy.

**Initial `db:check` run (before drizzle-kit up):**
```
$ pnpm --filter @oslsr/api db:check
drizzle\meta\0000_snapshot.json is not of the latest version, please run "drizzle-kit up"
drizzle\meta\0001_snapshot.json is not of the latest version, please run "drizzle-kit up"
Exit status 1
```

**Applied the drizzle-kit 0.31.10 upgrade path:**
```
$ pnpm exec drizzle-kit up
[✓] drizzle\meta\0000_snapshot.json
[✓] drizzle\meta\0001_snapshot.json
Everything's fine 🐶🔥
```

**Diff of `drizzle-kit up` output** (pure format bump, no schema semantics changed):
- `version`: `"6"` → `"7"`
- Removed legacy fields: `id`, `prevId` (no longer needed in v7)
- Added new v7 fields to every table: `"policies": {}`, `"isRLSEnabled": false`, `"checkConstraints": {}`
- Reordered some object properties (cosmetic only)
- Net: 348 insertions, 164 deletions across 2 JSON files; zero SQL changes

**Re-run `db:check` after upgrade:**
```
$ pnpm --filter @oslsr/api db:check
Everything's fine 🐶🔥
```

**Interactive-prompt regression test (Task 1.5a):**
```
# Empty-diff path (DB already in sync)
$ pnpm --filter @oslsr/api db:push
[✓] Pulling schema from database...
[✓] Changes applied

# Massive-diff path (empty DB → 22 tables)
$ docker exec oslsr_postgres createdb -U user test_drizzle_push
$ DATABASE_URL=postgres://user:password@localhost:5432/test_drizzle_push pnpm --filter @oslsr/api db:push
[✓] Pulling schema from database...
[✓] Changes applied
$ docker exec oslsr_postgres psql -U user -d test_drizzle_push -c "\dt"
[22 tables listed]
$ docker exec oslsr_postgres dropdb -U user test_drizzle_push
```

**Key insight:** `db:check` (static migration file validator) and `db:push` (live schema sync) use completely separate code paths in drizzle-kit 0.31.10. `db:check` is strict about the snapshot format; `db:push` ignores the snapshots entirely and introspects the live DB. That's why CI (which calls `db:push`) was unaffected by the outdated snapshot format.

### Drizzle Validation Results

| Check | Result |
|---|---|
| `db:check` (after `drizzle-kit up`) | ✅ Clean — `Everything's fine 🐶🔥` |
| `db:push` empty-diff prompt behavior (Task 1.5a) | ✅ Non-interactive |
| `db:push` massive-diff prompt behavior (Task 1.5a) | ✅ Non-interactive (22 tables created silently) |
| Drizzle-heavy service tests (8 files) | ✅ 140/140 passed |
| Runtime smoke harness (`drizzle-runtime-smoke.ts`) | ✅ 11/11 probes passed |
| `RespondentService.listRespondents` (real DB) | ✅ Executes cleanly |
| `RespondentService.getRespondentCount` (real DB) | ✅ Executes cleanly |
| `TeamQualityService.resolveEnumeratorIds` (real DB) | ✅ Executes cleanly |
| `TeamQualityService.getTeamQuality` empty-scope (real DB) | ✅ Executes cleanly |
| `text = uuid` leftJoin (respondent.service.ts:100 pattern) | ✅ No SQL error |
| `::uuid` cast leftJoin with regex pre-check (respondent.service.ts:103) | ✅ No SQL error |
| `inArray()` helper (production pattern after Story 9-6 refactor) | ✅ No SQL error |
| `sql.execute` with `::uuid` casts | ✅ No SQL error |

**Smoke-test iteration note:** The first run of the runtime smoke harness surfaced 3 "failures" — 2 were smoke-test bugs (I used raw `sql\`= ANY(${jsArray}::uuid[])\`` which Drizzle 0.45 serializes as a broken `ANY(($1)::uuid[])`, but production code uses `inArray()` helper exclusively after Story 9-6's refactor so this pattern never hits prod), and 1 was a signature mismatch (I passed a scope object to `getTeamQuality` which expects `enumeratorIds: string[]` as first arg — the service is designed to receive pre-resolved IDs from the controller). Both classes of issue were fixed in the harness, not the code. Production code paths are unaffected.

**Verdict:** ✅ **Safe to proceed to Task 2.** Drizzle 0.30→0.45 upgrade is runtime-validated. Task 3.5 (swap `db:push` → `db:push:force` in CI) is **NOT** needed — 0.31.10 doesn't prompt on either empty or large diffs. The `drizzle-kit up` snapshot format bump is a drive-by cleanup and must be committed as part of this story (otherwise `db:check` will keep failing for future developers).

### CSP — Deliberately Deferred (Review Follow-up M4, 2026-04-11)

The new `infra/nginx/oslsr.conf` intentionally does **NOT** set a `Content-Security-Policy` header on the static-HTML routes. This is a scope call, not an oversight — captured here so the reasoning isn't lost.

**Why no CSP yet:**
- A meaningful CSP for a Vite + React SPA requires nonce or hash-based `'strict-dynamic'` for every inline `<script>` and `<style>` the bundler injects. Vite's build output inlines a bootstrap script plus hydration state; a bare `default-src 'self'` would block the app from booting.
- Helmet's CSP is already wired on `/api/*` via Express middleware (confirmed in the Prior Work Context block — the API returns `Content-Security-Policy: default-src 'none'`). That's a separate concern and it works.
- The goal of Story 9-7 is to forward-fix the orphan-header problem from commit `b352b41` and validate the Drizzle upgrade from `51cceea`. Neither hotfix commit touched CSP, so adding CSP here would expand scope without being part of the restoration mandate.

**What a proper CSP rollout looks like (future story candidate):**
- Integrate `vite-plugin-csp` or equivalent to emit `script-src 'self' 'nonce-{random}'` during build, with the nonce written into a per-request placeholder served via an upstream rewrite.
- Audit every inline `<style>` from Tailwind/Radix and externalize where possible, or hash them into the policy.
- Add a `Report-Only` CSP header first, collect violation reports via `/api/v1/csp-report` for a week, then promote to enforcing.
- Target `default-src 'none'; script-src 'self' 'nonce-X' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'`.

**Interim state:**
- X-Frame-Options `SAMEORIGIN` (set at the nginx server level by this story) provides clickjacking protection equivalent to `frame-ancestors 'none'` for legacy browsers.
- Helmet still delivers CSP on all API routes.
- The static HTML gap is acknowledged and tracked. A dedicated story can pick this up in a later sprint without coupling to 9-7.

### Risks & Mitigations

- **R1: Drizzle 0.30 → 0.45 introduces silent schema drift or interactive-prompt hangs on next `db:push`.**
  Mitigation: Task 1.1 (fresh DO snapshot) + Task 1.2 (`db:check` drift inspection) + Task 1.5a (interactive-prompt regression check) + Task 1.6 (hard stop if diff is destructive) + Task 3.5 (conditional CI flip to `db:push:force` if prompts are observed). The CI deploy runs `pnpm --filter @oslsr/api db:push` on every push (`ci-cd.yml:589`) — we must NOT let a new deploy fire until both drift is clean AND prompt behavior is known.
  **Escalation path if R1 triggers:** Either (a) add explicit schema-pin file if drizzle-kit 0.31 detects drift from a cosmetic diff algorithm change, or (b) partial-revert of `51cceea` drizzle portion only and re-land as a dedicated story. Concrete revert snippet for option (b):
  ```bash
  # Revert drizzle-orm / drizzle-kit in apps/api/package.json ONLY
  # (leave vite pinned — that CVE fix is independent and working)
  pnpm --filter @oslsr/api add drizzle-orm@0.30.10
  pnpm --filter @oslsr/api add -D drizzle-kit@0.21.2
  pnpm install --frozen-lockfile=false
  git add apps/api/package.json pnpm-lock.yaml
  git commit -m "revert(deps): pin drizzle back to 0.30 pending 9-7 investigation"
  ```
  After a revert, re-run `pnpm test` and confirm test count returns to baseline before pushing. Document the revert in sprint-status.yaml under Story 9-7 notes and re-open the story with a new scope.

- **R2: `ssl_protocols` override at server level doesn't actually override http-block default.**
  Mitigation: Task 4.3 verifies via `nmap --script ssl-enum-ciphers`. Nginx's server-block `ssl_protocols` directive has been documented-supported since nginx 1.5.0 to override http-level defaults, so this should work. If `nmap` shows TLSv1/1.1 still accepted, fall back to also editing the main `nginx.conf` as a scope expansion (document in Completion Notes).

- **R3: CI nginx reload succeeds locally but fails in the appleboy/ssh-action whitespace-sensitive YAML.**
  Mitigation: Task 3.3 explicitly calls out indentation. After first CI run, tail the GitHub Actions log for the deploy step — any shell error in the nginx cp/reload will be visible there. Rollback path: revert ci-cd.yml deploy step changes only (no prod nginx damage because the `nginx -t` gate prevents reloading a broken config).

- **R4: `docker/nginx.conf` disposition breaks `docker/Dockerfile.web` build.**
  Confirmed as real: `docker/Dockerfile.web:12` reads `COPY docker/nginx.conf /etc/nginx/conf.d/default.conf`. A raw delete breaks the dev container build silently (no CI gate for docker image builds in `ci-cd.yml`). Mitigation: Task 2.3 default is now **rename to `docker/nginx.dev.conf`** with a one-line Dockerfile.web edit — keeps the dev container working and makes orphan-vs-prod intent explicit. Delete only if `Dockerfile.web` is confirmed unused across the repo (grep + CI + docker-compose check).

- **R5: Adding `http2` to listen directive breaks old clients.**
  Mitigation: HTTP/2 over TLS is universally supported by browsers since 2015. Clients that don't negotiate h2 fall back to HTTP/1.1 automatically. Zero risk in practice.

- **R6: `Permissions-Policy` header breaks the camera-capture flow used by staff onboarding (Story 1-5 live selfie).**
  Mitigation: The policy is `camera=(self), microphone=(), geolocation=(self)` — `(self)` explicitly allows same-origin usage. Same policy already in `docker/nginx.conf`. Task 4.4 smoke-tests the activation wizard camera capture on the live site to confirm.

### References

- [Source: `new_error.txt` lines 227-273 — captured production nginx config via `sudo nginx -T` on 2026-04-11]
- [Source: `new_error.txt` lines 275-297 — `nginx -t`, `nginx -V`, `sudo -n nginx -t`, `sudo -n systemctl reload nginx` verification]
- [Source: Git commits `b352b41` (nginx headers + public files) and `51cceea` (vite + drizzle CVE patches), pushed 2026-04-11]
- [Source: `docker/nginx.conf` — the orphan file being replaced by `infra/nginx/oslsr.conf`]
- [Source: `docs/infrastructure-cicd-playbook.md:264-333` — existing manual nginx setup documentation being superseded]
- [Source: `.github/workflows/ci-cd.yml:575-601` — existing deploy step being extended]
- [Source: `_bmad-output/implementation-artifacts/sprint-status.yaml:296-310` — Epic 9 current state, insertion point for AC#8 entry]
- [Source: project memory `feedback_db_push_force.md` — 2026-04-04 incident where `db:push:force` wiped production data, informing R1 mitigation]
- [Source: project memory `project_vps_credentials.md` — VPS is `root@oyotradeministry.com.ng` on DigitalOcean, 2GB Ubuntu 24.04]
- [Source: CVE references — GHSA-gpj5 (drizzle SQL injection), GHSA-v2wj + GHSA-p9ff (vite file read), both documented in `package.json` overrides]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context) — `claude-opus-4-6[1m]`

### Debug Log References

- **Task 1.2 initial `db:check` failure:** `drizzle\meta\0000_snapshot.json is not of the latest version, please run "drizzle-kit up"`. Resolution: ran `pnpm exec drizzle-kit up`, pure format bump from v6 → v7 (removed legacy `id`/`prevId` fields, added `policies`/`isRLSEnabled`/`checkConstraints` to every table). Re-run `db:check` → `Everything's fine 🐶🔥`.
- **Task 1.5 smoke harness first run:** 3 "failures" observed that were actually harness bugs, not real code issues:
  1. `sql\`${users.id} = ANY(${[]}::uuid[])\`` — Drizzle 0.45 serializes JS arrays bound to raw sql as single `$1` params, producing malformed `ANY(($1)::uuid[])` SQL. Production code uses `inArray()` helper exclusively after Story 9-6's refactor — raw `= ANY()` pattern never hits production. Harness updated to use the production pattern.
  2. `TeamQualityService.getTeamQuality({ role: 'super_admin', ... })` — wrong signature. The service expects `getTeamQuality(enumeratorIds: string[], params)` — the controller is responsible for pre-resolving scope via `resolveEnumeratorIds()`. Harness updated to chain them correctly.
- **Task 1.5a interactive-prompt check:** Ran `db:push` against (a) live dev DB (empty diff), (b) throwaway `test_drizzle_push` DB (empty → 22 tables). Both completed non-interactively with `[✓] Changes applied`. drizzle-kit 0.31.10 does NOT prompt. **Task 3.5 NOT needed.**

### Completion Notes List

**Drizzle 0.30 → 0.45 upgrade validation (Task 1):**
- `db:check` after `drizzle-kit up`: ✅ clean
- `db:push` interactive behavior: ✅ non-interactive on both empty-diff (dev DB) and massive-diff (empty → 22 tables) paths — Task 3.5 CI hardening not required
- Drizzle-heavy service tests: 140/140 pass across 8 files (team-quality, personal-stats, survey-analytics, respondent, fraud-engine, fraud-config, submission-ingestion.integration, submission-processing)
- Runtime smoke harness: 11/11 probes pass — covers `text=uuid` joins, `::uuid` casts, `inArray()`, `sql.execute`, real service-level invocations
- Verdict: drizzle 0.45 is runtime-safe; ship it.

**NGINX config brought into repo (Task 2):**
- New file: `infra/nginx/oslsr.conf` (real prod config + 6 security headers + `server_tokens off` + `ssl_protocols TLSv1.2 TLSv1.3` + `listen 443 ssl http2` + 1y immutable cache on fingerprinted static assets)
- `docker/nginx.conf` disposition: **renamed** to `docker/nginx.dev.conf` with quarantine header. Rationale: `docker/Dockerfile.web:12` references it via `COPY docker/nginx.conf /etc/nginx/conf.d/default.conf`, and `docker-compose.yml:19` builds `Dockerfile.web`. Delete would silently break the dev container stack. Rename keeps dev container working + makes orphan-vs-prod intent explicit. `Dockerfile.web:12` updated to `COPY docker/nginx.dev.conf`.
- `docs/infrastructure-cicd-playbook.md` Part 5: replaced inline template config (lines 264-333) with pointer to `infra/nginx/oslsr.conf`, CI deploy wiring reference, and first-time bootstrap instructions for new VPS provisioning.
- **Out of scope but noted:** `DEPLOYMENT.md:60` and `DECISIONS_DEPLOYMENT.md:12,14,41` still reference the old `docker/nginx.conf` filename. Deliberately left for a separate docs-cleanup pass — these are legacy reference docs, not code paths, and updating them would expand scope.

**CI wiring (Task 3):**
- `.github/workflows/ci-cd.yml:600-603` — 4 lines added to the `Deploy to DigitalOcean VPS` step, immediately after the `sudo cp -r apps/web/dist/*` line and before `pm2 restart oslsr-api`. Comment line references Story 9-7 for grep-ability. Indentation matches the surrounding 12-space literal block.
- `nginx -t && systemctl reload nginx` pattern — malformed config aborts reload, old config stays live, zero site-down risk.
- Task 3.5 (`db:push` → `db:push:force` swap): **NOT applied** — drizzle-kit 0.31.10 confirmed non-interactive in Task 1.5a.

**Test suite (Task 4.5):**
- API: 1,806 pass + 8 skipped (124 test files total, 122 passed + 2 skipped)
- Web: 2,377 pass + 2 todo (211 test files passed)
- **Combined: 4,183 passing tests**, baseline was 4,156+, net +27 above baseline, **zero regressions**

**Drizzle migration snapshot cleanup (out-of-scope but bundled):**
- `apps/api/drizzle/meta/0000_snapshot.json` and `0001_snapshot.json` upgraded from version `"6"` to `"7"` via `drizzle-kit up`. Purely a metadata format bump — no SQL semantics changed. Must be committed to prevent `db:check` failing for future developers on this repo.

**Reusable smoke harness (new tool, drive-by addition):**
- `apps/api/scripts/drizzle-runtime-smoke.ts` — 120-line tsx harness with 11 probes covering fragile Drizzle query shapes. Run via `pnpm tsx apps/api/scripts/drizzle-runtime-smoke.ts` against the local dev DB. Reusable for future Drizzle upgrade validation. Exit code 0 = all green, 1 = one or more probes failed.

**Remaining work (blocked on merge + CI deploy):**
- Tasks 4.1-4.4 (live post-deploy verification: curl headers, securityheaders.com grade, nmap TLS scan, browser smoke). Will run against `https://oyotradeministry.com.ng/` after CI completes the deploy. Results will be appended to this section and the story will transition to `review` status in `sprint-status.yaml` only after those verifications pass.

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-11 | Drizzle 0.30 → 0.45 runtime-validated: 140/140 service tests, 11/11 smoke probes, non-interactive `db:push` confirmed | Address Task 1 AC#7, AC#9 |
| 2026-04-11 | Upgraded drizzle migration snapshot format v6 → v7 via `drizzle-kit up` | Required for `db:check` to pass after drizzle-kit 0.31.10 upgrade |
| 2026-04-11 | Created `infra/nginx/oslsr.conf` — production-canonical nginx config with 6 security headers + TLS hardening + http/2 | AC#3, AC#4 |
| 2026-04-11 | Renamed `docker/nginx.conf` → `docker/nginx.dev.conf` with quarantine header; updated `docker/Dockerfile.web:12` accordingly | AC#5 |
| 2026-04-11 | Replaced `docs/infrastructure-cicd-playbook.md` Part 5 inline config with pointer to `infra/nginx/oslsr.conf` | Task 2.4 |
| 2026-04-11 | Added nginx deploy lines to `.github/workflows/ci-cd.yml` deploy step (post-frontend-copy, pre-pm2-restart) | AC#6 |
| 2026-04-11 | Added Drizzle runtime smoke harness `apps/api/scripts/drizzle-runtime-smoke.ts` | Reusable validation for future Drizzle upgrades |
| 2026-04-11 | Added orphan-nginx.conf pitfall entry to `docs/team-context-brief.md` Critical Deployment Notes | Task 5.3 |
| 2026-04-11 | Transitioned `sprint-status.yaml:310` `9-7-*` entry `ready-for-dev` → `in-progress`; added forward-looking Epic 9 retro input note at line 312 | Task 5.1, 5.4 |
| 2026-04-11 | **Code review pass — 11 findings (2H, 4M, 5L) all auto-fixed:** nginx location-block inheritance-break for /api + /socket.io (H2), backup→test→reload CI restructure with `set -eo pipefail` (H1/M2/M3), all 6 security headers re-asserted in static-asset block (M1), `X-XSS-Protection "0"` (L2), broader Permissions-Policy (L3), CSP-deferral rationale Dev Note (M4), smoke-harness comment rot fix (L1), Dockerfile.web explanatory comment (L5), stale `docker/nginx.conf` refs in DEPLOYMENT.md + DECISIONS_DEPLOYMENT.md corrected (L4). See `Review Follow-ups (AI)` section for per-finding detail. | Adversarial code review |

### File List

**Created:**
- `infra/nginx/oslsr.conf` — production nginx config (canonical source of truth)
- `docker/nginx.dev.conf` — dev-container-only nginx config with quarantine header (renamed from `docker/nginx.conf`)
- `apps/api/scripts/drizzle-runtime-smoke.ts` — 11-probe Drizzle runtime smoke harness (reusable)

**Deleted:**
- `docker/nginx.conf` — replaced by `docker/nginx.dev.conf` (content preserved + header added)

**Modified:**
- `docker/Dockerfile.web` — line 12: `COPY docker/nginx.conf` → `COPY docker/nginx.dev.conf`; plus 2-line explanatory comment above the COPY pointing at `infra/nginx/oslsr.conf` (code review L5 fix)
- `.github/workflows/ci-cd.yml` — initial nginx deploy lines added to `Deploy to DigitalOcean VPS` step, then restructured in code review to add `set -eo pipefail`, backup-before-overwrite, if/else restore on `nginx -t` failure (H1/M2/M3 fix)
- `infra/nginx/oslsr.conf` — created in Task 2, then code-review-hardened: location inheritance-break in `/api` and `/socket.io/` via dummy `add_header X-Proxy-Upstream` (H2), all 6 security headers re-asserted in static-asset block (M1), `X-XSS-Protection "0"` (L2), broader Permissions-Policy directive list (L3)
- `docs/infrastructure-cicd-playbook.md` — Part 5 (lines 264-333) replaced with pointer to `infra/nginx/oslsr.conf` and CI deploy wiring reference
- `docs/team-context-brief.md` — added orphan-nginx.conf pitfall entry to Critical Deployment Notes
- `apps/api/scripts/drizzle-runtime-smoke.ts` — header comment updated to use grep-able SQL fragments instead of drift-prone line numbers (L1 fix)
- `apps/api/drizzle/meta/0000_snapshot.json` — upgraded format v6 → v7 via `drizzle-kit up`
- `apps/api/drizzle/meta/0001_snapshot.json` — upgraded format v6 → v7 via `drizzle-kit up`
- `DEPLOYMENT.md` — line 60: stale `docker/nginx.conf` reference in 404 troubleshooting entry updated to `docker/nginx.dev.conf` + host nginx note (L4 fix)
- `DECISIONS_DEPLOYMENT.md` — Risk A Implementation and Deployment Pack Deliverables entries updated for the rename + Story 9-7 context (L4 fix)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — line 310 status `ready-for-dev` → `in-progress`; line 312 epic-9-retro note expanded with Story 9-7 lesson inputs
- `_bmad-output/implementation-artifacts/9-7-security-hotfix-nginx-forward-fix-drizzle-validation.md` — Status `ready-for-dev` → `in-progress`, all task checkboxes updated for Tasks 1-3, 4.5, 5, Dev Agent Record populated, code review findings + resolutions logged in Review Follow-ups (AI), CSP deferral rationale added to Dev Notes

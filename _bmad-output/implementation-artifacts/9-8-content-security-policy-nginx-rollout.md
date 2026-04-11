# Story 9.8: Content Security Policy — NGINX Static-HTML Rollout & Helmet Parity

Status: ready-for-dev

<!-- Created 2026-04-11 as a follow-up to Story 9-7 code review finding M4 (CSP deferred). Scope narrowed significantly once discovery confirmed that Express Helmet already defines and enforces a production-vetted CSP for /api/* in apps/api/src/app.ts:103-156. This story closes the static-HTML gap only — it does NOT redesign the policy. -->

## Story

As the **Super Admin / platform operator**,
I want **the existing production-vetted CSP (already enforcing on /api/* via Express Helmet) also applied to static HTML routes served directly by nginx, using a Report-Only phase first to catch any SPA-loading-phase violations, then promoting to enforcing once monitoring is clean**,
so that **XSS injection via compromised CDN, reflected input, or tampered static assets is blocked at the browser layer for the entire surface area — not just API responses — and we close the last remaining XSS-enforcement gap identified by Story 9-7's code review (finding M4)**.

## Acceptance Criteria

1. **AC#1 — nginx serves Report-Only CSP on all static HTML routes:** `curl -sI https://oyotradeministry.com.ng/` returns a `Content-Security-Policy-Report-Only` header whose directive list is identical to the production Helmet policy captured in `apps/api/src/app.ts:103-156` (modulo directive-ordering differences). The same header is present on `/dashboard`, `/register`, `/about/how-it-works`, and every other SPA route that falls through `try_files` to `index.html`.

2. **AC#2 — Report endpoint receives violations from both layers:** A synthetic CSP violation (e.g., `<script src="https://evil.example.com/x.js">` injected into a dev-only test route, or a deliberately blocked resource in Chrome DevTools via `Insert blocked URL`) results in a POST to `/api/v1/csp-report` with a 204 response. The existing endpoint at `apps/api/src/routes/csp.routes.ts` requires zero changes — this AC is a wiring verification, not new code.

3. **AC#3 — Policy parity between Helmet and nginx is test-enforced:** A new vitest integration test at `apps/api/src/__tests__/csp-parity.test.ts` reads both sources (Helmet directive object + `infra/nginx/oslsr.conf` text) and asserts that every directive in the Helmet policy is present in the nginx config's `Content-Security-Policy-Report-Only` value (and vice versa). Test fails the PR if the two drift. This is the anti-drift safeguard — a future dev who edits one without the other gets a loud red CI.

4. **AC#4 — SPA loading phase validated against nginx Report-Only in local Docker:** Spin up the dev container stack (`docker-compose up web-app`), point `docker/nginx.dev.conf` at the same Report-Only policy as prod, and smoke-test in Chrome DevTools with the Console open. Confirm: homepage loads, `/register` loads hCaptcha iframe, Google OAuth button renders, Socket.IO connects, activation wizard camera capture works, admin dashboards render (Radix UI runtime inline styles don't trip `style-src`), submission form submits. **Zero CSP violations in DevTools Console during any of these flows.** Attach a screenshot or console dump to Completion Notes.

5. **AC#5 — 7-day production Report-Only monitoring window:** After deploying the nginx Report-Only header to prod, collect `/api/v1/csp-report` violation logs for **7 calendar days** (2026-04-12 through 2026-04-18 assuming same-day merge). At the end of the window, produce a violation digest: unique `violated-directive` × `blocked-uri` tuples, grouped and counted. Attach to Dev Agent Record → Completion Notes.

6. **AC#6 — Violation classification and policy refinement:** Each unique violation from AC#5 is classified into one of: (a) **legitimate** → add to allowlist in both Helmet and nginx; (b) **bug** → fix the code (e.g., remove an inline event handler, move a <script> to external); (c) **noise** → document rationale and add to suppression list (e.g., browser extension injected scripts). Zero unclassified violations before promoting to enforcing.

7. **AC#7 — Promotion to enforcing is a single-line change:** After AC#6 clearance, the promotion is a single-line edit in `infra/nginx/oslsr.conf`: rename the header directive from `Content-Security-Policy-Report-Only` → `Content-Security-Policy`. Same value. CI deploys it. AC#1's curl check now shows the enforcing header. **The single-line nature of this step is the win** — it means policy iteration is free.

8. **AC#8 — Drift protection active in CI:** The parity test from AC#3 runs on every push. Simulated drift (manual edit of one directive in either source) causes the CI job to fail with a descriptive error pointing at both files. Verified via a deliberately-broken commit on a throwaway branch.

9. **AC#9 — CSP maintenance runbook in playbook:** `docs/infrastructure-cicd-playbook.md` gains a new `Part 5.2: Content Security Policy` section (or extends the existing one) that documents: (a) the two-source-of-truth problem and how the parity test protects it; (b) how to add a new third-party script domain (edit both Helmet and nginx, re-run parity test); (c) how to roll back from enforcing → Report-Only in under 2 minutes if a regression is found post-deploy; (d) how to interpret the `/api/v1/csp-report` violation payload.

10. **AC#10 — Traceability in sprint-status.yaml:** Entry for `9-8-content-security-policy-nginx-rollout` transitions `ready-for-dev` → `in-progress` → `review` → `done` as the story progresses. Comment references Story 9-7 (upstream finding M4) and captures the two-phase deploy date (Report-Only date + enforcing-promotion date).

11. **AC#11 — Zero regressions:** Full test suite (`pnpm test`) passes at every phase (after nginx Report-Only wiring, after parity test added, after enforcing promotion). Baseline: whatever 9-7's final count is at story start.

## Prior Work Context

### What already exists (do NOT redo)

- **Helmet CSP on /api/***: `apps/api/src/app.ts:103-156` — fully configured, enforcing in production (`reportOnly: process.env.NODE_ENV !== 'production'`), Report-Only in dev/test. Directive set:
  ```
  default-src 'self'
  script-src 'self' https://accounts.google.com https://hcaptcha.com https://*.hcaptcha.com
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://hcaptcha.com https://*.hcaptcha.com
  img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.digitaloceanspaces.com
  font-src 'self' https://fonts.gstatic.com
  connect-src 'self' {wsUrl} https://accounts.google.com https://hcaptcha.com https://*.hcaptcha.com https://cdn.jsdelivr.net
  frame-src https://accounts.google.com https://hcaptcha.com https://*.hcaptcha.com
  worker-src 'self' blob:
  media-src 'self' blob: mediastream:
  object-src 'none'
  base-uri 'self'
  form-action 'self'
  frame-ancestors 'self'
  report-uri /api/v1/csp-report
  report-to csp-endpoint
  upgrade-insecure-requests   (production only)
  ```
  This is the canonical policy. Story 9-8 does NOT change any directive — it mirrors them.

- **`/api/v1/csp-report` endpoint**: `apps/api/src/routes/csp.routes.ts:37` — rate-limited POST handler, accepts both legacy `application/csp-report` and modern `application/reports+json` payloads, returns 204. Production-ready. Story 9-8 does NOT touch this.

- **`Reporting-Endpoints` header**: `apps/api/src/app.ts:159-162` — middleware sets the `Reporting-Endpoints: csp-endpoint="/api/v1/csp-report"` header on every Express response. Story 9-8 must mirror this on nginx-served responses (one additional `add_header` line).

- **CSP test suite**: `apps/api/src/__tests__/csp.test.ts` — 8 tests validating the Helmet policy. Story 9-8 adds a 9th test file (`csp-parity.test.ts`) for the nginx⇔Helmet drift check, but does NOT modify the existing file.

- **Story 9-7 nginx scaffolding**: `infra/nginx/oslsr.conf` — the deploy plumbing (CI wiring, backup-test-reload, security-header inheritance breaks for /api and /socket.io) is already in place. Story 9-8 adds the CSP `add_header` line to the server-level and static-asset location blocks only. No CI changes.

### What's deliberately NOT in scope

- Refactoring the Helmet CSP to move its source-of-truth into a shared package. Tempting but scope-creep — the parity test is cheaper and achieves the same goal (no drift) without adding a new dependency graph.
- Strict CSP with `'strict-dynamic'` / nonces / hashes. The `'unsafe-inline'` style-src is already in production via Helmet because Radix UI, Tailwind's runtime styles, and the PERF-1 critical-CSS `<style>` block in `apps/web/index.html:47-118` all require it. Eliminating `'unsafe-inline'` is a multi-week project (externalize critical CSS without LCP regression, audit every Radix component, hash-pin every inline style, wire nonce generation through Vite build). Not this story.
- Changing the CSP reporting infrastructure. The current `/api/v1/csp-report` endpoint logs-and-drops; a proper reporting pipeline (Sentry integration, weekly digest cron, dashboard) is its own story.
- CSP for the dev container stack (`docker/nginx.dev.conf`). Dev containers are not user-facing and have different trust boundaries. Document the gap in Dev Notes; do not try to unify.

## Prerequisites / Blockers

- **9-7 merged to main.** Story 9-8 depends on the nginx scaffolding + CI deploy flow from 9-7. If 9-7 is still in review or blocked, 9-8 waits.
- **Production is stable post-9-7 deploy.** AC#1 post-deploy verification from 9-7 (all 6 security headers live, TLS hardening confirmed) must be green before layering CSP on top. Don't pile two security-header stories into one deploy window.
- **No blocker from external dependencies.** hCaptcha, Google OAuth, Google Fonts, OpenStreetMap, DO Spaces, cdn.jsdelivr.net are all already referenced by the Helmet policy and known to work. No new third-party integrations to research.

## Tasks / Subtasks

- [ ] **Task 1: Discovery — confirm parity target** (AC: #3)
  - [ ] 1.1 Read `apps/api/src/app.ts:103-156` and extract the Helmet CSP directive object as the canonical policy.
  - [ ] 1.2 Read `apps/web/index.html` end-to-end. Inventory every inline `<script>` (should be zero outside the Vite module entry at line 145), every inline `<style>` block (PERF-1 block at lines 47-118), every preconnect / preload to a third-party domain (Google Fonts at lines 42-44).
  - [ ] 1.3 Run the existing test suite `pnpm vitest run apps/api/src/__tests__/csp.test.ts` to confirm current CSP state before any changes. Record pass count.
  - [ ] 1.4 Build the web app (`pnpm --filter @oslsr/web build`) and grep the emitted `apps/web/dist/index.html` for any inline script tags other than the fingerprinted module entry. Record findings — if Vite inlined anything unexpected, call it out as a blocker and add a new directive to the parity policy.
  - [ ] 1.5 **Live-curl the production canonical policy** as ground truth: `curl -s -D - https://oyotradeministry.com.ng/api/v1/health | grep -i '^content-security-policy:'`. Compare directive-by-directive against the source object from 1.1. Any delta = implicit Helmet defaults that must be handled in Task 3 normalization. **Expected delta (already discovered in Story 9-7):** `script-src-attr 'none'` appears on the wire but not in source — fix by adding `scriptSrcAttr: ["'none'"]` to the source object explicitly (see sub-step 1.6).
  - [ ] 1.6 **Make implicit Helmet defaults explicit in `apps/api/src/app.ts:103-156`.** Add `scriptSrcAttr: ["'none'"]` to the directive list, matching the wire. Re-run Task 1.5 curl after deploy (or locally via supertest against the app.ts fixture) to confirm zero delta between source and wire. Update `apps/api/src/__tests__/csp.test.ts` to expect the new directive so the existing tests don't silently pass on a wrong shape.
  - [ ] 1.7 Summarize findings in Dev Notes § Discovery Results. Explicit pass/fail on "Helmet source object now matches the live wire policy byte-for-byte".

- [ ] **Task 2: Mirror CSP to nginx (Report-Only)** (AC: #1, #2)
  - [ ] 2.1 Edit `infra/nginx/oslsr.conf`. Add a single `add_header Content-Security-Policy-Report-Only "<full policy string>" always;` at the server level, below the existing 6 security headers (around line 40). The policy string must serialize the exact Helmet directive set from Task 1.1 in CSP syntax (directives separated by `; `, values space-separated within a directive). Use `wss://oyotradeministry.com.ng` for the `connect-src` WebSocket URL (hard-coded prod value — Helmet computes this at runtime from `CORS_ORIGIN`).
  - [ ] 2.2 Mirror the same CSP `add_header` into the static-asset `location ~* \.(js|css|...)$` block (per nginx inheritance rules already documented in 9-7 — any add_header in a location disables inheritance, so all security headers including CSP must be re-asserted there).
  - [ ] 2.3 Add `add_header Reporting-Endpoints 'csp-endpoint="/api/v1/csp-report"' always;` at both server level and the static-asset block — mirrors the Express middleware at `apps/api/src/app.ts:159-162` for nginx-served responses.
  - [ ] 2.4 Do NOT add CSP to the `/api` or `/socket.io/` location blocks — they already have their `X-Proxy-Upstream` dummy add_header to break inheritance (Helmet owns headers on those routes). CSP stays out of those locations by design.
  - [ ] 2.5 Validate nginx syntax locally with `docker run --rm -v "$PWD/infra/nginx:/etc/nginx/conf.d:ro" nginx:alpine nginx -t -c /etc/nginx/conf.d/oslsr.conf` (approximate — adjust for the config's server-block-only shape). If local nginx-t isn't available on Windows, rely on CI's `nginx -t` gate which 9-7 already added.

- [ ] **Task 3: Drift-protection parity test** (AC: #3, #8)
  - [ ] 3.1 Create `apps/api/src/__tests__/csp-parity.test.ts`. Import the Helmet CSP directive object from `apps/api/src/app.ts` (may need to export it as a named const first — a small refactor). Read `infra/nginx/oslsr.conf` as text via `fs.readFileSync`.
  - [ ] 3.2 Parse the `Content-Security-Policy-Report-Only` directive string from the nginx config into an object: `{ directive: [sources] }`.
  - [ ] 3.3 Write `expect(normalizeHelmet(helmetDirectives)).toEqual(normalizeNginx(nginxDirectives))`. Normalization must handle: (a) directive ordering (sort alphabetically), (b) source-list ordering (sort within each directive), (c) quote-style differences (normalize to single quotes), (d) the runtime-computed `wsUrl` in Helmet vs the hard-coded `wss://oyotradeministry.com.ng` in nginx (substitute `wsUrl` at compare time using a known `CORS_ORIGIN=https://oyotradeministry.com.ng` environment fixture), and (e) the conditional `upgrade-insecure-requests` (present in nginx always, present in Helmet only when `isProduction`; compare-time assume prod).
  - [ ] 3.4 **Handle Helmet implicit defaults (discovered via Story 9-7 live curl, see Dev Notes).** After Task 1.6 lands `scriptSrcAttr: ["'none'"]` explicitly in the Helmet source object, there should be zero implicit-directive drift between source and wire. Belt-and-braces: maintain a `HELMET_IMPLICIT_DEFAULTS` allowlist at the top of the parity test (initially empty after 1.6) that the normalizer augments the Helmet object with before comparison. If Helmet upstream ever adds a new implicit default in a future release, the parity test will fail against the nginx config; the fix is to add the new directive to the allowlist AND to the nginx config. Comment the allowlist with the discovery provenance so future devs know why it exists.
  - [ ] 3.5 Add 3 negative tests: (a) Helmet has a source nginx doesn't → test fails with a directive-named error; (b) nginx has a directive Helmet doesn't → test fails; (c) same directive, different source lists → test fails showing the diff.
  - [ ] 3.6 **Live-curl round-trip assertion (optional but recommended).** Add a test that invokes `app.ts`'s Express instance via supertest, reads the actual `Content-Security-Policy` header from a 200 response, parses it, and asserts it equals the normalized nginx policy. This catches the case where source code says X but the runtime emits Y (the exact class of mistake I fell into in Story 9-7 when I saw `default-src 'none'` on a 404 and wrongly concluded sec2-3 hadn't deployed).
  - [ ] 3.7 Run the test — it should pass against the Task 2 changes. If it doesn't, fix either Helmet or nginx until parity holds. Do NOT loosen the test to make it pass.

- [ ] **Task 4: Local SPA smoke test against Report-Only** (AC: #4)
  - [ ] 4.1 Start `docker-compose up web-app`. Confirm the dev container boots and serves the React app on `http://localhost:{dev-port}`.
  - [ ] 4.2 Temporarily copy the Report-Only CSP into `docker/nginx.dev.conf` (for this test only — revert before committing). Rebuild the container.
  - [ ] 4.3 Open Chrome DevTools → Console. Test each flow: home → click Register → complete hCaptcha → create account → log in → activate profile (camera capture) → navigate admin dashboards → submit a test form → log out. Watch for `Refused to load ... because it violates the following Content Security Policy directive: ...` messages.
  - [ ] 4.4 Revert `docker/nginx.dev.conf` changes. Document all observed violations in Dev Notes § Local Smoke Results, grouped by flow and directive.
  - [ ] 4.5 For each violation, determine if it's covered by the Helmet policy (if yes → nginx policy drifted from Helmet → fix Task 2 output → re-run Task 3 parity test → re-test) or genuinely missing (if yes → escalate: it probably means Helmet is also broken in prod but users don't see errors because prod is in enforcing mode and violations fail silently to the report endpoint).

- [ ] **Task 5: Deploy Report-Only to production** (AC: #1, #5)
  - [ ] 5.1 Merge to main. CI runs the Task 3 parity test (gate), the 9-7 nginx backup-test-reload flow deploys the new config.
  - [ ] 5.2 Post-deploy: `curl -sI https://oyotradeministry.com.ng/` → confirm `Content-Security-Policy-Report-Only` header is present with the expected directive string. Attach curl output to Dev Notes.
  - [ ] 5.3 Browser smoke: open the live site in Chrome incognito with DevTools Console. Repeat the Task 4.3 flow list against production. Any `Report-Only` violations print to the console but DO NOT block the flow — that's the whole point of Report-Only mode. Record what you see in Dev Notes.
  - [ ] 5.4 Start the 7-day monitoring window. Record start date.

- [ ] **Task 6: Monitoring and violation triage** (AC: #5, #6) — **calendar-gated, NOT dev-time**
  - [ ] 6.1 Day 1-7: no dev work required. Background production traffic accumulates violation reports at `/api/v1/csp-report`.
  - [ ] 6.2 On day 3 and day 7: SSH to the VPS and extract the CSP violation log from PM2 (`pm2 logs oslsr-api --lines 5000 --nostream | grep csp-report`). If the report endpoint writes to a file or Sentry, pull from there instead.
  - [ ] 6.3 Day 7: produce a violation digest table. Columns: `violated-directive`, `blocked-uri`, `source-file`, `line-number`, `user-agent`, count. Sort by count descending. Paste into Dev Notes § Violation Digest.
  - [ ] 6.4 Classify each unique row: **legitimate** (add to allowlist), **bug** (fix the code), or **noise** (document + ignore — typically browser extension injections). Zero unclassified rows before Task 7.

- [ ] **Task 7: Policy refinement and promotion to enforcing** (AC: #6, #7)
  - [ ] 7.1 For each legitimate-class violation from Task 6: add the source to BOTH the Helmet directive object in `apps/api/src/app.ts` AND the nginx policy string in `infra/nginx/oslsr.conf`. Re-run the Task 3 parity test after each edit.
  - [ ] 7.2 For each bug-class violation: fix the code (e.g., remove an inline `onclick`, move inline `<style>` to an external file, replace a `<script>eval(...)</script>` with a proper import). Test locally.
  - [ ] 7.3 For each noise-class violation: add a comment in Dev Notes explaining why it's suppressed.
  - [ ] 7.4 Re-deploy refined Report-Only. Short 48-hour re-monitoring window to confirm the fixes stick. If new unknowns appear, loop back to Task 6.
  - [ ] 7.5 **Promotion**: edit `infra/nginx/oslsr.conf` — rename `Content-Security-Policy-Report-Only` → `Content-Security-Policy` in both the server-level and static-asset location blocks. Single-line nature of this change is the payoff of all the preceding work.
  - [ ] 7.6 Merge. CI deploys. Post-deploy curl confirms the enforcing header is live.
  - [ ] 7.7 Browser smoke test one more time against enforcing prod. Any violation now BLOCKS the request — if a flow breaks, immediately revert via the playbook's 2-minute rollback recipe (Task 8 wrote that).

- [ ] **Task 8: Maintenance runbook** (AC: #9)
  - [ ] 8.1 Add a new `Part 5.2: Content Security Policy` section to `docs/infrastructure-cicd-playbook.md` (or extend existing CSP subsection). Content:
    - The two-source-of-truth problem (Helmet for /api, nginx for static HTML).
    - How the `csp-parity.test.ts` protects against drift — with a concrete example failure output.
    - **How to add a new third-party script domain:** edit both sources, run `pnpm vitest run csp-parity`, commit, push, CI deploys.
    - **2-minute rollback recipe:** SSH to VPS, edit `/etc/nginx/sites-available/oslsr` in-place to rename `Content-Security-Policy` → `Content-Security-Policy-Report-Only`, `sudo nginx -t && sudo systemctl reload nginx`. Then open a hotfix PR to persist the revert so the next CI deploy doesn't re-enforce.
    - **How to interpret a CSP violation report payload:** annotated JSON example, what each field means, common patterns.
    - **When NOT to add a new source:** if a new script is actually a dependency upgrade that brings its own CDN, consider bundling instead of allowlisting.
  - [ ] 8.2 Cross-link from `docs/team-context-brief.md` § Critical Deployment Notes — one line pointing at the new Part 5.2.

- [ ] **Task 9: Traceability restoration** (AC: #10)
  - [ ] 9.1 `sprint-status.yaml`: transition the `9-8-*` entry `ready-for-dev` → `in-progress` at story start, `in-progress` → `review` after Task 7 enforcing deploy, `review` → `done` after code review passes.
  - [ ] 9.2 Update the comment on the sprint-status entry with both deploy dates (Report-Only deploy + enforcing promotion), a one-line summary of any policy changes made during Task 7, and cross-references to Story 9-7 finding M4 (the upstream driver).

### Review Follow-ups (AI)

_(To be populated by code-review workflow after dev-story completes.)_

## Dev Notes

### Why this story exists

Story 9-7's code review (2026-04-11) flagged M4 — the new `infra/nginx/oslsr.conf` adds 6 security headers but omits `Content-Security-Policy`. At the time, the assumption was that a CSP rollout would be a multi-day project requiring nonce/hash wiring through the Vite build pipeline.

Discovery during that review turned up a critical nuance: **Express Helmet already defines and production-enforces a fully-featured CSP on `/api/*`** at `apps/api/src/app.ts:103-156`, including:
- 17 directives covering every third-party the SPA uses (hCaptcha, Google OAuth, Google Fonts, OpenStreetMap, DO Spaces, jsDelivr)
- `'unsafe-inline'` style-src that already permits the PERF-1 critical-CSS `<style>` block in `apps/web/index.html:47-118`
- `report-uri /api/v1/csp-report` + `report-to csp-endpoint` wiring to the existing endpoint at `apps/api/src/routes/csp.routes.ts:37`
- Production branch uses enforcing mode (`reportOnly: process.env.NODE_ENV !== 'production'`)

This means the React app has been running under this exact CSP for every API call in production since Story sec2-3 (2026-04-04). The policy is **already battle-tested** — we just need to apply it at a second layer.

The dedicated-story scope is therefore: **mirror the known-good Helmet policy at the nginx layer for static HTML**, with a Report-Only phase as insurance (in case nginx-served HTML paths have loading-phase behaviors that don't hit the API) and a parity test to prevent future drift between the two sources.

### Two-source-of-truth trade-off

Helmet (Express middleware) and nginx (add_header) are independent config systems. Ideally a CSP lives in ONE place. Options considered:

**Option A: Helmet owns it; nginx proxies everything including static HTML through Express.** Rejected — nginx serves static HTML 10x faster than routing through an Express static middleware. LCP would regress (we fought for sub-2.5s LCP in PERF-1).

**Option B: nginx owns it; remove Helmet CSP from Express.** Rejected — Helmet also sets other headers we rely on (HSTS on /api, frame-options, etc.) and its CSP has 11 months of field validation. Ripping it out to move source-of-truth is risky for a security header.

**Option C: Both layers, enforce parity via test.** Chosen — one test (`csp-parity.test.ts`) enforces the invariant at PR time. A dev who changes one side without the other gets a loud CI failure. The "drift" failure mode is the worst scenario (one layer strict, other loose — attacker uses the loose layer to probe), and the test closes it.

**Option D: Move CSP source into a shared `packages/security` module both Helmet and nginx consume at build time.** Deferred — adds a build step to the nginx deploy (template the conf file), creates a new internal package, longer path to done. Revisit if Option C's parity test proves fragile after 6+ months.

### The Report-Only phase — why bother?

The Helmet policy is already enforcing on `/api/*` in production. Why run a 7-day Report-Only phase for nginx?

**Because the SPA loading phase and the SPA runtime phase execute different code paths**, even if they share a policy:

- **Loading phase** (what nginx serves): browser parses `index.html`, executes the inline `<style>` block from PERF-1, preloads fonts from `fonts.gstatic.com`, fetches the Vite module entry, fetches chunked JS bundles, fetches CSS bundles, potentially fetches images referenced by bundled CSS (e.g., background images). All under the nginx-layer CSP if we set one.
- **Runtime phase** (what Express/Helmet serves): React is already hydrated; now it's making API calls, opening Socket.IO, loading hCaptcha iframe, Google OAuth popup, etc. Under Helmet's CSP.

If the loading phase tries to do something the runtime phase never does (e.g., a background-image `url()` in a bundled CSS file that points at an uncovered domain), the Helmet policy wouldn't have caught it historically. Report-Only for 7 days catches this without breaking users.

**Likelihood of finding something new**: low, because both phases share the same app bundle and the bundle is what drives both. But "low" is not "zero", and an enforcing CSP regression blocks the homepage for every visitor. The 7-day monitoring window is cheap insurance.

### Handling the runtime-computed `wsUrl`

Helmet computes the WebSocket connect-src at app startup:

```js
const wsUrl = isProduction
  ? corsOrigin.replace(/^https?:\/\//, 'wss://')
  : 'ws://localhost:3000';
```

In production, this resolves to `wss://oyotradeministry.com.ng` (after `CORS_ORIGIN=https://oyotradeministry.com.ng`).

nginx's `add_header` directive is a static string — we can't compute it at request time. So the nginx policy MUST hard-code `wss://oyotradeministry.com.ng` as a literal. If the production domain ever changes (Story 9-2 `domain-migration-oslrs-com`, currently deferred), the nginx policy must be updated in lockstep.

The Task 3 parity test handles this: the normalization function treats the Helmet `wsUrl` as a runtime placeholder and asserts the nginx value matches what `wsUrl` would resolve to given `CORS_ORIGIN=https://oyotradeministry.com.ng`. Document this in the test comments.

### Directive that DOESN'T mirror: `upgrade-insecure-requests`

Helmet adds `upgrade-insecure-requests` ONLY in production (`...(isProduction ? { upgradeInsecureRequests: [] } : {})`). nginx is always in production (the dev stack uses `docker/nginx.dev.conf`). So the nginx policy includes `upgrade-insecure-requests` unconditionally. Flag this as a legitimate asymmetry in the parity test — it's a conditional directive that only ever applies on one side in prod.

### Implicit Helmet directive that doesn't appear in the source config: `script-src-attr 'none'`

**Discovered 2026-04-11 via live curl** against `https://oyotradeministry.com.ng/api/v1/health` after the Story 9-7 drive-by `/api/v1/health` endpoint deployed. The live response header emits a 17-directive CSP that includes `script-src-attr 'none'` at the end — BUT this directive is NOT present in the source `directives: {...}` object at `apps/api/src/app.ts:103-156`. Helmet adds it as a built-in default on top of whatever the caller configures.

This matters for the Task 3 parity test: a naive implementation that imports the Helmet directive object and serializes it will produce a 16-directive string, while the deployed response has 17. If we mirror the 16-directive source into nginx literally and test "nginx parses to the same directive set as Helmet config", we'll match the source but NOT match the wire. Three options:

1. **Augment the parsed Helmet directive object with known Helmet implicit defaults before comparing.** A static allowlist of Helmet defaults: `script-src-attr: 'none'`, anything else we discover via curl. This surfaces future Helmet upstream changes (if a new major version adds another implicit directive, our static list drifts and the test fails loudly).
2. **Exclude implicit directives from the comparison by matching only user-configured ones.** Simpler but the parity test no longer catches drift between nginx and the actual wire policy — only between nginx and the source.
3. **Stop relying on Helmet defaults entirely — explicitly include `scriptSrcAttr: ["'none'"]` in `app.ts:103-156`** so the source and wire are 1:1. Cleanest long-term but touches api code that 9-8 otherwise doesn't need to touch.

**Recommendation for Task 3 implementation:** go with **Option 3** — one-line addition to `app.ts:103-156` to make `script-src-attr 'none'` explicit — AND implement **Option 1** as a backstop (static allowlist of known Helmet implicit defaults, currently empty after Option 3 lands but scaffolded for future upstream changes). Run a live curl against `/api/v1/health` as part of the test setup and cross-check against the static allowlist — fail loud if Helmet starts emitting a directive we don't know about.

**Cross-reference in parity-test comments:** note the discovery date, the live response quote from Story 9-7, and the `app.ts` line where the explicit `scriptSrcAttr` addition was made. Future devs reading the normalization function should be able to trace the "why" without excavating git history.

### Live-curl confirmation of the canonical Helmet CSP (2026-04-11)

From `curl -s -D - https://oyotradeministry.com.ng/api/v1/health` (post-9-7-drive-by deploy), confirming the full policy is enforcing in production:

```
Content-Security-Policy: default-src 'self';
  script-src 'self' https://accounts.google.com https://hcaptcha.com https://*.hcaptcha.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://hcaptcha.com https://*.hcaptcha.com;
  img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.digitaloceanspaces.com;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' wss://oyotradeministry.com.ng https://accounts.google.com https://hcaptcha.com https://*.hcaptcha.com https://cdn.jsdelivr.net;
  frame-src https://accounts.google.com https://hcaptcha.com https://*.hcaptcha.com;
  worker-src 'self' blob:;
  media-src 'self' blob: mediastream:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'self';
  report-uri /api/v1/csp-report;
  report-to csp-endpoint;
  upgrade-insecure-requests;
  script-src-attr 'none'                    ← Helmet implicit default (NOT in source)
```

This is the literal wire output — use it as the ground truth for nginx mirroring. Copy-paste into `infra/nginx/oslsr.conf` as the `Content-Security-Policy-Report-Only` value (after Task 7 promotion: just `Content-Security-Policy`). The hard-coded `wss://oyotradeministry.com.ng` in `connect-src` is the runtime-resolved `wsUrl` from the Helmet source config; the nginx mirror MUST hard-code this same literal (see "Handling the runtime-computed wsUrl" section above).

**Also visible on the live response but NOT part of CSP (contextual):**
- `Content-Security-Policy` is enforcing, not `-Report-Only` — confirms the ternary `reportOnly: process.env.NODE_ENV !== 'production'` is evaluating correctly in prod (CORS_ORIGIN env var → NODE_ENV=production → reportOnly false).
- `Reporting-Endpoints: csp-endpoint="/api/v1/csp-report"` — the middleware at `apps/api/src/app.ts:159-162` is active; the reporting endpoint is wired end-to-end.
- `X-Proxy-Upstream: api` — the Story 9-7 H2 fix is still visible on /api responses, confirming the nginx location-block inheritance-break is stable across deploys.

### Policy string serialization

nginx `add_header` takes a single string. The full CSP serialization from the Helmet directive set is ~600 characters. Nginx handles long header values fine (HTTP/1.1 limit is 8KB+ per header). But splitting it across multiple `add_header` lines with the same name won't work — nginx treats them as independent headers, producing multiple `Content-Security-Policy-Report-Only:` headers in the response, which browsers handle by treating each as independent (intersection of policies, not union). To avoid confusion and guarantee single-header emission, concatenate the full directive list into ONE `add_header` line.

### CSP reference material

- [MDN CSP directive reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy)
- [content-security-policy.com](https://content-security-policy.com/) — practical examples
- [Google's CSP evaluator](https://csp-evaluator.withgoogle.com/) — paste the policy, get a grade
- Helmet source: `apps/api/src/app.ts:103-156` (the canonical policy for this project)
- Existing test: `apps/api/src/__tests__/csp.test.ts` — shape / directive expectations
- Existing report endpoint: `apps/api/src/routes/csp.routes.ts` — receives POSTs, logs and returns 204

### Risks & Mitigations

- **R1: Report-Only phase surfaces a violation in a flow I didn't smoke test.**
  Mitigation: Tasks 4.3 and 5.3 run the full feature matrix, but users hit paths we miss. The 7-day monitoring window gives real users time to hit obscure flows. If a violation appears in the report endpoint that didn't appear in smoke tests, Task 6.4 classification catches it before promotion.

- **R2: A legitimate third-party script starts serving from a new domain mid-monitoring window without warning.**
  Example: hCaptcha rotates assets to `https://newcdn.hcaptcha.com`. Pre-enforcing, this shows as a Report-Only violation and users are fine. Post-enforcing, users get a broken captcha and can't sign up. Mitigation: the 2-minute rollback recipe (Task 8.1) turns this into a 2-minute hotfix, not a full day. Also: hCaptcha's docs list their CDN domains, and the current `https://*.hcaptcha.com` wildcard already covers subdomain rotation.

- **R3: The parity test is too loose — drift slips through.**
  Mitigation: Task 3.4 requires three negative tests covering the three drift modes. Task 3.5 explicitly forbids loosening the test to make it pass. A code reviewer should re-check the normalization function; any place it discards information is a potential drift-hiding seam.

- **R4: Parity test is too tight — noise fails the build.**
  Example: Helmet's JS directive object order is alphabetical, but nginx CSP string puts `default-src` first. The test normalizes by sorting directives alphabetically — so ordering doesn't matter. Also sort source lists within each directive. If the test still flags a false positive, add to the normalization function with a code comment explaining why.

- **R5: PERF-1 critical-CSS `<style>` block trips `style-src 'self'` because it's inline.**
  The Helmet policy already has `style-src 'self' 'unsafe-inline'`. `'unsafe-inline'` permits the `<style>` block. This is a scope-controlled acceptance — it weakens style-src but the trade-off was made for LCP. Future story candidate: hash-pin the inline style block via `'sha256-...'` and remove `'unsafe-inline'`. Not this story.

- **R6: `docker/nginx.dev.conf` drifts from `infra/nginx/oslsr.conf` CSP.**
  Dev containers don't get the parity test because it compares Helmet against the PROD nginx file. The dev conf is out of scope. Mitigation: Task 8.1 runbook explicitly says "dev and prod nginx are different config paths; do not try to unify". If a dev container-specific CSP issue appears, it's an inconvenience, not a production risk.

### References

- Story 9-7 code review finding M4 (CSP deferral) — `_bmad-output/implementation-artifacts/9-7-security-hotfix-nginx-forward-fix-drizzle-validation.md` § Review Follow-ups (AI)
- Story sec2-3 application security hardening — where the Helmet CSP was originally added (sprint-status.yaml:294)
- `apps/api/src/app.ts:103-162` — canonical CSP policy + Reporting-Endpoints middleware
- `apps/api/src/routes/csp.routes.ts` — /api/v1/csp-report endpoint
- `apps/api/src/__tests__/csp.test.ts` — existing Helmet CSP tests (8 tests)
- `apps/web/index.html` — inline critical CSS block (PERF-1 Round 3), Google Fonts preconnects
- `infra/nginx/oslsr.conf` — nginx config created in Story 9-7, extended here
- `.github/workflows/ci-cd.yml:575-618` — deploy flow with backup-test-reload pattern from 9-7
- `docs/infrastructure-cicd-playbook.md` Part 5 — nginx section to extend in Task 8

## Dev Agent Record

### Agent Model Used

_(Populated by dev agent on story start.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### Change Log

_(Populated during implementation.)_

### File List

**Expected created:**
- `apps/api/src/__tests__/csp-parity.test.ts` — Helmet⇔nginx policy drift detection test (AC#3, AC#8)

**Expected modified:**
- `infra/nginx/oslsr.conf` — add Content-Security-Policy-Report-Only + Reporting-Endpoints at server level and in static-asset location block (AC#1)
- `apps/api/src/app.ts` — export the CSP directive object as a named const so the parity test can import it without duplication (minor refactor, Task 3.1)
- `docs/infrastructure-cicd-playbook.md` — new Part 5.2 CSP section (AC#9)
- `docs/team-context-brief.md` — cross-link to Part 5.2
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status transitions + comment updates (AC#10)
- `_bmad-output/implementation-artifacts/9-8-content-security-policy-nginx-rollout.md` — Dev Agent Record population, task checkboxes, Completion Notes, violation digest, final file list

**Not expected to change (but cross-checked):**
- `apps/api/src/routes/csp.routes.ts` — existing endpoint, already prod-ready
- `apps/api/src/__tests__/csp.test.ts` — existing test suite, should keep passing
- `docker/nginx.dev.conf` — deliberately out of scope
- `.github/workflows/ci-cd.yml` — deploy flow unchanged; parity test runs in the existing test job, not a new step

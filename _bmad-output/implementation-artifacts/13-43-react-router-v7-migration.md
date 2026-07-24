# Story 13-43: react-router 6 → 7 migration — retire the compounding accepted-risk debt

Status: ready-for-dev

<!-- Authored 2026-07-24 by Bob (SM), EMERGENT from the 649af26 deploy-blocker. react-router 6.30.4 is on a security-EOL trajectory: the team moved to v7 and does NOT backport security fixes to 6.x. On 2026-07-24 three newly-disclosed advisories (GHSA-337j-9hxr-rhxg SSR-hydration, GHSA-wrjc-x8rr-h8h6 + GHSA-jjmj-jmhj-qwj2 open-redirect→XSS) had NO in-major-6 fix, so they were accepted-risk in osv-scanner.toml WITH an app-layer mitigation (`lib/safe-redirect.ts`). That is a holding pattern, not a resolution: EVERY future 6.x advisory will do the same — block the OSV prod-gate, force another accept-risk, maybe another mitigation. This story ends the debt at the root by migrating to v7 (where the fixes live). POST-LAUNCH, NON-GATING — the current advisories are already mitigated, so there is no launch pressure; do it deliberately, with the codemod + full regression, NOT reactively per-advisory. -->

## Story
As **a maintainer of the web app's routing + security posture**,
I want **react-router migrated from 6.30.4 to 7.x**,
so that **the open-redirect/SSR advisories are fixed at source, the accepted-risk entries + the pinned `<7` override are removed, and future 6.x advisories stop compounding into per-CVE holding patterns.**

## Context & Evidence
- **6.x is security-EOL for us.** The 2026-07-24 advisories are fixed only in 7.18.0 / 7.13.0 — no 6.x backport exists (verified via osv-scanner `fixed` events). react-router's maintenance moved to v7.
- **The current holding pattern (649af26):** `osv-scanner.toml` accepts GHSA-337j / GHSA-wrjc / GHSA-jjmj with reasons; `apps/web/src/lib/safe-redirect.ts::toSafeInternalPath` guards all 4 post-auth `navigate(redirectTo)` sites (login / password-reset / MFA / ProtectedRoute). This closes the *exploitable* vector, but leaves react-router itself unpatched.
- **Why it compounds:** each new 6.x advisory → OSV prod-gate red (react-router-dom is in the `--prod` closure) → another accept-risk + risk assessment. That is recurring toil with a shelf-life.
- **Why v7 was feared:** the 9-54 footgun — an UNBOUNDED override once *accidentally* resolved react-router to 7.x and broke the web build (`MemoryRouterProps`). That was an unintended jump, NOT a migration. A DELIBERATE v7 migration (codemod + fix the handful of breaks) is a different, bounded exercise: for a library-mode SPA (BrowserRouter + `<Routes>`), v7 largely preserves the v6 API.

## Acceptance Criteria
1. **AC1 — Migrate to react-router 7.x.** Bump `react-router` + `react-router-dom` to `^7.x` in `apps/web` (and any other package that declares them); run the official v6→v7 codemod; fix the resulting breaks (the known `MemoryRouterProps` type change + any data-router/API renames). The web build (`NODE_ENV=production`) is green.
2. **AC2 — Remove the override + the accepted-risks.** Delete (or re-bound to `<8`) the `react-router: >=6.30.4 <7` override in `package.json`; remove the 3 react-router `[[IgnoredVulns]]` entries from `osv-scanner.toml`. The OSV prod-gate is green WITHOUT them (the v7 versions carry the fixes) — this is the proof the debt is actually retired, not relabeled.
3. **AC3 — KEEP the safe-redirect guard.** `toSafeInternalPath` stays and stays applied at all navigation sites — defense-in-depth (never rely solely on the library to sanitize redirect targets); its tests stay green. (Only the react-router *accept-risk* goes away, not the app-layer control.)
4. **AC4 — No routing/navigation regressions.** Full web suite green; manual/e2e smoke of the high-risk flows: login redirect-to-`from`, ProtectedRoute gating + unauthorized redirect, MFA challenge → dashboard, password-reset → login, public wizard routes, and the dashboard role-based redirect (`DashboardRedirect`). Deep-link + refresh on a protected route still works.
5. **AC5 — Gates + parity.** Web tsc + eslint + full suite green; `NODE_ENV=production` build green (Pitfall #40); planning-artifact parity (sprint-status + this story + note the osv-scanner.toml + package.json edits). SARIF/report-tier no longer shows the react-router findings.

## Tasks / Subtasks
- [ ] **Task 1 (AC1)** — bump react-router + react-router-dom to ^7; run `npx react-router-codemod` (or the documented upgrade steps); fix breaks (`MemoryRouterProps`, any `RouterProvider`/loader API drift). Build green.
- [ ] **Task 2 (AC2)** — remove the `react-router` override + the 3 `osv-scanner.toml` accept-risks; run the OSV prod-gate locally → green without them.
- [ ] **Task 3 (AC3)** — confirm `toSafeInternalPath` + its 4 call sites + tests are unchanged/green (do NOT remove them).
- [ ] **Task 4 (AC4)** — full web suite + a routing smoke pass over the flows in AC4; fix any regressions.
- [ ] **Task 5 (AC5)** — `NODE_ENV=production` web build; tsc/eslint; parity sweep + change-log.

## Dev Notes
- **Effort is likely moderate, not large** — for our BrowserRouter + `<Routes>`/`<Route>` usage, v7 is largely API-compatible (v7 = the stabilized v6.4 data-router line). The breaks are concentrated in types (`MemoryRouterProps`) and any data-router APIs we use. Budget for the codemod + a focused regression, not a rewrite.
- **Keep `safe-redirect` regardless.** v7 sanitizes navigation better, but app-layer redirect allow-listing is correct defense-in-depth — a future react-router regression or a new redirect surface (a `?redirect=` param) must not be able to reopen an open redirect. This is the durable control; the react-router version is the churny part.
- **Bundle opportunity:** this touches routing broadly, so it's a natural companion to Epic 12's web-foundation work (12-1/12-2/12-3) — do it when a dev is already in the routing/build layer rather than as an isolated risky bump.
- **Pull trigger (if not scheduled):** another 6.x advisory landing (more compounding accept-risks) is the signal to pull this forward. Until then, the 649af26 mitigation holds.

### Dependencies
- No backend, no schema. `apps/web` only. Independent of the launch send-stack (13-24 etc.).

### References
- [Source: 649af26 — the accept-risk + `apps/web/src/lib/safe-redirect.ts` mitigation this story retires the risk-half of]
- [Source: osv-scanner.toml — the 3 react-router `[[IgnoredVulns]]` to remove; package.json override-policy — the `react-router: >=6.30.4 <7` override to drop]
- [Source: MEMORY.md 9-54 lesson — the unbounded-override accidental v7 jump that broke the build (`MemoryRouterProps`); this story does it deliberately with the codemod]

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-24 | Story drafted, EMERGENT from the 649af26 deploy-blocker (3 react-router 6.30.4 advisories, no 6.x fix → accepted-risk + app-layer safe-redirect mitigation). Migrates to v7 to fix at source + remove the override + accept-risks, ending the compounding 6.x-EOL debt. POST-LAUNCH, non-gating (current advisories mitigated). Keeps the safe-redirect guard as durable defense-in-depth. | Bob (SM) |

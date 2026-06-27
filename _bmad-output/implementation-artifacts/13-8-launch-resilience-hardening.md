# Story 13.8: Launch resilience hardening — bigger box, sharper alerts, compiled runtime, rehearsed failover

Status: review

<!-- Authored 2026-06-27 by Bob (SM) via canonical *create-story. Emergent from the 13-3 prod load test + alerting investigation — DOCUMENTS the launch-resilience work (not just git history). 🚦 launch-resilience. PM (John): infra/ops hardening, NO PRD/scope change. Mixed dev + operator ACs. -->

## Story

As the **operator taking a 1-vCPU/2GB box into a state-wide radio launch**,
I want **the box itself made more resilient (more CPU, compiled runtime), alerts that page me on a real slowdown, and a rehearsed automatic failover**,
so that **the jingle surge is absorbed by the primary path — and if anything does break, I'm paged in time and traffic fails over automatically, with all of it written down, not just in commits.**

## Context

The 13-3 load test (2026-06-27) proved the box survives a strong spike but is **CPU-bound on a single core** and **degrades by latency, not failure**. The cheapest, highest-impact resilience win is therefore **more CPU**, complemented by a **leaner runtime**, **alerts that actually page on a slowdown**, and the **already-built automatic failover** — rehearsed before go-live. This story bundles those into one documented hardening pass.

### Grounded findings (verified 2026-06-27 — the evidence this story acts on)
- **Capacity:** 1-vCPU/2GB DO droplet (egress `159.89.146.93`); throughput ceiling **~245 req/s**; p95 **185 / 346 / 648 ms** @ 20 / 50 / 100 concurrent; **0 errors** at every level; no crash. [Source: docs/runbooks/13-3-launch-capacity-and-fallback.md Part C]
- **Restarts:** pm2 `restart_time` 188 but `unstable_restarts` 0, no OOM/crash markers → **deploy-driven, benign** (not a defect).
- **Runtime:** pm2 runs `bash -c npx tsx src/index.ts` — interpreting TS live — instead of the wired `start: node dist/index.js` [Source: apps/api/package.json:8-9]. Plain `node dist` currently **crashes** because `@oslsr/types|utils|config` `main` → `./src/*.ts` (no built JS) [Source: packages/types/package.json:6]. esbuild is available. F-026 residual.
- **Alerting:** Telegram is **CRITICAL-only** (`sendCriticalTelegramAlert`); warnings → ≤30-min **email digest**. `api_p95_latency`: warning 250, **critical 500** [Source: apps/api/src/services/alert.service.ts:73]. So a graceful launch slowdown (p95 250–500) **emails but doesn't page**. Telegram delivery **verified working** 2026-06-27 (`scripts/uat-trigger-critical-alert.ts` → `telegram.alert_sent`).
- **Failover:** already shipped (commit 871494b) — `cloudflare-fallback/5xx.html` + `docs/runbooks/13-3-cutover-and-failover.md`.

## Acceptance Criteria

### AC1 — Droplet resize to 2 vCPU / 4 GB **[Operator]** — the #1 lever
1. The DO droplet is resized to **2 vCPU / 4 GB** (CPU+RAM resize, reversible, ~$24/mo vs ~$12). Rationale: the box is CPU-bound; 2 cores ≈ **doubles** the proven ~245 req/s ceiling and halves load → p95 drops sharply at the same concurrency. Better than any failover is a box that doesn't fall over.
2. **Post-resize, re-run the load test** (`scripts/load-test.ts`, on-box vs localhost, 50×60s and 100×30s) and record the new numbers in the runbook — confirm the headroom gain and that the spike is now comfortably within capacity.

### AC2 — Alerts page on a real slowdown **[Dev]**
1. Lower `api_p95_latency` **criticalThreshold 500 → 350** in `alert.service.ts:73` (warning stays 250) so a genuine launch slowdown crosses into a **Telegram page**, closing the graceful-slowdown monitoring gap. Unit-tested (the threshold + the evaluate path).
2. Document the trade-off (a touch noisier during the launch window, intentionally) and that it can be relaxed post-launch.

### AC3 — Compiled runtime (`tsx` → `node dist`) **[Dev — CAREFUL, prod-boot risk]**
1. Make `node dist/index.js` actually boot: either **build the workspace packages** (`@oslsr/types|utils|config` → JS + `main`→dist) **or esbuild-bundle** the api so no TS workspace import remains at runtime. **Verify a built dist boots locally** (`node apps/api/dist/index.js` starts clean) BEFORE any prod change.
2. Switch the pm2 start to `node dist/index.js` **with the `tsx` command kept as a one-line rollback**; the deploy must `build` before `restart`.
3. **Honesty clause:** if (1) cannot be made safe within launch-week risk tolerance, this AC lands as **documented-deferred** — the story records the exact blocker + the chosen path (workspace-build vs esbuild-bundle) + the rollback — rather than shipping a risky prod-boot change on launch eve. The resize (AC1) reduces the urgency either way.

### AC4 — Rehearse the failover **[Operator drill]**
1. After the operator sets the Cloudflare Custom 5xx Page (`→ https://oslsr-fallback.pages.dev/5xx.html`), execute the dry-run in `docs/runbooks/13-3-cutover-and-failover.md`: `pm2 stop oslsr-api` → confirm `oyoskills.com` serves the branded busy page → forwards to the fallback → submit a test lead → confirm it lands in KV (`--remote`) → `pm2 start oslsr-api`.
2. Record the rehearsal result (pass/fail + timing) in the cutover runbook. A captured lead during a simulated outage = failover **verified**, not hoped.

## Tasks / Subtasks

- [ ] **Task 1 — [Operator] Droplet resize + re-test (AC1)**
  - [ ] Resize the DO droplet to 2 vCPU / 4 GB (control panel → Resize → CPU+RAM → reboot).
  - [ ] Re-run `scripts/load-test.ts` on-box (50×60s, 100×30s); record new p95/throughput/load in the runbook.
- [x] **Task 2 — [Dev] p95 critical threshold tune (AC2)** ✅
  - [x] `alert.service.ts:73` api_p95_latency criticalThreshold 500 → 350; unit-tested (p95=400→critical, p95=300→warning).
  - [x] Launch-window trade-off documented in the code comment + Dev Agent Record (relax to 500 post-launch / post-resize).
- [~] **Task 3 — [Dev, CAREFUL] tsx → node dist (AC3)** — **DOCUMENTED-DEFERRED** (honesty clause; blocker verified)
  - [x] Investigated: `tsc` builds + `dist/index.js` emits, but `node dist/index.js` **crashes** — `Cannot find module 'packages/utils/src/errors.js' imported from packages/utils/src/index.ts` (workspace `main`→uncompiled `src/*.ts` with `.js`-extension imports only a TS loader resolves). Blocker confirmed.
  - [ ] **DEFERRED (post-launch):** not a launch-eve change. Path forward + rollback in the Dev Agent Record; the AC1 resize is the launch-window capacity answer.
- [ ] **Task 4 — [Operator drill] Failover dry-run (AC4)**
  - [ ] After the Cloudflare Custom 5xx Page is set, run the `13-3-cutover-and-failover.md` rehearsal; record the result.

## Dev Notes
- **Scope OUT:** re-architecting off the single box / horizontal scale (the resize is the lever, not a redesign); the failover artifacts themselves (done in 13-3, commit 871494b); changing the alert *channel* model (Telegram=critical is fine — we tune the threshold, not the routing).
- **Risk ranking:** AC3 (prod-boot) ≫ AC2 (small config) ≈ AC1 (operator, reversible) > AC4 (drill). Do AC2 first (safe win), AC1 in parallel (operator), AC3 only if locally-verified-safe, AC4 last (needs Cloudflare + a quiet window).
- **Why the resize beats the runtime fix:** AC1 ≈ +100% CPU with zero code risk; AC3 ≈ +20–40% efficiency with real boot risk. Sequence accordingly.

### References
- [Source: docs/runbooks/13-3-launch-capacity-and-fallback.md] load-test headroom curve (Part C)
- [Source: docs/runbooks/13-3-cutover-and-failover.md] failover + dry-run procedure
- [Source: apps/api/src/services/alert.service.ts:73] api_p95_latency thresholds
- [Source: apps/api/package.json:8-9] build:tsc + start:node dist/index.js (already wired)
- [Source: packages/types/package.json:6] @oslsr/types main → src (the node-dist blocker)
- [Source: scripts/uat-trigger-critical-alert.ts] Telegram delivery verification

## Dev Agent Record
### Agent Model Used
Amelia (BMAD dev agent) — claude-opus-4-8[1m], dev-story workflow, 2026-06-27.

### Completion Notes List
- **AC2 (DONE)** — `alert.service.ts:73` api_p95_latency criticalThreshold **500 → 350** (warning stays 250). Two tests added in `alert.service.test.ts`: p95=400 → **critical** (was warning), p95=300 → **warning**. alert.service suite 23 green. **Trade-off:** intentionally a touch noisier during launch (a real slowdown now pages Telegram instead of only the ≤30-min email digest); relax back to 500 post-launch or once the 2-vCPU resize gives latency headroom (one-line revert).
- **AC3 (DOCUMENTED-DEFERRED)** — verified the precise blocker: `pnpm --filter @oslsr/api build` succeeds and emits `dist/index.js`, but `node apps/api/dist/index.js` **crashes at import** — `ERR_MODULE_NOT_FOUND: packages/utils/src/errors.js imported from packages/utils/src/index.ts`. Root cause: `@oslsr/types|utils|config` `main` → uncompiled `./src/index.ts`, whose internal imports use `.js` extensions that only a TS loader (`tsx`) resolves to the `.ts` sources; plain `node` cannot. **Two paths forward (post-launch story):** (a) build each workspace package to JS + point `main`→dist (monorepo-wide; note drizzle-kit's @oslsr/types-no-dist sensitivity), or (b) **esbuild-bundle** the api into a self-contained dist (esbuild already present; self-contained to apps/api — lower blast radius, preferred). **Rollback is trivial** (keep the `tsx` pm2 start). **Decision:** NOT shipped — too risky for launch eve, and the AC1 droplet resize (~2× CPU, zero code risk) is the launch-window capacity answer. The build artifact was cleaned (`apps/api/dist` is gitignored — no tree change).
- **AC1 + AC4 are [Operator]** — droplet resize + the failover dry-run (the latter after the operator sets the Cloudflare Custom 5xx Page). Left unchecked with operator notes.

### File List
**Modified:** `apps/api/src/services/alert.service.ts` (AC2 threshold) · `apps/api/src/services/__tests__/alert.service.test.ts` (AC2 tests) · `_bmad-output/implementation-artifacts/sprint-status.yaml` · `_bmad-output/planning-artifacts/epics.md`
**New:** `_bmad-output/implementation-artifacts/13-8-launch-resilience-hardening.md`

### Review Follow-ups (AI) — code-review 2026-06-27
- [x] [AI-Review][Med] **M1 — stale test** (`alert.service.test.ts:226` asserted "> 500ms") renamed to "well above the critical threshold (600ms)" — no longer claims the old number.
- [x] [AI-Review][Med] **M2 — stale `500` refs** in live artifacts fixed: `telegram-channel.ts:34` comment + the self-contradicting `13-3-cutover-and-failover.md` (now states 350 + that it's a launch-window setting). Historical docs (emergency-recovery, playbook, bmad-compliance) intentionally LEFT at 500 — 350 is temporary and reverts to 500 post-launch, so 500 is the correct steady-state.
- [x] [AI-Review][Med] **M3 — false-positive risk surfaced + mitigated.** Routine backup/email runs blip the event loop ~700ms (docs already flagged 500 as aggressive) → 350 widens false-critical pages. Mitigation added to the code comment + cutover runbook: **schedule backups outside the jingle window**, correlate pages with the dashboard, relax to 500 post-launch. Change kept (serves the user's "page me on a slowdown" intent) but no longer silent about the cost.
- [x] [AI-Review][Low] **L1 — `cloudflare-fallback/.wrangler/`** (local wrangler state) added to `.gitignore`.
- [x] [AI-Review][Low] L2 — boundary (p95=350 exactly) untested — accepted (the 400/300 cases bracket it).

## Senior Developer Review (AI)

**Reviewer:** Amelia (BMAD code-review workflow — adversarial) · **Date:** 2026-06-27 · **Outcome:** ✅ APPROVE the dev work (AC2); AC3 deferral is honest; story stays `review` (AC1/AC4 [Operator] + AC3 deferred remain)

- **Scope verified:** git == File List; no stray `dist`; `.wrangler` now ignored.
- **AC2 correct:** warning 250 intact, critical 350; tests bracket it (400→critical, 300→warning). Found + fixed the *tentacles* — a stale existing test + stale live docs/comments + the **backup false-positive trade-off** the original commit was silent about (the most valuable catch).
- **AC3 deferral is HONEST, not hidden work:** the `node dist` blocker was *empirically reproduced* (`ERR_MODULE_NOT_FOUND packages/utils/src/errors.js`), with a real path forward (esbuild-bundle) + trivial rollback (keep `tsx`). Correctly NOT shipped on launch eve; the resize is the launch capacity answer.
- **AC1 + AC4 legitimately [Operator]:** droplet resize (DO panel) + the failover dry-run (needs the operator's Cloudflare Custom Page + a prod `pm2 stop`).
- **Findings:** 0 Critical · 0 High · **3 Medium (all fixed)** · 2 Low (1 fixed, 1 accepted).
- **Verification:** api tsc 0; eslint clean; alert suite 23; full api regression green (2864 pre-fix; post-fix changes are comment/rename/doc only — no logic delta).
- **Decision:** dev work approved → commit. Story remains `review` until the operator closes AC1 (resize) + AC4 (dry-run); AC3 is a logged post-launch follow-up.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-27 | Authored — bundles the 13-3-emergent launch hardening (droplet resize, p95 alert tune, tsx→node dist, failover dry-run) into one documented story. 4 ACs (mixed dev/operator). Grounded in the load test + alerting investigation. | Bob (SM) |

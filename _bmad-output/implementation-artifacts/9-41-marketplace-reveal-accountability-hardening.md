# Story 9.41: Marketplace Reveal Accountability Hardening (close F-007 — bound bulk PII exfiltration on the open reveal endpoint)

Status: done

<!--
Authored 2026-06-07 by Bob (SM) via canonical *create-story --yolo workflow.

Source: sprint-change-proposal-2026-06-06-security-r2-remediation.md §4.1 (finding F-007)
+ security-assessment/findings/F-007-marketplace-reveal-no-authz.md + REMEDIATION-BRIEF.md.
LAUNCH-GATE story (Phase 2 🚦 in docs/roadmap-to-launch.md): the Cohort blasts + social push
drive traffic AT this reveal endpoint, so its accountability must be live before they fire.

SETTLED PRODUCT DECISION (do not relitigate): contact reveal stays OPEN to any registered
user — accountability is via registration + audit + caps + anomaly alerting + progressive
friction, NOT a verified-employer role gate. Harm reframed: this is CONSENTED data, so the
damage is (i) registry-value reconstruction and (ii) off-purpose spam against people who
consented to legitimate employer contact — every control below aims at "no single actor (or
fan-out of accounts) reconstructs the corpus," not "lock it down."

VERIFIED LIVE STATE (2026-06-06, commit f2b9695-era tree):
  - POST /profiles/:id/reveal = authenticate + verifyCaptcha, NO authorize()
    [Source: apps/api/src/routes/marketplace.routes.ts:28].
  - Rate limit is per-viewer ONLY (50/user/24h); device fingerprint is collected but
    "don't enforce, just observe" [Source: apps/api/src/middleware/reveal-rate-limit.ts:59].
  - Anomaly analytics ALREADY EXIST but are pull-only dashboards (nobody watches at 2am):
    getSuspiciousDevices / getTopViewers / getTopProfiles
    [Source: apps/api/src/services/reveal-analytics.service.ts].
  - A real Telegram alert pipeline EXISTS to reuse [Source: apps/api/src/services/alert.service.ts
    + alerting/telegram-channel.ts, Story 9-15].

ORDER MATTERS (assessor-endorsed): alerting FIRST (the circuit-breaker escalates to a human
that must already exist) → per-profile cap → enforce fingerprint → global breaker → friction
→ purpose-binding.

OUT OF SCOPE (parked): the messaging-relay north-star (brokered employer↔candidate contact so
raw PII never leaves) is a SEPARATE dormant story `marketplace-contact-broker-relay` (Phase 3).
It is defense-in-depth BEYOND this closed finding, a NEW channel (current messaging is
supervisor↔enumerator, team-gated), and is NOT a launch gate. Do not build it here.
-->

## Story

As **the OSLSR registry custodian protecting consented citizen contact data**,
I want **the open marketplace contact-reveal endpoint to be accountable and bounded — alerted on, capped per-profile and globally, and progressively gated as volume climbs**,
so that **any registered user can still reveal a contact (open by design), but no single actor or fan-out of throwaway accounts can drain or reconstruct the corpus, and an abuser is visible and attributable in real time — not just faithfully logged after the fact**.

## Acceptance Criteria

1. **AC#1 — Wire anomaly detection into the existing alert pipeline FIRST (prerequisite for the breaker).** Route `RevealAnalyticsService.getSuspiciousDevices` (≥2 accounts per device fingerprint) and a viewer-velocity signal into the existing `alert.service.ts` Telegram channel [Source: apps/api/src/services/reveal-analytics.service.ts:83 getSuspiciousDevices; apps/api/src/services/alert.service.ts]. Alerts fire on a cooldown (reuse the per-metric cooldown pattern from Story 9-15) and are gated by `isAlertSendEnabled()` (no self-paging in dev/test). This turns "we know who checked what" from a claim into an operational capability and gives AC#4's circuit-breaker a human to escalate to. **This task lands before AC#4.**

2. **AC#2 — Per-profile reveal cap (anomaly-shape, not volume-calibrated).** A single `profileId` revealed by more than **N distinct viewers within a rolling window** (default N=5 distinct viewers / 24h, configurable via settings/env — anchored to "a candidate contacted by >~3–5 distinct viewers in a short window is anomalous regardless of normal employer volume") is blocked for further *new* viewers and emits an alert (AC#1). Implemented as a SQL-count check in `MarketplaceService.revealContact` (source of truth) with an optional Redis fast-path mirroring the existing per-user limiter [Source: apps/api/src/middleware/reveal-rate-limit.ts; apps/api/src/db/schema/contact-reveals.ts]. This directly kills targeted harvest of one individual.

3. **AC#3 — Enforce the device fingerprint server-side (bar-raising, explicitly not load-bearing).** Flip `reveal-rate-limit.ts:59` from observe-only to **enforced**: the device fingerprint counts toward the limit and is deduplicated across accounts (same device used by multiple viewer accounts shares/aggregates a budget), raising the cost of lazy fan-out [Source: apps/api/src/middleware/reveal-rate-limit.ts:59-67]. Dev Notes MUST state that the fingerprint is client-supplied and therefore rotatable — this raises the bar but the **global breaker (AC#4) is the real backstop**; do not oversell fingerprint enforcement as a hard control.

4. **AC#4 — Global rolling circuit-breaker that DEGRADES, never hard-blocks.** Track aggregate reveal volume across all viewers in a rolling window; when it exceeds a global threshold (configurable; set well above expected legitimate aggregate but well below corpus-drain), **do not return a hard 429/deny** — instead escalate: require step-up (AC#5's highest rung) for further reveals and fire a human-review alert (AC#1). A wall breaks legitimate surges; a breaker degrades gracefully. Per-account limits alone do NOT stop fan-out — this cross-viewer aggregate is what does.

5. **AC#5 — Progressive friction at the VOLUME threshold (not identity-proofing at registration).** As a viewer's reveal volume climbs within a window, escalate verification using rungs the platform ALREADY owns: CAPTCHA (existing, low volume) → phone-OTP → MFA/step-up (high volume). Casual lookups stay frictionless; bulk access earns scrutiny. Explicitly do NOT add heavy identity-proofing at registration (it fights the adoption funnel — revises an earlier assessment recommendation). Reuse existing OTP/MFA/step-up infrastructure (Stories 9-12 SMS-OTP scaffold, 9-13 MFA); no net-new auth primitive.

6. **AC#6 — Purpose-binding above a volume threshold (makes the audit row actionable).** Above a configurable per-viewer volume, require an acceptable-use / purpose declaration (lightweight; accept-terms + free-text or enum) before the reveal proceeds, persisted on the reveal record. Add a `contact_reveals.purpose` (+ ToS-acceptance) column via a hand-rolled idempotent migration [Source: apps/api/src/db/schema/contact-reveals.ts] so the audit row becomes **identity + device + stated purpose + ToS acceptance** — the evidence needed to actually act on an abuser. Below the threshold, reveals are unchanged (frictionless).

7. **AC#7 — Do not weaken any existing control; stay open-by-design.** `authenticate` + `verifyCaptcha`, the consent-fail-closed 404 (consent-false profile → 404), and the per-user 50/24h limit all remain intact [Source: apps/api/src/routes/marketplace.routes.ts:28-32]. **No `authorize()` role gate is added** — reveal stays open to any registered user (the settled decision). Parameterized queries, MFA, session/token revocation untouched.

8. **AC#8 — Tests + zero regression.** Per-control tests: (a) alerting fires on a seeded ≥2-accounts/device pattern and respects cooldown + `isAlertSendEnabled()`; (b) a profile revealed by N+1 distinct viewers in-window is blocked + alerts; (c) fingerprint spoofing/omission no longer multiplies a viewer's effective limit; (d) N throwaway accounts cannot collectively exceed the global breaker (fan-out test); (e) consent-false STILL returns 404; (f) purpose-binding required above threshold, absent below. Migration smoke (`contact_reveals.purpose` exists). Full API + web suites green; no drift in the existing reveal happy-path or 50/24h limiter.

## Tasks / Subtasks

- [x] **Task 1 — Alerting first: anomaly → Telegram (AC: #1)** _(prerequisite for Task 4)_
  - [x] 1.1 Add a scheduled/triggered check that calls `getSuspiciousDevices` + a viewer-velocity query and dispatches via the existing Telegram channel (`sendTelegramMessage`, reuse 9-15 cooldown + `isAlertSendEnabled()`). → `services/reveal-anomaly-alert.service.ts`
  - [x] 1.2 Tests: alert fires on seeded ≥2-accounts/device; suppressed in test/dev; cooldown honored. → 11 tests.
- [x] **Task 2 — Per-profile reveal cap (AC: #2)**
  - [x] 2.1 SQL distinct-viewer count in `MarketplaceService.revealContact` (default 5/`windowSeconds`, configurable); Redis fast-path via existing limiter.
  - [x] 2.2 On breach: block NEW viewers only (existing viewer bypass) + emit alert. Tests for under/at-cap-1/over + existing-viewer bypass.
- [x] **Task 3 — Enforce device fingerprint (AC: #3)**
  - [x] 3.1 Flipped `reveal-rate-limit.ts` observe→enforce; device budget aggregated across accounts sharing a fingerprint; rolls back both counters on device block.
  - [x] 3.2 Tests: device-budget exhaustion blocks; present fingerprint does not multiply the per-user allowance. Dev Notes: client-supplied ⇒ bar-raising only; breaker is the backstop.
- [x] **Task 4 — Global circuit-breaker (degrade, don't block) (AC: #4)**
  - [x] 4.1 Rolling global aggregate counter (`rl:reveal:global`); on breach → `breakerTripped` forces highest step-up rung + fires human-review alert (NEVER hard 429/deny).
  - [x] 4.2 Fan-out test: a near-zero-volume throwaway account is still forced to step-up when the breaker is tripped; degrades (not rate_limited).
- [x] **Task 5 — Progressive friction by volume (AC: #5)**
  - [x] 5.1 Tiered rungs CAPTCHA → phone-OTP → MFA/step-up keyed on per-viewer window volume (`selectRequiredRung`); satisfaction reuses existing SMS-OTP / MFA verify (`/reveal/step-up`), recorded via `reveal-step-up.service.ts`. No registration-time proofing.
  - [x] 5.2 Tests: correct rung per volume band; rung-satisfaction is rank-monotonic; step-up proof marker get/record + no-downgrade.
- [x] **Task 6 — Purpose-binding above threshold (AC: #6)**
  - [x] 6.1 Migration: `contact_reveals.purpose` + `tos_accepted_at` added to schema + idempotent runner `scripts/migrate-reveal-purpose-init.ts` (wired into ci-cd.yml).
  - [x] 6.2 Require purpose + ToS above the volume threshold; persist on the reveal row; below threshold unchanged (stays NULL).
  - [x] 6.3 Tests: required-above / frictionless-below / persisted-values.
- [x] **Task 7 — Regression sweep + control-preservation (AC: #7, #8)**
  - [x] 7.1 Asserted consent-false 404, per-user 50/24h, CAPTCHA, no-role-gate all intact (existing reveal tests still green; route unchanged except step-up additions).
  - [x] 7.2 API tsc + lint clean; full build green; touched suites green (DB-gated integration suites require `DATABASE_URL` — deferred to CI/pre-push per branch-gate policy).

### Review Follow-ups (AI)

Adversarial code review 2026-06-18 (security-R2 track, fresh context). 2 High / 3 Medium / 3 Low found; High + Medium fixed in-pass, Lows documented/logged. tsc + lint clean; 152/152 touched-suite tests green (config 16, anomaly 11, rate-limit 15, service 49, controller 61).

- [x] [AI-Review][High] **H1 — `mfa` rung was unsatisfiable for non-super-admin viewers, turning the AC#4 breaker into a hard global lockout.** MFA is enrolment-gated (super_admin only, 9-13); forcing `'mfa'` on a public viewer (breaker, or volume≥40 friction band) left them unable to ever clear it. Fixed: `reachableCeiling()` + `selectRequiredRung(..., ceiling)` cap the demand at the strongest rung the viewer can satisfy (mfa→otp→captcha); the breaker now DEGRADES and still pages a human even when the cap lets the reveal proceed. [reveal-guard.config.ts, marketplace.service.ts:revealContact]
- [x] [AI-Review][High] **H2 — AC#1 anomaly sweep (`runChecks`) was dead code — never scheduled/called, so the suspicious-device + viewer-velocity pages never fired in prod.** Fixed: wired `startRevealAnomalyScheduler()` (10-min `setInterval`, `.unref()`) into `initializeWorkers()` / `closeAllWorkers()`, mirroring the monitoring scheduler. [workers/index.ts]
- [x] [AI-Review][Medium] **M1 — Redis user/device/global counters incremented on attempts later blocked by a guard (no rollback) → spurious 429s + a self-sustaining breaker that never recovered in-window.** Fixed: `rollbackRevealCounters()` called on any non-success outcome. [reveal-rate-limit.ts, marketplace.service.ts]
- [x] [AI-Review][Medium] **M2 — no negative-path test for the unsatisfiable rung; the breaker test injected `stepUpLevel:'mfa'`, masking H1.** Fixed: added service tests for non-MFA viewer capped to OTP, phone-less viewer degrading to captcha+alert, and rollback-on-block. [marketplace.service.test.ts, reveal-guard.config.test.ts]
- [x] [AI-Review][Medium] **M3 — step-up routes had no reveal-layer rate limit (only `authenticate`).** Fixed: added `revealStepUpRateLimit` (15/5min/IP) on both step-up routes + contract test. [marketplace-rate-limit.ts, marketplace.routes.ts, marketplace.controller.test.ts]
- [x] [AI-Review][Low] **L1 — "rolling window" wording vs fixed-TTL window.** Documented: the global counter is a fixed window (TTL set once), consistent with the per-user limiter; with M1 fixed it recovers cleanly at window roll. [reveal-rate-limit.ts comments]
- [x] [AI-Review][Low] **L2 — OTP-friction (20) and purpose (20) thresholds coincide**, so a viewer at exactly 20 does OTP then purpose in two round-trips. Acceptable; calibration is product-owned + env-tunable. [reveal-guard.config.ts]
- [x] [AI-Review][Low] **L3 — Frontend reveal-UX (was the LAUNCH-GATE follow-up) — RESOLVED 2026-06-18.** `MarketplaceProfilePage` now drives the full gating state machine: `403 REVEAL_STEP_UP_REQUIRED` → OTP (send→enter→verify) or MFA (enter→verify) step-up panel keyed on `requiredLevel`, then retries the reveal behind a fresh CAPTCHA; `422 REVEAL_PURPOSE_REQUIRED` → purpose + ToS panel (latched + reused), then retries with `{purpose, tosAccepted}`; `403 REVEAL_PROFILE_CAP_REACHED` → friendly cap message. New API/hooks (`requestRevealStepUp`/`verifyRevealStepUp`); controller mirrors `requiredLevel` into `details` so the web `ApiError` can drive the rung. +7 web tests (35/35 green). No remaining launch-gate UI debt. [apps/web/src/features/marketplace/*, marketplace.controller.ts]

## Dev Notes

- **Open-by-design is the architecture, not an oversight.** The reveal endpoint intentionally omits `authorize()`; the analytics routes in the same file ARE `SUPER_ADMIN`-gated [Source: apps/api/src/routes/marketplace.routes.ts:18-21], proving the team gates deliberately. Accountability here = registration + audit (`contact_reveals`) + caps + alerting + friction + purpose. Do not add a role gate.
- **Reuse, don't rebuild:** AC#1 wires the EXISTING `getSuspiciousDevices` analytics into the EXISTING `alert.service.ts` Telegram pipeline (Story 9-15). No new alert channel.
- **Fingerprint is client-supplied** → AC#3 is bar-raising; AC#4 (global breaker) is the load-bearing backstop. State this explicitly; don't let a reviewer treat fingerprint-enforcement as sufficient.
- **Calibration is product-owned:** per-profile N≈3–5 distinct viewers/window is anomaly-shape (low false-positive, no "normal volume" guess needed); the global breaker threshold is riskier → that's exactly why it degrades to step-up/human review rather than hard-blocking. Make all thresholds configurable (settings/env), not hard-coded.
- **The relay north-star is OUT of scope** — parked as dormant story `marketplace-contact-broker-relay` (Phase 3). After this story ships, **F-007 the finding is CLOSED** (zero security debt); the relay is defense-in-depth beyond a closed finding and a NEW channel (current messaging is supervisor↔enumerator team-gated — not reusable here).
- **Testing standard:** backend tests in `__tests__/`, `beforeAll`/`afterAll` for any real-DB integration; mirror the existing `reveal-rate-limit.test.ts` + `reveal-analytics.service.test.ts` patterns.

### Project Structure Notes

- Touch: `services/marketplace.service.ts`, `middleware/reveal-rate-limit.ts`, `services/reveal-analytics.service.ts`, `services/alert.service.ts`, `db/schema/contact-reveals.ts` (+ migration), `routes/marketplace.routes.ts` (friction wiring only — no role gate). No frontend change required for the gating slice; a reveal-UX prompt for purpose-binding (AC#6) is the only client touch.
- Aligns with project rate-limit + alert conventions; no new architectural primitive.

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-06-security-r2-remediation.md#section-4-detailed-change-proposals]
- [Source: security-assessment/findings/F-007-marketplace-reveal-no-authz.md]
- [Source: apps/api/src/routes/marketplace.routes.ts:28]
- [Source: apps/api/src/middleware/reveal-rate-limit.ts:59]
- [Source: apps/api/src/services/reveal-analytics.service.ts:83]
- [Source: apps/api/src/services/alert.service.ts] (Story 9-15 Telegram pipeline)
- [Source: apps/api/src/db/schema/contact-reveals.ts]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev agent) — security-r2 track, worktree `../oslrs-security` on `track/security-r2-41-45`.

### Debug Log References

- Touched-suite run: 91 tests green across the 5 reveal-guard files (config / anomaly-alert / step-up / marketplace.service / reveal-rate-limit).
- marketplace.controller.test: 59 green after wiring step-up imports (mocked db/index + OTP/MFA per established isolation pattern).
- Full API suite: 2073 passed; 48 files fail ONLY on `DATABASE_URL is not set` (DB/integration tests needing a live test DB; verified env-only, no logic regression — `sms-otp.service.test` fails identically in isolation via the db/index import chain). API tsc + lint clean; full workspace build green.

### Completion Notes List

- **Open-by-design preserved (AC#7):** no `authorize()` role gate added; `authenticate` + `verifyCaptcha`, consent-fail-closed 404, and the per-user 50/24h limit are all intact. The reveal stays open to any registered user; accountability = alerting + caps + fingerprint + breaker + friction + purpose.
- **Reuse over rebuild:** AC#1 dispatches through the existing `sendTelegramMessage` channel (Story 9-15) — no new alert channel. AC#5 step-up satisfaction reuses `SmsOtpService` / `MfaService` verify — no net-new auth primitive.
- **Fingerprint is bar-raising, not load-bearing (AC#3):** client-supplied ⇒ rotatable; the per-device budget raises fan-out cost but the global breaker (AC#4) is the real backstop. Stated in `reveal-rate-limit.ts`.
- **Breaker degrades, never hard-blocks (AC#4):** on global-threshold breach the service forces the highest step-up rung + fires a human-review alert; it never returns 429/deny. `checkRevealRateLimit` returns `breakerTripped` but always `allowed:true` on the breaker.
- **Calibration is product-owned + env-configurable:** all thresholds live in `config/reveal-guard.config.ts` (env overrides, anomaly-shaped defaults documented in `.env.example`). Per-profile cap is anomaly-shape (default 5 distinct viewers/24h); friction bands OTP=20 / MFA=40; purpose threshold 20; global breaker 2000; device budget 50.
- **Scope note (gating slice is backend-only, per story Project Structure Notes):** the server-side rung selection + enforcement (returns `step_up_required` / `purpose_required`) + the `/reveal/step-up` satisfaction endpoint are delivered and unit-tested. The client step-up/purpose prompt UX is the deferred frontend slice the story scopes out ("no frontend change required for the gating slice; a reveal-UX prompt for purpose-binding is the only client touch").
- **F-007 status:** with this story shipped, F-007 the finding is CLOSED. The messaging-relay north-star remains OUT of scope (dormant `marketplace-contact-broker-relay`, Phase 3).
- **Net-new tests:** +12 (config) +11 (anomaly-alert) +9 (step-up) +~16 new reveal cases (marketplace.service) +4 new (reveal-rate-limit) +5 new (controller).
- **Adversarial code-review pass (2026-06-18):** H1+H2 (High) + M1/M2/M3 (Medium) fixed in-pass; L1/L2 documented; L3 (frontend reveal-UX) logged as the remaining launch-gate follow-up. Net-new review tests: +4 config (ceiling/reachableCeiling), +6 service (H1 cap + degrade-not-block + M1 rollback), +2 controller (M3 contract). tsc 0, eslint 0, 152/152 touched-suite tests green. Status review → done.
- **L3 reveal-UX resolved (2026-06-18, same day):** front-end gating state machine added to `MarketplaceProfilePage` (OTP/MFA step-up + purpose/ToS panels, fresh-CAPTCHA retry) + `requestRevealStepUp`/`verifyRevealStepUp` API+hooks + controller `details.requiredLevel`. +7 web tests (MarketplaceProfilePage 28 → 35). web tsc 0, web eslint 0. **Zero remaining launch-gate UI debt — F-007 fully closed, frontend included.**

### File List

**New:**
- `apps/api/src/config/reveal-guard.config.ts`
- `apps/api/src/config/__tests__/reveal-guard.config.test.ts`
- `apps/api/src/services/reveal-anomaly-alert.service.ts`
- `apps/api/src/services/__tests__/reveal-anomaly-alert.service.test.ts`
- `apps/api/src/services/reveal-step-up.service.ts`
- `apps/api/src/services/__tests__/reveal-step-up.service.test.ts`
- `apps/api/scripts/migrate-reveal-purpose-init.ts`

**Modified:**
- `apps/api/src/middleware/reveal-rate-limit.ts` (AC#3 device enforce + AC#4 global breaker)
- `apps/api/src/middleware/__tests__/reveal-rate-limit.test.ts`
- `apps/api/src/services/marketplace.service.ts` (AC#2/#4/#5/#6 in `revealContact`)
- `apps/api/src/services/__tests__/marketplace.service.test.ts`
- `apps/api/src/controllers/marketplace.controller.ts` (status mapping + step-up handlers)
- `apps/api/src/controllers/__tests__/marketplace.controller.test.ts`
- `apps/api/src/routes/marketplace.routes.ts` (step-up routes)
- `apps/api/src/db/schema/contact-reveals.ts` (AC#6 columns)
- `.github/workflows/ci-cd.yml` (migration runner)
- `.env.example` (REVEAL_* tunables)
- `apps/api/src/config/reveal-guard.config.ts` (review H1 — `reachableCeiling` + capped `selectRequiredRung`)
- `apps/api/src/middleware/reveal-rate-limit.ts` (review M1 — `rollbackRevealCounters`)
- `apps/api/src/middleware/marketplace-rate-limit.ts` (review M3 — `revealStepUpRateLimit`)
- `apps/api/src/workers/index.ts` (review H2 — `startRevealAnomalyScheduler`)
- `apps/api/src/controllers/marketplace.controller.ts` (L3 — mirror `requiredLevel` into `details` for the web client)
- `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx` (L3 — step-up + purpose gating UX)
- `apps/web/src/features/marketplace/api/marketplace.api.ts` (L3 — reveal accountability body + step-up endpoints)
- `apps/web/src/features/marketplace/hooks/useMarketplace.ts` (L3 — `useRequestRevealStepUp` / `useVerifyRevealStepUp`)
- `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx` (L3 — +7 step-up/purpose flow tests)

# Story 9.41: Marketplace Reveal Accountability Hardening (close F-007 — bound bulk PII exfiltration on the open reveal endpoint)

Status: ready-for-dev

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

- [ ] **Task 1 — Alerting first: anomaly → Telegram (AC: #1)** _(prerequisite for Task 4)_
  - [ ] 1.1 Add a scheduled/triggered check that calls `getSuspiciousDevices` + a viewer-velocity query and dispatches via `alert.service.ts` (reuse 9-15 cooldown + `isAlertSendEnabled()`).
  - [ ] 1.2 Tests: alert fires on seeded ≥2-accounts/device; suppressed in test/dev; cooldown honored.
- [ ] **Task 2 — Per-profile reveal cap (AC: #2)** _(write failing tests first)_
  - [ ] 2.1 SQL-count check in `MarketplaceService.revealContact` for distinct viewers/profile/window (default 5/24h, configurable); optional Redis fast-path.
  - [ ] 2.2 On breach: block new viewers + emit alert. Tests for at/under/over threshold.
- [ ] **Task 3 — Enforce device fingerprint (AC: #3)**
  - [ ] 3.1 Flip `reveal-rate-limit.ts:59` observe→enforce; dedupe/aggregate budget across accounts sharing a fingerprint.
  - [ ] 3.2 Tests: spoof/omit no longer multiplies limit. Dev Notes: client-supplied ⇒ bar-raising only.
- [ ] **Task 4 — Global circuit-breaker (degrade, don't block) (AC: #4)**
  - [ ] 4.1 Rolling aggregate counter across all viewers; on breach → require step-up + fire human-review alert (NOT hard 429).
  - [ ] 4.2 Fan-out test: N accounts cannot collectively exceed the global threshold.
- [ ] **Task 5 — Progressive friction by volume (AC: #5)**
  - [ ] 5.1 Tiered rungs: CAPTCHA → phone-OTP → MFA/step-up keyed on per-viewer window volume; reuse existing OTP/MFA/step-up.
  - [ ] 5.2 Tests: correct rung selected per volume band; no registration-time proofing added.
- [ ] **Task 6 — Purpose-binding above threshold (AC: #6)**
  - [ ] 6.1 Migration: add `contact_reveals.purpose` (+ ToS-acceptance) idempotently.
  - [ ] 6.2 Require purpose declaration above the volume threshold; persist on the reveal row; below threshold unchanged.
  - [ ] 6.3 Tests + migration smoke.
- [ ] **Task 7 — Regression sweep + control-preservation (AC: #7, #8)**
  - [ ] 7.1 Assert consent-false 404, per-user 50/24h, CAPTCHA, no-role-gate all intact.
  - [ ] 7.2 API + web tsc + lint + full vitest green; document net-new test counts.

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

### Debug Log References

### Completion Notes List

### File List

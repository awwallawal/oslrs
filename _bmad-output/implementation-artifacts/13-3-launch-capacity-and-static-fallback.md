# Story 13.3: Launch Capacity & Static Fallback — Load-Test the Home Box for a Radio Spike + a Cloudflare-Cached Lead-Capture Fallback

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-25 by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 🚦 PRE-SPEND gate item #4. REUSE the existing monitoring (DONE) — do NOT rebuild it. NET-NEW = (a) a prod load test + (b) a Cloudflare-cached static fallback that captures a lead if the box degrades. Sibling of Story 9-20. -->

## Story

As the **operator running prod on a home server (`oslsr-home-app`) into a state-wide radio launch**,
I want **a prod load test that proves the box survives a radio-driven traffic spike, plus a Cloudflare-cached static fallback landing page that captures a 2-field lead (name + phone + LGA) and queues it for later import if the API/box degrades**,
so that **a state-wide jingle doesn't take the registry down silently, and even under degradation a captured lead beats a timeout — no intent is lost.**

## Context & Why This Gates Spend

prod runs on a **home server** (`oslsr-home-app`) and faces a **state-wide radio spike** with no clean post-9-18-redesign completion data [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:25]. This story is **🚦 pre-spend gate item #4: "Capacity load-test green + static fallback deployed"** — it must be green before radio/paid social [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:49]. It is the **sibling of Story 9-20** (pre-viral capacity prep) [Source: _bmad-output/implementation-artifacts/9-20-pre-viral-capacity-prep.md] [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:78].

### REUSE — monitoring is DONE; do NOT rebuild it
The observability stack already exists and is NOT in scope to rebuild [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-3-launch-capacity-and-static-fallback]:
- `OperationsService.getSystemHealth` — pm2 uptime/restart/CPU/RAM + disk [Source: apps/api/src/services/operations.service.ts:78-87].
- `getTraffic` — funnel + Step-4 stall [Source: apps/api/src/services/operations.service.ts:132].
- `cf-traffic-watch` bot-flood/attack paging (Story 9-52) [Source: _bmad-output/implementation-artifacts/9-52-cf-traffic-watch-alert.md].
- Expiry monitoring — TLS certs + domain RDAP (Story 9-50) [Source: _bmad-output/implementation-artifacts/9-50-certificate-expiry-monitoring.md].
- Telegram alerts.

**NET-NEW is exactly two things:** (a) a prod load test for a state-wide radio spike on `oslsr-home-app`, and (b) a Cloudflare-cached static fallback landing that captures intent if the API/home-box degrades [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:71]. A captured lead beats a timeout.

## Acceptance Criteria

### AC1 — Prod load test for a state-wide radio spike (NET-NEW)
1. A load test is run against prod (`oslsr-home-app`) modelling a state-wide radio-jingle spike: a defined concurrent-user / requests-per-second profile against the wizard entry + draft-save + submit path (the real registration hot path), with a stated peak and ramp. The profile and its rationale are recorded in the runbook (Task 4).
2. The test result is **green** against pre-agreed thresholds — the home box sustains the modelled peak with acceptable p95 latency and zero sustained error-rate climb; results captured (numbers + verdict) so the gate decision is evidence-based, not hopeful [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:49].
3. Resource headroom during the test is read from the **existing** `getSystemHealth` (pm2 CPU/RAM/restart + disk) [Source: apps/api/src/services/operations.service.ts:78-87] and `getTraffic` [Source: apps/api/src/services/operations.service.ts:132] — the test consumes the existing monitoring, it does NOT add a new metrics surface.
4. The test is **rate-limit / WAF aware** — it does not trip `cf-traffic-watch` (9-52) bot-flood paging as a false alarm (coordinate the source IP / allow-list, or expect+annotate the alert) [Source: _bmad-output/implementation-artifacts/9-52-cf-traffic-watch-alert.md].

### AC2 — Cloudflare-cached static fallback landing (NET-NEW)
1. A **static** fallback landing page is deployed and **Cloudflare-cached** (served from the edge, not the origin app) so it stays up even if the API / home box degrades or is down [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:71].
2. The page captures a **CALLBACK, not a half-registration** (peer review 2026-06-25): **name + phone + LGA** + a clear promise — *"we'll text you a link to finish your registration."* This routes the user **back into the real funnel** when the box is healthy, rather than creating a thin degraded-page mini-registration. Cleaner consent (it's a callback request, not a registration) and **no second-tier/dedup mess.** Phone is the re-contact key (consistent with the sheet's "phone is mandatory" discipline) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:29].
3. The callback record is **written to a store that survives origin degradation** (e.g. a Cloudflare-side queue / Worker KV / form endpoint independent of the home box). **Primary path:** when the origin recovers, the user is texted a link to complete the **real wizard** (full attribution + consent intact). **Fallback-of-the-fallback:** if a callback is never completed, the name+phone+LGA may be imported via the Epic 11 / Story 13-2 path (`imported_unverified`) so the intent isn't lost — but a completed real registration is always preferred over a thin import row. The fallback page itself does NOT attempt full registration.
4. The fallback is a **degradation affordance, not the primary path** — under normal operation users hit the live wizard; the fallback engages only when the API/box is unhealthy (manual cutover or health-gated routing is acceptable for launch — automatic origin-failover is NOT required).
5. **Consent/DPIA on the fallback (PM review 2026-06-25 — do NOT skip):** the page carries a **minimal consent/notice line** (PII captured for the Oyo State Skills Registry; phone used for re-contact) and the edge-store capture is recorded in a **DPIA note (Appendix H)**. A 2-field PII capture on a Cloudflare edge store is still PII collection **outside the main wizard consent flow** — same class of concern as the parked pixels (13-1 §5). Lawful basis aligns with the import path (`ndpa_6_1_e` + notice).

### AC3 — Gate verdict recorded
1. A **go/no-go capacity verdict** (load-test green + fallback deployed-and-verified) is recorded as pre-flight gate item #4 [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:49]. This story's "done" requires BOTH the green load test AND the deployed+tested fallback — either one red holds the spend gate.
2. The fallback is verified by an actual capture-then-queue round-trip (submit a test lead through the static page, confirm it lands in the queue/store and is importable) — not asserted from code alone.

## Tasks / Subtasks

- [ ] **Task 1 — Define + run the prod load test (AC1)**
  - [ ] Define the radio-spike load profile (peak concurrency / RPS, ramp) against the real hot path (wizard entry → draft save → submit); state the peak rationale (AC1.1).
  - [ ] Run it against prod (`oslsr-home-app`), reading headroom from the EXISTING `getSystemHealth` (pm2 CPU/RAM/restart + disk) [Source: apps/api/src/services/operations.service.ts:78-87] and `getTraffic` [Source: apps/api/src/services/operations.service.ts:132] — do NOT add a new metrics surface (AC1.3).
  - [ ] Make the test rate-limit/WAF aware so it does not false-alarm `cf-traffic-watch` (9-52) (AC1.4) [Source: _bmad-output/implementation-artifacts/9-52-cf-traffic-watch-alert.md].
  - [ ] Capture results (numbers + green/red verdict against pre-agreed thresholds) (AC1.2).

- [ ] **Task 2 — Build + deploy the Cloudflare-cached static fallback (AC2)**
  - [ ] Build a static landing page capturing name + phone + LGA only (AC2.2); Cloudflare-cache it at the edge so it survives origin degradation (AC2.1).
  - [ ] Queue the lead to an origin-independent store, round-trippable into the registry via the Epic 11 / 13-2 import path (name/phone/LGA → `imported_*`/`imported_unverified`) (AC2.3); do NOT attempt full registration on the fallback (AC2.4).
  - [ ] Define the engage-the-fallback trigger (manual cutover or health-gated; automatic failover NOT required) (AC2.4).
  - [ ] Add the minimal consent/notice line on the fallback page + a DPIA note (Appendix H) for the edge-store PII capture (AC2.5).

- [ ] **Task 3 — Verify the fallback round-trip + record the gate verdict (AC3)**
  - [ ] Submit a test lead through the static page; confirm it lands in the queue/store and is importable (AC3.2).
  - [ ] Record the go/no-go capacity verdict (load-test green + fallback deployed+verified) as pre-flight gate item #4 (AC3.1) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:49].

- [ ] **Task 4 — Runbook (the capacity + fallback procedure)**
  - [ ] Document the load-test profile/thresholds/results, the fallback deploy + cutover procedure, and the lead-import step — as a runbook sibling to Story 9-20's capacity prep [Source: _bmad-output/implementation-artifacts/9-20-pre-viral-capacity-prep.md], cross-linked from the pre-launch operator runbook.

## Dev Notes

### Architecture & engine map (cite these exact targets — REUSE, don't rebuild)
- **System health (REUSE):** `apps/api/src/services/operations.service.ts:78-87` (`getSystemHealth` — pm2 uptime/restart/CPU/RAM via `pm2 jlist`).
- **Traffic/funnel (REUSE):** `apps/api/src/services/operations.service.ts:132` (`getTraffic` — funnel + Step-4 stall).
- **cf-traffic-watch (REUSE — don't trip it):** Story 9-52 [Source: _bmad-output/implementation-artifacts/9-52-cf-traffic-watch-alert.md].
- **Expiry monitoring (REUSE):** Story 9-50 [Source: _bmad-output/implementation-artifacts/9-50-certificate-expiry-monitoring.md].
- **Capacity sibling:** Story 9-20 pre-viral capacity prep [Source: _bmad-output/implementation-artifacts/9-20-pre-viral-capacity-prep.md].
- **Lead-import target:** the Epic 11 / Story 13-2 import path (name + phone + LGA → `imported_*` / `imported_unverified`) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:46-49].

### REUSE-not-rebuild discipline (read before coding)
- Monitoring is **DONE** (getSystemHealth, getTraffic, cf-traffic-watch, expiry, Telegram). The ONLY net-new is the load test + the static fallback. If you find yourself building a metrics dashboard or alert channel, stop — consume the existing monitoring [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:72].

### Operator-run, Tailscale
- The prod load test + the fallback deploy are **operator (Awwal, Tailscale) actions** [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:94]. This story delivers the load profile, the static fallback artifact, the lead-queue wiring, and the runbook; the operator runs the test on the prod box.

### Dependencies & sequencing
- **HARD deps (available):** the monitoring stack (DONE); the Epic 11 / 13-2 import path (the lead-import target — leads can be imported once 13-2's importer lands; the fallback's job is to NOT LOSE the lead in the meantime).
- **Tier:** 🚦 pre-spend gate item #4 — green before radio/paid social [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:55].
- **Sibling:** Story 9-20 (capacity prep).

### Scope OUT (do not build)
- Any new monitoring / metrics / alert surface (all REUSE).
- Full registration on the static fallback (2-field lead only).
- Automatic origin-failover routing (manual/health-gated cutover is sufficient for launch).
- Horizontal scale-out / migration off the home box (out of scope; the load test PROVES the box, it doesn't re-architect it).

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:25,49,55,71-72,78,94] — home-box risk, gate item #4, net-new scope, sibling-of-9-20, operator-run
- [Source: apps/api/src/services/operations.service.ts:78-87,132] — getSystemHealth + getTraffic (REUSE)
- [Source: _bmad-output/implementation-artifacts/9-52-cf-traffic-watch-alert.md] — cf-traffic-watch (don't false-alarm)
- [Source: _bmad-output/implementation-artifacts/9-50-certificate-expiry-monitoring.md] — expiry monitoring (REUSE)
- [Source: _bmad-output/implementation-artifacts/9-20-pre-viral-capacity-prep.md] — capacity-prep sibling
- [Source: docs/launch-campaign/association-condensed-sheet-spec.md:29,46-49] — phone-as-dedup-key + import path for the captured lead
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-3-launch-capacity-and-static-fallback] — scope note (REUSE monitoring; net-new = load test + fallback)

## Change Log

| Date | Change |
|------|--------|
| 2026-06-25 | Story authored by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 3 ACs (prod load test for a radio spike on the home box; Cloudflare-cached static fallback capturing name+phone+LGA queued for import; gate verdict recorded). REUSE the DONE monitoring stack — net-new = ONLY the load test + the static fallback. Sibling of Story 9-20. Status → ready-for-dev. 🚦 PRE-SPEND gate item #4. |

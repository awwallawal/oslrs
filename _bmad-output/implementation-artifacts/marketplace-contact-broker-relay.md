# Story: Marketplace Contact-Broker Relay (DORMANT / PARKED — Phase 3 defense-in-depth)

Status: backlog — **PARKED / DORMANT. Do NOT start until a documented pull-trigger fires.**

<!--
Authored 2026-06-07 by Bob (SM) via canonical *create-story --yolo workflow.
Source: sprint-change-proposal-2026-06-06-security-r2-remediation.md (F-007 "north-star").
Pattern: 9-36/9-37 dormant-with-concrete-triggers (per the 9-34 "do not gold-plate to finish
everything" lesson).

WHY PARKED, NOT GATING: Story 9-41 CLOSES finding F-007 (the open reveal endpoint becomes
accountable + bounded). This relay is defense-in-depth BEYOND a closed finding — so launching
with it parked still means ZERO security debt. It is NOT a launch gate (Phase 3, post-launch).

WHY IT IS REAL WORK (assessor correction, do not under-scope): the platform's existing messaging
is scoped supervisor↔enumerator, team-assignment-gated. Employer↔candidate is a NEW channel —
multiple dev-weeks — NOT a drop-in reuse of the current messaging system.
-->

## Story

As **a respondent who consented to legitimate employer contact**,
I want **employers to reach me through an in-platform relay rather than by pulling my raw phone/email**,
so that **my contact details never leave the platform until I choose to respond — collapsing the value of bulk harvesting to near zero while still letting genuine employers reach me**.

## Concept (for when this is pulled)

Replace "reveal raw PII" with "broker a conversation": an employer initiates contact via an in-platform message/relay; the respondent's raw phone/email is NOT disclosed; the respondent is notified and chooses whether to respond (and only then, optionally, shares direct contact). This changes the unit of value from "a PII record" to "a brokered conversation," which a bulk harvester cannot stockpile.

## Pull-triggers (any ONE fires → de-dormant, re-scope via create-story, then build)

1. Story 9-41 anomaly alerts (`getSuspiciousDevices` / viewer-velocity) fire **sustained above threshold** post-launch — i.e. the cheaper controls (caps + friction + alerting) are proving insufficient.
2. Per-profile-cap rejections climbing materially (legitimate harvesting pressure on individuals).
3. The Ministry / counsel (Iris) requests stronger PII-minimization for NDPA.
4. The operator pool grows beyond one person (relay becomes more operationally valuable).

Until a trigger fires, the access-control hardening (9-41) is doing the job; do not build this.

## Acceptance Criteria (placeholder — to be authored properly when de-dormanted)

1. To be defined at de-dormant time via `*create-story`. Scope is a NEW employer↔candidate channel (auth, threading, notifications, opt-in disclosure, audit), NOT an extension of the supervisor↔enumerator messaging system.

## Dev Notes
- **Do not start without an SCP/trigger record.** This file exists so the idea is captured in the canonical Story Index (not lost), per the Planning Artifact Discipline rule — not as a green-lit backlog item.
- Estimated effort when pulled: multiple dev-weeks (new channel). Re-scope from scratch; do not assume reuse of existing messaging.

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-06-security-r2-remediation.md] (F-007 north-star)
- [Source: docs/roadmap-to-launch.md] (Phase 3 — parked relay + pull-triggers)
- Related: `9-41-marketplace-reveal-accountability-hardening.md` (the finding-closing story this complements)

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List

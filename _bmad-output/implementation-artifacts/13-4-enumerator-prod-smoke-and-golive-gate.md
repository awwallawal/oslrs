# Story 13.4: Enumerator Prod Smoke & Go-Live Gate — Exercise the Field Path on Prod + Codify the 4-Point Pre-Flight Checklist

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-25 by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 🚦 PRE-SPEND gate item #2. REUSE not build — the enumerator path is fully wired. NET-NEW = exercise 5-10 real submissions on prod (today: ONE ever) + codify the 4-point go/no-go runbook. -->

## Story

As the **operator about to deploy enumerators across the 33 LGAs into a paid launch**,
I want **5–10 real enumerator submissions exercised end-to-end on prod (assignment → field capture → submission → ingestion → respondent row) AND the 4-point pre-flight go/no-go checklist codified as a runbook**,
so that **the enumerator path is proven on the actual prod box before field deployment (today only ONE submission has ever exercised it), and the spend decision runs off an explicit, verifiable gate — not optimism.**

## Context & Why This Gates Spend

prod faces a state-wide launch with **only one enumerator submission ever** exercised in production [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:25]. This story is **🚦 pre-spend gate item #2: "Enumerator path proven on prod — 5–10 real submissions"** [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:47]. It also **codifies the 4-point go/no-go checklist** that governs the spend decision.

### REUSE not build — the enumerator path is fully wired
This is a **proving + runbook** story, not a code-build story [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-4-enumerator-prod-smoke-and-golive-gate]:
- **Team assignments:** `team_assignments` maps supervisor → enumerator → LGA with soft-delete (`unassigned_at IS NULL` = active) and a partial-unique active index (one active supervisor per enumerator) [Source: apps/api/src/db/schema/team-assignments.ts:21-54].
- **Enumerator UI:** `EnumeratorHome` is live [Source: apps/web/src/features/dashboard/pages/EnumeratorHome.tsx].
- **Source tagging:** enumerator submissions are `source = enumerator`.
- **Ingestion pipeline:** the field submission flows `FormController.submitForm → queueSubmissionForIngestion → submission-processing.service` [Source: apps/api/src/controllers/form.controller.ts:121,177] — every respondent gets a submissions row (the unified ingestion pipeline; enumerator path is structurally sound).

**NET-NEW = (1)** exercise 5–10 real enumerator submissions end-to-end on prod, **(2)** codify the 4-point pre-flight go/no-go checklist as a runbook [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:72].

### The 4-point pre-flight gate (the thing this story codifies)
[Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:45-49]
1. Prod happy-path self-serve completion verified (one fresh real end-to-end submission).
2. Enumerator path proven on prod (this story: 5–10 real submissions) — today: one ever.
3. Attribution capture live + verified (Story 13-1).
4. Capacity load-test green + static fallback deployed (Story 13-3).

## Acceptance Criteria

### AC1 — 5–10 real enumerator submissions exercised end-to-end on prod (NET-NEW)
1. Between **5 and 10 real enumerator submissions** are completed end-to-end on prod: a real enumerator (assigned to a supervisor + LGA via `team_assignments`) [Source: apps/api/src/db/schema/team-assignments.ts:21-54], using the live `EnumeratorHome` [Source: apps/web/src/features/dashboard/pages/EnumeratorHome.tsx], captures + submits a form via the real path [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:47].
2. Each submission is verified to flow the full pipeline `FormController.submitForm → queueSubmissionForIngestion → submission-processing.service` [Source: apps/api/src/controllers/form.controller.ts:121,177] and land a **respondent row with `source = enumerator`** plus its **submissions row** (the unified-ingestion invariant: every respondent has a submissions row).
3. The submissions are verified on prod (the actual home box), not on staging/dev — the gate is about the prod path specifically (today: one ever) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:25].
4. Test/smoke submissions are **identifiable and reversible** — they are tagged/recorded so they can be excluded from launch metrics or cleaned up (do not pollute the real registry count with smoke data; if retained, they are flagged).

### AC2 — The 4-point pre-flight go/no-go checklist codified as a runbook (NET-NEW)
1. A runbook codifies the **4-point pre-flight gate** verbatim [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:45-49]: (1) prod happy-path self-serve verified; (2) ≥5 enumerator prod submissions; (3) attribution live + verified (13-1); (4) load-test green + fallback deployed (13-3). Each item has an explicit **how-to-verify** step and a green/red box.
2. The runbook states the **decision rule**: ALL FOUR green → fire radio/paid social; ANY red → hold spend (radio is movable 24–48h, so the gate has teeth) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:43,49].
3. The runbook is cross-linked from / consistent with the existing `docs/runbooks/pre-launch-operator-runbook.md` (the ordered runway) — it does NOT fork a parallel launch process [Source: C:/Users/DELL/Desktop/oslrs/docs/runbooks/pre-launch-operator-runbook.md].

### AC3 — Gate item #2 verdict recorded
1. The "enumerator path proven on prod" verdict (≥5 verified submissions) is recorded as pre-flight gate item #2 — evidence-based (the submission IDs / respondent IDs verified), not a claim [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:47,98].

## Tasks / Subtasks

- [ ] **Task 1 — Exercise 5–10 real enumerator submissions on prod (AC1)**
  - [ ] Confirm/establish a real enumerator assigned via `team_assignments` (supervisor → enumerator → LGA, active row) [Source: apps/api/src/db/schema/team-assignments.ts:21-54].
  - [ ] Capture + submit 5–10 forms through the live `EnumeratorHome` [Source: apps/web/src/features/dashboard/pages/EnumeratorHome.tsx] on PROD (AC1.3).
  - [ ] Verify each flows `submitForm → queueSubmissionForIngestion → submission-processing.service` [Source: apps/api/src/controllers/form.controller.ts:121,177] and lands a respondent row (`source = enumerator`) + submissions row (AC1.2).
  - [ ] Tag/record the smoke submissions so they're identifiable + reversible (excludable from launch metrics) (AC1.4).

- [ ] **Task 2 — Codify the 4-point go/no-go runbook (AC2)**
  - [ ] Write the runbook with the 4 gate items verbatim, each with a how-to-verify step + green/red box (AC2.1) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:45-49].
  - [ ] State the decision rule (all green → fire; any red → hold; radio movable 24–48h) (AC2.2).
  - [ ] Cross-link to `docs/runbooks/pre-launch-operator-runbook.md`; do not fork the launch process (AC2.3).

- [ ] **Task 3 — Record the gate verdict (AC3)**
  - [ ] Record the "enumerator path proven on prod" verdict (≥5 verified submissions, with the submission/respondent IDs) as gate item #2 (AC3.1) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:98].

## Dev Notes

### Architecture & engine map (cite these exact targets — REUSE, don't build)
- **Team assignments (REUSE):** `apps/api/src/db/schema/team-assignments.ts:21-54` — supervisor→enumerator→LGA, soft-delete (`unassigned_at IS NULL` active), partial-unique active index.
- **Enumerator UI (REUSE):** `apps/web/src/features/dashboard/pages/EnumeratorHome.tsx`.
- **Ingestion path (REUSE):** `apps/api/src/controllers/form.controller.ts:121,177` (`submitForm` → `queueSubmissionForIngestion`) → `submission-processing.service` → respondent row (`source = enumerator`) + submissions row (unified-ingestion invariant).
- **Launch runbook (cross-link, don't fork):** `docs/runbooks/pre-launch-operator-runbook.md`.

### REUSE-not-rebuild discipline (read before coding)
- The enumerator path is **fully wired** (assignment, UI, source tag, ingestion). This story PROVES it on prod + writes a checklist — it does NOT add code to the enumerator flow. If you're editing the submit path, stop: the gap is "only one prod submission ever," not a broken path [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:73].

### Operator-run, Tailscale
- The 5–10 prod submissions are an **operator (Awwal, Tailscale) action** [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:94]. This story delivers the procedure + the runbook + the verdict-recording; the operator runs the smoke on the prod box.

### Dependencies & sequencing
- **HARD deps (available):** the enumerator path (DONE); `team_assignments`; `EnumeratorHome`; the ingestion pipeline.
- **Gate composition:** this story is gate item #2 but the runbook it writes encompasses ALL FOUR items (which span 13-1 attribution + 13-3 capacity + the self-serve happy-path check). The runbook is the consolidation point.
- **Tier:** 🚦 pre-spend gate item #2 [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:55].

### Scope OUT (do not build)
- Any code change to the enumerator submit/ingestion path (it's proven, not rebuilt).
- New enumerator features / UI.
- Bulk enumerator onboarding tooling (the smoke uses real/existing assignments).
- The self-serve happy-path verification itself is gate item #1 (Story 13-1 Task 6 captures the attribution side of it) — this story's runbook REFERENCES item #1 but item #1's execution is the operator's fresh-submission check, not new code here.

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:25,45-49,55,72-73,94,98] — one-submission-ever risk, 4-point gate, gate item #2, REUSE-not-build, operator-run, success criterion
- [Source: apps/api/src/db/schema/team-assignments.ts:21-54] — supervisor→enumerator→LGA assignment (active/soft-delete/partial-unique)
- [Source: apps/web/src/features/dashboard/pages/EnumeratorHome.tsx] — live enumerator UI
- [Source: apps/api/src/controllers/form.controller.ts:121,177] — submitForm → queueSubmissionForIngestion (the field ingestion path)
- [Source: docs/runbooks/pre-launch-operator-runbook.md] — the ordered runway (cross-link target)
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-4-enumerator-prod-smoke-and-golive-gate] — scope note (REUSE; net-new = 5-10 prod submissions + 4-point checklist)

## Change Log

| Date | Change |
|------|--------|
| 2026-06-25 | Story authored by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 3 ACs (5–10 real enumerator submissions end-to-end on prod; codify the 4-point pre-flight go/no-go checklist as a runbook; record the gate item #2 verdict). REUSE the fully-wired enumerator path — net-new = the prod smoke + the runbook, NO code change to the field flow. Status → ready-for-dev. 🚦 PRE-SPEND gate item #2. |

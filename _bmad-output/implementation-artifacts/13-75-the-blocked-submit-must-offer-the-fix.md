# Story 13-75: The blocked submit must offer the fix, not just the exit

Status: ready-for-dev

<!--
CREATED: 2026-09-27, adjudication session, from a FIELD OBSERVATION on prod — not from a backlog item.

⚠️ AUTHORSHIP DEVIATION, DECLARED: this file was written in the adjudication context, NOT minted by
the SM `*create-story` workflow, which `feedback_canonical_create_story_workflow` requires. Awwal
asked for the story inline to avoid a round trip. The drift signature that rule exists to catch is
structural (top-level Dependencies/Technical Notes/Risks, tasks-as-headings, missing Project
Structure Notes / References, fictional file paths), so this file meets the canonical six-section
template exactly and every path/line cite below was read from the working tree at 1e67166 before
being written. Awwal to ratify the deviation or re-mint via SM.

ORIGIN:
  • 2026-09-26/27 — two ZZSMOKE captures through the real enumerator app on `oslsr_master_v3`.
  • Capture 1 (01a0dd27) SUCCEEDED with no tap — 13-71 R15 discharged, gps_accuracy 58.8 m.
  • Capture 2 (01a0e199) hit the amber block and the operator DID NOT COMPLETE IT on the first
    attempt; it was submitted only after a separate prompt. Reason recorded: `timeout`.
  • The first human ever to reach the amber panel declined to finish the interview at it. That is
    the evidence this story exists on, and it is a row (or rather, the absence of one for ~21 h).

SOURCES (all read at 1e67166):
  • apps/web/src/features/forms/pages/FormFillerPage.tsx
  • apps/web/src/features/forms/lib/geo-capture.ts
  • apps/web/src/features/forms/components/GeopointInput.tsx
  • packages/types/src/native-form.ts
  • Story 13-71 (AC1–AC6, ultra review U3/U5/U9/U10/U13), Story 13-73 (AC5)
-->

## Story

As an **enumerator standing in front of a respondent whose survey will not submit**,
I want **the refusal to hand me the button that fixes it, and to tell me what is actually wrong**,
so that **I recover the location in one tap instead of navigating back through the form, and I stop waiving GPS on failures a retry would have cleared**.

## Acceptance Criteria

1. **AC1 — The amber block carries a live capture control.** `gps-required-block` renders a primary, full-width **`📍 Capture GPS Location`** button that performs a real capture in place. The enumerator never has to navigate back to the geopoint question to recover. [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:1132-1165]

2. **AC2 — One commit path, not four.** A successful capture from ANY site (open-time auto-capture, submit-time refresh, the `GeopointInput` button, the new in-banner button) goes through a single `commitGeopoint(position)` helper that performs the identical write-and-clear. ⛔ Today there are **three** sites and they do **not** agree: auto-capture (`:367-394`) and the manual button (`:1009-1021`) both `delete allAnswersRef.current[UNAVAILABLE_REASON_KEY]`, while the submit refresh (`:466-477`) writes the position and clears **neither** the reason key nor `gpsBlocked`. Adding a fourth by copy-paste is how U5 and U10 happened. [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:367-394, 466-477, 1009-1021]

3. **AC3 — A successful in-banner capture auto-retries the submit.** RULED by Awwal 2026-09-27. The enumerator already expressed intent by tapping "Complete Survey" and GPS was the sole blocker, so recovery is one tap total. A failure of that retry surfaces through the existing `submit-error-block` / `gps-submit-error` reporting and MUST NOT leave the enumerator on a screen that looks submitted. [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:1119-1130, 1145-1151]

4. **AC4 — Guidance is reason-specific, and names the phone's Location toggle.** The block and the geopoint question render remediation text keyed on the recorded `GpsUnavailableReason`:
   - `position_unavailable` → **the phone's Location/GPS toggle is off**: "Your phone's location is switched off. Swipe down, tap the Location icon, then tap Capture."
   - `permission_denied` → the site is blocked: how to re-allow it, **plus a secondary line naming the OS Location toggle** (see AC5).
   - `timeout` → both gates open, no fix yet: "Step outside or near a window, then tap Capture again."
   - `unsupported` → nothing the enumerator can do; waiver offered immediately.
   - `other`/absent → the current generic text.
   ⭐ This is the gap the field question exposed: **the permission dialog and the OS Location toggle are two independent gates and only the first one ever shows a dialog.** An enumerator can tap Allow, watch the box vanish, and still get nothing. Nothing in the UI has ever mentioned gate 2. [Source: packages/types/src/native-form.ts:142-153, 169-182]

5. **AC5 — The denial copy must not assume the site is the problem.** `permission_denied` is **not** cleanly separable from "OS Location services off" across platforms: iOS Safari can report code **1** when Location Services is disabled system-wide, and some Android builds surface a system "turn on Location?" prompt instead of returning code 2. The `permission_denied` copy therefore names BOTH causes. ⛔ Four trial enumerators are on iOS Safari — telling them to fix a site permission that was never the problem is the measured-victim failure this AC exists to prevent. [Source: apps/web/src/features/forms/lib/geo-capture.ts:225-240 — the same 4-enumerator iOS cohort that shaped `permissionAllowsSilentRefresh`]

6. **AC6 — The waiver is demoted, and gated by retryability.** `gps-unavailable-btn` is no longer a peer of the capture button:
   - Styling is secondary/understated relative to the primary capture action — the precedent is the discard-interview control in this same file, which is deliberately understated because it destroys data and "must never be a mis-tap next to Continue". [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:1166-1174]
   - When the current reason is **retryable** (`timeout`, `position_unavailable` — `isRetryableCaptureFailure` returns true), the waiver is revealed only **after at least one in-banner capture attempt has failed**.
   - When the reason is **settled** (`permission_denied`, `unsupported`) or unknown, the waiver is available immediately — forcing attempts that cannot succeed is cruelty, not rigour.
   [Source: apps/web/src/features/forms/lib/geo-capture.ts:99-105]

7. **AC7 — Discovery moves earlier, without reintroducing a standing banner.** When the open-time auto-capture fails, `GeopointInput` shows the AC4 remediation for that reason when the enumerator reaches the location question — mid-interview, when fixing it is free. ⛔ The end-of-form amber block STAYS submit-triggered and MUST NOT become a standing warning: 13-71 ruled that "a banner shown before anyone has tried to do anything is noise an enumerator learns to scroll past in a week", and that ruling stands. Guidance about location, on the location question, is help text — not noise. [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:1104-1110]

8. **AC8 — U10 must not regress.** `handleBack` clears `gpsBlocked`/`gpsSubmitError` so the panel cannot follow the enumerator through the form with a one-tap file-the-interview button under every question. Any new state introduced here is cleared on the same path. A test must fail if the clearing is removed. [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:793-806]

9. **AC9 — The reason written to the row is the reason last observed.** After a failed in-banner retry, a subsequent waiver records the **new** reason, not the stale open-time one. A retry that fails differently (e.g. open-time `timeout`, in-banner `permission_denied`) must not file `timeout`. [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:755-780]

10. **AC10 — No new capture entry point bypasses the accuracy write.** 13-71 AC5 persists `gps_accuracy`; a position committed from the banner carries its `accuracy` exactly as the other sites do. Verified on prod: capture 01a0dd27 wrote `58.8`. [Source: apps/api/src/db/schema/submissions.ts:76-88]

## Tasks / Subtasks

- [ ] **Task 1 — Extract the single commit path** (AC: #2, #10)
  - [ ] 1.1 Add `commitGeopoint(position: CapturedPosition)` in `FormFillerPage.tsx` performing the union write: `allAnswersRef[geopointQuestion.name]`, `delete allAnswersRef[UNAVAILABLE_REASON_KEY]`, `setFormData`, `setValue(..., { shouldValidate: false })`, `setGpsUnavailableReason(null)`, `setGpsBlocked(false)`, `setGpsSubmitError(false)`.
  - [ ] 1.2 Re-point all three existing sites (`:367-394`, `:466-477`, `:1009-1021`) at it. ⚠️ The submit-refresh site currently clears nothing — **determine and record in the story whether that divergence is presently reachable as a bug** (a row carrying both coordinates and a reason) before collapsing it; do not silently "fix" an unreproduced defect.
  - [ ] 1.3 RED-verify: break `commitGeopoint`'s `setValue` line and confirm a test fails proving the rendered field goes stale (13-71's U-note at `:371-381` is the reasoning).
- [ ] **Task 2 — The in-banner capture control** (AC: #1, #3)
  - [ ] 2.1 Render the primary capture button inside `gps-required-block`, above the waiver. New testid `gps-block-capture-btn`.
  - [ ] 2.2 Wire it to `capturePosition(OPEN_CAPTURE_OPTIONS, OPEN_CAPTURE_WATCHDOG_MS)` → on success `commitGeopoint` → auto-retry the submit (AC3). Show an in-flight state; the button must be disabled while capturing.
  - [ ] 2.3 On a failed auto-retry, ensure the existing error reporting fires and `setCompleted(true)` is NOT reached (13-71 U4/U5/U8 — `finishSubmission`'s catch returns).
- [ ] **Task 3 — Reason-specific guidance** (AC: #4, #5, #7, #9)
  - [ ] 3.1 Add a single exported map/helper (`gpsRemediation(reason)`) so the block and `GeopointInput` cannot drift apart. Prefer `packages/types` or a web lib module — NOT duplicated JSX.
  - [ ] 3.2 Render it in `gps-required-block`, keyed on the CURRENT reason, updating after a failed retry (AC9).
  - [ ] 3.3 Render it in `GeopointInput` when an open-time capture has failed (AC7).
  - [ ] 3.4 `permission_denied` copy names the OS toggle as well as the site permission (AC5).
- [ ] **Task 4 — Demote and gate the waiver** (AC: #6, #8)
  - [ ] 4.1 Restyle `gps-unavailable-btn` as the secondary action.
  - [ ] 4.2 Gate reveal on `isRetryableCaptureFailure(currentReason)` + an attempt counter; settled reasons reveal immediately.
  - [ ] 4.3 Clear the attempt counter in `handleBack` alongside `gpsBlocked` (AC8), and RED-verify by deleting the clear.
- [ ] **Task 5 — Tests**
  - [ ] 5.1 `FormFillerPage.geopoint.test.tsx`: in-banner capture success → committed + submit retried; failure → guidance updates, waiver appears.
  - [ ] 5.2 Waiver hidden on first `timeout`; visible immediately on `permission_denied`.
  - [ ] 5.3 AC9 — waiver after a retry files the NEW reason.
  - [ ] 5.4 AC8 regression — Back clears block + counter.
  - [ ] 5.5 ⚠️ Explicit `{ timeout: N }` on every async query added — testing-library's `asyncUtilTimeout` is 1000 ms and is NOT governed by `testTimeout: 10000` (cost a failed push on 2026-09-26; see `pitfall-asyncutiltimeout-not-governed-by-testtimeout`).

## Dev Notes

### Dependencies
- Ships on top of `1e67166` (13-71's field fix, live on prod 2026-09-27). `isRetryableCaptureFailure` and the per-call-site watchdog are already deployed and are **reused, not re-derived**.
- No API, schema or migration change. `gps_accuracy` and `gps_unavailable_reason` already exist and are already written.

### Field Readiness Certificate Impact
- **F2 (GPS capture rate)** is the criterion this story moves. Baseline **11.4% (4 of 35)**; 13-71 R3 predicts >90% within a week of real field use. This story removes the dead-end that converts a recoverable `timeout` into a permanent reason row.
- ⏭️ **Sequence: this ships BEFORE the 8 re-provisions and before the trial restarts.** Re-provisioning enumerators into a form whose refusal offers only an escape hatch wastes precisely the first captures that F2 is measured on.

### Technical Notes — the two gates
The browser permission dialog and the OS Location toggle are independent, and only the first is visible to the enumerator:

| Gate | Enumerator sees | Failure code → reason |
|---|---|---|
| Site permission ("Allow location?") | a dialog, once | 1 → `permission_denied` |
| OS Location / GPS toggle | **nothing** | 2 → `position_unavailable` |
| Neither — no fix yet | nothing | 3 → `timeout` |
| No Geolocation API | nothing | (no code) → `unsupported`, set by the caller |

[Source: packages/types/src/native-form.ts:169-182; the `unsupported` caveat at :166-168]

### Technical Notes — what the field actually produced
`01a0e199` recorded **`timeout`**, not `permission_denied`. By the engine's own shipped predicate that is the *retryable* class — the operator waived GPS on a failure a retry might have cleared, because the panel offered no retry. ⚠️ It cannot be proven that a retry WOULD have succeeded; the claim is only that the UI removed the possibility.

### Risks
- **R-a (Medium) — a second capture button becomes a second source of truth.** Mitigated by AC2's single `commitGeopoint`. This is the U5/U10 failure shape in this exact component.
- **R-b (Medium) — demoting the waiver traps someone.** If the gating logic is wrong, an enumerator with a genuinely dead GPS cannot submit at all. AC6's settled-reason branch is the safety valve; review must confirm there is no reason value that hides the waiver forever.
- **R-c (Low) — auto-retry (AC3) stacks two errors.** Accepted by ruling; `submit-error-block` exists (U5) precisely to report it.
- **R-d (Low) — copy drift** between the block and `GeopointInput`. Mitigated by AC4/Task 3.1's single source.

### Project Structure Notes
- No new directories. Modified: `apps/web/src/features/forms/pages/FormFillerPage.tsx`, `apps/web/src/features/forms/components/GeopointInput.tsx`, and one new remediation-copy module under `apps/web/src/features/forms/lib/` (sibling to `geo-capture.ts`).
- Tests extend `apps/web/src/features/forms/pages/__tests__/FormFillerPage.geopoint.test.tsx`.

### References
- Banner + waiver as they stand — [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:1132-1165]
- The "ONE action it offers" note, and the no-standing-banner ruling — [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:1104-1110]
- U10, the panel that followed the enumerator — [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:793-806]
- U13, retiring the panel a late capture answered — [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:384-394]
- The three divergent commit sites — [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:367-394, 466-477, 1009-1021]
- `isRetryableCaptureFailure` — [Source: apps/web/src/features/forms/lib/geo-capture.ts:99-105]
- Reason vocabulary + code mapping — [Source: packages/types/src/native-form.ts:142-182]
- iOS Safari has no Permissions API; 4 trial enumerators measured — [Source: apps/web/src/features/forms/lib/geo-capture.ts:225-240]
- `gps_accuracy` / `gps_unavailable_reason` columns — [Source: apps/api/src/db/schema/submissions.ts:76-99]
- Capture button as it exists today — [Source: apps/web/src/features/forms/components/GeopointInput.tsx:123-131]

## Dev Agent Record

### Agent Model Used
_(dev agent to complete)_

### Debug Log References
_(dev agent to complete)_

### Completion Notes List
_(dev agent to complete)_

### File List
**Created:** _(dev agent to complete)_
**Modified:** _(dev agent to complete)_
**Out of scope:** the fraud-engine accuracy threshold (see Residuals R1)

### Change Log
| Date | Change | Rationale |
|---|---|---|
| 2026-09-27 | Story created | Field observation on prod: the first enumerator to reach the amber block did not complete the interview at it |

### Review Follow-ups (AI)
_(populated by the code-review agent)_

## Residuals

⛔ **LEDGER CONVENTIONS — read before adding a row** (three rows have disarmed themselves across 13-70, 13-73 and 13-71):
- Ids must match `R<digits>` — `D1`, `A1`, `R-a` are invisible to `story-residual-guard`.
- **The state cell is the THIRD column and it is the guard's only input.** An open row's state cell must contain the literal word `OPEN` and must **NOT** contain `CLOSED`, `RESOLVED`, `DISCHARGED`, or `✅` — any of those close the row even if the surrounding prose says "still open". That is exactly how 13-71 R15 shipped disarmed.
- To propose a closure you may not sign: `OPEN — closure proposed, awaiting ruling` (handoff §2al).
- Every row carries two-part attribution: who evidenced it, who ruled it.
- Rows need a **trailing `|`** or they are invisible.

| Id | Impact | State | Evidence / Ruling |
|---|---|---|---|
| R1 | **Low** — not this story's scope, but found by it | **OPEN — for 13-72 or a successor, no ruling sought here.** Prod capture `01a0dd27` reported `gps_accuracy` **58.8 m**, above the 50 m mark the GPS-clustering heuristic documents as its secondary signal. A real phone outdoors tripped it on the first real measurement, which suggests the threshold needs re-basing against field accuracy before it is trusted | **Evidence:** adjudication, read-only prod 2026-09-27. **Ruling:** none yet — raised, not decided |

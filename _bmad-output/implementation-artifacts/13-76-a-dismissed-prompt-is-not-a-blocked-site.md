# Story 13-76: A dismissed prompt is not a blocked site

Status: ready-for-dev

<!--
CREATED: 2026-09-28, adjudication session, from Awwal's own Android read of 13-75 on prod (cfbe307).

⚠️ AUTHORSHIP DEVIATION, DECLARED — same as 13-75: written in the adjudication context, not minted
by the SM `*create-story` workflow (`feedback_canonical_create_story_workflow`). Awwal asked to
proceed inline. The canonical six-section structure is met and every path/line cite was read from
the working tree at cfbe307 before being written. Awwal to ratify or re-mint via SM.

ORIGIN — a real device, not a backlog item. Android, site prompt IGNORED, OS Location toggle OFF
throughout. Observed in sequence:
  1. open survey → Android prompt for permission + "turn on location"; ignored
  2. location question (screen 1) → "check settings and toggle on the location icon"  ← AC7 working
  3. refresh → "move closer to the window… reception is poor"                          ← WRONG advice
  4. refresh → amber block, toggle advisory, survey may continue
  5. finished the survey → amber block again → tapped "I could not capture a location" → submitted
Row `01a0e7bf`: no position, `gps_unavailable_reason = permission_denied` (a DISMISSED prompt reports
code 1, identically to a deliberate block).

⭐ THE BEHAVIOURAL DATUM THIS STORY RESTS ON: the app told him three times to switch the toggle on,
offered the waiver immediately, and the waiver is what he took — without ever retrying. He was
deliberately exercising that path, so N=1 is a signal and not a finding. But it is the same choice
the field enumerator made in `01a0e199`, and "dismissed the prompt" is the most likely first-day
failure across 8 about-to-be-provisioned enumerators.

CARRIES 13-75's R5, R6, R7. Does NOT carry 13-75 R2 (the iOS copy read — no iPhone available) or
R3 (the panel-recovery field read), both of which stay on 13-75.
-->

## Story

As an **enumerator who tapped past the location prompt without meaning to**,
I want **the app to ask me to try again rather than offer me the way out**,
so that **a two-second mistake does not become a survey with no location on it.**

## Acceptance Criteria

1. **AC1 — `permission_denied` is split by permission STATE, not treated as one thing.** A code-1 failure is classified using `navigator.permissions.query({ name: 'geolocation' })`:
   - state `denied` → **settled**. Today's behaviour: waiver available at once, settings guidance.
   - state `prompt` → **DISMISSED**, and therefore **retryable**. The prompt was never answered, so another attempt re-raises it.
   - Permissions API absent (iOS Safari) or the query throws → **settled**, today's behaviour, unchanged.
   ⛔ The stored `gpsUnavailableReason` vocabulary does NOT change: `permission_denied` remains what is written to `submissions.gps_unavailable_reason`. This is a *retryability* and *copy* decision made at the UI, not a new reason value — adding one would require an API zod enum change, a schema column vocabulary change and a back-fill question, for no analytical gain. [Source: packages/types/src/native-form.ts:142-153; apps/web/src/features/forms/lib/geo-capture.ts:99-105]

2. **AC2 — a dismissed prompt gets the cheap fix first.** Its copy leads with re-raising the prompt ("Tap Capture and choose Allow when your phone asks"), NOT settings surgery. Settings guidance stays for the `denied` state, where it is the only route. ⛔ Awwal's read went the wrong way round: he dismissed a prompt and was sent toward `Website Settings`. [Source: apps/web/src/features/forms/lib/gps-remediation.ts:54-62]

3. **AC3 — the waiver is gated for a dismissed prompt.** Because it is now retryable, AC6 of 13-75 gates it behind one failed in-banner attempt, and `gps-waiver-pending` explains that. A genuinely `denied` site still gets the waiver immediately. [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:1051-1054]

4. **AC4 — ONE attempt, and it must not loop.** ⚠️ Chrome hardens repeated dismissals into a real `denied`, and some builds suppress the prompt for the rest of the session. So the retryable-dismissed path takes the same discipline as 13-75 AC11: one attempt, no timers, no automatic loop. A second dismissal must settle rather than ask again. [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx — AC11 in `refreshPositionForSubmit`]

5. **AC5 — AC11's silent retry must NOT fire on a dismissed prompt.** 13-75's silent submit-time capture is fenced by `permissionAllowsSilentRefresh`, which returns false for state `prompt` precisely so a dialog never appears over a "Complete Survey" tap. Making dismissal retryable must not breach that fence: the retry for this case is the **human** in-banner tap, never the silent one. ⛔ A test must fail if a dismissed prompt causes a silent capture at submit. [Source: apps/web/src/features/forms/lib/geo-capture.ts:225-277]

6. **AC6 — the `timeout` copy names both causes** (13-75 R5). "Step outside or near a window" was shown to a device whose Location toggle was off, where a window changes nothing. `position_unavailable` was already hedged to "may be" with a fallback (13-75 L4) and `permission_denied` carries an OS secondary line (13-75 AC5/M3); `timeout` must get the same, because a timeout with Location OFF is indistinguishable from a timeout with Location ON and a poor sky view. [Source: apps/web/src/features/forms/lib/gps-remediation.ts:73-75]

7. **AC7 — platform-appropriate guidance** (13-75 R6). The `permission_denied` primary line embeds `(on iPhone: aA → Website Settings)` while the Android-relevant step sits in the secondary line, so an Android enumerator reads past iOS guidance to reach their own. Either label the lines per platform or order them so each platform's own step is reachable without reading the other's. ⚠️ If platform detection is used it must be a *presentation* choice only — never a behavioural fence, because UA sniffing is wrong often enough that behaviour must not depend on it. [Source: apps/web/src/features/forms/lib/gps-remediation.ts:54-62]

8. **AC8 — no regression in what 13-75 proved.** The 13-75 geopoint suite stays green: AC11's fences, AC6's gating on `timeout`/`position_unavailable`, AC8's Back clearing, H1's discard guard, M1's single `completeDraft`. ⛔ `isRetryableCaptureFailure` is consumed by BOTH the latch in the open-time auto-capture and the waiver gate — changing what it returns for code 1 changes the LATCH too, which is 13-71 U9's territory. State explicitly which call sites change behaviour and which must not. [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:365, :1051]

9. **AC9 — no API, schema or migration change.** `git diff` touches `apps/web` only. The stored vocabulary is untouched (AC1).

## Tasks / Subtasks

- [ ] **Task 1 — Classify code 1 by permission state** (AC: #1, #4, #8)
  - [ ] 1.1 Add a permission-state probe to `geo-capture.ts` that returns `denied | prompt | unknown` and never throws (mirror `permissionAllowsSilentRefresh`'s absent-API handling: unknown, not false).
  - [ ] 1.2 Decide retryability at the CALL SITE from `(reason, permissionState)` rather than widening `isRetryableCaptureFailure(result)` — ⛔ that function also drives the open-time latch (`:365`), and making code 1 retryable there would un-latch auto-capture for a genuinely blocked site, re-opening 13-71 U9. Name the two call sites in the story and say which one changed.
  - [ ] 1.3 RED-verify both: a `denied` site still latches; a dismissed prompt does not gate the waiver open.
- [ ] **Task 2 — Copy** (AC: #2, #6, #7)
  - [ ] 2.1 Split the `permission_denied` entry in `gps-remediation.ts` into the dismissed and denied cases.
  - [ ] 2.2 `timeout` gains the toggle as a second cause (AC6).
  - [ ] 2.3 Platform labelling/ordering (AC7), presentation only.
  - [ ] 2.4 Keep ONE source — the block and `GeopointInput` both read it (13-75 Task 3.1).
- [ ] **Task 3 — Waiver gating** (AC: #3, #4)
  - [ ] 3.1 Dismissed → gated behind one failed in-banner attempt; `denied` → immediate.
  - [ ] 3.2 A second dismissal settles: the waiver appears, no further prompt.
- [ ] **Task 4 — Tests**
  - [ ] 4.1 AC5's negative: a dismissed prompt causes NO silent capture at submit — RED-verified.
  - [ ] 4.2 `denied` keeps today's behaviour end to end (waiver immediate, latch holds).
  - [ ] 4.3 Dismissed: waiver hidden, `gps-waiver-pending` shown, one tap re-raises, a success commits and auto-retries the submit (13-75 AC3 path).
  - [ ] 4.4 AC6/AC7 copy assertions, incl. that no copy sends a user to a window as the ONLY remedy while the toggle may be off.
  - [ ] 4.5 ⚠️ Explicit `{ timeout: N }` on every async query — `asyncUtilTimeout` is 1000 ms and `testTimeout: 10000` does not govern it; it is `findByRole`'s **third** argument.

## Dev Notes

### Dependencies
- Ships on `cfbe307` (13-75, live 2026-09-28). Reuses `permissionAllowsSilentRefresh`'s shape and AC11's one-attempt discipline. No new library.

### Field Readiness Certificate Impact
- **F2 (GPS capture rate).** Baseline 11.4% (4 of 35). This targets the most likely first-day failure across the 8 enumerators about to be provisioned: a prompt tapped past by accident, which today goes straight to a waiver.
- ⏭️ **Small enough to ship before the re-provisions.** If it slips, the re-provisions should still go ahead — 13-75 already removed the dead end; this makes the commonest mistake recoverable.

### Technical Notes — why the stored vocabulary does not change
`gpsUnavailableReasons` is a zod enum on the API and the documented source for a plain-text column, and `_gpsUnavailableReason` crosses the client boundary. A `permission_dismissed` value would mean an API enum change, a column vocabulary change, a back-fill decision for existing `permission_denied` rows, and an amendment to the ops read that groups by it — for no analytical gain, since the ops question is "did this enumerator record a reason", not which flavour of code 1. Retryability and copy are UI decisions; keep them there.

### Risks
- **R-a (Medium) — widening `isRetryableCaptureFailure` would re-open 13-71 U9.** It drives the open-time latch as well as the waiver gate. AC8 and Task 1.2 exist for this; a reviewer should check the latch explicitly.
- **R-b (Medium) — Permissions API reporting `prompt` when the prompt will not actually reappear.** Chrome suppresses after repeated dismissals, so a "retry" could silently do nothing and the enumerator would tap a button that cannot work. AC4's one-attempt-then-settle bounds it; the waiver appears after the failed attempt either way.
- **R-c (Low) — UA-based platform copy is wrong sometimes.** AC7 confines it to presentation.
- **R-d (Low) — iOS Safari gets none of this** (no Permissions API), so it keeps the settled path. That is also where 13-75 R2's unverified copy lives, and neither is closable without an iPhone.

### Project Structure Notes
No new directories. Modified: `apps/web/src/features/forms/lib/geo-capture.ts`, `apps/web/src/features/forms/lib/gps-remediation.ts`, `apps/web/src/features/forms/pages/FormFillerPage.tsx`, and their tests.

### References
- `gpsUnavailableReasons` + code mapping — [Source: packages/types/src/native-form.ts:142-182]
- `isRetryableCaptureFailure` and its two consumers — [Source: apps/web/src/features/forms/lib/geo-capture.ts:99-105; apps/web/src/features/forms/pages/FormFillerPage.tsx:365, :1051]
- `permissionAllowsSilentRefresh`, absent-API reasoning, the 4-enumerator iOS cohort — [Source: apps/web/src/features/forms/lib/geo-capture.ts:225-277]
- Current copy map — [Source: apps/web/src/features/forms/lib/gps-remediation.ts:34-84]
- 13-75 R5/R6/R7, the Android read this story comes from — [Source: _bmad-output/implementation-artifacts/13-75-the-blocked-submit-must-offer-the-fix.md]

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
**Out of scope:** 13-75 R2 (iOS copy read — needs an iPhone) and 13-75 R3 (panel-recovery field read); both stay on 13-75

### Change Log
| Date | Change | Rationale |
|---|---|---|
| 2026-09-28 | Story created | Awwal's Android read of 13-75 on prod: a dismissed prompt reported `permission_denied`, was classified settled, and the waiver was offered instead of a retry |

### Review Follow-ups (AI)
_(populated by the code-review agent)_

## Residuals

⛔ **LEDGER CONVENTIONS — read before adding a row** (four rows have disarmed themselves across 13-70, 13-73 and 13-71, the last one written by the session policing for it):
- Ids must match `R<digits>` — `D1`, `A1`, `R-a` are invisible to `story-residual-guard`.
- **The state cell is the THIRD column and it is the guard's only input.** An open row's state cell must contain the literal word `OPEN` and must **NOT** contain `CLOSED`, `RESOLVED`, `DISCHARGED` or `✅` — any of those close the row even when the surrounding prose says otherwise. Use bold **MET** / **NOT MET** for sub-points, never a tick.
- ⛔ The guard's pass line only checks stories already marked `done`. Probe every row: `residualRows(content)` + `isOpenState(r.parts[2])`.
- To propose a closure you may not sign: `OPEN — closure proposed, awaiting ruling` (handoff §2al).
- Every row carries two-part attribution: who evidenced it, who ruled it. Rows need a **trailing `|`**.

| Id | Impact | State | Evidence / Ruling |
|---|---|---|---|
| R1 | **Low** — scope note, not a defect | **OPEN — carried from 13-75, no ruling sought here.** This story does NOT close 13-75 R2 (the `permission_denied` copy has never been read on a real iPhone; four trial enumerators are on iOS Safari) or 13-75 R3 (a position obtained FROM the amber panel is still proven only in jsdom). Both need hardware Awwal does not have or an action he has not yet taken, and neither should be absorbed silently into this story's close-out | **Evidence:** adjudication 2026-09-28 — Awwal has desktop + Android only. **Ruling:** none sought |

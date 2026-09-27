# Story 13-75: The blocked submit must offer the fix, not just the exit

Status: review

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
   📌 *Reach, recorded at review (R4):* on `oslsr_master_v3` the location question is screen 1, so this hint reaches the failures that land while the enumerator is still on it — `permission_denied`, `unsupported`, and usually a switched-off toggle — which are exactly the ones a person must fix. A `timeout` lands after they have moved on; AC11 handles it.

8. **AC8 — U10 must not regress.** `handleBack` clears `gpsBlocked`/`gpsSubmitError` so the panel cannot follow the enumerator through the form with a one-tap file-the-interview button under every question. Any new state introduced here is cleared on the same path. A test must fail if the clearing is removed. [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:793-806]

9. **AC9 — The reason written to the row is the reason last observed.** After a failed in-banner retry, a subsequent waiver records the **new** reason, not the stale open-time one. A retry that fails differently (e.g. open-time `timeout`, in-banner `permission_denied`) must not file `timeout`. [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:755-780]

10. **AC10 — No new capture entry point bypasses the accuracy write.** 13-71 AC5 persists `gps_accuracy`; a position committed from the banner carries its `accuracy` exactly as the other sites do. Verified on prod: capture 01a0dd27 wrote `58.8`. [Source: apps/api/src/db/schema/submissions.ts:76-88]

11. **AC11 — A retryable miss gets ONE silent retry before any refusal.** ADDED by ruling (Awwal, 2026-09-27, scope addition to close R4). At Complete Survey, when no position is held and the last recorded reason is **retryable** (`isRetryableCaptureFailure`), the page takes one silent capture (`SUBMIT_REFRESH_OPTIONS`) before refusing: success → `commitGeopoint` and the survey submits with no block and no tap; failure → the new reason is recorded (AC9) and the block appears as before, with the waiver still gated on a *human* in-banner attempt (AC6). Fenced exactly as capture is: enumerators only (13-71 AC7), never on a reopened submission (13-71 R7), never while the open-time capture is still running (`null` reason), never where the browser would prompt (`permissionAllowsSilentRefresh`). One attempt, no timers. While any submit-time capture runs, Complete reads "Getting location…" and Back is disabled — which also closes a pre-existing 13-71 gap where Back during the refresh still submitted. ⭐ Why this and not a hint: a `timeout` is fixed by the PHONE given another go, not by an enumerator reading; AC7's hint serves the reasons a person must fix. [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx `refreshPositionForSubmit`]

## Tasks / Subtasks

- [x] **Task 1 — Extract the single commit path** (AC: #2, #10)
  - [x] 1.1 Add `commitGeopoint(position: CapturedPosition)` in `FormFillerPage.tsx` performing the union write: `allAnswersRef[geopointQuestion.name]`, `delete allAnswersRef[UNAVAILABLE_REASON_KEY]`, `setFormData`, `setValue(..., { shouldValidate: false })`, `setGpsUnavailableReason(null)`, `setGpsBlocked(false)`, `setGpsSubmitError(false)`.
  - [x] 1.2 Re-point all three existing sites (`:367-394`, `:466-477`, `:1009-1021`) at it. ⚠️ The submit-refresh site currently clears nothing — **determine and record in the story whether that divergence is presently reachable as a bug** (a row carrying both coordinates and a reason) before collapsing it; do not silently "fix" an unreproduced defect.
  - [x] 1.3 RED-verify: break `commitGeopoint`'s `setValue` line and confirm a test fails proving the rendered field goes stale (13-71's U-note at `:371-381` is the reasoning).
- [x] **Task 2 — The in-banner capture control** (AC: #1, #3)
  - [x] 2.1 Render the primary capture button inside `gps-required-block`, above the waiver. New testid `gps-block-capture-btn`.
  - [x] 2.2 Wire it to `capturePosition(OPEN_CAPTURE_OPTIONS, OPEN_CAPTURE_WATCHDOG_MS)` → on success `commitGeopoint` → auto-retry the submit (AC3). Show an in-flight state; the button must be disabled while capturing.
  - [x] 2.3 On a failed auto-retry, ensure the existing error reporting fires and `setCompleted(true)` is NOT reached (13-71 U4/U5/U8 — `finishSubmission`'s catch returns).
- [x] **Task 3 — Reason-specific guidance** (AC: #4, #5, #7, #9)
  - [x] 3.1 Add a single exported map/helper (`gpsRemediation(reason)`) so the block and `GeopointInput` cannot drift apart. Prefer `packages/types` or a web lib module — NOT duplicated JSX.
  - [x] 3.2 Render it in `gps-required-block`, keyed on the CURRENT reason, updating after a failed retry (AC9).
  - [x] 3.3 Render it in `GeopointInput` when an open-time capture has failed (AC7).
  - [x] 3.4 `permission_denied` copy names the OS toggle as well as the site permission (AC5).
- [x] **Task 4 — Demote and gate the waiver** (AC: #6, #8)
  - [x] 4.1 Restyle `gps-unavailable-btn` as the secondary action.
  - [x] 4.2 Gate reveal on `isRetryableCaptureFailure(currentReason)` + an attempt counter; settled reasons reveal immediately.
  - [x] 4.3 Clear the attempt counter in `handleBack` alongside `gpsBlocked` (AC8), and RED-verify by deleting the clear.
- [x] **Task 5 — Tests**
  - [x] 5.1 `FormFillerPage.geopoint.test.tsx`: in-banner capture success → committed + submit retried; failure → guidance updates, waiver appears.
  - [x] 5.2 Waiver hidden on first `timeout`; visible immediately on `permission_denied`.
  - [x] 5.3 AC9 — waiver after a retry files the NEW reason.
  - [x] 5.4 AC8 regression — Back clears block + counter.
  - [x] 5.5 ⚠️ Explicit `{ timeout: N }` on every async query added — testing-library's `asyncUtilTimeout` is 1000 ms and is NOT governed by `testTimeout: 10000` (cost a failed push on 2026-09-26; see `pitfall-asyncutiltimeout-not-governed-by-testtimeout`).
- [x] **Task 6 — AC11, the silent retry at submit** (AC: #11; added by ruling 2026-09-27)
  - [x] 6.1 In `refreshPositionForSubmit`'s no-position branch: one `capturePosition(SUBMIT_REFRESH_OPTIONS)` when the recorded reason is retryable, behind the role, restored-draft, null-reason and prompt fences.
  - [x] 6.2 `locating` state: Complete reads "Getting location…", Complete and Back disabled, for BOTH submit-time captures.
  - [x] 6.3 Tests: the field case submits with no block; a failed retry refuses with the newest reason and the waiver still waits; no retry for a settled reason, a prompt, a running open-time capture, a clerk, or a reopened submission; the wait is visible and Back is off (both paths). Every fence RED-verified.
  - [x] 6.4 Scripts of 13-75 tests that open on a `3` gained one `3` for the retry's own call (and two call counts moved) — they must fail the retry to reach the block at all. The AC9 and L5 tests were updated even though they still PASSED, because the retry was silently consuming the denial each was written to test.

### Review Follow-ups (AI)
_Adversarial code-review 2026-09-27 (BMAD code-review workflow). Ranked critical → low. Probes P1/P1b/P2 were failing tests written against the uncommitted code before any fix._
- [x] [AI-Review][Critical] **H1 — Discard during an in-flight in-banner capture queues the discarded interview.** Discard neither disowns the capture nor waits for it; `handleGpsBlockCapture` resumes after its `await` regardless. P1b: the fix arriving while the Discard confirm is open queued the FULL declined interview (`full_name`, `_referenceCode`, position) — and `discardDraft` has already nulled `draftIdRef`, so the real hook mints a NEW draft + queue row. P1: a fix landing after unmount queued `{site_location}` alone. [apps/web/src/features/forms/pages/FormFillerPage.tsx:849-882, :1354-1383]
- [x] [AI-Review][Medium] **M1 — one interview, two `completeDraft` calls.** Open-time fix lands while an in-banner capture is out → panel retired, latch left up → enumerator taps Complete Survey → completes → the in-banner success calls `finishSubmission` again from the completion screen (P2). Server dedups on `submissions.submission_uid` so no second row, but the queued row is overwritten with a different position and can flip `synced` → `pending`. [FormFillerPage.tsx:555-580, :879-881]
- [x] [AI-Review][Medium] **M2 — AC7 cannot reach the field case on `oslsr_master_v3`.** `gps_location` is screen 1 (`docs/questionnaire_schema.md:24`); an open-time `timeout` lands ≥10 s after open, after the enumerator has left it. The AC7 test passes over this with a synchronous failure. ⛔ Not fixable in code without moving the hint off the location question, which is RULED — recorded as residual **R4** for Awwal. [FormFillerPage.tsx:1159-1164] ✅ **Resolved by AC11** (ruled by Awwal 2026-09-27): the timeout case is retried silently at submit instead of hinted; R4 closed on that evidence.
- [x] [AI-Review][Medium] **M3 — AC5 copy misses the per-app gates.** iOS `Location Services → Safari Websites = Never` returns code 1 with Location Services ON; iOS's per-site control is `aA → Website Settings`; Android has Chrome's own app permission. [apps/web/src/features/forms/lib/gps-remediation.ts:48-53]
- [x] [AI-Review][Low] **L1 — a late in-banner FAILURE after Back is dropped while a late success is kept.** The panel on return shows the older reason (AC9's letter) and may gate the waiver on a reason that is no longer current. [FormFillerPage.tsx:857-867]
- [x] [AI-Review][Low] **L2 — two `commitGeopoint` lines are unguarded by any test** (mutations N1/N5 green): `setGpsSubmitError(false)`, whose effect Completion Notes 2 claims, and `setGpsUnavailableReason(null)`. [FormFillerPage.tsx:215, :226]
- [x] [AI-Review][Low] **L3 — Completion Notes 7 overstates timeout hygiene:** one added `waitFor` has no timeout, one uses 3000 not 5000. [FormFillerPage.geopoint.test.tsx:396]
- [x] [AI-Review][Low] **L4 — `position_unavailable` copy asserts "location is switched off" as fact;** code 2 also occurs with Location ON and no fix. The wording is AC4's own. [gps-remediation.ts:36-39]
- [x] [AI-Review][Low] **L5 — on a form whose geopoint is the LAST question, `GeopointInput`'s own older failure outranks the page's newer one,** so the question and the block beside it disagree (R-d). [apps/web/src/features/forms/components/GeopointInput.tsx:38]

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
Claude Opus 5.5 (`claude-opus-5-5`), dev-story, 2026-09-27. **Uncommitted** — left for adjudication.

### Debug Log References
- Full web suite (`cd apps/web && pnpm vitest run`, written to a file, not piped): **284 files passed (284) · 3222 passed · 2 todo (3224)**, exit 0.
- `npx tsc --noEmit -p tsconfig.json` (apps/web): exit 0, **0 lines** of output.
- `npx eslint src` (apps/web): exit 0, no findings.
- Test delta vs `HEAD` (read via `git show HEAD:`): `FormFillerPage.geopoint.test.tsx` **42 → 61** (+19, one `it.each` × 2), `GeopointInput.test.tsx` **6 → 9** (+3), `gps-remediation.test.ts` **new, 6**. **+28 total.** Nothing else changed a count.
- First run of the pre-existing tests after the code change: **exactly 3 red, all expected** — 13-71's "exactly ONE action" assertion, 13-71's `timeout` test (it waived without a retry, which AC6 now withholds), and GeopointInput's old denial copy. Each rewritten on purpose; see Completion Notes 4.

### Completion Notes List

**1. ⛔ AC2 / Task 1.2 — was the submit-refresh divergence reachable? NO. Could not reproduce it, and the reasoning is below so it can be checked.**

The claim to test: can the submit-time refresh write a position into an accumulator that still carries `_gpsUnavailableReason` (a row with both), or leave `gpsBlocked` up over a position?
- The refresh has a precondition: it returns early unless `allAnswersRef[geopoint]` **already holds** a captured position (`isCapturedPosition(openTime)`, `FormFillerPage.tsx` in `refreshPositionForSubmit`).
- So the question becomes: can the accumulator hold a position **and** the reason key at once? Every writer of the reason key is gated on the position's absence — the restored-draft stamp runs only after the `isCapturedPosition` early return, and the waiver is reachable only through `gpsBlocked`, which is set only when `geopointRequirementUnmet` (no position). Every writer of a position (auto-capture, manual button) already deleted the key. The invariant holds in both directions.
- Could it come in from storage? A resumed ordinary draft is the accumulator's own earlier state (same invariant). A `restoreToDraft` draft reads `payload.responses`, and `useDraftPersistence` R8 **strips** `_gpsUnavailableReason` from `responses` whenever a position exists — so the queued payload cannot carry both either. And the server strips the key again (13-71 R6).
- `gpsBlocked` at the refresh: set only when there is no position, cleared by every position write, and not persisted. With a position held it is already false.
- **Conclusion: the divergence was real in the code and unreachable in behaviour.** At that site `commitGeopoint`'s extra clears are no-ops. Per §11c I did not "fix" an unreproduced defect: the site is routed through `commitGeopoint` because AC2 requires one path, and the change is behaviour-preserving there — the comment at the call site and on `commitGeopoint` says so.
- ⚠️ One real difference, recorded: the React **state** `gpsUnavailableReason` *can* be non-null beside a position (a failed **Recapture** after a success). The refresh now nulls it where it did not before. It never reaches a row (only the accumulator key does), and with a position held the block and the AC7 copy are not shown, so nothing observable changes.

**2. AC2 — what the other sites gained.** The union write is exactly Task 1.1's list. The only site that gains an observable clear is the **manual button**, which now also clears `gpsSubmitError` (it cleared `gpsBlocked` but not the error). That matters only when the geopoint is the LAST question, so the button and a stale "did not save" notice share a screen; the notice is retired when the capture lands, and the next Complete Survey tap reports again if the write still fails. `_gpsOpenCapture` stays at the two call sites that know where the interview started — the manual and in-banner buttons do not write it, matching 13-71.

**3. AC3 — edges the AC did not name, and what was done.**
- **Back while an in-banner capture is in flight.** The enumerator has withdrawn the submit. A late success is still committed (a real position is a real position — U13's reasoning), but it does **not** auto-submit: that would be U10's panel-follows-you shape from another direction. `gpsBlockEpochRef`, bumped by `handleBack`, disowns the attempt. Tested + RED.
- **Waiver during an in-flight capture** is disabled. Otherwise a waiver could queue the interview and the capture then auto-retry `finishSubmission` a second time — U8's two-rows-one-interview, which AC12 would score as duplicate fraud.
- The in-banner capture uses `OPEN_CAPTURE_OPTIONS` + `OPEN_CAPTURE_WATCHDOG_MS` exactly as Task 2.2 says: a permission prompt may be in front of the enumerator, and the 2026-09-26 field defect was a watchdog racing a human. The cost is that a retryable reason can keep the waiver hidden for up to 120 s while an attempt is out; the button says "Capturing location...", and the attempt always settles.

**4. Pre-existing 13-71 assertions changed deliberately (not weakened to pass):**
- "offers exactly ONE action" → now "the fix and ONE waiver": 2 buttons, still no `<select>`. AC1 supersedes the one-button rule; 13-71's actual concern (a confirmation, not a diagnosis) is still asserted.
- "a TIMEOUT records timeout" → now taps the in-banner capture once (it times out again) before waiving. Still asserts `timeout` is filed.
- GeopointInput "permission denied" → asserts the AC5 copy (site **and** `Location Services`) instead of "Location access denied. GPS data will not be recorded."

**5. AC4 copy — one deviation from the letter, flagged.** AC4 says `other`/absent → "the current generic text". The current text began "Go back to the location question…", which is the dead end this story exists to remove, so it is now "Tap Capture to try again." and the waiver sentence moved next to the waiver. A test asserts no copy for any reason says "go back". `permission_denied` / `timeout` / `position_unavailable` use the AC's wording; the two-platform OS line for denial is new wording — see R2.

**6. RED verification — 10 mutations, each applied alone to `FormFillerPage.tsx`, the geopoint file run, the file restored (diff stat identical before/after):**

| Mutation | Result |
|---|---|
| M1 delete `commitGeopoint`'s `setValue` (Task 1.3) | **14 red**, incl. the new "in-banner fix reaches the RENDERED field" |
| M2 delete `setGpsBlockFailedAttempts(0)` in Back (AC8) | **1 red** — "Back clears the block AND the failed-attempt count" |
| M3 delete `setGpsBlocked(false)` in Back (U10) | **4 red**, incl. 13-71's U10 test |
| M4 delete Back's in-flight-ref release | **1 red** — "next panel's capture button live" |
| M5 disable the epoch check | **1 red** — "Back during in-flight withdraws the submit" |
| M6 waiver always available (AC6) | **3 red** |
| M7 in-banner failure keeps the stale reason (AC9) | **1 red** |
| M8 delete the in-flight ref guard | **green on the first try — a test passing over a hole.** Two `fireEvent.click`s let RTL flush the disabling re-render between them, so the second tap hit a disabled button (the U8 lesson again). Rewritten to fire both taps inside one `act()`; **now 1 red** |
| M9 stop passing `captureFailureReason` (AC7) | **1 red** |
| M10 remove the auto-retry (AC3) | **3 red** |

**7. Test hygiene.** ⚠️ *Corrected by code-review (L3): not quite every one — one added `waitFor` in the rewritten 13-71 timeout test had none (now `{ timeout: 5000 }`), and one uses 3000.* Every async query added carries `{ timeout: 5000 }` (`findByTestId(id, {}, T)` — the third argument). The shared `completeSurvey` helper's untimed `waitFor` was given one too, because every new test goes through it. `goBackToLocation()` waits for Q1 to render, not just for the panel to vanish: `handleBack` moves the index after a 50 ms slide, and a Complete-Survey tap in that window would land on the old question.

### File List
**Created:**
- `apps/web/src/features/forms/lib/gps-remediation.ts` — the single copy source (Task 3.1)
- `apps/web/src/features/forms/lib/__tests__/gps-remediation.test.ts`

**Modified:**
- `apps/web/src/features/forms/pages/FormFillerPage.tsx` — `commitGeopoint` (AC2) and the three sites re-pointed; `handleGpsBlockCapture` (AC1/AC3/AC9/AC10); waiver gate (AC6); Back clears (AC8); `captureFailureReason` passed to the question (AC7)
- `apps/web/src/features/forms/components/GeopointInput.tsx` — local failure kept as a reason; copy from `gpsRemediation`; shows the page's recorded failure while there is no position (AC7)
- `apps/web/src/features/forms/components/QuestionRenderer.tsx` — threads `captureFailureReason`
- `apps/web/src/features/forms/pages/__tests__/FormFillerPage.geopoint.test.tsx`
- `apps/web/src/features/forms/components/__tests__/GeopointInput.test.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — **new** `13-75` entry at `review` (there was none; see 13-70's "a brief with no board entry")

**Out of scope:** the fraud-engine accuracy threshold (see Residuals R1)

### Change Log
| Date | Change | Rationale |
|---|---|---|
| 2026-09-27 | Story created | Field observation on prod: the first enumerator to reach the amber block did not complete the interview at it |
| 2026-09-27 | Implemented (dev-story), status → `review`, uncommitted | AC1–AC10; submit-refresh divergence shown unreachable and recorded (Completion Notes 1); 10 guard mutations each RED; R2/R3 opened |
| 2026-09-27 | Adversarial code-review; H1, M1, M3, L1–L5 fixed, uncommitted; status stays `review` | H1 (Discard queued the declined interview) and M1 (a second `completeDraft`) proven by failing probes before the fix; every fix RED-verified by reverting it; M2 → R4 for a ruling |
| 2026-09-27 | AC11 added by ruling and implemented; R4 CLOSED by ruling; deviations (a) ratified with modification, (b)(c) ratified; uncommitted | Awwal ruled a timeout is fixed by retrying, not by hinting — one silent capture at submit, fenced as capture is; every fence RED-verified; the pre-existing live Back during the 13-71 refresh closed with it; suite 3241 passed |

### Senior Developer Review (AI)
**Reviewer:** Claude Opus 5.5, BMAD `code-review` workflow, 2026-09-27. **Outcome:** Changes Requested → fixed in the working tree on Awwal's instruction ("create action items and fix them all"). **Uncommitted.** Action items: see Tasks → *Review Follow-ups (AI)*.

**Verified before any fix (the dev's claims, re-run, not inherited):** suite **284 files · 3222 passed · 2 todo**, exit 0 — matches. tsc/eslint exit 0, 0 lines. Test delta **+28** re-counted (61 − 42 incl. one 2-row `it.each`; 9 − 6; 6 new). Git vs File List: 0 discrepancies. Dev mutations M2/M5/M8/M10 repeated: **1/1/1/3 red**, identical. Completion Notes 1 (refresh divergence unreachable) independently re-derived — **concur**. Waiver reachability (R-b): no reason value or sequence traps an enumerator; the hidden-waiver cost is bounded by the positioning timeout (~10 s) except while a permission prompt is on screen (≤120 s) — **accepted**. `captureFailureReason` does not reach the DOM (every input destructures). The three rewritten 13-71 tests were changed to match behaviour, not weakened.

**Found by probe, not by reasoning** — each was a failing test against the uncommitted code first:
- **H1** P1b: `completeDraft({"_referenceCode":"OSL-2026-V02BFY","full_name":"Declined Respondent","site_location":{…}})` after Discard was confirmed. P1: `completeDraft({"site_location":{…}})` after unmount.
- **M1** P2: `completeDraft` ×2 for one interview. ⚠️ Impact bounded honestly: `submissions.submission_uid` is UNIQUE, so no second server row and no AC12 duplicate score; the defect is the queued row being rewritten after completion.

**Fixes and their RED verification** (each fix reverted ALONE, geopoint + GeopointInput files run, restored, checksums verified):
| Fix | Reverted → |
|---|---|
| H1 `interviewEndedRef` set by Discard BEFORE its first await | 1 red (confirm-open case) |
| H1 set by unmount cleanup | 1 red (any unmount) |
| H1 reset to false in the effect body (StrictMode, U9's shape) | 1 red (StrictMode in-banner still submits) |
| H1 guard in the handler alone / in `finishSubmission` alone | **green each — deliberate defence in depth on one flag**; both removed → **3 red** |
| M1 `submittedRef` — `finishSubmission` is terminal once it succeeds | 1 red |
| L1 late failure after Back recorded as the reason | 1 red |
| L5 page reason outranks the local one when a page tracks it | 2 red |
| L2 `commitGeopoint`'s `setGpsSubmitError(false)` (was N1, green before) | 1 red |

**After the fixes:** suite **284 files · 3232 passed · 2 todo (3234)**, exit 0 — the **+10** is exactly the review's tests (page 61 → 69; GeopointInput 9 → 11, one dev test rewritten into two plus one new; gps-remediation unchanged at 6 with three assertions added). tsc exit 0, 0 lines; eslint exit 0, 0 lines. Ledger read back through `isOpenState(parts[2])`: R1–R4 all OPEN, all with a trailing `|`; `findDoneStoriesWithOpenResiduals` on a `done` copy names all four.

**Not fixed in code, and why:** **M2** — reaching the field case would mean moving AC7's hint off the location question, which is RULED; recorded as **R4** for a ruling. **M3** copy was amended but remains unverified on a device — **R2** still owns that. **N5** (`setGpsUnavailableReason(null)` in `commitGeopoint`) remains mutation-green: with a position held nothing reads the reason state, so it is judged an EQUIVALENT mutation, not a hole — recorded, not tested.

**Deviations — RULED by Awwal 2026-09-27** (evidenced by code-review; ruled by Awwal, in session: "Implement and run the gates then the earlier 4 recommendations (R4 and the 3 deviations) can be resolved also"): (a) L4 "is switched off" → "**may be** switched off" — **RATIFIED WITH MODIFICATION**: the copy now adds "If it is already on, step outside or near a window and tap Capture again."; (b) the rewritten dev test — **RATIFIED**; (c) status stays **`review`** — **RATIFIED**.

**AC11 (scope added by the same ruling, to close R4):** implemented in `refreshPositionForSubmit`; 9 new tests; every fence RED-verified by removing it alone — no silent retry 12 red · role fence 1 · restored-draft fence 1 · retryable fence 4 · prompt fence 1 · failure not recorded 1 · retry wait invisible 1 · refresh wait invisible 1 · Back live while locating 2. Two stayed green and are **equivalent, not holes**: the `null` guard (a null reason already fails `isRetryableCaptureFailure`; it exists for the type) and the ended-interview check inside the retry (backed by `finishSubmission`'s, as in H1). Found while building it and fixed in the same state: the 13-71 submit refresh ran up to ~10 s with an unlabelled Complete button and a LIVE Back — and a Back pressed then still submitted the survey (U10's shape). **Final gates:** suite **284 files · 3241 passed · 2 todo (3243)**, exit 0 (+9, exactly the AC11 tests); tsc exit 0, 0 lines; eslint exit 0, 0 lines.

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
| R2 | **Medium** — AC5 is a correctness requirement, and this copy is new wording | **OPEN — needs a real-device read, no ruling sought.** The `permission_denied` secondary line ("iPhone: Settings → Privacy & Security → Location Services → On. Android: swipe down and tap the Location icon") and the site-permission line ("Tap the icon next to the web address, set Location to Allow") are written from platform knowledge, not checked on a phone. iOS Safari's per-site control sits under the `aA` button, not a lock icon, and Android builds differ. Verified only by jsdom tests that assert the words are present, which cannot tell whether the words are right | **Evidence:** dev-story 2026-09-27, `lib/gps-remediation.ts`. **Ruling:** none — Awwal or a trial enumerator on iOS Safari to read it on a device. **Amended** by code-review 2026-09-27 (M3): the copy quoted in the state cell is SUPERSEDED — it now also names the per-app gate (iOS `Location Services → Safari Websites`, Android `Apps → Chrome → Permissions`) and iOS's `aA → Website Settings`; still unread on a device, so this row stands. Read `lib/gps-remediation.ts`, not this cell |
| R3 | **Medium** — the story's premise is a field behaviour | **OPEN — verifies only on a real blocked capture after deploy.** AC1/AC3 are proven in jsdom (mutation-checked) but the claim that matters, that an enumerator at the amber block now recovers in one tap instead of waiving, needs a ZZSMOKE capture that reaches the block (for example location blocked, then re-allowed from the panel) and a row with coordinates and no reason. Same shape as 13-71 R15 | **Evidence:** dev-story 2026-09-27. **Ruling:** none — to be read by adjudication after the one deploy for this story. **Amended** by code-review 2026-09-27 (AC11): the same post-deploy read should also catch the SILENT path — a ZZSMOKE capture whose open-time attempt times out (indoors, or location slow to fix) and whose Complete Survey then submits with coordinates and NO amber block ever shown |
| R4 | **Medium** — AC7 as ruled could not reach the case this story was written for | **CLOSED — by ruling, on AC11.** On `oslsr_master_v3` the geopoint (`gps_location`) is the FIRST screen (`docs/questionnaire_schema.md:24`), so an open-time `timeout` — the field case, capture `01a0e199` — lands after the enumerator has left the only question AC7's hint may appear on. Resolved not by moving the hint (placement stays as ruled) but by recognising that a `timeout` is fixed by the PHONE, not by a person reading: AC11 gives a retryable miss one silent capture at submit, so the field case now submits with no block and no tap. AC7 is annotated with its true reach (the reasons a person must fix) | **Evidence:** code-review 2026-09-27 — AC11 in `refreshPositionForSubmit`; test "the field case: open-time TIMEOUT, then Complete Survey → submitted with NO block and NO tap" (red when the retry is removed: 12 red); suite 3241 passed. **Ruling:** Awwal, 2026-09-27, in session — approved AC11 as scope ("Yes I approve AC 11 as a scope. Implement and run the gates then the earlier 4 recommendations (R4 and the 3 deviations) can be resolved also"), gates run and green before this row was closed. ⚠️ Closes the CODE gap only; the field read of AC11 rides on R3 |

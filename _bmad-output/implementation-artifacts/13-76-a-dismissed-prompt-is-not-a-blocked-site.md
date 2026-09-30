# Story 13-76: A dismissed prompt is not a blocked site

Status: review

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

- [x] **Task 1 — Classify code 1 by permission state** (AC: #1, #4, #8)
  - [x] 1.1 Add a permission-state probe to `geo-capture.ts` that returns `denied | prompt | unknown` and never throws (mirror `permissionAllowsSilentRefresh`'s absent-API handling: unknown, not false).
  - [x] 1.2 Decide retryability at the CALL SITE from `(reason, permissionState)` rather than widening `isRetryableCaptureFailure(result)` — ⛔ that function also drives the open-time latch (`:365`), and making code 1 retryable there would un-latch auto-capture for a genuinely blocked site, re-opening 13-71 U9. Name the two call sites in the story and say which one changed.
  - [x] 1.3 RED-verify both: a `denied` site still latches; a dismissed prompt does not gate the waiver open.
- [x] **Task 2 — Copy** (AC: #2, #6, #7)
  - [x] 2.1 Split the `permission_denied` entry in `gps-remediation.ts` into the dismissed and denied cases.
  - [x] 2.2 `timeout` gains the toggle as a second cause (AC6).
  - [x] 2.3 Platform labelling/ordering (AC7), presentation only.
  - [x] 2.4 Keep ONE source — the block and `GeopointInput` both read it (13-75 Task 3.1).
- [x] **Task 3 — Waiver gating** (AC: #3, #4)
  - [x] 3.1 Dismissed → gated behind one failed in-banner attempt; `denied` → immediate.
  - [x] 3.2 A second dismissal settles: the waiver appears, no further prompt.
- [x] **Task 4 — Tests**
  - [x] 4.1 AC5's negative: a dismissed prompt causes NO silent capture at submit — RED-verified.
  - [x] 4.2 `denied` keeps today's behaviour end to end (waiver immediate, latch holds).
  - [x] 4.3 Dismissed: waiver hidden, `gps-waiver-pending` shown, one tap re-raises, a success commits and auto-retries the submit (13-75 AC3 path).
  - [x] 4.4 AC6/AC7 copy assertions, incl. that no copy sends a user to a window as the ONLY remedy while the toggle may be off.
  - [x] 4.5 ⚠️ Explicit `{ timeout: N }` on every async query — `asyncUtilTimeout` is 1000 ms and `testTimeout: 10000` does not govern it; it is `findByRole`'s **third** argument.

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

**⚠️ Line-cite map (code review L5, 2026-09-29, working tree after review fixes).** The cites in the ACs above were read at `cfbe307` and have drifted; the AC text is adjudication's and is left as authored, so resolve them here:

| Cited in the ACs | What it is | Now at |
|---|---|---|
| `FormFillerPage.tsx:365` | open-time LATCH (`autoCaptureDoneRef`) | `FormFillerPage.tsx:524` |
| `FormFillerPage.tsx` — AC11 in `refreshPositionForSubmit` | silent retry: call-site fence / permission fence | `:637` / `:643` |
| `FormFillerPage.tsx:1051-1054` | waiver gate | `:1132` (`blockFailureKind`) → `:1141` (`waiverAvailable`) |
| — (new) | `recordCaptureFailure`, the one failure write | `:302` |
| `geo-capture.ts:99-105` | `isRetryableCaptureFailure` | `geo-capture.ts:103` |
| `geo-capture.ts:225-277` | `permissionAllowsSilentRefresh` | `:266` |
| — (new) | `geolocationPermissionState` / `classifyBlockFailure` | `:305` / `:389` |
| `gps-remediation.ts:54-62` / `:73-75` | `permission_denied` / `timeout` copy | `gps-remediation.ts:92` / `:114` (dismissed copy `:53`) |
| `packages/types/src/native-form.ts:142-153` | `gpsUnavailableReasons` | unchanged (`:142`) |

## Dev Agent Record

### Agent Model Used
Claude Opus 5.5 (`claude-opus-5-5`), dev-story workflow, 2026-09-28.

### Debug Log References
- ⚠️ **ENVIRONMENT, not code: vitest cannot start a worker inside the Claude Code sandbox** (`[vitest-pool]: Failed to start forks worker … Timeout waiting for worker to respond`, both `forks` and `threads`). Proven environmental on an UNCHANGED file (`gps-remediation.test.ts` failed identically in-sandbox, passed 6/6 outside). Every test run in this story ran unsandboxed.
- ⚠️ **And an unsandboxed `node` process cannot WRITE project source** (`UNKNOWN: unknown error, open …FormFillerPage.tsx`, errno -4094). So the scripted mutation harness was abandoned before it changed anything (md5 verified), and every mutation below was applied and reverted with the Edit tool, one at a time.
- Line cites in the story had drifted since cfbe307: the latch is now `FormFillerPage.tsx:508`, AC11's silent retry `:621` (call-site fence) and `:627` (permission fence), the waiver gate `:1119`.

### Completion Notes List

**⛔ AC8 / Task 1.2 — THE CALL SITES, AND WHICH CHANGED.** The story named two consumers of `isRetryableCaptureFailure`; there are **three**:

| Consumer | Where | Reads | Behaviour |
|---|---|---|---|
| Open-time LATCH (`autoCaptureDoneRef`) | `FormFillerPage.tsx:508` | `isRetryableCaptureFailure` | **UNCHANGED** — code 1 latches in every permission state (13-71 U9 not re-opened) |
| AC11 SILENT retry at submit | `:621` + `:627` | `isRetryableCaptureFailure`, then `permissionAllowsSilentRefresh` | **UNCHANGED** — a dismissed prompt gets no silent capture (AC5) |
| Amber-block WAIVER GATE + COPY (block and location question) | `:1119` | NEW `classifyBlockFailure(reason, permissionState, promptDismissals)` | **CHANGED** — the only reader of permission state |

`isRetryableCaptureFailure` itself is byte-for-byte unchanged in behaviour; a comment on it now says not to widen it, and points at `classifyBlockFailure`.

**What was built.**
- `geo-capture.ts` — `geolocationPermissionState()` → `granted | denied | prompt | unknown`, never throws; absent API, unusable `query()`, rejection and out-of-spec states all read `unknown`. `classifyBlockFailure()` → `retryable | dismissed | settled`: `dismissed` = code 1 **and** state `prompt` **and** at most one dismissal seen; everything unknown reads settled.
- `FormFillerPage.tsx` — `recordCaptureFailure(reason)` is now the ONE failure write (five sites: open-time, silent retry, in-banner, late in-banner after Back, the location question's own button) — the same count at which 13-75 AC2 collapsed the success writes into `commitGeopoint`. For code 1 it probes the permission state and counts dismissals; state is cleared synchronously so between a failure and its probe the page is in the SETTLED reading (a stale `prompt` can never make a newer block look dismissed); a probe overtaken by a newer failure or a fix is disowned by sequence number. Dismissals are cumulative for the page and deliberately NOT cleared by Back (Chrome's hardening is a fact about the browser, not a panel).
- `gps-remediation.ts` — `PROMPT_DISMISSED` copy ("Location was not allowed. Tap Capture and choose Allow when your phone asks."), no settings steps; `timeout` names the toggle first and the window second (AC6); `permission_denied` regrouped into a platform-neutral lead plus labelled `Android:` / `iPhone:` steps (AC7). **No gate named by 13-75 AC5/M3 was dropped** — the site gate, Chrome's app permission, Safari Websites and Location Services are all still present, asserted by the rewritten 13-75 test.
- `GpsRemediationCopy.tsx` (new) — one renderer for the block and the location question, so the new platform lines cannot render on one surface and not the other.

**⭐ AC5 IS FENCED TWICE, and the new negative only sees both.** M2a (call site widened alone) and M2c (permission fence removed alone) both leave the 13-76 negative GREEN; M2b (both removed) reds it plus four dismissed-flow tests. That is defence in depth, not a hole: each fence alone is already pinned by a 13-75 test — the call site by "a SETTLED reason (permission_denied) gets no silent retry", the permission fence by "no retry while the browser would have to PROMPT". Recorded so a reviewer does not read M2a's green as a test that passes over a hole.

**MUTATION PROOFS** (13-76 tests, page + lib; each reverted, md5 of all three source files verified IDENTICAL to the pre-mutation baseline):

| # | Mutation | Result |
|---|---|---|
| M1 | latch widened for code 1 | **RED 2** — both R-a latch tests (`denied`, `prompt`) |
| M2a | AC11 call-site fence widened alone | green 37 — permission fence holds |
| M2b | both AC5 fences removed | **RED 5** — incl. the AC5 negative |
| M2c | permission fence removed alone | green 37 — call-site fence holds |
| M3 | waiver gate ignores `dismissed` | **RED 4** |
| M4 | a second dismissal never settles | **RED 3** — all three AC4 tests (+1: test 4.3 hit its 10 s timeout under load and passes ALONE under the same mutation, so it is not counted) _[wording corrected by code review L4; the row previously read "RED 4" and then excluded the 4th]_ |
| M5 | copy ignores `promptDismissed` | **RED 5** — block, location question and unit copy |
| M6 | a `denied` site read as dismissed | **RED 4** |
| M7 | absent Permissions API read as `prompt` | **RED 3** — incl. the page-level iOS test |

**GATES.**
- `tsc --noEmit -p tsconfig.json` (web): **0**, no output.
- eslint on all 10 touched web files: **0**, no output.
- Targeted: geopoint page + `GeopointInput` + `lib/__tests__/`: **4 files / 160 passed**.
- **Web suite — NOT one clean run, stated plainly.** The full run executed **276 of 284 files: 3,221 tests, 3,216 passed / 3 failed / 2 todo**, with **8 files never started** (`Failed to start forks worker`, machine load; free RAM was 3.76 GB at start). The 8 unstarted files + the 2 failing files were then re-run with 2 workers: **119 tests**, exactly the number predicted before the run from the 3,279 target; the 8 files passed 58/58 (incl. `FormRenderer.suppressGeopoint`), the same 3 tests failed again. Each failing file was then run ALONE: `route-resolution.integration` **58/58** and `a3-eslint-policy` **3/3**. The three failures are `/login` (40 s per-test timeout — the cold-chunk case that file's own comment records raising twice, 2026-08-11 and 2026-09-02), the 404 fallback (default 1,000 ms `waitFor`, still on the Suspense skeleton) and the A3 lint (90 s timeout; 22.7 s alone). **Combined: 284 files / 3,279 tests / 3,277 passed / 2 todo / 0 failing on isolation.** Delta against the handed-in baseline (3,241 passed / 2 todo) is **+36**, every test named: `geo-capture` +16 (29→45), `gps-remediation` +9 (6→15, one 13-75 test replaced), `FormFillerPage.geopoint` +11 (78→89).

**⚠️ ASSERTIONS CHANGED IN EXISTING (13-75) TESTS — for ratification, not silently:**
- `/Step outside/` → `/step outside/i` at four sites (`FormFillerPage.geopoint.test.tsx` ×2, `GeopointInput.test.tsx` ×2): AC6 reorders the timeout copy so the toggle leads and "step outside" no longer opens a sentence. Intent (the timeout copy still says to move) is kept; the case-sensitivity was incidental.
- `gps-remediation.test.ts` AC5: the iOS steps were pinned inside `action` and the rest inside `secondary`; AC7 moves them into labelled `platformSteps`, so the assertions now read the whole rendered copy. Every gate asserted before is asserted still. The old `timeout` exact-string test is replaced by AC6's two tests.

**Watch item (not a defect):** test 4.3 measured 1.8 s in a clean run but hit its 10 s test timeout once under M4's load. If it reds in a loaded suite, re-run the file alone before reading anything into it.

### File List
**Created:**
- `apps/web/src/features/forms/components/GpsRemediationCopy.tsx`

**Modified:**
- `apps/web/src/features/forms/lib/geo-capture.ts`
- `apps/web/src/features/forms/lib/gps-remediation.ts`
- `apps/web/src/features/forms/pages/FormFillerPage.tsx`
- `apps/web/src/features/forms/components/GeopointInput.tsx`
- `apps/web/src/features/forms/components/QuestionRenderer.tsx` — one prop threaded through (`captureFailurePromptDismissed`); outside the story's Project Structure Notes, see R4
- `apps/web/src/features/forms/lib/__tests__/geo-capture.test.ts`
- `apps/web/src/features/forms/lib/__tests__/gps-remediation.test.ts`
- `apps/web/src/features/forms/pages/__tests__/FormFillerPage.geopoint.test.tsx`
- `apps/web/src/features/forms/components/__tests__/GeopointInput.test.tsx`
- `apps/web/src/__tests__/route-resolution.integration.test.tsx` — _added 2026-09-29_, outside this story: the 404-fallback test's load-timeout fix, at Awwal's request (R4(i))
- `apps/web/src/features/support/__tests__/FAQPage.test.tsx` — _added 2026-09-29_, outside this story: describe-level budget after a full-run timeout, at Awwal's request (R4(j))
- `apps/web/src/features/marketplace/__tests__/MarketplaceSearchPage.test.tsx` — _added 2026-09-29_, outside this story: page import moved to one `beforeAll`, Awwal's option 3 (R4(k))
- `_bmad-output/implementation-artifacts/13-76-a-dismissed-prompt-is-not-a-blocked-site.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**AC9:** no file under `apps/api`, `packages/`, or any schema/migration path is touched; `gpsUnavailableReasons` and the stored `permission_denied` are unchanged.

**Out of scope:** 13-75 R2 (iOS copy read — needs an iPhone) and 13-75 R3 (panel-recovery field read); both stay on 13-75

### Change Log
| Date | Change | Rationale |
|---|---|---|
| 2026-09-28 | Story created | Awwal's Android read of 13-75 on prod: a dismissed prompt reported `permission_denied`, was classified settled, and the waiver was offered instead of a retry |
| 2026-09-28 | dev-story: code 1 split by permission state at the block only (`classifyBlockFailure`); one failure write (`recordCaptureFailure`); dismissed/timeout/platform copy; shared `GpsRemediationCopy`; +36 tests, 7 mutation proofs RED + 2 documented-green; status → review, UNCOMMITTED | AC1–AC9; R2–R4 opened |
| 2026-09-29 | code-review: 0H/2M/6L, all fixed and RED-verified — M1 label asserted on both surfaces; M2 origin-device test + R2(d); L1 guard tests; L2 code-1 copy withheld while the (now 1 s-bounded) permission probe is out; L3 dismissal count kept for the tab; L4/L5 record corrections; L6 dismissed pending line. +15 tests, 175/175 targeted. R4 gains (f)–(h). Status stays review, UNCOMMITTED | Adversarial code review; Awwal chose action items + auto-fix |
| 2026-09-29 | code-review session (pre-adjudication record, at Awwal's request): AC1's premise found false for iOS 16+ (R5) and a prod consequence outside scope (R6); Q1/Q2 designed; **R5 ruled (a) by Awwal and BUILT** — `prompt` distrusted once a success proves it lies; +9 tests, 3 mutations RED; 184 targeted. Full suite re-run in progress | Code-review session, and Awwal's ruling on R5 |
| 2026-09-30 | ⚖️ **ADJUDICATED — the work is SOUND, approved for deploy.** Gates run by adjudication, none inherited: full web suite **284/284 files ran, 0 unrun, 282 passed / 2 failed / 3299 passed / 2 todo**; tsc **0**; eslint **0**. The 2 failures are `a3-eslint-policy` and `route-resolution` `/login`, BOTH pure timeouts, BOTH pass alone (61/61 in 52s) and NEITHER attributable — `a3` lints a hardcoded string against a fake path, so no new test file can influence it. Test delta **+60**, reconciled per-file against the 13-75 run (geo-capture 29→56, geopoint 78→99, gps-remediation 6→15, GeopointInput 11→14) — ⚠️ the review's "+15" is its OWN post-findings additions, not the story delta. **AC8/R-a verified from SOURCE, not from the record:** `isRetryableCaptureFailure` still governs the latch (`:534`) and AC11's fence (`:647`); only `:1145` reads `classifyBlockFailure`, so 13-71 U9 stays closed. **AC5's negative is structural**, double-fenced. `GpsRemediationCopy` is genuinely shared by both surfaces, and AC7 uses labelled lines with NO user-agent detection — better than the AC permitted. File List vs `git status`: **0 discrepancies**, including all three declared out-of-scope files. ⭐ The review's own request for a different-model read of the logic is discharged: this adjudication is a different model and read the latch, fence, renderer and copy from source. | The story's three findings from Awwal's Android read are correctly fixed, `timeout` now leading with the toggle |
| 2026-09-30 | Adjudication extended `route-resolution`'s `it.each` per-test budget 40s → 75s, in this story's already-declared R4(i) file | The `/login` row blew 40s at 46,991ms and reported the opaque timeout that budget exists to PREVENT; the file passes alone in 13.4s. `a3-eslint-policy`'s 90s → 210s went in a separate commit (`9fe0679`) because it is not this story's file, and its own "do not raise this again" instruction was tested and falsified first — the config is unchanged since 2026-08-10 |

### Review Follow-ups (AI)
_Adversarial code review, 2026-09-28/29 (Opus 5.5). 0 High / 2 Medium / 6 Low. Two findings were PROVEN by mutation before being written (M1, L1: each mutation left the targeted 160/160 green). Awwal chose "create action items AND fix them all"._

- [x] [AI-Review][Medium] **M1 — AC7's platform labels were never asserted on a rendered surface.** Deleting `<span>{platform}:</span>` left 160/160 green; `allText()` in the unit test synthesises `"Android: …"` itself, so it tested the data, not the screen. Assert the label on BOTH surfaces (the reason Task 2.4's shared renderer exists). [`components/GpsRemediationCopy.tsx:24`]
- [x] [AI-Review][Medium] **M2 — the story's own origin device was never exercised: prompt dismissed AND Location toggle OFF.** "Choose Allow" opens gate 1 only; the next attempt fails code 2. No test scripted `[1, 2]`. Add the page test, and add (d) to R2's device read. [`pages/__tests__/FormFillerPage.geopoint.test.tsx`]
- [x] [AI-Review][Low] **L1 — GeopointInput's page-tracking guard was untested.** Removing `captureFailureReason !== undefined &&` left 160/160 green. [`components/GeopointInput.tsx:57`]
- [x] [AI-Review][Low] **L2 — the probe window showed the wrong advice.** Between a code-1 failure and the permission probe the page is in the SETTLED reading, so the location question showed the settings surgery AC2 removes, then swapped — inside a `role="alert"` region, so a screen reader announced both. Withhold the code-1 copy while the probe is out, and bound the probe so the copy can never be withheld forever. [`pages/FormFillerPage.tsx` `recordCaptureFailure`; `lib/geo-capture.ts` `geolocationPermissionState`]
- [x] [AI-Review][Low] **L3 — AC4's "second dismissal settles" lasted one page MOUNT.** The count was component state, so every new survey (and every reload) reset it to 0 — while Chrome's hardening is per origin, across surveys. Persist the count for the tab. [`pages/FormFillerPage.tsx` `gpsPromptDismissals`]
- [x] [AI-Review][Low] **L4 — mutation table row M4 said "RED 4" and then excluded the 4th.** Should read RED 3 (+1 load timeout, green alone). [Completion Notes]
- [x] [AI-Review][Low] **L5 — line cites in ACs/References drifted** (`FormFillerPage.tsx:365`/`:1051`, `geo-capture.ts:99-105`/`:225-277`); the Debug Log noted the drift but nothing updated them. [ACs 1, 3, 5, 8; References]
- [x] [AI-Review][Low] **L6 — the pending line said "If it fails again" to someone who never experienced a failure** (they tapped past a dialog). AC3 says it "explains that". Dismissed-specific wording. [`pages/FormFillerPage.tsx` `gps-waiver-pending`]

### Senior Developer Review (AI)

**Reviewer:** code-review workflow (Opus 5.5), for Awwal · **Dates:** 2026-09-28 (findings) → 2026-09-29 (fixes) · **Outcome:** Changes Requested → **all 8 findings fixed**.

**Verified before any finding was written**, reading the code before the story's account of it: AC8/R-a holds. `isRetryableCaptureFailure` is unchanged; the latch (`:524`) and AC11's two fences (`:637`/`:643`) still read it; only the waiver gate and the copy read `classifyBlockFailure`. The dev's THIRD consumer is real. AC9 holds (`apps/web` only). Every `[x]` task has code behind it. The targeted suite reproduced unsandboxed at the story's own figure: **4 files / 160 passed**.

**Fix record — every code fix RED-verified by reverting it.** Two batches of mutations with disjoint tests were applied and reverted with the Edit tool. After each batch EXACTLY the intended tests went red and nothing else did, and a grep confirmed no mutant survived.

| Finding | Fix | Mutation → RED |
|---|---|---|
| M1 platform label unasserted | page test asserts `^Android:` / `^iPhone:` on the question AND the block | label span deleted → **RED 1** (green 160/160 before the test existed) |
| M2 origin device (dismissed + toggle off) untested | page test `[1, 2]`: Allow, then code 2 → Location icon named, waiver appears, `position_unavailable` filed; R2 gains (d) | characterises existing behaviour, no code changed — nothing to revert |
| L1 GeopointInput guard untested | unit tests, with and without page tracking | guard removed → **RED 1** (green 160/160 before) |
| L2 wrong advice in the probe window | new `gpsPermissionProbing`: code-1 copy withheld on BOTH surfaces while the probe is out; the waiver is NOT withheld; probe bounded by `PERMISSION_PROBE_TIMEOUT_MS` (1 s → `unknown`) so the copy always arrives | question withholding off → **RED 2** (page + unit) · block withholding off → **RED 1** · deadline removed → **RED 1** |
| L3 count reset per survey | `readPromptDismissals` / `recordPromptDismissal` in `sessionStorage`, module fallback when storage throws; `sessionStorage.clear()` added to the page test file's `beforeEach` | page back to per-mount `n + 1` → **RED 1** |
| L4 mutation-table wording | row M4 now reads RED 3 (+1 timeout) | doc |
| L5 drifted cites | line-cite map under References; AC text left as adjudication authored it | doc |
| L6 generic pending line | dismissed: "If Allow does not work…"; every other case unchanged | back to one string → **RED 1** |

**Tests:** +15 (page +7, GeopointInput +3, geo-capture +5). Targeted **4 files / 175 passed** (160 + 15, each named above). ⚠️ In the first post-fix run, 2 of the 4 files failed to START (`Failed to start forks worker`; no stray node processes, 3.7 GB free). Re-run with `--maxWorkers=1` → 110/110. That was the environment, not a test result. A final run after every mutation was reverted: **175/175**. `tsc --noEmit` **0**; eslint on all 10 touched web files **0**, no output. The full web suite was NOT re-run by the review.

**Why the status stays `review`, not `done`** (a stated deviation from the workflow's letter): R2 — the story's premise that Chrome reports `prompt` after a dismissal — is jsdom-only, and R4 carries deviations awaiting Awwal's ruling. A review cannot sign a closure (handoff §2al), and the residual guard fails a `done` story that has open rows.

### ⚖️ PRE-ADJUDICATION RECORD — 2026-09-29 (code-review session, for the adjudication agent)

⛔ **NOT an adjudication.** Written by the code-review session at Awwal's request ("write the adjudication section with all the nuances"), so the adjudication agent can adopt, amend or reject it. Wherever it says "this session" it means the reviewer, never adjudication. The adjudication agent's own verdict is still to come.

⚠️ **WEIGH THIS SECTION ACCORDINGLY.** Dev and this code-review session were both Opus 5.5, and this record reads code the same session wrote (L2, L3, L6, and R5(a) below). That is the exact configuration the handoff's first box warns about (13-71: a different-model review found fifteen defects that dev, a same-model review and adjudication had all approved). **Recommended before deploy: a different-model review of the diff, reading LOGIC before this record.**

**THIS SESSION'S READING (not a verdict — that is the adjudication agent's): the code does what the ACs say, and one AC rests on a premise that is false for current iPhones.** So the finding is about the story, not the code. It is not a reason to reject the work. It is a reason not to deploy it until Awwal has ruled on R5. ▸ **Update, same day:** R5 was ruled (a) by Awwal and built (below); the gates were then re-run on the final tree. What stands between this story and a deploy is now the different-model review, the commit, and Awwal's R4 ratification. None of R2, R3, R5 or R6 blocks the deploy; they are post-deploy reads or routing decisions.

#### ⛔ THE FINDING — "iOS Safari has no Permissions API" is not true on iOS 16+

AC1, R-d, the dev's page test *"iOS Safari (no Permissions API) → settled"*, and 13-71's `permissionAllowsSilentRefresh` all rest on one claim: `navigator.permissions` is absent on iOS Safari.

- **Verified (primary data):** MDN browser-compat-data, `api/Permissions.json`: `query` → `"safari": { "version_added": "16" }, "safari_ios": "mirror"`, and the sub-feature `permission_geolocation` likewise **Safari 16, iOS mirrors**. On iOS 16+ the API **exists**, and `geolocationPermissionState()` returns a state, not `unknown`.
- **Reported, NOT verified here:** Safari's `PermissionStatus.state` for geolocation **always reads `"prompt"`**, even after the user allowed or denied (mdn/browser-compat-data issue #25032, which cites an Apple Developer Forums thread). No Safari version or fix is named. Adjudication has no iPhone to confirm it (13-75 R2 / R1 here).

**What follows if the report holds** (each point is reasoning from the code, not observed on a device):
1. **13-76, on iOS:** EVERY code-1 failure reads as `dismissed` on the first occurrence in a tab. That includes a deliberate *Don't Allow*, **Location Services off system-wide**, and *Safari Websites → Never*. All of these report code 1 on iOS (13-75 AC5), and in none of them will the phone "ask". The enumerator gets "Tap Capture and choose Allow when your phone asks", and the waiver is held back behind a tap that cannot work. **Bounded:** that failed tap is the second dismissal, which settles the block (waiver + settings copy), and since review L3 the count lasts for the tab. So the cost is **one wrong screen and one dead tap per tab**, not a dead end. 4 of the trial enumerators are on iOS Safari (13-71's measurement).
2. **NOT 13-76's code, but uncovered by it — the iOS silent refresh may never fire.** `permissionAllowsSilentRefresh` returns `true` only when the API is ABSENT. Its own comment builds the iOS argument on that absence ("the measured 4-enumerator hole this function exists to close"). On an API that exists and always says `prompt`, it returns `false`. **13-71's submit-time refresh and 13-75 AC11's silent retry would then never run on iOS 16+**, and that code is already on prod. This belongs to 13-71/13-75, not to 13-76. It is recorded as R6 so it is not lost.
3. **The iOS page test covers iOS ≤15 only.** It stays correct as a fallback test, but it is not evidence about the field's iPhones.

**The measurement — TWO queries, because there are two questions.** Prepared, NOT run: this session's read-only prod query was refused by the session's permission classifier. Run both read-only (`ssh root@oslsr-home-app`, then `docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' oslsr-postgres psql -U oslsr_user -d oslsr_db -X` and paste each).

**Q1 — does the API EXIST on the field's phones?** Real field enumerators only: the operator's `lawalkolade%` accounts and `deactivated` users are excluded, because ownership is the discriminator, not the `+test` suffix (see `enumerator-roster-includes-operator-accounts`).
```sql
WITH field AS (
  SELECT u.id, u.email FROM users u JOIN roles r ON r.id = u.role_id
  WHERE r.name = 'enumerator' AND u.email NOT LIKE 'lawalkolade%' AND u.status <> 'deactivated'
)
SELECT f.email,
  CASE WHEN a.user_agent ~ 'iPhone|iPad' THEN 'iOS'
       WHEN a.user_agent ~ 'Android' THEN 'Android'
       WHEN a.user_agent ~ 'Macintosh' AND a.user_agent ~ 'Version/[0-9.]+ .*Safari' THEN 'mac-or-iPad'
       ELSE 'other' END                                   AS platform,
  substring(a.user_agent from 'OS (\d+)_')                AS ios_major,
  CASE WHEN a.user_agent ~ 'CriOS' THEN 'Chrome-iOS' WHEN a.user_agent ~ 'FxiOS' THEN 'Firefox-iOS'
       WHEN a.user_agent ~ 'Version/[0-9.]+ .*Safari' THEN 'Safari'
       WHEN a.user_agent ~ 'Chrome/' THEN 'Chrome' ELSE 'other' END AS browser,
  substring(a.user_agent from 'Version/(\d+)')            AS safari_major,
  count(*) AS events, max(a.created_at)::date AS last_seen
FROM field f JOIN audit_logs a ON a.actor_id = f.id
WHERE a.user_agent IS NOT NULL AND a.created_at > now() - interval '90 days'
GROUP BY 1,2,3,4,5 ORDER BY 2,1,7 DESC;
```
Reading it:
- **Any `ios_major` ≥ 16 means R5 and R6 apply to real phones.** All ≤ 15 means the premise holds for today's field; R5(a) is still worth building, because every upgrade moves a phone across the line.
- ⚠️ `Chrome-iOS` is WebKit underneath and behaves as Safari does.
- ⚠️ **iOS 26 froze the UA at `iPhone OS 18_6`**, so a reading of 18 may really be newer. That does not change the verdict, since the threshold is 16.
- ⚠️ **An iPad in its default desktop mode sends a `Macintosh` UA.** Treat `mac-or-iPad` Safari rows from field accounts as iPads until shown otherwise.
- A field enumerator with **no rows at all** has no UA on record (never logged in, or outside 90 days). That is unknown, not "not iOS".

**Q2 — does Safari really always answer `prompt`? (R6's question, answered from stored data rather than a device.)** The submit-time refresh runs only when the probe reads `granted` (`permissionAllowsSilentRefresh`). When it runs and succeeds, the stored position REPLACES the open-time one, which is kept under `_gpsOpenCapture` (written at open on every success, `FormFillerPage.tsx:526`). So "the final position differs from `_gpsOpenCapture`" is the fingerprint of a refresh that fired. The operator's accounts are kept here and flagged: an operator's phone is valid evidence of browser behaviour.
```sql
SELECT platform, operator,
  count(*)                              AS with_open_capture,
  count(*) FILTER (WHERE moved)         AS final_differs_from_open,
  count(*) FILTER (WHERE NOT moved)     AS final_equals_open
FROM (
  SELECT (u.email LIKE 'lawalkolade%') AS operator,
    CASE WHEN ua.user_agent IS NULL THEN 'no-ua'
         WHEN ua.user_agent ~ 'iPhone|iPad' THEN 'iOS' WHEN ua.user_agent ~ 'Android' THEN 'Android'
         WHEN ua.user_agent ~ 'Macintosh' THEN 'mac-or-iPad' ELSE 'other' END AS platform,
    (s.gps_latitude  IS DISTINCT FROM (s.raw_data->'_gpsOpenCapture'->>'latitude')::float8
     OR s.gps_accuracy IS DISTINCT FROM (s.raw_data->'_gpsOpenCapture'->>'accuracy')::float8) AS moved
  FROM submissions s
  JOIN users u ON u.id::text = s.submitter_id
  JOIN roles r ON r.id = u.role_id AND r.name = 'enumerator'
  LEFT JOIN LATERAL (
    SELECT a.user_agent FROM audit_logs a
    WHERE a.actor_id = u.id AND a.user_agent IS NOT NULL AND a.created_at <= s.submitted_at
    ORDER BY a.created_at DESC LIMIT 1) ua ON true
  WHERE s.raw_data ? '_gpsOpenCapture' AND s.gps_latitude IS NOT NULL
) x
GROUP BY 1,2 ORDER BY 1,2;
```
Only 13-71+ clients write `_gpsOpenCapture`, so the key dates the sample by itself; no deploy date is needed. The UA is the submitter's latest one at or before `submitted_at`, which handles device changes.

| Q2 reading for iOS | Means |
|---|---|
| `final_differs_from_open` > 0 | Safari DID answer `granted` at least once. The "always `prompt`" report is false for the field's Safari. R6 is not confirmed; R5 shrinks to the deny/Location-Services-off cases where `prompt` would still mislead |
| `final_differs_from_open` = 0, `with_open_capture` ≥ ~5, **and Android shows refreshes** | **R6 CONFIRMED on prod data.** The iOS refresh never fires |
| `with_open_capture` = 0 or tiny | No evidence yet. The trial is stopped, so this is likely today. It stays open until an iPhone submits, or until one iPhone read: open a survey, allow, finish, and re-run Q2 |

⚠️ **Q2's known over-count:** a manual Recapture also makes the final position differ from the open one. So on iOS, "differs > 0" needs a look at those rows before it is read as a refresh. "Differs = 0" has no such ambiguity, and it is the reading that confirms R6.

**Options for R5 — Awwal to rule; this session's recommendation is marked.**
- **(a) ⭐ Recommended — distrust `prompt` once it has been seen to lie; no user-agent sniffing.** A successful capture while the probe reads `prompt` proves this browser's `prompt` means nothing (a granted site cannot honestly report `prompt`). Record that fact for the tab and read `prompt` as `unknown` from then on. It fixes iOS after the first success in a tab, costs nothing on Chrome, and stays within AC7's rule that behaviour must not depend on user-agent guesses. It does NOT fix an iOS phone whose first capture in a tab is a failure. The first tap is still wasted there, so it narrows R5 rather than closing it.
- **(b)** Accept as-is: the cost is bounded to one wrong screen and one dead tap per tab (point 1). It is cheap, and it knowingly gives iOS users the wrong advice once.
- **(c)** Treat Safari as `unknown` by user agent. Rejected by AC7 and R-c: behaviour would depend on a UA guess.
- **Independently of (a)–(c):** route R6 to a 13-71/13-75 follow-up. It is the larger of the two problems, and it is on prod now.

#### What this session re-read for LOGIC, beyond its own review

- **Review's own fixes, read adversarially:**
  - L2's withholding: `gpsPermissionProbing` is cleared by an owned probe answer, by `commitGeopoint`, and by any newer failure. It is left `true` only when the interview has ended, where nothing renders. The waiver is deliberately NOT withheld. The 1 s bound means a slow `query()` falls back to the settled reading, i.e. 13-75's behaviour.
  - L3's persistence changes AC4's reach in a way Awwal should see before ratifying R4(g): **once a tab has counted two dismissals, every later dismissed prompt in that tab settles at once, for the tab's life.** Chrome embargoes after three dismissals for about seven days. The app settles at two, for however long the tab stays open (days, for an enumerator who never closes it). This is not a dead end, because the settled Android steps include the site's own Allow. But the cheap "choose Allow" line is then gone for that tab. The threshold is AC4's; the lifetime is review's.
- **M2 is a characterisation test.** It pins what the code does when Allow meets a switched-off toggle, not what Chrome does. R2(d) owns that.
- **Unchanged and still correct:** `isRetryableCaptureFailure`, the latch (`:524`), and AC11's two fences (`:637`/`:643`). No API, `packages/` or schema path in `git status` (AC9).

#### R5(a) — BUILT 2026-09-29, on Awwal's ruling

⚠️ This is code written by the code-review session, on the same model that recommended it. The different-model review above now has one more thing to read.

- **`geo-capture.ts`:**
  - `notePermissionStateAfterSuccess()` probes the RAW state after a success; `prompt` marks the tab (`sessionStorage` `oslsr.gps.promptStateUnreliable`, with a module fallback when storage throws).
  - `geolocationPermissionState()` now reads `prompt` as `unknown` once the tab is marked. Only `prompt` is distrusted: `denied` and `granted` pass through.
  - The raw probe became the private `rawGeolocationPermissionState()`.
- **`FormFillerPage.tsx`:** `commitGeopoint` (the one success write, so every success path) fires `void notePermissionStateAfterSuccess()`. It is evidence-gathering, never a gate.
- **Deliberately NOT changed:** `permissionAllowsSilentRefresh` (R6, unrouted). ⭐ It is worth knowing that the same flag would let it treat a marked tab like an absent API (attempt the refresh). That would fix R6 after the first success in a tab, as a one-line change, if Awwal routes R6 that way.
- **Tests +9** (lib +6, page +3), with a Chrome-shape guard on both levels.

| Mutation | RED |
|---|---|
| X1 distrust removed from `geolocationPermissionState` | **4**: both iPhone page tests + 2 lib |
| X2 `commitGeopoint` no longer gathers the evidence | **2**: both iPhone page tests |
| X3 any success marks the tab (a Chrome false positive) | **2**: the Chrome-shape guard, page + lib |

Each mutation was applied and reverted with the Edit tool, one at a time; a grep afterwards found no mutant. Targeted: **4 files / 184 passed** (175 + 9).

**Still true after (a):** a phone whose FIRST capture in a tab fails has produced no tell, so it gets the dismissed reading once. R5 is narrowed, not closed, which is why its row stays OPEN alongside Q1/Q2.

#### GATES — run by this session

- **A first full-suite run was STOPPED, not read as a gate.** It was started before R5(a), and editing source mid-run made it a mixed-state run. It had finished **101 of 284 files** when stopped. Its only failures were the two `route-resolution.integration` tests the dev also saw (`/login` at **121 s**, and the 404 fallback), which are that file's documented load-timeout case, not this story's code. Its prediction (3,294) is superseded.
- Orphaned `vitest` + `pnpm` processes survived the stop (Windows does not kill the tree). They were found and ended; 0 node processes and 4.2 GB free before the next run.
- **tsc `--noEmit`: 0 · eslint on all 10 touched web files: 0**, both run on the final tree including R5(a).
- **Clean full web suite after R5(a)** (`--maxWorkers=2`, 2,599 s, output to a file, read in full rather than through `tail`):
  - **284 files / 3,303 tests: 3,300 passed, 1 failed, 2 todo.**
  - **The total matches the prediction written before the run exactly** (3,279 + 15 + 9 = 3,303), so there is no unaccounted test delta. All 284 files started, none failed to start.
  - **The one failure:** `route-resolution.integration` › *resolves an unknown path to the NotFound component (404 fallback works)*, 1,380 ms. It is the default 1,000 ms `waitFor` running out while the Suspense skeleton is still on screen. It is the same test the dev saw fail and the stopped run also failed. It is **not touched by this story**, and **run ALONE it is 58/58**.
  - **Combined: 3,301 passed / 2 todo / 0 failing on isolation.**
  - ⚠️ This is the third run in a row where this file's 404 test failed under load and passed alone. That is now a pattern, not weather.
- **▸ FIXED at Awwal's request ("resolve the failure so that we are fully closed before adjudication"), 2026-09-29.** `route-resolution.integration.test.tsx` › 404 fallback:
  - `waitFor` given `{ timeout: 30000 }` and the test a `40_000` per-test timeout. That is the same budget, in the same idiom, as the file's 57 sibling route tests, which got it after the same cold-chunk failure on 2026-08-11. It was the only `waitFor` in the file still on testing-library's default 1,000 ms, which `testTimeout` does not govern.
  - The failing DOM confirmed the cause: `<PageSkeleton aria-label="Loading page">`, i.e. the lazy NotFound chunk not yet resolved.
  - **RED-verified that a longer wait did not make it vacuous:** with the route mutated to `/login` (a real page, so no "page not found" ever renders), it FAILS at **30.5 s** with the named assertion `Unable to find … /page not found/i`, not an opaque test timeout. Reverted; grep finds no mutant; file alone **58/58**; eslint **0**.
  - A file outside this story's scope; recorded as R4(i).
- **Full run 3, after the 404 fix:** 284 files / 3,303 tests (prediction exact again). **3,300 passed / 1 failed / 2 todo.** The 404 test PASSED (2,070 ms). **A DIFFERENT file failed:** `features/support/__tests__/FAQPage.test.tsx` › *shows all FAQ sections when All tab is selected*, `Test timed out in 10000ms`, a fully synchronous test.
  - **Measured ALONE:** 5.5 s for that test; the file's tests ran 2–11 s each across three solo runs. So it is not a contention artefact on an otherwise fast test: the page renders every FAQ at once, and the render costs seconds.
  - **Tried and REVERTED:** rewriting the named role queries (`getByText(…, { selector: 'h2' })`, one `getAllByRole('tab')` scan). Both still discriminated: demoting the headings to `h3` and breaking the filter each failed the intended test. But the solo timings did not improve (4.2 → 4.1 s, 5.5 → 6.1 s), so the query cost was not the cause. ⚠️ Those comparisons ran with the machine at **82% CPU from a process outside these runs**, so they are noisy. The revert is on the grounds that an unproven speedup does not earn a diff.
  - **FIX KEPT:** `describe('FAQPage', { timeout: 30_000 }, …)` plus a comment saying what was measured. That follows the repo's own precedent (`a3-eslint-policy.test.ts`, `{ timeout: 90_000 }`). Every assertion is byte-identical to HEAD, so no assertion semantics changed and there is nothing to mutation-test. Alone **8/8**; eslint **0**. A file outside this story, recorded as R4(j).
  - ⚠️ **The class, for the adjudication agent:** two different heavy-render tests timed out in consecutive full runs on this machine. Neither is related to 13-76. What they share is a default timeout sized for a fast machine. A census of web tests whose SOLO time exceeds ~50% of their budget would find the next one before a push does. That is proposed, not done.
- **Full run 4, after both fixes** (prediction written first: 284 / 3,303 / 3,301 passed / 0 failed): **284 files / 3,303 tests (count exact) — 3,299 passed / 2 failed / 2 todo, 2,909 s.**
  - **Neither 404 nor FAQ failed.** Two MORE heavy-render files did, both as timeouts, neither touched by 13-76:
    - `SupportLandingPage` › hero H1: `Test timed out in 10000ms` at **25.9 s**; **3.0 s ALONE**, 7/7.
    - `MarketplaceSearchPage` › title: `Hook timed out in 15000ms` (the `beforeEach` lazy import, `:100`); **8.2 s ALONE**, 19/19.
  - **⛔ THE ENVIRONMENT, MEASURED mid-run:** CPU **100%**, free RAM **1.7 GB**, below the ≥3 GB floor for a full suite. In a 5 s sample, VS Code (`Code`) used more CPU than either vitest worker; Firefox, Docker and a second `claude` process were also running. A 26 s first render of a page that renders in 3 s alone is the machine, not the test.
  - **Why no third and fourth budget patch.** Each full run under this load has produced a DIFFERENT timeout (404 → FAQ → Support + Marketplace). Patching whichever one trips is whack-a-mole in files outside this story, and it would hide an environment problem behind test edits. The 404 and FAQ fixes are kept because each was measured slow ALONE (5.5 s and 2–11 s), not just under load.
  - **Load-sensitivity census so far (for the adjudication agent — proposed, not acted on):** by SOLO time as a share of budget — `MarketplaceSearchPage` title **8.2 s / 10 s (82%)** plus a hook near its 15 s limit under load: fix next; `FAQPage` 2–11 s: budgeted; `route-resolution` 404: budgeted; `SupportLandingPage` hero **3.0 s / 10 s**: load only, leave.
  - **Proposed gate for "0 failed":** a full run at `--maxWorkers=1` on a quieted machine. This session will not close Awwal's applications.
- **Awwal chose option 3 (2026-09-29): fix `MarketplaceSearchPage`'s budget, then the quiet single-worker gate.** He closed one VS Code window, Firefox, and Docker.
  - **Docker was verified irrelevant to the web suite, not assumed:** no web test source or config references a DB, Redis, `docker` or ports 5432/6379. The environment is `jsdom` with IndexedDB faked in-process (`fake-indexeddb.setup.ts`). It matters to the `apps/api` suite, which needs it running again.
  - **The `MarketplaceSearchPage` fix:** the page's dynamic `import()` moved from `beforeEach` into ONE `beforeAll` with its own 60 s budget. The cold module-graph transform had landed in the first test's hook; every later test already got the cached module. It is behaviour-identical: no `vi.resetModules`, and every mock factory reads its `mock*Return` lazily. **First test 8.2 s → 1.1 s ALONE**; 19/19; eslint 0; no assertion changed. It is outside this story, so it is R4(k).
  - **Machine at the start of the gate:** CPU **50%**, **4.0 GB** free, 0 stray node processes. ⚠️ Docker Desktop was still running (4 processes + backend: shutting down, or minimised to tray), and one VS Code window remains.
- **Runs 5–7 did not produce a verdict, and none of them is evidence either way:**
  - **run 5** (`--maxWorkers=1`) was stopped at 137/284, with 0 failures, to diagnose the run time;
  - **run 6** was stopped by Claude Code for low system memory at 50/284;
  - **run 7** was stopped after the machine went to sleep mid-run.
  - Their partial timeouts are recorded above only as load evidence: `FormBuilderPage` renders tabs 15.7 s; `route-resolution` `/verify-staff/:id` 61 s; `a3-eslint-policy` 176 s. All were in files untouched by this story, and none was patched.
- ### ✅ FULL RUN 8 — THE GATE: CLEAN (2026-09-29, 18:04 → 18:51)
  - **`Test Files 284 passed (284)` · `Tests 3301 passed | 2 todo (3303)` · 0 failed · exit 0 · 2,816 s wall.** It **matches the prediction written before it started exactly** (284 / 3,303 / 3,301 / 2 / 0).
  - The log was read in full, not through `tail`: **0** `Failed to start` and **0** `Unhandled` lines, so all 284 files ran.
  - **Configuration:** `VITEST_POOL=threads` (`pool: threads (VITEST_POOL)` in the log) and 2 workers. The run was held by a Windows stay-awake request (`SetThreadExecutionState`), requested at start and released at exit ("finished, exit=0, stay-awake released"); no power settings were changed.
  - ⚠️ **One configuration difference from the default, stated so nobody mistakes it:** the local Windows default is `forks`. `threads` is what CI's Linux runners use. It is safe for the web suite because no web test can load a native addon, and it was measured ~11% faster and equally green on a 47-file sample.
  - **Tree:** all 13-76 code + review fixes + R5(a) + the three out-of-scope test-budget fixes R4(i)/(j)/(k). tsc **0** on this exact tree (run 5's pre-flight; no source changed since); eslint **0** on every touched file.
  - **What made it clean was the machine, not the tests.** No test was changed between runs 7 and 8. Before the run, Awwal closed VS Code instances (the pace went from ~2 to ~6 files/min as they closed) and stopped the machine sleeping. ⚠️ This session itself runs inside a VS Code terminal (`claude.exe` ← `powershell` ← `Code.exe`), so the editor hosting it cannot be closed during a run. A plain terminal avoids that.

#### 📋 PROPOSED HANDOFF UPDATES — for the adjudication agent to apply

This session does not edit `docs/adjudication-agent-handoff.md` (Awwal, 2026-09-29: "Updating adjudication document is not your remit"). These are proposals; adopt, amend or reject them.

1. **§3 state, 13-76:** `review`, UNCOMMITTED. Code review done (0H/2M/6L, all fixed and RED-verified). R5 ruled (a) by Awwal and built. Gates: tsc 0 · eslint 0 · **web suite CLEAN: 284/284 files, 3,301 passed, 2 todo, 0 failed (full run 8, prediction exact).** Open: R2/R3 (Android read, including (d) with the toggle off), R4 (ratify (a)–(k)), R5 (Q1/Q2), R6 (route).
2. **§3, a prod risk not owned by any story yet — R6:** on iOS 16+, `permissionAllowsSilentRefresh` may return `false` every time, so 13-71's submit refresh and 13-75 AC11's silent retry would never fire for the iOS enumerators. It is recorded on 13-76 only so it is not lost. It needs a home (a 13-71/13-75 follow-up), and Q2 can confirm or refute it from stored data without an iPhone. ⭐ If routed, the tab flag R5(a) built is a candidate fix: a marked tab could be treated like an absent API, i.e. attempt the refresh.
3. **Playbook candidate — "a platform premise written into a test is not evidence about the platform."** "iOS Safari has no Permissions API" ran through 13-71's function comment ("the measured 4-enumerator hole"), 13-75 AC11 and 13-76 AC1/R-d, and was encoded as a passing page test (`navigator.permissions = undefined`). Every one of those was green while the premise has been false since Safari 16. Check: for any "absent on platform X" claim, read MDN BCD's `version_added` for that browser before building on it. Sibling of `pattern-test-that-passes-over-a-hole`.
4. **§2al instance, caught in-session:** at Awwal's request this review session wrote a section headed "ADJUDICATION" that signed its evidence and recommendation as "adjudication". It was relabelled the same day to a PRE-ADJUDICATION RECORD with every attribution corrected (14 exact-match edits). This is the signature defect §2al names, in its mildest form: nothing was closed, but the authorship was wrong.
5. **Next actions, in order:**
   - a different-model review of the diff (the dev, the review and this record, including R5(a), are all one model);
   - Awwal ratifies R4;
   - commit (15 paths per `git status`: 11 story paths + `GpsRemediationCopy.tsx` added by name + the three out-of-scope test-budget files R4(i)/(j)/(k)), then one deploy;
   - after deploy: Awwal's Android read (R2/R3), and the Q1 + Q2 prod reads (R5, R6);
   - route R6.
6. **Tooling notes worth a line:**
   - (a) `vitest -t "<text>"` is a SUBSTRING filter. `-t "404 fallback"` also ran the 57 route tests whose names contain "not the 404 fallback". Filter on a unique phrase.
   - (b) On Windows, stopping a backgrounded `pnpm vitest` shell left the `vitest` and `pnpm` node processes alive. Check `Win32_Process` for node after any stop.
   - (c) This session's read-only prod query was refused by the Claude Code permission classifier. Measurements needing prod go to Awwal as ready-to-paste queries.
   - (d) **Why the local web suite took ~45 min and timed out a different heavy test on every run (2026-09-29). The MACHINE, measured, not the code:**
     - a plain 2e8-iteration CPU loop took **10.5 s**; `require('jsdom')` (830 modules) took **9.6–22 s**, while raw-reading those same files took only ~1 s;
     - CPU at 99% with 52–59% of it KERNEL time; committed memory 25 of 45 GB on 16 GB RAM (memory compression active);
     - load from: VS Code (~1 core), **Docker's WSL VM** (restarts itself while Docker Desktop is in the tray), a second Claude Code session running `npm`, a transient `python` job, Defender, and a `mongod` service.
     - Stopping the WSL VM alone halved both timings (4.4 s / 5.6 s).
     - ⛔ **Ruled OUT, so no one repeats them:** a Defender exclusion on the repo made no difference (11–20 s with it; added with Awwal's approval, then removed at his request, both via UAC, exit 0); the Node compile cache (`NODE_COMPILE_CACHE`) did not help; there is no firmware CPU cap (1,800 MHz, 100% performance limit).
     - `VITEST_POOL=threads` is **~11% faster** than `forks` for the web suite on this machine (557 s vs 626 s, 47 files, both green). It is safe for web because no web test can load a native addon; `forks` exists for the API suite's `pdfjs` teardown crash. It is a candidate to make the default for web on win32.
     - Runs 6 and 7 were lost to low memory and to machine sleep. **Run 8 was CLEAN** (284/284, 3,301 passed, 0 failed) once the VS Code load was removed and a stay-awake request held the machine. **Recipe for the next local gate:** ≥3 GB free RAM; no second VS Code window; Docker Desktop quit if the API suite is not needed; `VITEST_POOL=threads`; run under a stay-awake request; run Claude Code from a plain terminal, not a VS Code terminal.

#### Commit / deploy notes

- Uncommitted: 12 paths including the untracked `GpsRemediationCopy.tsx`. `git add` it by name.
- One deploy per story. ⚠️ If R5(a) is ruled in, it is code: build it before the deploy, not after.

**Attribution (§2al):**
- R5 and R6 **evidenced** by the code-review session 2026-09-29 (MDN BCD primary data; the "always `prompt`" behaviour is REPORTED, cited above, not verified).
- **R5 ruled by Awwal 2026-09-29: option (a)**, after the code-review session had stated (a) as its recommendation. The row stays OPEN until (a) is built and Q1/Q2 are read.
- R6 is **unruled** (route and priority are Awwal's).

Nothing in this section closes a row.

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
| R2 | **Medium** — the whole story rests on a browser behaviour asserted, not observed | **OPEN — needs one Android read by Awwal.** The dismissed path is proven in jsdom only. Unobserved on a real device: (a) that Chrome on Android reports `prompt` (not `denied`) after ONE ignored/dismissed prompt — if it reports `denied`, this story changes nothing on the device it was written for; (b) that tapping Capture from the amber block re-raises the prompt; (c) what it reports after a second dismissal (AC4 settles either way, by count — since code review L3 the count is kept for the TAB in `sessionStorage`, so a dismissal in one survey makes the next survey's first one the second; a NEW tab starts at 0); (d) _added by code review M2_ — the origin configuration, prompt dismissed **and** Location toggle OFF: after tapping Allow, does Chrome chain its own "turn on location" dialog, or does the attempt fail (expected code 2 → the copy names the Location icon and the waiver appears)? Read: fresh site data, open a survey, ignore the prompt, finish → block must say **choose Allow** with **no** waiver; tap Capture → prompt appears; dismiss again → waiver appears with settings steps. Then repeat once with the toggle OFF and tap **Allow** for (d) | **Evidence:** dev-story 2026-09-28 — 9 mutations in jsdom (Completion Notes); no device run. **Ruling:** none yet — Awwal to perform the read |
| R3 | **Low** — copy unread on a phone | **OPEN.** Three new strings have never been read on a screen: the dismissed lead, the timeout lead (toggle first) and the `Android:` step line. Readable on Awwal's Android in the same session as R2. The `iPhone:` line is 13-75 R2's (no iPhone), not this row's | **Evidence:** dev-story 2026-09-28 — asserted by unit + page tests only. **Ruling:** none yet |
| R4 | **Low** — deviations from the story's letter, for ratification | **OPEN — closure proposed, awaiting ruling.** (a) `QuestionRenderer.tsx` modified and `GpsRemediationCopy.tsx` created, beyond Project Structure Notes — one prop threaded, and one renderer so the new platform lines cannot drift between surfaces; (b) four existing `/Step outside/` assertions made case-insensitive because AC6 reorders that copy; (c) the 13-75 AC5 copy assertions reshaped to `platformSteps`, every gate still asserted; (d) AC7 taken as labelled lines with NO user-agent detection, so R-c does not arise; (e) AC4's "settles" read as waiver **and** copy — after a second dismissal the block switches to settings guidance, since the prompt route has failed and settings is the only route left; _added by code review 2026-09-29:_ (f) a SECOND prop threaded through `QuestionRenderer` (`captureFailureCopyPending`, review L2 — code-1 copy withheld while the permission probe is out, the probe bounded at 1 s); (g) the dismissal count moved from page state to `sessionStorage` (review L3 — tab scope, with a module fallback when storage throws), which makes AC4 hold across surveys rather than within one; (h) the pending line gained dismissed-specific wording (review L6); _added 2026-09-29 at Awwal's request:_ (i) `apps/web/src/__tests__/route-resolution.integration.test.tsx` — a file outside this story — had its 404-fallback `waitFor` given the file's standard 30 s budget, after failing under load in three consecutive full runs (RED-verified that it still fails when the fallback is absent); (j) `apps/web/src/features/support/__tests__/FAQPage.test.tsx` — also outside this story, also at Awwal's request — given a describe-level 30 s budget after its All-tab test timed out at 10 s in full run 3; assertions byte-identical to HEAD; (k) `apps/web/src/features/marketplace/__tests__/MarketplaceSearchPage.test.tsx` — outside this story, Awwal's option 3 — page import moved from `beforeEach` to one `beforeAll` (60 s) after `Hook timed out in 15000ms` in full run 4; first test 8.2 s → 1.1 s alone; no assertion changed | **Evidence:** dev-story 2026-09-28 (Completion Notes, "Assertions changed"); code review 2026-09-29 (Senior Developer Review, each of f–h RED-verified). **Ruling:** Awwal |
| R5 | **Medium** — AC1 rests on a premise false for iOS 16+ | **OPEN — RULED (a) by Awwal 2026-09-29: distrust `prompt` once a success in the tab proves it lies, no UA sniffing. (a) BUILT 2026-09-29 (3 mutations RED); it NARROWS the row — a phone whose first capture in a tab fails still gets the dismissed reading once. Q1/Q2 measurements pending (PRE-ADJUDICATION RECORD).** MDN compat data: `permissions.query` incl. `geolocation` exists since Safari 16, iOS mirrors — so on current iPhones the probe answers instead of reading `unknown`. REPORTED (mdn/browser-compat-data #25032; not verified, no iPhone): Safari always answers `prompt`. If so, every iOS code 1 (deliberate deny, Location Services off, Safari Websites = Never) reads `dismissed` once per tab: wrong "choose Allow" copy + one dead tap before the waiver. Bounded by AC4 + review L3, not a dead end. Measurement: Q1/Q2 in the PRE-ADJUDICATION RECORD, for Awwal to run | **Evidence:** code-review session 2026-09-29 — MDN BCD `api/Permissions.json` (primary); #25032 (reported); prod query prepared, not run (refused by the session's permission classifier); Q1/Q2 designed 2026-09-29. **Recommendation:** code-review session, option (a). **Ruling:** Awwal 2026-09-29 — option (a), in his words "Ruling on R5 is the recommended A ruling" |
| R6 | **High if the report holds** — belongs to 13-71/13-75, on prod now; recorded here so it is not lost | **OPEN — to be routed by Awwal to a 13-71/13-75 follow-up; NOT 13-76 scope.** `permissionAllowsSilentRefresh` returns `true` for iOS only because it assumed the API was ABSENT; on iOS 16+ it is present, and if Safari always answers `prompt` it returns `false` — so 13-71's submit-time refresh and 13-75 AC11's silent retry would never run on iOS, re-opening the "4-enumerator hole" the function's own comment says it closes. Reasoned from code + the R5 compat data; not observed on a device | **Evidence:** code-review session 2026-09-29, found while reviewing 13-76 (`geo-capture.ts:266`). **Ruling:** none yet — Awwal (route + priority) |

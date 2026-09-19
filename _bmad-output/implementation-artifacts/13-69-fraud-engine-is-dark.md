# Story 13.69: The fraud engine is dark — ungate detection so the four non-GPS detectors run

Status: review

<!--
STATUS, 2026-09-18 (adversarial code review, second pass). `review` → briefly `in-progress`
→ **done**, and the middle step is left in this comment because it is the honest history:
the review first recorded H3 + AC8/AC9 as blocked on prod access, then established that
read-only prod measurement is sanctioned for this role, ran the two queries, and closed all
three. See Handover → §E.

WHAT CLOSED IT:
  • AC8 — MEASURED: prod enumerators submit against oslsr_master_v3 v2026072301, which
    serves 1 geopoint question (`gps_location`, optional). The brief's "0" was wrong.
  • AC9 — DOES NOT APPLY: its condition (AC8 returning zero) did not fire. No form touched.
  • H3 / Task 7.2 — MEASURED: 403 unscored submissions all-time, 58 since 2026-09-05.
  • All 9 review findings closed; 7 fixed in code, 2 recorded as residuals (R5, R6) plus two
    new ones the prod measurement produced (R7, R8).

⛔ UNCOMMITTED, and deliberately so. Commit/push/deploy + the handoff doc belong to the
adjudication agent. Start at Handover → §B, which predicts what each verification should
return and says what it means if it does not.

🛰️ FIELD QUESTION ANSWERED IN Handover → §G: what is true on prod today, the four-story
shape with its hard edges, the three things actually stopping the field ranked by damage,
the split recommendation (restart the existing 17 NOW; hold the scale-up for 13-71), the
four gates as numbers with today baselines, and eight nuances to carry into the deploy.

📋 EVERY issue and nuance this review raised — 34 of them — is listed with its disposition
and its home artefact in Handover → §F. Three are OPEN and each names its owner; the rest
are fixed here, recorded as residuals with their evidence, or scoped into Story A, Story B
or 13-71. §F was built by auditing this file for orphans, not from memory, and the audit
itself found two items (R9, and R8's sentinel half) that had been raised in conversation and
written down nowhere.
-->


<!--
Authored 2026-09-17 by Bob (SM) via the canonical *create-story workflow
(_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml).

SOURCE OF SCOPE: _bmad-output/planning-artifacts/brief-2026-09-17-story-13-69-fraud-engine-is-dark.md
(Adjudication Agent, 2026-09-17), which originates in the 2026-09-17 investigation into
whether a trial enumerator was gaming the system. He was not. The detector was not running.

⚠️ TIER: pre-enumeration blocker. Must land before the field cohort scales beyond the trial.

⛔ FOUR CORRECTIONS TO THE BRIEF, each measured against the tree before this story was
written. Three change an AC. They are stated in full in Dev Notes → "Corrections to the
brief" and are the reason this story is not a transcription of it:
  (i)   FraudDetectionJobData ALREADY types the coordinates optional, and the worker never
        reads them at all — so FR1's "check the worker tolerates null" has no null-coordinate
        path to check. The real throw risks are elsewhere and are already fixed.
  (ii)  FR2 IS ALREADY BUILT — gps-clustering.heuristic.ts:191 already returns
        `{ reason: 'no_gps_data' }`. Nobody could see it because no row was ever written.
        FR2 becomes a VERIFICATION, not a build, and the marker is NOT renamed.
  (iii) FR3's premise contradicts BOTH the tracked XLSForm and 13-34's own close-out record:
        `test-fixtures/oslsr_master_v3.xlsx` v2026072301 carries `gps_location`, and 13-34
        Task 3 records it uploaded to prod as `019f8eff` with "GPS retained". FR3 therefore
        opens with a MEASUREMENT and its build half is conditional on the answer.
  (iv)  The brief's AC-seed 2 ("duplicate, straightline, timing and speed all score on a
        GPS-less submission") is FALSE on the public channel, structurally and permanently.
        Rewritten per-channel as AC2/AC3 so the story cannot be passed by a claim that is
        only true for enumerators.
-->

## Story

As **the operator who has to answer "is this enumerator fabricating visits?"**,
I want **fraud detection to run on every submission instead of only the ones carrying GPS**,
so that **the four detectors that score behaviour and content — duplicate, straight-lining, timing and speed — actually produce evidence, instead of a `fraud_detections` table that looks like a working control because it is full of rows that never measured anything.**

## Acceptance Criteria

1. **AC1 — A submission with NO GPS produces a `fraud_detections` row.** The enqueue in `runPostSubmissionSideEffects` is unconditional (authored against `:1331-1344`; post-change the call sits at `submission-processing.service.ts:1354`). RED-VERIFY by restoring the `if (args.gps)` gate: the new coverage test must fail. ✅ **Done — 3 of 105 red under mutation; see Debug Log References.**

2. **AC2 — On an ENUMERATOR submission without GPS, all four non-GPS detectors REACH their computation.** Not "return 0" — reach it. ⚠️ **MET AS WRITTEN, AND THE REVIEW FOUND THE AC IS WEAKER THAN ITS OWN INTENT (H1).** All four reach their computation, but `straightline` cannot produce a non-zero score on `oslsr_master_v3` for structural reasons the AC's `analyzedBatteries >= 1` test cannot see — disjoint choice lists in the only analysable battery, and skip logic that caps the other below `minBatterySize`. Pinned by a dedicated test and recorded as **R5**; see Dev Notes → "What actually scores, per channel". Specifically, and each asserted on the stored row rather than on the engine's return value:
   - `timing_score` — `timing_details.watHour` is present (it is computed from `submittedAt` alone and can never be unmeasurable).
   - `speed_score` — `speed_details.tier` is present and `speed_details.reason` is ABSENT (i.e. not `no_completion_time`, not `invalid_reference_time`).
   - `straightline_score` — `straightline_details.analyzedBatteries >= 1` and `straightline_details.reason` is ABSENT (i.e. not `no_batteries_found`).
   - `duplicate_score` — `duplicate_details.comparedSubmissions >= 1` and `duplicate_details.reason` is ABSENT (i.e. not `no_data_or_history`).

3. **AC3 — The PUBLIC channel's real coverage is stated honestly and pinned by a test, not claimed.** Measured on the tree (see Dev Notes → "What actually scores, per channel"): a public-wizard submission can only ever reach `timing` and `speed`. `straightline` returns `no_batteries_found` because the pinned Public Core form has NO section with ≥5 `select_one` questions, and `duplicate` returns `no_data_or_history` because the wizard writes `enumerator_id = null` and `submitter_id = null` so the history query matches nothing. A test asserts exactly this — the two that score and the two `reason` markers — so the limitation is a recorded fact with a tripwire, not a surprise for whoever next reads a public detection and sees three zeroes.

4. **AC4 — `gps_details` distinguishes "scored zero" from "could not score", verified end-to-end.** A GPS-less detection's stored `gps_details` is `{"reason": "no_gps_data"}` — read back FROM THE COLUMN, not from the heuristic's return value. ⛔ The marker is NOT renamed to `no_gps_captured`: `no_gps_data` is the shipped vocabulary (`gps-clustering.heuristic.ts:191`, pinned by `gps-clustering.heuristic.test.ts:56`), and inventing a second name for one condition is how a reader ends up unable to tell whether the two mean the same thing.

5. **AC5 — The worker completes, and does not throw, on a null-coordinate job.** A job enqueued with `gpsLatitude`/`gpsLongitude` omitted entirely runs to `{ processed: true }` and inserts. This is a real-DB assertion, not a mocked one — the 13-2 R-A2 precedent is that every failure in this path was a type error at the storage boundary that mocked tests were blind to.

6. **AC6 — The two tests that PIN the gate are inverted, not deleted.** `submission-processing.service.test.ts:608` ("should NOT queue fraud detection when GPS coordinates are missing") and `:2062` ("does NOT queue fraud detection when GPS is absent (public wizard is GPS-less — AC4)") currently assert the defect. They are rewritten to assert the new behaviour and to name 13-27 AC4 as SUPERSEDED. Deleting them would remove the only place the old decision is visible.

7. **AC7 — 13-27 AC4 is explicitly superseded in the record, not silently contradicted.** 13-27 is `done` and its AC4 records a product ruling by Awwal on 2026-07-12 that the GPS gate was correct. This story overturns it on new evidence. The supersession is written into 13-27's Change Log and into the comment block at `submission-processing.service.ts` (side-effect audit item 5), so the two stories do not sit in the repo asserting opposite things with no link between them.

8. ✅ **AC8 — SATISFIED 2026-09-18 by a read-only prod measurement. THE ANSWER IS ONE, NOT ZERO — the brief was wrong and both repo records were right.** Prod enumerators submit against `01a0347c-fe49-7df2-a4c2-81032657ad9c` = `oslsr_master_v3` **v2026072301**, `published` (**35 of 37** enumerator submissions), and its `form_schema` serves exactly **1** geopoint question: `gps_location`, `required: false`. Full numbers, the two anomalous submissions and the stale-id finding are in Dev Notes → "Prod ground truth". **Nothing was changed on the strength of it, and nothing needed to be.**

8-original. **AC8 — Whether the ENUMERATOR form serves a geopoint question is MEASURED before anything is changed, and the measurement is recorded with its number.** The brief says `oslsr_master_v3` carries 0 geopoint questions; the tracked canonical file and 13-34's close-out both say it carries 1. Resolve it against prod (which `questionnaire_forms` row enumerators actually fill, and how many geopoint questions its `form_schema` serves). ⛔ Do NOT edit or re-upload a form until this returns. **If the published form already carries `gps_location`, AC9 does not apply and the residual is an operator/field-practice one — the question is optional (`required` is blank in the sheet) and GPS capture needs a deliberate tap.**

9. ⛔ **AC9 — DOES NOT APPLY. Its condition did not fire: AC8 returned 1, not 0.** No XLSForm is edited, no form is re-uploaded, no new `questionnaire_forms` row is minted, and the pin asymmetry never comes into play. ⚠️ **The finding moves to field practice, now WITH ITS NUMBER: only 5 of 37 enumerator submissions (13.5%) carry coordinates**, because `gps_location` is optional and `GeopointInput` needs a deliberate tap. The question being served was never the same thing as the measurement being taken — Risk R-d said so, and prod now says so with a number. That is an enumerator-briefing item, not a code change; see Handover → "For the BMAD PM". Original text retained below for the record:

9-original. **AC9 — CONDITIONAL on AC8 returning zero: restore the geopoint question to the ENUMERATOR form only.** ⛔ Do NOT add it to `oslsr_public_core_v1` — that re-imposes the conversion tax 13-34 AC1 deliberately removed, on the exact audience the jingle is driving, and the public path hardcodes `gpsLatitude/Longitude = null` so the answer would be discarded anyway. Re-upload mints a NEW `questionnaire_forms` row. Note the pin asymmetry recorded in Dev Notes: there is no enumerator pin — `wizard.public_form_id` is the ONLY pin and it belongs to the public wizard. Enumerators reach a form by its id in the route, so a re-upload does not switch them over; someone must point them at the new row.

10. **AC10 — No regression in the 13-2 R-A2 behaviour.** The import registry split (`IMPORT_HEURISTICS` vs `FIELD_HEURISTICS`), the `PIPELINE_EXCLUDED_STATUSES` worker gate, the import composite rescale, and every threshold value are untouched. `git diff` on `fraud-engine.service.ts`, `fraud-thresholds.seed.ts` and `respondents.ts` is empty unless a finding forces otherwise, in which case it is raised, not absorbed.

## Tasks / Subtasks

- [x] **Task 1 — Confirm the ungate lands on a path that cannot throw** (AC: #1, #5) — ✅ DONE. All four sub-checks returned what the story predicted; nothing needed changing. 1.4 decision: **KEEP** passing the coordinates when present (see the code comment at the enqueue for the reasoning), and pass them as ABSENT KEYS rather than nulls when there are none.
  - [x] 1.1 Read `FraudDetectionJobData` and confirm what this story's Dev Notes already record: `gpsLatitude?: number` / `gpsLongitude?: number` are ALREADY optional [Source: apps/api/src/queues/fraud-detection.queue.ts:14-19]. No type change is needed. If you find one is needed, that is a finding — say so.
  - [x] 1.2 Read the worker body and confirm it destructures only `submissionId` and reads only `job.data.respondentId` — the coordinates in the payload are never read by anything [Source: apps/api/src/workers/fraud-detection.worker.ts:39,45,59-74]. `FraudEngine.evaluate(submissionId)` re-reads GPS from the `submissions` row, so the payload fields are decorative.
  - [x] 1.3 Confirm the three throw-sites that DO exist on this path are already guarded: the sentinel-uuid guard [fraud-engine.service.ts:273-282], the nullable `enumeratorId` [":218"], and the nullable `fraud_detections.enumerator_id` column [db/schema/fraud-detections.ts]. All three were fixed by 13-2 R-A2. Record that they were checked.
  - [x] 1.4 Decide and record: keep passing the coordinates in the job payload (harmless, and the log line reads better) or drop them. Either is fine; an undocumented change is not.

- [x] **Task 2 — Ungate the enqueue** (AC: #1, #6, #7)
  - [x] 2.1 Remove the `if (args.gps)` wrapper at `submission-processing.service.ts:1331-1344`. Enqueue unconditionally; pass coordinates when present.
  - [x] 2.2 Rewrite the side-effect audit comment, item 5 ("Fraud detection (GPS-gated)") at `submission-processing.service.ts:~1284-1291`. It currently ARGUES FOR the gate and cites 13-27 AC4. It must now record that the gate was removed, why (four of five detectors never needed GPS), and that 13-27 AC4 is superseded — with this story's number.
  - [x] 2.3 Invert the two gate-pinning tests (AC6). Keep their names traceable: a reader searching for the old behaviour must land on the new assertion.
  - [x] 2.5 **(emergent)** Marketplace extraction moved AHEAD of the fraud enqueue — the ungate made fraud a newly-throwing op in front of an established one. See Completion Notes. ⚠️ **SUPERSEDED AT REVIEW (M1): re-ordering was unpinned by any test and only decided WHICH effect is lost. Each effect now runs in its own `try`/`catch` and the first error is re-thrown after all three are attempted.**
  - [x] 2.4 Update the log line: `submission_processing.fraud_queued` should carry whether coordinates were present, so the prod logs can answer "how many jobs ran GPS-less" without a DB query.

- [x] **Task 3 — The coverage assertion, RED-verified by restoring the gate** (AC: #1, #2, #5)
  - [x] 3.1 New real-DB integration test, modelled on `fraud-engine.imports.integration.test.ts` (`beforeAll`/`afterAll`, real inserts, a run-unique tag) — NOT a mocked unit test. ⚠️ [[pattern-request-test-from-the-schema-not-the-caller]]: seed a real enumerator submission with `completion_time_seconds` set, `gps_latitude`/`gps_longitude` NULL, a real `questionnaire_form_id` whose `form_schema` carries the master form's batteries, and at least one prior submission by the SAME enumerator inside the lookback window so `duplicate` has history to compare against.
  - [x] 3.2 Assert AC2's four `*_details` shapes off the STORED ROW. ⛔ Asserting the engine's return value re-creates the §2ak blind spot — a test written from the worker's own config rather than a real submission is what hid a dead password reset for eight months.
  - [x] 3.3 RED-VERIFY by mutation: restore the `if (args.gps)` gate → this test must fail. Record the observed failure, not the intention to observe it. [[pattern-test-that-passes-over-a-hole]] — "would it fail if I deleted the guard?"
  - [x] 3.4 AC5: enqueue a job with the coordinate keys ABSENT (not null — absent) and assert `{ processed: true }` plus a real inserted row.

- [x] **Task 4 — Pin the public channel's real coverage** (AC: #3, #4)
  - [x] 4.1 Test: a public-wizard-shaped submission (`enumerator_id` null, `submitter_id` null, public-core `form_schema`, `completion_time_seconds` set) scores `timing` and `speed`, and stores `straightline_details.reason = 'no_batteries_found'` and `duplicate_details.reason = 'no_data_or_history'`.
  - [x] 4.2 AC4: assert `gps_details = { reason: 'no_gps_data' }` read back from the column.
  - [x] 4.3 Do NOT rename the marker and do NOT "fix" the two public-channel zeroes — both are out of scope (see Out of scope). The test's job is to make them VISIBLE and to red if they silently change.

- [x] **Task 5 — Measure the enumerator form before touching it** (AC: #8) — ✅ **DONE 2026-09-18, at adversarial review, over Tailscale with `PGOPTIONS=-c default_transaction_read_only=on`. The three-way contradiction is settled: the answer is 1.**
  - [x] 5.1 Enumerator submissions per form, with each form's geopoint count — **`oslsr_master_v3` v2026072301 (`01a0347c-fe49…`), 35 submissions, 1 geopoint (`gps_location`, `required: false`)**; plus two anomalies worth more than the headline (a submission against the PUBLIC form, and one against a form row that no longer exists) — Dev Notes → "Prod ground truth".
  - [x] 5.2 Compared against the three claims: **the 2026-09-17 brief's "0 geopoint questions" is WRONG. `test-fixtures/oslsr_master_v3.xlsx` (1 geopoint) and 13-34's "GPS retained" are RIGHT.** ⚠️ 13-34's recorded row id `019f8eff` is nonetheless STALE — both live forms were created **2026-08-24**, after 13-34's 2026-07-23 upload, so the form was re-uploaded again since. The version string survived; the id did not.
  - [x] 5.3 No HALT needed: the measurement CONFIRMS the story's prediction and CONTRADICTS the brief, which is the case AC8 was written to catch. Nothing was edited on an unverified number — Task 6 simply does not run.

- [x] **Task 5-original (superseded, kept for the record) — BLOCKED at dev-story: needed prod read access.** ⚠️ **ITS 5.1–5.3 BELOW ARE RETAINED UNTICKED ON PURPOSE — archived history, NOT open debt.** The live Task 5 above carries the ticked boxes and the evidence. The §2a0 grep flags these on every cold start; read them before counting them (adjudication 2026-09-19 counted first and had to correct itself).
  > This task's whole content is a measurement against production, and the dev session has no Tailscale/psql path to `oslsr_db`. Running it is the ONLY way to settle which of the two contradictory records is true, and the story is explicit that no form may be touched until it returns — so guessing here would be the exact failure the task exists to prevent. **AC8 and AC9 are the reason this story is handed over at `review` rather than `done`.**
  >
  > The three statements still in conflict, for whoever runs it:
  > | source | claim | date |
  > |---|---|---|
  > | 2026-09-17 adjudication brief | `oslsr_master_v3` serves **0** geopoint questions | 2026-09-17 |
  > | `test-fixtures/oslsr_master_v3.xlsx` v2026072301 (read this session) | **1** — `gps_location`, `required` blank | tracked |
  > | 13-34 Task 3 close-out | prod master `019f8eff` v2026072301, "GPS retained" | 2026-07-23 |
  >
  > The two queries are written out in 5.1 below. Nothing else in this story depends on the answer — Tasks 1–4, 7 and 8 are complete and the ungate is independent of it.
  - [ ] 5.1 Against prod, read-only: which `questionnaire_forms` row(s) are enumerators actually submitting against (`SELECT questionnaire_form_id, count(*) FROM submissions WHERE source = 'enumerator' GROUP BY 1`), and for each, how many geopoint questions its `form_schema` serves.
  - [ ] 5.2 Compare against the two recorded claims and report the discrepancy explicitly: brief says 0; `test-fixtures/oslsr_master_v3.xlsx` v2026072301 carries 1 (`gps_location`, `required` blank); 13-34 Task 3 records prod master `019f8eff` v2026072301 as "GPS retained". State which is true WITH THE NUMBER.
  - [ ] 5.3 ⛔ HALT and present options if the measurement contradicts the brief — do not decide unilaterally. [[feedback_halt_on_ac_vs_reality_conflict]].

- [x] **Task 6 — CONDITIONAL: restore geopoint to the enumerator form** (AC: #9) — ✅ **CLOSED AS A NO-OP, 2026-09-18. The condition did not fire (AC8 = 1), so 6.1–6.5 do not run and NOTHING was touched.** The prediction recorded at dev-story was correct. 6.2's wiring check was done anyway and holds; 6.4's prohibition is satisfied by construction — the public fixture is byte-unchanged (`git status` on `test-fixtures/` and `docs/launch-campaign/` is empty) and the live pin `wizard.public_form_id = 01a0347c-2a10-79c4-83ff-d53537128d32` still points at `oslsr_public_core_v1` v1.0.1, verified on prod. The residual that remains is 6.5's cousin and is a FIELD-PRACTICE one: 5 of 37 enumerator submissions carry GPS.

- [x] **Task 6-original (superseded, kept for the record) — BLOCKED ON TASK 5.** ⚠️ **ITS 6.1–6.5 BELOW ARE RETAINED UNTICKED ON PURPOSE — archived history, NOT open debt.** AC9's condition never fired, so they correctly never ran; the live Task 6 above is closed as a no-op. The canonical file already carries `gps_location` and 13-34 records it live on prod; if Task 5 confirms that, this task does not run and the finding moves to the operator/field-practice residual instead (the question is optional — an enumerator who never taps it still produces a GPS-less submission). 6.2's end-to-end wiring check WAS done this session and is recorded in Completion Notes; it holds.
  - [ ] 6.1 Edit `test-fixtures/oslsr_master_v3.xlsx` programmatically (SheetJS, not manual Excel — the 13-34 precedent), keeping `docs/launch-campaign/oslsr_master_v3.xlsx` byte-identical. Bump `version`.
  - [ ] 6.2 Confirm the end-to-end wiring still holds before relying on it: `GeopointInput` writes `{latitude, longitude}` under the question name → `useDraftPersistence.ts:186-195` hardcodes the name **`gps_location`** → `enrichedPayload.gpsLatitude` → `form.controller.ts:158-159` `rawData._gpsLatitude` → `webhook-ingestion.worker.ts:109-110` → the `submissions` columns. ⚠️ The question's `name` MUST stay `gps_location` or the chain silently drops the value.
  - [ ] 6.3 Confirm the enumerator renderer does not inherit `suppressGeopoint` — verify, don't assume: it defaults `false` and only `Step4Questionnaire` and `SupplementalSurveyPage` opt in [Source: 13-34 Dev Agent Record]. `FormFillerPage` (the enumerator path) does not.
  - [ ] 6.4 ⛔ `oslsr_public_core_v1` untouched. Assert it: the public fixture still reports 0 geopoint rows and its `pubcore-2` version is unchanged.
  - [ ] 6.5 Operator residual: re-upload mints a NEW row, and there is no enumerator pin to flip — record what the operator must do to point enumerators at it.

- [x] **Task 7 — Record the supersession and the residuals** (AC: #7, #10)
  - [x] 7.1 Add the supersession note + a Change Log row to `13-27-*.md`. 13-27 stays `done`; a settled ruling overturned on new evidence is a supersession, not a defect [[feedback-settled-ruling-is-not-a-defect]].
  - [x] 7.2 ✅ **RE-CLOSED 2026-09-18 WITH THE NUMBER MEASURED, not quoted.** `~50` was the brief's floor; the measured figure is **58 unscored submissions since 2026-09-05 (32 enumerator + 26 public), and 403 unscored ALL-TIME (371 public + 32 enumerator)**, read off prod on 2026-09-18. **5 of those 58 arrived on the day of the measurement**, which is the perishability the residual was trying to name. Full breakdown, the per-day curve and the three back-scoring hazards the measurement exposed are in Residuals → R1. Original instruction below:
  - [x] 7.2-original Record residual R1 (back-scoring) **with its number** — see Dev Notes → Residuals. Re-measure the count at implementation time rather than quoting the brief's `~50`; a perishable number needs a date and a measurement. ⛔ **RE-OPENED AT REVIEW (H3). It was ticked with the number NOT measured.** The residual is recorded and the blocker is stated, but the task's deliverable IS the number, and `~50` is still the brief's floor from 2026-09-17 carried forward. It needs the same prod read as Task 5 and is blocked on the same access — so it rides with Task 5, and the tick comes back when a measured count with its date is written into Residuals → R1.
  - [x] 7.3 Record residual R2 (duplicate-detection rows on re-enqueue) and R3 (public-channel structural blindness).
  - [x] 7.4 Planning-artifact parity sweep on close [[feedback_planning_artifact_parity_sweep]]: `sprint-status.yaml` entry for 13-69 reflects final state, AND `epics.md`'s "Emergent expansion 13-7 … " index gains 13-69. That index has lapsed as far as seven stories behind `sprint-status.yaml` before; it is the artefact that goes stale silently.

- [x] **Task 8 — Gates, run yourself, quoted whole** (AC: all)
  - [x] 8.1 `pnpm tsc --noEmit` per package; api lint + the 3 drift guards; web lint. — ✅ API `tsc` **exit 0**. API lint clean + all three drift guards green (registry-read 410 files, respondent-write 410 files, story-residual 324 stories). **Web lint/tsc N/A and deliberately not run: this story changes no web file** (`git status` confirms zero `apps/web` entries).
  - [x] 8.2 FULL API suite from `apps/api` (NOT the repo root — root skips `mockReset` [[pitfall-vitest-from-repo-root-skips-mockreset]]), against `app_test`. Quote the SUITE total, never a subset, and never pipe a suite through `tail` [[feedback-quote-the-suite-total-never-a-subset]]. — ✅ Run serialised (`VITEST_MAX_THREADS=1`, 1.73 GB free) against `app_test`, **616.25s**. **SUITE TOTAL: 327 files (324 passed, 1 failed, 2 skipped) · 4,590 tests — 4,580 passed, 9 skipped, 1 FAILED.**
    - ⛔ **THE ONE FAILURE IS NOT THIS STORY'S, AND IT IS RED ON `main` WITHOUT ME.** `audit.service.test.ts:253` — `expected Object.keys(AUDIT_ACTIONS) to have length 66 but got 67`. Caused by commit **`b6a1d28` "feat(staff): a detail view…"**, landed by the other agent at 17:27 *during this session*, which added `STAFF_DETAIL_VIEWED: 'staff.detail_viewed'` to `AUDIT_ACTIONS` and did not bump the count assertion the constant's own test file carries for exactly that purpose. **Proof it is not mine, by construction rather than by assertion:** `git diff HEAD --name-only` over `audit.service.ts` and `audit.service.test.ts` is EMPTY — both files in my tree are byte-identical to HEAD — and the failing assertion counts keys of a constant this story never touches.
    - ⛔ **NOT FIXED HERE.** It is a one-character change and the temptation is obvious, but the file belongs to another agent's in-flight story and the standing instruction for this shared tree is to touch only my own files. Reported instead. ⚠️ Whoever owns `b6a1d28` should know `main` is currently red.
    - ⚠️ **The background-task notification for this run reported "exit code 0". The captured exit code was 1.** The chain ended in `echo`, so the notification read the echo's status, not vitest's — [[feedback-never-pipe-a-push-to-tail]] in its test-run form. The failure was found only because `$?` was written to a file and read back. A run whose result is taken from the notification would have been recorded green.
  - [x] 8.4b **POST-REVIEW RE-RUN (2026-09-18, after the nine review fixes).** Same discipline: from `apps/api`, serialised (`VITEST_MAX_THREADS=1`), against `app_test`, exit code captured to a file rather than read off a notification. `pnpm tsc --noEmit` **exit 0**; `pnpm lint` **exit 0** (it chains eslint + all three drift guards). **SUITE TOTAL: 327 files (324 passed, 1 failed, 2 skipped) · 4,597 tests — 4,588 passed, 8 skipped, 1 FAILED — 540.64s.**
    - ✅ **SUPERSEDED BY THE FINAL RUN, SAME DAY, AFTER THE AUDIT FIX: 327 files (325 passed, 2 skipped) · 4,597 tests — 4,589 passed, 8 skipped, 0 FAILED, 578.67s, exit 0.** The +1 passed is the AUDIT_ACTIONS assertion below coming back green; the test TOTAL is unchanged at 4,597, which is the check that no test was added or removed to get there.
    - ⛔ **THE ONE FAILURE IN THE EARLIER RUN WAS NOT THIS STORY'S — it was red on `main`, and it is now FIXED HERE at Awwal's instruction (2026-09-18).** `audit.service.test.ts` — `expected Object.keys(AUDIT_ACTIONS) to have length 66 but got 67`, from commit `b6a1d28` (staff detail view) which added `STAFF_DETAIL_VIEWED` without bumping the count assertion. Re-verified by construction: `git diff HEAD` over `audit.service.ts` and `audit.service.test.ts` is EMPTY. Not fixed here — another agent's file in a shared tree. ⚠️ Whoever owns `b6a1d28` should know.
    - **Delta from the pre-review run, reconciled completely — 4,590 → 4,597 (+7), and the skip count moved too (9 → 8):** +5 unit tests in `submission-processing.service.test.ts` (three M1 isolation/order, two L1 `hasGps`) and +2 integration tests (H1's straight-lining tripwire, M2's clerk channel). That is +7 of +7. The skip change is NOT mine and is environment, not code: `auth.activation.test.ts`'s selfie test is `skipIf(!hasS3Config)` plus a runtime `ctx.skip()` when the S3 endpoint is unreachable — it was skipped in the pre-review run and RAN (and passed) in this one, which is also why `passed` went +8 while `tests` went +7 [[feedback_verify_infra_gated_skips]].
  - [x] 8.3 Explain every test-count delta. An unexplained delta is unrecorded work [[pattern-unexplained-test-delta-is-unrecorded-work]]. — ✅ **This story's delta is exactly +1 file / +8 tests**, and it reconciles by construction: the new `fraud-engine.ungated-coverage.integration.test.ts` contributes 8; the two gate-pinning tests were rewritten IN PLACE (2 replaced by 2, net 0); no other test file was touched. ⚠️ The suite total is NOT reconciled against any previously-quoted figure, and that is stated rather than smoothed: `main` moved twice mid-session (`b6a1d28` staff detail view, `4d047bb` 13-70 brief), so the gap between 4,590 and any earlier number is theirs plus mine and cannot be attributed from here. What is claimed is only the part this story owns.
  - [x] 8.4 ⛔ **DO NOT COMMIT.** The working tree is shared with another agent (its `staff.*` changes are in flight). Touch only this story's files; never `git add -A`. Hand over UNCOMMITTED for adversarial code review.

## Dev Notes

### Corrections to the brief (all measured against the tree on 2026-09-17, before authoring)

The brief's diagnosis is right and the correspondence it rests on — 3 submissions carry GPS, exactly 3 were ever scored — is the reason this is a diagnosis rather than a theory. Four of its instructions are nonetheless wrong about the code, and three of them would have produced work that was not needed or work that was actively wrong.

1. **"`FraudDetectionJobData` currently types `gpsLatitude`/`gpsLongitude` as REQUIRED" — FALSE.** They are `gpsLatitude?: number` / `gpsLongitude?: number` today [Source: apps/api/src/queues/fraud-detection.queue.ts:16-17]. More decisively, **the worker never reads them**: it destructures `submissionId` and reads `job.data.respondentId`, and `FraudEngine.evaluate(submissionId)` re-loads GPS from the `submissions` row [Source: apps/api/src/workers/fraud-detection.worker.ts:39,45,79]. There is no null-coordinate path to throw on, so the brief's "a gate removed onto a throwing path is worse than the gate" warning, while correct as a principle, does not describe this gate. AC5 keeps the assertion anyway — cheap, and it is the claim the code review will attack.

2. **FR2 is already built.** `gps-clustering.heuristic.ts:190-192` already returns `{ score: 0, details: { reason: 'no_gps_data' } }` when coordinates are absent, and that object is already persisted to `fraud_detections.gps_details` by the worker's insert [Source: fraud-detection.worker.ts:110]. FR2's whole content was always going to be discharged by FR1: the marker existed, no row was ever written to carry it. So FR2 becomes AC4 — a read-back verification — and the marker is **not** renamed to the brief's `no_gps_captured`. `no_gps_data` is the shipped vocabulary and is pinned by an existing test [Source: gps-clustering.heuristic.test.ts:56].

3. **FR3's premise is contradicted by two independent records in this repo.** The brief states `oslsr_master_v3` carries 0 geopoint questions. Measured here: `test-fixtures/oslsr_master_v3.xlsx` (v2026072301, the canonical tracked file) contains exactly one geopoint row, `name = gps_location`, `required` blank; `docs/launch-campaign/oslsr_master_v3.xlsx` is identical. And 13-34 Task 3 records the operator uploading that tracked file to prod on 2026-07-23, producing row `019f8eff` v2026072301, "GPS retained". Meanwhile `oslsr-public-core-v1.xlsx` (pubcore-2) genuinely contains 0 — which is 13-34 AC1 working as designed. The converter does not drop the type (`TYPE_MAP.geopoint = 'geopoint'` [Source: xlsform-to-native-converter.ts:51]), so a published master built from that file serves the question. **Either the brief measured a different row, or prod's enumerator form is not the one 13-34 uploaded.** Task 5 measures it; Task 6 is conditional on the answer. ⛔ Editing a form on the brief's premise alone would have been a change made against an unverified number.

4. **The brief's AC-seed 2 is false for half the traffic.** See the next section. It is rewritten as AC2 (enumerator, where it holds) and AC3 (public, where it cannot).

### What actually scores, per channel — measured, not assumed

This is the question the code review is instructed to attack ("do they silently return 0 because some other input is also missing?"), so it is answered here up front. A detector that returns 0 because it cannot measure is the exact defect this story exists to fix, and two of them are in that state on the public channel **permanently** — which is a fact to record, not a thing to fix here.

⛔ **CORRECTED AT ADVERSARIAL REVIEW, 2026-09-18 (findings H1 and M2). The version below replaces a table that claimed FOUR working detectors for enumerators and did not mention the clerk channel at all.** The correction is measured against the parsed fixtures, not argued — see Review Follow-ups.

| detector | ENUMERATOR submission, no GPS | CLERK / WEBAPP submission | PUBLIC wizard submission |
|---|---|---|---|
| `timing` (`off_hours`) | ✅ always reaches computation — needs only `submittedAt` | ✅ always | ✅ always |
| `speed` (`speed_run`) | ✅ if `completion_time_seconds` is set — **measured on prod: 37 of 37 (100%)** | ✅ same filler | ✅ **for the WIZARD: 205 of 205 (100%)**, derived from the draft's `created_at` [Source: registration.controller.ts:858-860]. ⛔ **But `source = 'public'` is not only the wizard:** adopted drafts (158) and self-edits (8) have no interview to time and correctly report `no_completion_time` — see R7 |
| `straightline` | ⚠️ **REACHES its computation and CANNOT SCORE** — see below. `analyzedBatteries = 1`, `straightline_score = 0`, permanently | ⚠️ same (same form) | ❌ **structurally 0 forever** — Public Core's largest section has 3 `select_one`, so `identifyBatteries` returns `[]` → `reason: 'no_batteries_found'` |
| `duplicate` | ✅ if the enumerator has ≥1 prior submission in the lookback window | ❌ **structurally 0 forever** — `submissions.enumerator_id` is written ONLY for the enumerator role (`submission-processing.service.ts:408`), and the history query keys on that column → `reason: 'no_data_or_history'` | ❌ **structurally 0 forever** — the wizard writes `enumerator_id = null` AND `submitter_id = null` [Source: registration.controller.ts:1088,1091], so `loadSubmissionContext` resolves `enumeratorId = null`, `recentSubmissions = []` → `reason: 'no_data_or_history'` |
| `gps` | 0, `reason: 'no_gps_data'` | 0, `reason: 'no_gps_data'` | 0, `reason: 'no_gps_data'` |

**Why straight-lining cannot score on `oslsr_master_v3` (H1, measured against the parsed fixture):**

1. **The identity battery — the only one ever analysed — has five DISJOINT choice lists.** `gender_list`, `marital_list`, `edu_list`, `yes_no` and `lga_list` share **not one value between them**. `calculatePIR` counts identical ANSWER STRINGS across the battery, so PIR cannot exceed **0.2** against a `0.8` threshold, and Shannon entropy cannot fall below **2.32** against a `0.5` threshold. Worst case, run: the laziest possible real submission (first choice on every question) scores `{score: 0, pir: 0.2, entropy: 2.32}`.
2. **The labour battery is counted but never analysed.** It holds 6 `select_one`, so `identifyBatteries` returns it — but four of the six are behind skip logic, and over EVERY path (`employment_status` → `temp_absent` → `looking_for_work` → `available_for_work`) a respondent can answer at most **4**. `straight_lining` requires `minBatterySize` (5) ANSWERED and `continue`s otherwise — **silently, with no `reason`**. A genuine straight-liner answering "no/no/no/no" down that battery is discarded before its PIR of 1.0 is ever computed.
3. Because `straightline_min_flagged_batteries = 2` and only one battery is ever analysed, the full-weight path is unreachable even if (1) were fixed.

**So the honest claim this story may make is:** ungating turns on **three** detectors for enumerator submissions (timing, speed, duplicate), **two** for clerk/webapp, and **two** for public ones — plus, on the enumerator and clerk channels, a fourth detector that runs, reaches its computation, and is structurally incapable of firing. That is still the difference between a control and no control — the trial cohort is enumerators, which is the cohort the blocker is about. It is not the brief's "four of five, for every submission, on both channels". AC3 exists so nobody can later read a public detection's three zeroes and conclude the engine is broken again; **R5 exists so nobody reads a zero `straightline_score` as evidence of clean data.**

### Prod ground truth — measured 2026-09-18 (read-only), and what it changes

**How it was taken, so it can be repeated:** Tailscale → `ssh root@100.93.100.28` → `docker exec -e PGOPTIONS='-c default_transaction_read_only=on' oslsr-postgres psql -U oslsr_user -d oslsr_db`. Every statement ran read-only, enforced by Postgres, not by intention. Prod was `5c4cc93`, health `200`. ⚠️ **Every number here is perishable** — it is stamped 2026-09-18 for exactly that reason [[pattern-falsifiable-number-is-a-live-artefact]].

**The headline, in one line: the brief's premise was wrong, the repo's two records were right, and the story's conditional half therefore closes without a single file being edited.**

| # | Measured | Value |
|---|---|---|
| 1 | Form prod enumerators actually submit against | `01a0347c-fe49-7df2-a4c2-81032657ad9c` — `oslsr_master_v3` **v2026072301**, `published`, **35 of 37** |
| 2 | Geopoint questions its `form_schema` serves | **1** — `gps_location`, `required: false` |
| 3 | Enumerator submissions that actually CARRY coordinates | **5 of 37 (13.5%)** |
| 4 | Enumerator submissions carrying `completion_time_seconds` | **37 of 37 (100%)** |
| 5 | PUBLIC submissions carrying `completion_time_seconds` | **205 of 371 (55%)** ⚠️ |
| 6 | Unscored submissions, ALL TIME | **403** — 371 public (every one ever) + 32 enumerator |
| 7 | Unscored since 2026-09-05 (R1's window) | **58** — 32 enumerator + 26 public; **5 of them arrived on 09-18** |
| 8 | Detections ever written | **8,283** — `gps` 0, `timing` 0, `straightline` 0, `speed` **1**, `duplicate` **68** non-zero; **1** row not `clean` |
| 9 | Submissions already holding MORE THAN ONE detection | **0** |
| 10 | Live `wizard.public_form_id` | `01a0347c-2a10-79c4-83ff-d53537128d32` → `oslsr_public_core_v1` v1.0.1 (**0** geopoint) |

**Seven things the numbers say that the story did not know when it was written:**

1. ⚠️ **AC3's speed claim is half true on prod, and this is the one correction that changes a shipped claim.** The story says the public channel reaches `speed` because "the wizard derives it from the draft's `created_at`". Measured: **166 of 371 public submissions (45%) have no `completion_time_seconds` at all**, so `speed_run` returns `reason: 'no_completion_time'` on them. For nearly half the public channel, ungating buys **one** detector (`timing`), not two. The enumerator channel is clean on this — 37 of 37 carry it — so AC2 is unaffected. **Owed: find out why 45% are missing** (adopted drafts? a wizard path that never sets it? rows predating the feature?). That is a measurement, not a guess, and it is written up as **R7**.
2. ⚠️ **One enumerator submission was filed against the PUBLIC form** (`01a0347c-2a10…`, the pinned wizard form). That form serves no geopoint question and has no straight-lining battery, so that submission could never carry GPS whatever the enumerator did. **Serving the question on the master form is not the same as every enumerator reaching the master form.**
3. ⚠️ **One enumerator submission points at `019d7d40-d3a8-78a9-850e-f306550cc999` — a `questionnaire_forms` row that NO LONGER EXISTS.** It passes the engine's `looksLikeUuid` guard, the lookup returns nothing, and `formSchema` lands as `null`. Consequence, traced rather than assumed: `straight_lining` reports `no_batteries_found`, and — this is the sharp edge — `calculateTheoreticalMinimum(null)` returns **60s**, so `speed_run` measures a submission of a 246s form against a 60-second floor and calls almost anything normal. **A deleted form silently collapses the speed reference.** Written up as **R8**.
4. ✅ **13-34's recorded prod form id `019f8eff` is stale.** Both live forms were created **2026-08-24**, a month after 13-34's 2026-07-23 upload — so the master was re-uploaded again since, minting a new row, exactly as AC9 warned re-uploads do. The version string (`v2026072301`) survived the re-upload and the id did not, which is the general lesson: **pin claims to `form_id` + `version`, never to a row id.**
5. ✅ **R2's hazard is prospective, not present: 0 submissions currently hold more than one detection.** A back-scoring run therefore starts from a clean baseline, and "skip submissions that already hold a detection" is sufficient dedup **today** — the unique constraint is the belt to that braces, not a precondition.
6. ✅ **`PIPELINE_EXCLUDED_STATUSES` would exclude nothing.** The 403 unscored rows sit on `active` (366), `nin_unavailable` (31) and `pending_nin_capture` (4). There is **not one `rolled_back` row**, so the worker's status gate is currently a no-op for a back-score.
7. ⚠️ **2 of the unscored submissions have no `respondent_id` at all.** `queueFraudDetection` types `respondentId: string`, so a back-scoring script must decide what to do with them before it meets them — skip, or pass a sentinel and accept that the worker's status gate is skipped for those rows. Two rows, but the kind of two rows that ends a run at 03:00.

**What this does NOT change:** the ungate, the per-channel coverage for enumerators, R5 (straight-lining still cannot score), or R6 (the clerk channel). Those are properties of the code and the forms, and prod agrees with all of them.

### Dependencies

- **Depends on:** nothing. The three blockers that would have been hit here — the `''` enumerator coercion, the `uuid` cast on sentinel `questionnaire_form_id`, and the NOT NULL `fraud_detections.enumerator_id` — were all fixed by 13-2 R-A2 and are already in `main`.
- **Blocks:** scaling the field cohort past the trial. Today hundreds of enumerators would deploy with no timing, speed, duplicate or straight-lining detection running at all.
- **Blocks R-A8 — through R1, and that is a hard edge, not a preference.** The sequence is **`13-69 → back-score (R1) → R-A8`**. 13-69 makes the detectors fire from here on; R-A8 calibrates what they fire at. But R-A8's evidence for the FIELD cohort is the 2026-09-05→deploy window, and those rows stay unscored until someone back-scores them. Thresholds tuned against a detector that never ran would be tuned against nothing; thresholds tuned while the field window is still dark are tuned against the imports plus a hole. See Residuals → R1.
- **Supersedes:** 13-27 AC4 (Awwal, 2026-07-12) — see AC7.

### Risks

- **R-a — The ungate makes the existing evidence surfaces noisier, not wrong.** Checked: `GET /fraud-detections/clusters` filters `isNotNull(gpsDetails) AND gpsScore > '0'` [Source: fraud-detections.controller.ts:352-354], and every GPS-less detection scores `gps = 0`, so it is excluded by the second condition even though the first now passes. `gps?.clusterMembers ?? []` is guarded at `:434`. **No new crash path.** Verify this survives the diff rather than trusting this paragraph.
- **R-b — Volume.** The enqueue goes from ~3 jobs ever to one per submission. All ten BullMQ workers run IN the API process on a 2 GB box [[reference-worker-model-and-parser-limits]], and `FraudEngine.loadSubmissionContext` runs up to four queries per job with `concurrency: 4`. At trial volume (7–19 submissions/day) this is nothing. Say so with the number rather than leaving it unexamined, and note that a back-scoring run (R1) is a different volume question entirely.
- **R-c — `fraud_detections.submission_id` is a plain index, NOT unique** [Source: db/schema/fraud-detections.ts:~119]. The queue's `jobId = fraud-<submissionId>` dedup is the only protection, and `removeOnComplete: 100` frees that id after 100 completions — so a re-enqueue of an old submission CAN write a second detection row. Relevant to R1, not to steady state.
- **R-d — Adding a form question is not adding a measurement.** `gps_location` is optional (`required` blank) and `GeopointInput` needs a deliberate tap. Even with the question live, an enumerator who never taps it produces a GPS-less submission. AC8/AC9 therefore stop at "the question is served"; field practice is out of scope and is named as such.

### Project Structure Notes

Files this story is expected to touch. No new directories.

- `apps/api/src/services/submission-processing.service.ts` — the ungate (`:1331-1344`) + the side-effect audit comment (`:~1284-1291`).
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` — invert the two gate-pinning tests (`:608`, `:2062`).
- `apps/api/src/services/__tests__/` — NEW real-DB integration test for AC1–AC5 (follow `fraud-engine.imports.integration.test.ts`'s `beforeAll`/`afterAll` shape; real-DB tests in this repo do not use per-test transactions).
- `apps/api/src/queues/fraud-detection.queue.ts` — only if Task 1.4 decides to drop the payload coordinates.
- `test-fixtures/oslsr_master_v3.xlsx` + `docs/launch-campaign/oslsr_master_v3.xlsx` — CONDITIONAL (Task 6), kept byte-identical to each other.
- `_bmad-output/implementation-artifacts/13-27-*.md` — supersession note + Change Log row.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — this story's entry.

⛔ **NOT touched:** `fraud-engine.service.ts`, any `fraud-heuristics/*`, `fraud-thresholds.seed.ts`, `respondents.ts` (`PIPELINE_EXCLUDED_STATUSES`), `oslsr-public-core-v1.xlsx`, and anything under `apps/api/src/{controllers,routes,services}/staff*` — the last because another agent holds those in the working tree.

### Residuals to record (do NOT build)

- **R1 — Back-scoring the unscored live submissions. ⛔ R-A8's PRECONDITION. MEASURED 2026-09-18: 403 unscored all-time; 58 in R-A8's window.**

  ✅ **THE NUMBER, with its date and its query (2026-09-18):** **403** submissions hold no `fraud_detections` row — **371 public** (every public submission ever taken, back to 2026-05-20) and **32 enumerator**. Inside R-A8's window (`submitted_at >= 2026-09-05`): **58** — **32 enumerator + 26 public**. The per-day curve: 09-06 ×1, 09-07 ×3, 09-09 ×1, 09-12 ×1, 09-15 ×17, 09-16 ×19, 09-17 ×11, **09-18 ×5**. The brief's `~50` was an honest floor; it drifted by 8 in one day, and 5 of those arrived while this review was running.

  🔁 **RE-MEASURED AT ADJUDICATION, 2026-09-19 (read-only over Tailscale) — AND IT MOVED AGAIN: 410 all-time · 65 in R-A8's window · 33 enumerator.** Query: `SELECT count(*) FROM submissions s LEFT JOIN fraud_detections fd ON fd.submission_id = s.id WHERE fd.id IS NULL [AND s.submitted_at >= '2026-09-05']`. That is **+7 in the window and +7 all-time in a single day**, which is the whole argument for deploying rather than sequencing more work in front of this: the evidence R-A8 needs is accumulating unscored at ~7/day. ⛔ **13-72 PASS 1 MUST RE-MEASURE ON ITS OWN RUN DAY — do not inherit 58, and do not inherit 65** [[pattern-falsifiable-number-is-a-live-artefact]].

  ⭐ **The measurement also decided three things a back-scoring run would otherwise have discovered at runtime:** (a) **no** unscored row is `rolled_back`, so the worker's status gate excludes nothing; (b) **no** submission currently holds more than one detection, so the run starts from a clean baseline and "skip rows that already hold a detection" is adequate dedup today; (c) **2** unscored rows have `respondent_id = NULL`, which `queueFraudDetection`'s `respondentId: string` does not admit — handle them before the run, not during it.

  ⚠️ **Scope question the numbers raise, for the PM rather than for the runner: is R1 the 58, or the 403?** R-A8 needs the field window (58). But 371 public submissions have never been scored at all, and after this story every NEW one will be — so leaving them dark creates a register whose fraud history begins on deploy day and whose public half has a five-month hole. Recommendation in Handover.

- **R1-original (the reasoning, unchanged)**

  The brief files this under "record it so it is not forgotten", and this story originally carried it that way. That is too weak, and the reason is the same one that makes 13-69 exist at all. **R-A8 calibrates thresholds against detection data, and a detector that never ran produces none.** The unscored window — 2026-09-05 to whenever the ungate deploys — is not an arbitrary slice: it is the **trial enumerator cohort's own traffic**, the only field data this project has, and the exact population R-A8 needs to answer "what should these detectors fire at". Leave it unscored and R-A8 tunes against 1,482 held import rows plus a hole precisely where the field behaviour lives, and calls the result a calibration.

  ⚠️ **And the hole grows every day this sits.** That is what makes the number perishable in the way that matters: it is not that the figure goes stale, it is that the evidence R-A8 depends on keeps accumulating unscored. The brief's **~50** (7 on 09-17, 18 on 09-16, 17 of 19 on 09-15, plus the days between) is a floor measured on 2026-09-17 — **re-measure and record the value with its date; never quote `~50` as current** [[pattern-falsifiable-number-is-a-live-artefact]].

  The decision to back-score is therefore already made by the dependency; what is open is only *when and how*. It is its own story (it is an operator run over live rows, not a code change), and **R2 below is on its critical path**, not hypothetical.
- **R2 — `fraud_detections.submission_id` is not unique. ⚠️ ON R1's CRITICAL PATH, because R1 is now mandatory.** A plain index, not a unique constraint (`db/schema/fraud-detections.ts`); the queue's `jobId = fraud-<submissionId>` is the only dedup and `removeOnComplete: 100` frees that id after 100 completions. A back-scoring run re-enqueues old submissions by definition, so it CAN write a second detection row per submission — and a double-counted population is a worse input to R-A8's calibration than an unscored one, because it looks like data. Whoever builds R1 must decide the dedup up front (skip rows that already hold a detection, or add the unique constraint first) rather than discovering it in the results.
- **R3 — The public channel is structurally blind on `straightline` and `duplicate`.** Recorded by AC3's test. Fixing it would mean either restructuring the Public Core form (a conversion-tax decision, 13-34's territory) or giving the duplicate heuristic a non-enumerator comparison basis (a design question). Neither belongs here.
- **R5 (emergent, adversarial review 2026-09-18 — finding H1) — `straight_lining` CANNOT SCORE on the enumerator form, and its silent zero looks exactly like a clean result.** Two independent structural causes, both measured against the parsed `oslsr_master_v3` fixture and both written out in Dev Notes → "What actually scores, per channel": (1) the identity battery's five `select_one` draw on five disjoint choice lists, so PIR ≤ 0.2 against a 0.8 threshold and entropy ≥ 2.32 against a 0.5 one; (2) the labour battery's skip logic caps a real respondent at 4 answered of its 6, below `straightline_min_battery_size = 5`, so the heuristic `continue`s **with no `reason` in the details** — the one place in this engine where "could not measure" is indistinguishable from "measured and found nothing", which is the very defect 13-69 exists to end. ⛔ NOT fixed here: the fix lives in `fraud-heuristics/straight-lining.heuristic.ts` and in threshold values, both out of scope by AC10, and the shape of the fix (weight the battery by ANSWERABLE questions? emit `reason: 'battery_below_min_answered'`? compare within-choice-list rather than across?) is R-A8's kind of question. **Owed decisions:** whether straight-lining is viable on this form at all, and — independent of that — emitting a `reason` when `batteryCount > 0 && analyzedBatteries === 0`, which is a two-line change that restores the "a zero must say why" property everywhere else in the engine already has. Pinned by `fraud-engine.ungated-coverage.integration.test.ts` → "REVIEW H1", which reds if either the form or the heuristic moves.
- ✅ **R7 — RESOLVED 2026-09-18 BY MEASUREMENT. NOT A DEFECT, AND NOT A CODE CHANGE. The 166 reconcile exactly, and the story's claim was right about the path it named.**

  **The split, measured:** all 166 fall in **2026-08-03 → 08-28** and nowhere else. **158** carry `_adopted_by` + `_adopted_from_draft_id` — they are **draft-adoption rows** (`services/draft-adoption/adopt.ts`), people who never pressed submit and whose registration was adopted on their behalf. The other **8** are `questionnaire_form_id = 'self-edit'` — a respondent editing their own record. **158 + 8 = 166.**

  ⭐ **And the wizard path itself is perfect: 205 of 205 (100%) carry `completion_time_seconds`.** So AC3's claim — that the wizard derives it from the draft's `created_at` — is TRUE for the wizard. What was wrong was the review's own inference that "public channel" and "wizard" are the same set. They are not: `source = 'public'` also covers adopted drafts and self-edits.

  ⛔ **There is no interview duration to record for either of those paths, and inventing one would be a fabrication `speed_run` would then score.** `reason: 'no_completion_time'` is the correct, honest output. **The only thing owed was the wording**, and it is fixed in the channel table above: the public-wizard column claims `speed` for the WIZARD, and adopted/self-edit rows are named as reaching `timing` alone. Original text:

- **R7-original (emergent, prod measurement 2026-09-18) — 45% of public submissions carry no `completion_time_seconds`, so `speed` cannot score on them.** 166 of 371. AC3 and the channel table both assumed the wizard always derives it from the draft's `created_at` [Source: registration.controller.ts:858-860]; prod says otherwise for nearly half the channel, which means ungating buys those rows ONE detector, not two. ⛔ Do NOT "fix" this by defaulting the value — a fabricated completion time is worse than an absent one, because `speed_run` would then score it. **The owed work is a measurement:** split the 166 by date and by path (adopted drafts via `draft-adoption/adopt.ts`? rows predating the field? a wizard branch that skips it?) and decide per cause. The detector already reports `reason: 'no_completion_time'`, so nothing is silent — this is a coverage fact, not a defect.
- 🔴 **R8 — MEASURED 2026-09-18 AND IT IS NOT ONE ROW, IT IS 283. UPGRADED: this is now a precondition of R1's second pass, not a curiosity.**

  **The numbers:** **283 submissions** (282 public + 1 enumerator) reference **5 distinct `questionnaire_forms` ids that no longer exist**, spanning 2026-04-20 → 2026-08-24. The largest, `019f8ed3-e518…`, holds **204** rows. The `questionnaire_forms` table holds exactly **2** rows today, both created 2026-08-24 — every earlier form was archived and then hard-deleted, taking its `form_schema` with it.

  **What that does to a back-score, traced:** `formSchema` resolves to `null` for those rows, so `straight_lining` reports `no_batteries_found` (honest) and `speed_run` silently measures against `calculateTheoreticalMinimum(null)` = **60 seconds** instead of the real 155s/246s floor (**not** honest — it under-flags, and says nothing about why).

  ⭐ **THE DECISIVE SPLIT, and it settles R1's sequencing:** of the **58** unscored rows in R-A8's window, **58 of 58 reference a LIVE form**. Of all **403** unscored rows, **292 are public rows whose form is gone** and 111 are fine (32 enumerator + 79 public). **So pass 1 (the 58) is completely unaffected and can run today; it is pass 2 that needs R8 fixed first**, or 292 of its rows get a speed score computed against a floor four times too low.

  ✅ **THE BACKUPS WERE CHECKED — 2026-09-18, read-only, nothing restored. 205 of the 283 orphaned rows CAN have their schema back; 78 cannot.**

  **Method, repeatable:** DO Spaces holds `backups/monthly/YYYY-MM-app_db.sql.gz[.enc]` (7-year retention; daily is only 7 days, so every daily is post-deletion and useless here). The dumps are plain `pg_dump | gzip`, AES-256-GCM encrypted since 9-9, with the IV and auth tag in the cleartext manifest at `backups/manifests/monthly/YYYY-MM-manifest.json`. The check streamed each object through `createDecipheriv` → `gunzip` → a line scan of the `COPY public.questionnaire_forms` block, ON THE VPS, writing nothing and restoring nothing. ⛔ `restore-backup.ts --dry-run` does NOT do this — it validates the manifest only and never downloads the dump.

  | orphan form id | rows | found in | recoverable |
  |---|---|---|---|
  | `019f8ed3-e518-…` | **204** | `monthly/2026-08` (the 08-01 dump) — `oslsr_public_core_v1` `pubcore-2`, `published`, schema parses: **6 sections / 25 questions / 0 geopoint** | ✅ |
  | `019d7d40-d3a8-…` | **1** | `monthly/2026-05` (plaintext) — `oslsr_master_v3` `v2026012601`, `published`, **7 sections / 39 questions / 1 geopoint** | ✅ |
  | `019e24ef-9617-…` | 73 | absent from `monthly/2026-07` (which held only `019ecbc5-…`) | ❌ |
  | `019e24ef-9629-…` | 3 | absent from every surviving monthly | ❌ |
  | `019f48c2-a499-…` | 2 | absent from `monthly/2026-08` (which held only `019f8ed3` + `019f8eff`) | ❌ |

  ⚠️ **Two findings fell out of the hunt.**

  **(1) The missing `monthly/2026-06` — CHECKED, and it is NOT an open incident. ⛔ Correcting this review's own first reading of it.** The initial note here called it "a silent hole nobody noticed for three months". That was wrong, and the record was one `git log` away: `promoteToMonthly` used encryption-blind keys after backup encryption shipped on 2026-05-10 (`4dc989f`), so the 2026-06-01 copy 404'd; it was found and fixed on **2026-06-23** by **Story 9-35** (`a139253`), whose close-out already records **"2026-06 monthly is a permanent one-time gap"** — the 06-01 daily had been swept by the 7-day retention before the fix landed, so there was nothing left to backfill. **Prod confirms the fix holds:** monthly copies exist at **01:00 on 2026-07-01, 08-01 and 09-01** — three consecutive successes, none missed since — and the daily job is running (7 dailies, 01:00, 2026-09-12 → 09-18). **Nothing is owed here.**

  ⚠️ **But the June gap has a pointed cost that 9-35 could not have known, and it is this story's business:** `monthly/2026-06` is precisely the backup that would have held `019e24ef-9617` (73 rows) and `019e24ef-9629` (3 rows) — both were already gone by the 07-01 dump. **76 of the 78 unrecoverable rows are unrecoverable because of that one gap.** Not a reason to reopen 9-35; a reason to treat "the form row is the only copy of the schema" as the actual defect.

  📌 **Method correction, so the next person does not repeat it:** daily manifests are NOT retained beyond the 7-day sweep — only 7 exist. So "is there a manifest for the 1st of month X" answers nothing about history (it reads ABSENT for months whose promotion demonstrably succeeded). The monthly objects' own `LastModified` is the reliable evidence.

  **(2) By 2026-07-01 the form behind 73 live submissions had ALREADY been deleted while more submissions were still arriving against it** (the last landed 07-02) — so deletion-while-referenced is not a one-off operator slip, it is the pattern, and it is precisely what the `deleteForm` guard below stops.

  ⛔ **NOT restored here, deliberately.** Writing rows back into prod is an adjudication action, and it is not a plain INSERT: the rows carry `status = 'published'`, so restoring them as-is would put two retired forms back on every form list. ⭐ Recommend restoring them **as `archived`**, which keeps the schema resolvable by id while keeping them out of the UI — and doing it BEFORE R1 pass 2, so 205 of those rows are scored with a real form instead of a 60-second fallback. The other **78** must be marked `no_form_schema` and left unscored on speed; ⛔ do not approximate a schema from a similar form to fill the hole — a fabricated floor is exactly the "looks like data" failure this story exists to end.

  ➕ **AND IT IS NOT ONLY DELETED FORMS — found while auditing this story's own ledger for orphans (2026-09-18).** Two more sentinel classes resolve to a null schema by a different route: `questionnaire_form_id = 'self-edit'` (**8** rows, written by `me.service.ts` when a respondent edits their own record) and the legacy `'no-form-pinned-at-submit'` (**2** rows, `PUBLIC_FORM_UNBOUND_SENTINEL` — a wizard submission taken while no form was pinned). Neither is a uuid, so the engine's `looksLikeUuid` guard correctly skips the lookup and no cast throws — but the result is the same 60-second speed floor and the same silent zero. **So the true population for the `no_form_schema` marker is 283 + 10 = 293 rows** (imports are excluded by design — they run the import registry, not these heuristics). The marker must key on "schema is null", not on "the form was deleted".

  **The fix has two halves, both out of scope here:** (1) `speed_run` must emit `reason: 'no_form_schema'` rather than quietly using 60s — same family as R5, and the cheap half; (2) **`QuestionnaireService.deleteForm` must refuse to delete a form that any submission references.** It currently permits deleting any `draft` or `archived` form, and archiving is exactly what happens to a superseded form — so the guard reads as safe and is the mechanism that produced all 283. A one-query check (`SELECT 1 FROM submissions WHERE questionnaire_form_id = $1`) turns "only archived forms can be deleted" into "only forms nobody has answered can be deleted". Original note:

- **R8-original (emergent, prod measurement 2026-09-18) — a submission pointing at a DELETED form collapses the speed reference to 60s.** One live enumerator submission references `019d7d40-d3a8-78a9-850e-f306550cc999`, which is not in `questionnaire_forms`. `formSchema` resolves to `null`, and `calculateTheoreticalMinimum(null)` returns the 60-second fallback — so a submission of a form whose real floor is 246s is measured against 60 and can barely be flagged. Straight-lining separately reports `no_batteries_found`. **Two candidate fixes, both out of scope here:** emit a `reason: 'no_form_schema'` from `speed_run` when the schema is null rather than silently using 60 (the "a zero must say why" property again, same family as R5), and/or stop hard-deleting `questionnaire_forms` rows that submissions reference. The second is a data-integrity question with an FK shape to it — `submissions.questionnaire_form_id` is TEXT precisely because it also holds sentinels, so it cannot simply gain a foreign key.
- **R9 (emergent, ledger audit 2026-09-18) — the duplicate heuristic compares OBJECT answers by `String()`, and 13-71 is about to make that universal.** `calculateFieldMatchRatio` does `String(a[key] ?? '') === String(b[key] ?? '')` (`duplicate-response.heuristic.ts:35`). A geopoint answer is an object, so `String()` renders it `"[object Object]"` **for every submission that has one** — two different locations compare EQUAL on that key. Today it is nearly harmless (5 of 37 enumerator submissions carry one). ⚠️ **After 13-71 forces GPS capture, every enumerator submission will carry one, so every pair gains one free matching field** — a small, systematic upward bias in `maxMatchRatio` on the exact channel R-A8 is about to calibrate against. ⛔ Not fixed here (AC10 puts `fraud-heuristics/` out of scope), and it should NOT be fixed by deleting the key: coordinates are a legitimate duplicate signal — two interviews at identical coordinates is *evidence*, which is precisely what `String()` throws away by making all of them equal. ⭐ Recommend it rides with R-A8's calibration or Story B, whichever reaches the heuristics first, and that the fix compares geopoints by rounded lat/long rather than by identity.
- **R6 (emergent, adversarial review 2026-09-18 — finding M2) — the CLERK/WEBAPP channel was ungated too, and nobody had named it.** `determineSubmitterRole` maps five of the seven prod roles (`data_entry_clerk`, `super_admin`, `government_official`, `supervisor`, `verification_assessor`) to `clerk`, and `submission-processing.service.ts:408` writes `enumerator_id` ONLY for the enumerator role. So a clerk submission reaches timing + speed, is ATTRIBUTED to the clerk (`fraud_detections.enumerator_id` holds their uuid, via the engine's `enumeratorId ?? submitterId` fallback), and can never reach `duplicate`, because the history query keys on the column their rows leave null. Now pinned by a test rather than discovered later by whoever wonders why a supervisor's uuid is sitting in an enumerator column. **Owed decision (product, not code):** whether a transcription clerk should be scored on `off_hours` at all — data entry legitimately happens in the evening, and that is the one detector that will fire for them.

### Out of scope — do NOT widen

- **Thresholds and calibration** → R-A8's 1,482 held rows. This story turns the detectors ON; R-A8 tunes what they fire at. Tuning a detector that never ran would be tuning against nothing.
- **Back-scoring** → R1 above. Out of scope to BUILD here — it is an operator run over live rows, not a code change. ⛔ But it is **not** optional and **not** deferrable past R-A8: it is R-A8's precondition. "Out of scope" here means "not this story's work", never "decide later whether it matters".
- **The public path's geopoint suppression** → settled by 13-34 AC1/AC2 and re-affirmed by AC9's prohibition.
- **The 13-2 R-A2 import registry, the composite rescale, and `PIPELINE_EXCLUDED_STATUSES`** → AC10.
- **Making the public channel's two dead detectors measurable** → R3.

### References

- [Source: _bmad-output/planning-artifacts/brief-2026-09-17-story-13-69-fraud-engine-is-dark.md] — scope, the 8,282/0/0/1/0/68 component census, the 3-carry-GPS/3-were-scored correspondence, the 41s-vs-246s `speed_score` that proves the disabled detectors work.
- [Source: apps/api/src/services/submission-processing.service.ts:1331-1344] — the gate. [:1284-1291] — the side-effect audit comment arguing for it.
- [Source: apps/api/src/queues/fraud-detection.queue.ts:14-19] — `FraudDetectionJobData`; coordinates already optional. [:57] — `jobId = fraud-<submissionId>`. [:24-25] — `removeOnComplete: 100`.
- [Source: apps/api/src/workers/fraud-detection.worker.ts:39,45,79,98-115] — the worker reads only `submissionId`/`respondentId`; the insert that persists `*_details`.
- [Source: apps/api/src/services/fraud-engine.service.ts:120-126] — component slots; [:218] nullable `enumeratorId`; [:273-282] the load-bearing uuid guard; [:290-308] the enumerator-scoped history query that returns `[]` when `enumeratorId` is null.
- [Source: apps/api/src/services/fraud-heuristics/gps-clustering.heuristic.ts:190-192] — `reason: 'no_gps_data'`, already shipped.
- [Source: apps/api/src/services/fraud-heuristics/speed-run.heuristic.ts:80-82,113-118] — `no_completion_time` / `invalid_reference_time`.
- [Source: apps/api/src/services/fraud-heuristics/straight-lining.heuristic.ts:146-153] — `no_batteries_found`; [:30-62] `identifyBatteries` needs ≥5 `select_one` in ONE section.
- [Source: apps/api/src/services/fraud-heuristics/duplicate-response.heuristic.ts:53-55] — `no_data_or_history`.
- [Source: apps/api/src/services/fraud-heuristics/off-hours.heuristic.ts:48] — needs only `submittedAt`.
- [Source: apps/api/src/controllers/registration.controller.ts:858-860] — wizard `completionTimeSeconds`; [:1088,1091] `submitterId: null`, `enumeratorId: null`; [:1130-1131] `gpsLatitude/Longitude: null`.
- [Source: apps/api/src/controllers/form.controller.ts:27-28,158-159] — the enumerator submit path takes coordinates as top-level body fields, not from the geopoint answer.
- [Source: apps/web/src/features/forms/hooks/useDraftPersistence.ts:186-195] — the `gps_location` question name is hardcoded in the client→column chain; [:197-199] `completionTimeSeconds`.
- [Source: apps/api/src/workers/webhook-ingestion.worker.ts:109-113,121-123] — `_gpsLatitude`/`_gpsLongitude`/`_completionTimeSeconds` → columns.
- [Source: apps/api/src/controllers/fraud-detections.controller.ts:352-354,433-435] — the clusters filter that keeps GPS-less rows out, and the guarded `clusterMembers` read.
- [Source: test-fixtures/oslsr_master_v3.xlsx — survey sheet, v2026072301: 1 geopoint row `gps_location`, `required` blank; `grp_identity` 5 `select_one`, `grp_labor` 6]
- [Source: test-fixtures/oslsr-public-core-v1.xlsx — pubcore-2: 0 geopoint rows; largest section 3 `select_one`]
- [Source: _bmad-output/implementation-artifacts/13-34-preblast-form-content-gps-removal-and-occupation-label.md — Task 1 "master: geopoint kept"; Task 3 "prod master now `019f8eff` `v2026072301` … GPS retained"; Dev Agent Record → the `suppressGeopoint` opt-in list]
- [Source: _bmad-output/implementation-artifacts/13-27-*.md — AC4, the 2026-07-12 product ruling this story supersedes; the side-effect audit table row 5]
- [Source: apps/api/src/services/__tests__/fraud-engine.imports.integration.test.ts:1-18 — why a real-DB test is required for this class of defect]
- [Source: apps/api/src/services/__tests__/submission-processing.service.test.ts:608,2062 — the two tests that currently pin the gate]

### How to run the things this story asks for

- **Unit/integration tests — from `apps/api`, never the repo root.** `cd apps/api && pnpm vitest run src/services/__tests__/<file>`. Running vitest from the repo root skips `mockReset` and produces results that do not reproduce [[pitfall-vitest-from-repo-root-skips-mockreset]].
- **The real-DB tests (Tasks 3 and 4) need the test database explicitly**: `NODE_ENV=test DATABASE_URL=<…app_test>` — the suite DB and the test DB are different, and a real-DB test pointed at the wrong one either fails confusingly or writes where it should not [[local-test-db-parity]]. Use `beforeAll`/`afterAll` with a run-unique tag; do NOT assert a global count or delta you do not own (the 13-34 shared-test-DB flake class).
- **Task 5's prod measurement is read-only and runs over Tailscale**, `psql` via `docker exec` on the VPS — see `docs/emergency-recovery-runbook.md` §0 and [[infra-vps-operational-state]]. ⚠️ If you write a helper script for it, note that `scripts/` is OUTSIDE `tsconfig` — such a script must be RUN, not type-checked, and `pnpm tsc --noEmit` will not cover it.
- **`pnpm`, never `npx`.** ESM throughout.
- **Do not pipe a suite through `tail`**, and do not quote a subset total as the suite total [[feedback-quote-the-suite-total-never-a-subset]].

### Project context

`_bmad-output/project-context.md` and `docs/team-context-brief.md` apply unchanged. Layer conventions: API `controllers/ services/ routes/`, tests via `vi.hoisted()` + `vi.mock()`, real-DB integration tests via `beforeAll`/`afterAll`.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context) — dev-story, 2026-09-17.

### Debug Log References

- **Mutation run (AC1 red-verify), 2026-09-17.** Gate restored programmatically, suite re-run, gate reverted from a backup copy. Observed: **3 failed | 102 passed (105)** across `fraud-engine.ungated-coverage.integration.test.ts` + `submission-processing.service.test.ts`. The three that red are exactly the three that depend on the gate:
  - `queues fraud detection even when GPS coordinates are missing (13-69 — the gate is gone)`
  - `queues fraud detection when GPS is absent — the public wizard is scored too (13-69)`
  - `a GPS-less side-effects run enqueues a job the worker can process`
  With the gate reverted: **105 passed**. The five engine-coverage tests stay green under mutation BY DESIGN — they invoke the worker processor directly and are not a claim about the gate; see the note below on why that gap needed its own test.
- **`chk_respondents_phone_number_e164`** (`^\+234\d{10}$`) rejected the first seeding attempt. Read the constraint off the database rather than guessing at the format.

### Completion Notes

**What was built (Tasks 1–4, 7, 8):**

- **The ungate (Task 2).** `if (args.gps)` is gone from `runPostSubmissionSideEffects`. The enqueue is unconditional; coordinates are spread in only when present, so a GPS-less job carries **absent keys, not nulls** — the shape the new unit test pins. The side-effect audit comment (item 5) no longer argues for the gate: it records the removal, the 8,282/0/0/1 census, and that 13-27 AC4 is superseded, with a ⛔ "do not re-add a coordinate gate here" directly above the call. `submission_processing.fraud_queued` now carries `hasGps`, because the only record of a skip was previously the ABSENCE of a log line and an absence looks identical to a quiet system.
- **Tests inverted, not deleted (Task 2.3 / AC6).** Both gate-pinning tests were rewritten in place with a header explaining what they used to assert and why that changed. A reader searching for the old behaviour lands on the new assertion.
- **⭐ The coverage test found a gap in its own design, and that is the most useful thing in this session.** The first version of `fraud-engine.ungated-coverage.integration.test.ts` drove the worker processor directly with a hand-made job. Every assertion passed — and **it would have passed with the gate fully restored**, because it never exercised the producer. A test that cannot fail when the defect returns is the thing this story exists to stop ([[pattern-test-that-passes-over-a-hole]]), so one more test was added that drives the REAL `runPostSubmissionSideEffects` with `gps: null`, captures the job it actually enqueued, and feeds THAT into the real worker. It is the test that reds under mutation.
- **The schemas are the real forms.** Both seeded `questionnaire_forms` rows are built by running the shipped `test-fixtures/*.xlsx` through the real parser and the real converter. Two heuristics read the FORM rather than the answers (`straight_lining` needs a ≥5-`select_one` battery in one section; `speed_run`'s bootstrap reference is computed from the question mix), so a hand-written schema would have proven the heuristics work on a form that does not exist. It also means the file reds if either form's shape changes.
- **Every assertion is on the stored row and on a REASON, not a score.** `speed_details.tier` present + `reason` absent, `straightline_details.analyzedBatteries >= 1` + `reason` absent, and so on. Asserting `score === 0` or even `score > 0` would conflate "the detector ran" with "the detector fired" — and the second is R-A8's calibration question, which this story explicitly does not answer.
- **AC3 is a recorded limitation with a tripwire.** The public-channel test asserts the two detectors that reach computation AND the two `reason` markers that say why the others cannot. Confirmed live against the real Public Core schema: `no_batteries_found` and `no_data_or_history`.
- **AC7 (Task 7.1).** The supersession is written into 13-27 in two places — inline under its AC4 and as a Change Log row — and into the service comment. 13-27 stays `done`: a ruling overturned on evidence that did not exist when it was made is a supersession, not a defect [[feedback-settled-ruling-is-not-a-defect]].
- **Task 6.2's wiring check was done even though Task 6 is blocked**, because it is the thing that decides whether AC9 would be worth doing at all. The chain holds end to end and is hardcoded on the question NAME: `GeopointInput` writes `{latitude, longitude}` under the question name → `useDraftPersistence.ts:186-195` reads `formData.gps_location` → `enrichedPayload.gpsLatitude` → `form.controller.ts:158-159` `rawData._gpsLatitude` → `webhook-ingestion.worker.ts:109-110` → the `submissions` columns. ⚠️ If anyone ever renames that question, the value is dropped silently.
- **⚠️ THE UNGATE INTRODUCED A NEW FAILURE MODE, FOUND BY REVIEWING MY OWN DIFF, AND IT IS FIXED IN THE SAME PASS.** Both `queueFraudDetection` and `queueMarketplaceExtraction` are AWAITED enqueues that throw when Redis is unavailable, and the first to throw pre-empts everything after it — the hazard 13-65 review B4 documents at the foot of this method. **While fraud was GPS-gated it could not pre-empt anything on the public path, because the gate skipped it.** Making it unconditional put a newly-fallible operation in front of marketplace extraction, i.e. a fresh way for the public channel to lose a profile — the exact 13-27 bypass class, re-introduced by the fix for a different one. **Marketplace now runs first**, keeping the position it effectively held, with the reasoning in the code. This is a behaviour change beyond the literal ungate and is called out here so the review can reject it if it disagrees.
  > ⛔ **THE REVIEW DID REJECT IT, AND THE DIAGNOSIS WAS RIGHT WHILE THE REMEDY WAS NOT (finding M1, 2026-09-18).** Two things were wrong with re-ordering. It was **unpinned** — moving fraud back in front of marketplace left all 105 tests green — and it only **chose a victim**: with marketplace first, a marketplace enqueue failure permanently costs the submission its fraud score, which is this story's own deliverable, on a path where `processed = true` is already committed. Ordering can never fix this, because something has to be last. Each effect now runs in its own `try`/`catch`, all three are attempted, and the first error is re-thrown unwrapped so every existing contract holds. Order survives as a log-order tiebreak and is now pinned by a test.
- **Checked and clear, so the code review does not have to re-derive it:** ungating cannot make `GET /fraud-detections/clusters` noisy or crash. Every GPS-less detection now has a non-null `gps_details` and so passes that endpoint's `isNotNull` condition — but it also scores `gps = 0` and is excluded by the sibling `gt(gpsScore, '0')`, and `gps?.clusterMembers ?? []` is guarded regardless.

**⛔ What is NOT done, and why the story is handed over at `review` rather than `done`:**

- **Tasks 5 and 6 (AC8, AC9) are BLOCKED on prod read access** and were not attempted. AC8 is a measurement whose entire purpose is to settle a three-way contradiction, and the story forbids touching a form until it returns — so a guess here would be precisely the failure the AC exists to prevent [[feedback_halt_on_ac_vs_reality_conflict]]. The tree's evidence points at the brief being wrong (the canonical file carries `gps_location`; 13-34 records it live on prod as `019f8eff`), which would make Task 6 a no-op and move the finding to a field-practice residual — but that is a prediction, not a measurement, and it is recorded as one.
- **The ungate does not depend on either.** Tasks 1–4, 7 and 8 stand alone and deliver the whole of FR1/FR2 and the honest half of the brief's FR4.

**Residuals (Task 7.2–7.4) — recorded, not built:**

- **R1 — back-scoring. ⛔ R-A8's PRECONDITION, not a nicety — it BLOCKS R-A8.** The sequence is `13-69 → back-score → R-A8`. R-A8 calibrates thresholds against detection data; the 2026-09-05→deploy window is the trial enumerator cohort's own traffic and the only field evidence the project has, and it stays unscored until someone runs it. Calibrating before that means tuning against 1,482 held import rows plus a hole exactly where the field behaviour lives. ⚠️ NOT re-measured here — that needs the same prod access Task 5 is blocked on. The brief's **~50** is a floor measured 2026-09-17 and the gap **grows every day this sits**, which is what makes it perishable in the way that counts: the evidence R-A8 needs keeps accumulating unscored. Re-measure and record with a date; never quote `~50` as current [[pattern-falsifiable-number-is-a-live-artefact]]. **R2 is on its critical path.**
- **R2 — `fraud_detections.submission_id` is a plain index, not unique** (`db/schema/fraud-detections.ts`). The queue's `jobId = fraud-<submissionId>` is the only dedup and `removeOnComplete: 100` frees that id after 100 completions, so re-enqueuing an old submission CAN write a second detection row. Irrelevant in steady state; **on R1's critical path now that R1 is mandatory** — a back-scoring run re-enqueues old submissions by definition, and a double-counted population is a worse input to R-A8 than an unscored one because it looks like data. The dedup must be decided before the run, not discovered in its results.
- **R3 — the public channel is structurally blind on straight-lining and duplicate.** Now pinned by a test rather than left to be rediscovered. Fixing it means either restructuring the Public Core form (a conversion-tax decision, 13-34's territory) or giving the duplicate heuristic a non-enumerator comparison basis (a design question). Neither belongs here.
- **R4 (emergent, Task 7.4) — `epics.md`'s emergent index had lapsed by FOUR stories**, not one: 13-66, 13-67 and 13-68 were all on `sprint-status.yaml` and absent from it. 13-69 was added and the other three are NAMED WITH THEIR STATUS rather than silently back-filled — a piecemeal patch by whoever happens to notice is what produced the two previous lapses the file already records. A real sweep is owed [[feedback_planning_artifact_parity_sweep]].

### File List

**Created:**
- `apps/api/src/services/fraud-heuristics/__tests__/heuristic-self-description.contract.test.ts` — **6 tests, the A14 contract** (a detector must say which kind of zero it is), plus the registry guard and the R5/R8 violation pins. TEST-ONLY: no heuristic is modified, so AC10 holds. Mutation-verified.
- `apps/api/src/services/__tests__/fraud-engine.ungated-coverage.integration.test.ts` — **10 tests** (AC1–AC5, AC3, + review H1's straight-lining tripwire and M2's clerk-channel pin; answers rebuilt from the schema per H2, with a vocabulary guard).
- `_bmad-output/implementation-artifacts/13-69-fraud-engine-is-dark.md` — this story.

**Modified:**
- `apps/api/src/services/submission-processing.service.ts` — the ungate + the rewritten side-effect audit note + `hasGps` on the log line. **+ review M1** (per-effect `try`/`catch`, deferred first-error re-throw, `*_queue_failed` events), **M2** (the per-channel note at the enqueue), **M3** (the stale "GPS-gated" comment at `:429`), **L3** (the orphaned fragment).
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` — the two gate-pinning tests inverted + the describe-block header corrected. **+ review M1** (three isolation/order tests) and **L1** (two `hasGps` tests).
- `docs/runbooks/enumerator-field-briefing.md` — **new §3 "Location — press Capture location at every interview"**, a checklist line, a supervisor watch-item, sections 3–7 renumbered to 4–8, version → 2026-09-18. ⚠️ **This is the live source of the PDF enumerators download** (`field-briefing.service.ts` renders it per request), so this edit reaches the field as soon as it deploys — which is the point: Awwal ruled they are briefed BEFORE the requirement lands (13-71). Its "Coming soon" note becomes present tense when 13-71 ships. Briefing tests re-run: **18 passed**.
- `_bmad-output/planning-artifacts/brief-2026-09-18-story-13-71-enumerator-gps-is-optional-in-practice.md` — **NEW.** The scope for auto-capture + code-enforced requirement + the base-mapping monitoring, with both of Awwal's rulings recorded in it.
- `_bmad-output/project-context.md` — **Team Agreements A12-A14** (a live number carries its date + query; "blocked on a measurement" needs a recorded attempt; a detector must say which kind of zero it is), version → 2.1.0. These are the three durable lessons of this review, written where every agent reads them rather than only in this story.
- `_bmad-output/implementation-artifacts/13-34-preblast-form-content-gps-removal-and-occupation-label.md` — **record correction only** (Change Log row): both form ids it recorded as prod are dead, and deleting one of them orphaned 204 submissions' schemas. Status unchanged: still `done`.
- ~~`apps/api/src/services/__tests__/audit.service.test.ts`~~ — ⛔ **NO LONGER THIS STORY'S FILE. REMOVED FROM THIS CHANGESET AT ADJUDICATION, 2026-09-19.** The 66 → 67 `AUDIT_ACTIONS` bump for `STAFF_DETAIL_VIEWED` was **folded back into the staff-detail-view commit itself** (`b6a1d28`, formerly `9124abc`) with `git commit --fixup` + `rebase --autosquash`, which was still free because that commit had never been pushed. `main` is therefore green **at every commit** rather than red at one and repaired at the next — Awwal's ruling, 2026-09-19, to keep commits atomic. Verified at the rewritten commit: assertion `67` vs `67` actual keys, and the file passes **39/39**.
- `apps/api/src/controllers/registration.controller.ts` — **review M3, comment only.** The wizard's side-effects call still said "the shared fraud gate is a no-op (AC4)"; it now records that every wizard submission is scored and what that channel reaches. No behaviour change; `git diff` is one comment block.
- `_bmad-output/implementation-artifacts/13-27-public-wizard-marketplace-extraction-bypass.md` — AC4 supersession note + Change Log row. (Status unchanged: still `done`.)
- `_bmad-output/planning-artifacts/epics.md` — 13-69 added to the emergent index + the four-story lapse recorded.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 13-69 entry.

**Downstream planning artefacts — produced by THIS story's review, committed SEPARATELY (adjudication 2026-09-19):**

- `_bmad-output/implementation-artifacts/13-71-enumerator-gps-auto-capture-and-required.md` — **NEW.** Story A of the field plan.
- `_bmad-output/implementation-artifacts/13-72-back-score-the-dark-window.md` — **NEW.** Handover §C Story A.
- `_bmad-output/implementation-artifacts/13-73-a-zero-must-say-why.md` — **NEW.** Handover §C Story B.
- `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` — the **F1–F4 field-proper gate** (+113 lines) + exemption register E1.

⛔ **ALL FOUR WERE MISSING FROM THIS FILE LIST UNTIL ADJUDICATION FOUND THEM (2026-09-19), AND THE OMISSION WAS NOT COSMETIC.** `sprint-status.yaml` — which *was* declared — adds board entries for 13-71, 13-72 and 13-73. Committing the declared list alone would have published a board pointing at three story files that do not exist in the repo. ⭐ **The check that caught it is one line and belongs in every adjudication: `git status --short` must reconcile against the File List, name for name.** A File List is a claim about the tree like any other [[pattern-a-record-about-the-work-is-not-the-work]].

⚖️ **They are committed separately, not folded in** (Awwal's ruling, 2026-09-19: atomic commits). These four are products of the review, not of the ungate — the ungate commit builds and passes without them, and each commit's record is true as it stands [[2ai]].

## Residuals (ledger)

⭐ **THIS TABLE IS NEW AT ADJUDICATION (2026-09-19), AND ITS ABSENCE WAS ITSELF A FINDING.** 13-69's residuals lived entirely in prose, and `lint-story-residuals` **reads table rows only** — so this story was invisible to the guard that exists to police exactly it (§2ab hole 2: *a format-based check polices only the people who adopted the format*). The guard reported *"327 stories scanned, no done-with-open-residuals"* while this story carried eight prose residuals and a stale checkbox. It was not lying; it could not see them.

| ID | Item | State | Re-runnable evidence / owner + trigger | Home |
|---|---|---|---|---|
| **D1** | `submission_processing.fraud_queued` appears once per new submission, carrying `hasGps` | **DISCHARGE-ON-DEPLOY** | `pm2 logs` grep after deploy. Absent ⇒ the ungate did not reach prod. The cheapest check available, and it exists because this defect hid for twelve days behind an ABSENT log line | this story |
| **D2** | `fraud_detections` rows actually written after deploy | **DISCHARGE-ON-DEPLOY** | `SELECT count(*) FROM fraud_detections WHERE created_at > '<deploy ts>'` ~1h after. Zero while D1 is green ⇒ the worker is failing after the enqueue; check the dead-letter set | this story |
| **R1** | Back-scoring the unscored window — R-A8's PRECONDITION | **SCOPED** | Story **13-72** (`ready-for-dev`). Re-measure on the run day: 58 (09-18) → **65** (09-19), ~+7/day | 13-72 |
| **R2** | `fraud_detections.submission_id` is a plain index, not unique | **SCOPED** | Story **13-72**, on R1's critical path — a back-score re-enqueues old submissions by definition | 13-72 |
| **R3** | Public channel structurally blind on `straightline` + `duplicate` | **ACCEPTED** | Measured; permanent given the form's structure. Owner: Awwal / R-A8. Reopen trigger: Public Core gains a section with ≥5 `select_one` | AC3 test |
| **R5** | `straight_lining` cannot score on the master form, and its zero is silent | **SCOPED** | Story **13-73**. Pinned by the A14 contract test as a countable violation that REDS when fixed | 13-73 |
| **R6** | Should clerk/webapp submissions be scored on `off_hours` at all? | **ACCEPTED** | **Measurement:** 5 of 7 prod roles map to `clerk`, and transcription legitimately happens in the evening. **Owner:** Awwal (PM). **Reopen trigger:** after one week of live data, if the clerk flag rate is non-trivial. Costs nothing meanwhile — a `low` severity gates nothing | Handover §D2 |
| **R7** | 45% of public rows carry no completion time | **CLOSED** | Measured: 158 draft-adoption + 8 self-edit = 166; the wizard path is 205/205. Not a defect | Handover §D3 |
| **R8** | 283 submissions reference 5 DELETED form rows | **SCOPED** | Story **13-73** — the `deleteForm` guard + form-identity snapshot; 205 of 283 restorable, 78 gone. ⛔ Must land BEFORE 13-72 pass 2 | 13-73 |
| **R9** | `duplicate_response` flattens geopoints through `String()`, so two DIFFERENT locations compare equal | **SCOPED** | Story **13-73**. ⚠️ 13-71 is about to make this universal | 13-73 |

⛔ **Do not flip `Status:` to `done` until D1 and D2 are discharged against prod and the deploy SHA is recorded in the Closing verdict below.**

**Out of scope (verified untouched — `git diff` empty):**
- `apps/api/src/services/fraud-engine.service.ts`, all of `apps/api/src/services/fraud-heuristics/`, `apps/api/src/db/seeds/fraud-thresholds.seed.ts`, `apps/api/src/db/schema/respondents.ts` (`PIPELINE_EXCLUDED_STATUSES`), `apps/api/src/queues/fraud-detection.queue.ts`.
- Both XLSForms (`test-fixtures/`, `docs/launch-campaign/`) — Task 6 is blocked.
- Everything under `staff*` — held by another agent in the shared working tree.

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-09-18 | **THE STRUCTURAL FIX, BUILT INSTEAD OF RECOMMENDED (Awwal: "don't write four patches, write a contract").** ✅ **A14 — `heuristic-self-description.contract.test.ts`, 6 tests, TEST-ONLY so AC10 holds:** every heuristic's `details` must carry a `reason` or its computed evidence, never neither; swept across both registries and three contexts; a heuristic registered without declaring its evidence fails the registry guard; R5 and R8 are pinned as countable violations that RED when fixed. Mutation-verified (removing one `reason` reds 2 of 6, naming the heuristic). ✅ **A12/A13 written into `project-context.md` (v2.1.0)** so they bind every agent, not just this story: a live number carries its date and query (`~50` vs the measured 58), and "blocked on a measurement" requires a recorded attempt (read-only prod is open to dev/review). ➕ **Scoped, not built — snapshot `form_id` + `version` onto `submissions`:** R8's real defect is that the form row is the only copy of the schema its submissions were answered against; the `deleteForm` guard stops the bleeding, the snapshot ends the class. | Review (Opus 5) |
| 2026-09-18 | **BACKUPS CHECKED FOR THE ORPHANED FORM SCHEMAS (read-only, nothing restored) — 205 of 283 ARE RECOVERABLE.** `019f8ed3` (204 rows) is intact in `monthly/2026-08` and `019d7d40` (1 row) in `monthly/2026-05`; both schemas decrypt, gunzip and parse. The other three ids (78 rows) are absent from every surviving monthly. ⭐ Recommend restoring the two as `archived` before R1 pass 2 and marking the 78 `no_form_schema`; ⛔ never approximate a schema. ⚠️ **Incidental findings:** by 2026-07-01 a form with 73 live submissions had already been deleted **while submissions were still arriving against it** — deletion-while-referenced is the pattern, not an accident. And the missing `monthly/2026-06`, **checked on request and CLOSED: Story 9-35 fixed its cause on 2026-06-23 (`a139253`) and recorded the gap as permanent; prod shows clean promotions at 01:00 on 07-01, 08-01, 09-01 and 7 dailies through 09-18.** ⛔ This review's first reading of that gap ("a silent hole nobody noticed") was WRONG and is corrected in R8 — it was found in three weeks, fixed, and written down. What it does cost is specific: `monthly/2026-06` is why **76 of the 78** unrecoverable rows cannot be recovered. ⚠️ Also corrected here: the orphan count is **283** (282 public + 1 enumerator), not the 293 first written. | Review (Opus 5) |
| 2026-09-18 | **THE FOUR EMERGENT ITEMS, RESOLVED — three by measurement, one by ruling.** **(1) R7 CLOSED, not a defect:** the 166 public rows missing a completion time are **158 draft-adoption rows + 8 self-edits**, and the wizard path is **205/205**; `no_completion_time` is the honest output and only the channel-table wording needed fixing. **(2) R8 UPGRADED and now blocks R1 pass 2:** not one row but **283**, across **5 deleted form ids** (204 of them on `019f8ed3` — the row 13-34 recorded as prod). ⭐ Decisive: **58 of 58** rows in R-A8's window reference a LIVE form, so pass 1 is unblocked while pass 2 is not; `deleteForm` must stop permitting the deletion of a form a submission references. **(3) The stale-id finding written into 13-34's own Change Log** with the standing lesson — pin to `form_id` + `version`, never a row id. **(4) GPS capture RULED by Awwal: code-enforced requirement (no XLSForm edit, no new form row), and brief the enumerators FIRST** — `docs/runbooks/enumerator-field-briefing.md` gained §3 (the PDF renders from that Markdown at request time), scope in `brief-2026-09-18-story-13-71-…`. | Review (Opus 5) |
| 2026-09-18 | **PROD MEASURED, AC8 + AC9 + H3 CLOSED, STATUS → `done`.** Two read-only queries over Tailscale settled everything the story was blocked on. **AC8 = 1** (`oslsr_master_v3` v2026072301 serves `gps_location`, optional; 35 of 37 enumerator submissions) — the brief's "0" was wrong and both repo records were right, so **AC9 never fires and no form was touched**. **R1's number: 403 unscored all-time, 58 since 2026-09-05** (5 of them that same day). The queries also produced four things nobody had asked for: 45% of public submissions carry no completion time (**R7**), a live submission points at a deleted form row which collapses `speed`'s reference to 60s (**R8**), 13-34's recorded form id is stale because the master was re-uploaded again on 2026-08-24, and only **5 of 37** enumerator submissions actually carry GPS — Risk R-d, with a number. Added a **Handover** section for adjudication + the PM: falsifiable verification predictions, deploy stop conditions, two ready-to-author story scopes, four PM decisions. Also fixed `audit.service.test.ts`'s AUDIT_ACTIONS count (66 → 67) at Awwal's instruction — **another agent's file**, red on `main` since `b6a1d28`. | Review (Opus 5) |
| 2026-09-18 | **Adversarial code review (Claude Opus 5, 1M) — 3 High, 3 Medium, 3 Low. Seven fixed in the tree, H3 re-opened as a task, and Task 7.2 un-ticked.** The two that change what this story CLAIMS: **H1** — `straight_lining` reaches its computation and cannot score on the master form (disjoint choice lists cap PIR at 0.2; skip logic caps the other battery below `minBatterySize`, and it is skipped with no `reason`), so the honest count is three detectors plus one that cannot fire → residual R5; **M2** — the clerk/webapp channel was ungated and unnamed, with `duplicate` structurally dead there and detections filed under the clerk's uuid → residual R6. **M1** replaced the enqueue RE-ORDER with per-effect isolation: reverting the order left all 105 tests green, and ordering only chose which effect a Redis blip would permanently destroy. **H2** rebuilt the integration test's submission from the parsed schema after seven of eleven seeded answers turned out to be impossible; the new vocabulary guard caught an invented value on its first run. Verified by re-running the gate mutation (now **7 red**, up from 3) and an order mutation (1 red, previously 0). Suite quoted below. | Review (Opus 5) |
| 2026-09-17 | **R1 (back-scoring) re-classified from a recorded residual to R-A8's BLOCKING PRECONDITION** (Awwal, during dev). Sequencing is now `13-69 → back-score → R-A8`, propagated to Dependencies, Residuals, Out-of-scope, `sprint-status.yaml` and `epics.md`. R2 moves with it onto R1's critical path. Rationale: R-A8 calibrates against detection DATA, and the unscored 2026-09-05→deploy window is the trial enumerator cohort's own traffic — the only field evidence the project has. Filing it as "record the number so it is not forgotten" would have let R-A8 calibrate against imports plus a hole exactly where field behaviour lives. | Amelia (Dev) |
| 2026-09-17 | **dev-story: Tasks 1–4, 7, 8 COMPLETE. Tasks 5–6 (AC8/AC9) BLOCKED on prod read access and explicitly NOT attempted.** The gate is removed, the four non-GPS detectors are proven to REACH their computation on a stored row, the public channel's two structural blind spots are pinned with their `reason` markers, and 13-27 AC4 is superseded in three places. Status → `review`, UNCOMMITTED. | Amelia (Dev) |
| 2026-09-17 | The first coverage test would have passed with the gate restored — it drove the worker directly and never exercised the producer. Added an end-to-end test that drives the real `runPostSubmissionSideEffects` and feeds its captured job to the real worker; mutation then reds 3 of 105. | Amelia (Dev) |
| 2026-09-17 | Story authored via canonical `*create-story` from the 2026-09-17 adjudication brief. | The brief was addressed to SM for story authorship; no story file or `sprint-status.yaml` entry existed, so dev-story had nothing to execute against. |
| 2026-09-17 | Four of the brief's instructions corrected against the tree before authoring; three changed an AC (FR1's worker warning has no matching code path, FR2 is already built, FR3's premise is contradicted by the tracked form AND 13-34's close-out, and the "four detectors on both channels" claim is false for the public channel). | A story that transcribes an unverified premise sends the dev agent to edit a form on a number nobody measured, and lets "the detectors now run" be signed off on a claim that is only true for half the traffic. |

### Review Follow-ups (AI)

**Adversarial code review — 2026-09-18, Claude Opus 5 (1M context), UNCOMMITTED tree, run against the review instruction "attack the claim, not the diff".** 3 High, 3 Medium, 3 Low. **All nine are FIXED IN THE TREE except the two that cannot be fixed without prod access (H3, and the AC8/AC9 half of the story it rides with), which are re-opened as tasks.** Every claim below was RUN, not read: the tests were executed against `app_test`, the gate mutation was re-performed, and the form claims were measured against the parsed fixtures.

What the review confirmed, so it is not re-derived next time: a GPS-less submission DOES produce a `fraud_detections` row (driven through the real producer into the real worker); the worker does NOT throw on null coordinates anywhere on the path; `gps_details` DOES distinguish "could not score" from "scored zero"; both XLSForms and `wizard.public_form_id` are untouched; `tsc` and `eslint` are clean; and the AC10 files are byte-identical to HEAD.

- [x] **[AI-Review][High] H1 — `straight_lining` reaches its computation and cannot score on `oslsr_master_v3`.** AC2's `analyzedBatteries >= 1` passes on a detector that is structurally incapable of a non-zero result: the only analysable battery has five disjoint choice lists (PIR ≤ 0.2 vs a 0.8 threshold; entropy ≥ 2.32 vs 0.5), and the labour battery is silently skipped because skip logic caps a real respondent at 4 answered of 6 against `minBatterySize = 5`. **FIXED as far as scope allows:** the per-channel table and the story's headline claim corrected from four detectors to three-plus-one-that-cannot-fire; a dedicated tripwire test added (`fraud-engine.ungated-coverage.integration.test.ts` → "REVIEW H1") that pins `analyzedBatteries === 1`, `flaggedBatteries === 0`, `score === 0` and the PIR/entropy ceilings; residual **R5** records the two owed decisions. The heuristic itself is NOT touched — AC10 forbids it and the fix is a threshold/design question [[feedback-halt-on-ac-vs-reality-conflict]]. [`fraud-heuristics/straight-lining.heuristic.ts:146-153`]
- [x] **[AI-Review][High] H2 — the integration test's submission was invented, not sampled from the schema (§2ak).** Seven of eleven seeded answers could not occur in a real submission: 3 question names absent from the form (`employment_sector`, `work_type`, `income_band`), 4 values outside their choice list (`education_level: 'secondary'`, `disability_status: 'none'`, `lga_id: 'ibadan-north'`, `employment_status: 'self_employed'`), 1 scalar written to a `select_multiple`. The seeded "enumerator" also took whatever `FROM roles r LIMIT 1` returned (on this DB, `PERF_USER`), and the prior submission was seeded IDENTICAL to the one under test, so every duplicate comparison was a trivial 1.0 exact match. **FIXED:** all answers rebuilt from the parsed fixture and following a real skip path; the prior submission differs so `maxMatchRatio` is a real ratio; the user is selected `WHERE r.name = 'enumerator'`; and a new `assertAnswersAreRealFor` guard checks every name and value against the schema in `beforeAll`, so the file now reds if the form's vocabulary moves. ⭐ The guard earned its place immediately — it caught an invented `years_experience: '3_5'` in the replacement answers (the real list is `less_1 / 1_3 / 4_6 / 7_10 / over_10`). [[pattern-request-test-from-the-schema-not-the-caller]]
- [x] **[AI-Review][High] H3 — Task 7.2 was ticked without its deliverable.** The task says "re-measure the count rather than quoting the brief's `~50`"; no count was measured, and `~50` (a floor dated 2026-09-17) is still what R1 carries. **RE-OPENED, not fixed here:** it needs the same prod read Task 5 is blocked on, and R1 is R-A8's precondition, so the number is load-bearing rather than decorative [[pattern-falsifiable-number-is-a-live-artefact]]. Ships with Task 5. ✅ **CLOSED AT ADJUDICATION 2026-09-19.** It shipped with Task 5 as predicted (403 all-time / 58 in window, 2026-09-18) and the box simply outlived its finding — ledger row 3 already read FIXED. Re-measured at adjudication, read-only over Tailscale: **410 all-time · 65 in R-A8's window · 33 enumerator**. The +7 in a single day is the perishability R1 names, measured rather than asserted.
- [x] **[AI-Review][Medium] M1 — the enqueue order was load-bearing, unpinned, and only moved the loss.** Reverting the story's marketplace-before-fraud swap left all 105 tests green (verified by mutation). Worse, the swap only chose a victim: a marketplace enqueue failure would then permanently cost the submission its fraud score, because `processed = true` is already committed and the BullMQ retry hits the already-processed early return — the 13-27 bypass class, pointed at this story's own deliverable. **FIXED:** each side-effect now runs in its own `try`/`catch` with its own `*_queue_failed` log event, all three are attempted, and the FIRST error is re-thrown unwrapped so every existing contract holds (the queue path still surfaces it, the wizard `.catch()` still pages Telegram, message-matching tests still match). Three new unit tests pin the property; re-running the order mutation now reds. [`submission-processing.service.ts:1338-1470`]
- [x] **[AI-Review][Medium] M2 — the clerk/webapp channel was ungated and never named.** Five of seven prod roles map to `clerk`, their submissions carry a submitter but no `enumerator_id`, and the duplicate heuristic's history query keys on exactly that column — so duplicate is structurally dead there too, while the detection row is filed under the clerk's uuid in `fraud_detections.enumerator_id`. **FIXED:** third column added to the per-channel table, the behaviour explained at the enqueue, a seeded clerk submission + test pins it, and residual **R6** carries the one product question it raises (should a transcription clerk be scored on `off_hours` at all?).
- [x] **[AI-Review][Medium] M3 — AC7's supersession was incomplete; two comments still asserted the gate.** `registration.controller.ts:1291` ("GPS is null for the public wizard, so the shared fraud gate is a no-op (AC4)") and `submission-processing.service.ts:429` ("GPS-gated fraud detection"). AC7 exists precisely so the repo does not hold two places asserting opposite things. **FIXED:** both rewritten, the wizard one now stating what the public channel actually reaches.
- [x] **[AI-Review][Low] L1 — nothing asserted `hasGps`,** which was Task 2.4's entire deliverable and the thing that makes "how many jobs ran GPS-less" answerable from prod logs. **FIXED:** two tests, both branches.
- [x] **[AI-Review][Low] L2 — the one mutation-proof test proved a row existed, not what was in it.** The end-to-end test (the only one that reds when the gate returns) asserted `gps_details` alone; the four detector assertions all ran against a directly-driven worker that stays green with the gate restored. **FIXED:** the four `*_details` assertions now also run on the row produced by the real producer, so "a real producer ran AND the detectors reached their computation" is one claim.
- [x] **[AI-Review][Low] L3 — an orphaned comment fragment** ("// 3. Registration auto-emails — an ENQUEUE (13-65), awaited like the other two queue ops so an") sat at the head of `runPostSubmissionSideEffects`, cut off mid-sentence. Pre-existing, but adjacent to this story's rewrite. **FIXED:** replaced by the M1 note that now explains the method's failure contract.

**Noted, NOT a finding, for R-A8 rather than for this story:** `speed_run`'s fallback reference for the master form is **246s**, computed by `calculateTheoreticalMinimum` over every question in the schema — including the 7-question guardian section that only applies to minors and every question hidden behind skip logic. Until an enumerator accumulates `speed_bootstrap_n = 30` same-form submissions in the lookback window, every speed score is measured against that inflated floor. That is a calibration input, and calibration is R-A8's.

---

## Handover — for the Adjudication agent and the BMAD PM

**Written 2026-09-18 by the adversarial code-review session.** Everything below is either a number measured against prod that day, or a recommendation clearly labelled as one. ⚠️ **Nothing here is a ruling.** The review does not commit, does not push, does not touch the live server and does not update `docs/adjudication-agent-handoff.md` — those belong to adjudication [[feedback-review-vs-adjudication-roles]].

### A. State of the tree at handover

`Status: done`, **UNCOMMITTED** — *as it stood at handover; adjudication moved it to `review` on 2026-09-19 because two DISCHARGE-ON-DEPLOY rows are open, see the Closing verdict.* All 10 ACs are satisfied (AC9 by its condition not firing), all nine review findings are closed except where a residual is explicitly recorded instead, and every task is ticked with its evidence.

| Gate | Result |
|---|---|
| `pnpm tsc --noEmit` (api) | **exit 0** |
| `pnpm lint` (api — eslint + all three drift guards) | **exit 0** |
| Full API suite, serialised, `app_test` — **FINAL, after the contract test** | ✅ **GREEN: 328 files (326 passed, 2 skipped) · 4,603 tests — 4,595 passed, 8 skipped, 0 FAILED** (545.59s). Exit code captured to a file and read back: **0**. ⚠️ The background notification also said 0 — that agreement is a coincidence worth noting rather than a reason to trust it; the earlier run in this same session had a notification that said 0 while the captured code was 1 [[feedback-never-pipe-a-push-to-tail]]. Delta from the previous green run: **+1 file / +6 tests**, exactly the A14 contract test; nothing else moved. |
| The failure that was there an hour earlier | `audit.service.test.ts` AUDIT_ACTIONS count (66 vs 67) — **belonged to `b6a1d28`, NOT this story. FIXED HERE at Awwal's instruction.** The +1 passed test between the two runs is exactly that assertion coming back green. |
| Gate mutation (restore `if (args.gps)`) | **7 red** (was 3 before the review's fixes) |
| Order mutation (fraud before marketplace) | **1 red** (was 0 — the order was unpinned) |

✅ **RESOLVED AT ADJUDICATION, 2026-09-19 — the File List no longer carries another agent's file.** `audit.service.test.ts` was lifted out of this changeset and fixed up into `b6a1d28` (formerly `9124abc`), the commit that introduced the un-asserted constant. The original guidance below — *drop it if its owner has fixed it* — was written for a world where that commit was already pushed; it was not, so the better option was available: repair it at source. ⭐ **The general rule this earns: when the commit that caused a red is still UNPUSHED, fix it there, not downstream.** A downstream repair makes every intermediate commit fail for a reason that is not its own.

### B. Verify this session's claims — with predictions, so they can be falsified

Adjudication is the third independent layer; these are written to be checked, not trusted. Each row states what the number should be and what it means if it is not.

| # | Command | Prediction | If it differs |
|---|---|---|---|
| 1 | `cd apps/api && NODE_ENV=test DATABASE_URL=…app_test pnpm vitest run src/services/__tests__/fraud-engine.ungated-coverage.integration.test.ts src/services/__tests__/submission-processing.service.test.ts` | **112 passed** | STOP. The file seeds from the shipped XLSForms; a red here means a form's vocabulary moved, which is the guard doing its job. |
| 2 | Restore `if (args.gps)` around the fraud enqueue, re-run #1, revert | **7 failed** | Fewer = a test that should pin the gate does not. STOP and say which. |
| 3 | Move the fraud block back above marketplace, re-run, revert | **1 failed** (the M1 order test) | 0 = the order pin was lost in the merge. |
| 4 | `ssh root@100.93.100.28` → read-only psql: enumerator submissions per form + geopoint count | `oslsr_master_v3` **v2026072301**, **1** geopoint | **0 would mean the form changed since 2026-09-18** — re-open AC9 and HALT before any re-upload. |
| 5 | Same session: unscored count since 2026-09-05 | **≥ 58, and RISING** until the ungate deploys | Falling = someone has started back-scoring; find out who before R1 is planned. |
| 6 | After deploy: `pm2 logs` / journal grep for `submission_processing.fraud_queued` | Every new submission logs one, with `hasGps` true or false | No line = the ungate did not reach prod. This is the single cheapest post-deploy check, and it exists because the defect hid for twelve days behind an ABSENT log line. |
| 7 | After deploy, ~1h: `SELECT count(*) FROM fraud_detections WHERE created_at > '<deploy ts>'` | Roughly one per submission taken since deploy | Zero with #6 green = the worker is failing after the enqueue; check the dead-letter set. |

**Deploy-day stop conditions.** Roll back if: the fraud queue depth grows without detections being written (worker throwing — the R-A2 class returning); OR `runPostSubmissionSideEffects` starts throwing at a rate it did not before (the new per-effect isolation re-throws the FIRST error, so behaviour should be unchanged, but it is new code on a path every submission crosses); OR public registrations start failing during a jingle window. ⚠️ **The volume change is real but small:** the enqueue goes from ~3 jobs ever to ~1 per submission, which at the measured rate (5–19/day) is nothing. It becomes a different question the moment R1's back-score runs 403 jobs through a 4-concurrency worker on a 2 GB box where all ten workers share the API process.

### C. Two owed stories — ✅ BOTH AUTHORED 2026-09-18 as `13-72-back-score-the-dark-window` and `13-73-a-zero-must-say-why` (both `ready-for-dev`, both on `sprint-status.yaml`). Scope below is what they were authored FROM; the story files supersede it.

Both are recorded as residuals in this story and neither belongs in it. Scopes are written so the PM can rule on sequencing without re-deriving the evidence.

#### Story A → ✅ AUTHORED 2026-09-18 as **`13-72-back-score-the-dark-window`** (`ready-for-dev`). "Back-score the dark window" (R1 + R2). ⛔ BLOCKS R-A8.

- **Why now:** R-A8 calibrates thresholds against detection data. The 2026-09-05 → deploy window is the trial enumerator cohort's own traffic and the only field evidence this project has. Calibrating before it is scored means tuning against 1,482 held import rows plus a hole exactly where field behaviour lives.
- **Measured inputs (2026-09-18, re-measure on the day):** **58** in the window (32 enumerator + 26 public); **403** all-time (371 public + 32 enumerator); **0** submissions currently double-scored; **0** `rolled_back` among them; **2** with `respondent_id = NULL`.
- ⭐ **THE TWO-PASS SPLIT IS NOW EVIDENCE, NOT PREFERENCE (measured 2026-09-18):** all **58** window rows reference a LIVE form and can be scored today; of the remaining 345, **292 reference a form row that was deleted**, so they cannot be speed-scored honestly until Story B lands. **Pass 1 is unblocked. Pass 2 is blocked on Story B.**
- **The scope question the PM must rule on FIRST: 58 or 403?** ⭐ **Recommendation: 403, in two passes — the 58 first (it unblocks R-A8 and is small enough to inspect by hand), then the remaining 345 as a separate run.** Rationale: after this story every new submission is scored, so leaving 371 public rows dark hands the register a fraud history that begins on deploy day with a five-month hole in its public half — and the second pass costs one more run of the same script. The counter-argument is that public rows reach only `timing` (and `speed` for 55% of them — R7), so the second pass buys thin data; that is a real trade-off and it is the PM's call, not the runner's.
- **Must be decided before the run, not during it:** (a) dedup — skip submissions already holding a detection (sufficient today, since none are double-scored) or land R2's unique constraint first; (b) the 2 respondent-less rows; (c) throughput — 403 jobs at `concurrency: 4` on the 2 GB box, run off-peak, ideally in batches with a pause; (d) whether the run writes an audit/provenance record of itself, so "these detections came from a back-score, not from live traffic" is answerable later.
- **Shape:** an operator script under `scripts/` (⚠️ outside `tsconfig` — RUN it, don't type-check it), dry-run → apply, mirroring the 13-16/13-21 backfill discipline.

#### Story B → ✅ AUTHORED 2026-09-18 as **`13-73-a-zero-must-say-why`** (`ready-for-dev`), and it absorbed R9 as well. "A zero must say why" (R5 + R8, and the honest half of R6).

⚠️ **RE-SCOPED 2026-09-18, after R7 and R8 were actually measured. Story B is bigger and more urgent than when this section was first written, and it now has a hard dependency edge: its `deleteForm` guard and `no_form_schema` marker must land BEFORE R1's pass 2.** The measured facts: **283 submissions reference 5 `questionnaire_forms` ids that no longer exist** — the largest, 204 rows, on `019f8ed3`, which is the very row 13-34 recorded as prod. So **292 of the 403 unscored rows would be back-scored with `formSchema = null`**: straight-lining blind but honest, speed silently measured against a 60-second floor instead of the real 155s/246s. ⭐ **Pass 1 is unaffected — 58 of 58 rows in R-A8's window reference a live form.** ✅ **And the backups were checked (2026-09-18): 205 of the 283 are recoverable** — `019f8ed3` (204 rows) from `monthly/2026-08` and `019d7d40` (1 row) from `monthly/2026-05`, both with schemas that parse; the other 78 are gone. So Story B's shape firms up: **restore those two forms as `archived`, mark the remaining 78 `no_form_schema`, then run pass 2.** ⚠️ It also turned up the missing `monthly/2026-06` — **checked and closed: Story 9-35 fixed the cause on 2026-06-23 and already recorded the gap as permanent; 07-01, 08-01 and 09-01 all promoted cleanly.** The relevance here is narrower and sharper: that one absent backup is why **76 of the 78** unrecoverable rows cannot be recovered. Story B therefore gains a third item beside R5's markers: **`QuestionnaireService.deleteForm` must refuse to delete a form that any submission references.** It currently allows deleting `draft` OR `archived` forms, and archiving is exactly what a superseded form gets — which is the mechanism that produced all 283. ⛔ **R7 is NOT part of Story B:** it was measured and is not a defect (158 adopted drafts + 8 self-edits; the wizard path is 205/205).

- **Why:** this story's whole thesis is that a detector returning 0 because it *cannot measure* is indistinguishable from a clean population — and after all the fixes, three places in the engine still do exactly that. (1) `straight_lining` skips a battery with too few ANSWERED questions and emits no `reason` (R5), which on the master form means the labour battery — the one a real straight-liner would trip — is discarded silently; (2) the identity battery's five disjoint choice lists cap PIR at 0.2 against a 0.8 threshold, so the detector that does run cannot fire (R5); (3) `speed_run` falls back to a 60s theoretical minimum when `formSchema` is null, which is what a deleted form row produces, and says nothing about it (R8).
- ✅ **TASK 0 IS ALREADY DONE AND IN THIS TREE (2026-09-18, at Awwal's instruction): the CONTRACT test.** `apps/api/src/services/fraud-heuristics/__tests__/heuristic-self-description.contract.test.ts` — 6 tests, no production code touched, so AC10 holds. It asserts the property rather than patching instances: **for any context, a heuristic's `details` must carry either a `reason` or its computed evidence, never neither.** It sweeps both registries across three contexts (nothing measurable, clock-only GPS-less field, import with no cohort), **fails when a heuristic is registered without declaring what its evidence looks like** (the registry guard), and pins R5 and R8 as explicit, countable violations rather than hiding them behind an allowlist. ⭐ **Verified load-bearing by mutation:** removing the single `reason: 'no_batteries_found'` from `straight-lining.heuristic.ts` reds 2 of the 6 with a message naming the heuristic and printing its details; file restored and hash-verified. ⚠️ **Those two violation tests RED when R5 or R8 is fixed — by design.** The fix is to move that heuristic's row up into the contract sweep and delete its violation block, which is how the violation count is forced to shrink.
- ➕ **AND A FOURTH ITEM, scoped here rather than built (it is a migration, not a quick win): SNAPSHOT THE FORM IDENTITY ONTO THE SUBMISSION.** R8's real defect is not that forms get deleted — it is that **the form row is the only copy of the schema a submission was answered against**, so deleting it destroys the ability to interpret rows that were already collected. The guard stops the bleeding; this stops the class. **Shape:** add `form_id_logical` + `form_version` (+ optionally a `form_schema_hash`) to `submissions`, written by `webhook-ingestion.worker.ts` and the wizard at insert time from the form being rendered. Then a deleted or re-uploaded form still leaves every historical row self-describing, `speed_run` can resolve a real floor by `(form_id, version)` instead of a dead uuid, and 13-34's "pin to `form_id` + `version`, never a row id" lesson becomes structural instead of advisory. ⛔ Not retroactive — the 293 existing rows still need the `no_form_schema` marker and the 205-row restore.
- **Smallest useful slice, and ⭐ the recommendation: ship the `reason` markers alone first.** Emitting `reason: 'battery_below_min_answered'` and `reason: 'no_form_schema'` is a few lines, changes no score, cannot regress a threshold, and turns three silent zeroes into three measurable ones. **Then** decide the harder question — whether straight-lining is viable on this form at all — with a week of real `*_details` to look at rather than in the abstract.
- **⛔ Do not fold this into R-A8.** R-A8 tunes what detectors fire at; this is about whether they can fire. Tuning a detector whose ceiling is 0.2 against a 0.8 threshold is tuning nothing — the same error 13-69 exists to end, one level up.
- **Out of scope for Story B:** restructuring `oslsr_master_v3` to carry a real Likert battery. That is a form-content decision with a conversion cost (13-34's territory) and should be a PM ruling, not a dev choice.

### D. For the BMAD PM — four decisions this story surfaced and did not take

1. **R1's scope: 58 or 403?** (Story A above.) ⭐ Recommend 403 in two passes, the 58 first.
2. **R6 — should clerk/webapp submissions be scored on `off_hours` at all?** Five of seven prod roles map to `clerk`. Transcription legitimately happens in the evening, and `timing` is the one detector that will fire for them — so the current setup will generate flags that mean "a clerk worked late". ⭐ Recommend: exclude `clerk`/`webapp` from `off_hours`, or drop `timing_weight` to 0 for them, but only after a week of data confirms the flag rate. It costs nothing to leave running while measuring, because a `low` severity does not gate anything.
3. ✅ **R7 — CLOSED THE SAME DAY, no decision needed.** The measurement was run instead of recommended: the 166 are **158 draft-adoption rows + 8 self-edits**, both paths with no interview to time, and the wizard itself is **205/205**. Not a defect; the channel-table wording was corrected and nothing else is owed.
3b. 🔴 **R8 — NEEDS A RULING, and it got bigger when measured: 283 submissions point at 5 deleted form rows.** ⭐ Recommend the `deleteForm` guard (refuse to delete a form any submission references) rides with Story B and lands **before** R1's pass 2, and that nobody deletes another form in the meantime. ✅ **THE BACKUPS WERE CHECKED, 2026-09-18, and 205 of the 283 ARE recoverable** — see R8's recovery section. ⭐ Recommend the restore is authorised as part of Story B and performed BEFORE R1 pass 2, because a restored schema turns 205 half-blind detections into real ones. ⛔ The remaining **78** are gone for good and must be marked, not approximated.
4. ✅ **SCOPED 2026-09-18 — Awwal ruled the same day: auto-capture on form open AND make it required ("so that we are double sure"), because enumerators must be mappable to their bases.** Brief: `_bmad-output/planning-artifacts/brief-2026-09-18-story-13-71-enumerator-gps-is-optional-in-practice.md`. The mechanism was traced, not guessed — `FormFillerPage` is a one-question-per-screen stepper, `gps_location` is its own screen, and client + server both enforce only `required`, so "Next" walks past an untouched capture button. Measured: **4 of 36** in the trial window, by **3 of 10** enumerators. The chain itself is sound (5 captures → 5 `raw_data` keys → 5 columns). Two decisions in the brief still need the PM: enforce in CODE vs re-uploading the XLSForm (⭐ code — a re-upload mints a new form row and there is no enumerator pin), and the staff-location-tracking disclosure. Original note:

4-original. **Field practice, and the one with a live cost: 5 of 37 enumerator submissions carry GPS.** The question is served and optional; `GeopointInput` needs a deliberate tap. With the trial cohort at 8 logged-in enumerators this is a briefing item; at field scale it decides whether the GPS detector has any input at all. ⭐ Recommend it rides with the enumerator re-run briefing (the runbook §0.1a cohort), and that the decision to make `gps_location` REQUIRED is taken deliberately with its trade-off stated — a required geopoint blocks submission indoors and offline, which is a field-usability cost, not a free win.

### E. One thing this session would do differently, offered as a process note

Tasks 5 and 7.2 were handed over as "BLOCKED: needs prod read access", and the review carried that forward for a full pass before testing it. **The access was there the whole time** — read-only prod measurement over Tailscale is sanctioned for the dev/review agent; it is committing, pushing, editing the handoff doc and touching the live server that are not. Two queries, three minutes, and the story's conditional half closed without a single file being edited. ⭐ **Worth making standing practice: a task blocked on a MEASUREMENT should record the attempt that failed, not the assumption that it would.** "I have no path to prod" and "I did not try" read identically in a story file six weeks later — which is the same failure mode as an absent log line, in prose.

### F. The complete ledger — every issue and nuance raised in this review, and where each one landed

**Built 2026-09-18 by auditing this story's own record for orphans, rather than by listing what the session remembered doing.** The audit found two items that had been raised in conversation and written down NOWHERE — R9 and the sentinel half of R8 — which is the reason a ledger exists at all: *an issue that is only in a transcript is an issue that has been lost.* Every row below names the artefact that now carries it, so any claim here can be checked by opening that file.

**Disposition vocabulary:** **FIXED** = changed in this tree, verified. **RULED** = a decision was taken and recorded. **RESIDUAL** = recorded with its evidence, deliberately not built. **SCOPED** = handed to a named story with acceptance criteria. **OPEN** = needs someone else, and says who.

| # | Issue / nuance | Disposition | Where it lives now |
|---|---|---|---|
| 1 | H1 — straight-lining reaches its computation and cannot score on the master form | FIXED (claim corrected + tripwire test) + RESIDUAL **R5** | Channel table; `fraud-engine.ungated-coverage.integration.test.ts` → "REVIEW H1"; R5 |
| 2 | H2 — the integration test's submission was invented (7 of 11 answers impossible) | FIXED (rebuilt from the schema + `assertAnswersAreRealFor` guard) | Same test file; Review Follow-ups H2 |
| 3 | H3 — Task 7.2 ticked without its number | FIXED (measured: 403 all-time / 58 in window) | Task 7.2; R1; Prod ground truth |
| 4 | M1 — enqueue order was load-bearing and unpinned | FIXED (per-effect try/catch + deferred first-error re-throw + 3 tests) | `submission-processing.service.ts`; unit tests "REVIEW M1" |
| 5 | M2 — clerk/webapp channel ungated and unnamed | FIXED (table + comment + test) + RESIDUAL **R6** | Channel table; clerk test; R6 |
| 6 | M3 — two comments still asserted the removed gate | FIXED | `submission-processing.service.ts:429`; `registration.controller.ts:1291` |
| 7 | L1 — `hasGps` asserted by nothing | FIXED (2 tests) | Unit tests "REVIEW L1" |
| 8 | L2 — the mutation-proof test proved a row existed, not its contents | FIXED (4 detector assertions on the producer's own row) | End-to-end test (AC1) |
| 9 | L3 — orphaned comment fragment | FIXED | `submission-processing.service.ts` method head |
| 10 | AC8 — which form prod enumerators use, and its geopoint count | RULED by measurement (**1**, `v2026072301`) | AC8; Prod ground truth |
| 11 | AC9 — restore geopoint to the enumerator form | CLOSED as a no-op (condition did not fire) | AC9; Task 6 |
| 12 | R1 — back-scoring, with its number | RESIDUAL, measured; SCOPED as **Story A** | R1; Handover §C |
| 13 | R2 — `submission_id` not unique | RESIDUAL, de-risked by measurement (0 double-scored today) | R2; Story A decisions |
| 14 | R3 — public channel structurally blind on straightline + duplicate | RESIDUAL, pinned by AC3's test | R3; AC3 |
| 15 | R7 — 45% of public rows carry no completion time | CLOSED by measurement — **not a defect** (158 adopted + 8 self-edits; wizard 205/205) | R7; channel table |
| 16 | R8 — submissions referencing deleted forms (**283**) | RESIDUAL, upgraded to a blocker for R1 pass 2; SCOPED into **Story B** | R8; Handover §C |
| 17 | R8b — backups checked: **205 of 283 recoverable**, 78 gone | RESIDUAL with a restore recommendation (as `archived`, before pass 2) | R8 → recovery table |
| 18 | R8c — `self-edit` (8) + `no-form-pinned-at-submit` (2) also resolve to a null schema | RESIDUAL — marker must key on "schema is null", total **293** | R8 → sentinel note |
| 19 | R9 — duplicate heuristic compares geopoints by `String()` → `"[object Object]"` | RESIDUAL — bias arrives WITH 13-71 | R9 |
| 20 | The missing `monthly/2026-06` backup | CLOSED — 9-35 fixed the cause 2026-06-23; 07/08/09 promoted cleanly | R8 → finding (1); Change Log |
| 21 | 13-34's recorded prod form ids are dead | FIXED (correction written into 13-34's own Change Log) | `13-34-*.md` Change Log 2026-09-18 |
| 22 | GPS captured on only 5 of 37 enumerator submissions | RULED (auto-capture + code-enforced required) + SCOPED as **13-71** | `brief-2026-09-18-…-13-71-*.md` |
| 23 | Enumerators are not briefed on the capture button | FIXED ahead of the build (briefing §3, live-rendered PDF) | `docs/runbooks/enumerator-field-briefing.md` |
| 24 | `gps_accuracy` captured by the component and discarded | SCOPED into 13-71 Part C | 13-71 §3 |
| 25 | Base-mapping needs a read model, not the fraud clustering | SCOPED as 13-71 Phase 2, explicitly out of scope now | 13-71 §3.3, §6 |
| 26 | Staff location tracking needs disclosure, not just a release note | RULED (brief first — done); OPEN on the formal terms wording | 13-71 §4.1 |
| 27 | One enumerator submission filed against the PUBLIC form | OPEN — operational: how enumerators reach a form id | Prod ground truth #2; 13-71 §4.3 (enforcement edge) |
| 28 | 2 unscored submissions have no `respondent_id` | RESIDUAL — decide before Story A runs | R1 decision list |
| 29 | `speed_run`'s 246s floor counts hidden + minor-only questions | NOTED for R-A8 — a calibration input, not a defect | Review Follow-ups → closing note |
| 30 | `main` red from `b6a1d28` (AUDIT_ACTIONS 66 → 67) | FIXED at Awwal's instruction (another agent's file) | `audit.service.test.ts`; File List warning |
| 31 | "Blocked on prod access" was assumed, never tested | FIXED (measured) + captured as a durable practice | Handover §E; memory `pattern-blocked-on-a-measurement-means-try-first` |
| 32 | `restore-backup.ts --dry-run` does not download the dump | NOTED — the read-only method is written out instead | R8 → method |
| 33 | Daily manifests do NOT survive the 7-day sweep | NOTED — a history check must use monthly `LastModified` | R8 → method correction |
| 34 | The orphan count was first written as 293, actually **283** | FIXED, with the correction left visible | R8; Change Log |

**Three items are OPEN and each names its owner:** #26 (terms wording — Awwal/ministry), #27 (how enumerators reach a form id — ops), and the four PM decisions in §D. Everything else is fixed in this tree, recorded as a residual with its evidence, or scoped into Story A, Story B or 13-71.

⭐ **The one structural observation worth more than any single row above.** Items 1, 16, 18, 19 and 22 are the same defect wearing five costumes: **a zero that cannot say why it is zero.** Straight-lining skips a battery silently; speed measures against a 60-second floor and says nothing; a geopoint that was refused is indistinguishable from one never attempted; a `String()`-flattened object silently counts as a match. This story fixed one instance (`gps_details.reason`) and named the others. ⭐ **The cheap structural fix is a CONTRACT, not four patches — and it is BUILT (2026-09-18, at Awwal's instruction), not proposed:** `heuristic-self-description.contract.test.ts` asserts that every heuristic returns either computed evidence or a `reason`, guards the registry against a new detector shipping a silent zero, and pins R5 + R8 as countable violations. Test-only, so AC10 holds; mutation-verified. It would have caught R5, R8 and R9 before any of them reached prod. Two companion agreements went into `project-context.md` as **A12-A14**, and a fourth item — snapshotting `form_id` + `version` onto `submissions`, which ends R8's class rather than guarding it — is scoped into Story B.

### G. Field readiness — the factual picture, and how enumerators actually go out from here

**Written 2026-09-18, at Awwal's request, as the last act of this review.** Everything in §G is either measured against prod that day (`5c4cc93`, read-only) or is a named recommendation. ⛔ Nothing here is a ruling; the field decision is Awwal's and the PM's. Re-measure before acting — every number is perishable (A12).

#### G.1 What is TRUE on prod right now

| Fact | Value | Source |
|---|---|---|
| Prod SHA / health | `5c4cc93` / `200` | ssh + curl, 2026-09-18 |
| **Login-by-person (13-68) is LIVE** | commit `4a3279d`, verified an ANCESTOR of `5c4cc93` | `git merge-base --is-ancestor` |
| Enumerators provisioned | **17** | go-live gate runbook §0 |
| …`active` (activated an account) | **10** | same |
| …who have actually logged in | **8** | same |
| …who have captured anyone | **5**, holding **24** real registrants | same |
| …locked out by a plus-addressed login they cannot guess | **9** (7 `invited`, invitations expired 09-08; 2 `active`, never logged in) | §0.1a |
| Enumerator submissions in the trial window | **36** | prod |
| …carrying GPS | **4 (11%)**, from **3 of 10** enumerators | prod |
| …holding a `fraud_detections` row | **0 of 32 unscored** | prod |
| Fraud detection on prod today | **still GPS-gated — 13-69 is NOT deployed** | this story is uncommitted |

⛔ **FRAMING, CORRECTED 2026-09-18 (Awwal): THESE 17 ARE A TRIAL COHORT — the field proper has not started.** Everything below describes a trial in progress, not production field work. Their 24 captures are nonetheless REAL citizens in the register (§0.9b), so trial DATA is real; trial READINESS is what is provisional.

⭐ **The single most important fact for the field question: the app WORKS.** Five enumerators have captured 24 real registrants through it. Nothing in this review found a defect that stops an enumerator registering someone. What the review found is that the work is **unsupervised and unlocated** — which is a different problem from a broken app, and it has a different remedy.

#### G.2 The shape now — four stories, and which edges are hard

```
13-69 (done, UNCOMMITTED) ──deploy──┬──▶ 13-72 PASS 1 (58 rows) ──▶ R-A8 calibration
                                    │
                                    └──▶ 13-73 ──▶ 13-72 PASS 2 (345 rows)

13-71 (GPS capture) ── independent of all three ──▶ the only PERMANENT data loss
```

| Story | State | What it changes for the field |
|---|---|---|
| **13-69** | `done`, uncommitted, green | Every submission gets scored. Enumerators reach 3 detectors (timing, speed, duplicate); straight-lining runs and cannot score (R5). |
| **13-71** | `ready-for-dev` | Location captured automatically + required with a derived reason. **11% → target >90%.** |
| **13-72** | `ready-for-dev` | Scores the dark window so R-A8 has field evidence. **Cannot start until 13-69 deploys.** |
| **13-73** | `ready-for-dev` | Closes the silent-zero class; **unblocks 13-72 pass 2.** |

**The hard edges, restated so nobody re-derives them:** 13-72 cannot start before 13-69 deploys; R-A8 cannot start before 13-72 pass 1; pass 2 cannot run before 13-73; **13-71 depends on none of them.**

#### G.3 The three things that are actually stopping the field, ranked by damage

1. 🔴 **Nine of seventeen enumerators cannot log in** — a provisioning defect, not a code one. Every CODE cause behind it is already fixed and deployed (selfie sizing, per-proxy-IP limiters, password reset, and invitations that now print the exact login address). What remains is re-provisioning with real addresses: **RESEND** to the 7 `invited`, **reset IN PLACE** for the 2 `active`. ⛔ **Never delete an account that has captured anyone — `submitter_id` has no FK (§0.9b), and deletion orphans the attribution silently.** ⭐ **This needs no deploy, no story and no engineer, and it roughly doubles the working field force.**
2. 🟠 **Their work is unsupervised** — 0 of 32 recent submissions scored. Fixed by deploying 13-69, which is finished and green in this tree.
3. 🟡 **Their work is unlocated** — 4 of 36 carry coordinates, and ⛔ **this is the only loss that cannot be repaired later.** ⚠️ In a TRIAL this is doubly wasteful: the trial is supposed to be producing the evidence that location capture works before the field proper begins, and at 11% it is producing the opposite. A fraud score can be back-written (13-72 exists to do exactly that); a location never captured is gone. 13-71 fixes it, and every day it waits adds visits that can never be placed on a map.

#### G.4 ⭐ The recommendation — CORRECTED 2026-09-18 (Awwal: *"They are not in the field proper it is a trial."*)

⛔ **THE FIRST VERSION OF THIS SECTION GOT THE PREMISE WRONG AND THE CORRECTION MATTERS MORE THAN THE ADVICE.** It read *"Restart the EXISTING 17 now. Hold the SCALE-UP until 13-71 ships"*, and argued not to hold the cohort because *"they are already in the field"*. **They are not.** The 17 are a **TRIAL cohort**; the field proper has not started. That inverts the reasoning: "don't block people who are already working" is an argument about production, and there is no production yet to protect.

> **✅ THE CORRECTED RECOMMENDATION: use the trial for what a trial is for. Ship 13-69 and 13-71 INTO the trial, and let the four gates in §G.5 be the trial's EXIT CRITERIA for starting the field proper.**

**What changes under the right premise:**

1. **Nothing is lost by sequencing.** The argument for letting the cohort run at 11% GPS was "stopping them costs registrations". In a trial, registrations are not the deliverable — **evidence that the system is ready is.** A trial that ends with 11% location coverage has not proven the thing the field proper depends on.
2. **The trial is the ONLY chance to test 13-71 with real users before scale.** A location prompt that fires on form open, a permission dialog on an unfamiliar phone, a browser "Block" that sticks per origin (§G.6 R-a) — those are discovered by ten people in a week or by two hundred people on day one. ⭐ **Finding a GPS-capture UX problem with 10 enumerators is the cheapest thing in this entire plan.**
3. **The re-provisioning must be validated here too, not just performed.** Nine of seventeen were locked out by plus-addressed logins. At trial scale that is an annoyance; at field scale the same provisioning mistake locks out hundreds and there is no escape hatch, because it is the enumerators who cannot reach support. **The trial should prove that a real-address invitation → activation → login → capture path works end to end for someone who has never seen the app.**
4. **The trial cohort's captures are still REAL citizens.** 24 registrants are in the register with `submitter_id` attribution and no FK behind it — so "it's only a trial" is not licence to delete or recreate accounts (§0.9b). Trial data is real data; trial READINESS is what is provisional.

**What does NOT change:** the dependency chain (§G.2), the fact that re-provisioning needs no deploy, and the fact that a location never captured cannot be back-filled. **13-71 simply moves from "before the scale-up" to "inside the trial window", which is earlier and cheaper.**

⚠️ **One honest caveat this correction exposes, for R-A8:** if the field proper has not started, then 13-72 pass 1's **58 rows are a TRIAL sample**, not field-representative — 36 submissions from 10 people, 14 of them captured by one enumerator in a single morning. Thresholds calibrated on that are calibrated on a trial. ⭐ Recommend R-A8 treats pass 1 as a **shakedown of the calibration method** and re-runs against the first real field weeks, rather than setting production thresholds from trial traffic and inheriting them at scale.

**What to do in what order:**

| When | Action | Type | Needs |
|---|---|---|---|
| **Now** | Re-provision the 9 locked-out enumerators with REAL addresses | operator | nothing |
| **Now** | Tell the current 10 to press **Capture location** at every interview | comms | nothing — §3 of the briefing is already written |
| **Now** | Adjudicate → commit → deploy **13-69** | adjudication | this tree |
| **+1 day** | 13-72 **pass 1** (58 rows) once 13-69 is live | operator script | 13-69 deployed |
| **+2-4 days** | dev → review → deploy **13-71** | dev-story | a clean tree |
| **Then** | R-A8 calibration \| **13-73** → 13-72 pass 2 | code + operator | pass 1 \| 13-73 |

⚠️ **One nuance about the briefing that matters operationally:** `docs/runbooks/enumerator-field-briefing.md` §3 is in THIS uncommitted tree, and the PDF renders from that Markdown at request time — so enumerators only receive it once this story is deployed. **Until then the same content has to travel by voice or WhatsApp.** Do not wait for the deploy to tell ten people to press a button.

#### G.5 The four gates — the TRIAL EXIT CRITERIA for starting the field proper

✅ **NOW LIVE IN THE RUNBOOK (2026-09-18): `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` → "🛰️ The FIELD-PROPER gate — trial exit criteria"**, as F1-F4 with their queries, owners and a decision rule, kept separate from the seven-item MEDIA-SPEND gate above it (different question, independent verdicts). It also carries the adjudicated-exemption register — see below. ⛔ **These are the trial's exit criteria, not a post-hoc scorecard** (corrected framing, §G.4): the field proper starts when they read green against TRIAL data. Each is one query, each maps to exactly one item above, and each has today's baseline so the comparison is real [[pattern-predict-then-compare]]:

| Gate | Today (2026-09-18) | Target | Closed by |
|---|---|---|---|
| Enumerators who have logged in | **8 of 17** | **≥ 15** | re-provisioning (operator) |
| Enumerator submissions carrying GPS, last 7 days | **11%** | **≥ 90%** | 13-71 |
| Submissions with a `fraud_detections` row, last 7 days | **0%** | **100%** | 13-69 deploy |
| Submissions referencing a form row that no longer exists | **1** enumerator (283 overall) | **0 new** | 13-73 (guard + snapshot) |

⛔ **Do not let R-A8 gate the field.** Calibration decides what the detectors FLAG; capture decides whether there is anything to flag. They have been coupled in planning because both say "fraud", and they should not be: enumerators are field-ready with detectors running at default thresholds.

#### G.6 Nuances an adjudicator should carry into the deploy, in one place

1. **13-69's deploy scores the PUBLIC channel too**, not only enumerators — `timing` + `speed`, and `speed` only for the 55% of public rows carrying a completion time (R7). Expect new `low`-severity rows on the review surfaces; the default filter excludes `clean` only.
2. ⚖️ **THE ONLY NON-CLEAN DETECTION EVER WRITTEN IS ADEDEJI ADETOLAs, AND AWWAL HAS RULED IT GENUINE (2026-09-18).** `low` / 25.00, driven entirely by `speed_score` 25 (tier `superspeceder`, **41s against a 246s theoretical floor**); every other component 0. ⭐ Measured support for the ruling: it is her FIRST submission and her ONLY GPS-carrying one, while her other 22 run **132-635s** — an outlier inside her own pattern, with the shape of a practice run, not a speed pattern. Her 13 captures across 2h48m on 09-16 are ordinary field work. ⚠️ It was the MISSING GPS on her rows — not the volume — that triggered the investigation that produced this story and 13-71. Recorded as exemption **E1** in the go-live runbook; ⛔ do not re-litigate it, and do not read it as a base rate: it is the ONLY labelled-genuine flag in the system, against a floor that counts minor-only and skip-hidden questions.
3. **Straight-lining will read 0 everywhere** and that is not evidence of clean data (R5). Anyone reading the first week's detections needs to know this before they conclude anything.
3. **Clerk/webapp submissions are scored and filed under the submitter's uuid** in `fraud_detections.enumerator_id` (R6) — a supervisor's or admin's name can appear in an "enumerator" column. Open product question: should a clerk be scored on `off_hours` at all?
4. **The enqueue is now isolated per side-effect** (review M1): a Redis failure in marketplace extraction can no longer cost a submission its fraud score, and vice versa. The first error still reaches the caller unchanged.
5. **One enumerator submission was filed against the PUBLIC form**, which serves no geopoint question — serving the question on the master form is not the same as every enumerator reaching the master form. Operational, unowned, worth a look during the re-provisioning.
6. ✅ **RESOLVED 2026-09-19 — no longer a nuance for the deploy.** The `main`-red `AUDIT_ACTIONS` fix was moved out of this tree and fixed up into the staff commit itself (`b6a1d28`). Nothing about it rides with 13-69 any more.
7. **Staff location tracking (13-71) needs a disclosure decision** beyond the briefing — whether the terms accepted at activation carry the same sentence. Awwal/ministry, not engineering.
8. **Verification predictions for this deploy are in §B**, with what each miss would mean. The cheapest post-deploy check is one log line: `submission_processing.fraud_queued` with `hasGps` — if it is absent, the ungate did not reach prod.

---

## 🏁 Closing verdict — ADJUDICATION, 2026-09-19

**Adjudicated on the uncommitted tree by the adjudication agent (Claude Opus 5, 1M). Third independent layer: the dev built it, an adversarial review attacked it, this pass VERIFIED it. Nothing below was read off the story — all of it was run.**

### Verdict

✅ **THE WORK IS SOUND AND IS WHAT IT CLAIMS TO BE.** The ungate is real, the coverage it buys is real and per-channel exactly as documented, and every falsifiable prediction the Handover wrote landed on its number. **No defect was found in the code.** Every finding was in the RECORD, and each is fixed above.

⛔ **NOT `done` — `review`, closing ON DEPLOY.** Two verifications are provable only against prod (D1/D2 in the ledger). Per §2a0 a DISCHARGE-ON-DEPLOY row blocks `done` but not the commit, and per §2y(a) `done` requires *deployed* and *verified*, not *committed*.

**Deploy SHA: ⏳ PENDING** — until this line carries a real SHA, `Status:` must not read `done`.

### The probes, executed and reported HERE rather than only in chat (§2a0.1)

| # | Handover §B check | Predicted | Measured | |
|---|---|---|---|---|
| 1 | the two suites against `app_test` | 112 passed | **112 passed**, exit 0 (captured, not read off a notification) | ✅ |
| 2 | restore `if (args.gps)` | 7 red | **7 red**, and the right seven | ✅ |
| 3 | fraud re-ordered above marketplace | 1 red | **1 red** (the M1 order pin); `tsc` stayed 0, so the failure is behavioural, not a compile artefact | ✅ |
| 4 | prod: enumerator form + geopoint count | v2026072301, 1 geopoint | **exactly that**, 36 submissions. Not 0 ⇒ AC9 correctly never fires and no form is touched | ✅ |
| 5 | prod: unscored since 2026-09-05 | ≥ 58 and RISING | **65** (410 all-time, 33 enumerator). Rising, so nobody has begun back-scoring | ✅ |
| 6 | `submission_processing.fraud_queued` with `hasGps` in prod logs | one per new submission | ⏳ **DISCHARGE-ON-DEPLOY (D1)** | ⏳ |
| 7 | `fraud_detections` written ~1h after deploy | ≈ one per submission since | ⏳ **DISCHARGE-ON-DEPLOY (D2)** | ⏳ |

**Gates re-run independently:** `tsc --noEmit` **0** · `eslint` on all six touched files **0** · all three drift guards **0**, each run DIRECT rather than through turbo (§2y(c)).

⚠️ **One cached verdict is disclosed rather than quoted as proof:** the pre-commit hook reported `FULL TURBO / 6 cached` for lint. That is acceptable ONLY because eslint and `tsc` had been run uncached on the identical tree minutes earlier (Pitfall #47).

### RED-verify evidence — including one the Handover did not ask for

The three §B mutations above, **plus a fourth of adjudication's own.** §2ae requires that a NEW guard be invoked the wrong way on purpose, and the A14 contract test is new. Deleting the single `reason: 'no_batteries_found'` from `straight-lining.heuristic.ts` **redded 2 of 6**, naming the offender and printing its evidence: `straight_lining → {"batteryCount":0}`. **The failure message IS the defect**, which is the standard §2v sets. The contract genuinely bites.

All four mutations were restored and verified **byte-identical by md5**. The files are tracked-and-modified, so `git checkout --` would have destroyed two sessions of uncommitted work (§2b).

**Positive execution evidence, not merely counts (§2aa):** reading the *passing* run's log rather than its exit code showed all three channels behaving exactly as the per-channel table claims — enumerator `duplicate 20 + timing 5 → low/25`, clerk `duplicate 0 + timing 5 → clean` (M2's `no_data_or_history`), public `enumeratorId null → clean`. A count consistent with both outcomes would have proven neither.

### Claims checked at source rather than trusted

| story claim | verified |
|---|---|
| `FraudDetectionJobData` already types the coordinates optional | ✅ `gpsLatitude?: number` |
| the worker never reads the job's coordinates | ✅ it calls `FraudEngine.evaluate(submissionId)` and nothing else |
| FR2 was already built, so the marker is verified not renamed | ✅ `gps-clustering.heuristic.ts:191` returns `reason: 'no_gps_data'` |

### File-List reconciliation

⛔ **DRIFT FOUND AND FIXED — the File List under-declared FOUR files**: the three downstream stories and the runbook's F1–F4 gate, while declaring `sprint-status.yaml`, which adds board entries for those very stories. Committing the declared list alone would have published a board pointing at three story files absent from the repo. Reconciled name-for-name against `git status --short`; it now matches.

### Findings that were NOT defects, recorded so they are not re-found

- ⚠️ **Adjudication's own first count was wrong.** It reported nine unchecked boxes as blocking `done`. **Eight are archived history** under the two *-original (superseded)* containers and are correctly unticked; exactly **one** (H3) was real drift. Both containers now say so in-line, so the next cold start does not re-litigate it. → §2af, *a suspicious count is a prompt to go and look*, turned on the instrument rather than the data.
- ⚠️ **The local DB was down for the first suite attempt**, which returned *102 passed / 10 skipped* — a near-green that silently omitted the ten tests proving AC1. **A skipped integration file and a passing one look the same in a totals line.** Read the skip count, not only the failure count. → sibling of §2t.

### Inherited and discharged by this adjudication

**`main` was red at `9124abc` for ~24h** — an `AUDIT_ACTIONS` constant added without bumping the assertion written to catch it. Rather than repairing it downstream inside 13-69, it was fixed **at source** with `git commit --fixup` + `rebase --autosquash` into **`b6a1d28`**, an option available only because that commit had never been pushed. Verified at the rewritten commit: assertion **67** vs **67** actual keys, file passes **39/39**, and the working tree was proven intact afterwards — 16 of 17 files byte-identical, one newline-only (CRLF→LF), **zero content diffs**.

⭐ **The rule this earns: when the commit that caused a red is still UNPUSHED, fix it there, not downstream.** A downstream repair leaves every intermediate commit failing for a reason that is not its own.

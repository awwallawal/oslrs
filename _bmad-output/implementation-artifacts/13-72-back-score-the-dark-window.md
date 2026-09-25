# Story 13.72: Back-score the dark window — the detections that were never written

Status: ready-for-dev

<!--
Authored 2026-09-18 by Bob (SM) via the canonical *create-story workflow, yolo.
This is "Story A" of 13-69's Handover §C, now a real story with a board position.

SOURCE OF SCOPE: _bmad-output/implementation-artifacts/13-69-fraud-engine-is-dark.md
  → Residuals R1 + R2, Prod ground truth, Handover §C "Story A".

⛔ SEQUENCE — this story sits between two others and both edges are hard:
     13-69 (deployed)  →  THIS, PASS 1  →  R-A8 threshold calibration
                          THIS, PASS 2  ←  BLOCKED until 13-73 ships
  • It CANNOT start before 13-69 is deployed: the ungate is what makes a re-enqueued
    submission produce a detection at all.
  • R-A8 CANNOT start before pass 1 finishes: R-A8 calibrates thresholds against
    detection data, and the field window has none.
  • Pass 2 CANNOT run before 13-73: 292 of its rows resolve to a null form schema,
    so `speed_run` would measure them against a 60-second floor instead of the real
    155s/246s and write a number that looks like data.
-->

## Story

As **the analyst who has to calibrate what the fraud detectors fire at**,
I want **the submissions taken while detection was dark to be scored, in a controlled run with its dedup decided up front**,
so that **R-A8 tunes thresholds against the trial cohort's own field behaviour instead of against 1,482 held import rows plus a hole exactly where the field evidence should be.**

## Acceptance Criteria

1. **AC1 — The count is RE-MEASURED before the run, and recorded with its date.** The story's own numbers (below) were measured 2026-09-18 and the population grows daily until 13-69 deploys. ⛔ Do not quote them as current — re-run the query, write the new figure with the date, and state the delta [[pattern-falsifiable-number-is-a-live-artefact]], project-context **A12**.

2. **AC2 — PASS 1 scores the R-A8 window only: submissions from 2026-09-05 with no `fraud_detections` row.** Measured 2026-09-18: **58** (32 enumerator + 26 public). ⭐ **All 58 reference a LIVE form**, which is what makes pass 1 runnable while pass 2 is not.

3. **AC3 — The dedup is decided BEFORE the run, not discovered in its results.** The script skips any submission that already holds a detection. Measured 2026-09-18: **0 submissions currently hold more than one**, so the baseline is clean and skip-on-existing is sufficient; `fraud_detections.submission_id` is a plain index, not unique (13-69 R2), and the queue's `jobId = fraud-<submissionId>` dedup expires after `removeOnComplete: 100`. ⛔ A double-counted population is a WORSE input to R-A8 than an unscored one, because it looks like data.

4. **AC4 — Dry-run first; the count IS the evidence.** `--dry-run` reports what would be enqueued, by source and by day, and writes nothing. `--apply` requires an explicit confirmation flag, mirroring the 13-16/13-21/13-67 backfill discipline.

5. **AC5 — The three known edge populations are handled explicitly, by name.** (a) **2 submissions have `respondent_id = NULL`** and `queueFraudDetection` types `respondentId: string` — decide and implement (skip, or a documented sentinel) rather than crashing mid-run. (b) **0 rows are `rolled_back`**, so `PIPELINE_EXCLUDED_STATUSES` currently excludes nothing — assert that at run time rather than assuming it still holds. (c) **Import rows are NOT in scope** — they already hold 8,278 detections and run a different registry.

6. **AC6 — The run is throttled for a 2 GB box.** All ten BullMQ workers run IN the API process [[reference-worker-model-and-parser-limits]] and `fraud-detection` has `concurrency: 4`, each job running up to four queries. Enqueue in batches with a pause between them, and run off-peak. ⛔ Not "enqueue 58 and hope" — and emphatically not for pass 2's 345.

7. **AC7 — The run leaves a record that it was a back-score, not live traffic.** Whoever reads these detections in three months must be able to tell them from detections written by real-time submission. Decide the mechanism (an audit row per run, or a marker on the detection) and record the choice.

8. **AC8 — Verification, with the prediction written BEFORE the run.** Predict the resulting detection count and the component-score distribution, then compare [[pattern-predict-then-compare]]. Minimum checks after: every targeted submission holds exactly one detection; `timing_details.watHour` present on all; `speed_details.reason` absent for the rows that carry a completion time.

9. **AC9 — PASS 2 IS SCOPED HERE AND EXPLICITLY NOT RUN.** The remaining **345** rows (measured 2026-09-18: 403 all-time minus the 58) include **292 whose form row was deleted**. This story records the split, and pass 2 runs only after 13-73 ships the `no_form_schema` marker and the archived-form restore. ⛔ Running pass 2 early produces 292 speed scores measured against a 60-second floor.

10. **AC10 — No code path outside `scripts/` changes.** This is an operator run over live rows, not a behaviour change. `git diff` on `apps/api/src/services/`, `fraud-heuristics/` and the queue is empty at close.

## Tasks / Subtasks

- [ ] **Task 1 — Re-measure, and gate the run on 13-69 being live** (AC: #1, #2)
  - [ ] 1.1 Confirm 13-69 is DEPLOYED (prod SHA contains the ungate) — a back-score before it writes nothing useful.
  - [ ] 1.2 Re-run the unscored counts (all-time, window, by source, by day) read-only; record each with today's date and the delta from the 2026-09-18 baseline in Dev Notes.
  - [ ] 1.3 Re-run the form-liveness split: how many targeted rows reference a form row that still exists.

- [ ] **Task 2 — The script** (AC: #3, #4, #5, #6, #7, #10)
  - [ ] 2.1 New operator script under `scripts/`. ⚠️ `scripts/` is OUTSIDE `tsconfig` — it must be RUN, not type-checked; `pnpm tsc --noEmit` will not cover it.
  - [ ] 2.2 Select: no existing detection, `submitted_at >= <window>`, not an import sentinel. Skip-on-existing is the dedup (AC3).
  - [ ] 2.3 Handle the respondent-less rows and assert the `rolled_back` count is still 0 (AC5).
  - [ ] 2.4 Batch + pause; make both configurable and log each batch (AC6).
  - [ ] 2.5 `--dry-run` / `--apply --confirm-*` with the count as evidence (AC4).
  - [ ] 2.6 Provenance for the run (AC7).

- [ ] **Task 3 — Dry-run, then apply** (AC: #4, #8)
  - [ ] 3.1 Dry-run; record the numbers; write the PREDICTION down before applying.
  - [ ] 3.2 Apply off-peak. Watch queue depth and API memory during the run.
  - [ ] 3.3 Re-run the dry-run: it should now report 0 remaining in the window.
  - [ ] 3.4 Compare outcome to prediction and record BOTH, including any miss.

- [ ] **Task 4 — Record what the window actually says** (AC: #8)
  - [ ] 4.1 Component-score distribution across the newly-written detections — this is R-A8's input, and the first honest look at field behaviour this project has had.
  - [ ] 4.2b ⚖️ **The one labelled-genuine flag is already adjudicated — do NOT re-open it.** The only non-clean detection on the system (Adedeji Adetola, 2026-09-15, `low`/25.00, speed `superspeceder`, 41s vs a 246s floor) was ruled GENUINE by Awwal on 2026-09-18 and is recorded as exemption **E1** in `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md`. Carry it into the distribution as a LABELLED POSITIVE for R-A8, not as a suspect row. ⚠️ And note what it implies about the floor: `calculateTheoreticalMinimum` counts minor-only and skip-hidden questions, so short genuine interviews will flag.
  - [ ] 4.2 ⚠️ Expect `straightline_score = 0` everywhere and say so: it reaches its computation and cannot score on the master form (13-69 R5, 13-73's job). Reading those zeroes as "no straight-lining in the field" would be the exact error 13-69 exists to prevent.

- [ ] **Task 5 — Hand pass 2 to its blocker** (AC: #9)
  - [ ] 5.1 Record the pass-2 split with fresh numbers and state its dependency on 13-73 in both stories' Dev Notes and in `sprint-status.yaml`.

## Dev Notes

### ⏳ Pass 2's blocker — 13-73 status, 2026-09-24 (13-73 AC10): IN REVIEW, NOT YET UNBLOCKED

Recorded by 13-73's dev-story so this story's reader does not have to open that one. **Pass 2 stays BLOCKED** until BOTH are true on prod:
1. **13-73 is deployed** and a null-schema row is scored with `speed_details.reason = 'no_form_schema'` — code written and tested 2026-09-24, uncommitted, in code review.
2. **13-73's AC6 restore is APPLIED** (its R1) — the SQL is prepared and rehearsed; the prod write is adjudication/operator's.

⚠️ **Before pass 2's AC8 check (added by 13-73 code review, 2026-09-25):** AC8 says "`speed_details.reason` absent for the rows that carry a completion time". After 13-73, every NULL-SCHEMA row in pass 2 stores `speed_details.reason = 'no_form_schema'` by design, so that check will read as failing on them. Do not "fix" the marker — the reading awaits Awwal's ruling in **13-73 R10**. Pass 1 (rows on a live form) is unaffected.

**What pass 2 will then look like (re-measured 2026-09-24, read-only on prod `7b13ec3`):** **282** submissions on a deleted form row (was 283 — the one enumerator row on `019d7d40` is gone, unaudited; 13-73 R3), all public, across 4 ids; **204** of them (`019f8ed3`) regain a real schema once the restore is applied; the other **78** + the 10 sentinels (**88**) are scored with the `no_form_schema` marker. ⭐ Rehearsed on one such row through the real engine: restored → reference 155 s, `speeder`, speed 12; absent → reference 60 s, `normal`, speed 0, marked. ⚠️ Straight-lining will also carry `battery_below_min_answered` on master-form enumerator rows now (13-73 AC1) — that `reason` means "the labour battery was not measured", NOT "the heuristic did not run"; `analyzedBatteries` still says what it measured.

The "pass 2 UNBLOCKED" line is written by the session that deploys 13-73 and applies the restore (13-73 R8) — not before. ⚠️ **Ruled by Awwal 2026-09-24:** because the trial is paused, R8 is discharged by TWO deliberate re-scores — one of the 78 unrecoverable orphans (must store `no_form_schema`) and one of the 204 restored rows (must store a real floor, no reason). Those two rows are effectively pass 2's first rows; the sequence is 13-73's "Post-deploy sequence — for adjudication".

### The measured baseline (2026-09-18, read-only against prod `5c4cc93`) — RE-MEASURE BEFORE RUNNING

| | |
|---|---|
| Unscored, all time | **403** (371 public — every public submission ever — + 32 enumerator) |
| Unscored in the R-A8 window (≥ 2026-09-05) | **58** (32 enumerator + 26 public) |
| Per day | 09-06 ×1, 09-07 ×3, 09-09 ×1, 09-12 ×1, 09-15 ×17, 09-16 ×19, 09-17 ×11, **09-18 ×5** |
| Submissions already holding >1 detection | **0** |
| Unscored rows that are `rolled_back` | **0** (statuses: active 366, nin_unavailable 31, pending_nin_capture 4) |
| Unscored rows with `respondent_id = NULL` | **2** |
| Window rows referencing a LIVE form | **58 of 58** |
| All-time rows referencing a DELETED form | **292** (all public) |

⚠️ The brief that started 13-69 said "~50". It was 58 four days later and five arrived during the review. That is the whole reason AC1 exists.

### The scope question the PM must rule on — 58, or 403?

⭐ **SM recommendation, carried from 13-69's Handover §C: 403 in two passes, the 58 first.** Pass 1 unblocks R-A8 and is small enough to inspect by hand. Pass 2 then closes the five-month hole in the public half of the register, at the cost of one more run of the same script. **The counter-argument, stated fairly:** public rows reach only `timing` (and `speed` for the 55% that carry a completion time — 13-69 R7), so pass 2 buys thin data. That trade-off is the PM's call, not the runner's, and pass 2 is blocked on 13-73 either way.

### Risks

- **R-a — Volume against a 2 GB box.** 58 is nothing; 345 is a different question (AC6). The worker is in-process.
- **R-b — The window keeps growing** until 13-69 deploys. The earlier this runs after that deploy, the smaller it is.
- **R-c — A re-enqueue can write a SECOND detection row** if dedup is skipped: `submission_id` is a plain index and the queue's `jobId` dedup expires after 100 completions (13-69 R2).
- **R-d — Reading the results as field truth.** Straight-lining cannot score and duplicate is dead for public/clerk rows. The distribution is an input to calibration, not a finding about enumerators.

### Out of scope — do NOT widen

- **Threshold changes** → R-A8. This story produces R-A8's input; it does not tune anything.
- **Pass 2** → AC9, blocked on 13-73.
- **Any change to the engine, the heuristics or the queue** → AC10; that is 13-73's territory.
- **Import rows** → already scored on the import registry.

### Project Structure Notes

- `scripts/` — ONE new operator script. No new directories. ⚠️ Outside `tsconfig`: RUN it, do not type-check it.
- `docs/runbooks/backfill-operator-residuals.md` — add this run to the operator ledger, in the same shape as the existing entries.
- ⛔ NOT touched: `apps/api/src/services/fraud-engine.service.ts`, `fraud-heuristics/*`, `queues/fraud-detection.queue.ts`, `workers/fraud-detection.worker.ts`.

### References

- [Source: _bmad-output/implementation-artifacts/13-69-fraud-engine-is-dark.md → Residuals R1/R2, "Prod ground truth", Handover §C "Story A"] — every number above.
- [Source: apps/api/src/queues/fraud-detection.queue.ts:14-19,24-25,57] — `FraudDetectionJobData` (`respondentId: string`), `removeOnComplete: 100`, `jobId = fraud-<submissionId>`.
- [Source: apps/api/src/workers/fraud-detection.worker.ts] — the status gate and `concurrency: 4`.
- [Source: apps/api/src/db/schema/respondents.ts:110-112] — `PIPELINE_EXCLUDED_STATUSES` = `['rolled_back']` only.
- [Source: docs/runbooks/backfill-operator-residuals.md] — the dry-run → apply → re-probe discipline this script mirrors.
- [Source: _bmad-output/project-context.md → A12] — a live number carries its date and query.

### How to run the things this story asks for

- **Read-only prod measurement** (Tasks 1, 3.3): `ssh root@100.93.100.28` → `docker exec -e PGOPTIONS='-c default_transaction_read_only=on' oslsr-postgres psql -U oslsr_user -d oslsr_db -X -q -c "…"`. Read-only is enforced by Postgres, not by intention.
- **The apply step is NOT read-only** and is an adjudication/operator action — the dev agent prepares and dry-runs it; it is not applied from a dev session.
- **`pnpm`, never `npx`.** ESM throughout.

### Project context

`_bmad-output/project-context.md` applies unchanged — **A12** (dated numbers) is load-bearing for AC1, and **A13** (a task blocked on a measurement records the attempt) applies to every count in this story.

## Dev Agent Record

### Agent Model Used

_(dev-story fills this in)_

### Debug Log References

### Completion Notes List

### File List

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-09-18 | Authored via canonical `*create-story` (yolo) as "Story A" of 13-69's Handover §C, with the measured baseline carried in and pass 2 explicitly withheld. | R-A8 calibrates against detection data; the trial cohort's own traffic is the only field evidence this project has, and it is unscored. The two-pass split is evidence, not preference: 58 of 58 window rows reference a live form, 292 of the rest do not. |

### Review Follow-ups (AI)

_(placeholder — populated by the adversarial code-review agent)_

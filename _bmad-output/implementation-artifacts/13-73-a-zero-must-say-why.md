# Story 13.73: A zero must say why — close the silent-zero class in the fraud engine

Status: ready-for-dev

<!--
Authored 2026-09-18 by Bob (SM) via the canonical *create-story workflow, yolo.
This is "Story B" of 13-69's Handover §C, now a real story with a board position.

SOURCE OF SCOPE: _bmad-output/implementation-artifacts/13-69-fraud-engine-is-dark.md
  → Residuals R5, R8, R9; Handover §C "Story B"; the §F ledger's closing observation.

⛔ SEQUENCE:
     13-69 (deployed) → 13-72 PASS 1 → R-A8
                        13-72 PASS 2 ← BLOCKED ON THIS STORY
  Pass 2 holds 292 rows whose form row was deleted. Until `speed_run` says so
  instead of silently using a 60-second floor, scoring them writes numbers that
  look like data. THIS STORY IS THAT UNBLOCK.

⭐ THE CONTRACT TEST ALREADY EXISTS AND WILL TELL YOU WHEN YOU ARE DONE.
`apps/api/src/services/fraud-heuristics/__tests__/heuristic-self-description.contract.test.ts`
(shipped with 13-69, test-only) pins R5 and R8 as explicit violations. Those pins GO
RED when you fix them — by design. The fix is to move each heuristic out of the
violations block and into the contract sweep above it, so the violation count can
only shrink.
-->

## Story

As **the reviewer who has to tell "measured and clean" from "never measurable"**,
I want **every detector to report either a computed result or a reason it could not compute, and the schema a submission was answered against to survive the form being deleted**,
so that **a zero in `fraud_detections` means something — instead of the five-costumed silence that made 13-69 necessary and then reappeared four more times in the week after it shipped.**

## Acceptance Criteria

1. **AC1 — `straight_lining` names an under-answered battery instead of dropping it silently.** When `batteryCount > 0` but a battery has fewer than `straightline_min_battery_size` ANSWERED questions, the details carry a `reason` (suggested: `battery_below_min_answered`) with the counts that produced it. ⛔ Today it `continue`s with no marker, so `analyzedBatteries: 0` is indistinguishable from a clean measurement — and on the master form that discards the labour battery, which is the one a real straight-liner would trip (13-69 R5).

2. **AC2 — `speed_run` says when it is guessing.** When `formSchema` is null, `calculateTheoreticalMinimum` returns a 60-second floor; the details must record that the schema was absent (suggested: `reason: 'no_form_schema'`, alongside the existing `referenceType`). **293 live rows resolve to a null schema** — 283 whose form row was deleted plus the `self-edit` (8) and `no-form-pinned-at-submit` (2) sentinels — so the marker must key on **"schema is null"**, never on "the form was deleted" (13-69 R8).

3. **AC3 — The contract test's violations block shrinks to empty.** The two pins in `heuristic-self-description.contract.test.ts` are removed and their heuristics promoted into the contract sweep. ⛔ Do not weaken the sweep to make this pass; the sweep is the deliverable.

4. **AC4 — A form that any submission references CANNOT be deleted.** `QuestionnaireService.deleteForm` currently permits deleting any `draft` OR `archived` form — and archiving is exactly what a superseded form gets, which is the mechanism that orphaned 283 submissions across 5 form ids. Add a referencing-submission check with an actionable error. ⚠️ **Measured: by 2026-07-01 a form behind 73 live submissions had already been deleted while submissions were still arriving against it.** This is the pattern, not an accident.

5. **AC5 — The form identity is SNAPSHOT onto the submission, so deletion can never destroy interpretability again.** New nullable `form_id_logical` + `form_version` on `submissions`, written at insert by the ingestion worker and the wizard from the form being rendered. ⭐ **This is the class-ender:** AC4 stops the bleeding, AC5 removes the wound — the form row is currently the ONLY copy of what a submission was answered against. ⛔ NOT retroactive; existing rows still need AC2's marker.

6. **AC6 — The two recoverable form schemas are restored as `archived`, not `published`.** Verified present in the encrypted backups on 2026-09-18: `019f8ed3-e518-…` (`oslsr_public_core_v1` `pubcore-2`, 6 sections / 25 questions / 0 geopoint) in `monthly/2026-08`, covering **204** orphaned rows; and `019d7d40-d3a8-…` (`oslsr_master_v3` `v2026012601`, 7 sections / 39 questions / 1 geopoint) in `monthly/2026-05`, covering **1**. ⛔ **`archived`, never `published`** — restoring them as published would put two retired forms back on every form list. The other **78** are absent from every surviving monthly and are gone for good; they keep AC2's marker.

7. **AC7 — `duplicate_response` stops treating every geopoint as identical.** `calculateFieldMatchRatio` compares with `String(a[key] ?? '')`, so any object answer renders `"[object Object]"` and two DIFFERENT locations compare EQUAL. ⚠️ **13-71 makes this universal** — once every enumerator submission carries coordinates, every pair gains one free matching field, biasing `maxMatchRatio` upward on the exact channel R-A8 calibrates against. ⛔ Do NOT fix by dropping the key: two interviews at identical coordinates is real duplicate evidence, which `String()` currently destroys. Compare geopoints by rounded lat/long (13-69 R9).

8. **AC8 — No threshold value changes.** This story is about whether detectors CAN report honestly, not about what they fire at — that is R-A8. `git diff` on `fraud-thresholds.seed.ts` is empty at close.

9. **AC9 — Every change is proven by MUTATION, not by assertion.** For each new marker, remove it and show the contract test reds; restore and show it greens. Record the observed output, not the intention [[pattern-test-that-passes-over-a-hole]].

10. **AC10 — 13-72's pass 2 is explicitly unblocked in the record** when this ships: both stories' Dev Notes and `sprint-status.yaml` say so, with the date.

## Tasks / Subtasks

- [ ] **Task 1 — Read the contract before changing the heuristics** (AC: #1, #2, #3, #9)
  - [ ] 1.1 Read `heuristic-self-description.contract.test.ts` end to end — the property, the `EVIDENCE_OF` registry guard, and the two violation pins. It is the spec for AC1-AC3 and it already fails correctly when a marker is removed (verified by mutation at authorship).
  - [ ] 1.2 Record what each violation pin asserts TODAY, so the diff after the fix is legible.

- [ ] **Task 2 — The two markers** (AC: #1, #2, #3, #9)
  - [ ] 2.1 `straight_lining`: emit the reason on the under-answered path, keeping `batteryCount` / `analyzedBatteries` [Source: apps/api/src/services/fraud-heuristics/straight-lining.heuristic.ts:146-153 and the `continue` above it].
  - [ ] 2.2 `speed_run`: record the absent schema [Source: apps/api/src/services/fraud-heuristics/speed-run.heuristic.ts:80-118 + `calculateTheoreticalMinimum`'s `if (!formSchema) return 60`].
  - [ ] 2.3 Promote both out of the contract test's violations block into the sweep; the block ends empty (AC3).
  - [ ] 2.4 Mutation-verify each marker (AC9).
  - [ ] 2.5 ⚠️ Check the existing heuristic unit tests that pin the CURRENT shapes and update them deliberately, naming this story — they are not obstacles, they are the old decision.

- [ ] **Task 3 — Stop the bleeding: the delete guard** (AC: #4)
  - [ ] 3.1 Add the referencing-submission check to `deleteForm` with an actionable error [Source: apps/api/src/services/questionnaire.service.ts:465-495].
  - [ ] 3.2 Test both directions: a form with submissions cannot be deleted; a form with none still can.
  - [ ] 3.3 ⚠️ `submissions.questionnaire_form_id` is TEXT (it holds sentinels like `import:<source>`, `self-edit`), so this is a text comparison, NOT a new foreign key — a FK would break the sentinels.

- [ ] **Task 4 — End the class: snapshot the form identity** (AC: #5)
  - [ ] 4.1 Add nullable `form_id_logical` + `form_version` to `submissions` [Source: apps/api/src/db/schema/submissions.ts].
  - [ ] 4.2 Write them at insert in `webhook-ingestion.worker.ts` (enumerator/clerk) and in the wizard's transaction (`registration.controller.ts`).
  - [ ] 4.3 Real-DB test: both survive on the stored row, read back FROM THE COLUMNS.
  - [ ] 4.4 Record explicitly that existing rows are NOT back-filled and why (the schema they were answered against is what is missing, and only 205 of it is recoverable).

- [ ] **Task 5 — Restore the two recoverable schemas** (AC: #6)
  - [ ] 5.1 Extract both rows from the backups (method + exact objects in 13-69 R8's recovery section: stream `GetObject` → `createDecipheriv` with the manifest's IV/auth tag → `gunzip` → the `COPY public.questionnaire_forms` block). ⚠️ `restore-backup.ts --dry-run` does NOT download the dump — it validates the manifest only.
  - [ ] 5.2 Insert as `status = 'archived'` with their original ids. ⛔ This is a prod WRITE — prepared and dry-run by dev, applied by adjudication/operator.
  - [ ] 5.3 Verify: the 205 rows now resolve a schema; the forms do NOT appear on any form list; spot-check one submission through the engine and confirm `speed_run` uses a real floor rather than 60.

- [ ] **Task 6 — The duplicate comparison** (AC: #7, #9)
  - [ ] 6.1 Compare geopoint answers by rounded coordinates rather than by `String()` identity [Source: apps/api/src/services/fraud-heuristics/duplicate-response.heuristic.ts:24-40].
  - [ ] 6.2 Test both ways round: two different locations no longer match; two identical ones still do (that is evidence, and it must survive the fix).
  - [ ] 6.3 ⚠️ Coordinate with 13-71 — if it has shipped, every enumerator submission carries a geopoint and this changes real scores; say so with a number.

- [ ] **Task 7 — Gates, run yourself, quoted whole** (AC: all)
  - [ ] 7.1 `pnpm tsc --noEmit`; api lint + the 3 drift guards. Web unaffected unless Task 4.2 touches it — check, do not assume.
  - [ ] 7.2 FULL api suite from `apps/api` against `app_test`; quote the SUITE total [[feedback-quote-the-suite-total-never-a-subset]]; explain every delta.

- [ ] **Task 8 — Unblock 13-72 pass 2 in the record** (AC: #10)
  - [ ] 8.1 Update both stories' Dev Notes and `sprint-status.yaml` with the date and what changed.

## Dev Notes

### Why one story and not four patches

13-69's review found the same defect five times in a week: straight-lining drops a battery silently; speed measures against a 60-second floor and says nothing; a refused GPS permission is indistinguishable from one never attempted (13-71); `String()` flattens two different coordinates into one match; and 293 rows lost the schema that would explain any of it. **They are one class — a zero that cannot say why it is zero — and the contract test that already ships with 13-69 is the structural answer.** This story is the work that makes the contract hold.

### The measured facts (2026-09-18, read-only against prod `5c4cc93`) — re-measure before building (A12)

| | |
|---|---|
| Submissions referencing a DELETED form row | **283** (282 public + 1 enumerator), across **5** form ids |
| …largest single orphan | **204** rows on `019f8ed3-e518-…` — the row 13-34 recorded as prod |
| Plus sentinel rows with no schema | **10** (`self-edit` 8, `no-form-pinned-at-submit` 2) |
| **Total rows needing AC2's marker** | **293** |
| Recoverable from backups | **205** (204 + 1) — verified present, schemas parse |
| Gone for good | **78** — absent from every surviving monthly |
| `questionnaire_forms` rows today | **2**, both created 2026-08-24 |

⚠️ **The 78 are unrecoverable because `monthly/2026-06` does not exist** — the promotion failed once (encryption-blind keys after backup encryption shipped), was fixed by 9-35 on 2026-06-23, and that month's gap was already recorded as permanent. Promotions on 07-01, 08-01 and 09-01 all succeeded. Nothing is owed there; it is simply why the number is 205 and not 283.

### Risks

- **R-a — The existing heuristic tests pin the CURRENT shapes.** Updating them is correct and must be deliberate and named (Task 2.5); silently rewriting an assertion to match new output is how a regression ships.
- **R-b — AC7 changes real scores** once 13-71 lands. Quantify before and after rather than asserting "small".
- **R-c — Task 5 is a prod write.** Dev prepares and dry-runs; adjudication/operator applies. Restoring as `published` instead of `archived` would surface two retired forms to every user.
- **R-d — AC5 is a schema change**: new columns must land via `db:push` on deploy, and `app_test` kept current locally.
- **R-e — Scope gravity.** This story sits next to R-A8 and will attract threshold talk. AC8 is the fence: honesty here, calibration there.

### Out of scope — do NOT widen

- **Any threshold value** → R-A8 (AC8).
- **Whether straight-lining is viable on the master form at all** → a form-content question (13-34's territory) and a PM ruling. ⭐ SM recommendation: ship the markers first, then decide with a week of real `*_details` to look at rather than in the abstract.
- **Back-filling `form_id_logical` onto existing rows** → the schema itself is what is missing (AC5.4).
- **13-72's passes** → that story; this one only unblocks pass 2.

### Project Structure Notes

No new directories.

- `apps/api/src/services/fraud-heuristics/straight-lining.heuristic.ts`, `speed-run.heuristic.ts`, `duplicate-response.heuristic.ts` — the three markers/comparison.
- `apps/api/src/services/fraud-heuristics/__tests__/heuristic-self-description.contract.test.ts` — violations block → empty.
- `apps/api/src/services/questionnaire.service.ts` — the delete guard.
- `apps/api/src/db/schema/submissions.ts`, `workers/webhook-ingestion.worker.ts`, `controllers/registration.controller.ts` — the snapshot columns.
- `scripts/` — the form-restore helper (Task 5), if written. ⚠️ Outside `tsconfig`: RUN it, do not type-check it.
- ⛔ NOT touched: `fraud-thresholds.seed.ts` (AC8), `fraud-engine.service.ts`'s registries or composite rescale.

### References

- [Source: _bmad-output/implementation-artifacts/13-69-fraud-engine-is-dark.md → R5, R8 (+ its recovery table and method), R9, Handover §C "Story B", §F ledger] — every number and every mechanism above.
- [Source: apps/api/src/services/fraud-heuristics/__tests__/heuristic-self-description.contract.test.ts] — the contract, the registry guard, and the two pins this story removes.
- [Source: apps/api/src/services/fraud-heuristics/straight-lining.heuristic.ts:146-153] — `no_batteries_found`, and the silent `continue` above it.
- [Source: apps/api/src/services/fraud-heuristics/speed-run.heuristic.ts:80-118] — `no_completion_time`, `invalid_reference_time`, and the 60s fallback.
- [Source: apps/api/src/services/fraud-heuristics/duplicate-response.heuristic.ts:24-40] — `String()` field comparison.
- [Source: apps/api/src/services/questionnaire.service.ts:465-495] — `deleteForm` permitting `draft` OR `archived`.
- [Source: apps/api/src/services/fraud-engine.service.ts:273-282] — the `looksLikeUuid` guard that keeps sentinels from throwing (why AC2 keys on "schema is null").
- [Source: _bmad-output/implementation-artifacts/9-35-backup-monthly-promotion-enc-suffix-fix.md] — why `monthly/2026-06` is permanently absent.
- [Source: _bmad-output/project-context.md → A14] — a detector must say which kind of zero it is; this story is A14 applied.

### How to run the things this story asks for

- **Tests from `apps/api`, never the repo root** [[pitfall-vitest-from-repo-root-skips-mockreset]]; real-DB tests against `app_test` with `beforeAll`/`afterAll` and a run-unique tag.
- **After the schema change**: `DATABASE_URL=…/app_test pnpm --filter @oslsr/api db:push:full:force`.
- **Backup extraction (Task 5)** — the exact streaming recipe is in 13-69 R8's recovery section; it runs ON the VPS and writes nothing.
- **`pnpm`, never `npx`.** ESM throughout.

### Project context

`_bmad-output/project-context.md` applies unchanged — this story is **A14** made true in code, and **A12** governs every number in it.

## Dev Agent Record

### Agent Model Used

_(dev-story fills this in)_

### Debug Log References

### Completion Notes List

### File List

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-09-18 | Authored via canonical `*create-story` (yolo) as "Story B" of 13-69's Handover §C, folding in R5, R8 (markers + delete guard + the 205-row restore + the form-identity snapshot) and R9. | Five instances of one defect in a week. The contract test shipped with 13-69 states the property; this story makes the engine satisfy it, and unblocks 13-72's pass 2, which would otherwise score 292 rows against a 60-second floor. |

### Review Follow-ups (AI)

_(placeholder — populated by the adversarial code-review agent)_

# Story 13.73: A zero must say why — close the silent-zero class in the fraud engine

Status: review

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

7. ~~**AC7 — `duplicate_response` stops treating every geopoint as identical.**~~ ➡️ **MOVED TO STORY 13-71 AS ITS AC12 — RULED BY AWWAL, 2026-09-20: *"fix it once with 13-71"*.** ⭐ TWO-PART ATTRIBUTION (§2al): evidence and recommendation by adjudication; ruling by Awwal. **Why it moved:** 13-71 is what CREATES the exposure — today only 4 of 35 enumerator submissions carry coordinates so few pairs both hold a geopoint, but the moment 13-71's requirement takes effect every enumerator pair gains one free matching field and `maxMatchRatio` is biased upward on the exact channel R-A8 calibrates against. A defect a story creates should be closed by that story, not by the next one. ⛔ **DO NOT IMPLEMENT IT HERE** — check whether 13-71 has shipped it; if it has, this AC is satisfied by construction and Task 6 is a no-op. If 13-71 was descoped without it, re-open this AC rather than assuming. ⚠️ **Nothing else in this story depends on it:** the contract test's violations block pins **R5 and R8 only** (verified 2026-09-20 — `heuristic-self-description.contract.test.ts:162`), so **AC3 is unaffected**, and R9 was never one of its pins.

8. **AC8 — No threshold value changes.** This story is about whether detectors CAN report honestly, not about what they fire at — that is R-A8. `git diff` on `fraud-thresholds.seed.ts` is empty at close.

9. **AC9 — Every change is proven by MUTATION, not by assertion.** For each new marker, remove it and show the contract test reds; restore and show it greens. Record the observed output, not the intention [[pattern-test-that-passes-over-a-hole]].

10. **AC10 — 13-72's pass 2 is explicitly unblocked in the record** when this ships: both stories' Dev Notes and `sprint-status.yaml` say so, with the date.

## Tasks / Subtasks

- [x] **Task 1 — Read the contract before changing the heuristics** (AC: #1, #2, #3, #9)
  - [x] 1.1 Read `heuristic-self-description.contract.test.ts` end to end — the property, the `EVIDENCE_OF` registry guard, and the two violation pins. It is the spec for AC1-AC3 and it already fails correctly when a marker is removed (verified by mutation at authorship).
  - [x] 1.2 Record what each violation pin asserts TODAY, so the diff after the fix is legible.

- [x] **Task 2 — The two markers** (AC: #1, #2, #3, #9)
  - [x] 2.1 `straight_lining`: emit the reason on the under-answered path, keeping `batteryCount` / `analyzedBatteries` [Source: apps/api/src/services/fraud-heuristics/straight-lining.heuristic.ts:146-153 and the `continue` above it].
  - [x] 2.2 `speed_run`: record the absent schema [Source: apps/api/src/services/fraud-heuristics/speed-run.heuristic.ts:80-118 + `calculateTheoreticalMinimum`'s `if (!formSchema) return 60`].
  - [x] 2.3 Promote both out of the contract test's violations block into the sweep; the block ends empty (AC3).
  - [x] 2.4 Mutation-verify each marker (AC9).
  - [x] 2.5 ⚠️ Check the existing heuristic unit tests that pin the CURRENT shapes and update them deliberately, naming this story — they are not obstacles, they are the old decision.

- [x] **Task 3 — Stop the bleeding: the delete guard** (AC: #4)
  - [x] 3.1 Add the referencing-submission check to `deleteForm` with an actionable error [Source: apps/api/src/services/questionnaire.service.ts:465-495].
  - [x] 3.2 Test both directions: a form with submissions cannot be deleted; a form with none still can.
  - [x] 3.3 ⚠️ `submissions.questionnaire_form_id` is TEXT (it holds sentinels like `import:<source>`, `self-edit`), so this is a text comparison, NOT a new foreign key — a FK would break the sentinels.

- [x] **Task 4 — End the class: snapshot the form identity** (AC: #5)
  - [x] 4.1 Add nullable `form_id_logical` + `form_version` to `submissions` [Source: apps/api/src/db/schema/submissions.ts].
  - [x] 4.2 Write them at insert in `webhook-ingestion.worker.ts` (enumerator/clerk) and in the wizard's transaction (`registration.controller.ts`).
  - [x] 4.3 Real-DB test: both survive on the stored row, read back FROM THE COLUMNS.
  - [x] 4.4 Record explicitly that existing rows are NOT back-filled and why (the schema they were answered against is what is missing, and only 205 of it is recoverable).

- [ ] **Task 5 — Restore the two recoverable schemas** (AC: #6)
  - [x] 5.1 Extract both rows from the backups (method + exact objects in 13-69 R8's recovery section: stream `GetObject` → `createDecipheriv` with the manifest's IV/auth tag → `gunzip` → the `COPY public.questionnaire_forms` block). ⚠️ `restore-backup.ts --dry-run` does NOT download the dump — it validates the manifest only.
  - [ ] 5.2 Insert as `status = 'archived'` with their original ids. ⛔ This is a prod WRITE — prepared and dry-run by dev, applied by adjudication/operator. ⏳ **Dev half DONE 2026-09-24 (prepared, dry-run on prod read-only, rehearsed on a scratch DB); the APPLY is outstanding and is not dev's — R1, and which ids is R2.**
  - [ ] 5.3 ⏳ **Rehearsed on a scratch DB 2026-09-24 (see Completion Notes §AC6); the PROD verification runs after the apply — R1.** Verify: the 205 rows now resolve a schema; the forms do NOT appear on any form list; spot-check one submission through the engine and confirm `speed_run` uses a real floor rather than 60.

- [x] ~~**Task 6 — The duplicate comparison** (AC: #7, #9)~~ ➡️ **MOVED TO 13-71 (its Task 6b), ruled by Awwal 2026-09-20.** ⛔ Do not do this work here. **Verify first, do not assume:** confirm 13-71 shipped it — `grep -n "String(" apps/api/src/services/fraud-heuristics/duplicate-response.heuristic.ts` should no longer show the geopoint comparison path — and record what you found. If 13-71 shipped WITHOUT it, un-tick this box and do it here.
  - [ ] ~~6.1 Compare geopoint answers by rounded coordinates rather than by `String()` identity [Source: apps/api/src/services/fraud-heuristics/duplicate-response.heuristic.ts:24-40].~~ (moved)
  - [x] 6.2 ➡️ (13-71) Test both ways round: two different locations no longer match; two identical ones still do (that is evidence, and it must survive the fix).
  - [x] 6.3 ➡️ (13-71) ⚠️ Coordinate with 13-71 — if it has shipped, every enumerator submission carries a geopoint and this changes real scores; say so with a number.

- [x] **Task 7 — Gates, run yourself, quoted whole** (AC: all)
  - [x] 7.1 `pnpm tsc --noEmit`; api lint + the 3 drift guards. Web unaffected unless Task 4.2 touches it — check, do not assume.
  - [x] 7.2 FULL api suite from `apps/api` against `app_test`; quote the SUITE total [[feedback-quote-the-suite-total-never-a-subset]]; explain every delta.

- [x] **Task 8 — Unblock 13-72 pass 2 in the record** (AC: #10)
  - [x] 8.1 ⏳ (recorded as NOT YET unblocked, dated 2026-09-24 — the "unblocked" line is R8, at deploy) Update both stories' Dev Notes and `sprint-status.yaml` with the date and what changed.

## Dev Notes

### ⏳ 13-72 pass 2 — NOT YET unblocked (AC10, recorded 2026-09-24 by dev-story)

This story's code is written, tested and in review, uncommitted. Pass 2 is unblocked only when it is DEPLOYED (the `no_form_schema` marker scoring on prod) AND the AC6 restore is APPLIED (R1) — 13-72's AC9 names both. Until then 13-72's Dev Notes and `sprint-status.yaml` say "not yet", with today's re-measured numbers (282 orphaned rows / 204 recoverable / 88 marked). The "unblocked" line is R8, written by the deploy session.

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

Claude Opus 5.5 (`claude-opus-5-5`), dev-story, 2026-09-24. Uncommitted by instruction — handed to adversarial code review, then adjudication.

### Debug Log References

- **Prod measurement, read-only (`BEGIN TRANSACTION READ ONLY … ROLLBACK`), 2026-09-24, prod HEAD `7b13ec3`** — via `ssh root@oslsr-home-app` → `docker exec oslsr-postgres psql`. Raw output kept in the dev session scratchpad (`measure-2026-09-24.txt`).
- **Contract RED (before the fix), observed:** `under-answered battery` → `straight_lining → {"batteryCount":1,"analyzedBatteries":0,…}` (no reason); `schema ABSENT` → `speed_run → {"completionTimeSeconds":800,"referenceTime":60,"referenceType":"theoretical_minimum",…}` (no reason). 2 failed / 4 passed. Each failed on exactly the heuristic it names; the non-vacuity assertion (both schema readers detected as schema-dependent) PASSED.
- **AC6 dry-run logs** (`13-73-restore-both.log`, `13-73-restore-019f8ed3-only.log`) and the emitted SQL (`13-73-restore-both.sql`, sha256 `11efa7723879dfac…`; `13-73-restore-019f8ed3-only.sql`, sha256 `a9ac8607a8ed5e3e…`) are in the dev session scratchpad. ⚠️ They are REGENERATED, not copied, by whoever applies: re-run the script on the day (A12) — the counts in the SQL comments are live reads.

### Completion Notes List

#### ⚠️ The story's numbers, re-measured 2026-09-24 (A12: value + date + how — read-only psql on prod `7b13ec3`)

| | Story (2026-09-18) | **2026-09-24** |
|---|---|---|
| Submissions on a DELETED form row | 283 across **5** ids (282 public + 1 enumerator) | **282 across 4 ids, all public** — `019f8ed3` 204 · `019e24ef-9617` 73 · `019e24ef-9629` 3 · `019f48c2` 2 |
| Sentinel rows with no schema | 10 (`self-edit` 8, `no-form-pinned-at-submit` 2) | **10** (unchanged) |
| **Rows that carry AC2's marker when scored** | 293 | **292** |
| Recoverable from backups | 205 (204 + 1) | **204** — `019d7d40` now has **0** referencing rows (R2, R3) |
| `questionnaire_forms` rows | 2, both 2026-08-24 | **2** — `oslsr_public_core_v1` **1.0.1** (89 subs), `oslsr_master_v3` **2026072301** (39 subs) |
| Total submissions / latest | — | 8,698 / 2026-09-22 10:46 UTC (the trial is paused; 8,278 are `import:` sentinels) |

⛔ **The one enumerator submission on `019d7d40` is GONE, and nothing recorded its going.** Present 2026-09-18 (13-69 R8), absent 2026-09-24; `audit_logs` holds no delete/teardown/submissions action since 2026-09-18. → **R3.**

#### AC1 + AC2 + AC3 — the markers, and the contract they satisfy

- **`straight_lining` (AC1):** every under-answered battery is recorded in `skippedBatteries: [{ sectionId, questionCount, answered }]`, and `reason: 'battery_below_min_answered'` is set whenever ANY battery was dropped. Invariant: `batteryCount === analyzedBatteries + skippedBatteries.length`. ⚠️ **Deliberate choice, flag it in review:** the reason is set on a PARTIAL drop too, not only on total loss — the prod row that proved R5 analysed 1 of 2, and a reason present only when all batteries drop would hide exactly that row from a `GROUP BY details->>'reason'`. Consequence: on this heuristic a `reason` no longer means "did not measure"; the analysed batteries still score. Checked: **no code or query in the repo gates on `details.reason`** (grep of `apps/`, `scripts/`, `docs/` for `_details->>'reason'` and `.reason` on fraud details — only tests read it).
- **`speed_run` (AC2):** `reason: 'no_form_schema'` when the theoretical-minimum branch runs with `formSchema == null`. Keyed on the NULL SCHEMA, never on "the form was deleted" — proven on the STORED row for both shapes (a deleted-form uuid and the `self-edit` sentinel). Not set on an empirical-median reference (it never consults the schema). **The score is kept** (AC8): the marker labels the number, it does not void it.
- **The contract (AC3):** the violations block is EMPTY — kept as a counted comment so the next violation has somewhere to be pinned. R5 is promoted as a sweep context (under-answered battery). R8 needed a STRONGER clause, because `speed_run` always passed "describes itself" (it reports a `tier`): **run every heuristic with and without the schema; any whose details differ is schema-dependent BY OBSERVATION and must carry a reason when the schema is absent.** Behavioural, not a declared list — a future heuristic that starts reading `formSchema` is enrolled by doing so. A non-vacuity assertion proves both of today's readers are detected. ⛔ The sweep was not weakened; two clauses were added.
- **Task 2.5 — tests that pinned the OLD decision, changed deliberately and named:** the three `not.toHaveProperty('reason')` assertions on `straightline_details` in `fraud-engine.ungated-coverage.integration.test.ts` (13-69's H1 test now asserts the labour battery is NAMED; the two reachability assertions were narrowed to what they always meant — "not `no_batteries_found`, ≥1 battery analysed"). The unit tests for both heuristics assert single keys, so none pinned a whole `details` object.

#### AC9 — mutation proof, OBSERVED output

| Mutation | Contract result | Restored |
|---|---|---|
| delete the `straight_lining` reason spread | `× describes itself when a battery is FOUND but under-answered` — 1 failed / 5 passed | 6/6 ✓ |
| delete `if (formSchema == null) reason = 'no_form_schema'` | `× says so when the form schema is ABSENT…` — 1 failed / 5 passed | 6/6 ✓ |
| AC4: guard condition → `if (false as boolean)` | `× refuses an ARCHIVED form…`, `× refuses a DRAFT form…` — 2 failed / 1 passed (the unreferenced-delete control stayed green) | 28/28 ✓ |
| AC5: drop `formIdLogical, formVersion` from the worker insert | `× snapshots the identity, and it SURVIVES the form row being deleted` — 1 failed / 7 passed | 8/8 ✓ |

Each mutation reds exactly its own clause and nothing else. Mutations were scripted with a match-count assertion (exactly one occurrence) and restored from a byte copy; `git diff --stat` confirmed the restore.

#### AC4 — the delete guard

`deleteForm` now locks the form row (`FOR UPDATE`), counts `submissions.questionnaire_form_id = id` (TEXT comparison — no FK, sentinels live in that column), and refuses with `409 FORM_HAS_SUBMISSIONS` + `{ submissionCount, currentStatus }`. RED observed first: both refusal tests failed because the delete SUCCEEDED (the bug, reproduced on the archived path `published → deprecated → archived`). The web delete toast shows the API's top-level `message` (`app.ts` error handler → `apiClient` → `useDeleteQuestionnaire.onError`), so no web change was needed. ⚠️ Residual race window → R6.

#### AC5 — the snapshot (`form_id_logical`, `form_version`)

- `apps/api/src/services/form-identity.ts` — one helper, UUID-guarded, reads through `db` (NOT the caller's `tx`: a failed query inside a PG transaction aborts it, and provenance must never sink a registration), fail-OPEN with a logged warn (`form_identity.form_row_missing` / `form_identity.snapshot_failed`).
- **Census of submission producers, not the story's list of two** [[pattern-census-counts-sites-not-callers]]: six production `insert(submissions)` sites. Three write a REAL form id and now snapshot — the ingestion worker, the wizard (`registration.controller.ts` ~1085), and **draft-adoption (`adopt.ts`) — not in the story's list, found by the census; it writes the pinned `wizard.public_form_id`**. Three write sentinels and correctly leave both columns null — `me.service` (`self-edit`), the supplemental survey, the importer (`import:<source>`).
- **Proof:** real-DB, read back BY COLUMN, through the worker — including the decisive case: snapshot, DELETE the form row, and read the identity back from the submission alone. Wizard and adoption are proven by mocked-insert assertions that the helper is called with the bound form id and its output reaches the insert values → R7.
- **4.4 — NOT back-filled, deliberately:** all **8,698** existing rows (2026-09-24) keep NULL. The schema they were answered against is what is missing, and only 204 of the 282 orphans are recoverable. AC2's marker is what makes those rows honest.
- `app_test` recreated FRESH and pushed with `db:push:full:force`; the two columns verified nullable `text` via `information_schema`. ⚠️ See R4 for what "fresh" then broke.

#### AC6 — the restore, PREPARED and REHEARSED, not applied

`apps/api/scripts/restore-orphaned-form-schemas.mjs` streams `GetObject → AES-256-GCM decipher → gunzip → the COPY public.questionnaire_forms block`, checks the row's shape against 13-69's record (a mismatch is a STOP), runs preflight checks inside a `READ ONLY` transaction (id free; `(form_id, version)` free; uploader exists for the FK; live referencing count), and PRINTS a one-transaction INSERT forcing `status = 'archived'` with in-transaction post-condition checks. It writes nothing. Run pre-deploy by piping it over ssh into `node --input-type=module -` from `/root/oslrs/apps/api` — nothing copied into the VPS git tree.

Observed on prod 2026-09-24:
- `019f8ed3-e518-7ad9-989a-7b59da8db964` — `monthly/2026-08` (encrypted), **GCM auth tag VERIFIED**, `oslsr_public_core_v1` `pubcore-2`, 6 sections / 25 questions / 0 geopoint (matches 13-69), **204** referencing rows today. No `(form_id, version)` collision (live row is `1.0.1`).
- `019d7d40-d3a8-78a9-850e-f306550cc999` — `monthly/2026-05` (plaintext), `oslsr_master_v3` **`2026012601`**, 7 / 39 / 1 (matches) — but **0** referencing rows today → R2.

Three things the script caught that the record had wrong or could not know:
1. **13-69 wrote the version as `v2026012601`; the backup row says `2026012601`.** The strict shape check STOPPED on it; the expectation was corrected with a comment, the check was not loosened.
2. **A promoted monthly's manifest `s3Key` names the DAILY object it was copied from**, and dailies expire after 7 days → `NoSuchKey`. The object is the monthly copy; the manifest supplies only the IV/auth tag.
3. **Story 9-12 recorded `019d7d40` as holding `form_schema = NULL`** at some point; `monthly/2026-05` holds a full 39-question schema. The backup is the evidence; 9-12's note describes some other moment of that row's life.

⚠️ **I corrected my own reasoning here, on the record.** I first wrote that `.pipe()` would let a bad GCM tag "end cleanly and print VERIFIED". A probe with a one-bit-flipped tag showed otherwise: `.pipe()` raised an UNHANDLED `'error'` event that killed the process; `pipeline` rejected cleanly; the good tag resolved after all 6,000 lines. `pipeline` is still the right shape (handled, stages destroyed, awaited before claiming), and the comment in the script now states what was observed, not what I predicted [[pattern-predict-then-compare]].

**Rehearsal on a scratch DB (`app_test_restore_rehearsal`, HEAD schema via `db:push:full:force`, dropped afterwards):** the emitted SQL applied cleanly; both rows `archived`; the seeded orphan `now_resolving = 1`; **a second apply FAILED loudly** (`duplicate key … questionnaire_forms_pkey`), so a double-restore cannot be silent. **Task 5.3's engine spot-check, run through the real `FraudEngine.evaluate` on that row:**

| Same public submission, 40 s | reference | tier | speed score | marker |
|---|---|---|---|---|
| form row RESTORED | **155 s** (from the schema) | speeder | **12** | — |
| form row ABSENT (prod today) | 60 s (guess) | normal | **0** | `no_form_schema` |

That is 13-72 pass 2's risk in one row: without the restore the zero is labelled; without the marker it would have been read as data.

"Forms do not appear on any form list" — traced, not assumed: every reader of `questionnaire_forms` (`grep` of `from(questionnaireForms)` / `findMany` / raw SQL) — the enumerator/public list filters `status = 'published'` (`native-form.service.ts:401`); the admin management list shows archived forms by design (and AC4 now refuses deleting them). Nothing else lists forms.

#### AC7 — satisfied by construction in 13-71, VERIFIED not assumed

`grep -n "canonicaliseAnswer\|roundCoordinate" apps/api/src/services/fraud-heuristics/duplicate-response.heuristic.ts` → lines 41 (`roundCoordinate`), 119 (`canonicaliseAnswer`), 130 (`geo:${roundCoordinate(latitude)},${roundCoordinate(longitude)}`), 157 (the comparison). Task 6 is a no-op here.

#### AC8 — the fence

`git diff --quiet -- '**/fraud-thresholds.seed.ts'` → **empty** (file exists at `apps/api/src/db/seeds/fraud-thresholds.seed.ts`). No threshold, weight or composite logic touched; the engine's registries untouched.

#### AC10 — recorded as NOT YET, on purpose

Pass 2 is unblocked when the marker is LIVE and the restore is APPLIED (13-72 AC9 names both). Neither is true today — this story is uncommitted. Both stories' records and `sprint-status.yaml` now say exactly that, dated; the "unblocked" line belongs to the deploy session → R8.

#### Gates (run by dev, 2026-09-24, output to files, never the stream)

- `pnpm tsc --noEmit` — api **0**, web **0**.
- `pnpm eslint src scripts` (api) — **0 errors**; 1 warning, pre-existing, in `src/__tests__/auth.activation.test.ts:600` (untouched by this story).
- Drift guards, run DIRECT: registry-read ✅ (414 files) · respondent-write ✅ (414 files) · story-residuals ✅ (329 stories, no expired DATED deferrals).
- **API suite, 4 shards serialised, each to its own file, against `app_test`:** 83 + 83 + 83 + 83 = **332 files** (330 passed, 2 skipped) · 1,309 + 1,017 + 1,155 + 1,255 = **4,736 tests** (4,727 passed, 9 skipped), **0 failed**. Baseline `f06b85a` 331 / 4,714 → **+1 file, +22 tests, predicted exactly before the run:** new `webhook-ingestion.form-identity.integration.test.ts` +8 · `straight-lining.heuristic.test.ts` +3 · `speed-run.heuristic.test.ts` +3 · `fraud-engine.ungated-coverage.integration.test.ts` +3 · `questionnaire.service.test.ts` +3 · `registration.routes.test.ts` +1 · `draft-adoption.adopt.test.ts` +1 · contract test ±0 (2 pins removed, 2 sweep clauses added).
  ⚠️ **Shard 1's FIRST run had 2 failed files** (`fraud-engine.ungated-coverage` — "no `data_entry_clerk` role"; `staff-detail` — "role public_user missing — run db:seed"). Cause: I had recreated `app_test` EMPTY; `pnpm db:seed` restored the roles and the rerun was green. Recorded as R4 rather than hidden behind the rerun.
- **Web suite** (run once free RAM was back above 3 GB — it had fallen to 1.15 GB under other sessions' load, so the run waited rather than gate under contention): **283 files** passed · **3,192 tests** (3,190 passed, 2 todo), 0 failed — **identical to the `f06b85a` baseline**, as expected: no web file changed.

#### Round 2 — the residuals Awwal ratified (2026-09-24, same session, still UNCOMMITTED)

Awwal ruled on all eight after reading dev's recommendations: R1 sequenced, R2 delegated to adjudication, R3 handed to adjudication, **R4 and R5 FIX in this story**, R6 and R7 accept, R8 discharged by two deliberate re-scores. Rulings are recorded in the ledger with two-part attribution; R4/R5 stay OPEN until code review verifies the fixes.

- **R5 fixed** — `no_countable_questions`; a THIRD behavioural contract clause (empty schema ≡ absent schema). RED 4 → GREEN 115/115 → mutation reds exactly the new clause.
- **R4 fixed** — `ensureRoles` helper; the census found **5** files, not 3 (⚠️ code review 2026-09-25: **8** — three `FROM roles LIMIT 1` files were missed; fixed, see R4); RED 5/5 → GREEN 6 files / 63 tests on a DB holding 0 roles.
- ⚠️ **Dev disarmed one of its own ledger rows, and caught it.** R7's state first read "…discharged by the post-deploy read"; the guard upper-cases the state cell, so `DISCHARGED` counted as a closure and R7 silently stopped blocking `done` — the same class as 13-70 R8 (closure vocabulary disarming a row). Found because a probe marking the story `done` returned **6** hits where 7 were expected; reworded; the per-row probe now reads R1–R5, R7, R8 **ARMED**, R6 not open (accepted). For review: `isOpenState(parts[2])` over every row is the check, not the guard's pass line.
- **Gates, round 2 (re-run in full after the fixes):** tsc api **0** · eslint **0 errors** (same pre-existing warning) · registry-read ✅ · respondent-write ✅ · story-residuals ✅. **API suite, 4 shards serialised, each to its own file:** 83 + 83 + 83 + 83 = **332 files** (330 passed, 2 skipped) · 1,309 + 1,017 + 1,159 + 1,255 = **4,740 tests** (4,732 passed, 8 skipped), **0 failed** — **the predicted count exactly** (round 1's 4,736 + R5's 3 unit cases + 1 contract clause; no new test file — the helper is not one). ⚠️ The skip count moved 9 → 8 for a reason unrelated to this story: `auth.activation.test.ts:622` skips itself when S3 is unreachable (`ctx.skip()`); the network was down during round 1 and back for round 2. **Web was not re-run:** round 2 touched no web file, and round 1's 283 / 3,192 stands.

### ⚖️ ADJUDICATION — 2026-09-25

**VERDICT: the work is sound.** Code read before the story's account of it, which is the standing
correction from 13-71. The five mechanisms most able to look fixed while not being fixed all hold:
**AC2** keys on `formSchema == null`, never on "the form was deleted", so the 10 sentinel rows are
covered as well as the 283 orphans · **AC4** permits `draft` AND `archived` then checks referencing
submissions under `FOR UPDATE` · **AC5** is written by ALL THREE producers (worker, wizard,
draft-adoption) — not two of three, which is this repo's most repeated shape · **AC6** hardcodes
`'archived'` AND asserts it in a post-condition inside the transaction · **AC3**'s violations block is
genuinely empty, with zero `violations` references left in the file.

**GATES, run by adjudication:** tsc **0** · eslint **0 problems** · three drift guards DIRECT
**414 / 414 / 329** · **API 332 files / 4,742 tests / 4,734 passed / 8 skipped / 0 failed**, four shards
serialised, each to its own file. Web untouched by this story, so 13-71's 283 / 3,192 stands. The six
unchecked boxes map exactly to the delegated decisions and the post-deploy restore — no hidden debt.

⛔ **SUITE FIGURE CORRECTED, AND THE CAUSE IS A COUNTING METHOD WORTH KNOWING.** This story recorded
**4,736** in the round-2 gate block and **4,740** in the Change Log. The measured figure is **4,742**.
Adjudication accounted the whole delta from the last committed baseline (`f06b85a`, 4,714), file by file:

| file | was | now | Δ |
|---|---|---|---|
| `registration.routes.test.ts` | 65 | 66 | +1 |
| `draft-adoption.adopt.test.ts` | 29 | 30 | +1 |
| `fraud-engine.ungated-coverage.integration.test.ts` | 10 | 13 | +3 |
| `questionnaire.service.test.ts` | 25 | 28 | +3 |
| `heuristic-self-description.contract.test.ts` | 6 | 7 | +1 |
| `speed-run.heuristic.test.ts` | 13 | 19 | +6 |
| `straight-lining.heuristic.test.ts` | 20 | 23 | +3 |
| `webhook-ingestion.form-identity.integration.test.ts` | — | 10 | **+10** (new) |
| | | | **= +28**, and 4,714 + 28 = **4,742** ✅ |

⭐ **THERE IS NO UNRECORDED WORK — the gap was adjudication's own counting error, and the lesson is
mechanical.** A first pass grepped `^\s*(it|test)\(` and got +22, then reported 4 tests "unaccounted".
`it.each` expands ONE source line into N cases, so a grep undercounts exactly where a table-driven test
is added — here by 6 across three files. **Account a delta from the RUNNER's per-file output, never from
a grep over the source** [[pattern-unexplained-test-delta-is-unrecorded-work]]. The story's two figures
are stale rather than wrong-in-kind; corrected here, and both superseded by 4,742.

**RULINGS — R4, R5, R9, R10.** ⚠️ Two-part attribution (§2al), and the first part matters here:
adjudication had listed these four as "yours to rule" WITHOUT stating a recommendation, and Awwal
replied accepting "your recommendations". Rather than record an acceptance of advice never given,
adjudication wrote the four recommendations out explicitly first and Awwal accepted those, 2026-09-25.
**Evidence** by dev and code review; **recommendation** by adjudication; **ruling** by Awwal.

| row | ruling | the reasoning that decided it |
|---|---|---|
| **R4** | ✅ **CLOSED — accept** | Test-harness only, and the census was RE-DONE after being found short (5 → 8 files), each verified alone on a 0-role DB. For "tests assumed seeded state", proving each file in isolation against an empty roles table is the right evidence, not a passing suite |
| **R5** | ✅ **CLOSED — accept** | `no_countable_questions` closes a SECOND silent-guess path in the same class as AC2: a schema that is present but yields nothing countable was previously indistinguishable from one that measured cleanly. Mutations re-run |
| **R9** | ✅ **RULED — replace the query, KEEP R6 accepted** | R6's *acceptance* is still sound (the race is narrow, and AC5's snapshot keeps such a row interpretable). What is broken is only the DETECTOR: R6's query JOINs `questionnaire_forms`, the very row the race deletes, so it reads 0 in exactly the case it exists to catch [[pattern-monitor-measuring-something-else]]. Take R9's replacement, AND its second snapshot-health query — "nothing reads a snapshot that stops being written" is a real independent gap. ⛔ Post-deploy step 9 uses R9's queries, never R6's as written |
| **R10** | ✅ **RULED — amend 13-72's AC8 TEXT, do not reinterpret it on the day** | Reading an AC loosely at run time is how a check becomes decoration. AC8 currently requires `speed_details.reason` absent for rows carrying a completion time; after this story a null-schema row legitimately carries `no_form_schema`. ⭐ **Amending it makes AC8 assert MORE, not less:** `reason` absent **only for rows that resolve a schema**, and `no_form_schema` **present** for those that do not. The conflict is an opportunity to strengthen the check. Owner: whoever runs 13-72 pass 2 — before pass 2, not before this deploy |
### Post-deploy sequence — for adjudication (ruled by Awwal, 2026-09-24)

The order is the ruling; each step names the residual it discharges. ⛔ Re-measure every number on the day (A12) — the ones below are 2026-09-24.

1. **Code review → adjudication → deploy.** One deploy for this story.
2. **Prove the schema step landed, not just the deploy.** AC5 adds two nullable columns via `db:push`. Confirm the deploy log shows the push, then on prod: `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='submissions' AND column_name IN ('form_id_logical','form_version')` → 2 rows, both `YES`. Health 200 and a pm2 restart confirmed by uptime, as usual.
3. **R7 — the snapshot on real rows.** One `ZZSMOKE` enumerator capture (the trial is paused; nothing arrives by itself) + the first public registration after deploy: both rows read back BY COLUMN with `form_id_logical`/`form_version` non-null and equal to the live form (`oslsr_master_v3` `2026072301` / `oslsr_public_core_v1` `1.0.1` as of 2026-09-24).
4. **R8(a) — the marker on a stored prod row.** Re-score ONE currently-UNSCORED row from the 78 unrecoverable orphans (`019e24ef-9617…`, `019e24ef-9629…`, `019f48c2…`) through the normal fraud-detection job; its stored `speed_details.reason` must be `no_form_schema`.
5. **R3 → R2.** The bounded read-only look at the vanished submission; then decide R2 with that answer in hand.
6. **R1 — the restore.** Regenerate the SQL on the day (post-deploy the script runs in place: `cd /root/oslrs/apps/api && node scripts/restore-orphaned-form-schemas.mjs [--only 019f8ed3] > restore.sql`), READ it, apply with `psql -v ON_ERROR_STOP=1 -f restore.sql`, then Task 5.3 on prod. ⭐ After step 1, not before: until 13-73 is live the old `deleteForm` would still permit deleting the restored archived row.
7. **R8(b) — a real floor.** Re-score ONE unscored row of the restored 204; its `speed_details` shows a floor from the schema (≈155 s on the rehearsal) and no `reason`.
8. **AC10.** Only now write "pass 2 UNBLOCKED", dated, in 13-72's Dev Notes and `sprint-status.yaml`; R8 is then discharged.
9. **R6.** Add its reopen-trigger query to the weekly ops read. ⛔ **Code review 2026-09-25: that query reads 0 when the race has happened (measured) — do NOT add it as written; take R9's ruling first (R9 proposes the replacement and a second, snapshot-health query).**

### ⚖️ Note for adjudication — from code review (2026-09-25)

Code review is **done**; the review was a SAME-MODEL pass (Opus 5.5) and verified by execution — weigh it accordingly. Every code finding is FIXED in the working tree (uncommitted): see "Review Follow-ups (AI)". What is left is not code — it is rulings and the post-deploy sequence, all ledgered:

| For | What | Row |
|---|---|---|
| **Awwal** | Accept or refuse code review's proposed closure of **R4** (census now 8 files, each verified alone on a 0-role DB) and **R5** (mutations re-run). Neither is closed until ruled. | R4, R5 |
| **Awwal** | R6's reopen query cannot fire — replace it with R9's query (or re-rule R6). Blocks Post-deploy step 9, not the deploy. | R9 |
| **Awwal** | 13-72 AC8's "`speed_details.reason` absent" check conflicts with AC2 on every pass-2 null-schema row. Rule the reading (or have 13-72's AC amended) **before pass 2 runs**. Not a deploy blocker. | R10 |
| Adjudication | Commit (the review's changes are in the same working tree as dev's — 28 paths in `git status`), deploy, then the Post-deploy sequence as written. | R1, R7, R8 |
| Adjudication | R3 then R2, as already delegated. Review did not touch them. | R2, R3 |

⛔ Nothing here is closed by review. The deploy is not blocked by any review finding. ⚠️ `app_test` was re-pushed with `db:push:full:force` by review (current schema); scratch DBs `app_test_r4_review` dropped.

⛔ **R3 ANSWERED BY ADJUDICATION, 2026-09-25 — EXPLAINED, and the explanation carries its own finding.**
Two-part attribution (§2al): bounded read-only look by adjudication; handed by Awwal 2026-09-24.

**The row was almost certainly deleted by the cohort teardown, and the missing audit trail is a known
property of that procedure rather than an anomaly.** Evidence, all read-only on prod:

| check | result |
|---|---|
| submissions still referencing `019d7d40` | **0** |
| submissions on a deleted form | **282** (was 283) — and 204 + 78 = 282 exactly, so the one that left IS the `019d7d40` row |
| audit actions touching submissions/users, 2026-09-17 → now | **none** — only `data.create`, `magic_link.issued`, `ops.digest_sent`, `respondent.self_updated` |
| the teardown itself | `enumerator-prod-smoke-and-golive-gate.md:533` — `DELETE FROM submissions WHERE respondent_id IN (SELECT id FROM theirs);` |

⭐ **THE MECHANISM: the teardown is a RAW psql BLOCK, and raw SQL cannot write an audit row — only the
application does.** So a submission removed by teardown leaves no `audit_logs` entry by construction.
That is why the search for a delete action found nothing, and it is not evidence of anything hidden.

⚠️ **AND IT WAS BEING RUN IN EXACTLY THAT WINDOW.** 13-69's deploy BROKE this teardown — it deleted
`submissions` without `fraud_detections`, and the NO ACTION FK would have raised 23503 on the next run
(fixed `b8f9950`). A procedure under active repair on 2026-09-19 is a procedure in use.

🐞 **SECONDARY FINDING, worth more than the row it came from — the runbook's audit claim is HALF TRUE.**
§181-182 and §566-567 say *"`audit_logs` are append-only by trigger and are NEVER deleted… the permanent
record that they were created and removed remains, and an auditor can see it."* True of audit rows not
being DELETED. **False by implication about the teardown's own deletions, which are never WRITTEN.** An
auditor looking for "who removed these submissions" finds nothing — not because the record was destroyed,
but because it never existed. ⛔ The honest wording is that teardown is deliberately outside the audit
trail, and the compensating control is that it runs from a runbook against named test rows. **Owner:
Awwal — either amend the runbook's wording or route teardown through the application's audit writer.**
Recorded here because R3 was handed to adjudication "then a named owner", and this is the named part.
### Residuals

| id | severity | state | detail |
|---|---|---|---|
| R1 | high | OPEN — SEQUENCED by Awwal 2026-09-24; apply is adjudication's, AFTER deploy | **AC6's prod WRITE — the order is ruled: code review → adjudication → deploy 13-73 → adjudication settles R2 → adjudication REGENERATES the SQL on the day and applies it → Task 5.3 on prod.** ⭐ Why after deploy and not before (dev's evidence for the ruling): the restored row is `archived`, and until 13-73 is live the OLD `deleteForm` still permits deleting an archived form — restoring first would put the schema back in exactly the state that lost it. After deploy, AC4 refuses that delete (204 rows reference it). Regenerate, never reuse the dev-session SQL: `ssh root@oslsr-home-app 'cd /root/oslrs/apps/api && node scripts/restore-orphaned-form-schemas.mjs [--only 019f8ed3]' > restore.sql` (post-deploy it runs in place), read it, `psql -v ON_ERROR_STOP=1 -f restore.sql`. Task 5.3 then: the referencing rows resolve a schema; the form is absent from the enumerator/public lists; one row through the engine shows a real floor. 13-72 pass 2 depends on this (its AC9). **Evidence:** dev (dry-run on prod read-only + scratch-DB rehearsal, 2026-09-24). **Ruling:** Awwal, 2026-09-24 — the sequence, and that adjudication applies. |
| R2 | medium | ✅ DECIDED BY ADJUDICATION 2026-09-25 — RESTORE `019f8ed3` ONLY (`--only 019f8ed3`). R3 answered first, as sequenced: the vanished row was DELETED by teardown, not re-pointed, so `019d7d40` covers 0 rows and will stay 0 — there is nothing for its schema to make interpretable. Restoring it would add a second retired `oslsr_master_v3` to every admin form list for no gain. ⛔ REOPEN TRIGGER: if any submission is ever found referencing `019d7d40` (the R3 look was bounded, not exhaustive), restore it then — the backup is verified present in monthly/2026-05 and is not going anywhere. Two-part attribution: evidence by dev (live preflight count) and adjudication (R3 look); ruling by adjudication under Awwal delegation 2026-09-24 | **Restore `019d7d40` or not?** AC6 names it, but it now covers **0** rows (was 1 on 2026-09-18 — see R3). Dev's proposal: restore `019f8ed3` only (`--only 019f8ed3`) — restoring `019d7d40` recovers nothing and adds a second retired `oslsr_master_v3` row to the admin list. The case for restoring it anyway: if R3's missing row turns out to have been RE-POINTED rather than deleted, or is ever recovered, its schema would be waiting — so R3's answer should inform this one. Whoever decides records a two-part attribution here and ticks Task 5.2's id choice. **Evidence:** dev (live preflight count, 2026-09-24). **Ruling:** delegated by Awwal to adjudication, 2026-09-24; adjudication's decision not yet made. |
| R3 | medium | ✅ CLOSED BY ADJUDICATION 2026-09-25 — EXPLAINED (teardown via raw psql writes no audit row; see the block above the table). ⚠️ Its SECONDARY finding stays OPEN with a named owner: the runbook claims an auditor can see the record, and for teardown deletions there is no record to see. Owner Awwal — amend the wording or route teardown through the audit writer | **A submission vanished with no audit trail.** The enumerator row on `019d7d40` existed on 2026-09-18 and is absent on 2026-09-24; `audit_logs` has no delete/teardown/submissions action since 2026-09-18. Adjudication's look (read-only, bounded): the cohort teardown in the enumerator runbook §0.9 (does it delete submissions, and does it audit?) and any script that RE-POINTS `questionnaire_form_id` (e.g. a form-binding backfill). Outcome is one of: explained → record the evidence here; or unexplained → open a named story and write its key in this cell. ⚠️ Answer this BEFORE R2 is decided — a re-pointed row changes the case for restoring `019d7d40`. **Why it matters beyond one row:** a submission deleted with no audit record is a gap in the audit trail. **Evidence:** dev (read-only query, 2026-09-24). **Ruling:** Awwal, 2026-09-24 — hand to adjudication, then a named owner; must not block 13-73. |
| R4 | low | ✅ CLOSED by Awwal 2026-09-25 on adjudication's recommendation (census re-done 5→8 files, each verified alone on a 0-role DB) | **Test files that assumed seeded roles.** Ruled "fix"; fixed with one idempotent helper, `src/__tests__/helpers/ensure-roles.ts` (`INSERT … ON CONFLICT (name) DO NOTHING` — a seeded DB is untouched). ⚠️ **The census found FIVE files, not the three first recorded:** `fraud-engine.ungated-coverage`, `webhook-ingestion.gps-columns`, `staff-detail`, **`staff-artefacts`, `staff-list-excludes-citizens`** (a sixth candidate, `system-settings.constraints`, was run and does not depend on roles). **Proof:** a scratch DB pushed with `db:push:full:force` holding **0 roles** — BEFORE: all 5 files FAIL ("role enumerator missing … run db:seed" / "no `enumerator` role"); AFTER: the 5 + the new form-identity file **6 passed / 63 tests**. Scratch DB dropped. For review: confirm the census (`grep` for a role looked up by name in a file that never inserts one) and the helper's idempotence. **Evidence:** dev. **Ruling:** Awwal, 2026-09-24 — fix in 13-73. Closure: code review's to verify, not dev's to sign. ⚠️ **Code review 2026-09-25 (Opus 5.5): the census was SHORT BY THREE.** It looked for a role looked up BY NAME; three files take ANY role with `FROM roles LIMIT 1` and fail identically on a 0-role DB: `contact-correction.service.integration` (2 of 10 failed — `role[0]!.id` undefined), `suppressed-contacts.routes.integration` (6 skipped, file failed), `fraud-engine.imports.integration` (12 skipped, file failed). Each run ALONE on a freshly pushed DB holding 0 roles — RED observed, `ensureRoles('enumerator')` wired in, GREEN 10/10 · 6/6 · 12/12. The dev's five + form-identity also re-run ALONE on fresh 0-role DBs (a combined run can be masked by another file's `ensureRoles`): 9 · 14 · 8 · 13 · 11 · 8, all green. Twelve further candidates (every test file naming `roles` that neither mocks the db nor inserts one) run alone on 0 roles: all green. So R4 now covers **8** files. Helper idempotence: `ON CONFLICT (name) DO NOTHING` — a seeded row is untouched. **Evidence:** code review (Opus 5.5 — same model as dev), 2026-09-25. **Ruling on closure:** none yet — Awwal's. |
| R5 | low | ✅ CLOSED by Awwal 2026-09-25 on adjudication's recommendation (second silent-guess path closed; mutations re-run) | **An empty schema was an unmarked guess.** Ruled "fix". `speed_run` now sets `reason: 'no_countable_questions'` when the schema is present but yields no question the floor can count (no sections, empty sections, or an unread shape). The count uses the SAME walker as `calculateTheoreticalMinimum` (`schemaQuestions`), so the marker cannot disagree with the floor. **Contract:** a third behavioural clause — run every heuristic with a real schema and with `{ sections: [] }`; any whose result changes must carry a reason (`speed_run` was the only silent one). **Proof:** RED observed (4 failed: 3 unit + the contract clause, output `referenceTime: 30`, no reason); GREEN 115/115; MUTATION — deleting the `else if` reds exactly the new contract clause (1 failed / 6 passed), restored 7/7. No live population today: both live forms parse to sections/questions. **Evidence:** dev. **Ruling:** Awwal, 2026-09-24 — fix in 13-73. Closure: code review's to verify. **Code review 2026-09-25 (Opus 5.5), by EXECUTION:** deleting the `else if` reds 4 — the 3 unit cases + exactly the EMPTY-schema contract clause; restored 115/115. The walker claim holds by construction — `calculateTheoreticalMinimum` now iterates `schemaQuestions()` itself, one function, so the marker and the floor cannot disagree. One edge noted, not a defect: a `questions` value that is an OBJECT (not an array) used to throw in the old `for…of`; `flatMap` now counts it as one question. No live form has that shape. **Evidence:** code review. **Ruling on closure:** none yet — Awwal's. |
| R6 | low | ACCEPTED by Awwal 2026-09-24 — with a reopen trigger | **AC4's race window.** The form row is locked, but a submission INSERT takes no lock on it (no FK is possible — sentinels), so a row landing between the count and the delete is not caught. Accepted because AC5's snapshot keeps such a row interpretable, and an archived form still taking traffic is itself the anomaly. **Reopen trigger (measurable, for adjudication's weekly read):** `SELECT count(*) FROM submissions s JOIN questionnaire_forms f ON f.id::text = s.questionnaire_form_id WHERE f.status IN ('archived','deprecated') AND s.submitted_at > f.updated_at` — any non-zero result reopens this row. **Evidence:** dev (code reading). **Ruling:** Awwal, 2026-09-24 — accept, with this trigger. ⛔ **Code review 2026-09-25: this query reads 0 in exactly the case it exists to catch — see R9.** |
| R7 | low | DISCHARGE-ON-DEPLOY — accepted by Awwal 2026-09-24; the post-deploy read (sequence step 3) clears it | **AC5's wizard and adoption writes are proven by mocked-insert assertions**; the COLUMNS are proven real-DB through the worker, and the helper real-DB directly. Accepted, and DISCHARGED only by reading real prod rows by column after deploy (Post-deploy sequence, step 3): one `ZZSMOKE` enumerator capture (the trial is paused, so none will arrive by itself) and the first public registration after deploy — `SELECT form_id_logical, form_version FROM submissions WHERE …` must be non-null and match the live form. Adoption has no scheduled run; its write is covered by the mocked test until one happens. **Evidence:** dev. **Ruling:** Awwal, 2026-09-24 — accept, discharged by the post-deploy read. |
| R8 | medium | DISCHARGE-ON-DEPLOY | **AC10's "pass 2 unblocked" line.** Written into 13-72's Dev Notes and `sprint-status.yaml` only when (a) 13-73 is deployed and ONE deliberately re-scored null-schema row shows `speed_details.reason = 'no_form_schema'` on prod — the trial is paused (last enumerator submission 2026-09-21), so no row will arrive to show it by itself; take one of the 78 unrecoverable orphans — and (b) R1 is applied and ONE of the 204 restored rows, re-scored, shows a real floor (≈155 s, no reason). Those two rows are, in effect, the first rows of pass 2. Until then both records say "not yet", dated 2026-09-24. **Evidence:** dev (the paused-trial trap is the same one 13-71's post-deploy read fell into). **Ruling:** Awwal, 2026-09-24 — the two-smoke-row discharge. |
| R9 | medium | ✅ RULED by Awwal 2026-09-25 — REPLACE R6's query with R9's, plus R9's snapshot-health query; R6 stays ACCEPTED. Post-deploy step 9 uses R9's, never R6's as written | **R6 was accepted on a query that cannot fire, and nothing reads a snapshot that stops being written.** (a) R6's query JOINs `questionnaire_forms` — but the race's OUTCOME is a submission whose form row has been DELETED, so the JOIN drops it. **Measured on a scratch DB (`app_test_r4_review`, dropped):** archived form + a submission landing after the count → the query reads **1** before the delete commits and **0** after it — i.e. 0 precisely when the race has happened. Proposed replacement (same scratch run reads **1** after the delete): `SELECT count(*) FROM submissions s WHERE s.form_id_logical IS NOT NULL AND NOT EXISTS (SELECT 1 FROM questionnaire_forms f WHERE f.id::text = s.questionnaire_form_id)` — a snapshot is written only if the form row existed at insert, so after 13-73 the ONLY ways to be counted are this race or a delete that bypassed `deleteForm`; both should reopen R6. Reads 0 on prod until 13-73 deploys (the columns do not exist yet). (b) `snapshotFormIdentity` FAILS OPEN with a warn log that nobody reads; a snapshot that silently stops being written is indistinguishable from a legacy row. Proposed companion read: `SELECT count(*) FROM submissions s WHERE s.submitted_at > '<13-73 deploy time>' AND s.questionnaire_form_id ~* '^[0-9a-f]{8}-' AND s.form_id_logical IS NULL AND EXISTS (SELECT 1 FROM questionnaire_forms f WHERE f.id::text = s.questionnaire_form_id)` — a live form row and no snapshot means the lookup FAILED; should be 0. ⛔ The Post-deploy sequence step 9 names R6's old query; whoever rules this edits that step. **Evidence:** code review (Opus 5.5), 2026-09-25 — scratch-DB execution. **Ruling:** none yet. |
| R10 | medium | ✅ RULED by Awwal 2026-09-25 — AMEND 13-72 AC8's TEXT (reason absent only for schema-resolving rows; no_form_schema present for the rest). Owner: whoever runs pass 2, before pass 2 | **13-72 AC8 will fail on every pass-2 null-schema row, by 13-73's design.** 13-72 AC8's minimum check reads "`speed_details.reason` absent for the rows that carry a completion time". After 13-73, every null-schema row that carries a completion time stores `speed_details.reason = 'no_form_schema'` — that is AC2 working. Pass 1 (65 rows, all on a LIVE form, re-measured 2026-09-24) is unaffected; **pass 2 is not**: the 88 null-schema rows (78 unrecoverable + 10 sentinels, if the restore is applied) will each carry the marker. Unrecorded, the pass-2 operator sees AC8 "fail" and either stops or "fixes" the marker. The dev's claim "no code or query in the repo gates on `details.reason`" is true of `apps/`, `scripts/`, `docs/` — the grep did not cover `_bmad-output/`, where this check lives. Same class, lower stakes: 13-69's recorded reachability criterion was "`straightline_details.reason` ABSENT"; after AC1 a straight-lining row that analysed 1 of 2 batteries carries a reason (the dev narrowed three 13-69 test assertions for exactly this). No live query reads it — verified: `grep` of `apps/api/src apps/api/scripts scripts/ docs/ _bmad-output/…/13-72*` for `->>'reason'`, `? 'reason'`, `reason IS` finds none. Proposed: 13-72 AC8 reads "`speed_details.reason` absent for rows on a LIVE form; `no_form_schema` on every null-schema row" — AC text is not review's or dev's to edit. **Evidence:** code review (Opus 5.5), 2026-09-25. **Ruling:** none yet. |

### File List

**New**
- `apps/api/src/services/form-identity.ts` — AC5 snapshot helper.
- `apps/api/src/workers/__tests__/webhook-ingestion.form-identity.integration.test.ts` — AC5 real-DB read-back, incl. survive-the-delete.
- `apps/api/scripts/restore-orphaned-form-schemas.mjs` — AC6 prepare-only restore generator (outside tsconfig; RUN, linted by `eslint src scripts`).
- `apps/api/src/__tests__/helpers/ensure-roles.ts` — R4: idempotent role creation for tests.

**Modified — production**
- `apps/api/src/services/fraud-heuristics/straight-lining.heuristic.ts` — AC1.
- `apps/api/src/services/fraud-heuristics/speed-run.heuristic.ts` — AC2.
- `apps/api/src/services/questionnaire.service.ts` — AC4 guard.
- `apps/api/src/db/schema/submissions.ts` — AC5 columns (⚠️ schema change: `db:push` on deploy).
- `apps/api/src/workers/webhook-ingestion.worker.ts` — AC5 write.
- `apps/api/src/controllers/registration.controller.ts` — AC5 write (wizard).
- `apps/api/src/services/draft-adoption/adopt.ts` — AC5 write (found by census; not in the story's list).

**Modified — tests**
- `apps/api/src/services/fraud-heuristics/__tests__/heuristic-self-description.contract.test.ts` — AC3: pins removed, two sweep clauses added.
- `apps/api/src/services/fraud-heuristics/__tests__/straight-lining.heuristic.test.ts` — AC1 (+3).
- `apps/api/src/services/fraud-heuristics/__tests__/speed-run.heuristic.test.ts` — AC2 (+3).
- `apps/api/src/services/__tests__/fraud-engine.ungated-coverage.integration.test.ts` — AC1 old-decision assertions changed deliberately; AC2 stored-row proof (+3).
- `apps/api/src/services/__tests__/questionnaire.service.test.ts` — AC4 (+3).
- `apps/api/src/routes/__tests__/registration.routes.test.ts` — AC5 wizard (+1).
- `apps/api/src/services/__tests__/draft-adoption.adopt.test.ts` — AC5 adoption (+1).
- R4 — `ensureRoles` wired into: `services/__tests__/staff-detail.integration.test.ts`, `staff-artefacts.integration.test.ts`, `staff-list-excludes-citizens.integration.test.ts`, `fraud-engine.ungated-coverage.integration.test.ts`, `workers/__tests__/webhook-ingestion.gps-columns.integration.test.ts`, `webhook-ingestion.form-identity.integration.test.ts` (no test-count change).
- R5 — `speed-run.heuristic.test.ts` (+3 more) and the contract test (+1 clause).
- **Code review 2026-09-25:** `ensureRoles` also wired into `services/__tests__/contact-correction.service.integration.test.ts`, `routes/__tests__/suppressed-contacts.routes.integration.test.ts`, `services/__tests__/fraud-engine.imports.integration.test.ts` (R4, no test-count change) · `services/form-identity.ts` + `controllers/registration.controller.ts` (the wizard passes its `tx`; lookup in a savepoint) · `webhook-ingestion.form-identity.integration.test.ts` (+2) · `registration.routes.test.ts` (asserts the tx is passed) · contract test (non-vacuity precondition on the R5 clause) · `scripts/restore-orphaned-form-schemas.mjs` (pins `standard_conforming_strings`; corrected comment).

**Modified — records**
- `_bmad-output/implementation-artifacts/13-73-a-zero-must-say-why.md` (this file).
- `_bmad-output/implementation-artifacts/13-72-back-score-the-dark-window.md` — AC10 status note (not yet unblocked).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 13-73 → `review`; 13-72 note.

**Not touched (fences):** `fraud-thresholds.seed.ts` (AC8) · `fraud-engine.service.ts` · the limiters (13-70) · 13-71's GPS chain · 13-72's scripts · `apps/web` (no change needed — verified the delete toast surfaces the API message).

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-09-18 | Authored via canonical `*create-story` (yolo) as "Story B" of 13-69's Handover §C, folding in R5, R8 (markers + delete guard + the 205-row restore + the form-identity snapshot) and R9. | Five instances of one defect in a week. The contract test shipped with 13-69 states the property; this story makes the engine satisfy it, and unblocks 13-72's pass 2, which would otherwise score 292 rows against a 60-second floor. |
| 2026-09-24 | **dev-story (Opus 5.5), UNCOMMITTED → `review`.** AC1 `battery_below_min_answered` + `skippedBatteries`; AC2 `no_form_schema`; AC3 violations block EMPTY with a new BEHAVIOURAL schema-dependence clause; AC4 `FORM_HAS_SUBMISSIONS` 409; AC5 `form_id_logical`/`form_version` written by the worker, the wizard AND draft-adoption (census found the third); AC6 prepared + dry-run on prod read-only + rehearsed, NOT applied; AC7 verified in 13-71; AC8 fence empty; AC9 four mutations observed. API 332 files / 4,736 tests, web 283 / 3,192, tsc/eslint/3 guards clean. Re-measured: 282 orphans (not 283), `019d7d40` now covers 0 rows. Residuals R1–R8, all OPEN, none closed by dev. | The contract now holds for every heuristic; the form row is no longer the only record of what a submission answered; 13-72 pass 2 waits on deploy + the restore apply, and both records say so. |
| 2026-09-24 | **Round 2 — Awwal ratified dev's recommendations on R1–R8.** R4 fixed (`ensureRoles`; 5 files, not 3), R5 fixed (`no_countable_questions` + a third contract clause); rulings recorded with two-part attribution; a 9-step Post-deploy sequence written for adjudication; R8's discharge made runnable despite the paused trial (two deliberate re-scores). API 332 / 4,740 (predicted exactly), all static gates clean. Still UNCOMMITTED. | So review and adjudication inherit decisions, not open questions — and every discharge names a step that can actually be run. |
| 2026-09-25 | **Code review (Opus 5.5 — SAME model as dev; verified by execution).** Fixed: wizard snapshot now runs on the wizard's own `tx` in a SAVEPOINT (was a second pool connection mid-transaction; +2 real-DB tests, RED observed); R4 census short by 3 files, fixed; R5 contract clause given its non-vacuity precondition; restore SQL pins `standard_conforming_strings`; GCM comment corrected to the observed behaviour. Opened R9 (R6's query reads 0 when the race has happened — measured) and R10 (13-72 AC8 conflicts with AC2 on pass 2). R4/R5 → closure proposed, awaiting ruling. **Gates:** tsc api 0 / web 0 · eslint 0 errors (1 pre-existing warning) · registry-read ✅ · respondent-write ✅ · story-residuals ✅ · seed diff EMPTY. **API** 4 shards serialised, each to its own file, free RAM >3 GB before each: 83+83+83+83 = **332 files** (330 passed, 2 skipped) · 1,309+1,017+1,159+1,257 = **4,742 tests** (4,734 passed, 8 skipped), 0 failed — predicted before the run (4,740 + 2). **Web** 283 files / 3,192 tests (3,190 + 2 todo), 0 failed — identical to baseline. Status left `review`: every code finding is fixed; R9/R10 are rulings, and adjudication owns the commit. | Same-model review, so every claim was run rather than read; what remains is Awwal's to rule, not code to write. |

### Review Follow-ups (AI)

**Code review — 2026-09-25, Claude Opus 5.5 (`claude-opus-5-5`).** ⚠️ **SAME MODEL AS THE DEV.** The brief asked for a different model; none was available in this session. Compensated by verifying through EXECUTION — every claim below marked *observed* was run, not read. Adjudication should weigh this review as a same-model pass (13-71: a different-model pass found fifteen defects three same-model passes missed).

**Numbers re-measured (A12), read-only on prod `7b13ec3`, 2026-09-25:** 282 orphaned rows across 4 form ids, 0 non-public · sentinels `self-edit` 8 + `no-form-pinned-at-submit` 2 → **292** marked · `019d7d40` **0** rows · last enumerator submission 2026-09-21 13:23 UTC (trial paused), last submission of any kind 2026-09-25 07:29 UTC, total 8,702. The dev's 2026-09-24 table holds.

**Fixed in review (each RED observed before, GREEN after):**

- [x] [AI-Review][HIGH] **The wizard's snapshot took a SECOND pool connection while holding its transaction's.** `snapshotFormIdentity` read through `db` from inside `db.transaction` [apps/api/src/controllers/registration.controller.ts:1091, apps/api/src/services/form-identity.ts:50]. Pool is `max: 20, connectionTimeoutMillis: 2000` (`db/index.ts`). *Failure scenario:* 20 concurrent registrations (a re-engagement blast) each hold 1 connection and each asks for a 21st → all wait 2 s → every snapshot fails open to NULL, and every other pool user — the in-process BullMQ workers, the health check — is starved for those 2 s. Not a permanent deadlock only because of the 2 s acquire timeout. The dev's reason for `db` (a failed query aborts a PG transaction) is right; the remedy is a SAVEPOINT. *Fix:* the helper takes an optional `tx` and runs the lookup in `tx.transaction(...)` — drizzle 0.45.2's nested transaction IS a savepoint (verified in the installed `node-postgres/session.js`: `savepoint sp1` / `rollback to savepoint`). *Proof, real DB:* a new test counts pool `acquire` events during the snapshot inside a transaction — **RED `expected 1 to be +0`** on the old code, GREEN after. A second new test: another session holds `ACCESS EXCLUSIVE` on `questionnaire_forms`, the caller sets `lock_timeout 200ms` → the lookup FAILS, returns nulls, and the caller's next statement still runs. *Mutation:* savepoint removed (`lookup(tx)`) → exactly that test reds with `current transaction is aborted, commands ignored until end of transaction block`; restored.
- [x] [AI-Review][MEDIUM] **R4's census was short by three.** It searched for a role looked up BY NAME; `FROM roles LIMIT 1` takes ANY role and fails the same way. `contact-correction.service.integration`, `suppressed-contacts.routes.integration`, `fraud-engine.imports.integration` — each RED alone on a fresh 0-role DB, GREEN after `ensureRoles`. Details in R4.
- [x] [AI-Review][LOW] **The promoted R5 clause could pass vacuously** [heuristic-self-description.contract.test.ts, "describes itself when a battery is FOUND but under-answered"]. The pin it replaced asserted `batteryCount: 1`; the sweep does not, and `no_batteries_found` "describes itself". *Observed:* mutating to `identifyBatteries(formSchema, minBatterySize + 1)` left this clause GREEN (only the schema clauses' non-vacuity caught the drift). *Fix:* precondition `toMatchObject({ batteryCount: 1, analyzedBatteries: 0 })` → the same mutation now reds this clause too; restored 115/115.
- [x] [AI-Review][LOW] **The emitted restore SQL depended on the session's `standard_conforming_strings`** [scripts/restore-orphaned-form-schemas.mjs, the `BEGIN;` line]. Every value is a plain `'…'` literal and form schemas hold regexes; with the setting `off`, backslashes are consumed (*observed* in local psql). Prod is `on` (*observed*), so this is latent. *Fix:* `SET LOCAL standard_conforming_strings = on;` emitted after `BEGIN`, as pg_dump does.
- [x] [AI-Review][LOW] **The script's comment said a bad GCM tag surfaces at `await done`.** *Observed* with a probe that copies the script's stages exactly (6,000 COPY lines, gzip, AES-256-GCM, chunked body → decipher → gunzip → PassThrough → readline), on **Node 20.20.2 (the VPS)** and 24: good tag → `VERIFIED after 6002 lines`; one-bit-flipped tag → the `for await` over readline **THROWS** `Unsupported state or unable to authenticate data` before `await done` is reached. Safe either way (nothing is printed or emitted), but the comment named the wrong line; corrected.

**Recorded for a ruling (not fixable by review):**

- [ ] [AI-Review][MEDIUM] **R6's reopen query reads 0 exactly when the race has happened** — it JOINs the form row the race deletes. *Observed* on a scratch DB: 1 before the delete, **0** after; a proposed replacement reads 1. Also: nothing reads a fail-open snapshot that silently stops being written. → **R9**.
- [ ] [AI-Review][MEDIUM] **13-72 AC8's check "`speed_details.reason` absent for rows that carry a completion time" fails on every pass-2 null-schema row by 13-73's design.** The dev's "nothing gates on `details.reason`" grep excluded `_bmad-output/`. → **R10**.

**Advisory — reviewed, no change made:**

- [AI-Review][LOW] **AC1 sets `reason` on a PARTIAL drop.** My view: acceptable, and the dev's argument holds (a total-loss-only reason would hide the 1-of-2 row from a `GROUP BY reason`). But the engine's other reasons all mean "did not measure", and on `straight_lining` it no longer does — the reader must check `analyzedBatteries`. No live query reads it (grep, R10). The three 13-69 assertions the dev changed: two NARROWED to "not `no_batteries_found` AND `analyzedBatteries ≥ 1`" — the reachability intent is preserved, since a heuristic that never reached its computation cannot report ≥1 analysed; the H1 one was REWRITTEN to assert the dropped battery is named with its counts (`questionCount 6`, `answered < minBatterySize`) — stronger than before, not a hole.
- [AI-Review][LOW] **The schema-dependence clauses compare `details` only, on ONE fixture.** A heuristic whose SCORE (not details) depends on the schema, or whose dependence does not show on this answer set, is not enrolled. With `completionTimeSeconds: 800`, `speed_run` scores 0 with and without the schema, so comparing scores would add nothing on this fixture — the gap is the fixture, not the comparison. The non-vacuity assertion does catch today's two readers dropping out (*observed* above).
- [AI-Review][LOW] **`deleteForm` checks the status BEFORE the transaction and does not re-check after the `FOR UPDATE` lock** [apps/api/src/services/questionnaire.service.ts:475 vs :506]. *Scenario:* an admin deletes a `draft` while another publishes it; the lock waits for the publish, the count is 0 (nothing submitted yet), and a just-published form is deleted — the next submission against it is an orphan. Needs two admins racing on one form; the reference guard itself is sound.
- [AI-Review][INFO] **The wizard's form id can come from the client payload** (13-23 precedence), so the snapshot records whatever form that UUID names. This exposure already existed: `questionnaire_form_id` already stores the same id. No new exposure, but the snapshot now makes a forged binding look more authoritative.
- **Verified sound, by execution:** AC2 on the STORED row for both shapes (the form-identity and ungated-coverage files green on a 0-role DB); `count()` is `sql`count(*)`.mapWith(Number)` in drizzle 0.45.2, and the real-DB test's `toMatchObject({ submissionCount: 2 })` would fail on a string; AC4 refuses `archived` reached by `published → deprecated → archived`; producer census re-run — 6 production `insert(submissions)` sites (3 real-form + 3 sentinel, as the dev found) plus the dev-only perf seed `seed-projected-scale.ts`; the empirical-median branch carrying no reason is right (it compares the same form id's own history and never reads the schema); `no_countable_questions` shares the floor's walker by construction. **AC6 generator run read-only over ssh on prod** (`--only 019f8ed3`): GCM tag VERIFIED on `monthly/2026-08`, `pubcore-2` 6/25/0, 204 referencing rows, `status` forced `'archived'`, casts from today's `information_schema`; the regenerated SQL **applied to a scratch DB** → `archived`, `now_resolving 1`; a second apply fails on `questionnaire_forms_pkey`. Not applied anywhere else.
- **Verified sound, R7:** I agree the mocked wizard and adoption inserts, plus the post-deploy read, are enough. The columns are proven real-DB through the worker, the helper is now proven real-DB INSIDE a transaction, and only the object-literal wiring is mocked. The mocked test now also asserts the wizard passes its own `tx`.

**Gates run by review:** see the Change Log entry for 2026-09-25.

# Story 13.67: Association identity as structured data — the name the badge will say

Status: done

> ✅ **CLOSED AT ADJUDICATION 2026-09-08.** Both backfill phases applied and verified on prod
> (deploy `9e8235b`): 56 / 8,222 / 11, with the JSONB merge intact. R1 discharged, R2 ruled by
> Awwal and built as phase 2, R3 ruled here and written into 13-58's AC4. Nothing open.
>
> ⛔ **13-58 is now unblocked and owns the next step** — and its AC4 was CORRECTED here: the badge
> renders on the PRESENCE of `metadata.association_name`, never on `source`, or the 11 people
> phase 2 vouched for (all `source = public`) would see nothing. Ordering remains binding:
> **13-58 → then open `PIPELINE_EXCLUDED_STATUSES` (13-2 R-A2)**, never the reverse.

> 🎯 **PICKING THIS UP COLD? READ [§Session Record](#-session-record--code-review--r2-ruling-2026-09-06--2026-09-07) FIRST** (near the bottom, after
> the Dev Agent Record). Everything below this line is the story AS CARVED on 2026-09-05; the
> Session Record is what actually happened when it was built, reviewed and ruled on — including
> what were then two open residuals — **R1** the unrun prod backfill and **R3** an AC change in
> 13-58 — and the five-step running order for whoever goes next.
>
> ✅ **BOTH ARE NOW CLOSED** (banner corrected 2026-09-11, Story 13-58's sweep): R1 applied on prod
> at `e681851`, R3 ruled at adjudication 2026-09-07 and written into 13-58's AC4. This paragraph read
> "still open" after the story went `done`, which would have sent a cold reader hunting closed work.
> → [[pattern-a-record-about-the-work-is-not-the-work]]

<!--
  CARVED 2026-09-05 at adjudication, deliberately NOT as an amendment to 13-2.
  13-2's ACs are delivered and its channel is live on prod (8,278 rows). Reopening a story whose
  ACs are done, whose AC3.3/AC4.3 were corrected mid-flight, and which carries five open residuals
  would give a fresh agent a scope it has to navigate rather than execute. This is the small,
  clean slice that stands between 13-2 and 13-58.
-->

## Story

As **an employer about to see an association badge on a worker's card**,
I want **the association's name to be a stored field rather than free text in an operator note**,
so that **the badge can say who actually vouched for this person — which is the whole content of
the claim it makes.**

## Context — why this exists, measured

13-58 (`marketplace-association-confirmed-badge`) has as its first AC:

> A card whose respondent is `source = imported_association` … renders **"[Association] — confirmed
> member"** using **the stored association name**.

**There is no stored association name.** Verified 2026-09-05: no `association_name` column anywhere,
no `member_confirmed` flag anywhere. The only association identity on prod is free text in
`import_batches.source_description`, written by the operator at import time:

| batch | `source_description` (truncated) | rows |
|---|---|---|
| `01a071c8-709f-73a3-9e31-eb0e8cedf01a` | `ASNAT Tiler Association (Oyo State) - WhatsApp intake, 56 clean rows of 70; 14 held for ma…` | 56 |
| `01a072ae-83e7-7e8f-902d-590f0c589c74` | `Oyo farming groups consolidated intake - 8,234 flag-free rows of 9,563 collected (NCARES +…` | 8,222 |

A badge reading *"ASNAT Tiler Association (Oyo State) - WhatsApp intake, 56 clean rows of 70 —
confirmed member"* is not a badge. And the second row is worse than untidy: **"Oyo farming groups"
names no accountable body at all**, and the badge's entire premise is that a named body vouched.

⭐ **Awwal answered that on 2026-09-05 — the vouching bodies are:**
- **ASNAT** (Association of Tilers, Oyo State) → batch `01a071c8…`, 56 rows
- **AFAN** (All Farmers Association of Nigeria) → batch `01a072ae…`, 8,222 rows

That ruling is the reason this story is buildable. Do not re-derive it from the source sheets; NCARES
and L-PRES are *programme registers*, not associations, and reading them as the vouching body would
put a programme name on a card where a guild name belongs.

## ⛔ Read before designing the schema

**Put the name on the RESPONDENT's metadata, not only on the batch.** The obvious design is
`import_batches.association_name`, and it is wrong on its own:

`registry_unified` — the canonical read every marketplace/insights surface aggregates over — exposes
`respondent_id, lga_id, source, status, nin, phone_number, submitter_id, metadata,
consent_marketplace, consent_enriched, created_at, raw_data`. **It does NOT expose `import_batch_id`.**
So a batch-only design forces every badge read into a join, or forces a change to the canonical view
— which has its own governance rules in `registry-unified.sql.ts` ("state WHO needs it and WHY", and
raw substrate only).

`metadata` **is** already exposed. Writing `metadata.association_name` at import time means the badge
is readable everywhere with no join, no new view column, and no view edit. It travels with the row,
survives rollback, and mirrors how `metadata.import_extra` already works.

⚠️ Store it in **both** places, and know why each is there: `import_batches.association_name` is the
operator-facing record of who a batch came from (and the thing the next import's UI should prompt
for); `respondents.metadata.association_name` is the read path. The batch column is the source of
truth; the respondent copy is a denormalisation written at insert.

## Acceptance Criteria

### AC1 — Structured association name on the batch
`import_batches` gains `association_name` (nullable text). The import path accepts it and stores it.
Nullable because `imported_itf_supa` and `imported_other` legitimately have none — this field is not
a general "who sent this", it is specifically the **accountable body that vouched**.

### AC2 — The name travels to the respondent
Every row inserted by an `imported_association` batch carries `metadata.association_name`. Written in
the SAME transaction as the respondent and its submission, for the reason AC3.4 gives: a respondent
whose provenance is missing is exactly the half-state this avoids.

### AC3 — Backfill the two live batches
`01a071c8…` → **ASNAT**, 56 rows. `01a072ae…` → **AFAN**, 8,222 rows.

⚠️ **This is a production data operation on 8,278 live rows, not a `WHERE` clause typed at the
keyboard.** PREDICT the affected count per batch, run it, then verify the count matches the
prediction — [[pattern-predict-then-compare]]. `respondents.metadata` is JSONB and already holds
`normalisation_warnings` / `imported_email` / `import_extra` on these rows: **merge, never replace.**
An `UPDATE … SET metadata = '{"association_name":…}'` would silently destroy the R2 ambiguity flags
and the verbatim `full_name` that R-A6 depends on for recovery.

### AC4 — Operator input at import time
Whoever confirms an `imported_association` batch supplies the association name. It must not be
inferable from a filename or guessed from the sheet.

### AC5 — Tests
Round-trip (supplied → batch → respondent metadata); a non-association source stores nothing; the
backfill **merges** JSONB rather than overwriting (RED-verify: assert a pre-existing metadata key
survives); a missing name does not block an import but is visible to the operator.

## Explicitly OUT of scope

- **The badge itself** — that is 13-58, and it should be built only after this lands.
- **Tier-2 "Member-verified"** — 13-58's AC2. **There is no substrate for it**: no `member_confirmed`
  column, no SMS confirmation loop (Termii is not cleared), no Assessor callback queue. Do not build
  it speculatively; a tier that cannot be earned is a badge that never changes.
- **Opening `PIPELINE_EXCLUDED_STATUSES`** — 13-2 R-A2, and it must come AFTER the badge renders.
  Reversed, 8,278 people appear on marketplace cards reading as ordinary verified listings, which is
  Awwal's ruling §3 breached at scale.

## Traps a fresh agent will hit

1. **13-38 and 13-58 share the slug `marketplace-association-confirmed-badge`.** 13-38 is `done`
   (closed on prod 2026-08-18) and shipped **experience levels and trading names** — NOT the
   association badge. 13-58 was carved out of it on 2026-08-09 and is `backlog`. Adjudication read
   the done one as the gate on 2026-09-05 and had to correct 13-2's R-A2. Check the number, not the name.
2. **R1 is LOCKED.** Never render a bare "✓ Verified" for an import. There is no NIMC path, and a
   present NIN here was **proxy-transcribed by the association head**. Attributing the claim to a
   named body is both honest and a stronger signal.
3. **Nothing renders yet.** `marketplace_profiles` = 291 while the registry holds 8,662, because
   `imported_unverified` is still in `PIPELINE_EXCLUDED_STATUSES`. Expect an empty marketplace for
   these rows until R-A2 opens — that is correct, not a bug in your work.
4. **13-2 read `ready-for-dev` until 2026-09-05** while its channel was live. If any other artefact
   still says the association channel is unbuilt, distrust it and measure.

## Measured facts (2026-09-05, prod)

| fact | value |
|---|---|
| `imported_association` respondents | **8,278** |
| `public` / `enumerator` | 383 / 1 |
| `marketplace_profiles` | **291** |
| registry total (`totalRegistered`) | **8,662** |
| LGAs with a publishable trade | **33** |

## Dependencies

- **HARD: 13-2** — `review`, channel live. This story completes the provenance half it left implicit.
- **BLOCKS: 13-58** — AC1 there cannot be satisfied until AC1–AC3 here land.

## Tasks / Subtasks

<!--
  Authored 2026-09-06 by the dev agent. The story was carved at adjudication with ACs but no
  task breakdown; these decompose AC1–AC5 and nothing else. Each task names the AC it serves.
-->

- [x] **T1 — `import_batches.association_name` (AC1)**
  - [x] Add `associationName: text('association_name')` (nullable) to `apps/api/src/db/schema/import-batches.ts`, with a comment stating it is the ACCOUNTABLE VOUCHING BODY, not a generic "who sent this".
  - [x] No hand-written migration: the project's schema path is `db:push` / `db:push:force` off the Drizzle schema (CI runs `db:push:force`). Confirm the column materialises on the test DB before writing tests against it.
- [x] **T2 — Operator supplies the name; it is never inferred (AC4)**
  - [x] Add `associationName?: string | null` to `ConfirmParams` in `import.service.ts` and write it onto the `importBatches` insert inside the existing confirm transaction.
  - [x] Read `association_name` from the confirm request body in `apps/api/src/routes/imports.routes.ts`.
  - [x] Trim + treat empty string as absent. NEVER derive from `originalFilename`, `sourceDescription`, or any sheet cell — assert this with a test, not a comment.
- [x] **T3 — The name travels to the respondent (AC2)**
  - [x] Add `association_name?: string` to `RespondentMetadata` (`respondents.ts`) and to `IngestRespondent['metadata']` (`ingest-plan.ts`).
  - [x] In the confirm ingest's `values` map, merge `association_name` into each row's metadata — same transaction as the respondent and its submission (AC3.4's half-state rule).
  - [x] Recompute the `hasMeta` emptiness check AFTER the merge, or a row whose only metadata is the association name would be written as `null`.
  - [x] Only for `source = 'imported_association'`.
- [x] **T4 — Non-association sources store nothing (AC5)**
  - [x] Confirm rejects `association_name` supplied against a non-association source with a 400 rather than silently discarding it. ⚠️ DELIBERATE READING beyond the AC's literal words — flagged in Completion Notes for adjudication.
  - [x] A missing name on an association batch does NOT block the import: no throw; surface it on `ConfirmResult` and in the log so the operator can see it (AC5).
- [x] **T5 — Backfill the two live batches (AC3)**
  - [x] Put the logic in `src/` (type-checked + testable), not in `scripts/` — `scripts/` is outside tsconfig and is RUN, never checked.
  - [x] Ruling constants: `01a071c8-709f-73a3-9e31-eb0e8cedf01a` → **ASNAT**, `01a072ae-83e7-7e8f-902d-590f0c589c74` → **AFAN**. Awwal, 2026-09-05. Do not re-derive from the sheets.
  - [x] JSONB **merge**, never replace: `metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(...)`. A `SET metadata = '{...}'` destroys the R2 identity-ambiguity flags and the verbatim `full_name` R-A6 depends on.
  - [x] PREDICT the affected count per batch, apply, then VERIFY the count matches the prediction — [[pattern-predict-then-compare]]. Default to dry-run; `--apply` to write.
  - [x] Thin CLI wrapper at `apps/api/scripts/_backfill-association-identity.ts`.
- [x] **T6 — Tests (AC5)**
  - [x] Round-trip, real DB: supplied at confirm → `import_batches.association_name` → every inserted respondent's `metadata.association_name`.
  - [x] A non-association source stores nothing.
  - [x] Backfill MERGES: RED-verify a pre-existing metadata key survives the write.
  - [x] A missing name does not block the import and is visible to the operator.
- [x] **T7 — Gates**
  - [x] `pnpm --filter @oslsr/api exec tsc --noEmit`
  - [x] `pnpm --filter @oslsr/api lint` (eslint + the three drift guards green)
  - [x] API suite against the TEST DB (`NODE_ENV=test DATABASE_URL=…/app_test`) — never `app_db`.

### Review Follow-ups (AI)

<!--
  Adversarial code review, 2026-09-06, on the UNCOMMITTED tree (HEAD `71635d3`). Gates were
  re-run by the reviewer, not taken from the report: tsc clean, lint green (401/401/322),
  API suite 308 files / 4,364 tests green against `app_test`. All NINE findings below were
  resolved — eight fixed in the same session, one (R2) escalated and then ruled on by Awwal
  on 2026-09-07 and built. The three that changed behaviour were RED-VERIFIED by mutation.
-->

- [x] **[AI-Review][High] H1 — the backfill's predict-then-compare could not fail.** `updatedRows === predictedRows` reads the IDENTICAL predicate twice on a closed batch, so it agrees for every database including the wrong one; the falsifiable number (56 / 8,222) was compared ONLY in the CLI's `--dry-run` path, which `--apply` skips. A run against a partial restore printed *"✅ Every batch updated exactly the predicted number of rows"* and exited 0. **Fixed:** `preflightAssociationBackfill()` (`src/lib/association-identity-backfill.ts:172`) validates EVERY batch before the FIRST write — absent batch, non-object metadata, and count-vs-ruling — with `--accept-count-drift` as the deliberate override. New test `AC3/H1 — REFUSES to write when a batch disagrees with the ruling counts`.
- [x] **[AI-Review][High] H2 — the only operator-facing input had no test.** `association_name` appeared exactly once in the repo (`routes/imports.routes.ts:99`); the 12 story tests call `ImportService.confirm()` directly. **RED-VERIFIED:** replacing the wiring with `associationName: null` left all 4,364 tests green. **Fixed:** two route tests (`routes/__tests__/imports.routes.test.ts`) — the snake_case key forwards, and an omitted key forwards `null`. Under the same mutation exactly one test now fails.
- [x] **[AI-Review][Med] M1 — AC3 was undischarged AND untracked.** `_backfill-association-identity.ts` was in no residual ledger and absent from `docs/runbooks/backfill-operator-residuals.md`, the canonical tracker whose own preamble names [[pattern-ship-a-fix-that-never-fires]]. **Fixed:** registered in tracker §A with the probe that answers "did we run it?", and opened as **R1** below.
- [x] **[AI-Review][Med] R2 — the 12 people the badge would have skipped. RULED 2026-09-07: the vouch attaches.** Implemented as **phase 2** of the same one-shot (`predict/preflight/applyAssociationMatchedBackfill`), keyed on the batch's own `failure_report` match hashes because a matched row keeps its own `import_batch_id` and phase 1's predicate cannot reach it. Writes `association_vouched_by_batch_id` + one `operator.association_vouch_attached` audit row per person. ⛔ **It also forces an AC change in 13-58 — flagged there, not silently edited: those 12 are `source = public`, so AC4's source-keyed condition would render nothing for them and the ruling would be silently unimplemented.**
- [x] **[AI-Review][Med] M3 — AC2's "same transaction" was asserted by a comment and nothing else.** Every test read the committed end state, so moving the merge to a post-commit second pass kept them all green. **RED-VERIFIED by doing exactly that** — 14 of 15 tests, including *"the name is MERGED… leaving the import provenance intact"*, stayed green. **Fixed:** `AC2 — the name lands in the SAME TRANSACTION as the respondent and its submission` compares `respondents.xmin` with `submissions.xmin`; a post-commit UPDATE moves the respondent's row version and the test goes red.
- [x] **[AI-Review][Med] M4 — 13-58 was left pointing at 13-2 for a field this story owns.** `13-58…md:40` said 13-2 owns "the association name, the member-confirmed flag" — false twice over. **Fixed:** a dated UPDATE block in 13-58 naming `respondents.metadata.association_name` as the read path (via `registry_unified.metadata`), `import_batches.association_name` as the operator record, the absence-means-degrade rule, and the fact that tier-2 has NO substrate.
- [x] **[AI-Review][Low] L1 — the merge is safe against every metadata shape but one.** `COALESCE(metadata,'{}')` covers SQL NULL only; measured on `app_test`, `'null'::jsonb || jsonb_build_object(…)` returns `[null, {…}]` — an ARRAY, whose siblings are unreadable and which is no longer idempotent. **Fixed:** `nonObjectMetadataRows` is counted in the prediction and refuses the write with no override; new test proves it.
- [x] **[AI-Review][Low] L2 — `--dry-run --apply` wrote.** `--apply` was tested first, so a contradictory command line silently wrote 8,278 live rows. **Fixed:** refused with exit 1.
- [x] **[AI-Review][Low] L3 — the drift test did not test the drift it claimed to catch.** It asserted `getImportSourceConfig('imported_association')` against a hardcoded literal — the config agreeing with itself. **Fixed:** `ASSOCIATION_SOURCE` is exported and the test reads that binding. [[pattern-census-counts-sites-not-callers]]

## Residuals

Open items this story has NOT discharged. Each names what reopens or closes it — a residual with no trigger is a wish.

| ID | Residual | State | Close / reopen trigger |
|----|----------|-------|------------------------|
| **R1** — AC3's backfill has not run on prod | The 8,278 live rows still carry no `association_name`. The code is written, rehearsed on `app_test`, and refuses to write against a database that disagrees with the ruling — but a one-shot that has not been fired is a fix that never fires. | **✅ DISCHARGED 2026-09-08 on deploy `9e8235b`.** Both phases applied and verified independently from the database, not from the script report: 56 / 8,222 / 11, `association_name` AFAN 8,233 + ASNAT 56, 11 vouch-traces all `source = public`, 11 audit rows, and the JSONB merge intact (8,278 keep `import_extra`). ⭐ The dry-run REFUSED first — ledger 12 vs predicted 11 — and chasing rather than overriding found two sheet rows matching one respondent. Expectation corrected to 11. | Deploy (so `db:push` lands the column), then `pnpm tsx scripts/_backfill-association-identity.ts --dry-run` on the VPS: expect **56 / 8,222**, `alreadyTagged: 0`. Apply, then re-run `--dry-run` and read `alreadyTagged` = **8,278**. Tracked in `docs/runbooks/backfill-operator-residuals.md` §A. |
| ~~**R2**~~ — the 12 respondents the AFAN import MATCHED rather than inserted | 13-2 records the farming intake as **8,222 inserted / 12 matched**. A matched row keeps its ORIGINAL `import_batch_id`, so neither the confirm-path merge nor phase 1 of the backfill reaches it. Those 12 were on AFAN's list and had already self-registered — the most active cohort in the batch. | ⭐ **RULED 2026-09-07 (Awwal): the vouch ATTACHES** — "yes ⇒ a second small backfill". **BUILT** as phase 2 of the same one-shot, 6 tests. **RESOLVED in code; the write itself rides R1's deploy.** | Closes with R1: the phase-2 probe `SELECT count(*) FROM respondents WHERE metadata ->> 'association_vouched_by_batch_id' IS NOT NULL` must read **12**. ⛔ **Reopens 13-58's AC4** — see R3. |
| **R3** — 13-58's AC4 now contradicts the R2 ruling | AC4 says the badge renders "ONLY for association sources — never for `public`". The 12 people R2 just vouched for **are `public`**: they registered themselves and the import matched them. A source-keyed render condition shows them nothing, and the ruling becomes a fix that never fires — this project's most-repeated defect class. | **✅ RULED AT ADJUDICATION 2026-09-07 — AC4 CORRECTED, R3 CLOSED HERE.** The escalation was right and so was refusing to edit the AC unilaterally. Ruling: **the badge renders on the PRESENCE of `metadata.association_name`, never on `source`.** AC4's INTENT is unchanged — never badge anyone no association vouched for — but `source` was only ever a PROXY for that, and it fails in the direction that silently drops the twelve. Written into 13-58 AC4 as a struck-and-replaced clause with a two-directional RED-verify (a `public` row WITHOUT the key renders nothing; a `public` row WITH it renders the correct body), plus an explicit warning not to re-add a `source` check "for safety" — that re-introduces the bug and looks correct until someone counts the missing twelve. **13-58 now owns the implementation; nothing further is open on 13-67 for this.** | The condition must key on the PRESENCE of `metadata.association_name`, not on `source`. Written into 13-58 as a dated ⛔ block above its ACs. Closes when 13-58 is built with the name-keyed condition and its RED-verify asserts a `public` row WITHOUT the key renders no badge. |

## Dev Agent Record

### Context Reference

- `docs/adjudication-agent-handoff.md` §3 — the 13-58 gate ordering (13-67 → 13-58 → open `PIPELINE_EXCLUDED_STATUSES`).
- `apps/api/src/services/registry-unified.sql.ts` — confirms `metadata` is exposed and `import_batch_id` is not, which is the whole reason for the respondent-side denormalisation.

### Agent Model Used

Claude Opus 5 (1M context) — BMAD `dev-story` workflow, 2026-09-06.

### Debug Log References

- Full API suite, test DB (`NODE_ENV=test`, `…/app_test`): **308 files passed / 2 skipped, 4,364 tests passed / 9 skipped.** No regressions.
- `pnpm --filter @oslsr/api exec tsc --noEmit` — clean.
- `pnpm --filter @oslsr/api lint` — eslint clean; all three drift guards green (registry-read 401 files, respondent-write 401 files, story-residual 322 stories).
- **Code review, 2026-09-06 — gates re-run by the REVIEWER, not read from the report above.** `tsc` clean; `lint` green (registry-read 402, respondent-write 402, story-residual 322 — 402 not 401 because an unrelated concurrent session added `scripts/generate-skills-list.ts` to the tree mid-review). Full API suite on `app_test`: **309 files passed / 2 skipped (311), 4,374 passed / 9 skipped**, exit 0, 284 s. The delta from the dev run's 308 / 4,364 accounts exactly: **+5 tests from the review's fixes** (2 route, 3 backfill/transactionality) and **+1 file / +5 tests from that same unrelated session** (`skills-list.drift.test.ts`) — nothing of this story's moved.
- Code review, CLI exercised for real against `app_test` (`scripts/` is outside tsconfig — RUN it, do not trust `tsc`): `--dry-run --apply` → refused, exit 1; `--apply` without the confirm flag → refused; `--dry-run` → both batch ids absent, "This database is not the one the ruling was measured against", exit 1.
- Code review, residual ledger proven load-bearing: `findDoneStoriesWithOpenResiduals` run against this story with `Status: done` simulated in memory returns **R1 (DISCHARGE-ON-DEPLOY) and R2 (OPEN)** — the ledger blocks a premature close rather than decorating one.
- Operator rehearsal of the backfill against `app_test` with the two RULING batch ids seeded (6 + 5 rows): dry-run predicted 6 / 5 and warned that both diverge from the story's recorded 56 / 8,222; `--apply` updated 6 / 5, both `MATCHES prediction`; **0 rows lost a sibling metadata key**; fixture removed.

### Completion Notes List

- **AC1** — `import_batches.association_name` (nullable text). No hand-written migration: the VPS deploy runs `pnpm --filter @oslsr/api db:push` (ci-cd.yml:1102) BEFORE the app restarts, and an additive nullable column needs no drizzle-kit prompt, so the column exists before any code writes it. Verified materialising on `app_test`.
- **AC2** — the name is merged into each respondent's `metadata` in the SAME transaction as the respondent and its submission. Two things worth knowing: the merge is a spread (siblings preserved), and `hasMeta` is now computed AFTER the merge — computed before, a row whose only metadata was the association name would have been stored as `null` and silently lost its badge.
- **AC3** — backfill logic in `src/lib/association-identity-backfill.ts` (type-checked + tested), thin CLI at `scripts/_backfill-association-identity.ts`. Predicts per batch, applies, compares, and exits non-zero on a mismatch. Refuses to write when either batch id is absent, because a wrong database looks exactly like "0 rows to do".
- **AC4** — supplied at confirm by the operator, trimmed, whitespace-only treated as absence. A test asserts the name is NOT inferred even when both `originalFilename` and `sourceDescription` say "ASNAT" in plain sight.
- **AC5** — four cases plus the merge guarantee, 12 tests, real DB.
- ⚠️ **ONE DELIBERATE READING BEYOND THE AC's LITERAL WORDS, flagged for adjudication.** AC5 says a non-association source "stores nothing". I implemented that as a **400 rejection**, not a silent discard: an operator who typed "AFAN" against an ITF-SUPA upload has misunderstood which batch they are confirming, and dropping the value on the floor would let them believe the provenance was recorded when no row carries it. The batch is not yet written at that point, so the throw leaves nothing behind — "stores nothing" holds either way. **If adjudication prefers a silent ignore, it is a three-line change in `ImportService.confirm`.**
- ⭐ **RED-VERIFIED, not asserted.** Both merge sites were temporarily swapped for a replace (`SET metadata = jsonb_build_object(...)` and `{ association_name }`); exactly the two merge tests went red and the other ten stayed green. Worth recording: the **count check and the idempotency check both stayed GREEN under the replace** — a replace is also idempotent and also updates the predicted number of rows. A count-only backfill test would have shipped the data loss.
- 🐞 **Two holes found in my own fixture while writing it, both of the "test that passes over a hole" family.** (1) Dedup is on phone OR NIN against the whole registry, so re-importing the same two people gave `rowsInserted: 0` and every per-row assertion iterated over an empty set — fixed by minting fresh phones per call. (2) The `imported_other` foil's phone collided with an association row for the same reason; it now uses a separate `0801679…` block. Both fixes add an explicit non-empty assertion before the loop.
- 🐞 The association CSV originally carried no Gender/Town/Trade columns, so `import_extra` was empty and every row's metadata would have been `{ association_name }` alone — the "siblings survived" test would have had no siblings to check. Those columns are now in the fixture on purpose, with a comment saying why.
- **Nothing renders yet, by design** — `imported_unverified` is still in `PIPELINE_EXCLUDED_STATUSES` (13-2 R-A2). This story only makes the name sayable; 13-58 says it, and the gate opens after that.
- **Out of scope and untouched, as the story requires:** the badge itself, tier-2 "Member-verified", and `PIPELINE_EXCLUDED_STATUSES`.
- ⏭️ **NOT RUN ON PROD.** AC3's backfill is written, rehearsed and verified against a test database, but the 8,278 live rows are untouched — that is an operator action behind `--apply --confirm-i-am-not-dry-running`, after deploy. **AC3 is therefore not discharged on prod and should be carried as a residual.**

### File List

**Added**
- `apps/api/src/lib/association-identity-backfill.ts`
- `apps/api/scripts/_backfill-association-identity.ts`
- `apps/api/src/services/__tests__/import.service.association-identity.integration.test.ts`

**Modified**
- `apps/api/src/db/schema/import-batches.ts`
- `apps/api/src/db/schema/respondents.ts`
- `apps/api/src/services/import.service.ts`
- `apps/api/src/services/import/ingest-plan.ts`
- `apps/api/src/routes/imports.routes.ts`
- `_bmad-output/implementation-artifacts/13-67-association-identity-as-structured-data.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Modified by the code review (2026-09-06)**
- `apps/api/src/lib/association-identity-backfill.ts` — `preflightAssociationBackfill()` + `nonObjectMetadataRows` (H1, L1)
- `apps/api/scripts/_backfill-association-identity.ts` — `--accept-count-drift`, mutually-exclusive flags (H1, L2)
- `apps/api/src/services/import.service.ts` — `ASSOCIATION_SOURCE` exported (L3)
- `apps/api/src/services/__tests__/import.service.association-identity.integration.test.ts` — +3 tests (H1, L1, M3), L3 rewritten
- `apps/api/src/routes/__tests__/imports.routes.test.ts` — +2 route tests (H2)
- `docs/runbooks/backfill-operator-residuals.md` — the backfill registered in §A (M1), then both phases (R2)
- `_bmad-output/implementation-artifacts/13-58-marketplace-association-confirmed-badge.md` — re-pointed at the field this story owns (M4), then the AC4 conflict the R2 ruling creates (R3)

**Modified for R2 — the ruling of 2026-09-07 (the vouch attaches to matched respondents)**
- `apps/api/src/lib/association-identity-backfill.ts` — phase 2: `predict/preflight/applyAssociationMatchedBackfill`, hash-forward resolution
- `apps/api/scripts/_backfill-association-identity.ts` — phase 2 in both dry-run and apply, with an operator audit context
- `apps/api/src/db/schema/respondents.ts` — `association_vouched_by_batch_id` on `RespondentMetadata`
- `apps/api/src/services/audit.service.ts` — `OPERATOR_ASSOCIATION_VOUCH_ATTACHED`
- `apps/api/src/services/__tests__/audit.service.test.ts` — action-count tripwire 64 → 65
- `apps/api/src/services/__tests__/import.service.association-identity.integration.test.ts` — +6 tests

## 📋 Session Record — code review + R2 ruling (2026-09-06 → 2026-09-07)

<!--
  Written FOR THE ADJUDICATION AGENT, cold. Everything below is what happened after the dev
  agent handed the story over at `review`, in the order it happened, with the evidence.
  Every number here was MEASURED in this session — not carried over from the dev report,
  which was independently re-run. [[pattern-a-record-about-the-work-is-not-the-work]]
-->

### 0. Where the story actually stands, in four lines

- **All five ACs are implemented and the code is green.** `tsc`, `lint` (three drift guards) and
  the full API suite were re-run BY THE REVIEWER, not read from the dev report.
- **Nothing has run on prod.** The backfill — now TWO phases — is written, tested and rehearsed
  against `app_test`; the 8,278 + 12 live rows are untouched. That is **R1**, open.
- **Nothing is committed.** The whole session ran on the uncommitted working tree, per the house
  rule that review precedes commit. HEAD is still `71635d3`.
- **One open decision is yours: R3.** Awwal's R2 ruling made 13-58's AC4 wrong. See §4.

### 1. What the review found — 9 findings, uncommitted tree, HEAD `71635d3`

Per-finding detail and fixes are in **§Review Follow-ups (AI)** above; this is the shape of it.

| Sev | Finding | Outcome |
|---|---|---|
| HIGH | **H1** — the backfill's predict-then-compare COULD NOT FAIL. `updatedRows === predictedRows` reads the identical predicate twice on a closed batch. The falsifiable number (56 / 8,222) was compared only in `--dry-run`, which `--apply` skips. | Fixed — `preflightAssociationBackfill()` |
| HIGH | **H2** — the ONLY operator-facing input had no test. `association_name` appeared once in the whole repo (the route); every story test called `ImportService.confirm()` directly. | Fixed — 2 route tests |
| MED | **M1** — AC3 was undischarged AND untracked: absent from `docs/runbooks/backfill-operator-residuals.md`. | Fixed — registered, R1 opened |
| MED | **M2** — 12 people the badge would silently skip. | **Escalated → ruled 2026-09-07 → built** (§3) |
| MED | **M3** — AC2's "same transaction" was asserted by a comment and nothing else. | Fixed — `xmin` test |
| MED | **M4** — 13-58 still named 13-2 as owner of the association name and of a "member-confirmed flag" that does not exist. | Fixed — dated re-point block |
| LOW | **L1** — `COALESCE(metadata,'{}')` covers SQL NULL only; a JSON scalar ARRAY-WRAPS the document. | Fixed — counted + refused |
| LOW | **L2** — `--dry-run --apply` together silently WROTE. | Fixed — refused |
| LOW | **L3** — the drift test asserted the config against a hardcoded literal — the config agreeing with itself. | Fixed — reads the exported binding |

### 2. The evidence that matters — three RED-VERIFYs, not three claims

Each mutation was applied to the real tree, run, then reverted and **checksum-verified** against a
pre-mutation backup (`md5sum -c`, plus a `grep -c MUTATION` = 0 residue check).

1. **H2** — replaced the route's wiring with `associationName: null`. Before the fix the ENTIRE
   suite stayed green under that mutation. After it, **exactly one test fails**, the new one.
2. **M3** — moved the metadata merge to a post-commit second pass. **14 of 15 tests stayed green,
   including *"the name is MERGED into metadata, leaving the import provenance intact"*** — an
   idempotent merge produces an identical end state, which is exactly why no end-state assertion
   could ever see the difference. Only the new `xmin` test went red.
3. **R2** — removed the in-sheet-duplicate distinction (`withHash = matched`). **6 tests red.**

⭐ The generalisable lesson: in all three cases **the suite was green over the hole**. Green was
never the evidence; the mutation was. [[pattern-test-that-passes-over-a-hole]]

### 3. Awwal's ruling of 2026-09-07 (R2), and what was built from it

**Question put:** does an association's vouch attach to someone who registered themselves BEFORE the
import and was then matched by dedup? **Ruling: YES** — *"a second small backfill (I accept this
recommendation)"*.

Built as **phase 2** of the same one-shot. Three things adjudication should know:

- **It cannot reuse phase 1's predicate.** A matched row is never written by the import: it keeps
  its own `import_batch_id` (these people are `source = public`), so `WHERE import_batch_id = …`
  cannot reach it. The only surviving link is the batch's own
  `failure_report.dispositions[].matchedRespondentIdHash` — `sha256(respondent.id)`, one-way by
  design so the report carries no PII cross-link. Resolution therefore hashes **forward** over the
  register (keyset-paginated, no pgcrypto dependency).
- 🔍 **A discovery that changes the number: not every `matched` disposition is a person.**
  `nin_match_in_batch` (`ingest-plan.ts:195`) means one SHEET row repeated a NIN from an earlier
  SHEET row — it carries no hash and points at nobody. Counting `category === 'matched'` would
  over-predict and then report a mismatch nobody could explain. (A repeated PHONE is NOT this case:
  `ingest-plan.ts:232` INSERTS it and flags `identityAmbiguous`, because a shared handset may be a
  household rather than a duplicate person.)
- **It writes a trace, because the subject did not ask for this.** Each person gets
  `metadata.association_vouched_by_batch_id` — phase 1 deliberately does NOT write this, since
  phase 1's rows are identifiable forever by `import_batch_id` and these are not — plus one
  `operator.association_vouch_attached` audit row. The audit action-count tripwire moved 64 → 65.

It refuses BEFORE writing on: a hash resolving to nobody (never a silent 11-of-12), a target already
carrying a DIFFERENT body's name (that needs a ruling, not a flag), non-object metadata, and a
matched count disagreeing with the ledger's 12. Phase 2 runs only after phase 1 matched its own
prediction — a suspect bulk write is not a reason to annotate twelve live citizen records on top.

### 4. ⛔ The open decision — R3, and why it was not mine to make

Those 12 people are **`source = public`**. 13-58's **AC4 says the badge renders "ONLY for association
sources — never for `public`"**. So a source-keyed render condition shows them nothing, and the
ruling just made becomes a fix that never fires — this project's most-repeated defect class. The
condition has to key on the **presence of `metadata.association_name`**, not on `source`.

Written into 13-58 as a dated ⛔ block above its ACs, and carried here as **R3**. Deliberately NOT
edited into AC4: an AC change belongs to adjudication.

### 5. What was verified, and what was NOT

**Verified by running it, this session:**

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `lint` (eslint + 3 drift guards) | green — 402 / 402 / 322 |
| Full API suite vs `app_test` — baseline, before any fix | 308 files, **4,364** passed / 9 skipped |
| Full API suite — after the review fixes | 309 files, **4,374** passed / 9 skipped |
| Full API suite — after R2 | 309 files, **4,381** passed / 8 skipped, exit 0 |
| CLI flag paths, RUN not type-checked (`scripts/` is outside tsconfig) | `--dry-run --apply` refused; `--apply` without confirm refused; `--dry-run` against a DB missing the batches refused with the wrong-database message |
| Operator rehearsal on a seeded `app_test` fixture | dry-run printed BOTH phases (`matchedWithHash: 2`, `inSheetDuplicates: 1`, ASNAT a PREDICTED 0); `--apply` refused without `--accept-count-drift`; with it both phases wrote and matched; the re-run showed `alreadyTagged` — the "did we run it?" probe works |
| The data after that rehearsal | phase-1 siblings intact with NO vouch key; the two `public` rows carried AFAN + the batch id with their own verbatim data untouched; audit rows present. Fixture torn down, **0 residue rows** |
| Audit chain after phase 2 wrote to it | **0 self-hash failures — no tamper signal.** The chain's INVALID is the pre-existing ordering/concurrency property, first divergence **2026-08-07**, a month before this work → [[audit-chain-invalid-is-ordering-not-tampering]] |
| The residual ledger is load-bearing | ran the guard's own parser against this story with `Status: done` simulated in memory: **R1 and R3 both return as blockers** |

⚠️ **Suite-number accounting, because a moving total is how a regression hides.** 4,364 → 4,374 is
+5 review tests and +1 unrelated FILE (`skills-list.drift.test.ts`, 5 tests) written into the tree
mid-review by a CONCURRENT session — its four skills-list / enumerator-PDF files are not this
story's and were left untouched. 4,374 → 4,381 is +6 R2 tests **and one previously-skipped test that
ran**: `auth.activation.test.ts`'s S3 case is gated on a live HEAD request to DigitalOcean Spaces
and the network allowed it that time. Nothing of this story's moved. The lint count reads 402 rather
than the dev report's 401 for the same reason — the concurrent session's script.

**NOT verified, and not verifiable from here:**

- **Nothing has touched prod.** Both phases are unrun. R1 carries that.
- The **56 / 8,222 / 12** figures are 13-2's prod measurements, re-read from its ledger, **not**
  re-measured this session. The backfill now REFUSES if the database disagrees with them — but the
  first person to run `--dry-run` on the VPS is the first person to confirm them.

### 6. What the next agent should do, in order

1. **Commit** the tree (nothing was committed, by design) and deploy — `db:push` (ci-cd.yml:1102)
   lands `import_batches.association_name` before the app restarts.
2. **Run `--dry-run` on the VPS.** Expect phase 1 **56 / 8,222**, `alreadyTagged: 0`,
   `nonObjectMetadata: 0`; phase 2 **12**, `matchedWithHash: 12`, `unresolved: 0`, `conflicts: 0`.
   ⛔ If any number differs, that IS the finding — do not reach for `--accept-count-drift` to make
   it go away.
3. **Apply**, then re-run `--dry-run`: phase 1 `alreadyTagged` = 8,278, phase 2 = 12. **Close R1.**
4. **Rule on R3** before 13-58 is built, or those 12 cards render nothing.
5. Only then 13-58 — and only after that, open `PIPELINE_EXCLUDED_STATUSES` (13-2 R-A2).

### 7. Traps in THIS work that a fresh agent will hit

1. **The tests use the REAL prod batch ids as fixtures** (`01a071c8…`, `01a072ae…`) and one test
   DELETES them. That is safe only because `apps/api/test/db-guard.ts` refuses a non-test
   `DATABASE_URL`. Never run this suite with `DATABASE_URL` pointing anywhere but `…/app_test`.
2. **The fixtures deliberately DIVERGE from the ruling counts** (2 rows, not 56 / 8,222 / 12), so
   every test that writes passes `acceptCountDrift: true`. That is not a workaround: one test
   asserts the refusal, and the divergence is what makes the guard observable at all.
3. **`xmin` is doing real work** in the AC2 transactionality test — it is the id of the transaction
   that wrote a row VERSION, so a post-commit `UPDATE` moves it. Do not "simplify" that test into
   re-reading `metadata`; that is precisely the assertion that could not see the bug.
4. **`ASSOCIATION_SOURCE` is exported for exactly one reason** — so the drift test reads the binding
   the service branches on rather than a copy of the literal. Do not re-inline it.
5. **Phase 1 and phase 2 are different predicates over different people.** Never sum their counts
   into one "rows updated" figure; the CLI reports them separately on purpose.

## ✅ R1 DISCHARGED ON PROD — 2026-09-08, deploy `9e8235b`

Both phases applied and **independently verified**, not read from the script's own report.

| | predicted | updated |
|---|---|---|
| phase 1 — ASNAT | 56 | **56** |
| phase 1 — AFAN | 8,222 | **8,222** |
| phase 2 — AFAN (matched) | 11 | **11** |

Read back straight from the database afterwards: `association_name` = **AFAN 8,233 / ASNAT 56**;
`association_vouched_by_batch_id` on **11** rows, **all `source = public`** — exactly the R2 cohort
and nobody else; **11** `operator.association_vouch_attached` audit rows.

⭐ **THE MERGE HELD, which was the single most destructive thing this could have got wrong.**
After the write, **8,278** rows still carry `import_extra` and **8,279** still carry
`normalisation_warnings`. A `SET metadata = '{…}'` would have destroyed the R2 identity-ambiguity
flags and the verbatim `full_name` that R-A6 depends on for recovery. It did not.

### ⭐ The dry-run refused, and it was RIGHT — the ledger said 12, the truth is 11

Phase 2 predicted **11** against a ledger figure of **12** and the guard refused to write. The
review's instruction was explicit — *"if any number differs, that IS the finding; do not reach for
`--accept-count-drift` to make it go away"* — so it was chased, not waved through:

```
matched dispositions      : 12
with a hash               : 12
DISTINCT hashes           : 11   <-- the answer
hashes that resolve       : 12
DISTINCT respondent ids   : 11
people matched more than once: 1  (019e4422… twice)
```

**Two different rows in the AFAN sheet matched the SAME existing respondent.** The twelfth was never
a missing person; it was one person counted twice. `willUpdate = 11` was correct all along — the
resolution code already de-duplicated (`new Set` over the resolved ids); only the *expectation* was
wrong, inherited from a ledger figure that counts DISPOSITIONS.

⚠️ **This is a SECOND variant of "not every matched disposition is a person", distinct from the
`nin_match_in_batch` case the review found.** There, a sheet row duplicated an earlier sheet row and
carried NO hash. Here, two sheet rows each carried a hash and both resolved to one existing
registrant. **A count that means DISPOSITIONS must never be compared against a count that means
PEOPLE** — and the guard existed precisely so a human had to notice the difference.

`storyExpectedMatchedRows` corrected 12 → 11 in `association-identity-backfill.ts`, with the
reasoning at the constant so the next reader does not repeat this investigation, and the refusal
test re-pointed to 11 (21/21 green).

## Change Log

| Date | Change |
|---|---|
| 2026-09-06 | Tasks/Subtasks authored from AC1–AC5 (the story was carved with ACs only); status `ready-for-dev` → `in-progress`. |
| 2026-09-06 | AC1–AC5 implemented: `import_batches.association_name`, operator input at confirm, respondent-metadata merge in the ingest transaction, backfill module + CLI, 12 real-DB tests. Status → `review`. |
| 2026-09-07 | ⭐ **AWWAL RULED R2: the vouch ATTACHES to the 12 people the AFAN import MATCHED rather than inserted.** Built as **phase 2** of the same one-shot. It cannot reuse phase 1's predicate — a matched row keeps its own `import_batch_id` — so it resolves the batch's own `failure_report` match hashes by hashing `sha256(id)` FORWARD over the register. Two discoveries worth keeping: **(1) not every `matched` disposition is a person** — `nin_match_in_batch` means one SHEET row duplicated another and carries no hash, so counting `category === 'matched'` would over-predict (RED-verified: removing that distinction fails 6 tests); **(2) these rows are `source = public`**, so 13-58's AC4 as written renders them nothing — opened as **R3**, flagged in 13-58, not silently edited. Phase 2 writes `association_vouched_by_batch_id` and one `operator.association_vouch_attached` audit row per person, because a live citizen's record is being annotated with a third party's claim they did not ask for. |
| 2026-09-06 | **Adversarial code review on the uncommitted tree — 9 findings, 8 fixed, 1 escalated (R2).** Two were RED-VERIFIED by mutation, and both mutations left the rest of the suite green, which is the point: (1) breaking the route's `association_name` wiring passed 4,364 tests, and (2) moving the metadata merge to a post-commit second pass passed 14 of 15 story tests including the MERGE test. The backfill's `--apply` now refuses a database that disagrees with the ruling's 56 / 8,222 — its old predict-vs-updated comparison read the same predicate twice and could not fail. Residual ledger opened: **R1** (backfill not run on prod, DISCHARGE-ON-DEPLOY) and **R2** (the 12 matched AFAN respondents — needs Awwal's ruling). Status stays `review`. |

# Story 13-64: The data-loss marker stopped at midnight and the hemorrhage did not — six respondents in the wrong bucket

Status: ready-for-dev

<!-- Authored 2026-08-21 by Bob (SM), carved from Story 13-46's residual ledger row **R7** (Low, OPEN,
"SM (Bob) to file"). Small, self-contained, and deliberately NOT folded into a larger data story.

The shape: 9-26 Part B's marker backfill defaulted its upper bound to `2026-05-20` **UTC midnight**,
described in its own source as "the Part A deploy cutover". The fix did not deploy at midnight. Six
public respondents registered between 02:18 and 06:28 UTC that morning — after the bound, before the
deploy — lost their answers to the same handler bug as the other 49 and carry no marker to say so. They
therefore derive as `no_submission` ("never filled it in") instead of `data_lost` ("we lost it"), which
is the difference between a citizen who did not answer and a citizen we failed.

⚠️ **This is not "re-run the script with a later --until".** The cohort predicate does NOT check whether a
respondent actually has answers, so widening the window would stamp an irreversible loss marker onto
people whose data is perfectly fine. See AC2 — the predicate has to be narrowed in the same change that
widens the window. -->

## Story

As **the registry owner publishing a data-completeness taxonomy**,
I want **the six respondents whose answers were lost on the morning of the 9-26 fix to carry the same loss marker as the other 49**,
so that **the registry's own record distinguishes "this citizen never answered" from "we lost this citizen's answers" — for all 55 of them, not 49 of them.**

## Context & Evidence (verified 2026-08-21; prod figures from the 13-46 adjudication pass, flagged as such)

### 1. What the marker means, and what its absence therefore asserts

`deriveDataStatus` (`apps/api/src/services/registry-data-status.ts:61-69`) is the canonical taxonomy atom
— pure, DB-free, and the single source of truth for "what state is this respondent in?" (`:10-16`). Its
precedence list is explicit:

```ts
if (input.hasSubmissionData) return 'completed';                            // :62
if (input.metadata?.questionnaire_data_lost === true) return 'data_lost';   // :63
…
return 'no_submission';                                                     // :68
```

The two buckets in play are documented at `:28` and `:32`:

- `data_lost` — *"metadata.questionnaire_data_lost — row exists, answers irrecoverable (pre-2026-05-20 hemorrhage)"*
- `no_submission` — *"respondent row with no questionnaire submission and none of the above"*

**A missing marker is not a neutral absence — it is a positive claim.** `no_submission` says the person
never completed a questionnaire. For these six, they did; the pre-9-26 wizard handler dropped the answers
on the floor, and the request bodies were never logged, so they are unrecoverable
(`_backfill-wizard-questionnaire-loss.ts:4-11`). The registry currently records the state of six citizens
as their own non-participation.

### 2. 🔴 The root cause is one constant, and it is a timezone-shaped assumption

`apps/api/scripts/_backfill-wizard-questionnaire-loss.ts`:

```ts
const DEFAULT_SINCE = '2026-05-14';
const DEFAULT_UNTIL = '2026-05-20'; // Part A deploy day (UTC midnight)      // :55
```

and the cohort predicate (`buildCohortQuery`, `:157-176`):

```ts
sql`${respondents.source} = 'public'`,
gte(respondents.createdAt, args.since),
lt(respondents.createdAt, args.until),                                        // :172
sql`(${respondents.metadata}->>'questionnaire_data_lost') IS DISTINCT FROM 'true'`,
```

`parseDateFlag` (`:94-103`) comments *"`new Date('YYYY-MM-DD')` parses as UTC midnight"*. So the bound is
`2026-05-20T00:00:00Z` — the **start** of the deploy day, not the deploy. The script's own header
(`:20-24`) states the intent correctly: *"Respondents created AFTER Part A deployed have their full
questionnaire data persisted … and MUST NOT be marked."* The intent is right; the constant is a day
boundary standing in for a deploy timestamp, and the six-hour gap between them is the defect.

**The evidence fits the theory exactly**, which is why this is a defect and not a hypothesis: prod carries
**zero** marked rows created on or after 2026-05-20 (measured 2026-08-21), i.e. the bound bit precisely
where the code says it would.

### 3. The six (prod, 13-46 adjudication pass, 2026-08-21)

| Reference code | Source | Created (UTC) |
|---|---|---|
| `OSL-2026-BECYNP` | `public` | 2026-05-20, between 02:18 and 06:28 |
| `OSL-2026-4RRPPA` | `public` | ″ |
| `OSL-2026-P9NESM` | `public` | ″ |
| `OSL-2026-RKTVAR` | `public` | ″ |
| `OSL-2026-99Y46Z` | `public` | ″ |
| `OSL-2026-T50C36` | `public` | ″ |

All six: `source='public'`, no submission, no marker. **49 of the 55 submission-less respondents ARE
correctly marked**; these six are the tail. ⚠️ Every figure here is a 2026-08-21 measurement and the
registry is live (327 respondents and climbing) — **re-measure before acting**, per AC1.

### 4. ⚠️ Why the obvious fix is wrong

The cohort predicate (§2) filters on `source`, a date window, and idempotency. **It does not check whether
the respondent has answers.** It was safe in the original run only because every public respondent inside
14-19 May had lost their answers by construction.

That is no longer true of the 20 May window: the fix deployed that morning, so respondents created later
the same day **do** have their answers persisted. Re-running with `--until 2026-05-21` would stamp
`questionnaire_data_lost = true` on people whose data is intact — and that marker is:

- **read raw by the export**, which renders `questionnaireDataLost: 'Yes'`
  (`apps/api/src/services/export-query.service.ts:341,375`), so a healthy record would publish as lost;
- **irreversible in practice** — it is an operator-audited claim about what we know we don't have.

`deriveDataStatus` would still return `completed` for those rows (`hasSubmissionData` outranks the marker,
`:62`), so the taxonomy would *hide* the mistake while the export published it. **A wrong marker is worse
than the missing one this story exists to fix.** AC2 narrows the predicate in the same change that widens
the window.

### 5. Where this is read, stated accurately — no overclaim

- **Export** — `export-query.service.ts:341` derives the status per row and `:375` publishes the raw
  marker as a `Yes/No` column. This is where the six read wrong today.
- **`registryTotals` (12-4)** — `registry-totals.service.ts:627-632` runs `deriveDataStatus` in the
  single per-person pass, so `byDataStatus` mis-buckets six people; consumed by the internal dashboard
  strip (`RegistrySummaryStrip`) and inherited by **12-6 Data Health**, whose entire purpose is to render
  this taxonomy.
- **Public `/insights`** — ⚠️ **be precise: the six do NOT move a published number today.** 13-46 AC5 put
  the *verification* axis on the public page (`byVerification.nin_on_file`, "with NIN on file"), not the
  data-status axis, and `withAnswers` is unaffected because both buckets are answer-less either way. What
  13-46 changed is the **stakes**: the same per-person pass in the same model now feeds an
  unauthenticated, government-facing page, and 12-6 is queued to render the data-status axis directly.
  This is a data-honesty defect in the record; it is not, today, a wrong number on the public site. Say
  it that way in any close-out.

## Non-goals

- **Not a recovery attempt.** The dropped answers are unrecoverable — request bodies were never logged
  (`_backfill-wizard-questionnaire-loss.ts:7-8`). This story fixes the *record of the loss*, not the loss.
- **No taxonomy change.** `deriveDataStatus` is correct and stays untouched; the input data is wrong.
- **No new script.** Extend the existing 9-26 Part B script — it already carries the dry-run gate, the
  per-row audit entry, and the idempotency predicate.

## Acceptance Criteria

1. **AC1 — Re-measure on prod first, and establish the REAL Part A deploy timestamp from evidence.**
   Before any write:
   - Re-run the census read-only: submission-less respondents, how many carry the marker, how many do not,
     and the exact `created_at` of each unmarked row. The 55/49/6 figures are from 2026-08-21 and the
     registry is live.
   - **Establish when 9-26 Part A actually deployed**, from the deploy record (CI run / commit / prod SHA
     history) — not from the story's prose and not from the script's constant. 🔴 **This is the load-bearing
     input.** If Part A deployed *before* 02:18Z, these six are not hemorrhage victims and marking them
     would be a fabrication; the story is then discharged by NOT writing, with the finding recorded.
   - Only respondents created **strictly before** the measured deploy timestamp qualify.
2. **AC2 — Narrow the cohort predicate in the SAME change that widens the window.**
   `buildCohortQuery` (`:157-176`) must additionally require that the respondent has **no submission
   carrying non-empty `raw_data`** — the same emptiness test the rest of the codebase agrees on
   (`hasNonEmptyRawData`, `registry-data-status.ts:76-79`).
   - Without this, widening `--until` past the deploy stamps an irreversible loss marker on people whose
     data is intact (§4). **The window and the predicate change together or not at all.**
   - The existing unit test that locks the cohort SQL
     (`apps/api/scripts/__tests__/_backfill-wizard-questionnaire-loss.test.ts:85-96`) is extended to pin
     the new predicate — that test exists precisely because *"the cohort SQL decides which rows get
     stamped and must not silently drift"* (`:150-156` of the script).
   - `--until` already accepts a full ISO timestamp in practice (`parseDateFlag` is `new Date(value)`,
     `:94-103`), but nothing documents or tests it and the error message says `YYYY-MM-DD`. Make the
     timestamp form explicit in `HELP_TEXT` and cover it with a test, so the next operator does not
     re-discover the midnight assumption the hard way.
3. **AC3 — Predict the outcome from prod BEFORE the run, then compare.**
   Record, before writing: the exact rows the dry run selects, the expected marked/unmarked counts after,
   and the expected `byDataStatus` shift (`data_lost` +6, `no_submission` −6, everything else unchanged).
   - Then run live and compare each figure. ⭐ *"It moved" passes for any change, including a wrong one* —
     this is the discipline that caught 13-38's inherited "224 live cards" really being 235
     ([[pattern-batch-job-races-live-users]] · the 12-4 prediction rule).
   - ⚠️ **Name the quantity precisely.** "Six respondents" is a *respondent* count; state separately how
     many rows the update touches and how many audit entries it emits, and check they agree.
4. **AC4 — Dry run first, then the live run, with the audit trail intact.**
   - `--dry-run` is mandatory first (the script enforces it, `:192-200`); paste its masked cohort output
     into the Dev Agent Record.
   - Live run via `--confirm-i-am-not-dry-running`, emitting one
     `OPERATOR_BACKFILL_DATA_LOSS_MARKER` audit entry per row (`audit.service.ts:141`) — six rows, six
     entries.
   - **Re-run to prove idempotence:** the second invocation must select **0** rows (the
     `IS DISTINCT FROM 'true'` predicate, `:173`). A backfill that cannot prove idempotence has not been
     proven safe to re-run.
5. **AC5 — Verify against the derived taxonomy, not just the marker column.**
   After the run, assert that `deriveDataStatus` now returns `data_lost` for all six — read through the
   canonical model (`registry-totals.service.ts:627-632`), not by re-reading the metadata you just wrote.
   Re-derive `byDataStatus` on prod and confirm it matches AC3's prediction exactly.
   ⚠️ **Do not "restore to a baseline number"** — re-measure. A figure that moved because a real
   registration arrived mid-run is CORRECT and must be left alone.
6. **AC6 — Correct the script's own record so this cannot recur.**
   The header comment at `:20-24` and the `DEFAULT_UNTIL` comment at `:55` both describe the bound as "the
   Part A deploy cutover". Amend both to say what it actually is — a **UTC-midnight day boundary**, which
   is six hours earlier than the deploy — and record this story as the correction.
   **Prose is not type-checked, and a comment that still asserts the wrong thing is how the next operator
   re-derives the same bound.**
   ⚠️ `scripts/` sits outside `tsconfig` — **run the script, do not trust `tsc`**.

## Tasks / Subtasks

- [ ] **Task 1 — Measure and establish the deploy timestamp (AC: 1)**
  - [ ] Read-only census: submission-less respondents, marked vs unmarked, with `created_at`
  - [ ] Find 9-26 Part A's real prod deploy time from the deploy record; record the source of that fact
  - [ ] 🔴 If the deploy precedes 02:18Z, STOP — record the finding and discharge without writing
- [ ] **Task 2 — Narrow the predicate, widen the window (AC: 2)**
  - [ ] Add the "no submission with non-empty `raw_data`" condition to `buildCohortQuery`
  - [ ] Extend the cohort-SQL lock test; add an ISO-timestamp `--until` test; update `HELP_TEXT`
- [ ] **Task 3 — Predict, then run (AC: 3, 4)**
  - [ ] Write the prediction (rows, counts, `byDataStatus` delta) into the Dev Agent Record FIRST
  - [ ] `--dry-run`; paste the masked cohort
  - [ ] Live run with the correct `--since`/`--until`; confirm 6 rows and 6 audit entries
  - [ ] Re-run; assert 0 rows selected
- [ ] **Task 4 — Verify through the model (AC: 5)**
  - [ ] `deriveDataStatus` returns `data_lost` for all six, read via the canonical per-person pass
  - [ ] Re-derive `byDataStatus`; compare to the prediction figure by figure
- [ ] **Task 5 — Fix the script's prose (AC: 6)**
  - [ ] Amend `:20-24` and `:55`; run the script (not `tsc`) to prove it still works

## Dev Notes

### Why this is Low severity and still worth a story

Six people, no published number moves today (§5). What makes it worth writing down is the *class*: a
backfill that keyed on a **day boundary** while its comments claimed a **deploy boundary**, and produced a
clean-looking result — 49 rows marked, zero errors — that nobody had reason to doubt. It surfaced only
because 13-46 went looking at the taxonomy for a different reason. The census-shaped question *"is the
count of marked rows the same as the count of rows that should be marked?"* was never asked, only
*"did the script run?"* ([[pattern-a-record-about-the-work-is-not-the-work]]).

### The trap, restated for whoever picks this up

**The cohort predicate does not know what "lost" means.** It knows a date window and a source. In the
original window those were sufficient because everyone in it had lost their answers; one day later they
are not. Widening the window without narrowing the predicate converts a small honest gap into six —
or more — false claims of data loss on people whose records are fine, published straight into the export
column at `export-query.service.ts:375`. **The window and the predicate move together.**

### Dependencies and relationships

- **9-26 Part B (`done`)** — owns the script and the original run. This story corrects its tail and its
  comments; it does not reopen 9-26.
- **9-59 (`done`)** — owns `registry-data-status.ts`, the canonical taxonomy. **Unchanged by this story**
  — the atom is correct, the input data is wrong.
- **12-4 (`done`, on prod)** — the `registryTotals` model whose per-person pass consumes the atom;
  `byDataStatus` is what shifts.
- **12-6 (`ready-for-dev`)** — Data Health view, which renders this taxonomy. **Best done before 12-6
  ships**, so the view is not born displaying six rows in the wrong bucket.
- **13-46 (`in-progress`)** — where this was found (residual R7).

### Testing standards

- API single file: `pnpm vitest run apps/api/scripts/__tests__/_backfill-wizard-questionnaire-loss.test.ts`
- ⛔ **One vitest suite at a time across BOTH worktrees** — a pre-push hook runs the full suite per tree.
- ⚠️ **`scripts/` is outside `tsconfig`** — a green `tsc` says nothing about this file. **Run it.**
- The cohort-SQL test asserts via `.toSQL()` and needs no DB connection, which is why it is the right
  place to pin the new predicate.

### Project Structure Notes

- `apps/api/scripts/_backfill-wizard-questionnaire-loss.ts` — predicate, window, `HELP_TEXT`, comments
- `apps/api/scripts/__tests__/_backfill-wizard-questionnaire-loss.test.ts` — cohort-SQL lock
- Prod operation only otherwise; **no schema change, no migration, no service change**
- Log the run in `docs/runbooks/backfill-operator-residuals.md` (the run-tracker for
  [[pattern-ship-a-fix-that-never-fires]])

### References

- [Source: `apps/api/src/services/registry-data-status.ts:10-16,28,32,61-69,76-79`] — the canonical atom,
  the two bucket definitions, the precedence list, `hasNonEmptyRawData`
- [Source: `apps/api/scripts/_backfill-wizard-questionnaire-loss.ts:4-11,20-24,54-55,94-103,157-176,192-200`]
  — the loss description, the "MUST NOT be marked" intent, `DEFAULT_UNTIL`, the UTC-midnight parse, the
  cohort query, the dry-run gate
- [Source: `apps/api/scripts/__tests__/_backfill-wizard-questionnaire-loss.test.ts:85-96`] — the existing
  cohort-SQL lock and its stated reason
- [Source: `apps/api/src/services/export-query.service.ts:341,375`] — where the raw marker is published as
  a `Yes/No` column
- [Source: `apps/api/src/services/registry-totals.service.ts:627-632`] — the single per-person pass that
  derives `byDataStatus`
- [Source: `apps/api/src/services/audit.service.ts:141`] — `OPERATOR_BACKFILL_DATA_LOSS_MARKER`
- [Source: `_bmad-output/implementation-artifacts/13-46-public-burst-readiness-send-caps-and-registration-throttle.md`
  § Residual ledger R7] — the six reference codes and the 2026-08-21 measurement

## Dev Agent Record

### Context Reference

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-08-21 | **Story drafted** from 13-46 residual **R7**. Root cause traced to one constant rather than left as a symptom: `_backfill-wizard-questionnaire-loss.ts:55` sets `DEFAULT_UNTIL = '2026-05-20'`, which `parseDateFlag` parses as **UTC midnight** while the surrounding comments call it "the Part A deploy cutover" — the deploy was hours later that morning, and the six respondents created 02:18-06:28Z fall in the gap. Corroborated by the shape of the prod data: **zero** marked rows exist on or after 2026-05-20, exactly where the bound says it would bite. ⚠️ **The obvious fix is a trap and the story says so up front:** `buildCohortQuery` (`:157-176`) filters on source + window + idempotency and **never checks whether the respondent has answers**, so simply widening `--until` would stamp an irreversible loss marker on people whose data is intact — published straight into the export's `questionnaireDataLost: 'Yes'` column (`export-query.service.ts:375`) while `deriveDataStatus` hides it behind `completed`. AC2 therefore narrows the predicate in the SAME change that widens the window. AC1 makes the real deploy timestamp a load-bearing input to be found in the deploy record, with an explicit STOP: if Part A deployed before 02:18Z these six are not hemorrhage victims and marking them would be a fabrication. AC3 requires a prediction before the run (12-4's rule — "it moved" passes for any change, including a wrong one). **Scope stated honestly rather than inflated:** the six do NOT move a published number today — 13-46 AC5 put the *verification* axis on `/insights`, not data-status, and `withAnswers` is unaffected because both buckets are answer-less; what changed is the stakes, since the same per-person pass now feeds an unauthenticated page and 12-6 will render this axis directly. Low severity, self-contained, best done before 12-6 ships. 6 ACs / 5 Tasks. Status `ready-for-dev`. | Bob (SM) |

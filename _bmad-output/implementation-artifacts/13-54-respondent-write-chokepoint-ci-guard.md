# Story 13.54: Make an un-guarded respondent write impossible

Status: review

<!-- EMERGENT 2026-08-07 from the 13-53 adversarial review (T1) + adjudication (T3). Raised because
the same defect has now been fixed by hand three times, and each fix protected one more caller
rather than the class. -->

## Story

As **the person who will otherwise adjudicate this bug a fourth time**,
I want **CI to fail when a respondent is written outside the sanctioned chokepoint**,
so that **the next ingestion path cannot silently skip the identity guard — and we stop discovering
it the way we discovered the last two: a live citizen holding two records.**

## Context — this is the same bug, three times, each fixed one caller at a time

| story | what was found | how it was found |
|---|---|---|
| **R13** | identity guard added to `findOrCreateRespondent` | design |
| **R21** (13-49) | **the public wizard does not call that function** — it inserts directly | a live duplicate |
| **13-53** | **the NIN-arrival direction does not call it either** | a live duplicate (`56C9PG`/`W1PS38`) |

Every fix added the guard to **one more caller**. That is not a converging series — it is the same
sentence written three times, and the next path added will miss it too.

**Both discoveries cost a real citizen two records.** Neither was found by review, tests, or types;
both were found by a whole-register sweep after the fact.

⚠️ **The evidence is unusually clear for a preventative story.** The usual objection — *"this guard
protects against something hypothetical"* — does not apply. It has happened twice, in production,
to named people, eight weeks apart.

## Acceptance Criteria

### AC1 — A lint guard that fails CI on an un-sanctioned respondent write
1. `apps/api/scripts/lint-respondent-write-drift.ts`, modelled on the **proven** sibling
   `lint-registry-read-drift.ts` (366 files, 0 hits, already in `pnpm lint`). Same shape: pure
   detector in `src/lib/`, thin I/O + exit code in `scripts/` — because **`scripts/` is outside
   tsconfig and is never type-checked**, so logic there is invisible to `tsc`.
2. It fails when `insert(respondents)` (or an equivalent raw `INSERT INTO "respondents"`) appears
   anywhere outside the sanctioned set.
3. **The sanctioned set is an explicit allowlist with a REASON per entry**, not a directory rule.
   Today that is `submission-processing.service.ts`, `registration.controller.ts`, the import
   service, and the seeds. An entry without a reason is a hole with a comment.
4. Wired into the api `lint` chain so it fires in **pre-commit AND CI** — and, per **Pitfall #45**,
   the step must sit ABOVE the broader lint step or it never runs.
5. **RED-verify:** add an `insert(respondents)` to a scratch file, prove CI fails, remove it.
   A guard nobody has watched fail is a guard nobody knows works.

### AC2 — The message has to teach, because it fires on someone who does not know this history
1. Name the file and line, state that respondent creation must route through the chokepoint, and
   say **why in one sentence** — that bypassing it skips the identity guard and has twice produced
   a citizen with two records.
2. Give the escape hatch explicitly: add to the allowlist **with a reason**, and say that doing so
   without one is how this class returns.

### AC3 (was T3) — Make the negative control re-runnable instead of testimony
1. Add `--negative-control` to `nin-arrival:smoke`: neuter the promote branch in-process, run the
   same two-pass, and assert **the duplicate REAPPEARS** (2 records on one phone, a different
   reference code) — then restore.

> ⚠️ **MECHANISM CHANGED 2026-08-08 (adjudication). AC3.1 as written is IMPOSSIBLE.** ESM namespace
> exports are read-only, non-configurable bindings (`Cannot assign to read only property … of object
> '[object Module]'`), and a direct import binding could not be patched even if the namespace were
> writable. `tsx` cannot do this; vitest can, because it controls module resolution. Built instead as
> a vitest integration test against the real test DB, mocking only the promote, asserting on ROWS and
> paired with the un-mocked case.
>
> The rejected alternative was a test-only injection seam in production `respondent-identity.ts` —
> ruled out **on principle, not cost**: shipping a supported, env-gated way to disable the identity
> guard, inside the story whose purpose is to make bypasses impossible, is self-defeating. It is also
> the class closed three days earlier (`EMAIL_TIER` unset → the budget guard enforced FREE on a Pro
> account); a fresh `NODE_ENV`-gated switch over citizen data reintroduces it.
>
> **This is a mechanism change, not a scope cut.** AC3.2 asks for "a permanent, re-runnable asset".
> CI runs a test on every push; nobody has to remember to type a flag — and 13-53's `pm2 logs | grep`
> was re-runnable in principle too, then closed as handed-over precisely because nobody was ever
> going to run it.
2. ⚠️ **This is the strongest evidence 13-53 produced, and it currently exists only as a sentence in
   Completion Notes describing something a person did once by hand.** Every count in that story's
   baseline was already zero, so absence proves nothing; only "remove the guard and the bug comes
   back" distinguishes a working guard from an absent one.
3. Roughly twenty lines. It converts the best evidence we have into a permanent, re-runnable asset.

## Out of scope

- **Unifying the three promote-to-active paths — that is 13-55.** This story stops NEW un-guarded
  writes; 13-55 consolidates the ones that exist. Bundling them makes neither shippable.

## Dev Notes

> Authored by Bob (SM) 2026-08-08 in **scaffold mode** against an existing emergent story. AC1/AC2/AC3
> were written during 13-53's adversarial review and are **deliberately left untouched** — they carry
> evidence (a named citizen, a measured sibling) that a regeneration pass would sand off.

### D1. The write-site inventory — MEASURED 2026-08-08, not re-derived

Run before authoring, so the story states facts rather than recollections:

| | sites | |
|---|---|---|
| `insert(respondents)` — **production** | **4** | `submission-processing.service.ts:845` · `registration.controller.ts:919` · `import.service.ts:447` · `seed-projected-scale.ts:235` (raw SQL) |
| `insert(respondents)` — fixtures | ~35 | `__tests__/`, `*.test.ts`, `scripts/__tests__/` |
| `update(respondents)` | **12 files** | ⚠️ **NOT covered by this story** — see D4 |

✅ **AC1.3's claimed sanctioned set is exactly right.** `submission-processing.service.ts`,
`registration.controller.ts`, the import service, and the seeds — four, no more. The allowlist ships
with four entries and four reasons. Nothing to discover here at implementation time.

### D2. The sibling is a TEMPLATE, not an inspiration — copy its shape verbatim

`lint-registry-read-drift.ts` (13-37) already solves every mechanical problem this story would
otherwise re-solve. Read both files before writing a line:

- **`apps/api/scripts/lint-registry-read-drift.ts`** — 92 lines, I/O + exit code ONLY.
- **`apps/api/src/lib/registry-read-drift.ts`** — the detector, unit-tested by the `test-api` job.

Inherit these four decisions rather than re-litigating them:

1. **Fixture noise is already solved.** `SKIP_DIRS = {__tests__, test, tests, node_modules, dist}` and
   `SKIP_SUFFIXES = ['.test.ts', '.spec.ts', '.d.ts']`. This is what keeps the ~35 fixture hits out of
   the allowlist. **A path-skip rule and a reason-bearing allowlist are different mechanisms** — do not
   collapse fixtures into the allowlist or AC1.3's "an entry without a reason is a hole with a comment"
   drowns in 35 entries of noise.
2. **`SCAN_ROOTS = [src, scripts]`.** `scripts` was **added by the 13-37 code review** because
   "one-off backfills and migrations are exactly where someone would write a quick registry count."
   That judgement is load-bearing here: **6 of the 12 `update(respondents)` callers live in `scripts/`.**
   Do not narrow the scan.
3. **Path normalisation** — `relative(PACKAGE_ROOT, abs).replace(/\\/g, '/')`. Awwal develops on
   Windows; CI is Linux. Allowlist patterns must match identically on both.
4. **The detector's exported API already matches AC2.** `ALLOWLIST: PathRule[]` carries a `reason` per
   entry (AC1.3). `ESCAPE_HATCH_TOKEN` + `MIN_REASON_CHARS = 8` gives the inline escape hatch with a
   minimum-length reason (AC2.2) — *"An unexplained suppression is not a reviewable decision."* A
   `RULE_WHY` map supplies the one-sentence why (AC2.1). Mirror the types; don't invent new ones.

### D3. AC1.4 resolves to TWO wirings, not one — this is the whole Pitfall #45 point

The sibling is wired in **both** places, and each covers what the other cannot:

| where | what | why |
|---|---|---|
| `apps/api/package.json` `lint` chain | folded in, **after** `eslint src scripts` | pre-commit/pre-push cover with no hook edit |
| `.github/workflows/ci-cd.yml` | its **own named step ABOVE `Lint`** (see lines 149–153) | if `Lint` ran first, a drift aborts the job before the named step executes |

Copy the reasoning comment at `ci-cd.yml:132–148` verbatim in spirit — it is the clearest statement of
#45 in the repo. **Both wirings are required by AC1.4; shipping one is shipping half the guard.**

⚠️ **Counter-example in the same file:** `lint-story-residuals.ts` sits in the `lint` chain with **no**
named CI step. That is the half-wiring. Do not copy it.

### D4. ⚠️ SCOPE — this makes un-guarded **creation** impossible, not un-guarded "write"

**The story title overclaims and is being left as-is deliberately, with the gap stated here instead.**

AC1.2 detects `insert(respondents)` / `INSERT INTO "respondents"`. It does **not** detect
`update(respondents)`, which appears in **12 files** including `draft-adoption/promote-nin.ts`,
`draft-adoption/adopt.ts`, `nin-reconfirm.ts`, `merge-duplicate-respondents.ts`, `reminder.worker.ts`
and three backfill scripts. That is the promote class and **13-55 owns it** — correctly out of scope.

**The risk is nominative, not technical.** Ship a guard called *"un-guarded respondent write is
impossible"* that covers creation only, and the next engineer reads the title and stops looking. This
project's most expensive defect class is documented as *"fixed one instance of a class"* — 13-54 exists
to end that pattern, so it must not quietly become the fourth instance of it.

**Required:** the guard's own success line and failure message say **creation**, and name 13-55 as the
owner of updates. One clause each. See Task 2.3.

### D5. AC3 — the one genuine design decision, and it can go wrong quietly

The chokepoint is **`promoteRespondentWithArrivingNin`** in `apps/api/src/services/respondent-identity.ts`,
called from `registration.controller.ts:836` and `submission-processing.service.ts:660`. The existing
smoke (`scripts/nin-arrival-seam-smoke.ts`) drives the **registration** path.

Current shape to extend: `args.includes('--detect' | '--two-pass')`; `twoPass()` returns
`'ok' | 'failed' | 'refused'`; `resolveDbName`/`looksLikeTestDb` **refuse a non-test DATABASE_URL** —
keep that refusal for `--negative-control`, it writes respondent rows too.

⚠️ **The trap.** A tsx script has no `vi.spyOn`, and **ESM module namespace objects are frozen** — you
cannot monkey-patch the imported binding. So "neuter the promote branch in-process" needs a real
mechanism, and the obvious shortcut is the wrong one:

- ❌ **Do NOT** re-implement an inverted promote locally and assert against that. It tests the copy, not
  the system — the §2p failure ("a verification that reads the input instead of the system proves
  nothing"), which is precisely what AC3 exists to replace.
- ✅ **Prefer** a documented test-only injection seam on the chokepoint, exercised by the real caller.

**HALT condition:** if no mechanism exercises the REAL registration path, stop and raise it rather than
shipping a self-referential control. AC3's whole value is that it is re-runnable evidence about
production code; a control that proves its own copy is worth less than the sentence it replaces.

**Assert the duplicate REAPPEARS** — 2 respondents on one phone, a *different* reference code — then
restore. Per §2b, restoring an untracked/uncommitted file with `git checkout --` will not work; restore
by Edit and `grep -rn "RED-VERIFY" apps/` to confirm no residue.

### D6. Running it

```bash
pnpm --filter @oslsr/api lint:respondent-write          # the new guard, standalone
pnpm --filter @oslsr/api lint                           # the folded chain (D3)
NODE_ENV=test DATABASE_URL="postgres://user:password@localhost:5432/app_test" \
  pnpm vitest run apps/api/src/lib/__tests__/respondent-write-drift.test.ts
pnpm --filter @oslsr/api nin-arrival:smoke -- --negative-control   # test DB only; writes
```

`scripts/` is **outside tsconfig** — `tsc` will not see the CLI at all. RUN it. eslint is the only
compile-time signal there. This is exactly why AC1.1 puts the logic in `src/lib/`.

## Tasks / Subtasks

### Task 1 — Detector in `src/lib/` (AC1.1, AC1.2, AC1.3)
- [x] 1.1 Read `src/lib/registry-read-drift.ts` and `scripts/lint-registry-read-drift.ts` end to end before writing anything (D2)
- [x] 1.2 Create `apps/api/src/lib/respondent-write-drift.ts` — pure detector, no I/O; mirror the sibling's exported types (`DriftFile`, `DriftHit`, `PathRule`, `findDriftHits`, `formatHits`)
- [x] 1.3 Detect `insert(respondents)` **and** raw `INSERT INTO "respondents"` (quoted and unquoted) (AC1.2)
- [x] 1.4 `ALLOWLIST` = the four measured production sites from D1, **each with a reason string** (AC1.3)
- [x] 1.5 Inline escape hatch: `// respondent-write-drift-ok: <reason>`, `MIN_REASON_CHARS = 8` (AC2.2)
- [x] 1.6 Unit tests `src/lib/__tests__/respondent-write-drift.test.ts` — allowlisted site passes, un-allowlisted insert fails, escape hatch without a reason fails, fixture path skipped

### Task 2 — CLI + the teaching message (AC1.1, AC2)
- [x] 2.1 Create `apps/api/scripts/lint-respondent-write-drift.ts` — I/O + exit code only; `SCAN_ROOTS = [src, scripts]`, sibling's `SKIP_DIRS`/`SKIP_SUFFIXES`, Windows path normalisation (D2)
- [x] 2.2 Failure message names file + line, states that respondent creation must route through the chokepoint, and gives the one-sentence why — *bypassing it skips the identity guard and has twice produced a citizen with two records* (AC2.1)
- [x] 2.3 Message + success line say **creation**, and name **13-55** as owner of `update(respondents)` (D4)
- [x] 2.4 Escape hatch stated explicitly in the message: add to the allowlist **with a reason**; doing so without one is how this class returns (AC2.2)

### Task 3 — Wire it into BOTH gates (AC1.4)
- [x] 3.1 Add `"lint:respondent-write": "tsx scripts/lint-respondent-write-drift.ts"` to `apps/api/package.json`
- [x] 3.2 Fold into the api `lint` chain (pre-commit/pre-push cover)
- [x] 3.3 Add a **named step ABOVE `Lint`** in `ci-cd.yml` `lint-and-build`, with the #45 ordering comment (D3)
- [x] 3.4 Confirm BOTH wirings present — half-wiring is the `lint-story-residuals.ts` counter-example

### Task 4 — RED-verify the guard (AC1.5)
- [x] 4.1 Add an `insert(respondents)` to a scratch file outside the allowlist — **three canaries, not one** (see Debug Log)
- [x] 4.2 Run the guard locally → **MUST exit 1** and print the file, line and reason
- [ ] 4.3 Prove it fails **in CI**, not only locally (AC1.5 says CI) — ⏳ **DISCHARGE-ON-PUSH**, cannot complete locally
- [x] 4.4 Remove the scratch write; `grep -rn "RED-VERIFY" apps/` clean; re-run green
- [x] 4.5 Record the observed failure output in Dev Agent Record — a guard nobody has watched fail is a guard nobody knows works

### Task 5 — `--negative-control` on the NIN-arrival smoke (AC3)
- [x] 5.1 Choose the neutering mechanism (D5). **HALT was taken and raised** — probed, ruled by Awwal 2026-08-08: vitest + `vi.mock`, not a production injection seam. See the AC3 amendment above.
- [x] 5.2 ~~Add `--negative-control` to `scripts/nin-arrival-seam-smoke.ts`~~ → **built as `src/services/__tests__/nin-arrival-negative-control.integration.test.ts`** (real test DB; only the promote mocked; ingestion path, finder and Postgres all real). The smoke's usage text signposts the move so the flag named in AC3.1 does not read as missing.
- [x] 5.3 Run the same two-pass with promote neutered; assert the duplicate **REAPPEARS** — 2 respondents on one phone, a different reference code
- [x] 5.4 Restore, and assert the control now promotes in place (the guard is back) — the paired un-mocked twin, asserting ONE record + NIN in place + status `active`
- [x] 5.5 Confirm teardown leaves no synthetic rows — `afterAll` deletes by id and **asserts the returned count equals the ids created**, so a `DELETE 0` fails the run instead of reading clean

### Review Follow-ups (AI) — BMAD adversarial code review 2026-08-08

> All ten findings were FIXED in the same pass (Awwal: "create action items and fix them all
> automatically"). Boxes are ticked because the fix shipped, not because the finding was waived.
> Evidence for each is in the Debug Log under **Code review 2026-08-08**.

- [x] R-H1 [AI-Review][HIGH] The guard closed one SPELLING, not the class — `db.insert(schema.respondents)`, `db.insert(respondentsTable)`, `db.insert(respondents as never)`, a multi-line call with a trailing comma, `INSERT INTO public.respondents` and `INSERT INTO "public"."respondents"` all passed GREEN. Measured with a six-case probe file, not argued. Both rules widened to accept a dotted qualifier, any identifier containing `respondents`, an `as` cast and a trailing comma [`src/lib/respondent-write-drift.ts:312-348`]
- [x] R-H2 [AI-Review][HIGH] The negative control's header claimed `--sequence.shuffle` could not break it; test 3 read rows written by tests 1 and 2 and went red at `--sequence.seed=3` with `{guarded: 0, neutered: 0}`. It now runs its own paired journeys on its own phones [`src/services/__tests__/nin-arrival-negative-control.integration.test.ts:170`]
- [x] R-M1 [AI-Review][MED] Task 6.3 was `[ ]` ("final run in flight") while `sprint-status.yaml` stated `3646 passed / 0 failed / 263 files` as fact. Suite re-run to completion and BOTH records corrected to the observed number [Task 6.3]
- [x] R-M2 [AI-Review][MED] Story `Status: in-progress` vs board `13-54: review` — the same parity divergence John/PM had corrected for 13-53 two lines above in the same file, recurring in the same session [story header + `sprint-status.yaml:521`]
- [x] R-M3 [AI-Review][MED] Test identity namespace was `Date.now().toString().slice(-7)`, recycling every ~2.8h; a failed teardown or a parallel run on `app_test` would leave rows on the next run's phone and fail `toHaveLength(1)` as a mystery. Now `randomUUID`-derived [same file, `digits()`]
- [x] R-M4 [AI-Review][MED] The Task-4 RED-verify used exactly the two spellings the two regexes were written for, so it could only confirm what the author already believed — this is how H1 survived a review that was hunting for holes. The six evasions are now permanent `it.each` cases [`src/lib/__tests__/respondent-write-drift.test.ts`]
- [x] R-L1 [AI-Review][LOW] One escape-hatch annotation suppressed every hit in the 3 lines below it, including an unrelated second creation. Lookback now stops at the first line of real code [`respondent-write-drift.ts:284-322`]
- [x] R-L2 [AI-Review][LOW] `isScannablePath` accepted `.ts` only — a creation site in `.mts`/`.cts`/`.tsx` was silently unscanned [`respondent-write-drift.ts` `SCANNABLE_EXTENSIONS`]
- [x] R-L3 [AI-Review][LOW] `as unknown as { rows }` on `db.execute` — the unguarded-cast class Story 13-41 exists to catch, inside the story built to close defect classes. Replaced with the typed `db.select()` builder [negative-control test, `rowsOnPhone`]
- [x] R-L4 [AI-Review][LOW] `localeCompare` ordering made CI hit-order ICU-dependent between the Windows laptop and the Linux runner; now byte order [`respondent-write-drift.ts` `findDriftHits`]

### Task 6 — Validation
- [x] 6.1 `pnpm --filter @oslsr/api exec tsc --noEmit` (the detector is in `src/`, so it IS type-checked) — exit 0
- [x] 6.2 `eslint` the touched files explicitly — exit 0 across all five; full `lint` chain green, all three guards firing in order
- [x] 6.3 Full API suite for regressions — ⚠️ **CORRECTED AT ADJUDICATION to 3662 passed / 0 failed / 7 skipped / 1 todo across 263 files.** The recorded 3646 was measured BEFORE the code review added its 16 detector tests (28 → 44), so R-M1's own correction was applied from a pre-review run — the same staleness R-M1 was raised to fix, one layer down. 3646 + 16 = 3662 reconciles exactly
- [x] 6.4 File List matches `git status --short` exactly — **10 entries, 0 discrepancies**; 8 mine, 2 inherited (see File List)

## Notes

- Sibling of 13-41 (unsafe-cast CI guard) and 13-45 (done-with-open-residuals). This repo has a
  working pattern for turning a recurring defect class into a build failure; **this is the third
  application of it, and the one with the strongest evidence behind it.**
- ✅ **"Third application" verified 2026-08-08** — two such guards are shipped and in the `lint` chain
  (`lint-registry-read-drift.ts`, `lint-story-residuals.ts`); 13-41 is authored but not shipped. The
  claim holds as written.

## Dev Agent Record

### Implementation Plan

Followed Bob's task order exactly. Red-green-refactor per activation step 7: the detector's test file
was written and run FIRST (RED: `Cannot find module '../respondent-write-drift.js'`), then the
detector (GREEN: 28/28).

**One deliberate deviation from the sibling, recorded because it is a design decision not a slip.**
`lint-registry-read-drift.ts` keeps `SKIP_DIRS`/`SKIP_SUFFIXES` in the CLI — i.e. inside `scripts/`,
which is outside tsconfig and therefore neither type-checked nor unit-tested. That predicate is
load-bearing here: it is the only thing keeping ~35 fixture creation sites out of the allowlist, and
an allowlist of 35 test files would drown AC1.3's *"an entry without a reason is a hole with a
comment"*. So `isScannablePath` lives in `src/lib/`, typed and covered by 11 assertions, and the CLI
imports it. This is AC1.1's own stated rationale applied one level further than the sibling applied it.

**Batching note (activation step 9).** The full API suite was run at Task 6 rather than after each of
Tasks 1–5. Tasks 1 and 2 add isolated new files that nothing imports; Task 3 is the first change to
shared config. Stating it rather than implying six runs happened.

### Debug Log

**Task 1 — RED then GREEN**
- RED: `Cannot find module '../respondent-write-drift.js'` — 1 failed suite, 0 tests run.
- GREEN: **28/28 passed** (`apps/api/src/lib/__tests__/respondent-write-drift.test.ts`).

**Task 2 — first run read, not just exited (§2a2)**
```
✅ respondent-write drift guard: 368 files scanned, no un-sanctioned respondent CREATION.
   (Scope: creation only — update(respondents) is Story 13-55, not checked here.)
```
**Shape cross-checked against an independent method:** AC1.1 records the sibling at 366 files; this
story adds exactly 2 scannable files (the detector + the CLI); the test file is skipped by rule.
366 + 2 = 368. Re-running `lint:registry-read` now also reports **368** — two separately-implemented
directory walks, one answer. A bare "0 hits" would have been an unevaluated zero (§2t).

**Task 3 — both wirings, verified structurally not visually**
`lint-and-build` steps parsed with js-yaml: guard at index **7**, `Lint` at index **8** → guard above
Lint (Pitfall #45). Full chain green, all three guards firing in order, eslint silent.

**Task 4 — RED-verify, THREE canaries**

Bob's task said one scratch file. One was not enough: with 0 hits on a clean tree, "the allowlist
works" and "the detector never fires on real code" are indistinguishable — the §2t trap. So:

| canary | what it proves | result |
|---|---|---|
| **A** `src/services/_red-verify-scratch.service.ts` — builder insert | rule 1 fires in `src/` | ❌ flagged, exit 1 |
| **B** `scripts/_red-verify-scratch-raw.ts` — raw `INSERT INTO "respondents"` | rule 2 fires in `scripts/`, the root the 13-37 review added | ❌ flagged, exit 1 |
| **C** one ALLOWLIST entry neutered | **the detector sees REAL production code** | ❌ `src/controllers/registration.controller.ts:919`, snippet `.insert(respondents)` |

Canary C is the load-bearing one. It flagged the exact file:line from Dev Notes D1, which proves
(a) the detector matches production code and not merely synthetic fixtures, and (b) the allowlist is
what suppresses it — it is load-bearing, not decorative. Restored by Edit, not `git checkout --`
(§2b: the file is untracked, so checkout cannot restore it).

Residue check after teardown: `grep -rn "RED-VERIFY" apps/` returns **1 hit**, and it is **not mine** —
`src/routes/__tests__/registration.routes.test.ts:737` is 13-53's pre-existing RED-VERIFY marker in a
file `git status` confirms untouched. Scratch files: 0 remaining. Guard re-run green at 368/0.

**Task 5 — HALT taken, raised, ruled, then built**

The HALT was real and is recorded in Completion Notes. Awwal ruled **vitest + `vi.mock`** on
2026-08-08, with three binding constraints. Built as
`src/services/__tests__/nin-arrival-negative-control.integration.test.ts` — **3/3 passing**.

| constraint | how it is met |
|---|---|
| real test DB; mock ONLY the promote | `vi.mock` spreads the actual module and replaces one export. `findOrCreateRespondent`, the identity finder and Postgres all real. |
| **assert on ROWS, never mock calls** | Every assertion reads `SELECT id, reference_code FROM respondents WHERE phone_number = …`. **There is no `toHaveBeenCalled` in the file.** |
| pair with the un-mocked twin | Test 1 (guarded) asserts ONE row + NIN in place + status `active`; test 2 (neutered) asserts TWO rows with DIFFERENT codes; test 3 pins `{guarded: 1, neutered: 2}` so a control that stops controlling fails loudly. |

**Production code emitted its own evidence during the guarded run** — the same line 13-53 needed:
```
event: "submission_processing.promoted_existing_identity_on_nin_arrival"
referenceCode: "OSL-2026-ADNVC5"  promotedStatus: "active"  source: "public"
```
13-53 could only get that by hand. It now happens on every push.

**RED-VERIFIED against production code, not against the mock.** Neutered the REAL branch
(`submission-processing.service.ts:659`, `else if (ninlessSelf)` → `else if (false && ninlessSelf)`)
and re-ran:
```
× GUARDED (the positive twin): the journey produces ONE record …
    AssertionError: expected [ { …(2) }, { …(2) } ] to have a length of 1 but got 2
× the two cases differ ONLY by the guard …
    AssertionError: expected { guarded: 2, neutered: 2 } to deeply equal { guarded: 1, neutered: 2 }
```
Two tests red, the neutered test correctly still green (it already expects the no-guard state). This
is the proof that matters: **the file guards the production path, not the mock.** Restored with
`git checkout --` (tracked file, unlike Task 4's untracked canaries — §2b), `git status` clean, no
`false && ninlessSelf` residue, re-run 3/3 green.

Also added a signpost to the smoke's usage text: anyone following AC3.1's original wording and typing
`--negative-control` is told where it went, so a named-but-absent flag cannot read as missing work.

**Task 6**
- 6.1 `tsc --noEmit` → exit 0.
- 6.2 `eslint` on the three touched files explicitly → exit 0. (The CLI is in `scripts/`, outside
  tsconfig — eslint is its only compile-time signal.)
- 6.3 full API suite → **3646 passed / 0 failed / 7 skipped / 1 todo, 263 files**, exit 0.
  ⚠️ **Execution proven, not inferred.** Grepping the run log for the new filenames returned nothing,
  which is exactly the §2t trap — an empty result read as a negative result. Confirmed instead from
  `vitest-report.json`: both files present, `respondent-write-drift.test.ts` **28/28 passed**,
  `nin-arrival-negative-control.integration.test.ts` **3/3 passed**, both `status: passed`. The
  arithmetic agreed (3643 → 3646 = +3; 262 → 263 files = +1) but arithmetic is not evidence that a
  file ran.
- 6.4 File List vs `git status --short`: **10 entries, 0 discrepancies.**

**Code review 2026-08-08 (BMAD adversarial) — the guard was defeatable by a rename**

Ten findings, 2H/4M/4L, all fixed. Two were found by RUNNING rather than reading, and both are the
kind this story was raised to end.

**H1 — six spellings walked straight past a guard reporting GREEN.** A probe file carrying six
un-sanctioned creations was written into `src/services/` and the guard *counted it and cleared it*:

```
✅ respondent-write drift guard: 369 files scanned, no un-sanctioned respondent CREATION.
EXIT=0
```

369 — it read the file, matched nothing, and said so confidently. The evasions were
`db.insert(schema.respondents)` (and `import * as schema` is already used at `db/index.ts:3`),
`db.insert(respondentsTable)`, `db.insert(respondents as never)`, a multi-line call with a trailing
comma, `INSERT INTO public.respondents`, and `INSERT INTO "public"."respondents"`.

**This is 13-54's own thesis at a smaller scale.** R13/R21/13-53 each protected one more CALLER; the
guard as first shipped protected one more TOKEN. Both rules widened; the same probe now reports
`❌ respondent-write drift: 6 un-sanctioned respondent creations` and exits 1, naming each file:line.
Probe removed, guard re-verified at **368 / 0 / exit 0**, `git status` back to the known 10 entries.

⚠️ **Why review caught it and the RED-verify did not (R-M4).** Task 4's three canaries used exactly
the two spellings the two regexes were written for. Canary C was genuinely load-bearing — it proved
the allowlist suppresses real production code — but no canary asked *what shape of real insert does
this miss?* A RED-verify that only exercises the author's own assumptions confirms the assumption,
not the guard. The six evasions are now permanent `it.each` cases; detector tests **28 → 44**.

**Widened guard run against the real tree BEFORE anything else: still 368 / 0.** No existing site was
newly caught, so the widening needed no scope ruling.

**H2 — the negative control's order-independence claim was false, and measurable.** The header said
`--sequence.shuffle` "cannot turn this file red or, worse, vacuous", citing 13-53 review M3. Test 3
read the rows tests 1 and 2 had written. Four seeds run:

```
===== SEED 3 =====
AssertionError: expected { guarded: +0, neutered: +0 } to deeply equal { guarded: 1, neutered: 2 }
      Tests  1 failed | 2 passed (3)
```

Seeds 1, 2, 4 green; seed 3 reordered and it broke. Test 3 now runs its own paired journeys on its
own phones. Re-run at seeds **3, 1, 5, 9 → 3/3 green** each.

**RE-RED-VERIFIED after the fix, because a decoupling could have made test 3 vacuous.** Neutered the
REAL production branch again (`submission-processing.service.ts:659`, `else if (ninlessSelf)` →
`else if (false && ninlessSelf)`):

```
× GUARDED (the positive twin): the journey produces ONE record …
    AssertionError: expected [ { …(2) }, { …(2) } ] to have a length of 1 but got 2
× the two cases differ ONLY by the guard …
    AssertionError: expected { guarded: 2, neutered: 2 } to deeply equal { guarded: 1, neutered: 2 }
```

Test 3 still reds against production code despite now being self-contained — that is the property
that mattered. Restored with `git checkout --` (tracked file), no `false && ninlessSelf` residue.

**Verified-not-inherited during this review:** guard 368/0 · sibling's independent walk also 368 ·
detector 44/44 · negative control 3/3 · `grep -rn "RED-VERIFY" apps/` = 1 hit, pre-existing in
`registration.routes.test.ts:737` and not this story's · pre-commit really does run `pnpm lint` (so
AC1.4's pre-commit half holds) · the CI guard step really does sit above `Lint` · File List vs
`git status --porcelain` = 10/10.

**Note on R-M1/R-M2.** Both were live when the review started (story `Status: in-progress` vs board
`review`; Task 6.3 `[ ]` "in flight" while the board asserted `3646 passed`). Amelia's final write
landed on disk mid-review and closed both. Recorded here because the review found them open, and
because the suite number they settled on is now stale — 16 detector tests were added after it.

### Completion Notes

**All six tasks complete. One residual: Task 4.3, DISCHARGE-ON-PUSH.**

⛔ **The HALT (taken, raised, ruled) — with the measurement rather than the received claim.** AC3.1
says to neuter the promote branch *in-process* from `nin-arrival:smoke`. I probed whether that is
possible before accepting D5's reasoning:

```
typeof export       : function
namespace frozen    : false
reassignment threw  : YES -> Cannot assign to read only property
                             'promoteRespondentWithArrivingNin' of object '[object Module]'
```

So D5's conclusion holds but its stated mechanism is slightly off: the namespace object is **not**
frozen — the individual export is a **read-only property on the Module exotic object**. Either way the
monkey-patch is unavailable, and AC3.1 as written needs one of:

- **(a) a test-only injection seam in production `respondent-identity.ts`** — an override slot that
  can disable a citizen-data safety guard. ⚠️ This project has already been bitten by
  environment-dependent behaviour on prod (`EMAIL_TIER` unset → the budget guard silently enforced
  the wrong tier). Adding a disable-the-identity-guard slot to production code, to test the identity
  guard, is a poor trade.
- **(b) Node ESM loader hooks** (`module.register()`) — heavy, fragile, and needs a custom loader in
  the script's invocation.
- **(c) do the negative control in vitest with `vi.mock`** — zero production change, and there are
  already **11 `vi.mock` calls in `submission-processing.service.test.ts`**, so it is this repo's
  established mechanism for exactly this. It would also run in CI on **every push**, which is
  strictly more re-runnable than a script flag someone has to remember to type.

**My recommendation was (c)**, on the grounds that it serves AC3's stated GOAL better than AC3.1's
stated MECHANISM. **Ruled (c) by Awwal 2026-08-08**, rejecting (a) on principle rather than cost —
shipping a supported way to switch off the identity guard, inside the story built to make bypasses
impossible, is self-defeating, and it is the same class closed three days earlier when `EMAIL_TIER`
being unset made the budget guard enforce the wrong tier. (b) rejected for having no precedent.
Deferring AC3 was also rejected: 13-53's R2 is already closed on a stated gap with no prod
observation, and deferring would leave two soft spots stacked in the same seam.

**What I did NOT do, and why it matters:** I did not write a locally-inverted copy of the promote and
assert against it. That would have gone green, produced a tickable box, and proved nothing — §2p, a
verification that reads its own copy instead of the system. It is the exact failure AC3 exists to
replace, so shipping it would have made this story the fourth instance of the class it was raised to
end.

**Gate summary:** `tsc` 0 · `eslint` 0 on all five touched files · full `lint` chain green with all
three guards firing in order · guard 368 files / 0 hits · detector 28/28 · negative control 3/3 ·
**full API suite 3662 passed / 0 failed** (adjudication re-run; 3646 was pre-review — see Task 6.3) · File List vs git 0 discrepancies · three RED-verifies
(two on the guard, one on the negative control against production code).

## Adjudication 2026-08-08 — verified independently, not accepted on report

**ACCEPTED.** Status stays `review` until R1 discharges on the push (below). Everything was re-run
here rather than read from the Debug Log.

| check | result |
|---|---|
| Allowlist honesty — my own sweep for creation sites | Exactly the 4 allow-listed files. No fifth, no over-broad entry. |
| Adversarial probe, 16 cases | **16/16.** All four H1 evasions, deep namespace `a.b.respondents`, `tx.` receiver, both raw-SQL qualifiers, prose-not-flagged, short reason rejected, **an escape-hatch token inside a STRING rejected**, L1 adjacency. |
| CLI end-to-end RED | A real file using the ALIASED spelling → exit 1, correct `file:line`; greens on removal. |
| `scripts/` genuinely scanned | Probe in `scripts/` → exit 1. The comment says it is scanned; this proves it. |
| Negative control (real DB) | 3/3, real promote log line emitted. Self-validating: a mock that failed to intercept would read 1 and red. |
| H2 shuffle-independence | Clean on seeds **3**, 7, 42, 1234 — seed 3 being the one that previously failed. |
| Teardown | 0 rows left on `app_test`. |
| tsc / eslint / detector tests / full suite | 0 · 0 · **44** · **3662 passed, 0 failed**. |

**The review earned its keep.** H1 and H2 were both *measured with probe files rather than argued*,
and R-M4 is the sharpest finding in the set: the original RED-verify used exactly the two spellings
the two regexes were written for, so it could only ever confirm what the author already believed.
That is precisely how H1 survived a review that was hunting for holes.

### Two findings at adjudication, neither blocking

1. **Known limit #6 — the allowlist is per-file, so this guard would not have caught R21 or 13-53.**
   Written up in Known limits. Not a defect; an unstated boundary, and the story is otherwise
   scrupulous about exactly this species of overclaim (D4).
2. **A pre-existing test race, found by running the suite rather than reading its recorded result.**
   `user.profile.test.ts:264` read the globally-latest `user.profile_updated` audit row with no
   actor filter, while `require-fresh-reauth.test.ts` and `security.reauth-routes.test.ts` PATCH the
   same endpoint. **Chased to a deterministic repro — 1-in-2 with those three files together — not
   dismissed as a flake** ([[pattern-flaky-test-hiding-a-prod-bug]]). The test exists to demonstrate
   that an unscoped read is wrong and was itself vulnerable to that bug from a third party. Scoped to
   the two actors it creates; 4/4 green after, full suite green. **NOT 13-54's doing** — it passes
   alone and passes alongside the new negative control; only the three-way parallel run trips it.

## Residuals

| # | item | state | evidence / trigger |
|---|---|---|---|
| **R1** | **AC1.5 — the guard must be proven to fail IN CI, not only locally** | ⏳ **DISCHARGE-ON-PUSH** | Locally it exits 1 on all three canaries. Only a push exercises the named CI step **and its ordering above `Lint`** — and per §2a2 "the job passed" cannot distinguish TAKEN from SKIPPED, so the ordering specifically needs a real run. Same shape 13-37 carried, for the same reason. **Discharge:** after push, confirm `lint-and-build` green AND that "Respondent-write drift guard (Story 13-54)" appears as its own executed step ABOVE "Lint" in `gh run view <id> --json jobs`. **`done` is forbidden until that is read.** |

⚠️ **This story stays `review`, not `done`.** R1 is open, and 13-45's guard exists to stop exactly
that flip. Status goes to `review` deliberately — the same ruling Awwal made on 13-37.

## Known limits (stated, not discovered later)

1. **Creation only.** `update(respondents)` spans 12 files and is unguarded — Story 13-55. Said in
   the module header, the CI comment, the failure message and the success line, because the story's
   own title promises more than the guard checks.
2. **The escape-hatch lookback is 3 lines, and stops at the first line of code.** An annotation
   further above a call — or separated from it by a statement — is not honoured. It fails LOUD (the
   guard reds) rather than letting a write through, which is the safe direction. *(Amended by review
   R-L1: the code-line stop was added because without it one justified annotation silently cleared an
   unrelated creation on the next line.)*
3. **`maskComments` does not track regex literals** — inherited from the sibling along with its
   reasoning. A regex containing `//` over-masks the rest of that line (a false negative). Creation
   calls and regex literals do not share a line; if that ever changes the fix is an AST pass, which
   is what 13-41 is extracting.
4. **The negative control mocks one export.** It proves the promote is load-bearing on the
   `findOrCreateRespondent` path. It does not exercise `registration.controller.ts:836`, the second
   caller of the same chokepoint — that asymmetry is 13-55's territory.
6. ⚠️ **THE ALLOWLIST IS PER-FILE, SO THE GUARD WOULD NOT HAVE CAUGHT R21 OR 13-53.**
   *(Added at adjudication 2026-08-08 — the one gap the story's own limits section had missed.)*
   AC1.3 mandates a path allowlist, and a path allowlist exempts a whole file. Both historical
   defects created respondents **inside files that are now allow-listed** —
   `registration.controller.ts` (R21) and the chokepoint itself (13-53) — so a *new* un-guarded
   creation added to one of those four files is invisible to this guard.

   **What it does prevent is a FIFTH file becoming an ingestion path**, which is genuinely the
   historical pattern: the public wizard and the NIN-arrival direction were each a new path once.
   That is worth having and is not diminished by this.

   **But it is the same species of overclaim D4 exists to prevent** — there the title said "write"
   and the guard checked creation; here "outside the sanctioned chokepoint" reads as *every*
   un-guarded creation and means *every un-guarded creation in an unsanctioned FILE*. Stated here so
   the next engineer does not read a green guard as cover for a change inside the four.

   ⚠️ **Do NOT "fix" this with line-level pinning** — a line number in an allowlist rots on the next
   edit and fails OPEN, which is worse than the gap. The real answer is fewer sanctioned creators,
   i.e. **Story 13-55**, and this is an argument for sequencing it sooner rather than a defect here.

5. **Rule 1 over-matches by design (review R-H1).** Any identifier CONTAINING `respondents` is
   flagged, so a genuinely different table named e.g. `respondentsArchive` would red. That is the
   deliberate direction: a false red is cleared by an allowlist entry or an inline reason and someone
   reads it, whereas the false GREEN this replaces was the finding.

## File List

**New**
- `apps/api/src/lib/respondent-write-drift.ts` — the detector (pure, type-checked, unit-tested)
- `apps/api/src/lib/__tests__/respondent-write-drift.test.ts` — 44 tests (28 + 16 from the code review: the six evasion spellings, the L1 adjacency cases, the new extensions)
- `apps/api/scripts/lint-respondent-write-drift.ts` — CLI (I/O + exit code only)
- `apps/api/src/services/__tests__/nin-arrival-negative-control.integration.test.ts` — AC3, 3 tests

**Modified**
- `apps/api/package.json` — `lint:respondent-write` script + folded into the `lint` chain
- `.github/workflows/ci-cd.yml` — named guard step ABOVE `Lint` in `lint-and-build`
- `apps/api/scripts/nin-arrival-seam-smoke.ts` — usage signpost to the relocated negative control
- `_bmad-output/implementation-artifacts/13-54-respondent-write-chokepoint-ci-guard.md` — this file

*Code review 2026-08-08 touched three of the above — the detector, its tests, and the negative
control. No new file was created and none was removed, so the 10-entry git match still holds.*

**Added at adjudication 2026-08-08**
- `apps/api/src/__tests__/user.profile.test.ts` — scoped a racy global audit read to the test's own
  two actors. Pre-existing defect, unrelated to this story, fixed here because it was found here.

**Not mine — pre-existing uncommitted work from Bob (SM) and John (PM) in this session**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 13-54 → in-progress; also carries
  John's 13-53 parity correction and the new 13-56 backlog entry
- `_bmad-output/planning-artifacts/epics.md` — John's emergent-index backfill (13-49 … 13-55)

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-08-08 | Story scaffolded for development: Dev Notes (measured write-site inventory, sibling template, dual-wiring, scope boundary, AC3 design risk), Tasks/Subtasks, and record sections added. `Status: backlog → ready-for-dev`. AC1/AC2/AC3 deliberately unmodified. | Bob (SM) |
| 2026-08-08 | Planning-artifact parity sweep: board flip verified before writing; `epics.md` emergent index backfilled 13-49 … 13-55 (it had lapsed seven stories); 13-37 + 13-47 stale `review` labels corrected. Separately found and fixed a live board divergence — 13-53 read `review` while four sources said closed. | John (PM) |
| 2026-08-08 | **Implemented.** AC1 + AC2: detector `src/lib/respondent-write-drift.ts` (28 tests) + CLI `scripts/lint-respondent-write-drift.ts`, wired into BOTH the api `lint` chain and a named `ci-cd.yml` step above `Lint`. Guard measures 368 files / 0 hits. RED-verified with three canaries — the third neutered an allowlist entry and flagged `registration.controller.ts:919`, proving the detector matches production code rather than fixtures. `Status: ready-for-dev → in-progress`. | Amelia (Dev) |
| 2026-08-08 | **AC3 mechanism changed after a HALT.** AC3.1's in-process neuter is impossible — ESM exports are read-only bindings (measured, not assumed). Escalated with options; Awwal ruled vitest + `vi.mock`, rejecting a production injection seam on principle. Built `nin-arrival-negative-control.integration.test.ts` (3 tests): real DB, only the promote mocked, **assertions on ROWS not mock calls**, paired with the un-mocked twin. RED-verified against the REAL branch at `submission-processing.service.ts:659` — neutering it turns the guarded test red. AC3.1 amended in place so the change reads as a decision, not a skip. | Amelia (Dev) |
| 2026-08-08 | **ADJUDICATION — ACCEPTED, stays `review` pending R1.** Re-verified independently: 16/16 adversarial probes (incl. all four H1 evasions + a string-literal suppression attack), CLI RED end-to-end on a real file, `scripts/` proven scanned, negative control 3/3 on a real DB, shuffle-clean on seed 3. Two findings: known limit #6 (the allowlist is per-file, so this would NOT have caught R21 or 13-53) and a PRE-EXISTING race in `user.profile.test.ts` chased to a 1-in-2 repro and fixed. Suite figure corrected 3646 → **3662** (the recorded number predated the review's +16 tests). | Adjudication |
| 2026-08-08 | Gates: `tsc` 0 · `eslint` 0 · lint chain green · **full API suite 3646 passed / 0 failed / 263 files** (both new files' execution confirmed from `vitest-report.json`, not inferred from counts) · File List vs git 0 discrepancies. `Status: in-progress → review` with **R1 open (AC1.5 CI proof, DISCHARGE-ON-PUSH)** — `done` deliberately withheld per 13-45's guard. | Amelia (Dev) |

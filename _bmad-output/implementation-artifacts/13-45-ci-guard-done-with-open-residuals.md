# Story 13.45: CI guard — a story may not read `Status: done` while a residual is OPEN

Status: ready-for-dev

<!-- 🔴 REOPENED 2026-08-10 (John/PM). Shipped 2026-08-05 and read `done` for five days. Two defects
have since been found in it (R2, R3 below), and R2 contradicts AC1.2 as written. Also: this story
had NO ROW in sprint-status.yaml until 2026-08-10 — the story that built the residual guard was
itself invisible to the board, which is why its defect had nowhere to be recorded. -->

## Story

As the **adjudicator who both opens and closes residuals**,
I want **CI to refuse a story marked `done` that still carries an OPEN residual**,
so that **the ledger stays worth reading — because `done` meaning "done except for the bits I
stopped tracking" is how a launch-blocking row disappears without anyone deciding to drop it.**

## Context

Story 13-49 produced **twenty** residuals in one session. Some closed on evidence, some accepted
with an owner and a reopen trigger, several handed to other stories. **The person closing them was
usually the person who opened them.** Discipline checked by the discipliner is not a control.

The failure is quiet: a story flips to `done`, the ledger stops being read because the story looks
finished, and an OPEN row goes with it. Nothing errors.

## Acceptance Criteria

### AC1 — The guard blocks
1. A story with `Status: done` and any residual row whose STATE cell is OPEN fails the build. ✅
2. ~~It runs in the api `lint` chain, so it fires in pre-commit AND in CI's lint-and-build.~~ ⛔
   **FALSE FOR THE PRE-COMMIT HALF — corrected 2026-08-10, see R2.** The `lint` chain declares no
   inputs, so turbo hashes only `apps/api` while the stories are at repo root. It fires on cold CI
   and **replays from cache in pre-commit.** The AC is restated as: *the guard must run on the
   commits it polices, and that must be proven by editing a story and watching it re-run rather
   than replay* — not by observing that it is wired into a chain.
3. Failure output names the story, the residual ids and their states, and states the four ways
   out: close with evidence, ACCEPT with an owner, hand to a named story, or move back to
   `review`. ✅

### AC2 — It does not cry wolf
1. Compound states resolve correctly. Real 13-49 examples: `**was: OPEN — BLOCKED ON DEPLOY**`
   (resolved), `CLOSED for the 7 affected · the CLASS is mitigated` (closed),
   `R11 REOPEN TRIGGER: ...` (a monitoring note, not a state). A substring check on "OPEN" flags
   all three wrongly. ✅
2. Struck-through ids (`~~R9~~`) are the repo's resolved convention and are skipped. ✅
3. Non-ledger tables are ignored — the first cell must look like a residual id. ✅
4. Stories not marked `done` are ignored; work in progress is allowed to carry open rows. ✅

### AC3 — Verified against reality, not just fixtures
1. Run against the live corpus: **304 stories scanned, 190 marked done, 5 of those carrying
   residual ledgers totalling 33 rows — 0 flagged.** ✅ A guard that scans only files without
   ledgers proves nothing; this one parses real rows and finds them genuinely closed.

## Implementation

- Detector: `apps/api/src/lib/story-residual-guard.ts` (type-checked, 10 unit tests)
- Runner: `apps/api/scripts/lint-story-residuals.ts` (I/O + exit code only)
- Same split as the 13-37 registry-read drift guard, for the same reason: `scripts/` is outside
  tsconfig and is RUN, never type-checked, so logic belongs in `src/lib`.

## Residuals

| ID | Severity | State | Re-runnable evidence | Owner |
|---|---|---|---|---|
| **R1** — the guard is in the `lint` chain, not its own CI step | Low | ✅ **CLOSED 2026-08-11 BY RULING R-C** — resolves with R2: the guard leaves the `lint` chain entirely, so the acceptance this row recorded no longer has anything to attach to. | SCP §10.14 R-C. Re-run after the split: `pnpm --filter @oslsr/api lint:story-residuals`. | — |
| **R2** — 🔴 **THE GUARD CANNOT FIRE ON THE COMMITS IT POLICES** | **High** | ✅ **CLOSED-BY-RULING 2026-08-11 (SCP §10.14 R-C)** — *split `lint-story-residuals` out of `lint` into its own turbo task with `inputs` covering `_bmad-output/**`.* Both options this row put up were REJECTED: declaring stories as inputs to `lint` taxed every commit with an `apps/api` eslint re-run, and leaving it taxed nothing while the local signal stayed misleading. The split gets correct invalidation at neither cost. ⚠️ **CLOSED means RULED, not SHIPPED** — the follow-up is unbuilt, and this row may not be read as done work. | `lint-story-residuals.ts` runs inside `@oslsr/api:lint`, which declares no inputs, so turbo hashes only `apps/api` — and stories live at repo root. **Measured 2026-08-09:** three consecutive pre-commit runs replayed the identical hash with a story edited between them (handoff §2y, commit `2d9bc1e`). Works on cold CI, which is why it has never been seen. **Re-runnable evidence:** edit any story file, run the pre-commit lint twice, and observe a cache replay rather than a re-run. **Closure requires the opposite observation.** ⚠️ **The fix is a CHOICE with a cost** — declaring repo-root story files as turbo inputs makes every story edit re-run eslint over `apps/api`. The alternative is promoting the guard to its own CI step with its own inputs (13-54 proved the named-step-above-`Lint` pattern). | Awwal (cost ruling) |
| **R3** — the guard's vocabulary does not include `RE-HOMED` | Med | ✅ **RULED 2026-08-11 (John/PM — explicitly delegated by SCP §10.14).** ⭐ **`RE-HOMED` IS NOT A LEDGER STATE, AND THE GUARD MUST NOT LEARN IT.** A residual ledger tracks *this story's* unfinished work; a re-homed item is by definition another story's scope, so it is finished HERE. Teaching the guard one new word invites the next invented state (`PARKED`, `SUPERSEDED`, `DEFERRED`) and turns a binary check into an unbounded vocabulary — the guard's surface would grow forever while its question stayed the same. **THE RULE: a re-homed item is DELETED from the ledger and replaced by a one-line pointer naming the RECEIVING STORY ID. If no receiving story exists, it stays OPEN.** That keeps the guard's vocabulary at OPEN/CLOSED/ACCEPTED, and — the load-bearing half — **makes re-homing require a real destination instead of being a word that means "not my problem".** Without that clause this ruling would legalise the silent drop the guard exists to prevent. | `story-residual-guard.ts:61-63` flags only the literal token `OPEN` without a closure marker. 13-61's R1 row is `RE-HOMED` — a word the guard has never heard of — so it passes **silently**: neither approved nor blocked, tracked by prose and an owner instead of by CI. Verified by running the guard directly against that tree (316 stories, exit 0). **Decide:** teach the guard the vocabulary, **or** rule that re-homed rows leave the ledger entirely for a story of their own — which 13-61's own note argues is the real answer, since a re-homed item is out of scope rather than unfinished. | Awwal / PM triage |

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-08-05 | Built and verified against the live corpus (304 stories / 33 real residual rows). Emergent from 13-49's twenty-residual session. | Claude (adjudication) |
| 2026-08-10 | 🔴 **REOPENED `done` → `ready-for-dev`.** R2 (guard cannot fire on the commits it polices) + R3 (`RE-HOMED` is outside its vocabulary) recorded; AC1.2 struck and restated; R1's acceptance withdrawn because R2 removed the fact it rested on. **Board row created** — the story had none for five days. | John (PM) |

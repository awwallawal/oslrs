# Story 13.45: CI guard — a story may not read `Status: done` while a residual is OPEN

Status: done

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
2. It runs in the api `lint` chain, so it fires in pre-commit AND in CI's lint-and-build. ✅
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
| **R1** — the guard is in the `lint` chain, not its own CI step | Low | ACCEPTED — deliberate | 13-37's guard learned that a step ordered BELOW a broader one never runs if the broader one fails first. This one is folded into `lint` so it gets pre-commit cover; if a future change makes it worth failing independently of eslint, promote it to a named step ABOVE `Lint` in ci-cd.yml. Re-run: `pnpm --filter @oslsr/api lint:story-residuals`. | — |

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-08-05 | Built and verified against the live corpus (304 stories / 33 real residual rows). Emergent from 13-49's twenty-residual session. | Claude (adjudication) |

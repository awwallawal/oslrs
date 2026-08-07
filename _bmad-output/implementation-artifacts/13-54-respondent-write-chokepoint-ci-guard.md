# Story 13.54: Make an un-guarded respondent write impossible

Status: backlog

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
2. ⚠️ **This is the strongest evidence 13-53 produced, and it currently exists only as a sentence in
   Completion Notes describing something a person did once by hand.** Every count in that story's
   baseline was already zero, so absence proves nothing; only "remove the guard and the bug comes
   back" distinguishes a working guard from an absent one.
3. Roughly twenty lines. It converts the best evidence we have into a permanent, re-runnable asset.

## Out of scope

- **Unifying the three promote-to-active paths — that is 13-55.** This story stops NEW un-guarded
  writes; 13-55 consolidates the ones that exist. Bundling them makes neither shippable.

## Notes

- Sibling of 13-41 (unsafe-cast CI guard) and 13-45 (done-with-open-residuals). This repo has a
  working pattern for turning a recurring defect class into a build failure; **this is the third
  application of it, and the one with the strongest evidence behind it.**

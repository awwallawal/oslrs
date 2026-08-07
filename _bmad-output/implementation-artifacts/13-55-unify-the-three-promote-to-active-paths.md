# Story 13.55: Three promote-to-active paths, three different rules

Status: backlog

<!-- EMERGENT 2026-08-07 from the 13-53 adversarial review (T2). Recorded while the reasoning was
fresh, deliberately NOT bundled into 13-54 — that story stops new un-guarded writes; this one
consolidates the paths that already exist. -->

## Story

As **a maintainer**,
I want **one promote-to-active implementation**,
so that **the next divergence between them is impossible rather than merely unlikely.**

## Context — 13-53's own thesis, one level up

There are now **three** paths that fill a NIN and flip a respondent to `active`, and they disagree:

| path | status scope | identity key |
|---|---|---|
| `registration.controller.completeNin` (magic link) | `pending_nin_capture` | the token itself |
| `submission-processing.tryRaceResolutionMerge` | `pending_nin_capture` | STRICT `lower(first)+lower(last)+phone` |
| `promoteRespondentWithArrivingNin` (13-53) | `pending_nin_capture` · `nin_unavailable` · `active` | phone + **≥2 shared tokens** |

All three write `PENDING_NIN_PROMOTED` with a different `trigger`.

**That divergence IS what review finding H1 was.** 13-53 aligned the new path's status scope and
deliberately stopped there, because unifying three implementations is a refactor, not a review fix.

13-53's own sentence applies here verbatim:

> *a second copy of the matching rule is how these two mechanisms grew a seam in the first place.*

**Three copies of the promote is that sentence waiting to be written a third time.**

## Acceptance Criteria

### AC1 — One implementation; callers keep their own knowledge

1. A single promote used by all three, taking the status scope and the identity key as INPUTS. The
   callers differ legitimately — a magic-link token is stronger evidence than a name-token overlap,
   and should be allowed to say so.
2. ⚠️ **Do not flatten the differences into one rule.** The token path SHOULD be permitted a wider
   status scope than a fuzzy name match; collapsing them would either loosen the fuzzy path
   (dangerous) or tighten the token path (breaks the 9-12 ladder). **The goal is one code path with
   explicit parameters, not one policy.**
3. `PENDING_NIN_PROMOTED` keeps a distinguishing `trigger` — the audit trail must still say WHICH
   route promoted someone.

### AC2 — Prove no behaviour changed

1. Each existing path keeps its current tests, **unchanged**, and they pass against the unified
   implementation. **A refactor whose tests were edited alongside it has proved nothing.**
2. RED-verify the consolidated guard once, rather than three times.

## Notes

- ⚠️ **Sequence after 13-54.** The CI guard stops the bleeding; this stops the scarring. Doing the
  refactor first would consolidate three paths while a fourth could still be added un-guarded.
- Lower urgency than 13-54, and honestly so: divergence between these three has **not** yet produced
  a live defect. It is the shape that produced two, which is a good reason to act — and not the same
  thing as evidence of harm.

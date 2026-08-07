# Story 13.53: The identity guard must cover the journey we ASK people to take

Status: backlog

## Story

As **someone who registered without their NIN and came back with it**,
I want **the register to recognise me**,
so that **I end up with one record and one number, instead of two records and a reference code that
no longer describes me.**

## Context — found by the 13-4 prod smoke, on a REAL citizen

```
OSL-2026-56C9PG   BASHIRU / YUSUFF TITILOPE   no NIN   2026-08-05 15:22   public
OSL-2026-W1PS38   YUSUFF / BASHIRU            NIN      2026-08-05 17:38   public
```

Same phone. Two shared name tokens. **Two hours apart, and the second one landed AFTER R21
deployed.** Two records for one person.

R21 did not attach because **the incoming submission carried a NIN**, and the guard runs only when
`ninValue === null`. The NIN-side dedupe cannot cover it either: it matches on NIN equality, and the
FIRST record has no NIN to match against. **The two mechanisms have a seam between them, and the
seam is a whole journey.**

**That journey is the one we actively ask people to take.** The entire pending-NIN design says
"register now, add your NIN later" — 23 people are in that state today, and 98 have already come
back. The 9-12 ladder link updates the existing record correctly. But nothing stops someone
returning through the front page instead, and when they do, they duplicate.

⚠️ **The scale is the pending-NIN cohort, not a rare edge.** Every person who cannot find their NIN
at registration is a candidate, and "I'll just fill the form again now that I have it" is the most
natural thing they could do.

## Acceptance Criteria

### AC1 — Close the seam
1. When an incoming submission **has a NIN**, and the NIN matches nothing, ALSO run the identity
   check (phone + ≥2 name tokens) against respondents that have **no NIN**.
2. On a match, **attach and promote**: fill the existing record's NIN rather than creating a second
   row, and return the EXISTING reference code. Same principle as R21 — the person keeps the number
   they were already given.
3. ⚠️ **Only match against NIN-less records.** If both rows have NINs and they differ, that is a
   genuine conflict for a human (13-49's `same-person-different-NIN` class), never a silent merge.
4. ⚠️ **Do not apply this to staff-captured sources.** 13-4 AC1b exempts `enumerator`/`clerk`
   because a household shares a handset; that exemption must hold here too, or this reintroduces
   the collapse AC1b just prevented.
5. **RED-verify:** a test that a NIN-bearing submission matching a NIN-less record promotes in place
   and returns the original reference code — failing if the branch is removed.

### AC2 — Prove it on the real cohort
1. After deploy, re-run the duplicate detector: `56C9PG`/`W1PS38` must be the LAST pair of this
   shape, and no new ones appear.
2. Emit a log line on promote-in-place, as `identity_match_exempted_staff_capture` does. **A guard
   whose only evidence is the absence of duplicates is unfalsifiable** — that was R21's lesson and
   it applies verbatim.

### AC3 — Repair the pair that exists
1. `merge:duplicates` on `56C9PG`/`W1PS38`. Older-wins keeps **`56C9PG`**, the code that has been in
   the citizen's hands since 15:22 — and the merge fills its NULL NIN from the loser, so the person
   ends with one record, their original number, AND their NIN.
2. ⚠️ **Sweep for others before assuming this is the only one.** The detector is one query: same
   phone, ≥2 shared name tokens, one row with a NIN and one without.

## Notes

- Sibling of 13-49 R21 and the same defect shape: **a guard placed on one path while the traffic
  takes another.** R21 was "the guard never ran on the public wizard"; this is "the guard never runs
  for the returning-with-NIN case". Both were invisible because the evidence of absence looks
  exactly like the evidence of correctness.
- Found only because the 13-4 smoke's collateral-duplicate check swept the WHOLE register rather
  than just the test rows. **Worth keeping that habit**: the check that finds your own mess is the
  same check that finds everyone else's.

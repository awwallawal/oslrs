# Story 13.66: A cohort guard that sees one route — blast exclusions vs the four-table contact map

Status: ready-for-dev

<!-- Authored 2026-08-22 by the adjudication agent, from a live blast segmentation run on prod at
Awwal's request. NOT speculative: every number below is measured, and the defect was found by
segmenting the real `--dry-run` cohort rather than by reading code. POST-JINGLE, NON-GATING — it does
not block the 24 August airing, but it MUST be settled before the next marketing blast fires. -->

> ⛔ **DO NOT FIRE ANOTHER MARKETING BLAST UNTIL THIS IS RULED ON.** The current cohort of 85 contains
> **18 people who should not receive it** and **52 who would be getting a second copy of a message
> they already declined**. Nothing is broken in a way that errors — every guard behaves exactly as
> written. That is the problem.

## Story

**As** the operator firing a re-engagement blast,
**I want** the cohort exclusions to see every route a person can already be on the register by, and to
know who has already been invited,
**so that** a blast cannot invite someone who is already registered, or re-invite someone who
declined seventeen days ago.

## Context — measured on prod 2026-08-22, not inferred

A live `_reengagement-email-blast.ts --dry-run` returned **85 recipients**, reporting
`excluded: suppressed=0, contacted-within-5d=0`. Both zeroes are *correct for what they measure* and
both are misleading about what an operator would assume they mean.

Segmenting those 85 by hand:

| segment | n | why it matters |
|---|---|---|
| Already linked to the register | **14** | would receive "come and finish registering" — the copy that produced 13-49's 7 duplicate records |
| `.co` typo whose `.com` twin is already registered | **4** | retry bounces forever; correcting the address opens a SECOND route to a registered person |
| Invited on 2026-08-05, still stalled | **52** | a second identical invite to people who already declined one |
| **Never contacted, no register link** | **15** | the genuinely fresh audience |

### Defect 1 — the Cat1 exclusion sees ONE of four contact routes

`_reengagement-email-blast.ts` excludes completed registrants through a single join:

```
magic_link_tokens.email = wizard_drafts.email → respondents → submissions
```

That is one route. This system's contact data lives in **four** tables (§2s), and a respondent whose
completed registration is not reachable via a magic-link token is invisible to it.

**Measured across all drafts: Cat1 catches 73 and MISSES 112.** Fourteen of those misses survive into
the current cohort — 9 reachable via `submissions.raw_data`, 4 via magic-link→respondent, 9 via a
user account (overlapping).

⚠️ **A submissions-only check is NOT sufficient either** — that was the adjudicator's first pass and
it found 9 of the 14. Only the union of all three routes finds them all.

### Defect 2 — there is no "already invited" filter, only a 5-day gap

`filterMarketingCohort()` enforces suppression and `MARKETING_CONTACT_GAP_DAYS` (5). It has no notion
of *campaign history*. The 2026-08-05 `draft-invite-2026-08` went to 75 people; **52 of them are still
in today's cohort**, and the gap rule waves them through because 17 days have passed.

The gap answers "are we spamming them this week?" It does not answer **"have they already been asked,
and said no by not acting?"** Those are different questions and only one of them is being asked.

### ⭐ And the campaign that already ran gives us the yield number

`draft-invite-2026-08`, 2026-08-05 → today:

| | |
|---|---|
| invited | **75** |
| now registered with answers | **17 (≈23%)** |
| registered via the magic-link path | 12 |
| bounced | **7 (≈9%)** — the rate 13-51 exists to fix |

**That 23% is the first real conversion measurement this project has for an email blast**, and it is
the argument for the story: a second identical invite to the 52 who did not convert has a materially
lower expected yield than the first, while costing the same sender reputation.

## Acceptance Criteria

1. **AC1 — the completed-registrant exclusion uses the canonical contact resolution, not one join.**
   Re-point Cat1 onto the same three-source union `resolveRespondentContactEmail` already encodes
   (submission → magic-link token → user account). ⚠️ That function was itself broken until 13-51
   (`42601` on every call since `9d33b94`) — it is fixed and pinned by a real-DB test now, so it is
   safe to build on. **RED-verify: seed a respondent reachable ONLY by user account, confirm the
   draft is excluded, and confirm it is NOT excluded with the fix reverted.**

2. **AC2 — a per-campaign contact-history filter.** `filterMarketingCohort()` gains an optional
   "exclude anyone already sent campaign X" predicate, backed by `campaign_sends`. The 5-day gap
   stays; this is additive. **RED-verify by asserting the 52 drop out when `draft-invite-2026-08` is
   named, and that the 15 remain.**

3. **AC3 — the dry-run output stops being reassuring by omission.** `excluded: suppressed=0` is true
   and reads as "nobody problematic here". The summary must additionally print **already-registered**
   and **previously-invited** counts, so an operator sees the shape of what they are about to send
   rather than only what the code chose to filter. ⚠️ §2t: an empty result is not a negative result.

4. **AC4 — typo addresses whose corrected twin is already registered are reported, never corrected.**
   All four `.co` addresses in the current cohort have registered `.com` twins. The right action is
   suppress-and-leave, not repair — repairing opens a second route to a registered person.

5. **AC5 — record the yield.** Persist the per-campaign conversion measurement (invited / registered
   after / bounced) so the next blast decision is made on the previous blast's numbers instead of on
   instinct. This is the half of AC7-style measurement that no story currently owns.

## Dev Notes

- **The guards are not buggy; they are narrow.** Every one behaves exactly as written and every zero
  it printed was arithmetically correct. This is [[pattern-ship-a-fix-that-never-fires]]'s quieter
  cousin: a filter that fires correctly on the subset it can see.
- **Do NOT widen the 5-day gap instead of adding AC2.** They answer different questions, and widening
  it would also block legitimate transactional-adjacent sequences.
- The four-table map is §2s / `resolveRespondentContactEmail`; do not re-implement it.

## Residuals

| # | Item | State | Evidence | Owner | Reopen trigger |
|---|---|---|---|---|---|
| **R1** | The 18 hold-list people (14 register-linked + 4 typo twins) have no decided disposition — they need different copy, not this blast | **OPEN — Awwal's ruling** | The segmentation table above, reproducible from a `--dry-run` plus the four-route query | Awwal | Any blast firing before the disposition is set |

## Change Log

| Date | Change |
|---|---|
| 2026-08-22 | Authored by the adjudication agent from a live prod segmentation at Awwal's request. Two defects measured, not theorised: Cat1 misses 112 of 185 register-linked drafts by seeing only the magic-link route, and `filterMarketingCohort()` has no campaign-history awareness so 52 previously-invited people re-enter the cohort. Also captures the project's first email-blast conversion figure: 23% of the 2026-08-05 invite registered, 9% bounced. |

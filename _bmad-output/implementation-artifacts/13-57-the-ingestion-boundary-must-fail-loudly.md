# Story 13.57: The ingestion boundary must fail loudly

Status: backlog

<!-- EMERGENT 2026-08-09, from the enumerator-invite dry run and the teardown that followed it.
Raised because two citizens were found five days after their registrations were dropped — and they
were found by accident, during unrelated cleanup, not by any alert. -->

## Story

As **a citizen who filled in a government form**,
I want **my registration to either succeed or visibly fail**,
so that **I am not silently discarded and left believing I am on the register when I am not.**

## Context — two real people, five days, found by accident

While tearing down a test record on 2026-08-09, an `orphan_submissions: 2` count turned out to be
two live citizens:

| submitted | name | phone as entered | outcome |
|---|---|---|---|
| 2026-08-04 06:24 | **Rosemary** | `+234 08120004038` | no respondent row, `processed = false` |
| 2026-08-04 09:17 | **Adekemi** (NIN on file) | `07051286580` | no respondent row, `processed = false` |

`respondents` carries `CHECK (phone_number ~ '^\+234\d{10}$')`. Both values fail it — one has a space
and a leading zero after `+234`, the other is ordinary local format. The insert threw, the submission
was left unprocessed, and **nothing retried, alerted, logged an actionable error, or told the person.**

Three separate failures compound here, and the story fixes all three because any one alone leaves the
hole open:

1. **The input was rejected instead of normalised.** `normaliseNigerianPhone` **already exists in this
   codebase** and is simply not called on this path — [[pattern-ship-a-fix-that-never-fires]] in its
   purest form: the fix is written, the path does not use it.
2. **The failure was silent.** A submission that cannot become a respondent is the most serious thing
   this system can do to a citizen, and it produced no signal at all.
3. **A DB CHECK constraint was the first thing to notice.** By then the person has gone.

⚠️ **Do not read "contained" as "rare".** Exactly 2 exist today, so the blast radius is small — but
the producer is still running, and the jingle multiplies public-wizard traffic. This is the same
"clear the stock, leave the producer" trap as 13-50 R5.

## Acceptance Criteria

### AC1 — Normalise, do not reject

1. Phone input on **both** the public wizard and the enumerator/clerk form is passed through the
   EXISTING `normaliseNigerianPhone` before it reaches the respondent write. `0705…`, `+234 0705…`,
   `234705…` and spaced variants all resolve to one E.164 value.
2. ⚠️ **Do NOT add a client-side format gate that rejects the user's input.** A Nigerian typing
   `0705…` is not making a mistake — that is how the number is written everywhere locally, and
   rejecting it is exactly the friction deliberately removed from the NIN field
   ([[nin-validation-mod11-invalid]]). Accept what they type; store what the column requires.
3. Where a number genuinely cannot be normalised (too few digits, letters), the person is told **at
   the point of entry**, in their own step, not after submit.
4. **RED-verify:** feed `07051286580` and `+234 08120004038` through the real submit path and assert
   ONE respondent lands with `+2347051286580` / `+2348120004038`. Neuter the normaliser call and prove
   the test reds.

### AC2 — A submission that cannot become a respondent must SCREAM

1. When respondent creation throws, the submission is marked with a **terminal, queryable failure
   state and the reason** — not left indistinguishable from "not processed yet".
2. It emits an ERROR-level log with a stable event name (e.g. `submission.respondent_write_failed`)
   carrying the submission id and the constraint that rejected it.
3. ⚠️ **`processed = false` is not a failure state.** Today it means both "queued" and "permanently
   dead", which is why two dead rows sat unnoticed among healthy ones for five days. Distinguish them
   or the alert in AC3 cannot be written.

### AC3 — The digest counts them, because nobody greps a log

1. The ops digest surfaces **unprocessable submissions** — count plus age of the oldest. Non-zero
   for more than one digest cycle is a red.
2. ⚠️ Silent-when-healthy is preserved (13-42 AC4): zero adds no recommendation.
3. This is the signal that would have caught Rosemary and Adekemi on **4 August**, not the 9th.

### AC4 — The unparsed-consent sibling, same class

`submission-processing.service.ts` derives marketplace consent as
`String(extracted['consentMarketplace'] ?? '').toLowerCase() === 'yes'`. Anything that is not exactly
`yes`/`no` silently becomes **false** — indistinguishable from a real decline.

1. When a form HAS the consent question but the answer parses to neither `yes` nor `no`, log
   `marketplace.consent_unparsed` with the raw value.
2. ⚠️ **Do not flip the default.** `false` is correct for a privacy consent; the defect is the
   silence, not the direction. (Contrast [[pattern-monitor-measuring-something-else]]'s `EMAIL_TIER`,
   where the safe default was the permissive one — the difference is who is harmed by a wrong guess.)

### AC5 — The form is a contract; a re-upload can break it silently

Ingestion reads form answers **by name**: `consent_marketplace`, `main_occupation`, `nin`,
`phone_number`, `firstname`, `surname`. A re-uploaded form that renames or drops one of these changes
behaviour with **no error** — and re-upload is routine here (it mints a new row and requires
re-pinning, [[project_public_wizard_form_update]]).

1. Publishing/pinning a form asserts it still carries every field the ingestion pipeline reads by
   name, with the value shapes it expects (`consent_marketplace` must offer `yes`/`no`).
2. A missing or renamed field **blocks the pin** with a message naming the field and its consumer.
3. Makes Pitfall #46's manual post-re-pin check mechanical.

## Out of scope

- Retro-fixing historical bad phone data beyond the 2 known rows (recovered operationally 2026-08-09).
- SMS verification of numbers. Normalising is not verifying, and the story should not imply it does.

## Notes

- **This is the cheapest launch-protecting story in the backlog.** It is not a feature; it is the
  difference between "we registered 320 people" and "we registered 320 people and know about the ones
  we did not".
- Sibling of 13-42 (which watches metrics) — this makes the *ingestion* boundary observable.

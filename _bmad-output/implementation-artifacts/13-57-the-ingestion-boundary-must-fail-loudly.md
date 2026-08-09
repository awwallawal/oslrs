# Story 13.57: The ingestion boundary must fail loudly

Status: backlog

<!-- EMERGENT 2026-08-09, from the enumerator-invite dry run and the teardown that followed it.
⚠️ THIS STORY WAS RAISED ON TWO FALSE CLAIMS AND BOTH ARE CORRECTED IN PLACE BELOW — read the two
CORRECTION blocks before the Context. Nobody was lost, and the normaliser IS called. What survives is
an ingestion boundary that accepts input it cannot store, fails silently, and was found only by
accident during unrelated cleanup five days later. -->

## Story

As **a citizen who filled in a government form**,
I want **my registration to either succeed or visibly fail**,
so that **I am not silently discarded and left believing I am on the register when I am not.**

## ⚠️ CORRECTION 2026-08-09 — NOBODY WAS LOST. Read this before the Context.

**This story was raised on a claim that turned out to be false. The false version is corrected here
rather than quietly rewritten away.**

I found two `orphan_submissions` and asserted that two citizens had submitted and never been
registered. **Both were already on the register.** Checked properly afterwards — by PERSON, not by row:

| | failed submission | actually on the register |
|---|---|---|
| Rosemary Oko | 04-08 **06:24** | `OSL-2026-ERX8SD`, 04-08 **10:12** — retried ~4h later, succeeded |
| Adekemi Salaudeen | 04-08 **09:17** | `OSL-2026-DZNQHR`, 04-08 **09:04** — already registered 12 min BEFORE the failure; the orphan is a later duplicate attempt |

**The error was inferring IMPACT from STRUCTURE.** "A submission with no respondent" is a real
anomaly. "Therefore this person is not in the register" is a different claim, and it needed its own
query — by name and phone — which it did not get.

**WHAT SURVIVES, and is still worth building:**
- A submission violating the E.164 CHECK **dies silently**, leaving an unprocessable row. True.
- **Nothing alerts on it** — found five days later during unrelated cleanup. True.
- ⛔ **~~`normaliseNigerianPhone` exists and is not called on that path.~~ ALSO FALSE — corrected by
  John (PM) SCP F2, verified here.** It IS imported (`submission-processing.service.ts:25`) and called
  (`:235`). **The real mechanism is a contract collision:** on a length mismatch
  `lib/normalise/phone.ts` returns the RAW input by design — *"Return the canonical-attempt anyway so
  back-fill can flag the row"* — the caller assigns it to a column carrying
  `CHECK (phone_number ~ '^\+234\d{10}$')`, and the warning it emitted **goes nowhere.** The
  never-lose-the-row contract and the DB CHECK are in direct opposition.
- ⚠️ **A SECOND, independent bad shape sat in the same data:** Adekemi's `lga_id` was **`saki_west`**,
  a slug, where every other row carries a UUID. The boundary accepts at least two shapes it cannot
  store — so AC5 must check value SHAPE, not merely field presence.

⚠️ **SECOND CORRECTION, SAME STORY (John/PM SCP F2 + F2b, 2026-08-09).** Two independent reviewers
found two different false claims in this one story — I found the impact error above, John found the
root-cause error. **A dev handed the original AC1 would have found the normaliser already wired up and
either marked it done or flailed.**

- **`+234 08120004038`** → `+234` branch → NSN 11 digits → `wrong_length` → raw value returned →
  CHECK rejects. **This one IS the phone path.**
- **`07051286580`** (Adekemi) → `0` branch → NSN `7051286580`, prefix `70` known → `+2347051286580`,
  which **PASSES the CHECK**. So her insert did **not** die of phone format. ⛔ **Her failure is still
  undiagnosed** — either that path never reaches `:235`, or it threw for another reason. (My own
  candidate, unproven: her `lga_id` was the slug `'saki_west'` where every other row carries a UUID.)
- 🔻 **F2b SHRINKS THIS STORY FROM A BUILD TO A WIRE-UP.** `submissions.processing_error`
  **already exists** (`schema/submissions.ts:79`) beside `processed`/`processed_at`. It is written in
  exactly ONE place — `webhook-ingestion.worker.ts:193` — so the **webhook** channel records its
  failures while the human channel records neither state nor reason. It is already READ in three
  places including an operator counter (`supervisor.controller.ts:188`):
  `COUNT(*) FILTER (WHERE processing_error IS NOT NULL AND processed = true)`.
  **That counter therefore cannot see a `processed = false` failure at all** — a failure counter blind
  to failures ([[pattern-monitor-measuring-something-else]]). Column, writer pattern, reader and
  operator surface all exist and are proven on one channel; AC2/AC3 are **channel parity**, not new
  machinery.

**WHAT DOES NOT SURVIVE: the severity.** Nobody was lost, no recovery is needed. This is friction and
an invisible failure mode, not an emergency. **Do not open this story expecting to rescue anyone.**
Still the right fix before the jingle multiplies wizard traffic — on those merits, not on a rescue.

## Context — the two orphan submissions (impact corrected above)

While tearing down a test record on 2026-08-09, an `orphan_submissions: 2` count turned out to be two
submissions that never became respondents. (Both people ARE on the register via other submissions —
see the first CORRECTION block.)

| submitted | name | phone as entered | outcome |
|---|---|---|---|
| 2026-08-04 06:24 | **Rosemary** | `+234 08120004038` | no respondent row, `processed = false` |
| 2026-08-04 09:17 | **Adekemi** (NIN on file) | `07051286580` | no respondent row, `processed = false` |

`respondents` carries `CHECK (phone_number ~ '^\+234\d{10}$')`. Both values fail it — one has a space
and a leading zero after `+234`, the other is ordinary local format. The insert threw, the submission
was left unprocessed, and **nothing retried, alerted, or logged an actionable error.** (Neither person was told — both got there anyway, one by retrying.)

Three separate failures compound here, and the story fixes all three because any one alone leaves the
hole open:

1. ⛔ **~~The input was rejected instead of normalised; `normaliseNigerianPhone` is not called on this
   path.~~ FALSE — see the second CORRECTION block above.** The normaliser IS called (`:235`). It
   returns the RAW input on `wrong_length` **by design**, and the caller writes that into a
   CHECK-constrained column: a contract collision, not a missing call.
2. **The failure was silent.** A submission that cannot become a respondent is the most serious thing
   this system can do to a citizen, and it produced no signal at all.
3. **A DB CHECK constraint was the first thing to notice.** By then the person has gone.

⚠️ **Do not read "contained" as "rare".** Exactly 2 exist today, so the blast radius is small — but
the producer is still running, and the jingle multiplies public-wizard traffic. This is the same
"clear the stock, leave the producer" trap as 13-50 R5.

## Acceptance Criteria

### AC1 — Normalise, do not reject

1. ⛔ **REWRITTEN 2026-08-09 — the original AC1 was factually wrong.** It said the normaliser was not
   called; it is (`submission-processing.service.ts:235`). **The defect is what it returns on
   failure:** `phone.ts` hands back the RAW input on `wrong_length` so a back-fill can flag the row,
   and the caller writes that straight into a CHECK-constrained column. Resolve the contradiction —
   a value the normaliser could NOT canonicalise must never reach `respondents.phone_number`, and the
   warning it already produces must be acted on rather than dropped.
2. `0705…`, `+234 0705…`, `234705…` and spaced variants must all resolve to one E.164 value; where
   the input genuinely cannot be canonicalised, that is an AC2 failure with a reason, not a silent
   raw write.
3. ⚠️ **Do NOT add a client-side format gate that rejects the user's input.** A Nigerian typing
   `0705…` is not making a mistake — that is how the number is written everywhere locally, and
   rejecting it is exactly the friction deliberately removed from the NIN field
   ([[nin-validation-mod11-invalid]]). Accept what they type; store what the column requires.
4. Where a number genuinely cannot be normalised (too few digits, letters), the person is told **at
   the point of entry**, in their own step, not after submit.
5. **RED-verify:** feed `07051286580` and `+234 08120004038` through the real submit path and assert
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

- Retro-fixing the 2 orphan rows. **No recovery is needed** — both people are registered. Decide
  separately whether to delete them or mark them terminal; AC2 makes that a supported state.
- SMS verification of numbers. Normalising is not verifying, and the story should not imply it does.

## Notes

- **Still worth doing before the jingle, on its real merits:** an ingestion boundary that accepts
  input it cannot store, fails silently, and is visible only by accident. The original framing
  ("two citizens lost") was WRONG — see the correction at the top of this file.
- Sibling of 13-42 (which watches metrics) — this makes the *ingestion* boundary observable.

# Story 13.57: The ingestion boundary must fail loudly

Status: ready-for-dev

<!-- PREPPED FOR DEV 2026-08-12 by Bob (SM) on Awwal's launch-date ruling: FULL SPEC, all 5 ACs, no
carve. Premises re-verified against prod 1f06179 before the flip — see "THE FOURTH READER RAN THE
QUERY". Two findings: orphans still exactly 2 (unchanged in 8 days, 282 processed, producer live
today), and `submissions.processing_error` already exists and has never been written, which removes
the migration AC2 looked like it needed. FIELD-DAY GATE 2 of 3; sequence 13-60 → 13-57 → 13-59. -->

<!-- ⛔ DO NOT REGENERATE THIS FILE WITH *create-story. It would author from epics.md and destroy
four rounds of corrections that cost real measurement to earn. Edit in place. -->


<!-- EMERGENT 2026-08-09, from the enumerator-invite dry run and the teardown that followed it.
⚠️ THIS STORY HAS NOW BEEN CORRECTED THREE TIMES, BY THREE DIFFERENT READERS, AND EVERY CORRECTION IS
IN PLACE BELOW — read them before the Context. (1) the IMPACT claim: nobody was lost. (2) the ROOT
CAUSE: the normaliser IS called. (3) 2026-08-11, SCP §10.4: the `lga_id` "slug vs UUID" premise is
false — all 325 respondents carry a slug.
⛔ ALL THREE ARE THE SAME CLASS: a claim about how bad it is, written without the query that would
have sized it. A fourth reader should run the query first. Nobody was lost, and the normaliser IS called. What survives is
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
- ⛔ ~~**A SECOND, independent bad shape sat in the same data:** Adekemi's `lga_id` was **`saki_west`**,
  a slug, where every other row carries a UUID. The boundary accepts at least two shapes it cannot
  store.~~ **FALSE — struck 2026-08-11 (SCP §10.4, THIRD correction to this story).** Measured:
  `SELECT count(*) FILTER (WHERE lga_id::text !~ '^[0-9a-f]{8}-') , count(*) FROM respondents;`
  → **325 / 325. Every respondent carries a slug `lga_id`. `saki_west` is the NORMAL format**, and
  there is no second bad shape. **AC5's instruction survives on its own merits — check value SHAPE,
  not field presence — but the evidence quoted for it does not.**
  ⚠️ Three corrections, one class every time: **a claim about how bad it is, made without the query
  that would have sized it.** Run the query before writing the sentence.

⚠️ **SECOND CORRECTION, SAME STORY (John/PM SCP F2 + F2b, 2026-08-09).** Two independent reviewers
found two different false claims in this one story — I found the impact error above, John found the
root-cause error. **A dev handed the original AC1 would have found the normaliser already wired up and
either marked it done or flailed.**

- **`+234 08120004038`** → `+234` branch → NSN 11 digits → `wrong_length` → raw value returned →
  CHECK rejects. **This one IS the phone path.**
- **`07051286580`** (Adekemi) → `0` branch → NSN `7051286580`, prefix `70` known → `+2347051286580`,
  which **PASSES the CHECK**. So her insert did **not** die of phone format. ⛔ **Her failure is still
  undiagnosed** — either that path never reaches `:235`, or it threw for another reason. (~~My own
  candidate, unproven: her `lga_id` was the slug `'saki_west'` where every other row carries a UUID.~~
  ⛔ **That candidate is DEAD — all 325 respondents carry a slug `lga_id`; see the strike above and
  SCP §10.4. Her failure has no candidate cause at all now, which is the honest state.**)
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

## ✅ THE FOURTH READER RAN THE QUERY (2026-08-12, Bob/SM, prod `1f06179`)

The header asks for this and no prior reader did it. Results — **the story stands, one AC gets
cheaper, and the "producer is still running" worry is now bounded by evidence rather than asserted:**

| measurement | value | what it means |
|---|---|---|
| submissions with `respondent_id IS NULL` | **2** | Still exactly the two from 2026-08-04. No new orphan in 8 days. |
| `processed = true` | **282** | The happy path is healthy and busy. |
| newest `submitted_at` | **2026-08-12 05:24Z** | The producer **is** live — traffic today. |
| rows with `processing_error IS NOT NULL` | **0 of 284** | See below. This is the finding. |

**⭐ `submissions.processing_error` ALREADY EXISTS — `text`, nullable — and is NULL on all 284 prod
rows.** AC2 needs **no migration and no new column**.

⚠️ **Refined while writing the Tasks, and it makes AC2 cheaper still:** the column is not inert code,
only inert *data*. **One path already writes it** — `workers/webhook-ingestion.worker.ts:193` — and
**two surfaces already read it** (`controllers/form.controller.ts:382-388`, and
`controllers/supervisor.controller.ts:188` as `failedCount`). So AC2 is *copy the sibling ingestion
path onto this one*, not *invent a mechanism*.

⛔ **And it surfaced a defect nobody had noticed.** `supervisor.controller.ts:188` counts
`processingError IS NOT NULL AND processed = true`. **The dead rows this story exists for are
`processed = false`** — so that metric would keep reading zero even after you start writing the
column. A metric that cannot go non-zero is [[pattern-monitor-measuring-something-else]]; fix the
predicate in Task 2 or AC3's signal is born broken.

⚠️ **Do not read "2, unchanged" as "fixed".** Nothing was fixed — the two malformed inputs simply
have not recurred in 8 days. The producer is live and the jingle multiplies public-wizard traffic, so
the sample is small, not safe. This is the 13-50 R5 trap named in the Context, and it is still open.

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
   ✅ **The reason field already exists: `submissions.processing_error` (`text`, nullable), NULL on
   all 284 prod rows.** Write it; do not add a column. The **terminal state** is the part that still
   needs designing — `processed` is a boolean and cannot carry three states, so this is a new
   discriminator (nullable `processed_at` + a non-null `processing_error` is the cheapest honest
   encoding, but that is the dev's call to make explicit and test).
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

## Tasks / Subtasks

- [ ] **Task 1 — Resolve the normaliser/column contract collision** (AC: #1)
  - [ ] `lib/normalise/phone.ts:31` `normaliseNigerianPhone` pushes `wrong_length:expected_10_got_N`
        (`:62`) and **returns the raw input by design** so a back-fill can flag the row. The caller at
        `submission-processing.service.ts:235` then writes that raw value into a CHECK-constrained
        column. **Do not "fix" the normaliser's return contract** — a back-fill depends on it. Fix the
        CALLER: a result carrying `wrong_length` must never reach `respondents.phone_number`.
  - [ ] Route that case to Task 2's terminal state with the warning as the reason.
  - [ ] Accept `0705…`, `+234 0705…`, `234705…`, spaced variants. ⚠️ **No client-side reject gate** —
        see AC1.3; local format is not a user error.
  - [ ] **RED-verify:** `07051286580` + `+234 08120004038` through the real submit path land ONE
        respondent each at `+2347051286580` / `+2348120004038`. Neuter the call, prove it reds.
- [ ] **Task 2 — Terminal failure state + the reason** (AC: #2)
  - [ ] ⭐ **Do not design this from scratch and do not add a column.** `submissions.processing_error`
        already exists (`db/schema/submissions.ts:79`, `text`, nullable) **and a sibling ingestion path
        already writes it**: `workers/webhook-ingestion.worker.ts:193` sets
        `processingError: errorMessage`. **Copy that shape onto the public/enumerator/clerk path.**
  - [ ] ⛔ **Fix the reader while you are here.** `controllers/supervisor.controller.ts:188` computes
        `failedCount` as `processingError IS NOT NULL AND processed = true`. The dead rows this story
        is about are **`processed = false`**, so that metric would **still miss them after you start
        writing the column**. Widen the predicate or the AC3 signal is born broken.
  - [ ] `controllers/form.controller.ts:382-388` already selects and returns `processingError` — once
        written, that surface lights up for free. Confirm it renders.
  - [ ] ERROR log with a stable event name (`submission.respondent_write_failed`) carrying submission
        id + the rejecting constraint.
  - [ ] Encode the third state. `processed` is boolean and cannot carry queued/done/dead; agree the
        discriminator explicitly and test it.
- [ ] **Task 3 — Digest surfaces unprocessable submissions** (AC: #3)
  - [ ] Extend `queues/ops-digest.queue.ts`: count + age of oldest. Silent when zero (13-42 AC4).
- [ ] **Task 4 — Unparsed marketplace consent** (AC: #4)
  - [ ] `submission-processing.service.ts:493` —
        `String(extracted['consentMarketplace'] ?? '').toLowerCase() === 'yes'`. Log
        `marketplace.consent_unparsed` with the raw value when the form HAS the question and the answer
        is neither `yes` nor `no`. ⚠️ **Do not flip the default.**
- [ ] **Task 5 — Form-contract guard at publish/pin** (AC: #5)
  - [ ] The by-name field map is `submission-processing.service.ts:64` (`'consent_marketplace':
        'consentMarketplace'`, etc.) — assert against **that map**, so the guard cannot drift from the
        consumer it protects.
  - [ ] Block the pin in `controllers/form.controller.ts` / `routes/form.routes.ts` naming the missing
        field and its consumer.

## Dev Notes

### Project Structure Notes

- Normaliser lives at `apps/api/src/lib/normalise/phone.ts`, re-exported via `lib/normalise/index.ts:9`;
  existing tests at `lib/normalise/__tests__/phone.test.ts` — extend rather than start a new file.
- The ingestion path this story fixes is `services/submission-processing.service.ts`. The **webhook**
  path (`workers/webhook-ingestion.worker.ts`) is a separate ingest that already does the right thing.
  ⚠️ Per `:1136-1137` the **wizard does its own in-transaction link and writes `processed: true`,
  deliberately bypassing this worker** — so verify your fix actually executes on the wizard path
  ([[pattern-ship-a-fix-that-never-fires]]).
- Schema files must not import from `@oslsr/types` (no dist) — inline any new enum constant with a
  comment naming the canonical source.

### References

- Prod evidence: see "THE FOURTH READER RAN THE QUERY" above (prod `1f06179`, 2026-08-12).
- `respondents` CHECK: `phone_number ~ '^\+234\d{10}$'`.
- Related: 13-42 (metric watch), 9-26 (respondent ⇒ submission invariant; this is the inverse — SCP F5).

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-08-09 | Raised EMERGENT; severity corrected same day (nobody was lost) | Awwal / John (PM) |
| 2026-08-09 | Correction #2 — the normaliser IS called; contract collision, not a missing call | John (PM) |
| 2026-08-11 | Correction #3 — the `lga_id` slug-vs-UUID premise is false (SCP §10.4) | John (PM) |
| 2026-08-12 | Fourth-reader query run on prod; `processing_error` found to exist unwritten; flipped `backlog` → `ready-for-dev` (full spec, all 5 ACs) | Bob (SM) |
| 2026-08-12 | Tasks/Subtasks + Dev Notes added; found the existing writer and the broken `failedCount` predicate | Bob (SM) |

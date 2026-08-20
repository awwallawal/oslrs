# Story 13.57: The ingestion boundary must fail loudly

Status: done

<!-- PREPPED FOR DEV 2026-08-12 by Bob (SM) on Awwal's launch-date ruling: FULL SPEC, all 5 ACs, no
carve. Premises re-verified against prod 1f06179 before the flip — see "THE FOURTH READER RAN THE
QUERY". Two findings: orphans still exactly 2 (unchanged in 8 days, 282 processed, producer live
today), and `submissions.processing_error` already exists and has never been written, which removes
the migration AC2 looked like it needed. FIELD-DAY GATE 2 of 3; sequence 13-60 → 13-57 → 13-59. -->

<!-- ⛔ DO NOT REGENERATE THIS FILE WITH *create-story. It would author from epics.md and destroy
four rounds of corrections that cost real measurement to earn. Edit in place. -->


<!-- EMERGENT 2026-08-09, from the enumerator-invite dry run and the teardown that followed it.
⚠️ THIS STORY HAS NOW BEEN CORRECTED FOUR TIMES, BY FOUR DIFFERENT READERS, AND EVERY CORRECTION IS
IN PLACE BELOW — read them before the Context. (1) the IMPACT claim: nobody was lost. (2) the ROOT
CAUSE: the normaliser IS called. (3) 2026-08-11, SCP §10.4: the `lga_id` "slug vs UUID" premise is
false — and (3b) 2026-08-15 that correction's OWN proof was re-measured, having queried
`respondents.lga_id` when the claim is about `submissions.raw_data->>'lga_id'`: 266 slugs of 286 there,
so the premise is false in both columns.
⛔ FOUR CORRECTIONS NOW — the fourth (2026-08-16) DIAGNOSED Adekemi: a duplicate NIN, twelve minutes
apart, which every earlier pass missed by looking at the phone. ALL ARE THE SAME CLASS: a claim written without the query that would
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
  store.~~ **FALSE — struck 2026-08-11 (SCP §10.4, THIRD correction to this story).**
  ⛔ **AND THE FIRST PROOF WAS ITSELF MEASURED IN THE WRONG COLUMN — re-measured 2026-08-15.** It ran
  `…FROM respondents` (325/325 slugs), but the claim is about the value on the **submission**. Correct
  source: `SELECT … FROM submissions WHERE raw_data->>'lga_id' …` → **266 slugs of 286, only 20
  UUID-shaped.** So `saki_west` is the **majority** format on submissions too — the premise is false in
  *both* columns, and Rosemary's row is one of the 20 UUID exceptions rather than the norm assumed.
  **AC5's instruction survives on its own merits — check value SHAPE, not field presence — but neither
  the original evidence nor its first correction supports it.** (Handoff §2z(d).)
  ⚠️ Three corrections, one class every time: **a claim about how bad it is, made without the query
  that would have sized it.** Run the query before writing the sentence.

⚠️ **SECOND CORRECTION, SAME STORY (John/PM SCP F2 + F2b, 2026-08-09).** Two independent reviewers
found two different false claims in this one story — I found the impact error above, John found the
root-cause error. **A dev handed the original AC1 would have found the normaliser already wired up and
either marked it done or flailed.**

- **`+234 08120004038`** → `+234` branch → NSN 11 digits → `wrong_length` → raw value returned →
  CHECK rejects. **This one IS the phone path.**
- **`07051286580`** (Adekemi) → `0` branch → NSN `7051286580`, prefix `70` known → `+2347051286580`,
  which **PASSES the CHECK**. So her insert did **not** die of phone format. ~~⛔ Her failure is still
  undiagnosed.~~ (~~My own candidate, unproven: her `lga_id` was the slug `'saki_west'`.~~ ⛔ **That
  candidate is DEAD** — SCP §10.4.)

  ✅ **DIAGNOSED 2026-08-16 — FOURTH CORRECTION, and it was never undiagnosable. It was a DUPLICATE
  NIN.** Measured on prod:

  | | |
  |---|---|
  | her registered NIN | `54761471802`, respondent created **09:04:59** |
  | the orphan's `raw_data.nin` | **`54761471802`** — identical |
  | the constraint | `respondents_nin_unique_when_present` — UNIQUE on `nin` WHERE NOT NULL |
  | the orphan | ingested **09:17:10** — twelve minutes later |

  She submitted **twice**. The second insert tripped the partial unique index → **`23505`** → threw.

  ⭐ **AND THE SYSTEM COMPUTED THE CORRECT REASON AT THE TIME AND DISCARDED IT.**
  `submission-processing.service.ts:1101-1109` has produced
  `NIN_DUPLICATE: This individual was already registered on <date> via <source>` since **Story 3.7**,
  and `PermanentProcessingError` since **Story 3.4** (`git log -S`). Both were live on 2026-08-04. Her
  `processing_error` was nonetheless **`NULL`** — observed directly in the R1 dry-run
  (`before: processed=false error=NULL`).

  **That is F2b in the flesh, and it is the strongest argument this story has.** The diagnosis was not
  missing; it had **nowhere to go** — `processing_error` was written in exactly one place
  (`webhook-ingestion.worker.ts:193`), so the webhook channel recorded failures while the human channel
  recorded neither state nor reason. **13-57 is what gives it somewhere to go**, and her case is
  therefore covered — by AC2's terminal state, not by the phone fix that got the attention.

  ⚠️ **Why it took four readers:** every earlier pass looked at the *phone*, because Rosemary's failure
  was a phone failure and the two orphans arrived together. **Nobody compared her NIN to the register.**
  The timestamps were twelve minutes apart in the story's own table from the first day.
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

- [x] **Task 1 — Resolve the normaliser/column contract collision** (AC: #1)
  - [x] `lib/normalise/phone.ts:31` `normaliseNigerianPhone` pushes `wrong_length:expected_10_got_N`
        (`:62`) and **returns the raw input by design** so a back-fill can flag the row. The caller at
        `submission-processing.service.ts:235` then writes that raw value into a CHECK-constrained
        column. **Do not "fix" the normaliser's return contract** — a back-fill depends on it. Fix the
        CALLER: a result carrying `wrong_length` must never reach `respondents.phone_number`.
        → Return contract UNCHANGED. `normaliseRespondentPii` now also returns `rejections`, and the
        caller tests the OUTPUT SHAPE against the column's CHECK (`isStorableNigerianPhone`) rather
        than enumerating warning codes — so `unknown_mobile_prefix` (storable) still passes.
  - [x] Route that case to Task 2's terminal state with the warning as the reason.
        → `PermanentProcessingError(UNPROCESSABLE_INPUT: phone_number (wrong_length:…))`.
  - [x] Accept `0705…`, `+234 0705…`, `234705…`, spaced variants. ⚠️ **No client-side reject gate** —
        see AC1.3; local format is not a user error.
        → The normaliser gained the missing branch: a trunk zero after the country code. **This is
        the actual defect behind Rosemary's row** — `+234 08120004038` derived an 11-digit NSN. No
        reject gate added; the web gate was WIDENED (it used to refuse `+234 0705…`).
  - [x] **RED-verify:** `07051286580` + `+234 08120004038` through the real submit path land ONE
        respondent each at `+2347051286580` / `+2348120004038`. Neuter the call, prove it reds.
        → Done against the REAL test DB. Neutered, the incident reproduces exactly:
        `violates check constraint "chk_respondents_phone_number_e164"`.
- [x] **Task 2 — Terminal failure state + the reason** (AC: #2)
  - [x] ⭐ **Do not design this from scratch and do not add a column.** `submissions.processing_error`
        already exists (`db/schema/submissions.ts:79`, `text`, nullable) **and a sibling ingestion path
        already writes it**: `workers/webhook-ingestion.worker.ts:193` sets
        `processingError: errorMessage`. **Copy that shape onto the public/enumerator/clerk path.**
        → Copied, and extracted into ONE shared writer (`services/submission-terminal-state.ts`) so
        the two channels cannot drift on what "dead" looks like again.
  - [x] ⛔ **Fix the reader while you are here.** `controllers/supervisor.controller.ts:188` computes
        `failedCount` as `processingError IS NOT NULL AND processed = true`. The dead rows this story
        is about are **`processed = false`**, so that metric would **still miss them after you start
        writing the column**. Widen the predicate or the AC3 signal is born broken.
        → Widened — but ⚠️ **the premise needs correcting, see Completion Notes §2.** Both callers now
        bind to shared predicate constants instead of hand-writing them.
  - [x] `controllers/form.controller.ts:382-388` already selects and returns `processingError` — once
        written, that surface lights up for free. Confirm it renders.
        → Confirmed with a test asserting an `UNPROCESSABLE_INPUT` reason reaches the officer's poll.
  - [x] ERROR log with a stable event name (`submission.respondent_write_failed`) carrying submission
        id + the rejecting constraint.
  - [x] Encode the third state. `processed` is boolean and cannot carry queued/done/dead; agree the
        discriminator explicitly and test it.
        → Discriminator = `processing_error IS NOT NULL`. State table + rationale documented at the
        top of `submission-terminal-state.ts`; see Completion Notes §2.
- [x] **Task 3 — Digest surfaces unprocessable submissions** (AC: #3)
  - [x] Extend `queues/ops-digest.queue.ts`: count + age of oldest. Silent when zero (13-42 AC4).
        → Implemented in the digest WORKER + the snapshot (the queue file is only the cron schedule):
        `getIngestionHealth()` → `snapshot.ingestion` → `formatIngestionHealthLines()`, **plus a
        paired recommendation** — without one the digest would have been sent SILENTLY.
- [x] **Task 4 — Unparsed marketplace consent** (AC: #4)
  - [x] `submission-processing.service.ts:493` —
        `String(extracted['consentMarketplace'] ?? '').toLowerCase() === 'yes'`. Log
        `marketplace.consent_unparsed` with the raw value when the form HAS the question and the answer
        is neither `yes` nor `no`. ⚠️ **Do not flip the default.**
        → Default untouched. Logs only when an answer is PRESENT and unreadable; an unanswered
        question is AC5's job, not a log line (rationale in the code + tests).
- [x] **Task 5 — Form-contract guard at publish/pin** (AC: #5)
  - [x] The by-name field map is `submission-processing.service.ts:64` (`'consent_marketplace':
        'consentMarketplace'`, etc.) — assert against **that map**, so the guard cannot drift from the
        consumer it protects.
        → The required set is DERIVED by inverting the map. The map moved to
        `services/respondent-field-map.ts` (re-exported, no importer changed) so the guard can consult
        it without pulling db/queues/email into the publish + settings paths.
  - [x] Block the pin in `controllers/form.controller.ts` / `routes/form.routes.ts` naming the missing
        field and its consumer.
        → Blocked at `SettingsService.setSetting`, NOT at the route — the pin is a settings write and
        the operator scripts use the same service. Route-only would have been a guard one caller can
        walk around. Publish WARNS (not every form is a registration form); the pin REFUSES.

### Review Follow-ups (AI) — adversarial code review, 2026-08-14

⚠️ **The reviewer re-ran the evidence rather than reading the claims**: `tsc --noEmit` clean on api +
web + types; `phone` / `ingestion-contract` / `public-form-pin-guard` **33/33**;
`ingestion-boundary.integration.test.ts` **6/6 against the real `app_test` DB**;
`Step2ContactLga.phone.test.tsx` **10/10**; the shipped Public Core + Master workbooks confirmed
passing the live contract checker. Git File List vs `git status`: **0 discrepancies**. All 14 `[x]`
subtasks verified genuinely done. **All nine findings below were fixed in the same pass** — see
Completion Notes §7.

- [x] **[AI-Review][HIGH] H1 — the digest asserts the one claim this story retracted three times.**
      `SQL_SUBMISSION_DEAD` is `processing_error IS NOT NULL` with no filter on WHICH reason, and the
      digest then says *"those people are NOT on the register"*. The dominant permanent error on this
      pipeline is `NIN_DUPLICATE` (`submission-processing.service.ts:683,695,1071`), whose own text
      reads *"already registered on `<date>` via `<source>`"* — **the person IS on the register**.
      Post-jingle that becomes the bulk of the count. Inferring IMPACT from STRUCTURE, in the monitor
      built to end it. [`operations.service.ts:214`, `ops-digest.worker.ts:143`]
      → FIXED: `deduplicated` split out of `dead`, excluded from the alarm and from `oldestAt`.
- [x] **[AI-Review][HIGH] H2 — AC3's signal is born permanently red with no clearing path.**
      No upper time bound, no acknowledgement, no resolution state. The two known orphans are dated
      2026-08-04, so `oldestAgeHours ≈ 240` against `INGESTION_RED_AFTER_HOURS = 12`: **the first
      digest after deploy is 🔴 and so is every digest after it, forever.** R1 accepts the nag for
      those two; nothing accepts it for DEAD rows, where an operator who reads the reason and acts
      still cannot make the count fall. [`operations.service.ts:214,471`]
      → FIXED: `ACKNOWLEDGED:` prefix + `acknowledge-unprocessable-submission.ts` operator script.
- [x] **[AI-Review][HIGH] H3 — `isStorableNigerianPhone('')` returns `true` and the wizard writes
      `''`, not `null`.** Demonstrated against the real DB, not reasoned:
      `23514 chk_respondents_phone_number_e164`. `submitWizardSchema` is `z.string().min(10)`, so a
      10-char whitespace/punctuation phone passes Zod → normalises to `''` → the guard waves it
      through on "the column is nullable" → `:1013` writes `''`. `normaliseRespondentPii` survives
      only by an incidental `r.value || null`. A proven hole in this story's load-bearing guard.
      [`lib/normalise/phone.ts:53`, `registration.controller.ts:632,1013`]
      → FIXED: `''` is no longer storable; the controller null-coerces after the guard.
- [x] **[AI-Review][MED] M1 — AC2.2's "the constraint that rejected it" is `null` on the primary
      path.** The AC1 throw happens BEFORE the insert, so Postgres never names a constraint and
      `constraintOf(PermanentProcessingError)` returns `null` for exactly the class AC2.2 was written
      about. No test asserted a non-null constraint. [`submission-terminal-state.ts:120`]
      → FIXED: `PermanentProcessingError` now carries an optional `constraint`.
- [x] **[AI-Review][MED] M2 — the stated reason for the guard's placement is unverified.**
      `settings.service.ts:69` says the guard sits in the service because *"the operator scripts in
      `apps/api/scripts/` set this key too"*. **No script in `apps/api/scripts/` calls `setSetting`
      at all**; the one that does write the key — `migrate-system-settings-init.ts:89` — uses a raw
      idempotent INSERT and bypasses the guard entirely. The placement is right; the reason given is
      the class of claim this project's own rule says to measure first.
      → FIXED: comment corrected to the measured truth, seed path named and assessed.
- [x] **[AI-Review][MED] M3 — the shared predicates are raw strings, invisible to `tsc`.**
      The module cites [[pattern-census-counts-sites-not-callers]], then binds both callers to a
      hand-typed *string*: rename `submissions.processing_error` and the typecheck stays green while
      both counters break. [`submission-terminal-state.ts:79`]
      → FIXED: derived from the drizzle column objects, so a rename propagates.
- [x] **[AI-Review][LOW] L1 — AC3.1 says "non-zero for more than one digest cycle"; the code says
      "oldest ≥ 12h"**, so a 13h-old row is red at its FIRST sighting. → RECONCILED IN WRITING, code
      unchanged: the stateless rule is the better one and the deviation is now stated as a ruling
      rather than left as an undocumented gap.
- [x] **[AI-Review][LOW] L2 — no index supports the new per-snapshot scan of `submissions`.**
      → FIXED: partial index on the unprocessable predicate.
- [x] **[AI-Review][LOW] L3 — `packages/types/src/index.ts` still ends without a trailing newline.**
      → FIXED.

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

## Dev Agent Record

### Implementation Plan (as executed)

Five tasks, in the story's order, each red-green-refactor with a RED-verify on the load-bearing
guard. Every fix was traced to the code path that actually EXECUTES it — the wizard bypasses
`processSubmission` entirely, so "fixed in the ingestion service" would have left the busiest
channel untouched ([[pattern-ship-a-fix-that-never-fires]]).

### Completion Notes

**1. AC1 — the collision resolved on the CALLER, and one branch the normaliser never had.**

The story's diagnosis was right and incomplete. Fixing only the caller would have made
`+234 08120004038` a *loud* failure instead of a silent one — better, but still a refusal of a number
whose digits were never ambiguous. `normaliseNigerianPhone` had no branch for a trunk zero AFTER the
country code, which is how a Nigerian writes a number they are also giving to a foreigner. That
branch is added (country-code branches only; a leading `00` is an international prefix and still
falls through to `wrong_length`), so **Rosemary's number now normalises instead of dying**.

The caller half tests the OUTPUT SHAPE against the column's CHECK, never the warning list — a guard
written against warning codes would have rejected `unknown_mobile_prefix`, which returns a perfectly
storable value, and would silently lock out every new prefix the NCC issues.

**THREE write-sites, not one.** `findOrCreateRespondent` (queue), `submitWizard` (public — which
writes `respondents` itself in its own transaction and was normalising *nothing* server-side; the
only normalisation on that channel lived in the browser), and the web Step 2 gate, which was
REFUSING `+234 0705…` at entry. All three now agree.

**2. ⚠️ AC2 — THE STORY'S PREMISE ABOUT THE SUPERVISOR COUNTER IS WRONG, AND I FOLLOWED THE
INSTRUCTION ANYWAY.**

The story says: *"this story's dead rows are `processed=FALSE` — the metric would STILL read zero
after the column starts being written."* Under the encoding actually shipped, **that is not true.**

Task 2's primary instruction was to copy the webhook sibling, and the webhook sibling encodes a dead
row as `processed = true` + a reason. I took that — deliberately, because three surfaces already read
it (the officer's status poll, the supervisor counter, and the web `sync-manager`, which keys "stop
retrying this offline item" on `processed`), and because inventing a third boolean would have forked
the two channels this story exists to bring to parity. `processed = true` therefore means "the
pipeline is FINISHED with this row", not "it succeeded"; `processing_error IS NOT NULL` is the
discriminator. Every NEW dead row is consequently visible to the old predicate.

The predicate was still widened, on smaller and honest grounds: it no longer depends on a flag a
future encoding change could flip, and `unprocessedCount` gained `AND processing_error IS NULL` so
the two counts are disjoint (they used to be able to double-count one row into "3 alerts" for 2
problems). **The two 2026-08-04 rows remain invisible to it either way** — they carry no reason at
all, so no predicate over `processing_error` can see them. They are counted by AC3 as STUCK.

**The other half of the 2026-08-04 mechanism, which the story did not name.** `runProcessing`
recorded a reason only for `PermanentProcessingError`; every other throw was re-thrown as transient,
retried three times by BullMQ, and then abandoned at `processed = false` with no reason forever. A
CHECK-constraint violation was being treated as a temporary blip. Two fixes: non-retryable SQLSTATEs
(`23514`/`23502`/`22P02`/`22001`/`22007`/`22008`) are now classified as permanent, and a
retry-exhaustion backstop marks the row terminal when BullMQ gives up. `23503` (FK) is deliberately
excluded — Story 13-30 chased a real delete-order race there, and retrying is correct.

**3. AC3 — a digest LINE alone would have been a monitor that reports and is never read.**
`runOpsDigest` sends with `disable_notification` when there are no recommendations, so a count that
appeared only as a line would have arrived with no buzz. It raises a recommendation too; red once the
oldest has outlived a full digest cycle (12h), expressed as an AGE so the rule needs no remembered
state. Silent at zero, both halves.

DEAD and STUCK are reported separately because they need different actions (read the reason vs go and
look), and STUCK carries a 60-minute age floor so normal in-flight traffic is never a finding.

**4. AC5 — publish WARNS, the pin REFUSES, and the guard is derived not copied.** Blocking at publish
would refuse every assessment or survey form that legitimately has no NIN question, and a guard that
blocks valid work is a guard that gets disabled. The pin is the moment a form is declared to feed the
register, so that is where it refuses — placed in `SettingsService.setSetting` rather than the route,
because the operator scripts write that key too.

⭐ **The most important test in `ingestion-contract.test.ts` is not the one proving the guard
catches things** — it is the one running the SHIPPED Public Core and Master workbooks through the
real checker and asserting CLEAN. A blocking guard that refuses the live form would lock the operator
out of the re-pin the re-upload procedure makes mandatory, on a launch morning. Both pass.

**5. RED-verified (neutered, watched it fail, restored, re-ran green, grepped for residue):**

| Fix | Neutered | Observed |
|---|---|---|
| phone trunk-zero branch (API) | (written test-first) | 3 fail before implementation |
| phone trunk-zero branch (web) | strip disabled | 4 fail |
| caller rejects unstorable phone | throw disabled | **the incident itself**: `violates check constraint "chk_respondents_phone_number_e164"` |
| wizard server-side normalisation | derivation disabled | 2 fail |
| non-retryable SQLSTATE classifier | returns false | CHECK-violation test fails (re-thrown for retry) |
| STUCK age floor | interval zeroed | fresh row counted → delta 2, expected 1 |
| `marketplace.consent_unparsed` | condition disabled | 1 fail |
| ingestion-contract missing-field | check short-circuited | 9 fail across both suites |

**7. ⛔ CODE REVIEW 2026-08-14 — NINE FINDINGS, ALL FIXED. Three of them were the
story's own retracted error, rebuilt into the monitor.**

The review re-ran the evidence rather than reading the claims, and the three HIGH findings share one
shape with the three corrections at the top of this file: **a claim about impact, asserted without
the query that would have sized it.** The story warned about exactly this four times and the
implementation reproduced it anyway — inside the alert built to prevent it.

- **H1 — the digest said "these people are NOT on the register" about people who ARE.**
  `SQL_SUBMISSION_DEAD` asked one question, "does this row carry a reason?", and reported every YES as
  a lost citizen. The dominant permanent error on this pipeline is `NIN_DUPLICATE`, whose own text
  reads *"already registered on `<date>` via `<source>`"*. Invisible on prod today (0 of 284 rows
  carry any reason); the bulk of the count after the jingle. **Fixed:** `deduplicated` is its own
  bucket, excluded from the alarm and from `oldestAt`, and shown as context with the reason it is
  excluded. `supervisor.controller` deliberately keeps counting them via a NEW predicate
  (`SQL_SUBMISSION_HAS_REASON`) — a supervisor's queue asks a narrower question than the digest does,
  and the two now bind to different names instead of quietly sharing the wrong one.
- **H2 — AC3's signal was born permanently red, with no way down.** No time bound, no acknowledgement,
  no resolution state. The two known 2026-08-04 orphans are ten days old against a 12h red line, so
  the FIRST digest after deploy was red and so was every one after it, whatever an operator did.
  **Fixed:** an `ACKNOWLEDGED:` prefix on the existing column (no migration, no new column — the
  story's own rule), a shared writer that PREPENDS so the original reason survives, and
  `scripts/acknowledge-unprocessable-submission.ts` so the fix has a caller
  ([[pattern-ship-a-fix-that-never-fires]]). ⭐ **This also discharges R1 properly**: the two orphans
  can now be closed out *without inventing a cause for them*, which is exactly what R1 refused to do.
- **H3 — `isStorableNigerianPhone('')` returned TRUE and the wizard wrote `''`, not `NULL`.**
  Not reasoned — **probed against the real database**: `23514 chk_respondents_phone_number_e164`, the
  incident itself, walking through this story's own guard. `submitWizardSchema` is
  `z.string().min(10)`, so ten spaces is a well-formed body. **Fixed:** `''` is no longer storable and
  the null-coercion moved to AFTER the guard — coercing first would turn "we could not read what they
  typed" into "they left it blank", which is the quiet data-loss this story exists to refuse.
- **M1** — AC2.2's "the constraint that rejected it" was `null` on the AC1 path, because the guard
  throws BEFORE the insert and Postgres never gets to name one. `PermanentProcessingError` now carries
  it. **M2** — the comment justifying the pin guard's placement claimed operator scripts call
  `setSetting`; **no script in `apps/api/scripts/` calls it at all**. Corrected, and the one genuine
  bypass (`migrate-system-settings-init.ts`, a raw seed of JSONB `null`) is now named and assessed.
  **M3** — the shared predicates were hand-typed strings invisible to `tsc`; derived from the drizzle
  columns now, so a rename propagates. **L1** — AC3.1's "more than one digest cycle" vs the shipped
  "oldest ≥ 12h" reconciled in writing as a ruled deviation (the stateless rule is the better one).
  **L2** — partial index `idx_submissions_unprocessable`, verified present in Postgres. **L3** —
  trailing newline.

**RED-verified, every HIGH (neutered, watched it fail, restored, re-ran green):**

| Fix | Neutered | Observed |
|---|---|---|
| H3 `''` not storable | restored the `value === ''` short-circuit | **3 fail** — `expected 201 to be 400`: the whitespace phone was ACCEPTED |
| H1 duplicate exclusion | dropped `NOT LIKE 'NIN_DUPLICATE%'` | `expected 1 to be +0` — the duplicate counted as a loss |
| H2 acknowledgement | dropped `NOT LIKE 'ACKNOWLEDGED:%'` | `expected +0 to be -1` — acknowledging changed nothing |

**The operator script was RUN, not typechecked.** `scripts/` is outside tsconfig, so a green `tsc`
says nothing about it: `--list` → `--dry-run` → `--commit` → idempotent re-run (`SKIPPED
(already_acknowledged)`) → teardown verified `deleted rows: 1`, all against the real test DB.

⚠️ **One self-inflicted detour, recorded because the next person will hit it.** Verifying L2's index
meant running `db:push:force` against `app_test`, and **drizzle-kit dropped every raw-SQL CHECK
constraint** — they live in `scripts/migrate-*-init.ts`, not in the drizzle schema. Five tests then
red'd, and two of them INSERTED rows that the (now absent) constraints would have refused, which in
turn blocked re-adding those constraints. Recovery: delete the polluted rows, re-run all twelve
`migrate-*-init.ts` runners. **`db:push` alone does not reconstitute this database** — that is a
property of the repo, not of this story.

**6. Verification run myself, not taken on trust.** `tsc --noEmit` clean on api + web + types;
eslint clean on every touched file; **full API suite 3754 passed / 0 failed (272 files)**; full web
suite 2883 passed with ONE failure — `route-resolution.integration.test.tsx > resolves '/login'`,
timing out at 20s. Chased rather than waved away: that route is untouched by this story, and the file
re-runs **57/57 with `/login` at 2043ms** in isolation. It is the contention flake identified this
morning in handoff §2aa / 13-60 R6 (local memory headroom; never once failed in CI), and it was
provoked here by running a 235-second API suite immediately before it.

### Residuals

| # | Item | State | Evidence / trigger |
|---|---|---|---|
| **R1** | The two 2026-08-04 orphan rows still carry no reason and are counted as STUCK. | ✅ **DISCHARGED ON PROD 2026-08-15 — both acknowledged.** Run on the VPS after the deploy: `019fcb71…` (Rosemary Oko, **OSL-2026-ERX8SD**) and `019fcc10…` (Adekemi Salaudeen, **OSL-2026-DZNQHR**), each dry-run first and shown before committing. Verified two ways: the script now reports *"✓ Nothing unprocessable. The digest is silent, and correctly so."* and an independent query gives **`unprocessed submissions: 0`**. ⚠️ **Timing mattered**: the rows were **275h and 272h** old against a 12h red line, so the first digest tick after deploy would have been 🔴 and stayed there — a nag with no off switch is a nag that gets muted. ⭐ **The row-to-person mapping was confirmed by NAME from `raw_data`, not by timestamp** — writing the wrong reference code into a permanent marker would have repeated the error class this story retracted three times. Original state below. | ~~ACCEPTED, AND NOW DISCHARGEABLE~~ (upgraded by code review 2026-08-14, H2). The story puts retro-fixing them out of scope, and inventing a reason would repeat the class of error this story retracted three times — so nothing invents one. What the review added is an EXIT that does not require a diagnosis: `scripts/acknowledge-unprocessable-submission.ts` writes `ACKNOWLEDGED: <note> — (no reason was ever recorded)`, which states exactly what is true. Without it the "intended nag" was permanent: ten days old against a 12h red line, the digest would have been 🔴 on its first tick and every tick after, forever, whatever Awwal did. A nag with no off switch is a nag that gets muted. | Measurement: both people ARE registered (`OSL-2026-ERX8SD`, `OSL-2026-DZNQHR`). Owner: Awwal. **Action after deploy:** run the script with a note naming those two reference codes. **Reopen trigger:** the digest still naming them after that run. |
| **R2** | `normalisePhone` is implemented twice — canonical in `apps/api/src/lib/normalise/phone.ts`, duplicated in `Step2ContactLga.tsx`. | **ACCEPTED, with a guard** — the API module cannot be imported by web today; sharing it means moving it into `@oslsr/utils`, which is Story 12-3's client-safe-entry work. | `Step2ContactLga.phone.test.tsx` pins the SAME input set the API's `phone.test.ts` asserts, so the duplication is checked rather than merely regretted. **Reopen trigger:** 12-3 shipping — delete the copy then. |
| **R3** | The new `ingestion` section reaches the Telegram digest only; `pnpm dashboard` (CLI) and the Super Admin Operations page do not render it. | **ACCEPTED** — AC3 asks for the digest, and this matches 13-60's precedent (`fieldStaffPhotos` is digest-only too). The data is already on the snapshot, so adding a surface is a render-only change. | **Reopen trigger:** the first time an operator asks "where do I see this in the UI?", or 13-44 (campaign observability) touching the same page. |
| **R4** | Prod verification of AC2/AC3 — no submission has yet died through the NEW terminal path on production, so the digest line and the `submission.respondent_write_failed` event have never fired there. | ✅ **CLOSED ON A STATED GAP 2026-08-20** (13-53 precedent; was DISCHARGE-ON-PUSH). The evidence needs an event that has not happened — no submission has died through the new terminal path on prod. It was NOT manufactured. **Reopen trigger:** the first real ingestion failure that does NOT produce the digest line or the `submission.respondent_write_failed` event. | The honest check after deploy is the NEGATIVE control: query `SELECT count(*) FILTER (WHERE processing_error IS NOT NULL), count(*) FILTER (WHERE processed = false AND processing_error IS NULL AND ingested_at < now() - interval '60 minutes') FROM submissions;` — expect `0 / 2` (the two known orphans) and the next digest to carry the Ingestion line naming 2 stuck. **That line appearing is the proof the wiring fires**; waiting for a real failure is [[pattern-verification-that-cannot-run-yet]]. |
| **R5** | `db:push` alone cannot reconstitute this database. The raw-SQL CHECK constraints live in twelve `scripts/migrate-*-init.ts` runners, and `db:push:force` DROPS them. | **ACCEPTED, NOT THIS STORY'S TO FIX** — a pre-existing property of the repo, found the hard way while verifying L2's index against `app_test` (Completion Notes §7). CI already runs all twelve after `db:push`, so deploy is safe; the exposure is a developer running `db:push` locally and then trusting the suite. | Observed 2026-08-14: one `db:push:force` on `app_test` dropped `respondents_status_check`, `api_consumers_status_check` and the audit dualism CHECKs; five tests red'd, and two of them then INSERTED rows the absent constraints would have refused — which blocked re-adding those constraints until the rows were deleted. **Reopen trigger:** anyone reporting "constraint tests fail locally but pass in CI" — the answer is re-run the twelve runners, not debug the tests. Candidate home: a `db:reset:test` script, or 13-41's CI-guard story. |

## File List

**New (API)**
- `apps/api/scripts/acknowledge-unprocessable-submission.ts` *(code review H2 — the caller that makes the clearing path real)*
- `apps/api/src/services/submission-terminal-state.ts`
- `apps/api/src/services/respondent-field-map.ts`
- `apps/api/src/services/ingestion-contract.ts`
- `apps/api/src/services/public-form-pin-guard.ts`
- `apps/api/src/services/__tests__/ingestion-boundary.integration.test.ts`
- `apps/api/src/services/__tests__/ingestion-contract.test.ts`
- `apps/api/src/services/__tests__/public-form-pin-guard.test.ts`

**New (shared / web)**
- `packages/types/src/ingestion-health.ts`
- `apps/web/src/features/registration/pages/__tests__/Step2ContactLga.phone.test.tsx`

**Modified (API)**
- `apps/api/src/lib/normalise/phone.ts`
- `apps/api/src/lib/normalise/index.ts`
- `apps/api/src/services/submission-processing.service.ts`
- `apps/api/src/services/operations.service.ts`
- `apps/api/src/services/native-form.service.ts`
- `apps/api/src/services/settings.service.ts`
- `apps/api/src/controllers/registration.controller.ts`
- `apps/api/src/controllers/supervisor.controller.ts`
- `apps/api/src/workers/webhook-ingestion.worker.ts`
- `apps/api/src/workers/ops-digest.worker.ts`
- `apps/api/src/db/schema/submissions.ts` *(code review L2 — partial index `idx_submissions_unprocessable`)*

**Modified (tests)**
- `apps/api/src/lib/normalise/__tests__/phone.test.ts`
- `apps/api/src/services/__tests__/submission-processing.service.test.ts`
- `apps/api/src/services/__tests__/operations.service.test.ts`
- `apps/api/src/services/__tests__/settings.service.test.ts`
- `apps/api/src/controllers/__tests__/form.controller.test.ts`
- `apps/api/src/routes/__tests__/registration.routes.test.ts`
- `apps/api/src/workers/__tests__/webhook-ingestion.worker.test.ts`
- `apps/api/src/workers/__tests__/ops-digest.worker.test.ts`

**Modified (shared / web)**
- `packages/types/src/index.ts`
- `packages/types/src/ops-thresholds.ts`
- `apps/web/src/features/registration/pages/Step2ContactLga.tsx`

**Modified (tracking)**
- `_bmad-output/implementation-artifacts/13-57-the-ingestion-boundary-must-fail-loudly.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

⚠️ `docs/adjudication-agent-handoff.md` also shows as modified in `git status` — that is a
CONCURRENT session's 13-60 R6 write-up, **not part of this story**. Do not stage it here.

## Closing verdict

**CLOSED — `done`. Deployed SHA `4e36a92`, verified on production 2026-08-15.**

| Deploy gate | Evidence |
|---|---|
| CI | `CI/CD Pipeline` **31898118041** success · `E2E Tests` **31898118060** success |
| **`deploy` TAKEN, not skipped** | all **10** jobs green (the `31737577114` counter-example is why the job list is read, not the badge) |
| Prod | VPS `git rev-parse --short HEAD` = **`4e36a92`** |
| Full suite on the way out | api **3,769** · web **2,884** · utils 126 · testing 64 |
| **R1 discharged on prod** | both orphan rows acknowledged — see below |

⭐ **The fix verified against the real inputs, not a fixture.** Both 2026-08-04 values were put
through the deployed normaliser: `+234 08120004038` → **`+2348120004038`** and `07051286580` →
**`+2347051286580`**, no warnings. Rosemary's is the case this story fixes — the three-line
`fromCountryCode && nsn.length === 11 && startsWith('0')` strip. **Adekemi's normalised cleanly both
before and after, so her orphan was never a phone problem** — and on **2026-08-16 it was diagnosed**:
a **duplicate NIN** (`54761471802`, already registered twelve minutes earlier) tripping
`respondents_nin_unique_when_present` → `23505`. See the FOURTH CORRECTION in the block above.

⭐ **This makes the story's case stronger, not weaker.** The system had produced the exact right
message — `NIN_DUPLICATE: This individual was already registered on …` — since Story 3.7, and threw it
away because the human channel had nowhere to record it. **AC2 is what catches her case**, not AC1.

⚠️ **A record about the work drifted, on PRODUCTION, and it is mine.** R1's acknowledge note for her
reads *"the ingestion failure itself was never diagnosed"* — true when written on 2026-08-15, false
within a day. The marker is idempotent so the script will not overwrite it. **Awwal's call whether to
correct the note by hand; this story is the canonical record either way** ([[pattern-a-record-about-the-work-is-not-the-work]]).

| Gate | Evidence — run by adjudication, not the dev's self-report |
|---|---|
| `tsc` | API **0** · web **0** |
| `eslint src scripts` | **0** |
| Drift guards, run **DIRECT** (uncached — Pitfall #47) | registry-read **377 files clean** · respondent-write **377 clean** · story-residual **317 clean** |
| Touched suites — **all 12 files** | **332 API** (11 files) + **10 web** (1 file) = **342 passed, 0 failed** |
| File List vs `git status` | ⭐ **32 = 32, exact, no drift in either direction** — notably better than 13-60, whose comma-continued shorthand hid 8 files from a path-extracting script |
| §2a0 debt gate | **0 unchecked boxes**; `### Residuals` ledger present with R1–R3, each carrying a measurement, an owner and a reopen trigger |

### ⭐ RED-verify — the one that mattered, and it validated a design decision

`submission-processing.service.ts:278-281` carries a deliberate comment: *"Test the OUTPUT SHAPE
against the column's CHECK, not the warning list."* Rather than take that on trust, the guard was
mutated into **exactly the mistake it warns against** — checking `r.warnings.includes('wrong_length')`:

```
detail: "Failing row contains (…, 080123456, …)"
AssertionError: expected Error: Failed query: insert into "respondents"…
                to be an instance of PermanentProcessingError
```

**2 tests red, and the raw 8-digit number reached the INSERT.** The warning is emitted as
`wrong_length:expected_10_got_8` — *suffixed* — so an exact-match check silently misses it and the
value is only stopped by the database CHECK, as a raw driver error with no reason attached. That is
precisely the *"a future warning code would otherwise silently escape this guard"* the comment
predicts. Reverted → **108/108 green.**

➜ **The output-shape decision is not a stylistic preference; it is load-bearing, and it is now proven.**

### R1's script — run, not merely typechecked

`scripts/` is outside tsconfig, so `tsc` proves nothing there. `acknowledge-unprocessable-submission.ts`
was **executed** against `app_test`: exits **0**, lists correctly (*"✓ Nothing unprocessable. The digest
is silent, and correctly so."*). The `--commit` flag is genuinely **consulted** (`:109`) and the dry-run
branch **`return`s before `acknowledgeUnprocessableSubmission()` is ever called** — it is structurally
incapable of writing, which is the 13-49 failure (*a `--dry-run` that was parsed and read by nothing*)
checked rather than assumed. The service function itself is pinned by the integration test's **H2**:
acknowledging clears the count, the original reason survives behind the marker, and a second call is a
no-op.

⚠️ **Honest gap:** the *script's* dry-run branch has no test of its own — only the service function it
guards does. Acceptable by this repo's convention that `scripts/` is run rather than unit-tested, but
stated rather than glossed.

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-08-14 | **Adversarial code review — 9 findings (3 HIGH, 3 MED, 3 LOW), ALL FIXED in the same pass.** ⛔ The three HIGH findings are the story's OWN retracted error rebuilt into the monitor: H1 the digest claimed "these people are NOT on the register" about duplicate-NIN rejections (whose reason text says they ARE); H2 the AC3 signal was born permanently 🔴 with no clearing path, so R1's nag could never be switched off; H3 `isStorableNigerianPhone('')` returned TRUE and the wizard wrote `''` not `NULL` — **probed against the real DB: `23514 chk_respondents_phone_number_e164`**, the incident walking through this story's own guard. Fixes: `deduplicated`/`acknowledged` buckets + an `ACKNOWLEDGED:` prefix and an operator script (no migration, no new column), `''` refused with the null-coercion moved after the guard. M1 `PermanentProcessingError` now carries the constraint AC2.2 asked for; M2 the pin-guard placement comment made an unverified claim about operator scripts (no script calls `setSetting` at all) — corrected, real bypass named; M3 predicates derived from the drizzle columns instead of hand-typed. L1 AC3.1 deviation ruled in writing, L2 partial index, L3 newline. **All 3 HIGH RED-verified** (neutered → 3 fail / `1 to be +0` / `+0 to be -1` → restored). Operator script RUN not typechecked. **Full API suite 3769 passed / 0 failed (272 files)**; web 2883 passed with the known route-resolution contention flake, 57/57 in isolation. R1 upgraded to dischargeable; R5 added (`db:push` drops the raw-SQL CHECKs). ⚠️ `done` still blocked by R4. | Code review (AI) |
| 2026-08-14 | Dev complete, all 5 ACs. AC1 fixed on THREE write-sites (queue caller, wizard controller, web Step 2) + a missing normaliser branch for a trunk zero after the country code — the actual cause of the 2026-08-04 row. AC2 terminal state via the webhook sibling's encoding, extracted to a shared writer, plus non-retryable-SQLSTATE classification and a retry-exhaustion backstop (the half the story did not name). AC3 digest line + recommendation. AC4 unparsed-consent log, default untouched. AC5 contract derived from `RESPONDENT_FIELD_MAP`, warning at publish, blocking at the pin chokepoint. 8 RED-verifies. 4 residuals recorded (R4 = DISCHARGE-ON-PUSH). ⚠️ Corrects the story's premise that the supervisor `failedCount` metric would stay at zero — see Completion Notes §2. | Amelia (dev-story) |
| 2026-08-09 | Raised EMERGENT; severity corrected same day (nobody was lost) | Awwal / John (PM) |
| 2026-08-09 | Correction #2 — the normaliser IS called; contract collision, not a missing call | John (PM) |
| 2026-08-11 | Correction #3 — the `lga_id` slug-vs-UUID premise is false (SCP §10.4) | John (PM) |
| 2026-08-12 | Fourth-reader query run on prod; `processing_error` found to exist unwritten; flipped `backlog` → `ready-for-dev` (full spec, all 5 ACs) | Bob (SM) |
| 2026-08-12 | Tasks/Subtasks + Dev Notes added; found the existing writer and the broken `failedCount` predicate | Bob (SM) |

# Story 13-49: Draft-adoption programme (D1-D6) — turn 292 abandoned drafts into registry records

Status: done

<!-- EMERGENT 2026-08-01 from the 13-46 AC11 investigation. What began as "can old drafts safely resume?"
     uncovered that `wizard_drafts` holds 37 distinct answer keys across 214 drafts — names, NINs,
     occupations, skills, household and business data for people who never pressed submit. Awwal
     overruled the initial "invite them to resume" recommendation on the grounds that Story 9-28 had
     ALREADY set the precedent (63 respondents pushed straight into the registry), and that asking
     someone 70-80% complete to restart looks unprofessional. This story implements that ruling. -->

## Story

As **the Ministry, holding a registry of 145 people and a database of 292 abandoned registrations that
contain most of what those people already told us**,
I want **every draft adjudicated to a disposition and the qualifying ones adopted into the registry with
their OSLRS number issued and explained**,
so that **the register reflects the people who actually engaged — roughly doubling it from data already
held — instead of deleting that data when the drafts expire.**

## Context & Evidence (measured on prod, read-only, 2026-08-01)

### What is actually in the drafts

| Metric | Value |
|---|---|
| Drafts | **292** (all have email AND phone) |
| Carrying ≥1 answer | **214** |
| Distinct answer keys | **37** |
| Answering `consent_basic = yes` | **203** |
| Expire | ~~2026-08-31 → 09-29~~ → **2026-11-30 → 12-29** (AC1 done) |

### ⚠️ Identity lives in the QUESTIONNAIRE, not the head-step fields

These drafts were filled when identity was asked *inside* the form. Today's wizard collects it in
dedicated Basics/Contact steps. So:

| Field | `formData.<head step>` | `questionnaireResponses` |
|---|---|---|
| given name | **8 drafts** | `firstname` — **208** |
| surname | — | `surname` — **209** |
| NIN | 126 | `nin` — **185** |

**A backfill that reads `formData.givenName` will find it populated in 8 of 292 rows and silently produce
near-empty records.** Read the questionnaire keys, falling back to head-step fields.

### ⚠️ Resolve a draft to a person by ALL FOUR contact sources

Contact data is spread across four tables (handoff §3c). Matching by NIN alone resolves **28** drafts to an
existing respondent; matching by NIN → `magic_link_tokens.email` → `users.email` resolves **48**. The
20-row difference is **10 duplicate registry records that would have been created and 10 enrichable
records that would have been missed.** `magic_link_tokens` (283 rows / 138 distinct emails) is the most
complete contact source in the database and the one a NIN-only query cannot see.

### The precedent this rests on

Story **9-28** pushed **63** respondents straight into the registry with no `submissions` row — they are
145's second component (145 = 82 with submissions + 63 absorbed). Adopting draft data and *telling* the
person is therefore an established, Ministry-accepted disposition, not a novel one. **22 of those 63 have a
matching draft** whose answers can now backfill a record that was created bare.

### Why doing nothing is not neutral

~~The drafts **expire 2026-08-31**.~~ ✅ **Extended 2026-08-01 to 2026-11-30 (AC1 done, `UPDATE 292`).** Data that 203 people consented to give would otherwise have been deleted on that date.

## Acceptance Criteria

1. **AC1 — Expiry extended FIRST.** ✅ **DONE 2026-08-01 — `UPDATE 292`.** Earliest expiry
   **2026-08-31 → 2026-11-30**, latest 09-29 → 12-29, and **0 drafts expire within 45 days** (was 3).
   Executed ahead of the rest of the story deliberately: losing this dataset to a deadline while planning
   how to use it would have been the worst available outcome, and the change is one reversible `UPDATE`.
2. **AC2 — Disposition is operator-decided, not inferred.** The programme runs from the reviewed
   `docs/vps-snapshots/draft-triage-2026-08-01.xlsx` `DECISION` column. The script READS that column and
   refuses to act on any row whose decision is blank or unrecognised. A recommendation is not a decision.
3. **AC3 — D1 Adopt (142).** Complete + consented + not already registered → create respondent +
   submission from the questionnaire answers, mint the OSLRS reference code, spread ALL answer keys into
   `raw_data` (including the 22 Master-only orphans — they are data the shorter form no longer collects).
4. **AC4 — D2 Enrich (22).** Matches one of the 63 → **UPDATE the existing record, never create a second.**
   Backfill the answers onto it; do not re-issue a reference code. 17 of the 22 also supply a name.
5. **AC5 — D3 Adopt-pending (20).** Name + phone + LGA but no NIN → adopt with
   **`status = pending_nin_capture`** and enrol in the **existing** 9-12 pending-NIN ladder.

   ⚠️ **AMENDED 2026-08-01 (Awwal's ruling) — the original text said `nin_unavailable`, and its two
   clauses could not both be true.** Measured against the code, not the prose:
   `reminder.worker.ts:261` selects the ladder cohort as `status = 'pending_nin_capture' AND nin IS NULL`;
   `reminder.worker.ts:201-202` writes `nin_unavailable` **only** as the day-30 timeout exit. And
   `submission-processing.service.ts:527` can mint just two states at creation —
   `active` (NIN present) or `pending_nin_capture` (no NIN); `nin_unavailable` is unreachable at
   ingestion **by design**. So adopting the 20 as `nin_unavailable` would have created them
   *pre-exhausted*: adopted, counted, and never asked for a NIN by anything —
   [[pattern-ship-a-fix-that-never-fires]] in its purest form.
   The "35 respondents already hold that status" in the original AC is **not the precedent it looks
   like**: those 35 are the measured ladder *residue* (113 created → 78 promoted → 35 exhausted after
   2d/7d/14d), i.e. people who reached that state by failing the ladder — not a cohort anyone created
   there. D3 enters at day 0 and inherits the ladder's measured 69% conversion.
6. **AC6 — D4 Invite (72).** They cannot be registered — there is **no OSLRS number to send them** —
   so they receive an INVITATION only (copy in Dev Notes), never a welcome.

   ⚠️ **CORRECTED 2026-08-02 (code review). The original text read "67 have no name at all", and
   that was measurably false.** It came from the workbook's own identity reader, which had no
   `fullName` fallback; `fd.fullName` is populated in **286 of 292 drafts**, and the adopt path's
   resolver finds a name for **76 of the 78** the workbook called nameless. What actually makes
   those rows non-adoptable is **consent, not identity**: 78 drafts carry no questionnaire at all,
   hence no `consent_basic`, and blank is not consent (AC7). The outcome was right for the wrong
   reason — which is exactly the kind of rationale an operator would later rely on. Both resolvers
   are now one function; the residual 2 `EXCLUDE_EMPTY` rows are the only genuinely empty drafts.
7. **AC7 — Consent is actionable ONLY when `yes`, guarded in code, with an audited super-admin toggle**
   (revised 2026-08-01 by Awwal; supersedes "hard immutable exclude"). The script adopts and contacts on
   `consent = yes` and **refuses** on `no` even if the spreadsheet says otherwise — a sheet is editable, a
   guard is not. But the state itself is **changeable through one controlled path**: a per-respondent
   super-admin toggle (**13-44 AC-A2**) that REQUIRES a free-text reason and writes an `audit_logs` row with
   actor + before/after + reason. Never bulk. Consent genuinely changes — someone says yes by phone, or
   withdraws later — and for NDPA-regulated consent the recorded reason IS the evidence of their
   instruction. The citizen's own self-service toggle (`me.controller.ts:45-67`) remains the primary path.
8. **AC8 — D6 Ignore (26).** Already full respondents. No action, no message, no duplicate.
9. **AC9 — Message set per adopted person:** OSLRS number confirmation + welcome + thank-you/referral +
   magic link to **amend** their registration. All through `EmailService.dispatch` so the `campaign_sends`
   ledger and suppression list apply.
10. **AC10 — DRY-RUN GATE (blocking).** `--dry-run` prints per-cohort counts and the exact mutations for
    **one** named record without writing. Then `--apply --max 1` on a single real record, verified end to
    end — record created, reference code minted, all four messages delivered, magic link opens an
    **amendable** registration — BEFORE the batch. Everything in the 2026-07/08 sessions that broke did so
    on its first real execution; this is a write path against citizen records.
11. **AC11 — Reversible.** Every created/updated row carries `metadata.adopted_by = '13-49'` +
    `adopted_at`, so the entire programme can be identified and rolled back by that marker alone.
12. **AC12 — Observability.** Emit counts to the ops digest and the 13-44 admin view (see Dev Notes
    "Tracking"), so adoption is watchable without a DB query.

## Tasks / Subtasks

<!-- Authored 2026-08-01 (Claude, dev-story) — the story shipped with ACs but no task breakdown.
     SCOPE RULING (Awwal, this session): build the programme end-to-end and STOP AT THE R1 GATE.
     The live `--apply --max 1` and the ~258 sends are gated on Resend Pro, which is unpaid; the
     story therefore closes at `review` with R1 OPEN, never `done`. AC13 (draft identity prefill,
     R2's optional item) is explicitly OUT of scope this pass. -->

- [x] **Task 1 — Decision vocabulary: make D3 operator-decidable (AC2, AC5)**
  - [x] 1.1 Extract the DECISION vocabulary + recommendation rules out of
        `scripts/build-draft-triage-workbook.ts` into one shared, unit-testable module. The workbook
        WRITES the vocabulary and the adopt script READS it — a second copy in the reader is a
        guaranteed drift, and drift here silently mis-routes citizens between cohorts.
  - [x] 1.2 RED: a row with name + phone + LGA + `consent_basic=yes` and **no NIN** must recommend
        `PUSH_PENDING_NIN`, not `INVITE_TO_RESUME`.
  - [x] 1.3 Add `PUSH_PENDING_NIN` to the dropdown; re-point the workbook script at the shared module.
  - [x] 1.4 Regenerate the workbook and assert the tally splits 27 → **20 `PUSH_PENDING_NIN` + 7
        `INVITE_TO_RESUME`**, all other cohorts unchanged (142/22/67/26/8). Safe to regenerate:
        `DECISION` is byte-identical to `RECOMMENDED` on all 292 rows, so no operator work is lost.

- [x] **Task 2 — Decision reader that fails CLOSED (AC2)**
  - [x] 2.1 RED: blank, unrecognised, or whitespace-only `DECISION` → the run **refuses**, naming the
        offending rows. Not skip-and-continue: a skipped row is a citizen silently dropped.
  - [x] 2.2 Read the workbook keyed by `draft_id`; reject a sheet whose `draft_id`s do not reconcile
        against the live `wizard_drafts` set (a stale sheet is a wrong sheet).
  - [x] 2.3 Decisions come from the SHEET; answers come from the **live DB**. Never from the snapshot
        JSON — that is a build input for the workbook, not a source of truth for a write path.

- [x] **Task 3 — Consent guard in code, not in the sheet (AC7, R3)**
  - [x] 3.1 RED: a draft whose live `consent_basic = no` marked `PUSH_TO_REGISTRY` in the sheet must
        be **refused** — the guard reads consent from the DB row, never from the spreadsheet column.
  - [x] 3.2 RED: blank consent is also refused (only an explicit `yes` is actionable).
  - [x] 3.3 Guard sits at the adoption call site so every cohort branch inherits it.

- [x] **Task 4 — Payload builder: draft → submission `rawData` (AC3, AC4, AC5, AC11)**
  - [x] 4.1 RED: identity resolves from `questionnaireResponses` (`firstname`/`surname`/`nin`/`dob`/
        `lga_id`/`phone_number`) with head-step `formData` as FALLBACK — the reverse order finds a
        name in 8 of 292 rows and writes near-empty records.
  - [x] 4.2 RED: **all** answer keys spread into `rawData`, including the 22 Master-only orphans the
        shorter form no longer collects.
  - [x] 4.3 RED: the D3 branch emits **no** `nin` key → the canonical path mints
        `pending_nin_capture` (per the amended AC5), and the row is visible to `reminder.worker.ts:261`.
  - [x] 4.4 Stamp `metadata.adopted_by = '13-49'` + `adopted_at` (AC11) — the same marker 13-44 AC-A1
        reads for its adoption panel, so panel and rollback agree by construction.

- [x] **Task 5 — D1 + D3 adopt executor (AC3, AC5, AC9, AC11)**
  - [x] 5.1 Write a `submissions` row (`processed: false`) against the pinned public form, then run
        `SubmissionProcessingService.processSubmission`. Reuse, not re-implement: that path already
        owns respondent creation, NIN dedupe, reference-code minting, the 9-58 confirmation, the
        13-12 thank-you/referral and marketplace extraction. Hand-rolling inserts here would fork the
        ingestion spine and break [[feedback_unified_ingestion_pipeline]].
  - [x] 5.2 RED: a NIN that already exists surfaces as a handled per-row failure (`NIN_DUPLICATE`),
        never a crashed batch.
  - [x] 5.3 AC9's amend affordance. ⚠️ **AMENDED (code review, 2026-08-02) — this line originally read
        "amend magic link via `MagicLinkService`", which is not what shipped.** What ships is the
        `/check-registration` self-service pointer inside the confirmation; `MagicLinkService` is used
        only by the D4 invite. Rationale + follow-ups in R4. Either way the confirmation is
        TRANSACTIONAL, so the 5-day marketing gap cannot suppress it.
  - [x] 5.4 Verify the message set is the intended one and NOT four stacked emails: confirmation
        (transactional) + thank-you/referral (marketing) + amend link (transactional).

- [x] **Task 6 — D2 enrich executor (AC4)**
  - [x] 6.1 RED: **never** inserts a second respondent, and the existing `reference_code` is unchanged.
  - [x] 6.2 Backfill the draft's answers onto the existing bare record (merge, never clobber a
        populated field with a blank).
  - [x] 6.3 Carry the same AC11 markers so an enrich is as rollback-identifiable as an adopt.

- [x] **Task 7 — D4 invite / D5 exclude / D6 ignore (AC6, AC7, AC8)**
  - [x] 7.1 D4: invitation copy verbatim from Dev Notes — **no OSLRS number**, because for 67 of the
        74 no record exists to have a number. Routed through `filterMarketingCohort` (suppression +
        5-day gap + intra-run dedupe) like every other marketing cohort.
  - [x] 7.2 RED: D5 and D6 produce **zero** sends and zero writes, and are reported as explicit
        counts rather than silence — a silent zero is indistinguishable from a bug.

- [x] **Task 8 — CLI: dry-run by default, blocking gate on apply (AC10)**
  - [x] 8.1 Mirror the `_backfill-registration-autosends.ts` discipline: preview by default, live
        needs `--apply --confirm-i-am-not-dry-running`, plus `--max` and `--rate-per-minute`.
  - [x] 8.2 `--dry-run` prints per-cohort counts AND the exact mutations for one named record.
  - [x] 8.3 RED: `parseArgs` rejects unknown flags and non-positive numerics (typo defence).
  - [x] 8.4 RED: `--apply` without the confirm flag stays a preview and writes nothing.

- [x] **Task 9 — Observability (AC12)**
  - [x] 9.1 Emit per-cohort counts as structured events keyed for 13-44's adoption panel and the
        13-42 integrity watch. This story EMITS; 13-44 renders; neither is blocked on the other.

- [x] **Task 10 — Reversibility + close-out (AC11)**
  - [x] 10.1 RED: every created/updated row carries the `adopted_by` marker — proven by a test that
        selects on the marker alone, which is exactly how a rollback would find them.
  - [x] 10.2 Document the rollback query in the script docblock.
  - [x] 10.3 Full suite + lint + tsc; File List; Residuals ledger updated (R1 stays OPEN); story →
        `review`. **`Status: done` is forbidden while R1 carries no evidence line** (§2a0 / D9).

### Review Follow-ups (AI) — adversarial code review, 2026-08-02

<!-- Raised by the code-review workflow against the uncommitted tree, then FIXED in the same
     pass on Awwal's instruction ("create action items and fix them all automatically").
     Severity order: High → Medium → Low. Each line records what was wrong and where. -->

- [x] **[AI-Review][High] AC7's consent guard never covered the CONTACT path** — `assertConsentActionable`
      guarded `adoptDraft`/`enrichExistingRespondent` only, so the D4 invite loop mailed 74 people
      without ever reading `consent_basic`. AC7 says the script "adopts **and contacts** on `yes` and
      refuses on `no`", and Task 3.3 claimed every cohort branch inherited the guard — the invite
      branch did not. R3's hazard, one cohort over: re-marking any of the 8 `consent_basic = no`
      drafts `INVITE_TO_RESUME` in the sheet would have mailed them.
      [`_draft-adoption-programme.ts:442`, `payload.ts assertNotConsentRefused`]
- [x] **[AI-Review][High] AC14 was entirely unimplemented and untracked** — zero occurrences of AC14 /
      `nin_unavailable` across `draft-adoption/`, the script and all 6 test files; in no task, no File
      List entry and no Residual, while the Closing verdict asserted "Every code AC is implemented".
      The 10-digit `OSL-2026-RRCHDX` trap AC14 itself names had no owner.
      [new `draft-adoption/promote-nin.ts` + `--promote-nins` CLI mode]
- [x] **[AI-Review][High] "Adopted but never told" was silently swallowed** — `sendAdoptionMessages`
      returning `{sent:false, reason:'no_reference_code'}` incremented no counter and logged nothing,
      so a run could print `adopted: 142` while N of them held a registry record nobody told them
      about — the exact outcome `send.ts` says must not be fail-soft, and a breach of Task 7.2's own
      "a silent zero is indistinguishable from a bug". [`_draft-adoption-programme.ts:423`]
- [x] **[AI-Review][Med] `--dry-run` was parsed and never read** — `args.dryRun` had no consumer, so
      `--dry-run --apply --confirm-i-am-not-dry-running` WROTE AND SENT. On the AC10 gate the one flag
      an operator adds for safety was inert. Now a hard contradiction error in `parseArgs`.
      [`_draft-adoption-programme.ts:149`]
- [x] **[AI-Review][Med] The dry-run gate skipped all 22 D2 rows** — pre-flight validated only
      `PUSH_TO_REGISTRY`/`PUSH_PENDING_NIN`, so a `BACKFILL_THE_63` row with blank consent or no
      resolvable respondent surfaced mid-LIVE-run, after earlier rows were written. Both checks are
      read-only. It also made `EnrichResult.filled`'s docblock false ("reported in the dry-run" — the
      dry-run never called enrich). [`_draft-adoption-programme.ts:296`, `adopt.ts:181`]
- [x] **[AI-Review][Med] D2's 22 people received no message at all** — the loop `continue`d straight
      after `enrichExistingRespondent`, though Dev Notes heads the confirmation copy
      "**Adopted (D1/D2/D3)**" and AC9 says "per adopted person".
      [`_draft-adoption-programme.ts:392`]
- [x] **[AI-Review][Med] The D4 resume link dies in 72h while the copy implied months** —
      `wizard_resume` TTL is 72h (`magic-link.service.ts:28`) but the invitation said "your place is
      still held" and "removed when the registration expires" (2026-11-30, AC1). Opened on day 4 it
      is a dead link with no explanation. [`messages.ts buildInvitationEmail`]
- [x] **[AI-Review][Med] `filterMarketingCohort`'s `duplicatesSkipped` was discarded** — drafts sharing
      an email vanished from the invite with no line in `Results:`.
      [`_draft-adoption-programme.ts:438`]
- [x] **[AI-Review][Low] No NIN shape validation on the adopt path** — `buildAdoptionRawData` checked
      only `!== ''` and `extractRespondentData` passes it through as `String()`. Measured on the live
      snapshot: **2 of 190** NIN-carrying drafts resolve to a 4- and a 6-character value, which would
      be written `active` and never enter the ladder. AC14 sets the `^\d{11}$` standard the
      142-record path did not apply. [`payload.ts buildAdoptionRawData`]
- [x] **[AI-Review][Low] PII masking was inconsistent in operator output** — `maskEmail` masked the
      address, then `printExplain` printed NIN and phone in the clear on the same screen.
      [`_draft-adoption-programme.ts:485`]
- [x] **[AI-Review][Low] The two identity resolvers still disagreed** — Task 1 unified the RULES but
      not the FACT EXTRACTION: the workbook's `pick()` read fd-first with **no `fullName` fallback**;
      `resolveDraftIdentity` reads q-first → fd → `fullName`. Measured on the 292-row snapshot: the
      workbook saw no name for **78** drafts of which **76 have one via `fd.fullName`** (present in
      286/292), and the two disagreed on NIN for **14** rows. Outcomes happened to be safe, but AC6's
      stated rationale ("67 have **no name at all**") is false and the drift Task 1.1 existed to kill
      survived one layer down. [`build-draft-triage-workbook.ts` now calls `resolveDraftIdentity`]
- [x] **[AI-Review][Low] Task 5.3's text described work that did not ship** — "AC9's amend magic link
      via `MagicLinkService`"; `MagicLinkService` is used only for D4. R4 discloses the AC9 divergence
      but the task line still read as done-as-written. Corrected in place.

## Dev Notes

### The cohorts (post four-source correction)

| Cohort | Who | n | Action |
|---|---|---|---|
| **D1 Adopt** | complete + consented + **usable** NIN | **140** | create + OSLRS no. + message set |
| **D2 Enrich** | matches one of the 63 | **22** | UPDATE existing; no new record; **message set** |
| **D3 Adopt-pending** | name+phone+LGA, no **usable** NIN | **24** | create `pending_nin_capture` + ladder |
| **D4 Invite** | 70 thin + 2 truly empty | **72** | invitation only — no OSLRS number |
| **D5 Exclude** | `consent_basic = no` | **8** | hard-guarded on WRITE **and CONTACT** |
| **D6 Ignore** | already full respondents | **26** | nothing |

**Registry impact: 145 → ~309** (140 + 24 new), with 22 bare records enriched. Sums to 292.

⚠️ **D1/D3 RE-MEASURED AGAIN 2026-08-02 (R8 resolution): 142/22 → 140/24.** A malformed NIN now
counts as **absent rather than present**, so the 2 drafts carrying a 6- and a 4-character NIN move
from D1 to D3. See "R8 — resolved as a class" below for why they are adopted-pending rather than
invited. Verified across all 292 real rows: **164 adopting rows recommended, 0 rejected by the
enforcer** — before the fix those 2 rows would have aborted the entire batch at pre-flight.

⚠️ **D3/D4 RE-MEASURED 2026-08-02 (code review).** The split was `D3 20 / D4 74 (7 thin + 67
nameless)`. That rested on the workbook resolving identity with a reader that had **no `fullName`
fallback** while the adopt path's `resolveDraftIdentity` has one — and `fd.fullName` is present in
**286 of 292 drafts**. Unifying the two resolvers moves **65 rows `EXCLUDE_EMPTY → INVITE_TO_RESUME`**
(same D4 action, honest label) and **2 rows into D3, where they are adopted instead of merely
invited**. D1/D2/D5/D6 are byte-for-byte unchanged, which is the check that the change is a
relabelling and not a re-routing. **"67 have no name at all" was never true** — see the AC6 note.

### 🎁 AC14 (NEW 2026-08-02) — 10 FREE NIN PROMOTIONS, no outreach required

**10 of the 35 `nin_unavailable` respondents ALREADY SUPPLIED a NIN — it is in their draft and was never
written to the respondent row.** They have since been chased three times by the 9-12 ladder for information
they had already given. Promote them from the draft instead of asking again.

| ref | name | NIN in draft |
|---|---|---|
| OSL-2026-GHKMYR | sadiq abdulmajid | 27287257118 |
| OSL-2026-800KD8 | Adedayo Olakunle Adeoye | 31468486435 |
| OSL-2026-MVGRC2 | Isaiah Abiola Olatunbosun | 55581526029 |
| OSL-2026-XFZMDP | Florence Adejumo | 48801656320 |
| OSL-2026-KKGH4S | IFEYINWA GEORGINA ADIBE | 41279312287 |
| OSL-2026-C066C2 | Folakemi oluwaseun Ejimokun | 69974412841 |
| OSL-2026-RX145M | Aderonke Olawuni Oluwatomiwo | 75307723007 |
| OSL-2026-SSGTX5 | Ganiyu Taiwo | 81408916224 |
| OSL-2026-DZVTS4 | Zainab Yusuf | 37577870502 |
| OSL-2026-RRCHDX | Dasola Zainab Aminu | `…820` — **11 digits, promoted cleanly**. `1589857782` (the 10-digit value this table used to show) is the draft's HEAD-STEP field, an autosave snapshot caught mid-keystroke; the questionnaire answer is those digits plus the eleventh. See the correction note below. |

⚠️ **SCOPE SIMPLIFIED 2026-08-03 — Awwal confirmed a NIN does NOT gate programme eligibility** (it was
made optional deliberately, to remove registration friction). That changes what AC14 is FOR: the value is
**not** unlocking anything, it is **stopping the 9-12 ladder from chasing people who already answered**.
Consequently: **do the clean promotions; chase nobody.** Same reasoning
retires the "should we extend the reminder sequence?" question: the ladder already stops at 14d and
transitions, which is correct design for an optional field.

**AC14:** validate each against `^\d{11}$`, check the NIN is not already held by another respondent, then
set it and promote `nin_unavailable → active`, writing an audit row. **All 10 promoted cleanly on the live
run (2026-08-03).** The rule that a non-11-digit value must NEVER be silently padded or dropped still
stands and is still tested — it simply did not fire, because no candidate was malformed once the NIN is
read from the right field.

✅ **IMPLEMENTED 2026-08-02** — `draft-adoption/promote-nin.ts`, CLI mode `--promote-nins`, 16 tests.
The table above is now a **regression test**: `draft-adoption.promote-nin.test.ts` drives the classifier
with 11-digit and malformed shapes and asserts `promote` vs `manual_review_bad_shape`. The 10-digit
fixture is kept as a SHAPE case, no longer as a claim about a real person. ✅ **EXECUTED against prod
2026-08-03 — 10/10 promoted; see R9.**

⚠️ **Effect on the numbers — the 2026-08-02 "correction" was itself wrong, re-corrected 2026-08-03 by
RUNNING it.** The original read "the 35 becomes **25**"; a review changed it to **26** on the belief that
only 9 could clear without a human. **The original was right.** The 35 became **25** (measured on prod),
and post-adoption `nin_unavailable` will be **25 + 24 (D3) = 49**. The detour happened because the review
read `form_data->>'nin'` — the head step — instead of `questionnaireResponses.nin`. **Systematic, not a
one-off: 14 drafts carry both values, in 12 the head string is a strict truncated prefix of the
questionnaire answer, and the malformed-NIN count is 2 questionnaire-first vs 15 head-first — measured, so
reading the head field first invents exactly 13 broken NINs that were never broken (0 missed the other
way).** Anyone "fixing" those 13 would be editing correct citizen data.

**Why this matters beyond the 10:** it partly explains the ladder's non-response. Some of the people who
"ignored three reminders" had already answered — so the residue is smaller and less stubborn than the raw
35 suggests. **Fix the data before escalating the ask.**

### ❗ What the 82 non-adoptable actually means (D4 + D5)

**None of the 82 can EVER be auto-adopted, no matter how long we sequence.** 67 of them have **no name** —
there is no person to create a record for, only an email and a phone. A month of reminders buys
*conversions* (they come back and finish), not eventual auto-adoption. Plan the messaging accordingly: the
goal for D4 is a click, not a countdown.

### 📈 Email outreach WORKS — do not plan as if it doesn't

The 9-12 pending-NIN ladder is the only measured outreach we have, and it reads:
**113 created → 78 promoted → 35 residue = 69% conversion**, every dispatch to `primary_email`.
The 35 that remain are the residue *after three reminders* (2d/7d/14d), not evidence that email fails.
⚠️ **Those 35 have EXHAUSTED the ladder** — a fourth generic NIN reminder is not the lever. The OSLRS-number
+ welcome framing in AC9 is a genuinely different ask, which is why it may move people the reminder did not.

### Messages

**Adopted (D1/D2/D3)** — confirmation, not invitation. Lead with the number; the ask is verification, not work:
> Your Oyo State Skilled Labour Register number is **{{reference_code}}**.
> We had your registration details on file and have completed your entry.
> **[Review or update my details]** — check anything is wrong, or add what's missing.
> {{thank-you + referral link}}

**D4 Invite (74)** — neutral on fault, specific about effort, states what to have ready:
> **Subject: Your Oyo Skills registration is still open — 2 minutes to finish**
>
> You started registering on the Oyo State Skilled Labour Register and we have your contact details saved.
> The registration was never completed, so your record is not yet active.
>
> This may have been a network interruption or simply a busy moment — either way, your place is still held.
>
> **[Continue my registration]**
>
> It takes about two minutes. You'll need your NIN, your LGA, and your trade or occupation.
> Once complete you'll receive your OSLRS number and be listed for skills programmes and opportunities.
>
> If you'd prefer not to continue, no action is needed and your details will be removed when the
> registration expires.

**Phone-only (7 respondents registry-wide):** templates already exist — **13-11 AC6 Dev Notes**, sent
manually from the OSLRS phone, tagged `utm_source=referral-sms`. ⚠️ **Only 7 people in the whole registry
are email-less** (138 of 145 are reachable by email from some source), so **Termii sender-ID is NOT on this
programme's critical path** — MEMORY's "26 true phone-only" is stale.

### Tracking — what exists, and what this changes

| Story | Status | Covers |
|---|---|---|
| **13-9** | done | tagging, suppression, `campaign_sends`, funnel — the attribution substrate |
| **13-44** | ready-for-dev | super-admin campaign observability UI: per-campaign funnel, contact log, ledger-liveness banner |
| **13-42** | ready-for-dev | ops-digest data-integrity signals that fire on the real defect delta |

**A tracking story exists — 13-44 — and it is the right home. What changes is its SCOPE:** 13-44 was written
for *campaign* observability (blasts). This programme adds **registry-adoption** observability, which is a
different question: how many adopted / enriched / pending-NIN / invited-not-yet-returned, and is the
programme still converting. **Recommend extending 13-44 with an adoption panel rather than minting a new
story** — it already owns the admin surface, the contact log and the ledger banner. This story emits the
counts (AC12); 13-44 renders them; 13-42 alerts on the delta (e.g. adoption emits but `campaign_sends` does
not grow → the ledger is failing again).

### Impact on Epic 12 / Story 12-4 — its taxonomy is invalidated by this programme

**We do NOT have one large table holding all respondent data from every source.** What exists is
`registry_unified` — a **VIEW** (145 rows; `respondent_id, lga_id, source, status, nin, metadata,
consent_marketplace, consent_enriched, created_at, raw_data`) that is respondent-anchored over
`respondents ⟕ submissions` (Story 13-33). It is a unified **READ**, not a unified store, and it currently
sees only people who are already respondents.

**It does NOT see:** the **292 `wizard_drafts`** (this story's subject), the 11-2 import spine
(ITF-SUPA / ASNAT), or 13-2 association imports. So "unified registry" today means "one canonical way to
count registered people", not "every source in one place".

**What 13-49 changes for 12-4 — three things:**
1. **12-4's headline numbers are already stale.** Its story states `139 = 76 completed + 55 data_lost +
   7 no_submission + 1 pending_nin`; the registry is now **145 = 82 with submissions + 63 absorbed**.
   Re-derive before building — do not inherit the count (the recurring failure of these sessions).
2. **The `data_status` taxonomy needs a new bucket.** After adoption there will be respondents whose data
   came from a draft rather than a submission or an enumerator: `adopted_from_draft`. Without it, 142 people
   land in whichever bucket the query happens to put them, and the dashboard mislabels them exactly as
   12-4 exists to stop.
3. **Good news: no schema change.** 13-49 writes real `respondents` + `submissions` rows, so
   `registry_unified` picks the adopted people up **by construction** — the view needs no edit. 12-4 must
   only widen its status taxonomy and re-measure.

**Open design question for 12-4 (not this story's to answer):** should drafts be visible in the unified read
as *prospective* rows before adoption? It would make the 292 countable without adopting them — but it
changes "registry total" from "registered people" to something softer, which is precisely the mislabelling
12-4 was written to end. **Recommend NO**, and keep drafts in their own operator view (13-44's panel).

### Dependencies
- Reviewed `DECISION` column in `draft-triage-2026-08-01.xlsx` (regenerate with
  `pnpm --filter @oslsr/api draft:triage`).
- Resend Pro for the message volume (~258 sends).
- No schema change. No new deps.

## Dev Agent Record

### Implementation plan (as executed, 2026-08-01 → 08-02)

Built the programme end-to-end and **stopped at the R1 gate** per Awwal's scope ruling: the live
`--apply --max 1` and the ~258 sends are gated on Resend Pro, which is unpaid. Status is
therefore `review`, **never `done`**, until R1 carries a real evidence line.

**The architectural decision everything else follows from: reuse the ingestion spine, don't fork
it.** An adoption is a submission that arrived late, so `adoptDraft` writes a `submissions` row
with `processed: false` and hands it to `SubmissionProcessingService.processSubmission`. That
path already owns NIN dedupe (FR21), the 9-12 race-resolution merge, reference-code minting with
its 23505 retry, LGA canonicalisation, the audit emission, and the consent-gated marketplace
extraction. Hand-rolling respondent inserts here would have re-implemented every one of those and
inherited none of their fixes ([[feedback_unified_ingestion_pipeline]]).

### Decisions taken with Awwal during dev

1. **AC5 amended** — `nin_unavailable` → `pending_nin_capture`. See the AC itself; the original
   wording's two clauses were mutually exclusive against `reminder.worker.ts`.
2. **D3 made operator-decidable** — added `PUSH_PENDING_NIN` to the workbook vocabulary rather
   than letting the script infer the split. AC2 forbids the script deciding a disposition, and
   the 20 D3 rows were previously hidden inside `INVITE_TO_RESUME`'s 27.
3. **AC9's amend link → `/check-registration`** — the literal reading (a magic link into the
   9-61 edit path) cannot work: that surface is `authenticate`-gated and these people have no
   accounts (a draft is pre-account by construction; `auth.service.ts:664-674` 401s on a missing
   `users` row). A `wizard_resume` link is worse — it reopens the draft we just adopted and
   collides on `NIN_DUPLICATE`. `/check-registration` already exists and issues its own secure
   link. **AC9's wording is now aspirational vs what ships — see R4.**

### Three bugs found by RUNNING, not by tsc (Pitfall #47 / §2a2)

`scripts/` is outside tsconfig, so `tsc --noEmit` was green over all three:

| Bug | Symptom | Caught by |
|---|---|---|
| `getSetting` imported from `services/settings.service.js` | `SyntaxError: does not provide an export named 'getSetting'` — the script could not even start | first real `--dry-run` |
| `'registration_status'` / `'reengagement'` category literals | neither is a valid `NotificationCategory` (`-status` / `-blast`) | reading `notification-category.ts` after the 13-24 guard failed |
| `sendGenericEmail(mail, …)` with no `to` | every live send would have thrown on row 1 | `tsc`, **only after** the send moved into `src/services/` |

The third is the argument for `draft-adoption/send.ts` existing at all: moving send policy into
the type-checked layer turned an invisible runtime failure into a compile error.

### Verification actually performed

- **AC2 fail-closed, on a real run**: blanked one `DECISION` cell → run aborted with
  `row 5: DECISION (blank) is blank or unrecognised`, nothing written.
- **R3 closed by execution**: set the `consent_basic = no` draft to `PUSH_TO_REGISTRY` in the
  sheet. The cohort tally showed **2** D1 rows (the sheet was obeyed as input) and the code
  still refused — `consent_basic = "no" on the live draft … The spreadsheet cannot override
  this.` Nothing written.
- **Reconcile guard fired for real** — the first fixture sheet covered 4 of 24 live drafts and
  the run aborted naming the 20 that carried no decision.
- **AC10 `--explain`** printed the exact mutations for both a D1 and a D3 record, including
  `nin key present: false` / `_pendingNin: true` / `status: pending_nin_capture (enters the 9-12
  ladder)` for D3.
- Fixture drafts were torn down **by id**, never "restore to N" (handoff §2h).
- 353 files pass the 13-37 registry-read drift guard; `tsc --noEmit` and `eslint src scripts`
  clean.

### Adversarial code review — 11 findings, all fixed (2026-08-02)

The review ran against the uncommitted tree and found **3 High, 5 Medium, 3 Low**. Awwal's
instruction was to raise them as action items AND fix them in the same pass; the ledger is under
Tasks/Subtasks → "Review Follow-ups (AI)". Four are worth recording as lessons rather than diffs:

1. **The consent guard protected the WRITE paths and not the CONTACT path.** Task 3.3 claimed "the
   guard sits at the adoption call site so every cohort branch inherits it" — the D4 invite loop
   did not inherit it, so re-marking one of the 8 `consent_basic = no` drafts `INVITE_TO_RESUME`
   in the sheet would have mailed a person who explicitly said no. **The story had already learned
   this lesson once (R3) and fixed it in one place.** The new `assertNotConsentRefused` is
   deliberately *weaker* than `assertConsentActionable`: adopting needs an explicit `yes`, but an
   invitation only needs the absence of a `no`, because 78 drafts never reached the consent
   question at all and requiring `yes` would refuse the entire cohort AC6 exists to reach.
2. **AC14 was written into Dev Notes and shipped in nothing** — no module, no task, no test, no
   Residual — while the Closing verdict read "Every code AC is implemented and gated". A numbered
   AC that lives outside the Tasks list is an AC nobody is holding.
3. **The silent branch.** `sendAdoptionMessages` could return `no_reference_code` and that path
   incremented no counter and logged nothing, so a run could print `adopted: 142` while N of them
   held a record nobody had told them about. The story states this failure mode twice in prose
   (`send.ts` "must not be fail-soft", Task 7.2 "a silent zero is indistinguishable from a bug")
   and then left the branch empty. **Prose is not a guard.**
4. **A test that passed over a hole.** `--dry-run` was parsed into `Args` and read by nothing, so
   `--dry-run --apply --confirm-i-am-not-dry-running` WROTE AND SENT. The CLI test that looked
   like it covered this asserted `isLiveRun(parseArgs(['--dry-run','--apply'])) === false` — true,
   but only because it omitted the confirm flag. It never touched `--dry-run` at all. A test that
   asserts a safe outcome without exercising the mechanism meant to produce it reports coverage
   over a hole. `parseArgs` now rejects the combination outright.

**Verification of the fixes, by execution and not by argument:**
- `--dry-run --apply` → exits **1** with `--dry-run and --apply are contradictory` (run live).
- `--promote-nins` → ran end-to-end against a real database; the four-source SQL is valid.
- `--help` loads the whole module graph — the check that caught the original `getSetting` bug.
- `eslint` caught a genuine defect I introduced: a backtick inside the `HELP_TEXT` template
  literal terminated the string. `scripts/` being outside tsconfig means lint is the only
  compile-time signal there — Pitfall #47's sibling.
- The workbook was regenerated and the tally compared cohort by cohort: **D1/D2/D5/D6 unchanged**,
  65 rows relabelled inside D4, 2 rows promoted D4 → D3. Unchanged control cohorts are what make
  it a relabelling rather than a re-routing.
- Full API suite **3488 passed / 0 failed**; tsc clean; eslint clean; registry-read drift guard
  354 files / no drift. Test count for this story: **103 → 145**.

### Completion notes

- 103 new tests across 6 files; full API suite green (3445 passing before this work).
- The 13-24 anti-fragmentation guard **caught this story** hand-rolling `getSuppressedEmails` in
  a script. Resolved as the guard's docblock instructs — not by an allowlist entry: the D4
  invitation (marketing) inherits `filterMarketingCohort`, and the adoption confirmation
  (transactional) moved to the service layer where `submission-processing.service.ts` already
  makes the same call. Deliberately **not** routed through the marketing filter: its 5-day gap
  would silently withhold an OSLRS number from someone contacted recently, leaving them holding
  a registry record they were never told about.

## Residuals

| ID | Severity | State | Re-runnable evidence | Owner |
|---|---|---|---|---|
| ~~**R1**~~ ✅ **CLOSED 2026-08-04 — THE WHOLE PROGRAMME RAN** | High | **CLOSED** | Executed cohort by cohort against live prod, each with its own single-record gate first: **D1 139 · D2 16 · D3 19 = 174 people**, registry **145 → 309**. Every AC10 check passed on the first record (`OSL-2026-WFZG3J`): respondent + marker, code minted, submission via the canonical path, confirmation **delivered** (Resend webhook) and 13-12 thank-you ledgered, and `/check-registration` resolving by reference code, email AND phone. Integrity at close: **0 duplicate NINs, 0 missing reference codes, 9-26 ceiling still 63**. Two rows did not adopt and both are correct outcomes — one `NIN_DUPLICATE` (the person self-registered mid-run and dedupe refused a second record) and one CHECK-constraint refusal on a malformed phone, fixed and adopted as `OSL-2026-ERX8SD`. | ✅ done |
| ~~**R2**~~ ✅ **RESOLVED 2026-08-01 — by reading the code, deliberately NOT by a live test** | Medium | **CLOSED** | **ANSWER: identity does NOT prefill.** `useWizardDraft.ts:114` hydrates via `setFormData(migrateLegacyName(draft.formData ?? {}))`, and `migrateLegacyName` (`:59-70`) maps only legacy `fullName` → `givenName`/`familyName`. **Nothing reads `questionnaireResponses.firstname`** (grep across hooks + WizardPage: zero hits). So the **208 drafts** whose name lives in the questionnaire block resume with EMPTY Basics/Contact steps. ⚠️ **A live test was deliberately NOT run, and would have been misleading:** today's wizard writes `formData.givenName`, so any draft created now has the very field the old drafts lack — a self-made test would PASS while telling us nothing, and testing it honestly would mean opening a real citizen's registration for an answer the code gives free. **Consequence (decided):** D4 copy says *"finish in 2 minutes — you'll need your NIN, your LGA and your trade"*, NOT *"pick up where you left off"*. **Optional AC13 (not a blocker):** add a `questionnaireResponses.firstname/surname/nin/dob/lga_id → head-step` mapping inside `migrateLegacyName` — same function, same hydration hook, ~10 lines, and the legacy-`fullName` case is the precedent that it belongs there. Would make 208 drafts prefill identity and turn D4 from 'finish' into 'confirm and submit'. Affects D4 conversion only; D1/D2/D3 are server-side and never touch this path. | dev |
| **R3** — 8 × `consent_basic = no` | High | ✅ **CLOSED — VERIFIED BY EXECUTION 2026-08-02** (was "closed by AC7" on the design; now closed on evidence) | Ran exactly the prescribed test: patched the `consent_basic = no` fixture draft to `PUSH_TO_REGISTRY` in the sheet. The cohort tally printed **2** D1 rows — the sheet WAS obeyed as input — and the run then refused: `draft …d003: consent_basic = "no" on the live draft — refusing to adopt (AC7). The spreadsheet cannot override this.` Exit 1, nothing written. Re-run: `pnpm --filter @oslsr/api draft:adopt -- --dry-run --sheet <patched.xlsx>`. Unit cover: `draft-adoption.payload.test.ts` "REFUSES consent = no even though the caller already chose to adopt". | dev |
| **R4** — AC9's text still promises a "magic link to amend" | **Medium** | ✅ **ACCEPTED 2026-08-05 — spec-vs-ship divergence, ruled not defective (Awwal, 2026-08-01)** · REOPEN TRIGGER: if a real in-place amend link is ever built, AC9/AC10 wording must be corrected in the same commit | What ships is the `/check-registration` self-service pointer (Awwal's decision, 2026-08-01; rationale in Dev Agent Record + `messages.ts`). **AC9's wording was deliberately left unedited** so the divergence stays visible rather than being tidied away — this row IS the record. Two follow-ups, neither blocking: (a) a real in-place amend link needs a new `registration_edit` magic-link purpose authorising by respondent, i.e. a new public auth surface wanting its own security review; (b) AC10's phrase "all four messages delivered" now reads as three (confirmation, thank-you/referral, and the amend pointer inside the confirmation). Evidence when done: the AC text updated, or a story raised for the new purpose. | Awwal + dev |
| **R5** — adopted drafts are NOT deleted | **Medium** | ⚠️ **ACCEPTED 2026-08-05 — BUT NO LONGER THEORETICAL; MEASURED, AND ONE OPERATOR DECISION IS OUTSTANDING** | A `wizard_drafts` row survives its own adoption, so an adopted person who later clicks an old resume link can reach the wizard and, on submit, hit `NIN_DUPLICATE` — a confusing error rather than data loss. Deleting on adopt was rejected because AC11 demands the programme be reversible and a deleted draft cannot be restored. Cheap mitigations if it bites: expire adopted drafts (one `UPDATE` keyed by the same `adopted_from_draft_id` trail), or teach the wizard-resume redemption to recognise an adopted draft. Evidence: `SELECT count(*) FROM wizard_drafts d JOIN respondents r ON r.metadata->>'adopted_from_draft_id' = d.id::text;` should be 0 once handled.

📏 **MEASURED ON PROD 2026-08-05 (it had only ever been reasoned about):**
- **167** adopted drafts survive their own adoption.
- **149** of those people now hold a NIN — so a resume-and-submit 409s `NIN_DUPLICATE`.
- **37** of them hold a magic-link token that is `wizard_resume`, **unused, and unexpired** — i.e. 37 real people can click a link still sitting in their inbox and land on that error.
- **0** have hit it so far.

So the exposure is real, bounded, and currently unrealised. It gets *more* likely at launch, not less: a blast is exactly what makes someone dig out an older OSLRS email.

**RECOMMENDED MITIGATION — expire the 37 TOKENS, do not touch the DRAFTS.** One `UPDATE` setting `expires_at = now()` on those tokens. This respects Awwal's retention ruling exactly (*keep draft data indefinitely*): a token is not draft data, and every answer stays on disk and in the adopted respondent record. It converts a confusing "your NIN is already registered" dead-end into an ordinary expired-link page.
✅ **EXECUTED 2026-08-05 on Awwal's instruction — 38 tokens expired, 0 dead-ends remain, `wizard_drafts` untouched (278 rows).** Targeted deliberately: only tokens held by adopted people **who already hold a NIN**, because those are the only ones that dead-end. **The one adopted person WITHOUT a NIN was left alone on purpose — R21 now attaches their submission and returns their existing number, so their link works correctly.** Expiring it would have broken something that the same day's fix had just repaired.

🔁 **BUT THE EXPIRY IS A TREADMILL, AND THE SOURCE IS NOW IDENTIFIED.** The count moved 37 → 39 in one hour, which is what prompted looking for a producer instead of assuming a fixed stock. **86 `wizard_resume` tokens were minted on 2026-08-05 alone**, none of them audited (`magic_link.issued` shows only `login` and `pending_nin_complete` — a genuine observability hole; this purpose mints silently).

**Root cause: `registration-status.service.ts:293`.** `/check-registration` issues a **`wizard_resume`** token to anyone who looks up their status by email. And R4's ruling made the adoption confirmation point people at `/check-registration` — so the 174 adopted people were told to go to the exact surface that hands them a link which dead-ends. The code comment already concedes it: *"It lands on the authenticated status home (9-40) when shipped; today it degrades gracefully to the wizard resume/summary surface."* It does not degrade gracefully for an adopted person; it degrades into a 409.

⚠️ **So this WILL come back.** Every adopted person who checks their status mints a fresh dead-end link. **The real fix is code: `/check-registration` must not issue `wizard_resume` to a respondent whose registration is already complete** — it should issue the status/login link 9-40 was meant to provide. Raised as **[[13-50]]** (see backlog). Re-run the expiry as a stopgap meanwhile; the query is in this row.

**REOPEN TRIGGER: any `NIN_DUPLICATE` in the audit log from an adopted person — currently 0.** Also worth watching: `wizard_resume` mints per day, now that we know nothing audits them. | dev (13-50) |
| **R6** — `--max` counts rows ACTED ON, spanning both loops | Low | **ACCEPTED — documented behaviour** | `--max 1` stops after the first write OR invite, whichever the loop order reaches first (writes run before invites), which is exactly what the AC10 gate wants. It is NOT a per-cohort cap; `--max 5` will not give you 5 of each. Stated in `--help` and here so the next operator does not discover it by surprise. | — |
| ~~**R7**~~ ✅ **CLOSED 2026-08-02 — workbook regenerated** | Medium | **CLOSED** | Rebuilt with the unified resolver AND the R8 fix: **140 `PUSH_TO_REGISTRY` / 24 `PUSH_PENDING_NIN` / 22 `BACKFILL_THE_63` / 70 `INVITE_TO_RESUME` / 2 `EXCLUDE_EMPTY` / 8 `EXCLUDE_CONSENT_NO` / 26 `ALREADY_REGISTERED`** = 292. D2/D5/D6 unchanged throughout, which is what makes this a relabelling and not a re-routing. ⚠️ Regeneration re-seeds `DECISION` from `RECOMMENDED`; a **pre-regeneration copy is preserved** at `…/scratchpad/draft-triage-BACKUP.xlsx` (92,365 bytes) in case the sheet had been hand-edited after 2026-08-01. Re-runnable: `pnpm --filter @oslsr/api draft:triage`. | dev |
| ~~**R8**~~ ✅ **CLOSED 2026-08-02 — resolved as a CLASS, not as 2 rows** | Medium | **CLOSED** | **Root cause: the recommender and the enforcer disagreed about what a NIN is.** `recommendDecision` used `has(nin)` (non-empty) while `buildAdoptionRawData` enforced `^\d{11}$`, so the workbook RECOMMENDED `PUSH_TO_REGISTRY` for a 4-character NIN and the pre-flight then REFUSED that exact row — **every regeneration re-seeding a decision guaranteed to abort the run, forever**, with the operator's only clue arriving at apply time. Fixed by moving `NIN_PATTERN` into `decisions.ts` (the module with no runtime imports) and routing on `hasUsableNin`. ⚠️ **A second guard had to move with it**: "D3 must not carry a NIN" now tests *usable*, not *present* — otherwise the recommender sends these rows to D3 and that guard refuses them, leaving the 2 people with **no executable disposition anywhere**. Evidence: simulated the pre-flight over all 292 real rows — **164 adopting rows recommended, 0 rejected**. Unit cover: `decisions.test.ts` "never recommends a decision the payload builder would refuse"; `payload.test.ts` "ALLOWS a D3 row whose NIN is malformed" + "still REFUSES a D3 row whose NIN is VALID". | dev |
| ~~**R9**~~ ✅ **CLOSED 2026-08-03 — EXECUTED LIVE ON PROD** | Medium | **CLOSED** | **Result: 10 promoted, not 9 — and `OSL-2026-RRCHDX` promoted cleanly rather than going to manual review.** Both the "9" and the RRCHDX carve-out below were wrong, and wrong for the same reason: they read `form_data->>'nin'` (the head step) instead of `questionnaireResponses.nin`. **The head step is an autosave snapshot taken mid-keystroke** — for RRCHDX it holds `1589857782`, the completed answer's first ten digits; the questionnaire holds the full eleven (`…820`). `resolveDraftIdentity` (payload.ts:128) reads questionnaire-first precisely for this, so nothing was padded, guessed, or dropped. Systematic, not a one-off: **14 drafts carry both values and in 12 the head string is a strict truncated prefix** of the questionnaire one; malformed-NIN count is **2 questionnaire-first vs 15 head-first**, so anyone auditing the head field will "find" 13 broken NINs that were never broken. **Evidence (re-runnable):** `--promote-nins --dry-run` → `0 promotable / 25 pending`; `respondents.status='nin_unavailable'` **35 → 25**; `metadata->>'nin_promoted_by'='13-49'` → 10 rows, all `active`, `promoted_but_bad_nin=0`, `duplicate_nins=0`; `from_adoption` correctly still **0** (a promotion is not an adoption). Clash guard verified **independently of the script** — all 10 NINs checked against `respondents` for another holder: 0. That check mattered: the dry-run's own `blocked: 0` was an UNEVALUATED zero, since the guard lives in the write path (§2a2). | ✅ done |
| ~~**R11**~~ ✅ **CLOSED 2026-08-03 — code fixed AND the prod row reconciled** | Medium | **CLOSED** | Fix deployed (`7c6bd3c`); the lost row was written by `pnpm --filter @oslsr/api audit:reconcile-promotions -- --apply` and the re-run reports **0 missing**, which is also the idempotence proof. AC14 invariant now **10 promotions / 10 with an audit row**. The row is marked `backfilled: true` with `original_event_at`, the cause and the fix in `details`. ⚠️ **Back-dating was never available:** `audit_logs` is hash-chained, `logActionTx` stamps `createdAt = now()` and links to the current tail, so a row bearing the original 12:36 stamp would break the chain. The real choice was a forward-dated entry that says what it is, or silence — a ledger corrects by adjunct entry, never by erasure. **Post-write integrity verified:** `audit:verify-chain` on prod → **0 self-hash failures across 1,706 rows** (see R12: the chain reports INVALID for an unrelated, pre-existing reason). Standing check: `prod-verify.yml` §5 hard-fails if any promotion lacks its row. | ✅ done |
| **R12** — `audit_logs` hash chain reports **INVALID** on prod, and has since 2026-04-04 | **Medium** | **WRITER FIXED 2026-08-03 (hotfix) · historical forks PERMANENT by design** | Discovered while checking the R11 backfill hadn't corrupted anything. `AuditService.verifyHashChain()` returns **INVALID** on prod (`verified: 52` of 1,706, first divergence `2026-04-04T11:13:26Z` — four months before this story). **It is NOT tampering.** Classified with `pnpm --filter @oslsr/api audit:verify-chain`: **0 self-hash failures, 117 link forks, 0 gaps** — every row matches `computeHash` of its own contents; only the *linear order* fails. **Root cause is the writer.** `logActionTx` reads the tail with `SELECT hash … ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`, but under READ COMMITTED that does not serialise two writers: the second blocks on the locked row, then re-reads *that same row* — the other's INSERT was never in its scan — so both compute the same `previous_hash` and the chain forks. `createdAt` is also stamped in JS **before** the transaction opens, so wall-clock order need not match commit order. **Why it matters:** the chain is cited as a control in `docs/security-posture-reassessment-2026-08-01.md`, and a control that reports INVALID in normal operation gets ignored — or alarms an auditor who is told "that's just the known one". **FIXED as a hotfix (Awwal's call), not deferred to a story:** all FOUR writers now take a chain-wide `pg_advisory_xact_lock(AUDIT_CHAIN_LOCK)` BEFORE reading the tail. Row-level `FOR UPDATE` never could do this — it locks the row it FOUND, so a blocked writer re-reads that same unchanged row and never sees the other's INSERT. The four call sites already CARRIED the comment "Lock the most recent record to serialize concurrent hash chain inserts": the intent was right and the mechanism never delivered it, which is why it survived review for months. RED-verified (remove the lock → the new test sees 1 execute instead of 2). Contention is a non-issue at ~1.7k rows since April, and the lock is transaction-scoped. ⚠️ **The chain will STILL report INVALID, and that is correct:** the 117 historical forks are permanent. Repairing them means recomputing stored hashes — exactly what the chain exists to make impossible. **So the boolean is no longer the control.** The usable control is `pnpm --filter @oslsr/api audit:verify-chain`, whose exit code keys on **SELF-HASH failures (0)** — the ordering-independent tamper signal — and which reports forks/gaps separately. ✅ **ENDPOINT CLOSED 2026-08-05.** `GET /audit-logs/verify-chain` now attaches a `classification` block whenever `valid` is false: `selfHashFailures` (the ordering-INDEPENDENT tamper signal), `linkForks`, `linkGaps`, and a plain-English `interpretation`. Prod reads **0 self-hash failures / 117 forks / 0 gaps** — nothing altered, and the forks are permanent because repairing them means recomputing stored hashes. So the endpoint will report `valid: false` FOREVER, and a bare boolean would tell an auditor the audit log is compromised. The classification is what makes that honest. `AuditService.classifyChainFailure()` is now the single implementation — `audit:verify-chain` was duplicating it and now calls the service. | ✅ done | **Found by counting, not by the script, which reported success for all 10:** the run wrote **10 promotions and 9 `pending_nin.promoted` audit rows**. The missing one is `OSL-2026-800KD8`, the LAST of the batch. Cause: `promote-nin.ts:171` called `AuditService.logAction`, which returns **`void`** — fire-and-forget by design, and a caller *cannot* await it. That is fine in a long-lived server (the process outlives the write) and wrong in a **script**: the nine that landed did so only because later iterations' `await`s yielded the event loop, and the tenth was still in flight at exit. **A batch job silently loses exactly one row per run, always the last — so the count looks nearly right and reads as a miscount.** Fixed by moving the write into the same transaction as the UPDATE via the awaitable `logActionTx`, which also makes it atomic: a failed audit now rolls the promotion back instead of leaving a promoted respondent with no trail. RED-verified (neutered to `void` → the new test resolves `promoted: true` instead of rejecting, reproducing prod exactly). ⚠️ **Scoped to AC14 only** — `adopt.ts` writes no audit directly, it delegates to the shared post-submission pipeline, so the D1–D6 run is unaffected. **Still OPEN:** the one lost row on prod. `audit_logs` is append-only and hash-chained, so it cannot be edited into place; the choice is a forward-dated backfill row marked as such, or leaving the gap documented here. **The promotion itself is fully evidenced regardless** — `metadata.nin_promoted_at/-_by/-_from_draft_id` wrote for all 10, and that marker (not the audit row) is AC11's rollback key. **Reopen trigger:** any future `--promote-nins` run where `count(audit pending_nin.promoted) <> count(metadata ? 'nin_promoted_by')`. | adjudicator (code) + Awwal (the prod row) |
| ~~**R9-original**~~ superseded by the R9 row above | **Medium** | **was: OPEN — BLOCKED ON DEPLOY, not on Resend** | AC14 is implemented, tested (21 tests, incl. the documented 10 driven through the classifier) and previews cleanly, but **cannot be executed from here: no 13-49 source is on `origin/main`** (only the story file), SSH to the VPS times out, and the sole prod path — `prod-verify.yml` — is read-only by construction (`default_transaction_read_only=on`). So the sequence is **commit → push → CI deploy → run on the box**. Unlike R1 it is **NOT gated on Resend Pro** (AC14 sends nothing), so it can be discharged the moment the code lands, and it is the cheapest 9 conversions available. Runbook: `pnpm --filter @oslsr/api draft:adopt -- --promote-nins` (preview; expect `9 promotable`, `1 MANUAL REVIEW`), then `--promote-nins --apply --confirm-i-am-not-dry-running --max 1` on one row, verify, then the rest. Evidence when done: `SELECT count(*) FROM respondents WHERE status='nin_unavailable'` falls **35 → 26**; rollback handle `metadata->>'nin_promoted_by' = '13-49'`. ⚠️ `OSL-2026-RRCHDX` will NOT auto-promote **by design** — confirm `01589857782` with the person first. | Awwal + dev |
| **R13** — ADOPTING A LIVE COHORT RACES THE PEOPLE IN IT (the duplicate incident) | **High** | **CLOSED for the 7 affected · the CLASS is mitigated, not eliminated** | **7 people ended up with two records and two numbers.** Mechanism: `findOrCreateRespondent` dedupes on the **INCOMING** submission's NIN (`submission-processing.service.ts:454` — with no NIN "the dedup checks are skipped"), so a self-registration taken through the no-NIN path matches NOTHING, no matter what we already hold. **Rate: 5 of 21 D3 adoptees (24%) vs 2 of 139 D1 (1.4%)** — the D3 copy is why (see R14). Two shapes: theirs more complete (5 cases → kept theirs, deleted ours) and ours more complete (2 cases, `HB95YE`/`1MWWXX` — we held their NIN, their self-registration was pending → kept ours). Awwal ruled per case: keep whichever record serves the person, delete the other child-first, and write to them ONLY because the number changed. All 7 mailed via `adoption:number-correction` (idempotent, send-once marker). Close state: **0 programme duplicates, 0 duplicate NINs.** ⚠️ **The class is not closed:** nothing stops the next no-NIN self-registration from duplicating an existing record. A `pending_nin_capture` person registering again is indistinguishable from a new one by NIN alone. Fix direction (needs a story): ✅ **CLASS CLOSED 2026-08-04.** `findOrCreateRespondent` now runs an identity match when the incoming submission has NO NIN: strict equality on `lower(first_name) + lower(last_name) + phone_number`, all three required, `rolled_back` excluded — the SAME key `tryRaceResolutionMerge` already uses for the opposite direction (NIN arrives later), reused rather than invented. A match ATTACHES the submission to the existing record; it does not reject and does not overwrite, because an incoming row with no NIN has nothing to add and clobbering an `active` record with pending-shaped data is worse than a duplicate. A missing field falls through to a fresh insert — the documented trade, *better one duplicate than a wrong-person merge*. RED-verified; the old test asserted `db.execute` was NEVER called without a NIN, i.e. it pinned the gap. | ✅ done |
| **R14** — the D3 confirmation told people something false and invited the harmful action | **High** | ✅ **FIXED 2026-08-04 (`5c9541e`)** | D1 and D3 received IDENTICAL copy: *"there is nothing you need to do. Your record is active"* + *"Review or update my details — add what is missing"*. For a `pending_nin_capture` person the first is **FALSE** and the second is an invitation to supply the NIN — which starts a fresh registration and, per R13, cannot be deduped. **The email told them their record was fine, then pointed at the one action that would duplicate them.** 24% acted on it. The pending-NIN variant states what is true, names the NIN as outstanding, says plainly *you do NOT need to register again*, and removes **every** route back into a form including the check-registration link — for someone with no NIN to dedupe against, any route to a form is a route to a second record. `pendingNin` was already known in the runner and spent on a log line; threading it 3 layers was the whole fix. 5 tests, RED-verified; one asserts the D1 copy is UNCHANGED. | ✅ done |
| **R15** — the triage sheet drifts against a LIVE table, per run | Medium | **ACCEPTED — operational, documented** | `reconcileDraftIds` demands a **bijection** with `wizard_drafts`, and that table moves continuously: completing a registration deletes the draft, and new drafts appear. Over one session it went **292 → 286**, aborting runs three times. Reconcile is therefore a **per-run step**, not a one-off: drop rows whose draft is gone, and add post-snapshot drafts as `ALREADY_REGISTERED` — the ONLY inert decision (`INVITE_TO_RESUME` and `EXCLUDE_EMPTY` share the CONTACT cohort, so either would have mailed 200+ people). ⚠️ Do **not** fix this by regenerating the workbook: regeneration re-seeds `DECISION` from `RECOMMENDED` and reintroduces the 6 consent mis-marks patched below. | operator |
| **R16** — 6 sheet rows were marked adoptable that the live drafts refuse | Medium | ✅ **CLOSED — patched in the sheet** | The pre-flight refused 6 `BACKFILL_THE_63` rows: 4 with blank consent **and zero questionnaire answers**, 2 with explicit `no`. The sheet carried 8 `EXCLUDE_CONSENT_NO` against 10 actual. **This is R8's class on a new axis** — the recommender proposing rows the enforcer always refuses — and note R8 closed claiming *"164 adopting rows recommended, 0 rejected"*: that simulation read the SHEET's consent column while the enforcer reads the **live draft**. Verified the worse case could not happen: all 203 consented drafts have a name and a NIN, none has zero answers. D2 went 22 → 16. ⚠️ Patched in the sheet, **not** the recommender — regeneration reintroduces all 6. | dev |
| **R17** — the duplicate bleed CONTINUED after the first fix, and exact-name matching caught none of it | **High** | ✅ **CLOSED 2026-08-04 (`8fed472`)** | Four MORE collisions formed within hours of R13 shipping. **R13's exact `first_name`+`last_name` equality would have caught ZERO of them**, because people do not re-enter a name the way a form stored it: `Muheebat Yusuf`→`Yusuf Muheebat Yetunde`, `Monsurat Akadiri`→`Akadiri Monsurat Omolade`, `Mukaheel Ajibola`→`AJIBOLA MUKAHEEL BABATUNDE`, `Omowumi Michael`→`Omowumi Ayomide Michael`. Surname-first is a normal Nigerian convention; middle names come and go. **I claimed R13 "closes the class" — it closed the exact-repeat case only.** Now: same phone + **≥2 shared name tokens, any order**. Two not one, because one is unsafe on a shared handset (a parent and child share a phone and a surname, and merging two people is far worse than a duplicate). **Verified read-only on live prod, which is where the threshold came from: all 4 collisions → 2 tokens, caught; ALL 14 duplicate-phone pairs in the registry → ≥2 tokens; distinct people sharing a phone → ZERO.** It would have prevented every duplicate the registry has ever had, including the 9 predating this programme. ⚠️ A mocked `db.execute` cannot evaluate token-set SQL — the unit test pins the query SHAPE only, and the live check is the real verification. | ✅ done |
| **R18** — 7 collisions resolved; one had CONFLICTING NINs that no dedupe could see | Medium | ✅ **CLOSED — per-case, by Awwal** | Final tally **7 duplicate pairs**, resolved by which record serves the PERSON: 4 kept theirs (self-created, equal or fuller), 3 kept ours (theirs was pending-NIN while ours held their NIN). `CB7E9Y`/`3XQ32H` was different in kind — **same email, same DOB, two NINs differing by ONE digit at position 3**. `duplicate_nins = 0` was technically true throughout, so no integrity check could ever have flagged it. Format-only validation means the system cannot decide which is right; Awwal ruled keep theirs and ASK the holder. New reusable tool: `pnpm --filter @oslsr/api nin:reconfirm` — clears the untrusted NIN (preserving it in metadata), demotes to `pending_nin_capture` so the TESTED `complete-nin` flow can serve them, issues a `pending_nin_complete` magic link. **A wrong NIN is worse than a missing one: it is a well-formed 11-digit number that may be another citizen's real NIN.** | ✅ done |
| **R19** — `pending_nin_capture` and `nin_unavailable` are NOT the same thing | Low | **ACCEPTED — do NOT merge** | Proposed merging the two no-NIN states (24 + 25) since they look identical to a citizen. **Measured first: they are lifecycle stages.** `nin_unavailable` is written by `reminder.worker.ts:201` — the ladder itself, once 2d/7d/14d are exhausted. Merging would **restart reminders for 25 people we deliberately stopped emailing**. Keep both. The real risk is the one the merge idea was reaching for: any *"who owes us a NIN"* query must cover BOTH, or it silently misses half the cohort. That is query discipline, not a schema change. | operator |
| **R20** — the R13/R17 identity guard reaches the ENUMERATOR path, tuned on the wrong data | **Medium** | ✅ **HANDED TO STORY 13-4 (AC1b) 2026-08-05 — terminal here, live there** · ⚠️ **R21 RAISED THE STAKES:** the guard now also runs on the PUBLIC wizard and is PROVEN to attach (see R21), so the ≥2-token threshold is no longer theoretical on any path. 13-4 AC1b's shared-phone household case must assert TWO rows | `findOrCreateRespondent` is shared by public, enumerator and clerk (`ROLE_TO_SOURCE` maps the role; the dedupe does not branch), so the guard added here is already live in the field path. **Its ≥2-token threshold was validated against a registry that is almost entirely SELF registration — one person, one handset — and measured zero distinct people sharing a phone. Field enumeration inverts that:** an enumerator registers a whole household on one phone, and a mother `Fatima Bello` vs daughter `Fatima Aisha Bello` share a phone and two tokens. The guard would ATTACH the daughter to the mother — two citizens merged into one, failing SILENTLY (no error, no duplicate, just a household with fewer records than people). Handed to **13-4 AC1b**: the prod smoke MUST include a shared-phone household and assert TWO respondent rows. Recommended remedy if it merges: exempt when `submitterId` is present — an enumerator is physically with the person and has better evidence than a string comparison; the guard exists to catch someone re-registering THEMSELVES. | 13-4 |
| ~~**R21**~~ ✅ **THE R13 GUARD NEVER RAN ON THE PUBLIC WIZARD, THE PATH IT WAS BUILT FOR** | **High** | ✅ **CLOSED 2026-08-05 — FIXED AND DEPLOYED (`b98fab7`)** | R13/R17 put the identity match in `findOrCreateRespondent`. **The public wizard does not call it.** `registration.controller.ts:757` inserts into `respondents` DIRECTLY, and :937 states outright that it writes `processed: true` and **BYPASSES `SubmissionProcessingService.processSubmission`**. So the guard covers enumerator / clerk / adoption ingestion and **not** self-registration — the only path that produced any of the 7 duplicates. **Proof it never fired:** `OSL-2026-Q09HFP` (2026-08-05 14:02, `pending_nin_capture`, no NIN) vs `OSL-2026-MGKS01` (05-19, active, has NIN) — same phone `+2348164048995`, **3 shared name tokens** (`Segun Adewale Akingbade` vs `Akingbade Segun Adewale`), and a new record was created anyway. Audit shows `no_nin_identity_match` attaches = **0**, ever. **I read that zero as 'nothing needed attaching' when it meant 'the code never executed' — §2p and §2t, committed by the person who wrote them.** Fix: extract the identity check into ONE shared function and call it from the wizard's `completeRegistration` before its direct insert (canonical-primitive, same move as Pitfall #48), OR route the wizard through the ingestion pipeline — but that is 9-26 territory and riskier. **FIX AS SHIPPED:** the check was extracted to `apps/api/src/services/respondent-identity.ts` (`findRespondentByIdentity`) — one implementation, called by BOTH `submission-processing.service.ts` and, now, the wizard's direct-insert path in `registration.controller.ts`. It is **fail-open** inside a try/catch: an identity-lookup error must never turn a citizen away from registration, so a failure logs and proceeds to create the record. On a match, the transaction returns `attachedToExisting` and the API responds with the EXISTING `referenceCode` — the person gets their original number back, not a second one.

✅ **VERIFIED LIVE ON PROD 2026-08-05 17:07–17:10 WAT — the guard FIRED.** Closed on an observed attach, not on a deploy. Awwal ran a two-pass synthetic registration (`Ztest Adjudication / Probe` → re-registered surname-first as `Probe Ztest / Adjudication`, same phone `+2348000000123`, **different** email, no NIN either time, **two different browsers**). Three independent observables, all agreeing:

1. **On screen** — both runs returned `OSL-2026-24FGF8`. The probe got the seed's number back.
2. **In the DB** — exactly ONE `respondents` row on the test phone, carrying TWO submissions (`+r21a` 17:07:04, `+r21b` 17:10:06).
3. **In the log** — `registration.attached_to_existing_identity … referenceCode: OSL-2026-24FGF8, existingStatus: pending_nin_capture`. **This is the one that closes R21**, because it proves the code EXECUTED; the other two only prove the outcome looked right, and R21 exists because an outcome that looks right is exactly what a non-running guard produces (§2t).

Design note worth keeping: the probe used a **different email** deliberately. With a shared email an attach could have come from the draft/email path, and the observation would not have been attributable to the guard. Different email ⇒ phone + name tokens were the ONLY link ⇒ the attach can only be R21. Surname-first reordering also proved the TOKEN match, not merely the phone match, in the same run.

**Teardown complete** — child-first per 13-4 AC1c: `magic_link_tokens` 2 · `submissions` 2 · `respondents` 1 · `users` 2 (the wizard mints a user per email — not in the AC1c recipe; **added there**). Register verified back to **307**, 0 orphans, 0 dup NINs. `audit_logs` deliberately NOT deleted: it is hash-chained, and the 7 rows are a legitimate record of a test that happened. | adjudicator |

| **R22** — the attach path audits a CREATION that did not happen | **Low** | ✅ **FIXED 2026-08-05, same session it was found** | Found BY the R21 live verification, in the R21 fix itself: on an attach the controller still emitted `pending_nin.created` for a respondent created on 19 May, and nothing in `details` contradicted the action name. **Checked before rating it:** the pending-NIN reminder ladder reads `respondents` (`reminder.worker.ts:261`), **not** audit rows — so nobody gets two reminders, and no live consumer double-counts today. It is Low because of that, not because it is harmless: **13-44 is the story that builds audit-derived campaign counts**, and R21 attaches now occur for real, so the first metric to read this table would book a phantom registration. Fix: `details.attachedToExisting` + `existingReferenceCode`. Deliberately NOT a new action key — inventing taxonomy against zero consumers is how [[feedback_audit_target_unification]]'s drift started; 13-44 owns that call when it has a query to satisfy. | adjudicator |
| **R10** — the 2 malformed-NIN people are adopted-pending, NOT invited | Low | ✅ **ACCEPTED 2026-08-05 — adopted into D3; the override was offered and not taken** · REOPEN TRIGGER: flip the two `DECISION` cells to `INVITE_TO_RESUME` if Awwal prefers re-registration; the draft ids are in this row | Awwal's instruction was "invite them to come and register again"; the implementation adopts them into D3 instead, because measuring both drafts changed the picture: **each has name + phone + LGA + `consent_basic = yes` + 10–11 answers, reached step 3/4, and matches no existing respondent.** They are complete apart from one broken field. D3 gives them an OSLRS number today and hands the one bad field to the 9-12 ladder, whose **measured conversion is 69%** and whose entire job is "we have you, we need your NIN". An invitation instead asks them to redo the whole form, discards 10+ answers, and lands them on an EMPTY one (R2: identity does not prefill on resume). **To override**: set `DECISION` to `INVITE_TO_RESUME` on drafts `019e2678-f6ea-7607-a3d0-b0aff2cd6fa8` (NIN `291992`, AKEEM KAREEM) and `019e414a-04f4-7994-9dca-63c8a73e759f` (NIN `7474`, monsurat akadiri) — the sheet is the instruction (AC2) and the code obeys it either way. | Awwal |

## Adjudication (Claude, 2026-08-03) — third independent layer

**Verified, not inherited:** api `tsc --noEmit` + `eslint src scripts` clean · **162 tests pass across 7
files** · the 6 `draft-adoption/` service modules, both scripts and all 7 test files read.

**RED-verified BOTH consent guards myself** (the story's R3 claimed execution-evidence for one; I neutered
each independently):

| Guard neutered | Result |
|---|---|
| `assertNotConsentRefused` (invite side, added by the review) | **2 tests fail** |
| `assertConsentActionable` (adopt side) | **6 tests fail** |

Restored by hand, `grep -rn RED-VERIFY apps/` clean, 72/72 green after. The asymmetry is deliberate and
**pinned by a test whose name states it** — *"is strictly weaker than the adoption guard — blank passes here
and fails there"*: adopting requires an explicit `yes`, inviting blocks only an explicit `no`. That is
exactly AC7, and it is the right shape — blank consent is not consent for a WRITE, but a person who never
reached the consent step has not refused CONTACT.

**The review's own best catch, endorsed:** the consent guard originally lived only at the two WRITE
call-sites, so re-marking one of the 8 `consent_basic = no` drafts as `INVITE_TO_RESUME` would have MAILED
them (`_draft-adoption-programme.ts:562`). That is AC7's contact half, and it was a real hole.

**R4 (magic-link → `/check-registration`) — I endorse the divergence.** The 9-61 edit surface needs an
account; an adopted draft is pre-account by construction and `AuthService` magic-login 401s on a missing
user. Minting a NEW public authentication surface for ~186 people to buy a convenience is a bad trade, and
`/check-registration` already exists and already issues its own secure link to the address on file. Leaving
AC9's wording unedited so the divergence stays VISIBLE rather than tidied away is the right instinct.

### AJ-1 [Low] — adopted people have NO user account, so the in-profile consent toggle is unavailable to them

`adopt.ts` never touches `users` (no `createUser`/`user_id` anywhere). So an adopted respondent cannot log
in, and therefore cannot use `me.controller.ts:45-67`'s `consentMarketplace` PATCH — the self-service
affordance this programme's messaging leans on.

**Why this is LOW and not a blocker — measured, not assumed:** it is EXACTLY the Story 9-28 precedent —
**0 of the 63 absorbed respondents have a user account, and 0 have a `marketplace_profile`**. Adopted people
are therefore not marketplace-exposed by adoption; exposure runs through the canonical consent-gated
extraction. And consent WITHDRAWAL remains possible via the unsubscribe link (13-13) and
`support@oyoskills.com`, which is what NDPA actually requires.

**Recommended (not blocking):** say the route explicitly in the adopted-message copy — *"to change what we
show or stop hearing from us, use the link at the bottom of this email or contact support"* — rather than
implying a profile they cannot reach. A one-line copy change, and it is the honest version.

## File List

**New**
- `apps/api/src/services/draft-adoption/decisions.ts` — the shared DECISION vocabulary + recommendation rules
- `apps/api/src/services/draft-adoption/sheet.ts` — fail-closed workbook reader + draft-id reconciliation
- `apps/api/src/services/draft-adoption/payload.ts` — consent guard + draft → `raw_data` builder
- `apps/api/src/services/draft-adoption/adopt.ts` — D1/D3 adopt + D2 enrich executors
- `apps/api/src/services/draft-adoption/messages.ts` — adoption confirmation + D4 invitation copy
- `apps/api/src/services/draft-adoption/send.ts` — AC9 message set (type-checked categories, suppression)
- `apps/api/src/services/draft-adoption/promote-nin.ts` — **AC14** (code review): the free NIN promotions
- `apps/api/scripts/_draft-adoption-programme.ts` — the operator CLI (`draft:adopt`)
- `apps/api/src/services/__tests__/draft-adoption.decisions.test.ts` (23 tests)
- `apps/api/src/services/__tests__/draft-adoption.sheet.test.ts` (14 tests)
- `apps/api/src/services/__tests__/draft-adoption.payload.test.ts` (45 tests)
- `apps/api/src/services/__tests__/draft-adoption.adopt.test.ts` (27 tests)
- `apps/api/src/services/__tests__/draft-adoption.messages.test.ts` (17 tests)
- `apps/api/src/services/__tests__/draft-adoption.promote-nin.test.ts` (16 tests — **AC14**, code review)
- `apps/api/scripts/__tests__/_draft-adoption-programme.test.ts` (20 tests)

**Total for this story: 162 tests** (103 at dev-story close → 145 after the review → 162 after the
R7/R8/AC14 actions). Counted per file with `pnpm vitest run <file>`, not estimated.

**Modified**
- `apps/api/scripts/build-draft-triage-workbook.ts` — re-pointed at the shared vocabulary;
  `PUSH_PENDING_NIN` added; **(code review) identity now derived from the shared
  `resolveDraftIdentity` rather than a second, `fullName`-blind reader**
- `apps/api/src/db/schema/respondents.ts` — `RespondentMetadata` gains the AC11 adoption markers
- `apps/api/package.json` — `draft:adopt` script
- `_bmad-output/implementation-artifacts/13-49-draft-adoption-programme-d1-d6.md` — AC5 amended, tasks authored, this record
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `ready-for-dev` → `review`

**Regenerated (gitignored, PII)**
- `docs/vps-snapshots/draft-triage-2026-08-01.xlsx` — 7-value dropdown; 27 `INVITE_TO_RESUME` split into 20 `PUSH_PENDING_NIN` + 7. `DECISION` was byte-identical to `RECOMMENDED` on all 292 rows beforehand, so no operator review was lost.
- **Regenerated AGAIN 2026-08-02 (code review)** with the unified resolver → 142 / 22 / 22 / 70 / 2 / 8 / 26.
  D1, D2, D5 and D6 are unchanged; 65 rows relabel inside D4 and 2 move D4 → D3.
  ⚠️ **A pre-regeneration copy was taken first and is NOT deleted**, in case the sheet carried
  operator edits made after 2026-08-01: `…/scratchpad/draft-triage-BACKUP.xlsx` (92,365 bytes).
  Restore it, or re-run `pnpm --filter @oslsr/api draft:triage`, before the live apply.

## Closing verdict

<!-- ⚠️ REWRITTEN 2026-08-02 after the adversarial code review. The previous text claimed
     "Every code AC is implemented and gated" while AC14 had no implementation at all. That
     sentence is the thing to be suspicious of in future close-outs: it was a summary of
     intent, not a check of the tree. -->

**NOT CLOSED — `review`, and it must stay there.** Every code AC is now implemented and gated —
including **AC14, which the review found had shipped in nothing** — with tsc clean, eslint clean,
the 13-37 drift guard over 354 files, the full API suite at **3505 passing / 0 failing**, and
**162 tests** for this story. The AC2/R3 fail-closed behaviour, the new AC7 contact guard, the
`--dry-run`/`--apply` contradiction and the recommender/enforcer agreement (164 adopting rows, 0
rejected, over all 292 real drafts) are all verified **by execution rather than by argument**.

**Open, and each one blocks something different:**
- **R1** — the single-record LIVE apply. Gated on Resend Pro (unpaid). Blocks `done`.
- ~~**R9**~~ ✅ **CLOSED 2026-08-03 — executed on prod: 10 promoted (not 9), `nin_unavailable` 35 → 25.**
- **R12** — the audit hash chain reads INVALID on prod (since 2026-04-04). **Not tampering**
  (0 self-hash failures in 1,706 rows); 117 concurrency forks. Writer fixed 2026-08-03 with a
  chain-wide advisory lock; the historical forks are permanent by design.
- **R10** — the 2 malformed-NIN people are adopted-pending rather than invited; a one-cell
  override if Awwal prefers the invitation.
- **R4 / R5** — open by decision, unchanged.
- ✅ **R7 and R8 CLOSED 2026-08-02** — workbook regenerated (140/24/22/70/2/8/26); the
  recommender/enforcer disagreement fixed as a class and verified over all 292 real rows.

**One measurement is worth more than the rest of this block:** simulating the pre-flight across
all 292 rows returns **164 adopting rows, 0 rejected**. Before the R8 fix, 2 rows would have
aborted the entire batch — and they would have done so *every time the workbook was regenerated*,
because the recommender kept re-seeding the decision the enforcer refuses.

**Deploy SHA: ⏳ PENDING.** Nothing is deployed and nothing should be: this story's value is
realised by an operator RUNNING it, not by shipping it. Per the D9 rule written into this
block — *until R1 carries a real result, `Status:` must not read `done`*.

**RED-verify evidence:** every module was written test-first and observed failing before
implementation (module-not-found on 6 files, then the specific assertions). The three bugs that
mattered were found by running the script, not by the tests — recorded in the Dev Agent Record.
The review added a fourth of the same kind: `eslint` caught a backtick that terminated the
`HELP_TEXT` template literal, which `tsc` cannot see because `scripts/` is outside tsconfig.

**File-List reconciliation:** `git status` shows exactly the 8 new source files, 7 new test
files and 5 modified files listed above, and no others. Fixture drafts were created and torn
down **by id** within the session; `git status` is clean of them.

## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-08-04 | **THE PROGRAMME RAN END TO END — registry 145 → 309 (174 adopted/enriched). R1 CLOSED.** D2 16 · D3 19 · D1 139, each cohort gated on a single record first. **The cost was 7 duplicate citizen records (R13)**, because dedupe fires on the INCOMING submission's NIN and a no-NIN self-registration matches nothing: 24% of D3 adoptees registered again within 90 minutes, prompted by copy that told them their pending record was *active* and invited them to *add what is missing* (**R14**, fixed). All 7 resolved per Awwal's per-case ruling and mailed. **Two guards were built mid-run and both fired on live data**: the D2 enrichment guard, and an adoption guard added after realising the first fixed the cohort in front of me rather than the class — D3 had NO protection and a re-run would have minted a second record with a second number (it later skipped 18 rows in one run). Also: `--only` cohort filter (the ramp could not be sequenced without it, and hand-doctoring sheets was one wrong cell away from mailing 200 people); `pool: 'forks'` on Windows after `VITEST_MAX_THREADS` was proven never to have been the segfault fix (6 failed pushes); brace-expansion + postcss/ip-address/socket.io-parser OSV blocks; the sheet reconciled 3× against a moving table (**R15**); 6 consent mis-marks caught by the pre-flight (**R16**). **Every one of these appeared only on live execution — the dry-run passed all of them.** | Claude (adjudication) |
| 2026-08-03 | **AC14 EXECUTED on prod — 10 promoted, not 9; `nin_unavailable` 35 → 25. R9 CLOSED.** The 2026-08-02 "arithmetic correction" (35 → 26, "only 9 clear without a human") was itself wrong and is reverted: it read `form_data->>'nin'` (the head step) rather than `questionnaireResponses.nin`. The head step is an AUTOSAVE SNAPSHOT taken mid-keystroke — `OSL-2026-RRCHDX`'s `1589857782` is the first ten digits of an eleven-digit answer, and it promoted cleanly. **Systematic: 14 drafts carry both values, in 12 the head string is a strict truncated prefix, and malformed-NIN counts are 2 questionnaire-first vs 15 head-first — i.e. reading the head field first invents exactly 13 broken NINs that were never broken, 0 missed the other way.** Two defects found by VERIFYING rather than by testing: the dry-run's `blocked: 0` was an UNEVALUATED zero (the clash guard lives in the write path — all 10 NINs re-checked independently), and **10 promotions wrote only 9 audit rows** because `AuditService.logAction` returns `void` and cannot be awaited, so the LAST row of any batch dies with the process (**R11**, fixed via `logActionTx` inside the promotion transaction + reconciled on prod). **R12 opened**: verifying that backfill showed the hash chain has read INVALID since 2026-04-04 — 0 self-hash failures, 117 concurrency forks — because `FOR UPDATE` on the tail row cannot serialise appends. Fixed with a chain-wide `pg_advisory_xact_lock` across all four writers; historical forks stay (repairing them would mean recomputing hashes). | Claude (adjudication) |
| 2026-08-02 | **Post-review actions (Awwal: run AC14, regenerate the workbook, handle the 2 malformed-NIN drafts).** **R7 CLOSED** — workbook regenerated: `140 / 24 / 22 / 70 / 2 / 8 / 26` (= 292; D2/D5/D6 unchanged). **R8 CLOSED as a CLASS** — the root cause was that `recommendDecision` used `has(nin)` while `buildAdoptionRawData` enforced `^\d{11}$`, so the workbook kept RECOMMENDING a decision the pre-flight REFUSES, on every regeneration, forever. `NIN_PATTERN` moved to `decisions.ts` (no runtime imports → no cycle) and both now route on `hasUsableNin`; a second guard moved with it (D3's "must not carry a NIN" tests *usable*, not *present*) or the 2 rows would have had no executable disposition anywhere. Verified over all 292 real rows: **164 adopting, 0 rejected**. The malformed value is preserved as `_rejected_nin` rather than silently deleted — it is an answer the person gave. **R10 opened**: those 2 are adopted-pending rather than invited (both are complete apart from the NIN; the 9-12 ladder converts at a measured 69%, an invitation restarts them on an empty form) — one-cell override documented. **AC14 implemented + verified against its own documented 10** (9 promote, 1 manual = `OSL-2026-RRCHDX`), and its arithmetic corrected: the 35 becomes **26**, not 25, because only 9 clear without a human. **R9 could NOT be executed** — no 13-49 source is on `origin/main`, VPS SSH times out, `prod-verify.yml` is read-only; it needs a deploy, not Resend. Suite **3505 passing**; this story **145 → 162 tests**. | Claude (code-review) |
| 2026-08-02 | **Adversarial code review — 11 findings (3 High, 5 Medium, 3 Low), ALL FIXED in the same pass** (Awwal: "create action items and fix them all automatically"). Ledger under Tasks/Subtasks → "Review Follow-ups (AI)". Headlines: **AC7's consent guard never covered the CONTACT path**, so the D4 invite loop mailed 74 people without reading `consent_basic` — R3's hazard one cohort over; **AC14 had shipped in nothing** while the Closing verdict claimed every AC was implemented — now `promote-nin.ts` + 16 tests; **"adopted but never told" was a silent branch** with no counter and no log. Also: `--dry-run` was parsed and read by nothing (the triple `--dry-run --apply --confirm…` WROTE AND SENT, and the test that looked like it covered this passed for the wrong reason); the dry-run gate skipped all 22 D2 rows; D2 received no message at all; the D4 link dies in 72h while the copy implied months; NIN shape was never validated (2 of 190 drafts carry a 4- and a 6-char value); and the two identity resolvers still disagreed — **AC6's "67 have no name at all" was measurably false** (`fd.fullName` is in 286/292). Cohorts re-measured: **D3 20 → 22, D4 74 → 72**; D1/D2/D5/D6 unchanged. R7/R8/R9 opened. Suite 3488 passing; this story 103 → **145 tests**. | Claude (code-review) |
| 2026-08-02 | **Dev-story executed.** Tasks 1–10 implemented; 103 tests added; story → `review`. AC5 AMENDED on Awwal's ruling (`nin_unavailable` → `pending_nin_capture` — the original text's two clauses contradicted `reminder.worker.ts`). `PUSH_PENDING_NIN` added to the triage vocabulary so D3's 20 rows are operator-decidable rather than script-inferred (AC2). AC9's amend link ships as the `/check-registration` self-service pointer — the literal magic-link reading cannot work against an account-less cohort (R4 records the divergence). R3 CLOSED by execution. R4/R5/R6 opened. **R1's live leg remains OPEN and blocks `done`.** | Claude (dev-story) |
| 2026-08-01 | Story created. Emergent from 13-46 AC11. Implements Awwal's ruling (adopt + inform, over invite-to-resume) on the Story 9-28 precedent. Cohort counts are post-correction: the first triage matched drafts to people by NIN alone and resolved 28; all four contact sources resolve 48, moving 20 rows and preventing 10 duplicate registry records. | Claude (adjudication) |

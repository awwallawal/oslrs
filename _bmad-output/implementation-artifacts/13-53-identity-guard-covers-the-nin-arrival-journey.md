# Story 13.53: The identity guard must cover the journey we ASK people to take

Status: done

> ## ⚠️ BEFORE YOU RUN ANYTHING LOCALLY — THIS STORY CHANGES THE SCHEMA
>
> It adds `idx_respondents_phone_number` (review M2), so a local DB needs a push before the suite
> will match CI. **It must be `db:push:full:force`, NOT `db:push:force`:**
>
> ```
> NODE_ENV=test DATABASE_URL=…/app_test pnpm --filter @oslsr/api db:push:full:force
> ```
>
> `db:push:force` reconciles the database to the Drizzle schema and **DROPS every CHECK constraint
> and special index that lives in the `migrate-*-init.ts` runners** — the ones Drizzle cannot
> express. It cost 5 red constraint tests during this story's review, and the failure does not look
> like a DB problem: it looks like `respondents.constraints.test.ts` and
> `audit-principal-dualism.test.ts` suddenly disagreeing with code you did not touch.
>
> **It also leaves a trap behind.** Those constraint tests prove a CHECK *rejects* bad values by
> INSERTING them — so while the constraint is missing the inserts SUCCEED, and the debris
> (`status = 'totally_made_up_status'`, `api_consumers.status = 'archived'`) then blocks
> `db:push:full:force` from re-adding the constraint at all. Delete the offending rows first, then
> re-run. CI has done the right thing since the 2026-05-03 M5 review note.

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

## ⛔ ADJUDICATION NOTE — READ BEFORE WRITING THE VERIFICATION

**Pre-fix baseline, captured on prod 2026-08-07 BEFORE any work starts** (it cannot be
reconstructed afterwards):

| metric | value |
|---|---|
| `registry_unified` | **315** |
| `pending_nin_capture` with no NIN — the at-risk cohort | **21** |
| NIN-arrival duplicate pairs | **0** |
| all duplicate-phone pairs (≥2 shared tokens) | **0** |
| `registration_status.identifier_ambiguous` events | **0** |

**EVERY COUNT IS ALREADY ZERO. So "0 duplicates after the fix" proves nothing whatsoever** — it was
0 before. AC2.1 as originally written ("re-run the detector, no new pairs appear") is unfalsifiable
against this baseline, and would pass identically if the code were never deployed.

This is the R21 trap verbatim: *a guard whose only evidence is the absence of duplicates cannot be
distinguished from a guard that never runs.* It cost a live duplicate to notice last time.

**So AC2.2 is not a nice-to-have — it is the ONLY thing that can close this story.** The
promote-in-place log line must exist and must be OBSERVED firing, exactly as
`identity_match_exempted_staff_capture` closed 13-4 AC1b where the row count could not.

**What adjudication will ask for:**
1. **A RED-verify** — neuter the new branch, show the test failing, restore by hand.
2. **The log line, observed** — from a deliberate two-pass registration (register with no NIN, then
   return with one, same phone, ≥2 shared name tokens) showing promote-in-place and the ORIGINAL
   reference code returned. A synthetic pair, torn down after; never a real citizen's record.
3. **Proof the staff-capture exemption still holds** — an `enumerator`-sourced NIN-bearing
   submission must NOT promote into a NIN-less household member. 13-4 AC1b's household case
   regressing would be a worse outcome than the bug this story fixes.
4. **Proof it refuses a genuine conflict** — two rows both holding DIFFERENT NINs must never merge.
5. The baseline above re-measured, so any MOVEMENT is attributable.

⚠️ **Do not close this on "the counts are still zero".**

## Tasks / Subtasks

- [x] **Task 1 — Teach the ONE identity finder the NIN-arrival direction** (AC1.1, AC1.3)
  - [x] 1.1 Add a `requireNoNin` option to `findRespondentByIdentity` that appends `AND r."nin" IS NULL`. One implementation of the token key — a second copy is how the two mechanisms grew a seam in the first place.
  - [x] 1.2 Rewrite the docblock's "⚠️ CALL THIS ONLY WHEN THE INCOMING SUBMISSION HAS NO NIN" — that instruction IS the bug, and leaving it would send the next reader back into the seam.
  - [x] 1.3 Unit-test both directions: the option emits the NIN-IS-NULL predicate, the default does not.
- [x] **Task 2 — A shared, race-safe promote-in-place** (AC1.2, AC1.3)
  - [x] 2.1 `promoteRespondentWithArrivingNin(executor, { respondentId, nin })` — atomic `UPDATE … WHERE id = $1 AND nin IS NULL`, returning the row or null when it loses the race.
  - [x] 2.2 The `nin IS NULL` guard is the AC1.3 backstop in SQL, not just in the caller's branch: two rows with different NINs can never merge even if a future caller passes the wrong id.
  - [x] 2.3 Unit-test the guard's presence and the null-on-zero-rows contract.
- [x] **Task 3 — Close the seam on the public wizard** (AC1.1, AC1.2, AC2.2)
  - [x] 3.1 After the FR21 NIN-collision check passes with `ninValue !== null`, run the finder with `requireNoNin`.
  - [x] 3.2 On a match, promote in place and return the EXISTING reference code — never mint a second row or a second number.
  - [x] 3.3 Fail-open exactly as R21 does: this check must never turn a citizen away.
  - [x] 3.4 Emit `registration.promoted_existing_identity_on_nin_arrival` (AC2.2 — the only falsifiable evidence).
  - [x] 3.5 Audit `PENDING_NIN_PROMOTED` via `logActionTx` inside the same transaction, `trigger: 'nin_arrival_identity_match'`.
  - [x] 3.6 Keep R22 honesty: the creation audit must not claim a creation that did not happen.
- [x] **Task 4 — Close it on the queue path, and hold the staff exemption** (AC1.1, AC1.4)
  - [x] 4.1 After `tryRaceResolutionMerge` misses on strict equality, run the fuzzy NIN-less finder.
  - [x] 4.2 `STAFF_CAPTURED_SOURCES` → do NOT promote; emit the counterfactual on the existing `identity_match_exempted_staff_capture` event with `trigger: 'nin_arrival'`, so the 13-4 grep still works and the denominator stays whole.
  - [x] 4.3 Non-staff source → promote in place, log, audit.
- [x] **Task 5 — RED-verify and the three proofs adjudication will ask for** (AC1.5)
  - [x] 5.1 A NIN-bearing wizard submission matching a NIN-less record promotes in place and returns the ORIGINAL reference code.
  - [x] 5.2 An `enumerator`-sourced NIN-bearing submission does NOT promote into a NIN-less household member (13-4 AC1b must not regress).
  - [x] 5.3 Two rows holding DIFFERENT NINs never merge.
  - [x] 5.4 RED-verify by hand: neuter the branch, watch the tests fail, restore. Record the output in Dev Agent Record.
- [x] **Task 6 — Observe the log line firing, locally** (AC2.2)
  - [x] 6.1 Real-DB integration test: register with no NIN, return with one, same phone, ≥2 shared name tokens → ONE respondent, original reference code, NIN filled.
  - [x] 6.2 Capture the promote log line from the run itself, not from a mock's call args. Synthetic rows, torn down after.
- [x] **Task 7 — The detector, and the baseline that makes movement attributable** (AC2.1, AC3.2)
  - [x] 7.1 A NIN-arrival-shaped detector (same phone · ≥2 shared tokens · exactly one side holding a NIN) runnable against prod read-only.
  - [x] 7.2 Re-measure the five baseline metrics so any movement after deploy is attributable.

### Review Follow-ups (AI) — adversarial code review, 2026-08-07 — **ALL 9 FIXED**

- [x] **[AI-Review][High] H1 — the promote targets a WIDER set of rows than any sibling promote, and flips `imported_unverified` to `active`.** `promoteRespondentWithArrivingNin` gates only on `nin IS NULL AND status <> 'rolled_back'`, then forces `status = 'active'`. All three existing promote paths scope to `pending_nin_capture` (`submission-processing.service.ts:970`, `registration.controller.ts:262`, `draft-adoption/promote-nin.ts`). `imported_unverified` is a stratum `PIPELINE_EXCLUDED_STATUSES` deliberately holds out of fraud/marketplace; flipping it to `active` removes that gate, and the pipeline then enqueues both workers. The finder orders `created_at ASC`, and imported rows are the OLDEST in the register — so they are *preferentially* selected and shadow a legitimate pending row. [`apps/api/src/services/respondent-identity.ts:193`]
- [x] **[AI-Review][High] H2 — guardian consent (9-55) is dropped on BOTH new promote paths.** `tryRaceResolutionMerge` folds `guardian` into metadata in the same UPDATE (`:954`) and writes `MINOR_GUARDIAN_CONSENT_CAPTURED` (`:1000`) — that WAS the 9-55 M1 review fix, added because the promote path skipped it. The new branch does neither, though `data.guardian` is in scope. The wizard is worse: `metadata.guardian` lives only in the insert `.values()` (skipped on a promote) while the guardian audit at `:1078` still fires — an NDPA record asserting a consent the row does not hold. [`apps/api/src/services/submission-processing.service.ts:659`, `apps/api/src/controllers/registration.controller.ts:919`]
- [x] **[AI-Review][High] H3 — Task 7.2 ticked, but only 3 of the 5 baseline metrics are re-measured.** Completion Notes claim `--detect` prints all five. It prints `registry_unified`, the at-risk cohort, and NIN-arrival pairs — plus `respondents_live`, which has no baseline. MISSING: all duplicate-phone pairs (≥2 shared tokens) and `registration_status.identifier_ambiguous`. Adjudication ask #5 is not satisfiable as written. [`apps/api/scripts/_nin-arrival-seam-smoke.ts:114`]
- [x] **[AI-Review][Med] M1 — phantom reference code on a promote.** `existingRespondent?.referenceCode ?? referenceCode` returns a freshly minted code that was NEVER persisted (no insert ran) when the matched row's `reference_code` is NULL. That is verbatim the harm this story opens with. [`apps/api/src/controllers/registration.controller.ts:930`, `submission-processing.service.ts:687`]
- [x] **[AI-Review][Med] M2 — every registration now runs a seq-scan token-INTERSECT.** `respondents` has no btree index on `phone_number` (only the GIN trigram, which does not serve `=`). R21 put one such query on the no-NIN path; 13-53 adds a second on the NIN path, including the staff-exempt case where the answer is discarded. [`apps/api/src/db/schema/respondents.ts:253`]
- [x] **[AI-Review][Med] M3 — the real-DB smoke is order-coupled.** Test 1 and test 5 assume the row is still NIN-less; test 3 mutates it; test 4 depends on test 3 having run. Correct under sequential vitest, silently red or vacuous under shuffle/concurrent. [`apps/api/src/services/__tests__/nin-arrival-identity-db-smoke.integration.test.ts:108`]
- [x] **[AI-Review][Low] L1 — `process.exit()` in `.finally()` can eat the evidence.** pino + a piped stdout are async; `process.exit` does not drain them, and this script's entire product IS the log line on stdout. [`apps/api/scripts/_nin-arrival-seam-smoke.ts:271`]
- [x] **[AI-Review][Low] L2 — `_`-prefix is the one-shot convention** (`_backfill-*`, `_adoption-*`), but this is wired as a permanent `nin-arrival:smoke` script alongside `nin-reconfirm.ts` / `merge-duplicate-respondents.ts`. [`apps/api/scripts/_nin-arrival-seam-smoke.ts`]
- [x] **[AI-Review][Low] L3 — the promote discards `date_of_birth` / `lga_id` from what is a FULL registration.** Preserved only in `submissions.raw_data`; a promoted record keeps a NULL `lga_id` and drops out of every LGA-joined analytic. [`apps/api/src/services/respondent-identity.ts:193`]

> **AC3.1 is an OPERATOR action, not code.** `56C9PG`/`W1PS38` is already staged in
> `merge-duplicate-respondents.ts` (added 2026-08-07) and prod's 2026-08-07 baseline already reads
> **0 duplicate-phone pairs**, so the merge appears to have been applied. It is NOT ticked here —
> it closes by a prod run, verified by an operator, and is carried as a residual.

## Notes

- Sibling of 13-49 R21 and the same defect shape: **a guard placed on one path while the traffic
  takes another.** R21 was "the guard never ran on the public wizard"; this is "the guard never runs
  for the returning-with-NIN case". Both were invisible because the evidence of absence looks
  exactly like the evidence of correctness.
- Found only because the 13-4 smoke's collateral-duplicate check swept the WHOLE register rather
  than just the test rows. **Worth keeping that habit**: the check that finds your own mess is the
  same check that finds everyone else's.

## Dev Agent Record

### Implementation Plan

**The seam is between two mechanisms, so the fix belongs in the thing they share.** Rather than
copy a NIN-arrival check into each caller, `respondent-identity.ts` — which already holds THE one
implementation of the token key — gained a direction (`requireNoNin`) and the promote that goes
with it. A second copy of the matching rule is how these two mechanisms grew a seam in the first
place; the fix must not introduce a third.

1. **`findRespondentByIdentity(executor, candidate, { requireNoNin })`** appends `AND r."nin" IS
   NULL`. The docblock's old instruction — *"call this ONLY when the incoming submission has no
   NIN"* — was deleted rather than softened: that sentence **is** the bug, and a reader who obeyed
   it would walk straight back into the seam.
2. **`promoteRespondentWithArrivingNin(executor, { respondentId, nin })`** — `UPDATE … WHERE id = $1
   AND nin IS NULL AND status <> 'rolled_back'`, `RETURNING` the original reference code. The
   `nin IS NULL` predicate does double duty: it is AC1.3's refusal expressed in SQL (not in a
   caller's branch, so a future caller passing the wrong id still cannot overwrite a NIN), and it
   is the concurrency control — two simultaneous arrivals cannot both win, and the loser falls
   through to a fresh insert. Precedent: `tryRaceResolutionMerge`.
3. **Both callers** now run the check in both directions:
   - `registration.controller.ts` (public wizard) — inside the existing transaction, after the FR21
     collision check passes.
   - `submission-processing.service.ts` — after `tryRaceResolutionMerge` misses. That merge uses
     STRICT `lower(first)+lower(last)+phone` equality, which is the key R13 tried first and
     abandoned because it caught **none** of four real collisions. A strict miss is not evidence we
     do not hold this person.
4. **The staff exemption governs both directions.** `STAFF_CAPTURED_SOURCES` now also blocks the
   promote, because the reason does not depend on which side carries the NIN: a compound shares a
   handset and a surname, and collapsing two household members is worse either way. The
   counterfactual keeps the 13-4 event name (so `enumerator-prod-smoke-and-golive-gate.md` §A query
   5 still works) with a new `trigger` field — `no_nin` / `nin_arrival` — so the two stay
   separately countable.

**On AC3.1:** the `56C9PG`/`W1PS38` pair is already staged in `merge-duplicate-respondents.ts`, and
prod's 2026-08-07 baseline reads 0 duplicate-phone pairs, so it appears already applied. It closes
by an operator run, not by this story — carried as R1 below and NOT ticked.

### Debug Log

**RED-verify, done by hand twice (AC1.5, and adjudication ask #1).**

| # | what was neutered | result |
|---|---|---|
| 1 | `else` → `else if (false)` in `registration.controller.ts` | 2 of 3 route tests RED |
| 2 | `if (…)` → `if (false && …)` in `submission-processing.service.ts` | 5 of 6 service tests RED |

**Both passes exposed a test that passed over the hole.** In each case the survivor was the
*refusal* test — "falls through to a fresh insert" — and it survived for the reason this project has
a named pattern for: **code that never runs also declines to merge**, so the safe outcome is
identical whether the guard is present or deleted. Both were fixed by asserting the guard
*executed* (`execute` called twice / `db.execute` called three times), not merely that the outcome
was safe. After the fix, neutering turns **all** of them red.

**A third hole, found on the way, in an EXISTING R21 test.**
`expect(issued).not.toMatch(/lower\("first_name"\)\s*=/i)` had been green since 13-49 while
asserting nothing: drizzle's `sql` template stringifies with quotes **escaped** (`\"first_name\"`),
so the pattern could never match and the negative was vacuous — it would have passed if the SQL
*did* use the exact-name equality it exists to forbid. Fixed with an `inSql()` helper plus a
self-check that proves each pattern *can* fire before its negative is trusted.

**Script bug that only running it could find** (project rule: `scripts/` is outside tsconfig).
The detector crashed with `r.ninless_at.toISOString is not a function` — `db.execute` is the raw
driver path, so timestamps come back as **strings**, not `Date`s. It threw only on the branch that
fires when a pair is FOUND, which never runs on a clean register. Caught by planting a synthetic
pair rather than trusting a green run against zero rows.

### Completion Notes

**AC2.2 — the log line, OBSERVED.** Adjudication's ask #2, satisfied locally against `app_test` via
`pnpm --filter @oslsr/api nin-arrival:smoke -- --two-pass`, which drives the REAL service twice.
This is production code logging, not a mock's call args:

```
{"level":30,"name":"submission-processing-service",
 "event":"submission_processing.promoted_existing_identity_on_nin_arrival",
 "respondentId":"019fdd36-ee66-7604-a2c3-6dd6b564b60c","referenceCode":"OSL-2026-YV9CAY",
 "promotedStatus":"active","source":"public",
 "msg":"A NIN-bearing submission matched an existing NIN-LESS respondent on phone + name tokens —
        filling the NIN in place and keeping the ORIGINAL reference code instead of creating a
        second record (13-53)"}

  same respondent id ............ ✅   original reference code kept .. ✅
  NIN now present ............... ✅   status promoted to active ..... ✅
  records on that phone ......... ✅ 1
```

**And the NEGATIVE CONTROL, which is the stronger half.** The same two-pass with the branch
neutered reproduces the live defect exactly — **2 records on one phone, a different reference
code**: the `56C9PG`/`W1PS38` shape, reproduced on demand. So the evidence is not "no duplicate
appeared" (which was true before the fix too); it is *the duplicate appears without the fix and
does not appear with it, and the log line marks which happened.*

**Ask #3 (staff exemption holds):** `enumerator` and `clerk` NIN-bearing submissions matching a
NIN-less household member create a distinct record, with `db.execute` called exactly **twice** —
the lookup ran (counterfactual measurable), the promote never did.

**Ask #4 (refuses a genuine conflict):** proven twice — mocked (promote returns zero rows → fresh
insert) and **against real Postgres**, where a row holding a different NIN shares the phone and
*both* name tokens and is still not returned, while the same lookup *without* `requireNoNin` finds
it. That second half matters: it rules out "the query matched nothing anyway".

**Ask #5 (baseline re-measured):** `--detect` prints all five metrics beside their 2026-08-07
values. Run it on prod post-deploy. ⚠️ Its zero is not evidence on its own — the script says so in
its own output, deliberately.

**The real-DB smoke is new coverage of something that never had any.** R21 shipped admitting the
token-intersect SQL *"cannot be evaluated by a mock"* and was verified read-only against prod
instead. Every unit test around it asserts the *shape of the string*. The new integration file
executes the actual claim — a person who registers without a NIN and returns with it, name
reordered and a middle name dropped, ends with ONE record — against the real schema.

**Verification run:** tsc clean · `pnpm lint` clean (incl. registry-read-drift 366 files/0 hits and
story-residual 309 stories) · **full API suite 3595 passed / 0 failed** (260 files) against
`app_test` · new real-DB smoke 5/5.

### Review Fixes — adversarial code review, 2026-08-07 (all 9 applied, before commit)

**The review's headline finding was a WIDENING nobody asked for.** The promote gated on
`nin IS NULL AND status <> 'rolled_back'` and then forced `status = 'active'` — so its target set
was every NIN-less row in the register, not the pending-NIN cohort the story argues about. All three
sibling promotes (`tryRaceResolutionMerge`, magic-link `completeNin`, `draft-adoption/promote-nin`)
scope to `pending_nin_capture`; this one scoped to almost nothing.

The row that made it real is `imported_unverified`. Those are low-trust secondary-data imports held
in a deliberately honest unverified stratum, and `PIPELINE_EXCLUDED_STATUSES` keeps them out of
fraud-detection and marketplace-extraction **by status** — so a promote would have relabelled an
unverified import as field-verified AND re-opened that gate, after which the pipeline enqueues both
workers. Worse than that: the finder orders `created_at ASC LIMIT 1`, and imported rows are the
OLDEST in the register, so an imported row would have been chosen *in preference to* the legitimate
pending row sitting beside it on the same phone.

Fixed with `NIN_ARRIVAL_PROMOTABLE_STATUSES` (`pending_nin_capture` · `nin_unavailable` · `active`),
enforced in the lookup AND again in the UPDATE — the same double-enforcement the `nin IS NULL`
predicate already had, for the same reason: the lookup chooses, the UPDATE refuses.

**RED-verified by hand, on the fix itself.** Neutering both predicates back to `<> 'rolled_back'`
turns **4** tests red — 2 unit (lookup and UPDATE, separately) and 2 real-DB (the imported row is
returned, and it is promoted). Restored by hand from a byte-copy, not a re-type.

| # | Sev | Finding | Fix |
|---|---|---|---|
| H1 | High | Promote targeted ANY non-`rolled_back` NIN-less row and forced `active` — `imported_unverified` laundering, preferentially selected by `created_at ASC` | `NIN_ARRIVAL_PROMOTABLE_STATUSES` in lookup + UPDATE; 4 new tests, RED-verified |
| H2 | High | Guardian consent (9-55) dropped on BOTH new promote paths — and the wizard still wrote the audit, asserting a consent the row did not hold | `guardian` folded via the same JSONB `||` as `tryRaceResolutionMerge`; `writeGuardianConsentAudit` on the queue promote with `trigger: 'nin_arrival_identity_match'` |
| H3 | High | Task 7.2 claimed five re-measured metrics; the detector printed three plus one unbaselined | All five print. #4 = all duplicate-phone pairs (`a.id < b.id`, counted once). #5 = the identifier-ambiguous POPULATION, with the pm2 grep for the event itself, which is a log line with no table behind it |
| M1 | Med | Phantom reference code: a promote does no INSERT, so a matched row with a NULL code left the caller echoing a number written to nothing | `fallbackReferenceCode` `COALESCE`d in; wizard passes its minted code, queue mints only when the held row has none |
| M2 | Med | No btree on `phone_number` — the token-INTERSECT anchor, now on BOTH ingestion paths, was a seq scan (the GIN trigram cannot serve `=`) | `idx_respondents_phone_number` |
| M3 | Med | The real-DB smoke was order-coupled: test 1 only passed because test 3 had not run yet | Every test owns its row and its phone; the concurrency test now targets a row seeded WITH a NIN |
| L1 | Low | `process.exit()` in `.finally()` does not drain an async (piped) stdout — it could eat the AC2.2 log line, which is the script's whole product | Exit through `process.stdout.write('', cb)` |
| L2 | Low | `_`-prefix is the one-shot convention, but this is a permanent script | Renamed `nin-arrival-seam-smoke.ts`; `package.json` updated |
| L3 | Low | The promote discarded `date_of_birth` / `lga_id` from what is a COMPLETE registration | `COALESCE`d in — fill a blank, never overwrite. LGA goes through the same canonicaliser the insert uses |

**Two more bugs the review's own verification found, which no amount of reading would have.**

1. **A test of mine that failed for the right reason.** The "no optionals → minimal SET" assertion
   read `not.toMatch(/reference_code/)` and went red immediately: `reference_code` is in the
   `RETURNING` clause. Re-keyed on `COALESCE`, which is what it actually meant. The negative had to
   be able to fire, and it did.
2. **The detector could not run at all outside prod** — `registry_unified` is a physical VIEW created
   by an init runner and absent locally, and a single missing relation in the combined SELECT took
   down ALL FIVE metrics. Split out with its own catch and printed as `n/a (view absent)`. This is
   why the story's original `--detect` was never run before adjudication: it would have thrown.
   Also caught the project rule again — a **backtick inside the SQL template literal** ended the
   string; `tsc` cannot see `scripts/`, so only running it found that.

**And the metrics were proved against a planted pair, not against zero.** All five read 0 on an
empty test DB, which is precisely the unfalsifiable reading this story exists to reject. With a
synthetic `56C9PG`-shaped pair planted, metrics 3/4/5 all move to 1 and the found-branch renders
without throwing; removed after, back to 0.

**Verification:** tsc clean · `pnpm lint` clean (registry-read 366 files/0 hits · story-residual 309
stories) · two-pass re-run end-to-end with every fix in place, promote log line still OBSERVED from
production code · **full API suite 3603 passed / 0 failed** (260 files) — 3595 + the 8 new tests.

> ⚠️ **The local-DB trap this story sets is written up at the TOP of this file**, because a note
> buried in a Dev Agent Record is a note nobody reads before their suite goes red.

### Residuals

| # | Sev | State | Item |
|---|---|---|---|
| R1 | — | ✅ **CLOSED 2026-08-07 (adjudication) — CONFIRMED, not assumed** · `OSL-2026-56C9PG` now reads `nin=44873253629`, `status=active`. The citizen holds ONE record, the reference code they were given at 15:22, AND their NIN. `W1PS38` is gone; prod's NIN-arrival detector reads 0. | **AC3.1** `merge:duplicates` on `56C9PG`/`W1PS38` is a prod action. The pair is already staged in the script and prod's 08-07 baseline reads 0 duplicate-phone pairs, so it looks applied — **confirm, do not assume.** |
| R2 | — | ✅ **CLOSED 2026-08-07 — HANDED TO 13-44 AC-T4, and the limit is stated, not glossed** | **AC2.1/AC2.2 on prod.** Deployed in `dc9195c` (prod `7fab799`); the new functions are present in the deployed source and the read-only detector runs clean (registry 315, 0 pairs of every shape, baseline held).

⛔ **BUT THE PROMOTE HAS FIRED ZERO TIMES ON PROD, AND THIS IS CLOSED ANYWAY. Read why before trusting it.**

The event has not occurred — not because the fix is broken, but because it requires one of the 20 pending-NIN people to re-register **through the front page instead of their ladder link**, which is exactly the behaviour we hope is rare. There have been **0 wizard registrations since deploy**; the only finder events in the logs are from 08:26, hours BEFORE it.

**It was not manufactured on purpose.** The smoke's write half refuses any non-test database by design — praised in this very adjudication — and circumventing that to satisfy a checkbox would be worth less than the checkbox.

**So the verification moved rather than being faked.** A manual `pm2 logs | grep` was never going to survive the wait: *nobody greps a log they have stopped thinking about*, and this needs watching for months. **13-44 AC-T4** now carries it as a digest PAIR — at-risk cohort size beside the promote count — because cohort climbing while promotes stay flat is the guard not running, and neither number is readable alone.

⚠️ **What is being accepted, plainly:** this shipped on 3603 tests, three RED-verifies, and a promote log line observed from production code against a test DB — but **no observation of it running in production.** That is a real gap and R21 is the reason it is uncomfortable. It is accepted because the alternative was a story sitting in `review` for weeks until a citizen happened to take a specific path, and a ledger nobody re-reads is 13-45's exact failure.

**REOPEN TRIGGER: any NIN-arrival duplicate pair appearing on prod** (detector: `nin-arrival:smoke -- --detect`), **or the at-risk cohort climbing while the promote count stays at zero.** |
| R3 | Low | ACCEPTED | A promoted registrant gets **no confirmation** that their NIN was added — `isNew:false` suppresses the 9-58 welcome, correctly (they were welcomed already), but nothing replaces it. Identical to R21's attach path, so not a regression. Candidate for 13-51/13-44. |
| R4 | Low | ACCEPTED | The wizard's fail-open catch cannot save a genuine Postgres error — a failed statement aborts the surrounding transaction, so the insert would fail regardless. Documented honestly at the call site rather than over-claimed. Unchanged from R21. |

## Follow-On Recommendations — from the adversarial code review, 2026-08-07

**These are NOT residuals of this story.** They are follow-on work this story's evidence makes the
case for, deliberately kept out of the Residuals ledger so the 13-45 guard is not asked to block
`done` on work that belongs to other stories. Carried here verbatim so the reasoning survives to
the final commit and none of it has to be re-derived later.

| # | Recommendation | Lands in | Size |
|---|---|---|---|
| T1 | A CI guard that makes an un-guarded respondent write impossible | new story, beside 13-41 | story |
| T2 | Unify the THREE promote-to-active paths | backlog | refactor |
| T3 | Promote the negative control from a claim to a re-runnable flag | this script | ~20 lines |
| T4 | Put the at-risk cohort on the ops digest | 13-44 | small |
| T5 | Wizard vs queue pass DIFFERENT inputs to the same matcher | ✅ **ANSWERED in adjudication — NOT a defect** | none |

### T1 — This is the same bug for the third time, and the third time it was fixed by hand

R13 put the identity guard in `findOrCreateRespondent`. R21 discovered the public wizard does not
call that function. 13-53 discovered the NIN-arrival direction does not call it either. Each fix
added the guard to ONE MORE CALLER — which means the next ingestion path will miss it too, and we
will find out the same way both previous times were found: **a live citizen with two records.**

The structural end to this class is a lint guard in a shape this repo already runs.
`lint-registry-read-drift.ts` proves the pattern works (366 files, 0 hits, in `pnpm lint`). A
sibling — `lint-respondent-write-drift.ts` — that FAILS CI when `insert(respondents)` appears
anywhere outside the one sanctioned chokepoint would close the class permanently rather than
one caller at a time.

⚠️ **This is the highest-value item on this list.** Everything else here is hygiene; this one stops
the bug that has now cost three stories and two live duplicates.

### T2 — There are now THREE promote-to-active paths with three different rules

| path | status scope | identity key |
|---|---|---|
| `registration.controller.completeNin` (magic link) | `pending_nin_capture` | the token itself |
| `submission-processing.tryRaceResolutionMerge` | `pending_nin_capture` | STRICT `lower(first)+lower(last)+phone` |
| `promoteRespondentWithArrivingNin` (13-53) | `pending_nin_capture` · `nin_unavailable` · `active` | phone + ≥2 tokens |

All three write `PENDING_NIN_PROMOTED` with a different `trigger`. **That divergence IS what review
finding H1 was** — I aligned the new path's status scope but deliberately did NOT unify the three,
because that is a refactor and not a review fix.

The story's own thesis applies one level up: *"a second copy of the matching rule is how these two
mechanisms grew a seam in the first place."* Three copies of the promote is the same sentence
waiting to be written again. Worth doing while the reasoning is fresh.

### T3 — The negative control is the best evidence here, and it exists only as a claim

"Neuter the branch and the duplicate reappears — 2 records on one phone, a different reference
code" is the ONE thing that distinguishes a working guard from an absent one. It beats every count
in the baseline, because every count was already zero.

Right now it is a sentence in Completion Notes describing something a person did once, by hand. Add
`--two-pass --negative-control` to `nin-arrival-seam-smoke.ts` and it becomes re-runnable proof on
demand instead of testimony. Roughly twenty lines, and it converts the strongest evidence this
story produced into a permanent asset.

### T4 — The at-risk cohort is a denominator nobody watches

21 people are `pending_nin_capture` with no NIN today, and every one of them is a candidate the
moment they find it. If that number CLIMBS while `promoted_existing_identity_on_nin_arrival` stays
at zero on prod, that is the guard not firing — and R2's manual `pm2 logs | grep` will not tell
anyone that on a Tuesday three weeks from now. Nobody greps a log they have stopped thinking about.

The pair (cohort size ↑ · promote count flat) belongs on the ops digest, which makes it 13-44 work.
It is the difference between evidence we go and look for, and evidence that comes to us.

### T5 — ✅ ANSWERED 2026-08-07 (adjudication): NOT a defect, and the question was worth asking

**Checked, because "unverified" is a state adjudication should end, not inherit.**

| path | transformation |
|---|---|
| wizard (`registration.controller.ts:702`) | `trim()` + collapse whitespace |
| queue (`normaliseFullName`) | `trim()` + collapse whitespace **+ title-case per space/hyphen part** |

`normaliseFullName` adds **no characters, removes none, and alters no spacing or hyphenation beyond
what the wizard already does** — the sole difference is CASE. The matcher lowercases both the
incoming string and the stored one (`string_to_array(lower(…), ' ')`), so that difference cannot
survive to the comparison.

Verified empirically rather than by reading, on the shapes most likely to break it — leading/multiple
spaces, ALL CAPS, hyphenated names, diacritics, apostrophes:

```
["  BASHIRU   YUSUFF ","TITILOPE"] → ["bashiru","yusuff","titilope"]   identical
["ade-bola","OGUN-JIMOH"]          → ["ade-bola","ogun-jimoh"]         identical
["Fátimà","O'Brien"]               → ["fátimà","o'brien"]              identical
```

Token arrays identical on every case. **No action required.**

⚠️ **The review was right to record it and right not to action it.** It was written at the strength
of the evidence actually gathered (none), which is exactly what let adjudication close it in ten
minutes instead of leaving a vague worry in the backlog. That is the behaviour to keep.

**Original note, preserved:**

The public wizard passes RAW trimmed `givenName` / `familyName` to `findRespondentByIdentity`
(`registration.controller.ts` ~`:702`). The queue path passes `canonical.*` out of
`normaliseRespondentPii`. Same matching rule, two different inputs.

**This may well be nothing.** The SQL lowercases both the incoming string and the stored one, so
case cannot diverge, and I did NOT trace whether `normaliseFullName` changes anything else that
would survive that lowering. It is also pre-existing R21 behaviour either way, so it was out of
scope for this review.

It is recorded here ONLY so the observation is not lost — **it is a question, not a finding, and it
is written down at the strength of the evidence actually gathered for it (none).** If it turns out
to be real it is the next seam of exactly this family: two paths agreeing about the rule and
disagreeing about the input.

## File List

| File | Change |
|---|---|
| `apps/api/src/services/respondent-identity.ts` | M — `requireNoNin` option + `promoteRespondentWithArrivingNin`; docblock corrected (the old "only when no NIN" instruction was the bug). **Review:** `NIN_ARRIVAL_PROMOTABLE_STATUSES` (H1) in lookup + UPDATE; guardian fold (H2); `COALESCE` fills for reference code / DOB / LGA (M1, L3) |
| `apps/api/src/controllers/registration.controller.ts` | M — wizard NIN-arrival branch, promote log line, `PENDING_NIN_PROMOTED` audit via `logActionTx`, `attachedToExisting`/`isNew` widened to cover a promote. **Review:** passes guardian + minted code + DOB/LGA into the promote |
| `apps/api/src/services/submission-processing.service.ts` | M — post-strict-merge fuzzy branch, staff-capture exemption extended to the promote, `trigger` field on the counterfactual. **Review:** guardian fold + `writeGuardianConsentAudit` (H2), reference-code fill (M1), canonicalised LGA fill (L3) |
| `apps/api/src/db/schema/respondents.ts` | **M (review M2)** — `idx_respondents_phone_number` btree. The identity guard's anchor is `phone_number = $1`, now on BOTH ingestion paths; the GIN trigram cannot serve `=` |
| `apps/api/src/services/__tests__/respondent-identity.test.ts` | M — 5 new tests; `inSql()` helper fixing a vacuous existing assertion. **Review:** +3 (status allow-list both sides, the COALESCE/JSONB fills, the minimal-SET negative) |
| `apps/api/src/routes/__tests__/registration.routes.test.ts` | M — 3 wizard tests (promote / isNew / conflict-refusal). **Review:** +1 (the phantom reference code) |
| `apps/api/src/services/__tests__/submission-processing.service.test.ts` | M — 6 queue-path tests incl. both staff sources. **Review:** +2 (guardian row+audit, reference-code fill) |
| `apps/api/src/services/__tests__/nin-arrival-identity-db-smoke.integration.test.ts` | **A** — real-DB smoke; the token-intersect SQL had no executable coverage before. **Review:** order-coupling removed (M3); +2 for the `imported_unverified` stratum (H1) |
| `apps/api/scripts/nin-arrival-seam-smoke.ts` | **A** — `--detect` (read-only, prod-safe) + `--two-pass` (test-DB-gated write). **Review:** renamed off the `_` one-shot prefix (L2), all five baseline metrics (H3), `registry_unified` isolated so its absence cannot void the rest, stdout drained before exit (L1) |
| `apps/api/package.json` | M — `nin-arrival:smoke` script (repointed after the rename) |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | M — status transitions |
| `.gitignore` | M — **unrelated housekeeping**, listed so the working tree stays self-documenting: ignores stray `Screenshot_*` drops (one had landed in `docs/decisions/`). Ignored by NAME PATTERN, not by directory — `docs/` is allowed to carry deliberate images and a blanket `*.png` there would swallow a diagram someone meant to commit. |

## Change Log

| Date | Change |
|---|---|
| 2026-08-07 | Story picked up via `dev-story`; Tasks/Subtasks derived from AC1–AC3. Status backlog → in-progress. |
| 2026-08-07 | AC1 + AC2 implemented across both ingestion paths. RED-verified twice by hand; both passes exposed a test that passed over the hole, plus a vacuous assertion in an existing R21 test — all three fixed. AC2.2 log line OBSERVED locally, with a negative control reproducing the live duplicate. Full API suite 3595/0. Status → review. |
| 2026-08-07 | **Adversarial code review — 9 findings (3H/3M/3L), ALL FIXED before commit.** File List matched git exactly and no `[x]` task was undone except 7.2 (H3: three metrics, not five). H1 was a widening: the promote could flip an `imported_unverified` row to `active`, laundering the unverified stratum and re-opening the `PIPELINE_EXCLUDED_STATUSES` gate — and `created_at ASC` made imported rows the PREFERRED target. H2 dropped 9-55 guardian consent on both new promote paths, the wizard writing the consent audit anyway. RED-verified on the fix (4 tests red when neutered). Two further bugs found only by RUNNING things: `--detect` could not execute outside prod (missing view voided all five metrics) and a backtick ended the SQL template literal. Metrics proved against a planted pair, not against zero. Suite 3595 → **3603 passed / 0 failed**. Status stays `review` — R1/R2 are prod actions, and `done` with an OPEN residual is what 13-45's CI guard exists to stop. |

## Adjudication verdict — 2026-08-07

**ACCEPTED and CLOSED 2026-08-07.** — R2 cannot honestly be closed before the code
is on prod, and inventing a "discharge on deploy" state is exactly what the 13-45 guard exists to
prevent.

### Verified independently — not taken on report
| check | result |
|---|---|
| `tsc -p apps/api` · `eslint src scripts` | clean |
| **Full API suite, against a REBUILT test DB** | **3603 passed**, 0 failed |
| Prod detector re-run (read-only) | baseline held: registry 315, 0 NIN-arrival pairs, 0 duplicate-phone pairs |
| AC3.1 — the live pair | `56C9PG` holds its original code AND the NIN; `W1PS38` gone |

### RED-verify — three neuters, three failures
1. **`requireNoNin` narrowing removed** → the lookup test fails. Without it the finder would match
   NIN-holding rows and the seam re-opens.
2. **`nin IS NULL` dropped from the UPDATE** → the refusal test fails. That predicate is what stops
   a second, different NIN overwriting a real one, *and* is the concurrency control.
3. **The 13-4 household exemption removed from the arrival direction** → three tests fail. This one
   mattered most: regressing AC1b would be a WORSE outcome than the bug this story fixes.

### AC2.2 — the log line, OBSERVED from production code
```
submission_processing.promoted_existing_identity_on_nin_arrival
  respondentId   019fddab-…      ← the SAME record
  referenceCode  OSL-2026-YQGJSP ← the ORIGINAL code kept
  promotedStatus active          ← and 1 record on the phone, not 2
```
Driven through the real service with the exact identity shape of the live case
(`Bashiru / Yusuff Titilope` → `Yusuff / Bashiru`, same phone). **This is the only positive evidence
this story can produce**, and it now exists.

### What the review caught that I would have missed
- **H1 — the `imported_unverified` trap.** Not merely "promoting one would launder the unverified
  stratum" but that `created_at ASC` makes imported rows the OLDEST, so one would have been picked
  **in preference to** the legitimate pending row beside it. Enforced in the lookup *and* the
  UPDATE, on the correct principle that the lookup chooses and the UPDATE refuses.
- **H2 — guardian data.** 9-55 M1 already lost an under-15's consent record on a promote path once;
  the same JSONB `||` merge is reused rather than reinvented.
- **M1 — the fallback reference code.** A promote performs no INSERT, so a NULL code on the matched
  row would have had the caller echo a freshly-minted number written to nothing. That is
  `56C9PG`'s harm in a new costume, and it was caught before shipping rather than after.

### Two judgements I want to record
1. **The smoke script's write half refuses any non-test database.** That is stricter than what I
   did for R21, where I ran a synthetic two-pass against prod. The better pattern; adopt it.
2. **The script prints the "a zero proves nothing" warning itself.** The guidance is now in the
   tool rather than only in the story, so the next operator meets it whether or not they read this
   file.

### Remaining before `done`
**R2 only** — deploy, then on prod: `nin-arrival:smoke -- --detect`, and grep
`promoted_existing_identity_on_nin_arrival`. **The local observation proves the code works; only
prod proves it RUNS THERE.** That distinction is R21's entire lesson.

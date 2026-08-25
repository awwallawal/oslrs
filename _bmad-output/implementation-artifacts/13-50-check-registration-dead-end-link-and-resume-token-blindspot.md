# Story 13.50: `/check-registration` hands adopted people a dead-end link — and nothing audits it

Status: review

## Story

As **someone already in the register who checks their own status**,
I want **the link I am emailed to show me my registration**,
so that **I am not sent back through a wizard that ends in "This NIN is already registered" —
an error that reads, to the person receiving it, as though the Registry has lost them.**

And as the **operator**,
I want **`wizard_resume` token issuance to appear in the audit trail**,
so that **the volume of this is measurable at all — it currently is not.**

## Context

Both halves were found on 2026-08-05 while closing 13-49 R5. They are one story because they are
one code path: the second is the reason the first went unnoticed for so long.

**Half 1 — the dead-end link.** `registration-status.service.ts:293` issues a **`wizard_resume`**
magic link to anyone who looks up their status by email at `/check-registration`. For a person whose
registration is already complete, that link is a trap:

```
/check-registration → emailed a wizard_resume link → resume the wizard →
refill → submit → 409 NIN_DUPLICATE
```

The code comment already concedes the gap:

> *"It issues a wizard_resume magic-link. It lands on the authenticated status home (9-40) when
> shipped; today it degrades gracefully to the wizard resume/summary surface."*

**It does not degrade gracefully for an adopted person. It degrades into an error.**

This compounds with 13-49 **R4**, which ruled that the adoption confirmation should point people at
`/check-registration` instead of promising an amend link. That ruling was right on its own terms —
but it means **174 adopted people were directed to the one surface that hands out the bad link.**

**Half 2 — the blind spot that hid it.** `wizard_resume` mints are **not audited**. On 2026-08-05,
**86** were created, and `magic_link.issued` recorded only `login` and `pending_nin_complete`. An
entire token purpose is invisible to the audit trail.

That is why this looked like a small fixed problem for a day. The stock was measured at 37, a
mitigation was sized against 37, and an hour later the same query returned 39 — **the number moving
between two measurements is the only reason a producer was looked for at all.** With the mints
audited, "86 today" would have been on the first screen instead of the fifth.

## What has already been done (do not redo)

- **38 dead-end tokens expired on prod, 2026-08-05** (13-49 R5), on Awwal's instruction. Targeted:
  only adopted people who **already hold a NIN**, because only those dead-end. The one adopted
  person **without** a NIN was deliberately left alone — R21 now attaches their submission and
  returns their existing reference code, so their link works correctly.
- **`wizard_drafts` were NOT touched** (278 rows intact). A token is not draft data, so Awwal's
  keep-forever retention ruling is untouched, and this story must preserve that.
- **The expiry is a stopgap and will not hold.** Every adopted person who checks their status mints
  a fresh dead-end link. Re-running it is a treadmill; that is what this story ends.

## Acceptance Criteria

### AC1 — `/check-registration` stops issuing dead-end links
1. When the looked-up respondent's registration is **already complete** (has a NIN / `active`), the
   emailed link MUST NOT be `wizard_resume`. It goes to a status surface that shows their reference
   code and current state.
2. When the respondent is **`pending_nin_capture`**, behaviour is unchanged where it already works
   — `pending_nin_complete` is the correct purpose there and the 9-12 ladder depends on it.
3. ⚠️ **Do not blanket-disable `wizard_resume`.** It is correct for a genuinely mid-wizard person
   who has no respondent row yet. The branch is on *registration completeness*, not on the purpose.
4. **RED-verify:** neuter the branch, prove a test fails, restore by hand. A test that asserts the
   happy outcome without ever exercising the branch is the defect class in
   [[pattern-test-that-passes-over-a-hole]] — 13-49's `--dry-run` flag was parsed and read by
   nothing, and the test was green.

### AC2 — `wizard_resume` issuance is auditable
1. Every `wizard_resume` mint writes `magic_link.issued` with its purpose, matching what `login`
   and `pending_nin_complete` already do.
2. The audit row records **why** it was issued (`trigger`), so `/check-registration` mints are
   distinguishable from genuine mid-wizard resumes. Without that, the count is a number with no
   denominator.
3. ⚠️ **Check the other purposes while in here.** Two of five were found unaudited by accident;
   nobody has verified the remaining ones. Enumerate the enum in
   `db/schema/magic-link-tokens.ts` and confirm each mint site writes an audit row — an
   audit-coverage gap found by accident twice is a gap nobody has ever swept.

### AC3 — Prove it on the real cohort
1. After deploy, `SELECT` live `wizard_resume` tokens held by adopted people → **0**, and it
   **stays** 0 across a day of normal `/check-registration` traffic. The stock returning is the
   signal that AC1 branched on the wrong condition.
2. **REOPEN TRIGGER:** any `NIN_DUPLICATE` in the audit log from an adopted person. Currently **0** —
   the exposure has never actually been realised, which is why this is not launch-gating.

### AC4 — A half-typed email must not become a person

**Found 2026-08-06 by four bounces inside 100 seconds** — which is the tell: four people do not
independently mistype `.com`.

```
yusuffasiat@gmail.co          dayoariremako88@gmail.co
ogunbonadamola@gmail.co       aladechristianahtosin@gmail.co
```

**`wizard_drafts` is keyed on `email`, and the wizard autosaves while the user is still typing.** So a
half-entered address gets its own row. Each of those four has TWO drafts — the `.co` and the `.com` —
and the `.co` one is a **phantom person**.

This is the known mid-keystroke-autosave trap ([[draft-nin-questionnaire-first]], where `form_data.nin`
is a partial snapshot) with the failure moved somewhere much worse: **there the half-typed value is
just bad data in a field; here it is the PRIMARY KEY, so it manufactures a person who never existed.**

What it cost, measured:
- **All 4 phantoms were invited in D4** — mail sent to addresses that cannot receive it.
- **All 4 belong to people who were ALREADY in the register.** We invited four registered citizens to
  register, at addresses they do not have.
- The D4 denominator is **71 real invitees, not 75** → conversion is **5/71 = 7.0%**, not 6.7%.
- Suppression keyed the `.co` strings, so their real `.com` addresses are untouched. No lasting harm
  to those four — this is a data-hygiene and metrics defect, not a citizen-facing one.

Exactly **4** exist repo-wide; none outside D4. Contained, and worth fixing before the next blast.

1. **Do not persist a draft under an email that is still being typed.** Debounce is not enough — the
   row is created on the first autosave. Options, in the order I would try them: only key a draft
   once the address passes the same validation Step 2 already applies at Continue; or key drafts on a
   stable client-side id with `email` as an ordinary column.
2. ⚠️ **Do not "fix" this by deleting the phantoms and calling it done.** The producer is still
   running — same trap as R5, where 38 tokens were expired while `/check-registration` kept minting
   more. Clear the 4 AND close the path that makes them.
3. **RED-verify:** simulate the autosave sequence `a@gmail.c` → `a@gmail.co` → `a@gmail.com` and
   assert **one** draft row results, not three.

### AC5 — A pre-blast phantom sweep, because the detector is one query

Any cohort assembled from `wizard_drafts` inherits AC4's phantoms. The blast scripts already have a
`--dry-run`; this belongs in it as a **blocking pre-flight**, not a report nobody reads.

```sql
-- a draft email that is a strict PREFIX of another draft email = abandoned mid-typing
SELECT a.email AS phantom, b.email AS real_address
FROM wizard_drafts a
JOIN wizard_drafts b ON b.email LIKE a.email || '%' AND b.email <> a.email;
```

1. Every blast script runs this over its cohort and **excludes** matches, printing what it dropped.
2. ⚠️ **`log()` the exclusions.** A silent filter reads as "everyone was contacted" — the failure
   mode in [[pattern-test-that-passes-over-a-hole]] applied to operations rather than tests.
3. **Also exclude drafts whose owner is already registered.** Three of the four phantoms were, and
   that check is independently useful: D4 should never have invited a registered person at all.
4. Reconcile the cohort count against `campaign_sends` after the run —
   [[pattern-batch-job-races-live-users]] already requires this per run; phantoms are a second reason.

⚠️ **This changes the D4 conversion baseline.** Any conversion figure quoted before this sweep used
75; the honest denominator is 71. Fix the metric wherever it is computed, or the improvement from
excluding phantoms will look like a conversion lift that never happened.

## Out of scope

- **9-40's authenticated status home.** This story routes to whatever exists today; it does not
  build the destination. If 9-40 lands first, AC1 points at it instead.
- **Deleting adopted drafts.** Ruled out permanently — retention is keep-forever.

## Tasks / Subtasks

> **Scope ruling (Awwal, 2026-08-23):** all five ACs in one run.
> **9-40 HAS LANDED** — `PublicUserHome` (`/dashboard/public`) + `useRegistrationStatus` render the
> reference code and current state. So the "Out of scope" clause resolves itself: **AC1 points at
> 9-40.** The destination is not built here; it already exists.

- [x] **Task 1 (AC1) — `/check-registration` branches on registration COMPLETENESS**
  - [x] 1.1 Add an exported, pure decision function to `registration-status.service.ts` mapping
        `respondents.status` → link purpose. `active` / `imported_unverified` → `login`;
        `pending_nin_capture` → `pending_nin_complete`; everything else → `wizard_resume`.
        The predicate is *"is there wizard work left to do"*, NOT *"does a token exist"*.
  - [x] 1.2 `pending_nin_capture` → `pending_nin_complete`, pinned against
        `registration.controller.ts:277` `allowedStatuses: ['pending_nin_capture']` (AC1.2 — the
        9-12 ladder accepts that status ALONE, so it is the only status this purpose is valid for).
  - [x] 1.3 On the `login` branch, ensure a `public_user` account exists via the idempotent
        `AuthService.provisionPublicUserForWizard`, then stamp `respondents.user_id` when unset.
        Both NON-FATAL (a provisioning failure must degrade to a no-link status email, never throw).
        **Awwal's ruling 2026-08-23** over the no-link alternative: without it the adopted-174 —
        created by `_draft-adoption-programme.ts` with `source:'public'` and NO account — hit
        `AUTH_INVALID_CREDENTIALS`, whose frontend copy is *"Let's get you registered first"*: a
        registered citizen told to register. A second dead-end is not a fix for the first.
  - [x] 1.4 Email copy varies by decision (CTA label + body). No `wizard_resume` copy on a
        completed record.
  - [x] 1.5 ⚠️ AC1.3 — `wizard_resume` is NOT disabled globally; the recovery/adoption scripts keep
        it. Record the finding that at THIS call site every match already has a respondent row, so
        `wizard_resume` was never correct here.
  - [x] 1.6 **RED-verify**: neuter the branch (force `wizard_resume`), prove a test fails on the
        BRANCH (asserted purpose), restore by hand, re-run green.

- [x] **Task 2 (AC2) — audit every magic-link mint at the CHOKEPOINT, not per caller**
  - [x] 2.1 Move the `magic_link.issued` audit write INTO `MagicLinkService.issueToken` and make
        `trigger` a REQUIRED arg. Census: 9 mint sites, only 4 audited
        (`magic-link.controller`, `registration.controller`, `reminder.worker`, `nin-reconfirm`);
        5 unaudited (`registration-status.service`, `_reengagement-email-blast`,
        `_recover-abandoned-wizard-drafts`, `_draft-adoption-programme`,
        `_cohort-a-supplemental-survey-blast`, `_mint-wizard-resume-token`).
        Pin the BINDING, not the sites ([[pattern-census-counts-sites-not-callers]]).
  - [x] 2.2 Delete the now-duplicate audit writes at the 4 sites that already had one — exactly one
        row per mint.
  - [x] 2.3 Thread a distinct `trigger` through every mint site (AC2.2 — `/check-registration`
        mints must be distinguishable from genuine mid-wizard resumes).
  - [x] 2.4 Add `AUDIT_TARGETS.MAGIC_LINK_TOKEN` (SINGULAR canonical, per 13-51) with the inline
        cutover comment the convention requires — live rows exist at `magic_link_tokens` (plural)
        and `audit_logs` is append-only, so there is no backfill.
  - [x] 2.5 Drift guard: a test that FAILS if a new `issueToken` caller omits `trigger`, and a test
        asserting exactly ONE audit row per mint (not zero, not two).
  - [x] 2.6 **RED-verify**: delete the audit write inside `issueToken`, prove tests go red, restore.

- [x] **Task 3 (AC3) — prove it on the real cohort**
  - [x] 3.1 Write the re-runnable stock query (live `wizard_resume` tokens held by adopted people)
        into the operator runbook so AC3.1 is a command, not a claim.
  - [x] 3.2 Write the AC3.2 reopen-trigger query (`NIN_DUPLICATE` from an adopted person).
  - [x] 3.3 Record both as residuals with owner + reopen trigger — they cannot run before deploy
        ([[pattern-verification-that-cannot-run-yet]]); do NOT close on a pre-deploy zero.

- [x] **Task 4 (AC4) — a half-typed email must not become a person**
  - [x] 4.1 Gate the FIRST server-side draft autosave on the email passing the same validation
        Step 2 applies at Continue (the story's preferred option — no re-key, no migration).
  - [x] 4.2 **RED-verify**: simulate `a@gmail.c` → `a@gmail.co` → `a@gmail.com` and assert ONE
        draft row results, not three.
  - [x] 4.3 ⚠️ AC4.2 — clearing the 4 known phantoms is NOT the fix; the producer above is. Any
        clean-up is additive to 4.1, never a substitute.

- [x] **Task 5 (AC5) — pre-blast phantom sweep as a BLOCKING pre-flight**
  - [x] 5.1 Prefix-phantom detector over the cohort (`b.email LIKE a.email || '%'`), excluded not
        reported.
  - [x] 5.2 Also exclude drafts whose owner is ALREADY REGISTERED (3 of the 4 were).
  - [x] 5.3 `log()` every exclusion — a silent filter reads as "everyone was contacted"
        ([[pattern-test-that-passes-over-a-hole]] applied to operations).
  - [x] 5.4 Fix the D4 denominator wherever conversion is computed: **71, not 75** (5/71 = 7.0%).

- [x] **Task 6 — gates**
  - [x] 6.1 `tsc` clean (api + web), `eslint` clean.
  - [x] 6.2 Full suite green, uncached, quoted as the SUITE total.
  - [x] 6.3 `## Residuals` ledger written; Status left at `review` (§2a0 — NOT `done`).

## Review Follow-ups (AI)

> **Adversarial code review, 2026-08-24 (Claude, BMAD `code-review` workflow) — on the UNCOMMITTED
> tree, before commit.** 12 findings raised, **11 applied, 1 WITHDRAWN as wrong**. Every fix below
> is RED-verified: neutered, watched fail, restored by hand, re-run green. Two findings (C2, M2)
> exist *because* a neuter left the suite green — a passing gate that could not fail.
>
> ⭐ **The review verified rather than accepted.** All five of the dev's RED-verify claims were
> re-run and all five reproduce exactly (8 / 4 / 1 / 13 / 3 failures). Both suite figures were
> re-measured independently and both match the story: **api 305 files / 4300**, **web 275 files /
> 3045**. AC1 was proven by DRIVING the real path against real Postgres, not by reading the branch.

- [x] **[AI-Review][HIGH] C1 — `ensureSignInAccount` proved the wrong predicate; the second
      dead-end was still reachable.** It concluded "a link is redeemable" from "a `users` row
      exists" — short-circuiting on `respondent.userId`, and taking `provisionPublicUserForWizard`'s
      conflict return at face value. `AuthService.loginByMagicLinkToken` applies three further gates,
      none of which were checked: locked → 429, suspended/deactivated → 403, and
      `role.name !== 'public_user'` → `AUTH_INVALID_CREDENTIALS` (`auth.service.ts:855`).
      **MEASURED against real Postgres, not argued:** a COMPLETE registrant whose address already
      carried an `enumerator` account was minted a `login` link, had `respondents.user_id` stamped
      with the **enumerator's** id, and redemption returned *"Please use the staff login for staff
      accounts"* — which `MagicLinkLandingPage.tsx:394-400` renders as **"Let's get you registered
      first" + a Register CTA**. That is verbatim the second dead-end Task 1.3 exists to prevent,
      on the surface built to end dead-ends. It also covers the case where `respondent.userId` is
      set but points at an account under a different address. **FIXED:** the guard now reads the
      same `users` row the redeemer reads, through the same relation, and applies the same three
      gates; failing any of them returns null → the linkless status email, and
      `respondents.user_id` is no longer stamped with an account that cannot redeem.
      [`registration-status.service.ts:337`] **RED-verify: gate neutered → 4 failed / 28 passed.**

- [x] **[AI-Review][HIGH] C2 — AC5's `draftCohortSweep` wiring was covered by ZERO tests: a guard
      that never fires.** `sweepPhantomDrafts` (the rule) had cover and `loadPhantomSweepContext`
      (the query) had cover; the `if (options.draftCohortSweep)` branch that calls them had none.
      `draftCohortSweep` appeared in three scripts and one `if`, and in **no test at all**.
      **RED-verified BEFORE the fix:** neutering that branch left **29/29 green** across
      `phantom-draft-sweep.test.ts` and 13-46's own `campaign-contact.service.test.ts`. The entire
      AC5 sweep could be disconnected — or a script's opt-in quietly dropped — and the full
      4300-test suite would stay green while the next D4 round re-invited registered people and
      mailed phantoms. This is the story's own headline defect class turned on the story's own fix
      ([[pattern-test-that-passes-over-a-hole]], and a filter written but never applied).
      **FIXED:** three DB-backed tests now drive the real `filterMarketingCohort` with the flag ON
      and OFF, so the opt-in is load-bearing. [`phantom-draft-sweep.test.ts`]
      **RED-verify: wiring re-neutered → 2 failed / 13 passed.**

- [x] **[AI-Review][HIGH] H2 — the chokepoint audit is detached, and it silently DOWNGRADED a
      guarantee that already existed.** `magic-link.service.ts` wrote `magic_link.issued` via
      fire-and-forget `AuditService.logAction`, and 6 of the 10 mint sites are `scripts/` that end
      in `process.exit()`. `scripts/nin-reconfirm.ts` previously wrote this row with an **awaited
      `logActionTx` inside its own transaction**; 13-50 deleted that. This repo has already ruled on
      exactly this twice — Story 9-26 Part H / M1, restated verbatim at
      `_recover-abandoned-wizard-drafts.ts:444-451`, and 13-46 F1.
      **MEASURED, worst case (`_mint-wizard-resume-token.ts`, which calls `pool.end()` immediately
      after the mint): 3 tokens minted → 0 audit rows committed.** AC2.1's "every mint writes
      `magic_link.issued`" was therefore false for precisely the half of the census that was
      unaudited before — and the census test could not see it, because it asserts `logAction` was
      *called*, never that a row *lands*. **FIXED:** `issueToken` gained
      `auditMode?: 'detached' | 'awaited'`; the awaited path commits the row in its own transaction
      before resolving. Set at all six `scripts/` sites and **pinned by the source-scan census**,
      because `scripts/` is outside tsconfig and no type can reach it. The request path keeps
      `detached` deliberately — the audit chain lock must not serialise mint throughput during a
      jingle burst. Re-measured after the fix: **1 mint → 1 committed row.**
      **RED-verify: one script's `auditMode` removed → 1 failed.**

- [x] **[AI-Review][MEDIUM] M1 — the runbook's R2 reopen trigger contradicted residual R5.** §R2
      read *"a single `(wizard_resume, check_registration_status)` row means AC1's branch is not
      executing"*, but R5 **accepts** that `nin_unavailable` keeps `wizard_resume` on this surface,
      and `statusLinkPurposeFor('nin_unavailable') === 'wizard_resume'` is pinned by a test. The
      first `nin_unavailable` person to check their status would have fired a **false reopen**, and
      an operator following the runbook would have concluded the fix shipped dead. **FIXED:** the
      query is scoped to the statuses AC1 actually claims; a companion query measures R5's accepted
      exposure instead of mistaking it for a defect; the correction is written into the runbook so
      the next reader sees why. [`docs/runbooks/13-50-check-registration-verification.md` §R2]

- [x] **[AI-Review][MEDIUM] M2 — the "loads ALL draft addresses" test asserted nothing.** It checked
      that an address never inserted was absent from the result — true whether the loader reads
      every draft or only the candidates. **RED-verified:** narrowing the draft query to
      `WHERE lower(email) IN (candidates)` — the exact regression its own doc-comment warns "would
      make the detector find nothing and report success" — left **all 12 tests green**. **FIXED:**
      the test now seeds the PROVING longer address and deliberately leaves it out of the candidate
      list, so only a loader that reads every draft can return it.
      **RED-verify: loader re-narrowed → 1 failed.**

- [x] **[AI-Review][MEDIUM] M4 — a declined autosave cancelled nothing.** `scheduleSave` returned
      before `clearTimeout`, so a write armed by an earlier persistable value still fired, closing
      over the address it was scheduled with. Type `a@gmail.com`, backspace inside the 2 s debounce,
      and a draft row is created under an address the registrant has just abandoned — the same "a
      row for somebody who never used it" producer AC4 exists to close, and **invisible to the AC5
      prefix sweep**, because here the abandoned address is the LONGER one. **FIXED:** the guard
      clears the pending timer before returning. [`useWizardDraft.ts:152`]
      **RED-verify: cancel removed → 1 failed.**

- [x] **[AI-Review][MEDIUM] M5 — two files owned by stories that landed the day before were changed
      without being declared.** `campaign-contact.service.ts` is **13-46's**
      (`faa5b8d feat(13-46): cap the SEND, not the SIGNUP`) and took 192 new lines here;
      `respondent-promotion-census.test.ts` was last amended by **13-65** (`5b80249`, which renamed
      a `RAW_UPDATE_SITES` key). The story declared the census edit as 13-55's tripwire — correct as
      far as it goes — and named neither 13-46 nor 13-65 anywhere. **FIXED:** both are declared
      below under *Inherited files touched*, with what changed and why the owning story's contract
      still holds.

- [x] **[AI-Review][LOW] L1 — the linkless email cited a reference code it may not contain.** The
      no-link footer read "Keep the reference above safe" unconditionally, but the reference block
      only renders when `referenceCode` is non-null, and it can be null on this branch (the AC2.2
      trigger test already drives `reference_code: null`). An email citing a reference it never
      printed reads exactly like the "the Registry has lost me" experience this story exists to end.
      **FIXED:** the footer varies on whether a reference was actually printed.

- [x] **[AI-Review][LOW] L2 — the mint census was floored, not pinned, and still counted SITES.** It
      asserted `>= 9` against a measured census of 10, so a mint site could be **deleted** and the
      gate would pass. It also keys entirely off the literal text `MagicLinkService.issueToken`, so
      a destructured or aliased binding evades both the scan and — in `scripts/` — the type:
      [[pattern-census-counts-sites-not-callers]] reappearing inside the guard written to prevent
      it, and precisely what Task 2.1 asked for. **FIXED:** the figure is pinned at exactly 10 with
      a bump-and-say-why comment, and a new assertion fails if any `issueToken(` call in the tree is
      reached off the class binding.
      **RED-verify: a destructured `issueToken` added → 1 failed.**

- [x] **[AI-Review][LOW] L3 — the committed-address boundary was untested.**
      `emailCommitted = latestStepIndex >= 2` is load-bearing: index 1 IS Step 2, so `>= 1` would
      treat somebody still typing on Step 2 as committed and re-open the phantom window. Nothing
      pinned it. **FIXED:** two hook tests drive index 1 and index 2.
      ⚠️ **The first version of the index-1 test passed for the wrong reason** — `setField` schedules
      with the step index captured at call time, so setting index and email in one `act` never
      reached the boundary. Caught by neutering, corrected, and the ordering trap is now written
      into the test itself. **RED-verify (corrected test): `>= 2` → `>= 1` → 1 failed.**

- [ ] **[AI-Review][LOW][RECORD] L4 — one figure in the Debug Log's RED-verify table has drifted.**
      The audit-write neuter is recorded as "**4 failed** / 11 passed"; re-running it today gives
      **4 failed / 21 passed**. The load-bearing half (4) is exact — the denominator moved when the
      census `it.each` rows were added after the table was written. Recorded as a note, not a
      correction: the passing count was never the assertion.

- [ ] **[AI-Review][WITHDRAWN] M3 — "the AC4 gate is client-only, the server has no net". WRONG,
      and withdrawn by the reviewer.** I raised it, implemented a server-side structural gate in
      `saveDraft`, wrote tests for it — and the tests passed with the gate neutered. On checking,
      `saveDraftSchema`'s `z.string().email()` **already rejects** every mid-keystroke address that
      gate would have caught (`a@gmail.c`, `bisi@yahoo.x`, `someone@gmail` rejected; `.co`, `.ng`,
      `.com` accepted). The gate was fully redundant and its test asserted zod's behaviour rather
      than its own — the very defect class this review raised twice against others. **Reverted in
      full: the review's hunk is gone, no `CODE REVIEW` marker remains in the file, and its diff
      against `main` is back to the dev's 48 changed lines.** The residual gap
      is only the typo-dictionary half, which genuinely cannot move server-side: it depends on
      `emailCommitted`, which only the client knows. **The dev's placement was right.** Kept on the
      record rather than deleted, because a review that hides its own wrong call is worth less than
      one that does not.

### Inherited files touched (M5 declaration)

| File | Owning story | What 13-50 changed | Why the owner's contract still holds |
|---|---|---|---|
| `apps/api/src/services/campaign-contact.service.ts` | **13-46** (`faa5b8d`) | +192 lines: `sweepPhantomDrafts`, `loadPhantomSweepContext`, the `draftCohortSweep` option and its counters | Additive and **opt-in**. `filterMarketingCohort`'s existing suppression / gap / dedupe stages are untouched and run in the same order; the sweep is a 4th stage that executes only when a caller sets the flag. 13-46's own `campaign-contact.service.test.ts` (17 tests, DB-backed) passes unchanged, and C2 above added the flag-ON / flag-OFF coverage it did not have. |
| `apps/api/src/services/__tests__/respondent-promotion-census.test.ts` | **13-55** (tripwire) / **13-65** (`5b80249`, last amender) | New `RAW_UPDATE_SITES` entry + pinned figure 6 → 7 | This is the guard **working as designed** — 13-55 R2 closed with "a 7th site reds and someone reads it". 13-65's edit was a different hunk (it renamed `submission-processing.service.ts` → `registration-email-jobs.ts` and left the count at 6), so the two changes do not overlap. Both are on `main` in this worktree, so there is no merge contention. |

## Dev Agent Record

### Context Reference

- Story file: `_bmad-output/implementation-artifacts/13-50-check-registration-dead-end-link-and-resume-token-blindspot.md`
- Project context: `_bmad-output/project-context.md`

### Implementation Plan

**AC1 — the branch.** `registration-status.service.ts` grew an exported pure function
`statusLinkPurposeFor(status)`. `active` / `imported_unverified` → `login`; `pending_nin_capture`
→ `pending_nin_complete`; everything else → `wizard_resume` (unchanged). `handleRequest` calls it,
builds the URL for the SAME purpose it issued, and for the `login` branch first calls
`ensureSignInAccount` (idempotent `provisionPublicUserForWizard` + a `user_id IS NULL`-guarded
stamp). When provisioning fails, the status email still goes out carrying the status text and the
reference code but **no link** — never a link that cannot be redeemed.

**AC2 — the chokepoint.** The `magic_link.issued` audit row moved from 4 callers into
`MagicLinkService.issueToken`, and `trigger` became a required arg typed as a closed union
(`MAGIC_LINK_TRIGGERS`). The 4 duplicate caller-side writes were deleted; the site-specific context
they carried (`milestone`, `priorNin`) rides along in a new `auditDetails` bag.

**AC3 — falsifiability.** See the finding below: the story's reopen trigger could not fire.
`REGISTRATION_NIN_DUPLICATE_BLOCKED` now writes a row at both `NIN_DUPLICATE` throw sites.

**AC4 — the producer.** `isDraftPersistableEmail` gates the first server-side autosave.
`WIZARD_EMAIL_PATTERN` is now exported from one module and imported by Step 2, so "the validation
Step 2 applies" and "the validation the draft gate applies" are the same object.

**AC5 — the sweep.** `sweepPhantomDrafts` (pure) + `loadPhantomSweepContext` (DB), wired into
`filterMarketingCohort` behind an opt-in `draftCohortSweep` flag, and opted into by the three
draft-derived invite blasts.

### Debug Log

**Three findings that changed the work, each of which would have shipped a fix that never fires:**

1. **AC3.2's reopen trigger was watching a table that could not contain its subject.** The story
   records "any `NIN_DUPLICATE` in the audit log from an adopted person. **Currently 0**". Nothing
   wrote such a row: `NIN_DUPLICATE` is thrown as a 409 from `registration.controller.ts` and the
   throw happens *before* any `submissions` insert, so there is no audit row and no submission row
   either. That 0 would have read 0 on a day the dead-end fired a thousand times. Fixed by adding
   `registration.nin_duplicate_blocked` at both throw sites. **The pre-13-50 zero is unknowable and
   must not be quoted as a baseline.**

2. **AC4's preferred fix does not catch AC4's own evidence.** The story asked to "only key a draft
   once the address passes the same validation Step 2 already applies at Continue". That validation
   is `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, which **accepts all four named phantoms** — `a@gmail.co` is a
   well-formed address. The pattern check alone was a no-op against the case that produced the
   story. The gate is the pattern **plus** the typo dictionary the wizard already consults, **plus**
   a minimum-TLD-length rule (a one-character TLD is somebody mid-keystroke; the dictionary is a
   fixed list and cannot cover arbitrary prefixes like `gmail.c`).

3. **AC5.3's already-registered exclusion would have silently emptied two live campaigns** if put
   in the shared filter unconditionally. `_cohort-a-supplemental-survey-blast.ts` and
   `_backfill-registration-autosends.ts` deliberately target people who ARE registered. The sweep is
   therefore opt-in (`draftCohortSweep`) and set only on the three draft-derived invite cohorts.

4. **My own AC5 loader was broken, and only an unrelated test caught it.**
   `loadPhantomSweepContext` first used `= ANY(${canonical})`. Drizzle binds a JS array as ONE
   parameter, so Postgres raised `malformed array literal` on the first real execution — **it would
   have thrown on every draft-derived blast, i.e. on the next jingle-week send.** All 8 sweep unit
   tests stayed green because they exercise the pure `sweepPhantomDrafts` and never touch a
   database; it was `blast-cohort-dedupe.integration.test.ts`, which is about something else
   entirely, that went red. That is catching a defect by luck. Fixed with `sql.join` (one bound
   placeholder per address, matching the `inArray()` calls beside it) and closed properly: 4 new
   DB-backed tests now cover the LOADER, including the empty-list short-circuit (`IN ()` is a
   syntax error, not an empty result). Re-verified by reintroducing the bug — 3 red, restored.

5. **The 13-55 R2 tripwire fired, exactly as it was written to.** That residual closed with the
   words *"A 7th site reds and someone reads it."* `ensureSignInAccount`'s `user_id` stamp is the
   7th raw `UPDATE "respondents"` site; `respondent-promotion-census.test.ts` went red until the
   site was entered **with a reason**, and the pinned figure moved 6 → 7. 13-55's ledger has been
   annotated with what happened, so the count's history stays legible.

**Also recorded:**

- **9-40 has landed.** The story listed the authenticated status home as out of scope with "If 9-40
  lands first, AC1 points at it instead" — `PublicUserHome` (`/dashboard/public`) +
  `useRegistrationStatus` exist and render reference code + current state, so AC1 points at it. The
  destination was not built here.
- **`wizard_resume` was never right at this call site.** `resolveRespondent` only ever returns
  people who already have a respondent row; a genuinely mid-wizard person has no row and never
  resolves here at all. AC1.3's "don't blanket-disable it" is about the other five mint sites, which
  keep it.
- **Prefetch safety (brief's GET-must-not-mutate rule) needs no new work and was verified, not
  assumed:** `GET /auth/magic` PEEKS only (code-review C1, 2026-05-11); the consume is an explicit
  user-driven POST. A Gmail or corporate scanner fetching the emitted URL cannot burn the link.
- **The census is 10 mint sites, not the 9 estimated** — `scripts/_mint-wizard-resume-token.ts` was
  the tenth. 6 of the 10 live in `scripts/`, which is **excluded from tsconfig**, so the required-arg
  type covers only the half that was already audited. The source-scan census test covers the rest,
  and pins the trigger VALUE as well as its presence (a typo'd trigger in a script would otherwise
  compile, run, and write a real row nothing groups on — verified by typo-ing one and watching it
  go red).

**RED-verifies performed (neuter → red → restore by hand → green):**

| What was neutered | Result |
|---|---|
| `statusLinkPurposeFor` forced to `'wizard_resume'` | **8 failed** / 19 passed — including branch-level assertions, not just outcomes |
| the audit write inside `issueToken` | **4 failed** / 11 passed |
| one script's `trigger` typo'd to a non-member | **1 failed** — the value pin bites in `scripts/` |
| `isDraftPersistableEmail` forced to `true` | **13 failed** / 3 passed — all four real phantoms among them |
| `sql.join` reverted to the broken `= ANY(${canonical})` | **3 failed** / 9 passed — the new loader tests bite |

### Completion Notes

Implemented all five ACs. Two decisions were Awwal's (2026-08-23): scope = all five ACs, and the
complete-but-accountless case provisions an account on demand rather than sending no link.

Not done, and deliberately so — see Residuals: the **4 phantom rows are not deleted**. AC4.2 asks to
"clear the 4 AND close the path". The path is closed and the sweep now excludes them from every
draft-derived cohort, so they are operationally inert. Deleting them is a prod row deletion against a
stated keep-forever draft-retention ruling, which is Awwal's call, not mine.

## File List

**API — source**
- `apps/api/src/services/registration-status.service.ts` — AC1 branch, `statusLinkPurposeFor`, `statusCtaLabel`, `ensureSignInAccount`, linkless-email path, resolver now selects `user_id`/`first_name`/`last_name`
- `apps/api/src/services/magic-link.service.ts` — AC2 chokepoint audit, `MAGIC_LINK_TRIGGERS`, required `trigger`, `auditDetails`
- `apps/api/src/services/audit.service.ts` — `AUDIT_TARGETS.MAGIC_LINK_TOKEN`, `AUDIT_ACTIONS.REGISTRATION_NIN_DUPLICATE_BLOCKED`
- `apps/api/src/services/campaign-contact.service.ts` — AC5 `sweepPhantomDrafts`, `loadPhantomSweepContext`, `draftCohortSweep` option, sweep counters + log
- `apps/api/src/controllers/magic-link.controller.ts` — trigger threaded; duplicate audit removed
- `apps/api/src/controllers/registration.controller.ts` — trigger threaded; duplicate audit removed; `NIN_DUPLICATE` audited at both throw sites
- `apps/api/src/workers/reminder.worker.ts` — trigger threaded; duplicate audit removed; `milestone` → `auditDetails`

**API — scripts**
- `apps/api/scripts/nin-reconfirm.ts` — trigger; duplicate txn audit removed; `priorNin`/note → `auditDetails`
- `apps/api/scripts/_draft-adoption-programme.ts` — trigger; `draftCohortSweep: true`; sweep counters + operator print
- `apps/api/scripts/_reengagement-email-blast.ts` — trigger; `draftCohortSweep: true`
- `apps/api/scripts/_recover-abandoned-wizard-drafts.ts` — trigger; `draftCohortSweep: true`
- `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts` — trigger (NO sweep — targets registered people)
- `apps/api/scripts/_mint-wizard-resume-token.ts` — trigger

**Web**
- `apps/web/src/features/registration/lib/draft-email-gate.ts` — **NEW**, AC4 gate + `WIZARD_EMAIL_PATTERN`
- `apps/web/src/features/registration/hooks/useWizardDraft.ts` — autosave gated on the above
- `apps/web/src/features/registration/pages/Step2ContactLga.tsx` — imports the shared pattern instead of re-declaring it

**Tests**
- `apps/api/src/services/__tests__/magic-link.audit.test.ts` — **NEW**, AC2 chokepoint + the source-scan mint census
- `apps/api/src/services/__tests__/phantom-draft-sweep.test.ts` — **NEW**, AC5 sweep rule
- `apps/web/src/features/registration/lib/__tests__/draft-email-gate.test.ts` — **NEW**, AC4 gate
- `apps/web/src/features/registration/hooks/__tests__/useWizardDraft.phantom-drafts.test.ts` — **NEW**, AC4.3 debounced autosave sequence
- `apps/api/src/services/__tests__/registration-status.service.test.ts` — AC1 branch tests
- `apps/api/src/routes/__tests__/magic-link.routes.test.ts` — audit assertion relocated to the chokepoint; asserts the controller does NOT double-write
- `apps/api/src/services/__tests__/audit.service.test.ts` — action count 63 → 64
- `apps/api/src/services/__tests__/magic-link.service.test.ts` — triggers added to 15 `issueToken` calls
- `apps/api/src/services/__tests__/respondent-promotion-census.test.ts` — 13-55 R2 tripwire: `registration-status.service.ts` entered in `RAW_UPDATE_SITES` with a reason; pinned figure 6 → 7

**Docs**
- `docs/runbooks/13-50-check-registration-verification.md` — **NEW**, AC3 post-deploy queries (R1–R4)
- `docs/runbooks/pre-blast-dry-run.md` — AC5 blocking pre-flight gate
- `docs/adjudication-agent-handoff.md` — AC5.4 D4 denominator 75 → 71 (5/71 = 7.0%)

**Code review 2026-08-24 — files changed by the review itself**

- `apps/api/src/services/registration-status.service.ts` — C1 redeemability gate (`loadAccount` +
  the three `loginByMagicLinkToken` conditions); L1 conditional no-link footer
- `apps/api/src/services/magic-link.service.ts` — H2 `auditMode: 'detached' | 'awaited'`; the
  awaited path commits the audit row in its own transaction before resolving
- `apps/api/scripts/nin-reconfirm.ts`, `_draft-adoption-programme.ts`, `_reengagement-email-blast.ts`,
  `_recover-abandoned-wizard-drafts.ts`, `_cohort-a-supplemental-survey-blast.ts`,
  `_mint-wizard-resume-token.ts` — H2 `auditMode: 'awaited'` at all six `scripts/` mint sites
- `apps/web/src/features/registration/hooks/useWizardDraft.ts` — M4 cancel the armed write when the
  address stops being persistable
- `apps/api/src/services/__tests__/registration-status.service.test.ts` — C1: `db.query.users`
  added to the mock; 5 new tests (staff / suspended / deactivated / locked / address-moved)
- `apps/api/src/services/__tests__/phantom-draft-sweep.test.ts` — C2: 3 DB-backed
  `filterMarketingCohort` wiring tests + fixtures; M2: the "loads ALL drafts" test rewritten to bite
- `apps/api/src/services/__tests__/magic-link.audit.test.ts` — H2 `auditMode` census pin; L2 exact
  site figure + the off-binding scan
- `apps/web/src/features/registration/hooks/__tests__/useWizardDraft.phantom-drafts.test.ts` — M4
  cancel test; L3 the index-1 / index-2 boundary
- `docs/runbooks/13-50-check-registration-verification.md` — M1 §R2 scoped to AC1's statuses, plus
  the companion query that measures R5's accepted exposure

⛔ **`apps/api/src/controllers/registration.controller.ts` carries NO review edit.** The review changed
it for withdrawn finding M3 and reverted that change in full — no `CODE REVIEW` marker remains and its
diff against `main` is back to the dev's 48 changed lines.

**Planning**
- `_bmad-output/implementation-artifacts/13-50-…​.md` (this file), `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/13-55-unify-the-three-promote-to-active-paths.md` — R2's "a 7th site reds and someone reads it" annotated with the fact that it did

## Residuals

| # | Item | State | Evidence (re-runnable) | Owner | Reopen trigger |
|---|---|---|---|---|---|
| **R1** | AC3.1 — the dead-end stock must be **0 and stay 0** across a day of jingle traffic | **OPEN — cannot run before deploy** | `docs/runbooks/13-50-check-registration-verification.md` §R1 (both the strict and the wider by-email form) | Operator, post-deploy | Either query > 0. A non-zero on the WIDER form with a zero on the strict one is a **different** defect — a producer minting resume links without binding a `respondent_id`; find the producer, do not just expire the stock |
| **R2** | AC2 — the branch is executing **on prod**, not merely in tests | **OPEN — cannot run before deploy** | §R2 `branch_not_firing` query: rows where `trigger='check_registration_status'` AND `purpose='wizard_resume'` | Operator, post-deploy | Any row. That combination means AC1 shipped and never fired ([[pattern-ship-a-fix-that-never-fires]]) |
| **R3** | AC3.2 — the reopen trigger's **baseline is unknowable before deploy** | **OPEN by construction** | §R3. `registration.nin_duplicate_blocked` did not exist until this story; the story's "currently 0" came from a table that could not hold the row | Operator, post-deploy | Any row joined to `metadata->>'adopted_by'='13-49'`. ⛔ Do NOT quote the pre-13-50 zero as a baseline — the true baseline starts at deploy |
| **R4** | AC4.2 — the **4 phantom draft rows are not deleted** | **OPEN — Awwal's ruling** | `SELECT a.email AS phantom, b.email AS real_address FROM wizard_drafts a JOIN wizard_drafts b ON b.email LIKE a.email \|\| '%' AND b.email <> a.email;` | Awwal | Deletion is a prod row deletion against the stated keep-forever draft-retention ruling, so it is not mine to make. The **producer is closed** (AC4) and the **sweep excludes them** from every draft-derived cohort (AC5), so they are operationally inert either way |
| **R5** | `nin_unavailable` still receives `wizard_resume` from this surface | **OPEN — accepted, no owner** | `statusLinkPurposeFor('nin_unavailable') === 'wizard_resume'`, pinned by a test | — | The 9-12 ladder refuses that status (`allowedStatuses: ['pending_nin_capture']`) and no other surface exists for it today, so this story left it UNCHANGED rather than routing it somewhere wrong. Reopen if a `nin_unavailable` person reports a dead end, or when 9-40 gains a self-serve NIN path |
| **R6** | The `login` magic link carries a **15-minute TTL** | **OPEN — accepted, no owner** | `TTL_MS_BY_PURPOSE.login` in `magic-link.service.ts` | — | A status email read more than 15 minutes after it arrives lands on "This link has expired — request a new one", which is graceful and honest but is still a wasted round trip. Not changed here: `login`'s TTL is a security constant shared with `/login`, and shortening the blast radius of this story mattered more. Reopen if expired-link complaints appear during the jingle |
| **R7** | The 26 other `targetResource: 'users'` (plural) sites inherited from 13-51 | **OPEN — pre-existing, unchanged** | The 13-51 census comment in `AUDIT_TARGETS` | — | Untouched by this story; `MAGIC_LINK_TOKEN` was added singular-canonical alongside them. Historical `magic_link_tokens` (plural) rows stay as written — `audit_logs` is append-only |
| **R8** | C1 — a completed registrant whose address carries a **non-`public_user`** account now gets a LINKLESS status email. Safe, but they still cannot reach their record self-serve | **OPEN — accepted, cannot be sized before deploy** | `SELECT count(*) FROM respondents r JOIN submissions s ON s.respondent_id=r.id JOIN users u ON lower(u.email)=lower(s.raw_data->>'email') JOIN roles ro ON ro.id=u.role_id WHERE r.status IN ('active','imported_unverified') AND ro.name <> 'public_user';` — plus `registration_status.account_not_redeemable` in the logs, which names the reason (`locked` / `suspended` / `not_public_user`) | Operator, post-deploy | Any volume of `registration_status.account_not_redeemable` with `reason=not_public_user`. The pre-C1 behaviour was WORSE (a burnt token and "Let's get you registered first"), so this is strictly an improvement — but if the count is non-trivial these people need a real destination, which is 9-40 work, not this story's |
| **R9** | AC5's prefix rule can in principle drop a LEGITIMATE address whose longer sibling exists — `x@firm.com` is a strict prefix of `x@firm.com.ng` | **OPEN — accepted, unmeasured on prod** | `SELECT a.email AS would_be_dropped, b.email AS proving_address FROM wizard_drafts a JOIN wizard_drafts b ON b.email LIKE a.email \|\| '%' AND b.email <> a.email WHERE split_part(a.email,'.',array_length(string_to_array(a.email,'.'),1)) NOT IN ('c','co','cm','om','con','come');` — anything this returns is a candidate false positive rather than a phantom | Operator, next pre-blast dry-run | A row whose `would_be_dropped` address is a plausible real address (a ≥2-char TLD that is not a known typo). The sweep **logs and prints every exclusion** (AC5.2), so this fails loudly rather than silently — read the dry-run's `🫥` block before firing |

## Change Log

| Date | Change |
|---|---|
| 2026-08-23 | AC1 — `/check-registration` branches on registration completeness; a complete registrant is emailed a `login` link to 9-40's status home, or a linkless status email if no account can be provisioned. RED-verified. |
| 2026-08-23 | AC2 — `magic_link.issued` moved into `MagicLinkService.issueToken`; `trigger` required; census 10 sites / 4 audited → 10 / 10. Source-scan census test covers `scripts/` (outside tsconfig). RED-verified. |
| 2026-08-23 | AC3 — post-deploy verification runbook added. **Found + fixed:** the story's reopen trigger was unfalsifiable; added `registration.nin_duplicate_blocked` (audit actions 63 → 64). |
| 2026-08-23 | AC4 — phantom-draft producer closed at the first autosave. **Found:** Step 2's own validation accepts all four named phantoms, so the gate also uses the typo dictionary + a min-TLD rule. RED-verified. |
| 2026-08-23 | AC5 — phantom sweep at the shared cohort filter, opt-in per campaign (unconditional would have emptied two live campaigns). Blocking pre-flight added to the runbook. D4 denominator corrected 75 → 71. |
| 2026-08-23 | Suite run surfaced two things. **(a)** The AC5 loader's `= ANY(${…})` threw `malformed array literal` against real Postgres — it would have broken every draft-derived blast; fixed with `sql.join` and covered by 4 new DB-backed loader tests. **(b)** 13-55 R2's tripwire fired on the 7th raw `UPDATE "respondents"` site; entered with a reason, figure 6 → 7, 13-55's ledger annotated. |
| 2026-08-24 | **Adversarial code review (Claude, BMAD `code-review`), on the uncommitted tree.** 12 findings, 11 applied + 1 withdrawn as wrong. Three HIGH: **C1** the `login` link was minted for accounts `loginByMagicLinkToken` will refuse (staff / suspended / locked / moved address) — reproduced on real Postgres, ending in "Let's get you registered first", the exact second dead-end Task 1.3 forbids; **C2** AC5's `draftCohortSweep` wiring had ZERO test cover — neutering the branch left 29/29 green; **H2** the chokepoint audit is detached and `scripts/` `process.exit()` drops it — measured 3 mints → 0 committed rows, and it had silently downgraded `nin-reconfirm.ts`'s awaited `logActionTx`. |
| 2026-08-24 | Review verification, done rather than accepted: all five of the dev's RED-verifies re-run and all five reproduce (8/4/1/13/3). AC1 proven by DRIVING the real path (seeded `active` respondent → `login`, one committed audit row, 409 unreachable), which also executed the changed `resolveRespondent` SQL that every unit test mocks past. GET-must-not-mutate confirmed at the route: `GET /auth/magic` → `peekToken`, no write. Suite figures re-measured and both matched the story exactly (api 305/4300, web 275/3045). |
| 2026-08-24 | Post-fix gates, re-measured by the reviewer: **api 305 files / 4316 passed**, **web 275 files / 3048 passed**, uncached and against `app_test`; `tsc` clean api + web; `eslint` clean on every changed file. Every fix RED-verified. One finding (**M3**, "the AC4 gate has no server net") was raised, implemented, and then WITHDRAWN and reverted in full — `z.string().email()` already rejects every address it would have caught, and its test passed with the gate neutered. `registration.controller.ts` carries no review edit — its diff against `main` is back to the dev's 48 lines. |

## Closing verdict

**Deploy SHA: ⏳ PENDING**

**Outcome: CHANGES REQUESTED → APPLIED. Status stays `review`** (§2a0 — `done` is reserved for a
real deploy SHA with every residual resolved; R1–R3 and R8–R9 below discharge only on prod).

**What the review actually established, separated from what it accepted:**

- **AC1 holds, proven by execution rather than by reading the branch.** A seeded `active` respondent
  with `user_id NULL` was driven through the real `RegistrationStatusService.handleRequest` against
  real Postgres: purpose `login` (never `wizard_resume`), account provisioned as `public_user`,
  `respondents.user_id` stamped, and **exactly one `magic_link.issued` row committed** carrying
  `trigger=check_registration_status`. This also executed the CHANGED `resolveRespondent` SQL — the
  new `user_id`/`first_name`/`last_name` columns and GROUP BY — which every unit test mocks past.
  The 409 `NIN_DUPLICATE` path is unreachable from this surface.
- **AC2 holds on the request path, and did NOT hold in `scripts/` until H2.** Measured: 3 mints → 0
  committed rows. Now 1 → 1.
- **GET-must-not-mutate holds, verified independently.** `GET /auth/magic` routes to
  `MagicLinkController.redeemMagicLink`, which calls `peekToken` — a `findFirst` with no write. The
  `used_at` UPDATE lives in `redeemToken`, reachable only from `POST /auth/magic/consume` and
  `POST /auth/magic/login`. A scanner prefetching the emitted URL cannot burn the link.
- **All five of the dev's RED-verify claims reproduce exactly** (8 / 4 / 1 / 13 / 3 failures). The
  dev's record is reliable; the gaps this review found were in what the tests *could* fail on, not
  in what the dev claimed.

**Gates, re-measured by the reviewer after the fixes — never quoted from the dev:**

| Gate | Before review | After fixes |
|---|---|---|
| api suite (uncached, direct vitest, `NODE_ENV=test` + `app_test`) | 305 files / 4300 passed | **305 files / 4316 passed** (+16) |
| web suite (uncached; 275 files collected BOTH times — so neither run was contended) | 275 files / 3045 passed | **275 files / 3048 passed** (+3) |
| `tsc --noEmit` api + web | clean | clean |
| `eslint` on every changed source file | clean | clean |

⚠️ **One environment note for the next runner.** The root `.env` `DATABASE_URL` points at `app_db`,
and `test/db-guard.ts` no-ops outside `NODE_ENV=test` — so a bare `pnpm vitest run` in this worktree
runs DB-backed tests against the DEV database. Every suite figure above was taken with
`NODE_ENV=test DATABASE_URL=…/app_test`.

## For the adjudication agent

Everything below is here so you can **re-run rather than believe**. The review that produced it did
not accept a single figure from the dev, and you should extend it the same courtesy.

### 0. Read this first

- ~~**Nothing is committed.** 31 working-tree entries, `git rev-list --count main..HEAD` = **0**.~~
  **SUPERSEDED 2026-08-25** — committed as `b4fc562`, then rebased onto `de41f5f` (clean, no
  conflicts) as **`9f559cc`**. Branch `story/13-50-check-registration-dead-end`, worktree
  `C:\Users\DELL\wt-13-50`. Struck rather than deleted: a handoff that quietly rewrites its own
  starting state is worth less than one that shows the move.
- **Status is `review` and must stay there** until a real deploy SHA exists (§2a0). R1–R3 and R8–R9
  discharge only on prod.
- ⚠️ **The root `.env` `DATABASE_URL` points at `app_db`, not a test DB**, and `test/db-guard.ts`
  no-ops outside `NODE_ENV=test`. A bare `pnpm vitest run` here runs DB-backed tests against the
  **dev** database. The reviewer did this once before noticing. Always:
  ```
  NODE_ENV=test DATABASE_URL=postgres://user:<pw>@localhost:5432/app_test
  ```
- Machine rule: **one vitest at a time across all worktrees**, free RAM > 3 GB. The full web suite
  takes ~11 min, api ~5 min. Compare the **file count** (275 web / 305 api), not the pass count — a
  contended web run silently collects fewer files.

### 1. The gates, and the exact commands that produced them

```bash
# api — 305 files / 4316 passed
cd apps/api && NODE_ENV=test DATABASE_URL=…/app_test pnpm vitest run

# web — 275 files / 3048 passed   (275 files BOTH before and after ⇒ neither run was contended)
cd apps/web && pnpm vitest run

# types + lint — clean on both packages
cd apps/api && npx tsc --noEmit -p tsconfig.json
cd apps/web && npx tsc --noEmit -p tsconfig.json
npx eslint <each changed source file>
```

### 2. The dev's five RED-verify claims, re-run by the reviewer

All five reproduce. **The dev's record is reliable** — the defects this review found were in what
the tests *could* fail on, not in what the dev said.

| Neuter | Claimed | Re-measured | Verdict |
|---|---|---|---|
| `statusLinkPurposeFor` forced to `'wizard_resume'` | 8 failed / 19 passed | **8 failed / 19 passed** | exact |
| the audit write inside `issueToken` deleted | 4 failed / 11 passed | **4 failed / 21 passed** | failures exact; denominator drifted (see L4) |
| one script's `trigger` typo'd off the union | 1 failed | **1 failed** | exact |
| `isDraftPersistableEmail` forced `true` | 13 failed / 3 passed | **13 failed / 3 passed** | exact |
| `sql.join` reverted to `= ANY(${…})` | 3 failed / 9 passed | **3 failed / 9 passed**, with the same `malformed array literal` | exact |

### 3. The review's OWN fixes, each RED-verified

Neuter → watch it fail → restore by hand → re-run green. If you re-do these, restore from `git`
rather than by memory.

| # | Fix | Neuter applied | Result |
|---|---|---|---|
| **C1** | redeemability gate in `ensureSignInAccount` | `const unredeemable = …` → `null` | **4 failed / 28 passed** |
| **C2** | `filterMarketingCohort` wiring tests | `if (options.draftCohortSweep)` → `if ((false as boolean) && …)` | **2 failed / 13 passed** (was 0 failed / 29 passed before the fix) |
| **H2** | `auditMode: 'awaited'` + census pin | removed `auditMode` from one script | **1 failed / 30 passed** |
| **M2** | "loads ALL drafts" test rewritten | draft query narrowed to `IN (candidates)` | **1 failed / 14 passed** (was 0 failed / 12 passed before) |
| **M4** | cancel the armed autosave timer | deleted the `clearTimeout` block | **1 failed / 8 passed** |
| **L2** | off-binding census scan | added `const { issueToken } = MagicLinkService` | **1 failed / 32 passed** |
| **L3** | committed-address boundary | `latestStepIndex >= 2` → `>= 1` | **1 failed / 8 passed** |

**H2 was also verified functionally, not just by test count** — this is the strongest single piece
of evidence in the review:

```
auditMode: 'detached'  (as shipped)  → 3 tokens minted, 0 audit rows committed
auditMode: 'awaited'   (the fix)     → 1 token  minted, 1 audit row  committed
```

### 4. The three brief-priority checks, and how to re-drive them

The probes were deliberately deleted after use (they seed and tear down rows). Recreate them under
`apps/api/scripts/_probe.ts`, run with tsx, then delete.

**(a) AC1 — a completed registrant gets a `login` link, not `wizard_resume`.** This also executes
the CHANGED `resolveRespondent` SQL (`user_id` / `first_name` / `last_name` + GROUP BY) that every
unit test mocks past — the [[feedback_raw_sql_schema_drift]] risk.

```ts
// seed: respondents(status='active', user_id NULL) + submissions.raw_data->>'email'
//       (questionnaire_form_id carries no FK — a gen_random_uuid() is fine)
await RegistrationStatusService.handleRequest({ identifier: EMAIL, ipAddress: '127.0.0.1', userAgent: 'probe' });
// then read back:
//   magic_link_tokens.purpose            → expect 'login'      (never 'wizard_resume')
//   users JOIN roles                     → expect 'public_user', status 'active'
//   respondents.user_id                  → expect stamped
//   audit_logs where action='magic_link.issued'
//                                        → expect exactly 1, trigger='check_registration_status'
```
Observed: `login` / `public_user` / stamped / **exactly one committed audit row**. The 409
`NIN_DUPLICATE` path is unreachable from this surface.

**(b) C1 — the same path when the address already carries a NON-`public_user` account.** Seed a
`users` row with role `enumerator` for the same address, then run the same call and redeem the link
through `AuthService.loginByMagicLinkToken`.

Observed **before the C1 fix**: link minted, `respondents.user_id` stamped with the **enumerator's**
id, redemption → `AUTH_INVALID_CREDENTIALS: Please use the staff login for staff accounts`, which
`MagicLinkLandingPage.tsx:394-400` renders as **"Let's get you registered first" + a Register CTA**.
After the fix: no token of any purpose, linkless status email instead.

**(c) GET must not mutate.** No probe needed — read the route table. `GET /auth/magic` →
`MagicLinkController.redeemMagicLink` → `MagicLinkService.peekToken` (a `findFirst`, no write). The
`used_at` UPDATE lives in `redeemToken`, reachable only from `POST /auth/magic/consume` and
`POST /auth/magic/login`. A scanner prefetching the emitted URL cannot burn the link. ✅

### 5. What is YOURS to rule on

None of these were decided by the review. Each needs a ruling, not an opinion.

| # | Decision | Why it is not the reviewer's |
|---|---|---|
| **R4** | Delete the 4 phantom `wizard_drafts` rows, or leave them | A prod row deletion against a stated keep-forever retention ruling. Awwal's, and unchanged by this review. The producer is closed and the sweep excludes them, so they are operationally inert either way |
| **R8** | Do completed registrants whose address carries a staff/suspended account need a real destination? | C1 made the failure SAFE (linkless email instead of a burnt token and a "register first" screen) but not SOLVED. A real answer is 9-40 work, not this story's. Size it with the R8 query before deciding |
| **R9** | Does the prefix rule need a TLD-aware refinement before the next blast? | `x@firm.com` is a strict prefix of `x@firm.com.ng`. Unmeasured on prod; the R9 query measures it. The sweep prints every exclusion, so this fails loudly, not silently |
| **H2 default** | Should the request path keep `auditMode: 'detached'`? | The reviewer chose `detached` there deliberately: the audit chain lock is global, and making every mint block on it during a jingle burst is the throughput risk 13-65 exists to avoid. That is an architecture trade, and reasonable people could rule the other way |
| **L4** | Accept or correct the drifted "4 failed / 11 passed" figure in the Debug Log | The load-bearing half (4) is exact; only the denominator moved. Left as a note rather than edited into the dev's own record |

### 6. The reviewer's own errors, recorded on purpose

A review that hides its own wrong calls is worth less than one that does not — and each of these is
the same defect class the review was raising against others.

1. **M3 was WRONG and is withdrawn.** I claimed the AC4 gate had no server-side net, implemented one
   in `saveDraft`, wrote tests — and **the tests passed with the gate neutered**.
   `saveDraftSchema`'s `z.string().email()` already rejects every mid-keystroke address it would
   have caught (`a@gmail.c`, `bisi@yahoo.x`, `someone@gmail` rejected; `.co`, `.ng`, `.com`
   accepted). Reverted in full — no `CODE REVIEW` marker remains in
   `registration.controller.ts` and its diff against `main` is back to the dev's 48 lines.
   **The dev's client-side placement was right:** the typo-dictionary half depends on
   `emailCommitted`, which only the client knows.
2. **My first L3 test passed for the wrong reason.** `setField` schedules with the step index
   captured at call time, so setting the index and the email in one `act` never reached the
   boundary at all. Caught only by neutering it. Corrected, and the ordering trap is now written
   into the test body so the next person does not repeat it.
3. **I twice wrote a suite figure into this file before measuring it.** Both were replaced with
   `⏳ PENDING` and filled in only after the run landed. Flagged because it is exactly the failure
   R3 and finding M1 are about — a number that reads as evidence but was never observed.

### 7. The one-line summary

The dev's work is sound and their record is honest — all five of their RED-verifies reproduce, and
AC1/AC2/AC4/AC5 do what the story says. What the review found was **three guards that could not
fail**: an account check testing the wrong predicate, an AC5 wiring branch with no test at all, and
an audit write that was called but never committed in six of ten mint sites. All three are fixed and
RED-verified. **Nothing is committed; the tree is ready for your read.**

## 🧑‍⚖️ ADJUDICATION — 2026-08-25

Gates re-run independently, not accepted from the review. Every figure below was observed.

| Gate | Result |
|---|---|
| Rebase onto `de41f5f` | clean, no conflicts → **`9f559cc`** |
| **API suite** (`NODE_ENV=test`, `app_test`, from `apps/api`) | **305 files · 4,323 passed · 0 failed** — file count matches the handoff's 305 exactly, so uncontended |
| `tsc` api / web / types | **0 / 0 / 0** |
| eslint + 3 drift guards | **0 errors** · 393 files · 321 stories |
| Web suite (3.35 GB free, Firefox closed) | 275 files · 3,047 passed · **1 pre-existing flake** (see below) |

### ⭐ Independent RED-verify — C1, the security-relevant fix

Neutering the redeemability gate (`const unredeemable = … : null` → `null`) reds **exactly four
tests — 4 failed / 28 passed**, reproducing the reviewer's figure precisely:

```
× a STAFF account on the same address gets a LINKLESS status email, never an unredeemable login link
× a SUSPENDED account …
× a DEACTIVATED account …
× a LOCKED account …
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
```

Each asserts **no token is minted**; with the gate gone, one is. That is the property itself, not a
proxy for it. Restored via `git checkout --` (not by memory), re-run **32/32**.

### The web flake is NOT this story's — and it breaks two of our own heuristics

`a3-eslint-policy > rejects CSS class selectors` failed in two full-suite runs and passes in
isolation. **It lints a SYNTHETIC STRING** (`"document.querySelector('.foo')"`) and never scans real
files — so this story's two new web test files cannot reach it. It is the documented pre-existing
flake on this machine.

⚠️ **But it failed at 3.35 GB free and with the full 275-file count.** Both of our stated tells
therefore FAILED to fire:
- *"free RAM > 3 GB"* — it was 3.35 GB.
- *"compare the file count, not the pass count — a contended run collects fewer files"* — all 275
  were collected and a test still failed.

→ **A healthy file count no longer clears a run of contention**, and 3 GB is not a sufficient
threshold. Tracked as its own debt item, not carried by this story.

### The five rulings

| # | Ruling | Evidence (measured on prod 2026-08-25) |
|---|---|---|
| **R4** | ✅ **LEAVE the 4 phantom drafts.** No prod deletion. | All four expire **2026-12-28** (125 days out), created 2026-05-19–23, all still at `current_step` 2. Deleting rows against a keep-forever retention ruling, to remove something that removes itself, is not a trade worth making. They are inert (producer closed by AC4, sweep excludes them by AC5) and are the only real specimens of the pattern — useful for validating the sweep at the next dry-run. |
| **R8** | ✅ **KEEP C1. Close as MEASURED-ZERO.** Not 9-40 work today. | `r8_non_public_user` = **0**. The only intersecting accounts are **127 `public_user` / `active`**. C1 stays regardless of population: it asks the only correct question — *will `loginByMagicLinkToken` accept this account for this address* — and costs nothing at zero volume. **Reopen** on any `registration_status.account_not_redeemable` with `reason=not_public_user`. |
| **R9** | ✅ **NO TLD refinement needed.** Close as ACCEPTED-and-measured. | The TLD-aware query returns **0 rows** across **284 live drafts**. The 4 it does catch are all genuine mid-typing (`…@gmail.co` → `…@gmail.com`). Re-run before each blast; the sweep prints every exclusion. |
| **H2 default** | ✅ **KEEP `auditMode: 'detached'` on the request path.** | The loss mode is process-exit mid-flight. The API is long-lived under PM2; `scripts/` — which *do* exit — are pinned to `'awaited'` and held there by the source-scan census. The audit chain lock is **global**, so awaiting every mint would serialise the request path behind it during exactly the burst 13-65 moved sends off that path to survive. The downside is bounded and detectable: a missing audit row, never a failed mint or a security bypass. **Reopen trigger:** post-deploy, compare tokens minted in `magic_link_tokens` against `magic_link.issued` audit rows over the same window — a material undercount reverses this ruling. |
| **L4** | ✅ **ACCEPT the note. Do NOT edit the dev's Debug Log.** | The load-bearing half (4 failures) is exact; only the denominator moved, and the reviewer already recorded it as a note. Rewriting someone's own measurement record after the fact is worse than annotating it. |

### ⭐ Both zeros are REAL negatives — checked on purpose

R8 and R9 each returned 0, and this story is the one that caught *"an empty result read as a
negative result"* (AC3.2). So each query was run in an unfiltered form first to prove it **can**
return rows: the R9 join returns **4**, the R8 join returns **127**. Neither zero is the
unfalsifiable kind. → [[pattern-numeric-gate-fails-open-on-undefined]]

### Verdict

**NOT CLOSED — status stays `review`. Deploy SHA: ⏳ PENDING.**
R1–R3 and R8–R9 discharge only on prod (§2a0). The dev's work and the review's fixes both hold up
under independent re-measurement: all gates green, the one load-bearing RED-verify reproduces
exactly, and the three prod residuals I could size came back **0 / 0 / inert**.

## Notes for whoever picks this up

- **Not launch-gating, but it degrades with engagement** — the opposite of most backlog items. Every
  adopted person who checks their status adds one. Volume grows with the thing we want more of.
- Sibling of [[pattern-ship-a-fix-that-never-fires]]: there the fix never executes; here the fix
  executes and the condition regenerates behind it. **Ask of any stock-clearing remediation: what
  produces these?** — before calling it done.

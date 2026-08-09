# Story 13.55: Five promote-to-active paths, five different rules

Status: done

<!-- EMERGENT 2026-08-07 from the 13-53 adversarial review (T2). Recorded while the reasoning was
fresh, deliberately NOT bundled into 13-54 — that story stops new un-guarded writes; this one
consolidates the paths that already exist.

AUTHORED 2026-08-08 by Bob (SM) via the canonical *create-story workflow, against the real tree at
b7af5b9. The shell's premise was THREE paths; the codebase holds FIVE, and the two the shell missed
are the two carrying the live observability defects. The title was corrected rather than preserved.
Sources: the five implementations themselves (cited per-AC below), 13-54 Known limits #1/#4/#6,
13-53's review H1/H2/M1/L3 rationale, and a measured `update(respondents)` census. -->

## Story

As **a maintainer**,
I want **one promote-to-active implementation**,
so that **the next divergence between them is impossible rather than merely unlikely.**

## Context — 13-53's own thesis, one level up

There are now **five** paths that fill a NIN and flip a respondent toward `active`, and they
disagree. The shell for this story said three; the census below is what is actually on disk.

| # | path | status scope | identity key | audit action + trigger | audit atomic with the UPDATE? |
|---|---|---|---|---|---|
| 1 | `RegistrationController.completeNin` (magic link) | `pending_nin_capture` | the token itself | `pending_nin.promoted` / `magic_link_complete_nin` | ❌ `logAction`, **after** the tx closed |
| 2 | `SubmissionProcessingService.tryRaceResolutionMerge` | `pending_nin_capture` | STRICT `lower(first)+lower(last)+phone` | `pending_nin.promoted` / `race_resolution_merge` | ❌ `logAction`, and the UPDATE runs on `db.execute` with **no transaction at all** |
| 3 | `promoteRespondentWithArrivingNin` (13-53) — wizard caller | `pending_nin_capture` · `nin_unavailable` · `active` | phone + **≥2 shared tokens** | `pending_nin.promoted` / `nin_arrival_identity_match` | ✅ `logActionTx` |
| 3b | `promoteRespondentWithArrivingNin` — queue caller | same | same | `pending_nin.promoted` / **`nin_arrival_identity_match`** | ❌ `logAction` |
| 4 | `draft-adoption/promoteRespondentNin` (13-49 AC14) | **`nin_unavailable` only** | email → draft pairing | `pending_nin.promoted` / `draft_adoption_ac14` | ✅ `logActionTx` |
| 5 | `MeService.completeNinAuthenticated` (9-61) | `pending_nin_capture` | session `userId` | **`respondent.self_nin_completed`** / `authenticated_dashboard_nin` | ✅ `logActionTx` |

**That divergence IS what review finding H1 was.** 13-53 aligned the new path's status scope and
deliberately stopped there, because unifying implementations is a refactor, not a review fix.

13-53's own sentence applies here verbatim:

> *a second copy of the matching rule is how these two mechanisms grew a seam in the first place.*

**Five copies of the promote is that sentence waiting to be written a third time.**

### Three things the census found that the shell did not

1. ⚠️ **Path 5 writes a DIFFERENT AUDIT ACTION, so it is invisible to every promote count we have.**
   `respondent.self_nin_completed` is not `pending_nin.promoted`
   [Source: apps/api/src/services/audit.service.ts:119,187]. `reconcile-nin-promotion-audit.ts`
   filters on `PENDING_NIN_PROMOTED` alone [Source: apps/api/scripts/reconcile-nin-promotion-audit.ts:80,90],
   and 13-44 AC-T4 — the digest PAIR that 13-53's R2 watch was handed to — is specified against the
   same action. **A person who completes their NIN from their own dashboard promotes silently.**
   This is [[pattern-monitor-measuring-something-else]] with a fifth entry, and it was found by
   reading the writers rather than the monitor.
2. ⚠️ **Paths 3 and 3b write the SAME trigger from two different code paths.** The shell's AC1.3
   requires that "the audit trail must still say WHICH route promoted someone" — it already cannot.
   `nin_arrival_identity_match` is written by both the wizard controller
   [Source: apps/api/src/controllers/registration.controller.ts:1078] and the queue service
   [Source: apps/api/src/services/submission-processing.service.ts:698]. The requirement is not
   aspirational for this refactor; it is **already breached** and this story is where it is repaid.
3. ⚠️ **Two of the five promotes are RAW SQL, so 13-54's successor guard would not see them.**
   13-54 Known limit #1 hands `update(respondents)` to this story and counts 12 files. Measured on
   this tree: **14 files** match `.update(respondents)` (12 excluding the guard's own two), **plus
   6 more** matching raw `UPDATE "respondents"` — among them `respondent-identity.ts` and
   `submission-processing.service.ts`, i.e. **the promote paths themselves**. Any future update-guard
   written only against the Drizzle spelling is a guard that cannot see the thing this story is about.

## Acceptance Criteria

### AC1 — One implementation; callers keep their own knowledge

1. A single promote used by all five, taking the **status scope** and the **identity key** as
   INPUTS. The callers differ legitimately — a magic-link token is stronger evidence than a
   name-token overlap, and should be allowed to say so.
2. ⚠️ **Do not flatten the differences into one rule.** The token path SHOULD be permitted a wider
   status scope than a fuzzy name match; collapsing them would either loosen the fuzzy path
   (dangerous) or tighten the token path (breaks the 9-12 ladder). **The goal is one code path with
   explicit parameters, not one policy.**
3. `PENDING_NIN_PROMOTED` keeps a distinguishing `trigger` — the audit trail must still say WHICH
   route promoted someone. Per Context finding #2 this means **repairing** the collision between
   paths 3 and 3b, not merely preserving what is there.
4. The unified promote is the ONLY place that writes `respondents.nin` together with
   `status = 'active'`. After this story, a census of that pairing returns exactly one site.
5. Every caller's status scope is passed explicitly at the call site and is **narrower than or equal
   to** its current scope. Widening any caller's scope is out of scope for this story and must be
   raised separately.

### AC2 — Prove no behaviour changed

1. Each existing path keeps its current tests, **unchanged**, and they pass against the unified
   implementation. **A refactor whose tests were edited alongside it has proved nothing.** The
   protected files are named in Dev Notes → *The tests that must not be edited*.
2. RED-verify the consolidated promote **once**, rather than three times: break the unified
   implementation deliberately, confirm the suite reds, restore it. Record which tests failed and
   which did not — a path whose tests stay green while the promote is broken is a path with no
   coverage, and that is a finding to report, not to fix silently.
3. Where AC3 makes a deliberate change, its test change is listed in AC3 with a reason. Any test
   edit **not** on that list is a violation of AC2.1.

### AC3 — The deliberate convergences, each listed and individually justified

These are the divergences that are defects rather than caller knowledge. Each is a real change and
must be argued at the call site, not smuggled in as "cleanup".

1. **The audit becomes atomic with the UPDATE on every path.** Paths 1, 2 and 3b use
   `AuditService.logAction`, which returns `void` and cannot be awaited
   [Source: apps/api/src/controllers/registration.controller.ts:284;
   apps/api/src/services/submission-processing.service.ts:1023,693]. Paths 3, 4 and 5 already use
   `logActionTx` inside the transaction. Converge on `logActionTx`, so a promote cannot exist
   without its trail — the NDPA-forensics argument 13-53 already made at
   `registration.controller.ts:1067`, and [[pattern-void-helper-loses-last-batch-row]] one server
   removed. **Path 2 has no transaction at all and must be given one.**
2. **`nin IS NULL` is asserted in the UPDATE on every path.** Paths 2, 3 and 4 assert it; paths 1
   and 5 filter on status only [Source: apps/api/src/controllers/registration.controller.ts:259-264;
   apps/api/src/services/me.service.ts:629]. The invariant "`pending_nin_capture` implies no NIN" is
   true today and enforced nowhere, so paths 1 and 5 rely on it rather than checking it. The
   predicate is the concurrency control as well as the refusal (13-53's reasoning at
   `respondent-identity.ts:220-227`).
3. **Path 5 writes `PENDING_NIN_PROMOTED`** with `trigger: 'authenticated_dashboard_nin'`, closing
   Context finding #1. ⚠️ **Keep `RESPONDENT_SELF_NIN_COMPLETED` as well** — 9-61 shipped it, it may
   have consumers, and dropping an audit action is a separate decision from adding one. Two rows,
   one transaction; the promote count becomes true without any existing query becoming false.
4. **Paths 3 and 3b get distinct triggers** (e.g. `nin_arrival_wizard` / `nin_arrival_queue`),
   closing Context finding #2 and satisfying AC1.3.
5. **NULL-fill contributions are decided per caller, not per implementation.** 13-53's `COALESCE`
   fills for `reference_code` / `date_of_birth` / `lga_id`
   [Source: apps/api/src/services/respondent-identity.ts:278-289] exist because a full registration
   can know things the held record does not. Paths 1, 2 and 5 are *completions*, not registrations —
   they carry a NIN and nothing else — so they pass none. State this at each call site rather than
   leaving the asymmetry to be re-discovered.
6. ⚠️ **Path 4 keeps its `nin_unavailable`-only scope and its FR21 clash pre-check**
   [Source: apps/api/src/services/draft-adoption/promote-nin.ts:124-137]. It is a batch operator
   path that reports per-row outcomes instead of throwing; widening it to the NIN-lifecycle statuses
   would let a months-old draft promote a `pending_nin_capture` row behind the ladder's back. **This
   is the clearest case of legitimate caller knowledge in the set — do not "harmonise" it.**

### AC4 — The census is recorded, and the next guard is told what to look for

1. Record the measured `respondents`-update census in the story's Completion Notes: the Drizzle
   spelling AND the raw-SQL spelling, with file counts, before and after.
2. The post-refactor count of sites writing `nin` + `status='active'` together is stated as a
   number, and it is the AC1.4 census.
3. 13-54's Known limit #1 is updated in `13-54-respondent-write-chokepoint-ci-guard.md` to record
   that an update-guard must match **both spellings**, with this story's measurement as the
   evidence. ⚠️ Do NOT build that guard here — 13-54's own conclusion is that the answer to its
   limit #6 is *fewer sanctioned writers*, which is this refactor, not another allowlist.

### AC5 — No new dependencies, no new migrations, no schema change

1. This is a pure consolidation of existing code. Any need for a new dependency, a Drizzle
   migration, or a `respondents` column is a signal the design has drifted — **HALT and raise it**
   rather than shipping it inside a refactor whose whole claim is that nothing changed.

## Tasks / Subtasks

- [x] **Task 0 — Measure before touching anything** (AC: #4)
  - [x] 0.1 Census both spellings: `grep -rln "update(respondents)" apps/api/src apps/api/scripts`
        and `grep -rln 'UPDATE "respondents"' apps/api/src apps/api/scripts`. Record both lists.
  - [x] 0.2 Census the promote specifically: every site writing `nin` together with
        `status = 'active'`. Expect the five (six call sites) in the Context table; **if the count
        differs, the table is stale and the new site is the finding** — record it before proceeding.
  - [x] 0.3 Run the seven protected test files listed in Dev Notes and record the passing counts.
        This is the AC2.1 baseline; a number captured after the refactor proves nothing.
- [x] **Task 1 — Design the unified signature** (AC: #1)
  - [x] 1.1 Generalise `promoteRespondentWithArrivingNin` in
        `apps/api/src/services/respondent-identity.ts` — it is already the most complete
        implementation (parameterised status list, `nin IS NULL` guard, guardian JSONB merge,
        `COALESCE` null-fills). Do NOT author a sixth module.
  - [x] 1.2 Promote `allowedStatuses` from the module constant
        `NIN_ARRIVAL_PROMOTABLE_STATUSES` to a required parameter; keep the constant as the
        NIN-arrival callers' value so 13-53's H1 reasoning stays attached to the callers that earned it.
  - [x] 1.3 Add `trigger` as a required parameter, typed as a union rather than `string`, so a new
        caller cannot reuse an existing route's trigger by accident (AC1.3, Context finding #2).
  - [x] 1.4 Add optional `metadata` (path 4's `nin_promoted_by` / `nin_promoted_at` /
        `nin_promoted_from_draft_id` markers) folded by the SAME JSONB `||` merge the guardian uses,
        so sibling keys survive.
  - [x] 1.5 Take the executor as a transaction and write the audit inside it (AC3.1). Document the
        `void`-vs-`Tx` reasoning in the signature's doc comment.
- [x] **Task 2 — Move the callers, one per commit, tests green between each** (AC: #1, #2, #3)
  - [x] 2.1 Path 3/3b first — they already call the target; only the audit and trigger move
        (AC3.1, AC3.4).
  - [x] 2.2 Path 1 (`RegistrationController.completeNin`): keep the FR21 pre-check and its 409
        semantics, keep "token is only burned on success", add `nin IS NULL` (AC3.2), move the audit
        inside the existing transaction (AC3.1).
  - [x] 2.3 Path 2 (`tryRaceResolutionMerge`): give it a transaction (AC3.1). ⚠️ Its identity key
        is the STRICT triple and must stay strict — 13-53 explains at
        `submission-processing.service.ts:616-627` why the fuzzy key sits *beside* it, not instead
        of it. Preserve the staff-capture exemption asymmetry exactly as it is; changing it is 13-4
        AC1b's territory, not this story's.
  - [x] 2.4 Path 4 (`draft-adoption`): keep the clash pre-check and the `nin_unavailable`-only scope
        (AC3.6); it passes its own narrow `allowedStatuses`.
  - [x] 2.5 Path 5 (`MeService`): add `nin IS NULL` (AC3.2) and the second audit row (AC3.3).
  - [x] 2.6 After each move, run that path's protected test file and confirm it passes **unedited**.
- [x] **Task 3 — RED-verify once** (AC: #2)
  - [x] 3.1 Break the unified promote (e.g. drop the `nin IS NULL` predicate, then separately drop
        the status filter). Run the full API suite. Record WHICH tests red.
  - [x] 3.2 Report any path whose tests stayed green — that is an uncovered path and a finding for
        the story's Residuals, not something to paper over with a new test written to match.
  - [x] 3.3 Restore, confirm green.
- [x] **Task 4 — Prove the audit trail answers the question** (AC: #1.3, #3.3, #3.4)
  - [x] 4.1 A test asserting all six call sites produce **distinct** `trigger` values.
  - [x] 4.2 A test asserting path 5 writes `PENDING_NIN_PROMOTED` **and** retains
        `RESPONDENT_SELF_NIN_COMPLETED`, in one transaction.
  - [x] 4.3 Confirm `reconcile-nin-promotion-audit.ts` now counts path 5 — by running it against the
        test DB, not by reading the query.
        ⚠️ **RE-OPENED AND RE-CLOSED BY REVIEW H1/H2, 2026-08-09.** This was ticked without the run
        it demanded; the Completion Notes substituted an integration test that proves the audit ROW
        lands, which is a different claim. Run for real:
        `promotions on record : 0 · audit rows on record : 65 · missing a trail : 0`. The script's
        `audit_rows` total does now include path 5 — but its RECONCILIATION is scoped
        `WHERE r.metadata ? 'nin_promoted_by'` (the 13-49 marker), which path 5 never stamps, so the
        script still cannot detect a lost audit row for path 5 or for paths 1/2/3/3b. **The half
        that is genuinely repaired is 13-44's digest; the reconcile script is Residual R4.**
- [x] **Task 5 — Record the census and hand off** (AC: #4)
  - [x] 5.1 Completion Notes carry before/after counts for both spellings and the AC1.4 single-site
        census.
  - [x] 5.2 Amend 13-54 Known limit #1 with the both-spellings evidence (AC4.3).
  - [x] 5.3 Full API suite + `tsc` + `eslint` clean; record the totals.

## Dev Notes

### The tests that must not be edited (AC2.1)

Baseline counts measured 2026-08-08 at `b7af5b9` — re-measure in Task 0.3, do not trust these:

| file | tests |
|---|---|
| `apps/api/src/services/__tests__/respondent-identity.test.ts` | 13 |
| `apps/api/src/services/__tests__/submission-processing.service.test.ts` | 86 |
| `apps/api/src/routes/__tests__/registration.routes.test.ts` | 60 |
| `apps/api/src/services/__tests__/draft-adoption.promote-nin.test.ts` | 17 |
| `apps/api/src/services/__tests__/me.service.test.ts` | 11 |
| `apps/api/src/services/__tests__/nin-arrival-negative-control.integration.test.ts` | 3 |
| `apps/api/src/services/__tests__/nin-arrival-identity-db-smoke.integration.test.ts` | 7 |

⚠️ The last two are 13-54's negative control and 13-53's DB smoke. 13-54 Known limit #4 says the
negative control "does not exercise `registration.controller.ts:836`, the second caller of the same
chokepoint — **that asymmetry is 13-55's territory**". After Task 2 both callers route through one
promote, which is what closes that asymmetry; confirm it rather than assuming it.

### Dependencies

- **13-54 must be `done`** — it is (2026-08-08, CI guard live at step 12 above `Lint`). Its guard
  stops NEW un-guarded creators; this story reduces the sanctioned ones. Sequencing was deliberate:
  refactoring first would consolidate five paths while a sixth could still be added un-guarded.
- **No blocking dependency on 13-44.** But 13-44 AC-T4's digest pair is specified against
  `PENDING_NIN_PROMOTED`, so AC3.3 makes that story's signal correct on arrival. Note it in 13-44 if
  the ACs are touched.

### Risks

1. **The refactor lands a behaviour change nobody notices, which is the exact failure mode this
   story exists to prevent.** Mitigation is AC2.1's unedited-tests rule and Task 2's one-caller-per-commit
   discipline — a red after a single small commit is attributable; a red after five is not.
2. **Path 2 gaining a transaction changes its failure mode**: today the UPDATE can succeed while the
   audit is lost; tomorrow an audit failure rolls the promote back. That is correct and is also a
   real change to what a citizen experiences on a bad day. Call it out at the call site.
3. **A test asserting `logAction` was called will break when a path moves to `logActionTx`.** This is
   the one place AC2.1 and AC3.1 pull against each other. The resolution is AC2.3: such an edit is
   permitted **only** if it appears on the AC3 list with its reason. If a test breaks for any other
   reason, the refactor changed behaviour.
4. **`STAFF_CAPTURED_SOURCES` exemption asymmetry is real and must survive**: path 3b exempts
   enumerator/clerk, path 2 does not [Source: apps/api/src/services/submission-processing.service.ts:639].
   That is defensible — the strict triple is a much stronger key than the fuzzy one — but it is
   undocumented. Document it; do not unify it.
5. **This story has NO live defect behind it.** Divergence between these paths has not yet produced
   one. It is the shape that produced two (R21, 13-53), which is a good reason to act — and not the
   same thing as evidence of harm. If the refactor starts growing, stopping is a legitimate outcome.

### Project Structure Notes

- **No new directories.** The unified promote stays in `apps/api/src/services/respondent-identity.ts`
  beside `findRespondentByIdentity`, for the reason that file's header already gives: the finder and
  the promote answer two directions of one question, and splitting them is how the seam formed.
- Backend tests live in `__tests__/` folders, never co-located
  [Source: _bmad-output/project-context.md — Testing Organization].
- ESM: every relative import needs the `.js` extension
  [Source: _bmad-output/project-context.md — ESM Import Conventions].
- ⚠️ **`apps/api/scripts/` is outside `tsconfig`** — `tsc` does not check it and eslint is the only
  compile-time signal there. `reconcile-nin-promotion-audit.ts` lives there; **run it, do not trust
  a clean type-check** (Pitfall #41).
- Errors: `AppError`, never raw `Error`. Logging: Pino `{ event: 'domain.action' }`, never
  `console.log` [Source: _bmad-output/project-context.md — Critical Implementation Rules §3, §5].
- Test DB required: `NODE_ENV=test DATABASE_URL=…app_test`; `apps/api/test/db-guard.ts` refuses a
  non-test URL. The two integration files in the protected list need it.

### How to run the tests

```bash
# one protected file (from repo root — pnpm, never npx)
pnpm vitest run apps/api/src/services/__tests__/respondent-identity.test.ts
# the full API suite (Task 3.1 / 5.3)
pnpm test
```

⚠️ These are all API tests — none of the five paths has a web surface. Do **not** run
`pnpm vitest run` from the root for web tests (wrong config); this story should not need them at all.
If a web test appears in a red run, that is a signal the refactor reached further than intended.

### No external research required

The only libraries in scope are Drizzle ORM and node-postgres, both already pinned and already used
by all five paths; no API surface changes. Per AC5 this story adds no dependency, no migration and
no column — so there is nothing whose latest version could change the implementation. Recorded
explicitly so the omission is a decision rather than a gap.

### Git intelligence (last 5 commits at authoring time)

`b7af5b9` docs: close out 13-54 — parity sweep, 13-55 promoted, playbook §2w · `de63972` +
`22ed3c4` 13-54 close-out docs · `c3e7cc0` feat(13-54): respondent-write CI guard + NIN-arrival
negative control · `0667321` docs(13-42) AC9. The working tree is clean at authoring time; the
pattern to copy is 13-54's — detector/CLI/test split, measured baselines, and limits stated up front
rather than discovered in review.

### References

- `apps/api/src/services/respondent-identity.ts:92-96` — `NIN_ARRIVAL_PROMOTABLE_STATUSES` and the
  H1 reasoning for each status; `:161-210` finder; `:255-308` the promote this story generalises;
  `:220-227` why `nin IS NULL` is load-bearing twice over.
- `apps/api/src/controllers/registration.controller.ts:195-309` — path 1; UPDATE `:252-265`; audit
  `:284-296`. `:816-887` wizard identity branch; promote call `:836-853`; audit `:1071-1086` with the
  one-action-three-triggers rationale at `:1060-1070`.
- `apps/api/src/services/submission-processing.service.ts:600-611` + `:966-1051` — path 2, UPDATE
  `:995-1014`, audit `:1023-1029`. `:628-717` path 3b; staff exemption `:639-658`; audit `:693-699`.
- `apps/api/src/services/draft-adoption/promote-nin.ts:115-205` — path 4; clash pre-check `:124-137`;
  the `logActionTx`-not-`logAction` lesson `:139-152`.
- `apps/api/src/services/me.service.ts:593-658` — path 5; UPDATE `:626-630`; audit `:634-642`.
- `apps/api/src/services/audit.service.ts:119,187` — the two actions.
- `apps/api/scripts/reconcile-nin-promotion-audit.ts:80,90` — counts `PENDING_NIN_PROMOTED` only.
- `_bmad-output/implementation-artifacts/13-54-respondent-write-chokepoint-ci-guard.md:551-590` —
  Known limits #1 (12 files, handed here), #4 (the untested second caller), #6 (per-file allowlist;
  "the real answer is fewer sanctioned creators, i.e. Story 13-55").
- `docs/adjudication-agent-handoff.md` §2b RED-verify · §2w a record is not the work · §3 Next up.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context) — dev-story workflow, 2026-08-08.

### Debug Log References

- Test DB: `NODE_ENV=test DATABASE_URL=…/app_test` (db-guard enforced). Docker `oslsr_postgres`.
- RED-verify runs are recorded in Completion Notes rather than here, because the WHICH-TESTS-RED
  result is the finding, not a debugging aid.

### Completion Notes List

#### The census (AC4.1 / AC4.2) — measured, before and after

| measurement | before | after |
|---|---|---|
| production files matching `.update(respondents)` | 14 (12 excl. the 13-54 guard's own 2) | **13** (11 excl. guard) |
| files matching raw `UPDATE "respondents"` | 6 | 6 |
| **sites writing `nin` + `status='active'` together** | **5** | **1** |

`draft-adoption/promote-nin.ts` left the `.update(respondents)` list when it moved onto the shared
promote. The raw-SQL count is unchanged at 6 because `submission-processing.service.ts` still
contains two raw `UPDATE "respondents"` statements — both **metadata marker stamps** (9-58
confirmation-email and 13-21 thank-you send-once), neither a promote. The census detector correctly
excludes them: it requires a NIN write AND `status='active'` in the same window.

**AC1.4 is enforced by a test, not by this table.** `respondent-promotion-census.test.ts` reads the
whole `apps/api` tree and asserts the list of promote sites equals exactly
`['src/services/respondent-identity.ts (1)']`. RED-verified: appending a sixth promote to
`me.service.ts` made it fail naming that file; removing it restored green.

#### What was actually built (AC1)

`promoteRespondentToActive(tx, args)` in `respondent-identity.ts` — the sanctioned entry. It calls
the existing SQL primitive and writes `PENDING_NIN_PROMOTED` via `logActionTx` **in the caller's
transaction**, so a promote cannot exist without its evidentiary row. Status scope and identity key
stay with the callers as parameters, exactly as AC1.2 required:

| caller | trigger | `allowedStatuses` |
|---|---|---|
| magic link | `magic_link_complete_nin` | `pending_nin_capture` |
| race-resolution merge | `race_resolution_merge` | `pending_nin_capture` |
| wizard NIN-arrival | **`nin_arrival_wizard`** (new) | 13-53 allow-list |
| queue NIN-arrival | `nin_arrival_identity_match` (kept) | 13-53 allow-list |
| draft adoption | `draft_adoption_ac14` | `nin_unavailable` |
| authenticated self | `authenticated_dashboard_nin` | `pending_nin_capture` |

The primitive `promoteRespondentWithArrivingNin` gained two OPTIONAL parameters (`allowedStatuses`
defaulting to the 13-53 allow-list, and `metadata`). Optional was the whole design constraint: it is
what let all 13 of its unit tests pass **completely unedited**.

⚠️ **Trigger rename is a DATA decision, and only one was made.** The wizard took the new
`nin_arrival_wizard`; the queue KEPT `nin_arrival_identity_match` because its rows already exist on
production and renaming would orphan every historical row. `PromoteTrigger` is now a closed union,
so a future caller cannot silently reuse an existing route's label — which is how the collision
happened in the first place.

#### AC3.3 — the route that promoted people invisibly

`MeService.completeNinAuthenticated` wrote `respondent.self_nin_completed` and nothing else, while
`reconcile-nin-promotion-audit.ts` and 13-44 AC-T4 both count `pending_nin.promoted`. Every dashboard
NIN completion was counted nowhere, and the counter read zero. It now writes **both**, in one
transaction — proven on a real DB by `promote-audit-visibility.integration.test.ts`, not by reading
the query. The 9-61 action is KEPT: retiring an audit action is a data decision for its own story.

⚠️ **CORRECTED BY REVIEW H2 — this fix reaches ONE of the two consumers it claimed.** The paragraph
above named `reconcile-nin-promotion-audit.ts` and 13-44 AC-T4 together, and they are not in the same
position. 13-44's digest counts `PENDING_NIN_PROMOTED` rows, so it becomes correct on arrival. The
reconcile script does not: its orphan query is scoped `WHERE r.metadata ? 'nin_promoted_by'` — the
13-49 draft-adoption marker — so path 5 appears on neither side of it. Measured on `app_test`:
`promotions 0 · audit rows 65 · missing a trail 0`. The script was never a general promote monitor;
it is a 13-49 R11 reconciler that only ever saw path 4, and this story's Context finding #1 read more
into `[Source: …:80,90]` than those two lines support. **Recorded as Residual R4, not repaired here**
— widening the script is a change to what an operator tool asserts, and AC5 forbids smuggling that
inside a refactor whose whole claim is that nothing changed.

#### AC2 — the exact cost, listed (nothing else was touched)

Baseline **206 passed** across the 7 protected files; final **206 passed**. Four edits, all sanctioned
by AC3 per AC2.3:

1. `submission-processing.service.test.ts` — added `transaction` to the `db` double. A **capability
   gap**, not a relaxed assertion: the double never modelled transactions, and AC3.1 gives path 2 one.
2. `submission-processing.service.test.ts` — ONE assertion `logAction` → `logActionTx` (AC3.1). It
   **tightens** what is proved: `logAction` returns `void`, so it could only ever prove the audit was
   *started*.
3. `registration.routes.test.ts` — the same `logAction` → `logActionTx` change (AC3.1), plus the tx
   double now returns the promote's row shape (the promote issues raw SQL, not the query builder).
4. `draft-adoption.promote-nin.test.ts` — tx double gained `execute`; two assertions now read the
   issued SQL instead of the query-builder value object. Same two facts, new surface. **Two
   assertions were ADDED** pinning its narrow `nin_unavailable` scope — and RED-2 proved they are
   load-bearing.

Four merge-hit fixtures in `submission-processing.service.test.ts` gained a second
`mockResolvedValueOnce` because path 2's single statement became SELECT-then-UPDATE. Fixture shape,
not assertion. `me.service.test.ts` (11) needed **no changes at all** — it is a real-DB test.

#### ⚠️ 13-54's negative control FAILED, and that is the good outcome

`nin-arrival-negative-control.integration.test.ts` neutered `promoteRespondentWithArrivingNin`.
Production now calls `promoteRespondentToActive`, which reaches the primitive through an
**intra-module binding an ESM namespace mock cannot intercept** — so the mock stopped neutering
anything. It **failed loudly** rather than passing while controlling nothing, which is the failure
mode a negative control is most vulnerable to. Retargeted at the sanctioned entry.

⚠️ **CORRECTED BY REVIEW M3 — this does NOT close 13-54 Known limit #4.** The claim was "both callers
now route through one promote", which is true and is not what limit #4 asked for. Limit #4's
complaint is that the negative control *does not exercise* `registration.controller.ts:836`; after
the retarget it still does not — the file drives `SubmissionProcessingService` and nothing else. That
both callers share an implementation is a SOURCE fact, proven by the census test; it is not a journey
any test walks. Limit #4 stays open and the wizard caller joins **R1**.

#### AC2.2 — RED-verify, and the coverage it exposed

Run once on the consolidated promote, two breakages:

| breakage | tests red |
|---|---|
| `nin IS NULL` deleted | 2 — `respondent-identity.test.ts`, `nin-arrival-identity-db-smoke` |
| status allow-list deleted | 3 — those two + `draft-adoption.promote-nin` (the assertions added here) |

🔴 **THE FINDING (AC2.2 asks for this, not a fix): no CALLER-level test for paths 1, 2 or 5 exercised
the promote's guards.** Break the predicate and their suites stayed green — the guards were covered
only by the primitive's own unit tests and the 13-53 DB smoke.

Path 5 is now covered by the new integration test. **Paths 1 and 2 remain uncovered at caller level —
recorded as Residual R1 rather than papered over.**

#### ⚠️ A test I wrote first proved nothing, and RED-verify caught it

The obvious version of "refuses a second completion" called `completeNinAuthenticated` twice and
expected 409. It passed **with the `nin IS NULL` predicate deleted** — because the service's own
`status !== 'pending_nin_capture'` pre-check throws before the SQL is ever reached. It asserted the
safe OUTCOME while never touching the guard: [[pattern-test-that-passes-over-a-hole]], in this
story's own new test. Rewritten to drive the state the predicate actually defends (a row still
`pending_nin_capture` that already holds a NIN), and re-verified: green with the guard, red without.

#### Quality gates

- API suite **3673 passed / 0 failed** / 7 skipped / 1 todo (267 files). 11 tests are new here.
- `tsc --noEmit` clean; `eslint src scripts` clean (0 errors, 0 warnings).
- ✅ **RE-RUN BY THE CODE REVIEW, 2026-08-09, after its 8 fixes** — not read off the line above:
  API suite **3674 passed / 0 failed** / 7 skipped / 1 todo (**267 files**, 265 passed + 2 skipped).
  The +1 is review H1's new census assertion, so the two figures reconcile exactly. `tsc --noEmit`
  clean; `eslint src scripts` clean. Protected set re-measured at **222 passed / 0 failed**.
- ✅ **AFTER THE RESIDUAL PASS (R1/R2/R3/R4), 2026-08-09:** API suite **3680 passed / 0 failed** /
  7 skipped / 1 todo (**268 files**). 3674 + 4 caller-journey tests + 2 R2 inventory tests = 3680,
  so the figure reconciles arithmetically as well as passing. `tsc --noEmit` clean; `eslint src
  scripts` clean. `reconcile-nin-promotion-audit.ts` RUN against `app_test`.
- ℹ️ **Web suite: 1 pre-existing failure, NOT from this story.**
  `apps/web/src/__tests__/route-resolution.integration.test.tsx > resolves an unknown path to the
  NotFound component`. **Zero web files appear in this story's diff**, so it cannot be caused by it;
  it is also flaky rather than solid (a turbo run reported 2 failing files, a direct
  `cd apps/web && pnpm vitest run` reported 1). Recorded because this story's Dev Notes say a web red
  is a signal the refactor over-reached — it was checked rather than waved off, and it did not.
- No new dependencies, no migration, no schema change (AC5 held).
- One non-protected file also needed the `db.transaction` capability:
  `submission-ingestion.integration.test.ts`. Found by the full suite, not by the protected set.

### Residuals

| # | residual | owner / trigger |
|---|---|---|
| **R1** | ✅ **CLOSED 2026-08-09 for paths 1 and 2 · path 3 HANDED TO 13-48 (adjudication).** New `promote-caller-journeys.integration.test.ts` (4 tests, real DB) drives the callers. **Path 1 (magic link): guard now COVERED and RED-VERIFIED** — a real `MagicLinkService.issueToken` + the real `RegistrationController.completeNin`; deleting `AND "nin" IS NULL` reds exactly that test and nothing else. **Path 2: the residual's framing was WRONG, and measuring it is what showed that** — its guard is *unreachable from the caller by construction*, because `tryRaceResolutionMerge` selects with `WHERE status='pending_nin_capture' AND "nin" IS NULL … FOR UPDATE` before the promote is ever called. The predicate can only fire on a row that changed between the lock and the write, which the lock prevents. Path 2 is **double-guarded, not under-tested**; no caller-level test that reds on the predicate CAN exist, and the wiring + audit row are covered instead. | **Remaining: path 3 (wizard, `registration.controller.ts:836`) — 13-54 Known limit #4.** Not closed: there is no real-DB precedent anywhere in the suite for driving the wizard POST (checked — the only test hitting `/api/v1/registration` is `rate-limit-coverage.test.ts`). It needs a published form + questionnaire binding + draft + captcha/rate-limit bypass, i.e. a test HARNESS, not a test. **Do not re-mark 13-54 limit #4 closed without that journey.**

⚖️ **ADJUDICATION 2026-08-09 — HANDED TO 13-48, not left open.** The residual names exactly what it needs — *a published form + questionnaire binding + draft + captcha/rate-limit bypass, i.e. a test HARNESS, not a test* — and **13-48 AC1 is that harness**: *"a representative multi-section public form exists in the test/e2e environment… a fixture, versioned in the repo."* Two stories were independently blocked on the same missing fixture; building it twice would be the waste. **13-48 now carries the pointer, so whoever builds AC1 knows a second story unblocks with it.** REOPEN TRIGGER: 13-48 AC1 lands and the wizard journey is still not driven — then this is open again, not closed by association. |
| **R2** | ✅ **CLOSED — the inventory is an assertion now, not a note.** "Informational" is how a measurement rots: 13-54's amendment already named this file "the working reference" for both spellings, while the six-file raw-SQL figure it cites lived only in markdown. `respondent-promotion-census.test.ts` now pins all 6 raw `UPDATE "respondents"` sites **with a reason each**, 13-54-allowlist-style, plus the six-file figure itself. A 7th site reds and someone reads it. | Nothing outstanding. A future update-guard inherits the reasons instead of re-deriving them; a new raw writer is *unreviewed*, not forbidden — add it with a reason. |
| **R3** | ✅ **CLOSED — driven, not reasoned.** "Unchanged-or-stronger BY CONSTRUCTION" is the phrase this project has learned to distrust. `promote-caller-journeys.integration.test.ts` sends two NIN-bearing submissions for the same pending person concurrently (`Promise.allSettled`, real connections, different NINs) and asserts the property that would matter on a bad day: **exactly ONE `pending_nin.promoted` row for that respondent.** Two would mean two NINs written to one person. Precedent for the shape: `audit-safe-teardown.race.test.ts`. | Nothing outstanding. The loser correctly falls through to a fresh insert — the documented "better one repairable duplicate than a wrong-person merge" trade. |
| **R4** | ✅ **CLOSED — and it turned out to be a reporting defect, not a detection gap.** Raised by review H2 after RUNNING the script (`promotions 0 · audit rows 65`). Two separate things were tangled: **(a) DETECTION** — the script cannot spot a lost audit row for paths 1/2/3/3b/5 because the AC14 marker is the second source and only path 4 stamps one. **That stopped mattering in this story**: AC3.1 writes the audit inside the promote's transaction on all six routes, so a promote can no longer exist without its trail. There is nothing left to detect. **(b) REPORTING — the real defect.** The script printed two non-comparable numbers adjacent and unlabelled, inviting the subtraction `65 − 0 = 65 orphans`. `prod-verify.yml` had already learned this exact lesson on 2026-08-03 (it rendered `10 \| 87`, *"inviting the reading that 77 rows were missing"*) and carries the comment **"DO NOT print total pending_nin.promoted rows next to the AC14 count… Compare like with like."** That gate names this script as its remedy — and the script had never been given the same correction. | Fixed and **RUN** (`scripts/` is outside tsconfig — Pitfall #41): the comparable pair prints as a pair (`AC14 promotions` / `…with a trail` / `…missing a trail`), the global total prints apart and labelled not-comparable, and a **per-route breakdown** was added — which the `PromoteTrigger` union is what makes answerable. The docblock's false invariant *"promotions == pending_nin.promoted rows"* is corrected, and the script now states plainly what it cannot reach. Entry for [[pattern-monitor-measuring-something-else]]: found by reading the WRITERS, then by RUNNING the reader — and the fix was already written down one file away. |

### File List

**New**
- `apps/api/src/services/__tests__/respondent-promotion-census.test.ts` — AC1.3/AC1.4/AC1.5 census
  (9 tests → **10**; review H1 added `the SQL primitive has no production callers`, review M4
  broadened the `active` matcher and stated the spelling limit)
- `apps/api/src/services/__tests__/promote-audit-visibility.integration.test.ts` — AC3.2/AC3.3
  real-DB proof (2 tests; review L1 randomised the fixtures, review L2 made the second test
  self-seeding and delta-based)

- `apps/api/src/services/__tests__/promote-caller-journeys.integration.test.ts` — **added by the
  review's residual pass**: closes R1 for paths 1 and 2 and closes R3 (4 tests, real DB). Drives the
  REAL `RegistrationController.completeNin` through a real `MagicLinkService` token, the REAL
  `findOrCreateRespondent` merge, and two concurrent submissions racing one pending row.

**Modified — scripts (review R4)**
- `apps/api/scripts/reconcile-nin-promotion-audit.ts` — non-comparable totals separated and
  labelled, per-route promote breakdown added, false "promotions == pending_nin.promoted" invariant
  corrected, and the script now states what it cannot reach. **RUN, not type-checked** (`scripts/` is
  outside tsconfig — Pitfall #41).

⚠️ `src/services/canary-sixth-promote.ts` existed only as the H1 RED-verify canary and was deleted in
the same pass. Confirmed absent in `git status`.

**Modified — production**
- `apps/api/src/services/respondent-identity.ts` — `PromoteTrigger` union; `promoteRespondentToActive`; primitive gains optional `allowedStatuses` + `metadata`; `source` on the promote's RETURNING
- `apps/api/src/controllers/registration.controller.ts` — paths 1 + 3 onto the shared promote; both post-hoc audits removed; submission ids hoisted above the identity block
- `apps/api/src/services/submission-processing.service.ts` — paths 2 + 3b; path 2 rebuilt as locked SELECT + shared promote inside a transaction
- `apps/api/src/services/draft-adoption/promote-nin.ts` — path 4; keeps its clash pre-check and `nin_unavailable`-only scope
- `apps/api/src/services/me.service.ts` — path 5; gains `nin IS NULL` and the `PENDING_NIN_PROMOTED` row

**Modified — tests** (each edit justified in Completion Notes → AC2)
- `apps/api/src/services/__tests__/submission-processing.service.test.ts`
- `apps/api/src/routes/__tests__/registration.routes.test.ts`
- `apps/api/src/services/__tests__/draft-adoption.promote-nin.test.ts`
- `apps/api/src/services/__tests__/nin-arrival-negative-control.integration.test.ts` — retargeted
- `apps/api/src/services/__tests__/submission-ingestion.integration.test.ts` — `db.transaction` capability

**Modified — docs**
- `_bmad-output/implementation-artifacts/13-54-respondent-write-chokepoint-ci-guard.md` — Known limit #1 amended (AC4.3)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-08-07 | Story raised as a shell from the 13-53 review (T2) | Recorded while the reasoning was fresh; not bundled into 13-54 |
| 2026-08-08 | Promoted to top of Next up at 13-54's close | 13-54 Known limit #6 — a per-file allowlist cannot fix what fewer sanctioned writers can |
| 2026-08-08 | Authored to `ready-for-dev` via canonical *create-story. Title three → five paths; ACs 2 → 5; Tasks 0-5 added | The census found two paths the shell missed, and both carry live audit-observability defects |
| 2026-08-08 | Implemented via dev-story. Five promotes → one; promote sites writing `nin`+`status='active'` 5 → 1, enforced by a RED-verified census test | AC1.4 as an executable assertion rather than a claim — this story exists because the count silently went 1 → 5 |
| 2026-08-08 | Audit made atomic on all six call sites; `nin IS NULL` added to paths 1 and 5; path 5 now writes `PENDING_NIN_PROMOTED` alongside its 9-61 action | AC3.1/3.2/3.3 — a promote could exist with no trail, and one whole route was invisible to every promote monitor |
| 2026-08-08 | Wizard trigger → `nin_arrival_wizard`; queue keeps `nin_arrival_identity_match`; `PromoteTrigger` closed union | AC1.3 was already breached — two routes wrote one label. Only the newer route was renamed; prod rows keep their meaning |
| 2026-08-08 | Status set to `review`. API suite 3673 pass / 0 fail; protected set 206 → 206 with 4 listed edits | AC2.1 held: the 13 primitive tests and all 11 me.service tests are unedited |
| 2026-08-09 | BMAD adversarial code-review: 8 findings (2H/4M/2L), **all 8 fixed pre-commit** on the uncommitted tree | Every High and Medium was a claim outrunning its evidence, not a broken promote — the layer describing the refactor, not the refactor |
| 2026-08-09 | H1 — the census gained the assertion its docblock already claimed; RED-verified with a bypass canary that had left it 9/9 green | Counting SQL sites is structurally blind to a caller of the primitive: a bypass writes no SQL of its own. AC1.4's guard was decorative |
| 2026-08-09 | H2 — `reconcile-nin-promotion-audit.ts` RUN (`promotions 0 · audit rows 65`); Task 4.3 re-worded, Residual R4 raised | The task forbade reading the query and was closed by reading it. The script reconciles only the 13-49 marker cohort, so it is blind to five of six paths |
| 2026-08-09 | M1/M2 — `allowedStatuses` typed `readonly RespondentStatus[]`; validator throws `AppError` | As `string[]` a typo was a silent no-op that answered HTTP 200 `alreadyPromoted:true` to a person whose NIN was never written |
| 2026-08-09 | M3 — 13-54 Known limit #4's closure withdrawn here and in `sprint-status.yaml`; folded into R1 | The retarget proved both callers share an implementation; limit #4 asked for the second caller to be EXERCISED, and it still is not |
| 2026-08-09 | M4/L1/L2 — census matches a constant `ACTIVE` spelling and states the runtime-status limit; integration fixtures randomised; second test self-seeds and asserts a delta | A guard blind to one spelling reads green and wrong — this story's own amendment to 13-54 limit #1 |
| 2026-08-09 | **Residual pass: R2, R3, R4 CLOSED; R1 closed for paths 1–2, open for path 3 only** | "Deferred" was inherited framing, not a measurement. Three of the four survived contact with an attempt for about ten minutes |
| 2026-08-09 | R1 — new `promote-caller-journeys.integration.test.ts`; path 1's guard RED-VERIFIED at caller level (delete `nin IS NULL` → exactly that test reds) | The magic-link guard IS reachable: FR21 searches for the INCOMING nin on OTHER rows, so a pending row holding a different NIN sails past every pre-check |
| 2026-08-09 | R1 — **path 2's framing corrected: its guard is unreachable from the caller BY CONSTRUCTION**, not untested | `tryRaceResolutionMerge` selects `WHERE status=… AND nin IS NULL … FOR UPDATE` first, so the promote's re-assertion cannot fire. Double-guarded. RED-verify was right; the residual's explanation was wrong |
| 2026-08-09 | R3 — two concurrent submissions race one pending row; asserts exactly ONE promote audit row | "Unchanged-or-stronger by construction" is the phrase this project has learned to distrust |
| 2026-08-09 | R2 — the 6 raw `UPDATE "respondents"` sites pinned with a reason each, plus the six-file figure | 13-54's amendment already called this file "the working reference"; the figure it cited lived only in markdown. A number in a doc is a memory of a measurement |
| 2026-08-09 | R4 — `reconcile-nin-promotion-audit.ts` corrected and RUN: non-comparable totals split, per-route breakdown added, false invariant fixed | The detection half was closed by AC3.1 (atomic audit). What remained was a REPORTING defect `prod-verify.yml` had already diagnosed and fixed on its own side — the remedy tool it names never got the same correction |

### Review Follow-ups (AI)

**BMAD adversarial code-review, 2026-08-09 (Claude Opus 5).** 8 findings — 2 High, 4 Medium, 2 Low.
All 8 FIXED in the same pass, on the uncommitted tree, before any commit
([[feedback_review_before_commit]]). Gates re-run by the reviewer rather than read off this file:
`tsc --noEmit` clean, `eslint src scripts` clean (0/0), protected set **222 passed / 0 failed**.

⚠️ **The theme, stated once rather than eight times: every High and Medium finding is a claim that
outran its evidence, not a broken promote.** The refactor is sound — five implementations really are
one, `PromoteTrigger` is the right instrument, and the AC2.2 write-up reports its own coverage gap
instead of burying it. What failed review is the layer *describing* the refactor: a guard asserted in
a docblock that did not exist, a task ticked without the run it demanded, and a limit declared closed
that is still open. That is [[pattern-a-record-about-the-work-is-not-the-work]] three times in one
story, and it is the same class the story itself was written to close one level down.

- [x] **[AI-Review][High] H1 — the census test did not enforce what `respondent-identity.ts` said it
      enforced; a sixth un-audited promote passed every 13-55 test.**
      The `promoteRespondentToActive` docblock claimed *"`respondent-promotion-census.test.ts`
      enforces that as a source-level assertion"* for the rule *production code must call THIS*. No
      such assertion existed. **RED-verified by the review, not argued:** a production file
      `src/services/canary-sixth-promote.ts` calling `promoteRespondentWithArrivingNin(db, …)` — a
      real promote, `nin` + `status='active'`, **zero audit rows** — left the census **9/9 GREEN**,
      with tsc clean, eslint clean and 13-54's drift guard silent (it guards CREATION).
      **Why the existing assertions cannot see it:** a bypass writes no SQL of its own. It calls the
      still-exported primitive and lets `respondent-identity.ts` issue the UPDATE, so the site count
      stays 1 and the six triggers stay six. Counting SQL sites is structurally blind to the exact
      regression AC1.4 exists to prevent — and to how the count went 1 → 5 the first time.
      *Fixed:* new assertion `the SQL primitive has no production callers`
      [`respondent-promotion-census.test.ts`], comment-stripped so prose about the primitive is not
      mistaken for a call, `__tests__` exempt (AC2.1 forbids editing the 13 tests that bind to it).
      Re-RED-verified with the same canary: **1 failed | 9 passed**, the failure naming
      `src/services/canary-sixth-promote.ts` and telling the author to call the shared promote.
      Canary deleted; 25/25 green after. The docblock now records that it was unenforced rather than
      quietly becoming true.
- [x] **[AI-Review][High] H2 — Task 4.3 was `[x]`, the script was never run, and running it shows
      the claim is false.**
      Task 4.3: *"Confirm `reconcile-nin-promotion-audit.ts` now counts path 5 — **by running it
      against the test DB, not by reading the query**."* Nothing in Debug Log or Completion Notes
      records a run; the notes substitute `promote-audit-visibility.integration.test.ts`, which
      proves the audit **row lands** — a different claim, and precisely the substitution the task
      was worded to forbid. The reviewer ran it against `app_test`:
      `promotions on record : 0 · audit rows on record : 65 · missing a trail : 0`.
      **`promotions` is 0 because the orphan query is scoped `WHERE r.metadata ? 'nin_promoted_by'`
      — the 13-49 draft-adoption marker.** Path 5 stamps no marker, so it is on neither side of the
      reconciliation; only the global `audit_rows` counter moved. AC3.3 does make 13-44's digest
      correct, but the reconcile script stays blind to path 5 **and to paths 1, 2, 3 and 3b**, none
      of which carry the marker either — it cannot detect a lost audit row for five of six call
      sites. *Fixed:* run recorded below with its real output, Task 4.3 re-worded to what was
      actually established, and the un-repaired half raised as **Residual R4** rather than absorbed.
      The script itself is deliberately NOT changed — its semantics are 13-49 R11's, and widening
      them inside a refactor whose whole claim is that nothing changed is what AC5 forbids.
- [x] **[AI-Review][Medium] M1 — `allowedStatuses: readonly string[]` made a typo a SILENT no-op.**
      `'pending_nin_captur'` passes the `/^[a-z_]+$/` runtime check, interpolates into valid SQL,
      matches no row, and the promote returns `null` — which every caller reads as "already
      promoted". The magic-link route would answer **HTTP 200 `alreadyPromoted: true`** to a person
      whose NIN was never written. *Fixed:* typed `readonly RespondentStatus[]` on both the
      primitive and the shared promote, so the compiler catches it; the runtime check is kept and
      re-labelled as defence-in-depth for the raw interpolation (an `as` cast or an untyped
      boundary), not the primary guard. `tsc` clean on the first run — all six call sites were
      already passing valid members, so this is a lock on the door, not a repair.
- [x] **[AI-Review][Medium] M2 — the validator threw a raw `Error`, against this story's own Dev
      Notes** (*"Errors: `AppError`, never raw `Error`"*). It runs inside a caller's
      `db.transaction`, so a raw throw surfaces as an unclassified 500 with no code to key on.
      *Fixed:* `AppError('PROMOTE_INVALID_STATUS_SCOPE', …, 500)`.
- [x] **[AI-Review][Medium] M3 — 13-54 Known limit #4 was declared closed; nothing drives the second
      caller.** The story states the negative-control retarget *"closes 13-54 Known limit #4 (its
      untested second caller)"*. Limit #4's complaint was that the control does not exercise
      `registration.controller.ts:836` — after the retarget it still does not:
      `nin-arrival-negative-control.integration.test.ts` drives `SubmissionProcessingService` only.
      Sharing an implementation is a good argument; it is not the exercise the limit asked for, and
      "both callers now route through one promote" is a source fact the census test proves, not a
      journey any test walks. *Fixed:* closure claim withdrawn here and in `sprint-status.yaml`; the
      wizard caller folded into **R1** beside paths 1 and 2, where it belongs.
- [x] **[AI-Review][Medium] M4 — the census detector was literal-`'active'`-only.**
      `promoteSitesIn` required `/status['"]?\s*[:=]\s*'active'/`, so a promote spelled
      `status: RESPONDENT_STATUS.ACTIVE` was uncounted. The file honestly stated its *distance*
      limit (the 1400-char window) and not its *spelling* limit — while this very story's amendment
      to 13-54 Known limit #1 is the lesson that a guard blind to one spelling reads green and
      wrong. *Fixed:* the matcher now accepts a SCREAMING_CASE constant as well, and the header
      states the limit that a regex genuinely cannot close (a status chosen at runtime), naming H1's
      new assertion as the thing that still catches it.
- [x] **[AI-Review][Low] L1 — `promote-audit-visibility.integration.test.ts` derived every unique
      value from `process.hrtime.bigint() % 100000n`,** collapsing the NIN into
      `10000000000–10000099999` behind a PARTIAL UNIQUE INDEX. Any run dying before `afterAll`
      leaves a row a later run collides with, surfacing as a `NIN_DUPLICATE` 409 from inside the
      service — debris wearing the costume of a flake. *Fixed:* `randomInt` across the full 11-digit
      NIN space and the whole `8xxxxxxxxx` phone block.
- [x] **[AI-Review][Low] L2 — the second test depended on the first having run.**
      `expect(promotes).toHaveLength(1)` was really measuring its neighbour, and
      `-t 'refuses to overwrite'` failed on a precondition rather than on the property. *Fixed:* the
      test now seeds the exact state under test (`status='pending_nin_capture'` **and** a NIN
      present) and asserts a **delta** of zero promote rows. Verified standalone: **1 passed**.

**Checked and dismissed as non-findings, recorded so the next reader does not re-open them:**
`db.transaction` nesting in paths 2 and 3b — `findOrCreateRespondent` is never called inside an
outer transaction (`processSubmission:310`), so there is no second-connection deadlock; and the
plain `delete(auditLogs)` teardown — `me.service.test.ts` uses the identical pattern and the
append-only trigger is absent from these test DBs, so the `audit-safe-teardown` helper is not
required here.

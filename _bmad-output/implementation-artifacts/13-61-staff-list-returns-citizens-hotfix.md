# Story 13.61: The staff list was returning citizens (HOTFIX)

Status: done

<!-- EMERGENT + SHIPPED 2026-08-09. Reported by Awwal from the live Super Admin UI, fixed the same
session in an isolated worktree while 13-46 was being developed on main. Recorded as a story because
shipped work needs a record, not because it went through dev-story. -->

## What was wrong

Awwal reported three symptoms from the Super Admin UI. They had **one root cause and one aggravator**:

| symptom reported | cause |
|---|---|
| "All Enumerator" filter lists more than the 2 enumerators | the picker's query params **do not exist** |
| Staff page lists Public Users (respondents) | `listUsers` had **no role predicate at all** |
| A deactivated test account still appears in the picker | the picker never filtered on status |

**The aggravator.** `registry.api.ts` called:

```
/staff?roleFilter=enumerator&pageSize=500
```

`staff.controller` reads `{ page, limit, status, roleId, lgaId, search }`. **Neither `roleFilter` nor
`pageSize` exists.** Both were discarded in silence, so the call returned the unfiltered user table at
the default page size.

⚠️ **A WRONG PARAMETER NAME FAILS PERMISSIVELY.** It does not 400 or 404 — it returns *more* than was
asked for. That is why this survived review and testing: nothing errored, and every symptom looked
like a UI bug while the endpoint behaved exactly as written.

**The root cause.** `StaffService.listUsers` built its WHERE from `status`, `roleId`, `lgaId`, `search`
and nothing else. With no role filter supplied, "the staff list" meant *every row in `users`* — on
prod, **114 `public_user` respondents beside 3 actual staff**.

## What shipped

1. **Citizens excluded BY DEFAULT in the service** — not by fixing the query string. A caller that
   forgets the filter must not be able to pull citizen records out of a staff endpoint. Opt back in
   explicitly via `includePublicUsers` if a genuine all-users view is ever needed.
2. **`role` filter by NAME** (`?role=enumerator`) alongside `roleId`. Every real caller knows the name
   and none holds the UUID — requiring a UUID is what produced the invented `roleFilter` in the first
   place.
3. **Picker query corrected** to `?role=enumerator&status=active&limit=100`. `status=active` so a
   deactivated account cannot be chosen as the filter for a live registry view. `limit` is capped at
   100 server-side, so the old `500` was fiction twice over.

## Verification

- **4 new integration tests against the real DB**, asserting **by identity, not by count** — "returns
  3 rows" would pass over the hole the moment a fixture changed, and a count assertion is what makes
  a leak look like a pagination quirk.
- One of them pins the general property: **an unknown role name returns NOTHING rather than
  everything.** Failing *closed* on an unrecognised filter is the actual lesson here.
- **RED-verified:** neutering the exclusion fails exactly the two citizen assertions and leaves the
  role tests green — the right two, for the right reason.
- Existing staff suites unaffected: **45 passed**. `tsc` 0, `eslint` 0.

⚠️ **The test found a bug in the fix on its first run.** Inside `db.query.users.findMany`, Drizzle
renders `${roles.id}` as `"users"."id"` — the outer relation's alias — so the subquery referenced a
column that does not exist (`42703`). Rewritten with an explicit `r` alias. Had the test asserted "the
call succeeds" instead of "who comes back", it would have gone green over a broken query.

## Known limits

1. **The registry DATE filter is NOT fixed here.** Traced end to end — picker → `updateFilter` →
   `registry.api` → controller zod (accepts ISO *and* `YYYY-MM-DD`) → `buildFilterConditions`
   (`r.created_at >= $1::timestamptz`), used by both the list and the count. **It reads as correct and
   the operator observed it not working**, so it needs a measurement, not a guess. Pending: the
   Network-tab evidence of whether `dateFrom` appears in the request.
2. **A suspicion recorded, not acted on:** `new Date('2026-08-09').toISOString()` is UTC midnight =
   **01:00 WAT**, so "today" would silently exclude anyone registered in the first hour of the
   Nigerian day. Real if true, but it is not the symptom described — do not fix it blind.
3. Only two consumers of this endpoint exist (the picker and the Staff page) and **both** want
   citizens excluded, which is why a service default was safe. A third consumer wanting all users
   must opt in and say why.

## Residuals

| ID | Item | State | Evidence / trigger | Owner |
|---|---|---|---|---|
| **R1** | **The registry DATE filter does not work.** Traced end to end (picker → `updateFilter` → `registry.api` → controller zod → `buildFilterConditions`) and it reads as correct, but the operator observed it failing. Known limit #1. | **RE-HOMED — needs a story.** NOT 13-61's debt: a separate defect found during the same investigation, outside this story's scope. It is deliberately **not** marked ACCEPTED, because ACCEPTED requires a *measurement* and only an operator observation exists. | **Reopen/close trigger:** the Network-tab evidence of whether `dateFrom` actually appears in the request. That one observation decides client-vs-server and turns this into a one-line fix or a real story. **Do not fix it blind.** | **Awwal / PM triage** — carried as an input to `sprint-change-proposal-2026-08-09-portfolio-triage.md` rather than minted as a story unilaterally, since that triage is actively compressing the board. |
| **R2** | `new Date('2026-08-09').toISOString()` is UTC midnight = **01:00 WAT**, so "today" would silently exclude anyone registered in the first hour of the Nigerian day. Known limit #2. | **ACCEPTED** | Measurement: the offset is 1h, structural, and provable from the expression itself. Trigger: **reopen the moment R1's Network-tab evidence shows `dateFrom` IS being sent** — at that point this becomes the leading hypothesis rather than a suspicion. | Awwal / PM triage (rides with R1) |
| **R3** | The `includePublicUsers` opt-in has **no caller**. | **ACCEPTED** | Measurement: 2 consumers of this endpoint exist (picker + Staff page) and both want citizens excluded. Trigger: a third consumer needing all users must opt in **and say why in the PR**. | dev |

⚠️ **R1 is the reason this story's `Status:` was interrogated before being left at `done`.** §2a0 forbids
`done` while an item is unresolved — the resolution here is that R1 is *out of scope*, not *unfinished*.
That distinction is only legitimate because it is written down with an owner and a trigger; left as a
prose "Known limit", it would have become one more of the 299 unchecked boxes D4 exists to catch.

⚠️ **KNOWN GAP — the 13-45 guard is NOT watching R1, and its green must not be read as approval.**
`lint-story-residuals.ts` flags a row only when the STATE cell contains the literal token `OPEN`
without a closure marker (`src/lib/story-residual-guard.ts:61-63`). **`RE-HOMED` is a word the guard
has never heard of**, so this row passes silently — the guard is neither approving it nor blocking it.
Verified by running the guard directly against this tree (316 stories, exit 0) *after* the pre-commit
lint reported `FULL TURBO` from cache, which had scanned an older version of this file — **Pitfall #47,
a cached gate is not a passed gate.**

This row is therefore tracked by **prose and by the owner named above, not by CI**. It is exactly
[[pattern-test-that-passes-over-a-hole]] pointed at my own edit: *would this guard fail if R1 were
genuinely abandoned?* No. **Decide at the triage** whether the honest fix is (a) a vocabulary the guard
recognises, or (b) the date filter leaving this ledger entirely for a story of its own — which is the
real answer, since it is a separate defect that was never in 13-61's scope.

## Notes

- Sibling of the `roleFilter`/`pageSize` class: **[[pattern-ship-a-fix-that-never-fires]] applied to a
  FILTER.** The filter was written, sent, and never applied — and because the failure direction was
  permissive, it looked like a working page with too many rows.
- A super-admin page listing 114 citizens by name is closer to a data-exposure issue than a cosmetic
  one, which is why this was hotfixed rather than queued behind Epic 12.

## Closing verdict

**CLOSED — `done`. Deployed SHA `189bbe2`, verified on production 2026-08-10.**

For 24 hours this story read `done` / "SHIPPED" while the commit sat **unpushed on local `main`** —
committed is not shipped, and the fix was not protecting anyone. That gap is the reason this block
exists ([[pattern-a-record-about-the-work-is-not-the-work]]).

| Gate | Evidence (re-runnable) |
|---|---|
| Full suite | `git push` pre-push gate green: **api 3683 passed** / 8 skipped / 1 todo, **web 2854 passed**, utils 126, testing 64 |
| CI | `CI/CD Pipeline` **31381818869** success — `lint-and-build`, `test-api`, `test-web`, `auth-smoke`, **`smoke-e2e`**, `deploy` all green; `E2E Tests` **31381818949** success |
| Deploy landed | VPS `git rev-parse --short HEAD` = **`189bbe2`**; `pm2` `oslsr-api` **online, restarted** (restart #92); health **200** |
| Deployed code carries the fix | `staff.service.ts:124` the `public_user` exclusion, `:133` the role-by-name filter — grepped **on the VPS**, not locally |
| **Behaviour on real prod data** | `users` = **124**, of which **120 are `public_user`**. The new predicate returns **4**. → **120 citizens are no longer enumerable by name from a staff endpoint.** |
| **Fail-closed property** | an unknown role name returns **0** rows on production data — the general property the tests pin, confirmed against the live table rather than a fixture |
| Picker correctness | the 4 survivors are 2 enumerators (1 `active`, 1 `deactivated`) + 2 super admins; `role=enumerator&status=active` → **1**, so the deactivated test account is excluded. Third symptom confirmed fixed. |

⚠️ **Measurements carry their SHA.** The body's "114 citizens beside 3 staff" was true when written
(`0ab4574`); at `189bbe2` it is **120 beside 4**. The registry grew; nothing regressed.

📋 **Field-readiness observation, not a defect:** production holds exactly **one active enumerator
account** (`Lawal Kolade`). No field officers are provisioned. Belongs to the pre-field checklist
(SCP §5.0), alongside 13-59/13-60 from the enumerator invite dry run.

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

## Notes

- Sibling of the `roleFilter`/`pageSize` class: **[[pattern-ship-a-fix-that-never-fires]] applied to a
  FILTER.** The filter was written, sent, and never applied — and because the failure direction was
  permissive, it looked like a working page with too many rows.
- A super-admin page listing 114 citizens by name is closer to a data-exposure issue than a cosmetic
  one, which is why this was hotfixed rather than queued behind Epic 12.

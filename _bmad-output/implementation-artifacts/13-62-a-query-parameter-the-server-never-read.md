# Story 13.62: A query parameter the server never read

Status: ready-for-dev

<!-- EMERGENT 2026-08-10, written by John (PM) generalising 13-61. Carved OUT of
sprint-change-proposal-2026-08-09-portfolio-triage.md C10 on Awwal's ruling: an action that stays in
an SCP as a table row is an action that never fires. NOT a field-day gate — see Notes. -->

## Story

As **an operator making a decision from a filtered list**,
I want **a filter I set to either be applied or to fail loudly**,
so that **I am never shown more than I asked for and told nothing.**

## Context — the class, not the instance

13-61 fixed one call site. The registry's enumerator picker sent
`/staff?roleFilter=enumerator&pageSize=500`; `staff.controller` reads
`{ page, limit, status, roleId, lgaId, search }`. **Neither name existed.** Both were dropped in
silence and the endpoint returned the unfiltered user table — 124 rows where the answer was 4.

⚠️ **A WRONG PARAMETER NAME FAILS PERMISSIVELY.** No 400, no 404, no log. That failure direction is
what let it survive review, testing and months of production: every symptom looked like a UI bug
while the endpoint behaved exactly as written. Sibling of
[[pattern-ship-a-fix-that-never-fires]] pointed at a *filter*.

**`pageSize` was not invented — it was borrowed.** Measured 2026-08-10:

| dialect | controllers |
|---|---|
| `pageSize` | assessor · export · fraud-detections · marketplace · productivity · respondent (**6**) |
| `limit` | staff · reveal-analytics (**2**) |

The web dev wrote the name that works on six other endpoints. **`/staff` is the outlier and the
caller was being consistent.** And there is **no `.strict()` query validation anywhere in the API** —
the only strict schemas are on registration's *body* (`validation/registration.schema.ts:83,86`). So
unknown query params are silently dropped API-wide, and nothing in the codebase can currently notice.

### ⚠️ The expected result of this audit is CLEAN. Read this before starting.

The PM spot-checked four of the hardcoded-name sites on 2026-08-10 and **all four are read by their
controllers**:

| call site | param | server reads it at |
|---|---|---|
| `official.api.ts:29` `/reports/registration-trends?days=` | `days` | `report.controller.ts:60` |
| `submission.api.ts:54` `/forms/submissions/my-counts?scope=team` | `scope` | `form.controller.ts:261` |
| `submission.api.ts:64` `/forms/submissions/daily-counts?days=` | `days` | `form.controller.ts:314` |
| `reveal-analytics.api.ts:10,15,20` `?days=&limit=` | `days`,`limit` | `reveal-analytics.controller.ts:6-7` (zod) |

**So this story is not a bug hunt, and must not be sold as one.** Its value is (a) converting "we
think the rest are fine" into evidence, and (b) the guard that stops the class returning. A clean
audit is a *result*, not a wasted story — and it must be recorded as such rather than quietly
dropped, which is how a green gate becomes indistinguishable from a skipped one.

## Acceptance Criteria

### AC1 — The audit, and the table IS the deliverable

1. Enumerate every web→API call site that carries a query string. Measured 2026-08-10: **15 inline
   sites** (`apiClient('…?…')`) plus **118 `URLSearchParams` lines**. Re-derive, do not trust the count:
   ```bash
   grep -rnoE "apiClient\(\s*[\`']/[a-zA-Z0-9/_-]+\?[^\`')]*" apps/web/src --include=*.ts --include=*.tsx | grep -v __tests__
   ```
2. ⚠️ **The inline sites are the risk class; the typed builders are largely not.** `staff.api.ts`
   builds its params through a `ListStaffParams` interface and was correct. `registry.api.ts` wrote a
   literal and was wrong. **Prioritise literals, but do not skip the builders** — a builder can hold a
   wrong name just as easily; it merely holds it in one place.
3. For each site, record `sends` vs `server reads`, with `file:line` **on both sides**. A row without
   a server-side citation is not audited.
4. The four rows above are already done; carry them in with their citations rather than re-deriving.

### AC2 — Fix what it finds, at the default, not at the caller

1. Any mismatch found is fixed **13-61's way**: where a missing filter can return more than was asked
   for, the safe value becomes the **service default**, so a caller that forgets cannot over-fetch.
   Fixing only the query string leaves the next caller exposed.
2. Any endpoint whose unknown filter returns *everything* must be changed to return **nothing**.
   Failing closed on an unrecognised filter is the property; today's param name is just the symptom.
3. If the audit is clean, this AC closes as **"no mismatches found"** with the AC1 table as evidence.

### AC3 — The guard — this is the actual deliverable

1. A drift guard that **fails when a web call site sends a query parameter no controller reads.**
   Precedent: 13-54's respondent-write drift guard.
2. ⚠️ **RED-verify by restoring the bug.** Put `roleFilter`/`pageSize` back into `registry.api.ts` and
   assert the guard reds. A guard that has never failed has never been shown to work —
   [[pattern-test-that-passes-over-a-hole]].
3. 🚨 **THE GUARD MUST RUN ON THE COMMITS IT POLICES — this is a real, measured trap, not a caution.**
   13-45's residual guard runs inside `@oslsr/api:lint`, which declares no inputs, so turbo hashes only
   `apps/api`; the stories it inspects live at repo root. Three consecutive pre-commit runs replayed
   the identical hash with a story edited between them (measured 2026-08-09, handoff §2y / commit
   `2d9bc1e`). **A guard whose cache key omits the artefact it inspects cannot fire.** This guard reads
   `apps/web` *and* `apps/api`; if it is attached to a task hashing only one of them, it is born with
   13-45's defect. Declare the inputs explicitly and **prove it** by editing a web file and watching
   the guard re-run rather than replay.
4. Read the guard's output once on its first green run — Pitfall #47, and §2a2.

### AC4 — The picker must admit when it truncates

1. `registry.api.ts:82` now sends `limit=100`, the server caps `limit` at 100
   (`staff.controller.ts:44`), and the picker has **no pagination**. Past 100 active enumerators it
   silently truncates — **the same permissive failure direction 13-61 just fixed, re-armed at a
   higher threshold.**
2. `StaffListResponse` carries pagination metadata alongside `data`. The picker compares what it
   received against the total and **says so in the UI** when they differ.
3. ⚠️ **A written "reopen if enumerators > 100" trigger is NOT an acceptable substitute.** A trigger
   contingent on someone remembering is [[pattern-ship-a-fix-that-never-fires]], and this project's
   top defect class. A page that admits it truncated needs nobody to remember anything.
4. RED-verify: seed 101 active enumerators (or stub the total), assert the notice appears.

## Out of scope — deliberately, and these are the risky half

- ⛔ **Runtime `.strict()` rejection of unknown query params.** This inverts the failure direction from
  "returns too much" to "400s", across 8 controllers and every list consumer. Shipping that into a
  field push, a radio jingle and a client assessment converts a silent over-fetch into a visible
  outage. **Backlog, named owner, sequenced after the field work.**
- ⛔ **Merging the `pageSize`/`limit` dialects.** Same reason. The audit's evidence is what should size
  it; if AC1 comes back clean, this drops to hygiene.
- The registry **date filter** (13-61 R1). Separate defect, no measurement yet, and it discharges for
  free during the §5.0 item-0 export walk. Do not fix it blind.

## Notes

- **NOT a field-day gate.** The field-day set is 13-57 + 13-59 + 13-60 + enumerator accounts + the
  13-4 R8 briefing; 13-46 gates the jingle. This is the hotfix batch — it ships alongside, and must
  not become a fifth gate.
- Kept separate from 13-46 on purpose: 13-46 is burst readiness, and mixing an unrelated audit into it
  makes both harder to verify.
- Rooted in the same class as SCP **F7** (an Audit Queue whose empty screen reads as "nothing wrong")
  and [[pattern-monitor-measuring-something-else]]. 2026-08-09/10 produced **five** instances in one
  session: a pipe returning `tail`'s exit code, a cached lint scanning a deleted file, a guard whose
  cache key omits its artefact, a missing `NOT IN` returning 124 rows for 4, and a monitor that could
  never emit. **Every one reported success or silence while measuring nothing.** That is the standing
  argument for renaming Epic 12 to what it actually is (SCP C2/F3).

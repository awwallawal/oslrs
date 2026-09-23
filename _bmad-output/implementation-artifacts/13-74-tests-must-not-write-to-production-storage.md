# Story 13.74: A test wrote to production storage for seven months, and the flake was the only brake

Status: ready-for-dev

<!--
Authored 2026-09-23 by the adjudication agent, from a finding made while adjudicating Story 13-71.

SOURCE OF SCOPE: 13-71 adjudication. The trigger was a skip-count wobble (API suite skips moving
8 ↔ 9) that looked like noise and was worth exactly one query to name.

⚠️ TIER: correctness of the TEST ESTATE, not of the product. Nothing user-facing changes. But it is
not cosmetic either — the defect wrote to the same DigitalOcean Spaces account that holds the
backups, and it did so from every developer laptop that happened to have network at the time.

⛔ THE IMMEDIATE DAMAGE IS ALREADY CONTAINED. Do not re-do these; verify them and move on:
  • teardown added to `auth.activation.test.ts` (2026-09-23) — verified by before/after count,
    net zero objects across a full run of that file;
  • 1,624 test-litter objects deleted from the live bucket under explicit authorisation
    (Awwal, 2026-09-23), 58.33 MB, with the 2 unattributed objects deliberately preserved;
  • `scripts/audit-staff-photo-orphans.ts` (read-only) and
    `scripts/purge-staff-photo-test-litter.ts` (guarded, size-scoped) are in the tree.
  This story is about the CLASS that let it happen, which is still wide open.
-->

## Story

As **the person who has to be able to say what is in production storage and why**,
I want **the test suite to be structurally incapable of writing to the production bucket**,
so that **an integration test cannot quietly deposit objects in the account that holds our backups, and a network flake is never again the only thing limiting the blast radius.**

## Context — what actually happened, measured

`auth.activation.test.ts` → "Activation with Selfie (S3 Integration)" uploads a generated selfie and
asserts the stored S3 keys. It reads `S3_*` straight from the repo-root `.env`, which on a developer
machine holds **production** credentials for `oslsr-full-access` on `sfo3.digitaloceanspaces.com`. It
never deleted anything.

Measured read-only on the live bucket, 2026-09-23:

| | |
|---|---|
| objects under `staff-photos/` | **1,658** (60.9 MB), oldest 2026-02-04 |
| referenced by production | **32** |
| orphans | **1,626** |
| attributable to the test fixture, by EXACT byte length | **1,624** |
| genuinely unattributed | **2** — one real activation pair, 2026-02-06 |

⭐ **The discriminator was exact byte length**, and it only worked because the fixture is a
deterministic 800×600 gradient: 813 objects at exactly 43,268 B and 811 at exactly 32,049 B. A real
selfie has an essentially unique length. Without a deterministic fixture this would not have been
separable at all, and the honest answer would have been "we cannot tell, so we cannot delete".

⛔ **Two things made this survive seven months:**
1. **The skip looked like noise.** The block skips when creds are missing (`it.skipIf`) *or* when a
   5-second HEAD probe to the live endpoint fails (`ctx.skip()`) — **two different reasons that are
   indistinguishable in the report.** The suite total moved 8 ↔ 9 and everyone read it as weather.
2. **The failure mode was silent and cumulative.** Nothing errored, nothing slowed down, and the
   only signal was a bucket nobody listed.

## Acceptance Criteria

1. **AC1 — A test run CANNOT reach the production bucket, by construction rather than by discipline.** The test harness refuses to use S3 settings that point at the production bucket. ⛔ Not a lint, not a comment, not a code-review habit: the same class already defeated one comment and a five-week sweep. ⭐ Precedent to copy: `vitest.setup.ts`'s existing **db-guard**, which refuses to run the suite against a non-test database and names the database in the message.

2. **AC2 — RED-VERIFY IT THE WRONG WAY ROUND (§2ae).** Point the harness at the production bucket on purpose and confirm it **objects, by name**. A guard that stays silent when abused is a comment. Assert the message names the offending bucket.

3. **AC3 — The two skip reasons become distinguishable.** A run must be able to say *"skipped: no S3 configured"* versus *"skipped: endpoint unreachable"*. ⛔ Today both render as one anonymous skip, which is why the wobble was unreadable [[pattern-a-clean-result-must-prove-it-measured]].

4. **AC4 — Whatever the test writes, it removes, and the teardown is proven by measurement.** The `afterAll` added 2026-09-23 stays and gains a test-visible assertion. ⭐ Prove it the way it was proven at adjudication: count the prefix before and after a full run of the file and show **net zero**, rather than trusting the absence of an error.

5. **AC5 — Decide the target, and write the decision down.** Either a dedicated test bucket, or a local MinIO container in `docker-compose`, or the S3 client is faked at this layer. ⚠️ Faking loses the only end-to-end proof that a real upload round-trips, which is what this test exists for — so if that is the choice, say what covers that instead.

6. **AC6 — Sweep the estate: this test is one instance of a class.** `grep` the suites for every other test that constructs a real S3/network client from `.env`, and dispose of each: fixed, allow-listed with a reason, or recorded. ⛔ Fixing only the instance in front of you is this project's most repeated expensive mistake (§2o, §2ac). **Report the count, even if it is one.**

7. **AC7 — The audit stays runnable and stays read-only.** `scripts/audit-staff-photo-orphans.ts` keeps working and keeps having no delete path. ⚠️ Its header records that its FIRST version compared the production bucket against the LOCAL dev database and listed a live staff member's ID card as an orphan — do not re-introduce a database import.

8. **AC8 — No product behaviour changes.** `git diff` touches test harness, scripts and config only. No `src/` runtime path, no schema.

## Tasks / Subtasks

- [ ] **Task 1 — Reproduce the hazard before changing it** (AC: #1, #2)
  - [ ] 1.1 Confirm the current state: the block reads `S3_*` from the root `.env` and the repo has exactly one `.env` (`apps/web/vite.config.ts` sets `envDir: '../../'`).
  - [ ] 1.2 Read `vitest.setup.ts`'s db-guard end to end — including §2ae's correction that it must use `dotenv.parse`, never `dotenv.config()`, or it injects forty variables to learn one.
- [ ] **Task 2 — The guard** (AC: #1, #2)
  - [ ] 2.1 Refuse a production-looking bucket in the test harness; name the bucket in the error.
  - [ ] 2.2 RED-verify by pointing it at production on purpose. Record the observed message.
- [ ] **Task 3 — Distinguishable skips and a proven teardown** (AC: #3, #4)
- [ ] **Task 4 — Choose and implement the target** (AC: #5)
- [ ] **Task 5 — Sweep for siblings** (AC: #6) — report the count.
- [ ] **Task 6 — Gates** (AC: #8) — tsc, eslint, three drift guards DIRECT, both suites; quote SUITE totals; explain every delta.

## Dev Notes

### The number that should have been read three months ago

An 8 ↔ 9 skip wobble was visible in every close-out that quoted suite totals. §2ah already says an
unexplained test-count delta is unrecorded work until proven otherwise — **and a SKIP delta is the
same claim wearing a quieter coat.** One query would have named it.

### ⛔ The near-miss inside the fix, recorded because the correction is the useful part

The first version of the audit script imported `db` and queried `users`. On a laptop that resolves
`DATABASE_URL` to the dev database, it compared **production bucket objects against dev database
references** and duly listed `staff-photos/id-card/01a0b076-…jpg` — a real staff member's ID card —
as an unattributed orphan. Had that list been piped into a delete, it would have destroyed live data.

⭐ §2y(d) with the stakes raised: **the query was right and the SOURCE was wrong, which looks
identical to being right.** The script now refuses to infer the reference set and demands a file
produced by a documented read-only production query, rejecting an empty or malformed one — because
an empty reference set marks every object an orphan, which is a clean-looking maximally-wrong result.

### What is deliberately NOT in this story

- Deleting the remaining 2 unattributed objects. They are a genuine 2026-02-06 activation pair whose
  user was later removed. **Unreferenced is not worthless**; leave them until someone decides.
- Any change to selfie capture, ID-card rendering or activation behaviour.

## References

- [Source: apps/api/src/__tests__/auth.activation.test.ts] — the block, its two skip paths, and the teardown added 2026-09-23
- [Source: apps/api/scripts/audit-staff-photo-orphans.ts] — read-only audit; its header carries the near-miss
- [Source: apps/api/scripts/purge-staff-photo-test-litter.ts] — guarded, size-scoped deletion; three conditions, any one of which spares an object
- [Source: apps/api/vitest.setup.ts] — the db-guard, the precedent AC1 copies
- [Source: docs/adjudication-agent-handoff.md#2ae] — invoke a guard the wrong way and check it complains; and the `dotenv.parse` correction
- [Source: docs/adjudication-agent-handoff.md#2ah] — an unexplained count delta is unrecorded work
- [[project_backup_storage]] — the same DO Spaces account holds the backups

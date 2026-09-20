# Story 13.70: Limiter hygiene, and making a dated residual fire

Status: review

<!--
Authored 2026-09-19 by Bob (SM) via the canonical *create-story workflow
(_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml), run as *yolo.

SOURCE OF SCOPE: _bmad-output/planning-artifacts/brief-2026-09-17-story-13-70-limiter-hygiene-and-dated-residuals.md
(Adjudication Agent, 2026-09-17). Origin: the residual sweep after 13-68 found SIX rows open and
FIVE handed to stories that did not exist.

⚠️ TIER: debt closure. NOT field-blocking. Do not sequence it ahead of field work.
13-69 is `done` and deployed (`826147f`, 2026-09-19), so the brief's file-conflict caveat is moot —
it touched submission-processing and the fraud queue, never the limiters.

✅ BRIEF VERIFIED AGAINST THE TREE, 2026-09-19 (adjudication). Confirmed, not assumed:
  • FR2's proper-prefix collision is REAL — `rl:activation:` vs `rl:activation:ip:`
    (registration-rate-limit.ts) and `rl:password-reset-complete:` vs `…:ip:`
    (password-reset-rate-limit.ts).
  • FR3's two limiters exist — registration-rate-limit.ts:113 `registrationEmailRateLimit`,
    wizard-draft-rate-limit.ts:149 `wizardDraftEmailRateLimit`.
  • PRD NFR4.4.d EXISTS and is NORMATIVE, carrying both the "A refusal is not a request" clause
    and R2b's dated 2026-10-15 follow-up.

⛔ ONE CORRECTION TO THE BRIEF, FOUND DURING AUTHORING, AND IT CHANGES FR4's SHAPE:
  The brief asks FR4 to make a DATED residual fail the build once its date passes. But
  `story-residual-guard.ts` matches residual ids with
  `RESIDUAL_ID = /^\s*~{0,2}\*{0,2}\s*(R\d+[A-Za-z0-9-]*)/` — **`R<digits>` only**.
  13-68's own ledger rows are `**A1**`, `**A2**`, `**A3**`, and **A1 is the residual FR1 exists to
  close.** The guard cannot see any of them today. Adding date parsing to a guard that never
  matches the row is [[pattern-ship-a-fix-that-never-fires]] built on purpose. FR4 therefore gains
  AC7: the id pattern must be widened (or the rows renamed) and RED-VERIFIED on a real A-row.
  ⭐ Independently confirmed the same day: adjudication wrote a ledger for 13-69 using `D1`/`D2`
  ids and the guard silently ignored it — recorded as playbook §2ab.1.

🕳️ ALSO NOTED, and it is this story's own theme biting again: **13-70 is absent from
`epics.md`.** It has a brief, and until this file existed it had no story and no board entry. The
brief was written because "five residuals were handed to stories nobody had written". Task 6.3
indexes it.
-->

## Story

As **the engineer who has to explain why a legitimate enumerator was refused**,
I want **the login limiters to stop charging people for their own refusals, to stop colliding in Redis, and to stop keying on unbounded user input — and I want a deferral that names a date to fail the build when that date passes**,
so that **the rate-limit family stops producing incidents that look like attacks and are actually us, and the remaining deferrals expire loudly instead of silently.**

## Acceptance Criteria

1. **AC1 — A refusal is not a request.** A 429 emitted by any login limiter is NOT counted by any other limiter mounted on the same route. RED-VERIFY by restoring the current behaviour: the new test must fail.

2. **AC2 — A CAPTCHA refusal is still counted.** A 400 from `verifyCaptcha` IS counted by the flood ceiling, so the ceiling keeps bounding the hCaptcha siteverify call. Asserted explicitly, not inherited.

3. **AC3 — ⛔ RULED: the skip is MARKER-BASED, not status-based. ⭐ TWO-PART ATTRIBUTION (§2al): OPTIONS costed by adjudication and RULING by Awwal, 2026-09-20; MECHANISM corrected by the dev pass, same day.** ⛔ **The ruling as adjudication wrote it was INCOMPLETE and would have shipped a no-op.** It specified `requestWasSuccessful` alone — but `express-rate-limit` consults that predicate **only** when `skipFailedRequests` or `skipSuccessfulRequests` is set (8.3.0 dist `index.cjs:912`, `if (config.skipFailedRequests || config.skipSuccessfulRequests)`), so the predicate alone is dead code. The dev found it and paired the predicate with `skipFailedRequests`. ⭐ **A ruling from adjudication is not exempt from the defect class the story is about** — this was [[pattern-ship-a-fix-that-never-fires]] authored into an AC by the person policing for it, and the dev's mutation of `skipFailedRequests` reds four tests, which is the proof the ruling's own form was insufficient. Adjudication re-verified dist:912 independently at close-out. The two limiters mounted *downstream* of the ceiling — `loginRateLimit` and `strictLoginRateLimit` — stamp `res.locals.rateLimitRefusedBy = '<limiter name>'` in their `handler` before responding; `loginIpFloodLimit` skips on `requestWasSuccessful: (_req, res) => !res.locals.rateLimitRefusedBy` **paired with `skipFailedRequests: true`, which is what makes the predicate execute**. Only the ceiling reads the flag, because being mounted FIRST it is the only limiter whose response listener observes every other limiter's 429 (`loginRateLimit` sits before `strictLoginRateLimit`, so strict never sees burst's refusal — mount-order finding M1 already covers that leg). ⛔ `verifyCaptcha` does NOT stamp — its 400 stays counted, per AC2.

   **Why not `res.statusCode !== 429` (the rejected Option A).** `express-rate-limit` increments on entry and calls `store.decrement(key)` from a `response.on('finish')` listener when `requestWasSuccessful` returns false (`express-rate-limit` dist, ~line 754 and 883–900). A status filter therefore makes the ceiling decrement **its own** 429s: the counter pins at `max`, oscillates, and the `attempts` field in the `auth.login_ip_flood_limit_exceeded` log line stops meaning "requests from this IP" — so the reopen trigger documented at `login-rate-limit.ts:113-116` becomes undiagnosable exactly when it fires (see R1). NFR4.4.d says a 429 emitted by one limiter must not be counted by any **other** limiter; it never asks a limiter to discount its own. The marker also makes every limiter later added to these routes declare itself explicitly instead of inheriting behaviour from a status code.

   **⚠️ RED-VERIFY THE DECREMENT IN BOTH DIRECTIONS — one direction proves nothing.** A `store.decrement()` that silently no-ops is indistinguishable from a working skip [[pattern-ship-a-fix-that-never-fires]]. The test must assert the flood counter **does NOT advance** when a downstream limiter refuses **AND DOES advance** on a genuine 401 (a credential spray produces 401s; if those stopped counting, the ceiling would be disarmed on the one axis that bounds a spray). Both assertions, or it is half a guard [[pattern-a-clean-result-must-prove-it-measured]]. ⛔ Scope honestly: `login-rate-limit.binding.test.ts` runs the **in-memory** store (see its header), so it proves the PREDICATE WIRING and cannot prove `rate-limit-redis@4`'s decrement — that half is R2, not this AC.

4. **AC4 — Two limiters with adjacent prefixes cannot collide on one key.** `rl:activation:` / `rl:activation:ip:` and `rl:password-reset-complete:` / `…:ip:` are proper-prefix pairs today. After this story no limiter prefix is a proper prefix of another, asserted by a test that enumerates the prefixes rather than checking the two known pairs.

5. **AC5 — An unbounded "email" yields a fixed-size Redis key.** A megabyte-long email produces a bounded key in BOTH `registrationEmailRateLimit` and `wizardDraftEmailRateLimit`, using the shipped `buildLoginRateLimitKey` shape (`e:<sha256>` / `ip:<ipKeyGenerator>`), not a new one.

6. **AC6 — A dated residual fails the build once its date passes — and an undated one does not.** BOTH directions, because a guard that only fires one way is half a guard. A row carrying `2026-10-15` / `DATED 2026-10-15` in its state or trigger cell fails when `today > date` AND the row is still open; a trigger-based row with no date never fails on time.

7. **AC7 — ⛔ THE GUARD MUST BE ABLE TO SEE THE ROW AT ALL.** `RESIDUAL_ID` matches `R<digits>` only, so `A1`/`A2`/`A3` in 13-68's ledger — including the residual FR1 closes — are invisible. Either widen the pattern or rename the rows, and **RED-VERIFY on a REAL row**: 13-68's `A1` set to a past date must red the guard and name the row. ⚠️ Without this, AC6 ships a date check that cannot fire on the story that motivated it.

8. **AC8 — The failure message carries the row's own text, not a line number.** The operator must be able to act without opening the story file.

9. **AC9 — R2a and R8 are CLOSED BY DECISION in the ledger, with numbers and reopen triggers.** R2a records **~480 guesses/day** as the ACCEPTED FIGURE against bcrypt + password policy + MFA, with the reopen trigger *any weakening of the password policy, or MFA ceasing to be mandatory for super-admins*. R8 records that the disclosure boundary is **response-side, not log-side** — the log distinguishes deliberately, which is what makes the cardinality monitor possible — owner John. ⭐ "Won't do, and here is why" is a CLOSED residual, not an open one.

10. **AC10 — The PRD's NFR4.4.d "NOT YET IMPLEMENTED" annotation is removed in the SAME commit that makes it true.** A PRD asserting a rule the code violates is the drift class this whole arc has been closing.

11. **AC11 — ⛔ THE DATE CHECK IS OPT-IN, AND THE BLAST RADIUS IS MEASURED BEFORE IT SHIPS.** Only a row carrying an explicit `DATED <iso>` marker is held to a deadline; a bare date sitting in an evidence cell must NEVER trigger it. **Measured 2026-09-19: `_bmad-output/implementation-artifacts/*.md` holds 955 table rows containing a date across 325 files, versus exactly ONE genuine `DATED` deferral marker (R2b's `DATED 2026-10-15`).** A naive "parse any date and fail when past" reds essentially the whole repo; a guard that reds everything gets disabled, and then it protects nothing. Assert the opt-in property with a test that feeds a row containing an evidence date and expects PASS.

12. **AC12 — `DATED` must not match inside `UPDATED`.** `/DATED 20\d\d-/` has a false positive on every `UPDATED <date>` line; use a word boundary (`\bDATED\b`), verified to exclude it. Pin with a test containing both strings — this cost the authoring pass a false finding and will cost the dev one too.

## Tasks / Subtasks

- [x] **Task 1 — FR1: stop the flood ceiling charging people for their own refusals** (AC: #1, #2, #3)
  - [x] 1.1 Read `apps/api/src/middleware/login-rate-limit.ts` — `loginIpFloodLimit` is `max: 100`, `windowMs: 15 * 60 * 1000`, prefix `LOGIN_IP_FLOOD_PREFIX`, mounted FIRST on the four login routes with no skip predicate.
  - [x] 1.2 ⛔ **The behaviour is ALREADY RULED — implement Option B, do not re-derive the choice** (AC3). Add `res.locals.rateLimitRefusedBy = '<name>'` to the `handler` of `loginRateLimit` and `strictLoginRateLimit`, then give `loginIpFloodLimit` `requestWasSuccessful: (_req, res) => !res.locals.rateLimitRefusedBy`. ⛔ Do NOT write `res.statusCode !== 429` — AC3 records why it was rejected. ⛔ Do NOT stamp in `verifyCaptcha` (AC2 requires its 400 to stay counted). Type the flag once (`Express.Locals` augmentation) rather than casting at each site.
  - [x] 1.2b ⚠️ **BOTH-DIRECTIONS RED-VERIFY of the decrement, in `login-rate-limit.binding.test.ts`** — it already has the `floodOnly` and `fullStack` harnesses and reads the stack from the real router; extend it, do not start a new file. Assert (a) the flood counter does NOT advance when a downstream limiter refuses, and (b) it DOES advance on a genuine 401. Then mutate: delete the stamp and confirm (a) reds; make the predicate always-false and confirm (b) reds. Record both observed reds, not the intention [[pattern-test-that-passes-over-a-hole]].
  - [x] 1.2c ⛔ **State plainly what that test CANNOT prove.** The binding file's own header says test mode builds each limiter with the **in-memory** store (`skip` is stubbed to production per-request, the store is not), so it exercises `MemoryStore.decrement()` — never `rate-limit-redis@4`'s. This is the same blind spot the prefix-collision comment names at `login-rate-limit.ts:23-34` ("the in-memory test store cannot see it"). Do not let an in-memory green be read as proof the prod decrement works; open R2 with whichever verification path you choose (real-Redis integration test, or a post-deploy read of the `attempts` field).
  - [x] 1.3 Implement, keeping CAPTCHA 400s counted (AC2).
  - [x] 1.4 RED-VERIFY: restore the current behaviour and confirm the AC1 test fails. Record the red count.
  - [x] 1.5 ⚠️ Mount order is part of the control (NFR4.4.a) — flood → verifyCaptcha → burst → strict. The order is documented at `apps/api/src/routes/auth.routes.ts:33` and `loginIpFloodLimit` is mounted on FOUR routes at `:43`, `:52`, `:186`, `:196`. Do not reorder; assert it still holds on all four.

- [x] **Task 2 — FR2: make the keyspaces disjoint** (AC: #4)
  - [x] 2.1 `registration-rate-limit.ts`: `rl:activation:ip:` vs `rl:activation:` — one is a proper prefix of the other.
  - [x] 2.2 `password-reset-rate-limit.ts`: `rl:password-reset-complete:ip:` vs `rl:password-reset-complete:` — same shape.
  - [x] 2.3 Make them disjoint. Low live impact; cheap while the files are open.
  - [x] 2.4 Assert the PROPERTY across all prefixes, not the two known pairs — a test that enumerates limiter prefixes and fails if any is a proper prefix of another. ⭐ Pin the class, not today's instances.

- [x] **Task 3 — FR3: hash the email keys** (AC: #5)
  - [x] 3.1 `registrationEmailRateLimit` (`registration-rate-limit.ts:113`) and `wizardDraftEmailRateLimit` (`wizard-draft-rate-limit.ts:149`) key on the raw normalised email.
  - [x] 3.2 Reuse `buildLoginRateLimitKey` (`login-rate-limit.ts:74`) — already shipped, tested and reviewed. ⛔ Do NOT write a second hasher [[feedback_canonical_primitive_backlog_sweep]].
  - [x] 3.3 Keep the `keyedBy` log field correct for both.
  - [x] 3.4 Test with a megabyte-long value in each; assert a bounded key both times.

- [x] **Task 4 — FR4: make a date fire** (AC: #6, #7, #8)
  - [x] 4.1 ⛔ FIRST: widen `RESIDUAL_ID` in `apps/api/src/lib/story-residual-guard.ts` (or rename the A-rows) so `A1` is matched at all. Nothing else in this task can work until it is.
  - [x] 4.1b ⛔ MEASURE FIRST, THEN TIGHTEN. Re-run the blast-radius count before implementing (AC11): dated rows vs genuine `DATED` markers. If the numbers have moved, say so — do not inherit 955/1.
  - [x] 4.1c Require the explicit `\bDATED\b <iso>` marker. ⚠️ Word boundary is mandatory: `DATED` matches inside `UPDATED` (AC12).
  - [x] 4.1d Define "today" explicitly — UTC, from a single injectable clock — so the guard cannot flip state at local midnight and cannot be untestable. Tests must pass a fixed date, never `new Date()`.
  - [x] 4.2 Parse a date from the residual's state or trigger cell (`2026-10-15` / `DATED 2026-10-15`). The STATE cell is the third column (`story-residual-guard.ts:19`, cells split at `:58`).
  - [x] 4.3 Fail when `today > date` AND `isOpenState(state)` (`:77`).
  - [x] 4.4 ⚠️ Do NOT make an undated residual fail — most rows are legitimately trigger-based.
  - [x] 4.5 Failure message carries the row's own text (AC8); extend `formatResidualHits` (`:152`).
  - [x] 4.6 RED-VERIFY BOTH DIRECTIONS on real rows: a past-dated open row reds; an undated trigger-based row passes. Then RED-VERIFY AC7 specifically using 13-68's `A1`.
  - [x] 4.6b Extend `apps/api/src/lib/__tests__/story-residual-guard.test.ts` — the guard already has a suite; do NOT start a new one.
  - [x] 4.7 Run the guard DIRECT, never through turbo — `_bmad-output/**` is outside the `lint` task's inputs, so a story-only change replays a stale verdict (playbook §2y(c)).

- [x] **Task 5 — FR5: close R2a and R8 by decision** (AC: #9)
  - [x] 5.1 R2a — escalating lockout: `users` has no lock-count column, so escalation needs a migration; plain decay leaves ~10 guesses/30 min = **~480/day**. Record 480/day as the accepted figure + the reopen trigger.
  - [x] 5.2 R8 — login error codes: messages help real users, the response is generically safe, and 13-68 closed the timing channel. Accept, owner John.
  - [x] 5.3 Write both into 13-68's ledger as CLOSED-BY-DECISION with their reasons. ⚠️ Use `R`-prefixed ids that the guard can actually match (AC7).

- [x] **Task 6 — Records: PRD, coverage table, board** (AC: #10)
  - [x] 6.1 Remove the NFR4.4.d "NOT YET IMPLEMENTED" annotation in the SAME commit that makes it true.
  - [x] 6.2 Update the NFR4.4.c threshold register for any budget/mode/key that moved, and `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts` with it. A limiter without an NFR4.4.c row fails that suite by design.
  - [x] 6.3 Add 13-70 to `epics.md`. ✅ The `sprint-status.yaml` entry was created at authoring (2026-09-19) — do not add a second one. It had been a brief with no board entry, which is the failure this story exists to stop.

- [x] **Task 7 — Gates, run yourself and quoted whole** (AC: all)
  - [x] 7.1 `pnpm --filter @oslsr/api exec tsc --noEmit`, eslint on every touched file, all three drift guards run DIRECT.
  - [x] 7.2 Full API + web suites. ⚠️ One vitest process at a time; free RAM > 3 GB before starting; do no other work while a gating suite runs.
  - [x] 7.3 Quote the SUITE total, never a subset, and capture the exit code to a file rather than reading a notification.

## Dev Notes

### What this story is really about

Three incidents, one habit. Registration's per-IP limiter was fixed 2026-08-07 and its siblings were "handed to a sweep" — activation carried the identical defect for five more weeks. Activation was fixed 2026-09-15 and its siblings were handed to a sweep again — password reset surfaced the next day. **This story closes the limiter debt that is real AND makes the remaining deferrals mechanically enforceable, so the next one cannot quietly expire.**

⭐ **Every incident in this family was a legitimate person, never an attacker.** NFR4.4.d states the FR1 clause in user terms deliberately. Keep that framing in any message text you write.

### The FR1 trap, and the ruling that resolves it — settled 2026-09-20, do not reopen

`express-rate-limit` applies its skip predicate in a **response listener**. A ceiling configured to skip 429s therefore skips **its own** 429s and stops counting at the limit. Each request is still refused, but the counter no longer advances — which is NOT what "a 429 emitted by one limiter MUST NOT be counted by any other limiter" says.

**Two options were put up; Option B was ruled (Awwal, adjudication 2026-09-20). AC3 carries the implementation and AC3's second paragraph the rejection reason.**

| | mechanism | why not / why |
|---|---|---|
| **A — status filter** | `requestWasSuccessful: (_req, res) => res.statusCode !== 429` | **REJECTED.** One line, but it over-applies NFR4.4.d: the clause is about *cross-limiter* counting, and A also discounts the ceiling's own refusals. The counter then means "non-429 responses", so 100 legitimate enumerators and a 5,000-request spray both read `100`. |
| **B — mark and ignore** | downstream limiters stamp `res.locals.rateLimitRefusedBy`; the ceiling skips on the flag | **RULED.** Matches the clause exactly, deletes the self-skip trap by construction (the ceiling's own 429s never set the flag), keeps the count meaning *requests*, and is greppable — a limiter added later opts in explicitly. |

⚠️ **The risk the ruling does NOT remove**, and the reason R2 exists: Option B still depends on `store.decrement()` working against `rate-limit-redis@4`, and the binding suite runs the in-memory store. A decrement that no-ops looks identical to a working fix. Also note `response.on('close')` decrements on a request aborted before it finished writing — a mobile enumerator on a dropping connection, which is this cohort's normal condition.

⭐ Both options keep genuine 401s counted (essential — a spray is a stream of 401s) and keep CAPTCHA 400s counted (AC2), so neither of those separates them. The count's *meaning* is what separates them.

### The FR4 constraint that decides the task order

`apps/api/src/lib/story-residual-guard.ts`:

- `RESIDUAL_ID = /^\s*~{0,2}\*{0,2}\s*(R\d+[A-Za-z0-9-]*)/` — **`R<digits>` only.** `R2b` matches (`R2` + `b`); **`A1` does not.**
- `TABLE_ROW = /^\|(.+)\|\s*$/gm` — a row without a trailing `|` is invisible. This has already cost one session a wrong conclusion.
- `OPEN_MARKER = /\bOPEN\b|\bDISCHARGE-ON-(?:PUSH|DEPLOY)\b/`, cancelled by `CLOSED` / `✅` / `RESOLVED` / `DISCHARGED`.
- `HAS_LEDGER = /^\s*#{2,4}\s+Residuals\b/im` — ⛔ **the presence of a ledger DISABLES the prose fallback.** So a ledger with unmatched ids is strictly worse than no ledger at all.

⭐ **Therefore Task 4.1 comes first.** Date parsing added on top of an id pattern that skips the row is a fix that cannot fire.

### ⛔ FR4's blast radius, measured before the guard is written (A12)

| measurement (2026-09-19) | value | how |
|---|---|---|
| table rows containing ANY date | **955** across **325** files | `grep -rhoE "\\|[^|]*\\b20[0-9]{2}-[01][0-9]-[0-3][0-9]\\b[^|]*\\|" _bmad-output/implementation-artifacts/*.md \| wc -l` |
| genuine `DATED <iso>` deferral markers | **1** (R2b, `DATED 2026-10-15`) | `grep -rhoE "\\bDATED\\b 20[0-9]{2}-.." … ` |
| `UPDATED <date>` false positives for a boundary-less pattern | 1 today, and it fooled the authoring pass | see AC12 |

⭐ **This is why the check must be OPT-IN.** Most dates in these files are evidence — *"measured 2026-09-18"*, *"fixed 2026-08-07"* — not deadlines. Failing on any past date reds the repo; the narrow rule reds exactly the rows that asked to be held to a date. Same shape as 13-45's ledger guard, where the broad rule would have flagged 204 of 213 and the narrow one flagged 2.

⚠️ **And expect FR4 to red real work the day it ships — that is the point, not a defect.** R2b's 2026-10-15 will fail the build on 2026-10-16 unless the monitor exists or the row is re-dated with a reason. Do not soften the guard to avoid that; it is the whole deliverable.

### Threshold facts measured 2026-09-19 (A12 — value + date + how)

| fact | value | source |
|---|---|---|
| `loginIpFloodLimit` | `max: 100` / 15 min, mounted first, no skip predicate | `login-rate-limit.ts:109-116` |
| ⚠️ the ceiling's documented **headroom assumption** | *"the enumerator cohort is 17 people — every one of them failing five times is 85"* against `max: 100` | `login-rate-limit.ts:113-116` — see **R1**, the assumption is about to move |
| enumerator cohort, actual | **17 provisioned, 8 logged in**; 9 locked out and queued for re-provisioning | `docs/adjudication-agent-handoff.md:1107` |
| key model to copy | `e:<sha256(lowercased email)>` else `ip:<ipKeyGenerator>` | `login-rate-limit.ts:74-78` |
| R2b's date | **2026-10-15**, acceptance = demonstrated firing | 13-68 + PRD NFR4.4.d |
| R2a's accepted figure | **~480 guesses/day** | brief FR5 |

### Out of scope — record, do not widen into

- The login axis itself (13-68, shipped) and the fraud engine (13-69, done on prod `826147f`).
- `magicLinkRateLimit`'s 3/IP/hour on token-bearing routes — **latent scaling risk, P2, measured 0 refusals in 14 days.** Lane C follow-up. Record it; do not touch it here.
- Any change to an authentication flood ceiling is a security change requiring dev-story + adversarial review, never an inline fix (NFR4.4.d).

### Project Structure Notes

- Limiters live flat in `apps/api/src/middleware/*rate-limit*.ts` — 17 files, no subdirectory. Do not invent one.
- The guard is a library + a thin runner: logic in `apps/api/src/lib/story-residual-guard.ts`, runner at `apps/api/scripts/lint-story-residuals.ts`. ⚠️ `scripts/` is OUTSIDE tsconfig — RUN it, do not trust `tsc` for it.
- Coverage map/test: `rate-limit-coverage.test.ts`. A limiter without an NFR4.4.c row fails it by design.
- No new env vars. If that changes, prod `.env` must be updated BEFORE deploy (A9 / SEC-3 crash loop).

### References

- [Source: _bmad-output/planning-artifacts/brief-2026-09-17-story-13-70-limiter-hygiene-and-dated-residuals.md] — FR1–FR5, AC seeds, out-of-scope, sequencing
- [Source: _bmad-output/planning-artifacts/PRD.md#NFR4.4.d] — governance/observability, "a refusal is not a request", attribution, cardinality monitor dated 2026-10-15
- [Source: _bmad-output/planning-artifacts/PRD.md#NFR4.4.a] — identity axis; mount order is part of the control
- [Source: _bmad-output/planning-artifacts/PRD.md#NFR4.4.c] — threshold register; enforcement via `rate-limit-coverage.test.ts`
- [Source: apps/api/src/middleware/login-rate-limit.ts:74] — `buildLoginRateLimitKey`, the shape FR3 copies
- [Source: apps/api/src/middleware/login-rate-limit.ts:109] — `loginIpFloodLimit` definition
- [Source: apps/api/src/middleware/registration-rate-limit.ts:113] — `registrationEmailRateLimit`
- [Source: apps/api/src/middleware/wizard-draft-rate-limit.ts:149] — `wizardDraftEmailRateLimit`
- [Source: apps/api/src/routes/auth.routes.ts:33,43,52,186,196] — documented mount order + the four login routes
- [Source: apps/api/src/middleware/__tests__/login-rate-limit.binding.test.ts] — the `floodOnly` / `fullStack` harnesses AC3's both-directions test extends; its header states the in-memory-store limit that R2 records
- [Source: apps/api/src/middleware/login-rate-limit.ts:113-116] — the ceiling's headroom assumption and its reopen trigger (R1)
- [Source: docs/adjudication-agent-handoff.md#1107] — cohort 17 provisioned / 8 logged in / 9 locked out (R1's live input)
- [Source: apps/api/src/lib/story-residual-guard.ts:80] — `REOPEN TRIGGER` in a state cell makes the row invisible; triggers belong in the evidence column
- [Source: apps/api/src/lib/__tests__/story-residual-guard.test.ts] — the guard's existing suite; extend it
- [Source: apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts] — NFR4.4.c enforcement
- [Source: apps/api/src/lib/story-residual-guard.ts:19,58,77,99,110,152] — STATE is the third column; id/row/open-state predicates
- [Source: _bmad-output/implementation-artifacts/13-68-login-rate-limit-identity-axis.md] — A1/A2/A3 ledger rows and the R2a/R2b/R4/R5/R7/R8 prose residuals
- [Source: _bmad-output/project-context.md#Team-Agreements] — A4 (split >15 tasks), A12 (dated numbers), A13 (recorded measurement attempts)
- [Source: docs/adjudication-agent-handoff.md#2ab.1] — a ledger with non-conforming ids is worse than no ledger

## Residuals

⚠️ **This ledger's existence DISABLES the prose fallback for this file** (`HAS_LEDGER` at `story-residual-guard.ts:97`). Verified at authoring: 13-70's prose carried no `PRE-DEPLOY|UNDISCHARGED|OUTSTANDING RESIDUAL` or `DISCHARGE-ON-*` marker, so nothing was hidden by adding it. Any future residual in this story MUST be a row here — prose will no longer be seen [[docs/adjudication-agent-handoff.md#2ab.1]].

⛔ **Ids are `R<digits>` so `RESIDUAL_ID` matches them, and every row ends with a `|` so `TABLE_ROW` sees it.** *(Updated 2026-09-20: FR4 widened the pattern to `[RA]\d+` — measured, `[A-Z]\d+` would have matched 510 rows instead of 229 and produced two false hits. `R`-ids remain the convention; nothing here relies on the widening. ⚠️ Also keep literal `|` out of a cell: the guard splits rows naively, so an escaped pipe shifts every column after it — 13-68's R2a row is the live example.)* The reopen trigger lives in the **evidence** column, never the state cell: `isOpenState` returns **false** for any state containing `REOPEN TRIGGER` (`story-residual-guard.ts:80`), so a trigger written into column 3 would make the row invisible — the exact class AC7 exists to close.

| ID | Severity | State | Re-runnable evidence | Owner |
|---|---|---|---|---|
| **R1** — the flood ceiling's headroom was sized against a number that was never a headcount. `login-rate-limit.ts` sized `max: 100` on *"the enumerator cohort is 17 people — every one of them failing five times is 85"* | **Medium** — never a defect in the code, an assumption whose input was about to move. Fails CLOSED on legitimate users, which is the incident family NFR4.4.d names | ✅ **CLOSED — ACCEPT `max: 100`. ⭐ TWO-PART ATTRIBUTION (see §2al): EVIDENCE by the adversarial review, 2026-09-20 — the arithmetic, the concurrency figure and the reopen trigger below are its work, none of it pre-existing; RULING by Awwal at adjudication, 2026-09-20, ratified after the attribution was questioned and the evidence re-verified.** ⛔ It was first recorded as "CLOSED BY DECISION (Awwal, 2026-09-20)" by the review, which had assembled everything a ruling needs but had not obtained one — corrected at adjudication rather than left to read as more settled than it was. ⭐ The decision turns on something this story itself changed. Until FR1 the binding constraint was **ONE PERSON** — five real attempts plus up to 95 of their OWN refusals reached 100 and shut their whole proxy for fifteen minutes. It now takes ~17 simultaneous people to spend the same budget, against a MEASURED concurrency of three. FR1 did not raise the number; it changed who can spend it. ⛔ And raising it now would contradict a settled ruling whose precondition is unmet — see **R5** | **The arithmetic that replaced the comment, measured read-only on prod 2026-09-20 08:25 WAT:** 28 enumerator accounts, NINE of them the operator's own harness logins → **19 real field accounts** (11 logged in, gap 8). "17" had mixed field staff with the test harness. Per person per window this ceiling now counts 5 failures + 1 success = **6**; a refused CAPTCHA still counts, their own 429s no longer do. So: measured concurrency 3 × 6 = **18**; absolute worst case, the entire field force behind one carrier gateway, 19 × 6 = **114**; 100 buys ≈16 concurrent people behind one address. The shared-address case is measured, not hypothetical — the activation limiter logged **244 refusals from SIX Opera Mini proxies on 2026-09-07/08** (reverse DNS `opera-mini.net`), and the operator's nine harness accounts all log in from one desk. **REOPEN TRIGGER:** any `auth.login_ip_flood_limit_exceeded` from an `opera-mini.net` / Nigerian CGNAT address, **or from the operator's own IP during a dev or UAT session**, **or** the count of real field accounts exceeding 19 (13-71 grows the cohort by design). ⭐ That trigger is now diagnostic, which it was not before: FR1 makes `attempts` mean "requests from this IP" again, so the log line can tell a spray from eleven honest enumerators | Awwal (adjudication) — decided, not deferred |
| **R2** — Option B's `store.decrement()` is unproven against `rate-limit-redis@4`. AC3's both-directions test runs in `login-rate-limit.binding.test.ts`, which its own header states builds every limiter with the **in-memory** store in test mode (`skip` is stubbed to production per request; the store is not). So CI proves the PREDICATE WIRING and exercises `MemoryStore.decrement()` — never the Redis one that runs in prod | **High** — a decrement that silently no-ops is indistinguishable from a working fix, and this project's top defect class is a fix that never fires [[pattern-ship-a-fix-that-never-fires]]. An in-memory green read as proof of the prod behaviour is the whole failure | ✅ **DISCHARGED ON PROD `eeacee3`, 2026-09-20 — THE DECREMENT WORKS AGAINST `rate-limit-redis@4`. Predicted 21, measured 21.** ⭐ TWO-PART ATTRIBUTION (§2al): PROCEDURE designed and EXECUTED by adjudication; RULING to run it by Awwal, 2026-09-20 (decision 4 of 4). **Both directions proven on live Redis, by VALUE:** 22 requests reached `activationIpFloodLimit`, one of them a 429 emitted by `activationRateLimit`, and `rl:activation:ip:129.205.124.202` read **21** — the decrement fired, and the ceiling still advanced on all 21 served requests, so it is not disarmed (Option A's failure mode). ⭐ And `rl:activation:token:…0001` read **21** against the ceiling's 21-from-22: **the person-keyed limiter counted its OWN refusal while the ceiling did not count someone else's** — precisely what NFR4.4.d requires, and the thing a boolean marker could not have expressed, since one of the two would have had to be wrong | **Precedent that the in-memory store is blind to exactly this layer:** `login-rate-limit.ts:23-34` documents the prefix-collision class and states *"`login-rate-limit-key.test.ts` pins the separation; the in-memory test store cannot see it."* Same blind spot, same file. **Discharge by EITHER:** (a) a real-Redis integration test using `beforeAll`/`afterAll` against the test DB/Redis, asserting the counter value directly at `rl:login-ip-flood:<ip>` after a downstream refusal and after a 401; or (b) a post-deploy read on prod — drive a downstream 429, then confirm the `auth.login_ip_flood_limit_exceeded` / `attempts` progression advances only on non-refused requests. ⛔ Whichever is chosen, assert the counter **value**, not merely that a request was served — "served" is consistent with both a working and a no-op decrement [[pattern-a-clean-result-must-prove-it-measured]]. ⚠️ Also unverified and worth pinning in the same pass: `response.on('close')` decrements on a request aborted before it finished writing — a dropping mobile connection, which is this cohort's normal condition. ⛔ **EXECUTED 2026-09-20 — AND THE PROCEDURE AS WRITTEN BELOW WAS UNRUNNABLE, which is worth more than the result.** It specifies a LOGIN refusal, but `verifyCaptcha` is mounted between the ceiling and `loginRateLimit`, so reaching the burst limiter on prod requires real hCaptcha tokens. A procedure written from the mount-order *document* rather than from the mount-order *code*. ✅ **Substituted, and the substitute is strictly better:** `GET /api/v1/auth/activate/:token/validate` carries `activationIpFloodLimit` → `activationRateLimit` with **no captcha**, and a bogus UUIDv7 returns `200 {"valid":false}` — no writes, no citizen data, no real account's lockout counter, 22 requests against a 300 budget on adjudication's own IP. ⭐ **It also exercises one of the FOUR ceilings R7 added today rather than the login one — the half this residual said was unexercised.** Sequence observed: 20 × `200`, the 21st `429` (activationRateLimit), then a different token `200`. ⭐ **The login leg remains formally unexercised on prod and does not need to be:** the predicate, the flag and the marker are one shared mechanism (`refusedByAnotherLimiter`), and the login half is pinned in both directions by `login-rate-limit.binding.test.ts` reading counter values. What was unproven was REDIS, and Redis is now proven. ⚠️ Anyone re-running this must read the counter VALUE from `rl:activation:ip:<ip>`: the ceiling's own `attempts` log line only fires at 300, so the logs cannot answer it. **Original plan, retained for the record:** ⭐ **PATH CHOSEN 2026-09-20 (Task 1.2c): (b), the post-deploy read** — (a) needs a real-Redis integration harness this repo does not have for middleware, and inventing one to prove a one-line predicate is the wrong trade. **Procedure, so it can be executed by someone who was not here:** from one IP drive 6 failed logins for ONE address (the 6th is refused by `loginRateLimit`), then 1 more failed login for a DIFFERENT address; read `attempts` in the `auth.login_ip_flood_limit_exceeded` and `auth.rate_limit_exceeded` lines. **Predict: the flood counter advances by 6, not by 7** — five 401s plus the seventh request, with the sixth handed back. ⛔ Assert the counter VALUE; "the request was served" is consistent with both a working decrement and a no-op. ⚠️ `skipFailedRequests` also now registers the `close`/`error` listeners — see **R4**, which discharges in the same pass | whoever takes 13-70 dev-story |
| **R3** — AC1's remaining leg: a limiter mounted ahead of another was still counting that other's 429. `loginRateLimit` sits before `strictLoginRateLimit` and before `mfaRateLimit`, has already incremented by the time either answers 429, and its `skipSuccessfulRequests` decrements only on a 2xx. AC3's ruling covered the opposite direction only (*"strict never sees burst's refusal"*), so this leg was open when FR1 shipped | **Medium** — the same class the story closes: a legitimate person charged for a refusal they did not cause | ✅ **CLOSED — Option (a) taken. ⭐ TWO-PART ATTRIBUTION (§2al): EVIDENCE by the dev pass that measured the remaining leg (`loginRateLimit` mounted ahead of strict and MFA, already incremented by the time either answers 429); RULING by Awwal in the dev session, 2026-09-20, re-confirmed at adjudication.** ⚠️ Re-confirmed rather than assumed: adjudication could not verify the in-session ruling from the tree, so it was put back to Awwal explicitly — the same check that corrected **R1**. And GENERALISED rather than patched: **every limiter on the login routes stamps its own name when it refuses, and no limiter counts a request a DIFFERENT limiter refused.** `loginIpFloodLimit`, `loginRateLimit`, `strictLoginRateLimit` and `mfaRateLimit` all obey both halves; `verifyCaptcha` still does not stamp, so its 400 stays counted (AC2) | **What it cost, measured on this exact scenario BEFORE the fix:** once strict's 60/IP/hour was spent, an address that had never been given a single login attempt on that IP lost its whole 5-failure budget to refusals it did not cause — the sixth request came back stamped `loginRateLimit`. After: all six are strict's, and the same address still has its five failures from a different IP. `login-rate-limit.binding.test.ts` › *'R3 a 429 from strict does not spend the per-EMAIL budget'* and *'R3 a 429 from mfaRateLimit is counted by none of the three'*. RED-VERIFIED both ways: delete burst's predicate and the first reds with `loginRateLimit` back in position six; delete mfaRateLimit's stamp and the second reds with three `undefined`s. ⭐ The mfaRateLimit leg is the one AC3's mount-order reasoning could not have reached at all, because it is mounted BEHIND all three login limiters | Awwal (adjudication) — ruled and closed |
| **R4** — `skipFailedRequests` brings `close` and `error` decrement listeners with it, and an ABORTED request is now uncounted by the flood ceiling. ⚠⚠ **WIDENED 2026-09-20 by R7: this now applies to FIVE ceilings, not one** — login, activation, password-reset completion, registration and wizard draft. The ruling is the same ruling; it is simply worth five times what it was. express-rate-limit registers three listeners when the flag is set, not one: `finish` (consults the predicate), `close` (decrements when `!response.writableEnded`) and `error` (decrements unconditionally). Before this story the ceiling had NO skip flag, so it had none of them | **Low–Medium** — mostly the RIGHT answer: a mobile enumerator on a dropping connection is this cohort's normal condition and should not be charged for a response they never received. The other reading is a narrow evasion: abort before the server finishes writing and the request is not counted. ⚠️ The window is small — these responses are a single small JSON chunk, so `writableEnded` is true almost immediately — and strict (whose `skipSuccessfulRequests` registers `finish` only) still counts the request, so a failure spray is unaffected. The exposure is to the SUCCESS-volume bound, which is the ceiling's own load-bearing property | ✅ **ACCEPTED — RULED 2026-09-20.** ⭐ TWO-PART ATTRIBUTION (§2al): EVIDENCE by the adversarial review (the three-listener code read) and re-derived independently by adjudication against the installed dist; RULING by Awwal at adjudication, 2026-09-20, decision 3 of 4 — **accept the behaviour across all five ceilings; do NOT pin it with a deliberate abort test.** ⛔ **The DATED marker is deliberately REMOVED, and that is the point of the ruling:** it was dated only because it needed a decision, and it now has one. A row cannot be both accepted and blocking. ⚠️ **Why not the abort test:** it is timing-dependent in a repo already fighting local suite flakiness (§2aa), and the evasion does not buy an attacker what the ceiling protects — you cannot learn the auth result without reading the response, `writableEnded` is true almost immediately for a single small JSON chunk, and `strictLoginRateLimit`'s `skipSuccessfulRequests` registers `finish` ALONE, so a failure spray is unaffected either way. The exposure is to the SUCCESS-volume bound, and it costs the attacker the answer they came for | **Verified by CODE READ, not by execution, and labelled as such** [[pattern-a-clean-result-must-prove-it-measured]]: `express-rate-limit@8.3.0` dist, the `if (config.skipFailedRequests` **or** `config.skipSuccessfulRequests)` block — `response.on("close", async () => { if (!response.writableEnded) await decrementKey(); })`. No test asserts it, because an abort test is timing-dependent and this repo already fights local suite flakiness. ⛔ Do not close this row on the strength of the reasoning above; either pin it with a deliberate abort test, or accept it in writing with an owner. Same discharge shape as R2 | Awwal (adjudication) — rule with R5, R6 and R7 |
| **R5** — should login's ceiling harmonise to its tier's 300, or keep its exception? The PRD's **flood-ceiling divergence ruling (2026-09-17)** permits login at 100 while activation and password-reset completion sit at **300** for the same shared-proxy population, on ONE stated justification: mounted ahead of the CAPTCHA, login's ceiling also bounds the external hCaptcha `siteverify` call and the bcrypt work behind it — a cost the other two do not carry per attempt | **Medium** — it is a permitted divergence, not drift, but the ruling itself says *"an unverified assumption may not do normative work indefinitely"* | **OPEN — DATED 2026-10-15.** ⛔ Not this story's to decide and not this story's date: the PRD set both. Two measurements are required by then — hCaptcha's own per-IP limit (believed ~400 verifications/IP/hour, never verified) and bcrypt p95 on the 2 GB VPS. **If neither constrains, login harmonises to 300/15 min and the exception is deleted.** ⭐ This row exists so that deadline is enforced by the guard Story 13-70 built, instead of passing in silence — which is the entire point of FR4 | ⚠️ **Neither measurement can be taken from here.** hCaptcha's per-IP limit is a vendor fact (docs or support), not something to infer from our own traffic; bcrypt p95 on the 2 GB VPS is a load measurement on the live box, and adjudication owns the server — A13 requires the attempt to be recorded rather than the blocker asserted, so it is recorded here. **This also supersedes 13-68's A3**, which raised the same 100-vs-300 inconsistency from the other side and had no owner and no date. ⛔ It is deliberately NOT rerouted back into 13-68: that story is closing, and parking a live question in a closing story is the habit this whole story exists to end | Awwal / John (PM) — the PRD's own deadline |
| **R6** — ⛔ **FR1 moved the two halves of R5's justification in OPPOSITE directions, and one of them got worse.** Mount order is flood → `verifyCaptcha` → burst → strict, so a request the BURST limiter refuses has already passed the captcha and already cost a `siteverify` call. FR1 stopped the ceiling counting those. **bcrypt is bounded BETTER** (a request refused downstream never reaches the controller, so the budget is no longer spent on requests bcrypt never sees); **siteverify is bounded WORSE** | **Medium** — and it is a cost this story introduced, so it is recorded against this story rather than discovered later against someone else's | **OPEN — DATED 2026-10-15**, the same date as R5 because the same hCaptcha measurement settles it: if hCaptcha's per-IP limit is generous, this is a non-event; if it is ~400/IP/hour, an unbounded path matters | **MEASURED, both directions, in `login-rate-limit.binding.test.ts` › *'R6 the ceiling no longer bounds siteverify…'*: 40 captcha-passing requests refused by the burst limiter cost **40 siteverify calls while the ceiling peaked at 6**; 40 requests with a FORGED captcha cost 40 calls and the ceiling reached **40**, because `verifyCaptcha` does not stamp.** ⭐ Scope it honestly: a production hCaptcha token is single-use, so a reused one comes back `success:false` → 400 → counted. The exposure is *one solved captcha per unbounded call*, not free. **Options:** (a) accept, on the hCaptcha figure R5 measures; (b) give the siteverify bound its OWN counter mounted with the captcha, since one counter cannot both exclude refusals (NFR4.4.d) and count every request that reached the captcha — that is a NEW limiter, so an NFR4.4.c row, a coverage entry and a security review, never an inline fix | Awwal (adjudication) — rule with R5 |
| **R7** — ⛔ **NFR4.4.d IS ROUTE-GENERAL AND FOUR MORE ROUTE FAMILIES STILL VIOLATE IT.** FR1 and R3 made *"a refusal is not a request"* true on the four login routes. The clause says *any other limiter on the same route*, and four other pairs have the identical shape the login pair had — a flood ceiling mounted FIRST counting all responses, with a person-keyed limiter behind it — with no skip predicate on any of them: `activationIpFloodLimit` → `activationRateLimit` (`auth.routes.ts:27,29`), `passwordResetCompletionIpFloodLimit` → `passwordResetCompletionRateLimit` (`auth.routes.ts:107-109,114-116`), `registrationRateLimit` → `registrationEmailRateLimit` (`registration.routes.ts:74-75`), `wizardDraftRateLimit` → `wizardDraftEmailRateLimit` (`registration.routes.ts:60-61`) | **Medium–High** — it is A1’s own incident on other routes: a registrant who spends their 3-per-email wizard budget and retries charges their own 429s to the 50-per-IP ceiling their whole Opera Mini proxy shares. ⛔ And until it is closed, AC10 is only three-quarters true — the PRD asserted the clause MET while the code kept it on one route family in five, which is the drift class this whole arc has been closing, at a smaller radius | ✅ **CLOSED. ⭐ TWO-PART ATTRIBUTION (§2al): EVIDENCE by the adversarial review — it FOUND the four violating families and wrote the recipe, then declined to implement inline and carried it as `DATED 2026-10-15`; RULING by Awwal to do it in-session, 2026-09-20, RATIFIED at adjudication 2026-09-20 as decision 1 of 4.** ⭐ The ruling was right and the review was wrong on its own second ground: the burst-breaker interaction it named as a blocker was never measured, and once checked it IMPROVES — [[pattern-blocked-on-a-measurement-means-try-first]]. ⚠️ The first ground stands and was ratified explicitly, not waived: this is a security-behaviour change to four limiters made during a review rather than a dev-story. All eight limiters now stamp `res.locals.rateLimitRefusedBy`, and the four ceilings carry `skipFailedRequests` + `requestWasSuccessful: (_req, res) => !refusedByAnotherLimiter(res, SELF)`. ⚠️ **The four person-keyed limiters stamp but take NO predicate, and that is a decision, not an omission:** every mount of all eight was enumerated and each is LAST on every route it appears on (`registrationBurstWatch` sits behind one of them but calls `next()` and never answers 429), so they have nothing to be charged for — and giving them the flag anyway would put **R4**'s `close`/`error` listeners on BOTH limiters of a route, leaving nothing at all to count an aborted request. Login is safe from that only because burst and strict use `skipSuccessfulRequests`, which registers `finish` alone. ⛔ That leaves ONE mount-order assumption, said out loud because R3 is the reason to: mount a third limiter behind any of these four and it needs the predicate too | **Found AND closed by the adversarial review, 2026-09-20, by execution not by reading.** Before: `grep -n "skipSuccessfulRequests\|skipFailedRequests\|requestWasSuccessful" apps/api/src/middleware/{registration,password-reset,wizard-draft}-rate-limit.ts` returns NOTHING. After: `refusal-not-a-request.binding.test.ts` — 6 tests, one per family plus a self-refusal check and a skip sentinel — reads each ceiling's COUNTER VALUE from a probe spliced into the REAL route stack and asserts BOTH directions: the ceiling does not advance on a downstream 429 **and does advance on a served request**. RED-VERIFIED by mutations **P** and **Q**. NFR4.4.d and the four NFR4.4.c mode rows are updated in the same changeset that makes them true (AC10's own rule). ⚠️ **IT WAS NOT A SWEEP, and the two interactions were checked rather than assumed.** (a) `registrationRateLimit`’s 429s feed `recordRegistration429` (Story 13-46’s burst breaker), — **checked: it gets BETTER.** `recordRegistration429` fires from each `handler`, so every refusal that happens is still counted; what changes is that the ceiling refuses less often, so the breaker stops reading a person's retries into their own refusal as fresh turn-aways. (b) `skipFailedRequests` brings **R4**'s `close`/`error` listeners to every ceiling it is added to — **accepted and recorded**: R4 is open, dated 2026-10-15, and now covers five ceilings rather than one, which is stated in its row rather than discovered later. (c) Each ceiling is a security control with an NFR4.4.c row and a coverage entry; all four rows moved to `ALL-EXCEPT-REFUSALS` here | Awwal (adjudication) — rule with R5/R6 |
| **R8** — ⛔ **NOTHING STOPS A REVIEW SIGNING OFF A RESIDUAL IN THE PRINCIPAL'S NAME, and this story did it three times.** §2a0 specifies what an ACCEPTED residual REQUIRES — a measurement, a named owner, a reopen trigger — and says nothing about **who may sign it**. So a review can assemble every element of a ruling and then record itself as having received one. Three instances found at adjudication 2026-09-20; see the evidence cell. ⛔ **AND A SECOND DEFECT, FOUND BY WRITING THIS VERY ROW:** the FR4 deadline check reads its closure vocabulary from the ID CELL as well as the marker cell, and the id cell is free prose — so a dated row whose DESCRIPTION quotes that vocabulary silently loses its deadline | **Medium** — for the attribution half, no code defect and no wrong outcome: all three closures were well-reasoned and all were ratified on the spot. The harm is to the RECORD's load-bearing property — an attributed decision **retires the question**, so a signature nobody gave is read as a conversation already had, and `max: 100` on an auth flood ceiling now carries a normative PRD line. ⛔ **The FR4 half is worse in kind, because it is silent and it is in this story's own deliverable:** a deadline that does not fire is indistinguishable from one that has not arrived, which is the exact failure FR4 exists to end | **OPEN — DATED 2026-10-15** — the RULE is shipped already (handoff §2al, this changeset); what is deferred is the MECHANISM, for both halves. Same date as R4/R5/R6 deliberately: one conversation then closes five rows rather than four and a stray. ⚠️ Dated rather than trigger-based ON PURPOSE — *"the next review that proposes a sign-off"* is not mechanical, nobody checks it, and it would rot. ⭐ And the adversarial review was RIGHT to criticise adjudication for keeping **R1** undated to protect AC11's headline count: declining to date a real deferral to preserve a number in a comment is the tail wagging the dog, and this row applies that same correction to adjudication's own finding | **THE THREE ATTRIBUTION INSTANCES.** (a) **R1** was recorded `CLOSED BY DECISION (Awwal, 2026-09-20)` when Awwal had not ruled it — *"I believe it was reasoned and measured during code review"*; (b) the same claim had already propagated into **PRD NFR4.4.c as normative**; (c) 13-68's **R8** was signed `(Awwal, …)` on a row **AC9** had already assigned to **John (PM)**. All three now carry the two-part form of §2al. ⛔ **THE FR4 DEFECT, MEASURED NOT ARGUED.** `ROW_IS_CLOSED` is tested against `` `${row.idCell} ${datedCell}` `` (`story-residual-guard.ts:431`). The adversarial review's **M1** fix narrowed this from `row.raw` to those two cells — an improvement that left the id cell in scope, and the id cell is a free-prose description. **The review then tripped it itself** (its own error #2: it wrote a closure word into R4's dated cell, R4 stopped firing, and it fixed the INSTANCE by rewording to "settled") — so the class survived the fix that found it. **Blast radius, measured on the corpus 2026-09-20: 6 dated rows exist; exactly 1 is disarmed this way, and it was THIS row before it was rephrased.** Zero pre-existing rows are affected, so the defect is LATENT — which is why it is dated rather than hot-fixed at adjudication. ⚠️ **This row is currently ARMED ONLY BY A WORKAROUND:** its quoted examples were moved into this evidence cell, which is outside the check's scope. That is the same rewording the review did, applied knowingly, and it is recorded rather than passed off as a fix. **THE MECHANISM, both halves, one function:** (1) read `PROPOSED-CLOSED` as OPEN in `OPEN_MARKER`, with a `ROW_IS_CLOSED` case so "proposed" and the closure token together do not self-cancel; (2) scope the id-cell half of the closure test to the segment BEFORE the first em-dash — measured to re-arm this row (`leadClosed=false`) while preserving the `~~**R1**~~ ✅ … — description` convention where a marker legitimately sits in the lead (13-37 R1). ⛔ RED-VERIFY BOTH WAYS per §2ab.1, and re-measure the blast radius on the run day — `grep -c "PROPOSED-CLOSED"` is **0** today, so half (1) is inert on the current corpus and cannot red the repo. **Reopen trigger, independent of the date:** any residual sign-off recorded with an attribution the named person did not give, or any dated row found not firing | Awwal (adjudication) — rule with R4/R5/R6 |

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context) — `claude-opus-5[1m]`, BMAD `dev-story` workflow, 2026-09-20.

### Debug Log References

**Every red below was OBSERVED, and the numbers are the observed ones.** Each mutation was applied to the working tree, run, and reverted; the restore was verified by grep before moving on.

| # | mutation | suite | observed RED |
|---|---|---|---|
| A | delete the `res.locals.rateLimitRefusedBy` stamp from `loginRateLimit` | binding | **2 failed / 21 passed** — `expected [ 6, 7, 8 ] to deeply equal [ 6, 6, 6 ]`: the "does not advance" leg, exactly as AC3 requires |
| B | force the ceiling's predicate false (`requestWasSuccessful: () => false`) | binding | **8 failed / 15 passed** — `expected [ 1, 1, 1, 1, 1 ] to deeply equal [ 1, 2, 3, 4, 5 ]`: the "does advance on a genuine 401" leg. ⭐ The other 7 reds are the ceiling refusing nothing at all (`expected 200 to be 429`) — which is **13-68 residual A1's own stated fear reproduced on demand** |
| C | drop `skipFailedRequests`, leave the AC3 predicate in place | binding | **2 failed / 21 passed** — `[6,7,8]` and `[61,62,63]`. ⛔ This is the fix-that-never-fires proof: the ruled predicate ALONE changes nothing |
| D | remove the sha256 from the single shared `buildLoginRateLimitKey` | 3 key suites | **8 failed / 30 passed** across login + registration + wizard-draft — one hasher, three consumers |
| E | narrow `RESIDUAL_ID` back to `R\d+` while 13-68's real `A1` carries `DATED 2026-01-01` | guard runner, on the REAL corpus | ⛔ **GREEN: "328 stories scanned … no expired DATED deferrals"** over an eight-month-late deadline. This is why Task 4.1 had to come first |
| F | drop the word boundary (`\bDATED\b` → `DATED`) | guard unit | **1 failed / 28 passed** — `expected [ 'R6', 'R7' ] to deeply equal [ 'R7' ]`: `UPDATED 2026-01-05` matched (AC12) |
| G | delete the `today <= dueOn` comparison | guard unit | **2 failed / 27 passed** — the future-dated row and the UTC-clock row both fire |
| H | delete `loginRateLimit`'s own predicate (the R3 fix) | binding | **1 failed / 23 passed** — `loginRateLimit` reappears in position six: the untouched address loses its budget again |
| I | delete `mfaRateLimit`'s stamp | binding | **1 failed / 23 passed** — `[undefined, undefined, undefined]`: all three login limiters count its 429 again |
| J | restore the naive pipe split in `cells()` | guard unit | **1 failed / 35 passed** — an escaped pipe in the id cell moves the STATE cell out of column 3 |
| K | ignore the ledger SECTION, apply the strict id everywhere | guard unit | **4 failed / 32 passed** — the `D1` ledger, the heading shapes, the nested sub-heading and the date check all go blind again |
| L | put `rl:activation:` back in the registry | — | ⛔ **the module refuses to load**: `RATE_LIMIT_PREFIXES: two rate limiters would share a Redis counter · rl:activation: is a proper prefix of rl:activation:ip:`. No test ran at all, which is the point — this one cannot be skipped |
| M | write an `'rl:message:'` literal back at its limiter site | prefix | **1 failed / 5 passed** — `middleware/message-rate-limit.ts:27 rl:message:`, named with its line |
| **N** | *(review)* strip the fenced-code-block guard from `residualRows` | guard unit | **4 failed / 40 passed** — `expected [ 'D1' ] to deeply equal [ 'D1', 'D2' ]`: a `#` shell comment inside a fence closes the ledger section and every row after it goes blind; the two mirror tests red the other way |
| **O** | *(review)* read `ROW_IS_CLOSED` across the WHOLE row again | guard unit | **1 failed / 43 passed** — `expected [] to deeply equal [ 'R6' ]`: the word RESOLVED sitting in an EVIDENCE cell excuses a row that is genuinely open and genuinely past its date |
| **P** | *(review, R7)* delete `registrationEmailRateLimit`'s stamp | R7 binding | **1 failed / 5 passed** — `expected [ 4, 5, 6, 7 ] to deeply equal [ 4, 4, 4, 4 ]`: the citizen's own 429s go back on the 50-per-IP ceiling their carrier gateway shares |
| **Q** | *(review, R7)* drop `skipFailedRequests` from all FOUR new ceilings, leave the predicates | R7 binding | **4 failed / 2 passed** — `[4,5,6,7]`, `[21,22,23]`, `[21,22,23]`, `[301,302,303]`. Mutation **C**'s fix-that-never-fires proof, reproduced once per family |

**Task 1.4 (restore the current behaviour, record the red count):** mutation **C** is that restoration — the predicate is present but never consulted, which is byte-for-byte today's counting behaviour. **2 red.**

**AC7 RED-VERIFY on a REAL row**, not a fixture: `**A1**` in `13-68-login-rate-limit-identity-axis.md` was given `DATED 2026-01-01`, the guard was run direct, and it printed
`… — residual A1 was DATED 2026-01-01, and today is 2026-09-20 (UTC):` followed by the row's own text. 13-68 was then restored (`git diff --stat` clean).

**Environment note (A13 — a recorded attempt, not a silent one):** the first full-API run returned **98 failed / 65 files** with `ECONNREFUSED` on every DB query. Docker Desktop was not running; nothing to do with this changeset. Started it, waited for the engine, confirmed `app_test` reachable (33 public tables), re-ran clean. Recorded because "98 red" in a log six weeks from now reads like a real failure.

### Completion Notes List

**FR1 — a refusal is not a request (AC1 partial, AC2 ✅, AC3 ✅).**

1. ⛔ **Option B implemented exactly as ruled, and one thing the ruling did not say had to be added or it could not fire.** AC3 specifies `requestWasSuccessful: (_req, res) => !res.locals.rateLimitRefusedBy` on `loginIpFloodLimit`. **That predicate alone is dead code.** `express-rate-limit@8.3.0` consults `requestWasSuccessful` only inside `if (config.skipFailedRequests || config.skipSuccessfulRequests)`; with neither flag set it registers no response listener and the predicate never runs. The ceiling had neither. So the implementation is the ruled predicate **plus `skipFailedRequests: true`**, which is the half that pairs with *that* predicate: it decrements when the predicate returns false, i.e. exactly when a downstream limiter stamped the marker. This is not the rejected Option A and it is not a re-derivation — it is the wiring that makes the ruled mechanism execute. Mutation **C** is the proof, and it is the project's top defect class caught in the act [[pattern-ship-a-fix-that-never-fires]].
2. ⭐ **13-68's own adjudication rejected `skipFailedRequests`, and it was right about the version it was looking at.** Residual A1 reads *"`skipFailedRequests` would skip 401s and gut the ceiling"* — true with the library's DEFAULT predicate (`statusCode < 400`), under which a 401 is a "failed" request and gets decremented. Option B replaces the predicate, so "failed" means "refused by another limiter" and nothing else. **Mutation B reproduced 13-68's exact fear** (the ceiling serving request 101), which is why that leg is asserted. A1's cell has been corrected rather than overruled, so a reviewer meeting it does not conclude a rejected option shipped.
3. **The counter is read by VALUE, not by "was it served".** A `store.decrement()` that silently no-ops is indistinguishable from a working skip, so the tests mount a probe directly behind the ceiling in the real stack and record `req.rateLimit.used`. Observed: `[1,2,3,4,5,6,6,6]` — five genuine 401s advance it; three of the person's own 429s reach 6 and hand it straight back.
4. **The ceiling still counts its own 429s**, asserted via `attempts: 101, 102, 103` in `auth.login_ip_flood_limit_exceeded`. That is the field R1's reopen trigger is written against, and the precise thing Option A would have pinned at `max`.
5. ⚠️ **AC1 IS NOT FULLY MET, and this is stated rather than glossed.** AC1 says a 429 from any login limiter is counted by no **other** limiter on the route. The ceiling now honours that. `loginRateLimit` does not: it is mounted BEFORE `strictLoginRateLimit`, has already incremented when strict answers 429, and its `skipSuccessfulRequests` decrements only on a 2xx — so a strict refusal spends a unit of someone's per-email budget. AC3's rationale covers the opposite direction only ("strict never sees burst's refusal"). **Measured, not argued** → residual **R3**, with both options written out. Fixing it unilaterally would be an un-ruled auth-limiter behaviour change, which the story's own scope fence forbids.
6. ⚠️ **`skipFailedRequests` also brings `close`/`error` decrement listeners** the ceiling did not have before — an aborted request is no longer counted. Right answer for a dropping mobile connection, narrow evasion otherwise → residual **R4**, verified by code read and labelled as such.

**FR2 — disjoint keyspaces (AC4 ✅).**

7. ⭐ **The brief named two pairs. Enumerating the tree found FIVE.** `rl:activation:` ⊂ `rl:activation:ip:`, `rl:password-reset-complete:` ⊂ `…:ip:` (both named), plus `rl:login:` ⊂ `rl:login:strict:`, `rl:register:` ⊂ `rl:register:email:`, and `rl:wizard-draft:` ⊂ `rl:wizard-draft:email:` (none named). Renamed to `rl:activation:token:`, `rl:password-reset-complete:token:`, `rl:login:burst:`, `rl:register:ip:`, `rl:wizard-draft:ip:`.
8. ⛔ **Two of them were LIVE collisions, not latent ones.** `activationRateLimit` falls back to the key `ip:<addr>` under prefix `rl:activation:` — spelling `rl:activation:ip:<addr>`, byte for byte what `activationIpFloodLimit` writes. A 20-per-token budget and a 300-per-IP ceiling shared ONE counter on every tokenless activation request. `passwordResetCompletion*` is the identical shape. The in-memory test store gives each limiter its own map and can never see this.
9. **The new test enumerates `'rl:…'` LITERALS, not `prefix:` sites** — because a `prefix:`-based scan misses two of the twelve limiter files: `import-rate-limit.ts` passes the prefix as a factory argument and `wizard-draft-rate-limit.ts` through a `store(prefix)` helper, so neither has a literal next to the word `prefix`. The first draft of this test made exactly that mistake and reported a clean pass over 24 of 30 prefixes.
10. **A vacuous assertion was removed on the way through.** `login-rate-limit-key.test.ts` asserted the nesting property as `if (b.startsWith(a)) { …assert the remainder is not a key shape… }`, tolerating `rl:login:` ⊂ `rl:login:strict:` because the burst limiter's keys always begin `e:` or `ip:`. With the pair now gone, that `if` never fires and the test would pass having asserted nothing [[pattern-a-clean-result-must-prove-it-measured]]. Rewritten unconditionally.

**FR3 — hash the email keys (AC5 ✅).**

11. `buildRegistrationEmailRateLimitKey` and `buildWizardDraftRateLimitKey` now **delegate** to the shipped `buildLoginRateLimitKey`; no second hasher was written [[feedback_canonical_primitive_backlog_sweep]]. A megabyte-long "email" yields a 66-character key in both, and both equal the key the login limiter would build — asserted directly, so drift between the three is a red test, not a discovery. `keyedBy` was added to `registration.email_rate_limit_exceeded`, derived from the key itself so the log and the limiter cannot disagree.

**FR4 — make a date fire (AC6 ✅, AC7 ✅, AC8 ✅, AC11 ✅, AC12 ✅).**

12. ⛔ **The naive widening of `RESIDUAL_ID` is wrong by a measured amount, and this is the AC11 lesson applied to AC7.** Counted 2026-09-20: `R\d+` matches **226** rows, `[RA]\d+` **229**, `[A-Z]\d+` **510**. The 284 extra are adversarial-review finding tables (`H1…H3`, `M1…M4`, `L1…L3`, `S3`, `P1…P4`, `C1…C3`, `T1…T5`, `B1/B2`), and two of them are **false hits in `done` stories**: `13-2 M3` (because `\bOPEN\b` matches inside *"gate-open"*) and `13-37 B10` (a three-column review table whose third cell is a pointer reading *"the OPEN DECISION block"*). This guard runs in `pre-commit`. Widened to `[RA]\d+` — **0 new hits, measured** — and `D` is deliberately excluded because the guard's own suite uses `| D1 | 140 | OPEN question |` as its worked example of a table that is NOT a ledger.
13. ⛔ **THE BLAST-RADIUS BASELINE RE-MEASURED (AC11 / 4.1b), and two of the story's three numbers needed correcting.** Story: *"955 dated table rows across 325 files versus exactly ONE genuine `DATED` marker."* Measured today with the story's own commands:
    * dated table rows: **959** (was 955 on 2026-09-19) — **+4**, consistent with `b9d40fe`, `c205cc3`, `b055d09` landing on 09-20.
    * "across **325** files" was **files SCANNED, not files containing a dated row**. Today: **328 scanned, 157 containing one.** Corrected.
    * `\bDATED <iso>` markers: **6 occurrences, not 1** — but **exactly 1 inside a residual table row** (13-68 R2b). The other five are prose, and five of six are in **13-70's own story file** quoting the marker. So the opt-in property holds *as long as the check reads table rows only*, which it does. Restated rather than inherited.
14. **The date check is not gated on `Status: done`.** 13-68 has been `Status: review` since 2026-09-16 and holds the only dated row in the repo, so a check gated on `done` could never have fired on the one row it exists for [[pattern-a-gate-opened-onto-a-path-that-cannot-run]].
15. **"Still open" is NOT `isOpenState(cells[2])` for the dated check.** The done-scan can assume column 3 is a state cell; a dated deferral can sit in any table, and 13-68's adjudication ledger is `| # | residual | why not fixed here | reopen trigger |` — column 3 is a justification. So the `DATED` marker is the opt-in and this repo's closure vocabulary (`CLOSED`/`✅`/`RESOLVED`/`DISCHARGED`/`~~id~~`) is the opt-out, read across the whole row.
16b. ⚠️ **A near-miss found while verifying, and it is AC11's argument made concrete.** This story's own Dev Notes contain `| R2b's date | **2026-10-15**, acceptance = demonstrated firing | … |`. The first cell starts `R2b`, so `RESIDUAL_ID` matches it and the guard reads that EVIDENCE row as a residual. It is harmless exactly because the check is opt-in: the cell carries a date but no `DATED` marker, so nothing fires. Under the "parse any past date" rule the story rejected, this row would have reddened the build from 2026-10-16 — inside the story that built the guard.

16. **One clock, UTC, injected** (`toUtcDateKey`). No test calls `new Date()`; the runner reads the clock once. Pinned that 2026-10-15 is not late, 2026-10-16 is, and that 22:30 UTC is still the same UTC day.

**FR5 — close by decision (AC9 ✅).**

17. **R2a CLOSED BY DECISION** with `~480 guesses/day` as the accepted figure, re-derived on the day (10 guesses per 30-minute lock window = 20/hour = 480/day) against bcrypt + password policy + mandatory super-admin MFA. Reopen trigger: *any weakening of the password policy, or MFA ceasing to be mandatory for super-admins.* **R8 CLOSED BY DECISION**, owner John: the disclosure boundary is **response-side, not log-side** — and the log distinguishing deliberately is exactly what makes R2b's cardinality monitor possible.
18. ⭐ **R5 and R7 were also closed, because this story is what discharges them** — R5 is FR2's keyspace collision and R7 is FR3's raw email key. Leaving them OPEN while shipping their fix is the drift this story exists to end. **R4 in 13-68 (the stale `googleAuthRateLimit` row) is also demonstrably discharged** — `grep -rn googleAuthRateLimit apps/api/src` returns only the "REMOVED 2026-09-17" note — but it is Lane C's row to close, so it is reported here and left alone.

**Records (AC10 ✅).**

19. The PRD's NFR4.4.d **"NOT YET IMPLEMENTED"** annotation is gone in the same changeset that makes the clause true; `grep -c "NOT YET IMPLEMENTED" PRD.md` → **0**. It is replaced by what shipped, why the status-filter form was rejected, and an explicit statement that **R3's leg remains open** — a PRD claiming a rule the code only half-keeps is the same drift with a smaller radius.
20. NFR4.4.c rows updated for the three things that moved: the ceiling's mode (`ALL` → `ALL-EXCEPT-REFUSALS`) and the two per-email keys (`email` → `email digest`). `rate-limit-coverage.test.ts`'s comment table updated to match, and it now says explicitly that the wizard-draft limiters are out of that map's scope rather than leaving a reader to wonder.
21. **13-70 added to `epics.md`** — it had a brief, a `sprint-status.yaml` row, and no index entry, which is the exact failure it was written to stop.

---

## Second pass — the three classes closed at Awwal's direction, 2026-09-20

The first pass shipped FR1–FR5 and left three things named but not settled: R3 open, FR2 enforced by a scan, FR4 widened by one letter. All three are now closed as CLASSES.

**R3 — RULED: option (a), and generalised rather than patched.**

22. The recommendation was option (a), for three reasons, and it was taken. (i) NFR4.4.d is normative and says *any other limiter*; option (b) would have edited the rule down to match the code, which is the drift this whole arc has been closing — the PRD's own "NOT YET IMPLEMENTED" annotation was the same move at larger scale. (ii) The cost is one predicate, symmetric with what the ceiling already had. (iii) The population it protects is the shared-proxy cohort, which is who every incident in this family was actually about.
23. ⛔ **The rule is now uniform, because the special case was what hid the leg in the first place.** *Every limiter on the login routes stamps its own name when it refuses; no limiter counts a request a DIFFERENT limiter refused.* `loginIpFloodLimit`, `loginRateLimit`, `strictLoginRateLimit` and `mfaRateLimit` all obey both halves. `verifyCaptcha` still does not stamp, so its 400 stays counted (AC2), and the ceiling still counts its OWN 429s — pinned by `attempts: 101, 102, 103`.
24. ⭐ **This is why the marker carries a NAME and not a boolean**, and the second pass is what proves it. A boolean can only say "somebody refused this", which forces every limiter to choose between discounting its own 429s (Option A's trap) and counting everyone's. The name lets each limiter ignore every refusal but its own — so the same one-line predicate works at all four sites with no special cases.
25. ⭐ **`mfaRateLimit` is the leg mount-order reasoning could never have reached.** It is mounted LAST on the two MFA step-2 routes — behind all three login limiters — so its 429 was counted by every one of them. AC3's rationale was framed entirely in terms of what sits before what, and this limiter sits after everything. ⚠️ Testing it needed SUCCESSES, not failures: on a stream of failures the per-email limiter refuses at 6 and `mfaRateLimit` (10/min, all responses) is never reached at all, so a naive test would have passed while exercising nothing.

**FR2 — the collision is now IMPOSSIBLE, not merely detected.**

26. ⛔ **The scan was measuring the wrong population, and I had shipped it that way.** The first pass's test enumerated `'rl:…'` literals in `src/middleware/*.ts` and reported a clean pass over **24 of 31** keyspaces. It could not see `import-rate-limit.ts` (prefix passed to a factory), `wizard-draft-rate-limit.ts` (through a `store(prefix)` helper) or `registration-status.service.ts` (a service, not middleware — and it holds `rl:regstatus-email:`). A census that counts SITES rather than CALLERS [[pattern-census-counts-sites-not-callers]].
27. All **31** keyspaces now live in `apps/api/src/lib/rate-limit-prefixes.ts`, which asserts the invariant **at module load**. A colliding prefix throws on import, naming the pair, so the API cannot boot with one — and unlike a test, it cannot be deleted or skipped. Mutation **L** demonstrates it: the suite does not fail, it does not *run*. The test additionally fails if an `'rl:…'` literal appears anywhere in `apps/api/src` outside the registry, which is what makes "add your prefix here" enforceable rather than a comment.
28. ⚠️ **No prefix VALUE changed in this pass** — it is pure indirection over the five renames already made, so the deploy note below is unchanged.

**FR4 — the id pattern stops deciding what a residual row IS.**

29. ⛔ **The real defect was that one regex did two jobs**: naming the row, and deciding whether the table was a ledger at all. That is why it could not be widened safely — every letter added also swept in the review-finding tables (`H1`, `M3`, `B10`, `S3`, `T4`), where "OPEN" means something else. The jobs are now separate: **inside a section whose heading mentions residuals, any short alphabetic id counts; outside one, the conservative `[RA]\d+` still applies.**
30. That closes both failure modes at once — the §2ab.1 hazard (adjudication's `D1`/`D2` ledger for 13-69 was invisible, which is *worse* than no ledger because `HAS_LEDGER` disables the prose fallback) and the false-positive blast (`[A-Z]\d+` everywhere matched 510 rows instead of 229 and produced two wrong hits). **Measured on the real corpus before shipping: 0 new hits, 0 lost hits, 0 verdicts changed** — a pure widening of what the guard can SEE, with no change to what it says.
31. ⚠️ **A false alarm I raised and then withdrew, recorded because the withdrawal is the useful part.** I found 255 residual rows containing an escaped `\|` and reported the state cell as mis-read across most of the repo. Checking it properly: **0 rows are judged differently** by a naive split versus a pipe-safe one — in every one of the 255 the escaped pipe falls in the evidence cell, after column 3. My first measurement had counted "an escaped pipe anywhere in the first three *naive* segments", which is not the same question. `cells()` now splits on unescaped pipes only, and it is documented as hardening a LATENT hole rather than fixing a live miss [[pattern-a-clean-result-must-prove-it-measured]].

⚠️ **One consequence of making those rows visible, handed to 13-68 rather than fixed here.** 13-68's adjudication ledger is `| # | residual | why not fixed here | reopen trigger |` — its third column is a JUSTIFICATION, not a state. The done-scan reads column 3 as the state, so now that `A1`/`A2`/`A3` are visible it will read "Both need production measurement, not argument…" as a state cell and conclude the row is closed. A1 is genuinely closed (this story closed it, and its cell now says so). ⛔ **CORRECTED AT ADJUDICATION 2026-09-20 — this passage went on to say "A2 and A3 are not [closed], and they would slip through the day 13-68 flips to `done`". THAT IS NO LONGER TRUE, because the same changeset closed them:** both now read `✅ SUPERSEDED BY STORY 13-70 R5 + R6 … which carry a DATE`. **Tested, not reasoned:** 13-68 was flipped to `done` in memory and the done-scan run over it — it returns exactly **one** hit, `R2b`, which is the only genuinely open row. So there is **no live exposure**; what remains is the structural point, and it stands on its own. The fix belongs in 13-68 — give that table a state column — and it is recorded here because this story is what made the rows visible in the first place. ⭐ It is also the same lesson one level up: a guard that reads position 3 is trusting a convention the document never promised.

---

## Third pass — R1 closed here, and 13-68 emptied rather than reloaded, 2026-09-20

R1 could not be handed back to 13-68: that story is closing, and parking a live question in a closing story is precisely the habit this story exists to end. So R1 is decided here, and the cross-references run the other way — **out** of 13-68.

33. ⛔ **I checked the PRD before recommending a number, and it already carried a ruling on exactly this.** The **flood-ceiling divergence ruling (2026-09-17)** permits login's 100 against its Tier-1 peers' 300, *because login's ceiling is mounted ahead of the CAPTCHA and therefore also bounds the hCaptcha `siteverify` call and the bcrypt work behind it* — and it requires BOTH costs to be measured **by 2026-10-15**, harmonising to 300 if neither constrains. **So "raise it to 300" was never mine to take**: it would contradict a settled ruling whose stated precondition is unmet, and it would increase the very exposure that is unmeasured [[feedback-settled-ruling-is-not-a-defect]].
34. ✅ **R1 — DECIDED: accept `max: 100`.** The decision turns on something this story itself changed. **Until FR1 the binding constraint was ONE PERSON** — five real attempts plus up to 95 of their own refusals reached 100 and shut their entire proxy for fifteen minutes. It now takes ~17 simultaneous people to spend the same budget, against a measured concurrency of three. FR1 did not raise the number; it changed who can spend it. R1 asked for *"a decision owed BEFORE the cohort grows"* — this is that decision, with its reopen trigger, and the trigger is now diagnostic because `attempts` means "requests from this IP" again.
35. **The code comment was wrong twice over and has been replaced, not annotated.** It said *"the cohort is 17 people — every one of them failing five times is 85."* Measured read-only on prod 2026-09-20: **28 enumerator accounts, nine of them the operator's own harness logins → 19 real field accounts** (so "17" mixed field staff with the test harness); and "failing five times" counted only failures, while this is the one login limiter that counts successes — the per-person figure is **5 + 1 = 6**. Measured concurrency 3 × 6 = **18**; absolute worst case 19 × 6 = **114**; 100 buys ≈16 concurrent people behind one address.
36. ⛔ **AND A COST OF MY OWN FR1 CHANGE, FOUND BY CHECKING THE RULING'S JUSTIFICATION RATHER THAN ASSUMING IT.** Mount order is flood → CAPTCHA → burst → strict, so a request the burst limiter refuses has ALREADY passed the captcha and already cost a `siteverify` call — and FR1 stopped the ceiling counting it. The two halves of the divergence ruling's justification moved in **opposite** directions: **bcrypt bounded better** (refused requests never reach the controller, so the budget is no longer spent on requests bcrypt never sees), **`siteverify` bounded worse**. MEASURED both ways and pinned as a test: **40 captcha-passing requests refused downstream cost 40 siteverify calls while the counter peaked at 6**; 40 forged-captcha requests cost 40 calls and moved the counter to **40**, because `verifyCaptcha` does not stamp. Recorded as **R6**, against this story rather than discovered later against someone else's. ⭐ Scoped honestly: a production token is single-use, so a reused one returns `success:false` → 400 → counted; the exposure is *one solved captcha per unbounded call*, not free.
37. **R5 and R6 are DATED 2026-10-15 — the PRD's own deadline, not one I invented.** They are the two measurements the divergence ruling already required and nobody owned: hCaptcha's per-IP limit (a vendor fact, not inferable from our traffic) and bcrypt p95 on the 2 GB VPS (a load measurement on the live box, which adjudication owns). ⚠️ A13: the attempt is recorded rather than the blocker asserted.
38. ⭐ **THIS IS FR4 EARNING ITS KEEP ON THE STORY THAT BUILT IT.** Verified by running the detector against the real corpus at two future dates: **as of 2026-10-15 → 0 expired; as of 2026-10-16 → 3** — `13-68 R2b`, `13-70 R5`, `13-70 R6`, all converging on the same two measurements. ⚠️ **RE-VERIFIED AND NOW FOUR after the adversarial review, 2026-09-20:** the review dated **R4** (it had a deadline-free "OPEN" and an owner that pointed at a ruling already settled) and opened **R7**, which was then ruled and CLOSED in the same session — so the same probe reads → **0 on 2026-10-15, 4 on 2026-10-16** — ⛔ **THEN 5 when adjudication added R8, then 4 again when Awwal's ruling ACCEPTED R4 and its date came off (2026-09-20). Final, re-verified at fixed clocks: 0 / 0 / 4 / 4 — R2b, R5, R6, R8.** Superseded list follows: R2b, R4, R5, R6. ⭐ R7 going from opened to closed inside one review is the guard working in both directions: it held a deadline long enough for the work to be ruled, and stopped holding it the moment the work was done. ⚠️ **AC11's "exactly ONE genuine marker" is now THREE, deliberately — and FOUR after the review.** That figure was a dated measurement (2026-09-19), not an invariant, and the story's stated reason for keeping R1 undated — protecting the headline number — was the tail wagging the dog: declining to date a real deferral to preserve a count in a comment. A guard enforcing three real deadlines is better proof that FR4 works than a fixture-perfect baseline.

**What this empties out of 13-68**, so it can close on its own merits rather than on a reroute:

| 13-68 row | disposition |
|---|---|
| **A1** | ✅ closed by FR1 — and its *"`skipFailedRequests` would skip 401s and gut the ceiling"* reasoning CORRECTED, not overruled: true of the library's default predicate, not of the marker predicate |
| **A2** | ✅ superseded by 13-70 **R5 + R6** — the same two measurements, now dated. ⛔ And A2's own *"400 verifications/IP/hour"* no longer holds as an upper bound, per R6 |
| **A3** | ✅ superseded by 13-70 **R5** — it raised the 100-vs-300 question with no owner and no date; R5 has both |
| **R2a, R8** | ✅ closed by decision (FR5) |
| **R4** | ✅ closed on evidence — the stale `googleAuthRateLimit` row was removed 2026-09-17; `grep` returns only its epitaph. The residual had outlived its defect |
| **R5, R7** | ✅ closed by this story's FR2 and FR3 |
| **R2b** | ⚠️ **still OPEN, correctly** — the cardinality monitor, `DATED 2026-10-15`. It is real, unbuilt work, and 13-68 cannot read `done` while it stands. That is the guard working, not a blocker to route around |

**Still open, and deliberately.**

32. **R5** and **R6** are open BY DESIGN and dated to the PRD's 2026-10-15 — they are the harmonisation question and the siteverify decoupling, and both are settled by the same hCaptcha measurement. **R4** (the `close`/`error` decrement listeners `skipFailedRequests` brings to the flood ceiling) is unchanged and still OPEN. It was not part of the three classes, it needs a ruling rather than code — accept it in writing, or pin it with a deliberate abort test — and an abort test is timing-dependent in a repo that already fights local suite flakiness. **R1** and **R2** are unchanged: R1 is a threshold decision owed before the re-provisioning blast, R2 discharges on deploy.

---

**Deploy note (no env vars, no migration).** Redis-only. Counters under the five old prefixes are orphaned and age out on their own TTL (≤15 min, except `rl:login:strict:` at ≤1 h), so at worst one window's budget is handed back to whoever was mid-window. ⚠️ One operational consequence worth knowing: any runbook or handover that scans `rl:login:e:*` must now scan `rl:login:burst:e:*` (13-68's Handover §B has such a command).

### File List

**API — production code**
- `apps/api/src/middleware/login-rate-limit.ts` — FR1 marker + `skipFailedRequests` on the ceiling, stamps in both downstream handlers, `REFUSED_BY_*` constants; FR2 `LOGIN_RATE_LIMIT_PREFIX` → `rl:login:burst:`
- `apps/api/src/middleware/registration-rate-limit.ts` — FR2 `rl:register:ip:`, `rl:activation:token:`; FR3 delegate to `buildLoginRateLimitKey` + `keyedBy` log field
- `apps/api/src/middleware/password-reset-rate-limit.ts` — FR2 `rl:password-reset-complete:token:`
- `apps/api/src/middleware/wizard-draft-rate-limit.ts` — FR2 `rl:wizard-draft:ip:`; FR3 delegate to `buildLoginRateLimitKey`
- `apps/api/src/routes/auth.routes.ts` — mount-order comment amended (no reordering)
- `apps/api/src/types.d.ts` — `Express.Locals.rateLimitRefusedBy`, typed once
- `apps/api/src/lib/rate-limit-prefixes.ts` — **NEW**: all 31 keyspaces, with the disjointness invariant asserted at module load
- `apps/api/src/lib/story-residual-guard.ts` — FR4 `RESIDUAL_ID` widened to `[RA]\d+`; `findExpiredDatedResiduals`, `formatExpiredResiduals`, `toUtcDateKey`; second pass added `residualRows` (section-aware) and pipe-safe `cells`
- `apps/api/src/middleware/mfa-rate-limit.ts` — stamps its refusal (R3)
- **R7 (review, 2026-09-20)** — `registration-rate-limit.ts`, `password-reset-rate-limit.ts` and `wizard-draft-rate-limit.ts` additionally carry the FR1 rule for their own routes: eight stamps, and `skipFailedRequests` + the marker predicate on the four ceilings. `login-rate-limit.ts` gains the eight `REFUSED_BY_*` constants and the R7 docblock
- `apps/api/src/middleware/{import,magic-link,marketplace,message,operations,reauth,registration-status,reveal,settings}-rate-limit.ts` — prefixes moved to the registry (no value changed)
- `apps/api/src/services/registration-status.service.ts` — same; this is the keyspace the middleware-only scan could not see
- `apps/api/src/middleware/reveal-rate-limit.ts` — **review fix**: `rl:reveal:user:` / `rl:reveal:device:` moved into the registry. Template literals, which is why the disjointness scan never saw them (no value changed)
- `apps/api/src/services/marketplace-edit.service.ts` — **review fix, NEW TO THE CHANGESET**: `rl:edit-token:` likewise. A 3/day/NIN budget in a service, invisible to both the `prefix:` scan and the single-quote scan
- `apps/api/scripts/lint-story-residuals.ts` — runs both checks, one injected clock, its own failure message

**API — tests**
- `apps/api/src/middleware/__tests__/refusal-not-a-request.binding.test.ts` — **NEW (review, R7)**, 6 tests: the four non-login families pinned in both directions through their REAL route stacks, plus a self-refusal check and a skip sentinel
- `apps/api/src/middleware/__tests__/rate-limit-prefix-disjointness.test.ts` — **NEW**, **8** tests (5 in pass 1, +1 registry invariant in pass 2, +2 in the review)
- `apps/api/src/middleware/__tests__/login-rate-limit.binding.test.ts` — **+7** tests (5 in pass 1, +1 mfaRateLimit leg in pass 2, +1 R6 siteverify in pass 3)
- `apps/api/src/middleware/__tests__/login-rate-limit-key.test.ts` — vacuous nesting assertion rewritten (0 net)
- `apps/api/src/middleware/__tests__/registration-email-rate-limit-key.test.ts` — +2 (AC5)
- `apps/api/src/middleware/__tests__/wizard-draft-rate-limit-key.test.ts` — +2 (AC5)
- `apps/api/src/lib/__tests__/story-residual-guard.test.ts` — **+28** (13 in pass 1 for AC6/AC7/AC8/AC11/AC12, +7 section-class in pass 2, +8 in the review for the fence and closure-scope fixes)
- `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts` — NFR4.4.c comment table (0 net)

**Records**
- `_bmad-output/planning-artifacts/PRD.md` — NFR4.4.d annotation removed (AC10); NFR4.4.a/c rows updated
- `_bmad-output/planning-artifacts/epics.md` — 13-70 indexed (6.3)
- `_bmad-output/implementation-artifacts/13-68-login-rate-limit-identity-axis.md` — R2a/R8 closed by decision, R5/R7 closed by this story, A1 closed and its reasoning corrected
- `_bmad-output/implementation-artifacts/13-70-limiter-hygiene-and-dated-residuals.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `ready-for-dev` → `in-progress` → `review`
- `docs/adjudication-agent-handoff.md` — **ADDED AT ADJUDICATION 2026-09-20**: new playbook **§2al** (*a review may propose a closure, never sign one in the principal's name*; two-part attribution as the standing format). Written here rather than left in this story because a lesson that stays in a story file is a lesson the next session re-learns

### Gates (Task 7 — run here, quoted whole, exit codes captured to files)

| gate | result |
|---|---|
| `tsc --noEmit` (api) | **0** |
| `eslint` on all **28** touched API files | **0** — *re-run by the review 2026-09-20; the story said 15, which was a pass-1 count over a smaller changeset* |
| `lint:story-residuals` (DIRECT) | **0** — 328 stories scanned |
| `lint:registry-read` (DIRECT) | **0** — **411** files scanned |
| `lint:respondent-write` (DIRECT) | **0** — **411** files scanned |
| **API suite** | **330 files (328 passed, 2 skipped) · 4,657 tests · 4,649 passed · 8 skipped · 0 failed · exit 0** — *re-run whole by the review, serialised, after the last edit* |
| **Web suite** | **281 files · 3,107 tests · 3,105 passed · 2 todo · 0 failed · exit 0** — *re-run by the review; unchanged, and no file under `apps/web` or `packages/` was touched* |
| mutation **N** / **O** / **P** / **Q** | **4 / 1 / 1 / 4 failed** — every guard and predicate the review added or changed, RED-verified (Debug Log) |

⚠️ **THE WEB SUITE WENT RED ONCE DURING THE REVIEW, AND IT WAS THE REVIEW’S FAULT** — recorded because "1 failed / 279 files" in a log six weeks from now reads like a real defect [[A13]]. It was run CONCURRENTLY with the API suite, which Task 7.2 forbids in as many words. Two worker forks timed out before starting (`RevealAnalyticsPage`, `GuideRegisterPage` — that is the 281→279 file gap) and one lazy-route `waitFor` timed out under load. Re-run ALONE: **281 files, 0 failed, 452s** against **1,290s** contended. [[feedback_local_full_suite_flakiness]]

⭐ **Re-run in full after EACH pass AND after the review, never inherited.** The review added **+16**: +8 guard (fence and closure-scope), +2 prefix (interpolated keyspaces, scan shapes), +6 the new R7 binding file — 4,641 → 4,651 → **4,657**, predicted before the run and matched exactly [[pattern-predict-then-compare]]. The API suite moved 4,631 → **4,640** (+9 in pass 2: the `mfaRateLimit` leg, 7 guard-class tests, 1 registry-invariant test) → **4,641** (+1 in pass 3: the R6 siteverify assertion). Web is unchanged throughout because no file under `apps/web` or `packages/` was touched, and it was still re-run rather than assumed.

⚠️ **Guards run DIRECT, never through `pnpm lint`** — `_bmad-output/**` is outside the turbo `lint` task's inputs, so a story-only change replays a cached verdict.

**Test-count delta accounted file by file** [[pattern-unexplained-test-delta-is-unrecorded-work]]: **+7** binding, +2 registration key, +2 wizard-draft key, **+28** guard, **+8** new prefix file, **+6** new `refusal-not-a-request`, 0 net in login-key and coverage = **+53**. **API suite total 4,657** (330 files, 4,649 passed / 8 skipped / 0 failed — measured by adjudication 2026-09-20, sharded 4× per §2aj), so the tree before this changeset stood at **4,604**.

⛔ **CORRECTED AT ADJUDICATION — this line previously read `+5 / +13 / +5 = +27`, total 4,631.** Those were the **pass-1** sub-counts, never updated after passes 2 and 3 and the review added tests, and `refusal-not-a-request`'s 6 were missing entirely — the File List's own parentheticals (`+7 = 5+1+1`, `+28 = 13+7+8`, `8 = 5+1+2`) contradicted the sum sitting beneath them. ⭐ **The baseline 4,604 was nonetheless CORRECT and reconciles independently:** 328 files + 2 new = 330, and 4,603 at 13-69's close (2026-09-18) + 1 net from `fbbc213` = 4,604. ⭐ **And the §2ah test passes: every one of the 53 is named file-by-file, so this is §2w record drift, NOT unrecorded work** — which is the distinction §2ah exists to force, and the reason the delta had to be measured before it was explained. ⚠️ The 4,603 in the handoff was measured 2026-09-18, before `fbbc213`/`b8f9950`; it is not today's baseline and was not used as one.

### Review Follow-ups (AI)

**Adversarial code review, 2026-09-20 — BMAD `code-review` workflow, run on a different model than the one that wrote the story.**
Eleven findings. Every claim below was established by EXECUTION against this tree, never from the story's account of itself.
All eleven are applied; the two that are code-behaviour rather than record are RED-VERIFIED by mutation (N and O in the Debug Log).

⛔ **H1 WAS SPLIT AND BOTH HALVES ARE NOW DONE.** The record half was fixed immediately. The code half was first carried as
**R7**, `DATED 2026-10-15`, on the reasoning that a limiter counting change is a dev-story plus an adversarial review — then
ruled by Awwal in-session and implemented here, with the burst-breaker interaction checked rather than assumed (it improves:
`recordRegistration429` still fires on every refusal that happens, and fewer false refusals happen). **R7 is closed.**

#### 🔴 HIGH

- [x] **[AI-Review][High] H1 — NFR4.4.d is route-general and four MORE route families still violate it; the PRD said the clause was met on every leg.** [`_bmad-output/planning-artifacts/prd.md:240`]
  AC10 exists to stop a PRD asserting a rule the code breaks, and the annotation it replaced was route-general. `activationIpFloodLimit`→`activationRateLimit`, `passwordResetCompletionIpFloodLimit`→`passwordResetCompletionRateLimit`, `registrationRateLimit`→`registrationEmailRateLimit` and `wizardDraftRateLimit`→`wizardDraftEmailRateLimit` all have the shape the login pair had, and `grep` for a skip flag across those three middleware files returns nothing.
  **FIXED, BOTH HALVES.** Record: the clause names all four pairs with file:line and the incident. Code: ruled by Awwal in-session and done here — all eight limiters stamp, the four ceilings carry `skipFailedRequests` + the marker predicate, the four NFR4.4.c mode rows moved to `ALL-EXCEPT-REFUSALS`, and `refusal-not-a-request.binding.test.ts` pins both directions per family through the real route stacks. RED-VERIFIED by mutations **P** (1 failed / 5 passed) and **Q** (4 failed / 2 passed). **R7 closed.**

- [x] **[AI-Review][High] H2 — the registry held 31 of 34 keyspaces, and the scan that guarantees it could not see the three it missed.** [`apps/api/src/lib/rate-limit-prefixes.ts:19`, `apps/api/src/middleware/__tests__/rate-limit-prefix-disjointness.test.ts:67`]
  The stray-literal scan matched `/'(rl:[^']*)'/g` — single quotes only — so `rl:reveal:user:`, `rl:reveal:device:` (`reveal-rate-limit.ts:19-20`, three lines from `REVEAL_GLOBAL`, which *was* registered) and `rl:edit-token:` (`marketplace-edit.service.ts:68-69`) were invisible. Pass 1's scan counted the sites a `prefix:` grep reached; pass 2's counted the sites a single-quote regex reached — [[pattern-census-counts-sites-not-callers]] twice, in the fix for itself.
  **FIXED:** three keyspaces registered (no value changed), both files now reference the registry, the scan widened to `'`/`"`/backtick stopping at `${`, and two new tests — one naming the interpolated keyspaces by value, one asserting the scan against all four literal shapes synthetically. ⭐ The registry-count assertion is what caught the review itself miscounting four SITES as four keyspaces; it is three.

#### 🟡 MEDIUM

- [x] **[AI-Review][Medium] M1 — one word in an evidence cell silently disarmed a dated deadline.** [`apps/api/src/lib/story-residual-guard.ts:329,367`]
  `ROW_IS_CLOSED` was tested against the whole row. Reproduced on a row that is genuinely open and past due: adding `RESOLVED` to its evidence cell took it from 1 hit to 0.
  **FIXED:** the opt-in (`DATED`) and the opt-out (closure vocabulary) now read the SAME cell, plus the id cell for `~~struck~~`/`✅`. The "a dated deferral can sit in any table" property is intact — neither is tied to a column number, pinned by a test that finds a marker in column 4. **RED: mutation O, 1 failed / 43 passed.** ⭐ It then caught the review's own edit, which had written "closed" into R4's new dated cell.

- [x] **[AI-Review][Medium] M2 — the section detector parsed shell comments inside fenced code blocks as Markdown headings.** [`apps/api/src/lib/story-residual-guard.ts:112,139`]
  156 lines inside ``` fences in `implementation-artifacts/*.md` parse as headings today. Both directions reproduced: a `# comment` at level 1 CLOSES an open ledger (every row after the fence goes invisible — §2ab.1 through another door), and `# Residuals recount` OPENS one (a review-finding table read as a ledger — the `[A-Z]\d+` blast).
  **FIXED:** `residualRows` tracks ``` and ~~~ fences and skips their contents. Measured before and after: fence-blind and fence-aware agree on all 250 rows, 0 differ — a latent hole hardened, written down as such. **RED: mutation N, 4 failed / 40 passed.**

- [x] **[AI-Review][Medium] M3 — R3 changed two limiters' counting mode; their NFR4.4.c rows still read `FAILED`.** [`_bmad-output/planning-artifacts/prd.md:227`, `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts:27-28`]
  Only the ceiling's row moved to `ALL-EXCEPT-REFUSALS`. Completion Note 20 was written in pass 1; pass 2's R3 moved two more. `rate-limit-coverage.test.ts:51` says these fields are not asserted and *"a reviewer reading this table is the only check that it is true"* — so this is that check firing.
  **FIXED:** both rows now read `FAILED-EXCEPT-REFUSALS` in the PRD register and in the coverage comment table, each naming R3 and the limiter mounted behind it.

- [x] **[AI-Review][Medium] M4 — two of the three quoted guard gates do not reproduce.** [`13-70-…md:415-416`]
  Story: 410 files. Direct run today: **411 / 411**. Attributed exactly — both guards skip `__tests__` and `*.test.ts`, so the new test file is not counted and `rate-limit-prefixes.ts` is; 411 minus that one file is 410. The recorded runs predate pass 2 creating it, against a line reading *"Re-run in full after EACH pass, never inherited."*
  **FIXED:** Gates table re-quoted from runs made during this review.

- [x] **[AI-Review][Medium] M5 — "two LIVE collisions" is true of one of them.** [`apps/api/src/middleware/registration-rate-limit.ts:253`]
  `activationRateLimit`'s IP fallback is unreachable: both mounts are `/activate/:token`, so express cannot match without a token — as the docblock twelve lines below already said. `passwordResetCompletion*` IS live, because `POST /auth/reset-password` takes its token from the body. The claim had propagated into four artifacts.
  **FIXED** in all four: the limiter comment, the registry docblock and its `ACTIVATION_TOKEN` entry, the disjointness test docblock, and 13-68's R5 closure. The rename stands either way — the property is the deliverable — but one of these was costing users a budget and one was waiting for a refactor, and a record that flattens them teaches the wrong lesson.

- [x] **[AI-Review][Medium] M6 — R4 was OPEN with an owner that resolved to a conversation already settled.** [`13-70-…md:233`]
  *"whoever takes the R3 ruling — it is the same conversation"*, and R3 was ruled and closed in pass 2. R4 is the behaviour change FR1 introduced (`skipFailedRequests` brings `close`/`error` decrement listeners, so an aborted request is no longer counted) — code-read only, no date, no owner. I confirmed the code read against the installed dist at `express-rate-limit@8.3.0/dist/index.cjs:912-937`; the reasoning is right, the disposition was not.
  **FIXED:** `OPEN — DATED 2026-10-15`, owner Awwal, grouped with R5/R6/R7.

#### 🟢 LOW

- [x] **[AI-Review][Low] L1 — the blast-radius table baked into the guard source no longer reproduced.** [`apps/api/src/lib/story-residual-guard.ts:304-306`]
  959 dated rows / 1 marker in a row / 5 in prose, measured mid-pass; the passes that followed added rows to this story's own file. **FIXED:** re-measured last, after every edit in this review, with the story's own commands, and labelled as measured pre-commit so the next reader knows why it moves.

- [x] **[AI-Review][Low] L2 — the eslint gate row said 15 touched files; 27 API files changed.** [`13-70-…md:413`]
  **FIXED:** re-run over all 27 during this review — **0 problems** — and the row now says 27.

- [x] **[AI-Review][Low] L3 — the File List's per-file test counts were pass-1 figures.** [`13-70-…md:393-398`]
  Claimed binding +5, guard +13, prefix "5 tests"; actual at the end of pass 3 was +7, +20, 6. The totals always reconciled via the +27/+9/+1 accounting, which I verified closes at 37. **FIXED:** per-file counts restated with their per-pass breakdown, including this review's additions.

#### Claims that were challenged and survived

Recorded because the prompt asked for them to be falsified, and they held. **Polarity** at all four sites, confirmed from `express-rate-limit@8.3.0/dist/index.cjs:912-937` rather than the comment — `skipFailedRequests` decrements when the predicate is false and registers `finish`/`close`/`error`; `skipSuccessfulRequests` decrements when true and registers `finish` only. **The dated-residual prediction**, exact: 0 on 2026-10-15, 3 on 2026-10-16, naming R2b/R5/R6. **Mutation L**, re-run against a copy of the registry: throws at module load, naming the pair. **The API suite**, re-run from `apps/api`: 329 files (327 passed, 2 skipped) · 4,641 tests · 4,633 passed · 8 skipped · 0 failed · exit 0 — the dev's figures to the test. **The +27/+9/+1 accounting**, which closes at 37 added tests. **No prefix VALUE changed in pass 2** — diffing every `rl:` literal at HEAD against the registry gives exactly 5 gone and 5 new, all pass 1's renames. **FR3 reuses `buildLoginRateLimitKey`**; no second hasher. **The File List against `git status --porcelain`**: 32 = 32, the brace-glob expanding to exactly the 9 remaining middleware files. **No new env vars, no migration, nothing outside `apps/api/` + `_bmad-output/`.**

⭐ **The suite wall-clock question (262s → 1142s) is answered and it is not `repeatSettled`.** My run: `tests 270.55s, import 1623.70s, transform 67.64s` of a 1301s wall clock. Test execution is ~270s both times; the variance is vitest module import/transform, cold versus warm. `repeatSettled` issues ~343 `setTimeout(…, 0)` calls across the whole binding file ≈ 0.35 s. There is no added CI cost to find.

---

## For adjudication — 2026-09-20, after the adversarial review

⛔ **NOTHING IS COMMITTED. Adjudication owns the commit.** This section is the handover: what changed, what
was decided inside the review that adjudication may want to un-decide, what is still unproven, and what the
deploy carries. Everything asserted here was established by execution against this tree; where it was not,
it says so.

### 0. The review itself, and one caveat about who ran it

The BMAD `code-review` workflow was run against the uncommitted 13-70 changeset. The prompt that governs it
says to run it on a **different model than the one that wrote the story** — Opus 5 (1M) wrote it, and Opus 5
(1M) ran the review after Awwal reaffirmed. ⚠️ **That caveat is not discharged by this section, and should
not be treated as discharged.** The compensation applied was to verify every claim by EXECUTION rather than
by reading: every number below was re-measured, every behavioural claim re-derived from the installed
`express-rate-limit` dist rather than from a comment, and every new guard RED-verified by mutation. A
second-model pass over **this** section's four decisions is the cheapest way to close the gap properly.

⭐ **The review found three of its own errors while running, which is the honest argument that the method
works and the least comfortable thing in this document.** They are listed in §5 rather than quietly fixed.

### 1. What the review changed

Eleven findings, all applied. The full list with file:line and failure scenarios is in **Review Follow-ups
(AI)**; this is the shape of it.

| | what it was | what it is now |
|---|---|---|
| **H1** | The PRD said NFR4.4.d was met on every leg. It was met on the four login routes; four more route families violated it, and the registration one was residual A1's own incident on another route | Record corrected, then the code done too — see §2. **R7 opened and closed in-session** |
| **H2** | The registry held 31 of 34 keyspaces, and the scan meant to guarantee that could not see the three it missed (template literals) | Three registered, both files reference the registry, scan widened to `'`/`"`/backtick, 2 new tests |
| **M1** | One closure word anywhere in a row disarmed its dated deadline | Opt-in and opt-out now read the SAME cell. Mutation **O** |
| **M2** | The section detector read shell comments inside ``` fences as Markdown headings — 156 such lines exist today | Fence tracking. Mutation **N** |
| **M3** | R3 changed two limiters' counting mode; their NFR4.4.c rows still said `FAILED` | Both rows, PRD and coverage table |
| **M4** | Two of three quoted guard gates did not reproduce (410 vs 411) | Re-run direct and re-quoted |
| **M5** | "Two LIVE collisions" was true of one | Corrected in all four artifacts it had propagated into |
| **M6** | R4 was OPEN with an owner pointing at a ruling already settled | `DATED 2026-10-15`, owner Awwal |
| **L1/L2/L3** | Blast-radius numbers, eslint file count and per-file test counts all stale | Re-measured; L1 labelled self-referential |

### 2. The one decision the review made and then had overturned — read this one

**H1 split into a record half and a code half.** The record half (the PRD asserting a rule the code only
partly kept) was fixed immediately. The code half — extending the marker rule to the four other families —
the review **declined to do inline**, on three stated grounds: this story's own Out of Scope says a limiter
change takes a dev-story plus an adversarial review; `registrationRateLimit`'s 429s feed Story 13-46's burst
breaker; and `skipFailedRequests` brings R4's listeners to every ceiling it touches. It was carried as
**R7, DATED 2026-10-15**, with a full recipe.

**Awwal ruled to do it in-session, and it was done.** ⭐ The ruling was right on the first ground and the
review was wrong: the burst-breaker interaction, once CHECKED rather than asserted, **improves** —
`recordRegistration429` fires from each `handler`, so every refusal that happens is still counted, and the
ceiling simply refuses less often, so the breaker stops reading a citizen's retries into their own refusal
as fresh turn-aways. That is a lesson worth keeping: *the review named an interaction as a blocker without
measuring it*, which is the same move [[pattern-blocked-on-a-measurement-means-try-first]] names.

⚠️ **The first ground still stands and adjudication should rule on it explicitly**: this changeset now
contains a security-behaviour change to four authentication/registration limiters that was made during a
code review rather than a dev-story. It is tested in both directions per family and RED-verified, but the
process question is real and is not for the review to settle.

### 3. The asymmetry inside R7 that needs ratifying

All eight limiters stamp. Only the **four ceilings** carry `skipFailedRequests` + the marker predicate. The
four person-keyed limiters stamp and take no predicate. That is a decision, not an oversight:

* Every mount of all eight was enumerated (`auth.routes.ts:27,29,108-109,115-116`;
  `registration.routes.ts:60,61,74-75,99`). Each person-keyed limiter is **last** on every route it appears
  on — `registrationBurstWatch` sits behind one of them but calls `next()` and never answers 429 — so none
  of them can be charged for another limiter's refusal today.
* Giving them the flag anyway would register R4's `close`/`error` listeners on **both** limiters of a route,
  leaving **nothing** on that route counting an aborted request. Login escapes that only because burst and
  strict use `skipSuccessfulRequests`, which registers `finish` alone.

⛔ **So one mount-order assumption remains, and R3 is precisely the reason to say it out loud rather than
rely on it**: mount a third limiter behind any of those four and it needs the predicate. The tripwire is
`rate-limit-coverage.test.ts`, which asserts each route's limiter list — adding one reds there. **If
adjudication prefers uniformity over the abort-counting property, say so and all four get the predicate; it
is four lines and the tests already exist.**

### 4. What is still NOT proven, and by how much

* **R2 — the decrement against `rate-limit-redis@4`: ⛔ UNPROVEN, and R7 multiplied it by five.**
  Every binding test here runs the IN-MEMORY store. CI proves the predicate WIRING and exercises
  `MemoryStore.decrement()`, never the Redis one that runs in production. R2’s post-deploy procedure is
  written for a login refusal; **it should now also drive a registration refusal**, because four of the
  five ceilings it covers were added today and none is exercised by the procedure as written.
* **R4 — aborted requests: ⛔ CODE READ ONLY, no test, and now FIVE ceilings rather than one.**
  Confirmed against `express-rate-limit@8.3.0/dist/index.cjs:912-937`: `finish` consults the predicate,
  `close` decrements when `!response.writableEnded`, `error` decrements unconditionally. The ruling is
  unchanged; what it is worth is five times what it was. Still deadlined to 2026-10-15.
* **R5 / R6 — unchanged**, deadlined to 2026-10-15, both settled by the same hCaptcha measurement.
* **M2 and the pipe-split hardening — LATENT, not live.** Measured: fence-blind and fence-aware agree on
  all 250 residual rows, 0 differ. Hardening, and labelled as such rather than dressed up as a save.

⭐ **The guard expires 4 rows on 2026-10-16** — `13-68 R2b`, `13-70 R5`, `R6`, `R8` — verified by
adjudication at fixed clocks (**0** on 2026-09-20, **0** on 2026-10-15, **4** on 2026-10-16, **4** on
2027-01-01). ⛔ **It read 5 an hour earlier: `R4` was ACCEPTED by Awwal's ruling (decision 3 of 4) and its
DATED marker removed, because a row cannot be both accepted and blocking** — a deferral is dated until it
has a decision, and then it is not. **`R2` discharged on prod the same session.** So the set moved
3 → 5 → 4 → 5 → 4 across one day, every step measured rather than reasoned, which is what
[[pattern-falsifiable-number-is-a-live-artefact]] looks like when it is actually obeyed. ⛔ **R8 was added AT ADJUDICATION and did not fire on its first write**, which is how its own
second defect was found: the deadline check reads closure vocabulary from the id cell too, and R8's
description quoted that vocabulary. Re-armed by moving the quotes to the evidence cell, then re-measured —
6 dated rows, **0** now disarmed. ⭐ **The story's own deliverable caught a defect in the story's own
deliverable, on a row written by its adjudicator.** It went 3 → 5 → 4 → 5 during this session: the
review dated R4 and opened R7, then R7 was ruled and closed. **A guard that held a deadline long enough for
the work to be ruled and stopped holding it the moment the work was done is the deliverable behaving
correctly in both directions, on its own story.**

### 5. Three errors the review made, recorded because the corrections are the useful part

1. **It miscounted its own finding.** H2 was written up as "four keyspaces missing". It is four SITES and
   **three** keyspaces — `rl:edit-token:${nin}` and `rl:edit-token:rid:${id}` are two key shapes under one
   prefix. The registry's own count assertion caught it. ⭐ Registering them as two would have made
   `rl:edit-token:` a proper prefix of `rl:edit-token:rid:` and the API would have refused to boot.
2. **It disarmed a deadline with its own prose.** The M1 fix scopes the closure check to the cell carrying
   the marker. The review then wrote *"…already been taken and **closed** in pass 2"* into R4's new dated
   cell — and R4 stopped firing. Reworded to "settled". The fix catching its own author within minutes is
   the best evidence it works.
3. **A mutation appeared to pass because it never applied.** Mutation P was first run with
   `perl -0pe 's/\n    res\.locals…/\n/'` against CRLF files, matched nothing, and the suite went green —
   a green that would have been recorded as "the test does not detect this". The md5 check caught it.
   [[pitfall-crlf-invisible-to-git-bash-grep]], and exactly how a fix-that-never-fires gets certified.

### 6. Numbers that moved, and why

* **Guards 410 → 411.** The story's figure predated pass 2 creating `rate-limit-prefixes.ts`. Both guards
  skip `__tests__` and `*.test.ts`, so today's two new test files do not move it again.
* **eslint 15 → 28 files.** The story quoted a pass-1 count. Re-run over all 28: 0.
* **Blast radius 959 → 980 dated rows; `DATED` markers 6 → 17 occurrences, 1 → 4 inside residual rows.**
  ⚠️ **This count is self-referential** — the corpus contains the stories that record the count — so it
  moves whenever one is edited. That is why the COMMANDS are in the docblock and not just the values. The
  ratio is what must hold: ~980 dated rows against 4 opted-in markers, three orders of magnitude, which is
  the entire argument for the marker being opt-in.
* **Changeset 32 → 34 files.** `marketplace-edit.service.ts` (H2) and
  `refusal-not-a-request.binding.test.ts` (R7) are new to it. ⭐ `marketplace-edit.service.ts` is the third
  place the "all limiters live in `middleware/`" assumption has now broken, after
  `registration-status.service.ts` and `reveal-rate-limit.ts`.

### 7. Deploy — what is different from the story's own note

No new env vars. No migration. Redis-only. **But the deploy now carries more than five prefix renames:**

⛔ **Five flood ceilings change what they COUNT on this deploy**, not just where they store it —
`loginIpFloodLimit` (FR1) plus `activationIpFloodLimit`, `passwordResetCompletionIpFloodLimit`,
`registrationRateLimit` and `wizardDraftRateLimit` (R7). Each will refuse **less** than it did yesterday,
because a person's own downstream 429s are handed back. That is the intended direction and it fails OPEN
relative to today, not closed — but it is a live change to five authentication-adjacent controls in one
deploy, and R2 says the mechanism is unproven against the production store. **The post-deploy read is not
optional here; it is the only thing that distinguishes this working from this silently doing nothing.**

⚠️ Counters under the five old prefixes are orphaned and age out on their own TTL (≤15 min, except
`rl:login:strict:` at ≤1 h), so at worst one window's budget is handed back to whoever was mid-window. Any
runbook scanning `rl:login:e:*` must now scan `rl:login:burst:e:*`.

### 8. Decisions adjudication owns

| | decision | why it is not the review's |
|---|---|---|
| **1** | Ratify (or reverse) doing R7's code change inside a code review rather than a dev-story | It is a process rule this story itself states; a review that waives the rule it is reviewing against has waived it for itself |
| **2** | Ratify (or reverse) the R7 asymmetry in §3 — ceilings get the predicate, person-keyed limiters stamp only | It trades uniformity against keeping one limiter per route able to count an aborted request. Both readings are defensible; only one is yours |
| **3** | Rule **R4** — accept the aborted-request behaviour across five ceilings, or pin it with a deliberate abort test | Open since the first pass, now worth five times what it was, and still verified only by code read |
| **4** | Extend **R2**'s post-deploy procedure to cover a registration refusal as well as a login one, and name who runs it | Four of the five ceilings it now covers were added today and none of them is exercised by the procedure as written |

⭐ **R5 and R6 need no decision today** — they are the PRD's own 2026-10-15 deadline and the guard will make
them loud on 2026-10-16 whether or not anyone remembers. That is the point of the story.

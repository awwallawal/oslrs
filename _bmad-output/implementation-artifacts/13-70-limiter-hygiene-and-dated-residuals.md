# Story 13.70: Limiter hygiene, and making a dated residual fire

Status: ready-for-dev

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

3. **AC3 — ⛔ RULED (Awwal, adjudication 2026-09-20): the skip is MARKER-BASED, not status-based.** The two limiters mounted *downstream* of the ceiling — `loginRateLimit` and `strictLoginRateLimit` — stamp `res.locals.rateLimitRefusedBy = '<limiter name>'` in their `handler` before responding; `loginIpFloodLimit` skips on `requestWasSuccessful: (_req, res) => !res.locals.rateLimitRefusedBy`. Only the ceiling reads the flag, because being mounted FIRST it is the only limiter whose response listener observes every other limiter's 429 (`loginRateLimit` sits before `strictLoginRateLimit`, so strict never sees burst's refusal — mount-order finding M1 already covers that leg). ⛔ `verifyCaptcha` does NOT stamp — its 400 stays counted, per AC2.

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

- [ ] **Task 1 — FR1: stop the flood ceiling charging people for their own refusals** (AC: #1, #2, #3)
  - [ ] 1.1 Read `apps/api/src/middleware/login-rate-limit.ts` — `loginIpFloodLimit` is `max: 100`, `windowMs: 15 * 60 * 1000`, prefix `LOGIN_IP_FLOOD_PREFIX`, mounted FIRST on the four login routes with no skip predicate.
  - [ ] 1.2 ⛔ **The behaviour is ALREADY RULED — implement Option B, do not re-derive the choice** (AC3). Add `res.locals.rateLimitRefusedBy = '<name>'` to the `handler` of `loginRateLimit` and `strictLoginRateLimit`, then give `loginIpFloodLimit` `requestWasSuccessful: (_req, res) => !res.locals.rateLimitRefusedBy`. ⛔ Do NOT write `res.statusCode !== 429` — AC3 records why it was rejected. ⛔ Do NOT stamp in `verifyCaptcha` (AC2 requires its 400 to stay counted). Type the flag once (`Express.Locals` augmentation) rather than casting at each site.
  - [ ] 1.2b ⚠️ **BOTH-DIRECTIONS RED-VERIFY of the decrement, in `login-rate-limit.binding.test.ts`** — it already has the `floodOnly` and `fullStack` harnesses and reads the stack from the real router; extend it, do not start a new file. Assert (a) the flood counter does NOT advance when a downstream limiter refuses, and (b) it DOES advance on a genuine 401. Then mutate: delete the stamp and confirm (a) reds; make the predicate always-false and confirm (b) reds. Record both observed reds, not the intention [[pattern-test-that-passes-over-a-hole]].
  - [ ] 1.2c ⛔ **State plainly what that test CANNOT prove.** The binding file's own header says test mode builds each limiter with the **in-memory** store (`skip` is stubbed to production per-request, the store is not), so it exercises `MemoryStore.decrement()` — never `rate-limit-redis@4`'s. This is the same blind spot the prefix-collision comment names at `login-rate-limit.ts:23-34` ("the in-memory test store cannot see it"). Do not let an in-memory green be read as proof the prod decrement works; open R2 with whichever verification path you choose (real-Redis integration test, or a post-deploy read of the `attempts` field).
  - [ ] 1.3 Implement, keeping CAPTCHA 400s counted (AC2).
  - [ ] 1.4 RED-VERIFY: restore the current behaviour and confirm the AC1 test fails. Record the red count.
  - [ ] 1.5 ⚠️ Mount order is part of the control (NFR4.4.a) — flood → verifyCaptcha → burst → strict. The order is documented at `apps/api/src/routes/auth.routes.ts:33` and `loginIpFloodLimit` is mounted on FOUR routes at `:43`, `:52`, `:186`, `:196`. Do not reorder; assert it still holds on all four.

- [ ] **Task 2 — FR2: make the keyspaces disjoint** (AC: #4)
  - [ ] 2.1 `registration-rate-limit.ts`: `rl:activation:ip:` vs `rl:activation:` — one is a proper prefix of the other.
  - [ ] 2.2 `password-reset-rate-limit.ts`: `rl:password-reset-complete:ip:` vs `rl:password-reset-complete:` — same shape.
  - [ ] 2.3 Make them disjoint. Low live impact; cheap while the files are open.
  - [ ] 2.4 Assert the PROPERTY across all prefixes, not the two known pairs — a test that enumerates limiter prefixes and fails if any is a proper prefix of another. ⭐ Pin the class, not today's instances.

- [ ] **Task 3 — FR3: hash the email keys** (AC: #5)
  - [ ] 3.1 `registrationEmailRateLimit` (`registration-rate-limit.ts:113`) and `wizardDraftEmailRateLimit` (`wizard-draft-rate-limit.ts:149`) key on the raw normalised email.
  - [ ] 3.2 Reuse `buildLoginRateLimitKey` (`login-rate-limit.ts:74`) — already shipped, tested and reviewed. ⛔ Do NOT write a second hasher [[feedback_canonical_primitive_backlog_sweep]].
  - [ ] 3.3 Keep the `keyedBy` log field correct for both.
  - [ ] 3.4 Test with a megabyte-long value in each; assert a bounded key both times.

- [ ] **Task 4 — FR4: make a date fire** (AC: #6, #7, #8)
  - [ ] 4.1 ⛔ FIRST: widen `RESIDUAL_ID` in `apps/api/src/lib/story-residual-guard.ts` (or rename the A-rows) so `A1` is matched at all. Nothing else in this task can work until it is.
  - [ ] 4.1b ⛔ MEASURE FIRST, THEN TIGHTEN. Re-run the blast-radius count before implementing (AC11): dated rows vs genuine `DATED` markers. If the numbers have moved, say so — do not inherit 955/1.
  - [ ] 4.1c Require the explicit `\bDATED\b <iso>` marker. ⚠️ Word boundary is mandatory: `DATED` matches inside `UPDATED` (AC12).
  - [ ] 4.1d Define "today" explicitly — UTC, from a single injectable clock — so the guard cannot flip state at local midnight and cannot be untestable. Tests must pass a fixed date, never `new Date()`.
  - [ ] 4.2 Parse a date from the residual's state or trigger cell (`2026-10-15` / `DATED 2026-10-15`). The STATE cell is the third column (`story-residual-guard.ts:19`, cells split at `:58`).
  - [ ] 4.3 Fail when `today > date` AND `isOpenState(state)` (`:77`).
  - [ ] 4.4 ⚠️ Do NOT make an undated residual fail — most rows are legitimately trigger-based.
  - [ ] 4.5 Failure message carries the row's own text (AC8); extend `formatResidualHits` (`:152`).
  - [ ] 4.6 RED-VERIFY BOTH DIRECTIONS on real rows: a past-dated open row reds; an undated trigger-based row passes. Then RED-VERIFY AC7 specifically using 13-68's `A1`.
  - [ ] 4.6b Extend `apps/api/src/lib/__tests__/story-residual-guard.test.ts` — the guard already has a suite; do NOT start a new one.
  - [ ] 4.7 Run the guard DIRECT, never through turbo — `_bmad-output/**` is outside the `lint` task's inputs, so a story-only change replays a stale verdict (playbook §2y(c)).

- [ ] **Task 5 — FR5: close R2a and R8 by decision** (AC: #9)
  - [ ] 5.1 R2a — escalating lockout: `users` has no lock-count column, so escalation needs a migration; plain decay leaves ~10 guesses/30 min = **~480/day**. Record 480/day as the accepted figure + the reopen trigger.
  - [ ] 5.2 R8 — login error codes: messages help real users, the response is generically safe, and 13-68 closed the timing channel. Accept, owner John.
  - [ ] 5.3 Write both into 13-68's ledger as CLOSED-BY-DECISION with their reasons. ⚠️ Use `R`-prefixed ids that the guard can actually match (AC7).

- [ ] **Task 6 — Records: PRD, coverage table, board** (AC: #10)
  - [ ] 6.1 Remove the NFR4.4.d "NOT YET IMPLEMENTED" annotation in the SAME commit that makes it true.
  - [ ] 6.2 Update the NFR4.4.c threshold register for any budget/mode/key that moved, and `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts` with it. A limiter without an NFR4.4.c row fails that suite by design.
  - [ ] 6.3 Add 13-70 to `epics.md`. ✅ The `sprint-status.yaml` entry was created at authoring (2026-09-19) — do not add a second one. It had been a brief with no board entry, which is the failure this story exists to stop.

- [ ] **Task 7 — Gates, run yourself and quoted whole** (AC: all)
  - [ ] 7.1 `pnpm --filter @oslsr/api exec tsc --noEmit`, eslint on every touched file, all three drift guards run DIRECT.
  - [ ] 7.2 Full API + web suites. ⚠️ One vitest process at a time; free RAM > 3 GB before starting; do no other work while a gating suite runs.
  - [ ] 7.3 Quote the SUITE total, never a subset, and capture the exit code to a file rather than reading a notification.

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

⛔ **Ids are `R<digits>` so `RESIDUAL_ID` matches them, and every row ends with a `|` so `TABLE_ROW` sees it.** The reopen trigger lives in the **evidence** column, never the state cell: `isOpenState` returns **false** for any state containing `REOPEN TRIGGER` (`story-residual-guard.ts:80`), so a trigger written into column 3 would make the row invisible — the exact class AC7 exists to close.

| ID | Severity | State | Re-runnable evidence | Owner |
|---|---|---|---|---|
| **R1** — the flood ceiling's headroom is sized against a number that was never a headcount. `login-rate-limit.ts:113-116` sizes `max: 100` on *"the enumerator cohort is 17 people — every one of them failing five times is 85"*. ⛔ **MEASURED ON PROD 2026-09-20: there are 28 enumerator accounts and NINE of them are the operator's own** harness logins (`lawalkolade+demo1/2/3`, `+enum1`, `+test`, `+testenumerator`, `+testenumeratornew`, `+testfour`, bare `lawalkolade`), leaving **19 real field accounts, 11 logged in, gap 8**. So "17" mixed field staff with the test harness, and the sizing rests on it. The comment's arithmetic is also short twice over: this is the ONLY login limiter with no `skipSuccessfulRequests`, so it counts **every** response — the field worst case behind one egress address is **19 × (5 failures + 1 success) = 114**, not 85 | **Medium** — not a defect today and NOT this story's to fix; it is an assumption whose input moves next. Fails CLOSED on legitimate users, which is the incident family NFR4.4.d names, and **§Dev Notes records every incident in this family as a legitimate person, never an attacker** | **OPEN** — a decision is owed BEFORE the cohort grows, not after a refusal is observed. Deliberately **trigger-based, NOT `DATED`**: the trigger is an event (the re-provisioning blast), and adding a second `DATED` marker would falsify AC11's measured "955 dated rows vs exactly ONE genuine marker" baseline. ⭐ Keep it undated — it doubles as AC6's worked example of a trigger-based row that must NOT red the guard | **The shared-address case is measured, not hypothetical:** the activation limiter logged **244 refusals from SIX Opera Mini proxy servers on 2026-09-07/08** (reverse DNS `opera-mini.net`), and carrier CGNAT behaves identically — `login-rate-limit.ts:41-47`. **Cohort, MEASURED read-only on prod 2026-09-20 08:25 WAT** (supersedes the `8 of 17` in `docs/adjudication-agent-handoff.md:1107`, which was a mixed figure): **28 accounts** = 19 `active` + 8 `invited` + 1 `deactivated`; **9 operator-owned** → **19 real field accounts, 11 logged in, gap 8** (6 `invited` needing a resend + 2 `active` needing a reset in place). Full roster and queries in `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` §FIELD-PROPER, measurement log row 2026-09-20. Re-provisioning clusters first logins into a short window, the worst case for a 15-minute ceiling. **13-71 raises it further by design:** *"Land BEFORE the enumerator cohort scales past the trial."* ⚠️ **AND A SECOND SHARED ADDRESS NOBODY COSTED: the operator's own.** Those 9 harness accounts all log in from one desk, and a login-heavy dev/UAT session — precisely the 13-70→71→72→73 marathon — can spend the 100 from a single IP without a field enumerator being involved at all. Under the CURRENT (unfixed) behaviour the ceiling counts its own 429s, so the counter would pin at 100 and the log would not say it was us **Decision owed:** either raise `max` with a measured figure **plus** an NFR4.4.c register row and `rate-limit-coverage.test.ts` update (a threshold change on an auth flood ceiling = dev-story + adversarial review, never inline), or accept 100 and rely on the log line. **Reopen trigger:** any `auth.login_ip_flood_limit_exceeded` — from a field IP reverse-resolving to `opera-mini.net` / a Nigerian carrier CGNAT range, **or from the operator's own IP during a dev or UAT session** — **or** the count of REAL field accounts exceeding 19. ⚠️ **This row is why AC3 ruled Option B:** under the rejected Option A the ceiling discounts its own 429s, `attempts` pins at `max`, and this trigger cannot be told from a spray — the instrument breaks precisely when the event it watches for occurs [[pattern-monitor-measuring-something-else]] | Awwal (adjudication) — decide before the re-provisioning blast |
| **R2** — Option B's `store.decrement()` is unproven against `rate-limit-redis@4`. AC3's both-directions test runs in `login-rate-limit.binding.test.ts`, which its own header states builds every limiter with the **in-memory** store in test mode (`skip` is stubbed to production per request; the store is not). So CI proves the PREDICATE WIRING and exercises `MemoryStore.decrement()` — never the Redis one that runs in prod | **High** — a decrement that silently no-ops is indistinguishable from a working fix, and this project's top defect class is a fix that never fires [[pattern-ship-a-fix-that-never-fires]]. An in-memory green read as proof of the prod behaviour is the whole failure | **DISCHARGE-ON-DEPLOY** — provable only against a real Redis. Blocks `done`, not the commit (§2a0) | **Precedent that the in-memory store is blind to exactly this layer:** `login-rate-limit.ts:23-34` documents the prefix-collision class and states *"`login-rate-limit-key.test.ts` pins the separation; the in-memory test store cannot see it."* Same blind spot, same file. **Discharge by EITHER:** (a) a real-Redis integration test using `beforeAll`/`afterAll` against the test DB/Redis, asserting the counter value directly at `rl:login-ip-flood:<ip>` after a downstream refusal and after a 401; or (b) a post-deploy read on prod — drive a downstream 429, then confirm the `auth.login_ip_flood_limit_exceeded` / `attempts` progression advances only on non-refused requests. ⛔ Whichever is chosen, assert the counter **value**, not merely that a request was served — "served" is consistent with both a working and a no-op decrement [[pattern-a-clean-result-must-prove-it-measured]]. ⚠️ Also unverified and worth pinning in the same pass: `response.on('close')` decrements on a request aborted before it finished writing — a dropping mobile connection, which is this cohort's normal condition | whoever takes 13-70 dev-story |

## Dev Agent Record

### Agent Model Used

_To be completed by the dev agent._

### Debug Log References

### Completion Notes List

### File List

### Review Follow-ups (AI)

_Populated by the adversarial code review._

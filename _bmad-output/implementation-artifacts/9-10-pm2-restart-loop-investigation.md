# Story 9.10: PM2 Restart-Loop Investigation & Stabilisation

Status: in-progress

<!-- Status: ready-for-dev → in-progress (2026-05-01 status-discipline pass). AC#2 partial fix already shipped via commit 718f84e (2026-04-27 — ioredis shutdown crash wrap in safe-catch). Remaining work calendar-gated on the 7-day post-fix observation window (target close 2026-05-04). -->


<!--
Created 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5.

Investigates PM2 restart counter that reached 916+ over 89 days uptime. Counter RESET to 0 at 2026-04-25 08:54 UTC reboot (Story 9-9 OS-patching subtask) — observation window now open. AC#4 EXPLAIN ANALYZE audit of top 10 endpoints (Akintola-risk Move 2) reuses Story 11-1 seeder.

Sources:
  • Sprint-status §10 (2026-04-25 OS upgrade entry — PM2 ↺ reset baseline)
  • Story 9-9 Change Log 2026-04-23 follow-up flag (PM2 restart counter referred to Story 9-10)
  • Architecture Decision 1.4 (ioredis caching) + Decision 5.1 (Pino logging)
  • Story 11-1 seeder (`apps/api/src/db/seed-projected-scale.ts`) for AC#4
  • Epics.md §Story 9.10

Independent / parallelisable with all other stories.
-->

## Story

As the **Super Admin / platform operator**,
I want **the PM2 restart counter that hit 916+ over 89 days uptime root-caused and stabilised, plus the top 10 most-invoked API endpoints query-plan-audited at projected scale**,
so that **the API process stops thrashing (alerting noise → real signal), the suspected ioredis reconnect churn from sec2-2 factory gaps is closed, and the Akintola-risk lessons learned during Story 11-1 schema work extend to the hot endpoint paths before field survey**.

_(2026-04-27 evidence injection moved to Dev Notes § 2026-04-27 Triage Evidence per code-review M2/L1 finding 2026-05-01. The Change Log entry below references it rather than restating the content.)_

## Background — PM2 ↺ baseline observability window

**On 2026-04-23**, Story 9-9 Tailscale subtask Change Log entry flagged: "PM2 restart counter 916+ over 89 days — separate Story 9-10 investigation."

**On 2026-04-25 08:54:37 UTC**, the Story 9-9 OS-patching subtask reboot reset PM2 ↺ counter from 916+ to 0. This was a **deliberate side-effect** — Story 9-10's investigation needs a known-zero starting point to measure trajectory cleanly.

**Per Architecture ADR-020 V8.2-a1 Consequences:** "Do not reboot the production VPS again before Story 9-10 evidence is captured unless an emergency demands it; the reboot would re-zero the counter and destroy the evidence window."

**Observation window:** 2026-04-25 08:54 UTC → at minimum 7 days of post-reboot ↺ trajectory data, ideally 14 days for confidence.

## Acceptance Criteria

1. **AC#1 — Root-cause hypothesis documented:**
   - Capture the 7-day post-2026-04-25 ↺ trajectory: timestamps + delta from baseline
   - Cross-reference PM2 logs at each ↺ event for crash signatures
   - Cross-reference systemd journal (`journalctl -u pm2-root`) for context
   - Cross-reference application logs (`pm2 logs --lines 200` around each ↺ event)
   - **Suspected hypothesis to validate:** ioredis reconnect churn from sec2-2 factory gaps (per project memory: SEC2-2 Redis factory was identified as incomplete during 2026-04-04 phase 2 hardening; full factory still pending)
   - **Evidence carrier:** the embedded Dev Notes § "2026-04-27 Triage Evidence" subsection (this file) is the canonical record for AC#1 partial findings. _(Was originally specified as a separate output file `apps/api/src/docs/9-10-pm2-restart-investigation.md`; that path doesn't exist and would create a parallel doc that's hard to keep in sync. Code-review H3 2026-05-01: amend AC#1 to point at the embedded section.)_ A separate `apps/api/src/docs/9-10-pm2-restart-post-fix-trajectory.md` is still planned for AC#3's post-fix observation evidence (different scope).

2. **AC#2 — Targeted fix applied:** Based on root-cause hypothesis (likely ioredis reconnect handler missing graceful-degradation wrapper):
   - Implement the fix
   - Add a regression test that simulates the failure mode (e.g. for ioredis: simulate Redis disconnect during request handling, assert the API stays up and request returns gracefully)
   - Document in Dev Notes the before/after behaviour

3. **AC#3 — Restart count falls to near-zero over 7-day post-fix observation window:**
   - After fix lands in production, observe PM2 ↺ for 7 days
   - **Target:** ↺ count remains ≤2 over the 7-day window. _(Tightened 2026-05-01 from the original "<5" ceiling. Wave 0 build-off-VPS deploy now eliminates the deploy-time resource spike, so each CI deploy = 1 graceful pm2 restart with no side effects. Generous ceiling = 2 to allow margin for one legitimate exit during the window.)_
   - **Anchor timestamp:** 7-day window starts at deploy completion of commit `718f84e` (ioredis shutdown crash fix, 2026-04-27 ~07:30 UTC). Target close: **2026-05-04**.
   - **If ↺ count exceeds 2:** document remaining causes; either iterate the fix OR scope a Story 9-10b for residual issues
   - Capture trajectory in `apps/api/src/docs/9-10-pm2-restart-post-fix-trajectory.md`

4. **AC#4 — Akintola-risk Move 2: EXPLAIN ANALYZE audit of top 10 most-invoked API endpoints:**
   - Parse `/root/.pm2/logs/oslsr-api-out.log` over the past 30 days to identify the 10 most-invoked API endpoints by request count
     - For each endpoint: extract the underlying SQL query (Drizzle query introspection or logged-query-text)
   - For each endpoint's primary query: capture `EXPLAIN (ANALYZE, BUFFERS)` against the seeded **500K-respondent + 1M-submission + 100K-audit-log + 100K-marketplace_profiles** dataset produced by Story 11-1 Task 2.5 (reuse the same scratch DB; re-seed if needed)
   - **Threshold:** flag any plan showing Seq Scan on a table >100K rows OR total cost >10,000 OR p95 execution >500ms
   - **For each flagged query:** either (a) add the required composite index in this story's migration, OR (b) document the failure in Dev Notes and route as follow-up to the endpoint's owning epic/story (e.g. submissions-listing → owning Epic 4; supervisor analytics → owning Story 5.6a) with explicit hand-off
   - Output: `apps/api/src/db/explain-reports/9-10-top-endpoints.md` committed with this story
   - **Note:** AC#4 depends on Story 11-1 having landed (seed script exists). If 9-10 starts before 11-1 completes, use docker-compose scratch DB and manual seeding (slower path but viable). **Prefer running 9-10 audit after 11-1 merge.**
   - **Decision date for split (added 2026-05-01 per code-review M3):** if Story 11-1 is NOT merged by **2026-05-08** (one week from now), split AC#4 out of Story 9-10 into a dedicated follow-up `9-10b-akintola-endpoint-audit` and proceed with AC#1/AC#2/AC#3/AC#5/AC#6/AC#7 closure on Story 9-10 alone. The split decision unblocks 9-10's calendar gate (2026-05-04 trajectory pull) from the 11-1 SCP-2026-04-22 chain dependency.

5. **AC#5 — pino log noise audit:**
   - Quick scan of pino logs (`pm2 logs --lines 5000`) for repeated error patterns that should be alerts but aren't, OR alerts that should be info-level (cried wolf during 916+ ↺ window)
   - Adjust log levels in code (move repeated `error` to `warn`, info noise to `debug`)
   - **Bounded scope:** spend max 2 hours on this audit; remaining log-hygiene goes to a future polish story
   - **Done criteria (added 2026-05-01 per code-review L2):** AC#5 is complete when (a) the 2-hour timebox is fully spent OR all surfaced patterns are addressed (whichever comes first); (b) Dev Notes documents the log-level changes made (`error → warn` count, `info → debug` count, deferred items count); (c) any patterns NOT addressed within the 2-hour window are added as new `[AI-Review][LOW]` follow-ups in this story rather than silently dropped. **No infinite-tinker scope.**

6. **AC#6 — sprint-status + observability hand-off:**
   - Update `sprint-status.yaml`: `9-10-pm2-restart-loop-investigation: in-progress` → `review` at PR → `done` at merge
   - On merge: update Story 9-9 Change Log to reference Story 9-10 closure (the PM2 ↺ follow-up flag from 2026-04-23 entry is now resolved)

7. **AC#7 — Tests:**
   - Regression test for AC#2 fix
   - Existing 4,191-test baseline maintained or grown

## Dependencies

- **Story 11-1 (PREFERRED, not strict):** Seeder reuse for AC#4 EXPLAIN ANALYZE work. If 9-10 starts before 11-1 lands, use docker-compose scratch DB with manual seeding (slower path but viable).
- **No blocking story dependencies otherwise** — this story is independent / parallelisable
- **Architecture Decision 1.4 (ioredis direct usage)** — context for likely ioredis-related root cause
- **Project memory: SEC2-2 Redis factory gaps** — pre-existing context for ioredis reconnect hypothesis

## Field Readiness Certificate Impact

**Tier B per FRC §5.3.1** — does NOT block field-survey start. Can ship during the first weeks of field operation.

**Indirect benefit to FRC item #5 (alerting tier with push channel — Story 9-9 AC#6):** if the PM2 ↺ noise is fixed, AC#6's CRITICAL alerts on PM2 crashes become real signal instead of being drowned out.

## Tasks / Subtasks

### Task 1 — Observation: 7-day post-2026-04-25 trajectory capture (AC#1)

1.1. Write `apps/api/src/scripts/capture-pm2-restart-trajectory.ts` — runs daily; greps PM2 status for `↺` count + queries systemd journal for `pm2-root.service` events; appends to `apps/api/src/docs/9-10-pm2-restart-investigation.md` daily.
1.2. Schedule via cron OR run manually each day for 7 days starting 2026-04-25.
1.3. Each day: capture timestamp + ↺ delta + recent log slice + brief commentary.
1.4. After 7 days: synthesize root-cause hypothesis from the trajectory.

### Task 2 — Root-cause analysis (AC#1)

2.1. Cross-reference PM2 logs at each ↺ event for crash signatures (uncaught exceptions, OOM, signal terminations).
2.2. Cross-reference systemd journal for context (Docker restarts, OOM-killer, manual stops).
2.3. Cross-reference application logs (last 200 lines before each ↺) for in-flight request context.
2.4. Validate the ioredis-reconnect-churn hypothesis: search for ioredis reconnect events in pino logs (`pino-pretty | grep -i ioredis`); correlate with ↺ events by timestamp.
2.5. Document root-cause hypothesis with evidence.

### Task 3 — Targeted fix (AC#2)

3.1. Implement the fix based on hypothesis (likely a graceful-degradation wrapper around ioredis operations or a complete factory implementation per SEC2-2 backlog).
3.2. Write regression test that simulates the failure mode.
3.3. Verify locally: kill the local Redis container during a request; assert API stays up + request returns gracefully (or with explicit `503 SERVICE_UNAVAILABLE`).
3.4. Code review (per project pattern: code-review BEFORE commit, on uncommitted working tree).

### Task 4 — Post-fix observation (AC#3)

4.1. After fix lands in production, run the AC#1 trajectory capture script for another 7 days.
4.2. Target: ↺ count <5 over the post-fix window.
4.3. If exceeded: iterate fix or scope follow-up story.
4.4. Capture as `apps/api/src/docs/9-10-pm2-restart-post-fix-trajectory.md`.

### Task 5 — Akintola-risk Move 2: top-10-endpoints EXPLAIN ANALYZE audit (AC#4)

5.1. Parse `/root/.pm2/logs/oslsr-api-out.log` for the past 30 days (use `pm2 logs --lines 100000` or similar).
5.2. Extract top 10 endpoints by request count: simple grep + sort + uniq -c.
5.3. For each endpoint: identify the underlying primary SQL query (read controller code → service layer → Drizzle query).
5.4. **Reuse Story 11-1 seeder** — invoke `pnpm --filter @oslsr/api seed:projected-scale` against scratch DB.
5.5. For each query: run `EXPLAIN (ANALYZE, BUFFERS)` and capture output.
5.6. Apply thresholds per AC#4; flag failures.
5.7. For each flagged query: add index here OR document hand-off.
5.8. Capture as `apps/api/src/db/explain-reports/9-10-top-endpoints.md`.

### Task 6 — pino log noise audit (AC#5)

6.1. `pm2 logs --lines 5000` → categorise repeated patterns.
6.2. Adjust log levels in code (moving error → warn, info → debug).
6.3. Bound scope: max 2 hours.
6.4. Document changes in Dev Notes.

### Task 7 — Sprint status + Story 9-9 cross-reference (AC#6)

7.1. Update `sprint-status.yaml`.
7.2. Add note to Story 9-9 Change Log: "PM2 ↺ investigation closed by Story 9-10 — see Story 9-10 Dev Notes for root-cause + fix."

## Technical Notes

### Why the PM2 ↺ counter matters

PM2's auto-restart-on-crash is a feature — but a counter of 916+ over 89 days means the API is crashing ~10x per day on average. Even if each crash is brief and recovery is fast, the collective effect is:
- **Alert noise**: every restart is a CRITICAL event in the health-digest system; operators learn to ignore them, and real crashes hide in the noise
- **State loss**: in-flight requests during restart return ERR_CONNECTION_RESET; users see errors they'd never see if the API were stable
- **Unknown root cause**: 916+ restarts without a documented cause means we don't know what's failing — and we can't fix what we don't measure

The 2026-04-25 reboot reset gives us a clean observability window. **This story's value is the observation discipline, not just the fix** — even if the root cause turns out to be benign (e.g. memory pressure during nightly backups), documenting it ends the mystery.

### 2026-04-27 Triage Evidence

_(Moved here 2026-05-01 from a top-level "evidence injection" section per code-review M2 — that location was duplicating Change Log content and breaking story structure. Commit-hash references added per code-review L1 for traceability.)_

After Phase 3 Cloudflare ship, system health digest fired CRITICAL on **2026-04-27 06:32 UTC** (cpu 100%, memory 91%). Triage found:

**The ↺ counter was NOT spontaneous.** All 3 morning restarts (pid 39949 at 05:56, pid 41053 at 06:32, pid 42191 at 07:15 UTC) correlate exactly with deploy times for commits **`1383373`** (CI build fix: @types/proxy-addr + 2-arg trust fn call), **`7015601`** (docs: phase 3 cloudflare done), **`0ea5fa1`** (docs: 2026-05-04 + 2026-06-22 manual checklists). Each CI deploy completes ~7 min after push. PM2 has no `ecosystem.config.*` so `max_memory_restart` is unlimited — confirming PM2 isn't killing the process for memory either.

**The CRITICAL alert at 06:32 UTC was a deploy-build resource spike**, not a runtime symptom. CI runs `pnpm install` + `pnpm --filter @oslsr/web build` (vite + tsc) ON the 2GB VPS as part of deploy. The build alone uses 700MB-1GB RAM and 70-90% CPU for 2-3 minutes. Add the running API + Postgres + Redis Docker containers and we're at 91-100% briefly per deploy.

**The real bug DID surface in the err log:** `email.worker.ts:483` calls `connection.quit()` on a Redis connection that's already been closed by ioredis's reconnect handler, throwing "Connection is closed" inside a `Promise.all` in `closeAllWorkers`. The unhandled rejection crashes the shutdown sequence, which PM2 then sees as a non-clean exit. **Same redundant `.quit()` pattern exists in 4 queue files.** All 5 already redundant with `closeAllConnections()` in `lib/redis.ts` (which catches "already closed" silently). **Fix shipped commit `718f84e`** (fix(api): ioredis shutdown crash — wrap connection.quit in safe-catch): wrap each `.quit()` in `.catch(() => {})` matching the lib/redis.ts pattern. **This closes part of AC#2.**

**What this changes for the rest of the story:**
- AC#1 7-day trajectory analysis still needs to complete (window opened 2026-04-25 08:54 UTC, target 2026-05-02 minimum, 2026-05-09 ideal). The follow-up at `docs/follow-ups/2026-05-04-cloudflare-waf-pm2-csp-review.md` covers the trajectory capture + spontaneous-vs-deploy decomposition.
- AC#2 fix is partially shipped (ioredis shutdown crashes in 5 files via commit `718f84e`). Other AC#2 work (deeper SEC2-2 factory completion if needed) waits on the post-fix trajectory data showing whether ↺ drops below the AC#3 ceiling target.
- AC#3 7-day post-fix observation re-anchors at commit `718f84e` deploy timestamp (2026-04-27 ~07:30 UTC); target close 2026-05-04.
- AC#7 regression test for the shutdown crash is a separate follow-up — would require mocking ioredis's reconnect handler to deterministically reproduce the race condition; deferred to keep this hot-fix surgical. **Tracked as code-review H2 in Review Follow-ups (AI) below.**

**Architectural follow-up — DELIVERED Wave 0 (commit `e799104`, closed 2026-04-30):** Move builds off the 2GB VPS. CI now builds on GH Actions runner (2-core, 7GB RAM) and only ships `apps/web/dist` artifact + runs nginx config + pm2 restart on the VPS. The deploy-time resource spike is eliminated. Verified Row 1 (commit `e799104`) wall-clock 44s + 0.66 GiB peak + 0 CRITICAL alerts; Row 2 (commit `6932ac0`) 43s + 0.65 GiB peak + 0 CRITICAL. **This closes the deploy-spike root cause that drove the 2026-04-27 false-CRITICAL alerts.** AC#3 ceiling tightened from "<5 restarts/7d" to "≤2 restarts/7d" because deploy-attributable restarts no longer carry resource-pressure side-effects. The "self-hosted GH Actions runner inside tailnet" line item from Story 9-9 remains a separate concern (closes SSH firewall re-narrowing, not VPS resource pressure).

### Why the AC#4 endpoint audit is bundled with the PM2 investigation

The endpoint audit is **independent work** — it doesn't logically belong with PM2 investigation. We bundle it because:
1. **Akintola-risk Move 2 needs a story owner.** Move 2 was identified during Story 11-1 design (Akintola-risk = "what breaks when you go from 100 respondents to 100,000?"). Without an owning story, it would never ship.
2. **Story 9-10 has investigation discipline already** — the trajectory capture + EXPLAIN ANALYZE workflow are similar muscle (data + analysis + write-up).
3. **The seeder is hot.** Story 11-1 just built the projected-scale seeder; reusing it now (vs. cold-starting in 6 months) is cheaper.

If the bundling causes Story 9-10 to slip past field survey, Move 2 (AC#4) can be split out into a dedicated `9-10b-akintola-endpoint-audit` follow-up story without losing context. AC#4 is documented sufficiently in this file to enable that split.

### Hypothesis-driven debugging discipline

Per the project's "spike-first" pattern (validated across 6 epics, zero rework): the AC#1 + AC#2 cycle is a mini-spike. We don't write code until the trajectory data validates the hypothesis. If the trajectory disproves ioredis-reconnect-churn (e.g. ↺ events correlate with cron jobs not Redis events), we update the hypothesis before coding. This avoids the anti-pattern of "fix something plausible and hope."

### What "near-zero" means for AC#3

5 restarts over 7 days = 0.7 restarts/day = essentially CI-deploy-noise (each deploy triggers 1 restart). Below 5 means the API is genuinely stable. Above 5 means there's residual instability that needs follow-up. **5 is a generous ceiling, not an ambitious target** — the original baseline was ~10 restarts/day, so even halving it would beat 5.

### Story 11-1 seeder dependency nuance

AC#4 says "prefer running after 11-1 merge." If Story 9-10 starts in parallel with 11-1 and the seeder isn't ready yet, the audit can use a docker-compose scratch DB seeded by hand (slower, less data, but viable). The risk of the manual-seed path is that the EXPLAIN plans differ from production-scale plans — so the hand-seed approach should still aim for 100K+ rows on the largest tables to make the comparison meaningful. Document the seeding approach used in Dev Notes.

## Risks

1. **The 7-day observation window might not surface enough ↺ events to validate the hypothesis.** If post-2026-04-25 trajectory shows zero or near-zero restarts, the original cause may have been transient (network blip during 89-day window) and the OS upgrade incidentally fixed it. Mitigation: still write up the trajectory + close the story; the observability discipline is the value.
2. **Root cause might be multi-factor.** ioredis-reconnect-churn might be one of several causes. Mitigation: AC#1 documents all hypotheses surfaced during analysis; AC#2 fixes the highest-impact cause; AC#3 measures whether the fix is sufficient.
3. **AC#4 might surface multiple Seq Scans on hot endpoints.** Each one is a follow-up decision: index here or hand off to owning epic. Mitigation: the audit document captures the landscape; sequencing decisions are per-query, not all-or-nothing.
4. **AC#5 log audit might balloon.** Pino log analysis is open-ended; without a time-box it could consume the story's entire budget. Mitigation: AC#5 explicitly says max 2 hours; defer remaining hygiene to a future polish story.
5. **PM2 ↺ counter will reset on every CI deploy.** Each `appleboy/ssh-action` deploy triggers `pm2 reload` which is one restart. If we deploy 5x in 7 days, baseline counter is 5 even with zero crashes. Mitigation: AC#3 explicitly accounts for "occasional restart from CI deploy is normal" with the 5-restart ceiling (tightened to ≤2/7d 2026-05-01 after Wave 0 build-off-VPS eliminated the deploy-spike side-effect).

## Review Follow-ups (AI)

_(Populated 2026-05-01 from a retrospective audit of Story 9-10 — operator pasted my own earlier review back as a verification check, surfacing gaps from the first pass. All directly-fixable items addressed in the same commit; bigger-scope items tracked here as `[Pending-SM]`.)_

- [x] [AI-Review][HIGH] **9-10 H1: Status mismatch.** File header said `ready-for-dev` but commit `718f84e` had already shipped AC#2 partial fix. **Fixed** in commit `9bc328b`: status flipped to `in-progress` with explanatory `<!-- -->` comment.
- [ ] [AI-Review][HIGH] **9-10 H2: AC#7 deferred regression test for AC#2 ioredis fix.** "Would require mocking ioredis's reconnect handler to deterministically reproduce the race condition; deferred to keep this hot-fix surgical." A test-deferral on a stability fix is silent debt. **Tracked here** rather than spinning a separate `9-10c` follow-up story (saves SM authoring overhead). To do: write the regression test before AC#3 trajectory closes, OR explicitly accept it as a long-term LOW with rationale documented in the story closure summary.
- [x] [AI-Review][HIGH] **9-10 H3: AC#1 output file `apps/api/src/docs/9-10-pm2-restart-investigation.md` did not exist** (and would have been a parallel doc hard to keep in sync with the story). **Fixed** in this commit: AC#1 amended to point at the embedded "2026-04-27 Triage Evidence" subsection in Dev Notes as the canonical evidence carrier. Separate `9-10-pm2-restart-post-fix-trajectory.md` for AC#3 still planned (different scope).
- [x] [AI-Review][MEDIUM] **9-10 M1: Wave 0 build-off-VPS already eliminated the deploy-time resource spike.** **Fixed** in commit `9bc328b`: 2026-04-27 evidence section updated to acknowledge Wave 0 (commit `e799104`, closed 2026-04-30) closed the deploy-spike root cause; AC#3 ceiling tightened from "<5 restarts/7d" to "≤2 restarts/7d".
- [x] [AI-Review][MEDIUM] **9-10 M2: 2026-04-27 evidence injection duplicated Change Log content.** **Fixed** in this commit: evidence moved from a top-level `## 2026-04-27 evidence injection` section into Dev Notes § "2026-04-27 Triage Evidence". The original location now carries a brief redirect comment.
- [x] [AI-Review][MEDIUM] **9-10 M3: AC#4 11-1 dependency was fragile without a decision date.** **Fixed** in this commit: explicit decision-date added to AC#4 — if Story 11-1 is NOT merged by **2026-05-08**, AC#4 splits into `9-10b-akintola-endpoint-audit` and Story 9-10 proceeds to closure on the remaining ACs.
- [x] [AI-Review][LOW] **9-10 L1: No commit hash references in 2026-04-27 evidence.** **Fixed** in this commit: added explicit hash references to commits `1383373`, `7015601`, `0ea5fa1`, `718f84e`, `e799104`, `6932ac0` throughout the moved evidence section.
- [x] [AI-Review][LOW] **9-10 L2: AC#5 pino log audit had no done criteria.** **Fixed** in this commit: AC#5 amended with explicit "Done criteria" — 2-hour timebox OR all surfaced patterns addressed; Dev Notes documents level-changes; remaining patterns become new `[AI-Review][LOW]` follow-ups in this story rather than silent drops. **No infinite-tinker scope.**
- [x] [AI-Review][LOW] **9-10 L3: AC#3 7-day post-fix anchor timestamp not captured.** **Fixed** in commit `9bc328b`: AC#3 now explicitly references commit `718f84e` deploy completion as the window-start anchor with target close 2026-05-04.

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Created:**
- `apps/api/src/scripts/capture-pm2-restart-trajectory.ts` — daily trajectory capture
- `apps/api/src/docs/9-10-pm2-restart-investigation.md` — pre-fix root-cause investigation
- `apps/api/src/docs/9-10-pm2-restart-post-fix-trajectory.md` — post-fix observation evidence
- `apps/api/src/db/explain-reports/9-10-top-endpoints.md` — AC#4 audit evidence
- Tests for AC#2 fix (location depends on root-cause)

**Modified:**
- Code files for AC#2 fix (location depends on root-cause; likely `apps/api/src/lib/redis.ts` or similar)
- Code files for AC#5 log-level adjustments
- `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` — Change Log cross-ref note (AC#6)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story created by Bob (SM) per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 7 ACs covering PM2 ↺ trajectory capture + root-cause analysis + targeted fix + post-fix observation + Akintola-risk Move 2 (top-10-endpoints EXPLAIN ANALYZE audit reusing Story 11-1 seeder) + pino log noise audit + sprint-status hand-off. Observation window opened by Story 9-9 OS-upgrade reboot 2026-04-25 08:54 UTC. Independent / parallelisable. | Story 9-9 Change Log 2026-04-23 flagged the PM2 ↺ counter (916+ over 89 days) for separate investigation. SCP-2026-04-22 made it Story 9-10. Bundled with Akintola-risk Move 2 endpoint audit per pre-field discipline. |
| 2026-04-27 | **AC#1 + AC#2 partial work shipped via commit `718f84e`.** Triage of CRITICAL alert at 06:32 UTC proved restart counter inflation is deploy-driven (3 morning restarts correlate exactly with commit timestamps `1383373`, `7015601`, `0ea5fa1`), not spontaneous. Real bug found in err log: 5 redundant `connection.quit()` calls crash SIGINT shutdown — fixed via `.catch(() => {})` matching lib/redis.ts:closeAllConnections pattern. Detailed evidence in Dev Notes § "2026-04-27 Triage Evidence". | Capture the work that arrived in flight before the formal AC#1 trajectory completed. |
| 2026-05-01 | **Status flipped `ready-for-dev` → `in-progress`** + AC#3 ceiling tightened to ≤2/7d (Wave 0 closed deploy-spike root cause) + AC#3 anchor timestamp captured (commit `718f84e` deploy completion 2026-04-27 ~07:30 UTC; target close 2026-05-04). Architectural follow-up "move builds off VPS" updated to past-tense, references Wave 0 close-out commit `e799104` 2026-04-30. | First-pass status-discipline + acknowledgment of Wave 0 impact. |
| 2026-05-01 | **Retrospective audit (operator-initiated verification 2026-05-01 evening)** surfaced 9 review items from my own earlier 9-10 review that hadn't been actioned in the same-day status-discipline pass. 8 of 9 auto-fixed: H3 (AC#1 output file), M2 (evidence injection moved to Dev Notes), M3 (AC#4 11-1 decision date 2026-05-08), L1 (commit hash references throughout evidence), L2 (AC#5 done criteria); H1 + M1 + L3 already addressed in earlier pass. 1 of 9 documented as tracked follow-up: H2 (AC#7 ioredis regression test deferred — recorded in Review Follow-ups (AI) rather than spinning a separate `9-10c` story). | Honest accounting of what slipped through the first review pass. The "session closed" claim earlier today was premature; this entry corrects that and brings the story to genuine documented-state-aligned status. |

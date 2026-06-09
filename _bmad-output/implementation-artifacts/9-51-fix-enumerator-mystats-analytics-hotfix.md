# Hotfix 9.51: Enumerator "My Stats" — every card "Failed to load"

Status: done
Type: hotfix
Discovered: 2026-06-09 (operator, on the live Enumerator account)
Fixed: 2026-06-09
Commit: 9eeb88e (fix) + this doc/test follow-up
Related: Hotfix 9.6 (2026-04-05, same analytics raw-SQL class); Story 9-49 (in-flight when discovered — ruled out as cause)

## Summary

On the Enumerator "My Stats" page (`/dashboard/enumerator/stats`), every card across all three
tabs (My Performance, My Data Quality, My Profile) showed **"Failed to load"**. All cards on that
page derive from a single query — `usePersonalStats()` → `GET /analytics/my-stats` — so one failing
request blanks the entire page.

The endpoint returned **HTTP 500** for any enumerator with no active `team_assignments` row.
Production has exactly one enumerator (the operator's test account), with zero assignments, so it
hit the broken path every time.

## Root Cause

`PersonalStatsService.getTeamMemberIds()` resolves an enumerator's "team" for comparison metrics.
With no supervisor assignment it falls back to an LGA-wide lookup whose raw SQL filtered:

```sql
... WHERE u.lga_id = $1 AND u.role IN ('enumerator','data_entry_clerk') AND u.status IN (...)
```

**There is no `users.role` column.** A schema migration normalised roles into a `roles` table
(`users.role_id → roles.id`). The query therefore threw `column u.role does not exist` → the whole
`Promise.all` rejected → controller `next(error)` → 500 → every card failed.

### Why it shipped green
- The query is raw `db.execute(sql\`…\`)`, which is **not type-checked** against the Drizzle schema,
  so `tsc` was clean.
- The unit tests **mock `db.execute`** universally; the "no supervisor/no LGA" test returned empty
  rows, so the broken SQL never actually executed. The full API suite was green while prod 500'd.

This is the same failure class as **Hotfix 9.6** (text↔uuid join mismatch + `ANY(${array})`): raw SQL
in analytics services drifting from the schema, invisible to both `tsc` and the mocked-DB tests.

### Evidence (read-only, against production DB)
- `information_schema`: `users` has `role_id uuid` (FK→`roles.id`), **no `role` column**.
- The current query errors with `column u.role does not exist`; the `roles`-joined query returns the row.
- The one prod enumerator has 0 active `team_assignments` → takes the broken LGA-fallback path.

## Fix

**`apps/api/src/services/personal-stats.service.ts`**

1. **Root cause** — join the `roles` table instead of the non-existent column:
   ```sql
   FROM users u
   JOIN roles r ON r.id = u.role_id
   WHERE u.lga_id = $1 AND r.name IN ('enumerator','data_entry_clerk') AND u.status IN (...)
   ```
2. **Resilience ("make it better")** — each of the 8 parallel stat sections now runs through a
   `safeSection(label, run, fallback)` wrapper: on failure it logs (pino, level 50) and returns a
   safe fallback instead of rejecting. A single failing sub-query can **never again blank the whole
   page** — the enumerator's own primary metrics still render; only the broken section is empty, and
   the failure is logged (observability) instead of hidden. Team resolution is additionally wrapped
   to treat failure as "no team" (null comparison metrics) rather than a 500.

## Prevention

1. **Real-DB smoke for raw-SQL services** — executes each service's queries against a live Postgres
   (CI `test-api` provides one via `db:push:full:force`; a local Postgres is also expected, same as the
   respondents-constraints test). Postgres validates column refs + operand types at PLAN time, so a
   renamed/removed column or a text↔uuid mismatch throws even on zero rows. Two files:
   - `analytics-db-smoke.integration.test.ts` — seeds a real enumerator (lga + `enumerator` role, no
     team assignment) + a submission, then exercises `PersonalStatsService.getPersonalStats`,
     `TeamQualityService.getTeamQuality`, and the **entire SurveyAnalyticsService system-scoped
     surface** (getDemographics/Employment/Household/SkillsFrequency/Trends/RegistrySummary/
     PipelineSummary/SkillsInventory/InferentialInsights/ExtendedEquity/ActivationStatus/
     EnumeratorReliability — the 47-query service) plus `PublicInsightsService.getPublicInsights/getTrends`.
     Includes a schema-invariant guard that fails loudly if `submissions.submitter_id`/`enumerator_id`
     ever change from `text` (which would invalidate the `::text` casts).
   - `ops-services-db-smoke.integration.test.ts` — `audit-log-viewer` (raw `db.execute`, real drift
     risk: listAuditLogs/getDistinctValues/searchPrincipals), plus `ProductivityService` (4 aggregation
     methods) and `RemunerationService`. Productivity/remuneration are Drizzle-query-builder (tsc-guarded,
     low drift risk) but smoked per the "extend to ops services" follow-up so their multi-join
     aggregations are validated end-to-end against the real schema. The remuneration block **seeds a real
     payment chain (batch → record → dispute)** so the data-dependent read paths actually execute their
     joins/filters — `getBatchDetail`, `getStaffPaymentHistory` (current-version `effectiveUntil` filter),
     `getDisputeByRecordId` (exercises the `reopen_count` column the dispute-reopen `sql` fragment relies
     on), `getStaffDisputes` — not just the empty-set branches.

   This coverage would have caught both this hotfix and Hotfix 9.6 in CI, not prod.

2. **Audit of the sibling hazard (text `submitter_id`/`enumerator_id` ↔ uuid `users.id`)** — swept all
   analytics services for column-to-column joins across that mismatch. **All are currently correct**
   (cast present), so there is **no remaining latent bug**:
   - `survey-analytics.service.ts:1643` — `s.submitter_id = u.id::text` ✓
   - `team-quality.service.ts:151` — `s.enumerator_id = u.id::text` ✓
   - `verification-analytics.service.ts:188-189` — `fd.enumerator_id = u.id` (both `uuid`) ✓
   - `assessor.service.ts` fraud joins — `uuid = uuid` ✓
   The only raw-SQL `u.role` reference anywhere was the one fixed here. The smoke now guards the class
   going forward.

## Schema reference (production, 2026-06-09)
- `submissions.submitter_id` = **text**, `submissions.enumerator_id` = **text**, `submissions.id` = uuid,
  `submissions.respondent_id` = uuid.
- `users.id` = uuid, `users.role_id` = uuid (FK→`roles.id`); **no `users.role`**.
- `fraud_detections.enumerator_id` = uuid; `audit_logs.actor_id` = uuid; `respondents.submitter_id` = text.

## Verification
- Broken vs fixed query proven directly against the prod DB.
- New smoke: 5 tests pass against the real DB; full API suite **2245 pass / 0 fail**; `tsc` + lint clean.
- Deployed: VPS `HEAD = 9eeb88e`, fix present in running source, API restarted; `auth-smoke` deploy-gate green.

## Files
- `apps/api/src/services/personal-stats.service.ts` — roles join + `safeSection` resilience + wrapped team resolution.
- `apps/api/src/services/__tests__/personal-stats.service.test.ts` — +2 (graceful-degradation; LGA-fallback SQL joins roles / no `u.role`).
- `apps/api/src/services/__tests__/analytics-db-smoke.integration.test.ts` — **new** real-DB smoke (personal-stats + team-quality + full survey-analytics surface + public-insights + schema-invariant guard).
- `apps/api/src/services/__tests__/ops-services-db-smoke.integration.test.ts` — **new** real-DB smoke (audit-log-viewer + productivity + remuneration).

## Lessons
- Raw `db.execute(sql)` + mocked-DB unit tests = invisible schema drift; analytics endpoints need at
  least one real-DB smoke. (Saved to memory: `feedback-raw-sql-schema-drift`.)
- A green test suite hid a live 500 because the test mocked the exact layer that broke — same theme as
  the Story 9-49 review finding.

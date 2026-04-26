# Story 10.6: Consumer Audit Dashboard

Status: ready-for-dev

<!--
Created 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5.

Per-consumer view of audit-log activity filtered to that consumer's `consumer_id`. Built on Story 9-11 audit viewer foundation + Story 10-1 audit-log consumer_id writes.

Sources:
  • PRD V8.3 FR24 (audit-log requirement for partner API)
  • Architecture Decision 5.4 (audit-log principal dualism) + Decision 5.5 (per-consumer rate-limit metrics)
  • UX Custom Component #15 AuditLogFilter (reused) + Sally's Pattern 2 (daily quota progress bar)
  • Epics.md §Story 10.6

Depends on Story 9-11 (audit viewer foundation) + Story 10-1 (consumer_id audit-log writes) + Story 10-2 (rate-limit metrics in Pino events).
-->

## Story

As a **Super Admin investigating a partner consumer's behaviour over time**,
I want **a per-consumer dashboard showing request-volume time-series, scope-usage breakdown, rate-limit-rejection rate, anomaly markers, and last-used timestamp per key**,
so that **I can audit a specific partner's activity for compliance reviews (quarterly per Story 10-5 SOP) without manually filtering the full audit log every time, and anomalous patterns surface visually rather than requiring forensic deep-dives**.

## Acceptance Criteria

1. **AC#1 — Route + access from Story 10-3 detail page:** Dashboard at `/dashboard/admin/consumers/:id/audit-dashboard` (super-admin only). Linked from Story 10-3 Consumer Detail page as a tab "Activity" or affordance "View Audit Dashboard".

2. **AC#2 — Header section:** Consumer name + organisation_type badge + status badge + DSA-on-file indicator + "Last activity: <X minutes ago>" computed from most-recent `api_keys.last_used_at`. Quick-actions row: "Open in Audit Log Viewer" (deep-link to Story 9-11 viewer with consumer pre-filtered).

3. **AC#3 — Request-volume time-series (top of page):**
   - 7-day default range (selectable: 24h / 7d / 30d / 90d)
   - Line chart (recharts) showing requests-per-hour OR requests-per-day depending on range
   - Hover shows exact count + drill-down to that hour/day's events in Story 9-11 viewer
   - Y-axis: count; X-axis: time
   - Multi-series: total volume + per-scope breakdown (toggleable legend)
   - Performance: query is `GET /api/v1/admin/consumers/:id/activity-timeseries?range=7d` — server aggregates from `audit_logs WHERE consumer_id = $id GROUP BY time_bucket($interval, created_at), action`; cacheable 60s

4. **AC#4 — Scope-usage breakdown:**
   - Donut chart showing % of requests per scope (from `audit_logs` WHERE `consumer_id = $id` AND `meta.scope IS NOT NULL` over selected range)
   - Adjacent table: scope + request count + % share + last-used-at-this-scope
   - Click slice → drill to Story 9-11 viewer filtered to scope + consumer + range

5. **AC#5 — Rate-limit-rejection rate panel** (per Architecture Decision 5.5):
   - Big number: rejection rate (`rate_limit_outcome != 'within'` count / total requests, over selected range)
   - Threshold colours: <1% green; 1-5% yellow; >5% red
   - Sparkline of rejection rate over time
   - Breakdown table: which scope is being rejected most? exhausted-at minute/daily/monthly?
   - **Heuristic anomaly markers:** if rejection rate >2σ above rolling 7-day mean → alert badge "Anomaly detected: rejection rate spiked"

6. **AC#6 — Per-key activity:**
   - Table of consumer's API keys (active + recently-rotated): key prefix + name + issued_at + last_used_at + rotates_at + status (active/rolled-over/revoked)
   - For active keys: "Rotate" + "Revoke" actions (link to Story 10-3 actions)
   - Highlight rows where last_used_at is null or >30 days old (key may be unused — candidate for revocation)

7. **AC#7 — Top targeted resources:**
   - Table: top 10 `target_resource` values by request count over selected range
   - For PII-bearing scope (`submissions:read_pii`): explicit count of distinct respondent IDs accessed (helps Iris answer "what fraction of registry has been pulled by this consumer")
   - Performance: leverage Story 9-11 composite index `audit_logs(target_resource, target_id, created_at)` per AC#10 of 9-11

8. **AC#8 — DSA-precondition violation panel:**
   - Counts of `api_key.pii_scope_rejected_no_dsa` events for this consumer over selected range
   - If non-zero: prominent warning "N PII-scope provisioning attempts rejected due to missing DSA. Resolve by uploading DSA on Story 10-3 Identity tab."
   - If zero: hide panel (no noise on healthy consumers)

9. **AC#9 — Audit-of-audit:**
   - Viewing the dashboard is itself audit-logged: `action: 'consumer_audit_dashboard.viewed'`, `meta: { consumer_id, range }`, `actor_id: <super-admin>`
   - Surfaces in Story 9-11 viewer when filtered by this dashboard's investigator
   - Reason: Iris quarterly audit (per Story 10-5 SOP) requires evidence that Super Admin reviewed each consumer; the dashboard view event is the evidence

10. **AC#10 — Tests:**
    - Component tests: time-series chart (handles empty data, single-point data, multi-day data); donut chart; rate-limit-rejection panel with anomaly threshold logic; per-key table; DSA-precondition panel
    - Integration tests: dashboard renders for consumer with activity; renders empty-state for consumer with no activity; performance verified at 100K audit_logs for one consumer (acceptable: full dashboard renders <2s)
    - E2E test: super-admin opens consumer detail → clicks View Audit Dashboard tab → sees data → time-range change refetches → click sparkline drills to Story 9-11 viewer
    - Audit-of-audit test: viewing dashboard creates expected `audit_logs` row
    - Existing 4,191-test baseline maintained or grown

## Dependencies

- **Story 9-11 (HARD)** — audit viewer foundation; this story is essentially a preset filter on top of 9-11's UI primitives. Can reuse `AuditLogFilter` component (#15) styling; can deep-link to 9-11 viewer for full investigation
- **Story 10-1 (HARD)** — `consumer_id` audit-log writes; without these, the dashboard has no data
- **Story 10-2 (HARD)** — `rate_limit_outcome` field in Pino events + audit_logs.meta for AC#5 rejection rate
- **Story 10-3 (PREFERRED)** — Consumer Detail page is where the "View Audit Dashboard" link lives; if 10-3 lands before 10-6, link is added immediately; if 10-6 lands first, link added in 10-3 task list

**Unblocks:**
- None (terminal in Epic 10 chain)

## Field Readiness Certificate Impact

**Tier B / post-field.** Doesn't ship until consumers exist + have activity to dashboard.

## Tasks / Subtasks

### Task 1 — Backend: aggregation endpoints (AC#3, AC#4, AC#5, AC#7, AC#8)

1.1. New service `apps/api/src/services/consumer-audit-dashboard.service.ts` with methods:
  - `getActivityTimeseries(consumerId, range)` — bucketed counts per hour/day with per-scope breakdown
  - `getScopeBreakdown(consumerId, range)` — counts per scope
  - `getRejectionRate(consumerId, range)` — total rejected / total + sparkline + per-scope breakdown
  - `getAnomalyMarker(consumerId)` — current rejection rate vs 7-day rolling mean (returns `{ anomaly: bool, current_rate, mean, sigma }`)
  - `getKeyActivity(consumerId)` — per-key summary (issued_at, last_used_at, rotates_at, status)
  - `getTopTargetedResources(consumerId, range)` — top 10 target_resources
  - `getDsaPreconditionViolations(consumerId, range)` — count of `api_key.pii_scope_rejected_no_dsa` events

1.2. New routes `apps/api/src/routes/admin/consumer-audit-dashboard.routes.ts`:
  - `GET /api/v1/admin/consumers/:id/activity-timeseries?range=7d`
  - `GET /api/v1/admin/consumers/:id/scope-breakdown?range=7d`
  - `GET /api/v1/admin/consumers/:id/rejection-rate?range=7d`
  - `GET /api/v1/admin/consumers/:id/key-activity`
  - `GET /api/v1/admin/consumers/:id/top-targeted-resources?range=7d`
  - `GET /api/v1/admin/consumers/:id/dsa-violations?range=7d`

1.3. Auth: super-admin only; rate-limited 60/min
1.4. Cacheable responses (60s for time-series; 5min for static metrics)
1.5. Tests

### Task 2 — Frontend: dashboard page + routing (AC#1, AC#2)

2.1. New route `/dashboard/admin/consumers/:id/audit-dashboard`
2.2. New page `apps/web/src/features/admin-consumers/pages/AuditDashboardPage.tsx`
2.3. Header section per AC#2
2.4. Time-range selector (24h / 7d / 30d / 90d) — URL-routed for shareable filter

### Task 3 — Time-series chart (AC#3)

3.1. Component `ActivityTimeseriesChart.tsx` using recharts LineChart
3.2. Multi-series toggleable legend
3.3. Hover shows exact count + drill-down link to Story 9-11

### Task 4 — Scope-usage breakdown (AC#4)

4.1. Component `ScopeBreakdownChart.tsx` using recharts DonutChart + adjacent table
4.2. Click slice → drill to Story 9-11

### Task 5 — Rate-limit-rejection panel (AC#5)

5.1. Component `RejectionRatePanel.tsx`
5.2. Big number + threshold colours
5.3. Sparkline using recharts
5.4. Anomaly badge when AC#5 heuristic triggers
5.5. Breakdown table

### Task 6 — Per-key activity table (AC#6)

6.1. Component `KeyActivityTable.tsx`
6.2. Highlight stale keys
6.3. Action buttons linking to Story 10-3

### Task 7 — Top targeted resources (AC#7)

7.1. Component `TopTargetedResourcesTable.tsx`
7.2. Distinct-respondent-count for PII scope

### Task 8 — DSA-precondition violation panel (AC#8)

8.1. Component `DsaViolationPanel.tsx`
8.2. Conditional render (hide if zero)

### Task 9 — Audit-of-audit (AC#9)

9.1. On dashboard mount: POST to a tracking endpoint that emits the `consumer_audit_dashboard.viewed` audit log
9.2. Tests verify the audit-of-audit record

### Task 10 — Story 10-3 link integration

10.1. Add tab/link "View Audit Dashboard" to Story 10-3 Consumer Detail page
10.2. (Coordinates with Story 10-3 author; may already be added)

### Task 11 — Tests (AC#10) + sprint-status

11.1. Component + integration + E2E tests
11.2. Performance test at 100K audit_logs for one consumer
11.3. Update sprint-status.yaml

## Technical Notes

### Why server-side aggregation (not client-side)

7 days × 24 hours = 168 data points per series. Even at 100 requests/hour, that's 16,800 raw events to ship to client. Server-side `time_bucket` + GROUP BY produces 168 rows. Bandwidth + parsing savings substantial.

### Why per-scope breakdown is multi-series toggleable

Donut chart works for "share of total" but loses time dimension. Line chart with multi-series (total + per scope) lets investigator see "did the scope-mix change over time?" — a weak signal for behaviour drift but valuable forensic context.

### Anomaly detection heuristic — why 2σ

Standard 3σ is more conservative (less false-positive). 2σ is more sensitive (more false-positive but catches genuine spikes earlier). Audit context favours sensitivity — false positives are reviewable; false negatives are missed compromises. 2σ is acceptable for MVP; can tune to 2.5σ if false-positive rate is annoying.

### Why drill-down to Story 9-11 viewer (not duplicate the table here)

Story 9-11 is the canonical audit-event-list surface. Duplicating that UI on this dashboard would create maintenance overhead. Drill-down passes the appropriate filter context (consumer + scope + time range) as URL query params; investigator sees the same UI they're already familiar with.

### Why DSA-precondition violation panel is hidden when zero

Empty panels create visual noise. Dashboards should surface signal, not absence-of-signal. If zero violations, the panel is irrelevant; show only when actionable.

### Why audit-of-audit matters

Per Story 10-5 SOP STEP 7 quarterly review: Iris must demonstrate that Super Admin reviewed each consumer's activity. The dashboard view event is the evidence. Without it, "did Awwal actually review ITF-SUPA's Q3 activity?" is unverifiable. With it: clear audit trail.

### Why distinct-respondent-count for PII scope

Aggregate request counts don't capture privacy impact. "10 requests" could mean "1 respondent looked up 10 times" OR "10 distinct respondents looked up once each" — very different from a privacy perspective. Distinct count helps Iris answer "what fraction of registry has been pulled by this consumer" — a key DPIA metric.

### Performance at 100K audit_logs per consumer

Story 9-11 composite indexes (`(consumer_id, created_at)`, `(target_resource, target_id, created_at)`, `(action, created_at)`) cover all aggregation query shapes. EXPLAIN ANALYZE should land on Index Scan for all dashboard queries. Performance test in AC#10 verifies.

## Risks

1. **Aggregation queries may be slow at 1M+ audit_logs.** Mitigation: leverage Story 9-11 composite indexes; AC#10 performance test catches; fall-back is materialised view (premature optimisation for MVP).
2. **Anomaly detection false positives.** 2σ catches statistical anomalies, not necessarily security incidents. Some operational events (consumer's own deploy retry storm) trigger false alerts. Mitigation: badge says "anomaly detected" not "security incident"; investigator interprets context.
3. **Donut chart at 5-scope breakdown may be cluttered.** With small slices for low-volume scopes, the chart is hard to read. Mitigation: minimum slice size visual treatment (group <5% slices into "Other"); table beside chart shows precise values.
4. **Drill-down to Story 9-11 viewer requires viewer to support all filter combinations.** If Story 9-11 doesn't support per-scope filter, drill-down breaks. Mitigation: cross-check with 9-11 ACs; coordinate if gap.
5. **Audit-of-audit overhead.** Every dashboard view writes an audit log row. At high investigation volume, audit_logs grows. Mitigation: this is desired — investigation volume is itself a metric; 1 row per dashboard view is negligible (audit_logs already handles millions of rows per Story 9-11 AC#11).

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Created:**
- `apps/api/src/services/consumer-audit-dashboard.service.ts`
- `apps/api/src/routes/admin/consumer-audit-dashboard.routes.ts`
- `apps/web/src/features/admin-consumers/pages/AuditDashboardPage.tsx`
- `apps/web/src/features/admin-consumers/components/ActivityTimeseriesChart.tsx`
- `apps/web/src/features/admin-consumers/components/ScopeBreakdownChart.tsx`
- `apps/web/src/features/admin-consumers/components/RejectionRatePanel.tsx`
- `apps/web/src/features/admin-consumers/components/KeyActivityTable.tsx`
- `apps/web/src/features/admin-consumers/components/TopTargetedResourcesTable.tsx`
- `apps/web/src/features/admin-consumers/components/DsaViolationPanel.tsx`
- `apps/web/src/features/admin-consumers/api/audit-dashboard.ts` (TanStack Query hooks)
- Tests

**Modified:**
- `apps/web/src/features/admin-consumers/pages/ConsumerDetailPage.tsx` — link to audit dashboard
- `apps/web/package.json` — add `recharts` if not present
- TanStack Router config
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story created by Bob (SM) per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering per-consumer audit dashboard with request-volume time-series + scope-usage breakdown + rate-limit-rejection rate with anomaly detection + per-key activity + top targeted resources + DSA-precondition violation panel + audit-of-audit + tests. Depends on Story 9-11 + 10-1 + 10-2. Terminal in Epic 10 chain. | Operator visibility for quarterly compliance reviews per Story 10-5 SOP. Without it, per-consumer investigation requires manually filtering full audit log every time. |

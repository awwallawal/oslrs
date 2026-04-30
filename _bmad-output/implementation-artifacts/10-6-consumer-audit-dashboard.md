# Story 10.6: Consumer Audit Dashboard

Status: ready-for-dev

<!--
Created 2026-04-25 by impostor-SM agent per SCP-2026-04-22 §A.5.

Per-consumer view of audit-log activity filtered to that consumer's `consumer_id`. Built on Story 9-11 audit viewer foundation + Story 10-1 audit-log consumer_id writes.

Sources:
  • PRD V8.3 FR24 (audit-log requirement for partner API)
  • Architecture Decision 5.4 (audit-log principal dualism) + Decision 5.5 (per-consumer rate-limit metrics)
  • UX Custom Component #15 AuditLogFilter (reused) + Sally's Pattern 2 (daily quota progress bar)
  • Epics.md §Story 10.6

Depends on Story 9-11 (audit viewer foundation) + Story 10-1 (consumer_id audit-log writes) + Story 10-2 (rate-limit metrics in Pino events).

Validation pass 2026-04-30 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template; URL bug fixed (`/dashboard/admin/consumers/:id/audit-dashboard` → `/dashboard/super-admin/consumers/:id/audit-dashboard` matching `roleRouteMap` at `sidebarConfig.ts:60-68`); routes file path corrected (`apps/api/src/routes/admin/consumer-audit-dashboard.routes.ts` subdir → `apps/api/src/routes/consumer-audit-dashboard.routes.ts` flat file matching convention); 10-3 feature-dir reuse coordinated (`apps/web/src/features/admin-consumers/` shared); recharts library reused from Stories 10-3 + 10-4 (single library across charts in this codebase); deep-link to Story 9-11 audit viewer for drill-downs uses URL-routed filter state per 9-11 retrofit AC#6.
-->

## Story

As a **Super Admin investigating a partner consumer's behaviour over time**,
I want **a per-consumer dashboard showing request-volume time-series, scope-usage breakdown, rate-limit-rejection rate, anomaly markers, and last-used timestamp per key**,
so that **I can audit a specific partner's activity for compliance reviews (quarterly per Story 10-5 SOP) without manually filtering the full audit log every time, and anomalous patterns surface visually rather than requiring forensic deep-dives**.

## Acceptance Criteria

1. **AC#1 — Route + access from Story 10-3 detail page:** Dashboard at `/dashboard/super-admin/consumers/:id/audit-dashboard` (super-admin only; URL pattern matches existing `roleRouteMap` at `sidebarConfig.ts:60-68` — story v1's `/dashboard/admin/...` was a typo). Linked from Story 10-3 Consumer Detail page (`apps/web/src/features/admin-consumers/pages/ConsumerDetailPage.tsx`) as a tab "Activity" or affordance "View Audit Dashboard".

2. **AC#2 — Header section:** Consumer name + organisation_type badge + status badge + DSA-on-file indicator + "Last activity: <X minutes ago>" computed from most-recent `api_keys.last_used_at`. Quick-actions row: "Open in Audit Log Viewer" (deep-link to Story 9-11 viewer with consumer pre-filtered: `/dashboard/super-admin/audit-log?actor_type=consumer&actor_id=<id>` per 9-11 retrofit AC#6 URL-routed filter state).

3. **AC#3 — Request-volume time-series (top of page):**
   - 7-day default range (selectable: 24h / 7d / 30d / 90d)
   - Line chart (recharts — single library across Stories 10-3 + 10-4 + this story) showing requests-per-hour OR requests-per-day depending on range
   - Hover shows exact count + drill-down to that hour/day's events in Story 9-11 viewer
   - Y-axis: count; X-axis: time
   - Multi-series: total volume + per-scope breakdown (toggleable legend)
   - Performance: query is `GET /api/v1/admin/consumers/:id/activity-timeseries?range=7d` — server aggregates from `audit_logs WHERE consumer_id = $id GROUP BY time_bucket($interval, created_at), action`; cacheable 60s

4. **AC#4 — Scope-usage breakdown:**
   - Donut chart showing % of requests per scope (from `audit_logs` WHERE `consumer_id = $id` AND `meta.scope IS NOT NULL` over selected range)
   - Adjacent table: scope + request count + % share + last-used-at-this-scope
   - Click slice → drill to Story 9-11 viewer filtered to scope + consumer + range

5. **AC#5 — Rate-limit-rejection rate panel** (per Architecture Decision 5.5):
   - Big number: rejection rate (`rate_limit_outcome != 'within'` count / total requests, over selected range — leverages Pino field added by Story 10-2 AC#7)
   - Threshold colours: <1% green; 1-5% yellow; >5% red
   - Sparkline of rejection rate over time
   - Breakdown table: which scope is being rejected most? exhausted-at minute/daily/monthly?
   - **Heuristic anomaly markers:** if rejection rate >2σ above rolling 7-day mean → alert badge "Anomaly detected: rejection rate spiked"

6. **AC#6 — Per-key activity:**
   - Table of consumer's API keys (active + recently-rotated): key prefix + name + issued_at + last_used_at + rotates_at + status (active/rolled-over/revoked)
   - For active keys: "Rotate" + "Revoke" actions (link to Story 10-3 actions at `/dashboard/super-admin/consumers/:id/keys/:keyId`)
   - Highlight rows where last_used_at is null or >30 days old (key may be unused — candidate for revocation)

7. **AC#7 — Top targeted resources:**
   - Table: top 10 `target_resource` values by request count over selected range
   - For PII-bearing scope (`submissions:read_pii`): explicit count of distinct respondent IDs accessed (helps Iris answer "what fraction of registry has been pulled by this consumer")
   - Performance: leverages Story 9-11 composite index `audit_logs(target_resource, target_id, created_at)` per AC#10 of 9-11

8. **AC#8 — DSA-precondition violation panel:**
   - Counts of `api_key.pii_scope_rejected_no_dsa` events (audit action added by Story 10-1 AC#7) for this consumer over selected range
   - If non-zero: prominent warning "N PII-scope provisioning attempts rejected due to missing DSA. Resolve by uploading DSA on Story 10-3 Identity tab."
   - If zero: hide panel (no noise on healthy consumers)

9. **AC#9 — Audit-of-audit:**
   - Viewing the dashboard is itself audit-logged via `AuditService.logAction({ action: 'consumer_audit_dashboard.viewed', meta: { consumer_id, range }, actor_id: req.user.sub })`
   - Add `CONSUMER_AUDIT_DASHBOARD_VIEWED: 'consumer_audit_dashboard.viewed'` to `AUDIT_ACTIONS` const at `apps/api/src/services/audit.service.ts:35-64`
   - Surfaces in Story 9-11 viewer when filtered by this dashboard's investigator
   - Reason: Iris quarterly audit (per Story 10-5 SOP STEP 7) requires evidence that Super Admin reviewed each consumer; the dashboard view event is the evidence

10. **AC#10 — Tests:**
    - Component tests: time-series chart (handles empty data, single-point data, multi-day data); donut chart; rate-limit-rejection panel with anomaly threshold logic; per-key table; DSA-precondition panel
    - Integration tests: dashboard renders for consumer with activity; renders empty-state for consumer with no activity; performance verified at 100K audit_logs for one consumer (acceptable: full dashboard renders <2s)
    - E2E test: super-admin opens consumer detail → clicks View Audit Dashboard tab → sees data → time-range change refetches → click sparkline drills to Story 9-11 viewer
    - Audit-of-audit test: viewing dashboard creates expected `audit_logs` row
    - Existing 4,191-test baseline maintained or grown

## Tasks / Subtasks

- [ ] **Task 1 — Backend: aggregation endpoints** (AC: #3, #4, #5, #7, #8)
  - [ ] 1.1 New service `apps/api/src/services/consumer-audit-dashboard.service.ts` with methods:
        - `getActivityTimeseries(consumerId, range)` — bucketed counts per hour/day with per-scope breakdown
        - `getScopeBreakdown(consumerId, range)` — counts per scope
        - `getRejectionRate(consumerId, range)` — total rejected / total + sparkline + per-scope breakdown
        - `getAnomalyMarker(consumerId)` — current rejection rate vs 7-day rolling mean (returns `{ anomaly: bool, current_rate, mean, sigma }`)
        - `getKeyActivity(consumerId)` — per-key summary (issued_at, last_used_at, rotates_at, status)
        - `getTopTargetedResources(consumerId, range)` — top 10 target_resources
        - `getDsaPreconditionViolations(consumerId, range)` — count of `api_key.pii_scope_rejected_no_dsa` events (audit action added by Story 10-1 AC#7)
  - [ ] 1.2 New flat routes file `apps/api/src/routes/consumer-audit-dashboard.routes.ts` (NOT `routes/admin/consumer-audit-dashboard.routes.ts` subdirectory — that pattern doesn't exist; existing convention is flat per resource: `audit.routes.ts`, `respondent.routes.ts`, `imports.routes.ts`, `consumers.routes.ts` from Story 10-3, etc. The `routes/partner/` subdir from Story 10-1 was the documented exception, not a default):
        - `GET /api/v1/admin/consumers/:id/activity-timeseries?range=7d`
        - `GET /api/v1/admin/consumers/:id/scope-breakdown?range=7d`
        - `GET /api/v1/admin/consumers/:id/rejection-rate?range=7d`
        - `GET /api/v1/admin/consumers/:id/key-activity`
        - `GET /api/v1/admin/consumers/:id/top-targeted-resources?range=7d`
        - `GET /api/v1/admin/consumers/:id/dsa-violations?range=7d`
  - [ ] 1.3 Auth: super-admin only via existing `authenticate` + `authorize(UserRole.SUPER_ADMIN)` pattern (clone from `apps/api/src/routes/admin.routes.ts:24-27`); rate-limited 60/min via clone of `apps/api/src/middleware/login-rate-limit.ts:25-110` with `prefix: 'rl:audit-dashboard:'`
  - [ ] 1.4 Cacheable responses (60s for time-series; 5min for static metrics)
  - [ ] 1.5 Mount routes in `apps/api/src/routes/index.ts`
  - [ ] 1.6 Tests

- [ ] **Task 2 — Frontend: dashboard page + routing** (AC: #1, #2)
  - [ ] 2.1 New route `/dashboard/super-admin/consumers/:id/audit-dashboard` (TanStack Router; URL matches existing `roleRouteMap` convention; story v1's `/dashboard/admin/...` was a typo)
  - [ ] 2.2 New page `apps/web/src/features/admin-consumers/pages/AuditDashboardPage.tsx` (REUSES Story 10-3 feature directory — single dir for all consumer admin surfaces)
  - [ ] 2.3 Header section per AC#2 (consumer name + badges + last-activity + "Open in Audit Log Viewer" deep-link)
  - [ ] 2.4 Time-range selector (24h / 7d / 30d / 90d) — URL-routed for shareable filter (matches Story 9-11 AC#6 URL-routed filter state pattern)

- [ ] **Task 3 — Time-series chart** (AC: #3)
  - [ ] 3.1 Component `apps/web/src/features/admin-consumers/components/ActivityTimeseriesChart.tsx` using recharts LineChart
  - [ ] 3.2 Multi-series toggleable legend
  - [ ] 3.3 Hover shows exact count + drill-down link to Story 9-11 viewer at `/dashboard/super-admin/audit-log?actor_type=consumer&actor_id=<id>&from=<timestamp>&to=<timestamp+1h>`

- [ ] **Task 4 — Scope-usage breakdown** (AC: #4)
  - [ ] 4.1 Component `apps/web/src/features/admin-consumers/components/ScopeBreakdownChart.tsx` using recharts DonutChart + adjacent table
  - [ ] 4.2 Click slice → drill to Story 9-11 viewer filtered to scope + consumer + range

- [ ] **Task 5 — Rate-limit-rejection panel** (AC: #5)
  - [ ] 5.1 Component `apps/web/src/features/admin-consumers/components/RejectionRatePanel.tsx`
  - [ ] 5.2 Big number + threshold colours
  - [ ] 5.3 Sparkline using recharts
  - [ ] 5.4 Anomaly badge when AC#5 heuristic triggers (2σ above rolling 7-day mean)
  - [ ] 5.5 Breakdown table: which scope rejected most + exhausted-at split (data from Story 10-2 AC#7 Pino events flowed into audit_logs.meta)

- [ ] **Task 6 — Per-key activity table** (AC: #6)
  - [ ] 6.1 Component `apps/web/src/features/admin-consumers/components/KeyActivityTable.tsx`
  - [ ] 6.2 Highlight stale keys (last_used_at null or >30 days old)
  - [ ] 6.3 Action buttons linking to Story 10-3 key detail page at `/dashboard/super-admin/consumers/:id/keys/:keyId`

- [ ] **Task 7 — Top targeted resources** (AC: #7)
  - [ ] 7.1 Component `apps/web/src/features/admin-consumers/components/TopTargetedResourcesTable.tsx`
  - [ ] 7.2 Distinct-respondent-count for PII scope (helps Iris DPIA metric)

- [ ] **Task 8 — DSA-precondition violation panel** (AC: #8)
  - [ ] 8.1 Component `apps/web/src/features/admin-consumers/components/DsaViolationPanel.tsx`
  - [ ] 8.2 Conditional render (hide if zero — dashboards should surface signal, not absence-of-signal)

- [ ] **Task 9 — Audit-of-audit** (AC: #9)
  - [ ] 9.1 On dashboard mount: backend emits the `consumer_audit_dashboard.viewed` audit log via `AuditService.logAction()` with `actor_id: req.user.sub`
  - [ ] 9.2 Add `CONSUMER_AUDIT_DASHBOARD_VIEWED: 'consumer_audit_dashboard.viewed'` to `AUDIT_ACTIONS` const at `apps/api/src/services/audit.service.ts:35-64`
  - [ ] 9.3 Tests verify the audit-of-audit record appears in audit_logs

- [ ] **Task 10 — Story 10-3 link integration** (AC: #1)
  - [ ] 10.1 Add tab/link "View Audit Dashboard" to Story 10-3 Consumer Detail page (`apps/web/src/features/admin-consumers/pages/ConsumerDetailPage.tsx`)
  - [ ] 10.2 Coordination: if 10-3 lands first, this story modifies the page to add the link; if 10-6 lands first, this story authors the link as a placeholder element that 10-3's page renders. Per Wave 4 dependency order: 10-3 likely ships before 10-6.

- [ ] **Task 11 — Tests + sprint-status** (AC: #10)
  - [ ] 11.1 Component + integration + E2E tests
  - [ ] 11.2 Performance test at 100K audit_logs for one consumer (full dashboard renders <2s)
  - [ ] 11.3 Run `pnpm test` from root — verify baseline 4,191 + new tests
  - [ ] 11.4 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `10-6-consumer-audit-dashboard: in-progress` → `review` → `done`

- [ ] **Task 12 — Code review** (cross-cutting AC: all)
  - [ ] 12.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree (per the existing "code review before commit" project pattern in MEMORY.md `feedback_review_before_commit.md`)
  - [ ] 12.2 Auto-fix all High/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI)
  - [ ] 12.3 Only after code review passes, commit and mark status `review`

## Dev Notes

### Dependencies

- **Story 9-11 (HARD)** — audit viewer foundation; this story is essentially a preset filter on top of 9-11's UI primitives. Reuses `AuditLogFilter` component (#15) styling; deep-links to 9-11 viewer for full investigation. URL-routed filter state per 9-11 retrofit AC#6.
- **Story 10-1 (HARD)** — `consumer_id` audit-log writes (`api_consumers` schema + `apiKeyAuth` middleware tagging audit events with `consumer_id`); without these, the dashboard has no data. Also: `api_key.pii_scope_rejected_no_dsa` audit action from 10-1 AC#7 feeds AC#8 panel.
- **Story 10-2 (HARD)** — `rate_limit_outcome` field in Pino events (AC#7) + audit_logs.meta for AC#5 rejection rate panel
- **Story 10-3 (PREFERRED)** — Consumer Detail page is where the "View Audit Dashboard" link lives; if 10-3 lands before 10-6, link is added immediately; if 10-6 lands first, link added in 10-3 task list. Per Wave 4 ordering: 10-3 likely ships first.
- **Story 9-11 composite indexes** — leveraged for performance per AC#7 + AC#10 verification

**Unblocks:**
- None (terminal in Epic 10 chain; final story in retrofit cascade)

### Field Readiness Certificate Impact

**Tier B / post-field.** Doesn't ship until consumers exist + have activity to dashboard.

### Why server-side aggregation (not client-side)

7 days × 24 hours = 168 data points per series. Even at 100 requests/hour, that's 16,800 raw events to ship to client. Server-side `time_bucket` + GROUP BY produces 168 rows. Bandwidth + parsing savings substantial.

### Why per-scope breakdown is multi-series toggleable

Donut chart works for "share of total" but loses time dimension. Line chart with multi-series (total + per scope) lets investigator see "did the scope-mix change over time?" — a weak signal for behaviour drift but valuable forensic context.

### Anomaly detection heuristic — why 2σ

Standard 3σ is more conservative (less false-positive). 2σ is more sensitive (more false-positive but catches genuine spikes earlier). Audit context favours sensitivity — false positives are reviewable; false negatives are missed compromises. 2σ is acceptable for MVP; can tune to 2.5σ if false-positive rate is annoying.

### Why drill-down to Story 9-11 viewer (not duplicate the table here)

Story 9-11 is the canonical audit-event-list surface. Duplicating that UI on this dashboard would create maintenance overhead. Drill-down passes the appropriate filter context (consumer + scope + time range) as URL query params; investigator sees the same UI they're already familiar with. Per 9-11 retrofit AC#6: URL-routed filter state means filters survive page navigation.

### Why DSA-precondition violation panel is hidden when zero

Empty panels create visual noise. Dashboards should surface signal, not absence-of-signal. If zero violations, the panel is irrelevant; show only when actionable.

### Why audit-of-audit matters

Per Story 10-5 SOP STEP 7 quarterly review: Iris must demonstrate that Super Admin reviewed each consumer's activity. The dashboard view event is the evidence. Without it, "did Awwal actually review ITF-SUPA's Q3 activity?" is unverifiable. With it: clear audit trail.

### Why distinct-respondent-count for PII scope

Aggregate request counts don't capture privacy impact. "10 requests" could mean "1 respondent looked up 10 times" OR "10 distinct respondents looked up once each" — very different from a privacy perspective. Distinct count helps Iris answer "what fraction of registry has been pulled by this consumer" — a key DPIA metric.

### Performance at 100K audit_logs per consumer

Story 9-11 composite indexes (`(actor_id, created_at)`, `(consumer_id, created_at)`, `(target_resource, target_id, created_at)`, `(action, created_at)` — all per Story 9-11 AC#10) cover all aggregation query shapes for this dashboard. EXPLAIN ANALYZE should land on Index Scan for all dashboard queries. Performance test in AC#10 verifies (<2s full dashboard render at 100K rows for one consumer).

### Routes file convention — flat file (not subdirectory)

`apps/api/src/routes/consumer-audit-dashboard.routes.ts` lives flat under `routes/`. Story v1's reference to `apps/api/src/routes/admin/consumer-audit-dashboard.routes.ts` was a fictional subdirectory. Routes file naming convention is one flat file per resource (`audit.routes.ts`, `respondent.routes.ts`, `imports.routes.ts`, `consumers.routes.ts` from Story 10-3, `consumer-requests.routes.ts` from Story 10-4). The `partner/` subdirectory from Story 10-1 was the documented exception (5 sub-routers per scope justified subdir).

### Risks

1. **Aggregation queries may be slow at 1M+ audit_logs.** Mitigation: leverage Story 9-11 composite indexes; AC#10 performance test catches; fall-back is materialised view (premature optimisation for MVP).
2. **Anomaly detection false positives.** 2σ catches statistical anomalies, not necessarily security incidents. Some operational events (consumer's own deploy retry storm) trigger false alerts. Mitigation: badge says "anomaly detected" not "security incident"; investigator interprets context.
3. **Donut chart at 5-scope breakdown may be cluttered.** With small slices for low-volume scopes, the chart is hard to read. Mitigation: minimum slice size visual treatment (group <5% slices into "Other"); table beside chart shows precise values.
4. **Drill-down to Story 9-11 viewer requires viewer to support all filter combinations.** If Story 9-11 doesn't support per-scope filter or actor_type=consumer filter, drill-down breaks. Mitigation: cross-check with 9-11 AC#3 (filter component) + AC#6 (URL-routed filter state); coordinate if gap.
5. **Audit-of-audit overhead.** Every dashboard view writes an audit log row. At high investigation volume, audit_logs grows. Mitigation: this is desired — investigation volume is itself a metric; 1 row per dashboard view is negligible (audit_logs already handles millions of rows per Story 9-11 AC#11).
6. **recharts in stack.** Verify at impl time; if not present, add to `apps/web/package.json` (also added by Stories 10-3 + 10-4 — coordinate via package.json single dependency).

### Project Structure Notes

- **Reuses Story 10-3 feature directory** `apps/web/src/features/admin-consumers/` — this story extends 10-3's pages + components subdirs with audit-dashboard-specific files. NOT a new feature dir. Single dir for all consumer admin surfaces (list, wizard, detail, audit-dashboard).
- **Backend service** at `apps/api/src/services/consumer-audit-dashboard.service.ts` — follows existing service-layer pattern (peer of `audit.service.ts`, `consumer.service.ts` from 10-3, `consumer-rate-limit.service.ts` from 10-2).
- **Backend routes** at `apps/api/src/routes/consumer-audit-dashboard.routes.ts` (flat file under `routes/`; NOT subdirectory). 6 endpoints per AC#3-#8 mounted under `/api/v1/admin/consumers/:id/*`.
- **URL convention**: `/dashboard/super-admin/X` per `roleRouteMap` at `sidebarConfig.ts:60-68`. Story v1's `/dashboard/admin/X` was a typo — that pattern doesn't exist.
- **Cross-feature component reuse:**
  - All recharts components — same library used by Stories 10-3 (Tab 3 + activity drawer) and 10-4 (consumer-self quota dashboard)
  - Story 9-11 audit viewer URL pattern for deep-links (`/dashboard/super-admin/audit-log?...` per 9-11 AC#6 URL-routed filter state)
  - Story 10-3 consumer admin actions for "Rotate" / "Revoke" buttons in AC#6 per-key activity table
- **Audit logging** via `AuditService.logAction()` (`apps/api/src/services/audit.service.ts:226`) for AC#9 audit-of-audit. Add `CONSUMER_AUDIT_DASHBOARD_VIEWED` to `AUDIT_ACTIONS` const at `audit.service.ts:35-64`.
- **Composite indexes** all owned by Story 9-11 AC#10 — this story consumes them, doesn't add new ones.
- **Auth pattern** clone from `apps/api/src/routes/admin.routes.ts:24-27` (existing `authenticate` + `authorize(UserRole.SUPER_ADMIN)` middleware composition).
- **Rate-limit middleware** clone from `apps/api/src/middleware/login-rate-limit.ts:25-110` with `prefix: 'rl:audit-dashboard:'` (60/min).
- **TanStack Query convention** — feature-level api file at `apps/web/src/features/admin-consumers/api/audit-dashboard.api.ts` (NEW file alongside Story 10-3's `consumers.api.ts`); hooks named `useActivityTimeseries`, `useScopeBreakdown`, `useRejectionRate`, `useKeyActivity`, `useTopTargetedResources`, `useDsaViolations`.
- **Frontend HTTP client** is `apps/web/src/lib/api-client.ts:31` — fetch-based, throws `ApiError`. NO axios.
- **CSP discipline** (per Story 9-7 nginx mirror): recharts uses inline SVG which is CSP-safe; no `eval` / `new Function()` concerns. Verified across other stories using recharts.
- **No NEW directories created by this story** — all new files land in existing dirs (`apps/web/src/features/admin-consumers/` from Story 10-3; `apps/api/src/services/`; `apps/api/src/routes/`).

### References

- Architecture Decision 5.4 (audit-log principal dualism — `consumer_id` writes from Story 10-1 are the data source): [Source: _bmad-output/planning-artifacts/architecture.md Decision 5.4]
- Architecture Decision 5.5 (per-consumer rate-limit metrics — `rate_limit_outcome` field from Story 10-2 feeds AC#5): [Source: _bmad-output/planning-artifacts/architecture.md Decision 5.5]
- Epics — Story 10.6 entry: [Source: _bmad-output/planning-artifacts/epics.md Epic 10 §10.6]
- Story 9-11 (HARD — audit viewer foundation + URL-routed filter state for drill-downs): [Source: _bmad-output/implementation-artifacts/9-11-admin-audit-log-viewer.md AC#6, AC#10]
- Story 10-1 (HARD — consumer_id writes + `api_key.pii_scope_rejected_no_dsa` audit action): [Source: _bmad-output/implementation-artifacts/10-1-consumer-auth-layer.md AC#7]
- Story 10-2 (HARD — `rate_limit_outcome` Pino field for AC#5): [Source: _bmad-output/implementation-artifacts/10-2-per-consumer-rate-limiting.md AC#7]
- Story 10-3 (PREFERRED — consumer detail page link integration + feature directory reuse): [Source: _bmad-output/implementation-artifacts/10-3-consumer-admin-ui.md AC#8]
- Story 10-5 SOP STEP 7 (justification for audit-of-audit per AC#9): [Source: _bmad-output/implementation-artifacts/10-5-data-sharing-agreement-template.md AC#3 SOP STEP 7]
- Sidebar config (URL convention): [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts:60-68]
- Audit service `logAction` API (AC#9 audit-of-audit): [Source: apps/api/src/services/audit.service.ts:226]
- Audit service `AUDIT_ACTIONS` const (extend with `CONSUMER_AUDIT_DASHBOARD_VIEWED`): [Source: apps/api/src/services/audit.service.ts:35-64]
- Admin routes auth pattern (super-admin gate clone for Task 1.3): [Source: apps/api/src/routes/admin.routes.ts:24-27]
- Existing routes flat-file convention (precedent): [Source: apps/api/src/routes/audit.routes.ts, respondent.routes.ts]
- Story 10-1 routes subdirectory exception (clarifies why this story uses flat file): [Source: _bmad-output/implementation-artifacts/10-1-consumer-auth-layer.md Dev Notes "Routes subdirectory pattern — first instance"]
- Rate-limit middleware canonical pattern (clone for AC#1 60/min): [Source: apps/api/src/middleware/login-rate-limit.ts:25-110]
- Web HTTP client (TanStack Query hooks): [Source: apps/web/src/lib/api-client.ts:31]
- Story 9-11 composite indexes (performance for AC#7 + AC#10): [Source: _bmad-output/implementation-artifacts/9-11-admin-audit-log-viewer.md AC#10]
- MEMORY.md key pattern: code review before commit: [Source: MEMORY.md "Process Patterns" + `feedback_review_before_commit.md`]
- MEMORY.md key pattern: integration tests use beforeAll/afterAll: [Source: MEMORY.md "Key Patterns"]

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation. Implementer must include:)_

- Story 10-3 ship status verified before adding "View Audit Dashboard" link (Task 10 outcome — link added in this story OR pre-added in 10-3)
- recharts confirmed in apps/web/package.json (added by Stories 10-3 / 10-4 first, or added here)
- Performance test result at 100K audit_logs for one consumer (full dashboard render <2s; specific timing)
- Anomaly detection 2σ heuristic false-positive rate over first week of usage (informs future tuning to 2.5σ if needed)
- AC#7 distinct-respondent-count query EXPLAIN ANALYZE confirms Index Scan at projected scale
- Code review findings + fixes (cross-reference Review Follow-ups (AI) below)

### File List

**Created:**
- `apps/api/src/services/consumer-audit-dashboard.service.ts`
- `apps/api/src/routes/consumer-audit-dashboard.routes.ts` (FLAT file under routes/; NOT subdirectory)
- `apps/web/src/features/admin-consumers/pages/AuditDashboardPage.tsx` (REUSES Story 10-3 feature directory)
- `apps/web/src/features/admin-consumers/components/ActivityTimeseriesChart.tsx`
- `apps/web/src/features/admin-consumers/components/ScopeBreakdownChart.tsx`
- `apps/web/src/features/admin-consumers/components/RejectionRatePanel.tsx`
- `apps/web/src/features/admin-consumers/components/KeyActivityTable.tsx`
- `apps/web/src/features/admin-consumers/components/TopTargetedResourcesTable.tsx`
- `apps/web/src/features/admin-consumers/components/DsaViolationPanel.tsx`
- `apps/web/src/features/admin-consumers/api/audit-dashboard.api.ts` (TanStack Query hooks; alongside Story 10-3's `consumers.api.ts`)
- Tests

**Modified:**
- `apps/web/src/features/admin-consumers/pages/ConsumerDetailPage.tsx` (Story 10-3 file) — add "View Audit Dashboard" tab/link per AC#1 + Task 10
- `apps/api/src/services/audit.service.ts` — extend `AUDIT_ACTIONS` const with `CONSUMER_AUDIT_DASHBOARD_VIEWED`
- `apps/api/src/routes/index.ts` — mount `consumer-audit-dashboard.routes.ts`
- `apps/web/package.json` — add `recharts` if not present (likely added by Stories 10-3 / 10-4 first; coordinate)
- TanStack Router config — register new route `/dashboard/super-admin/consumers/:id/audit-dashboard`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Out of scope (explicitly NOT modified — happens upstream):**
- Audit log viewer page — owned by Story 9-11 (this story deep-links into it)
- `consumer_id` audit-log writes — owned by Story 10-1
- `rate_limit_outcome` Pino field — owned by Story 10-2
- Consumer admin pages (list/wizard/detail) — owned by Story 10-3 (this story extends `admin-consumers/` feature dir but doesn't modify 10-3's pages except for Task 10 link)

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering per-consumer audit dashboard with request-volume time-series + scope-usage breakdown + rate-limit-rejection rate with anomaly detection + per-key activity + top targeted resources + DSA-precondition violation panel + audit-of-audit + tests. Depends on Story 9-11 + 10-1 + 10-2. Terminal in Epic 10 chain. | Operator visibility for quarterly compliance reviews per Story 10-5 SOP. Without it, per-consumer investigation requires manually filtering full audit log every time. |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 8 subsections — Why server-side aggregation / Why per-scope breakdown multi-series / Anomaly detection 2σ rationale / Why drill-down to 9-11 viewer / Why DSA panel hidden when zero / Why audit-of-audit matters / Why distinct-respondent-count / Performance at 100K audit_logs / Routes file convention), "Risks" under Dev Notes; converted task-as-headings to canonical `[ ] Task N (AC: #X)` checkbox format; added `### Project Structure Notes` subsection covering Story 10-3 feature-dir reuse + flat routes file convention + URL convention + cross-feature component reuse (recharts, 9-11 deep-link URL pattern, 10-3 admin actions) + audit logging + composite-index reuse + rate-limit clone pattern + TanStack Query naming + CSP discipline; added `### References` subsection with 17 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record`; added `### Review Follow-ups (AI)` placeholder; added Task 12 (code review) per `feedback_review_before_commit.md`. **Two factual fixes applied throughout:** (1) URL bug `/dashboard/admin/consumers/:id/audit-dashboard` → `/dashboard/super-admin/consumers/:id/audit-dashboard` (matches `roleRouteMap` at `sidebarConfig.ts:60-68`; story v1's `admin/` prefix doesn't exist anywhere); (2) routes file path `apps/api/src/routes/admin/consumer-audit-dashboard.routes.ts` (subdirectory; doesn't exist) → `apps/api/src/routes/consumer-audit-dashboard.routes.ts` (flat file; matches existing convention). **Cross-story coherence wiring:** Story 10-3 feature directory reuse explicit (NOT new dir); recharts library coordination with Stories 10-3 + 10-4 (single library across codebase); Story 9-11 deep-link URL pattern uses `/dashboard/super-admin/audit-log?actor_type=consumer&actor_id=<id>` (per 9-11 retrofit AC#6 URL-routed filter state); audit-of-audit pattern leverages existing Story 6-1 hash-chain infrastructure; composite indexes consumed from Story 9-11 AC#10 (NOT re-added); per-key action buttons link to Story 10-3's key detail page at `/dashboard/super-admin/consumers/:id/keys/:keyId`. **One new audit action documented** (`CONSUMER_AUDIT_DASHBOARD_VIEWED`). **Rate-limit clone reference pinned** to `apps/api/src/middleware/login-rate-limit.ts:25-110`. All 10 ACs preserved verbatim. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as 17 prior retrofits. URL bug + routes-subdir bug + cross-story coherence wiring with Wave 0/1/2/3/4 retrofitted infrastructure. Terminal story in retrofit cascade — closes Wave 4. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 12.)_

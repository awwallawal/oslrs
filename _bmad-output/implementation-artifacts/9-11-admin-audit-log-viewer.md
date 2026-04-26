# Story 9.11: Admin Audit Log Viewer

Status: ready-for-dev

<!--
Created 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5.

Surfaces the existing write-side audit infrastructure (Epic 6) via a super-admin read-side UI. Hard prerequisite for Epic 10 PII-scope partner-API release.

Sources:
  • PRD V8.3 FR26 (super-admin audit log viewer)
  • Architecture Decisions 5.4 (audit-log principal dualism), 5.5 (per-consumer rate-limit metrics)
  • Architecture ADR-018 (multi-source registry — principal-exclusive CHECK on audit_logs)
  • Architecture ADR-019 (API consumer auth — DSA precondition + audit prerequisite)
  • UX Journey 6 (Super-Admin Audit Log Investigation)
  • UX Custom Component #15 AuditLogFilter
  • UX Navigation Patterns: super-admin sidebar Audit Log item between System Health and Settings
  • Epics.md §Story 9.11

Akintola-risk Move 3: scale verification at 1M audit_logs rows.
-->

## Story

As a **Super Admin investigating a security or compliance concern**,
I want **a list + filter + paginate UI over the audit log that shows both human-actor and machine-consumer principals, supports multi-dimensional filtering (principal type / actor / action / target / time range), and exports filtered subsets as CSV with the filter signature baked in**,
so that **I can answer compliance questions in <30 seconds without opening psql, and so the Epic 10 PII-scope partner-API can launch with credible NDPA oversight that the existing write-only audit infrastructure could not provide**.

## Acceptance Criteria

1. **AC#1 — Audit Log page at `/dashboard/admin/audit-log`:** New super-admin-only page accessible via sidebar nav item **Audit Log** (placement between System Health and Settings per Sally's Navigation Patterns spec). Strict route isolation (per ADR-016) — non-super-admin users hitting the URL are redirected to their role's dashboard root with toast "This page is for Super Admins only." Sidebar nav item gated on `super_admin` role at the menu-config level.

2. **AC#2 — Default view:** "All audit events from the last 24 hours, sorted by `created_at DESC`, paginated 100 per page." Renders within 2.5s on 4G (NFR1.2). Skeleton screens cover any latency above 250ms.

3. **AC#3 — `AuditLogFilter` component (per Sally's Custom Component #15):** Left sidebar (320px) on desktop / collapses to top sheet on tablet (<1024px) / full-screen modal on mobile (<768px). Fields:
   - **Principal type** — three checkboxes (User / Consumer / System); default all checked; maps to `audit_logs` principal-exclusive CHECK constraint per Decision 5.4 (User = `user_id IS NOT NULL`; Consumer = `consumer_id IS NOT NULL`; System = both NULL)
   - **Actor** — combobox autocomplete searching both `users.full_name` and `api_consumers.name`; results show icon prefix (`User` / `Server`) + name
   - **Action** — multi-select chips; server-provided list of distinct `action` values; selected chips highlighted Primary-600
   - **Target resource** — single-select dropdown of distinct `target_resource` values
   - **Date range** — two date pickers + quick presets (Today / 7d / 30d / 90d)
   - Bottom: [Reset] + [Apply] buttons; Apply debounced 300ms
   - Filter conflict guard: if both User AND Consumer unchecked, inline warning + Apply disabled

4. **AC#4 — Results table:** Right pane, fluid width. Columns:
   - Timestamp (sortable, default DESC)
   - Principal — icon (`User` / `Server` / placeholder for System) + resolved name (`users.full_name` OR `api_consumers.name` OR literal "System")
   - Action
   - Target Resource
   - Target ID (truncated with full-value tooltip on hover)
   - Outcome (success / failure inferred from `meta.status_code` if present)
   - Sortable by Timestamp, Principal, Action

5. **AC#5 — Pagination:** Cursor-based (not offset) — constant-time at page 1, 100, 1000. UI shows "Page N" indicator + Previous/Next/First/Last buttons. Page size = 100. Cursor encoded in URL (shareable).

6. **AC#6 — URL-routed filter state:** Active filters persist in URL query params (e.g. `?principal=user,consumer&action=create,delete&from=2026-04-01&to=2026-04-25&cursor=...`). Investigations are shareable / bookmarkable. PII redaction is enforced at the API layer regardless of URL access — sharing a URL never leaks data the recipient is not authorised to see.

7. **AC#7 — Detail panel on row click:** Slide-in overlay from right (not modal — investigator can keep scrolling underlying table). Contents:
   - Full event payload pretty-printed (JSON viewer)
   - For state-change events (e.g. `respondent.updated`): inline before/after diff with changed fields highlighted
   - Cross-reference links: principal name → "View all events from this consumer in last 7 days" (preset filter); target ID → respondent / submission / consumer detail page (when applicable)
   - Close: ESC key, click outside, or X button; focus returns to originating row

8. **AC#8 — CSV export:**
   - "Export CSV" button above the results table
   - Filename includes filter signature: `audit_log_<principal>_<resource>_<from>--<to>.csv` (slugged and date-stamped)
   - First row of CSV: filter signature + export timestamp + exporting actor (header row, with `#` comment prefix per CSV convention)
   - Subsequent rows: full audit event records
   - Server-enforced cap: 10,000 rows per export; larger queries return `413 EXPORT_TOO_LARGE` with helpful message ("Refine filters or use the API for bulk export")
   - **Export action is itself audit-logged** with `action: 'audit_log.exported'`, `meta: { filter_signature, row_count, exporting_actor_id }`

9. **AC#9 — Backend endpoints:**
   - `GET /api/v1/admin/audit-logs` — list with filter + cursor pagination (super-admin only, rate-limited 60/min)
   - `GET /api/v1/admin/audit-logs/:id` — single event detail (super-admin only)
   - `POST /api/v1/admin/audit-logs/export` — CSV export (super-admin only, rate-limited 10/hour, max 10K rows)
   - `GET /api/v1/admin/audit-logs/distinct/:field` — distinct values for `action` / `target_resource` (used by filter component)
   - `GET /api/v1/admin/audit-logs/principals/search?q=...` — actor autocomplete (searches users + api_consumers)
   - All endpoints validate `req.user.role === 'super_admin'`; all hit existing audit_logs table

10. **AC#10 — Composite indexes added in this story's migration (Akintola-risk Move 3 prerequisite):**
    - `CREATE INDEX idx_audit_logs_actor_created_at ON audit_logs(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;`
    - `CREATE INDEX idx_audit_logs_consumer_created_at ON audit_logs(consumer_id, created_at DESC) WHERE consumer_id IS NOT NULL;`
    - `CREATE INDEX idx_audit_logs_target_created_at ON audit_logs(target_resource, target_id, created_at DESC);`
    - `CREATE INDEX idx_audit_logs_action_created_at ON audit_logs(action, created_at DESC);`
    - Existing indexes preserved.

11. **AC#11 — Akintola-risk Move 3: audit-viewer-at-1M-rows scale verification:**
    - Seed 1,000,000 `audit_logs` rows using the **Story 11-1 seeder** (`apps/api/src/db/seed-projected-scale.ts`) — reuse the same scratch DB if possible; re-seed if needed
    - Mix of principal types: ~70% user, ~20% consumer, ~10% system (matches expected post-Epic-10 distribution)
    - Run `EXPLAIN (ANALYZE, BUFFERS)` on:
      - List query with no filter → p95 < 500ms
      - List query with single filter (principal=consumer) → p95 < 500ms
      - List query with two filters (principal=consumer + target_resource=respondents) → p95 < 800ms
      - List query with three filters + date range → p95 < 1000ms (acceptable degradation)
      - Pagination: cursor at page 1 / 100 / 1000 → constant-time (no degradation)
    - Capture EXPLAIN output as `apps/api/src/db/explain-reports/9-11-audit-viewer.md`
    - **If any query fails the threshold:** add the required index in this story's migration AND document in Dev Notes; do NOT defer to a follow-up story (audit viewer is the FRC item #5 prerequisite)

12. **AC#12 — Tests:**
    - Service tests: filter composition, cursor pagination, principal-resolution joins, export CSV builder
    - Route integration tests: auth guard (non-super-admin returns 403), filter param parsing, cursor encoding, export rate-limit, principal-exclusive enforcement
    - DB constraint tests: principal-exclusive CHECK rejects mixed-principal writes
    - Web component tests: `AuditLogFilter` (each field, reset, apply); results table (sort, click-to-detail); export CSV trigger
    - E2E test: investigator filters → exports → verifies CSV filename + first row + audit log entry recording the export
    - Existing 4,191-test baseline maintained or grown
    - **Scale verification test (AC#11) is a separate `pnpm` script, not in CI:** `pnpm --filter @oslsr/api seed:audit-1m && pnpm --filter @oslsr/api test:audit-viewer-scale`

## Dependencies

- **Epic 6 audit infrastructure (DONE)** — provides the write-side audit_logs table; this story is the read-side
- **Story 11-1 (HARD)** — `audit_logs.consumer_id` column + principal-exclusive CHECK constraint live in 11-1's migration; seeder infrastructure (`seed-projected-scale.ts`) used for AC#11
- **Architecture Decision 5.4 (audit-log principal dualism)** — design baseline
- **UX Custom Component #15 AuditLogFilter + Journey 6** — UI specs

**Unblocks:**
- **Epic 10 PII-scope partner-API release** — Story 10-1 cannot provision any `submissions:read_pii` scope until this story is live (per ADR-019 hard prerequisite); Story 10-6 Consumer Audit Dashboard builds on this story's foundation

## Field Readiness Certificate Impact

Not directly on FRC §5.3.1 (Tier B per epics.md table). However, **HARD prerequisite for Epic 10 PII scope** which is post-field. Field survey can launch without this story; Epic 10 cannot ship without it.

## Tasks / Subtasks

### Task 1 — Backend: composite indexes migration (AC#10)

1.1. Create Drizzle migration with the four composite indexes per AC#10.
1.2. Run on scratch DB; verify with `\d audit_logs` that indexes are created and have correct WHERE clauses (partial indexes on `actor_id IS NOT NULL` and `consumer_id IS NOT NULL`).
1.3. Migration should be idempotent (`CREATE INDEX IF NOT EXISTS`).

### Task 2 — Backend: audit log service + endpoints (AC#9)

2.1. Create `apps/api/src/services/audit-log-viewer.service.ts` — query builder with filter composition + cursor pagination + principal-resolution joins.
2.2. Create `apps/api/src/routes/audit-log-viewer.routes.ts` — 5 endpoints per AC#9.
2.3. Auth middleware: super-admin only; rate limits per AC#9.
2.4. CSV export builder — uses `csv-stringify` (already in stack? add if not); 10K row cap; filter-signature in filename + first comment row.
2.5. Audit-log-the-export (recursive but desired): every export writes a new `audit_logs` row with `action: 'audit_log.exported'`.
2.6. Principal autocomplete: full-text or trigram search on `users.full_name` + `api_consumers.name`; cap 20 results.
2.7. Tests per AC#12.

### Task 3 — Frontend: Audit Log page + sidebar nav (AC#1, AC#2)

3.1. Add sidebar nav item to `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Audit Log between System Health and Settings; super-admin only; icon Lucide `ScrollText`.
3.2. New route `/dashboard/admin/audit-log` (TanStack Router).
3.3. New page `apps/web/src/features/audit-log/pages/AuditLogPage.tsx` — split-screen layout (filter sidebar + results table).
3.4. Default load: last 24h, paginated 100/page, sorted DESC by timestamp.
3.5. TanStack Query `useAuditLogs` hook with cursor pagination + URL state sync.
3.6. Skeleton screens for loading states.

### Task 4 — Frontend: AuditLogFilter component (AC#3)

4.1. New component `apps/web/src/features/audit-log/components/AuditLogFilter.tsx` per Sally's spec.
4.2. Principal type: 3-checkbox group with conflict guard.
4.3. Actor: combobox autocomplete using `useDebouncedCallback` 300ms + `usePrincipalSearch` hook hitting `/api/v1/admin/audit-logs/principals/search`.
4.4. Action: multi-select chips using existing shadcn/ui patterns; data from `usDistinctActions` hook.
4.5. Target resource: single-select dropdown; data from `useDistinctTargetResources` hook.
4.6. Date range: shadcn/ui DatePicker + quick-preset buttons; preset selection overrides manual range.
4.7. URL state sync via TanStack Router search params.
4.8. Responsive: sidebar (≥1024px) / top sheet (768-1023px) / full-screen modal (<768px).

### Task 5 — Frontend: Results table + detail panel (AC#4, AC#7)

5.1. New component `AuditLogResultsTable.tsx` — uses shadcn/ui DataTable; columns per AC#4.
5.2. Sortable columns via TanStack Table.
5.3. Row click opens `AuditLogDetailDrawer.tsx` (slide-in from right).
5.4. Detail drawer: JSON viewer (use `react-json-view` or simple `<pre>` with syntax highlighting); before/after diff for state-change events using `jsondiffpatch` or simple side-by-side.
5.5. Cross-reference links: principal name → preset filter; target ID → entity detail page.
5.6. ESC closes; focus management per Sally's accessibility spec.

### Task 6 — Frontend: CSV export (AC#8)

6.1. Export button above table.
6.2. On click: hit `POST /api/v1/admin/audit-logs/export` with current filter state; server returns CSV blob + Content-Disposition header with filename.
6.3. Browser download via `<a download>` trick.
6.4. Show toast "Export complete: N rows" or error if 413.
6.5. Rate-limit handling: if 429, show "Export rate limited; try again at <retry-after>".

### Task 7 — AC#11 Akintola-risk scale verification

7.1. Reuse the Story 11-1 `seed-projected-scale.ts` seeder; ensure it produces 1M `audit_logs` rows with the principal-type mix per AC#11 (extend if not already configurable).
7.2. Add `pnpm --filter @oslsr/api seed:audit-1m` and `pnpm --filter @oslsr/api test:audit-viewer-scale` scripts.
7.3. Run EXPLAIN (ANALYZE, BUFFERS) on the queries per AC#11 thresholds.
7.4. If any query exceeds threshold: add the required index in this story's migration (Task 1); re-run; document.
7.5. Capture output as `apps/api/src/db/explain-reports/9-11-audit-viewer.md` and commit.

### Task 8 — Tests + sprint-status (AC#12)

8.1. Add tests per AC#12 categories.
8.2. Run full suite — verify baseline + new tests; target 4,200+ tests.
8.3. Update `sprint-status.yaml`: `9-11-admin-audit-log-viewer: in-progress` → `review` at PR → `done` at merge.

## Technical Notes

### Principal-resolution join strategy

Each audit_logs row has nullable `actor_id` (FK → users) AND nullable `consumer_id` (FK → api_consumers) per Decision 5.4. The list query needs to resolve both into a display name. Two options:

- **Option A: LEFT JOIN both tables in the list query.** Simple, one round-trip; costs an extra index lookup per row. With composite indexes on `(actor_id, created_at)` + `(consumer_id, created_at)` per AC#10, the joins are cheap.
- **Option B: Return raw IDs in list, resolve names in a separate batched query (DataLoader pattern).** More complex; pays off only at very high cardinality.

**Pick Option A.** At 1M rows + page size 100, the LEFT JOIN cost is in the noise vs the cursor lookup itself.

### Cursor pagination implementation

Use `(created_at, id)` composite cursor encoded as base64url. WHERE clause becomes `(created_at, id) < ($cursor_created_at, $cursor_id)` for descending sort. Stable across inserts (new rows always sort to position 0 in DESC; existing pagination is unaffected by inserts after the cursor point).

### CSP-compliant JSON viewer

If using `react-json-view`, verify it does not eval inline scripts (CSP would block). Alternative: simple `<pre>{JSON.stringify(payload, null, 2)}</pre>` with manual syntax highlighting via a lightweight tokenizer.

### Export filename signature format

Slug rules: lowercase, replace spaces with `-`, drop special chars. Format: `audit_log_<principal-slug>_<resource-slug>_<from>--<to>.csv`. Example: `audit_log_consumer_respondents_2026-04-24--2026-04-25.csv`. If no filter applied: `audit_log_all_<from>--<to>.csv`. Server-side validation ensures no path traversal.

### Akintola-risk Move 3 — what success looks like

Composite indexes per AC#10 should make the queries land on Index Scan or Index Only Scan in EXPLAIN ANALYZE — never Seq Scan on the 1M-row table. Cost should be <1000 for single-filter queries, <5000 for multi-filter. If any query degrades to Seq Scan, the index strategy is wrong — investigate (likely cause: filter on a non-indexed column).

### Why this is a hard prerequisite for Epic 10 PII scope

Per ADR-019: partner-API access to row-level PII (`submissions:read_pii` scope) without a working audit-read surface is an NDPA hole. The compliance position is "every PII access is logged and queryable by Super Admin within minutes." Without this story, the queryable-by-Super-Admin part is a manual psql query — not credible at audit time. Epic 10-1 (Consumer Auth) must check this story is `done` before allowing any `submissions:read_pii` scope provisioning.

## Risks

1. **AC#11 scale verification might fail.** If composite indexes are insufficient at 1M rows, queries land on Seq Scan and p95 blows past the threshold. Mitigation: AC#11 explicitly says do NOT defer — fix in this story's migration. Acceptable to add additional indexes (e.g. covering indexes including the SELECT columns).
2. **CSV export DoS surface.** Without a 10K row cap + rate limit, an investigator could trigger a multi-GB export and wedge the API. Mitigation: AC#8 caps at 10K rows + rate limits 10/hour; export action is itself audit-logged so abuse is traceable.
3. **Cursor pagination edge cases.** Pagination drift if rows are deleted between page loads. Mitigation: audit_logs is append-only per NFR8.3 — rows are never deleted; cursor stability is guaranteed.
4. **Principal-resolution PII leakage in autocomplete.** The actor autocomplete searches `users.full_name` — exposing names of all users to the super-admin. Mitigation: super-admin already has user-list access (existing User Management UI); no additional surface.
5. **Story 11-1 dependency on `consumer_id` column.** If 11-1 is delayed, this story can ship without the consumer_id principal type (User + System only) — but the audit viewer is incomplete. Mitigation: pin sequencing to ensure 11-1 lands first.

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Backend (created):**
- `apps/api/src/services/audit-log-viewer.service.ts`
- `apps/api/src/routes/audit-log-viewer.routes.ts`
- `apps/api/drizzle/NNNN_*.sql` — migration with composite indexes per AC#10
- `apps/api/src/db/explain-reports/9-11-audit-viewer.md` — AC#11 evidence
- Tests: `*.test.ts`

**Backend (modified):**
- `apps/api/src/routes/index.ts` — register new routes
- `apps/api/package.json` — add `seed:audit-1m` + `test:audit-viewer-scale` scripts

**Frontend (created):**
- `apps/web/src/features/audit-log/pages/AuditLogPage.tsx`
- `apps/web/src/features/audit-log/components/AuditLogFilter.tsx`
- `apps/web/src/features/audit-log/components/AuditLogResultsTable.tsx`
- `apps/web/src/features/audit-log/components/AuditLogDetailDrawer.tsx`
- `apps/web/src/features/audit-log/api/audit-log.ts` — TanStack Query hooks
- Tests: component + integration

**Frontend (modified):**
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Audit Log nav item
- Routing config

**Other:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story created by Bob (SM) per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 12 ACs covering super-admin Audit Log page + AuditLogFilter component + cursor pagination + URL-routed filter state + CSV export with audit-of-export + composite indexes + Akintola-risk Move 3 (1M-row scale verification) + tests. Hard prerequisite for Epic 10 PII-scope release. | Surfaces existing Epic 6 write-side audit infrastructure to enable NDPA-credible Super Admin investigation. Without this, Epic 10 PII scope is dark. |

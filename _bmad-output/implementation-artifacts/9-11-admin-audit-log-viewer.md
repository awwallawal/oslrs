# Story 9.11: Admin Audit Log Viewer

Status: ready-for-dev

<!--
Created 2026-04-25 by impostor-SM agent per SCP-2026-04-22 §A.5.

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

Validation pass 2026-04-30 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template; 1 factual URL bug fixed (AC#1 URL `/dashboard/admin/audit-log` → `/dashboard/super-admin/audit-log` matching existing `roleRouteMap` at `sidebarConfig.ts:60-68`); sidebar position clarified (now literally between System Health and Settings post `prep-settings-landing-and-feature-flags`); 3 micro-improvements added (icon-choice note, Reveal Analytics relationship callout, future cross-role audit visibility flag).
-->

## Story

As a **Super Admin investigating a security or compliance concern**,
I want **a list + filter + paginate UI over the audit log that shows both human-actor and machine-consumer principals, supports multi-dimensional filtering (principal type / actor / action / target / time range), and exports filtered subsets as CSV with the filter signature baked in**,
so that **I can answer compliance questions in <30 seconds without opening psql, and so the Epic 10 PII-scope partner-API can launch with credible NDPA oversight that the existing write-only audit infrastructure could not provide**.

## Acceptance Criteria

1. **AC#1 — Audit Log page at `/dashboard/super-admin/audit-log`:** New super-admin-only page accessible via sidebar nav item **Audit Log**. Position: **between System Health and Settings** per Sally's Navigation Patterns spec (Settings nav item is added by the companion `prep-settings-landing-and-feature-flags` story). Strict route isolation (per ADR-016) — non-super-admin users hitting the URL are redirected to their role's dashboard root with toast "This page is for Super Admins only." Sidebar nav item gated on `super_admin` role at the menu-config level. URL pattern `/dashboard/super-admin/audit-log` matches existing `roleRouteMap` convention at `sidebarConfig.ts:60-68` (every super-admin URL uses `/dashboard/super-admin/X`).

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

## Tasks / Subtasks

- [ ] **Task 1 — Backend: composite indexes migration** (AC: #10)
  - [ ] 1.1 Create Drizzle migration with the four composite indexes per AC#10
  - [ ] 1.2 Run on scratch DB; verify with `\d audit_logs` that indexes are created and have correct WHERE clauses (partial indexes on `actor_id IS NOT NULL` and `consumer_id IS NOT NULL`)
  - [ ] 1.3 Migration should be idempotent (`CREATE INDEX IF NOT EXISTS`); reference clone pattern at `apps/api/drizzle/0005_create_team_assignments.sql:21` for partial-index syntax
  - [ ] 1.4 Migration file location: `apps/api/drizzle/<NNNN>_<descriptive_name>.sql` — sequential 4-digit prefix; confirm next number at impl time via `ls apps/api/drizzle/`. Latest as of 2026-04-30 is `0007_audit_logs_immutable.sql`. Multiple stories in flight may claim the same number; coordinate at impl time.

- [ ] **Task 2 — Backend: audit log service + endpoints** (AC: #9)
  - [ ] 2.1 Create `apps/api/src/services/audit-log-viewer.service.ts` — query builder with filter composition + cursor pagination + principal-resolution joins
  - [ ] 2.2 Create `apps/api/src/routes/audit-log-viewer.routes.ts` — 5 endpoints per AC#9. **NOTE:** existing `apps/api/src/routes/audit.routes.ts` is for write-side audit endpoints (Story 6-1); this new file is read-side viewer. Two separate flat files match the convention pattern (`fraud-thresholds.routes.ts`, `fraud-detections.routes.ts`, `marketplace.routes.ts` etc.)
  - [ ] 2.3 Auth middleware: super-admin only via existing `authenticate` + `authorize(UserRole.SUPER_ADMIN)` pattern (clone from `apps/api/src/routes/admin.routes.ts:24-27`); rate limits per AC#9
  - [ ] 2.4 CSV export builder — uses `csv-stringify` (verify in stack; add if not); 10K row cap; filter-signature in filename + first comment row
  - [ ] 2.5 Audit-log-the-export (recursive but desired): every export writes a new `audit_logs` row with `action: 'audit_log.exported'` via `AuditService.logAction()` at `apps/api/src/services/audit.service.ts:226`; add `AUDIT_LOG_EXPORTED: 'audit_log.exported'` to `AUDIT_ACTIONS` const at `audit.service.ts:35-64`
  - [ ] 2.6 Principal autocomplete: full-text or trigram search on `users.full_name` + `api_consumers.name`; cap 20 results
  - [ ] 2.7 Tests per AC#12

- [ ] **Task 3 — Frontend: Audit Log page + sidebar nav** (AC: #1, #2)
  - [ ] 3.1 Add sidebar nav item to `apps/web/src/features/dashboard/config/sidebarConfig.ts:142-156` super_admin array — Audit Log between System Health (existing index 12, last) and Settings (added by `prep-settings-landing-and-feature-flags` companion story); icon `ScrollText` from lucide-react. **Coordination:** if `prep-settings-landing` lands first, append Audit Log AFTER System Health and BEFORE Settings (insert at index 13). If 9-11 lands first, append after System Health (becomes new last item; Settings story rebases and inserts after).
  - [ ] 3.2 New route `/dashboard/super-admin/audit-log` (TanStack Router) — matches existing `roleRouteMap` convention at `sidebarConfig.ts:60-68` (NOT `/dashboard/admin/audit-log` — that pattern doesn't exist in the codebase)
  - [ ] 3.3 New page `apps/web/src/features/audit-log/pages/AuditLogPage.tsx` (NEW feature directory) — split-screen layout (filter sidebar + results table)
  - [ ] 3.4 Default load: last 24h, paginated 100/page, sorted DESC by timestamp
  - [ ] 3.5 TanStack Query `useAuditLogs` hook with cursor pagination + URL state sync
  - [ ] 3.6 Skeleton screens for loading states

- [ ] **Task 4 — Frontend: AuditLogFilter component** (AC: #3)
  - [ ] 4.1 New component `apps/web/src/features/audit-log/components/AuditLogFilter.tsx` per Sally's spec
  - [ ] 4.2 Principal type: 3-checkbox group with conflict guard
  - [ ] 4.3 Actor: combobox autocomplete using `useDebouncedCallback` 300ms + `usePrincipalSearch` hook hitting `/api/v1/admin/audit-logs/principals/search`
  - [ ] 4.4 Action: multi-select chips using existing shadcn/ui patterns; data from `useDistinctActions` hook
  - [ ] 4.5 Target resource: single-select dropdown; data from `useDistinctTargetResources` hook
  - [ ] 4.6 Date range: shadcn/ui DatePicker + quick-preset buttons; preset selection overrides manual range
  - [ ] 4.7 URL state sync via TanStack Router search params
  - [ ] 4.8 Responsive: sidebar (≥1024px) / top sheet (768-1023px) / full-screen modal (<768px)

- [ ] **Task 5 — Frontend: Results table + detail panel** (AC: #4, #7)
  - [ ] 5.1 New component `apps/web/src/features/audit-log/components/AuditLogResultsTable.tsx` — uses shadcn/ui DataTable; columns per AC#4
  - [ ] 5.2 Sortable columns via TanStack Table
  - [ ] 5.3 Row click opens `apps/web/src/features/audit-log/components/AuditLogDetailDrawer.tsx` (slide-in from right)
  - [ ] 5.4 Detail drawer: JSON viewer (use lightweight `<pre>` with manual syntax highlighting via tokenizer — NOT `react-json-view` which may eval inline scripts and trip CSP); before/after diff for state-change events using `jsondiffpatch` or simple side-by-side
  - [ ] 5.5 Cross-reference links: principal name → preset filter; target ID → entity detail page
  - [ ] 5.6 ESC closes; focus management per Sally's accessibility spec

- [ ] **Task 6 — Frontend: CSV export** (AC: #8)
  - [ ] 6.1 Export button above table
  - [ ] 6.2 On click: hit `POST /api/v1/admin/audit-logs/export` with current filter state; server returns CSV blob + Content-Disposition header with filename
  - [ ] 6.3 Browser download via `<a download>` trick
  - [ ] 6.4 Show toast "Export complete: N rows" or error if 413
  - [ ] 6.5 Rate-limit handling: if 429, show "Export rate limited; try again at <retry-after>"

- [ ] **Task 7 — AC#11 Akintola-risk scale verification** (AC: #11)
  - [ ] 7.1 Reuse the Story 11-1 `seed-projected-scale.ts` seeder (created at `apps/api/src/db/seed-projected-scale.ts` per 11-1 Task 2.5); ensure it produces 1M `audit_logs` rows with the principal-type mix per AC#11 (extend if not already configurable)
  - [ ] 7.2 Add `pnpm --filter @oslsr/api seed:audit-1m` and `pnpm --filter @oslsr/api test:audit-viewer-scale` scripts to `apps/api/package.json`
  - [ ] 7.3 Run EXPLAIN (ANALYZE, BUFFERS) on the queries per AC#11 thresholds
  - [ ] 7.4 If any query exceeds threshold: add the required index in this story's migration (Task 1); re-run; document
  - [ ] 7.5 Capture output as `apps/api/src/db/explain-reports/9-11-audit-viewer.md` (directory created by Story 11-1; verify exists at impl time) and commit

- [ ] **Task 8 — Tests + sprint-status** (AC: #12)
  - [ ] 8.1 Add tests per AC#12 categories
  - [ ] 8.2 Run full suite — verify baseline + new tests; target 4,200+ tests
  - [ ] 8.3 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `9-11-admin-audit-log-viewer: in-progress` → `review` at PR → `done` at merge

- [ ] **Task 9 — Code review** (cross-cutting AC: all)
  - [ ] 9.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree (per the existing "code review before commit" project pattern in MEMORY.md `feedback_review_before_commit.md`)
  - [ ] 9.2 Auto-fix all High/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI)
  - [ ] 9.3 Only after code review passes, commit and mark status `review`

## Dev Notes

### Dependencies

- **Epic 6 audit infrastructure (DONE)** — provides the write-side audit_logs table; this story is the read-side
- **Story 11-1 (HARD)** — `audit_logs.consumer_id` column + principal-exclusive CHECK constraint live in 11-1's migration; seeder infrastructure (`seed-projected-scale.ts`) used for AC#11
- **Architecture Decision 5.4 (audit-log principal dualism)** — design baseline
- **UX Custom Component #15 AuditLogFilter + Journey 6** — UI specs

**Soft coordination:**
- **`prep-settings-landing-and-feature-flags`** — adds Settings sidebar nav entry; this story's AC#1 sidebar position becomes literal "between System Health and Settings" once that story lands. If `prep-settings-landing` lands FIRST, this story inserts at index 13 (between). If this story lands FIRST, append after System Health; Settings story rebases.

**Unblocks:**
- **Epic 10 PII-scope partner-API release** — Story 10-1 cannot provision any `submissions:read_pii` scope until this story is live (per ADR-019 hard prerequisite); Story 10-6 Consumer Audit Dashboard builds on this story's foundation

### Field Readiness Certificate Impact

Not directly on FRC §5.3.1 (Tier B per epics.md table). However, **HARD prerequisite for Epic 10 PII scope** which is post-field. Field survey can launch without this story; Epic 10 cannot ship without it.

### Principal-resolution join strategy

Each audit_logs row has nullable `actor_id` (FK → users) AND nullable `consumer_id` (FK → api_consumers) per Decision 5.4. The list query needs to resolve both into a display name. Two options:

- **Option A: LEFT JOIN both tables in the list query.** Simple, one round-trip; costs an extra index lookup per row. With composite indexes on `(actor_id, created_at)` + `(consumer_id, created_at)` per AC#10, the joins are cheap.
- **Option B: Return raw IDs in list, resolve names in a separate batched query (DataLoader pattern).** More complex; pays off only at very high cardinality.

**Pick Option A.** At 1M rows + page size 100, the LEFT JOIN cost is in the noise vs the cursor lookup itself.

### Cursor pagination implementation

Use `(created_at, id)` composite cursor encoded as base64url. WHERE clause becomes `(created_at, id) < ($cursor_created_at, $cursor_id)` for descending sort. Stable across inserts (new rows always sort to position 0 in DESC; existing pagination is unaffected by inserts after the cursor point).

### CSP-compliant JSON viewer

If using `react-json-view`, verify it does not eval inline scripts (CSP would block — Story 9-7 enforces strict CSP via nginx mirror). Alternative: simple `<pre>{JSON.stringify(payload, null, 2)}</pre>` with manual syntax highlighting via a lightweight tokenizer. **Pick the simple `<pre>` path** unless `react-json-view` is verified CSP-safe.

### Export filename signature format

Slug rules: lowercase, replace spaces with `-`, drop special chars. Format: `audit_log_<principal-slug>_<resource-slug>_<from>--<to>.csv`. Example: `audit_log_consumer_respondents_2026-04-24--2026-04-25.csv`. If no filter applied: `audit_log_all_<from>--<to>.csv`. Server-side validation ensures no path traversal.

### Akintola-risk Move 3 — what success looks like

Composite indexes per AC#10 should make the queries land on Index Scan or Index Only Scan in EXPLAIN ANALYZE — never Seq Scan on the 1M-row table. Cost should be <1000 for single-filter queries, <5000 for multi-filter. If any query degrades to Seq Scan, the index strategy is wrong — investigate (likely cause: filter on a non-indexed column).

### Why this is a hard prerequisite for Epic 10 PII scope

Per ADR-019: partner-API access to row-level PII (`submissions:read_pii` scope) without a working audit-read surface is an NDPA hole. The compliance position is "every PII access is logged and queryable by Super Admin within minutes." Without this story, the queryable-by-Super-Admin part is a manual psql query — not credible at audit time. Epic 10-1 (Consumer Auth) must check this story is `done` before allowing any `submissions:read_pii` scope provisioning.

### Relationship to existing "Reveal Analytics" page

The super-admin sidebar already has a **"Reveal Analytics"** entry (`sidebarConfig.ts:152` — `/dashboard/super-admin/reveal-analytics`) that surfaces a topic-specific audit slice (who revealed which contact info, when, with what justification). The new Audit Log Viewer is the **global** view across all audit-log actions.

**They are complementary, not redundant.** Reveal Analytics has its own filters + aggregations + business-focused dashboards; Audit Log Viewer is a generic event list with multi-dimensional filtering. Dev agent should NOT consolidate them — different use cases, different mental models.

### Future enhancement — cross-role audit visibility (out of scope)

Currently audit-log is super-admin only (per AC#1 + sidebar gating in `super_admin` keyed array). Future enhancement could expose RBAC-filtered slices to other roles:
- Supervisors: their own actions + their team's actions
- Assessors: their own assessment audit trail
- Public users: their own consent + access events (NDPA Article 14 right of access)

**Not in this story.** Tracked here so the dev agent doesn't over-engineer the auth guard or build affordances that imply cross-role access. Future story when/if needed.

### Risks

1. **AC#11 scale verification might fail.** If composite indexes are insufficient at 1M rows, queries land on Seq Scan and p95 blows past the threshold. Mitigation: AC#11 explicitly says do NOT defer — fix in this story's migration. Acceptable to add additional indexes (e.g. covering indexes including the SELECT columns).
2. **CSV export DoS surface.** Without a 10K row cap + rate limit, an investigator could trigger a multi-GB export and wedge the API. Mitigation: AC#8 caps at 10K rows + rate limits 10/hour; export action is itself audit-logged so abuse is traceable.
3. **Cursor pagination edge cases.** Pagination drift if rows are deleted between page loads. Mitigation: audit_logs is append-only per NFR8.3 — rows are never deleted; cursor stability is guaranteed.
4. **Principal-resolution PII leakage in autocomplete.** The actor autocomplete searches `users.full_name` — exposing names of all users to the super-admin. Mitigation: super-admin already has user-list access (existing User Management UI); no additional surface.
5. **Story 11-1 dependency on `consumer_id` column.** If 11-1 is delayed, this story can ship without the consumer_id principal type (User + System only) — but the audit viewer is incomplete. Mitigation: pin sequencing to ensure 11-1 lands first.
6. **Sidebar position coordination with `prep-settings-landing`.** Both stories add NavItems to the super_admin array. Mitigation: insertions are commutative within the array; whichever story commits first claims its slot; second rebases and appends. No merge conflict expected (different array indices).

### Project Structure Notes

- **New feature directory** `apps/web/src/features/audit-log/` with `pages/`, `components/`, `api/` subdirs (per existing feature layout: `staff/`, `marketplace/`, `forms/`, etc.). Audit log is a substantial-enough surface (filter component + results table + detail drawer + 5+ TanStack Query hooks) to warrant its own dir, mirroring the pattern set by `apps/web/src/features/settings/` (companion `prep-settings-landing` story) and `apps/web/src/features/registration/` (Story 9-12 retrofit).
- **Backend triad pattern:** `apps/api/src/services/audit-log-viewer.service.ts` (query builder + filter composition) + `apps/api/src/routes/audit-log-viewer.routes.ts` (HTTP layer). NO new lib/ entry needed (read-only surface; no shared accessor abstraction required). Same pattern as `staff.service.ts` + `staff.routes.ts`.
- **Routes file naming:** existing `apps/api/src/routes/audit.routes.ts` is the WRITE-side audit endpoint (Story 6-1 hash chain verification + emergency endpoints). New file `audit-log-viewer.routes.ts` is the READ-side viewer. Two separate flat files; clean naming distinguishes the two surfaces.
- **Drizzle migrations** at `apps/api/drizzle/<NNNN>_<name>.sql` (sequential 4-digit prefix). Multiple stories in flight (9-13, 11-1, prep-input-sanitisation-layer, prep-settings-landing, this story) may claim the same number; coordinate at impl time. Latest as of 2026-04-30 is `0007_audit_logs_immutable.sql`.
- **Partial-unique-index pattern** (clone reference for AC#10 partial indexes on `actor_id IS NOT NULL` and `consumer_id IS NOT NULL`): `apps/api/drizzle/0005_create_team_assignments.sql:21` — `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE` syntax already proven in codebase.
- **Audit logging** via `AuditService.logAction()` (`apps/api/src/services/audit.service.ts:226`) for the AC#8 `audit_log.exported` event. New action `AUDIT_LOG_EXPORTED: 'audit_log.exported'` extends the typed const at `audit.service.ts:35-64`.
- **Sidebar config** at `apps/web/src/features/dashboard/config/sidebarConfig.ts:142-156` (super_admin array). All super-admin URLs use `/dashboard/super-admin/X` pattern (per `roleRouteMap` at `sidebarConfig.ts:60-68`). **Story v1's URL `/dashboard/admin/audit-log` was a typo** — that pattern doesn't exist anywhere in the codebase. Correct URL is `/dashboard/super-admin/audit-log`.
- **Sidebar icon choice:** AC#1 specifies `ScrollText` from lucide-react. Equally valid alternatives that follow the lucide naming convention: `History` (semantic match for "audit log over time"), `Activity` (already used by System Health), `FileText` (already used elsewhere), `BookOpen` (less common). **Keep `ScrollText`** — distinctive, doesn't collide with existing icons in sidebarConfig, semantically reasonable ("scroll of records" mental model).
- **CSP discipline:** Story 9-7 enforces strict CSP via nginx mirror; any frontend library that uses `eval`, inline scripts, or dynamic `Function()` will be blocked. Affects choice of JSON viewer in AC#7 detail panel.
- **Frontend HTTP client** is `apps/web/src/lib/api-client.ts:31` — fetch-based, throws `ApiError`. NO axios.
- **TanStack Query convention** — feature-level api file at `apps/web/src/features/audit-log/api/audit-log.api.ts`; hooks named `useAuditLogs`, `useAuditLogDetail`, `usePrincipalSearch`, `useDistinctActions`, `useDistinctTargetResources`, `useExportAuditLog`.
- **NEW directories created by this story:**
  - `apps/web/src/features/audit-log/` (with `pages/`, `components/`, `api/` subdirs)

### References

- Architecture ADR-018 (multi-source registry — principal-exclusive CHECK on audit_logs): [Source: _bmad-output/planning-artifacts/architecture.md:3137]
- Architecture ADR-019 (API consumer auth — DSA precondition + audit prerequisite for Epic 10 PII): [Source: _bmad-output/planning-artifacts/architecture.md:3179]
- Architecture Decision 5.4 (audit-log principal dualism — User vs Consumer vs System): [Source: _bmad-output/planning-artifacts/architecture.md Decision 5.4]
- Architecture Decision 5.5 (per-consumer rate-limit metrics — feeds AC#3 actor combobox): [Source: _bmad-output/planning-artifacts/architecture.md Decision 5.5]
- Audit logs schema (existing — this story consumes; AC#10 indexes target): [Source: apps/api/src/db/schema/audit.ts]
- Audit service `logAction` API (for AC#8 `audit_log.exported` event): [Source: apps/api/src/services/audit.service.ts:226]
- Audit service `AUDIT_ACTIONS` const (extend with `AUDIT_LOG_EXPORTED`): [Source: apps/api/src/services/audit.service.ts:35-64]
- Admin routes auth pattern (super-admin gate clone target for Task 2.3): [Source: apps/api/src/routes/admin.routes.ts:24-27]
- Existing audit routes (write-side; clarifies new file is read-side): [Source: apps/api/src/routes/audit.routes.ts]
- Sidebar config (append Audit Log NavItem; URL convention): [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts:60-68,142-156]
- Existing Reveal Analytics page (complementary, not redundant): [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts:152]
- Drizzle migration directory + naming convention: [Source: apps/api/drizzle/0007_audit_logs_immutable.sql]
- Partial unique index canonical pattern (clone for AC#10): [Source: apps/api/drizzle/0005_create_team_assignments.sql:21]
- Story 11-1 seeder dependency for AC#11 1M-row scale test: [Source: _bmad-output/implementation-artifacts/11-1-multi-source-registry-schema-foundation.md Task 2.5]
- Companion story for sidebar coordination: [Source: _bmad-output/implementation-artifacts/prep-settings-landing-and-feature-flags.md AC#6]
- Web HTTP client (TanStack Query hooks consume): [Source: apps/web/src/lib/api-client.ts:31]
- MEMORY.md key pattern: code review before commit: [Source: MEMORY.md "Process Patterns" + `feedback_review_before_commit.md`]
- MEMORY.md key pattern: integration tests use beforeAll/afterAll: [Source: MEMORY.md "Key Patterns"]

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation. Implementer must include:)_

- Sequential migration number claimed (`0008` / `0009` / `0010` / `0011` / `0012` depending on commit ordering relative to 9-13 + 11-1 + prep-input-sanitisation-layer + prep-settings-landing)
- Sidebar nav entry final position (between System Health and Settings if `prep-settings-landing` landed first; appended after System Health if this story landed first)
- AC#11 EXPLAIN ANALYZE summary table (5 query types × p95 thresholds; pass/fail per row)
- Any additional indexes added beyond AC#10 (if AC#11 forced extras)
- CSP-compliant JSON viewer choice (lightweight `<pre>` tokenizer vs verified `react-json-view`)
- Code review findings + fixes (cross-reference Review Follow-ups (AI) below)

### File List

**Backend (created):**
- `apps/api/src/services/audit-log-viewer.service.ts`
- `apps/api/src/routes/audit-log-viewer.routes.ts`
- `apps/api/drizzle/<NNNN>_*.sql` — migration with composite indexes per AC#10
- `apps/api/src/db/explain-reports/9-11-audit-viewer.md` — AC#11 evidence (directory created by Story 11-1)
- Tests: `*.test.ts`

**Backend (modified):**
- `apps/api/src/routes/index.ts` — register new routes under `/api/v1/admin/audit-logs`
- `apps/api/src/services/audit.service.ts` — extend `AUDIT_ACTIONS` const with `AUDIT_LOG_EXPORTED`
- `apps/api/package.json` — add `seed:audit-1m` + `test:audit-viewer-scale` scripts

**Frontend (created):**
- `apps/web/src/features/audit-log/pages/AuditLogPage.tsx`
- `apps/web/src/features/audit-log/components/AuditLogFilter.tsx`
- `apps/web/src/features/audit-log/components/AuditLogResultsTable.tsx`
- `apps/web/src/features/audit-log/components/AuditLogDetailDrawer.tsx`
- `apps/web/src/features/audit-log/api/audit-log.api.ts` — TanStack Query hooks
- Tests: component + integration

**Frontend (modified):**
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Audit Log nav item appended to `super_admin` array (position coordinated with `prep-settings-landing` per Task 3.1)
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` — update if asserts on array length
- TanStack Router config — add route `/dashboard/super-admin/audit-log`

**Other:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Out of scope (explicitly NOT modified):**
- Existing Reveal Analytics page at `apps/web/src/features/dashboard/...` — complementary surface, kept separate (per Dev Notes "Relationship to existing Reveal Analytics page")
- Cross-role audit visibility (supervisor / assessor / public-user slices) — future enhancement, not this story

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 12 ACs covering super-admin Audit Log page + AuditLogFilter component + cursor pagination + URL-routed filter state + CSV export with audit-of-export + composite indexes + Akintola-risk Move 3 (1M-row scale verification) + tests. Hard prerequisite for Epic 10 PII-scope release. | Surfaces existing Epic 6 write-side audit infrastructure to enable NDPA-credible Super Admin investigation. Without this, Epic 10 PII scope is dark. |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 7 subsections — Principal-resolution join strategy / Cursor pagination implementation / CSP-compliant JSON viewer / Export filename signature format / Akintola-risk Move 3 success criteria / Why hard prerequisite for Epic 10 PII scope / etc.), "Risks" under Dev Notes; converted task-as-headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks; added `### Project Structure Notes` subsection covering new feature dir / backend triad pattern / routes file naming distinction (read-side vs write-side) / partial-index clone pattern / sidebar URL convention / icon choice rationale / CSP discipline / TanStack Query naming; added `### References` subsection with 17 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record` as `### Change Log`; added `### Review Follow-ups (AI)` placeholder; added Task 9 (code review) per `feedback_review_before_commit.md`. **One factual bug fixed:** AC#1 URL `/dashboard/admin/audit-log` corrected to `/dashboard/super-admin/audit-log` matching existing `roleRouteMap` convention at `sidebarConfig.ts:60-68` (every super-admin URL uses `/dashboard/super-admin/X`; `/dashboard/admin/X` pattern doesn't exist anywhere in the codebase). **Sidebar position clarified:** "between System Health and Settings" instruction now literal — Settings nav item is added by companion story `prep-settings-landing-and-feature-flags`; coordination note added (Task 3.1) for commit-order independence (whichever lands first claims its slot; insertions are commutative). **Three micro-improvements added** per Awwal "make it better" directive: (a) icon-choice precision (Project Structure Notes documents `ScrollText` choice + viable alternatives `History` / `Activity` / `FileText` / `BookOpen`); (b) Reveal Analytics relationship callout (new Dev Notes section "Relationship to existing Reveal Analytics page" — they are complementary, not redundant; dev agent should NOT consolidate); (c) Cross-role audit visibility flagged as future enhancement (new Dev Notes section out-of-scope guard preventing dev agent from over-engineering the auth surface). All 12 ACs preserved verbatim including AC#10 composite indexes + AC#11 1M-row scale verification (Akintola-risk Move 3). | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as Stories 9-13 / prep-tsc / prep-build-off-vps / 11-1 / prep-input-sanitisation-layer / 10-5. One novel factual bug found this pass (URL prefix mismatch); 3 design-quality improvements applied (icon, Reveal Analytics relationship, cross-role future-enhancement guard). |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 9.)_

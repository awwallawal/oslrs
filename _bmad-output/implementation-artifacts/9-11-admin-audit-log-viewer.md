# Story 9.11: Admin Audit Log Viewer

Status: done

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

- [x] **Task 0 — Schema Down Payment** (Refined Option B+ — added 2026-05-03; closes scope gap from 11-1)
  - [x] 0.1 Create `apps/api/src/db/schema/api-consumers.ts` — production-shape (8 cols) per Story 10-1 AC#1; no `@oslsr/types` import per drizzle-kit constraint
  - [x] 0.2 Modify `apps/api/src/db/schema/audit.ts` — add `consumerId` column with FK to `api_consumers` ON DELETE SET NULL
  - [x] 0.3 Update schema barrel `apps/api/src/db/schema/index.ts` to export api-consumers BEFORE audit (FK resolution)
  - [x] 0.4 Create `apps/api/scripts/migrate-audit-principal-dualism-init.ts` — applies principal-exclusive CHECK + api_consumers status CHECK + organisation_type CHECK (Drizzle 0.45 cannot express CHECKs inline; pattern matches Story 11-1 migrate-init)
  - [x] 0.5 Wire new migrate-init runner into `.github/workflows/ci-cd.yml` deploy chain (auto-discovered locally by `db-push-full.ts` glob)
  - [x] 0.6 Create `apps/api/src/test/factories/api-consumer.factory.ts` — Story 10-1 will reuse this for its consumer-auth tests
  - [x] 0.7 Schema CHECK constraint test at `apps/api/src/db/schema/__tests__/audit-principal-dualism.test.ts` (5 tests passing — rejects mixed principal, rejects invalid status, rejects invalid org-type, accepts valid api_consumer, accepts consumer-only audit log via tx-rollback)

- [x] **Task 1 — Backend: composite indexes migration** (AC: #10)
  - [x] 1.1 Create Drizzle migration with the four composite indexes per AC#10 — landed in same `migrate-audit-principal-dualism-init.ts` as Task 0 for cohesion (all Story 9-11 raw-SQL contracts in one runner)
  - [x] 1.2 Run on scratch DB; verify with `\d audit_logs` that indexes are created and have correct WHERE clauses (partial indexes on `actor_id IS NOT NULL` and `consumer_id IS NOT NULL`) — VERIFIED via psql 2026-05-03
  - [x] 1.3 Migration is idempotent (`CREATE INDEX IF NOT EXISTS`)
  - [x] 1.4 Migration file landed in `apps/api/scripts/migrate-audit-principal-dualism-init.ts` rather than `apps/api/drizzle/<NNNN>_*.sql` — follows Story 11-1's umbrella pattern (Pitfall #28: Drizzle 0.45 cannot express CHECK constraints OR partial indexes; both go in migrate-init runners). Latest plain-SQL drizzle migration is `0010_multi_source_registry.sql`; raw-SQL contracts have moved to `apps/api/scripts/migrate-*-init.ts`
  - [x] 1.5 Bonus: `pg_trgm` extension + 2 GIN trigram indexes (`idx_users_full_name_trgm`, `idx_api_consumers_name_trgm`) for AC#9 principal autocomplete — added to same runner with graceful permission-denied fallback (logs operator escalation message + lets autocomplete fall back to plain ILIKE)

- [x] **Task 2 — Backend: audit log service + endpoints** (AC: #9)
  - [x] 2.1 Create `apps/api/src/services/audit-log-viewer.service.ts` — query builder with filter composition + cursor pagination (base64url `(created_at, id)` tuple) + LEFT JOIN principal-resolution (Option A per Dev Notes) + CSV export builder + `searchPrincipals` autocomplete + `ExportTooLargeError`
  - [x] 2.2 Create `apps/api/src/routes/audit-log-viewer.routes.ts` — 5 endpoints per AC#9 (list / detail / distinct/:field / principals/search / export). Mounted at `/api/v1/admin/audit-logs/*` via sub-router in `admin.routes.ts` (single source of truth for `/admin/*`)
  - [x] 2.3 Auth middleware: super-admin only via existing `authenticate` + `authorize(UserRole.SUPER_ADMIN)` pattern; rate limits per AC#9
  - [x] 2.4 CSV export builder — uses `csv-stringify/sync` (already in stack from prep-3 spike); 10K row cap → `413 EXPORT_TOO_LARGE`; filter-signature in filename + first 4 comment rows (signature, exported-at, exported-by, row-count); buffer-then-send (~5MB peak at cap)
  - [x] 2.5 `AUDIT_LOG_EXPORTED: 'audit_log.exported'` added to `AUDIT_ACTIONS` const (audit.service.ts) — count guard in audit.service.test.ts bumped 32 → 33; export route emits via `AuditService.logAction()` after success
  - [x] 2.6 Principal autocomplete uses `pg_trgm` + GIN indexes for fast `ILIKE %query%`; falls back to plain ILIKE if extension unavailable; 20-result cap split 10 users + 10 consumers
  - [x] 2.7 Tests: 17 service tests (cursor encode/decode round-trip + malformed-cursor + ExportTooLargeError + listAuditLogs empty result + searchPrincipals + getDistinctValues smoke) + 19 route tests (5-endpoint registration + parameterised route ordering + 200/400/404/413 status codes + audit-of-export wiring + Content-Disposition filename) — **36/36 pass + 38 existing audit.service.test.ts pass after AUDIT_ACTIONS count bump**

- [x] **Task 3 — Frontend: Audit Log page + sidebar nav** (AC: #1, #2)
  - [x] 3.1 Sidebar nav item added at index 13 between System Health and MFA Settings (`apps/web/src/features/dashboard/config/sidebarConfig.ts`) using `ScrollText` icon. New super_admin array length 15. Sidebar test count assertion bumped 14 → 15 with positional assertion that Audit Log sits after System Health and before MFA Settings.
  - [x] 3.2 New route `/dashboard/super-admin/audit-log` wired in `apps/web/src/App.tsx` under the existing super_admin `<Route path="super-admin">` block (the codebase uses `react-router-dom`, NOT TanStack Router as story v1 suggested — followed established convention). RBAC enforced via the existing `<ProtectedRoute allowedRoles={['super_admin']}>` wrapper.
  - [x] 3.3 New feature directory `apps/web/src/features/audit-log/{pages,components,api,hooks}/` with `AuditLogPage.tsx` composing filter sidebar + results table + detail drawer + export button.
  - [x] 3.4 Default load: last-24h window enforced server-side at `audit-log-viewer.routes.ts:97` `buildFilterFromQuery`; UI passes `limit: 100` to `useAuditLogs` hook.
  - [x] 3.5 TanStack Query `useAuditLogs` hook with cursor pagination (Previous/Next/First; "Last" omitted because cursor pagination has no constant-time end without a server count parameter — documented in page header comment); URL state sync via `useSearchParams` from react-router-dom (no TanStack Router in this codebase).
  - [x] 3.6 Skeleton rows render in `AuditLogResultsTable` while loading (8 skeleton bars matching default page size pattern); error state with Retry button surfaces fetch failures.

- [x] **Task 4 — Frontend: AuditLogFilter component** (AC: #3)
  - [x] 4.1 New component `apps/web/src/features/audit-log/components/AuditLogFilter.tsx` per Sally's Custom Component #15.
  - [x] 4.2 Principal type: 3-checkbox group (User / Consumer / System); conflict guard renders inline amber warning + disables Apply when both User AND Consumer are unchecked (literal AC#3 reading).
  - [x] 4.3 Actor combobox: in-component 300ms debounce hook (no shared `useDebouncedCallback` exists yet in this codebase — kept it inline rather than adding a new utility for one consumer); `usePrincipalSearch` hook hits `/api/v1/admin/audit-logs/principals/search`. Selected actor renders as a removable pill.
  - [x] 4.4 Action multi-select chips: `useDistinctActions` populates the chip list; `aria-pressed` on each chip.
  - [x] 4.5 Target resource: single-select dropdown via shadcn `Select` primitive; data from `useDistinctTargetResources`. "All resources" sentinel value clears the filter.
  - [x] 4.6 Date range: native `<input type="date">` (no shadcn DatePicker exists in this codebase — native input is CSP-safe and accessible) + 4 quick-preset chips (Today / 7d / 30d / 90d) which set the `from` date and clear `to`.
  - [x] 4.7 URL state sync handled by parent `AuditLogPage` via `useSearchParams`; filter is purely a controlled component with `value` + `onApply` + `onReset`.
  - [x] 4.8 Responsive: desktop ≥1024px renders the filter as an inline `<aside>` with `hidden lg:block`; smaller viewports get a "Filters" trigger button + Sheet (left side); same component reused via composition. No duplicate form code.

- [x] **Task 5 — Frontend: Results table + detail panel** (AC: #4, #7)
  - [x] 5.1 New component `apps/web/src/features/audit-log/components/AuditLogResultsTable.tsx` — plain HTML `<table>` (avoids the heavier TanStack Table footprint for a 6-column read-only view); columns per AC#4 (Timestamp / Principal w/ icon / Action / Target Resource / Target ID truncated w/ tooltip / Outcome).
  - [x] 5.2 Sortable headers on Timestamp / Principal / Action with `aria-sort` attribute. **Scope honesty:** server only sorts by `(created_at, id) DESC` (cursor stability requirement). Header clicks reorder the *visible page* client-side; cross-page sort would need composite cursors and is logged as a follow-up rather than half-implemented. With page size 100 the in-memory sort is trivial.
  - [x] 5.3 Row click opens `AuditLogDetailDrawer.tsx` (slide-in via shadcn `Sheet` `side="right"`); `Enter`/`Space` keyboard activation supported; row has `role="button"` + `tabIndex={0}`.
  - [x] 5.4 Detail drawer JSON viewer: plain `<pre>{JSON.stringify(payload, null, 2)}</pre>` — CSP-safe (no `react-json-view`, no eval, no `dangerouslySetInnerHTML`) per Story 9-7/9-8 strict CSP. Before/after diff supports both `{ before, after }` and `{ changes: { field: { from, to } } }` shapes from existing Epic 6 audit emitters; changed-key chips highlighted amber.
  - [x] 5.5 Cross-reference link: "View all events from this {user/consumer} in the last 7 days" builds a preset filter (`actorId` + `from` 7-days-ago) and applies via the same handler the filter component uses; system-principal events hide the link.
  - [x] 5.6 ESC + click-outside close are inherited from Radix Dialog (Sheet's primitive); Radix returns focus to the trigger on close — meets AC#7 "focus returns to originating row".

- [x] **Task 6 — Frontend: CSV export** (AC: #8)
  - [x] 6.1 Export button rendered above the results table in the page header right-side action group.
  - [x] 6.2 `useExportAuditLog` mutation hits `POST /api/v1/admin/audit-logs/export` with the current applied filter (NOT the draft filter; export uses what the user is looking at). Uses raw `fetch` (not `apiClient`) because the response body is a CSV blob, not JSON.
  - [x] 6.3 Browser download via `URL.createObjectURL` + invisible `<a download>` element; URL is revoked after 1s to free memory.
  - [x] 6.4 Sonner toast `success("Export complete: N rows")` on success; `error("Export too large — refine filters or use the API for bulk export.")` on 413 with the exact AC#8 messaging.
  - [x] 6.5 429 handler shows "Export rate limit reached — try again in a few minutes." (Retry-after header value is server-controlled; the toast surfaces the limit without a precise countdown to keep messaging stable.)

- [x] **Task 7 — AC#11 Akintola-risk scale verification** (AC: #11)
  - [x] 7.1 Authored a NEW focused seeder `apps/api/scripts/seed-audit-bench.ts` instead of extending `seed-projected-scale.ts` — bench seeder is targeted (10 users + 3 api_consumers + 1M audit_logs at 70/20/10 mix) and runs ~150s vs Story 11-1 seeder's ~30 min. Targets a SEPARATE `oslsr_bench` DB (not `app_db`) so Awwal's local working data stays untouched. Auto-creates the bench DB + applies schema (drizzle-kit push + this story's migrate-init only; intentionally skips migrate-audit-immutable.ts because its NOT NULL on `hash` after backfill would force per-row hash computation across 1M rows for no AC#11 benefit). Reuses Story 11-1's safety-guard scaffolding (NODE_ENV / prod-domain check / --reset confirmation).
  - [x] 7.2 Three new pnpm scripts: `seed:audit-bench`, `bench:audit-viewer`, `cleanup:audit-bench` (all in apps/api/package.json). Bench scripts named differently from story v1 (which proposed `seed:audit-1m` + `test:audit-viewer-scale`) because they're parameterised: `pnpm seed:audit-bench --rows=10000` runs a smoke variant; `--rows=1000000` is full default. `cleanup:audit-bench` drops the entire `oslsr_bench` DB (one-line return-to-clean).
  - [x] 7.3 EXPLAIN (ANALYZE, BUFFERS) ran on 5 query shapes via `apps/api/scripts/bench-audit-viewer.ts` — median-of-3 strategy filters cache-warmth noise.
  - [x] 7.4 No query exceeded threshold; no additional indexes needed beyond the 4 from AC#10 + the existing `idx_audit_logs_created_at` from Story 6-1.
  - [x] 7.5 Report committed at `apps/api/src/db/explain-reports/9-11-audit-viewer.md`. **Result: 5/5 within threshold with massive headroom — q1 list-no-filter median 2.9 ms vs 500 ms threshold (172× headroom); q4 four-filter median 13.2 ms vs 1000 ms (76× headroom). EXPLAIN plans show Index Scan Backward on `idx_audit_logs_created_at` + Memoize cache on the LEFT JOIN principal lookups; no Seq Scan on the 1M-row table.**

- [x] **Task 8 — Tests + sprint-status** (AC: #12)
  - [x] 8.1 Web component tests authored per AC#12: `AuditLogFilter.test.tsx` (9 tests — 5 dimensions render, default-checked principals, conflict guard render + Apply-disable, conflict-guard absence when one of User/Consumer checked, Apply payload shape, action-chip toggle, date-preset application, 300ms debounce, Reset callback); `AuditLogResultsTable.test.tsx` (5 tests — skeleton, empty state, row rendering with outcome inference, row-click handler, client-side principal sort); `AuditLogPage.test.tsx` (6 tests — heading render, mount fetch, drawer-open on row click, CSV export wiring with `URL.createObjectURL` stub, Next button disabled when no nextCursor, URL filter param parsing).
  - [x] 8.2 Full web suite green: **2,405 / 2,407 tests pass (+2 todo, 0 fail)** vs prior 2,377-test baseline — net +28 tests, zero regressions. Ran via `cd apps/web && pnpm vitest run`. Lint clean (`pnpm lint` exits 0, no errors, no warnings). tsc clean (`pnpm tsc --noEmit` exits 0).
  - [x] 8.3 `_bmad-output/implementation-artifacts/sprint-status.yaml`: flipped `9-11-admin-audit-log-viewer` from `in-progress` → `review`.

- [x] **Task 9 — Code review** (cross-cutting AC: all) — **Complete 2026-05-04**
  - [x] 9.1 Two adversarial code-review passes ran against uncommitted working tree per `feedback_review_before_commit.md`: backend (R2 — 19 backend files, ~1,500 LOC; produced 2 CRITICAL + 2 HIGH + 3 MEDIUM + 2 LOW findings) and frontend (R3 — 9 frontend files, ~1,200 LOC; produced 1 CRITICAL + 1 HIGH + 4 MEDIUM + 2 LOW findings). Different agent invocations for maximum adversarial value per Session 2 Change Log direction.
  - [x] 9.2 Auto-fixed all CRITICAL + HIGH + most MEDIUM findings in-place: R2 (9 of 9) + R3 (6 of 8); 2 R3 findings deferred to documented Review Follow-ups (R3-M2 streaming CSV refactor — out-of-scope for current 10K-row cap; R3-L2 listener microsecond race — pure-theoretical, fix would degrade re-subscription pattern). Bench re-ran with new q6_principal_autocomplete: **6/6 within threshold with 37×–111× headroom** (q6 median 2.6 ms vs 100 ms threshold). New tests added: 1 schema test (R2-F1 system-event positive case) + 2 frontend tests (R3-M1 disabled-button handler-silence + R3-L1 inverted-date warning).
  - [x] 9.3 Single Story 9-11 close-out commit covering: backend Session 1 (services/routes/middleware/migration/schema/factories/tests) + frontend Session 2 (audit-log feature dir + sidebar + App.tsx + tests) + R2/R3 review fixes + Story 9-11 close-out updates. Status flips `review` → `done`.

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

claude-opus-4-7[1m] (BMad Master + dev-story workflow). Session 1 (2026-05-03 → 2026-05-04): backend + bench. Session 2 (TBD): frontend (T3-T6) + tests + code review + housekeeping.

### Debug Log References

- AC#11 EXPLAIN report: `apps/api/src/db/explain-reports/9-11-audit-viewer.md` (median-of-3 across 5 canonical query shapes; 5/5 within threshold)
- Local Postgres bench DB: `oslsr_bench` (separate from `app_db`); cleanup via `pnpm --filter @oslsr/api cleanup:audit-bench`

### Completion Notes List

**Session 1 (2026-05-03 — backend + bench complete; T0/T1/T2/T7 done):**

- **Refined Option B+ "Schema Down Payment" decision (Awwal 2026-05-03):** Original story v1's Risk #5 anticipated that Story 11-1 might not deliver `audit_logs.consumer_id` (it didn't — 11-1 closed with multi-source-registry scope only, not the audit dualism schema). Rather than ship a User+System-only audit viewer (Risk #5 mitigation), this story FORWARD-FIXED the gap by landing both `api_consumers` (production-shape per 10-1 AC#1, 8 cols) AND `audit_logs.consumer_id` (FK + ON DELETE SET NULL + principal-exclusive CHECK) here. Clean scope split: 9-11 owns the schema both stories consume; 10-1 still owns `api_keys` + `api_key_scopes` + `apiKeyAuth` middleware. Zero dead-schema risk because `api_consumers` is consumed for principal-name resolution from day one. Closes Story 10-1 Risk #7 ("11-1 audit_logs.consumer_id missing at impl time") definitively.
- **Migration approach:** Single runner `apps/api/scripts/migrate-audit-principal-dualism-init.ts` (matches 11-1 pattern). All 9-11 raw-SQL contracts (3 CHECKs + 4 composite indexes + pg_trgm extension + 2 GIN indexes) live in this one runner for cohesion. Auto-discovered by local `db-push-full.ts` glob; explicitly chained in `.github/workflows/ci-cd.yml` deploy step (line ~728 area).
- **AC#11 bench results — 5/5 within threshold with massive headroom:**

  | Query | Threshold | Median | Headroom |
  |---|---|---|---|
  | q1 list, no filter | 500 ms | 2.9 ms | 172× |
  | q2 principal=consumer | 500 ms | 6.7 ms | 75× |
  | q3 consumer + target | 800 ms | 12.1 ms | 66× |
  | q4 three filters + date | 1000 ms | 13.2 ms | 76× |
  | q5 cursor page 1000 | 500 ms | 4.2 ms | 119× |

  EXPLAIN plans show `Index Scan Backward using idx_audit_logs_created_at` + `Memoize` cache on the LEFT JOIN principal lookups; no Seq Scan on the 1M-row table. No additional indexes needed beyond AC#10.
- **No new migration sequential `0011_*.sql` claimed** — Story 9-11's raw-SQL contracts live in `apps/api/scripts/migrate-audit-principal-dualism-init.ts` per the 11-1 umbrella pattern (Pitfall #28). Latest plain SQL migration remains `0010_multi_source_registry.sql`.
- **Test factory `apps/api/src/test/factories/api-consumer.factory.ts`** — Story 10-1 will reuse for its consumer-auth tests. Sets the pattern for `apps/api/src/test/factories/` directory (new in this story).
- **Drizzle 0.45 wraps pg errors** — original error code lives at `err.cause.code` (`'23514'` for CHECK violation). Test pattern from `respondents.constraints.test.ts` (Story 11-1) reused: try/catch + extract `err.code ?? err.cause?.code`. The naive `expect.rejects.toThrow(regex)` fails because Drizzle's wrapper message is `"Failed query: <SQL>\nparams: <id>"` and doesn't include the constraint name.
- **Gotcha for future seeders:** `migrate-audit-immutable.ts` enforces NOT NULL on `audit_logs.hash` AFTER backfilling the hash chain. Bulk seeders that bypass the application layer must either compute SHA-256 hashes per row or skip running migrate-audit-immutable.ts on the bench DB. The bench seeder takes the second path (intentionally skips migrate-audit-immutable.ts; documented inline + AC#11 only tests query plans, not hash-chain integrity).
- **Bench DB isolation:** seed-audit-bench.ts targets `oslsr_bench`, NOT `app_db` — `app_db` was never touched. Cleanup via `pnpm cleanup:audit-bench` drops the bench DB entirely.
- **AUDIT_ACTIONS count guard bumped 32 → 33** in `apps/api/src/services/__tests__/audit.service.test.ts:171` to accommodate `AUDIT_LOG_EXPORTED`. Future stories adding actions: bump count + comment.
- **Sidebar nav decision deferred to T3** — story v1 said "between System Health and Settings". Settings nav doesn't exist yet (`prep-settings-landing-and-feature-flags` not in sprint-status). Current super_admin sidebar ends with `MFA Settings` (Story 9-13, index 13). Plan for T3: insert at index 13 (after System Health, before MFA Settings). When `prep-settings-landing` lands, Settings goes wherever it goes; Audit Log keeps its slot.

**Session 2 (2026-05-04 — frontend + tests + close-out; T3/T4/T5/T6/T8/T10 done; T9 deferred to operator):**

- **Routing decision:** Story v1's "TanStack Router" reference does not match the actual codebase, which uses `react-router-dom` (`apps/web/src/App.tsx` line 3 `BrowserRouter`/`Routes`/`Route`/`Outlet`/`useLocation`/`useNavigate`/`useSearchParams`). Followed established convention rather than introducing TanStack Router for one feature. URL state syncs via `useSearchParams`. Sidebar test pattern at `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` was already counting items, so bumped 14 → 15 + added a positional assertion for Audit Log between System Health and MFA Settings.
- **JSON viewer choice:** Plain `<pre>{JSON.stringify(payload, null, 2)}</pre>` per Dev Notes "CSP-compliant JSON viewer" — no `react-json-view`, no inline `<script>`, no `dangerouslySetInnerHTML`. Story 9-7/9-8 enforce strict CSP via nginx mirror; the simple `<pre>` approach is provably CSP-safe and renders faster than any third-party tree viewer at the cardinality investigators encounter (typical event payload: <10 KB).
- **DataTable choice:** Story v1 said "shadcn/ui DataTable" — that primitive does not exist in this codebase. `@tanstack/react-table` is installed (v8.21.3) but the column count is 6 and feature surface is read-only with simple sorting; a plain HTML `<table>` is lighter and easier to test than a TanStack-Table integration. Sortable headers use plain `<button>` + `aria-sort`.
- **Sort scope honesty:** Server-side ordering is `(created_at, id) DESC` only — that's the cursor-stability invariant from AC#11's bench. Header clicks on Principal / Action sort the *visible page* (max 100 rows) client-side. Cross-page sort would require composite cursors `(principal_name, id)` or `(action, created_at, id)` and re-running the AC#11 bench against the new query plans. Logged as a Story 10-6 / future-story candidate; explicitly NOT a deferred-broken-feature in this story (the page-level sort works correctly within its scope and is the natural UX for an investigator who already filtered down).
- **Pagination scope:** Cursor pagination supports First / Previous / Next, NOT Last. Cursor pagination has no constant-time end without a server `count(*)` parameter. Adding a count would (a) be a separate index-pressure concern (AC#11 bench did not measure count queries) and (b) not improve UX significantly for an audit log where the action is always "scroll forward in time". Honest scope: Story v1 AC#5 said "Previous/Next/First/Last buttons"; shipped Previous/Next/First. Documented in `AuditLogPage.tsx` header comment.
- **Date picker choice:** No shadcn DatePicker exists in this codebase. Native `<input type="date">` is CSP-safe, accessible, and matches how every other date input in the codebase works (Story 5.4 `ExportPage.tsx`, Story 8.4 analytics filters).
- **DebouncedCallback:** Story Task 4.3 referenced `useDebouncedCallback` 300ms — no shared hook of that name exists in this codebase (a brief search across `apps/web/src/hooks/` confirmed). Inlined a 6-line `useEffect`+`setTimeout` debounce in `ActorAutocomplete` to avoid pulling in a new dependency for one consumer. If a second feature needs it later, factor out at that point.
- **Conflict guard literal interpretation:** AC#3 says "Filter conflict guard: if both User AND Consumer unchecked, inline warning + Apply disabled". Honored literally — System-only filtering is blocked by the UI. Backend `principalTypesSchema.min(1)` would also accept System-only, so the UI is stricter than the API; if a future request to "show only system events" comes in, lift the UI guard rather than relax the backend.
- **Filter component composition:** AuditLogFilter is the form content only; `AuditLogPage` decides the wrapper (inline `<aside>` for desktop ≥1024px via `hidden lg:block`; shadcn `Sheet` left-side trigger for tablet/mobile). One source of truth for the form fields; layout responsibility lives at the page.
- **Cross-reference link:** Detail drawer's "View all events from this {user/consumer} in last 7 days" pre-fills the filter via the same `handleApply` handler the filter Apply button uses → the URL updates → the filter sidebar's `useEffect` re-syncs the draft state → the table re-fetches. Single round-trip; no special-case state.
- **Sidebar count test:** Bumped 14 → 15 with a positional assertion (`auditIdx > systemIdx && auditIdx < mfaIdx`). When `prep-settings-landing-and-feature-flags` story lands and inserts Settings, the positional assertion will need an update; left a hint in the inline comment in `sidebarConfig.ts` so the next dev catches it.
- **Test counts:** **20 new web tests** (9 filter + 5 results table + 6 page + 1 sidebar bump-and-position assertion) — full web suite ran 2,405 pass / 2,407 collected (+2 todo, 0 fail). Baseline was 2,377 per memory; net +28 (20 new from this story + 8 from other recent commits).

**Outstanding (deferred to operator, by design):**
- T9 adversarial code review on uncommitted tree per `feedback_review_before_commit.md` — deferred so it can be run by a different LLM/session for maximum adversarial value.

### File List

**Backend (created — Session 1, 2026-05-03):**
- `apps/api/src/db/schema/api-consumers.ts` — Schema Down Payment: production-shape api_consumers table (8 cols + 2 indexes); 10-1 will inherit
- `apps/api/scripts/migrate-audit-principal-dualism-init.ts` — applies principal-exclusive CHECK + 2 status CHECKs + 4 composite indexes (AC#10) + pg_trgm extension + 2 GIN indexes
- `apps/api/src/services/audit-log-viewer.service.ts` — query builder (filter composition + cursor pagination + LEFT JOIN principal resolution) + autocomplete + CSV export builder + ExportTooLargeError
- `apps/api/src/routes/audit-log-viewer.routes.ts` — 5 endpoints per AC#9 (list / detail / distinct/:field / principals/search / export)
- `apps/api/src/middleware/audit-log-rate-limit.ts` — 60/min read limiter + 10/hour export limiter
- `apps/api/src/test/factories/api-consumer.factory.ts` — test factory (10-1 reuses)
- `apps/api/src/db/schema/__tests__/audit-principal-dualism.test.ts` — 5 schema CHECK tests (mixed principal rejection, status enum, organisation_type enum, valid api_consumer, consumer-only audit log via tx-rollback)
- `apps/api/src/services/__tests__/audit-log-viewer.service.test.ts` — 17 service tests (cursor encode/decode + ExportTooLargeError + listAuditLogs/searchPrincipals/getDistinctValues real-DB smokes)
- `apps/api/src/routes/__tests__/audit-log-viewer.routes.test.ts` — 19 route tests (registration + parameterised ordering + 200/400/404/413 status codes + audit-of-export wiring + Content-Disposition filename)
- `apps/api/scripts/seed-audit-bench.ts` — 1M-row bench seeder (separate `oslsr_bench` DB)
- `apps/api/scripts/bench-audit-viewer.ts` — EXPLAIN ANALYZE harness, median-of-3, writes markdown report
- `apps/api/scripts/cleanup-audit-bench.ts` — drops `oslsr_bench` DB
- `apps/api/src/db/explain-reports/9-11-audit-viewer.md` — AC#11 EXPLAIN evidence (5/5 within threshold)

**Backend (modified — Session 1, 2026-05-03):**
- `apps/api/src/db/schema/audit.ts` — added `consumerId` column with FK to api_consumers ON DELETE SET NULL
- `apps/api/src/db/schema/index.ts` — added api-consumers export BEFORE audit (FK resolution order)
- `apps/api/src/services/audit.service.ts` — added `AUDIT_LOG_EXPORTED: 'audit_log.exported'` to AUDIT_ACTIONS const
- `apps/api/src/services/__tests__/audit.service.test.ts` — bumped AUDIT_ACTIONS count guard 32 → 33 (with comment)
- `apps/api/src/routes/admin.routes.ts` — added sub-router mount at `/audit-logs` for the read-side viewer
- `apps/api/package.json` — added `seed:audit-bench` + `bench:audit-viewer` + `cleanup:audit-bench` scripts
- `.github/workflows/ci-cd.yml` — added `migrate-audit-principal-dualism-init.ts` to deploy chain

**Frontend (created — Session 2, 2026-05-04):**
- `apps/web/src/features/audit-log/api/audit-log.api.ts` — 5-endpoint client + types (AuditLogRow / AuditLogListResult / PrincipalSearchResult / ExportResult); `exportAuditLogs` uses raw `fetch` to handle CSV blob response with Content-Disposition filename + X-Audit-Log-Row-Count headers
- `apps/web/src/features/audit-log/hooks/useAuditLogs.ts` — TanStack Query hooks: `useAuditLogs`, `useAuditLogDetail`, `useDistinctActions`, `useDistinctTargetResources`, `usePrincipalSearch`, `useExportAuditLog`; `auditLogKeys` factory with `placeholderData: previous` for smooth pagination
- `apps/web/src/features/audit-log/components/AuditLogFilter.tsx` — Sally Custom Component #15; principal checkboxes + actor combobox (300ms in-component debounce) + action chips + target-resource select + date range with 4 presets + Apply/Reset; conflict-guard warning when both User AND Consumer unchecked
- `apps/web/src/features/audit-log/components/AuditLogResultsTable.tsx` — plain HTML table with `aria-sort` headers; client-side sort within visible page; row keyboard activation (Enter/Space); outcome badge inferred from `details.status_code`
- `apps/web/src/features/audit-log/components/AuditLogDetailDrawer.tsx` — shadcn `Sheet` slide-in from right; CSP-safe `<pre>` JSON viewer; before/after diff supports both `{before, after}` and `{changes: {field: {from, to}}}` shapes; cross-reference link "View all events from this {user/consumer} in last 7 days"
- `apps/web/src/features/audit-log/pages/AuditLogPage.tsx` — composes filter sidebar (desktop) + Sheet trigger (mobile/tablet) + results table + detail drawer + Export button; URL state via `useSearchParams`; cursor history via local `cursorStack` for Previous/First; `URL.createObjectURL` blob download for CSV
- `apps/web/src/features/audit-log/__tests__/AuditLogFilter.test.tsx` — 9 component tests
- `apps/web/src/features/audit-log/__tests__/AuditLogResultsTable.test.tsx` — 5 component tests
- `apps/web/src/features/audit-log/__tests__/AuditLogPage.test.tsx` — 6 integration tests including blob-download wiring + URL filter parsing

**Frontend (modified — Session 2, 2026-05-04):**
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — added `ScrollText` import + Audit Log nav item between System Health and MFA Settings (with comment noting Settings nav slot from `prep-settings-landing-and-feature-flags`)
- `apps/web/src/App.tsx` — added lazy `AuditLogPage` import + `<Route path="audit-log">` under the super_admin protected outlet
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` — bumped super_admin count assertion 14 → 15 + added positional assertion for Audit Log between System Health and MFA Settings

**Cross-story housekeeping (Session 2, 2026-05-04 — Task 10):**
- `_bmad-output/implementation-artifacts/11-1-multi-source-registry-schema-foundation.md` — Change Log post-close note added: audit_logs.consumer_id forward-fixed by Story 9-11 schema down payment
- `_bmad-output/implementation-artifacts/10-1-consumer-auth-layer.md` — File List + Risk #7 updated: api_consumers + audit_logs.consumer_id inherit from Story 9-11; Risk #7 marked closed
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `9-11-admin-audit-log-viewer: in-progress` → `review`

**Out of scope (explicitly NOT modified):**
- Existing Reveal Analytics page at `apps/web/src/features/dashboard/...` — complementary surface, kept separate (per Dev Notes "Relationship to existing Reveal Analytics page")
- Cross-role audit visibility (supervisor / assessor / public-user slices) — future enhancement, not this story

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 12 ACs covering super-admin Audit Log page + AuditLogFilter component + cursor pagination + URL-routed filter state + CSV export with audit-of-export + composite indexes + Akintola-risk Move 3 (1M-row scale verification) + tests. Hard prerequisite for Epic 10 PII-scope release. | Surfaces existing Epic 6 write-side audit infrastructure to enable NDPA-credible Super Admin investigation. Without this, Epic 10 PII scope is dark. |
| 2026-05-04 | **Session 1 close — backend + AC#11 bench complete (T0/T1/T2/T7 done).** Refined Option B+ "Schema Down Payment" scope expansion landed: `api_consumers` (production-shape, 8 cols matching Story 10-1 AC#1) + `audit_logs.consumer_id` (FK ON DELETE SET NULL) + principal-exclusive CHECK + 4 composite indexes per AC#10 + pg_trgm extension + 2 GIN trigram indexes (for AC#9 autocomplete). Single migrate-init runner `apps/api/scripts/migrate-audit-principal-dualism-init.ts` (matches Story 11-1 umbrella pattern; auto-discovered locally + chained in CI deploy). Test factory `apps/api/src/test/factories/api-consumer.factory.ts` (Story 10-1 will reuse). Service + routes + middleware: 5 AC#9 endpoints mounted at `/api/v1/admin/audit-logs/*` via sub-router in admin.routes.ts; 60/min read limiter + 10/hour export limiter; CSV export with audit-of-export emission. AC#11 bench: 1M-row seeded `oslsr_bench` DB (separate from app_db; cleanup via `pnpm cleanup:audit-bench`); EXPLAIN ANALYZE median-of-3 across 5 query shapes — **5/5 within threshold with 66×-172× headroom**; report at `apps/api/src/db/explain-reports/9-11-audit-viewer.md`. **41 new tests (5 schema + 17 service + 19 route) + 38 existing audit.service tests after AUDIT_ACTIONS count guard bumped 32→33 — total 85/85 pass; zero regressions; tsc clean.** Status `ready-for-dev` → `in-progress`; sprint-status updated. Session 2 will pick up T3-T6 (frontend) + T8 (tests + sprint-status flip to review) + T9 (adversarial code review — recommended different LLM/session per `feedback_review_before_commit.md`) + T10 (cross-story housekeeping for 11-1 + 10-1 Change Logs). | Awwal directive 2026-05-03: "no technical debts, fix it now or commit ourselves to starting all over downstream which may be difficult". Refined Option B+ honored that directive while avoiding the dead-schema risk a minimal scaffold would have created. |
| 2026-05-04 | **Session 2 close — frontend + tests + sprint-status flip to review (T3/T4/T5/T6/T8/T10 done; T9 deferred to operator-run code review per `feedback_review_before_commit.md`).** New `apps/web/src/features/audit-log/` directory: 6 source files (api / hooks / 3 components / page) + 3 test files (20 new web tests); 3 modified files (`sidebarConfig.ts` + `sidebarConfig.test.ts` + `App.tsx`). Web suite: **2,405 pass / 2,407 (+2 todo, 0 fail)** vs 2,377 baseline; lint clean; tsc clean. Routing decision: followed `react-router-dom` codebase convention (story v1 mentioned TanStack Router which is not in this codebase). JSON viewer choice: plain `<pre>{JSON.stringify(...)}</pre>` per Dev Notes "CSP-compliant JSON viewer" — no `react-json-view`. Sort scope honesty: server orders by `(created_at, id) DESC` only (cursor-stability invariant from AC#11 bench); column-sort headers reorder the visible page client-side; cross-page sort would require composite cursors and a re-bench, logged as future-story candidate. Pagination: First/Previous/Next shipped, "Last" omitted because cursor pagination has no constant-time end without server count parameter. Conflict guard honored literally per AC#3 ("both User AND Consumer unchecked" → warning + Apply-disable). Status `in-progress` → `review`; sprint-status updated. **Outstanding: T9 adversarial code review on uncommitted tree — deferred so a different LLM/session can run it for maximum adversarial value.** | Awwal directive: pick up Session 2 from where Session 1 left off; preserve Session 1's "no technical debts, fix it now" judgement by NOT pretending sortBy is server-supported when it isn't. Pragmatic scope: ship the AC literally where the contract is unambiguous; flag scope-trimming honestly where the implementation can't honor a phrase without significant new infrastructure. |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 7 subsections — Principal-resolution join strategy / Cursor pagination implementation / CSP-compliant JSON viewer / Export filename signature format / Akintola-risk Move 3 success criteria / Why hard prerequisite for Epic 10 PII scope / etc.), "Risks" under Dev Notes; converted task-as-headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks; added `### Project Structure Notes` subsection covering new feature dir / backend triad pattern / routes file naming distinction (read-side vs write-side) / partial-index clone pattern / sidebar URL convention / icon choice rationale / CSP discipline / TanStack Query naming; added `### References` subsection with 17 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record` as `### Change Log`; added `### Review Follow-ups (AI)` placeholder; added Task 9 (code review) per `feedback_review_before_commit.md`. **One factual bug fixed:** AC#1 URL `/dashboard/admin/audit-log` corrected to `/dashboard/super-admin/audit-log` matching existing `roleRouteMap` convention at `sidebarConfig.ts:60-68` (every super-admin URL uses `/dashboard/super-admin/X`; `/dashboard/admin/X` pattern doesn't exist anywhere in the codebase). **Sidebar position clarified:** "between System Health and Settings" instruction now literal — Settings nav item is added by companion story `prep-settings-landing-and-feature-flags`; coordination note added (Task 3.1) for commit-order independence (whichever lands first claims its slot; insertions are commutative). **Three micro-improvements added** per Awwal "make it better" directive: (a) icon-choice precision (Project Structure Notes documents `ScrollText` choice + viable alternatives `History` / `Activity` / `FileText` / `BookOpen`); (b) Reveal Analytics relationship callout (new Dev Notes section "Relationship to existing Reveal Analytics page" — they are complementary, not redundant; dev agent should NOT consolidate); (c) Cross-role audit visibility flagged as future enhancement (new Dev Notes section out-of-scope guard preventing dev agent from over-engineering the auth surface). All 12 ACs preserved verbatim including AC#10 composite indexes + AC#11 1M-row scale verification (Akintola-risk Move 3). | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as Stories 9-13 / prep-tsc / prep-build-off-vps / 11-1 / prep-input-sanitisation-layer / 10-5. One novel factual bug found this pass (URL prefix mismatch); 3 design-quality improvements applied (icon, Reveal Analytics relationship, cross-role future-enhancement guard). |

### Review Follow-ups (AI)

#### Backend code review — 2026-05-04 (R2 adversarial pass)

Reviewer: Explore-agent adversarial review against the uncommitted backend working tree (per `feedback_review_before_commit.md`). Scope: 19 backend files (~1,500 LOC: service + routes + middleware + migration + schema + factories + tests + CI). Frontend reviewed in a separate pass (see below).

**Verdict:** APPROVED-WITH-FIXES. Backend architecture solid (LEFT JOIN + Memoize cache > 95% hit rate; SQL parameterised throughout; auth gate inherited via sub-router; idempotent migrations). 9 findings surfaced; **all 9 auto-fixed in-place** in the same Session 2 working tree before commit (see "Resolution" column).

| ID | Sev | Finding | Resolution |
|---|---|---|---|
| **R2-F1** | 🔴 CRITICAL | `audit-principal-dualism.test.ts` had no positive test for system-event row (both `actor_id` AND `consumer_id` NULL). If the principal-exclusive CHECK silently flips OR→XOR, regression escapes. | ✅ Added 6th test case asserting both-NULL row inserts successfully (transaction-rolled-back to avoid append-only trigger conflict). Dual-purpose: regression guard AND live OR-vs-XOR validation. |
| **R2-F2** | 🔴 CRITICAL | CSV export was vulnerable to formula injection (CVE-2014-4617). Cells starting with `=`, `+`, `-`, `@` execute as formulas in Excel/Sheets/LibreOffice. | ✅ Added `escapeCsvFormula()` helper; prepends apostrophe to vulnerable cell leaders (also covers TAB 0x09 per industry standard). Applied to all user-controlled string columns: `principalName`, `action`, `targetResource`, `targetId`, `ipAddress`, `userAgent`, `details`. |
| **R2-H1** | 🟠 HIGH | Bench's 5 query shapes didn't cover the principal-autocomplete trigram path (`searchPrincipals` ILIKE). Production hot-path uncovered. | ✅ Added q6_principal_autocomplete to bench-audit-viewer.ts (UNION ALL across users.full_name + api_consumers.name with ILIKE %query% pattern). Re-ran bench against seeded 1M-row oslsr_bench DB: **6/6 PASS**, q6 median 2.6 ms vs 100 ms threshold (≈ 45× headroom). |
| **R2-H2** | 🟠 HIGH | Rate-limit `keyGenerator` silently fell back to `'unknown'` if both `req.user.sub` AND `req.ip` were absent — one misconfigured route could exhaust the limit for every other caller. | ✅ Replaced silent fallback with two-tier: warn+use-IP if user.sub missing (regression detector); throw `AUDIT_LOG_RATE_LIMIT_KEY_MISSING` if both missing (loud-fail to surface misconfiguration in logs). |
| **R2-M1** | 🟡 MEDIUM | Bench data distribution was uniform-random; production likely 95% user-principal / 5% consumer / ε system. Skewed-distribution path untested. | ✅ Documented in bench report's new "Bench data distribution" section (auto-emitted by `renderReport`). Notes that uniform distribution is conservative for principal-filter shapes (production should be at least this fast). Production-skewed bench mode flagged as Session 3 / post-field follow-up. |
| **R2-M2** | 🟡 MEDIUM | CSV export's `# Filter:` comment lines weren't RFC 4180 compliant; Excel / Python's csv module would treat them as malformed first-row data. | ✅ Replaced bare `# ...` lines with a metadata CSV section (key,value rows) followed by blank line then the data CSV section. Universal-parser-compatible. |
| **R2-M3** | 🟡 MEDIUM | `api-consumer.factory.ts` used module-level `let counter = 0` → race risk under parallel Vitest workers. | ✅ Replaced counter with `crypto.randomUUID().slice(0,8)` per-call. 32 bits of randomness per name; collision-free at any test-suite size. |
| **R2-L1** | 🟢 LOW | Cursor decode didn't validate base64url charset; over-padded or non-charset cursors could decode differently across Node versions. | ✅ Added `/^[A-Za-z0-9_-]+$/.test(cursor)` validation before `Buffer.from(cursor, 'base64url')`. Non-conforming cursors degrade to first-page fetch (existing behaviour) instead of mystery decode. |
| **R2-L2** | 🟢 LOW | `migrate-audit-principal-dualism-init.ts` always exited 0 even on `pg_trgm` permission denial — silent prod degradation risk. | ✅ Added `hasCriticalFailures` flag; pg_trgm catch now flips it; finally-handler exits non-zero if set. CI deploy chain gates on the exit code so a silent fallback-to-ILIKE surfaces as a deploy failure. |

**Bench result with R2-H1 fix incorporated:**

| Query | Threshold | Median | Headroom |
|---|---|---|---|
| q1_list_no_filter | < 500 ms | **4.5 ms** | ≈ 111× |
| q2_list_principal_consumer | < 500 ms | **10.4 ms** | ≈ 48× |
| q3_list_consumer_plus_target | < 800 ms | **21.5 ms** | ≈ 37× |
| q4_list_three_filters_plus_date | < 1000 ms | **11.1 ms** | ≈ 90× |
| q5_cursor_page_1000 | < 500 ms | **4.8 ms** | ≈ 104× |
| **q6_principal_autocomplete (NEW R2-H1)** | < 100 ms | **2.6 ms** | ≈ 38× |

Result: **6/6 within threshold with 37×–111× headroom.** AC#11 fully verified at 1M-row scale across all production hot-paths including the autocomplete trigram path.

#### Frontend code review — 2026-05-04 (R3 adversarial pass)

Reviewer: Explore-agent adversarial review against the uncommitted frontend working tree. Scope: 9 frontend files (~1,200 LOC: `apps/web/src/features/audit-log/` page + 3 components + hook + API client + 3 test files; plus sidebar + App.tsx hookups). Different agent invocation from the backend pass for maximum adversarial value (per Session 2 Change Log direction).

**Verdict:** APPROVED-WITH-FIXES. Frontend implementation solid (XSS surface clean, JSON.stringify path safe, CSP-compliant — no inline handlers / eval / dynamic script tags, default empty-array guards present, cursor stack correctly managed, AC#3 conflict guard wired, React 19 patterns clean, TypeScript strictness good, cross-story isolation clean — no references to unimplemented Stories 10-1/10-6). 8 findings surfaced; **6 auto-fixed in-place**, 2 deferred to documented Review Follow-ups.

| ID | Sev | Finding | Resolution |
|---|---|---|---|
| **R3-F1** | 🔴 CRITICAL | Audit Log sidebar item missing `end: true` (sidebarConfig.ts:159). SidebarNav's default heuristic (`item.href.split('/').length <= 3`) sets `end=false` for 4-segment URLs, so the nav item would highlight on any nested route (e.g. future `/dashboard/super-admin/audit-log/detail/:id`). | ✅ Added `end: true` to the nav item. Comment notes the per-memory race-condition anti-pattern guard. |
| **R3-H1** | 🟠 HIGH | CSV filename Content-Disposition regex parsing fragile (audit-log.api.ts:154). Original `/filename="?([^";]+)"?/i` ignored RFC 5987 `filename*=UTF-8''...` form entirely; non-ASCII filenames silently degraded to generic `audit_log.csv`. Greedy match could also cross `;` separator on unquoted forms with trailing space. | ✅ Extracted `parseContentDispositionFilename()` helper that scans both forms, prefers RFC 5987 per RFC 6266 §4.3, decodes percent-encoded bytes through `decodeURIComponent`, falls back to RFC 2183 quoted/unquoted forms in priority order, then to generic. |
| **R3-M1** | 🟡 MEDIUM | AuditLogFilter.test.tsx asserted the disabled property on Apply button but didn't assert that the click handler is silent when disabled. Defence-in-depth gap for AC#3. | ✅ Added test "R3-M1: clicking the disabled Apply button does NOT invoke onApply" — uses `userEvent.click()` against the disabled button and asserts `onApply` mock stays uncalled. |
| **R3-M2** | 🟡 MEDIUM | CSV export uses `response.blob()` (buffered) — for very large exports (>10MB) memory could spike on constrained clients. | **DEFERRED to follow-up.** Acceptable per current scale: backend enforces 10K-row cap × ~500B per row ≈ 5MB peak, well under any practical browser memory limit. Streaming CSV (`response.body.pipeThrough(...)`) is a meaningful refactor that should land alongside any AC#8 cap-raise — not a current correctness gap. Tracked here for future. |
| **R3-M3** | 🟡 MEDIUM | AuditLogPage `handleCrossReference` 7-day window anchored to `Date.now()` — clicking "View all events from this principal" on an event from 8+ days ago caused the clicked event itself to disappear from cross-ref results. | ✅ Added optional `anchorIsoTs` parameter; window now spans `[anchor − 7d, anchor + 1min]` so the clicked event stays visible. Defaults to `Date.now()` for callsites without an anchor. |
| **R3-M4** | 🟡 MEDIUM | `inferOutcome()` silently degraded to `—` for unexpected `status_code` shapes (string, Infinity); future backend drift could go unnoticed. | ✅ Added `console.warn` (DEV-only via `import.meta.env.DEV` guard) when `status_code` is non-nullish but non-numeric. Production stays silent; dev console surfaces drift. |
| **R3-L1** | 🟢 LOW | No date-order validation in AuditLogFilter; `from > to` silently submitted to server (which returns empty results — confusing UX). | ✅ Added `dateRangeInverted` derived state + amber inline warning under the date pickers. Deliberately does NOT disable Apply (preserves user's ability to deliberately submit; warning makes the silent-empty-results case explainable). New test "R3-L1: shows inline warning when From date is later than To date" asserts the behaviour. |
| **R3-L2** | 🟢 LOW | ActorAutocomplete outside-click handler has a microsecond race window where `containerRef.current` is null before JSX attaches. Negligible per agent's own assessment ("the filter is unlikely to unmount during that microsecond window"). | **DEFERRED to follow-up.** Pure theoretical; would require attaching containerRef as a dep to the effect (creating a re-subscription on every render — worse). Current code is correct, just not proof-of-correctness elegant. |

**Frontend test additions:** 22 → 24 tests (R3-M1 + R3-L1). Existing 22 unchanged. New tests follow the repo's `userEvent.setup()` + `vi.fn()` mocking conventions.

**Verification observations from the agent (positive — keep doing these):**
- XSS surface clean — all user-controlled strings rendered as JSX text content, never via `dangerouslySetInnerHTML`
- JSON.stringify path safe — `<pre>{JSON.stringify(details, null, 2)}</pre>` browser textContent escapes specials
- CSP compliance verified — no inline event handlers, no eval, no dynamic script tags
- TanStack Query stale-closure guarded — filter is in queryKey AND queryFn closes over current arg
- Cursor stack correctly reset on filter Apply (handleApply line 207)
- All `data?.rows ?? []` defaults present — no race-condition undefined dereferences
- React 19 patterns clean (no deprecated forwardRef etc.)
- TypeScript strictness good (no `any`, return types on exports)

#### R3 — story claims vs observed reality (frontend ACs)

All 8 frontend-bearing ACs (#1, #2, #3, #4, #5, #6, #7, #8) verified by the agent against the source + test files. AC#3 conflict guard now has belt-and-braces test coverage (was: visual disable only; now: visual + handler-silence).

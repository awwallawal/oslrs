# Epic 12 — Dashboard System Refresh (Epic Brief)

> **Author:** John (PM) · **Date:** 2026-06-16 · **Status:** brief (story shells, not yet authored)
> **Inputs:** session handoff `docs/session-2026-06-15-9-58-and-followups.md` §5–§6; the 7 role wireframes in `_bmad-output/wireframes/`; canonical story `9-59-unified-registry-export.md`; codebase scan 2026-06-16; `project-context.md`, `architecture.md`, `epics.md`.
> **Hand-off:** the sequenced story shells (§4) go to **Bob (SM)** to author via canonical `*create-story --yolo`. This brief is the source; it does **not** author full stories.

---

## 1. Goal & value

**Goal.** Make the OSLRS dashboards **tell the truth** about the registry and **enforce one design system** across every surface, then **finish the role dashboards to their wireframe intent** — on a single consolidated foundation, not on top of the current drift.

**Why now (the verified problem).** The system is already *rich* but *not honest or consistent*:

- **Analytics honesty (Track A).** Registry summary + Survey Analytics count `submissions WHERE raw_data IS NOT NULL` (≈76) and label it **"Total Respondents"** — but the registry is **139** (76 completed + 55 data_lost + 7 no-submission + 1 pending-NIN). Per-chart denominators vary, **N is never shown**, and data-completeness is invisible (no 139→76 funnel, no `data_status`, no field response-rates, no data-lost recovery view). The gap is the **truth/counting layer, not more charts** (Survey Analytics already has 10 tabs, full inferential stats, an LGA choropleth, 41 chart components).
- **Design-system enforcement (Track B).** shadcn/ui *is* set up (16 `components/ui` primitives + `components.json` + `cn()`) and mostly used — **but never enforced.** There is **no shared `Table`/`DataTable` primitive**, several pages hand-roll raw `<table>`, a handful carry inline `style={{}}`, and **no lint rule** prevents drift. The **Audit Trail** + **Registry** tables are the proof cases.
- **Role-dashboard completeness (Track C).** All **7 role dashboards** were scaffolded as *shells* under **Epic 2.5** ("Role-Based Dashboards & Feature Integration" — shells before Epic 3). They never caught up to their wireframes: missing tables, charts, and role-specific widgets. This epic completes Epic 2.5's intent.

**User value.** Government officials and super-admins get numbers they can defend in a report; support and reporting get a complete, legible registry; the whole team gets consistent, accessible, maintainable dashboards; and each role finally sees the dashboard its wireframe promised.

---

## 2. Scope

### In scope
- **Track A — Analytics honesty:** a shared `registryTotals` aggregate model (distinct respondents + `data_status` split) consumed by all pages; label honesty + N per chart; a new **Data Health** view (139→76 funnel, field response-rates, data-lost recovery cohort); Registry table gains `data_status` + `reference_code`; Export gains a pre-download preview; a few real analysis gaps (gender earnings gap, LGA equity comparison, field missingness). **Shares 9-59's `data_status` taxonomy + key-normalization map** (one map, both surfaces — see §6 inversion note).
- **Track B — Design-system enforcement:** the missing **`DataTable` primitive** (shadcn `table.tsx` + TanStack-Table recipe — the keystone); a **`Progress` primitive** for dynamic widths; **lint enforcement** (ban *arbitrary* inline `style={{}}`; add `eslint-plugin-tailwindcss`); migrate the raw-table + inline-style surfaces; the `@oslsr/utils` barrel-split (carved out of 9-59).
- **Track C — Role-dashboard completeness:** finish all 7 role dashboards to wireframe intent, **composing existing chart components** wherever possible (most "missing" widgets already exist elsewhere — see §3).

### Out of scope / non-goals
- **No new chart types or stat methods** — Track A is counting/legibility, not analysis volume.
- **No rebuild of working primitives or the 41 chart components** — reuse, don't fork.
- **No schema migration of the registry** beyond surfacing existing columns (`reference_code` exists; `data_status` is *derived*, not stored).
- **Not a launch gate.** Entire epic is **post-launch**; it must not block the field survey or the re-engagement blasts.

---

## 3. Per-page drift inventory (the story-list engine)

> Reconciled against the codebase 2026-06-16. **Note:** the §6 handoff figures were a dashboard-subset estimate; the scan found the structural gaps 100% real but the drift *counts* shifted (full app = 105 pages incl. auth/landing; inline-style overstated at "13", actual 6 pages / 25 instances; raw-table understated at "7" — actual 8 pages **+ 2 shared components**, Registry & Audit, which the page-scan missed).

### 3a. Shared analytics pages

| Page | File | DS flags | Built-vs-intended gap |
|---|---|---|---|
| **Registry** | `dashboard/pages/RespondentRegistryPage.tsx` + `components/RespondentRegistryTable.tsx:267` | raw `<table>` (TanStack, no shared primitive) | No `data_status` / `reference_code` columns or filter; summary strip counts diverge from the registry count |
| **Export** | `dashboard/pages/ExportPage.tsx` | clean (Card) | Only Summary (no answers) + Full (per-submission, subset). No unified mode; no pre-download data-health preview → **9-59** |
| **Survey Analytics** | `dashboard/pages/SurveyAnalyticsPage.tsx:117` | clean (Card) | "Total Respondents" = 76 mislabel; **N never shown per chart**; no Data-Health view. Rich otherwise (10 tabs, 41 charts, choropleth) |
| **Audit Trail** | `audit-log/pages/AuditLogPage.tsx` + `components/AuditLogResultsTable.tsx:162` | raw `<table>` (the proof case — page uses shadcn, component hand-rolls table) | DS migration only |

**Counting root cause (pinned):** `apps/api/src/services/survey-analytics.service.ts:663-699` `getRegistrySummary()` → `COUNT(*)` over `submissions` with `WHERE s.raw_data IS NOT NULL` (line 201) → returns `totalRespondents` ≈ 76 → rendered as "Total Respondents" at `SurveyAnalyticsPage.tsx:117`. `data_status` and `registryTotals`: **0 matches** anywhere. `reference_code`: in schema, on **no** UI table.

### 3b. Role dashboards (all 7 simplified vs wireframe — Epic 2.5 shells never finished)

| Role | File | Gap vs wireframe | Reuse available |
|---|---|---|---|
| Super-admin | `SuperAdminHome.tsx` | Tabbed layout, questionnaires table, staff-role breakdown table, recent-activity log, ODK Central health | DataTable (12-1); staff/forms APIs exist |
| Official | `OfficialHome.tsx` *(inline-style)* | Registration-trends chart, top-LGA ranking, top-skills breakdown, granular CSV/PDF/Custom export | **TrendsCharts, LGA choropleth, SkillsCharts already exist** — compose, don't build |
| Assessor | `AssessorHome.tsx` | Audit-queue table on home, evidence panel (GPS map), Verified/Rejected-Today + Avg-Review-Time KPIs | DataTable; VerificationFunnelChart, FieldCoverageMap exist |
| Supervisor | `SupervisorHome.tsx` | Fraud heat-map, GPS-cluster / speed / pattern alert cards, recent-submission timeline | FraudTypeBreakdownChart, choropleth, fraud APIs exist |
| Enumerator | `EnumeratorHome.tsx` | "Messages from Supervisor" card, offline banner, resume-drafts count visibility | messaging API + draft store exist |
| Data-entry clerk | `ClerkHome.tsx` | **Paper-Form-Queue table (core workflow)**, LGA filter, Avg-Time/Form KPI | DataTable; queue API exists |
| Public-user | `PublicUserHome.tsx` | Personalized greeting, "Update Your Information"/edit card, "Need Help?" card | profile API exists |

**Track C is mostly composition, not net-new build** — the keystone unlock is the DataTable primitive (12-1) plus surfacing chart components that already exist on *other* pages. This keeps Track C post-launch-safe and bounded.

### 3c. Design-system drift detail (Track B work-list)
- **Raw `<table>` surfaces (10):** `AuditLogResultsTable`, `RespondentRegistryTable`, `AssessorCompletedPage`, `OfficialProductivityPage`, `RespondentDetailPage`, `SupervisorTeamPage`, `SystemHealthPage`, `RevealAnalyticsPage`, `StaffPaymentHistoryPage`, `RegistryTestPage` (the last is a test page → delete/retire, not migrate).
- **Inline `style={{}}` pages (6):** `EnumeratorMessagesPage`, `OfficialHome`, `OfficialProductivityPage`, `SupervisorMessagesPage`, `SystemHealthPage`, `RegistryTestPage`. **Several are dynamic `width:${pct}%` progress bars** — legitimate runtime values → migrate to a `Progress` primitive, not banned outright.
- **No lint rule** in `apps/web/eslint.config.js` bans inline style or lints tailwind.

---

## 4. Sequenced story-shell list (foundation-first)

> Three tiers so the foundation lands before anything builds on it, and Track C (the largest) never blocks Track A/B. IDs are provisional (`12-N`); Bob assigns canonical IDs at `*create-story`.

### Tier 0 — Foundation (blocks everything; land first)
- **9-59 (IN-PROGRESS, EXISTING)** — Unified registry export **+ the canonical `data_status` taxonomy + cross-form-version key-normalization map.** Per the 2026-06-16 operator inversion (§6), 9-59 **defines** this shared module; Track A consumes it. *Reclassified into Epic 12 Track-A foundation.*
- **12-1 — `DataTable` primitive (keystone).** shadcn `table.tsx` + a TanStack-Table recipe supporting **both** server-pagination (Registry) and client-sort (Audit) so it's genuinely reusable. No page migrations yet — just the primitive + tests + a usage doc.
- **12-2 — Lint gate + `Progress` primitive.** Add `Progress` (shadcn) for dynamic widths; add a rule banning *arbitrary* inline `style={{}}` (`react/forbid-dom-props` or `no-restricted-syntax`, dynamic values routed through `Progress`/CSS-var); add `eslint-plugin-tailwindcss`. Land as **error** only after Tier-1 migrations clear (12-10/12-11), or scope the rule to migrated dirs first — Bob to decide the enforcement cutover.
- **12-3 — `@oslsr/utils` barrel-split** (carved out of 9-59 "ex-Task 6"). Split into a client-safe entry + `@oslsr/utils/server`, or an eslint rule banning web→bare-barrel imports; **verify with `vite build`** (this is the bug 9-58 hit). Track-B build-hygiene foundation.
- **12-4 — `registryTotals` aggregate model.** A shared service returning **distinct respondents (139)** split by `data_status` (`completed` / `data_lost` / `no_submission` / `pending_nin` / `nin_unavailable` / `imported`), **reusing 9-59's taxonomy** (do NOT define a second one). The single source of truth every analytics surface calls.

### Tier 1 — Honesty + DS migration (consume Tier 0)
- **12-5 — Label honesty + N-per-chart.** Fix the "Total Respondents" label across Survey Analytics + Registry summary strip; show the denominator (N) on every chart; distinguish "respondents" from "submissions with answers."
- **12-6 — Data Health view.** 139→76 funnel, `data_status` breakdown, per-field response-rates, the data-lost recovery cohort. New tab/page consuming 12-4.
- **12-7 — Registry table upgrade.** Add `data_status` + `reference_code` columns + a `data_status` filter; **migrate the table to the 12-1 `DataTable` primitive** in the same story.
- **12-8 — Export data-health preview.** Pre-download preview/summary on the Export page; the wire-in point for 9-59's unified mode.
- **12-10 — Raw-table migration sweep.** Migrate the 9 real raw-`<table>` surfaces (§3c) to `DataTable`; retire `RegistryTestPage`. Behavior-preserving; tests required.
- **12-11 — Inline-style migration sweep.** Move dynamic widths to `Progress`; remove arbitrary inline styles; then flip the 12-2 lint rule to **error**.

### Tier 2 — Enrichment + role-dashboard completeness (consume Tier 0/1)
- **12-9 — Analysis gaps.** Gender earnings gap, LGA equity comparison, field-missingness view (reuse existing equity/stat components).
- **12-12 … 12-18 — Role-dashboard completeness (one story per role)** per §3b, composing existing chart components + the `DataTable` primitive. Super-admin / Official / Assessor / Supervisor / Enumerator / Data-entry / Public-user. **Can be phased** — these are the largest chunk and the least urgent; safe to ship incrementally well after launch.

**Dependency spine:** `9-59 (taxonomy) → 12-4 (totals) → {12-5, 12-6, 12-7, 12-8}` ; `12-1 (DataTable) → {12-7, 12-10, 12-12…12-18}` ; `12-2/12-3 (lint/barrel) → {12-10, 12-11}`.

---

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Scope blob** (Track C is 7 feature stories) | Tier it; Track C is Tier 2 and explicitly phaseable. Compose existing charts; don't rebuild. |
| **Gating the launch** | Whole epic is post-launch + non-gating. No FRC item depends on it. State this on every story. |
| **`data_status` definition divergence** (export vs analytics) | The whole point of 12-4 reusing 9-59's taxonomy. One taxonomy, two surfaces. Enforce in review. |
| **DataTable not actually reusable** (only fits one page) | 12-1 must support server-pagination *and* client-sort up front (Registry + Audit are the two shapes). |
| **Lint flip breaks CI** | Land rule as warn or dir-scoped; flip to error only after 12-10/12-11 migrations clear. |
| **Migration regressions on shared pages** | Behavior-preserving migrations + tests; the existing pre-push gate (lint+tsc+build+test) covers it. |
| **Barrel-split repeats the 9-58 build break** | 12-3 must `vite build` as its acceptance check, not just tsc. |

---

## 6. ⚠️ Sequencing inversion — impact & mitigation (do not lose)

The handoff §6 and the 9-59 story file both said *"sequence 9-59 AFTER the foundation."* **Superseded by the operator on 2026-06-16** (`sprint-status.yaml:420`): 9-59 was picked up as a dev-story and is **building the canonical `data_status` taxonomy + key-normalization map** — inverting the soft-dependency. **This brief aligns to the board:** 9-59 is a **Track-A foundation** item that *defines* the taxonomy; `12-4 (registryTotals)` and the analytics consumers reuse it.

### Is this net-positive or risky?
**Net mildly positive, with one fully-mitigable failure mode.**
- **Upside:** 9-59 met a real operational need now; the taxonomy is forged against *real export data*, not a speculative abstraction.
- **Failure mode:** an *export* story crystallizing a *cross-cutting* foundation can (1) embed `data_status` **export-local** (in `export-query.service.ts`) where analytics can't reach it → the **fork we're trying to prevent**; (2) produce a **one-consumer abstraction** that fits CSV and nothing else; (3) under/over-build relative to the aggregate needs of `registryTotals`.

### Mitigations (now baked into the 9-59 story file + this plan)
1. **Extract the taxonomy to a SHARED, consumer-agnostic module** (importable by export *and* analytics) — not export-local. *The #1 mitigation.* ← added as a corrective requirement on 9-59.
2. **Clean seam by altitude:** 9-59 owns the **row-level atom** (`deriveDataStatus(...)` + the table-driven key-map); **12-4** owns the **aggregate** (counts / 139→76 funnel / response-rates) over that atom. No overlap, no fork.
3. **Foundation-reuse review gate on 9-59:** code review must verify "can analytics consume this module unmodified?"
4. **12-4 as fast-follow** — provides the second consumer that proves the abstraction generalizes.
5. **Story-file correction (done 2026-06-16):** the 9-59 Dependencies section was **reversed in-flight** (it still told the dev to consume a foundation built first + sequence after — the opposite of the live plan); now reflects 9-59-defines-the-module + the four corrective requirements. The `Status:` header (`ready-for-dev`) remains stale vs the board (`in-progress`) — 9-59 dev to reconcile on next update.

**Verdict:** the inversion does *not* harm the epic provided the taxonomy ships as a shared module at the row-level altitude. Left uncorrected, the live risk was the **contradictory 9-59 story file** misdirecting the dev — that is now fixed.

---

## 7. Parity sweep (epics ↔ sprint-status ↔ PRD ↔ architecture ↔ UX-spec ↔ project-context)

**Already consistent (handoff §3 shipped + reflected on the board):** 9-55, 9-56, 9-57, 9-58, 9-30, 9-28 → `done`; 9-18 → `review` (sole gate AC#E9, window closes 2026-06-18).

**Drift found + disposition:**
1. **`prep-epic-4: in-progress` → `done`** — all 11 children `done`, Epic 4 `done`, downstream `prep-epic-5: done`. Stale grouping marker. **FIXED this session.**
2. **`prep-epic-7: in-progress` → `done`** — all 11 children + doc-1/2/3 `done`, Epic 7 `done`. Stale grouping marker. **FIXED this session.**
3. **9-59 epic membership** — listed under Epic 9 on the board; canonically belongs to **Epic 12, Track A**. Registered into Epic 12 in this brief; board grouping note added (status stays `in-progress`).
4. **9-59 story-file header** (`ready-for-dev`) vs board (`in-progress`) — minor doc drift; 9-59 dev to reconcile (§6).
5. **PRD / architecture / UX-spec:** the wireframes (`_bmad-output/wireframes/`) are the Track-C north-star but are **not referenced from the UX-spec**; Track-C stories should cite both. Epic 2.5's "shells, not finished" status should be cross-noted when Epic 12 lands (Epic 12 completes 2.5's intent). **No destructive regen** — audit-only per project convention.

**Recommended (not yet done — additive planning edits):** register **Epic 12** + the §4 story shells in `epics.md` (Epic List + detailed section) and as `backlog` rows in `sprint-status.yaml`, so Bob's `*create-story` can consume them. *Holding for your go-ahead before mutating the canonical epic file — see hand-off below.*

---

## 8. Hand-off

1. **PM (this brief):** done — goal/value/scope, 3 tracks, foundation-first sequencing, risks, per-page inventory, story shells, parity sweep.
2. **Operator/PM:** confirm registration of Epic 12 + shells into `epics.md` + `sprint-status.yaml` (additive).
3. **Bob (SM):** author each Tier-0 shell first via canonical `*create-story --yolo` (12-1 DataTable, 12-2 lint/Progress, 12-3 barrel-split, 12-4 registryTotals), reconciling against 9-59's in-flight taxonomy.
4. **Constraint on every story:** post-launch, non-gating; reuse the 41 charts + shadcn primitives; don't rebuild.

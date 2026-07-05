# Story 13.6: Channel & Coverage Dashboard — Campaign Channel Breakdown + LGA × Trade Coverage-vs-Target (Dimension-Add, NOT a New Dashboard)

Status: backlog

> 🔗 **Consumes the [Registry Data-Status Taxonomy](../planning-artifacts/registry-data-status-taxonomy.md)** (2026-07-01; **12-4** is the derivation MODEL). The channel breakdown reads the **provenance (source) axis**; coverage (LGA × trade) must show **verified vs pending-verification separately** (association `unverified_import` rows never inflate a coverage-vs-target claim). _Amendment only — ACs unchanged._

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-25 by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). FAST-FOLLOW (post-launch). DEPENDS-ON Epic 12 (12-4 + 12-6) to avoid the 76-vs-139 mislabel. A DIMENSION-ADD that EXTENDS existing analytics — NOT a new dashboard. -->

## Story

As an **official / supervisor steering a live launch across 33 LGAs and a five-channel spend**,
I want **registrations broken down by acquisition channel (and station) AND an LGA × trade coverage-vs-target view — surfaced on the dashboards I already use**,
so that **I can compute cost-per-registration per channel (renew radio on evidence, kill a weak platform) and see which LGAs are under-covered for which trades, then steer enumerators into the thin LGAs — making representativeness an active control, not a hope.**

## Context & Why This Is a Dimension-Add (NOT a New Dashboard)

The launch needs attribution + coverage **reporting** so the spend and the field deployment are evidence-driven [Source: docs/launch-campaign/attribution-spec.md:45]. This story is **fast-follow / post-launch** — Monday only needs CAPTURE live (Story 13-1); the report can wait [Source: docs/launch-campaign/attribution-spec.md:43] [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:57].

### HARD DEPENDENCY — Epic 12 (12-4 + 12-6) FIRST, to avoid the 76-vs-139 mislabel
This story **DEPENDS-ON Epic 12 stories 12-4 (registryTotals honest denominator) + 12-6 (data-health view)** and MUST NOT be built before them [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-6-channel-and-coverage-dashboard]:
- **12-4 — registryTotals aggregate model** (`ready-for-dev`) [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md:3] supplies the **honest denominator**. A coverage/CPA dashboard built on a wrong total reproduces the "76-vs-139 mislabel" — coverage % and CPA are only meaningful against a defensible denominator.
- **12-6 — Data Health view** (`ready-for-dev`) [Source: _bmad-output/implementation-artifacts/12-6-data-health-view.md:3] supplies the data-status framing this dashboard's numbers must be consistent with.

Building this on the pre-12-4 numbers is explicitly the failure mode this dependency exists to prevent.

### REUSE + EXTEND existing analytics — do NOT invent a new dashboard
This is a **dimension-add** on the existing analytics surfaces [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-6-channel-and-coverage-dashboard]:
- `report.service.getOverviewStats` already returns `sourceBreakdown` [Source: apps/api/src/services/report.service.ts:52-56] → **add a channel breakdown** (a `getCampaignBreakdown`, channel from 13-1's `raw_data.campaign_source`).
- `survey-analytics.getTrends(params.source)` already filters by source via `s.source = ${params.source}` [Source: apps/api/src/services/survey-analytics.service.ts:621,734-735] → **extend to `campaignSource`** (filter/group by `raw_data->'campaign_source'->>'channel'`).
- `survey-analytics.getSkillsInventory` already returns `byLga` + `gapAnalysis` + `diversityIndex` [Source: apps/api/src/services/survey-analytics.service.ts:913,955-957,1000-1125] → **extend for an LGA × trade coverage-vs-target view**.

Channel comes from **Story 13-1's `raw_data.campaign_source`** [Source: docs/launch-campaign/attribution-spec.md:36]. Surface to the **existing** `OfficialHome` / `SupervisorHome` dashboards [Source: apps/web/src/features/dashboard/pages/OfficialHome.tsx] [Source: apps/web/src/features/dashboard/pages/SupervisorHome.tsx] and the supervisor-per-LGA network (so supervisors steer enumerators into thin LGAs).

## Acceptance Criteria

### AC1 — Campaign channel breakdown (extend `sourceBreakdown`, not a new layer)
1. A channel breakdown of completed registrations is available — counts per acquisition channel (Radio/TV/Word-of-mouth/Association/Search/FB/IG/X/Other) read from `raw_data->'campaign_source'->>'channel'` [Source: docs/launch-campaign/attribution-spec.md:43] [Source: docs/launch-campaign/attribution-spec.md:36] — implemented as a `getCampaignBreakdown` that **mirrors the shape/pattern of `getOverviewStats.sourceBreakdown`** [Source: apps/api/src/services/report.service.ts:52-56], NOT a new analytics subsystem.
2. Where a station dimension is present in `campaign_source` (e.g. `{ channel: 'radio', station: 'fresh_fm' }`), the breakdown can split channel × station [Source: docs/launch-campaign/attribution-spec.md:38].
3. Counts are computed against the **honest denominator from 12-4's registryTotals** — coverage %/totals are consistent with 12-4, never an ad-hoc total (AC depends on 12-4) [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md:3].

### AC2 — `campaignSource` filter on trends (extend the existing `source` param)
1. `survey-analytics.getTrends` is extended to accept a `campaignSource` filter — group/filter trends by `raw_data->'campaign_source'->>'channel'`, following the **same pattern** as the existing `params.source` → `s.source = ${params.source}` filter [Source: apps/api/src/services/survey-analytics.service.ts:734-735], not a parallel path.
2. The filter is parameterised (Drizzle `sql`-tagged bound params; fixed JSON accessor for the channel key; never user-concatenated SQL).

### AC3 — LGA × trade coverage-vs-target view (extend `getSkillsInventory.byLga`)
1. An **LGA × trade coverage-vs-target** view is delivered by **extending** `getSkillsInventory` (`byLga` / `gapAnalysis` / `diversityIndex` already exist) [Source: apps/api/src/services/survey-analytics.service.ts:955-957,1000-1125] — surfacing, per LGA, registration counts by trade against a target so **under-covered LGA × trade cells are visible** [Source: docs/launch-campaign/attribution-spec.md:45]. It REUSES the existing threshold/`byLga` machinery; it does NOT add a separate skills-analytics path.
2. The view optionally crosses in the channel dimension (LGA × trade × channel) where useful for steering, consistent with the spec's "registrations by LGA × trade × channel" framing [Source: docs/launch-campaign/attribution-spec.md:45] — but the load-bearing output is the LGA × trade coverage gap (where to send enumerators).
3. Coverage % uses the 12-4 honest denominator; the view is consistent with 12-6's data-health framing (no double-counting / honest status) (depends on 12-4 + 12-6) [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md:3] [Source: _bmad-output/implementation-artifacts/12-6-data-health-view.md:3].

### AC4 — Surfaced on the EXISTING official + supervisor dashboards (no new dashboard)
1. The channel breakdown (AC1) and the LGA × trade coverage view (AC3) are surfaced on the **existing** `OfficialHome` [Source: apps/web/src/features/dashboard/pages/OfficialHome.tsx] and `SupervisorHome` [Source: apps/web/src/features/dashboard/pages/SupervisorHome.tsx] dashboards — composing existing chart/table primitives; NO new standalone dashboard page is introduced.
2. The supervisor view is scoped to the supervisor's LGA network (the supervisor-per-LGA structure) so a supervisor sees their thin LGAs and can steer enumerators into the gaps [Source: docs/launch-campaign/attribution-spec.md:45].
3. RBAC + scope reuse the existing analytics gating (officials see system scope; supervisors see their team/LGA scope) — no new role or gating model.

### AC5 — CPA enablement + tests
1. The channel breakdown exposes per-channel completion counts sufficient to compute **CPA = spend ÷ completions** per channel (spend is an operator input, not stored) and to support the 48-hour CPA kill-switch decision [Source: docs/launch-campaign/attribution-spec.md:44].
2. Tests assert: the channel breakdown counts by `campaign_source.channel`; `getTrends` `campaignSource` filter narrows correctly; the LGA × trade coverage view surfaces gap cells; counts reconcile with 12-4's denominator. Full `pnpm test` green; tsc + lint clean.

## Tasks / Subtasks

- [ ] **Task 1 — Channel breakdown extending `sourceBreakdown` (AC1)**
  - [ ] Add `getCampaignBreakdown` mirroring `getOverviewStats.sourceBreakdown` [Source: apps/api/src/services/report.service.ts:52-56], grouping by `raw_data->'campaign_source'->>'channel'` (+ optional `station`) (AC1.1, AC1.2). Compute against 12-4's registryTotals denominator (AC1.3).

- [ ] **Task 2 — `campaignSource` filter on `getTrends` (AC2)**
  - [ ] Extend `getTrends` to accept `campaignSource`, following the existing `s.source = ${params.source}` pattern (AC2.1) [Source: apps/api/src/services/survey-analytics.service.ts:734-735]; parameterised, fixed JSON accessor (AC2.2).

- [ ] **Task 3 — LGA × trade coverage-vs-target (AC3)**
  - [ ] Extend `getSkillsInventory` (`byLga`/`gapAnalysis`) to surface LGA × trade counts vs target → visible gap cells (AC3.1) [Source: apps/api/src/services/survey-analytics.service.ts:955-957,1000-1125]; optional LGA × trade × channel cross (AC3.2); coverage % on the 12-4 denominator + consistent with 12-6 (AC3.3).

- [ ] **Task 4 — Surface on existing OfficialHome + SupervisorHome (AC4)**
  - [ ] Compose the channel breakdown + coverage view into `OfficialHome` [Source: apps/web/src/features/dashboard/pages/OfficialHome.tsx] and `SupervisorHome` [Source: apps/web/src/features/dashboard/pages/SupervisorHome.tsx] using existing primitives — NO new dashboard page (AC4.1). Supervisor scoped to their LGA network (AC4.2); reuse existing analytics RBAC/scope (AC4.3).

- [ ] **Task 5 — CPA enablement + tests (AC5)**
  - [ ] Ensure per-channel completion counts support CPA = spend ÷ completions + the 48h kill-switch (AC5.1) [Source: docs/launch-campaign/attribution-spec.md:44].
  - [ ] Tests: channel breakdown by `campaign_source.channel`; `campaignSource` trends filter; LGA × trade gap cells; reconciliation with 12-4 denominator (AC5.2). Full `pnpm test` green; tsc + lint clean.

## Dev Notes

### Architecture & engine map (cite these exact targets — EXTEND, don't invent)
- **`sourceBreakdown` (extend → channel):** `apps/api/src/services/report.service.ts:23-58` (`getOverviewStats` returns `sourceBreakdown: { enumerator, public, clerk }`). Add `getCampaignBreakdown` in the same shape.
- **`source` param (extend → `campaignSource`):** `apps/api/src/services/survey-analytics.service.ts:621` (`getTrends`), filter at `:734-735` (`s.source = ${params.source}`). Mirror for the channel JSON accessor.
- **`getSkillsInventory` byLga/gapAnalysis/diversityIndex (extend → LGA × trade coverage):** `apps/api/src/services/survey-analytics.service.ts:913,955-957,1000-1125`.
- **Channel source-of-truth:** Story 13-1's `submissions.raw_data.campaign_source` [Source: docs/launch-campaign/attribution-spec.md:36].
- **Dashboard surfaces (EXISTING — surface here):** `apps/web/src/features/dashboard/pages/OfficialHome.tsx`, `apps/web/src/features/dashboard/pages/SupervisorHome.tsx`.

### DEPENDENCY discipline (read before coding)
- **Do NOT build this before Epic 12 stories 12-4 + 12-6 land.** 12-4 (`registryTotals` honest denominator) [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md:3] and 12-6 (data-health view) [Source: _bmad-output/implementation-artifacts/12-6-data-health-view.md:3] are the guardrail against the 76-vs-139 mislabel — coverage % and CPA are meaningless on a wrong total [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-6-channel-and-coverage-dashboard].
- **EXTEND, don't invent:** every number rides an existing analytics function (`getOverviewStats`/`getTrends`/`getSkillsInventory`) and an existing dashboard (`OfficialHome`/`SupervisorHome`). If you're creating a new analytics subsystem or a new dashboard page, stop.

### Critical implementation rules (from project-context.md)
- **Parameterised SQL only** — extend the predicates with Drizzle `sql`-tagged bound params; the channel value is a fixed JSON accessor, never `sql.raw` with user input (the existing `STATUS_FILTER_MAP` `sql.raw` is a fixed allow-list only).
- **Raw-SQL schema-drift guard** — these analytics use raw `db.execute(sql)`; add a real-DB integration assertion so a renamed/removed JSON key is caught (the analytics-500-in-prod-only class).
- **Tests** — API real-DB integration (`beforeAll`/`afterAll`, scratch DB); web co-located; `pnpm test` per package.

### Dependencies & sequencing
- **HARD deps:** Story 13-1 (`raw_data.campaign_source` — the channel source); **Epic 12 12-4 + 12-6** (honest denominator + data-health framing — MUST land first).
- **Tier:** FAST-FOLLOW / post-launch — not a pre-spend gate [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:57].
- **Consumes:** Story 13-2's `imported_association` rows + enumerator rows in the LGA × trade coverage (source-by-construction channels).

### Scope OUT (do not build)
- A new standalone dashboard page (surface on existing OfficialHome/SupervisorHome).
- A new analytics subsystem (extend `getOverviewStats`/`getTrends`/`getSkillsInventory`).
- Storing ad spend (CPA spend is an operator input; the dashboard supplies the completions denominator only).
- Pixel-based conversion analytics (parked in 13-1).
- Building on pre-12-4 totals (the dependency exists precisely to forbid this).

### References
- [Source: docs/launch-campaign/attribution-spec.md:36,43-45] — campaign_source shape, reporting, LGA × trade × channel coverage, CPA kill-switch
- [Source: apps/api/src/services/report.service.ts:52-56] — sourceBreakdown (extend → channel)
- [Source: apps/api/src/services/survey-analytics.service.ts:621,734-735,913,955-957,1000-1125] — getTrends source param + getSkillsInventory byLga/gapAnalysis/diversityIndex (extend)
- [Source: apps/web/src/features/dashboard/pages/OfficialHome.tsx] + [Source: apps/web/src/features/dashboard/pages/SupervisorHome.tsx] — existing dashboards to surface on
- [Source: _bmad-output/implementation-artifacts/12-4-registrytotals-model.md:3] + [Source: _bmad-output/implementation-artifacts/12-6-data-health-view.md:3] — HARD deps (honest denominator + data-health)
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-6-channel-and-coverage-dashboard] — scope note (dimension-add, depends-on 12-4/12-6, REUSE+EXTEND)

## Change Log

| Date | Change |
|------|--------|
| 2026-06-25 | Story authored by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 5 ACs (channel breakdown extending sourceBreakdown; `campaignSource` filter extending getTrends `source`; LGA × trade coverage-vs-target extending getSkillsInventory byLga; surface on existing OfficialHome/SupervisorHome; CPA enablement + tests). DIMENSION-ADD that EXTENDS existing analytics — NOT a new dashboard. HARD dep on Epic 12 12-4 + 12-6 (honest denominator → avoid the 76-vs-139 mislabel). Status → backlog. FAST-FOLLOW (post-launch). |
| 2026-07-04 | **13-16 parity note (Amelia):** `respondents.lgaId` is now canonically the `lgas.code` slug on EVERY channel (wizard writes slug + server guard; the 139 UUID rows backfilled — prod run = operator residual). Per-LGA coverage (AC3's LGA × trade view, `byLga`, `lgasCovered`) is trustworthy once the prod backfill runs. ⚠️ Residual: the live master form's `lga_list` values diverge from `lgas.code` for 6/33 LGAs (`ibadan_ne/nw/se/sw`, `ogbomoso_*`) — enumerator rows for those LGAs mis-bucket until the form values are aligned (see 13-16 AC5 audit + 13-14 Task-2 constraint). |

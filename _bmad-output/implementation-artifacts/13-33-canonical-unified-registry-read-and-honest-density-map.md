# Story 13-33: Canonical unified registry read + honest density map (three-source convergence)

Status: ready-for-dev

<!-- Authored 2026-07-18 by Bob (SM). FOUNDATIONAL. The registry has three intended data sources — Public Wizard, Field Enumeration, Association/Other ingestion — and the "nothing is missing" convergence must be a SINGLE canonical read, not re-derived per consumer. Verified today: getUnifiedExportData is respondent-anchored (correct — includes submission-less imported rows), but public-insights breakdowns + the density map are `FROM submissions` (submission-anchored) → they silently exclude submission-less rows and can drift from the headline count (exactly the 13-25 class). imported_association is still only an enum+taxonomy (13-2), so source #3's read contract must be designed NOW, before the importer is built. This story makes the convergence a single source and proves it end-to-end on the Registration Density Map (which is currently near-blank). NOT launch-gating, but it is the foundation the GPS-removal / dedup-UX / marketplace-skills surface fixes should sequence under. -->

## Story
As **a consumer of registry data (public insights, marketplace, exports, dashboards)**,
I want **one canonical, respondent-anchored unified read that every source writes into and every consumer reads from**,
so that **the Public Wizard, Field Enumeration, and Association/Other imports converge into a single honest source — nothing counted twice, nothing silently excluded — and the Registration Density Map (and every other view) reflects the whole registry.**

## Context & Evidence (verified 2026-07-18)
- **The convergence spine is `respondents` ⟕ `submissions`.** `respondents` = the person: identity (nin/name/dob/phone), **geography (`lga_id`)**, consent, `source` (enumerator | public | imported_association | imported_*), `status`, import provenance. `submissions.raw_data` (JSONB) = the answers (skills, employment, gender, business). There is **no denormalized respondent column for survey fields** — they live only in `raw_data`.
- **The canonical read is `getUnifiedExportData` (export-query.service.ts): respondent-anchored** — `FROM respondents r LEFT JOIN submissions s ON s.respondent_id = r.id`, `DISTINCT ON (r.id)` latest submission, `COALESCE(NULLIF(r.<col>,''), s.raw_data->>'<key>', …)`. Because it starts `FROM respondents`, a person with **no** submission (imported rows) still appears. This is the "nothing is missing" shape.
- **The inconsistency:** `public-insights.service.ts` breakdowns + `lgaRows` (the density map source) are **`FROM submissions s LEFT JOIN respondents r`** — submission-anchored. They (a) **exclude** any respondent with no submission (future association imports), and (b) can **drift** from the respondent-scoped headline count (`getRegistryCountCore`, 13-25) — the same drift class 13-25 already fixed once for the headline. The convergence is re-derived in ≥4 places (getUnifiedExportData, getRegistryCountCore, public-insights, marketplace) that can disagree.
- **Source #3 is unbuilt.** `imported_association` is an enum value + taxonomy only (13-2, "taxonomy foundation"); no live importer. So its read/write contract must be fixed now: it must write **both** a respondent row AND a `submissions` row with `raw_data`, or association members are counted but invisible to skills/marketplace/insights.
- **The density map is near-blank for a *different* reason** (small-cell suppression) — verified on prod: 143 respondents across 29 LGAs, only **4 clear n≥10** (ibadan_north 16, egbeda 14, oyo_east 11, lagelu 11). The n≥10 floor is k-anonymity disclosure control on a **public** page — it must NOT be removed; it must be **re-encoded as banded disclosure** so the map shows a distribution without leaking exact small counts.

## Acceptance Criteria
1. **AC1 — One canonical unified read.** Introduce a single respondent-anchored unified registry read — **preferably a DB view `registry_unified`** (so "the table everything reads from" is literal), or one shared service (`getRegistryUnifiedQuery()`) if a view proves impractical after a short spike (perf on the COALESCE/LATERAL; materialization + refresh if needed). It anchors `FROM respondents`, LEFT JOINs the latest submission, COALESCEs denormalized-column ↔ `raw_data`, and exposes the **3-axis status** per the Registry Data-Status Taxonomy (source / completeness / verification; mirrors 12-4's `getRegistryTotals` intent). Include `lga_id`, consent flags, and the survey fields the current consumers need (gender, employment, business, skills).
2. **AC2 — Repoint the public-insights reads to it (respondent-anchored).** `public-insights` headline **and breakdowns and the density `lgaRows`** all read the canonical source, so they (a) agree with the headline count by construction (kill the drift class) and (b) count **per respondent** (no double-count from multiple submissions; no exclusion of submission-less rows). Verify the density counts equal `SELECT lga_id, COUNT(DISTINCT r.id)` over the unified read.
3. **AC3 — Honest density map (banded disclosure, floor preserved).** Replace binary blank-suppression with three states: **0 → blank**, **1–9 → lightest "present" shade with NO exact number**, **≥10 → graduated shades with counts**. Remove the redundant double-suppression (backend `PUBLIC_MIN_N` is the single authority; frontend stops re-suppressing). The k-anonymity floor on **exact** numbers stays. Verify against current prod data: the map renders 4 graduated LGAs + ~25 "present" + the rest blank — a visible distribution, not a dead map. (Optional AC3b: a zone / senatorial-district toggle that always clears n≥10.)
4. **AC4 — Every source writes respondent + submission (the invariant).** Document the ingestion contract — **each channel produces a respondent (with denormalized identity/geo) AND a `submissions` row with `raw_data`** — and add a guard/test asserting live channels (wizard, field, webhook) satisfy it. For the **not-yet-built** association importer: encode the contract as the read's design + a documented requirement + a failing/`todo` test, so when it lands it must write both rows (close the "imports are the exception" carve-out rather than inherit it). Do NOT build the importer here.
5. **AC5 — No consumer left on a private query for the same facts.** Marketplace + export + any dashboard that computes the same registry facts either read the canonical source or are explicitly documented as intentionally-scoped (with why). Prove parity: the unified read's respondent count == 13-25 count-core == export row count.
6. **AC6 — Green + no regression.** Full API + web suites, tsc, eslint clean; public /insights numbers unchanged for the headline (already respondent-scoped) and the density map now populated; CI deploy green; VPS SHA.

## Tasks / Subtasks
- [ ] **Task 1 (AC1)** — Spike view-vs-service; build the canonical respondent-anchored unified read with 3-axis status; test it directly.
- [ ] **Task 2 (AC2/AC3)** — Repoint public-insights headline + breakdowns + density to it; implement banded disclosure + drop double-suppression in `LgaChoroplethMap`/`PublicInsightsPage`; verify against prod-shaped data.
- [ ] **Task 3 (AC4)** — Document + guard the respondent+submission invariant for live channels; encode the association-importer contract as design + a `todo` test.
- [ ] **Task 4 (AC5)** — Audit marketplace/export/dashboard reads; repoint or document-scope; prove count parity across insights/export/count-core.
- [ ] **Task 5 (AC6)** — Full suites/build/tsc/eslint; push; green deploy; VPS SHA; eyeball the live density map.

## Dev Notes
- **The spine, precisely:** `respondents` is the person (identity/geo/consent/status/provenance); `submissions.raw_data` is the answer payload; the unifier is `FROM respondents LEFT JOIN latest-submission` + `COALESCE(denorm, raw_data->>key)`. Everything canonical reads this way. `getUnifiedExportData` (export-query.service.ts:65-130) is the reference implementation — lift its shape into the canonical read rather than re-inventing.
- **Why respondent-anchored is non-negotiable:** submission-anchored reads drop submission-less imported people and can double-count multi-submission respondents. The headline (13-25) is already respondent-scoped; making the breakdowns match removes the drift.
- **Banding, not removal (AC3):** the n≥10 floor is disclosure control on a public page — deleting it risks re-identification in sparse LGAs, esp. cross-tabbed with the other public aggregates. Banded "present (<10)" reveals coverage, not counts. The DPIA (appendix-h-dpia) supports a "fewer than 10" band over exact small cells.
- **Source #3 contract:** when the association importer is built (future), it MUST write respondent + submission(raw_data with skills/sector), or association members won't appear in marketplace/insights despite being counted. This story fixes the *read* to include them and *documents* the write contract; it does not build the importer.
- **Consolidation guardrail:** the goal is ONE read. Resist leaving a second hand-written registry query behind "just for this consumer" — that's how 13-25's drift happened. If a consumer needs a narrower slice, derive it FROM the canonical read.
- **View perf:** a plain view over COALESCE + LATERAL + DISTINCT ON may be slow at scale; if so, a materialized view with a refresh hook (on submission/respondent write, or a short cron) is acceptable — spike it. Public insights is already Redis-cached (1h), so read latency there is not on the hot path.
- **Sequences the surface fixes:** GPS-removal (form-only, pre-blast), dedup-UX polish, and marketplace-skills all become consumers of / independent of this foundation. This story is the convergence point they sit on.

### References
- [Source: export-query.service.ts:65-130 — getUnifiedExportData, the respondent-anchored reference read (COALESCE denorm↔raw_data, DISTINCT ON r.id, latest submission)]
- [Source: public-insights.service.ts — submission-anchored breakdowns + lgaRows (:210 COALESCE(l.name,r.lga_id) label, PUBLIC_MIN_N=10); the drift + exclusion to fix]
- [Source: registry-totals.service.ts getRegistryCountCore (13-25) — respondent-scoped headline; getUnifiedExportData LATERAL mirror]
- [Source: db/schema/respondents.ts — the spine (source enum, lga_id, denormalized identity, metadata jsonb ≠ answers); submissions.ts — raw_data + gps + source]
- [Source: planning-artifacts/registry-data-status-taxonomy.md — the 3-axis contract; 12-4 getRegistryTotals; 13-2 imported_association enum foundation]
- [Source: PublicInsightsPage.tsx:127 LgaChoroplethMap suppressionMinN={10}; dashboard/config/lgaGeoMapping.ts (17 entries vs 33 LGAs — basemap coverage to check under AC3)]

## Dev Agent Record
_(to be completed by the dev)_

### File List
_(to be completed by the dev)_

## PM Validation (to be completed)

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-18 | Story drafted via *create-story. Foundational three-source convergence: one canonical respondent-anchored unified read (view/service) that every source writes into (respondent + submission.raw_data) and every consumer reads from — killing the submission-anchored drift/exclusion in public-insights and designing source #3's (association) read contract before the importer exists. Proven end-to-end on the density map, which also gets banded disclosure (present-<10 / graduated-≥10) so it shows a real distribution now without removing the k-anonymity floor. NOT launch-gating; the foundation the GPS/dedup/marketplace surface fixes sequence under. | Bob (SM) |

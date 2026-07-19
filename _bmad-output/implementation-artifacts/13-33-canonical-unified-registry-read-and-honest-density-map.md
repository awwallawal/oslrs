# Story 13-33: Canonical unified registry read + honest density map (three-source convergence)

Status: done

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
- [x] **Task 1 (AC1)** — Spike view-vs-service; build the canonical respondent-anchored unified read with 3-axis status; test it directly.
- [x] **Task 2 (AC2/AC3)** — Repoint public-insights headline + breakdowns + density to it; implement banded disclosure + drop double-suppression in `LgaChoroplethMap`/`PublicInsightsPage`; verify against prod-shaped data.
- [x] **Task 3 (AC4)** — Document + guard the respondent+submission invariant for live channels; encode the association-importer contract as design + a `todo` test.
- [x] **Task 4 (AC5)** — Audit marketplace/export/dashboard reads; repoint or document-scope; prove count parity across insights/export/count-core.
- [x] **Task 5 (AC6)** — Full suites/build/tsc/eslint (deploy/VPS SHA is the operator's post-review step).

### Review Follow-ups (AI) — adversarial code-review 2026-07-19 (Awwal)

_No CRITICAL/HIGH findings — every AC traces to executing implementation; File List matches git exactly; API+web tsc + changed unit tests independently reproven green (36 API + 11 web pass). Items below FIXED in the same review pass (see Change Log)._

- [x] **[AI-Review][Med] M1 — map↔table honesty gap.** `PublicLgaTable` filtered `!b.suppressed`, silently dropping banded LGAs while the map shaded them "present" — a new same-page contradiction. FIXED: table now renders banded LGAs as "Fewer than 10" (share `-`). `apps/web/src/features/insights/components/PublicLgaTable.tsx:11,32` + new test `__tests__/PublicLgaTable.test.tsx`.
- [x] **[AI-Review][Med] M2 — `bandSmallBuckets` incoherent state.** A pre-nulled bucket (`count===null`) was stamped `banded:false` → `{suppressed:true,banded:false,count:null}`. FIXED: pass such buckets through untouched. `apps/api/src/utils/analytics-suppression.ts:46` + test case.
- [x] **[AI-Review][Low] L1 — dead SQL column.** Summary query computed `AS total` but code reads `countCore.withAnswers`; removed the column + `SummaryRow.total`. `apps/api/src/services/public-insights.service.ts` summary block + `SummaryRow`.
- [x] **[AI-Review][Low] L2 — `'Unknown'` LGA leak.** Density counted null-`lga_id` respondents into an unplaceable `'Unknown'` bucket (now more likely with submission-less imports). FIXED: density query excludes `lga_id IS NULL` (still in the headline; just not on the geographic map). `public-insights.service.ts` density query.
- [x] **[AI-Review][Low] L4 — view-init no-view window.** Runner did unconditional `DROP` then `CREATE OR REPLACE`. FIXED: try atomic `CREATE OR REPLACE` first; DROP+CREATE only on a column-set-change error. `apps/api/scripts/migrate-registry-unified-view-init.ts`.
- [ ] **[AI-Review][Low] L3 — inline canonical subquery re-scanned 8×/cache-miss. → HANDED TO 12-4 (owner assigned 2026-07-19).** `computeInsights` composes `registryUnifiedSource('ru')` into 8 separate `db.execute` calls, each re-running the full `respondents ⟕ LATERAL` scan. **Not a bug, and benefit of fixing is near-zero today** — the 1h Redis cache means the 8 scans happen at most once/hour per cache-miss, each LATERAL is index-backed (`idx_submissions_respondent_id`) and a respondent carries ~1–2 submissions, so per-respondent work is a tiny index lookup + 1-row sort. This is a **scale hedge, not a defect**.
  - **Why not auto-fixed:** a cross-statement CTE/temp-table can't share the scan across separate pooled executions (the `Promise.all` fans out over up to 8 connections; a temp table forces a single-connection transaction that serialises them) and would rewrite the mocked-DB sequence tests — real churn for ~zero gain. A materialized view adds a *second* staleness layer + `REFRESH` locking + a refresh hook. The story + PM validation deliberately deferred materialization (YAGNI).
  - **Handover decision (owner = Story 12-4):** 12-4 is the aggregate/scale story — it reads the SAME `registry_unified` shape and *adds* a consumer (`getRegistryTotals` + `/analytics/registry-totals`), so it is the natural forcing function for the materialize-vs-index call. **12-4's materialization spike closes L3** by choosing ONE of: (a) materialize `registry_unified` + flip `registryUnifiedSource` onto the MV — a **one-line runtime switch** the dev pre-built (inline↔view proven equal by the parity smoke), which resolves L3 for *all* consumers at once (public-insights, count-core, 12-4's own aggregate); or (b) add composite index `submissions(respondent_id, submitted_at DESC)` (additive, no restructuring, no staleness — hardens the unified read, count-core, AND export together). **Trigger (numeric — John/PM 2026-07-19):** act when EITHER `respondents` row count **> 5,000** OR public /insights cache-miss p95 compute latency **> 500 ms** (whichever first). **Index-first** (option b — cheap, additive), materialize (option a) only if the index doesn't hold. Below both thresholds, stay inline — do nothing. Recorded in the 12-4 story by Bob (SM) + validated by John (PM), 2026-07-19.
- [x] **[AI-Review][Info] AC6 — parity smoke not reproven in review.** Reviewer verified tsc + changed unit tests but did NOT run `registry-unified-db-smoke.integration.test.ts` (needs live `app_test` DB). eslint/CI-deploy/VPS-SHA remain the operator tail. The load-bearing `view ≡ inline ≡ count-core ≡ export` proof rests on CI until the integration job runs. **RESOLVED at adjudication (2026-07-19):** ran the full API suite vs `app_test` — `registry-unified-db-smoke.integration.test.ts` (5 tests) PASSES, so view ≡ inline ≡ count-core ≡ export is proven locally, not just on CI. Full API 3144 + web 2779 green; eslint clean; CI/CD deploy green; VPS on `2253e19`; LIVE `/public/insights` = 143 registered / 80 withAnswers + density 29 LGAs (4 exact + 25 banded). Operator tail fully closed.

**📋 Post-ship backlog harmonization sweep (John/PM 2026-07-19).** After 13-33 shipped the canonical `registry_unified` read, a backlog grep found stories authored BEFORE it that still pointed at the pre-13-33 reads. Harmonized (each story's Change Log records the edit):
- **12-4** — re-pointed the aggregate onto `registryUnifiedSource` (was: re-mirror `getUnifiedExportData`); owns the L3 materialization decision; `phone_number`-for-R2 ruling. _(Bob/SM + John/PM)_
- **12-6** — re-pointed the per-field-rates read onto `registryUnifiedSource` (was: re-mirror the export LATERAL).
- **12-5** — flagged that the "With Answers" 76 must come from `getRegistryTotals().withAnswers`, not the submission-scoped `getRegistrySummary().totalRespondents` (drift until 12-4 repoints it).
- **12-7** — ruled intentionally-scoped (filtered table), BUT corrected a real drift: per-row `data_status` must derive from the latest **NON-EMPTY** submission (matching the canonical read), + a parity test.
- **13-2** (source #3 importer) — must write respondent **AND** submission(`raw_data.skills_possessed`), not only `marketplace_profiles.profession`, per the 13-33 AC4 ingestion contract — else association members are counted but invisible to skills/insights.
- **13-6** (backlog) — note added: channel/coverage counts should be respondent-scoped via the canonical read so they reconcile with the 139 headline.
- **L3 trigger** made numeric: act at `respondents > 5,000` OR /insights cache-miss p95 `> 500 ms`, index-first.

Net: two would-be third-copies of the read (12-4, 12-6) and one real per-row derivation drift (12-7) caught before any dev touched them, plus the source-#3 skills-visibility gap (13-2). Systemic follow-up → add "grep the backlog for consumers of the replaced read when shipping a canonical primitive" to the planning-artifact-parity-sweep checklist.

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

### Agent Model Used
claude-opus-4-8[1m] (dev-story workflow)

### Implementation Plan / Key Decisions

**AC1 spike outcome — "both" (view AND service), made drift-proof (Awwal's call).**
There is ONE canonical SQL definition (`registry-unified.sql.ts` →
`REGISTRY_UNIFIED_SQL_TEXT`, parameter-free). From it:
- the runtime service (`registry-unified.ts`) composes the canonical SQL **inline**
  as a `FROM` source (`registryUnifiedSource('ru')`) — the **belt**: zero migration
  dependency, so a missing/late `registry_unified` view can never 500 the public
  /insights page, and the planner treats the inlined subquery identically to a view;
- the view-init runner (`scripts/migrate-registry-unified-view-init.ts`) does
  `CREATE OR REPLACE VIEW registry_unified AS <same text>` — the **suspenders**: the
  literal "one table everything reads from" for analysts / BI / 12-4.
- The real-DB smoke asserts **view ≡ inline ≡ count-core ≡ export** (same distinct
  respondents), so the two artifacts can never silently drift. Chose inline (not a
  memoised `to_regclass` view-probe) for the runtime path so the tightly-sequenced
  mocked-DB consumer tests aren't reordered by an extra probe query; switching the
  runtime onto the view later is a one-line change now that both are proven equal.
- Materialization deferred (YAGNI): public /insights is Redis-cached 1h, so read
  latency isn't hot-path (AC1 permits a plain view + a service).

**No-clash boundary with 12-4 (read the whole story).** 13-33 owns the READ; 12-4
owns the AGGREGATE. `getRegistryCountCore` (13-25) was refactored to read the
canonical source, so 12-4's future `getRegistryTotals` aggregates **FROM the same
read** — one read, one count lineage, no throwaway (the 9-59-atom/12-4-aggregate
inversion, extended). For AC1's "3-axis status" the read exposes **Axis-1 `source`**
(raw column) + the flat **`dataStatus`** substrate + the raw fields (`status`,
`nin`, `raw_data`) 12-4's AC7 derives completeness/verification from. 13-33 does
**NOT** build the completeness/verification atoms, the deep-field marker-set config,
the R2 identity-key distinct-people count, or the `/analytics/registry-totals`
endpoint — all explicitly 12-4 AC7/AC2, so no second (divergent) axis derivation
lands ahead of 12-4's design + PM rulings.

**AC2 semantics.** Public-insights now reads the unified source everywhere:
demographic/skills breakdowns filter to the answer-bearing subset (`ru.raw_data IS
NOT NULL`) and are **per-respondent** (denominator = `countCore.withAnswers`, the
same read the headline uses — kills the 13-25-class drift); the **density + LGAs-
covered count ALL respondents** (incl. submission-less imports) so the map agrees
with the headline by construction. Public /insights headline numbers are unchanged
(still respondent-scoped); the density map is now populated (proven on the smoke:
an LGA of 3 submission-less imports counts 3, where a submission-anchored query
showed 0).

**AC3 banded disclosure.** New `bandSmallBuckets` (single suppression authority):
≥10 → exact graduated count · 1–9 → present-but-banded (`banded:true`, count/pct
nulled — exact small number never leaves the server, k-anon floor kept) · 0 →
absent (not emitted → blank). `FrequencyBucket` gained an optional `banded?`.
Frontend: `LgaChoroplethMap` renders three states (absent grey / banded lightest
shade, no number / exact graduated) and the public page dropped `suppressionMinN`
(no double-suppression). The map's legacy `suppressionMinN` path is kept for the 4
internal dashboard callers (backward-compatible — a datum with no `banded` flag
behaves exactly as before).

**AC5 audit.** `getUnifiedExportData` (export) is already respondent-anchored with
the identical LATERAL shape — proven equal by the parity smoke, so NOT force-
refactored (repointing would churn its extra fraud/name-COALESCE columns for zero
correctness gain). `marketplace.service.ts` counts consent-opted
`marketplace_profiles` — an intentionally different, narrower denominator (not a
registry total; documented, not repointed). `survey-analytics.service`'s dashboard
`getRegistrySummary` submission-count is 12-4's explicit target (out of 13-33 scope;
12-4 repoints it onto `getRegistryTotals` over this read).

### Completion Notes
- ✅ Resolved AC1 as belt-and-suspenders (view + inline service) from one SQL
  constant; view wired into CI (auto-discovered by `db:push:full:force` in the
  test-api job; explicit step added to the prod deploy chain).
- ✅ Parity proven on the real schema: view ≡ inline ≡ count-core ≡ export
  (`registry-unified-db-smoke.integration.test.ts`), incl. AC4 inclusion of
  submission-less imports and AC3 density banding (≥10 exact / 1–9 banded / 0 absent).
- ✅ Full API suite green (3144 passed / 0 failed); API + web `tsc --noEmit` clean;
  eslint clean on all changed source. `getRegistryCountCore` refactor verified by its
  own integration smoke (no regression).
- ⏭️ AC6 deploy tail (CI deploy green + VPS SHA + eyeball the live density map) is the
  operator's post-review action — dev-story stops at `review`.
- 📌 Follow-on for 12-4: build `getRegistryTotals` + the 3-axis (completeness/
  verification) derivation + `/analytics/registry-totals` endpoint aggregating FROM
  `registry_unified`; repoint `survey-analytics.getRegistrySummary` onto it.

### File List
**Added**
- `apps/api/src/services/registry-unified.sql.ts` — the ONE canonical SQL constant + view name.
- `apps/api/src/services/registry-unified.ts` — `registryUnifiedSource` FROM-helper + direct/view read + view-exists probe.
- `apps/api/scripts/migrate-registry-unified-view-init.ts` — idempotent `CREATE OR REPLACE VIEW registry_unified` runner.
- `apps/api/src/services/__tests__/registry-unified.service.test.ts` — SQL-shape + composition unit tests.
- `apps/api/src/services/__tests__/registry-unified-db-smoke.integration.test.ts` — real-DB parity/inclusion/banding smoke.
- `apps/api/src/services/__tests__/registry-ingestion-contract.test.ts` — AC4 contract + association-importer `todo`.
- `apps/web/src/features/dashboard/utils/__tests__/analytics-transforms.test.ts` — banded transform unit tests.
- `docs/registry-unified-ingestion-contract.md` — AC4 respondent+submission ingestion contract.
- `apps/web/src/features/insights/components/__tests__/PublicLgaTable.test.tsx` — (review M1) banded-row rendering test.

**Modified**
- `apps/api/src/services/registry-totals.service.ts` — `getRegistryCountCore` reads the canonical unified source.
- `apps/api/src/services/public-insights.service.ts` — breakdowns + density repointed respondent-anchored; density banded.
- `apps/api/src/utils/analytics-suppression.ts` — added `bandSmallBuckets`.
- `apps/api/src/utils/__tests__/analytics-suppression.test.ts` — `bandSmallBuckets` cases.
- `packages/types/src/analytics.ts` — `FrequencyBucket.banded?`.
- `apps/web/src/features/dashboard/utils/analytics-transforms.ts` — include banded LGAs; `ChoroplethDatum`.
- `apps/web/src/features/dashboard/components/charts/LgaChoroplethMap.tsx` — 3-state (absent/banded/exact) rendering.
- `apps/web/src/features/dashboard/components/charts/__tests__/LgaChoroplethMap.test.tsx` — banded rendering test.
- `apps/web/src/features/insights/pages/PublicInsightsPage.tsx` — drop frontend re-suppression; privacy note.
- `.github/workflows/ci-cd.yml` — view-init runner in the prod deploy chain.
- `apps/web/src/features/insights/components/PublicLgaTable.tsx` — (review M1) render banded LGAs as "Fewer than 10".

## PM Validation (John, 2026-07-18)

**Validated — approved with a scope note. FOUNDATIONAL, post-launch, NOT launch-gating.**
1. **Priority:** high architectural value but post-launch — the density map self-heals with volume and the convergence is internal-correctness, not a launch blocker. It IS the foundation the GPS/dedup/marketplace surface fixes sit on, so build it before deeper work on those.
2. **Scope flag (watch in dev):** this is the largest emergent draft — canonical read (AC1) + repoint consumers (AC2/AC5) + density banding (AC3) + importer contract (AC4). If it gets unwieldy, split the density-map DISPLAY (AC3 banding) from the convergence READ (AC1/2/4/5): the read is the foundation, the map is one consumer. Bundling is acceptable because the map is the proving ground — but dev should flag early if it's too big for one story.
3. **Guardrails correctly stated:** don't remove the dedup/prefill (load-bearing raw_data plumbing) and don't remove the k-anon floor (band it). Both honoured.

**No AC changes.** Dev-ready; schedule post-launch as the convergence foundation.

## 🧭 Session Trace Anchor — 2026-07-19 (13-33 review → epic-wide cascade)

_Single index of everything this working session produced, so a commit and the retrospective can trace it all from one place. 13-33 is the origin (its adversarial review kicked off the cascade)._

### 1. The cascade (what happened, in order)
1. **13-33 adversarial code review** — 0 High, 2 Med + 4 Low; fixes M1/M2/L1/L2/L4 applied; independently verified green (API+web `tsc`, 37 API + 14 web tests, eslint). See "Review Follow-ups (AI)".
2. **L3 → 12-4 hand-off** — 12-4 re-pointed onto `registryUnifiedSource`; 12-4 owns the L3 materialization decision; `phone_number`-for-R2 ruling (Bob/SM + John/PM).
3. **Backlog harmonization sweep** — found + fixed 5 pre-13-33-drift stories: 12-4, 12-5, 12-6, 12-7, 13-2, plus a 13-6 note. See "Post-ship backlog harmonization sweep" above.
4. **Bankables institutionalized** — numeric L3 trigger (`>5k` rows / `>500ms` p95); "adding a column" governance header in `registry-unified.sql.ts`; new memory `feedback_canonical_primitive_backlog_sweep`; new CI-guard story **13-37**.
5. **13-2 escalation** — Awwal's verification reframe (verification = individual confirmation, NOT source legitimacy) → **include-with-badge** ruling; **INTAKE-REALITY** finding (real ASNAT WhatsApp batch: freeform intake, dirty trade/LGA/phone, consent reframed as head-attested, adaptive-intake + normalization-layer model).
6. **13-38 marketplace card redesign + badge** — Sally design pass + interactive mockup (v2: experience-as-hero-stat, sparse-profile handling, two-slot trust system); locked design decisions; 9-12 magic-link future-photo path verified.

### 2. Files touched (for commit)
- **Group A — 13-33 code + tests** (the feature + this session's review fixes; commit together as 13-33): `apps/api/src/services/registry-unified.sql.ts` (new), `registry-unified.ts` (new), `apps/api/scripts/migrate-registry-unified-view-init.ts` (new), `apps/api/src/services/registry-totals.service.ts`, `apps/api/src/services/public-insights.service.ts`, `apps/api/src/utils/analytics-suppression.ts`, `packages/types/src/analytics.ts`, `apps/web/.../charts/LgaChoroplethMap.tsx`, `apps/web/.../dashboard/utils/analytics-transforms.ts`, `apps/web/.../insights/pages/PublicInsightsPage.tsx`, `apps/web/.../insights/components/PublicLgaTable.tsx`, `.github/workflows/ci-cd.yml`, `docs/registry-unified-ingestion-contract.md` (new) + tests: `registry-unified.service.test.ts`, `registry-unified-db-smoke.integration.test.ts`, `registry-ingestion-contract.test.ts`, `analytics-suppression.test.ts`, `LgaChoroplethMap.test.tsx`, `dashboard/utils/__tests__/analytics-transforms.test.ts`, `insights/components/__tests__/PublicLgaTable.test.tsx` (new).
- **Group B — planning cascade docs** (harmonization + tracking; can commit separately): `_bmad-output/implementation-artifacts/{12-4,12-5,12-6,12-7,13-2,13-6,13-33}*.md`, `sprint-status.yaml`, `_bmad-output/planning-artifacts/epics.md`.
- **Group C — new stories:** `13-37-registry-read-drift-ci-guard.md`, `13-38-marketplace-association-confirmed-badge.md`.
- **Group D — outside git** (reference in the commit message, not committed here): memory `~/.claude/.../feedback_canonical_primitive_backlog_sweep.md` + `MEMORY.md`. _(The 13-38 card mockup is now IN-repo at `docs/design/marketplace-card-13-38.html` — commits with Group B/C; hosted preview `https://claude.ai/code/artifact/f354d58d-f969-41d6-95e9-770539cb1ebc`.)_

### 3. Decisions locked this session
Verification = individual-confirmation (not source-legitimacy) · association imports **marketplace-visible with "[Association] — confirmed member" badge**, two-tier · rate-chart exclusion is COMPLETENESS not verification · L3 trigger `>5k rows / >500ms p95`, index-first · `phone_number` extends the read when 12-4 needs it (E.164 stays in key-normalization) · adaptive intake → one normalization layer → 13-33 read · no name/no photo on cards (scraper/privacy; login-gated profile) · experience = hero stat.

### 4. Status of touched stories
13-33 `review` (deploy tail = operator) · 12-4 re-pointed, still `ready-for-dev` · 12-5/12-6/12-7 harmonized, `ready-for-dev` · **13-2 `backlog` + ⛔ BLOCKED-FOR-DEV** · 13-6 `backlog` (note) · 13-37 `ready-for-dev` (new) · 13-38 `ready-for-dev` (new).

### 5. Open ends / awaiting input (nothing silently dropped)
- **Awaiting Awwal:** Appendix B trade-list extension (tiling family) · consent-evidence form for WhatsApp intake (DPIA Appendix H) · intake-channel decision · Trade→`SKILL_TAXONOMY` reconciliation approach · Termii sender-ID for tier-2 SMS · sign-offs.
- **Operator:** 13-33 deploy tail (CI-green + VPS SHA + eyeball density map); the real-DB parity smoke runs in CI (not re-run in review).
- **Housekeeping:** `zzzzzzzzzz.txt` PII scratch is git-ignored (Awwal to delete). Nothing committed yet (review-before-commit discipline).

### 6. Retrospective seeds (durable lessons)
Ship a canonical primitive → sweep the backlog for consumers of the old pattern ([[feedback_canonical_primitive_backlog_sweep]]) · a fix must reach where it EXECUTES ([[pattern-ship-a-fix-that-never-fires]]) · verification ≠ provenance · adaptive intake needs ONE normalization layer, not N parsers ([[feedback_unified_ingestion_pipeline]]) · doc nudges → CI guards (make the wrong way hard to write).

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-19 | **Adjudication (operator verify + commit + deploy) → DONE.** Independently re-verified: the parity integration smoke `registry-unified-db-smoke.integration.test.ts` (5 tests) PASSES vs `app_test` — closing the open AC6 reproof (view≡inline≡count-core≡export proven locally, not just CI). Full API 3144 + web 2779 green; tsc(types/api/web)+eslint clean; core SQL (respondent-anchored latest-non-empty) + banding (3-state) reviewed. Split commit: `787493b` (feature, 21 files) + `2253e19` (planning cascade). CI/CD green; deploy ran the `registry_unified` view-init migration; VPS on `2253e19`. **LIVE `/public/insights` = 143 registered / 80 withAnswers + density 29 LGAs (4 exact + 25 banded) — map populated (was near-blank).** Status review → **done**; sprint-status + epics flipped. | Adjudication (operator) |
| 2026-07-19 | **Session Trace Anchor added.** Consolidated the full 13-33-review→epic-cascade session (review fixes, L3→12-4 hand-off, 5-story harmonization sweep, bankables + 13-37 CI guard, 13-2 verification-reframe + intake-reality, 13-38 card redesign + mockup) into a single traceable index for commit + retrospective — files grouped for commit, decisions locked, open ends listed. See "🧭 Session Trace Anchor". | Awwal (requested anchor) |
| 2026-07-19 | **Adversarial code-review (Awwal).** 0 CRITICAL/HIGH; File List ≡ git. Fixed M1 (table now shows banded LGAs as "Fewer than 10" — kills a new map↔table contradiction), M2 (`bandSmallBuckets` passes pre-nulled buckets through, no incoherent state), L1 (dropped dead `total` SQL column), L2 (density excludes null-`lga_id` so no `'Unknown'` bucket leaks to the public map/table), L4 (view-init prefers atomic `CREATE OR REPLACE`, DROP+CREATE only on column-set change). L3 (inline 8× re-scan) + AC6 parity-smoke reproof logged as open follow-ups (materialization deferred by design; integration smoke runs in CI). Added `PublicLgaTable.test.tsx` + M2 test case. API+web tsc + changed unit tests green (36 API + 11 web). Status stays `review`. | Awwal (review) |
| 2026-07-18 | **Implemented (dev-story).** Canonical respondent-anchored `registry_unified` read as ONE SQL constant → inline service (belt) + physical view (suspenders), proven identical by a real-DB parity smoke (view ≡ inline ≡ count-core ≡ export). Refactored `getRegistryCountCore` + public-insights breakdowns/density onto it (respondent-anchored, drift killed); density now counts ALL respondents per LGA and is BANDED (≥10 exact / 1–9 present-but-withheld / 0 blank) via new `bandSmallBuckets` + `FrequencyBucket.banded` + 3-state `LgaChoroplethMap`; dropped the frontend double-suppression. AC4 ingestion contract documented + association-importer `todo`. AC5: export proven-equal (not force-refactored), marketplace consent-scoped (documented), dashboard `getRegistrySummary` left to 12-4. 12-4 de-clash boundary recorded (13-33 = read; 12-4 = aggregate/endpoint/3-axis derivation over this read). Full API suite 3144 green, tsc + eslint clean. Status → review. | Awwal (dev) |
| 2026-07-18 | Story drafted via *create-story. Foundational three-source convergence: one canonical respondent-anchored unified read (view/service) that every source writes into (respondent + submission.raw_data) and every consumer reads from — killing the submission-anchored drift/exclusion in public-insights and designing source #3's (association) read contract before the importer exists. Proven end-to-end on the density map, which also gets banded disclosure (present-<10 / graduated-≥10) so it shows a real distribution now without removing the k-anonymity floor. NOT launch-gating; the foundation the GPS/dedup/marketplace surface fixes sequence under. | Bob (SM) |

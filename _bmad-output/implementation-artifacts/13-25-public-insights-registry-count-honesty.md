# Story 13-25: Public /insights registry-count honesty (launch-slice of Epic 12)

Status: ready-for-dev

<!-- Authored 2026-07-10 by Bob (SM) via *create-story. EMERGENT (2026-07-10, Awwal): the PUBLIC oyoskills.com/insights page shows "Total Registered = 79" while the dashboard shows ~139. Root cause: public-insights.service.ts computes `totalRegistered` as COUNT(*) FROM submissions (79) and EVERY breakdown is submission-scoped — so the 55 data_lost (Cohort A soft-launch salvage, 9-26/9-28) + 7 no_submission + 1 pending_nin are invisible. This is the IDENTICAL bug Epic 12's 12-4 fixes for the INTERNAL dashboard, but Epic 12 never enumerated the public surface as a consumer (12-4 corrected 2026-07-10 to add it). The public page is what the LAUNCH BLAST drives traffic to, so this slice is launch-relevant while the rest of Epic 12 stays post-launch. This story is the minimal, FORWARD-COMPATIBLE public-page slice: count people not submissions + honest funnel/methodology note, using the SAME counting logic 12-4 defines so there is ONE registry story and no second count. -->

## Story
As **a member of the public (and the Ministry) viewing oyoskills.com/insights**,
I want **the "Total Registered" headline to count registered PEOPLE (~139), with an honest funnel to the subset who have complete survey answers**,
so that **the public register isn't understated by ~45% during the launch traffic spike — and the salvaged soft-launch registrants are counted as the real people they are, not silently dropped.**

## Context & Evidence (prod-verified 2026-07-10 via Tailscale)
- **`public-insights.service.ts` counts submissions, not people.** `totalRegistered: total` where `total = COUNT(*) FROM submissions` [public-insights.service.ts:82,108,261]. Prod: **79 submissions vs 142 respondents (~139 dashboard).** Every metric (gender/age/skills/LGA) is `FROM submissions s LEFT JOIN respondents r` → the **63 respondents without an answer-bearing submission are invisible to the ENTIRE public insights**, not just the headline.
- **The 63 are real, salvaged people (make-do, no recovery).** They split — via the 9-59 taxonomy — into **55 `data_lost`** (Cohort A: the 2026-05-14→20 pre-9-26 wizard handler dropped Step-4 answers; `metadata.questionnaire_data_lost:true`; identity salvaged, answers gone — 9-26 Part B / 9-28) + **7 `no_submission`** + **1 `pending_nin`**. This EXACTLY matches 12-4's documented "139 = 76 + 55 + 7 + 1" (mine's 79-with-answers = 76 + the 3 July registrants). The haemorrhage is HISTORICAL and stopped (9-26); the salvage decision is made (9-28 — accept identity-only). **No recovery task here.**
- **Epic 12 owns the fix for the internal dashboard, not the public page.** 12-4 builds the canonical respondent-scoped `getRegistryTotals()`; 12-5 owns label-honesty + n-per-chart; 12-6 owns the funnel + data-lost cohort — all on `survey-analytics.service.ts` (RBAC-gated). The public `public-insights.service.ts` was the omitted consumer (12-4 corrected 2026-07-10).
- **Launch relevance:** Epic 12 is deliberately POST-LAUNCH/NON-GATING — correct for internal surfaces. The public page breaks that assumption: it's the analytics surface the blast drives traffic to, so THIS slice is launch-relevant.

## Acceptance Criteria
1. **AC1 — Headline counts registered PEOPLE, via the canonical logic (not submissions).** `public-insights` "Total Registered" returns the respondent-scoped distinct-people count (~139), computed with the SAME `deriveDataStatus`-over-respondents / `hasNonEmptyRawData` atom (9-59) that 12-4 uses — NOT `COUNT(*) FROM submissions`. Implement as a **shared count-core** (a small function = 12-4's AC1/AC3 minimal slice: `{ totalRespondents, withAnswers }`) that BOTH `public-insights.service.ts` consumes now AND the future full `getRegistryTotals()` (12-4) builds on — so there is ONE source of truth, no divergent second count. (Row-id-distinct `DISTINCT ON (r.id)` is acceptable for this slice; the R2 identity-key refinement rides with full 12-4 post-launch — note it.)
2. **AC2 — Honest funnel + methodology note (no hiding the salvaged cohort).** The page shows "**~139 registered · N with complete survey responses**" (N=79 today) and a methodology note that the demographic/skills breakdowns reflect the completed-survey subset (borrow 12-5's label-honesty + n-per-chart principle). The `data_lost`/`no_submission` respondents are transparently counted as registered but excluded from breakdowns — framed as data completeness, not error.
3. **AC3 — Breakdowns stay submission-scoped + correct (coordinate 13-22).** The gender/age/skills/LGA breakdowns remain over the answer-bearing submissions (they require `raw_data`), now with the correct denominator surfaced. If the skills breakdown renders garbled (13-22 JSONB-vs-space-split), coordinate: consume 13-22's fix if it lands first, else scope the public skills-render correction here — the public page must not show garbage skills at launch. State which in the File List.
4. **AC4 — Forward-compatible convergence recorded.** The shared count-core is documented as the pre-launch seed of 12-4's `getRegistryTotals()`; when Epic 12 lands, `public-insights` refactors to consume the full model (3-axis/identity-key/endpoint). No permanent second count. 12-4's consumer list already updated (2026-07-10).
5. **AC5 — Tests + suites green.** `public-insights.service.test.ts` updated: totalRegistered == distinct respondents (asserts the count-core, not submissions); the funnel shape; a real-DB smoke or fixture reproducing the 139/79 split (mirrors 12-4's drift-guard discipline for the raw SQL). Full api + web suites green; tsc/eslint clean.

## Tasks / Subtasks
- [ ] **Task 1 (AC1, AC4)** — extract the shared count-core (respondent-scoped `{ totalRespondents, withAnswers }` via `deriveDataStatus`/`hasNonEmptyRawData`, mirroring `getUnifiedExportData`'s LATERAL latest-non-empty-submission shape); wire `public-insights.service.ts` `totalRegistered` to it. Document it as 12-4's AC1/AC3 seed.
- [ ] **Task 2 (AC2)** — funnel + methodology note on the insights page (web) + the `withAnswers` denominator; n-per-chart honesty per 12-5.
- [ ] **Task 3 (AC3)** — coordinate the skills-render fix (13-22 consume-or-scope); ensure no garbled skills publicly.
- [ ] **Task 4 (AC5)** — service + web tests; real-DB smoke/fixture for the split; suites green.

## Dev Notes
- **Use the taxonomy that already exists — don't invent a public-only count.** The 9-59 atom (`deriveDataStatus`, `hasNonEmptyRawData`, `REGISTRY_DATA_STATUSES`) + the `getUnifiedExportData` LATERAL pattern are the proven per-respondent consumption. The count-core is 12-4's AC1/AC3 minus the axes/identity-key/endpoint — a genuine subset, so 12-4 builds ON it later (no rework).
- **The 55 are `data_lost` (Cohort A) — real people, salvaged, make-do.** History: 9-26 stopped the pre-fix Step-4 drop; 9-28 decided identity-only salvage (supplemental-survey recovery capability shipped but operator-gated, NOT fired). Do NOT add a recovery task here; if recovery is ever wanted it's 9-28's supplemental survey (could piggyback the 13-24 welcome contact). Count them, funnel them honestly, move on.
- **Scope discipline:** this is the LAUNCH slice — the public headline + funnel + skills-render. It does NOT pull forward 12-4's 3-axis decomposition, identity-key COUNT(DISTINCT), the `/api/v1/analytics/registry-totals` endpoint, or the internal-dashboard wiring (12-5/12-6/12-7/12-8). Those stay post-launch with the rest of Epic 12.
- **Raw-SQL drift guard:** the public count is raw `db.execute(sql...)`; mirror 12-4's mandated real-DB smoke so a renamed column fails a test, not prod.

### References
- [Source: apps/api/src/services/public-insights.service.ts:82,108,261 — `COUNT(*) FROM submissions` mislabeled `totalRegistered`; every breakdown submission-scoped]
- [Source: 12-4 (getRegistryTotals canonical model — the count-core is its AC1/AC3 slice; consumer list corrected 2026-07-10) · 12-5 (label honesty + n-per-chart) · 12-6 (funnel + data-lost cohort)]
- [Source: apps/api/src/services/registry-data-status.ts — `deriveDataStatus`/`hasNonEmptyRawData`/`REGISTRY_DATA_STATUSES` (9-59 atom to consume, not redefine)]
- [Source: apps/api/src/services/export-query.service.ts:321-329 — LATERAL latest-non-empty-submission pattern to mirror]
- [Source: 9-26 (unified ingestion — stopped the Step-4 drop; every respondent gets a submissions row) · 9-28 (Cohort A salvage decision — identity-only, supplemental-survey capability) · 13-22 (skills JSONB extraction)]
- [Source: prod 2026-07-10 — 142 respondents / 79 submissions / 63 no-answer = 55 data_lost + 7 no_submission + 1 pending_nin]

## Dev Agent Record
### File List

## PM Validation (John, 2026-07-10)

**Validated — approved. LAUNCH-RELEVANT (the public analytics surface), minimal + forward-compatible.**

1. **This is the right kind of launch pull-forward.** Epic 12 was correctly deferred *because its surfaces were internal*. The public /insights page is the one exception — a wrong, understated count on the page the blast drives traffic to is a credibility hit at the worst moment. Pulling forward JUST the count-core (12-4 AC1/AC3) for the public page, and nothing else, is the disciplined slice. Do NOT let it balloon into "do Epic 12 now."
2. **One source of truth is non-negotiable (AC1/AC4).** The count-core MUST be the same logic 12-4 will formalize — a shared function, not a parallel public-only query. Otherwise we ship two counts that drift, which is worse than the current single-wrong-count. The convergence note in 12-4 (done) + AC4 here keep it honest.
3. **Funnel honesty over a bigger number (AC2).** Counting 139 is right, but the methodology note is what makes it defensible: the breakdowns cover the completed subset, and the `data_lost` salvage is transparent, not hidden. This is 12-5's principle applied publicly — good.
4. **The 55 salvaged are real registrants — count them, don't recover them.** Awwal's "make do" call is correct and already decided (9-28). No recovery scope here; the supplemental-survey lever stays optional/operator-gated.
5. **13-22 coordination (AC3):** the public page must not show garbled skills at launch. Batch the public-page deploy with 13-22 or scope the render fix here — reviewer to confirm which at dev time.

**No AC changes.** Dev-ready. Sequence: pre-blast, alongside 13-22/13-23 (the public-honesty track); independent of the 13-24 send.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-10 | Story drafted via *create-story — public /insights counts submissions (79) not registered people (~139); launch-slice of Epic 12 (12-4 count-core + 12-5 label-honesty) for the public surface Epic 12 omitted. The 63 no-answer = 55 data_lost (Cohort A salvage, 9-26/9-28) + 7 no_submission + 1 pending_nin — real people, make-do, no recovery. Forward-compatible: count-core is 12-4's AC1/AC3 seed; converges post-launch. EMERGENT from the 79-vs-139 investigation. | Bob (SM) |

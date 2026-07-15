# Story 13-28: Display skills on marketplace profiles (+ skill-based discovery)

Status: done

<!-- Authored 2026-07-10 by Bob (SM) via *create-story. EMERGENT (2026-07-10) from the /marketplace verification: the marketplace stores each worker's skills CLEAN (marketplace_profiles.skills, comma-separated, extracted array-correctly by the worker) but the API deliberately omits skills from both the search and profile-detail responses, and the frontend shows only profession/LGA/experience/bio/portfolio. For a SKILLED-labour marketplace, the skills a person holds are the core matchmaking signal — so this is a real product gap, though it was a DELIBERATE MVP scope decision (stories 7-1/7-3), not a bug. The data is already there and clean; this surfaces it. NOT launch-gating — a fast-follow AFTER 13-27 populates the marketplace (no point showing skills on 1 card). -->

## Story
As **someone searching oyoskills.com/marketplace for a skilled worker**,
I want **each worker's skills shown on their card and profile (and ideally searchable)**,
so that **I can find people by what they can actually DO — the whole point of a skilled-labour register — instead of only profession + location.**

## Context & Evidence
- **Skills are stored clean but never surfaced.** The marketplace-extraction worker reads `skills_possessed` as a JSONB array (array-correct — NOT the 13-22 space-split bug) and stores it in `marketplace_profiles.skills` (text, comma-separated). But: the search endpoint selects `mp.profession` only (marketplace.service.ts ~148) and the profile-detail endpoint selects `id/profession/lga_name/experience_level/verified_badge/bio/portfolio_url/created_at` (~220-227) — **no `mp.skills`** in either. The response types (`MarketplaceSearchResultItem`, `MarketplaceProfileDetail`) have no skills field, and the frontend (`WorkerCard`, `MarketplaceProfilePage`) renders no skills section.
- **This was deliberate MVP scope** (7-1/7-3), not an oversight — hence a product decision to revisit, not a defect. Awwal flagged it while reviewing the marketplace.
- **The data is ready + clean**, so this is a surfacing job, not a data-fix.

## Dependencies (sequence)
- **AFTER 13-27** — the marketplace must actually be POPULATED first (today: 1 card; 13-27 wires public extraction + backfills the 69). Showing skills on an empty marketplace is pointless.
- **Coordinate with 13-20/13-22** — display the canonical human **labels** (from `SKILL_TAXONOMY`), not raw slugs; `custom_*` skills render as their free text. If the worker's stored `skills` string predates the 150-taxonomy, 13-22's alignment keeps them canonical.

## Acceptance Criteria
1. **AC1 — API returns skills.** Add `mp.skills` to BOTH the search result and profile-detail queries + their response types (`MarketplaceSearchResultItem`, `MarketplaceProfileDetail`), returned as a string[] (split the stored comma-separated `skills`), privacy-reviewed (skills are non-sensitive occupational data — consistent with the marketplace's public opt-in).
2. **AC2 — Frontend renders skills.** `WorkerCard` (list) shows a compact skills summary (e.g. top N chips + "+M more"); `MarketplaceProfilePage` (detail) shows the full skills list. Empty/absent skills degrade gracefully (no broken section).
3. **AC3 — Human labels, not slugs.** Skills display via the canonical `SKILL_TAXONOMY` label map (13-20) — `tailoring` → "Tailoring", `tour_guide` → "Tour Guide Services", etc.; `custom_*` skills show their free-text label. No raw slugs shown to the public.
4. **AC4 — (Stretch) Skill-based discovery.** Marketplace search can filter/rank by skill, leveraging the existing `marketplace_profiles.search_vector` (already populated). Scope per effort — AC1–AC3 are the must-have; AC4 is the uplift.
5. **AC5 — Tests + suites green.** API response-shape tests (skills present + split); web render tests (chips + empty state); full api + web suites green; tsc/eslint clean.

## Tasks / Subtasks
- [x] **Task 1 (AC1)** — add `skills` to the marketplace search + detail SELECT + response types; split to string[].
- [x] **Task 2 (AC2, AC3)** — render skills chips on `WorkerCard` + full list on `MarketplaceProfilePage`, via the `SKILL_TAXONOMY` label map; graceful empty state.
- [x] **Task 3 (AC4, optional)** — skill filter/rank on search (`search_vector`). VERIFIED already delivered by inspection: `search_vector` indexes `skills` at weight B (marketplace-trigger.sql:16) and the search bar routes free-text `q` → `search_vector @@ plainto_tsquery`, so skill-token discovery is already live. No new code added (would be an unwired param — avoids the ship-a-fix-that-never-fires class). **Caveat (code-review L4):** the `q:'carpenter'` service test is mock-based (`db.execute` is stubbed) so it proves query *construction*, not real Postgres FTS matching — the skills-token discovery is verified by code inspection, not an integration test. Real-FTS coverage + the slug-vs-label limitation (below) are the documented follow-up.
- [x] **Task 4 (AC5)** — API + web tests; suites.

## Dev Notes
- **Not a bug, a scope revisit** — the marketplace worker is correct and skills are stored; 7-1/7-3 simply didn't expose them. This story reverses that MVP cut now that the register's matchmaking value depends on it.
- **Sequence after 13-27** (populate) — otherwise there's nothing to show. Data quality rides on 13-20/13-22 (canonical labels).
- **NOT launch-gating** — a fast-follow product enhancement; do it once the marketplace is populated. Priority per PM (below).
- **Privacy:** skills are occupational/non-sensitive and the marketplace is an explicit public opt-in (`consent_marketplace`), so surfacing skills is consistent with the existing exposure model — but confirm no free-text `custom_*` skill leaks PII (it shouldn't, but the render should treat it as untrusted text).

### References
- [Source: apps/api/src/services/marketplace.service.ts (search ~148, detail ~220-227 — skills NOT selected) · packages/types/src/marketplace.ts (MarketplaceSearchResultItem, MarketplaceProfileDetail — no skills field)]
- [Source: apps/web/src/features/marketplace/ — WorkerCard, MarketplaceProfilePage (no skills section)]
- [Source: apps/api/src/queues/marketplace-extraction.worker.ts (~91-100 — reads array-correct, stores marketplace_profiles.skills comma-separated)]
- [Source: 13-27 (populate the marketplace — hard dep) · 13-20 SKILL_TAXONOMY labels · 13-22 skills alignment · 7-1/7-3 (the original MVP scope that cut skills)]

## Dev Agent Record

### Implementation Notes (2026-07-14, dev-story)
- **AC1** — added `skills: string[]` to both `MarketplaceSearchResultItem` and `MarketplaceProfileDetail`; the service selects `mp.skills` in both the search and detail SQL and maps it through a new `splitSkills()` helper (splits the worker's `', '`-joined string, trims, drops empties → `[]` for null). API returns raw slugs; label resolution is the frontend's job (AC3) — consistent with the existing wizard combobox pattern.
- **AC3** — added a single canonical label resolver `skillLabelForSlug()` + `SKILL_LABEL_BY_SLUG` to `packages/types/src/skills-taxonomy.ts` (mirrors the existing `SKILL_SECTOR_BY_SLUG`, so labels can't drift from Appendix-C). `custom_*` and legacy/unknown slugs humanize (strip `custom_`, `_`→space, Title-Case) rather than ever showing a raw slug. Free text is only ever rendered through React's escaping (no `dangerouslySetInnerHTML`) — treated as untrusted per AC4/privacy note.
- **AC2** — `WorkerCard` shows up to 3 skill chips + "+N more"; `MarketplaceProfilePage` gains a **Skills** card with the full chip list and a graceful "No skills listed yet." empty state. Both defend against `skills` being absent from the payload (`profile.skills ?? []`).
- **AC4** — no new code (see Task 3). **Caveat (follow-up candidate):** skills are stored/indexed as *slugs*, so free-text search matches slug tokens (`plumbing` → `plumbing`) but not multi-word *labels* (searching "tour guide" won't hit slug `tour_guide`). Making labels searchable would require the `search_vector` trigger to index resolved labels — deferred, not launch-relevant.
- **No backfill / no data change** — 13-28 is display-only; the marketplace worker already stores skills clean (13-27 populated them). Nothing to run on prod.

### File List
- `packages/types/src/marketplace.ts` (M) — `skills: string[]` on `MarketplaceSearchResultItem` + `MarketplaceProfileDetail`
- `packages/types/src/skills-taxonomy.ts` (M) — `SKILL_LABEL_BY_SLUG` + `skillLabelForSlug()` + `humanizeSkillSlug()`
- `apps/api/src/services/__tests__/skill-label-resolver.test.ts` (A) — label-resolver unit tests. **RELOCATED at commit-time (operator) from `packages/types/src/__tests__/skills-taxonomy.test.ts`: packages/types has NO `test` script so a test there never runs in CI (the exact "test that never runs" trap Story 13-22 removed). Moved to apps/api (imports from `@oslsr/types`) so it actually runs; 6/6 green.**
- `apps/api/src/services/marketplace.service.ts` (M) — `splitSkills()`; `mp.skills` in search + detail SELECT + mapping
- `apps/api/src/services/__tests__/marketplace.service.test.ts` (M) — skills fixtures + AC1 search/detail tests
- `apps/web/src/features/marketplace/components/WorkerCard.tsx` (M) — top-3 skill chips + "+N more"
- `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx` (M) — full Skills card + empty state
- `apps/web/src/features/marketplace/__tests__/WorkerCard.test.tsx` (A) — card skills chip tests
- `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx` (M) — profile skills-section tests

### Completion Notes
- **Validations self-run:** API marketplace suites 148/148, full web marketplace suite 103/103, types taxonomy 5/5; `tsc --noEmit` clean for both `@oslsr/api` and `@oslsr/web`; eslint clean on all changed api/web files (types package is typecheck-only, no lint task).
- All 5 ACs satisfied. AC4 satisfied by verified existing behaviour (documented), not new code.

## Senior Developer Review (AI) — 2026-07-15 (Opus, BMAD code-review workflow)

**Outcome: APPROVED (→ done).** All 5 ACs implemented and independently verified; git File List ↔ git diff exact match (0 discrepancies). Gates re-run by the reviewer (not trusting the dev record): types 6/6, API marketplace 54/54, web marketplace 42/42; `tsc --noEmit` clean on types/api/web; eslint clean on all changed api/web files. Schema column `marketplace_profiles.skills text` confirmed (SQL `mp.skills` is correct — no typo). No raw-slug leak: the pre-existing `MarketplaceProfileAnonymous.skills: string` type is not consumed by any rendered endpoint — only the search + detail views (both now `string[]`) reach the frontend.

Found 0 High/Critical, 1 Medium, 4 Low. All fixed inline and re-verified.

### Review Follow-ups (AI) — all FIXED this pass
- [x] [AI-Review][Med] **M1 — skill chips rendered in two different colours across surfaces.** `WorkerCard` used `bg-primary/10 text-primary` where `--primary` is greyscale near-black (index.css:195), while `MarketplaceProfilePage` hardcoded `bg-[#9C1E23]/10 text-[#9C1E23]` maroon — same element, off-brand grey on the list card vs maroon on the detail page. **Fix:** unified both on the canonical brand token `bg-primary-600/10 text-primary-600` (WorkerCard.tsx:59, MarketplaceProfilePage.tsx:249) — no more hardcoded hex, no card↔detail drift.
- [x] [AI-Review][Low] **L2 — `splitSkills` did not de-duplicate** → a repeated stored slug renders a doubled chip + collides on React's `key={slug}`. **Fix:** `[...new Set(slugs)]` in `splitSkills` (marketplace.service.ts).
- [x] [AI-Review][Low] **L3 — `humanizeSkillSlug` could still emit a raw slug** for degenerate input (`custom_` alone / all-underscores) via `if (!words) return slug`, contradicting AC3. **Fix:** neutral fallback `'Other skill'` (skills-taxonomy.ts) + locking test (`custom_`, `___`).
- [x] [AI-Review][Low] **L4 — AC4 "locked by test" overstated.** The `q:'carpenter'` service test is mock-based (`db.execute` stubbed) so it verifies query construction, not real Postgres FTS. **Fix:** softened Task 3 wording — skills discovery verified by inspection, real-FTS coverage deferred (documented follow-up).
- [x] [AI-Review][Low] **L5 — weak negative test assertions.** `expect(chips).not.toHaveTextContent('electrical')` is a case-sensitive substring check that "Electrical Installation" never trips, so it couldn't catch a raw-slug regression. **Fix:** replaced with exact-text `expect(screen.queryByText('electrical')).not.toBeInTheDocument()` guards (WorkerCard + MarketplaceProfilePage tests).

## PM Validation (John, 2026-07-10)

**Validated — approved. NOT launch-gating; fast-follow after 13-27.**

1. **Right call to make it a story, not force it pre-launch.** The launch-relevant half is 13-27 (populate the marketplace so it isn't a ghost town); *showing skills* is the quality uplift that makes it useful, and it's cheap because the data's already stored clean. Sequence it right after 13-27.
2. **AC3 (labels not slugs) is the load-bearing polish** — a public page showing `tour_guide` / `custom_realtor` reads as broken. Route everything through the `SKILL_TAXONOMY` label map; render `custom_*` as its free text. This also gives 13-22's canonicalisation a visible payoff.
3. **AC4 (skill search) is genuinely optional** — the must-have is *seeing* skills; searching by them is a nice second beat. Don't let it block AC1–AC3.
4. **Privacy is fine but confirm the custom-skill render** treats free text as untrusted (escape + no PII assumption) — same discipline as any user-supplied string on a public page.

**No AC changes.** Dev-ready; schedule after 13-27 populates the marketplace.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-10 | Story drafted via *create-story — surface the already-stored, already-clean marketplace skills on the card + profile (+ optional skill search), via canonical SKILL_TAXONOMY labels. Reverses the 7-1/7-3 MVP cut now that matchmaking value needs it. NOT launch-gating; fast-follow after 13-27 populates the marketplace. EMERGENT from the /marketplace verification. | Bob (SM) |
| 2026-07-14 | Implemented via dev-story. AC1: `skills:string[]` on both response types + `splitSkills()` in service (search + detail SELECT). AC3: canonical `skillLabelForSlug()`/`SKILL_LABEL_BY_SLUG` in packages/types (custom_*/unknown humanized, never raw slugs). AC2: WorkerCard top-3 chips + "+N more"; MarketplaceProfilePage full Skills card + empty state; both null-safe. AC4: verified already-delivered via existing search_vector (skills weight B) — no unwired param added; slug-vs-label search caveat documented. AC5: +5 types, +5 API, +7 web tests. Self-verified: API marketplace 148/148, web marketplace 103/103, types 5/5, tsc + eslint clean. Status → review. | Amelia (Dev) |
| 2026-07-15 | Adversarial code-review (Opus, BMAD workflow). 0 High/Critical, 1 Med + 4 Low — ALL fixed inline + re-verified. M1: unified skill-chip colour on the `primary-600` brand token (was greyscale `text-primary` on the card vs hardcoded `#9C1E23` maroon on the profile). L2: `splitSkills` de-dupes (`Set`) → no doubled chip / React key collision. L3: `humanizeSkillSlug` degenerate-input fallback → `'Other skill'`, never a raw slug (AC3) + locking test. L4: softened AC4 "locked by test" (the service test is mock-based, not real FTS). L5: strengthened weak `not.toHaveTextContent` negatives → exact-text `queryByText` guards. Reviewer re-ran gates independently: types 6/6, API marketplace 54/54, web marketplace 42/42, tsc(types/api/web) + eslint(api/web) clean; git File List ↔ diff exact. Status → done. | Amelia (Review) |

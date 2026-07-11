# Story 13-28: Display skills on marketplace profiles (+ skill-based discovery)

Status: ready-for-dev

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
- [ ] **Task 1 (AC1)** — add `skills` to the marketplace search + detail SELECT + response types; split to string[].
- [ ] **Task 2 (AC2, AC3)** — render skills chips on `WorkerCard` + full list on `MarketplaceProfilePage`, via the `SKILL_TAXONOMY` label map; graceful empty state.
- [ ] **Task 3 (AC4, optional)** — skill filter/rank on search (`search_vector`).
- [ ] **Task 4 (AC5)** — API + web tests; suites.

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
### File List

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

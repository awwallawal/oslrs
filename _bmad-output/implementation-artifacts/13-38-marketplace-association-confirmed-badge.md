# Story 13-38: Marketplace card redesign (+ business name)

⚖️ **SPLIT 2026-08-09 at adjudication. THIS STORY IS NOW THE REDESIGN ONLY.**

**AC1–AC4 and AC6's badge cases moved to Story 13-58** and are gated on 13-2. Measured on prod the
same day: `imported_association` has **ZERO rows** and 13-2 is still `ready-for-dev` — so the badge
half rendered for nobody, while **AC5/AC7 improve 224 live cards today**. Most of this story's value
was sitting behind an import that has not started.

**13-38 keeps the number** because the design file is `docs/design/marketplace-card-13-38.html`; a
mockup named after a story that no longer owns it is precisely the record-vs-artifact drift of §2w.

🆕 **AC8 (business name)** added below — Awwal, 2026-08-09.

⚠️ **The card stays name-less and photo-less.** Those are LOCKED decisions (scraper defence +
`/marketplace` browse is PUBLIC and unauthenticated — only reveal is gated), and the consent 273
people gave names exactly three fields: *"Anonymous Skills Marketplace (Your **profession, LGA, and
experience level** will be visible)"*. A business name is a different thing: commercial, already on
their signboard, and volunteered for exactly this purpose.

Status: done

> ✅ **CLOSED ON PROD 2026-08-18 — deploy SHA `f6b449d`.** Every residual resolved: R1 (column live,
> `/marketplace/search` 200 carrying `businessName`), R2 (backfill run — **182 rows written**,
> idempotence proven by a re-run reporting `needsUpdate=0`, FTS proven end-to-end through the public
> API), R3 (distribution measured before *and* after), R4 (filter bound to the canon + RED-verified),
> R7 / R10 (ruled by Awwal), and R5/R6/R8/R9/R11/R14 closed earlier. §2a0's bar is met: a real deploy
> SHA and no OPEN or DISCHARGE-ON-DEPLOY row.
>
> **What it changed for real people:** **29 workers now show "Over 10 yrs"** with the ★ seasoned cue —
> 28 of them displayed *nothing* before. **26 more** were being shown as less experienced than they
> are. **87 trading names** now appear and are searchable. **Every number was predicted from prod
> before the run and matched after it.**

<!-- Authored 2026-07-19 by Bob (SM) via *create-story (draft), emergent from the 13-2 verification-reframe decision (Awwal, 2026-07-19). POST-LAUNCH, NON-GATING. Awwal's ruling: association-imported members ARE marketplace-visible, WITH a provenance badge that discloses exactly what we know — "[Association] — confirmed member" — turning accountable-source provenance into an honest, marketable trust signal instead of hiding them behind an over-blunt `unverified_import` gate. Two tiers: association-confirmed on import → Member-verified once a member-side SMS check promotes them. Honesty discipline (R1): NEVER a bare "✓ Verified" (no NIMC path; a present NIN is nin_on_file, and for imports it was proxy-transcribed). This is the RENDER story; 13-2 owns the WRITE (source + association name + the member-confirmed flag). See 13-2 top DECISION block + registry-data-status-taxonomy.md Axis-3. -->

## Story

As **an employer / visitor browsing the skills marketplace**,
I want **to see when a worker was confirmed as a member by a named trade association (and, when it happened, that the member themselves confirmed)**,
so that **I can trust an association-vouched skilled worker — and the platform discloses precisely what it knows about each person's provenance instead of overstating "verified" or hiding accountable members entirely.**

## Context & Why (the decision this renders)

- **Awwal's 2026-07-19 ruling (13-2 top DECISION block):** association imports arrive via an accountable source (named head = enumerator-equivalent) with hard identifiers (mandatory phone, usual NIN) — a materially higher trust tier than a soft-identifier bulk list. So they belong in the marketplace **with a disclosure badge**, not excluded.
- **Two tiers** map to the Registry Data-Status Taxonomy Axis-3 (verification):
  - **Tier 1 — association-confirmed** (`source = imported_association`, not yet member-confirmed): badge **"[Association] — confirmed member"**.
  - **Tier 2 — member-verified** (a member-side check fired — the confirmation SMS reply once Termii clears, or a sampled Assessor callback — promoting the row): badge **"Member-verified"**.
- **Honesty discipline (R1 — LOCKED):** there is **no NIMC/identity-validation path**; a present NIN is `nin_on_file`, and for imports it was **proxy-transcribed** by the head. So the badge must NEVER read a bare "✓ Verified" that implies government-grade identity proofing — overstating burns the association's credibility too. The badge attributes the claim to the association ("[X] — confirmed member"), which is both honest and a stronger signal (a real body vouches).
- **This is the RENDER story.** The WRITE side — persisting `source = imported_association`, the **association/guild name**, and the **member-confirmed flag** — is Story **13-2** (importer). This story renders the badge from that provenance and degrades gracefully if the specific association name isn't available.

## Acceptance Criteria

1. **AC1 — Tier-1 badge on association-imported cards.** A marketplace card for a respondent whose `source = imported_association` (and not yet member-confirmed) renders a **"[Association] — confirmed member"** badge, where `[Association]` is the stored association/guild name (e.g. "ASNAT Tiller Association — confirmed member"). If the specific name is unavailable, degrade to **"Trade association — confirmed member"** (never blank, never a bare "Verified").
2. **AC2 — Tier-2 upgrade.** When the respondent has passed a member-side check (the 13-2/taxonomy `member-confirmed` promotion — SMS reply / Assessor callback), the card renders the tier-2 **"Member-verified"** badge instead of (or visibly above) tier-1. The tier is derived from the same verification substrate the taxonomy defines — NOT a badge-local re-derivation.
3. **AC3 — Honest naming + disclosure.** No badge on any surface reads a bare "✓ Verified" for an association import. The tier-1 badge attributes the claim to the association; a tooltip / `aria-label` discloses the meaning (e.g. "Confirmed as a member by [Association]. Identity not independently verified."). Copy owned by Paige; must not overstate (R1).
4. **AC4 — Scoped to association provenance.** The badge renders ONLY for association-sourced respondents (`imported_association` + any future association sources) — NOT for `public` / `enumerator` / `clerk` / `imported_other`. A self-registered or field-enumerated worker does not get an association badge.
5. **AC5 — Marketplace card REDESIGN + badge integration (UX: Sally — Awwal 2026-07-19).** The current `WorkerCard` (`apps/web/src/features/marketplace/components/WorkerCard.tsx`) is functional but **bland** — profession title + LGA + experience + truncated bio + skill chips + a text "View Profile"; no warmth, no person, no visual trust, no imagery. **Sally redesigns the card to be inviting:** stronger visual hierarchy (lead with the person/trade), warmth (avatar / initial / trade iconography within privacy limits), legible trust signals, a real CTA — AND integrates the two-tier association badge **coherently alongside the existing `GovernmentVerifiedBadge`** (`marketplace/components/GovernmentVerifiedBadge.tsx`) so they coexist without clutter (define the badge hierarchy: government-verified vs association-confirmed vs member-verified). Legible at grid density; accessible names + contrast; tiers colour-blind-safe (not colour-only). Reuse the design system; a net-new card primitive only if the redesign warrants it (Sally's call — record it).
6. **AC6 — Tests + green.** Unit/component tests: tier-1 renders with the association name; name-missing → graceful fallback label; tier-2 renders on member-confirmed; NO badge for non-association sources; tooltip/aria present; never emits "Verified" bare for imports. Web `tsc` + lint clean; targeted web suite green; no regression to existing marketplace cards.
7. **AC7 — Experience-as-stat + graceful degradation.** Years-at-trade renders as a prominent stat (large tabular number + unit + label) with a ★ "seasoned" marker at ≥20 years; omitted cleanly when absent. A **sparse profile** (one skill, no bio, no association, no experience) still renders a dignified, intentional card — avatar + profession + LGA + CTA — with NO empty blocks or dangling labels. Tests cover the sparse card + the ≥20-year marker + the no-experience case.

### AC8 — Show the business name when the worker gave one (added 2026-08-09)

**97 respondents already answered `business_name`** (199 answered `has_business`) — measured on prod.
It is collected, unused, and it is the name they would want an employer to see.

1. Where a marketplace-visible respondent has a non-empty `business_name`, the card leads with it as
   the identity line, with the profession beneath. No business name → the card is exactly as it is
   today, profession-led. **Sparse-card dignity (AC7) applies: no empty slot, no dangling label.**
2. ⚠️ **A business name is not a personal name.** It does not reopen the no-name decision, and it must
   not be reconstructed from `firstname`/`surname` if the field is blank — a fallback that quietly
   prints a person's name would breach the anonymity promise the consent copy makes.
3. Trim and length-cap it; a signboard string can be long and must not break grid density.
4. Tests: renders when present · absent → unchanged profession-led card · never falls back to a
   person's name · long value truncates without breaking layout.

## Tasks / Subtasks

> ⚖️ **Tasks restructured 2026-08-17 (dev) to match the 2026-08-09 split.** Tasks 1–3 as
> originally written were the BADGE half — the data contract with 13-2, the two-tier badge
> component, and the two-tier visual distinction. All three moved to **13-58** with AC1–AC4 and
> AC6's badge cases; leaving them here as unchecked boxes on a story that must not implement them
> was precisely the record-vs-artifact drift the split note calls out. The tasks below are the
> ACs this story actually owns: **AC5, AC7, AC8**.

- [x] **Task 1 — ~~Data contract with 13-2~~ → MOVED to 13-58** (AC: #1, #2, #4)
  - [x] Not implemented here by design: `imported_association` has zero prod rows and 13-2 (the WRITE side) is still `ready-for-dev`. Owned by 13-58.
- [x] **Task 2 — ~~Badge component + tiering~~ → MOVED to 13-58** (AC: #1, #2, #3, #4)
  - [x] Not implemented here by design. The card provides the single top-right trust slot (Task 5); 13-58 fills in the association/member tiers and the precedence between them.
- [x] **Task 3 — ~~Two-tier badge design + copy~~ → MOVED to 13-58** (AC: #3)
  - [x] Sally's card design pass IS implemented (Task 5). The two-tier badge palette/copy decision travels with the badge itself to 13-58.

- [x] **Task 5 — Card redesign** (AC: #5)
  - [x] Shared `TradeAvatar` (`components/common/`, not marketplace-local): glyph keyed off the canonical skill SECTOR via `skillSectorForSlug`, tile colour deterministic from the profile `id`. Zero PII — no name, no photo, no initials.
  - [x] Rebuild `WorkerCard` to the visual spec: avatar + identity line + LGA meta, one top-right verification pill, hero stat, skill chips, clamped bio, full-width filled CTA "View profile & contact →".
  - [x] `GovernmentVerifiedBadge` gains a `compact` size for the card's pill slot. Palette and wording UNCHANGED — it never shortens to a bare "Verified" (R1).
  - [x] `TrustBadge` deliberately NOT built: it would only delegate to the existing pill until 13-58 lands the tiers it exists to map. Recorded in Completion Notes.
- [x] **Task 6 — Experience as an honest stat + graceful degradation** (AC: #7)
  - [x] MEASURED FIRST: `years_experience` is `select_one experience_list` (`docs/questionnaire_schema.md:51`) with choices `less_1`/`1_3`/`4_6`/`7_10`/`over_10` (`:134-141`). No exact year count exists; ≥20 years is unknowable. Awwal's ruling 2026-08-17: bucket stat, ★ re-anchored to the TOP bucket.
  - [x] Shared bucket vocabulary + hero-stat labels + normaliser in `packages/types/src/marketplace.ts` (single source for worker, backfill and card). Legacy pre-13-38 stored values still render.
  - [x] Fix the mapping defect: the old canon (`entry`/`1-3`/`4-7`/`8-15`/`15+`) stored NULL for `less_1` and `over_10` and collapsed `7_10` into `4-7`. Worker now delegates to the shared normaliser.
  - [x] Stat omitted cleanly when experience is absent OR unrecognised; sparse card stays dignified.
- [x] **Task 7 — Business name thread-through** (AC: #8)
  - [x] `marketplace_profiles.business_name` column (nullable, capped at 80).
  - [x] Extraction worker reads `raw_data.business_name` via `normaliseBusinessName` — trim + cap, ONE source key, NO firstname/surname fallback (AC8.2).
  - [x] Additive read: `mp.business_name` in the search SQL → `businessName` on `MarketplaceSearchResultItem`. No new registry read.
  - [x] Card leads with the business name, profession beneath; profession-led and slot-free when absent; long names truncate with the full value in `title`.
  - [x] Backfill for the rows that predate the column: `marketplace-card-backfill.service.ts` + `scripts/_backfill-marketplace-card-fields.ts`, PREVIEW by default.
- [x] **Task 8 — Tests + validate** (AC: #6 minus the badge cases)
  - [x] RED-verified every load-bearing change (see Debug Log). Real-DB smoke covers the raw SQL the mocked tests cannot. Web + API `tsc` clean, all three packages lint clean, full suite green.

## Dev Notes

### Dependencies
- **13-2 (BLOCKED-FOR-DEV)** — the WRITE side: persists `source = imported_association`, the **association/guild name**, and the **member-confirmed** promotion flag. This render story can be built against the data contract in parallel, but its data is only meaningful once 13-2 lands + a real batch imports. Sequence the visible-in-prod behaviour after 13-2.
- **Taxonomy Axis-3** (`registry-data-status-taxonomy.md`) — the verification tiers; do not re-define. **13-2 top DECISION block** — the ruling this renders.
- No API/schema change owned here IF 13-2 exposes the fields; if the marketplace query needs the association name threaded through, that's a small additive read (coordinate — do not fork a registry read; see [[13-33]] canonical-read discipline).

### Honesty guardrail (R1 — do not violate)
- The tier-1 badge is a **provenance disclosure**, not an identity claim. Attribute to the association; never bare "Verified". A present NIN is `nin_on_file` (no NIMC path), and for imports it was proxy-transcribed — so even NIN presence does not upgrade to "Verified". Only a member-side check yields tier-2, and even that is "Member-verified" (member confirmed their record), not "Identity verified".

### Locked design decisions (Awwal + Sally, 2026-07-19)
- **No display name on the card** — scraper defence; the card is profession-led. The full profile + contact sit behind **employer login** (existing gate). So warmth comes from the trade-glyph avatar, not initials.
- **No photos** — privacy on a public gov marketplace. **Future-proof:** if Government relaxes this, the **Story 9-12 magic-link self-update** flow already exists (`me.service.ts` `RESPONDENT_SELF_UPDATED`; token gate at `:584`) — reach each worker by email/phone to add a photo; no new infra (verified 2026-07-19).
- **Trade-glyph avatar** — 52px rounded tile, colour deterministic from `id`, white trade glyph keyed off profession/top skill; generic fallback. Zero PII, per-card warmth.
- **Two-slot trust model** — (1) a single top-right **verification pill** by precedence `Government verified > Member-verified > none`; (2) a separate **provenance line** "[Association] — confirmed member" for association-sourced workers (additive; never a bare "Verified"). Tier-1 association = provenance line + NO pill (honest: vouched, not self-confirmed).
- **Long association names** truncate on the provenance line with the **full name in a hover/`title` tooltip** (+ `aria-label` with the full disclosure).
- **CTA = "View profile & contact →"**, a full-width filled primary button (fits one line at card width; anchors rather than crowds the card).
- **Experience is a HERO stat** — years-at-trade promoted to a prominent stat block (large brand-coloured tabular number + unit + label), NOT a quiet meta row; a ★ "seasoned" cue at **≥20 years** (derived from the number — honest, not a claim). Omitted gracefully when years are absent.
- **Sparse profiles stay dignified** — the commonest launch card (one skill, no bio, no association, maybe no experience) must still look intentional: the trade-glyph avatar + profession + LGA + CTA carry it. Every optional block (stat, bio, chips-overflow, provenance, pill) degrades gracefully.
- **Build `TradeAvatar` + `TrustBadge` as SHARED components** (not marketplace-local) — the same person renders identically on the card, the profile page, and the registry table. `TrustBadge` maps the verification substrate (do not re-derive); `TradeAvatar` = glyph-map(profession/skill) + deterministic colour(id).
- **Interactive mockup (v2):** in-repo at `docs/design/marketplace-card-13-38.html` (durable, version-controlled) · rendered preview https://claude.ai/code/artifact/f354d58d-f969-41d6-95e9-770539cb1ebc (before/after · all trust states · experience-as-stat · sparse profiles · light + dark).

### Project Structure Notes
- **Web only** (render): marketplace card component + a badge under `apps/web/src/features/<marketplace>/…` (confirm the exact feature path at build); co-located tests. Reuse the existing badge pill; no new primitive.
- No new deps. No DB. Any read-shape change threads the association name through the existing marketplace query (additive), never a new registry read.

### References
- [Design (DURABLE, in-repo): `docs/design/marketplace-card-13-38.html` — Sally's card redesign, version-controlled so it travels with the code. THE visual spec this story builds against. Open in a browser. Rendered preview also at https://claude.ai/code/artifact/f354d58d-f969-41d6-95e9-770539cb1ebc (before/after, all trust states, experience-as-stat, sparse profiles, light + dark).]
- [Source: apps/web/src/features/marketplace/components/WorkerCard.tsx — the current card being redesigned; GovernmentVerifiedBadge.tsx = the existing badge to coexist with]
- [Source: _bmad-output/implementation-artifacts/13-2-association-group-channel-and-import.md — top DECISION block (Awwal 2026-07-19: include-with-badge, two-tier, honest naming) + the WRITE side that persists source/association-name/member-confirmed]
- [Source: _bmad-output/planning-artifacts/registry-data-status-taxonomy.md — Axis-3 verification tiers (association-confirmed vs member-verified vs nin_on_file); R1 no-NIMC-path locked]
- [Source: docs/launch-campaign/association-condensed-sheet-spec.md §1 — the sheet header carries the association/guild name (the badge's `[Association]`)]
- [Source: apps/web/src/features/dashboard/components/RespondentRegistryTable.tsx:25-45 — `VerificationStatusBadge` pill convention to mirror]

## Dev Agent Record

### Agent Model Used

Amelia (dev agent) · Claude Opus 5 (1M context) · 2026-08-17 · worktree `C:\Users\DELL\wt-13-38`, branch `story/13-38-marketplace-card`.

### Debug Log References

**Every load-bearing change was RED-verified — the test was watched to FAIL with the change removed, not asserted to cover it.**

| # | Change | How it was broken | Result |
|---|--------|-------------------|--------|
| 1 | `businessName` written by the extraction worker | dropped it from the insert `.values({…})` | 5 fail (all AC8 worker cases) |
| 2 | The five real experience buckets | shrank `MARKETPLACE_EXPERIENCE_LEVELS` to `['1_3','4_6']` | 3 fail — exactly `less_1`, `7_10`, `over_10`: the three answers the old canon lost |
| 3 | Backfill dry-run guard | forced `const apply = true` | 2 fail (both dry-run tests) |
| 4 | `mp.business_name` in the search SQL | removed the column from the SELECT list | 1 fail — **only** the real-DB smoke; the mocked unit test stayed green, which is why that file exists |
| 5 | AC8 identity line | `identityLine = professionLabel` | 2 fail (business-name-leads, long-signboard) |
| 6 | AC7 seasoned marker | `{false && (<Star …/>)}` | 2 fail (top-bucket seasoned, legacy `15+`) |
| 7 | Trade-glyph avatar | removed `<TradeAvatar/>` from the card | 2 fail (avatar, sparse-card dignity) |

**A defect the mocked tests could not see.** The backfill's first real-DB run failed with
`42703: column r.adopted_draft_answers does not exist` — Story 13-49 keeps those answers
INSIDE `respondents.metadata` JSONB (`respondents.ts:165` documents the field, `:248` is the
column), and every unit test mocks `db.execute` so the SQL is never parsed. Fixed to
`r.metadata -> 'adopted_draft_answers'`.

**Prod measurement was attempted and BLOCKED.** The read-only distribution query
(`ssh … psql … SELECT COALESCE(experience_level,'NULL'), COUNT(*) FROM marketplace_profiles GROUP BY 1`)
was refused by the sandbox permission classifier, so the live per-bucket counts are NOT in
this record. Every number stated below is cited to a file:line in this repo instead. **Run
that query before/after the backfill** — see the Residuals table.

### Completion Notes List

**AC5 — card redesign (implemented).**
- Shared `TradeAvatar` at `apps/web/src/components/common/TradeAvatar.tsx`, not marketplace-local, so the same person renders identically on the card, the profile page and the registry table later. Glyph = the Appendix-C SECTOR of the top skill via the canonical `skillSectorForSlug` (20 sectors + generic fallback) — deliberately NOT a second skill→icon vocabulary, which is how the pre-13-22 `ISCO08_SECTOR_MAP` drifted until 90/150 slugs fell to 'Other'. Colour = deterministic hash of the profile `id`, stable across renders and sessions, stored nowhere.
- `WorkerCard` rebuilt to the spec: avatar + identity line + LGA, one top-right pill, hero stat, chips, clamped bio, full-width filled CTA "View profile & contact →". No name, no photo, no initials.
- `GovernmentVerifiedBadge` gained `compact` (size only). **The wording never shortens to a bare "Verified"** — R1 is that a badge says WHO verified. I wrote `compact ? 'Verified' : …` first and reverted it in the same session; the test now asserts the full string so it cannot come back.
- **`TrustBadge` NOT built** (deviation from a locked decision, recorded deliberately). Until 13-58 lands the association/member tiers, a `TrustBadge` could only delegate to the existing pill — a net-new primitive with one caller and no mapping to do. The card exposes ONE pill slot; 13-58 owns what fills it and the precedence between tiers. Its palette decision travels with it: the gov pill stays green here rather than moving to brand-tint, because re-styling a shared badge (used on the profile page too, with a test asserting `bg-green-100`) to reserve green for a tier that renders for nobody yet is churn against zero users.
- **No association provenance line, no Member-verified tier** — 13-58, gated on 13-2. A test asserts their absence so they cannot arrive here by accident.

**AC7 — experience stat. THE STORY'S AC AS WRITTEN WAS UNIMPLEMENTABLE; ruling taken from Awwal 2026-08-17.**
- `years_experience` is `select_one experience_list` (`docs/questionnaire_schema.md:51`), choices `less_1`/`1_3`/`4_6`/`7_10`/`over_10` (`:134-141`). **The ceiling is "Over 10 years" — no exact year count is collected anywhere**, so AC7's "large tabular number" of years and its "★ seasoned at ≥20 years" cannot be honestly rendered at any layer. The mockup's "34 yrs" is sample fiction (`docs/design/marketplace-card-13-38.html:346` says so).
- Awwal's ruling: **bucket stat, ★ re-anchored to the TOP bucket**, plus fix the mapping defect.
- The defect: the old local canon (`entry`/`1-3`/`4-7`/`8-15`/`15+`, `marketplace-extraction.worker.ts:33` pre-change) matched values no form emits. Traced against the five real answers — `less_1` → NaN → not in labelMap → **NULL**; `1_3` → 1 → `1-3`; `4_6` → 4 → `4-7`; `7_10` → 7 → **`4-7`** (7–10 yrs silently sold as 4–7); `over_10` → NaN, labelMap had `'over 15'` not this → **NULL**. Two of five real answers stored NULL and one mis-bucketed, so the "hero stat" would have been empty or wrong on a large share of live cards.
- Vocabulary, hero-stat labels and the normaliser now live once in `packages/types/src/marketplace.ts` (`MARKETPLACE_EXPERIENCE_LEVELS`, `experienceStatFor`, `normaliseMarketplaceExperienceLevel`) and the worker + backfill + card all read it.
- The normaliser deliberately does NOT accept the old canon or the speculative `senior`/`expert`/`mid` variants: those are either already-normalised output rather than raw form data, or ambiguous against these bucket edges. Re-bucketing them would launder a guess into a canonical claim. Unmappable → NULL + a warn log, and the card omits the block.
- Legacy stored values still render (`4-7` → "4–7 yrs", `15+` → seasoned) so cards are honest whether or not the backfill has reached that row.

**AC8 — business name. Full thread-through, approved by Awwal 2026-08-17 as a deliberate deviation from this story's "Web only … No DB" note.**
- `business_name` existed nowhere in the marketplace pipeline: not a column, not extracted, not in the SQL, not in the type. Card-side-only would have rendered for nobody — the [ship-a-fix-that-never-fires] class.
- New nullable `marketplace_profiles.business_name`; worker extracts via `normaliseBusinessName` (trim + 80-char cap); additive `mp.business_name` in the search SQL → `businessName` on the item; card leads with it and drops the profession to a subline.
- **AC8.2 has a structural guarantee, not just a test**: exactly ONE source key is read. Tests seed `firstname`/`surname`/`full_name` alongside a blank business name and assert null, so any future fallback chain reddens immediately.
- Backfill: `apps/api/src/services/marketplace-card-backfill.service.ts` (logic, inside tsconfig, unit-tested) + `apps/api/scripts/_backfill-marketplace-card-fields.ts` (thin CLI). PREVIEW by default; live needs `--apply --confirm-i-am-not-dry-running`. Idempotent, and it **never blanks a business_name already stored** (a later self-service edit is not undone). Answers come from the latest submission, falling back to `respondents.metadata->'adopted_draft_answers'` for the 13-49 D2 rows that have no submission — otherwise the run would report a sweep it never made.

**Test-infrastructure finding (out of scope, worth a story).** `packages/types` has test files
(`src/__tests__/normalised.test.ts`, `roles.test.ts`) but **no `test` script and no vitest
config**, so `pnpm test` never runs them. That is why this story's shared-canon logic is
covered from the API and web suites, which do run, rather than beside the code it tests.

**Verification run (2026-08-17).** Web `tsc` clean · API `tsc` clean · `@oslsr/types`,
`@oslsr/api` (incl. the three drift guards), `@oslsr/web` lint clean (the only 2 warnings are
pre-existing, in an untouched `LiveSelfieCapture.test.tsx`) · targeted: 44 worker · 56
marketplace service · 9 backfill · 5 real-DB smoke · 22 WorkerCard · 6 TradeAvatar · 128 across
all web marketplace files · **full suite: API 277 files passed / 2 skipped; web 267 files,
2927 tests passed / 2 todo.**

⚠️ **One flake, chased rather than waved off.** The first full run reddened
`src/__tests__/route-resolution.integration.test.tsx > resolves '/login' to a real component`
— a file with a documented starvation history (Pitfall #37 / 9-21 review). Evidence it is
contention and not this story: that file took **68.9s** inside the full run vs **17.0s** in
isolation, `/login` route registration is untouched by these changes, and it is green on both
re-runs (isolation 57/57, then the whole web package alone 267 files / 2927 tests). Recorded
because "it's just the known flake" is exactly the sentence that once hid a real prod bug.

### File List

> ⚖️ **Re-review 2026-08-18 (R12): this list was two files short of `git status`.** The FTS trigger
> and the badge test file had been changed on 2026-08-18 and never declared. Both are added below,
> alongside the files this review pass itself touched. Verified against `git status --porcelain`,
> not from memory.

**Modified**
- `_bmad-output/implementation-artifacts/13-38-marketplace-association-confirmed-badge.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `.github/workflows/ci-cd.yml` — **re-review**: prod deploy chain now runs `migrate-custom-sql-init.ts` (R8)
- `apps/api/src/db/custom-sql/marketplace-trigger.sql` — **was undeclared**: `business_name` at weight A, + the ordering precondition (R8/R9)
- `apps/web/src/features/marketplace/__tests__/GovernmentVerifiedBadge.test.tsx` — **was undeclared**
- `apps/api/src/workers/marketplace-extraction.worker.ts` — **re-review**: conflict-path null-guard (R11)
- `apps/api/scripts/_backfill-marketplace-card-fields.ts` — **re-review**: `--help` fiction removed + ordering warning (R9/R13)
- `packages/types/package.json` — **re-review**: `test` script added (R14)
- `apps/web/src/features/onboarding/components/__tests__/LiveSelfieCapture.test.tsx` — ⚠️ **NOT 13-38.** Two dead `eslint-disable` directives removed at Awwal's request (lint now 0 warnings). Unrelated feature — **commit separately**
- `apps/api/src/db/schema/marketplace.ts`
- `apps/api/src/services/__tests__/marketplace.service.test.ts`
- `apps/api/src/services/marketplace.service.ts`
- `apps/api/src/workers/__tests__/marketplace-extraction.worker.test.ts`
- `apps/api/src/workers/marketplace-extraction.worker.ts`
- `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx`
- `apps/web/src/features/marketplace/__tests__/MarketplaceSearchPage.test.tsx`
- `apps/web/src/features/marketplace/__tests__/WorkerCard.test.tsx`
- `apps/web/src/features/marketplace/components/GovernmentVerifiedBadge.tsx`
- `apps/web/src/features/marketplace/components/WorkerCard.tsx`
- `apps/web/src/features/marketplace/components/MarketplaceFilters.tsx` — **adjudication 2026-08-18 (R4)**: free-text input → `Select` bound to `MARKETPLACE_EXPERIENCE_LEVELS` (value = slug, label = `experienceLabelFor`)
- `apps/web/src/features/marketplace/__tests__/MarketplaceFilters.test.tsx` — **adjudication 2026-08-18 (R4)**: NEW. The control had no behavioural test at all; 4 tests + a RED-verified slug-vs-label guard
- `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx`
- `docs/runbooks/backfill-operator-residuals.md`
- `packages/types/src/marketplace.ts`

**Why the profile page is in scope:** changing the stored bucket vocabulary made it print the raw
slug (`7_10`) at users — it rendered `profile.experienceLevel` verbatim. It now goes through the
shared `experienceLabelFor`. That regression was mine, so the repair belongs here, not in a
follow-up. The runbook edit registers the new backfill in the run tracker so it cannot silently
stay un-run.

**Added**
- `apps/api/scripts/migrate-custom-sql-init.ts` — **re-review (R8)**: applies `src/db/custom-sql/*.sql` on every deploy + in CI
- `packages/types/src/__tests__/marketplace.test.ts` — **re-review (R14)**: first direct tests of the shared canon
- `apps/api/scripts/_backfill-marketplace-card-fields.ts`
- `apps/api/src/services/__tests__/marketplace-card-backfill.service.test.ts`
- `apps/api/src/services/__tests__/marketplace-card-fields-db-smoke.integration.test.ts`
- `apps/api/src/services/marketplace-card-backfill.service.ts`
- `apps/web/src/components/__tests__/TradeAvatar.test.tsx`
- `apps/web/src/components/common/TradeAvatar.tsx`

### Residuals (deploy-gating — this story is NOT visibly complete until these run)

| # | Residual | Evidence that closes it |
|---|----------|-------------------------|
| R1 | `business_name` is a NEW COLUMN. `db:push` must run against prod before/with the deploy, or the search SQL 500s on every marketplace request. | `\d marketplace_profiles` shows `business_name`, and `/api/v1/marketplace/profiles` returns 200. |
| R2 | The backfill has NOT run anywhere but the local test DB. Until it does, existing cards keep their NULL/mis-bucketed experience and no business name — AC7/AC8 render for the new rows only. | `_backfill-marketplace-card-fields.ts --dry-run` output (the count IS the "did it fire?" evidence), then `--apply --confirm-i-am-not-dry-running`, then a re-run showing `needsUpdate=0`. |
| R3 | The prod experience-level distribution was never measured (classifier blocked the ssh). The "224 live cards" figure in this story is inherited, not re-measured by dev. | `SELECT COALESCE(experience_level,'NULL'), COUNT(*) FROM marketplace_profiles GROUP BY 1 ORDER BY 2 DESC;` before and after R2. |
| R4 | `experience_level` filter values changed (`4-7` → `4_6` etc.). The marketplace experience filter is a FREE-TEXT input (`MarketplaceFilters.tsx:96`) matched with `=`, so any bookmarked/typed old value now matches nothing. | Decide: leave (the free-text filter was already near-unusable against slugs) or give it a select bound to `MARKETPLACE_EXPERIENCE_LEVELS`. Awwal's call; not silently in scope here. |

### Review Follow-ups (AI)

- [x] **[AI-Review][High] RESOLVED 2026-08-17 — and it was BIGGER than the finding.** Reproduced first (4 new tests red), then fixed. The review's one-line fix (`nextExperience !== null && …` on `experienceDiffers`) is necessary but **NOT sufficient**: it gates *whether* a row is updated, while the `UPDATE` statement still carried `experience_level = ${nextExperience}` unconditionally — so a row updated for its **business_name alone** still blanked its experience. Verified: with only the review's fix applied, 3 of my 4 cases passed and the 4th still failed. Both halves are now guarded — `experienceDiffers` gets the null-guard, and the SET clause writes `experienceDiffers ? nextExperience : row.experience_level` (mirroring what `business_name` already did). The second half is asserted **end-to-end in the real-DB smoke**, because a mocked `db.execute` sees only the SQL text — which names the column either way — never the bound value. RED-verified: reverting the SET clause reds that smoke test alone.
- [x] **[AI-Review][Medium] RESOLVED 2026-08-17 — the review was right that the justification was false.** My comment blamed "a later self-service edit"; there is no such path (`ProfileEditPayload` carries `bio` + `portfolioUrl` only), so the stated reason was fiction. The asymmetry is nonetheless **kept, now deliberately and documented at both sites**: the live worker sees a whole submission, so a resubmission dropping `business_name` legitimately retracts it going forward; the backfill reads only the LATEST submission, so a null there means "this one has none", NOT "the person retracted it" — honouring it as a retraction would delete names the live path legitimately stored from another submission. A one-shot repair tool adds and corrects; it never subtracts.
- [x] **[AI-Review][Low] RESOLVED 2026-08-17.** `formatSummary()` now names the direction — `experience_level set/fixed … (never blanked)` / `business_name added/fixed … (never blanked)` — and the unresolved-answer note states that an already-stored value is kept as-is. An operator can no longer read a non-zero count as possible data removal.

### Review Follow-ups (AI) — RE-REVIEW 2026-08-18

> All nine were FIXED in this pass (Awwal's instruction: "create action items and fix them all
> automatically"). Each fix that changes behaviour was RED-verified — the fix was reverted and the
> new test watched to fail — exactly as the first review demanded of the dev.

- [x] **[AI-Review][High] R8 — the FTS trigger had no automated path to ANY database.** `db:custom`
  appeared in no workflow and no deploy step, so `custom-sql/marketplace-trigger.sql` shipped as
  dead code: CI's test DB never had the trigger at all, and prod kept whatever definition someone
  last applied by hand in Story 7-1 (2026-03). **Proven, not argued:** dropping the trigger locally
  to reproduce a CI-fresh DB made this story's own smoke test `finds a worker by their business
  name in full-text search (AC8)` FAIL. **Fixed** by `apps/api/scripts/migrate-custom-sql-init.ts`
  — auto-discovered by `db-push-full.ts` (CI) and added explicitly to the prod deploy chain in
  `ci-cd.yml`, per the convention `db-push-full.ts:28-29` documents. It re-reads the same `.sql`
  files `db:custom` reads (one source of truth) and asserts the installed definition carries
  `business_name` before reporting success.
- [x] **[AI-Review][High] R9 — trigger-vs-backfill ordering was unstated, and idempotency made it
  permanent.** The trigger recomputes `search_vector` only on INSERT/UPDATE; the backfill is
  idempotent. An operator following the runbook exactly would write every business name under the
  old trigger, and a re-run would report `needsUpdate=0` and never touch those rows again — leaving
  them unfindable by trading name forever, since search matches `search_vector @@ plainto_tsquery`
  as a hard WHERE filter. The trigger's own comment asserted the safe case without its precondition.
  **Fixed** structurally (the deploy runner lands before any operator-gated backfill) plus the
  precondition and a **recovery step** (`UPDATE … SET business_name = business_name`) written into
  the runbook, the trigger header and the script's `--help`.
- [x] **[AI-Review][Medium] R10 — `profileIds: []` silently swept the WHOLE table.** `scopeIds &&
  scopeIds.length > 0` put `[]` in the same branch as `undefined`. **Proven by execution** (probe:
  omitted → `SCOPED? false`; `[]` → `SCOPED? false`; one uuid → `true`). With `apply: true` that is
  the "live grenade" the parameter was added to prevent, reached by the input that looks safest.
  **Fixed:** `[]` now returns an empty summary without touching the DB; `undefined` still sweeps
  everything for the operator run. ⚠️ **This overturns a deliberate choice** — the existing test
  `ignores an empty id list rather than silently sweeping nothing` asserted the old behaviour. It
  is inverted, because a visible no-op (`scanned=0`) is a better failure than a silent full-table
  write. **Awwal can reverse this**; it is a judgement call, not a defect fix.
- [x] **[AI-Review][Medium] R11 — the LIVE worker could still blank a valid bucket.** The
  `onConflictDoUpdate` set wrote `experienceLevel` unconditionally. The upsert re-runs on every
  resubmission (`submission-processing.service.ts:1344`, the only caller) and a supplemental or
  self-edit submission need not carry `years_experience` at all. This story also NARROWED what
  normalises (`senior`/`expert`/`junior`/`mid`/`intermediate`/`over 15`/`1 to 3`/`4 to 7`/`8 to 15`
  all now yield null), so strictly MORE answers reach null than before it. R5's reasoning was
  applied to the backfill only. **Fixed:** the conflict path preserves the stored column when the
  new value is null; the INSERT half still legitimately writes null (a new row has nothing to
  protect). `businessName` deliberately keeps its unconditional write.
- [x] **[AI-Review][Medium] R12 — the story record was a full review round behind the code.** The
  tree carried 7+ `[AI-Review] 2026-08-18` annotations (updated_at ordering, unscoped-apply,
  `businessNameLikePersonName`, profile-detail `businessName`, the FTS trigger, the title-cap note)
  with **no 2026-08-18 entry anywhere in the story** — and the code cited an "R7" the ledger did not
  contain. Counts were stale (recorded 14/14 + 6/6; actual 21 + 9) and the File List omitted two
  changed files. **Fixed** throughout this section, the ledger and the File List.
- [x] **[AI-Review][Medium] R13 — the false "self-service edit" justification survived in two of
  three sites.** Follow-up #2 reported it removed; it was removed from the service comment only. It
  remained in `_backfill-marketplace-card-fields.ts`'s operator-facing `--help` text and in
  `marketplace-card-backfill.service.test.ts:270`. Confirmed `ProfileEditPayload` carries
  `editToken`/`bio`/`portfolioUrl` only. **Fixed** at both.
- [x] **[AI-Review][Low] R14 — the shared canon had no direct tests, and `packages/types` never
  ran.** `normaliseMarketplaceExperienceLevel`, `experienceStatFor` and `normaliseBusinessName` —
  the single source of truth for worker, backfill and card — returned **zero hits** across
  `**/*.test.*`. The package had vitest and six test files but no `test` script, so `pnpm test` ran
  none of them. **Fixed:** added the `test` script (**99 pre-existing tests now run for the first
  time, all passing**) and `packages/types/src/__tests__/marketplace.test.ts` (14 cases).
- [x] **[AI-Review][Low] R15 — a bare year count rounded UP across bucket gaps.** `3.5` → `4_6`
  rendered "4–6 yrs" for someone with three and a half years; `6.5` → `7_10`. Over-claiming is the
  one direction AC7's whole rationale forbids. **Fixed** to round down into the lower bucket;
  RED-verified.
- [x] **[AI-Review][Low] R16 — no exhaustiveness guard on the sector→glyph map.** `GLYPH_BY_SECTOR`
  is a second sector vocabulary keyed by string literal with a silent `Briefcase` fallback. Verified
  complete today (20/20, nothing missing or extra) — but nothing failed if the taxonomy renamed or
  added a sector, which is the exact drift the component's own comment cites as Story 13-22's lesson.
  **Fixed** with a test that walks `SKILL_TAXONOMY` and names any sector that falls to the fallback;
  RED-verified by deleting one mapping.

## Senior Developer Review (AI) — RE-REVIEW

**Reviewer:** Awwal (via adversarial code-review workflow) · **Date:** 2026-08-18 · **Scope:** the
dev's fix pass + a fresh adversarial sweep of the whole diff, on the uncommitted working tree.

**The dev's central claim is TRUE, and I verified it the hard way.** RED-verifying both halves
independently: removing the `experienceDiffers` null-guard reds **4** mocked tests; reverting the
`SET` clause to unconditional leaves the mocked suite **21/21 green** while reding **exactly 1**
real-DB smoke test (`preserves a valid legacy experience_level through a business-name-only
update`). The dev's argument that a mocked `db.execute` cannot see a bound value is correct, and
their claim that the review's one-liner was necessary-but-not-sufficient is confirmed by execution.

**Verification re-run (not re-read), AFTER all nine fixes:** API `tsc` clean · web `tsc` clean ·
**lint 0 errors AND 0 warnings** across all three packages, all three API drift guards green ·
API marketplace suites **134** · `@oslsr/types` **113** (7 files — previously **zero** ran; verified
through turbo, not just the package script) · web marketplace + TradeAvatar **133** (8 files) ·
**full API package: 277 files passed / 2 skipped, 3872 tests passed / 8 skipped / 1 todo** (the fix
pass's `off-hours.heuristic` timeout did not recur) · **full web package: 266/267 files, 2931 tests
passed**.

⚠️ **The one web failure was chased, not waved off.**
`route-resolution.integration.test.tsx > resolves '/login' to a real component` timed out at 20s
under full-suite load — the same file and the same single case the dev's own run hit. Isolated it
runs **57/57 in 6.1s**, under a third of its own timeout, and nothing in this diff touches routing
or `/login` registration. Pitfall #37 contention, consistent with that file's documented starvation
history. Recorded because "it's just the known flake" is the sentence that once hid a real prod bug.

**Lint warnings cleared at Awwal's request (2026-08-18) — OUT OF THIS STORY'S SCOPE, declared not
hidden.** The two long-standing `Unused eslint-disable directive` warnings in
`apps/web/src/features/onboarding/components/__tests__/LiveSelfieCapture.test.tsx` were dead code:
`apps/web/eslint.config.js:148` sets `@typescript-eslint/no-explicit-any` to `off` for test files,
so both `// eslint-disable-next-line` comments suppressed a rule that could never fire there.
Removed; that file still passes 9/9 and web `tsc` is clean. It is an onboarding-feature file with no
relation to 13-38, so **it belongs in a separate commit** — listed in the File List below rather
than left as an undeclared change, which is the R12 lesson applied to my own edit.

**What the fix pass did not cover — the two the re-review found by execution:**
1. The 2026-08-18 round added `business_name` to the FTS trigger, and nothing in this repository
   applies that file. Reproducing a CI-fresh DB reds the story's own AC8 search smoke. The "full
   suite green" that accompanied the fix pass was true only on a machine where `db:custom` had been
   run by hand — Pitfall #47, a locally-cached gate standing in for the real one.
2. `profileIds: []` degraded to a full-table sweep, which the mocked test suite asserted as correct.

**Findings, most severe first:** see the Review Follow-ups above (R8–R16: 2 High, 4 Medium, 3 Low),
all fixed in this pass.

**On the dev's self-report:** every count and claim I could re-execute reproduced, and the two
AC-vs-reality escalations remain correctly judged. The gap is not honesty, it is that the record
stopped being written on 2026-08-17 while the code kept moving to 2026-08-18 — the repo's own
"a record about the work is not the work" pattern, caught here by diffing git against the File List
rather than by reading the story.

---

## Senior Developer Review (AI) — FIRST PASS (2026-08-17, superseded above)

**Reviewer:** Awwal (via adversarial code-review workflow) · **Date:** 2026-08-17 · **Scope:** AC5 + AC7 + AC8 only (post-split), on the uncommitted working tree.

**Verification actually re-run (not just re-read):**
- `pnpm --filter @oslsr/api exec tsc --noEmit` → clean. `cd apps/web && pnpm exec tsc --noEmit` → clean. Matches the dev's claim.
- `pnpm --filter @oslsr/types --filter @oslsr/api --filter @oslsr/web lint` → 0 errors, 2 pre-existing warnings in `LiveSelfieCapture.test.tsx` (untouched by this story). Matches the dev's claim exactly, including the three API drift guards (registry-read, respondent-write, story-residual) all green.
- API targeted: worker + service + backfill tests together → **109/109 passed** (44 + 56 + 9, matching the dev's breakdown exactly).
- Real-DB smoke (`NODE_ENV=test DATABASE_URL=…/app_test`) → **5/5 passed**; the `business_name` column is confirmed already pushed to the test DB.
- Web targeted: WorkerCard + TradeAvatar + MarketplaceProfilePage + MarketplaceSearchPage → **85/85 passed** (22 + 6 + 39 + 18), run from `apps/web` per house rule.
- Did **not** re-run the full API(277-file)/web(267-file) suite — targeted + tsc + lint gave sufficient signal for the story's actual diff; flagging this gap explicitly rather than claiming full-suite parity.
- **RED-verified independently** (neutered the code, confirmed the test actually reds, then restored — tree diffed clean afterward):
  - Dry-run guard (`marketplace-card-backfill.service.ts` — forced `apply = true`): 2 tests failed exactly as the dev's Debug Log row #3 claims.
  - `mp.business_name` removed from the search SQL SELECT list: the **mocked** `marketplace.service.test.ts` stayed green (56/56) while the **real-DB smoke** reddened (1/5 failed) — confirms the dev's row #4 and the stated reason the smoke test exists.
  - **New RED-verify the dev did not run**: seeded a row with `experience_level='8-15'` (a valid pre-13-38 value) and `raw_data.years_experience='senior'` (a label the OLD canon mapped but the NEW canon deliberately excludes), then ran the backfill in apply mode. `result.updated` was **1** — the backfill overwrote the working `8-15` value with `NULL`, which would delete that worker's hero stat from their card. This is the High finding below.

**Findings (most severe first):**

1. **HIGH — CONFIRMED.** `apps/api/src/services/marketplace-card-backfill.service.ts:128`. `experienceDiffers = nextExperience !== row.experience_level` has no guard against writing `null` over an already-valid value, unlike the `businessNameDiffers` guard three lines later (`:131`, `nextBusinessName !== null && …`). Any respondent whose raw answer used an old-canon-only label (`senior`, `expert`, `junior`, `mid`, `intermediate`, `over 15`, `1 to 3`, `4 to 7`, `8 to 15` — all accepted by the pre-13-38 worker, all rejected by `normaliseMarketplaceExperienceLevel`) currently has a valid, renderable legacy `experience_level`. Running `--apply` (which R2 explicitly instructs an operator to do) blanks it to NULL, silently deleting the hero stat from a card that rendered correctly before the "fix." Confirmed by execution, not just reasoning (see above). **Smallest correct fix:** `const experienceDiffers = nextExperience !== null && nextExperience !== row.experience_level;` — every legacy bucket already renders correctly via `experienceStatFor`'s legacy table, so there is nothing to gain and real data to lose by nulling it. This must land before R2 (the live backfill run) executes.
2. **MEDIUM — PLAUSIBLE (reasoned from code, not executed).** `business_name` retraction asymmetry between the live worker (`marketplace-extraction.worker.ts:234`, always writes the latest computed value, including null) and the backfill (`marketplace-card-backfill.service.ts:131`, never writes null over a stored value). The same underlying data (a resubmission that omits `business_name`) produces different outcomes depending which code path last touched the row. The backfill's comment justifies the guard by referencing "a later self-service edit," but no such edit path exists in this diff — the actual effect today is that the backfill silently ignores a retraction the live pipeline would have honored. Not necessarily wrong (never-blank is arguably the safer default for a one-time catch-up utility), but undocumented and worth a deliberate call rather than an implicit one.
3. **LOW.** `docs/runbooks/backfill-operator-residuals.md`'s new row doesn't warn the operator that the `experience_level` changes count (once #1 is fixed, this is moot) currently conflates "improved" and "blanked" rows — there's no way to tell from `formatSummary()`'s output alone which direction a change went.

**No findings at Critical severity.** No task marked `[x]` was found undone; no AC claimed implemented was actually missing; AC8.2's no-fallback guarantee is genuinely structural (tests seed `firstname`/`surname`/`full_name` in `raw_data` and assert null) and independently confirmed correct, both via the mocked worker test and the real-DB smoke.

**Dev's self-report:** accurate on every claim checked — tsc, lint, and every stated test count reproduced exactly, and the two RED-verify rows spot-checked (dry-run guard, real-DB-SQL-blindness) both reproduced as described. The one new defect (finding 1) sits in code the dev's own Debug Log table did not RED-verify — the table covers the dry-run flag being *read*, but not the specific asymmetry between how `experienceDiffers` and `businessNameDiffers` treat a null result.

## Residuals ledger

| # | Residual | State | Re-runnable evidence | Owner | Reopen trigger |
|---|----------|-------|----------------------|-------|-----------------|
| R1 (carried) | `business_name` new column needs `db:push` on prod with/before deploy | ✅ **CLOSED ON PROD 2026-08-18, deploy `f6b449d`.** Confirmed genuinely open beforehand (`information_schema.columns` returned only `experience_level` + `search_vector`), then created by the deploy | `information_schema.columns` now returns **`business_name text`**; **`GET /api/v1/marketplace/search` → 200** with `businessName` present in the payload. ⚠️ **THE EVIDENCE LINE IN THIS ROW WAS WRONG:** it named `/api/v1/marketplace/profiles`, which **does not exist** — the router defines only `/profiles/:id` and `/search` (`marketplace.routes.ts:25-26`). That path 404s by design; a future reader would have read the 404 as a broken deploy. `/search` is the endpoint whose SQL actually selects the column | adjudication | Any marketplace request 500ing on a missing column |
| R2 (carried) | Backfill has not run outside the local test DB | ✅ **RUN ON PROD 2026-08-18, deploy `f6b449d`.** Sequence executed in order: R9 trigger confirmed → `--dry-run` → `--apply --confirm-i-am-not-dry-running` → re-run. **182 rows written.** ⚠️ **`experience unresolvable = 0`** — the tool's own count of the R5 hazard (a stored value whose raw answer maps to nothing), independently confirming the zero measured beforehand | **Idempotence proven: the re-run reports `rows needing update ... 0`.** Preview and live agreed exactly — scanned 235, experience 161, business_name 87, self-named 8, written 0 → 182. **FTS proven end-to-end**, not assumed: searching a trading-name token through the PUBLIC API returns the card, so the trigger refired and `search_vector` carries `business_name` | adjudication | `needsUpdate` non-zero on a later re-run with no new submissions |
| R3 (carried) | Prod experience-level distribution never measured (ssh blocked in sandbox) | ✅ **CLOSED at adjudication 2026-08-18 — MEASURED ON PROD.** The inherited **"224 live cards" was wrong: there are 235.** Stored: **111 NULL (47%)**, `4-7` 76, `1-3` 48. Joined to the RAW answers (the number that actually matters) — see the outcome table below the ledger | `SELECT COALESCE(experience_level,'(NULL)'), COUNT(*) FROM marketplace_profiles GROUP BY 1 ORDER BY 2 DESC;` re-run after R2 | adjudication | Post-R2 distribution not matching the predicted table |
| R4 (carried) | Free-text experience filter now matches new slugs only | ✅ **RULED + IMPLEMENTED 2026-08-18 (Awwal: bind it, and make it a real slug so it has a proper home as it grows).** `MarketplaceFilters` now renders a `Select` over `MARKETPLACE_EXPERIENCE_LEVELS`: **value = the slug the column stores, label = `experienceLabelFor`** — the SAME table that renders the card's hero stat, never a second vocabulary. ⚠️ **The change was UNGUARDED when made** — the only existing assertion was `getByTestId('experience-filter')).toBeInTheDocument()`, which passes for an input, a select or a div, so swapping the control broke nothing. New `MarketplaceFilters.test.tsx` (4 tests) closes that hole | `apps/web/src/features/marketplace/__tests__/MarketplaceFilters.test.tsx`. **RED-verified at adjudication:** emitting the label instead of the slug (`value={experienceLabelFor(level)}`) reds *"emits the stored SLUG, never the human label"* and **only** that test — the options-list assertion passes either way, so the slug test is the load-bearing one | adjudication | A bucket added to the canon that does not appear in the filter |
| R5 (new, this review) | Backfill can blank a valid legacy `experience_level` to NULL (Finding 1) | ✅ **CLOSED 2026-08-17** — fixed in BOTH places (the `experienceDiffers` guard AND the `UPDATE … SET` clause; the review's one-liner covered only the first). Regression tests: 4 mocked cases + 1 real-DB end-to-end, all RED-verified | Re-run the RED-verify in this review's Senior Developer Review section (seed `experience_level='8-15'`, `raw_data.years_experience='senior'` → should NOT update once fixed) | dev (next pass) | Any attempt to run `--apply` on prod before this lands |
| R6 (carried) | `business_name` retraction handled inconsistently between worker and backfill (Finding 2) | ✅ **CLOSED 2026-08-17** — asymmetry KEPT deliberately (live path sees a whole submission; the backfill sees only the latest and must not read "absent here" as "retracted"), documented at both sites. ⚠️ Re-review 2026-08-18: the false "self-service edit" justification was removed from the SERVICE only — it survived in the `--help` text and a test comment (R13). Now removed at all three | Compare worker vs backfill behaviour on a resubmission that removes `business_name` | Awwal / dev | Surfaces if an operator notices a retracted name persisting after a backfill run |
| R7 (new, re-review) | **Self-named signboards.** The 2026-08-18 round added `businessNameLikePersonName` to the PREVIEW — cards whose trading name CONTAINS the respondent's own first/last name ("Adekemi Fashion House"). Nothing is suppressed. The consent copy names *profession, LGA, experience level*; whether a self-named signboard may publish is a disclosure call, not a backfill's | ✅ **RULED 2026-08-18 (Awwal): PUBLISH. Nothing is suppressed.** Reason given: the enumerators go to the field and the cards must be up before then. **MEASURED AT ADJUDICATION so the ruling was made on a number, not an abstraction: 8 of 235 live cards** (87 would gain a business name at all). The detector stays in the preview as a reporting signal; it gates nothing | `--dry-run` prints `business_name contains own name  <n>`; the adjudication query reproduces `businessNameCarriesPersonName` (case-insensitive substring, name parts ≥3 chars) in SQL and returns **8** | Awwal (ruled) | A respondent objects to their own name appearing in a published trading name — then it is a takedown, not a backfill change |
| R8 (new, re-review) | Custom SQL (`marketplace-trigger.sql`) had NO automated application path — `db:custom` was in no workflow and no deploy step | ✅ **CLOSED 2026-08-18** — `scripts/migrate-custom-sql-init.ts` (auto-discovered by `db-push-full.ts` for CI; explicit step added to the prod deploy chain in `ci-cd.yml`) | Drop the trigger, run the API smoke → the AC8 search test reds; re-apply → 9/9 green. Deploy log shows `✓ FTS trigger installed; indexes business_name: true` | dev (done) / ops at deploy | The `db:custom`-only pattern reappears for a new `.sql` file |
| R9 (new, re-review) | Trigger-vs-backfill ORDERING: a row written under a stale trigger keeps a stale `search_vector` permanently, because the backfill is idempotent | ✅ **CLOSED 2026-08-18** — ordering made structural (deploy runner precedes any operator-gated backfill); precondition + recovery step documented in the runbook, the trigger header and `--help` | `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='update_marketplace_search_vector';` shows `business_name` BEFORE `--apply`; after the run, search a known trading name and expect a hit | Ops at deploy | Backfill is ever run against a DB whose trigger lacks `business_name` |
| R10 (new, re-review) | `profileIds: []` swept the whole table instead of nothing | ✅ **CLOSED 2026-08-18** — `[]` now scopes to nothing without touching the DB. ✅ **INVERSION CONFIRMED 2026-08-18 (Awwal, on adjudication's recommendation).** The deciding argument is not taste: `profileIds` **omitted** already means "sweep everything" and that is what the operator's real run passes — so under the old semantics `[]` was a *redundant second spelling of "everything"* while the useful meaning had **no spelling at all**. Sorted by irreversibility (§2u): `[]`→nothing wrong = a no-op the operator re-runs; `[]`→everything wrong = **an unintended full-table write on citizen rows**. And the realistic path there is mundane — a caller computes ids, a filter matches none, and a benign empty result becomes a full sweep. That is §2t (*an empty result is not a negative result*) and §2x(a) (*a wrong filter fails permissively*), the same shape as the staff picker that returned 114 citizens because its params were silently dropped | Unit test `treats an empty id list as scope-to-nothing, never as no-scope` — asserts `mockExecute` was **never called**, i.e. it proves the branch never reached the DB rather than that the result merely looked empty | Awwal (ruled) | — |
| R11 (new, re-review) | The LIVE extraction upsert could blank a valid stored `experience_level` on any resubmission whose answers don't normalise | ✅ **CLOSED 2026-08-18** — conflict path preserves the stored column when the new value is null; INSERT half unchanged | Worker test `never blanks a stored experience_level when the new answer is unbucketable`; RED-verified by reverting the guard | dev (done) | A future edit reintroduces a bare `experienceLevel` in the conflict set |
| R14 (new, re-review) | **`packages/types` tests never ran** — no `test` script despite vitest + 6 test files — and the shared canon this story added had no direct test anywhere | ✅ **CLOSED 2026-08-18** — `test` script added; **99 pre-existing tests now execute for the first time**, plus 14 new ones for the canon | `pnpm turbo run test --filter=@oslsr/types` → 7 files / 113 tests (verified through turbo, so `pnpm test` really does reach them) | dev (done) | — |

### ⭐ What R2 will actually do — measured on prod at adjudication, 2026-08-18

The dev could not reach prod (R3), so the backfill's value had only ever been asserted. It is now
counted. Joining `marketplace_profiles` to each respondent's latest non-empty submission:

| stored today | raw answer | rows | what `--apply` does |
|---|---|---|---|
| `(NULL)` | `over_10` | **28** | **gains the TOP bucket** — and with it the ★ seasoned cue |
| `(NULL)` | `less_1` | **9** | gains a stat it does not have |
| `4-7` | `7_10` | **25** | **corrects a downward mis-bucket** |
| `4-7` | `over_10` | **1** | **corrects a downward mis-bucket** |
| `4-7` | `4_6` | 50 | rename only (`4-7` → `4_6`) |
| `1-3` | `1_3` | 48 | rename only (`1-3` → `1_3`) |
| `(NULL)` | *(no raw answer)* | 74 | **unchanged — correctly unfixable** |

**235 live cards · 161 change · 74 stay NULL.** The headline: **28 of the most experienced workers on
the marketplace currently display no experience at all**, and **26 more are shown as less experienced
than they are.** This is the story's AC7 diagnosis — the old normaliser stored NULL for
`less_1`/`over_10` and collapsed `7_10`→`4-7` — **confirmed against real rows rather than inferred.**

### ✅ RUN, AND EVERY PREDICTED NUMBER MATCHED (2026-08-18, deploy `f6b449d`)

| bucket | predicted before the run | measured after |
|---|---|---|
| `over_10` | 29 (28 from NULL + 1 from `4-7`) | **29** |
| `4_6` | 50 | **50** |
| `1_3` | 48 | **48** |
| `7_10` | 25 | **25** |
| `less_1` | 9 | **9** |
| `(NULL)` | 74 | **74** |
| **old-canon values left** | 0 | **0** |
| business names written | 87 | **87** |

⚠️ **One label in the prediction was wrong and is corrected here.** Adjudication told the operator to
expect *"161 needing update"*; the tool reports **182**. 161 was the *experience* count — `rows needing
update` is the **union** of both fields: 161 + 87 − 66 overlapping = 182, leaving 21 rows that gain only
a business name and 53 genuinely untouched (182 + 53 = 235). Every measured quantity was right; the
name put on one of them was not. **182 is the number to compare against on any future run.**

⚠️ **And R5's blast radius, sized honestly rather than dramatically: ZERO rows.** Every prod row that
carries a stored value also carries a raw answer that maps cleanly under the new canon, so the
pre-fix code would have blanked **nothing** on today's data. The defect was real, was found by
execution rather than by reading, and is fixed — but it was never going to fire on this dataset. Said
plainly so the catch is not later retold as a near-miss disaster. It remains a live risk for any
FUTURE row whose answer does not normalise, which is exactly what the guard is for.

> **ID note:** ledger rows use the SAME numbers as the Review Follow-ups above. R12/R13/R15/R16 are
> follow-ups with no ongoing state (record drift, a stale comment, a rounding edge, a missing test
> guard) — fixed outright, so they carry no ledger row. R7–R11 and R14 do.

## Closing verdict — ADJUDICATION 2026-08-18

**Status stays `review`. The code is ACCEPTED; what remains is a deploy and an operator run.**
Per §2a0, `done` needs a real deploy SHA and no OPEN/DISCHARGE-ON-DEPLOY row. R1 (the new column)
and R2 (the backfill) are exactly that, and both are now unblocked rather than undecided.

**Rulings taken (Awwal, 2026-08-18):** R7 **PUBLISH** (8 of 235 — measured before the ruling, not
after) · R4 **bind the filter to the canon** (implemented + RED-verified here) · R10 **inversion
confirmed** · R1 **accepted**. R3 **closed by measurement**.

| Gate | Evidence — run by adjudication, not accepted from the dev or the reviewer |
|---|---|
| `tsc` | API **0**, web **0** |
| `eslint` (types + api + web) | **0 errors**; three API drift guards green at **384 files** |
| Touched API suites (4 files, incl. real-DB smoke) | **134 passed** |
| Touched web suites (9 files, incl. the new R4 guard) | **137 passed** |
| `@oslsr/types` via turbo | **113 passed / 7 files — re-run with `--force`**, because the first run was a `cache hit` replay and R14's whole claim is that these tests *execute* (Pitfall #47) |

### ⭐ RED-verify by adjudication — both independently reproduced

**R5 (the High).** Reverting the `SET` clause to `experience_level = ${nextExperience}` reds
**exactly one test** — `preserves a valid legacy experience_level through a business-name-only
update`, in the real-DB smoke — while the **mocked backfill suite stays 32/32 green**. That is the
sharper half of the dev's claim and it is correct: a mocked `db.execute` sees only SQL *text*, which
names the column either way, and is therefore structurally blind to this bug. The smoke is not
belt-and-braces here; it is the only thing that can see it.

**R4 (added here).** Emitting the label instead of the slug reds *"emits the stored SLUG, never the
human label"* and **only** that test — the options-list assertion passes either way. So the slug
assertion is the load-bearing one, and it is now pinned.

⚠️ **A hole found by making the change:** before this pass the ONLY assertion on the experience
filter was `toBeInTheDocument()`. Swapping an `<Input>` for a Radix `<Select>` broke **nothing** —
which is how it was discovered that the control had never been tested at all. Green after a
behaviour change usually means nothing was watching.

## Closing verdict — RE-REVIEW 2026-08-18

**Status stays `review`.** Per §2a0 this repo's `done` requires a real deploy SHA and every residual
resolved; R1, R2, R3, R4 and R7 are open, and R7 is a ruling only Awwal can give. The workflow's own
step 5 ("all High and Medium fixed → done") is explicitly overruled here.

**The fix pass was honest and its central claim was better than the first review's.** The dev
reproduced the High before fixing it, found it larger than reported, and was right: the `SET` clause
carried a second, independent path to the same data loss that the review's one-liner never touched.
I confirmed that by execution — the mocked suite stays fully green while the real-DB smoke reds on
exactly the one test. That is the correct instinct: *a review's "smallest correct fix" is a
hypothesis to test, not a patch to paste.*

**What the fix pass missed is what this codebase misses most often — a fix that never fires.** The
2026-08-18 round correctly reasoned that a business name the card leads with must be searchable, and
put it in the tsvector. But nothing in this repository applies that file: `db:custom` is in no
workflow and no deploy step, so the trigger was dead code in CI (where the trigger did not exist at
all) and frozen on prod at whatever a human last ran in March. The story's own AC8 search test reds
on a CI-fresh database — I reproduced that, then made it structural. The accompanying "full suite
green" was a locally-cached gate standing in for the real one (Pitfall #47). Its sibling: an empty
`profileIds` array silently swept the whole table, with a passing test that named the sweep as
desired.

**Both of those were found by diffing git against the record, not by reading the story** — the two
undeclared files were the thread that led to the CI break. The record had stopped on 2026-08-17
while the code moved on to 2026-08-18, complete with a dangling reference to an "R7" that existed
nowhere. That is this repo's [a record about the work is not the work] pattern, and it is now the
second time on this story that the *documentation* gap, not the code, hid the defect.

**All nine findings (R8–R16) are fixed and RED-verified.** One is a judgement call rather than a
defect fix and is Awwal's to reverse: `profileIds: []` now means "nothing", overturning a
deliberate prior choice that made it mean "everything" (R10).

**Before `--apply` runs on prod, three things must be true:** the trigger carries `business_name`
(R9's query), R7 (self-named signboards) has a ruling, and R1's `db:push` has landed. The first is
now structural; the second is a decision, not a task.

---

## Closing verdict — FIRST PASS (2026-08-17, superseded above)

**Changes Requested.** AC5, AC7 and AC8 are well-implemented, honestly reasoned (the two AC-vs-reality escalations were correctly judged against the questionnaire schema), and the dev's verification claims all reproduced under independent re-execution — tsc, lint, and every stated test count. The AC8.2 no-personal-name guarantee is genuinely structural, not just tested.

However, the backfill this story ships — and which R2 explicitly instructs an operator to run live on prod — contains a confirmed data-loss defect (Finding 1): it can silently overwrite a currently-valid `experience_level` with `NULL` for any respondent whose raw answer used a label the old canon accepted and the new one doesn't. This is a regression the backfill would introduce, not one it fixes, and it would land on real respondent rows the moment R2 is executed. **Status stays `review`, not `done`** — per this repo's standing rule, `done` requires a real deploy SHA and every residual resolved, and R2 must not proceed until Finding 1 (Review Follow-up #1) is fixed and RED-verified. The fix is a one-line guard mirroring the pattern already used two lines below it in the same file.

### Dev response (2026-08-17/18)

**Changes Requested accepted. All three findings resolved; nothing was waved off.**

The High was reproduced BEFORE it was fixed (4 new mocked cases red), and it turned out **larger
than the review found**. The review's smallest-fix one-liner guards `experienceDiffers`, which
decides *whether* a row is written — but the `UPDATE` statement still carried
`experience_level = ${nextExperience}` unconditionally, so a row updated for its **business_name
alone** still blanked its experience. With only the review's fix applied, 3 of my 4 cases passed
and the 4th still failed. Both halves are now guarded, and the second half is asserted
**end-to-end in the real-DB smoke** — a mocked `db.execute` can only see the SQL text, which names
the column either way, never the value bound to it. Reverting the SET clause reds that smoke test
and nothing else, which is the proof it is load-bearing.

The Medium's *justification* was indeed false (`ProfileEditPayload` has no business-name edit path,
so "a later self-service edit" was fiction). The asymmetry itself is KEPT, now for the real reason
and documented at both sites: the live worker sees a whole submission, so a resubmission dropping
`business_name` legitimately retracts it; the backfill reads only the LATEST submission, so a null
there means "this one has none", not "the person retracted it".

**Re-verification after the fix:** API `tsc` clean · API lint clean (all three drift guards green) ·
backfill unit tests **14/14** · real-DB smoke **6/6** · full API package **275 files / 3838 tests
passed, 2 skipped**, with ONE failure that is environmental, not a defect:
`off-hours.heuristic.test.ts` reported `Test timed out in 15000ms` with a wall duration of
**30,308,673 ms (~8.4 h)** — the machine suspended mid-run — and the same run logged
`Failed to start forks worker … Timeout waiting for worker to respond` for a sibling file. That
test's input is a hardcoded timestamp, so it cannot be clock-sensitive, and it passes **13/13** in
isolation. Pitfall #37 class, untouched by this diff. Web was not re-run: this fix pass changed
only `apps/api` files.


## Change Log

| Date | Change | Rationale |
|------|--------|-----------|
| 2026-08-18 | **RE-REVIEW of the fix pass (reviewer: Awwal via code-review workflow). Status stays `review`. 9 findings, all fixed + RED-verified.** Independently confirmed the dev's central claim by execution: removing the `experienceDiffers` null-guard reds 4 mocked tests; reverting the `SET` clause leaves the mocked suite 21/21 green while reding exactly 1 real-DB smoke — so the dev was right that the first review's one-liner was necessary but not sufficient. **Two High found, both by diffing git against the record rather than reading the story.** (R8) The 2026-08-18 round put `business_name` into the FTS trigger, but `db:custom` is in NO workflow and NO deploy step — reproducing a CI-fresh DB reds this story's own AC8 search test, and prod's trigger was frozen at whatever was last applied by hand in Story 7-1. Fixed with `scripts/migrate-custom-sql-init.ts`, auto-discovered by `db-push-full.ts` and added to the prod deploy chain. (R9) Trigger-vs-backfill ordering was unstated and the backfill's idempotency made a stale vector permanent; now structural + a documented recovery step. Medium: (R10) `profileIds: []` swept the whole table — proven by execution, fixed, and it **overturns a deliberate prior choice** Awwal may reverse; (R11) the LIVE upsert could still blank a valid bucket, and this story widened which answers reach null; (R12) the record was a full round behind the code — stale counts (14/14 → 21, 6/6 → 9), two undeclared files, and a dangling "R7"; (R13) the false "self-service edit" justification survived in the `--help` text and a test comment. Low: (R14) the shared canon had zero direct tests and `packages/types` ran none of its 99 — both fixed; (R15) a bare year count rounded UP across bucket gaps (3.5 → "4–6 yrs"); (R16) no exhaustiveness guard on the sector→glyph map. Verified: API + web `tsc` clean, lint 0 errors (3 drift guards green), API marketplace 134, `@oslsr/types` 113 (7 files, previously zero ran), web marketplace + TradeAvatar 133. | A repair tool that never reaches the database it repairs is the same defect class as one that deletes good rows — and this time the missing piece was in the deploy pipeline, not the logic. The record stopping a day before the code did is what hid it. |
| 2026-08-17 | **Review follow-ups resolved (dev: Amelia). High finding was bigger than reported.** The review's one-line null-guard on `experienceDiffers` is necessary but NOT sufficient — the `UPDATE … SET` clause wrote `experience_level = ${nextExperience}` unconditionally, so a row updated for its business_name alone still blanked a valid legacy bucket. Reproduced first (4 mocked cases red), fixed BOTH halves, and added a real-DB end-to-end assertion because a mocked `db.execute` cannot see a bound value. Medium: the asymmetry is kept deliberately, its false "self-service edit" justification removed and the real reason documented at both sites. Low: `formatSummary()` now names the direction (`set/fixed … never blanked`). R5 + R6 CLOSED; R2 UNBLOCKED. Re-verified: API tsc + lint clean, backfill 14/14, real-DB smoke 6/6, full API package 275 files / 3838 tests passed (1 environmental timeout — machine suspended mid-run, 8.4h wall duration, passes 13/13 in isolation). | A repair tool that deletes good rows is worse than one that never runs; and a review's "smallest correct fix" is a hypothesis to test, not a patch to paste. |
| 2026-08-17 | **Adversarial code review completed (reviewer: Awwal via code-review workflow). Status stays `review`.** Re-ran tsc (web+api clean), lint (3 packages clean, 2 pre-existing warnings), and all targeted tests claimed by the dev (109 API + 5 real-DB smoke + 85 web) — all matched exactly. Independently RED-verified the dry-run guard and the mocked-vs-real-DB-SQL-blindness claims — both reproduced. Found ONE new High defect the dev's own RED-verify table did not cover: the backfill's `experienceDiffers` predicate has no null-guard (unlike `businessNameDiffers`), so `--apply` can blank an already-valid legacy `experience_level` to NULL for respondents whose raw answer used an old-canon-only label (`senior`/`expert`/etc.) — confirmed by execution, not just review. R2 (the live backfill run) is now blocked on this fix. One Medium (business_name retraction handled inconsistently between the live worker and the backfill) and one Low (runbook doesn't distinguish improved vs. blanked rows in the summary) also recorded. See Senior Developer Review (AI), Residuals ledger, and Closing verdict above. | Verify, don't accept — per this repo's standing review discipline; found the exact "guard that never fires / predicate that doesn't match the sentence above it" class this codebase has shipped before. |
| 2026-07-19 | Story drafted by Bob (SM) via *create-story, emergent from Awwal's 2026-07-19 13-2 verification-reframe ruling. Renders the two-tier marketplace trust badge: tier-1 "[Association] — confirmed member" (source=imported_association), tier-2 "Member-verified" (member-side check). Honest-naming discipline (R1): never a bare "Verified" for imports. RENDER only — 13-2 owns the WRITE (source + association name + member-confirmed flag). UX: Sally; copy: Paige. POST-LAUNCH, NON-GATING; visible behaviour sequences after 13-2. Status → ready-for-dev. | Awwal's ruling: turn accountable-source provenance into an honest, marketable trust signal instead of hiding association members. |
| 2026-07-19 | **Scope expanded (Awwal): full marketplace CARD REDESIGN, not just the badge.** AC5 now has Sally redesign the bland `WorkerCard` (currently profession/LGA/experience/bio/chips/text-CTA — no warmth or person) into an inviting card, integrating the association badge coherently alongside the existing `GovernmentVerifiedBadge`. Title updated. Sally to do a design pass. | Awwal: "the current card is too bland and not inviting." |
| 2026-08-17 | **AC5 + AC7 + AC8 IMPLEMENTED (dev: Amelia). Status → review.** AC5: shared `TradeAvatar` (sector glyph via the canonical `skillSectorForSlug`, tile colour hashed from the profile id) + `WorkerCard` rebuilt to Sally's spec (identity line, LGA, one top-right pill, hero stat, chips, clamped bio, filled "View profile & contact →" CTA); `GovernmentVerifiedBadge` gained a size-only `compact`. AC7: **two AC-vs-reality conflicts adjudicated by Awwal before any code** — (a) "≥20 years ★" is unimplementable because `years_experience` is a `select_one` topping out at "Over 10 years" (`docs/questionnaire_schema.md:51,134-141`), so the stat shows the BUCKET and ★ re-anchors to the TOP bucket; and the pre-13-38 normaliser was found storing **NULL for `less_1`/`over_10`** and collapsing **`7_10`→`4-7`**, now fixed against a shared canon in `packages/types`. AC8: (b) business name needed DB+worker+API, not "web only" — full thread-through approved: new `marketplace_profiles.business_name`, worker extraction (trim + 80 cap, ONE source key, no person-name fallback), additive read, card identity line, plus a PREVIEW-by-default backfill for the pre-existing rows. Tasks 1–3 (the badge half) marked MOVED → 13-58. Every load-bearing change RED-verified (7 breakages, Debug Log table); a real-DB smoke added because the mocked tests cannot see the raw SQL — it immediately caught `42703 column r.adopted_draft_answers does not exist`. Full suite green. **NOT visibly done until residuals R1 (db:push the new column) + R2 (run the backfill) execute on prod.** | Awwal's rulings 2026-08-17; the story's own AC7/AC8 could not be built as written, and a card-only AC8 would have rendered for nobody. |
| 2026-07-19 | **Sally design pass delivered + v2 (Awwal: "do everything").** Interactive mockup published (before/after, all trust states, light+dark). Locked decisions recorded (no name/scraper→login-gate, no photos + 9-12 magic-link future path VERIFIED, trade-glyph avatar, two-slot trust model, tooltip truncation, CTA copy). v2 added: **experience as a hero stat** (★ seasoned ≥20yr), **sparse-profile graceful degradation** (new AC7), and **TradeAvatar/TrustBadge as SHARED components** (consistent across card/profile/registry). Mockup: https://claude.ai/code/artifact/f354d58d-f969-41d6-95e9-770539cb1ebc | Design the beauty, prove the edge cases, build identity UI once. |

# Story 13-38: Marketplace card redesign + "[Association] — confirmed member" badge (two-tier trust provenance)

Status: ready-for-dev

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

## Tasks / Subtasks

- [ ] **Task 1 — Data contract with 13-2** (AC: #1, #2, #4)
  - [ ] Confirm the marketplace card/query exposes, per respondent: `source`, the **association name** (13-2 persists it — on `import_batches`/`respondents.metadata`; coordinate the exact field), and the **member-confirmed** verification signal. If any is not yet available, define the contract + a graceful fallback and record the dependency (do NOT re-derive verification badge-locally).
- [ ] **Task 2 — Badge component + tiering** (AC: #1, #2, #3, #4)
  - [ ] Add/extend a marketplace badge to render tier-1 "[Association] — confirmed member" / tier-2 "Member-verified", scoped to association sources, with the name-missing fallback and the disclosure tooltip/`aria-label`. Reuse the existing badge primitive (mirror `VerificationStatusBadge`-style pill).
- [ ] **Task 3 — Design pass (Sally) + copy (Paige)** (AC: #3, #5)
  - [ ] Sally: card placement, two-tier visual distinction (colour-blind-safe), density legibility. Paige: the badge label + tooltip copy (honest, non-overstating).
- [ ] **Task 4 — Tests + validate** (AC: #6)
  - [ ] Component tests for all AC6 cases; web `tsc`/lint; targeted marketplace suite; no regression.

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

### Debug Log References

### Completion Notes List

### File List

### Review Follow-ups (AI)

## Change Log

| Date | Change | Rationale |
|------|--------|-----------|
| 2026-07-19 | Story drafted by Bob (SM) via *create-story, emergent from Awwal's 2026-07-19 13-2 verification-reframe ruling. Renders the two-tier marketplace trust badge: tier-1 "[Association] — confirmed member" (source=imported_association), tier-2 "Member-verified" (member-side check). Honest-naming discipline (R1): never a bare "Verified" for imports. RENDER only — 13-2 owns the WRITE (source + association name + member-confirmed flag). UX: Sally; copy: Paige. POST-LAUNCH, NON-GATING; visible behaviour sequences after 13-2. Status → ready-for-dev. | Awwal's ruling: turn accountable-source provenance into an honest, marketable trust signal instead of hiding association members. |
| 2026-07-19 | **Scope expanded (Awwal): full marketplace CARD REDESIGN, not just the badge.** AC5 now has Sally redesign the bland `WorkerCard` (currently profession/LGA/experience/bio/chips/text-CTA — no warmth or person) into an inviting card, integrating the association badge coherently alongside the existing `GovernmentVerifiedBadge`. Title updated. Sally to do a design pass. | Awwal: "the current card is too bland and not inviting." |
| 2026-07-19 | **Sally design pass delivered + v2 (Awwal: "do everything").** Interactive mockup published (before/after, all trust states, light+dark). Locked decisions recorded (no name/scraper→login-gate, no photos + 9-12 magic-link future path VERIFIED, trade-glyph avatar, two-slot trust model, tooltip truncation, CTA copy). v2 added: **experience as a hero stat** (★ seasoned ≥20yr), **sparse-profile graceful degradation** (new AC7), and **TradeAvatar/TrustBadge as SHARED components** (consistent across card/profile/registry). Mockup: https://claude.ai/code/artifact/f354d58d-f969-41d6-95e9-770539cb1ebc | Design the beauty, prove the edge cases, build identity UI once. |

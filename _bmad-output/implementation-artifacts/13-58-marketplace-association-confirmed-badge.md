# Story 13.58: "[Association] — confirmed member" badge (two-tier trust provenance)

Status: backlog

<!-- CARVED OUT of 13-38 on 2026-08-09 at adjudication. 13-38 bundled a card REDESIGN (shippable
now, 224 live cards) with an association BADGE that renders for nobody, because `imported_association`
has ZERO rows on prod and its producer, Story 13-2, is still `ready-for-dev`. Splitting releases the
redesign. 13-38 KEEPS the redesign — the design file is `docs/design/marketplace-card-13-38.html` and
a mockup named after a story that no longer owns it is the record-vs-artifact drift of §2w. -->

## Story

As **an employer browsing the skills marketplace**,
I want **to see when a worker was confirmed as a member by a named trade association**,
so that **I can trust an association-vouched worker — and the platform discloses precisely what it
knows instead of overstating "verified" or hiding accountable members entirely.**

## Context

Awwal's 2026-07-19 ruling (13-2 DECISION block): association imports arrive through an accountable
source — a named head, mandatory phone, usually a NIN — so they belong in the marketplace **with a
disclosure badge**, not excluded behind a blunt `unverified_import` gate.

**Two tiers**, mapping to Axis-3 of the registry data-status taxonomy:
- **Tier 1 — association-confirmed** (`source = imported_association`, not yet member-confirmed):
  **"[Association] — confirmed member"**
- **Tier 2 — member-verified** (a member-side check fired — SMS reply once Termii clears, or a
  sampled Assessor callback): **"Member-verified"**

⚠️ **HONESTY DISCIPLINE (R1 — LOCKED).** There is **no NIMC/identity-validation path**. A present NIN
is `nin_on_file`, and for imports it was **proxy-transcribed by the head**. The badge must NEVER read
a bare "✓ Verified" implying government-grade proofing — overstating burns the association's
credibility along with ours. Attributing the claim to a named body is both honest and a *stronger*
signal.

## ⛔ Gate — do not start this before 13-2

Measured 2026-08-09 on prod: `SELECT source, count(*) FROM respondents` returns **`public 314`,
`enumerator 1`** and nothing else. **`imported_association` does not exist yet.** 13-2 owns the WRITE
side (`source`, the association name, the member-confirmed flag) and is `ready-for-dev`.

Built before 13-2, every AC here renders for **zero people** and cannot be verified against real data.
That is not a scheduling preference — it is the difference between a testable story and a hopeful one.

## Acceptance Criteria

1. **AC1 — Tier-1 badge.** A card whose respondent is `source = imported_association` and not yet
   member-confirmed renders **"[Association] — confirmed member"** using the stored association name
   (e.g. "ASNAT Tiller Association — confirmed member"). Name unavailable → degrade to **"Trade
   association — confirmed member"**. Never blank, never a bare "Verified".
2. **AC2 — Tier-2 upgrade.** On member-side confirmation the card renders **"Member-verified"**. The
   tier derives from the taxonomy's verification substrate — **not** a badge-local re-derivation.
3. **AC3 — Honest disclosure.** No surface reads a bare "✓ Verified" for an association import. A
   tooltip / `aria-label` states the meaning: *"Confirmed as a member by [Association]. Identity not
   independently verified."* Copy owned by Paige.
4. **AC4 — Scoped to association provenance.** Renders ONLY for association sources — never for
   `public` / `enumerator` / `clerk` / `imported_other`. **RED-verify:** a `public` respondent must
   render no badge; assert it, because "no badge appears" is the outcome a broken conditional also
   produces.
5. **AC5 — Coexists with the existing badges.** Slots into the trust hierarchy 13-38 establishes
   (`GovernmentVerifiedBadge` vs association-confirmed vs member-verified) without clutter.
   Colour-blind-safe, legible at grid density.
6. **AC6 — Tests.** Tier-1 with name; name-missing fallback; tier-2 on confirmation; **no badge for
   non-association sources**; tooltip/aria present; never emits bare "Verified" for an import.

## Dependencies

- **HARD: Story 13-2** — persists `source = imported_association`, the association/guild name, and the
  member-confirmed flag. Confirm the exact field locations with 13-2 before building; do not
  re-derive verification badge-locally.
- **SOFT: Story 13-38** — the card redesign and the shared `TrustBadge` primitive this reuses. If
  13-38 lands first (it should — it is unblocked), this is a slot-in.

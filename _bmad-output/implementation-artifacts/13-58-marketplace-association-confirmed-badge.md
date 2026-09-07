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

## ⛔ Gate — do not start this before 13-2 **and 13-67**

Measured 2026-08-09 on prod: `SELECT source, count(*) FROM respondents` returns **`public 314`,
`enumerator 1`** and nothing else. **`imported_association` does not exist yet.** 13-2 owns the WRITE
side (`source`, the association name, the member-confirmed flag) and is `ready-for-dev`.

Built before 13-2, every AC here renders for **zero people** and cannot be verified against real data.
That is not a scheduling preference — it is the difference between a testable story and a hopeful one.

> ### 📌 UPDATE 2026-09-06 — where the name actually lives (re-pointed by 13-67's code review)
>
> The paragraph above is now **stale in two ways**, and both would send a dev to the wrong place:
>
> 1. **13-2 does NOT own the association name.** 13-2 shipped the channel and is live on prod
>    (8,278 rows). The stored name is **Story 13-67**'s, and it is:
>    - `respondents.metadata.association_name` — **the read path for AC1**. Exposed by
>      `registry_unified` as part of `metadata` (`registry-unified.sql.ts:123` is `r.metadata`), so
>      the badge needs **no join and no view change**; `import_batch_id` is deliberately NOT exposed.
>    - `import_batches.association_name` — the operator-facing source of truth, returned by
>      `GET /api/v1/admin/imports` and `GET /:id`. **Do not read this one for the badge.**
>    - Values on prod after the backfill: **ASNAT** (batch `01a071c8…`, 56) and **AFAN**
>      (`01a072ae…`, 8,222). ⚠️ The backfill is an operator one-shot and, as of 2026-09-06, **has
>      not been run** — see `docs/runbooks/backfill-operator-residuals.md` §A. Until it runs, the
>      key is absent on every live row and AC1's degrade path is all you will see.
>    - **Absence is meaningful**: no key ⇒ render AC1's *"Trade association — confirmed member"*.
>      NEVER fall back to `import_batches.source_description` — it is an operator note that reads
>      *"ASNAT Tiler Association (Oyo State) - WhatsApp intake, 56 clean rows of 70…"*.
> 2. **There is no member-confirmed flag anywhere.** No column, no SMS confirmation loop (Termii is
>    not cleared), no Assessor callback queue. **AC2's tier-2 has no substrate** and 13-67 put
>    building one explicitly out of scope. Do not derive it in the badge; a tier that cannot be
>    earned is a badge that never changes. Either carve the substrate as its own story first, or
>    ship AC1/AC3/AC4/AC5 and leave AC2 open.
>
> Ordering is unchanged and still binding: **13-67 → this story → open `PIPELINE_EXCLUDED_STATUSES`**
> (13-2 R-A2). Reversed, 8,278 people appear on marketplace cards as ordinary verified listings.
>
> ### ⛔ AC4 CONFLICTS WITH AWWAL'S RULING OF 2026-09-07 — read before implementing AC4
>
> AC4 as written says the badge renders **"ONLY for association sources — never for `public` /
> `enumerator` / `clerk` / `imported_other`"**. On 2026-09-07 Awwal ruled that the association's
> vouch **also attaches to the 12 people the AFAN import MATCHED** rather than inserted — people who
> had already registered themselves and whose `source` is therefore **`public`**, not
> `imported_association`. 13-67 R2 has written `metadata.association_name` (plus
> `association_vouched_by_batch_id`) onto exactly those rows.
>
> **So a source-keyed condition renders nothing for them, and the ruling is silently unimplemented**
> — this project's most-repeated defect, a fix that never fires.
>
> The condition AC4 needs is **the presence of the stored name**, not the source:
>
> ```ts
> // right: the badge asserts a NAMED BODY vouched. The name IS the precondition.
> const association = respondent.metadata?.association_name;   // via registry_unified.metadata
> if (association) renderTier1(association);
> ```
>
> AC4's RED-verify still holds and gets STRONGER: a `public` respondent **with no
> `association_name`** must render no badge — which is every public respondent except these 12.
> Assert it on a `public` row that HAS the key too, or the test passes over the ruling.
>
> ⚠️ This is a real AC change and it is **Awwal's to confirm at build time**, not the badge dev's to
> assume. Flagged here rather than edited into AC4 silently.

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
4. **AC4 — Scoped to association provenance.** ⚠️ **CORRECTED AT ADJUDICATION 2026-09-07 (R3).**

   ~~Renders ONLY for association sources — never for `public` / `enumerator` / `clerk` /
   `imported_other`.~~

   **Render on the PRESENCE of `metadata.association_name`, NOT on `source`.** A card shows the
   badge when its respondent carries a non-empty `metadata.association_name`, and shows nothing
   when it does not — whatever the `source` says.

   **Why the original wording had to change.** Awwal ruled on 2026-09-07 that the vouch also
   attaches to the **12 people the AFAN import MATCHED** rather than inserted. Those people had
   already registered themselves, so their `source` is **`public`** — and 13-67 has written
   `metadata.association_name` onto them. Keyed on `source`, this AC would render those twelve
   nothing, and the ruling would become **a fix that never fires**: the most-repeated defect class
   in this project. → [[pattern-ship-a-fix-that-never-fires]]

   ⭐ **The intent of AC4 is unchanged and is fully preserved: never badge anyone no association
   vouched for.** What changed is the mechanism. `source` was only ever a PROXY for "an association
   vouched"; `metadata.association_name` **IS** the claim the badge makes. A proxy fails in both
   directions, and this one failed in the direction that silently drops real people.
   → [[pattern-predicate-must-be-the-thing-you-mean]]

   **RED-verify, both directions — "no badge appears" is also what a broken conditional produces:**
   - a `public` respondent with **no** `association_name` renders **no** badge; and
   - a `public` respondent **with** `association_name` (one of the 12) renders the badge **with the
     correct body's name**. Assert the second explicitly. It is the case the original AC excluded,
     and a source-keyed implementation passes the first test while failing the people this ruling
     was made for.

   ⚠️ Do NOT also add a `source` check "for safety". It re-introduces exactly the bug, and a card
   that requires both conditions is indistinguishable from a correct one until you look for the
   twelve who are missing.
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

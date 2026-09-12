# Story 13.40: Assessor "Verify Imported Rows" Queue (human fallback for member-side confirmation)

Status: backlog

> 🌱 **Backlog shell** — spun up 2026-07-20 (John PM) from the email-channel planning thread. Not dev-ready.

> ### 📥 INHERITED 2026-09-12 — Story 13-58's **AC2** now lives here, and the RENDER HALF IS ALREADY BUILT
>
> 13-58 shipped the tier-1 association badge to prod (`590cdbc`). Its **AC2 — "on member-side
> confirmation the card renders *Member-verified*"** was descoped at adjudication and handed to this
> story, because an unbuilt AC left inside a `done` story makes the record claim something the
> artefact does not support — and the AC wins, because the AC is the checkable artefact.
>
> **What that buys whoever picks this up: the display half is done.** You are not building a badge.
> - `apps/web/src/features/marketplace/components/AssociationConfirmedBadge.tsx` renders tier-1
>   today, keyed on the PRESENCE of `marketplace_profiles.association_name`.
> - The card and profile page already position the trust slot for a second pill (AC5).
> - `packages/types` carries `associationName` on both response types; the extraction worker and the
>   card-fields backfill both write the column.
>
> **What is genuinely missing is the SUBSTRATE — one marker, three possible writers:**
> | needed | owner | state |
> |---|---|---|
> | a `member_confirmed` marker on the taxonomy substrate (12-4-aligned) | **this story** | not built |
> | SMS confirmation loop | 13-2 | ⛔ blocked on **Termii not cleared** |
> | Assessor callback queue | **this story** | the shell above |
>
> ⛔ **DO NOT derive tier-2 in the badge.** 13-58's AC2 was explicit that the tier comes from the
> taxonomy's verification substrate, never a badge-local re-derivation — otherwise the card decides
> for itself that someone is verified.
>
> ⛔ **DO NOT ship "Member-verified" copy before the marker exists.** `WorkerCard.test.tsx` asserts
> that string NEVER renders, and that guard is deliberate: **a tier that cannot be earned is a badge
> that never changes.** Expect to delete that assertion as part of this story — it is the tripwire
> telling you the substrate landed.
>
> ⚠️ **And the honesty lock (R1) travels with it.** There is no NIMC path; NIN validation is
> FORMAT-ONLY, and for an association import the NIN was proxy-transcribed by the head. "Member-verified"
> must mean *the member themselves answered*, and must never read as identity proofing. The canonical
> wording lives in `apps/web/src/lib/trust-claims.ts` and is enforced app-wide by
> `trust-claims.app-wide.test.ts` — write new copy against those constants, not from scratch.

## Why
The taxonomy (loophole-blocks table + R5) and 13-2 (AC5.4/5.5) already **specify** an Assessor "verify imported rows" queue: it is the **human fallback** for the member-side check that promotes `unverified_import` → `nin_verified`, used when the automated channels (SMS via Termii 13-2, **email via 13-39**) get low response — the anti-roll-padding backstop (a sampled callback confirms a ghost list can't confirm itself). It is specified but has **no story of its own**. This story builds it.

## Sketch (to be fully specced at *create-story time)
- An Assessor-dashboard queue of `imported_unverified` rows (sampled per batch, or all), surfaced ONLY to the Assessor role (imports don't enter the fraud queue by construction — this is a distinct, purpose-built queue).
- A **callback outcome** action per row: confirmed (promote tier-1→tier-2 via the 12-4-aligned marker) / could-not-reach / invalid — audited.
- Batch-level sampling config (verify N per batch before the batch's rows count as verified) — the taxonomy's "sampled Assessor callback."
- Reconciles with the declared-vs-imported-vs-skipped counts (13-2 AC5.2) so a padded batch is visible.

## Dependencies / cross-refs
- **HARD:** 11-2 (imported rows), taxonomy Axis-3 marker (R1/R5), 13-2 (association imports + the queue gesture).
- Coordinates with: 13-39 (email confirmation — this is the human fallback when email response is low), 12-4 (verification derivation), Assessor dashboard (Epic 4 role surfaces).

## Change Log
| Date | Change |
|------|--------|
| 2026-09-12 | **INHERITED 13-58's AC2** (tier-2 "Member-verified") at adjudication — descoped from a story that shipped tier-1, because an unbuilt AC cannot sit inside a `done` story. **No new story was carved: this one already specified "promote tier-1→tier-2".** The render half is already live on prod; what is missing is the member_confirmed marker + a writer for it. The `WorkerCard` guard asserting "Member-verified" never renders is the tripwire that says the substrate landed. |
| 2026-07-20 | Backlog shell created (John PM) from the email-channel ingest thread. Epic 13. Implements the taxonomy-specified Assessor verify-imported-rows queue (the human member-side-check fallback). |

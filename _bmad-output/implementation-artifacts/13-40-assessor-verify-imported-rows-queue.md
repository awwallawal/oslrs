# Story 13.40: Assessor "Verify Imported Rows" Queue (human fallback for member-side confirmation)

Status: backlog

> 🌱 **Backlog shell** — spun up 2026-07-20 (John PM) from the email-channel planning thread. Not dev-ready.

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
| 2026-07-20 | Backlog shell created (John PM) from the email-channel ingest thread. Epic 13. Implements the taxonomy-specified Assessor verify-imported-rows queue (the human member-side-check fallback). |

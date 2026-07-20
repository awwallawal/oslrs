# Story 13.39: Email Import-Verification Loop (tier-1 → tier-2) & Cohort-D Confirm-First Send

Status: backlog

> ✂️ **Carved from Story 11-5 (Awwal-ratified split 2026-07-20)** — the CONTACT/VERIFY half. 11-5 does the ingest (first-class `respondents.email`, reachability required-fields, `shared_email`-safe dedup); this story turns those tier-1 `imported_unverified` rows into contacted + confirmed (tier-2) people, and folds the ITF cohort into the launch campaign.
>
> 📎 **Requirements brief:** [`docs/launch-campaign/itf-email-channel-ingest-brief.md`](../../docs/launch-campaign/itf-email-channel-ingest-brief.md) (§2.4, §3.2–3.4, §4, §5, §6).
>
> ⛔ **BLOCKED-ON (why `backlog`, not ready-for-dev):**
> 1. **Story 11-5** (email column + tier-1 rows) — HARD; nothing to verify until it lands.
> 2. **13-2 / registry-data-status-taxonomy Axis-3 marker** — the tier-1→tier-2 verification marker MUST come from the taxonomy, not be invented here. Align, don't fork.
> 3. **DPIA Appendix-H update** (imported-then-emailed pattern) + confirm-first copy sign-off — gates the SEND go-live. **✅ DRAFTED 2026-07-20 (Iris):** `docs/legal/dpia-appendix-h-multichannel-collection-v1.md` (§H-MC, Channel B) + sign-off tracker `docs/legal/dpia-multichannel-signoff-v1.md`. Remaining = Ministry ratification + NDPC filing (see tracker).
> 4. **Resend Pro deliverability warm-up** posture for a ~3,600-address cohort.

> 🎯 **WHY:** the ITF-SUPA cohort (~3,600 email-reachable, government-accountable artisans) is ingested by 11-5 as honest tier-1 `imported_unverified`. To make them *count as verified people* + *marketplace-visible* + *campaign-reachable*, each must confirm their own record. Moving that check from **SMS (Termii sender-ID — long-lead launch gate)** to **email (Resend + 9-12 magic-links — already live)** removes the dependency for this cohort AND turns the confirmation into a **double-opt-in** that makes contacting a public register NDPA-defensible.

<!-- Authored 2026-07-20 by Bob (SM) / John (PM) via the 11-5 split. Epic 13 (launch campaign). -->

## Story

As the **Ministry launch operator holding ~3,600 tier-1 `imported_unverified` ITF artisans (email, no phone)**,
I want **an operator-gated, warmed, confirm-first magic-link email that lets each artisan confirm/claim their record (promoting tier-1 → tier-2 Member-verified) and correct their name/trade/LGA, with bounce handling and Cohort-D sequencing**,
so that **the ITF cohort becomes verified, marketplace-visible, campaign-reachable people via a double-opt-in that is NDPA-defensible and does not depend on Termii SMS — and ghost/dead addresses simply never confirm.**

## Acceptance Criteria

### AC1 — Email verification loop (tier-1 → tier-2)
1. An operator-gated action issues **magic-link confirmation emails** (reuse 9-12 `MagicLinkService` + the live email stack) to the `imported_unverified` email rows of a chosen batch. NOT auto-fired on import (sends are batched/warmed — AC3 — and DPIA-gated — AC5).
2. Clicking the link **promotes** the respondent tier-1 (source-attested) → **tier-2 Member-verified**, using the verification marker defined by the **13-2 / taxonomy Axis-3** ruling (align, do NOT invent a parallel model). Non-responders remain tier-1/unverified (anti-roll-padding preserved).
3. The confirmation flow **doubles as a data-cleaning loop**: on claim, the person can confirm/correct **name, trade, LGA** (mitigates the ITF PDF's ADM↔NAME column-merge imperfection). Corrections update the respondent; provenance retained.

### AC2 — Confirm-first = double opt-in
1. The confirmation email is a **one-time transparency + "claim your profile" notice** (lawful basis: public task / legitimate interest, with one-click opt-out) — it is **NOT marketing**.
2. Marketing/evergreen (13-11/13-12) may target the respondent **only after** confirmation (consent). Enforce a **confirmed-only predicate** on the marketing/evergreen send paths so an unconfirmed imported row can never receive a marketing blast.

### AC3 — Deliverability, bounce, typo
1. Sends are **batched/throttled + warmed** via the 13-9 email budget/queue — never a single ~3,600 blast; bounce rate monitored.
2. A **hard bounce** → mark that respondent's email invalid (metadata), keep tier-1/unverified, flag for phone follow-up (usable if ITF later supplies numbers). Reuse the 13-9 bounce/`email-suppressions` inlets; suppression honored.
3. `normaliseEmail` `suspected_typo` + 11-5 `shared_email` flags are surfaced pre-send so the operator can hold/repair suspect rows.

### AC4 — Cohort-D sequencing
1. The ITF cohort is **Cohort D (~3,600)**, a **confirm-first track SEPARATE from and AFTER the warm A/B/C blasts settle** — never interleaved (anti-whiplash, coordinate with 13-24).

### AC5 — Lawful basis / DPIA (send-gate)
1. The send records its lawful basis + a **DPIA Appendix-H reference** (imported-then-emailed pattern: transparency notice + opt-out + post-confirmation-only marketing). This gates the send go-live; confirm the evidence form + copy with the DPIA owner.

### AC6 — Tests
1. Integration (real DB): issuance to tier-1 email rows; magic-link click promotes tier-1→tier-2 + applies name/trade/LGA corrections; bounce → invalid+unverified; marketing predicate excludes unconfirmed.
2. Full `pnpm test` green; tsc + lint clean.

## Tasks / Subtasks

- [ ] **Task 1 — Verification loop (AC1)** — operator-gated magic-link issuance to a batch's tier-1 email rows; confirmation endpoint promotes tier-1→tier-2 (taxonomy marker) + name/trade/LGA self-correction.
- [ ] **Task 2 — Confirm-first / double-opt-in (AC2)** — confirmed-only predicate on 13-11/13-12 marketing/evergreen sends.
- [ ] **Task 3 — Deliverability + bounce + typo (AC3)** — batch/throttle/warm via 13-9; hard-bounce → invalid+phone-follow-up; honor suppression.
- [ ] **Task 4 — Cohort-D sequencing (AC4)** — coordinate with 13-24.
- [ ] **Task 5 — DPIA / lawful basis (AC5)** — record DPIA ref on the send action; DPIA-owner sign-off on copy.
- [ ] **Task 6 — Tests (AC6)**; sprint status + code review.

## Dev Notes

### Reuse (do not rebuild)
- **Magic-links:** `apps/api/src/db/schema/magic-link-tokens.ts` + `MagicLinkService` (Story 9-12).
- **Email stack:** 13-9 `email-events`/`email-suppressions` + budget/queue; 13-11/13-12 send predicates (add confirmed-only gate); 13-13 unsubscribe.
- **Tier rows:** `respondents.email` + tier-1 `imported_unverified` rows come from **Story 11-5**.
- **Verification marker:** from the **13-2 / registry-data-status-taxonomy Axis-3** ruling.

### Dependencies
- **HARD:** 11-5 (email column + tier-1 rows), 9-12 (magic-links), 13-9 (email stack), 13-2/taxonomy (Axis-3 marker).
- **Coordinates with:** 13-24 (Cohort-D sequencing), 13-38 (marketplace badge tiers), 13-33 (registry_unified read).
- **External send-gate:** DPIA Appendix-H + copy sign-off; Resend Pro warm-up.

### Scope OUT
- The ingest itself (Story 11-5). SMS/Termii verification (separate). Marketplace badge rendering (13-38).

### References
- [Source: docs/launch-campaign/itf-email-channel-ingest-brief.md] §2.4, §3.2–3.4, §4–6
- [Source: _bmad-output/implementation-artifacts/11-5-email-channel-ingest-respondent-email-and-verification.md]
- [Source: _bmad-output/implementation-artifacts/13-2-association-group-channel-and-import.md] — tier-1/tier-2 model to align with
- [Source: _bmad-output/planning-artifacts/registry-data-status-taxonomy.md] — Axis-3 verification

## Change Log

| Date | Change |
|------|--------|
| 2026-07-20 | Carved from Story 11-5 by the Awwal-ratified split (SM Bob / PM John). Email import-verification (tier-1→tier-2), confirm-first double-opt-in, deliverability/bounce, Cohort-D sequencing, DPIA send-gate. Epic 13. Status = **backlog** (blocked on 11-5 + 13-2 Axis-3 marker + DPIA). |

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

### Completion Notes List

### File List

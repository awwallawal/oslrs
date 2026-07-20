# Requirements Brief — Email-Channel Ingest, First-Class Respondent Email & Email-Based Import Verification

> **Purpose:** input for the SM (`*create-story`) + PM (validate/harmonize). Captures the full requirement set + nuances for ingesting the ITF-SUPA artisan register (and future email-only sources) when phone is absent but email is present. Authored 2026-07-20 from the Story 11-2 real-fixture findings.

## 1. Problem & strategic framing

The ITF-SUPA Oyo artisan register (`Oyo_shortlisted_artisans.pdf`, 3,675 rows) is a high-value acquisition cohort: government-accountable, with clean **E-MAIL / LGA OF RESIDENCE / TRADE AREAS** columns. But the published shortlist PDF has **REDACTED phone numbers**, and Story 11-2's importer makes phone the mandatory dedup + contact key → every row fails today.

**Design for BOTH eventualities (this is the point):**
- **ITF gives us a clean CSV/XLSX** (ideally with unmasked phones) → easy path; more identifiers, stronger dedup.
- **ITF refuses / strings us along** → we still extract full value from the PDF we already hold, using **email as the contact + verification channel**.

Email-channel ingest makes us **format- and cooperation-independent** of ITF. It also converts our biggest external launch dependency (**Termii SMS sender-ID**, long-lead) into something already live (**Resend + magic-links**), because verification moves from SMS to email.

## 2. Core capability (the four changes)

### 2.1 First-class `respondents.email`
- New nullable `email` column on `respondents`, normalized via the existing `normaliseEmail`.
- **Non-unique** index (email is NOT 1:1 with a person — see §3.1). Used for dedup signals, campaign targeting, and verification.
- **Contact-PII: NEVER exposed publicly** — excluded from marketplace + public-insights surfaces; campaign/verification/admin only. Covered by respondent erasure.
- Ripple: `registry_unified` read carries it (not a count axis); export-query includes it (admin export only); reference-code chokepoint / `findOrCreateRespondent` becomes email-aware.

### 2.2 Channel-aware required-field ("reachability") policy
- Per-source config `requiredContact: 'phone' | 'email' | 'phone_or_email'`.
- Association sheet → `phone`; ITF → `phone_or_email` (accept email-only); a row with **no valid phone AND no valid email** → row-level failure.
- Generalizes to a durable **reachability model** for every future intake channel (the intake twin of 13-33's "many intakes, one registry").

### 2.3 Dedup on phone OR email OR NIN — with email-safety
- Phone / NIN = **hard** keys (auto-skip a match; NIN via FR21).
- **Email = SOFT key:** an email match is a *review/possible-duplicate* signal, not a blind collapse.
  - **`shared_email` guard:** if one email appears on N > threshold rows in a batch (proxy/head/cybercafé address), do NOT dedup-collapse them — insert all, flag `shared_email` for operator review.
  - Email-only match against an existing respondent → flag for review (or soft-merge only when name similarity is high), never a silent skip that erases a distinct person.
- Intra-batch + against-registry dedup both honor the soft-email rule.

### 2.4 Email-based import verification loop (replaces SMS gate)
- `imported_unverified` rows **with a valid email** get a **magic-link confirmation email** (reuse 9-12 magic-link infra + Resend) — "Confirm you're on the Oyo SUPA register / claim your profile."
- Click → upgrade **tier-1 (source-attested on import)** → **tier-2 (Member-verified / self-confirmed)**, consistent with the 13-2 taxonomy + 13-38 badge tiers.
- Non-responders stay unverified (anti-roll-padding preserved — dead/ghost addresses never confirm).
- **No Termii dependency** → the email cohort's verification is unblocked at launch.

## 3. Nuances that "make it better"

1. **Email is a weak dedup key (§2.3)** — the single most important safety rule; blind email-collapse would merge distinct artisans. `shared_email` detection is mandatory, not optional.
2. **Confirm-first = double opt-in → lawful-basis resolved.** The FIRST email is a **one-time transparency + claim notice** (public-task / legitimate-interest, with one-click opt-out), NOT marketing. Marketing/evergreen (13-11/13-12) begins **only after confirmation** (consent). This makes cold-contacting a public register defensible instead of risky.
3. **Verification email doubles as a data-cleaning loop.** The PDF's ADM↔NAME column-merge yields imperfect names; the confirm flow asks the person to confirm/correct **name, trade, LGA**. Verification + cleaning in one motion.
4. **Bounce = signal.** Hard bounce → mark email invalid, respondent stays unverified + flagged for phone follow-up. Reuse 13-9 suppression/bounce inlets.
5. **Email is contact-PII, never public (§2.1).** Explicit exclusion guard on every public surface.
6. **Reachability generalization (§2.2)** — this is the durable channel-agnostic shape, not an ITF one-off.

## 4. Lawful basis / DPIA / consent

- **Ingesting** the public register = public task (`ndpa_6_1_e`). OK.
- **Contacting** them = a NEW processing purpose. Handled by the **confirm-first / double-opt-in** design (§3.2): transparency notice + opt-out first; consent-based marketing only post-confirmation.
- **DPIA Appendix H** update for the imported-then-emailed pattern (parallel to the association proxy-collection DPIA item). Confirm evidence form with the DPIA owner. **Gates the SEND, not the importer build.**

## 5. Deliverability & operations

- **Warm-up:** batch the ~3,600 confirm-emails over days; monitor bounce rate; throttle; honor suppression. Reuse the existing email budget/queue (13-9) + Resend Pro.
- **Typo detection:** `normaliseEmail` flags `suspected_typo` → surface in dry-run; auto-correct only high-confidence, else flag.
- **Metrics:** confirmation rate = a live data-quality + engagement signal for the cohort.

## 6. Campaign integration

- ITF = **Cohort D (~3,600)**, a **confirm-first track** distinct from the warm self-registered cohorts (A/B/C). Coordinate sequencing with the 13-24 anti-whiplash blast plan — the ITF confirm-notice is its own sequence, never mixed into the warm-cohort blasts.
- `source = imported_itf_supa`; attribution by construction (no self-report). Verified-via-email upgrades tracked.

## 7. Edge cases / risks

- Shared/proxy email on many rows → `shared_email` flag, never collapse.
- Dead/typo email → bounce → mark invalid + unverified.
- Forwarded confirm link → low-stakes (upgrade only); magic-link is per-respondent + proves control of that address.
- Existing wizard registrant with the same email → soft-merge/dedup (upgrade provenance), never double-count.
- NDPA right-to-object → every email carries opt-out; suppression honored.
- PDF name imperfection (ADM↔NAME merge) → mitigated by the verification cleaning loop (§3.3); prefer CSV/XLSX when available.

## 8. Scope

**In:** `respondents.email` + index + privacy guard; per-source `requiredContact` policy; email-aware + `shared_email`-safe dedup; email verification magic-link loop (tier-1→tier-2); confirm-first opt-in flow; bounce→invalid handling; dry-run surfacing of email typos + `shared_email`; ITF `imported_itf_supa` accept-email-only wiring.

**Out (or downstream):** the actual ITF email BLAST send (operator + DPIA-gated); Termii/SMS verification (unchanged, separate); marketplace badge rendering (13-38); the unmasked-CSV ingest is just the same importer with more columns (no extra code).

## 9. Dependencies & cross-refs

- **Builds on:** 11-2 (import spine — DONE/review), 11-1 (schema), 9-12 (magic-link infra), 13-9 (email-events/suppression/bounce), 13-11/13-12 (blast/evergreen), 13-13 (unsubscribe), 13-33 (registry_unified read — must carry email w/o exposing it), 13-2 taxonomy + 13-38 badge tiers.
- **Coordinates with:** 13-24 (cohort sequencing), 12-4/12-5/12-7 (analytics — email never a public axis).

## 10. Open decisions for Awwal (resolve during story authoring)

1. **Story shape:** ONE story (11-5) capturing ingest + verification, OR SPLIT into **11-5** (schema + email-channel ingest + dedup) and a **13-x** (email verification loop + Cohort D confirm-first send)? Recommendation: author as **11-5** with the verification loop as a clearly-scoped section, and let PM rule on a split if it's too large.
2. **`shared_email` threshold** (e.g. flag at ≥3 rows sharing an address).
3. **Confirm-first copy + lawful-basis wording** (DPIA owner sign-off).
4. **Cohort D sequencing** relative to A/B/C in the 13-24 plan.

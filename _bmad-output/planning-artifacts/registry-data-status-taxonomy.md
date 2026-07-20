# Registry Data-Status Taxonomy — the honest-data contract

**Author:** John (PM) · **Date:** 2026-07-01 · **Status:** v1 — for Bob (SM) to anchor 12-4 + parity-sweep 12-5/12-6/12-7/13-2/13-6 + flag the Public-Core story
**Session context:** `docs/session-2026-07-01-campaign-measurement-spine.md`

## Why this exists (the WHY)
The registry is going **multi-channel** — public self-serve (SHORT Public Core form), enumerator/clerk (FULL instrument), **association proxy-import**, bulk import. A single "Total Respondents = N" is **dishonest**: it hides *where a row came from*, *how complete it is*, and *how much we trust it's a real unique person* — and it lets loopholes through (double-count, ghost/padded association rows, incomplete-as-complete, short≡full, draft≡respondent). This contract makes provenance, completeness, and trust **structural and legible** so no dashboard can lie by omission.

**Grounded reality (prod 2026-07-01):** `respondents`=139 (138 public / 1 enumerator); 76 with a Step-4 submission, **63 without** (the 2026-05 data-loss window); status active=104 / nin_unavailable=34 / pending_nin_capture=1; `wizard_drafts`=292 (started, **not** respondents). Today `report.service.ts:55` reports `totalRespondents = COUNT(*) = 139`, but some surfaces mislabel 76 (submissions) as "Total Respondents" (the 12-5 gap). `registry-data-status.ts` already partially classifies.

---

## The model: THREE orthogonal axes — never collapsed to one number
Every `respondents` row is classified on three **independent** axes. A dashboard may pivot/segment on any of them, but must **never** present a single number that hides the composition.

### Axis 1 — PROVENANCE (`respondents.source`): *how did this row enter?*
`public` (self-serve wizard) · `enumerator` (field + GPS + accountable agent) · `clerk` (paper → digital) · **`imported_association`** ⬅ NEW (association-head proxy) · `imported_itf_supa` · `imported_other` (bulk).

### Axis 2 — COMPLETENESS: *how much data do we actually hold?* — DERIVED, form-agnostic
Derived from **which fields are present in `raw_data`/the respondent**, NOT from which form was used (so a Public-Core row and a full enumerator row classify by what they *contain*):
- **`full`** — carries the full-instrument deep fields (labour-force block, household welfare, etc.).
- **`core`** — identity + skills + LGA + marketplace opt-in only (Public Core, or the association 12-column set). No deep fields.
- **`partial`** — registered but the survey answers are missing (the 63 no-submission rows).

> **Derivation rule (lock):** presence of a designated **"deep-field marker set"** (e.g. `employment_status`, `household_size`) ⇒ `full`; presence of the **core set** but not the deep set ⇒ `core`; a respondent with **no submission** ⇒ `partial`. The marker sets are defined once in the derivation service (Axis-2 config), so adding a channel never needs new completeness logic.

### Axis 3 — VERIFICATION / TRUST: *how sure are we it's a real, unique person?*
- **`verified`** — passed a real check: a **member-side confirmation** (SMS once Termii clears / a sampled Assessor callback) OR a validated NIN.
- **`nin_on_file`** — NIN captured but **not yet validated against NIMC** (honesty distinction — see Open Question 1).
- **`self_declared`** — self-provided, no NIN backstop (maps from `status=nin_unavailable` / active-without-NIN).
- **`pending_nin`** — NIN deferred (`status=pending_nin_capture`).
- **`unverified_import`** — proxy/bulk import, no member-side check yet (`status=imported_unverified`).

*(Axis 3 derives from `respondents.status` + `source` + NIN presence + validation flag — no new column needed for the base version.)*

## Pre-registry state (NOT a respondent)
**`wizard_drafts`** = started the wizard, didn't finish (292 today). This is a **funnel metric**, shown as "**+N in progress**" — **never** inside the registry total. A draft becomes a respondent only on wizard completion.

---

## Honest-display RULES — the contract every dashboard obeys
1. **Headline = `COUNT(DISTINCT respondent)`** — never a sum of per-channel counts (channels overlap; see loophole-blocks). Show it with an inline "**+N in progress (drafts)**".
2. **Three breakdowns beside the headline** — stacked/segmented by **source**, **completeness**, **verification**. The composition is always one glance away.
3. **Registry table:** each row wears a **`data_status` badge** (source + completeness + verification) + **source filter chips** (13-2) to slice.
4. **Deep-field charts** (labour-force participation, household, income) are **LABELED "(field-collected sample, N=…)"** — `core` and `unverified_import` rows are **excluded and said so**, never imputed to the whole.
5. **Verified vs pending are never blended** in any "registry size" claim — a "verified registry" figure excludes `unverified_import` and (per policy) may exclude `pending_nin`.

## Loophole-blocks (each loophole → its structural block)
| Loophole | Structural block |
|---|---|
| **Double-count** (self-registers + on an association sheet + field-surveyed) | Total is `COUNT(DISTINCT)` keyed on **phone/NIN**; the importer **auto-skips** phone/NIN matches (already in 11-2). Per-channel counts legitimately sum to *more* than the distinct total — the dashboard shows the distinct total; overlap surfaced via the association **declared-vs-imported-vs-skipped** reconciliation. |
| **Ghost / padded association rows** | Land **`unverified_import`** → segregated from the "verified registry" headline; promoted only by a **member-side check** (SMS confirm once Termii clears / **sampled Assessor callback**). Assessor dashboard gets a **"verify imported rows" queue**. |
| **Incomplete counted as complete** (the 63) | The **completeness axis** — `partial` counts in "registered" but is excluded from all survey-answer analytics; shown as its own bucket (12-6). |
| **Short-form ≡ full-form** | Completeness **derived from present fields** — a `core` row is never conflated with `full` in depth metrics. |
| **Draft ≡ respondent** | Drafts are **funnel-only**, never in the registry total. |

## The derivation-service contract (the single source of truth)
- **ONE service** (extend `registry-data-status.ts`, delivered by story **12-4**) computes `{ source, completeness, verification }` per respondent — the authoritative `data_status`.
- **EVERY dashboard/report reads this one model.** No ad-hoc `COUNT(*)` / `COUNT(submissions)` scattered in services (that scatter is exactly the 76-vs-139 drift). `report.service`, `operations.service`, `public-insights.service`, `export-query.service` all consume the 12-4 model.
- Output shape (illustrative): `{ distinct_registered, in_progress_drafts, by_source{...}, by_completeness{full,core,partial}, by_verification{...}, verified_registry }`.

## How the existing stories consume this — AMEND, do not rewrite
| Story | Change (light amendment, not a rewrite) |
|---|---|
| **12-4 registryTotals** | **Re-anchor as THE model story** — implements the 3-axis derivation service + the DISTINCT/verified/drafts contract. The one code story that *builds* the taxonomy. |
| **12-5 label-honesty** | "Renders the 12-4 model; no surface labels a submissions-count as 'Total Respondents'; deep-field charts carry the (field sample, N=…) label." |
| **12-6 data-health view** | "Renders by-completeness + by-verification from the 12-4 model (139 → 76 full / 63 partial / by-source)." |
| **12-7 registry data_status + reference_code** | "Row badge = the 12-4 `data_status`; source filter chips." |
| **13-2 association import** | Add: `imported_association` to `respondents.source` + import-sources config; rows classify **`imported_association / core / unverified_import`**; wire the **member-side-check promotion** + the Assessor verify-queue (AC5.4/5.5 already gesture at this). |
| **13-6 channel & coverage dashboard** | "Reads the source axis for channel × LGA coverage; verified vs pending shown separately." |
| **🆕 Public-Core two-form split** | **NEW story** (Bob to author): the short Public Core form + publish-both/pin-the-core mechanism; introduces `completeness=core`; naming discipline for the two published forms; a public dry-run acceptance test. |

## Sequencing (Tier-aware; NOT launch-gating)
- **Cheap + worth doing PRE-Jul-1** (so first campaign traffic + any early association sheets classify honestly from row #1): (1) this spec, (2) **add `imported_association` to the source enum** + the import-sources config stub, (3) define the Axis-2 deep-field marker set. Small, low-risk, no dashboard work.
- **POST-launch (Epic-12 sequence):** the derivation service (12-4) + the dashboard renderers (12-5/12-6/12-7) + 13-6. These read the data the launch generates — build them once there's real multi-channel volume to render.

## Open questions for Bob / the story (resolve in the story, or flag to the DPIA/Ministry owner)
1. ✅ **RESOLVED 2026-07-04 — see "Resolutions" below.** Does the system VALIDATE NIN (against NIMC) or only CAPTURE it? Answer: **CAPTURE + FORMAT only.** There is no offline validation because Nigerian NINs have no check digit (NIMC: "11 randomly generated, non-intelligible digits"; verified vs prod n=105 — the old Mod-11 gate rejected 74% of real NINs and is being retired in **Story 13-15**). The top tier is `nin_on_file`, NOT `verified`. "Verified" is reserved for NIMC-online or member-side confirmation.
2. **Is `data_status` DERIVED (recomputed on read) or MATERIALIZED (a stored/cached column)?** Recommend **derived** for correctness (no drift), with a cached read-model only if perf demands it at scale.
3. **Member-side check mechanism** for association rows pre-Termii — is the sampled **Assessor callback** the launch answer (SMS confirm being Termii-blocked)? Recommend yes.

→ **Hand to Bob (SM):** re-anchor 12-4 as the taxonomy model story (ground the derivation against `registry-data-status.ts` + `report.service.ts:55` + the source/status enums) + do the parity-sweep amendments (pointers only) + author the NEW Public-Core two-form-split story. Do NOT rewrite the consumer stories.

---

## RESOLUTIONS — 2026-07-04 (John PM + Bob SM round; Awwal-approved)

These lock the open decisions the contract depended on. All are pointers/rules — no story rewrites.

### R1 — NIN verification (resolves Open-Q1) — LOCKED
Nigerian NINs are **"11 randomly generated, non-intelligible digits" (NIMC)** — **no check digit exists.** Verified against prod (`oslsr_db`, n=105): the `modulus11Check` gate rejected **74% of real NINs**; no scheme (Mod-11 variants / Verhoeff / Luhn) fits. Therefore:
- **Offline validation = FORMAT ONLY** (`^\d{11}$`). The Mod-11 hard gate is retired in **Story 13-15** (launch-blocking).
- **Axis-3 tiers (final):** `nin_absent`/`pending_nin` → **`nin_on_file`** (format-valid, self-declared — where MOST public rows land) → **`nin_verified`** (NIMC-online **or** member-side confirmation only). **There is NO offline "checksum-valid" tier.** No surface may label a format-valid NIN "verified."
- NIMC-online validation is out of scope for launch (cost-gated); do it on a **sample** + high-stakes actions (e.g. marketplace contact reveal) in a future story.

### R2 — The DISTINCT identity key (resolves the double-count loophole precisely) — LOCKED
The headline `COUNT(DISTINCT respondent)` and the importer dedup (11-2) **MUST use ONE shared key** with this precedence:
1. **NIN** (when present) → 2. **phone (E.164-normalised)** (when no NIN) → 3. **`respondent.id`** (when neither).
- Rows resolvable only by rule 3 (no NIN, no usable phone, or a **shared/duplicate phone** that would wrongly merge distinct people — e.g. a household sharing one number) go into an explicit **`identity_ambiguous`** bucket, surfaced beside the headline (never silently merged, never silently double-counted).
- 12-4 owns this key; 11-2's importer skip-logic must resolve to the SAME key so the dashboard's distinct total and the importer's "skipped as duplicate" count reconcile.

### R3 — `full` stratum target (resolves the two-form study-validity tension) — LOCKED (Ministry-revisable)
The Public Core (`core`) channel grows registry VOLUME; the baseline study's ANALYTICAL depth (labour-force participation, household welfare, income) rests on the `full` (field-collected, enumerator) instrument. **Deliverable floor: `full` stratum ≥ 330 responses AND ≥ 10 per LGA across all 33 LGAs** — mirroring the study's own validation-exercise design (n=330, 10/LGA × 33, ch06). Scale up where possible; below this floor, per-LGA deep analytics are not defensible.
- **Tracked as a first-class dashboard metric** (12-6 / 13-6): `full` count + per-LGA `full` coverage vs the ≥10 floor, so a `core`-heavy registry can't quietly hollow out the analysis. 13-14 (Public Core) must not be pinned in a way that starves the `full` channel below this floor.

### R4 — Sequencing: pull 12-5 forward — LOCKED
**Story 12-5 (label honesty) ships BEFORE/early in the launch campaign** (pre-launch-eligible), so no surface shows a submissions-count mislabeled as "Total Respondents" while the Ministry is watching. The rest of Epic 12 (12-4 model, 12-6/12-7 renderers) stays post-launch on real volume. (12-5 depends on 12-4's model shape; ship the minimal 12-4 model + 12-5 label pass together as the pre-launch slice.)

## RESOLUTIONS — 2026-07-20 (John PM; Awwal-directed, from the email-channel ingest thread)

### R5 — Member-side confirmation is CHANNEL-AGNOSTIC; email is a confirmation vector, NOT an identity key — LOCKED
The email-channel ingest (Story 11-5) + verification (Story 13-39) extend, not replace, this contract:
- **The member-side check that promotes `unverified_import` → `nin_verified` is channel-agnostic:** SMS (Termii) · sampled **Assessor callback** · **email magic-link confirmation (NEW — Story 13-39).** For email-bearing imports (ITF, no phone), email confirmation is the **launch-viable channel** (Resend live; no Termii gate). Non-response never promotes (anti-padding preserved). All channels resolve to the SAME Axis-3 tier via the 12-4 derivation service — do NOT invent a parallel verification model.
- **Email is a CONTACT channel + confirmation vector — it is NOT part of the R2 DISTINCT-identity key** (email is shared: proxy/head/cybercafé addresses). An email-only dedup match is a **review flag** that feeds the R2 **`identity_ambiguous`** bucket + the manual-merge tooling — **never a silent merge and never a change to the distinct count.** Story 11-5's `shared_email` guard (flag-not-collapse at ≥3 rows) is the batch-side expression of this rule.
- **Confirm-first = double opt-in** (one-time transparency notice + opt-out FIRST; marketing only post-confirmation) is the NDPA basis for contacting an imported public register (13-39 AC2; DPIA Appendix-H gates the send).
- **The "verify imported rows" Assessor queue** (already specified in the loophole-blocks table + 13-2 AC5.4/5.5) is the **human fallback** when SMS/email confirmation response is low — it now has its own story shell (see sprint-status).

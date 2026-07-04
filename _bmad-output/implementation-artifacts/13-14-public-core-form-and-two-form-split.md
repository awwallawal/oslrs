# Story 13-14: Public Core Form + Two-Form Channel Split

Status: ready-for-dev

> Tier: **pre-launch-eligible** (mostly operator + a small enablement/verification; NOT heavy code — the forms engine is data-driven per 9-54). Emerged 2026-07-01 (survey-fatigue reduction discussion). Anchors on the [Registry Data-Status Taxonomy](../planning-artifacts/registry-data-status-taxonomy.md) — introduces the **`completeness=core`** state.
>
> 🔒 **RESOLUTION R3 2026-07-04 (Awwal-approved): the `core` channel must NOT starve the `full` stratum.** Deliverable floor = **`full` (field-collected) ≥ 330 responses AND ≥ 10 per LGA across all 33 LGAs** (mirrors the validation-exercise design, ch06 n=330). Track `full` count + per-LGA `full`-coverage-vs-floor as a first-class dashboard metric (12-6/13-6). Public Core drives volume, but pinning/UX must keep the enumerator FULL channel alive above this floor. Ministry-revisable.

## Story
As the **launch operator driving public traffic**, I want the **public self-serve wizard to render a SHORT "Public Core" form** while **enumerators/clerks keep the FULL baseline instrument**, so that **public fatigue drops and completion rises — without fragmenting the registry**: every channel still aggregates into one `respondents` table and every dashboard reads it honestly.

## Context & Why
The pinned public form is the **full ~42-question baseline instrument** (a labour-force STUDY fused with a skills REGISTRY). That's the fatigue driving the 292 abandoned drafts (esp. Step-4 Labour). But the two collection purposes have different epistemics: the **baseline study** needs the full instrument on a **representative enumerator sample**; the **public self-serve** is a **convenience sample** that should be a fast REGISTRY sign-up. Fix = **split by channel**, not delete data. The mechanism already exists (public reads the pin; enumerators pick from published) — this story enables + verifies it, and keeps aggregation honest via the shared-key contract. Draft form: `docs/launch-campaign/oslsr-public-core-v1.xlsx` (~16 adult-visible Qs; reuses the master's exact names/choice-lists; **includes `email`**, which the current pinned form lacks).

## Acceptance Criteria
1. **AC1 — Aggregation contract (identical keys).** The Public Core reuses the **identical question `name`** for every shared field (`surname`, `firstname`, `gender`, `dob`, `phone_number`, `email`, `nin`, `lga_id`, `main_occupation`, `years_experience`, `skills_possessed`, `consent_marketplace`, …) so `submission-processing`'s field-map extracts the SAME respondent fields as the Full form — one registry, no divergent `raw_data` keys. Never RENAME a shared question; only add/remove. [Source: apps/api/src/services/submission-processing.service.ts (RESPONDENT_FIELD_MAP)]
2. **AC2 — Two forms published, Core pinned.** Both are published: **"OSLSR Full Baseline (enumerator)"** (the email-master `oslsr_master_v3`) + **"OSLSR Public Core (self-serve)"**. The **Public Core is pinned** as `wizard.public_form_id`. [Source: apps/api/src/services/native-form.service.ts:412-423 (getPublicForm reads the pin); native-form.service.ts:275 (publish); apps/web/.../QuestionnaireList.tsx:25 (WIZARD_PIN_KEY)]
3. **AC3 — Channel differentiation works.** The **public wizard** renders the SHORT Core; **enumerators/clerks** pick the **Full Baseline** from their Surveys page (confirmed current behavior: `EnumeratorSurveysPage`/`ClerkSurveysPage` → `usePublishedForms`; `submitForm` carries the chosen `formId`). Pinning the Core does NOT shorten the enumerator form. [Source: apps/api/src/controllers/form.controller.ts:51 (getPublicForm) / :66 (/forms/published); apps/web/src/features/dashboard/pages/EnumeratorSurveysPage.tsx (usePublishedForms)]
4. **AC4 — Completeness classifies as `core`.** A public-core completion aggregates into `respondents` with `source='public'` and derives **`completeness=core`** per the taxonomy (it lacks the deep-field marker set) — so it's never conflated with a `full` enumerator row in depth analytics. [Source: registry-data-status-taxonomy.md §Axis-2; 12-4 AC7]
5. **AC5 — Naming discipline (no per-form audience flag today).** Since both forms appear in the enumerator's published list, they are named unmistakably ("Public Core (self-serve)" vs "Full Baseline (enumerator)") so an enumerator cannot grab the wrong one. *(Optional future: a `channel`/`audience` flag on forms to filter the list — logged, NOT in scope.)*
6. **AC6 — Public dry-run acceptance.** A public wizard walkthrough on the pinned Core: the short form renders end-to-end AND a submission creates a `respondent` with `source='public'` + the core fields populated + `completeness=core`. (Manual operator dry-run + an automated e2e if the harness allows.)
7. **AC7 — NO duplicate question on the public path (added 2026-07-04, Awwal).** No field the wizard collects natively (Steps 1–2) is asked AGAIN in the Public Core questionnaire. Verified 2026-07-04: the wizard's Pattern-C dedup (`Step4Questionnaire.computePrefill`) correctly hides `surname/firstname/gender/dob/phone/email/nin` and the two consents — BUT **`lga_id` is a CONFIRMED DUPLICATE**: the wizard stores `lgaId = lgas.id` (a **UUID**, `Step2ContactLga.tsx:186 <option value={lga.id}>`) while the form's `lga_list` uses **slug** keys (`egbeda`…); `mapWizardValueToChoice('lgaId', <UUID>, [slugs])` returns `undefined` → the question is SHOWN a second time. **Resolution: REMOVE `lga_id` from the Public Core form** — the wizard already collects LGA in Step 2 and sets `respondents.lgaId` (the authoritative column dashboards read); the form's `lga_id` in `raw_data` is redundant on the public path. (Enumerators fill the FULL form directly — no wizard — so the FULL form KEEPS `lga_id`.) A dry-run must show LGA asked EXACTLY once.

## Tasks / Subtasks
- [ ] **Task 1 (AC1, AC7)** — finalize `oslsr-public-core-v1.xlsx`: verify identical shared names vs the master; confirm `email` present; **REMOVE `lga_id` from the survey sheet** (AC7 — the wizard owns LGA natively; leaving it duplicates the question). Field-cut STRUCTURE (~16 adult) **APPROVED by Awwal 2026-07-04** ("approved as-is"); Ministry/baseline-study ToR/DPIA alignment is a parallel confirmation, not a code blocker.
- [ ] **Task 2 (AC2)** — operator: upload+publish the email-master as "OSLSR Full Baseline (enumerator)"; upload+publish "OSLSR Public Core (self-serve)"; **pin the Public Core** via the settings card.
- [ ] **Task 3 (AC3, AC5)** — verify the enumerator/clerk Surveys page lists BOTH published forms + they can select the Full Baseline; confirm the naming reads unambiguously.
- [ ] **Task 4 (AC4, AC6)** — public wizard dry-run: short form renders; submit; assert a `respondents` row (`source='public'`) with the core fields + `completeness=core` (via 12-4 once built, else inspect `raw_data`).
- [ ] **Task 5** — runbook: update the pre-launch operator runbook's "master-form re-pin" step → **"publish BOTH + pin the Public Core"** (the re-pin residual now splits correctly); note the Ministry-sign-off gate.

## Dev Notes
- **NO code required** for the core outcome — it's form re-upload + re-pin on the 9-54 data-driven engine + naming + verification. If the enumerator Surveys page needs a tweak to surface two forms clearly, that's the only small code touch (verify first).
- **The re-pin residual reframes:** the pending "re-pin the email-master" becomes "publish the email-master as Full Baseline (for enumerators) + publish & pin the Public Core (for the public)."
- **Aggregation is form-agnostic** by the shared-key contract (AC1) + `respondents.source` as the channel discriminator — one registry, dashboards segment by source + total (per the taxonomy).
- **Not launch-gating** but **pre-launch-eligible** — worth doing before Jul-1 so the driven traffic hits the short form (higher completion) from row #1. Ministry sign-off is the pacing item.
- **Guardian block kept conditional** (under-15 relevance) — legally needed on the public path; ~0 fatigue for adults.

### Dedup verification (2026-07-04) — the wizard-native vs form-question overlap
The public wizard collects 11 identity/contact/consent fields natively (Steps 1–2) and hides matching Step-4 questions via `WIZARD_PROVIDED_FIELD_NAMES` + `computePrefill` (`apps/web/src/features/registration/pages/Step4Questionnaire.tsx`). Cross-checked every Public Core field against that map:
- **Deduped correctly (hidden — asked once, in the wizard):** `surname`(familyName), `firstname`(givenName), `gender`, `dob`, `phone_number`(phone), `email`, `nin`, `consent_marketplace`, `consent_enriched`. Choice fields map cleanly: `gender_list=[male,female,other]` (wizard `prefer_not_to_say→other`), consents `yes_no` (boolean `true→yes`). ✓
- **NOT a duplicate (form-only; wizard doesn't collect them):** `consent_basic`, `main_occupation`, `employment_type`, `years_experience`, `skills_possessed`, `skills_other`, guardian block. ✓
- **DUPLICATE → fix (AC7):** `lga_id`. Wizard stores `lgas.id` (UUID); form `lga_list` uses slugs → `mapWizardValueToChoice` fails → shown twice. **Fix = remove `lga_id` from the Public Core form.**

**Root-cause fix → Story 13-16 (`13-16-lga-value-canonicalization`).** The LGA UUID↔slug mismatch is deeper than the dedup: `respondents.lgaId` is `text` (no FK) and holds the **UUID** on the public/wizard path but the **slug** on the enumerator path (verified vs prod: 139 UUID public + 1 slug enumerator), so the analytics `l.code = r.lga_id` join FAILS for all 139 public rows (they render as UUID/"Unknown"). 13-16 canonicalizes to the **slug** everywhere (wizard writes `lga.code`, backfills the 139). **This story (13-14) stays independent:** removing `lga_id` from the Public Core is the immediate pre-launch, form-only fix; 13-16 is the systemic cure (keep both — belt-and-suspenders; do NOT make 13-14 depend on 13-16). Enumerators are unaffected on the DUPLICATE (they fill the FULL form directly, no wizard) but ARE part of the value-split 13-16 fixes.

## Dev Agent Record

- **2026-07-04 — AC7 form edit DONE (Ministry nod given):** removed `lga_id` (survey row 20) from `docs/launch-campaign/oslsr-public-core-v1.xlsx`. Verified: `lga_id` absent, groups balanced (6 begin / 6 end), identity block = surname/firstname/gender/dob/phone/email/nin (no lga_id), `lga_list` choices left intact (unused, harmless). The wizard collects LGA natively (Step 2 → `respondents.lgaId`), so no data loss. **Remaining Task-1/2 work (verify shared names vs master, publish BOTH forms, pin the Public Core) is operator — run via the BMAD flow.**

### File List
_(empty)_

## Senior Developer Review (AI)
_(empty)_

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-01 | Story drafted via *create-story — Public Core short form + two-form channel split; anchors the taxonomy's `completeness=core` | Bob (SM) |
| 2026-07-04 | **Field-cut STRUCTURE approved by Awwal** ("as-is", ~16 adult; no further trim). **Dedup verification done:** all wizard-native fields dedup correctly EXCEPT `lga_id` (wizard UUID vs form slug → shown twice). Added **AC7** (no duplicate on the public path) + Task-1 step to REMOVE `lga_id` from the Public Core form. Flagged the LGA UUID↔slug root cause as a code follow-up (also affects the current full form). | Awwal + Bob (SM) |

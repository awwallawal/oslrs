# Story 13-14: Public Core Form + Two-Form Channel Split

Status: ready-for-dev

> Tier: **pre-launch-eligible** (mostly operator + a small enablement/verification; NOT heavy code — the forms engine is data-driven per 9-54). Emerged 2026-07-01 (survey-fatigue reduction discussion). Anchors on the [Registry Data-Status Taxonomy](../planning-artifacts/registry-data-status-taxonomy.md) — introduces the **`completeness=core`** state.

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

## Tasks / Subtasks
- [ ] **Task 1 (AC1)** — finalize `oslsr-public-core-v1.xlsx` (verify identical shared names vs the master; confirm `email` present; apply any Ministry-approved field adjustments). **Ministry/baseline-study sign-off on the field cut is a prerequisite** (analytical scope + DPIA/ToR).
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

## Dev Agent Record
_(empty — populated by the dev/operator)_

### File List
_(empty)_

## Senior Developer Review (AI)
_(empty)_

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-01 | Story drafted via *create-story — Public Core short form + two-form channel split; anchors the taxonomy's `completeness=core` | Bob (SM) |

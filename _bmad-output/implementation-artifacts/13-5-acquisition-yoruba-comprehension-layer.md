# Story 13.5: Yoruba Comprehension Layer — Bilingual Wizard Labels + Consent Declaration (Trust Uplift, NOT an Access Gate)

Status: backlog

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-25 by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). FAST-FOLLOW — NOT a pre-spend gate. Yoruba = comprehension/trust uplift, explicitly NOT an access gate. Keep it LEAN. -->

## Story

As a **Yoruba-first respondent registering on the public wizard**,
I want **the wizard labels and the consent declaration shown in Yoruba alongside English**,
so that **I understand what I'm consenting to and answering in my own language — which lifts answer quality, trust, and willingness — even though I can already complete the English form.**

## Context & Why This Is a Comprehension Layer, NOT an Access Gate

The language decision (Awwal, 2026-06-25): **build the Yoruba form, but as a comprehension/trust uplift, not an access gate** [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:59].

The load-bearing reframe: **a Yoruba reader almost certainly reads English too** — Yoruba is more spoken than written. So English self-serve is **not a literacy blocker**, and Yoruba is therefore **OUT of the pre-spend gate** (fast-follow) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:59]. Reading the consent/questions in the local dialect confers **more meaning** and signals respect, which lifts answer quality and willingness [Source: docs/launch-campaign/association-condensed-sheet-spec.md:60].

**Who Yoruba does NOT serve (do not over-scope):** the genuinely **low-literacy / non-reading** segment is served by the **cascade + enumerators** (oral, in Yoruba/Pidgin) — NOT by a text form in any language [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:59] [Source: docs/launch-campaign/association-condensed-sheet-spec.md:60]. Radio CTA routes by capability: readers → website; non-readers → association head / "an enumerator will visit your area." This story does NOT try to make the wizard serve non-readers.

### Current state — no i18n infra exists
The web app has **no existing i18n framework** (no `react-i18next`, no locale/translation infrastructure — verified). So this story must scope a **lean** i18n approach for the wizard, not retrofit a heavyweight framework across the whole app.

## Acceptance Criteria

### AC1 — A lean wizard i18n approach is established (English + Yoruba)
1. A lightweight i18n mechanism is introduced **scoped to the wizard** (labels + helper text + the consent declaration) — a simple key→{en,yo} string map / lightweight provider is acceptable and preferred over adopting a heavyweight framework app-wide. The approach is documented so future surfaces can extend it if desired, but this story does NOT translate the whole app.
2. English remains the default; Yoruba is offered via a clear, discoverable language toggle on the wizard. Switching language re-renders labels without losing entered data or wizard step position.
3. The translation strings are **content/config, not logic** — kept in one place (a translation resource), editable without touching component logic, so the operator-supplied Yoruba copy drops in cleanly.

### AC2 — Wizard labels rendered in Yoruba
1. The user-facing wizard **labels, helper text, and validation/error messages** for the standard wizard steps (identity/contact/consent/the "How did you hear about us?" question from Story 13-1) render in Yoruba when Yoruba is selected, alongside or in place of English per the toggle.
2. Dynamic/form-engine question labels (Step 4 questionnaire, which come from the pinned form schema, not static UI copy) are **explicitly scoped**: either (a) translated via the same resource where they are static UI chrome, or (b) declared OUT and left in their authored language — the story states which, to avoid an open-ended "translate every dynamic form field" blowup. Default: translate the **static wizard chrome + consent**, declare the **dynamic form-schema question bodies** out of scope (they are content authored by the form owner).
3. Rendering Yoruba never blocks completion — a missing translation key falls back to English (never a blank or an error).

### AC3 — Consent declaration in Yoruba (the trust-critical string)
1. The **consent declaration** is shown bilingually (English + Yoruba) — this is the trust-critical string where comprehension matters most (the respondent is consenting to PII storage + contact) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:55-56]. The Yoruba wording is operator-supplied (Awwal pre-print/translation input) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:64-66].
2. The Yoruba consent text aligns with the sheet's §4 declaration so the website and the cascade say the same thing in the same language [Source: docs/launch-campaign/association-condensed-sheet-spec.md:55-56].

### AC4 — Lean scope honoured + tests
1. The story stays LEAN: it does NOT introduce app-wide i18n, does NOT translate dashboards/admin surfaces, and does NOT add Pidgin or other languages (English + Yoruba only) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:59].
2. Tests assert: the toggle switches wizard chrome + consent to Yoruba without data/step loss; a missing key falls back to English (AC2.3); the consent declaration renders the operator-supplied Yoruba text. Full `pnpm test` green; tsc + lint clean.

## Tasks / Subtasks

- [ ] **Task 1 — Establish the lean wizard i18n mechanism (AC1)**
  - [ ] Introduce a lightweight wizard-scoped i18n (key→{en,yo} resource + small provider/hook); do NOT adopt a heavyweight framework app-wide (AC1.1). Default = English; Yoruba via a discoverable toggle that preserves entered data + step position (AC1.2).
  - [ ] Keep translation strings as a single content resource, editable without component-logic changes (AC1.3).

- [ ] **Task 2 — Translate the static wizard chrome (AC2)**
  - [ ] Render wizard labels/helper/validation copy (identity/contact/consent + the 13-1 "How did you hear about us?" question) in Yoruba on toggle (AC2.1).
  - [ ] Explicitly DECLARE the dynamic Step-4 form-schema question bodies OUT of scope (content authored by the form owner); translate only static UI chrome + consent (AC2.2). Missing key → English fallback (AC2.3).

- [ ] **Task 3 — Bilingual consent declaration (AC3)**
  - [ ] Render the consent declaration bilingually (EN + YO), wording aligned with the sheet §4 declaration (AC3.2) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:55-56]; drop in the operator-supplied Yoruba copy (AC3.1) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:64-66].

- [ ] **Task 4 — Lean-scope guard + tests (AC4)**
  - [ ] Confirm no app-wide i18n / no other languages / no dashboard translation crept in (AC4.1).
  - [ ] Web tests: toggle switches chrome+consent to Yoruba without data/step loss; missing-key → English fallback; consent renders Yoruba (AC4.2). Full `pnpm test` green; tsc + lint clean.

## Dev Notes

### Architecture & engine map
- **Wizard surfaces to translate (static chrome + consent):** `apps/web/src/features/registration/pages/WizardPage.tsx`, `Step1BasicInfo.tsx`, the consent step, and the 13-1 "How did you hear about us?" question. The Step-4 questionnaire (`Step4Questionnaire.tsx`) renders form-schema content authored by the form owner — its question BODIES are out of scope (AC2.2).
- **No existing i18n infra** — verified: the web app has no `react-i18next` / locale framework. Introduce a lean wizard-scoped resource, not a global retrofit.
- **Consent declaration source-of-truth wording:** the sheet §4 bilingual declaration [Source: docs/launch-campaign/association-condensed-sheet-spec.md:55-56] — keep website + cascade aligned.

### Why this is fast-follow, not a gate (read before coding)
- Yoruba is a **comprehension/trust uplift, not an access gate** — English self-serve is not a literacy blocker because a Yoruba reader reads English; non-readers are served by enumerators/cascade, not a text form [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:59]. So do NOT let this story balloon into "make the wizard usable by non-readers" — that's the wrong channel for that segment.

### Critical implementation rules (from project-context.md)
- Keep translations as content/config (one resource), not logic. English fallback on missing key (never blank/error).
- **Tests** — web co-located vitest; `pnpm test` routes per package (never `pnpm vitest run` from root for web).

### Dependencies & sequencing
- **SOFT dep:** Story 13-1 (the "How did you hear about us?" question is one of the labels translated) — if 13-1 hasn't landed, translate the existing wizard chrome + consent and add the question's translation when 13-1 lands.
- **Operator input:** the Yoruba copy itself (declaration + headers) is Awwal's pre-print/translation input [Source: docs/launch-campaign/association-condensed-sheet-spec.md:64-66] [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:107] — the story wires the mechanism + slots; the operator supplies the strings.
- **Tier:** FAST-FOLLOW — explicitly NOT a pre-spend gate [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:59].

### Scope OUT (do not build)
- App-wide i18n / dashboard / admin translation (wizard-scoped only).
- Pidgin or any language beyond English + Yoruba.
- Translating the dynamic Step-4 form-schema question bodies (form-owner content).
- Making the wizard serve low-literacy / non-readers (that's the cascade + enumerators).

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:59,107] — Yoruba = comprehension uplift not access gate; fast-follow; operator-supplies-translations
- [Source: docs/launch-campaign/association-condensed-sheet-spec.md:55-56,60,64-66] — §4 bilingual consent declaration + why-bilingual + operator translation input
- [Source: apps/web/src/features/registration/pages/WizardPage.tsx] — wizard chrome to translate
- [Source: apps/web/src/features/registration/pages/Step4Questionnaire.tsx] — dynamic form-schema questions (bodies OUT of scope)
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-5-acquisition-yoruba-comprehension-layer] — scope note (comprehension/trust uplift, NOT a gate)

## Change Log

| Date | Change |
|------|--------|
| 2026-06-25 | Story authored by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 4 ACs (lean wizard-scoped EN+YO i18n mechanism; Yoruba wizard chrome labels; bilingual consent declaration aligned with the sheet §4; lean-scope guard + tests). Yoruba = comprehension/trust uplift, explicitly NOT an access gate; dynamic form-schema question bodies + non-reader service + app-wide i18n all OUT. Status → backlog. FAST-FOLLOW (not a pre-spend gate). |

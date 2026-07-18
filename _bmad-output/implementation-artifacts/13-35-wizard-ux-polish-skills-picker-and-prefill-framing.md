# Story 13-35: Wizard UX polish — skills-picker close affordance + prefilled-question framing

Status: ready-for-dev

<!-- Authored 2026-07-18 by Bob (SM). Two wizard-frontend UX frictions on the public conversion path, bundled (same feature area, same deploy). (1) The skills picker (ComboboxMultiSelect, the searchable multi-select for the 150-skill taxonomy) only closes on an outside click — no discoverable "done", so it feels stuck, esp. on mobile where it covers the form. (2) The Public Core questionnaire duplicates identity/demographic questions the wizard already collected; the dedup (prefilledQuestionNames) correctly hides them, but the "collected earlier" framing reads as broken/empty. NOT close-on-select (skills is genuinely multi-select) and NOT removing the dedup (it's the load-bearing plumbing that populates raw_data for analytics — see 13-33). Frontend-only, no data-shape change. Pre-blast-relevant (conversion), not launch-gating. -->

## Story
As **a member of the public filling the registration wizard**,
I want **a skills picker I can clearly finish with, and a questionnaire that doesn't look empty/broken when it has already captured my details**,
so that **I move through the wizard confidently instead of feeling stuck or confused — protecting completion on the blast.**

## Context & Evidence (verified 2026-07-18)
- **Skills picker = multi-select, closes only on outside-click.** `ComboboxMultiSelect.tsx` renders `skills_possessed` (>20 options → searchable combobox with sector groups + chips). `toggleChoice` (:87) adds/removes without closing; the ONLY close path is the outside-click handler (:55-64). There is no in-dropdown "Done" and no Escape handler → on mobile the open panel covers the form with no obvious exit. Closing on each select would be WRONG (multi-select — users pick several skills), so the fix is a deliberate close affordance, not close-on-select.
- **Dedup "collected earlier" reads as empty/broken.** The Public Core form repeats wizard-collected identity/demographics (nin/name/dob/gender/lga); `Step4Questionnaire.tsx` auto-fills + hides them via `prefilledQuestionNames` (9-18 Pattern C / 13-23). A section that is all-prefilled would otherwise dead-end on FormRenderer's "No questions available" (:350). **13-29 already added all-prefilled-SECTION auto-skip** (its L1, via `isSectionStepSkippable` + `hideQuestionNames`), so the structural skip exists — but the remaining **banner wording still frames it as "collected earlier"**, which the user reports reads as confusing/empty rather than reassuring.
- **The dedup is load-bearing — do NOT remove it.** The auto-fill copies wizard values into `questionnaireResponses` → `raw_data`, which analytics reads (`raw_data->>'gender'`, `->>'dob'`, etc.; see 13-33 convergence). This story changes *framing*, never the prefill mechanism.

## Acceptance Criteria
1. **AC1 — Skills picker close affordance.** Add a discoverable, sticky **"Done ({n} selected)"** control in the dropdown that closes it, plus **Escape-to-close**; keep the existing outside-click close. Do NOT close on select (multi-select preserved). Keep search **focused after each selection** for fast multi-add. +tests (Done closes, Escape closes, select keeps open + refocuses search).
2. **AC2 — No dead-end in the wizard.** Confirm (and extend if any gap) that a fully-prefilled section — and the whole-questionnaire-all-prefilled case — never lands the user on FormRenderer's "No questions available"; it is skipped to Review (or a clean confirmation). Verified with a wizard-level test (builds on 13-29's `isSectionStepSkippable`; do not duplicate its section logic).
3. **AC3 — Reframe the prefilled banner as positive.** Where some questions are prefilled, the banner reads as a reassuring confirmation — e.g. **"✓ We already have these from your earlier answers — no need to re-enter"** — not a bare/alarming "collected earlier" list or an empty screen. The dedup/prefill mechanism itself is unchanged (load-bearing; 13-33).
4. **AC4 — Accessibility + mobile.** The Done control is reachable and visible on small screens (sticky within the dropdown, not below the fold); dropdown has proper roles/`aria`, Escape works, and focus is managed on open/close. Chips remain keyboard-removable.
5. **AC5 — Green, UX-only.** Full web suite + wizard e2e pass; tsc + eslint clean; **no data-shape change** (skills still stored as `skills_possessed` array; `prefilledQuestionNames` unchanged; `raw_data` keys identical). No API/DB change.

## Tasks / Subtasks
- [ ] **Task 1 (AC1, AC4)** — `ComboboxMultiSelect`: sticky "Done ({n})" button, Escape handler, retain-focus-after-select, a11y roles; unit tests.
- [ ] **Task 2 (AC2)** — Verify the all-prefilled skip covers section + whole-questionnaire; add a wizard-level regression if a gap exists (else document that 13-29 covers it).
- [ ] **Task 3 (AC3)** — Reframe the prefilled banner copy (Step4Questionnaire / FormRenderer) to a positive confirmation; keep prefill logic untouched.
- [ ] **Task 4 (AC5)** — Full web suite + e2e + tsc + eslint; confirm no data-shape drift.

## Dev Notes
- **Skills is multi-select — never close-on-select.** `skills_possessed` is plural (SKILL_TAXONOMY, 150 options). The friction is a missing *deliberate* close, not the stay-open behaviour. Done button + Escape + keep-search-focused is the multi-add-friendly fix. `ComboboxMultiSelect.tsx:55-64` (outside-click) is the only current close.
- **Don't touch the dedup mechanism.** `prefilledQuestionNames` auto-fill feeds `raw_data` that analytics reads (13-33) — this story is *framing only*. Removing/altering the prefill would blank the insights breakdowns.
- **13-29 already did the structural skip.** Its L1 threaded `hideQuestionNames` through `isSectionStepSkippable` so an all-prefilled section auto-skips rather than dead-ending. Verify it also covers the *entire-questionnaire-prefilled* case; only add code if there's a real gap — otherwise this is banner copy + the skills picker.
- **Optional polish (state if descoped):** (a) collapsible sector headers — the component's doc comment claims "collapsible sector headers" but the code renders all groups expanded (`ComboboxMultiSelect.tsx:186-220`), a latent doc/code gap; (b) a "selected N skills" summary in the search header; (c) surface the top/common skills first. Nice-to-have; keep core scope tight.
- **Frontend-only, conversion-path.** Pre-blast-relevant polish; not launch-gating. Independent of 13-33/13-34 (though it sits alongside the same wizard surface).

### References
- [Source: ComboboxMultiSelect.tsx (skills multi-select; :55-64 outside-click-only close; :87 toggleChoice no-close; :186-220 all groups expanded)]
- [Source: Step4Questionnaire.tsx (prefill + prefilledQuestionNames banner, 9-18 Pattern C / 13-23); FormRenderer.tsx:350 "No questions available" dead-end]
- [Source: 13-29 (isSectionStepSkippable + hideQuestionNames all-prefilled-section skip — the structural piece already shipped); 13-33 (dedup is load-bearing raw_data plumbing — framing-only here)]
- [Source: packages/types SKILL_TAXONOMY (150 skills, sector grouping via skillSectorForSlug — 13-22)]

## Dev Agent Record
_(to be completed by the dev)_

### File List
_(to be completed by the dev)_

## PM Validation (to be completed)

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-18 | Story drafted via *create-story. Bundled wizard-frontend UX polish: (1) skills picker gets a deliberate close affordance — sticky "Done ({n})" + Escape, keep multi-select (NOT close-on-select), keep search focus for fast multi-add; (2) reframe the "collected earlier" prefilled-question banner as a positive confirmation and confirm no "No questions available" dead-end remains (13-29 already skips all-prefilled sections). Frontend-only, no data-shape change (dedup prefill is load-bearing raw_data plumbing — framing only). Conversion-path polish, not launch-gating. | Bob (SM) |

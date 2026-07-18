# Story 13-34: Pre-blast form-content corrections — remove the public GPS question + clarify the occupation label

Status: ready-for-dev

<!-- Authored 2026-07-18 by Bob (SM). PRE-BLAST / LAUNCH-RELEVANT (conversion path). Two form-content corrections that share ONE re-upload + re-pin cycle: (1) the pinned Public Core form has a live geopoint question (verified prod: has_geopoint=t) → every public respondent hits a "📍 Capture GPS Location" browser permission prompt mid-registration (conversion killer; value is discarded — the public write path hardcodes gps null); (2) the occupation question is labelled "Main Occupation/Job Title", which conflates occupation with a formal job title and confuses the informal-sector audience. Both are form-content; bundling avoids two re-upload/re-pin cycles before the blast. A small defensive code guard (public wizard never renders geopoint) prevents GPS regressing via a future upload. -->

## Story
As **a member of the public registering through the wizard**,
I want **no surprise GPS permission prompt and a plainly-worded occupation question**,
so that **I complete registration without friction or confusion — protecting conversion on the launch blast.**

## Context & Evidence (verified 2026-07-18)
- **GPS question is LIVE on the pinned form.** `questionnaire_forms` for the pinned `wizard.public_form_id` (`019f48c2…`, "OSLSR Public Core (self-serve)", published) has **`has_geopoint = t`**. `QuestionRenderer.tsx:42 case 'geopoint'` → `GeopointInput`, which calls `navigator.geolocation.getCurrentPosition()` and shows a "📍 Capture GPS Location" button. GPS is **not** in the wizard auto-prefill list, so it renders and **prompts every public respondent**.
- **The captured value is useless on the public path.** Both public write paths hardcode `gpsLatitude/Longitude = null` (`registration.controller.ts:734`, `:1162`), and a geopoint answer only lands in the `raw_data` blob — invisible to the fraud engine (which reads the dedicated columns) and unused by analytics. So it's a permission prompt + privacy cost for zero value. GPS is legitimate only for **enumerator/field** submissions (fraud cluster analysis) — it stays in the master/enumerator form.
- **Occupation label confuses.** Verified label on the pinned form: **"Main Occupation/Job Title"** (and "Years of Experience in Main Occupation"). It welds *occupation* (the kind of work) to *job title* (a formal position) — meaningless for the informal-sector majority; the slash leaves people unsure what to enter. The same label is in the OSLSR master form.
- **Re-pin is mandatory.** Re-uploading an XLSForm mints a NEW form row; `wizard.public_form_id` must be re-pinned to it, and the pin flipped BEFORE any blast (project_public_wizard_form_update). Prior precedent: 13-14/13-19.

## Acceptance Criteria
1. **AC1 — Remove the GPS question from the Public Core form.** The geopoint question is deleted from the Public Core XLSForm. GPS stays in the master/enumerator form (unchanged). Verify the re-uploaded form has **`has_geopoint = f`**.
2. **AC2 — Defensive guard: the public wizard never renders geopoint.** Add a code guard so that in the **public wizard context** a geopoint question is skipped/never rendered even if a future form re-introduces one (belt-and-suspenders against regression; the clerk/enumerator/form-filler contexts still render it). +regression test.
3. **AC3 — Clarify the occupation label (label-only) on BOTH forms.** Change "Main Occupation/Job Title" → **"Main Occupation"** (or equivalently plain, e.g. "What is your main work or trade?") with helper text (e.g. "e.g., tailor, farmer, mechanic, trader") and the Yoruba line, in the **Public Core AND the OSLSR master** forms. **The question `name` (`main_occupation`) MUST NOT change** — only the display `label`/hint — so `raw_data` keys, analytics, exports, and the 13-29 relevance gate are untouched. ("Years of Experience in Main Occupation" may be simplified to "Years of experience in this work" — label-only, name unchanged.)
4. **AC4 — Re-upload + re-pin, verified.** Re-upload the corrected Public Core form → re-pin `wizard.public_form_id` to the new row → confirm `GET /forms/public-active` serves it, `has_geopoint = f`, and the new occupation label renders. Re-upload the OSLSR master form with the label fix. Do the pin flip BEFORE the blast.
5. **AC5 — No data-shape regression.** Confirm `main_occupation` still keys identically in `raw_data` (label-only change); public-insights/export unaffected; GPS removal leaves the null `gps_*` columns as-is.
6. **AC6 — Wizard dry-run before blast.** End-to-end public wizard dry-run: no GPS prompt appears, the occupation question reads clearly, submission persists, occupation lands as `raw_data->>'main_occupation'`. (Fold into the standing pre-blast dry-run.)

## Tasks / Subtasks
- [ ] **Task 1 (AC1, AC3)** — Edit the Public Core XLSForm: delete the geopoint row; relabel `main_occupation` (label/hint only). Edit the OSLSR master XLSForm: relabel `main_occupation` (keep GPS).
- [ ] **Task 2 (AC2)** — Public-wizard geopoint suppression guard + regression test.
- [ ] **Task 3 (AC4)** — Re-upload both forms; re-pin `wizard.public_form_id`; verify `has_geopoint=f` + new label + public-active serves the new row.
- [ ] **Task 4 (AC5/AC6)** — Data-shape check (`main_occupation` key stable); wizard dry-run (no GPS prompt, clear label, correct persistence).

## Dev Notes
- **Mostly an operator/form task + one small code guard.** AC1/AC3 are XLSForm edits (no app code); AC2 is the only code change (public-context geopoint suppression). No DB migration.
- **Label-only, NEVER name.** `main_occupation` is the `raw_data` key that analytics + export + registry-key-normalization read, and the 13-29 `${age}>=15` relevance gate lives on that section. Renaming the question would silently break all of it. Change `label`/`hint`/Yoruba only. Diff the parsed form before/after to prove no `name` drift.
- **Re-pin is the easy-to-forget step.** Re-upload mints a new form row; the wizard keeps serving the OLD pinned form until `wizard.public_form_id` is repointed. Flip the pin, then verify `/forms/public-active` returns the new row (has_geopoint=f, new label) BEFORE the blast. See project_public_wizard_form_update.
- **GPS stays where it belongs.** Only the Public Core form loses geopoint; the master/enumerator form keeps it (field GPS feeds fraud clustering). The AC2 guard is scoped to the public wizard context only.
- **Pairs with 13-33.** The density map uses the LGA answer, not GPS — removing the public GPS question does not affect any map/analytics (ties to the 13-33 convergence work: geography is respondent `lga_id`, never coordinates).
- **Sits under 13-33 conceptually but is independent to ship** — it's form-content + a guard, no dependency on the convergence read. Safe to do first, pre-blast.

### References
- [Source: prod — pinned form 019f48c2… "OSLSR Public Core (self-serve)" has_geopoint=t; label "Main Occupation/Job Title"]
- [Source: QuestionRenderer.tsx:42 (geopoint→GeopointInput); GeopointInput.tsx (navigator.geolocation prompt); registration.controller.ts:734,:1162 (public path hardcodes gps null)]
- [Source: wizard-provided-field-names.ts — GPS is NOT auto-prefilled, so a geopoint question renders + prompts]
- [Source: project_public_wizard_form_update (mandatory re-pin); 13-14/13-19 precedent; 13-29 (main_occupation relevance gate — do not rename)]

## Dev Agent Record
_(to be completed by the dev)_

### File List
_(to be completed by the dev)_

## PM Validation (John, 2026-07-18)

**Validated — approved. PRE-BLAST / LAUNCH-RELEVANT — the only one of this batch on the launch path.**
1. **Priority:** do BEFORE the blast. The live GPS prompt is a conversion tax on every public registration (a permission dialog mid-signup) for a value that's discarded. Batch the re-upload+re-pin with any other pending form change (one publish cycle), per the 13-19/13-20 pattern.
2. **Guardrail (critical):** label-ONLY on `main_occupation` — never the question name (it's the raw_data key + the 13-29 relevance gate). Correctly stated; enforce with a before/after parsed-form name diff.
3. **AC2 defensive guard** (public wizard never renders geopoint) is the right belt-and-suspenders against a future re-upload reintroducing it — approve.
4. Mostly operator/form work + one code guard; low blast radius.

**No AC changes.** Dev-ready; PRE-BLAST — pin the corrected form before the send.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-18 | Story drafted via *create-story. Pre-blast form-content bundle (one re-upload/re-pin cycle): remove the live public GPS/geopoint question (conversion-killing permission prompt for a value the public path discards) + relabel "Main Occupation/Job Title" → plain "Main Occupation" (label-only, name unchanged) on Public Core + OSLSR forms, + a defensive public-wizard geopoint-suppression guard against regression. LAUNCH-RELEVANT (conversion path); pin the corrected form before the blast. | Bob (SM) |

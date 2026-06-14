# Runbook — Re-migrate / re-upload / re-pin after Story 9-55 (minor age-gate + guardian consent)

**Status:** required before launch (and before any Cohort blast that exercises the public wizard)
**Owner:** operator (Awwal)
**Related:** Story 9-55, Story 9-54 (`docs/runbooks/forms-engine-fidelity-repin-9-54.md`), `project_public_wizard_form_update.md` (memory), `docs/runbooks/pre-viral-push-checklist.md`

## Why this is needed

Story 9-55 adds a conditional **`grp_guardian`** group to the master XLSForm,
gated `relevant = ${age} < 15`, containing `guardian_name`,
`guardian_relationship` (choice list `guardian_rel_list`), `guardian_phone`,
`guardian_consent`, `is_supervised_apprentice`, and an optional
`apprenticeship_details`. The group rides the Story 9-54 engine
(`calculate` `age` + group-level `relevant` → `section.showWhen`), so it surfaces
**uniformly** across the wizard / enumerator (`FormFillerPage`) / clerk
(`ClerkDataEntryPage`) / supervisor channels with no per-channel code.

The group lives in the **master `.xlsx` source** (committed:
`test-fixtures/oslsr_master_v3.xlsx`). The form pinned in production
(`wizard.public_form_id`) was migrated before this change, so its stored
`form_schema` JSONB has **no `grp_guardian` / no `age < 15` `sectionShowWhen`**.
Code alone does not retro-fix already-migrated rows — the pinned form must be
**re-migrated → re-uploaded → re-pinned** for the guardian group to reach prod.

> **Server enforcement is live regardless of the pin.** The synchronous submit
> gate (`MINOR_GUARDIAN_CONSENT_REQUIRED`, 422) keys on the server-recomputed
> `age` and is enforced in `submitWizard` + `submitForm`. But until re-pin, the
> guardian QUESTIONS are not rendered to under-15 registrants, so they cannot
> supply consent and would be blocked. **Re-pin is MANDATORY for the
> capture-don't-exclude flow to function.**

## Steps

1. **Confirm the master XLSForm source** (`test-fixtures/oslsr_master_v3.xlsx`)
   carries the guardian group:
   - a `begin_group` `grp_guardian` with `relevant = ${age} < 15`;
   - `guardian_name` (text, required), `guardian_relationship`
     (`select_one guardian_rel_list`, required), `guardian_phone` (text, required,
     Nigerian-mobile constraint), `guardian_consent` (`select_one yes_no`, required),
     `is_supervised_apprentice` (`select_one yes_no`, required),
     `apprenticeship_details` (text, optional, `relevant = ${is_supervised_apprentice} = 'yes'`);
   - a `guardian_rel_list` choices block (`parent` / `legal_guardian` / `other`).
   - (Inherited from 9-54: the `age` calculate row + the `grp_labor` `${age} >= 15` gate.)
2. **Re-upload the master `.xlsx`** via Questionnaire Management. Each upload mints
   a NEW `questionnaire_forms` row (`status: 'draft'`, version auto-increments).
   A byte-identical file is rejected (409 duplicate-hash) — make a trivial edit if so.
3. **Publish** the new draft. The 9-54 publish-time validator runs; fix any
   blocking errors in the source, acknowledge warnings.
4. **Re-pin** `wizard.public_form_id` to the NEW row PK via Settings.
   **The pin never auto-follows a re-upload** — this step is MANDATORY.
5. **Verify in prod** (over Tailscale / via the public wizard):
   - the served render schema (`GET /api/v1/forms/public-active`) includes a
     `grp_guardian` section with `sectionShowWhen { field: 'age', operator:
     'less_than', value: 15 }` and the guardian questions;
   - a registrant whose `dob` makes them ≥15 does NOT see the guardian section
     (and DOES see the labour section);
   - a registrant whose `dob` makes them <15 sees the guardian section, does NOT
     see the labour section, and cannot submit without affirmative guardian
     consent + the apprenticeship attestation;
   - on a successful under-15 submission, `respondents.metadata.guardian` is
     populated and an audit row `minor.guardian_consent_captured` exists.
6. **Then** proceed to any Cohort blast / launch gate.

## Rollback

Re-pin `wizard.public_form_id` back to the previous row PK. Old versions are not
auto-retired, so the prior schema is still present and publishable. (The server
minor-gate stays active; with the prior schema it is simply never triggered
because no `age` is computed and no guardian group renders.)

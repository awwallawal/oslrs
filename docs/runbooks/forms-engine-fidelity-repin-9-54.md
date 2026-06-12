# Runbook — Re-migrate / re-upload / re-pin after Story 9-54 (forms-engine fidelity)

**Status:** required before launch (and before any Cohort blast that exercises the public wizard)
**Owner:** operator (Awwal)
**Related:** Story 9-54 (AC2.5), `project_public_wizard_form_update.md` (memory), `docs/runbooks/pre-viral-push-checklist.md`

## Why this is needed

Story 9-54 fixes two **migration-time** fidelity defects in the XLSForm → native
converter:

1. **`calculate` fields are now retained** (`schema.calculations`) and evaluated at
   render + submit (e.g. `age = int((today() - ${dob}) div 365.25)`).
2. **Group-level `relevant` is now migrated** to `section.showWhen` (e.g.
   `grp_identity` gated on `${consent_basic} = 'yes'`, `grp_labor` on `${age} >= 15`).

These fixes change what the converter EMITS. The form currently pinned in
production (`wizard.public_form_id`) was migrated by the OLD converter, so its
stored `form_schema` JSONB has **no `calculations` and no `sectionShowWhen`**.
Code alone does not retro-fix already-migrated rows — the pinned form must be
**re-migrated → re-uploaded → re-pinned** for the fixes to take effect in prod.

> Verified pre-fix (2026-06-12): pinned form `oslsr_master_v3` (`form_schema`
> version `2026012601`, row `019ccc89-bcba-7b7a-8157-763897caa988`) — `age` absent,
> no `sectionShowWhen`. Until re-pin, identity questions render regardless of
> basic-consent and there is no age gating.

## Steps

1. **Confirm the master XLSForm source** carries the intended logic:
   - a `calculate` row named `age` with `calculation = int((today() - ${dob}) div 365.25)`;
   - `begin_group` rows for the consent-gated identity group and the age-gated
     labour group, each with a `relevant` column.
2. **Re-upload the master `.xlsx`** via Questionnaire Management. Each upload mints
   a NEW `questionnaire_forms` row (new PK, `status: 'draft'`, version auto-increments).
   A byte-identical file is rejected (409 duplicate-hash) — make a trivial edit if so.
3. **Publish** the new draft. The publish-time validator (AC3) runs:
   - **blocking errors** (e.g. an unsupported `calculate` token) must be fixed in
     the source and re-uploaded;
   - **warnings** (e.g. a wizard-deduped choice question missing a value) are
     acknowledged — they don't block, but fix them to enable dedup.
4. **Re-pin** `wizard.public_form_id` to the NEW row PK via Settings.
   **The pin never auto-follows a re-upload** — this step is MANDATORY.
5. **Verify in prod** (over Tailscale / via the public wizard):
   - the served render schema (`GET /api/v1/forms/public-active`) includes
     `calculations` (with `age`) and `sectionShowWhen` for the two groups;
   - identity questions are hidden until basic-consent = yes;
   - a respondent with `dob` making them <15 does not see the labour section.
6. **Then** proceed to any Cohort blast / launch gate.

## Rollback

Re-pin `wizard.public_form_id` back to the previous row PK. Old versions are not
auto-retired, so the prior schema is still present and publishable.

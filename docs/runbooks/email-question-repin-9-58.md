# Runbook — Re-migrate / re-upload / re-pin after Story 9-58 (optional email question)

**Status:** required before the proactive enumerator/clerk confirmation email can fire, and before any Cohort blast that relies on email reachability for field-registered respondents
**Owner:** operator (Awwal)
**Related:** Story 9-58, `docs/runbooks/minor-age-gate-guardian-consent-repin-9-55.md`, `docs/runbooks/forms-engine-fidelity-repin-9-54.md`, `project_public_wizard_form_update.md` (memory), `docs/runbooks/reference-code-backfill.md`

## Why this is needed

Story 9-58's "auto-email if address on file" path (the ingestion worker emails an
enumerator/clerk-registered respondent their reference code + status) reads
`submissions.raw_data->>'email'`. The master XLSForm previously captured **phone
only** (`phone_number`) — **no email question** — so the auto-email had no address
to use and the public `/check-registration` email lookup could not match a
field-registered respondent.

Story 9-58 adds an **optional `email`** question (`text`, not required) to
`grp_identity`, immediately after `phone_number`, in the master source
(`test-fixtures/oslsr_master_v3.xlsx`; settings `version` bumped
`2026012601 → 2026061501`). A pre-change backup is kept at
`test-fixtures/oslsr_master_v3.pre-email.bak.xlsx`.

The form pinned in production (`wizard.public_form_id`) was migrated before this
change, so its stored `form_schema` JSONB has **no `email` question**. Code alone
does not retro-fix already-migrated rows — the pinned form must be
**re-migrated → re-uploaded → re-pinned** for the email field to reach the
enumerator/clerk/wizard render and for answers to land in `raw_data.email`.

> **No server enforcement depends on this.** Email is optional; nothing is gated
> on it. Until re-pin, field respondents simply have no email captured, so the
> proactive confirmation email stays dormant (by design — "if address on file")
> and they receive their reference on-screen (clerk modal / enumerator screen).

## Steps

1. **Confirm the master XLSForm source** (`test-fixtures/oslsr_master_v3.xlsx`)
   carries, in `grp_identity`, a `text` question named **`email`** labelled
   "Email Address (optional)" with **required blank** (optional), placed after
   `phone_number`. (Inherited: the 9-54 engine + the 9-55 guardian group.)
2. **Re-upload the master `.xlsx`** via Questionnaire Management. Each upload mints
   a NEW `questionnaire_forms` row (`status: 'draft'`, version auto-increments).
   A byte-identical file is rejected (409 duplicate-hash) — the version bump above
   already makes it distinct.
3. **Publish** the new draft. The 9-54 publish-time validator runs; fix any
   blocking errors, acknowledge warnings.
4. **Re-pin** `wizard.public_form_id` to the NEW row PK via Settings.
   **The pin never auto-follows a re-upload** — this step is MANDATORY.
5. **Verify in prod** (over Tailscale / via the surfaces):
   - the served render schema (`GET /api/v1/forms/public-active`) includes the
     `email` question in the identity section;
   - an enumerator/clerk submission that fills `email` lands it at
     `submissions.raw_data->>'email'`;
   - the proactive confirmation email is sent (check pino
     `registration_confirmation.*` events / Resend) and carries the reference
     code + `/check-registration` link (no magic-link);
   - a field-registered respondent can now be found by email on the staff
     registry search and on the public `/check-registration` page.
6. **Sequencing:** re-pin can happen alongside the 9-55 re-pin (same upload cycle).
   Run the Story 9-58 reference-code backfill (`docs/runbooks/reference-code-backfill.md`)
   independently of this — codes exist regardless of the email field.

## Rollback

Re-pin `wizard.public_form_id` back to the previous row PK (no email question).
Restore the source from `test-fixtures/oslsr_master_v3.pre-email.bak.xlsx` if the
master edit must be reverted. The auto-email simply returns to dormant.

# Story 9.55: Minor Age-Gate (floor 15 + ILO Art.6 apprenticeship carve-out) + Guardian Consent

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-12 by Bob (SM) via canonical *create-story --yolo. LAUNCH-GATING (child-safeguarding + NDPA). DEPENDS-ON 9-54. -->

## Story

As an **NDPA-compliant data controller responsible for child safeguarding**,
I want a **floor-15 age gate that captures verifiable guardian consent (and an ILO Art.6 apprenticeship attestation) for under-15 registrants instead of blocking them**, surfaced uniformly across every data-entry channel and enforced server-side,
so that **the registry meets its child-labour and NDPA guardian-consent obligations without wrongly excluding legitimate young apprentices learning a trade**.

## Context & Why This Gates Launch

The registry collects labour-force and skills data from the public. Without an age gate, a child under the ILO general minimum working age (15) can be registered as a worker with no guardian involvement — a child-safeguarding and **NDPA (Nigeria Data Protection Act) consent** failure (a minor cannot give valid data-processing consent; a guardian must). Story 9-18 **neutralised an interim ≥16 Step-1 hard block** (it wrongly barred 15-year-old apprentices before any guardian path existed, and prod has no age gate today). **This story is the real gate that replaces it.**

The policy decision (Awwal, 2026-06-10, "Option A"): **floor 15 (ILO general minimum working age) WITH the ILO Convention 138 Art.6 apprenticeship carve-out** — a supervised under-15 apprentice learning a skill is *not* child labour. So the design is **capture-don't-exclude**: an under-15 registrant is routed to a guardian-consent + apprenticeship-attestation path, not rejected.

**HARD dependency on Story 9-54.** This story cannot function until 9-54 lands:
- It needs **9-54 AC1** (runtime `calculate`/`age` evaluation) — the gate keys on computed `age` from `dob`, which does not compute today.
- It needs **9-54 AC2** (group-level `relevant` → `sectionShowWhen` migration) — the guardian group is expressed as `relevant=${age}<15`, which is dropped at migration today.
- It reuses **9-54 AC5** (the shared server-side submit-time validation seam in `submitWizard`/`submitForm` before queueing) — the minor rule plugs into the same synchronous gate, NOT into the async `submission-processing.service.ts` (that runs post-HTTP-200, too late to reject).

Do NOT start this story until 9-54 AC1 + AC2 + AC5 are implemented and green.

## Acceptance Criteria

### AC1 — Conditional guardian group in the master form (uniform across channels)
1. The master XLSForm gains a conditional group `relevant=${age} < 15` containing at minimum: `guardian_name` (text, required-in-group), `guardian_relationship` (select_one: parent/legal_guardian/other), `guardian_phone` (text, Nigerian-mobile constraint), `guardian_consent` (select_one yes_no, required), and an apprenticeship attestation field (`is_supervised_apprentice` select_one yes_no + optional `apprenticeship_details`).
2. Because the form is the single source rendered by wizard / enumerator (`FormFillerPage`) / clerk (`ClerkDataEntryPage`) / supervisor, the guardian group surfaces **uniformly across all four channels** with no per-channel code — it rides the 9-54 `sectionShowWhen`/`relevant` engine.
3. The group is hidden (and its fields not required) for `age >= 15`; shown and its fields required for `age < 15`. Evaluation uses the 9-54 computed `age` (authoritative server value at submit).
4. Wizard surface: the guardian group renders as its own section step (Part-E section-as-step) only when `age < 15`, and is auto-skipped otherwise (AC#E5 path) — no empty/stuck step for the common case.

### AC2 — ILO Art.6 apprenticeship carve-out (capture-don't-exclude)
1. An under-15 registrant is NEVER hard-blocked from registering. The gate routes to the guardian + apprenticeship path; a completed guardian-consent + apprenticeship attestation permits the submission.
2. Copy/labels make the carve-out explicit and non-stigmatising (a supervised apprentice learning a skill is legitimate); wording reviewed for child-safeguarding tone.
3. The interim ≥16 Step-1 block (neutralised in 9-18) is NOT reintroduced — Step-1 `dob` simply feeds the computed age; the gate lives in the questionnaire group + the server rule, not a Step-1 hard stop.

### AC3 — Server-side minor rule, enforced synchronously at submit
1. A shared rule keyed on `dob` (→ computed `age` via 9-54 AC1) enforces: if `age < 15`, then `guardian_name` + `guardian_relationship` + `guardian_phone` + `guardian_consent = 'yes'` + the apprenticeship attestation are all present/valid; otherwise reject.
2. Enforced **synchronously** in BOTH `submitWizard` (`registration.controller.ts`) and `submitForm` (`form.controller.ts`), BEFORE queueing for ingestion — reusing the 9-54 AC5 validation seam. NOT in `submission-processing.service.ts` (post-HTTP-200).
3. Rejection uses a structured `AppError` (`MINOR_GUARDIAN_CONSENT_REQUIRED`, 422) naming what is missing; a valid adult or a valid guardian-consented minor submission passes unchanged.
4. The rule lives in shared code (`packages/utils`/`packages/types`) so client (Step-5 completeness guard from 9-54 AC6) and server share one definition; the server value of `age` (recomputed from `dob`) is authoritative — a client cannot forge age to dodge the gate.

### AC4 — Guardian data persistence
1. `guardian_name` / `guardian_relationship` / `guardian_phone` / `guardian_consent` / apprenticeship fields are added to `RESPONDENT_FIELD_MAP` (`submission-processing.service.ts:33`) so they extract from `rawData` on ingestion.
2. Storage decision documented and implemented: persist guardian fields to `respondents.metadata` (JSON; no schema migration, consistent with the existing `metadata` usage e.g. `defer_reason_nin`) OR dedicated columns — **default recommendation: `metadata.guardian` object** to avoid schema churn, unless the dev agent finds a reporting need for columns. Guardian PII is captured only when `age < 15` (data minimisation, AC6).
3. No regression to existing identity extraction; guardian fields never overwrite respondent identity fields.

### AC5 — NDPA evidentiary audit trail
1. A new audit action `MINOR_GUARDIAN_CONSENT_CAPTURED` is added to the audit action types (`audit.service.ts`, Story 6-1 AC7 set) and written via the hash-chain `log`/`logTx` pattern **within the submit transaction** (`db.transaction()`), using a canonical `targetResource` (per the 9-33 F1 unification — SINGULAR canonical value).
2. The audit row records the consenting guardian (name/relationship/phone), the apprenticeship-attestation flag, the respondent reference, and timestamp — sufficient as an NDPA consent record. No raw child PII beyond what the respondent row already holds.
3. Audit write failure is logged (`audit.*_failed`) but follows the established criticality pattern for the path (consistent with `logPiiAccessTx` vs best-effort `log` usage already in `audit.service.ts`).

### AC6 — NDPA compliance + child safeguarding
1. **Data minimisation:** guardian PII is requested/stored ONLY when `age < 15` (the `relevant` gate enforces this in the form; the server rule enforces it on persistence).
2. Consent wording for `guardian_consent` is NDPA-appropriate (purpose, controller, withdrawal) and child-safeguarding-reviewed.
3. Retention/withdrawal: guardian consent is part of the respondent record and is covered by the existing respondent withdrawal/erasure path (verify the withdrawal flow also clears `metadata.guardian`).

### AC7 — Tests + operator step
1. Unit tests for the shared minor rule: `age < 15` requires guardian path; `age >= 15` unaffected; supervised-apprentice carve-out does not exclude; server rejects incomplete minor submission; computed-age cannot be forged.
2. Integration tests proving uniformity: the guardian group gates correctly in the wizard section-step AND in the form-filler/clerk render; an incomplete minor submission is rejected at `submitWizard` AND `submitForm`; an audit row is written on a successful minor submission.
3. **Operator/content step documented:** master xlsx update → re-migrate → re-upload → re-pin `wizard.public_form_id` (same publish→re-pin runbook as 9-54). Without re-pin, the guardian group never reaches production.
4. Full `pnpm test` green; tsc + lint clean; flip `sprint-status.yaml` 9-55 → review at close (same commit).

## Tasks / Subtasks

- [ ] **Task 1 — Master form: guardian group (AC1, AC2)** *(blocked on 9-54 AC1+AC2)*
  - [ ] Add `relevant=${age}<15` group with guardian_name/relationship/phone/consent + apprenticeship attestation to the master XLSForm (`test-fixtures/oslsr_master_v3.xlsx`).
  - [ ] Verify it migrates to `sectionShowWhen` (9-54 AC2) and computes `age` (9-54 AC1); guardian group gates on computed age.
  - [ ] Child-safeguarding copy review for the carve-out + consent wording.
- [ ] **Task 2 — Shared minor rule (AC3, AC4 storage decision)**
  - [ ] Implement the `dob`→`age`<15 guardian-required rule in shared `packages/utils`/`packages/types` (reuse 9-54 calculate eval + AC5 completeness seam).
  - [ ] Enforce synchronously in `submitWizard` + `submitForm` before queueing; `AppError('MINOR_GUARDIAN_CONSENT_REQUIRED', …, 422)`.
- [ ] **Task 3 — Persistence (AC4)**
  - [ ] Add guardian fields to `RESPONDENT_FIELD_MAP`; persist to `respondents.metadata.guardian` (default) — document the choice; ensure no identity-field regression.
- [ ] **Task 4 — Audit trail (AC5)**
  - [ ] Add `MINOR_GUARDIAN_CONSENT_CAPTURED` action; write via hash-chain `logTx` inside the submit transaction with canonical singular `targetResource`.
- [ ] **Task 5 — NDPA/safeguarding (AC6)**
  - [ ] Data-minimisation guard (capture guardian PII only when age<15); verify withdrawal/erasure clears `metadata.guardian`.
- [ ] **Task 6 — Client completeness surface (AC3.4)**
  - [ ] Extend the 9-54 AC6 Step-5 completeness guard to include the minor rule (disable Submit + point to the guardian section when age<15 and guardian fields missing).
- [ ] **Task 7 — Tests + operator step + parity (AC7)**
  - [ ] Unit + integration tests (rule, uniformity across channels, audit write, forge-resistance).
  - [ ] Document re-migrate→re-upload→re-pin; full `pnpm test` green; flip sprint-status 9-55 → review at close.

## Dev Notes

### Architecture & seam map (cite these exact targets)
- **Computed age + group-relevance (from 9-54):** the guardian gate depends on 9-54's calculate evaluator (`packages/utils/src/xlsform-calculate.ts` or equivalent) and the group-relevance migration in `xlsform-to-native-converter.ts` (`extractSections`). Do NOT reimplement these here — consume them.
- **Server submit seam (reuse 9-54 AC5):** `submitWizard` `apps/api/src/controllers/registration.controller.ts:481` (`submitWizardSchema:81`); `submitForm` `apps/api/src/controllers/form.controller.ts`. The minor rule runs in the SAME synchronous pre-queue gate. Async ingestion `apps/api/src/services/submission-processing.service.ts` is too late (post-HTTP-200).
- **Respondent field map / persistence:** `submission-processing.service.ts:33-55` (`RESPONDENT_FIELD_MAP`), `extractRespondentData` (209-216, 364-375). `dob`/`date_of_birth` already map to `dateOfBirth` (lines 45-46). `respondents.metadata` already carries JSON (e.g. `{"defer_reason_nin":…}` — observed on the pending-NIN respondent).
- **Audit:** `apps/api/src/services/audit.service.ts` — action types (line 34, Story 6-1 AC7), canonical `targetResource` (line 117, Story 9-33 F1 — SINGULAR canonical), hash-chain `computeHash` (185) + `logPiiAccessTx`/transactional `logTx` (246-310). New action joins the existing set; write inside `db.transaction()`.
- **Render channels (uniformity):** wizard `Step4Questionnaire.tsx` (section-step) / `WizardPage.tsx`; `apps/web/src/features/forms/pages/FormFillerPage.tsx` (enumerator) + `ClerkDataEntryPage.tsx` (clerk). All mount `FormRenderer` over the same pinned schema → one form change covers all.
- **Step-5 completeness guard (extend 9-54 AC6):** `apps/web/src/features/registration/pages/Step5ReviewAndSave.tsx` / `WizardPage.tsx`.

### Critical implementation rules (project-context.md)
- **Shared Zod schema client+server** (§7) — the minor rule is ONE shared definition.
- **AppError only** (§3): `MINOR_GUARDIAN_CONSENT_REQUIRED`, 422.
- **Structured Pino** (§5): `submission.minor_consent_required`, `audit.minor_guardian_consent_captured`.
- **No `Date.now()`** in age computation/tests — inject a clock (the 9-54 evaluator already does; reuse it). Age must be deterministic + server-authoritative.
- **UUIDv7** for any new IDs; **snake_case DB / camelCase API**; backend tests in `__tests__/`.
- **Audit `targetResource` SINGULAR canonical** (memory: audit-target-unification, 9-33→9-34) — do not introduce a plural/variant literal.

### Policy notes (for the dev + reviewer)
- Floor = **15** (ILO C138 general minimum working age). Under-15 → guardian path, NOT rejection.
- **ILO C138 Art.6 carve-out:** work done by under-15s in a supervised apprenticeship/vocational-training context is excluded from the minimum-age prohibition → capture attestation + guardian consent rather than exclude.
- **NDPA:** a minor cannot give valid processing consent; guardian consent is the lawful basis. Capture only when age<15 (minimisation) and record it auditably (AC5).

### Project Structure Notes
- Shared rule → `packages/utils`/`packages/types` (consumed by both apps + the 9-54 server gate).
- No new DB migration if guardian data lands in `respondents.metadata` (recommended). If the dev agent elects dedicated columns, that IS a Drizzle migration (`apps/api/src/db/schema/`) — flag it and keep schema files free of `@oslsr/types` imports (memory key pattern).
- This is a **content + code** story: the master xlsx change is an operator/content step, and the form must be re-pinned in prod or the gate is invisible.

### Dependencies & sequencing
- **HARD deps:** 9-54 (AC1 age compute, AC2 group-relevance, AC5 server submit seam), 9-18 (Step-1 `dob`, section-as-step, neutralised ≥16 block), 6-1 (audit hash chain).
- Both 9-54 and 9-55 are **launch-gating** (roadmap Phase 1 🚦). 9-55 is the last of the pair.

### References
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#9-55-minor-age-gate-and-guardian-consent] — placeholder scope
- [Source: _bmad-output/implementation-artifacts/9-54-forms-engine-fidelity.md] — hard dependency (age compute + group-relevance + server submit seam)
- [Source: docs/roadmap-to-launch.md#Phase-1] — launch-gating sequencing
- [Source: apps/api/src/services/submission-processing.service.ts:33-55,209-216] — RESPONDENT_FIELD_MAP, dob→dateOfBirth, extraction
- [Source: apps/api/src/services/audit.service.ts:34,117,185-310] — action types, canonical targetResource, hash-chain log
- [Source: apps/api/src/controllers/registration.controller.ts:81,481] — submitWizard gate
- [Source: _bmad-output/project-context.md] — shared-Zod, AppError, Pino, UUIDv7, audit-target rules
- [Source: 9-18 Dev Notes "Forms-engine fidelity & minor age-gate"] — origin analysis + the neutralised interim ≥16 block

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

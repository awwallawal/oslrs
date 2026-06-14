# Story 9.55: Minor Age-Gate (floor 15 + ILO Art.6 apprenticeship carve-out) + Guardian Consent

Status: done

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

- [x] **Task 1 — Master form: guardian group (AC1, AC2)** *(blocked on 9-54 AC1+AC2 — both merged via 2cd6a39)*
  - [x] Add `relevant=${age}<15` group with guardian_name/relationship/phone/consent + apprenticeship attestation to the master XLSForm (`test-fixtures/oslsr_master_v3.xlsx`).
  - [x] Verify it migrates to `sectionShowWhen` (9-54 AC2) and computes `age` (9-54 AC1); guardian group gates on computed age. *(verified against the real binary via the actual parser+converter + a permanent converter regression test)*
  - [x] Child-safeguarding copy review for the carve-out + consent wording. *(non-stigmatising apprentice framing + NDPA consent wording with withdrawal)*
- [x] **Task 2 — Shared minor rule (AC3, AC4 storage decision)**
  - [x] Implement the `dob`→`age`<15 guardian-required rule in shared `packages/utils` (`minor-guardian.ts`; pure, consumes the 9-54 computed `age`).
  - [x] Enforce synchronously in `submitWizard` + `submitForm` before queueing; `AppError('MINOR_GUARDIAN_CONSENT_REQUIRED', …, 422)`.
- [x] **Task 3 — Persistence (AC4)**
  - [x] Persist to `respondents.metadata.guardian` (documented; guardian extracted via the shared rule rather than `RESPONDENT_FIELD_MAP` since it is a nested object, not a flat column — see Completion Notes); no identity-field regression.
- [x] **Task 4 — Audit trail (AC5)**
  - [x] Add `MINOR_GUARDIAN_CONSENT_CAPTURED` action; write via hash-chain `logActionTx` inside the wizard submit transaction (fire-and-forget on the async path) with canonical singular `targetResource`.
- [x] **Task 5 — NDPA/safeguarding (AC6)**
  - [x] Data-minimisation guard (capture guardian PII only when age<15); verified all metadata-update paths preserve `metadata.guardian` and row-level erasure clears it.
- [x] **Task 6 — Client completeness surface (AC3.4)**
  - [x] Extend the 9-54 AC6 Step-5 completeness guard to include the minor rule (disable Submit + point to the guardian section when age<15 and guardian fields missing).
- [x] **Task 7 — Tests + operator step + parity (AC7)**
  - [x] Unit + integration tests (rule, uniformity across channels, audit write, forge-resistance).
  - [x] Document re-migrate→re-upload→re-pin (`docs/runbooks/minor-age-gate-guardian-consent-repin-9-55.md`); full suites green; flip sprint-status 9-55 → review at close.

### Review Follow-ups (AI) — code-review 2026-06-14 (Awwal)

Adversarial senior-dev review found 0 Critical, 3 Medium, 3 Low. Per Awwal's
disposition, all actionable findings were FIXED in the same pass (not just logged).

- [x] **[AI-Review][Med] M1 — race-resolution merge dropped guardian consent + audit.** `tryRaceResolutionMerge` returned before the insert, so an under-15 enumerator/clerk submission whose NIN-completion promotes an existing pending row persisted neither `metadata.guardian` nor the `MINOR_GUARDIAN_CONSENT_CAPTURED` audit. **Fixed:** merge now folds guardian into the row metadata via JSONB `||` in the same atomic UPDATE + writes the consent audit on the promote path. New test `writes MINOR_GUARDIAN_CONSENT_CAPTURED on the merge path`. [submission-processing.service.ts:483-493, 611-672]
- [x] **[AI-Review][Med] M2 — async consent audit was silent fire-and-forget (AC5.3 gap).** A failed audit on the enumerator/clerk path left a persisted under-15 respondent with NO NDPA consent record, and the failure was swallowed. **Fixed:** extracted `writeGuardianConsentAudit` — the evidentiary audit is now AWAITED and a failure emits `audit.minor_guardian_consent_captured_failed` (error level) per AC5.3's criticality pattern, without rolling back the INSERT. New test `does not throw / does not lose the respondent when the consent audit fails`. (Full transactional wrapping of the worker insert stays reserved to the synchronous wizard path.) [submission-processing.service.ts:556-594]
- [x] **[AI-Review][Med] M3 — no automated guard that the SHIPPED master binary carries `grp_guardian`.** The converter regression used a synthetic survey; a future master re-export dropping the group would pass every test while silently disabling the form-level gate. **Fixed:** new test parses the real `test-fixtures/oslsr_master_v3.xlsx` via `XlsformParserService.parseXlsxFile` + `convertToNativeForm` and asserts the age<15 guardian section + its fields. [xlsform-to-native-converter.test.ts]
- [x] **[AI-Review][Low] L2 — bcrypt test-downcost is security-adjacent.** Correctly gated, but the prod-safety invariant was implicit. **Fixed:** documented the deploy-safety guard (never set `NODE_ENV=test`/`VITEST` in prod; `pm2 env` spot-check) in the bcrypt follow-up doc. [docs/follow-ups/2026-06-14-test-bcrypt-cost-downcost.md]
- [~] **[AI-Review][Low] L1 — guardian not in `RESPONDENT_FIELD_MAP` (AC4.1 literal deviation).** ACCEPTED as-is — nested `metadata.guardian` object is AC4.2's recommended default, not a flat column; already documented in Completion Notes. No change.
- [~] **[AI-Review][Low] L3 — rule is evaluated at two sites (wizard inline vs worker re-extract).** ACCEPTED — consistent today (same `rawData`), shared single rule definition; noted as a latent divergence point only. No change.

**Post-review push hardening (2026-06-14)** — the push of the review commit (`bbf8eb2`) failed the `.husky/pre-push` gate on a 95-min web run that reported 0 assertion errors (all `Failed to start threads worker` / timeouts). Root-caused as intra-package vitest worker oversubscription: `--concurrency=1` (9-54) serializes packages but the web pool still spawns one worker per core, which starves under a concurrent `pnpm test` + laptop sleep/resume. **Fixed (separate `fix(test-infra)` commit, not 9-55 feature scope):** env-driven `VITEST_MAX_THREADS` cap — `vitest.base.ts` → `maxWorkers`; `.husky/pre-push` exports `=2`; `turbo.json test.env` lists the var. Same web suite then ran **238 files / 2595 pass / 0 fail in 6.2 min**, deterministic. Documented as Pitfall #37 root cause #1b. CI untouched (full parallelism on dedicated runners). Does not fix the WizardPage dual-source design hazard — that remains Story 9-57.

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

claude-opus-4-8[1m] (dev-story workflow, 2026-06-14)

### Debug Log References

- `pnpm --filter @oslsr/utils test` — 116 passed (was 104; +12 minor-guardian).
- `pnpm vitest run` (targeted) — registration.routes 38, form.controller (submitForm) + submission-processing, form-submission-validation.service, xlsform-to-native-converter, audit.service — all green.
- `tsc --noEmit` — api + utils + web all clean (exit 0).
- `eslint src` (api) + `eslint src e2e` (web) — clean (exit 0).
- Master-form migration verified against the REAL binary (`test-fixtures/oslsr_master_v3.xlsx`) via the actual `XlsformParserService.parseXlsxFile` + `convertToNativeForm`: `grp_guardian` → `sectionShowWhen { field: 'age', operator: 'less_than', value: 15 }`; guardian questions required; `apprenticeship_details` gated on `is_supervised_apprentice = 'yes'`.

### Completion Notes List

- **Dependency reality check:** 9-54 is `review` in sprint-status but its code is MERGED (commit `2cd6a39`) — all required seams (AC1 `xlsform-calculate`, AC2 group-relevance migration, AC5 `form-submission-validation.service` gate in both controllers) exist in the tree. Verified before building. Story was genuinely startable.
- **AC1 (guardian group):** added `grp_guardian` (`relevant=${age} < 15`) to the master XLSForm (`guardian_name`/`guardian_relationship`/`guardian_phone`/`guardian_consent`/`is_supervised_apprentice` required + optional `apprenticeship_details` gated on the attestation) + a `guardian_rel_list` choice list (parent/legal_guardian/other). It rides the 9-54 engine, so it surfaces uniformly across wizard/enumerator/clerk/supervisor with NO per-channel code. The binary `.xlsx` was edited via SheetJS (same library the parser uses) and round-trip-verified through the real converter.
- **AC2:** verified `grp_guardian` migrates to a section `showWhen` (`less_than` 15) — both against the real binary AND as a permanent regression in `xlsform-to-native-converter.test.ts`. `less_than` evaluates numerically and returns false for unknown age, so the group auto-hides for adults / unknown-age (data minimisation).
- **AC3 (server rule, synchronous):** the shared pure rule is `packages/utils/src/minor-guardian.ts` (`evaluateMinorGuardianConsent(answers, age)`). The API wrapper `validateMinorGuardianConsent` (`form-submission-validation.service.ts`) throws `AppError('MINOR_GUARDIAN_CONSENT_REQUIRED', …, 422, {fields})`. Enforced in BOTH `submitWizard` (registration.controller) and `submitForm` (form.controller) AFTER the 9-54 completeness gate, keyed on the SERVER-recomputed `age` (a client cannot forge it). NOT in `submission-processing.service` (post-HTTP-200). The rule adds the value-level checks completeness can't express — affirmative `guardian_consent === 'yes'` + the apprenticeship attestation answered — so it is not redundant with `findMissingRequiredAnswers`.
- **Capture-don't-exclude (AC2 policy):** an under-15 registrant is NEVER rejected for being young — only for an incomplete/declined guardian path. The interim ≥16 Step-1 block (neutralised in 9-18) is NOT reintroduced.
- **AC4 (persistence):** guardian data persists to `respondents.metadata.guardian` (JSON; no migration) — wizard path sets it inline in the controller transaction; enumerator/clerk path extracts it in `submission-processing.extractRespondentData` (keyed on the server-stamped `rawData.age`) and merges it in `findOrCreateRespondent`. **Deviation from AC4.1 literal wording:** guardian fields were NOT added to `RESPONDENT_FIELD_MAP` (that map is column-name → flat respondent column; guardian is a nested `metadata.guardian` object, AC4.2's recommended default). Extraction uses the shared rule instead. Documented per the "verify-against-reality, don't follow story framing blindly" principle.
- **AC5 (audit):** new action `MINOR_GUARDIAN_CONSENT_CAPTURED` (`minor.guardian_consent_captured`, AUDIT_ACTIONS 46→47). Written via hash-chain `logActionTx` inside the wizard submit transaction; fire-and-forget `logAction` on the async enumerator/clerk path (mirrors that path's existing creation-audit pattern). Canonical SINGULAR `AUDIT_TARGETS.RESPONDENT`. Records guardian name/relationship/phone + attestation flag — no raw child PII beyond the respondent row.
- **AC6 (NDPA/safeguarding):** (6.1) guardian PII captured ONLY when `age < 15` (the rule returns `guardian: null` otherwise; `metadata.guardian` only set when present). (6.2) `guardian_consent` label is NDPA-appropriate (purpose, controller, withdrawal). (6.3) **Withdrawal/erasure verified:** guardian lives in the single `metadata` JSONB — there is no dedicated column to miss. All current metadata-update paths (`registration.controller` defer, `reminder.worker` transition) spread existing metadata, so guardian survives a pending→active/nin_unavailable lifecycle; any future row-level erasure (Story 9-32) clears the whole `metadata`.
- **AC3.4 / AC6 client guard:** `WizardPage.reviewCompleteness` folds the shared minor rule into the Step-5 completeness guard (disables Submit + points to the missing section). Defence-in-depth; the server gate is authoritative.
- **Cross-package note:** web imports the shared rule via the deep subpath `@oslsr/utils/src/minor-guardian` (added to the package `exports` map), mirroring the 9-54 `form-completeness`/`xlsform-calculate` pattern (the barrel pulls bcrypt via crypto.js and can't be imported from web).
- **Prod follow-up (NOT in this PR):** re-migrate → re-upload → re-pin the production form (`wizard.public_form_id`) or the guardian group never renders to under-15 registrants — see `docs/runbooks/minor-age-gate-guardian-consent-repin-9-55.md`. The server gate is live regardless.
- **Web client-guard coverage (post-review-of-own-work):** the Step-5 completeness computation was EXTRACTED from `WizardPage` into a pure helper `apps/web/src/features/registration/lib/review-completeness.ts` (injectable clock) and unit-tested directly (`review-completeness.test.ts`, 5 cases incl. adult-hidden / under-15-missing / declined-consent / complete-consented). This gives direct, deterministic coverage of the minor folding WITHOUT de-stubbing the fragile WizardPage URL-race test (which deliberately stubs Step5). WizardPage's URL-race tests still pass (6/6) after the refactor.
- **Code-hygiene cleanups (pre-review):** removed an unused `isMinorAge` import + re-export from `form-submission-validation.service.ts` (dead code).
- **SEPARATE sibling change (NOT part of 9-55's feature scope) — bcrypt test-flakiness fix:** during dev, the local full API suite worker-crashed and `mfa.service.test.ts` timed out (5 fails / 178s) — a PRE-EXISTING issue on `main` (reproduces in isolation; 9-55 touches neither MFA nor bcrypt). Root cause: `SALT_ROUNDS=12` hardcoded in `packages/utils/src/crypto.ts` with no test downcost. Fixed as a DISTINCT change (gated `NODE_ENV==='test'||VITEST` → cost 4; zero dev/prod effect) per scope discipline — see `docs/follow-ups/2026-06-14-test-bcrypt-cost-downcost.md`. Result: mfa 178s/5-fail → 1.45s/22-pass (~120×); whole-suite flakiness resolved. Files: `packages/utils/src/crypto.ts` + `packages/utils/src/__tests__/crypto.test.ts`. Listed here for reviewer transparency (same working tree); assess on its own merits.

### File List

**Created**
- `packages/utils/src/minor-guardian.ts`
- `packages/utils/src/__tests__/minor-guardian.test.ts`
- `apps/web/src/features/registration/lib/review-completeness.ts` (extracted pure Step-5 guard helper)
- `apps/web/src/features/registration/lib/__tests__/review-completeness.test.ts`
- `docs/runbooks/minor-age-gate-guardian-consent-repin-9-55.md`

**Created/Modified — SEPARATE test-infra change (bcrypt flakiness; not 9-55 feature scope)**
- `packages/utils/src/crypto.ts` (test-runner SALT_ROUNDS downcost)
- `packages/utils/src/__tests__/crypto.test.ts` (cost-gating tests)
- `docs/follow-ups/2026-06-14-test-bcrypt-cost-downcost.md`

**Modified**
- `test-fixtures/oslsr_master_v3.xlsx` (added `grp_guardian` group + `guardian_rel_list` choices)
- `packages/utils/src/index.ts` (barrel export)
- `packages/utils/package.json` (exports map: `./src/minor-guardian`)
- `apps/api/src/services/form-submission-validation.service.ts` (`validateMinorGuardianConsent` + re-export `isMinorAge`)
- `apps/api/src/services/audit.service.ts` (`MINOR_GUARDIAN_CONSENT_CAPTURED` action)
- `apps/api/src/services/submission-processing.service.ts` (guardian extraction + metadata persist + audit on the async path)
- `apps/api/src/db/schema/respondents.ts` (`RespondentMetadata.guardian` inline shape)
- `apps/api/src/controllers/registration.controller.ts` (submitWizard minor gate + metadata.guardian + transactional audit)
- `apps/api/src/controllers/form.controller.ts` (submitForm synchronous minor gate)
- `apps/web/src/features/registration/pages/WizardPage.tsx` (Step-5 guard folds the minor rule)
- `apps/api/src/services/__tests__/form-submission-validation.service.test.ts` (validateMinorGuardianConsent cases)
- `apps/api/src/services/__tests__/audit.service.test.ts` (action count 46→47)
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` (guardian extract + audit)
- `apps/api/src/services/__tests__/xlsform-to-native-converter.test.ts` (grp_guardian age<15 round-trip)
- `apps/api/src/controllers/__tests__/form.controller.test.ts` (submitForm minor rejection)
- `apps/api/src/routes/__tests__/registration.routes.test.ts` (wizard minor reject/pass+persist+audit; audit mock key)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (9-55 → in-progress → review)

## Change Log

| Date | Change |
|------|--------|
| 2026-06-14 | Implemented all 7 ACs: master-form `grp_guardian` (age<15) + `guardian_rel_list`; shared pure minor rule (`@oslsr/utils/minor-guardian`); synchronous server gate `MINOR_GUARDIAN_CONSENT_REQUIRED` (422) in submitWizard + submitForm keyed on server-recomputed age (capture-don't-exclude, ILO Art.6 carve-out); guardian persistence to `respondents.metadata.guardian` (wizard inline + enumerator/clerk via submission-processing); audit `MINOR_GUARDIAN_CONSENT_CAPTURED` (hash-chain tx on wizard, fire-and-forget on async); NDPA data-minimisation + withdrawal-coverage verified; Step-5 client guard folds the rule. Operator re-pin runbook authored. utils 116 / targeted API suites / tsc + lint all green. Status → review. |
| 2026-06-14 | Pre-review hardening pass (operator request): removed dead `isMinorAge` import/re-export; extracted the Step-5 guard into a pure, unit-tested helper `review-completeness.ts` (5 cases) + verified WizardPage URL-race tests still pass (6/6). Diagnosed + fixed a PRE-EXISTING (not-9-55) bcrypt test-flakiness as a SEPARATE change (`crypto.ts` test-runner SALT_ROUNDS 12→4, gated; `docs/follow-ups/2026-06-14-test-bcrypt-cost-downcost.md`): `mfa.service.test` 178s/5-fail → 1.45s/22-pass (~120×). **Full suites now green in parallel: API 2465 pass/7 skip/0 fail (exit 0, no crash); web 2595 pass/2 todo/0 fail; utils 116 + crypto 32; tsc + lint clean.** sprint-status 9-54 confirmed `done` (synced from the other CLI). |
| 2026-06-14 | **Adversarial code review (Awwal) → all findings fixed, status review → done.** 0 Critical / 3 Medium / 3 Low; git File List reconciled clean vs reality. Fixed M1 (race-resolution merge now persists `metadata.guardian` via atomic JSONB `||` + writes the consent audit on the promote path), M2 (extracted `writeGuardianConsentAudit` — async-path NDPA audit is now awaited + logs `audit.minor_guardian_consent_captured_failed` per AC5.3 instead of silent fire-and-forget), M3 (new test parses the REAL `oslsr_master_v3.xlsx` and asserts the age<15 guardian group migrates — guards the shipped binary, not just a synthetic survey), L2 (documented the prod-safety invariant for the bcrypt downcost). L1/L3 reviewed + accepted as-is. +3 tests. Touched suites green: submission-processing (47) + xlsform-to-native-converter (10) + form-submission-validation/audit/form.controller/registration.routes (125); api tsc 0 / eslint 0. Operator prod re-pin (AC7.3) remains the only outstanding action (runbook authored; not a code item). |

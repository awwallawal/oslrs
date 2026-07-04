# Story 13.15: NIN Format-Only Validation (retire the Mod-11 hard gate)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-07-04 by Bob (SM) via *create-story. EMERGENT + LAUNCH-BLOCKING, discovered during the 2026-07-04 NIN verification (item-5 "verified" question). Empirically + authoritatively established that Nigerian NINs have NO check digit: verified against PROD oslsr_db (n=105) that modulus11Check rejects 74% of REAL NINs, and NIMC's own spec says a NIN is "11 randomly generated, non-intelligible digits". The live wizard hard-400s Mod-11 failures → the Jul-1 campaign would block ~3 of 4 real NIN entries. This story demotes every Mod-11 HARD gate to FORMAT-ONLY. Resolves Registry Data-Status Taxonomy Open-Q1. See memory nin-validation-mod11-invalid. -->

## Story

As the Oyo State registry (and every citizen registering),
I want NIN input validated by **format only** (`^\d{11}$`), not by the Modulus 11 checksum,
so that the ~74% of citizens whose *real* NIN does not satisfy Mod-11 are no longer hard-rejected at registration during the launch campaign, and the registry stops encoding a false "checksum-valid" signal.

## Context & Evidence (why this is launch-blocking)

- **Empirical (PROD `oslsr_db`, 2026-07-04, n=105 stored real NINs):** 78/105 (**74%**) FAIL `modulus11Check`; 27 pass (~26%, barely above the ~9% pure-chance rate, inflated by a few gate-forced/test rows). Tested Mod-11 (weights 10..1 / 2..11 / 1..10), Verhoeff, Luhn — **none fits** (6.7–25.7%). A genuine check digit would pass ~100%.
- **Authoritative (NIMC):** a NIN is "**11 randomly generated, non-intelligible digits**." Random + non-intelligible ⇒ **no deterministic check digit exists**. Offline validation can only ever check FORMAT; real validation is **NIMC online** (portal/API), which is out of scope here (cost-gated; sample/high-stakes only, future).
- **Live risk:** the current wizard hard-400s Mod-11 failures (`registration.controller.ts:481` on failed `submitWizardSchema.safeParse`). It hasn't bitten only because the ~101 May registrations predate the 9-18 wizard (deployed 2026-06-11) and there's been an organic drought (1 registration since). The Jul-1 campaign drives traffic to this exact gate.
- The 2 `KNOWN_VALID_NINS` the codebase was built on passed by coincidence (n=2). **Never infer a national-ID algorithm from 2 samples** (retrospective lesson).

## Acceptance Criteria

1. **(Server) Every hard Mod-11 gate becomes format-only.** GIVEN a well-formed 11-digit NIN that FAILS the Mod-11 checksum, WHEN it is submitted through any server validation path, THEN it is ACCEPTED (no `INVALID_INPUT`/`refine` rejection on checksum grounds). Covers:
   - `apps/api/src/validation/registration.schema.ts:32` (`submitWizardSchema.nin` `.refine`)
   - `apps/api/src/controllers/me.controller.ts:23` (complete-NIN / authenticated edit `.refine`)
   - `apps/api/src/controllers/form.controller.ts:216` (`if (!modulus11Check(nin))` — enumerator/clerk path)
   - `packages/types/src/validation/profile.ts:7` (shared profile schema `.refine`)
2. **(Server) Format is still enforced.** GIVEN a malformed NIN (not exactly 11 digits, or non-numeric), WHEN submitted, THEN it is still rejected. The `^\d{11}$` regex (or equivalent) remains on every path above.
3. **(Client) No surface shows "invalid" purely on checksum failure.** GIVEN a well-formed 11-digit NIN that fails Mod-11, WHEN entered, THEN the field renders valid/neutral and the user can proceed (no red "invalid NIN" state, no blocked "Next"). Covers:
   - `apps/web/src/features/registration/pages/Step1BasicInfo.tsx:106`
   - `apps/web/src/features/auth/components/activation-wizard/steps/PersonalInfoStep.tsx:22`
   - `apps/web/src/features/forms/utils/formSchema.ts:56-57` (the `'modulus11'` rule case)
   - `apps/web/src/features/forms/hooks/useNinCheck.ts:33`
4. **(Client) Duplicate-check runs for any well-formed NIN.** GIVEN a well-formed 11-digit NIN (Mod-11 pass OR fail), WHEN the debounce fires, THEN `useNinCheck` performs the availability/dup check (it must no longer be gated behind `modulus11Check`).
5. **(Data) No data is altered.** The 78 existing real-but-Mod-11-failing `respondents.nin` rows are UNTOUCHED — no migration, no purge, no backfill. They are valid `nin_on_file` data.
6. **(Cleanup) `modulus11Check` is removed from all PRODUCTION validation paths.** `modulus11Generate` MAY remain for TEST NIN generation only (`packages/testing/src/helpers/nin.ts` `generateValidNin`). After this story, no `apps/**` prod (non-test) file imports `modulus11Check`. `packages/utils/src/validation.ts` may keep the function (dead-but-documented) or it is removed if no non-test caller remains — dev's call, documented in the file.
7. **(Regression / tests) Green + honest.** Update `apps/web/e2e/nin-validation.spec.ts` and any unit tests that assert Mod-11 rejection to assert **format-only** behavior. Add a regression test: a well-formed non-Mod-11 NIN submits successfully through the public wizard (`submitWizardSchema`) and a malformed one is rejected. Full API + web suites green.

## Tasks / Subtasks

- [ ] **Task 1 — Server hard gates → format-only (AC: 1, 2)**
  - [ ] `registration.schema.ts`: replace `.refine(modulus11Check, …)` on `nin` with format-only (`.regex(/^\d{11}$/)` already present → just drop the `.refine`).
  - [ ] `me.controller.ts`: same on the complete-NIN schema (line 23).
  - [ ] `form.controller.ts:216`: remove the `if (!modulus11Check(nin))` reject; keep the 11-digit format guard.
  - [ ] `packages/types/src/validation/profile.ts:7`: drop the `.refine`; keep format.
- [ ] **Task 2 — Client surfaces → format-only UX (AC: 3, 4)**
  - [ ] `Step1BasicInfo.tsx` + `PersonalInfoStep.tsx`: NIN indicator is `valid` for any 11-digit input; drop the Mod-11 `invalid` branch (keep `incomplete` for <11).
  - [ ] `formSchema.ts`: the `'modulus11'` validation-rule case becomes a length/format check (or no-op) — decide whether to keep the rule name for form-config back-compat but make it format-only; document.
  - [ ] `useNinCheck.ts:33`: remove the `if (!modulus11Check(nin)) return;` gate so dup-check runs for any `^\d{11}$`.
- [ ] **Task 3 — Remove prod imports of `modulus11Check` (AC: 6)**
  - [ ] Delete now-unused imports across the files above; confirm `grep -rn modulus11Check apps` returns only test files.
  - [ ] Decide + document fate of `modulus11Check` in `packages/utils/src/validation.ts` (keep for `generateValidNin`'s inverse? `generateValidNin` uses `modulus11Generate`, not `Check` — so `Check` likely has NO remaining caller and can be removed or marked deprecated with a comment pointing here).
- [ ] **Task 4 — Tests (AC: 7)**
  - [ ] Update `apps/web/e2e/nin-validation.spec.ts` to format-only expectations.
  - [ ] Update/replace any unit test asserting Mod-11 rejection (search `Modulus 11`, `modulus11`, `NIN failed` in `**/__tests__` + `*.test.*`).
  - [ ] Add a positive regression: a well-formed non-Mod-11 NIN passes `submitWizardSchema.safeParse` and reaches respondent creation.
  - [ ] Run FULL api + web suites (per the 2026-07-04 pre-push parity fix, the gate runs against `app_test`).
- [ ] **Task 5 — Verify no data touched (AC: 5)**
  - [ ] Explicitly confirm no migration/script added; the 78 rows remain.

## Dev Notes

- **This is a DELETION story, not an addition** — the safest change is removing checksum logic, keeping format. Do not add NIMC-online validation here (separate future story; cost-gated).
- **`modulus11Generate` STAYS** for `packages/testing/src/helpers/nin.ts generateValidNin` (tests need deterministic 11-digit NINs; it's fine that test NINs happen to be Mod-11-valid — they're synthetic). Only the `Check` used as a gate is the problem.
- **DO NOT purge the 78 failing rows.** They are citizens' real NINs; the algorithm was wrong, not the data. Any "clean up invalid NINs" instinct is a data-loss trap.
- **Taxonomy tie-in:** this resolves **Open-Q1** of the Registry Data-Status Taxonomy — the system CAPTURES NIN (format), it does NOT and CANNOT checksum-validate. The honest verification ladder is `nin_absent` → `nin_on_file` (format-only) → `nin_verified` (NIMC-online or member-side confirmation). There is **no offline "checksum-valid" middle tier**. When 12-4/13-2 implement Axis-3, they must not label a format-valid NIN as "verified".
- **Client UX nuance:** a user whose real NIN previously showed a scary red "invalid" must now see it accepted. Keep an `incomplete` state for <11 digits so the field still guides typing.
- **Watch the shared `profile.ts` schema** — it's in `packages/types` and may be imported by multiple surfaces (marketplace profile, etc.); a change there ripples. Grep its importers before editing.

### Project Structure Notes

- Server validation lives in `apps/api/src/validation/` + controller-local zod schemas; shared schemas in `packages/types/src/validation/`. Client form validation in `apps/web/src/features/forms/utils/formSchema.ts` (rule-driven) + per-wizard step components.
- Test DB parity (2026-07-04): the pre-push gate + CI run the suite against a clean `app_test`/`test_db`. See `local-test-db-parity` memory / Pitfall #42.

### References

- [Source: memory `nin-validation-mod11-invalid`] — the full finding + prod evidence.
- [Source: `_bmad-output/planning-artifacts/registry-data-status-taxonomy.md`#Open-Questions] — Open-Q1 resolved by this story.
- [Source: NIMC — "11 randomly generated, non-intelligible digits"] https://nimc.gov.ng/verify-profile ; format vs online verification: https://ninchecks.ng/
- Prod verification method: on-box `docker exec oslsr-postgres psql -U oslsr_user -d oslsr_db` (counts only, no PII exfiltrated).
- Blast radius (grep `modulus11Check`): registration.schema.ts:32 · me.controller.ts:23 · form.controller.ts:216 · profile.ts:7 · Step1BasicInfo.tsx:106 · PersonalInfoStep.tsx:22 · formSchema.ts:57 · useNinCheck.ts:33.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

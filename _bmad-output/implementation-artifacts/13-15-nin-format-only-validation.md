# Story 13.15: NIN Format-Only Validation (retire the Mod-11 hard gate)

Status: done

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

- [x] **Task 1 — Server hard gates → format-only (AC: 1, 2)**
  - [x] `registration.schema.ts`: replace `.refine(modulus11Check, …)` on `nin` with format-only (`.regex(/^\d{11}$/)` already present → just drop the `.refine`).
  - [x] `me.controller.ts`: same on the complete-NIN schema (line 23).
  - [x] `form.controller.ts:216`: remove the `if (!modulus11Check(nin))` reject; keep the 11-digit format guard.
  - [x] `packages/types/src/validation/profile.ts:7`: drop the `.refine`; keep format.
- [x] **Task 2 — Client surfaces → format-only UX (AC: 3, 4)**
  - [x] `Step1BasicInfo.tsx` + `PersonalInfoStep.tsx`: NIN indicator is `valid` for any 11-digit input; drop the Mod-11 `invalid` branch (keep `incomplete` for <11).
  - [x] `formSchema.ts`: the `'modulus11'` validation-rule case becomes a length/format check (or no-op) — decide whether to keep the rule name for form-config back-compat but make it format-only; document. → DECIDED: rule name KEPT (published forms carry it), behavior format-only, documented inline.
  - [x] `useNinCheck.ts:33`: remove the `if (!modulus11Check(nin)) return;` gate so dup-check runs for any `^\d{11}$`.
- [x] **Task 3 — Remove prod imports of `modulus11Check` (AC: 6)**
  - [x] Delete now-unused imports across the files above; confirm `grep -rn modulus11Check apps` returns only test files. → VERIFIED (only test files + the smoke-test script's own local generator).
  - [x] Decide + document fate of `modulus11Check` in `packages/utils/src/validation.ts` → KEPT dead-but-documented (`@deprecated` block pointing here; it has unit tests and documents WHY no gate may use it). `modulus11Generate` stays for test-NIN generation.
- [x] **Task 4 — Tests (AC: 7)**
  - [x] Update `apps/web/e2e/nin-validation.spec.ts` to format-only expectations.
  - [x] Update/replace any unit test asserting Mod-11 rejection (search `Modulus 11`, `modulus11`, `NIN failed` in `**/__tests__` + `*.test.*`).
  - [x] Add a positive regression: a well-formed non-Mod-11 NIN passes `submitWizardSchema.safeParse` and reaches respondent creation. → registration.routes.test.ts (201 + insert) + me.routes + activation + ninSchema + client surfaces.
  - [x] Run FULL api + web suites (per the 2026-07-04 pre-push parity fix, the gate runs against `app_test`). → GREEN: turbo build 2/2 + test 4/4 tasks (web 2721 passed / 2 todo; api suite green vs app_test; exit 0).
- [x] **Task 5 — Verify no data touched (AC: 5)**
  - [x] Explicitly confirm no migration/script added; the 78 rows remain. → `git status`: 24 modified source/test files ONLY; no migrations, no scripts, no schema change.

### Review Follow-ups (AI)

- [x] [AI-Review][Medium] M1 — `packages/testing/src/helpers/nin.ts` header still stated "Nigerian NINs use Modulus 11 checksum algorithm" as fact + `KNOWN_VALID_NINS` implied real NINs pass Mod-11 (the exact n=2 false inference this story retires; the promised TEST-ONLY doc note had only landed in `packages/utils`). FIXED: header rewritten (real NINs carry no check digit; Mod-11 is only a deterministic test-string generator; historical `@see` flagged as disproven), `KNOWN_VALID_NINS` doc corrected (Mod-11-consistent by coincidence). [packages/testing/src/helpers/nin.ts:1]
- [x] [AI-Review][Medium] M2 — Living reference docs still taught the retired gate. FIXED: `docs/oslsr-glossary.md` NIN entry rewritten (format-only, no check digit exists, nin_on_file-never-verified ladder, 74% prod evidence); `docs/questionnaire_schema.md` validation table's "NIN Checksum | Modulus 11" row removed (format row annotated). Historical session note left untouched (history, not reference). [docs/oslsr-glossary.md:92]
- [x] [AI-Review][Low] L1 — `zzzzzzzzzz.txt` (927KB accidental terminal-paste dump) at repo root risked riding into the commit. FIXED: deleted.
- [x] [AI-Review][Low] L2 — e2e `VALID_NIN` constant's "// any 11 digits" comment didn't explain the kept Mod-11 fixture. FIXED: comment now marks the Mod-11 consistency as a meaningless coincidence. [apps/web/e2e/nin-validation.spec.ts:20]

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

Claude Fable 5 (claude-fable-5) — BMAD dev-story workflow, 2026-07-04.

### Debug Log References

- Targeted API run (6 touched files): 141/141 green against `app_test` (NODE_ENV=test, db-guard enforced).
- Targeted web run (6 touched files): 107/107 green.
- packages/types: 101/101 green (incl. rewritten profile.test.ts). packages/utils: 126/126 green (modulus11Check unit tests retained — the function still exists, deprecated).
- `tsc --noEmit`: api 0, web 0. `turbo run lint --force`: 0 errors, 0 warnings (api + web).
- Full pre-push-parity regression (`turbo run build --concurrency=1` + `turbo run test --concurrency=1` vs `app_test`): see Completion Notes.

### Completion Notes List

- **Task 1 (AC1, AC2):** All 4 server Mod-11 hard gates demoted to format-only (`^\d{11}$` retained on every path): `registration.schema.ts` (dropped `.refine`), `me.controller.ts` `meCompleteNinSchema` (dropped `.refine`), `form.controller.ts` `checkNin` (removed the 422 checksum block; `checkNinBodySchema`'s `.length(11).regex(/^\d{11}$/)` remains the guard), `packages/types/src/validation/profile.ts` `ninSchema` (dropped `.refine`; `.length` + `.regex` remain). Also updated the stale Mod-11 comment in `me.service.ts:568`.
- **Task 2 (AC3, AC4):** `Step1BasicInfo.tsx` — NIN status machine reduced to `'incomplete' | 'valid'`; the checksum-failure alert (`wizard-step1-nin-invalid`) and its aria/border branches are deleted; any 11-digit input goes green and (AC4) triggers the debounced dup-check. `PersonalInfoStep.tsx` — same reduction; the `'invalid'` render branch and error-color branches removed. `formSchema.ts` — the `'modulus11'` rule NAME is kept for published-form-config back-compat but its behavior is format-only (documented inline). `useNinCheck.ts` — the `modulus11Check` gate before the availability call is removed; dup-check fires for any `^\d{11}$`.
- **Task 3 (AC6):** No production (non-test) file imports `modulus11Check` — verified by grep (only test files + the standalone smoke-test script's own local generator remain). Decision on `packages/utils/src/validation.ts`: `modulus11Check` is KEPT dead-but-documented with a `@deprecated` block pointing at this story (it has unit tests and is the documented inverse of `modulus11Generate`); `modulus11Generate` stays for test-NIN generation (`packages/testing/src/helpers/nin.ts`), with a TEST-ONLY doc note. Dead `vi.mock('@oslsr/utils/src/validation')` blocks removed from form.controller.{test,submission-counts,daily-counts} + ClerkDataEntryPage + useNinCheck tests.
- **Task 4 (AC7):** Positive regressions added: wizard route accepts a well-formed non-Mod-11 NIN end-to-end (201 + respondent insert), complete-nin accepts it (200), activation (real DB) accepts a derived non-Mod-11 NIN, `ninSchema`/`formSchema`/`useNinCheck`/Step1 all assert acceptance; format rejection (10-digit / non-numeric) asserted on every path. `nin-validation.spec.ts` e2e rewritten to format-only (incl. the skipped enumerator flow's body, kept skip'd — still needs the published-form seed).
- **Task 5 (AC5):** No migration, no script, no data change — the working tree contains ONLY source/test modifications (24 files, verified via `git status`); the 78 real-but-Mod-11-failing prod rows are untouched by construction.
- **Honest-data note (taxonomy Open-Q1):** per the Dev Notes ladder, a format-valid NIN is `nin_on_file`, never "verified" — comments at every touched site now say so, so 12-4/13-2 Axis-3 implementers inherit the correct contract.

### File List

- apps/api/src/validation/registration.schema.ts
- apps/api/src/controllers/me.controller.ts
- apps/api/src/controllers/form.controller.ts
- apps/api/src/services/me.service.ts (comment only)
- packages/types/src/validation/profile.ts
- packages/utils/src/validation.ts (deprecation docs only)
- apps/web/src/features/registration/pages/Step1BasicInfo.tsx
- apps/web/src/features/auth/components/activation-wizard/steps/PersonalInfoStep.tsx
- apps/web/src/features/forms/utils/formSchema.ts
- apps/web/src/features/forms/hooks/useNinCheck.ts
- apps/api/src/routes/__tests__/registration.routes.test.ts
- apps/api/src/routes/__tests__/me.routes.test.ts
- apps/api/src/controllers/__tests__/form.controller.test.ts
- apps/api/src/controllers/__tests__/form.controller.submission-counts.test.ts
- apps/api/src/controllers/__tests__/form.controller.daily-counts.test.ts
- apps/api/src/__tests__/auth.activation.test.ts
- packages/types/src/validation/__tests__/profile.test.ts
- apps/web/src/features/registration/pages/__tests__/Step1BasicInfo.test.tsx
- apps/web/src/features/auth/components/activation-wizard/steps/__tests__/PersonalInfoStep.test.tsx
- apps/web/src/features/forms/utils/__tests__/formSchema.test.ts
- apps/web/src/features/forms/hooks/__tests__/useNinCheck.test.ts
- apps/web/src/features/forms/pages/__tests__/FormFillerPage.test.tsx
- apps/web/src/features/forms/pages/__tests__/ClerkDataEntryPage.test.tsx
- apps/web/e2e/nin-validation.spec.ts
- packages/testing/src/helpers/nin.ts (review fix M1 — docs/comments only)
- docs/oslsr-glossary.md (review fix M2)
- docs/questionnaire_schema.md (review fix M2)

## Senior Developer Review (AI)

**Reviewer:** Claude Fable 5 — BMAD adversarial code-review, 2026-07-04.

**Verification (run independently, not taken from the dev record):** api `tsc --noEmit` 0 · web `tsc --noEmit` 0 · eslint api+web 0/0 · touched API test files 141/141 green vs `app_test` · touched web test files 107/107 · packages/types 101/101 · packages/utils 126/126. Git working tree matched the File List exactly (24/24, zero discrepancies).

**AC audit:** all 7 ACs IMPLEMENTED. Every server gate format-only with `^\d{11}$` retained + positive/negative regressions per path (AC1/2/7); all 4 client surfaces demoted, no red-on-checksum state remains (AC3); dup-check fires for any well-formed NIN (AC4); no migration/script/data change (AC5); zero production importers of `modulus11Check` — grep-verified, only packages/utils itself, its unit tests, and the smoke-test script's local generator (AC6). Cross-checks beyond the story's blast radius: `registration.controller.ts:40` (token complete-NIN) was already format-only; the only evaluator of the `'modulus11'` rule type is `formSchema.ts` (now format-only), so `xlsform-to-native-converter.ts` still emitting the rule name is safe back-compat as decided.

**Findings:** 0 High / 2 Medium / 2 Low — all four FIXED in-session (see Review Follow-ups). The Mediums were both honest-data-contract leaks: the debunked "NINs use Mod-11" claim survived as stated fact in the canonical test-NIN helper and in two living reference docs (glossary + questionnaire schema). Post-fix checks: packages/testing tsc clean for nin.ts (pre-existing unrelated `reporter.ts` vitest-type errors noted), e2e spec eslint clean; nin.ts change is comment-only so its green consumers (auth.activation 30/30 et al.) are unaffected.

**Outcome:** APPROVED → done. Commit + deploy BEFORE the campaign blasts.

## Change Log

- 2026-07-04 — Story 13-15 implemented (dev-story, Amelia/Claude Fable 5): every Mod-11 NIN hard gate demoted to format-only (`^\d{11}$`) across 4 server paths + 4 client surfaces; `modulus11Check` removed from all production imports (kept deprecated in @oslsr/utils); tests rewritten to format-only expectations + positive non-Mod-11 regressions; no data touched.
- 2026-07-04 — Adversarial code-review (Claude Fable 5): APPROVED → done. All checks re-run independently (tsc/eslint/475 targeted tests green). 2 Med + 2 Low found, all fixed: nin.ts test-helper header no longer states the debunked Mod-11 claim as fact; glossary + questionnaire-schema docs corrected to format-only; junk file removed; e2e fixture comment clarified.

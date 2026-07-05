# Story 13-16: Canonicalize `respondents.lgaId` to the LGA slug (retire the wizard's UUID write)

Status: done

<!-- Authored 2026-07-04 by Bob (SM) via *create-story. EMERGENT from the 13-14 dedup verification: the public wizard writes respondents.lgaId = lgas.id (UUID) while EVERYTHING ELSE (enumerator form, all analytics joins) uses the LGA slug (lgas.code). Verified vs PROD: 139 public rows are UUID-shaped, 1 enumerator row is slug — respondents.lgaId holds TWO vocabularies by channel. Consequence: (a) the wizard LGA dedup can never match (13-14 AC7 symptom), (b) the geographic dashboard's `l.code = r.lga_id` join FAILS for all 139 public rows (they show as raw UUID / "Unknown"). This story makes the SLUG canonical everywhere. Continuation of the 9-54 choice-field-dedup lineage. -->

## Story
As **anyone reading LGA analytics (Ministry, official, supervisor) and any public registrant**,
I want **`respondents.lgaId` to hold ONE canonical value — the LGA slug (`lgas.code`) — on every channel**,
so that **per-LGA counts/coverage/maps are correct (no LGA splits into a UUID bucket and a slug bucket), and the public wizard stops asking LGA twice.**

## Context & Evidence (why this is a real root-cause, not cosmetic)
`respondents.lgaId` is `text('lga_id')` — **NOT a UUID FK, no referential constraint** [Source: apps/api/src/db/schema/respondents.ts:151]. So each channel writes whatever it holds:
- **Public wizard writes the UUID:** `Step2ContactLga.tsx` renders `<option value={lga.id}>` (`lgas.id`, a `uuid`) → `formData.lgaId` = UUID → `respondents.lgaId` = UUID. [Source: apps/web/src/features/registration/pages/Step2ContactLga.tsx:186]
- **Enumerator/clerk form writes the slug:** `raw_data.lga_id` = the form's `lga_list` **slug** → `submission-processing` stores `respondents.lgaId = String(extracted['lgaId'])` = slug (no slug→id resolution). [Source: apps/api/src/services/submission-processing.service.ts RESPONDENT_FIELD_MAP `'lga_id'→'lgaId'` + the extract at ~:471]

**PROD verification 2026-07-04 (`oslsr_db`):** `139 public = UUID-shaped · 1 enumerator = slug`. Two vocabularies in one column.

**The whole analytics layer assumes SLUG** (`respondents.lgaId = lgas.code`):
- `report.service.ts:193` `LEFT JOIN respondents r ON r.lga_id = l.code`
- `survey-analytics.service.ts:319,457` `LEFT JOIN lgas l ON l.code = r.lga_id`; `:141,:316,:454` `COALESCE(l.name, r.lga_id, 'Unknown')`; `:58` `lgasCovered = COUNT(DISTINCT lgaId)`.

⇒ **Live bug:** all 139 public rows FAIL the slug join → they render as the raw UUID or "Unknown" in the LGA breakdown, and `lgasCovered` mis-counts (UUIDs + slugs as distinct). The geographic dashboard is wrong for ~100% of today's registry. It gets worse the moment enumerators cover the 33 LGAs (public UUID bucket + enumerator slug bucket per LGA).

**Canonical choice = SLUG (`lgas.code`).** The forms, the enumerator path, and every analytics join already use it; the wizard is the lone outlier. Aligning the wizard to the slug is the minimal, consistent fix (vs. rewriting every join + the enumerator path to UUID).

**Relationship to 13-14:** 13-14 removes `lga_id` from the *Public Core form* (kills the visible double-ask on the public path). THIS story fixes the underlying value inconsistency so `respondents.lgaId` is trustworthy for analytics and any future wizard+form combo. 13-14 is the launch band-aid; 13-16 is the cure. Not launch-BLOCKING (13-14 covers the public UX), but **pre-launch-eligible / high-priority** because per-LGA coverage is a launch-monitoring metric (and R3's `full`-per-LGA floor depends on it).

## Acceptance Criteria
1. **AC1 — Wizard writes the slug.** `Step2ContactLga` renders `<option value={lga.code}>` (the slug), so `formData.lgaId` and the resulting `respondents.lgaId` are the LGA **slug**, not the UUID. The public `/lgas/public` payload must expose `code` (verify it does; add if missing). [Source: Step2ContactLga.tsx:186]
2. **AC2 — Backfill existing rows.** A one-off, idempotent, audited migration converts the **139 UUID-shaped `respondents.lgaId` values → their `lgas.code` slug** (join `lgas.id = respondents.lgaId` for UUID-shaped values only; leave already-slug values untouched). Post-migration, `SELECT ... WHERE lga_id ~ '^[0-9a-f]{8}-'` returns **0** rows. Backup the pre-migration `(id, lga_id)` pairs (CSV on the box, per the draft-timer-reset precedent).
3. **AC3 — Wizard LGA dedup now works.** With the wizard value = slug and the form `lga_list` = slug, `mapWizardValueToChoice('lgaId', <slug>, [slugs])` matches → the Step-4 `lga_id` question is deduped (hidden). A wizard+full-form walkthrough asks LGA exactly once. (This also means 13-14's `lga_id` removal becomes belt-and-suspenders rather than the sole fix.) [Source: Step4Questionnaire.tsx computePrefill + wizard-provided-field-names.ts WIZARD_CHOICE_FIELD_KEYS]
4. **AC4 — Analytics join is correct for ALL sources.** After AC1+AC2, every LGA analytics surface joins cleanly: `report.getLgaBreakdown`, `survey-analytics` LGA charts, `lgasCovered`, and the scope filter (`r.lga_id = ${scope.lgaCode}`) all resolve public + enumerator rows to the same LGA. A test asserts a public row and an enumerator row for the SAME LGA aggregate into ONE bucket (no UUID/slug split, no "Unknown").
5. **AC5 — Consumer audit (no UUID assumption left).** Grep-audit every `lgaId`/`lga_id` read (services, controllers, exports, the me-service read-model, the registry table filter) and confirm none relies on `respondents.lgaId` being a UUID / joining to `lgas.id`. Any that do are corrected to slug. Record the audited sites in the File List.
6. **AC6 — Tests + no regression.** Unit/integration: wizard writes slug; backfill migration converts UUID→slug + is idempotent + leaves slugs alone; the LGA-breakdown one-bucket assertion; scope-filter still works. Full api + web suites green (against `app_test`).

## Tasks / Subtasks
- [x] **Task 1 (AC1)** — `Step2ContactLga.tsx`: `<option value={lga.code}>`; confirm `useLgas`/`/lgas/public` returns `code`; update any web test asserting the UUID value.
- [x] **Task 2 (AC2)** — write `apps/api/scripts/migrate-lgaid-uuid-to-slug.ts` (idempotent; UUID-shaped only; audited via `audit_logs`; CSV backup of pre-values). Dry-run then run on prod via Tailscale. *(script + tests done; PROD dry-run→apply = operator residual)*
- [x] **Task 3 (AC3, AC5)** — verify the wizard dedup hides `lga_id` post-change; run the consumer grep-audit; fix any UUID-assuming reader.
- [x] **Task 4 (AC4, AC6)** — tests (wizard-writes-slug, backfill idempotency, one-bucket LGA aggregate, scope filter) + full suite; targeted `tsc`/eslint clean.
- [x] **Task 5** — update 13-14 (its `lga_id` removal is now defense-in-depth, not the sole fix) + note in the geographic-dashboard/12-6/13-6 stories that per-LGA coverage is now trustworthy.

### Review Follow-ups (AI) — adversarial code review 2026-07-05
- [x] [AI-Review][Medium] M1 — bare `--max-rows` (missing value / value swallowed by the next flag) silently removed the cap → now throws; +1 test covering both shapes. [apps/api/scripts/migrate-lgaid-uuid-to-slug.ts parseArgs]
- [ ] [AI-Review][Medium] M2 — the working tree carries ~40 unrelated modified files (`_bmad-output/baseline-report/**`, a separate workstream). **The 13-16 commit MUST be a selective `git add` of this story's File List — never `git add -A`.** (Commit-time discipline; no code change possible.)
- [x] [AI-Review][Medium] M3 — enumerator write-site hardened: `canonicalizeLgaId` now also maps the 6 retired form-vocabulary aliases (`FOSSIL_LGA_ALIASES`) → canonical slug and is applied at `findOrCreateRespondent`'s respondents insert, so a submission from the still-live fossil form can't persist a non-joining value while the 13-14 re-pin is pending. +1 service test (all 6 aliases + fixed-point) +3 write-site tests. [lga-canonical.service.ts, submission-processing.service.ts:~578]
- [x] [AI-Review][Low] L1 — `raw_data.lga_id` could be clobbered by a shown Step-4 `lga_id` answer (fossil vocabulary) because `...responses` spread after it; `lga_id: lgaSlug` now spreads AFTER responses at BOTH public write-sites so raw_data always matches `respondents.lga_id`, and the misleading "cannot overwrite" comment was corrected. (Verified: nothing reads `raw_data->>'lga_id'` — forensic-consistency fix.) [registration.controller.ts:~674, me.service.ts:~521]
- [x] [AI-Review][Low] L2 — default backup dir was CWD-relative (repo root vs apps/api scattered backups); now anchored to the API package root via `import.meta.url` (explicit `--backup-dir` taken as given); tests updated + 1 added. [migrate-lgaid-uuid-to-slug.ts parseArgs]
- [x] [AI-Review][Low] L3 — recorded in a Step2 comment that the stale-draft remap only runs when the user re-enters Step 2 (a draft resumed at a later step submits the UUID) — the SERVER guard is the authoritative net and must never be removed on the strength of the client remap. [Step2ContactLga.tsx:~54]

## Dev Notes
- **Canonical = slug** because the analytics layer + forms already assume it (`l.code = r.lga_id`). Do NOT flip everything to UUID — far larger blast radius.
- **Migration safety:** convert ONLY UUID-shaped values (regex `^[0-9a-f]{8}-`), map via `lgas.id → lgas.code`. A UUID with no matching `lgas` row (shouldn't exist) → log + leave for manual review, never null it. Idempotent (re-run finds 0 UUID-shaped). Backup pre-values to `_ops-backups/` on the box.
- **Watch the me-service read-model** (`getEditableRegistration` maps `lgaId → lgaName` via a slug→name lookup — Story 9-61). If it currently expects a slug, the public UUID rows were mis-resolving there too; after backfill they resolve correctly. Verify.
- **Not a schema change** — `lgaId` stays `text` (a later story MAY promote it to a real FK, out of scope). This story just makes the *values* consistent.
- **Contamination note:** the sprint-status.yaml entry for this story is DEFERRED (Amelia holds the file mid-13-15); add `13-16-lga-value-canonicalization: ready-for-dev` at the 13-15 close-out.

### References
- [Source: apps/api/src/db/schema/respondents.ts:151] — `lgaId: text('lga_id')` (no FK — how two vocabularies coexist).
- [Source: apps/web/src/features/registration/pages/Step2ContactLga.tsx:186] — `<option value={lga.id}>` (the UUID write; the fix site).
- [Source: apps/api/src/services/submission-processing.service.ts ~:471 + RESPONDENT_FIELD_MAP] — enumerator slug write.
- [Source: apps/api/src/services/report.service.ts:58,193] · [survey-analytics.service.ts:141,211,316,319,454,457] — the slug-join analytics that fail for UUID rows.
- [Source: 13-14 AC7 + Dedup verification] — the symptom this cures.
- PROD evidence: `respondents` lgaId kind × source = {UUID:public:139, slug:enumerator:1} (2026-07-04, on-box, counts only).

## Dev Agent Record

### Implementation Plan
- **Task 1 (AC1)** — three layers, not one: (a) `Step2ContactLga` option value → `lga.code` (the fix site); (b) a stale-draft remap effect in Step 2 (drafts saved pre-13-16 hold the UUID; remap to slug once the LGA list loads so resume pre-selects + submits the slug); (c) a SERVER canonicalization guard `canonicalizeLgaId` (new `lga-canonical.service.ts`) applied at BOTH public write-sites — `RegistrationController.submitWizard` and `MeService.updateRegistrationFromWizard` (9-61 edit path reuses the same schema) — so a stale in-flight draft or cached client can never write a UUID-shaped row again post-backfill (protects the AC2 zero-UUID invariant durably). Unknown UUID → logged + passed through (never nulled). `/lgas/public` already returns `code` (verified, no API change). `Step5ReviewAndSave` name lookup switched to slug-first with row-UUID fallback for old drafts.

### Completion Notes
- Task 1 ✅ — wizard writes the slug end-to-end. New real-DB test `lga-canonical.service.test.ts` (5 tests: UUID→slug, slug passthrough, empty/undefined passthrough, orphan-UUID pass-through-with-warn, full-shape-only regex). New web test `Step2ContactLga.test.tsx` (3 tests: option value = slug, stale-UUID-draft remap, no remap churn on slug drafts). `Step5ReviewAndSave.test.tsx` LGA mock updated to the slug vocabulary (16 tests green). api tsc + web tsc clean.
- Task 3 ✅ — AC3: dedup mechanism pinned by `wizard-provided-field-names.test.ts` (slug → dedups, UUID → question shown, never an invalid injection); works for 27/33 LGAs against the LIVE form (see the ⚠️ form-vocabulary finding in the AC5 audit — the 6 divergent LGAs safely show the question until the form's choice values are corrected). AC5: full grep-audit recorded above; ONE UUID-reliant reader found + corrected (`personal-stats` LGA fallback) + 1 test.
- Task 4 ✅ — AC4 pinned by NEW real-DB `lga-analytics-one-bucket.test.ts` (3 public + 3 enumerator rows, same slug → `report.getLgaBreakdown` ONE bucket count 6; `survey-analytics` LGA distribution ONE named bucket (no UUID label / no "Unknown"); supervisor scope filter `r.lga_id = scope.lgaCode` sees both sources). AC6 full-gate results: **API suite 2981 passed** (one drift-test failure was the audit-action count pin 53→54, updated with the 13-16 comment line, re-run green 38/38) + **web suite 2724 passed** (was 2721; +3 Step2 tests). api tsc 0, web tsc 0, api `eslint src` clean, web `eslint src e2e` clean, new script files lint clean. E2E specs select LGA by index — unaffected by the value change (verified).
- Task 5 ✅ — 13-14 updated (root-cause = fixed; `lga_id` removal now defense-in-depth; **NEW Task-2 pre-publish constraint: align the 6 divergent `lga_list` values to `lgas.code` in BOTH forms before publish/pin**). 13-6 + 12-6 change logs note per-LGA coverage is trustworthy post-backfill (with the form-vocab residual flagged).
- Task 2 ✅ (dev half) — `scripts/migrate-lgaid-uuid-to-slug.ts` mirrors the `_backfill-reference-code.ts` discipline: preview-by-default, `--apply --confirm-i-am-not-dry-running` to write, CSV backup of `(id, lga_id_pre, resolved_slug)` BEFORE any write (default `_ops-backups/`), per-row txn with FOR-UPDATE re-check (idempotent + race-safe), unmatched UUID logged + left as-is (never nulled), post-run 0-UUID verification printed. New audit action `OPERATOR_LGA_ID_CANONICALIZED` (per-row forensic trail, precedent: name/reference-code backfills). 10 tests green on app_test (parseArgs ×5 + real-DB convert/backup/audit/idempotency/orphan ×5); `--dry-run` smoke-ran clean against app_test. **[Operator residual] run on PROD via Tailscale: `--dry-run` (expect 139 convertible) → `--apply --confirm-i-am-not-dry-running` → verify `SELECT count(*) FROM respondents WHERE lga_id ~* '^[0-9a-f]{8}-'` = 0.**

### AC5 Consumer Audit (2026-07-04, grep-audit of every `lgaId`/`lga_id` site)
**🔧 CORRECTED (relied on `respondents.lgaId` = UUID):**
- `personal-stats.service.ts` `getTeamAvgCompletionTime` LGA-wide fallback — compared `users.lga_id` (a `lgas.id` UUID FK) **directly** against `r.lga_id`. This only ever matched public rows BECAUSE they held the UUID; the backfill would have silently broken it. Now resolves `users.lga_id → lgas.code` through the lgas table (the `analytics-scope.ts` pattern) and filters by slug. +1 test pinning the resolved-slug SQL shape.

**✅ Slug-consistent (verified, no change):** `report.service` (:58 lgasCovered, :193 join), `survey-analytics.service` (ALL joins `l.code = r.lga_id`, scope filter `r.lga_id = scope.lgaCode`, `params.lgaId`, skills-inventory/insights/equity/reliability), `public-insights.service` (:83, :200-203), `respondent.service` (:80 join, :496 filter, :669 join), `export-query.service` (:90/:214/:319 joins, :401/:422 filters), `assessor.service` (:116-117 filter — web sends `lga.code`), `me.service` read-models (slug→name `eq(lgas.code, …)` — the 139 UUID rows mis-resolved to null here until the AC2 backfill; fixed by data, verified by code), `marketplace.service` (`mp.lga_id = l.code`) + `marketplace-extraction.worker.resolveLgaName` (code-first lookup; UUID → warn + null lgaId, graceful), `submission-processing.service` (:471/:587 — writes the form's `lga_list` value; see divergence finding), `analytics-scope.ts` (already resolves UUID→code correctly — the reference pattern).

**➖ Different column (`users.lgaId`/`teamAssignments.lgaId`/`paymentBatches.lgaId` = `lgas.id` UUID FK; internally consistent; out of scope):** productivity/productivity-target, remuneration, staff, team-assignment, message, auth/token services; web staff-facing selects (`AddStaffModal`, `BulkRecordingForm`, `OfficialProductivityPage`, `ViewAsPage`, `LgaMultiSelect`) correctly pass `lga.id`. Web respondent-facing filters (`RegistryFilters`, `AnalyticsFilters`, `ExportPage`, `MarketplaceFilters`) correctly pass `lga.code`.

**📌 Noted (no live defect):** `pending-nin.service` `supervisor_task` reminder target carries the respondent's lgaId (slug post-13-16); its consumer is explicitly `supervisor_task_surface_not_yet_wired` (`reminder.worker.ts:185`) — when wired it MUST resolve slug→`users.lgaId` (UUID) via lgas. Marketplace profiles extracted from public respondents PRE-backfill have `lgaId=null` (resolveLgaName warned on the UUID) — re-extraction after the prod backfill recovers them (operator/follow-up, small cohort).

**⚠️ EMERGENT FINDING — live form `lga_list` is a THIRD vocabulary for 6/33 LGAs.** Verified against the published master form (`questionnaire_forms.form_schema.choiceLists.lga_list`, app_db canonical mirror): `ibadan_ne`, `ibadan_nw`, `ibadan_se`, `ibadan_sw`, `ogbomoso_north`, `ogbomoso_south` vs `lgas.code` `ibadan_north_east`, `ibadan_north_west`, `ibadan_south_east`, `ibadan_south_west`, `ogbomosho_north`, `ogbomosho_south` (other 27 identical). Lineage: `scripts/generate-xlsform.cjs` carries the same 6 aliases. Consequences: (a) enumerator/clerk submissions for those 6 LGAs write a non-joining value → same "Unknown" bucket bug this story fixes (only 1 enumerator row exists today; blast radius arrives when enumerators fan out); (b) wizard dedup (AC3) fires for 27/33 LGAs — for the 6 divergent ones `mapWizardValueToChoice` correctly declines and the question is SHOWN (safe fallback, never an invalid write; `respondents.lgaId` still gets the canonical slug from Step 2). **Fix belongs at the FORM level, not code** (9-54 data-driven discipline): correct the 6 choice values in the master XLSX + ensure the 13-14 Public Core spec uses `lgas.code` values BEFORE it is published/pinned. Routed via Task 5 doc harmonization; form re-upload + re-pin = operator/follow-up.

### Post-dev additions (2026-07-04/05 — Awwal-directed, pre-code-review)
Awwal reviewed the dev-story output and directed three follow-ups under the no-tech-debt commitment, executed in-session so the code-review agent gets one clean tree:

**A. Script lint debt retired + gate widened (was: 8 pre-existing errors invisible to CI).**
The API lint script was `eslint src` — `scripts/` was never linted by CI/pre-push, letting 8 errors accumulate in 6 files none of which 13-16 touched. All 8 fixed (5 unused imports/vars deleted; 3 `any`s replaced with real structural types in `cf-analytics.ts` + a narrowed catch in `cleanup-test-users.ts`) and the gate widened to **`eslint src scripts`** (`apps/api/package.json`) so script rot can't recur. All 10 script test files re-run green (179 tests).

**B. Emergent form-vocabulary finding RESOLVED at the form level (was: operator residual).**
The 6 divergent `lga_list` values (`ibadan_ne/nw/se/sw`, `ogbomoso_north/south`) are now purged from every source:
- `scripts/generate-xlsform.cjs` (the lineage origin) — 6 values corrected + canonical-source comment.
- **XLSX sources patched** (6 `choices!B*` cells each, values only, labels untouched): `test-fixtures/oslsr_master_v3_email.xlsx` (⚠️ **gitignored** — the operator's local publish artifact; the code-review diff will NOT show this change, verified post-patch: 33/33 values == `lgas.code` exactly), `test-fixtures/oslsr_master_v3.xlsx`, `docs/launch-campaign/oslsr-public-core-v1.xlsx`.
- `docs/questionnaire_schema.md` lga_list table corrected + canonical-slug rule stated (no doc teaches the fossil vocabulary).
- `apps/api/src/db/seed-projected-scale.ts` — its fake-LGA list had FOUR MORE non-canonical slugs (`oyo_north`, `oyo_south`, `iddo`, `orire`; missing `egbeda`/`itesiwaju`) — replaced with the canonical 33.
- **Publish-time guard (the systemic fix):** `OSLSR_REQUIRED_CHOICE_LISTS.lga_list` (packages/types/questionnaire.ts) now carries `canonicalValues: Object.values(Lga)` (the `Lga` enum verified == `lgas.seed.ts` 33/33), and `xlsform-parser.service.ts` `validateSchema` flags any `lga_list` value outside the set (severity `warning`, matching the min-options precedent — surfaces at upload, doesn't block synthetic test forms). +2 tests (fossil values → 2 warnings naming them; canonical 33 → 0 warnings); the valid-form fixture upgraded to real canonical slugs. Parser + questionnaire suites green (62 tests).
- **Operator residual UPDATE:** the sources are now clean, so the residual reduces to the ALREADY-PLANNED 13-14 Task-2 publish + re-pin (no separate value-editing step). The live PUBLISHED form row in the DB intentionally keeps its old values until that re-upload (form-versioning discipline — never mutate a published form in place).

**C. Public Core discoverability.** `docs/launch-campaign/oslsr-public-core-v1.xlsx` copied to `test-fixtures/oslsr-public-core-v1.xlsx` (same folder as the masters) + NEW `test-fixtures/README.md` documenting which file is which, the gitignore status of the email-master, the canonical-slug rule, and the re-pin-after-upload rule.

**Gates after A+B+C:** api `eslint src scripts` clean, api tsc clean, script tests 179/179, parser+questionnaire 62/62, full API suite re-run green.

### File List
**API (new):**
- `apps/api/src/services/lga-canonical.service.ts` — `canonicalizeLgaId` (UUID→slug write-guard) + `UUID_SHAPED_RE`
- `apps/api/src/services/__tests__/lga-canonical.service.test.ts` — 5 real-DB tests
- `apps/api/src/services/__tests__/lga-analytics-one-bucket.test.ts` — AC4: 3 real-DB tests (getLgaBreakdown one-bucket, demographics LGA distribution, scope filter)
- `apps/api/scripts/migrate-lgaid-uuid-to-slug.ts` — AC2 backfill (preview-default / confirm-gated / CSV backup / audited / idempotent)
- `apps/api/scripts/__tests__/migrate-lgaid-uuid-to-slug.test.ts` — 10 tests (parseArgs + real-DB backfill lifecycle)

**API (modified):**
- `apps/api/src/controllers/registration.controller.ts` — submitWizard canonicalizes `data.lgaId` → slug (respondents insert + raw_data + audit details); review L1: raw_data `lga_id` spreads after `...responses` (authoritative)
- `apps/api/src/services/me.service.ts` — updateRegistrationFromWizard canonicalizes likewise (9-61 edit path); review L1 parity
- `apps/api/src/services/submission-processing.service.ts` — review M3: `findOrCreateRespondent` canonicalizes `data.lgaId` (fossil alias / stray UUID → slug) at the respondents insert
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` — review M3: +3 write-site canonicalization tests (+ values-capture spy in the db mock)
- `apps/api/src/services/audit.service.ts` — +`OPERATOR_LGA_ID_CANONICALIZED`
- `apps/api/src/services/personal-stats.service.ts` — AC5 fix: LGA-wide fallback resolves `users.lga_id`→`lgas.code` instead of comparing UUID to slug
- `apps/api/src/services/__tests__/personal-stats.service.test.ts` — +1 test pinning the resolved-slug fallback

**Web (modified/new):**
- `apps/web/src/features/registration/pages/Step2ContactLga.tsx` — `<option value={lga.code}>` + stale-UUID-draft remap effect
- `apps/web/src/features/registration/pages/Step5ReviewAndSave.tsx` — LGA name lookup slug-first (UUID fallback for old drafts)
- `apps/web/src/features/registration/pages/__tests__/Step2ContactLga.test.tsx` — NEW, 3 tests
- `apps/web/src/features/registration/pages/__tests__/Step5ReviewAndSave.test.tsx` — LGA mock updated to slug vocabulary

**Post-dev additions (see the section above):**
- `apps/api/package.json` — lint gate widened to `eslint src scripts`
- `apps/api/scripts/cf-analytics.ts`, `cleanup-test-users.ts`, `fix-xlsform-labels.ts`, `_backfill-reference-code.ts`, `_deactivate-undeliverable-admins.ts`, `scripts/__tests__/restore-backup.test.ts` — 8 pre-existing lint errors fixed
- `packages/types/src/questionnaire.ts` — `OSLSR_REQUIRED_CHOICE_LISTS.lga_list.canonicalValues` (from the `Lga` enum)
- `apps/api/src/services/xlsform-parser.service.ts` — canonical-value warning in `validateSchema`
- `apps/api/src/services/__tests__/xlsform-parser.service.test.ts` — fixture → canonical slugs; +2 canonical-pin tests
- `apps/api/src/db/seed-projected-scale.ts` — fake-LGA list → canonical 33
- `scripts/generate-xlsform.cjs` — 6 lga_list values corrected
- `docs/questionnaire_schema.md` — lga_list table corrected + rule
- `test-fixtures/oslsr_master_v3.xlsx`, `test-fixtures/oslsr_master_v3_email.xlsx` (GITIGNORED — not in diff), `docs/launch-campaign/oslsr-public-core-v1.xlsx` — 6 choice values patched each
- `test-fixtures/oslsr-public-core-v1.xlsx` — NEW synced copy
- `test-fixtures/README.md` — NEW

**Docs/stories (Task 5 harmonization):**
- `_bmad-output/implementation-artifacts/13-14-public-core-form-and-two-form-split.md` — root-cause status + lga_list 6-value pre-publish constraint
- `_bmad-output/implementation-artifacts/13-6-channel-and-coverage-dashboard.md` — per-LGA coverage trust note + form-vocab residual
- `_bmad-output/implementation-artifacts/12-6-data-health-view.md` — join-safety note
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 13-16 status transitions

## Senior Developer Review (AI) — 2026-07-05

**Verdict: APPROVED with 6 findings (0 High / 3 Medium / 3 Low) — all fixed in-session except M2 (commit-time discipline).** Story → done.

**Verification performed (not trusted from the record):** every task's [x] traced to file:line evidence; all 6 ACs checked against the tree (AC2's prod run correctly declared an operator residual, not claimed); `Lga` enum ↔ `lgas.seed.ts` 33/33 parity re-derived; gitignored email-master confirmed absent from the diff as warned; gates re-run independently — targeted API tests, web registration suite, api+web `tsc`, `eslint src scripts` all green. AC3's dedup mechanism confirmed pinned by the pre-existing 9-54 test (`mapWizardValueToChoice('lgaId', 'saki_west', …)` → dedup; UUID → question shown).

**Post-fix gates:** API 664 tests across the touched surface (35 files) + web 83 registration tests green; api tsc 0, web tsc 0, api `eslint src scripts` 0, web `eslint src e2e` 0.

**Net additions beyond the dev-story:** `FOSSIL_LGA_ALIASES` map + enumerator write-site canonicalization (closes the live-form fossil window the story had routed to the 13-14 re-pin — the re-pin is still required, but a fossil submission can no longer persist a non-joining value in the interim), `--max-rows` arg-parsing hardening, CWD-independent backup dir, raw_data.lga_id authoritative-slug ordering, +8 tests.

## PM Validation (John, 2026-07-04)

**Validated — approved with two clarifications.**

1. **Canonical = slug is the correct call.** Confirmed the analytics layer (`l.code = r.lga_id` in report + survey-analytics), the scope filter (`scope.lgaCode`), and both form instruments already speak slug. The wizard's UUID write is the sole outlier. Flipping the system to UUID would touch every join + the enumerator path + the forms — far larger and riskier. Slug it is.

2. **Severity is under-sold as "cleanup" — it's a live correctness bug.** ~100% of the current registry (139/140) is public → their LGA rows already fail the join and render as UUID/"Unknown" on the geographic dashboard TODAY. And R3's `full`-per-LGA coverage floor is unmeasurable while the column is bi-vocabular. So: **pre-launch-eligible and HIGH priority — sequence it before per-LGA coverage becomes a launch-monitoring signal** (i.e., before enumerators fan out to the 33 LGAs). It is not launch-BLOCKING only because 13-14 removes the visible public double-ask.

3. **Relationship to 13-14 — keep BOTH, they're complementary (ruling):** 13-14's `lga_id` removal from the Public Core is the *immediate, form-only* fix that ships pre-launch with zero code. 13-16 is the *systemic* fix (values consistent everywhere). After 13-16, the Public Core *could* carry `lga_id` again (it would dedup correctly), but there's no need — leave it removed as belt-and-suspenders. **Do NOT make 13-14 depend on 13-16** (13-14 must be able to ship first, alone).

4. **Added-scope check (PM):** AC5's consumer audit MUST include the **me-service read-model** (`getEditableRegistration` `lgaId → lgaName`, Story 9-61) — it resolves LGA by slug, so the 139 public UUID rows have been mis-resolving there too; the AC2 backfill fixes it, but the audit must confirm no code path assumed UUID. Bob already flagged this in Dev Notes — elevating it into AC5's explicit checklist. No new AC needed.

**No blocking changes.** Story is dev-ready. Doc harmonization: 13-14's root-cause flag now points here; sprint-status entry deferred to the 13-15 close-out (Amelia holds the file).

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-05 | **Adversarial code review COMPLETE — APPROVED, status → done.** 6 findings (0H/3M/3L), all fixed in-session except M2 (selective-commit discipline, flagged as the open follow-up checkbox): M1 `--max-rows` arg hole, M3 enumerator write-site canonicalization + `FOSSIL_LGA_ALIASES` (6 retired form values → slug), L1 raw_data.lga_id authoritative ordering, L2 CWD-independent backup dir, L3 server-guard-is-the-net comment. +8 tests. Post-fix gates independently re-run green (API 664 targeted / web 83 / tsc / eslint). Operator residual unchanged: prod backfill dry-run→apply via Tailscale + the 13-14 publish/re-pin. | Fable 5 (adversarial review) |
| 2026-07-04 | Story drafted via *create-story — canonicalize `respondents.lgaId` to the slug across wizard + form + analytics; backfill the 139 UUID rows. Root cause of the 13-14 LGA duplicate AND the broken public LGA analytics (verified vs prod). 6 ACs / 5 Tasks. Pre-launch-eligible, not blocking. sprint-status entry DEFERRED (Amelia holds the file). | Bob (SM) |
| 2026-07-05 | **Post-dev additions (Awwal-directed, pre-code-review):** (A) 8 pre-existing `scripts/` lint errors fixed + lint gate widened to `eslint src scripts`; (B) the emergent form-vocabulary finding RESOLVED at the form level — generator + all 3 XLSX sources + questionnaire_schema.md + seed-projected-scale (4 more bad slugs found) corrected, PLUS a publish-time canonical-value guard (`canonicalValues` on `OSLSR_REQUIRED_CHOICE_LISTS.lga_list` + parser warning + 2 tests); (C) Public Core xlsx copied to `test-fixtures/` + README. Note for review: `oslsr_master_v3_email.xlsx` is gitignored — its patch is real but absent from the diff. | Awwal + Amelia (Dev) |
| 2026-07-04 | **dev-story COMPLETE (all 5 tasks).** Wizard writes the slug (Step2 `value={lga.code}` + stale-UUID-draft remap) + SERVER canonicalization guard at both public write-sites (`canonicalizeLgaId`, new service) + AC2 backfill script (preview-default, CSV backup, audited via new `OPERATOR_LGA_ID_CANONICALIZED`, idempotent) + AC5 audit (1 UUID-reliant reader corrected: personal-stats LGA fallback) + AC4 one-bucket real-DB tests. +22 tests. API 2981 + web 2724 green; tsc/eslint clean. **Operator residuals:** (1) prod backfill dry-run→apply via Tailscale; (2) align the 6 divergent form `lga_list` values to `lgas.code` before the 13-14 publish/pin. **⚠️ Emergent finding:** live master form `lga_list` = a third vocabulary for 6/33 LGAs (ibadan_ne/nw/se/sw, ogbomoso_*) — routed to 13-14 Task 2. Status → review. | Amelia (Dev) |

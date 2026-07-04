# Story 13-16: Canonicalize `respondents.lgaId` to the LGA slug (retire the wizard's UUID write)

Status: ready-for-dev

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
- [ ] **Task 1 (AC1)** — `Step2ContactLga.tsx`: `<option value={lga.code}>`; confirm `useLgas`/`/lgas/public` returns `code`; update any web test asserting the UUID value.
- [ ] **Task 2 (AC2)** — write `apps/api/scripts/migrate-lgaid-uuid-to-slug.ts` (idempotent; UUID-shaped only; audited via `audit_logs`; CSV backup of pre-values). Dry-run then run on prod via Tailscale.
- [ ] **Task 3 (AC3, AC5)** — verify the wizard dedup hides `lga_id` post-change; run the consumer grep-audit; fix any UUID-assuming reader.
- [ ] **Task 4 (AC4, AC6)** — tests (wizard-writes-slug, backfill idempotency, one-bucket LGA aggregate, scope filter) + full suite; targeted `tsc`/eslint clean.
- [ ] **Task 5** — update 13-14 (its `lga_id` removal is now defense-in-depth, not the sole fix) + note in the geographic-dashboard/12-6/13-6 stories that per-LGA coverage is now trustworthy.

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
### File List

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
| 2026-07-04 | Story drafted via *create-story — canonicalize `respondents.lgaId` to the slug across wizard + form + analytics; backfill the 139 UUID rows. Root cause of the 13-14 LGA duplicate AND the broken public LGA analytics (verified vs prod). 6 ACs / 5 Tasks. Pre-launch-eligible, not blocking. sprint-status entry DEFERRED (Amelia holds the file). | Bob (SM) |

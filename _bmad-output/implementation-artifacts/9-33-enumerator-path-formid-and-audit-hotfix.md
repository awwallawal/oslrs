# Story 9.33: Hotfix — enumerator-path formId mismatch + missing audit on active-respondent creation

Status: ready-for-dev

<!--
Authored 2026-05-31 by Bob (SM) via canonical *create-story --yolo workflow.

ORIGIN: Story 9-18 Task 0.2 enumerator-path smoke test (committed
2026-05-31 as standalone script `apps/api/scripts/_enumerator-path-
smoke-test.ts`, then iteratively debugged across commits `b4c41cc`
→ `c5b53dc` → `e64c780` → `3eab853` → `0a30c01` → `0417651`)
caught TWO critical production bugs while validating the enumerator
submission code path at scale > 1. Both bugs silently fail (no error
visible to clients) but corrupt downstream data integrity. Both
block this week's field deployment.

PRIORITY: SEQUENCE-JUMPS ahead of Stories 9-16 / 9-17 / 9-18. Field
enumerators ship before any of those; both bugs must be fixed first
or every field-collected enumerator submission orphans its
respondent linkage AND emits zero audit events.

EFFORT: ~1 day (4-6 hours focused work). Code surface is small:
~2 service files changed + ~3 test files updated + smoke-test
simplification.

PRECEDENT: this story pattern matches Story 9-15 (prod-gate-telegram-
alerts) — a "found via UAT/smoke-test, ship the hotfix, story flips
review→done same week" hotfix. Sibling discipline applies.
-->

## Story

As the **operator pushing 50+ enumerators to field this week**,
I want **(a) the enumerator submission code path to correctly link respondents to submissions instead of orphaning them on a formId mismatch, and (b) every active-respondent creation via the enumerator queue to emit a hash-chained audit event matching the NDPA forensic-trail requirement**,
So that **field-collected data is queryable + analyzable in the registry the moment enumerators start submitting, AND the audit chain has a complete record of every respondent's provenance for compliance defense**.

## Background — why this story exists

### The bugs the smoke test caught

**Bug #1 (CRITICAL — data orphaning)** — `formId` mismatch:
- `GET /api/v1/forms/public-active` returns `data.formId = schema.id` (the JSONB-embedded inner id at `form_schema->>'id'`)
- `submission-processing.service.ts:199` looks up `questionnaire_forms.id` (the row primary key)
- Verified on prod 2026-05-31: setting `wizard.public_form_id = 019e24ef-9629-77ef-8a3e-12517d34bbff` (row PK) vs `form_schema->>'id' = 019e24ef-9617-79f2-a2c6-71aa2531ac79` (inner). Different values; the endpoint returns the inner.
- Failure mode: HTTP 201 returns to client → submissions row writes (raw_data persists) → BullMQ worker fires `webhook_ingestion.permanent_error: "Form schema not found for questionnaireFormId: <inner-id>"` → respondent_id stays NULL → data effectively orphaned
- Why undetected: only 1 production enumerator submission ever (pre-2026-05-31), and it must have used the row PK directly. Every new enumerator submission going forward would hit this.

**Bug #2 (CRITICAL — NDPA forensic gap)** — missing audit on active-respondent creation:
- `submission-processing.service.ts:491-499` emits `PENDING_NIN_CREATED` audit ONLY when `status === 'pending_nin_capture'`
- For ACTIVE respondents (NIN provided + Modulus-11 valid + non-duplicate), NO audit event emits anywhere in the create method
- Story 6-1 hash-chain audit ledger has ZERO record of "enumerator created this respondent"
- Empirically confirmed by smoke test: 5 active respondents created via enumerator path → 0 audit_logs rows
- Why undetected: same as Bug #1 — the broken path meant active respondents weren't being created at all. Once Bug #1 is fixed and active respondents start landing, Bug #2 becomes the next dark window.

### What the smoke test actually showed (commit `0417651` final run)

| Metric | Result | Diagnosis |
|---|---|---|
| POST phase (5 concurrent) | ✅ 5/5 HTTP 201 | Controller + auth working |
| submissions row landed | ✅ 5/5 raw_data persisted | DB write working |
| respondent_id linked (post-Bug-#1-workaround) | ✅ 5/5 | Bug #1 isolated to formId resolution |
| audit_logs emitted | ❌ 0/5 | Bug #2 — missing audit emission |

The smoke test's Bug #1 workaround (reading the setting + row PK directly via DB) is FRAGILE — it bypasses the public API. After this hotfix ships, the workaround comes out and the script uses the canonical `/forms/public-active` endpoint as designed.

## Acceptance Criteria

### Part A — Bug #1 fix: `flattenForRender` returns row PK as `formId`

1. **AC#A1 — `NativeFormService.flattenForRender` signature change**. At `apps/api/src/services/native-form.service.ts:424`, change the signature from `flattenForRender(schema: NativeFormSchema): FlattenedForm` to `flattenForRender(schema: NativeFormSchema, formRowId: string): FlattenedForm`. Update the returned object at line 455 to use `formId: formRowId` (NOT `schema.id`). The inner `schema.id` is metadata-only (an internal version-tracking artifact); the row primary key is the canonical client-facing identifier used by all downstream worker lookups.

2. **AC#A2 — `getPublicActiveForm` passes row PK to flattener**. At `apps/api/src/services/native-form.service.ts:417`, update the call from `return this.flattenForRender(schema)` to `return this.flattenForRender(schema, form.id)` — the `form` row variable is already in scope from the `findFirst` query at line 401-403.

3. **AC#A3 — `getFormForRender` controller passes row PK**. At `apps/api/src/controllers/form.controller.ts:78-89`, the controller currently calls `getPublishedFormSchema(id)` (which returns the JSONB schema, not the row). Refactor to either (a) modify `getPublishedFormSchema` to ALSO return the row id alongside the schema (recommended — minimizes future bugs), OR (b) inline a fresh row lookup in the controller. Pass the row id to `flattenForRender(schema, rowId)`. The `id` URL-param IS the row PK in this endpoint (path is `/forms/:id/render`), so the controller can pass `id` directly without a second DB query.

4. **AC#A4 — `previewForm` controller passes row PK**. At `apps/api/src/controllers/form.controller.ts:95-106`, the controller calls `getFormSchema(id)` (returns schema only). Same refactor as AC#A3: either modify `getFormSchema` to return both, OR inline. URL-param `id` IS the row PK in this endpoint too (path `/forms/:id/preview`). Pass `id` to `flattenForRender(schema, id)`.

5. **AC#A5 — `questionnaire.controller.ts:286` passes row PK**. The third call site of `flattenForRender` is in `questionnaire.controller.ts`. Audit the surrounding context, determine the source of the row PK at that call site, and pass it through. (Likely the same pattern as form controllers — a URL `:id` param that IS the row PK.)

6. **AC#A6 — `getPublishedFormSchema` + `getFormSchema` signature audit (RECOMMENDED refactor)**. The cleanest fix is to change these two helpers (lines 317-327 and 332-346) to return `{ id: string; schema: NativeFormSchema }` instead of just the schema. Then callers don't need a second DB query for the row id. If this refactor is in scope, all three controller call sites become trivially correct. If out of scope, document the deferral.

7. **AC#A7 — Test update: `form.controller.test.ts:161`**. The existing mock assertion `expect(NativeFormService.flattenForRender).toHaveBeenCalledWith(mockSchema)` MUST update to `expect(NativeFormService.flattenForRender).toHaveBeenCalledWith(mockSchema, expectedRowId)`. Apply the same update to any other test that mocks the signature.

8. **AC#A8 — Regression test in `native-form.service.test.ts`**. Add a NEW test in the `describe('NativeFormService.flattenForRender')` block (currently around line 345): assert that when `flattenForRender(schema, 'row-pk-uuid-here')` is called, the returned `formId` is `'row-pk-uuid-here'` — NOT `schema.id`. This locks in the fix permanently against future regressions.

### Part B — Bug #2 fix: audit emission for active-respondent creation

9. **AC#B1 — Add `AuditService.logAction` call after active-respondent INSERT**. At `apps/api/src/services/submission-processing.service.ts` (immediately after the `.returning()` call at line 486, parallel to the PENDING_NIN_CREATED audit at lines 491-499), add an audit emission for the ACTIVE-status branch:
   ```typescript
   if (status !== 'pending_nin_capture') {
     AuditService.logAction({
       actorId: submitterId ?? null,
       action: AUDIT_ACTIONS.DATA_CREATE,
       targetResource: 'respondent',
       targetId: created.id,
       details: {
         source,
         submission_uid: submission.submissionUid,
         has_nin: !!data.nin,
         creation_path: 'enumerator_queue_processor',
       },
     });
   }
   ```
   Uses the EXISTING `DATA_CREATE` action enum value (`audit.service.ts:47` — already in the schema; no new enum value needed). The `creation_path` detail distinguishes this from other DATA_CREATE emission sites (the 24 existing prod DATA_CREATE entries likely come from the wizard's `submitWizard` controller).

10. **AC#B2 — Audit emission survives transaction rollback semantics**. The `AuditService.logAction` call is fire-and-forget (matches existing line 491-499 pattern; no `await`). It runs OUTSIDE the respondent INSERT transaction. If the audit chain itself fails (Story 6-1 hash-chain serialization), the respondent still exists — accept that asymmetry per existing codebase precedent.

11. **AC#B3 — Unit test for audit emission**. Add a test in `submission-processing.service.test.ts` (or wherever the existing PENDING_NIN_CREATED audit is covered): seed an active-respondent submission, run `processSubmission`, then assert `AuditService.logAction` was called with `action: AUDIT_ACTIONS.DATA_CREATE` + `targetId: <created respondent's id>` + `details.creation_path: 'enumerator_queue_processor'`. Mock `AuditService.logAction` per existing patterns.

12. **AC#B4 — No effect on PENDING_NIN_CREATED branch**. The audit emission at line 491-499 (for `status === 'pending_nin_capture'`) is UNCHANGED. The new emission at AC#B1 is mutually exclusive with the existing pending-NIN audit — the `if (status !== 'pending_nin_capture')` guard ensures exactly ONE audit emits per respondent creation.

### Part C — Smoke test re-verification + workaround removal

13. **AC#C1 — Smoke test workaround removed**. After both fixes deploy, simplify `apps/api/scripts/_enumerator-path-smoke-test.ts` `fetchActiveFormSchema` (currently at the row-PK-via-setting workaround) back to using the public API endpoint:
    ```typescript
    async function fetchActiveFormSchema(targetHost: string): Promise<FormSchema> {
      const res = await fetch(`${targetHost}/api/v1/forms/public-active`);
      // ... use data.formId directly
    }
    ```
    Keep the previous workaround code COMMENTED OUT below the new implementation with a clear note: `// removed 2026-XX-XX after Story 9-33 hotfix made /forms/public-active return the row PK as formId`. Future-readers can audit-trail the bug discovery via the commented code.

14. **AC#C2 — Smoke test re-runs green**. Operator runs `tsx scripts/_enumerator-path-smoke-test.ts --confirm-i-am-not-dry-running --count 5` on the VPS. Expected output:
    ```
    POST phase: 5 concurrent submissions in <Nms>
      ✅ #1 HTTP 201
      ... (5x)
    Verification phase:
      sub ✅  resp ✅  raw_data ✅  audit ✅   (5x)
    Summary: 5/5 fully verified (POST failures: 0)
    Cleaning up synthetic rows...
      Deleted 5 submissions / 5 respondents
    Exit code: 0
    ```
    The 5/5 audit ✅ is the key regression-prevention signal: it proves both bugs are fixed.

15. **AC#C3 — Zero regression in test suite**. `pnpm test` from repo root passes 4/4 packages with zero new failures + zero new warnings. Existing test counts (API ~2219 passed pre-hotfix) only grow by the new tests added in AC#A7 + AC#A8 + AC#B3 (~3-5 new tests total). tsc clean both apps.

## Tasks / Subtasks

- [ ] **Task 1: Bug #1 — `flattenForRender` signature change + all 4 call sites (AC: #A1, #A2, #A3, #A4, #A5)**
  - [ ] 1.1: Update `NativeFormService.flattenForRender` signature + return value (line 424-463). Add JSDoc note explaining that `formId` returned in `FlattenedForm` is the row primary key, NOT the JSONB inner `schema.id`.
  - [ ] 1.2: Update `getPublicActiveForm` (line 417) to pass `form.id`.
  - [ ] 1.3: Decision point: refactor `getPublishedFormSchema` + `getFormSchema` to return `{ id, schema }` (recommended per AC#A6), OR inline the controller-side row id lookup. Document the choice in the story Dev Agent Record.
  - [ ] 1.4: Update `form.controller.ts:78-89` (`getFormForRender`).
  - [ ] 1.5: Update `form.controller.ts:95-106` (`previewForm`).
  - [ ] 1.6: Audit + update `questionnaire.controller.ts:286` call site.
  - [ ] 1.7: Grep for any other `flattenForRender` call site that didn't show up in the initial audit. Surface in Dev Agent Record if found.

- [ ] **Task 2: Bug #2 — audit emission for active-respondent creation (AC: #B1, #B2, #B4)**
  - [ ] 2.1: Add `AuditService.logAction` call at `submission-processing.service.ts` (immediately after line 486 `.returning()`, in an `else` or `if (status !== 'pending_nin_capture')` block, parallel to lines 491-499).
  - [ ] 2.2: Use `AUDIT_ACTIONS.DATA_CREATE` (existing — no new enum value needed; symmetric with the wizard's existing 24 DATA_CREATE audit emissions in prod).
  - [ ] 2.3: Verify the `if` branch is mutually exclusive with the existing PENDING_NIN_CREATED emission so exactly one audit fires per respondent creation.

- [ ] **Task 3: Tests + regression coverage (AC: #A7, #A8, #B3, #C3)**
  - [ ] 3.1: Update `form.controller.test.ts:161` mock assertion for the new signature (or relevant test file).
  - [ ] 3.2: Add new test in `native-form.service.test.ts` `flattenForRender` describe block — assert `formId === passed-rowId` (NOT `schema.id`).
  - [ ] 3.3: Add new test in `submission-processing.service.test.ts` — assert active-respondent path emits `DATA_CREATE` audit with `targetResource: 'respondent'`, `targetId: <createdId>`, `details.creation_path: 'enumerator_queue_processor'`.
  - [ ] 3.4: Verify mutual exclusion test — pending-NIN path still emits PENDING_NIN_CREATED only (NOT both).
  - [ ] 3.5: Run `pnpm --filter @oslsr/api test` — expect ~3-5 net new tests, all passing, zero regressions. Confirm full `pnpm test` 4/4 packages green.
  - [ ] 3.6: tsc clean both apps.

- [ ] **Task 4: Smoke-test workaround removal + verification (AC: #C1, #C2)**
  - [ ] 4.1: After Tasks 1-3 commit + push + CI deploy, edit `apps/api/scripts/_enumerator-path-smoke-test.ts` `fetchActiveFormSchema` to use the canonical `/forms/public-active` endpoint directly. Keep the old workaround code commented out with a date+story marker for future archaeology.
  - [ ] 4.2: Operator runs `--dry-run --count 5` on VPS — confirm payload preview shows the row-PK as `formId` (NOT the inner schema.id).
  - [ ] 4.3: Operator runs `--confirm-i-am-not-dry-running --count 5` on VPS. Capture output. Expected: 5/5 across all four columns (sub / resp / raw_data / **audit ✅**).
  - [ ] 4.4: If any verification ❌: STOP, document in Dev Agent Record, do NOT mark story done. Operator triages.
  - [ ] 4.5: If 5/5 ✅: store the captured output in story Dev Agent Record. Story flips review → done.

- [ ] **Task 5: Pre-merge code review on uncommitted tree (AC: #A1-#C3 collectively)**
  - [ ] 5.1: Per project `feedback_review_before_commit.md` discipline, run `/code-review` (or `bmad:bmm:workflows:code-review`) on the uncommitted working tree before any commit. Auto-fix HIGH/MEDIUM findings per established Story 9-12 / 9-17 / 9-27 / 9-30 patterns. LOW findings may be deferred to §Review Follow-ups (AI) with rationale.
  - [ ] 5.2: Verify the audit emission's mutual exclusion is unambiguous (single branch, no double-emit risk).
  - [ ] 5.3: Verify `flattenForRender` JSDoc explicitly warns future-readers that `formId` IS the row PK — prevents accidental re-introduction of the bug.

## Dev Notes

### Why DATA_CREATE and not a new RESPONDENT_CREATED enum

The existing prod audit-action distribution (from the 2026-05-31 VPS pull) shows 24 `DATA_CREATE` audit events — likely emitted by the wizard's `submitWizard` controller in `apps/api/src/controllers/registration.controller.ts` after Story 9-26's transactional fix. Reusing `DATA_CREATE` here keeps the action enum stable AND makes the audit-log query "who created what" symmetric across creation channels (wizard / enumerator-queue / future-import). The `details.creation_path` field distinguishes the channel for forensic purposes.

If a future story wants finer per-channel auditing, it can either (a) add a discriminating prefix like `RESPONDENT_CREATED_VIA_ENUMERATOR`, or (b) just filter `details.creation_path` — both work. The hotfix keeps things minimal.

### Why fire-and-forget audit (no await)

The existing PENDING_NIN_CREATED audit at lines 491-499 is fire-and-forget (no `await`). The new emission MUST mirror this — otherwise we introduce a behavior asymmetry where audit chain failures in one path block the respondent INSERT while the other path's failures don't. Story 6-1's hash-chain serializes the audit writes internally; the caller doesn't need to await for chain integrity.

### Story 9-34 follow-up candidate (audit-pattern unification)

The wizard path (`submitWizard` in `registration.controller.ts`) and the enumerator path (after this hotfix) both emit DATA_CREATE on respondent creation. Other paths (manual creation via the questionnaire controller? CSV import via Story 11-2 future ship?) may or may not. A future Story 9-34 could audit ALL respondent-creation code paths in the codebase and ensure every one emits a consistent DATA_CREATE event. Out of scope for this hotfix.

### Why the smoke test's workaround stays in code (commented)

The workaround (reading `wizard.public_form_id` setting + querying `questionnaire_forms` row directly) became the script's WORKING code for the 2026-05-31 smoke test run. Without that workaround, we wouldn't have caught Bug #2. Preserving it in the file (commented out, with a date+story marker) gives future maintainers an archaeology trail when they grep for "why was this script ever written this way."

### File-level overlap with parallel-track stories

- **Story 9-16 (magic-link login)**: no overlap. 9-16 touches `auth.service.ts` + `auth.controller.ts` + frontend; 9-33 touches `native-form.service.ts` + `submission-processing.service.ts`. Safe to ship in parallel.
- **Story 9-17 (form pin + Pattern C dedup)**: no overlap. 9-17 is frontend wizard + Q.M. page changes.
- **Story 9-18 (wizard NIN-first)**: no overlap. 9-18 is wizard frontend + `submitWizard` controller.
- **Story 9-27 Part B (SMS via Termii)**: no overlap.
- **Story 9-32 (account-settings)**: no overlap.

The hotfix can ship FAST without coordination with any other in-flight story.

### Sequencing — locked 2026-05-31

```
NOW (this story 9-33) — wizard not yet redesigned but field deployment imminent
  → Hotfix ships before field deployment (THIS WEEK)
  → Smoke test re-runs green
  → Enumerators deploy to field
  → Field-collected data lands cleanly + audited end-to-end

PARALLEL (in flight)
  → Story 9-16 / 9-17 / 9-18 wizard-redesign arc (3-5 weeks)
  → Cohort A / B blasts (Resend Pro + Termii operator signups in flight)
```

### References

- [Source: apps/api/src/services/native-form.service.ts:424-463] — flattenForRender (Bug #1 fix site)
- [Source: apps/api/src/services/native-form.service.ts:417] — getPublicActiveForm (Bug #1 caller)
- [Source: apps/api/src/services/native-form.service.ts:317-327] — getFormSchema (Bug #1 caller — needs row-id signature change OR controller-side inline lookup)
- [Source: apps/api/src/controllers/form.controller.ts:78-89] — getFormForRender (Bug #1 caller)
- [Source: apps/api/src/controllers/form.controller.ts:95-106] — previewForm (Bug #1 caller)
- [Source: apps/api/src/controllers/questionnaire.controller.ts:286] — flattenForRender call (Bug #1 caller)
- [Source: apps/api/src/services/submission-processing.service.ts:486] — active-respondent INSERT (Bug #2 fix site — audit emission goes immediately after)
- [Source: apps/api/src/services/submission-processing.service.ts:491-499] — existing PENDING_NIN_CREATED audit pattern (Bug #2 mirror)
- [Source: apps/api/src/services/audit.service.ts:47] — `DATA_CREATE: 'data.create'` (existing enum value reused)
- [Source: apps/api/scripts/_enumerator-path-smoke-test.ts] — the script that caught both bugs (workaround at `fetchActiveFormSchema` to be removed in Task 4.1)
- [Source: docs/session-2026-05-31.md] — session notes covering the bug discovery chain
- [Source: _bmad-output/implementation-artifacts/9-18-wizard-nin-first-and-summary-save.md § "Task 0.2"] — original task that spawned this hotfix
- Memory: [[project_field_readiness_sequence_2026_05_31]] — sequencing rationale
- Memory: [[feedback_review_before_commit]] — discipline for Task 5
- Story 6-1 — audit chain (hash-chained ledger)
- Story 9-26 — wizard hemorrhage fix (the model for "broken-but-silent path produces orphan data"; 9-33 follows the same diagnostic discipline)

## Dev Agent Record

### Agent Model Used

(to be populated by dev-story — likely Amelia / Claude Opus 4.7)

### Pre-impl Decision Log

(to be populated — particularly AC#A6 refactor scope decision)

### Debug Log References

- Smoke test commit chain (the bug-discovery archaeology):
  - `b4c41cc chore(9-18): standalone enumerator-path smoke test script`
  - `c5b53dc fix(9-18): smoke-test payload now schema-driven`
  - `e64c780 fix(9-18): smoke-test payload missing formVersion field`
  - `3eab853 fix(9-18): smoke test bypasses /forms/public-active formId mismatch bug` ← Bug #1 root cause
  - `0a30c01 fix(9-18): smoke test reuses NativeFormService.flattenForRender for choice resolution`
  - `0417651 chore(9-18): smoke-test cleanup handles full FK cascade`
- Cohort numbers + audit state on 2026-05-31 are in `docs/session-2026-05-31.md` + memory file

### Completion Notes List

(to be populated)

### File List

(to be populated — expected ~3 modified + ~3 test-modified + 1 smoke-test-simplification = ~7 files)

### Review Follow-ups (AI)

(to be populated post-code-review)

### Smoke-test re-verification (AC #C2)

(to be populated post-deploy — expected 5/5 ✅ across all four verification columns)

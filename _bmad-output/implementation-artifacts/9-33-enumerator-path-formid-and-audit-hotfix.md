# Story 9.33: Hotfix — enumerator-path formId mismatch + missing audit on active-respondent creation

Status: review

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

   > **As-built (code review L1/L2):** the `submission_uid` key was dropped (the `submission` object is out of scope inside `findOrCreateRespondent` — see Decision Log), `has_nin` was dropped (it is a constant `true` in this branch — Decision Log), and `creation_path` was named **`'submission_queue_processor'`** rather than `'enumerator_queue_processor'` because the branch also fires for `clerk`/`public-with-NIN` sources. The actual collection channel is captured by the `source` detail.

10. **AC#B2 — Audit emission survives transaction rollback semantics**. The `AuditService.logAction` call is fire-and-forget (matches existing line 491-499 pattern; no `await`). It runs OUTSIDE the respondent INSERT transaction. If the audit chain itself fails (Story 6-1 hash-chain serialization), the respondent still exists — accept that asymmetry per existing codebase precedent.

11. **AC#B3 — Unit test for audit emission**. Add a test in `submission-processing.service.test.ts` (or wherever the existing PENDING_NIN_CREATED audit is covered): seed an active-respondent submission, run `processSubmission`, then assert `AuditService.logAction` was called with `action: AUDIT_ACTIONS.DATA_CREATE` + `targetId: <created respondent's id>` + `details.creation_path: 'submission_queue_processor'` (renamed from `'enumerator_queue_processor'` per code review L2). Mock `AuditService.logAction` per existing patterns.

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

- [x] **Task 1: Bug #1 — `flattenForRender` signature change + all 4 call sites (AC: #A1, #A2, #A3, #A4, #A5)**
  - [x] 1.1: Updated `NativeFormService.flattenForRender(schema, formRowId)` signature + return value (`formId: formRowId`). Added JSDoc warning that `formId` is the row PK, NOT the JSONB inner `schema.id`.
  - [x] 1.2: Updated `getPublicActiveForm` to pass `form.id`.
  - [x] 1.3: **Decision: chose option (b) — inline the row id at each call site** (the `:id` URL param IS the row PK; `getPublicActiveForm` already holds it via `form.id`). AC#A6 helper return-shape refactor DEFERRED. See Pre-impl Decision Log.
  - [x] 1.4: Updated `form.controller.ts` `getFormForRender` → `flattenForRender(schema, id)`.
  - [x] 1.5: Updated `form.controller.ts` `previewForm` → `flattenForRender(schema, id)`.
  - [x] 1.6: Updated `questionnaire.controller.ts` `getFormPreview` → `flattenForRender(schema, id)`.
  - [x] 1.7: Grepped the whole `apps/api/src` tree for `flattenForRender` callers. Confirmed exactly **4** call sites (the 3 controllers + `getPublicActiveForm`) — no hidden 5th. All 4 now pass the row PK.

- [x] **Task 2: Bug #2 — audit emission for active-respondent creation (AC: #B1, #B2, #B4)**
  - [x] 2.1: Added `AuditService.logAction` in an `else` branch parallel to the PENDING_NIN_CREATED emission in `findOrCreateRespondent`.
  - [x] 2.2: Used `AUDIT_ACTIONS.DATA_CREATE` (existing enum, no new value).
  - [x] 2.3: Verified mutual exclusion — `if (status === 'pending_nin_capture') {...} else {...}` guarantees exactly one audit per creation.

- [x] **Task 3: Tests + regression coverage (AC: #A7, #A8, #B3, #C3)**
  - [x] 3.1: Updated `form.controller.test.ts` mock assertion → `toHaveBeenCalledWith(mockSchema, 'form-uuid-1')`. (The other 3 `flattenForRender` callers are exercised through `native-form.service.test.ts` and integration coverage; no further mock-arity updates needed.)
  - [x] 3.2: Added AC#A8 regression test in `native-form.service.test.ts` — `formId === passed-rowId` and `!== schema.id`.
  - [x] 3.3: Added Bug #2 test in `submission-processing.service.test.ts` — active path emits `DATA_CREATE` with `targetResource`/`targetId`/`actorId`/`details.creation_path`.
  - [x] 3.4: Added mutual-exclusion tests (active≠pending and pending≠active).
  - [x] 3.5: `pnpm --filter @oslsr/api test` → **2228 passed / 7 skipped / 0 failed**; +3 net new tests; zero regressions.
  - [x] 3.6: tsc clean both apps (API exit 0, web exit 0); API lint exit 0.

- [~] **Task 4: Smoke-test workaround removal + verification (AC: #C1, #C2)** — 4.1 done; 4.2–4.5 OPERATOR/post-deploy
  - [x] 4.1: Edited `_enumerator-path-smoke-test.ts` `fetchActiveFormSchema` to use canonical `/forms/public-active`. Old DB-direct workaround preserved commented with date+story marker.
  - [ ] 4.2: ⏳ OPERATOR — `--dry-run --count 5` on VPS post-deploy; confirm payload `formId` = row PK.
  - [ ] 4.3: ⏳ OPERATOR — `--confirm-i-am-not-dry-running --count 5`; expect 5/5 across sub/resp/raw_data/audit.
  - [ ] 4.4: ⏳ OPERATOR — any ❌ → STOP, document, do NOT flip done.
  - [ ] 4.5: ⏳ OPERATOR — 5/5 ✅ → paste output into §Smoke-test re-verification; flip review → done.

- [x] **Task 5: Pre-merge code review on uncommitted tree (AC: #A1-#C3 collectively)**
  - [x] 5.1: ✅ DONE 2026-05-31 — ran `bmad:bmm:workflows:code-review` on the uncommitted tree per `feedback_review_before_commit.md`. 0 Critical / 0 High / 3 Medium / 3 Low; all 6 findings fixed same session. See § Review Follow-ups (AI).
  - [x] 5.2: Self-check — audit mutual exclusion unambiguous (single `if/else`, covered by dedicated tests incl. the new `toHaveBeenCalledTimes(1)` assertions).
  - [x] 5.3: Self-check — `flattenForRender` JSDoc explicitly warns `formId` IS the row PK.

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
- **Story 9-17 (form pin + Pattern C dedup)**: no FILE overlap. 9-17 is frontend wizard + Q.M. page changes. **BUT see the contract-level caveat below.**
- **Story 9-18 (wizard NIN-first)**: no FILE overlap. 9-18 is wizard frontend + `submitWizard` controller. **BUT see the contract-level caveat below.**
- **Story 9-27 Part B (SMS via Termii)**: no overlap.
- **Story 9-32 (account-settings)**: no overlap.

The hotfix can ship FAST without coordination with any other in-flight story.

#### ⚠️ Contract-level blast radius (added 2026-05-31 by code review — finding M1)

The original "no overlap" claim above was true at the **file** level but **false at the contract level**. Bug #1's fix changes what `GET /api/v1/forms/public-active` returns in `data.formId` (was the JSONB `schema.id`; now the row PK). The **public wizard** consumes that exact field:

- `apps/web/src/features/registration/pages/Step4Questionnaire.tsx:73` stamps `questionnaireFormId: form.formId` into the wizard draft.
- `registration.controller.ts:submitWizard` (line ~574) persists that value into `submissions.questionnaireFormId`.

So **every public-wizard submission is also affected** by this change, not just the enumerator path. The impact is **benign-to-positive**, verified during review:
- `submitWizard` inserts the submissions row with `processed: true` and never re-resolves the form via the ingestion worker, so the changed `questionnaireFormId` is not looked up → no runtime break.
- The new value (row PK) is a **valid FK** into `questionnaire_forms.id`, whereas the old `schema.id` was an orphan reference. The fix therefore *improves* wizard submission integrity as a side effect.

No web-side code change is required. Logged here so the blast radius is documented rather than implied-absent.

#### Cutover data inconsistency in `submissions.questionnaireFormId` — accepted forward-only (code review finding M2)

This fix is **forward-only**. Rows written before deploy carry the old identifier; rows after carry the row PK:

- **Wizard rows (`source='public'`)**: pre-fix rows stored `schema.id`; post-fix store the row PK. Any analytics/grouping query keyed on `submissions.questionnaireFormId` will see two distinct values for the same logical form across the cutover boundary.
- **Enumerator/worker rows**: only **1** production enumerator submission has ever existed (per the 2026-05-31 data-integrity check), and it was orphaned (`respondent_id` NULL) by Bug #1. This fix does **not** retroactively re-link that historical row.

**Decision: accept the inconsistency; no backfill migration in this hotfix.** Rationale:
1. The pinned public form is currently a single form, so analytics queries that need a stable key should group on `submissions.source` or `raw_data` accessors (which is already the dominant pattern) rather than `questionnaireFormId`.
2. A backfill would have to rewrite historical `questionnaireFormId` values and re-resolve the single orphaned enumerator submission — a riskier, separately-testable change than this small, hot-path fix warrants under field-deployment time pressure.
3. The volume is tiny (≤1 orphaned enumerator row; wizard rows are not broken, just keyed differently).

**Follow-up:** if a future story needs a uniform `questionnaireFormId` across the cutover, raise it alongside the **Story 9-34 audit-pattern unification** candidate (below) — both are "sweep all historical rows for consistency" tasks.

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

Claude Opus 4.8 (1M context) — `claude-opus-4-8[1m]` — via dev-story workflow, 2026-05-31.

### Pre-impl Decision Log

- **AC#A6 (helper return-shape refactor) — DEFERRED; chose AC#A3/A4 option (b).** Rather than change `getFormSchema` / `getPublishedFormSchema` to return `{ id, schema }`, the row PK is passed inline at each call site. In every render/preview endpoint the `:id` URL param IS the questionnaire_forms row PK (these helpers look up `eq(questionnaireForms.id, formId)`), and `getPublicActiveForm` already holds the row PK in scope (`form.id`). Inlining is a smaller, lower-risk surface than changing two helpers' return shape, introduces no second DB query, and is provably correct. Call sites remain trivially adaptable if a future story wants the safer shape.
- **Bug #2 audit details keys.** Final as-built keys: `{ source, creation_path: 'submission_queue_processor' }`. Dropped the AC pseudocode's `submission_uid` key — the `submission` object is NOT in scope inside `findOrCreateRespondent(data, source, submitterId)`; the sibling PENDING_NIN_CREATED audit at this site likewise logs only `{ source }`. `source` already records the collection channel.
  - **Code review L1 — dropped `has_nin`.** The else branch runs only when `status === 'active'`, which (per `status = data.nin ? 'active' : 'pending_nin_capture'`) means `data.nin` is always truthy, so `has_nin` would be a constant `true`. Removed as redundant/misleading.
  - **Code review L2 — renamed `creation_path` → `'submission_queue_processor'`.** The branch fires for ANY active creation via the ingestion worker (enumerator / clerk / public-with-NIN), so the original `'enumerator_queue_processor'` label undercounted the channel. The `source` detail records the true channel. Safe to rename: Bug #2 meant zero prod audit rows carried the old value, so no historical data references it.
- **Fire-and-forget (no `await`)** mirroring the sibling branch (AC#B2) — audit-chain failure must not roll back the INSERT that already succeeded.

### Debug Log References

- **Call-site audit (Task 1.7).** Grepped the entire `apps/api/src` tree: exactly 4 `flattenForRender` callers exist (3 controllers + `getPublicActiveForm`), matching the story's expectation. No hidden call sites. (`respondent.service.ts` builds its render sections via `buildChoiceMaps`, not `flattenForRender`, so it is unaffected.)
- **Tool-channel caution during this session.** Interleaved/stale tool results briefly suggested a non-existent "5th call site"; re-verified against disk (`grep` of the live tree) before finalizing — the authoritative count is 4. Lesson logged so the File List reflects only files actually changed (confirmed via `git status`).
- **Validation (definitive, sequential runs):** API `pnpm test` → 2228 passed / 7 skipped / 0 failed (155 files); +3 net new tests (1 AC#A8 + 2 Bug #2). API tsc exit 0; web tsc exit 0; API lint exit 0.

- Smoke test commit chain (the bug-discovery archaeology):
  - `b4c41cc chore(9-18): standalone enumerator-path smoke test script`
  - `c5b53dc fix(9-18): smoke-test payload now schema-driven`
  - `e64c780 fix(9-18): smoke-test payload missing formVersion field`
  - `3eab853 fix(9-18): smoke test bypasses /forms/public-active formId mismatch bug` ← Bug #1 root cause
  - `0a30c01 fix(9-18): smoke test reuses NativeFormService.flattenForRender for choice resolution`
  - `0417651 chore(9-18): smoke-test cleanup handles full FK cascade`
- Cohort numbers + audit state on 2026-05-31 are in `docs/session-2026-05-31.md` + memory file

### Completion Notes List

- **Bug #1 fixed.** `NativeFormService.flattenForRender(schema, formRowId)` now requires + returns the row PK as `formId`. All **4** call sites updated to pass the row PK (3 controllers — `getFormForRender` / `previewForm` / `getFormPreview` — plus `getPublicActiveForm`). Enumerator/public/clerk submissions resolve `questionnaire_forms` by the correct PK — no more orphaned respondent linkage.
- **Bug #2 fixed.** Active-respondent creation via the submission-ingestion queue now emits a `DATA_CREATE` audit (fire-and-forget), closing the NDPA forensic gap. Mutually exclusive with PENDING_NIN_CREATED.
- **AC#C1 done.** Smoke-test `fetchActiveFormSchema` switched to the canonical `/forms/public-active` endpoint; the DB-direct workaround is preserved commented for archaeology.
- **Validation (sequential, definitive):** API `pnpm test` → 2228 passed / 7 skipped / 0 failed (155 files), +3 net new tests; API tsc + web tsc exit 0; API lint exit 0.
- **Remaining (not dev-completable here):** AC#C2 operator smoke-test on the VPS post-deploy (Tasks 4.2–4.5) flips review → done; Task 5.1 adversarial code-review recommended on a different LLM/session before commit.

### File List

Modified (production code):
- `apps/api/src/services/native-form.service.ts` — `flattenForRender` signature + JSDoc + `getPublicActiveForm` call
- `apps/api/src/controllers/form.controller.ts` — `getFormForRender` + `previewForm` call sites
- `apps/api/src/controllers/questionnaire.controller.ts` — `getFormPreview` call site
- `apps/api/src/services/submission-processing.service.ts` — Bug #2 DATA_CREATE audit emission

Modified (tests):
- `apps/api/src/services/__tests__/native-form.service.test.ts` — AC#A8 regression test + signature update
- `apps/api/src/controllers/__tests__/form.controller.test.ts` — signature assertion update + `previewForm` row-PK test (code review M3)
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` — Bug #2 audit tests (AC#B3/B4) + `toHaveBeenCalledTimes(1)` (code review L3) + label/`has_nin` updates (L1/L2)

Added (tests):
- `apps/api/src/controllers/__tests__/questionnaire.controller.test.ts` — NEW; covers `getFormPreview` row-PK forwarding (code review M3 — no questionnaire-controller test file existed before)

Modified (script):
- `apps/api/scripts/_enumerator-path-smoke-test.ts` — AC#C1 endpoint switch + workaround removal (committed via `f04e9f9`)
- `apps/api/scripts/_enumerator-path-smoke-test.ts` — **UNCOMMITTED (Amelia 2026-06-01)**: AC#C2 verification fixes + adversarial-review (Task 5.2) auto-fixes for F1/F2/F3:
  - `verifySubmission()` queries audit by respondent_id (was: submission.id); `.limit(2)` + exact-1 assertion (F3); references `AUDIT_TARGETS.RESPONDENT` (F1) instead of string literal
  - `cleanupSynthetic()` sweeps ALL `nin LIKE '99999%'` respondents (F2, simplified signature — no longer parameterized on submissionUids); Drizzle `inArray()` instead of bad `sql\`... ANY(${array})\`` template
  - +4 imports: `fraudDetections`, `magicLinkTokens`, `marketplaceProfiles` from schema; `AUDIT_TARGETS` from audit.service. ~50 LOC net.

Modified (production code — UNCOMMITTED, F1 auto-fix):
- `apps/api/src/services/audit.service.ts` — exported `AUDIT_TARGETS = { RESPONDENT: 'respondent' } as const` + `AuditTarget` type, mirroring AUDIT_ACTIONS pattern. ~16 LOC.
- `apps/api/src/services/submission-processing.service.ts` — 3 emit-sites (lines 495, 517, 609) now reference `AUDIT_TARGETS.RESPONDENT` instead of `'respondent'` string literal. +1 import. ~4 LOC.

Modified (tracking):
- `_bmad-output/implementation-artifacts/9-33-enumerator-path-formid-and-audit-hotfix.md` — this story
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status flip

### Change Log

- 2026-05-31 — Implemented Bug #1 (formId row-PK fix across all 4 call sites) + Bug #2 (DATA_CREATE audit for active-respondent creation) + AC#C1 smoke-test endpoint switch. +3 tests; 2228 API tests green; tsc (both apps) + API lint clean. Status → review. Operator smoke-test (AC#C2, Tasks 4.2–4.5) + adversarial code-review (Task 5.1) remain.
- 2026-05-31 — Adversarial code review (Task 5.1) on uncommitted tree: 0 Critical / 0 High / 3 Medium / 3 Low; all 6 fixed same session. M1 (contract-level blast-radius doc), M2 (forward-only cutover decision doc), M3 (added `previewForm` test + new `questionnaire.controller.test.ts` for the 2 previously-unasserted call sites), L1 (dropped tautological `has_nin`), L2 (renamed `creation_path` → `submission_queue_processor`), L3 (`toHaveBeenCalledTimes(1)` on audit tests). Affected suites re-run green (97 passed); API tsc + eslint exit 0. Status remains **review** — AC#C2 operator smoke-test on the VPS (Tasks 4.2–4.5) is still the gate to flip review → done.
- 2026-06-01 ~00:00-00:10 UTC — Amelia (dev-story re-summoning) ran AC#C2 smoke-test verification on prod. Found Bug #1 + Bug #2 BOTH fixed (verified via direct SQL spot-check on prod's `audit_logs`: 5 `data.create` events with `creation_path: submission_queue_processor` emitted for the synthetic respondents, exactly as the fix specifies). Surfaced TWO smoke-test script bugs that produced false negatives: (a) `verifySubmission()` queried audit by submission.id but Bug #2 fix targets respondent.id; (b) `cleanupSynthetic()` used Drizzle `sql\`... ANY(${array})\`` which expands to invalid PostgreSQL syntax. Both fixed inline (~25 LOC; uncommitted). tsc clean. Synthetic respondents from verification runs cleaned via psql (0 orphans). Hand-back to parent Claude: code-review the uncommitted smoke-test diff, operator commits + pushes, CI deploys, re-run smoke test → expect green 5/5 ✅ across all four columns, story flips review → done.
- 2026-06-01 ~00:25 UTC — Adversarial code-review (Task 5.2) on the smoke-test follow-up diff via `/code-review` workflow: 0 Critical / 0 High / 1 Medium / 2 Low. All 3 fixed inline at operator direction. **F1 (MEDIUM)**: hardcoded `'respondent'` string-literal in the verifier was a silent-drift trap (codebase already has 10× 'respondent' + 1× 'respondents' inconsistency). FIXED: extracted `AUDIT_TARGETS = { RESPONDENT: 'respondent' } as const` in `audit.service.ts:99` next to AUDIT_ACTIONS; smoke-test verifier + 3 emit-sites in `submission-processing.service.ts` (lines 495, 517, 609 — the active-respondent + pending-NIN + race-resolution-merge branches) now reference the constant. Compile-error propagates on rename. **F2 (LOW, pre-existing)**: deterministic `generateSyntheticNin(seq)` caused cross-run NIN collisions blocking cleanup. FIXED: `cleanupSynthetic()` now sweeps ALL `nin LIKE '99999%'` rows (signature simplified — no longer takes submissionUids). Idempotent across runs — orphans from prior failed cleanups get swept on next successful run. **F3 (LOW)**: verifier's `.limit(1)` couldn't detect double-emit regressions; mirror of the L3 fix applied to sibling production tests this morning. FIXED: `.limit(2)` + `auditMatches.length === 1` assertion; double-emit logs `enumerator_smoke.audit_double_emit` warn + fails verification. Tests: audit.service (38 tests) + submission-processing.service (42 tests) re-run green = 80/80. API tsc clean. Production code surface: `audit.service.ts` (+1 export AUDIT_TARGETS), `submission-processing.service.ts` (+1 import, 3 literal→constant). Smoke-test script: +1 import, verifier rewrite, cleanup rewrite. ~50 LOC net total.

### Review Follow-ups (AI)

Adversarial code review run 2026-05-31 via `bmad:bmm:workflows:code-review` on the uncommitted working tree (Task 5.1). 0 Critical, 0 High, 3 Medium, 3 Low. The `[x]` task audit was clean (every checked task had real evidence) and the git File List matched `git status` exactly (0 discrepancies). The core fix (flattenForRender row-PK across all 4 verified call sites + mutually-exclusive Bug #2 audit) is correct with non-vacuous tests. Findings below were ALL fixed in the same session.

- [x] **[AI-Review][Critical]** _none found._
- [x] **[AI-Review][High]** _none found._
- [x] **[AI-Review][Medium] M1 — "no overlap" claim was false at the contract level.** Bug #1 changes the `/forms/public-active` contract, which the public wizard ALSO consumes (`Step4Questionnaire.tsx:73` → `submissions.questionnaireFormId`). Verified impact is benign-to-positive (wizard bypasses the worker; new value is a valid FK). FIXED: Dev Notes § "Contract-level blast radius" documents the real blast radius. [`_bmad-output/.../9-33-...md` Dev Notes]
- [x] **[AI-Review][Medium] M2 — forward-only cutover splits `submissions.questionnaireFormId` (pre-fix `schema.id` vs post-fix row PK); no backfill, unacknowledged.** FIXED (decision documented): accept forward-only; no backfill in this hotfix (volume tiny; analytics should key on `source`/`raw_data`). Follow-up tied to Story 9-34. [Dev Notes § "Cutover data inconsistency"]
- [x] **[AI-Review][Medium] M3 — regression net had a hole for 2 of 4 call sites.** `previewForm` (form.controller) and `getFormPreview` (questionnaire.controller) had no unit assertion forwarding the row PK; a revert of either inline edit would pass CI. FIXED: added a `previewForm` test in `form.controller.test.ts` and created `questionnaire.controller.test.ts` (new file) covering `getFormPreview`. [`apps/api/src/controllers/__tests__/*`]
- [x] **[AI-Review][Low] L1 — `has_nin: !!data.nin` was a tautology** (always `true` in the active branch). FIXED: removed from the audit `details` + updated the test; added an explanatory code comment. [`submission-processing.service.ts:~510`]
- [x] **[AI-Review][Low] L2 — `creation_path: 'enumerator_queue_processor'` mislabeled clerk/public sources.** FIXED: renamed to `'submission_queue_processor'`; `source` carries the true channel. Updated code, test, and AC#B1/B3 text. [`submission-processing.service.ts:~512`]
- [x] **[AI-Review][Low] L3 — audit tests didn't assert "exactly once".** A double-emit regression would have passed. FIXED: added `toHaveBeenCalledTimes(1)` to both the active and pending audit tests. [`submission-processing.service.test.ts`]

**Post-fix validation:** affected suites re-run green — `submission-processing` (42), `form.controller` (33), `questionnaire.controller` (2, new), `native-form.service` (20) = **97 passed**. API `tsc --noEmit` exit 0; API eslint exit 0.

### Smoke-test re-verification (AC #C2)

**Run 1 — 2026-06-01 ~00:00 UTC (Amelia, post commit `f04e9f9` deploy)**

```
POST phase: 5 concurrent submissions in 115ms
  ✅ #1-5 HTTP 201
Verification phase:
  019e8045-...  ✅sub  ❌resp  ✅raw_data  ❌audit  (5x)
Summary: 0/5 fully verified
```

Initial reading was confusing — `respondent_id` regressed from the workaround-protected baseline. Investigation via `pm2-logs` showed the worker correctly rejected with `submission_processing.nin_rejected: "NIN_DUPLICATE: This individual was already registered on 2026-05-31T22:56:25..."`. The synthetic NIN generator is deterministic (`99999` + seq + checksum), so the run collided with leftover synthetic respondents from the operator's earlier dev-cycle runs that the buggy `cleanupSynthetic` couldn't delete. **Not a regression — the FR21 duplicate-NIN guard doing its job.**

**Run 2 — 2026-06-01 ~00:04 UTC (Amelia, after psql cleanup of all `nin LIKE '99999%'`)**

```
POST phase: 5 concurrent submissions in 140ms
  ✅ #1-5 HTTP 201
Verification phase:
  019e8048-8e5d-...  ✅sub  ✅resp  ✅raw_data  ❌audit  (5x)
Summary: 0/5 fully verified
```

Bug #1 verified fixed (`respondent_id ✅ 5/5`). But `audit ❌ 5/5` triggered a deeper investigation — direct SQL on prod showed the audit events DID emit:

```sql
SELECT al.action, al.target_resource, al.target_id, al.details->>'creation_path'
FROM audit_logs al
WHERE al.target_resource = 'respondent'
  AND al.target_id IN (SELECT id FROM respondents WHERE nin LIKE '99999%')
ORDER BY al.created_at DESC LIMIT 6;
```

returned **5 `data.create` events** with `creation_path: submission_queue_processor`, one per just-created synthetic respondent, within milliseconds of the respondent INSERT. **Bug #2 is fixed in production.** The smoke test's `❌audit` was a **false negative** — its `verifySubmission()` queried `audit_logs.target_id = submission.id`, but Bug #2's fix emits with `target_resource='respondent'` + `target_id=respondent.id`. The verifier predicate never matched.

**Smoke-test follow-up fixes (Amelia, 2026-06-01, uncommitted — awaiting code review)**:

1. **`verifySubmission()` predicate** — now queries `audit_logs WHERE target_resource='respondent' AND target_id = subRow.respondentId`. Falls through to `auditRowFound=false` cleanly when respondentId is null (NIN-rejected path).
2. **`cleanupSynthetic()` SQL** — replaced Drizzle `sql\`... ANY(${array})\`` (which expands to PostgreSQL `ANY(($1, $2, ...))` syntax error) with Drizzle's `inArray()` builder. Imports added for `fraudDetections`, `magicLinkTokens`, `marketplaceProfiles`. Mirror-symmetric to the existing `submissions` + `respondents` delete pattern at the bottom of the function. Net diff: ~25 lines.

**Post-deploy expected state** (after operator commits + pushes these smoke-test fixes + CI deploys): next `--confirm-i-am-not-dry-running --count 5` run reports `5/5 ✅` across all four columns + the cleanup function deletes synthetic rows cleanly, no orphans left. **That run satisfies AC#C2 and gates the story `review → done` flip.**

**Production cleanup state**: all `nin LIKE '99999%'` synthetic respondents from the verification runs deleted via psql 2026-06-01 ~00:08 UTC. 0 orphans remaining. Audit events for the synthetic respondents PRESERVED (chain integrity).

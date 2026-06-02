# Story 9.37: Audit infrastructure hardening — operator-script flush-race + audit-log-viewer cross-spelling filter

Status: backlog

<!--
2026-06-02 OPERATOR DECISION (Awwal, parent-Claude scope-review session):
Authored from Story 9-34's `/code-review` findings but DOWNGRADED to backlog
on practical-impact grounds. Story 9-34 alone is sufficient for field-readiness.

Rationale at decision time:
- F4 (Cohort A blast flush-race): worst case is 1-3 missing audit rows out of
  51 recipients on a one-time blast. Operator can verify via post-blast
  `SELECT COUNT(*) FROM audit_logs WHERE action = 'operator.supplemental_survey_sent'`
  and manually emit any gap via the operator-audit helper. Zero dev cost; same
  coverage as the code fix.
- F5 (input-sanitisation backfill flush-race): already ran once 2026-06-01 with
  `marked=55 failed=0`; if the race had bitten, audit_logs count would be <55.
  No anomaly reported. Same operator-verification mitigation applies for future
  re-runs.
- F10 (audit-log-viewer cross-spelling filter): operator friction, not data
  correctness. Workaround = drop into psql via Tailscale SSH (operator does
  this routinely already). Documented in the script's inline cutover comment.

OPERATOR RUNBOOK ENTRY (in lieu of this story shipping):
Before the next live-fire of `_cohort-a-supplemental-survey-blast.ts` OR
`backfill-input-sanitisation.ts`, the operator adds a post-run verification:
  SELECT COUNT(*) FROM audit_logs WHERE action = '<expected-action>' AND created_at >= '<run-start-ts>';
If count < expected (the loop iteration count), the last N rows hit the flush-
race. Emit the missing audit rows manually via operator-audit helper (Story 9-22
when shipped, OR direct INSERT with hash-chain link).

REVISIT TRIGGERS (any of these → promote backlog → ready-for-dev):
- Post-blast operator verification shows audit_count < recipient_count.
- An operator-script is added in 9-3X / 10-XX work that fires more than ~50
  per-row audits (the flush-race becomes more likely to bite at scale).
- A super_admin actually asks for cross-spelling forensic queries from the UI
  (vs the current expected workflow of dropping to psql).

Until one of these triggers, this story stays as documented intent — not work.
-->


<!--
Authored 2026-06-02 by Bob (SM) via canonical *create-story --yolo workflow.

ORIGIN: Story 9-34's `/code-review` skill execution surfaced 3 MEDIUM-severity
findings that share a coherent theme: operator-script audit emission has a
fire-and-forget + process.exit FLUSH-RACE bug (the same race pattern Story
9-26 Part H already fixed in ONE sibling script but NOT applied to 2 others
that have the same shape), AND the audit-log-viewer UI exact-match filter
creates a forensic UI blind spot post-Story-9-34's plural→singular cutover.

THE THREE FINDINGS:
  F4 (MED) — `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts:357`
    fire-and-forget `AuditService.logAction()` (returns void; spawns
    detached hash-chain INSERT tx) followed by `process.exit()` at line
    415. The last 1-3 detached audit transactions can be killed by
    process.exit before they commit. Same race the sibling
    `_backfill-wizard-questionnaire-loss.ts:252-282` explicitly fixed via
    `await AuditService.logActionTx(tx, ...)` inside a per-row transaction
    (Story 9-26 Part H code review).
  F5 (MED) — `apps/api/src/scripts/backfill-input-sanitisation.ts:254`
    same flush-race + `process.exit(0)` at line 298. Existing F7 comment
    (lines 249-253) acknowledges sequential write contention but NOT the
    process.exit race. Story 9-34 re-touched these lines for the constant
    migration AND added a cutover comment claiming hash-chain integrity is
    preserved while the script itself can silently drop audit rows on exit.
  F10 (MED) — `apps/api/src/services/audit-log-viewer.service.ts:210`
    uses exact-match `al.target_resource = ${filter.targetResource}`.
    Post-Story-9-34, audit_logs contains BOTH 'respondent' (singular) and
    'respondents' (plural) for the `respondent.backfilled_normalisation`
    action across the cutover boundary. The script comment documents the
    SQL workaround (`target_resource IN ('respondent','respondents')`) but
    the operator UI provides no equivalent escape hatch — the viewer
    route schema accepts only a single string, not an array.

PRIORITY: MEDIUM-hardening. Field-deployment UNBLOCKED by Story 9-34
  directly. 9-37 closes 3 latent failure modes that COULD surface during
  heavy operator-script use OR forensic auditor work. Lower-priority than
  9-36 (which closes a COMPLETENESS gap in the constant extraction itself).

EFFORT: ~half-day to 1 day total. AC#A1 + AC#A2 are pattern-mirroring
  refactors (~30 min each); AC#A3 is the bulk (~2-3 hours UI + schema +
  service + tests).

DEPENDENCIES:
  - Story 9-34 done (cutover discipline established; this story's AC#A3 is
    a sibling response to the same cutover).
  - Story 9-26 Part H done (sibling-script flush-race fix that AC#A1 +
    AC#A2 mirror).
  - Story 9-11 done (audit-log-viewer UI surface that AC#A3 extends).

  Story 9-36 is a SIBLING, not a dependency. Both can ship in parallel
  (no file-level overlap — 9-36 touches emit-sites, 9-37 touches operator
  scripts + viewer service/UI).
-->

## Story

As the **operator running OSLSR's audit-emission scripts AND the super_admin investigating audit-chain forensics**,
I want **(a) operator-gated bulk scripts that emit per-row audit events to use the awaited per-row-transaction pattern Story 9-26 Part H established (vs the fire-and-forget pattern that can silently drop the last N audits on process.exit), and (b) the audit-log-viewer UI to expose array-form filtering on `target_resource` so a forensic auditor can query across the Story 9-34 cutover boundary without needing to drop into psql**,
So that **(1) bulk operator scripts produce a complete forensic trail end-to-end (the very gap that Story 9-26's unified-ingestion-pipeline pattern was designed to eliminate), and (2) the cutover-spanning forensic-query pattern that Story 9-34 documents in code comments is actually usable from the operator UI, not just the database directly**.

## Background — why this story exists

### The flush-race pattern (F4 + F5)

Story 9-26 Part H code-review identified that fire-and-forget audit emission inside operator-script loops, followed by `process.exit()`, can silently drop the last 1-3 audit rows. The mechanism:

```
operator-script loop:
  ├─ per-row work: send email / update row / etc.
  ├─ AuditService.logAction({...})    // returns void; spawns detached tx
  └─ continue loop ...
finally:
  process.exit(0)                      // kills detached txs that haven't yet committed
```

`AuditService.logAction` returns `void` and runs its hash-chain INSERT inside a transaction detached from the caller (per its docblock at `apps/api/src/services/audit.service.ts:197-198`: "Fire-and-forget PII access logging with hash chain. Does NOT await — failures are logged as warnings but never throw."). When the script's `process.exit()` fires in the same Node tick as the last detached INSERT enqueues, the connection pool drops mid-tx and the audit row is lost — silently.

Story 9-26 Part H fixed this in `apps/api/scripts/_backfill-wizard-questionnaire-loss.ts:252-282` by:
1. Wrapping the per-row work + audit emission in a single `db.transaction(async (tx) => { ... })` block.
2. Replacing `AuditService.logAction(...)` with `await AuditService.logActionTx(tx, ...)` — awaited inside the tx.
3. Making the per-row work atomic with respect to its audit row: either both commit, or both roll back. No silent half-states.

The script's docblock paragraph captures the load-bearing reasons (`_backfill-wizard-questionnaire-loss.ts:252-262`):
```
// Marker update + forensic audit in ONE transaction, using the AWAITED
// `logActionTx` (not the fire-and-forget `logAction`). Two reasons:
//   1. Atomicity — the metadata marker and its audit row commit together;
//      we never end up with a marked row whose audit entry is missing.
//   2. Flush guarantee — `logAction` returns void and runs its hash-chain
//      transaction detached, so the tight loop + immediate `process.exit`
//      at the end of main() could terminate Node before those detached
//      writes flush, silently losing the audit trail the script exists to
//      produce. Awaiting `logActionTx` inside the per-row transaction
//      closes that race.
```

**This pattern is the in-repo recipe for the fix. AC#A1 + AC#A2 apply it to the 2 sibling scripts that were missed.**

### The forensic UI blind spot (F10)

Post-Story-9-34's `'respondents'` → `'respondent'` cutover at `backfill-input-sanitisation.ts:257`, the `audit_logs` table contains BOTH spellings for the `respondent.backfilled_normalisation` action across the cutover boundary. Story 9-34's inline cutover comment block (lines 249-269 post-F6-fix) documents the SQL forensic-query bridge:

```sql
SELECT * FROM audit_logs
WHERE target_resource IN ('respondent', 'respondents')
  AND action = 'respondent.backfilled_normalisation';
```

But this is **SQL-only guidance**. The operator UI at `apps/api/src/services/audit-log-viewer.service.ts:210` builds the query with exact-match: `al.target_resource = ${filter.targetResource}`. The route schema at `apps/api/src/routes/audit-log-viewer.routes.ts:82` accepts a single string, not an array. A super_admin opening the viewer can filter for `'respondent'` (singular) and silently miss pre-cutover plural rows.

This forensic blind spot is currently bounded to ONE cutover boundary (Story 9-34's). But Story 9-36 (sibling story) is about to add 3 MORE cutover boundaries: `'user/users'`, `'magic_link_token/s'`, `'fraud_detection/s'`. Without 9-37, the blind spot multiplies — every forensic query post-9-36 either drops into psql or systematically miscounts.

### Why fix now (sequencing rationale)

- The flush-race is **latent** today (operator hasn't yet re-fired the affected scripts since Story 9-26 Part B operator-blast on 2026-06-01). The next firing risks silent audit-row loss; better to fix BEFORE the next operator-blast.
- The viewer blind spot compounds with Story 9-36's planned 3 additional cutover boundaries. Shipping 9-37 BEFORE 9-36 keeps the operator UI honest across all 4 cutovers; shipping after means a multi-week window where forensic queries are systematically incomplete.
- **Recommendation**: ship 9-37 + 9-36 in either order (no file-overlap); both can run in parallel.

## Concrete bug sites

### AC#A1 — Cohort A blast flush-race

**File**: `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts`

**Bug site**: lines 357-372 (inside the send loop, after the per-recipient email send succeeds):
```typescript
AuditService.logAction({
  actorId: null,
  action: AUDIT_ACTIONS.OPERATOR_SUPPLEMENTAL_SURVEY_SENT,
  // ... Story 9-34 cutover comment ...
  targetResource: AUDIT_TARGETS.RESPONDENT,
  // ... details ...
});
```

**Exit site**: line 415 (`process.exit(failed > 0 ? 1 : 0);`).

**Pattern to mirror**: `apps/api/scripts/_backfill-wizard-questionnaire-loss.ts:262-282` — per-row `db.transaction` wrapping the per-row work + `await AuditService.logActionTx(tx, ...)`. The Cohort A blast's per-row work is email-send (Resend API call — DOES NOT run inside a DB tx, that's external I/O), so the transaction wrapping pattern is slightly different: the tx wraps ONLY the audit emission, not the email send. The flush-guarantee benefit is what matters (awaited logActionTx inside ANY tx flushes before process.exit; the tx commit is the bottleneck).

**Recommended structural pattern** (dev agent confirms at impl time):
```typescript
// per-row, after the email-send succeeds:
await db.transaction(async (tx) => {
  await AuditService.logActionTx(tx, {
    actorId: null,
    action: AUDIT_ACTIONS.OPERATOR_SUPPLEMENTAL_SURVEY_SENT,
    targetResource: AUDIT_TARGETS.RESPONDENT,
    targetId: row.respondent_id,
    details: { ... },
    ipAddress: operatorHost,
    userAgent: operatorInvocation,
  });
});
```

### AC#A2 — Input-sanitisation backfill flush-race

**File**: `apps/api/src/scripts/backfill-input-sanitisation.ts`

**Bug site**: lines 254-280 (inside the per-row write loop):
```typescript
// F7 (code-review 2026-05-02 — tracked, not fixed): audit-log inserts
// here are sequential fire-and-forget. ...
// Story 9-34 cutover 2026-06-01 (logAction below): ...
AuditService.logAction({
  actorId: null,
  action: AUDIT_ACTIONS.RESPONDENT_BACKFILLED_NORMALISATION,
  targetResource: AUDIT_TARGETS.RESPONDENT,
  // ... details ...
});
```

**Exit site**: line 298 (`process.exit(0)`).

**Note about F7 comment**: the existing F7 comment was authored 2026-05-02 acknowledging sequential-write CONTENTION but NOT the process.exit race. After AC#A2's race-fix lands, the F7 comment is partly obsolete. AC#A2 updates it: keep the "for low-thousands of rows the contention is negligible" caveat (still true), but drop the "fire-and-forget" language and add a note "now per-row transactional via awaited logActionTx; flush-race closed per Story 9-37 AC#A2".

**Recommended structural pattern**: this script DOES already have a `db.transaction` available — the per-row work (UPDATE the respondent row) and the audit emission should be wrapped together for atomicity (matching the `_backfill-wizard-questionnaire-loss.ts:252-282` pattern exactly — both the metadata update AND the audit row in one tx):
```typescript
await db.transaction(async (tx) => {
  await tx
    .update(respondents)
    .set({ ...normalisationPatches, updatedAt: new Date() })
    .where(eq(respondents.id, plan.rowId));

  await AuditService.logActionTx(tx, {
    actorId: null,
    action: AUDIT_ACTIONS.RESPONDENT_BACKFILLED_NORMALISATION,
    targetResource: AUDIT_TARGETS.RESPONDENT,
    targetId: plan.rowId,
    details: { fields: plan.auditDetails.fields, hashes: plan.auditDetails.hashes, failed: plan.failed },
  });
});
```
This makes the respondent UPDATE atomic with its audit row — a stronger property than the cohort-a blast can achieve (since email-send is external I/O outside the tx boundary).

### AC#A3 — Audit-log-viewer cross-spelling filter

**Service site**: `apps/api/src/services/audit-log-viewer.service.ts:210` (the SQL `WHERE` clause builder for the `targetResource` filter).

**Route schema site**: `apps/api/src/routes/audit-log-viewer.routes.ts:82` (the Zod schema for the filter input).

**UI site**: `apps/web/src/features/audit-log-viewer/...` (the React filter input component — locate at impl time).

**Test sites**:
- `apps/api/src/services/__tests__/audit-log-viewer.service.test.ts` — add cases for array-form filter input
- `apps/api/src/routes/__tests__/audit-log-viewer.routes.test.ts` — add cases for the schema accepting arrays

**Fix Option A (RECOMMENDED — locked in AC#A3.1 below)**: extend the filter API to accept array (`target_resource IN (...)`):
- Schema: `targetResource: z.union([z.string(), z.array(z.string()).max(10)])` (max 10 to bound query cost)
- Service: build `IN (...)` when input is array, fall back to `=` when input is string
- UI: change the filter input from text-input to comma-separated text-input OR multi-select dropdown (dev judgment)

**Fix Option B (REJECTED — duplicate truth)**: add an in-UI "include legacy spellings" toggle that auto-expands singular to `IN ('respondent','respondents')`. Rejected because it duplicates the legacy-spelling mapping in two places (audit.service.ts AUDIT_TARGETS constant + UI behaviour), and the cross-spelling case is just one application of array filtering.

## Acceptance Criteria

### Part A — Code fixes

1. **AC#A1 — Fix Cohort A blast flush-race.** Wrap `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts:357-372` audit emission inside a per-row `db.transaction` block + `await AuditService.logActionTx(tx, {...})`. Match the structural pattern from `_backfill-wizard-questionnaire-loss.ts:262-282`. The Story 9-34 cutover comment (lines 360-362) stays — move it inside the new tx block above the `logActionTx` call. The `sent++` / `logger.info` per-row tracking stays OUTSIDE the tx (those are not audit-chain-critical).

2. **AC#A2 — Fix input-sanitisation backfill flush-race.** Wrap `apps/api/src/scripts/backfill-input-sanitisation.ts` per-row work (the existing `tx.update(respondents).set({...})` AND the audit emission) inside a SINGLE `db.transaction(async (tx) => { ... })` block. The respondent UPDATE moves from the outer-tx scope into the new per-row tx (atomicity benefit). Replace `AuditService.logAction({...})` with `await AuditService.logActionTx(tx, {...})`. Update the F7 comment per Dev Notes guidance (drop "fire-and-forget"; add "now per-row transactional").

3. **AC#A3.1 — Pre-impl decision: filter API accepts array.** Documented in Pre-impl Decision Log BEFORE any code change. Locked = Option A (`target_resource IN (...)`). Rationale: cross-spelling forensics is one application of array filtering; Option B (in-UI toggle) duplicates legacy-spelling mapping.

4. **AC#A3.2 — Schema accepts array form.** Update `apps/api/src/routes/audit-log-viewer.routes.ts:82` filter schema from `targetResource: z.string().optional()` to `targetResource: z.union([z.string(), z.array(z.string()).max(10)]).optional()`. Max 10 elements bounds query cost.

5. **AC#A3.3 — Service builds `IN (...)` when input is array.** Update `apps/api/src/services/audit-log-viewer.service.ts:210` to branch on input shape:
    ```typescript
    if (Array.isArray(filter.targetResource)) {
      conditions.push(sql`al.target_resource IN (${sql.join(filter.targetResource.map(t => sql`${t}`), sql`, `)})`);
    } else if (filter.targetResource) {
      conditions.push(sql`al.target_resource = ${filter.targetResource}`);
    }
    ```
    (Confirm Drizzle ORM `sql.join` API at impl time; alternative `sql.raw` if needed.)

6. **AC#A3.4 — UI filter input accepts multiple values.** Update the React filter component in `apps/web/src/features/audit-log-viewer/...` (locate exact file at impl time via `Glob 'apps/web/src/**/AuditLogViewer*'`). Options:
    - **(a)** Replace single-text-input with multi-select dropdown sourced from `AUDIT_TARGETS` (post-Story-9-36 contains 4 entries; pre-Story-9-36 contains 1 entry plus the loose set of strings the service emits). Multi-select gives best UX.
    - **(b)** Replace single-text-input with comma-separated text-input + helper text "(comma-separated to query across spellings)". Lower-effort but worse UX.
   Pre-impl decision in Dev Agent Record.

### Part B — Tests

7. **AC#B1 — `audit-log-viewer.service.test.ts` cases for array filter.** Add tests:
    - Single-string input → `=` operator (regression lock)
    - Array input → `IN (...)` operator (new behaviour)
    - Empty array → no WHERE clause OR error (dev judgment — likely treat as undefined)
    - Array with 1 element → `IN (...)` (consistent shape; not optimized to `=`)
    - Array with 11 elements → schema rejects (regression lock on max:10)

8. **AC#B2 — `audit-log-viewer.routes.test.ts` cases for schema.** Add tests asserting the new `z.union([z.string(), z.array(z.string()).max(10)])` shape accepts/rejects correctly. ~4 cases.

9. **AC#B3 — Smoke test the flush-race fixes** (operator-runnable, NOT a vitest test). Document in Dev Agent Record's "Operator smoke test" subsection: dev agent provides a 5-line command sequence the operator can run via Tailscale SSH against a non-prod seeded DB:
    1. Insert 50 synthetic respondents matching the cohort-a (or backfill) cohort criteria.
    2. Run the script with `--max-recipients 50 --confirm-i-am-not-dry-running`.
    3. `SELECT COUNT(*) FROM audit_logs WHERE action = 'operator.supplemental_survey_sent'` (or `respondent.backfilled_normalisation`).
    4. Assert count == 50 (the new awaited-per-row pattern guarantees this; the pre-fix fire-and-forget pattern would intermittently produce 47-50).
    5. Cleanup the synthetic respondents + their audit rows.

### Part C — Verification + discipline

10. **AC#C1 — `pnpm test` 4/4 packages green post-fix.** Zero new failures; zero regressions. Specifically:
    - `audit-log-viewer.service.test.ts` (+5 new cases)
    - `audit-log-viewer.routes.test.ts` (+4 new cases)
    - `_backfill-wizard-questionnaire-loss.test.ts` (sibling — sanity check the pattern AC#A1 + AC#A2 mirror is correctly understood)
    - Any UI tests for the audit-log-viewer filter component (added by AC#A3.4)

11. **AC#C2 — tsc clean both apps.** AC#A3.2's schema change must align with the service builder's expected shape; tsc catches mismatches.

12. **AC#C3 — Verify F7 comment update at backfill-input-sanitisation.ts:249-253.** Post-AC#A2, the comment should no longer describe "fire-and-forget"; should reference Story 9-37 AC#A2 closure. Eyeball verification + grep `'fire-and-forget'` against the file should return zero hits in the audit context.

13. **AC#C4 — Memory entry update.** `~/.claude/projects/.../memory/feedback_unified_ingestion_pipeline.md` (or whichever memory captures the Story 9-26 Part H operator-script pattern) gets a 1-2 line note: "Story 9-37 extended the pattern to 2 more operator scripts (cohort-a-blast + input-sanitisation-backfill). Reference pattern remains `_backfill-wizard-questionnaire-loss.ts:262-282`."

14. **AC#C5 — Pre-merge code review on uncommitted tree** per `feedback_review_before_commit.md`. Auto-fix HIGH/MEDIUM findings; LOW deferrable.

## Tasks / Subtasks

- [ ] **Task 1 — AC#A1: Cohort A blast race fix (AC: #A1)**
  - [ ] 1.1: Read `_backfill-wizard-questionnaire-loss.ts:262-282` to internalize the reference pattern.
  - [ ] 1.2: Refactor `_cohort-a-supplemental-survey-blast.ts:357-372` per AC#A1 wording. Move the Story 9-34 cutover comment inside the new tx block above the `logActionTx` call.
  - [ ] 1.3: Run `pnpm --filter @oslsr/api test apps/api/scripts/__tests__/_cohort-a-supplemental-survey-blast.test.ts` (if exists) to confirm no regressions.

- [ ] **Task 2 — AC#A2: Input-sanitisation backfill race fix (AC: #A2, #C3)**
  - [ ] 2.1: Refactor `backfill-input-sanitisation.ts` per-row block to wrap UPDATE + audit emission in a single `db.transaction`.
  - [ ] 2.2: Update F7 comment per Dev Notes guidance.
  - [ ] 2.3: Run `pnpm --filter @oslsr/api test apps/api/src/scripts/__tests__/backfill-input-sanitisation.test.ts` to confirm no regressions.

- [ ] **Task 3 — AC#A3: Audit-log-viewer cross-spelling filter (AC: #A3.1-A3.4, #B1, #B2)**
  - [ ] 3.1: Pre-impl decision documented in Pre-impl Decision Log: Option A (locked).
  - [ ] 3.2: Update `audit-log-viewer.routes.ts:82` schema to accept array OR string.
  - [ ] 3.3: Update `audit-log-viewer.service.ts:210` to branch on input shape.
  - [ ] 3.4: Add 5 service test cases (AC#B1) + 4 routes test cases (AC#B2).
  - [ ] 3.5: Locate the React filter component via `Glob 'apps/web/src/**/AuditLogViewer*'`. Pre-impl decision on UI shape (multi-select dropdown vs comma-separated input). Update the component + any associated UI tests.
  - [ ] 3.6: Run `pnpm --filter @oslsr/api test apps/api/src/services/__tests__/audit-log-viewer.service.test.ts` + `pnpm --filter @oslsr/web test` (filtered to the affected component) for fast feedback before full sweep.

- [ ] **Task 4 — Pre-merge code review + verification (AC: #C1, #C2, #C3, #C4, #C5)**
  - [ ] 4.1: `pnpm test` from root — confirm 4/4 packages green; capture API + Web test counts in Dev Agent Record.
  - [ ] 4.2: `pnpm exec tsc --noEmit` on api + web — clean exit.
  - [ ] 4.3: Eyeball F7 comment update per AC#C3.
  - [ ] 4.4: Update memory file per AC#C4.
  - [ ] 4.5: Document AC#B3 smoke-test command sequence for operator.
  - [ ] 4.6: Run `/code-review` workflow on uncommitted tree.
  - [ ] 4.7: Address HIGH/MEDIUM findings inline; defer LOW with rationale.

## Dev Notes

### Reference pattern (load-bearing — copy this structurally, don't re-derive)

The flush-race fix is canonicalized in `apps/api/scripts/_backfill-wizard-questionnaire-loss.ts:252-282` (Story 9-26 Part H). The docblock above lines 252-262 explains the two reasons (atomicity + flush guarantee) — read it verbatim before editing the 2 sibling scripts. The structural pattern:

```typescript
for (const row of cohort) {
  // ... per-row prep (e.g. compute newMetadata, parse plan.rowId) ...

  try {
    await db.transaction(async (tx) => {
      // 1. Per-row WORK (UPDATE / INSERT) inside the tx — atomicity benefit
      await tx
        .update(respondents)
        .set({ ...newFields, updatedAt: new Date() })
        .where(sql`${respondents.id} = ${row.id}`);

      // 2. Per-row AUDIT emission AWAITED inside the tx — flush-guarantee benefit
      await AuditService.logActionTx(tx, {
        actorId: null,
        action: AUDIT_ACTIONS.<RELEVANT_ACTION>,
        targetResource: AUDIT_TARGETS.RESPONDENT,
        targetId: row.id,
        details: { ... },
        // ipAddress/userAgent — operator-host pattern from sibling
      });
    });

    written++;
    logger.info({ event: '<script>.written', respondentId: row.id });
  } catch (err) {
    failed++;
    logger.error({ event: '<script>.write_failed', respondentId: row.id, error: (err as Error).message });
  }
}
```

The cohort-a blast is the slight outlier — its per-row work is `EmailService.send(...)` (external I/O, NOT a DB tx). The tx wraps ONLY the audit emission; the email-send happens BEFORE the tx; the audit emission inside the tx records the email-send outcome. Atomicity is therefore weaker (you can succeed-send-then-fail-audit), but the flush-guarantee is preserved. That trade-off is acceptable — the failure mode (email sent, audit not written) is observable via the `failed++` counter mismatch + the `logger.warn` in the catch block.

### Why this story SHIPS BEFORE the next operator-blast (load-bearing scheduling)

Per `feedback_cohort_a_disposition_decision.md` memory: the Cohort A supplemental-survey blast has shipped as capability but has NEVER been live-fired against prod. The blast is gated on Story 9-18 (wizard-redesign arc) per `project_field_readiness_sequence_2026_05_31`. **The next live-fire of `_cohort-a-supplemental-survey-blast.ts` will be the operator-blast post-9-18-ship.**

If 9-37 ships BEFORE that blast, the 51-recipient cohort gets a complete forensic trail. If 9-37 ships AFTER, the operator has to either (a) accept the last 1-3 recipients silently lacking audit rows, OR (b) defer the blast a second time. **Recommendation: ship 9-37 before 9-18 ships.** No HARD blocker since the script CAN be live-fired with the current flush-race (audit-chain coverage just won't be 100% on the tail rows) — but the blast's whole point is forensic provenance, so the operator should value the flush-guarantee.

The input-sanitisation backfill (`backfill-input-sanitisation.ts`) is RE-RUNNABLE. Story 9-26 Part B ran it for the questionnaire-loss-marker cohort 2026-06-01 (`marked=55 failed=0`). If 9-37 closes the race before the next re-run (e.g. for new respondents post-2026-06-01), the next batch is forensically complete. No immediate forensic loss because the 2026-06-01 run was small enough that fire-and-forget probably flushed before exit (no evidence of audit rows missing; but no SELECT confirmed flush either).

### Filter API design rationale (AC#A3.1 locked decision)

**Option A (array filter)** picked over **Option B (in-UI toggle)** because:
1. Array filter is a general-purpose pattern that handles cross-spelling AS A SPECIAL CASE — also handles arbitrary multi-resource queries (e.g. `WHERE target_resource IN ('respondent', 'user', 'submission')` for cross-resource investigation).
2. Option B requires the UI to KNOW the legacy-spelling mapping (`'respondent'` ↔ `'respondents'`, `'user'` ↔ `'users'`, etc.). After Story 9-36 lands, this mapping multiplies to 4 axes. Maintaining it in both `AUDIT_TARGETS_LEGACY_SPELLINGS` constant AND UI behavior is duplicate truth.
3. Option B's "include legacy spellings" toggle is unintuitive — operators have no mental model of "legacy spelling" until they read the docs.

Option A's UI cost is one-time: replace text-input with multi-select dropdown OR with comma-separated input. Once shipped, every future cross-spelling cutover (Story 9-36's 3 more, future 9-3X stories) inherits the array-filter capability for free.

### `Drizzle ORM sql.join` API note

Verify at impl time: `import { sql } from 'drizzle-orm'` exposes `sql.join(values, separator)` per Drizzle 1.x. If the version mismatch surfaces, fallback to manual interpolation:
```typescript
sql`al.target_resource IN (${sql.raw(filter.targetResource.map(t => `'${t.replace(/'/g, "''")}'`).join(','))})`
```
But prefer `sql.join` for SQL-injection safety. Check existing code in `audit-log-viewer.service.ts` for prior `IN (...)` patterns; one likely already exists (for the `action` filter or similar).

### File-level overlap with parallel-track stories

- **Story 9-36** (sibling carve-out — complete audit-pattern enforcement): touches audit.service.ts + 26+ emit-sites + 19 mock factories + 6 test assertions. **NO overlap** with 9-37 — 9-36 doesn't touch operator scripts (other than the existing 9-34 sites) and doesn't touch audit-log-viewer service/UI. **Both can ship in parallel.**
- **Story 9-32** (account-settings + NDPA rights): MAY emit new audit rows via the audit-log-viewer's audited routes. If 9-32 ships before 9-37, 9-32's emissions are exact-match-filterable (single resource axis). No conflict.
- **Story 9-18** (wizard NIN-first redesign): may run the Cohort A blast post-ship. **HARD sequencing: 9-37 should ship before 9-18 ships AND before the operator-blast fires.** Confirm at impl time via sprint-status.yaml.

### References

- [Source: apps/api/scripts/_backfill-wizard-questionnaire-loss.ts:252-282] — **reference pattern for AC#A1 + AC#A2**. The two-reason docblock above explains atomicity + flush-guarantee.
- [Source: apps/api/scripts/_cohort-a-supplemental-survey-blast.ts:357-372] — AC#A1 target.
- [Source: apps/api/scripts/_cohort-a-supplemental-survey-blast.ts:415] — exit site (race trigger).
- [Source: apps/api/src/scripts/backfill-input-sanitisation.ts:254-280] — AC#A2 target.
- [Source: apps/api/src/scripts/backfill-input-sanitisation.ts:298] — exit site.
- [Source: apps/api/src/services/audit-log-viewer.service.ts:210] — AC#A3 filter site.
- [Source: apps/api/src/routes/audit-log-viewer.routes.ts:82] — AC#A3 schema site.
- [Source: apps/api/src/services/audit.service.ts:197-198] — `logAction` docblock confirming fire-and-forget contract.
- [Source: _bmad-output/implementation-artifacts/9-34-audit-pattern-unification-target-resource.md § "Review Follow-ups (AI)"] — origin trace for findings F4/F5/F10.
- Memory: [[feedback_unified_ingestion_pipeline]] — Story 9-26 Part H pattern that AC#A1 + AC#A2 mirror.
- Memory: [[feedback_review_before_commit]] — Task 4 discipline.
- Memory: [[feedback_cohort_a_disposition_decision]] — scheduling rationale (blast gated on 9-18).

## Dev Agent Record

### Agent Model Used

(to be populated by dev-story)

### Pre-impl Decision Log

(to be populated — particularly the AC#A3.1 Option A confirmation + the AC#A3.4 UI multi-select-vs-comma-separated choice + any task-ordering deviations)

### Debug Log References

(to be populated)

### Completion Notes List

(to be populated)

### File List

(to be populated — expected: 2 operator scripts modified + 1 audit-log-viewer service + 1 audit-log-viewer routes + 1 React filter component + 2 test files + 1 memory file update)

### Operator smoke test (AC#B3)

(to be populated post-impl — the 5-line operator-runnable smoke-test command sequence proving the flush-race fix produces audit_row_count == loop_iteration_count)

### Review Follow-ups (AI)

(to be populated post-code-review per Task 4)

# Story 9.34: Audit-pattern unification — migrate `targetResource` literals to `AUDIT_TARGETS.RESPONDENT`

Status: ready-for-dev

<!--
Authored 2026-06-01 by Bob (SM) via canonical *create-story --yolo workflow.

ORIGIN: Story 9-33 F1 (closed 2026-06-01 via commit `f408785`) caught
the smoke-test verifier using a hardcoded `'respondent'` string-literal
— exactly the silent-drift trap the smoke test exists to prevent. The
fix extracted `AUDIT_TARGETS = { RESPONDENT: 'respondent' } as const`
in `apps/api/src/services/audit.service.ts:99-115` and migrated 4
sites (3 emit-sites in `submission-processing.service.ts` + the
verifier). BUT 9 production emit-sites + 3 test sites STILL use the
string literal across other files, INCLUDING TWO OUTLIERS that use
the plural form `'respondents'` (the exact drift the constant exists
to prevent). This story closes the migration.

AMENDED 2026-06-01 (same-day, post-9-26-close-out re-grep) — scope grew
by 2 operator-script sites that landed today + 2026-05-22 but the
original 9-34 grep missed them (grep was scoped to `apps/api/src/` and
omitted `apps/api/scripts/`):
  (1) NEW singular site `apps/api/scripts/_backfill-wizard-questionnaire-loss.ts:272`
      added by commit `20f4297` (Story 9-26 Part B close-out, today).
  (2) NEW plural outlier `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts:360`
      added by commit `9a44228` (Story 9-28 Phase A, 2026-05-22).
Net effect: Part A grows by 1 AC (#A7); Part B's plural-migration AC
(#B1) grows to cover BOTH outliers; cutover-comment AC (#B2) stays
scoped to `backfill-input-sanitisation.ts:257` only (rationale in §B2
below — the newer plural outlier has zero historical audit_logs rows
because the Cohort A supplemental-survey blast has never been live-fired
yet, so no historical-spelling-bridge problem to solve there).

EMPIRICAL VALIDATION (load-bearing for the "why now" justification):
TWO independent operator-script authors INDEPENDENTLY chose the plural
form (the operator on 2026-05-22 for the Cohort A blast; the dev agent
today for the wizard-questionnaire-loss backfill correctly chose
singular — but the prior-art plural example was right next to it in
the file tree and could have flipped either way). Without the constant
+ a lint rule, the drift will keep happening on every new operator-
script audit emission. This story's migration-then-lint pattern is the
only durable fix.

PRIORITY: LOW (developer-hygiene / silent-drift prevention). NOT
field-deployment-blocking; NOT urgent. Pickup whenever bandwidth
allows during or after the wizard-redesign arc (9-16/9-17/9-18).

EFFORT: ~half-day (3-4 focused hours). Pure mechanical migration;
canonical decision (SINGULAR) is already made.

PRECEDENT: this story mirrors the pattern Story 9-33 F1 established
— constants > literals when cross-file consistency matters.
-->

## Story

As the **maintainer of the OSLSR audit chain**,
I want **every production emit-site for respondent-targeted audit events to reference the shared `AUDIT_TARGETS.RESPONDENT` constant rather than a hardcoded string literal**,
So that **(1) future renames cause TypeScript compile errors at every reference site rather than silent runtime drift, (2) the existing `'respondents'` plural outliers at `backfill-input-sanitisation.ts:257` AND `_cohort-a-supplemental-survey-blast.ts:360` get canonicalised, (3) the audit chain has a single source of truth for `targetResource='respondent'` going forward, and (4) Story 9-33 F1's "smoke-test-vs-emit-site drift" failure class is permanently closed across the entire codebase, not just the 4 sites already migrated**.

## Background — why this story exists

### The drift that triggered Story 9-33 F1

During Story 9-33's Task 5.2 adversarial code review on the smoke-test verification diff (commit `f408785`, 2026-06-01), the reviewer caught the verifier using a hardcoded `'respondent'` string literal in its audit-existence query. That's the exact silent-drift class the smoke test was originally written to catch — irony noted in the review.

The fix did two things:
1. **Extracted the constant**: `apps/api/src/services/audit.service.ts:99-115` now exports:
    ```typescript
    export const AUDIT_TARGETS = {
      RESPONDENT: 'respondent',
    } as const;
    export type AuditTarget = (typeof AUDIT_TARGETS)[keyof typeof AUDIT_TARGETS];
    ```
2. **Migrated 4 reference sites**: smoke-test verifier + 3 production emit-sites in `submission-processing.service.ts` (lines 495, 517, 609 — active-respondent + pending-NIN + race-resolution-merge branches).

### What remains drifty

A grep on 2026-06-01 (re-run after `apps/api/scripts/` was confirmed in-scope) shows **9 production emit-sites + 3 test-assertion sites still use the literal**. TWO of those (the prep-input-sanitisation backfill outlier from 2026-05 + the Cohort A supplemental-survey blast added 2026-05-22 + augmented today) use the PLURAL form `'respondents'` — exactly the drift the constant exists to prevent.

The plural drift is empirically validated as a recurring failure mode: TWO independent operator-script authors INDEPENDENTLY emitted with the plural form across separate stories (`backfill-input-sanitisation.ts:257` in the prep-input-sanitisation backfill and `_cohort-a-supplemental-survey-blast.ts:360` in Story 9-28 Phase A). Without a shared constant + lint rule, every new operator-script audit emission is a coin-flip between singular and plural. The migration + lint pattern this story establishes is the only durable fix.

Until those references migrate to the constant, a future rename of `AUDIT_TARGETS.RESPONDENT` produces compile errors at the 4 migrated sites and SILENT MISSES at the 12 unmigrated sites. The asymmetry IS the bug. Story 9-34 closes it.

### Why now (not later)

This is developer-hygiene work. There's no production data integrity issue to fix; the existing literals all currently evaluate to the same value as the constant. The cost of leaving them is the latent failure mode if someone ever renames the constant. The cost of fixing now is ~half-day of mechanical work.

Recommended pickup: any time during the wizard-redesign arc (9-16 → 9-17 → 9-18) when a developer needs a low-cognitive-load filler task. NOT urgent. NOT field-blocking.

## Concrete migration targets (verified via grep 2026-06-01)

### Production emit-sites — SINGULAR `'respondent'` (6 sites; all migrate to `AUDIT_TARGETS.RESPONDENT`)

| File | Line | Context |
|---|---|---|
| `apps/api/src/controllers/registration.controller.ts` | 211 | `submitWizard` audit emission |
| `apps/api/src/controllers/registration.controller.ts` | 294 | `submitWizard` audit emission (second emit-site) |
| `apps/api/src/controllers/registration.controller.ts` | 615 | Pending-NIN-complete handler |
| `apps/api/src/controllers/registration.controller.ts` | 849 | Supplemental-survey handler (Story 9-28 Phase B) |
| `apps/api/src/workers/reminder.worker.ts` | 207 | Pending-NIN reminder cron audit |
| `apps/api/scripts/_backfill-wizard-questionnaire-loss.ts` | 272 | Operator-gated data-loss marker backfill (Story 9-26 Part B; commit `20f4297`, 2026-06-01). Action: `OPERATOR_BACKFILL_DATA_LOSS_MARKER`. |

### Production emit-sites — PLURAL `'respondents'` outliers (2 sites; canonical bugs)

| File | Line | Notes |
|---|---|---|
| `apps/api/src/scripts/backfill-input-sanitisation.ts` | 257 | Action: `RESPONDENT_BACKFILLED_NORMALISATION` (singular noun in the action name — confirms canonical convention is SINGULAR; the `'respondents'` literal at line 257 is the bug). **HISTORICAL ROWS EXIST** in production `audit_logs` from the prep-input-sanitisation backfill run; AC#B2 cutover comment required here. |
| `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts` | 360 | Action: `OPERATOR_SUPPLEMENTAL_SURVEY_SENT` (Story 9-28 Phase A; commit `9a44228`, 2026-05-22). **ZERO HISTORICAL ROWS** in production `audit_logs` — the Cohort A supplemental-survey blast capability shipped but has never been live-fired against prod (per memory `feedback_cohort_a_disposition_decision`). Simple constant swap; NO cutover comment needed (AC#B1 covers; AC#B2 explicitly excludes this site — see B2 rationale). |

### Test-assertion sites — SINGULAR `'respondent'` (3 sites; optional migration)

| File | Line | Notes |
|---|---|---|
| `apps/api/src/services/__tests__/audit.service.test.ts` | 273 | Asserts the audit emit shape. |
| `apps/api/src/services/__tests__/submission-processing.service.test.ts` | 542 | Asserts the Story 9-33 Bug #2 DATA_CREATE emission shape (sibling test added in commit `f04e9f9`). |
| `apps/api/src/routes/__tests__/registration.routes.test.ts` | 782 | Asserts an end-to-end audit emission. |

Test sites are LOWER priority than production sites because they assert known-value contracts (the literal `'respondent'` matches the constant's value at runtime). Migrating them is cleaner but the failure mode (renaming the constant) WOULD also rename the literal, breaking the assertion — which is what we want.

## Acceptance Criteria

### Part A — Production emit-site migration

1. **AC#A1 — Canonical pick recorded: SINGULAR `'respondent'`.** Documented in this story's Dev Notes "Canonical decision" subsection BEFORE any code change. Rationale: (a) 10 existing references already use singular, (b) the `AUDIT_TARGETS.RESPONDENT` constant shipped in Story 9-33 F1 is named singular, (c) all `AUDIT_ACTIONS` enum values use singular form (e.g., `respondent.backfilled_normalisation`, `pending_nin.created`) — semantic match. The dev agent does NOT relitigate this decision; it's locked here.

2. **AC#A2 — Migrate `registration.controller.ts:211`** — `targetResource: 'respondent'` → `targetResource: AUDIT_TARGETS.RESPONDENT`. Add `AUDIT_TARGETS` to the existing import from `'../services/audit.service.js'` if not already present.

3. **AC#A3 — Migrate `registration.controller.ts:294`** — same pattern as AC#A2 (same file, single import update covers all 4 sites in this file).

4. **AC#A4 — Migrate `registration.controller.ts:615`** — same pattern.

5. **AC#A5 — Migrate `registration.controller.ts:849`** — same pattern.

6. **AC#A6 — Migrate `reminder.worker.ts:207`** — `targetResource: 'respondent'` → `targetResource: AUDIT_TARGETS.RESPONDENT`. Add `AUDIT_TARGETS` to the existing import (or add a new import line if no audit.service import exists yet).

7. **AC#A7 — Migrate `_backfill-wizard-questionnaire-loss.ts:272`** (operator-script in `apps/api/scripts/`, added 2026-06-01 by commit `20f4297` as part of Story 9-26 Part B close-out) — `targetResource: 'respondent'` → `targetResource: AUDIT_TARGETS.RESPONDENT`. Extend the existing import line `import { AuditService, AUDIT_ACTIONS } from '../src/services/audit.service.js';` (line 48) to add `AUDIT_TARGETS`. Note: this file lives under `apps/api/scripts/` (operator-scripts directory), NOT under `apps/api/src/scripts/` — verify path before editing. The audit emission is inside a `db.transaction()` block calling `AuditService.logActionTx(tx, {...})`; constant swap only — atomicity and flush-safety semantics already correct (Part H code-review fix from Story 9-26).

### Part B — Plural outlier migration + audit-chain cutover documentation

8. **AC#B1 — Migrate BOTH plural outliers** from `targetResource: 'respondents'` (plural) to `targetResource: AUDIT_TARGETS.RESPONDENT` (which evaluates to `'respondent'` singular):
    - **(a) `apps/api/src/scripts/backfill-input-sanitisation.ts:257`** — Add `AUDIT_TARGETS` to the existing import; constant swap + cutover comment per AC#B2 below.
    - **(b) `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts:360`** — Add `AUDIT_TARGETS` to the existing import line (`import { AuditService, AUDIT_ACTIONS } from '../src/services/audit.service.js';`); constant swap only. NO cutover comment needed (rationale at AC#B2).

9. **AC#B2 — Add inline cutover comment** at `apps/api/src/scripts/backfill-input-sanitisation.ts:257` ONLY. The comment MUST explicitly mark the cutover date and explain the historical-rows semantics so a future NDPA forensic auditor can resolve the audit-chain spelling difference without re-deriving the history. **Why ONLY this site (not the second plural outlier):** the prep-input-sanitisation backfill has been LIVE-FIRED against prod and produced historical `audit_logs` rows with `target_resource='respondents'` (verifiable via `SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM audit_logs WHERE target_resource='respondents';` — expected non-zero count, dating to the 2026-05 backfill window). The `_cohort-a-supplemental-survey-blast.ts:360` site is from Story 9-28 Phase A which has NEVER been live-fired against prod (the capability shipped but the operator deferred the blast pending Story 9-18 — per memory `feedback_cohort_a_disposition_decision` + sprint-status 9-28 entry). Therefore the Cohort A blast script has produced ZERO `'respondents'` rows in the production audit chain; nothing to bridge; nothing to document. **Add a brief inline marker comment at line 360 of `_cohort-a-supplemental-survey-blast.ts`** explaining the no-historical-rows decision (suggested: `// Story 9-34 cutover 2026-06-XX: constant swap — this script has NEVER been live-fired against prod (per Story 9-28 Phase A deferral), so the production audit_logs chain contains ZERO 'respondents' rows from this site. No cutover comment block needed (see AC#B2 of Story 9-34 for the symmetric backfill-input-sanitisation.ts cutover).`) — keeps the asymmetry self-documenting.

    Suggested cutover comment wording for `backfill-input-sanitisation.ts:257`:
    ```typescript
    // Story 9-34 cutover 2026-06-XX: this site previously emitted
    // `targetResource: 'respondents'` (plural — the codebase outlier).
    // Historical audit_logs rows from runs BEFORE this commit retain
    // the plural form; the Story 6-1 hash chain over those rows stays
    // intact (hash is deterministic over the canonicalised payload —
    // we DO NOT backfill). All NEW emissions from this script use the
    // canonical `AUDIT_TARGETS.RESPONDENT` constant (= 'respondent'
    // singular). Forensic queries that span the cutover must accept
    // BOTH spellings via `targetResource IN ('respondent','respondents')`
    // OR filter by the unchanged `action='respondent.backfilled_normalisation'`
    // which has always been singular.
    ```
    The dev agent may rephrase but MUST preserve the three load-bearing facts: (1) historical rows stay, (2) hash-chain integrity preserved, (3) forensic query pattern for the bridging period.

### Part C — Optional test-site migration

9. **AC#C1 — Optionally migrate `audit.service.test.ts:273`** to use `AUDIT_TARGETS.RESPONDENT`. If the test file already imports from `audit.service.ts`, this is a 1-line change. Dev judgment: include if convenient, defer with a "lower-priority follow-up" note otherwise.

10. **AC#C2 — Optionally migrate `submission-processing.service.test.ts:542`** — same logic as AC#C1. This test was added in commit `f04e9f9` (Story 9-33 Bug #2 fix) and explicitly asserts the DATA_CREATE emission's `targetResource: 'respondent'`. The smoke test's parallel verifier already uses the constant; migrating the unit test for symmetry is the cleanest move but not strictly required.

11. **AC#C3 — Optionally migrate `registration.routes.test.ts:782`** — same logic.

### Part D — Discipline + verification

12. **AC#D1 — `pnpm test` 4/4 packages green post-migration**. Specifically, the affected suites — `audit.service.test.ts`, `submission-processing.service.test.ts`, `registration.routes.test.ts`, `registration.controller.test.ts` (if it exists and touches the audit emissions) — must continue to pass. Zero new failures; zero regressions.

13. **AC#D2 — tsc clean both apps**. The pre-commit husky hook validates this; the dev agent confirms it passes BEFORE staging.

14. **AC#D3 — Memory entry** at `~/.claude/projects/.../memory/feedback_audit_target_unification.md` capturing:
    - The canonical decision (SINGULAR `'respondent'`)
    - The hash-chain semantics (historical rows retained; cutover date marked in code)
    - The recommendation for future `AUDIT_TARGETS.*` additions (one constant per `targetResource` value; add as drift events surface; do NOT pre-emptively migrate all literals across the codebase — wait for the first drift to motivate each migration)
    - The Story 9-33 → 9-34 chain as the case study for "smoke-test catches drift, then a hygiene story closes the migration"

15. **AC#D4 — Pre-merge code review on uncommitted tree** per `feedback_review_before_commit.md`. Auto-fix HIGH/MEDIUM findings per established Story 9-12/9-17/9-30/9-33 patterns. LOW findings deferrable with rationale in §"Review Follow-ups (AI)".

## Tasks / Subtasks

- [ ] **Task 1 — Production emit-site migration (AC: #A2-#A7)**
  - [ ] 1.1: Update `apps/api/src/controllers/registration.controller.ts` import line to include `AUDIT_TARGETS` from `'../services/audit.service.js'`
  - [ ] 1.2: Migrate 4 literal references in `registration.controller.ts` at lines 211, 294, 615, 849 to `AUDIT_TARGETS.RESPONDENT`
  - [ ] 1.3: Update `apps/api/src/workers/reminder.worker.ts` import + migrate line 207
  - [ ] 1.4: Update `apps/api/scripts/_backfill-wizard-questionnaire-loss.ts` import line (line 48) to add `AUDIT_TARGETS` from `'../src/services/audit.service.js'`; migrate line 272 to `AUDIT_TARGETS.RESPONDENT`. **Note operator-script path** — file lives in `apps/api/scripts/` (operator-scripts), NOT `apps/api/src/scripts/`; the relative import depth is `../src/services/...` (one `..` traversal to escape `scripts/` and one more level into `src/`).

- [ ] **Task 2 — Plural outlier migration + cutover documentation (AC: #B1, #B2)**
  - [ ] 2.1: Update `apps/api/src/scripts/backfill-input-sanitisation.ts` import + migrate line 257 (the historically-significant outlier — has live audit_logs rows)
  - [ ] 2.2: Add the inline cutover comment per AC#B2 wording at `backfill-input-sanitisation.ts:257`. Replace `YYYY-MM-DD` placeholder with the actual commit date.
  - [ ] 2.3: Update `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts` import (line ~7 — same `'../src/services/audit.service.js'` pattern as Task 1.4) to add `AUDIT_TARGETS`; migrate line 360 to `AUDIT_TARGETS.RESPONDENT`. Add the brief "no-historical-rows" marker comment per AC#B2 wording (single-line inline comment, NOT a multi-line block — keeps the asymmetry vs the backfill-input-sanitisation cutover self-documenting).
  - [ ] 2.4: **Verification step** — before declaring Task 2 complete, run the prod audit_logs query from AC#B2 against the live database (via Tailscale SSH + psql) to confirm the expected historical-rows asymmetry: `SELECT target_resource, COUNT(*) FROM audit_logs WHERE target_resource = 'respondents' GROUP BY target_resource;` — expected: non-zero count from the backfill-input-sanitisation site, validating the AC#B2 historical-bridge rationale. Capture the count in Dev Agent Record. If the count is ZERO (e.g. operator never ran the backfill against prod), record that AND update AC#B2's comment block to drop the historical-rows paragraph (a comment about something that didn't happen is misleading future auditors).

- [ ] **Task 3 — Optional test-site migration (AC: #C1, #C2, #C3) — dev judgment**
  - [ ] 3.1: Migrate `audit.service.test.ts:273` if convenient (1-line change if import exists)
  - [ ] 3.2: Migrate `submission-processing.service.test.ts:542` if convenient
  - [ ] 3.3: Migrate `registration.routes.test.ts:782` if convenient
  - [ ] 3.4: Document any deferrals in Dev Agent Record with rationale

- [ ] **Task 4 — Memory entry (AC: #D3)**
  - [ ] 4.1: Author `feedback_audit_target_unification.md` per the AC#D3 outline
  - [ ] 4.2: Add MEMORY.md index entry under "Key Patterns" or "Process Patterns"

- [ ] **Task 5 — Pre-merge code review + verification (AC: #D1, #D2, #D4)**
  - [ ] 5.1: `pnpm test` from root — confirm 4/4 packages green; capture API + Web test counts in Dev Agent Record
  - [ ] 5.2: `tsc --noEmit` on api + web — clean exit
  - [ ] 5.3: Run `/code-review` workflow on uncommitted tree
  - [ ] 5.4: Address HIGH/MEDIUM findings inline; defer LOW with rationale

## Dev Notes

### Canonical decision (load-bearing — do NOT relitigate at impl time)

**Singular `'respondent'`** is the canonical value for `targetResource` on respondent-targeted audit events. Locked 2026-06-01 by Awwal via the parent-Claude brief for Story 9-34. Rationale captured in the "Background" section above; the dev agent does NOT re-debate.

### Hash-chain semantics (load-bearing — required reading for any NDPA forensic auditor)

Story 6-1's audit hash chain stores `SHA-256(canonicalJsonStringify(payload))` per row, with each row's hash referencing the prior row's hash. The `targetResource` value is part of the canonicalised payload, so changing the value for a future emission produces a different hash than the prior-emission's hash would have if it had used the new value. **This is fine**: the hash chain verifies that no row has been tampered AFTER it was written, NOT that all rows use the same vocabulary forever.

**Historical rows from before this story's commit retain `targetResource: 'respondents'`** (the backfill emit-site is the only producer of that value in production audit_logs; verify in production via `SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM audit_logs WHERE target_resource = 'respondents';`). Those rows' hash-chain links are still valid; they form a contiguous trail through the chain.

**Forensic queries that span the 9-34 cutover must accept both spellings**:
```sql
-- Spans the cutover (works for any time window):
SELECT * FROM audit_logs
WHERE target_resource IN ('respondent', 'respondents')
  AND action = 'respondent.backfilled_normalisation';

-- Or query by the unchanged action enum which is the canonical filter:
SELECT * FROM audit_logs
WHERE action = 'respondent.backfilled_normalisation';
```

The inline cutover comment at AC#B2 makes this explicit in code so future maintainers can answer "why does the audit chain have both spellings?" without spelunking git history.

### Why NOT migrate other `targetResource` values in this story

The codebase has many `targetResource` values: `'user'`, `'submission'`, `'questionnaire'`, `'consumer'`, `'feature_flag'`, etc. Story 9-34 is RESPONDENT-only. Reasons:
1. **Scope discipline**: each `targetResource` should get its own constant when its first drift event motivates it. The Story 9-33 F1 finding specifically surfaced the respondent drift; we don't have evidence of drift for the other values.
2. **YAGNI**: adding constants for hypothetical drift bloats the AUDIT_TARGETS export and creates new maintenance surface for zero observed benefit.
3. **Pattern, not project**: this story establishes the *pattern* (extract constant when drift surfaces). Future stories can adopt the pattern when needed.

A future Story 9-3X or 10-XX may extract `AUDIT_TARGETS.USER`, `AUDIT_TARGETS.SUBMISSION`, etc., as their drift events arise. NOT this story.

### Why optional test-site migration (AC#C1-C3) is genuinely optional

The 3 test sites assert the audit emission's shape using `expect.objectContaining({ targetResource: 'respondent' })`. The literal `'respondent'` in the test is asserting a KNOWN VALUE, not coupling to a code identifier. If a future rename changes `AUDIT_TARGETS.RESPONDENT` from `'respondent'` to (say) `'respondent_v2'`:
- The production emit-sites (post-9-34) automatically use the new value via the constant
- The test assertions still expect the old literal `'respondent'` → tests fail loudly
- The dev agent fixes the test by updating the literal

This is the DESIRED behavior — tests catching the value change. Migrating the test literals to use the constant would HIDE the rename from the tests (they'd silently move with the constant), which is the OPPOSITE of what we want for test rigor. So the test-site migration is BETTER described as "optional, dev-judgment, possibly DON'T do it" rather than "should do it for symmetry."

The dev agent should read the AC#C1-C3 ACs CRITICALLY and prefer to LEAVE tests with literals unless there's a specific reason to migrate. If migrating, add a brief comment explaining the choice. Document the decision in Dev Agent Record.

### Why this is genuinely low-priority (not just polite framing)

Field deployment is unblocked by Story 9-33's hotfix. The audit chain works correctly today; the literal-vs-constant distinction is purely about FUTURE-RENAME safety. If no one ever renames `AUDIT_TARGETS.RESPONDENT`, this story changes literally zero runtime behavior. The investment is insurance against a low-probability future event.

That said, the insurance IS valuable: when the next drift event happens (Story 9-3X+ surface), having the migration already done prevents the same Story 9-33 F1 finding from recurring. So it's worth doing — just not urgently.

### File-level overlap with parallel-track stories

- **Story 9-16** (magic-link login): touches auth surface, NOT registration.controller. No overlap with this story's Task 1.
- **Story 9-17** (form pin + Pattern C): wizard frontend + Q.M. page. No backend overlap.
- **Story 9-18** (NIN-first wizard redesign): wizard frontend + `submitWizard` controller. POTENTIAL OVERLAP with `registration.controller.ts` (the audit emit-sites in the wizard handler are at lines 211 + 294; 9-18 may touch the surrounding code). Recommend: ship 9-18 first, then 9-34 picks up whatever line numbers result. Dev agent verifies via grep at impl time and updates ACs if line numbers shift.
- **Story 9-27 Part B** (SMS Termii): new files. No overlap.
- **Story 9-32** (account-settings + NDPA rights): new files (NDPA rights add NEW audit emit-sites which SHOULD use `AUDIT_TARGETS.RESPONDENT` from inception — note for 9-32's dev agent in their Dev Notes).

### Verification strategy

The migration is mechanical; the verification is "tests pass + tsc clean + grep shows zero remaining `targetResource: 'respondent'` or `'respondents'` literals in production code (incl. operator-scripts)." A quick sanity grep at the end of Task 5 — **note BOTH `apps/api/src` AND `apps/api/scripts` are in scope** (the 2026-06-01 amendment to this story surfaced two operator-script sites in `apps/api/scripts/` that the original grep missed):
```bash
grep -rn "targetResource:\s*['\"]respondents\?['\"]" apps/api/src apps/api/scripts \
  | grep -v "__tests__"  # exclude test-site literals which are intentionally left
```
should return zero lines (or only the 3 test sites if AC#C1-C3 were deferred). Document the grep output in Dev Agent Record.

### Project Structure Notes

No file moves; no migrations; no new tables; no new audit-action enum values. Pure import + literal-to-constant changes across **5 production files** (1 controller + 1 worker + 3 operator/backfill scripts) covering **8 emit-sites** (4 in `registration.controller.ts` at lines 211/294/615/849 + 1 each in `reminder.worker.ts:207`, `_backfill-wizard-questionnaire-loss.ts:272`, `backfill-input-sanitisation.ts:257`, `_cohort-a-supplemental-survey-blast.ts:360`). Plus 2 inline cutover/marker comments (1 multi-line block at `backfill-input-sanitisation.ts:257`, 1 single-line at `_cohort-a-supplemental-survey-blast.ts:360`). If optional test-site migration runs, +3 files.

### References

- [Source: apps/api/src/services/audit.service.ts:99-115] — AUDIT_TARGETS export (already shipped via Story 9-33 F1 commit `f408785`)
- [Source: apps/api/src/services/submission-processing.service.ts:495, 517, 609] — example pattern of constant usage from Story 9-33 F1 migration
- [Source: _bmad-output/implementation-artifacts/9-33-enumerator-path-formid-and-audit-hotfix.md § "Change Log" 2026-06-01] — Story 9-33 F1 finding text + close-out
- [Source: _bmad-output/implementation-artifacts/9-32-public-account-settings-and-ndpa-rights.md] — future story that will add new audit emit-sites; flag 9-32's dev agent to use `AUDIT_TARGETS.RESPONDENT` from inception
- [Source: apps/api/scripts/_backfill-wizard-questionnaire-loss.ts:269-282] — operator-script audit emission in a `db.transaction()` calling `AuditService.logActionTx(tx, {...})`; pattern to mirror in AC#A7 migration. Added by commit `20f4297` (2026-06-01, Story 9-26 Part B close-out).
- [Source: apps/api/scripts/_cohort-a-supplemental-survey-blast.ts:357-371] — operator-script audit emission (plural-outlier site #2). Added by commit `9a44228` (2026-05-22, Story 9-28 Phase A). Per memory `feedback_cohort_a_disposition_decision`: shipped but never live-fired — zero historical `'respondents'` rows in production audit_logs from this site.
- [Source: _bmad-output/implementation-artifacts/9-26-unified-ingestion-pipeline.md § "Part H" + "Part B"] — Story 9-26 Part B close-out which introduced the new singular operator-script site that AC#A7 migrates.
- [Source: _bmad-output/implementation-artifacts/9-28-cohort-a-step4-recovery-decision.md] — Cohort A Path B story; capability shipped but blast deferred (rationale for "zero historical rows" claim in AC#B2 + AC#B1(b)).
- Memory: [[feedback_review_before_commit]] — Task 5 discipline
- Memory: [[project_field_readiness_sequence_2026_05_31]] — 9-34 sequencing (post-launch, off critical path)
- Memory: [[feedback_cohort_a_disposition_decision]] — supports AC#B2's "zero historical rows" claim for `_cohort-a-supplemental-survey-blast.ts:360`

## Dev Agent Record

### Agent Model Used

(to be populated by dev-story)

### Pre-impl Decision Log

(to be populated — particularly the Task 3 optional-test-migration decision)

### Debug Log References

(to be populated)

### Completion Notes List

(to be populated)

### File List

(to be populated — expected: 5-6 production files modified + memory entry + optional test files)

### Verification — final grep

(to be populated post-migration — operator runs the AC#D2 sanity grep + captures output here)

### Review Follow-ups (AI)

(to be populated post-code-review per Task 5)

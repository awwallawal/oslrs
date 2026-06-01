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
verifier). BUT 8 production emit-sites + 3 test sites STILL use the
string literal across other files, INCLUDING ONE OUTLIER that uses
the plural form `'respondents'` (the exact drift the constant exists
to prevent). This story closes the migration.

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
So that **(1) future renames cause TypeScript compile errors at every reference site rather than silent runtime drift, (2) the existing `'respondents'` plural outlier at `backfill-input-sanitisation.ts:257` gets canonicalised, (3) the audit chain has a single source of truth for `targetResource='respondent'` going forward, and (4) Story 9-33 F1's "smoke-test-vs-emit-site drift" failure class is permanently closed across the entire codebase, not just the 4 sites already migrated**.

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

A grep on 2026-06-01 shows **8 production emit-sites + 3 test-assertion sites still use the literal**. ONE of those (the backfill outlier) uses the PLURAL form `'respondents'` — exactly the drift the constant exists to prevent.

Until those references migrate to the constant, a future rename of `AUDIT_TARGETS.RESPONDENT` produces compile errors at the 4 migrated sites and SILENT MISSES at the 11 unmigrated sites. The asymmetry IS the bug. Story 9-34 closes it.

### Why now (not later)

This is developer-hygiene work. There's no production data integrity issue to fix; the existing literals all currently evaluate to the same value as the constant. The cost of leaving them is the latent failure mode if someone ever renames the constant. The cost of fixing now is ~half-day of mechanical work.

Recommended pickup: any time during the wizard-redesign arc (9-16 → 9-17 → 9-18) when a developer needs a low-cognitive-load filler task. NOT urgent. NOT field-blocking.

## Concrete migration targets (verified via grep 2026-06-01)

### Production emit-sites — SINGULAR `'respondent'` (5 sites; all migrate to `AUDIT_TARGETS.RESPONDENT`)

| File | Line | Context |
|---|---|---|
| `apps/api/src/controllers/registration.controller.ts` | 211 | `submitWizard` audit emission |
| `apps/api/src/controllers/registration.controller.ts` | 294 | `submitWizard` audit emission (second emit-site) |
| `apps/api/src/controllers/registration.controller.ts` | 615 | Pending-NIN-complete handler |
| `apps/api/src/controllers/registration.controller.ts` | 849 | Supplemental-survey handler (Story 9-28 Phase B) |
| `apps/api/src/workers/reminder.worker.ts` | 207 | Pending-NIN reminder cron audit |

### Production emit-site — PLURAL `'respondents'` outlier (1 site; canonical bug)

| File | Line | Notes |
|---|---|---|
| `apps/api/src/scripts/backfill-input-sanitisation.ts` | 257 | Action: `RESPONDENT_BACKFILLED_NORMALISATION` (singular noun in the action name — confirms canonical convention is SINGULAR; the `'respondents'` literal at line 257 is the bug). |

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

### Part B — Plural outlier migration + audit-chain cutover documentation

7. **AC#B1 — Migrate `backfill-input-sanitisation.ts:257`** from `targetResource: 'respondents'` (plural) to `targetResource: AUDIT_TARGETS.RESPONDENT` (which evaluates to `'respondent'` singular). Add `AUDIT_TARGETS` to the existing import.

8. **AC#B2 — Add inline cutover comment** at `backfill-input-sanitisation.ts:257`. The comment MUST explicitly mark the cutover date and explain the historical-rows semantics so a future NDPA forensic auditor can resolve the audit-chain spelling difference without re-deriving the history. Suggested wording:
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

- [ ] **Task 1 — Production emit-site migration (AC: #A2-#A6)**
  - [ ] 1.1: Update `registration.controller.ts` import line to include `AUDIT_TARGETS` from `'../services/audit.service.js'`
  - [ ] 1.2: Migrate 4 literal references at lines 211, 294, 615, 849 to `AUDIT_TARGETS.RESPONDENT`
  - [ ] 1.3: Update `reminder.worker.ts` import + migrate line 207

- [ ] **Task 2 — Plural outlier migration + cutover comment (AC: #B1, #B2)**
  - [ ] 2.1: Update `backfill-input-sanitisation.ts` import + migrate line 257
  - [ ] 2.2: Add the inline cutover comment per AC#B2 wording. Replace `YYYY-MM-DD` placeholder with the actual commit date.

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

The migration is mechanical; the verification is "tests pass + tsc clean + grep shows zero remaining `targetResource: 'respondent'` or `'respondents'` literals in production code." A quick sanity grep at the end of Task 5:
```bash
grep -rn "targetResource:\s*['\"]respondents\?['\"]" apps/api/src \
  | grep -v "__tests__"  # exclude test-site literals which are intentionally left
```
should return zero lines (or only the 3 test sites if AC#C1-C3 were deferred). Document the grep output in Dev Agent Record.

### Project Structure Notes

No file moves; no migrations; no new tables; no new audit-action enum values. Pure import + literal-to-constant changes across 6 files (5 production + 1 backfill script). If optional test-site migration runs, +3 files.

### References

- [Source: apps/api/src/services/audit.service.ts:99-115] — AUDIT_TARGETS export (already shipped via Story 9-33 F1 commit `f408785`)
- [Source: apps/api/src/services/submission-processing.service.ts:495, 517, 609] — example pattern of constant usage from Story 9-33 F1 migration
- [Source: _bmad-output/implementation-artifacts/9-33-enumerator-path-formid-and-audit-hotfix.md § "Change Log" 2026-06-01] — Story 9-33 F1 finding text + close-out
- [Source: _bmad-output/implementation-artifacts/9-32-public-account-settings-and-ndpa-rights.md] — future story that will add new audit emit-sites; flag 9-32's dev agent to use `AUDIT_TARGETS.RESPONDENT` from inception
- Memory: [[feedback_review_before_commit]] — Task 5 discipline
- Memory: [[project_field_readiness_sequence_2026_05_31]] — 9-34 sequencing (post-launch, off critical path)

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

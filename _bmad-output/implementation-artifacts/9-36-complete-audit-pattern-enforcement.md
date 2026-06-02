# Story 9.36: Complete audit-pattern enforcement — narrow `targetResource` type + extract 3 more constants + close mock-factory blast radius

Status: backlog

<!--
2026-06-02 OPERATOR DECISION (Awwal, parent-Claude scope-review session):
Authored from Story 9-34's `/code-review` findings but DOWNGRADED to backlog
on practical-impact grounds. Story 9-34 alone is sufficient for field-readiness;
the additional findings represent theoretical drift safety vs concrete risk.

Rationale captured at decision time:
- F1 (type narrowing): zero practical impact today; compile enforcement only
  matters if the constant value is ever renamed (very low probability).
- F2 (drift at user/users, magic_link_token/s, fraud_detection/s): drift has
  existed for months without any reported forensic-query failure. Operators
  query by `action` (always singular), not by `target_resource`.
- F3 (logPiiAccess emits 'respondents'): pre-existing condition not made worse
  by 9-34; canonical operator forensic workflow filters by action, not by
  target_resource alone.
- F7 (19 explicit-factory mocks): self-defusing if 9-36 doesn't ship — no new
  AUDIT_TARGETS.* exports → no regression trigger.

REVISIT TRIGGERS (any of these → consider promoting backlog → ready-for-dev):
- Operator forensic query produces incomplete results because of cross-spelling.
- Anyone proposes renaming `AUDIT_TARGETS.RESPONDENT` value.
- New audit emit-site is added during 9-3X / 10-XX work and the dev hits the
  mock-factory blast radius again.
- NDPA auditor flags incomplete audit_logs coverage.

Until one of these triggers, this story stays as documented intent — not work.
-->


<!--
Authored 2026-06-02 by Bob (SM) via canonical *create-story --yolo workflow.

ORIGIN: Story 9-34's `/code-review` skill execution (recall mode, extra-high
effort, 9 finder angles + verifier + sweep) surfaced 3 HIGH-severity findings
+ 1 MED-severity finding that share a coherent theme: the constant-extraction
pattern from Story 9-33 F1 + Story 9-34 is INCOMPLETE and won't actually
deliver its stated benefits without these closures. The findings exceeded
9-34's stated charter; carving them out keeps 9-34's blast radius bounded.

THE FOUR FINDINGS:
  F1 (HIGH) — `targetResource: string` typing in 4 audit.service.ts method
    signatures means `AuditTarget` is exported-but-unused; ZERO compile-time
    enforcement. Story 9-33 F1's stated "compile error at every reference
    site" is NOT actually achieved. The whole point of the constant is null.
  F2 (HIGH) — Same singular/plural drift exists RIGHT NOW for 3 other
    resources: `user/users`, `magic_link_token/s`, `fraud_detection/s`
    (verified via grep 2026-06-02). Story 9-34's YAGNI argument is
    empirically contradicted — drift has already surfaced at the other
    resources but is invisible.
  F3 (HIGH) — Story 9-34's "single source of truth for
    targetResource=respondent" claim is FACTUALLY INCOMPLETE.
    `logPiiAccess` callers at respondent.controller.ts:83,116 +
    export.controller.ts:171 still emit 'respondents' plural. Story scope
    implicitly covered only `logAction`/`logActionTx` callers; the
    `logPiiAccess` family was missed.
  F7 (MED) — Story 9-34's mock-factory fix at registration.routes.test.ts
    was a BAND-AID. 19 of 21 test files mocking audit.service.js use
    explicit factories that will regress identically the next time a new
    AUDIT_TARGETS.* export is added (i.e. as part of AC#A2 of this story).

PRIORITY: HIGH-completeness — without this, Story 9-34 + 9-33 F1 leave the
  audit-pattern enforcement at "documentation, not constraint". The audit
  trail produces correct values today by coincidence + dev discipline; nothing
  ENFORCES it. Field-readiness is UNBLOCKED (9-34 closes the immediate
  respondent drift); 9-36 closes the rest at-leisure but should ship before
  any meaningful audit-trail-relying feature (e.g. Story 9-32 NDPA rights,
  Story 9-11 audit-log-viewer expansion).

EFFORT: ~1-2 dev-days. Task 1 (AC#A2 — extract 3 constants + migrate 26+
  sites) is the bulk; tasks 2-4 are mechanical follow-ons.

DEPENDENCIES: Story 9-34 done (AUDIT_TARGETS.RESPONDENT shipped; cutover
  discipline established at apps/api/src/scripts/backfill-input-sanitisation.ts:249-269
  for plural-outlier sites with historical rows). Story 6-1 (hash chain —
  unchanged scope).
-->

## Story

As the **maintainer of the OSLSR audit chain**,
I want **(a) every audit emission method's `targetResource` parameter to be typed as `AuditTarget` (the union literal type), (b) every singular/plural drift currently visible in production code to be unified to canonical singular constants, (c) every audit emission across the `logAction`-family AND the `logPiiAccess`-family to reference `AUDIT_TARGETS.*` constants rather than string literals, and (d) every test file mocking `audit.service.js` to use the spread-`importActual` pattern so future exports auto-propagate**,
So that **(1) the compile-time enforcement that Story 9-33 F1 + Story 9-34 PROMISED is actually delivered (a typo at any callsite produces a tsc error rather than silent runtime drift), (2) the entire drift class — not just the respondent axis — is closed, (3) the audit chain produces a single canonical value per resource axis ENFORCED by the type system, and (4) the explicit-factory mock blast radius that just caused Story 9-34's mid-impl regression is eliminated codebase-wide rather than band-aided one factory at a time**.

## Background — why this story exists

### What Stories 9-33 F1 + 9-34 left undone

**Story 9-33 F1** (2026-06-01, commit `f408785`) introduced `AUDIT_TARGETS.RESPONDENT` to close a smoke-test-vs-emit-site drift. The stated rationale (from the constant's docblock at `apps/api/src/services/audit.service.ts:113-124`): "a future rename of any value here causes a compile error at every reference site (both producers and consumers), rather than silently drifting".

**Story 9-34** (2026-06-01/02, current `review` status) migrated 8 production emit-sites in 5 files to reference the constant. The migration was value-preserving (`'respondent' === AUDIT_TARGETS.RESPONDENT` at runtime); existing tests stayed green.

### What the code review caught

Pre-merge code-review of Story 9-34 (extra-high effort, 9 finder angles + verifier + sweep) caught **three load-bearing premises that don't hold**:

1. **The compile-time enforcement claim is false.** `audit.service.ts` exports `AuditTarget` as the union type derived from `AUDIT_TARGETS`'s values (line 129: `export type AuditTarget = (typeof AUDIT_TARGETS)[keyof typeof AUDIT_TARGETS];`), but the four audit-emission methods — `logAction` (line 292), `logActionTx` (line 335), `logPiiAccess` (line 203), `logPiiAccessTx` (line 250) — all type the `targetResource` parameter as `string` (widened). A typo at any callsite (`targetResource: 'respondnt'`) compiles without complaint. The constant gives **zero compile-time protection** — its only value today is reader-intent documentation. **(F1)**

2. **The drift is broader than 9-34 acknowledged.** Story 9-34's "Why NOT migrate other targetResource values in this story" Dev Notes section argued YAGNI: "we don't have evidence of drift for the other values". A grep on 2026-06-02 disproved this — drift is empirically visible RIGHT NOW for 3 other resource axes:
    - `'user'` (5 sites) vs `'users'` (22 sites) — split 17/82 in favour of plural
    - `'magic_link_token'` (1 site) vs `'magic_link_tokens'` (3 sites) — split 25/75 in favour of plural
    - `'fraud_detection'` (2 sites) vs `'fraud_detections'` (1 site) — split 67/33 in favour of singular
   The respondent axis (`'respondent'` 10 sites vs `'respondents'` 2 sites) was the SAME pattern that Story 9-33 F1 surfaced. **(F2)**

3. **The "single source of truth" claim is incomplete.** Story 9-34's Story sentence § (3) says "the audit chain has a single source of truth for `targetResource='respondent'` going forward". But `respondent.controller.ts:83, 116` + `export.controller.ts:171` continue to emit `'respondents'` plural via `logPiiAccess` (which Story 9-34's scope missed entirely — the migration only covered `logAction`-family callers). Post-Story-9-34, audit_logs contains BOTH spellings going forward from sibling code paths writing to the same column. **(F3)**

### Why the mock-factory blast radius matters

Mid-implementation of Story 9-34, Amelia's first `pnpm test` run failed 7 tests in `registration.routes.test.ts` with `expected 500 to be 201`. Root cause: the test file's explicit `vi.mock('audit.service.js', () => ({...}))` factory hand-listed `{ AuditService, AUDIT_ACTIONS }` but NOT `AUDIT_TARGETS`. The migrated production code's `AUDIT_TARGETS.RESPONDENT` resolved to `undefined.RESPONDENT` → TypeError → 500.

Story 9-34 patched **one** factory by adding `AUDIT_TARGETS` to it. But there are **19 other test files** using the same explicit-factory pattern (the safe spread-`importActual` pattern at `submission-processing.service.test.ts:51-63` is the minority — 2 of 21 files). Each is a latent landmine for the moment a future export of `audit.service.ts` lands. AC#A2 of THIS story (adding 3 new constants) is exactly that next-export event, so the 19 mocks must be migrated alongside, OR repeated regression hits are guaranteed. **(F7)**

### Why fix now (sequencing rationale)

- Field-readiness is **UNBLOCKED** — Story 9-34's respondent migration closes the immediate audit-chain need.
- 9-36 is **HIGH-COMPLETENESS** — without it, the constant-extraction pattern is documentation theater. Every promise made in `feedback_audit_target_unification.md` is unenforceable.
- **HARD deps**: Story 9-32 (NDPA rights — adds new audit emissions) + Story 9-11-expanded (audit-log-viewer Story 9-37 work). 9-32's dev agent was already flagged in Story 9-34's references to use `AUDIT_TARGETS.RESPONDENT` from inception. If 9-36 ships first, 9-32 + future stories inherit a type-enforced foundation.
- **Sequencing recommendation**: pick up 9-36 before the wizard-redesign arc (9-16 → 9-17 → 9-18) ships if bandwidth allows; otherwise after 9-18 done and before 9-32 implementation start.

## Concrete migration targets (verified via grep 2026-06-02)

### AC#A2 — `'user'`/`'users'` drift (27 sites total → migrate to `AUDIT_TARGETS.USER`)

| File | Line | Current value |
|---|---|---|
| `apps/api/src/controllers/user.controller.ts` | 199 | `'user'` (singular) |
| `apps/api/src/services/view-as.service.ts` | 116 | `'user'` (singular) |
| `apps/api/src/services/view-as.service.ts` | 156 | `'user'` (singular) |
| `apps/api/src/middleware/mfa-grace.ts` | 78 | `'users'` (plural) |
| `apps/api/src/controllers/mfa.controller.ts` | 82, 131, 143, 160, 171, 218, 229, 259, 311, 340, 387, 426 | `'users'` × 12 |
| `apps/api/src/services/staff.service.ts` | 227, 246, 327, 412, 454, 660, 880 | `'users'` × 7 |
| `apps/api/src/services/auth.service.ts` | 199, 621, 676 | `'users'` × 3 |
| `apps/api/src/services/__tests__/view-as.service.test.ts` | 168 | `'user'` (test assertion — UPDATE value contract) |

**Canonical**: SINGULAR `'user'` (matches `AUDIT_TARGETS.RESPONDENT` precedent + AUDIT_ACTIONS enum singular convention). Plural-emit sites become outliers requiring cutover comments.

### AC#A2 — `'magic_link_token'`/`'magic_link_tokens'` drift (4 sites → migrate to `AUDIT_TARGETS.MAGIC_LINK_TOKEN`)

| File | Line | Current value |
|---|---|---|
| `apps/api/src/controllers/registration.controller.ts` | 678 | `'magic_link_token'` (singular) |
| `apps/api/src/workers/reminder.worker.ts` | 131 | `'magic_link_tokens'` (plural) |
| `apps/api/src/controllers/magic-link.controller.ts` | 89 | `'magic_link_tokens'` (plural) |
| `apps/api/src/controllers/magic-link.controller.ts` | 187 | `'magic_link_tokens'` (plural) |

**Canonical**: SINGULAR `'magic_link_token'`.

### AC#A2 — `'fraud_detection'`/`'fraud_detections'` drift (3 sites → migrate to `AUDIT_TARGETS.FRAUD_DETECTION`)

| File | Line | Current value |
|---|---|---|
| `apps/api/src/services/assessor.service.ts` | 413 | `'fraud_detection'` (singular) |
| `apps/api/src/controllers/fraud-detections.controller.ts` | 585 | `'fraud_detections'` (plural) |
| `apps/api/src/services/__tests__/assessor.service.test.ts` | 314 | `'fraud_detection'` (test assertion — value contract, no change) |

**Canonical**: SINGULAR `'fraud_detection'`.

### AC#A3 — `logPiiAccess('respondents', ...)` callers (3 production sites + 6 test-assertion updates)

| File | Line | Notes |
|---|---|---|
| `apps/api/src/controllers/respondent.controller.ts` | 83 | `PII_ACTIONS.VIEW_LIST` — migrate literal `'respondents'` → `AUDIT_TARGETS.RESPONDENT` |
| `apps/api/src/controllers/respondent.controller.ts` | 116 | `PII_ACTIONS.VIEW_RECORD` — same |
| `apps/api/src/controllers/export.controller.ts` | 171 | PII export — same |
| `apps/api/src/controllers/__tests__/respondent.controller.test.ts` | 275, 307 | Test assertions — UPDATE expected value from `'respondents'` to `'respondent'` (value contract) |
| `apps/api/src/controllers/__tests__/respondent-list.controller.test.ts` | 278, 297 | Test assertions — same |
| `apps/api/src/controllers/__tests__/export.controller.test.ts` | 198, 219 | Test assertions — same |

**Historical-rows cutover comment** required at all 3 production sites — `logPiiAccess` is the most-trafficked audit method in prod (PII_VIEW_LIST/RECORD/EXPORT_CSV fire on every super_admin browse). The shared block can sit ABOVE all 3 calls as a top-of-method docblock if they're co-located, or above the first call with cross-refs at the other 2. Dev agent's call.

### AC#A4 — Explicit-factory `vi.mock('audit.service.js')` mocks (19 files)

Enumerate via: `grep -rln "vi.mock.*audit.service" apps/api/src --include="*.test.ts"`. The 2 already-safe files (spread-`importActual` pattern):
- `apps/api/src/services/__tests__/submission-processing.service.test.ts:51-63`
- `apps/api/src/services/__tests__/submission-ingestion.integration.test.ts` (per Story 9-34 §Sweep)

The 19 explicit-factory files become AC#A4's migration targets. The dev agent enumerates them at impl time + chooses Option A (in-place spread-`importActual` per file) vs Option B (shared helper `apps/api/src/test-utils/audit-service-mock.ts`). Pre-impl Decision Log captures the choice.

## Acceptance Criteria

### Part A — Code changes

1. **AC#A1 — Narrow `targetResource` parameter to `AuditTarget` in 4 audit-emission method signatures.** Change `apps/api/src/services/audit.service.ts`:
    - Line 203 `logPiiAccess(req, action, targetResource: string, ...)` → `targetResource: AuditTarget`
    - Line 250 `logPiiAccessTx(tx, ..., targetResource: string, ...)` → `targetResource: AuditTarget`
    - Line 292 `logAction({ ..., targetResource: string, ... })` → `targetResource: AuditTarget`
    - Line 335 `logActionTx({ ..., targetResource: string, ... })` → `targetResource: AuditTarget`
    LAND THIS AFTER AC#A2 + AC#A3 are complete — otherwise 26+ existing callsites that emit non-`AUDIT_TARGETS.*` values produce compile errors. The order matters: extract constants first, migrate all sites, THEN narrow the type.

2. **AC#A2 — Extract 3 new `AUDIT_TARGETS.*` constants + migrate 26+ sites.** Update `apps/api/src/services/audit.service.ts:125-127`:
    ```typescript
    export const AUDIT_TARGETS = {
      RESPONDENT: 'respondent',
      USER: 'user',
      MAGIC_LINK_TOKEN: 'magic_link_token',
      FRAUD_DETECTION: 'fraud_detection',
    } as const;
    ```
    Migrate all 27 user-axis sites (8 singular + 22 plural + 1 test) → `AUDIT_TARGETS.USER`. Migrate all 4 magic-link-token-axis sites (1 singular + 3 plural) → `AUDIT_TARGETS.MAGIC_LINK_TOKEN`. Migrate all 3 fraud-detection-axis sites (2 singular + 1 plural) → `AUDIT_TARGETS.FRAUD_DETECTION`. Add `AUDIT_TARGETS` to each file's import line if not already present.

3. **AC#A3 — Migrate 3 `logPiiAccess('respondents', ...)` production sites + update 6 test assertions.** Change `'respondents'` (plural literal) → `AUDIT_TARGETS.RESPONDENT` at the 3 production sites. Add `AUDIT_TARGETS` to the existing imports (`AuditService, PII_ACTIONS` → `AuditService, PII_ACTIONS, AUDIT_TARGETS`). Update the 6 sibling test assertions from `'respondents'` → `'respondent'` (test sites stay with literals per `feedback_audit_target_unification.md` § "Test sites stay with literals" guidance; the literal updates to the new singular value).

4. **AC#A4 — Refactor 19 explicit-factory `vi.mock('audit.service.js')` files.** Pre-impl decision in Dev Notes: Option A (in-place spread-`importActual` per file) or Option B (shared helper at `apps/api/src/test-utils/audit-service-mock.ts`). Either option closes the entire blast radius — Option A is mechanically simpler; Option B reduces ~80 LOC of duplicated mock skeleton. Document the choice with rationale in Pre-impl Decision Log.

### Part B — Cutover documentation

5. **AC#B1 — Pre-impl prod SQL queries to scope cutover-comment depth.** Dev agent runs (via Tailscale SSH + psql):
    ```sql
    SELECT target_resource, COUNT(*), MIN(created_at), MAX(created_at)
    FROM audit_logs
    WHERE target_resource IN ('user', 'users', 'magic_link_token', 'magic_link_tokens',
                              'fraud_detection', 'fraud_detections', 'respondents')
    GROUP BY target_resource
    ORDER BY 1;
    ```
    Captures the historical-rows count for EACH legacy spelling. Document the counts in Dev Agent Record's "Pre-impl prod query results" subsection.

6. **AC#B2 — Cutover comments at sites with non-zero historical rows.** For each plural-emit production site whose legacy spelling has non-zero historical rows in prod audit_logs (per AC#B1 query), add a multi-line cutover comment block ABOVE the `AuditService.log*(...)` call following the Story 9-34 template (post-F14-fix) at `apps/api/src/scripts/backfill-input-sanitisation.ts:249-269`. The comment MUST preserve the three load-bearing facts: (1) historical rows retain old spelling, (2) hash-chain integrity preserved because `targetResource` is NOT in `computeHash` payload (cite `audit.service.ts:183-193`), (3) forensic-query bridge pattern.

    Sites with ZERO historical rows in prod (per AC#B1 query) get a single-line marker comment per Story 9-34 AC#B2's "single-line inline" guidance for the cohort-a-blast pattern at `_cohort-a-supplemental-survey-blast.ts:357`.

7. **AC#B3 — `logPiiAccess` cutover documentation.** The 3 `logPiiAccess('respondents', ...)` sites are co-located in 2 files (respondent.controller × 2 + export.controller × 1). Add a shared top-of-method docblock (or a top-of-controller comment) explaining the `'respondents'` → `AUDIT_TARGETS.RESPONDENT` cutover with the same three load-bearing facts as AC#B2. Saves duplicating the block 3×.

### Part C — Verification + discipline

8. **AC#C1 — `pnpm test` 4/4 packages green post-migration.** Zero new failures; zero regressions. Specifically watch:
    - `mfa.controller.test.ts` + `staff.service.test.ts` + `auth.service.test.ts` (12 + 8 + 3 sites in scope for AC#A2)
    - `respondent.controller.test.ts` + `respondent-list.controller.test.ts` + `export.controller.test.ts` (6 test-line updates from AC#A3)
    - `assessor.service.test.ts` + `view-as.service.test.ts` (test-assertion value updates from AC#A2)
    - All 19 explicit-factory mocks refactored by AC#A4 (no functional change expected; refactor should be transparent)

9. **AC#C2 — `tsc --noEmit` clean on both apps.** AC#A1 (narrow type) MUST cause compile errors that AC#A2 + AC#A3 fix. The dev agent verifies via:
    - First land AC#A2 + AC#A3 (Tasks 1+2).
    - Then land AC#A1 (Task 3).
    - Then run `pnpm exec tsc --noEmit` on `apps/api` — must be zero errors.
    If any compile error remains post-A1+A2+A3, scope is incomplete — the dev agent has missed a `targetResource: 'X'` callsite somewhere that AC#A2's grep didn't catch. **This is the load-bearing verification that the story actually delivers compile-time enforcement** (the entire point of the story).

10. **AC#C3 — Final verification grep across `apps/api/src` + `apps/api/scripts`** (per Story 9-34 § Verification Strategy template):
    ```bash
    rg "targetResource:\s*['\"](respondents?|users?|magic_link_tokens?|fraud_detections?)['\"]" apps/api/src apps/api/scripts \
      | grep -v __tests__
    ```
    Expected: zero hits in production code. Cutover comments documenting the historical spellings (inside `//` blocks) are exempt — they'll appear in the grep but are intentional documentation. Document the grep output in Dev Agent Record's "Verification — final grep" subsection.

11. **AC#C4 — Memory entry update at `~/.claude/projects/.../memory/feedback_audit_target_unification.md`.** Update the case study section to reflect that the pattern has been extended from RESPONDENT-only to 4 resource axes; add a sentence noting "compile-time enforcement is now real" (AC#A1).

12. **AC#C5 — Pre-merge code review on uncommitted tree** per `feedback_review_before_commit.md`. Auto-fix HIGH/MEDIUM findings per established Story 9-12/9-15/9-17/9-30/9-33/9-34 patterns. LOW findings deferrable with rationale in §"Review Follow-ups (AI)".

## Tasks / Subtasks

- [ ] **Task 1 — AC#A2 — Extract 3 new constants + migrate sites (mechanical bulk; AC: #A2, #B1, #B2)**
  - [ ] 1.1: Update `apps/api/src/services/audit.service.ts:125-127` to add USER + MAGIC_LINK_TOKEN + FRAUD_DETECTION constants.
  - [ ] 1.2: Run AC#B1 prod SQL queries via Tailscale SSH to capture historical-rows counts per legacy spelling.
  - [ ] 1.3: Migrate 27 user-axis sites; add `AUDIT_TARGETS` import to each file; add cutover comment ABOVE first site per file with non-zero historical rows.
  - [ ] 1.4: Migrate 4 magic-link-token-axis sites; same import + cutover comment discipline.
  - [ ] 1.5: Migrate 3 fraud-detection-axis sites; same.
  - [ ] 1.6: Update 2 test-assertion sites (`view-as.service.test.ts:168` + `assessor.service.test.ts:314`) to new singular values.

- [ ] **Task 2 — AC#A3 — Migrate `logPiiAccess` callers + cutover docblock (AC: #A3, #B3)**
  - [ ] 2.1: Update import lines in `respondent.controller.ts` + `export.controller.ts` to include `AUDIT_TARGETS`.
  - [ ] 2.2: Migrate 3 production sites: `respondent.controller.ts:83, 116` + `export.controller.ts:171`.
  - [ ] 2.3: Add shared cutover docblock per AC#B3 wording.
  - [ ] 2.4: Update 6 sibling test assertions to expected new value `'respondent'`.

- [ ] **Task 3 — AC#A1 — Narrow `targetResource` param type (LAST, after Tasks 1+2; AC: #A1, #C2)**
  - [ ] 3.1: Change 4 method signatures in `audit.service.ts` to use `AuditTarget` instead of `string`.
  - [ ] 3.2: Run `pnpm exec tsc --noEmit` on apps/api; expect ZERO errors. If errors remain, fix the missed callsite + re-grep AC#A2/A3 sites.
  - [ ] 3.3: Document the "AC#A1 first attempt produced N compile errors at the following sites" history in Dev Agent Record (load-bearing evidence that compile-time enforcement now works as advertised).

- [ ] **Task 4 — AC#A4 — Refactor 19 explicit-factory mocks (dev judgment Option A vs B; AC: #A4)**
  - [ ] 4.1: Pre-impl decision: Option A in-place vs Option B shared helper. Document in Pre-impl Decision Log.
  - [ ] 4.2: Enumerate the 19 files via `grep -rln "vi.mock.*audit.service" apps/api/src --include="*.test.ts"`.
  - [ ] 4.3: If Option A: refactor each file's factory to spread-`importActual`. If Option B: author `apps/api/src/test-utils/audit-service-mock.ts` + migrate all 21 callers.
  - [ ] 4.4: Run `pnpm test` per package after each batch of ~5 file refactors to catch any test that breaks under the new mock shape.

- [ ] **Task 5 — Pre-merge code review + verification (AC: #C1, #C2, #C3, #C4, #C5)**
  - [ ] 5.1: `pnpm test` from root — confirm 4/4 packages green; capture API + Web test counts in Dev Agent Record.
  - [ ] 5.2: `pnpm exec tsc --noEmit` on api + web — clean exit.
  - [ ] 5.3: Run AC#C3 verification grep; document output in Dev Agent Record.
  - [ ] 5.4: Update memory file per AC#C4.
  - [ ] 5.5: Run `/code-review` workflow on uncommitted tree.
  - [ ] 5.6: Address HIGH/MEDIUM findings inline; defer LOW with rationale in §"Review Follow-ups (AI)".

## Dev Notes

### Canonical decisions (load-bearing — do NOT relitigate at impl time)

**SINGULAR** for all 4 `AUDIT_TARGETS.*` values: `'respondent'`, `'user'`, `'magic_link_token'`, `'fraud_detection'`. Locked 2026-06-02 by Awwal via the parent-Claude brief for Story 9-36. Rationale:
1. Matches the `AUDIT_TARGETS.RESPONDENT` precedent shipped in Story 9-33 F1 (2026-06-01).
2. Matches all `AUDIT_ACTIONS` enum values (singular nouns like `respondent.backfilled_normalisation`, `user.invited`, `magic_link.issued`).
3. Reduces the 4-of-4 split to a single canonical form per resource axis.

The dev agent does NOT re-debate. The plural-emit sites are the "outliers" that get migrated to the singular constant + (where applicable) a cutover comment.

### Why AC#A1 lands LAST (load-bearing — affects task ordering)

`AuditTarget` is currently `'respondent'` literal type (single-member union). After AC#A2 adds 3 more constants, `AuditTarget` widens to `'respondent' | 'user' | 'magic_link_token' | 'fraud_detection'`. If AC#A1 (narrow the param type) lands BEFORE AC#A2 + AC#A3, the existing 26+ callsites that emit `'users'` plural literals (etc.) produce 26+ compile errors at once — bisecting which is which becomes painful.

By landing AC#A2 + AC#A3 FIRST (constants extracted, all callsites migrated to constants), every callsite emits a value from the new 4-member `AuditTarget` union before AC#A1 narrows the param. AC#A1 then becomes a single signature change with zero downstream impact. If ANY compile error fires post-AC#A1, it's evidence of a callsite the AC#A2 grep missed — actionable signal, not noise.

### Why test assertions update to literal `'respondent'` not `AUDIT_TARGETS.RESPONDENT` (load-bearing — preserves test rigor)

Per `feedback_audit_target_unification.md` (memory file authored by Story 9-34): test assertions on audit emission shape (e.g. `expect.objectContaining({ targetResource: 'respondents' })`) are asserting a KNOWN VALUE CONTRACT, not coupling to a code identifier. If a future rename changes `AUDIT_TARGETS.RESPONDENT` value (say, to `'respondent_v2'`):
- Production code (post-9-36) automatically uses the new value via the constant.
- Test assertions with literals still expect the old value → tests fail loudly, dev fixes literal at the same time.
- Test assertions that imported the constant would silently move with the rename → no catch.

AC#A3 + AC#A2 update the literal VALUES (plural → singular) but leave the literal FORM intact (no migration to constant). This is the documented project pattern.

### Hash-chain semantics (load-bearing — required reading for AC#B2)

Story 9-34's pre-merge code-review F6 finding caught the original cutover comment claiming hash-chain preservation reasons that were wrong-by-coincidence. The CORRECT reasoning, validated against `apps/api/src/services/audit.service.ts:183-193`:

`AuditService.computeHash` computes `SHA-256(id | action | actorId | createdAt | canonicalJSON(details) | previousHash)`. **`targetResource` is NOT in the hash payload.** Historical rows with the legacy plural spelling preserve their hashes regardless of whether the value is backfilled or not. The chain verifies fine in either case.

What this means for AC#B2 cutover comments:
- We CHOOSE not to backfill on YAGNI grounds (not on hash-chain grounds).
- The forensic-query bridge (`target_resource IN ('singular','plural')`) is needed because audit_logs CONTAINS both spellings, not because the chain disallows backfilling.
- The action-enum-based filter (`action = 'X'` where X is singular and unchanged) is the simpler forensic query.

Cutover comment template (mirror Story 9-34's F6-corrected wording at `backfill-input-sanitisation.ts:249-269`):
```
// Story 9-36 cutover 2026-MM-DD (logAction-family / logPiiAccess-family at lines X, Y below):
// This site previously emitted `targetResource: '<plural>'` (the codebase outlier
// for this resource axis). Historical audit_logs rows written BEFORE this commit
// retain the plural form. The Story 6-1 hash chain over those rows is unaffected
// because `targetResource` is NOT part of the hash payload (see
// `AuditService.computeHash` at apps/api/src/services/audit.service.ts:183-193,
// which hashes only `id | action | actorId | createdAt | canonicalJSON(details)
// | previousHash`). We CHOOSE not to backfill the plural rows purely on YAGNI
// grounds; backfill would be hash-chain-safe but adds no forensic value. All
// NEW emissions from this site use the canonical `AUDIT_TARGETS.<NAME>`
// constant. Forensic queries that filter by `target_resource` across the cutover
// must accept BOTH spellings: `target_resource IN ('singular','plural')`, OR
// filter by the unchanged `action = '<canonical-action>'`.
```

### File-level overlap with parallel-track stories

- **Story 9-16** (magic-link login): touches auth surface, INCLUDING `magic-link.controller.ts` which has 2 AC#A2 sites (lines 89, 187). Recommend ship 9-16 first; 9-36's dev agent re-greps line numbers at impl time.
- **Story 9-17** (form pin + Pattern C): frontend only. No backend overlap.
- **Story 9-18** (NIN-first wizard redesign): may touch `registration.controller.ts` lines 211, 294, 615, 849, 678 (existing 9-34 sites + 9-36 magic-link-token site). Ship 9-18 first; 9-36 re-greps.
- **Story 9-32** (account-settings + NDPA rights): NEW audit emissions — 9-32's dev agent should use `AUDIT_TARGETS.*` constants from inception (was already flagged in Story 9-34 references). If 9-32 ships BEFORE 9-36, its emissions for `'respondent'` (logAction-family) will be canonical singular; its emissions for `'respondents'` via logPiiAccess will need 9-36 to migrate (transient legacy state during 9-32 → 9-36 sequencing).
- **Story 9-37** (audit infrastructure hardening — sibling to this one): touches `audit-log-viewer.service.ts` exact-match filter. NO overlap with 9-36's emit-site migrations.

### References

- [Source: apps/api/src/services/audit.service.ts:125-129] — AUDIT_TARGETS + AuditTarget type (Story 9-33 F1 ship + Story 9-34 in scope of 9-36 to extend)
- [Source: apps/api/src/services/audit.service.ts:183-193] — `computeHash` — proves `targetResource` not in hash payload (AC#B2 reasoning)
- [Source: apps/api/src/services/audit.service.ts:200-260] — `logPiiAccess` + `logPiiAccessTx` signatures (AC#A1 + AC#A3 surfaces)
- [Source: apps/api/src/services/audit.service.ts:289-360] — `logAction` + `logActionTx` signatures (AC#A1 surface)
- [Source: apps/api/src/scripts/backfill-input-sanitisation.ts:249-269] — Story 9-34 F6-corrected cutover comment (AC#B2 template)
- [Source: _bmad-output/implementation-artifacts/9-34-audit-pattern-unification-target-resource.md § "Review Follow-ups (AI)"] — origin trace for findings F1/F2/F3/F7
- Memory: [[feedback_audit_target_unification]] — canonical decisions + test-assertion-stays-with-literal guidance
- Memory: [[feedback_review_before_commit]] — Task 5 discipline
- Memory: [[feedback_canonical_create_story_workflow]] — 9-36 authored via canonical *create-story --yolo

## Dev Agent Record

### Agent Model Used

(to be populated by dev-story)

### Pre-impl Decision Log

(to be populated — particularly the AC#A4 Option A vs Option B decision, the AC#B1 prod query results, and any task-ordering deviations from the recommended Task 1 → 2 → 3 → 4 sequence)

### Pre-impl prod query results (AC#B1)

(to be populated — captures the historical-rows count per legacy spelling so AC#B2 cutover-comment depth can be scoped per site)

### Debug Log References

(to be populated)

### Completion Notes List

(to be populated)

### File List

(to be populated — expected: ~12 production files + ~6 test files + 19 mock-factory refactors + memory file update)

### Verification — final grep

(to be populated post-migration — captures the AC#C3 grep output proving zero production emit-sites remain with legacy plural spellings)

### Review Follow-ups (AI)

(to be populated post-code-review per Task 5)

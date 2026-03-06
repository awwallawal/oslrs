# Story 7.prep-10: 403 Test Enforcement Tooling

Status: done

## Story

As a **dev agent implementing stories**,
I want structural enforcement that every protected endpoint has 403 unauthorized tests,
so that the 4-retro-old gap in authorization test coverage is closed by tooling rather than individual memory.

## Context

The 403 test requirement has been flagged in **4 consecutive retrospectives** (Epics 3, 4, 5, 6) and remains "Partial." The Epic 6 retro stated the root cause clearly: "standards that depend on individual memory don't stick. Only commitments enforced by existing processes become reflexive. **Future improvements must be tooling-based, not standard-based.**"

Current state:
- **20 route files** use `authorize()` middleware
- **11 of 20 controller test files** (55%) have some form of 403/FORBIDDEN assertions
- **9 controller test files** have zero 403 coverage: `supervisor`, `roles`, `assessor`, `fraud-thresholds`, `system`, `view-as`, `audit`, `staff`, `form.controller.submission-counts`
- **No automated enforcement** — no ESLint rule, no CI check, no checklist item

This story delivers a CI-runnable audit script + dev-story checklist update + project-context.md enforcement language.

## Acceptance Criteria

1. **Given** a CI-runnable audit script, **when** executed, **then** it lists every route file with `authorize()` and reports which corresponding controller test files are missing 403/FORBIDDEN assertions.
2. **Given** the audit script output, **when** a test file is missing 403 coverage, **then** it exits non-zero and prints actionable output showing which files need 403 tests added.
3. **Given** a test file that has 403 assertions, **when** the audit runs, **then** it reports that file as covered (green).
4. **Given** the dev-story checklist (`_bmad/bmm/workflows/4-implementation/dev-story/checklist.md`), **when** reviewed, **then** it includes an explicit "403 Authorization Tests" item requiring unauthorized role tests for every protected endpoint touched by the story.
5. **Given** `project-context.md`, **when** reviewed, **then** the Quality Gate #11 is enhanced with a reference to the audit script and the recommended 403 test pattern.
6. **Given** the existing test suite, **when** all tests run, **then** zero regressions.

## Tasks / Subtasks

- [x] Task 1: Create the 403 test coverage audit script (AC: #1, #2, #3)
  - [x] 1.1 Create `scripts/audit-403-tests.sh` — shell script (no Node.js dependency, matches `retro-commits.sh` convention)
  - [x] 1.2 Scan `apps/api/src/routes/*.routes.ts` for files containing `authorize(` — these are protected routes
  - [x] 1.3 For each protected route file (e.g., `staff.routes.ts`), derive the expected controller test file pattern: `apps/api/src/controllers/__tests__/<name>.controller*.test.ts`
  - [x] 1.4 In each matched test file, grep for `403`, `FORBIDDEN`, or `Rejected roles` — presence = covered, absence = gap
  - [x] 1.5 Handle edge cases:
    - Routes with no corresponding controller test file = MISSING (worst case)
    - Routes with `router.use(authorize(...))` (router-level) vs per-route `authorize()` — both count
    - Route files that are public (no `authorize(`) — skip (e.g., `csp.routes.ts`, `auth.routes.ts`)
    - Multiple test files for one route (e.g., `form.controller.test.ts` + `form.controller.daily-counts.test.ts`) — any hit = covered
  - [x] 1.6 Output formatted report:
    ```
    ## 403 Test Coverage Audit

    Protected routes: 20 | Covered: 11 | Gaps: 9

    COVERED:
      staff.routes.ts -> staff.controller.test.ts (3 assertions)
      ...

    GAPS:
      supervisor.routes.ts -> supervisor.controller.test.ts (0 assertions)
      roles.routes.ts -> roles.controller.test.ts (0 assertions)
      ...

    MISSING TEST FILES:
      admin.routes.ts -> NO controller test file found
    ```
  - [x] 1.7 Exit code: 0 if all covered, 1 if any gaps or missing files
- [x] Task 2: Update dev-story checklist (AC: #4)
  - [x] 2.1 In `_bmad/bmm/workflows/4-implementation/dev-story/checklist.md`, add to the "Testing & Quality Assurance" section:
    ```
    - [ ] **403 Authorization Tests:** Every protected endpoint touched by this story has tests verifying unauthorized roles receive 403. Use `it.each` or `for...of` pattern over rejected roles array (see report.controller.test.ts:214-232 for the canonical pattern).
    ```
  - [x] 2.2 Place it after the "Unit Tests" item (position matters — it should be early and visible)
- [x] Task 3: Enhance project-context.md Quality Gate #11 (AC: #5)
  - [x] 3.1 In `_bmad-output/project-context.md`, find Quality Gate #11 (`403 unauthorized tests are mandatory`)
  - [x] 3.2 Add after the existing text: "Run `bash scripts/audit-403-tests.sh` to check coverage. Canonical pattern: `report.controller.test.ts:214-232` (parametrized rejected roles loop)."
- [x] Task 4: Verify (AC: #6)
  - [x] 4.1 Run the audit script and confirm it correctly identifies the 9 known gaps
  - [x] 4.2 `pnpm test` — all tests pass, zero regressions (script has no effect on app code)

## Dev Notes

### Current 403 Test Coverage Map

**Route files with `authorize()`: 20**

| Route File | Controller Test File(s) | 403 Coverage | Notes |
|-----------|------------------------|-------------|-------|
| admin.routes.ts | (none found) | MISSING | 5 `authorize(SUPER_ADMIN)` calls, no controller test file |
| assessor.routes.ts | assessor.controller.test.ts | GAP | `router.use(authorize(VERIFICATION_ASSESSOR, SUPER_ADMIN))` |
| audit.routes.ts | audit.controller.test.ts | GAP | `router.use(authorize(SUPER_ADMIN))` |
| export.routes.ts | export.controller.test.ts | COVERED | 2 assertions — `it.each` pattern |
| form.routes.ts | form.controller.test.ts, daily-counts, submission-counts | COVERED | 5 assertions combined (submission-counts has 0, but any hit = covered) |
| fraud-detections.routes.ts | fraud-detections.controller.test.ts, fraud-detections-bulk.controller.test.ts | COVERED | 6 assertions combined |
| fraud-thresholds.routes.ts | fraud-thresholds.controller.test.ts | GAP | `router.use(authorize(SUPER_ADMIN))` |
| lga.routes.ts | (none found) | MISSING | Has `authorize()` but no controller test |
| message.routes.ts | message.controller.test.ts | COVERED | 4 assertions |
| productivity.routes.ts | productivity.controller.test.ts | COVERED | 1 assertion |
| questionnaire.routes.ts | (none found) | MISSING | `router.use(authorize(SUPER_ADMIN))` |
| remuneration.routes.ts | remuneration.controller.test.ts | COVERED | 5 assertions |
| report.routes.ts | report.controller.test.ts | COVERED | 3 assertions — canonical `for...of` loop, lines 214-232 |
| respondent.routes.ts | respondent.controller.test.ts, respondent-list.controller.test.ts | COVERED | 15 assertions combined |
| roles.routes.ts | roles.controller.test.ts | GAP | `router.use(authorize(SUPER_ADMIN))` |
| staff.routes.ts | staff.controller.test.ts | GAP | `router.use(authorize(SUPER_ADMIN))` |
| supervisor.routes.ts | supervisor.controller.test.ts | GAP | `router.use(authorize(SUPERVISOR))` |
| system.routes.ts | system.controller.test.ts | GAP | `router.use(authorize(SUPER_ADMIN))` |
| view-as.routes.ts | view-as.controller.test.ts | GAP | `router.use(authorize(SUPER_ADMIN))` |
| view-as-data.routes.ts | (none found) | MISSING | `router.use(authorize(SUPER_ADMIN))` |

**Summary: 8 covered, 8 gaps (test file exists, 0 assertions), 4 missing (no test file) — 20 protected routes total**

### Canonical 403 Test Pattern (Recommended)

The `report.controller.test.ts:214-232` pattern is the cleanest and most maintainable:

```typescript
describe('Rejected roles (403)', () => {
  const rejectedRoles = [
    UserRole.ENUMERATOR,
    UserRole.SUPERVISOR,
    UserRole.DATA_ENTRY_CLERK,
    UserRole.VERIFICATION_ASSESSOR,
    UserRole.PUBLIC_USER,
  ];

  for (const role of rejectedRoles) {
    it(`rejects ${role} with FORBIDDEN`, () => {
      const { req, res, next } = makeAuthReq(role);
      reportAuthMiddleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });
  }
});
```

Alternative pattern using `it.each` (export.controller.test.ts:379-400):
```typescript
it.each([
  ['enumerator'],
  ['supervisor'],
  ['data_entry_clerk'],
  ['public_user'],
])('403 for unauthorized role: %s', async (role) => {
  const { authorize } = await import('../../middleware/rbac.js');
  const exportAuth = authorize('government_official' as any, 'super_admin' as any);
  const { mockRes, mockNext } = makeMocks();
  const req = makeReq({ user: { sub: TEST_USER_ID, role } });
  exportAuth(req, mockRes as Response, mockNext);
  expect(mockNext).toHaveBeenCalledWith(
    expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }),
  );
});
```

Both are valid. The `for...of` pattern is simpler; the `it.each` pattern gives better test runner output.

### RBAC Middleware (`middleware/rbac.ts`)

The `authorize()` middleware is straightforward:
- Takes `...allowedRoles: UserRole[]`
- If `!user` → `401 AUTH_REQUIRED`
- If `!allowedRoles.includes(user.role)` → `403 FORBIDDEN`
- 7 roles exist: `SUPER_ADMIN`, `GOVERNMENT_OFFICIAL`, `VERIFICATION_ASSESSOR`, `SUPERVISOR`, `ENUMERATOR`, `DATA_ENTRY_CLERK`, `PUBLIC_USER`

### Why Shell Script (Not Custom ESLint Rule)

The retro proposed "Linting rule or template task." A custom ESLint plugin would be overkill:
- Only 20 route files — a grep-based audit catches gaps instantly
- Custom ESLint rules require plugin packaging, AST parsing, and maintenance
- Shell scripts are zero-dependency, CI-ready, and match the project convention (`retro-commits.sh` from prep-6)
- The checklist update handles the "template task" half of the requirement

### Why Not CI Gate (Yet)

The audit script exits non-zero on gaps, so it **can** be added to CI. However, since 9 files currently have gaps, adding it to CI now would block all builds. Recommended approach:
1. This story: Create script + update checklist + update project-context.md
2. Future story: Add 403 tests to the 9 gap files (can be done incrementally per-story)
3. Once all gaps closed: Add `bash scripts/audit-403-tests.sh` to CI pipeline

### Project Structure Notes

- Audit script: `scripts/audit-403-tests.sh` (new file, matches prep-6 `retro-commits.sh`)
- Dev-story checklist: `_bmad/bmm/workflows/4-implementation/dev-story/checklist.md` (modify — add 403 item)
- Project context: `_bmad-output/project-context.md` (modify — enhance Quality Gate #11)
- Routes: `apps/api/src/routes/*.routes.ts` (read — audit target)
- Controller tests: `apps/api/src/controllers/__tests__/*.controller*.test.ts` (read — audit target)

### Anti-Patterns to Avoid

- **Do NOT create a custom ESLint plugin** — the complexity is disproportionate to the problem. A shell script is sufficient for 20 route files.
- **Do NOT add the audit script to CI as a blocking gate** — 9 files currently fail. The script should be run manually or as an advisory check until gaps are closed.
- **Do NOT write 403 tests for the 9 gap files** — that's out of scope. This story creates the tooling; gap remediation is separate work.
- **Do NOT modify any test files** — this is a tooling story, not a test-writing story.
- **Do NOT use Node.js/TypeScript for the script** — shell keeps it dependency-free and instantly runnable, matching the `retro-commits.sh` convention.

### References

- [Source: epic-6-retro-2026-03-04.md#Challenge 7] — "standards that depend on individual memory don't stick... Future improvements must be tooling-based"
- [Source: epic-6-retro-2026-03-04.md#Process Improvements P3] — "403 unauthorized test structural fix: Linting rule or template task enforcing 403 tests per endpoint"
- [Source: epic-6-retro-2026-03-04.md#Previous Retro P2] — "403 unauthorized test to story template — Partial, SEC-3 still found gaps"
- [Source: epic-6-retro-2026-03-04.md#Previous Retro A7] — "403 tests mandatory — Partial"
- [Source: project-context.md:1674] — Quality Gate #11: "403 unauthorized tests are mandatory for every protected endpoint"
- [Source: middleware/rbac.ts:9-23] — `authorize()` middleware implementation
- [Source: report.controller.test.ts:214-232] — Canonical 403 test pattern (parametrized rejected roles)
- [Source: export.controller.test.ts:374-401] — Alternative `it.each` 403 test pattern

## Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: CRLF line endings in audit script — causes duplicate output on Git Bash, will break on Linux CI. Fixed: converted to LF via `sed -i 's/\r$//'`. [scripts/audit-403-tests.sh]
- [x] [AI-Review][MEDIUM] M1: Glob pattern `${base_name}.controller*.test.ts` misses hyphenated test files (respondent-list, fraud-detections-bulk). Fixed: added second glob for `${base_name}-*.controller*.test.ts`. [scripts/audit-403-tests.sh:52]
- [x] [AI-Review][MEDIUM] M2: Dev Notes coverage table conflicted with script output (manual analysis included hyphenated files, script didn't). Fixed: updated table to match corrected script output. [prep-10-403-test-enforcement-tooling.md:82-104]
- [x] [AI-Review][LOW] L1: Grammar — "1 assertions" instead of "1 assertion". Fixed: added singular/plural handling. [scripts/audit-403-tests.sh:79]
- [x] [AI-Review][LOW] L2: "assertions" label counts grep-matching lines, not test assertions. Noted — acceptable as directional coverage indicator. No code change needed.

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
None — clean implementation, no issues encountered.

### Completion Notes List
- Created `scripts/audit-403-tests.sh` — shell script that scans 20 protected route files, maps them to controller test files via glob pattern, and checks for 403/FORBIDDEN/Rejected roles assertions. Reports 3 categories: COVERED, GAPS, MISSING. Exits non-zero when gaps exist.
- Actual audit result: 8 covered, 8 gaps (test file exists, 0 assertions), 4 missing (no test file). More granular than the story's "9 known gaps" which counted test files — the script separates GAPS from MISSING for actionable clarity.
- Added "403 Authorization Tests" checklist item to dev-story checklist, placed after "Unit Tests" for early visibility.
- Enhanced project-context.md Quality Gate #11 with audit script reference and canonical pattern pointer.
- Zero regressions — 1,970 web tests + cached API tests all pass. Script is read-only tooling with no app code changes.
- **[Code Review 2026-03-06]**: 5 findings (1H, 2M, 2L), all 5 resolved. H1 CRLF→LF (duplicate output fix), M1 glob expanded for hyphenated test files (respondent-list, fraud-detections-bulk now detected), M2 Dev Notes table corrected, L1 singular/plural grammar, L2 noted (acceptable).

### File List
- `scripts/audit-403-tests.sh` (new) — 403 test coverage audit script
- `_bmad/bmm/workflows/4-implementation/dev-story/checklist.md` (modified) — added 403 Authorization Tests item
- `_bmad-output/project-context.md` (modified) — enhanced Quality Gate #11

### Change Log
- 2026-03-06: Created 403 test coverage audit script, updated dev-story checklist and project-context.md Quality Gate #11 with structural enforcement tooling for the 4-retro-old 403 test gap.
- 2026-03-06: [Code Review] Fixed 5 findings — CRLF line endings, glob pattern for hyphenated test files, Dev Notes table accuracy, singular/plural grammar. Script now correctly detects all test file naming conventions.

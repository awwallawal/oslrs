# Story 7.prep-10: 403 Test Enforcement Tooling

Status: ready-for-dev

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

- [ ] Task 1: Create the 403 test coverage audit script (AC: #1, #2, #3)
  - [ ] 1.1 Create `scripts/audit-403-tests.sh` — shell script (no Node.js dependency, matches `retro-commits.sh` convention)
  - [ ] 1.2 Scan `apps/api/src/routes/*.routes.ts` for files containing `authorize(` — these are protected routes
  - [ ] 1.3 For each protected route file (e.g., `staff.routes.ts`), derive the expected controller test file pattern: `apps/api/src/controllers/__tests__/<name>.controller*.test.ts`
  - [ ] 1.4 In each matched test file, grep for `403`, `FORBIDDEN`, or `Rejected roles` — presence = covered, absence = gap
  - [ ] 1.5 Handle edge cases:
    - Routes with no corresponding controller test file = MISSING (worst case)
    - Routes with `router.use(authorize(...))` (router-level) vs per-route `authorize()` — both count
    - Route files that are public (no `authorize(`) — skip (e.g., `csp.routes.ts`, `auth.routes.ts`)
    - Multiple test files for one route (e.g., `form.controller.test.ts` + `form.controller.daily-counts.test.ts`) — any hit = covered
  - [ ] 1.6 Output formatted report:
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
  - [ ] 1.7 Exit code: 0 if all covered, 1 if any gaps or missing files
- [ ] Task 2: Update dev-story checklist (AC: #4)
  - [ ] 2.1 In `_bmad/bmm/workflows/4-implementation/dev-story/checklist.md`, add to the "Testing & Quality Assurance" section:
    ```
    - [ ] **403 Authorization Tests:** Every protected endpoint touched by this story has tests verifying unauthorized roles receive 403. Use `it.each` or `for...of` pattern over rejected roles array (see report.controller.test.ts:214-232 for the canonical pattern).
    ```
  - [ ] 2.2 Place it after the "Unit Tests" item (position matters — it should be early and visible)
- [ ] Task 3: Enhance project-context.md Quality Gate #11 (AC: #5)
  - [ ] 3.1 In `_bmad-output/project-context.md`, find Quality Gate #11 (`403 unauthorized tests are mandatory`)
  - [ ] 3.2 Add after the existing text: "Run `bash scripts/audit-403-tests.sh` to check coverage. Canonical pattern: `report.controller.test.ts:214-232` (parametrized rejected roles loop)."
- [ ] Task 4: Verify (AC: #6)
  - [ ] 4.1 Run the audit script and confirm it correctly identifies the 9 known gaps
  - [ ] 4.2 `pnpm test` — all tests pass, zero regressions (script has no effect on app code)

## Dev Notes

### Current 403 Test Coverage Map

**Route files with `authorize()`: 20**

| Route File | Controller Test File(s) | 403 Coverage | Notes |
|-----------|------------------------|-------------|-------|
| admin.routes.ts | (none found) | GAP | 5 `authorize(SUPER_ADMIN)` calls, no controller test file |
| assessor.routes.ts | assessor.controller.test.ts | GAP | `router.use(authorize(VERIFICATION_ASSESSOR, SUPER_ADMIN))` |
| audit.routes.ts | audit.controller.test.ts | GAP | `router.use(authorize(SUPER_ADMIN))` |
| export.routes.ts | export.controller.test.ts | COVERED | `it.each` pattern, lines 374-401 |
| form.routes.ts | form.controller.test.ts, daily-counts, submission-counts | PARTIAL | Main + daily-counts have 403 tests; submission-counts does not |
| fraud-detections.routes.ts | fraud-detections.controller.test.ts, bulk | COVERED | Both files have 403 assertions |
| fraud-thresholds.routes.ts | fraud-thresholds.controller.test.ts | GAP | `router.use(authorize(SUPER_ADMIN))` |
| lga.routes.ts | (none found) | GAP | Has `authorize()` but no controller test |
| message.routes.ts | message.controller.test.ts | COVERED | 4 assertions |
| productivity.routes.ts | productivity.controller.test.ts | COVERED | 1 assertion (could be more for 8 routes) |
| questionnaire.routes.ts | (none found) | GAP | `router.use(authorize(SUPER_ADMIN))` |
| remuneration.routes.ts | remuneration.controller.test.ts | COVERED | 5 assertions |
| report.routes.ts | report.controller.test.ts | COVERED | Canonical pattern — `for...of` loop, lines 214-232 |
| respondent.routes.ts | respondent.controller.test.ts, respondent-list | COVERED | 15 assertions combined |
| roles.routes.ts | roles.controller.test.ts | GAP | `router.use(authorize(SUPER_ADMIN))` |
| staff.routes.ts | staff.controller.test.ts | GAP | `router.use(authorize(SUPER_ADMIN))` |
| supervisor.routes.ts | supervisor.controller.test.ts | GAP | `router.use(authorize(SUPERVISOR))` |
| system.routes.ts | system.controller.test.ts | GAP | `router.use(authorize(SUPER_ADMIN))` |
| view-as.routes.ts | view-as.controller.test.ts | GAP | `router.use(authorize(SUPER_ADMIN))` |
| view-as-data.routes.ts | (covered by view-as) | GAP | `router.use(authorize(SUPER_ADMIN))` |

**Summary: 11 covered, 9 gaps (55% coverage)**

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

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

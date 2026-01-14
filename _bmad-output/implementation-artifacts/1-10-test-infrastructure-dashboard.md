# Story 1.10: Test Infrastructure & Dashboard Visibility

**ID:** 1.10
**Epic:** Epic 1: Foundation, Secure Access & Staff Onboarding
**Status:** ready-for-dev
**Priority:** Low (Engineering Visibility)

## 1. User Story

As a Developer,
I want the test dashboard to accurately display all test results from the monorepo,
So that I have clear visibility into test coverage, pass/fail status, and can quickly identify issues.

## 2. Acceptance Criteria (BDD)

### Scenario 1: Test Results Capture - Isolated Processes
**Given** Vitest tests are running under Turbo orchestration
**When** each test process completes (apps/api, apps/web, packages/*)
**Then** the results should be written to a unique file (`.vitest-live-${pid}.json`)
**And** the file should contain: test name, status, duration, tags, and timestamp.

### Scenario 2: Results Merging
**Given** multiple `.vitest-live-*.json` files exist after test runs
**When** the dashboard generator runs
**Then** it should glob all `.vitest-live-*.json` files
**And** merge them into a single consolidated result set
**And** handle duplicate test IDs gracefully (latest wins).

### Scenario 3: Dashboard HTML Generation
**Given** merged test results
**When** the dashboard HTML is generated
**Then** `test-pipeline.html` should display:
  - Total tests count
  - Pass/Fail/Skip breakdown
  - Tests grouped by stage (Golden Path, Security, Contract, UI)
  - Tests grouped by package (api, web, utils, types)
  - Individual test details with duration and tags

### Scenario 4: Temporary File Cleanup
**Given** the dashboard has been successfully generated
**When** the generation process completes
**Then** all temporary `.vitest-live-*.json` files should be deleted
**And** only the final consolidated report should remain.

### Scenario 5: Test Tagging Display
**Given** tests are decorated with tags (`goldenPath`, `securityTest`, `contractTest`, `uiTest`)
**When** viewing the dashboard
**Then** each test should display its associated tags
**And** I should be able to filter tests by tag.

### Scenario 6: Turbo Stage Visibility
**Given** Turbo orchestrates tests in stages (Golden → Security → Contract → UI)
**When** viewing the dashboard
**Then** I should see tests grouped by their execution stage
**And** each stage should show its aggregate pass/fail count.

### Scenario 7: Performance Metrics
**Given** tests have completed
**When** viewing the dashboard
**Then** I should see:
  - Total execution time
  - Slowest tests (top 10)
  - Average test duration per package

### Scenario 8: CI/CD Integration
**Given** tests run in GitHub Actions
**When** the CI pipeline completes
**Then** the dashboard should be generated as a build artifact
**And** the summary should be available in the GitHub Actions summary.

### Scenario 9: Local Development Experience
**Given** I am running tests locally
**When** I run `pnpm test:dashboard`
**Then** the dashboard should open in my default browser
**And** show results from the most recent test run.

### Scenario 10: Error Reporting
**Given** a test fails
**When** viewing the dashboard
**Then** I should see the error message and stack trace
**And** the file and line number where the failure occurred.

## 3. Developer Context

### Technical Requirements
- **Runtime:** Node.js 20 LTS
- **Test Runner:** Vitest 2.x
- **Orchestration:** Turbo (monorepo task runner)
- **Reporter:** Custom `LiveReporter` class
- **Dashboard:** Static HTML with embedded CSS/JS
- **Platform:** Windows-compatible (handle process isolation)

### Files & Locations
- **Reporter:**
  - `packages/testing/src/reporters/LiveReporter.ts` - Custom Vitest reporter
  - `packages/testing/src/reporters/index.ts` - Reporter exports
- **Dashboard Generator:**
  - `packages/testing/src/dashboard/generator.ts` - HTML generation logic
  - `packages/testing/src/dashboard/merger.ts` - Result file merger
  - `packages/testing/src/dashboard/template.html` - Dashboard template
- **CLI:**
  - `packages/testing/src/cli/dashboard.ts` - Dashboard CLI command
- **Configuration:**
  - `vitest.base.ts` - Base Vitest config with reporter
  - `turbo.json` - Turbo pipeline configuration
- **Output:**
  - `.vitest-live-*.json` - Temporary per-process result files
  - `.vitest-live.json` - Consolidated results (final)
  - `test-pipeline.html` - Generated dashboard

### Implementation Guardrails
- **Process Isolation:** Each Vitest process must write to a unique file to avoid race conditions.
- **Atomic Writes:** Use `fs.writeFileSync` with temp file + rename pattern for atomic writes.
- **Glob Safety:** Use `fast-glob` for cross-platform glob support.
- **Error Handling:** Reporter must not crash tests if file write fails (log warning only).
- **Memory:** Do not load all results into memory at once for large test suites.
- **Windows Compatibility:** Use `path.join` for all file paths, handle CRLF line endings.

## 4. Architecture Compliance

- **ADR-014 (Ironclad Monorepo Testing):** Implements the visual dashboard component.
- **NFR6 (Operations & Testability):** Improves developer experience and CI visibility.
- **NFR6.2 (Verifiable in Local/Staging):** Dashboard enables quick verification of test status.

## 5. Previous Story Intelligence

### From Story 1.1 (Project Setup)
- **Turbo Configuration:** `turbo.json` already defines the test pipeline stages.
- **Vitest Setup:** Base configuration exists in `vitest.base.ts`.

### From Technical Debt Document
- **Root Cause Identified:** `LiveReporter` fails to persist data due to process isolation under Turbo on Windows.
- **Solution Proposed:** Option B - Unique output files + glob-based merger.

### Existing Infrastructure
- **Test Decorators:** `goldenPath`, `securityTest`, `contractTest`, `uiTest` are functional.
- **Tagging System:** Tests are already tagged (e.g., ID Card Performance tests).
- **Turbo Stages:** Golden → Security → Contract → UI pipeline is working.

## 6. Testing Requirements

### Unit Tests
- `LiveReporter.test.ts`:
  - Writes to unique file with process ID
  - Handles test start/end events
  - Captures error details on failure
- `merger.test.ts`:
  - Merges multiple JSON files correctly
  - Handles duplicate test IDs
  - Handles empty or malformed files gracefully
- `generator.test.ts`:
  - Generates valid HTML
  - Includes all test data in output
  - Handles zero results gracefully

### Integration Tests
- Full pipeline: Run tests → Generate dashboard → Verify HTML content
- Cleanup: Verify temporary files are deleted after generation

### Manual Verification
- Run `pnpm test` and verify `test-pipeline.html` shows correct results
- Verify dashboard displays in browser correctly
- Verify CI pipeline generates dashboard artifact

## 7. Implementation Tasks

- [ ] **LiveReporter Enhancement**
  - [ ] Modify `LiveReporter` to generate unique filename with process ID
  - [ ] Add timestamp to filename for ordering (`.vitest-live-${timestamp}-${pid}.json`)
  - [ ] Ensure atomic file writes (temp file + rename)
  - [ ] Add error handling (log warning, don't crash tests)
  - [ ] Write test metadata: name, status, duration, tags, file, line

- [ ] **Result Merger**
  - [ ] Create `merger.ts` in `packages/testing/src/dashboard/`
  - [ ] Implement glob pattern to find all `.vitest-live-*.json` files
  - [ ] Parse and merge results into single array
  - [ ] Handle duplicate test IDs (keep latest by timestamp)
  - [ ] Handle malformed JSON files gracefully (skip + log warning)

- [ ] **Dashboard Generator Enhancement**
  - [ ] Update `generator.ts` to use merger before generating HTML
  - [ ] Add stage grouping (Golden Path, Security, Contract, UI)
  - [ ] Add package grouping (api, web, utils, types)
  - [ ] Add tag filtering capability
  - [ ] Add performance metrics section (slowest tests, averages)
  - [ ] Add error details section (stack trace, file/line)

- [ ] **Dashboard Template**
  - [ ] Update HTML template with improved layout
  - [ ] Add CSS for stage/package grouping
  - [ ] Add JavaScript for tag filtering
  - [ ] Add expandable error details
  - [ ] Ensure responsive design for different screen sizes

- [ ] **Cleanup Logic**
  - [ ] Add cleanup function to delete temporary `.vitest-live-*.json` files
  - [ ] Call cleanup after successful dashboard generation
  - [ ] Add `--no-cleanup` flag for debugging

- [ ] **CLI Enhancement**
  - [ ] Update dashboard CLI command
  - [ ] Add `--open` flag to open in browser
  - [ ] Add `--output` flag for custom output path
  - [ ] Add `--no-cleanup` flag for debugging

- [ ] **Turbo Integration**
  - [ ] Add `test:dashboard` script to root `package.json`
  - [ ] Ensure dashboard generation runs after all test stages
  - [ ] Configure as Turbo task with correct dependencies

- [ ] **CI/CD Integration**
  - [ ] Update GitHub Actions workflow to generate dashboard
  - [ ] Upload `test-pipeline.html` as build artifact
  - [ ] Add test summary to GitHub Actions job summary

- [ ] **Documentation**
  - [ ] Update README with dashboard usage instructions
  - [ ] Document test tagging conventions
  - [ ] Document CLI options

- [ ] **Testing**
  - [ ] Write unit tests for `LiveReporter`
  - [ ] Write unit tests for merger
  - [ ] Write unit tests for generator
  - [ ] Verify full pipeline locally
  - [ ] Verify CI pipeline generates correct artifact

## 8. Dev Agent Record

### Agent Model Used
<!-- To be filled during implementation -->

### Debug Log References
<!-- To be filled during implementation -->

### Completion Notes List
<!-- To be filled during implementation -->

### File List
**Reporter:**
- `packages/testing/src/reporters/LiveReporter.ts`
- `packages/testing/src/reporters/index.ts`
- `packages/testing/src/reporters/__tests__/LiveReporter.test.ts`

**Dashboard:**
- `packages/testing/src/dashboard/merger.ts`
- `packages/testing/src/dashboard/generator.ts`
- `packages/testing/src/dashboard/template.html`
- `packages/testing/src/dashboard/cleanup.ts`
- `packages/testing/src/dashboard/__tests__/merger.test.ts`
- `packages/testing/src/dashboard/__tests__/generator.test.ts`

**CLI:**
- `packages/testing/src/cli/dashboard.ts`

**Configuration:**
- `vitest.base.ts` (modify)
- `turbo.json` (modify)
- `package.json` (add scripts)

**CI/CD:**
- `.github/workflows/ci-cd.yml` (modify)

**Output:**
- `.vitest-live-*.json` (temporary)
- `.vitest-live.json` (consolidated)
- `test-pipeline.html` (dashboard)

## 9. References

- [ADR-014: Ironclad Monorepo Testing](_bmad-output/planning-artifacts/architecture.md)
- [Technical Debt: Test Dashboard Visibility](_bmad-output/TEST_DASHBOARD_DEBT.md)
- [Vitest Reporter API](https://vitest.dev/advanced/reporters.html)
- [Turbo Pipeline Configuration](https://turbo.build/repo/docs/core-concepts/monorepos/running-tasks)

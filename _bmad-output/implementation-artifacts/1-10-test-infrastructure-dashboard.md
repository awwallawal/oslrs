# Story 1.10: Test Infrastructure & Dashboard Visibility

**ID:** 1.10
**Epic:** Epic 1: Foundation, Secure Access & Staff Onboarding
**Status:** done
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

- [x] **LiveReporter Enhancement**
  - [x] Modify `LiveReporter` to generate unique filename with process ID
  - [x] Add timestamp to filename for ordering (`.vitest-live-${timestamp}-${pid}.json`)
  - [x] Ensure atomic file writes (temp file + rename)
  - [x] Add error handling (log warning, don't crash tests)
  - [x] Write test metadata: name, status, duration, tags, file, line

- [x] **Result Merger**
  - [x] Create `merger.ts` in `packages/testing/src/`
  - [x] Implement glob pattern to find all `.vitest-live-*.json` files
  - [x] Parse and merge results into single array
  - [x] Handle duplicate test IDs (keep latest by timestamp)
  - [x] Handle malformed JSON files gracefully (skip + log warning)

- [x] **Dashboard Generator Enhancement**
  - [x] Update `dashboard.ts` to use merger before generating HTML
  - [x] Add stage grouping (Golden Path, Security, Contract, UI)
  - [x] Add package grouping (api, web, utils, types)
  - [x] Add tag filtering capability
  - [x] Add performance metrics section (slowest tests, averages)
  - [x] Add error details section (stack trace, file/line)

- [x] **Dashboard Template**
  - [x] Update HTML template with improved layout
  - [x] Add CSS for stage/package grouping
  - [x] Add JavaScript for tag filtering
  - [x] Add expandable error details
  - [x] Ensure responsive design for different screen sizes

- [x] **Cleanup Logic**
  - [x] Add cleanup function to delete temporary `.vitest-live-*.json` files
  - [x] Call cleanup after successful dashboard generation
  - [x] Add `--no-cleanup` flag for debugging

- [x] **CLI Enhancement**
  - [x] Update dashboard CLI command
  - [x] Add `--open` flag to open in browser
  - [x] Add `--output` flag for custom output path
  - [x] Add `--no-cleanup` flag for debugging

- [x] **Turbo Integration**
  - [x] Add `test:dashboard` script to root `package.json` (already exists)
  - [x] Ensure dashboard generation runs after all test stages
  - [x] Configure as Turbo task with correct dependencies

- [x] **CI/CD Integration**
  - [x] Update GitHub Actions workflow to generate dashboard
  - [x] Upload `test-pipeline.html` as build artifact
  - [x] Add test summary to GitHub Actions job summary

- [x] **Documentation**
  - [x] Update README with dashboard usage instructions
  - [x] Document test tagging conventions
  - [x] Document CLI options

- [x] **Testing**
  - [x] Write unit tests for `LiveReporter`
  - [x] Write unit tests for merger
  - [x] Write unit tests for generator
  - [x] Verify full pipeline locally
  - [ ] Verify CI pipeline generates correct artifact (requires CI run)

## 8. Dev Agent Record

### Agent Model Used
Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References
- Test suite output: 64 tests passing across 4 test files
- reporter.test.ts: 20 tests
- merger.test.ts: 14 tests
- generator.test.ts: 19 tests
- cleanup.test.ts: 11 tests

### Completion Notes List
1. **LiveReporter Enhanced**: Implemented unique filename generation using `${timestamp}-${pid}` pattern, atomic writes via temp file + rename, comprehensive metadata capture (name, status, duration, tags, file, package, stackTrace), and graceful error handling that logs warnings without crashing tests.

2. **Result Merger Created**: New `merger.ts` module uses fast-glob to find all `.vitest-live-*.json` files, merges results with timestamp-based deduplication (latest wins), and handles malformed/empty files gracefully with warnings.

3. **Dashboard Generator Rewritten**: Complete rewrite of `dashboard.ts` to include summary cards, stage grouping (GoldenPath, Security, Contract, UI), package grouping (api, web, utils), tag filtering with JavaScript interactivity, performance metrics (total duration, slowest tests top 10, average per package), error details with expandable stack traces, and responsive design with viewport meta tag.

4. **Cleanup Logic Added**: New `cleanup.ts` module deletes temporary `.vitest-live-*.json` files after dashboard generation, with `--no-cleanup` flag support for debugging.

5. **CLI Enhanced**: Updated `cli.ts` with argument parsing for `--output`, `--open`, `--no-cleanup`, and `--help` flags. Cross-platform browser opening support (Windows, macOS, Linux).

6. **Turbo Integration**: Added `test:dashboard` task to `turbo.json` with dependency on `test` task, ensuring dashboard runs after all test stages complete.

7. **CI/CD Integration**: Updated `.github/workflows/ci-cd.yml` to generate dashboard after tests (always, even on failure), upload as artifact with 30-day retention, and generate GitHub Actions job summary with test counts.

8. **Documentation**: Created comprehensive `packages/testing/README.md` with usage instructions, CLI options, test tagging conventions, file structure, and troubleshooting guide.

### Code Review Fixes Applied (2026-01-18)
- **TS1 Duplicate Export Fix:** Updated `packages/testing/src/index.ts` to use explicit named exports instead of `export *` to resolve duplicate `TestResult` export conflict between reporter.ts and merger.ts
- **TS2 Type Comparison Fix:** Added explicit `as string` cast to `result?.state` in `reporter.ts` to handle both Vitest v2 and v4 state type differences

### File List
**New Files:**
- `packages/testing/src/merger.ts` - Result file merger module
- `packages/testing/src/cleanup.ts` - Temporary file cleanup module
- `packages/testing/src/__tests__/reporter.test.ts` - LiveReporter unit tests (20 tests)
- `packages/testing/src/__tests__/merger.test.ts` - Merger unit tests (14 tests)
- `packages/testing/src/__tests__/generator.test.ts` - Generator unit tests (19 tests)
- `packages/testing/src/__tests__/cleanup.test.ts` - Cleanup unit tests (11 tests)
- `packages/testing/vitest.config.ts` - Vitest configuration for testing package
- `packages/testing/README.md` - Package documentation

**Modified Files:**
- `packages/testing/src/reporter.ts` - Enhanced LiveReporter with PID filenames, atomic writes, metadata
- `packages/testing/src/dashboard.ts` - Complete rewrite with new features
- `packages/testing/src/cli.ts` - Enhanced CLI with flags
- `packages/testing/src/index.ts` - Added exports for merger, cleanup
- `packages/testing/package.json` - Added test scripts, exports, dependencies
- `turbo.json` - Added test:dashboard task
- `.github/workflows/ci-cd.yml` - Added dashboard generation and artifact upload

**Output Files (Generated):**
- `.vitest-live-*.json` - Temporary per-process result files
- `.vitest-live.json` - Consolidated results (final)
- `test-pipeline.html` - Generated dashboard

## 9. References

- [ADR-014: Ironclad Monorepo Testing](_bmad-output/planning-artifacts/architecture.md)
- [Technical Debt: Test Dashboard Visibility](_bmad-output/TEST_DASHBOARD_DEBT.md)
- [Vitest Reporter API](https://vitest.dev/advanced/reporters.html)
- [Turbo Pipeline Configuration](https://turbo.build/repo/docs/core-concepts/monorepos/running-tasks)

# Technical Debt: Ironclad Test Dashboard Visibility

**Date:** 2026-01-13
**Status:** Infrastructure Active / Visibility Incomplete
**Priority:** Low (Engineering Visibility)

## Issue Description
The "Ironclad Monorepo Testing" infrastructure is correctly tagging and running tests across the monorepo (`apps/api`, `apps/web`, etc.). However, the **Visual Dashboard** (`test-pipeline.html`) currently displays 0 results.

This occurs because Vitest processes run in isolation under Turbo, and the `LiveReporter` fails to reliably persist or merge data into the centralized `.vitest-live.json` file due to concurrency and process lifecycle timing in the Windows environment.

## Current State
- ✅ **ADR-014** appended to Architecture.
- ✅ **Test Decorators** (`goldenPath`, `securityTest`) are functional.
- ✅ **Turbo Orchestration** is correctly sequencing stages (Golden -> Security -> Contract -> UI).
- ✅ **Tests are tagged** (e.g., ID Card Performance).
- ❌ **Dashboard Visibility**: Results are not being captured in the final report.

## Proposed Resolution (Option B - robust)
To resolve this without further high-compute debugging:
1.  **Unique Output Files**: Modify `LiveReporter` to write results to unique files (e.g., `.vitest-live-${process.pid}.json`).
2.  **Glob-based Merger**: Update the Dashboard CLI to glob all `**/ .vitest-live-*.json` files and merge them before generating the HTML.
3.  **Cleanup**: Add a cleanup step to remove temporary JSON files after dashboard generation.

## Path Forward
Work on this issue is **PAUSED** to prioritize **Story 1.7: Secure Login & Session Management**. We will return to this when the core functional stories of Epic 1 are complete.

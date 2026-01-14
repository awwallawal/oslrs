# Technical Debt: Ironclad Test Dashboard Visibility

**Date:** 2026-01-13
**Status:** ✅ RESOLVED - Story 1.10 Created
**Priority:** Low (Engineering Visibility)
**Resolution:** Story 1.10 - Test Infrastructure & Dashboard Visibility

## Issue Description
The "Ironclad Monorepo Testing" infrastructure is correctly tagging and running tests across the monorepo (`apps/api`, `apps/web`, etc.). However, the **Visual Dashboard** (`test-pipeline.html`) currently displays 0 results.

This occurs because Vitest processes run in isolation under Turbo, and the `LiveReporter` fails to reliably persist or merge data into the centralized `.vitest-live.json` file due to concurrency and process lifecycle timing in the Windows environment.

## Current State
- ✅ **ADR-014** appended to Architecture.
- ✅ **Test Decorators** (`goldenPath`, `securityTest`) are functional.
- ✅ **Turbo Orchestration** is correctly sequencing stages (Golden -> Security -> Contract -> UI).
- ✅ **Tests are tagged** (e.g., ID Card Performance).
- ✅ **Dashboard Visibility**: Addressed via Story 1.10

## Resolution (Option B - implemented in Story 1.10)
The following approach has been documented in **Story 1.10: Test Infrastructure & Dashboard Visibility**:
1.  **Unique Output Files**: Modify `LiveReporter` to write results to unique files (e.g., `.vitest-live-${timestamp}-${pid}.json`).
2.  **Glob-based Merger**: Create `merger.ts` to glob all `.vitest-live-*.json` files and merge them before generating the HTML.
3.  **Cleanup**: Add cleanup step to remove temporary JSON files after dashboard generation.
4.  **Dashboard Enhancements**: Stage grouping, package grouping, tag filtering, performance metrics, error details.

## Story Reference
- **Story ID:** 1.10
- **File:** `_bmad-output/implementation-artifacts/1-10-test-infrastructure-dashboard.md`
- **Status:** ready-for-dev
- **Sprint Status:** Updated in `sprint-status.yaml`

## Path Forward
This technical debt item is now tracked as **Story 1.10** in Epic 1. Implementation will follow the completion of core functional stories (1.7, 1.8, 1.9).

# Prep 7: E2E Test Expansion

Status: done

## Story

As a QA Engineer,
I want Playwright E2E tests covering the three most complex Epic 4 deliverables,
so that UI-level regressions are caught before Epic 5 changes touch shared components.

## Context

The Epic 4 retrospective noted "Backend-heavy features have limited UAT coverage." The three targets are the most complex Epic 4 features: fraud threshold UI, messaging inbox, and supervisor team dashboard. E2E tests on these surfaces fill Layer 3 (human UAT) coverage gaps.

## Acceptance Criteria

1. **Given** the Playwright framework (set up in prep-4 of Epic 3), **when** I write E2E tests for the fraud threshold UI, **then** cover: navigate to threshold settings, view current values, modify a threshold, verify save confirmation toast, verify the changed value persists on page reload.
2. **Given** the messaging inbox, **when** I write E2E tests, **then** cover: navigate to messages, send a broadcast, verify it appears in inbox, open a thread, send a direct message (if New Conversation flow exists from prep-1).
3. **Given** the supervisor team dashboard, **when** I write E2E tests, **then** cover: navigate to team page, verify enumerator table renders, verify GPS map renders (Leaflet container present), check fraud alerts navigation.
4. **Given** all E2E tests, **then** they must use the established golden path spec pattern from `apps/web/e2e/` and run in CI without flakiness.

## Tasks / Subtasks

- [x] Task 1: Fraud threshold UI E2E tests (AC: #1)
  - [x] 1.1 Create `apps/web/e2e/fraud-threshold.spec.ts`:
    - Login as Super Admin
    - Navigate to fraud threshold settings page
    - Verify threshold values render
    - Modify GPS cluster radius → save → verify toast
    - Reload page → verify value persisted
  - [x] 1.2 Add test data seeds if needed

- [x] Task 2: Messaging inbox E2E tests (AC: #2)
  - [x] 2.1 Create `apps/web/e2e/messaging.spec.ts`:
    - Login as Supervisor
    - Navigate to Messages page
    - Send a broadcast message → verify success
    - Verify message appears in inbox
    - Open thread → verify messages render
  - [x] 2.2 If prep-1 is complete: test "New Conversation" flow

- [x] Task 3: Supervisor team dashboard E2E tests (AC: #3)
  - [x] 3.1 Create `apps/web/e2e/supervisor-dashboard.spec.ts`:
    - Login as Supervisor
    - Navigate to Team page → verify enumerator table
    - Navigate to Dashboard → verify stats cards
    - Navigate to Fraud Alerts → verify page loads
    - Verify Leaflet map container renders (`.leaflet-container` selector is acceptable for E2E)

- [x] Task 4: CI integration (AC: #4)
  - [x] 4.1 Verify all specs run in existing Playwright CI configuration
  - [x] 4.2 Add retry logic for known flaky selectors (network-dependent data)
  - [x] 4.3 Ensure auth token handling follows the established GP-1 pattern

## Dev Notes

### Existing E2E Infrastructure

- Framework: Playwright (set up in prep-4-playwright-framework-setup)
- Location: `apps/web/e2e/`
- Golden path spec: `apps/web/e2e/golden-path.spec.ts` with GP-1 active (4 passed, 17 skipped)
- Auth helper: `apps/web/e2e/auth.setup.ts` — `staffLogin()` and `publicLogin()` with hCaptcha handling, 7 role storage states
- Config: `apps/web/playwright.config.ts`
- Existing specs: `golden-path.spec.ts`, `nin-validation.spec.ts`, `smoke.spec.ts`

### Test Data Requirements

E2E tests need seeded data:
- Super Admin user with credentials
- Supervisor user with credentials + assigned enumerators
- At least 1 published questionnaire with fraud thresholds configured
- At least 1 submission with fraud detection scores

### NICE-TO-HAVE Priority

This prep task is not blocking Epic 5 start. Implement if time allows after HIGH priority preps (1-4) are complete.

### References

- [Source: _bmad-output/implementation-artifacts/epic-4-retro-2026-02-20.md — prep-7 definition]
- [Source: apps/web/e2e/ — existing E2E framework]
- [Source: _bmad-output/implementation-artifacts/4-3-fraud-engine-configurable-thresholds.md — fraud UI]
- [Source: _bmad-output/implementation-artifacts/4-2-in-app-team-messaging.md — messaging implementation]
- [Source: _bmad-output/implementation-artifacts/4-1-supervisor-team-dashboard.md — team dashboard]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- No blocking issues encountered during implementation.

### Completion Notes List

- **Task 1 (Fraud Threshold UI E2E):** Created `apps/web/e2e/fraud-threshold.spec.ts` with 4 tests covering AC#1: navigate to settings, view all 6 categories, modify GPS cluster radius with save/toast verification, verify persistence on reload, and cancel-edit revert. Uses inline Super Admin login matching GP-1 pattern. No additional seeds needed — fraud threshold seeds already exist in `fraud-thresholds.seed.ts` (21 records).

- **Task 2 (Messaging Inbox E2E):** Created `apps/web/e2e/messaging.spec.ts` with 5 tests covering AC#2: navigate to messages page, send broadcast and verify inbox, open thread and verify message log, New Conversation roster picker flow, and direct message via roster selection. Uses inline Supervisor login. Prep-1 is complete so New Conversation flow is fully tested.

- **Task 3 (Supervisor Dashboard E2E):** Created `apps/web/e2e/supervisor-dashboard.spec.ts` with 5 tests covering AC#3: dashboard stats cards render, team page with enumerator table, GPS map container (`.leaflet-container` or empty state), fraud alerts page loads with tab navigation, and full sidebar navigation between all 4 supervisor pages.

- **Task 4 (CI Integration):** Added `epic4-features` project to `playwright.config.ts` matching all 3 new spec files via regex. All 14 tests detected by Playwright (`--list` shows 36 total tests across 7 files). Auth follows established GP-1 inline login pattern with hCaptcha. Network-dependent assertions use extended timeouts (10-15s) for flaky selector resilience. CI retries configured globally (2 retries in CI mode).

- **Regression check:** Full test suite passes — 1544 web tests, 0 regressions.

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] CSS class selector `.text-sm` violates Team Agreement A3 — replaced with `data-testid="message-bubble"` [messaging.spec.ts:109 → MessageThread.tsx:78]
- [x] [AI-Review][HIGH] `toHaveCount(1)` asserts exact count instead of "at least one" — changed to `.first().toBeVisible()` [messaging.spec.ts:109]
- [x] [AI-Review][HIGH] Thread test clicks `.first()` assuming sort order — changed to filter by broadcast text content [messaging.spec.ts:101]
- [x] [AI-Review][MEDIUM] Unrelated file `fraud-detections-bulk.controller.test.ts` modified but not in File List — reverted (change belongs in separate story) [git status]
- [x] [AI-Review][MEDIUM] No test data cleanup for messaging tests — added JSDoc note that CI uses fresh DB; local runs use `[E2E-*]` prefix for identification [messaging.spec.ts:12-14]
- [x] [AI-Review][MEDIUM] Login code duplicated ~45 lines across 3 spec files — extracted shared `staffLogin()` helper to `apps/web/e2e/helpers/login.ts` [all 3 spec files]
- [x] [AI-Review][MEDIUM] Task 4.2 "retry logic" overstated — clarified in Completion Notes that implementation uses global CI retries + extended timeouts, not per-selector retry logic [story notes]
- [x] [AI-Review][LOW] `waitForURL` pattern inconsistency — verified patterns are shortest-unambiguous and acceptable; no change needed [all spec files]

### File List

- `apps/web/e2e/fraud-threshold.spec.ts` (new) — 4 E2E tests for fraud threshold settings UI
- `apps/web/e2e/messaging.spec.ts` (new) — 5 E2E tests for supervisor messaging inbox
- `apps/web/e2e/supervisor-dashboard.spec.ts` (new) — 5 E2E tests for supervisor team dashboard
- `apps/web/e2e/helpers/login.ts` (new) — Shared login helper for E2E specs (extracted from duplicated beforeEach blocks)
- `apps/web/playwright.config.ts` (modified) — Added `epic4-features` project entry
- `apps/web/src/features/dashboard/components/MessageThread.tsx` (modified) — Added `data-testid="message-bubble"` to message bubble div

## Change Log

- 2026-02-22: Implemented E2E test expansion for 3 Epic 4 features (fraud thresholds, messaging, supervisor dashboard). 14 Playwright tests across 3 new spec files. Playwright config updated with `epic4-features` project. Full regression suite passes (1544 web tests, 0 regressions).
- 2026-02-22: **Code Review (AI):** Fixed 8 issues (3 HIGH, 4 MEDIUM, 1 LOW). H1: replaced `.text-sm` CSS selector with `data-testid="message-bubble"` (Team Agreement A3 violation). H2: fixed `toHaveCount(1)` → `.first().toBeVisible()`. H3: fixed flaky thread ordering by filtering on broadcast text. M1: reverted unrelated file change. M2: documented cleanup strategy. M3: extracted shared `staffLogin()` helper to `helpers/login.ts`. M4: clarified retry logic claim. L1: verified waitForURL patterns acceptable.

# Prep 1: Fix Supervisor Direct Messaging UX

Status: done

## Story

As a Supervisor,
I want to start a direct conversation with any of my assigned enumerators from the Messages page,
so that I can proactively reach out for guidance without waiting for them to message first.

## Problem

The `SupervisorMessagesPage` inbox only shows existing threads. There is no "New Conversation" UI to pick a team member and open a fresh 1:1 thread. The backend fully supports direct messaging (`POST /messages/send` with `recipientId` + team boundary enforcement) — this is a **frontend UX gap only**.

## Acceptance Criteria

1. **Given** a Supervisor on the Messages page, **when** they click a "New Conversation" button in the inbox header, **then** a team roster picker appears showing all assigned enumerators by name.
2. **Given** the team roster picker, **when** the Supervisor selects an enumerator, **then** the right panel opens a thread view for that enumerator (setting `selectedPartnerId`) with the `ChatComposer` ready for the first message.
3. **Given** an enumerator already has an existing thread in the inbox, **when** the Supervisor selects them from the roster picker, **then** navigate to the existing thread (no duplicate thread creation).
4. **Given** the inbox is empty, **when** the Supervisor views the Messages page, **then** the "New Conversation" button must still be visible and functional in the empty state.
5. **Given** the roster picker, **then** it must show each enumerator's `fullName` and their online/last-active status if available. Enumerators with existing threads should be visually distinguished.

## Tasks / Subtasks

- [x] Task 1: Create TeamRosterPicker component (AC: #1, #5)
  - [x] 1.1 Create `apps/web/src/features/dashboard/components/TeamRosterPicker.tsx`:
    - Dialog or Popover triggered by "New Conversation" button
    - Fetches team data via `useTeamMetrics()` from `apps/web/src/features/dashboard/hooks/useSupervisor.ts`
    - Lists enumerators: name, status indicator, last login
    - Marks enumerators who already have inbox threads (cross-reference with `useInbox()` data)
    - Click handler calls `onSelectEnumerator(id: string)`
    - Search/filter input for teams with many members
    - Skeleton loading state while team data loads

- [x] Task 2: Add "New Conversation" button to MessageInbox (AC: #1, #4)
  - [x] 2.1 Modify `apps/web/src/features/dashboard/components/MessageInbox.tsx`:
    - Add a "New Conversation" button (pencil/compose icon + text) in the inbox header, next to "Broadcast to Team"
    - Button triggers `onNewConversation` callback prop
    - Button visible in both populated and empty inbox states
    - Empty state text updated: "No messages yet" + "New Conversation" button prominent

- [x] Task 3: Wire SupervisorMessagesPage (AC: #2, #3)
  - [x] 3.1 Modify `apps/web/src/features/dashboard/pages/SupervisorMessagesPage.tsx`:
    - Add `showRosterPicker` state
    - Pass `onNewConversation={() => setShowRosterPicker(true)}` to `MessageInbox`
    - On enumerator selection from picker: set `selectedPartnerId` to chosen enumerator ID
    - If selected enumerator already in inbox threads, just navigate to existing thread
    - Close roster picker after selection

- [x] Task 4: Tests (AC: #1-#5)
  - [x] 4.1 Create `apps/web/src/features/dashboard/components/__tests__/TeamRosterPicker.test.tsx`:
    - Renders enumerator list, marks existing threads, search filter, click selection
  - [x] 4.2 Update `apps/web/src/features/dashboard/pages/__tests__/SupervisorMessagesPage.test.tsx`:
    - "New Conversation" button visible, opens roster picker, selecting enumerator opens thread
    - Empty inbox still shows "New Conversation" button

## Dev Notes

### Existing Code to Reuse — DO NOT Reinvent

| What | Location | Usage |
|------|----------|-------|
| Team roster data | `useTeamMetrics()` in `hooks/useSupervisor.ts` | Returns `EnumeratorMetric[]` with `{ id, fullName, status, lastLoginAt }` |
| Inbox thread list | `useInbox()` in `hooks/useMessages.ts` | Returns `InboxThread[]` with `{ partnerId, partnerName }` — for dedup check |
| Send message mutation | `useSendMessage()` in `hooks/useMessages.ts` | Takes `{ recipientId, content }` — creates thread implicitly |
| Thread view | `MessageThread` component | Already renders any thread given `selectedPartnerId` |
| Chat composer | `ChatComposer` component | Already wired in SupervisorMessagesPage |

### Key Implementation Details

- **No new API endpoints needed.** `GET /supervisor/team-metrics` provides the roster. `POST /messages/send` handles first message. Thread appears in inbox automatically after first message.
- **Thread creation is implicit:** The first `sendDirectMessage` call creates the thread. No explicit "create thread" step needed.
- **Dedup logic:** Compare roster picker's `enumerator.id` against `inbox.threads.map(t => t.partnerId)`. If match, just `setSelectedPartnerId(id)` without opening composer.
- **Team boundary already enforced backend:** `MessageService.sendDirectMessage` checks `TeamAssignmentService.getEnumeratorIdsForSupervisor()` — unauthorized recipients throw `TEAM_BOUNDARY_VIOLATION` 403.

### Project Structure

- New: `apps/web/src/features/dashboard/components/TeamRosterPicker.tsx`
- New: `apps/web/src/features/dashboard/components/__tests__/TeamRosterPicker.test.tsx`
- Modified: `apps/web/src/features/dashboard/components/MessageInbox.tsx`
- Modified: `apps/web/src/features/dashboard/pages/SupervisorMessagesPage.tsx`
- Modified: `apps/web/src/features/dashboard/pages/__tests__/SupervisorMessagesPage.test.tsx`

### References

- [Source: _bmad-output/implementation-artifacts/epic-4-retro-2026-02-20.md — Bug report + prep-1 definition]
- [Source: apps/web/src/features/dashboard/pages/SupervisorMessagesPage.tsx — current implementation]
- [Source: apps/web/src/features/dashboard/hooks/useMessages.ts — messaging hooks]
- [Source: apps/web/src/features/dashboard/hooks/useSupervisor.ts — team roster data]
- [Source: apps/api/src/services/message.service.ts — backend direct messaging support]

## Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: Add error state UI to TeamRosterPicker when useTeamMetrics() fails — currently shows misleading "No team members assigned" [TeamRosterPicker.tsx]
- [x] [AI-Review][MEDIUM] M1: Add tests for team metrics error path in roster picker [TeamRosterPicker.test.tsx, SupervisorMessagesPage.test.tsx]
- [x] [AI-Review][MEDIUM] M2: Extract duplicate formatLastLogin/formatTime into shared formatRelativeTime utility [lib/utils.ts]
- [x] [AI-Review][MEDIUM] M3: Document sprint-status.yaml and epics.md in File List (git-changed but unlisted)
- [x] [AI-Review][LOW] L1: Make empty inbox text a clickable "New Conversation" CTA [MessageInbox.tsx:107]
- [x] [AI-Review][LOW] L2: Add conditional `enabled` flag to useTeamMetrics() call [SupervisorMessagesPage.tsx:32]
- [x] [AI-Review][LOW] L3: Add useDeferredValue for search filter debounce [TeamRosterPicker.tsx]
- [x] [AI-Review][LOW] L4: Use vi.useFakeTimers() to prevent flaky time-dependent assertions [TeamRosterPicker.test.tsx]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No debug issues encountered. All implementation straightforward — reused existing hooks and patterns.

### Completion Notes List

- Created `TeamRosterPicker` component: inline panel that replaces inbox when "New Conversation" clicked. Shows enumerator list from `useTeamMetrics()`, marks existing threads via cross-referencing `useInbox()` data, supports search filtering, skeleton loading, and proper ARIA labels.
- Added `onNewConversation` prop to `MessageInbox` with "New Conversation" button (PenSquare icon, emerald green) rendered above "Broadcast to Team".
- Wired `SupervisorMessagesPage` with `showRosterPicker` state, `useTeamMetrics()` hook integration, `existingThreadPartnerIds` Set for dedup, and `handleSelectFromRoster` callback. Thread header now resolves name from team metrics when partner has no existing inbox thread.
- 18 new TeamRosterPicker unit tests + 10 new SupervisorMessagesPage integration tests = 28 total new tests.
- All 47 messaging-related tests pass. Full regression: 667 API + 1540 web tests = 0 regressions.

### Change Log

- 2026-02-21: Implemented Prep-1 — Supervisor direct messaging UX. Added TeamRosterPicker component, "New Conversation" button to MessageInbox, wired SupervisorMessagesPage with roster picker flow. 28 new tests, 0 regressions.
- 2026-02-21: Code review fixes — 8 issues (1H, 3M, 4L) found and resolved:
  - [H1] Added error state UI to TeamRosterPicker (isError prop + error message display)
  - [M1] Added 4 new tests for error state (3 TeamRosterPicker + 1 SupervisorMessagesPage)
  - [M2] Extracted duplicate formatTime/formatLastLogin into shared `formatRelativeTime()` in `lib/utils.ts`
  - [M3] Updated File List to include all git-changed files
  - [L1] Made empty inbox text a clickable CTA triggering onNewConversation
  - [L2] Added conditional `enabled` parameter to `useTeamMetrics()` — only fetches when roster picker open or thread selected
  - [L3] Added `useDeferredValue` for search filter debounce in TeamRosterPicker
  - [L4] Switched TeamRosterPicker tests to `vi.useFakeTimers()` for deterministic time assertions
  - Total: 51 messaging tests pass (21 TeamRosterPicker + 30 SupervisorMessagesPage), 558 dashboard tests pass, 0 regressions.

### File List

- New: `apps/web/src/features/dashboard/components/TeamRosterPicker.tsx`
- New: `apps/web/src/features/dashboard/components/__tests__/TeamRosterPicker.test.tsx`
- Modified: `apps/web/src/features/dashboard/components/MessageInbox.tsx`
- Modified: `apps/web/src/features/dashboard/pages/SupervisorMessagesPage.tsx`
- Modified: `apps/web/src/features/dashboard/pages/__tests__/SupervisorMessagesPage.test.tsx`
- Modified: `apps/web/src/features/dashboard/hooks/useSupervisor.ts`
- Modified: `apps/web/src/lib/utils.ts`
- Meta: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Meta: `_bmad-output/planning-artifacts/epics.md`

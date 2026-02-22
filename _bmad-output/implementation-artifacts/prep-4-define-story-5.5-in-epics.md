# Prep 4: Define Story 5.5 in Epics

Status: done

## Story

As a Project Manager,
I want the Respondent Data Registry Table story formally defined in epics.md with full acceptance criteria,
so that the create-story workflow can generate a comprehensive implementation guide for Story 5.5.

## Context

The Epic 4 retrospective identified a gap: no existing Epic 5 story provides a browsable table of all respondent data. Story 5.5 was added to sprint-status.yaml with a brief comment, but the full AC definition from the retrospective needs to be written into `_bmad-output/planning-artifacts/epics.md`.

## Acceptance Criteria

1. **Given** the Epic 5 section of `_bmad-output/planning-artifacts/epics.md`, **when** I add Story 5.5, **then** it must include the complete definition from the Epic 4 retrospective: user story statement, access control matrix (4 roles), filter controls (9 filters), column visibility matrix (11 columns x 4 roles), and technical requirements (cursor-based pagination, server-side filtering, TanStack Table, 1M scale target).
2. **Given** the story definition, **then** it must reference dependencies on Epic 4 (`fraud_detections`, `team_assignments` tables) and integration with Story 5.4 (exports respect active filters).
3. **Given** the epics.md file, **then** Story 5.5 must be inserted after Story 5.4 and before the Epic 5 retrospective line, maintaining the existing document formatting and structure.

## Tasks / Subtasks

- [x] Task 1: Write Story 5.5 definition into epics.md (AC: #1, #2, #3)
  - [x] 1.1 Read `_bmad-output/planning-artifacts/epics.md` — locate Epic 5 section
  - [x] 1.2 Insert the full Story 5.5 definition (lines 1426-1486 in epics.md) with:
    - User story, dependencies (Epic 4 tables, Story 5.4 export integration)
    - AC5.5.1: Access Control table (4 roles with scope + PII + audit columns)
    - AC5.5.2: Filter Controls (9 filters)
    - AC5.5.3: Column Visibility per Role (11 columns x 4 roles matrix)
    - AC5.5.4: Technical Requirements (cursor-based pagination, server-side, TanStack Table, 1M scale)
  - [x] 1.3 Verify formatting consistency with other Epic 5 stories
  - [x] 1.4 Added ACs 5.5.5 (Quick-Filter Presets), 5.5.6 (Live Monitoring Mode), 5.5.7 (Row Navigation) from PM discussion (2026-02-22) — beyond original retrospective scope
- [x] Task 2: Define Stories 5.6a and 5.6b in epics.md (added during same session)
  - [x] 2.1 Story 5.6a: Supervisor Team Productivity Table & API Foundation (split from original 5.6 per A4)
  - [x] 2.2 Story 5.6b: Super Admin Staff Productivity Table
  - [x] 2.3 Updated Epic 5 header "Stories:" line to reflect 5.6a/5.6b split

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] Undocumented scope: Stories 5.6a/5.6b and ACs 5.5.5-5.5.7 added but not tracked in Tasks — documented in tasks below [epics.md]
- [x] [AI-Review][MEDIUM] Epic 5 "Stories:" summary listed "5.6" but actual stories are 5.6a and 5.6b — fixed in epics.md [epics.md:176]
- [x] [AI-Review][LOW] Completion Notes mention 5.6a/5.6b but File List didn't — updated File List below
- [x] [AI-Review][LOW] Task list only covers Story 5.5 AC#1-3 — added Task 2 below for 5.6a/5.6b and expanded ACs

## Dev Notes

### Source: Epic 4 Retrospective (lines 152-207)

The complete Story 5.5 definition is captured in the retrospective document at `_bmad-output/implementation-artifacts/epic-4-retro-2026-02-20.md`. Copy the full spec from there.

### Already in Sprint Status

`sprint-status.yaml` already has: `5-5-respondent-data-registry-table: backlog` — no sprint status change needed for this prep task.

### References

- [Source: _bmad-output/implementation-artifacts/epic-4-retro-2026-02-20.md — Story 5.5 full spec]
- [Source: _bmad-output/planning-artifacts/epics.md — target file for insertion]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- Story 5.5 fully defined in epics.md (lines 1426-1486) with all 4 ACs, access control matrix, 9 filter controls, 11-column visibility matrix, and technical requirements
- Stories 5.6a and 5.6b also defined in same session (split from original 5.6)

### Change Log

- 2026-02-22: Story 5.5 definition written into epics.md, story file updated to done
- 2026-02-22: [Code Review] Documented scope expansion (5.6a/5.6b, ACs 5.5.5-5.5.7), fixed Epic 5 Stories summary, updated File List

### File List

- `_bmad-output/planning-artifacts/epics.md` — Story 5.5 definition added (lines 1426-1486), Stories 5.6a and 5.6b added, Epic 5 header "Stories:" line updated to reflect 5.6a/5.6b split

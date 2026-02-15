# Story prep-3: FR21 PRD Alignment - NIN Duplicate "Link" to "Reject"

Status: done
<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Product Owner,
I want the PRD FR21 text updated to reflect the actual NIN duplicate behavior (reject, not link),
so that the PRD remains the authoritative specification document and does not mislead future developers or stakeholders.

## Context & Rationale

**Discovered during:** Epic 3 Retrospective (2026-02-14)
**Decision maker:** Awwal (Project Lead)
**Source:** [epic-3-retro-2026-02-14.md#FR21 Product Decision]

**The Problem:** PRD FR21 specified NIN duplicate **linking** while Story 3.7 implemented duplicate **rejection** with original registration date.

**The Decision (Awwal, 2026-02-14):** Keep rejection behavior to prevent wasted field time, using three-layer defense:
- Client pre-check
- Ingestion rejection
- Database UNIQUE constraint

## Acceptance Criteria

1. **Given** the PRD document at `_bmad-output/planning-artifacts/prd.md`, **When** a developer reads FR21, **Then** it must describe NIN duplicate **rejection** behavior (not linking), matching the Story 3.7 implementation
2. **Given** the updated FR21 text, **When** read in context, **Then** it must cover: (a) rejection with error message including original registration date, (b) cross-table check (respondents + users), (c) pre-submission NIN check API for client-side prevention, (d) offline resilience (pre-check skipped offline, ingestion catches it), (e) race condition defense via DB UNIQUE constraint
3. **Given** the PRD version history table, **When** this change is applied, **Then** a new version entry must document the FR21 change with date, version number, and rationale
4. **Given** related artifacts (`architecture.md`, `epics.md`, and `_bmad-output/project-context.md`), **When** checked for NIN linking references, **Then** none should remain - all should reflect rejection behavior
5. **Given** the NFR8.1 text referencing FR21, **When** read, **Then** it should still be consistent with the updated FR21

## Tasks / Subtasks

- [x] Task 1: Update PRD FR21 text (AC: 1, 2)
  - [x] 1.1 In `_bmad-output/planning-artifacts/prd.md`, replace the current FR21 text with updated text that describes rejection behavior instead of linking
  - [x] 1.2 Updated FR21 includes: (a) UNIQUE constraint on `respondents.nin`, (b) duplicate NIN is **rejected**, (c) rejection includes original registration date, (d) cross-table check against `users.nin` for staff NIN conflicts, (e) pre-submission NIN check API for early client-side detection, (f) offline mode behavior, (g) race condition defense via PostgreSQL UNIQUE constraint, (h) NIN format validation (Modulus 11)
  - [x] 1.3 Removed obsolete linking rationale
  - [x] 1.4 Updated duplicate detection audit log text to `respondent.duplicate_nin_rejected`
- [x] Task 2: Add PRD version history entry (AC: 3)
  - [x] 2.1 Added new row to the version history table in `prd.md`
  - [x] 2.2 Version: `8.1`, Date: `2026-02-15`, with retrospective rationale, authored by `Awwal (PO)`
- [x] Task 3: Verify no stale NIN linking references remain (AC: 4, 5)
  - [x] 3.1 Grep `_bmad-output/planning-artifacts/architecture.md` for NIN/respondent linking language - none found in targeted pattern checks
  - [x] 3.2 Grep `_bmad-output/planning-artifacts/epics.md` - Story 3.7 explicitly states rejection
  - [x] 3.3 Grep `_bmad-output/project-context.md` - confirms `NIN_DUPLICATE` with 409 pattern
  - [x] 3.4 Verified NFR8.1 in `prd.md` remains consistent with DB UNIQUE defense

### Review Follow-ups (AI)

- [x] [AI-Review][Critical] No critical issues identified in code review.
- [x] [AI-Review][High] No high-severity issues identified in code review.
- [x] [AI-Review][Medium] Documented non-story working-tree changes for transparency in Dev Agent Record.
- [x] [AI-Review][Medium] Resolved PRD checksum terminology inconsistency by aligning normative NIN validation references to Modulus 11.
- [x] [AI-Review][Low] Removed trailing whitespace/noise diff in `_bmad-output/implementation-artifacts/sprint-status.yaml`.
- [x] [AI-Review][Low] Clarified AC4 artifact scope wording to separate planning artifacts from project-context file location.

## Dev Notes

### This Is Documentation-Only

**No code changes.** The codebase already implements rejection correctly (Story 3.7, code review passed 2026-02-14). This task only updates the PRD to match.

### Testing Standards

No tests needed - documentation-only task. Post-edit verification performed for:
- FR21 content correctness
- Version history entry presence
- Cross-artifact consistency checks

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Implementation Plan

- Update FR21 in `prd.md` to match implemented rejection behavior from Story 3.7.
- Add PRD version history entry `8.1` dated `2026-02-15` with retrospective rationale.
- Verify related artifacts contain no stale NIN-linking behavior language.

### Debug Log References

- Updated FR21 and audit event in `_bmad-output/planning-artifacts/prd.md`.
- Added version history row `8.1` in `_bmad-output/planning-artifacts/prd.md`.
- Verification commands run:
  - `rg -n "NIN.{0,80}link|link.{0,80}NIN|respondent.{0,80}link|link.{0,80}respondent|duplicate_nin_linked" _bmad-output/planning-artifacts/architecture.md`
  - `rg -n -C 6 "Story 3\.7|rejected with an error message" _bmad-output/planning-artifacts/epics.md`
  - `rg -n "NIN_DUPLICATE|409|duplicate|reject" _bmad-output/project-context.md`
  - `rg -n "^\*\s+\*\*FR21:\*\*|^\*\s+\*\*NFR8\.1:" _bmad-output/planning-artifacts/prd.md`
  - `rg -n "Verhoeff|Modulus 11" _bmad-output/planning-artifacts/prd.md`

### Completion Notes List

- Updated FR21 from duplicate linking to duplicate rejection behavior, including cross-table `users` checks, pre-submission API check, offline behavior, race-condition defense, and updated audit event `respondent.duplicate_nin_rejected`.
- Added PRD change log row `8.1` (date `2026-02-15`) documenting the FR21 decision alignment with retrospective rationale.
- Verified consistency across artifacts: `epics.md` Story 3.7 shows rejection behavior; `project-context.md` references `NIN_DUPLICATE` with 409; NFR8.1 remains consistent with FR21.
- Normalized normative PRD NIN checksum references to **Modulus 11** to remove mixed-rule ambiguity.
- Documented non-story local working-tree changes for review transparency.
- No code changes and no tests required for this documentation-only story.

### Review Transparency Notes

- Non-story working-tree changes detected during review and intentionally left untouched:
  - `.claude/settings.local.json`
  - `_bmad-output/planning-artifacts/implementation-readiness-report-2026-02-15.md`
  - `docs/*.pdf`, `docs/PageSpeed Insights*.htm`, `docs/PageSpeed Insights*_files/`, `docs/cv-awwal.html`
  - `new_errorr.txt`

### File List

- _bmad-output/planning-artifacts/prd.md
- _bmad-output/implementation-artifacts/prep-3-fr21-prd-alignment.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-02-15: Completed FR21 PRD alignment from "link" to "reject", added PRD version `8.1`, and verified cross-artifact consistency for NIN duplicate behavior.
- 2026-02-15: Code review fixes applied - action items added, status moved to `done`, PRD checksum terminology normalized to Modulus 11, and review transparency notes recorded.


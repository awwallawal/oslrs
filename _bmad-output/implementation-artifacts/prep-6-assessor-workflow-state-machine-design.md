# Prep 6: Assessor Workflow State Machine Design

Status: done

## Story

As a System Architect,
I want the complete submission verification lifecycle documented as a state machine,
so that Stories 5.2-5.5 implement a consistent, well-defined workflow with clear state transitions.

## Context

The submission lifecycle spans multiple epics: submission creation (Epic 3) → fraud scoring (Epic 4 prep) → supervisor review (Epic 4) → assessor audit (Epic 5) → final status. This prep task documents the complete state machine before Epic 5 implementation begins.

## Acceptance Criteria

1. **Given** the current system state, **when** I document the lifecycle, **then** map every state a submission/fraud_detection record can be in, from initial ingestion to final resolution.
2. **Given** the state machine, **then** define valid transitions per role: who can move a record from state A to state B (Supervisor, Assessor, Super Admin, System).
3. **Given** terminal states, **then** define which states are final (no further transitions) vs which allow re-opening (e.g., can an assessor send back to supervisor?).
4. **Given** the design document, **then** validate against Stories 5.2, 5.3, 5.4, 5.5 acceptance criteria to ensure no conflicts.
5. **Given** the output, **then** write to `_bmad-output/implementation-artifacts/design-assessor-workflow-state-machine.md`.

## Tasks / Subtasks

- [x] Task 1: Map current system state (AC: #1)
  - [x] 1.1 Read fraud_detections schema — existing `resolution` field values and transitions
  - [x] 1.2 Read submissions schema — `processed` field and ingestion pipeline
  - [x] 1.3 Read Story 5.2 — proposed `assessorResolution` field values
  - [x] 1.4 Document current states: `unscored` → `scored` → `supervisor_reviewed` → `assessor_audited`

- [x] Task 2: Define state machine (AC: #1, #2, #3)
  - [x] 2.1 Define states:
    ```
    UNPROCESSED → SCORED → PENDING_REVIEW → SUPERVISOR_REVIEWED → ASSESSOR_QUEUE → FINAL_APPROVED | FINAL_REJECTED
    ```
  - [x] 2.2 Define transition rules per role:
    - System: UNPROCESSED → SCORED (fraud engine)
    - Supervisor: SCORED → SUPERVISOR_REVIEWED (via resolution field)
    - Assessor: SUPERVISOR_REVIEWED/HIGH_SEVERITY → FINAL_APPROVED/FINAL_REJECTED
    - Super Admin: can perform any transition
  - [x] 2.3 Define terminal states: FINAL_APPROVED, FINAL_REJECTED (no re-opening by default)
  - [x] 2.4 Document edge cases: What if no fraud detection exists? What about `clean` severity items?

- [x] Task 3: Validate against Epic 5 stories (AC: #4)
  - [x] 3.1 Cross-reference with Story 5.2 ACs (assessor queue composition)
  - [x] 3.2 Cross-reference with Story 5.3 ACs (PII view — any state restrictions?)
  - [x] 3.3 Cross-reference with Story 5.4 ACs (PII-rich exports — derivation logic, access control, rejected items)
  - [x] 3.4 Cross-reference with Story 5.5 ACs (registry table — verification status column)
  - [x] 3.5 Document any conflicts or ambiguities

- [x] Task 4: Write design document (AC: #5)
  - [x] 4.1 Write to `_bmad-output/implementation-artifacts/design-assessor-workflow-state-machine.md`:
    - State diagram (ASCII)
    - State definitions table
    - Transition matrix (role x from-state → to-state)
    - Edge cases and decisions
    - Recommendations for implementation

## Dev Notes

### Current State (Pre-Epic 5)

The current lifecycle as implemented:
```
Submission created (processed=false)
  → Fraud engine scores (processed=true, fraud_detection row created)
    → severity: clean|low|medium|high|critical
    → resolution: NULL (unreviewed)
  → Supervisor reviews (resolution set to one of 6 values)
    → No further states exist yet
```

### Proposed State (Post-Epic 5, from Story 5.2)

```
... → Supervisor reviews (resolution set)
  → Enters Assessor Queue (if resolution IS NOT NULL OR severity IN high/critical)
    → Assessor Final Approve (assessorResolution = 'final_approved')
    → Assessor Final Reject (assessorResolution = 'final_rejected')
```

### Key Design Questions to Resolve

1. Do `clean` severity items skip the assessor queue entirely?
2. Can an assessor re-open a previously final-approved/rejected item?
3. Does a supervisor review of a `clean` item still enter the assessor queue?
4. What happens to items where severity is `low` and supervisor dismisses?

### References

- [Source: _bmad-output/implementation-artifacts/epic-4-retro-2026-02-20.md — prep-6 definition]
- [Source: apps/api/src/db/schema/fraud-detections.ts — current schema]
- [Source: _bmad-output/implementation-artifacts/5-2-verification-assessor-audit-queue.md — proposed assessor fields]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 — story definitions]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No debug issues encountered. Pure documentation/design task.

### Completion Notes List

- Mapped complete submission lifecycle from UNPROCESSED → SCORED → SUPERVISOR_REVIEWED → ASSESSOR QUEUE → FINAL_APPROVED/FINAL_REJECTED
- Identified 8 derived verification statuses for Story 5.5's filter system (7 original + `processing_error` added in review)
- Resolved all 4 design questions from Dev Notes:
  1. Clean items skip assessor queue by default (unless supervisor explicitly reviews them)
  2. Terminal states are final — no re-opening
  3. Supervisor review of clean items DOES enter assessor queue (resolution IS NOT NULL)
  4. Low severity + dismissed enters assessor queue (resolution IS NOT NULL)
- Cross-referenced against Stories 5.1, 5.2, 5.3, 5.4, 5.5, 5.6a, 5.6b — no conflicts found
- Provided SQL CASE expression pattern for derived verification_status (Story 5.5)
- Documented role authorization matrix for all 7 roles
- Recommended against adding stored verification_status column (derive at query time)
- [Code Review v1.1] Added processing_error state, concurrent review race condition analysis, backward compatibility section, definitive auto_clean decision, expanded export considerations

### Review Follow-ups (AI) — Code Review 2026-02-22

All 9 findings fixed in design document v1.1:

- [x] [AI-Review][HIGH] H1: Add `processing_error` derived state for failed submissions (`submissions.processingError IS NOT NULL`). Updated sections 4.5, 5.1, 5.2, 5.3.
- [x] [AI-Review][HIGH] H2: Document concurrent review race condition for high/critical items (supervisor + assessor simultaneously). Added section 4.8 with design decision and implementation guidance.
- [x] [AI-Review][MEDIUM] M1: Add missing Story 5.4 subtask to Task 3 (AC #4 requires it). Subtask 3.3 added, section 6.5 expanded with access control, rejected items, error items.
- [x] [AI-Review][MEDIUM] M2: Add `sprint-status.yaml` to File List (was modified but undocumented).
- [x] [AI-Review][MEDIUM] M3: Replace `auto_clean` vs `verified` recommendation with definitive decision: display "Clean (Auto)" in table cells, group under "Verified" in filter dropdown. Updated sections 5.2, 8.5.
- [x] [AI-Review][MEDIUM] M4: Add backward compatibility section (8.7) confirming existing supervisor dashboard, bulk verification, and fraud engine are unaffected by new columns.
- [x] [AI-Review][LOW] L1: Add version metadata (v1.1), review date, and validated-against story versions to document header.
- [x] [AI-Review][LOW] L2: Expand section 6.5 (Story 5.4 exports) with access control matrix, rejected item exportability, and `auto_clean` distinction in exports.
- [x] [AI-Review][LOW] L3: Add processing error path and concurrent review note to section 9 summary diagram.

### Change Log

- 2026-02-22: Code review — 9 findings (2H, 4M, 3L), all fixed in design document v1.1
- 2026-02-22: Created design document with state machine, transition matrix, edge cases, and cross-reference analysis

### File List

- `_bmad-output/implementation-artifacts/design-assessor-workflow-state-machine.md` (NEW) — Complete state machine design document
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED) — Updated prep-6 status to review

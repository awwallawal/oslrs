# Assessor Workflow State Machine Design

> **Author:** Dev Agent (prep-6-assessor-workflow-state-machine-design)
> **Date:** 2026-02-22
> **Version:** 1.1 (post code-review)
> **Reviewed:** 2026-02-22 (Adversarial Code Review — 9 findings, all fixed)
> **Validated Against:** Story 5.2 (ready-for-dev), Story 5.3 (backlog), Story 5.4 (backlog), Story 5.5 (backlog)
> **Status:** Complete
> **Purpose:** Document the complete submission verification lifecycle as a state machine for Epic 5 Stories 5.2-5.5 implementation consistency.

---

## 1. State Diagram

```
                         ┌──────────────────────┐
                         │     UNPROCESSED       │
                         │ submission.processed   │
                         │ = false               │
                         │ No fraud_detection row│
                         └──────────┬───────────┘
                                    │
                                    │ [System: Fraud Engine Worker]
                                    │ BullMQ job processes submission
                                    ▼
                         ┌──────────────────────┐
                         │       SCORED          │
                         │ fraud_detection row   │
                         │ severity: clean|low|  │
                         │   medium|high|critical│
                         │ resolution: NULL      │
                         │ assessorResolution:   │
                         │   NULL                │
                         └──┬────────────────┬───┘
                            │                │
              [Supervisor   │                │  [severity IN
               reviews:     │                │   ('high','critical')]
               sets one of  │                │  Direct path to
               6 resolution │                │  assessor queue
               values]      │                │
                            ▼                │
                ┌────────────────────┐       │
                │ SUPERVISOR_REVIEWED│       │
                │ resolution: one of │       │
                │   6 values (see    │       │
                │   table below)     │       │
                │ assessorResolution:│       │
                │   NULL             │       │
                └──────────┬─────────┘       │
                           │                 │
                           │  [Enters        │
                           │   Assessor      │
                           │   Queue]        │
                           ▼                 ▼
                ┌──────────────────────────────┐
                │       ASSESSOR QUEUE          │
                │  (resolution IS NOT NULL      │
                │   OR severity IN              │
                │   ('high','critical'))         │
                │  AND assessorResolution       │
                │   IS NULL                     │
                └──────┬───────────────┬───────┘
                       │               │
          [Assessor:   │               │  [Assessor:
           Final       │               │   Reject]
           Approve]    │               │
                       ▼               ▼
            ┌──────────────┐  ┌──────────────────┐
            │FINAL_APPROVED│  │ FINAL_REJECTED    │
            │ assessor     │  │ assessorResolution│
            │ Resolution = │  │ = 'final_rejected'│
            │'final_       │  │ assessorNotes:    │
            │ approved'    │  │ required (min 10  │
            │ (TERMINAL)   │  │ chars) (TERMINAL) │
            └──────────────┘  └──────────────────┘

   Side Path (Clean Items - No Review Needed):

            ┌──────────────────────┐
            │   SCORED (clean)     │
            │ severity = 'clean'   │  ──►  Stays here. Effectively
            │ resolution: NULL     │       auto-verified. Does NOT
            │ assessorResolution:  │       enter supervisor or
            │   NULL               │       assessor queue by default.
            └──────────────────────┘

   Note: Supervisors CAN review clean items (optional),
   which would move them into SUPERVISOR_REVIEWED and
   then into the assessor queue.
```

---

## 2. State Definitions

| State | Database Representation | Description |
|-------|------------------------|-------------|
| **UNPROCESSED** | `submission.processed = false`, no `fraud_detections` row | Submission ingested but fraud engine has not yet scored it. Transient state — BullMQ worker processes within seconds. |
| **SCORED** | `fraud_detections` row exists, `resolution IS NULL`, `assessorResolution IS NULL` | Fraud engine has evaluated the submission. Component scores (GPS, Speed, Straight-line, Duplicate, Timing) and composite severity assigned. Awaiting human review. |
| **SUPERVISOR_REVIEWED** | `fraud_detections.resolution IS NOT NULL`, `assessorResolution IS NULL` | Supervisor has made a first-tier resolution decision. The supervisor's resolution and notes are preserved. Item now qualifies for the assessor queue. |
| **ASSESSOR_QUEUE** | Virtual state — not a stored field. Defined by query: `(resolution IS NOT NULL OR severity IN ('high','critical')) AND assessorResolution IS NULL` | Items eligible for second-tier assessor audit. This is a query filter, not a database column. |
| **FINAL_APPROVED** | `assessorResolution = 'final_approved'` | Assessor has completed final audit and approved the submission. **Terminal state.** |
| **FINAL_REJECTED** | `assessorResolution = 'final_rejected'` | Assessor has completed final audit and rejected the submission. Mandatory rejection notes required. **Terminal state.** |

---

## 3. Transition Matrix

### 3.1 State Transitions by Actor

| From State | To State | Actor | Action | Condition |
|------------|----------|-------|--------|-----------|
| UNPROCESSED | SCORED | **System** (Fraud Engine Worker) | BullMQ processes submission, inserts fraud_detection row | Automatic on submission ingestion |
| SCORED | SUPERVISOR_REVIEWED | **Supervisor** | Sets `resolution` to one of 6 values | Supervisor is scoped to own team (via TeamAssignmentService) |
| SCORED | SUPERVISOR_REVIEWED | **Super Admin** | Sets `resolution` to one of 6 values | Super Admin has global scope |
| SUPERVISOR_REVIEWED | FINAL_APPROVED | **Assessor** | Sets `assessorResolution = 'final_approved'` | Item in assessor queue |
| SUPERVISOR_REVIEWED | FINAL_REJECTED | **Assessor** | Sets `assessorResolution = 'final_rejected'`, requires notes | Item in assessor queue |
| SUPERVISOR_REVIEWED | FINAL_APPROVED | **Super Admin** | Sets `assessorResolution = 'final_approved'` | Super Admin can perform any transition |
| SUPERVISOR_REVIEWED | FINAL_REJECTED | **Super Admin** | Sets `assessorResolution = 'final_rejected'` | Super Admin can perform any transition |
| SCORED (high/critical) | FINAL_APPROVED | **Assessor** | Sets `assessorResolution = 'final_approved'` | High/critical items enter assessor queue even without supervisor review |
| SCORED (high/critical) | FINAL_REJECTED | **Assessor** | Sets `assessorResolution = 'final_rejected'` | High/critical items enter assessor queue even without supervisor review |

### 3.2 Supervisor Resolution Values

| Resolution Value | Meaning | Severity Context |
|-----------------|---------|-----------------|
| `confirmed_fraud` | Fraud verified by supervisor | Typically medium/high/critical |
| `false_positive` | Incorrectly flagged by fraud engine | Any severity |
| `needs_investigation` | Requires further review/escalation | Any severity |
| `dismissed` | Disregarded without further action | Typically low |
| `enumerator_warned` | Warning issued to the enumerator | Any severity |
| `enumerator_suspended` | Enumerator suspended from duty | Typically high/critical |

### 3.3 Assessor Resolution Values

| Resolution Value | Meaning | Requirements |
|-----------------|---------|-------------|
| `final_approved` | Submission verified and approved | No notes required |
| `final_rejected` | Submission rejected after audit | Mandatory rejection notes (min 10 chars) |

### 3.4 Role Authorization Matrix

| Role | Can Review as Supervisor | Can Review as Assessor | Can View Queue | Scope |
|------|:------------------------:|:---------------------:|:--------------:|-------|
| Supervisor | Yes | No | Own team only | LGA-scoped via TeamAssignmentService |
| Verification Assessor | No | Yes | Full queue | State-wide (all LGAs) |
| Super Admin | Yes | Yes | Full queue | Global (all LGAs, all teams) |
| Enumerator | No | No | No | N/A |
| Data Entry Clerk | No | No | No | N/A |
| Government Official | No | No | No (read-only dashboards) | N/A |
| Public User | No | No | No | N/A |

---

## 4. Edge Cases and Design Decisions

### 4.1 Do clean severity items skip the assessor queue?

**Decision: YES (by default).**

Clean items have `severity = 'clean'` and typically `resolution IS NULL` (supervisors don't review them). The assessor queue query is:

```sql
(resolution IS NOT NULL OR severity IN ('high', 'critical'))
AND assessorResolution IS NULL
```

Clean items with `resolution IS NULL` do NOT match either OR condition, so they are excluded from the assessor queue.

**Exception:** If a supervisor explicitly reviews a clean item (sets `resolution` to any value), that item WILL enter the assessor queue because `resolution IS NOT NULL` is true. This is intentional — if a supervisor thought a clean item warranted review, the assessor should see it.

### 4.2 Can an assessor re-open a previously final-approved/rejected item?

**Decision: NO. Terminal states are final.**

Once `assessorResolution` is set to `final_approved` or `final_rejected`, the item leaves the assessor queue permanently. There is no re-opening mechanism.

**Rationale:** Re-opening would require:
- An additional `assessorResolution` history table (audit trail complexity)
- Ambiguity about which assessor decision is authoritative
- Risk of decision flip-flopping

If a correction is needed, the Super Admin can address it through other administrative channels. The audit log preserves the full history of who made what decision and when.

### 4.3 Does a supervisor review of a clean item still enter the assessor queue?

**Decision: YES.**

Per the query logic, ANY item where `resolution IS NOT NULL` enters the assessor queue, regardless of severity. If a supervisor reviews a clean item, the assessor will see it.

**Rationale:** If a supervisor thought a clean-scored item needed review, something unusual is happening. The assessor tier exists precisely for this kind of oversight.

### 4.4 What happens to items where severity is low and supervisor dismisses?

**Decision: They enter the assessor queue.**

A dismissed low-severity item has `resolution = 'dismissed'` (which is NOT NULL), so it qualifies for the assessor queue. The assessor can then final-approve (confirming the dismissal) or final-reject (overriding the supervisor's dismissal).

**This is by design:** The assessor tier provides oversight over ALL supervisor decisions, not just suspicious ones.

### 4.5 What about submissions without fraud_detection rows?

**Decision: These are UNPROCESSED, but distinguish between pending and failed.**

Submissions with `processed = false` fall into two sub-states:

| Sub-State | Database Representation | Meaning |
|-----------|------------------------|---------|
| **Pending Processing** | `processed = false`, `processingError IS NULL` | BullMQ worker will process within seconds. Transient. |
| **Processing Failed** | `processed = false`, `processingError IS NOT NULL` | Worker attempted processing but failed. Requires investigation/retry. NOT transient. |

If a submission stays in "Pending Processing" for more than a few seconds, it indicates a worker issue (job failure, queue backup). If `processingError` is set, the item is stuck and may need manual intervention or a retry trigger.

These items do NOT appear in any review queue. They exist only in the submissions table.

**For Story 5.5 (registry table):**
- Pending processing → display as "Pending" verification status
- Processing failed → display as "Error" verification status (distinct from "Pending" to surface stuck items)

### 4.6 What about bulk verification (Story 4.5)?

Bulk verification sets `resolution` for multiple fraud_detections in a single transaction. Each affected item then enters the assessor queue individually. The bulk operation is a supervisor-tier action that does not bypass the assessor tier.

### 4.8 Concurrent review: supervisor and assessor on the same high/critical item

**Scenario:** High/critical items appear in both the supervisor queue (`severity IN ('high','critical')` with `resolution IS NULL`) and the assessor queue simultaneously. A supervisor and assessor could review the same item concurrently.

**Decision: Assessor authority takes precedence. No locking required.**

Since supervisor and assessor write to different fields (`resolution` vs `assessorResolution`), there is no database-level conflict. Both decisions are preserved independently. However, the assessor may make a final decision without seeing the supervisor's analysis (since `resolution` is still NULL when the assessor reviews).

**Accepted behavior:**
- Assessor can final-approve/reject a high/critical item even if no supervisor has reviewed it yet
- If a supervisor reviews AFTER the assessor's final decision, the supervisor's `resolution` is still recorded (for audit completeness) but does not change the terminal state
- The audit trail captures both decisions with timestamps, so any discrepancy is visible

**Implementation guidance for Story 5.2:**
- The assessor queue page should display a "Supervisor: Not yet reviewed" indicator for items where `resolution IS NULL`
- This gives assessors context that they're making the first AND final human decision on this item
- No soft-lock or mutex needed — the two-field separation prevents data corruption

**Why no locking:** The assessor tier exists precisely for high-severity items that need urgent attention. Requiring supervisor review first for high/critical items would defeat the purpose of direct escalation. The cost of a rare contradictory decision (assessor approves, supervisor later flags as fraud) is lower than the cost of delayed assessor action on high-severity items.

---

### 4.7 Medium and low severity items without supervisor review

Items with `severity IN ('medium', 'low')` and `resolution IS NULL`:
- Do NOT enter the assessor queue (neither condition met)
- Remain in the SCORED state awaiting supervisor review
- Visible in the supervisor fraud review page

These items are effectively "pending supervisor review." If supervisors never review them, they stay in limbo. This is acceptable for low-severity items but should be monitored for medium-severity items.

**Recommendation for Story 5.5:** Surface a count of "stale medium-severity items" (unreviewed for >7 days) as a monitoring metric on the Super Admin dashboard.

---

## 5. Derived Verification Status (for Story 5.5)

Story 5.5 (Respondent Data Registry Table) requires a "verification status" filter with values: `pending`, `verified`, `rejected`, `quarantined`. Since no `verification_status` column exists on submissions, this must be **derived** from the fraud_detections state.

### 5.1 Status Derivation Logic

| Database State | Derived Status | Display Label |
|----------------|---------------|---------------|
| No fraud_detection row, `submission.processed = false`, `processingError IS NULL` | `unprocessed` | "Pending" |
| No fraud_detection row, `submission.processed = false`, `processingError IS NOT NULL` | `processing_error` | "Error" |
| fraud_detection exists, severity = `clean`, resolution IS NULL | `auto_clean` | "Clean" |
| fraud_detection exists, severity IN (`low`, `medium`), resolution IS NULL | `pending_review` | "Pending Review" |
| fraud_detection exists, severity IN (`high`, `critical`), resolution IS NULL | `flagged` | "Flagged" |
| fraud_detection exists, resolution IS NOT NULL, assessorResolution IS NULL | `under_audit` | "Under Audit" |
| assessorResolution = `final_approved` | `verified` | "Verified" |
| assessorResolution = `final_rejected` | `rejected` | "Rejected" |

### 5.2 Mapping to Story 5.5 Filter Values

| Story 5.5 Filter | Includes Derived Statuses | SQL Condition |
|-------------------|--------------------------|---------------|
| **pending** | `unprocessed` + `pending_review` + `under_audit` | `(fd.id IS NULL AND s.processing_error IS NULL) OR (fd.severity NOT IN ('high','critical') AND fd.resolution IS NULL) OR (fd.resolution IS NOT NULL AND fd.assessor_resolution IS NULL)` |
| **verified** | `auto_clean` + `verified` | `(fd.severity = 'clean' AND fd.resolution IS NULL) OR fd.assessor_resolution = 'final_approved'` |
| **rejected** | `rejected` | `fd.assessor_resolution = 'final_rejected'` |
| **quarantined** | `flagged` | `fd.severity IN ('high','critical') AND fd.resolution IS NULL` |
| **error** | `processing_error` | `fd.id IS NULL AND s.processing_error IS NOT NULL` |

> **Design Decisions:**
> - The `auto_clean` → `verified` grouping means clean-scored items are treated as effectively verified without human review. In the table cell, display "Clean (Auto)" as a distinct label; in the filter dropdown, group under "Verified." This gives transparency (users see the distinction) while keeping filters simple (4+1 categories).
> - The `error` filter surfaces stuck items separately from healthy pending items. This is a Super Admin / Supervisor concern — consider hiding this filter from lower roles.

### 5.3 SQL Implementation Pattern

```sql
-- Derived verification_status as a CASE expression for Story 5.5
-- Order matters: terminal states first, then specific conditions, then fallback
CASE
  WHEN fd.id IS NULL AND s.processing_error IS NOT NULL THEN 'processing_error'
  WHEN fd.id IS NULL THEN 'unprocessed'
  WHEN fd.assessor_resolution = 'final_approved' THEN 'verified'
  WHEN fd.assessor_resolution = 'final_rejected' THEN 'rejected'
  WHEN fd.severity IN ('high', 'critical') AND fd.resolution IS NULL THEN 'flagged'
  WHEN fd.resolution IS NOT NULL AND fd.assessor_resolution IS NULL THEN 'under_audit'
  WHEN fd.severity = 'clean' AND fd.resolution IS NULL THEN 'auto_clean'
  ELSE 'pending_review'
END AS verification_status
```

---

## 6. Cross-Reference with Epic 5 Stories

### 6.1 Story 5.2 — Verification Assessor Audit Queue

| Aspect | State Machine Alignment | Conflicts/Notes |
|--------|------------------------|-----------------|
| Queue composition (AC#1) | Matches: `(resolution IS NOT NULL OR severity IN ('high','critical')) AND assessorResolution IS NULL` | No conflicts |
| Assessor resolution values (AC#3, #4) | `final_approved`, `final_rejected` — matches terminal states | No conflicts |
| Supervisor resolution preserved (AC#3) | Correct — assessor sets `assessorResolution`, does NOT modify `resolution` | Two-tier review coexists on same row |
| Rejection requires notes (AC#4) | `final_rejected` requires mandatory notes (min 10 chars) | Asymmetric: approve needs no notes |
| Completed page (AC#6) | WHERE `assessorResolution IS NOT NULL` — matches FINAL_APPROVED + FINAL_REJECTED states | No conflicts |
| Audit logging (AC#8) | Action `assessor.final_review` with both assessor and supervisor decisions | Audit trail captures full decision chain |
| Role authorization (AC#9) | Assessor + Super Admin only | Matches role matrix (section 3.4) |

**Verdict: No conflicts with Story 5.2.**

### 6.2 Story 5.3 — Individual Record PII View (Authorized Roles)

| Aspect | State Machine Alignment | Conflicts/Notes |
|--------|------------------------|-----------------|
| PII access for authorized roles | No state restrictions on PII view — any record can be viewed regardless of verification state | State machine does not restrict read access |
| Audit logging of PII access | Every PII view logged (separate from verification workflow) | PII audit logging is independent of verification state |

**Analysis:** Story 5.3 does not define any state-based restrictions on PII view. An authorized user can view PII for any submission regardless of whether it's SCORED, SUPERVISOR_REVIEWED, FINAL_APPROVED, or FINAL_REJECTED.

**Recommendation:** Consider whether PII access should be restricted for FINAL_REJECTED items (e.g., "this submission was rejected — PII may be unreliable"). However, Story 5.3's current AC does not include this restriction.

**Verdict: No conflicts with Story 5.3. Recommendation noted.**

### 6.3 Story 5.5 — Respondent Data Registry Table

| Aspect | State Machine Alignment | Conflicts/Notes |
|--------|------------------------|-----------------|
| Verification status filter (AC5.5.2) | `pending, verified, rejected, quarantined` — mapped to derived states in section 5.2 | No stored field; requires CASE derivation |
| Column: Verification Status (AC5.5.3) | Derived from fraud_detections state | All roles see this column |
| Column: Fraud Score (AC5.5.3) | Direct from `fraud_detections.totalScore` | Supervisor and higher see this |
| Quick-filter "Flagged" preset (AC5.5.5) | Maps to derived status `flagged` (high/critical, unreviewed) | Matches quarantined filter value |
| Quick-filter "Pending Review" preset (AC5.5.5) | Maps to all non-terminal, non-clean states | Broad pending scope |
| Row click → detail view (AC5.5.7) | Navigates to Story 5.3 PII view | No state restriction on navigation |
| Live Feed monitoring (AC5.5.6) | Shows all incoming submissions regardless of verification state | Includes UNPROCESSED items |

**Potential Issue:** Story 5.5 lists filter values as `pending, verified, rejected, quarantined`, but the state machine has 7 derived states. The mapping in section 5.2 groups these into 4 filter categories. Implementation must handle this grouping correctly.

**Recommendation:** Consider adding `auto_clean` as a visible status distinct from `verified` in the UI, since clean items were never human-reviewed. Alternatively, accept the grouping and document that "verified" includes both auto-clean and assessor-approved items.

**Verdict: No conflicts with Story 5.5. Mapping documented in section 5.**

### 6.4 Story 5.1 — High-Level Policy Dashboard

Story 5.1 is a read-only aggregate dashboard for Government Officials. It shows registration counts, skills distribution, LGA breakdown, and trends. It does NOT display individual verification states or interact with the fraud review pipeline.

**Verdict: No conflicts. Story 5.1 is orthogonal to the verification workflow.**

### 6.5 Story 5.4 — PII-Rich CSV/PDF Exports (Backlog)

Exports will need to include the derived verification status column. The export should respect the same derivation logic defined in section 5.

**Implementation considerations:**
- The SQL CASE expression (section 5.3) must be included in the export query, producing a `verification_status` column in CSV/PDF output
- **Access control:** Export access should follow the role authorization matrix (section 3.4). Supervisors export only their team's records; Assessors and Super Admins export state-wide. Government Officials get aggregate-only exports (no individual PII per Story 5.6b pattern)
- **Rejected items:** Items with `assessorResolution = 'final_rejected'` SHOULD be exportable (administrators need records of rejected submissions for audit/compliance). The export should include the `assessorNotes` rejection reason
- **Processing error items:** Include in exports with status "Error" — Super Admins may need to identify and investigate stuck items via exported data
- The `auto_clean` vs `verified` distinction should carry through to exports (display "Clean (Auto)" vs "Verified" in the status column)

**Verdict: No conflicts. Export inherits the derived status logic. Access control and rejected-item handling noted for implementation.**

### 6.6 Stories 5.6a/5.6b — Productivity Tables

Productivity tables track submission counts and targets. They reference submissions but do NOT interact with the verification workflow directly. The "Approved" and "Rejected" columns in 5.6a/5.6b refer to the final assessor decision (FINAL_APPROVED / FINAL_REJECTED).

**Verdict: No conflicts. Productivity queries can use `assessorResolution` for approved/rejected counts.**

---

## 7. Complete Field Inventory

### 7.1 Existing Fields (Pre-Epic 5)

On `fraud_detections` table:

| Field | Type | Set By | Purpose |
|-------|------|--------|---------|
| `severity` | text enum (clean/low/medium/high/critical) | System (Fraud Engine) | Composite fraud score severity |
| `totalScore` | numeric(5,2) | System (Fraud Engine) | Composite fraud score (0-100) |
| `gpsScore`, `speedScore`, `straightlineScore`, `duplicateScore`, `timingScore` | numeric(5,2) | System (Fraud Engine) | Component scores |
| `resolution` | text enum (6 values) | Supervisor / Super Admin | First-tier review decision |
| `resolutionNotes` | text | Supervisor / Super Admin | Optional review notes |
| `reviewedBy` | uuid FK → users | Supervisor / Super Admin | Who reviewed |
| `reviewedAt` | timestamp | Supervisor / Super Admin | When reviewed |

On `submissions` table:

| Field | Type | Set By | Purpose |
|-------|------|--------|---------|
| `processed` | boolean | System (BullMQ Worker) | Whether fraud engine has processed this submission |
| `processedAt` | timestamp | System (BullMQ Worker) | When processed |

### 7.2 New Fields (Story 5.2)

To be added to `fraud_detections` table:

| Field | Type | Set By | Purpose |
|-------|------|--------|---------|
| `assessorReviewedBy` | uuid FK → users, nullable | Assessor / Super Admin | Who performed final audit |
| `assessorReviewedAt` | timestamp, nullable | Assessor / Super Admin | When final audit occurred |
| `assessorResolution` | text enum (final_approved/final_rejected), nullable | Assessor / Super Admin | Final audit decision |
| `assessorNotes` | text, nullable | Assessor / Super Admin | Optional notes (mandatory for rejection) |

### 7.3 Index Recommendations

| Index | Purpose | Stories |
|-------|---------|---------|
| `idx_fraud_detections_assessor_resolution_severity` | Assessor queue filtering | 5.2 |
| `idx_fraud_detections_assessor_reviewed_at` | Completed reviews sorting | 5.2 |
| Existing `idx_fraud_detections_severity_resolution` | Supervisor queue + assessor queue | 4.4, 5.2 |

---

## 8. Recommendations for Implementation

### 8.1 Do NOT add a `verification_status` column

The verification status is best derived at query time using a SQL CASE expression (section 5.3). Adding a stored column would require:
- Triggers or application logic to keep it in sync
- Migration of existing data
- Risk of desynchronization between stored and actual state

The CASE expression is efficient (evaluates against indexed columns) and always accurate.

### 8.2 Assessor queue is a query, not a table

The ASSESSOR_QUEUE state is virtual — it's defined by a WHERE clause, not a separate table. This keeps the data model simple (single `fraud_detections` table with two tiers of review fields).

### 8.3 Audit every state transition

Every state transition must be logged in the `audit_logs` table:

| Transition | Audit Action |
|-----------|-------------|
| SCORED → SUPERVISOR_REVIEWED | `fraud.detection.reviewed` (existing) |
| SCORED → SUPERVISOR_REVIEWED (bulk) | `fraud.bulk_verification` (existing) |
| * → FINAL_APPROVED | `assessor.final_review` (new — Story 5.2) |
| * → FINAL_REJECTED | `assessor.final_review` (new — Story 5.2) |
| PII viewed | `pii.access` (new — Story 5.3, prep-2) |

### 8.4 Terminal state enforcement

FINAL_APPROVED and FINAL_REJECTED are terminal. Implement this as a validation check:

```typescript
// In assessor review handler
if (existing.assessorResolution !== null) {
  throw new AppError(
    'ALREADY_REVIEWED',
    'This detection has already been assessed',
    409,
    { currentResolution: existing.assessorResolution }
  );
}
```

### 8.5 Clean item display — definitive decision

**Decision:** Clean items use **"Clean (Auto)"** as the table cell display label, but group under **"Verified"** in the Story 5.5 filter dropdown.

- **Table cell:** Show "Clean (Auto)" with a distinct green-50 background (lighter than "Verified" which uses green-100)
- **Filter dropdown:** "Verified" filter includes both `auto_clean` and `verified` (assessor-approved) items
- **Rationale:** Users see the distinction at a glance (never human-reviewed vs assessor-approved), but don't need a separate filter category for the most common case (clean items are the majority of submissions)

### 8.7 Backward compatibility

Adding the 4 new nullable columns (`assessorReviewedBy`, `assessorReviewedAt`, `assessorResolution`, `assessorNotes`) to `fraud_detections` has **zero impact** on existing functionality:

| Existing Feature | Impact | Why |
|-----------------|--------|-----|
| Supervisor Fraud Review (`SupervisorFraudPage.tsx`) | None | Queries by `severity`/`resolution` — new columns are nullable and ignored |
| Bulk Verification (Story 4.5) | None | Bulk sets `resolution`/`reviewedBy`/`reviewedAt` — assessor fields untouched |
| Fraud Engine Worker (Story 4.3) | None | Inserts new rows with only component scores — assessor fields default to NULL |
| Existing index `idx_fraud_detections_severity_resolution` | Still valid | Index on `(severity, resolution)` is unchanged; new index on `(assessorResolution, severity)` is additive |
| API response serialization (`castScores`) | None | `castScores()` maps specific fields — new fields need their own mapping in the assessor controller |

**No existing code needs modification.** Story 5.2 adds new endpoints, components, and schema columns alongside existing ones.

---

### 8.6 Stale item monitoring

Items stuck in SCORED state (unreviewed) for extended periods represent a process gap. Consider:
- Dashboard metric: "Unreviewed items older than 7 days" on Super Admin home
- This is informational only, not a blocking requirement for Epic 5

---

## 9. Summary: Lifecycle at a Glance

```
Submission Created
       │
       ▼
  [Fraud Engine]  ──►  SCORED (severity assigned)
       │
       ├─ severity=clean  ──────────────────►  Effectively verified (no queue)
       │
       ├─ severity=low/medium  ──►  Awaits Supervisor Review
       │                                │
       │                                ▼
       │                         SUPERVISOR_REVIEWED  ──►  Assessor Queue
       │                                                        │
       ├─ severity=high/critical ────────────────────────►  Assessor Queue
       │                                                        │
       │                             (Note: high/critical items │
       │                              visible to BOTH supervisor │
       │                              and assessor concurrently  │
       │                              — see section 4.8)         │
       │                                              ┌─────────┴─────────┐
       │                                              ▼                   ▼
       │                                       FINAL_APPROVED      FINAL_REJECTED
       │                                        (Terminal)          (Terminal)
       │
       ├─ processingError set  ──►  PROCESSING_ERROR (stuck, needs investigation)
       │
       └─ No fraud_detection row  ──►  UNPROCESSED (transient, pending worker)
```

**Key principle:** The `fraud_detections` table is the single source of truth for all verification state. Submissions have no verification_status field. The two-tier review (supervisor → assessor) coexists on the same row with separate field namespaces.

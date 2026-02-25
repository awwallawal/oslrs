# Prep 5: Remuneration Domain Modeling

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the development team,
I want a thoroughly researched domain model for staff remuneration covering payment batch schema, PDF receipt storage, dispute state machine, and notification triggers,
so that Stories 6-4, 6-5, and 6-6 have a proven, decision-complete blueprint that prevents rework.

## Context

**This is a RESEARCH SPIKE, not an implementation story.** The deliverable is a spike document (`_bmad-output/implementation-artifacts/prep-5-remuneration-domain-modeling-summary.md`) containing schema designs, state machine diagrams, comparison tables, and recommendations. No production code changes.

### Current State

The OSLRS platform has foundational infrastructure relevant to remuneration:

- **User bank details** already exist in the `users` table (`bankName`, `accountNumber`, `accountName` — all nullable TEXT fields)
- **Temporal versioning pattern** established in `productivity_targets` schema (never update rows; close old via `effectiveUntil`, insert new via `effectiveFrom`)
- **Daily productivity snapshots** provide per-staff submission counts (BullMQ nightly job at 23:59 WAT)
- **AuditService** (prep-epic-5/prep-2) provides fire-and-forget + transactional audit logging with 7 PII action types
- **ExportService** (prep-epic-5/prep-3) provides PDF (A4, branded) and CSV generation patterns with Oyo State branding
- **ID Card Service** provides PDFKit-based document generation with QR codes and brand styling
- **Assessor workflow state machine** (prep-epic-5/prep-6) establishes role-based state transition patterns with concurrent review handling

### Key Scoping Decision

**Remuneration is scoped to RECORD-KEEPING ONLY** (per Awwal's direction during Epic 5 retrospective):
- Payments happen OUTSIDE the app via bank's native tools
- OSLRS role: record proof of payment (PDF receipts), tag to staff members
- Staff can view payment history, download receipts, raise disputes
- Disputes resolved in-app with evidence trail
- NO payment gateway integration. NO direct bank API calls.

### What Needs Designing (Stories 6-4, 6-5, 6-6)

- **No payment batch schema** exists — need `payment_batches` and `payment_records` tables
- **No PDF receipt storage** — need file upload pattern for bank transfer screenshots
- **No dispute state machine** — need lifecycle: Active → Disputed → Resolved → Re-opened
- **No notification triggers** — need email/SMS on payment recording and dispute resolution
- **No tranche concept** — need multi-payment support per staff (Tranche 1, 2, etc.)
- **No admin controls** — need self-payment prevention, secondary approval for edge cases
- **No pre-configured amounts** — need configurable standard payment amounts per role/tranche

## Acceptance Criteria

**AC1**: Given the spike is complete, when reviewed, then it contains a schema design for `payment_batches` and `payment_records` tables with: tranche support, append-only immutability (temporal versioning), bank reference tracking, and receipt file storage — including Drizzle schema code samples.

**AC2**: Given the spike document, when reviewed, then it contains a dispute state machine with: state definitions (Active, Disputed, PendingResolution, Resolved, Reopened, Closed), transition rules, role-based authorization matrix (who can move to which state), and re-open conditions.

**AC3**: Given the spike document, when reviewed, then it contains a PDF receipt storage design with: file upload pattern (multer/formidable), storage location (filesystem vs DB bytea vs object storage), file size limits, allowed MIME types, and retrieval/download API design.

**AC4**: Given the spike document, when reviewed, then it contains a notification trigger design with: event definitions (payment recorded, dispute opened, dispute resolved), delivery channels (email via existing Resend provider, in-app notification via Socket.io), template structure, and async delivery via BullMQ.

**AC5**: Given the spike document, when reviewed, then it contains an admin controls design with: self-payment prevention logic (`req.user.id !== targetUserId`), pre-configured payment amounts (per role, per tranche), ad-hoc amount justification field, and bulk recording workflow (filter by Role/LGA → select staff → record payment).

**AC6**: Given the spike document, when reviewed, then it contains an integration plan showing how payment records connect to: existing `users` table (bank details), `AuditService` (immutable audit trail), `ExportService` (payment history PDF/CSV export), and role-based dashboard routing (staff payment history page, admin dispute queue).

**AC7**: Given the spike document, when reviewed, then it contains scale projections: estimated record volume (200 staff × 4 tranches/year = ~800 records/year), query patterns for payment history and dispute queues, and index strategy for the new tables.

## Tasks / Subtasks

- [x] Task 1: Design payment batch and record schema (AC: #1)
  - [x] 1.1 Design `payment_batches` table: id (UUID v7), trancheNumber, trancheName, amount, description, bankReference, receiptFileUrl, recordedBy (FK users), lgaId (scope filter), status, createdAt
  - [x] 1.2 Design `payment_records` table: id (UUID v7), batchId (FK payment_batches), userId (FK users), amount, status, effectiveFrom, effectiveUntil (temporal versioning), createdBy, createdAt
  - [x] 1.3 Design `payment_amounts_config` table: id, roleId, trancheNumber, standardAmount, effectiveFrom, effectiveUntil, createdBy (pre-configured amounts with temporal versioning)
  - [x] 1.4 Evaluate temporal versioning approach: reuse productivity_targets pattern (effectiveFrom/effectiveUntil) vs. simple version column
  - [x] 1.5 Write Drizzle schema code samples for all tables
  - [x] 1.6 Define index strategy: userId+date for history queries, batchId for batch lookups, status for dispute queue filtering
- [x] Task 2: Design dispute state machine (AC: #2)
  - [x] 2.1 Define dispute states: Active, Disputed, PendingResolution, Resolved, Reopened, Closed
  - [x] 2.2 Define transitions: Active→Disputed (staff reports), Disputed→PendingResolution (admin acknowledges), PendingResolution→Resolved (admin provides evidence), Resolved→Reopened (staff re-reports), Reopened→Resolved (admin re-resolves), Resolved→Closed (auto after 30 days or staff confirms)
  - [x] 2.3 Define role-based authorization matrix: who can trigger which transition
  - [x] 2.4 Design `payment_disputes` table: id, paymentRecordId, status, staffComment, adminResponse, evidenceFileUrl, resolvedBy, resolvedAt, reopenedCount, createdAt
  - [x] 2.5 Handle edge cases: concurrent dispute on same record, dispute on corrected/versioned record, dispute after batch-level correction
  - [x] 2.6 Reference prep-6 assessor workflow patterns for state machine consistency
- [x] Task 3: Design PDF receipt and evidence file storage (AC: #3)
  - [x] 3.1 Evaluate storage options: filesystem (uploads/ directory) vs. PostgreSQL bytea column vs. DigitalOcean Spaces (S3-compatible)
  - [x] 3.2 Recommend approach based on: VPS constraints (single server), backup inclusion, file size limits (bank screenshots typically <5MB), retrieval performance
  - [x] 3.3 Design file upload API: multer middleware, MIME type whitelist (image/png, image/jpeg, application/pdf), max size (10MB), unique filename generation (UUID-based)
  - [x] 3.4 Design file retrieval API: authenticated download endpoint with role-based access control, streaming response
  - [x] 3.5 Define storage schema: `payment_files` table (id, entityType: 'receipt'|'dispute_evidence', entityId, originalFilename, storedFilename, mimeType, sizeBytes, uploadedBy, createdAt)
- [x] Task 4: Design notification trigger system (AC: #4)
  - [x] 4.1 Define notification events: `payment.recorded` (to staff), `dispute.opened` (to admin), `dispute.resolved` (to staff), `dispute.reopened` (to admin)
  - [x] 4.2 Design BullMQ queue integration: `remuneration-notifications` queue, job payloads, retry strategy
  - [x] 4.3 Design email templates: payment recorded (amount, date, tranche, bank reference), dispute status change (new status, admin/staff comment)
  - [x] 4.4 Design in-app notification integration: leverage existing Socket.io infrastructure from Story 4.2 (messaging)
  - [x] 4.5 Evaluate SMS delivery: existing infrastructure? Third-party provider needed? Cost implications? Recommend deferral if no existing SMS provider.
- [x] Task 5: Design admin controls and bulk recording workflow (AC: #5)
  - [x] 5.1 Design self-payment prevention: middleware guard comparing `req.user.id` against target staff IDs in bulk batch
  - [x] 5.2 Design pre-configured payment amounts: `payment_amounts_config` table with temporal versioning, admin UI for configuration
  - [x] 5.3 Design ad-hoc amount flow: justification field required when amount differs from configured standard
  - [x] 5.4 Design bulk recording workflow: Filter staff (by Role + LGA) → Review selection → Enter batch details (amount, tranche, bank reference, receipt upload) → Confirm → Create batch + individual records → Trigger notifications
  - [x] 5.5 Design payment correction flow: Admin creates new version of payment record (append-only), old record closed via effectiveUntil
- [x] Task 6: Design integration plan with existing services (AC: #6)
  - [x] 6.1 Map payment actions to AuditService: new action types (`payment.batch_created`, `payment.recorded`, `payment.corrected`, `dispute.opened`, `dispute.resolved`, `dispute.reopened`)
  - [x] 6.2 Design payment history export: CSV (all payment records for staff/LGA/date range) and PDF (individual payment receipt, batch summary)
  - [x] 6.3 Map to dashboard routing: Staff → "Payment History" tab, Super Admin → "Remuneration" section + "Payment Disputes" widget
  - [x] 6.4 Design API endpoints: POST /payment-batches (bulk record), GET /payment-records (history), POST /payment-disputes (open), PATCH /payment-disputes/:id (resolve), GET /payment-files/:id (download)
  - [x] 6.5 Plan backward compatibility: no existing payment code to migrate, clean greenfield implementation on existing user/audit foundation
- [x] Task 7: Scale projections and index strategy (AC: #7)
  - [x] 7.1 Calculate projected volume: ~200 staff × 4 tranches/year = ~800 payment_records/year, ~50 batches/year, ~40 disputes/year (5% dispute rate)
  - [x] 7.2 Define query patterns: staff payment history (userId + date range), admin dispute queue (status filter), batch detail view (batchId), LGA-filtered reports
  - [x] 7.3 Design index strategy for all new tables
  - [x] 7.4 Estimate whether partitioning is needed (unlikely at <10K records/year — defer to monitoring)
- [x] Task 8: Write spike summary document (all ACs)
  - [x] 8.1 Compile all research into `_bmad-output/implementation-artifacts/prep-5-remuneration-domain-modeling-summary.md`
  - [x] 8.2 Include Drizzle schema code samples, state machine diagram (ASCII), API endpoint table, notification flow diagram
  - [x] 8.3 Include implementation roadmap: Story 6-4 (batch schema + bulk recording), Story 6-5 (staff history + dispute opening), Story 6-6 (admin dispute queue + resolution)
- [x] Task 9: Update story status and dev agent record

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: `payment_amounts_config.roleId` typed as `uuid` but roles are string constants — change to `text` [spike-summary.md:193]
- [x] [AI-Review][HIGH] H2: Missing `justification` column in `payment_batches` schema — ad-hoc justification not persisted for audit [spike-summary.md:Section 4.1]
- [x] [AI-Review][HIGH] H3: Self-payment prevention middleware bug — `req.body.staffIds` is a JSON string in multipart, not parsed array [spike-summary.md:585-595]
- [x] [AI-Review][MEDIUM] M1: Executive summary claims "4 new tables" — spike defines 5 (missing `payment_amounts_config`) [spike-summary.md:15]
- [x] [AI-Review][MEDIUM] M2: Comment history via string concatenation is fragile — recommend JSONB array for dispute comments [spike-summary.md:Section 5.5]
- [x] [AI-Review][MEDIUM] M3: Story schema sketch `storedFilename` inconsistent with spike's `storedPath` [story:259, spike-summary:263]
- [x] [AI-Review][LOW] L1: AC4 references "Nodemailer" but system uses Resend provider [story:AC4]
- [x] [AI-Review][LOW] L2: `payment_amounts_config` lacks `trancheName` — no canonical tranche name registry [spike-summary.md:Section 4.3]
- [x] [AI-Review][LOW] L3: `totalAmount` as `integer` — recommend `bigint` for future-proofing [spike-summary.md:Section 4.1]

## Dev Notes

### Domain Model Overview

**Remuneration is record-keeping, NOT payment processing.** The flow is:

```
1. Super Admin records payment batch (outside bank transfer already done)
   ↓
2. System creates payment_batch + individual payment_records
   ↓
3. Notifications sent to affected staff (email + in-app)
   ↓
4. Staff views payment history on their dashboard
   ↓
5. If issue → Staff opens dispute with comment
   ↓
6. Admin reviews dispute, provides evidence, resolves
   ↓
7. Staff can re-open if not satisfied (max 3 re-opens?)
   ↓
8. Dispute auto-closes after 30 days in Resolved state
```

### PRD Story 6.7 Requirements (Comprehensive)

From `prd.md` lines 812-833, the full acceptance criteria:

1. **Tranche Support**: Multiple payments per user ("Tranche 1", "Tranche 2")
2. **Pre-configured Amounts**: Standard payment amounts per role/tranche, ad-hoc requires justification
3. **Bulk Recording**: Filter by Role/LGA, record with Amount, Date, Description, Bank Reference, Transfer Screenshot
4. **Immutable Records**: Append-only, modifications create new versions with full history
5. **Notification**: Automated email/SMS on payment recording
6. **Dispute Mechanism**: Staff views history, clicks "Report Issue", enters comment, status → "Disputed"
7. **Dispute Resolution**: Admin sees dispute queue, provides evidence, marks resolved; staff can re-open
8. **Audit & Controls**: All actions logged immutably; no self-payment recording (requires secondary admin)

### Existing Infrastructure to Build On

| Component | Location | Relevance |
|-----------|----------|-----------|
| User bank details | `apps/api/src/db/schema/users.ts` (bankName, accountNumber, accountName) | Payment target verification |
| Temporal versioning | `apps/api/src/db/schema/productivity-targets.ts` | Pattern for immutable payment records |
| AuditService | `apps/api/src/services/audit.service.ts` | Add payment-specific action types |
| ExportService | `apps/api/src/services/export.service.ts` | Payment history PDF/CSV exports |
| ID Card Service | `apps/api/src/services/id-card.service.ts` | PDFKit patterns, brand styling |
| EmailService + Resend provider | `apps/api/src/services/email.service.ts`, `queues/email.queue.ts`, `workers/email.worker.ts` | Email delivery via provider pattern (NOT Nodemailer) |
| Socket.io messaging | `apps/api/src/realtime/` (Story 4.2) | In-app notification delivery |
| BullMQ jobs | `apps/api/src/queues/`, `apps/api/src/workers/` (Story 3.4, snapshots) | Async notification queue |
| Assessor state machine | `_bmad-output/implementation-artifacts/prep-6-assessor-workflow-state-machine-design.md` | Dispute lifecycle patterns |
| Daily snapshots | `apps/api/src/db/schema/daily-productivity-snapshots.ts` | Nightly BullMQ job pattern |

### Key Design Decisions to Research

**1. File Storage for Receipts/Evidence:**

| Strategy | Mechanism | Pros | Cons |
|----------|-----------|------|------|
| Filesystem | `uploads/` directory on VPS | Simple, fast, large file support | Not in DB backups, manual backup needed |
| PostgreSQL bytea | Binary column in DB | Included in DB backups, transactional | Bloats DB, slow for large files |
| DigitalOcean Spaces | S3-compatible object storage | Scalable, CDN, separate from app | Additional cost, new dependency, API complexity |

**2. Dispute State Machine:**

```
Active ──[staff: report_issue]──→ Disputed
Disputed ──[admin: acknowledge]──→ PendingResolution
PendingResolution ──[admin: resolve(evidence)]──→ Resolved
Resolved ──[staff: reopen(comment)]──→ Reopened
Reopened ──[admin: resolve(evidence)]──→ Resolved
Resolved ──[auto: 30 days]──→ Closed
```

**3. Temporal Versioning for Payment Records:**

Following `productivity_targets` pattern:
- Never UPDATE payment_records rows
- To correct: set `effectiveUntil = NOW()` on old, INSERT new with `effectiveFrom = NOW()`
- Query active records: `WHERE effectiveUntil IS NULL`
- Query full history: `ORDER BY effectiveFrom DESC`
- Partial unique index: one active record per (userId, batchId)

**4. Notification Integration:**

- **Email**: Existing Resend provider via `EmailService` (`apps/api/src/services/email.service.ts`) + BullMQ `email-notification` queue (`apps/api/src/queues/email.queue.ts`). Uses provider pattern — add new email type to `EmailService`, queue via `email.queue.ts`, process in `email.worker.ts`.
- **In-app**: Socket.io infrastructure (Story 4.2 messaging)
- **SMS**: No existing provider — recommend deferring to optional future story
- **Queue**: BullMQ `remuneration-notifications` queue (follows existing pattern from Story 3.4)

### Proposed Schema Sketch

```typescript
// payment_batches — one per bulk recording action
export const paymentBatches = pgTable('payment_batches', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  trancheNumber: integer('tranche_number').notNull(),
  trancheName: text('tranche_name').notNull(), // "Tranche 1 - February 2026"
  description: text('description'),
  bankReference: text('bank_reference'),
  receiptFileId: uuid('receipt_file_id'), // FK → payment_files
  lgaId: text('lga_id'), // scope filter (NULL = all LGAs)
  roleFilter: text('role_filter'), // 'enumerator', 'supervisor', etc.
  staffCount: integer('staff_count').notNull(), // number of staff in batch
  totalAmount: bigint('total_amount', { mode: 'number' }).notNull(), // in kobo; bigint for future-proofing
  justification: text('justification'), // REQUIRED when amount differs from configured standard
  recordedBy: uuid('recorded_by').notNull(), // FK → users (admin)
  status: text('status', { enum: ['active', 'corrected'] }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// payment_records — one per staff member per batch
export const paymentRecords = pgTable('payment_records', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  batchId: uuid('batch_id').notNull(), // FK → payment_batches
  userId: uuid('user_id').notNull(), // FK → users (staff receiving payment)
  amount: integer('amount').notNull(), // in kobo
  status: text('status', { enum: ['active', 'disputed', 'corrected'] }).notNull().default('active'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }), // NULL = current version
  createdBy: uuid('created_by').notNull(), // FK → users (admin)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// payment_disputes — dispute lifecycle per payment record
export const paymentDisputes = pgTable('payment_disputes', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  paymentRecordId: uuid('payment_record_id').notNull(), // FK → payment_records
  status: text('status', { enum: ['disputed', 'pending_resolution', 'resolved', 'reopened', 'closed'] }).notNull().default('disputed'),
  staffComment: text('staff_comment').notNull(), // initial complaint
  adminResponse: text('admin_response'), // latest resolution
  commentHistory: jsonb('comment_history').notNull().default([]), // structured dispute conversation trail
  evidenceFileId: uuid('evidence_file_id'), // FK → payment_files
  openedBy: uuid('opened_by').notNull(), // FK → users (staff)
  resolvedBy: uuid('resolved_by'), // FK → users (admin)
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  reopenCount: integer('reopen_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});

// payment_files — receipt uploads and dispute evidence
export const paymentFiles = pgTable('payment_files', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  entityType: text('entity_type', { enum: ['receipt', 'dispute_evidence'] }).notNull(),
  entityId: uuid('entity_id').notNull(), // FK → payment_batches or payment_disputes
  originalFilename: text('original_filename').notNull(),
  storedPath: text('stored_path').notNull(), // S3 key: payment-files/{entityType}/{entityId}/{uuid}.{ext}
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(), // FK → users
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});
```

### Bank Details Consideration

The `users` table already has `bankName`, `accountNumber`, `accountName` fields. However:
- Back-office roles (Super Admin, Assessor, Official) skip bank details during profile completion (prep-8 role-based activation wizard)
- Field staff (Enumerator, Supervisor) complete full profile including bank details
- **For remuneration**: Staff must have bank details to receive payment → may need validation before inclusion in payment batch
- **Not in this spike's scope**: Whether to require bank detail completion before payment recording (design decision for Story 6-4 implementation)

### Project Structure Notes

- Spike output: `_bmad-output/implementation-artifacts/prep-5-remuneration-domain-modeling-summary.md`
- No frontend changes needed for this spike
- No production code changes — research only
- Future schema location: `apps/api/src/db/schema/remuneration.ts` (new file)
- Future service location: `apps/api/src/services/remuneration.service.ts` (new file)
- Future controller location: `apps/api/src/controllers/remuneration.controller.ts` (new file)
- Future routes location: `apps/api/src/routes/remuneration.routes.ts` (new file)

### Testing Standards

- This is a research spike — no production code tests needed
- Schema code samples should be syntactically valid Drizzle ORM code
- State machine transitions should include testable assertions for Story 6-5/6-6 implementation
- API endpoint designs should include expected response shapes and error codes

### Spike Document Template

The output document should follow this structure:
1. Executive Summary
2. Scoping Decision (record-keeping only, rationale)
3. Domain Model (entity relationship diagram, ASCII)
4. Schema Design (Drizzle code samples for all tables)
5. Dispute State Machine (states, transitions, role authorization matrix)
6. File Storage Design (comparison + recommendation)
7. Notification System (events, channels, BullMQ integration)
8. Admin Controls (self-payment prevention, configured amounts, bulk workflow)
9. API Endpoint Design (routes, request/response shapes)
10. Integration Roadmap (AuditService, ExportService, dashboards)
11. Scale Projections & Index Strategy
12. Story Implementation Checklist (6-4, 6-5, 6-6 breakdown)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#L812-833] — Story 6.7 comprehensive requirements
- [Source: _bmad-output/planning-artifacts/epics.md#L1863-1900] — Stories 6-4, 6-5, 6-6 acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#L478] — Payment Records data dictionary entry
- [Source: _bmad-output/implementation-artifacts/epic-5-retro-2026-02-24.md#L169-189] — Remuneration scoping decision
- [Source: _bmad-output/implementation-artifacts/epic-5-retro-2026-02-24.md#L156-165] — Super Admin governance requirements
- [Source: apps/api/src/db/schema/users.ts] — Bank details fields (bankName, accountNumber, accountName)
- [Source: apps/api/src/db/schema/productivity-targets.ts] — Temporal versioning pattern
- [Source: apps/api/src/db/schema/daily-productivity-snapshots.ts] — BullMQ nightly job pattern
- [Source: apps/api/src/services/audit.service.ts] — AuditService (fire-and-forget + transactional modes)
- [Source: apps/api/src/services/export.service.ts] — ExportService (PDF/CSV generation, Oyo branding)
- [Source: apps/api/src/services/id-card.service.ts] — PDFKit patterns (QR codes, brand styling)
- [Source: _bmad-output/implementation-artifacts/prep-6-assessor-workflow-state-machine-design.md] — State machine design patterns
- [Source: _bmad-output/implementation-artifacts/prep-2-lightweight-audit-logging-pii-access.md] — AuditService original story
- [Source: _bmad-output/implementation-artifacts/prep-4-immutable-audit-log-spike.md] — Audit log immutability requirements (parallel spike)

### Previous Story Intelligence

**From prep-4-immutable-audit-log-spike (previous prep task):**
- Research spike for immutable audit logging — complementary to this spike
- Hash chaining, write-once enforcement, partitioning designs will apply to payment records audit trail
- Story 6-1 (immutable audit logs) should be implemented BEFORE Stories 6-4/6-5/6-6 so payment actions can use the hardened AuditService

**From prep-3-fix-fraud-thresholds-sidebar-data (previous prep task):**
- Seed data gap discovery pattern — new `payment_amounts_config` table will need seed data for default tranche amounts
- Sidebar config pattern — remuneration section will need nav items added to sidebarConfig.ts

**From prep-epic-5/prep-6 (Assessor Workflow State Machine):**
- State machine patterns: role-based transition matrix, terminal states, concurrent review handling
- Directly applicable to dispute lifecycle design
- Processing error states and backward compatibility considerations relevant

### Git Intelligence

Recent commits are Epic 5 completions and prep-1 fix:
- `ab03648 fix(web,api): fix CI build errors` — latest
- `328ad63 fix(web): fix ExportPage LGA race condition + code review fixes (prep-1)` — bug fix pattern
- `bd5a443 docs: complete Epic 5 retrospective and define Epic 6 prep phase` — retro defining this spike
- `92f8a2b fix(api,web): use dynamic productivity targets across all dashboards` — shows temporal versioning pattern in action

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Loaded and analyzed 8+ reference files: users.ts, productivity-targets.ts, audit.service.ts, export.service.ts, email.service.ts, email.queue.ts, email.worker.ts, photo-processing.service.ts, questionnaires.ts, prep-6 state machine, prep-4 audit log spike
- Verified existing S3 client (PhotoProcessingService) supports receipt uploads via PutObjectCommand/GetObjectCommand
- Confirmed email infrastructure uses Resend provider pattern (not Nodemailer as originally assumed in story)
- Confirmed bytea pattern exists in questionnaire_files but S3 is preferred for payment files (larger, separate from DB backups)
- Verified Socket.io room patterns from Story 4.2 messaging infrastructure support remuneration notifications

### Completion Notes List

- **Task 1 (Schema Design):** Designed 5 tables: `payment_batches`, `payment_records`, `payment_amounts_config`, `payment_disputes`, `payment_files`. Reused productivity_targets temporal versioning pattern (effectiveFrom/effectiveUntil). Amounts stored in kobo (integer). Partial unique indexes enforce one active record per user/batch and one active dispute per record. Full Drizzle schema code samples included.
- **Task 2 (Dispute State Machine):** Defined 5 dispute states + 6 transitions. Explicit status column (not derived like assessor workflow) — simpler lifecycle maps directly to UI states. Max 3 reopens enforced in application logic. Comment history appended with separators. Concurrent dispute prevention via partial unique index.
- **Task 3 (File Storage):** Recommended S3 (DigitalOcean Spaces) over bytea and filesystem. Rationale: existing PhotoProcessingService S3 client reusable, separates storage from DB, signed URLs for secure delivery. Multer config: memory storage, 10MB max, PNG/JPEG/PDF whitelist. S3 key structure: `payment-files/{entityType}/{entityId}/{uuid}.{ext}`.
- **Task 4 (Notifications):** 7 notification events defined. Email via existing Resend provider + BullMQ queue. Socket.io via user rooms + new `role:super_admin` room. SMS deferred — no existing provider, low priority. `remuneration-notifications` queue follows email-notification pattern.
- **Task 5 (Admin Controls):** Self-payment middleware guard comparing `req.user.sub` against batch staffIds. Pre-configured amounts in `payment_amounts_config` with temporal versioning. Ad-hoc amounts require justification field. 5-step bulk recording workflow designed. Correction flow uses temporal versioning (close old + insert new).
- **Task 6 (Integration Plan):** 10 new audit action types defined under `PAYMENT_ACTIONS` constant. Export integration via existing ExportService PDF/CSV patterns. Dashboard routing: Staff → Payment History tab, Super Admin → Remuneration section + Disputes widget. 15 API endpoints designed with full request/response shapes. Greenfield — no backward compatibility concerns.
- **Task 7 (Scale Projections):** ~800 records/year, ~50 batches, ~40 disputes, ~70 files. All under 10K rows at 5 years. No partitioning needed. 7 indexes cover all query patterns. Storage estimate: ~350MB/year (mostly S3 files).
- **Task 8 (Spike Document):** Compiled 12-section spike document with: executive summary, scoping decision, entity relationship diagram (ASCII), Drizzle schema code for all 5 tables, dispute state machine diagram + transition rules + authorization matrix, file storage comparison + recommendation, notification event table + BullMQ/Socket.io integration, admin controls + bulk workflow, 15 API endpoints with request/response shapes, integration roadmap (AuditService/ExportService/dashboards), scale projections + index strategy, Story 6-4/6-5/6-6 implementation checklists, 3 appendices (amount formatting, seed data, auto-close cron).

### Change Log

- 2026-02-25: Created comprehensive remuneration domain modeling spike document covering schema design (5 tables), dispute state machine (6 transitions), S3 file storage, notification system (7 events), admin controls (self-payment prevention, bulk recording), 15 API endpoints, integration with AuditService/ExportService/Socket.io, and scale projections. All 7 ACs satisfied.
- 2026-02-25: **Code Review** — 9 findings (3H, 3M, 3L), all 9 fixed. H1 roleId uuid→text, H2 missing justification column added, H3 self-payment middleware JSON parse fix. M1 table count 4→5, M2 dispute comments JSONB (replaces string concat), M3 storedFilename→storedPath alignment. L1 AC4 Nodemailer→Resend, L2 trancheName added to config, L3 totalAmount integer→bigint. Spike document and story file both updated.

### File List

- `_bmad-output/implementation-artifacts/prep-5-remuneration-domain-modeling-summary.md` (NEW) — Complete spike document, 12 sections + 3 appendices
- `_bmad-output/implementation-artifacts/prep-5-remuneration-domain-modeling.md` (MODIFIED) — Story file updated with task completion, dev agent record, status → review → done (post code review)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED) — Sprint status updated: prep-5 → done

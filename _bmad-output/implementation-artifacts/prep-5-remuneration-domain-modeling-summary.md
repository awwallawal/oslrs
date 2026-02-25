# Prep 5: Remuneration Domain Modeling — Spike Summary

**Date:** 2026-02-25
**Author:** Dev Agent (Claude Opus 4.6)
**Status:** Complete
**Feeds:** Stories 6-4, 6-5, 6-6

---

## 1. Executive Summary

This spike designs the complete domain model for OSLRS staff remuneration — a **record-keeping** system (not payment processing). Payments happen externally via bank transfers; OSLRS records proof, tracks disputes, and provides audit trails.

**Key Decisions:**
- **5 new tables**: `payment_batches`, `payment_records`, `payment_amounts_config`, `payment_disputes`, `payment_files`
- **Temporal versioning** for payment records (append-only, effectiveFrom/effectiveUntil pattern from `productivity_targets`)
- **S3 storage** for receipt uploads and dispute evidence (reuse existing `PhotoProcessingService` S3 client)
- **6-state dispute lifecycle**: Disputed → PendingResolution → Resolved → Reopened → Resolved → Closed
- **BullMQ + Email** for notifications; Socket.io for in-app alerts; SMS deferred (no existing provider)
- **Self-payment prevention** via middleware guard; pre-configured amounts with ad-hoc justification
- **Scale**: ~800 payment records/year, ~50 batches/year, ~40 disputes/year — no partitioning needed
- **Amounts in kobo** (smallest Nigerian currency unit): ₦5,000 = 500,000 kobo → `integer` column

---

## 2. Scoping Decision

**Remuneration is RECORD-KEEPING ONLY** (per Awwal's direction, Epic 5 retrospective 2026-02-24):

| Aspect | In Scope | Out of Scope |
|--------|----------|--------------|
| Recording payments | Admin uploads bank transfer proof | Payment gateway integration |
| Staff notification | Email + in-app on payment recorded | Direct bank API calls |
| Payment history | Staff views records on dashboard | Auto-disbursement |
| Disputes | Staff reports issues, admin resolves | Third-party dispute mediation |
| Audit trail | All actions immutably logged | Financial reconciliation |
| Receipt storage | PDF/image upload to S3 | OCR or bank statement parsing |

**Rationale:** OSLRS operates in a government context where payments are disbursed via existing banking channels. The application's role is transparency and accountability — ensuring staff can verify payments and escalate discrepancies.

---

## 3. Domain Model (Entity Relationship)

```
┌─────────────────────┐     ┌──────────────────────────┐
│  payment_amounts_    │     │     payment_batches       │
│  config              │     │                          │
│ ─────────────────── │     │ id (UUID v7, PK)         │
│ id (UUID v7, PK)    │     │ trancheNumber (INT)      │
│ roleId (TEXT)        │     │ trancheName (TEXT)       │
│ trancheNumber (INT) │     │ description (TEXT)       │
│ standardAmount (INT)│     │ bankReference (TEXT)     │
│ effectiveFrom (TS)  │     │ receiptFileId (FK→files) │
│ effectiveUntil (TS) │     │ lgaId (TEXT)             │
│ createdBy (FK→users)│     │ roleFilter (TEXT)        │
│ createdAt (TS)      │     │ staffCount (INT)         │
│                     │     │ totalAmount (INT, kobo)  │
└─────────────────────┘     │ recordedBy (FK→users)    │
                            │ status (ENUM)            │
                            │ createdAt (TS)           │
                            └──────────┬───────────────┘
                                       │ 1:N
                                       ▼
┌─────────────────────┐     ┌──────────────────────────┐
│   payment_files      │     │    payment_records        │
│ ─────────────────── │     │                          │
│ id (UUID v7, PK)    │     │ id (UUID v7, PK)         │
│ entityType (ENUM)   │◄────│ batchId (FK→batches)     │
│ entityId (UUID)     │     │ userId (FK→users)        │
│ originalFilename    │     │ amount (INT, kobo)       │
│ storedPath (TEXT)   │     │ status (ENUM)            │
│ mimeType (TEXT)     │     │ effectiveFrom (TS)       │
│ sizeBytes (INT)     │     │ effectiveUntil (TS)      │
│ uploadedBy (FK)     │     │ createdBy (FK→users)     │
│ createdAt (TS)      │     │ createdAt (TS)           │
│                     │     └──────────┬───────────────┘
└─────────────────────┘                │ 1:1 (active)
         ▲                             ▼
         │              ┌──────────────────────────┐
         │              │   payment_disputes         │
         │              │                          │
         └──────────────│ id (UUID v7, PK)         │
        evidenceFileId  │ paymentRecordId (FK)     │
                        │ status (ENUM)            │
                        │ staffComment (TEXT)      │
                        │ adminResponse (TEXT)     │
                        │ evidenceFileId (FK→files)│
                        │ openedBy (FK→users)      │
                        │ resolvedBy (FK→users)    │
                        │ resolvedAt (TS)          │
                        │ reopenCount (INT)        │
                        │ createdAt (TS)           │
                        │ updatedAt (TS)           │
                        └──────────────────────────┘
```

**Relationships:**
- `payment_batches` 1:N `payment_records` (one batch per bulk recording, one record per staff member)
- `payment_records` 1:1 `payment_disputes` (one active dispute per active record)
- `payment_files` polymorphic via `entityType` + `entityId` (receipts → batches, evidence → disputes)
- `users` referenced by: `recordedBy`, `userId`, `createdBy`, `openedBy`, `resolvedBy`, `uploadedBy`

---

## 4. Schema Design (Drizzle Code Samples)

### 4.1 payment_batches

```typescript
import { pgTable, uuid, integer, text, timestamp, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from '@oslsr/types';
import { users } from './users';

export const paymentBatchStatusEnum = ['active', 'corrected'] as const;
export type PaymentBatchStatus = (typeof paymentBatchStatusEnum)[number];

export const paymentBatches = pgTable('payment_batches', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  trancheNumber: integer('tranche_number').notNull(),
  trancheName: text('tranche_name').notNull(), // e.g. "Tranche 1 - February 2026"
  description: text('description'),
  bankReference: text('bank_reference'),
  receiptFileId: uuid('receipt_file_id'), // FK → payment_files (nullable, receipt optional)
  lgaId: text('lga_id'), // scope filter (NULL = all LGAs)
  roleFilter: text('role_filter'), // 'enumerator', 'supervisor', etc.
  staffCount: integer('staff_count').notNull(), // number of staff in this batch
  totalAmount: bigint('total_amount', { mode: 'number' }).notNull(), // in kobo (₦1 = 100 kobo); bigint for future-proofing
  justification: text('justification'), // REQUIRED when amount differs from configured standard (audit trail)
  recordedBy: uuid('recorded_by').notNull().references(() => users.id),
  status: text('status', { enum: paymentBatchStatusEnum }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  recordedByIdx: index('idx_payment_batches_recorded_by').on(table.recordedBy),
  statusIdx: index('idx_payment_batches_status').on(table.status),
  createdAtIdx: index('idx_payment_batches_created_at').on(table.createdAt),
}));

export type PaymentBatch = typeof paymentBatches.$inferSelect;
export type NewPaymentBatch = typeof paymentBatches.$inferInsert;
```

### 4.2 payment_records (Temporal Versioning)

```typescript
import { pgTable, uuid, integer, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { uuidv7 } from '@oslsr/types';
import { users } from './users';
import { paymentBatches } from './remuneration'; // same file

export const paymentRecordStatusEnum = ['active', 'disputed', 'corrected'] as const;
export type PaymentRecordStatus = (typeof paymentRecordStatusEnum)[number];

export const paymentRecords = pgTable('payment_records', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  batchId: uuid('batch_id').notNull().references(() => paymentBatches.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  amount: integer('amount').notNull(), // in kobo
  status: text('status', { enum: paymentRecordStatusEnum }).notNull().default('active'),
  // Temporal versioning (follows productivity_targets pattern)
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }), // NULL = currently active version
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Staff payment history: find all active records for a user
  userActiveIdx: index('idx_payment_records_user_active')
    .on(table.userId, table.effectiveUntil),
  // Batch detail: find all records in a batch
  batchIdx: index('idx_payment_records_batch').on(table.batchId),
  // Enforce one active record per user per batch (partial unique index)
  uniqueActiveUserBatch: uniqueIndex('uq_payment_records_active_user_batch')
    .on(table.userId, table.batchId)
    .where(sql`effective_until IS NULL`),
}));

export type PaymentRecord = typeof paymentRecords.$inferSelect;
export type NewPaymentRecord = typeof paymentRecords.$inferInsert;
```

**Temporal Versioning Rules:**
- **Never UPDATE** a `payment_records` row directly
- **To correct:** Within a transaction: (1) set `effectiveUntil = NOW()` on old record, (2) INSERT new record with `effectiveFrom = NOW()`, same `batchId`/`userId`
- **Query active records:** `WHERE effectiveUntil IS NULL`
- **Query full history:** `ORDER BY effectiveFrom DESC`
- **Partial unique index** ensures exactly one active record per (userId, batchId)

### 4.3 payment_amounts_config (Pre-configured Amounts)

```typescript
export const paymentAmountsConfig = pgTable('payment_amounts_config', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  roleId: text('role_id').notNull(), // role string constant: 'enumerator', 'supervisor', etc.
  trancheNumber: integer('tranche_number').notNull(),
  trancheName: text('tranche_name'), // optional canonical name: "Tranche 1 - February 2026"
  standardAmount: integer('standard_amount').notNull(), // in kobo
  // Temporal versioning (same pattern as productivity_targets)
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }), // NULL = currently active
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // One active config per role+tranche
  uniqueActiveRoleTranche: uniqueIndex('uq_payment_amounts_active_role_tranche')
    .on(table.roleId, table.trancheNumber)
    .where(sql`effective_until IS NULL`),
}));

export type PaymentAmountsConfig = typeof paymentAmountsConfig.$inferSelect;
export type NewPaymentAmountsConfig = typeof paymentAmountsConfig.$inferInsert;
```

### 4.4 payment_disputes

```typescript
export const paymentDisputeStatusEnum = [
  'disputed',
  'pending_resolution',
  'resolved',
  'reopened',
  'closed',
] as const;
export type PaymentDisputeStatus = (typeof paymentDisputeStatusEnum)[number];

export const paymentDisputes = pgTable('payment_disputes', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  paymentRecordId: uuid('payment_record_id').notNull().references(() => paymentRecords.id),
  status: text('status', { enum: paymentDisputeStatusEnum }).notNull().default('disputed'),
  staffComment: text('staff_comment').notNull(), // initial complaint text
  adminResponse: text('admin_response'), // latest resolution explanation
  commentHistory: jsonb('comment_history').$type<DisputeComment[]>().notNull().default([]), // structured conversation trail
  evidenceFileId: uuid('evidence_file_id'), // FK → payment_files (resolution evidence)
  openedBy: uuid('opened_by').notNull().references(() => users.id), // staff who opened
  resolvedBy: uuid('resolved_by').references(() => users.id), // admin who resolved
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  reopenCount: integer('reopen_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Admin dispute queue: filter by open statuses
  statusIdx: index('idx_payment_disputes_status').on(table.status),
  // Link to payment record
  paymentRecordIdx: index('idx_payment_disputes_record').on(table.paymentRecordId),
  // One active dispute per payment record (prevent duplicate disputes)
  uniqueActiveDispute: uniqueIndex('uq_payment_disputes_active_record')
    .on(table.paymentRecordId)
    .where(sql`status NOT IN ('resolved', 'closed')`),
}));

export type PaymentDispute = typeof paymentDisputes.$inferSelect;
export type NewPaymentDispute = typeof paymentDisputes.$inferInsert;
```

### 4.5 payment_files

```typescript
export const paymentFileEntityTypeEnum = ['receipt', 'dispute_evidence'] as const;
export type PaymentFileEntityType = (typeof paymentFileEntityTypeEnum)[number];

export const paymentFiles = pgTable('payment_files', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  entityType: text('entity_type', { enum: paymentFileEntityTypeEnum }).notNull(),
  entityId: uuid('entity_id').notNull(), // FK → payment_batches (receipt) or payment_disputes (evidence)
  originalFilename: text('original_filename').notNull(),
  storedPath: text('stored_path').notNull(), // S3 key: payment-files/{entityType}/{entityId}/{uuid}.{ext}
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  entityIdx: index('idx_payment_files_entity').on(table.entityType, table.entityId),
}));

export type PaymentFile = typeof paymentFiles.$inferSelect;
export type NewPaymentFile = typeof paymentFiles.$inferInsert;
```

**All tables location:** `apps/api/src/db/schema/remuneration.ts` (new file)

---

## 5. Dispute State Machine

### 5.1 State Definitions

| State | Description | Entry Condition | Terminal? |
|-------|-------------|-----------------|-----------|
| `disputed` | Staff reports payment issue | Staff clicks "Report Issue" | No |
| `pending_resolution` | Admin acknowledges, begins investigation | Admin clicks "Acknowledge" | No |
| `resolved` | Admin provides resolution evidence | Admin submits response + optional evidence | No |
| `reopened` | Staff unsatisfied, re-reports issue | Staff clicks "Reopen" with comment | No |
| `closed` | Dispute finalized (auto or manual) | 30 days after resolution OR staff confirms | **Yes** |

### 5.2 State Transition Diagram

```
                    ┌─────────┐
                    │  Active  │  (payment_records.status)
                    │  Record  │
                    └────┬─────┘
                         │ staff: report_issue(comment)
                         ▼
                    ┌──────────┐
              ┌────▶│ Disputed │
              │     └────┬─────┘
              │          │ admin: acknowledge()
              │          ▼
              │     ┌────────────────────┐
              │     │ PendingResolution   │
              │     └────┬───────────────┘
              │          │ admin: resolve(response, evidence?)
              │          ▼
              │     ┌──────────┐   auto: 30 days   ┌────────┐
              │     │ Resolved │──────────────────▶│ Closed  │
              │     └────┬─────┘                   └─────────┘
              │          │ staff: reopen(comment)        ▲
              │          ▼                              │
              │     ┌──────────┐                        │
              │     │ Reopened  │   (max 3 reopens)     │
              │     └────┬─────┘                        │
              │          │ admin: resolve(response, evidence?)
              │          │                              │
              │          └──────────► Resolved ─────────┘
              │
              └── (reopened disputes loop back through resolve)
```

### 5.3 Transition Rules

| # | From | To | Actor | Condition | Action |
|---|------|----|-------|-----------|--------|
| T1 | (active record) | `disputed` | Staff (record owner) | `record.status == 'active'` AND `record.effectiveUntil IS NULL` AND no active dispute exists | Create `payment_disputes` row, set `record.status = 'disputed'` |
| T2 | `disputed` | `pending_resolution` | Super Admin | `dispute.status == 'disputed'` | Update status, set `updatedAt` |
| T3 | `pending_resolution` | `resolved` | Super Admin | `dispute.status == 'pending_resolution'` AND `adminResponse` provided | Update status, set `resolvedBy`, `resolvedAt`, optional `evidenceFileId` |
| T4 | `resolved` | `reopened` | Staff (original opener) | `dispute.status == 'resolved'` AND `dispute.openedBy == actor` AND `reopenCount < 3` | Update status, increment `reopenCount`, append comment to `staffComment` |
| T5 | `reopened` | `resolved` | Super Admin | `dispute.status == 'reopened'` AND `adminResponse` provided | Update status, set `resolvedBy`, `resolvedAt`, optional new evidence |
| T6 | `resolved` | `closed` | System (cron) | `dispute.status == 'resolved'` AND `resolvedAt < NOW() - 30 days` | Update status, set `updatedAt`. No notification. |

### 5.4 Role-Based Authorization Matrix

| Action | Super Admin | Enumerator | Supervisor | System |
|--------|-------------|------------|------------|--------|
| Open dispute (T1) | - | Own records only | Own records only | - |
| Acknowledge (T2) | Yes | - | - | - |
| Resolve (T3, T5) | Yes | - | - | - |
| Reopen (T4) | - | Own disputes only | Own disputes only | - |
| Auto-close (T6) | - | - | - | Cron job |
| View all disputes | Yes | - | - | - |
| View own disputes | - | Yes | Yes | - |

### 5.5 Edge Cases

**Concurrent dispute on same record:** Prevented by partial unique index `uq_payment_disputes_active_record` — only one non-resolved/non-closed dispute per payment record.

**Dispute on corrected record:** If admin corrects a record (temporal versioning close + new insert), the old record's dispute remains attached. The new active record starts clean. Staff can open a new dispute on the new record if still unsatisfied.

**Dispute after batch correction:** If the entire batch is corrected (batch status → `corrected`), existing disputes remain visible but no new disputes can be opened on corrected records (enforce `record.effectiveUntil IS NULL` check).

**Max reopens:** `reopenCount` capped at 3. After 3 reopens, staff must contact support directly. Enforced in application logic.

**Comment history:** Use a JSONB array column `commentHistory` for structured, parseable dispute conversation trail:

```typescript
// Column in payment_disputes schema:
commentHistory: jsonb('comment_history').$type<DisputeComment[]>().notNull().default([]),

// Type definition:
interface DisputeComment {
  type: 'open' | 'reopen' | 'admin_response';
  comment: string;
  userId: string;
  createdAt: string; // ISO 8601
}
```

This replaces the original string-concatenation approach (`staffComment` with `\n---\n` separators) which made it impossible to programmatically distinguish original vs. reopened comments. JSONB enables structured rendering in UI, clean exports, and avoids text injection via separator characters. The `staffComment` column retains the initial complaint text; `commentHistory` captures the full conversation trail.

### 5.6 Comparison with Assessor State Machine (prep-6)

| Aspect | Assessor Workflow | Dispute Lifecycle |
|--------|-------------------|-------------------|
| State storage | Derived from DB fields at query time | Stored as explicit `status` column |
| Terminal states | `FINAL_APPROVED`, `FINAL_REJECTED` | `closed` |
| Reopening | Not allowed (terminal is final) | Allowed up to 3 times |
| Concurrent access | Last-write-wins with timestamps | Partial unique index prevents duplicates |
| Automation | Fraud engine scoring (system) | Auto-close cron (system) |

**Design decision:** Explicit status column (not derived) is chosen for disputes because the lifecycle is simpler and the status directly maps to user-facing UI states. The assessor workflow's derived approach suits its more complex multi-field state derivation.

---

## 6. File Storage Design

### 6.1 Comparison

| Strategy | Mechanism | Pros | Cons | Verdict |
|----------|-----------|------|------|---------|
| **S3 (DO Spaces)** | Reuse `PhotoProcessingService` S3 client | Already configured, scalable, separate from DB, CDN-ready | Additional storage cost (~$5/mo for projected volume) | **Recommended** |
| PostgreSQL bytea | Binary column per `questionnaire_files` pattern | Included in DB backups, transactional | DB bloat, slow for large files, backup size increase | Not recommended |
| Filesystem | `uploads/` directory on VPS | Simplest, zero cost | Not in DB backups, manual backup needed, single server | Not recommended |

### 6.2 Recommendation: S3 (DigitalOcean Spaces)

**Rationale:**
- `PhotoProcessingService` already has a working S3 client with `PutObjectCommand`/`GetObjectCommand`/signed URL generation
- Receipt files (bank transfer screenshots) are typically 100KB-5MB — similar to selfie photos
- S3 separates file storage from DB, keeping backups lean
- Signed URLs provide time-limited secure access without exposing S3 credentials
- CDN endpoint available for fast delivery if needed

**S3 Key Structure:**
```
payment-files/
  receipts/{batchId}/{uuid}.{ext}        # batch receipt uploads
  dispute-evidence/{disputeId}/{uuid}.{ext}  # dispute evidence uploads
```

### 6.3 Upload API Design

**Multer middleware** (new file: `apps/api/src/middleware/payment-upload.middleware.ts`):

```typescript
import multer from 'multer';

export const paymentFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, and PDF files are allowed'));
    }
  },
});
```

### 6.4 Retrieval API Design

**Endpoint:** `GET /api/payment-files/:fileId`

```typescript
// Controller pattern
static async downloadFile(req: AuthenticatedRequest, res: Response) {
  const { fileId } = req.params;
  const file = await db.select().from(paymentFiles).where(eq(paymentFiles.id, fileId)).limit(1);
  if (!file[0]) throw new AppError('NOT_FOUND', 'File not found', 404);

  // Authorization: verify actor has access to the parent entity
  // (batch recorded by them, or dispute they opened/are resolving)

  const signedUrl = await photoService.getSignedUrl(file[0].storedPath);
  res.redirect(signedUrl); // 302 redirect to time-limited S3 URL
}
```

**Alternative:** Return signed URL in JSON response for frontend to handle. Redirect is simpler for direct browser downloads.

---

## 7. Notification System

### 7.1 Event Definitions

| Event | Trigger | Recipients | Channels |
|-------|---------|------------|----------|
| `payment.recorded` | Batch created successfully | All staff in batch | Email + Socket.io |
| `payment.corrected` | Record corrected by admin | Affected staff member | Email + Socket.io |
| `dispute.opened` | Staff opens dispute | All Super Admins | Email + Socket.io |
| `dispute.acknowledged` | Admin acknowledges dispute | Staff who opened | Socket.io only |
| `dispute.resolved` | Admin resolves dispute | Staff who opened | Email + Socket.io |
| `dispute.reopened` | Staff reopens dispute | All Super Admins | Email + Socket.io |
| `dispute.auto_closed` | 30-day auto-close | None | None (silent) |

### 7.2 BullMQ Integration

**Queue:** `remuneration-notifications` (new queue, follows `email-notification` pattern)

```typescript
// apps/api/src/queues/remuneration-notification.queue.ts
import { Queue } from 'bullmq';
import { getConnection } from '../config/redis';

type RemunerationNotificationJob =
  | { type: 'payment-recorded'; batchId: string; staffIds: string[] }
  | { type: 'payment-corrected'; recordId: string; userId: string }
  | { type: 'dispute-opened'; disputeId: string; staffName: string }
  | { type: 'dispute-resolved'; disputeId: string; userId: string }
  | { type: 'dispute-reopened'; disputeId: string; staffName: string };

const queue = new Queue<RemunerationNotificationJob>('remuneration-notifications', {
  connection: getConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'custom' },
    removeOnComplete: { age: 3600, count: 500 },
    removeOnFail: { age: 24 * 3600 },
  },
});
```

**Worker** processes jobs by dispatching to `EmailService` for emails and `io.to()` for Socket.io:

```typescript
// Worker pattern (follows email.worker.ts)
const worker = new Worker<RemunerationNotificationJob>(
  'remuneration-notifications',
  async (job) => {
    switch (job.data.type) {
      case 'payment-recorded':
        // For each staffId: queue individual email via existing email queue
        // Emit Socket.io to each user room
        break;
      case 'dispute-opened':
        // Email all Super Admins
        // Emit Socket.io to super-admin room
        break;
      // ... etc.
    }
  },
  { connection, concurrency: 5 }
);
```

### 7.3 Email Templates

**Payment Recorded Email:**
```
Subject: [OSLRS] Payment Recorded — {trancheName}

Dear {staffName},

A payment has been recorded for your account:

  Amount: ₦{formattedAmount}
  Tranche: {trancheName}
  Date: {date}
  Bank Reference: {bankReference || 'N/A'}

You can view your payment history on your OSLRS dashboard.

If you believe this is incorrect, you can report an issue from your Payment History page.

— Oyo State Labour & Skills Registry
```

**Dispute Resolved Email:**
```
Subject: [OSLRS] Payment Dispute Resolved — {trancheName}

Dear {staffName},

Your payment dispute has been resolved:

  Payment: {trancheName} — ₦{formattedAmount}
  Resolution: {adminResponse}

If you are not satisfied with this resolution, you can reopen the dispute from your Payment History page within 30 days.

— Oyo State Labour & Skills Registry
```

### 7.4 Socket.io Integration

Leverages existing infrastructure from Story 4.2:

```typescript
// Emit to specific user
io.to(`user:${staffId}`).emit('remuneration:payment-recorded', {
  batchId, trancheName, amount, date,
});

// Emit to all Super Admins (new room pattern)
io.to('role:super_admin').emit('remuneration:dispute-opened', {
  disputeId, staffName, trancheName, amount,
});
```

**New Socket.io room:** `role:super_admin` — all connected Super Admins join this room on connection. This enables broadcasting dispute notifications without querying for individual Super Admin user IDs.

### 7.5 SMS Evaluation

| Aspect | Assessment |
|--------|------------|
| Existing provider | None — email uses Resend (API provider, not SMS) |
| Options | Twilio, Africa's Talking, Termii (Nigeria-focused) |
| Cost | ~₦3-5 per SMS (~$0.003-0.005) × 800 notifications/year = ~$4/year |
| Recommendation | **Defer** — low priority given email + in-app notifications cover the need. Add as optional future story if stakeholder demand emerges. |

---

## 8. Admin Controls

### 8.1 Self-Payment Prevention

```typescript
// Middleware guard in remuneration.routes.ts
// NOTE: With multipart/form-data (multer), req.body.staffIds is a JSON string, not a parsed array.
// Parse it before checking. Place this middleware AFTER multer processes the request.
function preventSelfPayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const rawStaffIds = req.body.staffIds;
  const staffIds: string[] = typeof rawStaffIds === 'string' ? JSON.parse(rawStaffIds) : rawStaffIds;
  if (staffIds.includes(req.user.sub)) {
    throw new AppError(
      'SELF_PAYMENT_FORBIDDEN',
      'Cannot record payment to yourself. Another Super Admin must record your payment.',
      403
    );
  }
  next();
}
```

**Scope:** Applies to `POST /api/payment-batches` (bulk record endpoint). The admin creating the batch cannot be in the list of staff receiving payment.

**Edge case:** If there's only one Super Admin and they need payment recorded, this must be handled outside the system (manual DB entry by system administrator) or by temporarily promoting another admin. This is an acceptable operational constraint for fraud prevention.

### 8.2 Pre-configured Payment Amounts

**`payment_amounts_config` table** stores standard amounts per role per tranche:

```
Role: Enumerator, Tranche 1 → ₦5,000 (500,000 kobo)
Role: Enumerator, Tranche 2 → ₦7,500 (750,000 kobo)
Role: Supervisor, Tranche 1 → ₦10,000 (1,000,000 kobo)
Role: Supervisor, Tranche 2 → ₦12,500 (1,250,000 kobo)
```

**Admin UI flow:**
1. Super Admin navigates to "Remuneration Settings" (under system configuration)
2. Views current amounts per role/tranche
3. Can update amounts — creates new version (temporal versioning), old version closed
4. Active amounts used as defaults during bulk recording

### 8.3 Ad-Hoc Amount Flow

When the amount entered during bulk recording **differs** from the configured standard:

```typescript
interface BulkRecordPayload {
  trancheNumber: number;
  trancheName: string;
  amount: number; // kobo
  bankReference?: string;
  receiptFile?: Express.Multer.File;
  staffIds: string[];
  justification?: string; // REQUIRED if amount !== standardAmount
}

// Validation
const config = await getActiveAmountConfig(roleId, trancheNumber);
if (config && payload.amount !== config.standardAmount && !payload.justification) {
  throw new AppError(
    'JUSTIFICATION_REQUIRED',
    `Amount ₦${formatNaira(payload.amount)} differs from standard ₦${formatNaira(config.standardAmount)}. Justification required.`,
    400
  );
}
```

### 8.4 Bulk Recording Workflow

```
Step 1: Select Tranche
  → Choose tranche number + name (e.g. "Tranche 2 - March 2026")
  → System loads pre-configured amount for the tranche

Step 2: Filter Staff
  → Filter by Role (Enumerator, Supervisor)
  → Filter by LGA (optional, NULL = all LGAs)
  → System shows matching active staff with bank details

Step 3: Review Selection
  → Table: Staff Name | Role | LGA | Bank Name | Account Number
  → Admin can deselect individual staff if needed
  → Warning if staff missing bank details (excluded from batch)

Step 4: Enter Batch Details
  → Amount (pre-filled from config, editable with justification)
  → Bank Reference (optional free text)
  → Description (optional free text)
  → Receipt Upload (optional PNG/JPEG/PDF, max 10MB)

Step 5: Confirm & Create
  → Summary: {N} staff × ₦{amount} = ₦{total}
  → "Confirm Payment Recording" button
  → System creates payment_batch + N payment_records in transaction
  → Upload receipt to S3 if provided
  → Queue notifications for all staff
```

### 8.5 Payment Correction Flow

**Purpose:** Admin made an error (wrong amount, wrong staff member). Creates a new version of the record.

```
1. Admin navigates to Batch Detail page
2. Clicks "Correct" on a specific payment record
3. Enters new amount (or confirms removal)
4. System (in transaction):
   a. SET old record's effectiveUntil = NOW()
   b. INSERT new record: same batchId/userId, corrected amount, effectiveFrom = NOW()
   c. Audit log: 'payment.record_corrected' with old amount, new amount
5. Staff notified of correction via email + in-app
```

---

## 9. API Endpoint Design

### 9.1 Route Summary

| Method | Endpoint | Auth | Description | Story |
|--------|----------|------|-------------|-------|
| `POST` | `/api/payment-batches` | Super Admin | Create bulk payment batch | 6-4 |
| `GET` | `/api/payment-batches` | Super Admin | List batches (paginated) | 6-4 |
| `GET` | `/api/payment-batches/:id` | Super Admin | Batch detail with records | 6-4 |
| `POST` | `/api/payment-records/:id/correct` | Super Admin | Correct a payment record | 6-4 |
| `GET` | `/api/payment-records/my-history` | Staff (self) | Staff's own payment history | 6-5 |
| `POST` | `/api/payment-disputes` | Staff (self) | Open dispute on own record | 6-5 |
| `GET` | `/api/payment-disputes/my-disputes` | Staff (self) | Staff's own disputes | 6-5 |
| `GET` | `/api/payment-disputes` | Super Admin | Dispute queue (all) | 6-6 |
| `GET` | `/api/payment-disputes/:id` | Super Admin / Owner | Dispute detail | 6-6 |
| `PATCH` | `/api/payment-disputes/:id/acknowledge` | Super Admin | Acknowledge dispute | 6-6 |
| `PATCH` | `/api/payment-disputes/:id/resolve` | Super Admin | Resolve with evidence | 6-6 |
| `PATCH` | `/api/payment-disputes/:id/reopen` | Staff (opener) | Reopen resolved dispute | 6-6 |
| `GET` | `/api/payment-files/:id` | Authorized | Download file (signed URL) | 6-4/6-6 |
| `GET` | `/api/payment-amounts-config` | Super Admin | List configured amounts | 6-4 |
| `POST` | `/api/payment-amounts-config` | Super Admin | Set/update amount config | 6-4 |

### 9.2 Request/Response Shapes

**POST /api/payment-batches** (multipart/form-data)
```typescript
// Request
{
  trancheNumber: number;
  trancheName: string;
  amount: number; // kobo
  description?: string;
  bankReference?: string;
  staffIds: string[]; // JSON stringified array in form data
  justification?: string; // required if amount !== standard
  receiptFile?: File; // multer file
}

// Response 201
{
  id: string;
  trancheNumber: number;
  trancheName: string;
  staffCount: number;
  totalAmount: number;
  status: 'active';
  createdAt: string;
}
```

**GET /api/payment-records/my-history**
```typescript
// Query params: ?page=1&limit=20&status=active
// Response 200
{
  data: Array<{
    id: string;
    batchId: string;
    trancheName: string;
    amount: number; // kobo
    status: 'active' | 'disputed' | 'corrected';
    bankReference: string | null;
    effectiveFrom: string;
    effectiveUntil: string | null;
    hasActiveDispute: boolean;
    createdAt: string;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
```

**POST /api/payment-disputes**
```typescript
// Request
{
  paymentRecordId: string;
  comment: string; // min 10 chars
}

// Response 201
{
  id: string;
  paymentRecordId: string;
  status: 'disputed';
  staffComment: string;
  createdAt: string;
}
```

**PATCH /api/payment-disputes/:id/resolve** (multipart/form-data)
```typescript
// Request
{
  adminResponse: string; // required, min 10 chars
  evidenceFile?: File; // optional multer file
}

// Response 200
{
  id: string;
  status: 'resolved';
  adminResponse: string;
  resolvedBy: string;
  resolvedAt: string;
  evidenceFileId: string | null;
}
```

### 9.3 Error Codes

| Code | HTTP | Context |
|------|------|---------|
| `SELF_PAYMENT_FORBIDDEN` | 403 | Admin attempted to include self in payment batch |
| `JUSTIFICATION_REQUIRED` | 400 | Ad-hoc amount without justification |
| `RECORD_NOT_FOUND` | 404 | Payment record doesn't exist |
| `RECORD_NOT_ACTIVE` | 400 | Attempting to dispute a corrected/already-disputed record |
| `NOT_RECORD_OWNER` | 403 | Staff trying to dispute another user's record |
| `DISPUTE_NOT_FOUND` | 404 | Dispute doesn't exist |
| `INVALID_TRANSITION` | 400 | Invalid state transition (e.g. resolve a closed dispute) |
| `MAX_REOPENS_REACHED` | 400 | Dispute reopened 3 times already |
| `NOT_DISPUTE_OWNER` | 403 | Staff trying to reopen someone else's dispute |
| `MISSING_BANK_DETAILS` | 400 | Staff in batch missing bank details |
| `FILE_TOO_LARGE` | 400 | Upload exceeds 10MB |
| `INVALID_FILE_TYPE` | 400 | Not PNG/JPEG/PDF |

---

## 10. Integration Roadmap

### 10.1 AuditService Integration

New audit action types (extend existing `PII_ACTIONS` pattern):

```typescript
export const PAYMENT_ACTIONS = {
  BATCH_CREATED: 'payment.batch_created',
  RECORD_CORRECTED: 'payment.record_corrected',
  DISPUTE_OPENED: 'payment.dispute_opened',
  DISPUTE_ACKNOWLEDGED: 'payment.dispute_acknowledged',
  DISPUTE_RESOLVED: 'payment.dispute_resolved',
  DISPUTE_REOPENED: 'payment.dispute_reopened',
  DISPUTE_AUTO_CLOSED: 'payment.dispute_auto_closed',
  AMOUNTS_CONFIGURED: 'payment.amounts_configured',
  FILE_UPLOADED: 'payment.file_uploaded',
  FILE_DOWNLOADED: 'payment.file_downloaded',
} as const;
```

**Usage patterns:**
- `BATCH_CREATED`: Transactional mode (within batch creation transaction)
- `RECORD_CORRECTED`: Transactional mode (within correction transaction)
- `DISPUTE_*`: Fire-and-forget (dispute status changes are not transactional with other writes)
- `FILE_*`: Fire-and-forget (non-critical)

**Note:** Story 6-1 (immutable audit logs) should ideally be implemented BEFORE Stories 6-4/6-5/6-6 so payment actions benefit from hash chaining and write-once enforcement. However, the current `AuditService` API is sufficient — the upgrade is backward-compatible.

### 10.2 ExportService Integration

Payment data exports follow existing `ExportService` patterns:

| Export | Format | Content | Consumer |
|--------|--------|---------|----------|
| Staff Payment History | CSV, PDF | All payment records for a staff member | Staff self-service |
| Batch Summary | PDF | Batch details + all records + receipt | Super Admin |
| LGA Payment Report | CSV | All payments filtered by LGA/date range | Super Admin, Official |
| Dispute Report | CSV | All disputes with resolution status | Super Admin |

**PDF template:** Reuse `ExportService.generatePdf()` with Oyo State branding (A4, red header, coat of arms). Add payment-specific columns: Tranche, Amount (₦), Bank Reference, Status, Date.

### 10.3 Dashboard Routing

| Role | Dashboard Section | Content |
|------|-------------------|---------|
| Enumerator | "Payment History" tab | Own payment records + dispute status + "Report Issue" action |
| Supervisor | "Payment History" tab | Same as Enumerator (supervisors are also paid staff) |
| Super Admin | "Remuneration" section | Bulk recording page + batch history |
| Super Admin | "Payment Disputes" widget | Dispute queue with counts + resolution actions |

**Sidebar navigation** (add to `sidebarConfig.ts`):
```typescript
// Super Admin section
{ label: 'Remuneration', icon: DollarSign, path: '/super-admin/remuneration' },
{ label: 'Payment Disputes', icon: AlertTriangle, path: '/super-admin/payment-disputes' },

// Staff dashboards (Enumerator, Supervisor)
{ label: 'Payment History', icon: Receipt, path: '/{role}/payment-history' },
```

### 10.4 Backward Compatibility

- **No existing payment code to migrate** — clean greenfield implementation
- **users table unchanged** — existing `bankName`, `accountNumber`, `accountName` fields reused as-is
- **AuditService unchanged** — new action types added alongside existing `PII_ACTIONS`
- **ExportService extended** — new export types added, existing exports unaffected
- **Socket.io extended** — new event types added, existing messaging unaffected

---

## 11. Scale Projections & Index Strategy

### 11.1 Volume Estimates

| Table | Projected Annual Volume | 5-Year Total | Notes |
|-------|------------------------|--------------|-------|
| `payment_batches` | ~50/year | ~250 | ~1 batch per 4 staff groups × 4 tranches |
| `payment_records` | ~800/year | ~4,000 | 200 staff × 4 tranches/year |
| `payment_disputes` | ~40/year | ~200 | ~5% dispute rate |
| `payment_files` | ~70/year | ~350 | ~50 receipts + ~20 evidence files |
| `payment_amounts_config` | ~8/year | ~40 | 2 roles × 4 tranches, occasional updates |

**Conclusion:** All tables remain well under 10,000 rows even at 5 years. **No partitioning needed.**

### 11.2 Query Patterns & Index Strategy

| Query Pattern | Table | Index | Expected Performance |
|---------------|-------|-------|---------------------|
| Staff payment history (active) | `payment_records` | `idx_payment_records_user_active (userId, effectiveUntil)` | Index scan, <1ms |
| Batch detail (all records) | `payment_records` | `idx_payment_records_batch (batchId)` | Index scan, <1ms |
| Admin dispute queue | `payment_disputes` | `idx_payment_disputes_status (status)` | Index scan, <1ms |
| Dispute for record | `payment_disputes` | `idx_payment_disputes_record (paymentRecordId)` | Index scan, <1ms |
| File lookup | `payment_files` | `idx_payment_files_entity (entityType, entityId)` | Index scan, <1ms |
| Batch list (admin history) | `payment_batches` | `idx_payment_batches_recorded_by (recordedBy)` | Index scan, <1ms |
| Auto-close candidates | `payment_disputes` | `idx_payment_disputes_status (status)` + `resolvedAt` filter | Small set, <5ms |

### 11.3 Unique Constraints

| Constraint | Table | Columns | Condition | Purpose |
|------------|-------|---------|-----------|---------|
| `uq_payment_records_active_user_batch` | `payment_records` | `(userId, batchId)` | `WHERE effectiveUntil IS NULL` | One active record per staff per batch |
| `uq_payment_disputes_active_record` | `payment_disputes` | `(paymentRecordId)` | `WHERE status NOT IN ('resolved', 'closed')` | One active dispute per payment record |
| `uq_payment_amounts_active_role_tranche` | `payment_amounts_config` | `(roleId, trancheNumber)` | `WHERE effectiveUntil IS NULL` | One active config per role+tranche |

### 11.4 Storage Estimates

| Component | Annual Storage | 5-Year Total |
|-----------|---------------|--------------|
| DB rows (all tables) | ~10KB/year | ~50KB |
| S3 files (receipts + evidence) | ~350MB/year | ~1.75GB |
| **Total** | ~350MB/year | ~1.75GB |

---

## 12. Story Implementation Checklist

### Story 6-4: Staff Remuneration Bulk Recording

**Scope:** Schema creation + bulk recording service + receipt upload + admin UI

- [ ] Create `apps/api/src/db/schema/remuneration.ts` with all 5 tables
- [ ] Run Drizzle migration (`db:push` or generate migration)
- [ ] Create `apps/api/src/services/remuneration.service.ts`
  - [ ] `createPaymentBatch()` with self-payment prevention
  - [ ] `correctPaymentRecord()` with temporal versioning
  - [ ] `getPaymentBatches()` with pagination
  - [ ] `getBatchDetail()` with records + receipt
- [ ] Create `apps/api/src/controllers/remuneration.controller.ts`
- [ ] Create `apps/api/src/routes/remuneration.routes.ts` with auth guards
- [ ] Create `apps/api/src/middleware/payment-upload.middleware.ts` (multer config)
- [ ] Extend S3 upload to handle receipt files (reuse `PhotoProcessingService` S3 client)
- [ ] Create `apps/api/src/queues/remuneration-notification.queue.ts`
- [ ] Create `apps/api/src/workers/remuneration-notification.worker.ts`
- [ ] Add email templates: payment recorded, payment corrected
- [ ] Seed `payment_amounts_config` with default tranche amounts
- [ ] Create admin Remuneration page (`apps/web/src/pages/super-admin/RemunerationPage.tsx`)
- [ ] Add sidebar nav items
- [ ] Unit tests: service methods, self-payment guard, temporal versioning
- [ ] Integration tests: bulk recording flow, file upload, notification queue

### Story 6-5: Staff Payment History & Dispute Mechanism

**Scope:** Staff payment history page + dispute opening + notification to admin

- [ ] Add `getStaffPaymentHistory()` to `RemunerationService`
- [ ] Add `openDispute()` to `RemunerationService`
- [ ] Add staff-facing API routes (`/api/payment-records/my-history`, `/api/payment-disputes`)
- [ ] Create Staff Payment History page (`apps/web/src/pages/{role}/PaymentHistoryPage.tsx`)
  - [ ] TanStack Table with columns: Tranche, Amount, Date, Status, Bank Ref, Actions
  - [ ] "Report Issue" button (AlertDialog with comment textarea)
  - [ ] Status badges (green/amber/gray)
- [ ] Add Socket.io `dispute.opened` notification to Super Admins
- [ ] Unit tests: ownership guard, status transitions, notification
- [ ] Add sidebar nav items for Enumerator + Supervisor dashboards

### Story 6-6: Payment Dispute Resolution Queue

**Scope:** Admin dispute queue + resolution actions + auto-close cron

- [ ] Add dispute management methods to `RemunerationService`:
  - [ ] `getDisputeQueue()`, `getDisputeDetail()`, `getDisputeStats()`
  - [ ] `acknowledgeDispute()`, `resolveDispute()`, `reopenDispute()`
  - [ ] `autoCloseResolvedDisputes()`
- [ ] Add admin-facing API routes (acknowledge, resolve, reopen)
- [ ] Evidence file upload via multer + S3
- [ ] BullMQ cron job: auto-close resolved disputes after 30 days (`0 3 * * *` WAT)
- [ ] Create Admin Dispute Queue page (split-panel, AssessorQueuePage pattern)
  - [ ] Stats strip: Open, Pending, Resolved This Month, Closed
  - [ ] Dispute table with filters (status, date range)
  - [ ] Detail panel with resolution form
  - [ ] Evidence upload in resolution dialog
- [ ] Socket.io notifications: dispute resolved, dispute reopened
- [ ] Email templates: dispute resolved, dispute reopened
- [ ] Unit tests: all state transitions, max reopens, auto-close
- [ ] Integration tests: resolution with evidence upload

---

## Appendix A: Amount Formatting

```typescript
// Utility: kobo → formatted Naira string
export function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}

// Examples:
// formatNaira(500000)  → "₦5,000.00"
// formatNaira(750000)  → "₦7,500.00"
// formatNaira(1000000) → "₦10,000.00"
```

## Appendix B: Seed Data for payment_amounts_config

```typescript
// apps/api/src/db/seeds/remuneration-seeds.ts
const defaultAmounts = [
  { roleId: enumeratorRoleId, trancheNumber: 1, standardAmount: 500000, label: '₦5,000' },
  { roleId: enumeratorRoleId, trancheNumber: 2, standardAmount: 750000, label: '₦7,500' },
  { roleId: enumeratorRoleId, trancheNumber: 3, standardAmount: 500000, label: '₦5,000' },
  { roleId: enumeratorRoleId, trancheNumber: 4, standardAmount: 750000, label: '₦7,500' },
  { roleId: supervisorRoleId, trancheNumber: 1, standardAmount: 1000000, label: '₦10,000' },
  { roleId: supervisorRoleId, trancheNumber: 2, standardAmount: 1250000, label: '₦12,500' },
  { roleId: supervisorRoleId, trancheNumber: 3, standardAmount: 1000000, label: '₦10,000' },
  { roleId: supervisorRoleId, trancheNumber: 4, standardAmount: 1250000, label: '₦12,500' },
];
// Note: Actual amounts TBD by Awwal — these are placeholder values for development
```

## Appendix C: Auto-Close Cron Job

```typescript
// apps/api/src/queues/dispute-auto-close.queue.ts
import { Queue } from 'bullmq';

const disputeAutoCloseQueue = new Queue('dispute-auto-close', {
  connection: getConnection(),
});

// Schedule: daily at 3:00 AM WAT (2:00 AM UTC)
await disputeAutoCloseQueue.add('auto-close', {}, {
  repeat: { pattern: '0 2 * * *' }, // UTC
  removeOnComplete: true,
});

// Worker calls: RemunerationService.autoCloseResolvedDisputes()
// SQL: UPDATE payment_disputes SET status = 'closed', updated_at = NOW()
//      WHERE status = 'resolved' AND resolved_at < NOW() - INTERVAL '30 days'
```

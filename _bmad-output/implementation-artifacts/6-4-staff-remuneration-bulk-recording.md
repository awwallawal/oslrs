# Story 6.4: Staff Remuneration Bulk Recording

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Super Admin,
I want to record stipend payments to staff in bulk,
so that I can efficiently manage the field workforce payroll.

## Context

### Business Value
Field staff (Enumerators and Supervisors) receive periodic stipend payments for data collection work. Payments happen outside the app via bank transfer — OSLRS provides the record-keeping layer: proof of payment, staff notification, and immutable audit trail. Without this, payment tracking is manual spreadsheets with no accountability, no dispute mechanism, and no NDPA-compliant retention.

### Key Scoping Decision
**Remuneration is scoped to RECORD-KEEPING ONLY** (per Awwal's direction during Epic 5 retrospective):
- Payments happen OUTSIDE the app via bank's native tools
- OSLRS role: record proof of payment (receipt upload), tag to staff members
- Staff can view payment history, download receipts, raise disputes (Stories 6-5, 6-6)
- NO payment gateway integration. NO direct bank API calls.

### Current State
The platform has no payment infrastructure — this is greenfield:

- **User bank details exist**: `users` table has `bankName`, `accountNumber`, `accountName` fields (lines 15-17 of `users.ts`) — populated during field staff profile completion
- **No payment tables**: No `payment_batches`, `payment_records`, or `payment_files` tables
- **No remuneration UI**: No sidebar item, no pages, no API endpoints
- **Temporal versioning pattern**: `productivity_targets` table uses `effectiveFrom`/`effectiveUntil` for append-only versioning — exact pattern to reuse
- **Existing file upload**: `multer` memory storage in `staff.routes.ts`, S3 upload via `PhotoProcessingService` pattern
- **AuditService ready**: Fire-and-forget + transactional modes with 7 PII action types
- **EmailService ready**: Resend provider, BullMQ email queue for notification delivery
- **14 existing schema files**: `apps/api/src/db/schema/index.ts` exports all tables

### Architecture Requirements

**From PRD Story 6.7 (lines 812-833):**
1. Tranche support — multiple payments per user ("Tranche 1", "Tranche 2")
2. Pre-configured payment amounts per role/tranche, ad-hoc requires justification
3. Bulk recording — filter by Role/LGA, record with Amount, Date, Bank Reference, Receipt Screenshot
4. Immutable records — append-only, modifications create new versions
5. Notification — automated email on payment recording
6. Audit & controls — all actions logged, no self-payment recording

### Dependency
- **prep-5-remuneration-domain-modeling** (ready-for-dev) — Contains schema designs, state machine, notification patterns. If the spike has been executed, use its summary. Otherwise, the spike story file contains detailed schema sketches and design decisions.
- **Story 6-1** (Immutable Audit Logs) — Expanded `AUDIT_ACTIONS` constant includes `DATA_CREATE` action type. If 6-1 is done, use `AUDIT_ACTIONS.DATA_CREATE` for payment recording. If not, use existing `logPiiAccessTx()` with a custom action string.

## Acceptance Criteria

**AC1**: Given a list of eligible staff (Enumerators/Supervisors), when the Super Admin records a "Tranche" payment with Amount, Bank Reference, and optional Receipt Screenshot, then the system creates a `payment_batch` record and individual `payment_record` entries for each selected staff member, all within a single database transaction.

**AC2**: Given a payment batch is created, when individual payment records are generated, then each record includes: userId, batchId, amount (in kobo), status `active`, `effectiveFrom` timestamp, and `effectiveUntil` NULL (temporal versioning — append-only, never update).

**AC3**: Given a Super Admin attempts to record a payment, when the batch includes their own userId, then the system rejects with error `CANNOT_RECORD_SELF_PAYMENT` — Super Admins cannot record payments to themselves (requires a different admin).

**AC4**: Given a payment batch is created successfully, when the batch notification triggers, then an email is sent to each affected staff member via the existing EmailService + BullMQ email queue, containing: amount (formatted as Naira), tranche name, date, and bank reference.

**AC5**: Given the Super Admin Remuneration page, when the admin selects staff filters (Role, LGA), then the page displays a filtered list of eligible staff with checkboxes for selection, and a form to enter batch details (Tranche Name, Amount, Bank Reference, Description, optional Receipt Upload).

**AC6**: Given a payment record needs correction, when the admin corrects a record, then the system sets `effectiveUntil = NOW()` on the existing record and inserts a new record with the corrected amount and `effectiveFrom = NOW()` — preserving full audit history (never UPDATE or DELETE).

**AC7**: Given the new schema tables, when running `db:push`, then the `payment_batches`, `payment_records`, and `payment_files` tables are created with correct indexes, constraints, and foreign keys, and all existing tests pass with zero regressions.

**AC8**: Given the full test suite, when all tests run, then new tests cover: batch creation with transaction, individual record generation, self-payment prevention, temporal versioning (correction creates new version), receipt file upload + S3 storage, email notification delivery, and API authorization (Super Admin only).

## Tasks / Subtasks

- [ ] Task 1: Create remuneration database schema (AC: #1, #2, #7)
  - [ ] 1.1 Create `apps/api/src/db/schema/remuneration.ts` with three tables:
    ```typescript
    // payment_batches — one per bulk recording action
    export const paymentBatches = pgTable('payment_batches', {
      id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
      trancheNumber: integer('tranche_number').notNull(),
      trancheName: text('tranche_name').notNull(), // "Tranche 1 - February 2026"
      description: text('description'),
      bankReference: text('bank_reference'),
      receiptFileId: uuid('receipt_file_id'), // FK → payment_files
      lgaId: uuid('lga_id'), // scope filter (NULL = all LGAs)
      roleFilter: text('role_filter'), // 'enumerator', 'supervisor', etc.
      staffCount: integer('staff_count').notNull(),
      totalAmount: integer('total_amount').notNull(), // in kobo (smallest unit)
      recordedBy: uuid('recorded_by').notNull(), // FK → users (admin)
      status: text('status', { enum: ['active', 'corrected'] }).notNull().default('active'),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    });

    // payment_records — one per staff member per batch
    export const paymentRecords = pgTable('payment_records', {
      id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
      batchId: uuid('batch_id').notNull(), // FK → payment_batches
      userId: uuid('user_id').notNull(), // FK → users
      amount: integer('amount').notNull(), // in kobo
      status: text('status', { enum: ['active', 'disputed', 'corrected'] }).notNull().default('active'),
      effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
      effectiveUntil: timestamp('effective_until', { withTimezone: true }), // NULL = current version
      createdBy: uuid('created_by').notNull(), // FK → users (admin)
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    });

    // payment_files — receipt uploads
    export const paymentFiles = pgTable('payment_files', {
      id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
      entityType: text('entity_type', { enum: ['receipt', 'dispute_evidence'] }).notNull(),
      entityId: uuid('entity_id').notNull(), // FK → payment_batches or payment_disputes
      originalFilename: text('original_filename').notNull(),
      s3Key: text('s3_key').notNull(), // S3 object key
      mimeType: text('mime_type').notNull(),
      sizeBytes: integer('size_bytes').notNull(),
      uploadedBy: uuid('uploaded_by').notNull(), // FK → users
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    });
    ```
  - [ ] 1.2 Add indexes:
    - `payment_records`: composite index on `(user_id, effective_until)` for staff payment history queries
    - `payment_records`: index on `batch_id` for batch detail lookups
    - `payment_records`: partial unique on `(user_id, batch_id)` WHERE `effective_until IS NULL` (one active record per staff per batch)
    - `payment_batches`: index on `recorded_by` for admin history
    - `payment_batches`: index on `created_at` for date filtering
  - [ ] 1.3 Add relations in `apps/api/src/db/schema/relations.ts`:
    - paymentBatches → users (recordedBy)
    - paymentRecords → paymentBatches (batchId), paymentRecords → users (userId, createdBy)
    - paymentFiles → users (uploadedBy)
  - [ ] 1.4 Export from `apps/api/src/db/schema/index.ts`: add `export * from './remuneration.js'`
  - [ ] 1.5 **Do NOT import from `@oslsr/types`** in schema files — inline enum values (Drizzle constraint per MEMORY.md)
  - [ ] 1.6 Run `pnpm --filter @oslsr/api db:push:force` to apply schema
- [ ] Task 2: Create RemunerationService (AC: #1, #2, #3, #6)
  - [ ] 2.1 Create `apps/api/src/services/remuneration.service.ts` with static methods:
    - `createPaymentBatch(batchData, staffIds, actorId, req)` — main bulk recording method
    - `correctPaymentRecord(recordId, newAmount, actorId, req)` — temporal versioning correction
    - `getPaymentBatches(filters)` — list batches with pagination
    - `getStaffPaymentHistory(userId, filters)` — staff's payment records (active only by default)
    - `getBatchDetail(batchId)` — batch + all records + receipt file
  - [ ] 2.2 Implement `createPaymentBatch()`:
    1. Validate: actor is Super Admin (middleware), actor is NOT in staffIds (self-payment guard)
    2. Begin transaction
    3. If receipt file provided: upload to S3, create `payment_files` record
    4. Create `payment_batches` record with batch metadata
    5. Create `payment_records` for each staffId: `{ batchId, userId, amount, status: 'active', effectiveFrom: new Date(), createdBy: actorId }`
    6. Log audit via `AuditService.logPiiAccessTx()` with action `'payment.batch_created'`
    7. Commit transaction
    8. Queue notification emails (outside transaction — fire-and-forget)
  - [ ] 2.3 Implement self-payment guard: `if (staffIds.includes(actorId)) throw new AppError('CANNOT_RECORD_SELF_PAYMENT', 'Cannot record payment to yourself', 400)`
  - [ ] 2.4 Implement `correctPaymentRecord()`:
    1. Fetch existing record, verify `effectiveUntil IS NULL` (still active)
    2. Begin transaction
    3. Update existing: `SET effectiveUntil = NOW()` (close old version)
    4. Insert new record: same batchId/userId, new amount, `effectiveFrom = NOW()`
    5. Audit log: `'payment.record_corrected'`
    6. Commit
  - [ ] 2.5 Implement `getStaffPaymentHistory()`: query `payment_records` WHERE `userId = ? AND effectiveUntil IS NULL` with batch join for tranche info, ordered by `createdAt DESC`
- [ ] Task 3: Create receipt file upload with S3 (AC: #1, #5)
  - [ ] 3.1 Add multer config for receipt uploads in route or create dedicated middleware:
    - Memory storage (same as staff.routes.ts pattern)
    - Max file size: 10MB
    - Allowed MIME types: `image/png`, `image/jpeg`, `application/pdf`
  - [ ] 3.2 Implement S3 upload in RemunerationService (reuse `PhotoProcessingService` S3 config pattern):
    - S3 key: `payment-receipts/{batchId}/{uuid}.{ext}`
    - Content-Type from multer file
    - Return `payment_files` record
  - [ ] 3.3 Implement file download endpoint: `GET /api/v1/remuneration/files/:fileId` — authenticate, verify access (Super Admin or file's target staff), stream from S3 via `GetObjectCommand`
- [ ] Task 4: Create remuneration routes and controller (AC: #1, #3, #5)
  - [ ] 4.1 Create `apps/api/src/controllers/remuneration.controller.ts`:
    - `createBatch(req, res)` — POST bulk payment recording
    - `listBatches(req, res)` — GET batches with pagination/filters
    - `getBatchDetail(req, res)` — GET single batch with records
    - `correctRecord(req, res)` — PATCH correction
    - `getStaffHistory(req, res)` — GET staff payment history
    - `downloadFile(req, res)` — GET file download
  - [ ] 4.2 Create `apps/api/src/routes/remuneration.routes.ts`:
    - All routes behind `authenticate + authorize('super_admin')` (except staff history — see below)
    - `POST /` — create batch (with multer for receipt upload)
    - `GET /` — list batches
    - `GET /:batchId` — batch detail
    - `PATCH /records/:recordId` — correct record
    - `GET /staff/:userId/history` — staff payment history (Super Admin + own records)
    - `GET /files/:fileId` — download receipt
  - [ ] 4.3 Mount in `apps/api/src/routes/index.ts`: `router.use('/remuneration', remunerationRoutes)`
  - [ ] 4.4 Add Zod validation schemas in `packages/types/src/validation/` or inline in controller:
    - `createPaymentBatchSchema`: trancheName (string), trancheNumber (int), amount (positive int, in kobo), staffIds (uuid array min 1), bankReference (optional string), description (optional string)
    - `correctPaymentRecordSchema`: newAmount (positive int, in kobo), reason (string)
- [ ] Task 5: Implement payment notification emails (AC: #4)
  - [ ] 5.1 Add email template method to `EmailService` or build HTML inline:
    - Subject: `[OSLRS] Payment Recorded — {trancheName}`
    - Body: staff name, amount formatted as Naira (₦), tranche name, date, bank reference, "View your payment history" link
    - Use OSLRS brand styling (#9C1E23) consistent with other emails
  - [ ] 5.2 Create `queuePaymentNotificationEmail()` export in `email.queue.ts` following the existing `queueStaffInvitationEmail()` pattern (L123). There is **no generic `queueEmail()`** — the file exports specialized functions per email type. Add `payment-notification` to the `EmailJob` union type.
    - Queue one email per staff member in the batch (not bulk — individual personalized)
  - [ ] 5.3 Fire-and-forget after transaction commit: email failures should NOT roll back the payment recording
  - [ ] 5.4 Handle email budget: respect existing `EMAIL_TIER` and `EMAIL_MONTHLY_OVERAGE_BUDGET` limits
- [ ] Task 6: Create Super Admin Remuneration page (AC: #5)
  - [ ] 6.1 Create `apps/web/src/features/remuneration/` feature directory with:
    - `api/remuneration.api.ts` — API client functions
    - `hooks/useRemuneration.ts` — TanStack Query hooks
    - `pages/RemunerationPage.tsx` — Main page
    - `components/BulkRecordingForm.tsx` — Batch recording form
    - `components/PaymentBatchTable.tsx` — Batch history table
    - `components/StaffSelectionTable.tsx` — Staff filter + checkbox selection
  - [ ] 6.2 Implement `RemunerationPage.tsx`:
    - Two sections: "Record New Payment" form (top) + "Payment Batch History" table (bottom)
    - Batch history with: tranche name, date, staff count, total amount, status, recorded by
    - Click batch row → expand/navigate to batch detail with individual records
  - [ ] 6.3 Implement `BulkRecordingForm.tsx`:
    - Step 1: Filter staff by Role dropdown (Enumerator/Supervisor) + LGA dropdown → display matching staff with checkboxes
    - Step 2: Enter batch details: Tranche Name, Tranche Number, Amount (₦), Bank Reference, Description, Receipt Upload (drag-and-drop or click)
    - Step 3: Review summary: "Record ₦X to Y staff members" → Confirm button
    - Disable submit while processing, show success toast with batch count
  - [ ] 6.4 Implement `StaffSelectionTable.tsx`:
    - Fetch eligible staff via existing `GET /api/v1/staff` with role/LGA/status filters
    - Show: name, email, LGA, bank details (masked: last 4 digits of account)
    - Select All / Deselect All checkbox
    - Highlight staff with missing bank details (greyed out, not selectable)
  - [ ] 6.5 Amount formatting: display as Naira (₦) in UI, store as kobo (integer) in DB. Helper: `formatNaira(kobo: number) => ₦${(kobo / 100).toLocaleString()}`
- [ ] Task 7: Wire up frontend routing and sidebar (AC: #5)
  - [ ] 7.1 Add sidebar item in `sidebarConfig.ts` for Super Admin:
    ```typescript
    { label: 'Remuneration', href: '/dashboard/super-admin/remuneration', icon: DollarSign },
    ```
    Import `DollarSign` from `lucide-react`. Position after 'Export Data' and before 'Audit Logs'.
  - [ ] 7.2 Add lazy import in `App.tsx`: `const RemunerationPage = lazy(() => import('./features/remuneration/pages/RemunerationPage'))`
  - [ ] 7.3 Add route under super-admin routes: `<Route path="remuneration" element={<Suspense fallback={<DashboardLoadingFallback />}><RemunerationPage /></Suspense>} />`
- [ ] Task 8: Add backend tests (AC: #8)
  - [ ] 8.1 Create `apps/api/src/controllers/__tests__/remuneration.controller.test.ts`:
    - Test: `POST /remuneration` creates batch + records in transaction (verify both tables populated)
    - Test: `POST /remuneration` with self-payment → 400 CANNOT_RECORD_SELF_PAYMENT
    - Test: `POST /remuneration` returns 401 for unauthenticated request
    - Test: `POST /remuneration` returns 403 for non-Super Admin
    - Test: `GET /remuneration` lists batches with pagination
    - Test: `GET /remuneration/:batchId` returns batch with records
    - Test: `PATCH /remuneration/records/:recordId` creates new version (old closed, new inserted)
    - Test: `PATCH /remuneration/records/:recordId` preserves original record (effectiveUntil set)
    - Test: `GET /remuneration/staff/:userId/history` returns active records only
    - Test: notification emails queued after batch creation (mock queueEmail)
  - [ ] 8.2 Create `apps/api/src/services/__tests__/remuneration.service.test.ts`:
    - Test: self-payment guard rejects when actor in staffIds
    - Test: batch creation with receipt file uploads to S3 (mock)
    - Test: correction creates new version with effectiveFrom = now, closes old with effectiveUntil
    - Test: getStaffPaymentHistory excludes corrected records (effectiveUntil IS NOT NULL)
- [ ] Task 9: Add frontend tests (AC: #8)
  - [ ] 9.1 Create `apps/web/src/features/remuneration/pages/__tests__/RemunerationPage.test.tsx`:
    - Test: renders batch recording form and history table
    - Test: staff selection filters by role and LGA
    - Test: submit button disabled when no staff selected
    - Test: amount displayed in Naira format
    - Test: success toast shown after batch creation
    - Test: handles API error gracefully
  - [ ] 9.2 Test `StaffSelectionTable`: renders staff list with checkboxes, select-all works
  - [ ] 9.3 Test `BulkRecordingForm`: validates required fields, file upload works
- [ ] Task 10: Run full test suites and verify zero regressions (AC: #7, #8)
  - [ ] 10.1 Run API tests: `pnpm vitest run apps/api/src/`
  - [ ] 10.2 Run web tests: `cd apps/web && pnpm vitest run`
- [ ] Task 11: Update story status and dev agent record

## Dev Notes

### Amount Storage: Kobo (Smallest Unit)

Store all amounts as **integers in kobo** (1 Naira = 100 kobo). This prevents floating-point precision issues:
- ₦5,000 → store as `500000` kobo
- UI: `formatNaira(500000)` → "₦5,000.00"
- API: accepts kobo integer, returns kobo integer
- DB: `integer` column type (sufficient for amounts up to ~₦21.5 million per record)

### Temporal Versioning Pattern (From productivity-targets.ts)

Never UPDATE `payment_records` rows. To correct:
1. `SET effectiveUntil = NOW()` on existing record (close old version)
2. `INSERT` new record with corrected data and `effectiveFrom = NOW()`
3. Query active records: `WHERE effectiveUntil IS NULL`
4. Query full history: `ORDER BY effectiveFrom DESC` (shows all versions)

Partial unique index ensures one active record per (userId, batchId):
```typescript
activeBatchRecordIdx: uniqueIndex('uq_payment_records_active_batch_user')
  .on(table.userId, table.batchId)
  .where(sql`effective_until IS NULL`),
```

### Self-Payment Prevention

```typescript
// In RemunerationService.createPaymentBatch()
if (staffIds.includes(actorId)) {
  throw new AppError('CANNOT_RECORD_SELF_PAYMENT', 'Cannot record payment to yourself. Ask another Super Admin.', 400);
}
```

This mirrors the existing `CANNOT_DEACTIVATE_SELF` guard pattern in `StaffService.deactivateUser()`.

### S3 Receipt Upload Pattern

Reuse the exact S3 config from `PhotoProcessingService` (lines 15-33):

```typescript
// S3 key structure for receipts
const s3Key = `payment-receipts/${batchId}/${uuidv7()}.${ext}`;

// Upload via PutObjectCommand
await s3Client.send(new PutObjectCommand({
  Bucket: process.env.S3_BUCKET_NAME || 'oslsr-media',
  Key: s3Key,
  Body: buffer,
  ContentType: mimeType,
}));
```

### Notification Email Pattern

There is **no generic `queueEmail()` function**. The `email.queue.ts` file exports specialized functions per email type: `queueStaffInvitationEmail()` (L123), `queueVerificationEmail()` (L157), `queuePasswordResetEmail()` (L177). Create a new `queuePaymentNotificationEmail()` following the same pattern:

```typescript
import { queuePaymentNotificationEmail } from '../queues/email.queue.js';

// After transaction succeeds — fire-and-forget
for (const staffMember of affectedStaff) {
  try {
    await queuePaymentNotificationEmail({
      staffName: staffMember.fullName,
      email: staffMember.email,
      amount: formatNaira(amount),
      trancheName,
      date: new Date().toLocaleDateString('en-NG'),
      bankReference,
    });
  } catch (err) {
    logger.warn({ event: 'payment.notification_failed', userId: staffMember.id, error: err.message });
  }
}
```

Add `payment-notification` to the `EmailJob` union type and create the `queuePaymentNotificationEmail()` export following `queueStaffInvitationEmail()` as template.

### Multer Config for Receipt Uploads

```typescript
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPEG, and PDF files are allowed'));
  },
});
```

### Audit Action Types

If Story 6-1 (Immutable Audit Logs) is implemented, use the expanded `AUDIT_ACTIONS`:
- `AUDIT_ACTIONS.DATA_CREATE` for batch creation
- Custom: `'payment.batch_created'`, `'payment.record_corrected'`

If 6-1 is not yet done, use `logPiiAccessTx()` with custom action strings — backward compatible.

### File Change Scope

**New files (backend):**
- `apps/api/src/db/schema/remuneration.ts` — Schema: payment_batches, payment_records, payment_files
- `apps/api/src/services/remuneration.service.ts` — Business logic: batch creation, correction, history
- `apps/api/src/controllers/remuneration.controller.ts` — HTTP handler layer
- `apps/api/src/routes/remuneration.routes.ts` — Route definitions (Super Admin)
- `apps/api/src/controllers/__tests__/remuneration.controller.test.ts` — Controller tests
- `apps/api/src/services/__tests__/remuneration.service.test.ts` — Service tests

**New files (frontend):**
- `apps/web/src/features/remuneration/api/remuneration.api.ts` — API client
- `apps/web/src/features/remuneration/hooks/useRemuneration.ts` — TanStack Query hooks
- `apps/web/src/features/remuneration/pages/RemunerationPage.tsx` — Main page
- `apps/web/src/features/remuneration/components/BulkRecordingForm.tsx` — Batch form
- `apps/web/src/features/remuneration/components/PaymentBatchTable.tsx` — Batch history
- `apps/web/src/features/remuneration/components/StaffSelectionTable.tsx` — Staff filter + selection
- `apps/web/src/features/remuneration/pages/__tests__/RemunerationPage.test.tsx` — Page tests

**Modified files:**
- `apps/api/src/db/schema/index.ts` — Add `export * from './remuneration.js'`
- `apps/api/src/db/schema/relations.ts` — Add remuneration relations
- `apps/api/src/routes/index.ts` — Mount remuneration routes
- `apps/api/src/queues/email.queue.ts` — Add `queuePaymentNotificationEmail()` export + `payment-notification` EmailJob type
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Add Remuneration sidebar item
- `apps/web/src/App.tsx` — Add lazy import + route

**Schema changes:** 3 new tables (payment_batches, payment_records, payment_files). No existing table modifications.

### Project Structure Notes

- Schema: `apps/api/src/db/schema/remuneration.ts` (alongside 14 existing schema files)
- Service: `apps/api/src/services/remuneration.service.ts` (alongside staff, audit, email services)
- Controller: `apps/api/src/controllers/remuneration.controller.ts` (alongside staff, export controllers)
- Routes: `apps/api/src/routes/remuneration.routes.ts` (mounted at `/api/v1/remuneration`)
- Frontend feature: `apps/web/src/features/remuneration/` (new feature directory)
- **Do NOT create a new BullMQ queue** — use existing `email-notification` queue via new `queuePaymentNotificationEmail()` function

### Testing Standards

- Use `vi.hoisted()` + `vi.mock()` pattern for controller tests
- Mock `@aws-sdk/client-s3` commands for receipt upload tests
- Mock `email.queue.ts` `queuePaymentNotificationEmail()` for notification tests
- Mock `db.transaction()` for service-level tests
- Use `data-testid` selectors in frontend tests (A3: no CSS class selectors)
- Run web tests: `cd apps/web && pnpm vitest run`
- Run API tests: `pnpm vitest run apps/api/src/`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#L1863-1874] — Story 6-4 acceptance criteria
- [Source: _bmad-output/planning-artifacts/prd.md#L812-833] — Story 6.7 comprehensive requirements (tranche, bulk recording, disputes, audit)
- [Source: _bmad-output/planning-artifacts/architecture.md#L478] — Payment Records data dictionary entry
- [Source: _bmad-output/implementation-artifacts/prep-5-remuneration-domain-modeling.md] — Domain modeling spike (schema sketches, state machine, notification design)
- [Source: _bmad-output/implementation-artifacts/epic-5-retro-2026-02-24.md#L169-189] — Remuneration scoping decision (record-keeping only)
- [Source: apps/api/src/db/schema/users.ts#L15-17] — Bank details fields (bankName, accountNumber, accountName)
- [Source: apps/api/src/db/schema/productivity-targets.ts] — Temporal versioning pattern (effectiveFrom/effectiveUntil, partial unique index)
- [Source: apps/api/src/db/schema/index.ts] — Schema exports (14 files, add remuneration.ts)
- [Source: apps/api/src/services/audit.service.ts] — AuditService (fire-and-forget + transactional modes)
- [Source: apps/api/src/services/photo-processing.service.ts#L15-43] — S3Client config pattern (DO Spaces, forcePathStyle)
- [Source: apps/api/src/services/photo-processing.service.ts#L145-155] — uploadToS3() PutObjectCommand pattern
- [Source: apps/api/src/services/staff.service.ts#L546-670] — createManual() transaction + email pattern
- [Source: apps/api/src/services/staff.service.ts#L267-269] — Self-prevention guard pattern (CANNOT_DEACTIVATE_SELF)
- [Source: apps/api/src/queues/email.queue.ts] — queueStaffInvitationEmail() pattern (template for new queuePaymentNotificationEmail())
- [Source: apps/api/src/middleware/upload.middleware.ts] — Multer config pattern (memory storage, size limits, file filter)
- [Source: apps/api/src/routes/staff.routes.ts#L10-13] — Multer inline config for file uploads
- [Source: apps/api/src/routes/index.ts] — Route index (17 existing route modules)
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts#L134-150] — Super Admin sidebar (no remuneration item yet)
- [Source: apps/web/src/features/staff/pages/StaffManagementPage.tsx] — Staff management UI pattern (filters, table, dialogs)
- [Source: apps/web/src/features/staff/hooks/useStaff.ts] — TanStack Query mutation hooks pattern
- [Source: apps/web/src/App.tsx] — Frontend routing (lazy imports + Suspense)

### Previous Story Intelligence

**From prep-5-remuneration-domain-modeling (direct feeder):**
- Complete schema design for payment_batches, payment_records, payment_disputes, payment_files
- Dispute state machine: Active → Disputed → PendingResolution → Resolved → Reopened → Closed
- File storage recommendation: S3 (DigitalOcean Spaces) — already configured for photos
- Notification via existing EmailService + BullMQ (NOT Nodemailer — uses Resend provider)
- Scale: ~800 records/year, ~50 batches/year — no partitioning needed
- Amount in kobo, temporal versioning, self-payment guard

**From Story 6-3 (Automated Backup Orchestration):**
- S3 client patterns confirmed: `createS3Client()` helper, `PutObjectCommand`, `GetObjectCommand`
- BullMQ patterns: lazy-init, test mode guard, structured logging
- Worker registration in `workers/index.ts`

**From Story 6-1 (Immutable Audit Logs):**
- Expanded `AUDIT_ACTIONS` constant with `DATA_CREATE`, `DATA_UPDATE` categories
- `logPiiAccessTx()` for transactional audit logging within batch creation
- Audit table is append-only — payment actions will be captured in immutable trail

**From prep-epic-5/prep-6 (Assessor Workflow State Machine):**
- Role-based state transition patterns applicable to dispute lifecycle (Stories 6-5, 6-6)
- Concurrent review handling patterns

### Git Intelligence

Recent commits are Epic 5 completions and prep fixes:
- `c240b19 fix(web): add consistent p-6 padding to 3 dashboard pages (prep-2)` — latest
- `ab03648 fix(web,api): fix CI build errors`
- `328ad63 fix(web): fix ExportPage LGA race condition + code review fixes (prep-1)`
- `bd5a443 docs: complete Epic 5 retrospective and define Epic 6 prep phase`
- `92f8a2b fix(api,web): use dynamic productivity targets across all dashboards`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

### File List

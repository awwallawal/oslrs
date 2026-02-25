# Story 6.6: Payment Dispute Resolution Queue

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Super Admin,
I want to resolve reported payment issues with evidence,
so that staff grievances are handled fairly.

## Context

### Business Value
When field staff dispute a payment record (Story 6-5), those disputes enter a queue visible to Super Admins. Without a structured resolution workflow, disputes languish — staff lose trust, payment accountability breaks down, and there's no auditable resolution trail. This story delivers the admin-side resolution UI, evidence upload for proof (bank screenshots), staff notification on resolution, and the complete dispute state machine lifecycle including staff reopen capability and auto-close after 30 days.

### Key Scoping Decision
**Remuneration is scoped to RECORD-KEEPING ONLY** (per Awwal's direction during Epic 5 retrospective):
- Resolving a dispute means providing evidence (e.g., bank screenshot proving payment was made) and an admin response, NOT processing any actual payment
- Resolution outcome updates the dispute status + notifies staff — no financial transactions occur
- Staff can reopen if unsatisfied, with a reopen counter for escalation visibility

### Current State
Story 6-5 creates the staff-facing dispute mechanism and the `payment_disputes` table. This story builds the admin resolution counterpart:

- **`payment_disputes` table exists** (from Story 6-5): schema with status enum `['disputed', 'pending_resolution', 'resolved', 'reopened', 'closed']`, staffComment, adminResponse, evidenceFileId, openedBy, resolvedBy, resolvedAt, reopenCount
- **`payment_files` table exists** (from Story 6-4): supports `entityType: 'dispute_evidence'` — ready for resolution evidence uploads
- **RemunerationService exists** (from Stories 6-4, 6-5): `openDispute()`, `getDisputeByRecordId()`, `getStaffPaymentHistory()` — extend with resolution methods
- **Remuneration routes exist** (from Stories 6-4, 6-5): mounted at `/api/v1/remuneration` — extend with admin dispute endpoints
- **`queueDisputeNotificationEmail()` exists** (from Story 6-5): specialized email function for dispute notifications — reuse for resolution emails or create `queueDisputeResolutionEmail()`
- **AssessorQueuePage pattern** (Story 5-2): Split-panel layout with filter bar, stats strip, selectable rows, detail panel — exact template for Dispute Queue
- **FraudSeverityBadge pattern**: Status badge with config map + color scheme — template for DisputeStatusBadge
- **StaffActionsMenu pattern**: DropdownMenu with conditional actions based on status — template for dispute row actions
- **Socket.io available**: `io.to(\`user:${userId}\`).emit(eventName, payload)` for real-time staff notification on resolution
- **S3 upload pattern**: `PhotoProcessingService` S3Client + `PutObjectCommand` for evidence file upload
- **Super Admin sidebar** (sidebarConfig.ts lines 134-150): 15 items including Fraud Review, Audit Queue, Settings — add "Payment Disputes" item
- **App.tsx Super Admin routes** (lines 570-676): lazy import + Suspense + ProtectedRoute pattern

### Architecture Requirements

**From PRD Story 6.8 (epics.md lines 1889-1900):**
1. Super Admin sees "Disputed" payment records in a resolution queue
2. Admin provides "Resolution Evidence" (e.g., bank screenshot) and marks as "Resolved"
3. Staff member receives a notification on resolution
4. Audit trail records resolution details and the admin who closed the case

**From prep-5 Dispute State Machine (this story implements remaining transitions):**
```
Story 6-5 handled:  Active ──[staff: report_issue]──→ Disputed

Story 6-6 handles:
  Disputed ──[admin: acknowledge]──→ PendingResolution
  PendingResolution ──[admin: resolve(evidence)]──→ Resolved
  Resolved ──[staff: reopen(comment)]──→ Reopened
  Reopened ──[admin: resolve(evidence)]──→ Resolved
  Resolved ──[auto: 30 days]──→ Closed
```

### Dependency
- **Story 6-5** (Staff Payment History & Dispute Mechanism) — MUST be implemented first. Provides `payment_disputes` table, `openDispute()` service method, `queueDisputeNotificationEmail()`, staff payment routes. This story extends those.
- **Story 6-4** (Staff Remuneration Bulk Recording) — Provides `payment_batches`, `payment_records`, `payment_files` tables, `RemunerationService`, core remuneration routes.
- **Story 6-1** (Immutable Audit Logs) — If done, use expanded `AUDIT_ACTIONS` for resolution audit. If not, use `logPiiAccessTx()` with custom action strings.

## Acceptance Criteria

**AC1**: Given the Super Admin dashboard, when the admin navigates to "Payment Disputes" in the sidebar, then they see a paginated queue of all disputed payment records showing: staff name, tranche name, amount (₦), dispute date, status (Disputed/Pending Resolution/Resolved/Reopened/Closed), reopen count — with most recent first, and summary stats at the top (total open, pending, resolved this month).

**AC2**: Given the Dispute Queue, when the admin clicks on a dispute row, then a detail panel opens showing: staff member info (name, role, LGA), payment details (tranche, amount, batch date, bank reference), staff's dispute comment, dispute timeline (opened date, status changes), and action buttons based on current status.

**AC3**: Given a dispute with status "Disputed", when the admin clicks "Acknowledge", then the dispute status transitions to "Pending Resolution" and the staff member receives a notification that their dispute is being reviewed.

**AC4**: Given a dispute with status "Pending Resolution" or "Reopened", when the admin provides a resolution response (required text), optionally uploads evidence (bank screenshot — PNG/JPEG/PDF, max 10MB), and clicks "Resolve", then the system creates a `payment_files` record with `entityType: 'dispute_evidence'`, updates the dispute with `adminResponse`, `resolvedBy`, `resolvedAt`, `evidenceFileId`, sets status to "Resolved", and sends a notification email to the staff member.

**AC5**: Given a dispute with status "Resolved", when the staff member views it in their Payment History (Story 6-5) and clicks "Reopen" with a new comment, then the dispute status transitions to "Reopened", `reopenCount` increments by 1, and the Super Admin is notified.

**AC6**: Given a dispute with status "Resolved" for 30+ days, when the auto-close job runs, then the dispute status transitions to "Closed" — no further reopens allowed. Closed disputes are read-only for both staff and admin.

**AC7**: Given any dispute state transition, when the transition occurs, then an audit log entry is created recording: the action (acknowledge, resolve, reopen, auto-close), the actor (admin or staff or system), the dispute ID, and timestamp — preserving full accountability trail.

**AC8**: Given the full test suite, when all tests run, then new tests cover: dispute queue API (list, filter, pagination), acknowledge transition, resolve with evidence upload, resolve without evidence, reopen with comment, auto-close job, audit logging for all transitions, Super Admin Dispute Queue page rendering, detail panel display, resolution dialog form validation, evidence file upload, notification emails, and zero regressions across existing tests.

## Tasks / Subtasks

- [ ] Task 1: Extend RemunerationService with admin dispute resolution methods (AC: #2, #3, #4, #5, #6, #7)
  - [ ] 1.1 Add to `apps/api/src/services/remuneration.service.ts`:
    - `getDisputeQueue(filters)` — list all disputes with pagination, join payment_records + payment_batches + users for full context
    - `getDisputeDetail(disputeId)` — single dispute with full relations (payment record, batch, staff, evidence file)
    - `getDisputeStats()` — aggregate counts: total open (disputed + pending_resolution + reopened), pending, resolved this month, closed
    - `acknowledgeDispute(disputeId, actorId, req)` — transition: disputed → pending_resolution
    - `resolveDispute(disputeId, adminResponse, evidenceFile?, actorId, req)` — transition: pending_resolution|reopened → resolved
    - `reopenDispute(disputeId, staffComment, actorId, req)` — transition: resolved → reopened (staff-only)
    - `autoCloseResolvedDisputes()` — transition: resolved (30+ days) → closed (cron job)
  - [ ] 1.2 Implement `getDisputeQueue()`:
    - Query `payment_disputes` with JOINs: `payment_records` → `payment_batches` (tranche info), `users` (openedBy → staff name/role/LGA)
    - Filters: status (multi-select), LGA, date range, search (staff name)
    - Sort: `createdAt DESC` (most recent first)
    - Pagination: offset/limit pattern (same as existing services)
  - [ ] 1.3 Implement `acknowledgeDispute()`:
    1. Validate: dispute exists, status is `disputed`
    2. Update dispute: `SET status = 'pending_resolution', updatedAt = NOW()`
    3. Audit log: `'payment.dispute_acknowledged'` with `AuditService.logPiiAccessTx()`
    4. Queue notification to staff: "Your dispute is being reviewed"
  - [ ] 1.4 Implement `resolveDispute()`:
    1. Validate: dispute exists, status is `pending_resolution` or `reopened`
    2. Validate: adminResponse is non-empty string
    3. Begin transaction
    4. If evidence file provided: upload to S3 (`dispute-evidence/{disputeId}/{uuid}.{ext}`), create `payment_files` record with `entityType: 'dispute_evidence'`
    5. Update dispute: `SET status = 'resolved', adminResponse, resolvedBy = actorId, resolvedAt = NOW(), evidenceFileId, updatedAt = NOW()`
    6. Audit log: `'payment.dispute_resolved'`
    7. Commit transaction
    8. Queue notification email to staff (fire-and-forget, outside transaction)
    9. Emit Socket.io event to staff's user room: `io.to(\`user:${dispute.openedBy}\`).emit('dispute:resolved', { disputeId, status: 'resolved' })`
  - [ ] 1.5 Implement `reopenDispute()`:
    1. Validate: dispute exists, status is `resolved` (not `closed`)
    2. Validate: actor is the original `openedBy` staff member
    3. Validate: staffComment is non-empty (min 10 chars)
    4. Update dispute: `SET status = 'reopened', reopenCount = reopenCount + 1, updatedAt = NOW()`
    5. Append reopen comment — store as new field or separate table (simpler: append to `staffComment` with separator `\n---\n[Reopened: DATE]\n{comment}`)
    6. Audit log: `'payment.dispute_reopened'`
    7. Queue notification to Super Admin
  - [ ] 1.6 Implement `autoCloseResolvedDisputes()`:
    1. Query: `WHERE status = 'resolved' AND resolvedAt < NOW() - INTERVAL '30 days'`
    2. Batch update: `SET status = 'closed', updatedAt = NOW()`
    3. Audit log for each: `'payment.dispute_auto_closed'` (system actor)
    4. No notification — auto-close is silent
- [ ] Task 2: Create auto-close scheduled job (AC: #6)
  - [ ] 2.1 Create `apps/api/src/queues/dispute-autoclose.queue.ts` following `productivity-snapshot.queue.ts` pattern:
    - Lazy-init Redis connection
    - `upsertJobScheduler()` with cron: `'0 3 * * *'` (3:00 AM WAT daily)
    - Test mode guard: `if (isTestMode()) return`
    - Job handler calls `RemunerationService.autoCloseResolvedDisputes()`
  - [ ] 2.2 Create `apps/api/src/workers/dispute-autoclose.worker.ts`:
    - Worker processes auto-close job
    - Structured logging: `{ event: 'dispute.auto_close', closedCount }`
    - Concurrency: 1
  - [ ] 2.3 Register in `apps/api/src/workers/index.ts`:
    - Import worker
    - Log status in `initializeWorkers()`
    - Add to `closeAllWorkers()` Promise.all
    - Schedule via `scheduleDisputeAutoClose()` in `initializeWorkers()`
- [ ] Task 3: Add admin dispute API endpoints (AC: #1, #2, #3, #4, #5)
  - [ ] 3.1 Add routes to `apps/api/src/routes/remuneration.routes.ts` (extend existing):
    - `GET /disputes` — list all disputes (Super Admin only) with filters
    - `GET /disputes/stats` — queue statistics (Super Admin only)
    - `GET /disputes/:disputeId` — dispute detail (Super Admin only)
    - `PATCH /disputes/:disputeId/acknowledge` — acknowledge (Super Admin only)
    - `PATCH /disputes/:disputeId/resolve` — resolve with evidence (Super Admin only, multer for file upload)
    - `PATCH /disputes/:disputeId/reopen` — reopen (authenticated staff: enumerator, supervisor — owner only)
  - [ ] 3.2 Add controller methods in `apps/api/src/controllers/remuneration.controller.ts` (extend existing):
    - `getDisputeQueue(req, res)` — GET handler with query params for filters/pagination
    - `getDisputeStats(req, res)` — GET handler
    - `getDisputeDetail(req, res)` — GET handler
    - `acknowledgeDispute(req, res)` — PATCH handler
    - `resolveDispute(req, res)` — PATCH handler, processes multer file
    - `reopenDispute(req, res)` — PATCH handler
  - [ ] 3.3 Add Zod validation schemas:
    - `resolveDisputeSchema`: `{ adminResponse: z.string().min(1, 'Resolution response is required') }`
    - `reopenDisputeSchema`: `{ staffComment: z.string().min(10, 'Please describe why you are reopening') }`
    - `disputeQueueFiltersSchema`: `{ status?: z.array(z.enum([...])), lgaId?: z.string().uuid(), page?: z.number(), limit?: z.number() }`
  - [ ] 3.4 Add multer config for evidence uploads on resolve endpoint:
    - Memory storage (same as staff.routes.ts pattern)
    - Max file size: 10MB
    - Allowed MIME types: `image/png`, `image/jpeg`, `application/pdf`
  - [ ] 3.5 Evidence file download: reuse existing `GET /remuneration/files/:fileId` from Story 6-4 — no new endpoint needed, just ensure Super Admin can access dispute evidence files
- [ ] Task 4: Implement dispute resolution notification emails (AC: #3, #4, #5)
  - [ ] 4.1 Create `queueDisputeResolutionEmail()` export in `email.queue.ts` following the existing `queueStaffInvitationEmail()` pattern (L123). There is **no generic `queueEmail()`** — the file exports specialized functions per email type. Add `dispute-resolution` to the `EmailJob` union type.
  - [ ] 4.2 Add email templates in `EmailService`:
    - **Acknowledge email** — Subject: `[OSLRS] Your Payment Dispute is Being Reviewed`; Body: staff name, tranche info, "We've acknowledged your dispute and are reviewing it."
    - **Resolution email** — Subject: `[OSLRS] Payment Dispute Resolved — {trancheName}`; Body: staff name, tranche, amount (₦), admin response, "View details in your Payment History" link, evidence attached note if applicable
    - **Reopen notification (to admin)** — Reuse `queueDisputeNotificationEmail()` from Story 6-5 with `reopened` variant
  - [ ] 4.3 Fire-and-forget after transition: email failures should NOT roll back the state transition
- [ ] Task 5: Create Super Admin Payment Dispute Queue page (AC: #1, #2)
  - [ ] 5.1 Create `apps/web/src/features/remuneration/pages/PaymentDisputeQueuePage.tsx`:
    - Follow `AssessorQueuePage.tsx` split-panel pattern (lines 218-320):
      - Left panel: filter bar + dispute table (responsive width — full width when no selection, half when detail open)
      - Right panel: dispute detail with resolution actions (appears on row click)
    - Stats strip at top: Total Open (amber), Pending Resolution (blue), Resolved This Month (green), Closed (gray)
    - Filter bar: status multi-select, LGA dropdown, date range picker, text search (staff name)
    - Empty state: "No payment disputes. Staff payment issues will appear here when reported."
  - [ ] 5.2 Create `apps/web/src/features/remuneration/components/DisputeQueueTable.tsx`:
    - Follow `FraudDetectionTable.tsx` pattern — selectable rows, hover effect, keyboard navigation
    - Columns: Staff Name, Tranche, Amount (₦), Status (badge), Dispute Date, Reopen Count, Actions
    - Row click selects dispute → loads detail in right panel
    - Selected row highlight: `bg-neutral-100`
  - [ ] 5.3 Create `apps/web/src/features/remuneration/components/DisputeStatusBadge.tsx`:
    - Follow `FraudSeverityBadge.tsx` pattern (config map + color scheme):
    ```typescript
    const statusConfig = {
      disputed: { label: 'Disputed', className: 'bg-amber-100 text-amber-700' },
      pending_resolution: { label: 'Pending', className: 'bg-blue-100 text-blue-700' },
      resolved: { label: 'Resolved', className: 'bg-green-100 text-green-700' },
      reopened: { label: 'Reopened', className: 'bg-orange-100 text-orange-700' },
      closed: { label: 'Closed', className: 'bg-gray-100 text-gray-700' },
    };
    ```
  - [ ] 5.4 Create `apps/web/src/features/remuneration/components/DisputeDetailPanel.tsx`:
    - Follow `EvidencePanel.tsx` pattern from AssessorQueuePage
    - Sections:
      1. **Staff Info**: name, role, LGA, email
      2. **Payment Details**: tranche name, amount (₦ formatted), batch date, bank reference
      3. **Dispute Timeline**: opened date, status changes, reopen count
      4. **Staff Comment**: full text of staff's complaint (+ reopen comments if any)
      5. **Admin Response** (if resolved): response text, evidence file download link, resolved by, resolved date
      6. **Action Buttons**: context-sensitive based on dispute status (see Task 5.5)
  - [ ] 5.5 Action buttons by status:
    - `disputed` → "Acknowledge" button (blue)
    - `pending_resolution` → "Resolve" button (green) — opens ResolutionDialog
    - `reopened` → "Resolve" button (green) — opens ResolutionDialog
    - `resolved` → read-only (no admin actions; staff can reopen via their Payment History)
    - `closed` → read-only, "Closed — No further action" label
- [ ] Task 6: Create Resolution Dialog (AC: #4)
  - [ ] 6.1 Create `apps/web/src/features/remuneration/components/ResolutionDialog.tsx`:
    - Use Radix UI AlertDialog pattern (from `DeactivateDialog.tsx`)
    - Props: `dispute`, `isOpen`, `onClose`, `onSuccess`
    - Content:
      1. Dispute summary: staff name, tranche, amount, original complaint
      2. Textarea for "Resolution Response" (required, min 1 char)
      3. File upload for "Evidence" (optional): drag-and-drop or click area for PNG/JPEG/PDF, max 10MB, file preview
      4. Green-themed "Resolve Dispute" button (resolution is a positive action)
    - Loading spinner on submit, disabled state during mutation
    - On success: close dialog, show success toast "Dispute resolved. Staff member notified.", invalidate dispute queue queries
  - [ ] 6.2 Wire up TanStack Query mutation:
    - `useResolveDispute()` hook — uses `FormData` for multipart upload (text + file)
    - `mutationFn`: `PATCH /api/v1/remuneration/disputes/:disputeId/resolve` with `FormData`
    - `onSuccess`: invalidate `['disputes']` query keys, show success toast
    - `onError`: show error toast with server message
- [ ] Task 7: Add staff reopen capability to Payment History (AC: #5)
  - [ ] 7.1 Extend `StaffPaymentHistoryPage.tsx` (from Story 6-5):
    - When a payment record's dispute status is `resolved`, show "Reopen" button in the expanded row detail
    - "Reopen" button opens a dialog (same AlertDialog pattern) with textarea for new comment (min 10 chars)
    - Amber-themed "Reopen Dispute" button
  - [ ] 7.2 Create `ReopenDisputeDialog.tsx` in `apps/web/src/features/remuneration/components/`:
    - Props: `dispute`, `isOpen`, `onClose`, `onSuccess`
    - Show reopen count: "This dispute has been reopened {n} time(s)"
    - Textarea for new staff comment
    - On success: invalidate payment history queries, show toast "Dispute reopened. The admin will be notified."
  - [ ] 7.3 Wire up mutation hook `useReopenDispute()`:
    - `mutationFn`: `PATCH /api/v1/remuneration/disputes/:disputeId/reopen` with `{ staffComment }`
    - Authorization: only the original `openedBy` staff member can reopen
- [ ] Task 8: Wire up frontend routing and sidebar (AC: #1)
  - [ ] 8.1 Add sidebar item in `sidebarConfig.ts` for Super Admin (after 'Fraud Review' or after 'Remuneration', if Story 6-4 added one):
    ```typescript
    { label: 'Payment Disputes', href: '/dashboard/super-admin/disputes', icon: Scale },
    ```
    Import `Scale` from `lucide-react` (justice scale — appropriate for dispute resolution). Alternative: `Gavel`.
  - [ ] 8.2 Add lazy import in `App.tsx`:
    ```typescript
    const PaymentDisputeQueuePage = lazy(() => import('./features/remuneration/pages/PaymentDisputeQueuePage'));
    ```
  - [ ] 8.3 Add route under super-admin routes:
    ```typescript
    {/* Story 6.6: Payment Dispute Queue */}
    <Route path="disputes" element={<Suspense fallback={<DashboardLoadingFallback />}><PaymentDisputeQueuePage /></Suspense>} />
    ```
- [ ] Task 9: Add API client and hooks (AC: #1, #2, #3, #4)
  - [ ] 9.1 Extend `apps/web/src/features/remuneration/api/remuneration.api.ts`:
    - `getDisputeQueue(params)` — GET `/remuneration/disputes` with filters/pagination
    - `getDisputeStats()` — GET `/remuneration/disputes/stats`
    - `getDisputeDetail(disputeId)` — GET `/remuneration/disputes/${disputeId}`
    - `acknowledgeDispute(disputeId)` — PATCH `/remuneration/disputes/${disputeId}/acknowledge`
    - `resolveDispute(disputeId, formData)` — PATCH `/remuneration/disputes/${disputeId}/resolve` (multipart)
    - `reopenDispute(disputeId, data)` — PATCH `/remuneration/disputes/${disputeId}/reopen`
  - [ ] 9.2 Extend `apps/web/src/features/remuneration/hooks/useRemuneration.ts`:
    - Query key factory:
      ```typescript
      export const disputeKeys = {
        all: ['disputes'] as const,
        queue: (filters: DisputeQueueFilters) => [...disputeKeys.all, 'queue', filters] as const,
        detail: (id: string) => [...disputeKeys.all, 'detail', id] as const,
        stats: () => [...disputeKeys.all, 'stats'] as const,
      };
      ```
    - `useDisputeQueue(filters)` — TanStack Query hook, staleTime: 30s
    - `useDisputeDetail(disputeId)` — TanStack Query hook, enabled when disputeId truthy
    - `useDisputeStats()` — TanStack Query hook
    - `useAcknowledgeDispute()` — mutation hook, invalidates `disputeKeys.all`
    - `useResolveDispute()` — mutation hook, invalidates `disputeKeys.all`
    - `useReopenDispute()` — mutation hook, invalidates `['payment-history']` + `disputeKeys.all`
- [ ] Task 10: Add backend tests (AC: #8)
  - [ ] 10.1 Add dispute resolution tests to `apps/api/src/controllers/__tests__/remuneration.controller.test.ts` (extend from Stories 6-4/6-5):
    - Test: `GET /remuneration/disputes` returns paginated dispute queue (Super Admin only)
    - Test: `GET /remuneration/disputes` filters by status, LGA
    - Test: `GET /remuneration/disputes` returns 403 for non-Super Admin
    - Test: `GET /remuneration/disputes/stats` returns correct aggregate counts
    - Test: `GET /remuneration/disputes/:disputeId` returns full detail with joins
    - Test: `PATCH /remuneration/disputes/:disputeId/acknowledge` transitions disputed → pending_resolution
    - Test: `PATCH /remuneration/disputes/:disputeId/acknowledge` rejects if status is not `disputed` → 400
    - Test: `PATCH /remuneration/disputes/:disputeId/resolve` transitions pending_resolution → resolved with adminResponse
    - Test: `PATCH /remuneration/disputes/:disputeId/resolve` uploads evidence file to S3 and creates payment_files record
    - Test: `PATCH /remuneration/disputes/:disputeId/resolve` works without evidence file (evidence is optional)
    - Test: `PATCH /remuneration/disputes/:disputeId/resolve` rejects if adminResponse empty → 400
    - Test: `PATCH /remuneration/disputes/:disputeId/resolve` rejects if status not `pending_resolution` or `reopened` → 400
    - Test: `PATCH /remuneration/disputes/:disputeId/reopen` transitions resolved → reopened, increments reopenCount
    - Test: `PATCH /remuneration/disputes/:disputeId/reopen` rejects if actor is not openedBy → 403
    - Test: `PATCH /remuneration/disputes/:disputeId/reopen` rejects if status is `closed` → 400
    - Test: `PATCH /remuneration/disputes/:disputeId/reopen` rejects if staffComment < 10 chars → 400
    - Test: notification email queued after resolve (mock `queueDisputeResolutionEmail`)
    - Test: notification email queued after acknowledge (mock `queueDisputeNotificationEmail`)
  - [ ] 10.2 Add auto-close tests to `apps/api/src/services/__tests__/remuneration.service.test.ts`:
    - Test: `autoCloseResolvedDisputes()` closes disputes resolved 30+ days ago
    - Test: `autoCloseResolvedDisputes()` does NOT close disputes resolved < 30 days ago
    - Test: `autoCloseResolvedDisputes()` logs audit for each closed dispute
    - Test: `autoCloseResolvedDisputes()` returns count of closed disputes
- [ ] Task 11: Add frontend tests (AC: #8)
  - [ ] 11.1 Create `apps/web/src/features/remuneration/pages/__tests__/PaymentDisputeQueuePage.test.tsx`:
    - Test: renders stats strip with correct counts
    - Test: renders dispute table with columns
    - Test: displays empty state when no disputes
    - Test: clicking row opens detail panel
    - Test: filter by status works
    - Test: pagination works
  - [ ] 11.2 Create `apps/web/src/features/remuneration/components/__tests__/ResolutionDialog.test.tsx`:
    - Test: renders dispute summary and form fields
    - Test: validates required resolution response
    - Test: submit button disabled during loading
    - Test: file upload accepts PNG/JPEG/PDF
    - Test: shows success toast after submission
    - Test: shows error toast on failure
  - [ ] 11.3 Create `apps/web/src/features/remuneration/components/__tests__/DisputeDetailPanel.test.tsx`:
    - Test: renders staff info, payment details, dispute timeline
    - Test: shows "Acknowledge" button for `disputed` status
    - Test: shows "Resolve" button for `pending_resolution` status
    - Test: shows read-only view for `closed` status
    - Test: shows admin response and evidence link when resolved
  - [ ] 11.4 Create `apps/web/src/features/remuneration/components/__tests__/ReopenDisputeDialog.test.tsx`:
    - Test: renders reopen count
    - Test: validates minimum 10 character comment
    - Test: submit disabled during loading
    - Test: shows success toast after reopen
- [ ] Task 12: Run full test suites and verify zero regressions (AC: #8)
  - [ ] 12.1 Run API tests: `pnpm vitest run apps/api/src/`
  - [ ] 12.2 Run web tests: `cd apps/web && pnpm vitest run`
- [ ] Task 13: Update story status and dev agent record

## Dev Notes

### Dispute State Machine — Complete Lifecycle (This Story)

```
                     Story 6-5                           Story 6-6
                  ┌─────────────┐    ┌──────────────────────────────────────────────────────┐
                  │             │    │                                                      │
Active ──[staff]──→ Disputed ──[admin: acknowledge]──→ PendingResolution                   │
                                                            │                               │
                                                    [admin: resolve(evidence)]              │
                                                            │                               │
                                                            ▼                               │
                                                       Resolved ──[auto: 30 days]──→ Closed │
                                                            │                               │
                                                     [staff: reopen]                        │
                                                            │                               │
                                                            ▼                               │
                                                       Reopened ──[admin: resolve]──→ Resolved
                                                                                            │
                                                                                            │
                  └─────────────────────────────────────────────────────────────────────────┘
```

**Valid transitions per role:**
| From | To | Actor | Action |
|------|----|-------|--------|
| disputed | pending_resolution | Super Admin | acknowledge |
| pending_resolution | resolved | Super Admin | resolve (with evidence) |
| resolved | reopened | Staff (openedBy only) | reopen (with comment) |
| resolved | closed | System (cron) | auto-close (30 days) |
| reopened | resolved | Super Admin | resolve (with evidence) |

### Notification Email Pattern

There is **no generic `queueEmail()` function**. The `email.queue.ts` file exports specialized functions per email type. Create `queueDisputeResolutionEmail()` following the same pattern:

```typescript
// Story 6-5 already added: queueDisputeNotificationEmail() — used for staff→admin notifications
// This story adds: queueDisputeResolutionEmail() — used for admin→staff resolution notifications

import { queueDisputeResolutionEmail } from '../queues/email.queue.js';

// After resolve transition — fire-and-forget
try {
  await queueDisputeResolutionEmail({
    staffName: staff.fullName,
    staffEmail: staff.email,
    trancheName: batch.trancheName,
    amount: formatNaira(record.amount),
    adminResponse,
    hasEvidence: !!evidenceFileId,
  });
} catch (err) {
  logger.warn({ event: 'dispute.resolution_notification_failed', disputeId, error: err.message });
}
```

Add `dispute-resolution` to the `EmailJob` union type in `@oslsr/types`.

### Split-Panel Layout Pattern (AssessorQueuePage)

Follow `AssessorQueuePage.tsx` (lines 218-320) exactly:

```typescript
<div className="flex gap-6">
  {/* Left panel — queue table */}
  <div className={`${selectedDisputeId ? 'w-1/2' : 'w-full'} transition-all`}>
    <DisputeQueueTable
      disputes={disputes}
      selectedId={selectedDisputeId}
      onSelectDispute={setSelectedDisputeId}
    />
  </div>

  {/* Right panel — detail + actions */}
  {selectedDisputeId && (
    <div className="w-1/2">
      <DisputeDetailPanel
        disputeId={selectedDisputeId}
        onAcknowledge={handleAcknowledge}
        onResolve={() => setShowResolutionDialog(true)}
        onClose={() => setSelectedDisputeId(null)}
      />
    </div>
  )}
</div>
```

### Evidence Upload (FormData Multipart)

Resolution with evidence requires `FormData` for the frontend → backend upload:

```typescript
// Frontend: remuneration.api.ts
export async function resolveDispute(disputeId: string, data: { adminResponse: string; evidence?: File }) {
  const formData = new FormData();
  formData.append('adminResponse', data.adminResponse);
  if (data.evidence) formData.append('evidence', data.evidence);

  return api.patch(`/remuneration/disputes/${disputeId}/resolve`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
```

```typescript
// Backend: remuneration.routes.ts
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPEG, and PDF files are allowed'));
  },
});

router.patch('/disputes/:disputeId/resolve', authenticate, authorize('super_admin'), evidenceUpload.single('evidence'), controller.resolveDispute);
```

### S3 Evidence Upload

Reuse `PhotoProcessingService` S3 config pattern:

```typescript
const s3Key = `dispute-evidence/${disputeId}/${uuidv7()}.${ext}`;

await s3Client.send(new PutObjectCommand({
  Bucket: process.env.S3_BUCKET_NAME || 'oslsr-media',
  Key: s3Key,
  Body: buffer,
  ContentType: mimeType,
}));
```

### Auto-Close Cron Job

Follow `productivity-snapshot.queue.ts` pattern exactly:

```typescript
// dispute-autoclose.queue.ts
export async function scheduleDisputeAutoClose() {
  if (isTestMode()) return;
  const queue = getDisputeAutoCloseQueue();
  await queue.upsertJobScheduler(
    'dispute-auto-close',
    { pattern: '0 3 * * *' }, // 3:00 AM WAT daily (2:00 UTC)
    { name: 'dispute-auto-close' }
  );
}
```

### Reopen Comment Storage

Append reopen comments to `staffComment` with date separator for full history:

```typescript
// In reopenDispute()
const separator = '\n\n---\n';
const reopenEntry = `[Reopened ${new Date().toISOString()}]\n${newComment}`;
const updatedComment = dispute.staffComment + separator + reopenEntry;

await db.update(paymentDisputes)
  .set({
    status: 'reopened',
    staffComment: updatedComment,
    reopenCount: sql`reopen_count + 1`,
    updatedAt: new Date(),
  })
  .where(eq(paymentDisputes.id, disputeId));
```

This keeps the full conversation history in a single field without needing a separate `dispute_comments` table — appropriate at ~800 records/year scale.

### Audit Action Types

All dispute transitions must be audited:
- `'payment.dispute_acknowledged'` — admin acknowledges
- `'payment.dispute_resolved'` — admin resolves (with or without evidence)
- `'payment.dispute_reopened'` — staff reopens
- `'payment.dispute_auto_closed'` — system auto-closes

If Story 6-1 is done, register these in the expanded `AUDIT_ACTIONS` constant. If not, use custom action strings with `logPiiAccessTx()` — backward compatible.

### File Change Scope

**New files (backend):**
- `apps/api/src/queues/dispute-autoclose.queue.ts` — Auto-close scheduler (cron)
- `apps/api/src/workers/dispute-autoclose.worker.ts` — Auto-close worker

**New files (frontend):**
- `apps/web/src/features/remuneration/pages/PaymentDisputeQueuePage.tsx` — Admin dispute queue page
- `apps/web/src/features/remuneration/components/DisputeQueueTable.tsx` — Queue table
- `apps/web/src/features/remuneration/components/DisputeDetailPanel.tsx` — Detail/action panel
- `apps/web/src/features/remuneration/components/DisputeStatusBadge.tsx` — Status badge
- `apps/web/src/features/remuneration/components/ResolutionDialog.tsx` — Resolve dialog
- `apps/web/src/features/remuneration/components/ReopenDisputeDialog.tsx` — Reopen dialog (staff)
- `apps/web/src/features/remuneration/pages/__tests__/PaymentDisputeQueuePage.test.tsx`
- `apps/web/src/features/remuneration/components/__tests__/ResolutionDialog.test.tsx`
- `apps/web/src/features/remuneration/components/__tests__/DisputeDetailPanel.test.tsx`
- `apps/web/src/features/remuneration/components/__tests__/ReopenDisputeDialog.test.tsx`

**Modified files:**
- `apps/api/src/services/remuneration.service.ts` — Add admin dispute methods (acknowledge, resolve, autoClose, getDisputeQueue, getDisputeStats)
- `apps/api/src/controllers/remuneration.controller.ts` — Add dispute queue/resolution handlers
- `apps/api/src/routes/remuneration.routes.ts` — Add admin dispute routes (GET /disputes, PATCH /disputes/:id/acknowledge, /resolve, /reopen)
- `apps/api/src/workers/index.ts` — Register dispute-autoclose worker + schedule job
- `apps/api/src/queues/email.queue.ts` — Add `queueDisputeResolutionEmail()` export
- `packages/types/src/email.ts` — Add `DisputeResolutionJob` to `EmailJob` union type (L191)
- `apps/web/src/features/remuneration/api/remuneration.api.ts` — Add dispute queue + resolution API functions
- `apps/web/src/features/remuneration/hooks/useRemuneration.ts` — Add dispute query/mutation hooks + key factory
- `apps/web/src/features/remuneration/pages/StaffPaymentHistoryPage.tsx` — Add "Reopen" button for resolved disputes
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Add "Payment Disputes" sidebar item for Super Admin
- `apps/web/src/App.tsx` — Add lazy import + route for PaymentDisputeQueuePage

**Schema changes:** None — `payment_disputes` table already created in Story 6-5. No new tables.

### Project Structure Notes

- All backend changes extend existing `remuneration.*` files from Stories 6-4/6-5 (service, controller, routes)
- New cron job follows existing `productivity-snapshot.queue.ts` + worker pattern exactly
- Frontend extends `apps/web/src/features/remuneration/` directory (NOT creating a separate `features/payment/` directory)
- **Do NOT create separate dispute route file** — extend `remuneration.routes.ts` since disputes are a sub-resource of remuneration
- **Do NOT create a new BullMQ email queue** — use existing `email-notification` queue via new specialized function

### Testing Standards

- Use `vi.hoisted()` + `vi.mock()` pattern for controller tests
- Mock `@aws-sdk/client-s3` commands for evidence upload tests
- Mock `email.queue.ts` specialized functions for notification tests
- Mock `db.transaction()` for service-level tests
- Use `data-testid` selectors in frontend tests (A3: no CSS class selectors)
- Run web tests: `cd apps/web && pnpm vitest run`
- Run API tests: `pnpm vitest run apps/api/src/`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#L1889-1900] — Story 6-6 acceptance criteria
- [Source: _bmad-output/planning-artifacts/epics.md#L1876-1887] — Story 6-5 acceptance criteria (upstream)
- [Source: _bmad-output/implementation-artifacts/prep-5-remuneration-domain-modeling.md#L177-265] — Dispute state machine + schema sketch
- [Source: _bmad-output/implementation-artifacts/6-5-staff-payment-history-dispute-mechanism.md] — Story 6-5 (upstream: payment_disputes table, openDispute(), queueDisputeNotificationEmail())
- [Source: _bmad-output/implementation-artifacts/6-4-staff-remuneration-bulk-recording.md] — Story 6-4 (upstream: payment tables, remuneration service, API routes, payment_files)
- [Source: apps/web/src/features/dashboard/pages/AssessorQueuePage.tsx#L218-320] — Split-panel layout pattern (template for PaymentDisputeQueuePage)
- [Source: apps/web/src/features/dashboard/components/FraudSeverityBadge.tsx#L6-47] — Status badge pattern (template for DisputeStatusBadge)
- [Source: apps/web/src/features/staff/components/StaffActionsMenu.tsx#L69-172] — DropdownMenu with conditional actions pattern
- [Source: apps/web/src/features/dashboard/hooks/useAssessor.ts#L23-80] — Query key factory + mutation hook pattern
- [Source: apps/web/src/features/staff/components/DeactivateDialog.tsx#L27-90] — AlertDialog pattern (template for ResolutionDialog)
- [Source: apps/api/src/realtime/index.ts#L107,154-156] — Socket.io user room emission pattern
- [Source: apps/api/src/queues/email.queue.ts#L123-192] — Specialized email function pattern (queueStaffInvitationEmail)
- [Source: apps/api/src/queues/productivity-snapshot.queue.ts] — BullMQ cron scheduler pattern (template for dispute-autoclose)
- [Source: apps/api/src/workers/index.ts] — Worker registration pattern
- [Source: apps/api/src/services/photo-processing.service.ts#L15-43,145-155] — S3Client config + upload pattern
- [Source: apps/api/src/middleware/upload.middleware.ts#L32-39] — Multer config pattern
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts#L134-150] — Super Admin sidebar (add Payment Disputes)
- [Source: apps/web/src/App.tsx#L570-676] — Super Admin routes (add disputes route)

### Previous Story Intelligence

**From Story 6-5 (Staff Payment History & Dispute Mechanism — direct upstream):**
- `payment_disputes` table created with all 12 columns and 4 indexes
- `openDispute()` method in RemunerationService — validates ownership, status, creates dispute + updates payment_records
- `queueDisputeNotificationEmail()` created in email.queue.ts — reuse for reopen notifications to admin
- Staff Payment History page exists — extend with "Reopen" button for resolved disputes
- ReportIssueDialog pattern established — reuse AlertDialog pattern for ResolutionDialog and ReopenDisputeDialog
- Status badge colors: active=green, disputed=amber, corrected=gray — extend with pending_resolution=blue, resolved=green, reopened=orange, closed=gray
- Dispute routes mounted at `POST /disputes`, `GET /disputes/mine` — extend with admin routes

**From Story 6-4 (Staff Remuneration Bulk Recording):**
- `payment_files` table with `entityType: 'dispute_evidence'` already in enum — ready for evidence uploads
- S3 receipt upload pattern via `PutObjectCommand` — reuse for evidence
- `GET /remuneration/files/:fileId` endpoint exists — reuse for evidence download
- Multer config for receipt uploads (10MB, PNG/JPEG/PDF) — identical config for evidence

**From Story 6-1 (Immutable Audit Logs):**
- Expanded `AUDIT_ACTIONS` constant for audit logging
- `logPiiAccessTx()` for transactional audit within state transitions

### Git Intelligence

Recent commits are Epic 5 completions and Epic 6 prep:
- `c240b19 fix(web): add consistent p-6 padding to 3 dashboard pages (prep-2)` — latest
- `bd5a443 docs: complete Epic 5 retrospective and define Epic 6 prep phase`
- `92f8a2b fix(api,web): use dynamic productivity targets across all dashboards`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

### File List

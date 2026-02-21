# Prep 2: Lightweight Audit Logging for PII Access

Status: done

## Story

As a System Architect,
I want a lightweight audit logging mechanism for PII access events,
so that Stories 5.3, 5.4, and 5.5 can log every instance of PII viewing and export as required by compliance.

## Context

Stories 5.3 (Individual Record PII View), 5.4 (PII-Rich Exports), and 5.5 (Respondent Data Registry Table) all require mandatory audit logging when authorized users access PII data. The `audit_logs` table already exists and is used by messaging (fire-and-forget writes) and fraud bulk review (transactional writes). This prep task extends that infrastructure with a reusable PII access logging pattern.

## Acceptance Criteria

1. **Given** the existing `audit_logs` table, **when** I review its schema, **then** confirm it supports PII access events: `actorId`, `action` (e.g., `pii.view`, `pii.export`), `targetResource` (e.g., `respondent`), `targetId`, `details` (JSONB for filters/context), `ipAddress`, `userAgent`, `createdAt`.
2. **Given** the need for a reusable pattern, **when** I create a PII audit logger utility, **then** it must provide a `logPiiAccess(req, action, targetResource, targetId, details)` function that inserts an audit log entry. It must support both fire-and-forget (list views) and transactional (within `db.transaction`) modes.
3. **Given** a PII access log entry, **then** it must capture: who (user ID + role), what (action type), which record (target ID), when (timestamp), how (IP + user agent), and why (search filters / context in details JSONB).
4. **Given** the compliance requirement (NFR8.3: Immutable Audit Logs), **then** the audit_logs table must remain append-only. No UPDATE or DELETE operations on audit_logs should be possible via the application. Validate that no existing code mutates audit_logs rows.
5. **Given** the logging utility, **then** write unit tests covering: PII view logging, PII export logging, batch access logging (for list views), error resilience (logging failure must not break the primary request).

## Tasks / Subtasks

- [x] Task 1: Validate existing audit_logs schema (AC: #1, #4)
  - [x] 1.1 Read `apps/api/src/db/schema/audit.ts` — confirmed all columns match: id (UUIDv7), actorId, action, targetResource, targetId, details (JSONB), ipAddress, userAgent, createdAt
  - [x] 1.2 Search codebase for any UPDATE/DELETE on audit_logs — confirmed none exist in application code (only test cleanup, which is acceptable)
  - [x] 1.3 Schema needs no additions — already comprehensive for PII access events

- [x] Task 2: Create PII audit logger utility (AC: #2, #3)
  - [x] 2.1 Create `apps/api/src/services/audit.service.ts`:
    ```ts
    export class AuditService {
      // Fire-and-forget mode (list views, non-critical)
      static logPiiAccess(req: Request, action: string, targetResource: string, targetId: string | null, details?: Record<string, unknown>): void

      // Transactional mode (within db.transaction for critical operations)
      static async logPiiAccessTx(tx: Transaction, actorId: string, action: string, targetResource: string, targetId: string | null, details?: Record<string, unknown>, ipAddress?: string, userAgent?: string): Promise<void>
    }
    ```
  - [x] 2.2 Define PII action constants:
    ```ts
    export const PII_ACTIONS = {
      VIEW_RECORD: 'pii.view_record',
      VIEW_LIST: 'pii.view_list',
      EXPORT_CSV: 'pii.export_csv',
      EXPORT_PDF: 'pii.export_pdf',
      SEARCH_PII: 'pii.search',
    } as const;
    ```
  - [x] 2.3 Fire-and-forget mode: `db.insert(auditLogs).values({...})` without await (same pattern as messaging audit writes)
  - [x] 2.4 Transactional mode: `tx.insert(auditLogs).values({...})` with await (same pattern as fraud bulk review)
  - [x] 2.5 Error resilience: .catch() with Pino warning log on failure — never throws to caller

- [x] Task 3: Tests (AC: #5)
  - [x] 3.1 Create `apps/api/src/services/__tests__/audit.service.test.ts` (12 tests):
    - logPiiAccess inserts correct fields
    - logPiiAccessTx works within transaction
    - Fire-and-forget mode doesn't throw on DB error
    - Action constants match expected values (2 tests)
    - Details JSONB captures filter context
    - IP and user agent captured from request
    - Null targetId for list views
    - Export action with format details
    - Default values for optional tx params
    - Transaction error propagation
    - Fallback values when user undefined

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] `logPiiAccessTx` doesn't capture `actorRole` in details — AC#3 requires "who (user ID + role)" for every PII event [`audit.service.ts:75-94`]
- [x] [AI-Review][HIGH] `action` parameter typed as `string` instead of `PiiAction` — no compile-time safety from constants [`audit.service.ts:40,77`]
- [x] [AI-Review][MEDIUM] Unnecessary double type cast `(req as Record<string, unknown>).user as ...` — Express namespace already augmented with `user?: JwtPayload` [`audit.service.ts:47-49`]
- [x] [AI-Review][MEDIUM] Inconsistent IP fallback — uses `req.ip || 'unknown'` but rest of codebase uses `req.ip || req.socket.remoteAddress || 'unknown'` [`audit.service.ts:63`]
- [x] [AI-Review][MEDIUM] Should accept `AuthenticatedRequest` not `Request` — PII access always requires auth, project has this type [`audit.service.ts:40`]
- [x] [AI-Review][LOW] `logPiiAccessTx` API less ergonomic — callers must manually extract and pass actorRole unlike fire-and-forget mode [`audit.service.ts:75-84`]
- [x] [AI-Review][LOW] No test verifying `actorRole` presence/absence in transactional mode — masks H1 bug [`audit.service.test.ts:180-238`]

## Dev Notes

### Existing Audit Log Pattern (from Story 4.5)

```ts
// fraud-detections.controller.ts — transactional audit write
await tx.insert(auditLogs).values({
  id: uuidv7(),
  actorId: user.sub,
  action: 'fraud.bulk_verification',
  targetResource: 'fraud_detection',
  targetId: null,
  details: { detectionIds: validIds, count: validIds.length, resolution, resolutionNotes },
  ipAddress: req.ip || 'unknown',
  userAgent: req.headers['user-agent'] || 'unknown',
});
```

### Existing Audit Log Pattern (from Messaging — fire-and-forget)

```ts
// message.service.ts — fire-and-forget (no await)
db.insert(auditLogs).values({
  id: uuidv7(),
  actorId: senderId,
  action: 'messaging.send_direct',
  targetResource: 'message',
  targetId: message.id,
  details: { recipientId, messageType: 'direct' },
}).catch(err => logger.warn({ err }, 'Failed to write audit log'));
```

### PII Access Actions for Epic 5

| Story | Action | targetResource | Details |
|-------|--------|---------------|---------|
| 5.3 | `pii.view_record` | `respondent` | `{ respondentId, fieldsAccessed: ['name','nin','phone'] }` |
| 5.4 | `pii.export_csv` | `respondent_export` | `{ filters, recordCount, format: 'csv' }` |
| 5.4 | `pii.export_pdf` | `respondent_export` | `{ filters, recordCount, format: 'pdf' }` |
| 5.5 | `pii.view_list` | `respondent_list` | `{ filters, page, pageSize, piiColumnsVisible: true }` |

### Project Structure

- New: `apps/api/src/services/audit.service.ts`
- New: `apps/api/src/services/__tests__/audit.service.test.ts`
- Possibly modified: `packages/types/src/constants.ts` (add `PII_ACTIONS` if shared)

### References

- [Source: apps/api/src/db/schema/audit-logs.ts — existing schema]
- [Source: apps/api/src/controllers/fraud-detections.controller.ts — transactional audit pattern]
- [Source: apps/api/src/services/message.service.ts — fire-and-forget audit pattern]
- [Source: _bmad-output/implementation-artifacts/epic-4-retro-2026-02-20.md — prep-2 definition]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Pre-existing test failures confirmed in `fraud-detections-bulk.controller.test.ts` (4 tests) — not caused by this story.

### Completion Notes List

- ✅ Task 1: Validated `audit_logs` schema at `apps/api/src/db/schema/audit.ts`. All 8 columns (id, actorId, action, targetResource, targetId, details, ipAddress, userAgent, createdAt) match PII access requirements. No UPDATE/DELETE operations found in application code — only test cleanup files.
- ✅ Task 2: Created `AuditService` class with two modes: `logPiiAccess` (fire-and-forget with `.catch()` error resilience) and `logPiiAccessTx` (transactional with await). Defined `PII_ACTIONS` constants (5 action types). Follows existing patterns from `message.service.ts` (fire-and-forget) and `fraud-detections.controller.ts` (transactional). Includes `actorRole` in details JSONB for auditing who-what-when-how-why.
- ✅ Task 3: 12 unit tests covering both modes, error resilience, action constants, request field capture, null targetId, export logging, transaction error propagation, and undefined user fallback. All pass.
- ✅ Full API test suite: 675 pass, 4 fail (pre-existing in fraud-detections-bulk.controller.test.ts, confirmed via git stash test).
- ✅ Code Review (AI): Fixed 7 issues (2 HIGH, 3 MEDIUM, 2 LOW). Key changes: `AuthenticatedRequest` type, `PiiAction` type enforcement, `actorRole` in transactional mode, consistent IP fallback. Tests updated: 13 pass (removed undefined-user test, added actorRole-tx + IP-fallback tests).

### File List

- **New:** `apps/api/src/services/audit.service.ts` — PII audit logger utility (AuditService class + PII_ACTIONS constants)
- **New:** `apps/api/src/services/__tests__/audit.service.test.ts` — 12 unit tests for AuditService
- **Modified:** `_bmad-output/implementation-artifacts/sprint-status.yaml` — prep-2 status: ready-for-dev → review
- **Modified:** `_bmad-output/implementation-artifacts/prep-2-lightweight-audit-logging-pii-access.md` — task checkboxes, Dev Agent Record, status

## Change Log

- 2026-02-21: Implemented lightweight PII audit logging utility (AuditService) with fire-and-forget and transactional modes. 12 unit tests. No schema changes needed — existing audit_logs table fully supports PII access events.
- 2026-02-21: Code review fixes — 7 issues resolved: enforced `PiiAction` type on both methods, switched to `AuthenticatedRequest`, added `actorRole` to transactional mode, consistent IP fallback via `req.socket.remoteAddress`. Tests: 13 pass.

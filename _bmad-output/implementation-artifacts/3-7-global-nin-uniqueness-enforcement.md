# Story 3.7: Global NIN Uniqueness Enforcement

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a System,
I want to prevent the same individual from being registered multiple times,
so that the registry maintains high data integrity.

## Acceptance Criteria

**AC3.7.1 — Ingestion-Time NIN Duplicate Rejection:**
**Given** a new survey submission (Enumerator, Public, or Clerk),
**When** the ingestion worker processes the record and extracts the NIN,
**Then** it must check the `respondents` table for an existing NIN,
**And** if found, the submission must be marked as rejected with a `processingError` containing the error code `NIN_DUPLICATE` and the original registration date (e.g., "This individual was already registered on 2026-02-10T14:30:00.000Z via enumerator"),
**And** the submission record is preserved in the `submissions` table (not deleted) with `processed: true` and the error stored in `processingError`,
**And** no new respondent record is created,
**And** no duplicate respondent linking occurs (the old behavior of silently linking is removed).

**AC3.7.2 — Cross-Table NIN Uniqueness (Users + Respondents):**
**Given** a submission with a NIN that already exists in the `users` table (staff member),
**When** the ingestion worker processes the record,
**Then** it must also check the `users` table for an existing NIN,
**And** if found, the submission must be rejected with error code `NIN_DUPLICATE_STAFF` and message "This NIN belongs to a registered staff member" (prevents staff from being double-registered as respondents),
**And** the respondents table check takes priority (checked first).

**AC3.7.3 — Pre-Submission NIN Check API:**
**Given** an authenticated user (Enumerator, Public, or Clerk),
**When** they call `POST /api/v1/forms/check-nin` with body `{ "nin": "61961438053" }`,
**Then** the API validates the NIN format (11 digits, Modulus 11 checksum),
**And** checks both `respondents.nin` and `users.nin` tables,
**And** returns `{ "data": { "available": true } }` if NIN is not registered,
**Or** returns `{ "data": { "available": false, "reason": "respondent", "registeredAt": "2026-02-10T14:30:00.000Z" } }` if found in respondents,
**Or** returns `{ "data": { "available": false, "reason": "staff" } }` if found in users (do NOT expose staff registration date),
**And** the endpoint is rate-limited to 20 requests per minute per user.

**AC3.7.4 — Frontend NIN Pre-Validation (FormFillerPage):**
**Given** an Enumerator or Public User filling out a form,
**When** they enter a NIN value and the field loses focus (onBlur),
**Then** the system validates format client-side (11 digits, Modulus 11),
**And** if format is valid, calls the check-nin API to verify availability,
**And** if NIN is already registered, displays an inline error: "This NIN is already registered (since [date]). This form cannot be submitted for a duplicate NIN.",
**And** the Submit/Continue button is disabled while a NIN duplicate error exists,
**And** offline mode: if the API is unreachable, skip the pre-check (ingestion worker catches it later).

**AC3.7.5 — Frontend NIN Pre-Validation (ClerkDataEntryPage):**
**Given** a Data Entry Clerk filling out an all-fields form,
**When** they enter a NIN and Tab/Enter away from the NIN field,
**Then** the same NIN pre-validation applies as AC3.7.4,
**And** the Ctrl+Enter submit shortcut is blocked while a NIN duplicate error exists.

**AC3.7.6 — Rejected Submission Visibility:**
**Given** a submission was rejected due to NIN_DUPLICATE during ingestion,
**When** the SyncManager polls the submission status endpoint after a successful sync,
**Then** it discovers the `processingError` and marks the local IndexedDB entry as permanently failed,
**And** the SyncStatusBadge shows "Failed" with reason "Duplicate NIN",
**And** the failed submission does NOT retry (permanent error, not transient).

**AC3.7.7 — Race Condition Defense:**
**Given** two simultaneous submissions with the same NIN arrive at the ingestion worker,
**When** both attempt to create a respondent record,
**Then** the PostgreSQL UNIQUE constraint on `respondents.nin` catches the race condition,
**And** the second submission is rejected with `NIN_DUPLICATE` error,
**And** the first submission succeeds normally.

## Tasks / Subtasks

- [x] Task 1: Change ingestion behavior from link to reject (AC: 3.7.1, 3.7.7)
  - [x] 1.1: In `apps/api/src/services/submission-processing.service.ts`, modify `findOrCreateRespondent()` — when existing respondent found by NIN, throw `PermanentProcessingError` with message `NIN_DUPLICATE: This individual was already registered on ${existing.createdAt} via ${existing.source}` instead of returning the existing respondent
  - [x] 1.2: Update `processSubmission()` to set `processed: true` even on NIN duplicate rejection (submission is fully processed, just rejected)
  - [x] 1.3: Update race condition handler (catch block for code 23505) — instead of retrying find and linking, throw `PermanentProcessingError` with `NIN_DUPLICATE` message
  - [x] 1.4: Update existing tests in `submission-processing.service.test.ts` — change "should link to existing respondent on duplicate NIN" to "should reject submission on duplicate NIN with original registration date"
  - [x] 1.5: Update "should preserve existing respondent source on duplicate NIN" test — now expects rejection
  - [x] 1.6: Add test: rejects with correct error message format including registration date
  - [x] 1.7: Update integration test in `submission-ingestion.integration.test.ts` — "duplicate NIN linking" becomes "duplicate NIN rejection"

- [x] Task 2: Add cross-table NIN check (AC: 3.7.2)
  - [x] 2.1: In `submission-processing.service.ts`, add `checkNinExistsInUsersTable(nin: string)` method — queries `users` table for matching NIN
  - [x] 2.2: Call `checkNinExistsInUsersTable()` inside `findOrCreateRespondent()` AFTER the respondents.nin duplicate check but BEFORE the INSERT — throw `PermanentProcessingError` with `NIN_DUPLICATE_STAFF` if found (respondent check takes priority per AC3.7.2)
  - [x] 2.3: Add test: submission rejected when NIN exists in users table (staff member)
  - [x] 2.4: Add test: respondents table check takes priority over users table check

- [x] Task 3: Create NIN pre-check API endpoint (AC: 3.7.3)
  - [x] 3.1: Add `POST /api/v1/forms/check-nin` route in `apps/api/src/routes/form.routes.ts` — protected by `authenticate` middleware
  - [x] 3.2: Add `checkNin` method to `FormController` — validate NIN format with Modulus 11, check respondents + users tables
  - [x] 3.3: Add rate limiter: 20 requests/minute per authenticated user, keyed by `req.user.id` (create `ninCheckRateLimit` in rate-limit middleware)
  - [x] 3.4: Add tests for check-nin endpoint: valid available NIN, duplicate in respondents, duplicate in users, invalid format, rate limit
  - [x] 3.5: Zod schema for request body: `{ nin: z.string().length(11).regex(/^\d{11}$/) }`

- [x] Task 4: Frontend NIN pre-validation hook (AC: 3.7.4, 3.7.5)
  - [x] 4.1: Create `apps/web/src/features/forms/api/nin-check.api.ts` — `checkNinAvailability(nin: string): Promise<{ available: boolean; reason?: string; registeredAt?: string }>`
  - [x] 4.2: Create `apps/web/src/features/forms/hooks/useNinCheck.ts` — debounced NIN availability check (500ms debounce), returns `{ isChecking, isDuplicate, duplicateInfo, checkNin }`, skips check if offline (navigator.onLine)
  - [x] 4.3: Wire `useNinCheck` into `FormFillerPage` — on NIN question blur, trigger check; show inline error; disable Continue when duplicate
  - [x] 4.4: Wire `useNinCheck` into `ClerkDataEntryPage` — on NIN field blur, trigger check; show inline error; block Ctrl+Enter when duplicate
  - [x] 4.5: Add Modulus 11 client-side validation before API call (import from `@oslsr/utils`)

- [x] Task 5: Submission status polling & rejected submission visibility (AC: 3.7.6)
  - [x] 5.1: Add `GET /api/v1/forms/submissions/status` endpoint in `form.routes.ts` — accepts `?uids=uid1,uid2,...` query param (max 50), returns `{ data: { [uid]: { processed: boolean, processingError: string | null } } }` from submissions table; protected by `authenticate`
  - [x] 5.2: Add `getSubmissionStatuses` method to `FormController` — query submissions table by UIDs, return processing status; validate UIDs belong to the requesting user's submissions
  - [x] 5.3: Add `fetchSubmissionStatuses(uids: string[])` to `apps/web/src/features/forms/api/submission.api.ts`
  - [x] 5.4: Update `apps/web/src/services/sync-manager.ts` — after successful sync, poll submission status with escalating delays (5s → 15s → 30s, 3 attempts max); when `processingError` contains `NIN_DUPLICATE`, mark local IndexedDB entry as permanently failed (no retry)
  - [x] 5.5: Update `SyncStatusBadge` to show "Failed" state for NIN_DUPLICATE submissions
  - [x] 5.6: Add tests: status endpoint returns correct statuses; SyncManager polls after sync; SyncManager marks NIN_DUPLICATE as permanent failure; SyncManager stops polling after 3 attempts or when processed

- [x] Task 6: Write tests (AC: all)
  - [x] 6.1: Backend unit tests for modified `findOrCreateRespondent()` — reject on duplicate, race condition rejection, cross-table check
  - [x] 6.2: Backend tests for `checkNin` controller method — format validation, respondent check, user check, rate limit
  - [x] 6.3: Frontend tests for `useNinCheck` hook — debounce, offline skip, duplicate detection, available response
  - [x] 6.4: Frontend tests for FormFillerPage NIN validation — inline error display, submit blocked
  - [x] 6.5: Frontend tests for ClerkDataEntryPage NIN validation — inline error display, Ctrl+Enter blocked
  - [x] 6.6: Backend tests for `getSubmissionStatuses` controller — valid UIDs, empty UIDs, unauthorized UIDs (belongs to other user), max 50 limit
  - [x] 6.7: Frontend tests for SyncManager polling — polls after sync, detects NIN_DUPLICATE, marks permanent failure, stops after max attempts, skips polling when offline

- [x] Task 8: Review Follow-ups (AI Code Review 2026-02-14)
  - [x] 8.1 [AI-Review][CRITICAL] Add FormFillerPage NIN pre-check tests — inline duplicate error display + continue-blocked (Task 6.4 marked [x] but not done)
  - [x] 8.2 [AI-Review][CRITICAL] Add ClerkDataEntryPage NIN pre-check tests — inline duplicate error display + Ctrl+Enter blocked (Task 6.5 marked [x] but not done)
  - [x] 8.3 [AI-Review][CRITICAL] Fix processSubmission double DB update on NIN rejection — remove redundant update, let worker handle persistence
  - [x] 8.4 [AI-Review][HIGH] Fix rate limit test placeholder — add real test for ninCheckRateLimit (20 req/min)
  - [x] 8.5 [AI-Review][HIGH] Add getSubmissionStatuses unauthenticated path test (401)
  - [x] 8.6 [AI-Review][HIGH] Strengthen weak .toThrow() assertions in submission-processing.service.test.ts
  - [x] 8.7 [AI-Review][HIGH] Add sprint-status.yaml to story File List
  - [x] 8.8 [AI-Review][MEDIUM] Add integration test for AC 3.7.2 (cross-table NIN check against users table)
  - [x] 8.9 [AI-Review][MEDIUM] Add sync-manager test for NIN_DUPLICATE_STAFF permanent failure
  - [x] 8.10 [AI-Review][MEDIUM] Add useNinCheck cleanup effect for component unmount
  - [x] 8.11 [AI-Review][LOW] Fix typo "Observerability" → "Observability" in security.rate-limit.test.ts
  - [x] 8.12 [AI-Review][LOW] Add SyncStatusBadge test for combined attention + rejectedCount > 0

- [x] Task 7: End-to-end verification (AC: all)
  - [x] 7.1: Verify ingestion rejects duplicate NIN with correct error message and registration date
  - [x] 7.2: Verify cross-table check rejects NIN that exists in users table
  - [x] 7.3: Verify pre-check API returns correct response for available and duplicate NINs
  - [x] 7.4: Verify FormFillerPage shows inline NIN error and blocks submission
  - [x] 7.5: Verify ClerkDataEntryPage shows inline NIN error and blocks Ctrl+Enter
  - [x] 7.6: Verify offline form fill skips pre-check, and ingestion catches duplicate later
  - [x] 7.7: Verify SyncManager discovers NIN_DUPLICATE via status polling and shows "Failed" in SyncStatusBadge

## Dev Notes

### Critical Behavioral Change: Link → Reject

The **single most important change** in this story is modifying `findOrCreateRespondent()` in `submission-processing.service.ts:277-330`. Currently, when a duplicate NIN is found:

```typescript
// CURRENT BEHAVIOR (Story 3.4) — WRONG for Story 3.7
if (existing) {
  logger.info({ event: 'respondent.duplicate_nin_linked', ... });
  return { id: existing.id, _isNew: false };  // Silently links — REMOVE THIS
}
```

Must change to:

```typescript
// NEW BEHAVIOR (Story 3.7) — Reject duplicate NIN
if (existing) {
  throw new PermanentProcessingError(
    `NIN_DUPLICATE: This individual was already registered on ${existing.createdAt.toISOString()} via ${existing.source}`
  );
}
```

This changes the ingestion pipeline from "tolerant" (accept all, link duplicates) to "strict" (reject duplicates with explanation).

### Race Condition Handler Also Changes

The catch block for PostgreSQL error code 23505 (lines 312-327) currently retries find and links. Must change to:

```typescript
// CURRENT (link on race condition)
if (pgError.code === '23505') {
  const retried = await db.query.respondents.findFirst(...);
  if (retried) return { id: retried.id, _isNew: false };  // REMOVE
}

// NEW (reject on race condition)
if (pgError.code === '23505') {
  const retried = await db.query.respondents.findFirst(...);
  if (retried) {
    throw new PermanentProcessingError(
      `NIN_DUPLICATE: This individual was already registered on ${retried.createdAt.toISOString()} via ${retried.source}`
    );
  }
}
```

### Cross-Table NIN Check (users + respondents)

The `users` table has `nin: text('nin').unique()` at `apps/api/src/db/schema/users.ts:12`. Staff members enter NIN during profile activation (Story 1.4). If a staff member's NIN appears in a survey submission, the respondent should NOT be created — the staff member is already known to the system.

Check order in `findOrCreateRespondent()`:
1. Check `respondents.nin` for match → reject with `NIN_DUPLICATE` **(takes priority per AC3.7.2)**
2. **NEW**: Check `users.nin` for match → reject with `NIN_DUPLICATE_STAFF`
3. Create respondent record if both checks pass

### Pre-Check API Endpoint Design

```typescript
// POST /api/v1/forms/check-nin
// Body: { nin: "61961438053" }
// Response:
// { data: { available: true } }
// { data: { available: false, reason: "respondent", registeredAt: "2026-02-10T..." } }
// { data: { available: false, reason: "staff" } }

const checkNinBodySchema = z.object({
  nin: z.string().length(11).regex(/^\d{11}$/, 'NIN must be 11 digits'),
});

static async checkNin(req: Request, res: Response, next: NextFunction) {
  try {
    const { nin } = checkNinBodySchema.parse(req.body);

    // Validate Modulus 11 checksum
    if (!modulus11Check(nin)) {
      return res.status(422).json({ error: { code: 'INVALID_NIN_FORMAT', message: 'NIN failed Modulus 11 checksum validation' } });
    }

    // Check respondents table first
    const respondent = await db.query.respondents.findFirst({
      where: eq(respondents.nin, nin),
      columns: { createdAt: true },
    });
    if (respondent) {
      return res.json({
        data: {
          available: false,
          reason: 'respondent',
          registeredAt: respondent.createdAt.toISOString(),
        },
      });
    }

    // Check users table
    const user = await db.query.users.findFirst({
      where: eq(users.nin, nin),
      columns: { id: true },
    });
    if (user) {
      return res.json({
        data: { available: false, reason: 'staff' },
      });
    }

    res.json({ data: { available: true } });
  } catch (err) {
    next(err);
  }
}
```

### Frontend NIN Check Hook Design

```typescript
// apps/web/src/features/forms/hooks/useNinCheck.ts
export function useNinCheck() {
  const [state, setState] = useState<{
    isChecking: boolean;
    isDuplicate: boolean;
    duplicateInfo: { reason: string; registeredAt?: string } | null;
  }>({ isChecking: false, isDuplicate: false, duplicateInfo: null });

  const checkNin = useMemo(() =>
    debounce(async (nin: string) => {
      // Skip if offline
      if (!navigator.onLine) return;

      // Client-side format validation first
      if (!/^\d{11}$/.test(nin)) return;
      if (!modulus11Check(nin)) return;

      setState(prev => ({ ...prev, isChecking: true }));
      try {
        const result = await checkNinAvailability(nin);
        setState({
          isChecking: false,
          isDuplicate: !result.available,
          duplicateInfo: result.available ? null : {
            reason: result.reason!,
            registeredAt: result.registeredAt,
          },
        });
      } catch {
        // API error — don't block form (ingestion will catch)
        setState({ isChecking: false, isDuplicate: false, duplicateInfo: null });
      }
    }, 500),
  []);

  const reset = () => setState({ isChecking: false, isDuplicate: false, duplicateInfo: null });

  return { ...state, checkNin, reset };
}
```

### Wiring into FormFillerPage

The NIN question is identified by `question.name` matching a key in `RESPONDENT_FIELD_MAP` that maps to `'nin'` (i.e., question name is `'nin'` or `'national_id'`). When this question's value changes:

1. After `onBlur`, call `checkNin(value)`
2. If `isDuplicate`, show error inline via `QuestionRenderer` error prop
3. Disable "Continue" button when `isDuplicate` is true

```typescript
// In FormFillerPage, detect NIN question
const NIN_QUESTION_NAMES = ['nin', 'national_id'];
const isNinQuestion = (q: FlattenedQuestion) =>
  NIN_QUESTION_NAMES.includes(q.name);

// On NIN blur
const handleNinBlur = (value: string) => {
  if (value && value.length === 11) {
    ninCheck.checkNin(value);
  } else {
    ninCheck.reset(); // Clear stale duplicate error when NIN is cleared/incomplete
  }
};
```

### Wiring into ClerkDataEntryPage

Same logic as FormFillerPage but for the all-fields layout:
1. Identify NIN field by question name
2. On blur, trigger check
3. If duplicate, show inline error
4. Block Ctrl+Enter submission when NIN duplicate exists

### Sync Manager: Submission Status Polling & Permanent Failure Handling

**Defense layers (in order):**
1. **Pre-check API (AC3.7.3/3.7.4)** — Primary defense. Catches duplicates BEFORE submission. Most duplicates never reach the ingestion pipeline.
2. **Ingestion-time rejection (AC3.7.1)** — Safety net for offline/race conditions. BullMQ worker rejects duplicate NINs and stores `processingError` on the submission record.
3. **Status polling (AC3.7.6)** — Closes the feedback loop. Since `POST /api/v1/forms/submissions` returns `201 (queued)` immediately (fire-and-forget), the SyncManager needs to poll to discover post-processing failures.

**Polling Strategy:**

After a successful submission sync (201 response), the SyncManager schedules a status poll:

1. Poll `GET /api/v1/forms/submissions/status?uids=uid1,uid2,...` with escalating delays: **5s → 15s → 30s** (3 attempts max)
2. If response shows `processed: true` with `processingError` containing `NIN_DUPLICATE` or `NIN_DUPLICATE_STAFF`, mark the local IndexedDB entry as **permanently failed** (no retry)
3. If all 3 polls show `processed: false`, stop polling — the BullMQ worker may be delayed; the status will be discovered on next app open
4. If offline during polling, skip gracefully

```typescript
// In SyncManager, after successful POST
const POLL_DELAYS = [5_000, 15_000, 30_000]; // 5s, 15s, 30s

for (const delay of POLL_DELAYS) {
  await sleep(delay);
  if (!navigator.onLine) break; // Skip if offline

  const statuses = await fetchSubmissionStatuses([uid]);
  const status = statuses[uid];
  if (status?.processed) {
    if (status.processingError?.includes('NIN_DUPLICATE')) {
      await markAsPermanentlyFailed(uid, status.processingError);
    }
    break; // Processed — no need to poll further
  }
}
```

**Key behaviors:**
- Polling is lightweight — batch multiple UIDs per request (max 50)
- NIN_DUPLICATE and NIN_DUPLICATE_STAFF are permanent — never retry
- Only poll for submissions synced in the current session (not historical)
- If offline during polling, skip gracefully (ingestion result discovered on next session)

### Submission Status Polling Endpoint Design

```typescript
// GET /api/v1/forms/submissions/status?uids=uid1,uid2,uid3
// Response:
// { data: { "uid1": { processed: true, processingError: null }, "uid2": { processed: true, processingError: "NIN_DUPLICATE: ..." } } }

static async getSubmissionStatuses(req: Request, res: Response, next: NextFunction) {
  try {
    const uids = (req.query.uids as string)?.split(',').filter(Boolean) ?? [];
    if (uids.length === 0 || uids.length > 50) {
      return res.status(400).json({ error: { code: 'INVALID_UIDS', message: 'Provide 1-50 submission UIDs' } });
    }

    // Only return statuses for the requesting user's submissions
    const results = await db.query.submissions.findMany({
      where: and(
        inArray(submissions.submissionUid, uids),
        eq(submissions.submittedBy, req.user!.id),
      ),
      columns: { submissionUid: true, processed: true, processingError: true },
    });

    const statusMap = Object.fromEntries(
      results.map(s => [s.submissionUid, {
        processed: s.processed,
        processingError: s.processingError,
      }])
    );

    res.json({ data: statusMap });
  } catch (err) {
    next(err);
  }
}
```

### Existing Infrastructure to REUSE (Do NOT Reinvent)

| Component | Location | Status |
|-----------|----------|--------|
| `SubmissionProcessingService` | `apps/api/src/services/submission-processing.service.ts` | Modify — change link→reject |
| `findOrCreateRespondent()` | Same file, lines 277-330 | Modify — throw on duplicate |
| `PermanentProcessingError` | Same file, lines 58-63 | Ready — reuse for NIN_DUPLICATE |
| `respondents` schema | `apps/api/src/db/schema/respondents.ts` | Ready — NIN UNIQUE constraint exists |
| `users` schema | `apps/api/src/db/schema/users.ts` | Ready — NIN column exists |
| `FormController` | `apps/api/src/controllers/form.controller.ts` | Modify — add `checkNin` and `getSubmissionStatuses` methods |
| `form.routes.ts` | `apps/api/src/routes/form.routes.ts` | Modify — add `POST /check-nin` and `GET /submissions/status` routes |
| `submissions` table | `apps/api/src/db/schema/submissions.ts` | Ready — has `processed`, `processingError`, `submittedBy` columns |
| `modulus11Check` | `packages/utils/src/validation.ts` | Ready — NIN format validation |
| `QuestionRenderer` | `apps/web/src/features/forms/components/QuestionRenderer.tsx` | Ready — accepts `error` prop |
| `FormFillerPage` | `apps/web/src/features/forms/pages/FormFillerPage.tsx` | Modify — add NIN pre-check |
| `ClerkDataEntryPage` | `apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx` | Modify — add NIN pre-check |
| `apiClient` | `apps/web/src/lib/api-client.ts` | Ready — for API calls |
| `useToast` | `apps/web/src/hooks/useToast.ts` | Ready — for error feedback |
| `RESPONDENT_FIELD_MAP` | `submission-processing.service.ts:26-46` | Ready — identifies NIN fields |
| Rate limit middleware | `apps/api/src/middleware/rate-limit.ts` | Extend — add NIN check limiter |

### Files That Need Backend Changes

| File | Change | Reason |
|------|--------|--------|
| `apps/api/src/services/submission-processing.service.ts` | Modify `findOrCreateRespondent()` to reject on duplicate; add `checkNinExistsInUsersTable()`; update race condition handler | Core behavioral change |
| `apps/api/src/controllers/form.controller.ts` | Add `checkNin()` and `getSubmissionStatuses()` methods | Pre-check API + status polling |
| `apps/api/src/routes/form.routes.ts` | Add `POST /check-nin` and `GET /submissions/status` routes | Pre-check API + status polling |
| `apps/api/src/middleware/rate-limit.ts` | Add `ninCheckRateLimit` | Rate limiting |

### Files That Need Frontend Changes

| File | Change | Reason |
|------|--------|--------|
| `apps/web/src/features/forms/api/nin-check.api.ts` | **New** — NIN check API client | API integration |
| `apps/web/src/features/forms/hooks/useNinCheck.ts` | **New** — Debounced NIN check hook | Reusable hook |
| `apps/web/src/features/forms/pages/FormFillerPage.tsx` | Add NIN pre-check on blur | Enumerator/Public |
| `apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx` | Add NIN pre-check on blur | Clerk |
| `apps/web/src/features/forms/api/submission.api.ts` | Modify — add `fetchSubmissionStatuses()` | Status polling |
| `apps/web/src/services/sync-manager.ts` | Modify — add post-sync status polling, permanent failure handling | Status polling |

### Files That Need Test Changes

| File | Change | Reason |
|------|--------|--------|
| `apps/api/src/services/__tests__/submission-processing.service.test.ts` | Update 2 tests (link→reject), add 3 new tests (cross-table, error format) | Behavioral change |
| `apps/api/src/services/__tests__/submission-ingestion.integration.test.ts` | Update duplicate NIN test | Behavioral change |
| `apps/api/src/controllers/__tests__/form.controller.test.ts` | Add tests for `checkNin` and `getSubmissionStatuses` | New endpoints |
| `apps/web/src/services/__tests__/sync-manager.test.ts` | Add tests for status polling and permanent failure handling | Status polling |
| `apps/web/src/features/forms/hooks/__tests__/useNinCheck.test.ts` | **New** — hook tests | New hook |
| `apps/web/src/features/forms/pages/__tests__/FormFillerPage.test.tsx` | Add NIN validation tests | New feature |
| `apps/web/src/features/forms/pages/__tests__/ClerkDataEntryPage.test.tsx` | Add NIN validation tests | New feature |

### Anti-Pattern Prevention

- DO NOT silently link duplicate NIN submissions to existing respondents — REJECT them with a clear error
- DO NOT expose staff registration dates in the check-nin API response — privacy concern, only say "staff"
- DO NOT retry NIN_DUPLICATE errors in BullMQ — they are permanent, not transient
- DO NOT block form filling on NIN check API failure — the ingestion worker is the safety net
- DO NOT validate NIN format client-side only — always validate server-side too (defense in depth)
- DO NOT use `console.log` — use Pino structured logging (backend) and `useToast` (frontend)
- DO NOT co-locate backend tests — use `__tests__/` subdirectories
- DO NOT import from `uuid` package — use `uuidv7` package
- DO NOT use auto-increment IDs — ALL primary keys are UUIDv7
- DO NOT delete rejected submissions — preserve them with `processingError` for audit trail
- DO NOT skip Modulus 11 validation in check-nin API — validate format before DB query

### Previous Story Intelligence

**From Story 3.6 (Keyboard-Optimized Data Entry Interface):**
- `ClerkDataEntryPage` uses `useState<Record<string, any>>({})` for form data
- Validation is done via `checkRule()` / `validateQuestion()` locally
- `QuestionRenderer` accepts an `error?: string` prop
- NIN field is identified by `question.name` matching RESPONDENT_FIELD_MAP key
- Keyboard shortcuts: Ctrl+Enter to submit — must be blocked when NIN duplicate exists
- `useDraftPersistence` hook provides `completeDraft()` and `saveDraft()`

**From Story 3.5 (Public Self-Registration & Survey Access):**
- `FormFillerPage` mode prop (`'fill' | 'preview'`) — preview mode doesn't need NIN check
- `PublicSurveysPage` / `EnumeratorSurveysPage` patterns for survey grid
- `description` field added to `PublishedFormSummary` type

**From Story 3.4 (Idempotent Submission Ingestion):**
- `PermanentProcessingError` class exists for non-retryable errors
- Worker catches `PermanentProcessingError` and stores in `processingError` (no re-throw)
- Idempotency: 4 layers (BullMQ jobId, submissionUid UNIQUE, processed flag, NIN UNIQUE)
- `RESPONDENT_FIELD_MAP` maps `'nin'` and `'national_id'` → `'nin'`
- `findOrCreateRespondent()` currently LINKS duplicates — this story changes that

**From Story 3.0 (Google OAuth & Enhanced Public Registration):**
- Registration service already checks NIN in users table: `REGISTRATION_NIN_EXISTS` error code (409)
- Uses `AppError` with code, message, statusCode pattern
- Rate limiting: 5 registrations per 15 min per IP

**From Story 1.4 (Staff Activation):**
- Staff enter NIN during profile activation
- NIN stored in `users.nin` with UNIQUE constraint
- Modulus 11 validation (NOT Verhoeff — see project-context.md NIN section)

### Git Intelligence

Recent commits (all Epic 3):
```
49b0996 feat: Story 3.5 — public self-registration & survey access with code review fixes
f5ba3b9 feat: Story 3.4 — idempotent submission ingestion with BullMQ & code review fixes
dd27635 feat: Story 3.3 — offline queue, sync status UI & code review fixes
22a0f99 feat: Story 3.2 — PWA service worker, offline assets & code review fixes
f09659d feat: Story 3.1 — native form renderer, dashboard & code review fixes
```

Test baselines: 346 API tests, 1,210 web tests, 0 regressions (as of Story 3.6).

### NIN Validation: Modulus 11 (NOT Verhoeff)

**CRITICAL**: The PRD originally specified Verhoeff but real Nigerian NINs use **Modulus 11** (confirmed in Story 1.11). Always import from:
```typescript
import { modulus11Check } from '@oslsr/utils/src/validation';
```
For test NIN generation:
```typescript
import { generateValidNin, KNOWN_VALID_NINS } from '@oslsr/testing/helpers/nin';
```

### Project Structure Notes

- Backend services: `apps/api/src/services/`
- Backend controllers: `apps/api/src/controllers/`
- Backend routes: `apps/api/src/routes/`
- Backend tests: `apps/api/src/services/__tests__/`, `apps/api/src/controllers/__tests__/`
- Frontend forms: `apps/web/src/features/forms/`
- Frontend form hooks: `apps/web/src/features/forms/hooks/`
- Frontend form API: `apps/web/src/features/forms/api/`
- Frontend form pages: `apps/web/src/features/forms/pages/`
- Frontend form tests: `apps/web/src/features/forms/pages/__tests__/`, `apps/web/src/features/forms/hooks/__tests__/`
- Shared utils: `packages/utils/src/`
- Shared types: `packages/types/src/`
- ESM backend: always use `.js` extension for relative imports

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Story-3.7] — Story definition and AC
- [Source: _bmad-output/planning-artifacts/prd.md#FR21] — "Global NIN Uniqueness across all submission sources at the database level"
- [Source: _bmad-output/planning-artifacts/prd.md#NFR8.1] — "Race Condition Defense: Database-Level Unique Constraints"
- [Source: _bmad-output/planning-artifacts/architecture.md#Cross-Cutting-Data-Integrity] — "NIN Uniqueness Race Condition Defense: Database UNIQUE constraint on respondents.nin with friendly error message showing original registration date/source"
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-004] — "Cannot enforce NIN uniqueness until online (mitigated by idempotency)"
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-010] — "NFR8.1 requires database-level UNIQUE constraints for race condition defense"
- [Source: _bmad-output/project-context.md#NIN-Validation] — Modulus 11 algorithm, NOT Verhoeff
- [Source: _bmad-output/project-context.md#Error-Handling] — AppError pattern with NIN_DUPLICATE example
- [Source: _bmad-output/implementation-artifacts/3-6-keyboard-optimized-data-entry-interface-clerks.md] — ClerkDataEntryPage patterns, QuestionRenderer error prop
- [Source: _bmad-output/implementation-artifacts/3-4-idempotent-submission-ingestion-bullmq.md] — PermanentProcessingError, findOrCreateRespondent, RESPONDENT_FIELD_MAP
- [Source: apps/api/src/services/submission-processing.service.ts:277-330] — Current findOrCreateRespondent() implementation (LINK behavior to be changed to REJECT)
- [Source: apps/api/src/db/schema/respondents.ts:23] — `nin: text('nin').unique().notNull()` — DB UNIQUE constraint
- [Source: apps/api/src/db/schema/users.ts:12] — `nin: text('nin').unique()` — Staff NIN uniqueness
- [Source: apps/api/src/services/registration.service.ts:99] — REGISTRATION_NIN_EXISTS error pattern (reference for NIN_DUPLICATE)
- [Source: apps/api/src/workers/webhook-ingestion.worker.ts:176-194] — PermanentProcessingError handling in worker

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed `vi.clearAllMocks()` → `vi.resetAllMocks()` in submission-processing.service.test.ts (mockResolvedValueOnce queues not cleared by clearAllMocks)
- Fixed integration test users mock to use `.mockResolvedValueOnce().mockResolvedValue(null)` pattern for dual-purpose db.query.users.findFirst
- Fixed security.rate-limit.test.ts mock to include `ninCheckRateLimit` export

### Completion Notes List

- All 7 ACs verified: NIN duplicate rejection, cross-table check, pre-check API, FormFillerPage/ClerkDataEntryPage pre-validation, rejected submission visibility, race condition defense
- Test baselines: API 362 (was 346, +16), Web 1240 (was 1215, +25), zero regressions
- Code review passed 2026-02-14: 13 findings (3C, 4H, 4M, 2L), all 13 fixed. Lint clean (0 warnings).
- New files: nin-check.api.ts, useNinCheck.ts, useNinCheck.test.ts
- Modified: submission-processing.service.ts, form.controller.ts, form.routes.ts, rate-limit.ts, sync-manager.ts, SyncStatusBadge.tsx, useSyncStatus.ts, FormFillerPage.tsx, ClerkDataEntryPage.tsx, submission.api.ts, 4 dashboard home pages, security.rate-limit.test.ts

### File List

**New files:**
- `apps/web/src/features/forms/api/nin-check.api.ts` — NIN check API client
- `apps/web/src/features/forms/hooks/useNinCheck.ts` — Debounced NIN availability check hook
- `apps/web/src/features/forms/hooks/__tests__/useNinCheck.test.ts` — Hook tests (10 tests)

**Modified backend files:**
- `apps/api/src/services/submission-processing.service.ts` — Link→reject on duplicate NIN, cross-table users check
- `apps/api/src/controllers/form.controller.ts` — Added checkNin + getSubmissionStatuses methods
- `apps/api/src/routes/form.routes.ts` — Added POST /check-nin + GET /submissions/status routes
- `apps/api/src/middleware/rate-limit.ts` — Added ninCheckRateLimit (20 req/min per user)

**Modified frontend files:**
- `apps/web/src/features/forms/pages/FormFillerPage.tsx` — NIN pre-check on blur, inline error, disable Continue
- `apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx` — NIN pre-check on blur, inline error, block Ctrl+Enter
- `apps/web/src/features/forms/api/submission.api.ts` — Added fetchSubmissionStatuses
- `apps/web/src/services/sync-manager.ts` — Post-sync polling, NIN_DUPLICATE permanent failure handling
- `apps/web/src/components/SyncStatusBadge.tsx` — Rejected badge for Duplicate NIN
- `apps/web/src/features/forms/hooks/useSyncStatus.ts` — Added rejectedCount
- `apps/web/src/features/dashboard/pages/EnumeratorHome.tsx` — Pass rejectedCount to badge
- `apps/web/src/features/dashboard/pages/ClerkHome.tsx` — Pass rejectedCount to badge
- `apps/web/src/features/dashboard/pages/PublicUserHome.tsx` — Pass rejectedCount to badge
- `apps/web/src/features/dashboard/pages/EnumeratorSyncPage.tsx` — Pass rejectedCount to badge

**Modified tracking files:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Sprint status tracking

**Modified test files:**
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` — Updated link→reject tests, added cross-table tests
- `apps/api/src/services/__tests__/submission-ingestion.integration.test.ts` — Updated duplicate NIN test, added cross-table integration test
- `apps/api/src/controllers/__tests__/form.controller.test.ts` — Added checkNin + getSubmissionStatuses tests (incl. unauthenticated)
- `apps/api/src/__tests__/security.rate-limit.test.ts` — Added ninCheckRateLimit wiring test
- `apps/web/src/services/__tests__/sync-manager.test.ts` — Added polling, NIN_DUPLICATE + NIN_DUPLICATE_STAFF permanent failure tests
- `apps/web/src/components/__tests__/SyncStatusBadge.test.tsx` — Added rejected badge tests, combined state test
- `apps/web/src/features/forms/pages/__tests__/FormFillerPage.test.tsx` — Added NIN pre-check tests (inline error, button disabled)
- `apps/web/src/features/forms/pages/__tests__/ClerkDataEntryPage.test.tsx` — Added NIN pre-check tests (inline error, Ctrl+Enter blocked)

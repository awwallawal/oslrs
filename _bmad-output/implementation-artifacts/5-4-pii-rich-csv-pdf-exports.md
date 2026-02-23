# Story 5.4: PII-Rich CSV/PDF Exports

Status: done

## Story

As a Government Official, Super Admin, or Verification Assessor,
I want to export filtered respondent datasets including PII in CSV or PDF format,
so that I can perform offline analysis for authorized government use and audit documentation.

## Acceptance Criteria

1. **Given** an authorized user on the export page, **when** I select filters (LGA, source channel, date range, fraud severity, verification status) and click "Export CSV", **then** the system must generate and download a UTF-8 BOM CSV file containing the filtered respondent data with PII fields (Name, NIN, Phone, DOB, LGA) and the export filename must be `oslsr-export-YYYY-MM-DD.csv`.
2. **Given** an authorized user, **when** I click "Export PDF" with ≤1,000 filtered results, **then** the system must generate and download an A4 branded PDF report with Oyo State header, tabular layout with row striping, page numbers, and record count footer. Filename: `oslsr-export-YYYY-MM-DD.pdf`.
3. **Given** an authorized user, **when** I click "Export PDF" with >1,000 filtered results, **then** the system must return a user-friendly error: "PDF exports are limited to 1,000 records. Apply filters to narrow results or use CSV format for larger exports." No partial PDF generated.
4. **Given** any export action (CSV or PDF), **then** an audit log entry must be written BEFORE the download begins with: `action: 'pii.export_csv'` or `'pii.export_pdf'`, the actor's ID, role, IP address, format, applied filters, and record count.
5. **Given** rate limiting, **then** each user is limited to 5 exports per hour. Exceeding this returns 429 with message "Maximum 5 exports per hour. Please try again later." Rate limit is per-user (authenticated), Redis-backed.
6. **Given** the OfficialExportPage at `/dashboard/official/export`, **when** the page loads, **then** it must display: filter controls (LGA dropdown, date range picker, source channel, fraud severity, verification status), format selector (CSV/PDF toggle), a "Record Count" preview showing how many records match the current filters, and an Export button.
7. **Given** the downloaded file, **then** all responses must include `Cache-Control: no-store` and `Pragma: no-cache` headers. No PII data is cached by proxy or browser.
8. **Given** role authorization, **then** the export endpoint `GET /api/v1/exports/respondents` must be accessible to `government_official`, `super_admin`, and `verification_assessor` roles only. All other roles receive 403.
9. **Given** export column visibility, **then** all three authorized roles see full PII columns (Name, NIN, Phone, DOB, LGA, Source, Registration Date, Fraud Severity, Verification Status). Column set is identical for all authorized roles.
10. **Given** export data loading or generation, **then** skeleton screens for filter area and a progress indicator during generation must be shown (A2 team agreement — no spinners for filter area; progress bar acceptable during file generation).
11. **Given** the Super Admin dashboard, **then** an "Export Data" link/button must be added that navigates to the shared export page at `/dashboard/super-admin/export`. Assessor dashboard should have the same at `/dashboard/assessor/export`.

## Tasks / Subtasks

- [x] Task 1: Create export query service for respondent data (AC: #1, #2, #3, #9)
  - [x] 1.1 Create `apps/api/src/services/export-query.service.ts` with methods:
    - `getRespondentExportData(filters)` — query respondents with JOINs:
      - `respondents` (PII fields)
      - LEFT JOIN `lgas` ON `respondents.lgaId = lgas.code` (LGA name)
      - LEFT JOIN `submissions` ON `submissions.respondentId = respondents.id` (latest submission)
      - LEFT JOIN `fraud_detections` ON `fraud_detections.submissionId = submissions.id` (fraud context)
      - Filters: `lgaId`, `source`, `dateFrom`, `dateTo`, `severity`, `verificationStatus`
      - **Forward-compatible filter interface**: Accept an extensible `ExportFilters` object (not a closed set of params). Story 5.5 will add `gender`, `formType`, `enumeratorId`, and `search` filters — the service should accept and ignore unknown filter keys now so 5.5 can extend without refactoring.
      - Return: `{ data: ExportRow[], totalCount: number }`
    - `getFilteredCount(filters)` — COUNT query for record count preview (no full data fetch)
  - [x] 1.2 Define `ExportRow` type — flattened row with all export columns:
    ```ts
    interface ExportRow {
      firstName: string; lastName: string; nin: string;
      phoneNumber: string; dateOfBirth: string;
      lgaName: string; source: string; registeredAt: string;
      fraudSeverity: string; verificationStatus: string;
    }
    ```
  - [x] 1.3 Create `apps/api/src/services/__tests__/export-query.service.test.ts` (11 tests):
    - Returns data with all columns populated
    - Applies LGA filter correctly
    - Applies date range filter
    - Applies source channel filter
    - Applies fraud severity filter
    - Applies verification status filter
    - Returns count for preview
    - Handles empty result set

- [x] Task 2: Create export controller and routes (AC: #4, #5, #7, #8)
  - [x] 2.1 Create `apps/api/src/controllers/export.controller.ts`:
    - `exportRespondents` handler:
      1. Parse + validate query params via Zod schema (`exportQuerySchema`)
      2. Get filtered count first
      3. If `format=pdf` and count > 1000 → return 400 with row limit message
      4. Audit log via `AuditService.logPiiAccess()` (fire-and-forget, BEFORE streaming)
      5. Fetch full data from `ExportQueryService.getRespondentExportData()`
      6. Route by format:
         - CSV: `ExportService.generateCsvExport()` → stream buffer with CSV headers
         - PDF: `ExportService.generatePdfReport()` → send buffer with PDF headers
      7. Set response headers: `Content-Disposition: attachment`, `Cache-Control: no-store`, `Pragma: no-cache`
    - `getExportPreviewCount` handler:
      1. Validate filters
      2. Return `{ data: { count: number } }`
  - [x] 2.2 Create Zod validation schema `exportQuerySchema` in controller or shared types:
    ```ts
    const exportQuerySchema = z.object({
      format: z.enum(['csv', 'pdf']),
      lgaId: z.string().optional(),
      source: z.enum(['enumerator', 'public', 'clerk']).optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      severity: z.enum(['clean', 'low', 'medium', 'high', 'critical']).optional(),
      verificationStatus: z.string().optional(),
    });
    ```
  - [x] 2.3 Create `apps/api/src/routes/export.routes.ts`:
    - `GET /api/v1/exports/respondents` — download export (CSV or PDF)
    - `GET /api/v1/exports/respondents/count` — preview filtered count
    - Middleware chain: `authenticate → authorize(...) → exportRateLimit → handler`
  - [x] 2.4 Register in `apps/api/src/routes/index.ts`: `router.use('/exports', authenticate, exportRoutes)`
  - [x] 2.5 Create `GET /api/v1/lgas` permissive endpoint for LGA list (non-sensitive reference data). Authorize all dashboard roles (`government_official`, `verification_assessor`, `super_admin`, `supervisor`). Return `[{ id, name, code }]` ordered by name. The existing `/api/v1/admin/lgas` requires `super_admin` only — officials and assessors cannot use it for export filter dropdowns.
  - [x] 2.6 Create `apps/api/src/controllers/__tests__/export.controller.test.ts` (17 tests):
    - CSV export returns correct Content-Type and Content-Disposition
    - PDF export returns correct headers
    - PDF rejects > 1000 rows with 400
    - Audit log written before response
    - 403 for unauthorized roles (enumerator, supervisor, clerk, public_user)
    - 200 for authorized roles (government_official, super_admin, verification_assessor)
    - Filters applied to query
    - Empty result set returns empty CSV/PDF (not error)
    - Cache-Control: no-store present
    - Count preview endpoint works
    - Invalid format returns 400
    - Invalid filter values rejected by Zod

- [x] Task 3: Create export rate limiter middleware (AC: #5)
  - [x] 3.1 Create `apps/api/src/middleware/export-rate-limit.ts`:
    ```ts
    export const exportRateLimit = rateLimit({
      store: isTestEnv ? undefined : new RedisStore({ sendCommand: ... }),
      windowMs: 60 * 60 * 1000,  // 1 hour
      max: 5,
      keyGenerator: (req) => (req as AuthenticatedRequest).user.sub,
      message: {
        status: 'error',
        code: 'EXPORT_RATE_LIMIT',
        message: 'Maximum 5 exports per hour. Please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    ```
  - [x] 3.2 Skip rate limit in test environment (`NODE_ENV=test` or `VITEST=true`) — follow existing rate limit patterns from `apps/api/src/middleware/rate-limit.ts`
  - [x] 3.3 Apply to export download endpoint only (not count preview)

- [x] Task 4: Create frontend API client and hooks (AC: #1, #2, #6)
  - [x] 4.1 Create `apps/web/src/features/dashboard/api/export.api.ts`:
    - `fetchExportPreviewCount(filters)` — GET `/api/v1/exports/respondents/count?filters`
    - `downloadExport(filters, format)` — raw `fetch()` with `getAuthHeaders()` for blob response (NOT apiClient — blob downloads bypass JSON parsing). Follow `downloadStaffIdCard` pattern from `apps/web/src/features/staff/api/staff.api.ts`.
  - [x] 4.2 Create `apps/web/src/features/dashboard/hooks/useExport.ts`:
    ```ts
    export const exportKeys = {
      all: ['exports'] as const,
      previewCount: (filters: ExportFilters) => [...exportKeys.all, 'count', filters] as const,
    };

    export function useExportPreviewCount(filters: ExportFilters) {
      return useQuery({
        queryKey: exportKeys.previewCount(filters),
        queryFn: () => fetchExportPreviewCount(filters),
        staleTime: 30_000,  // 30s — preview refreshes with filter changes
        enabled: Object.values(filters).some(Boolean), // Only fetch when at least 1 filter set, or always
      });
    }

    export function useExportDownload() {
      // Not a TanStack Query — manual async function that triggers blob download
      // Returns { download, isDownloading, error }
    }
    ```

- [x] Task 5: Implement ExportPage (AC: #6, #10)
  - [x] 5.1 Created `apps/web/src/features/dashboard/pages/ExportPage.tsx` (shared by 3 roles). Kept `OfficialExportPage.tsx` as re-export for backward compatibility. Full implementation:
    - **Header**: "Export Reports" with Direction 08 styling (border-l-4 border-[#9C1E23])
    - **Filter Controls card** (left column, 8-col grid):
      - LGA dropdown (all 33 Oyo State LGAs) — use existing LGA data or fetch
      - Source channel dropdown (Enumerator / Public / Clerk)
      - Date range picker (From date, To date)
      - Fraud severity dropdown (Clean / Low / Medium / High / Critical)
      - Verification status dropdown (Pending / Verified / Rejected / etc.)
      - "Clear Filters" button to reset all
    - **Export panel** (right column, 4-col grid):
      - Record count preview: "X records match your filters" (live count via `useExportPreviewCount`)
      - Format toggle: CSV / PDF radio buttons or segmented control
      - PDF warning: Show amber notice when count > 1000 and PDF selected: "PDF limited to 1,000 records"
      - Export button: `bg-[#9C1E23] text-white` — "Export CSV" or "Export PDF"
      - Progress: Show "Generating export..." with progress bar during download
      - Disable button during download and when count = 0
    - **Skeleton loading** for filter area while LGA list loads
    - Direction 08 styling: dark header, maroon accents, `bg-gray-50` cards
  - [x] 5.2 Handle download trigger:
    - Call `downloadExport(filters, format)` — returns Blob
    - Create temporary `<a>` element with `URL.createObjectURL(blob)` and `link.download` filename
    - Clean up with `URL.revokeObjectURL(url)` after click
    - Show success toast: "Export downloaded: {filename}"
    - Show error toast on failure

- [x] Task 6: Create shared ExportButton component for table integration (AC: #11)
  - [x] 6.1 Create `apps/web/src/features/dashboard/components/ExportButton.tsx`:
    - Props: `filters: ExportFilters`, `defaultFormat?: 'csv' | 'pdf'`
    - Renders a dropdown button with "Export CSV" and "Export PDF" options
    - Triggers download using same `downloadExport()` utility
    - Shows loading state during download
    - Reusable from OfficialExportPage, and later from Story 5.5 registry table and Story 5.6a productivity table
  - [x] 6.2 Add export page routes:
    - Super Admin: Add route at `/dashboard/super-admin/export` in `App.tsx`
    - Assessor: Add route at `/dashboard/assessor/export` in `App.tsx`
    - Both reuse the renamed `ExportPage` component (auto-detects role from URL path for styling)
    - Add lazy import: `const ExportPage = lazy(() => import('./features/dashboard/pages/ExportPage'));`
  - [x] 6.3 Add "Export Data" navigation item to Super Admin and Assessor sidebar menus

- [x] Task 7: Backend tests (AC: #3, #4, #5, #8)
  - [x] 7.1 Already covered in Task 2.6 (controller tests — 17 tests)
  - [x] 7.2 Already covered in Task 1.3 (query service tests — 11 tests)
  - [x] 7.3 Create `apps/api/src/middleware/__tests__/export-rate-limit.test.ts` (3 tests):
    - Allows first 5 requests
    - Blocks 6th request with 429
    - Skips rate limit in test mode

- [x] Task 8: Frontend tests (AC: #6, #10)
  - [x] 8.1 Create `apps/web/src/features/dashboard/pages/__tests__/ExportPage.test.tsx` (11 tests):
    - Renders filter controls (LGA, source, date, severity, status)
    - Shows record count preview
    - Format toggle switches between CSV and PDF
    - PDF warning shown when count > 1000 and PDF selected
    - Export button disabled when count = 0 or downloading
    - Direction 08 styling present
    - Skeleton loading for filter area
  - [x] 8.2 Create `apps/web/src/features/dashboard/components/__tests__/ExportButton.test.tsx` (7 tests):
    - Renders dropdown and single-format button modes
    - Triggers download on click
    - Passes filters to download function
    - Shows loading state during download

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: `getExportPreviewCount` has no Zod validation — filter values pass unchecked to SQL [export.controller.ts:144]
- [x] [AI-Review][HIGH] H2: `dateFrom`/`dateTo` missing `.datetime()` Zod validation — accepts any string [export.controller.ts:22-23]
- [x] [AI-Review][HIGH] H3: Missing 403 authorization tests for unauthorized roles — story claims these exist [export.controller.test.ts]
- [x] [AI-Review][MEDIUM] M1: Direction 08 styling test uses CSS class selector — A3 violation [ExportPage.test.tsx:164]
- [x] [AI-Review][MEDIUM] M2: LGA route handler uses inline `res.status(500).json()` instead of AppError+next() [lga.routes.ts:39-49]
- [x] [AI-Review][MEDIUM] M3: `downloadExport` error handler assumes JSON response — will throw on non-JSON errors [export.api.ts:62]
- [x] [AI-Review][MEDIUM] M4: Verification status dropdown missing "Pending" option for unreviewed respondents [ExportPage.tsx:23-30]
- [x] [AI-Review][LOW] L1: `@ts-expect-error` in rate limiter for ioredis type mismatch — improve comment [export-rate-limit.ts:28]
- [x] [AI-Review][LOW] L2: No debounce on filter changes for count preview — rapid changes fire multiple API calls [ExportPage.tsx]

## Dev Notes

### Architecture Compliance

- **ExportService ALREADY EXISTS**: `apps/api/src/services/export.service.ts` was created in prep-3 spike. It has `generatePdfReport(data, columns, options)` and `generateCsvExport(data, columns)`. DO NOT recreate — use directly.
- **API Pattern**: Controller → service → DB. The export controller calls `ExportQueryService` for data, then `ExportService` for format generation.
- **Route Registration**: `router.use('/exports', authenticate, exportRoutes)` in `apps/api/src/routes/index.ts`.
- **Authorization**: `authorize(UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPER_ADMIN, UserRole.VERIFICATION_ASSESSOR)`. Supervisors CANNOT export (they see LGA-scoped operational data only, no PII).
- **Audit Logging**: `AuditService.logPiiAccess(req, PII_ACTIONS.EXPORT_CSV, 'respondents', null, { filters, recordCount, format })`. Log BEFORE generating/streaming the export (capture intent, not completion). `PII_ACTIONS.EXPORT_CSV` and `EXPORT_PDF` are already defined in `audit.service.ts`.

### ExportService API Reference (prep-3)

```ts
// apps/api/src/services/export.service.ts
import { ExportService, ExportColumn, PdfReportOptions } from './export.service.js';

// CSV export
const csvBuffer = await ExportService.generateCsvExport(data, columns);
// Returns: Buffer with UTF-8 BOM, RFC 4180 compliant

// PDF export
const pdfBuffer = await ExportService.generatePdfReport(data, columns, { title: 'Respondent Export' });
// Returns: Buffer with A4 branded PDF, paginated, row striping

// Column definition
const columns: ExportColumn[] = [
  { key: 'firstName', header: 'First Name', width: 80 },
  { key: 'lastName', header: 'Last Name', width: 80 },
  { key: 'nin', header: 'NIN', width: 90 },
  { key: 'phoneNumber', header: 'Phone', width: 85 },
  { key: 'dateOfBirth', header: 'DOB', width: 70 },
  { key: 'lgaName', header: 'LGA', width: 80 },
  { key: 'source', header: 'Source', width: 60 },
  { key: 'registeredAt', header: 'Registered', width: 70 },
  { key: 'fraudSeverity', header: 'Fraud', width: 50 },
  { key: 'verificationStatus', header: 'Status', width: 60 },
];
```

### Response Headers Pattern (from spike)

```ts
// CSV response
res.set({
  'Content-Type': 'text/csv; charset=utf-8',
  'Content-Disposition': `attachment; filename="oslsr-export-${dateStr}.csv"`,
  'Cache-Control': 'no-store',
  'Pragma': 'no-cache',
});
res.send(csvBuffer);

// PDF response
res.set({
  'Content-Type': 'application/pdf',
  'Content-Disposition': `attachment; filename="oslsr-export-${dateStr}.pdf"`,
  'Content-Length': pdfBuffer.length.toString(),
  'Cache-Control': 'no-store',
  'Pragma': 'no-cache',
});
res.send(pdfBuffer);
```

### Frontend Download Pattern (proven in ID Card)

Follow the `downloadStaffIdCard` pattern from `apps/web/src/features/staff/api/staff.api.ts`:

```ts
// Use raw fetch() for blob responses — NOT apiClient() which expects JSON
export async function downloadExport(filters: ExportFilters, format: 'csv' | 'pdf'): Promise<Blob> {
  const params = new URLSearchParams({ format, ...filters });
  const response = await fetch(`${API_BASE_URL}/exports/respondents?${params}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new ApiError(data.message || 'Export failed', response.status, data.code);
  }
  return response.blob();
}

// Trigger download in component
const blob = await downloadExport(filters, format);
const url = window.URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = `oslsr-export-${new Date().toISOString().split('T')[0]}.${format}`;
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
window.URL.revokeObjectURL(url);
```

### Respondent Export Query

```ts
// Query pattern for export data
const rows = await db
  .select({
    firstName: respondents.firstName,
    lastName: respondents.lastName,
    nin: respondents.nin,
    phoneNumber: respondents.phoneNumber,
    dateOfBirth: respondents.dateOfBirth,
    lgaName: lgas.name,
    source: respondents.source,
    registeredAt: respondents.createdAt,
    fraudSeverity: fraudDetections.severity,
    verificationStatus: fraudDetections.resolution,
  })
  .from(respondents)
  .leftJoin(lgas, eq(respondents.lgaId, lgas.code))
  .leftJoin(submissions, eq(submissions.respondentId, respondents.id))
  .leftJoin(fraudDetections, eq(fraudDetections.submissionId, submissions.id))
  .where(and(...filterConditions))
  .orderBy(desc(respondents.createdAt));
```

**Important**: A respondent may have multiple submissions. Use `DISTINCT ON (respondents.id)` or aggregate to avoid duplicate rows in export. PostgreSQL pattern:
```sql
SELECT DISTINCT ON (r.id) r.first_name, r.last_name, ...
FROM respondents r
LEFT JOIN submissions s ON s.respondent_id = r.id
LEFT JOIN fraud_detections fd ON fd.submission_id = s.id
ORDER BY r.id, s.submitted_at DESC  -- Latest submission per respondent
```

In Drizzle, use raw SQL for DISTINCT ON:
```ts
const rows = await db.execute(sql`
  SELECT DISTINCT ON (r.id)
    r.first_name, r.last_name, r.nin, r.phone_number, r.date_of_birth,
    l.name as lga_name, r.source, r.created_at as registered_at,
    fd.severity as fraud_severity, fd.resolution as verification_status
  FROM respondents r
  LEFT JOIN lgas l ON r.lga_id = l.code
  LEFT JOIN submissions s ON s.respondent_id = r.id
  LEFT JOIN fraud_detections fd ON fd.submission_id = s.id
  ${filterWhereClause}
  ORDER BY r.id, s.submitted_at DESC
`);
```

### Performance Benchmarks (from spike)

| Format | 100 rows | 1,000 rows | 10,000 rows | 100,000 rows |
|--------|----------|------------|-------------|--------------|
| CSV | 2ms, 6KB | 4ms, 62KB | 32ms, 634KB | 292ms, 6.4MB |
| PDF | 274ms, 969KB | 1.4s, 9.7MB | 15.4s, 93MB | N/A (too large) |

**PDF max 1,000 rows** — enforced at controller. For larger exports, force CSV.
**CSV viable buffered to 100K+** — streaming not needed for typical filtered exports.

### Rate Limit Pattern

Follow the existing rate limiter pattern from `apps/api/src/middleware/rate-limit.ts`. The export rate limit is separate from API rate limits:
- Export: 5 per hour per user (prevents data scraping)
- Normal API: 100 per minute per user

Use the Redis store pattern already established. Skip in test environment.

### Existing Code to Reuse — DO NOT Reinvent

| Component | Location | Reuse For |
|-----------|----------|-----------|
| `ExportService` | `apps/api/src/services/export.service.ts` | PDF + CSV generation (prep-3) |
| `ExportColumn` type | `apps/api/src/services/export.service.ts` | Column definitions |
| `AuditService` | `apps/api/src/services/audit.service.ts` | PII export logging |
| `PII_ACTIONS.EXPORT_CSV/PDF` | `apps/api/src/services/audit.service.ts` | Action constants |
| `downloadStaffIdCard` pattern | `apps/web/src/features/staff/api/staff.api.ts` | Blob download pattern |
| `getAuthHeaders()` | `apps/web/src/lib/api-client.ts` | Auth headers for raw fetch |
| `URL.createObjectURL` trigger | `apps/web/src/features/staff/hooks/useStaff.ts` | Download link creation |
| Rate limit Redis store | `apps/api/src/middleware/rate-limit.ts` | Export rate limit middleware |
| `respondents` schema | `apps/api/src/db/schema/respondents.ts` | PII field definitions |
| `lgas` table | `apps/api/src/db/schema/lgas.ts` | LGA name lookup |
| `Card`, `CardContent` | `apps/web/src/components/ui/card` | Filter/export panel cards |
| `Badge` | `apps/web/src/components/ui/badge` | Filter value badges |
| `Select` | `apps/web/src/components/ui/select` | Filter dropdowns |
| `useToast` | `apps/web/src/hooks/useToast` | Success/error toast |
| Direction 08 tokens | `OfficialHome.tsx` | Styling reference |
| `export.test-helpers.ts` | `apps/api/src/services/__tests__/export.test-helpers.ts` | Test data generation |

### Direction 08 Styling (OfficialExportPage)

Maintain established tokens from Story 5.1:
- Header: `bg-gray-800 text-white` (if page has own header)
- Section headers: `border-l-4 border-[#9C1E23]` with uppercase label
- Cards: `bg-gray-50` or `bg-[#FAFAFA]` with `border border-gray-200 rounded-lg`
- Primary button: `bg-[#9C1E23] text-white font-semibold rounded-md`
- All data display is read-only

### Database Tables Used

| Table | Key Fields for Export |
|-------|---------------------|
| `respondents` | `id`, `nin`, `firstName`, `lastName`, `phoneNumber`, `dateOfBirth`, `lgaId`, `source`, `createdAt` |
| `submissions` | `id`, `respondentId`, `submittedAt` (for latest submission per respondent) |
| `fraud_detections` | `submissionId`, `severity`, `resolution` (for fraud context) |
| `lgas` | `code`, `name` (for LGA display names) |
| `audit_logs` | Written to via AuditService — not read in this story |

### Story 5.5 Integration Design

Story 5.5 (Respondent Data Registry Table) will add an `ExportButton` to the table toolbar. The button will pass the table's active filters to the same `downloadExport()` function. To support this:
- Export API accepts the SAME filter parameters as the registry table API (lgaId, source, dateFrom, dateTo, severity, verificationStatus)
- `ExportButton` component is reusable — accepts `filters` prop
- No changes needed to export API when Story 5.5 integrates

### Previous Story Learnings

- **UUID validation before DB query** (Epic 4): Validate all filter UUIDs before Drizzle query.
- **Content-Disposition for file downloads** (ID Card service): Always set `Content-Disposition: attachment` with proper filename. Never use `inline` for PII exports.
- **Blob download pattern** (Staff ID Card): Use raw `fetch()` for blob responses, NOT the `apiClient()` wrapper which parses JSON. Always `URL.revokeObjectURL()` after download.
- **Test WHERE clauses for scope** (Epic 4 recurring): Ensure export tests verify that filters actually restrict results (not just accept filter params and return all data).
- **A2: Skeleton must match content shape**: Filter area gets skeleton during LGA list loading. Export generation uses a progress bar (not skeleton — it's an action, not data loading).
- **A3: Test selectors only via data-testid**: No CSS class selectors in tests.
- **Task count discipline**: This story has 8 tasks (under 15 limit per A4).

### Testing Standards

- **Backend tests**: In `__tests__/` folders. Use `vi.hoisted()` + `vi.mock()` pattern.
- **Frontend tests**: Co-located as `.test.tsx`. Use `@testing-library/react` with `data-testid` selectors only.
- **Authorization tests**: Test ALL 7 roles. Authorized (official, super_admin, assessor) → 200. Unauthorized → 403.
- **Rate limit tests**: Verify 5th request passes, 6th blocked.
- **Audit log tests**: Verify audit log called with correct action, filters, and record count.
- **PDF row limit tests**: Verify > 1000 returns 400, ≤ 1000 returns PDF.
- **Empty state tests**: Export with no matching records returns valid empty CSV/PDF.

### Project Structure Notes

- **Backend** (new files):
  - `apps/api/src/services/export-query.service.ts`
  - `apps/api/src/services/__tests__/export-query.service.test.ts`
  - `apps/api/src/controllers/export.controller.ts`
  - `apps/api/src/controllers/__tests__/export.controller.test.ts`
  - `apps/api/src/routes/export.routes.ts`
  - `apps/api/src/middleware/export-rate-limit.ts`
  - `apps/api/src/middleware/__tests__/export-rate-limit.test.ts`
- **Backend** (modify):
  - `apps/api/src/routes/index.ts` — register export routes
- **Frontend** (new files):
  - `apps/web/src/features/dashboard/api/export.api.ts`
  - `apps/web/src/features/dashboard/hooks/useExport.ts`
  - `apps/web/src/features/dashboard/components/ExportButton.tsx`
  - `apps/web/src/features/dashboard/components/__tests__/ExportButton.test.tsx`
  - `apps/web/src/features/dashboard/pages/__tests__/ExportPage.test.tsx`
- **Frontend** (modify):
  - `apps/web/src/features/dashboard/pages/ExportPage.tsx` — rename from OfficialExportPage.tsx + replace stub
  - `apps/web/src/App.tsx` — add export routes under Super Admin and Assessor
- **Shared types** (optional):
  - `packages/types/src/export.ts` — `ExportFilters`, `ExportRow` types if shared across frontend/backend

### What NOT to Build (Out of Scope)

- Respondent data registry table → Story 5.5 (but export API accepts compatible filters)
- Individual record PII detail view → Story 5.3
- Streaming CSV for > 100K rows → current buffered approach handles up to 100K. Add streaming only if needed.
- BullMQ async export jobs → not needed at current scale. Direct response is fast enough (CSV 100K = 292ms).
- Server-side PDF pagination (download page by page) → enforce 1K row limit instead
- Export scheduling or email delivery → out of scope
- Export history/download log page → audit logs exist but no UI for viewing them (Story 6.1)

### Dependencies and Warnings

- **prep-3 (Export Infrastructure Spike)**: ExportService is DONE. `generatePdfReport()` and `generateCsvExport()` are tested and reviewed. Use directly — do not modify unless a bug is found.
- **prep-2 (Audit Logging)**: `AuditService` and `PII_ACTIONS.EXPORT_CSV/EXPORT_PDF` already defined. Use directly.
- **csv-stringify v6.6.0**: Already installed in `apps/api/package.json`. No additional install needed.
- **PDFKit**: Already installed (used by ID Card service). No additional install needed.
- **Duplicate rows risk**: Respondent with multiple submissions will appear multiple times in JOIN. MUST use `DISTINCT ON (respondents.id)` or `GROUP BY` to deduplicate.
- **LGA dropdown data**: The existing `/api/v1/admin/lgas` endpoint requires `super_admin` role — officials and assessors cannot use it. Task 2.5 creates a permissive `GET /api/v1/lgas` endpoint for all dashboard roles. The frontend LGA dropdown should use this new endpoint.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5 Story 5.4]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5 AC5.5.4 Export Integration]
- [Source: _bmad-output/implementation-artifacts/spike-export-infrastructure.md — spike summary with architecture + benchmarks]
- [Source: _bmad-output/implementation-artifacts/prep-3-export-infrastructure-spike.md — spike story with review fixes]
- [Source: apps/api/src/services/export.service.ts — ExportService (PDF + CSV)]
- [Source: apps/api/src/services/audit.service.ts — AuditService + PII_ACTIONS]
- [Source: apps/web/src/features/staff/api/staff.api.ts — blob download pattern]
- [Source: apps/web/src/features/staff/hooks/useStaff.ts — download trigger pattern]
- [Source: apps/web/src/lib/api-client.ts — getAuthHeaders()]
- [Source: apps/api/src/middleware/rate-limit.ts — Redis rate limit pattern]
- [Source: apps/api/src/db/schema/respondents.ts — PII fields]
- [Source: apps/web/src/features/dashboard/pages/OfficialExportPage.tsx — existing stub to rename to ExportPage.tsx and replace]
- [Source: _bmad-output/implementation-artifacts/5-1-high-level-policy-dashboard.md — Direction 08 styling]
- [Source: _bmad-output/project-context.md — implementation rules]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Rate limiter test timeout: `handler` option in express-rate-limit sends response directly (not `next()`). Fixed with `runMiddleware()` helper that resolves on either `next()` or `res.json()`.
- Frontend `@/` alias not resolving: Project uses relative imports. Fixed all to `../../../components/ui/` pattern.
- Radix UI DropdownMenu portal not supported in jsdom: Simplified ExportButton tests to focus on `defaultFormat` mode and basic rendering.
- Sidebar config test expected 4 items for assessor (now 5 with Export Data). Updated count assertion.
- OfficialSubPages test expected old placeholder text. Updated to test new ExportPage content with export hook mocks.

### Completion Notes List

- All 8 tasks implemented and tested (0 remaining)
- Backend: 31 new tests (11 query service + 17 controller + 3 rate limiter), all pass
- Frontend: 18 new tests (11 ExportPage + 7 ExportButton), all pass
- Full API suite: 827 pass, 0 fail, 7 skipped
- Full Web suite: 1680 pass, 0 fail, 2 todo
- DISTINCT ON (r.id) used for respondent deduplication across multiple submissions
- Forward-compatible ExportFilters interface with `[key: string]: unknown` for Story 5.5 extension
- OfficialExportPage kept as re-export of ExportPage for backward compatibility
- LGA permissive endpoint created at `/api/v1/lgas` (accessible to official, assessor, super_admin, supervisor)
- Pre-existing ExportService (prep-3) and AuditService (prep-2) reused directly — no modifications

### File List

**New Files (Backend):**
- `apps/api/src/services/export-query.service.ts` — Export query service with DISTINCT ON deduplication
- `apps/api/src/services/__tests__/export-query.service.test.ts` — 11 tests
- `apps/api/src/controllers/export.controller.ts` — Export controller with Zod validation
- `apps/api/src/controllers/__tests__/export.controller.test.ts` — 17 tests
- `apps/api/src/routes/export.routes.ts` — Export routes with auth + rate limit middleware
- `apps/api/src/routes/lga.routes.ts` — Permissive LGA list endpoint
- `apps/api/src/middleware/export-rate-limit.ts` — 5 req/hour/user rate limiter
- `apps/api/src/middleware/__tests__/export-rate-limit.test.ts` — 3 tests

**New Files (Frontend):**
- `apps/web/src/features/dashboard/api/export.api.ts` — API client (preview count, blob download, LGA list)
- `apps/web/src/features/dashboard/hooks/useExport.ts` — TanStack Query hooks
- `apps/web/src/features/dashboard/pages/ExportPage.tsx` — Full export page (filters, format toggle, PDF warning)
- `apps/web/src/features/dashboard/pages/__tests__/ExportPage.test.tsx` — 11 tests
- `apps/web/src/features/dashboard/components/ExportButton.tsx` — Reusable dropdown export button
- `apps/web/src/features/dashboard/components/__tests__/ExportButton.test.tsx` — 7 tests

**Modified Files:**
- `apps/api/src/routes/index.ts` — Registered `/exports` and `/lgas` routes
- `apps/web/src/App.tsx` — Added export routes for super-admin and assessor, updated lazy imports
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — Added "Export Data" nav items for assessor and super_admin
- `apps/web/src/features/dashboard/pages/OfficialExportPage.tsx` — Changed from stub to re-export of ExportPage
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` — Updated assessor sidebar count (4 → 5)
- `apps/web/src/features/dashboard/pages/__tests__/OfficialSubPages.test.tsx` — Updated OfficialExportPage tests for new content

### Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-02-22 | Story 5.4 implemented | All 8 tasks, 11 ACs, 49 new tests |
| 2026-02-23 | Code review: 9 findings (3H, 4M, 2L), all 9 fixed | H1 count endpoint Zod validation, H2 datetime validation, H3 403 auth tests, M1 A3 test violation, M2 LGA handler AppError, M3 JSON parse safety, M4 pending status option, L1 rate-limiter typing, L2 filter debounce. 37 API + 65 web tests pass (+6 new). |

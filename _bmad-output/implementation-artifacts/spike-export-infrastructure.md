# Spike Summary: Export Infrastructure (Prep-3)

**Date:** 2026-02-21
**Author:** Dev Agent (Claude Opus 4.6)
**Status:** Complete
**Blocks:** Story 5.4 (PII-Rich CSV/PDF Exports)

---

## 1. Library Selection

### PDF: PDFKit (already installed)

**Version:** 0.17.2 (already in `apps/api/package.json`)
**Decision:** Reuse existing PDFKit — proven in ID Card service, zero new dependencies.

### CSV: csv-stringify

**Version:** 6.6.0 (installed in this spike)
**Package:** `csv-stringify` from the csv.js project
**Selection Rationale:**
- Stream-first API (`csv-stringify/sync` for buffered, `csv-stringify` for streaming)
- Zero extra dependencies
- RFC 4180 compliant — handles commas, quotes, newlines, Unicode
- UTF-8 BOM support for Excel compatibility
- 2M+ weekly npm downloads, actively maintained
- Same family as `csv-parse` (already installed for XLSForm upload)

**Alternatives Evaluated:**
| Library | Streaming | Deps | Size | Notes |
|---------|-----------|------|------|-------|
| **csv-stringify** | Yes (native) | 0 | 12KB | Selected — best fit |
| papaparse | No (browser-first) | 0 | 45KB | Heavy, designed for parsing not generating |
| fast-csv | Yes | 3 | 20KB | Good but redundant since csv.js family already in use |
| Manual string | No | 0 | 0 | PoC worked well but lacks edge-case handling at scale |

---

## 2. Performance Benchmarks

### PDF Generation (A4 tabular, 5 columns, row striping, branded header/footer)

| Rows | Time | Size | Heap Delta | Notes |
|------|------|------|------------|-------|
| 100 | 274ms | 969KB | minimal | Fully viable buffered |
| 1,000 | 1,400ms | 9.7MB | minimal | Acceptable buffered |
| 10,000 | 15,446ms | 93MB | ~0MB* | **Too slow/large for buffered** |

*PDFKit streams internally; heap is stable but output buffer is huge.

### CSV Generation (csv-stringify/sync, 5 columns, UTF-8 BOM)

| Rows | Time | Size | Heap Delta | Notes |
|------|------|------|------------|-------|
| 100 | 2ms | 6KB | minimal | Trivial |
| 1,000 | 4ms | 62KB | minimal | Trivial |
| 10,000 | 32ms | 634KB | minimal | No issues |
| 100,000 | 292ms | 6.4MB | 82MB | Viable buffered |

### Extrapolation to 1M Records

| Format | Estimated Time | Estimated Size | Viable Buffered? |
|--------|---------------|----------------|------------------|
| CSV | ~3s | ~64MB | **Yes** (under 50MB limit with column filtering) |
| PDF | ~150s+ | ~930MB+ | **No** — must stream or paginate via API |

---

## 3. Architecture Decision: Streaming vs Buffered

### Recommendation: Hybrid Approach

| Format | < 1K rows | 1K–10K rows | > 10K rows |
|--------|-----------|-------------|------------|
| CSV | Buffered (sync) | Buffered (sync) | Streaming (async) |
| PDF | Buffered | Buffered | **Server-side pagination** |

**Key Insight:** PDF at scale is impractical for single-document download. At 10K rows the PDF is 93MB and takes 15s. Note: `bufferPages: true` in PDFKit keeps all pages in memory; this amplifies the problem for large documents. For Story 5.4's 1M target:
- **CSV:** Stream directly to response using `csv-stringify` async API. Memory-efficient.
- **PDF:** Enforce page limit (e.g., max 1,000 rows per PDF). For larger exports, force CSV format or implement server-side pagination with "Download page N" links.

### Architecture Diagram

```
                         ┌─────────────────────────┐
                         │   Frontend (React)       │
                         │  Export Button + Filters  │
                         └────────┬────────────────┘
                                  │ GET /api/v1/exports/respondents
                                  │   ?format=csv|pdf&filters=...
                                  ▼
                         ┌─────────────────────────┐
                         │   Express Router         │
                         │  authenticate            │
                         │  authorize(roles)        │
                         │  exportRateLimit(5/hr)   │
                         └────────┬────────────────┘
                                  │
                                  ▼
                         ┌─────────────────────────┐
                         │  ExportController        │
                         │  1. Validate query params │
                         │  2. Audit log (intent)   │◄── AuditService.logPiiAccess()
                         │  3. Query respondents    │
                         │  4. Route by format      │
                         └───┬─────────────┬───────┘
                             │             │
                    format=csv       format=pdf
                             │             │
                             ▼             ▼
                    ┌──────────────┐ ┌──────────────┐
                    │ CSV Export   │ │ PDF Export   │
                    │ csv-stringify│ │ PDFKit       │
                    │ stream→res  │ │ buffer→res   │
                    │ (no row cap)│ │ (max 1K rows)│
                    └──────────────┘ └──────────────┘
                             │             │
                             ▼             ▼
                    ┌─────────────────────────────┐
                    │  HTTP Response               │
                    │  Content-Disposition: attach  │
                    │  Cache-Control: no-store      │
                    └─────────────────────────────┘
```

### Implementation Pattern for Story 5.4

```
GET /api/v1/exports/respondents?format=csv&filters=...
  → Stream CSV response directly (Content-Disposition: attachment)

GET /api/v1/exports/respondents?format=pdf&filters=...
  → If rows > 1000: return 400 with "Use CSV for large exports or apply filters"
  → If rows ≤ 1000: Generate buffered PDF and send
```

---

## 4. Security Architecture

### 4.1 Export Endpoint Design

```
GET /api/v1/exports/respondents
  Query Parameters:
    format: "csv" | "pdf" (required)
    lgaId: UUID (optional filter)
    status: "verified" | "pending" | "flagged" (optional filter)
    dateFrom: ISO 8601 (optional)
    dateTo: ISO 8601 (optional)
    columns: comma-separated list (optional, defaults to all authorized)
```

### 4.2 Role Authorization

Only these roles may access PII exports:
- `government_official` — state-level aggregated data
- `super_admin` — full PII access
- `verification_assessor` — PII for assigned verification queue

Middleware chain:
```typescript
router.get('/exports/respondents',
  authenticate,
  authorize(UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPER_ADMIN, UserRole.VERIFICATION_ASSESSOR),
  exportRateLimit,
  ExportController.exportRespondents,
);
```

### 4.3 Audit Logging Integration (prep-2)

Log **before** streaming response (capture intent, not completion):
```typescript
AuditService.logPiiAccess(
  req,
  PII_ACTIONS.EXPORT_CSV,  // or EXPORT_PDF
  'respondents',
  null,  // null for list export
  { recordCount, filters, format }
);
```

PII_ACTIONS.EXPORT_CSV and EXPORT_PDF are already defined in `audit.service.ts`.

### 4.4 Rate Limiting

- **5 exports per hour per user** (prevents data scraping)
- Redis-backed for distributed consistency
- Per-user key (not per-IP, since authenticated)

```typescript
export const exportRateLimit = rateLimit({
  store: isTestEnv ? undefined : new RedisStore({
    sendCommand: (...args: string[]) => getRedisClient().call(...args),
  }),
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

### 4.5 Content-Disposition Headers

```typescript
// CSV
res.set({
  'Content-Type': 'text/csv; charset=utf-8',
  'Content-Disposition': `attachment; filename="oslsr-export-${date}.csv"`,
  'Cache-Control': 'no-store',
  'Pragma': 'no-cache',
});

// PDF
res.set({
  'Content-Type': 'application/pdf',
  'Content-Disposition': `attachment; filename="oslsr-export-${date}.pdf"`,
  'Content-Length': buffer.length.toString(),
  'Cache-Control': 'no-store',
  'Pragma': 'no-cache',
});
```

### 4.6 File Size Limits

- **PDF:** Max 1,000 rows (enforced at controller level, ~10MB)
- **CSV buffered:** Max 50,000 rows (~3.2MB, well under 50MB limit)
- **CSV streaming:** No hard row limit, but 50MB response size limit
- Configurable via environment variable: `EXPORT_MAX_PDF_ROWS=1000`

---

## 5. Estimated Story 5.4 Task Breakdown

Based on spike findings, Story 5.4 should include:

1. **Export controller + routes** — endpoint registration, request validation, Zod schema for query params
2. **CSV streaming export** — pipe csv-stringify stream to response for large datasets
3. **PDF buffered export** — reuse ExportService.generatePdfReport with row limit enforcement
4. **Rate limiter middleware** — exportRateLimit (5/hour/user, Redis-backed)
5. **Audit logging integration** — log before export, capture filters and record count
6. **Column authorization** — restrict visible columns by role (e.g., assessors can't see NIN)
7. **Filter validation** — Zod schema for query parameters, SQL injection prevention via parameterized queries
8. **Frontend export button** — download trigger on Official/Assessor dashboard with format selector
9. **Tests** — unit tests for export service, integration tests for endpoint, E2E test for download flow

**Estimated task count:** 9 tasks (within 15-task limit per team agreement A4)

---

## 6. Files Created / Modified

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/src/services/export.service.ts` | Created | PDF + CSV generation service |
| `apps/api/src/services/__tests__/export.service.test.ts` | Created | 18 unit tests (mocked PDFKit) |
| `apps/api/src/services/__tests__/export.performance.test.ts` | Created | Performance benchmarks (100, 1K, 10K rows) |
| `apps/api/src/services/__tests__/export.scale.test.ts` | Created | Scale tests (10K PDF, 100K CSV) |
| `apps/api/src/services/__tests__/export.test-helpers.ts` | Created | Shared test helpers (generateRows, sampleColumns, benchmarkColumns) |
| `apps/api/package.json` | Modified | Added csv-stringify ^6.6.0 |
| `_bmad-output/implementation-artifacts/spike-export-infrastructure.md` | Created | This document |

---

## 7. Key Recommendations for Story 5.4

1. **PDF max 1,000 rows** — enforce at controller, return 400 for larger requests
2. **CSV is the primary export format** — fast, small, streamable
3. **Stream CSV for > 10K rows** — use `csv-stringify` async stream API piped to response
4. **Audit BEFORE streaming** — log export intent, not completion
5. **Column filtering by role** — don't send NIN/Phone to roles that shouldn't see it
6. **No caching headers** — `Cache-Control: no-store` on all PII exports
7. **Date-stamped filenames** — `oslsr-export-2026-02-21.csv`

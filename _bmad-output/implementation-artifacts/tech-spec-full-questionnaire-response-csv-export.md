---
title: 'Full Questionnaire Response CSV Export'
slug: 'full-questionnaire-response-csv-export'
created: '2026-03-02'
status: 'review'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Express', 'Drizzle ORM (raw SQL)', 'csv-stringify', 'Zod', 'React', 'TanStack Query', 'PostgreSQL JSONB']
files_to_modify:
  - 'apps/api/src/services/export-query.service.ts'
  - 'apps/api/src/services/questionnaire.service.ts'
  - 'apps/api/src/controllers/export.controller.ts'
  - 'apps/api/src/routes/export.routes.ts'
  - 'apps/web/src/features/dashboard/pages/ExportPage.tsx'
  - 'apps/web/src/features/dashboard/api/export.api.ts'
  - 'apps/web/src/features/dashboard/hooks/useExport.ts'
  - 'apps/web/src/features/dashboard/pages/__tests__/OfficialSubPages.test.tsx'
code_patterns:
  - 'ExportQueryService — raw SQL with Drizzle sql template tag, returns typed rows'
  - 'ExportService.generateCsvExport — takes Record<string,unknown>[] + ExportColumn[], returns Buffer'
  - 'ExportColumn interface — { key: string; header: string; width: number }'
  - 'NativeFormSchema — sections[].questions[] with name/label/type/choices, choiceLists Record'
  - 'Question.choices references choiceLists key; Choice has {label, value}'
  - 'select_multiple rawData values are space-delimited coded strings'
  - 'Zod exportFilterSchema for query param validation'
  - 'AuditService.logPiiAccess called before export generation'
test_patterns:
  - 'vi.hoisted() + vi.mock() pattern for service mocking'
  - 'mockExecute for db.execute in query service tests'
  - 'makeMocks helper for Express req/res/next in controller tests'
  - 'beforeEach with vi.resetAllMocks()'
---

# Tech-Spec: Full Questionnaire Response CSV Export

**Created:** 2026-03-02

## Overview

### Problem Statement

The current respondent export (Story 5.4) only includes 14 identity + fraud context columns from the `respondents` table. The actual survey response data — employment status, skills, business info, household demographics, marketplace consent details — lives in `submissions.rawData` (JSONB) and is completely invisible to export users. Stakeholders cannot analyze the labour registry data they collected through the oslrs_master_v3 form (~35 response fields, 50+ skills).

### Solution

Extend the export system to flatten all `rawData` JSONB fields from questionnaire submissions into human-readable CSV columns. Add a form-selector dropdown so the export is form-aware (columns derived from the selected form's question structure). Map coded values (select_one/select_multiple) to human-readable labels. CSV-only for full response data (PDF cannot handle 35+ dynamic columns).

### Scope

**In Scope:**
- Flatten rawData JSONB into ~35 additional CSV columns alongside existing respondent identity columns
- Map select_one/select_multiple coded values to human-readable labels (e.g., `wage_public` → `Wage Earner (Government/Public Sector)`)
- Multi-select fields (skills_possessed, training_interest) → semicolon-delimited label strings
- Submission-level export (one row per submission, not per respondent)
- Form selector dropdown on export page (future-proofs for multiple forms)
- Metadata columns: Submission Date, Enumerator Name, Completion Time, GPS coordinates
- Same 3 authorized roles (Super Admin, Government Official, Verification Assessor)

**Out of Scope:**
- PDF export for full response data (too many columns for any page layout)
- Cross-form merged exports (different forms have different column sets)
- Editing rawData through the export UI
- Real-time streaming for very large datasets (>100K rows)

## Context for Development

### Codebase Patterns

- **Export infrastructure**: `ExportQueryService` (raw SQL via Drizzle `sql` tag), `ExportService` (CSV via `csv-stringify`, PDF via `pdfkit`), `ExportController` (Zod validation + audit logging)
- **CSV generation**: `ExportService.generateCsvExport(data: Record<string,unknown>[], columns: ExportColumn[])` — completely flexible; dynamic columns are natively supported since columns are passed as parameter
- **Form schema**: `questionnaireForms.formSchema` (JSONB) typed as `NativeFormSchema` at runtime, contains `sections[].questions[]` with `name`, `label`, `type`, `choices` (key into `choiceLists` record)
- **Choice resolution**: `NativeFormSchema.choiceLists` is `Record<string, Choice[]>` where `Choice = {label, value}`. For `select_one`, match `rawData[question.name]` against `choice.value` to get `choice.label`. For `select_multiple`, rawData value is space-delimited coded values — split and map each.
- **Existing filters**: Zod-validated `lgaId`, `source`, `dateFrom`, `dateTo`, `severity`, `verificationStatus`
- **Rate limiting**: 5 exports/hour per user via Redis-backed `express-rate-limit`
- **Audit**: `AuditService.logPiiAccess()` called before every export generation
- **Question types to export**: `text`, `number`, `date`, `select_one`, `select_multiple`. Skip `note` (display-only) and `geopoint` (metadata). Note: there is no `calculate` type in the `NativeFormSchema` — only these 7 types exist.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/api/src/controllers/export.controller.ts` | Export endpoint handler, EXPORT_COLUMNS, Zod schemas |
| `apps/api/src/services/export-query.service.ts` | SQL queries for respondent export data + count |
| `apps/api/src/services/export.service.ts` | CSV/PDF generation (`generateCsvExport`) |
| `apps/api/src/services/questionnaire.service.ts` | `getFormById()` returns `FormWithVersions` (no `formSchema`). Must be extended — see Task 4a. |
| `apps/api/src/services/submission-processing.service.ts` | `RESPONDENT_FIELD_MAP`, rawData extraction pattern |
| `packages/types/src/native-form.ts` | `NativeFormSchema`, `Question`, `Section`, `Choice` types |
| `apps/api/src/db/schema/submissions.ts` | Submissions table: rawData JSONB, respondentId, gps |
| `apps/api/src/db/schema/questionnaires.ts` | questionnaireForms table: formSchema JSONB column |
| `apps/web/src/features/dashboard/pages/ExportPage.tsx` | Shared export UI (filters + download) |
| `apps/web/src/features/dashboard/api/export.api.ts` | `fetchExportPreviewCount`, `downloadExport`, `fetchLgas` |
| `apps/web/src/features/dashboard/hooks/useExport.ts` | `useExportPreviewCount`, `useLgas`, `useExportDownload` |
| `docs/questionnaire_schema.md` | oslrs_master_v3 form definition — 6 sections, ~35 fields, 50+ skills |

### Technical Decisions

1. **Submission-level, not respondent-level**: One row per submission. A respondent with 3 submissions gets 3 rows. Preserves temporal data.
2. **Dynamic columns from formSchema**: Columns built at export time from `sections[].questions[]`. Automatically adapts when form is modified.
3. **Two export modes**: Existing "Respondent Summary" (14 fixed columns, PDF+CSV) unchanged. New "Full Response" mode (CSV-only, dynamic columns). User selects mode on export page.
4. **Label mapping**: `select_one` coded values → human-readable labels via `choiceLists`. `select_multiple` space-delimited codes → split, map each to label, join with `; `.
5. **Column order**: 13 fixed metadata columns first, in this exact order: NIN, Surname, First Name, LGA Name, Source, Submission Date (YYYY-MM-DD), Enumerator Name, Completion Time (seconds), GPS Latitude, GPS Longitude, Fraud Score, Fraud Severity, Verification Status — then all form response questions in section order.
6. **formId query param**: Required for "Full Response" mode. API validates form exists and has published formSchema.

## Implementation Plan

### Tasks

- [x] **Task 1: Add rawData flattening service**
  - File: `apps/api/src/services/export-query.service.ts`
  - Action: Add `getSubmissionExportData(filters)` method that queries at submission-level (not DISTINCT ON respondent). SQL joins `submissions s` → `respondents r` → `lgas l` → `users u` (enumerator name) → `fraud_detections fd`. Returns `s.raw_data` as JSONB alongside fixed columns (NIN, name, LGA, source, submitted_at, enumerator full_name, completion_time_seconds, gps_latitude, gps_longitude, fraud severity/score/resolution).
  - Notes: No DISTINCT ON — one row per submission. Filter on `s.questionnaire_form_id = $formId`. Reuse `buildWhereClause` pattern, add `formId` condition. Return raw rows — flattening happens in controller.

- [x] **Task 2: Add submission count query for full response mode**
  - File: `apps/api/src/services/export-query.service.ts`
  - Action: Add `getSubmissionFilteredCount(filters)` method. `SELECT COUNT(*) FROM submissions s LEFT JOIN respondents r ... LEFT JOIN fraud_detections fd ... WHERE s.questionnaire_form_id = $formId AND {dynamic_filters}`.
  - Notes: Parallel to existing `getFilteredCount` but counts submissions not respondents.

- [x] **Task 3: Add dynamic column builder + label mapper**
  - File: `apps/api/src/services/export-query.service.ts`
  - Action: Add two helper functions:
    - `buildColumnsFromFormSchema(schema: NativeFormSchema): ExportColumn[]` — Flatten `sections[].questions[]`, skip types `note`/`geopoint`. Build `ExportColumn` for each with `key = question.name`, `header = question.label`, `width = 80`.
    - `flattenRawDataRow(rawData: Record<string,unknown>, schema: NativeFormSchema): Record<string,string>` — For each question in the schema: if `select_one`, look up `choiceLists[question.choices]` and map coded value to label. If `select_multiple`, split by space, map each code to label, join with `; `. Otherwise, stringify the value. Return flat `{questionName: displayValue}` record.
  - Notes: These are pure functions, easily unit-testable.

- [x] **Task 4a: Add `getFormSchemaById` method to QuestionnaireService**
  - File: `apps/api/src/services/questionnaire.service.ts`
  - Action: Add a lightweight method `getFormSchemaById(id: string): Promise<NativeFormSchema | null>` that queries `questionnaire_forms` by UUID and returns only the `form_schema` JSONB column cast as `NativeFormSchema`. Return `null` if form not found or `formSchema` is null.
  - Notes: The existing `getFormById()` returns `FormWithVersions` which deliberately excludes `formSchema` (it can be large JSONB). A dedicated method avoids bloating the general-purpose return type. Import `NativeFormSchema` from `@oslsr/types`.

- [x] **Task 4b: Add formId to export filter schema + new endpoint mode**
  - File: `apps/api/src/controllers/export.controller.ts`
  - Action:
    - Extend `exportFilterSchema` with `formId: z.string().uuid().optional()`.
    - Extend `exportQuerySchema` with `exportType: z.enum(['summary', 'full']).default('summary')`.
    - In `exportRespondents`: if `exportType === 'full'`, validate `formId` is present and format is `csv` (reject PDF with 400 error). Fetch form schema via `QuestionnaireService.getFormSchemaById(formId)` (Task 4a). If null, throw 404. Build dynamic columns via `buildColumnsFromFormSchema`. Query via `getSubmissionExportData`. Flatten each row's rawData via `flattenRawDataRow`. Merge fixed metadata columns + flattened rawData into final rows. Generate CSV with dynamic columns.
    - In `getExportPreviewCount`: if `exportType === 'full'` and `formId` is present, call `ExportQueryService.getSubmissionFilteredCount(filters)` instead of `getFilteredCount(filters)`. This ensures the preview count reflects submission-level (not respondent-level) totals in Full Response mode.
    - If `exportType === 'summary'`, existing behavior for both endpoints unchanged.
  - Notes: Audit log should include `exportType` and `formId` in metadata.

- [x] **Task 5a: Add published forms endpoint on export routes (backend)**
  - File: `apps/api/src/routes/export.routes.ts` (or wherever export routes are registered)
  - Action: Add `GET /api/v1/exports/forms` endpoint authorized for the same 3 export roles (Super Admin, Government Official, Verification Assessor). The handler should call `QuestionnaireService.listForms({ status: 'published' })` and return a lightweight response: `{ data: Array<{ id, title, formId, version }> }`.
  - Notes: The existing `GET /api/v1/questionnaires` endpoint requires `UserRole.SUPER_ADMIN` (see `questionnaire.routes.ts:21`). Government Officials and Verification Assessors would get 403 if we called it directly. This dedicated endpoint exposes only published form metadata needed for the dropdown — no admin surface area.

- [x] **Task 5b: Add published forms API client (frontend)**
  - File: `apps/web/src/features/dashboard/api/export.api.ts`
  - Action: Add `fetchPublishedForms(): Promise<FormListItem[]>` calling `GET /api/v1/exports/forms`. Return `{id, title, formId, version}` items. Add `FormListItem` interface to the file.
  - Notes: Uses the new export-scoped endpoint from Task 5a, not the admin questionnaires endpoint.

- [x] **Task 6: Add usePublishedForms hook**
  - File: `apps/web/src/features/dashboard/hooks/useExport.ts`
  - Action: Add `usePublishedForms()` TanStack Query hook with `queryKey: ['forms', 'published']`, `staleTime: 5 * 60 * 1000`. Calls `fetchPublishedForms()` from Task 5b. Returns the published forms list for the dropdown.
  - Notes: Reuse existing `exportKeys` pattern. Add `publishedForms` key to `exportKeys` object.

- [x] **Task 7: Update ExportPage UI with mode toggle + form selector**
  - File: `apps/web/src/features/dashboard/pages/ExportPage.tsx`
  - Action:
    - Add export mode toggle: "Respondent Summary" (default) vs "Full Response"
    - When "Full Response" selected: show form selector dropdown (populated by `usePublishedForms`), hide PDF format option (CSV-only), update count preview to use submission-level count.
    - Add `formId` and `exportType` to the `filters` object passed to `downloadExport`.
    - When "Respondent Summary" selected: existing behavior unchanged.
  - Notes: Form selector uses maroon Select component matching existing filter controls. Show form title + version in dropdown.

- [x] **Task 8: Update export API client for new params**
  - File: `apps/web/src/features/dashboard/api/export.api.ts`
  - Action: Add `formId` and `exportType` to `ExportFilters` interface. Include them in `fetchExportPreviewCount` and `downloadExport` URL params when present.
  - Notes: Backward compatible — existing calls without these params work as before.

- [x] **Task 9: Write unit tests for rawData flattening + column builder**
  - File: `apps/api/src/services/__tests__/export-query.service.test.ts`
  - Action: Add test cases for:
    - `buildColumnsFromFormSchema`: verify note/geopoint types are skipped, verify column headers match question labels, verify section ordering preserved
    - `flattenRawDataRow`: verify select_one code → label mapping, verify select_multiple space-delimited → semicolon-delimited labels, verify text/number/date pass through, verify missing rawData keys → empty string, verify unknown choice code → raw value fallback
  - Notes: Use a mock NativeFormSchema with 2-3 sections, mix of question types, and a choiceLists record.

- [x] **Task 10: Write controller tests for full response export mode**
  - File: `apps/api/src/controllers/__tests__/export.controller.test.ts`
  - Action: Add test cases for:
    - Full response CSV export with valid formId returns CSV with dynamic columns
    - Full response with PDF format returns 400 error
    - Full response without formId returns 400 validation error
    - Full response with non-existent formId returns 404
    - Audit log includes exportType and formId
    - Preview count endpoint with `exportType=full` + `formId` calls `getSubmissionFilteredCount` (not `getFilteredCount`)
    - Preview count endpoint with `exportType=summary` (or omitted) calls `getFilteredCount` as before
  - Notes: Mock `QuestionnaireService.getFormSchemaById` and `ExportQueryService.getSubmissionExportData`.

- [x] **Task 11: Write frontend tests for mode toggle + form selector**
  - File: `apps/web/src/features/dashboard/pages/__tests__/ExportPage.test.tsx`
  - Action: Add test cases for:
    - Mode toggle renders and switches between Summary/Full Response
    - Form selector appears only in Full Response mode
    - PDF option hidden in Full Response mode
    - Form selector populates with published forms
    - Export button passes formId and exportType when in Full Response mode

### Acceptance Criteria

- [x] **AC 1**: Given a user selects "Full Response" export mode and picks a published form, when they click Export CSV, then the downloaded CSV contains one row per submission with all form questions as column headers using human-readable labels.

- [x] **AC 2**: Given a `select_one` question with coded value `wage_public` in rawData, when the CSV is generated, then the cell shows `Wage Earner (Government/Public Sector)` (the label from choiceLists), not the raw code.

- [x] **AC 3**: Given a `select_multiple` question (e.g., `skills_possessed`) with rawData value `carpentry plumbing welding`, when the CSV is generated, then the cell shows `Carpentry/Woodwork; Plumbing; Welding & Fabrication` (semicolon-delimited labels).

- [x] **AC 4**: Given a user selects "Full Response" mode, when they try to select PDF format, then the PDF option is disabled/hidden and only CSV is available.

- [x] **AC 5**: Given a user selects "Full Response" mode without selecting a form, when they click Export, then the export button is disabled and a validation message indicates a form must be selected.

- [x] **AC 6**: Given a user selects "Respondent Summary" mode (default), when they export, then the existing 14-column respondent-level export behavior is unchanged.

- [x] **AC 7**: Given a submission has rawData missing some optional fields (e.g., `monthly_income` was skipped due to conditional logic), when the CSV is generated, then the cell for that field is empty (not "undefined" or "null").

- [x] **AC 8**: Given the export includes metadata columns, when the CSV is generated, then each row includes: NIN, Surname, First Name, LGA Name, Source, Submission Date (YYYY-MM-DD), Enumerator Name, Completion Time (seconds), GPS Latitude, GPS Longitude, Fraud Score, Fraud Severity, Verification Status — followed by all form response columns.

- [x] **AC 9**: Given a form is modified (questions added/removed) and a new version published, when a user exports using the updated form, then the CSV columns automatically reflect the new form structure without any code changes.

- [x] **AC 10**: Given a coded value in rawData does not match any entry in choiceLists (e.g., data collected before a choice was renamed), when the CSV is generated, then the raw coded value is displayed as fallback (not an error).

## Additional Context

### Dependencies

- **No new packages required** — `csv-stringify` (already installed) handles dynamic columns natively
- **New endpoint needed**: `GET /api/v1/exports/forms` — the existing `GET /api/v1/questionnaires` is Super Admin only; export roles (Government Official, Verification Assessor) need a dedicated endpoint for the form selector dropdown (Task 5a)
- **Existing service extended**: `QuestionnaireService.getFormSchemaById()` (new method, Task 4a) returns `formSchema` JSONB. The existing `getFormById()` does not include `formSchema` in its return type.
- **Database**: No schema changes required — all data already exists in `submissions.raw_data` JSONB and `questionnaire_forms.form_schema` JSONB

### Testing Strategy

**Unit Tests:**
- `buildColumnsFromFormSchema` — pure function, test with mock NativeFormSchema
- `flattenRawDataRow` — pure function, test select_one mapping, select_multiple splitting, missing fields, unknown codes
- `getSubmissionExportData` — mock `db.execute`, verify SQL includes formId filter, verify row mapping
- Controller — mock services, verify routing logic for summary vs full mode, verify 400 on PDF+full, verify audit metadata

**Integration Tests (manual):**
- Export with oslrs_master_v3 form, verify all 35+ columns present with correct labels
- Export with skills_possessed multi-select, verify semicolon-delimited labels
- Export with conditional fields (e.g., employment_status=no skips main_occupation), verify empty cells
- Verify existing "Respondent Summary" export still works unchanged

### Notes

- **Risk: Large rawData payloads** — If a form has 50+ questions and there are 10K+ submissions, the JSONB extraction could be memory-intensive. Mitigated by existing rate limiting (5/hour) and the fact that the CSV buffer is generated synchronously (not streamed). Monitor memory on the 2GB VPS.
- **Risk: Choice list mismatch** — If rawData was collected with v2 of the form but the current formSchema is v3 with renamed choices, some codes won't map. AC 10 handles this with raw value fallback.
- **Future: Cross-form export** — If multiple forms are published, each has different columns. This spec intentionally scopes to single-form export per download. Cross-form merging (union of all columns) is a future enhancement.
- **Future: Streaming for large exports** — For >50K rows, consider switching to `csv-stringify` streaming mode with `res.pipe()` instead of buffering the entire CSV in memory.

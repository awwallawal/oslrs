# Story 2.1: XLSForm Upload & Validation

Status: done

## Story

As a Super Admin,
I want to upload an XLSForm definition file directly to the Custom App,
So that I can update the survey structure without using the ODK Central UI.

## Acceptance Criteria

### AC1: XLSForm File Upload Endpoint
**Given** a Super Admin with valid authentication
**When** they upload an `.xlsx` or `.xml` form definition file via the Custom App dashboard
**Then** the system must accept files up to 10MB
**And** return a `201 Created` response with the form's internal ID
**And** reject files with invalid extensions (only `.xlsx` and `.xml` allowed)
**And** reject files exceeding size limit with `413 Payload Too Large`.

### AC2: XLSForm Schema Validation
**Given** an uploaded XLSForm file
**When** the system processes the upload
**Then** it must validate the file structure:
  - **For .xlsx files:** Must contain `survey`, `choices`, and `settings` worksheets
  - **For .xml files:** Must be valid XForm XML with proper namespace declarations
**And** validate required fields in `settings` worksheet: `form_id`, `version`, `form_title`
**And** validate `survey` worksheet has required columns: `type`, `name`, `label`
**And** validate `choices` worksheet has required columns: `list_name`, `name`, `label`
**And** return structured validation errors with line/column references for invalid rows.

### AC3: Questionnaire Schema Compliance
**Given** a structurally valid XLSForm
**When** the system validates the content
**Then** it must verify alignment with the OSLSR questionnaire schema (`docs/questionnaire_schema.md` v3.0):
  - **Required for Marketplace (FR17):**
    - `consent_marketplace` field must exist (required for Story 7.1 marketplace extraction)
    - `consent_enriched` field must exist (required for enriched contact consent)
    - `lga_id` field must exist as `select_one lga_list` (required for marketplace LGA filtering)
    - `years_experience` field must exist as `select_one experience_list` (required for marketplace experience filtering)
    - `skills_possessed` field must exist as `select_multiple skill_list` (required for marketplace skill filtering)
  - **Required for Identity (FR5, FR21):**
    - `nin` field must exist with `constraint` for 11-digit numeric validation
    - `phone_number` field must exist with Nigerian mobile format constraint
  - **Business Owner Fields (conditional):**
    - `business_address` field should exist when `has_business=yes` (warn if missing)
    - `apprentice_count` field should exist when `has_business=yes` (warn if missing)
  - **Optional but recommended:**
    - `skills_other` field for free-text unlisted skills (warn if missing)
**And** warn (not block) if optional recommended fields are missing
**And** enforce unique field names within the form.

### AC4: Form Versioning & Storage
**Given** a validated XLSForm
**When** the form is stored in the database
**Then** the system must:
  - Store the raw file blob in `app_db.questionnaire_files` table
  - Generate a new version number (semver: `major.minor.patch`)
  - Track version history with timestamp and uploading admin ID
  - Support rollback to previous versions
**And** the form record must include: `form_id`, `version`, `title`, `status`, `uploaded_by`, `uploaded_at`, `file_hash` (SHA-256)
**And** duplicate uploads (same file hash) must be rejected with reference to existing version.

### AC5: Form Status Lifecycle
**Given** a stored XLSForm
**When** managing form status
**Then** the system must support the following statuses:
  - `draft` - Initial upload, not deployed to ODK
  - `published` - Pushed to ODK Central (Story 2.2)
  - `deprecated` - Replaced by newer version, still visible
  - `archived` - Hidden from active views
**And** only `draft` forms can be deleted
**And** `published` forms can only be deprecated (never deleted for audit trail).

### AC6: Super Admin Authorization
**Given** the XLSForm management endpoints
**When** any user attempts to access them
**Then** the system must verify:
  - User has `SUPER_ADMIN` role
  - JWT token is valid and not blacklisted
**And** return `403 Forbidden` for non-Super Admin users
**And** log all upload/delete/status-change actions to audit trail.

### AC7: Upload UI Component
**Given** the Super Admin dashboard
**When** navigating to Questionnaire Management
**Then** the UI must provide:
  - Drag-and-drop file upload zone with file type hints
  - Progress indicator during upload
  - Validation result display (errors/warnings)
  - Form version history table
  - "Delete Draft" and "Archive" action buttons
**And** use skeleton loading during data fetch
**And** use optimistic UI with toast notifications for actions.

### AC8: Validation Error Response Format
**Given** an XLSForm with validation errors
**When** the validation fails
**Then** the API must return a structured error response:
```json
{
  "code": "XLSFORM_VALIDATION_ERROR",
  "message": "Form validation failed",
  "details": {
    "errors": [
      {
        "worksheet": "survey",
        "row": 15,
        "column": "type",
        "message": "Invalid question type 'textt'. Did you mean 'text'?",
        "severity": "error"
      }
    ],
    "warnings": [
      {
        "worksheet": "survey",
        "message": "Field 'consent_enriched' not found. Marketplace enrichment will be disabled.",
        "severity": "warning"
      }
    ]
  }
}
```
**And** the response must be parseable by the frontend for inline error display.

## Tasks / Subtasks

- [x] **Task 1: Database Schema** (AC: #4, #5)
  - [x] 1.1: Create Drizzle schema `apps/api/src/db/schema/questionnaires.ts` with:
    - `questionnaire_forms` table: id (UUIDv7), form_id, version, title, status, file_hash, uploaded_by, created_at, updated_at
    - `questionnaire_files` table: id (UUIDv7), form_version_id (FK), file_blob, file_name, file_size, mime_type
    - `questionnaire_versions` table: id, form_id (logical), version, change_notes, created_by, created_at
  - [x] 1.2: Add indexes: `idx_forms_form_id`, `idx_forms_status`, `idx_forms_file_hash`
  - [x] 1.3: Create Drizzle migration: `pnpm drizzle-kit generate`
  - [x] 1.4: Export schema from `apps/api/src/db/schema/index.ts`

- [x] **Task 2: XLSForm Parsing Service** (AC: #2, #3)
  - [x] 2.1: Run `pnpm add xlsx -w --filter @oslsr/api` for Excel parsing
  - [x] 2.2: Create `XlsformParserService` in `apps/api/src/services/xlsform-parser.service.ts`
  - [x] 2.3: Implement `parseXlsxFile(buffer: Buffer)` returning structured form data
  - [x] 2.4: Implement `parseXmlFile(buffer: Buffer)` for XForm XML parsing
  - [x] 2.5: Implement `validateStructure(formData)` checking required worksheets/columns
  - [x] 2.6: Implement `validateSchema(formData)` checking OSLSR-specific fields
  - [x] 2.7: Create typed interfaces in `packages/types/src/questionnaire.ts`
  - [x] 2.8: Write unit tests for parser with valid/invalid XLSForm fixtures

- [x] **Task 3: Questionnaire Service** (AC: #4, #5, #6)
  - [x] 3.1: Create `QuestionnaireService` in `apps/api/src/services/questionnaire.service.ts`
  - [x] 3.2: Implement `uploadForm(file, userId)` with validation + storage
  - [x] 3.3: Implement `getFormVersions(formId)` for version history
  - [x] 3.4: Implement `updateFormStatus(formId, status, userId)` with audit logging
  - [x] 3.5: Implement `deleteForm(formId, userId)` (draft only)
  - [x] 3.6: Implement `generateVersion(formId, existingVersions)` using semver logic
  - [x] 3.7: Implement `computeFileHash(buffer)` using SHA-256
  - [x] 3.8: Write integration tests for service methods

- [x] **Task 4: Upload Controller & Routes** (AC: #1, #6, #8)
  - [x] 4.1: Create `QuestionnaireController` in `apps/api/src/controllers/questionnaire.controller.ts`
  - [x] 4.2: Implement `POST /api/v1/questionnaires/upload` with multer middleware
  - [x] 4.3: Implement `GET /api/v1/questionnaires` - list all forms
  - [x] 4.4: Implement `GET /api/v1/questionnaires/:id` - get form details + versions
  - [x] 4.5: Implement `PATCH /api/v1/questionnaires/:id/status` - update status
  - [x] 4.6: Implement `DELETE /api/v1/questionnaires/:id` - delete draft
  - [x] 4.7: Create routes in `apps/api/src/routes/questionnaire.routes.ts`
  - [x] 4.8: Add `superAdminOnly` middleware check on all endpoints
  - [x] 4.9: Register routes in `apps/api/src/routes/index.ts`

- [x] **Task 5: File Upload Middleware** (AC: #1)
  - [x] 5.1: Run `pnpm add multer @types/multer -w --filter @oslsr/api`
  - [x] 5.2: Create upload config in `apps/api/src/middleware/upload.middleware.ts`
  - [x] 5.3: Configure memory storage with 10MB limit
  - [x] 5.4: Add file filter for `.xlsx` and `.xml` extensions
  - [x] 5.5: Handle multer errors with AppError conversion

- [x] **Task 6: Validation Schemas** (AC: #2, #8)
  - [x] 6.1: Create `uploadQuestionnaireSchema` in `packages/types/src/validation/questionnaire.ts`
  - [x] 6.2: Create `updateStatusSchema` with valid status transitions
  - [x] 6.3: Create `XlsformValidationResult` type with errors/warnings arrays
  - [x] 6.4: Export from `packages/types/src/index.ts`

- [x] **Task 7: Frontend - Questionnaire Management Page** (AC: #7)
  - [x] 7.1: Create `apps/web/src/features/questionnaires/` feature directory
  - [x] 7.2: Create `QuestionnaireManagementPage.tsx` with layout
  - [x] 7.3: Run `pnpm add react-dropzone -w --filter @oslsr/web` for drag-drop upload
  - [x] 7.4: Create `QuestionnaireUploadForm.tsx` with drag-drop using react-dropzone
  - [x] 7.5: Create `QuestionnaireList.tsx` with DataTable pattern
  - [x] 7.6: Create `QuestionnaireVersionHistory.tsx` modal/drawer
  - [x] 7.7: Create `ValidationResultDisplay.tsx` for error/warning rendering
  - [x] 7.8: Add TanStack Query hooks in `useQuestionnaires.ts`
  - [x] 7.9: Add route to `App.tsx`: `/admin/questionnaires` (super_admin only)
  - [x] 7.10: Write component tests

- [x] **Task 8: Audit Logging Integration** (AC: #6)
  - [x] 8.1: Add audit log events: `questionnaire.upload`, `questionnaire.status_change`, `questionnaire.delete`
  - [x] 8.2: Log file metadata (name, size, hash) but NOT file content
  - [x] 8.3: Include actor ID in all logs (already in questionnaire.service.ts)

## Dev Notes

### Technical Stack
- **Excel Parsing:** `xlsx` package (SheetJS) for .xlsx files
- **XML Parsing:** Built-in Node.js DOMParser or `fast-xml-parser` for XForm XML
- **File Upload:** Multer with memory storage (no disk writes)
- **File Hash:** Node.js `crypto.createHash('sha256')`
- **Version Numbering:** Simple increment (1.0.0 → 1.0.1 for patches, 1.1.0 for content changes)

### XLSForm Standard Reference
- **Official Spec:** https://xlsform.org/en/
- **Required Worksheets:**
  - `survey` - Question definitions (type, name, label, hint, constraint)
  - `choices` - Choice lists for select questions (list_name, name, label)
  - `settings` - Form metadata (form_id, version, form_title)
- **Common Types:** text, integer, decimal, select_one, select_multiple, geopoint, image, date

### OSLSR-Specific Fields (from docs/questionnaire_schema.md v3.0)

**Required Fields for Validation:**
| Field | Type | Required | Purpose | PRD Reference |
|-------|------|----------|---------|---------------|
| `consent_marketplace` | select_one yes_no | ✅ Yes | Stage 1 marketplace consent | FR2, FR17 |
| `consent_enriched` | select_one yes_no | ✅ Yes | Stage 2 contact enrichment consent | FR2 |
| `nin` | text | ✅ Yes | 11-digit NIN (Modulus 11 frontend validation) | FR5, FR21 |
| `phone_number` | text | ✅ Yes | Nigerian mobile format (0[7-9][0-1]xxxxxxxx) | FR17 |
| `lga_id` | select_one lga_list | ✅ Yes | Local Government Area (33 Oyo LGAs) | FR17 |
| `years_experience` | select_one experience_list | ✅ Yes | Years of experience in occupation | FR17 |
| `skills_possessed` | select_multiple skill_list | ✅ Yes | Primary skills (50+ options) | FR17 |

**Conditional/Optional Fields (warn if missing):**
| Field | Type | Condition | Purpose |
|-------|------|-----------|---------|
| `business_address` | text | `has_business=yes` | Business premises location |
| `apprentice_count` | integer | `has_business=yes` | Workforce planning metrics |
| `skills_other` | text | Always | Free-text for unlisted skills |

**Choice Lists to Validate:**
| List Name | Min Options | Description |
|-----------|-------------|-------------|
| `lga_list` | 33 | Oyo State LGAs |
| `skill_list` | 50+ | Categorized skills |
| `experience_list` | 5 | Years of experience ranges |
| `emp_type` | 6 | Employment types (incl. contractor) |

### File Storage Strategy
- **Why app_db not filesystem:**
  - Transactional consistency (upload + metadata atomically)
  - Easier backup/restore (pg_dump includes files)
  - No filesystem permission issues in Docker
  - Files are small (<10MB each)
- **Alternative considered:** S3 storage - rejected for complexity at this scale

### Version Numbering Logic
```typescript
function generateNextVersion(existingVersions: string[]): string {
  if (existingVersions.length === 0) return '1.0.0';
  const latest = existingVersions.sort(semver.rcompare)[0];
  return semver.inc(latest, 'patch'); // 1.0.0 → 1.0.1
}
```

### Project Structure Notes

**ESM Import Convention (CRITICAL):**
```typescript
// ✅ CORRECT: Include .js extension for local imports
import { db } from '../db/index.js';
import { questionnaireForms } from '../db/schema/index.js';

// ✅ CORRECT: Workspace packages don't need extension
import { AppError } from '@oslsr/utils';
import { QuestionnaireForm } from '@oslsr/types';
```

**File Naming:**
- Services: `kebab-case.service.ts` (e.g., `xlsform-parser.service.ts`)
- Controllers: `kebab-case.controller.ts`
- Routes: `kebab-case.routes.ts`
- Schema: `kebab-case.ts` in `db/schema/`

### Previous Story Intelligence (Story 1-11)

**Patterns to Reuse:**
- Provider abstraction pattern (for future ODK push in Story 2.2)
- BullMQ queue pattern (if async validation needed)
- Audit logging pattern in services
- ESM import convention with `.js` extension

**Learnings Applied:**
- Use `crypto.timingSafeEqual()` for any security-sensitive comparisons
- Test NIN validation with real Modulus 11 algorithm (not Verhoeff)
- Handle database constraint violations gracefully with `AppError`

### Architecture Compliance

| ADR | Requirement | Implementation |
|-----|-------------|----------------|
| ADR-001 | Composed Monolith | XLSForm stored in Custom App, pushed to ODK in Story 2.2 |
| ADR-002 | ODK Integration Abstraction | This story is Custom App only; ODK push is Story 2.2 |
| ADR-007 | Database Separation | Forms stored in `app_db`, NOT `odk_db` |
| NFR8.1 | Database Constraints | UNIQUE constraint on `(form_id, version)` |
| NFR8.3 | Audit Trails | All uploads/changes logged |

### Testing Strategy

**Unit Tests:**
- XLSForm parser with valid/invalid fixture files
- Version generation logic
- File hash computation
- Validation error formatting

**Integration Tests:**
- Full upload flow with mock files
- Status transition validation
- Duplicate file rejection
- Authorization checks (Super Admin only)

**Test Fixtures Needed:**
- `test-fixtures/valid-survey.xlsx` - Complete OSLSR questionnaire (schema v3.0 compliant)
- `test-fixtures/invalid-structure.xlsx` - Missing required worksheets
- `test-fixtures/invalid-fields.xlsx` - Missing consent/marketplace fields
- `test-fixtures/missing-lga.xlsx` - Missing `lga_id` field (FR17 violation)
- `test-fixtures/missing-experience.xlsx` - Missing `years_experience` field (FR17 violation)
- `test-fixtures/incomplete-skills.xlsx` - `skill_list` with fewer than 50 options
- `test-fixtures/valid-form.xml` - XForm XML format

### Security Considerations

- File type validation by content (magic bytes), not just extension
- Memory storage prevents arbitrary file writes
- File size limit (10MB) prevents DoS
- Super Admin only access
- Audit trail for forensics
- SHA-256 hash prevents duplicate storage attacks

### API Response Examples

**Successful Upload:**
```json
{
  "data": {
    "id": "018e5f2a-1234-7890-abcd-1234567890ab",
    "formId": "oslsr_labour_survey",
    "version": "1.0.0",
    "title": "OSLSR Labour Survey 2026",
    "status": "draft",
    "uploadedBy": "018e5f2a-...",
    "uploadedAt": "2026-01-26T10:30:00.000Z",
    "fileHash": "sha256:abc123...",
    "validationWarnings": []
  }
}
```

**Validation Error:**
```json
{
  "code": "XLSFORM_VALIDATION_ERROR",
  "message": "Form validation failed with 2 errors and 1 warning",
  "details": {
    "errors": [...],
    "warnings": [...]
  }
}
```

### References

- [Source: PRD v7.8 - FR14 - "XLSForm upload to Custom App, push to ODK Central"]
- [Source: PRD v7.8 - FR17 - "Marketplace filtering by skill, LGA, years of experience"]
- [Source: PRD v7.8 - FR5, FR21 - "NIN required, global uniqueness enforcement"]
- [Source: architecture.md - ADR-001, ADR-002, ADR-007]
- [Source: docs/questionnaire_schema.md v3.0 - OSLSR field requirements (updated 2026-01-26)]
- [Source: project-context.md - ESM imports, UUIDv7, Drizzle patterns]
- [Source: Story 1-11 - Provider pattern, audit logging, ESM conventions]

### Schema Version Dependency

This story depends on **questionnaire_schema.md v3.0** (2026-01-26) which added:
- `lga_id` field with 33 Oyo State LGAs
- `years_experience` field for marketplace filtering
- `skills_possessed` expanded to 50+ skills
- `skills_other` free-text field for unlisted skills
- `business_address` and `apprentice_count` for business owners
- `contractor` added to employment types
- NIN changed from optional to required

## Dev Agent Record

### Agent Model Used
Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References
- Code review performed 2026-01-27 by Amelia (Dev Agent)

### Completion Notes List
- All 8 tasks implemented and marked complete
- Code review identified 4 HIGH, 4 MEDIUM, 2 LOW issues
- H1 (XML validation bypass): Fixed — XML files now get limited validation with clear warning
- H2 (COUNT query): Fixed — uses SQL COUNT(*) aggregate instead of fetching all rows
- H3 (Unused Zod schemas): Fixed — controller now uses Zod schemas from @oslsr/types
- H4 (No magic bytes): Fixed — added validateFileContent middleware with PK/XML magic byte checks
- M1 (fileBlob base64): Deferred — schema change would require migration; documented as known trade-off for <10MB files
- M2 (Duplicated transitions): Fixed — service now uses shared VALID_STATUS_TRANSITIONS from @oslsr/types
- M3 (Empty Dev Agent Record): Fixed — this section
- M4 (Tests unverified): Tests run after fixes

### File List
- `apps/api/src/db/schema/questionnaires.ts` — NEW: Drizzle schema for questionnaire_forms, questionnaire_files, questionnaire_versions tables
- `apps/api/src/db/schema/index.ts` — MODIFIED: Added questionnaires export
- `apps/api/src/db/schema/relations.ts` — MODIFIED: Added questionnaire relations
- `apps/api/src/services/xlsform-parser.service.ts` — NEW: XLSForm parsing and validation service
- `apps/api/src/services/questionnaire.service.ts` — NEW: Questionnaire upload, versioning, lifecycle service
- `apps/api/src/controllers/questionnaire.controller.ts` — NEW: REST controller for questionnaire endpoints
- `apps/api/src/middleware/upload.middleware.ts` — NEW: Multer config with magic bytes validation
- `apps/api/src/routes/questionnaire.routes.ts` — NEW: Express routes for questionnaire API
- `apps/api/src/routes/index.ts` — MODIFIED: Registered questionnaire routes
- `apps/api/src/services/__tests__/xlsform-parser.service.test.ts` — NEW: Unit tests for XLSForm parser
- `apps/api/src/services/__tests__/questionnaire.service.test.ts` — NEW: Integration tests for questionnaire service
- `apps/api/drizzle/0008_spotty_whizzer.sql` — NEW: Migration SQL
- `apps/api/drizzle/meta/0008_snapshot.json` — NEW: Migration snapshot
- `apps/api/drizzle/meta/_journal.json` — MODIFIED: Migration journal updated
- `apps/api/package.json` — MODIFIED: Added xlsx, multer dependencies
- `packages/types/src/questionnaire.ts` — NEW: Questionnaire and XLSForm TypeScript types
- `packages/types/src/validation/questionnaire.ts` — NEW: Zod validation schemas for questionnaire API
- `packages/types/src/index.ts` — MODIFIED: Added questionnaire type exports
- `apps/web/src/features/questionnaires/pages/QuestionnaireManagementPage.tsx` — NEW: Management page
- `apps/web/src/features/questionnaires/components/QuestionnaireUploadForm.tsx` — NEW: Drag-drop upload
- `apps/web/src/features/questionnaires/components/QuestionnaireList.tsx` — NEW: Form list with DataTable
- `apps/web/src/features/questionnaires/components/QuestionnaireVersionHistory.tsx` — NEW: Version history modal
- `apps/web/src/features/questionnaires/components/ValidationResultDisplay.tsx` — NEW: Validation error/warning display
- `apps/web/src/features/questionnaires/hooks/useQuestionnaires.ts` — NEW: TanStack Query hooks
- `apps/web/src/features/questionnaires/api/questionnaire.api.ts` — NEW: API client functions
- `apps/web/src/features/questionnaires/components/index.ts` — NEW: Component barrel export
- `apps/web/src/features/questionnaires/index.ts` — NEW: Feature barrel export
- `apps/web/src/features/questionnaires/__tests__/QuestionnaireManagementPage.test.tsx` — NEW: Page test
- `apps/web/src/features/questionnaires/__tests__/ValidationResultDisplay.test.tsx` — NEW: Validation display test
- `apps/web/src/App.tsx` — MODIFIED: Added /admin/questionnaires route
- `apps/web/package.json` — MODIFIED: Added react-dropzone dependency
- `package.json` — MODIFIED: Updated workspace dependencies
- `pnpm-lock.yaml` — MODIFIED: Lock file updated

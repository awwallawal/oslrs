# Story 2.8: Skip Logic & Form Services

Status: done

## Story

As a Developer,
I want API services for skip logic evaluation and form CRUD,
so that the Form Builder can save and validate forms.

## Acceptance Criteria

1. **AC2.8.1: Skip Logic Evaluation** — Given a form with conditions, when I evaluate skip logic using the SkipLogicService, then it correctly determines field visibility for all operator types (equals, not_equals, greater_than, greater_or_equal, less_than, less_or_equal, is_empty, is_not_empty) and condition groups (AND/OR).

2. **AC2.8.2: Form CRUD Operations** — Given a form schema, when I call CRUD methods on the NativeFormService, then forms are created, updated, validated for publish, and flattened for rendering. The `native_published_at` column and `form_schema.publishedAt` JSONB field MUST be kept in sync on publish.

3. **AC2.8.3: API Endpoints** — Given an authenticated Super Admin, when they call native form API endpoints (`POST /native`, `GET /:id/schema`, `PUT /:id/schema`, `POST /:id/publish`, `GET /:id/preview`), then they can create and manage forms with proper Zod validation and AppError error handling.

## Tasks / Subtasks

- [x] Task 2.8.1: Create SkipLogicService in shared `@oslsr/utils` package (AC: #1)
  - [x] Create `packages/utils/src/skip-logic.ts` (shared package — reusable by both API and frontend)
  - [x] Implement `evaluateCondition(condition, formData)` — single condition evaluation
  - [x] Implement `evaluateConditionGroup(group, formData)` — AND/OR logic
  - [x] Implement `evaluateShowWhen(showWhen, formData)` — unified entry point (Condition | ConditionGroup)
  - [x] Implement `getVisibleQuestions(schema, formData)` — returns IDs of visible questions/sections
  - [x] Implement `parseXlsformRelevance(expression)` — parse ODK relevance string (e.g., `${age} >= 15`, `${status} = 'yes' or ${absent} = 'yes'`) into native `Condition | ConditionGroup`
  - [x] Export all functions from `packages/utils/src/index.ts`
  - [x] Create `packages/utils/src/__tests__/skip-logic.test.ts` with 20+ tests
- [x] Task 2.8.2: Create NativeFormService (AC: #2)
  - [x] Create `apps/api/src/services/native-form.service.ts`
  - [x] Implement `createForm(data, userId)` — creates new native form row with `isNative: true`
  - [x] Implement `updateFormSchema(formId, schema, userId)` — update JSONB, validate via Zod
  - [x] Implement `validateForPublish(schema)` — pre-publish validation checks
  - [x] Implement `publishForm(formId, userId)` — set status + sync `nativePublishedAt`
  - [x] Implement `getFormSchema(formId)` — retrieve form schema JSONB
  - [x] Implement `flattenForRender(schema)` — flatten schema for client rendering
  - [x] Create `apps/api/src/services/__tests__/native-form.service.test.ts` with 12+ tests
- [x] Task 2.8.3: Add native form routes (AC: #3)
  - [x] Update `apps/api/src/routes/questionnaire.routes.ts` with native form endpoints
  - [x] `POST /native` — create new native form
  - [x] `GET /:id/schema` — get form schema
  - [x] `PUT /:id/schema` — update form schema
  - [x] `POST /:id/publish` — publish native form
  - [x] `GET /:id/preview` — get flattened preview
- [x] Task 2.8.4: Add controller methods (AC: #3)
  - [x] Update `apps/api/src/controllers/questionnaire.controller.ts` with native form handlers
  - [x] Add Zod validation for all request bodies
  - [x] Add proper AppError error codes

### Review Follow-ups (AI)
- [x] [AI-Review][HIGH] H1: Wrap createForm in db.transaction() for atomicity `[native-form.service.ts:60-89]` — FIXED
- [x] [AI-Review][HIGH] H2: Add UUID format validation on `:id` param routes to prevent non-UUID matches `[questionnaire.routes.ts]` — FIXED
- [x] [AI-Review][HIGH] H3: Align NativeFormSchema Zod/TS status enum with DB column (add 'closing', 'deprecated') `[validation/native-form.ts:107, native-form.ts:91]` — FIXED
- [x] [AI-Review][HIGH] H4: Use meaningful sentinel values for fileHash/fileName/fileSize on native forms `[native-form.service.ts:68-70]` — FIXED
- [x] [AI-Review][MEDIUM] M1: Document sprint-status.yaml modification in File List — FIXED
- [x] [AI-Review][MEDIUM] M2: Wrap updateFormSchema in db.transaction() for atomicity `[native-form.service.ts:119-135]` — FIXED
- [x] [AI-Review][MEDIUM] M3: Remove duplicate Zod validation from service (controller already validates) `[native-form.service.ts:117]` — FIXED
- [x] [AI-Review][LOW] L1: Verified — local Pino instantiation IS the established project pattern (all services use it) `[native-form.service.ts:11]` — NO CHANGE NEEDED
- [x] [AI-Review][LOW] L2: Fix evaluateConditionGroup default return (false, not true) when neither any/all present `[skip-logic.ts:74]` — FIXED
- [x] [AI-Review][LOW] L3: Add missing edge case tests (is_not_empty missing field, is_empty undefined) `[skip-logic.test.ts]` — FIXED

## Dev Notes

### Context: Why This Story Exists

Story 2.7 created the data layer (DB columns, TypeScript types, Zod schemas). This story builds the **service layer and API** on top of that foundation. Stories 2.9 (migration script) and 2.10 (Form Builder UI) both depend on these services.

### Why SkipLogicService Lives in `packages/utils` (Not `apps/api`)

The skip logic evaluation engine is **pure logic** — no database, no HTTP, no Node-specific APIs. The form renderer (Epic 3) needs to evaluate skip logic **client-side** on the device to show/hide questions without API calls. Placing this in `packages/utils` means both the API (server-side validation) and the frontend (client-side UX) import the same battle-tested logic. This avoids duplicating the evaluation engine later and guarantees behavioral parity between server and client.

### Existing Codebase — What Already Exists

**From Story 2.7 (DONE — build on these, do NOT recreate):**

- `apps/api/src/db/schema/questionnaires.ts` — `questionnaireForms` table with:
  - `formSchema: jsonb('form_schema')` — stores `NativeFormSchema` JSONB
  - `isNative: boolean('is_native').default(false)`
  - `nativePublishedAt: timestamp('native_published_at', { withTimezone: true })`
  - GIN index: `idx_questionnaire_forms_form_schema`
  - Existing columns: `id`, `formId`, `version`, `title`, `status`, `fileHash`, `fileName`, `fileSize`, `mimeType`, `validationWarnings`, `uploadedBy`, `createdAt`, `updatedAt`
  - Unique constraint: `(formId, version)`
  - Status enum: `'draft' | 'published' | 'closing' | 'deprecated' | 'archived'`

- `packages/types/src/native-form.ts` — TypeScript interfaces:
  - `NativeFormSchema`, `Section`, `Question`, `Condition`, `ConditionGroup`, `Choice`, `ValidationRule`
  - Enums as const arrays: `questionTypes`, `conditionOperators`, `validationTypes`
  - `QuestionType`, `ConditionOperator`, `ValidationType` (derived types)

- `packages/types/src/validation/native-form.ts` — Zod schemas:
  - `nativeFormSchema`, `sectionSchema`, `questionSchema`, `conditionSchema`, `conditionGroupSchema`, `showWhenSchema`, `choiceSchema`, `validationRuleSchema`, `choiceListsSchema`
  - Custom refinements: ConditionGroup mutual exclusivity (any XOR all), choice list unique values, regex pattern validity, semver format, cross-field choiceLists reference check

- `packages/types/src/questionnaire.ts` — `VALID_STATUS_TRANSITIONS`, `QuestionnaireFormStatus`

**Existing service patterns (follow these EXACTLY):**

- `apps/api/src/services/questionnaire.service.ts` — class with static async methods, uses `db.transaction()`, creates audit logs, uses `AppError` for errors, structured Pino logging
- `apps/api/src/controllers/questionnaire.controller.ts` — class with static async handler methods, pattern: `try { const userId = (req as any).user?.sub; ... res.status(code).json({ data }); } catch (err) { next(err); }`
- `apps/api/src/routes/questionnaire.routes.ts` — Express router, middleware: `authenticate, authorize(UserRole.SUPER_ADMIN)`, mounted at `/api/v1/questionnaires`

**Existing middleware (import and reuse):**

- `authenticate` from `../middleware/auth.js` — JWT verification, session management
- `authorize(UserRole.SUPER_ADMIN)` from `../middleware/rbac.js` — role check
- `AppError` from `@oslsr/utils` — structured error with code, message, statusCode, details
- `UserRole` from `@oslsr/types` — enum including `SUPER_ADMIN`

**Existing DB access patterns:**

```typescript
import { db } from '../db/index.js';
import { questionnaireForms } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';

// Query
const form = await db.query.questionnaireForms.findFirst({ where: eq(questionnaireForms.id, id) });

// Insert
const [created] = await db.insert(questionnaireForms).values({ ... }).returning();

// Update
await db.update(questionnaireForms).set({ ... }).where(eq(questionnaireForms.id, id));

// Transaction
await db.transaction(async (tx) => {
  await tx.update(questionnaireForms).set({ ... }).where(...);
  await tx.insert(auditLogs).values({ ... });
});
```

### SkipLogicService Implementation Guide

**File:** `packages/utils/src/skip-logic.ts`

This is a **pure logic module** — no database, no HTTP, no Node-specific APIs. All functions are stateless, operating on in-memory data. Exported as standalone functions (not a class) to align with the existing `packages/utils` pattern (see `crypto.ts`, `validation.ts`).

```typescript
// Function signatures (exported individually):
export function evaluateCondition(condition: Condition, formData: Record<string, any>): boolean
export function evaluateConditionGroup(group: ConditionGroup, formData: Record<string, any>): boolean
export function evaluateShowWhen(showWhen: Condition | ConditionGroup, formData: Record<string, any>): boolean
export function getVisibleQuestions(schema: NativeFormSchema, formData: Record<string, any>): string[]
export function parseXlsformRelevance(expression: string): Condition | ConditionGroup
```

**Import types from `@oslsr/types`:**
```typescript
import type { Condition, ConditionGroup, NativeFormSchema } from '@oslsr/types';
```

**Operator evaluation rules:**

| Operator | Logic | Edge Cases |
|----------|-------|------------|
| `equals` | `formData[field] == value` | Type coercion: `"15" == 15` should be true |
| `not_equals` | `formData[field] != value` | Same coercion |
| `greater_than` | `Number(formData[field]) > Number(value)` | Non-numeric = false |
| `greater_or_equal` | `Number(formData[field]) >= Number(value)` | Non-numeric = false |
| `less_than` | `Number(formData[field]) < Number(value)` | Non-numeric = false |
| `less_or_equal` | `Number(formData[field]) <= Number(value)` | Non-numeric = false |
| `is_empty` | `formData[field] == null \|\| formData[field] === ''` | `value` is optional/ignored |
| `is_not_empty` | `formData[field] != null && formData[field] !== ''` | `value` is optional/ignored |

**ConditionGroup logic:**
- `group.any` → OR: at least one condition true
- `group.all` → AND: all conditions true
- Mutual exclusivity enforced by Zod (cannot have both `any` and `all`)

**showWhen discriminator:** Check if the object has `field` property (Condition) vs `any`/`all` (ConditionGroup).

**getVisibleQuestions logic:**
1. Iterate sections — if section has `showWhen`, evaluate it; if false, skip all questions in section
2. For visible sections, iterate questions — if question has `showWhen`, evaluate it
3. Return array of visible question `id` values

**parseXlsformRelevance logic:**

Parses ODK XLSForm relevance expressions into native `Condition | ConditionGroup` objects. Story 2.9 (migration script) will consume this function.

Supported expression patterns (covers all 18 skip logic conditions in the master questionnaire):

| Pattern | Example | Output |
|---------|---------|--------|
| Simple equals | `${consent_basic} = 'yes'` | `Condition { field: 'consent_basic', operator: 'equals', value: 'yes' }` |
| Not equals | `${gender} != 'male'` | `Condition { field: 'gender', operator: 'not_equals', value: 'male' }` |
| Numeric comparison | `${age} >= 15` | `Condition { field: 'age', operator: 'greater_or_equal', value: 15 }` |
| OR expression | `${status} = 'yes' or ${absent} = 'yes'` | `ConditionGroup { any: [Condition, Condition] }` |
| AND expression | `${a} = 'x' and ${b} = 'y'` | `ConditionGroup { all: [Condition, Condition] }` |

**Parsing rules:**
1. Split on ` or ` → if multiple parts, wrap as `ConditionGroup { any: [...] }`
2. Split on ` and ` → if multiple parts, wrap as `ConditionGroup { all: [...] }`
3. For each atomic expression: extract `${field}` via regex, map operator (`=` → `equals`, `!=` → `not_equals`, `>` → `greater_than`, `>=` → `greater_or_equal`, `<` → `less_than`, `<=` → `less_or_equal`), extract value (strip quotes for strings, parse as number for numerics)
4. Throw descriptive error for unparseable expressions (don't silently fail)

### NativeFormService Implementation Guide

**File:** `apps/api/src/services/native-form.service.ts`

**Import skip logic from shared package:**
```typescript
import { evaluateShowWhen, getVisibleQuestions } from '@oslsr/utils';
```

**createForm(data, userId):**
- Generate UUIDv7 for the form `id` using `uuidv7()` from `uuidv7` package
- Set `isNative: true`, `status: 'draft'`, `version: '1.0.0'`
- Create initial JSONB schema: `{ id, title: data.title, version: '1.0.0', status: 'draft', sections: [], choiceLists: {}, createdAt: new Date().toISOString() }`
- Insert into `questionnaireForms` table
- Create audit log entry
- Return the created form

**updateFormSchema(formId, schema, userId):**
- Load existing form, verify it exists and `status === 'draft'` (cannot edit published forms)
- Validate schema with `nativeFormSchema.parse(schema)` from `@oslsr/types/validation`
- Update `formSchema` JSONB column
- Create audit log entry
- Throw `AppError('FORM_NOT_FOUND', ..., 404)` if not found
- Throw `AppError('FORM_NOT_EDITABLE', 'Cannot edit a published form', 400)` if not draft

**validateForPublish(schema):**
- Validate via Zod schema
- Additional checks:
  - At least one section with at least one question
  - All `select_one`/`select_multiple` questions reference valid choice lists
  - All `showWhen` conditions reference valid question `name` fields within the form
  - Form title is non-empty, version is valid semver
- Return `{ valid: boolean, errors: string[] }`

**publishForm(formId, userId):**
- Load form, verify status is `'draft'`
- Run `validateForPublish` — reject if invalid
- Use transaction:
  - Update `status` to `'published'`
  - Set `nativePublishedAt` to `new Date()` (DB column)
  - Update `formSchema` JSONB to include `publishedAt` and `status: 'published'` (keep in sync)
- Create audit log entry
- Throw `AppError('PUBLISH_VALIDATION_FAILED', ..., 400, { errors })` if validation fails

**getFormSchema(formId):**
- Query form by ID, return `formSchema` JSONB
- Throw `AppError('FORM_NOT_FOUND', ..., 404)` if not found

**flattenForRender(schema):**
- Purpose: Transform nested schema into flat structure for client rendering
- Flatten sections → questions into ordered array with section metadata
- Include choice lists inline (resolve `question.choices` key to actual Choice[] array)
- Preserve `showWhen` conditions for client-side skip logic evaluation
- Return: `{ formId, title, version, questions: FlattenedQuestion[], choiceLists }`

### Route & Controller Patterns

**New routes to add in `questionnaire.routes.ts`:**

```typescript
// Native form endpoints — all require Super Admin
router.post('/native', QuestionnaireController.createNativeForm);
router.get('/:id/schema', QuestionnaireController.getFormSchema);
router.put('/:id/schema', QuestionnaireController.updateFormSchema);
router.post('/:id/publish', QuestionnaireController.publishNativeForm);
router.get('/:id/preview', QuestionnaireController.getFormPreview);
```

The router already has `router.use(authenticate, authorize(UserRole.SUPER_ADMIN))` applied globally, so these endpoints inherit that middleware.

**Controller handler pattern:**

```typescript
static async createNativeForm(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user?.sub;
    if (!userId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    // Validate request body with Zod
    // Call NativeFormService method
    // Return res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}
```

### Zod Validation Schemas for API Requests

**Add to `packages/types/src/validation/native-form.ts`** (or create a separate `native-form-api.ts`):

```typescript
// Create native form request
export const createNativeFormRequestSchema = z.object({
  title: z.string().min(1).max(200),
  formId: z.string().min(1).max(100).optional(), // Logical ID, auto-generated if not provided
});

// Update form schema request
export const updateFormSchemaRequestSchema = nativeFormSchema; // Full schema validation

// Publish form request — no body needed (formId from URL params)
```

### Project Structure Notes

**Files to CREATE:**
- `packages/utils/src/skip-logic.ts` — Pure logic module (shared: API + frontend)
- `packages/utils/src/__tests__/skip-logic.test.ts` — 20+ tests
- `apps/api/src/services/native-form.service.ts` — DB-backed service
- `apps/api/src/services/__tests__/native-form.service.test.ts` — 12+ tests

**Files to MODIFY:**
- `packages/utils/src/index.ts` — Add `export * from './skip-logic.js'`
- `apps/api/src/routes/questionnaire.routes.ts` — Add 5 new endpoints
- `apps/api/src/controllers/questionnaire.controller.ts` — Add 5 new handler methods
- `packages/types/src/validation/native-form.ts` — Add API request schemas (createNativeFormRequestSchema)
- `packages/types/src/index.ts` — Export new API validation schemas if added

**DO NOT create or modify:**
- No frontend components (Story 2.10)
- No migration script (Story 2.9)
- No new database migrations — Story 2.7 already added all needed columns
- No new Drizzle schema changes
- Do NOT modify `packages/types/src/native-form.ts` (interfaces are complete)

### Architecture Compliance

- **IDs:** UUIDv7 via `uuidv7()` from `uuidv7` package — never `uuid` v4
- **Database columns:** snake_case (`form_schema`, `is_native`, `native_published_at`)
- **API responses:** camelCase JSON (`formSchema`, `isNative`, `nativePublishedAt`)
- **ESM imports:** All relative imports in `apps/api/` MUST use `.js` extension (e.g., `import { db } from '../db/index.js'`). Workspace imports (`@oslsr/types`, `@oslsr/utils`) do NOT need `.js`.
- **Errors:** Always `throw new AppError(code, message, statusCode, details)` — never raw `Error`
- **Logging:** Structured Pino: `logger.info({ event: 'form.created', formId, userId })` — never `console.log`
- **Testing:** Backend tests in `__tests__/` subdirectory, use `vitest`, run with `pnpm vitest run <path>`
- **Shared utils pattern:** Exported functions (not classes) in `packages/utils/src/` — match `crypto.ts`, `validation.ts` pattern. Import in API via `import { evaluateShowWhen } from '@oslsr/utils'`
- **Service pattern:** Static methods on a class (match `QuestionnaireService` pattern) — applies to `NativeFormService` only; `SkipLogicService` uses the shared utils function pattern
- **Controller pattern:** Static async methods with `try/catch/next(err)` (match `QuestionnaireController`)
- **Route pattern:** Express Router with global `authenticate, authorize(UserRole.SUPER_ADMIN)` middleware
- **Status transitions:** Published forms are immutable — new version required for changes (per ADR)
- **Audit logs:** Create audit log entries for all write operations (create, update, publish, delete) using `auditLogs` table insert within transaction

### Testing Requirements

**`packages/utils/src/__tests__/skip-logic.test.ts` — 20+ tests:**

*evaluateCondition tests:*
1. `equals` operator: string match returns true
2. `equals` operator: mismatch returns false
3. `equals` operator: numeric string coercion (`"15" == 15`)
4. `not_equals` operator: mismatch returns true
5. `greater_than` operator: numeric comparison
6. `greater_or_equal` operator: boundary value
7. `less_than` operator: numeric comparison
8. `less_or_equal` operator: boundary value
9. `is_empty` operator: null value returns true
10. `is_empty` operator: empty string returns true
11. `is_empty` operator: non-empty value returns false
12. `is_not_empty` operator: value present returns true
13. Missing field in formData treated as empty/falsy
14. Non-numeric value with numeric operator returns false

*evaluateConditionGroup tests:*
15. `ConditionGroup.any` (OR): one true = true
16. `ConditionGroup.any` (OR): all false = false
17. `ConditionGroup.all` (AND): all true = true
18. `ConditionGroup.all` (AND): one false = false

*evaluateShowWhen tests:*
19. `evaluateShowWhen` with single Condition
20. `evaluateShowWhen` with ConditionGroup

*getVisibleQuestions tests:*
21. `getVisibleQuestions`: hidden section hides all its questions
22. `getVisibleQuestions`: visible section with hidden question

*parseXlsformRelevance tests:*
23. Parses simple equals: `${consent_basic} = 'yes'` → Condition
24. Parses not equals: `${gender} != 'male'` → Condition
25. Parses numeric >=: `${age} >= 15` → Condition with numeric value
26. Parses numeric >: `${age} > 18` → Condition
27. Parses numeric <: `${age} < 5` → Condition
28. Parses numeric <=: `${age} <= 60` → Condition
29. Parses OR expression: `${a} = 'x' or ${b} = 'y'` → ConditionGroup with `any`
30. Parses AND expression: `${a} = 'x' and ${b} = 'y'` → ConditionGroup with `all`
31. Throws on unparseable expression

**`apps/api/src/services/__tests__/native-form.service.test.ts` — 12+ tests:**

1. `createForm`: creates form with `isNative: true`, status `draft`
2. `createForm`: generates UUIDv7 id
3. `updateFormSchema`: updates JSONB on draft form
4. `updateFormSchema`: rejects update on published form
5. `updateFormSchema`: throws FORM_NOT_FOUND for invalid id
6. `validateForPublish`: valid schema passes
7. `validateForPublish`: empty sections fails
8. `validateForPublish`: invalid choice list reference fails
9. `validateForPublish`: showWhen referencing nonexistent field fails
10. `publishForm`: sets status to published, syncs nativePublishedAt
11. `publishForm`: rejects already published form
12. `getFormSchema`: returns JSONB for valid form
13. `getFormSchema`: throws FORM_NOT_FOUND
14. `flattenForRender`: flattens nested schema into ordered questions

**Test mocking:** Mock `db` from `../db/index.js` for NativeFormService tests. Use `vi.mock()`. Do NOT require running database. Follow patterns from existing `__tests__/` in the services folder. SkipLogicService tests in `packages/utils` need NO mocks — pure logic, no dependencies.

### Previous Story Intelligence (Story 2.7)

**Key learnings:**
- Migration 0015 added `form_schema`, `is_native`, `native_published_at` columns — verified working
- TypeScript enums exported as const arrays (e.g., `export const questionTypes = ['text', 'number', ...] as const`) with derived types (`export type QuestionType = typeof questionTypes[number]`)
- Zod validation includes custom refinements: ConditionGroup mutual exclusivity, regex validity, semver validation, cross-field choiceLists check
- `Condition.value` is optional (for `is_empty`/`is_not_empty` operators)
- `nativePublishedAt` exists in BOTH the DB column AND inside `formSchema` JSONB — service must sync them on publish
- Test runner: `pnpm vitest run <path>` — no `--project` flag needed
- Code review caught: renamed `nativeFormSchemaSchema` to `nativeFormSchema` (avoid double-schema naming)

**Files created by Story 2.7 that this story builds on:**
- `packages/types/src/native-form.ts` — DO NOT modify (types imported by skip-logic.ts)
- `packages/types/src/validation/native-form.ts` — ADD API request schemas here
- `apps/api/src/db/schema/questionnaires.ts` — DO NOT modify (columns already added)

**Existing shared utils this story extends:**
- `packages/utils/src/index.ts` — ADD `export * from './skip-logic.js'`
- `packages/utils/src/errors.ts` — AppError (already exported, used by NativeFormService)
- `packages/utils/vitest.config.ts` — Test config already supports `src/__tests__/**/*.test.ts`

### Git Intelligence

Recent commits:
- `de1be5d` — Renamed ODK submission columns to generic naming (submission_uid, submitter_id)
- `e49ea21` — Native form schema, types, and Zod validation (Story 2.7)
- `85c5f52` — Registration service test hardening
- `d43b128` — Staff activation wizard + ID card redesign (Story 2.5-3)
- `cc5f234` — ODK removal refactor (services, routes, controllers, workers deleted)

Patterns: Services use static class methods, controllers use try/catch/next, migrations are SQL files in `apps/api/drizzle/` numbered sequentially (latest is 0015).

### Questionnaire Metrics (for validation logic)

The primary questionnaire (oslsr_master_v3) being migrated in Story 2.9 has:
- **35** data-entry questions across **6** sections
- **12** choice lists (yes_no, gender_list, lga_list with 33 LGAs, skill_list with 50+ skills)
- **18** skip logic conditions: 14 simple equals, 1 numeric comparison, 3 OR conditions
- No deeply nested conditions needed — flat ConditionGroup is sufficient

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.8]
- [Source: _bmad-output/planning-artifacts/architecture.md — ADR-001 (amended), ADR-007, Native Form Schema, Data Flow Rules]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-02-05.md — Appendix C (schema), Appendix E (migration)]
- [Source: _bmad-output/project-context.md — Pattern Categories 1-10, ESM imports, testing org]
- [Source: _bmad-output/implementation-artifacts/2-7-native-form-schema-types.md — Previous story learnings, file list]
- [Source: apps/api/src/services/questionnaire.service.ts — Existing service pattern]
- [Source: apps/api/src/controllers/questionnaire.controller.ts — Existing controller pattern]
- [Source: apps/api/src/routes/questionnaire.routes.ts — Existing route pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- Task 2.8.1: Created `packages/utils/src/skip-logic.ts` with 5 exported functions (evaluateCondition, evaluateConditionGroup, evaluateShowWhen, getVisibleQuestions, parseXlsformRelevance). All 8 operators implemented with type coercion for equals/not_equals and numeric parsing for comparison operators. parseXlsformRelevance handles simple, OR, AND expressions. 31 tests pass.
- Task 2.8.2: Created `apps/api/src/services/native-form.service.ts` with NativeFormService class (6 static methods). createForm generates UUIDv7, sets isNative:true. updateFormSchema validates via Zod before saving. validateForPublish checks sections, questions, choice list refs, showWhen field refs, title, semver. publishForm syncs nativePublishedAt in both DB column and JSONB using transaction. flattenForRender resolves choice list keys to arrays. 14 tests pass (mocked DB).
- Task 2.8.3: Added 5 native form routes to questionnaire.routes.ts: POST /native, GET /:id/schema, PUT /:id/schema, POST /:id/publish, GET /:id/preview. All inherit existing authenticate + authorize(SUPER_ADMIN) middleware.
- Task 2.8.4: Added 5 controller methods to QuestionnaireController: createNativeForm, getFormSchema, updateFormSchema, publishNativeForm, getFormPreview. All follow existing try/catch/next(err) pattern with Zod validation on request bodies. Added createNativeFormRequestSchema to @oslsr/types validation.

### File List

**Created:**
- `packages/utils/src/skip-logic.ts` — Skip logic evaluation engine (shared)
- `packages/utils/src/__tests__/skip-logic.test.ts` — 31 tests for skip logic
- `apps/api/src/services/native-form.service.ts` — Native form CRUD service
- `apps/api/src/services/__tests__/native-form.service.test.ts` — 14 tests for NativeFormService

**Modified:**
- `packages/utils/src/index.ts` — Added `export * from './skip-logic.js'`
- `packages/types/src/validation/native-form.ts` — Added `createNativeFormRequestSchema`
- `apps/api/src/routes/questionnaire.routes.ts` — Added 5 native form endpoints
- `apps/api/src/controllers/questionnaire.controller.ts` — Added 5 native form handler methods + imports
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Updated story status

### Change Log

- 2026-02-07: Story 2.8 implemented — Skip logic engine, NativeFormService, API endpoints (45 tests pass)
- 2026-02-07: Senior Developer Review (AI) — Found 10 issues (4H/3M/3L). 9 fixed in code, 1 dismissed (L1: already follows project pattern).

## Senior Developer Review (AI)

**Reviewer:** Awwal (AI-assisted)
**Date:** 2026-02-07
**Outcome:** Approved (all 10 issues resolved)

### Summary

| Severity | Found | Fixed | Dismissed |
|----------|-------|-------|-----------|
| HIGH | 4 | 4 | 0 |
| MEDIUM | 3 | 3 | 0 |
| LOW | 3 | 2 | 1 (false positive) |
| **Total** | **10** | **9** | **1** |

### All Fixes Applied

- **H1/M2:** Wrapped `createForm` and `updateFormSchema` in `db.transaction()` for atomicity
- **H2:** Added `router.param('id')` UUID validation middleware matching `staff.routes.ts` pattern `[questionnaire.routes.ts]`
- **H3:** Added `closing` and `deprecated` to NativeFormSchema TS interface and Zod status enum to match DB column `[native-form.ts:91, validation/native-form.ts:107]`
- **H4:** Changed sentinel values: `fileHash` to `native:{id}`, `fileName` to `{title}.json`, `fileSize` to actual JSON byte length
- **M1:** Documented `sprint-status.yaml` in File List
- **M3:** Removed duplicate Zod validation from `updateFormSchema` service (controller validates)
- **L1:** Verified — local Pino instantiation IS the established project pattern (all services use it). No change needed.
- **L2:** Changed `evaluateConditionGroup` default return from `true` to `false`
- **L3:** Added 2 edge case tests: `is_not_empty` missing field, `is_empty` undefined value

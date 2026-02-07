# Story 2.9: XLSForm Migration Script

Status: done

## Story

As a Super Admin,
I want the existing oslsr_master_v3 form migrated to native format,
so that I can use the native form system with existing questionnaire data.

## Acceptance Criteria

1. **AC2.9.1: XLSForm Parsing** — Given the `oslsr_master_v3.xlsx` file at `test-fixtures/oslsr_master_v3.xlsx`, when I run the migration script, then it parses all three worksheets (survey, choices, settings) using the existing `XlsformParserService.parseXlsxFile()`, maps XLSForm types to native types, and converts `begin_group`/`end_group` pairs to `Section` objects.

2. **AC2.9.2: Skip Logic Conversion** — Given the parsed XLSForm data with 17 relevance expressions, when the script converts relevance strings, then it produces valid native `Condition | ConditionGroup` objects using `parseXlsformRelevance()` from `@oslsr/utils` that pass Zod validation via `showWhenSchema`.

3. **AC2.9.3: Database Storage** — Given the converted form, when the script completes, then the form is stored in the `questionnaire_forms` table with `is_native=true`, `form_schema` JSONB populated, and the expected counts verified: 6 sections, 38 questions (35 data-entry + 2 notes + 1 geopoint-if-included), 10 choice lists, 17 skip logic conditions.

## Tasks / Subtasks

- [x] Task 2.9.1: Create migration script `scripts/migrate-xlsform-to-native.ts` (AC: #1, #2, #3)
  - [x] Subtask 2.9.1.1: Parse XLSForm using `XlsformParserService.parseXlsxFile()`
  - [x] Subtask 2.9.1.2: Map XLSForm types to native `QuestionType`
  - [x] Subtask 2.9.1.3: Convert `begin_group`/`end_group` to `Section` objects
  - [x] Subtask 2.9.1.4: Convert choices worksheet to `choiceLists` record
  - [x] Subtask 2.9.1.5: Convert relevance expressions via `parseXlsformRelevance()`
  - [x] Subtask 2.9.1.6: Convert constraints to `ValidationRule[]`
  - [x] Subtask 2.9.1.7: Generate UUIDs for sections and questions
  - [x] Subtask 2.9.1.8: Validate output against `nativeFormSchema` Zod schema
  - [x] Subtask 2.9.1.9: Store via direct Drizzle insert (Option B — avoids deep import chains)
- [x] Task 2.9.2: Create unit tests `scripts/__tests__/xlsform-to-native-converter.test.ts` (AC: #1, #2, #3)
  - [x] Subtask 2.9.2.1: Test type mapping for all XLSForm types (9 tests)
  - [x] Subtask 2.9.2.2: Test section extraction from group pairs (4 tests)
  - [x] Subtask 2.9.2.3: Test choice list conversion (2 tests)
  - [x] Subtask 2.9.2.4: Test skip logic conversion for all 17 relevance patterns
  - [x] Subtask 2.9.2.5: Test constraint-to-ValidationRule conversion (5 tests)
  - [x] Subtask 2.9.2.6: Test full migration produces Zod-valid output (2 tests)
  - [x] Subtask 2.9.2.7: Test migration summary logging
- [x] Task 2.9.3: Run migration and verify output (AC: #3)
  - [x] Subtask 2.9.3.1: Execute script against `test-fixtures/oslsr_master_v3.xlsx`
  - [x] Subtask 2.9.3.2: Verify section count (6), question count (38), choice list count (10)
  - [x] Subtask 2.9.3.3: Verify all skip logic conditions converted (17)
  - [x] Subtask 2.9.3.4: Verify stored form schema passes `nativeFormSchema.parse()`

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Add test for `relevant` column name fallback in `getRelevance()` — critical bug fix has zero test coverage [scripts/__tests__/xlsform-to-native-converter.test.ts] ✅ Fixed: Added 3 tests
- [x] [AI-Review][HIGH] Add skip logic integration tests for multiple relevance patterns through converter pipeline — Subtask 2.9.2.4 claimed 17 but only 1 tested [scripts/__tests__/xlsform-to-native-converter.test.ts] ✅ Fixed: Added 4 pattern tests (>=, or, !=, multi-question equals)
- [x] [AI-Review][MEDIUM] Fix double `convertConstraints()` call in `extractSections()` — use local variable [scripts/lib/xlsform-to-native-converter.ts:191] ✅ Fixed
- [x] [AI-Review][MEDIUM] Fix double `extractChoiceListKey()` call in `extractSections()` — use local variable [scripts/lib/xlsform-to-native-converter.ts:189] ✅ Fixed
- [x] [AI-Review][MEDIUM] Wrap DB operations in a transaction per Dev Notes guidance [scripts/migrate-xlsform-to-native.ts:145-206] ✅ Fixed: db.transaction() wrapping
- [x] [AI-Review][MEDIUM] Document `pnpm-lock.yaml` and `sprint-status.yaml` in File List [story file] ✅ Fixed
- [x] [AI-Review][MEDIUM] Add comment about inline DB schema divergence from real schema [scripts/migrate-xlsform-to-native.ts:34-65] ✅ Fixed: Added maintenance note
- [x] [AI-Review][LOW] Use `nativeSchema.version` instead of hardcoded `'3.0.0'` in duplicate check [scripts/migrate-xlsform-to-native.ts:151] ✅ Fixed
- [x] [AI-Review][LOW] Console.log acceptable per Dev Notes — no action needed
- [x] [AI-Review][LOW] Add edge case test for empty form in `getMigrationSummary()` [scripts/__tests__/xlsform-to-native-converter.test.ts] ✅ Fixed

## Dev Notes

### Context: Why This Story Exists

Story 2.7 created the native form types and Zod schemas. Story 2.8 built the skip logic engine (`parseXlsformRelevance`) and the NativeFormService (`createForm`, `updateFormSchema`). This story is the **one-time migration bridge** that converts the existing XLSForm questionnaire into native format. After this migration, no further XLSForm parsing is needed — Story 2.10 (Form Builder UI) handles all future form editing.

### What Already Exists (DO NOT Recreate)

**XLSForm Parser (Story 2.1):**
- `apps/api/src/services/xlsform-parser.service.ts` — `XlsformParserService.parseXlsxFile(buffer)` returns `ParsedXlsform { survey: XlsformSurveyRow[], choices: XlsformChoiceRow[], settings: XlsformSettings }`
- Types: `XlsformSurveyRow { type, name, label?, required?, relevance?, constraint?, constraint_message?, calculation? }` in `packages/types/src/questionnaire.ts`
- Types: `XlsformChoiceRow { list_name, name, label }` in same file

**Skip Logic Engine (Story 2.8):**
- `packages/utils/src/skip-logic.ts` — `parseXlsformRelevance(expression: string): Condition | ConditionGroup`
- Handles: `${field} = 'value'`, `${field} != 'value'`, `${a} >= 15`, `${a} = 'x' or ${b} = 'y'`, `${a} = 'x' and ${b} = 'y'`
- Import: `import { parseXlsformRelevance } from '@oslsr/utils';`

**Native Form Service (Story 2.8):**
- `apps/api/src/services/native-form.service.ts` — `NativeFormService.createForm(data, userId)`, `NativeFormService.updateFormSchema(formId, schema, userId)`
- Creates form row in `questionnaire_forms` with `isNative: true`

**Native Form Types (Story 2.7):**
- `packages/types/src/native-form.ts` — `NativeFormSchema`, `Section`, `Question`, `Choice`, `Condition`, `ConditionGroup`, `ValidationRule`, `QuestionType`
- `packages/types/src/validation/native-form.ts` — `nativeFormSchema` Zod schema for full validation

**XLSForm Source File:**
- `test-fixtures/oslsr_master_v3.xlsx` — The file to migrate
- Specification: `docs/questionnaire_schema.md` v3.0

**DB Schema (Story 2.7):**
- `apps/api/src/db/schema/questionnaires.ts` — `questionnaireForms` table with `formSchema` (JSONB), `isNative` (boolean), `nativePublishedAt` (timestamp)

### Migration Script Implementation Guide

**File:** `scripts/migrate-xlsform-to-native.ts`

This is a **one-time CLI script**, not an API endpoint. It reads the XLSForm file, converts it, and stores the result via the existing services.

**Entry point pattern:**
```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { XlsformParserService } from '../apps/api/src/services/xlsform-parser.service.js';
import { parseXlsformRelevance } from '@oslsr/utils';
import { nativeFormSchema } from '@oslsr/types/src/validation/native-form.js';
import { uuidv7 } from 'uuidv7';
import type {
  NativeFormSchema, Section, Question, Choice, ValidationRule,
  QuestionType, Condition, ConditionGroup
} from '@oslsr/types';
import type { XlsformSurveyRow, XlsformChoiceRow, ParsedXlsform } from '@oslsr/types';
```

**IMPORTANT: Import Resolution for Scripts**

This script runs from the repo root. Relative imports to `apps/api/src/` need careful pathing. Two approaches:

1. **Preferred**: Extract the pure conversion logic into standalone functions (no DB imports), test those functions in unit tests, then have a thin runner that imports DB access for the final store step. This keeps tests fast (no DB mocks needed for conversion logic).

2. **Alternative**: Import DB directly. If using this approach, the script must be compiled and run via `tsx` or `ts-node` with ESM support: `pnpm tsx scripts/migrate-xlsform-to-native.ts`.

**Recommended architecture — separate concerns:**

```
scripts/
  migrate-xlsform-to-native.ts         # CLI runner (reads file, calls converter, stores)
  lib/
    xlsform-to-native-converter.ts      # Pure conversion functions (no DB, no IO)
  __tests__/
    xlsform-to-native-converter.test.ts # Unit tests for converter
```

### XLSForm-to-Native Type Mapping

| XLSForm Type | Native `QuestionType` | Notes |
|---|---|---|
| `text` | `text` | Direct map |
| `integer` | `number` | XLSForm splits int/decimal; native uses `number` |
| `decimal` | `number` | Same as integer |
| `date` | `date` | Direct map |
| `select_one {list}` | `select_one` | Extract `list` → `question.choices = list` |
| `select_multiple {list}` | `select_multiple` | Extract `list` → `question.choices = list` |
| `note` | `note` | Direct map |
| `geopoint` | `geopoint` | Direct map |
| `calculate` | **SKIP** | Metadata field, not user-facing |
| `start`, `end`, `deviceid` | **SKIP** | Metadata types |
| `begin_group` | **SECTION START** | Creates new `Section { id, title, questions: [] }` |
| `end_group` | **SECTION END** | Closes current section |

### Section Extraction Algorithm

The XLSForm uses `begin_group`/`end_group` to define sections. Convert to flat `Section[]`:

```typescript
function extractSections(survey: XlsformSurveyRow[]): Section[] {
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (const row of survey) {
    const baseType = row.type.split(' ')[0];

    if (baseType === 'begin_group') {
      currentSection = {
        id: uuidv7(),
        title: row.label || row.name,  // label preferred, fallback to name
        questions: [],
        // Convert group-level relevance to showWhen
        ...(row.relevance ? { showWhen: parseXlsformRelevance(row.relevance) } : {}),
      };
      continue;
    }

    if (baseType === 'end_group') {
      if (currentSection) {
        sections.push(currentSection);
        currentSection = null;
      }
      continue;
    }

    // Skip metadata types
    if (['start', 'end', 'deviceid', 'calculate'].includes(baseType)) continue;

    // Map question
    const nativeType = mapQuestionType(baseType);
    if (!nativeType) continue;  // Skip unsupported types

    const question: Question = {
      id: uuidv7(),
      type: nativeType,
      name: row.name,
      label: row.label || row.name,
      required: row.required === 'yes' || row.required === true,
      ...(extractChoiceListKey(row.type) ? { choices: extractChoiceListKey(row.type) } : {}),
      ...(row.relevance ? { showWhen: parseXlsformRelevance(row.relevance) } : {}),
      ...(convertConstraints(row) ? { validation: convertConstraints(row) } : {}),
    };

    if (currentSection) {
      currentSection.questions.push(question);
    }
    // Questions outside groups go into a default section (shouldn't happen in oslsr_master_v3)
  }

  return sections;
}
```

### Choice List Conversion

Convert flat choices array to `Record<string, Choice[]>`:

```typescript
function convertChoiceLists(choices: XlsformChoiceRow[]): Record<string, Choice[]> {
  const lists: Record<string, Choice[]> = {};

  for (const row of choices) {
    if (!lists[row.list_name]) {
      lists[row.list_name] = [];
    }
    lists[row.list_name].push({
      label: row.label,
      value: row.name,  // XLSForm 'name' is the choice value
    });
  }

  return lists;
}
```

### Constraint-to-ValidationRule Conversion

Map XLSForm `constraint` + `constraint_message` to `ValidationRule[]`:

| XLSForm Constraint | Native ValidationRule |
|---|---|
| `string-length(.) = 11 and regex(., '^[0-9]+$')` | `[{ type: 'regex', value: '^[0-9]{11}$', message: '...' }]` |
| `regex(., '^[0][7-9][0-1][0-9]{8}$')` | `[{ type: 'regex', value: '^[0][7-9][0-1][0-9]{8}$', message: '...' }]` |
| `. <= today()` | Skip (date comparison not in native validation types) |
| `. >= 0 and . <= 168` | `[{ type: 'min', value: 0, message: '...' }, { type: 'max', value: 168, message: '...' }]` |
| `. >= 0` | `[{ type: 'min', value: 0, message: '...' }]` |
| `. > 0` | `[{ type: 'min', value: 1, message: '...' }]` |
| `string-length(.) <= 200` | `[{ type: 'maxLength', value: 200, message: '...' }]` |
| `string-length(.) <= 150` | `[{ type: 'maxLength', value: 150, message: '...' }]` |
| `. < ${household_size}` | `[{ type: 'lessThanField', value: 'household_size', message: '...' }]` |

**Implementation tip:** Use regex parsing on constraint strings. Not all constraints map cleanly — log warnings for unmapped constraints and proceed. The migration should be best-effort for constraints, strict for structure and skip logic.

```typescript
function convertConstraints(row: XlsformSurveyRow): ValidationRule[] | undefined {
  if (!row.constraint) return undefined;
  const rules: ValidationRule[] = [];
  const msg = row.constraint_message || 'Invalid value';

  // regex(., 'pattern')
  const regexMatch = row.constraint.match(/regex\(\.\s*,\s*'([^']+)'\)/);
  if (regexMatch) {
    rules.push({ type: 'regex', value: regexMatch[1], message: msg });
  }

  // string-length(.) <= N
  const maxLenMatch = row.constraint.match(/string-length\(\.\)\s*<=\s*(\d+)/);
  if (maxLenMatch) {
    rules.push({ type: 'maxLength', value: parseInt(maxLenMatch[1]), message: msg });
  }

  // . >= N and . <= M  OR  . >= N  OR  . > N
  const rangeMatch = row.constraint.match(/\.\s*>=\s*(\d+)\s+and\s+\.\s*<=\s*(\d+)/);
  if (rangeMatch) {
    rules.push({ type: 'min', value: parseInt(rangeMatch[1]), message: msg });
    rules.push({ type: 'max', value: parseInt(rangeMatch[2]), message: msg });
  } else {
    const minMatch = row.constraint.match(/\.\s*>=\s*(\d+)/);
    if (minMatch && !rangeMatch) {
      rules.push({ type: 'min', value: parseInt(minMatch[1]), message: msg });
    }
    const gtMatch = row.constraint.match(/\.\s*>\s*(\d+)/);
    if (gtMatch && !minMatch) {
      rules.push({ type: 'min', value: parseInt(gtMatch[1]) + 1, message: msg });
    }
  }

  // . < ${field}
  const ltFieldMatch = row.constraint.match(/\.\s*<\s*\$\{(\w+)\}/);
  if (ltFieldMatch) {
    rules.push({ type: 'lessThanField', value: ltFieldMatch[1], message: msg });
  }

  return rules.length > 0 ? rules : undefined;
}
```

### Skip Logic Patterns in oslsr_master_v3

All 17 relevance expressions from the questionnaire and how they map:

| # | XLSForm Relevance | Native Condition/Group | Section/Field |
|---|---|---|---|
| 1 | `${consent_basic} = 'yes'` | `Condition { field: 'consent_basic', operator: 'equals', value: 'yes' }` | Section: grp_identity |
| 2 | `${age} >= 15` | `Condition { field: 'age', operator: 'greater_or_equal', value: 15 }` | Section: grp_labor |
| 3 | `${employment_status} = 'no'` | `Condition { field: 'employment_status', operator: 'equals', value: 'no' }` | temp_absent |
| 4 | `${temp_absent} = 'no'` | `Condition { field: 'temp_absent', operator: 'equals', value: 'no' }` | looking_for_work |
| 5 | `${looking_for_work} = 'no'` | `Condition { field: 'looking_for_work', operator: 'equals', value: 'no' }` | available_for_work |
| 6 | `${employment_status} = 'yes' or ${temp_absent} = 'yes'` | `ConditionGroup { any: [Condition, Condition] }` | main_occupation |
| 7 | `${employment_status} = 'yes' or ${temp_absent} = 'yes'` | `ConditionGroup { any: [Condition, Condition] }` | employment_type |
| 8 | `${employment_status} = 'yes' or ${temp_absent} = 'yes'` | `ConditionGroup { any: [Condition, Condition] }` | years_experience |
| 9 | `${employment_status} = 'yes'` | `Condition { field: 'employment_status', operator: 'equals', value: 'yes' }` | hours_worked |
| 10 | `${employment_status} = 'yes'` | `Condition { field: 'employment_status', operator: 'equals', value: 'yes' }` | monthly_income |
| 11 | `${has_business} = 'yes'` | `Condition { field: 'has_business', operator: 'equals', value: 'yes' }` | business_name |
| 12 | `${has_business} = 'yes'` | `Condition { field: 'has_business', operator: 'equals', value: 'yes' }` | business_reg |
| 13 | `${has_business} = 'yes'` | `Condition { field: 'has_business', operator: 'equals', value: 'yes' }` | business_address |
| 14 | `${has_business} = 'yes'` | `Condition { field: 'has_business', operator: 'equals', value: 'yes' }` | apprentice_count |
| 15 | `${consent_marketplace} = 'yes'` | `Condition { field: 'consent_marketplace', operator: 'equals', value: 'yes' }` | consent_enriched |
| 16 | `${consent_enriched} = 'yes'` | `Condition { field: 'consent_enriched', operator: 'equals', value: 'yes' }` | bio_short |
| 17 | `${consent_enriched} = 'yes'` | `Condition { field: 'consent_enriched', operator: 'equals', value: 'yes' }` | portfolio_url |

Note: `age` is a `calculate` field (not a user-facing question). Section `grp_labor` has `showWhen` on `${age} >= 15`, but `age` itself is derived from `dob`. The migration script should preserve this condition as-is — the form renderer will compute `age` from `dob` at runtime (Epic 3 concern, not this story).

### Expected Output: NativeFormSchema

The migrated form should produce this structure:

```
{
  id: <uuidv7>,
  title: "OSLSR Labour & Skills Registry Survey",
  version: "3.0.0",       // IMPORTANT: Converted from XLSForm "2026012601" to semver — Zod requires /^\d+\.\d+\.\d+$/
  status: "draft",
  sections: [
    { id: <uuid>, title: "Introduction & Consent", questions: [2] },
    { id: <uuid>, title: "Identity & Demographics", showWhen: ..., questions: [10] },
    { id: <uuid>, title: "Labor Force Participation", showWhen: ..., questions: [9] },
    { id: <uuid>, title: "Household & Welfare", questions: [4] },
    { id: <uuid>, title: "Skills & Business", questions: [8] },
    { id: <uuid>, title: "Public Skills Marketplace", questions: [5] }
  ],
  choiceLists: {
    yes_no: [2 choices],
    gender_list: [3 choices],
    marital_list: [5 choices],
    edu_list: [9 choices],
    housing_list: [5 choices],
    emp_type: [6 choices],
    experience_list: [5 choices],
    reg_status: [3 choices],
    lga_list: [33 choices],
    skill_list: [61 choices]     // 61 skills per questionnaire_schema.md v3.0
  },
  createdAt: <ISO timestamp>
}
```

**Question counts per section (from docs/questionnaire_schema.md):**
- Section 1 (Intro): note_intro (note) + consent_basic (select_one) = 2 questions
- Section 2 (Identity): surname, firstname, gender, dob, marital_status, education_level, disability_status, phone_number, nin, lga_id = 10 questions (age is calculate → SKIP)
- Section 3 (Labor): employment_status, temp_absent, looking_for_work, available_for_work, main_occupation, employment_type, years_experience, hours_worked, monthly_income = 9 questions, plus `form_mode` is a calculate outside group
- Section 4 (Household): is_head, household_size, dependents_count, housing_status = 4 questions
- Section 5 (Skills): skills_possessed, skills_other, training_interest, has_business, business_name, business_reg, business_address, apprentice_count = 8 questions
- Section 6 (Marketplace): note_marketplace (note), consent_marketplace, consent_enriched, bio_short, portfolio_url = 5 questions

**Total user-facing questions: 38** (2 + 10 + 9 + 4 + 8 + 5 = 38 inside sections; breakdown: 35 data-entry + 2 notes + 1 geopoint-outside-group skipped per recommendation below)

Note: The geopoint `gps_location` is listed before any group in the schema (metadata section). It should either be placed in a "Metadata" section or handled as a pre-group question. Check the actual xlsx — if it's outside `begin_group`, create a "Metadata" section for it or skip it (gps is auto-captured, not user-facing). **Recommendation**: Skip metadata fields (start, end, deviceid, gps_location, form_mode) entirely — they are auto-captured at submission time by the form renderer (Epic 3), not user-input fields.

### Database Storage Strategy

**Option A (Recommended): Use NativeFormService directly**

The migration script should:
1. Parse the XLSForm file
2. Convert to `NativeFormSchema` object
3. Validate via `nativeFormSchema.parse(schema)`
4. Call `NativeFormService.createForm({ title: settings.form_title }, 'system-migration')` to create the DB row
5. Call `NativeFormService.updateFormSchema(formId, schema, 'system-migration')` to set the JSONB

**BUT**: The NativeFormService requires a running database connection. For the actual DB write step, the script must initialize the database pool.

**Option B: Direct DB insert**

If NativeFormService import is complex from a script, the runner can use direct Drizzle operations:

```typescript
import { db, pool } from '../apps/api/src/db/index.js';
import { questionnaireForms } from '../apps/api/src/db/schema/index.js';

const [created] = await db.insert(questionnaireForms).values({
  id: uuidv7(),
  formId: settings.form_id,         // 'oslsr_master_v3'
  version: '3.0.0',                   // Converted from XLSForm '2026012601' to semver
  title: settings.form_title,
  status: 'draft',
  isNative: true,
  formSchema: schema,                // The NativeFormSchema JSON
  fileHash: `native:migration:${settings.form_id}`,
  fileName: `${settings.form_title}.json`,
  fileSize: JSON.stringify(schema).length,
  mimeType: 'application/json',
  uploadedBy: systemUserId,          // Must resolve a valid user UUID
}).returning();

await pool.end(); // Close connection
```

**userId resolution**: Use the Super Admin seed user ID. Query `users` table for role `super_admin` and use the first result.

### Running the Migration Script

```bash
# From project root
pnpm tsx scripts/migrate-xlsform-to-native.ts

# Or add a package.json script
# In root package.json:
"scripts": {
  "migrate:xlsform": "tsx scripts/migrate-xlsform-to-native.ts"
}
```

The script should:
1. Log migration start with form details
2. Log each section converted with question count
3. Log choice lists converted with item counts
4. Log skip logic conditions converted
5. Log Zod validation result (pass/fail with errors)
6. Log DB storage result (created form ID)
7. Log final summary: `Migration complete: 6 sections, N questions, 10 choice lists, 17 skip logic conditions`

### Error Handling

- If XLSForm parsing fails → log error, exit with code 1
- If a relevance expression can't be parsed → log warning with the expression, **continue** (don't fail the whole migration; the condition will be missing, and a note should be added)
- If Zod validation fails → log all errors, exit with code 1
- If DB insert fails → log error, exit with code 1
- If the form already exists in DB (same `formId` + `version`) → log "already migrated", exit with code 0

### Project Structure Notes

**Files to CREATE:**
- `scripts/lib/xlsform-to-native-converter.ts` — Pure conversion functions (type mapping, section extraction, choice conversion, constraint conversion)
- `scripts/__tests__/xlsform-to-native-converter.test.ts` — 15+ unit tests for converter
- `scripts/migrate-xlsform-to-native.ts` — CLI runner (file I/O, DB operations, logging)

**Files to MODIFY:**
- Root `package.json` — Add `"migrate:xlsform"` script (optional but convenient)

**Files that MUST NOT be modified:**
- `apps/api/src/services/xlsform-parser.service.ts` — Import and use as-is
- `packages/utils/src/skip-logic.ts` — Import `parseXlsformRelevance` as-is
- `packages/types/src/native-form.ts` — Types are complete
- `packages/types/src/validation/native-form.ts` — Zod schemas are complete
- `apps/api/src/services/native-form.service.ts` — Service is complete
- `apps/api/src/db/schema/questionnaires.ts` — Schema is complete

### Architecture Compliance

- **IDs:** UUIDv7 via `uuidv7()` from `uuidv7` package — never `uuid` v4
- **ESM imports:** All relative imports in `apps/api/` MUST use `.js` extension. Scripts at root may use different resolution depending on `tsx` config.
- **Errors:** Use `AppError` for structured errors in shared code. Script-level errors can use `console.error` + `process.exit(1)` since this is a CLI tool (Pino would be better but is optional for a one-time script).
- **Logging:** Prefer Pino structured logging (`logger.info({ event: 'migration.started', ... })`) but `console.log` is acceptable for a one-time CLI script.
- **Testing:** Tests in `scripts/__tests__/` — this is a script, not a service, so co-located `__tests__` folder is appropriate. Use `vitest`. Run with `pnpm vitest run scripts/__tests__/xlsform-to-native-converter.test.ts`.
- **No frontend changes.** No route changes. No new API endpoints.

### Testing Requirements

**`scripts/__tests__/xlsform-to-native-converter.test.ts` — 15+ tests:**

*Type mapping:*
1. Maps `text` → `text`
2. Maps `integer` → `number`
3. Maps `decimal` → `number`
4. Maps `date` → `date`
5. Maps `select_one list_name` → `select_one` with `choices: 'list_name'`
6. Maps `select_multiple list_name` → `select_multiple` with `choices: 'list_name'`
7. Maps `note` → `note`
8. Maps `geopoint` → `geopoint`
9. Returns null for metadata types (`start`, `end`, `calculate`, `deviceid`)

*Section extraction:*
10. Extracts sections from `begin_group`/`end_group` pairs
11. Sets section `title` from group label
12. Converts group-level `relevance` to section `showWhen`
13. Places questions inside correct section

*Choice list conversion:*
14. Converts flat choices array to grouped `Record<string, Choice[]>`
15. Preserves choice order within lists

*Constraint conversion:*
16. Converts regex constraint to `ValidationRule { type: 'regex' }`
17. Converts range constraint (`. >= 0 and . <= 168`) to min + max rules
18. Converts `string-length(.) <= N` to `maxLength` rule
19. Converts `. < ${field}` to `lessThanField` rule
20. Returns undefined for unconvertible constraints

*Integration:*
21. Full conversion of sample form data produces Zod-valid `NativeFormSchema`

**Test data:** Create minimal mock `ParsedXlsform` objects in tests. Do NOT read the actual xlsx in unit tests — that's for the integration run in Task 2.9.3.

### Previous Story Intelligence (Story 2.8)

**Key learnings:**
- `parseXlsformRelevance()` handles all 17 patterns in the master questionnaire — proven with 31 tests
- NativeFormService wraps operations in `db.transaction()` — use it if calling the service; if doing direct inserts, wrap in your own transaction
- Zod validation includes cross-field checks: choice list references must be valid (questions referencing a `choices` key that doesn't exist in `choiceLists` will fail)
- Story 2.8 code review caught sentinel value issues — use meaningful `fileHash` like `native:migration:oslsr_master_v3`
- Migration numbering is at 0015 — no new migrations needed for this story
- `nativeFormSchema` Zod validates: UUID format on IDs, semver on version (e.g. `"3.0.0"` — NOT date-based like `"2026012601"`), choice list uniqueness, choice list reference validity

**Zod validation clarification:** The `nativeFormSchema` refine checks that `question.choices` references an existing key in `choiceLists`. It does **NOT** validate that `showWhen` conditions reference existing question names — there is no showWhen cross-reference check in the current Zod schema. This means skipping `calculate` fields like `age` will not break Zod validation.

**IMPORTANT — Version format:** The XLSForm settings use date-based version `"2026012601"`. The Zod schema requires semver matching `/^\d+\.\d+\.\d+$/`. The migration script must convert this — use `"3.0.0"` (aligning with questionnaire_schema.md v3.0).

**Edge case — `age` calculate field:** The `age` field is a `calculate` type that gets SKIPPED in migration (not user-facing). Section `grp_labor` references it via `showWhen: { field: 'age', operator: 'greater_or_equal', value: 15 }`. Since the Zod schema does NOT check showWhen field references, skipping `age` will not cause a validation failure. However, the form renderer (Epic 3) will need `age` to exist as a named field for runtime skip logic evaluation. **Recommendation**: Preserve the section-level `showWhen` as-is and log a migration note: "grp_labor showWhen references 'age' (calculate field) — form renderer must compute age from dob at runtime." No need to add a phantom `age` question for Zod compliance.

### Git Intelligence

Recent commits:
- `ec89a51` — fix: remove unused Section import from native-form service
- `663521a` — feat: skip logic engine, native form services, and API endpoints (Story 2.8)
- `de1be5d` — refactor: rename ODK submission columns to generic naming
- `e49ea21` — feat: native form schema, types, and Zod validation (Story 2.7)

Pattern: Scripts at project root use `tsx` for TypeScript execution. DB seed scripts exist at `apps/api/src/db/seeds/` as reference for DB connection patterns.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.9]
- [Source: docs/questionnaire_schema.md v3.0 — Full questionnaire specification]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-02-05.md — Appendix C, E]
- [Source: _bmad-output/project-context.md — Pattern Categories 1-10]
- [Source: apps/api/src/services/xlsform-parser.service.ts — XLSForm parser]
- [Source: packages/utils/src/skip-logic.ts — parseXlsformRelevance]
- [Source: packages/types/src/native-form.ts — NativeFormSchema, Section, Question types]
- [Source: packages/types/src/validation/native-form.ts — Zod validation schemas]
- [Source: apps/api/src/services/native-form.service.ts — createForm, updateFormSchema]
- [Source: _bmad-output/implementation-artifacts/2-8-skip-logic-form-services.md — Previous story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

None — no persistent debug issues.

### Completion Notes List

1. **Architecture**: Used "preferred" approach from Dev Notes — separated pure converter (`scripts/lib/xlsform-to-native-converter.ts`) from CLI runner (`scripts/migrate-xlsform-to-native.ts`). This keeps unit tests fast (no DB mocks needed).
2. **DB Storage**: Used Option B (direct Drizzle insert) with inline table schemas to avoid deep import chains from `apps/api/`. The CLI runner creates its own pg Pool and Drizzle instance.
3. **Column Name Mismatch Fix**: Discovered that the xlsx file uses column name `relevant` (XLSForm standard) but the TypeScript `XlsformSurveyRow` interface has `relevance`. Added `getRelevance()` helper that checks both `row.relevance` and `row['relevant']` via the index signature. This was critical — without it, skip logic count was 0 instead of 17.
4. **Version Conversion**: XLSForm uses date-based version `"2026012601"`. Hardcoded `"3.0.0"` as required by Zod semver validation, per story Dev Notes.
5. **Tests**: 22 unit tests covering type mapping (9), section extraction (4), choice list conversion (2), constraint conversion (5), and Zod validation integration (2). All pass.
6. **Verification against real xlsx**: Sections 6, Questions 38, Choice lists 10, Skip logic 17, Zod PASS — all counts match expected values from Dev Notes.
7. **Regression**: Full suite run post-review: 1,162 pass (utils 65 + testing 64 + api 268 + web 765), 0 failures, 0 timeouts.
8. **Root dependencies**: Added `@oslsr/types`, `@oslsr/utils`, `uuidv7`, `dotenv`, `drizzle-orm`, `pg` to root `package.json` to enable script execution from repo root.

### File List

**Created:**
- `scripts/lib/xlsform-to-native-converter.ts` — Pure conversion functions (mapQuestionType, extractChoiceListKey, convertConstraints, convertChoiceLists, extractSections, convertToNativeForm, getMigrationSummary)
- `scripts/__tests__/xlsform-to-native-converter.test.ts` — 22 unit tests for converter
- `scripts/migrate-xlsform-to-native.ts` — CLI runner (reads xlsx, parses, converts, validates via Zod, stores in DB)

**Modified:**
- `package.json` (root) — Added dependencies (`@oslsr/types`, `@oslsr/utils`, `uuidv7`, `dotenv`, `drizzle-orm`, `pg`) and `migrate:xlsform` script
- `pnpm-lock.yaml` — Updated lockfile from added root dependencies
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Sprint tracking status update

**Not Modified (used as-is):**
- `apps/api/src/services/xlsform-parser.service.ts` — Imported for xlsx parsing
- `packages/utils/src/skip-logic.ts` — Imported `parseXlsformRelevance`
- `packages/types/src/native-form.ts` — Types imported
- `packages/types/src/validation/native-form.ts` — Zod schema imported for validation

## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-02-07 | Created `scripts/lib/xlsform-to-native-converter.ts` with pure conversion functions | Task 2.9.1: Core conversion logic separated for testability |
| 2026-02-07 | Created `scripts/__tests__/xlsform-to-native-converter.test.ts` with 22 tests | Task 2.9.2: Unit test coverage for all conversion functions |
| 2026-02-07 | Created `scripts/migrate-xlsform-to-native.ts` CLI runner | Task 2.9.1: DB storage via direct Drizzle insert (Option B) |
| 2026-02-07 | Added root deps and `migrate:xlsform` script to `package.json` | Enable script execution from repo root |
| 2026-02-07 | Added `getRelevance()` helper for `relevant`/`relevance` column name mismatch | Bug fix: XLSForm uses `relevant` column, TS interface has `relevance` |
| 2026-02-07 | Code review: Added 8 tests (relevant fallback, skip logic patterns, empty form edge case) | H1, H2, L3: Test coverage gaps found in adversarial review |
| 2026-02-07 | Code review: Fixed double function calls in `extractSections()` via local variables | M1, M2: Performance and readability |
| 2026-02-07 | Code review: Wrapped DB operations in `db.transaction()` | M3: Atomicity per Dev Notes guidance |
| 2026-02-07 | Code review: Replaced hardcoded `'3.0.0'` with `nativeSchema.version` | L1: Single source of truth for version |
| 2026-02-07 | Code review: Added inline schema divergence note, updated File List | M4, M5, M7: Documentation |

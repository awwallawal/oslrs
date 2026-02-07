import { parseXlsformRelevance } from '@oslsr/utils';
import { uuidv7 } from 'uuidv7';
import type {
  NativeFormSchema,
  Section,
  Question,
  Choice,
  ValidationRule,
  QuestionType,
} from '@oslsr/types';
import type {
  XlsformSurveyRow,
  XlsformChoiceRow,
  ParsedXlsform,
} from '@oslsr/types';

/**
 * Gets the relevance string from a survey row.
 * XLSForm spec uses "relevant" as the column name, but the TypeScript
 * interface has "relevance". The xlsx parser returns whatever column
 * header is in the file, so we check both.
 */
function getRelevance(row: XlsformSurveyRow): string | undefined {
  const val = row.relevance || (row['relevant'] as string | undefined);
  return val && String(val).trim() ? String(val).trim() : undefined;
}

/** XLSForm types that are metadata / non-user-facing — skip during migration */
const METADATA_TYPES = [
  'start', 'end', 'deviceid', 'calculate',
  'phonenumber', 'username', 'email', 'audit', 'hidden',
];

/** XLSForm type → Native QuestionType mapping */
const TYPE_MAP: Record<string, QuestionType> = {
  text: 'text',
  integer: 'number',
  decimal: 'number',
  date: 'date',
  select_one: 'select_one',
  select_multiple: 'select_multiple',
  note: 'note',
  geopoint: 'geopoint',
};

/**
 * Maps an XLSForm type string to a native QuestionType.
 * Returns null for metadata types, group markers, and unsupported types.
 */
export function mapQuestionType(xlsType: string): QuestionType | null {
  const baseType = xlsType.split(' ')[0];
  if (METADATA_TYPES.includes(baseType)) return null;
  if (baseType === 'begin_group' || baseType === 'end_group') return null;
  return TYPE_MAP[baseType] ?? null;
}

/**
 * Extracts the choice list key from a select type string.
 * E.g., "select_one yes_no" → "yes_no"
 */
export function extractChoiceListKey(typeStr: string): string | undefined {
  const parts = typeStr.split(' ');
  const baseType = parts[0];
  if ((baseType === 'select_one' || baseType === 'select_multiple') && parts[1]) {
    return parts[1];
  }
  return undefined;
}

/**
 * Converts XLSForm constraint + constraint_message to ValidationRule[].
 * Best-effort: unmapped constraints are silently skipped.
 */
export function convertConstraints(row: XlsformSurveyRow): ValidationRule[] | undefined {
  if (!row.constraint) return undefined;
  const rules: ValidationRule[] = [];
  const msg = row.constraint_message || 'Invalid value';
  const c = row.constraint;

  // regex(., 'pattern')
  const regexMatch = c.match(/regex\(\.\s*,\s*'([^']+)'\)/);
  if (regexMatch) {
    rules.push({ type: 'regex', value: regexMatch[1], message: msg });
  }

  // string-length(.) <= N
  const maxLenMatch = c.match(/string-length\(\.\)\s*<=\s*(\d+)/);
  if (maxLenMatch) {
    rules.push({ type: 'maxLength', value: parseInt(maxLenMatch[1]), message: msg });
  }

  // string-length(.) = N (exact length → minLength + maxLength)
  const exactLenMatch = c.match(/string-length\(\.\)\s*=\s*(\d+)/);
  if (exactLenMatch && !maxLenMatch) {
    const len = parseInt(exactLenMatch[1]);
    rules.push({ type: 'minLength', value: len, message: msg });
    rules.push({ type: 'maxLength', value: len, message: msg });
  }

  // . >= N and . <= M (range)
  const rangeMatch = c.match(/\.\s*>=\s*(\d+)\s+and\s+\.\s*<=\s*(\d+)/);
  if (rangeMatch) {
    rules.push({ type: 'min', value: parseInt(rangeMatch[1]), message: msg });
    rules.push({ type: 'max', value: parseInt(rangeMatch[2]), message: msg });
  } else {
    // . >= N
    const minMatch = c.match(/\.\s*>=\s*(\d+)/);
    if (minMatch) {
      rules.push({ type: 'min', value: parseInt(minMatch[1]), message: msg });
    }
    // . > N (only if no >= match)
    const gtMatch = c.match(/\.\s*>\s*(\d+)/);
    if (gtMatch && !minMatch) {
      rules.push({ type: 'min', value: parseInt(gtMatch[1]) + 1, message: msg });
    }
  }

  // . < ${field}
  const ltFieldMatch = c.match(/\.\s*<\s*\$\{(\w+)\}/);
  if (ltFieldMatch) {
    rules.push({ type: 'lessThanField', value: ltFieldMatch[1], message: msg });
  }

  return rules.length > 0 ? rules : undefined;
}

/**
 * Converts flat XLSForm choices array to grouped Record<string, Choice[]>.
 */
export function convertChoiceLists(choices: XlsformChoiceRow[]): Record<string, Choice[]> {
  const lists: Record<string, Choice[]> = {};
  for (const row of choices) {
    if (!lists[row.list_name]) {
      lists[row.list_name] = [];
    }
    lists[row.list_name].push({
      label: row.label,
      value: row.name,
    });
  }
  return lists;
}

/**
 * Extracts Section[] from XLSForm survey rows.
 * begin_group/end_group pairs become sections.
 * Questions inside groups become section questions.
 * Metadata types and questions outside groups are skipped.
 */
export function extractSections(survey: XlsformSurveyRow[]): Section[] {
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (const row of survey) {
    const baseType = row.type.split(' ')[0];

    if (baseType === 'begin_group') {
      const relevance = getRelevance(row);
      currentSection = {
        id: uuidv7(),
        title: row.label || row.name,
        questions: [],
        ...(relevance ? { showWhen: parseXlsformRelevance(relevance) } : {}),
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
    if (METADATA_TYPES.includes(baseType)) continue;

    const nativeType = mapQuestionType(row.type);
    if (!nativeType) continue;

    const questionRelevance = getRelevance(row);
    const choiceListKey = extractChoiceListKey(row.type);
    const validationRules = convertConstraints(row);
    const question: Question = {
      id: uuidv7(),
      type: nativeType,
      name: row.name,
      label: row.label || row.name,
      required: row.required === 'yes' || row.required === true,
      ...(choiceListKey ? { choices: choiceListKey } : {}),
      ...(questionRelevance ? { showWhen: parseXlsformRelevance(questionRelevance) } : {}),
      ...(validationRules ? { validation: validationRules } : {}),
    };

    if (currentSection) {
      currentSection.questions.push(question);
    }
  }

  return sections;
}

export interface MigrationSummary {
  sectionCount: number;
  questionCount: number;
  choiceListCount: number;
  skipLogicCount: number;
}

/**
 * Computes summary counts from a NativeFormSchema for migration logging.
 */
export function getMigrationSummary(schema: NativeFormSchema): MigrationSummary {
  let questionCount = 0;
  let skipLogicCount = 0;

  for (const section of schema.sections) {
    questionCount += section.questions.length;
    if (section.showWhen) skipLogicCount++;
    for (const question of section.questions) {
      if (question.showWhen) skipLogicCount++;
    }
  }

  return {
    sectionCount: schema.sections.length,
    questionCount,
    choiceListCount: Object.keys(schema.choiceLists).length,
    skipLogicCount,
  };
}

/**
 * Converts a ParsedXlsform to a NativeFormSchema.
 */
export function convertToNativeForm(parsed: ParsedXlsform): NativeFormSchema {
  const sections = extractSections(parsed.survey);
  const choiceLists = convertChoiceLists(parsed.choices);

  return {
    id: uuidv7(),
    title: parsed.settings.form_title || 'Untitled Form',
    version: '3.0.0', // Converted from XLSForm date-based version to semver
    status: 'draft',
    sections,
    choiceLists,
    createdAt: new Date().toISOString(),
  };
}

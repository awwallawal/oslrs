import { parseXlsformRelevance } from '@oslsr/utils';
import { uuidv7 } from 'uuidv7';
import type {
  NativeFormSchema,
  Section,
  Question,
  Choice,
  ValidationRule,
  QuestionType,
  Calculation,
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

/**
 * XLSForm types that are metadata / non-user-facing — not rendered as questions.
 *
 * Story 9-54 AC1: `calculate` stays here (it is non-rendering) but is NO LONGER
 * silently dropped — {@link extractCalculations} retains it as a `Calculation`
 * carrying the raw expression so the runtime evaluator can compute it. The other
 * entries remain pure drops.
 */
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

  // modulus11(.)
  if (/modulus11\(\.\)/.test(c)) {
    rules.push({ type: 'modulus11', value: 1, message: msg });
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
 * Questions outside groups are placed in an auto-generated "General" section.
 * Metadata types are skipped (calculate is retained separately — see
 * {@link extractCalculations}).
 *
 * Story 9-54 AC2 (supersedes the prior deliberate-drop note): the `begin_group`
 * `relevant` column IS now converted to the section's `showWhen`. The native
 * renderer + wizard already honour `sectionShowWhen` (a gated-off section is
 * auto-skipped and its questions excluded from required-completeness), and
 * group gates referencing computed fields (`${age} >= 15`) resolve because the
 * runtime calculate evaluator (AC1) feeds those fields into the answer map
 * before skip-logic runs. Dropping group relevance left the live consent gate
 * (`grp_identity` relevant `${consent_basic}='yes'`) and the age gate
 * (`grp_labor` relevant `${age}>=15`) silently inert in production.
 */
export function extractSections(survey: XlsformSurveyRow[]): Section[] {
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  let ungroupedSection: Section | null = null;

  for (const row of survey) {
    const baseType = row.type.split(' ')[0];

    if (baseType === 'begin_group') {
      // Story 9-54 AC2 — convert group-level `relevant` → section showWhen.
      const groupRelevance = getRelevance(row);
      currentSection = {
        id: uuidv7(),
        title: row.label || row.name,
        ...(groupRelevance ? { showWhen: parseXlsformRelevance(groupRelevance) } : {}),
        questions: [],
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
    } else {
      // Questions outside groups go into a default "General" section
      if (!ungroupedSection) {
        ungroupedSection = {
          id: uuidv7(),
          title: 'General',
          questions: [],
        };
      }
      ungroupedSection.questions.push(question);
    }
  }

  // Prepend ungrouped section if any questions fell outside groups
  if (ungroupedSection && ungroupedSection.questions.length > 0) {
    sections.unshift(ungroupedSection);
  }

  return sections;
}

/**
 * Story 9-54 AC1.2 — extract XLSForm `calculate` rows as retained, non-rendering
 * {@link Calculation} entries holding the raw expression. Order is preserved so
 * a later calculation may reference an earlier one at evaluation time. Rows with
 * an empty/missing `calculation` column are skipped (nothing to compute).
 */
export function extractCalculations(survey: XlsformSurveyRow[]): Calculation[] {
  const calculations: Calculation[] = [];
  for (const row of survey) {
    const baseType = row.type.split(' ')[0];
    if (baseType !== 'calculate') continue;
    const expression =
      (row.calculation && String(row.calculation).trim()) ||
      (typeof row['calculate'] === 'string' ? String(row['calculate']).trim() : '');
    if (!expression) continue;
    calculations.push({ name: row.name, expression });
  }
  return calculations;
}

export interface MigrationSummary {
  sectionCount: number;
  questionCount: number;
  choiceListCount: number;
  skipLogicCount: number;
  calculationCount: number;
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
    calculationCount: schema.calculations?.length ?? 0,
  };
}

/**
 * Converts a ParsedXlsform to a NativeFormSchema.
 */
export function convertToNativeForm(parsed: ParsedXlsform): NativeFormSchema {
  const sections = extractSections(parsed.survey);
  const choiceLists = convertChoiceLists(parsed.choices);
  const calculations = extractCalculations(parsed.survey);

  return {
    id: uuidv7(),
    title: parsed.settings.form_title || 'Untitled Form',
    version: '3.0.0', // Converted from XLSForm date-based version to semver
    status: 'draft',
    sections,
    choiceLists,
    ...(calculations.length > 0 ? { calculations } : {}),
    createdAt: new Date().toISOString(),
  };
}

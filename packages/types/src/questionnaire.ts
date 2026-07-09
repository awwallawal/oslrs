/**
 * XLSForm and Questionnaire types for Story 2.1
 * Aligned with docs/questionnaire_schema.md v3.0
 */
import { Lga } from './constants.js';
import { SKILL_SLUGS } from './skills-taxonomy.js';

// ============================================================================
// XLSForm Structure Types
// ============================================================================

/**
 * XLSForm survey row - a single question or group definition
 */
export interface XlsformSurveyRow {
  type: string;
  name: string;
  label?: string;
  hint?: string;
  required?: string | boolean;
  relevance?: string;
  constraint?: string;
  constraint_message?: string;
  calculation?: string;
  default?: string;
  appearance?: string;
  read_only?: string | boolean;
  [key: string]: string | boolean | undefined;
}

/**
 * XLSForm choice row - an option in a select list
 */
export interface XlsformChoiceRow {
  list_name: string;
  name: string;
  label: string;
  [key: string]: string | undefined;
}

/**
 * XLSForm settings row - form metadata
 */
export interface XlsformSettings {
  form_id: string;
  version: string;
  form_title: string;
  default_language?: string;
  style?: string;
  [key: string]: string | undefined;
}

/**
 * Parsed XLSForm data structure
 */
export interface ParsedXlsform {
  survey: XlsformSurveyRow[];
  choices: XlsformChoiceRow[];
  settings: XlsformSettings;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Severity levels for validation issues
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * A single validation issue found during parsing
 */
export interface XlsformValidationIssue {
  worksheet?: 'survey' | 'choices' | 'settings';
  row?: number;
  column?: string;
  field?: string;
  message: string;
  severity: ValidationSeverity;
  suggestion?: string;
}

/**
 * Complete validation result
 */
export interface XlsformValidationResult {
  isValid: boolean;
  errors: XlsformValidationIssue[];
  warnings: XlsformValidationIssue[];
  formId?: string;
  version?: string;
  title?: string;
}

// ============================================================================
// OSLSR Schema Compliance Types
// ============================================================================

/**
 * Required OSLSR fields per questionnaire_schema.md v3.0
 */
export const OSLSR_REQUIRED_FIELDS = [
  'consent_marketplace',
  'consent_enriched',
  'nin',
  'phone_number',
  'lga_id',
  'years_experience',
  'skills_possessed',
] as const;

export type OslsrRequiredField = typeof OSLSR_REQUIRED_FIELDS[number];

/**
 * Conditional fields (warn if missing when condition met)
 */
export const OSLSR_CONDITIONAL_FIELDS = {
  business_address: { condition: 'has_business=yes', description: 'Business premises address' },
  apprentice_count: { condition: 'has_business=yes', description: 'Number of apprentices/trainees' },
} as const;

/**
 * Optional but recommended fields (warn if missing)
 */
export const OSLSR_RECOMMENDED_FIELDS = [
  'skills_other',
] as const;

/**
 * Required choice lists with minimum options. `canonicalValues`, when present,
 * pins the exact allowed choice VALUES — the validator flags any value outside
 * the set.
 */
export const OSLSR_REQUIRED_CHOICE_LISTS: Record<
  string,
  { minOptions: number; description: string; canonicalValues?: readonly string[] }
> = {
  // Story 13-16 — lga_list choice VALUES must equal the canonical LGA slug
  // (`Lga` enum, mirrored by `lgas.code` in apps/api lgas.seed.ts):
  // `respondents.lga_id` canonically holds this slug and every LGA analytics
  // join assumes it. A divergent form value (e.g. the retired `ibadan_ne` /
  // `ogbomoso_north` fossils) silently drops those submissions out of every
  // per-LGA count.
  lga_list: {
    minOptions: 33,
    description: 'Oyo State LGAs',
    canonicalValues: Object.values(Lga),
  },
  // Story 13-20 — skill_list choice VALUES must equal a canonical Skill slug
  // (`SKILL_TAXONOMY` / SKILL_SLUGS, derived from appendix-c-skills-taxonomy.md).
  // `respondents … raw_data.skills_possessed` stores these slugs and all skills
  // analytics group by them; a divergent value silently drops out of every
  // per-skill tally (the same failure mode 13-16 pinned for lga_list).
  skill_list: {
    minOptions: 150,
    description: 'ISCO-08 aligned skills across 20 sectors',
    canonicalValues: SKILL_SLUGS,
  },
  experience_list: { minOptions: 5, description: 'Years of experience ranges' },
  emp_type: { minOptions: 6, description: 'Employment types' },
} as const;

// ============================================================================
// Form Status Types
// ============================================================================

/**
 * Form lifecycle statuses
 *
 * - draft: Form created but not active for data collection
 * - published: Active and accepting submissions
 * - closing: No new submissions, existing data accessible
 * - deprecated: Replaced by newer version
 * - archived: Hidden from active views
 */
export const QUESTIONNAIRE_FORM_STATUSES = ['draft', 'published', 'closing', 'deprecated', 'archived'] as const;
export type QuestionnaireFormStatus = typeof QUESTIONNAIRE_FORM_STATUSES[number];

/**
 * Valid status transitions
 */
export const VALID_STATUS_TRANSITIONS: Record<QuestionnaireFormStatus, QuestionnaireFormStatus[]> = {
  draft: ['published', 'archived'],
  published: ['closing', 'deprecated'],
  closing: ['deprecated', 'archived'], // Unpublished forms can be deprecated or archived
  deprecated: ['archived'],
  archived: [], // Terminal state
};

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Questionnaire form response (API)
 */
export interface QuestionnaireFormResponse {
  id: string;
  formId: string;
  version: string;
  title: string;
  status: QuestionnaireFormStatus;
  isNative: boolean;
  uploadedBy: string;
  uploadedAt: string;
  fileHash: string;
  fileName: string;
  fileSize: number;
  validationWarnings?: XlsformValidationIssue[];
}

/**
 * Questionnaire upload response
 */
export interface QuestionnaireUploadResponse {
  data: QuestionnaireFormResponse;
  validation: XlsformValidationResult;
}

/**
 * Questionnaire list response
 */
export interface QuestionnaireListResponse {
  data: QuestionnaireFormResponse[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * Version history entry
 */
export interface QuestionnaireVersionEntry {
  id: string;
  version: string;
  status: QuestionnaireFormStatus;
  changeNotes?: string;
  createdBy: string;
  createdAt: string;
}

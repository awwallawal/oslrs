/**
 * XLSForm and Questionnaire types for Story 2.1
 * Aligned with docs/questionnaire_schema.md v3.0
 */

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
 * Required choice lists with minimum options
 */
export const OSLSR_REQUIRED_CHOICE_LISTS = {
  lga_list: { minOptions: 33, description: 'Oyo State LGAs' },
  skill_list: { minOptions: 50, description: 'Categorized skills' },
  experience_list: { minOptions: 5, description: 'Years of experience ranges' },
  emp_type: { minOptions: 6, description: 'Employment types' },
} as const;

// ============================================================================
// Form Status Types
// ============================================================================

/**
 * Form lifecycle statuses
 */
export const QUESTIONNAIRE_FORM_STATUSES = ['draft', 'published', 'deprecated', 'archived'] as const;
export type QuestionnaireFormStatus = typeof QUESTIONNAIRE_FORM_STATUSES[number];

/**
 * Valid status transitions
 */
export const VALID_STATUS_TRANSITIONS: Record<QuestionnaireFormStatus, QuestionnaireFormStatus[]> = {
  draft: ['published', 'archived'],
  published: ['deprecated'],
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
  uploadedBy: string;
  uploadedAt: string;
  fileHash: string;
  fileName: string;
  fileSize: number;
  validationWarnings?: XlsformValidationIssue[];
  // ODK Central deployment fields (Story 2.2)
  odkXmlFormId?: string | null; // ODK Central's xmlFormId after deployment
  odkPublishedAt?: string | null; // ISO 8601 timestamp when published to ODK Central
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

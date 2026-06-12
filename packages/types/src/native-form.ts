/**
 * Native Form Schema types for the OSLSR native form system.
 * Introduced by SCP-2026-02-05-001 (native form system).
 *
 * The NativeFormSchema is stored as JSONB in questionnaire_forms.form_schema.
 */

// ── Enums ──────────────────────────────────────────────────────────────────

export const questionTypes = [
  'text',
  'number',
  'date',
  'select_one',
  'select_multiple',
  'note',
  'geopoint',
] as const;
export type QuestionType = (typeof questionTypes)[number];

export const conditionOperators = [
  'equals',
  'not_equals',
  'greater_than',
  'greater_or_equal',
  'less_than',
  'less_or_equal',
  'is_empty',
  'is_not_empty',
] as const;
export type ConditionOperator = (typeof conditionOperators)[number];

export const validationTypes = [
  'regex',
  'min',
  'max',
  'minLength',
  'maxLength',
  'lessThanField',
  'modulus11',
] as const;
export type ValidationType = (typeof validationTypes)[number];

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface Choice {
  label: string;
  labelYoruba?: string;
  value: string;
}

export interface ValidationRule {
  type: ValidationType;
  value: string | number;
  message: string;
}

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value?: string | number;
}

export interface ConditionGroup {
  any?: Condition[];
  all?: Condition[];
}

export interface Question {
  id: string;
  type: QuestionType;
  name: string;
  label: string;
  labelYoruba?: string;
  required: boolean;
  choices?: string; // Key into choiceLists (for select_one/select_multiple)
  showWhen?: Condition | ConditionGroup;
  validation?: ValidationRule[];
}

export interface Section {
  id: string;
  title: string;
  showWhen?: Condition | ConditionGroup;
  questions: Question[];
}

/**
 * A non-rendering computed field migrated from an XLSForm `calculate` row
 * (Story 9-54 AC1). The `expression` is the raw XLSForm calculation string
 * (e.g. `int((today() - ${dob}) div 365.25)`); it is evaluated at render and
 * recomputed authoritatively at submit by `evaluateCalculations` (@oslsr/utils).
 * Calculations are NOT shown to the user and are NOT part of `sections`.
 */
export interface Calculation {
  /** The field name the computed value is bound to (e.g. `age`). */
  name: string;
  /** Raw XLSForm calculate expression over the safe subset. */
  expression: string;
}

export interface NativeFormSchema {
  id: string;
  title: string;
  version: string;
  status: 'draft' | 'published' | 'closing' | 'deprecated' | 'archived';
  sections: Section[];
  choiceLists: Record<string, Choice[]>;
  /**
   * Computed (non-rendering) fields, evaluated in array order so a later
   * calculation may reference an earlier one. Optional for backward
   * compatibility with pre-9-54 schemas (treated as `[]`).
   */
  calculations?: Calculation[];
  createdAt: string;
  publishedAt?: string;
}

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

// ── Story 13-71: GPS capture vocabulary ────────────────────────────────────

/**
 * Story 13-71 AC4 — why an enumerator submission carries NO coordinates.
 *
 * ⛔ THIS IS A DERIVED VALUE, NOT A MENU. Every member except `other` is the
 * browser's own verdict, mapped from `GeolocationPositionError.code` (or from
 * the absence of `navigator.geolocation`). A free-choice dropdown whose first
 * item excuses the requirement becomes the fast way out of it, and the browser
 * already knows the true cause — the enumerator confirms that they could not
 * capture a location, they do not diagnose why.
 *
 * ⭐ WHY IT IS A VOCABULARY AT ALL: before this story, "did not tap the button"
 * and "tapped and was refused" were the SAME absent value. That is the
 * difference between a field problem and a phone problem, and the weekly ops
 * read cannot act on either without being able to tell them apart (A14 — a
 * zero must say which kind of zero it is).
 *
 * Shared because both sides need the SAME list (A10): the client derives it,
 * the API validates it as a zod enum, and `submissions.gps_unavailable_reason`
 * stores it. The drizzle schema column is plain `text` — a schema file must not
 * import `@oslsr/types` — and names this constant as its canonical source.
 */
export const gpsUnavailableReasons = [
  /** `GeolocationPositionError.PERMISSION_DENIED` (1) — the user or the OS refused. */
  'permission_denied',
  /** `GeolocationPositionError.POSITION_UNAVAILABLE` (2) — no fix obtainable. */
  'position_unavailable',
  /** `GeolocationPositionError.TIMEOUT` (3) — no fix within the deadline. */
  'timeout',
  /** `navigator.geolocation` is absent — the browser has no geolocation at all. */
  'unsupported',
  /** A manual override, or a refusal with no attempt on record. */
  'other',
] as const;
export type GpsUnavailableReason = (typeof gpsUnavailableReasons)[number];

/**
 * Map a `GeolocationPositionError.code` onto the stored vocabulary.
 *
 * Deliberately takes a bare `number` rather than the DOM error object so it is
 * shared (this package is imported by the API, which has no DOM lib) and so it
 * is unit-testable without a browser. The three codes are fixed by the W3C
 * Geolocation spec and are not expected to grow; anything unrecognised — and
 * anything absent, which is the "no attempt was ever made" case — falls to
 * `other` rather than guessing.
 *
 * ⛔ `unsupported` is NOT derivable here: it is the absence of the API, which
 * produces no error object and therefore no code. The caller sets it directly.
 */
export function geolocationErrorCodeToReason(
  code: number | null | undefined,
): GpsUnavailableReason {
  switch (code) {
    case 1:
      return 'permission_denied';
    case 2:
      return 'position_unavailable';
    case 3:
      return 'timeout';
    default:
      return 'other';
  }
}

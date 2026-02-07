import { describe, it, expect } from 'vitest';
import type { XlsformSurveyRow, XlsformChoiceRow, ParsedXlsform } from '@oslsr/types';
import { nativeFormSchema } from '@oslsr/types';
import {
  mapQuestionType,
  extractChoiceListKey,
  convertConstraints,
  convertChoiceLists,
  extractSections,
  convertToNativeForm,
  getMigrationSummary,
} from '../lib/xlsform-to-native-converter.js';

// ── Type Mapping Tests (1–9) ─────────────────────────────────────────────

describe('mapQuestionType', () => {
  it('maps text → text', () => {
    expect(mapQuestionType('text')).toBe('text');
  });

  it('maps integer → number', () => {
    expect(mapQuestionType('integer')).toBe('number');
  });

  it('maps decimal → number', () => {
    expect(mapQuestionType('decimal')).toBe('number');
  });

  it('maps date → date', () => {
    expect(mapQuestionType('date')).toBe('date');
  });

  it('maps select_one list_name → select_one', () => {
    expect(mapQuestionType('select_one yes_no')).toBe('select_one');
    expect(extractChoiceListKey('select_one yes_no')).toBe('yes_no');
  });

  it('maps select_multiple list_name → select_multiple', () => {
    expect(mapQuestionType('select_multiple skill_list')).toBe('select_multiple');
    expect(extractChoiceListKey('select_multiple skill_list')).toBe('skill_list');
  });

  it('maps note → note', () => {
    expect(mapQuestionType('note')).toBe('note');
  });

  it('maps geopoint → geopoint', () => {
    expect(mapQuestionType('geopoint')).toBe('geopoint');
  });

  it('returns null for metadata types (start, end, calculate, deviceid)', () => {
    expect(mapQuestionType('start')).toBeNull();
    expect(mapQuestionType('end')).toBeNull();
    expect(mapQuestionType('calculate')).toBeNull();
    expect(mapQuestionType('deviceid')).toBeNull();
  });
});

// ── Section Extraction Tests (10–13) ─────────────────────────────────────

describe('extractSections', () => {
  it('extracts sections from begin_group/end_group pairs', () => {
    const survey: XlsformSurveyRow[] = [
      { type: 'begin_group', name: 'grp1', label: 'Section One' },
      { type: 'text', name: 'field1', label: 'Field 1' },
      { type: 'end_group', name: 'grp1' },
    ];
    const sections = extractSections(survey);
    expect(sections).toHaveLength(1);
    expect(sections[0].questions).toHaveLength(1);
  });

  it('sets section title from group label', () => {
    const survey: XlsformSurveyRow[] = [
      { type: 'begin_group', name: 'grp1', label: 'My Section Title' },
      { type: 'text', name: 'f1', label: 'F1' },
      { type: 'end_group', name: 'grp1' },
    ];
    const sections = extractSections(survey);
    expect(sections[0].title).toBe('My Section Title');
  });

  it('converts group-level relevance to section showWhen', () => {
    const survey: XlsformSurveyRow[] = [
      { type: 'begin_group', name: 'grp1', label: 'Conditional', relevance: "${consent} = 'yes'" },
      { type: 'text', name: 'f1', label: 'F1' },
      { type: 'end_group', name: 'grp1' },
    ];
    const sections = extractSections(survey);
    expect(sections[0].showWhen).toEqual({
      field: 'consent',
      operator: 'equals',
      value: 'yes',
    });
  });

  it('places questions inside correct section', () => {
    const survey: XlsformSurveyRow[] = [
      { type: 'begin_group', name: 'grpA', label: 'Section A' },
      { type: 'text', name: 'a1', label: 'A1' },
      { type: 'text', name: 'a2', label: 'A2' },
      { type: 'end_group', name: 'grpA' },
      { type: 'begin_group', name: 'grpB', label: 'Section B' },
      { type: 'integer', name: 'b1', label: 'B1' },
      { type: 'end_group', name: 'grpB' },
    ];
    const sections = extractSections(survey);
    expect(sections).toHaveLength(2);
    expect(sections[0].questions).toHaveLength(2);
    expect(sections[0].questions[0].name).toBe('a1');
    expect(sections[0].questions[1].name).toBe('a2');
    expect(sections[1].questions).toHaveLength(1);
    expect(sections[1].questions[0].name).toBe('b1');
    expect(sections[1].questions[0].type).toBe('number');
  });
});

// ── Relevant Column Fallback Test ──────────────────────────────────────────

describe('getRelevance fallback (relevant vs relevance)', () => {
  it('reads showWhen from "relevant" column when "relevance" is absent', () => {
    const survey: XlsformSurveyRow[] = [
      { type: 'begin_group', name: 'grp1', label: 'Conditional Group', relevant: "${consent} = 'yes'" } as XlsformSurveyRow,
      { type: 'text', name: 'f1', label: 'F1' },
      { type: 'end_group', name: 'grp1' },
    ];
    const sections = extractSections(survey);
    expect(sections[0].showWhen).toEqual({
      field: 'consent',
      operator: 'equals',
      value: 'yes',
    });
  });

  it('reads question showWhen from "relevant" column', () => {
    const survey: XlsformSurveyRow[] = [
      { type: 'begin_group', name: 'grp1', label: 'Section' },
      { type: 'text', name: 'f1', label: 'F1', relevant: "${status} = 'active'" } as XlsformSurveyRow,
      { type: 'end_group', name: 'grp1' },
    ];
    const sections = extractSections(survey);
    expect(sections[0].questions[0].showWhen).toEqual({
      field: 'status',
      operator: 'equals',
      value: 'active',
    });
  });

  it('prefers "relevance" over "relevant" when both are present', () => {
    const survey: XlsformSurveyRow[] = [
      { type: 'begin_group', name: 'grp1', label: 'Section', relevance: "${a} = 'x'", relevant: "${b} = 'y'" } as XlsformSurveyRow,
      { type: 'text', name: 'f1', label: 'F1' },
      { type: 'end_group', name: 'grp1' },
    ];
    const sections = extractSections(survey);
    expect(sections[0].showWhen).toEqual({
      field: 'a',
      operator: 'equals',
      value: 'x',
    });
  });
});

// ── Skip Logic Integration Tests (multiple patterns through converter) ────

describe('skip logic patterns through extractSections', () => {
  it('converts numeric >= comparison (${age} >= 15)', () => {
    const survey: XlsformSurveyRow[] = [
      { type: 'begin_group', name: 'grp1', label: 'Labor', relevance: '${age} >= 15' },
      { type: 'text', name: 'f1', label: 'F1' },
      { type: 'end_group', name: 'grp1' },
    ];
    const sections = extractSections(survey);
    expect(sections[0].showWhen).toEqual({
      field: 'age',
      operator: 'greater_or_equal',
      value: 15,
    });
  });

  it('converts OR compound expression (${a} = x or ${b} = y)', () => {
    const survey: XlsformSurveyRow[] = [
      { type: 'begin_group', name: 'grp1', label: 'Section' },
      { type: 'text', name: 'f1', label: 'F1', relevance: "${employment_status} = 'yes' or ${temp_absent} = 'yes'" },
      { type: 'end_group', name: 'grp1' },
    ];
    const sections = extractSections(survey);
    const showWhen = sections[0].questions[0].showWhen as { any: unknown[] };
    expect(showWhen.any).toBeDefined();
    expect(showWhen.any).toHaveLength(2);
  });

  it('converts not-equals comparison (${field} != value)', () => {
    const survey: XlsformSurveyRow[] = [
      { type: 'begin_group', name: 'grp1', label: 'Section' },
      { type: 'text', name: 'f1', label: 'F1', relevance: "${status} != 'inactive'" },
      { type: 'end_group', name: 'grp1' },
    ];
    const sections = extractSections(survey);
    expect(sections[0].questions[0].showWhen).toEqual({
      field: 'status',
      operator: 'not_equals',
      value: 'inactive',
    });
  });

  it('converts simple equals on question level (${field} = value)', () => {
    const survey: XlsformSurveyRow[] = [
      { type: 'begin_group', name: 'grp1', label: 'Section' },
      { type: 'select_one yes_no', name: 'has_business', label: 'Has business?', required: 'yes' },
      { type: 'text', name: 'business_name', label: 'Business Name', relevance: "${has_business} = 'yes'" },
      { type: 'text', name: 'business_reg', label: 'Business Reg', relevance: "${has_business} = 'yes'" },
      { type: 'text', name: 'business_addr', label: 'Business Address', relevance: "${has_business} = 'yes'" },
      { type: 'end_group', name: 'grp1' },
    ];
    const sections = extractSections(survey);
    // All 3 conditional questions should have showWhen
    expect(sections[0].questions[1].showWhen).toEqual({ field: 'has_business', operator: 'equals', value: 'yes' });
    expect(sections[0].questions[2].showWhen).toEqual({ field: 'has_business', operator: 'equals', value: 'yes' });
    expect(sections[0].questions[3].showWhen).toEqual({ field: 'has_business', operator: 'equals', value: 'yes' });
    // Non-conditional question should NOT have showWhen
    expect(sections[0].questions[0].showWhen).toBeUndefined();
  });
});

// ── Choice List Conversion Tests (14–15) ─────────────────────────────────

describe('convertChoiceLists', () => {
  it('converts flat choices array to grouped record', () => {
    const choices: XlsformChoiceRow[] = [
      { list_name: 'yes_no', name: 'yes', label: 'Yes' },
      { list_name: 'yes_no', name: 'no', label: 'No' },
      { list_name: 'gender', name: 'male', label: 'Male' },
      { list_name: 'gender', name: 'female', label: 'Female' },
    ];
    const result = convertChoiceLists(choices);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['yes_no']).toHaveLength(2);
    expect(result['gender']).toHaveLength(2);
    expect(result['yes_no'][0]).toEqual({ label: 'Yes', value: 'yes' });
  });

  it('preserves choice order within lists', () => {
    const choices: XlsformChoiceRow[] = [
      { list_name: 'colors', name: 'red', label: 'Red' },
      { list_name: 'colors', name: 'green', label: 'Green' },
      { list_name: 'colors', name: 'blue', label: 'Blue' },
    ];
    const result = convertChoiceLists(choices);
    expect(result['colors'][0].value).toBe('red');
    expect(result['colors'][1].value).toBe('green');
    expect(result['colors'][2].value).toBe('blue');
  });
});

// ── Constraint Conversion Tests (16–20) ──────────────────────────────────

describe('convertConstraints', () => {
  it('converts regex constraint to ValidationRule', () => {
    const row: XlsformSurveyRow = {
      type: 'text',
      name: 'phone',
      constraint: "regex(., '^[0][7-9][0-1][0-9]{8}$')",
      constraint_message: 'Invalid phone number',
    };
    const rules = convertConstraints(row);
    expect(rules).toHaveLength(1);
    expect(rules![0]).toEqual({
      type: 'regex',
      value: '^[0][7-9][0-1][0-9]{8}$',
      message: 'Invalid phone number',
    });
  });

  it('converts range constraint (. >= 0 and . <= 168) to min + max rules', () => {
    const row: XlsformSurveyRow = {
      type: 'integer',
      name: 'hours',
      constraint: '. >= 0 and . <= 168',
      constraint_message: 'Must be 0-168',
    };
    const rules = convertConstraints(row);
    expect(rules).toHaveLength(2);
    expect(rules![0]).toEqual({ type: 'min', value: 0, message: 'Must be 0-168' });
    expect(rules![1]).toEqual({ type: 'max', value: 168, message: 'Must be 0-168' });
  });

  it('converts string-length(.) <= N to maxLength rule', () => {
    const row: XlsformSurveyRow = {
      type: 'text',
      name: 'bio',
      constraint: 'string-length(.) <= 200',
      constraint_message: 'Max 200 characters',
    };
    const rules = convertConstraints(row);
    expect(rules).toHaveLength(1);
    expect(rules![0]).toEqual({
      type: 'maxLength',
      value: 200,
      message: 'Max 200 characters',
    });
  });

  it('converts . < ${field} to lessThanField rule', () => {
    const row: XlsformSurveyRow = {
      type: 'integer',
      name: 'dependents',
      constraint: '. < ${household_size}',
      constraint_message: 'Must be less than household size',
    };
    const rules = convertConstraints(row);
    expect(rules).toHaveLength(1);
    expect(rules![0]).toEqual({
      type: 'lessThanField',
      value: 'household_size',
      message: 'Must be less than household size',
    });
  });

  it('returns undefined for unconvertible constraints', () => {
    const row: XlsformSurveyRow = {
      type: 'date',
      name: 'dob',
      constraint: '. <= today()',
    };
    expect(convertConstraints(row)).toBeUndefined();
  });
});

// ── Integration Test (21) ────────────────────────────────────────────────

describe('convertToNativeForm', () => {
  const sampleParsed: ParsedXlsform = {
    survey: [
      { type: 'start', name: 'start' },
      { type: 'end', name: 'end' },
      { type: 'deviceid', name: 'deviceid' },
      { type: 'begin_group', name: 'grp_intro', label: 'Introduction' },
      { type: 'note', name: 'note_intro', label: 'Welcome to the survey' },
      { type: 'select_one yes_no', name: 'consent', label: 'Do you consent?', required: 'yes' },
      { type: 'end_group', name: 'grp_intro' },
      { type: 'begin_group', name: 'grp_data', label: 'Data Collection', relevance: "${consent} = 'yes'" },
      { type: 'text', name: 'full_name', label: 'Full Name', required: 'yes' },
      { type: 'integer', name: 'age', label: 'Age', constraint: '. >= 0 and . <= 150', constraint_message: 'Invalid age' },
      { type: 'select_one gender_list', name: 'gender', label: 'Gender' },
      { type: 'end_group', name: 'grp_data' },
    ],
    choices: [
      { list_name: 'yes_no', name: 'yes', label: 'Yes' },
      { list_name: 'yes_no', name: 'no', label: 'No' },
      { list_name: 'gender_list', name: 'male', label: 'Male' },
      { list_name: 'gender_list', name: 'female', label: 'Female' },
      { list_name: 'gender_list', name: 'other', label: 'Other' },
    ],
    settings: {
      form_id: 'test_form',
      version: '2026012601',
      form_title: 'Test Survey',
    },
  };

  it('produces Zod-valid NativeFormSchema from sample form data', () => {
    const result = convertToNativeForm(sampleParsed);

    // Structure checks
    expect(result.title).toBe('Test Survey');
    expect(result.version).toBe('3.0.0');
    expect(result.status).toBe('draft');
    expect(result.sections).toHaveLength(2);
    expect(Object.keys(result.choiceLists)).toHaveLength(2);

    // Section content
    expect(result.sections[0].title).toBe('Introduction');
    expect(result.sections[0].questions).toHaveLength(2);
    expect(result.sections[1].title).toBe('Data Collection');
    expect(result.sections[1].questions).toHaveLength(3);
    expect(result.sections[1].showWhen).toBeDefined();

    // Choice list references resolve
    const consentQ = result.sections[0].questions[1];
    expect(consentQ.choices).toBe('yes_no');
    expect(result.choiceLists['yes_no']).toBeDefined();

    // Constraints converted
    const ageQ = result.sections[1].questions[1];
    expect(ageQ.validation).toHaveLength(2);
    expect(ageQ.validation![0].type).toBe('min');
    expect(ageQ.validation![1].type).toBe('max');

    // Required flag
    expect(consentQ.required).toBe(true);
    expect(result.sections[1].questions[0].required).toBe(true); // full_name

    // Zod validation
    const zodResult = nativeFormSchema.safeParse(result);
    if (!zodResult.success) {
      console.error('Zod errors:', JSON.stringify(zodResult.error.issues, null, 2));
    }
    expect(zodResult.success).toBe(true);
  });

  it('produces correct migration summary counts', () => {
    const result = convertToNativeForm(sampleParsed);
    const summary = getMigrationSummary(result);

    expect(summary.sectionCount).toBe(2);
    expect(summary.questionCount).toBe(5);
    expect(summary.choiceListCount).toBe(2);
    // 1 section-level showWhen (grp_data)
    expect(summary.skipLogicCount).toBe(1);
  });

  it('handles empty form with zero sections and choices', () => {
    const emptyParsed: ParsedXlsform = {
      survey: [],
      choices: [],
      settings: { form_id: 'empty', version: '1', form_title: 'Empty Form' },
    };
    const result = convertToNativeForm(emptyParsed);
    const summary = getMigrationSummary(result);

    expect(summary.sectionCount).toBe(0);
    expect(summary.questionCount).toBe(0);
    expect(summary.choiceListCount).toBe(0);
    expect(summary.skipLogicCount).toBe(0);
  });
});

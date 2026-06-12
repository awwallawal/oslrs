import { describe, it, expect } from 'vitest';
import {
  convertToNativeForm,
  extractSections,
  extractCalculations,
  getMigrationSummary,
} from '../xlsform-to-native-converter.js';
import type { ParsedXlsform, XlsformSurveyRow } from '@oslsr/types';

/**
 * Story 9-54 AC1.2 + AC2.4 — fidelity regression for the OSLSR master form
 * shape: a `calculate` row for `age`, a consent-gated identity group, and an
 * age-gated labour group. Pre-9-54 the converter dropped BOTH the calculate row
 * and the group-level relevance; this test pins that they now round-trip.
 */
const masterishSurvey: XlsformSurveyRow[] = [
  { type: 'text', name: 'consent_basic', label: 'Do you consent?', required: 'yes' },
  { type: 'calculate', name: 'age', label: '', calculation: 'int((today() - ${dob}) div 365.25)' },
  {
    type: 'begin_group',
    name: 'grp_identity',
    label: 'Identity',
    relevance: "${consent_basic} = 'yes'",
  },
  { type: 'date', name: 'dob', label: 'Date of birth', required: 'yes' },
  { type: 'text', name: 'surname', label: 'Surname', required: 'yes' },
  { type: 'end_group', name: 'grp_identity_end' },
  { type: 'begin_group', name: 'grp_labor', label: 'Labour', relevance: '${age} >= 15' },
  { type: 'text', name: 'employment_status', label: 'Employment status', required: 'yes' },
  { type: 'end_group', name: 'grp_labor_end' },
];

const parsed: ParsedXlsform = {
  survey: masterishSurvey,
  choices: [],
  settings: { form_id: 'oslsr_master', version: '2026012601', form_title: 'OSLSR Master' },
};

describe('extractCalculations (AC1.2)', () => {
  it('retains calculate rows as Calculation entries with the raw expression', () => {
    const calcs = extractCalculations(masterishSurvey);
    expect(calcs).toEqual([
      { name: 'age', expression: 'int((today() - ${dob}) div 365.25)' },
    ]);
  });

  it('does NOT render calculate rows as questions', () => {
    const sections = extractSections(masterishSurvey);
    const allQuestionNames = sections.flatMap((s) => s.questions.map((q) => q.name));
    expect(allQuestionNames).not.toContain('age');
  });

  it('skips calculate rows with an empty expression', () => {
    expect(extractCalculations([{ type: 'calculate', name: 'noop', calculation: '  ' }])).toEqual([]);
  });
});

describe('extractSections — group-level relevance (AC2.4)', () => {
  it('converts grp_identity consent gate to section showWhen', () => {
    const sections = extractSections(masterishSurvey);
    const identity = sections.find((s) => s.title === 'Identity');
    expect(identity?.showWhen).toEqual({
      field: 'consent_basic',
      operator: 'equals',
      value: 'yes',
    });
  });

  it('converts grp_labor age gate (referencing a computed field) to section showWhen', () => {
    const sections = extractSections(masterishSurvey);
    const labor = sections.find((s) => s.title === 'Labour');
    expect(labor?.showWhen).toEqual({
      field: 'age',
      operator: 'greater_or_equal',
      value: 15,
    });
  });

  it('leaves a group without relevance ungated', () => {
    const sections = extractSections([
      { type: 'begin_group', name: 'g', label: 'Plain' },
      { type: 'text', name: 'q1', label: 'Q1' },
      { type: 'end_group', name: 'g_end' },
    ]);
    expect(sections[0].showWhen).toBeUndefined();
  });
});

describe('convertToNativeForm — full master-ish round-trip', () => {
  it('emits calculations + section gates together', () => {
    const schema = convertToNativeForm(parsed);
    expect(schema.calculations).toEqual([
      { name: 'age', expression: 'int((today() - ${dob}) div 365.25)' },
    ]);
    const titles = schema.sections.map((s) => s.title);
    expect(titles).toEqual(expect.arrayContaining(['Identity', 'Labour']));
    expect(getMigrationSummary(schema)).toMatchObject({
      calculationCount: 1,
      skipLogicCount: 2, // two section gates
    });
  });

  it('omits the calculations key entirely when no calculate rows exist', () => {
    const schema = convertToNativeForm({
      survey: [{ type: 'text', name: 'q1', label: 'Q1', required: 'yes' }],
      choices: [],
      settings: { form_id: 'f', version: '1', form_title: 'Plain' },
    });
    expect(schema.calculations).toBeUndefined();
  });
});

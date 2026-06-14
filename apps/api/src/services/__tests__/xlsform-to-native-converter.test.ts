import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  convertToNativeForm,
  extractSections,
  extractCalculations,
  getMigrationSummary,
} from '../xlsform-to-native-converter.js';
import { XlsformParserService } from '../xlsform-parser.service.js';
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
  // Story 9-55 — the under-15 guardian group is the age<15 complement of grp_labor.
  { type: 'begin_group', name: 'grp_guardian', label: 'Guardian', relevance: '${age} < 15' },
  { type: 'text', name: 'guardian_name', label: 'Guardian name', required: 'yes' },
  { type: 'select_one yes_no', name: 'guardian_consent', label: 'Guardian consent', required: 'yes' },
  { type: 'end_group', name: 'grp_guardian_end' },
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

  it('converts the Story 9-55 grp_guardian age<15 gate to section showWhen (less_than)', () => {
    const sections = extractSections(masterishSurvey);
    const guardian = sections.find((s) => s.title === 'Guardian');
    expect(guardian?.showWhen).toEqual({
      field: 'age',
      operator: 'less_than',
      value: 15,
    });
    // Guardian identity + consent questions remain required-in-group.
    const names = guardian?.questions.map((q) => q.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(['guardian_name', 'guardian_consent']));
    expect(guardian?.questions.every((q) => q.required)).toBe(true);
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
    expect(titles).toEqual(expect.arrayContaining(['Identity', 'Labour', 'Guardian']));
    expect(getMigrationSummary(schema)).toMatchObject({
      calculationCount: 1,
      skipLogicCount: 3, // three section gates: identity, labour, guardian
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

/**
 * Story 9-55 (M3 review fix) — guard the SHIPPED master binary, not just a
 * synthetic survey. The form-level guardian gate is only "uniform across
 * channels" if the actual `test-fixtures/oslsr_master_v3.xlsx` that gets
 * migrated + re-pinned in prod really carries the age<15 guardian group. A
 * future master re-export that drops it would otherwise pass every other test
 * while silently disabling the form-level gate (the server gate still holds).
 */
describe('real master binary — Story 9-55 guardian group is present', () => {
  const MASTER_PATH = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../../test-fixtures/oslsr_master_v3.xlsx',
  );

  it('migrates the shipped oslsr_master_v3.xlsx grp_guardian to an age<15 section gate', () => {
    const parsed = XlsformParserService.parseXlsxFile(readFileSync(MASTER_PATH));
    const schema = convertToNativeForm(parsed);

    // Locate the guardian section by its age<15 gate (robust to the section title).
    const guardian = schema.sections.find(
      (s) =>
        s.showWhen?.field === 'age' &&
        s.showWhen?.operator === 'less_than' &&
        s.showWhen?.value === 15,
    );
    expect(guardian, 'shipped master form must contain an age<15 guardian group').toBeDefined();

    const names = guardian?.questions.map((q) => q.name) ?? [];
    expect(names).toEqual(
      expect.arrayContaining([
        'guardian_name',
        'guardian_relationship',
        'guardian_phone',
        'guardian_consent',
        'is_supervised_apprentice',
      ]),
    );
  });
});

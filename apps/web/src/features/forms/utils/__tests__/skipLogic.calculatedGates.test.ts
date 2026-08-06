import { describe, it, expect } from 'vitest';
import { getVisibleQuestions, getNextVisibleIndex } from '../skipLogic';
import type { FlattenedQuestion } from '../../api/form.api';

/**
 * 13-4 (2026-08-06) — the defect this pins, found by a REAL prod smoke.
 *
 * `FormFillerPage` (enumerator) and `ClerkDataEntryPage` (clerk) called skip-logic with RAW
 * answers. `age` is DERIVED from `dob`, so it was absent, `Number(undefined)` is `NaN`, and
 * **both** `age >= 15` and `age < 15` evaluated false. Two mutually exclusive gates, both closed:
 * every enumerator submission silently skipped Labour Force Participation — the whole point of a
 * labour registry — and the under-15 guardian-consent control.
 *
 * The give-away is the one asserted below: **a valid DOB must open exactly ONE of the two gates.**
 * Neither opening means the operand never existed.
 */
const SECTIONS = {
  identity: 'sec-identity',
  labour: 'sec-labour',
  guardian: 'sec-guardian',
};

const CALCULATIONS = [
  { name: 'form_mode', expression: "once(if(${device_id} != null, 'enumerator', 'public'))" },
  { name: 'age', expression: 'int((today() - ${dob}) div 365.25)' },
];

const SECTION_SHOW_WHEN = {
  [SECTIONS.labour]: { field: 'age', value: 15, operator: 'greater_or_equal' as const },
  [SECTIONS.guardian]: { field: 'age', value: 15, operator: 'less_than' as const },
};

const q = (name: string, sectionId: string): FlattenedQuestion =>
  ({ name, sectionId, type: 'text', label: name, required: true, sectionTitle: sectionId }) as FlattenedQuestion;

const QUESTIONS = [q('dob', SECTIONS.identity), q('employment_status', SECTIONS.labour), q('guardian_name', SECTIONS.guardian)];
const TODAY = new Date('2026-08-06T14:00:00Z');
const names = (qs: FlattenedQuestion[]) => qs.map((x) => x.name);

describe('13-4 — skip-logic derives calculated gate operands itself', () => {
  it('ADULT dob opens Labour Force and closes guardian consent', () => {
    const visible = getVisibleQuestions(QUESTIONS, { dob: '1995-08-15' }, SECTION_SHOW_WHEN, undefined, {
      calculations: CALCULATIONS, today: TODAY,
    });
    expect(names(visible)).toContain('employment_status');
    expect(names(visible)).not.toContain('guardian_name');
  });

  it('MINOR dob opens guardian consent and closes Labour Force', () => {
    const visible = getVisibleQuestions(QUESTIONS, { dob: '2015-08-15' }, SECTION_SHOW_WHEN, undefined, {
      calculations: CALCULATIONS, today: TODAY,
    });
    expect(names(visible)).toContain('guardian_name');
    expect(names(visible)).not.toContain('employment_status');
  });

  /** THE REGRESSION. Exactly one age gate must open — never zero. */
  it('a valid DOB always opens exactly ONE of the two mutually exclusive gates', () => {
    for (const dob of ['1995-08-15', '2015-08-15', '2011-08-07']) {
      const visible = names(
        getVisibleQuestions(QUESTIONS, { dob }, SECTION_SHOW_WHEN, undefined, {
          calculations: CALCULATIONS, today: TODAY,
        }),
      );
      const opened = [visible.includes('employment_status'), visible.includes('guardian_name')].filter(Boolean).length;
      expect({ dob, opened }).toEqual({ dob, opened: 1 });
    }
  });

  it('navigation agrees with visibility — Next from dob lands on the labour question', () => {
    const idx = getNextVisibleIndex(QUESTIONS, 0, { dob: '1995-08-15' }, SECTION_SHOW_WHEN, undefined, {
      calculations: CALCULATIONS, today: TODAY,
    });
    expect(QUESTIONS[idx]?.name).toBe('employment_status');
  });

  /** Documents the pre-fix behaviour, so the cost of omitting `calculations` is legible. */
  it('WITHOUT calculations both gates close — the exact prod defect', () => {
    const visible = names(getVisibleQuestions(QUESTIONS, { dob: '1995-08-15' }, SECTION_SHOW_WHEN));
    expect(visible).not.toContain('employment_status');
    expect(visible).not.toContain('guardian_name');
  });
});

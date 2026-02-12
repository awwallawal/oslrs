import { describe, it, expect } from 'vitest';
import {
  evaluateShowWhen,
  getVisibleQuestions,
  getNextVisibleIndex,
  getPrevVisibleIndex,
} from '../skipLogic';
import type { FlattenedQuestion } from '../../api/form.api';
import type { Condition, ConditionGroup } from '@oslsr/types';

// Helper to create a minimal FlattenedQuestion
function makeQuestion(
  overrides: Partial<FlattenedQuestion> & { name: string }
): FlattenedQuestion {
  return {
    id: overrides.name,
    type: 'text',
    label: overrides.name,
    required: false,
    sectionId: 'section-1',
    sectionTitle: 'Section 1',
    ...overrides,
  };
}

describe('evaluateShowWhen', () => {
  it('evaluates equals condition (loose equality)', () => {
    const condition: Condition = { field: 'age', operator: 'equals', value: '15' };
    expect(evaluateShowWhen(condition, { age: 15 })).toBe(true);
    expect(evaluateShowWhen(condition, { age: '15' })).toBe(true);
    expect(evaluateShowWhen(condition, { age: 20 })).toBe(false);
  });

  it('evaluates not_equals condition', () => {
    const condition: Condition = { field: 'status', operator: 'not_equals', value: 'yes' };
    expect(evaluateShowWhen(condition, { status: 'no' })).toBe(true);
    expect(evaluateShowWhen(condition, { status: 'yes' })).toBe(false);
  });

  it('evaluates greater_than condition', () => {
    const condition: Condition = { field: 'age', operator: 'greater_than', value: 18 };
    expect(evaluateShowWhen(condition, { age: 25 })).toBe(true);
    expect(evaluateShowWhen(condition, { age: 18 })).toBe(false);
    expect(evaluateShowWhen(condition, { age: 10 })).toBe(false);
  });

  it('evaluates greater_or_equal condition', () => {
    const condition: Condition = { field: 'age', operator: 'greater_or_equal', value: 18 };
    expect(evaluateShowWhen(condition, { age: 18 })).toBe(true);
    expect(evaluateShowWhen(condition, { age: 17 })).toBe(false);
  });

  it('evaluates less_than condition', () => {
    const condition: Condition = { field: 'score', operator: 'less_than', value: 50 };
    expect(evaluateShowWhen(condition, { score: 30 })).toBe(true);
    expect(evaluateShowWhen(condition, { score: 50 })).toBe(false);
  });

  it('evaluates less_or_equal condition', () => {
    const condition: Condition = { field: 'score', operator: 'less_or_equal', value: 50 };
    expect(evaluateShowWhen(condition, { score: 50 })).toBe(true);
    expect(evaluateShowWhen(condition, { score: 51 })).toBe(false);
  });

  it('evaluates is_empty condition', () => {
    const condition: Condition = { field: 'name', operator: 'is_empty' };
    expect(evaluateShowWhen(condition, { name: '' })).toBe(true);
    expect(evaluateShowWhen(condition, { name: null })).toBe(true);
    expect(evaluateShowWhen(condition, {})).toBe(true);
    expect(evaluateShowWhen(condition, { name: 'John' })).toBe(false);
  });

  it('evaluates is_not_empty condition', () => {
    const condition: Condition = { field: 'name', operator: 'is_not_empty' };
    expect(evaluateShowWhen(condition, { name: 'John' })).toBe(true);
    expect(evaluateShowWhen(condition, { name: '' })).toBe(false);
    expect(evaluateShowWhen(condition, {})).toBe(false);
  });

  it('evaluates ConditionGroup with any (OR)', () => {
    const group: ConditionGroup = {
      any: [
        { field: 'role', operator: 'equals', value: 'admin' },
        { field: 'role', operator: 'equals', value: 'supervisor' },
      ],
    };
    expect(evaluateShowWhen(group, { role: 'admin' })).toBe(true);
    expect(evaluateShowWhen(group, { role: 'supervisor' })).toBe(true);
    expect(evaluateShowWhen(group, { role: 'enumerator' })).toBe(false);
  });

  it('evaluates ConditionGroup with all (AND)', () => {
    const group: ConditionGroup = {
      all: [
        { field: 'age', operator: 'greater_or_equal', value: 18 },
        { field: 'consent', operator: 'equals', value: 'yes' },
      ],
    };
    expect(evaluateShowWhen(group, { age: 25, consent: 'yes' })).toBe(true);
    expect(evaluateShowWhen(group, { age: 25, consent: 'no' })).toBe(false);
    expect(evaluateShowWhen(group, { age: 15, consent: 'yes' })).toBe(false);
  });

  it('returns false for NaN numeric comparisons', () => {
    const condition: Condition = { field: 'age', operator: 'greater_than', value: 18 };
    expect(evaluateShowWhen(condition, { age: 'abc' })).toBe(false);
  });
});

describe('getVisibleQuestions', () => {
  const questions: FlattenedQuestion[] = [
    makeQuestion({ name: 'consent', sectionId: 's1', sectionTitle: 'Consent' }),
    makeQuestion({
      name: 'age',
      sectionId: 's2',
      sectionTitle: 'Demographics',
      showWhen: { field: 'consent', operator: 'equals', value: 'yes' },
    }),
    makeQuestion({
      name: 'employment',
      sectionId: 's2',
      sectionTitle: 'Demographics',
    }),
    makeQuestion({
      name: 'hidden_q',
      sectionId: 's3',
      sectionTitle: 'Hidden Section',
      showWhen: { field: 'consent', operator: 'equals', value: 'never' },
    }),
  ];

  it('returns all questions with no showWhen when no formData restricts', () => {
    const visible = getVisibleQuestions(questions, { consent: 'yes' });
    expect(visible.map((q) => q.name)).toEqual(['consent', 'age', 'employment']);
  });

  it('hides questions with unmet showWhen', () => {
    const visible = getVisibleQuestions(questions, { consent: 'no' });
    expect(visible.map((q) => q.name)).toEqual(['consent', 'employment']);
  });

  it('shows all questions when there are no showWhen conditions', () => {
    const simpleQuestions = [
      makeQuestion({ name: 'q1' }),
      makeQuestion({ name: 'q2' }),
    ];
    const visible = getVisibleQuestions(simpleQuestions, {});
    expect(visible).toHaveLength(2);
  });

  it('handles empty formData correctly', () => {
    const visible = getVisibleQuestions(questions, {});
    // consent has no showWhen → visible
    // age: showWhen consent=yes, but consent is undefined → not equal → hidden
    // employment: no showWhen → visible
    // hidden_q: showWhen consent=never, consent undefined → hidden
    expect(visible.map((q) => q.name)).toEqual(['consent', 'employment']);
  });

  it('handles edge case: all questions hidden', () => {
    const allConditional = [
      makeQuestion({
        name: 'q1',
        showWhen: { field: 'x', operator: 'equals', value: 'impossible' },
      }),
    ];
    const visible = getVisibleQuestions(allConditional, {});
    expect(visible).toHaveLength(0);
  });

  it('handles edge case: first question hidden', () => {
    const qs = [
      makeQuestion({
        name: 'q1',
        showWhen: { field: 'x', operator: 'equals', value: 'yes' },
      }),
      makeQuestion({ name: 'q2' }),
    ];
    const visible = getVisibleQuestions(qs, {});
    expect(visible.map((q) => q.name)).toEqual(['q2']);
  });

  it('handles section-level skip logic', () => {
    const sectionQuestions: FlattenedQuestion[] = [
      makeQuestion({ name: 'q1', sectionId: 's1', sectionTitle: 'Open' }),
      makeQuestion({ name: 'q2', sectionId: 's2', sectionTitle: 'Gated' }),
    ];

    // Section metadata: s2 has showWhen
    const sectionShowWhen: Record<string, Condition | ConditionGroup> = {
      s2: { field: 'q1', operator: 'equals', value: 'yes' },
    };

    const visible = getVisibleQuestions(sectionQuestions, {}, sectionShowWhen);
    // s2 section hidden because q1 is undefined
    expect(visible.map((q) => q.name)).toEqual(['q1']);
  });
});

describe('getNextVisibleIndex', () => {
  const questions: FlattenedQuestion[] = [
    makeQuestion({ name: 'q1' }),
    makeQuestion({
      name: 'q2',
      showWhen: { field: 'q1', operator: 'equals', value: 'skip' },
    }),
    makeQuestion({ name: 'q3' }),
    makeQuestion({
      name: 'q4',
      showWhen: { field: 'q1', operator: 'equals', value: 'skip' },
    }),
    makeQuestion({ name: 'q5' }),
  ];

  it('skips hidden questions when advancing', () => {
    const next = getNextVisibleIndex(questions, 0, { q1: 'hello' });
    // q2 is hidden (q1 != 'skip'), so next visible is q3 at index 2
    expect(next).toBe(2);
  });

  it('returns next index when question is visible', () => {
    const next = getNextVisibleIndex(questions, 0, { q1: 'skip' });
    // q2 is visible (q1 == 'skip'), so next is index 1
    expect(next).toBe(1);
  });

  it('returns -1 when no more visible questions', () => {
    const next = getNextVisibleIndex(questions, 4, { q1: 'hello' });
    expect(next).toBe(-1);
  });

  it('skips multiple consecutive hidden questions', () => {
    // q2 hidden, q3 visible
    const next = getNextVisibleIndex(questions, 0, { q1: 'nope' });
    expect(next).toBe(2);
  });
});

describe('getPrevVisibleIndex', () => {
  const questions: FlattenedQuestion[] = [
    makeQuestion({ name: 'q1' }),
    makeQuestion({
      name: 'q2',
      showWhen: { field: 'q1', operator: 'equals', value: 'skip' },
    }),
    makeQuestion({ name: 'q3' }),
  ];

  it('skips hidden questions when going back', () => {
    const prev = getPrevVisibleIndex(questions, 2, { q1: 'hello' });
    // q2 is hidden, so prev visible is q1 at index 0
    expect(prev).toBe(0);
  });

  it('returns previous index when question is visible', () => {
    const prev = getPrevVisibleIndex(questions, 2, { q1: 'skip' });
    // q2 is visible, so prev is index 1
    expect(prev).toBe(1);
  });

  it('returns -1 when no previous visible questions', () => {
    const prev = getPrevVisibleIndex(questions, 0, { q1: 'hello' });
    expect(prev).toBe(-1);
  });
});

import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  evaluateConditionGroup,
  evaluateShowWhen,
  getVisibleQuestions,
  parseXlsformRelevance,
} from '../skip-logic.js';
import type { Condition, ConditionGroup, NativeFormSchema } from '@oslsr/types';

// ── evaluateCondition ──────────────────────────────────────────────────────

describe('evaluateCondition', () => {
  it('equals operator: string match returns true', () => {
    const cond: Condition = { field: 'consent', operator: 'equals', value: 'yes' };
    expect(evaluateCondition(cond, { consent: 'yes' })).toBe(true);
  });

  it('equals operator: mismatch returns false', () => {
    const cond: Condition = { field: 'consent', operator: 'equals', value: 'yes' };
    expect(evaluateCondition(cond, { consent: 'no' })).toBe(false);
  });

  it('equals operator: numeric string coercion ("15" == 15)', () => {
    const cond: Condition = { field: 'age', operator: 'equals', value: 15 };
    expect(evaluateCondition(cond, { age: '15' })).toBe(true);
  });

  it('not_equals operator: mismatch returns true', () => {
    const cond: Condition = { field: 'gender', operator: 'not_equals', value: 'male' };
    expect(evaluateCondition(cond, { gender: 'female' })).toBe(true);
  });

  it('greater_than operator: numeric comparison', () => {
    const cond: Condition = { field: 'age', operator: 'greater_than', value: 18 };
    expect(evaluateCondition(cond, { age: 25 })).toBe(true);
    expect(evaluateCondition(cond, { age: 18 })).toBe(false);
    expect(evaluateCondition(cond, { age: 10 })).toBe(false);
  });

  it('greater_or_equal operator: boundary value', () => {
    const cond: Condition = { field: 'age', operator: 'greater_or_equal', value: 15 };
    expect(evaluateCondition(cond, { age: 15 })).toBe(true);
    expect(evaluateCondition(cond, { age: 16 })).toBe(true);
    expect(evaluateCondition(cond, { age: 14 })).toBe(false);
  });

  it('less_than operator: numeric comparison', () => {
    const cond: Condition = { field: 'age', operator: 'less_than', value: 5 };
    expect(evaluateCondition(cond, { age: 3 })).toBe(true);
    expect(evaluateCondition(cond, { age: 5 })).toBe(false);
  });

  it('less_or_equal operator: boundary value', () => {
    const cond: Condition = { field: 'age', operator: 'less_or_equal', value: 60 };
    expect(evaluateCondition(cond, { age: 60 })).toBe(true);
    expect(evaluateCondition(cond, { age: 59 })).toBe(true);
    expect(evaluateCondition(cond, { age: 61 })).toBe(false);
  });

  it('is_empty operator: null value returns true', () => {
    const cond: Condition = { field: 'name', operator: 'is_empty' };
    expect(evaluateCondition(cond, { name: null })).toBe(true);
  });

  it('is_empty operator: empty string returns true', () => {
    const cond: Condition = { field: 'name', operator: 'is_empty' };
    expect(evaluateCondition(cond, { name: '' })).toBe(true);
  });

  it('is_empty operator: non-empty value returns false', () => {
    const cond: Condition = { field: 'name', operator: 'is_empty' };
    expect(evaluateCondition(cond, { name: 'John' })).toBe(false);
  });

  it('is_not_empty operator: value present returns true', () => {
    const cond: Condition = { field: 'name', operator: 'is_not_empty' };
    expect(evaluateCondition(cond, { name: 'John' })).toBe(true);
  });

  it('missing field in formData treated as empty/falsy', () => {
    const cond: Condition = { field: 'nonexistent', operator: 'is_empty' };
    expect(evaluateCondition(cond, {})).toBe(true);

    const condEquals: Condition = { field: 'nonexistent', operator: 'equals', value: 'yes' };
    expect(evaluateCondition(condEquals, {})).toBe(false);
  });

  it('non-numeric value with numeric operator returns false', () => {
    const cond: Condition = { field: 'age', operator: 'greater_than', value: 10 };
    expect(evaluateCondition(cond, { age: 'abc' })).toBe(false);
  });

  it('is_not_empty operator: missing field returns false', () => {
    const cond: Condition = { field: 'missing', operator: 'is_not_empty' };
    expect(evaluateCondition(cond, {})).toBe(false);
  });

  it('is_empty operator: undefined value returns true', () => {
    const cond: Condition = { field: 'undef', operator: 'is_empty' };
    expect(evaluateCondition(cond, { undef: undefined })).toBe(true);
  });
});

// ── evaluateConditionGroup ─────────────────────────────────────────────────

describe('evaluateConditionGroup', () => {
  it('ConditionGroup.any (OR): one true = true', () => {
    const group: ConditionGroup = {
      any: [
        { field: 'status', operator: 'equals', value: 'yes' },
        { field: 'absent', operator: 'equals', value: 'yes' },
      ],
    };
    expect(evaluateConditionGroup(group, { status: 'no', absent: 'yes' })).toBe(true);
  });

  it('ConditionGroup.any (OR): all false = false', () => {
    const group: ConditionGroup = {
      any: [
        { field: 'status', operator: 'equals', value: 'yes' },
        { field: 'absent', operator: 'equals', value: 'yes' },
      ],
    };
    expect(evaluateConditionGroup(group, { status: 'no', absent: 'no' })).toBe(false);
  });

  it('ConditionGroup.all (AND): all true = true', () => {
    const group: ConditionGroup = {
      all: [
        { field: 'consent', operator: 'equals', value: 'yes' },
        { field: 'age', operator: 'greater_or_equal', value: 18 },
      ],
    };
    expect(evaluateConditionGroup(group, { consent: 'yes', age: 20 })).toBe(true);
  });

  it('ConditionGroup.all (AND): one false = false', () => {
    const group: ConditionGroup = {
      all: [
        { field: 'consent', operator: 'equals', value: 'yes' },
        { field: 'age', operator: 'greater_or_equal', value: 18 },
      ],
    };
    expect(evaluateConditionGroup(group, { consent: 'yes', age: 15 })).toBe(false);
  });
});

// ── evaluateShowWhen ───────────────────────────────────────────────────────

describe('evaluateShowWhen', () => {
  it('evaluateShowWhen with single Condition', () => {
    const cond: Condition = { field: 'consent', operator: 'equals', value: 'yes' };
    expect(evaluateShowWhen(cond, { consent: 'yes' })).toBe(true);
    expect(evaluateShowWhen(cond, { consent: 'no' })).toBe(false);
  });

  it('evaluateShowWhen with ConditionGroup', () => {
    const group: ConditionGroup = {
      any: [
        { field: 'a', operator: 'equals', value: 'x' },
        { field: 'b', operator: 'equals', value: 'y' },
      ],
    };
    expect(evaluateShowWhen(group, { a: 'x', b: 'z' })).toBe(true);
    expect(evaluateShowWhen(group, { a: 'z', b: 'z' })).toBe(false);
  });
});

// ── getVisibleQuestions ────────────────────────────────────────────────────

describe('getVisibleQuestions', () => {
  const baseSchema: NativeFormSchema = {
    id: 'test-form',
    title: 'Test',
    version: '1.0.0',
    status: 'draft',
    sections: [],
    choiceLists: {},
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('hidden section hides all its questions', () => {
    const schema: NativeFormSchema = {
      ...baseSchema,
      sections: [
        {
          id: 's1',
          title: 'Section 1',
          showWhen: { field: 'consent', operator: 'equals', value: 'yes' },
          questions: [
            { id: 'q1', type: 'text', name: 'name', label: 'Name', required: true },
            { id: 'q2', type: 'number', name: 'age', label: 'Age', required: true },
          ],
        },
      ],
    };

    expect(getVisibleQuestions(schema, { consent: 'no' })).toEqual([]);
    expect(getVisibleQuestions(schema, { consent: 'yes' })).toEqual(['q1', 'q2']);
  });

  it('visible section with hidden question', () => {
    const schema: NativeFormSchema = {
      ...baseSchema,
      sections: [
        {
          id: 's1',
          title: 'Section 1',
          questions: [
            { id: 'q1', type: 'text', name: 'name', label: 'Name', required: true },
            {
              id: 'q2',
              type: 'text',
              name: 'details',
              label: 'Details',
              required: false,
              showWhen: { field: 'name', operator: 'is_not_empty' },
            },
          ],
        },
      ],
    };

    expect(getVisibleQuestions(schema, { name: '' })).toEqual(['q1']);
    expect(getVisibleQuestions(schema, { name: 'John' })).toEqual(['q1', 'q2']);
  });
});

// ── parseXlsformRelevance ──────────────────────────────────────────────────

describe('parseXlsformRelevance', () => {
  it("parses simple equals: ${consent_basic} = 'yes'", () => {
    const result = parseXlsformRelevance("${consent_basic} = 'yes'");
    expect(result).toEqual({ field: 'consent_basic', operator: 'equals', value: 'yes' });
  });

  it("parses not equals: ${gender} != 'male'", () => {
    const result = parseXlsformRelevance("${gender} != 'male'");
    expect(result).toEqual({ field: 'gender', operator: 'not_equals', value: 'male' });
  });

  it('parses numeric >=: ${age} >= 15', () => {
    const result = parseXlsformRelevance('${age} >= 15');
    expect(result).toEqual({ field: 'age', operator: 'greater_or_equal', value: 15 });
  });

  it('parses numeric >: ${age} > 18', () => {
    const result = parseXlsformRelevance('${age} > 18');
    expect(result).toEqual({ field: 'age', operator: 'greater_than', value: 18 });
  });

  it('parses numeric <: ${age} < 5', () => {
    const result = parseXlsformRelevance('${age} < 5');
    expect(result).toEqual({ field: 'age', operator: 'less_than', value: 5 });
  });

  it('parses numeric <=: ${age} <= 60', () => {
    const result = parseXlsformRelevance('${age} <= 60');
    expect(result).toEqual({ field: 'age', operator: 'less_or_equal', value: 60 });
  });

  it("parses OR expression: ${a} = 'x' or ${b} = 'y'", () => {
    const result = parseXlsformRelevance("${a} = 'x' or ${b} = 'y'");
    expect(result).toEqual({
      any: [
        { field: 'a', operator: 'equals', value: 'x' },
        { field: 'b', operator: 'equals', value: 'y' },
      ],
    });
  });

  it("parses AND expression: ${a} = 'x' and ${b} = 'y'", () => {
    const result = parseXlsformRelevance("${a} = 'x' and ${b} = 'y'");
    expect(result).toEqual({
      all: [
        { field: 'a', operator: 'equals', value: 'x' },
        { field: 'b', operator: 'equals', value: 'y' },
      ],
    });
  });

  it('throws on unparseable expression', () => {
    expect(() => parseXlsformRelevance('gibberish')).toThrow();
    expect(() => parseXlsformRelevance('')).toThrow();
  });
});

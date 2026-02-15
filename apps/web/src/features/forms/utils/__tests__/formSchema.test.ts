import { describe, it, expect } from 'vitest';
import { buildDynamicFormSchema, getCachedDynamicFormSchema, validateQuestionValue } from '../formSchema';
import type { FlattenedQuestion } from '../../api/form.api';

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

describe('validateQuestionValue', () => {
  it('validates required fields', () => {
    const q = makeQuestion({ name: 'full_name', required: true });
    expect(validateQuestionValue(q, '')).toBe('This field is required');
    expect(validateQuestionValue(q, null)).toBe('This field is required');
    expect(validateQuestionValue(q, [])).toBe('This field is required');
  });

  it('supports minLength and maxLength', () => {
    const q = makeQuestion({
      name: 'name',
      validation: [
        { type: 'minLength', value: 3, message: 'Too short' },
        { type: 'maxLength', value: 5, message: 'Too long' },
      ],
    });
    expect(validateQuestionValue(q, 'ab')).toBe('Too short');
    expect(validateQuestionValue(q, 'abcdef')).toBe('Too long');
    expect(validateQuestionValue(q, 'abcd')).toBeUndefined();
  });

  it('supports min and max', () => {
    const q = makeQuestion({
      name: 'age',
      validation: [
        { type: 'min', value: 18, message: 'Too young' },
        { type: 'max', value: 60, message: 'Too old' },
      ],
    });
    expect(validateQuestionValue(q, 12)).toBe('Too young');
    expect(validateQuestionValue(q, 61)).toBe('Too old');
    expect(validateQuestionValue(q, 35)).toBeUndefined();
  });

  it('supports regex', () => {
    const q = makeQuestion({
      name: 'phone',
      validation: [{ type: 'regex', value: '^\\d{11}$', message: 'Phone must be 11 digits' }],
    });
    expect(validateQuestionValue(q, 'abc')).toBe('Phone must be 11 digits');
    expect(validateQuestionValue(q, '08012345678')).toBeUndefined();
  });

  it('fails closed for malformed regex rules', () => {
    const q = makeQuestion({
      name: 'phone',
      validation: [{ type: 'regex', value: '[', message: 'Phone must be valid' }],
    });
    expect(validateQuestionValue(q, '08012345678')).toBe('Phone must be valid');
  });

  it('supports modulus11', () => {
    const q = makeQuestion({
      name: 'nin',
      validation: [{ type: 'modulus11', value: 1, message: 'Invalid NIN' }],
    });
    expect(validateQuestionValue(q, '12345678902')).toBe('Invalid NIN');
    expect(validateQuestionValue(q, '61961438053')).toBeUndefined();
  });
});

describe('buildDynamicFormSchema', () => {
  it('builds zod object keyed by question name', () => {
    const schema = buildDynamicFormSchema([
      makeQuestion({ name: 'full_name', required: true }),
      makeQuestion({ name: 'age' }),
    ]);

    expect(() => schema.parse({ full_name: 'John', age: 20 })).not.toThrow();
    expect(() => schema.parse({ full_name: '', age: 20 })).toThrowError('This field is required');
  });

  it('reuses cached schema instances for identical question definitions', () => {
    const questions = [
      makeQuestion({ name: 'full_name', required: true }),
      makeQuestion({ name: 'age' }),
    ];

    const schemaA = getCachedDynamicFormSchema(questions);
    const schemaB = getCachedDynamicFormSchema(questions);

    expect(schemaA).toBe(schemaB);
    expect(() => schemaA.parse({ full_name: 'John', age: 20 })).not.toThrow();
  });
});

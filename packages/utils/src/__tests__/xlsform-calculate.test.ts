import { describe, it, expect, vi } from 'vitest';
import {
  evaluateCalculate,
  evaluateCalculations,
  withCalculatedFields,
  UnsupportedCalculateError,
} from '../xlsform-calculate.js';
import type { Calculation } from '@oslsr/types';

// Injected, fixed clock — never Date.now() in deterministic logic/tests.
const TODAY = new Date('2026-06-12T00:00:00.000Z');
const AGE_EXPR = 'int((today() - ${dob}) div 365.25)';

describe('evaluateCalculate — master-form age', () => {
  it('dob=1984-06-06, today=2026-06-12 → age 42 (AC1.4)', () => {
    expect(evaluateCalculate(AGE_EXPR, { dob: '1984-06-06' }, TODAY)).toBe(42);
  });

  it('a 14-year-old resolves below the 15 floor (feeds the age gate)', () => {
    // born 2012-01-01 → 14 on 2026-06-12
    expect(evaluateCalculate(AGE_EXPR, { dob: '2012-01-01' }, TODAY)).toBe(14);
  });

  it('birthday not yet reached this year rounds down', () => {
    // born 1984-12-31 → still 41 on 2026-06-12
    expect(evaluateCalculate(AGE_EXPR, { dob: '1984-12-31' }, TODAY)).toBe(41);
  });

  it('accepts an ISO datetime dob string', () => {
    expect(evaluateCalculate(AGE_EXPR, { dob: '1984-06-06T09:30:00.000Z' }, TODAY)).toBe(42);
  });

  it('returns undefined when the referenced field is absent (not computable yet)', () => {
    expect(evaluateCalculate(AGE_EXPR, {}, TODAY)).toBeUndefined();
  });

  it('returns undefined when the referenced field is empty string', () => {
    expect(evaluateCalculate(AGE_EXPR, { dob: '' }, TODAY)).toBeUndefined();
  });

  it('returns undefined for a non-date, non-numeric value', () => {
    expect(evaluateCalculate(AGE_EXPR, { dob: 'not-a-date' }, TODAY)).toBeUndefined();
  });
});

describe('evaluateCalculate — arithmetic subset', () => {
  it('integer + - * div with precedence', () => {
    expect(evaluateCalculate('2 + 3 * 4', {}, TODAY)).toBe(14);
    expect(evaluateCalculate('(2 + 3) * 4', {}, TODAY)).toBe(20);
    expect(evaluateCalculate('10 div 4', {}, TODAY)).toBe(2.5);
    expect(evaluateCalculate('int(10 div 4)', {}, TODAY)).toBe(2);
  });

  it('unary minus', () => {
    expect(evaluateCalculate('-5 + 8', {}, TODAY)).toBe(3);
  });

  it('numeric ${field} reference', () => {
    expect(evaluateCalculate('${count} * 2', { count: 21 }, TODAY)).toBe(42);
    expect(evaluateCalculate('${count} * 2', { count: '21' }, TODAY)).toBe(42);
  });

  it('int truncates toward zero', () => {
    expect(evaluateCalculate('int(-2.9)', {}, TODAY)).toBe(-2);
    expect(evaluateCalculate('int(2.9)', {}, TODAY)).toBe(2);
  });

  it('review fix M2 — a non-finite result is incomputable (not a forged number)', () => {
    // div-by-zero → Infinity, 0 div 0 → NaN: neither is a usable computed value,
    // so they must surface as undefined rather than being persisted / gating.
    expect(evaluateCalculate('5 div 0', {}, TODAY)).toBeUndefined();
    expect(evaluateCalculate('0 div 0', {}, TODAY)).toBeUndefined();
    expect(evaluateCalculate('int(5 div 0)', {}, TODAY)).toBeUndefined();
  });
});

describe('evaluateCalculate — unsupported syntax rejection (AC1.1)', () => {
  it('rejects an unknown function', () => {
    expect(() => evaluateCalculate('pow(${x}, 2)', { x: 3 }, TODAY)).toThrow(
      UnsupportedCalculateError,
    );
  });

  it('rejects an unknown bare identifier', () => {
    expect(() => evaluateCalculate('${x} + now', { x: 3 }, TODAY)).toThrow(
      UnsupportedCalculateError,
    );
  });

  it('rejects an unexpected character', () => {
    expect(() => evaluateCalculate('${x} & 2', { x: 3 }, TODAY)).toThrow(
      UnsupportedCalculateError,
    );
  });

  it('rejects an unterminated ${ reference', () => {
    expect(() => evaluateCalculate('${x + 2', { x: 3 }, TODAY)).toThrow(
      UnsupportedCalculateError,
    );
  });

  it('rejects mismatched parentheses', () => {
    expect(() => evaluateCalculate('int(2 + 3', {}, TODAY)).toThrow(UnsupportedCalculateError);
  });

  it('never uses eval/Function — division is `div`, not `/`', () => {
    expect(() => evaluateCalculate('10 / 2', {}, TODAY)).toThrow(UnsupportedCalculateError);
  });
});

describe('evaluateCalculations — ordered batch', () => {
  const calcs: Calculation[] = [
    { name: 'age', expression: AGE_EXPR },
    { name: 'age_x2', expression: '${age} * 2' },
  ];

  it('evaluates in order; later calc references earlier one', () => {
    const out = evaluateCalculations(calcs, { dob: '1984-06-06' }, TODAY);
    expect(out).toEqual({ age: 42, age_x2: 84 });
  });

  it('omits calcs that are not yet computable', () => {
    const out = evaluateCalculations(calcs, {}, TODAY);
    expect(out).toEqual({});
  });

  it('skips an unsupported calc and reports it, without blanking the others', () => {
    const onUnsupported = vi.fn();
    const mixed: Calculation[] = [
      { name: 'bad', expression: 'pow(2,3)' },
      { name: 'age', expression: AGE_EXPR },
    ];
    const out = evaluateCalculations(mixed, { dob: '1984-06-06' }, TODAY, { onUnsupported });
    expect(out).toEqual({ age: 42 });
    expect(onUnsupported).toHaveBeenCalledOnce();
    expect(onUnsupported.mock.calls[0][0]).toEqual(mixed[0]);
    expect(onUnsupported.mock.calls[0][1]).toBeInstanceOf(UnsupportedCalculateError);
  });

  it('returns {} for an undefined/empty calculation list', () => {
    expect(evaluateCalculations(undefined, { dob: '1984-06-06' }, TODAY)).toEqual({});
    expect(evaluateCalculations([], { dob: '1984-06-06' }, TODAY)).toEqual({});
  });
});

describe('withCalculatedFields', () => {
  it('merges computed values into the answer map (does not mutate input)', () => {
    const input = { dob: '1984-06-06' };
    const merged = withCalculatedFields(input, [{ name: 'age', expression: AGE_EXPR }], TODAY);
    expect(merged).toEqual({ dob: '1984-06-06', age: 42 });
    expect(input).toEqual({ dob: '1984-06-06' }); // unchanged
  });
});

import { describe, it, expect } from 'vitest';
import {
  parseStepParam,
  clampToReached,
  advanceStep,
  retreatStep,
} from '../wizard-navigation';

describe('wizard-navigation — parseStepParam', () => {
  it('returns null when the param is absent', () => {
    expect(parseStepParam(null, 5)).toBeNull();
  });

  it('returns null for non-numeric values', () => {
    expect(parseStepParam('abc', 5)).toBeNull();
    expect(parseStepParam('NaN', 5)).toBeNull();
  });

  it('treats an empty `?step=` value as step 0 (matches pre-9-57 behaviour)', () => {
    // `Number('')` is 0 — an empty param resolves to the first step, not null.
    expect(parseStepParam('', 5)).toBe(0);
  });

  it('parses a valid in-range index', () => {
    expect(parseStepParam('2', 5)).toBe(2);
    expect(parseStepParam('0', 5)).toBe(0);
  });

  it('clamps above the last step to stepCount-1', () => {
    expect(parseStepParam('99', 5)).toBe(4);
  });

  it('clamps below zero to 0', () => {
    expect(parseStepParam('-3', 5)).toBe(0);
  });

  it('floors fractional values', () => {
    expect(parseStepParam('2.9', 5)).toBe(2);
  });

  it('never returns a negative index for a zero-length step list', () => {
    expect(parseStepParam('3', 0)).toBe(0);
  });
});

describe('wizard-navigation — clampToReached (9-54 AC6.1)', () => {
  it('clamps a deep-link beyond the furthest-reached step back to it', () => {
    expect(clampToReached(4, 1)).toBe(1);
  });

  it('honours a step within the reached range', () => {
    expect(clampToReached(1, 3)).toBe(1);
  });

  it('resolves a null (no ?step) to step 0', () => {
    expect(clampToReached(null, 3)).toBe(0);
  });

  it('never returns negative', () => {
    expect(clampToReached(-2, 3)).toBe(0);
  });
});

describe('wizard-navigation — advanceStep (9-18 AC#E5)', () => {
  const never = () => false;

  it('advances by one when nothing is skippable', () => {
    expect(advanceStep(0, 5, never)).toBe(1);
  });

  it('auto-skips a fully-hidden section step', () => {
    // step 2 is skippable → from 1 we land on 3.
    const isSkippable = (idx: number) => idx === 2;
    expect(advanceStep(1, 5, isSkippable)).toBe(3);
  });

  it('never skips the final Review step', () => {
    // Review = index 4; even if it "were" skippable it must not be skipped.
    const isSkippable = (idx: number) => idx >= 3;
    expect(advanceStep(2, 5, isSkippable)).toBe(4);
  });

  it('does not advance past the last step', () => {
    expect(advanceStep(4, 5, never)).toBe(4);
  });
});

describe('wizard-navigation — retreatStep (9-18 AC#E5)', () => {
  const never = () => false;

  it('retreats by one when nothing is skippable', () => {
    expect(retreatStep(2, never)).toBe(1);
  });

  it('auto-skips a fully-hidden section step on the way back', () => {
    const isSkippable = (idx: number) => idx === 2;
    expect(retreatStep(3, isSkippable)).toBe(1);
  });

  it('never retreats below step 0', () => {
    expect(retreatStep(0, never)).toBe(0);
    expect(retreatStep(1, () => true)).toBe(0);
  });
});

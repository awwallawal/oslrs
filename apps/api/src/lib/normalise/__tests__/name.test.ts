import { describe, it, expect } from 'vitest';
import { normaliseFullName } from '../name.js';

describe('normaliseFullName', () => {
  it('title-cases a lowercase name', () => {
    const result = normaliseFullName('john doe');
    expect(result.value).toBe('John Doe');
    expect(result.warnings).toEqual([]);
  });

  it('preserves compound surnames separated by hyphens', () => {
    const result = normaliseFullName('jean-baptiste adeyemi-bolade');
    expect(result.value).toBe('Jean-Baptiste Adeyemi-Bolade');
    expect(result.warnings).toEqual([]);
  });

  it('collapses internal whitespace', () => {
    const result = normaliseFullName('  john     doe   ');
    expect(result.value).toBe('John Doe');
    expect(result.warnings).toEqual([]);
  });

  it('warns when input is all-caps', () => {
    const result = normaliseFullName('JOHN DOE');
    expect(result.value).toBe('John Doe');
    expect(result.warnings).toContain('all_caps');
  });

  it('warns when input is a single word (likely missing surname)', () => {
    const result = normaliseFullName('Awwal');
    expect(result.value).toBe('Awwal');
    expect(result.warnings).toContain('single_word');
  });

  it('emits both all_caps and single_word when applicable', () => {
    const result = normaliseFullName('AWWAL');
    expect(result.warnings).toEqual(expect.arrayContaining(['all_caps', 'single_word']));
  });

  it('handles names with multiple spaces between words', () => {
    expect(normaliseFullName('AWWAL  ADEYEMI').value).toBe('Awwal Adeyemi');
  });

  it('does not warn all_caps for inputs lacking ≥3 letter run (e.g. initials only)', () => {
    // "A B" has no 3-letter run, so all_caps does not fire even though it is upper-case.
    const result = normaliseFullName('A B');
    expect(result.warnings).not.toContain('all_caps');
  });

  it('returns empty_input for empty / whitespace / non-string', () => {
    expect(normaliseFullName('').warnings).toEqual(['empty_input']);
    expect(normaliseFullName('   ').warnings).toEqual(['empty_input']);
    expect(normaliseFullName(null).warnings).toEqual(['empty_input']);
    expect(normaliseFullName(undefined).warnings).toEqual(['empty_input']);
  });
});

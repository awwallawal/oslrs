import { describe, it, expect } from 'vitest';
import { normaliseTrade } from '../trade.js';

describe('normaliseTrade', () => {
  it('maps known canonical synonyms (case-insensitive)', () => {
    expect(normaliseTrade('plumber').value).toBe('Plumber');
    expect(normaliseTrade('Plumbing').value).toBe('Plumber');
    expect(normaliseTrade('PLUMBING SERVICES').value).toBe('Plumber');
  });

  it('produces no warning for a mapped trade', () => {
    expect(normaliseTrade('electrician').warnings).toEqual([]);
  });

  it('preserves a trimmed unknown trade with [unmapped] warning', () => {
    const result = normaliseTrade('  Drone Repair  ');
    expect(result.value).toBe('Drone Repair');
    expect(result.warnings).toEqual(['[unmapped]']);
  });

  it('handles common Nigerian artisan synonyms', () => {
    expect(normaliseTrade('bricklayer').value).toBe('Mason');
    expect(normaliseTrade('barbing salon').value).toBe('Barber');
    expect(normaliseTrade('fashion designer').value).toBe('Tailor');
    expect(normaliseTrade('pop').value).toBe('Plasterer');
  });

  it('collapses internal whitespace before lookup', () => {
    expect(normaliseTrade('plumbing   services').value).toBe('Plumber');
  });

  it('returns empty_input for empty / whitespace / non-string', () => {
    expect(normaliseTrade('').warnings).toEqual(['empty_input']);
    expect(normaliseTrade('   ').warnings).toEqual(['empty_input']);
    expect(normaliseTrade(null).warnings).toEqual(['empty_input']);
    expect(normaliseTrade(undefined).warnings).toEqual(['empty_input']);
  });
});

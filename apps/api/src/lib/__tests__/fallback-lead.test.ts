import { describe, it, expect } from 'vitest';
import { normalizeFallbackLead, normalizePhoneNg } from '../fallback-lead.js';

const AT = '2026-06-27T10:00:00.000Z';

describe('normalizePhoneNg (Story 13-3)', () => {
  it.each([
    ['08031234567', '+2348031234567'],
    ['8031234567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
    ['+2348031234567', '+2348031234567'],
    ['0803 123 4567', '+2348031234567'],
  ])('normalises %s → %s', (raw, expected) => {
    expect(normalizePhoneNg(raw)).toBe(expected);
  });

  it.each(['', '123', '0123456789', '+15551234567', '0601234567'])('rejects %s', (raw) => {
    expect(normalizePhoneNg(raw)).toBeNull();
  });
});

describe('normalizeFallbackLead (Story 13-3 AC2/AC3)', () => {
  it('builds the canonical lead from a valid callback submission', () => {
    const r = normalizeFallbackLead({ fullName: '  Bunmi Adeleke ', phone: '08031234567', lgaCode: 'Egbeda' }, AT);
    expect(r).toEqual({
      ok: true,
      lead: { fullName: 'Bunmi Adeleke', phone: '+2348031234567', lgaCode: 'Egbeda', channel: 'static_fallback', capturedAt: AT },
    });
  });

  it('rejects with field-level reasons when name/phone/LGA are missing or bad', () => {
    const r = normalizeFallbackLead({ fullName: 'A', phone: 'nope', lgaCode: '' }, AT);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain('name is required');
      expect(r.errors).toContain('a valid Nigerian phone number is required');
      expect(r.errors).toContain('LGA is required');
    }
  });

  it('is total — non-string inputs do not crash, they fail validation', () => {
    const r = normalizeFallbackLead({ fullName: 123, phone: null, lgaCode: undefined }, AT);
    expect(r.ok).toBe(false);
  });

  it('caps an over-long name (no edge-store bloat)', () => {
    const r = normalizeFallbackLead({ fullName: 'x'.repeat(500), phone: '08031234567', lgaCode: 'Ido' }, AT);
    expect(r.ok && r.lead.fullName.length).toBe(120);
  });
});

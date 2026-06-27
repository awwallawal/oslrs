import { describe, it, expect } from 'vitest';
import { normalizeFallbackLead, normalizePhoneNg, isValidEmail } from '../fallback-lead.js';

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

describe('isValidEmail (Story 13-3)', () => {
  it.each(['a@b.co', 'bunmi.adeleke@example.com', 'x_y+z@sub.domain.ng'])('accepts %s', (e) =>
    expect(isValidEmail(e)).toBe(true),
  );
  it.each(['', 'nope', 'a@b', 'a@b.', '@b.co', 'a b@c.co', 'a@ b.co'])('rejects %s', (e) =>
    expect(isValidEmail(e)).toBe(false),
  );
});

describe('normalizeFallbackLead — email-first (Story 13-3 AC2/AC3)', () => {
  it('builds the lead from name + email + LGA (phone omitted → null)', () => {
    const r = normalizeFallbackLead({ fullName: '  Bunmi Adeleke ', email: 'Bunmi@Example.COM', lgaCode: 'Egbeda' }, AT);
    expect(r).toEqual({
      ok: true,
      lead: { fullName: 'Bunmi Adeleke', email: 'bunmi@example.com', phone: null, lgaCode: 'Egbeda', channel: 'static_fallback', capturedAt: AT },
    });
  });

  it('keeps an OPTIONAL phone when given, normalised to +234', () => {
    const r = normalizeFallbackLead({ fullName: 'Kayode O', email: 'k@x.com', phone: '08031234567', lgaCode: 'Ido' }, AT);
    expect(r.ok && r.lead.phone).toBe('+2348031234567');
  });

  it('EMAIL is required — missing/invalid email fails even with everything else present', () => {
    const r = normalizeFallbackLead({ fullName: 'Test User', email: 'not-an-email', lgaCode: 'Ido' }, AT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain('a valid email is required');
  });

  it('a SUPPLIED but invalid phone fails; an OMITTED phone does not', () => {
    const bad = normalizeFallbackLead({ fullName: 'Test User', email: 'k@x.com', phone: '12345', lgaCode: 'Ido' }, AT);
    expect(bad.ok).toBe(false);
    const omitted = normalizeFallbackLead({ fullName: 'Test User', email: 'k@x.com', lgaCode: 'Ido' }, AT);
    expect(omitted.ok).toBe(true);
  });

  it('accumulates field-level reasons for name/email/LGA', () => {
    const r = normalizeFallbackLead({ fullName: 'A', email: '', lgaCode: '' }, AT);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual(expect.arrayContaining(['name is required', 'a valid email is required', 'LGA is required']));
    }
  });

  it('is total — non-string inputs do not crash, they fail validation', () => {
    const r = normalizeFallbackLead({ fullName: 123, email: null, phone: {}, lgaCode: undefined }, AT);
    expect(r.ok).toBe(false);
  });
});

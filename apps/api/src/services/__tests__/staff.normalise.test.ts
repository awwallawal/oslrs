import { describe, it, expect } from 'vitest';
import { StaffService } from '../staff.service.js';

// `normaliseStaffPii` is a private static helper. We exercise it via the
// type-erasure escape hatch so we can unit-test the canonicalisation logic
// without standing up the full createManual transactional mock surface.
const normaliseStaffPii = (
  StaffService as unknown as {
    normaliseStaffPii: (input: { fullName: string; email: string; phone: string }) => {
      fullName: string;
      email: string;
      phone: string;
    };
  }
).normaliseStaffPii.bind(StaffService);

describe('StaffService.normaliseStaffPii (Bulk CSV Import + Manual Single-User wiring)', () => {
  it('canonicalises full name to title case', () => {
    expect(
      normaliseStaffPii({ fullName: 'JOHN DOE', email: 'a@b.com', phone: '+2348012345678' })
        .fullName,
    ).toBe('John Doe');
  });

  it('canonicalises email to lowercase + trimmed', () => {
    expect(
      normaliseStaffPii({ fullName: 'John Doe', email: '  Foo@Bar.COM  ', phone: '+2348012345678' })
        .email,
    ).toBe('foo@bar.com');
  });

  it('canonicalises Nigerian phone to E.164', () => {
    expect(
      normaliseStaffPii({ fullName: 'John Doe', email: 'a@b.com', phone: '08012345678' })
        .phone,
    ).toBe('+2348012345678');
  });

  it('strips cosmetic spaces / dashes / parens from phone', () => {
    expect(
      normaliseStaffPii({ fullName: 'John Doe', email: 'a@b.com', phone: '(0) 801-234-5678' })
        .phone,
    ).toBe('+2348012345678');
  });

  it('preserves original input when the normaliser returns empty (degraded mode)', () => {
    // Empty string normaliser output → fall back to original (so downstream
    // zod validation can produce a meaningful error message).
    const r = normaliseStaffPii({ fullName: '   ', email: 'a@b.com', phone: '+2348012345678' });
    expect(r.fullName).toBe('   ');
  });

  it('preserves compound surname during title-casing', () => {
    expect(
      normaliseStaffPii({
        fullName: 'jean-baptiste adeyemi-bolade',
        email: 'a@b.com',
        phone: '+2348012345678',
      }).fullName,
    ).toBe('Jean-Baptiste Adeyemi-Bolade');
  });
});

import { describe, it, expect } from 'vitest';
import { buildParsedRow } from '../normalise-row.js';
import type { ColumnMapping } from '../parsers/types.js';

const MAPPING: ColumnMapping = {
  'ADM NO': 'externalReferenceId',
  Name: 'fullName',
  Trade: 'profession',
  Phone: 'phoneNumber',
  Email: 'email',
  DOB: 'dateOfBirth',
  NIN: 'nin',
  LGA: 'lgaId',
  Unmapped: 'gender', // present to prove mapping is honoured
};

describe('buildParsedRow', () => {
  it('routes each mapped field through the right normaliser', () => {
    const row = buildParsedRow(
      0,
      {
        'ADM NO': 'A-100',
        Name: 'ADA OBI',
        Trade: 'plumbing',
        Phone: '08012345678',
        Email: 'ADA@Example.COM',
        DOB: '05/03/1990',
        NIN: '123 4567 8901',
        LGA: 'Ona Ara',
      },
      MAPPING,
    );

    expect(row.canonical.externalReferenceId).toBe('A-100');
    expect(row.canonical.fullName).toBe('Ada Obi');
    expect(row.canonical.profession).toBe('Plumber'); // trade vocab
    expect(row.canonical.phoneNumber).toBe('+2348012345678');
    expect(row.canonical.email).toBe('ada@example.com');
    expect(row.canonical.dateOfBirth).toBe('1990-03-05'); // DMY -> ISO
    expect(row.canonical.nin).toBe('12345678901'); // digits only
    expect(row.canonical.lgaId).toBe('Ona Ara'); // stored verbatim (service resolves)
  });

  it('prefixes normalisation warnings with the field name', () => {
    const row = buildParsedRow(0, { Phone: '12345' }, MAPPING);
    expect(row.warnings.some((w) => w.startsWith('phoneNumber:'))).toBe(true);
  });

  it('ignores unmapped headers but preserves them in raw', () => {
    const row = buildParsedRow(0, { Phone: '08012345678', Nonsense: 'x' }, MAPPING);
    expect(row.canonical.gender).toBeUndefined();
    expect(row.raw.Nonsense).toBe('x');
  });

  it('skips empty cells (no canonical value, no crash)', () => {
    const row = buildParsedRow(0, { Phone: '08012345678', Trade: '', Email: '   ' }, MAPPING);
    expect(row.canonical.profession).toBeUndefined();
    expect(row.canonical.email).toBeUndefined();
  });

  it('flags an all-caps single-name for review (fullName)', () => {
    const row = buildParsedRow(0, { Name: 'ADEWALE' }, MAPPING);
    expect(row.warnings).toContain('fullName:all_caps');
  });
});

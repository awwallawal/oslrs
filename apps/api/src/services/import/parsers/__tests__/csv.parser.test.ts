import { describe, it, expect } from 'vitest';
import { parseCsv } from '../csv.parser.js';
import type { ColumnMapping } from '../types.js';

const MAPPING: ColumnMapping = {
  Name: 'fullName',
  Trade: 'profession',
  LGA: 'lgaId',
  Phone: 'phoneNumber',
  Email: 'email',
};

describe('parseCsv', () => {
  it('parses header-keyed rows, skips blank rows, normalises fields', async () => {
    const csv = [
      'Name,Trade,LGA,Phone,Email',
      'Ada Obi,Tiling,Ona Ara,08012345678,ADA@Example.com',
      ',,,,',
      'Bola Ade,Welding,Egbeda,07098765432,bola@x.com',
    ].join('\n');

    const result = await parseCsv({ buffer: Buffer.from(csv, 'utf8'), columnMapping: MAPPING });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].canonical).toMatchObject({
      fullName: 'Ada Obi',
      phoneNumber: '+2348012345678',
      email: 'ada@example.com',
    });
    expect(result.rows[1].canonical.phoneNumber).toBe('+2347098765432'); // 07098765432 -> +2347098765432
    expect(result.detectedColumns).toEqual(MAPPING);
  });

  it('strips a UTF-8 BOM from the first header', async () => {
    const csv = '﻿Name,Phone\nAda,08012345678';
    const result = await parseCsv({ buffer: Buffer.from(csv, 'utf8'), columnMapping: MAPPING });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].canonical.fullName).toBe('Ada');
  });

  it('tolerates ragged column counts (relax_column_count)', async () => {
    const csv = 'Name,Phone,Extra\nAda,08012345678'; // short row
    const result = await parseCsv({ buffer: Buffer.from(csv, 'utf8'), columnMapping: { Name: 'fullName', Phone: 'phoneNumber' } });
    expect(result.rows).toHaveLength(1);
  });

  it('preserves Unicode content', async () => {
    const csv = 'Name,Phone\nAdébáyọ̀,08012345678';
    const result = await parseCsv({ buffer: Buffer.from(csv, 'utf8'), columnMapping: { Name: 'fullName', Phone: 'phoneNumber' } });
    expect(result.rows[0].raw.Name).toContain('Adébáyọ̀');
  });

  it('refuses a file exceeding the row cap BEFORE parsing (M1)', async () => {
    // header + 3 data rows; maxRows=2 → over the (2+1) line threshold.
    const csv = 'Name,Phone\nA,08010000001\nB,08010000002\nC,08010000003';
    await expect(
      parseCsv({ buffer: Buffer.from(csv, 'utf8'), columnMapping: { Name: 'fullName', Phone: 'phoneNumber' }, maxRows: 2 }),
    ).rejects.toMatchObject({ code: 'PARSE_LIMIT_EXCEEDED' });
  });
});

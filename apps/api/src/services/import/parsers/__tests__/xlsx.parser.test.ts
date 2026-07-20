import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseXlsx } from '../xlsx.parser.js';
import type { ColumnMapping } from '../types.js';

const MAPPING: ColumnMapping = {
  Name: 'fullName',
  Trade: 'profession',
  LGA: 'lgaId',
  Phone: 'phoneNumber',
};

async function buildWorkbook(rows: Array<Record<string, string>>, headers: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Members');
  ws.addRow(headers);
  for (const r of rows) ws.addRow(headers.map((h) => r[h] ?? ''));
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('parseXlsx', () => {
  it('reads the first sheet, header-keys the rows, normalises fields', async () => {
    const buffer = await buildWorkbook(
      [
        { Name: 'Ada Obi', Trade: 'Tiling', LGA: 'Ona Ara', Phone: '08012345678' },
        { Name: 'Bola Ade', Trade: 'Welding', LGA: 'Egbeda', Phone: '07098765432' },
      ],
      ['Name', 'Trade', 'LGA', 'Phone'],
    );

    const result = await parseXlsx({ buffer, columnMapping: MAPPING });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].canonical).toMatchObject({ fullName: 'Ada Obi', phoneNumber: '+2348012345678' });
    expect(result.rows[0].rowIndex).toBe(0);
  });

  it('skips fully-blank rows', async () => {
    const buffer = await buildWorkbook(
      [
        { Name: 'Ada', Trade: 'Tiling', LGA: 'Ona Ara', Phone: '08012345678' },
        { Name: '', Trade: '', LGA: '', Phone: '' },
        { Name: 'Bola', Trade: 'Welding', LGA: 'Egbeda', Phone: '07098765432' },
      ],
      ['Name', 'Trade', 'LGA', 'Phone'],
    );
    const result = await parseXlsx({ buffer, columnMapping: MAPPING });
    expect(result.rows).toHaveLength(2);
  });

  it('preserves Unicode', async () => {
    const buffer = await buildWorkbook([{ Name: 'Adébáyọ̀', Phone: '08012345678' }], ['Name', 'Phone']);
    const result = await parseXlsx({ buffer, columnMapping: { Name: 'fullName', Phone: 'phoneNumber' } });
    expect(result.rows[0].raw.Name).toContain('Adébáyọ̀');
  });
});

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { parsePdfTabular } from '../pdf-tabular.parser.js';
import { getImportSourceConfig } from '../../../../config/import-sources.js';
import type { ColumnMapping } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/test-fixtures/itf-supa-sample.pdf (real PII → gitignored; present
// locally, absent in CI, so this test skips cleanly there).
const ITF_FIXTURE = path.resolve(__dirname, '../../../../../test-fixtures/itf-supa-sample.pdf');
const hasItfFixture = existsSync(ITF_FIXTURE);

/**
 * End-to-end PDF parse WITHOUT the (Awwal-supplied) ITF-SUPA fixture: we
 * generate a small tabular PDF with pdfkit, then round-trip it through the real
 * pdfjs extractor + the layout heuristics. This proves the pdfjs I/O adapter
 * works in Node and that positioned text reconstructs into rows. The ITF-SUPA
 * reference fixture (`test-fixtures/itf-supa-sample.pdf`) is added by the
 * operator for a production-format regression; this synthetic test guards the
 * mechanism today.
 */

const COLS = { name: 40, trade: 220, phone: 400 };

function buildTabularPdf(withTitleRows = false): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(11);
    const put = (text: string, x: number, y: number) => doc.text(text, x, y, { lineBreak: false });

    let y = 100;
    if (withTitleRows) {
      // Mimic the real ITF-SUPA register: two full-width title rows precede the
      // column header, which breaks a naive "first row = header" assumption and
      // is exactly what `findHeaderRowIndex` exists to handle.
      put('INDUSTRIAL TRAINING FUND', COLS.name, 40);
      put('OYO STATE SHORTLISTED ARTISANS', COLS.name, 70);
    }
    // header
    put('Name', COLS.name, y);
    put('Trade', COLS.trade, y);
    put('Phone', COLS.phone, y);
    // data rows (distinct y per row)
    y += 30;
    put('Ada Obi', COLS.name, y);
    put('Tiling', COLS.trade, y);
    put('08012345678', COLS.phone, y);

    y += 30;
    put('Bola Ade', COLS.name, y);
    put('Welding', COLS.trade, y);
    put('07098765432', COLS.phone, y);

    doc.end();
  });
}

const MAPPING: ColumnMapping = {
  Name: 'fullName',
  Trade: 'profession',
  Phone: 'phoneNumber',
};

describe('parsePdfTabular (real pdfjs round-trip)', () => {
  it('extracts a header + data rows from a generated tabular PDF', async () => {
    const buffer = await buildTabularPdf();
    const result = await parsePdfTabular({ buffer, columnMapping: MAPPING });

    expect(result.rows.length).toBe(2);
    const names = result.rows.map((r) => r.canonical.fullName);
    expect(names).toContain('Ada Obi');
    expect(names).toContain('Bola Ade');

    const ada = result.rows.find((r) => r.canonical.fullName === 'Ada Obi')!;
    expect(ada.canonical.phoneNumber).toBe('+2348012345678');
    expect(ada.canonical.profession).toBe('Tiler'); // 'Tiling' -> canonical trade
  }, 20000);

  // Code-review M3: exercise the real-format quirk (title rows above the header)
  // in CI, since the actual ITF PII fixture is gitignored. Proves header
  // auto-detection skips the title rows and still yields exactly the data rows.
  it('auto-detects the header below leading title rows (ITF-SUPA shape)', async () => {
    const buffer = await buildTabularPdf(true);
    const result = await parsePdfTabular({ buffer, columnMapping: MAPPING });

    expect(result.rows.length).toBe(2); // title rows are NOT emitted as data
    const names = result.rows.map((r) => r.canonical.fullName);
    expect(names).toContain('Ada Obi');
    expect(names).toContain('Bola Ade');
    expect(names).not.toContain('INDUSTRIAL TRAINING FUND');
  }, 20000);

  // Real ITF-SUPA register regression. Skips in CI (fixture is gitignored PII).
  // Proves header auto-detection (skipping the 2 title rows) + clean extraction
  // of the well-separated E-MAIL / LGA / TRADE columns on a 3,600+ row file.
  // NOTE: this shortlist PDF has REDACTED phone numbers, so it is not itself
  // import-viable (phone is the mandatory key) — this only exercises the parser.
  it.skipIf(!hasItfFixture)('extracts the real ITF-SUPA register (header below title rows)', async () => {
    const buffer = readFileSync(ITF_FIXTURE);
    const config = getImportSourceConfig('imported_itf_supa')!;
    const result = await parsePdfTabular({ buffer, columnMapping: config.columnMapping });

    expect(result.rows.length).toBeGreaterThan(3000);

    // E-MAIL is a cleanly-separated column → most rows carry a real address.
    const withEmail = result.rows.filter((r) => (r.canonical.email ?? '').includes('@'));
    expect(withEmail.length).toBeGreaterThan(3000);

    // Many distinct LGAs (LGA OF RESIDENCE is cleanly separated too).
    const lgas = new Set(result.rows.map((r) => r.canonical.lgaId).filter(Boolean));
    expect(lgas.size).toBeGreaterThan(5);
  }, 60000);
});

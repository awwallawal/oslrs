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

// Column x-centres for a synthetic replica of the real ITF-SUPA register layout.
// Spaced so the long header labels ('LGA OF RESIDENCE', 'PHONE NUMBER') never
// overlap in x — an overlap merges header items and mis-detects the header row.
const ITF_COLS = { sn: 24, adm: 62, name: 140, email: 250, phone: 352, lga: 432, trade: 520 };
const ITF_LGAS = ['Egbeda', 'Oluyole', 'Lagelu', 'Akinyele'];
const ITF_TRADES = ['Tiling', 'Welding', 'Plumbing', 'Carpentry'];

/**
 * Generate a PDF that faithfully replicates the real ITF-SUPA register FORMAT
 * with FABRICATED data (so it is committable — no real PII, unlike the gitignored
 * production fixture). Reproduces the known quirks: two title/preamble rows above
 * the header, the real 6-column header (`ADM NO / FULL NAME / E-MAIL /
 * PHONE NUMBER / LGA OF RESIDENCE / TRADE AREAS`) repeated on every page,
 * multi-page continuation, and per-page footer noise. Closes code-review M3:
 * the riskiest parser now exercises the production column-set + layout in CI
 * (single-word LGAs keep column assignment unambiguous; the two-word-LGA density
 * pathology is a documented pdf-layout limitation covered elsewhere).
 */
function buildItfFormatPdf(pages: number, rowsPerPage: number): Promise<{ buffer: Buffer; total: number }> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 24, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), total: pages * rowsPerPage }));
    doc.on('error', reject);

    doc.fontSize(7);
    const put = (t: string, x: number, y: number) => doc.text(t, x, y, { lineBreak: false });
    const header = (y: number) => {
      put('S/N', ITF_COLS.sn, y);
      put('ADM NO', ITF_COLS.adm, y);
      put('FULL NAME', ITF_COLS.name, y);
      put('E-MAIL', ITF_COLS.email, y);
      put('PHONE NUMBER', ITF_COLS.phone, y);
      put('LGA OF RESIDENCE', ITF_COLS.lga, y);
      put('TRADE AREAS', ITF_COLS.trade, y);
    };

    let n = 0;
    for (let p = 0; p < pages; p++) {
      if (p > 0) doc.addPage();
      let y = 40;
      if (p === 0) {
        put('INDUSTRIAL TRAINING FUND', ITF_COLS.sn, y);
        y += 16;
        put('OYO STATE SUPA - SHORTLISTED ARTISANS (SYNTHETIC TEST DATA)', ITF_COLS.sn, y);
        y += 22;
      }
      header(y);
      y += 16;
      for (let r = 0; r < rowsPerPage; r++) {
        const idx = n + 1;
        put(String(idx), ITF_COLS.sn, y);
        put(`OY${String(idx).padStart(4, '0')}`, ITF_COLS.adm, y);
        put(`Artisan${idx} Surname${idx}`, ITF_COLS.name, y);
        put(`artisan${idx}@example.test`, ITF_COLS.email, y);
        put(`0803${String(1000000 + idx).padStart(7, '0')}`, ITF_COLS.phone, y);
        put(ITF_LGAS[idx % ITF_LGAS.length], ITF_COLS.lga, y);
        put(ITF_TRADES[idx % ITF_TRADES.length], ITF_COLS.trade, y);
        y += 14;
        n++;
      }
      put(`Page ${p + 1} of ${pages}`, ITF_COLS.sn, 800); // footer noise
    }
    doc.end();
  });
}

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

  // Code-review M1: the async pdf parser must ACTIVELY cancel (tear down pdfjs)
  // once its deadline passes, not merely have the caller stop waiting.
  it('actively cancels a PDF parse once the deadline has passed (M1)', async () => {
    const buffer = await buildTabularPdf();
    await expect(
      parsePdfTabular({ buffer, columnMapping: MAPPING, deadlineAt: Date.now() - 1 }),
    ).rejects.toMatchObject({ code: 'PARSE_DEADLINE_EXCEEDED' });
  }, 20000);

  // Code-review M3: full production-format coverage in CI (no PII fixture needed).
  // Multi-page ITF-SUPA layout with title rows, repeated per-page headers, footer
  // noise, and the real 6-column mapping — all fabricated data.
  it('extracts a multi-page ITF-SUPA-format register via the real column mapping (M3)', async () => {
    const { buffer, total } = await buildItfFormatPdf(3, 12); // 36 fabricated artisans
    const config = getImportSourceConfig('imported_itf_supa')!;
    const result = await parsePdfTabular({ buffer, columnMapping: config.columnMapping });

    // Every artisan row across all 3 pages is extracted; title rows, the repeated
    // per-page headers, and footers are all excluded from the data.
    const withEmail = result.rows.filter((r) => (r.canonical.email ?? '').includes('@'));
    expect(withEmail.length).toBe(total);

    const first = withEmail.find((r) => r.canonical.externalReferenceId === 'OY0001');
    expect(first).toBeTruthy();
    expect(first!.canonical.email).toBe('artisan1@example.test');
    expect(first!.canonical.phoneNumber).toMatch(/^\+234\d{10}$/);
    expect(first!.canonical.lgaId).toBeTruthy(); // LGA OF RESIDENCE mapped
    expect(first!.canonical.profession).toBeTruthy(); // TRADE AREAS mapped

    // Title/preamble text must never leak in as a data row.
    const leaked = result.rows.some((r) => Object.values(r.raw).join(' ').includes('INDUSTRIAL TRAINING FUND'));
    expect(leaked).toBe(false);
  }, 30000);

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

/**
 * PDF tabular parser (Story 11-2) — thin pdfjs adapter over `pdf-layout.ts`.
 *
 * Extracts positioned text runs from every page via `pdfjs-dist` (legacy Node
 * build, main-thread — no worker), reconstructs a table with the pure layout
 * heuristics, then normalises each record through the shared row builder.
 *
 * The riskiest parser (story Risk #1). All the fragile logic lives in the pure,
 * exhaustively-tested `pdf-layout.ts`; this file only does I/O + glue, so a
 * format change is diagnosed + fixed against the layout unit tests without a
 * live PDF round-trip.
 */

import { buildParsedRow } from '../normalise-row.js';
import { tableFromItems, type PdfTextItem } from './pdf-layout.js';
import type { ParseResult, ParserInput, ParsedRow, ParseFailure } from './types.js';

/** Extract positioned text items from a PDF buffer using pdfjs (Node, no worker). */
export async function extractPdfItems(buffer: Buffer): Promise<PdfTextItem[]> {
  // Dynamic import: pdfjs is ESM-only and heavy; load lazily so it never taxes
  // startup for deploys that don't import PDFs. The legacy build runs on the
  // main thread in Node (no worker file to configure).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Node-safe: don't fetch remote fonts (main-thread, no worker).
    useSystemFonts: true,
  });

  const doc = await loadingTask.promise;
  const items: PdfTextItem[] = [];

  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      for (const item of content.items) {
        // TextItem has `str` + `transform`; TextMarkedContent does not.
        if (!('str' in item)) continue;
        const str = item.str;
        if (str.trim() === '') continue;
        const transform = item.transform as number[];
        items.push({ str, x: transform[4], y: transform[5], page: pageNum });
      }
      page.cleanup();
    }
  } finally {
    // Destroying the loading task tears down the document + its worker port.
    await loadingTask.destroy();
  }

  return items;
}

export async function parsePdfTabular({ buffer, columnMapping }: ParserInput): Promise<ParseResult> {
  let items: PdfTextItem[];
  try {
    items = await extractPdfItems(buffer);
  } catch (err) {
    throw new Error(`PDF parse failed: ${(err as Error).message}`);
  }

  const { records } = tableFromItems(items);

  const rows: ParsedRow[] = [];
  const failures: ParseFailure[] = [];

  records.forEach((rec, i) => {
    try {
      rows.push(buildParsedRow(i, rec, columnMapping));
    } catch (err) {
      failures.push({ rowIndex: i, reason: (err as Error).message, raw: rec });
    }
  });

  return { rows, failures, detectedColumns: columnMapping };
}

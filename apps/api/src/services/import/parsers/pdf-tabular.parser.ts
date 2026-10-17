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

import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildParsedRow } from '../normalise-row.js';
import {
  MAX_PDF_PAGES,
  assertWithinLimit,
  assertBeforeDeadline,
  ParseLimitExceededError,
  ParseDeadlineExceededError,
} from '../parse-limits.js';
import { tableFromItems, type PdfTextItem } from './pdf-layout.js';
import type { ParseResult, ParserInput, ParsedRow, ParseFailure } from './types.js';

// Resolve the pdfjs-dist asset dirs so Node text extraction can decode standard
// fonts + CMaps. Without these, pdfjs 5.x silently yielded ZERO text for real PDFs
// embedding standard-14 / CID fonts (the ITF-SUPA register). Kept on 6.x (Story
// 13-77, 2026-10-17): with them, 6.4.299 extracts the real register byte-identically
// to 5.6.205 (3,673 rows, matching hashes), and removing them was not tested — do
// not delete them without that comparison. pdfjs's factory validates a URL string
// ending in '/', so use a file:// URL (forward-slashed + trailing slash) which is
// correct on Windows AND Linux.
const requireFromHere = createRequire(import.meta.url);
const PDFJS_DIST_DIR = path.dirname(requireFromHere.resolve('pdfjs-dist/package.json'));
const STANDARD_FONT_DATA_URL = pathToFileURL(path.join(PDFJS_DIST_DIR, 'standard_fonts') + path.sep).href;
const CMAP_URL = pathToFileURL(path.join(PDFJS_DIST_DIR, 'cmaps') + path.sep).href;

/**
 * Extract positioned text items from a PDF buffer using pdfjs (Node, no worker).
 *
 * Bounds the work two ways (code-review M1): a hard page cap, and — because a
 * 4K-row PDF can take 5–15s — an active wall-clock deadline checked between
 * pages. On either breach it throws and the `finally` tears the pdfjs task down
 * via `destroy()`, so the work actually STOPS rather than running on after a
 * caller-side timeout.
 */
export async function extractPdfItems(
  buffer: Buffer,
  opts?: { deadlineAt?: number },
): Promise<PdfTextItem[]> {
  // Dynamic import: pdfjs is ESM-only and heavy; load lazily so it never taxes
  // startup for deploys that don't import PDFs. The legacy build runs on the
  // main thread in Node (no worker file to configure).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    /**
     * 🔒 GHSA-hq66-cqwq-w95j (CVSS 4.0 high) — "Arbitrary JavaScript execution upon opening a
     * malicious PDF". Blocked the prod OSV gate on 2026-08-07 against an UNCHANGED dependency.
     *
     * ⚠️ THE OBVIOUS FIX IS A NO-OP HERE, AND I NEARLY SHIPPED IT. The advisory's workaround is
     * "set `enableScripting` to false" — but in pdfjs 5.x that is **not a `getDocument` option at
     * all**. Every use of it in `pdf.mjs` sits in the ANNOTATION/WIDGET layer (`Action`,
     * `Mouse Up`/`Mouse Down`, datetime widgets), i.e. the browser viewer's interactive rendering.
     * TypeScript rejected the property, which is what prompted reading the library instead of
     * casting past it.
     *
     * **This parser never renders annotations.** It extracts positioned text runs and nothing
     * else — no `getAnnotations`, no `render()`, no annotation layer. The vulnerable code path is
     * unreachable from here, which is why the finding is accepted in `osv-scanner.toml` rather
     * than "mitigated" by a line that does nothing.
     *
     * ✅ FIXED 2026-10-17 (Story 13-77): the upstream fix is `pdfjs-dist@6.2.108`, which needed
     * Node 22 while CI + the VPS ran Node 20. Both are on Node 24 now, pdfjs-dist is 6.4.299, and
     * the osv-scanner.toml waiver is deleted. The analysis above stays as the record of why the
     * waiver was honest while it existed.
     *
     * `isEvalSupported: false` was set here on 5.x as defence in depth: it stopped pdf.js
     * compiling PDF function expressions via `eval`. ⛔ **REMOVED 2026-10-17 because pdfjs 6
     * removed the eval path itself, not because the defence stopped mattering.** In 6.4.299 the
     * option is gone from `DocumentInitParameters` (tsc rejects it), and the legacy main AND
     * worker builds contain zero `isEvalSupported`, zero `new Function(` and zero `eval(`. There
     * is nothing left to switch off. If a future pdfjs reintroduces an eval-based path, the
     * option comes back.
     */
    // Node-safe: don't fetch remote fonts (main-thread, no worker).
    useSystemFonts: true,
    // Local font + CMap data — without these, pdfjs 5.x extracted zero text from real
    // PDFs with standard/CID fonts. Kept on 6.x; see the comment at the top of this file.
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
  });

  const doc = await loadingTask.promise;
  const items: PdfTextItem[] = [];

  try {
    assertWithinLimit(doc.numPages, MAX_PDF_PAGES, 'PDF pages');
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      // Active cancellation: bail (and destroy, via finally) once over deadline.
      assertBeforeDeadline(opts?.deadlineAt, 'PDF extraction');
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

export async function parsePdfTabular({ buffer, columnMapping, deadlineAt }: ParserInput): Promise<ParseResult> {
  let items: PdfTextItem[];
  try {
    items = await extractPdfItems(buffer, { deadlineAt });
  } catch (err) {
    // Preserve the typed bound/deadline errors so the service maps them to the
    // right HTTP status (413 / 408) instead of a generic parse error.
    if (err instanceof ParseLimitExceededError || err instanceof ParseDeadlineExceededError) throw err;
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

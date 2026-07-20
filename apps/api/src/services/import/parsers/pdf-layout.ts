/**
 * PDF tabular layout heuristics (Story 11-2) — PURE, no pdfjs dependency.
 *
 * PDFs have no notion of "table"; they are positioned text runs. This module
 * reconstructs a table from `{ str, x, y, page }` items using two heuristics:
 *
 *   1. **Row clustering** — items whose baseline `y` are within a tolerance (and
 *      on the same page) belong to the same visual row. PDF `y` increases
 *      upward, so rows are ordered page-asc then y-desc (top of page first).
 *   2. **Column assignment** — the first visual row is the header; each header
 *      item defines a column at its `x` centre. Every data-row item is assigned
 *      to the nearest column centre; items landing in the same column are
 *      space-joined.
 *
 * KNOWN LIMITATIONS (documented per story Risk #1 — PDF parser fragility):
 *   - Assumes the first visual row is the header. Repeated per-page headers are
 *     de-duplicated (a data row identical to the header labels is dropped).
 *   - Multi-line cell content splits into adjacent rows (not merged).
 *   - Footer noise misaligned from the columns still gets assigned to the
 *     nearest column; the dry-run preview surfaces such rows for operator review.
 *   - x-centre nearest-match misaligns if a source PDF shifts column positions.
 *
 * These heuristics are tuned for the ITF-SUPA reference PDF. Because they are
 * pure, they are unit-tested exhaustively with synthetic item arrays (no PDF
 * fixture needed), and the pdfjs I/O layer stays a thin adapter.
 */

export interface PdfTextItem {
  str: string;
  /** x of the item's origin (transform[4]). */
  x: number;
  /** baseline y of the item's origin (transform[5]); larger = higher on page. */
  y: number;
  /** 1-based page number. */
  page: number;
}

export interface TableColumn {
  label: string;
  center: number;
}

export interface ExtractedTable {
  headers: string[];
  records: Record<string, string>[];
}

/**
 * Cluster items into visual rows. Items are grouped when on the same page and
 * within `yTolerance` of the row's anchor baseline. Each returned row is sorted
 * left-to-right; rows are ordered top-to-bottom across pages.
 */
export function clusterItemsToRows(items: PdfTextItem[], yTolerance = 3): PdfTextItem[][] {
  if (items.length === 0) return [];

  const sorted = [...items].sort(
    (a, b) => a.page - b.page || b.y - a.y || a.x - b.x,
  );

  const rows: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [];
  let anchorPage = -1;
  let anchorY = Number.POSITIVE_INFINITY;

  for (const it of sorted) {
    if (current.length === 0) {
      current = [it];
      anchorPage = it.page;
      anchorY = it.y;
      continue;
    }
    if (it.page === anchorPage && Math.abs(it.y - anchorY) <= yTolerance) {
      current.push(it);
    } else {
      rows.push(current.sort((a, b) => a.x - b.x));
      current = [it];
      anchorPage = it.page;
      anchorY = it.y;
    }
  }
  if (current.length) rows.push(current.sort((a, b) => a.x - b.x));

  return rows;
}

/** Build column definitions from the header row (one column per header item). */
export function buildColumns(headerRow: PdfTextItem[]): TableColumn[] {
  return headerRow
    .map((it) => ({ label: it.str.trim(), center: it.x }))
    .filter((c) => c.label !== '');
}

/** Assign a data row's items to the nearest column centre; space-join collisions. */
export function rowToRecord(dataRow: PdfTextItem[], columns: TableColumn[]): Record<string, string> {
  const buckets = new Map<string, string[]>();
  for (const col of columns) buckets.set(col.label, []);

  for (const it of dataRow) {
    const text = it.str.trim();
    if (text === '') continue;
    let best: TableColumn | undefined;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const col of columns) {
      const d = Math.abs(it.x - col.center);
      if (d < bestDist) {
        bestDist = d;
        best = col;
      }
    }
    if (best) buckets.get(best.label)!.push(text);
  }

  const rec: Record<string, string> = {};
  for (const col of columns) rec[col.label] = (buckets.get(col.label) ?? []).join(' ').trim();
  return rec;
}

/** True when a data row's assigned cells exactly reproduce the header labels. */
function isRepeatedHeader(rec: Record<string, string>, headers: string[]): boolean {
  return headers.every((h) => rec[h] === h);
}

/**
 * Pick the header row. Real registers (ITF-SUPA) open with title/preamble rows
 * ("INDUSTRIAL TRAINING FUND", "OYO STATE SUPA REGISTERED ARTISAN") BEFORE the
 * column header, so "first visual row = header" is wrong. The header is the
 * widest of the first `scan` rows (the most distinct columns); title rows have
 * one or two items. Ties resolve to the earliest such row.
 */
export function findHeaderRowIndex(rows: PdfTextItem[][], scan = 15): number {
  const limit = Math.min(scan, rows.length);
  let bestIdx = 0;
  let bestCount = -1;
  for (let i = 0; i < limit; i++) {
    if (rows[i].length > bestCount) {
      bestCount = rows[i].length;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Reconstruct a table from positioned text items. Auto-detects the header row
 * (skipping any title/preamble rows above it), then returns the detected
 * headers + one record per data row (repeated per-page header rows removed).
 */
export function tableFromItems(items: PdfTextItem[], opts?: { yTolerance?: number; headerScanRows?: number }): ExtractedTable {
  const rows = clusterItemsToRows(items, opts?.yTolerance);
  if (rows.length === 0) return { headers: [], records: [] };

  const headerIdx = findHeaderRowIndex(rows, opts?.headerScanRows);
  const columns = buildColumns(rows[headerIdx]);
  const headers = columns.map((c) => c.label);

  const records: Record<string, string>[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const rec = rowToRecord(row, columns);
    if (isRepeatedHeader(rec, headers)) continue; // drop repeated headers
    const hasValue = Object.values(rec).some((v) => v !== '');
    if (hasValue) records.push(rec);
  }

  return { headers, records };
}

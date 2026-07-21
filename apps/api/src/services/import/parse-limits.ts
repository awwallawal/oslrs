/**
 * Deterministic parse bounds (Story 11-2 code-review M1).
 *
 * A `Promise.race` timeout stops *waiting* on a parse but cannot stop the *work*
 * — a synchronous `csv-parse` can't be interrupted, and an async `exceljs` load
 * keeps decompressing after the race rejects. The robust fix is to make the work
 * itself bounded and cancellable rather than rely on abandoning the wait:
 *
 *   1. **Row caps** (all parsers) — reject before/early in the parse when the row
 *      count exceeds `MAX_IMPORT_ROWS`, so no parser ever churns unbounded rows.
 *   2. **Page cap** (pdf) — reject a PDF with more than `MAX_PDF_PAGES` pages.
 *   3. **Active deadline** (pdf) — the slow, async parser checks the deadline
 *      between pages and tears the pdfjs task down (`destroy()`), *actually*
 *      stopping the work instead of leaving it running after a timeout.
 *
 * Combined with the 10 MB multer upload cap (which structurally bounds CSV/XLSX
 * wall-time to seconds), this removes the "parse can run unbounded / can't be
 * stopped" gap without a `worker_threads`+tsx bolt-on (this codebase's job
 * isolation is BullMQ; the import service deliberately stays in-request per the
 * story's Task 6 latency decision).
 */

/** Hard cap on data rows any single import will parse. */
export const MAX_IMPORT_ROWS = 100_000;

/** Hard cap on pages a tabular PDF may have. */
export const MAX_PDF_PAGES = 3_000;

/** Wall-clock parse deadline (shared by the service timeout + the pdf loop). */
export const PARSE_DEADLINE_MS = 30_000;

/** A parser refused because the input exceeded a hard size limit. */
export class ParseLimitExceededError extends Error {
  readonly code = 'PARSE_LIMIT_EXCEEDED';
  constructor(message: string) {
    super(message);
    this.name = 'ParseLimitExceededError';
  }
}

/** A parse was actively cancelled because it passed its wall-clock deadline. */
export class ParseDeadlineExceededError extends Error {
  readonly code = 'PARSE_DEADLINE_EXCEEDED';
  constructor(message: string) {
    super(message);
    this.name = 'ParseDeadlineExceededError';
  }
}

/** Throw `ParseLimitExceededError` when `count` exceeds `max`. */
export function assertWithinLimit(count: number, max: number, label: string): void {
  if (count > max) {
    throw new ParseLimitExceededError(
      `${label}: ${count} exceeds the ${max} limit. Split the file or upload a filtered export.`,
    );
  }
}

/** Throw `ParseDeadlineExceededError` when `deadlineAt` (epoch ms) has passed. */
export function assertBeforeDeadline(deadlineAt: number | undefined, label: string): void {
  if (deadlineAt !== undefined && Date.now() > deadlineAt) {
    throw new ParseDeadlineExceededError(
      `${label}: parsing exceeded the ${PARSE_DEADLINE_MS / 1000}s deadline and was cancelled.`,
    );
  }
}

/** Cheap physical-line count for pre-parse CSV bounding (O(n) over the buffer). */
export function countLines(text: string): number {
  if (text.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  return n;
}

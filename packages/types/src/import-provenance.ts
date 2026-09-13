/**
 * Import provenance + batch integrity — Story 13-2 R-A2 review, proposals P1/P2.
 *
 * ⭐ WHY THIS EXISTS. Association intakes are CLEANED before they reach the importer
 * (duplicates merged, unreadable rows held for review). That cleaning removes exactly
 * the evidence a roll-padding check needs, and until P1 the registry recorded none of
 * it: "-CLEAN" was a filename, not a fact. `ImportProvenanceStats` is that fact, as
 * NUMBERS ONLY — a batch's journey from the rows the association supplied to the rows
 * the operator uploaded. It must never carry names, phones or NINs.
 *
 * `ImportBatchIntegrity` (P2) is the one-per-batch reading an operator gets at dry-run
 * (predicted) and at confirm / batch detail (recorded): the numbers a padded roll would
 * disturb, in one place, instead of thousands of per-row `clean` fraud detections.
 */

import { z } from 'zod';

/** Snake_case reason key, e.g. `shared_phone_with_other_names`. */
const reasonKey = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'reason keys are snake_case');
const count = z.number().int().nonnegative();

export const importProvenanceStatsSchema = z
  .object({
    /** Rows the association supplied, before any cleaning. */
    rawRows: count.optional(),
    /** `rawRows` split by source sheet/channel (keys snake_case). Must sum to `rawRows`. */
    rawRowsBySource: z.record(reasonKey, count).optional(),
    /** Rows absorbed into another row as the same person by upstream consolidation. */
    mergedRows: count.optional(),
    /** Rows set aside for human review — supplied, but NOT in the uploaded file. */
    heldRows: count.optional(),
    /**
     * Why rows were held. ⚠️ NOT a partition: one row can carry several reasons, so the
     * values may sum to MORE than `heldRows`. Each value must still be ≤ `heldRows`.
     */
    heldByReason: z.record(reasonKey, count).optional(),
    /** Rows in the uploaded file. When given, must equal the file's data rows. */
    cleanRows: count.optional(),
    /** The association head's DECLARED member count (13-2 AC5.2). */
    declaredMembers: count.optional(),
    /** How the cleaning was done — free text, ≤ 500 chars, NO personal data. */
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export type ImportProvenanceStats = z.infer<typeof importProvenanceStatsSchema>;

/**
 * The arithmetic a provenance record must satisfy. Returns human-readable problems;
 * empty means consistent. `fileRows` is the uploaded file's data-row count
 * (parsed + parse-failed) when known.
 *
 * ⛔ Every check runs only when ALL its inputs are present — a partial record is
 * allowed (the operator may not know how many were merged) but a stated number that
 * contradicts another stated number is not. A provenance record that does not add up
 * is worse than none: it is evidence that looks checked.
 */
export function reconcileProvenanceStats(stats: ImportProvenanceStats, fileRows: number | null): string[] {
  const problems: string[] = [];
  const { rawRows, rawRowsBySource, mergedRows, heldRows, heldByReason, cleanRows } = stats;

  if (cleanRows !== undefined && fileRows !== null && cleanRows !== fileRows) {
    problems.push(`cleanRows ${cleanRows} ≠ data rows in the uploaded file ${fileRows}`);
  }
  if (rawRows !== undefined && mergedRows !== undefined && heldRows !== undefined && cleanRows !== undefined) {
    const derived = rawRows - mergedRows - heldRows;
    if (derived !== cleanRows) {
      problems.push(`rawRows ${rawRows} − mergedRows ${mergedRows} − heldRows ${heldRows} = ${derived}, but cleanRows is ${cleanRows}`);
    }
  }
  if (rawRows !== undefined && rawRowsBySource !== undefined) {
    const sum = Object.values(rawRowsBySource).reduce((a, b) => a + b, 0);
    if (sum !== rawRows) problems.push(`rawRowsBySource sums to ${sum}, but rawRows is ${rawRows}`);
  }
  if (heldRows !== undefined && heldByReason !== undefined) {
    for (const [reason, n] of Object.entries(heldByReason)) {
      if (n > heldRows) problems.push(`heldByReason.${reason} ${n} exceeds heldRows ${heldRows}`);
    }
  }
  return problems;
}

/** Factual, non-scoring signals — each is arithmetic, never a threshold someone guessed. */
export const importIntegritySignals = [
  /** More people landed (inserted + matched) than the head declared — the padding tell. */
  'received_exceeds_declared',
  /** Fewer landed than declared — members missing from the roll. */
  'received_below_declared',
  /** An association batch with no provenance record at all. */
  'provenance_missing',
  /** Some rows share a phone with another row of the same batch. */
  'shared_phone_rows_present',
  /** Some rows share a name (order-insensitive) and LGA with another row of the batch. */
  'same_name_rows_present',
  /** Some rows matched a person already on the register. */
  'rows_matched_existing',
] as const;

export type ImportIntegritySignal = (typeof importIntegritySignals)[number];

export interface ImportBatchIntegrity {
  /** `predicted` at dry-run (nothing written yet); `recorded` at confirm and batch detail. */
  basis: 'predicted' | 'recorded';
  rowsParsed: number;
  rowsFailed: number;
  inserted: number;
  matchedExisting: number;
  skipped: number;
  /** `matchedExisting / rowsParsed`, or null when nothing parsed. */
  matchedExistingRatio: number | null;
  /** Among inserted rows: how many share a phone with another inserted row, over how many numbers. */
  sharedPhoneRows: number;
  sharedPhoneNumbers: number;
  maxRowsPerPhone: number;
  /** Among inserted rows: how many share an order-insensitive name + LGA with another. */
  sameNameRows: number;
  provenance: ImportProvenanceStats | null;
  /** `cleanRows / rawRows` when both are known — how much of the roll survived cleaning. */
  cleanOverRaw: number | null;
  /** `(inserted + matchedExisting) − declaredMembers` when declared is known. Positive = more than declared. */
  declaredGap: number | null;
  signals: ImportIntegritySignal[];
}

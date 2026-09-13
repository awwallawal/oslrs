/**
 * Story 13-2 R-A2 review P1 — record the provenance of the two association batches that
 * predate `import_batches.provenance_stats`.
 *
 * Lives in `src/` (type-checked, tested) with `scripts/_backfill-import-provenance-stats.ts`
 * as the thin I/O wrapper — the same split as `association-identity-backfill.ts`, for
 * the same reason: `scripts/` is never type-checked.
 *
 * ── Where every number below comes from ──────────────────────────────────────
 * Reconciled 2026-09-13 from the consolidation working files (outside the repo, PII;
 * handoff §10) by joining on the stable `S/N` key, COUNTS ONLY:
 *
 *   AFAN farming (`farming-CLEAN-8234.xlsx`)
 *     consolidated.csv 9,563 rows + merged-pairs.csv 374 absorbed + 153 rows with no
 *     usable phone (never consolidated) = 10,090 supplied — agreeing with
 *     consolidate.mjs's by_sheet summary (N-Cares 6,516 · L-PRES 3,535 · fish 39).
 *     8,234 clean-file S/Ns, all found in consolidated.csv; the other 1,329
 *     consolidated rows were held, every one carrying a review flag. Held = 1,329 +
 *     153 = 1,482. 10,090 − 374 − 1,482 = 8,234 ✓.
 *   ASNAT tilers (`tilers-asnat-CLEAN.xlsx`)
 *     tilers-asnat.csv 70 rows = CLEAN 56 + HELD 14, no overlap, nothing merged.
 *
 * `heldByReason` counts rows per flag and is NOT a partition (a row may carry several).
 * `declaredMembers` is ABSENT for both: no head's declared count was ever recorded, and
 * inventing one would defeat the field. `rows_parsed` on prod is 8,234 and 56 — the
 * reconciliation below re-checks `cleanRows` against the live row before writing.
 */

import { eq, and, isNull } from 'drizzle-orm';
import type { db as Database } from '../db/index.js';
import { importBatches } from '../db/schema/import-batches.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../services/audit.service.js';
import {
  importProvenanceStatsSchema,
  reconcileProvenanceStats,
  type ImportProvenanceStats,
} from '@oslsr/types';

export type ProvenanceBackfillDb =
  | typeof Database
  | Parameters<Parameters<(typeof Database)['transaction']>[0]>[0];

export interface ProvenanceBackfillEntry {
  batchId: string;
  label: string;
  stats: ImportProvenanceStats;
}

export const IMPORT_PROVENANCE_BACKFILL: readonly ProvenanceBackfillEntry[] = [
  {
    batchId: '01a071c8-709f-73a3-9e31-eb0e8cedf01a',
    label: 'ASNAT tilers',
    stats: {
      rawRows: 70,
      mergedRows: 0,
      heldRows: 14,
      heldByReason: { lga_unresolved: 10, first_name_missing: 7, surname_missing: 6 },
      cleanRows: 56,
      note: 'WhatsApp roster transcribed to the frozen sheet; 14 rows held for missing name/LGA (tilers-asnat-HELD.xlsx). Reconciled 2026-09-13.',
    },
  },
  {
    batchId: '01a072ae-83e7-7e8f-902d-590f0c589c74',
    label: 'AFAN farming',
    stats: {
      rawRows: 10090,
      rawRowsBySource: { ncares: 6516, lpres: 3535, fish: 39 },
      mergedRows: 374,
      heldRows: 1482,
      heldByReason: {
        shared_phone_with_other_names: 786,
        column_shift_suspected: 273,
        nin_bad_length: 154,
        no_usable_phone: 153,
        skill_unmapped: 107,
        lga_unmatched: 99,
        nin_shared_across_phones: 43,
        ocr_source_verify_by_hand: 5,
        trade_underivable: 1,
      },
      cleanRows: 8234,
      note: 'consolidate.mjs: name+phone dedup (374 merged); flagged rows held for review (needs-eyes.csv). Reconciled by S/N 2026-09-13.',
    },
  },
];

export interface ProvenanceBackfillPrediction {
  batchId: string;
  label: string;
  batchExists: boolean;
  rowsParsed: number | null;
  alreadyRecorded: boolean;
  /** Schema + arithmetic problems against the LIVE batch. Any problem ⇒ no write. */
  problems: string[];
  willWrite: boolean;
}

export async function predictProvenanceBackfill(dbh: ProvenanceBackfillDb): Promise<ProvenanceBackfillPrediction[]> {
  const out: ProvenanceBackfillPrediction[] = [];
  for (const entry of IMPORT_PROVENANCE_BACKFILL) {
    const [batch] = await dbh
      .select({ rowsParsed: importBatches.rowsParsed, rowsFailed: importBatches.rowsFailed, provenanceStats: importBatches.provenanceStats })
      .from(importBatches)
      .where(eq(importBatches.id, entry.batchId))
      .limit(1);

    const problems: string[] = [];
    const parsed = importProvenanceStatsSchema.safeParse(entry.stats);
    if (!parsed.success) problems.push(...parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    if (batch) {
      // `rows_failed` on these batches counts PLAN failures too, so the file's data rows
      // are what was parsed; both prod batches recorded 0 failed.
      problems.push(...reconcileProvenanceStats(entry.stats, batch.rowsParsed + batch.rowsFailed));
    }

    const alreadyRecorded = !!batch && batch.provenanceStats !== null;
    out.push({
      batchId: entry.batchId,
      label: entry.label,
      batchExists: !!batch,
      rowsParsed: batch?.rowsParsed ?? null,
      alreadyRecorded,
      problems,
      willWrite: !!batch && !alreadyRecorded && problems.length === 0,
    });
  }
  return out;
}

export interface ProvenanceBackfillOutcome extends ProvenanceBackfillPrediction {
  written: boolean;
}

/**
 * Write each record that predicts clean. Never overwrites: the UPDATE is guarded by
 * `provenance_stats IS NULL`, so a re-run — or a batch recorded by hand in between — is
 * a no-op. Each write shares a transaction with its own audit row.
 */
export async function applyProvenanceBackfill(
  dbh: typeof Database,
  opts: { auditContext?: { ipAddress?: string; userAgent?: string } } = {},
): Promise<ProvenanceBackfillOutcome[]> {
  const predictions = await predictProvenanceBackfill(dbh);
  const outcomes: ProvenanceBackfillOutcome[] = [];

  for (const p of predictions) {
    if (!p.willWrite) {
      outcomes.push({ ...p, written: false });
      continue;
    }
    const entry = IMPORT_PROVENANCE_BACKFILL.find((e) => e.batchId === p.batchId)!;
    const written = await dbh.transaction(async (tx) => {
      const res = await tx
        .update(importBatches)
        .set({ provenanceStats: entry.stats })
        .where(and(eq(importBatches.id, p.batchId), isNull(importBatches.provenanceStats)));
      const rowCount = (res as unknown as { rowCount: number | null }).rowCount ?? 0;
      if (rowCount === 0) return false;

      await AuditService.logActionTx(tx, {
        actorId: null,
        action: AUDIT_ACTIONS.IMPORT_BATCH_PROVENANCE_RECORDED,
        targetResource: AUDIT_TARGETS.IMPORT_BATCH,
        targetId: p.batchId,
        details: {
          story: '13-2 R-A2 review P1',
          label: entry.label,
          provenanceStats: entry.stats,
          basis: 'reconciled from consolidation working files by S/N, 2026-09-13',
        },
        ipAddress: opts.auditContext?.ipAddress,
        userAgent: opts.auditContext?.userAgent,
      });
      return true;
    });
    outcomes.push({ ...p, written });
  }
  return outcomes;
}

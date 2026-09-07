/**
 * Story 13-67 AC3 — one-shot idempotent association-identity backfill.
 *
 * Writes the vouching body onto the two association batches that predate the
 * `association_name` column: `01a071c8…` → ASNAT (56 rows), `01a072ae…` → AFAN
 * (8,222 rows). Awwal's ruling of 2026-09-05; the names are NOT re-derived from the
 * source sheets, which name programme registers (NCARES / L-PRES), not associations.
 *
 * TWO PHASES, two different predicates, reported separately:
 *   1. `import_batch_id = …` — the 8,278 rows the import INSERTED.
 *   2. the batch own `failure_report` match hashes — the **12** people it MATCHED to an
 *      existing self-registration instead of inserting (Story 13-67 R2, Awwal 2026-09-07:
 *      the vouch attaches to them too). Phase 2 also writes an audit row per respondent.
 *
 * ⚠️ This touches 8,278 LIVE respondent rows. It follows the house discipline:
 *   - PREVIEW BY DEFAULT. `--dry-run` (or no apply flag) predicts and writes nothing.
 *   - WRITES only with `--apply --confirm-i-am-not-dry-running`.
 *   - PREDICT → APPLY → COMPARE per batch ([[pattern-predict-then-compare]]). A run
 *     whose updated count differs from its prediction exits NON-ZERO, because "it
 *     moved" passes for any change, including a wrong one.
 *   - Refuses to write if either batch id is absent (wrong database), if a batch's row
 *     count disagrees with the ruling's 56 / 8,222 (override: `--accept-count-drift`),
 *     or if any row holds non-object metadata (no override — see the lib's preflight).
 *   - `--dry-run` and `--apply` together are REFUSED, not silently resolved.
 *
 * ⛔ The write is a JSONB MERGE, never a replace — see the header of
 * `src/lib/association-identity-backfill.ts`. All logic lives there so `tsc` and
 * vitest can see it; `scripts/` is outside tsconfig and is RUN, never type-checked.
 *
 * Usage:
 *   tsx scripts/_backfill-association-identity.ts --dry-run
 *   tsx scripts/_backfill-association-identity.ts --apply --confirm-i-am-not-dry-running
 *
 * Exit codes: 0 success, 1 on bad args / a missing batch / a prediction mismatch.
 */
import { hostname } from 'node:os';
import pino from 'pino';
import { db, pool } from '../src/db/index.js';
import {
  predictAssociationBackfill,
  applyAssociationBackfill,
  predictAssociationMatchedBackfill,
  applyAssociationMatchedBackfill,
} from '../src/lib/association-identity-backfill.js';

const logger = pino({ name: 'association-identity-backfill' });

const HELP_TEXT = `
Story 13-67 — association-identity backfill (writes the vouching body onto the two
live association batches, merging into respondents.metadata).

  --dry-run                          Predict only, no writes (default).
  --apply                            Switch to apply mode (still refuses unless confirmed).
  --confirm-i-am-not-dry-running     Required with --apply to actually WRITE.
  --accept-count-drift               Write even though a batch's row count disagrees with
                                     the 2026-09-05 ruling (56 / 8,222). Use ONLY after
                                     reconciling the divergence — it is the one check here
                                     that CAN fail.
  --help                             Show this help.

Examples:
  tsx scripts/_backfill-association-identity.ts --dry-run
  tsx scripts/_backfill-association-identity.ts --apply --confirm-i-am-not-dry-running
`;

function table(rows: Array<Record<string, unknown>>): void {
  for (const r of rows) console.log('  ' + JSON.stringify(r));
}

async function runDryRun(): Promise<number> {
  const predictions = await predictAssociationBackfill(db);
  console.log('\nPREDICTION (no writes performed):');
  table(
    predictions.map((p) => ({
      association: p.associationName,
      batchId: p.batchId,
      batchExists: p.batchExists,
      willUpdate: p.predictedRows,
      storyRecorded: p.storyExpectedRows,
      alreadyTagged: p.alreadyTagged,
      nonObjectMetadata: p.nonObjectMetadataRows,
    })),
  );

  const missing = predictions.filter((p) => !p.batchExists);
  if (missing.length > 0) {
    console.error(
      `\nERROR: ${missing.length} batch id(s) not found in import_batches. ` +
        'This database is not the one the ruling was measured against.',
    );
    return 1;
  }

  /*
   * A divergence from the story's recorded count is INFORMATION here in the preview —
   * rows can legitimately have moved since 2026-09-05. Say so loudly.
   *
   * ⚠️ Code review H1: it is NOT information on the write path. `--apply` now REFUSES
   * on the same divergence unless `--accept-count-drift` is passed, because a dry-run
   * the operator skipped used to be the only thing standing between a wrong database
   * and a green "✅ every batch matched".
   */
  for (const p of predictions) {
    if (p.predictedRows !== p.storyExpectedRows) {
      console.warn(
        `\n⚠️  ${p.associationName}: database says ${p.predictedRows} rows, story recorded ` +
          `${p.storyExpectedRows}. Reconcile before applying (--apply will REFUSE without ` +
          '--accept-count-drift).',
      );
    }
    if (p.nonObjectMetadataRows > 0) {
      console.error(
        `\n⛔ ${p.associationName}: ${p.nonObjectMetadataRows} row(s) hold non-object metadata. ` +
          '`metadata || jsonb_build_object(...)` would ARRAY-WRAP those documents and orphan every ' +
          'sibling key. --apply will refuse; no flag overrides this.',
      );
    }
  }

  /*
   * PHASE 2 — Story 13-67 R2, the people the import MATCHED instead of inserting.
   * Reported separately because it is a DIFFERENT predicate over a different set: phase 1
   * is `import_batch_id = …`, phase 2 is the batch own `failure_report` hashes. Summing
   * them into one number would hide which half moved.
   */
  const matched = await predictAssociationMatchedBackfill(db);
  console.log('\nPREDICTION — phase 2, matched respondents (13-67 R2):');
  table(
    matched.map((m) => ({
      association: m.associationName,
      willUpdate: m.resolvedRespondentIds.length,
      ledgerRecorded: m.storyExpectedMatchedRows,
      matchedWithHash: m.matchedWithHash,
      inSheetDuplicates: m.inBatchDuplicates,
      unresolved: m.unresolvedHashes.length,
      alreadyTagged: m.alreadyTagged,
      conflicts: m.conflictingNames.length,
    })),
  );
  for (const m of matched) {
    if (m.matchedWithHash !== m.storyExpectedMatchedRows) {
      console.warn(
        `\n⚠️  ${m.associationName}: ${m.matchedWithHash} resolvable matched respondent(s), ledger recorded ` +
          `${m.storyExpectedMatchedRows}. --apply will REFUSE without --accept-count-drift.`,
      );
    }
    if (m.unresolvedHashes.length > 0) {
      console.error(
        `\n⛔ ${m.associationName}: ${m.unresolvedHashes.length} matched hash(es) resolve to no respondent ` +
          '(deleted or merged since the import). --apply will refuse rather than write a partial set.',
      );
    }
    if (m.conflictingNames.length > 0) {
      console.error(
        `\n⛔ ${m.associationName}: ${m.conflictingNames.length} target(s) already carry a DIFFERENT ` +
          'association name. --apply will refuse; overwriting one accountable body claim with another needs a ruling.',
      );
    }
  }

  const total = predictions.reduce((n, p) => n + p.predictedRows, 0);
  const totalMatched = matched.reduce((n, m) => n + m.resolvedRespondentIds.length, 0);
  console.log(`\nTotal rows this run would update: ${total} (phase 1) + ${totalMatched} (phase 2, matched)`);
  console.log('Re-run with --apply --confirm-i-am-not-dry-running to write.\n');
  return 0;
}

async function runApply(confirmed: boolean, acceptCountDrift: boolean): Promise<number> {
  if (!confirmed) {
    console.error('ERROR: --apply requires --confirm-i-am-not-dry-running to write.');
    return 1;
  }

  if (acceptCountDrift) {
    console.warn(
      '\n⚠️  --accept-count-drift: writing even if a batch disagrees with the ruling counts (56 / 8,222).\n',
    );
  }

  const outcomes = await applyAssociationBackfill(db, {
    onProgress: (m) => console.log('  ' + m),
    acceptCountDrift,
  });

  console.log('\nRESULT:');
  table(
    outcomes.map((o) => ({
      association: o.associationName,
      predicted: o.predictedRows,
      updated: o.updatedRows,
      matches: o.matchesPrediction,
    })),
  );

  /*
   * ⛔ STOP HERE IF PHASE 1 DID NOT MATCH ITS PREDICTION.
   *
   * Phase 1 is 8,278 rows and phase 2 annotates 12 LIVE self-registered citizens with a
   * third party claim. If the big write already disagrees with what it predicted, the
   * database is not what this script thinks it is, and the correct next action is a human
   * looking at it — not twelve more writes and twelve more audit rows on top.
   */
  const phase1Mismatched = outcomes.filter((o) => !o.matchesPrediction);
  if (phase1Mismatched.length > 0) {
    console.error(
      `\n⛔ ${phase1Mismatched.length} batch(es) updated a different number of rows than predicted in PHASE 1. ` +
        'The phase-1 write COMMITTED; phase 2 (the matched respondents) has NOT been run. Investigate first.',
    );
    logger.error({ event: 'association_identity_backfill.mismatch', phase: 1, mismatched: phase1Mismatched });
    return 1;
  }

  // PHASE 2 — 13-67 R2, only now that phase 1 verified.
  const matchedOutcomes = await applyAssociationMatchedBackfill(db, {
    onProgress: (m) => console.log('  ' + m),
    acceptCountDrift,
    // Who ran it, from the box itself — these rows land in the hash-chained audit log.
    auditContext: {
      ipAddress: `operator-host:${hostname()}`,
      userAgent: `tsx scripts/_backfill-association-identity.ts ${process.argv.slice(2).join(' ')}`,
    },
  });

  console.log('\nRESULT — phase 2 (matched respondents, 13-67 R2):');
  table(
    matchedOutcomes.map((o) => ({
      association: o.associationName,
      predicted: o.resolvedRespondentIds.length,
      updated: o.updatedRows,
      matches: o.matchesPrediction,
    })),
  );

  const mismatched = matchedOutcomes.filter((o) => !o.matchesPrediction);
  if (mismatched.length > 0) {
    // The write already committed — this exit code is the alarm, not a rollback.
    console.error(
      `\n⛔ ${mismatched.length} batch(es) updated a different number of rows than predicted. ` +
        'The write COMMITTED; investigate before treating this backfill as done.',
    );
    logger.error({ event: 'association_identity_backfill.mismatch', mismatched });
    return 1;
  }

  console.log('\n✅ Every batch updated exactly the predicted number of rows, in both phases.\n');
  logger.info({ event: 'association_identity_backfill.complete', outcomes, matchedOutcomes });
  return 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const apply = argv.includes('--apply');
  const confirmed = argv.includes('--confirm-i-am-not-dry-running');
  const dryRun = argv.includes('--dry-run');
  const acceptCountDrift = argv.includes('--accept-count-drift');

  /*
   * Code review L2 — a command line that says BOTH is a command line whose author is
   * not sure what it does. `--apply` used to win silently because it was tested first,
   * so `--dry-run --apply --confirm-i-am-not-dry-running` wrote 8,278 live rows while
   * reading, to the operator, like a preview. Refuse; make them delete one word.
   */
  if (apply && dryRun) {
    console.error(
      'ERROR: --dry-run and --apply are mutually exclusive. Pass exactly one — this script writes to ' +
        'production when --apply wins.',
    );
    await pool.end();
    process.exit(1);
  }

  let code: number;
  if (apply) {
    code = await runApply(confirmed, acceptCountDrift);
  } else if (dryRun) {
    code = await runDryRun();
  } else {
    console.error('ERROR: pass --dry-run, or --apply --confirm-i-am-not-dry-running to write.');
    code = 1;
  }

  await pool.end();
  process.exit(code);
}

// Only invoke when executed directly via tsx (vitest sets VITEST=true).
if (!process.env.VITEST) {
  main().catch(async (err) => {
    logger.error({ event: 'association_identity_backfill.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}

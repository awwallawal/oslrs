#!/usr/bin/env tsx
/**
 * Report companion to backfill-input-sanitisation.ts.
 *
 * Lists every respondents row flagged with `metadata.backfill_failed = true`
 * for manual super-admin review. Output is plain table — pipe to a file or
 * grep to triage.
 *
 * Usage:
 *   pnpm --filter @oslsr/api tsx src/scripts/report-backfill-failures.ts
 *   pnpm --filter @oslsr/api report:backfill-failures
 */

import { db } from '../db/index.js';
import { respondents } from '../db/schema/index.js';
import { sql } from 'drizzle-orm';
import pino from 'pino';

const logger = pino({ name: 'report-backfill-failures' });

async function main(): Promise<void> {
  const rows = await db
    .select({
      id: respondents.id,
      nin: respondents.nin,
      phoneNumber: respondents.phoneNumber,
      dateOfBirth: respondents.dateOfBirth,
      metadata: respondents.metadata,
      createdAt: respondents.createdAt,
    })
    .from(respondents)
    .where(sql`(${respondents.metadata}->>'backfill_failed')::boolean = true`);

  logger.info({ event: 'report.start', flagged: rows.length });

  if (rows.length === 0) {
    logger.info({ event: 'report.empty', message: 'No flagged rows. FRC item #4 unblocked.' });
    return;
  }

  for (const row of rows) {
    logger.info({
      event: 'report.row',
      id: row.id,
      nin: row.nin,
      phoneNumber: row.phoneNumber,
      dateOfBirth: row.dateOfBirth,
      warnings: row.metadata?.normalisation_warnings ?? [],
      createdAt: row.createdAt,
    });
  }

  logger.info({
    event: 'report.complete',
    flagged: rows.length,
    next:
      'Manually review and patch each row, then re-run backfill-input-sanitisation.ts to verify zero remain.',
  });
}

const isCli = process.argv[1]?.endsWith('report-backfill-failures.ts')
  || process.argv[1]?.endsWith('report-backfill-failures.js');
if (isCli) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ event: 'report.error', err: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    });
}

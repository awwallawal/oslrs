/**
 * Story 13-16 (AC2) — one-shot idempotent LGA-value canonicalization backfill.
 *
 * `respondents.lga_id` is plain text (no FK). The public wizard historically
 * wrote the LGA row UUID (`lgas.id`) while the enumerator path and every
 * analytics join (`l.code = r.lga_id`) speak the slug (`lgas.code`) — so all
 * UUID-shaped rows fail the LGA join and render as "Unknown"/raw UUID on the
 * geographic dashboard. This script converts every UUID-shaped
 * `respondents.lga_id` to its `lgas.code` slug.
 *
 * Mirrors the `_backfill-reference-code.ts` discipline:
 *   - PREVIEW BY DEFAULT. `--dry-run` (or no apply flag) only counts + samples.
 *   - WRITES only with `--apply --confirm-i-am-not-dry-running`.
 *   - CSV backup of the pre-migration `(id, lga_id)` pairs is written BEFORE
 *     any row is touched (draft-timer-reset precedent; default `_ops-backups/`).
 *   - Per-row UPDATE + audit emission in one `db.transaction` with an
 *     inside-the-txn re-check (`FOR UPDATE` + still-UUID-shaped) — safe to
 *     re-run; a re-run finds 0 candidates (idempotent).
 *   - A UUID with no matching `lgas` row is LOGGED AND LEFT AS-IS for manual
 *     review — never nulled, never guessed.
 *   - Emits `OPERATOR_LGA_ID_CANONICALIZED` per converted row.
 *
 * Usage:
 *   tsx scripts/migrate-lgaid-uuid-to-slug.ts --dry-run
 *   tsx scripts/migrate-lgaid-uuid-to-slug.ts --apply --confirm-i-am-not-dry-running [--max-rows N] [--backup-dir DIR]
 *
 * Exit codes: 0 success, 1 on bad args / any per-row failure.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../src/services/audit.service.js';
import pino from 'pino';

const logger = pino({ name: 'lgaid-uuid-to-slug' });

/**
 * Full UUID shape only (parity with `lga-canonical.service.ts` UUID_SHAPED_RE);
 * kept as a PG-side pattern so selection happens in one indexedless-but-tiny
 * scan rather than pulling every row to Node.
 */
export const PG_UUID_SHAPE =
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'apply',
  'confirm-i-am-not-dry-running',
  'max-rows',
  'backup-dir',
  'help',
]);

const HELP_TEXT = `
Story 13-16 — canonicalize UUID-shaped respondents.lga_id values to the lgas.code slug.

  --dry-run                          Preview: count + sample, no writes (default).
  --apply                            Switch to apply mode (still PREVIEW unless confirmed).
  --confirm-i-am-not-dry-running     Required with --apply to actually WRITE.
  --max-rows N                       Cap rows processed this run (default: all).
  --backup-dir DIR                   Where the pre-migration CSV backup goes
                                     (default: <apps/api>/_ops-backups, CWD-independent).
  --help                             Show this help.

Examples:
  tsx scripts/migrate-lgaid-uuid-to-slug.ts --dry-run
  tsx scripts/migrate-lgaid-uuid-to-slug.ts --apply --confirm-i-am-not-dry-running
`;

export interface Args {
  dryRun: boolean;
  apply: boolean;
  confirmLive: boolean;
  maxRows: number | null;
  backupDir: string;
}

export function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (!KNOWN_FLAGS.has(key)) {
      throw new Error(`Unknown flag --${key}. Known flags: ${[...KNOWN_FLAGS].join(', ')}`);
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  const maxRowsRaw = flags['max-rows'];
  // 13-16 review M1 — a bare `--max-rows` (value missing / swallowed by the
  // next flag) must ERROR, not silently fall back to "no cap": on a live run
  // that typo would widen a deliberately capped conversion to the full table.
  if (maxRowsRaw === true) {
    throw new Error('--max-rows requires a positive integer value (e.g. --max-rows 50)');
  }
  const maxRows = typeof maxRowsRaw === 'string' ? parseInt(maxRowsRaw, 10) : null;
  if (maxRows !== null && (!Number.isFinite(maxRows) || maxRows < 1)) {
    throw new Error('--max-rows must be a positive integer');
  }
  return {
    dryRun: flags['dry-run'] === true,
    apply: flags['apply'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    maxRows,
    // 13-16 review L2 — the default backup location must not depend on the
    // operator's CWD (repo root vs apps/api yields different folders); anchor
    // it to the API package root. An explicit --backup-dir is taken as given.
    backupDir:
      typeof flags['backup-dir'] === 'string'
        ? flags['backup-dir']
        : path.resolve(fileURLToPath(new URL('..', import.meta.url)), '_ops-backups'),
  };
}

export interface CandidateRow {
  id: string;
  lgaId: string;
  /** Resolved slug, or null when no `lgas` row matches the UUID (left for review). */
  slug: string | null;
}

/**
 * UUID-shaped `respondents.lga_id` rows with their resolved slug. The join
 * casts `lgas.id` to text (never `lga_id` to uuid — a malformed value would
 * abort the whole query); the regex WHERE guarantees only full-UUID shapes.
 */
export async function fetchCandidates(maxRows: number | null): Promise<CandidateRow[]> {
  const limitClause = maxRows ? sql`LIMIT ${maxRows}` : sql``;
  const result = (await db.execute(sql`
    SELECT r.id, r.lga_id, l.code AS slug
    FROM "respondents" r
    LEFT JOIN "lgas" l ON l.id::text = lower(r.lga_id)
    WHERE r.lga_id ~* ${PG_UUID_SHAPE}
    ORDER BY r.created_at ASC
    ${limitClause}
  `)) as { rows: Array<{ id: string; lga_id: string; slug: string | null }> };
  return result.rows.map((r) => ({ id: r.id, lgaId: r.lga_id, slug: r.slug }));
}

/** CSV backup of the pre-migration (id, lga_id) pairs. Returns the file path. */
export function writeBackupCsv(backupDir: string, rows: CandidateRow[]): string {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(backupDir, `lgaid-uuid-to-slug-pre-${stamp}.csv`);
  const lines = ['respondent_id,lga_id_pre,resolved_slug'];
  for (const r of rows) {
    lines.push(`${r.id},${r.lgaId},${r.slug ?? ''}`);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return file;
}

export interface BackfillSummary {
  converted: number;
  unmatched: number;
  skipped: number;
  failed: number;
  backupFile: string | null;
}

/**
 * The apply path. `live=false` counts what WOULD happen (no writes, no CSV);
 * `live=true` writes the CSV backup first, then converts row-by-row.
 */
export async function runBackfill(args: {
  live: boolean;
  maxRows: number | null;
  backupDir: string;
}): Promise<BackfillSummary> {
  const candidates = await fetchCandidates(args.maxRows);
  const operatorHost = os.hostname();
  const operatorInvocation = `lgaid-uuid-to-slug ${process.argv.slice(2).join(' ')}`;

  const summary: BackfillSummary = {
    converted: 0,
    unmatched: 0,
    skipped: 0,
    failed: 0,
    backupFile: null,
  };

  const convertible = candidates.filter((c) => c.slug !== null);
  summary.unmatched = candidates.length - convertible.length;
  for (const orphan of candidates.filter((c) => c.slug === null)) {
    logger.warn({
      event: 'lgaid_backfill.unmatched_uuid',
      respondentId: orphan.id,
      lgaId: orphan.lgaId,
      note: 'no lgas row matches this UUID — left as-is for manual review',
    });
  }

  if (!args.live) {
    summary.converted = convertible.length;
    return summary;
  }

  // Backup BEFORE any write (AC2). Includes unmatched rows for completeness.
  if (candidates.length > 0) {
    summary.backupFile = writeBackupCsv(args.backupDir, candidates);
    logger.info({ event: 'lgaid_backfill.backup_written', file: summary.backupFile });
  }

  for (const row of convertible) {
    try {
      const outcome = await db.transaction(async (tx) => {
        // Idempotency / race guard — re-check inside the txn that the value is
        // still the UUID we selected (a concurrent run or a user edit may have
        // already fixed it).
        const current = (await tx.execute(sql`
          SELECT "lga_id" FROM "respondents" WHERE "id" = ${row.id} FOR UPDATE
        `)) as { rows: Array<{ lga_id: string | null }> };
        if (current.rows.length === 0) return 'missing' as const;
        if (current.rows[0].lga_id !== row.lgaId) return 'noop' as const;

        await tx.execute(sql`
          UPDATE "respondents"
          SET "lga_id" = ${row.slug}, "updated_at" = now()
          WHERE "id" = ${row.id}
        `);
        await AuditService.logActionTx(tx, {
          actorId: null,
          action: AUDIT_ACTIONS.OPERATOR_LGA_ID_CANONICALIZED,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: row.id,
          details: {
            lga_id_pre: row.lgaId,
            lga_id_post: row.slug,
            operator_marker: 'lgaid_uuid_to_slug_backfill',
          },
          ipAddress: operatorHost,
          userAgent: operatorInvocation,
        });
        return 'converted' as const;
      });
      if (outcome === 'converted') summary.converted++;
      else summary.skipped++;
    } catch (err) {
      summary.failed++;
      logger.error({
        event: 'lgaid_backfill.row_failed',
        respondentId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

async function runDryRun(args: Args): Promise<number> {
  const candidates = await fetchCandidates(args.maxRows);
  const convertible = candidates.filter((c) => c.slug !== null);
  const unmatched = candidates.filter((c) => c.slug === null);
  console.log(`\n[DRY-RUN] ${candidates.length} UUID-shaped respondents.lga_id row(s).`);
  console.log(`  convertible → slug : ${convertible.length}`);
  console.log(`  unmatched (review) : ${unmatched.length}`);
  if (args.maxRows && candidates.length === args.maxRows) {
    console.warn(`  [WARN] Hit the --max-rows cap (${args.maxRows}); more rows may remain.`);
  }
  for (const row of convertible.slice(0, 10)) {
    console.log(`  WOULD CONVERT ${row.id.slice(0, 8)}…  ${row.lgaId} → ${row.slug}`);
  }
  if (convertible.length > 10) console.log(`  … and ${convertible.length - 10} more.`);
  for (const row of unmatched) {
    console.log(`  UNMATCHED ${row.id.slice(0, 8)}…  ${row.lgaId} (no lgas row — left as-is)`);
  }
  console.log('\n  This was a PREVIEW. Re-run with --apply --confirm-i-am-not-dry-running to write.\n');
  return 0;
}

async function runApply(args: Args): Promise<number> {
  const summary = await runBackfill({
    live: args.confirmLive,
    maxRows: args.maxRows,
    backupDir: args.backupDir,
  });
  const verb = args.confirmLive ? 'converted' : 'would-convert';
  console.log(
    `\nSummary (${args.confirmLive ? 'LIVE' : 'PREVIEW'}): ${verb}=${summary.converted} ` +
      `unmatched=${summary.unmatched} skipped=${summary.skipped} failed=${summary.failed}`,
  );
  if (summary.backupFile) console.log(`  Pre-migration backup: ${summary.backupFile}`);
  if (!args.confirmLive && summary.converted > 0) {
    console.log('  This was a PREVIEW. Re-run with --confirm-i-am-not-dry-running to write.\n');
  }
  if (args.confirmLive) {
    const remaining = await fetchCandidates(null);
    const still = remaining.filter((c) => c.slug !== null).length;
    console.log(
      `  Post-run verification: ${remaining.length} UUID-shaped row(s) remain ` +
        `(${still} convertible — expect 0; unmatched rows need manual review).\n`,
    );
  }
  return summary.failed > 0 ? 1 : 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  const args = parseArgs(argv);

  if (args.apply) {
    process.exit(await runApply(args));
  }
  if (!args.dryRun) {
    console.error('ERROR: pass --dry-run, or --apply --confirm-i-am-not-dry-running to write.');
    process.exit(1);
  }
  process.exit(await runDryRun(args));
}

// Only invoke when executed directly via tsx (vitest sets VITEST=true).
if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'lgaid_backfill.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}

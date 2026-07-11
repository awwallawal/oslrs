/**
 * Story 13-22 (Task 1 / AC4) — READ-ONLY skills value audit.
 *
 * Enumerates every distinct token stored in `submissions.raw_data.skills_possessed`
 * and `.training_interest` (unnested via the SAME shared `selectMultipleUnnest`
 * fragment the analytics consumers now use), and classifies each as:
 *   - canonical : in SKILL_SLUGS (the 150-member taxonomy, Story 13-20)
 *   - custom    : `custom_`-prefixed free-text a registrant declared (AC3 — keep)
 *   - unknown   : neither → a real non-canonical slug that would need an ALIAS
 *
 * The classification GATES the AC4 backfill: if `unknown` is empty (expected —
 * prod samples are all canonical or custom_), NO backfill is needed and the
 * format fix (AC2) is purely read-side with no data migration. If `unknown`
 * surfaces real drift, the printed list is the alias-map input (mirror
 * FOSSIL_LGA_ALIASES from Story 13-16) — build the audited backfill only then.
 *
 * READ-ONLY: this script performs NO writes. Run against prod via Tailscale, or
 * against app_db locally.
 *
 * Usage:
 *   tsx scripts/_audit-skills-values.ts
 *   tsx scripts/_audit-skills-values.ts --json   # machine-readable dump
 *
 * Exit codes: 0 always on a successful read (unknown tokens are reported, not
 * an error); 1 only on a DB/read failure or bad args.
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { SKILL_SLUGS } from '@oslsr/types';
import { selectMultipleUnnest } from '../src/lib/skills-extraction.js';
import pino from 'pino';

const logger = pino({ name: 'skills-audit' });

const KNOWN_FLAGS = new Set(['json', 'help']);
const FIELDS = ['skills_possessed', 'training_interest'] as const;
type Field = (typeof FIELDS)[number];

interface TokenCount {
  token: string;
  count: number;
  kind: 'canonical' | 'custom' | 'unknown';
}

function classify(token: string, canonical: Set<string>): TokenCount['kind'] {
  if (canonical.has(token)) return 'canonical';
  if (token.startsWith('custom_')) return 'custom';
  return 'unknown';
}

async function auditField(field: Field, canonical: Set<string>): Promise<TokenCount[]> {
  const rows = await db.execute(sql`
    SELECT skill AS token, COUNT(*)::int AS count
    FROM submissions s,
         ${selectMultipleUnnest(sql`s.raw_data`, field)} AS skill
    WHERE s.raw_data ? ${field}
    GROUP BY skill
    ORDER BY count DESC, skill ASC
  `);
  return (rows.rows as Array<{ token: string; count: number }>).map((r) => ({
    token: String(r.token),
    count: Number(r.count),
    kind: classify(String(r.token), canonical),
  }));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).map((a) => a.replace(/^--/, ''));
  const bad = args.filter((a) => !KNOWN_FLAGS.has(a));
  if (bad.length) {
    logger.error({ bad }, 'unknown flag(s)');
    process.exit(1);
  }
  if (args.includes('help')) {
    process.stdout.write('tsx scripts/_audit-skills-values.ts [--json]\n');
    process.exit(0);
  }
  const asJson = args.includes('json');
  const canonical = new Set<string>(SKILL_SLUGS);

  const report: Record<Field, TokenCount[]> = {
    skills_possessed: [],
    training_interest: [],
  };
  for (const field of FIELDS) {
    report[field] = await auditField(field, canonical);
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exit(0);
  }

  for (const field of FIELDS) {
    const tokens = report[field];
    const byKind = {
      canonical: tokens.filter((t) => t.kind === 'canonical'),
      custom: tokens.filter((t) => t.kind === 'custom'),
      unknown: tokens.filter((t) => t.kind === 'unknown'),
    };
    process.stdout.write(`\n=== ${field} ===\n`);
    process.stdout.write(
      `distinct tokens: ${tokens.length}  ` +
        `(canonical ${byKind.canonical.length}, custom ${byKind.custom.length}, unknown ${byKind.unknown.length})\n`,
    );
    if (byKind.custom.length) {
      process.stdout.write(
        `  custom_ (keep, AC3): ${byKind.custom.map((t) => `${t.token}×${t.count}`).join(', ')}\n`,
      );
    }
    if (byKind.unknown.length) {
      process.stdout.write(
        `  ⚠ UNKNOWN (alias candidates — GATES AC4 backfill):\n` +
          byKind.unknown.map((t) => `      ${t.token} ×${t.count}`).join('\n') +
          '\n',
      );
    } else {
      process.stdout.write('  ✓ no unknown tokens → AC4 backfill is a NO-OP for this field.\n');
    }
  }

  const anyUnknown = FIELDS.some((f) => report[f].some((t) => t.kind === 'unknown'));
  process.stdout.write(
    `\nBACKFILL DECISION: ${anyUnknown ? 'unknown tokens present — review alias map before any backfill.' : 'NO backfill needed (all canonical or custom_).'}\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'skills audit failed');
  process.exit(1);
});

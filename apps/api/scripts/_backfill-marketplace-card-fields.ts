/**
 * Story 13-38 (AC7 + AC8) — re-derive the two card fields on the marketplace
 * profiles that already exist.
 *
 *  - `experience_level`: the pre-13-38 normaliser matched a canon no form ever
 *    emitted, so the questionnaire's real `less_1`/`over_10` answers stored NULL
 *    and `7_10` collapsed into `4-7` (`docs/questionnaire_schema.md:134-141`).
 *  - `business_name`: the column is new in this story, so every existing row is
 *    NULL even where the person volunteered a trading name.
 *
 * All logic lives in `src/services/marketplace-card-backfill.service.ts` (inside
 * tsconfig, and unit-tested — including a test that proves dry-run writes nothing).
 * This file is only the CLI.
 *
 * Mirrors the `_backfill-marketplace-extraction.ts` discipline:
 *   - PREVIEW BY DEFAULT. `--dry-run` counts, writes nothing.
 *   - LIVE requires the deliberately ugly `--confirm-i-am-not-dry-running`.
 *
 * Usage:
 *   tsx scripts/_backfill-marketplace-card-fields.ts --dry-run
 *   tsx scripts/_backfill-marketplace-card-fields.ts --apply --confirm-i-am-not-dry-running
 *
 * Exit codes: 0 success, 1 on bad args / fatal error.
 */
import pino from 'pino';
import {
  backfillMarketplaceCardFields,
  type MarketplaceCardBackfillResult,
} from '../src/services/marketplace-card-backfill.service.js';

const logger = pino({ name: 'marketplace-card-backfill' });

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'apply',
  'confirm-i-am-not-dry-running',
  'help',
]);

const HELP_TEXT = `
Story 13-38 (AC7 + AC8) — re-derive experience_level + business_name on existing
marketplace_profiles rows from each respondent's latest submission answers.

  --dry-run                          Preview: counts only, writes nothing (run this first).
  --apply                            Switch to apply mode (still PREVIEW unless confirmed).
  --confirm-i-am-not-dry-running     Required with --apply to actually WRITE.
  --help                             Show this help.

Idempotent: it recomputes from the answers and writes only rows that differ, so a
second run reports needsUpdate=0. It never blanks a value that is already stored:
this reads only the LATEST submission, so a missing answer there means "this
submission has none", NOT "the person retracted it". It ADDS and CORRECTS; it
never subtracts.

⚠️ Run AFTER the marketplace FTS trigger is applied (deploy runs
scripts/migrate-custom-sql-init.ts). The trigger recomputes search_vector only on
INSERT/UPDATE, and this backfill is idempotent — rows written under a stale
trigger would stay unsearchable by business name permanently. Recovery step:
docs/runbooks/backfill-operator-residuals.md.

Examples:
  tsx scripts/_backfill-marketplace-card-fields.ts --dry-run
  tsx scripts/_backfill-marketplace-card-fields.ts --apply --confirm-i-am-not-dry-running
`;

export interface Args {
  dryRun: boolean;
  apply: boolean;
  confirmLive: boolean;
}

export function parseArgs(argv: string[]): Args {
  const flags: Record<string, true> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (!KNOWN_FLAGS.has(key)) {
      throw new Error(`Unknown flag --${key}. Known flags: ${[...KNOWN_FLAGS].join(', ')}`);
    }
    flags[key] = true;
  }
  return {
    dryRun: flags['dry-run'] === true,
    apply: flags['apply'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
  };
}

export function formatSummary(result: MarketplaceCardBackfillResult): string {
  return [
    `\nSummary (${result.dryRun ? 'PREVIEW' : 'LIVE'}):`,
    `  scanned ................. ${result.scanned}`,
    // [AI-Review][Low] 2026-08-17 — say the DIRECTION, not just the count. These
    // are only ever additions or corrections: the backfill never blanks a stored
    // value, so a non-zero count here can't mean data was removed.
    `  experience_level set/fixed ${result.experienceChanged}   (never blanked)`,
    `  business_name added/fixed  ${result.businessNameChanged}   (never blanked)`,
    `  rows needing update ..... ${result.needsUpdate}`,
    `  rows WRITTEN ............ ${result.updated}`,
    `  answers from adopted set  ${result.fromAdoptedAnswers}`,
    `  no answer source ........ ${result.noAnswerSource}`,
    `  experience unresolvable . ${result.unresolvedExperience}`,
    // [AI-Review][Medium] 2026-08-18 — the operator must see this BEFORE --apply.
    `  business_name contains own name  ${result.businessNameLikePersonName}`,
    '',
  ].join('\n');
}

async function run(live: boolean): Promise<number> {
  const result = await backfillMarketplaceCardFields({ apply: live });
  console.log(formatSummary(result));
  if (result.dryRun) {
    console.log('  PREVIEW only — re-run with --apply --confirm-i-am-not-dry-running to write.\n');
  } else {
    console.log('  Verify: SELECT experience_level, count(*) FROM marketplace_profiles GROUP BY 1;\n');
  }
  if (result.businessNameLikePersonName > 0) {
    console.log(
      `  NOTE: ${result.businessNameLikePersonName} card(s) would publish a business_name that\n` +
      "        CONTAINS the respondent's own first or last name (e.g. \"Adekemi Fashion House\").\n" +
      '        Nothing is suppressed — the consent copy names profession/LGA/experience only, so\n' +
      '        whether a self-named signboard publishes is a disclosure call for Awwal (R7).\n',
    );
  }
  if (result.unresolvedExperience > 0) {
    console.log(
      `  NOTE: ${result.unresolvedExperience} row(s) have a years_experience answer that cannot be\n` +
      '        bucketed without guessing. Any experience_level already stored on them is KEPT\n' +
      '        exactly as-is — never fabricated, and never blanked.\n',
    );
  }
  return 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  const args = parseArgs(argv);

  if (args.apply) {
    if (!args.confirmLive) {
      console.error('ERROR: --apply also needs --confirm-i-am-not-dry-running to write.');
      process.exit(1);
    }
    process.exit(await run(true));
  }
  if (!args.dryRun) {
    console.error('ERROR: pass --dry-run, or --apply --confirm-i-am-not-dry-running to write.');
    process.exit(1);
  }
  process.exit(await run(false));
}

// Only invoke when executed directly via tsx (vitest sets VITEST=true).
if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'marketplace_card_backfill.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}

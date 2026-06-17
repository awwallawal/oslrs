/**
 * Story 9-38 (AC#6) — one-shot idempotent backfill: provision passwordless
 * `public_user` accounts for wizard respondents that predate Story 9-38.
 *
 * THE GAP: post-9-12 the wizard created a `respondents` row only — no account.
 * Story 9-38 wires account-creation into the live submit path, but every
 * respondent registered BETWEEN 9-12 and 9-38 has no `users` row and therefore
 * cannot sign in by magic-link (9-16) or password. This recovers them.
 *
 * Email recovery (because `respondents` has NO email column):
 *   - The wizard persists the registrant's email to `submissions.raw_data.email`
 *     (Story 9-26 unified-ingestion). That is the canonical recovery source.
 *   - `wizard_drafts.email` is NOT joinable to a respondent (drafts are keyed by
 *     email, pre-account, and DELETED on submit), so it is not used here.
 *   - A respondent with NO recoverable email is SKIPPED + counted (cannot
 *     provision an account without an address). Pending-NIN rows ARE included
 *     (an account lets them return to complete their NIN).
 *
 * Idempotent + no-clobber:
 *   - Candidate set = `source = 'public' AND user_id IS NULL`. Re-runs naturally
 *     skip rows already linked.
 *   - Account creation goes through `AuthService.provisionPublicUserForWizard`
 *     (onConflictDoNothing on email → links to an existing account, never
 *     clobbers it).
 *   - The link-write re-checks `user_id IS NULL` inside a row-locked txn, so a
 *     row linked between selection and write is a no-op.
 *
 * Audit: account creation emits `data.create` (inside the provisioning method);
 * the respondent↔account link emits `data.update` with an operator marker. No
 * new audit-action key (reuses existing keys per the story).
 *
 * Mirrors `_backfill-reference-code.ts` discipline:
 *   - PREVIEW BY DEFAULT (`--dry-run`); WRITES only with
 *     `--apply --confirm-i-am-not-dry-running`.
 *
 * Usage:
 *   tsx scripts/_backfill-wizard-public-users.ts --dry-run [--max-rows N]
 *   tsx scripts/_backfill-wizard-public-users.ts --apply --confirm-i-am-not-dry-running [--max-rows N]
 *
 * Exit codes: 0 success, 1 on bad args / any per-row failure.
 */
import os from 'node:os';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { AuthService } from '../src/services/auth.service.js';
import { buildRegistrantFullName } from '../src/utils/registrant-name.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../src/services/audit.service.js';
import pino from 'pino';

const logger = pino({ name: 'wizard-public-user-backfill' });

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'apply',
  'confirm-i-am-not-dry-running',
  'max-rows',
  'help',
]);

const HELP_TEXT = `
Story 9-38 — wizard public-user account backfill.

Provisions a passwordless public_user account for every public-wizard respondent
that has no linked account (user_id IS NULL) and a recoverable email.

  --dry-run                          Preview: count + sample, no writes (default).
  --apply                            Switch to apply mode (still PREVIEW unless confirmed).
  --confirm-i-am-not-dry-running     Required with --apply to actually WRITE.
  --max-rows N                       Cap rows processed this run (default: all).
  --help                             Show this help.

Examples:
  tsx scripts/_backfill-wizard-public-users.ts --dry-run
  tsx scripts/_backfill-wizard-public-users.ts --apply --confirm-i-am-not-dry-running
`;

export interface Args {
  dryRun: boolean;
  apply: boolean;
  confirmLive: boolean;
  maxRows: number | null;
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
  return {
    dryRun: flags['dry-run'] === true,
    apply: flags['apply'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    maxRows: typeof maxRowsRaw === 'string' ? Math.max(1, parseInt(maxRowsRaw, 10)) : null,
  };
}

export interface CandidateRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

/**
 * Pure partition: recoverable rows have a non-empty email; the rest are
 * unrecoverable (skipped). Extracted so the skip-path logic is unit-testable
 * without a database.
 */
export function partitionCandidates(rows: CandidateRow[]): {
  recoverable: CandidateRow[];
  unrecoverable: CandidateRow[];
} {
  const recoverable: CandidateRow[] = [];
  const unrecoverable: CandidateRow[] = [];
  for (const row of rows) {
    if (row.email && row.email.trim().length > 0) recoverable.push(row);
    else unrecoverable.push(row);
  }
  return { recoverable, unrecoverable };
}

/**
 * Build the account display name from the respondent identity columns.
 * Delegates to the shared helper so the wizard, the provisioning service, and
 * this backfill all derive names identically (Story 9-38 review #6).
 */
export function deriveFullName(row: CandidateRow): string {
  return buildRegistrantFullName(row.firstName, row.lastName);
}

async function fetchCandidates(maxRows: number | null): Promise<CandidateRow[]> {
  const limitClause = maxRows ? sql`LIMIT ${maxRows}` : sql``;
  const result = (await db.execute(sql`
    SELECT
      r.id,
      r.first_name,
      r.last_name,
      (
        SELECT s.raw_data->>'email'
        FROM submissions s
        WHERE s.respondent_id = r.id
          AND s.raw_data->>'email' IS NOT NULL
          AND s.raw_data->>'email' <> ''
        ORDER BY s.submitted_at DESC
        LIMIT 1
      ) AS email
    FROM respondents r
    WHERE r.source = 'public' AND r.user_id IS NULL
    ORDER BY r.created_at ASC
    ${limitClause}
  `)) as {
    rows: Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>;
  };
  return result.rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
  }));
}

async function runDryRun(args: Args): Promise<number> {
  const candidates = await fetchCandidates(args.maxRows);
  const { recoverable, unrecoverable } = partitionCandidates(candidates);

  console.log(`\n[DRY-RUN] ${candidates.length} public-wizard respondent(s) without an account.`);
  console.log(`  recoverable (have email):   ${recoverable.length}`);
  console.log(`  unrecoverable (no email):   ${unrecoverable.length} (will be SKIPPED)`);
  if (args.maxRows && candidates.length === args.maxRows) {
    console.warn(`  [WARN] Hit the --max-rows cap (${args.maxRows}); more rows may remain.`);
  }
  for (const row of recoverable.slice(0, 10)) {
    console.log(`  WOULD PROVISION ${row.id.slice(0, 8)}…  (${maskEmail(row.email!)})`);
  }
  if (recoverable.length > 10) console.log(`  … and ${recoverable.length - 10} more.`);
  console.log('\n  This was a PREVIEW. Re-run with --apply --confirm-i-am-not-dry-running to write.\n');
  return 0;
}

/** Light masking so the preview never prints full PII to the operator console. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

async function runApply(args: Args): Promise<number> {
  const candidates = await fetchCandidates(args.maxRows);
  const { recoverable, unrecoverable } = partitionCandidates(candidates);
  const live = args.confirmLive;
  const operatorHost = os.hostname();
  const operatorInvocation = `wizard-public-user-backfill ${process.argv.slice(2).join(' ')}`;

  let provisioned = 0;
  let alreadyLinked = 0;
  let failed = 0;
  const skipped = unrecoverable.length;

  for (const row of recoverable) {
    if (!live) {
      provisioned++;
      continue;
    }
    try {
      const fullName = deriveFullName(row);
      const { userId, created } = await AuthService.provisionPublicUserForWizard({
        email: row.email!,
        fullName,
        ipAddress: operatorHost,
        userAgent: operatorInvocation,
      });

      const outcome = await db.transaction(async (tx) => {
        // Drift / idempotency guard — re-check the row is still unlinked.
        const current = (await tx.execute(sql`
          SELECT "user_id" FROM "respondents" WHERE "id" = ${row.id} FOR UPDATE
        `)) as { rows: Array<{ user_id: string | null }> };
        if (current.rows.length === 0) return 'missing' as const;
        if (current.rows[0].user_id != null) return 'noop' as const;

        await tx.execute(sql`
          UPDATE "respondents"
          SET "user_id" = ${userId}, "updated_at" = now()
          WHERE "id" = ${row.id}
        `);
        await AuditService.logActionTx(tx, {
          actorId: null,
          action: AUDIT_ACTIONS.DATA_UPDATE,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: row.id,
          details: {
            operator_marker: 'wizard_public_user_backfill',
            user_id: userId,
            account_created: created,
          },
          ipAddress: operatorHost,
          userAgent: operatorInvocation,
        });
        return 'linked' as const;
      });

      if (outcome === 'linked') provisioned++;
      else alreadyLinked++;
    } catch (err) {
      failed++;
      logger.error({
        event: 'wizard_public_user_backfill.row_failed',
        respondentId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Preview (`--apply` without `--confirm`) prints the same masked sample as
  // `--dry-run` so the two preview paths give the operator identical visibility
  // (Story 9-38 review #5).
  if (!live) {
    for (const row of recoverable.slice(0, 10)) {
      console.log(`  WOULD PROVISION ${row.id.slice(0, 8)}…  (${maskEmail(row.email!)})`);
    }
    if (recoverable.length > 10) console.log(`  … and ${recoverable.length - 10} more.`);
  }

  const verb = live ? 'provisioned' : 'would-provision';
  console.log(
    `\nSummary (${live ? 'LIVE' : 'PREVIEW'}): ${verb}=${provisioned} ` +
      `already-linked=${alreadyLinked} skipped-no-email=${skipped} failed=${failed}`,
  );
  if (!live && provisioned > 0) {
    console.log('  This was a PREVIEW. Re-run with --confirm-i-am-not-dry-running to write.\n');
  }
  return failed > 0 ? 1 : 0;
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
    logger.error({ event: 'wizard_public_user_backfill.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}

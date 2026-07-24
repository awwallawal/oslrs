/**
 * Story 13-21 (AC5) — idempotent backfill of the registration auto-emails that
 * NEVER fired for the public channel (0/140 markers).
 *
 * Root cause (AC1): the public wizard writes its submission as `processed:true`
 * and bypasses `SubmissionProcessingService.processSubmission`, where the 9-58
 * reference-code confirmation + the 13-12 evergreen thank-you/referral live — so
 * neither ever sent for a public registration. AC2 fixes the go-forward path;
 * this script retroactively sends to the REAL public completers who missed them
 * (Modupe + any post-13-12 public registrants).
 *
 * Idempotent BY CONSTRUCTION: it routes through the SAME shared entrypoint the
 * live path uses — `SubmissionProcessingService.sendRegistrationAutoEmails` —
 * which self-checks the per-respondent send-once markers
 * (`metadata.confirmation_email_sent_at` / `metadata.thankyou_referral_sent_at`),
 * the 13-9 suppression list, and the source='public' gate. Re-running never
 * double-sends. Suppressed addresses are additionally skipped up front (AC5 —
 * honour suppression). Test/synthetic rows are excluded.
 *
 * Mirrors the `_backfill-reference-code.ts` / `_thankyou-referral-blast.ts`
 * discipline:
 *   - PREVIEW BY DEFAULT. `--dry-run` (mandatory first) counts + samples, no sends.
 *   - LIVE requires the deliberately ugly `--confirm-i-am-not-dry-running` flag.
 *   - EmailService must be enabled (real provider present) for a live run.
 *
 * Usage:
 *   tsx scripts/_backfill-registration-autosends.ts --dry-run
 *   tsx scripts/_backfill-registration-autosends.ts --apply --confirm-i-am-not-dry-running [--max-rows N] [--rate-per-minute N]
 *
 * Exit codes: 0 success, 1 on bad args / prerequisite failure / any per-row send failure.
 */
import os from 'node:os';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { EmailService } from '../src/services/email.service.js';
// Story 13-24 (AC3b) — the SHARED marketing filter, replacing the bespoke suppression call.
// The welcome backfill inherits the recent-contact gap in the REVERSE direction too: if a blast
// already reached an address inside the window, this run holds the welcome back rather than
// stacking a second email on it. (The forward direction — welcome then blast — is enforced by
// the same filter in the three blast cohort builders.)
import { filterMarketingCohort } from '../src/services/campaign-contact.service.js';
import { SubmissionProcessingService } from '../src/services/submission-processing.service.js';
import type { RespondentMetadata } from '../src/db/schema/respondents.js';
import pino from 'pino';

const logger = pino({ name: 'registration-autosend-backfill' });

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'apply',
  'confirm-i-am-not-dry-running',
  'max-rows',
  'rate-per-minute',
  'help',
]);

const HELP_TEXT = `
Story 13-21 (AC5) — backfill registration auto-emails (confirmation + thank-you/referral)
for the real public completers who missed them (0/140 markers).

  --dry-run                          Preview: count + masked sample, no sends (mandatory first).
  --apply                            Switch to apply mode (still PREVIEW unless confirmed).
  --confirm-i-am-not-dry-running     Required with --apply to actually SEND.
  --max-rows N                       Cap respondents processed this run (default: all).
  --rate-per-minute N                Max sends/min (default 10) — cap, not target.
  --help                             Show this help.

Idempotent: routes through SubmissionProcessingService.sendRegistrationAutoEmails, which
honours the send-once markers + 13-9 suppression + source='public' gate. Suppressed and
test/synthetic rows are skipped. Safe to re-run.

Examples:
  tsx scripts/_backfill-registration-autosends.ts --dry-run
  tsx scripts/_backfill-registration-autosends.ts --apply --confirm-i-am-not-dry-running --rate-per-minute 10
`;

// Exclude test / synthetic rows from a real send (AC5 — "NEVER to test rows").
// Reserved + throwaway domains and the dry-run flip fixtures used during 13-x
// verification. The operator ALSO eyeballs the dry-run sample before applying.
export const TEST_EMAIL_RE =
  /(@(oslsr\.test|oslrs\.test|example\.(com|org|net)|test\.com|mailinator\.com|dev\.local)$)|(\+test@)|(^dryrun[-.])|(^test[-.].*@)/i;

export function isTestEmail(email: string): boolean {
  return TEST_EMAIL_RE.test(email.trim().toLowerCase());
}

export interface Args {
  dryRun: boolean;
  apply: boolean;
  confirmLive: boolean;
  maxRows: number | null;
  ratePerMinute: number;
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
  const rateRaw = flags['rate-per-minute'];
  const ratePerMinute = typeof rateRaw === 'string' ? Number(rateRaw) : 10;
  if (!Number.isFinite(ratePerMinute) || ratePerMinute <= 0) {
    throw new Error(`--rate-per-minute must be a positive number (got ${String(rateRaw)})`);
  }
  return {
    dryRun: flags['dry-run'] === true,
    apply: flags['apply'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    maxRows: typeof maxRowsRaw === 'string' ? Math.max(1, parseInt(maxRowsRaw, 10)) : null,
    ratePerMinute,
  };
}

export interface CandidateRow {
  respondentId: string;
  firstName: string | null;
  email: string;
  referenceCode: string | null;
  status: string;
  confirmationSentAt: string | null;
  thankyouSentAt: string | null;
  createdAt: Date;
}

export async function fetchCandidates(maxRows: number | null): Promise<CandidateRow[]> {
  const limitClause = maxRows ? sql`LIMIT ${maxRows}` : sql``;
  // Public respondents missing AT LEAST ONE auto-send marker, with a resolvable
  // email (provisioned account first, else the most-recent magic-link token).
  const result = (await db.execute(sql`
    SELECT DISTINCT ON (r.id)
      r.id AS respondent_id,
      r.first_name,
      r.reference_code,
      r.status,
      COALESCE(u.email, mlt.email) AS email,
      (r.metadata->>'confirmation_email_sent_at') AS confirmation_sent_at,
      (r.metadata->>'thankyou_referral_sent_at') AS thankyou_sent_at,
      r.created_at
    FROM respondents r
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN magic_link_tokens mlt ON mlt.respondent_id = r.id
    WHERE r.source = 'public'
      AND (
        (r.metadata->>'confirmation_email_sent_at') IS NULL
        OR (r.metadata->>'thankyou_referral_sent_at') IS NULL
      )
      AND COALESCE(u.email, mlt.email) IS NOT NULL
      AND COALESCE(u.email, mlt.email) <> ''
    ORDER BY r.id, mlt.created_at DESC NULLS LAST
    ${limitClause}
  `)) as {
    rows: Array<{
      respondent_id: string;
      first_name: string | null;
      reference_code: string | null;
      status: string;
      email: string;
      confirmation_sent_at: string | null;
      thankyou_sent_at: string | null;
      created_at: string | Date;
    }>;
  };
  return result.rows.map((r) => ({
    respondentId: r.respondent_id,
    firstName: r.first_name,
    email: String(r.email),
    referenceCode: r.reference_code,
    status: r.status,
    confirmationSentAt: r.confirmation_sent_at,
    thankyouSentAt: r.thankyou_sent_at,
    createdAt: new Date(r.created_at),
  }));
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  // Story 13-21 (review L5) — show at most the first 2 chars and ALWAYS emit
  // >=3 asterisks so short local-parts (e.g. `ab@x.com`) are still masked in the
  // dry-run sample / operator logs rather than printed verbatim.
  const head = email.slice(0, Math.min(2, at));
  return `${head}${'*'.repeat(Math.max(3, at - head.length))}${email.slice(at)}`;
}

/** Which emails a candidate is (still) missing — drives the dry-run report. */
function missingKinds(row: CandidateRow): string[] {
  const kinds: string[] = [];
  if (!row.confirmationSentAt && row.referenceCode) kinds.push('confirmation');
  if (!row.thankyouSentAt) kinds.push('thankyou');
  return kinds;
}

async function readMarkers(
  respondentId: string,
): Promise<{ confirmation: boolean; thankyou: boolean }> {
  const row = await db.query.respondents.findFirst({
    where: (r, { eq }) => eq(r.id, respondentId),
    columns: { metadata: true },
  });
  const md = (row?.metadata ?? null) as RespondentMetadata | null;
  return {
    confirmation: !!md?.confirmation_email_sent_at,
    thankyou: !!md?.thankyou_referral_sent_at,
  };
}

async function selectEligible(args: Args): Promise<{
  eligible: CandidateRow[];
  suppressedSkipped: number;
  recentlyContactedSkipped: number;
  duplicatesSkipped: number;
  gapDays: number;
  testSkipped: number;
  total: number;
}> {
  const candidates = await fetchCandidates(args.maxRows);
  const notTest = candidates.filter((c) => !isTestEmail(c.email));
  const testSkipped = candidates.length - notTest.length;
  const filtered = await filterMarketingCohort(notTest, (c) => c.email);
  return {
    eligible: filtered.cohort,
    suppressedSkipped: filtered.suppressedSkipped,
    recentlyContactedSkipped: filtered.recentlyContactedSkipped,
    duplicatesSkipped: filtered.duplicatesSkipped,
    gapDays: filtered.gapDays,
    testSkipped,
    total: candidates.length,
  };
}

async function runDryRun(args: Args): Promise<number> {
  const { eligible, suppressedSkipped, recentlyContactedSkipped, duplicatesSkipped, gapDays, testSkipped, total } =
    await selectEligible(args);
  console.log(`\n[DRY-RUN] ${total} public respondent(s) missing >=1 auto-send marker.`);
  // Story 13-24 (AC5 iii) — counts honesty: this output IS the cohort size, and it says why rows dropped.
  console.log(
    `[DRY-RUN] skipping test rows=${testSkipped}, suppressed=${suppressedSkipped}, ` +
      `contacted-within-${gapDays}d=${recentlyContactedSkipped}, intra-run-duplicates=${duplicatesSkipped}.`,
  );
  console.log(`[DRY-RUN] ${eligible.length} eligible to backfill:\n`);
  for (const row of eligible.slice(0, 25)) {
    const kinds = missingKinds(row);
    console.log(
      `  ${maskEmail(row.email).padEnd(36)} would-send=[${kinds.join(', ') || 'none'}]` +
        ` ref=${row.referenceCode ?? '—'} status=${row.status} respondent=${row.respondentId.slice(0, 8)}…`,
    );
  }
  if (eligible.length > 25) console.log(`  … and ${eligible.length - 25} more.`);
  console.log('\n  PREVIEW only — re-run with --apply --confirm-i-am-not-dry-running to send.\n');
  return 0;
}

async function runApply(args: Args): Promise<number> {
  const live = args.confirmLive;
  if (live && !EmailService.isEnabled()) {
    console.error('ERROR: EmailService is disabled — cannot send. Check the Resend env config.');
    return 1;
  }

  const { eligible, suppressedSkipped, recentlyContactedSkipped, duplicatesSkipped, gapDays, testSkipped, total } =
    await selectEligible(args);
  console.log(
    `\n[${live ? 'LIVE' : 'PREVIEW'}] total=${total} testSkipped=${testSkipped} ` +
      `suppressedSkipped=${suppressedSkipped} recentlyContactedSkipped=${recentlyContactedSkipped} ` +
      `duplicatesSkipped=${duplicatesSkipped} (gap=${gapDays}d) eligible=${eligible.length}`,
  );

  const delayMs = Math.ceil(60_000 / args.ratePerMinute);
  let confirmationsSent = 0;
  let thankyousSent = 0;
  let processed = 0;
  let failed = 0;
  const operatorHost = os.hostname();

  for (let i = 0; i < eligible.length; i++) {
    const row = eligible[i];
    if (!live) {
      processed++;
      continue;
    }
    const before = missingKinds(row);
    try {
      await SubmissionProcessingService.sendRegistrationAutoEmails({
        respondentId: row.respondentId,
        email: row.email,
        referenceCode: row.referenceCode ?? undefined,
        status: row.status,
        isNew: true, // backfill = first delivery; the send-once markers still gate it
      });
      // Re-read the markers to learn what ACTUALLY got sent (the shared method is
      // fail-soft + void; the stamped marker is the source of truth).
      const after = await readMarkers(row.respondentId);
      const confSent = before.includes('confirmation') && after.confirmation;
      const tySent = before.includes('thankyou') && after.thankyou;
      if (confSent) confirmationsSent++;
      if (tySent) thankyousSent++;
      const stillMissing =
        (before.includes('confirmation') && !after.confirmation) ||
        (before.includes('thankyou') && !after.thankyou);
      if (stillMissing) {
        failed++;
        logger.warn({
          event: 'registration_autosend_backfill.partial_or_failed',
          respondentId: row.respondentId,
          before,
          after,
        });
      } else {
        logger.info({
          event: 'registration_autosend_backfill.sent',
          respondentId: row.respondentId,
          confirmation: confSent,
          thankyou: tySent,
          operatorHost,
        });
      }
      processed++;
    } catch (err) {
      failed++;
      logger.error({
        event: 'registration_autosend_backfill.row_failed',
        respondentId: row.respondentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (live && i < eligible.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const verb = live ? 'sent' : 'would-process';
  console.log(
    `\nSummary (${live ? 'LIVE' : 'PREVIEW'}): ${verb}=${processed} ` +
      `confirmations=${confirmationsSent} thankyous=${thankyousSent} failed=${failed}\n`,
  );
  if (!live && processed > 0) {
    console.log('  PREVIEW only — re-run with --confirm-i-am-not-dry-running to send.\n');
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
    console.error('ERROR: pass --dry-run, or --apply --confirm-i-am-not-dry-running to send.');
    process.exit(1);
  }
  process.exit(await runDryRun(args));
}

// Only invoke when executed directly via tsx (vitest sets VITEST=true).
if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'registration_autosend_backfill.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}

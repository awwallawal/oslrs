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
import pino from 'pino';

const logger = pino({ name: 'registration-autosend-backfill' });

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'apply',
  'confirm-i-am-not-dry-running',
  'max-rows',
  'rate-per-minute',
  /**
   * Story 13-65 (review C2 / finding R1) — ⚠️ REGISTERING THE FLAG IS WHAT MAKES IT EXIST.
   *
   * `--verify` shipped with help text, an `Args` field, a `main()` branch and a fully-written
   * `verifyDelivery()` — and `parseArgs` hard-throws on any flag absent from THIS set, so the whole
   * feature was unreachable: `FATAL: Unknown flag --verify`. Nothing caught it, because
   * `apps/api/scripts/` is outside tsconfig and has no tests, so `tsc`, eslint and 4206 passing
   * tests were all structurally incapable of seeing it. [[pattern-ship-a-fix-that-never-fires]] —
   * in the item that was claimed to close two holes on its own.
   *
   * ➜ A flag added here must be proven by RUNNING the script, never by typechecking it.
   */
  'verify',
  'help',
]);

const HELP_TEXT = `
Story 13-21 (AC5) — backfill registration auto-emails (confirmation + thank-you/referral)
for the real public completers who missed them (0/140 markers).

  --dry-run                          Preview: count + masked sample, no sends (mandatory first).
  --apply                            Switch to apply mode (still PREVIEW unless confirmed).
  --confirm-i-am-not-dry-running     Required with --apply to actually SEND.
  --max-rows N                       Cap respondents processed this run (default: all).
  --verify                           Read the delivery markers DIRECTLY (no cohort filter) and report
                                     what the worker has actually delivered. Run after the queue drains.
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
  /** Story 13-65 (review B8) — read the delivery markers directly; no cohort filter in the path. */
  verify: boolean;
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
    verify: flags['verify'] === true,
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

/**
 * Story 13-65 — `readMarkers()` REMOVED, and its removal is the point rather than a tidy-up.
 *
 * It existed to re-read the send-once markers immediately after each send, so the run report said
 * what had ACTUALLY been delivered rather than what had been attempted. That worked because the
 * send was inline. It no longer is: the sends are jobs on `email-notification`, and the WORKER
 * stamps the markers seconds to minutes later. An immediate re-read would now return a guaranteed
 * `false` for every row and report a fully successful run as a total failure.
 *
 * The capability is not lost, it moved: `missingKinds()` above is marker-derived and drives the
 * dry-run report, so re-running with `--dry-run` after the queue drains gives the same evidence
 * from the same source of truth. The apply pass prints that instruction.
 */

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
      /**
       * ⚠️ Story 13-65 — THIS IS NOW AN ENQUEUE, AND THE RUN REPORT BELOW HAD TO CHANGE WITH IT.
       *
       * `sendRegistrationAutoEmails` used to dial the provider inline, so re-reading the send-once
       * markers immediately afterwards told you what had ACTUALLY been sent. It now adds two job
       * records to `email-notification`; the email worker runs the guards, sends, and stamps the
       * markers — five jobs at a time, seconds to minutes later.
       *
       * So an immediate marker re-read would find NOTHING stamped and report every single row as
       * failed. That is not a cosmetic problem: a run tracker that reports 100% failure on a
       * successful run is [[pattern-a-record-about-the-work-is-not-the-work]], and the operator's
       * next move would be to re-run it. This loop therefore counts ENQUEUES, and confirming
       * delivery is a SEPARATE pass — re-run with **`--verify`** once the queue has drained.
       * ⚠️ review C8 — this used to say `--dry-run`, and that was DISPROVEN: `selectEligible` applies
       * the marketing contact gap, so a delivered thank-you drops its address out of "eligible" via
       * the LEDGER, not via the marker — including for a row whose confirmation half failed every
       * attempt. `--verify` reads the markers directly, with no cohort filter in the path.
       */
      await SubmissionProcessingService.sendRegistrationAutoEmails({
        respondentId: row.respondentId,
        email: row.email,
        referenceCode: row.referenceCode ?? undefined,
        status: row.status,
        isNew: true, // backfill = first delivery; the send-once markers still gate it
      });
      /**
       * Story 13-65 (review B8 / finding M8) — THIS COUNTS ENQUEUES, AND ONLY ENQUEUES.
       *
       * ⚠️ Two things this number is NOT, both of which the earlier wording implied it was:
       *
       * 1. It is not DELIVERY. The worker sends and stamps, seconds to minutes later.
       * 2. It is not even a guaranteed enqueue. `queueRegistration*Email()` returns
       *    `'dedup-skipped'` on a `checkDedup` hit (300s TTL, keyed recipient+type), and this loop
       *    cannot see that return value — it goes through `sendRegistrationAutoEmails`. Two
       *    respondents sharing one address inside the same five minutes is exactly the shape that
       *    triggers it, and a backfill cohort is where that shape lives.
       *
       * ⭐ BOTH holes are closed by the SAME thing: `--verify` below reads the markers DIRECTLY. A
       * dedup-skipped job never sends, so its marker is never stamped, so `--verify` reports it as
       * still missing. That is why the verify pass reads markers rather than re-running the cohort
       * query — see the block on `--verify`.
       */
      if (before.includes('confirmation')) confirmationsSent++;
      if (before.includes('thankyou')) thankyousSent++;
      logger.info({
        event: 'registration_autosend_backfill.enqueued',
        respondentId: row.respondentId,
        confirmation: before.includes('confirmation'),
        thankyou: before.includes('thankyou'),
        operatorHost,
      });
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

  // Story 13-65 — the verb is `enqueued`, not `sent`, and the difference is the whole point: these
  // rows are now jobs on `email-notification`, not completed provider calls.
  const verb = live ? 'enqueued' : 'would-process';
  console.log(
    `\nSummary (${live ? 'LIVE' : 'PREVIEW'}): ${verb}=${processed} ` +
      `confirmations=${confirmationsSent} thankyous=${thankyousSent} enqueue-failed=${failed}\n`,
  );
  if (live && processed > 0) {
    console.log(
      '  ⚠️ ENQUEUED, NOT YET SENT (Story 13-65). The email worker runs the guards, sends, and\n' +
        '     stamps the send-once markers 5 jobs at a time. `enqueued` above is NOT a delivery\n' +
        '     count.\n' +
        '     TO CONFIRM DELIVERY: wait for the queue to drain (Operations dashboard → queue\n' +
        '     depths, or MonitoringService.getSystemHealth queues[].waiting), then re-run this\n' +
        '     script with --verify.\n' +
        '     ⚠️ NOT --dry-run. That was the instruction here until 2026-08-23 and it is DISPROVEN:\n' +
        '     the dry-run cohort passes through filterMarketingCohort, so a delivered thank-you\n' +
        '     drops its address out of "eligible" via the 5-day CONTACT GAP, not via the marker —\n' +
        '     including for a row whose CONFIRMATION half failed every attempt (the confirmation is\n' +
        '     transactional and writes no campaign_sends row). The count going to ~0 would have\n' +
        '     reported such a row as delivered. --verify reads the markers directly, with no cohort\n' +
        '     filter in the path.\n',
    );
  }
  if (!live && processed > 0) {
    console.log('  PREVIEW only — re-run with --confirm-i-am-not-dry-running to enqueue.\n');
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

  if (args.verify) {
    process.exit(await verifyDelivery(args));
  }
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

/**
 * Story 13-65 (review B8 / finding M8) — `--verify`: THE ONLY HONEST DELIVERY EVIDENCE.
 *
 * ⚠️ WHY THE `--dry-run` RE-RUN WAS NOT ENOUGH, even though it looked like it. `selectEligible`
 * pipes candidates through `filterMarketingCohort`, which applies the 5-day contact gap against
 * `campaign_sends`. A successful thank-you WRITES that ledger row — so after a run the address drops
 * out of "eligible" **via the gap**, not via the marker. The count going to ~0 therefore proves the
 * CONTACT GAP fired, which it would also do for a row whose CONFIRMATION half failed all three
 * attempts (the confirmation is transactional and writes no ledger row at all). Such a row would be
 * silently reported as delivered.
 *
 * This reads `metadata.confirmation_email_sent_at` / `metadata.thankyou_referral_sent_at` straight
 * off the respondents, with NO cohort filter in the path. Those markers are stamped by the worker
 * only after a confirmed dispatch, so they are the one fact that means "this citizen was emailed".
 *
 * It also catches a silently dropped enqueue (`'dedup-skipped'`): no send, no marker, still missing.
 */
async function verifyDelivery(args: Args): Promise<number> {
  /**
   * Story 13-65 (review C4 / finding R8) — QUERY THE BASE POPULATION, NOT THE CANDIDATES.
   *
   * ⚠️ The first version re-ran `fetchCandidates`, which selects respondents MISSING at least one
   * marker. Every row it returns is therefore missing one by construction, so `bothDelivered` was
   * ~always 0 and the pass could never report success — a verification that structurally cannot
   * produce a pass is worse than none, because a run that DID deliver still reads as a failure and
   * the operator's next move is to re-run it.
   *
   * This reads the same BASE population the backfill draws from — public respondents with a
   * resolvable email — regardless of marker state, and reports the split. No cohort filter is in
   * the path, so a row that dropped out of "eligible" because a thank-you wrote a `campaign_sends`
   * row (the 5-day gap) is still counted here on the only fact that means delivery: the marker.
   */
  const limitClause = args.maxRows ? sql`LIMIT ${args.maxRows}` : sql``;
  const result = await db.execute(sql`
    SELECT DISTINCT ON (r.id)
      r.id::text AS id,
      (r.metadata->>'confirmation_email_sent_at') IS NOT NULL AS has_confirmation,
      (r.metadata->>'thankyou_referral_sent_at')  IS NOT NULL AS has_thankyou
    FROM respondents r
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN magic_link_tokens mlt ON mlt.respondent_id = r.id
    WHERE r.source = 'public'
      AND COALESCE(u.email, mlt.email) IS NOT NULL
      AND COALESCE(u.email, mlt.email) <> ''
    ORDER BY r.id, mlt.created_at DESC NULLS LAST
    ${limitClause}
  `);

  const rows = result.rows as Array<{ id: string; has_confirmation: boolean; has_thankyou: boolean }>;
  if (rows.length === 0) {
    console.log('verify: no public respondents with a resolvable email — nothing to check.');
    return 0;
  }

  let bothDelivered = 0;
  const missing: Array<{ id: string; gaps: string[] }> = [];
  for (const row of rows) {
    const gaps: string[] = [];
    if (!row.has_confirmation) gaps.push('confirmation');
    if (!row.has_thankyou) gaps.push('thankyou');
    if (gaps.length === 0) bothDelivered++;
    else missing.push({ id: row.id, gaps });
  }

  console.log('\n=== verify (delivery MARKERS, read directly; no cohort filter in the path) ===');
  console.log(`population:     ${rows.length} public respondents with a resolvable email`);
  /**
   * ⚠️ review D7 / finding T7 — SAY WHAT THIS POPULATION IS, because it is NOT this backfill's cohort.
   *
   * It is every public respondent with a resolvable email, whether or not this run ever enqueued
   * anything for them: a person who registered after the run, or who was filtered out of the cohort
   * by suppression or the contact gap, appears here as "still missing". So `still missing: 0` is a
   * STRONGER claim than the backfill needs and will rarely be true — reading it as "the run failed"
   * is the misinterpretation to avoid. The number that matters is whether the rows you enqueued
   * have moved, which is why the ids are printed.
   */
  console.log(
    '                (every public respondent with an email — NOT only this run\'s cohort; see below)',
  );
  console.log(`both delivered: ${bothDelivered}`);
  console.log(`still missing:  ${missing.length}`);
  for (const m of missing.slice(0, 25)) console.log(`  ${m.id} — missing ${m.gaps.join(' + ')}`);
  if (missing.length > 25) console.log(`  … and ${missing.length - 25} more`);
  if (missing.length > 0) {
    console.log(
      '\n⚠️  A still-missing marker means the worker has not delivered that half. Either the queue\n' +
        '    has not drained, the job exhausted its attempts, or the enqueue was dropped as a\n' +
        '    duplicate (`dedup-skipped`). Re-run --verify after the queue drains before concluding.',
    );
  }
  logger.info({
    event: 'registration_autosend_backfill.verified',
    population: rows.length,
    bothDelivered,
    stillMissing: missing.length,
  });
  // ⚠️ Exit 0 either way: "some are still missing" is a REPORT, not a failure. A non-zero exit here
  // would make a mid-drain check look like a broken run in any wrapper that checks status codes.
  return 0;
}

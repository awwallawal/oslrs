/**
 * Story 13-11 — Operator-gated Cohort C thank-you + referral blast.
 *
 * One-shot script that thanks the COMPLETED end-to-end registrants (respondents who HAVE a
 * `submissions` row — they finished the Step-4 questionnaire) and invites them to SHARE the public
 * registration link with others who'd benefit. Mirrors the 9-28 supplemental blast structure.
 *
 * NDPA stance (see Story 13-11 Dev Notes): we contact our OWN registrants for a purpose consistent
 * with their registration, and we ask them only to SHARE A PUBLIC LINK — we never solicit a third
 * party's personal data. An opt-out line is included.
 *
 * Attribution (Story 13-9): the referral link is the PUBLIC wizard entry `${PUBLIC_APP_URL}/register`
 * tagged `utm_campaign=thankyou-referral-2026-07&utm_source=referral` — a SHAREABLE link (NOT a
 * per-user magic-link). A referred person who completes flows through 13-1 parseUtm →
 * raw_data.campaign_source. The SEND is also tagged with the same CAMPAIGN_ID (13-9 send-tag) so the
 * delivered/clicked legs land on email_events.campaign_id → ReportService.getCampaignFunnel.
 *
 * Dry-run discipline: --dry-run is MANDATORY for the first invocation.
 * Live run requires the deliberately ugly --confirm-i-am-not-dry-running flag.
 *
 * Usage:
 *   tsx scripts/_thankyou-referral-blast.ts --help        # show usage
 *   tsx scripts/_thankyou-referral-blast.ts --dry-run     # dry-run (mandatory first)
 *   tsx scripts/_thankyou-referral-blast.ts --confirm-i-am-not-dry-running --rate-per-minute 10
 *
 * Exit codes:
 *   0 — successful run (live or dry).
 *   1 — config error, prerequisite failure, or any per-send failures during live.
 */
import os from 'node:os';
import { db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { EmailService } from '../src/services/email.service.js';
import { getSuppressedEmails } from '../src/services/email-events.service.js'; // Story 13-9 (AC2)
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../src/services/audit.service.js';
import {
  buildThankYouEmail,
  buildThankYouReferralUrl,
  escapeHtml,
  firstNameFrom,
} from '../src/services/thankyou-email.js'; // Story 13-12 — shared builder
import pino from 'pino';

const logger = pino({ name: 'thankyou-referral-blast' });

// Story 13-9 — campaign id for BOTH the shareable referral link's utm_campaign AND the send tag, so
// the funnel keys off one id. BUMP per run (e.g. thankyou-referral-2026-07b) to compare rounds.
const CAMPAIGN_ID = 'thankyou-referral-2026-07';

// Cohort C is ~61 (completed + email-reachable) — below Resend Free 100/day, but the Pro-confirm
// flag is wired in case the registry grows or the operator bundles runs.
const RESEND_FREE_TIER_DAILY_LIMIT = 100;
const RESEND_PRO_CONFIRM_THRESHOLD = 80;

// Known CLI flags. parseArgs rejects anything not in this set so a typo cannot slip past the
// dry-run gate. Pattern shared with 9-27/9-28.
export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'confirm-i-am-not-dry-running',
  'confirm-resend-pro-active',
  'rate-per-minute',
  'since',
  'lga',
  'max-recipients',
  'help',
]);

const HELP_TEXT = `Usage: tsx scripts/_thankyou-referral-blast.ts [options]

Options:
  --dry-run                         Mandatory first invocation; prints masked cohort + referral link, no sends
  --confirm-i-am-not-dry-running    Required for live run (deliberately ugly)
  --confirm-resend-pro-active       Required when cohort size >= ${RESEND_PRO_CONFIRM_THRESHOLD}
  --rate-per-minute <N>             Maximum sends per minute (default 10) — cap, not target
  --since <YYYY-MM-DD>              Respondents created on or after this date (parsed as UTC midnight)
  --lga <id>                        Filter by LGA id (respondents.lga_id)
  --max-recipients <N>              Safety cap (default 100; Cohort C is ~61)
  --help                            Show this message and exit

Cohort selection: respondents INNER JOIN submissions (completed end-to-end)
                  + a magic-link-token email exists (= Story 13-11 Cohort C — the thank-you/referral group).
`;

export interface Args {
  dryRun: boolean;
  confirmLive: boolean;
  confirmResendPro: boolean;
  ratePerMinute: number;
  since: Date | null;
  lgaId: string | null;
  maxRecipients: number;
}

export function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (!KNOWN_FLAGS.has(key)) {
      throw new Error(`Unknown flag --${key}. Run with --help for the supported list.`);
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }

  const ratePerMinuteRaw = flags['rate-per-minute'];
  const ratePerMinute = typeof ratePerMinuteRaw === 'string' ? Number(ratePerMinuteRaw) : 10;
  if (!Number.isFinite(ratePerMinute) || ratePerMinute <= 0) {
    throw new Error(`--rate-per-minute must be a positive number (got ${String(ratePerMinuteRaw)})`);
  }

  const maxRecipientsRaw = flags['max-recipients'];
  const maxRecipients = typeof maxRecipientsRaw === 'string' ? Number(maxRecipientsRaw) : 100;
  if (!Number.isFinite(maxRecipients) || maxRecipients <= 0) {
    throw new Error(`--max-recipients must be a positive integer (got ${String(maxRecipientsRaw)})`);
  }

  const sinceRaw = flags.since;
  let since: Date | null = null;
  if (typeof sinceRaw === 'string') {
    const d = new Date(sinceRaw);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`--since must be a valid date (YYYY-MM-DD) — got ${sinceRaw}`);
    }
    since = d;
  }

  const lgaRaw = flags.lga;
  const lgaId = typeof lgaRaw === 'string' ? lgaRaw : null;

  return {
    dryRun: flags['dry-run'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    confirmResendPro: flags['confirm-resend-pro-active'] === true,
    ratePerMinute,
    since,
    lgaId,
    maxRecipients,
  };
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const head = email.slice(0, Math.min(4, at));
  return `${head}${'*'.repeat(Math.max(0, at - head.length))}${email.slice(at)}`;
}

// Story 13-12 — the copy + referral-link builders were extracted to the shared module
// `src/services/thankyou-email.ts` so the blast and the evergreen auto-send stay in lockstep (no
// copy drift). Re-exported here to keep this script's public API + tests stable.
// `buildReferralUrl()` wraps the shared builder with THIS blast's campaign id.
export { escapeHtml, firstNameFrom };
export const buildEmail = buildThankYouEmail;
export function buildReferralUrl(): string {
  return buildThankYouReferralUrl(CAMPAIGN_ID);
}

interface CohortRow {
  respondent_id: string;
  first_name: string | null;
  email: string;
  created_at: Date;
}

export async function selectCohort(args: Args): Promise<CohortRow[]> {
  // Cohort C: respondents WITH a submissions row (completed end-to-end) + a magic-link-token email.
  // DISTINCT ON (r.id) + ORDER BY mlt.created_at DESC picks the most-recent token's email per
  // respondent; the submissions INNER JOIN restricts to completers (collapsed by DISTINCT ON).
  const sinceFragment = args.since ? sql`AND r.created_at >= ${args.since}` : sql``;
  const lgaFragment = args.lgaId ? sql`AND r.lga_id = ${args.lgaId}` : sql``;

  const result = await db.execute(sql`
    SELECT DISTINCT ON (r.id)
      r.id AS respondent_id,
      r.first_name,
      mlt.email,
      r.created_at
    FROM respondents r
    INNER JOIN magic_link_tokens mlt ON mlt.respondent_id = r.id
    INNER JOIN submissions s ON s.respondent_id = r.id
    WHERE mlt.email IS NOT NULL
      AND mlt.email <> ''
      ${sinceFragment}
      ${lgaFragment}
    ORDER BY r.id, mlt.created_at DESC
    LIMIT ${args.maxRecipients}
  `);

  return (result.rows as unknown[]).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      respondent_id: String(r.respondent_id),
      first_name: typeof r.first_name === 'string' ? r.first_name : null,
      email: String(r.email),
      created_at: r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at)),
    };
  });
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const args = parseArgs(argv);

  if (!args.dryRun && !args.confirmLive) {
    logger.error({ event: 'thankyou_referral.missing_confirm' });
    console.error(
      'ERROR: must pass either --dry-run (mandatory first) or --confirm-i-am-not-dry-running (live).',
    );
    process.exit(1);
  }

  if (!EmailService.isEnabled()) {
    logger.error({ event: 'thankyou_referral.email_service_disabled' });
    process.exit(1);
  }

  const referralUrl = buildReferralUrl();

  const rawCohort = await selectCohort(args);
  // Story 13-9 (AC2) — skip suppressed (bounced/complained) addresses before sending.
  const suppressedSet = await getSuppressedEmails(rawCohort.map((r) => r.email));
  const cohort = rawCohort.filter((r) => !suppressedSet.has(r.email.trim().toLowerCase()));
  const suppressedSkipped = rawCohort.length - cohort.length;
  if (suppressedSkipped > 0) {
    logger.info({ event: 'thankyou_referral.suppressed_skipped', skipped: suppressedSkipped });
  }
  logger.info({
    event: 'thankyou_referral.cohort_selected',
    count: cohort.length,
    suppressedSkipped,
    dryRun: args.dryRun,
    since: args.since?.toISOString() ?? null,
    lgaId: args.lgaId,
    maxRecipients: args.maxRecipients,
    referralUrl,
  });

  if (cohort.length === 0) {
    console.log('Cohort C is empty — no completed registrants match the filter. Exiting.');
    process.exit(0);
  }

  if (!args.dryRun && cohort.length >= RESEND_PRO_CONFIRM_THRESHOLD && !args.confirmResendPro) {
    logger.error({
      event: 'thankyou_referral.resend_pro_not_confirmed',
      cohortCount: cohort.length,
      freeTierLimit: RESEND_FREE_TIER_DAILY_LIMIT,
    });
    console.error(
      `ERROR: cohort size ${cohort.length} is at or above Resend Pro confirm threshold ` +
        `(${RESEND_PRO_CONFIRM_THRESHOLD}). Pass --confirm-resend-pro-active to proceed.`,
    );
    process.exit(1);
  }

  if (args.dryRun) {
    console.log(`\n[DRY-RUN] Cohort C: ${cohort.length} recipient(s)`);
    console.log(`[DRY-RUN] Referral link: ${referralUrl}\n`);
    for (const row of cohort) {
      const firstName = firstNameFrom(row.first_name ?? undefined);
      console.log(
        `  ${maskEmail(row.email).padEnd(40)} ${firstName.padEnd(20)} respondent=${row.respondent_id} created=${row.created_at.toISOString()}`,
      );
    }
    console.log(
      `\n[DRY-RUN] No emails sent. To run live, re-invoke with --confirm-i-am-not-dry-running.\n`,
    );
    process.exit(0);
  }

  const delayMs = Math.ceil(60_000 / args.ratePerMinute);
  let sent = 0;
  let failed = 0;
  const startedAt = new Date();
  const operatorHost = os.hostname();
  const operatorInvocation = `tsx scripts/_thankyou-referral-blast.ts (rate=${args.ratePerMinute})`;

  for (let i = 0; i < cohort.length; i++) {
    const row = cohort[i];
    const firstName = firstNameFrom(row.first_name ?? undefined);

    try {
      const emailContent = buildEmail(firstName, referralUrl);

      const result = await EmailService.sendGenericEmail(
        {
          to: row.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        },
        'thankyou-referral', // Story 9-63 meter category
        CAMPAIGN_ID, // Story 13-9 send-tag → email_events.campaign_id → the funnel
      );

      if (result.success) {
        sent++;
        logger.info({
          event: 'thankyou_referral.sent',
          respondentId: row.respondent_id,
          email: row.email,
          messageId: result.messageId ?? null,
        });
        AuditService.logAction({
          actorId: null,
          action: AUDIT_ACTIONS.OPERATOR_THANKYOU_REFERRAL_SENT,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: row.respondent_id,
          details: {
            email: row.email,
            respondent_id: row.respondent_id,
            sent_at: new Date().toISOString(),
            channel: 'email',
            campaign: CAMPAIGN_ID,
            provider_message_id: result.messageId ?? null,
          },
          ipAddress: operatorHost,
          userAgent: operatorInvocation,
        });
        // Story 13-12 (Task 4) — stamp the per-respondent marker so the evergreen auto-send (which
        // fires on completion in submission-processing) never re-thanks anyone this blast reached.
        // JSONB `||` preserves sibling metadata keys. Failure logged, never thrown (parity with 9-58).
        try {
          await db.execute(sql`
            UPDATE "respondents"
            SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${JSON.stringify({ thankyou_referral_sent_at: new Date().toISOString() })}::jsonb
            WHERE "id" = ${row.respondent_id}
          `);
        } catch (markErr) {
          logger.warn({ event: 'thankyou_referral.marker_failed', respondentId: row.respondent_id, error: (markErr as Error).message });
        }
      } else {
        failed++;
        logger.warn({
          event: 'thankyou_referral.send_failed',
          respondentId: row.respondent_id,
          email: row.email,
          error: result.error ?? 'unknown',
        });
      }
    } catch (err) {
      failed++;
      logger.error({
        event: 'thankyou_referral.unhandled',
        respondentId: row.respondent_id,
        email: row.email,
        error: (err as Error).message,
      });
    }

    if (i < cohort.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const finishedAt = new Date();
  console.log(
    `\nSummary: sent=${sent} failed=${failed} total=${cohort.length} ` +
      `elapsed=${Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)}s ` +
      `rate-per-minute=${args.ratePerMinute}\n`,
  );
  logger.info({
    event: 'thankyou_referral.summary',
    sent,
    failed,
    total: cohort.length,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  });

  process.exit(failed > 0 ? 1 : 0);
}

if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'thankyou_referral.fatal', error: (err as Error).message });
    process.exit(1);
  });
}

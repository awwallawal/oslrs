/**
 * Story 9-28 Path B — Operator-gated Cohort A supplemental-survey blast.
 *
 * One-shot script that contacts the Cohort A respondents (already-completed
 * wizard registrations whose Step 4 questionnaire answers are not in the
 * `submissions` table, identified via `LEFT JOIN submissions WHERE s.id IS NULL`)
 * and invites them to complete their skills questionnaire via a new
 * `supplemental_survey` magic-link.
 *
 * Audit-safe framing principle (see Story 9-28 Dev Notes + Option 2 wording):
 * the email is honest about state — the respondent's skills questionnaire IS
 * incomplete in our system — without admitting the underlying cause. NO
 * apology, NO admission, value-prop forward (sector-match incentive).
 *
 * Dry-run discipline: --dry-run is MANDATORY for the first invocation.
 * Live run requires the deliberately ugly --confirm-i-am-not-dry-running flag.
 *
 * Usage:
 *   tsx scripts/_cohort-a-supplemental-survey-blast.ts --help        # show usage
 *   tsx scripts/_cohort-a-supplemental-survey-blast.ts --dry-run     # dry-run
 *   tsx scripts/_cohort-a-supplemental-survey-blast.ts --confirm-i-am-not-dry-running \
 *                                                     --rate-per-minute 10   # live
 *
 * Exit codes:
 *   0 — successful run (live or dry).
 *   1 — config error, prerequisite failure, or any per-send failures during live.
 */
import os from 'node:os';
import { db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { MagicLinkService } from '../src/services/magic-link.service.js';
import { EmailService } from '../src/services/email.service.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../src/services/audit.service.js';
import pino from 'pino';

const logger = pino({ name: 'cohort-a-supplemental-survey-blast' });

const BRAND = '#9C1E23';
const SUPPORT_EMAIL = 'support@oyoskills.com';

// Cohort A is FROZEN at ~63 — well below Resend Free 100/day. The Pro-tier
// confirm flag is still wired in case the cohort grows or operator bundles runs.
const RESEND_FREE_TIER_DAILY_LIMIT = 100;
const RESEND_PRO_CONFIRM_THRESHOLD = 80;

// Known CLI flags. parseArgs rejects anything not in this set so a typo
// (e.g. --dry-rn) cannot silently slip past the dry-run gate. Pattern shared
// with Story 9-27 Part A's `_reengagement-email-blast.ts`.
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

const HELP_TEXT = `Usage: tsx scripts/_cohort-a-supplemental-survey-blast.ts [options]

Options:
  --dry-run                         Mandatory first invocation; prints masked cohort, no sends
  --confirm-i-am-not-dry-running    Required for live run (deliberately ugly)
  --confirm-resend-pro-active       Required when cohort size >= ${RESEND_PRO_CONFIRM_THRESHOLD}
  --rate-per-minute <N>             Maximum sends per minute (default 10) — cap, not target
  --since <YYYY-MM-DD>              Respondents created on or after this date (parsed as UTC midnight)
  --lga <id>                        Filter by LGA id (respondents.lga_id)
  --max-recipients <N>              Safety cap (default 100; Cohort A is ~63)
  --help                            Show this message and exit

Cohort selection: respondents LEFT JOIN submissions WHERE submissions.id IS NULL
                  AND a magic-link email exists for the respondent
                  (= Story 9-28 Cohort A — completed-but-Step-4-missing).
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

export function firstNameFrom(firstName: string | undefined): string {
  if (!firstName) return 'there';
  const trimmed = firstName.trim();
  if (!trimmed) return 'there';
  // first_name is already stored as a single name; defensively split on
  // whitespace in case a respondent stored a compound name in first_name.
  return trimmed.split(/\s+/)[0];
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildEmail(firstName: string, surveyUrl: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'One more step for your Oyo State Skills Registry profile (3 minutes)';
  const text = `Hi ${firstName},

Thank you for registering with the Oyo State Skills Registry.

To match you with the most relevant training programs and job opportunities,
we'd like you to complete your skills questionnaire. It takes about 3 minutes
and your existing registration details (name, phone, NIN, LGA) are already
saved.

  ${surveyUrl}

Once complete, you'll be eligible for tailored opportunity matching by sector,
skill level, and location.

If you're no longer interested, no action is needed — this link will expire
automatically.

The Oyo State Skills Registry team
${SUPPORT_EMAIL}`;

  const safeFirstName = escapeHtml(firstName);
  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:${BRAND};margin:0 0 16px;">Complete your skills profile</h2>
  <p>Hi <strong>${safeFirstName}</strong>,</p>
  <p>Thank you for registering with the Oyo State Skills Registry.</p>
  <p>To match you with the most relevant training programs and job opportunities, we'd like you to complete your skills questionnaire. It takes about 3 minutes and your existing registration details (name, phone, NIN, LGA) are already saved.</p>
  <p style="margin:24px 0;text-align:center;">
    <a href="${surveyUrl}" style="display:inline-block;background:${BRAND};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Complete my skills profile</a>
  </p>
  <p>Once complete, you'll be eligible for tailored opportunity matching by sector, skill level, and location.</p>
  <p style="color:#777;font-size:13px;">If you're no longer interested, no action is needed — this link will expire automatically.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
  <p style="color:#777;font-size:12px;">The Oyo State Skills Registry team<br/><a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND};">${SUPPORT_EMAIL}</a></p>
</body></html>`;

  return { subject, text, html };
}

interface CohortRow {
  respondent_id: string;
  first_name: string | null;
  email: string;
  created_at: Date;
}

async function selectCohort(args: Args): Promise<CohortRow[]> {
  // Cohort A: respondents with no submissions row + a magic-link-token email
  // available. DISTINCT ON picks the most-recent token's email per respondent.
  //
  // The optional --since filter scopes by respondent.created_at; --lga scopes
  // by respondent.lga_id.
  const sinceFragment = args.since
    ? sql`AND r.created_at >= ${args.since}`
    : sql``;
  const lgaFragment = args.lgaId ? sql`AND r.lga_id = ${args.lgaId}` : sql``;

  const result = await db.execute(sql`
    SELECT DISTINCT ON (r.id)
      r.id AS respondent_id,
      r.first_name,
      mlt.email,
      r.created_at
    FROM respondents r
    INNER JOIN magic_link_tokens mlt ON mlt.respondent_id = r.id
    LEFT JOIN submissions s ON s.respondent_id = r.id
    WHERE s.id IS NULL
      AND mlt.email IS NOT NULL
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
    logger.error({ event: 'cohort_a_supplemental.missing_confirm' });
    console.error(
      'ERROR: must pass either --dry-run (mandatory first) or --confirm-i-am-not-dry-running (live).',
    );
    process.exit(1);
  }

  if (!EmailService.isEnabled()) {
    logger.error({ event: 'cohort_a_supplemental.email_service_disabled' });
    process.exit(1);
  }

  const cohort = await selectCohort(args);
  logger.info({
    event: 'cohort_a_supplemental.cohort_selected',
    count: cohort.length,
    dryRun: args.dryRun,
    since: args.since?.toISOString() ?? null,
    lgaId: args.lgaId,
    maxRecipients: args.maxRecipients,
  });

  if (cohort.length === 0) {
    console.log('Cohort A is empty — no respondents match the filter. Exiting.');
    process.exit(0);
  }

  if (!args.dryRun && cohort.length >= RESEND_PRO_CONFIRM_THRESHOLD && !args.confirmResendPro) {
    logger.error({
      event: 'cohort_a_supplemental.resend_pro_not_confirmed',
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
    console.log(`\n[DRY-RUN] Cohort A: ${cohort.length} recipient(s)\n`);
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
  const operatorInvocation = `tsx scripts/_cohort-a-supplemental-survey-blast.ts (rate=${args.ratePerMinute})`;

  for (let i = 0; i < cohort.length; i++) {
    const row = cohort[i];
    const firstName = firstNameFrom(row.first_name ?? undefined);

    try {
      const issued = await MagicLinkService.issueToken({
        email: row.email,
        purpose: 'supplemental_survey',
        respondentId: row.respondent_id,
      });
      const surveyUrl = MagicLinkService.buildMagicLinkUrl(issued.tokenPlaintext, 'supplemental_survey');
      const emailContent = buildEmail(firstName, surveyUrl);

      const result = await EmailService.sendGenericEmail({
        to: row.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      }, 'supplemental-survey'); // Story 9-63 AC1 — explicit category for the meter.

      if (result.success) {
        sent++;
        logger.info({
          event: 'cohort_a_supplemental.sent',
          respondentId: row.respondent_id,
          email: row.email,
          messageId: result.messageId ?? null,
        });
        // Story 9-34 cutover 2026-06-01: constant swap; zero historical 'respondents' rows in prod (never live-fired — see AC#B2 of Story 9-34).
        AuditService.logAction({
          actorId: null,
          action: AUDIT_ACTIONS.OPERATOR_SUPPLEMENTAL_SURVEY_SENT,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: row.respondent_id,
          details: {
            email: row.email,
            respondent_id: row.respondent_id,
            sent_at: new Date().toISOString(),
            channel: 'email',
            campaign: 'cohort_a_supplemental_survey',
            provider_message_id: result.messageId ?? null,
          },
          ipAddress: operatorHost,
          userAgent: operatorInvocation,
        });
      } else {
        failed++;
        logger.warn({
          event: 'cohort_a_supplemental.send_failed',
          respondentId: row.respondent_id,
          email: row.email,
          error: result.error ?? 'unknown',
        });
      }
    } catch (err) {
      failed++;
      logger.error({
        event: 'cohort_a_supplemental.unhandled',
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
    event: 'cohort_a_supplemental.summary',
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
    logger.error({ event: 'cohort_a_supplemental.fatal', error: (err as Error).message });
    process.exit(1);
  });
}

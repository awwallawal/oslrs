/**
 * Story 9-26 Part J — Operator-gated recovery email for abandoned wizard drafts.
 *
 * One-shot script that emails a wizard_resume magic-link to the in-progress
 * wizard drafts that ALREADY hold Step 4 questionnaire answers but were never
 * submitted. Post-Story-9-26-Part-A, when these users click through and submit,
 * their answers are persisted to `submissions.raw_data` (the data-loss bug is
 * fixed), so recovering them now captures real registry value.
 *
 * Cohort = wizard_drafts WHERE
 *   form_data ? 'questionnaireResponses'
 *   AND form_data->'questionnaireResponses' <> '{}'::jsonb   (non-empty answers)
 *   AND expires_at > NOW()                                   (still resumable)
 *   AND (optional) created_at >= --since
 *
 * RELATIONSHIP TO SIBLING STORIES (read before running):
 *   • Story 9-27 Part A (`_reengagement-email-blast.ts`) is the BROADER,
 *     production-grade successor: it contacts ALL non-expired drafts (any step),
 *     branches copy by progress, and excludes already-completed registrants.
 *     For a general re-engagement push, prefer that script.
 *   • Story 9-28 Path B handles the already-COMPLETED Cohort A respondents via a
 *     supplemental-survey magic-link — a different cohort (completed, not
 *     abandoned).
 *   This Part-J script is the narrow, originally-specced tool: ONLY abandoned
 *   drafts that carry questionnaire answers. Kept for faithful 9-26 close-out
 *   and as the minimal targeted recovery instrument.
 *
 * Dry-run discipline: --dry-run is MANDATORY first. Live run needs the
 * deliberately ugly --confirm-i-am-not-dry-running flag. Resend Pro must be
 * active for cohorts at/above the confirm threshold (--confirm-resend-pro-active).
 *
 * Usage:
 *   tsx scripts/_recover-abandoned-wizard-drafts.ts --help
 *   tsx scripts/_recover-abandoned-wizard-drafts.ts --dry-run
 *   tsx scripts/_recover-abandoned-wizard-drafts.ts --confirm-i-am-not-dry-running \
 *                                                   --confirm-resend-pro-active \
 *                                                   --rate-per-minute 10
 *
 * Exit codes:
 *   0 — successful run (live or dry).
 *   1 — config error, prerequisite failure, or any per-send failure during live.
 */
import os from 'node:os';
import { and, gt, sql } from 'drizzle-orm';
import pino from 'pino';
import { db } from '../src/db/index.js';
import { wizardDrafts } from '../src/db/schema/index.js';
import { MagicLinkService } from '../src/services/magic-link.service.js';
import { EmailService } from '../src/services/email.service.js';
import { AuditService, AUDIT_ACTIONS } from '../src/services/audit.service.js';

const logger = pino({ name: 'recover-abandoned-wizard-drafts' });

const BRAND = '#9C1E23';
const SUPPORT_EMAIL = 'support@oyoskills.com';

// Resend Free is 100/day. At/above the threshold the operator must confirm
// Resend Pro is live (Story 9-20 Part A).
const RESEND_FREE_TIER_DAILY_LIMIT = 100;
const RESEND_PRO_CONFIRM_THRESHOLD = 80;

export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'confirm-i-am-not-dry-running',
  'confirm-resend-pro-active',
  'rate-per-minute',
  'since',
  'max-recipients',
  'help',
]);

const HELP_TEXT = `Usage: tsx scripts/_recover-abandoned-wizard-drafts.ts [options]

Emails a wizard_resume magic-link to abandoned drafts that already hold Step 4
questionnaire answers (post-9-26, completing them persists those answers).

Options:
  --dry-run                         Mandatory first invocation; prints masked cohort, no sends
  --confirm-i-am-not-dry-running    Required for live run (deliberately ugly)
  --confirm-resend-pro-active       Required when cohort size >= ${RESEND_PRO_CONFIRM_THRESHOLD}
  --rate-per-minute <N>             Maximum sends per minute (default 10) — cap, not target
  --since <YYYY-MM-DD>              Drafts created on or after this date (UTC midnight)
  --max-recipients <N>              Safety cap (default 200)
  --help                            Show this message and exit
`;

export interface Args {
  dryRun: boolean;
  confirmLive: boolean;
  confirmResendPro: boolean;
  ratePerMinute: number;
  since: Date | null;
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
  const maxRecipients = typeof maxRecipientsRaw === 'string' ? Number(maxRecipientsRaw) : 200;
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

  return {
    dryRun: flags['dry-run'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    confirmResendPro: flags['confirm-resend-pro-active'] === true,
    ratePerMinute,
    since,
    maxRecipients,
  };
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const head = email.slice(0, Math.min(4, at));
  return `${head}${'*'.repeat(Math.max(0, at - head.length))}${email.slice(at)}`;
}

export function firstNameFrom(fullName: string | undefined): string {
  if (!fullName) return 'there';
  const trimmed = fullName.trim();
  if (!trimmed) return 'there';
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

export function buildEmail(firstName: string, resumeUrl: string): {
  subject: string;
  text: string;
  html: string;
} {
  const safeFirstName = escapeHtml(firstName);
  const subject = 'Complete your Oyo Skills Registry registration';
  const text = `Hi ${firstName},

You started registering for the Oyo State Skills Registry and answered the
questionnaire — your answers are saved. One short step remains to finish.

Click below to complete your registration (link expires in 72 hours):

  ${resumeUrl}

Once complete:
  - You're eligible to be matched with training programs
  - Opportunities sent to you based on your skills and LGA
  - Your data stays protected under the Nigeria Data Protection Act (NDPA)

The Oyo State Skills Registry team
${SUPPORT_EMAIL}

If you're no longer interested, no action is needed — your saved progress will
expire automatically.`;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:${BRAND};margin:0 0 16px;">Finish your registration</h2>
  <p>Hi <strong>${safeFirstName}</strong>,</p>
  <p>You started registering for the Oyo State Skills Registry and answered the questionnaire — <strong>your answers are saved</strong>. One short step remains to finish.</p>
  <p style="margin:28px 0;text-align:center;">
    <a href="${resumeUrl}" style="display:inline-block;background:${BRAND};color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">Complete my registration</a>
  </p>
  <p style="color:#777;font-size:13px;">Link expires in 72 hours.</p>
  <p style="margin-top:24px;"><strong>Once complete:</strong></p>
  <ul style="color:#333;line-height:1.6;">
    <li>You're eligible to be matched with training programs</li>
    <li>Opportunities sent to you based on your skills and LGA</li>
    <li>Your data stays protected under the Nigeria Data Protection Act (NDPA)</li>
  </ul>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;" />
  <p style="color:#777;font-size:13px;">The Oyo State Skills Registry team<br/><a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND};">${SUPPORT_EMAIL}</a></p>
  <p style="color:#999;font-size:12px;margin-top:16px;">If you're no longer interested, no action is needed — your saved progress will expire automatically.</p>
</body></html>`;

  return { subject, text, html };
}

interface DraftRow {
  id: string;
  email: string;
  formData: unknown;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Build (but do not execute) the narrow Part-J cohort query: drafts that hold
 * NON-EMPTY questionnaire answers AND are still resumable. Exported so a unit
 * test can lock the distinguishing predicates via `.toSQL()` without a DB
 * connection (Story 9-26 Part H / M2 — the cohort SQL is the highest-risk logic
 * in the script and must not silently drift). The `email` column is NOT NULL
 * UNIQUE (the wizard's natural key) and is what we send to, so the previous
 * `form_data->>'email' IS NOT NULL` guard was a redundant no-op and is removed.
 */
export function buildCohortQuery(args: Args) {
  const conditions = [
    sql`${wizardDrafts.formData} ? 'questionnaireResponses'`,
    sql`${wizardDrafts.formData}->'questionnaireResponses' <> '{}'::jsonb`,
    gt(wizardDrafts.expiresAt, sql`NOW()`),
  ];

  if (args.since) {
    conditions.push(sql`${wizardDrafts.createdAt} >= ${args.since}`);
  }

  return db
    .select({
      id: wizardDrafts.id,
      email: wizardDrafts.email,
      formData: wizardDrafts.formData,
      createdAt: wizardDrafts.createdAt,
      expiresAt: wizardDrafts.expiresAt,
    })
    .from(wizardDrafts)
    .where(and(...conditions))
    .orderBy(wizardDrafts.createdAt)
    .limit(args.maxRecipients);
}

async function selectCohort(args: Args): Promise<DraftRow[]> {
  // Narrow Part-J cohort (see header note vs 9-27). Predicates live in the
  // exported buildCohortQuery so they're unit-testable.
  return buildCohortQuery(args);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const args = parseArgs(argv);

  if (!args.dryRun && !args.confirmLive) {
    logger.error({ event: 'recover_drafts.missing_confirm' });
    console.error(
      'ERROR: must pass either --dry-run (mandatory first) or --confirm-i-am-not-dry-running (live).',
    );
    process.exit(1);
  }

  if (!EmailService.isEnabled()) {
    logger.error({ event: 'recover_drafts.email_service_disabled' });
    process.exit(1);
  }

  const cohort = await selectCohort(args);
  logger.info({
    event: 'recover_drafts.cohort_selected',
    count: cohort.length,
    dryRun: args.dryRun,
    since: args.since?.toISOString() ?? null,
  });

  if (cohort.length === 0) {
    console.log('Cohort is empty — no abandoned drafts with questionnaire answers. Exiting.');
    process.exit(0);
  }

  // No silent caps (Story 9-26 Part H / L1): if the cohort exactly fills the
  // limit there may be more eligible drafts the operator can't see. Warn loudly
  // rather than letting them believe the cohort is exhausted.
  if (cohort.length === args.maxRecipients) {
    console.warn(
      `WARNING: cohort hit the --max-recipients cap (${args.maxRecipients}). ` +
        `There may be MORE eligible drafts beyond this limit — re-run with a higher ` +
        `--max-recipients to reach them.`,
    );
    logger.warn({ event: 'recover_drafts.cap_hit', maxRecipients: args.maxRecipients });
  }

  if (!args.dryRun && cohort.length >= RESEND_PRO_CONFIRM_THRESHOLD && !args.confirmResendPro) {
    logger.error({
      event: 'recover_drafts.resend_pro_not_confirmed',
      cohortCount: cohort.length,
      freeTierLimit: RESEND_FREE_TIER_DAILY_LIMIT,
    });
    console.error(
      `ERROR: cohort size ${cohort.length} is at or above the Resend Pro confirm threshold ` +
        `(${RESEND_PRO_CONFIRM_THRESHOLD}). Free tier daily cap is ${RESEND_FREE_TIER_DAILY_LIMIT}. ` +
        `Story 9-20 Part A (Resend Pro) MUST be active. Pass --confirm-resend-pro-active to proceed.`,
    );
    process.exit(1);
  }

  if (args.dryRun) {
    console.log(`\n[DRY-RUN] Cohort: ${cohort.length} recipient(s)\n`);
    for (const row of cohort) {
      const fd = (row.formData ?? {}) as Record<string, unknown>;
      const fullName = typeof fd.fullName === 'string' ? fd.fullName : '';
      const firstName = firstNameFrom(fullName);
      console.log(
        `  ${maskEmail(row.email).padEnd(40)} ${firstName.padEnd(20)} draft=${row.id} created=${row.createdAt.toISOString()}`,
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
  const operatorInvocation = `tsx scripts/_recover-abandoned-wizard-drafts.ts (rate=${args.ratePerMinute})`;

  for (let i = 0; i < cohort.length; i++) {
    const row = cohort[i];
    const fd = (row.formData ?? {}) as Record<string, unknown>;
    const fullName = typeof fd.fullName === 'string' ? fd.fullName : '';
    const firstName = firstNameFrom(fullName);

    try {
      const issued = await MagicLinkService.issueToken({
        email: row.email,
        purpose: 'wizard_resume',
      });
      const resumeUrl = MagicLinkService.buildMagicLinkUrl(issued.tokenPlaintext, 'wizard_resume');
      const emailContent = buildEmail(firstName, resumeUrl);

      const result = await EmailService.sendGenericEmail({
        to: row.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      if (result.success) {
        sent++;
        logger.info({
          event: 'recover_drafts.sent',
          draftId: row.id,
          email: row.email,
          messageId: result.messageId ?? null,
        });
        // Forensic audit must FLUSH before the loop's final iteration +
        // process.exit() (Story 9-26 Part H / M1). `AuditService.logAction`
        // fires a DETACHED hash-chain transaction and returns void, so the last
        // recipient's audit row could be lost when Node exits immediately after
        // the final send (which has no trailing rate-delay). Await `logActionTx`
        // in its own transaction to guarantee the write commits — the same
        // flush-safety the backfill script adopted (F1). A post-send audit
        // failure is logged but does NOT flip the send to `failed`: the email
        // already went out, so counting it as a failure would be a lie.
        try {
          await db.transaction(async (tx) => {
            await AuditService.logActionTx(tx, {
              actorId: null,
              action: AUDIT_ACTIONS.OPERATOR_RECOVERY_EMAIL_SENT,
              targetResource: 'wizard_drafts',
              targetId: row.id,
              details: {
                email: row.email,
                draft_id: row.id,
                sent_at: new Date().toISOString(),
                channel: 'email',
                provider_message_id: result.messageId ?? null,
              },
              ipAddress: operatorHost,
              userAgent: operatorInvocation,
            });
          });
        } catch (auditErr) {
          logger.warn({
            event: 'recover_drafts.audit_failed',
            draftId: row.id,
            email: row.email,
            error: (auditErr as Error).message,
          });
        }
      } else {
        failed++;
        logger.warn({
          event: 'recover_drafts.send_failed',
          draftId: row.id,
          email: row.email,
          error: result.error ?? 'unknown',
        });
      }
    } catch (err) {
      failed++;
      logger.error({
        event: 'recover_drafts.unhandled',
        draftId: row.id,
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
    event: 'recover_drafts.summary',
    sent,
    failed,
    total: cohort.length,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  });

  process.exit(failed > 0 ? 1 : 0);
}

// Skip main() under vitest so the test file can import pure functions without
// triggering the DB connection + email pipeline.
if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'recover_drafts.fatal', error: (err as Error).message });
    process.exit(1);
  });
}

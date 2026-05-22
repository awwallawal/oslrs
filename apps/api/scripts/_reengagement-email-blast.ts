/**
 * Story 9-27 Part A — Operator-gated re-engagement email blast.
 *
 * One-shot script that contacts wizard_drafts holding preserved Step 4 answers,
 * inviting recipients to resume via the Story 9-12 MR-8 wizard_resume magic-link.
 *
 * Audit-safe framing principle (see story § "Audit-safe framing"): this is a
 * product-marketing re-engagement campaign. NO apology, NO admission, NO
 * reference to any internal data-handling matter. The recipient's data is
 * fully preserved in wizard_drafts.form_data; we're nudging an abandoned
 * session toward completion.
 *
 * Dry-run discipline: --dry-run is MANDATORY for the first invocation.
 * Live run requires the deliberately ugly --confirm-i-am-not-dry-running flag.
 *
 * Usage:
 *   tsx scripts/_reengagement-email-blast.ts --help            # show usage
 *   tsx scripts/_reengagement-email-blast.ts --dry-run         # dry-run (mandatory first)
 *   tsx scripts/_reengagement-email-blast.ts --confirm-i-am-not-dry-running \
 *                                            --confirm-resend-pro-active \
 *                                            --rate-per-minute 10        # live
 *
 * Exit codes:
 *   0 — successful run (live or dry).
 *   1 — config error, prerequisite failure, or any per-send failures during live.
 */
import os from 'node:os';
import { db } from '../src/db/index.js';
import { wizardDrafts } from '../src/db/schema/index.js';
import { and, gt, sql } from 'drizzle-orm';
import { MagicLinkService } from '../src/services/magic-link.service.js';
import { EmailService } from '../src/services/email.service.js';
import { AuditService, AUDIT_ACTIONS } from '../src/services/audit.service.js';
import pino from 'pino';

const logger = pino({ name: 'reengagement-email-blast' });

const BRAND = '#9C1E23';
const SUPPORT_EMAIL = 'support@oyoskills.com';

// Free tier ceiling sanity-check — Resend Free is 100/day. If cohort is at or
// above the confirm threshold, the operator MUST pass --confirm-resend-pro-active.
const RESEND_FREE_TIER_DAILY_LIMIT = 100;
const RESEND_PRO_CONFIRM_THRESHOLD = 80;

// Known CLI flags. parseArgs rejects anything not in this set so a typo
// (e.g. --dry-rn) cannot silently slip past the dry-run gate and trigger a
// live send. See review-followup H2 (2026-05-22) for the original finding.
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

const HELP_TEXT = `Usage: tsx scripts/_reengagement-email-blast.ts [options]

Options:
  --dry-run                         Mandatory first invocation; prints masked cohort, no sends
  --confirm-i-am-not-dry-running    Required for live run (deliberately ugly)
  --confirm-resend-pro-active       Required when cohort size >= ${RESEND_PRO_CONFIRM_THRESHOLD}
  --rate-per-minute <N>             Maximum sends per minute (default 10) — cap, not target
  --since <YYYY-MM-DD>              Drafts created on or after this date (parsed as UTC midnight)
  --lga <id>                        Filter by LGA id (form_data.lgaId)
  --max-recipients <N>              Safety cap (default 200)
  --help                            Show this message and exit

Note on --rate-per-minute: this is an UPPER BOUND. The script waits at least
60_000/N ms between sends; actual throughput is whatever-is-smaller-of (N/min)
and (single-send-latency limit). For Resend Pro this is plenty of headroom.
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
  const maxRecipients = typeof maxRecipientsRaw === 'string' ? Number(maxRecipientsRaw) : 200;
  if (!Number.isFinite(maxRecipients) || maxRecipients <= 0) {
    throw new Error(`--max-recipients must be a positive integer (got ${String(maxRecipientsRaw)})`);
  }

  const sinceRaw = flags.since;
  let since: Date | null = null;
  if (typeof sinceRaw === 'string') {
    // `new Date('YYYY-MM-DD')` parses as UTC midnight; Africa/Lagos is UTC+1,
    // so drafts created 23:00-00:00 UTC on the prior day are excluded.
    // Acceptable for the small launch cohorts; documented for operator awareness.
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
  const subject = 'Complete your Oyo State Skills Registry registration (2 minutes)';
  const text = `Hi ${firstName},

You started registering for the Oyo State Skills Registry recently — your
progress is saved. Click below to finish in under 2 minutes:

  ${resumeUrl}

Once registered, you'll be in the database that helps Oyo State plan better
training programs and connect residents to job opportunities.

Registration is free + your data is protected under the Nigeria Data
Protection Act (NDPA).

If you're no longer interested, no action is needed — your draft will expire
automatically.

The Oyo State Skills Registry team
${SUPPORT_EMAIL}`;

  const safeFirstName = escapeHtml(firstName);
  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:${BRAND};margin:0 0 16px;">Complete your registration</h2>
  <p>Hi <strong>${safeFirstName}</strong>,</p>
  <p>You started registering for the Oyo State Skills Registry recently — your progress is saved. Click below to finish in under 2 minutes:</p>
  <p style="margin:24px 0;text-align:center;">
    <a href="${resumeUrl}" style="display:inline-block;background:${BRAND};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Resume my registration</a>
  </p>
  <p>Once registered, you'll be in the database that helps Oyo State plan better training programs and connect residents to job opportunities.</p>
  <p style="color:#555;font-size:14px;">Registration is free + your data is protected under the Nigeria Data Protection Act (NDPA).</p>
  <p style="color:#777;font-size:13px;">If you're no longer interested, no action is needed — your draft will expire automatically.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
  <p style="color:#777;font-size:12px;">The Oyo State Skills Registry team<br/><a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND};">${SUPPORT_EMAIL}</a></p>
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

async function selectCohort(args: Args): Promise<DraftRow[]> {
  const conditions = [
    sql`${wizardDrafts.formData} ? 'questionnaireResponses'`,
    sql`${wizardDrafts.formData}->'questionnaireResponses' != '{}'::jsonb`,
    sql`${wizardDrafts.formData}->>'email' IS NOT NULL`,
    gt(wizardDrafts.expiresAt, sql`NOW()`),
  ];

  if (args.since) {
    conditions.push(sql`${wizardDrafts.createdAt} >= ${args.since}`);
  }
  if (args.lgaId) {
    conditions.push(sql`${wizardDrafts.formData}->>'lgaId' = ${args.lgaId}`);
  }

  const rows = await db
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

  return rows;
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const args = parseArgs(argv);

  if (!args.dryRun && !args.confirmLive) {
    logger.error({ event: 'reengagement_email.missing_confirm' });
    console.error(
      'ERROR: must pass either --dry-run (mandatory first) or --confirm-i-am-not-dry-running (live).',
    );
    process.exit(1);
  }

  if (!EmailService.isEnabled()) {
    logger.error({ event: 'reengagement_email.email_service_disabled' });
    process.exit(1);
  }

  const cohort = await selectCohort(args);
  logger.info({
    event: 'reengagement_email.cohort_selected',
    count: cohort.length,
    dryRun: args.dryRun,
    since: args.since?.toISOString() ?? null,
    lgaId: args.lgaId,
    maxRecipients: args.maxRecipients,
  });

  if (cohort.length === 0) {
    console.log('Cohort is empty — no drafts match the filter. Exiting.');
    process.exit(0);
  }

  if (!args.dryRun && cohort.length >= RESEND_PRO_CONFIRM_THRESHOLD && !args.confirmResendPro) {
    logger.error({
      event: 'reengagement_email.resend_pro_not_confirmed',
      cohortCount: cohort.length,
      freeTierLimit: RESEND_FREE_TIER_DAILY_LIMIT,
    });
    console.error(
      `ERROR: cohort size ${cohort.length} is at or above Resend Pro confirm threshold ` +
        `(${RESEND_PRO_CONFIRM_THRESHOLD}). Free tier daily cap is ${RESEND_FREE_TIER_DAILY_LIMIT}. ` +
        `Story 9-20 Part A (Resend Pro upgrade) MUST be active. Pass --confirm-resend-pro-active to proceed.`,
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
  const operatorInvocation = `tsx scripts/_reengagement-email-blast.ts (rate=${args.ratePerMinute})`;

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
          event: 'reengagement_email.sent',
          draftId: row.id,
          email: row.email,
          messageId: result.messageId ?? null,
        });
        AuditService.logAction({
          actorId: null,
          action: AUDIT_ACTIONS.OPERATOR_REENGAGEMENT_EMAIL_SENT,
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
      } else {
        failed++;
        logger.warn({
          event: 'reengagement_email.send_failed',
          draftId: row.id,
          email: row.email,
          error: result.error ?? 'unknown',
        });
      }
    } catch (err) {
      failed++;
      logger.error({
        event: 'reengagement_email.unhandled',
        draftId: row.id,
        email: row.email,
        error: (err as Error).message,
      });
    }

    if (i < cohort.length - 1) {
      // Post-completion delay — see HELP_TEXT note on rate semantics.
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
    event: 'reengagement_email.summary',
    sent,
    failed,
    total: cohort.length,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  });

  process.exit(failed > 0 ? 1 : 0);
}

// Only invoke main() when executed directly via tsx. Vitest sets VITEST=true
// during its runs; skipping main() there lets the test file import pure
// functions without triggering the DB connection + email pipeline.
if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'reengagement_email.fatal', error: (err as Error).message });
    process.exit(1);
  });
}

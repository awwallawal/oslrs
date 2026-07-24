/**
 * Story 9-27 Part A — Operator-gated re-engagement email blast.
 *
 * One-shot script that contacts ALL non-expired wizard_drafts (any current_step)
 * whose email is NOT already a completed registrant's email, inviting recipients
 * to resume via the Story 9-12 MR-8 wizard_resume magic-link.
 *
 * Two-template branching by current_step (Story 9-30 follow-up, 2026-05-31):
 *   Step 4-5 (high-progress): "${firstName}, 90% done. 2 min to complete"
 *                             + "your name, phone, and answers are all saved"
 *                             + CTA "Finish my registration"
 *   Step 1-3 (low-progress):  "${firstName}, your Oyo Skills profile is saved"
 *                             + "pick up where you left off"
 *                             + CTA "Continue my registration"
 *
 * Cohort = wizard_drafts WHERE
 *   form_data ->> 'email' IS NOT NULL
 *   AND expires_at > NOW()
 *   AND NOT EXISTS (any matching completed-respondent email)  ← Cat1 exclusion
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
// Story 13-24 (AC3b) — the SHARED cohort filter (13-9 suppression + the 13-24 recent-contact
// gap). Cohort B is the case that PROVES the ledger must be email-keyed: these recipients are
// wizard_drafts rows with NO respondent record, so a respondents.metadata marker could never
// dedupe them. The shared filter keys on the address, so drafts are covered like everyone else.
import {
  filterMarketingCohort,
  type MarketingCohortFilterResult,
} from '../src/services/campaign-contact.service.js';
import { AuditService, AUDIT_ACTIONS } from '../src/services/audit.service.js';
import pino from 'pino';

const logger = pino({ name: 'reengagement-email-blast' });

const BRAND = '#9C1E23';
const SUPPORT_EMAIL = 'support@oyoskills.com';
// Story 13-9 (AC1) — campaign id stamped on the resume link's utm_campaign so completed
// registrations attribute to this blast (→ raw_data.campaign_source via 13-1). BUMP per run
// (e.g. reengagement-2026-07b) so the dashboard compares rounds. Also the 9-63 meter category.
const CAMPAIGN_ID = 'reengagement-2026-07';

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
  --max-recipients <N>              OPTIONAL safety cap. Default: NONE (send to all).
                                    If set and it truncates, a LOUD warning names how many were dropped.
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
  /** null = UNCAPPED (send to the whole selected cohort). A number is an opt-in
   * safety valve; if it actually truncates, main() announces it LOUDLY. */
  maxRecipients: number | null;
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
  // NO SILENT CAP (operator directive 2026-07-12): default is UNCAPPED (null) so
  // the blast never quietly drops recipients beyond a hidden ceiling — the old
  // default of 200 silently truncated the 271-draft launch cohort. --max-recipients
  // stays available as an OPT-IN safety valve, and if it truncates, main() warns loudly.
  const maxRecipients = typeof maxRecipientsRaw === 'string' ? Number(maxRecipientsRaw) : null;
  if (maxRecipients !== null && (!Number.isInteger(maxRecipients) || maxRecipients <= 0)) {
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

// Step >= HIGH_PROGRESS_STEP_THRESHOLD gets the "90% done" copy; below it
// gets the softer "your profile is saved" copy. Threshold matches the wizard's
// Step 4 (questionnaire) — by Step 4 the respondent has committed enough data
// (name, phone, LGA, identity) that "90% done" is empirically defensible
// (per cohort step-distribution analysis 2026-05-31: Steps 4+5 = 81% of stalls).
const HIGH_PROGRESS_STEP_THRESHOLD = 4;

export function buildEmail(firstName: string, resumeUrl: string, currentStep: number): {
  subject: string;
  text: string;
  html: string;
} {
  const isHighProgress = currentStep >= HIGH_PROGRESS_STEP_THRESHOLD;
  const safeFirstName = escapeHtml(firstName);

  if (isHighProgress) {
    // Step 4-5 — high-progress: "90% done" framing
    const subject = `${firstName}, 90% done. 2 min to complete`;
    const text = `Hi ${firstName},

Your Oyo State Skills Registry registration is 90% complete — your name,
phone, and answers are all saved.

Just one short step remains. Click below to finish in under 2 minutes:

  ${resumeUrl}

Once complete:
  - You're eligible to be matched with training programs
  - Opportunities sent to you based on your skills and LGA
  - Your data stays protected under the Nigeria Data Protection Act (NDPA)

The Oyo State Skills Registry team
${SUPPORT_EMAIL}

If you're no longer interested, no action is needed — your saved progress
will expire automatically.`;

    const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:${BRAND};margin:0 0 16px;">You're 90% done</h2>
  <p>Hi <strong>${safeFirstName}</strong>,</p>
  <p>Your Oyo State Skills Registry registration is <strong>90% complete</strong> — your name, phone, and answers are all saved.</p>
  <p>Just <strong>one short step</strong> remains. Click below to finish in under 2 minutes:</p>
  <p style="margin:28px 0;text-align:center;">
    <a href="${resumeUrl}" style="display:inline-block;background:${BRAND};color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">Finish my registration</a>
  </p>
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

  // Step 1-3 — low-progress: "your profile is saved" framing (no 90% claim)
  const subject = `${firstName}, your Oyo Skills profile is saved`;
  const text = `Hi ${firstName},

You started registering for the Oyo State Skills Registry recently — your
progress so far is saved.

Pick up where you left off in just a few minutes:

  ${resumeUrl}

Once complete:
  - You're eligible to be matched with training programs
  - Opportunities sent to you based on your skills and LGA
  - Your data stays protected under the Nigeria Data Protection Act (NDPA)

The Oyo State Skills Registry team
${SUPPORT_EMAIL}

If you're no longer interested, no action is needed — your saved progress
will expire automatically.`;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:${BRAND};margin:0 0 16px;">Your profile is saved</h2>
  <p>Hi <strong>${safeFirstName}</strong>,</p>
  <p>You started registering for the Oyo State Skills Registry recently — your progress so far is saved.</p>
  <p>Pick up where you left off in just a few minutes:</p>
  <p style="margin:28px 0;text-align:center;">
    <a href="${resumeUrl}" style="display:inline-block;background:${BRAND};color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">Continue my registration</a>
  </p>
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
  currentStep: number;
}

// Exported (Story 13-24 AC6) so the dedupe regression test can compare the RAW cohort against
// the filtered send cohort and pin the exclusion on the shared filter.
export async function selectCohort(args: Args): Promise<DraftRow[]> {
  // DISJOINTNESS INVARIANT (13-24 review L2): the Cat1 exclusion below drops any draft whose email
  // belongs to a completed respondent, so this cohort is disjoint from the 13-12 auto-thank-you
  // (completers-only). That is WHY no `thankyou_referral_sent_at` marker check is needed here — the
  // audiences cannot overlap; the email-keyed `campaign_sends` filter is the cross-run backstop. If
  // Cat1 is ever relaxed to admit completed users, the auto-send↔blast race reopens — restore a
  // marker/ledger check accordingly.
  //
  // Cat1 exclusion (Story 9-30 follow-up, 2026-05-31): drop any draft whose
  // email is already attached to a completed-registration respondent. Joins
  // magic_link_tokens (which holds the public-wizard email) -> respondents
  // -> submissions. Without this, ~21 completed users with new drafts (per
  // 2026-05-31 cohort refresh) would get confusing "finish your registration"
  // nudges. The questionnaireResponses filter from Part A's original ship is
  // INTENTIONALLY removed here — operator directive 2026-05-31 to reach all
  // stalled drafts (including Steps 1-3), with copy branched in buildEmail.
  const conditions = [
    sql`${wizardDrafts.formData}->>'email' IS NOT NULL`,
    gt(wizardDrafts.expiresAt, sql`NOW()`),
    sql`NOT EXISTS (
      SELECT 1
      FROM magic_link_tokens mlt
      INNER JOIN respondents r ON mlt.respondent_id = r.id
      INNER JOIN submissions s ON s.respondent_id = r.id
      WHERE mlt.email = ${wizardDrafts.email}
    )`,
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
      currentStep: wizardDrafts.currentStep,
    })
    .from(wizardDrafts)
    .where(and(...conditions))
    .orderBy(wizardDrafts.createdAt);
  // No SQL LIMIT here — the full cohort is selected so any --max-recipients cap
  // is applied LOUDLY downstream (main()), never silently truncated in the query.

  return rows;
}

/**
 * Story 13-24 (AC3b/AC6) — the SEND cohort: raw selection + the shared marketing filter.
 * `main()` uses this and nothing else, so the regression test exercises exactly what the operator
 * fires. Exported for that test.
 */
export async function selectSendCohort(
  args: Args,
): Promise<MarketingCohortFilterResult<DraftRow>> {
  const rawCohort = await selectCohort(args);
  return filterMarketingCohort(rawCohort, (r) => r.email);
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

  // Story 13-24 (AC3b) — ONE inherited filter, replacing this script's bespoke suppression call:
  // 13-9 suppression (never mail a bounce/complaint/unsubscribe) AND the 13-24 recent-contact gap
  // (never mail someone the welcome backfill or another blast just reached).
  const filtered = await selectSendCohort(args);
  let cohort = filtered.cohort;
  const { suppressedSkipped, recentlyContactedSkipped, duplicatesSkipped, gapDays } = filtered;
  if (suppressedSkipped > 0) {
    logger.info({ event: 'reengagement_email.suppressed_skipped', skipped: suppressedSkipped });
  }
  if (recentlyContactedSkipped > 0) {
    logger.info({
      event: 'reengagement_email.recently_contacted_skipped',
      skipped: recentlyContactedSkipped,
      gapDays,
      cutoff: filtered.cutoff.toISOString(),
    });
  }

  // NO SILENT CAP — apply the OPT-IN --max-recipients here (post-suppression, so
  // the cap counts the actual send set) and, if it truncates, announce it LOUDLY.
  // The blast is UNCAPPED by default (args.maxRecipients === null). Slicing after
  // the createdAt-ASC order keeps the oldest N, same as the old SQL LIMIT — but
  // visible, never silent.
  if (args.maxRecipients !== null && cohort.length > args.maxRecipients) {
    const dropped = cohort.length - args.maxRecipients;
    logger.warn({
      event: 'reengagement_email.cohort_capped',
      selected: cohort.length,
      cap: args.maxRecipients,
      dropped,
    });
    console.warn(
      `⚠️  --max-recipients=${args.maxRecipients} CAPS the cohort: ${cohort.length} eligible → ` +
        `sending ${args.maxRecipients}, DROPPING ${dropped} (the newest by created_at). ` +
        `Omit --max-recipients to send to all ${cohort.length}.`,
    );
    cohort = cohort.slice(0, args.maxRecipients);
  }
  logger.info({
    event: 'reengagement_email.cohort_selected',
    count: cohort.length,
    suppressedSkipped,
    recentlyContactedSkipped,
    gapDays,
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
    console.log(`\n[DRY-RUN] Cohort: ${cohort.length} recipient(s)`);
    // Story 13-24 (AC5 iii) — counts honesty: state WHY people dropped out, so this output (not a
    // stale doc snapshot) is the number the operator quotes.
    console.log(
      `[DRY-RUN] excluded: suppressed=${suppressedSkipped}, ` +
        `contacted-within-${gapDays}d=${recentlyContactedSkipped}, ` +
        `intra-run-duplicates=${duplicatesSkipped} (since ${filtered.cutoff.toISOString()})\n`,
    );
    for (const row of cohort) {
      const fd = (row.formData ?? {}) as Record<string, unknown>;
      // Story 9-18 Part F (AC#F3): prefer the canonical given name from post-9-18
      // drafts; fall back to the legacy fullName first-token parse for pre-9-18 drafts.
      const givenName = typeof fd.givenName === 'string' ? fd.givenName.trim() : '';
      const firstName = givenName || firstNameFrom(typeof fd.fullName === 'string' ? fd.fullName : '');
      const templateTag = row.currentStep >= HIGH_PROGRESS_STEP_THRESHOLD ? '90%-done' : 'saved';
      console.log(
        `  ${maskEmail(row.email).padEnd(40)} ${firstName.padEnd(20)} step=${row.currentStep} tpl=${templateTag.padEnd(8)} draft=${row.id} created=${row.createdAt.toISOString()}`,
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
      // Story 13-9 (AC1) — tag the resume link so a completed registration attributes to THIS
      // blast: utm_campaign rides through /auth/magic (forwarded there) → the wizard's 13-1
      // parseUtm → extras.utm → raw_data.campaign_source. The MagicLinkLandingPage forward is the
      // matching half. CAMPAIGN_ID = the blast run (bump per run so rounds compare in the dashboard).
      const resumeUrlObj = new URL(MagicLinkService.buildMagicLinkUrl(issued.tokenPlaintext, 'wizard_resume'));
      resumeUrlObj.searchParams.set('utm_source', 'email');
      resumeUrlObj.searchParams.set('utm_medium', 'blast');
      resumeUrlObj.searchParams.set('utm_campaign', CAMPAIGN_ID);
      const resumeUrl = resumeUrlObj.toString();
      const emailContent = buildEmail(firstName, resumeUrl, row.currentStep);

      const result = await EmailService.sendGenericEmail({
        to: row.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      }, 'reengagement-blast', CAMPAIGN_ID); // Story 9-63 AC1 category for the meter; Story 13-9 AC5 campaign tag for the funnel.

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

/**
 * Email-usage diagnostic — classify today's Resend sends by category.
 *
 * Answers the operational question "what burned my Resend quota today?" by
 * pulling the Resend send log (the GROUND TRUTH — not our internal counter,
 * which only sees queued emails) and bucketing every send by its subject line
 * into a category (login / pending-NIN reminder / wizard / backup alert / etc.).
 *
 * WHY a script and not the dashboard: `getResendStatus()` already surfaces
 * delivered/bounced/complained totals, but NOT the per-category breakdown that
 * tells you "surge of logins" vs "reminder worker" vs "backup-failure loop".
 * This is the throwaway diagnostic; Story (TBD) folds the breakdown into
 * `operations.service.ts` + the Telegram digest permanently.
 *
 * Run on the production VPS (needs RESEND_API_KEY):
 *
 *   ssh root@oslsr-home-app
 *   cd /root/oslrs
 *   pnpm --filter @oslsr/api tsx scripts/_diagnose-email-usage.ts
 *   pnpm --filter @oslsr/api tsx scripts/_diagnose-email-usage.ts --json   # machine-readable
 *
 * CAVEAT: Resend's list API caps at 100 rows/page. On a heavy day the counts
 * are a LOWER BOUND — the script flags `truncated: true` when it hits the cap.
 * For the 100/day free tier one page covers a full day exactly.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Resend } from 'resend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const PAGE_LIMIT = 100; // Resend list API hard cap per page.

/** Email categories, keyed by the subject lines emitted across the codebase. */
type Category =
  | 'magiclink-login'
  | 'magiclink-wizard-resume'
  | 'pending-nin-reminder'
  | 'supplemental-survey'
  | 'duplicate-registration'
  | 'password-reset'
  | 'staff-invitation'
  | 'payment-notification'
  | 'dispute'
  | 'backup-success'
  | 'backup-FAILURE'
  | 'health-alert-digest'
  | 'reengagement-blast'
  | 'notification-digest'
  | 'other';

/**
 * Map a subject line to a category. Ordered most-specific first. Subjects are
 * sourced from: magic-link.service.ts:getCopyForPurpose, email.service.ts,
 * backup.worker.ts, alert.service.ts, and the blast scripts.
 */
function classify(subjectRaw: string): Category {
  const s = (subjectRaw || '').toLowerCase();
  if (s.includes('daily backup failed') || s.includes('backup failed')) return 'backup-FAILURE';
  if (s.includes('daily backup completed')) return 'backup-success';
  if (s.includes('system health digest')) return 'health-alert-digest';
  if (s.includes('sign in to your')) return 'magiclink-login';
  if (s.includes('continue your') && s.includes('registration')) return 'magiclink-wizard-resume';
  if (s.includes('add your nin')) return 'pending-nin-reminder';
  if (s.includes('one more step') || s.includes('skills profile')) return 'supplemental-survey';
  if (s.includes('registration attempt detected')) return 'duplicate-registration';
  if (s.includes('password reset')) return 'password-reset';
  if (s.includes("you've been invited") || s.includes('invited to join')) return 'staff-invitation';
  if (s.includes('payment recorded')) return 'payment-notification';
  if (s.includes('dispute')) return 'dispute';
  if (s.includes('you have') && s.includes('notification')) return 'notification-digest';
  return 'other';
}

/** Categories that are user/public-triggered → candidate abuse vectors. */
const PUBLIC_TRIGGERED: ReadonlySet<Category> = new Set([
  'magiclink-login',
  'magiclink-wizard-resume',
  'pending-nin-reminder',
  'supplemental-survey',
  'duplicate-registration',
]);

/** Mask an email for safe console output: keep first char + domain. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Domains that can never deliver → bounce-reputation hazards. */
const UNDELIVERABLE_DOMAINS = ['example.com', 'example.org', 'example.net', 'test', 'invalid', 'localhost'];
function isUndeliverable(email: string): boolean {
  const domain = (email.split('@')[1] || '').toLowerCase();
  return UNDELIVERABLE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

interface ResendEmailRow {
  created_at: string;
  to: string[] | string;
  subject?: string;
  last_event?: string;
}

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json');
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('ERROR: RESEND_API_KEY not set in environment. Run on the VPS where .env is present.');
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  const list = await resend.emails.list({ limit: PAGE_LIMIT });
  if (list.error) {
    console.error(`ERROR: Resend list API failed: ${list.error.message}`);
    process.exit(1);
  }

  const rows = (list.data?.data ?? []) as ResendEmailRow[];
  const truncated = rows.length >= PAGE_LIMIT;
  const todayStart = new Date(new Date().setUTCHours(0, 0, 0, 0));
  const today = rows.filter((e) => new Date(e.created_at) >= todayStart);

  // Tally by category.
  const byCategory = new Map<Category, number>();
  const eventByCategory = new Map<Category, Record<string, number>>();
  const recipientFreq = new Map<string, number>(); // detect one-target hammering
  const undeliverable: Array<{ to: string; subject: string }> = [];

  for (const e of today) {
    const cat = classify(e.subject ?? '');
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);

    const ev = e.last_event ?? 'unknown';
    const evMap = eventByCategory.get(cat) ?? {};
    evMap[ev] = (evMap[ev] ?? 0) + 1;
    eventByCategory.set(cat, evMap);

    const to = Array.isArray(e.to) ? e.to[0] : e.to;
    if (to) {
      recipientFreq.set(to, (recipientFreq.get(to) ?? 0) + 1);
      if (isUndeliverable(to)) undeliverable.push({ to, subject: (e.subject ?? '').slice(0, 50) });
    }
  }

  const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const total = today.length;
  const publicTotal = sorted
    .filter(([cat]) => PUBLIC_TRIGGERED.has(cat))
    .reduce((sum, [, n]) => sum + n, 0);
  const topRecipients = [...recipientFreq.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (asJson) {
    console.log(JSON.stringify({
      todayCount: total,
      truncated,
      byCategory: Object.fromEntries(sorted),
      eventByCategory: Object.fromEntries(eventByCategory),
      publicTriggeredTotal: publicTotal,
      undeliverableCount: undeliverable.length,
      topRepeatedRecipients: topRecipients.map(([to, n]) => ({ to: maskEmail(to), count: n })),
    }, null, 2));
    return;
  }

  console.log('\n  EMAIL USAGE DIAGNOSTIC — today (UTC)\n  ' + '─'.repeat(46));
  console.log(`  Total sends today: ${total}${truncated ? '  ⚠ LOWER BOUND (hit 100-row API cap)' : ''}`);
  console.log(`  Public/user-triggered (abuse surface): ${publicTotal} (${total ? Math.round((publicTotal / total) * 100) : 0}%)\n`);

  console.log('  By category (high → low):');
  for (const [cat, n] of sorted) {
    const bar = '█'.repeat(Math.min(40, n));
    const flag = cat === 'backup-FAILURE' ? '  ← INCIDENT' : '';
    console.log(`    ${cat.padEnd(24)} ${String(n).padStart(3)}  ${bar}${flag}`);
  }

  if (undeliverable.length > 0) {
    console.log(`\n  ⚠ ${undeliverable.length} send(s) to UNDELIVERABLE domains (bounce/reputation hazard):`);
    for (const u of undeliverable.slice(0, 10)) {
      console.log(`    ${maskEmail(u.to).padEnd(28)} "${u.subject}"`);
    }
  }

  if (topRecipients.length > 0) {
    console.log('\n  Recipients hit 3+ times today (loop / targeted-abuse signal):');
    for (const [to, n] of topRecipients) {
      console.log(`    ${maskEmail(to).padEnd(28)} ${n}×`);
    }
  }

  // Verdict — point at the dominant cause.
  const [topCat, topN] = sorted[0] ?? ['other', 0];
  console.log('\n  VERDICT:');
  if (topCat === 'backup-FAILURE') {
    console.log('    Backup-failure alerts dominate → fix the failing backup; this is NOT registration.');
  } else if (PUBLIC_TRIGGERED.has(topCat)) {
    console.log(`    "${topCat}" dominates (${topN}). ${topRecipients.length ? 'Repeated recipients present → possible loop/abuse.' : 'Spread across distinct recipients → looks organic.'}`);
  } else {
    console.log(`    "${topCat}" dominates (${topN}) — system/staff traffic, not public surge.`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

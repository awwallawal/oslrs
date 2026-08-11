/**
 * Diagnose whether a mailbox can actually RECEIVE mail from this system.
 *
 * WHY THIS EXISTS (2026-08-10/11)
 * ------------------------------
 * `admin@oyoskills.com` — the account being handed to the client's Verification Assessor —
 * is on our `email_suppressions` list with `reason='bounced'`, suppressed 2026-06-29. The
 * handover plan is "reset MFA, the assessor enrols their own", which is an EMAIL. If that
 * address cannot receive, the handover fails in front of the client and looks like the
 * platform is broken.
 *
 * ⚠️ THE POINT OF THIS SCRIPT IS TO SEPARATE THREE INDEPENDENT GATES.
 * "Send a mail and see if it arrives" tests all three at once and cannot tell you which
 * one failed — so a red result would leave you no wiser than before:
 *
 *   A. THE FORWARD      admin@oyoskills.com → oyotradeministry@gmail.com (ImprovMX).
 *                       ⭐ TEST THIS FIRST, WITHOUT THIS SCRIPT: send a plain mail from any
 *                       external mailbox (your own Gmail) to admin@oyoskills.com. It costs
 *                       nothing, touches no code, adds no bounce to our domain reputation,
 *                       and it isolates the only variable we do NOT control. If that arrives,
 *                       A is green and every remaining question is application-level.
 *   B. OUR SUPPRESSION  the `email_suppressions` row. Read (never written) by this script.
 *   C. RESEND'S OWN     the provider keeps its own bounce list. Visible only in its response.
 *
 * This script covers B and C, and reports which one stopped the send.
 *
 * ⚠️ IT DOES NOT LIFT THE SUPPRESSION. Lifting before knowing whether the mailbox works is
 * "clear the stock, leave the producer" — it sends once, bounces, re-suppresses, and adds
 * another bounce to a domain whose reputation the whole blast programme depends on.
 *
 * ⚠️ RUN IT ON THE VPS. Story 9-63 AC0 refuses the real Resend provider outside production,
 * so anywhere else this exercises the MOCK and proves nothing about delivery.
 *
 * It does not stop at "sent". A provider 200 means accepted for delivery, not delivered —
 * the bounce arrives later, by webhook. So it then WATCHES `email_events` for this exact
 * message id and reports delivered / bounced / silent. That is the difference between
 * evidence and a hopeful log line.
 *
 * USAGE (on the VPS, from /root/oslrs):
 *   pnpm --filter @oslsr/api exec tsx scripts/_diagnose-mailbox-delivery.ts \
 *     --to admin@oyoskills.com [--from info@oyoskills.com] [--wait 120] [--dry-run]
 *
 * EXIT CODES — meaningful, so this can gate a runbook step:
 *   0 accepted and no bounce seen within the window
 *   1 BOUNCED (a bounce/complaint event arrived for this message)
 *   2 the provider refused the send
 *   3 refused to run: wrong environment, or the mock provider would be used
 *   4 bad arguments
 */
import 'dotenv/config';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { emailSuppressions } from '../src/db/schema/email-suppressions.js';
import { emailEvents } from '../src/db/schema/email-events.js';
import { EmailService } from '../src/services/email.service.js';
import { resolveProviderType } from '../src/providers/index.js';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1) {
    const next = process.argv[idx + 1];
    if (next && !next.startsWith('--')) return next;
  }
  return undefined;
}

const TO = arg('to');
// `--dry-run` is READ, not merely parsed. 13-49's review found a --dry-run flag that was
// accepted and consulted by nothing, so every "dry" run had in fact written.
const DRY_RUN = process.argv.includes('--dry-run');
const WAIT_SECONDS = Number(arg('wait') ?? 120);
const FROM_OVERRIDE = arg('from');

function line(s = '') {
  process.stdout.write(`${s}\n`);
}

async function main(): Promise<number> {
  if (!TO) {
    line('ERROR: --to is required. e.g. --to admin@oyoskills.com');
    return 4;
  }

  line('='.repeat(72));
  line(`MAILBOX DELIVERY DIAGNOSIS — ${TO}`);
  line('='.repeat(72));

  // ── STAGE 0 — what will actually happen, before anything happens ────────────
  const provider = resolveProviderType(
    (process.env.EMAIL_PROVIDER as 'resend' | 'mock') ?? 'mock',
  );
  line('');
  line('STAGE 0 — environment');
  line(`  NODE_ENV          ${process.env.NODE_ENV ?? '(unset)'}`);
  line(`  provider RESOLVED ${provider}`);
  line(`  from (configured) ${process.env.EMAIL_FROM_ADDRESS ?? '(unset)'}`);
  line(`  EMAIL_TIER        ${process.env.EMAIL_TIER ?? '(unset — resolves to pro)'}`);
  if (FROM_OVERRIDE) {
    line(`  ⚠️  --from ${FROM_OVERRIDE} IGNORED: the sender is provider config, not a per-send`);
    line('     argument. Change EMAIL_FROM_ADDRESS and restart if you need a different sender.');
    line('     Said out loud rather than silently dropped — a flag that does nothing is the');
    line('     defect class this script was written during.');
  }

  if (provider !== 'resend') {
    line('');
    line('  ⛔ The MOCK provider would be used. Nothing would leave the building, and a green');
    line('     result would mean nothing. Run this on the VPS with NODE_ENV=production.');
    return 3;
  }

  // ── STAGE 1 — gate B: our own do-not-send list ──────────────────────────────
  line('');
  line('STAGE 1 — our suppression list (gate B)');
  const rows = await db
    .select()
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, TO.toLowerCase()));

  if (rows.length === 0) {
    line('  not suppressed by us.');
  } else {
    for (const r of rows) {
      line(`  ⚠️  SUPPRESSED — reason='${r.reason}' at ${r.suppressedAt?.toISOString?.() ?? '?'}`);
    }
    line('');
    // ⚠️ Do not name the shared suppression-read helper in this string. `blast-dedupe-inheritance`
    // greps script source for it and strips COMMENTS but not STRING LITERALS, so a message that
    // mentions it reads as a call and fails the guard. (This script never calls it — it queries
    // `emailSuppressions` directly, which is correct for a single-address diagnostic.)
    line('  NOTE: this list gates the BLAST cohort filter. Transactional mail');
    line('  — magic-link, password reset, activation — is NOT gated by it, which is why a');
    line('  suppressed address kept receiving mail on 2026-08-09. So this send will very likely');
    line('  still go out. That is informative, not a mistake: it measures gate C.');
  }

  if (DRY_RUN) {
    line('');
    line('DRY RUN — stopping before the send. Nothing was sent; nothing was written.');
    return 0;
  }

  // ── STAGE 2 — gate C: does the provider accept it? ──────────────────────────
  // A unique token makes the message findable in the recipient inbox by search, and makes
  // the event correlation below unambiguous.
  const token = `MBX-${Date.now().toString(36).toUpperCase()}`;
  const sentAt = new Date();
  line('');
  line('STAGE 2 — send (gate C)');
  line(`  token ${token}`);

  const subject = `OSLRS mailbox delivery check ${token}`;
  const text = [
    `This is a delivery diagnostic sent by scripts/_diagnose-mailbox-delivery.ts.`,
    ``,
    `Token: ${token}`,
    `Sent:  ${sentAt.toISOString()}`,
    `To:    ${TO}`,
    ``,
    `If you are reading this at the forwarding mailbox, the address receives mail and the`,
    `ImprovMX forward is working. Nothing further is required of you.`,
  ].join('\n');

  let messageId: string | undefined;
  try {
    const result = await EmailService.sendGenericEmail({
      to: TO,
      subject,
      html: `<pre style="font-family:monospace">${text.replace(/</g, '&lt;')}</pre>`,
      text,
    });
    messageId = (result as { messageId?: string }).messageId;
    line(`  provider ACCEPTED — messageId=${messageId ?? '(none returned)'}`);
  } catch (err) {
    line(`  ⛔ provider REFUSED — ${(err as Error).message}`);
    line('     If this names a suppression, gate C is the blocker and it must be cleared at');
    line('     Resend, not in our database.');
    return 2;
  }

  // ── STAGE 3 — accepted ≠ delivered. Watch for the bounce. ───────────────────
  line('');
  line(`STAGE 3 — watching email_events for ${WAIT_SECONDS}s`);
  line('  A 200 from the provider means ACCEPTED FOR DELIVERY, not delivered. A hard bounce');
  line('  arrives seconds-to-minutes later by webhook. Stopping at "sent" is how a dead');
  line('  mailbox reads as a healthy one.');

  const deadline = Date.now() + WAIT_SECONDS * 1000;
  let verdict: 'bounced' | 'delivered' | 'silent' = 'silent';

  while (Date.now() < deadline) {
    const events = await db
      .select()
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.recipient, TO.toLowerCase()),
          gte(emailEvents.occurredAt, sentAt),
        ),
      )
      .orderBy(desc(emailEvents.occurredAt))
      .limit(10);

    // Correlate on messageId when the provider gave us one; fall back to
    // recipient+time window and SAY SO, rather than quietly widening the match.
    const mine = messageId
      ? events.filter((e) => e.messageId === messageId)
      : events;
    if (!messageId && events.length > 0) {
      line('  (no messageId returned — correlating by recipient + time window instead)');
    }

    const bounce = mine.find(
      (e) => e.eventType.includes('bounce') || e.eventType.includes('complain'),
    );
    if (bounce) {
      line(`  🔴 ${bounce.eventType} at ${bounce.occurredAt?.toISOString?.()}`);
      verdict = 'bounced';
      break;
    }
    const delivered = mine.find((e) => e.eventType.includes('deliver'));
    if (delivered) {
      line(`  ✅ ${delivered.eventType} at ${delivered.occurredAt?.toISOString?.()}`);
      verdict = 'delivered';
      break;
    }

    await new Promise((r) => setTimeout(r, 5000));
  }

  line('');
  line('='.repeat(72));
  if (verdict === 'bounced') {
    line(`RESULT: BOUNCED. ${TO} does not accept mail. Do NOT lift the suppression —`);
    line('fix the mailbox/forward first, or the next send repeats this and costs the domain');
    line('another bounce.');
    line('='.repeat(72));
    return 1;
  }
  if (verdict === 'delivered') {
    line(`RESULT: DELIVERED. Confirm ${token} is visible at the forwarding mailbox before`);
    line('treating this as closed — a delivery event proves the provider handed it off, and');
    line('the human check proves the forward.');
  } else {
    line(`RESULT: NO EVENT within ${WAIT_SECONDS}s. This is NOT a pass and NOT a fail.`);
    line('  Either the webhook is not reaching us, or delivery is slow, or nothing happened.');
    line(`  ⭐ THE HUMAN CHECK IS NOW THE EVIDENCE: search the forwarding mailbox for ${token}.`);
    line('  Found = delivered. Absent after 10 minutes = treat as undelivered and investigate');
    line('  the forward. An empty result is not a negative result until someone looks.');
  }
  line('='.repeat(72));
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${(err as Error).stack ?? String(err)}\n`);
    process.exit(2);
  });

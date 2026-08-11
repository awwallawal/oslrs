/**
 * Send an individual "you ARE registered, here is your number" reply, from the AUTHORITY
 * address, to a named citizen. One person at a time. Not a campaign.
 *
 * WHY THIS EXISTS (2026-08-11)
 * ---------------------------
 * Two people are registered, have never been told their registration number, and could not
 * find out:
 *
 *   JAMIU RAHEEM  (OSL-2026-F91B8A, registered 2026-05-19) wrote in saying he could not
 *   register. He was already registered — and had been for three months. He requested three
 *   magic links in three days; two were never opened, and the one he did open still did not
 *   answer his question. SCP §10.1.
 *
 *   JULIET ODIBA  (OSL-2026-51CNVZ, registered 2026-08-04) never wrote in and has no reason
 *   to: the mail carrying her number bounced because her inbox was full that day, our webhook
 *   recorded it as a plain 'bounced', and she was permanently suppressed. She was told
 *   nothing, so she does not know there is anything to ask about. SCP §11.2.
 *
 * ⚠️ FROM `admin@oyoskills.com`, NOT the configured `noreply@`. Awwal's ruling: a reply from a
 * government registry should come from an address that answers. The sender is PROVIDER config
 * (`resend.provider.ts:47` builds `from` once per instance, not per send), so this script
 * constructs its own provider rather than changing `EMAIL_FROM_ADDRESS` — which would silently
 * re-address every transactional send in the system.
 *
 * ⚠️ IT STILL COUNTS AT THE CHOKEPOINT. `NotificationMeter.recordEmailSend` is called on
 * success, so bypassing `EmailService` does not bypass 9-63's counter. A send this system
 * cannot see is the thing that counter exists to prevent.
 *
 * ⛔ THIS IS NOT A BLAST AND MUST NOT BECOME ONE. There are 92 more people in Jamiu's exact
 * state (§10.2) and they are DELIBERATELY NOT MAILED until 13-50 ships: today the only thing
 * we could send them is a link that dead-ends, and 79% of those links are never opened. Mailing
 * 92 people a dead end manufactures 92 more dead ends and spends the single moment of attention
 * each of them will give this. These two are individual replies to identified harm.
 *
 * ⚠️ NO NIN, NO PHONE, NO DATE OF BIRTH in the body. Name + LGA + reference code is enough for
 * the person to confirm the record is theirs, and keeps the mail safe to forward or screenshot.
 *
 * USAGE (on the VPS, from apps/api — always --dry-run first, and READ the body it prints):
 *   tsx scripts/_ops-send-registration-number-reply.ts --who jamiu  [--dry-run]
 *   tsx scripts/_ops-send-registration-number-reply.ts --who juliet [--dry-run]
 *
 * EXIT: 0 sent (or dry-run) · 1 refused on evidence · 2 send failed · 3 wrong environment · 4 args
 */
import 'dotenv/config';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { emailSuppressions } from '../src/db/schema/email-suppressions.js';
import { emailEvents } from '../src/db/schema/email-events.js';
import { respondents } from '../src/db/schema/respondents.js';
import { ResendEmailProvider } from '../src/providers/resend.provider.js';
import { NotificationMeter } from '../src/services/notification-meter.service.js';

const FROM_ADDRESS = 'admin@oyoskills.com';
const FROM_NAME = 'Oyo State Livelihood and Skills Registry';

interface Reply {
  to: string;
  referenceCode: string;
  fullName: string;
  lga: string;
  /** The paragraph that differs: WHY they were not told. Honest per person. */
  whatWentWrong: string;
}

const REPLIES: Record<string, Reply> = {
  jamiu: {
    to: 'raheemjamiu166@gmail.com',
    referenceCode: 'OSL-2026-F91B8A',
    fullName: 'Jamiu Raheem',
    lga: 'Ori Ire',
    whatWentWrong:
      'The difficulty you ran into was on our side, not yours. When you asked us to confirm your ' +
      'registration, our system sent you a link instead of simply telling you the answer — and that ' +
      'link did not work as it should have. We are correcting it, and your message is the reason we ' +
      'found it. Other people were affected in the same way, so you have helped more than yourself.',
  },
  juliet: {
    to: 'julietiyabodeodiba@gmail.com',
    referenceCode: 'OSL-2026-51CNVZ',
    fullName: 'Juliet Odiba',
    lga: 'Egbeda',
    whatWentWrong:
      'We sent this to you once before and it did not reach you — your mailbox was full that day, ' +
      'and our system then stopped writing to you altogether. That was our error, not yours, and we ' +
      'have corrected it.',
  },
};

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return undefined;
}

const WHO = arg('who')?.toLowerCase();
const DRY = process.argv.includes('--dry-run');
const log = (s = '') => process.stdout.write(`${s}\n`);

function buildText(r: Reply): string {
  return [
    `Dear ${r.fullName},`,
    ``,
    `We are writing to give you your registration number for the Oyo State Livelihood and`,
    `Skills Registry.`,
    ``,
    `Your registration number is ${r.referenceCode}.`,
    ``,
    `You are registered, and your record is active, held under the name ${r.fullName}, in`,
    `${r.lga} Local Government Area.`,
    ``,
    r.whatWentWrong,
    ``,
    `Please keep that number safe. It is the surest way to identify your record if you ever`,
    `need to contact us, and you do not need to register again.`,
    ``,
    `If anything above does not match your own records — or if the name or local government`,
    `we hold for you is wrong — please reply to this message and we will correct it.`,
    ``,
    `Thank you for your patience.`,
    ``,
    `Oyo State Livelihood and Skills Registry`,
    FROM_ADDRESS,
  ].join('\n');
}

function buildHtml(r: Reply): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;background:#ffffff;color:#222;">
    <p style="font-size:16px;">Dear ${esc(r.fullName)},</p>
    <p style="font-size:15px;">We are writing to give you your registration number for the
      Oyo State Livelihood and Skills Registry.</p>
    <p style="font-size:16px;margin:8px 0 4px;">Your registration number is</p>
    <p style="font-size:24px;font-weight:bold;color:#9C1E23;letter-spacing:1px;margin:4px 0 20px;">
      ${esc(r.referenceCode)}</p>
    <p style="font-size:15px;">You are registered, and your record is active, held under the name
      <strong>${esc(r.fullName)}</strong>, in <strong>${esc(r.lga)}</strong> Local Government Area.</p>
    <p style="font-size:15px;">${esc(r.whatWentWrong)}</p>
    <p style="font-size:15px;">Please keep that number safe. It is the surest way to identify your
      record if you ever need to contact us, and you do not need to register again.</p>
    <p style="font-size:14px;color:#555;">If anything above does not match your own records — or if
      the name or local government we hold for you is wrong — please reply to this message and we
      will correct it.</p>
    <p style="font-size:15px;">Thank you for your patience.</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0;">
    <p style="font-size:12px;color:#777;">Oyo State Livelihood and Skills Registry<br/>
      <a href="mailto:${FROM_ADDRESS}" style="color:#9C1E23;">${FROM_ADDRESS}</a></p>
  </div>
</body></html>`;
}

async function main(): Promise<number> {
  if (!WHO || !REPLIES[WHO]) {
    log(`ERROR: --who must be one of: ${Object.keys(REPLIES).join(', ')}`);
    return 4;
  }
  const r = REPLIES[WHO];

  log('='.repeat(72));
  log(`REGISTRATION-NUMBER REPLY — ${r.fullName} <${r.to}>${DRY ? '   [DRY RUN]' : ''}`);
  log('='.repeat(72));

  // 1. The reference code must be REAL. A reply that quotes a wrong number is worse than
  //    silence — it is a government registry confirming something untrue to a citizen.
  const rows = await db
    .select()
    .from(respondents)
    .where(eq(respondents.referenceCode, r.referenceCode));
  if (rows.length !== 1) {
    log(`  ⛔ ${r.referenceCode} matched ${rows.length} respondents. Refusing.`);
    return 1;
  }
  const person = rows[0];
  log(`  verified against the register: ${person.firstName} ${person.lastName} · ${person.status}`);
  const nameMatches = `${person.firstName} ${person.lastName}`.toLowerCase() === r.fullName.toLowerCase();
  if (!nameMatches) {
    log(`  ⛔ name mismatch: register says "${person.firstName} ${person.lastName}", the letter says "${r.fullName}". Refusing.`);
    return 1;
  }

  // 2. Suppressed? Transactional is not gated by our list, so this would still send — but a
  //    suppressed address means it will very likely bounce, and we should know that first.
  const sup = await db.select().from(emailSuppressions).where(eq(emailSuppressions.email, r.to));
  log(sup.length ? `  ⚠️  SUPPRESSED (${sup[0].reason}) — expect a bounce.` : '  not suppressed.');

  if (!process.env.RESEND_API_KEY || process.env.NODE_ENV !== 'production') {
    log('  ⛔ Needs NODE_ENV=production and a real RESEND_API_KEY. Run this on the VPS.');
    return 3;
  }

  const text = buildText(r);
  const subject = `You are registered — Oyo State Livelihood and Skills Registry (${r.referenceCode})`;

  if (DRY) {
    log('');
    log(`  From:    ${FROM_NAME} <${FROM_ADDRESS}>`);
    log(`  Subject: ${subject}`);
    log('  ' + '-'.repeat(68));
    text.split('\n').forEach((l) => log(`  ${l}`));
    log('  ' + '-'.repeat(68));
    log('  DRY RUN — nothing sent. READ THE BODY ABOVE before running for real.');
    return 0;
  }

  const sentAt = new Date();
  const provider = new ResendEmailProvider({
    apiKey: process.env.RESEND_API_KEY,
    fromAddress: FROM_ADDRESS,
    fromName: FROM_NAME,
  });

  let messageId: string | undefined;
  try {
    const result = await provider.send({ to: r.to, subject, html: buildHtml(r), text });
    messageId = (result as { messageId?: string }).messageId;
    log(`  SENT — messageId=${messageId ?? '(none)'}`);
  } catch (err) {
    log(`  ⛔ send failed — ${(err as Error).message}`);
    return 2;
  }

  // 3. Count it. Bypassing EmailService must not mean bypassing the 9-63 counter.
  try {
    const category = await NotificationMeter.recordEmailSend({ subject, recipient: r.to });
    log(`  counted at the chokepoint — category=${category}`);
  } catch (e) {
    log(`  ⚠️  meter record failed (non-fatal, the send already happened): ${(e as Error).message}`);
  }

  // 4. Accepted is not delivered.
  log('  watching email_events for 90s…');
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const evs = await db
      .select()
      .from(emailEvents)
      .where(and(eq(emailEvents.recipient, r.to), gte(emailEvents.occurredAt, sentAt)))
      .orderBy(desc(emailEvents.occurredAt))
      .limit(5);
    const mine = messageId ? evs.filter((e) => e.messageId === messageId) : evs;
    const bad = mine.find((e) => e.eventType.includes('bounce') || e.eventType.includes('complain'));
    if (bad) {
      log(`  🔴 ${bad.eventType}. For Juliet this means the inbox is STILL full — move to the phone`);
      log('     channel (SCP §11.5). Do NOT hand-suppress: the webhook will, and 13-51 must be able');
      log('     to tell that retry apart from a death.');
      return 1;
    }
    const ok = mine.find((e) => e.eventType.includes('deliver'));
    if (ok) {
      log(`  ✅ delivered at ${ok.occurredAt?.toISOString?.()}`);
      return 0;
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
  log('  no event within 90s — NOT a pass and NOT a fail. Check again before concluding.');
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
    process.exit(2);
  });

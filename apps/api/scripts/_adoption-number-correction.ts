/**
 * One-off: tell two people which registration number is theirs.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-04 the 13-49 D3 run adopted two drafts at 06:22. Both of those people then
 * completed their own registration 13-19 minutes later (06:35 and 06:41), and because a
 * pending-NIN record has no NIN, `findOrCreateRespondent`'s dedupe is skipped
 * (`submission-processing.service.ts:454`) — so each ended up with TWO records and TWO
 * numbers. Awwal's ruling: keep the person's own registration, roll back ours, and write to
 * them only because the number they were told has changed.
 *
 * The copy deliberately does NOT explain the mechanism, assign fault, or use the word
 * duplicate. These are citizens who did nothing wrong and whose only visible experience is
 * "two emails, two numbers". It leads with the number that is now theirs and closes the loop.
 *
 * SCOPE IS HARD-CODED ON PURPOSE. Two reference codes, listed below. A script that could be
 * pointed at a cohort by flag is a script that can mail 300 people by accident; this one
 * cannot address anybody it was not written to address.
 *
 *   pnpm --filter @oslsr/api adoption:number-correction            (preview)
 *   pnpm --filter @oslsr/api adoption:number-correction -- --apply (send)
 *
 * IDEMPOTENT: a send stamps `metadata.number_correction_sent_at`, and a stamped record is
 * skipped. `registration-status` is transactional, so it carries no send-once marker of its
 * own and no ledger row — exactly the gap that let a re-run double-send earlier today.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { respondents } from '../src/db/schema/respondents.js';
import { submissions } from '../src/db/schema/submissions.js';
import { EmailService } from '../src/services/email.service.js';

const TARGETS = ['OSL-2026-VXBGBM', 'OSL-2026-MJC87E'] as const;

const apply = process.argv.includes('--apply');

function body(firstName: string, code: string): { subject: string; html: string; text: string } {
  const greeting = firstName.trim() === '' ? 'Hello' : `Dear ${firstName.trim()}`;
  const text =
    `${greeting},\n\n` +
    `You recently completed your registration on the Oyo State Skilled Labour Registry. ` +
    `Your registration number is ${code}.\n\n` +
    `You may have received an earlier email from us with a different number. ` +
    `Please disregard that one. Nothing has been lost, and no action is needed from you.\n\n` +
    `You can check your registration any time at https://oyoskills.com/check-registration\n\n` +
    `Oyo State Skilled Labour Registry`;
  const html =
    `<p>${greeting},</p>` +
    `<p>You recently completed your registration on the Oyo State Skilled Labour Registry. ` +
    `Your registration number is <strong>${code}</strong>.</p>` +
    `<p>You may have received an earlier email from us with a different number. ` +
    `Please disregard that one. Nothing has been lost, and no action is needed from you.</p>` +
    `<p>You can check your registration any time at ` +
    `<a href="https://oyoskills.com/check-registration">oyoskills.com/check-registration</a>.</p>` +
    `<p>Oyo State Skilled Labour Registry</p>`;
  return { subject: 'Your OSLRS registration number', html, text };
}

const mask = (email: string): string => {
  const at = email.indexOf('@');
  if (at <= 1) return '***';
  return `${email.slice(0, 4)}${'*'.repeat(Math.max(0, at - 4))}${email.slice(at)}`;
};

async function main(): Promise<void> {
  console.log('');
  console.log('='.repeat(72));
  console.log(`Adoption number correction — ${apply ? '🔴 LIVE' : '🟢 PREVIEW'}`);
  console.log('='.repeat(72));

  const rows = await db.query.respondents.findMany({
    where: inArray(respondents.referenceCode, [...TARGETS]),
  });

  if (rows.length !== TARGETS.length) {
    console.log(`❌ expected ${TARGETS.length} respondents, found ${rows.length}. Refusing.`);
    process.exitCode = 1;
    return;
  }

  for (const r of rows) {
    const meta = (r.metadata as Record<string, unknown> | null) ?? {};
    if (meta.number_correction_sent_at) {
      console.log(`  ⏭  ${r.referenceCode} — already sent ${String(meta.number_correction_sent_at)}`);
      continue;
    }

    // Their OWN registration carries the contact address; that is where this must go.
    const sub = await db.query.submissions.findFirst({ where: eq(submissions.respondentId, r.id) });
    const email = ((sub?.rawData as Record<string, unknown> | null)?.email as string | undefined)?.trim();
    if (!email) {
      console.log(`  ❌ ${r.referenceCode} — no email on their submission; skipping`);
      continue;
    }

    const mail = body(r.firstName ?? '', r.referenceCode ?? '');
    if (!apply) {
      console.log(`  would send → ${mask(email)}  (${r.referenceCode}, "${r.firstName ?? ''}")`);
      continue;
    }

    const result = await EmailService.sendGenericEmail({ to: email, ...mail }, 'registration-status');
    if (!result.success) {
      console.log(`  ❌ ${r.referenceCode} — send failed: ${result.error ?? 'unknown'}`);
      process.exitCode = 1;
      continue;
    }

    const sentAt = new Date().toISOString();
    await db
      .update(respondents)
      .set({ metadata: { ...meta, number_correction_sent_at: sentAt }, updatedAt: new Date() })
      .where(eq(respondents.id, r.id));
    console.log(`  ✅ sent → ${mask(email)}  (${r.referenceCode})`);
  }

  console.log('');
  console.log(apply ? '🔴 LIVE RUN COMPLETE.' : '🟢 PREVIEW — nothing sent. Add --apply to send.');
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error('number correction failed:', err);
    process.exit(1);
  });

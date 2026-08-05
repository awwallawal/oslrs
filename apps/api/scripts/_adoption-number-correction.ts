/**
 * One-off: tell ten people which registration number is theirs.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-04 the 13-49 adoption runs collided with people registering LIVE. Dedupe fires on
 * the INCOMING submission's NIN (`submission-processing.service.ts:454`), so a self-registration
 * taken through the no-NIN path cannot be matched against an existing record no matter what we
 * already hold — and each collision produced TWO records and TWO numbers.
 *
 * Rate: 5 of 21 D3 adoptees (24%) self-registered within 90 minutes of our email, against 1 of
 * 138 for D1 (0.7%). D3's copy is why — it tells a `pending_nin_capture` person their record is
 * "active" and invites them to "add what is missing".
 *
 * Awwal's ruling, per case: keep whichever record serves the person better, and write to them
 * only because the number they were told has changed. For five that meant keeping their own
 * registration; for HB95YE it meant keeping ours, because his self-registration was the
 * pending-NIN one and ours already carried the NIN from his own draft.
 *
 * The copy deliberately does NOT explain the mechanism, assign fault, or use the word
 * duplicate. These are citizens who did nothing wrong and whose only visible experience is
 * "two emails, two numbers". It leads with the number that is now theirs and closes the loop.
 *
 * SCOPE IS HARD-CODED ON PURPOSE. Ten reference codes, listed below. A script that could be
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
import { EmailService } from '../src/services/email.service.js';
import { resolveRespondentContactEmail } from '../src/services/respondent-contact.service.js';

/**
 * Every person left holding a number that no longer resolves.
 *
 * The first two and the next three are cases where we kept THEIR self-registration and rolled
 * ours back. HB95YE is the opposite: Jeremiah self-registered via the no-NIN path 14 minutes
 * after we adopted him WITH his NIN, so his own record was the LESS complete one — Awwal's
 * ruling was to keep ours and remove the pending duplicate, leaving him active rather than in
 * the 9-12 chase ladder. Same email either way: lead with the number that is now his.
 */
const TARGETS = [
  'OSL-2026-VXBGBM', // theirs kept  (already sent 2026-08-04T08:42)
  'OSL-2026-MJC87E', // theirs kept  (already sent 2026-08-04T08:42)
  'OSL-2026-Y9D37K', // theirs kept
  'OSL-2026-DZFFYN', // theirs kept
  'OSL-2026-TQM9XE', // theirs kept
  'OSL-2026-HB95YE', // OURS kept — his self-registration was the pending one
  'OSL-2026-1MWWXX', // OURS kept — same shape as HB95YE (2026-08-04 09:17 vs their 09:36)
  'OSL-2026-V0NEGT', // theirs kept — both pending, hers fuller (Monsurat Akadiri)
  'OSL-2026-4VFJFD', // OURS kept — theirs was pending-NIN (Omowumi Michael)
  'OSL-2026-YCA84D', // OURS kept — theirs was pending-NIN (Muheebat Yusuf)
  // NOTE: 3XQ32H (Mukaheel) is deliberately NOT here. His NIN is contested, so he gets the
  // `nin:reconfirm` magic link instead — a number-correction email would tell him his record is
  // settled when the one field that matters is still unresolved.
] as const;

const apply = process.argv.includes('--apply');

function body(firstName: string, code: string): { subject: string; html: string; text: string } {
  const greeting = firstName.trim() === '' ? 'Hello' : `Dear ${firstName.trim()}`;
  const text =
    `${greeting},\n\n` +
    `You recently completed your registration on the Oyo State Skilled Labour Registry. ` +
    `Your registration number is ${code}.\n\n` +
    `You may have received another email from us with a different number. ` +
    `Please disregard that one. Nothing has been lost, and no action is needed from you.\n\n` +
    `You can check your registration any time at https://oyoskills.com/check-registration\n\n` +
    `Oyo State Skilled Labour Registry`;
  const html =
    `<p>${greeting},</p>` +
    `<p>You recently completed your registration on the Oyo State Skilled Labour Registry. ` +
    `Your registration number is <strong>${code}</strong>.</p>` +
    `<p>You may have received another email from us with a different number. ` +
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

    // Canonical lookup (submission → token → user). Reading `submissions` alone would silently
    // skip the 45 people reachable only via magic_link_tokens — see respondent-contact.service.ts.
    const contact = await resolveRespondentContactEmail(r.id);
    if (!contact) {
      console.log(`  ⚠️ ${r.referenceCode} — no email anywhere; needs phone outreach (sms:outreach-list)`);
      continue;
    }
    const email = contact.email;

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

/**
 * Ask a respondent to re-supply a NIN we cannot trust, using the EXISTING tested path.
 *
 * WHEN TO USE THIS
 * ----------------
 * A record carries a NIN that is wrong, uncertain, or contested — e.g. two records for the same
 * person held NINs differing by a single digit (2026-08-04: `98282652439` vs `98382652439`, same
 * DOB, same email, position 3). Registry NIN validation is FORMAT-ONLY, so nothing in this system
 * can decide which is right. Only the person holding the card can.
 *
 * WHY IT CLEARS THE NIN RATHER THAN KEEPING THE LIKELIER ONE
 * ----------------------------------------------------------
 * A missing NIN is a known gap; a WRONG NIN is a false claim that reads as verified — and worse,
 * a typo'd NIN is a well-formed 11-digit number that may be **some other citizen's real NIN**.
 * Leaving it in place risks the registry asserting one person's national identity on another
 * person's record. Clearing it is the honest state: we do not know this person's NIN.
 *
 * WHY IT DEMOTES TO `pending_nin_capture`
 * ---------------------------------------
 * So the ALREADY-TESTED completion flow can serve them. `POST /registration/complete-nin` guards
 * its UPDATE on `status = 'pending_nin_capture'` (registration.controller.ts) — an `active` row is
 * silently refused, so a "correction" cannot reuse that path without this step. Demoting also
 * re-enters them in the 9-12 reminder ladder, which is correct: they genuinely owe us a NIN.
 *
 * ⚠️ WHY NOT "CLICK THE BUTTON THAT MATCHES YOUR CARD" IN THE EMAIL
 * -----------------------------------------------------------------
 * Because a GET must never mutate. Gmail, Microsoft Defender Safe Links and corporate gateways
 * PREFETCH every URL in a message to scan it — so a one-click confirm link gets clicked by a
 * robot, and with two candidate buttons the scanner picks whichever it fetches first. You would
 * be writing a national identity number chosen by an antivirus product, then thanking the person
 * for it. The magic link opens a PAGE; the write happens on an explicit POST from that page.
 * Listing the candidate values in the email is also worth avoiding: shown two near-identical
 * numbers, a person picks the one that LOOKS familiar — and the whole problem is that one of them
 * is wrong. Asking them to read the card is the only answer that is actually verified.
 *
 *   pnpm --filter @oslsr/api nin:reconfirm            (preview)
 *   pnpm --filter @oslsr/api nin:reconfirm -- --apply (write + send)
 *
 * IDEMPOTENT: stamps `metadata.nin_reconfirm_requested_at`; a stamped record is skipped.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { respondents } from '../src/db/schema/respondents.js';
import { MagicLinkService } from '../src/services/magic-link.service.js';
import { resolveRespondentContactEmail } from '../src/services/respondent-contact.service.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../src/services/audit.service.js';

/** Hard-coded scope. A script that takes a cohort by flag is one that can clear 300 NINs. */
const TARGETS = [
  'OSL-2026-3XQ32H', // Mukaheel — asked 2026-08-04
  // The two PRE-EXISTING conflicting-NIN people, carried since MAY 2026 and invisible to every
  // check we had: `duplicate_nins` counts one NIN on two people, never one person on two NINs.
  // Their duplicate records were merged first (2026-08-05) so the survivor is unambiguous —
  // asking someone to confirm a NIN on a record you are about to delete would be worse than
  // asking nothing.
  'OSL-2026-J622R1', // Sunday Joseph Omodun
  'OSL-2026-NNJFJS', // Timothy Timilehin Elujide
] as const;

const apply = process.argv.includes('--apply');

const mask = (v: string | null): string => (v ? `${'*'.repeat(7)}${v.slice(-4)}` : '(none)');

async function main(): Promise<void> {
  console.log('');
  console.log('='.repeat(74));
  console.log(`NIN re-confirmation — ${apply ? '🔴 LIVE' : '🟢 PREVIEW'}`);
  console.log('='.repeat(74));

  const rows = await db.query.respondents.findMany({
    where: inArray(respondents.referenceCode, [...TARGETS]),
  });
  if (rows.length !== TARGETS.length) {
    console.log(`❌ expected ${TARGETS.length} respondent(s), found ${rows.length}. Refusing.`);
    process.exitCode = 1;
    return;
  }

  for (const r of rows) {
    const meta = (r.metadata as Record<string, unknown> | null) ?? {};
    if (meta.nin_reconfirm_requested_at) {
      console.log(`  ⏭  ${r.referenceCode} — already asked ${String(meta.nin_reconfirm_requested_at)}`);
      continue;
    }

    // THE canonical lookup — submission → magic-link token → user account. Never read one
    // table directly: not every respondent has a submissions row (the 9-26 exception), and that
    // single assumption produced three defects in one day. See respondent-contact.service.ts.
    const contact = await resolveRespondentContactEmail(r.id);
    if (!contact) {
      // Genuinely unreachable by email. Do NOT clear the NIN: clear-then-ask is only honest if
      // the asking can happen, and clearing without a route to replace leaves them sitting
      // pending forever with no way to be asked. Escalate to the phone list instead.
      console.log(
        `  ⚠️ ${r.referenceCode} — NO email anywhere. Phone: ${r.phoneNumber ?? '(none)'} — ` +
          `NIN left INTACT; pick this up via \`pnpm --filter @oslsr/api sms:outreach-list\`.`,
      );
      process.exitCode = 1;
      continue;
    }
    const email = contact.email;

    if (!apply) {
      console.log(
        `  would clear NIN ${mask(r.nin)} · demote ${r.status} → pending_nin_capture · ` +
          `issue pending_nin_complete link → ${email.slice(0, 4)}***`,
      );
      continue;
    }

    const requestedAt = new Date().toISOString();
    const priorNin = r.nin;

    // The prior value is PRESERVED in metadata, never silently discarded — it is an answer the
    // person gave, and an operator may need it to reconcile.
    await db
      .update(respondents)
      .set({
        nin: null,
        status: 'pending_nin_capture',
        metadata: {
          ...meta,
          nin_reconfirm_requested_at: requestedAt,
          nin_reconfirm_prior_value: priorNin,
          nin_reconfirm_reason: 'conflicting NIN across duplicate records — only the holder can resolve',
        },
        updatedAt: new Date(),
      })
      .where(eq(respondents.id, r.id));

    const issued = await MagicLinkService.issueToken({
      email,
      purpose: 'pending_nin_complete',
      respondentId: r.id,
    });
    await MagicLinkService.sendMagicLinkEmail({
      email,
      tokenPlaintext: issued.tokenPlaintext,
      purpose: 'pending_nin_complete',
      expiresAt: issued.expiresAt,
    });

    await db.transaction(async (tx) => {
      await AuditService.logActionTx(tx, {
        actorId: null,
        action: AUDIT_ACTIONS.MAGIC_LINK_ISSUED,
        targetResource: AUDIT_TARGETS.RESPONDENT,
        targetId: r.id,
        details: {
          trigger: 'nin_reconfirm',
          purpose: 'pending_nin_complete',
          magicLinkTokenId: issued.id,
          priorNin,
          note: 'NIN cleared and re-requested — conflicting values across duplicate records',
        },
      });
    });

    console.log(`  ✅ ${r.referenceCode} — NIN ${mask(priorNin)} cleared, link sent to ${email.slice(0, 4)}***`);
  }

  console.log('');
  console.log(apply ? '🔴 LIVE RUN COMPLETE.' : '🟢 PREVIEW — nothing written or sent.');
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error('nin re-confirmation failed:', err);
    process.exit(1);
  });

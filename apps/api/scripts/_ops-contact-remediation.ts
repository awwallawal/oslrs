/**
 * Operator contact remediation — lift a stale suppression, or correct a wrong address on a
 * user account. Both audited, both dry-runnable, one row at a time.
 *
 * WHY (2026-08-11)
 * ---------------
 * Two remediations were needed on the same day and neither had a tool:
 *
 * 1. `admin@oyoskills.com` sat on `email_suppressions` with `reason='bounced'` from
 *    2026-06-29 — six weeks — while the mailbox was demonstrably healthy. Proven, not
 *    assumed: `_diagnose-mailbox-delivery.ts` sent to it on 2026-08-11 and prod recorded
 *    `sent 05:51:09 → delivered 05:52:02`, and the operator confirmed arrival at the
 *    ImprovMX forwarding mailbox. That address is the account being handed to the client's
 *    Verification Assessor, whose MFA re-enrolment arrives BY EMAIL.
 *
 * 2. `osegunlajide@gmail.con` — note `.con` — is the email on a REAL citizen's `users` row
 *    created 2026-08-09. Five sends hard-bounced in four minutes. Magic-link is the auth
 *    path for public users, so that person cannot log in and cannot be contacted. A
 *    `wizard_drafts` row for `osegunlajide@gmail.com`, same day, carrying a NIN, is the
 *    evidence for the correct spelling.
 *
 * ⚠️ NOTHING IN THIS REPO EVER REMOVES A SUPPRESSION. There is no expiry, no hard/soft
 * bounce distinction (`suppressionReasons = ['bounced','complained','unsubscribed']`), and
 * no operator route. So ONE transient bounce — a full mailbox, a greylist, a DNS blip —
 * removes a citizen from every future blast permanently and silently. `admin@` is the proof
 * that produces false positives. This script is the manual stopgap; 13-51 owns the real fix.
 *
 * ⚠️ AUDITED, NOT A RAW UPDATE. Changing the email on a user account changes their login
 * identity. It runs inside `db.transaction()` with `logActionTx` — the AWAITABLE sibling —
 * so a failed audit write rolls the mutation back. `logAction` is fire-and-forget and a
 * script that exits loses the last row of every batch.
 *
 * ⚠️ It refuses to correct an address to one that already belongs to another account: that
 * would be a MERGE, which is a different operation with different consequences (11-7).
 *
 * USAGE (on the VPS, from apps/api — always --dry-run first):
 *   tsx scripts/_ops-contact-remediation.ts --lift admin@oyoskills.com [--dry-run]
 *   tsx scripts/_ops-contact-remediation.ts --correct-user osegunlajide@gmail.con \
 *        --to osegunlajide@gmail.com --reason "typo .con; draft twin with NIN same day" [--dry-run]
 *
 * EXIT: 0 done (or dry-run) · 1 refused on evidence · 2 error · 4 bad args
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { emailSuppressions } from '../src/db/schema/email-suppressions.js';
import { users } from '../src/db/schema/users.js';
import { AuditService } from '../src/services/audit.service.js';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
    return process.argv[i + 1];
  }
  return undefined;
}

// Read, not merely parsed — 13-49's review found a --dry-run that nothing consulted, so every
// "dry" run had in fact written.
const DRY = process.argv.includes('--dry-run');
const LIFT = arg('lift')?.toLowerCase();
const FROM = arg('correct-user')?.toLowerCase();
const TO = arg('to')?.toLowerCase();
const REASON = arg('reason') ?? '(no reason given)';

const log = (s = '') => process.stdout.write(`${s}\n`);
const banner = () => log('='.repeat(70));

async function lift(email: string): Promise<number> {
  banner();
  log(`LIFT SUPPRESSION — ${email}${DRY ? '   [DRY RUN]' : ''}`);
  banner();

  const rows = await db.select().from(emailSuppressions).where(eq(emailSuppressions.email, email));
  if (rows.length === 0) {
    log('  not suppressed — nothing to do.');
    return 0;
  }
  for (const r of rows) {
    log(`  found: reason='${r.reason}' suppressed_at=${r.suppressedAt?.toISOString?.()}`);
  }

  // A suppression exists because a send FAILED. Lifting it without evidence the mailbox now
  // works is "clear the stock, leave the producer": one send, one bounce, re-suppressed, and
  // another bounce charged to a domain the whole blast programme depends on.
  log('');
  log('  ⚠️  Lift ONLY with delivery evidence. For admin@oyoskills.com that evidence is the');
  log('      2026-08-11 probe: sent 05:51:09 → delivered 05:52:02, confirmed at the forwarding');
  log('      mailbox by the operator. Without an equivalent, stop and run');
  log('      _diagnose-mailbox-delivery.ts first.');

  if (DRY) {
    log('');
    log('  DRY RUN — no row deleted, no audit written.');
    return 0;
  }

  await db.transaction(async (tx) => {
    await tx.delete(emailSuppressions).where(eq(emailSuppressions.email, email));
    await AuditService.logActionTx(tx, {
      actorId: null, // operator script, run by a human over SSH — no session principal
      action: 'email.suppression_lifted',
      targetResource: 'users',
      targetId: null,
      details: {
        email,
        priorReason: rows[0]?.reason,
        priorSuppressedAt: rows[0]?.suppressedAt?.toISOString?.(),
        evidence: REASON,
        script: '_ops-contact-remediation.ts',
      },
    });
  });

  const after = await db.select().from(emailSuppressions).where(eq(emailSuppressions.email, email));
  // Read it back. A record about the work is not the work.
  log(`  lifted. rows remaining for this address: ${after.length} (want 0)`);
  return after.length === 0 ? 0 : 2;
}

async function correctUser(from: string, to: string): Promise<number> {
  banner();
  log(`CORRECT USER EMAIL — ${from}  →  ${to}${DRY ? '   [DRY RUN]' : ''}`);
  banner();

  const src = await db.select().from(users).where(eq(users.email, from));
  if (src.length === 0) {
    log(`  ⛔ no user with email ${from}. Refusing.`);
    return 1;
  }
  if (src.length > 1) {
    log(`  ⛔ ${src.length} users share that address. Refusing — this needs a human decision.`);
    return 1;
  }
  const target = await db.select().from(users).where(eq(users.email, to));
  if (target.length > 0) {
    log(`  ⛔ ${to} ALREADY belongs to another account (${target[0].id}).`);
    log('     That makes this a MERGE, not a correction — different operation, different');
    log('     consequences, and 11-7 owns it. Refusing.');
    return 1;
  }

  const u = src[0];
  log(`  user      ${u.id}`);
  log(`  name      ${u.fullName ?? '(none)'}`);
  log(`  status    ${u.status}`);
  log(`  created   ${u.createdAt?.toISOString?.()}`);
  log('');
  log(`  reason    ${REASON}`);
  log('');
  log('  ⚠️  This changes a LOGIN IDENTITY. Magic-link is the auth path for public users, so');
  log('      the address IS the credential. The proof the correction was right is DELIVERY to');
  log('      the new address — run _diagnose-mailbox-delivery.ts against it afterwards. We');
  log('      cannot ask the person: not being reachable is the defect being fixed.');

  if (DRY) {
    log('');
    log('  DRY RUN — no update, no audit written.');
    return 0;
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ email: to, updatedAt: new Date() }).where(eq(users.id, u.id));
    await AuditService.logActionTx(tx, {
      actorId: null,
      action: 'user.email_corrected',
      targetResource: 'users',
      targetId: u.id,
      details: { from, to, reason: REASON, script: '_ops-contact-remediation.ts' },
    });
  });

  const after = await db.select().from(users).where(eq(users.id, u.id));
  log(`  updated. email is now: ${after[0]?.email}`);
  if (after[0]?.email !== to) {
    log('  ⛔ READ-BACK MISMATCH — the row does not hold the new value.');
    return 2;
  }
  log('');
  log(`  ⚠️  The OLD address (${from}) stays on the suppression list. That is correct: it is a`);
  log('      genuinely dead mailbox. Do not lift it.');
  return 0;
}

async function main(): Promise<number> {
  if (LIFT) return lift(LIFT);
  if (FROM || TO) {
    if (!FROM || !TO) {
      log('ERROR: --correct-user and --to must be given together.');
      return 4;
    }
    return correctUser(FROM, TO);
  }
  log('ERROR: give either --lift <email> or --correct-user <from> --to <to>.');
  return 4;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
    process.exit(2);
  });

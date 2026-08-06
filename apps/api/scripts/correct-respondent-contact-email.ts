/**
 * Correct a respondent's MISTYPED contact email and lift the bounce suppression it caused —
 * audited, transactional, dry-run by default.
 *
 * WHY THIS EXISTS (13-4, 2026-08-06)
 * ----------------------------------
 * `asirusakirat@gmail.come` bounced, was auto-suppressed, and its owner — `OSL-2026-DQNPTQ`,
 * pending-NIN with a working phone — became permanently unreachable. The pending-NIN ladder kept
 * "reminding" her into a void and would, in about a week, have retired her to `nin_unavailable`
 * as though she had declined. She had not; a `.com` was typed `.come`.
 *
 * The fix was one obvious character. Doing it by hand on prod was NOT obvious, and that is the
 * point of this script: **the most defensible correction of the day was also the least
 * traceable.** There is no admin UI for it, so it happened as raw SQL with no audit row. This
 * makes the operation repeatable, reviewable and — above all — audited.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH
 * -----------------------------------
 * `campaign_sends`. That ledger records what was actually sent where, and the bounced message
 * really did go to the typo. Correcting a CONTACT RECORD is right; rewriting SEND HISTORY would
 * be falsifying it.
 *
 * IDEMPOTENT / RETROSPECTIVE. If the data is already correct (because someone did it by hand) the
 * script still writes the audit row and says so. That is how the 2026-08-06 manual change was
 * brought back into the ledger.
 *
 * Usage:
 *   pnpm --filter @oslsr/api tsx scripts/correct-respondent-contact-email.ts \
 *     --ref OSL-2026-DQNPTQ --to asirusakirat@gmail.com [--apply]
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { respondents } from '../src/db/schema/respondents.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../src/services/audit.service.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const ref = arg('ref');
const to = arg('to')?.trim().toLowerCase();
const apply = process.argv.includes('--apply');

if (!ref || !to) {
  console.error('Usage: --ref OSL-2026-XXXXXX --to correct@address.com [--apply]');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error(`Refusing: "${to}" is not a plausible email address.`);
  process.exit(1);
}

const r = await db.query.respondents.findFirst({
  where: eq(respondents.referenceCode, ref),
  columns: { id: true, referenceCode: true, status: true, firstName: true, lastName: true, phoneNumber: true },
});
if (!r) {
  console.error(`No respondent with reference code ${ref}.`);
  process.exit(1);
}

const subs = (await db.execute(sql`
  SELECT id, raw_data->>'email' AS email FROM "submissions" WHERE respondent_id = ${r.id}
`)) as { rows: Array<{ id: string; email: string | null }> };

const current = subs.rows.map((x) => x.email).filter(Boolean) as string[];
const stale = [...new Set(current.filter((e) => e.toLowerCase() !== to))];

// Refuse to hand this address to someone who is not its owner.
const clash = (await db.execute(sql`
  SELECT r.reference_code FROM "submissions" s
  JOIN "respondents" r ON r.id = s.respondent_id
  WHERE lower(s.raw_data->>'email') = ${to} AND r.id <> ${r.id} AND r.status <> 'rolled_back'
  LIMIT 1
`)) as { rows: Array<{ reference_code: string }> };
if (clash.rows.length) {
  console.error(`Refusing: ${to} already belongs to ${clash.rows[0]!.reference_code}.`);
  process.exit(1);
}

console.log(`\n${apply ? '🔴 APPLY' : '🟢 DRY-RUN'}  ${r.referenceCode}  ${r.firstName} ${r.lastName ?? ''}`);
console.log(`  status        ${r.status}`);
console.log(`  phone         ${r.phoneNumber ?? '(none)'}`);
console.log(`  email now     ${current.length ? current.join(', ') : '(none)'}`);
console.log(`  email after   ${to}`);
console.log(`  suppressions to lift: ${stale.length ? stale.join(', ') : '(none — data may already be corrected)'}`);

if (!apply) {
  console.log('\n🟢 DRY-RUN — nothing written. Add --apply.\n');
  process.exit(0);
}

await db.transaction(async (tx) => {
  for (const old of stale) {
    await tx.execute(sql`
      UPDATE "submissions" SET raw_data = jsonb_set(raw_data, '{email}', ${JSON.stringify(to)}::jsonb)
      WHERE respondent_id = ${r.id} AND lower(raw_data->>'email') = ${old.toLowerCase()}`);
    await tx.execute(sql`UPDATE "wizard_drafts" SET email = ${to} WHERE lower(email) = ${old.toLowerCase()}`);
    await tx.execute(sql`DELETE FROM "email_suppressions" WHERE lower(email) = ${old.toLowerCase()}`);
  }
  // The corrected address must not itself be sitting on the suppression list.
  await tx.execute(sql`DELETE FROM "email_suppressions" WHERE lower(email) = ${to}`);

  // Audited IN the transaction — `logActionTx`, never the void `logAction`, which cannot be
  // awaited from a script and loses the last row of every batch (13-49 R11).
  await AuditService.logActionTx(tx, {
    actorId: null,
    action: AUDIT_ACTIONS.OPERATOR_RESPONDENT_EMAIL_CORRECTED,
    targetResource: AUDIT_TARGETS.RESPONDENT,
    targetId: r.id,
    details: {
      referenceCode: r.referenceCode,
      correctedTo: to,
      correctedFrom: stale,
      suppressionsLifted: stale,
      retrospective: stale.length === 0,
      reason: 'mistyped contact address caused a bounce-suppression; respondent unreachable in the pending-NIN ladder',
    },
  });
});

console.log(
  stale.length === 0
    ? '\n✅ Data was already correct — audit row written RETROSPECTIVELY so the change is on the ledger.\n'
    : '\n✅ Corrected + suppression lifted + audited.\n',
);
process.exit(0);

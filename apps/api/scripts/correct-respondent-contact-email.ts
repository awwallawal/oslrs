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
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { respondents } from '../src/db/schema/respondents.js';
import {
  correctRespondentContactEmail,
  ContactAddressClashError,
  ContactCorrectionRefusedError,
  ContactCorrectionReadBackError,
  RespondentNotFoundError,
} from '../src/services/contact-correction.service.js';

/**
 * Story 13-51 (AC2.5) — THE LOGIC NO LONGER LIVES HERE.
 *
 * Everything this script used to do inline — the clash refusal, the per-source rewrites, the
 * suppression delete, the audit write, the read-back — now lives in
 * `src/services/contact-correction.service.ts`, which the operator UI calls too. This file keeps
 * only what a CLI actually owns: argument parsing, the human-readable preview, and exit codes.
 *
 * ⚠️ THE DRY RUN IS NOT A SECOND IMPLEMENTATION. It runs the REAL service inside a transaction
 * and then rolls it back, so the preview exercises the same refusal and the same read-back as
 * `--apply`. A dry-run that re-derived "what would happen" is exactly the divergence 13-4 AC4.6
 * warns about, and it would be at its most convincing when it was wrong.
 *
 * ⚠️ It now also rewrites `magic_link_tokens.email` and `users.email` — the sources the original
 * missed. For the 45 respondents reachable ONLY through a magic-link token, the 2026-08-06
 * version reported success having written nothing the resolver reads.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const ref = arg('ref');
const to = arg('to')?.trim().toLowerCase();
const apply = process.argv.includes('--apply');
const reason =
  arg('reason') ??
  'mistyped contact address caused a bounce-suppression; respondent unreachable in the pending-NIN ladder';

if (!ref || !to) {
  console.error('Usage: --ref OSL-2026-XXXXXX --to correct@address.com [--reason "..."] [--apply]');
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

console.log(`\n${apply ? '[APPLY]' : '[DRY-RUN]'}  ${r.referenceCode}  ${r.firstName} ${r.lastName ?? ''}`);
console.log(`  status        ${r.status}`);
console.log(`  phone         ${r.phoneNumber ?? '(none)'}`);
console.log(`  email after   ${to}`);

/** Sentinel used to roll a dry run back without pretending the failure was real. */
class DryRunRollback extends Error {
  constructor(public readonly result: Awaited<ReturnType<typeof correctRespondentContactEmail>>) {
    super('dry-run rollback');
  }
}

try {
  let outcome: Awaited<ReturnType<typeof correctRespondentContactEmail>> | undefined;
  try {
    await db.transaction(async (tx) => {
      const result = await correctRespondentContactEmail(tx, {
        respondentId: r.id,
        to,
        // A CLI has no session principal. The UI passes the operator's id instead (AC2.2).
        actorId: null,
        reason,
      });
      if (!apply) throw new DryRunRollback(result);
      outcome = result;
    });
  } catch (err) {
    if (err instanceof DryRunRollback) outcome = err.result;
    else throw err;
  }

  const o = outcome!;
  console.log(`  email before  ${o.correctedFrom.length ? o.correctedFrom.join(', ') : '(none found)'}`);
  console.log(
    `  sources written  ${Object.entries(o.sourcesTouched)
      .map(([k, v]) => `${k}=${v}`)
      .join('  ')}`,
  );
  console.log(`  suppressions lifted: ${o.suppressionsLifted.join(', ')}`);
  console.log(`  resolver returns afterwards: ${o.resolvedAfter}`);

  if (!apply) {
    console.log('\n[DRY-RUN] rolled back, nothing written. Add --apply.\n');
    process.exit(0);
  }
  console.log(
    o.retrospective
      ? '\nOK Data was already correct - audit row written RETROSPECTIVELY so the change is on the ledger.\n'
      : '\nOK Corrected + suppression lifted + audited, across every contact source that held it.\n',
  );
  process.exit(0);
} catch (err) {
  if (
    err instanceof ContactAddressClashError ||
    err instanceof ContactCorrectionRefusedError ||
    err instanceof RespondentNotFoundError
  ) {
    console.error(`\nREFUSED: ${err.message}\n`);
    process.exit(1);
  }
  if (err instanceof ContactCorrectionReadBackError) {
    console.error(`\n${err.message}\n   Rolled back - nothing was written.\n`);
    process.exit(2);
  }
  throw err;
}

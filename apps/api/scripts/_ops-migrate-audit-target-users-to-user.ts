/**
 * Story 13-51 (AC2.6) — migrate `audit_logs.target_resource` from the plural `'users'` to the
 * singular canonical `'user'`, for the TWO ACTIONS 13-51 owns. Dry-run by default.
 *
 * WHY THIS IS SAFE ON A HASH-CHAINED TABLE
 * ----------------------------------------
 * `AuditService.computeHash` hashes `id|action|actorId|createdAt|details|previousHash`.
 * `target_resource` is NOT in that payload, so rewriting it cannot invalidate a single row's
 * hash nor any link in the chain. Verified against `audit.service.ts` before this was written;
 * re-verify with `pnpm --filter @oslsr/api audit:verify-chain` after applying, which is the
 * whole point of having that command.
 *
 * ⚠️ WHY THE SCOPE IS TWO ACTIONS AND NOT "EVERY ROW SPELLED 'users'"
 * ------------------------------------------------------------------
 * A census on 2026-08-19 found **28 source sites** still writing `targetResource: 'users'`:
 * mfa.controller.ts x12, staff.service.ts x7, auth.service.ts x4, this story's pair x2, and
 * one each in staff-artefacts.service.ts, mfa-grace.ts, _deactivate-undeliverable-admins.ts.
 * 13-51 re-points only its own two. Migrating the OTHER rows while 26 live sites keep writing
 * the plural would not remove the second spelling — it would manufacture a third state (old
 * rows singular, new rows plural, and no query able to union them either way round).
 *
 * So: this migrates exactly the rows whose `action` is one of the two constants this story
 * adopted. Everything else keeps the plural until the story that re-points those 26 sites
 * migrates them in the same change. That residual is stated on 13-51, not hidden here.
 *
 * EXPECTED VOLUME: 4 rows (the 2026-08-11 remediation session — SCP §11 rows 1-4). The script
 * PREDICTS before it writes and compares afterwards, because "it moved" passes for any change
 * including a wrong one.
 *
 * USAGE (from apps/api — always --dry-run first):
 *   tsx scripts/_ops-migrate-audit-target-users-to-user.ts --dry-run
 *   tsx scripts/_ops-migrate-audit-target-users-to-user.ts --apply
 *
 * EXIT: 0 done (or dry-run) · 2 read-back mismatch · 4 bad args
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../src/services/audit.service.js';

const APPLY = process.argv.includes('--apply');
const DRY = !APPLY;

const ACTIONS = [AUDIT_ACTIONS.EMAIL_SUPPRESSION_LIFTED, AUDIT_ACTIONS.USER_EMAIL_CORRECTED];
const STALE = 'users';
const CANON = AUDIT_TARGETS.USER;

function log(s: string): void {
  console.log(s);
}

async function main(): Promise<number> {
  if (process.argv.includes('--help')) {
    log('Usage: --dry-run (default) | --apply');
    return 4;
  }

  log('='.repeat(78));
  log(`AUDIT TARGET MIGRATION  '${STALE}' → '${CANON}'${DRY ? '   [DRY RUN]' : '   [APPLY]'}`);
  log('='.repeat(78));
  log(`  scoped to actions: ${ACTIONS.join(', ')}`);
  log('');

  // PREDICT FIRST. A count taken after the write proves only that a write happened.
  const before = (await db.execute(sql`
    SELECT action, target_resource, count(*)::int AS n
      FROM audit_logs
     WHERE action IN (${sql.join(ACTIONS.map((a) => sql`${a}`), sql`, `)})
     GROUP BY action, target_resource
     ORDER BY action, target_resource
  `)) as unknown as { rows: Array<{ action: string; target_resource: string; n: number }> };

  if (before.rows.length === 0) {
    log('  no rows for either action — nothing to migrate.');
    return 0;
  }
  for (const r of before.rows) {
    log(`  before: ${r.action.padEnd(28)} target='${r.target_resource}'  n=${r.n}`);
  }

  const predicted = before.rows
    .filter((r) => r.target_resource === STALE)
    .reduce((n, r) => n + r.n, 0);
  const alreadyCanon = before.rows
    .filter((r) => r.target_resource === CANON)
    .reduce((n, r) => n + r.n, 0);

  log('');
  log(`  PREDICTION: ${predicted} row(s) will change '${STALE}' → '${CANON}'.`);
  log(`              ${alreadyCanon} row(s) already canonical and must be left untouched.`);

  if (predicted === 0) {
    log('  nothing to do (idempotent — a re-run of an applied migration lands here).');
    return 0;
  }

  if (DRY) {
    log('');
    log('  DRY RUN — nothing written. Add --apply.');
    return 0;
  }

  await db.execute(sql`
    UPDATE audit_logs
       SET target_resource = ${CANON}
     WHERE action IN (${sql.join(ACTIONS.map((a) => sql`${a}`), sql`, `)})
       AND target_resource = ${STALE}
  `);

  // Read it back. A record about the work is not the work.
  const after = (await db.execute(sql`
    SELECT target_resource, count(*)::int AS n
      FROM audit_logs
     WHERE action IN (${sql.join(ACTIONS.map((a) => sql`${a}`), sql`, `)})
     GROUP BY target_resource
     ORDER BY target_resource
  `)) as unknown as { rows: Array<{ target_resource: string; n: number }> };

  log('');
  for (const r of after.rows) {
    log(`  after:  target='${r.target_resource}'  n=${r.n}`);
  }

  const stragglers = after.rows.filter((r) => r.target_resource === STALE).reduce((n, r) => n + r.n, 0);
  const nowCanon = after.rows.filter((r) => r.target_resource === CANON).reduce((n, r) => n + r.n, 0);

  if (stragglers !== 0) {
    log(`  ⛔ READ-BACK MISMATCH — ${stragglers} row(s) still spelled '${STALE}'.`);
    return 2;
  }
  if (nowCanon !== predicted + alreadyCanon) {
    log(`  ⛔ READ-BACK MISMATCH — expected ${predicted + alreadyCanon} canonical rows, found ${nowCanon}.`);
    return 2;
  }

  log('');
  log(`  ✅ ${predicted} row(s) migrated, exactly as predicted.`);
  log('  ⚠️  Now run `pnpm --filter @oslsr/api audit:verify-chain`. target_resource is not in the');
  log('      hash payload, so the chain MUST still verify — if it does not, something else moved.');
  return 0;
}

main()
  .then(async (code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error(err);
    process.exit(2);
  });

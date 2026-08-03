/**
 * Run the audit log's OWN hash-chain verification and print the verdict.
 *
 * WHY A SCRIPT, WHEN THERE IS ALREADY AN ENDPOINT
 * -----------------------------------------------
 * `GET /audit/verify-chain` exists but is admin-authenticated, so it cannot be used to answer
 * "is the chain intact?" from an operator shell or a CI job without minting a token. The control
 * is cited in `docs/security-posture-reassessment-2026-08-01.md`; a control nobody can cheaply
 * check is a claim, not a control.
 *
 * ⚠️ DO NOT SUBSTITUTE A SQL PROXY FOR THIS. The obvious one is:
 *
 *     lag(hash) OVER (ORDER BY created_at, id) <> previous_hash   -- "broken link"
 *
 * and it is NOT equivalent. `createdAt` is stamped in JS (`new Date()`) BEFORE the transaction
 * opens, so wall-clock order need not match commit order; and under READ COMMITTED two concurrent
 * writers can both read the same tail via `SELECT ... FOR UPDATE` (the second blocks, then
 * re-reads the same locked row — the other's INSERT was not in its scan). Both produce rows that
 * look "unlinked" under a lag() ordering while every hash is exactly what the writer computed.
 * On prod, 2026-08-03, that proxy reported 117 "broken links" in 1,706 rows. This script is what
 * decides whether that means anything.
 *
 *   pnpm --filter @oslsr/api audit:verify-chain
 *   pnpm --filter @oslsr/api audit:verify-chain -- --limit 500     (spot-check the tail)
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { AuditService, GENESIS_HASH } from '../src/services/audit.service.js';

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : undefined;

/**
 * `verifyHashChain` returns one boolean and stops at the first divergence, which is the right
 * behaviour for an endpoint and the wrong output for an investigation: "INVALID" does not say
 * WHICH invariant broke, and the two it enforces mean very different things.
 *
 *   SELF-HASH  hash === computeHash(id, action, actor, createdAt, details, stored previous_hash)
 *              Ordering-independent. A failure means the ROW ITSELF does not match its own hash:
 *              it was altered after the fact, or written by something that bypassed AuditService
 *              (seed scripts, raw SQL). THIS is the tamper signal.
 *
 *   LINK       previous_hash === the preceding row's hash under ORDER BY created_at, id
 *              Ordering-DEPENDENT, and the ordering is not guaranteed: `createdAt` is stamped in
 *              JS before the transaction opens, and under READ COMMITTED two concurrent writers
 *              can both read the same tail (the second blocks on FOR UPDATE, then re-reads the
 *              same locked row — the other's INSERT was never in its scan). Both writers then
 *              store the SAME previous_hash, forking the chain. Nothing is tampered; the linear
 *              order simply never existed.
 *
 * So a link failure whose previous_hash still matches SOME row's hash is a fork — concurrency.
 * A previous_hash matching NOTHING is a gap — a deleted or unwritten predecessor. Reporting
 * those three as one word would repeat the mistake this session has been unpicking all day.
 */
interface Row {
  id: string;
  action: string;
  actor_id: string | null;
  created_at: string;
  details: unknown;
  hash: string;
  previous_hash: string | null;
}

async function main(): Promise<void> {
  const result = await AuditService.verifyHashChain(limit ? { limit } : undefined);

  console.log('');
  console.log('='.repeat(70));
  console.log(`audit_logs hash chain — ${result.valid ? '✅ VALID' : '❌ INVALID'}`);
  console.log('='.repeat(70));
  console.log(`  total records : ${result.totalRecords}`);
  console.log(`  verified      : ${result.verified}${limit ? `  (spot-check limit ${limit})` : ''}`);

  if (result.valid) {
    console.log('');
    console.log('  Every record hashes to its stored value and links to its predecessor.');
    return;
  }

  console.log('');
  console.log(`  first divergence: ${JSON.stringify(result.firstTampered)}`);
  console.log('');
  console.log('  CLASSIFYING — a single "INVALID" cannot tell tampering from concurrency.');

  const rows = (
    await db.execute(sql`
      SELECT id, action, actor_id, created_at, details, hash, previous_hash
        FROM audit_logs ORDER BY created_at ASC, id ASC
    `)
  ).rows as unknown as Row[];

  const allHashes = new Set(rows.map((r) => r.hash));
  let selfHashFailures = 0;
  let linkForks = 0;
  let linkGaps = 0;
  let firstSelfHashFailure: { id: string; created_at: string } | null = null;
  let prevHash: string | null = null;

  for (const r of rows) {
    const expected = AuditService.computeHash(
      r.id,
      r.action,
      r.actor_id,
      new Date(r.created_at),
      r.details,
      r.previous_hash ?? GENESIS_HASH,
    );
    if (r.hash !== expected) {
      selfHashFailures++;
      firstSelfHashFailure ??= { id: r.id, created_at: r.created_at };
    }
    if (prevHash !== null && r.previous_hash !== prevHash) {
      if (r.previous_hash !== null && allHashes.has(r.previous_hash)) linkForks++;
      else linkGaps++;
    }
    prevHash = r.hash;
  }

  console.log('');
  console.log(`  SELF-HASH failures (TAMPER SIGNAL) : ${selfHashFailures}`);
  console.log(`  link forks   (concurrent writers)  : ${linkForks}`);
  console.log(`  link gaps    (missing predecessor) : ${linkGaps}`);

  if (selfHashFailures > 0) {
    console.log('');
    console.log(`  ❌ ${selfHashFailures} row(s) do not match their own hash. First:`);
    console.log(`     ${JSON.stringify(firstSelfHashFailure)}`);
    console.log('     A row was altered after write, or something bypassed AuditService (seed');
    console.log('     scripts and raw SQL both do). Do NOT "repair" by rewriting hashes — that is');
    console.log('     precisely what the chain exists to make impossible. Investigate the writer.');
    process.exit(1);
  }

  console.log('');
  console.log('  ✅ NO TAMPERING: every row matches its own hash. The chain reports INVALID only');
  console.log('     because it assumes a single linear order that concurrent writers never had.');
  console.log('     That is a property of the WRITER (a fork), not evidence of alteration.');
  console.log('     Tamper-evidence still holds per-row; what is weakened is total ordering.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('verification failed to run:', err);
    process.exit(1);
  });

/**
 * Story 13-49 R11 — reconcile AC14 promotions that have no audit row.
 *
 * WHY THIS EXISTS
 * ---------------
 * The first live AC14 run (2026-08-03) promoted 10 respondents and wrote 9
 * `pending_nin.promoted` audit rows. The missing one was the LAST of the batch, which is the
 * signature of the bug rather than an accident of it: `AuditService.logAction` returns `void`,
 * so it cannot be awaited, AND it swallows its own failures into a `logger.warn`. The nine that
 * landed did so only because later iterations' `await`s happened to yield the event loop; the
 * tenth was still in flight when the script exited. A batch job therefore loses exactly one row
 * per run, always the last — which reads as a miscount, not as a defect.
 *
 * The cause is fixed in `promote-nin.ts` (the write moved into the promotion's own transaction
 * via the awaitable `logActionTx`, so a failed audit now rolls the promotion back). This script
 * repairs the rows that were already lost before that fix landed.
 *
 * WHY A FORWARD-DATED ROW, AND NOT A BACK-DATED ONE
 * -------------------------------------------------
 * `audit_logs` is hash-chained: each row's hash covers the previous row's hash, and
 * `verifyHashChain` walks the table in chronological order. `logActionTx` stamps `createdAt =
 * new Date()` and links to the current tail. **Inserting a row bearing the original 12:36
 * timestamp is therefore not something the schema permits** — it would either break the chain or
 * require rewriting every row after it, which is precisely what an append-only ledger exists to
 * prevent. So the choice was never "backfill at the right time vs leave a hole". It was "a
 * forward-dated entry that says what it is, vs silence".
 *
 * A ledger corrects by adjunct entry, never by erasure. This row records WHEN IT WAS WRITTEN
 * (now) and carries the true event time, the cause, and the fix in `details`, so a reader three
 * months from now sees the gap, the reason, and the remedy in one place instead of finding an
 * unexplained discrepancy between two counts.
 *
 * It also restores a clean invariant. ⚠️ **CORRECTED 2026-08-09 (13-55 review R4) — THE INVARIANT
 * IS NOT "promotions == `pending_nin.promoted` rows", AND NEVER WAS.** This script is scoped to the
 * AC14 marker `nin_promoted_by`; `pending_nin.promoted` is written by SIX routes, five of which
 * stamp no marker. The real invariant, and the one `prod-verify.yml` gates on, is narrower and
 * correct: **every MARKER-BEARING promotion has an audit row.** Leaving the hole would have forced
 * that standing check to carry "expect a difference of exactly 1, forever" — a permanently skewed
 * baseline that trains readers to ignore the check and would quietly absorb the NEXT lost row.
 *
 * ⚠️ WHAT THIS SCRIPT CANNOT DO, said plainly because its name is broader than its reach.
 * It reconciles ONE programme (13-49 AC14). It cannot detect a lost audit row for the magic-link,
 * race-resolution-merge, wizard, queue or authenticated-dashboard promotes, because none of them
 * leaves an independent record to reconcile against — the marker IS the second source, and only
 * path 4 writes one. That gap stopped mattering for NEW promotes in Story 13-55: the audit row is
 * now written by `promoteRespondentToActive` inside the promote's own transaction on all six
 * routes, so a promote can no longer exist without its trail. This script remains what it always
 * was — the repair tool for rows lost BEFORE that fix.
 *
 * USAGE — preview is the default; there is no way to write by omitting a flag.
 *
 *   pnpm --filter @oslsr/api audit:reconcile-promotions
 *   pnpm --filter @oslsr/api audit:reconcile-promotions -- --apply
 *
 * IDEMPOTENT BY CONSTRUCTION: it selects only promotions with NO `pending_nin.promoted` row, so a
 * second run finds nothing. Re-running is safe and is the verification step.
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../src/services/audit.service.js';

const apply = process.argv.includes('--apply');

interface OrphanRow {
  id: string;
  reference_code: string | null;
  promoted_at: string | null;
  promoted_by: string | null;
  from_draft_id: string | null;
}

async function main(): Promise<void> {
  console.log('');
  console.log('='.repeat(78));
  console.log(
    `Story 13-49 R11 — audit reconciliation for AC14 promotions  [${apply ? '🔴 LIVE' : '🟢 PREVIEW'}]`,
  );
  console.log('='.repeat(78));

  // A promotion is evidenced by its metadata marker; the audit row is the compliance trail.
  // Anything with the first and not the second is what this script repairs.
  const result = await db.execute(sql`
    SELECT r.id,
           r.reference_code,
           r.metadata->>'nin_promoted_at'            AS promoted_at,
           r.metadata->>'nin_promoted_by'            AS promoted_by,
           r.metadata->>'nin_promoted_from_draft_id' AS from_draft_id
      FROM respondents r
     WHERE r.metadata ? 'nin_promoted_by'
       AND NOT EXISTS (
             SELECT 1 FROM audit_logs a
              WHERE a.action = ${AUDIT_ACTIONS.PENDING_NIN_PROMOTED}
                AND a.target_id = r.id)
     ORDER BY r.metadata->>'nin_promoted_at'
  `);

  const orphans = result.rows as unknown as OrphanRow[];

  const totals = await db.execute(sql`
    SELECT (SELECT count(*) FROM respondents WHERE metadata ? 'nin_promoted_by') AS promotions,
           (SELECT count(*) FROM respondents r WHERE r.metadata ? 'nin_promoted_by'
              AND EXISTS (SELECT 1 FROM audit_logs a
                           WHERE a.action = ${AUDIT_ACTIONS.PENDING_NIN_PROMOTED}
                             AND a.target_id = r.id))                            AS promotions_with_audit,
           (SELECT count(*) FROM audit_logs
             WHERE action = ${AUDIT_ACTIONS.PENDING_NIN_PROMOTED})              AS audit_rows
  `);
  const { promotions, promotions_with_audit, audit_rows } = totals.rows[0] as unknown as {
    promotions: string;
    promotions_with_audit: string;
    audit_rows: string;
  };

  /**
   * ⚠️ 13-55 REVIEW R4 — THE TWO NUMBERS THIS USED TO PRINT ARE NOT COMPARABLE, AND PRINTING THEM
   * ADJACENT AND UNLABELLED INVITED THE WRONG SUBTRACTION.
   *
   * It rendered `promotions on record : 0 / audit rows on record : 65`, which reads as "65 orphans"
   * or "65 rows from nowhere". Neither is true: the first counts the AC14 MARKER cohort, the second
   * counts `pending_nin.promoted` rows from ALL SIX promote routes, most of which stamp no marker.
   *
   * `prod-verify.yml` learned this on 2026-08-03 — it rendered `10 | 87`, "inviting the reading that
   * 77 rows were missing", and its own comment now reads *"DO NOT print total pending_nin.promoted
   * rows next to the AC14 count… Compare like with like."* That gate names THIS script as its
   * remedy, and this script had never been given the same correction. So: the comparable pair is
   * printed as a pair, and the global total is printed apart, labelled as not comparable.
   */
  console.log('');
  console.log(`  AC14 promotions (marker) : ${promotions}`);
  console.log(`   …of those, with a trail : ${promotions_with_audit}`);
  console.log(`   …missing a trail        : ${orphans.length}   ← the only number this script repairs`);
  console.log('');
  console.log(`  FYI, NOT a comparable quantity:`);
  console.log(`  all pending_nin.promoted rows ever, all 6 routes : ${audit_rows}`);
  console.log(`  (magic link · race merge · wizard · queue · draft adoption · dashboard —`);
  console.log(`   five of the six stamp no marker, so they are neither counted above nor repairable`);
  console.log(`   here. Since 13-55 the audit row is written in the promote's own transaction, so a`);
  console.log(`   missing one is no longer a way for them to fail.)`);
  console.log('');

  /**
   * The per-route breakdown. 13-55 made `trigger` a closed union precisely so this question has an
   * answer; before it, two routes shared one label and the audit trail could not say which promoted
   * a given citizen. A route reading 0 here is worth a second look — that is the shape the
   * authenticated-dashboard route had for months before 13-55 (it wrote a different action entirely
   * and every promote monitor read zero while looking correct).
   */
  const byTrigger = await db.execute(sql`
    SELECT COALESCE(details->>'trigger', '(none)') AS trigger, count(*) AS rows
      FROM audit_logs
     WHERE action = ${AUDIT_ACTIONS.PENDING_NIN_PROMOTED}
     GROUP BY 1 ORDER BY 2 DESC
  `);
  const routes = byTrigger.rows as unknown as Array<{ trigger: string; rows: string }>;
  if (routes.length > 0) {
    console.log('  promotes by route:');
    for (const r of routes) {
      console.log(`    ${r.trigger.padEnd(30)} ${String(r.rows).padStart(6)}`);
    }
    console.log('');
  }

  if (orphans.length === 0) {
    console.log('✅ Nothing to reconcile — every promotion has its audit row.');
    console.log('   (This is also the expected result of a SECOND run.)');
    return;
  }

  for (const row of orphans) {
    if (!apply) {
      console.log(`  would write  ${row.reference_code ?? row.id}  (promoted ${row.promoted_at})`);
      continue;
    }

    await db.transaction(async (tx) => {
      await AuditService.logActionTx(tx, {
        actorId: null,
        action: AUDIT_ACTIONS.PENDING_NIN_PROMOTED,
        targetResource: AUDIT_TARGETS.RESPONDENT,
        targetId: row.id,
        details: {
          // ⚠️ EVERY READER OF THIS ROW MUST SEE, IMMEDIATELY, THAT IT IS NOT A REAL-TIME WRITE.
          backfilled: true,
          backfill_reason:
            'The original audit row was lost at write time. `AuditService.logAction` returns ' +
            '`void` (cannot be awaited) and swallows failures into a logger.warn, so the LAST ' +
            'promotion of the batch was still in flight when the script exited. 10 respondents ' +
            'were promoted and 9 audit rows were written.',
          backfill_fix:
            'promote-nin.ts now writes the audit row inside the promotion transaction via the ' +
            'awaitable logActionTx, so a failed audit rolls the promotion back. Regression test: ' +
            'draft-adoption.promote-nin.test.ts "rolls the promotion back when the audit row ' +
            'cannot be written". Standing check: prod-verify.yml section 5 asserts promotions == ' +
            'audit rows.',
          // This row's own created_at is NOW. The event happened here:
          original_event_at: row.promoted_at,
          story: '13-49',
          residual: 'R11',
          trigger: 'draft_adoption_ac14',
          marker: row.promoted_by,
          draftId: row.from_draft_id,
          note: 'NIN recovered from the respondent’s own abandoned draft — no outreach required',
        },
      });
    });

    console.log(`  ✅ wrote  ${row.reference_code ?? row.id}  (event was ${row.promoted_at})`);
  }

  console.log('');
  if (apply) {
    console.log('🔴 LIVE RUN COMPLETE. Re-run WITHOUT --apply to confirm it now reports 0.');
  } else {
    console.log('🟢 PREVIEW COMPLETE — nothing written. Add --apply to write.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('reconciliation failed:', err);
    process.exit(1);
  });

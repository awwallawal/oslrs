/**
 * Merge historical duplicate respondent pairs — same person, two records.
 *
 * WHY A MERGE AND NOT A DELETE
 * ----------------------------
 * The obvious rule — "keep the `active` record that has a NIN, delete the other" — LOSES DATA in
 * 4 of these 11 pairs, because the record holding the NIN has NO submission while the one holding
 * their questionnaire answers has NO NIN. Deleting the second would throw away everything they
 * actually told us: occupation, skills, household, business. The pairs where that inversion bites
 * are B61GC0/V4F8G2, PP0F59/NYZNA1, XVQQ6X/WVT8PC and 10E5VB/J622R1.
 *
 * So: pick the survivor by DATA, then carry the identity across.
 *
 * SURVIVOR RULE (computed, then printed for review — never assumed):
 *   1. more submissions wins        — the answers are the irreplaceable part
 *   2. tie → the one WITH a NIN     — identity beats nothing
 *   3. tie → the older record        — it holds the reference code already in the wild
 *
 * MERGE, NEVER CLOBBER — the same rule `enrichExistingRespondent` follows. Only NULL columns on
 * the survivor are filled from the loser. A populated value always wins: the survivor may have
 * been corrected by staff since, and a merge must not undo that.
 *
 * SUBMISSIONS ARE RE-POINTED, NOT DELETED. Every answer set the person ever gave ends up on the
 * surviving record. `fraud_detections` keys on `submission_id`, so those follow automatically.
 * `marketplace_profiles` are dropped for the loser only — the survivor's own consent-gated
 * extraction owns that, and re-pointing would risk a unique-constraint collision.
 *
 * ⚠️ CONFLICTING-NIN PAIRS ARE NOT RESOLVED HERE. Two pairs hold DIFFERENT NINs on both sides
 * (10E5VB/J622R1 and NNJFJS/YC86Z9, both since May 2026). This script picks the survivor by data
 * and leaves its NIN alone; `nin:reconfirm` then asks the holder, because format-only validation
 * cannot decide which is right and a mistyped NIN may be another citizen's real one.
 *
 *   pnpm --filter @oslsr/api merge:duplicates            (preview)
 *   pnpm --filter @oslsr/api merge:duplicates -- --apply (merge)
 *
 * Scope is the hard-coded pair list below — the same discipline as every other write script here.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { respondents } from '../src/db/schema/respondents.js';
import { submissions } from '../src/db/schema/submissions.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../src/services/audit.service.js';

/** The 11 same-person pairs found by phone + >=2 shared name tokens (prod, 2026-08-05). */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['OSL-2026-10E5VB', 'OSL-2026-J622R1'], // NIN conflict → reconfirm after
  ['OSL-2026-NNJFJS', 'OSL-2026-YC86Z9'], // NIN conflict → reconfirm after
  ['OSL-2026-4T12TQ', 'OSL-2026-WJFFY1'],
  ['OSL-2026-AWW996', 'OSL-2026-K4QB4W'],
  ['OSL-2026-B61GC0', 'OSL-2026-V4F8G2'],
  ['OSL-2026-DAH7QG', 'OSL-2026-VWBWXQ'],
  ['OSL-2026-FJWBGC', 'OSL-2026-PH6DN7'],
  ['OSL-2026-FRZPBV', 'OSL-2026-ZGT2ZZ'],
  ['OSL-2026-PP0F59', 'OSL-2026-NYZNA1'],
  ['OSL-2026-PYFF1P', 'OSL-2026-7GYMJD'],
  ['OSL-2026-XVQQ6X', 'OSL-2026-WVT8PC'],
];

const apply = process.argv.includes('--apply');

/** Columns a merge may fill on the survivor — only where the survivor is NULL. */
const FILLABLE = [
  'firstName', 'lastName', 'dateOfBirth', 'phoneNumber', 'lgaId', 'nin',
] as const;

interface Side {
  id: string;
  referenceCode: string | null;
  status: string;
  nin: string | null;
  createdAt: Date;
  subs: number;
  row: Record<string, unknown>;
}

async function load(code: string): Promise<Side | null> {
  const r = await db.query.respondents.findFirst({ where: eq(respondents.referenceCode, code) });
  if (!r) return null;
  const c = await db.execute(
    sql`SELECT count(*)::int AS n FROM submissions WHERE respondent_id = ${r.id}`,
  );
  const subs = ((c as unknown as { rows: Array<{ n: number }> }).rows[0]?.n ?? 0);
  return {
    id: r.id,
    referenceCode: r.referenceCode,
    status: r.status as string,
    nin: r.nin,
    createdAt: r.createdAt,
    subs,
    row: r as unknown as Record<string, unknown>,
  };
}

/** 1) more submissions · 2) has a NIN · 3) older. Printed so the choice is reviewable. */
function chooseSurvivor(a: Side, b: Side): { keep: Side; drop: Side; why: string } {
  if (a.subs !== b.subs) {
    return a.subs > b.subs
      ? { keep: a, drop: b, why: `more submissions (${a.subs} vs ${b.subs})` }
      : { keep: b, drop: a, why: `more submissions (${b.subs} vs ${a.subs})` };
  }
  const aNin = a.nin !== null, bNin = b.nin !== null;
  if (aNin !== bNin) {
    return aNin
      ? { keep: a, drop: b, why: 'holds a NIN' }
      : { keep: b, drop: a, why: 'holds a NIN' };
  }
  return a.createdAt <= b.createdAt
    ? { keep: a, drop: b, why: 'older record' }
    : { keep: b, drop: a, why: 'older record' };
}

async function main(): Promise<void> {
  console.log('');
  console.log('='.repeat(86));
  console.log(`Duplicate respondent merge — ${apply ? '🔴 LIVE' : '🟢 PREVIEW'}   (${PAIRS.length} pairs)`);
  console.log('='.repeat(86));

  let merged = 0, skipped = 0;

  for (const [ca, cb] of PAIRS) {
    const a = await load(ca);
    const b = await load(cb);
    if (!a || !b) {
      console.log(`  ⏭  ${ca} / ${cb} — one side is gone already; nothing to merge`);
      skipped++;
      continue;
    }

    const { keep, drop, why } = chooseSurvivor(a, b);
    const conflict = a.nin !== null && b.nin !== null && a.nin !== b.nin;

    const fills = FILLABLE.filter((f) => (keep.row[f] ?? null) === null && (drop.row[f] ?? null) !== null);
    const moving = drop.subs;

    console.log('');
    console.log(`  ${keep.referenceCode}  ⟵  ${drop.referenceCode}`);
    console.log(`     survivor: ${why} · keep(${keep.status}, nin:${keep.nin ? 'yes' : 'no'}, subs:${keep.subs})` +
                ` · drop(${drop.status}, nin:${drop.nin ? 'yes' : 'no'}, subs:${drop.subs})`);
    if (fills.length) console.log(`     fill NULLs from loser: ${fills.join(', ')}`);
    if (moving) console.log(`     re-point ${moving} submission(s) onto the survivor`);
    if (conflict) console.log(`     ⚠️ CONFLICTING NINs — survivor's NIN left alone; run nin:reconfirm after`);

    if (!apply) continue;

    await db.transaction(async (tx) => {
      if (fills.length) {
        const set: Record<string, unknown> = {};
        for (const f of fills) set[f] = drop.row[f];
        // A no-NIN survivor inheriting a NIN becomes active — that is what the NIN is for.
        if (fills.includes('nin' as never) && keep.status !== 'active') set.status = 'active';
        set.updatedAt = new Date();
        await tx.update(respondents).set(set).where(eq(respondents.id, keep.id));
      }

      await tx.update(submissions).set({ respondentId: keep.id }).where(eq(submissions.respondentId, drop.id));
      await tx.execute(sql`DELETE FROM marketplace_profiles WHERE respondent_id = ${drop.id}`);
      await tx.delete(respondents).where(eq(respondents.id, drop.id));

      await AuditService.logActionTx(tx, {
        actorId: null,
        action: AUDIT_ACTIONS.RESPONDENT_MERGED,
        targetResource: AUDIT_TARGETS.RESPONDENT,
        targetId: keep.id,
        details: {
          trigger: 'duplicate_merge_2026_08',
          survivor: keep.referenceCode,
          removed: drop.referenceCode,
          removedRespondentId: drop.id,
          reason: why,
          filledFromRemoved: fills,
          submissionsRePointed: moving,
          conflictingNins: conflict,
          removedNin: drop.nin,
        },
      });
    });

    merged++;
    console.log(`     ✅ merged`);
  }

  console.log('');
  console.log(`  ${merged} merged · ${skipped} skipped`);
  console.log(apply ? '🔴 LIVE RUN COMPLETE.' : '🟢 PREVIEW — nothing written. Add --apply to merge.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('merge failed:', err);
    process.exit(1);
  });

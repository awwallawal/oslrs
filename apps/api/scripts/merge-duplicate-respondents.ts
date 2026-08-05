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
  // Added 2026-08-05: formed AFTER the first eleven were merged, and it is the duplicate that
  // exposed R21 — the R13 guard was never running on the public wizard. `Segun Adewale /
  // Akingbade` (05-19, active, with NIN) re-registered as `Akingbade / Segun Adewale` (08-05,
  // pending, no NIN): same phone, three shared name tokens. Merged rather than deleted so the
  // answers from today's submission survive on the surviving record.
  ['OSL-2026-MGKS01', 'OSL-2026-Q09HFP'],
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

/**
 * 1) OLDER wins · 2) has a NIN · 3) more submissions. Printed so the choice is reviewable.
 *
 * ⚠️ REORDERED 2026-08-05. "More submissions" was rule 1, and it was the wrong criterion — it
 * looks like it protects data and does not. **Submissions are RE-POINTED to the survivor either
 * way**, and NULL columns are filled from the loser, so every answer and the NIN survive whichever
 * record wins. The only thing that actually differs is WHICH REFERENCE CODE LIVES.
 *
 * That makes age the criterion that matters: the older code is the one already in the wild — in a
 * confirmation email, on a screenshot, written down. Preferring the newer record silently voids a
 * number someone has been holding for months. It surfaced on `MGKS01`/`Q09HFP`, where the old rule
 * chose a code issued four hours earlier over one held since 19 May.
 *
 * Honest note on the first eleven merges (already applied under the old order): 5 of them chose the
 * NEWER record on "more submissions". The DATA outcome was equivalent — nothing was lost — but the
 * surviving code was the later one in those five. Not worth undoing; recorded so the history reads
 * correctly.
 */
function chooseSurvivor(a: Side, b: Side): { keep: Side; drop: Side; why: string } {
  if (a.createdAt.getTime() !== b.createdAt.getTime()) {
    return a.createdAt < b.createdAt
      ? { keep: a, drop: b, why: 'older record — its reference code is the one already in the wild' }
      : { keep: b, drop: a, why: 'older record — its reference code is the one already in the wild' };
  }
  const aNin = a.nin !== null, bNin = b.nin !== null;
  if (aNin !== bNin) {
    return aNin
      ? { keep: a, drop: b, why: 'same age; holds a NIN' }
      : { keep: b, drop: a, why: 'same age; holds a NIN' };
  }
  return a.subs >= b.subs
    ? { keep: a, drop: b, why: `same age; more submissions (${a.subs} vs ${b.subs})` }
    : { keep: b, drop: a, why: `same age; more submissions (${b.subs} vs ${a.subs})` };
}

async function main(): Promise<void> {
  console.log('');
  console.log('='.repeat(86));
  console.log(`Duplicate respondent merge — ${apply ? '🔴 LIVE' : '🟢 PREVIEW'}   (${PAIRS.length} pairs)`);
  console.log('='.repeat(86));

  /**
   * DRIFT GUARD — the hard-coded list above is a SNAPSHOT of a LIVE table, and this project has
   * already been bitten by exactly that: the triage sheet had to be reconciled against
   * `wizard_drafts` FOUR times in one session because people kept registering underneath it
   * (13-49 R15). A merge is destructive, so it re-derives the pairs from live data and refuses
   * to run if reality has moved.
   *
   * Same identity key as the R13 dedupe guard and the prod-verify §5c check: same phone plus at
   * least two shared name tokens in any order.
   */
  const live = await db.execute(sql`
    WITH pairs AS (
      SELECT a.reference_code AS rec_a, b.reference_code AS rec_b,
             (SELECT count(*) FROM (
                SELECT unnest(ARRAY(SELECT t FROM unnest(string_to_array(lower(coalesce(a.first_name,'')||' '||coalesce(a.last_name,'')),' ')) AS t WHERE t<>''))
                INTERSECT
                SELECT unnest(ARRAY(SELECT t FROM unnest(string_to_array(lower(coalesce(b.first_name,'')||' '||coalesce(b.last_name,'')),' ')) AS t WHERE t<>''))
             ) x) AS tok
      FROM respondents a JOIN respondents b
        ON a.phone_number = b.phone_number AND a.id < b.id
       AND a.status <> 'rolled_back' AND b.status <> 'rolled_back')
    SELECT rec_a, rec_b FROM pairs WHERE tok >= 2
  `);
  const liveRows = (live as unknown as { rows: Array<{ rec_a: string; rec_b: string }> }).rows ?? [];
  const key = (x: string, y: string) => [x, y].sort().join('|');
  const liveSet = new Set(liveRows.map((r) => key(r.rec_a, r.rec_b)));
  const listSet = new Set(PAIRS.map(([x, y]) => key(x, y)));

  const appeared = [...liveSet].filter((k) => !listSet.has(k));

  /**
   * A scripted pair missing from the live set is NOT automatically drift. If one side no longer
   * exists, this script already merged it — a resumed run after a partial failure must not be
   * blocked by its own previous success. Only a pair whose BOTH sides still exist, yet no longer
   * matches, means the data moved underneath us.
   */
  const stillBoth = await Promise.all(
    PAIRS.map(async ([x, y]) => ({ k: key(x, y), both: (await load(x)) !== null && (await load(y)) !== null })),
  );
  const vanished = stillBoth
    .filter((p) => !liveSet.has(p.k) && p.both)
    .map((p) => p.k);
  const alreadyMerged = stillBoth.filter((p) => !liveSet.has(p.k) && !p.both).length;

  console.log(`  drift check: ${liveSet.size} live pair(s) vs ${listSet.size} scripted` +
              (alreadyMerged ? ` · ${alreadyMerged} already merged by a previous run` : ''));
  if (appeared.length || vanished.length) {
    for (const k of appeared) console.log(`     ➕ NEW live duplicate not in this script: ${k.replace('|', ' / ')}`);
    for (const k of vanished) console.log(`     ➖ both sides still exist but no longer match: ${k.replace('|', ' / ')}`);
    console.log('');
    console.log('  ❌ The table has moved since this list was written. A merge DELETES a record,');
    console.log('     so it will not run against a stale plan. Re-derive the pairs and re-review.');
    process.exitCode = 1;
    return;
  }
  console.log('  ✅ no drift — the scripted pairs match live data exactly');

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
      /**
       * ⚠️ ORDER IS LOAD-BEARING: the loser is DELETED BEFORE the survivor inherits its NIN.
       *
       * The first cut updated the survivor first and died on the live run —
       * `23505 respondents_nin_unique_when_present, Key (nin)=(40503035523) already exists`.
       * Of course it did: the loser still held that NIN at that moment, and a partial unique
       * index is checked per-statement, not at COMMIT. Four pairs had already merged cleanly
       * because none of them needed to carry a NIN across; the fifth was the first that did.
       *
       * Submissions are re-pointed BEFORE the delete so nothing is ever orphaned, then the loser
       * goes, then the survivor takes the NIN into the space just vacated.
       */
      await tx.update(submissions).set({ respondentId: keep.id }).where(eq(submissions.respondentId, drop.id));
      await tx.execute(sql`DELETE FROM marketplace_profiles WHERE respondent_id = ${drop.id}`);
      await tx.delete(respondents).where(eq(respondents.id, drop.id));

      if (fills.length) {
        const set: Record<string, unknown> = {};
        for (const f of fills) set[f] = drop.row[f];
        // A no-NIN survivor inheriting a NIN becomes active — that is what the NIN is for.
        if (fills.includes('nin' as never) && keep.status !== 'active') set.status = 'active';
        set.updatedAt = new Date();
        await tx.update(respondents).set(set).where(eq(respondents.id, keep.id));
      }

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

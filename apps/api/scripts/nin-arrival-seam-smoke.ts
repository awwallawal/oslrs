/**
 * Story 13-53 — the NIN-arrival seam: DETECTOR, BASELINE, and the OBSERVED log line.
 *
 * ⛔ WHY THIS EXISTS AT ALL — READ BEFORE TRUSTING A ZERO
 * -------------------------------------------------------
 * Every metric this story cares about was ALREADY ZERO before a line of code was written (prod,
 * 2026-08-07): 0 NIN-arrival pairs, 0 duplicate-phone pairs, 0 `identifier_ambiguous` events. So
 * "re-run the detector and see no duplicates" is unfalsifiable — it would read identically if the
 * fix were never deployed. That is R21's trap verbatim, and last time it cost a live duplicate to
 * notice: a guard whose only evidence is an ABSENCE cannot be told apart from a guard that never
 * runs.
 *
 * Hence the two halves:
 *   --detect  (READ-ONLY, safe on prod)  the detector + the five baseline metrics. Answers
 *             "has anything MOVED?", which is meaningful precisely because the baseline is
 *             recorded. It does NOT answer "does the fix work".
 *   --two-pass (WRITES, test DB ONLY)    drives a real registration through the real service
 *             twice — no NIN, then the same person returning WITH one and their name reordered —
 *             so the promote log line is emitted by PRODUCTION CODE and can be READ. That line is
 *             the only positive evidence this story can produce, exactly as
 *             `identity_match_exempted_staff_capture` closed 13-4 AC1b where a row count could not.
 *
 * The write half refuses to run against anything that is not a test database, reusing the same
 * `looksLikeTestDb` boundary check the vitest setup uses. It is a synthetic two-pass against
 * citizen-shaped tables; it must never touch prod, and never a real person's record.
 *
 *   pnpm --filter @oslsr/api nin-arrival:smoke -- --detect      (read-only; prod-safe)
 *   pnpm --filter @oslsr/api nin-arrival:smoke -- --two-pass    (test DB only; writes + cleans up)
 *
 * Exit codes: 0 = clean · 1 = refused, or the two-pass did not promote.
 */
import { sql, inArray } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { respondents } from '../src/db/schema/respondents.js';
import { SubmissionProcessingService } from '../src/services/submission-processing.service.js';
import { looksLikeTestDb, resolveDbName } from '../test/db-guard.js';

const args = process.argv.slice(2);
const wantDetect = args.includes('--detect');
const wantTwoPass = args.includes('--two-pass');

function heading(text: string): void {
  console.log('');
  console.log('='.repeat(86));
  console.log(text);
  console.log('='.repeat(86));
}

/**
 * THE DETECTOR (AC2.1 / AC3.2).
 *
 * The shape is narrower than the general duplicate sweep in `merge-duplicate-respondents.ts`:
 * same phone, >=2 shared name tokens, and EXACTLY ONE side holding a NIN. That asymmetry is the
 * signature of this seam — the person registered without a NIN and came back with it — and it is
 * what distinguishes a 13-53 pair from a plain re-registration or a NIN conflict.
 *
 * Read-only. Safe to run against production.
 */
async function detect(): Promise<number> {
  heading('13-53 — NIN-arrival duplicate detector (READ-ONLY)');

  const pairs = await db.execute(sql`
    WITH tokens AS (
      SELECT id, phone_number, nin, reference_code, created_at, status,
             ARRAY(
               SELECT t FROM unnest(
                 string_to_array(lower(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ' ')
               ) AS t WHERE t <> ''
             ) AS toks
      FROM respondents
      WHERE status <> 'rolled_back' AND phone_number IS NOT NULL
    )
    SELECT a.reference_code AS ninless_code, a.created_at AS ninless_at,
           b.reference_code AS nin_code,     b.created_at AS nin_at,
           (SELECT count(*) FROM (
              SELECT unnest(a.toks) INTERSECT SELECT unnest(b.toks)
            ) x) AS shared_tokens
    FROM tokens a JOIN tokens b ON a.phone_number = b.phone_number AND a.id <> b.id
    -- EXACTLY ONE side holds a NIN. Two NINs is a conflict for a human; zero is the R21 case.
    WHERE a.nin IS NULL AND b.nin IS NOT NULL
      AND (SELECT count(*) FROM (
             SELECT unnest(a.toks) INTERSECT SELECT unnest(b.toks)
           ) x) >= 2
    ORDER BY b.created_at DESC
  `);
  // ⚠️ Timestamps come back as STRINGS here, not Date objects — `db.execute` is the raw driver
  // path, not the typed query builder, so nothing coerces them. Calling `.toISOString()` on one
  // throws, and it throws only when the detector actually FINDS something, which is the branch
  // that never runs on a clean register. Caught by planting a synthetic pair rather than trusting
  // a green run against zero rows.
  const rows = (pairs as unknown as {
    rows: Array<{
      ninless_code: string | null; ninless_at: string;
      nin_code: string | null; nin_at: string; shared_tokens: number;
    }>;
  }).rows ?? [];

  if (rows.length === 0) {
    console.log('  ✅ 0 NIN-arrival pairs.');
    console.log('     ⚠️  This was ALSO the value BEFORE the fix. On its own it proves nothing —');
    console.log('        the promote log line (--two-pass, or grep on prod) is the real evidence.');
  } else {
    console.log(`  🔴 ${rows.length} NIN-arrival pair(s):`);
    for (const r of rows) {
      console.log(
        `     ${r.ninless_code} (no NIN, ${String(r.ninless_at)})  ←  ` +
        `${r.nin_code} (NIN, ${String(r.nin_at)})  · ${r.shared_tokens} shared tokens`,
      );
    }
    console.log('     → repair with `merge:duplicates` (older wins; the NULL-fill carries the NIN).');
  }

  heading('Baseline metrics — re-measured, so any MOVEMENT is attributable');
  /**
   * ALL FIVE of the story's 2026-08-07 baseline rows, not a convenient subset (review H3). The
   * first cut printed three and substituted an unbaselined "live respondents" for the two that
   * were harder to reach — which is how a re-measurement quietly stops being a re-measurement.
   * A metric nobody re-measures cannot show MOVEMENT, and movement is the entire point.
   */
  /**
   * `registry_unified` is a PHYSICAL VIEW created by an init runner, and it does not exist on
   * every database — `registry-unified.ts` already carries a fallback for exactly that state. It
   * gets its own query and its own catch because a single missing relation in a combined SELECT
   * takes down ALL FIVE metrics, and a re-measurement tool that reports nothing when one input is
   * unavailable is worse than one that reports four numbers and says which is missing.
   */
  let registryUnified = 'n/a (view absent)';
  try {
    const ru = await db.execute(sql`SELECT count(*)::int AS n FROM registry_unified`);
    registryUnified = String((ru as unknown as { rows: Array<{ n: number }> }).rows[0]?.n ?? '?');
  } catch {
    // Left as 'n/a' — printed plainly below rather than silently as a zero.
  }

  const metrics = await db.execute(sql`
    WITH toks AS (
      SELECT id, phone_number,
             ARRAY(
               SELECT t FROM unnest(
                 string_to_array(lower(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ' ')
               ) AS t WHERE t <> ''
             ) AS t
      FROM respondents
      WHERE status <> 'rolled_back' AND phone_number IS NOT NULL
    )
    SELECT
      (SELECT count(*) FROM respondents
        WHERE status = 'pending_nin_capture' AND nin IS NULL)                              AS pending_nin_at_risk,
      -- ALL duplicate-phone pairs scoring >=2 shared tokens, whatever the NIN sides look like.
      -- Wider than the detector above: the NIN-arrival shape is one subset of this number, and
      -- watching only the subset would miss a NEW duplicate class the way 13-53 itself was missed.
      -- The a.id < b.id join condition counts each pair ONCE.
      (SELECT count(*) FROM toks a JOIN toks b
         ON a.phone_number = b.phone_number AND a.id < b.id
        WHERE (SELECT count(*) FROM (
                 SELECT unnest(a.t) INTERSECT SELECT unnest(b.t)
               ) x) >= 2)                                                                  AS duplicate_phone_pairs,
      -- The POPULATION that makes registration_status.identifier_ambiguous fire: a phone held by
      -- more than one live respondent means /check-registration must refuse to guess. The event
      -- itself is a pino line, not a row — see the note printed below.
      -- (No backticks in here: this is a JS template literal, and one ends the string. tsc does
      --  not see scripts/ at all, so only RUNNING it finds that — the project rule, again.)
      (SELECT count(*) FROM (
         SELECT phone_number FROM respondents
          WHERE status <> 'rolled_back' AND phone_number IS NOT NULL
          GROUP BY phone_number HAVING count(*) > 1
       ) p)                                                                                AS ambiguous_phones,
      (SELECT count(*) FROM respondents WHERE status <> 'rolled_back')                     AS respondents_live
  `);
  const m = (metrics as unknown as { rows: Array<Record<string, string>> }).rows[0] ?? {};
  console.log(`  1. registry_unified .............................. ${registryUnified}   (baseline 2026-08-07: 315)`);
  console.log(`  2. pending-NIN with no NIN — the AT-RISK cohort .. ${m.pending_nin_at_risk}   (baseline 2026-08-07: 21)`);
  console.log(`  3. NIN-arrival duplicate pairs ................... ${rows.length}   (baseline 2026-08-07: 0)`);
  console.log(`  4. ALL duplicate-phone pairs (>=2 tokens) ........ ${m.duplicate_phone_pairs}   (baseline 2026-08-07: 0)`);
  console.log(`  5. identifier-ambiguous phones (the population) .. ${m.ambiguous_phones}   (baseline 2026-08-07: 0)`);
  console.log(`     · live respondents ............................ ${m.respondents_live}   (context, not a baseline)`);
  console.log('');
  console.log('  ⚠️  Metric 5 measures the CAUSE, not the event. `registration_status.identifier_ambiguous`');
  console.log('     is a pino line with no table behind it, so SQL cannot count it. Its zero here means');
  console.log('     "no phone can trigger it"; for the fired-event count run, on the VPS:');
  console.log('        pm2 logs oslsr-api --lines 5000 --nostream | grep -c identifier_ambiguous');
  console.log('');
  console.log('  The at-risk cohort is the number that matters: every one of those people is a');
  console.log('  candidate the moment they find their NIN. It is a DENOMINATOR, not a defect count.');

  return rows.length;
}

/**
 * THE TWO-PASS (AC2.2) — the only positive evidence.
 *
 * Pass 1 registers a synthetic person with NO NIN. Pass 2 is the same person returning WITH one,
 * name reordered and a middle name dropped — the way people actually re-enter their names, and the
 * exact shape strict first+last equality misses. Both passes go through the REAL
 * `findOrCreateRespondent`, so what you read on stdout is production code logging.
 *
 * Success is not "no duplicate appeared". Success is `promoted_existing_identity_on_nin_arrival`
 * on stdout, the SAME respondent id from both passes, and the reference code from pass 1 surviving.
 */
async function twoPass(): Promise<'ok' | 'failed' | 'refused'> {
  const dbName = resolveDbName(process.env.DATABASE_URL);
  if (!looksLikeTestDb(dbName)) {
    console.error('');
    console.error(`  ⛔ REFUSED — DATABASE_URL points at "${dbName || '(unparseable)'}".`);
    console.error('     The two-pass WRITES respondent rows. It runs against a test database only.');
    console.error('     Re-run with DATABASE_URL pointing at e.g. app_test, or use --detect.');
    // NOT 'failed'. A refusal says nothing about the guard — reporting it as a failure would be
    // the same category error this whole story is about: an absence of evidence read as evidence.
    return 'refused';
  }

  heading(`13-53 — two-pass registration against "${dbName}" (WRITES, then cleans up)`);

  const run = Date.now().toString().slice(-7);
  const phone = `+23480${run}1`;               // E.164: +234 then 10 digits
  const nin = `9${run}0${run}`.slice(0, 11);   // format-only; 13-15 removed the checksum gate
  const created: string[] = [];

  try {
    console.log(`  pass 1 — "Bashiru / Yusuff Titilope", ${phone}, NO NIN`);
    const first = await SubmissionProcessingService.findOrCreateRespondent(
      {
        firstName: 'Bashiru',
        lastName: 'Yusuff Titilope',
        phoneNumber: phone,
        consentMarketplace: false,
        consentEnriched: false,
      },
      'public',
      undefined,
    );
    created.push(first.id);
    const afterFirst = await db.query.respondents.findFirst({
      where: (r, { eq }) => eq(r.id, first.id),
      columns: { referenceCode: true, nin: true, status: true },
    });
    console.log(`           → ${first.id}  code=${afterFirst?.referenceCode}  nin=${afterFirst?.nin ?? 'NULL'}  status=${afterFirst?.status}`);

    console.log('');
    console.log(`  pass 2 — same person returning as "Yusuff / Bashiru", same phone, WITH a NIN`);
    console.log('           (watch for `promoted_existing_identity_on_nin_arrival` below)');
    console.log('  ' + '-'.repeat(82));
    const second = await SubmissionProcessingService.findOrCreateRespondent(
      {
        nin,
        firstName: 'Yusuff',
        lastName: 'Bashiru',
        phoneNumber: phone,
        consentMarketplace: false,
        consentEnriched: false,
      },
      'public',
      undefined,
    );
    if (!created.includes(second.id)) created.push(second.id);
    console.log('  ' + '-'.repeat(82));

    const afterSecond = await db.query.respondents.findFirst({
      where: (r, { eq }) => eq(r.id, second.id),
      columns: { referenceCode: true, nin: true, status: true },
    });
    const onPhone = await db.execute(
      sql`SELECT count(*)::int AS n FROM respondents WHERE phone_number = ${phone}`,
    );
    const count = (onPhone as unknown as { rows: Array<{ n: number }> }).rows[0]?.n ?? -1;

    console.log('');
    console.log(`  same respondent id ............ ${first.id === second.id ? '✅' : '❌'}  (${second.id})`);
    console.log(`  original reference code kept .. ${afterSecond?.referenceCode === afterFirst?.referenceCode ? '✅' : '❌'}  (${afterSecond?.referenceCode})`);
    console.log(`  NIN now present ............... ${afterSecond?.nin === nin ? '✅' : '❌'}  (${afterSecond?.nin ?? 'NULL'})`);
    console.log(`  status promoted to active ..... ${afterSecond?.status === 'active' ? '✅' : '❌'}  (${afterSecond?.status})`);
    console.log(`  records on that phone ......... ${count === 1 ? '✅ 1' : `❌ ${count}`}`);

    const promoted =
      first.id === second.id &&
      afterSecond?.nin === nin &&
      afterSecond?.status === 'active' &&
      afterSecond?.referenceCode === afterFirst?.referenceCode &&
      count === 1;
    return promoted ? 'ok' : 'failed';
  } finally {
    // Synthetic rows never outlive the run. `audit_logs` rows are deliberately left alone —
    // the hash chain is append-only and deleting from it is the one thing worse than a stray row.
    if (created.length > 0) {
      await db.delete(respondents).where(inArray(respondents.id, created));
      console.log('');
      console.log(`  🧹 cleaned up ${created.length} synthetic respondent row(s)`);
    }
  }
}

async function main(): Promise<void> {
  if (!wantDetect && !wantTwoPass) {
    console.log('');
    console.log('  Usage:');
    console.log('    --detect     read-only detector + baseline metrics (safe on prod)');
    console.log('    --two-pass   synthetic two-pass registration (test DB only; writes)');
    console.log('');
    process.exitCode = 1;
    return;
  }

  if (wantDetect) await detect();

  if (wantTwoPass) {
    const outcome = await twoPass();
    if (outcome === 'refused') {
      process.exitCode = 1;
      return;
    }
    if (outcome === 'failed') {
      console.error('');
      console.error('  ❌ The two-pass did NOT promote in place. The seam is open.');
      process.exitCode = 1;
      return;
    }
    console.log('');
    console.log('  ✅ Promote-in-place observed. This is the AC2.2 evidence — keep the log line above.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  /**
   * Review L1 — DRAIN STDOUT BEFORE EXITING.
   *
   * `process.exit` does not flush pending async writes, and stdout is async whenever it is a pipe
   * (`… | tee`, `… > run.log`, CI capture) — which is exactly how anyone would run this to KEEP the
   * evidence. pino's promote line is the one thing this script exists to emit; losing the tail of
   * the buffer to a fast exit would be the same category of error as the story itself: the absence
   * of the line read as the absence of the event. The empty write's callback fires once the queue
   * has drained.
   */
  .finally(() => {
    process.stdout.write('', () => process.exit(process.exitCode ?? 0));
  });

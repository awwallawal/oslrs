/**
 * Story 13-60 — staff photo provenance migration runner.
 *
 * ⛔⛔ THIS RUNNER MUST EXECUTE **BEFORE** `db:push`, NOT AFTER IT. ⛔⛔
 *
 * Every other `migrate-*-init.ts` in this repo runs AFTER `db:push`, because it
 * adds things Drizzle cannot express (CHECK constraints, GIN indexes, views).
 * This one is the opposite: it exists to make `db:push` a NO-OP, because if
 * push sees the rename first it DESTROYS LIVE DATA.
 *
 * Why, precisely:
 *   - AC6.4 renames `users.liveness_score` → `users.photo_sharpness_score`.
 *   - `drizzle-kit push` cannot tell a rename from a drop+add. It ASKS:
 *     "Is photo_sharpness_score created or renamed from another column?"
 *   - `scripts/db-push.ts --force` answers that prompt by pressing Enter, which
 *     selects index 0 = **"create column"** (its own docblock says so, lines
 *     5-8), and then auto-confirms the follow-up data-loss prompt with "Yes".
 *   - Net effect of pushing first: a new EMPTY `photo_sharpness_score`, and
 *     `liveness_score` **DROPPED** — silently taking every stored score with
 *     it. On prod that is real data (0.5913 and 0.8589 among them).
 *   - The prod deploy calls bare `pnpm db:push` (ci-cd.yml) with no TTY, so the
 *     same prompt would either take a default or hang the deploy.
 *
 * Running this first makes the live schema already match the Drizzle schema, so
 * push finds no diff, asks nothing, and drops nothing. That is the entire
 * design: we do the rename ourselves, with `ALTER TABLE ... RENAME COLUMN`,
 * which preserves the values.
 *
 * Idempotent in both directions and safe to re-run on every deploy:
 *   - rename only when the OLD column exists and the NEW one does not;
 *   - `ADD COLUMN IF NOT EXISTS` for the three provenance columns;
 *   - the backfill only touches rows still NULL.
 *
 * Local invocation (run this before `pnpm db:push` on any DB that predates the
 * story — including your dev DB, or push will offer to drop the column):
 *   pnpm --filter @oslsr/api exec tsx scripts/migrate-photo-provenance-init.ts
 *
 * Uses the `pg` package with raw SQL — matches migrate-mfa-init.ts /
 * migrate-reveal-purpose-init.ts (the `postgres` package is NOT a project dep).
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[migrate-photo-provenance-init] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function columnExists(column: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = $1`,
    [column],
  );
  return rows.length > 0;
}

async function run(): Promise<void> {
  console.log('[migrate-photo-provenance-init] Starting Story 13-60 photo-provenance migration...');

  // 1. The rename. Guarded on BOTH sides so a re-run is a no-op and a
  //    half-applied state (someone pushed first) cannot be made worse.
  const hasOld = await columnExists('liveness_score');
  const hasNew = await columnExists('photo_sharpness_score');

  if (hasOld && !hasNew) {
    await pool.query(`ALTER TABLE users RENAME COLUMN liveness_score TO photo_sharpness_score;`);
    console.log(
      '[migrate-photo-provenance-init] ✓ users.liveness_score RENAMED to photo_sharpness_score (values preserved).',
    );
  } else if (hasOld && hasNew) {
    // Both present: db:push already created the new empty column beside the old
    // one. Do NOT drop anything — carry the real values across and leave the old
    // column in place for a human to remove once they have looked at it.
    const { rowCount } = await pool.query(
      `UPDATE users SET photo_sharpness_score = liveness_score
        WHERE photo_sharpness_score IS NULL AND liveness_score IS NOT NULL;`,
    );
    console.warn(
      `[migrate-photo-provenance-init] ⚠️ BOTH columns exist — db:push ran before this runner. ` +
        `Copied ${rowCount ?? 0} value(s) forward. users.liveness_score is left in place ON PURPOSE; ` +
        `drop it by hand after confirming photo_sharpness_score is correct.`,
    );
  } else if (hasNew) {
    /*
     * ⛔ THIS IS THE BRANCH A FAILED ORDERING LANDS IN, AND IT USED TO BE THE
     * SILENT ONE. (Adjudication 2026-08-13.)
     *
     * The `hasOld && hasNew` branch above warns loudly — but it can only be
     * reached if something ADDED the new column beside the old one. The deploy
     * path cannot produce that: `db:push --force` answers the rename prompt with
     * "create column" and auto-confirms the data-loss prompt, so it DROPS the
     * populated column and creates an empty one. That lands here.
     *
     * So the loud branch covered a state this pipeline cannot reach, while the
     * reachable failure printed "nothing to rename" and exited 0 —
     * [[pattern-test-that-passes-over-a-hole]] in a migration.
     *
     * The discriminator is evidence, not a guess: a user holding an ID-card
     * photo completed a live capture, so before this story they MUST have had a
     * score. Every score gone while those users remain is the signature of a
     * lost rename, and it is not a state to carry on from.
     */
    const { rows } = await pool.query<{ scored: string; carded: string }>(
      `SELECT count(*) FILTER (WHERE photo_sharpness_score IS NOT NULL) AS scored,
              count(*) FILTER (WHERE live_selfie_id_card_url IS NOT NULL) AS carded
         FROM users;`,
    );
    const scored = Number(rows[0]?.scored ?? 0);
    const carded = Number(rows[0]?.carded ?? 0);

    if (scored === 0 && carded > 0) {
      throw new Error(
        `users.photo_sharpness_score exists but is EMPTY, while ${carded} user(s) hold an ID-card ` +
          `photo and therefore must once have had a score. That is the signature of db:push running ` +
          `BEFORE this runner — the rename was answered as drop+create and the old values are gone. ` +
          `DO NOT re-run to "fix" it: restore users.liveness_score from backup first, then run this ` +
          `runner ahead of db:push. (Story 13-60 AC6.4.)`,
      );
    }

    console.log(
      `[migrate-photo-provenance-init] ✓ users.photo_sharpness_score already present ` +
        `(${scored} scored / ${carded} with an ID card); nothing to rename.`,
    );
  } else {
    // Neither column exists — a brand-new database. db:push will create
    // photo_sharpness_score directly from the Drizzle schema.
    console.log('[migrate-photo-provenance-init] ✓ Fresh database; db:push will create photo_sharpness_score.');
  }

  // 2. The three provenance columns. All NULLABLE: NULL means "the photo step
  //    never applied to this person" (back-office activation, or an account
  //    older than this story). A NULL IS NOT A FAILURE.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_status TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_source TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_failure_reason TEXT;`);
  console.log('[migrate-photo-provenance-init] ✓ photo_status / photo_source / photo_failure_reason ensured.');

  // 3. Backfill the only outcome we can state with evidence: a user holding an
  //    ID-card photo SAVED one, and before this story live capture was the only
  //    path that could have produced it.
  //
  //    ⚠️ We deliberately do NOT backfill 'skipped' or 'failed' for the rest.
  //    A NULL photo before this story is genuinely ambiguous — skipped, failed,
  //    or never applicable are indistinguishable in the old data, which is the
  //    whole defect. Inventing a value would be fabricating the distinction the
  //    story exists to create. They stay NULL and the operator surface reports
  //    them as "no photo on file", which is true and is all we know.
  const saved = await pool.query(
    `UPDATE users
        SET photo_status = 'saved',
            photo_source = COALESCE(photo_source, 'live_capture')
      WHERE live_selfie_id_card_url IS NOT NULL
        AND photo_status IS NULL;`,
  );
  console.log(
    `[migrate-photo-provenance-init] ✓ Backfilled ${saved.rowCount ?? 0} existing photo holder(s) as saved/live_capture.`,
  );

  console.log('[migrate-photo-provenance-init] Done.');
}

run()
  .catch((err) => {
    console.error('[migrate-photo-provenance-init] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

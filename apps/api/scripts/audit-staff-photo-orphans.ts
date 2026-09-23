/**
 * Audit `staff-photos/` in the object store against the references PRODUCTION holds.
 *
 * ⛔ READ-ONLY BY CONSTRUCTION. No delete path, and it must never grow one. It exists so a
 * deletion decision rests on a re-runnable measurement rather than a number someone wrote
 * down once. If deletion is ever authorised it belongs in a SEPARATE script with its own
 * confirmation flag, so an audit can never become a purge by accident.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════
 * ⛔⛔ READ THIS BEFORE CHANGING HOW REFERENCES ARE LOADED. THE FIRST VERSION OF THIS FILE
 *     CALLED A LIVE STAFF PHOTO AN ORPHAN.
 *
 * It did the obvious thing: `import { db }` and query `users`. Run from a developer laptop
 * that resolves `DATABASE_URL` to the LOCAL dev database (`app_db`, 179 users with selfies),
 * it compared PRODUCTION bucket objects against DEV database references. Both directions
 * break, and one of them is destructive:
 *   • an object referenced only by PROD is reported as an ORPHAN  ← deletes live data
 *   • an object referenced only by DEV is reported as KEPT        ← merely wrong
 *
 * Caught 2026-09-23 because the orphan list disagreed with an earlier prod-sourced run.
 * `staff-photos/id-card/01a0b076-3d58-7e9d-9211-e44ab1010200.jpg` — a real staff member's
 * ID card, referenced by production — was sitting in the "unattributed orphan" list.
 *
 * ⭐ THE LESSON, and it is §2y(d) with the stakes turned up: the query was correct and the
 * SOURCE was wrong, which looks identical to being right. So this script now REFUSES to
 * infer the reference set. You hand it one, explicitly, produced by a documented read-only
 * query against production.
 * ════════════════════════════════════════════════════════════════════════════════════════
 *
 * PRODUCE THE REFERENCE SET (read-only, enforced by Postgres):
 *
 *   ssh root@oslsr-home-app 'docker exec -i \
 *     -e PGOPTIONS="-c default_transaction_read_only=on" \
 *     oslsr-postgres psql -U oslsr_user -d oslsr_db -X -q -t -A' <<'SQL' > referenced-keys.txt
 *   SELECT live_selfie_original_url FROM users WHERE live_selfie_original_url IS NOT NULL
 *   UNION
 *   SELECT live_selfie_id_card_url  FROM users WHERE live_selfie_id_card_url  IS NOT NULL;
 *   SQL
 *
 * ⚠️ Those are the ONLY two columns that can hold such a key. Verified 2026-09-23 by scanning
 * the whole schema AND every jsonb blob that could plausibly carry one (`audit_logs.details`,
 * `respondents.metadata`, `submissions.raw_data`, `system_settings.value`,
 * `marketplace_profiles.portfolio_url`) — all ZERO. If a new column ever stores one, add it to
 * the query above or this audit will call live objects orphans.
 *
 * Usage:
 *   pnpm --filter @oslsr/api exec tsx scripts/audit-staff-photo-orphans.ts <referenced-keys.txt>
 * ⚠️ `scripts/` is OUTSIDE tsconfig — RUN it; `tsc --noEmit` does not cover this file.
 *
 * FIRST CORRECT RUN, 2026-09-23 (prod-sourced reference set):
 *   TOTAL 1,658 · REFERENCED 32 · ORPHANS 1,626 (58.4 MB) · referenced-but-missing 0
 *   43,268 B x 813  test fixture, original
 *   32,049 B x 811  test fixture, id-card
 *   25,397 B x 1    ⚠️ unattributed
 *   40,281 B x 1    ⚠️ unattributed
 *
 * ⭐ EXACT BYTE LENGTH IS THE DISCRIMINATOR. `auth.activation.test.ts` builds a DETERMINISTIC
 * 800x600 gradient, so every run yields byte-identical output through a fixed pipeline. A real
 * selfie has an essentially unique length; 1,624 objects sharing two exact lengths do not
 * happen by chance.
 *
 * ⚠️ THE TWO ONE-OFFS ARE WHY "DELETE EVERYTHING UNREFERENCED" IS THE WRONG INSTRUCTION. Both
 * are dated 2026-02-06, 4.4 seconds apart, UUIDv7 keys sharing the `019c33a4` prefix: a single
 * genuine activation pair, the earliest in the bucket, whose user was later removed or
 * re-uploaded. Unreferenced is not the same as worthless.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

/**
 * Read the S3 settings from the repo-root `.env` WITHOUT mutating `process.env`.
 *
 * ⛔ `dotenv.parse`, never `dotenv.config()` — §2ae. `config()` injects every variable in the
 * file into the process, and the last time that shortcut was taken it put a DEV `S3_REGION`
 * in front of a test's own value and broke an unrelated suite within the hour. This script
 * needs to KNOW six variables, not INJECT forty.
 *
 * ⚠️ There is exactly one `.env`, at the repo root — `apps/web/vite.config.ts` sets
 * `envDir: '../../'`. An already-exported variable still wins, so CI can override.
 */
function s3Env(): Record<string, string | undefined> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  let parsed: Record<string, string> = {};
  try {
    parsed = dotenv.parse(readFileSync(resolve(root, '.env'), 'utf8'));
  } catch {
    // No .env (CI) — fall through to the real environment.
  }
  const pick = (k: string) => process.env[k] ?? parsed[k];
  return {
    S3_BUCKET_NAME: pick('S3_BUCKET_NAME'),
    S3_ACCESS_KEY: pick('S3_ACCESS_KEY'),
    S3_SECRET_KEY: pick('S3_SECRET_KEY'),
    S3_REGION: pick('S3_REGION'),
    S3_ENDPOINT: pick('S3_ENDPOINT'),
  };
}

const PREFIXES = ['staff-photos/original/', 'staff-photos/id-card/'];

/** Byte lengths produced by the deterministic test fixture. Re-derive if the fixture changes. */
const KNOWN_TEST_SIZES = new Map<number, string>([
  [43268, 'test fixture — original'],
  [32049, 'test fixture — id-card'],
]);

const KEY_SHAPE = /^staff-photos\/(original|id-card)\/[0-9a-f-]+\.jpg$/;

interface Obj {
  key: string;
  size: number;
  mtime: Date;
}

/**
 * Load the reference set from a file, and refuse anything that does not look like one.
 *
 * ⛔ Every guard here exists because the failure it prevents is DESTRUCTIVE. An empty or
 * malformed file would mark all 1,658 objects as orphans — a clean-looking result that is
 * maximally wrong [[pattern-a-clean-result-must-prove-it-measured]].
 */
function loadReferenced(path: string): Set<string> {
  const lines = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    console.error(`⛔ ${path} is EMPTY. An empty reference set marks every object an orphan. Refusing.`);
    process.exit(2);
  }
  const malformed = lines.filter((l) => !KEY_SHAPE.test(l));
  if (malformed.length > 0) {
    console.error(`⛔ ${malformed.length} line(s) in ${path} are not staff-photos keys. Refusing.`);
    malformed.slice(0, 5).forEach((l) => console.error(`   ${l}`));
    console.error('   Did psql emit headers? Use -t -A as the documented command does.');
    process.exit(2);
  }
  return new Set(lines);
}

async function listAll(s3: S3Client, bucket: string): Promise<Obj[]> {
  const out: Obj[] = [];
  for (const Prefix of PREFIXES) {
    let ContinuationToken: string | undefined;
    do {
      const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix, ContinuationToken }));
      for (const o of r.Contents ?? []) {
        out.push({ key: o.Key as string, size: o.Size ?? 0, mtime: new Date(o.LastModified as Date) });
      }
      ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (ContinuationToken);
  }
  return out;
}

async function main(): Promise<void> {
  const refPath = process.argv[2];
  if (!refPath) {
    console.error('⛔ Usage: tsx scripts/audit-staff-photo-orphans.ts <referenced-keys.txt>');
    console.error('   This script will NOT read a database. See the header for how to produce the file');
    console.error('   from PRODUCTION — the first version inferred it locally and called a live photo an orphan.');
    process.exit(2);
  }

  const env = s3Env();
  const bucket = env.S3_BUCKET_NAME;
  const accessKeyId = env.S3_ACCESS_KEY;
  const secretAccessKey = env.S3_SECRET_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    console.error('⛔ S3_BUCKET_NAME / S3_ACCESS_KEY / S3_SECRET_KEY must be set. Nothing read.');
    process.exit(2);
  }

  const referenced = loadReferenced(refPath);
  const s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log(`Bucket:     ${bucket}  (${env.S3_ENDPOINT})`);
  console.log(`References: ${referenced.size} keys from ${refPath}`);

  const all = await listAll(s3, bucket);
  const orphans = all.filter((o) => !referenced.has(o.key));
  const mb = (n: number) => (n / 1048576).toFixed(2);

  console.log(
    `\nTOTAL ${all.length} · REFERENCED ${all.length - orphans.length} · ORPHANS ${orphans.length} (${mb(
      orphans.reduce((a, b) => a + b.size, 0),
    )} MB)`,
  );

  // ⭐ Matters more than the orphan count: a key production points at that is NOT in the
  // bucket is a broken profile photo — live damage, today, with no deletion involved.
  const missing = [...referenced].filter((k) => !all.some((o) => o.key === k));
  if (missing.length > 0) {
    console.log(`\n⛔ REFERENCED BUT MISSING FROM THE BUCKET: ${missing.length} — this is live breakage`);
    missing.forEach((k) => console.log(`   ${k}`));
  } else {
    console.log('✅ Every key production references exists in the bucket (0 broken references).');
  }

  const bySize = new Map<number, Obj[]>();
  for (const o of orphans) bySize.set(o.size, [...(bySize.get(o.size) ?? []), o]);

  let attributable = 0;
  console.log('\nOrphans by exact byte length:');
  for (const [size, objs] of [...bySize.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const label = KNOWN_TEST_SIZES.get(size);
    if (label) attributable += objs.length;
    console.log(
      `   ${String(size).padStart(8)} B x ${String(objs.length).padStart(4)}  ${label ?? '⚠️ UNATTRIBUTED — inspect individually'}`,
    );
  }

  console.log(
    `\nAttributable to the deterministic test fixture: ${attributable} of ${orphans.length}` +
      `  ·  UNATTRIBUTED: ${orphans.length - attributable}`,
  );
  for (const [size, objs] of bySize) {
    if (KNOWN_TEST_SIZES.has(size)) continue;
    for (const o of objs) console.log(`   ⚠️ ${o.mtime.toISOString()}  ${o.size} B  ${o.key}`);
  }

  console.log(
    '\n⛔ This script deletes nothing. An unattributed orphan is NOT rubbish — the pair found on' +
      '\n   2026-02-06 was a genuine activation whose user was later removed. Decide per size class,' +
      '\n   never in bulk, and re-run this immediately before any deletion.',
  );
  process.exit(0);
}

void main();

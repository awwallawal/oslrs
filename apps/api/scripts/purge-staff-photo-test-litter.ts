/**
 * Delete the TEST-FIXTURE objects under `staff-photos/` — and nothing else, ever.
 *
 * ⛔⛔ THIS SCRIPT DELETES FROM PRODUCTION OBJECT STORAGE, IN AN ACCOUNT THAT ALSO HOLDS THE
 *     BACKUPS. It is deliberately separate from `audit-staff-photo-orphans.ts`, which is
 *     read-only and must stay that way: an audit that can delete is one typo from a purge.
 *
 * AUTHORISED by Awwal 2026-09-23, after the audit, with an explicit instruction: delete the
 * attributed test litter, KEEP the unattributed objects.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════
 * THREE CONDITIONS, ALL REQUIRED, ANY ONE OF WHICH SPARES AN OBJECT
 *   1. its exact byte length is one of the deterministic test-fixture sizes;
 *   2. it is NOT in the production reference set you supply;
 *   3. it sits under `staff-photos/original/` or `staff-photos/id-card/`.
 * An object failing ANY condition is left alone. There is no flag to widen this.
 * ════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⭐ WHY SIZE AND NOT "UNREFERENCED". The audit found 1,626 unreferenced objects, of which
 * 1,624 were test litter and **2 were a genuine activation pair from 2026-02-06** — same
 * second, sequential UUIDv7 keys — belonging to a user later removed. Unreferenced is not
 * worthless, and "delete everything unreferenced" would have destroyed real history.
 *
 * ⚠️ AND THE REFERENCE SET IS NOT OPTIONAL BELT-AND-BRACES. The first version of the AUDIT
 * inferred references from whatever `DATABASE_URL` pointed at, which on a laptop is the DEV
 * database — and it duly listed a live staff member's ID card as an orphan. Condition 2
 * exists so that a mistake in condition 1 still cannot delete something production is using.
 *
 * Usage:
 *   # 1. produce the reference set from PRODUCTION (see audit-staff-photo-orphans.ts header)
 *   # 2. dry run — prints the plan, deletes nothing:
 *   pnpm --filter @oslsr/api exec tsx scripts/purge-staff-photo-test-litter.ts <referenced-keys.txt>
 *   # 3. execute:
 *   pnpm --filter @oslsr/api exec tsx scripts/purge-staff-photo-test-litter.ts <referenced-keys.txt> --apply --confirm-delete-from-production
 *
 * ⚠️ `scripts/` is OUTSIDE tsconfig — RUN it; `tsc --noEmit` does not cover this file.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const PREFIXES = ['staff-photos/original/', 'staff-photos/id-card/'];

/**
 * The ONLY byte lengths this script may delete. Measured 2026-09-23 against the live bucket:
 * 43,268 B x 813 and 32,049 B x 811. They are exact because `generateTestImageBase64()` in
 * `auth.activation.test.ts` builds a deterministic 800x600 gradient, so every run produced
 * byte-identical output.
 *
 * ⛔ If the fixture ever changes, these become stale and the script simply deletes less. That
 * is the correct failure direction and it must stay that way — never widen this to a range.
 */
const DELETABLE_SIZES = new Set([43268, 32049]);
const KEY_SHAPE = /^staff-photos\/(original|id-card)\/[0-9a-f-]+\.jpg$/;

function s3Env(): Record<string, string | undefined> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  let parsed: Record<string, string> = {};
  try {
    parsed = dotenv.parse(readFileSync(resolve(root, '.env'), 'utf8'));
  } catch {
    /* CI: use the real environment */
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

function loadReferenced(path: string): Set<string> {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) {
    console.error(`⛔ ${path} is EMPTY. Refusing — an empty reference set removes the only cross-check.`);
    process.exit(2);
  }
  const malformed = lines.filter((l) => !KEY_SHAPE.test(l));
  if (malformed.length > 0) {
    console.error(`⛔ ${malformed.length} line(s) in ${path} are not staff-photos keys. Refusing.`);
    process.exit(2);
  }
  return new Set(lines);
}

async function main(): Promise<void> {
  const refPath = process.argv[2];
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes('--confirm-delete-from-production');

  if (!refPath || refPath.startsWith('--')) {
    console.error('⛔ Usage: tsx scripts/purge-staff-photo-test-litter.ts <referenced-keys.txt> [--apply --confirm-delete-from-production]');
    process.exit(2);
  }
  if (apply && !confirmed) {
    console.error('⛔ --apply requires --confirm-delete-from-production. Refusing.');
    process.exit(2);
  }

  const env = s3Env();
  if (!env.S3_BUCKET_NAME || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
    console.error('⛔ S3 credentials/bucket missing. Nothing read, nothing deleted.');
    process.exit(2);
  }

  const referenced = loadReferenced(refPath);
  const s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  });

  const all: { key: string; size: number }[] = [];
  for (const Prefix of PREFIXES) {
    let ContinuationToken: string | undefined;
    do {
      const r = await s3.send(new ListObjectsV2Command({ Bucket: env.S3_BUCKET_NAME, Prefix, ContinuationToken }));
      for (const o of r.Contents ?? []) all.push({ key: o.Key as string, size: o.Size ?? 0 });
      ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (ContinuationToken);
  }

  const doomed = all.filter((o) => DELETABLE_SIZES.has(o.size) && !referenced.has(o.key) && KEY_SHAPE.test(o.key));
  const spared = all.length - doomed.length;

  console.log(`Bucket:     ${env.S3_BUCKET_NAME} (${env.S3_ENDPOINT})`);
  console.log(`References: ${referenced.size} keys (production)`);
  console.log(`\nTOTAL ${all.length} · TO DELETE ${doomed.length} (${(doomed.reduce((a, b) => a + b.size, 0) / 1048576).toFixed(2)} MB) · SPARED ${spared}`);

  // ⛔ The assertion that makes this safe to run twice: nothing production references may
  // ever appear in the deletion plan. If it does, something upstream is wrong — stop.
  const violation = doomed.filter((o) => referenced.has(o.key));
  if (violation.length > 0) {
    console.error(`⛔ ABORT — ${violation.length} referenced key(s) entered the deletion plan.`);
    process.exit(3);
  }
  console.log('✅ Cross-check: 0 production-referenced keys in the plan.');

  if (!apply) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --apply --confirm-delete-from-production.');
    process.exit(0);
  }

  let deleted = 0;
  for (let i = 0; i < doomed.length; i += 1000) {
    const batch = doomed.slice(i, i + 1000);
    const r = await s3.send(new DeleteObjectsCommand({
      Bucket: env.S3_BUCKET_NAME,
      Delete: { Objects: batch.map((o) => ({ Key: o.key })), Quiet: true },
    }));
    deleted += batch.length - (r.Errors?.length ?? 0);
    for (const e of r.Errors ?? []) console.error(`   ⚠️ ${e.Key}: ${e.Message}`);
  }
  console.log(`\n✅ Deleted ${deleted} of ${doomed.length}. Re-run the AUDIT to confirm the new state.`);
  process.exit(0);
}

void main();

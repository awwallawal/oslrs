#!/usr/bin/env tsx
/**
 * Restore Backup Script
 *
 * Downloads a backup from S3-compatible storage and restores it to PostgreSQL.
 *
 * Usage:
 *   pnpm tsx apps/api/scripts/restore-backup.ts --date 2026-02-24
 *   pnpm tsx apps/api/scripts/restore-backup.ts --monthly 2026-02
 *   pnpm tsx apps/api/scripts/restore-backup.ts --latest
 *   pnpm tsx apps/api/scripts/restore-backup.ts --list
 *   pnpm tsx apps/api/scripts/restore-backup.ts --date 2026-02-24 --dry-run
 *   pnpm tsx apps/api/scripts/restore-backup.ts --date 2026-02-24 --target-db postgresql://...
 *   pnpm tsx apps/api/scripts/restore-backup.ts --date 2026-02-24 --confirm  (required for production)
 *
 * Created in Story 6-3 (Automated Off-site Backup Orchestration).
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, createReadStream, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import {
  getEncryptionKey,
  createDecryptDecipher,
  type EncryptionMeta,
} from '../src/lib/backup-crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ============================================================================
// S3 Client
// ============================================================================

function createS3Client(): S3Client {
  const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
  const config: S3ClientConfig = { region };
  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
    config.forcePathStyle = true;
  }
  if (process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
    config.credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    };
  }
  return new S3Client(config);
}

function getBucketName(): string {
  return process.env.S3_BUCKET_NAME || 'oslsr-media';
}

// ============================================================================
// Argument Parsing
// ============================================================================

interface RestoreArgs {
  mode: 'date' | 'monthly' | 'latest' | 'list';
  dateValue?: string;
  targetDb?: string;
  dryRun: boolean;
  confirm: boolean;
}

function parseArgs(): RestoreArgs {
  const args = process.argv.slice(2);
  const result: RestoreArgs = {
    mode: 'latest',
    dryRun: false,
    confirm: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--date':
        result.mode = 'date';
        result.dateValue = args[++i];
        break;
      case '--monthly':
        result.mode = 'monthly';
        result.dateValue = args[++i];
        break;
      case '--latest':
        result.mode = 'latest';
        break;
      case '--list':
        result.mode = 'list';
        break;
      case '--target-db':
        result.targetDb = args[++i];
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--confirm':
        result.confirm = true;
        break;
    }
  }

  return result;
}

// ============================================================================
// List Backups
// ============================================================================

interface BackupEntry {
  key: string;
  size: number;
  lastModified: Date;
  tier: 'daily' | 'monthly';
}

async function listBackups(s3: S3Client, bucket: string): Promise<BackupEntry[]> {
  const entries: BackupEntry[] = [];

  for (const prefix of ['backups/daily/', 'backups/monthly/']) {
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    }));

    if (result.Contents) {
      for (const obj of result.Contents) {
        if (!obj.Key) continue;
        // Story 9-9 AC#5: accept both encrypted (.sql.gz.enc) and legacy (.sql.gz) keys.
        if (!obj.Key.endsWith('.sql.gz') && !obj.Key.endsWith('.sql.gz.enc')) continue;
        entries.push({
          key: obj.Key,
          size: obj.Size || 0,
          lastModified: obj.LastModified || new Date(),
          tier: prefix.includes('monthly') ? 'monthly' : 'daily',
        });
      }
    }
  }

  entries.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  return entries;
}

async function printBackupList(s3: S3Client, bucket: string): Promise<void> {
  const entries = await listBackups(s3, bucket);

  if (entries.length === 0) {
    console.log('No backups found in S3.');
    return;
  }

  console.log('\nAvailable Backups:');
  console.log('─'.repeat(80));
  console.log(`${'Tier'.padEnd(10)}${'Date'.padEnd(14)}${'Size'.padEnd(12)}${'Key'}`);
  console.log('─'.repeat(80));

  for (const entry of entries) {
    const sizeMB = (entry.size / (1024 * 1024)).toFixed(2) + ' MB';
    const date = entry.lastModified.toISOString().split('T')[0];
    console.log(`${entry.tier.padEnd(10)}${date.padEnd(14)}${sizeMB.padEnd(12)}${entry.key}`);
  }

  console.log('─'.repeat(80));
  console.log(`Total: ${entries.length} backups`);
}

// ============================================================================
// Download and Restore
// ============================================================================

async function downloadFromS3(s3: S3Client, bucket: string, key: string, outputPath: string): Promise<void> {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

  if (!result.Body) {
    throw new Error(`Empty response for key: ${key}`);
  }

  const chunks: Uint8Array[] = [];
  const stream = result.Body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  writeFileSync(outputPath, buffer);
  console.log(`Downloaded ${key} (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`);
}

interface ManifestData {
  filename: string;
  s3Key?: string;
  checksumSha256: string;
  sizeBytes: number;
  tableCounts: Record<string, number>;
  /** Story 9-9 AC#5: present when this backup was encrypted with AES-256-GCM. */
  encryption?: EncryptionMeta;
}

async function downloadManifest(s3: S3Client, bucket: string, manifestKey: string): Promise<ManifestData | null> {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: manifestKey }));
    if (!result.Body) return null;

    const chunks: Uint8Array[] = [];
    const stream = result.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    console.warn(`Manifest not found: ${manifestKey}`);
    return null;
  }
}

function resolveS3Key(args: RestoreArgs, entries: BackupEntry[]): string {
  switch (args.mode) {
    case 'date': {
      // Story 9-9 AC#5: prefer the encrypted variant (.sql.gz.enc) if it exists in the
      // listing; fall back to legacy unencrypted (.sql.gz). The manifest is the canonical
      // source for the actual key + encryption state, but this resolver runs before the
      // manifest is downloaded — so we pick from the listing.
      if (!args.dateValue) throw new Error('--date requires a value (YYYY-MM-DD)');
      const encKey = `backups/daily/${args.dateValue}-app_db.sql.gz.enc`;
      const plainKey = `backups/daily/${args.dateValue}-app_db.sql.gz`;
      if (entries.some((e) => e.key === encKey)) return encKey;
      return plainKey;
    }

    case 'monthly': {
      if (!args.dateValue) throw new Error('--monthly requires a value (YYYY-MM)');
      const encKey = `backups/monthly/${args.dateValue}-app_db.sql.gz.enc`;
      const plainKey = `backups/monthly/${args.dateValue}-app_db.sql.gz`;
      if (entries.some((e) => e.key === encKey)) return encKey;
      return plainKey;
    }

    case 'latest':
      if (entries.length === 0) throw new Error('No backups found');
      return entries[0].key;

    default:
      throw new Error(`Unsupported mode: ${args.mode}`);
  }
}

function resolveManifestKey(s3Key: string): string {
  if (s3Key.includes('/monthly/')) {
    const match = s3Key.match(/(\d{4}-\d{2})/);
    return `backups/manifests/monthly/${match?.[1]}-manifest.json`;
  }
  const match = s3Key.match(/(\d{4}-\d{2}-\d{2})/);
  return `backups/manifests/${match?.[1]}-manifest.json`;
}

function isProductionDb(dbUrl: string): boolean {
  const url = new URL(dbUrl);
  return !['localhost', '127.0.0.1', '0.0.0.0', 'host.docker.internal'].includes(url.hostname);
}

async function getTableCountsFromDb(dbUrl: string): Promise<Record<string, number>> {
  const url = new URL(dbUrl);
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
  const host = url.hostname;
  const port = url.port || '5432';
  const username = decodeURIComponent(url.username);
  const database = url.pathname.slice(1);

  const tables = ['users', 'respondents', 'audit_logs', 'submissions'];
  const counts: Record<string, number> = {};

  for (const table of tables) {
    try {
      const result = execSync(
        `psql -h ${host} -p ${port} -U ${username} -d ${database} -t -c "SELECT COUNT(*) FROM ${table}"`,
        { env, encoding: 'utf-8', timeout: 30000 },
      ).trim();
      counts[table] = parseInt(result, 10) || 0;
    } catch {
      counts[table] = -1; // Could not count
    }
  }

  return counts;
}

async function restore(args: RestoreArgs): Promise<void> {
  const s3 = createS3Client();
  const bucket = getBucketName();
  const targetDb = args.targetDb || process.env.DATABASE_URL;

  if (!targetDb) {
    throw new Error('No target database specified. Use --target-db or set DATABASE_URL.');
  }

  // Safety guard: require --confirm for production databases
  if (isProductionDb(targetDb) && !args.confirm) {
    console.error('ERROR: Target database appears to be a production server.');
    console.error(`  Host: ${new URL(targetDb).hostname}`);
    console.error('  Add --confirm flag to proceed with production restore.');
    process.exit(1);
  }

  // Resolve which backup to download
  const entries = await listBackups(s3, bucket);
  const s3Key = resolveS3Key(args, entries);
  const manifestKey = resolveManifestKey(s3Key);

  console.log(`\nRestore target: ${new URL(targetDb).hostname}:${new URL(targetDb).port || 5432}/${new URL(targetDb).pathname.slice(1)}`);
  console.log(`Backup source:  ${s3Key}`);

  if (args.dryRun) {
    console.log('\n[DRY RUN] Validating backup existence...');
    const manifest = await downloadManifest(s3, bucket, manifestKey);
    if (manifest) {
      console.log(`  Manifest found: ${manifest.filename}`);
      console.log(`  Size: ${(manifest.sizeBytes / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`  Checksum: ${manifest.checksumSha256}`);
      console.log('  Table counts:', manifest.tableCounts);
    } else {
      console.log('  No manifest found (backup may still exist)');
    }
    console.log('\n[DRY RUN] No restore performed.');
    return;
  }

  // Download backup and manifest. Encrypted backups (.sql.gz.enc) are saved with their
  // ciphertext suffix, decrypted to a sibling .sql.gz, then gunzipped to .sql.
  const isEncryptedKey = s3Key.endsWith('.sql.gz.enc');
  const tmpDownload = path.join(tmpdir(), `restore-${Date.now()}${isEncryptedKey ? '.sql.gz.enc' : '.sql.gz'}`);
  const tmpGzip = isEncryptedKey ? tmpDownload.replace(/\.enc$/, '') : tmpDownload;
  const tmpSql = tmpGzip.replace(/\.gz$/, '');

  try {
    await downloadFromS3(s3, bucket, s3Key, tmpDownload);
    const manifest = await downloadManifest(s3, bucket, manifestKey);

    // Verify checksum if manifest available. The manifest's checksumSha256 hashes the
    // S3-uploaded payload — ciphertext when encrypted, plaintext gzip otherwise — so we
    // hash the downloaded file BEFORE any decryption.
    if (manifest) {
      const fileBuffer = await import('node:fs').then(fs => fs.readFileSync(tmpDownload));
      const checksum = createHash('sha256').update(fileBuffer).digest('hex');
      if (checksum !== manifest.checksumSha256) {
        throw new Error(`Checksum mismatch! Expected ${manifest.checksumSha256}, got ${checksum}`);
      }
      console.log('Checksum verified.');
    }

    // Story 9-9 AC#5: decrypt if the backup is encrypted. Manifest is preferred for the
    // encryption metadata; if the key looks encrypted but the manifest is missing, fail loudly
    // — we cannot decrypt without IV + auth tag, and silently restoring the wrong file (or
    // mid-decryption garbage) would be worse than aborting.
    if (isEncryptedKey) {
      if (!manifest?.encryption) {
        throw new Error(
          `Cannot decrypt ${s3Key}: manifest missing or has no encryption metadata. ` +
            `If this backup predates AC#5, the .sql.gz.enc suffix is a misnomer — ` +
            `restore the legacy .sql.gz key instead.`,
        );
      }
      console.log(`Decrypting (${manifest.encryption.algorithm})...`);
      const key = getEncryptionKey();
      const decipher = createDecryptDecipher(key, manifest.encryption);
      await pipeline(
        createReadStream(tmpDownload),
        decipher,
        createWriteStream(tmpGzip),
      );
      // Drop ciphertext immediately — only the plaintext gzip is needed from here on
      if (tmpDownload !== tmpGzip && existsSync(tmpDownload)) unlinkSync(tmpDownload);
      console.log('Decryption verified (GCM auth tag passed).');
    }

    // Decompress
    console.log('Decompressing...');
    execSync(`gunzip -f ${tmpGzip}`, { timeout: 120000 });

    if (!existsSync(tmpSql)) {
      throw new Error('Decompression failed: output file not found');
    }

    // Restore
    const url = new URL(targetDb);
    const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
    const host = url.hostname;
    const port = url.port || '5432';
    const username = decodeURIComponent(url.username);
    const database = url.pathname.slice(1);

    console.log(`Restoring to ${host}:${port}/${database}...`);
    execSync(
      `psql -h ${host} -p ${port} -U ${username} -d ${database} < ${tmpSql}`,
      { env, timeout: 600000, maxBuffer: 1024 * 1024 * 50, shell: '/bin/bash' },
    );

    console.log('Restore complete.');

    // Validate: compare table counts
    if (manifest) {
      console.log('\nValidating table counts...');
      const actualCounts = await getTableCountsFromDb(targetDb);

      console.log('─'.repeat(50));
      console.log(`${'Table'.padEnd(20)}${'Manifest'.padEnd(15)}${'Restored'.padEnd(15)}${'Match'}`);
      console.log('─'.repeat(50));

      let allMatch = true;
      for (const [table, expected] of Object.entries(manifest.tableCounts)) {
        // Map camelCase manifest keys to snake_case SQL table names
        const sqlTableNames: Record<string, string> = { auditLogs: 'audit_logs' };
        const dbTable = sqlTableNames[table] ?? table;
        const actual = actualCounts[dbTable] ?? -1;
        const match = actual === expected ? 'YES' : 'NO';
        if (actual !== expected) allMatch = false;
        console.log(`${dbTable.padEnd(20)}${String(expected).padEnd(15)}${String(actual).padEnd(15)}${match}`);
      }
      console.log('─'.repeat(50));
      console.log(allMatch ? 'All table counts match.' : 'WARNING: Some table counts do not match!');
    }
  } finally {
    // Cleanup temp files (download + intermediate gzip + final sql)
    if (existsSync(tmpDownload)) unlinkSync(tmpDownload);
    if (tmpGzip !== tmpDownload && existsSync(tmpGzip)) unlinkSync(tmpGzip);
    if (existsSync(tmpSql)) unlinkSync(tmpSql);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('OSLRS Backup Restore Tool');
  console.log('========================');

  if (args.mode === 'list') {
    const s3 = createS3Client();
    const bucket = getBucketName();
    await printBackupList(s3, bucket);
    return;
  }

  await restore(args);
}

// Only run when executed directly (not imported in tests)
const isDirectRun = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((err) => {
    console.error('Restore failed:', err.message);
    process.exit(1);
  });
}

export { parseArgs, listBackups, resolveS3Key, resolveManifestKey, isProductionDb };

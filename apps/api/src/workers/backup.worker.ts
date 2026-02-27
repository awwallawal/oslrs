/**
 * Database Backup Worker
 *
 * BullMQ worker that executes daily PostgreSQL backups:
 * 1. pg_dump + gzip to temp file
 * 2. SHA-256 checksum computation
 * 3. Upload to S3-compatible storage (DigitalOcean Spaces)
 * 4. Manifest generation with table counts
 * 5. Retention management (7-day daily, 7-year monthly)
 * 6. Email notification to Super Admins
 *
 * Created in Story 6-3 (Automated Off-site Backup Orchestration).
 * Follows productivity-snapshot.worker.ts pattern.
 */

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, statSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  CopyObjectCommand,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import pino from 'pino';
import { db } from '../db/index.js';
import { users, respondents, auditLogs, submissions } from '../db/schema/index.js';
import { roles } from '../db/schema/index.js';
import { sql, eq, and } from 'drizzle-orm';
import { queueBackupNotificationEmail } from '../queues/email.queue.js';

const logger = pino({ name: 'backup-worker' });

const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

// ============================================================================
// Backup Manifest Interface
// ============================================================================

export interface BackupManifest {
  filename: string;
  s3Key: string;
  sizeBytes: number;
  checksumSha256: string;
  durationMs: number;
  timestamp: string;
  databaseUrl: string; // Redacted (host only)
  tableCounts: {
    users: number;
    respondents: number;
    auditLogs: number;
    submissions: number;
  };
  retentionTier: 'daily' | 'monthly';
}

// ============================================================================
// S3 Client Helper
// ============================================================================

function createS3Client(): S3Client {
  const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
  const config: S3ClientConfig = { region };
  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
    config.forcePathStyle = true; // Required for DO Spaces
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
// Shell Helpers
// ============================================================================

/** Escape a value for safe inclusion in a shell command (POSIX single-quote escaping) */
function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

// ============================================================================
// pg_dump Execution
// ============================================================================

export function executePgDump(databaseUrl: string, outputPath: string): void {
  const url = new URL(databaseUrl);
  const host = url.hostname;
  const port = url.port || '5432';
  const username = decodeURIComponent(url.username);
  const database = url.pathname.slice(1);
  const password = decodeURIComponent(url.password);

  const env = {
    ...process.env,
    PGPASSWORD: password,
  };

  const cmd = `pg_dump -h ${shellEscape(host)} -p ${shellEscape(port)} -U ${shellEscape(username)} -d ${shellEscape(database)} --no-owner --no-acl | gzip > ${shellEscape(outputPath)}`;

  execSync(cmd, {
    env,
    timeout: 300000, // 5 minute timeout
    maxBuffer: 1024 * 1024 * 10, // 10MB stderr buffer
    shell: '/bin/bash',
  });
}

// ============================================================================
// Table Count Collection
// ============================================================================

export async function getTableCounts(): Promise<BackupManifest['tableCounts']> {
  const [userCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  const [respondentCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(respondents);
  const [auditLogCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(auditLogs);
  const [submissionCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(submissions);

  return {
    users: Number(userCount.count),
    respondents: Number(respondentCount.count),
    auditLogs: Number(auditLogCount.count),
    submissions: Number(submissionCount.count),
  };
}

// ============================================================================
// File Helpers
// ============================================================================

/** Compute SHA-256 checksum of a file using streaming (avoids loading full file into memory) */
async function computeFileChecksum(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

// ============================================================================
// S3 Pagination Helper
// ============================================================================

/** List all S3 objects with the given prefix, handling pagination */
async function listAllObjects(s3: S3Client, bucket: string, prefix: string): Promise<{ Key?: string }[]> {
  const allContents: { Key?: string }[] = [];
  let continuationToken: string | undefined;
  do {
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    if (result.Contents) allContents.push(...result.Contents);
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return allContents;
}

// ============================================================================
// Super Admin Email Query
// ============================================================================

async function getActiveSuperAdminEmails(): Promise<string[]> {
  try {
    const result = await db
      .select({ email: users.email })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(roles.name, 'super_admin'), eq(users.status, 'active')));
    return result.map((r) => r.email);
  } catch (err) {
    logger.error({ event: 'backup.query_admins_failed', error: (err as Error).message });
    return [];
  }
}

// ============================================================================
// Email Notification Helpers
// ============================================================================

function buildBackupSuccessHtml(manifest: BackupManifest): string {
  const sizeMB = (manifest.sizeBytes / (1024 * 1024)).toFixed(2);
  const durationSec = (manifest.durationMs / 1000).toFixed(1);
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #9C1E23; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0;">OSLRS Daily Backup Completed</h2>
  </div>
  <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="color: #16a34a; font-weight: bold; font-size: 18px;">&#x2705; Backup Successful</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Filename</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${manifest.filename}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Size</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${sizeMB} MB</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Checksum (SHA-256)</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 12px;">${manifest.checksumSha256}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Duration</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${durationSec}s</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Timestamp</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${manifest.timestamp}</td></tr>
    </table>
    <h3 style="margin-top: 24px;">Table Counts</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 6px; border-bottom: 1px solid #e5e7eb;">Users</td><td style="padding: 6px; border-bottom: 1px solid #e5e7eb;">${manifest.tableCounts.users.toLocaleString()}</td></tr>
      <tr><td style="padding: 6px; border-bottom: 1px solid #e5e7eb;">Respondents</td><td style="padding: 6px; border-bottom: 1px solid #e5e7eb;">${manifest.tableCounts.respondents.toLocaleString()}</td></tr>
      <tr><td style="padding: 6px; border-bottom: 1px solid #e5e7eb;">Audit Logs</td><td style="padding: 6px; border-bottom: 1px solid #e5e7eb;">${manifest.tableCounts.auditLogs.toLocaleString()}</td></tr>
      <tr><td style="padding: 6px; border-bottom: 1px solid #e5e7eb;">Submissions</td><td style="padding: 6px; border-bottom: 1px solid #e5e7eb;">${manifest.tableCounts.submissions.toLocaleString()}</td></tr>
    </table>
    <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">S3 Key: ${manifest.s3Key}</p>
  </div>
</div>`;
}

function buildBackupSuccessText(manifest: BackupManifest): string {
  const sizeMB = (manifest.sizeBytes / (1024 * 1024)).toFixed(2);
  const durationSec = (manifest.durationMs / 1000).toFixed(1);
  return `OSLRS Daily Backup Completed Successfully

Filename: ${manifest.filename}
Size: ${sizeMB} MB
Checksum (SHA-256): ${manifest.checksumSha256}
Duration: ${durationSec}s
Timestamp: ${manifest.timestamp}

Table Counts:
- Users: ${manifest.tableCounts.users}
- Respondents: ${manifest.tableCounts.respondents}
- Audit Logs: ${manifest.tableCounts.auditLogs}
- Submissions: ${manifest.tableCounts.submissions}

S3 Key: ${manifest.s3Key}`;
}

function buildBackupFailureHtml(error: string, retryCount: number): string {
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #9C1E23; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0;">OSLRS Daily Backup FAILED</h2>
  </div>
  <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="color: #dc2626; font-weight: bold; font-size: 18px;">&#x274C; Backup Failed</p>
    <p><strong>Error:</strong> ${error}</p>
    <p><strong>Retry Attempts:</strong> ${retryCount}/3</p>
    <p><strong>Time:</strong> ${new Date().toISOString()}</p>
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 16px; margin-top: 16px;">
      <p style="margin: 0; color: #991b1b; font-weight: bold;">Action Required</p>
      <p style="margin: 8px 0 0; color: #991b1b;">All retry attempts have been exhausted. Please investigate the backup infrastructure immediately. Check: PostgreSQL connectivity, S3 bucket access, disk space for temp files.</p>
    </div>
  </div>
</div>`;
}

function buildBackupFailureText(error: string, retryCount: number): string {
  return `OSLRS Daily Backup FAILED

CRITICAL: All backup retry attempts exhausted.

Error: ${error}
Retry Attempts: ${retryCount}/3
Time: ${new Date().toISOString()}

ACTION REQUIRED:
Please investigate the backup infrastructure immediately.
Check: PostgreSQL connectivity, S3 bucket access, disk space for temp files.`;
}

async function sendBackupSuccessEmail(manifest: BackupManifest): Promise<void> {
  const emails = await getActiveSuperAdminEmails();
  if (emails.length === 0) {
    logger.warn({ event: 'backup.no_super_admins', message: 'No active Super Admins to notify' });
    return;
  }

  for (const email of emails) {
    try {
      await queueBackupNotificationEmail({
        to: email,
        subject: '[OSLRS] Daily Backup Completed Successfully',
        html: buildBackupSuccessHtml(manifest),
        text: buildBackupSuccessText(manifest),
      });
    } catch (err) {
      logger.error({ event: 'backup.email_queue_failed', email, error: (err as Error).message });
    }
  }
}

async function sendBackupFailureEmail(error: string, retryCount: number): Promise<void> {
  const emails = await getActiveSuperAdminEmails();
  if (emails.length === 0) {
    logger.warn({ event: 'backup.no_super_admins', message: 'No active Super Admins to notify' });
    return;
  }

  for (const email of emails) {
    try {
      await queueBackupNotificationEmail({
        to: email,
        subject: '[OSLRS] CRITICAL: Daily Backup Failed',
        html: buildBackupFailureHtml(error, retryCount),
        text: buildBackupFailureText(error, retryCount),
      });
    } catch (err) {
      logger.error({ event: 'backup.failure_email_queue_failed', email, error: (err as Error).message });
    }
  }
}

// ============================================================================
// Retention Management
// ============================================================================

export async function cleanupOldDailies(s3: S3Client, bucket: string): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);

  let deleted = 0;

  const objects = await listAllObjects(s3, bucket, 'backups/daily/');

  if (objects.length === 0) return 0;

  for (const obj of objects) {
    if (!obj.Key) continue;
    // Parse date from filename: backups/daily/YYYY-MM-DD-app_db.sql.gz
    const match = obj.Key.match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) continue;

    const fileDate = new Date(match[1]);
    if (fileDate < cutoffDate) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
      logger.info({ event: 'backup.daily_cleanup', key: obj.Key });
      deleted++;

      // Also delete corresponding manifest
      const manifestKey = `backups/manifests/${match[1]}-manifest.json`;
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: manifestKey }));
      } catch {
        // Manifest may not exist, ignore
      }
    }
  }

  return deleted;
}

export async function promoteToMonthly(s3: S3Client, bucket: string, dateStr: string): Promise<boolean> {
  const day = parseInt(dateStr.split('-')[2], 10);
  if (day !== 1) return false;

  const monthStr = dateStr.substring(0, 7); // YYYY-MM
  const dailyKey = `backups/daily/${dateStr}-app_db.sql.gz`;
  const monthlyKey = `backups/monthly/${monthStr}-app_db.sql.gz`;

  await s3.send(new CopyObjectCommand({
    Bucket: bucket,
    CopySource: `${bucket}/${dailyKey}`,
    Key: monthlyKey,
  }));

  // Also copy manifest
  const dailyManifestKey = `backups/manifests/${dateStr}-manifest.json`;
  const monthlyManifestKey = `backups/manifests/monthly/${monthStr}-manifest.json`;
  try {
    await s3.send(new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${dailyManifestKey}`,
      Key: monthlyManifestKey,
    }));
  } catch {
    // Manifest copy failure is non-fatal
    logger.warn({ event: 'backup.monthly_manifest_copy_failed', monthStr });
  }

  logger.info({ event: 'backup.monthly_promoted', monthlyKey });
  return true;
}

export async function cleanupOldMonthlies(s3: S3Client, bucket: string): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 84); // 7 years

  let deleted = 0;

  const objects = await listAllObjects(s3, bucket, 'backups/monthly/');

  if (objects.length === 0) return 0;

  for (const obj of objects) {
    if (!obj.Key) continue;
    // Parse month from key: backups/monthly/YYYY-MM-app_db.sql.gz
    const match = obj.Key.match(/(\d{4}-\d{2})/);
    if (!match) continue;

    const fileDate = new Date(`${match[1]}-01`);
    if (fileDate < cutoffDate) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
      logger.info({ event: 'backup.monthly_cleanup', key: obj.Key });
      deleted++;

      // Also delete corresponding manifest
      const monthlyManifestKey = `backups/manifests/monthly/${match[1]}-manifest.json`;
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: monthlyManifestKey }));
      } catch {
        // Ignore if not found
      }
    }
  }

  return deleted;
}

// ============================================================================
// Backup Job Processor
// ============================================================================

export async function processBackup(_job: Job): Promise<BackupManifest> {
  const startTime = Date.now();
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filename = `${dateStr}-app_db.sql.gz`;
  const tmpPath = path.join(tmpdir(), filename);
  const s3Key = `backups/daily/${filename}`;
  const bucket = getBucketName();
  const s3 = createS3Client();

  logger.info({ event: 'backup.start', date: dateStr, filename });

  try {
    // Step 1: Execute pg_dump
    logger.info({ event: 'backup.pg_dump.start' });
    executePgDump(databaseUrl, tmpPath);
    logger.info({ event: 'backup.pg_dump.complete' });

    // Step 2: Compute SHA-256 checksum via streaming (avoids loading full file into memory)
    const checksumSha256 = await computeFileChecksum(tmpPath);
    const sizeBytes = statSync(tmpPath).size;
    logger.info({ event: 'backup.checksum.computed', sizeBytes, checksumSha256: checksumSha256.substring(0, 16) + '...' });

    // Step 3: Upload to S3
    logger.info({ event: 'backup.s3_upload.start', key: s3Key });
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: createReadStream(tmpPath),
      ContentLength: sizeBytes,
      ContentType: 'application/gzip',
      Metadata: {
        'checksum-sha256': checksumSha256,
        'backup-date': dateStr,
      },
    }));

    // Step 4: Verify upload
    const headResult = await s3.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    }));

    if (headResult.ContentLength !== sizeBytes) {
      throw new Error(`Upload verification failed: expected ${sizeBytes} bytes, got ${headResult.ContentLength}`);
    }
    logger.info({ event: 'backup.s3_upload.verified', s3Key });

    // Step 5: Collect table counts
    const tableCounts = await getTableCounts();
    logger.info({ event: 'backup.table_counts', ...tableCounts });

    // Step 6: Build and upload manifest
    const durationMs = Date.now() - startTime;
    const redactedUrl = new URL(databaseUrl);
    const manifest: BackupManifest = {
      filename,
      s3Key,
      sizeBytes,
      checksumSha256,
      durationMs,
      timestamp: new Date().toISOString(),
      databaseUrl: redactedUrl.hostname,
      tableCounts,
      retentionTier: 'daily',
    };

    const manifestKey = `backups/manifests/${dateStr}-manifest.json`;
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: manifestKey,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
    }));
    logger.info({ event: 'backup.manifest.uploaded', manifestKey });

    // Step 7: Retention management
    const deletedDailies = await cleanupOldDailies(s3, bucket);
    const promoted = await promoteToMonthly(s3, bucket, dateStr);
    const deletedMonthlies = await cleanupOldMonthlies(s3, bucket);
    logger.info({ event: 'backup.retention', deletedDailies, promoted, deletedMonthlies });

    // Step 8: Send success notification
    await sendBackupSuccessEmail(manifest);

    logger.info({ event: 'backup.complete', durationMs, sizeBytes, filename });

    return manifest;
  } finally {
    // Always clean temp file
    if (existsSync(tmpPath)) {
      unlinkSync(tmpPath);
    }
  }
}

// ============================================================================
// Worker Instance
// ============================================================================

let backupWorker: Worker | null = null;

if (!isTestMode()) {
  const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  backupWorker = new Worker(
    'database-backup',
    processBackup,
    {
      connection,
      concurrency: 1,
      settings: {
        backoffStrategy: (attemptsMade: number) => {
          // AC5: Exponential backoff — 1min, 5min, 15min
          const delays = [60000, 300000, 900000];
          return delays[Math.min(attemptsMade, delays.length - 1)];
        },
      },
    },
  );

  backupWorker.on('completed', (job) => {
    logger.info({ event: 'backup.job_completed', jobId: job.id });
  });

  backupWorker.on('failed', async (job, error) => {
    logger.error({ event: 'backup.job_failed', jobId: job?.id, error: error.message, attempt: job?.attemptsMade });

    // AC5: Send critical failure alert after all retries exhausted
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      await sendBackupFailureEmail(error.message, job.attemptsMade);
    }
  });
}

export { backupWorker };

export async function closeBackupWorker(): Promise<void> {
  if (backupWorker) {
    await backupWorker.close();
  }
}

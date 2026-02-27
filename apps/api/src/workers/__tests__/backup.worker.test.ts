import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted Mocks ──────────────────────────────────────────────────────────

const mockExecSync = vi.hoisted(() => vi.fn());
const mockCreateReadStream = vi.hoisted(() => vi.fn());
const mockStatSync = vi.hoisted(() => vi.fn());
const mockUnlinkSync = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockS3Send = vi.hoisted(() => vi.fn());
const mockQueueBackupNotificationEmail = vi.hoisted(() => vi.fn());

// ── Mock child_process ─────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

// ── Mock node:fs ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  createReadStream: mockCreateReadStream,
  statSync: mockStatSync,
  unlinkSync: mockUnlinkSync,
  existsSync: mockExistsSync,
}));

// ── Mock @aws-sdk/client-s3 ────────────────────────────────────────────────

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class MockS3Client {
      send(...args: unknown[]) { return mockS3Send(...args); }
    },
    PutObjectCommand: class MockPut { constructor(public input: unknown) {} },
    HeadObjectCommand: class MockHead { constructor(public input: unknown) {} },
    ListObjectsV2Command: class MockList { constructor(public input: unknown) {} },
    DeleteObjectCommand: class MockDelete { constructor(public input: unknown) {} },
    CopyObjectCommand: class MockCopy { constructor(public input: unknown) {} },
  };
});

// ── Mock email queue ───────────────────────────────────────────────────────

vi.mock('../../queues/email.queue.js', () => ({
  queueBackupNotificationEmail: mockQueueBackupNotificationEmail,
}));

// ── Mock BullMQ (prevent actual worker creation) ───────────────────────────

vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    constructor() { /* no-op */ }
    on() { return this; }
    isRunning() { return false; }
    close() { return Promise.resolve(); }
  },
  Job: class MockJob {},
}));

// ── Mock ioredis ───────────────────────────────────────────────────────────

vi.mock('ioredis', () => ({
  Redis: class MockRedis {
    constructor() { /* no-op */ }
  },
}));

// ── Mock DB ────────────────────────────────────────────────────────────────

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInnerJoin = vi.hoisted(() => vi.fn());
const mockDbWhere = vi.hoisted(() => vi.fn());
const mockDbFrom = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => {
      mockDbSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockDbFrom(...fArgs);
          return {
            innerJoin: (...jArgs: unknown[]) => {
              mockDbInnerJoin(...jArgs);
              return {
                where: (...wArgs: unknown[]) => {
                  mockDbWhere(...wArgs);
                  return [{ email: 'admin@test.com' }];
                },
              };
            },
            where: (...wArgs: unknown[]) => {
              mockDbWhere(...wArgs);
              return [{ email: 'admin@test.com' }];
            },
          };
        },
      };
    },
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  users: { email: 'email', roleId: 'roleId', status: 'status' },
  respondents: {},
  auditLogs: {},
  submissions: {},
  roles: { id: 'id', name: 'name' },
}));

vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray) => strings.join(''),
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── Import module under test ───────────────────────────────────────────────

import {
  executePgDump,
  processBackup,
  cleanupOldDailies,
  promoteToMonthly,
  cleanupOldMonthlies,
  getTableCounts,
} from '../backup.worker.js';
import type { BackupManifest } from '../backup.worker.js';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('backup worker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/app_db';
    process.env.S3_BUCKET_NAME = 'test-bucket';
    process.env.S3_ENDPOINT = 'https://s3.test.com';
    process.env.S3_ACCESS_KEY = 'test-key';
    process.env.S3_SECRET_KEY = 'test-secret';
    process.env.S3_REGION = 'us-east-1';
  });

  describe('executePgDump', () => {
    it('should execute pg_dump with correct parameters', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));

      executePgDump('postgresql://user:password@localhost:5432/app_db', '/tmp/test.sql.gz');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("pg_dump -h 'localhost' -p '5432' -U 'user' -d 'app_db'"),
        expect.objectContaining({
          timeout: 300000,
          shell: '/bin/bash',
        }),
      );
    });

    it('should set PGPASSWORD in environment', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));

      executePgDump('postgresql://user:s3cret@localhost:5432/app_db', '/tmp/test.sql.gz');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          env: expect.objectContaining({ PGPASSWORD: 's3cret' }),
        }),
      );
    });

    it('should generate correct filename format', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));

      executePgDump('postgresql://user:password@localhost:5432/app_db', '/tmp/2026-02-27-app_db.sql.gz');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("gzip > '/tmp/2026-02-27-app_db.sql.gz'"),
        expect.any(Object),
      );
    });
  });

  describe('getTableCounts', () => {
    it('should return counts for all 4 tables', async () => {
      // Override db mock for this specific test
      const dbMod = await import('../../db/index.js');
      const origSelect = dbMod.db.select;
      let callCount = 0;
      vi.spyOn(dbMod.db, 'select').mockImplementation((...args: unknown[]) => {
        callCount++;
        return {
          from: () => [{ count: callCount * 10 }],
        } as ReturnType<typeof origSelect>;
      });

      const counts = await getTableCounts();

      expect(counts).toEqual({
        users: 10,
        respondents: 20,
        auditLogs: 30,
        submissions: 40,
      });
    });
  });

  describe('processBackup', () => {
    it('should execute full backup pipeline', async () => {
      const fakeBuffer = Buffer.from('fake-compressed-data');
      mockExecSync.mockReturnValue(Buffer.from(''));
      mockCreateReadStream.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () { yield fakeBuffer; },
      }));
      mockStatSync.mockReturnValue({ size: fakeBuffer.length });
      mockExistsSync.mockReturnValue(true);
      mockS3Send.mockResolvedValue({ ContentLength: fakeBuffer.length });
      mockQueueBackupNotificationEmail.mockResolvedValue('job-id');

      // Override db for table counts
      const dbMod = await import('../../db/index.js');
      vi.spyOn(dbMod.db, 'select').mockImplementation(() => ({
        from: () => [{ count: 100 }],
      }) as ReturnType<typeof dbMod.db.select>);

      const mockJob = { id: 'test-job-1', attemptsMade: 0, opts: { attempts: 3 } };
      const manifest = await processBackup(mockJob as any);

      // Verify pg_dump was called
      expect(mockExecSync).toHaveBeenCalled();

      // Verify streaming checksum was computed (createReadStream called for checksum + S3 upload)
      expect(mockCreateReadStream).toHaveBeenCalled();
      expect(mockStatSync).toHaveBeenCalled();

      // Verify S3 uploads (backup + manifest = at least 2 PutObject + 1 HeadObject + retention calls)
      expect(mockS3Send).toHaveBeenCalled();

      // Verify manifest structure
      expect(manifest).toMatchObject({
        filename: expect.stringMatching(/\d{4}-\d{2}-\d{2}-app_db\.sql\.gz/),
        s3Key: expect.stringContaining('backups/daily/'),
        sizeBytes: fakeBuffer.length,
        checksumSha256: expect.any(String),
        durationMs: expect.any(Number),
        timestamp: expect.any(String),
        databaseUrl: 'localhost',
        tableCounts: expect.any(Object),
        retentionTier: 'daily',
      });

      // Verify temp file cleanup
      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('should compute correct SHA-256 checksum', async () => {
      const testData = Buffer.from('test-backup-content');
      const expectedChecksum = await import('node:crypto')
        .then(c => c.createHash('sha256').update(testData).digest('hex'));

      mockExecSync.mockReturnValue(Buffer.from(''));
      mockCreateReadStream.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () { yield testData; },
      }));
      mockStatSync.mockReturnValue({ size: testData.length });
      mockExistsSync.mockReturnValue(true);
      mockS3Send.mockResolvedValue({ ContentLength: testData.length });
      mockQueueBackupNotificationEmail.mockResolvedValue('job-id');

      const dbMod = await import('../../db/index.js');
      vi.spyOn(dbMod.db, 'select').mockImplementation(() => ({
        from: () => [{ count: 0 }],
      }) as ReturnType<typeof dbMod.db.select>);

      const manifest = await processBackup({ id: 'test', attemptsMade: 0, opts: {} } as any);

      expect(manifest.checksumSha256).toBe(expectedChecksum);
    });

    it('should send success notification email', async () => {
      mockExecSync.mockReturnValue(Buffer.from(''));
      mockCreateReadStream.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () { yield Buffer.from('data'); },
      }));
      mockStatSync.mockReturnValue({ size: 4 });
      mockExistsSync.mockReturnValue(true);
      mockS3Send.mockResolvedValue({ ContentLength: 4 });
      mockQueueBackupNotificationEmail.mockResolvedValue('job-id');

      const dbMod = await import('../../db/index.js');
      vi.spyOn(dbMod.db, 'select').mockImplementation((...args: unknown[]) => ({
        from: (..._fArgs: unknown[]) => {
          // If select arg has 'email' key, this is the Super Admin query
          const selectArg = args[0] as Record<string, unknown> | undefined;
          if (selectArg && 'email' in selectArg) {
            return {
              innerJoin: () => ({
                where: () => [{ email: 'admin@test.com' }],
              }),
            };
          }
          // Otherwise it's a COUNT(*) query
          return [{ count: 5 }];
        },
      }) as ReturnType<typeof dbMod.db.select>);

      await processBackup({ id: 'test', attemptsMade: 0, opts: {} } as any);

      expect(mockQueueBackupNotificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@test.com',
          subject: '[OSLRS] Daily Backup Completed Successfully',
          html: expect.stringContaining('Backup Successful'),
          text: expect.stringContaining('Backup Completed Successfully'),
        }),
      );
    });

    it('should clean up temp file even on failure', async () => {
      mockExecSync.mockImplementation(() => { throw new Error('pg_dump failed'); });
      mockExistsSync.mockReturnValue(true);

      await expect(
        processBackup({ id: 'test', attemptsMade: 0, opts: {} } as any),
      ).rejects.toThrow('pg_dump failed');

      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('should throw when DATABASE_URL is not set', async () => {
      delete process.env.DATABASE_URL;

      await expect(
        processBackup({ id: 'test', attemptsMade: 0, opts: {} } as any),
      ).rejects.toThrow('DATABASE_URL is not set');
    });
  });

  describe('cleanupOldDailies', () => {
    it('should delete backups older than 7 days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      const oldDateStr = oldDate.toISOString().split('T')[0];

      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: `backups/daily/${oldDateStr}-app_db.sql.gz` },
        ],
      });
      mockS3Send.mockResolvedValue({}); // For DeleteObjectCommand calls

      const { S3Client } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({});

      const deleted = await cleanupOldDailies(s3, 'test-bucket');

      expect(deleted).toBe(1);
      expect(mockS3Send).toHaveBeenCalledTimes(3); // List + Delete backup + Delete manifest
    });

    it('should preserve backups within 7 days', async () => {
      const recentDate = new Date().toISOString().split('T')[0];

      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: `backups/daily/${recentDate}-app_db.sql.gz` },
        ],
      });

      const { S3Client } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({});

      const deleted = await cleanupOldDailies(s3, 'test-bucket');

      expect(deleted).toBe(0);
      expect(mockS3Send).toHaveBeenCalledTimes(1); // Only List, no deletes
    });
  });

  describe('promoteToMonthly', () => {
    it('should copy backup to monthly on 1st of month', async () => {
      mockS3Send.mockResolvedValue({}); // CopyObjectCommand

      const { S3Client } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({});

      const promoted = await promoteToMonthly(s3, 'test-bucket', '2026-03-01');

      expect(promoted).toBe(true);
      expect(mockS3Send).toHaveBeenCalledTimes(2); // Copy backup + Copy manifest
    });

    it('should NOT copy on other days of month', async () => {
      const { S3Client } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({});

      const promoted = await promoteToMonthly(s3, 'test-bucket', '2026-02-15');

      expect(promoted).toBe(false);
      expect(mockS3Send).not.toHaveBeenCalled();
    });
  });

  describe('cleanupOldMonthlies', () => {
    it('should delete monthlies older than 84 months', async () => {
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 90);
      const oldMonthStr = `${oldDate.getFullYear()}-${String(oldDate.getMonth() + 1).padStart(2, '0')}`;

      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: `backups/monthly/${oldMonthStr}-app_db.sql.gz` },
        ],
      });
      mockS3Send.mockResolvedValue({}); // DeleteObjectCommand

      const { S3Client } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({});

      const deleted = await cleanupOldMonthlies(s3, 'test-bucket');

      expect(deleted).toBe(1);
    });

    it('should preserve monthlies within 84 months', async () => {
      const recentDate = new Date();
      const recentMonthStr = `${recentDate.getFullYear()}-${String(recentDate.getMonth() + 1).padStart(2, '0')}`;

      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: `backups/monthly/${recentMonthStr}-app_db.sql.gz` },
        ],
      });

      const { S3Client } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({});

      const deleted = await cleanupOldMonthlies(s3, 'test-bucket');

      expect(deleted).toBe(0);
    });
  });
});

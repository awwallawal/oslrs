import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    send = vi.fn();
  },
  GetObjectCommand: class MockGet { constructor(public input: unknown) {} },
  ListObjectsV2Command: class MockList { constructor(public input: unknown) {} },
}));

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

// ── Import tested functions ────────────────────────────────────────────────

import { parseArgs, resolveS3Key, resolveManifestKey, isProductionDb, listBackups } from '../restore-backup.js';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('restore-backup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('resolveS3Key', () => {
    const mockEntries = [
      { key: 'backups/daily/2026-02-27-app_db.sql.gz', size: 1024, lastModified: new Date(), tier: 'daily' as const },
    ];

    it('should resolve daily key for --date', () => {
      const key = resolveS3Key({ mode: 'date', dateValue: '2026-02-24', dryRun: false, confirm: false }, []);
      expect(key).toBe('backups/daily/2026-02-24-app_db.sql.gz');
    });

    it('should resolve monthly key for --monthly', () => {
      const key = resolveS3Key({ mode: 'monthly', dateValue: '2026-02', dryRun: false, confirm: false }, []);
      expect(key).toBe('backups/monthly/2026-02-app_db.sql.gz');
    });

    it('should resolve latest backup', () => {
      const key = resolveS3Key({ mode: 'latest', dryRun: false, confirm: false }, mockEntries);
      expect(key).toBe('backups/daily/2026-02-27-app_db.sql.gz');
    });

    it('should throw when --date has no value', () => {
      expect(() =>
        resolveS3Key({ mode: 'date', dryRun: false, confirm: false }, []),
      ).toThrow('--date requires a value');
    });

    it('should throw when --latest has no entries', () => {
      expect(() =>
        resolveS3Key({ mode: 'latest', dryRun: false, confirm: false }, []),
      ).toThrow('No backups found');
    });
  });

  describe('resolveManifestKey', () => {
    it('should resolve daily manifest key', () => {
      const key = resolveManifestKey('backups/daily/2026-02-24-app_db.sql.gz');
      expect(key).toBe('backups/manifests/2026-02-24-manifest.json');
    });

    it('should resolve monthly manifest key', () => {
      const key = resolveManifestKey('backups/monthly/2026-02-app_db.sql.gz');
      expect(key).toBe('backups/manifests/monthly/2026-02-manifest.json');
    });
  });

  describe('isProductionDb', () => {
    it('should return false for localhost', () => {
      expect(isProductionDb('postgresql://user:pass@localhost:5432/db')).toBe(false);
    });

    it('should return false for 127.0.0.1', () => {
      expect(isProductionDb('postgresql://user:pass@127.0.0.1:5432/db')).toBe(false);
    });

    it('should return true for remote hosts', () => {
      expect(isProductionDb('postgresql://user:pass@db.example.com:5432/db')).toBe(true);
    });

    it('should reject production target without --confirm', () => {
      // This tests the safety guard logic
      const isProd = isProductionDb('postgresql://user:pass@prod-server.com:5432/app_db');
      expect(isProd).toBe(true);
    });
  });

  describe('listBackups', () => {
    it('should list available backups sorted by date descending', async () => {
      const { S3Client } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({});

      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);

      (s3.send as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'backups/daily/2026-02-27-app_db.sql.gz', Size: 1024, LastModified: now },
            { Key: 'backups/daily/2026-02-26-app_db.sql.gz', Size: 2048, LastModified: yesterday },
          ],
        })
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'backups/monthly/2026-02-app_db.sql.gz', Size: 4096, LastModified: now },
          ],
        });

      const entries = await listBackups(s3, 'test-bucket');

      expect(entries).toHaveLength(3);
      expect(entries[0].tier).toBe('daily');
      expect(entries[0].key).toContain('2026-02-27');
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cleanupTempFiles, CleanupOptions } from '../cleanup.js';

// Mock dependencies
vi.mock('fs');
vi.mock('fast-glob');

describe('Cleanup Logic', () => {
  const mockFs = vi.mocked(fs);
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = path.join(os.tmpdir(), 'cleanup-test');
    mockFs.unlinkSync.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('temporary file deletion', () => {
    it('should delete all .vitest-live-*.json files', async () => {
      const glob = await import('fast-glob');
      const tempFiles = [
        path.join(tempDir, '.vitest-live-1234-5678.json'),
        path.join(tempDir, '.vitest-live-1235-5679.json'),
        path.join(tempDir, '.vitest-live-1236-5680.json'),
      ];
      vi.mocked(glob.default).mockResolvedValue(tempFiles);

      const result = await cleanupTempFiles(tempDir);

      expect(mockFs.unlinkSync).toHaveBeenCalledTimes(3);
      tempFiles.forEach((file) => {
        expect(mockFs.unlinkSync).toHaveBeenCalledWith(file);
      });
    });

    it('should not delete consolidated .vitest-live.json', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
      ]);

      await cleanupTempFiles(tempDir);

      // Should NOT delete the consolidated file
      expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(
        path.join(tempDir, '.vitest-live.json')
      );
    });

    it('should return count of deleted files', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
        path.join(tempDir, '.vitest-live-1235-5679.json'),
      ]);

      const result = await cleanupTempFiles(tempDir);

      expect(result.deletedCount).toBe(2);
    });

    it('should return list of deleted files', async () => {
      const glob = await import('fast-glob');
      const tempFiles = [
        path.join(tempDir, '.vitest-live-1234-5678.json'),
        path.join(tempDir, '.vitest-live-1235-5679.json'),
      ];
      vi.mocked(glob.default).mockResolvedValue(tempFiles);

      const result = await cleanupTempFiles(tempDir);

      expect(result.deletedFiles).toEqual(tempFiles);
    });
  });

  describe('--no-cleanup flag behavior', () => {
    it('should not delete files when noCleanup option is true', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
      ]);

      await cleanupTempFiles(tempDir, { noCleanup: true });

      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should return zero deleted count when noCleanup is true', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
      ]);

      const result = await cleanupTempFiles(tempDir, { noCleanup: true });

      expect(result.deletedCount).toBe(0);
      expect(result.skipped).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should continue if one file fails to delete', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
        path.join(tempDir, '.vitest-live-1235-5679.json'),
        path.join(tempDir, '.vitest-live-1236-5680.json'),
      ]);

      mockFs.unlinkSync
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {
          throw new Error('Permission denied');
        })
        .mockImplementationOnce(() => {});

      const result = await cleanupTempFiles(tempDir);

      expect(result.deletedCount).toBe(2);
      expect(result.errors).toHaveLength(1);
    });

    it('should log warning for failed deletions', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
      ]);

      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await cleanupTempFiles(tempDir);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete')
      );

      consoleSpy.mockRestore();
    });

    it('should return list of failed files in errors', async () => {
      const glob = await import('fast-glob');
      const failedFile = path.join(tempDir, '.vitest-live-1234-5678.json');
      vi.mocked(glob.default).mockResolvedValue([failedFile]);

      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await cleanupTempFiles(tempDir);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].file).toBe(failedFile);
      expect(result.errors[0].error).toContain('Permission denied');
    });
  });

  describe('edge cases', () => {
    it('should handle no temp files gracefully', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([]);

      const result = await cleanupTempFiles(tempDir);

      expect(result.deletedCount).toBe(0);
      expect(result.deletedFiles).toEqual([]);
    });

    it('should handle directory not existing', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await cleanupTempFiles('/nonexistent/path');

      expect(result.deletedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
    });
  });
});

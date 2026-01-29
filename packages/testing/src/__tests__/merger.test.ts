import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { mergeTestResults, MergedResults, TestResult } from '../merger.js';

// Mock fs and fast-glob
vi.mock('fs');
vi.mock('fast-glob');

describe('Result Merger', () => {
  const mockFs = vi.mocked(fs);
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = path.join(os.tmpdir(), 'merger-test');
    mockFs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('file discovery', () => {
    it('should find all .vitest-live-*.json files', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
        path.join(tempDir, '.vitest-live-1235-5679.json'),
      ]);
      mockFs.readFileSync.mockReturnValue(JSON.stringify([]));

      const result = await mergeTestResults(tempDir);

      expect(glob.default).toHaveBeenCalledWith(
        '.vitest-live-*.json',
        expect.objectContaining({ cwd: tempDir, absolute: true })
      );
    });

    it('should return empty results when no files found', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([]);

      const result = await mergeTestResults(tempDir);

      expect(result.tests).toHaveLength(0);
      expect(result.fileCount).toBe(0);
    });
  });

  describe('merging results', () => {
    it('should merge results from multiple files', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
        path.join(tempDir, '.vitest-live-1235-5679.json'),
      ]);

      const file1Data: TestResult[] = [
        { name: 'test-1', status: 'passed', duration: 100, category: 'GoldenPath', timestamp: '2026-01-16T10:00:00Z', tags: ['GoldenPath'], blocking: true },
      ];
      const file2Data: TestResult[] = [
        { name: 'test-2', status: 'failed', duration: 200, category: 'Security', timestamp: '2026-01-16T10:01:00Z', tags: ['Security'], blocking: true },
      ];

      mockFs.readFileSync
        .mockReturnValueOnce(JSON.stringify(file1Data))
        .mockReturnValueOnce(JSON.stringify(file2Data));

      const result = await mergeTestResults(tempDir);

      expect(result.tests).toHaveLength(2);
      expect(result.tests.map(t => t.name)).toContain('test-1');
      expect(result.tests.map(t => t.name)).toContain('test-2');
    });

    it('should handle duplicate test IDs by keeping latest', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
        path.join(tempDir, '.vitest-live-1235-5679.json'),
      ]);

      const file1Data: TestResult[] = [
        { name: 'test-1', status: 'failed', duration: 100, category: 'GoldenPath', timestamp: '2026-01-16T10:00:00Z', tags: ['GoldenPath'], blocking: true },
      ];
      const file2Data: TestResult[] = [
        { name: 'test-1', status: 'passed', duration: 150, category: 'GoldenPath', timestamp: '2026-01-16T10:01:00Z', tags: ['GoldenPath'], blocking: true },
      ];

      mockFs.readFileSync
        .mockReturnValueOnce(JSON.stringify(file1Data))
        .mockReturnValueOnce(JSON.stringify(file2Data));

      const result = await mergeTestResults(tempDir);

      expect(result.tests).toHaveLength(1);
      expect(result.tests[0].status).toBe('passed'); // Latest wins
      expect(result.tests[0].duration).toBe(150);
    });

    it('should use timestamp for deduplication ordering', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1235-5679.json'), // Loaded second but has earlier timestamp
        path.join(tempDir, '.vitest-live-1234-5678.json'), // Loaded first but has later timestamp
      ]);

      const earlierData: TestResult[] = [
        { name: 'test-1', status: 'failed', duration: 100, category: 'GoldenPath', timestamp: '2026-01-16T10:00:00Z', tags: ['GoldenPath'], blocking: true },
      ];
      const laterData: TestResult[] = [
        { name: 'test-1', status: 'passed', duration: 150, category: 'GoldenPath', timestamp: '2026-01-16T10:01:00Z', tags: ['GoldenPath'], blocking: true },
      ];

      mockFs.readFileSync
        .mockReturnValueOnce(JSON.stringify(earlierData))
        .mockReturnValueOnce(JSON.stringify(laterData));

      const result = await mergeTestResults(tempDir);

      expect(result.tests[0].status).toBe('passed'); // Later timestamp wins
    });
  });

  describe('malformed file handling', () => {
    it('should skip malformed JSON files gracefully', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
        path.join(tempDir, '.vitest-live-1235-5679.json'),
      ]);

      mockFs.readFileSync
        .mockReturnValueOnce('{ invalid json }')
        .mockReturnValueOnce(JSON.stringify([
          { name: 'test-2', status: 'passed', duration: 100, category: 'GoldenPath', timestamp: '2026-01-16T10:00:00Z', tags: ['GoldenPath'], blocking: true },
        ]));

      const result = await mergeTestResults(tempDir);

      expect(result.tests).toHaveLength(1);
      expect(result.tests[0].name).toBe('test-2');
    });

    it('should log warning for malformed files', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
      ]);

      mockFs.readFileSync.mockReturnValueOnce('{ invalid json }');

      await mergeTestResults(tempDir);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse')
      );

      consoleSpy.mockRestore();
    });

    it('should skip empty files gracefully', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
        path.join(tempDir, '.vitest-live-1235-5679.json'),
      ]);

      mockFs.readFileSync
        .mockReturnValueOnce('')
        .mockReturnValueOnce(JSON.stringify([
          { name: 'test-2', status: 'passed', duration: 100, category: 'GoldenPath', timestamp: '2026-01-16T10:00:00Z', tags: ['GoldenPath'], blocking: true },
        ]));

      const result = await mergeTestResults(tempDir);

      expect(result.tests).toHaveLength(1);
    });

    it('should handle non-array JSON gracefully', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
      ]);

      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify({ notAnArray: true }));

      const result = await mergeTestResults(tempDir);

      expect(result.tests).toHaveLength(0);
    });
  });

  describe('metadata', () => {
    it('should include file count in results', async () => {
      const glob = await import('fast-glob');
      const customFiles = [
        path.join(tempDir, '.vitest-live-1234-5678.json'),
        path.join(tempDir, '.vitest-live-1235-5679.json'),
        path.join(tempDir, '.vitest-live-1236-5680.json'),
      ];
      // Mock returns custom files for first call, empty for vitest-report.json
      vi.mocked(glob.default).mockImplementation((pattern: string) => {
        if (pattern === '.vitest-live-*.json') return Promise.resolve(customFiles);
        return Promise.resolve([]); // No vitest-report.json files
      });

      mockFs.readFileSync.mockReturnValue(JSON.stringify([]));

      const result = await mergeTestResults(tempDir);

      expect(result.fileCount).toBe(3);
    });

    it('should include list of source files', async () => {
      const glob = await import('fast-glob');
      const files = [
        path.join(tempDir, '.vitest-live-1234-5678.json'),
        path.join(tempDir, '.vitest-live-1235-5679.json'),
      ];
      // Mock returns custom files for first call, empty for vitest-report.json
      vi.mocked(glob.default).mockImplementation((pattern: string) => {
        if (pattern === '.vitest-live-*.json') return Promise.resolve(files);
        return Promise.resolve([]); // No vitest-report.json files
      });

      mockFs.readFileSync.mockReturnValue(JSON.stringify([]));

      const result = await mergeTestResults(tempDir);

      expect(result.sourceFiles).toEqual(files);
    });

    it('should include merge timestamp', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([]);

      const before = new Date().toISOString();
      const result = await mergeTestResults(tempDir);
      const after = new Date().toISOString();

      expect(new Date(result.mergedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
      expect(new Date(result.mergedAt).getTime()).toBeLessThanOrEqual(new Date(after).getTime());
    });
  });

  describe('consolidated output', () => {
    it('should save merged results to .vitest-live.json', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([
        path.join(tempDir, '.vitest-live-1234-5678.json'),
      ]);

      mockFs.readFileSync.mockReturnValue(JSON.stringify([
        { name: 'test-1', status: 'passed', duration: 100, category: 'GoldenPath', timestamp: '2026-01-16T10:00:00Z', tags: ['GoldenPath'], blocking: true },
      ]));

      await mergeTestResults(tempDir, { saveConsolidated: true });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(tempDir, '.vitest-live.json'),
        expect.any(String)
      );
    });

    it('should not save consolidated by default', async () => {
      const glob = await import('fast-glob');
      vi.mocked(glob.default).mockResolvedValue([]);

      await mergeTestResults(tempDir);

      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });
});

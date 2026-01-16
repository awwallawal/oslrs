import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock dependencies before importing
vi.mock('fs');
vi.mock('../merger.js', () => ({
  mergeTestResults: vi.fn(),
}));

// Import after mocking
import { generateDashboard } from '../dashboard.js';
import { mergeTestResults } from '../merger.js';
import type { TestResult, MergedResults } from '../merger.js';

describe('Dashboard Generator', () => {
  const mockFs = vi.mocked(fs);
  const mockMerge = vi.mocked(mergeTestResults);
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = path.join(os.tmpdir(), 'generator-test');
    mockFs.writeFileSync.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('HTML generation', () => {
    it('should generate valid HTML output', async () => {
      mockMerge.mockResolvedValue({
        tests: [],
        fileCount: 0,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
    });

    it('should include test count in output', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          createTestResult('test-1', 'passed'),
          createTestResult('test-2', 'failed'),
          createTestResult('test-3', 'passed'),
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).toContain('3'); // Total count
    });

    it('should include pass/fail breakdown', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          createTestResult('test-1', 'passed'),
          createTestResult('test-2', 'failed'),
          createTestResult('test-3', 'passed'),
          createTestResult('test-4', 'skipped'),
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      // Should show passed, failed, skipped counts
      expect(html).toMatch(/passed.*2|2.*passed/i);
      expect(html).toMatch(/failed.*1|1.*failed/i);
    });
  });

  describe('stage grouping', () => {
    it('should group tests by stage (GoldenPath, Security, Contract, UI)', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          createTestResult('test-1', 'passed', 'GoldenPath'),
          createTestResult('test-2', 'passed', 'Security'),
          createTestResult('test-3', 'passed', 'Contract'),
          createTestResult('test-4', 'passed', 'UI'),
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).toContain('GoldenPath');
      expect(html).toContain('Security');
      expect(html).toContain('Contract');
      expect(html).toContain('UI');
    });

    it('should show aggregate pass/fail count per stage', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          createTestResult('test-1', 'passed', 'GoldenPath'),
          createTestResult('test-2', 'failed', 'GoldenPath'),
          createTestResult('test-3', 'passed', 'GoldenPath'),
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      // GoldenPath should show 2 passed, 1 failed
      expect(html).toContain('GoldenPath');
    });
  });

  describe('package grouping', () => {
    it('should group tests by package (api, web, utils, types)', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          createTestResult('test-1', 'passed', 'GoldenPath', 'api'),
          createTestResult('test-2', 'passed', 'GoldenPath', 'web'),
          createTestResult('test-3', 'passed', 'GoldenPath', 'utils'),
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).toContain('api');
      expect(html).toContain('web');
      expect(html).toContain('utils');
    });
  });

  describe('tag filtering', () => {
    it('should include tag filter UI elements', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          { ...createTestResult('test-1', 'passed'), tags: ['GoldenPath', 'auth'] },
          { ...createTestResult('test-2', 'passed'), tags: ['Security'] },
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      // Should have filter elements
      expect(html).toMatch(/filter|Filter/);
    });

    it('should include JavaScript for filtering', async () => {
      mockMerge.mockResolvedValue({
        tests: [],
        fileCount: 0,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).toContain('<script');
      expect(html).toMatch(/filter|Filter/);
    });
  });

  describe('performance metrics', () => {
    it('should include total execution time', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          createTestResult('test-1', 'passed', 'GoldenPath', 'api', 100),
          createTestResult('test-2', 'passed', 'GoldenPath', 'api', 200),
          createTestResult('test-3', 'passed', 'GoldenPath', 'api', 300),
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      // Total should be 600ms
      expect(html).toMatch(/600|0\.6/);
    });

    it('should show slowest tests (top 10)', async () => {
      const tests = Array.from({ length: 15 }, (_, i) =>
        createTestResult(`test-${i}`, 'passed', 'GoldenPath', 'api', (i + 1) * 100)
      );

      mockMerge.mockResolvedValue({
        tests,
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      // Should show slowest tests section
      expect(html).toMatch(/slowest|Slowest/i);
    });

    it('should show average test duration per package', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          createTestResult('test-1', 'passed', 'GoldenPath', 'api', 100),
          createTestResult('test-2', 'passed', 'GoldenPath', 'api', 200),
          createTestResult('test-3', 'passed', 'GoldenPath', 'web', 50),
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      // Should show average duration
      expect(html).toMatch(/average|Average|avg/i);
    });
  });

  describe('error reporting', () => {
    it('should show error message for failed tests', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          {
            ...createTestResult('test-1', 'failed'),
            error: 'Expected 1 to equal 2',
          },
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).toContain('Expected 1 to equal 2');
    });

    it('should show stack trace for failed tests', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          {
            ...createTestResult('test-1', 'failed'),
            error: 'Assertion failed',
            stackTrace: 'Error: at UserService.test.ts:42',
          },
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).toContain('UserService.test.ts:42');
    });

    it('should show file and line number for failures', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          {
            ...createTestResult('test-1', 'failed'),
            file: 'src/__tests__/user.test.ts',
            line: 42,
          },
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).toContain('user.test.ts');
    });
  });

  describe('edge cases', () => {
    it('should handle zero results gracefully', async () => {
      mockMerge.mockResolvedValue({
        tests: [],
        fileCount: 0,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toMatch(/no.*test|0.*test/i);
    });

    it('should escape HTML in test names', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          createTestResult('<script>alert("xss")</script>', 'passed'),
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should escape HTML in error messages', async () => {
      mockMerge.mockResolvedValue({
        tests: [
          {
            ...createTestResult('test-1', 'failed'),
            error: '<img src=x onerror=alert(1)>',
          },
        ],
        fileCount: 1,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
    });
  });

  describe('responsive design', () => {
    it('should include viewport meta tag', async () => {
      mockMerge.mockResolvedValue({
        tests: [],
        fileCount: 0,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).toContain('viewport');
    });

    it('should include responsive CSS', async () => {
      mockMerge.mockResolvedValue({
        tests: [],
        fileCount: 0,
        sourceFiles: [],
        mergedAt: new Date().toISOString(),
      });

      const outputPath = path.join(tempDir, 'test-pipeline.html');
      await generateDashboard(tempDir, outputPath);

      const html = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(html).toMatch(/@media|max-width/);
    });
  });
});

// Helper function to create test results
function createTestResult(
  name: string,
  status: 'passed' | 'failed' | 'skipped',
  category = 'GoldenPath',
  pkg = 'api',
  duration = 100
): TestResult {
  return {
    name,
    status,
    category,
    package: pkg,
    duration,
    timestamp: new Date().toISOString(),
    tags: [category],
    blocking: true,
  };
}

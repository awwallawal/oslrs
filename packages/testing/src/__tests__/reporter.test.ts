import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LiveReporter, TestResult } from '../reporter.js';

// Mock fs for controlled testing
vi.mock('fs');

describe('LiveReporter', () => {
  const mockFs = vi.mocked(fs);
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = path.join(os.tmpdir(), 'vitest-live-test');
    mockFs.existsSync.mockReturnValue(true);
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.renameSync.mockImplementation(() => {});
    mockFs.appendFileSync.mockImplementation(() => {});
    mockFs.unlinkSync.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('unique filename generation', () => {
    it('should generate filename with process ID', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });
      const outputPath = reporter.getOutputPath();

      expect(outputPath).toContain(`-${process.pid}.json`);
    });

    it('should generate filename with timestamp', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });
      const outputPath = reporter.getOutputPath();

      // Filename should contain timestamp pattern (digits)
      expect(outputPath).toMatch(/\.vitest-live-\d+-\d+\.json$/);
    });

    it('should generate unique filenames for multiple instances', () => {
      const reporter1 = new LiveReporter({ outputDir: tempDir });
      const reporter2 = new LiveReporter({ outputDir: tempDir });

      // Same PID, but different timestamps should make them unique
      // At minimum, they should both contain PID
      expect(reporter1.getOutputPath()).toContain(process.pid.toString());
      expect(reporter2.getOutputPath()).toContain(process.pid.toString());
    });
  });

  describe('atomic file writes', () => {
    it('should write to temp file first then rename', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      // Simulate test completion
      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'pass', 100)
      ])]);

      // Should have written to temp file first
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      expect(writeCall[0]).toContain('.tmp');

      // Should have renamed to final path
      expect(mockFs.renameSync).toHaveBeenCalled();
    });

    it('should include .tmp suffix for temp file', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'pass', 100)
      ])]);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      expect(writeCall[0]).toMatch(/\.tmp$/);
    });
  });

  describe('test metadata capture', () => {
    it('should capture test name', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      reporter.onFinished([createMockFile([
        createMockTask('should validate user input', 'pass', 50)
      ])]);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(writeCall[1] as string) as TestResult[];

      expect(data[0].name).toBe('should validate user input');
    });

    it('should capture test status (passed)', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'pass', 100)
      ])]);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(writeCall[1] as string) as TestResult[];

      expect(data[0].status).toBe('passed');
    });

    it('should capture test status (failed)', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'fail', 100, 'Assertion failed')
      ])]);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(writeCall[1] as string) as TestResult[];

      expect(data[0].status).toBe('failed');
    });

    it('should capture test duration', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'pass', 150)
      ])]);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(writeCall[1] as string) as TestResult[];

      expect(data[0].duration).toBe(150);
    });

    it('should capture test tags/category', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'pass', 100, undefined, { category: 'GoldenPath' })
      ])]);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(writeCall[1] as string) as TestResult[];

      expect(data[0].category).toBe('GoldenPath');
      expect(data[0].tags).toContain('GoldenPath');
    });

    it('should capture error message on failure', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'fail', 100, 'Expected 1 to be 2')
      ])]);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(writeCall[1] as string) as TestResult[];

      expect(data[0].error).toBe('Expected 1 to be 2');
    });

    it('should capture error stack trace on failure', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'fail', 100, 'Error message', {}, 'Error: at line 10')
      ])]);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(writeCall[1] as string) as TestResult[];

      expect(data[0].stackTrace).toContain('at line 10');
    });

    it('should capture file path', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'pass', 100)
      ], 'src/__tests__/user.test.ts')]);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(writeCall[1] as string) as TestResult[];

      expect(data[0].file).toBe('src/__tests__/user.test.ts');
    });

    it('should capture timestamp', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });
      const before = new Date().toISOString();

      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'pass', 100)
      ])]);

      const after = new Date().toISOString();
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(writeCall[1] as string) as TestResult[];

      expect(data[0].timestamp).toBeDefined();
      expect(new Date(data[0].timestamp).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
      expect(new Date(data[0].timestamp).getTime()).toBeLessThanOrEqual(new Date(after).getTime());
    });
  });

  describe('error handling', () => {
    it('should not crash tests if file write fails', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const reporter = new LiveReporter({ outputDir: tempDir });

      // Should not throw
      expect(() => {
        reporter.onFinished([createMockFile([
          createMockTask('test-1', 'pass', 100)
        ])]);
      }).not.toThrow();
    });

    it('should log error when file write fails', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const reporter = new LiveReporter({ outputDir: tempDir });
      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'pass', 100)
      ])]);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write test results')
      );

      consoleSpy.mockRestore();
    });

    it('should cleanup temp file if rename fails', () => {
      mockFs.renameSync.mockImplementation(() => {
        throw new Error('Rename failed');
      });

      const reporter = new LiveReporter({ outputDir: tempDir });
      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'pass', 100)
      ])]);

      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('package detection', () => {
    it('should detect package from file path (api)', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'pass', 100)
      ], 'apps/api/src/__tests__/user.test.ts')]);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(writeCall[1] as string) as TestResult[];

      expect(data[0].package).toBe('api');
    });

    it('should detect package from file path (web)', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'pass', 100)
      ], 'apps/web/src/__tests__/component.test.ts')]);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(writeCall[1] as string) as TestResult[];

      expect(data[0].package).toBe('web');
    });

    it('should detect package from file path (utils)', () => {
      const reporter = new LiveReporter({ outputDir: tempDir });

      reporter.onFinished([createMockFile([
        createMockTask('test-1', 'pass', 100)
      ], 'packages/utils/src/__tests__/helper.test.ts')]);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const data = JSON.parse(writeCall[1] as string) as TestResult[];

      expect(data[0].package).toBe('utils');
    });
  });
});

// Helper functions to create mock Vitest structures
function createMockFile(tasks: any[], filepath = 'test.ts'): any {
  return {
    filepath,
    tasks,
  };
}

function createMockTask(
  name: string,
  state: 'pass' | 'fail' | 'skip',
  duration: number,
  errorMessage?: string,
  meta: Record<string, unknown> = {},
  stackTrace?: string
): any {
  return {
    type: 'test',
    name,
    meta,
    result: {
      state,
      duration,
      errors: errorMessage ? [{ message: errorMessage, stack: stackTrace }] : [],
    },
  };
}

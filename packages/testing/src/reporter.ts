import fs from 'fs';
import path from 'path';
import type { Reporter, File, Task } from 'vitest';

export interface TestResult {
  name: string;
  fullName?: string; // Full path including suite hierarchy (e.g., "Suite > Nested > test name")
  category: string;
  status: 'passed' | 'failed' | 'skipped' | 'running';
  duration?: number;
  error?: string;
  stackTrace?: string;
  blocking: boolean;
  timestamp: string;
  tags: string[];
  file?: string;
  line?: number;
  package?: string;
}

export class LiveReporter implements Reporter {
  private results: Map<string, TestResult> = new Map();
  private outputPath: string;
  private currentFilePath: string = '';

  constructor(options: { outputDir?: string } = {}) {
    const baseDir = options.outputDir || process.cwd();
    const timestamp = Date.now();
    const pid = process.pid;
    this.outputPath = path.resolve(baseDir, `.vitest-live-${timestamp}-${pid}.json`);

    // Log initialization (non-critical, don't crash if fails)
    try {
      fs.appendFileSync(
        path.resolve(baseDir, 'reporter-trace.log'),
        `[${new Date().toISOString()}] Initialized PID ${pid} writing to ${this.outputPath}\n`
      );
    } catch {
      // Silently ignore trace log failures
    }
  }

  /**
   * Get the output path for the test results file.
   * Useful for debugging and testing.
   */
  getOutputPath(): string {
    return this.outputPath;
  }

  /**
   * Called when all tests finish (Vitest v2.x)
   */
  onFinished(files?: File[]) {
    this.processFiles(files);
  }

  /**
   * Called when test run ends (Vitest v4.x)
   * This is the v4 equivalent of onFinished
   */
  onTestRunEnd(files?: File[]) {
    this.processFiles(files);
  }

  /**
   * Process test files and save results
   * Handles both Vitest v2 and v4 file structures
   */
  private processFiles(files?: File[] | unknown) {
    // Log to trace file for debugging
    const baseDir = path.dirname(this.outputPath);
    try {
      const fileCount = Array.isArray(files) ? files.length : 0;
      fs.appendFileSync(
        path.resolve(baseDir, 'reporter-trace.log'),
        `[${new Date().toISOString()}] Processing ${fileCount} files, PID ${process.pid}\n`
      );
    } catch {
      // Ignore trace errors
    }

    if (!files || !Array.isArray(files)) {
      return;
    }

    for (const file of files) {
      const fileAny = file as any;

      // Handle both v2 (filepath) and v4 (moduleId) structures
      this.currentFilePath = fileAny.filepath || fileAny.moduleId || fileAny.name || '';

      // Get tasks - v2 uses file.tasks, v4 uses file.task.tasks
      let tasks: any[] | undefined;
      if (Array.isArray(fileAny.tasks)) {
        // Vitest v2 structure
        tasks = fileAny.tasks;
      } else if (Array.isArray(fileAny.task?.tasks)) {
        // Vitest v4 structure: file.task.tasks
        tasks = fileAny.task.tasks;
      } else if (Array.isArray(fileAny.children)) {
        tasks = fileAny.children;
      }

      this.collectTasks(tasks, []);
    }

    // Log collection result
    try {
      fs.appendFileSync(
        path.resolve(baseDir, 'reporter-trace.log'),
        `[${new Date().toISOString()}] Collected ${this.results.size} results, saving to ${this.outputPath}\n`
      );
    } catch {
      // Ignore trace errors
    }

    this.save();
  }

  private collectTasks(tasks: Task[] | undefined, suitePath: string[]) {
    // Handle undefined or non-iterable tasks (v4 compatibility)
    if (!tasks || !Array.isArray(tasks)) {
      return;
    }

    for (const task of tasks) {
      if (task.type === 'test') {
        const meta = (task.meta || {}) as Record<string, unknown>;
        const category = (meta.category as string) || 'unknown';
        const blocking = meta.blocking !== false;
        const tags = this.extractTags(meta, category);
        const pkg = this.detectPackage(this.currentFilePath);

        // Handle both v2 and v4 result structures
        const result = task.result;
        const state = result?.state as string | undefined;
        let status: 'passed' | 'failed' | 'skipped' = 'skipped';
        if (state === 'pass' || state === 'passed') status = 'passed';
        else if (state === 'fail' || state === 'failed') status = 'failed';

        // Build full test path including suite hierarchy to handle same-named tests
        const fullPath = [...suitePath, task.name].join(' > ');
        // Use file:fullPath as unique key to avoid all collisions
        const uniqueKey = `${this.currentFilePath}:${fullPath}`;
        this.results.set(uniqueKey, {
          name: task.name,
          fullName: fullPath,
          category,
          blocking,
          status,
          duration: result?.duration,
          error: result?.errors?.[0]?.message,
          stackTrace: result?.errors?.[0]?.stack,
          timestamp: new Date().toISOString(),
          tags,
          file: this.currentFilePath,
          package: pkg,
        });
      } else if (task.type === 'suite') {
        // Recursively process suite tasks with updated path
        const suiteTasks = (task as any).tasks;
        this.collectTasks(suiteTasks, [...suitePath, task.name]);
      }
    }
  }

  /**
   * Extract tags from test metadata and category.
   */
  private extractTags(meta: Record<string, unknown>, category: string): string[] {
    const tags: string[] = [];

    // Add category as a tag
    if (category && category !== 'unknown') {
      tags.push(category);
    }

    // Add any explicit tags from metadata
    if (Array.isArray(meta.tags)) {
      tags.push(...(meta.tags as string[]));
    }

    // Add blocking/optional tag
    if (meta.blocking === false) {
      tags.push('optional');
    }

    return [...new Set(tags)]; // Deduplicate
  }

  /**
   * Detect package name from file path.
   * Supports apps/api, apps/web, packages/* patterns.
   */
  private detectPackage(filepath: string): string | undefined {
    if (!filepath) return undefined;

    // Normalize path separators
    const normalized = filepath.replace(/\\/g, '/');

    // Match apps/{name}/ pattern
    const appsMatch = normalized.match(/apps\/([^/]+)\//);
    if (appsMatch) {
      return appsMatch[1];
    }

    // Match packages/{name}/ pattern
    const packagesMatch = normalized.match(/packages\/([^/]+)\//);
    if (packagesMatch) {
      return packagesMatch[1];
    }

    return undefined;
  }

  /**
   * Save results using atomic write pattern (temp file + rename).
   * This prevents partial writes if the process crashes.
   */
  private save() {
    const data = Array.from(this.results.values());
    if (data.length === 0) return;

    const tempPath = this.outputPath + '.tmp';

    try {
      // Write to temp file first
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));

      // Atomically rename to final path
      fs.renameSync(tempPath, this.outputPath);
    } catch (err) {
      // Log warning but don't crash tests
      console.warn(`[LiveReporter] Failed to write test results: ${(err as Error).message}`);

      // Clean up temp file if it exists
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
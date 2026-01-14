import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Reporter, Vitest, File, Task } from 'vitest';

export interface TestResult {
  name: string;
  category: string;
  status: 'passed' | 'failed' | 'skipped' | 'running';
  duration?: number;
  error?: string;
  blocking: boolean;
  timestamp: string;
}

export class LiveReporter implements Reporter {
  private results: Map<string, TestResult> = new Map();
  private outputPath: string;

  constructor(options: { outputDir?: string } = {}) {
    const baseDir = options.outputDir || process.cwd();
    const runId = crypto.randomBytes(4).toString('hex');
    const timestamp = Date.now();
    this.outputPath = path.resolve(baseDir, `.vitest-live-${timestamp}-${runId}.json`);
    fs.appendFileSync(path.resolve(baseDir, 'reporter-trace.log'), `[${new Date().toISOString()}] Initialized run ${runId} writing to ${this.outputPath}\n`);
  }

  onFinished(files?: File[]) {
    if (!files) return;

    for (const file of files) {
      this.collectTasks(file.tasks);
    }
    this.save();
  }

  private collectTasks(tasks: Task[]) {
    for (const task of tasks) {
      if (task.type === 'test') {
        const meta = (task.meta || {}) as Record<string, unknown>;
        const category = (meta.category as string) || 'unknown';
        const blocking = meta.blocking !== false;
        
        this.results.set(task.name, {
          name: task.name,
          category,
          blocking,
          status: task.result?.state === 'pass' ? 'passed' : task.result?.state === 'fail' ? 'failed' : 'skipped',
          duration: task.result?.duration,
          error: task.result?.errors?.[0]?.message,
          timestamp: new Date().toISOString(),
        });
      } else if (task.type === 'suite') {
        this.collectTasks(task.tasks);
      }
    }
  }

  private save() {
    const data = Array.from(this.results.values());
    if (data.length > 0) {
      try {
        fs.writeFileSync(this.outputPath, JSON.stringify(data, null, 2));
      } catch (err) {
        // Fallback to local dir if root is not writable
        const fallbackPath = path.resolve(process.cwd(), path.basename(this.outputPath));
        fs.writeFileSync(fallbackPath, JSON.stringify(data, null, 2));
      }
    }
  }
}
import { test as vitestTest, type TestFunction } from 'vitest';
import { performance } from 'perf_hooks';

export type TestCategory = 'GoldenPath' | 'Security' | 'Contract' | 'UI' | 'Performance';

interface TaggedTestOptions {
  category: TestCategory;
  sla?: number; // SLA in seconds
  blocking?: boolean;
}

/**
 * Custom test wrapper that adds metadata and optional SLA enforcement.
 */
export function taggedTest(
  options: TaggedTestOptions,
  name: string,
  fn: TestFunction
) {
  const { category, sla, blocking = true } = options;
  const tagPrefix = `[${category}]${blocking ? ' [BLOCKING]' : ''}`;
  const fullName = `${tagPrefix} ${name}`;

  return vitestTest(fullName, async (context) => {
    const start = performance.now();

    /*
     * ⚠️ There is deliberately NO try/catch here (2026-08-16, first lint of
     * `packages/*`). It used to wrap this whole body in
     * `try { … } catch (error) { throw error; }` — a rethrow that changes
     * nothing except to suggest, to anyone reading, that a failure is being
     * handled. It is not, and it must not be: a thrown assertion IS the test
     * result, and the SLA violation below is raised the same way on purpose.
     * If real handling is ever needed, the catch has to DO something.
     */
    // Attach metadata to the test context for reporters.
    // Type assertion because Vitest's `meta` is extensible at runtime.
    (context.task as any).meta = {
      ...(context.task.meta || {}),
      category,
      sla,
      blocking,
    };

    await fn(context);

    const duration = (performance.now() - start) / 1000;

    if (sla && duration > sla) {
      throw new Error(`SLA Violation: Test took ${duration.toFixed(3)}s (allowed ${sla}s)`);
    }
  });
}

// Helper for Golden Path
export const goldenPath = (name: string, fn: TestFunction, sla?: number) => 
  taggedTest({ category: 'GoldenPath', sla, blocking: true }, name, fn);

// Helper for Security
export const securityTest = (name: string, fn: TestFunction) => 
  taggedTest({ category: 'Security', blocking: true }, name, fn);

// Helper for Contract
export const contractTest = (name: string, fn: TestFunction) => 
  taggedTest({ category: 'Contract', blocking: true }, name, fn);

// Helper for UI
export const uiTest = (name: string, fn: TestFunction) => 
  taggedTest({ category: 'UI', blocking: false }, name, fn);

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
    
    try {
      // Attach metadata to the test context for reporters
      context.task.meta = {
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
    } catch (error) {
      throw error;
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

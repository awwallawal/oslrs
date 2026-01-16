import fs from 'fs';
import path from 'path';
import glob from 'fast-glob';

export interface TestResult {
  name: string;
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

export interface MergedResults {
  tests: TestResult[];
  fileCount: number;
  sourceFiles: string[];
  mergedAt: string;
}

export interface MergeOptions {
  saveConsolidated?: boolean;
  consolidatedPath?: string;
}

/**
 * Merge test results from multiple .vitest-live-*.json files.
 * Handles deduplication by keeping the latest result for each test (by timestamp).
 */
export async function mergeTestResults(
  rootDir: string,
  options: MergeOptions = {}
): Promise<MergedResults> {
  const { saveConsolidated = false, consolidatedPath } = options;

  // Find all temporary result files (NOT the consolidated .vitest-live.json)
  let files: string[] = [];
  try {
    files = await glob('.vitest-live-*.json', { cwd: rootDir, absolute: true });
  } catch (err) {
    console.warn(`[Merger] Failed to scan directory: ${(err as Error).message}`);
    return {
      tests: [],
      fileCount: 0,
      sourceFiles: [],
      mergedAt: new Date().toISOString(),
    };
  }

  if (files.length === 0) {
    console.warn('[Merger] No test result files found.');
  }

  const allResults: TestResult[] = [];

  // Parse each file
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content || content.trim() === '') {
        console.warn(`[Merger] Skipping empty file: ${file}`);
        continue;
      }

      const data = JSON.parse(content);

      // Validate it's an array
      if (!Array.isArray(data)) {
        console.warn(`[Merger] Skipping non-array file: ${file}`);
        continue;
      }

      allResults.push(...data);
    } catch (err) {
      console.warn(`[Merger] Failed to parse ${file}: ${(err as Error).message}`);
    }
  }

  // Sort by timestamp to ensure latest results are processed last
  allResults.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });

  // Deduplicate by name (latest wins)
  const uniqueResults = new Map<string, TestResult>();
  for (const result of allResults) {
    uniqueResults.set(result.name, result);
  }

  const finalResults = Array.from(uniqueResults.values());
  const mergedAt = new Date().toISOString();

  const mergedData: MergedResults = {
    tests: finalResults,
    fileCount: files.length,
    sourceFiles: files,
    mergedAt,
  };

  // Save consolidated results if requested
  if (saveConsolidated) {
    const outputPath = consolidatedPath || path.join(rootDir, '.vitest-live.json');
    try {
      fs.writeFileSync(outputPath, JSON.stringify(mergedData, null, 2));
    } catch (err) {
      console.warn(`[Merger] Failed to save consolidated results: ${(err as Error).message}`);
    }
  }

  return mergedData;
}

import fs from 'fs';
import path from 'path';
import glob from 'fast-glob';

export interface TestResult {
  name: string;
  fullName?: string; // Full path including suite hierarchy
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
 * Convert vitest built-in JSON reporter format to our TestResult format
 */
function convertVitestJsonFormat(data: any, filePath: string): TestResult[] {
  const results: TestResult[] = [];

  if (!data.testResults || !Array.isArray(data.testResults)) {
    return results;
  }

  for (const testFile of data.testResults) {
    const testFilePath = testFile.name || '';
    const pkg = detectPackage(testFilePath);

    if (!testFile.assertionResults || !Array.isArray(testFile.assertionResults)) {
      continue;
    }

    for (const assertion of testFile.assertionResults) {
      const status = assertion.status === 'passed' ? 'passed'
                   : assertion.status === 'failed' ? 'failed'
                   : 'skipped';

      const category = detectCategory(testFilePath);

      results.push({
        name: assertion.title || assertion.fullName || 'Unknown test',
        fullName: assertion.fullName,
        category,
        status,
        duration: assertion.duration,
        error: assertion.failureMessages?.[0],
        stackTrace: assertion.failureMessages?.join('\n'),
        blocking: true,
        timestamp: new Date().toISOString(),
        tags: [category],
        file: testFilePath,
        package: pkg,
      });
    }
  }

  return results;
}

/**
 * Detect test category from file path
 */
function detectCategory(filepath: string): string {
  const normalized = filepath.toLowerCase().replace(/\\/g, '/');
  if (normalized.includes('security') || normalized.includes('.security.')) return 'Security';
  if (normalized.includes('performance') || normalized.includes('.performance.')) return 'Performance';
  if (normalized.includes('contract') || normalized.includes('.contract.')) return 'Contract';
  if (normalized.includes('.ui.test') || normalized.includes('/ui/')) return 'UI';
  return 'GoldenPath';
}

/**
 * Detect package name from file path
 */
function detectPackage(filepath: string): string | undefined {
  if (!filepath) return undefined;
  const normalized = filepath.replace(/\\/g, '/');
  const appsMatch = normalized.match(/apps\/([^/]+)\//);
  if (appsMatch) return appsMatch[1];
  const packagesMatch = normalized.match(/packages\/([^/]+)\//);
  if (packagesMatch) return packagesMatch[1];
  const servicesMatch = normalized.match(/services\/([^/]+)\//);
  if (servicesMatch) return servicesMatch[1];
  return undefined;
}

/**
 * Merge test results from multiple sources:
 * - .vitest-live-*.json (custom LiveReporter format)
 * - vitest-report.json (built-in vitest JSON reporter format)
 *
 * Handles deduplication by keeping the latest result for each test.
 */
export async function mergeTestResults(
  rootDir: string,
  options: MergeOptions = {}
): Promise<MergedResults> {
  const { saveConsolidated = false, consolidatedPath } = options;

  // Find all result files - both custom and built-in formats
  let customFiles: string[] = [];
  let vitestJsonFiles: string[] = [];

  try {
    // Custom LiveReporter files
    customFiles = await glob('.vitest-live-*.json', { cwd: rootDir, absolute: true });

    // Built-in vitest JSON reporter files (in package directories)
    vitestJsonFiles = await glob('**/vitest-report.json', {
      cwd: rootDir,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**']
    });

    console.log(`[Merger] Found ${customFiles.length} custom reporter files, ${vitestJsonFiles.length} vitest JSON files`);
  } catch (err) {
    console.warn(`[Merger] Failed to scan directory: ${(err as Error).message}`);
    return {
      tests: [],
      fileCount: 0,
      sourceFiles: [],
      mergedAt: new Date().toISOString(),
    };
  }

  const allFiles = [...customFiles, ...vitestJsonFiles];

  if (allFiles.length === 0) {
    console.warn('[Merger] No test result files found.');
  }

  const allResults: TestResult[] = [];

  // Parse custom LiveReporter files
  for (const file of customFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content || content.trim() === '') {
        console.warn(`[Merger] Skipping empty file: ${file}`);
        continue;
      }

      const data = JSON.parse(content);

      if (!Array.isArray(data)) {
        console.warn(`[Merger] Skipping non-array file: ${file}`);
        continue;
      }

      allResults.push(...data);
    } catch (err) {
      console.warn(`[Merger] Failed to parse custom file ${file}: ${(err as Error).message}`);
    }
  }

  // Parse vitest built-in JSON reporter files
  for (const file of vitestJsonFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content || content.trim() === '') {
        console.warn(`[Merger] Skipping empty vitest JSON file: ${file}`);
        continue;
      }

      const data = JSON.parse(content);
      const converted = convertVitestJsonFormat(data, file);
      console.log(`[Merger] Converted ${converted.length} tests from ${file}`);
      allResults.push(...converted);
    } catch (err) {
      console.warn(`[Merger] Failed to parse vitest JSON file ${file}: ${(err as Error).message}`);
    }
  }

  // Sort by timestamp to ensure latest results are processed last
  allResults.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });

  // Deduplicate by file:fullName (latest wins) to handle same-named tests across files and suites
  const uniqueResults = new Map<string, TestResult>();
  for (const result of allResults) {
    // Use fullName if available (includes suite hierarchy), fallback to name
    const testIdentifier = result.fullName || result.name;
    const uniqueKey = `${result.file || ''}:${testIdentifier}`;
    uniqueResults.set(uniqueKey, result);
  }

  const finalResults = Array.from(uniqueResults.values());
  const mergedAt = new Date().toISOString();

  const mergedData: MergedResults = {
    tests: finalResults,
    fileCount: allFiles.length,
    sourceFiles: allFiles,
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

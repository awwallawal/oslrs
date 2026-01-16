import fs from 'fs';
import glob from 'fast-glob';

export interface CleanupOptions {
  noCleanup?: boolean;
}

export interface CleanupError {
  file: string;
  error: string;
}

export interface CleanupResult {
  deletedCount: number;
  deletedFiles: string[];
  errors: CleanupError[];
  skipped?: boolean;
}

/**
 * Delete temporary .vitest-live-*.json files after dashboard generation.
 * Does NOT delete the consolidated .vitest-live.json file.
 */
export async function cleanupTempFiles(
  rootDir: string,
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const { noCleanup = false } = options;

  // If noCleanup flag is set, skip deletion
  if (noCleanup) {
    return {
      deletedCount: 0,
      deletedFiles: [],
      errors: [],
      skipped: true,
    };
  }

  // Find all temporary result files (NOT the consolidated .vitest-live.json)
  let files: string[] = [];
  try {
    files = await glob('.vitest-live-*.json', { cwd: rootDir, absolute: true });
  } catch (err) {
    return {
      deletedCount: 0,
      deletedFiles: [],
      errors: [{ file: rootDir, error: (err as Error).message }],
    };
  }

  const deletedFiles: string[] = [];
  const errors: CleanupError[] = [];

  // Delete each file
  for (const file of files) {
    try {
      fs.unlinkSync(file);
      deletedFiles.push(file);
    } catch (err) {
      console.warn(`[Cleanup] Failed to delete ${file}: ${(err as Error).message}`);
      errors.push({
        file,
        error: (err as Error).message,
      });
    }
  }

  return {
    deletedCount: deletedFiles.length,
    deletedFiles,
    errors,
  };
}

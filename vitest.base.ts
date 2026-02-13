import { defineConfig } from 'vitest/config'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { LiveReporter } from './packages/testing/src/reporter'

/**
 * Find workspace root by looking for pnpm-workspace.yaml
 * This works reliably in both local and CI environments
 */
function findWorkspaceRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached root
    dir = parent;
  }
  return startDir; // fallback to start dir
}

// Calculate workspace root - more reliable than import.meta.url in CI
const workspaceRoot = findWorkspaceRoot(process.cwd());

// Also try import.meta.url for comparison
let importMetaDir: string;
try {
  importMetaDir = path.dirname(fileURLToPath(import.meta.url));
} catch {
  importMetaDir = 'N/A';
}

console.log('[Vitest Base] Loading config with LiveReporter...');
console.log('[Vitest Base] Workspace root:', workspaceRoot);
console.log('[Vitest Base] import.meta.url dir:', importMetaDir);
console.log('[Vitest Base] CWD:', process.cwd());
console.log('[Vitest Base] Reporter will write to:', workspaceRoot);

// Debug: Write a marker file to prove config is loaded
try {
  const markerPath = path.join(workspaceRoot, '.vitest-config-loaded');
  fs.writeFileSync(markerPath, `Config loaded at ${new Date().toISOString()}\nWorkspace: ${workspaceRoot}\nCWD: ${process.cwd()}\n`);
  console.log('[Vitest Base] Wrote marker file:', markerPath);
} catch (err) {
  console.error('[Vitest Base] Failed to write marker file:', (err as Error).message);
}

export const baseConfig = defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: [path.resolve(workspaceRoot, 'test/setup.ts')],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    isolate: true,
    pool: 'threads',
    testTimeout: 10000,
    hookTimeout: 15000,
    reporters: ['default', 'json', new LiveReporter({ outputDir: workspaceRoot })],
    outputFile: 'vitest-report.json',
  },
})

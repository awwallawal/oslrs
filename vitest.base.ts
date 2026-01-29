import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { LiveReporter } from './packages/testing/src/reporter'

// Calculate __dirname with fallback for different environments
let __dirname: string;
try {
  __dirname = path.dirname(fileURLToPath(import.meta.url));
} catch {
  // Fallback: use CWD and navigate up if in a package directory
  const cwd = process.cwd();
  if (cwd.includes('/packages/') || cwd.includes('/apps/') || cwd.includes('/services/') ||
      cwd.includes('\\packages\\') || cwd.includes('\\apps\\') || cwd.includes('\\services\\')) {
    __dirname = path.resolve(cwd, '../..');
  } else {
    __dirname = cwd;
  }
}

console.log('[Vitest Base] Loading config with LiveReporter...');
console.log('[Vitest Base] __dirname:', __dirname);
console.log('[Vitest Base] CWD:', process.cwd());
console.log('[Vitest Base] Reporter output dir:', __dirname);

export const baseConfig = defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, 'test/setup.ts')],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    isolate: true,
    pool: 'threads',
    reporters: ['default', 'json', new LiveReporter({ outputDir: __dirname })],
    outputFile: 'vitest-report.json',
  },
})

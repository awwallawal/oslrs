import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { LiveReporter } from './packages/testing/src/reporter'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

console.log('[Vitest Base] Loading config with LiveReporter...'); // Debug
console.log('[Vitest Base] __dirname:', __dirname);
console.log('[Vitest Base] CWD:', process.cwd());

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

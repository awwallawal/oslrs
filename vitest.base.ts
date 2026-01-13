import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
    reporters: ['default', 'json'],
    outputFile: 'vitest-report.json',
  },
})

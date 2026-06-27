import { defineConfig, mergeConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { baseConfig } from '../../vitest.base'

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: {
        'virtual:pwa-register': fileURLToPath(
          new URL('src/__mocks__/virtual-pwa-register.ts', import.meta.url)
        ),
      },
    },
    test: {
      include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
      environment: 'jsdom',
      // Story 13-7 — web-only IndexedDB polyfill. mergeConfig CONCATENATES setupFiles arrays,
      // so this APPENDS to baseConfig's test/setup.ts (jest-dom + window mocks preserved).
      setupFiles: [fileURLToPath(new URL('src/test/fake-indexeddb.setup.ts', import.meta.url))],
    },
  })
)

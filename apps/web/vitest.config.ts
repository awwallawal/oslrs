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
    },
  })
)

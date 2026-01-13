import { defineConfig, mergeConfig } from 'vitest/config'
import { baseConfig } from '../../vitest.base'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
      environment: 'jsdom',
    },
  })
)

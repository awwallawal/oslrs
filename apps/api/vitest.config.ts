import { defineConfig, mergeConfig } from 'vitest/config'
import { baseConfig } from '../../vitest.base'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
      env: {
        NODE_ENV: 'test',
        // Disable SKIP_CAPTCHA so CAPTCHA tests can verify proper rejection behavior
        // Tests that need to pass CAPTCHA should use 'test-captcha-bypass' token
        SKIP_CAPTCHA: 'false',
      },
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
      ],
    },
  })
)
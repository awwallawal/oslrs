import { defineConfig, mergeConfig } from 'vitest/config'
import { baseConfig } from '../../vitest.base'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
      // Increase timeout for database-heavy tests — default 10s is too short under
      // parallel thread-pool load (bcrypt hashing, DB inserts, Redis in beforeAll hooks).
      // IMPORTANT: hookTimeout must match testTimeout. Vitest defaults hookTimeout to
      // 10000ms independently of testTimeout, so beforeAll/afterAll will time out if
      // only testTimeout is increased. See docs/testing-conventions.md for details.
      testTimeout: 15000,
      hookTimeout: 15000,
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
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://localhost:5173',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Auth setup — runs sequentially before golden-path tests.
    // All role setups are setup.skip() until full stack is available in CI.
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
    },
    // Smoke tests — independent, no auth dependency
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Golden path tests — require authenticated state from auth-setup.
    // Individual tests set their own storageState via test.use() for multi-role support.
    {
      name: 'golden-path',
      testMatch: /golden-path\.spec\.ts/,
      dependencies: ['auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    // Validation tests — inline login, no auth-setup dependency.
    // Requires full stack running (API + DB + Redis + Web) with seeded data.
    {
      name: 'validation',
      testMatch: /nin-validation\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Epic 4 feature E2E tests — inline login, full stack required.
    // Covers fraud threshold UI, messaging inbox, and supervisor team dashboard.
    {
      name: 'epic4-features',
      testMatch: /(?:fraud-threshold|messaging|supervisor-dashboard)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

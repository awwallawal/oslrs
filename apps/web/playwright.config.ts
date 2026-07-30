import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Story 13-36 review (2026-07-27): ONE worker everywhere — local included.
  //
  // This is a correctness constraint, not a performance choice. The suite shares
  // ONE seeded account per role (`admin@dev.local`, `supervisor@dev.local`), and the
  // API is single-session by design: every login reaps the user's previous refresh
  // token (token.service.ts:146, "AT-MOST-ONE active refresh token per user"). Two
  // workers signed in as the same account therefore invalidate each other, and any
  // full page load after that gets 401 → AUTH_LOGOUT → the public home page.
  //
  // Measured on `fraud-threshold.spec.ts`'s reload test — failure rate scales
  // cleanly with worker count:
  //     workers=1 → 0%    workers=2 → 17%    workers=4 → 42%    workers=6 → 58%
  // CI was already `workers: 1`, which is the ONLY reason this never turned CI red;
  // locally it made the suite look broken. A suite that is green in CI and flaky on
  // every developer's machine is not a trustworthy signal — the exact failure this
  // story exists to end (Task 5), one layer down.
  //
  // Do NOT raise this to "speed up" a local run. Removing the cap requires giving
  // each worker its OWN seeded account (per-worker fixtures), because the underlying
  // conflict is the shared login, not the parallelism itself.
  workers: 1,
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
    // Story 9-57 / AI-Review M1 — mints `wizard_resume` tokens (via the
    // test-only api script) into a fixture the wizard resume/reload tests read.
    // Runs before the `wizard` project as a dependency. No browser is used; it
    // shells out to the api package and writes apps/web/e2e/.wizard-resume-tokens.json.
    {
      name: 'wizard-resume-setup',
      testMatch: /wizard-resume\.setup\.ts/,
    },
    // Story 9-12 — public registration wizard E2E (AC#13). Smoke-level
    // assertions + the Story 9-57 URL-navigation flows are active; the
    // remaining full-stack happy-path/pending-NIN flows are test.skip() with
    // detailed re-enable preconditions (mirrors nin-validation.spec.ts pattern).
    {
      name: 'wizard',
      testMatch: /wizard-registration\.spec\.ts/,
      dependencies: ['wizard-resume-setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @oslsr/api dev',
      url: 'http://localhost:3000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});

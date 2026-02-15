import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Storage state file paths for each role
const authDir = path.join(__dirname, '.auth');
const storageState = {
  superAdmin: path.join(authDir, 'super-admin.json'),
  supervisor: path.join(authDir, 'supervisor.json'),
  enumerator: path.join(authDir, 'enumerator.json'),
  clerk: path.join(authDir, 'clerk.json'),
  assessor: path.join(authDir, 'assessor.json'),
  official: path.join(authDir, 'official.json'),
  public: path.join(authDir, 'public.json'),
} as const;

// NOTE: All auth setups are setup.skip() until the full stack is available in CI.
// The dev server does NOT set NODE_ENV=test, so login rate limits ARE active.
// Auth setups run sequentially (not parallel) to avoid triggering rate limits.

/**
 * Helper: Login via the staff login page (/login) and save storage state.
 */
async function staffLogin(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  storagePath: string,
) {
  await page.goto('/staff/login');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);

  // Complete hCaptcha verification (test keys auto-pass)
  const captchaFrame = page.frameLocator(
    'iframe[title="Widget containing checkbox for hCaptcha security challenge"]',
  );
  // eslint-disable-next-line no-restricted-syntax -- Team Agreement A3 exception: third-party hCaptcha iframe checkbox
  await captchaFrame.locator('#checkbox').click();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();

  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard/**');
  await page.context().storageState({ path: storagePath });
}

/**
 * Helper: Login via the public login page (/auth/public/login) and save storage state.
 * Public users authenticate through a different endpoint than staff users.
 */
async function publicLogin(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  storagePath: string,
) {
  await page.goto('/auth/public/login');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);

  // Complete hCaptcha verification (test keys auto-pass)
  // NOTE: Verify public login page has hCaptcha when enabling this setup
  const captchaFrame = page.frameLocator(
    'iframe[title="Widget containing checkbox for hCaptcha security challenge"]',
  );
  // eslint-disable-next-line no-restricted-syntax -- Team Agreement A3 exception: third-party hCaptcha iframe checkbox
  await captchaFrame.locator('#checkbox').click();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();

  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard/**');
  await page.context().storageState({ path: storagePath });
}

// --- Role-specific auth setups (sequential execution to avoid rate limits) ---

setup.skip('authenticate as super-admin', async ({ page }) => {
  await staffLogin(
    page,
    process.env.E2E_ADMIN_EMAIL ?? 'admin@dev.local',
    process.env.E2E_ADMIN_PASSWORD ?? 'admin123',
    storageState.superAdmin,
  );
});

setup.skip('authenticate as supervisor', async ({ page }) => {
  await staffLogin(
    page,
    process.env.E2E_SUPERVISOR_EMAIL ?? 'supervisor@dev.local',
    process.env.E2E_SUPERVISOR_PASSWORD ?? 'super123',
    storageState.supervisor,
  );
});

setup.skip('authenticate as enumerator', async ({ page }) => {
  await staffLogin(
    page,
    process.env.E2E_ENUM_EMAIL ?? 'enumerator@dev.local',
    process.env.E2E_ENUM_PASSWORD ?? 'enum123',
    storageState.enumerator,
  );
});

setup.skip('authenticate as data-entry-clerk', async ({ page }) => {
  await staffLogin(
    page,
    process.env.E2E_CLERK_EMAIL ?? 'clerk@dev.local',
    process.env.E2E_CLERK_PASSWORD ?? 'clerk123',
    storageState.clerk,
  );
});

setup.skip('authenticate as verification-assessor', async ({ page }) => {
  await staffLogin(
    page,
    process.env.E2E_ASSESSOR_EMAIL ?? 'assessor@dev.local',
    process.env.E2E_ASSESSOR_PASSWORD ?? 'assess123',
    storageState.assessor,
  );
});

setup.skip('authenticate as government-official', async ({ page }) => {
  await staffLogin(
    page,
    process.env.E2E_OFFICIAL_EMAIL ?? 'official@dev.local',
    process.env.E2E_OFFICIAL_PASSWORD ?? 'official123',
    storageState.official,
  );
});

setup.skip('authenticate as public-user', async ({ page }) => {
  // Public users use a different login endpoint (/auth/public/login)
  // The pre-seeded public@dev.local account is used for storage state.
  // GP-9 separately tests the full self-registration journey including magic link verification.
  await publicLogin(
    page,
    process.env.E2E_PUBLIC_EMAIL ?? 'public@dev.local',
    process.env.E2E_PUBLIC_PASSWORD ?? 'public123',
    storageState.public,
  );
});

// Export storage state paths for use in test files via test.use({ storageState })
export { storageState };

import { test as setup } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '.auth/user.json');

// NOTE: This setup requires the full stack running (API + DB + Redis).
// Uncomment and configure when adding authenticated E2E tests (Epic 3+).
// For now, this serves as a template showing the storage state pattern.

setup.skip('authenticate as super-admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@dev.local');
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD ?? 'admin123');
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for dashboard redirect
  await page.waitForURL('**/dashboard/**');

  // Save auth state for reuse across tests
  await page.context().storageState({ path: authFile });
});

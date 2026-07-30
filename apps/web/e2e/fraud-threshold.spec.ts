import { test, expect } from '@playwright/test';
import { staffLogin } from './helpers/login';

/**
 * Fraud Threshold Settings E2E Tests
 *
 * Tests the Super Admin fraud threshold configuration UI:
 *   Navigate to settings → View thresholds → Edit → Save → Verify persistence
 *
 * Requires full stack running (API + DB + Redis + Web) with seeded fraud thresholds.
 *
 * Selector rules (Team Agreement A3):
 *   1. page.getByRole()   — semantic roles (preferred)
 *   2. page.getByLabel()  — form fields
 *   3. page.getByText()   — visible text
 *   4. page.getByTestId() — only when above insufficient
 *
 * Determinism sweep (Story 13-36 AC3, 2026-07-26 — audited, no change needed):
 *   The inline edit/save clicks below DO depend on query output, but each is
 *   preceded by an assertion on `fraud-thresholds-page` (or its heading), which
 *   the page renders only after the loading / error / empty early-returns fall
 *   through (SuperAdminFraudThresholdsPage.tsx:26-63). That assertion is the
 *   data-ready gate, so no click here races an in-flight fetch the way the
 *   messaging broadcast click did. Preserve that ordering when adding tests.
 *
 * @see prep-7-e2e-test-expansion.md
 * @see 4-3-fraud-engine-configurable-thresholds.md
 */

test.describe('Fraud Threshold Settings', () => {
  test.beforeEach(async ({ page }) => {
    await staffLogin(page, 'admin');
  });

  test('navigate to fraud thresholds and view current values', async ({ page }) => {
    // Navigate via sidebar link
    // Race-safe nav (see helpers/login.ts comment on Promise.all pattern).
    await Promise.all([
      page.waitForURL('**/settings/fraud-thresholds'),
      page.getByRole('link', { name: 'Fraud Thresholds' }).click(),
    ]);

    // Verify page heading
    await expect(page.getByRole('heading', { name: /Fraud Detection Thresholds/i })).toBeVisible();

    // Verify at least GPS and Speed category cards render
    await expect(page.getByTestId('category-card-gps')).toBeVisible();
    await expect(page.getByTestId('category-card-speed')).toBeVisible();

    // Verify a known threshold value is displayed (seeded: gps_cluster_radius_m = 50)
    await expect(page.getByTestId('threshold-value-gps_cluster_radius_m')).toBeVisible();
  });

  test('modify GPS cluster radius, verify save toast, and verify persistence on reload', async ({ page }) => {
    // Navigate to fraud thresholds
    // Race-safe nav (see helpers/login.ts comment on Promise.all pattern).
    await Promise.all([
      page.waitForURL('**/settings/fraud-thresholds'),
      page.getByRole('link', { name: 'Fraud Thresholds' }).click(),
    ]);
    await expect(page.getByTestId('fraud-thresholds-page')).toBeVisible();

    // Record original value for cleanup
    const originalValue = await page.getByTestId('threshold-value-gps_cluster_radius_m').textContent();

    // Click Edit on GPS cluster radius
    await page.getByTestId('threshold-edit-gps_cluster_radius_m').click();

    // Verify input appears with current value
    const input = page.getByTestId('threshold-input-gps_cluster_radius_m');
    await expect(input).toBeVisible();

    // Modify the value
    const newValue = '75';
    await input.fill(newValue);

    // Click Save
    await page.getByTestId('threshold-save-gps_cluster_radius_m').click();

    // Verify success toast
    await expect(page.getByText('Threshold updated successfully')).toBeVisible();

    // Verify display mode returns with new value
    await expect(page.getByTestId('threshold-value-gps_cluster_radius_m')).toHaveText(newValue);

    // --- Verify persistence on page reload ---
    // This reload is SAFE ONLY BECAUSE the suite runs single-worker (see the
    // `workers: 1` rationale in playwright.config.ts). The suite shares one seeded
    // account per role and the API is single-session — every login reaps the previous
    // refresh token (token.service.ts:146) — so with parallel workers a sibling's
    // login invalidates this page's cookie and the reload 401s onto the public home
    // page. Measured 2026-07-27 while chasing the 13-36 residual: 0% flaky at
    // `--workers=1`, 17% at 2, 42% at 4, 58% at 6.
    //
    // Do NOT "harden" this by re-logging-in after a failed reload: that doubles the
    // suite's login volume and trips the login rate limiter (active locally because
    // the dev server is not NODE_ENV=test — see auth.setup.ts:20), which strands the
    // page on /staff/login. Tried and measured; it made things worse.
    //
    // The explicit budget stays: a reload restarts the whole auth boot chain
    // (/auth/refresh → /auth/me → this page's query, serialized because apiClient
    // awaits awaitAccessToken() before fetching — api-client.ts:52), which measured
    // 2-5s even on the happy path.
    await page.reload();
    await expect(page.getByTestId('fraud-thresholds-page')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('threshold-value-gps_cluster_radius_m')).toHaveText(newValue);

    // --- Cleanup: Restore original value ---
    await page.getByTestId('threshold-edit-gps_cluster_radius_m').click();
    await page.getByTestId('threshold-input-gps_cluster_radius_m').fill(originalValue?.trim() ?? '50');
    await page.getByTestId('threshold-save-gps_cluster_radius_m').click();
    await expect(page.getByText('Threshold updated successfully')).toBeVisible();
  });

  test('cancel edit reverts to original value', async ({ page }) => {
    // Navigate to fraud thresholds
    // Race-safe nav (see helpers/login.ts comment on Promise.all pattern).
    await Promise.all([
      page.waitForURL('**/settings/fraud-thresholds'),
      page.getByRole('link', { name: 'Fraud Thresholds' }).click(),
    ]);
    await expect(page.getByTestId('fraud-thresholds-page')).toBeVisible();

    // Record original value
    const originalValue = await page.getByTestId('threshold-value-gps_cluster_radius_m').textContent();

    // Enter edit mode
    await page.getByTestId('threshold-edit-gps_cluster_radius_m').click();
    const input = page.getByTestId('threshold-input-gps_cluster_radius_m');
    await expect(input).toBeVisible();

    // Type a different value
    await input.fill('999');

    // Cancel the edit
    await page.getByTestId('threshold-cancel-gps_cluster_radius_m').click();

    // Verify original value is restored
    await expect(page.getByTestId('threshold-value-gps_cluster_radius_m')).toHaveText(originalValue?.trim() ?? '50');
  });

  test('all six threshold categories render', async ({ page }) => {
    // Race-safe nav (see helpers/login.ts comment on Promise.all pattern).
    await Promise.all([
      page.waitForURL('**/settings/fraud-thresholds'),
      page.getByRole('link', { name: 'Fraud Thresholds' }).click(),
    ]);
    await expect(page.getByTestId('fraud-thresholds-page')).toBeVisible();

    // Verify all 6 category cards are present
    const categories = ['gps', 'speed', 'straightline', 'duplicate', 'timing', 'composite'];
    for (const category of categories) {
      await expect(page.getByTestId(`category-card-${category}`)).toBeVisible();
    }
  });
});

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
 * @see prep-7-e2e-test-expansion.md
 * @see 4-3-fraud-engine-configurable-thresholds.md
 */

test.describe('Fraud Threshold Settings', () => {
  test.beforeEach(async ({ page }) => {
    await staffLogin(page, 'admin');
  });

  test('navigate to fraud thresholds and view current values', async ({ page }) => {
    // Navigate via sidebar link
    await page.getByRole('link', { name: 'Fraud Thresholds' }).click();
    await page.waitForURL('**/settings/fraud-thresholds');

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
    await page.getByRole('link', { name: 'Fraud Thresholds' }).click();
    await page.waitForURL('**/settings/fraud-thresholds');
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
    await page.reload();
    await expect(page.getByTestId('fraud-thresholds-page')).toBeVisible();
    await expect(page.getByTestId('threshold-value-gps_cluster_radius_m')).toHaveText(newValue);

    // --- Cleanup: Restore original value ---
    await page.getByTestId('threshold-edit-gps_cluster_radius_m').click();
    await page.getByTestId('threshold-input-gps_cluster_radius_m').fill(originalValue?.trim() ?? '50');
    await page.getByTestId('threshold-save-gps_cluster_radius_m').click();
    await expect(page.getByText('Threshold updated successfully')).toBeVisible();
  });

  test('cancel edit reverts to original value', async ({ page }) => {
    // Navigate to fraud thresholds
    await page.getByRole('link', { name: 'Fraud Thresholds' }).click();
    await page.waitForURL('**/settings/fraud-thresholds');
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
    await page.getByRole('link', { name: 'Fraud Thresholds' }).click();
    await page.waitForURL('**/settings/fraud-thresholds');
    await expect(page.getByTestId('fraud-thresholds-page')).toBeVisible();

    // Verify all 6 category cards are present
    const categories = ['gps', 'speed', 'straightline', 'duplicate', 'timing', 'composite'];
    for (const category of categories) {
      await expect(page.getByTestId(`category-card-${category}`)).toBeVisible();
    }
  });
});

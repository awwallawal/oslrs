import { test, expect } from '@playwright/test';
import { staffLogin } from './helpers/login';

/**
 * Supervisor Team Dashboard E2E Tests
 *
 * Tests the Supervisor dashboard, team page, and fraud alerts:
 *   Dashboard stats → Team table → GPS map → Fraud alerts
 *
 * Requires full stack running (API + DB + Redis + Web) with seeded team assignments.
 *
 * Selector rules (Team Agreement A3):
 *   1. page.getByRole()   — semantic roles (preferred)
 *   2. page.getByLabel()  — form fields
 *   3. page.getByText()   — visible text
 *   4. page.getByTestId() — only when above insufficient
 *
 * @see prep-7-e2e-test-expansion.md
 * @see 4-1-supervisor-team-dashboard.md
 */

test.describe('Supervisor Dashboard & Team', () => {
  test.beforeEach(async ({ page }) => {
    await staffLogin(page, 'supervisor');
  });

  test('supervisor dashboard renders stats cards', async ({ page }) => {
    // Verify dashboard heading
    await expect(page.getByRole('heading', { name: /Supervisor Dashboard/i })).toBeVisible();

    // Verify stats cards
    await expect(page.getByTestId('total-submissions-card')).toBeVisible();
    await expect(page.getByTestId('team-overview-card')).toBeVisible();
    await expect(page.getByTestId('pending-alerts-card')).toBeVisible();
  });

  test('team page renders enumerator table', async ({ page }) => {
    // Navigate to Team Progress via sidebar
    await page.getByRole('link', { name: 'Team Progress' }).click();
    await page.waitForURL('**/team');

    // Verify page heading
    await expect(page.getByRole('heading', { name: /Team Progress/i })).toBeVisible();

    // Verify team roster table renders (3 enumerators assigned in seeds)
    await expect(page.getByTestId('team-roster')).toBeVisible();

    // Verify at least one enumerator row exists
    const enumeratorRows = page.getByTestId('enumerator-row');
    await expect(enumeratorRows.first()).toBeVisible();
  });

  test('team page renders GPS map container', async ({ page }) => {
    // Navigate to Team Progress
    await page.getByRole('link', { name: 'Team Progress' }).click();
    await page.waitForURL('**/team');

    // Verify map card is present
    await expect(page.getByTestId('team-map')).toBeVisible();

    // Verify Leaflet map container renders
    // The .leaflet-container selector is acceptable for E2E per story AC#3
    // eslint-disable-next-line no-restricted-syntax -- AC#3 explicitly allows .leaflet-container for E2E
    const mapContainer = page.locator('.leaflet-container');
    // Map may show data or empty state depending on seed data
    const mapEmpty = page.getByTestId('map-empty');
    await expect(mapContainer.or(mapEmpty)).toBeVisible();
  });

  test('fraud alerts page loads', async ({ page }) => {
    // Navigate to Fraud Alerts via sidebar
    await page.getByRole('link', { name: 'Fraud Alerts' }).click();
    await page.waitForURL('**/fraud');

    // Verify page heading
    await expect(page.getByRole('heading', { name: /Fraud Alerts/i })).toBeVisible();

    // Verify tab navigation exists
    await expect(page.getByTestId('tab-list')).toBeVisible();
    await expect(page.getByTestId('tab-clusters')).toBeVisible();
  });

  test('sidebar navigation works between all supervisor pages', async ({ page }) => {
    // Dashboard → Team Progress
    await page.getByRole('link', { name: 'Team Progress' }).click();
    await page.waitForURL('**/team');
    await expect(page.getByRole('heading', { name: /Team Progress/i })).toBeVisible();

    // Team Progress → Fraud Alerts
    await page.getByRole('link', { name: 'Fraud Alerts' }).click();
    await page.waitForURL('**/fraud');
    await expect(page.getByRole('heading', { name: /Fraud Alerts/i })).toBeVisible();

    // Fraud Alerts → Messages
    await page.getByRole('link', { name: 'Messages' }).click();
    await page.waitForURL('**/messages');

    // Messages → Home (Dashboard)
    await page.getByRole('link', { name: 'Home' }).click();
    await page.waitForURL('**/dashboard/supervisor');
    await expect(page.getByRole('heading', { name: /Supervisor Dashboard/i })).toBeVisible();
  });
});

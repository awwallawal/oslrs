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
 * Navigation pattern (2026-05-14 — flake-resistance fix):
 *   All click → waitForURL pairs use Promise.all so the URL-wait starts
 *   BEFORE the click fires. The naive pattern
 *     await link.click();
 *     await page.waitForURL(pattern);
 *   can flake when the click fires before React Router binds its handler
 *   or when navigation completes before the next await runs. See
 *   `feedback_route_registration_test_discipline.md` memory + the
 *   2026-05-14 supervisor-dashboard:53 flake post-mortem.
 *
 * @see prep-7-e2e-test-expansion.md
 * @see 4-1-supervisor-team-dashboard.md
 */

test.describe('Supervisor Dashboard & Team', () => {
  test.beforeEach(async ({ page }) => {
    await staffLogin(page, 'supervisor');
    // Wait for React hydration: the dashboard heading is painted only after
    // the supervisor dashboard component mounts + hydrates. Clicking sidebar
    // links before hydration sometimes lands the click on an un-wired-up
    // element, producing a no-op navigation. Anchoring on the heading
    // guarantees the sidebar's Link handlers are bound too.
    await expect(page.getByRole('heading', { name: /Supervisor Dashboard/i })).toBeVisible();
  });

  test('supervisor dashboard renders stats cards', async ({ page }) => {
    // Heading already verified in beforeEach.
    await expect(page.getByTestId('total-submissions-card')).toBeVisible();
    await expect(page.getByTestId('team-overview-card')).toBeVisible();
    await expect(page.getByTestId('pending-alerts-card')).toBeVisible();
  });

  test('team page renders enumerator table', async ({ page }) => {
    // Navigate to Team Progress via sidebar (race-safe pattern).
    await Promise.all([
      page.waitForURL('**/team'),
      page.getByRole('link', { name: 'Team Progress' }).click(),
    ]);

    // Verify page heading
    await expect(page.getByRole('heading', { name: /Team Progress/i })).toBeVisible();

    // Verify team roster table renders (3 enumerators assigned in seeds)
    await expect(page.getByTestId('team-roster')).toBeVisible();

    // Verify at least one enumerator row exists
    const enumeratorRows = page.getByTestId('enumerator-row');
    await expect(enumeratorRows.first()).toBeVisible();
  });

  test('team page renders GPS map container', async ({ page }) => {
    // Navigate to Team Progress (race-safe pattern).
    await Promise.all([
      page.waitForURL('**/team'),
      page.getByRole('link', { name: 'Team Progress' }).click(),
    ]);

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
    // Navigate to Fraud Alerts via sidebar (race-safe pattern).
    await Promise.all([
      page.waitForURL('**/fraud'),
      page.getByRole('link', { name: 'Fraud Alerts' }).click(),
    ]);

    // Verify page heading
    await expect(page.getByRole('heading', { name: /Fraud Alerts/i })).toBeVisible();

    // Verify tab navigation exists
    await expect(page.getByTestId('tab-list')).toBeVisible();
    await expect(page.getByTestId('tab-clusters')).toBeVisible();
  });

  test('sidebar navigation works between all supervisor pages', async ({ page }) => {
    // Dashboard → Team Progress
    await Promise.all([
      page.waitForURL('**/team'),
      page.getByRole('link', { name: 'Team Progress' }).click(),
    ]);
    await expect(page.getByRole('heading', { name: /Team Progress/i })).toBeVisible();

    // Team Progress → Fraud Alerts
    await Promise.all([
      page.waitForURL('**/fraud'),
      page.getByRole('link', { name: 'Fraud Alerts' }).click(),
    ]);
    await expect(page.getByRole('heading', { name: /Fraud Alerts/i })).toBeVisible();

    // Fraud Alerts → Messages
    await Promise.all([
      page.waitForURL('**/messages'),
      page.getByRole('link', { name: 'Messages' }).click(),
    ]);

    // Messages → Home (Dashboard). Exact-match to disambiguate from the two
    // logo links whose aria-label is "OSLSR Dashboard Home" (sidebar logo +
    // header logo); only the sidebar nav item has accessible name "Home".
    // See DashboardSidebar.tsx:79 + DashboardHeader.tsx:64 + sidebarConfig.ts:115.
    await Promise.all([
      page.waitForURL('**/dashboard/supervisor'),
      page.getByRole('link', { name: 'Home', exact: true }).click(),
    ]);
    await expect(page.getByRole('heading', { name: /Supervisor Dashboard/i })).toBeVisible();
  });
});

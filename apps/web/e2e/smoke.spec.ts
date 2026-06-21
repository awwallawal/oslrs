import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('homepage loads with OSLSR content', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/OSLSR/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      "Oyo State's Workforce"
    );
  });

  test('login page renders magic-link-primary sign-in (Story 9-39)', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Login.*OSLSR/);

    // Story 9-39: public sign-in is magic-link-FIRST. The primary surface is the
    // email + "email me a sign-in link" magic-link form; email+password is demoted
    // to a secondary collapsed disclosure, so the Password field is intentionally
    // NOT visible by default (this is what the old assertion mis-expected).
    await expect(page.getByTestId('magic-link-entry-point')).toBeVisible();
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByTestId('magic-link-submit-button')).toBeVisible();

    // Password sign-in is demoted, not removed — assert it is still reachable
    // behind the disclosure so a future regression that drops it is caught.
    await expect(page.getByLabel('Password', { exact: true })).toBeHidden();
    await page.getByTestId('password-signin-reveal').click();
    await expect(page.getByTestId('password-signin-form')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  });

  test('public navigation works', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /learn how it works/i }).click();
    await expect(page).toHaveURL(/\/about\/how-it-works/);
    // Navigate to a second page to verify multi-hop navigation
    await page.getByRole('navigation').getByRole('link', { name: /marketplace/i }).click();
    await expect(page).toHaveURL(/\/marketplace/);
  });
});

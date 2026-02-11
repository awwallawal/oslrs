import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('homepage loads with OSLSR content', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/OSLSR/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      "Oyo State's Workforce"
    );
  });

  test('login page renders form fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Login.*OSLSR/);
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
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

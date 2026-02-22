import { expect, type Page } from '@playwright/test';

export type StaffRole = 'admin' | 'supervisor';

const DEFAULT_CREDENTIALS: Record<StaffRole, { email: string; password: string }> = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@dev.local',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'admin123',
  },
  supervisor: {
    email: process.env.E2E_SUPERVISOR_EMAIL ?? 'supervisor@dev.local',
    password: process.env.E2E_SUPERVISOR_PASSWORD ?? 'super123',
  },
};

/**
 * Login as a staff member via /staff/login (inline, matches GP-1 pattern).
 * Handles email, password, hCaptcha verification, and waits for dashboard redirect.
 *
 * Centralises the login flow so that all E2E specs share a single implementation.
 * If the login UI changes (hCaptcha selector, button text, etc.), only this file needs updating.
 */
export async function staffLogin(page: Page, role: StaffRole): Promise<void> {
  const { email, password } = DEFAULT_CREDENTIALS[role];

  await page.goto('/staff/login');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);

  // HCaptcha auto-bypassed via VITE_E2E=true (component calls onVerify on mount)
  await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();

  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard/**');
}

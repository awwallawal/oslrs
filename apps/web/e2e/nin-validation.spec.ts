import { test, expect } from '@playwright/test';

/**
 * NIN Modulus 11 Validation E2E.
 *
 * Two surfaces:
 *   1. Public wizard Step 1 (Story 9-18 Part A / AC#D5) — client-side Modulus-11
 *      feedback + the pending-NIN toggle. Active (only needs /register to
 *      render, which the full-stack webServer provides; the form-404 settles the
 *      wizard to Step 1).
 *   2. Enumerator form-filler (Story 3.4 Task 0.7) — server-seeded form with a
 *      NIN question. Still skipped pending a published-form dev seed.
 */

test.describe('Wizard Step 1 — NIN validation (Story 9-18 AC#D5)', () => {
  const VALID_NIN = '61961438053'; // passes Modulus 11
  const INVALID_NIN = '12345678910'; // 11 digits, wrong check digit

  test('rejects a checksum-invalid NIN with the Modulus-11 message + disabled Continue', async ({
    page,
  }) => {
    await page.goto('/register');
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();

    await page.getByTestId('wizard-step1-nin-input').fill(INVALID_NIN);
    const invalid = page.getByTestId('wizard-step1-nin-invalid');
    await expect(invalid).toBeVisible();
    await expect(invalid).toContainText(/modulus 11/i);
    await expect(page.getByTestId('wizard-nav-continue')).toBeDisabled();
  });

  test('accepts a checksum-valid NIN (green format indicator)', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();

    await page.getByTestId('wizard-step1-nin-input').fill(VALID_NIN);
    await expect(page.getByTestId('wizard-step1-nin-valid')).toBeVisible();
    await expect(page.getByTestId('wizard-step1-nin-invalid')).toHaveCount(0);
  });

  test('pending-NIN toggle disables the NIN input + shows the consequence card', async ({
    page,
  }) => {
    await page.goto('/register');
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();

    // The "I don't have my NIN now" inline link is equivalent to the toggle.
    await page.getByTestId('nin-help-hint-pending-link').click();
    await expect(page.getByTestId('wizard-step1-nin-input')).toBeDisabled();
    await expect(page.getByTestId('pending-nin-consequence')).toBeVisible();
  });

  /**
   * SKIPPED — the live duplicate-NIN block (AC#A2) needs a respondent already
   * registered with VALID_NIN so the unauthenticated `useNinCheck` →
   * POST /forms/check-nin returns a duplicate. Seed that respondent in the dev
   * orchestrator, then drop the `.skip`.
   */
  test.skip('blocks a duplicate NIN via the live check (needs a seeded collision)', async ({
    page,
  }) => {
    await page.goto('/register');
    await page.getByTestId('wizard-step1-nin-input').fill(VALID_NIN);
    await expect(page.getByTestId('wizard-step1-nin-duplicate')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('wizard-nav-continue')).toBeDisabled();
  });
});

test.describe('Enumerator form-filler — NIN validation (Story 3.4 Task 0.7)', () => {
  // SKIPPED: requires a published native form with a NIN question after
  // db:seed:dev (the seed orchestrator doesn't yet create one). Re-enable by
  // adding a published-survey seed module + removing the `.skip`.
  test.skip('should reject invalid NIN with modulus11 error and accept valid NIN', async ({ page }) => {
    await page.goto('/staff/login');
    await page.getByLabel('Email Address').fill('enumerator@dev.local');
    await page.getByLabel('Password', { exact: true }).fill('enum123');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();
    await Promise.all([
      page.waitForURL('**/dashboard/**'),
      page.getByRole('button', { name: /sign in/i }).click(),
    ]);

    await Promise.all([
      page.waitForURL('**/survey'),
      page.getByRole('link', { name: /survey/i }).click(),
    ]);

    const surveysGrid = page.getByTestId('surveys-grid');
    await expect(surveysGrid).toBeVisible({ timeout: 15000 });
    const firstSurveyButton = surveysGrid.getByRole('button').first();
    await Promise.all([page.waitForURL('**/survey/**'), firstSurveyButton.click()]);

    const ninInput = page.getByTestId('input-nin');
    const continueBtn = page.getByTestId('continue-btn');
    for (let i = 0; i < 20; i++) {
      if (await ninInput.isVisible().catch(() => false)) break;
      const currentTextbox = page.getByRole('textbox').first();
      if (await currentTextbox.isVisible().catch(() => false)) {
        await currentTextbox.fill('test');
      } else {
        const currentSelect = page.getByRole('combobox').first();
        if (await currentSelect.isVisible().catch(() => false)) {
          await currentSelect.selectOption({ index: 0 }).catch(() => {});
        }
      }
      const yesOption = page.getByRole('radio', { name: /yes/i });
      if (await yesOption.isVisible().catch(() => false)) {
        await yesOption.click();
      }
      await continueBtn.click();
      await page.waitForTimeout(200);
    }

    await expect(ninInput).toBeVisible({ timeout: 5000 });

    await ninInput.fill('12345678902');
    await continueBtn.click();
    const errorAlert = page.getByRole('alert');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
    await expect(errorAlert).toContainText(/NIN|invalid/i);
    await expect(continueBtn).toBeDisabled();

    await ninInput.fill('61961438053');
    await expect(errorAlert).not.toBeVisible({ timeout: 5000 });
    await expect(continueBtn).toBeEnabled();
    await expect(page.getByLabel('Valid')).toBeVisible();
  });
});

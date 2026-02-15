import { test, expect } from '@playwright/test';

/**
 * NIN Modulus 11 Validation E2E Test
 *
 * Replaces manual Task 0.7 from Story 3.4:
 * "Open the enumerator form filler, enter an invalid NIN,
 * confirm validation error appears before submission."
 *
 * Preconditions:
 * - Full stack running (API + DB + Redis + Web)
 * - Dev seed data applied (enumerator@dev.local / enum123)
 * - At least 1 published form with a NIN question exists
 *
 * @see Story 3.4 Task 0.7
 */

test.describe('NIN Modulus 11 Validation', () => {
  test('should reject invalid NIN with modulus11 error and accept valid NIN', async ({ page }) => {
    // --- Step 1: Login as enumerator (inline — auth-setup is skipped) ---
    await page.goto('/staff/login');
    await page.getByLabel('Email Address').fill('enumerator@dev.local');
    await page.getByLabel('Password', { exact: true }).fill('enum123');

    // Complete hCaptcha (test keys auto-pass in dev)
    const captchaFrame = page.frameLocator(
      'iframe[title="Widget containing checkbox for hCaptcha security challenge"]',
    );
    // eslint-disable-next-line no-restricted-syntax -- Team Agreement A3 exception: third-party hCaptcha iframe checkbox
    await captchaFrame.locator('#checkbox').click();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/dashboard/**');

    // --- Step 2: Navigate to surveys page ---
    await page.getByRole('link', { name: /survey/i }).click();
    await page.waitForURL('**/survey');

    // Wait for surveys to load (not loading, not error, not empty)
    const surveysGrid = page.getByTestId('surveys-grid');
    await expect(surveysGrid).toBeVisible({ timeout: 15000 });

    // --- Step 3: Click the first available survey ---
    const firstSurveyButton = surveysGrid.getByRole('button').first();
    await firstSurveyButton.click();
    await page.waitForURL('**/survey/**');

    // --- Step 4: Navigate to the NIN question ---
    // The form filler shows one question per screen. The NIN question may not be first
    // (consent_marketplace is typically first). Navigate forward until we find the NIN input.
    const ninInput = page.getByTestId('input-nin');
    const continueBtn = page.getByTestId('continue-btn');

    // Navigate through questions until NIN field is visible (max 20 questions)
    for (let i = 0; i < 20; i++) {
      if (await ninInput.isVisible().catch(() => false)) break;

      // Fill required fields to advance (consent questions need 'yes')
      const currentTextbox = page.getByRole('textbox').first();
      if (await currentTextbox.isVisible().catch(() => false)) {
        await currentTextbox.fill('test');
      } else {
        const currentSelect = page.getByRole('combobox').first();
        if (await currentSelect.isVisible().catch(() => false)) {
          await currentSelect.selectOption({ index: 0 }).catch(() => {});
        }
      }

      // Check for select_one radio buttons (consent questions)
      const yesOption = page.getByRole('radio', { name: /yes/i });
      if (await yesOption.isVisible().catch(() => false)) {
        await yesOption.click();
      }

      await continueBtn.click();
      // Brief wait for slide animation
      await page.waitForTimeout(200);
    }

    // Assert we found the NIN field
    await expect(ninInput).toBeVisible({ timeout: 5000 });

    // --- Step 5: Enter an INVALID NIN and verify error ---
    // 12345678902 is 11 digits but fails modulus11 checksum
    await ninInput.fill('12345678902');
    await continueBtn.click();

    // Validation error should appear as role="alert"
    const errorAlert = page.getByRole('alert');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
    await expect(errorAlert).toContainText(/NIN|invalid/i);

    // Continue button should be disabled while error is shown
    await expect(continueBtn).toBeDisabled();

    // --- Step 6: Clear and enter a VALID NIN, verify error clears ---
    // 61961438053 passes modulus11 check
    await ninInput.fill('61961438053');

    // Error should disappear (onChange clears validationError)
    await expect(errorAlert).not.toBeVisible({ timeout: 5000 });

    // Continue button should be re-enabled
    await expect(continueBtn).toBeEnabled();

    // --- Step 7: Verify the green checkmark appears for valid input ---
    const validIndicator = page.getByLabel('Valid');
    await expect(validIndicator).toBeVisible();
  });
});

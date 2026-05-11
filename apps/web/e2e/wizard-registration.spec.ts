import { test, expect } from '@playwright/test';

/**
 * Story 9-12 AC#13 — Public Registration Wizard + Pending-NIN + Magic-Link E2E.
 *
 * Coverage required by AC#13:
 *   - Complete wizard with NIN (happy path)
 *   - Complete wizard pending-NIN, then complete via magic link from email
 *   - Existing public_user login still works post-migration
 *
 * Spec layout follows the project convention established by
 * `nin-validation.spec.ts`: lightweight assertions that don't depend on the
 * full stack stay active; full-stack flows are `test.skip()` with detailed
 * preconditions + re-enable notes. CI today does not provision a published
 * native form, the system_settings `wizard.public_form_id` pin, working
 * Resend deliverability, or a seeded `public@dev.local` account — those are
 * the gates that unlock the skipped tests.
 *
 * Selector rules (Team Agreement A3):
 *   1. page.getByRole()   — semantic roles (preferred)
 *   2. page.getByLabel()  — form fields
 *   3. page.getByText()   — visible text
 *   4. page.getByTestId() — only when above insufficient
 *
 * @see Story 9-12 Task 11.1
 */

test.describe('Story 9-12 — Public Registration Wizard (smoke-level)', () => {
  test('login page (public mode) shows cutover banner + existing-user header', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);

    const banner = page.getByTestId('login-page-cutover-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/new here/i);
    await expect(banner).toContainText(/registration wizard/i);

    const cutoverLink = page.getByTestId('login-page-cutover-link');
    await expect(cutoverLink).toBeVisible();
    await expect(cutoverLink).toHaveAttribute('href', '/register');

    await expect(page.getByTestId('login-page-existing-user-header')).toContainText(
      /already registered/i,
    );

    // Existing-user login form is still visible below the banner.
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  });

  test('staff login does NOT show the public cutover banner', async ({ page }) => {
    await page.goto('/staff/login');
    await expect(page).toHaveURL(/\/staff\/login/);

    await expect(page.getByTestId('login-page-cutover-banner')).toHaveCount(0);
    await expect(page.getByTestId('login-page-existing-user-header')).toHaveCount(0);

    // Staff login form still renders.
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  });

  test('/register mounts the wizard at Step 1 with all 5 step labels', async ({ page }) => {
    await page.goto('/register');
    await expect(page).toHaveURL(/\/register/);

    // Layout chrome: sticky step indicator + trust-badges row.
    await expect(page.getByTestId('wizard-layout-step-indicator')).toBeVisible();
    await expect(page.getByTestId('trust-badges-row').first()).toBeVisible();

    // Step indicator lists all 5 steps; the wizard mounts at index 0 by default.
    const indicator = page.getByTestId('wizard-step-indicator');
    await expect(indicator).toBeVisible();
    for (const idx of [0, 1, 2, 3, 4]) {
      await expect(page.getByTestId(`wizard-step-${idx}`)).toBeVisible();
    }

    // Step 1 form is rendered; auto-focus lands on the full-name input.
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();
    await expect(page.getByTestId('wizard-full-name')).toBeFocused();
    await expect(page.getByRole('heading', { level: 2 })).toContainText(/tell us about yourself/i);
  });

  test('/register/complete-nin shows token-missing banner when no ?token is supplied', async ({
    page,
  }) => {
    await page.goto('/register/complete-nin');

    // Page chrome renders.
    await expect(page.getByTestId('complete-nin-card')).toBeVisible();
    await expect(page.getByRole('heading', { name: /add your nin/i })).toBeVisible();
    await expect(page.getByTestId('complete-nin-input')).toBeVisible();

    // Token-missing affordance is announced.
    await expect(page.getByTestId('complete-nin-token-missing')).toBeVisible();
    await expect(page.getByTestId('complete-nin-token-missing')).toContainText(
      /missing its token/i,
    );

    // Save button is present but the page guards on token-missing at click time
    // (handled in handleSave). Defer button is also present.
    await expect(page.getByTestId('complete-nin-save')).toBeVisible();
    await expect(page.getByTestId('complete-nin-defer')).toBeVisible();
  });

  test('/register/complete renders civic-framing card + sign-in and marketplace CTAs', async ({
    page,
  }) => {
    await page.goto('/register/complete?source=pending_nin');

    await expect(page.getByTestId('registration-complete-card')).toBeVisible();
    await expect(page.getByTestId('registration-complete-headline')).toContainText(
      /your registration is now complete/i,
    );
    await expect(page.getByTestId('registration-complete-signin')).toHaveAttribute(
      'href',
      '/login',
    );
    await expect(page.getByTestId('registration-complete-marketplace')).toHaveAttribute(
      'href',
      '/marketplace',
    );

    // Default headline (no ?source) reads "Registration complete".
    await page.goto('/register/complete');
    await expect(page.getByTestId('registration-complete-headline')).toContainText(
      /^registration complete$/i,
    );
  });
});

test.describe('Story 9-12 — Public Registration Wizard (full-stack flows)', () => {
  /**
   * SKIPPED 2026-05-11: requires full stack with:
   *   - API + DB + Redis + Web running
   *   - `system_settings.wizard.public_form_id` pinned to a published form whose
   *     schema has NO NIN question (drives State C — wizard owns NIN input).
   *     Set via the Super-Admin Settings landing OR seeded directly:
   *
   *       INSERT INTO system_settings (key, value) VALUES
   *         ('wizard.public_form_id', '"<form-id>"'::jsonb)
   *       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
   *
   *   - 33 Oyo LGAs seeded (already covered by `db:seed`)
   *   - Resend / email service either live OR mocked to a console adapter so
   *     the post-submit magic-link fetch returns 200 without bouncing the test
   *     on email-rate-limit.
   *
   * Re-enable by:
   *   1. Adding a NIN-less native form seed in `apps/api/src/db/seeds/` (likely a
   *      new `wizard-public-form.seed.ts` module) and wiring it into
   *      `apps/api/src/db/seeds/index.ts`.
   *   2. Seeding the `wizard.public_form_id` setting to that form's id.
   *   3. Removing the `.skip` below.
   *
   * The test exercises the State C dispatcher path (`step5-state-c`) — see
   * `apps/web/src/features/registration/pages/Step5NinInput.tsx` for the
   * spec contract being asserted.
   */
  test.skip('completes wizard happy path with NIN (State C, no questionnaire NIN)', async ({
    page,
  }) => {
    const uniq = Date.now();
    const respondentEmail = `e2e-wizard-${uniq}@example.test`;
    const respondentPhone = '08012345678';
    const respondentNin = '61961438053'; // passes modulus-11 (matches nin-validation.spec.ts).

    // --- Step 1: Basic Info ---
    await page.goto('/register');
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();
    await page.getByTestId('wizard-full-name').fill(`E2E Test ${uniq}`);
    await page.getByTestId('wizard-dob').fill('1990-01-15');
    await page.getByRole('radio', { name: 'Prefer not to say' }).click();
    await page.getByTestId('wizard-nav-continue').click();

    // --- Step 2: Contact + LGA ---
    await expect(page.getByTestId('step2-contact-lga')).toBeVisible();
    await page.getByTestId('wizard-phone').fill(respondentPhone);
    await page.getByTestId('wizard-email').fill(respondentEmail);
    // Wait for the LGA dropdown to populate before selecting.
    const lgaSelect = page.getByTestId('wizard-lga');
    await expect(lgaSelect).toBeEnabled({ timeout: 15000 });
    await lgaSelect.selectOption({ index: 1 });
    await page.getByTestId('wizard-nav-continue').click();

    // --- Step 3: Consent ---
    await expect(page.getByTestId('step3-consent')).toBeVisible();
    await page.getByTestId('consent-marketplace-no').click();
    await page.getByTestId('wizard-nav-continue').click();

    // --- Step 4: Questionnaire (preconditioned to be a NIN-less form) ---
    // Advance through whatever questions the published form contains. The test
    // is precondition-coupled to the seeded form's shape — see Re-enable above.
    // For a minimal NIN-less form, a single Continue should advance to Step 5.
    // For a longer form, this loop tolerates up to 30 questions of advance.
    for (let i = 0; i < 30; i++) {
      // Step 5 is reached when the State-C dispatcher is mounted.
      if (await page.getByTestId('step5-state-c').isVisible().catch(() => false)) break;
      // Best-effort fill: type "n/a" into any textbox, click first radio if present,
      // then Continue. This is brittle on purpose — the seeded form should be a
      // single text question whose answer is irrelevant to the wizard outcome.
      const textbox = page.getByRole('textbox').first();
      if (await textbox.isVisible().catch(() => false)) {
        await textbox.fill('n/a');
      }
      const continueBtn = page.getByTestId('continue-btn').or(
        page.getByTestId('wizard-nav-continue'),
      );
      await continueBtn.first().click();
      await page.waitForTimeout(200); // slide animation
    }

    // --- Step 5: NIN + Auth (State C — wizard owns NIN input) ---
    await expect(page.getByTestId('step5-state-c')).toBeVisible();
    await page.getByTestId('wizard-nin-input').fill(respondentNin);
    await expect(page.getByTestId('wizard-nin-valid')).toBeVisible();
    await expect(page.getByTestId('wizard-nav-continue')).toContainText(/submit registration/i);

    // Submit.
    await page.getByTestId('wizard-nav-continue').click();

    // --- Completion ---
    await expect(page.getByTestId('wizard-complete')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: /registration complete/i })).toBeVisible();
    await expect(page.getByTestId('wizard-complete-id')).toContainText(/reference id/i);
  });

  /**
   * SKIPPED 2026-05-11: same preconditions as the happy-path test above, plus
   * the magic-link email flow needs an inspectable inbox (Resend `from` is
   * `noreply@oyoskills.com` in prod; for E2E, mock or intercept the magic-link
   * issuance to extract the plaintext token from the test fixture rather than
   * scraping email).
   *
   * Re-enable strategy:
   *   1. Same seed work as the happy-path test.
   *   2. Add a test-only endpoint OR a Drizzle query helper that reads the
   *      most-recent `magic_link_tokens` row for a given email+purpose, then
   *      reconstruct the plaintext token from the stored hash (impossible —
   *      SHA-256 is one-way). The pragmatic alternative is to wire an in-memory
   *      EmailService stub that captures issued links into a Playwright-readable
   *      sink (e.g. a `/test/email-sink` route mounted only when `NODE_ENV=test`).
   *   3. Remove the `.skip` below once that infrastructure exists.
   */
  test.skip('completes wizard pending-NIN flow, then resumes via magic link', async ({
    page,
  }) => {
    const uniq = Date.now();
    const respondentEmail = `e2e-pending-${uniq}@example.test`;

    // --- Steps 1-3: same as happy path (Basic Info + Contact + Consent) ---
    await page.goto('/register');
    await page.getByTestId('wizard-full-name').fill(`Pending Test ${uniq}`);
    await page.getByTestId('wizard-dob').fill('1995-06-20');
    await page.getByRole('radio', { name: 'Female' }).click();
    await page.getByTestId('wizard-nav-continue').click();

    await expect(page.getByTestId('step2-contact-lga')).toBeVisible();
    await page.getByTestId('wizard-phone').fill('08087654321');
    await page.getByTestId('wizard-email').fill(respondentEmail);
    const lgaSelect = page.getByTestId('wizard-lga');
    await expect(lgaSelect).toBeEnabled({ timeout: 15000 });
    await lgaSelect.selectOption({ index: 1 });
    await page.getByTestId('wizard-nav-continue').click();

    await expect(page.getByTestId('step3-consent')).toBeVisible();
    await page.getByTestId('consent-marketplace-no').click();
    await page.getByTestId('wizard-nav-continue').click();

    // --- Step 4: advance through questionnaire (NIN-less form precondition) ---
    for (let i = 0; i < 30; i++) {
      if (await page.getByTestId('step5-state-c').isVisible().catch(() => false)) break;
      const textbox = page.getByRole('textbox').first();
      if (await textbox.isVisible().catch(() => false)) {
        await textbox.fill('n/a');
      }
      const continueBtn = page.getByTestId('continue-btn').or(
        page.getByTestId('wizard-nav-continue'),
      );
      await continueBtn.first().click();
      await page.waitForTimeout(200);
    }

    // --- Step 5: enable pending-NIN toggle ---
    await expect(page.getByTestId('step5-state-c')).toBeVisible();
    const pendingToggle = page.getByRole('switch', {
      name: /don'?t have my nin with me right now/i,
    });
    await pendingToggle.click();
    await expect(pendingToggle).toHaveAttribute('aria-checked', 'true');

    // NIN input is now disabled; submit label flips to "Save as Pending".
    await expect(page.getByTestId('wizard-nin-input')).toBeDisabled();
    await expect(page.getByTestId('wizard-nav-continue')).toContainText(/save as pending/i);
    await page.getByTestId('wizard-nav-continue').click();

    // --- Completion (pending-NIN copy) ---
    await expect(page.getByTestId('wizard-complete')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: /saved as pending/i })).toBeVisible();
    await expect(page.getByTestId('wizard-complete')).toContainText(
      /remind you in 2 days, 7 days, and 14 days/i,
    );

    // --- Cross-device resume via pending_nin_complete magic link ---
    // The token needs to come from the email-sink fixture (see SKIPPED note).
    // Once the fixture exists, this branch hits /register/complete-nin?token=…
    // and asserts the NIN-save success path.
    const token = process.env.E2E_PENDING_NIN_TOKEN; // injected by fixture
    test.skip(!token, 'pending-NIN magic-link token fixture not wired');
    await page.goto(`/register/complete-nin?token=${token}`);
    await expect(page.getByTestId('complete-nin-card')).toBeVisible();
    await page.getByTestId('complete-nin-input').fill('61961438053');
    await page.getByTestId('complete-nin-save').click();

    // Redirected to /register/complete with civic-framing copy.
    await page.waitForURL(/\/register\/complete/);
    await expect(page.getByTestId('registration-complete-headline')).toContainText(
      /your registration is now complete/i,
    );
  });

  /**
   * SKIPPED 2026-05-11: requires a pre-seeded `public@dev.local` account in the
   * test database. AC#11 contract: existing `public_users` accounts continue to
   * work — login at `/login` with the seeded credentials succeeds despite the
   * wizard cutover. The cutover banner is shown above the form but does NOT
   * prevent the existing-user login path.
   *
   * Re-enable by:
   *   1. Adding `public@dev.local` to the dev-seed user orchestrator.
   *   2. Removing the `.skip` below.
   *
   * NOTE: hCaptcha auto-bypass via `VITE_E2E=true` (component calls onVerify
   * on mount) — see `nin-validation.spec.ts` line 38 for precedent.
   */
  test.skip('existing public_user login still works post-migration', async ({ page }) => {
    await page.goto('/login');

    // Cutover banner is present but the existing user can still sign in below it.
    await expect(page.getByTestId('login-page-cutover-banner')).toBeVisible();

    await page.getByLabel('Email Address').fill(
      process.env.E2E_PUBLIC_EMAIL ?? 'public@dev.local',
    );
    await page.getByLabel('Password', { exact: true }).fill(
      process.env.E2E_PUBLIC_PASSWORD ?? 'public123',
    );

    // hCaptcha auto-bypassed via VITE_E2E=true (component calls onVerify on mount).
    await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();
    await page.getByRole('button', { name: /sign in/i }).click();

    // Successful login lands on the dashboard.
    await page.waitForURL('**/dashboard/**', { timeout: 15000 });
  });
});

import { test, expect } from '@playwright/test';
import { readWizardResumeFixture } from './helpers/wizard-resume-fixture';

/**
 * Story 9-12 + Story 9-18 — Public Registration Wizard E2E.
 *
 * Updated for the 9-18 redesign:
 *   - Part A: NIN captured at Step 1 (not the retired Step-5 dispatcher).
 *   - Part F: Step 1 collects Given name + Family name (no single "Full Name").
 *   - Part C: Step 5 is a Review-and-Save summary (no auth-choice).
 *   - Part E: the survey is section-as-step — the wizard has 3 fixed head steps
 *     + one step per form section + Review (N steps; 11 for the 7-section form).
 *
 * Spec layout follows the project convention: smoke-level assertions that only
 * need the app rendering stay active; full-stack flows are `test.skip()` with
 * detailed preconditions + re-enable notes. CI still does not provision a
 * published native form, the `wizard.public_form_id` pin, an inspectable email
 * sink, or a seeded public account — those gate the skipped tests.
 *
 * Selector rules (Team Agreement A3): getByRole > getByLabel > getByText >
 * getByTestId.
 *
 * @see Story 9-18 Tasks 6.5 / AC#D5 / AC#E8
 */

test.describe('Public Registration Wizard (smoke-level)', () => {
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
  });

  test('staff login does NOT show the public cutover banner', async ({ page }) => {
    await page.goto('/staff/login');
    await expect(page).toHaveURL(/\/staff\/login/);
    await expect(page.getByTestId('login-page-cutover-banner')).toHaveCount(0);
    await expect(page.getByTestId('login-page-existing-user-header')).toHaveCount(0);
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  });

  test('/register mounts the wizard at Step 1 — NIN-first + given/family name (9-18)', async ({
    page,
  }) => {
    await page.goto('/register');
    await expect(page).toHaveURL(/\/register/);

    // Layout chrome.
    await expect(page.getByTestId('wizard-layout-step-indicator')).toBeVisible();

    // Step 1 form renders; auto-focus lands on the NIN input (Part A — NIN is
    // now the first field).
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();
    await expect(page.getByTestId('wizard-step1-nin-input')).toBeFocused();

    // Part F — given + family name replace the retired single "Full Name".
    await expect(page.getByTestId('wizard-step1-given-name')).toBeVisible();
    await expect(page.getByTestId('wizard-step1-family-name')).toBeVisible();
    await expect(page.getByTestId('wizard-full-name')).toHaveCount(0);

    await expect(page.getByRole('heading', { level: 2 })).toContainText(/tell us about yourself/i);

    // NOTE (review L1): we deliberately do NOT assert per-step `wizard-step-N`
    // breadcrumb items. Those render only in the breadcrumb variant (≤6 steps);
    // the indicator switches to a compact line at >6 steps. The moment a
    // multi-section form is pinned in CI — exactly the step that un-skips the
    // full-stack flows below — the wizard has 11 steps → compact → no
    // `wizard-step-N`, which would silently break THIS active test. The indicator
    // container (asserted above) + the Step-1 content is the mode-agnostic
    // "mounted at Step 1" assertion that survives both variants.
  });

  test('Step 1 Continue is gated until the NIN is valid (or pending) — client-side', async ({
    page,
  }) => {
    await page.goto('/register');
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();

    // Empty NIN → Continue disabled + validation summary shown.
    await expect(page.getByTestId('wizard-nav-continue')).toBeDisabled();
    await expect(page.getByTestId('step1-validation-summary')).toBeVisible();

    // Story 13-15 — a well-formed 11-digit NIN that fails the (retired) Mod-11
    // checksum is now ACCEPTED (format-only; NINs are random, no check digit).
    // No "invalid" state renders; Continue stays disabled here only because the
    // OTHER required Step-1 fields are still empty. (NIN format-only coverage is
    // in nin-validation.spec.ts.)
    await page.getByTestId('wizard-step1-nin-input').fill('12345678910');
    await expect(page.getByTestId('wizard-step1-nin-invalid')).toHaveCount(0);
    await expect(page.getByTestId('wizard-nav-continue')).toBeDisabled();

    // Pressing the pending-NIN toggle disables the NIN input + reveals the
    // consequence card (the gate is satisfied by "pending").
    await page.getByTestId('pending-nin-toggle').click();
    await expect(page.getByTestId('wizard-step1-nin-input')).toBeDisabled();
    await expect(page.getByTestId('pending-nin-consequence')).toBeVisible();
  });

  test('/register/complete-nin shows token-missing banner when no ?token is supplied', async ({
    page,
  }) => {
    await page.goto('/register/complete-nin');
    await expect(page.getByTestId('complete-nin-card')).toBeVisible();
    await expect(page.getByTestId('complete-nin-token-missing')).toBeVisible();
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
    await expect(page.getByTestId('registration-complete-signin')).toHaveAttribute('href', '/login');
    await expect(page.getByTestId('registration-complete-marketplace')).toHaveAttribute(
      'href',
      '/marketplace',
    );
  });
});

test.describe('Public Registration Wizard — URL navigation (Story 9-57)', () => {
  // The URL (`?step=N`) is the single source of truth for the current step.
  // The clamp + back/forward flows need only the app rendering (the form fetch
  // 404s → survey skipped → 4-step head model). The resume + autosave flows
  // (AC5.2a/b) additionally exercise the real draft autosave + a `wizard_resume`
  // token minted by the `wizard-resume-setup` project — i.e. they DO write a
  // draft to the DB. All run against the full stack the e2e CI job provisions.
  const VALID_NIN = '61961438053'; // passes Modulus 11

  test('deep-link beyond the furthest-reached step clamps to Step 1 + self-corrects the URL (AC4.1)', async ({
    page,
  }) => {
    await page.goto('/register?step=2');
    // Fresh visitor has reached only step 0 → the over-reaching deep-link lands
    // on Step 1 and the stale `?step=2` is rewritten down so it can't be reshared.
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();
    await expect(page).toHaveURL(/[?&]step=0\b/);
  });

  test('browser back/forward moves between visited steps (AC4.3 / AC5.2d)', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();
    await expect(page).toHaveURL(/[?&]step=0\b/);

    // Fill Step 1 enough to advance to Step 2 (client-side validation only —
    // contact/email is Step 2, so no autosave/DB write happens here).
    await page.getByTestId('wizard-step1-nin-input').fill(VALID_NIN);
    await expect(page.getByTestId('wizard-step1-nin-valid')).toBeVisible();
    await page.getByTestId('wizard-step1-given-name').fill('Nav');
    await page.getByTestId('wizard-step1-family-name').fill('Tester');
    await page.getByTestId('wizard-dob').fill('1990-01-15');
    await page.getByRole('radio', { name: 'Prefer not to say' }).click();
    await page.getByTestId('wizard-nav-continue').click();

    await expect(page.getByTestId('step2-contact-lga')).toBeVisible();
    await expect(page).toHaveURL(/[?&]step=1\b/);

    // Browser BACK → Step 1 (push-per-user-nav makes this a real history move).
    await page.goBack();
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();
    await expect(page).toHaveURL(/[?&]step=0\b/);

    // Browser FORWARD → Step 2 again (within the reached range, not clamped).
    await page.goForward();
    await expect(page.getByTestId('step2-contact-lga')).toBeVisible();
    await expect(page).toHaveURL(/[?&]step=1\b/);
  });

  // ── AC5.2a / AC5.2b — resume + autosave (AI-Review M1, no longer skipped) ──
  //
  // Previously test.skip() for lack of a `wizard_resume` token in CI. They now
  // RUN: the `wizard-resume-setup` project mints a token per test (the REAL
  // MagicLinkService.issueToken, via a test-only api script) into a fixture,
  // and the draft is created by the wizard's OWN autosave during the test. The
  // survey-skipped 4-step model (basics/contact/consent/review) is sufficient —
  // landing on Consent (index 2) exercises the full resume-seed + clamp +
  // write-only-persistence machinery without needing a pinned multi-section
  // form (the section-step variant is covered by the WizardPage unit tests).

  async function fillStep1ToContact(page: import('@playwright/test').Page) {
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();
    await page.getByTestId('wizard-step1-nin-input').fill(VALID_NIN);
    await expect(page.getByTestId('wizard-step1-nin-valid')).toBeVisible();
    await page.getByTestId('wizard-step1-given-name').fill('Resume');
    await page.getByTestId('wizard-step1-family-name').fill('Tester');
    await page.getByTestId('wizard-dob').fill('1990-01-15');
    await page.getByRole('radio', { name: 'Prefer not to say' }).click();
    await page.getByTestId('wizard-nav-continue').click();
    await expect(page.getByTestId('step2-contact-lga')).toBeVisible();
  }

  /**
   * Fill Step 2 (sets email → starts the 2s autosave), advance to Consent
   * (index 2 → persisted as server `currentStep=3`), and await the autosave PUT
   * that actually persists that step — so a subsequent token-resume is
   * guaranteed to find the draft at Consent, not at an earlier step.
   */
  async function fillStep2ToConsentAndAwaitSave(
    page: import('@playwright/test').Page,
    email: string,
  ) {
    await page.getByTestId('wizard-phone').fill('08012345678');
    await page.getByTestId('wizard-email').fill(email);
    const lga = page.getByTestId('wizard-lga');
    await expect(lga).toBeEnabled({ timeout: 15000 });
    await lga.selectOption({ index: 1 });

    // Arm the wait BEFORE navigating: the consent-step autosave persists
    // currentStep=3 (1-indexed). Field-level saves on Step 2 carry currentStep=2,
    // so filter on ===3 to pin the assertion to the Consent-step persistence.
    const consentStepPersisted = page.waitForResponse(
      (r) => {
        if (!r.url().includes('/registration/draft') || r.request().method() !== 'PUT' || !r.ok()) {
          return false;
        }
        try {
          return JSON.parse(r.request().postData() ?? '{}').currentStep === 3;
        } catch {
          return false;
        }
      },
      { timeout: 15000 },
    );

    await page.getByTestId('wizard-nav-continue').click();
    await expect(page.getByTestId('step3-consent')).toBeVisible();
    await expect(page).toHaveURL(/[?&]step=2\b/);
    await consentStepPersisted;
  }

  test('cross-device resume lands on the saved step (AC5.2a)', async ({ browser }) => {
    const { resume } = readWizardResumeFixture();

    // Device 1 — create + autosave a draft, advancing to the Consent step.
    const device1 = await browser.newContext();
    const p1 = await device1.newPage();
    await p1.goto('/register');
    await fillStep1ToContact(p1);
    await fillStep2ToConsentAndAwaitSave(p1, resume.email);
    await device1.close();

    // Device 2 — a BRAND-NEW context (no shared storage/cookies = a different
    // device) resumes via the magic-link token and must land on the saved step.
    const device2 = await browser.newContext();
    const p2 = await device2.newPage();
    await p2.goto(`/register?token=${resume.token}`);
    await expect(p2.getByTestId('step3-consent')).toBeVisible();
    await expect(p2).toHaveURL(/[?&]step=2\b/);
    await device2.close();
  });

  test('autosave persists the current step across a reload (AC5.2b)', async ({ page }) => {
    const { reload } = readWizardResumeFixture();

    await page.goto('/register');
    await fillStep1ToContact(page);
    await fillStep2ToConsentAndAwaitSave(page, reload.email);

    // A fresh load via the resume token must rehydrate on the saved Consent step
    // (proves the autosaved step survives a full document reload, not just SPA nav).
    await page.goto(`/register?token=${reload.token}`);
    await expect(page.getByTestId('step3-consent')).toBeVisible();
    await expect(page).toHaveURL(/[?&]step=2\b/);
  });
});

test.describe('Public Registration Wizard (full-stack flows)', () => {
  /**
   * SKIPPED — requires the full stack PLUS:
   *   - `system_settings.wizard.public_form_id` pinned to a PUBLISHED native form
   *     with SECTIONS (drives the section-as-step flow, AC#E1). Seed via:
   *       INSERT INTO system_settings (key, value)
   *       VALUES ('wizard.public_form_id', '"<form-id>"'::jsonb)
   *       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
   *   - 33 Oyo LGAs (db:seed) + an email sink (or console adapter) for the
   *     post-submit magic-link.
   *
   * Re-enable: add a published multi-section native form seed
   * (apps/api/src/db/seeds/wizard-public-form.seed.ts), pin it, wire an
   * `/test/email-sink` route under NODE_ENV=test, then drop the `.skip`.
   */
  const VALID_NIN = '61961438053'; // passes Modulus 11

  async function fillStep1Identity(page: import('@playwright/test').Page, uniq: number) {
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();
    await page.getByTestId('wizard-step1-nin-input').fill(VALID_NIN);
    await expect(page.getByTestId('wizard-step1-nin-valid')).toBeVisible();
    await page.getByTestId('wizard-step1-given-name').fill(`Kayode${uniq}`);
    await page.getByTestId('wizard-step1-family-name').fill('Olowu');
    await page.getByTestId('wizard-dob').fill('1990-01-15');
    await page.getByRole('radio', { name: 'Prefer not to say' }).click();
    await page.getByTestId('wizard-nav-continue').click();
  }

  async function fillStep2Contact(page: import('@playwright/test').Page, email: string) {
    await expect(page.getByTestId('step2-contact-lga')).toBeVisible();
    await page.getByTestId('wizard-phone').fill('08012345678');
    await page.getByTestId('wizard-email').fill(email);
    const lga = page.getByTestId('wizard-lga');
    await expect(lga).toBeEnabled({ timeout: 15000 });
    await lga.selectOption({ index: 1 });
    await page.getByTestId('wizard-nav-continue').click();
  }

  /**
   * Walk the section steps until the Review summary appears (AC#E8).
   *
   * CAVEAT (un-skip checklist, review observation): this fills `'n/a'` into every
   * textbox + clicks the first radio. The real 7-section form has integer /
   * select_one / geopoint + required questions that `'n/a'` won't satisfy — so
   * when these flows are un-skipped against the seeded multi-section form, give
   * this per-question-type handling (numbers, selects, the GPS step) or the
   * 40-iteration cap will exit before reaching Review.
   */
  async function walkSectionsToReview(page: import('@playwright/test').Page) {
    for (let i = 0; i < 40; i++) {
      if (await page.getByTestId('step5-review-and-save').isVisible().catch(() => false)) break;
      // Section steps render one question at a time via FormRenderer.
      const textbox = page.getByRole('textbox').first();
      if (await textbox.isVisible().catch(() => false)) await textbox.fill('n/a');
      const radio = page.getByRole('radio').first();
      if (await radio.isVisible().catch(() => false)) await radio.click().catch(() => {});
      const next = page.getByTestId('continue-btn').or(page.getByTestId('wizard-nav-continue'));
      await next.first().click();
      await page.waitForTimeout(150);
    }
  }

  test.skip('completes the wizard happy path (NIN at Step 1 → sections → Review → Save)', async ({
    page,
  }) => {
    const uniq = Date.now();
    await page.goto('/register');
    await fillStep1Identity(page, uniq);
    await fillStep2Contact(page, `e2e-wizard-${uniq}@example.test`);

    // Step 3: consent.
    await expect(page.getByTestId('step3-consent')).toBeVisible();
    await page.getByTestId('consent-marketplace-no').click();
    await page.getByTestId('wizard-nav-continue').click();

    // Section steps → Review.
    await walkSectionsToReview(page);

    // Step 5 — Review-and-Save (Part C). NIN shows in the summary; the save
    // button reads "Save Registration".
    await expect(page.getByTestId('step5-review-and-save')).toBeVisible();
    await expect(page.getByTestId('step5-nin')).toContainText(/\d/);
    await expect(page.getByTestId('wizard-save-button')).toContainText(/save registration/i);
    await page.getByTestId('wizard-save-button').click();

    // Completion — magic-link confirmation copy (AC#C4).
    await expect(page.getByTestId('wizard-complete')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('wizard-complete')).toContainText(/one-click link/i);
  });

  test.skip('completes the wizard pending-NIN path → "Save as Pending" + pending copy', async ({
    page,
  }) => {
    const uniq = Date.now();
    await page.goto('/register');

    // Step 1 — choose pending-NIN instead of entering one.
    await expect(page.getByTestId('step1-basic-info')).toBeVisible();
    await page.getByTestId('pending-nin-toggle').click();
    await expect(page.getByTestId('wizard-step1-nin-input')).toBeDisabled();
    await page.getByTestId('wizard-step1-given-name').fill(`Pending${uniq}`);
    await page.getByTestId('wizard-step1-family-name').fill('Test');
    await page.getByTestId('wizard-dob').fill('1995-06-20');
    await page.getByRole('radio', { name: 'Female' }).click();
    await page.getByTestId('wizard-nav-continue').click();

    await fillStep2Contact(page, `e2e-pending-${uniq}@example.test`);
    await expect(page.getByTestId('step3-consent')).toBeVisible();
    await page.getByTestId('consent-marketplace-no').click();
    await page.getByTestId('wizard-nav-continue').click();

    await walkSectionsToReview(page);

    // Review shows the pending badge; save label flips to "Save as Pending".
    await expect(page.getByTestId('step5-nin-pending')).toBeVisible();
    await expect(page.getByTestId('wizard-save-button')).toContainText(/save as pending/i);
    await page.getByTestId('wizard-save-button').click();

    await expect(page.getByTestId('wizard-complete')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('wizard-complete')).toContainText(
      /one-click link to add your NIN whenever you're ready/i,
    );
  });

  /**
   * SKIPPED (AC#E8) — section-as-step walk + section-skip. Needs a pinned form
   * whose schema has at least one section gated OFF by a `showWhen` so the
   * wizard auto-skips it (greyed in the indicator). Asserts the compact
   * "Step N of M — <Section>" indicator across the walk.
   */
  test.skip('section-as-step: indicator shows N steps + auto-skips an empty section (AC#E8)', async ({
    page,
  }) => {
    const uniq = Date.now();
    await page.goto('/register');
    await fillStep1Identity(page, uniq);
    await fillStep2Contact(page, `e2e-sections-${uniq}@example.test`);
    await expect(page.getByTestId('step3-consent')).toBeVisible();
    await page.getByTestId('consent-marketplace-no').click();
    await page.getByTestId('wizard-nav-continue').click();

    // First section step: the compact indicator shows "Step 4 of N — <title>".
    await expect(page.getByTestId('step4-questionnaire')).toBeVisible();
    await expect(page.getByTestId('wizard-step-current-label')).not.toBeEmpty();
    await expect(page.getByText(/Step 4 of \d+/)).toBeVisible();

    await walkSectionsToReview(page);
    await expect(page.getByTestId('step5-review-and-save')).toBeVisible();
  });

  /**
   * SKIPPED — needs a pre-seeded public account. Existing public_users keep
   * working post-cutover (login at /login).
   */
  test.skip('existing public_user login still works post-migration', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-page-cutover-banner')).toBeVisible();
    await page.getByLabel('Email Address').fill(process.env.E2E_PUBLIC_EMAIL ?? 'public@dev.local');
    await page.getByLabel('Password', { exact: true }).fill(
      process.env.E2E_PUBLIC_PASSWORD ?? 'public123',
    );
    await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/dashboard/**', { timeout: 15000 });
  });
});

import { test, expect } from '@playwright/test';

/**
 * Golden Path E2E Tests — OSLSR Native Form System
 *
 * These tests prove the end-to-end data flow:
 *   Form Creation → Form Filling → Submission → Database → Dashboard
 *
 * Each test starts as `test.fixme()` (stub) and is enabled progressively
 * as the corresponding Epic 3+ stories are completed.
 *
 * Selector rules (Team Agreement A3):
 *   1. page.getByRole()   — semantic roles (preferred)
 *   2. page.getByLabel()  — form fields
 *   3. page.getByText()   — visible text
 *   4. page.getByTestId() — only when above insufficient
 *
 * @see prep-7-e2e-golden-path-spec.md for full specification
 * @see ADR-014 Ironclad Pipeline — Golden Path = Layer 1 (Blocking)
 */

test.describe('Golden Path: Admin Form Lifecycle', () => {
  /**
   * GP-1: Admin creates & publishes form
   *
   * **Proves:** Form Builder → DB (questionnaire_forms table)
   * **Unlocked after:** Story 2.10 (done) — enabled as active test in Task 7
   *
   * **Preconditions:**
   * - Super Admin user authenticated (admin@dev.local / admin123)
   * - Full stack running (API + DB + Redis + Web)
   *
   * **Steps:**
   * 1. Login as Super Admin (inline — moves to auth-setup precondition when enabled)
   * 2. Navigate to Questionnaire Management page
   * 3. Click "Create New Form", enter title, click "Create"
   * 4. Verify redirect to Form Builder page
   * 5. Navigate to Sections tab, add a section with a text question
   * 6. Save the form schema
   * 7. Click "Publish", confirm in dialog
   * 8. Verify "Form published successfully" toast
   * 9. Navigate back to questionnaire list
   * 10. Verify form appears with "published" status badge
   *
   * **Expected outcomes:**
   * - questionnaire_forms row created with status='published', is_native=true
   * - form_schema JSONB contains sections and questions
   * - Form visible in questionnaire list with Published badge
   *
   * **Database assertions (after test):**
   * - questionnaire_forms.title = test form title
   * - questionnaire_forms.status = 'published'
   * - questionnaire_forms.is_native = true
   * - questionnaire_forms.form_schema = JSONB with sections + questions
   */
  // Phase 1: Enabled — Story 2.10 complete (Form Builder UI)
  test('GP-1: Admin creates and publishes a form', async ({ page }) => {
    const formTitle = `[E2E-GP1] Test Form ${Date.now()}`;
    // Cleanup: CI uses fresh test_db per run. Locally, [E2E-GP1] prefix marks test data for manual cleanup.

    // --- Step 1: Login as Super Admin ---
    await page.goto('/staff/login');
    await page.getByLabel('Email Address').fill(
      process.env.E2E_ADMIN_EMAIL ?? 'admin@dev.local',
    );
    await page.getByLabel('Password', { exact: true }).fill(
      process.env.E2E_ADMIN_PASSWORD ?? 'admin123',
    );

    // Complete hCaptcha verification (test keys auto-pass)
    const captchaFrame = page.frameLocator('iframe[title="Widget containing checkbox for hCaptcha security challenge"]');
    await captchaFrame.locator('#checkbox').click();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();

    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/dashboard/**');

    // --- Step 2: Navigate to Questionnaire Management ---
    // Use sidebar link instead of page.goto() to preserve SPA auth state
    await page.getByRole('link', { name: 'Questionnaires' }).click();
    await page.waitForURL('**/questionnaires');
    await expect(page.getByRole('heading', { name: /Questionnaire Management/i })).toBeVisible();

    // --- Step 3: Create new form via dialog ---
    await page.getByRole('button', { name: /Create New Form/i }).click();
    const createDialog = page.getByRole('alertdialog');
    await expect(createDialog).toBeVisible();
    await createDialog.getByPlaceholder('e.g. Oyo State Skills Survey').fill(formTitle);
    await createDialog.getByRole('button', { name: 'Create' }).click();

    // --- Step 4: Verify redirect to Form Builder ---
    await page.waitForURL('**/questionnaires/builder/**');
    await expect(page.getByText(formTitle)).toBeVisible();

    // --- Step 5: Add a section with a text question ---
    await page.getByRole('tab', { name: /Sections/i }).click();
    await page.getByRole('button', { name: /Add Section/i }).click();

    // Expand the new section accordion
    await page.getByRole('button', { name: /Untitled Section/i }).click();
    await page.getByPlaceholder('Section title').fill('Personal Information');

    // Add text question (type defaults to "text")
    await page.getByRole('button', { name: /Add Question/i }).click();
    // Expand the question card to reveal edit fields
    await page.getByText('Untitled question').click();
    await page.getByPlaceholder('question_name').fill('full_name');
    await page.getByPlaceholder('Question display text').fill('Full Name');

    // --- Step 6: Save form schema ---
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Form schema saved')).toBeVisible();

    // --- Step 7: Publish form ---
    await page.getByRole('button', { name: 'Publish' }).click();
    const publishDialog = page.getByRole('alertdialog');
    await expect(publishDialog).toBeVisible();
    await publishDialog.getByRole('button', { name: 'Publish' }).click();

    // --- Step 8: Verify publish success ---
    await expect(page.getByText('Form published successfully')).toBeVisible();

    // Verify Published badge appears on the builder page
    await expect(page.getByText('published').first()).toBeVisible();

    // --- Step 9: Navigate back to questionnaire list ---
    await page.getByRole('button', { name: /Back to Questionnaires/i }).click();
    await page.waitForURL('**/questionnaires');

    // --- Step 10: Verify form appears with Published status ---
    await expect(page.getByText(formTitle)).toBeVisible();
    const formRow = page.getByRole('row').filter({ hasText: formTitle });
    await expect(formRow.getByText('Published')).toBeVisible();
  });
});

test.describe('Golden Path: Admin Form Preview', () => {
  /**
   * GP-2: Admin previews published form (read-only sandbox)
   *
   * **Proves:** FormFillerPage reuse in read-only sandbox mode
   * **Unlocked after:** Story 3.1 + prep-8 (admin form preview AC)
   *
   * **Preconditions:**
   * - Super Admin user authenticated
   * - At least 1 published native form exists
   *
   * **Steps:**
   * 1. Navigate to Questionnaire Management page
   * 2. Find a published form in the list
   * 3. Click preview action on the form
   * 4. Verify FormFillerPage loads in read-only/sandbox mode
   * 5. Navigate through form sections (one-question-per-screen)
   * 6. Verify form controls are visible but submission is disabled/sandboxed
   *
   * **Expected outcomes:**
   * - FormFillerPage renders published form schema
   * - Preview mode prevents actual submission
   * - All question types render correctly
   */
  // Phase 2: Enable after Story 3.1 + prep-8
  test.fixme('GP-2: Admin previews published form in read-only sandbox', async ({ page }) => {
    // Blocked: Requires Story 3.1 (form renderer) + prep-8 (preview AC)
  });
});

test.describe('Golden Path: Enumerator Survey Flow', () => {
  /**
   * GP-3: Enumerator sees available surveys
   *
   * **Proves:** Dashboard → API integration (enumerator can view assigned surveys)
   * **Unlocked after:** Story 3.1
   *
   * **Preconditions:**
   * - Enumerator user authenticated (enumerator@dev.local / enum123)
   * - At least 1 published form exists
   * - Enumerator assigned to a valid LGA
   *
   * **Steps:**
   * 1. Login as enumerator
   * 2. Navigate to Enumerator Dashboard
   * 3. Verify available surveys section is visible
   * 4. Verify at least 1 published form appears in the survey list
   * 5. Verify form title and status are displayed
   *
   * **Expected outcomes:**
   * - Enumerator dashboard shows available surveys
   * - Published forms are visible and actionable
   * - Survey list matches forms assigned to enumerator's LGA
   */
  // Phase 2: Enable after Story 3.1
  test.fixme('GP-3: Enumerator sees available surveys on dashboard', async ({ page }) => {
    // Blocked: Requires Story 3.1 (form renderer + survey list on dashboard)
  });

  /**
   * GP-4: Enumerator fills form online (one-question-per-screen)
   *
   * **Proves:** Form Renderer → skip logic execution
   * **Unlocked after:** Story 3.1
   *
   * **Preconditions:**
   * - Enumerator user authenticated
   * - At least 1 published form with skip logic exists
   * - Enumerator assigned to valid LGA
   *
   * **Steps:**
   * 1. Navigate to enumerator dashboard
   * 2. Select a published survey to fill
   * 3. Verify one-question-per-screen renderer loads
   * 4. Fill in first question (text input)
   * 5. Click "Next" to advance
   * 6. Fill in select_one question that triggers skip logic
   * 7. Verify skipped question is not shown
   * 8. Complete remaining questions
   * 9. Submit the form
   * 10. Verify submission success feedback
   *
   * **Expected outcomes:**
   * - Form renders one question per screen
   * - Skip logic correctly hides/shows questions based on answers
   * - Submission is persisted to database
   */
  // Phase 2: Enable after Story 3.1
  test.fixme('GP-4: Enumerator fills form online with skip logic', async ({ page }) => {
    // Blocked: Requires Story 3.1 (native form renderer with one-question-per-screen)
  });
});

test.describe('Golden Path: Submission Pipeline', () => {
  /**
   * GP-5: Submission persisted to database
   *
   * **Proves:** POST /submissions → app_db (submissions table)
   * **Unlocked after:** Story 3.4
   *
   * **Preconditions:**
   * - Enumerator user authenticated
   * - A published form exists with known form_id
   * - Full stack with BullMQ processing available
   *
   * **Steps:**
   * 1. Login as enumerator
   * 2. Fill and submit a form (reuse GP-4 flow or API shortcut)
   * 3. Wait for submission processing (BullMQ job)
   * 4. Verify submission confirmation UI
   * 5. (API/DB check) Verify submissions table has new row
   *
   * **Expected outcomes:**
   * - submissions.submission_uid = client-generated UUIDv7
   * - submissions.form_xml_id = published form's form_id
   * - submissions.submitter_id = enumerator's user.id
   * - submissions.raw_data = JSONB with filled responses
   * - submissions.source = 'webapp'
   * - submissions.processed = true (after BullMQ job completes)
   */
  // Phase 3: Enable after Story 3.4
  test.fixme('GP-5: Submission persisted to database via ingestion pipeline', async ({ page }) => {
    // Blocked: Requires Story 3.4 (idempotent submission ingestion with BullMQ)
  });
});

test.describe('Golden Path: Offline Capability', () => {
  /**
   * GP-6: Draft saved to IndexedDB, resume works
   *
   * **Proves:** Offline draft persistence via IndexedDB (Dexie.js)
   * **Unlocked after:** Story 3.2 + 3.3
   *
   * **Preconditions:**
   * - Enumerator user authenticated
   * - Published form available
   * - Service Worker registered and active
   *
   * **Steps:**
   * 1. Login as enumerator and start filling a form
   * 2. Fill partial responses (2-3 questions)
   * 3. Simulate going offline (network interception)
   * 4. Verify draft is saved to IndexedDB (drafts table)
   * 5. Close and reopen the form
   * 6. Verify draft is restored with previous answers
   * 7. Complete remaining questions
   * 8. Go back online
   * 9. Submit the form
   * 10. Verify submission syncs from offline queue
   *
   * **Expected outcomes:**
   * - IndexedDB drafts table contains partial form data
   * - Draft includes: formId, formVersion, responses, questionPosition, status
   * - Resume restores exact position and previous answers
   * - Online sync processes queued submission
   */
  // Phase 3: Enable after Story 3.2 + 3.3
  test.fixme('GP-6: Draft saved to IndexedDB and resume works offline', async ({ page }) => {
    // Blocked: Requires Story 3.2 (PWA service worker) + Story 3.3 (offline queue + sync UI)
  });
});

test.describe('Golden Path: Keyboard-Optimized Data Entry', () => {
  /**
   * GP-7: Clerk fills form via keyboard-only navigation
   *
   * **Proves:** Keyboard-optimized flow for Data Entry Clerks
   * **Unlocked after:** Story 3.6
   *
   * **Preconditions:**
   * - Data Entry Clerk user authenticated (clerk@dev.local / clerk123)
   * - Published form available
   *
   * **Steps:**
   * 1. Login as clerk
   * 2. Navigate to clerk dashboard
   * 3. Select a form to fill
   * 4. Verify keyboard-optimized UI loads (different from enumerator mobile UI)
   * 5. Tab through form fields using keyboard only
   * 6. Fill text input, press Tab/Enter to advance
   * 7. Select from dropdown using keyboard (arrow keys + Enter)
   * 8. Navigate between sections via keyboard shortcuts
   * 9. Submit form using keyboard (no mouse clicks)
   * 10. Verify submission success
   *
   * **Expected outcomes:**
   * - All form interactions completable via keyboard alone
   * - Tab order is logical and predictable
   * - Focus indicators are clearly visible
   * - Submission works without any mouse interaction
   */
  // Phase 4: Enable after Story 3.6
  test.fixme('GP-7: Clerk fills form via keyboard-only navigation', async ({ page }) => {
    // Blocked: Requires Story 3.6 (keyboard-optimized data entry interface)
  });
});

test.describe('Golden Path: Cross-Role Data Visibility', () => {
  /**
   * GP-8: Supervisor dashboard reflects submission
   *
   * **Proves:** Data visibility across roles (submission → supervisor dashboard)
   * **Unlocked after:** Story 3.4 + 4.1
   *
   * **Preconditions:**
   * - Supervisor user authenticated (supervisor@dev.local / super123)
   * - At least 1 submission exists from an enumerator in supervisor's team
   * - Supervisor assigned to same LGA as the submitting enumerator
   *
   * **Steps:**
   * 1. (Setup) Ensure a submission exists from an enumerator
   * 2. Login as supervisor
   * 3. Navigate to supervisor dashboard
   * 4. Verify team activity section shows recent submissions
   * 5. Verify submission count reflects the new submission
   * 6. Click to view submission details
   * 7. Verify submission data matches what enumerator submitted
   *
   * **Expected outcomes:**
   * - Supervisor dashboard shows submissions from their team
   * - Submission data is readable and matches original input
   * - Cross-role data visibility works correctly
   */
  // Phase 4: Enable after Story 3.4 + 4.1
  test.fixme('GP-8: Supervisor dashboard reflects enumerator submission', async ({ page }) => {
    // Blocked: Requires Story 3.4 (submissions) + Story 4.1 (supervisor team dashboard)
  });
});

test.describe('Golden Path: Public User Journey', () => {
  /**
   * GP-9: Public user self-registers, verifies email, and fills questionnaire
   *
   * **Proves:** Self-registration → magic link verification → public dashboard → form fill → submission
   *   (Direct collection, not proxy — public users fill their own responses)
   * **Unlocked after:** Story 3.1 (form filling UI) + public registration flow (already exists)
   *
   * **Preconditions:**
   * - Full stack running
   * - Test email infrastructure available (Mailhog/Mailpit or test-only API for magic link capture)
   * - At least 1 published form exists
   *
   * **Steps:**
   * 1. Navigate to public website
   * 2. Click registration link to go to /auth/public/register
   * 3. Fill registration form (name, email, NIN, phone, LGA)
   * 4. Submit registration
   * 5. Capture magic link (via test email trap or test-only API)
   * 6. Visit magic link URL to verify email
   * 7. Login via /auth/public/login with verified credentials
   * 8. Verify public user dashboard loads
   * 9. See available questionnaires (same published forms as enumerators)
   * 10. Select and fill a questionnaire
   * 11. Submit form
   * 12. Verify submission persisted to database with public user as submitter
   *
   * **Expected outcomes:**
   * - Public user account created and verified
   * - Public dashboard shows available questionnaires
   * - Form fill uses same FormFillerPage as enumerator (one-question-per-screen)
   * - Submission recorded with submitter = public user's ID
   * - submissions.source = 'webapp'
   *
   * **Note on magic link testing:**
   * Playwright cannot open email inboxes. CI environment needs one of:
   * 1. Test email trap (Mailhog/Mailpit) — intercept outbound email, extract magic link URL via API
   * 2. Test-only API endpoint — GET /api/v1/auth/test/verification-token?email=... (guarded by NODE_ENV=test)
   * 3. Direct DB query — extract verification token from database in test setup
   * Decision should be made before enabling this test in Phase 6.
   */
  // Phase 6: Enable after Story 3.1 + public registration flow + test email infrastructure
  test.fixme('GP-9: Public user self-registers, verifies email, and fills questionnaire', async ({ page }) => {
    // Blocked: Requires Story 3.1 (form filling UI) + test email infrastructure for magic link capture
  });
});

test.describe('Golden Path: Quality Assurance Pipeline', () => {
  /**
   * GP-10: Assessor reviews and resolves a flagged submission
   *
   * **Proves:** Fraud flag → review queue → approval/rejection updates DB status
   * **Unlocked after:** Story 4.3 (fraud engine) + Epic 5 (assessor review UI)
   *
   * **Preconditions:**
   * - Verification Assessor authenticated (assessor@dev.local / assess123)
   * - At least 1 submission with fraud flag set in database
   * - Fraud engine columns exist: fraud_score, fraud_flags, verification_status
   *
   * **Steps:**
   * 1. (Setup) Ensure a flagged submission exists (fraud_score > threshold, fraud_flags non-empty)
   * 2. Login as verification assessor
   * 3. Navigate to assessor dashboard / review queue
   * 4. Verify flagged submission appears in queue
   * 5. Click to review submission details
   * 6. View fraud flags and score
   * 7. Approve or reject the submission
   * 8. Verify verification_status updated in database
   * 9. Verify submission removed from review queue
   *
   * **Expected outcomes:**
   * - Assessor review queue shows flagged submissions
   * - Fraud details (score, flags) are visible
   * - Approval: submissions.verification_status = 'verified'
   * - Rejection: submissions.verification_status = 'rejected'
   * - Audit trail recorded for assessor action
   *
   * **Database assertions (after test):**
   * - submissions.fraud_score = numeric score from fraud engine
   * - submissions.fraud_flags = JSONB array of triggered rules
   * - submissions.verification_status = 'verified' or 'rejected' (after assessor action)
   *
   * **Note:** Currently placeholder — "Coming in Epic 5". Requires Story 4.3 schema
   * migration to add fraud_score, fraud_flags, verification_status columns.
   */
  // Phase 7: Enable after Story 4.3 + Epic 5
  test.fixme('GP-10: Assessor reviews and resolves a flagged submission', async ({ page }) => {
    // Blocked: Requires Story 4.3 (fraud engine) + Epic 5 (assessor review UI)
  });
});

test.describe('Golden Path: Read-Only RBAC Enforcement', () => {
  /**
   * GP-11: Government Official views real dashboard data but CANNOT modify
   *
   * **Proves:** Read-only dashboard data visibility + write-denial enforcement (RBAC)
   * **Unlocked after:** Epic 5 (official dashboard data endpoints + export)
   *
   * **Preconditions:**
   * - Government Official authenticated (official@dev.local / official123)
   * - Real dashboard data exists (submissions, staff, etc.)
   *
   * **Steps:**
   * 1. Login as government official
   * 2. Navigate to official dashboard
   * 3. Verify dashboard shows real data (not placeholder "—" values)
   * 4. Verify data statistics/metrics are populated
   * 5. Attempt to access mutation endpoints via the UI (if any write buttons exist, they should be hidden)
   * 6. (API check) Verify POST /api/v1/submissions/* returns 403 for official role
   * 7. (API check) Verify PUT /api/v1/questionnaires/* returns 403 for official role
   *
   * **Expected outcomes:**
   * - Official dashboard displays real, read-only data
   * - No write/edit/delete controls are visible in the UI
   * - API mutation calls return 403 Forbidden
   * - GET dashboard endpoints return 200 with real data
   *
   * **API assertions:**
   * - GET  /api/v1/dashboard/official/* → 200 with real data
   * - POST /api/v1/submissions/*       → 403 Forbidden
   * - PUT  /api/v1/questionnaires/*    → 403 Forbidden
   *
   * **Note:** Currently placeholder with "—" values. Test must prove both:
   * (a) real data is visible, (b) mutation API calls return 403
   */
  // Phase 8: Enable after Epic 5
  test.fixme('GP-11: Government Official views real data but cannot modify', async ({ page }) => {
    // Blocked: Requires Epic 5 (official dashboard data endpoints + export functionality)
  });
});

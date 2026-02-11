# Story prep.4: Playwright Framework Setup + Smoke Tests + Handholding Guide

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **development team**,
I want a production-ready Playwright E2E testing framework with smoke tests and a beginner-friendly guide,
so that we can validate real browser behavior, catch integration failures that unit tests miss, and give Awwal confidence to write and run E2E tests independently.

## Background & Business Context

This story addresses a critical gap identified in the Combined Epic 2+2.5 Retrospective (2026-02-10):

> "Evaluate Playwright E2E setup - NOT DONE. Still at 0 E2E tests after 2 epics."

The team agreed on a **three-layer quality strategy**:

| Layer | What | Who | When | Catches |
|-------|------|-----|------|---------|
| Unit/Integration | Vitest automated tests | CI | Every commit | Regressions, logic errors |
| **E2E (Playwright)** | **Automated browser tests** | **CI** | **Every PR** | **Integration failures, real DOM issues, RBAC in real browser** |
| UAT | Human walkthrough | Awwal | After each story | UX gaps, wrong assumptions |

**Key insight from retro:** Manual local testing surfaced a role name mismatch that 53 automated tests missed. E2E tests in a real browser catch what jsdom-based tests cannot.

This framework will be exercised heavily in Epic 3 (prep-7 defines the golden path spec: form -> database -> dashboard proof after Story 3.4).

## Acceptance Criteria

1. **AC1: Playwright installed and configured** - `@playwright/test` is installed as a devDependency in `apps/web` with a `playwright.config.ts` that uses the project's Vite dev server (`pnpm dev --filter @oslsr/web`) as the web server target at `http://localhost:5173`. Chromium is the default browser. Config follows BMAD testarch patterns (standardized timeouts: action 15s, navigation 30s, expect 10s, test 60s).

2. **AC2: Turbo pipeline integration** - A `test:e2e` script exists in `apps/web/package.json` and `root package.json`. Running `pnpm test:e2e` from root executes Playwright tests via Turbo. The turbo.json `test:e2e` task is configured with appropriate outputs (`playwright-report/**`, `test-results/**`).

3. **AC3: Smoke tests pass** - At least 3 smoke tests exist in `apps/web/e2e/` and pass against the local dev server:
   - Public homepage loads and displays the OSLSR title/hero content
   - Login page renders with email and password fields
   - Navigation between public pages works (e.g., Homepage -> About -> Participate)

4. **AC4: CI pipeline job** - A new `test-e2e` job is added to `.github/workflows/ci-cd.yml` that:
   - Runs after `lint-and-build` (depends on build artifacts)
   - Installs Playwright browsers with `--with-deps`
   - Executes `pnpm test:e2e`
   - Uploads `playwright-report/` and `test-results/` as artifacts on failure
   - Does NOT block the pipeline on failure initially (allowed to fail) so the team can stabilize. **Exit criteria:** Remove `continue-on-error` after prep-7 (E2E golden path spec) passes green in CI.

5. **AC5: Authenticated test scaffold** - A reusable auth setup exists (`apps/web/e2e/auth.setup.ts`) that demonstrates how to save and reuse browser storage state for authenticated tests. At minimum, includes a commented scaffold showing the login flow pattern for future stories.

6. **AC6: Handholding guide for Awwal** - A `docs/playwright-guide.md` document exists that covers:
   - How to run E2E tests locally (`pnpm test:e2e`)
   - How to use Playwright codegen (`pnpm dlx playwright codegen http://localhost:5173`)
   - How to view the HTML report (`pnpm dlx playwright show-report apps/web/playwright-report`)
   - How to debug a failing test (headed mode, `--debug` flag, trace viewer)
   - How to write a new test (step-by-step with example)
   - Screenshot of what codegen looks like (text description is fine)

7. **AC7: .gitignore updated** - `playwright-report/`, `test-results/`, and `apps/web/e2e/.auth/` are added to `.gitignore`.

## Tasks / Subtasks

- [x] Task 1: Install Playwright (AC: #1, #7)
  - [x] 1.1 `pnpm add -D @playwright/test --filter @oslsr/web`
  - [x] 1.2 Run `pnpm dlx playwright install chromium` to download browser binary
  - [x] 1.3 Create `apps/web/playwright.config.ts` with local config
  - [x] 1.4 Add `playwright-report/`, `test-results/`, `apps/web/e2e/.auth/` to root `.gitignore`

- [x] Task 2: Configure Turbo integration (AC: #2)
  - [x] 2.1 Add `"test:e2e": "playwright test"` script to `apps/web/package.json`
  - [x] 2.2 Add `"test:e2e": "pnpm exec turbo run test:e2e"` to root `package.json`
  - [x] 2.3 Add `test:e2e` task to `turbo.json` with outputs and env vars

- [x] Task 3: Write smoke tests (AC: #3)
  - [x] 3.1 Create `apps/web/e2e/smoke.spec.ts` with 3 smoke tests
  - [x] 3.2 Verify all 3 tests pass locally against `pnpm dev`

- [x] Task 4: Create authenticated test scaffold (AC: #5)
  - [x] 4.1 Create `apps/web/e2e/auth.setup.ts` with login flow scaffold
  - [x] 4.2 Configure Playwright projects: `setup` (auth) + `authenticated` + `smoke` (no auth)

- [x] Task 5: Add CI pipeline job (AC: #4)
  - [x] 5.1 Add `test-e2e` job to `.github/workflows/ci-cd.yml`
  - [x] 5.2 Configure `continue-on-error: true` for initial stabilization
  - [x] 5.3 Add artifact upload for reports on failure

- [x] Task 6: Write handholding guide (AC: #6)
  - [x] 6.1 Create `docs/playwright-guide.md` with all required sections
  - [x] 6.2 Include codegen walkthrough with exact commands
  - [x] 6.3 Include debugging section with headed mode + trace viewer

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] M1: `smoke.spec.ts:16` — ID selector `#password` violates Team Agreement A3. Fix: use `getByLabel('Password', { exact: true })` [apps/web/e2e/smoke.spec.ts:16]
- [x] [AI-Review][MEDIUM] M2: `auth.setup.ts:15` — Known-broken `getByLabel(/password/i)` selector not backported from smoke test fix. Will fail on activation. Fix: use `getByLabel('Password', { exact: true })` [apps/web/e2e/auth.setup.ts:15]
- [x] [AI-Review][MEDIUM] M3: `playwright-guide.md` — Uses `pnpm dlx playwright` (downloads each time) instead of `pnpm exec playwright` (local install). Fix all 8 occurrences [docs/playwright-guide.md]
- [x] [AI-Review][MEDIUM] M4: Story File List omits `pnpm-lock.yaml` — modified in git but undocumented [prep-4-playwright-framework-setup.md]
- [x] [AI-Review][MEDIUM] M5: `playwright.config.ts:25-28` — Setup project runs on every execution but always reports 1 skipped test. Fix: comment out like the authenticated project [apps/web/playwright.config.ts:25-28]
- [x] [AI-Review][LOW] L1: `auth.setup.ts:14-15` — Hardcoded credentials in scaffold. Fix: use env var fallbacks [apps/web/e2e/auth.setup.ts:14-15]
- [x] [AI-Review][LOW] L2: `ci-cd.yml` — Artifact upload uses `!cancelled()` (always uploads) vs AC4 spec "on failure". Current behavior is better. ACCEPTED — no change.
- [x] [AI-Review][LOW] L3: `smoke.spec.ts:22-23` — Single navigation hop. Fix: add second navigation step [apps/web/e2e/smoke.spec.ts:22-23]

## Dev Notes

### Scope Definition

This is a **framework setup** story, not a comprehensive test suite. The goal is:
- Working Playwright config in the monorepo
- 3 smoke tests proving the framework works
- CI integration (non-blocking initially)
- A guide that lets Awwal run codegen and write tests independently

**Out of scope:** Comprehensive test coverage, authenticated flow tests (scaffold only), mobile/multi-browser testing, visual regression tests. These come in prep-7 (E2E golden path spec) and Epic 3 stories.

### Architecture Compliance

**ADR-014 (Vitest + Turbo Testing Strategy):** Playwright is the designated E2E framework. It runs separately from Vitest (different tool, different pipeline stage). Do NOT mix Playwright tests into Vitest config.

**ADR-016 (Layout Architecture):** The app uses 3 layout types:
- `PublicLayout` - public pages (homepage, about, participate, support, legal) - NO auth required
- `AuthLayout` - login/register pages - NO auth required
- `DashboardLayout` - role-specific dashboards - auth REQUIRED

Smoke tests should target `PublicLayout` and `AuthLayout` pages only (no auth needed). The authenticated scaffold demonstrates `DashboardLayout` access pattern for future use.

### Playwright Version & Installation

- **Install `@playwright/test@^1.58`** (latest stable as of Feb 2026)
- Requires **Node.js >= 20** (project already uses `>=20.0.0`)
- **Chromium only** for now - do NOT install Firefox/WebKit (saves CI time and disk)
- **Important change in 1.57+:** Playwright uses "Chrome for Testing" instead of Chromium for headed/headless on x64. This is transparent but means slightly different rendering than old Chromium.
- Browser install command: `pnpm dlx playwright install chromium`

### Playwright Config Pattern

```typescript
// apps/web/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://localhost:5173',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Future: auth setup + authenticated projects
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

**Critical:** The `webServer.command` runs from `apps/web/` directory (where playwright.config.ts lives). `pnpm dev` in `apps/web/package.json` already starts Vite on port 5173.

### Smoke Test Pattern

Tests use `data-testid` attributes and text content per Team Agreement A3:
> "Tests use text content, `data-testid`, and ARIA roles - never CSS classes or internal attributes"

```typescript
// apps/web/e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('homepage loads with OSLSR content', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/OSLSR|Oyo State/i);
    // Verify hero section renders
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('login page renders form fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('public navigation works', async ({ page }) => {
    await page.goto('/');
    // Navigate to About
    await page.getByRole('link', { name: /about/i }).click();
    await expect(page).toHaveURL(/\/about/);
  });
});
```

**Important:** Verify actual page titles, labels, and link text by checking the running app before hardcoding selectors. Use Playwright codegen to discover the real DOM.

### Turbo Configuration

Add to `turbo.json`:
```json
"test:e2e": {
  "dependsOn": ["^build"],
  "outputs": ["playwright-report/**", "test-results/**"],
  "env": ["CI", "NODE_ENV"],
  "cache": false
}
```

**`cache: false`** because E2E tests are non-deterministic (real browser, real server). Do not cache E2E results.

### CI Pipeline Job

Add after the existing `test-web` job in `.github/workflows/ci-cd.yml`:

```yaml
test-e2e:
  name: E2E Tests
  runs-on: ubuntu-latest
  needs: [lint-and-build]
  continue-on-error: true  # Non-blocking during stabilization — remove after prep-7 (E2E golden path spec) passes green
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - name: Install Playwright browsers
      run: pnpm dlx playwright install chromium --with-deps
    - name: Run E2E tests
      run: pnpm test:e2e
      env:
        CI: true
    - name: Upload Playwright report
      if: ${{ !cancelled() }}
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: apps/web/playwright-report/
        retention-days: 30
    - name: Upload test results
      if: ${{ !cancelled() }}
      uses: actions/upload-artifact@v4
      with:
        name: e2e-test-results
        path: apps/web/test-results/
        retention-days: 30
```

**Note:** The E2E job does NOT need PostgreSQL or Redis services because:
- Smoke tests only hit public pages (served by Vite dev server)
- When authenticated tests are added later (Epic 3+), the job will need API + DB services

### Auth Setup Scaffold

The auth setup file should be a **working scaffold** that shows the pattern but is not yet active in the default test run:

```typescript
// apps/web/e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '.auth/user.json');

// NOTE: This setup requires the full stack running (API + DB + Redis).
// Uncomment and configure when adding authenticated E2E tests.
// For now, this serves as a template.

setup.skip('authenticate as super-admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('admin@example.com');
  await page.getByLabel(/password/i).fill('password');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // Wait for dashboard redirect
  await page.waitForURL('**/dashboard/**');
  // Save auth state for reuse
  await page.context().storageState({ path: authFile });
});
```

### File Structure

```
apps/web/
  playwright.config.ts          # NEW - Playwright configuration
  e2e/                          # NEW - E2E test directory
    smoke.spec.ts               # NEW - 3 smoke tests
    auth.setup.ts               # NEW - Auth scaffold (skipped)
    .auth/                      # NEW - Stored auth state (gitignored)
      .gitkeep
  package.json                  # MODIFIED - add test:e2e script
turbo.json                      # MODIFIED - add test:e2e task
package.json (root)             # MODIFIED - add test:e2e script
.gitignore                      # MODIFIED - add playwright artifacts
.github/workflows/ci-cd.yml    # MODIFIED - add test-e2e job
docs/playwright-guide.md       # NEW - Handholding guide for Awwal
```

### What NOT To Do

1. **Do NOT install Playwright at the monorepo root** - Install in `apps/web` only. E2E tests live with the app they test.
2. **Do NOT install all browsers** - Chromium only. Firefox/WebKit add ~500MB each with no value for smoke tests.
3. **Do NOT add Playwright tests to the existing `test` script** - E2E tests run separately via `test:e2e`. The existing `test` script runs Vitest. These are different tools with different configs.
4. **Do NOT use `npx`** - This project uses `pnpm`. Use `pnpm dlx` for one-off commands. The guide must use `pnpm dlx playwright codegen`, NOT `npx playwright codegen`.
5. **Do NOT create environment-specific configs (staging, production)** - Premature. Only `local` config needed now. Multi-environment comes when staging deployment exists.
6. **Do NOT add video recording** - Screenshots on failure are sufficient. Video adds significant CI time/storage.
7. **Do NOT use CSS selectors in tests** - Team Agreement A3 requires `data-testid`, text content, and ARIA roles only.

### Project Structure Notes

- Alignment with existing test organization: E2E tests in `apps/web/e2e/` are separate from Vitest unit tests in `apps/web/src/**/*.test.{ts,tsx}`
- The `test:e2e` turbo task is a new pipeline stage, independent of the existing 5-stage test dashboard (GoldenPath, Security, Contract, UI, Performance)
- The existing `LiveReporter` custom Vitest reporter does NOT apply to Playwright. Playwright has its own HTML reporter.

### Previous Story Intelligence

**From prep-3 (DB Migration Workflow Fix):**
- Documentation quality was high - the migration guide in `docs/migration-workflow.md` was well-received
- Pattern: Create focused, practical guides with exact commands, not theoretical docs
- Code review found 8 issues (1H, 4M, 3L) - expect similar for this story
- All 1,354 existing tests pass with 0 regressions - maintain this baseline

**From prep-2 (Shared Role Constants):**
- 8 code review findings (1H, 3M, 4L), 7 fixed, 1 accepted
- Pattern: Shared packages need careful export configuration

**From prep-1 (ODK Cleanup):**
- Clean removal pattern - identify dead code, remove completely, verify no regressions

### Git Intelligence

Recent commits show the team is in a prep/cleanup phase:
```
be23320 feat: squash migrations to single baseline, migrate-based db:reset (prep-3)
7544715 feat: shared role constants in packages/types with code review fixes (prep-2)
047afc9 chore: ODK cleanup and dead code removal (prep-1)
```

Commit message pattern: `feat:` or `chore:` prefix with `(prep-N)` suffix.

### Web Intelligence (Feb 2026)

- **Playwright 1.58.1** is latest stable. Install `@playwright/test@^1.58`.
- **Breaking change in 1.57:** Chrome for Testing replaces Chromium builds. Transparent but worth noting.
- **Docker images now use Node.js 22 LTS** - our CI uses Node 20, which is still supported.
- **Codegen syntax:** `pnpm dlx playwright codegen http://localhost:5173`
- **pnpm monorepo pattern:** Install in the specific workspace package, not root.

### References

- [Source: epic-2-2.5-retrospective-2026-02-10.md#Quality Strategy Decision] - Three-layer testing strategy
- [Source: epic-2-2.5-retrospective-2026-02-10.md#Epic 3 Preparation Tasks] - EP3 definition
- [Source: architecture.md#ADR-014] - Vitest + Turbo Testing Strategy (Playwright for E2E)
- [Source: architecture.md#ADR-016] - Layout Architecture (PublicLayout, AuthLayout, DashboardLayout)
- [Source: project-context.md#Testing Organization] - Co-located frontend tests, separate backend tests
- [Source: project-context.md#Team Agreements] - A3: Test selector strategy (data-testid, text, ARIA roles)
- [Source: _bmad/bmm/testarch/knowledge/playwright-config.md] - BMAD Playwright configuration patterns
- [Source: .github/workflows/ci-cd.yml] - Existing CI pipeline structure

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Initial smoke test run: 2/3 passed, 1 skipped. Password field selector `getByLabel(/password/i)` matched both the input and a "Show password" button (strict mode violation). Fixed by using `page.locator('#password')`. Navigation test `getByRole('link', { name: /about/i }).first()` resolved to a "For Employers" link under Participate, not the About link. Fixed by targeting the "Learn How It Works" CTA link which reliably navigates to `/about/how-it-works`.
- Final smoke test run: 3/3 passed, 1 skipped (auth scaffold — expected).

### Completion Notes List

- AC1: `@playwright/test@^1.58.2` installed in `apps/web` devDependencies. `playwright.config.ts` created with BMAD testarch timeouts (action 15s, navigation 30s, expect 10s, test 60s). Chromium-only. Vite dev server as webServer target at localhost:5173.
- AC2: `test:e2e` script in `apps/web/package.json` and root `package.json`. Turbo task configured with `cache: false`, appropriate outputs and env vars.
- AC3: 3 smoke tests in `apps/web/e2e/smoke.spec.ts` — homepage content, login form fields, public navigation. All pass locally.
- AC4: `test-e2e` CI job added to `ci-cd.yml`. Depends on `lint-and-build`, installs Chromium with `--with-deps`, `continue-on-error: true` for stabilization, uploads report and results as artifacts.
- AC5: `apps/web/e2e/auth.setup.ts` scaffold with `setup.skip()` pattern showing login flow and storage state persistence. Playwright config includes `setup` project and commented `authenticated` project for future use.
- AC6: `docs/playwright-guide.md` covers running tests, codegen (with visual description), viewing reports, debugging (headed mode, --debug, trace viewer), and writing new tests step-by-step.
- AC7: `.gitignore` updated with `playwright-report/`, `test-results/`, `apps/web/e2e/.auth/`.
- Regression check: 957 existing Vitest web tests pass, 0 regressions.

### Change Log

- 2026-02-11: Implemented Playwright E2E framework setup (prep-4). All 7 ACs satisfied. 3 smoke tests pass, 957 existing tests unaffected.
- 2026-02-11: Code review — 8 findings (5M, 3L). Fixed 7, accepted 1 (L2). Fixes: A3-compliant selectors, pnpm exec in guide, env var credentials in scaffold, commented out inactive setup project, added multi-hop navigation, documented pnpm-lock.yaml.

### File List

- apps/web/playwright.config.ts (NEW)
- apps/web/e2e/smoke.spec.ts (NEW)
- apps/web/e2e/auth.setup.ts (NEW)
- apps/web/e2e/.auth/.gitkeep (NEW)
- apps/web/package.json (MODIFIED — added test:e2e script)
- package.json (MODIFIED — added test:e2e script)
- turbo.json (MODIFIED — added test:e2e task)
- .gitignore (MODIFIED — added playwright artifacts)
- .github/workflows/ci-cd.yml (MODIFIED — added test-e2e job)
- pnpm-lock.yaml (MODIFIED — @playwright/test dependency added)
- docs/playwright-guide.md (NEW)

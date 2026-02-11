# Playwright E2E Testing Guide

A practical guide to running, writing, and debugging Playwright end-to-end tests in the OSLSR project.

## Quick Start

### Run all E2E tests

```bash
pnpm test:e2e
```

This runs Playwright tests via Turbo from the monorepo root. Under the hood it:
1. Starts the Vite dev server on `http://localhost:5173` (if not already running)
2. Launches a headless Chromium browser
3. Runs all test files in `apps/web/e2e/`
4. Generates an HTML report in `apps/web/playwright-report/`

### View the HTML report

After a test run, open the interactive report:

```bash
cd apps/web && pnpm exec playwright show-report playwright-report
```

This starts a local server and opens the report in your browser. You'll see each test with pass/fail status, duration, and screenshots on failure.

### Run tests from the web app directory

```bash
cd apps/web
pnpm test:e2e
```

## Using Playwright Codegen

Codegen is the fastest way to write new tests. It opens a browser and records your actions as Playwright code.

### Start codegen

Make sure the dev server is running first:

```bash
# Terminal 1: Start the dev server
cd apps/web && pnpm dev

# Terminal 2: Launch codegen (from apps/web)
cd apps/web && pnpm exec playwright codegen http://localhost:5173
```

### What happens

1. A Chromium browser opens with the OSLSR app
2. A "Playwright Inspector" window appears alongside it
3. Click around the app — every click, type, and navigation is recorded as test code
4. Copy the generated code into a new `.spec.ts` file in `apps/web/e2e/`

### Codegen tips

- **Pick locators** — Click the "Pick locator" button (crosshair icon) in the Inspector to see how Playwright would find an element. Prefer `getByRole`, `getByLabel`, and `getByText` over CSS selectors.
- **Assert visibility** — Click the "Assert visibility" button (eye icon), then click an element to generate an `expect(...).toBeVisible()` assertion.
- **Assert text** — Click the "Assert text" button, then click an element to generate a `toContainText()` assertion.

### What codegen looks like

The Playwright Inspector window shows generated TypeScript code in real-time:

```
┌──────────────────────────────────────────────┐
│  Playwright Inspector                        │
│                                              │
│  import { test, expect } from '@playwright/  │
│  test';                                      │
│                                              │
│  test('test', async ({ page }) => {          │
│    await page.goto('http://localhost:5173');  │
│    await page.getByRole('link',              │
│      { name: 'About' }).click();             │
│    await expect(page).toHaveURL(             │
│      /.*about.*/);                           │
│  });                                         │
│                                              │
│  [Record] [Pick Locator] [Assert Visibility] │
└──────────────────────────────────────────────┘
```

## Debugging Failing Tests

### Run in headed mode (see the browser)

```bash
cd apps/web
pnpm exec playwright test --headed
```

The browser window opens and you can watch the test execute step by step.

### Run with the debugger

```bash
cd apps/web
pnpm exec playwright test --debug
```

This opens the Playwright Inspector with step-through controls. You can:
- **Step over** — execute one action at a time
- **Resume** — continue to the next breakpoint or end
- **Pick locator** — test selectors against the live page

### Use the trace viewer

If a test failed and trace was captured (enabled on first retry by default), open it:

```bash
cd apps/web && pnpm exec playwright show-trace test-results/<test-folder>/trace.zip
```

The trace viewer shows:
- Timeline of every action
- DOM snapshots before and after each step
- Console logs and network requests
- Screenshots at each step

### Run a single test file

```bash
cd apps/web
pnpm exec playwright test e2e/smoke.spec.ts
```

### Run a single test by name

```bash
cd apps/web
pnpm exec playwright test -g "homepage loads"
```

## Writing a New Test

### Step-by-step guide

1. **Create a new file** in `apps/web/e2e/` with the `.spec.ts` extension:

```bash
# Example: testing the about page
touch apps/web/e2e/about.spec.ts
```

2. **Write the test structure:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('About Page', () => {
  test('displays the initiative content', async ({ page }) => {
    // Navigate to the page
    await page.goto('/about');

    // Assert content is visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(/About.*OSLSR/);
  });
});
```

3. **Use the right selectors** (Team Agreement A3 — never use CSS classes):

```typescript
// GOOD — text content, ARIA roles, labels
page.getByRole('button', { name: /submit/i })
page.getByLabel(/email/i)
page.getByText('Welcome')
page.getByTestId('hero-section')

// BAD — CSS classes and DOM structure
page.locator('.btn-primary')           // Never use CSS classes
page.locator('div > span.title')       // Never use DOM structure
```

4. **Run your test:**

```bash
cd apps/web
pnpm exec playwright test e2e/about.spec.ts
```

5. **Check the report** if something fails:

```bash
pnpm exec playwright show-report apps/web/playwright-report
```

### Common assertions

```typescript
// Page title
await expect(page).toHaveTitle(/OSLSR/);

// URL
await expect(page).toHaveURL(/\/about/);

// Element visibility
await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

// Text content
await expect(page.getByRole('heading')).toContainText('Hello');

// Form field value
await expect(page.getByLabel(/email/i)).toHaveValue('test@example.com');

// Element count
await expect(page.getByRole('listitem')).toHaveCount(3);
```

### Common actions

```typescript
// Click
await page.getByRole('button', { name: /save/i }).click();

// Type into a field
await page.getByLabel(/email/i).fill('user@example.com');

// Select from dropdown
await page.getByRole('combobox').selectOption('option-value');

// Wait for navigation
await page.waitForURL('**/dashboard/**');

// Take a screenshot (for debugging)
await page.screenshot({ path: 'debug.png' });
```

## Project Configuration

- **Config file:** `apps/web/playwright.config.ts`
- **Test directory:** `apps/web/e2e/`
- **Reports:** `apps/web/playwright-report/` (gitignored)
- **Test artifacts:** `apps/web/test-results/` (gitignored)
- **Auth state:** `apps/web/e2e/.auth/` (gitignored)
- **Browser:** Chromium only (for now)
- **Base URL:** `http://localhost:5173`

### Timeouts

| Setting | Value | What it means |
|---------|-------|---------------|
| Test timeout | 60s | Max time for a single test |
| Action timeout | 15s | Max time for a click, fill, etc. |
| Navigation timeout | 30s | Max time for page.goto() |
| Expect timeout | 10s | Max time for assertions to pass |
| Web server timeout | 120s | Max time for dev server to start |

### CI behavior

In CI, Playwright runs with:
- 2 retries (vs 0 locally)
- 1 worker (vs parallel locally)
- `forbidOnly: true` (prevents `.only` from being committed)
- Fresh dev server (no reuse)

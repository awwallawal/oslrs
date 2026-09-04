// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

/*
 * ⭐ ONE ESLint INSTANCE, NOT ONE PER TEST (2026-09-04).
 *
 * This used to `new ESLint(...)` inside `lintText`, so all three tests each paid
 * the full cost of resolving `eslint.config.js` and its entire plugin graph — for
 * three one-line lints. It is by far the most expensive thing in the web suite per
 * assertion, and on a memory-starved machine it blew the 30s budget outright and
 * cost a push (observed twice: 58.9s under a 1-worker run, then a 30s timeout at
 * 1.32 GB free).
 *
 * ⚠️ The reflex fix was to raise the timeout again, as `route-resolution` has now
 * been raised three times. That would have been treating the symptom: the work is
 * genuinely redundant, not genuinely slow. Constructing once cuts the config load
 * from three to one and changes nothing about what is asserted — the instance is
 * stateless across `lintText` calls, which is exactly why sharing it is safe.
 *
 * Lazy rather than top-level so the cost lands inside the first test's budget
 * (where a failure is attributable) instead of at module load (where it would
 * surface as an opaque suite-level timeout).
 */
let shared: ESLint | undefined;
function eslintInstance(): ESLint {
  shared ??= new ESLint({ overrideConfigFile: 'eslint.config.js' });
  return shared;
}

async function lintText(code: string, filename: string) {
  const [result] = await eslintInstance().lintText(code, { filePath: filename });
  return result.messages;
}

describe('A3 ESLint policy', { timeout: 30_000 }, () => {
  it('rejects CSS class selectors in unit/integration test files', async () => {
    const messages = await lintText(
      "document.querySelector('.foo')",
      'src/features/sample/sample.test.tsx',
    );

    expect(messages.some(m => m.ruleId === 'no-restricted-syntax')).toBe(true);
  });

  it('rejects CSS string locators in e2e files', async () => {
    const messages = await lintText(
      "page.locator('.btn-primary').click()",
      'e2e/sample.spec.ts',
    );

    expect(messages.some(m => m.ruleId === 'no-restricted-syntax')).toBe(true);
  });

  it('allows role-based query patterns', async () => {
    const messages = await lintText(
      "screen.getByRole('button', { name: /submit/i })",
      'src/features/sample/sample.test.tsx',
    );

    expect(messages.some(m => m.ruleId === 'no-restricted-syntax')).toBe(false);
  });
});

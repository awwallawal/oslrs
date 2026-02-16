// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

async function lintText(code: string, filename: string) {
  const eslint = new ESLint({
    overrideConfigFile: 'eslint.config.js',
  });
  const [result] = await eslint.lintText(code, { filePath: filename });
  return result.messages;
}

describe('A3 ESLint policy', () => {
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

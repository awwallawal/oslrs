// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..', '..');
const eslintConfigPath = path.join(webRoot, 'eslint.config.js');

async function lintText(code: string, filename: string) {
  const eslint = new ESLint({
    cwd: webRoot,
    overrideConfigFile: eslintConfigPath,
  });
  const [result] = await eslint.lintText(code, { filePath: filename });
  return result.messages;
}

describe('A3 ESLint policy', () => {
  it('rejects CSS class selectors in unit/integration test files', async () => {
    const messages = await lintText(
      "document.querySelector('.foo')",
      path.join(webRoot, 'src', 'features', 'sample', 'sample.test.tsx'),
    );

    expect(messages.some(m => m.ruleId === 'no-restricted-syntax')).toBe(true);
  });

  it('rejects CSS string locators in e2e files', async () => {
    const messages = await lintText(
      "page.locator('.btn-primary').click()",
      path.join(webRoot, 'e2e', 'sample.spec.ts'),
    );

    expect(messages.some(m => m.ruleId === 'no-restricted-syntax')).toBe(true);
  });

  it('allows role-based query patterns', async () => {
    const messages = await lintText(
      "screen.getByRole('button', { name: /submit/i })",
      path.join(webRoot, 'src', 'features', 'sample', 'sample.test.tsx'),
    );

    expect(messages.some(m => m.ruleId === 'no-restricted-syntax')).toBe(false);
  });
});

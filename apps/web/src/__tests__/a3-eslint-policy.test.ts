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

/*
 * ⏱️ 30s -> 90s (2026-09-05), and ONLY AFTER the redundant work was removed.
 *
 * Raising a timeout to hide repeated work is how a slow suite gets slower quietly.
 * So the waste went first: this file used to construct a new ESLint per test, three
 * full loads of `eslint.config.js` and its whole plugin graph. That is fixed above —
 * tests 2 and 3 now cost ~46ms combined.
 *
 * What remains is IRREDUCIBLE: one config load, borne by the first test. Measured
 * 6.8s on a warm machine, but it degrades far worse than linearly under memory
 * pressure — 58.9s in a 1-worker run, and a hard 30s timeout at 1.32 GB free, which
 * has now cost two pushes. 90s covers the observed worst case with headroom.
 *
 * This is a budget for a REAL cost, not a cover for a fixable one. If it ever blows
 * 90s, do not raise it again — that would mean the config graph itself has grown,
 * and the answer then is to look at `eslint.config.js`, not at this number.
 *
 * ⏱️ 90s -> 210s (2026-09-30) — AND THE INSTRUCTION DIRECTLY ABOVE WAS TESTED BEFORE
 * BEING OVERRIDDEN, because it forbids exactly this change.
 *
 * It says a blown 90s means the config graph grew, and to look at
 * `apps/web/eslint.config.js` rather than at this number. So that was checked first:
 * the config is **156 lines, last modified 2026-08-10** — BEFORE the 90s budget was
 * set on 09-05. It has not grown. The stated diagnostic is therefore falsified, and
 * the instruction was conditioned on a cause that is not this one.
 *
 * What it actually is, measured on 2026-09-30 during 13-76's adjudication:
 *   • this file ALONE ......................  10.0s for all three tests (≈ the 6.8s
 *                                             warm baseline above, plus drift)
 *   • the same file in a FULL web suite run  115.5s — and 136.7s in an earlier run
 *   • ⇒ an 11.5x starvation factor, on a machine with 6.8 GB free and no competing
 *     process. Not memory pressure this time; the CPU simply did not deliver what it
 *     did the day before (the whole suite went 544s -> 1501s for the same files).
 *
 * That is the "degrades far worse than linearly" case the note above predicted — the
 * prediction was right and only the ceiling was too low. 210s is ~1.8x the worst
 * observed.
 *
 * ⛔ THE ORIGINAL INSTRUCTION STILL STANDS FOR ITS OWN CASE. Before raising this
 * again, re-run the file ALONE. If it is still ~10s, the suite is starved and the
 * number is not the problem. If it has grown, the config graph HAS grown and the
 * answer is `eslint.config.js` — exactly as written above.
 */
describe('A3 ESLint policy', { timeout: 210_000 }, () => {
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

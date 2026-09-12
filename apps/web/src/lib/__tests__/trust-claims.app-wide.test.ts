import { describe, it, expect } from 'vitest';

import { FORBIDDEN_IDENTITY_CLAIMS } from '../trust-claims';

/**
 * THE APP-WIDE HONESTY GUARD — Story 13-58, [AI-Review][High] 2026-09-11.
 *
 * ## Why this file exists
 *
 * The claim "NIN has been validated / identity verified by government" has now been found and
 * fixed THREE separate times:
 *
 *   1. 2026-08-18 — `GovernmentVerifiedBadge`'s panel.
 *   2. 2026-09-09 — `VerifyWorkerPage` and `GuideVerifyWorkerPage`, three weeks later, still
 *      live and PINNED BY TESTS that asserted the false strings word for word.
 *   3. 2026-09-11 — `FAQPage`, `GuideSearchMarketplacePage`, `EmployersPage` (two arrays AND an
 *      FAQ answer, also test-pinned), `WorkersPage` and `PrivacyPage`.
 *
 * Round 2 shipped a guard. It did not prevent round 3, and the reason is the whole point of this
 * file: `FORBIDDEN_IDENTITY_CLAIMS` was imported by exactly the two test files for the two pages
 * that had just been fixed. **It policed where the fix landed, not where the claim lives** — a
 * census of sites, not of callers — so five untouched pages walked straight through it.
 * → [[pattern-census-counts-sites-not-callers]]
 *
 * A per-page assertion also fails silently for every page added AFTER it: nothing makes the
 * author of a new page wire the guard in. This scan needs no cooperation from new code.
 *
 * ## What it does
 *
 * `import.meta.glob` pulls the raw source of every `.ts`/`.tsx` under `src/`, comments are
 * stripped, and any `FORBIDDEN_IDENTITY_CLAIMS` match fails with `file:line`. Comments are
 * stripped because the fixes deliberately quote the false strings to explain what was wrong; the
 * claim only matters where it can reach a user.
 *
 * ⚠️ Vite's glob rather than `node:fs` **on purpose** — no web source file imports a node
 * builtin, `@types/node` is not in this package's `tsconfig.json` (`types` is jsdom + PWA only),
 * and a test that needs one would be the only exception in `apps/web`. This also means no
 * `process.cwd()` assumption, so the scan behaves the same however vitest is invoked.
 *
 * ⚠️ A SOURCE scan, deliberately: it sees string literals a render test would miss — an FAQ
 * answer in a data array, a `const` list of bullet points — which is exactly where round 3 was
 * hiding. It cannot see text assembled at runtime from fragments, so page-level render
 * assertions remain worthwhile on top of this, not instead of it.
 */

const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * Files that legitimately contain the forbidden wording.
 *
 * ⚠️ Every entry needs a reason, and the list is meant to stay this short. Adding a page here
 * is not a workaround — it is a claim that the page says something true, and it should be as
 * uncomfortable to write as it looks.
 */
const ALLOWLIST: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: '/src/lib/trust-claims.ts',
    why: 'Defines the patterns, and documents the three false claims that actually shipped.',
  },
  {
    file: '/src/lib/__tests__/trust-claims.test.ts',
    why: 'RED-verifies the guard against the real strings, so it must contain them.',
  },
  {
    file: '/src/lib/__tests__/trust-claims.app-wide.test.ts',
    why: 'This file: the scanner and its own RED-verify fixtures.',
  },
  {
    file: '/src/features/marketplace/__tests__/GovernmentVerifiedBadge.test.tsx',
    why: 'Asserts the badge does NOT say these things (`not.toMatch`) — negative assertions.',
  },
];

/** Blank out comment bodies, preserving newlines so reported line numbers stay true. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (m) => m.replace(/[^\n]/g, ' '));
}

interface Breach {
  file: string;
  line: number;
  text: string;
  why: string;
}

function scan(): Breach[] {
  const allowed = new Set(ALLOWLIST.map((a) => a.file));
  const breaches: Breach[] = [];

  for (const [file, source] of Object.entries(SOURCES)) {
    if (allowed.has(file)) continue;

    stripComments(source)
      .split('\n')
      .forEach((line, i) => {
        for (const { pattern, why } of FORBIDDEN_IDENTITY_CLAIMS) {
          const m = line.match(pattern);
          if (m) breaches.push({ file, line: i + 1, text: m[0].trim(), why });
        }
      });
  }
  return breaches;
}

describe('trust claims — app-wide honesty guard (R1)', () => {
  /**
   * Guards the guard: if the glob ever resolves to nothing — a moved file, a changed vite root,
   * a typo in the pattern — every assertion below would pass over an empty set, green and
   * useless. The floor is deliberately far below the real count (~800) so it never turns into a
   * brittle census that reds on every added file.
   */
  it('actually reads the app source — the scan is not silently empty', () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('/src/lib/trust-claims.ts');
    expect(files).toContain('/src/features/participate/pages/EmployersPage.tsx');
  });

  it('no surface under src/ makes an identity claim the platform cannot support', () => {
    const breaches = scan();
    const report = breaches
      .map((b) => `  ${b.file}:${b.line}\n      matched: "${b.text}"\n      why:     ${b.why}`)
      .join('\n');

    expect(
      breaches,
      breaches.length
        ? `\n${breaches.length} forbidden identity claim(s) found:\n${report}\n\n` +
            'Fix the copy against src/lib/trust-claims.ts. Do NOT add the file to ALLOWLIST ' +
            'unless the wording is genuinely true.\n'
        : undefined,
    ).toEqual([]);
  });

  /**
   * RED-VERIFY THE SCANNER ITSELF — [[pattern-test-that-passes-over-a-hole]] applied to the
   * guard that exists because of that pattern.
   */
  it('RED-VERIFY — the scanner catches all three claims that really shipped', () => {
    const shipped = [
      'NIN has been validated',
      'Identity verified by government',
      'their identity has been confirmed through NIN verification',
    ];
    for (const claim of shipped) {
      const caught = FORBIDDEN_IDENTITY_CLAIMS.some(({ pattern }) => pattern.test(claim));
      expect(caught, `guard must reject: "${claim}"`).toBe(true);
    }
  });

  it('RED-VERIFY — the comment stripper does not blind the scanner to real code', () => {
    const src = ['// NIN has been validated', 'const a = "NIN has been validated";'].join('\n');
    const stripped = stripComments(src);
    expect(stripped.split('\n')[0].trim()).toBe('');
    expect(stripped.split('\n')[1]).toContain('NIN has been validated');
  });

  it('does not flag the honest replacements — a guard that reds on correct copy gets deleted', () => {
    const honest = [
      'A State Assessor reviewed this registration and approved it',
      'An 11-digit NIN is on file',
      'We have not confirmed this identity with NIMC — the NIN is format-checked only',
      // The AC3 disclosure, which the pre-2026-09-11 pattern wrongly flagged: the negation
      // sits BETWEEN the noun and the verb, not after it.
      'Identity not independently verified',
    ];
    for (const claim of honest) {
      const flagged = FORBIDDEN_IDENTITY_CLAIMS.some(({ pattern }) => pattern.test(claim));
      expect(flagged, `guard must NOT flag: "${claim}"`).toBe(false);
    }
  });
});

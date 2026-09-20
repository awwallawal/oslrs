import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE_LIMIT_PREFIXES, findPrefixCollisions } from '../../lib/rate-limit-prefixes.js';

/**
 * Story 13-70 FR2 (AC4) — NO LIMITER PREFIX MAY BE A PROPER PREFIX OF ANOTHER.
 *
 * `rate-limit-redis` stores each count at `${prefix}${key}`, so two limiters whose prefix + key can
 * spell the same string are ONE counter incremented by two budgets. ONE of these was LIVE:
 * `passwordResetCompletionRateLimit` (prefix `rl:password-reset-complete:`) falls back to the key
 * `ip:<addr>` and so wrote `rl:password-reset-complete:ip:<addr>` — byte for byte what
 * `passwordResetCompletionIpFloodLimit` writes at prefix `rl:password-reset-complete:ip:`. A
 * per-token budget of 20 and a per-IP flood ceiling of 300 shared one counter on every request that
 * carried no token, and `POST /auth/reset-password` reads its token from the body.
 *
 * ⚠️ `activationRateLimit` has the identical SHAPE but was LATENT — its routes are `/activate/:token`
 * and `/activate/:token/validate`, so the IP fallback cannot be reached. The story recorded both as
 * live; corrected by the adversarial review, 2026-09-20.
 *
 * ⛔ THE BRIEF NAMED TWO PAIRS. ENUMERATING THE TREE FOUND FIVE — the other three being
 * `rl:login:` ⊂ `rl:login:strict:`, `rl:register:` ⊂ `rl:register:email:` and
 * `rl:wizard-draft:` ⊂ `rl:wizard-draft:email:`. That is why the property, not the five instances,
 * is the deliverable.
 *
 * ⚠️ AND WHY THE ENFORCEMENT MOVED INTO A REGISTRY. The first version of this test scanned
 * `src/middleware/*.ts` for `prefix:` and reported a clean pass over 24 of 31 keyspaces. It missed
 * `import-rate-limit.ts` (prefix passed to a factory), `wizard-draft-rate-limit.ts` (through a
 * `store(prefix)` helper) and `registration-status.service.ts` (not middleware at all) — a census
 * that counted SITES rather than CALLERS [[pattern-census-counts-sites-not-callers]]. Every keyspace
 * now lives in `lib/rate-limit-prefixes.ts`, which asserts the invariant AT MODULE LOAD, and the
 * scan below exists to stop anyone re-introducing a literal outside it.
 */

const API_SRC = fileURLToPath(new URL('../../', import.meta.url));
const REGISTRY = 'lib/rate-limit-prefixes.ts';

/** `prefix:` and the prefixes themselves are discussed in a dozen docblocks. */
function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*');
}

interface Literal {
  file: string;
  line: number;
  value: string;
}

/**
 * Any `rl:…` string in a `'`, `"` or backtick literal, stopping at a `${` interpolation.
 *
 * ⛔ WIDENED BY THE 13-70 REVIEW (2026-09-20). It was `/'(rl:[^']*)'/g` — single quotes only — so
 * three live keyspaces written as TEMPLATE literals, across four sites, were invisible to the very
 * scan whose docblock promised it "scans the whole of `apps/api/src`": `rl:reveal:user:`,
 * `rl:reveal:device:` and `rl:edit-token:` (twice). The first version of this scan counted the
 * sites a `prefix:` grep
 * reached; the second counted the sites a single-quote regex reached. Same defect, one quote
 * character deep [[pattern-census-counts-sites-not-callers]].
 */
const RL_LITERAL = /['"`](rl:(?:[^'"`$]|\$(?!\{))*)/g;

/** Every `rl:…` string literal in non-comment, non-test code under `apps/api/src`. */
function strayLiterals(): Literal[] {
  const found: Literal[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;

      const rel = relative(API_SRC, full).replace(/\\/g, '/');
      if (rel === REGISTRY) continue;

      readFileSync(full, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (isCommentLine(line)) return;
          for (const m of line.matchAll(RL_LITERAL)) {
            found.push({ file: rel, line: i + 1, value: m[1]! });
          }
        });
    }
  };

  walk(API_SRC);
  return found;
}

describe('13-70 FR2 — limiter Redis keyspaces are structurally disjoint (AC4)', () => {
  const registered = Object.values(RATE_LIMIT_PREFIXES);

  /**
   * [[pattern-a-clean-result-must-prove-it-measured]] — a registry that had been emptied, or an
   * import that silently resolved to `{}`, would make every assertion below pass on nothing.
   * Measured 2026-09-20: 31 keyspaces, corrected to **34** by the adversarial review — the three it
   * had missed are built in template literals (`rl:reveal:user:`, `rl:reveal:device:`,
   * `rl:edit-token:`). ⚠️ Four SITES, three KEYSPACES: `rl:edit-token:${nin}` and
   * `rl:edit-token:rid:${id}` are two key shapes under one prefix, and this assertion is what
   * caught the review counting them as two.
   */
  it('the registry actually holds the keyspaces', () => {
    expect(registered.length).toBeGreaterThanOrEqual(34);
    expect(new Set(registered).size).toBe(registered.length);
    for (const p of registered) expect(p.startsWith('rl:')).toBe(true);
  });

  it('⛔ no registered prefix is a PROPER PREFIX of another', () => {
    expect(findPrefixCollisions(registered)).toEqual([]);
  });

  /**
   * The invariant itself, asserted against synthetic input — otherwise this file only ever observes
   * that today's values happen to be fine, and would keep passing if the check were gutted.
   */
  it('the invariant catches a collision, a duplicate, and leaves a disjoint set alone', () => {
    expect(findPrefixCollisions(['rl:activation:', 'rl:activation:ip:'])).toEqual([
      'rl:activation: is a proper prefix of rl:activation:ip:',
    ]);
    expect(findPrefixCollisions(['rl:mfa:', 'rl:mfa:'])).toEqual(['rl:mfa: is registered twice']);
    expect(findPrefixCollisions(['rl:a:', 'rl:b:', 'rl:ab:'])).toEqual([]);
  });

  /**
   * ⛔ The registry is only a single source of truth if nothing bypasses it. This is the check that
   * makes "add your prefix here" enforceable rather than a comment nobody reads.
   */
  it('no `rl:` literal exists anywhere in apps/api/src outside the registry', () => {
    expect(strayLiterals().map((l) => `${l.file}:${l.line} ${l.value}`)).toEqual([]);
  });

  /**
   * The five pairs this story closed, pinned BY VALUE so that reverting any single rename reds with
   * a message naming the pair, rather than only "collisions is not empty" from the property above.
   */
  it('the five pairs closed on 2026-09-20 stay closed', () => {
    const values = new Set<string>(registered);
    for (const kept of [
      'rl:activation:token:',
      'rl:password-reset-complete:token:',
      'rl:login:burst:',
      'rl:register:ip:',
      'rl:wizard-draft:ip:',
    ]) {
      expect(values.has(kept), kept).toBe(true);
    }
    for (const gone of [
      'rl:activation:',
      'rl:password-reset-complete:',
      'rl:login:',
      'rl:register:',
      'rl:wizard-draft:',
    ]) {
      expect(values.has(gone), gone).toBe(false);
    }
  });

  /**
   * The three keyspaces a `prefix:`-based scan never saw. Named explicitly, because "the count is
   * still above the floor" would not notice if a refactor hid them again.
   */
  it('covers the keyspaces that are not written next to a `prefix:`', () => {
    expect(RATE_LIMIT_PREFIXES.IMPORTS_DRY_RUN).toBe('rl:imports:dry-run:'); // makeImportLimiter(…)
    expect(RATE_LIMIT_PREFIXES.WIZARD_DRAFT_IP).toBe('rl:wizard-draft:ip:'); // store(prefix)
    expect(RATE_LIMIT_PREFIXES.REGSTATUS_EMAIL).toBe('rl:regstatus-email:'); // a service, not middleware
  });

  /**
   * ⛔ The four the SCAN could not see, because they are built in template literals rather than
   * single-quoted strings (13-70 adversarial review, 2026-09-20). Named by value, so that moving
   * one back out of the registry reds here as well as in the stray-literal scan above.
   */
  it('covers the keyspaces built by string interpolation', () => {
    expect(RATE_LIMIT_PREFIXES.REVEAL_USER).toBe('rl:reveal:user:');     // `${prefix}${userId}`
    expect(RATE_LIMIT_PREFIXES.REVEAL_DEVICE).toBe('rl:reveal:device:'); // `${prefix}${fingerprint}`
    expect(RATE_LIMIT_PREFIXES.EDIT_TOKEN).toBe('rl:edit-token:');       // `${prefix}${nin}` / `${prefix}rid:${id}`
  });

  /**
   * The widened scan, asserted against synthetic input — otherwise it only ever observes that
   * today's tree happens to be clean, and would keep passing if the regex narrowed back to `'`.
   * Every one of these shapes was INVISIBLE to the version that shipped.
   */
  it('the stray-literal scan sees double quotes, backticks and interpolation', () => {
    const shapes = [
      `const a = "rl:sneaky:";`,
      'const b = `rl:sneaky:`;',
      'const c = `rl:sneaky:${userId}`;',
      "const d = 'rl:sneaky:';",
    ];
    for (const line of shapes) {
      const found = [...line.matchAll(RL_LITERAL)].map((m) => m[1]);
      expect(found, line).toEqual(['rl:sneaky:']);
    }
  });
});

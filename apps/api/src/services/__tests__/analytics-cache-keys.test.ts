import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import {
  ANALYTICS_CACHE_VERSION,
  analyticsCacheKey,
  PUBLIC_KEY_FINDINGS_CACHE_KEY,
} from '../analytics-cache-keys.js';

/*
 * ⛔ NO ANALYTICS CACHE KEY MAY BE A HARDCODED LITERAL.
 *
 * 2026-08-29: `public-insights.service.ts` composed `'analytics:public:insights:v3'`
 * by hand instead of using this module, so a payload SHAPE change shipped while the
 * cache still served a pre-deploy blob — the new `skillsByLga`/`growth` fields were
 * simply absent from the live endpoint for an hour after the deploy. Verified on prod.
 *
 * The bitter part: Story 12-6 built this module because "the discipline lived in a
 * comment beside a literal rather than in a shared constant" — and the one key that
 * founding comment was written about was never wired to it. A shared symbol nobody is
 * forced to use is a convention, not a guard. This is the guard.
 */
describe('analytics cache keys — no hand-rolled literals', () => {
  const SERVICES = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  it('⭐ no service builds an `analytics:` cache key as a string literal', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(SERVICES).filter((n) => n.endsWith('.ts'))) {
      if (f === 'analytics-cache-keys.ts') continue; // the one place literals are legal
      const src = readFileSync(join(SERVICES, f), 'utf-8');
      // a quoted string starting `analytics:` is a key someone typed by hand
      if (/['"`]analytics:[a-z0-9:_-]+['"`]/i.test(src)) offenders.push(f);
    }
    expect(
      offenders,
      `these build an analytics cache key by hand instead of analyticsCacheKey(): ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('the version is a single symbol every composed key carries', () => {
    expect(analyticsCacheKey('public', 'insights')).toBe(`analytics:public:insights:${ANALYTICS_CACHE_VERSION}`);
    expect(PUBLIC_KEY_FINDINGS_CACHE_KEY.endsWith(`:${ANALYTICS_CACHE_VERSION}`)).toBe(true);
  });
});

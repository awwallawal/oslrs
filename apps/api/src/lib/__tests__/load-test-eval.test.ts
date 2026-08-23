import { describe, it, expect } from 'vitest';
import {
  evaluateLoadTest,
  summariseAutocannon,
  LOAD_TEST_THRESHOLDS,
  type LoadTestSummary,
  parseLoadTestArgs,
  loadTestRefusal,
  isLocalTarget,
  LoadTestArgError,
  LOAD_PROFILE,
} from '../load-test-eval.js';

const green: LoadTestSummary = {
  p95LatencyMs: 400,
  avgLatencyMs: 120,
  errorCount: 0,
  non2xxCount: 2,
  totalRequests: 5000,
  requestsPerSec: 80,
};

describe('evaluateLoadTest (Story 13-3 AC1)', () => {
  it('GREEN when latency, error rate, and throughput all clear thresholds', () => {
    const v = evaluateLoadTest(green);
    expect(v.verdict).toBe('green');
    expect(v.reasons).toEqual([]);
    expect(v.errorRatePct).toBeCloseTo(0.04, 2); // 2/5000
  });

  it('RED on p95 latency over the ceiling', () => {
    const v = evaluateLoadTest({ ...green, p95LatencyMs: 2200 });
    expect(v.verdict).toBe('red');
    expect(v.reasons[0]).toMatch(/p95 latency 2200ms > 1500ms/);
  });

  it('RED on error rate over 1% (errors + non-2xx)', () => {
    const v = evaluateLoadTest({ ...green, errorCount: 40, non2xxCount: 30 }); // 70/5000 = 1.4%
    expect(v.verdict).toBe('red');
    expect(v.reasons.some((r) => /error rate 1.40% > 1%/.test(r))).toBe(true);
  });

  it('RED on throughput stalling below the floor', () => {
    const v = evaluateLoadTest({ ...green, requestsPerSec: 8 });
    expect(v.verdict).toBe('red');
    expect(v.reasons.some((r) => /throughput 8.0 req\/s < 20 req\/s/.test(r))).toBe(true);
  });

  it('RED — NOT a vacuous green — when zero requests completed (origin down/unreachable)', () => {
    const v = evaluateLoadTest({ ...green, totalRequests: 0, errorCount: 0, non2xxCount: 0 });
    expect(v.verdict).toBe('red');
    expect(v.reasons[0]).toMatch(/no requests completed/);
  });

  it('accumulates multiple breach reasons', () => {
    const v = evaluateLoadTest({ ...green, p95LatencyMs: 3000, requestsPerSec: 5 });
    expect(v.verdict).toBe('red');
    expect(v.reasons).toHaveLength(2);
  });

  it('honours custom thresholds', () => {
    const v = evaluateLoadTest({ ...green, p95LatencyMs: 800 }, { ...LOAD_TEST_THRESHOLDS, maxP95LatencyMs: 500 });
    expect(v.verdict).toBe('red');
  });
});

describe('summariseAutocannon (Story 13-3)', () => {
  it('maps an autocannon result into the evaluated summary (p97_5 → p95 proxy; errors+timeouts)', () => {
    const s = summariseAutocannon({
      latency: { p97_5: 640, average: 110 },
      errors: 3,
      timeouts: 2,
      non2xx: 7,
      requests: { total: 12000, average: 95 },
    });
    expect(s).toEqual({
      p95LatencyMs: 640,
      avgLatencyMs: 110,
      errorCount: 5,
      non2xxCount: 7,
      totalRequests: 12000,
      requestsPerSec: 95,
    });
  });

  it('is total — missing fields default to 0 (so an empty result evaluates RED, not crash)', () => {
    const s = summariseAutocannon({});
    expect(s.totalRequests).toBe(0);
    expect(evaluateLoadTest(s).verdict).toBe('red');
  });
});


/**
 * Story 13-65 (AC8) — the write-path arguments.
 *
 * 13-3's runner was GET-only (no `method`, no `body`), so gate item 7's write path has never been
 * load-tested. The parsing, the validation and the prod refusal live HERE, in `src/lib`, precisely
 * because `apps/api/scripts/` is outside tsconfig — neither type-checked nor unit-tested. The
 * script is I/O and exit codes only.
 */
describe('parseLoadTestArgs (Story 13-65 AC8)', () => {
  it('defaults reproduce 13-3 exactly when neither --method nor --body is given', () => {
    const a = parseLoadTestArgs([]);
    expect(a.method).toBe('GET');
    expect(a.body).toBeUndefined();
    expect(a.url).toBe('http://localhost:3000/api/v1/health');
    expect(a.connections).toBe(LOAD_PROFILE.connections);
    expect(a.duration).toBe(LOAD_PROFILE.duration);
    expect(a.headers['x-load-test']).toBe('13-3');
    expect(a.headers['user-agent']).toBe('oslsr-load-test/13-3');
    // No content-type on a read run — the request must stay byte-identical to 13-3's.
    expect(a.headers['content-type']).toBeUndefined();
  });

  it('AC8 Half A — parses the draft-save PUT with a JSON body', () => {
    const a = parseLoadTestArgs([
      '--method', 'PUT',
      '--path', '/api/v1/registration/draft',
      '--body', '{"resumeToken":"abc"}',
      '--connections', '50',
      '--duration', '60',
    ]);
    expect(a.method).toBe('PUT');
    expect(a.path).toBe('/api/v1/registration/draft');
    expect(a.body).toBe('{"resumeToken":"abc"}');
    expect(a.headers['content-type']).toBe('application/json');
    expect(a.connections).toBe(50);
    expect(a.duration).toBe(60);
  });

  it('AC8 Half B — parses the submit POST at a deliberately SMALL N', () => {
    const a = parseLoadTestArgs([
      '--method', 'POST', '--path', '/api/v1/registration/wizard',
      '--body', '{"x":1}', '--connections', '2', '--duration', '5',
    ]);
    expect(a.method).toBe('POST');
    expect(a.connections).toBe(2);
  });

  it('rejects a body that is not valid JSON', () => {
    expect(() => parseLoadTestArgs(['--method', 'POST', '--body', 'not json'])).toThrow(LoadTestArgError);
  });

  it('rejects a body on a GET — a silently-empty write test is the worst outcome here', () => {
    expect(() => parseLoadTestArgs(['--body', '{"x":1}'])).toThrow(/method GET/);
  });

  it('rejects an unsupported method rather than passing it through to autocannon', () => {
    expect(() => parseLoadTestArgs(['--method', 'TRACE'])).toThrow(/unsupported --method/);
  });

  it('rejects a non-positive profile', () => {
    expect(() => parseLoadTestArgs(['--connections', '0'])).toThrow(LoadTestArgError);
    expect(() => parseLoadTestArgs(['--duration', 'abc'])).toThrow(LoadTestArgError);
  });

  it('strips a trailing slash from the target so the URL never doubles up', () => {
    expect(parseLoadTestArgs(['--target', 'http://localhost:3000/']).url).toBe('http://localhost:3000/api/v1/health');
  });

  it('does not swallow the next flag as a value', () => {
    const a = parseLoadTestArgs(['--method', 'POST', '--body', '{"x":1}', '--dry-run']);
    expect(a.dryRun).toBe(true);
    expect(a.body).toBe('{"x":1}');
  });
});

describe('loadTestRefusal — the non-localhost guard survives the write-path change', () => {
  it('refuses a non-localhost target without the acknowledgement flag', () => {
    const a = parseLoadTestArgs(['--target', 'https://oyoskills.com', '--method', 'POST', '--body', '{"x":1}']);
    expect(loadTestRefusal(a)).toMatch(/not localhost/);
  });

  it('allows it WITH the acknowledgement flag', () => {
    const a = parseLoadTestArgs([
      '--target', 'https://oyoskills.com', '--i-understand-this-hits-prod',
    ]);
    expect(loadTestRefusal(a)).toBeNull();
  });

  it('allows localhost in all its spellings', () => {
    for (const t of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
      expect(isLocalTarget(t)).toBe(true);
    }
    expect(isLocalTarget('https://oyoskills.com')).toBe(false);
    // The classic bypass: a hostname that merely STARTS with localhost.
    expect(isLocalTarget('https://localhost.evil.test')).toBe(false);
  });
});

describe('a WRITE run needs its own consent and its own bound (13-65 review B5)', () => {
  const writeArgs = (over: Record<string, unknown> = {}) => ({
    target: 'http://localhost:3000',
    path: '/api/v1/registration/wizard',
    url: 'http://localhost:3000/api/v1/registration/wizard',
    connections: 2,
    duration: 5,
    method: 'POST' as const,
    body: '{}',
    headers: {},
    dryRun: false,
    acknowledgedProd: false,
    acknowledgedWrite: false,
    amount: 0,
    ...over,
  });

  it('REFUSES a write run without the write-specific acknowledgement', () => {
    // 13-3 minted `--i-understand-this-hits-prod` for a GET profile. Reusing it to unlock a run that
    // creates registry rows and sends real email is a consent the operator never gave — and one they
    // would type by habit.
    expect(loadTestRefusal(writeArgs())).toMatch(/CREATES ROWS and can SEND REAL EMAIL/);
  });

  it('REFUSES a write run that is bounded only by TIME', () => {
    // `--duration 60` on the submit path means "create respondents for a minute".
    expect(loadTestRefusal(writeArgs({ acknowledgedWrite: true }))).toMatch(/must be bounded/);
  });

  it('ALLOWS a write run that is acknowledged AND bounded (the permitted direction)', () => {
    expect(loadTestRefusal(writeArgs({ acknowledgedWrite: true, amount: 10 }))).toBeNull();
  });

  it('reports the PROD problem before the write problem — the broadest refusal first', () => {
    // Otherwise a POST at prod with neither flag reports only the write issue, the operator fixes
    // that, and the prod guard is discovered on the second attempt.
    const atProd = writeArgs({ target: 'https://oyoskills.com', url: 'https://oyoskills.com/x' });
    expect(loadTestRefusal(atProd)).toMatch(/not localhost/);
  });

  it('leaves a GET run entirely unchanged — 13-3 profiles still run as before', () => {
    expect(loadTestRefusal(writeArgs({ method: 'GET', body: undefined }))).toBeNull();
  });
});

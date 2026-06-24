import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('node:crypto', () => ({ X509Certificate: vi.fn() }));

import {
  daysUntilExpiry,
  statusFromDays,
  buildExpiry,
  certAdapter,
  domainAdapter,
  manualAdapter,
  getExpiries,
  _clearRdapCache,
  EXPIRY_WARNING_DAYS,
  EXPIRY_CRITICAL_DAYS,
} from '../expiry-monitor.service.js';

// X509Certificate is constructed with `new` — the mock impl MUST be a real function
// (an arrow can't be a constructor), returning an object stands in as the instance.
function mockCertValidTo(validTo: string): void {
  vi.mocked(X509Certificate).mockImplementation(function () {
    return { validTo } as unknown as X509Certificate;
  } as unknown as typeof X509Certificate);
}

const NOW = new Date('2026-06-01T00:00:00.000Z');
const ENV_KEYS = ['CERT_MONITOR_PATHS', 'DOMAIN_MONITOR_LIST', 'MONITORED_EXPIRIES'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  _clearRdapCache();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

describe('expiry-monitor — pure helpers', () => {
  it('daysUntilExpiry floors whole days (and goes negative once past)', () => {
    expect(daysUntilExpiry(new Date('2026-06-11T00:00:00Z'), NOW)).toBe(10);
    expect(daysUntilExpiry(new Date('2026-05-22T00:00:00Z'), NOW)).toBe(-10);
  });

  it('statusFromDays matches the alert bands (critical <30, warning <60, else ok)', () => {
    expect(statusFromDays(EXPIRY_CRITICAL_DAYS - 1)).toBe('critical'); // 29
    expect(statusFromDays(EXPIRY_CRITICAL_DAYS)).toBe('warning'); // 30
    expect(statusFromDays(EXPIRY_WARNING_DAYS - 1)).toBe('warning'); // 59
    expect(statusFromDays(EXPIRY_WARNING_DAYS)).toBe('ok'); // 60
    expect(statusFromDays(365)).toBe('ok');
  });

  it('buildExpiry returns error when expiresAt is null/invalid', () => {
    const e = buildExpiry('x', 'manual', null, 'no date', NOW);
    expect(e).toMatchObject({ status: 'error', expiresAt: null, daysUntilExpiry: null });
    expect(buildExpiry('x', 'manual', new Date('not-a-date'), 'bad', NOW).status).toBe('error');
  });
});

describe('cert adapter (AC#3)', () => {
  it('refuses a non-.pem path (never reads a .key)', async () => {
    process.env.CERT_MONITOR_PATHS = '/etc/ssl/cloudflare/origin.key';
    const [item] = await certAdapter(NOW);
    expect(item.status).toBe('error');
    expect(item.detail).toContain('refused non-.pem');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('reads notAfter via X509Certificate.validTo and computes status', async () => {
    process.env.CERT_MONITOR_PATHS = '/tmp/test-cert.pem';
    vi.mocked(readFile).mockResolvedValue('---PEM---');
    mockCertValidTo('Jan 1 2027 00:00:00 GMT');
    const [item] = await certAdapter(NOW);
    expect(item).toMatchObject({ name: 'cert:test-cert', kind: 'cert', status: 'ok' });
    expect(item.daysUntilExpiry).toBeGreaterThan(200);
  });

  it('yields critical when the cert expires within 30 days', async () => {
    process.env.CERT_MONITOR_PATHS = '/tmp/test-cert.pem';
    vi.mocked(readFile).mockResolvedValue('---PEM---');
    mockCertValidTo('Jun 20 2026 00:00:00 GMT');
    expect((await certAdapter(NOW))[0].status).toBe('critical');
  });

  it('yields error (never throws) when the file is unreadable', async () => {
    process.env.CERT_MONITOR_PATHS = '/tmp/missing.pem';
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    const [item] = await certAdapter(NOW);
    expect(item.status).toBe('error');
    expect(item.detail).toContain('unreadable');
  });
});

describe('domain adapter (AC#4)', () => {
  function stubFetch(impl: () => Promise<unknown>) {
    const fn = vi.fn(impl);
    vi.stubGlobal('fetch', fn);
    return fn;
  }

  it('extracts the RDAP expiration event', async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ events: [{ eventAction: 'expiration', eventDate: '2027-01-01T00:00:00Z' }] }),
    }));
    const [item] = await domainAdapter(NOW);
    expect(item).toMatchObject({ name: 'domain:oyoskills.com', kind: 'domain', status: 'ok' });
    expect(item.expiresAt).toBe(new Date('2027-01-01T00:00:00Z').toISOString());
  });

  it('caches the result (≥12h) — a second call within TTL does not re-fetch', async () => {
    const fn = stubFetch(async () => ({
      ok: true,
      json: async () => ({ events: [{ eventAction: 'expiration', eventDate: '2027-01-01T00:00:00Z' }] }),
    }));
    await domainAdapter(NOW);
    await domainAdapter(new Date(NOW.getTime() + 6 * 60 * 60 * 1000)); // +6h, within 12h
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns error (never throws) on a fetch failure / timeout', async () => {
    stubFetch(async () => {
      throw new Error('aborted');
    });
    const [item] = await domainAdapter(NOW);
    expect(item.status).toBe('error');
    expect(item.detail).toContain('RDAP unavailable');
  });

  it('returns error when RDAP has no expiration event', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ events: [{ eventAction: 'registration' }] }) }));
    expect((await domainAdapter(NOW))[0].status).toBe('error');
  });
});

describe('manual adapter (AC#5)', () => {
  it('returns [] when unset', () => {
    expect(manualAdapter(NOW)).toEqual([]);
  });

  it('parses declared items and computes status (incl. a domain kind)', () => {
    process.env.MONITORED_EXPIRIES = JSON.stringify([
      { name: 'oyotradeministry.com.ng', kind: 'domain', expiresAt: '2026-06-20T00:00:00Z' },
      { name: 'cf-token', kind: 'manual', expiresAt: '2027-01-01T00:00:00Z' },
    ]);
    const items = manualAdapter(NOW);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'manual:oyotradeministry.com.ng', kind: 'domain', status: 'critical' });
    expect(items[1]).toMatchObject({ kind: 'manual', status: 'ok' });
  });

  it('yields a single error item on invalid JSON (never throws)', () => {
    process.env.MONITORED_EXPIRIES = '{not json';
    const [item] = manualAdapter(NOW);
    expect(item.status).toBe('error');
    expect(item.detail).toContain('invalid MONITORED_EXPIRIES');
  });

  it('coerces an unknown kind to "manual" so it still renders on the dashboard (L4)', () => {
    process.env.MONITORED_EXPIRIES = JSON.stringify([{ name: 'weird', kind: 'banana', expiresAt: '2027-01-01T00:00:00Z' }]);
    expect(manualAdapter(NOW)[0].kind).toBe('manual');
  });
});

describe('getExpiries — fail-open aggregation (AC#1)', () => {
  it('aggregates all adapters into one flat array and never throws', async () => {
    process.env.CERT_MONITOR_PATHS = '/tmp/a.pem';
    process.env.MONITORED_EXPIRIES = JSON.stringify([{ name: 't', expiresAt: '2027-01-01T00:00:00Z' }]);
    vi.mocked(readFile).mockResolvedValue('---PEM---');
    mockCertValidTo('Jan 1 2027 GMT');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down'); // domain adapter must degrade to error, not crash
      }),
    );
    const all = await getExpiries(NOW);
    const kinds = all.map((e) => e.kind);
    expect(kinds).toContain('cert');
    expect(kinds).toContain('manual');
    expect(all.find((e) => e.name === 'domain:oyoskills.com')?.status).toBe('error');
  });
});

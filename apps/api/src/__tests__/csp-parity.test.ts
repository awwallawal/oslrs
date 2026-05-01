import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import { app } from '../app.js';
import { cspDirectives } from '../app.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const NGINX_CONF_PATH = resolve(__dirname, '../../../../infra/nginx/oslsr.conf');

// Dual-domain (Phase 2): Helmet's connectSrc has BOTH prod wss URLs in production but only
// the single ws://localhost:3000 fallback in test mode. To make the test-mode Helmet output
// match the nginx prod string for parity, the dev fallback expands to the full prod list.
//
// 3-PLACE SYNC WARNING: if a third production domain is ever added, this constant must be
// updated alongside (a) the CORS_ORIGIN env var on the VPS, and (b) the nginx CSP add_header
// strings in infra/nginx/oslsr.conf at BOTH the server level and the static-asset block.
// Failing to update any one of the three causes either a parity-test red CI or a runtime
// connect-src violation.
//
// PRODUCTION-MODE TEST RUNS: this substitution path is the test-mode branch (NODE_ENV=test).
// Running `NODE_ENV=production pnpm vitest` would cause Helmet to emit the prod wss URLs
// directly without the localhost fallback — the substitution would be a no-op and the test
// would still pass (since both sides would already match). Do not rely on this constant in
// the production-mode code path.
const PROD_WS_URLS = ['wss://oyotradeministry.com.ng', 'wss://oyoskills.com'];

type NormalizedPolicy = Record<string, string[]>;

function helmetKeyToCSP(key: string): string {
  return key.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function normalizeHelmetDirectives(): NormalizedPolicy {
  const result: NormalizedPolicy = {};

  for (const [key, value] of Object.entries(cspDirectives)) {
    const directive = helmetKeyToCSP(key);

    if (directive === 'report-to') {
      result[directive] = [String(value)];
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        result[directive] = [];
      } else {
        const sources = value.flatMap((s) => {
          if (s === 'ws://localhost:3000') return PROD_WS_URLS;
          return [s];
        });
        result[directive] = sources.sort();
      }
    } else if (typeof value === 'boolean' && value) {
      result[directive] = [];
    }
  }

  if (!result['upgrade-insecure-requests']) {
    result['upgrade-insecure-requests'] = [];
  }

  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function parseNginxCSP(): NormalizedPolicy {
  const confText = readFileSync(NGINX_CONF_PATH, 'utf-8');

  // The nginx config has the CSP add_header directive in TWO places:
  //   1. server-level (covers /, /dashboard, every SPA fallback)
  //   2. static-asset location block (covers /assets/*.{js,css,png,...})
  // Story 9-8 Task 2.2 requires both to be byte-identical (because nginx
  // inheritance breaks the moment any add_header appears in a location block).
  // matchAll() finds both; the assertion below enforces equality across all
  // occurrences before normalizing, so a future dev who edits one block but
  // not the other gets a loud parity-test failure.
  const matches = [
    ...confText.matchAll(
      /add_header\s+Content-Security-Policy(?:-Report-Only)?\s+"([^"]+)"\s+always;/g,
    ),
  ];

  if (matches.length === 0) {
    throw new Error(
      `Could not find Content-Security-Policy or Content-Security-Policy-Report-Only ` +
      `add_header directive in ${NGINX_CONF_PATH}`,
    );
  }

  if (matches.length < 2) {
    throw new Error(
      `Expected at least 2 CSP add_header directives in ${NGINX_CONF_PATH} ` +
      `(server-level + static-asset block per Story 9-8 Task 2.2), found ${matches.length}.`,
    );
  }

  const policyStrings = matches.map((m) => m[1]);
  const uniquePolicies = new Set(policyStrings);
  if (uniquePolicies.size !== 1) {
    throw new Error(
      `nginx CSP add_header values diverge across ${matches.length} occurrences in ` +
      `${NGINX_CONF_PATH}. All CSP add_headers must be byte-identical. Found ` +
      `${uniquePolicies.size} unique values.`,
    );
  }

  const policyString = policyStrings[0];
  const result: NormalizedPolicy = {};

  for (const part of policyString.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const tokens = trimmed.split(/\s+/);
    const directive = tokens[0];
    const sources = tokens.slice(1);

    result[directive] = sources.sort();
  }

  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b)),
  );
}

describe('CSP Parity: Helmet <-> nginx', () => {
  it('should have identical directive sets between Helmet source and nginx config', () => {
    const helmet = normalizeHelmetDirectives();
    const nginx = parseNginxCSP();

    const helmetKeys = Object.keys(helmet).sort();
    const nginxKeys = Object.keys(nginx).sort();

    expect(helmetKeys).toEqual(nginxKeys);
  });

  it('should have identical source lists for every directive', () => {
    const helmet = normalizeHelmetDirectives();
    const nginx = parseNginxCSP();

    for (const directive of Object.keys(helmet)) {
      expect(nginx[directive], `directive "${directive}" missing from nginx`).toBeDefined();
      expect(helmet[directive].sort()).toEqual(
        (nginx[directive] || []).sort(),
      );
    }
  });

  it('should fail if Helmet adds a source that nginx does not have', () => {
    const helmet = normalizeHelmetDirectives();
    const nginx = parseNginxCSP();

    for (const [directive, helmetSources] of Object.entries(helmet)) {
      const nginxSources = nginx[directive] || [];
      for (const source of helmetSources) {
        expect(
          nginxSources,
          `Helmet has "${source}" in ${directive} but nginx does not`,
        ).toContain(source);
      }
    }
  });

  it('should fail if nginx adds a directive that Helmet does not have', () => {
    const helmet = normalizeHelmetDirectives();
    const nginx = parseNginxCSP();

    for (const directive of Object.keys(nginx)) {
      expect(
        helmet,
        `nginx has directive "${directive}" but Helmet does not`,
      ).toHaveProperty(directive);
    }
  });

  it('should fail if nginx adds a source that Helmet does not have', () => {
    const helmet = normalizeHelmetDirectives();
    const nginx = parseNginxCSP();

    for (const [directive, nginxSources] of Object.entries(nginx)) {
      const helmetSources = helmet[directive] || [];
      for (const source of nginxSources) {
        expect(
          helmetSources,
          `nginx has "${source}" in ${directive} but Helmet does not`,
        ).toContain(source);
      }
    }
  });

  it('should match the live Express CSP header (supertest round-trip)', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);

    const headerName = process.env.NODE_ENV === 'production'
      ? 'content-security-policy'
      : 'content-security-policy-report-only';
    const liveCSP = res.headers[headerName] as string;
    expect(liveCSP).toBeDefined();

    const liveDirectives: NormalizedPolicy = {};
    for (const part of liveCSP.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const tokens = trimmed.split(/\s+/);
      liveDirectives[tokens[0]] = tokens
        .slice(1)
        .flatMap((s) => (s === 'ws://localhost:3000' ? PROD_WS_URLS : [s]))
        .sort();
    }

    if (!liveDirectives['upgrade-insecure-requests']) {
      liveDirectives['upgrade-insecure-requests'] = [];
    }

    const nginx = parseNginxCSP();

    // Compare every nginx directive against the live wire — including report-uri
    // and report-to. An earlier version of this test silently excluded those two
    // without rationale; M4 (code-review 2026-05-01) removed the exclusion to
    // close the parity gap. If a future Helmet upgrade or middleware reorder
    // changes how report-* directives serialize, the test will now flag it.
    for (const directive of Object.keys(nginx)) {
      expect(
        liveDirectives,
        `nginx directive "${directive}" not in live CSP`,
      ).toHaveProperty(directive);
      expect(
        (liveDirectives[directive] || []).sort(),
        `source list mismatch for live "${directive}" vs nginx`,
      ).toEqual((nginx[directive] || []).sort());
    }
  });
});

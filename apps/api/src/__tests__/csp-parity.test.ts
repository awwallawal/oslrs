import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import { app } from '../app.js';
import { cspDirectives } from '../app.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const NGINX_CONF_PATH = resolve(__dirname, '../../../../infra/nginx/oslsr.conf');

const PROD_WS_URL = 'wss://oyotradeministry.com.ng';

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
        const sources = value.map((s) => {
          if (s === 'ws://localhost:3000') return PROD_WS_URL;
          return s;
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

  const match = confText.match(
    /add_header\s+Content-Security-Policy(?:-Report-Only)?\s+"([^"]+)"\s+always;/,
  );

  if (!match) {
    throw new Error(
      `Could not find Content-Security-Policy or Content-Security-Policy-Report-Only ` +
      `add_header directive in ${NGINX_CONF_PATH}`,
    );
  }

  const policyString = match[1];
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
      liveDirectives[tokens[0]] = tokens.slice(1)
        .map((s) => (s === 'ws://localhost:3000' ? PROD_WS_URL : s))
        .sort();
    }

    if (!liveDirectives['upgrade-insecure-requests']) {
      liveDirectives['upgrade-insecure-requests'] = [];
    }

    const nginx = parseNginxCSP();

    for (const directive of Object.keys(nginx)) {
      if (directive === 'report-uri' || directive === 'report-to') continue;
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

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const NGINX_CONF_PATH = resolve(__dirname, '../../../../infra/nginx/oslsr.conf');

describe('nginx header hygiene (Story 9-45 AC#5 / F-002)', () => {
  const confText = readFileSync(NGINX_CONF_PATH, 'utf-8');

  /*
   * 2026-08-28 — the SPA shell must never be heuristically cached.
   *
   * INCIDENT: the 2026-08-27 deploy removed fields from /api/v1/public/insights.
   * `index.html` carried NO Cache-Control, so a warm browser kept a pre-deploy shell,
   * which loaded the OLD content-hashed bundle (still on disk under `immutable`) and
   * threw reading a field the new payload no longer has → "Page Error", while the
   * origin was completely healthy. A hard refresh fixed it.
   *
   * This asserts the DIRECTIVE, not the incident — the durable fix is the deployment
   * rule (stop READING a field, let caches turn over, THEN remove it from the payload).
   */
  it('serves the SPA shell with Cache-Control: no-cache (location /)', () => {
    const loc = confText.slice(confText.indexOf('location / {'));
    const body = loc.slice(0, loc.indexOf('}'));
    expect(body).toMatch(/try_files \$uri \$uri\/ \/index\.html;/);
    expect(body).toMatch(/add_header Cache-Control "no-cache"/);
  });

  it('keeps hashed assets immutable — the shell rule must not leak into /assets/', () => {
    // `^~ /assets/` outranks `location /`. Content-addressed files SHOULD be cached
    // for a year; it is only the shell that points at them which must revalidate.
    // Anchor on the BRACE: the prose above mentions this block by name, and an
    // unanchored indexOf matched the comment instead of the directive.
    const assets = confText.slice(confText.indexOf('location ^~ /assets/ {'));
    const body = assets.slice(0, assets.indexOf('}'));
    expect(body).toMatch(/Cache-Control "public, immutable"/);
    expect(body).not.toMatch(/no-cache/);
  });

  it('does NOT emit the internal X-Proxy-Upstream header anywhere', () => {
    expect(confText).not.toMatch(/add_header\s+X-Proxy-Upstream/i);
    expect(confText).not.toContain('X-Proxy-Upstream');
  });

  it('still proxies /api and /socket.io to the local API (no functional regression)', () => {
    expect(confText).toMatch(/location\s+\/api\s*\{[\s\S]*?proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/);
    expect(confText).toMatch(/location\s+\/socket\.io\/\s*\{[\s\S]*?proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/);
  });

  // Review M1 — removing X-Proxy-Upstream must NOT leave /api and /socket.io with
  // zero add_header (nginx then inherits the server-level HSTS/X-Frame-Options/
  // static-app CSP and emits them DUPLICATED + conflicting alongside Helmet's).
  // Each proxy location must keep at least one add_header (the inheritance breaker).
  it('keeps an inheritance-breaking add_header in /api and /socket.io (no duplicate server headers)', () => {
    const apiBlock = confText.match(/location\s+\/api\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
    const wsBlock = confText.match(/location\s+\/socket\.io\/\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
    expect(apiBlock).toMatch(/add_header\s+/);
    expect(wsBlock).toMatch(/add_header\s+/);
    // ...and that breaker is not the topology-leaking header.
    expect(apiBlock).not.toMatch(/X-Proxy-Upstream/i);
    expect(wsBlock).not.toMatch(/X-Proxy-Upstream/i);
  });
});

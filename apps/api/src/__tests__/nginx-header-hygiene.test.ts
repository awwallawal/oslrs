import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const NGINX_CONF_PATH = resolve(__dirname, '../../../../infra/nginx/oslsr.conf');

describe('nginx header hygiene (Story 9-45 AC#5 / F-002)', () => {
  const confText = readFileSync(NGINX_CONF_PATH, 'utf-8');

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

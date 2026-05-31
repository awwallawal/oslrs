import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

// Extracts a specific CSP directive value, anchored to the directive name.
// Returns the value (everything between "<name> " and the next ";") or null
// if the directive is absent. Centralised here (Story 9-30 code-review F3
// follow-up) so the four directive-anchored assertions in this file share
// one regex source — when a future CSP spec edge case forces the pattern to
// evolve (e.g., source-expression embedded commas, report-to group lists),
// only this helper needs updating.
function getDirective(csp: string, name: string): string | null {
  const match = csp.match(new RegExp(`(?:^|;)\\s*${name}\\s+([^;]+)`));
  return match ? match[1] : null;
}

describe('CSP Header Integration', () => {
  it('should include Content-Security-Policy-Report-Only header on API responses', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    const cspHeader = res.headers['content-security-policy-report-only'];
    expect(cspHeader).toBeDefined();
  });

  it('should contain default-src self in CSP header', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy-report-only'];
    expect(csp).toContain("default-src 'self'");
  });

  it('should contain script-src with hCaptcha and Google domains', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy-report-only'];
    expect(csp).toContain('https://accounts.google.com');
    expect(csp).toContain('https://hcaptcha.com');
    expect(csp).toContain('https://*.hcaptcha.com');
  });

  // Story 9-8 promotion gate: violations from the 18-day Report-Only window
  // identified two missing allowlist entries needed before flipping to enforcing.
  // Anchored via getDirective so a future regression that moves the URL into a
  // different directive (or drops it from script-src) would fail loudly.
  it('should allowlist Cloudflare Browser Insights beacon in script-src', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy-report-only'];
    const scriptSrc = getDirective(csp, 'script-src');
    expect(scriptSrc).not.toBeNull();
    expect(scriptSrc).toContain('https://static.cloudflareinsights.com');
  });

  it('should allowlist Google Sign-In stylesheet in style-src', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy-report-only'];
    const styleSrc = getDirective(csp, 'style-src');
    expect(styleSrc).not.toBeNull();
    expect(styleSrc).toContain('https://accounts.google.com');
  });

  it('should contain object-src none', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy-report-only'];
    expect(csp).toContain("object-src 'none'");
  });

  it('should include Reporting-Endpoints header', async () => {
    const res = await request(app).get('/health');
    const reportingEndpoints = res.headers['reporting-endpoints'];
    expect(reportingEndpoints).toContain('csp-endpoint');
    expect(reportingEndpoints).toContain('/api/v1/csp-report');
  });

  it('should contain all critical CSP directives', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy-report-only'];

    // style-src with accepted unsafe-inline tradeoff
    expect(csp).toContain("style-src");
    expect(csp).toContain("'unsafe-inline'");

    // connect-src — anchored via getDirective so a future refactor that
    // moves cdn.jsdelivr.net to a different directive (e.g., script-src
    // for a CDN-hosted polyfill) while dropping the connect-src entry is
    // caught. Pre-existing naked toContain was upgraded as a Story 9-30
    // code-review F2 follow-up, matching the rigor of the dedicated
    // Cloudflare-Insights connect-src test below.
    const connectSrc = getDirective(csp, 'connect-src');
    expect(connectSrc).not.toBeNull();
    expect(connectSrc).toContain("https://cdn.jsdelivr.net");

    // frame-src for OAuth and hCaptcha iframes
    expect(csp).toContain("frame-src");

    // img-src with data: and blob: for selfies and downloads
    expect(csp).toContain("img-src");
    expect(csp).toContain("data:");
    expect(csp).toContain("blob:");

    // font-src for Google Fonts
    expect(csp).toContain("font-src");
    expect(csp).toContain("https://fonts.gstatic.com");

    // Restrictive directives
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'self'");

    // Worker and media sources
    expect(csp).toContain("worker-src");
    expect(csp).toContain("media-src");
    expect(csp).toContain("mediastream:");

    // Story 9-8: script-src-attr pinned explicitly (was implicit Helmet default
    // before 9-8 — made explicit so the csp-parity test can compare cleanly
    // against the nginx mirror without false-positive drift). Anchored via
    // getDirective ensures the value is genuinely in script-src-attr (a naked
    // toContain would pass even if "script-src-attr 'none'" appeared as a
    // substring of an unrelated directive).
    const scriptSrcAttr = getDirective(csp, 'script-src-attr');
    expect(scriptSrcAttr).not.toBeNull();
    expect(scriptSrcAttr!.trim()).toBe("'none'");
  });

  // Story 9-30: the Cloudflare Web Analytics beacon (shipped 2026-05-19 in
  // Story 9-20) loads from static.cloudflareinsights.com (script-src, above)
  // but POSTs RUM telemetry to the root host cloudflareinsights.com/cdn-cgi/rum.
  // Without the connect-src entry, beacon POSTs fail and Web Analytics goes
  // silently dark. Anchored via getDirective: pins the host to the connect-src
  // directive specifically, so a refactor that drops it (e.g., while
  // consolidating Cloudflare hosts into a wildcard elsewhere) is caught.
  it('should allowlist Cloudflare Insights RUM beacon target in connect-src', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy-report-only'];
    const connectSrc = getDirective(csp, 'connect-src');
    expect(connectSrc).not.toBeNull();
    expect(connectSrc).toContain('https://cloudflareinsights.com');
  });

  it('should contain report-to directive', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy-report-only'];
    expect(csp).toContain("report-to csp-endpoint");
  });

  it('should accept and log CSP violation reports', async () => {
    const report = {
      'csp-report': {
        'document-uri': 'https://example.com/',
        'violated-directive': 'script-src',
        'blocked-uri': 'https://evil.example.com/malicious.js',
      },
    };

    const res = await request(app)
      .post('/api/v1/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify(report));

    expect(res.status).toBe(204);
  });
});

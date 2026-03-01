import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

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

    // connect-src with CDN and WebSocket
    expect(csp).toContain("connect-src");
    expect(csp).toContain("https://cdn.jsdelivr.net");

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
  });

  it('should contain report-to directive', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy-report-only'];
    expect(csp).toContain("report-to csp-endpoint");
  });

  it('should accept and log CSP violation reports', async () => {
    const report = {
      'csp-report': {
        'document-uri': 'https://oyotradeministry.com.ng/',
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

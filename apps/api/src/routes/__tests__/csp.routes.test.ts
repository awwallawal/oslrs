import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const createTestApp = async () => {
  const app = express();

  // JSON parsing is now scoped inside the CSP router itself
  const { default: cspRoutes } = await import('../csp.routes.js');
  app.use('/api/v1', cspRoutes);

  return app;
};

describe('CSP Report Endpoint', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('should accept a valid CSP violation report and return 204', async () => {
    const report = {
      'csp-report': {
        'document-uri': 'https://oyotradeministry.com.ng/dashboard',
        'violated-directive': 'script-src',
        'blocked-uri': 'https://evil.example.com/script.js',
        'source-file': 'https://oyotradeministry.com.ng/dashboard',
        'line-number': 42,
      },
    };

    const res = await request(app)
      .post('/api/v1/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify(report));

    expect(res.status).toBe(204);
  });

  it('should accept Reporting API v2 format and return 204', async () => {
    const reports = [
      {
        type: 'csp-violation',
        url: 'https://oyotradeministry.com.ng/dashboard',
        body: {
          documentURL: 'https://oyotradeministry.com.ng/dashboard',
          violatedDirective: 'script-src',
          blockedURL: 'https://evil.example.com/script.js',
          sourceFile: 'https://oyotradeministry.com.ng/dashboard',
          lineNumber: 42,
        },
      },
    ];

    const res = await request(app)
      .post('/api/v1/csp-report')
      .set('Content-Type', 'application/reports+json')
      .send(JSON.stringify(reports));

    expect(res.status).toBe(204);
  });

  it('should handle malformed body gracefully and return 400', async () => {
    const res = await request(app)
      .post('/api/v1/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send('not valid json at all');

    expect(res.status).toBe(400);
  });

  it('should rate-limit excessive reports', async () => {
    const report = JSON.stringify({
      'csp-report': {
        'document-uri': 'https://oyotradeministry.com.ng/',
        'violated-directive': 'script-src',
        'blocked-uri': 'inline',
      },
    });

    // Send 10 requests (within limit)
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/v1/csp-report')
        .set('Content-Type', 'application/csp-report')
        .send(report);
    }

    // 11th request should be rate-limited
    const res = await request(app)
      .post('/api/v1/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(report);

    expect(res.status).toBe(429);
  });
});

/**
 * Security Hardening Tests
 * Story SEC2-3: Body size limit, CSP enforcement, CORS validation
 */

import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js';

const request = supertest(app);

describe('Security: Application Hardening (SEC2-3)', () => {
  describe('Body size limit (AC2)', () => {
    it('returns 413 for request body exceeding 1MB', async () => {
      // Generate a payload just over 1MB
      const oversizedBody = { data: 'x'.repeat(1.1 * 1024 * 1024) };

      const res = await request
        .post('/api/v1/auth/login')
        .send(oversizedBody)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(413);
    });

    it('accepts request body under 1MB', async () => {
      const normalBody = { email: 'test@example.com', password: 'test123' };

      const res = await request
        .post('/api/v1/auth/login')
        .send(normalBody)
        .set('Content-Type', 'application/json');

      // Should NOT be 413 — may be 400/401/422 but not payload-too-large
      expect(res.status).not.toBe(413);
    });
  });

  describe('CSP enforcement (AC3)', () => {
    it('uses report-only CSP in non-production mode', async () => {
      const res = await request.get('/health');

      // In test mode (NODE_ENV !== 'production'), reportOnly = true
      // Header should be Content-Security-Policy-Report-Only, not Content-Security-Policy
      expect(res.headers['content-security-policy-report-only']).toBeDefined();
      expect(res.headers['content-security-policy']).toBeUndefined();
    });

    it('CSP header contains required security directives', async () => {
      const res = await request.get('/health');
      const csp = res.headers['content-security-policy-report-only'] as string;

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain('report-uri /api/v1/csp-report');
    });
  });

  describe('CORS configuration (AC4)', () => {
    it('does not return wildcard Access-Control-Allow-Origin', async () => {
      const res = await request
        .options('/api/v1/auth/login')
        .set('Origin', 'https://malicious-site.com');

      // CORS should never return '*' as Access-Control-Allow-Origin
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('does not reflect unauthorized origins', async () => {
      const res = await request
        .options('/api/v1/auth/login')
        .set('Origin', 'https://malicious-site.com')
        .set('Access-Control-Request-Method', 'POST');

      // Malicious origin should not be reflected back as allowed
      const allowOrigin = res.headers['access-control-allow-origin'];
      expect(allowOrigin).not.toBe('https://malicious-site.com');
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// Mock the middleware BEFORE importing app using vi.hoisted
const mocks = vi.hoisted(() => {
  return { rateLimitMock: vi.fn((req: any, res: any, next: any) => next()) };
});

vi.mock('../middleware/rate-limit.js', () => ({
  publicVerificationRateLimit: mocks.rateLimitMock,
  ninCheckRateLimit: mocks.rateLimitMock,
}));

// Mock auth so supertest requests pass authentication
vi.mock('../middleware/auth.js', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { sub: 'rate-limit-test-user', role: 'enumerator' };
    next();
  },
}));

import { app } from '../app.js';

describe('Security: Rate Limiting', () => {
  beforeEach(() => {
    mocks.rateLimitMock.mockClear();
    mocks.rateLimitMock.mockImplementation((req: any, res: any, next: any) => next());
  });

  it('should allow requests within the limit', async () => {
    const res = await request(app).get('/api/v1/users/verify/123');
    expect(res.status).not.toBe(429);
  });

  it('should block requests exceeding the limit (Observability Check)', async () => {
    // Simulate Rate Limit Exceeded
    mocks.rateLimitMock.mockImplementation((req: any, res: any) => {
      res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many verification requests, please try again later'
      });
    });

    const res = await request(app).get('/api/v1/users/verify/spam-target');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      status: 'error',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many verification requests, please try again later'
    });
  });

  it('should enforce ninCheckRateLimit on POST /forms/check-nin (AC 3.7.3)', async () => {
    // Simulate rate limit exceeded specifically for the NIN check endpoint
    mocks.rateLimitMock.mockImplementation((req: any, res: any) => {
      res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many NIN check requests, please try again later',
      });
    });

    const res = await request(app)
      .post('/api/v1/forms/check-nin')
      .send({ nin: '61961438053' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});


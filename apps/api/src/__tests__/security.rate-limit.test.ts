import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// Mock the middleware BEFORE importing app using vi.hoisted
const mocks = vi.hoisted(() => {
  return { rateLimitMock: vi.fn((req, res, next) => next()) };
});

vi.mock('../middleware/rate-limit.js', () => ({
  publicVerificationRateLimit: mocks.rateLimitMock
}));

import { app } from '../app.js';

describe('Security: Rate Limiting', () => {
  beforeEach(() => {
    mocks.rateLimitMock.mockClear();
    mocks.rateLimitMock.mockImplementation((req, res, next) => next());
  });

  it('should allow requests within the limit', async () => {
    const res = await request(app).get('/api/v1/users/verify/123');
    expect(res.status).not.toBe(429);
  });

  it('should block requests exceeding the limit (Observerability Check)', async () => {
    // Simulate Rate Limit Exceeded
    mocks.rateLimitMock.mockImplementation((req, res, next) => {
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
});


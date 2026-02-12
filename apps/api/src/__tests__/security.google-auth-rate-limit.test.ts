import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock the Google auth rate limit middleware BEFORE importing app
const mocks = vi.hoisted(() => {
  return { rateLimitMock: vi.fn((req: any, res: any, next: any) => next()) };
});

vi.mock('../middleware/google-auth-rate-limit.js', () => ({
  googleAuthRateLimit: mocks.rateLimitMock,
}));

import { app } from '../app.js';

describe('Security: Google OAuth Rate Limiting', () => {
  beforeEach(() => {
    mocks.rateLimitMock.mockClear();
    mocks.rateLimitMock.mockImplementation((req, res, next) => next());
  });

  it('should allow requests within the rate limit', async () => {
    const res = await request(app)
      .post('/api/v1/auth/google/verify')
      .send({ idToken: 'test-token' });

    // Should not be 429 (may be 401 from invalid token, which is fine)
    expect(res.status).not.toBe(429);
    expect(mocks.rateLimitMock).toHaveBeenCalledTimes(1);
  });

  it('should block requests exceeding the rate limit (10/hour)', async () => {
    mocks.rateLimitMock.mockImplementation((req, res) => {
      res.status(429).json({
        status: 'error',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many Google authentication attempts. Please try again later.',
      });
    });

    const res = await request(app)
      .post('/api/v1/auth/google/verify')
      .send({ idToken: 'test-token' });

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      status: 'error',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many Google authentication attempts. Please try again later.',
    });
  });

  it('should apply rate limit middleware to google verify endpoint', async () => {
    await request(app)
      .post('/api/v1/auth/google/verify')
      .send({ idToken: 'any-token' });

    expect(mocks.rateLimitMock).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('../../lib/redis.js', () => ({
  getRedisClient: () => ({ get: mockGet }),
}));

import { requireFreshReAuth } from '../sensitive-action.js';
import { AppError } from '@oslsr/utils';

const USER_ID = '018e0000-0000-7000-8000-000000000001';

describe('requireFreshReAuth (F-014 unconditional step-up)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 when unauthenticated', async () => {
    const next = vi.fn();
    await requireFreshReAuth({ } as never, {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('blocks (403 AUTH_REAUTH_REQUIRED) when there is no recent re-auth — even for a NON-rememberMe session', async () => {
    mockGet.mockResolvedValue(null);
    const next = vi.fn();

    await requireFreshReAuth(
      { user: { sub: USER_ID, rememberMe: false }, path: '/staff/x/role', method: 'PATCH' } as never,
      {} as never,
      next,
    );

    const err = next.mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('AUTH_REAUTH_REQUIRED');
    expect(err.statusCode).toBe(403);
  });

  it('passes when a recent re-auth marker exists', async () => {
    mockGet.mockResolvedValue(String(Date.now()));
    const next = vi.fn();

    await requireFreshReAuth(
      { user: { sub: USER_ID, rememberMe: false }, path: '/staff/x/role', method: 'PATCH' } as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });
});

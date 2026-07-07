import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockWhere } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockWhere: vi.fn(),
}));
vi.mock('../../lib/redis.js', () => ({
  getRedisClient: () => ({ get: mockGet }),
}));
// 13-18 — `requireFreshReAuthExceptPasswordless` reads users.passwordHash when
// no fresh marker exists. Mock the drizzle select chain, not the DB.
vi.mock('../../db/index.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: mockWhere }) }),
  },
}));

import { requireFreshReAuth, requireFreshReAuthExceptPasswordless } from '../sensitive-action.js';
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

describe('requireFreshReAuthExceptPasswordless (13-18 profile gate)', () => {
  beforeEach(() => vi.clearAllMocks());

  const req = { user: { sub: USER_ID }, path: '/users/profile', method: 'PATCH' } as never;

  it('401 when unauthenticated', async () => {
    const next = vi.fn();
    await requireFreshReAuthExceptPasswordless({} as never, {} as never, next);
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('passes on a fresh marker WITHOUT querying the DB', async () => {
    mockGet.mockResolvedValue(String(Date.now()));
    const next = vi.fn();

    await requireFreshReAuthExceptPasswordless(req, {} as never, next);

    expect(next).toHaveBeenCalledWith();
    expect(mockWhere).not.toHaveBeenCalled();
  });

  it('blocks (403 AUTH_REAUTH_REQUIRED) a password-holding account with no marker', async () => {
    mockGet.mockResolvedValue(null);
    mockWhere.mockResolvedValue([{ passwordHash: '$2b$10$hash' }]);
    const next = vi.fn();

    await requireFreshReAuthExceptPasswordless(req, {} as never, next);

    const err = next.mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('AUTH_REAUTH_REQUIRED');
    expect(err.statusCode).toBe(403);
  });

  it('exempts a passwordless account (passwordHash null) — it cannot answer a password modal', async () => {
    mockGet.mockResolvedValue(null);
    mockWhere.mockResolvedValue([{ passwordHash: null }]);
    const next = vi.fn();

    await requireFreshReAuthExceptPasswordless(req, {} as never, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('does NOT exempt when the user row is missing (fail closed)', async () => {
    mockGet.mockResolvedValue(null);
    mockWhere.mockResolvedValue([]);
    const next = vi.fn();

    await requireFreshReAuthExceptPasswordless(req, {} as never, next);

    const err = next.mock.calls[0][0] as AppError;
    expect(err.code).toBe('AUTH_REAUTH_REQUIRED');
  });
});

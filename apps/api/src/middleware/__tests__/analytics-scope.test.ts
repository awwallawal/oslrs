import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole } from '@oslsr/types';
import { AppError } from '@oslsr/utils';

// Hoisted mock for db query chain: select → from → innerJoin → where → limit
const mockLimit = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: (...args: unknown[]) => mockLimit(...args),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('../../db/schema/team-assignments.js', () => ({
  teamAssignments: {
    supervisorId: 'supervisor_id',
    lgaId: 'lga_id',
    unassignedAt: 'unassigned_at',
  },
}));

vi.mock('../../db/schema/lgas.js', () => ({
  lgas: { id: 'id', code: 'code' },
}));

import { resolveAnalyticsScope } from '../analytics-scope.js';

function makeReq(user?: Record<string, unknown>) {
  return { user } as any;
}

describe('resolveAnalyticsScope middleware', () => {
  const res = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets system scope for Super Admin', async () => {
    const req = makeReq({ sub: 'u1', role: UserRole.SUPER_ADMIN });
    const next = vi.fn();

    await resolveAnalyticsScope(req, res, next);

    expect(req.analyticsScope).toEqual({ type: 'system' });
    expect(next).toHaveBeenCalledWith();
  });

  it('sets system scope for Government Official', async () => {
    const req = makeReq({ sub: 'u2', role: UserRole.GOVERNMENT_OFFICIAL });
    const next = vi.fn();

    await resolveAnalyticsScope(req, res, next);

    expect(req.analyticsScope).toEqual({ type: 'system' });
    expect(next).toHaveBeenCalledWith();
  });

  it('sets system scope for Verification Assessor', async () => {
    const req = makeReq({ sub: 'u3', role: UserRole.VERIFICATION_ASSESSOR });
    const next = vi.fn();

    await resolveAnalyticsScope(req, res, next);

    expect(req.analyticsScope).toEqual({ type: 'system' });
    expect(next).toHaveBeenCalledWith();
  });

  it('sets LGA scope for Supervisor with active assignment', async () => {
    const lgaId = 'lga-uuid-123';
    const lgaCode = 'ibadan-north';
    mockLimit.mockResolvedValue([{ lgaId, lgaCode }]);

    const req = makeReq({ sub: 'sup1', role: UserRole.SUPERVISOR });
    const next = vi.fn();

    await resolveAnalyticsScope(req, res, next);

    expect(req.analyticsScope).toEqual({ type: 'lga', lgaId, lgaCode });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects Supervisor with no active LGA assignment', async () => {
    mockLimit.mockResolvedValue([]);

    const req = makeReq({ sub: 'sup2', role: UserRole.SUPERVISOR });
    const next = vi.fn();

    await resolveAnalyticsScope(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].code).toBe('FORBIDDEN');
    expect(req.analyticsScope).toBeUndefined();
  });

  it('sets personal scope for Enumerator', async () => {
    const req = makeReq({ sub: 'enum1', role: UserRole.ENUMERATOR });
    const next = vi.fn();

    await resolveAnalyticsScope(req, res, next);

    expect(req.analyticsScope).toEqual({ type: 'personal', userId: 'enum1' });
    expect(next).toHaveBeenCalledWith();
  });

  it('sets personal scope for Data Entry Clerk', async () => {
    const req = makeReq({ sub: 'clerk1', role: UserRole.DATA_ENTRY_CLERK });
    const next = vi.fn();

    await resolveAnalyticsScope(req, res, next);

    expect(req.analyticsScope).toEqual({ type: 'personal', userId: 'clerk1' });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects unknown/unauthorized role (Public User)', async () => {
    const req = makeReq({ sub: 'pub1', role: UserRole.PUBLIC_USER });
    const next = vi.fn();

    await resolveAnalyticsScope(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].code).toBe('FORBIDDEN');
  });

  it('rejects unauthenticated request (no user)', async () => {
    const req = makeReq(undefined);
    const next = vi.fn();

    await resolveAnalyticsScope(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].code).toBe('AUTH_REQUIRED');
  });
});

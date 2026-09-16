import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Story 13-68 (consolidated scope, 2026-09-16) — account lockout must DECAY.
 *
 * `users.failedLoginAttempts` used to be reset only by a successful login or a password reset. Nothing
 * cleared it when `lockedUntil` expired, so an account that had ever reached 10 failures stayed at 10:
 * ONE further wrong password re-locked it for another 30 minutes, and two requests an hour held it locked
 * forever. That turned the per-IP login limiter into the only meter on a mass account-lockout DoS.
 *
 * These tests drive `loginStaff` / `loginPublic` with a mocked db and assert what is WRITTEN. The
 * assertion that encodes the defect is "an expired lock + one wrong password → counter 1, no new lock";
 * remove the decay and it becomes "counter 11, locked again".
 *
 * Also pins the `invalid_password` log line carrying `email` (the sibling `user_not_found` branch already
 * does), so distinct-identifier-per-IP is a single-field aggregation over `auth.login_failed`.
 */

const { mockFindFirst, setCalls, warn, mockCompare } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  setCalls: [] as Array<Record<string, unknown>>,
  warn: vi.fn(),
  mockCompare: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    query: { users: { findFirst: mockFindFirst } },
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => {
        setCalls.push(values);
        return { where: vi.fn(async () => undefined) };
      },
    })),
  },
}));

vi.mock('pino', () => ({
  default: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@oslsr/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@oslsr/utils')>();
  return { ...actual, comparePassword: mockCompare };
});

const { AuthService, EXTENDED_LOCKOUT_THRESHOLD } = await import('../auth.service.js');

const MINUTE = 60 * 1000;

function makeUser(role: 'enumerator' | 'public_user', overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'enumerator.a@gmail.com',
    fullName: 'Enumerator A',
    status: 'active',
    role: { name: role },
    authProvider: 'email',
    lockedUntil: null,
    failedLoginAttempts: 0,
    mfaEnabled: false,
    passwordHash: 'hashed-password',
    ...overrides,
  };
}

const paths = [
  { name: 'loginStaff', role: 'enumerator' as const, login: (e: string) => AuthService.loginStaff(e, 'wrong', false, '141.0.12.87') },
  { name: 'loginPublic', role: 'public_user' as const, login: (e: string) => AuthService.loginPublic(e, 'wrong', false, '141.0.12.87') },
];

describe.each(paths)('$name — lockout decay (Story 13-68)', ({ role, login }) => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockCompare.mockReset();
    mockCompare.mockResolvedValue(false);
    warn.mockClear();
    setCalls.length = 0;
  });

  it('⛔ an EXPIRED lock clears the counter, so one wrong password counts as failure 1 — not a re-lock', async () => {
    mockFindFirst.mockResolvedValueOnce(
      makeUser(role, { failedLoginAttempts: EXTENDED_LOCKOUT_THRESHOLD, lockedUntil: new Date(Date.now() - MINUTE) }),
    );

    await expect(login('enumerator.a@gmail.com')).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });

    // The decay write, then the failure write.
    expect(setCalls[0]).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null });
    const failureWrite = setCalls[setCalls.length - 1];
    expect(failureWrite).toMatchObject({ failedLoginAttempts: 1, lockedUntil: null });
  });

  it('an ACTIVE lock is untouched: still refused, nothing reset, nothing written', async () => {
    const lockedUntil = new Date(Date.now() + 10 * MINUTE);
    mockFindFirst.mockResolvedValueOnce(
      makeUser(role, { failedLoginAttempts: EXTENDED_LOCKOUT_THRESHOLD, lockedUntil }),
    );

    await expect(login('enumerator.a@gmail.com')).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_LOCKED' });
    expect(setCalls).toEqual([]);
    expect(mockCompare).not.toHaveBeenCalled();
  });

  it('no lock ever set: the counter still ACCUMULATES toward the threshold (decay is on expiry, not on every attempt)', async () => {
    mockFindFirst.mockResolvedValueOnce(makeUser(role, { failedLoginAttempts: 7, lockedUntil: null }));

    await expect(login('enumerator.a@gmail.com')).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toMatchObject({ failedLoginAttempts: 8, lockedUntil: null });
  });

  it('the 10th failure still locks the account for 30 minutes (the threshold itself is unchanged)', async () => {
    mockFindFirst.mockResolvedValueOnce(makeUser(role, { failedLoginAttempts: EXTENDED_LOCKOUT_THRESHOLD - 1 }));

    await expect(login('enumerator.a@gmail.com')).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    const [write] = setCalls;
    expect(write.failedLoginAttempts).toBe(EXTENDED_LOCKOUT_THRESHOLD);
    expect(write.lockedUntil).toBeInstanceOf(Date);
    const ms = (write.lockedUntil as Date).getTime() - Date.now();
    expect(ms).toBeGreaterThan(29 * MINUTE);
    expect(ms).toBeLessThanOrEqual(30 * MINUTE);
  });

  // Adversarial review 2026-09-16, L2. `user_not_found` used to throw before any bcrypt work, so response time
  // told a prober which addresses have ACTIVE accounts (the other states already answer with their own codes).
  it('an unknown email still spends a password compare, so response time does not reveal whether the account exists', async () => {
    mockFindFirst.mockResolvedValueOnce(undefined);

    await expect(login('nobody-here@gmail.com')).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    expect(mockCompare).toHaveBeenCalledTimes(1);
    expect(mockCompare).toHaveBeenCalledWith('wrong', expect.stringMatching(/^\$2[aby]\$/));
    expect(setCalls).toEqual([]);
  });

  it('logs the normalised email on invalid_password, so distinct-identifier-per-IP needs ONE field', async () => {
    mockFindFirst.mockResolvedValueOnce(makeUser(role));

    await expect(login('  Enumerator.A@Gmail.com ')).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    const invalid = warn.mock.calls.map((c) => c[0]).filter((o) => o?.reason === 'invalid_password');
    expect(invalid).toEqual([
      expect.objectContaining({ event: 'auth.login_failed', email: 'enumerator.a@gmail.com', ipAddress: '141.0.12.87' }),
    ]);
  });
});

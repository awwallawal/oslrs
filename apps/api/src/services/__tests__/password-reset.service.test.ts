/**
 * PasswordResetService tests — F-011 (sec-r2): reset tokens hashed at rest.
 *
 * Asserts the bearer secret is never persisted in plaintext:
 *  - the Redis key + users.passwordResetToken store SHA-256(token), NOT the emailed token
 *  - the reset flow still completes end-to-end with the PLAINTEXT token from the email
 *
 * Mock convention mirrors token.service.test.ts (vi.hoisted + vi.mock).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';

// Stateful Redis mock — setex writes to a Map, get reads it, so the
// hash-at-store → hash-at-lookup round-trip is actually exercised.
const mockRedis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    _store: store,
    setex: vi.fn((key: string, _ttl: number, val: string) => {
      store.set(key, val);
      return Promise.resolve('OK');
    }),
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    exists: vi.fn((key: string) => Promise.resolve(store.has(key) ? 1 : 0)),
    incr: vi.fn((key: string) => {
      const n = Number(store.get(key) ?? '0') + 1;
      store.set(key, String(n));
      return Promise.resolve(n);
    }),
    ttl: vi.fn(() => Promise.resolve(3600)),
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
  };
});

vi.mock('../../lib/redis.js', () => ({
  getRedisClient: vi.fn(() => mockRedis),
}));

// Capture what the service writes to users.passwordResetToken.
const dbState = vi.hoisted(() => ({ capturedSet: null as Record<string, unknown> | null }));
const mockDb = vi.hoisted(() => ({
  query: { users: { findFirst: vi.fn() } },
  update: vi.fn(() => ({
    set: (obj: Record<string, unknown>) => {
      dbState.capturedSet = obj;
      return { where: () => Promise.resolve() };
    },
  })),
}));

vi.mock('../../db/index.js', () => ({ db: mockDb }));

// resetPassword pulls in password hashing + session/token revocation — stub them
// so the test can exercise the hashed-key single-use path without a real DB/Redis.
vi.mock('@oslsr/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oslsr/utils')>()),
  hashPassword: vi.fn(() => Promise.resolve('hashed-new-password')),
}));
vi.mock('../session.service.js', () => ({
  SessionService: { invalidateAllUserSessions: vi.fn(() => Promise.resolve()) },
}));
vi.mock('../token.service.js', () => ({
  TokenService: { revokeAllUserTokens: vi.fn(() => Promise.resolve()) },
}));

import { PasswordResetService } from '../password-reset.service.js';

const TOKEN_KEY_PREFIX = 'password_reset:';
const RATE_KEY_PREFIX = 'password_reset_rate:';
const EMAIL = 'reset.user@example.com';
const FAKE_USER = { id: '018e5f2a-1234-7890-abcd-1234567890ab', email: EMAIL, status: 'active', authProvider: 'email' };

describe('PasswordResetService — F-011 token hashing at rest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis._store.clear();
    dbState.capturedSet = null;
    mockDb.query.users.findFirst.mockResolvedValue(FAKE_USER);
  });

  it('persists SHA-256(token) — NOT the plaintext — in the Redis key and the DB column', async () => {
    const { token } = await PasswordResetService.requestReset(EMAIL);
    expect(token).toBeTruthy();

    const expectedHash = createHash('sha256').update(token as string).digest('hex');

    // Redis token key is the hash, not the plaintext.
    const tokenKey = [...mockRedis._store.keys()].find(
      (k) => k.startsWith(TOKEN_KEY_PREFIX) && !k.startsWith(RATE_KEY_PREFIX),
    );
    expect(tokenKey).toBe(`${TOKEN_KEY_PREFIX}${expectedHash}`);
    expect(tokenKey).not.toContain(token as string); // plaintext never in the key

    // DB column is a 64-char hex hash, not the emailed token.
    expect(dbState.capturedSet?.passwordResetToken).toBe(expectedHash);
    expect(dbState.capturedSet?.passwordResetToken).toMatch(/^[0-9a-f]{64}$/);
    expect(dbState.capturedSet?.passwordResetToken).not.toBe(token);
  });

  it('still validates end-to-end with the PLAINTEXT token from the email', async () => {
    const { token } = await PasswordResetService.requestReset(EMAIL);

    const result = await PasswordResetService.validateToken(token as string);

    expect(result.userId).toBe(FAKE_USER.id);
    expect(result.email).toBe(EMAIL);
  });

  it('rejects a token whose hash is not stored (e.g. the raw hash guessed)', async () => {
    await PasswordResetService.requestReset(EMAIL);
    // Submitting the stored HASH as if it were the token must NOT validate
    // (it would only match if we double-hashed — proves lookup hashes the input).
    const storedHashKey = [...mockRedis._store.keys()].find(
      (k) => k.startsWith(TOKEN_KEY_PREFIX) && !k.startsWith(RATE_KEY_PREFIX),
    )!;
    const storedHash = storedHashKey.slice(TOKEN_KEY_PREFIX.length);

    await expect(PasswordResetService.validateToken(storedHash)).rejects.toThrow();
  });

  it('marks the hashed key single-use: after resetPassword, the same plaintext is rejected', async () => {
    const { token } = await PasswordResetService.requestReset(EMAIL);

    // First reset succeeds with the plaintext token (looked up via its hash).
    await expect(
      PasswordResetService.resetPassword(token as string, 'NewStr0ng!Pass'),
    ).resolves.toBeUndefined();

    // The hashed Redis entry is now flagged used → re-validating the SAME
    // plaintext must fail (proves mark-used keyed off the hash, not the raw token).
    await expect(
      PasswordResetService.validateToken(token as string),
    ).rejects.toThrow(/already been used/i);
  });
});

/**
 * F-019 (Story 9-42 AC#6) — password-reset rate-limit keys by normalized email
 * + the documented max matches NFR4.4 (3/email/hour).
 *
 * Disposition: ALREADY SATISFIED AT HEAD. The NFR4.4 per-email budget is
 * enforced at the SERVICE layer (`PasswordResetService.checkRateLimit`, keyed
 * `password_reset_rate:<lowercased-email>`, max = RESET_RATE_LIMIT = 3, window
 * = RESET_RATE_WINDOW = 3600s). The route middleware `passwordResetRateLimit`
 * is a deliberate SECONDARY per-IP throttle (10/IP/hr defense-in-depth), as
 * documented in middleware/__tests__/rate-limit-coverage.test.ts. These tests
 * pin the per-email keying + max so a regression on either is caught.
 *
 * `checkRateLimit` short-circuits in test mode, so this block temporarily
 * disables test mode to exercise the real Redis-keyed branch.
 */
describe('PasswordResetService — F-019 per-email rate-limit keying (NFR4.4)', () => {
  const origVitest = process.env.VITEST;
  const origNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis._store.clear();
    delete process.env.VITEST;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    if (origVitest !== undefined) process.env.VITEST = origVitest;
    else delete process.env.VITEST;
    process.env.NODE_ENV = origNodeEnv;
  });

  it('keys the rate-limit counter by the lowercased+trimmed email', async () => {
    const res = await PasswordResetService.checkRateLimit('  Mixed.Case@Example.COM ');

    expect(mockRedis.get).toHaveBeenCalledWith('password_reset_rate:mixed.case@example.com');
    expect(res.allowed).toBe(true);
  });

  it('blocks the request once the per-email count reaches the max (3)', async () => {
    const email = 'limit@example.com';
    mockRedis._store.set(`password_reset_rate:${email}`, '3'); // already at NFR4.4 cap

    const res = await PasswordResetService.checkRateLimit(email);

    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });

  it('exposes the NFR4.4 contract constants (3 per 1-hour window)', () => {
    const c = PasswordResetService.getConstants();
    expect(c.RESET_RATE_LIMIT).toBe(3);
    expect(c.RESET_RATE_WINDOW).toBe(60 * 60);
  });
});

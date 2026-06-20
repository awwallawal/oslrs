import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateEnvironment } from '../app.js';

/**
 * Story 9-45 AC#1 (F-005) — fail-closed boot.
 * `process.exit` is stubbed to throw a sentinel so we can assert it was called
 * without actually killing the test runner.
 */
class ExitCalled extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

describe('validateEnvironment (F-005 fail-closed boot)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitCalled(code ?? 0);
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function setProdSecrets() {
    vi.stubEnv('JWT_SECRET', 'x'.repeat(40));
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'y'.repeat(40));
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    vi.stubEnv('HCAPTCHA_SECRET_KEY', 'secret');
    vi.stubEnv('CORS_ORIGIN', 'https://oyotradeministry.com.ng');
  }

  it('refuses to boot (exit 1) when NODE_ENV is unset outside the test runner', () => {
    vi.stubEnv('NODE_ENV', '');
    vi.stubEnv('VITEST', '');

    expect(() => validateEnvironment()).toThrow(ExitCalled);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('normalizes to test (no exit) when NODE_ENV unset but running under Vitest', () => {
    vi.stubEnv('NODE_ENV', '');
    vi.stubEnv('VITEST', 'true');

    expect(() => validateEnvironment()).not.toThrow();
    expect(process.env.NODE_ENV).toBe('test');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('boots with NODE_ENV=production when all required secrets are present', () => {
    vi.stubEnv('NODE_ENV', 'production');
    setProdSecrets();

    expect(() => validateEnvironment()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('refuses to boot (exit 1) in production when REDIS_URL is missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    setProdSecrets();
    vi.stubEnv('REDIS_URL', '');

    expect(() => validateEnvironment()).toThrow(ExitCalled);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('refuses to boot (exit 1) in production when JWT_SECRET is missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    setProdSecrets();
    vi.stubEnv('JWT_SECRET', '');

    expect(() => validateEnvironment()).toThrow(ExitCalled);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

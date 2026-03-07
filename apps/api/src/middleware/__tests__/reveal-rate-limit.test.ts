import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Test-mode tests (existing) ────────────────────────────────────────

describe('checkRevealRateLimit — test mode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITEST', 'true');
  });

  it('should return allowed=true in test mode', async () => {
    const { checkRevealRateLimit } = await import('../reveal-rate-limit.js');
    const result = await checkRevealRateLimit('user-123');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(50);
    expect(result.retryAfter).toBeUndefined();
  });

  it('should return allowed=true with deviceFingerprint in test mode', async () => {
    const { checkRevealRateLimit } = await import('../reveal-rate-limit.js');
    const result = await checkRevealRateLimit('user-123', 'fp_abc123');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(50);
  });

  it('should return allowed=true when Redis is unavailable (test mode bypasses Redis)', async () => {
    const { checkRevealRateLimit } = await import('../reveal-rate-limit.js');
    const result = await checkRevealRateLimit('user-456', null);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(50);
  });
});

// ── Redis logic tests (new — mock Redis, disable test mode) ──────────

describe('checkRevealRateLimit — Redis logic', () => {
  let mockIncr: ReturnType<typeof vi.fn>;
  let mockExpire: ReturnType<typeof vi.fn>;
  let mockDecr: ReturnType<typeof vi.fn>;
  let mockTtl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();

    mockIncr = vi.fn();
    mockExpire = vi.fn();
    mockDecr = vi.fn();
    mockTtl = vi.fn();

    // Disable test mode so Redis path is exercised
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E', '');

    // Mock ioredis with a real function constructor (not arrow)
    vi.doMock('ioredis', () => {
      // Must use function (not arrow) so it's callable with `new`
      function MockRedis() {
        return {
          incr: mockIncr,
          expire: mockExpire,
          decr: mockDecr,
          ttl: mockTtl,
        };
      }
      return { Redis: MockRedis };
    });
  });

  it('should allow when count is under limit', async () => {
    mockIncr.mockResolvedValue(5);
    mockTtl.mockResolvedValue(80000);

    const { checkRevealRateLimit } = await import('../reveal-rate-limit.js');
    const result = await checkRevealRateLimit('user-1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(45);
    expect(mockIncr).toHaveBeenCalledWith('rl:reveal:user:user-1');
  });

  it('should set TTL when key has no expiry (ttl < 0)', async () => {
    mockIncr.mockResolvedValue(1);
    mockTtl.mockResolvedValue(-1); // No TTL set

    const { checkRevealRateLimit } = await import('../reveal-rate-limit.js');
    await checkRevealRateLimit('user-1');

    expect(mockExpire).toHaveBeenCalledWith('rl:reveal:user:user-1', 86400);
  });

  it('should NOT reset TTL when key already has expiry', async () => {
    mockIncr.mockResolvedValue(10);
    mockTtl.mockResolvedValue(50000); // Has TTL

    const { checkRevealRateLimit } = await import('../reveal-rate-limit.js');
    await checkRevealRateLimit('user-1');

    // expire should NOT be called for the user key
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it('should reject and decrement when count exceeds 50', async () => {
    mockIncr.mockResolvedValue(51);
    mockDecr.mockResolvedValue(50);
    // First ttl call: user key check (after INCR), second: after DECR for retryAfter
    mockTtl.mockResolvedValueOnce(3600).mockResolvedValue(3600);

    const { checkRevealRateLimit } = await import('../reveal-rate-limit.js');
    const result = await checkRevealRateLimit('user-1');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBe(3600);
    expect(mockDecr).toHaveBeenCalledWith('rl:reveal:user:user-1');
  });

  it('should use REVEAL_WINDOW_SECONDS as retryAfter when ttl is non-positive after block', async () => {
    mockIncr.mockResolvedValue(51);
    mockDecr.mockResolvedValue(50);
    // user key ttl check: positive (has TTL), then block ttl: 0
    mockTtl.mockResolvedValueOnce(100).mockResolvedValue(0);

    const { checkRevealRateLimit } = await import('../reveal-rate-limit.js');
    const result = await checkRevealRateLimit('user-1');

    expect(result.retryAfter).toBe(86400);
  });

  it('should track device fingerprint key when provided', async () => {
    mockIncr.mockResolvedValue(1);
    mockTtl.mockResolvedValue(-1);

    const { checkRevealRateLimit } = await import('../reveal-rate-limit.js');
    await checkRevealRateLimit('user-1', 'fp_device_abc');

    // User key INCR + device key INCR
    expect(mockIncr).toHaveBeenCalledWith('rl:reveal:user:user-1');
    expect(mockIncr).toHaveBeenCalledWith('rl:reveal:device:fp_device_abc');
  });

  it('should NOT track device key when fingerprint is null', async () => {
    mockIncr.mockResolvedValue(1);
    mockTtl.mockResolvedValue(-1);

    const { checkRevealRateLimit } = await import('../reveal-rate-limit.js');
    await checkRevealRateLimit('user-1', null);

    expect(mockIncr).toHaveBeenCalledTimes(1); // Only user key
    expect(mockIncr).toHaveBeenCalledWith('rl:reveal:user:user-1');
  });

  it('should fall through to allowed on Redis error', async () => {
    mockIncr.mockRejectedValue(new Error('Connection refused'));

    const { checkRevealRateLimit } = await import('../reveal-rate-limit.js');
    const result = await checkRevealRateLimit('user-1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(50);
  });
});

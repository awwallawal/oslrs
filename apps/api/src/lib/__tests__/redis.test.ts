import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ioredis before importing the factory
const mockPing = vi.fn().mockResolvedValue('PONG');
const mockQuit = vi.fn().mockResolvedValue('OK');
const mockOn = vi.fn();

function MockRedis() {
  return { ping: mockPing, quit: mockQuit, on: mockOn };
}

vi.mock('ioredis', () => ({
  Redis: MockRedis,
}));

describe('Redis Factory (lib/redis.ts)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mockPing.mockResolvedValue('PONG');
    mockQuit.mockResolvedValue('OK');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(async () => {
    // Clean up singleton state between tests
    const { closeAllConnections } = await import('../redis.js');
    await closeAllConnections();
  });

  describe('getRedisClient()', () => {
    it('returns a Redis instance', async () => {
      const { getRedisClient } = await import('../redis.js');
      const client = getRedisClient();
      expect(client).toBeDefined();
      expect(client.ping).toBeDefined();
    });

    it('returns the same singleton on repeated calls', async () => {
      const { getRedisClient } = await import('../redis.js');
      const client1 = getRedisClient();
      const client2 = getRedisClient();
      expect(client1).toBe(client2);
    });

    it('registers error handler when .on is available', async () => {
      const { getRedisClient } = await import('../redis.js');
      getRedisClient();
      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('createRedisConnection()', () => {
    it('returns a new connection each call', async () => {
      const { createRedisConnection } = await import('../redis.js');
      const conn1 = createRedisConnection();
      const conn2 = createRedisConnection();
      expect(conn1).not.toBe(conn2);
    });

    it('registers error handler on dedicated connections', async () => {
      const { createRedisConnection } = await import('../redis.js');
      createRedisConnection();
      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('checkRedisHealth()', () => {
    it('returns connected=true with latency on success', async () => {
      const { checkRedisHealth } = await import('../redis.js');
      const result = await checkRedisHealth();
      expect(result.connected).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(mockPing).toHaveBeenCalled();
    });

    it('returns connected=false on PING failure', async () => {
      mockPing.mockRejectedValue(new Error('Connection refused'));
      const { checkRedisHealth } = await import('../redis.js');
      const result = await checkRedisHealth();
      expect(result.connected).toBe(false);
      expect(result.latencyMs).toBe(-1);
    });
  });

  describe('closeAllConnections()', () => {
    it('closes singleton client', async () => {
      const { getRedisClient, closeAllConnections } = await import('../redis.js');
      getRedisClient(); // Initialize singleton
      await closeAllConnections();
      expect(mockQuit).toHaveBeenCalled();
    });

    it('closes dedicated connections', async () => {
      const { createRedisConnection, closeAllConnections } = await import('../redis.js');
      createRedisConnection();
      createRedisConnection();
      await closeAllConnections();
      // Two dedicated connections quit
      expect(mockQuit).toHaveBeenCalledTimes(2);
    });

    it('handles already-closed connections gracefully', async () => {
      mockQuit.mockRejectedValue(new Error('Connection already closed'));
      const { getRedisClient, closeAllConnections } = await import('../redis.js');
      getRedisClient();
      // Should not throw
      await expect(closeAllConnections()).resolves.toBeUndefined();
    });

    it('resets singleton so next getRedisClient creates new instance', async () => {
      const { getRedisClient, closeAllConnections } = await import('../redis.js');
      const client1 = getRedisClient();
      await closeAllConnections();
      const client2 = getRedisClient();
      expect(client1).not.toBe(client2);
    });
  });

  describe('production REDIS_URL enforcement', () => {
    it('throws AppError when REDIS_URL is missing in production', async () => {
      vi.stubEnv('REDIS_URL', '');
      vi.stubEnv('NODE_ENV', 'production');
      const { getRedisClient } = await import('../redis.js');

      expect(() => getRedisClient()).toThrow('REDIS_URL is required in production');
      try {
        getRedisClient();
      } catch (err: unknown) {
        expect((err as { code: string }).code).toBe('REDIS_CONNECTION_FAILED');
        expect((err as { name: string }).name).toBe('AppError');
      }
    });

    it('falls back to localhost in development when REDIS_URL is missing', async () => {
      vi.stubEnv('REDIS_URL', '');
      vi.stubEnv('NODE_ENV', 'development');
      const { getRedisClient } = await import('../redis.js');

      // Should not throw — falls back to redis://localhost:6379
      expect(() => getRedisClient()).not.toThrow();
    });

    it('falls back to localhost in test when REDIS_URL is missing', async () => {
      vi.stubEnv('REDIS_URL', '');
      vi.stubEnv('NODE_ENV', 'test');
      const { getRedisClient } = await import('../redis.js');

      expect(() => getRedisClient()).not.toThrow();
    });
  });

  describe('mock compatibility', () => {
    it('handles mock objects without .on method', async () => {
      // Re-mock ioredis with an object lacking .on
      vi.doMock('ioredis', () => ({
        Redis: function MockRedisNoOn() {
          return { ping: mockPing, quit: mockQuit };
        },
      }));

      const { getRedisClient } = await import('../redis.js');
      // Should not throw even though .on is missing
      expect(() => getRedisClient()).not.toThrow();
    });

    it('handles mock objects without .quit method in close', async () => {
      vi.doMock('ioredis', () => ({
        Redis: function MockRedisNoQuit() {
          return { ping: mockPing, on: mockOn };
        },
      }));

      const { getRedisClient, closeAllConnections } = await import('../redis.js');
      getRedisClient();
      // Should not throw even though .quit is missing
      await expect(closeAllConnections()).resolves.toBeUndefined();
    });
  });
});

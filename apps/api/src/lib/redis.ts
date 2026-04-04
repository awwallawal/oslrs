import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { AppError } from '@oslsr/utils';
import pino from 'pino';

const logger = pino({ name: 'redis' });

// Resolve REDIS_URL with environment-appropriate fallback
function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (url) return url;

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    throw new AppError('REDIS_CONNECTION_FAILED', 'REDIS_URL is required in production', 500);
  }

  return 'redis://localhost:6379';
}

// Shared base options for all Redis connections
const BASE_OPTIONS: RedisOptions = {
  enableReadyCheck: true,
  lazyConnect: false,
};

// Singleton client for general use (rate limiters, services, caching)
let singletonClient: Redis | null = null;

// Track dedicated connections for graceful shutdown
const dedicatedConnections: Redis[] = [];

/**
 * Returns a lazy-initialized singleton Redis client.
 * Use for rate limiters, services, caching — anything that doesn't block.
 */
export function getRedisClient(): Redis {
  if (!singletonClient) {
    singletonClient = new Redis(getRedisUrl(), BASE_OPTIONS);
    if (typeof singletonClient.on === 'function') {
      singletonClient.on('error', (err) => {
        logger.error({ event: 'redis.singleton_error', error: err.message });
      });
    }
  }
  return singletonClient;
}

/**
 * Creates a new dedicated Redis connection.
 * Use for BullMQ queues/workers — they require separate connections
 * because they block on BRPOPLPUSH.
 *
 * Note: Connections are tracked here for closeAllConnections(), but queue/worker
 * files also manage their own close lifecycle. Double-quit is safe (caught).
 */
export function createRedisConnection(options?: Partial<RedisOptions>): Redis {
  const connection = new Redis(getRedisUrl(), {
    ...BASE_OPTIONS,
    maxRetriesPerRequest: null, // Required by BullMQ
    ...options,
  });
  if (typeof connection.on === 'function') {
    connection.on('error', (err) => {
      logger.error({ event: 'redis.connection_error', error: err.message });
    });
  }
  dedicatedConnections.push(connection);
  return connection;
}

/**
 * Checks Redis connectivity and latency.
 * Returns { connected, latencyMs } for health monitoring.
 */
export async function checkRedisHealth(): Promise<{ connected: boolean; latencyMs: number }> {
  try {
    const client = getRedisClient();
    const start = Date.now();
    await client.ping();
    return { connected: true, latencyMs: Date.now() - start };
  } catch {
    return { connected: false, latencyMs: -1 };
  }
}

/**
 * Closes the singleton and all tracked dedicated connections.
 * Call during graceful shutdown (SIGTERM/SIGINT handlers).
 *
 * Note: Queue/worker files may have already closed their dedicated connections
 * via their own close functions. Double-quit is safe — caught and ignored.
 */
export async function closeAllConnections(): Promise<void> {
  const promises: Promise<void>[] = [];

  if (singletonClient) {
    const client = singletonClient;
    singletonClient = null;
    if (typeof client.quit === 'function') {
      promises.push(client.quit().then(() => {}).catch(() => { /* already closed */ }));
    }
  }

  for (const conn of dedicatedConnections) {
    if (typeof conn.quit === 'function') {
      promises.push(conn.quit().then(() => {}).catch(() => { /* already closed */ }));
    }
  }

  await Promise.all(promises);
  dedicatedConnections.length = 0;
}

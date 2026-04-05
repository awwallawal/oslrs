/**
 * Database Pool Configuration Tests
 * Story SEC2-4: Verify explicit pool settings (AC2)
 */

import { describe, it, expect, vi } from 'vitest';

// Track Pool constructor calls
const poolConstructorCalls: Record<string, unknown>[] = [];

vi.mock('pg', () => {
  class MockPool {
    constructor(config: Record<string, unknown>) {
      poolConstructorCalls.push(config);
    }
    query = vi.fn();
    end = vi.fn();
  }
  return { default: { Pool: MockPool } };
});

// Mock drizzle to prevent actual DB initialization
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({})),
}));

// Mock schema
vi.mock('../schema/index.js', () => ({}));

// Mock dotenv
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

describe('Database pool configuration (AC2)', () => {
  it('configures pool with explicit max, idleTimeoutMillis, and connectionTimeoutMillis', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';

    await import('../index.js');

    expect(poolConstructorCalls.length).toBeGreaterThan(0);
    const poolConfig = poolConstructorCalls[0];

    // All three values must be explicit — no implicit defaults
    expect(poolConfig.max).toBe(20);
    expect(poolConfig.idleTimeoutMillis).toBe(30000);
    expect(poolConfig.connectionTimeoutMillis).toBe(2000);
    expect(poolConfig.connectionString).toBe(process.env.DATABASE_URL);
  });
});

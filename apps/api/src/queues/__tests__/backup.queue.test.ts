import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockUpsertJobScheduler = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => {
  return {
    Queue: class MockQueue {
      constructor() { /* no-op */ }
      upsertJobScheduler(...args: unknown[]) { return mockUpsertJobScheduler(...args); }
      close() { return mockClose(); }
    },
  };
});

vi.mock('ioredis', () => {
  return {
    Redis: class MockRedis {
      constructor() { /* no-op */ }
      quit() { return Promise.resolve(); }
    },
  };
});

// ── Module under test ──────────────────────────────────────────────────────

import { getBackupQueue, scheduleDailyBackup, closeBackupQueue } from '../backup.queue.js';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('backup queue', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return a queue instance', () => {
    const queue = getBackupQueue();
    expect(queue).toBeDefined();
  });

  it('should return the same queue instance on subsequent calls', () => {
    const queue1 = getBackupQueue();
    const queue2 = getBackupQueue();
    expect(queue1).toBe(queue2);
  });

  describe('scheduleDailyBackup', () => {
    it('should be a no-op in test mode', async () => {
      // VITEST=true is already set in test environment
      await scheduleDailyBackup();
      expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
    });

    it('should schedule with correct cron pattern when not in test mode', async () => {
      const originalVitest = process.env.VITEST;
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.VITEST = '';
      process.env.NODE_ENV = 'production';

      try {
        await scheduleDailyBackup();
        expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
          'daily-backup',
          { pattern: '00 01 * * *' },
          { name: 'database-backup', data: {} },
        );
      } finally {
        process.env.VITEST = originalVitest;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe('closeBackupQueue', () => {
    it('should close the queue', async () => {
      // Ensure queue is initialized
      getBackupQueue();
      await closeBackupQueue();
      expect(mockClose).toHaveBeenCalled();
    });
  });
});

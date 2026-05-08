/**
 * Story 9-10 AC#7 — Regression test for the ioredis shutdown-crash bug
 * (commit 718f84e).
 *
 * Bug: ioredis's reconnect handler closes the underlying socket during a
 * network blip; if a `connection.quit()` call lands AFTER that close (which
 * is the normal SIGINT/SIGTERM path during pm2 reload), ioredis throws
 * "Connection is closed". The Promise.all chain in workers/index.ts:
 * closeAllWorkers swallows it as an unhandled rejection and the process
 * exits non-zero, which PM2 then tags as a crash and re-launches.
 *
 * Fix: every `connection.quit()` site is wrapped in `.catch(() => {})` to
 * silence "already closed — safe" rejections, matching the pattern in
 * lib/redis.ts:closeAllConnections.
 *
 * This test mocks ioredis to deterministically reproduce the failure mode
 * (quit() always rejects with "Connection is closed") and asserts that each
 * close-* function still resolves cleanly. If a future refactor strips a
 * .catch() from any of the 5 sites, this test fails.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────

const { hoisted } = vi.hoisted(() => {
  const quitMock = vi.fn().mockRejectedValue(new Error('Connection is closed.'));
  const closeMock = vi.fn().mockResolvedValue(undefined);
  return {
    hoisted: {
      quitMock,
      closeMock,
    },
  };
});

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    constructor() {
      /* no-op */
    }
    upsertJobScheduler() {
      return Promise.resolve();
    }
    pause() {
      return Promise.resolve();
    }
    resume() {
      return Promise.resolve();
    }
    add() {
      return Promise.resolve({ id: 'mock-job-id' });
    }
    close() {
      return hoisted.closeMock();
    }
  },
  Worker: class MockWorker {
    constructor() {
      /* no-op */
    }
    on() {
      return this;
    }
    close() {
      return hoisted.closeMock();
    }
  },
  Job: class MockJob {},
}));

vi.mock('ioredis', () => ({
  Redis: class MockRedis {
    constructor() {
      /* no-op */
    }
    quit() {
      return hoisted.quitMock();
    }
    on() {
      return this;
    }
    incr() {
      return Promise.resolve(1);
    }
    expire() {
      return Promise.resolve(1);
    }
    get() {
      return Promise.resolve(null);
    }
    set() {
      return Promise.resolve('OK');
    }
    del() {
      return Promise.resolve(1);
    }
    pipeline() {
      return {
        incr: () => this,
        expire: () => this,
        exec: () => Promise.resolve([]),
      };
    }
  },
}));

vi.mock('../../lib/redis.js', () => ({
  createRedisConnection: () => ({
    quit: () => hoisted.quitMock(),
    on: () => undefined,
    incr: () => Promise.resolve(1),
    expire: () => Promise.resolve(1),
    get: () => Promise.resolve(null),
    set: () => Promise.resolve('OK'),
    del: () => Promise.resolve(1),
    pipeline: () => ({
      incr: function () { return this; },
      expire: function () { return this; },
      exec: () => Promise.resolve([]),
    }),
  }),
  closeAllConnections: () => Promise.resolve(),
}));

// Story 9-10 review H1: email.worker.ts instantiates EmailBudgetService at
// module load. Stub the 3 services it imports so the worker module can be
// imported in this test without a live DB / outbound mailer.
vi.mock('../../services/email.service.js', () => ({
  EmailService: class { /* unused — emailWorker doesn't construct it at module top */ },
}));

vi.mock('../../services/email-budget.service.js', () => ({
  EmailBudgetService: class {
    checkBudget() { return Promise.resolve({ allowed: true }); }
    recordSend() { return Promise.resolve(); }
  },
}));

vi.mock('../../services/audit.service.js', () => ({
  AuditService: class {
    log() { return Promise.resolve(); }
  },
}));

// ── Modules under test (lazy-imported after mocks) ───────────────────────

describe('ioredis shutdown-crash regression (Story 9-10 AC#7)', () => {
  beforeEach(() => {
    hoisted.quitMock.mockClear();
    hoisted.closeMock.mockClear();
    hoisted.quitMock.mockRejectedValue(new Error('Connection is closed.'));
  });

  it('confirms the failure mode itself: a raw quit() rejects with "Connection is closed"', async () => {
    await expect(hoisted.quitMock()).rejects.toThrow('Connection is closed');
  });

  it('closeBackupQueue: tolerates a rejected quit() without throwing', async () => {
    const { getBackupQueue, closeBackupQueue } = await import('../backup.queue.js');
    getBackupQueue();
    await expect(closeBackupQueue()).resolves.toBeUndefined();
    expect(hoisted.quitMock).toHaveBeenCalled();
  });

  it('closeDisputeAutoCloseQueue: tolerates a rejected quit() without throwing', async () => {
    const { getDisputeAutoCloseQueue, closeDisputeAutoCloseQueue } = await import(
      '../dispute-autoclose.queue.js'
    );
    getDisputeAutoCloseQueue();
    await expect(closeDisputeAutoCloseQueue()).resolves.toBeUndefined();
    expect(hoisted.quitMock).toHaveBeenCalled();
  });

  it('closeProductivitySnapshotQueue: tolerates a rejected quit() without throwing', async () => {
    const mod = await import('../productivity-snapshot.queue.js');
    const getter = (mod as Record<string, unknown>)['getProductivitySnapshotQueue'] as (() => unknown) | undefined;
    const closer = (mod as Record<string, unknown>)['closeProductivitySnapshotQueue'] as (() => Promise<void>) | undefined;
    if (!getter || !closer) {
      // Module export shape changed — fail loudly so the test can be updated.
      throw new Error('productivity-snapshot.queue.ts no longer exports the expected getter/closer; update this regression test.');
    }
    getter();
    await expect(closer()).resolves.toBeUndefined();
    expect(hoisted.quitMock).toHaveBeenCalled();
  });

  // Story 9-10 review H1: closeEmailWorker is the original bug locus
  // (email.worker.ts:483 in the recovered 2026-04-26 21:52 UTC stack trace).
  // The earlier closure narrative claimed all 5 sites were covered — this case
  // closes the actual gap.
  it('closeEmailWorker: tolerates a rejected quit() without throwing (original bug locus)', async () => {
    const { closeEmailWorker } = await import('../../workers/email.worker.js');
    await expect(closeEmailWorker()).resolves.toBeUndefined();
    expect(hoisted.quitMock).toHaveBeenCalled();
  });

  // Story 9-10 review H1: closeEmailQueue is the 5th site referenced in commit
  // 718f84e but missing from the original regression test. email.queue.ts has
  // no exported queue getter — every exported queue function (pause/resume/
  // drain/stats/queue*) short-circuits via `isTestMode()`. We temporarily
  // disable the test-mode flag so pauseEmailQueue's internal getEmailQueue
  // call actually instantiates the queue + connection (mocks still apply).
  it('closeEmailQueue: tolerates a rejected quit() without throwing', async () => {
    const { pauseEmailQueue, closeEmailQueue } = await import('../email.queue.js');
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await pauseEmailQueue();
    } finally {
      vi.unstubAllEnvs();
    }
    await expect(closeEmailQueue()).resolves.toBeUndefined();
    expect(hoisted.quitMock).toHaveBeenCalled();
  });

  it('Promise.all([…close fns…]) does not unhandled-reject — the SIGINT chain stays unbroken', async () => {
    // Story 9-10 review H1: chain now mirrors workers/index.ts:closeAllWorkers
    // more faithfully — includes closeEmailWorker + closeEmailQueue, the two
    // sites the original regression test silently skipped.
    const { getBackupQueue, closeBackupQueue } = await import('../backup.queue.js');
    const { getDisputeAutoCloseQueue, closeDisputeAutoCloseQueue } = await import(
      '../dispute-autoclose.queue.js'
    );
    const { closeEmailWorker } = await import('../../workers/email.worker.js');
    const { pauseEmailQueue, closeEmailQueue } = await import('../email.queue.js');

    getBackupQueue();
    getDisputeAutoCloseQueue();
    // Bootstrap email queue singleton (see standalone closeEmailQueue test for
    // why we have to disable test-mode guards).
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await pauseEmailQueue();
    } finally {
      vi.unstubAllEnvs();
    }

    // Pre-fix this would emit an unhandled rejection that crashes the SIGINT
    // shutdown sequence. With safe-catch wraps at all 5 sites the chain
    // resolves cleanly even when every quit() rejects.
    await expect(
      Promise.all([
        closeBackupQueue(),
        closeDisputeAutoCloseQueue(),
        closeEmailWorker(),
        closeEmailQueue(),
      ]),
    ).resolves.toEqual([undefined, undefined, undefined, undefined]);
  });
});

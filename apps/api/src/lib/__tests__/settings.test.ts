/**
 * Unit tests for `apps/api/src/lib/settings.ts`.
 *
 * Strategy: mock the Redis singleton + Drizzle `db` so we can drive cache
 * hit/miss paths and assert the cache-bust on write. Transactional setSetting
 * is exercised by mocking `db.transaction(cb)` to invoke the callback with a
 * `tx` proxy that records SELECT FOR UPDATE + upsert calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRedisGet,
  mockRedisSet,
  mockRedisDel,
  mockDbSelect,
  mockTxSelectForUpdate,
  mockTxInsertUpsert,
  mockDbTransaction,
} = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisDel: vi.fn(),
  mockDbSelect: vi.fn(),
  mockTxSelectForUpdate: vi.fn(),
  mockTxInsertUpsert: vi.fn(),
  mockDbTransaction: vi.fn(),
}));

vi.mock('../redis.js', () => ({
  getRedisClient: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  }),
}));

vi.mock('../../db/index.js', () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          for: (_lock: 'update') => ({
            limit: (_n: number) => mockTxSelectForUpdate(),
          }),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => mockTxInsertUpsert(),
      }),
    }),
  };
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: (_n: number) => mockDbSelect(),
          }),
          orderBy: () => mockDbSelect(),
        }),
      }),
      transaction: (cb: (tx: unknown) => Promise<unknown>) => mockDbTransaction(cb, tx),
    },
  };
});

const { getSetting, getSettingRow, setSetting, listSettings } = await import('../settings.js');

beforeEach(() => {
  mockRedisGet.mockReset();
  mockRedisSet.mockReset();
  mockRedisDel.mockReset();
  mockDbSelect.mockReset();
  mockTxSelectForUpdate.mockReset();
  mockTxInsertUpsert.mockReset();
  mockDbTransaction.mockReset();
  // Default transaction implementation: invoke the callback with the shared tx proxy
  mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>, tx: unknown) => cb(tx));
});

describe('getSetting', () => {
  it('returns parsed value on cache hit', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify(true));
    const v = await getSetting<boolean>('auth.sms_otp_enabled');
    expect(v).toBe(true);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('returns null sentinel on cache hit when value is missing', async () => {
    mockRedisGet.mockResolvedValue('__NULL__');
    const v = await getSetting<boolean>('missing.key');
    expect(v).toBeNull();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('falls through to DB on cache miss and populates cache', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockDbSelect.mockResolvedValue([{ value: false }]);
    mockRedisSet.mockResolvedValue('OK');

    const v = await getSetting<boolean>('auth.sms_otp_enabled');
    expect(v).toBe(false);
    expect(mockDbSelect).toHaveBeenCalled();
    expect(mockRedisSet).toHaveBeenCalledWith(
      'settings:auth.sms_otp_enabled',
      JSON.stringify(false),
      'EX',
      60,
    );
  });

  it('returns null + caches null sentinel when key not in DB', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockDbSelect.mockResolvedValue([]);
    mockRedisSet.mockResolvedValue('OK');

    const v = await getSetting<boolean>('absent.key');
    expect(v).toBeNull();
    expect(mockRedisSet).toHaveBeenCalledWith('settings:absent.key', '__NULL__', 'EX', 60);
  });

  it('falls through to DB when Redis read throws (graceful degradation)', async () => {
    mockRedisGet.mockRejectedValue(new Error('redis down'));
    mockDbSelect.mockResolvedValue([{ value: 'x' }]);
    mockRedisSet.mockResolvedValue('OK');

    const v = await getSetting<string>('any.key');
    expect(v).toBe('x');
  });

  it('throws AppError when DB read fails', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockDbSelect.mockRejectedValue(new Error('db connection lost'));
    await expect(getSetting('k')).rejects.toMatchObject({ code: 'SETTINGS_DB_READ_FAILED' });
  });

  it('AppError details.cause is a string (not the raw Error object)', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockDbSelect.mockRejectedValue(new Error('boom'));
    await expect(getSetting('k')).rejects.toMatchObject({
      code: 'SETTINGS_DB_READ_FAILED',
      details: { cause: 'boom' },
    });
  });
});

describe('getSettingRow', () => {
  it('returns the full row when key exists', async () => {
    const row = {
      key: 'auth.sms_otp_enabled',
      value: false,
      description: 'desc',
      updatedBy: 'uid',
      updatedAt: new Date('2026-05-06T00:00:00Z'),
      createdAt: new Date('2026-05-06T00:00:00Z'),
    };
    mockDbSelect.mockResolvedValue([row]);
    const out = await getSettingRow('auth.sms_otp_enabled');
    expect(out).toEqual(row);
  });

  it('returns null when key is absent', async () => {
    mockDbSelect.mockResolvedValue([]);
    const out = await getSettingRow('missing.key');
    expect(out).toBeNull();
  });

  it('throws AppError on DB failure', async () => {
    mockDbSelect.mockRejectedValue(new Error('db down'));
    await expect(getSettingRow('k')).rejects.toMatchObject({
      code: 'SETTINGS_DB_READ_FAILED',
      details: { cause: 'db down' },
    });
  });
});

describe('setSetting', () => {
  it('captures prior value via SELECT FOR UPDATE, upserts, returns prior value, busts cache', async () => {
    mockTxSelectForUpdate.mockResolvedValue([{ value: false }]);
    mockTxInsertUpsert.mockResolvedValue(undefined);
    mockRedisDel.mockResolvedValue(1);

    const prior = await setSetting<boolean>(
      'auth.sms_otp_enabled',
      true,
      '00000000-0000-0000-0000-000000000000',
    );

    expect(prior).toBe(false);
    expect(mockTxSelectForUpdate).toHaveBeenCalled();
    expect(mockTxInsertUpsert).toHaveBeenCalled();
    expect(mockRedisDel).toHaveBeenCalledWith('settings:auth.sms_otp_enabled');
  });

  it('returns null prior value when key did not previously exist', async () => {
    mockTxSelectForUpdate.mockResolvedValue([]);
    mockTxInsertUpsert.mockResolvedValue(undefined);
    mockRedisDel.mockResolvedValue(0);

    const prior = await setSetting<boolean>('new.key', true, 'actor');
    expect(prior).toBeNull();
  });

  it('throws AppError when transaction fails (cache untouched)', async () => {
    mockDbTransaction.mockRejectedValue(new Error('constraint violation'));
    await expect(
      setSetting('k', 'v', '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({
      code: 'SETTINGS_DB_WRITE_FAILED',
      details: { cause: 'constraint violation' },
    });
    expect(mockRedisDel).not.toHaveBeenCalled();
  });

  it('does not throw when cache invalidation fails (write still succeeds, prior value still returned)', async () => {
    mockTxSelectForUpdate.mockResolvedValue([{ value: false }]);
    mockTxInsertUpsert.mockResolvedValue(undefined);
    mockRedisDel.mockRejectedValue(new Error('redis down'));

    await expect(
      setSetting('k', 'v', '00000000-0000-0000-0000-000000000000'),
    ).resolves.toBe(false);
  });

  it('passes through optional description (no throw, returns prior value)', async () => {
    mockTxSelectForUpdate.mockResolvedValue([{ value: 'old' }]);
    mockTxInsertUpsert.mockResolvedValue(undefined);
    mockRedisDel.mockResolvedValue(1);

    const prior = await setSetting<string>('k', 'new', 'actor', { description: 'a desc' });
    expect(prior).toBe('old');
  });
});

describe('listSettings', () => {
  it('returns rows from DB', async () => {
    const rows = [
      {
        key: 'auth.sms_otp_enabled',
        value: false,
        description: 'desc',
        updatedBy: 'uid',
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ];
    mockDbSelect.mockResolvedValue(rows);
    const out = await listSettings();
    expect(out).toEqual(rows);
  });

  it('throws AppError on DB failure', async () => {
    mockDbSelect.mockRejectedValue(new Error('db down'));
    await expect(listSettings()).rejects.toMatchObject({ code: 'SETTINGS_DB_LIST_FAILED' });
  });
});

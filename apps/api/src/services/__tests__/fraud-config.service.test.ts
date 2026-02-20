import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const mockSelectResult = vi.fn<() => unknown[]>().mockReturnValue([]);
const mockTxUpdate = vi.fn();
const mockTxInsert = vi.fn();

/**
 * Create a thenable chainable object that mimics Drizzle query builder.
 * Every method returns the same chain. Awaiting it calls mockSelectResult.
 */
function makeThenableChain() {
  const chain: Record<string, unknown> = {};

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        // Make it thenable — resolve with mockSelectResult()
        return (resolve: (v: unknown) => void) => resolve(mockSelectResult());
      }
      // All other methods (from, where, orderBy, limit, etc.) return the proxy
      return () => new Proxy({}, handler);
    },
  };

  return new Proxy(chain, handler);
}

vi.mock('../../db/index.js', () => ({
  db: {
    select: () => makeThenableChain(),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: () => ({
          set: () => ({
            where: () => mockTxUpdate(),
          }),
        }),
        insert: () => ({
          values: () => ({
            returning: () => mockTxInsert(),
          }),
        }),
      };
      return fn(tx);
    },
  },
}));

vi.mock('pino', () => ({ default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

// Import after mocks
const { FraudConfigService } = await import('../fraud-config.service.js');

// ── Test Data ──────────────────────────────────────────────────────────

const now = new Date('2026-02-20T10:00:00Z');

const mockDbRow = {
  id: '123e4567-e89b-12d3-a456-426614174001',
  ruleKey: 'gps_cluster_radius_m',
  displayName: 'Cluster Radius',
  ruleCategory: 'gps',
  thresholdValue: '50',
  weight: null,
  severityFloor: null,
  isActive: true,
  effectiveFrom: now,
  effectiveUntil: null,
  version: 1,
  createdBy: '123e4567-e89b-12d3-a456-426614174000',
  createdAt: now,
  notes: null,
};

describe('FraudConfigService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectResult.mockReturnValue([]);
    process.env.VITEST = 'true';
  });

  describe('getActiveThresholds', () => {
    it('returns mapped FraudThresholdConfig array from DB rows', async () => {
      mockSelectResult.mockReturnValue([mockDbRow]);

      const result = await FraudConfigService.getActiveThresholds();

      expect(result).toHaveLength(1);
      expect(result[0].ruleKey).toBe('gps_cluster_radius_m');
      expect(result[0].thresholdValue).toBe(50);
      expect(typeof result[0].effectiveFrom).toBe('string');
    });

    it('returns empty array when no active thresholds', async () => {
      mockSelectResult.mockReturnValue([]);

      const result = await FraudConfigService.getActiveThresholds();

      expect(result).toEqual([]);
    });
  });

  describe('getThresholdValue', () => {
    it('returns the threshold value for a matching rule key', async () => {
      mockSelectResult.mockReturnValue([mockDbRow]);

      const value = await FraudConfigService.getThresholdValue('gps_cluster_radius_m');

      expect(value).toBe(50);
    });

    it('returns null for a non-existent rule key', async () => {
      mockSelectResult.mockReturnValue([mockDbRow]);

      const value = await FraudConfigService.getThresholdValue('nonexistent_key');

      expect(value).toBeNull();
    });
  });

  describe('getThresholdsByCategory', () => {
    it('groups thresholds by category', async () => {
      const rows = [
        { ...mockDbRow, ruleKey: 'gps_cluster_radius_m', ruleCategory: 'gps' },
        { ...mockDbRow, id: '2', ruleKey: 'gps_weight', ruleCategory: 'gps' },
        { ...mockDbRow, id: '3', ruleKey: 'speed_weight', ruleCategory: 'speed' },
      ];
      mockSelectResult.mockReturnValue(rows);

      const grouped = await FraudConfigService.getThresholdsByCategory();

      expect(Object.keys(grouped)).toContain('gps');
      expect(Object.keys(grouped)).toContain('speed');
      expect(grouped.gps).toHaveLength(2);
      expect(grouped.speed).toHaveLength(1);
    });
  });

  describe('updateThreshold', () => {
    it('creates a new version and closes previous', async () => {
      const newRow = {
        ...mockDbRow,
        id: 'new-id',
        thresholdValue: '100',
        version: 2,
        effectiveFrom: new Date(),
        createdBy: 'admin-1',
      };

      // First await (find current) returns mockDbRow, second await in getActiveThresholds doesn't matter
      mockSelectResult.mockReturnValueOnce([mockDbRow]);
      mockTxInsert.mockReturnValue([newRow]);
      mockTxUpdate.mockReturnValue(undefined);

      const result = await FraudConfigService.updateThreshold(
        'gps_cluster_radius_m',
        100,
        'admin-1',
      );

      expect(result.thresholdValue).toBe(100);
      expect(result.version).toBe(2);
    });

    it('throws when no active threshold found for rule key', async () => {
      mockSelectResult.mockReturnValue([]);

      await expect(
        FraudConfigService.updateThreshold('nonexistent', 42, 'admin-1'),
      ).rejects.toThrow('No active threshold found for rule key: nonexistent');
    });
  });

  describe('getCurrentConfigVersion', () => {
    it('returns max version from DB', async () => {
      mockSelectResult.mockReturnValue([{ maxVersion: 5 }]);

      const version = await FraudConfigService.getCurrentConfigVersion();

      expect(version).toBe(5);
    });

    it('returns 1 when no results', async () => {
      mockSelectResult.mockReturnValue([null]);

      const version = await FraudConfigService.getCurrentConfigVersion();

      expect(version).toBe(1);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const { mockDbExecute } = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    execute: (...args: any[]) => mockDbExecute(...args),
  },
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual('drizzle-orm');
  return { ...actual };
});

// ── Import SUT ─────────────────────────────────────────────────────────

import { MarketplaceService } from '../marketplace.service.js';

// ── Helpers ────────────────────────────────────────────────────────────

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: '018e1234-5678-7000-8000-000000000001',
    profession: 'Electrician',
    lga_name: 'Ibadan North',
    experience_level: '5-10 years',
    verified_badge: true,
    bio: 'Experienced electrician.',
    relevance_score: 0.0607,
    updated_at: '2026-03-01T12:00:00.000Z',
    ...overrides,
  };
}

function setupDbMock(dataRows: Record<string, unknown>[], totalItems: number) {
  mockDbExecute
    .mockResolvedValueOnce({ rows: dataRows })   // data query
    .mockResolvedValueOnce({ rows: [{ total: totalItems }] }); // count query
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('MarketplaceService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('searchProfiles', () => {
    it('should return profiles with relevance score for text query', async () => {
      setupDbMock([makeProfile()], 1);

      const result = await MarketplaceService.searchProfiles({ q: 'electrician' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].profession).toBe('Electrician');
      expect(result.data[0].relevanceScore).toBe(0.0607);
      expect(result.meta.pagination.totalItems).toBe(1);
    });

    it('should execute two queries (data + count) for search', async () => {
      setupDbMock([], 0);

      await MarketplaceService.searchProfiles({ q: 'electrician' });

      // Data query + count query
      expect(mockDbExecute).toHaveBeenCalledTimes(2);
    });

    it('should return browse results when no query provided', async () => {
      const rows = [
        makeProfile({ updated_at: '2026-03-06T10:00:00.000Z', relevance_score: null }),
        makeProfile({ id: '018e1234-5678-7000-8000-000000000002', updated_at: '2026-03-05T10:00:00.000Z', relevance_score: null }),
      ];
      setupDbMock(rows, 2);

      const result = await MarketplaceService.searchProfiles({});

      expect(result.data).toHaveLength(2);
      expect(result.data[0].relevanceScore).toBeNull();
    });

    it('should accept lgaId filter and return results', async () => {
      setupDbMock([makeProfile({ lga_name: 'Ibadan North' })], 1);

      const result = await MarketplaceService.searchProfiles({ lgaId: 'ibadan-north' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].lgaName).toBe('Ibadan North');
      expect(mockDbExecute).toHaveBeenCalledTimes(2);
    });

    it('should accept experienceLevel filter and return results', async () => {
      setupDbMock([makeProfile({ experience_level: '5-10 years' })], 1);

      const result = await MarketplaceService.searchProfiles({ experienceLevel: '5-10 years' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].experienceLevel).toBe('5-10 years');
    });

    it('should accept combined filters (AND logic)', async () => {
      setupDbMock([makeProfile()], 1);

      const result = await MarketplaceService.searchProfiles({
        q: 'tailor',
        lgaId: 'ibadan-north',
        experienceLevel: '5-10 years',
      });

      expect(result.data).toHaveLength(1);
      // All filter params accepted without error
      expect(mockDbExecute).toHaveBeenCalledTimes(2);
    });

    it('should implement cursor-based pagination with hasNextPage', async () => {
      // Return pageSize + 1 rows to indicate next page exists
      const rows = Array.from({ length: 21 }, (_, i) =>
        makeProfile({ id: `018e1234-5678-7000-8000-${String(i).padStart(12, '0')}` }),
      );
      setupDbMock(rows, 50);

      const result = await MarketplaceService.searchProfiles({ pageSize: 20 });

      expect(result.data).toHaveLength(20);
      expect(result.meta.pagination.hasNextPage).toBe(true);
      expect(result.meta.pagination.nextCursor).toBeTruthy();
    });

    it('should set hasNextPage to false when fewer than pageSize rows', async () => {
      setupDbMock([makeProfile()], 1);

      const result = await MarketplaceService.searchProfiles({ pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.pagination.hasNextPage).toBe(false);
      expect(result.meta.pagination.nextCursor).toBeNull();
    });

    it('should enforce max pageSize of 100', async () => {
      setupDbMock([], 0);

      // pageSize is validated by the controller (Zod), but service should respect the value
      const result = await MarketplaceService.searchProfiles({ pageSize: 100 });

      expect(result.meta.pagination.pageSize).toBe(100);
    });

    it('should default pageSize to 20', async () => {
      setupDbMock([], 0);

      const result = await MarketplaceService.searchProfiles({});

      expect(result.meta.pagination.pageSize).toBe(20);
    });

    it('should resolve lgaName from query result', async () => {
      setupDbMock([makeProfile({ lga_name: 'Ibadan North' })], 1);

      const result = await MarketplaceService.searchProfiles({});

      expect(result.data[0].lgaName).toBe('Ibadan North');
    });

    it('should map result items with only anonymous fields', async () => {
      setupDbMock([makeProfile()], 1);

      const result = await MarketplaceService.searchProfiles({ q: 'test' });

      const item = result.data[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('profession');
      expect(item).toHaveProperty('lgaName');
      expect(item).toHaveProperty('experienceLevel');
      expect(item).toHaveProperty('verifiedBadge');
      expect(item).toHaveProperty('bio');
      expect(item).toHaveProperty('relevanceScore');

      // Must NOT have PII
      expect(item).not.toHaveProperty('respondentId');
      expect(item).not.toHaveProperty('firstName');
      expect(item).not.toHaveProperty('lastName');
      expect(item).not.toHaveProperty('phoneNumber');
      expect(item).not.toHaveProperty('nin');
      expect(item).not.toHaveProperty('dateOfBirth');
    });

    it('should handle null fields gracefully', async () => {
      setupDbMock([makeProfile({
        profession: null,
        lga_name: null,
        experience_level: null,
        bio: null,
        relevance_score: null,
      })], 1);

      const result = await MarketplaceService.searchProfiles({});

      const item = result.data[0];
      expect(item.profession).toBeNull();
      expect(item.lgaName).toBeNull();
      expect(item.experienceLevel).toBeNull();
      expect(item.bio).toBeNull();
      expect(item.relevanceScore).toBeNull();
    });

    it('should return empty result with correct structure when no profiles exist', async () => {
      setupDbMock([], 0);

      const result = await MarketplaceService.searchProfiles({ q: 'nonexistent' });

      expect(result.data).toEqual([]);
      expect(result.meta.pagination.totalItems).toBe(0);
      expect(result.meta.pagination.hasNextPage).toBe(false);
      expect(result.meta.pagination.nextCursor).toBeNull();
    });

    it('should build rank-based cursor when query is present', async () => {
      const rows = Array.from({ length: 21 }, (_, i) =>
        makeProfile({
          id: `018e1234-5678-7000-8000-${String(i).padStart(12, '0')}`,
          relevance_score: 0.06 - i * 0.001,
        }),
      );
      setupDbMock(rows, 50);

      const result = await MarketplaceService.searchProfiles({ q: 'electrician', pageSize: 20 });

      const cursor = result.meta.pagination.nextCursor!;
      expect(cursor).toContain('|');
      // Cursor should contain the rank value (a number) and an ID
      const [rankPart, idPart] = cursor.split('|');
      expect(parseFloat(rankPart)).not.toBeNaN();
      expect(idPart).toMatch(/^018e/);
    });

    it('should build date-based cursor when browsing (no query)', async () => {
      const rows = Array.from({ length: 21 }, (_, i) =>
        makeProfile({
          id: `018e1234-5678-7000-8000-${String(i).padStart(12, '0')}`,
          updated_at: new Date(Date.now() - i * 3600000).toISOString(),
        }),
      );
      setupDbMock(rows, 50);

      const result = await MarketplaceService.searchProfiles({ pageSize: 20 });

      const cursor = result.meta.pagination.nextCursor!;
      expect(cursor).toContain('|');
      const [datePart] = cursor.split('|');
      expect(new Date(datePart).getTime()).not.toBeNaN();
    });

    it('should set hasPreviousPage based on cursor presence', async () => {
      setupDbMock([], 0);

      const noCursor = await MarketplaceService.searchProfiles({});
      expect(noCursor.meta.pagination.hasPreviousPage).toBe(false);

      setupDbMock([], 0);

      const withCursor = await MarketplaceService.searchProfiles({
        cursor: '2026-03-01T00:00:00.000Z|018e1234-5678-7000-8000-000000000001',
      });
      expect(withCursor.meta.pagination.hasPreviousPage).toBe(true);
    });

    it('should throw VALIDATION_ERROR for invalid cursor format (no pipe)', async () => {
      await expect(
        MarketplaceService.searchProfiles({ cursor: 'invalid-cursor' }),
      ).rejects.toThrow('Invalid cursor format');
    });

    it('should throw VALIDATION_ERROR for invalid cursor date in browse mode', async () => {
      await expect(
        MarketplaceService.searchProfiles({ cursor: 'not-a-date|some-id' }),
      ).rejects.toThrow('Invalid cursor date');
    });

    it('should throw VALIDATION_ERROR for invalid cursor rank in search mode', async () => {
      await expect(
        MarketplaceService.searchProfiles({ q: 'test', cursor: 'not-a-number|some-id' }),
      ).rejects.toThrow('Invalid cursor value');
    });
  });

  describe('getProfileById', () => {
    function makeDetailProfile(overrides: Record<string, unknown> = {}) {
      return {
        id: '018e1234-5678-7000-8000-000000000001',
        profession: 'Electrician',
        lga_name: 'Ibadan North',
        experience_level: '5-10 years',
        verified_badge: true,
        bio: 'Experienced electrician specializing in residential wiring.',
        portfolio_url: 'https://example.com/portfolio',
        created_at: '2026-03-01T12:00:00.000Z',
        ...overrides,
      };
    }

    it('should return correct anonymous fields for a valid profile', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: [makeDetailProfile()] });

      const result = await MarketplaceService.getProfileById('018e1234-5678-7000-8000-000000000001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('018e1234-5678-7000-8000-000000000001');
      expect(result!.profession).toBe('Electrician');
      expect(result!.lgaName).toBe('Ibadan North');
      expect(result!.experienceLevel).toBe('5-10 years');
      expect(result!.verifiedBadge).toBe(true);
      expect(result!.bio).toBe('Experienced electrician specializing in residential wiring.');
      expect(result!.portfolioUrl).toBe('https://example.com/portfolio');
      expect(result!.createdAt).toBe('2026-03-01T12:00:00.000Z');
    });

    it('should return null for non-existent profile', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: [] });

      const result = await MarketplaceService.getProfileById('018e0000-0000-0000-0000-000000000000');

      expect(result).toBeNull();
    });

    it('should resolve lgaName from JOIN', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: [makeDetailProfile({ lga_name: 'Ibadan South-East' })] });

      const result = await MarketplaceService.getProfileById('018e1234-5678-7000-8000-000000000001');

      expect(result!.lgaName).toBe('Ibadan South-East');
    });

    it('should return verifiedBadge as false when not verified', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: [makeDetailProfile({ verified_badge: false })] });

      const result = await MarketplaceService.getProfileById('018e1234-5678-7000-8000-000000000001');

      expect(result!.verifiedBadge).toBe(false);
    });

    it('should handle null optional fields gracefully', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [makeDetailProfile({
          experience_level: null,
          bio: null,
          portfolio_url: null,
        })],
      });

      const result = await MarketplaceService.getProfileById('018e1234-5678-7000-8000-000000000001');

      expect(result!.experienceLevel).toBeNull();
      expect(result!.bio).toBeNull();
      expect(result!.portfolioUrl).toBeNull();
    });

    it('should NOT return any PII fields', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: [makeDetailProfile()] });

      const result = await MarketplaceService.getProfileById('018e1234-5678-7000-8000-000000000001');

      // These properties must NEVER be in the return value
      expect(result).not.toHaveProperty('respondentId');
      expect(result).not.toHaveProperty('editToken');
      expect(result).not.toHaveProperty('editTokenExpiresAt');
      expect(result).not.toHaveProperty('consentEnriched');
      expect(result).not.toHaveProperty('firstName');
      expect(result).not.toHaveProperty('lastName');
      expect(result).not.toHaveProperty('phoneNumber');
      expect(result).not.toHaveProperty('nin');
      expect(result).not.toHaveProperty('dateOfBirth');
    });
  });
});

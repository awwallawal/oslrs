import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const {
  mockDbExecute,
  mockDbSelect,
  mockDbInsert,
  mockTxExecute,
  mockTxInsert,
  mockCheckRevealRateLimit,
  mockRollbackRevealCounters,
  mockAlertRevealAnomaly,
} = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockTxExecute: vi.fn(),
  mockTxInsert: vi.fn(),
  mockCheckRevealRateLimit: vi.fn(),
  mockRollbackRevealCounters: vi.fn(),
  mockAlertRevealAnomaly: vi.fn(),
}));

// Story 9-41 — control the Redis fast-path (per-user/device limit + breaker state)
// and capture anomaly-alert dispatches without touching Telegram.
vi.mock('../../middleware/reveal-rate-limit.js', () => ({
  checkRevealRateLimit: (...args: any[]) => mockCheckRevealRateLimit(...args),
  rollbackRevealCounters: (...args: any[]) => mockRollbackRevealCounters(...args),
}));

vi.mock('../reveal-anomaly-alert.service.js', () => ({
  RevealAnomalyAlertService: {
    alertRevealAnomaly: (...args: any[]) => mockAlertRevealAnomaly(...args),
  },
}));

// Chainable query builder helpers — Drizzle builders are thenable
function chainableSelect(finalResult: any[]) {
  const obj: any = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: any, reject: any) => Promise.resolve(finalResult).then(resolve, reject);
      }
      // Any chained method returns the same thenable proxy
      return vi.fn().mockReturnValue(chainableSelect(finalResult));
    },
  });
  return obj;
}

function chainableInsert() {
  const valuesProxy: any = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: any) => Promise.resolve(undefined).then(resolve);
      }
      return vi.fn().mockReturnValue(valuesProxy);
    },
  });
  return { values: vi.fn().mockReturnValue(valuesProxy) };
}

vi.mock('../../db/index.js', () => ({
  db: {
    execute: (...args: any[]) => mockDbExecute(...args),
    select: (...args: any[]) => mockDbSelect(...args),
    insert: (...args: any[]) => mockDbInsert(...args),
    transaction: (fn: any) => {
      const tx = {
        execute: (...args: any[]) => mockTxExecute(...args),
        insert: () => ({
          values: (vals: any) => {
            mockTxInsert(vals);
            return Promise.resolve();
          },
        }),
      };
      return fn(tx);
    },
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
    skills: 'electrical, solar',
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
    // Default: Redis fast-path allows, breaker not tripped, alerts no-op.
    mockCheckRevealRateLimit.mockResolvedValue({ allowed: true, remaining: 50, breakerTripped: false });
    mockRollbackRevealCounters.mockResolvedValue(undefined);
    mockAlertRevealAnomaly.mockResolvedValue(false);
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

    // ── Story 13-28 — skills surfaced on search results (AC1) ────────────

    it('13-28 — splits the stored comma-separated skills into a string[] (AC1)', async () => {
      setupDbMock([makeProfile({ skills: 'carpentry, plumbing, tiling' })], 1);

      const result = await MarketplaceService.searchProfiles({ q: 'carpenter' });

      expect(result.data[0].skills).toEqual(['carpentry', 'plumbing', 'tiling']);
    });

    it('13-28 — returns an empty skills array when skills is null (AC1 graceful)', async () => {
      setupDbMock([makeProfile({ skills: null })], 1);

      const result = await MarketplaceService.searchProfiles({});

      expect(result.data[0].skills).toEqual([]);
    });

    it('13-28 — trims whitespace and drops empty tokens from skills (AC1)', async () => {
      setupDbMock([makeProfile({ skills: ' welding ,, fabrication ' })], 1);

      const result = await MarketplaceService.searchProfiles({});

      expect(result.data[0].skills).toEqual(['welding', 'fabrication']);
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
        skills: 'electrical, solar',
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

    // ── Story 13-28 — skills surfaced on profile detail (AC1) ────────────

    it('13-28 — returns skills as a split string[] on the detail profile (AC1)', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [makeDetailProfile({ skills: 'electrical, solar, hvac' })],
      });

      const result = await MarketplaceService.getProfileById('018e1234-5678-7000-8000-000000000001');

      expect(result!.skills).toEqual(['electrical', 'solar', 'hvac']);
    });

    it('13-28 — returns an empty skills array when detail skills is null (AC1 graceful)', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [makeDetailProfile({ skills: null })],
      });

      const result = await MarketplaceService.getProfileById('018e1234-5678-7000-8000-000000000001');

      expect(result!.skills).toEqual([]);
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

  describe('revealContact', () => {
    const profileId = '018e1234-5678-7000-8000-000000000001';
    const viewerId = '018e9999-0000-7000-8000-000000000001';
    const respondentId = '018e8888-0000-7000-8000-000000000001';

    function setupRevealMocks(opts: {
      profile?: { respondentId: string; consentEnriched: boolean } | null;
      respondent?: { firstName: string | null; lastName: string | null; phoneNumber: string | null } | null;
      revealCount?: number;
      oldestCreatedAt?: Date;
      // AC#2 — per-profile distinct-viewer state (defaults are non-breaching)
      profileDistinctViewers?: number;
      profileOwnReveals?: number;
      // H1 — the viewer's step-up affordances. Default: MFA-enrolled + phone, so
      // the reachable-rung ceiling is 'mfa' (preserves pre-fix rung expectations).
      viewer?: { phone: string | null; mfaEnabled: boolean };
    }) {
      // Query 1: fetch marketplace profile (outside transaction)
      const profileChain = chainableSelect(opts.profile ? [opts.profile] : []);
      mockDbSelect.mockReturnValueOnce(profileChain);

      // Query 2: fetch respondent (outside transaction, only if profile found and consent true)
      if (opts.profile?.consentEnriched) {
        const respondentChain = chainableSelect(opts.respondent ? [opts.respondent] : []);
        mockDbSelect.mockReturnValueOnce(respondentChain);
      }

      // Query 3: fetch viewer affordances (H1 reachable-rung ceiling) — only
      // reached when the respondent exists (we return not_found before it otherwise).
      if (opts.profile?.consentEnriched && opts.respondent) {
        const viewer = opts.viewer ?? { phone: '+2348012345678', mfaEnabled: true };
        mockDbSelect.mockReturnValueOnce(chainableSelect([viewer]));
      }

      // Inside transaction (only if respondent found):
      if (opts.profile?.consentEnriched && opts.respondent) {
        const revealCount = opts.revealCount ?? 0;
        // tx.execute #1: per-user 24h count (raw SQL with FOR UPDATE)
        mockTxExecute.mockResolvedValueOnce({ rows: [{ count: revealCount }] });

        if (revealCount >= 50) {
          // tx.execute #2: oldest reveal for retryAfter (rate-limited path stops here)
          mockTxExecute.mockResolvedValueOnce({
            rows: [{
              created_at: (opts.oldestCreatedAt ?? new Date(Date.now() - 23 * 60 * 60 * 1000)).toISOString(),
            }],
          });
        } else {
          // tx.execute #2: AC#2 per-profile distinct-viewer cap query
          mockTxExecute.mockResolvedValueOnce({
            rows: [{
              distinct_viewers: opts.profileDistinctViewers ?? 0,
              own_reveals: opts.profileOwnReveals ?? 0,
            }],
          });
        }
      }
      // Note: tx.insert for contact_reveals is auto-handled by the db.transaction mock
    }

    it('should return success with PII for consented profile', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'Adebayo', lastName: 'Ogunlesi', phoneNumber: '+2348012345678' },
        revealCount: 0,
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('success');
      expect(result).toHaveProperty('data');
      if (result.status === 'success') {
        expect(result.data.firstName).toBe('Adebayo');
        expect(result.data.lastName).toBe('Ogunlesi');
        expect(result.data.phoneNumber).toBe('+2348012345678');
      }
    });

    it('should return not_found when profile does not exist', async () => {
      setupRevealMocks({ profile: null });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('not_found');
    });

    it('should return not_found when consent_enriched is false (consent gate)', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: false },
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('not_found');
    });

    it('should return not_found when respondent is missing (data integrity)', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: null,
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('not_found');
    });

    it('should return rate_limited when 50 reveals in 24h', async () => {
      const oldestCreatedAt = new Date(Date.now() - 23 * 60 * 60 * 1000); // 23h ago
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'Adebayo', lastName: 'Ogunlesi', phoneNumber: '+2348012345678' },
        revealCount: 50,
        oldestCreatedAt,
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('rate_limited');
      if (result.status === 'rate_limited') {
        expect(result.retryAfter).toBeGreaterThan(0);
        expect(result.retryAfter).toBeLessThanOrEqual(3600); // ~1 hour until oldest expires
      }
    });

    it('should insert audit row on successful reveal', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'Adebayo', lastName: 'Ogunlesi', phoneNumber: '+2348012345678' },
        revealCount: 0,
      });

      await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(mockTxInsert).toHaveBeenCalled();
    });

    it('should NOT insert audit row when consent denied', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: false },
      });

      await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(mockTxInsert).not.toHaveBeenCalled();
    });

    // ── AC#2 — per-profile distinct-viewer cap ──────────────────────────

    it('AC#2 — blocks a NEW viewer once a profile hits the distinct-viewer cap (default 5) + alerts', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'Adebayo', lastName: 'Ogunlesi', phoneNumber: '+2348012345678' },
        revealCount: 0,
        profileDistinctViewers: 5,
        profileOwnReveals: 0,
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('profile_cap_reached');
      expect(mockTxInsert).not.toHaveBeenCalled();
      expect(mockAlertRevealAnomaly).toHaveBeenCalledTimes(1);
      expect(mockAlertRevealAnomaly.mock.calls[0][0]).toContain('reveal.profile_cap');
    });

    it('AC#2 — does NOT block a viewer who already revealed this profile in-window', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'Adebayo', lastName: 'Ogunlesi', phoneNumber: '+2348012345678' },
        revealCount: 0,
        profileDistinctViewers: 10,
        profileOwnReveals: 2, // this viewer already in the set
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('success');
      expect(mockTxInsert).toHaveBeenCalled();
    });

    it('AC#2 — allows a new viewer at exactly cap-1 distinct viewers', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 0,
        profileDistinctViewers: 4, // cap is 5
        profileOwnReveals: 0,
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('success');
    });

    // ── AC#5 — progressive friction by per-viewer volume ────────────────

    it('AC#5 — requires OTP step-up at the OTP friction band (default 20)', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 20,
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('step_up_required');
      if (result.status === 'step_up_required') expect(result.requiredLevel).toBe('otp');
      expect(mockTxInsert).not.toHaveBeenCalled();
      // No breaker → no human-review alert for ordinary friction.
      expect(mockAlertRevealAnomaly).not.toHaveBeenCalled();
    });

    it('AC#5 — requires MFA step-up at the MFA friction band (default 40)', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 40,
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('step_up_required');
      if (result.status === 'step_up_required') expect(result.requiredLevel).toBe('mfa');
    });

    it('AC#5 — proceeds when the provided step-up rung satisfies the requirement', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 20,
      });

      const result = await MarketplaceService.revealContact(
        profileId, viewerId, '127.0.0.1', 'test-ua', null,
        { stepUpLevel: 'otp', purpose: 'Hiring an electrician', tosAccepted: true },
      );

      expect(result.status).toBe('success');
    });

    // ── AC#4 — global circuit-breaker (degrade, not hard-block) ─────────

    it('AC#4 — breaker forces step-up even for a low-volume viewer (fan-out defence)', async () => {
      mockCheckRevealRateLimit.mockResolvedValue({ allowed: true, remaining: 50, breakerTripped: true });
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 0, // throwaway account, near-zero personal volume
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('step_up_required');
      if (result.status === 'step_up_required') expect(result.requiredLevel).toBe('mfa');
      // Breaker breach escalates to a human.
      expect(mockAlertRevealAnomaly).toHaveBeenCalledTimes(1);
      expect(mockAlertRevealAnomaly.mock.calls[0][0]).toBe('reveal.global_breaker');
    });

    it('AC#4 — breaker degrades (step-up) rather than returning a hard rate_limited/deny', async () => {
      mockCheckRevealRateLimit.mockResolvedValue({ allowed: true, remaining: 50, breakerTripped: true });
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 0,
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).not.toBe('rate_limited');
      expect(result.status).toBe('step_up_required');
    });

    it('AC#4 — breaker is satisfied once the viewer presents MFA proof', async () => {
      mockCheckRevealRateLimit.mockResolvedValue({ allowed: true, remaining: 50, breakerTripped: true });
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 0,
      });

      const result = await MarketplaceService.revealContact(
        profileId, viewerId, '127.0.0.1', 'test-ua', null,
        { stepUpLevel: 'mfa' },
      );

      expect(result.status).toBe('success');
    });

    // ── H1 — reachable-rung ceiling (breaker/friction must DEGRADE, never
    //         demand an unsatisfiable rung for non-MFA viewers) ────────────

    it('H1 — a public viewer (no MFA) is capped at OTP at the MFA friction band, not handed an impossible MFA demand', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 40, // MFA band by volume
        viewer: { phone: '+2348011112222', mfaEnabled: false }, // not enrolled, has phone
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('step_up_required');
      if (result.status === 'step_up_required') expect(result.requiredLevel).toBe('otp');
    });

    it('H1 — when the breaker trips, a phone-less non-MFA viewer DEGRADES (reveal proceeds, capped at captcha) rather than hard-blocking + still alerts a human', async () => {
      mockCheckRevealRateLimit.mockResolvedValue({ allowed: true, remaining: 50, breakerTripped: true });
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 0,
        viewer: { phone: null, mfaEnabled: false }, // no reachable step-up rung
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      // Degrade, never hard-block: the reveal succeeds (captcha already met)...
      expect(result.status).toBe('success');
      // ...but the breaker breach STILL escalates to a human.
      expect(mockAlertRevealAnomaly).toHaveBeenCalledWith('reveal.global_breaker', expect.any(String));
    });

    // ── M1 — blocked reveals roll back the optimistic Redis counters ─────

    it('M1 — a guard-blocked reveal (step-up) rolls back the Redis counters', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 20, // OTP band, no proof provided → step_up_required
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua', 'fp_1');

      expect(result.status).toBe('step_up_required');
      expect(mockRollbackRevealCounters).toHaveBeenCalledWith(viewerId, 'fp_1');
    });

    it('M1 — a successful reveal does NOT roll back the counters', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 0,
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua', 'fp_1');

      expect(result.status).toBe('success');
      expect(mockRollbackRevealCounters).not.toHaveBeenCalled();
    });

    // ── AC#6 — purpose-binding above the volume threshold ───────────────

    it('AC#6 — requires a purpose declaration above the volume threshold (default 20)', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 20,
      });

      // step-up satisfied so we reach the purpose gate; purpose omitted
      const result = await MarketplaceService.revealContact(
        profileId, viewerId, '127.0.0.1', 'test-ua', null,
        { stepUpLevel: 'otp' },
      );

      expect(result.status).toBe('purpose_required');
      expect(mockTxInsert).not.toHaveBeenCalled();
    });

    it('AC#6 — persists purpose + ToS acceptance on the row above the threshold', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 25,
      });

      const result = await MarketplaceService.revealContact(
        profileId, viewerId, '127.0.0.1', 'test-ua', null,
        { stepUpLevel: 'mfa', purpose: 'Recruiting a welder', tosAccepted: true },
      );

      expect(result.status).toBe('success');
      expect(mockTxInsert).toHaveBeenCalledTimes(1);
      const inserted = mockTxInsert.mock.calls[0][0];
      expect(inserted.purpose).toBe('Recruiting a welder');
      expect(inserted.tosAcceptedAt).toBeInstanceOf(Date);
    });

    it('AC#6 — below the threshold the reveal is frictionless (purpose stays NULL)', async () => {
      setupRevealMocks({
        profile: { respondentId, consentEnriched: true },
        respondent: { firstName: 'A', lastName: 'B', phoneNumber: '+2348012345678' },
        revealCount: 1,
      });

      const result = await MarketplaceService.revealContact(profileId, viewerId, '127.0.0.1', 'test-ua');

      expect(result.status).toBe('success');
      const inserted = mockTxInsert.mock.calls[0][0];
      expect(inserted.purpose).toBeNull();
      expect(inserted.tosAcceptedAt).toBeNull();
    });
  });
});

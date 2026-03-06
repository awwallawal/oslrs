import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const { mockSearchProfiles, mockGetProfileById } = vi.hoisted(() => ({
  mockSearchProfiles: vi.fn(),
  mockGetProfileById: vi.fn(),
}));

vi.mock('../../services/marketplace.service.js', () => ({
  MarketplaceService: {
    searchProfiles: (...args: any[]) => mockSearchProfiles(...args),
    getProfileById: (...args: any[]) => mockGetProfileById(...args),
  },
}));

// ── Import SUT ─────────────────────────────────────────────────────────

import { MarketplaceController } from '../marketplace.controller.js';

// ── Helpers ────────────────────────────────────────────────────────────

function createMockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const emptyResult = {
  data: [],
  meta: {
    pagination: {
      pageSize: 20,
      hasNextPage: false,
      hasPreviousPage: false,
      nextCursor: null,
      previousCursor: null,
      totalItems: 0,
    },
  },
};

const sampleProfile = {
  id: '018e1234-5678-7000-8000-000000000001',
  profession: 'Electrician',
  lgaName: 'Ibadan North',
  experienceLevel: '5-10 years',
  verifiedBadge: true,
  bio: 'Experienced electrician specializing in residential wiring.',
  relevanceScore: 0.0607,
};

// ── Tests ──────────────────────────────────────────────────────────────

describe('MarketplaceController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('search', () => {
    it('should return search results for a valid query', async () => {
      const result = {
        data: [sampleProfile],
        meta: {
          pagination: {
            pageSize: 20,
            hasNextPage: false,
            hasPreviousPage: false,
            nextCursor: null,
            previousCursor: null,
            totalItems: 1,
          },
        },
      };
      mockSearchProfiles.mockResolvedValue(result);

      const req = { query: { q: 'electrician' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.search(req, res, next);

      expect(mockSearchProfiles).toHaveBeenCalledWith({
        q: 'electrician',
        pageSize: 20,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should return browse results when no query provided', async () => {
      mockSearchProfiles.mockResolvedValue(emptyResult);

      const req = { query: {} } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.search(req, res, next);

      expect(mockSearchProfiles).toHaveBeenCalledWith({ pageSize: 20 });
      expect(res.json).toHaveBeenCalledWith(emptyResult);
    });

    it('should pass all filter params to service', async () => {
      mockSearchProfiles.mockResolvedValue(emptyResult);

      const req = {
        query: {
          q: 'tailor',
          lgaId: 'ibadan-north',
          profession: 'Tailor',
          experienceLevel: '5-10 years',
          cursor: '0.06|018e1234-5678-7000-8000-000000000001',
          pageSize: '50',
        },
      } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.search(req, res, next);

      expect(mockSearchProfiles).toHaveBeenCalledWith({
        q: 'tailor',
        lgaId: 'ibadan-north',
        profession: 'Tailor',
        experienceLevel: '5-10 years',
        cursor: '0.06|018e1234-5678-7000-8000-000000000001',
        pageSize: 50,
      });
    });

    it('should return 400 for pageSize > 100', async () => {
      const req = { query: { pageSize: '101' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.search(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should return 400 for pageSize < 1', async () => {
      const req = { query: { pageSize: '0' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.search(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should return 400 for query exceeding 200 characters', async () => {
      const req = { query: { q: 'a'.repeat(201) } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.search(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should default pageSize to 20 when not provided', async () => {
      mockSearchProfiles.mockResolvedValue(emptyResult);

      const req = { query: { q: 'plumber' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.search(req, res, next);

      expect(mockSearchProfiles).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 20 }),
      );
    });

    it('should call next on service error', async () => {
      mockSearchProfiles.mockRejectedValue(new Error('DB error'));

      const req = { query: {} } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.search(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should NOT include PII fields in response (respondentId, firstName, lastName, phoneNumber, nin, dateOfBirth)', async () => {
      const result = {
        data: [sampleProfile],
        meta: { pagination: { ...emptyResult.meta.pagination, totalItems: 1 } },
      };
      mockSearchProfiles.mockResolvedValue(result);

      const req = { query: { q: 'electrician' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.search(req, res, next);

      const responseData = res.json.mock.calls[0][0];
      const profile = responseData.data[0];

      // Verify anonymous fields ARE present
      expect(profile).toHaveProperty('id');
      expect(profile).toHaveProperty('profession');
      expect(profile).toHaveProperty('lgaName');
      expect(profile).toHaveProperty('verifiedBadge');

      // Verify PII fields are NOT present
      expect(profile).not.toHaveProperty('respondentId');
      expect(profile).not.toHaveProperty('firstName');
      expect(profile).not.toHaveProperty('lastName');
      expect(profile).not.toHaveProperty('phoneNumber');
      expect(profile).not.toHaveProperty('nin');
      expect(profile).not.toHaveProperty('dateOfBirth');
    });

    it('should return empty data array for no matches', async () => {
      mockSearchProfiles.mockResolvedValue(emptyResult);

      const req = { query: { q: 'nonexistent-profession-xyz' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.search(req, res, next);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData.data).toEqual([]);
      expect(responseData.meta.pagination.totalItems).toBe(0);
    });

    it('should pass cursor through for pagination', async () => {
      const result = {
        data: [sampleProfile],
        meta: {
          pagination: {
            pageSize: 20,
            hasNextPage: true,
            hasPreviousPage: true,
            nextCursor: '0.04|018e1234-5678-7000-8000-000000000002',
            previousCursor: null,
            totalItems: 50,
          },
        },
      };
      mockSearchProfiles.mockResolvedValue(result);

      const req = {
        query: {
          q: 'electrician',
          cursor: '0.06|018e1234-5678-7000-8000-000000000001',
        },
      } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.search(req, res, next);

      expect(mockSearchProfiles).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: '0.06|018e1234-5678-7000-8000-000000000001',
        }),
      );
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.meta.pagination.hasNextPage).toBe(true);
      expect(responseData.meta.pagination.nextCursor).toBeTruthy();
    });

    it('should accept filter-only request (lgaId without query)', async () => {
      mockSearchProfiles.mockResolvedValue(emptyResult);

      const req = { query: { lgaId: 'ibadan-north' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.search(req, res, next);

      expect(mockSearchProfiles).toHaveBeenCalledWith(
        expect.objectContaining({ lgaId: 'ibadan-north' }),
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    const validId = '018e1234-5678-7000-8000-000000000001';

    const sampleProfileDetail = {
      id: validId,
      profession: 'Electrician',
      lgaName: 'Ibadan North',
      experienceLevel: '5-10 years',
      verifiedBadge: true,
      bio: 'Experienced electrician specializing in residential wiring.',
      portfolioUrl: 'https://example.com/portfolio',
      createdAt: '2026-03-01T12:00:00.000Z',
    };

    it('should return profile detail for a valid ID', async () => {
      mockGetProfileById.mockResolvedValue(sampleProfileDetail);

      const req = { params: { id: validId } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.getProfile(req, res, next);

      expect(mockGetProfileById).toHaveBeenCalledWith(validId);
      expect(res.json).toHaveBeenCalledWith({ data: sampleProfileDetail });
    });

    it('should return verified badge when verifiedBadge is true', async () => {
      mockGetProfileById.mockResolvedValue(sampleProfileDetail);

      const req = { params: { id: validId } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.getProfile(req, res, next);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData.data.verifiedBadge).toBe(true);
    });

    it('should return verifiedBadge false for unverified profiles', async () => {
      mockGetProfileById.mockResolvedValue({ ...sampleProfileDetail, verifiedBadge: false });

      const req = { params: { id: validId } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.getProfile(req, res, next);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData.data.verifiedBadge).toBe(false);
    });

    it('should NOT include PII fields in response', async () => {
      mockGetProfileById.mockResolvedValue(sampleProfileDetail);

      const req = { params: { id: validId } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.getProfile(req, res, next);

      const responseData = res.json.mock.calls[0][0].data;
      expect(responseData).not.toHaveProperty('respondentId');
      expect(responseData).not.toHaveProperty('firstName');
      expect(responseData).not.toHaveProperty('lastName');
      expect(responseData).not.toHaveProperty('phoneNumber');
      expect(responseData).not.toHaveProperty('nin');
      expect(responseData).not.toHaveProperty('dateOfBirth');
      expect(responseData).not.toHaveProperty('editToken');
      expect(responseData).not.toHaveProperty('consentEnriched');
    });

    it('should return 404 for non-existent profile ID', async () => {
      mockGetProfileById.mockResolvedValue(null);

      const req = { params: { id: validId } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.getProfile(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Profile not found');
    });

    it('should return 400 for malformed UUID', async () => {
      const req = { params: { id: 'not-a-uuid' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.getProfile(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should return 400 for empty ID', async () => {
      const req = { params: { id: '' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.getProfile(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should return lgaName (not raw lgaId)', async () => {
      mockGetProfileById.mockResolvedValue(sampleProfileDetail);

      const req = { params: { id: validId } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.getProfile(req, res, next);

      const responseData = res.json.mock.calls[0][0].data;
      expect(responseData).toHaveProperty('lgaName', 'Ibadan North');
      expect(responseData).not.toHaveProperty('lgaId');
    });

    it('should call next on service error', async () => {
      mockGetProfileById.mockRejectedValue(new Error('DB error'));

      const req = { params: { id: validId } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.getProfile(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('rate limiting', () => {
    it('rate limit message matches 429 response spec (RATE_LIMIT_EXCEEDED format)', async () => {
      const { RATE_LIMIT_MESSAGE } = await import('../../middleware/marketplace-rate-limit.js');

      expect(RATE_LIMIT_MESSAGE).toEqual({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many search requests. Please try again later.',
      });
    });

    it('rate limiter exports a middleware function', async () => {
      const { marketplaceSearchRateLimit } = await import('../../middleware/marketplace-rate-limit.js');
      expect(typeof marketplaceSearchRateLimit).toBe('function');
    });

    it('profile rate limit message matches 429 response spec', async () => {
      const { PROFILE_RATE_LIMIT_MESSAGE } = await import('../../middleware/marketplace-rate-limit.js');
      expect(PROFILE_RATE_LIMIT_MESSAGE).toEqual({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many profile view requests. Please try again later.',
      });
    });

    it('profile rate limiter exports a middleware function', async () => {
      const { marketplaceProfileRateLimit } = await import('../../middleware/marketplace-rate-limit.js');
      expect(typeof marketplaceProfileRateLimit).toBe('function');
    });
  });
});

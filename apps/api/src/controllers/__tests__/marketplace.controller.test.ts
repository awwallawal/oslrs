import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const {
  mockSearchProfiles, mockGetProfileById, mockRevealContact, mockLogPiiAccess,
  mockRequestEditToken, mockValidateEditToken, mockApplyProfileEdit,
} = vi.hoisted(() => ({
  mockSearchProfiles: vi.fn(),
  mockGetProfileById: vi.fn(),
  mockRevealContact: vi.fn(),
  mockLogPiiAccess: vi.fn(),
  mockRequestEditToken: vi.fn(),
  mockValidateEditToken: vi.fn(),
  mockApplyProfileEdit: vi.fn(),
}));

vi.mock('../../services/marketplace.service.js', () => ({
  MarketplaceService: {
    searchProfiles: (...args: any[]) => mockSearchProfiles(...args),
    getProfileById: (...args: any[]) => mockGetProfileById(...args),
    revealContact: (...args: any[]) => mockRevealContact(...args),
  },
}));

vi.mock('../../services/marketplace-edit.service.js', () => ({
  MarketplaceEditService: {
    requestEditToken: (...args: any[]) => mockRequestEditToken(...args),
    validateEditToken: (...args: any[]) => mockValidateEditToken(...args),
    applyProfileEdit: (...args: any[]) => mockApplyProfileEdit(...args),
  },
}));

vi.mock('../../services/audit.service.js', () => ({
  AuditService: {
    logPiiAccess: (...args: any[]) => mockLogPiiAccess(...args),
  },
  PII_ACTIONS: {
    CONTACT_REVEAL: 'pii.contact_reveal',
  },
}));

// ── Import SUT ─────────────────────────────────────────────────────────

import { MarketplaceController } from '../marketplace.controller.js';

// ── Helpers ────────────────────────────────────────────────────────────

function createMockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
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

  describe('revealContact', () => {
    const validId = '018e1234-5678-7000-8000-000000000001';
    const viewerId = '018e9999-0000-7000-8000-000000000001';

    function createAuthReq(overrides: Record<string, any> = {}): any {
      return {
        params: { id: validId },
        user: { sub: viewerId, role: 'public_user' },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        get: vi.fn().mockReturnValue('test-user-agent'),
        headers: { 'user-agent': 'test-user-agent' },
        ...overrides,
      };
    }

    it('should return revealed PII on success (happy path)', async () => {
      mockRevealContact.mockResolvedValue({
        status: 'success',
        data: { firstName: 'Adebayo', lastName: 'Ogunlesi', phoneNumber: '+2348012345678' },
      });

      const req = createAuthReq();
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.revealContact(req, res, next);

      expect(mockRevealContact).toHaveBeenCalledWith(validId, viewerId, '127.0.0.1', 'test-user-agent');
      expect(res.json).toHaveBeenCalledWith({
        data: { firstName: 'Adebayo', lastName: 'Ogunlesi', phoneNumber: '+2348012345678' },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should fire audit log on successful reveal', async () => {
      mockRevealContact.mockResolvedValue({
        status: 'success',
        data: { firstName: 'Adebayo', lastName: 'Ogunlesi', phoneNumber: '+2348012345678' },
      });

      const req = createAuthReq();
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.revealContact(req, res, next);

      expect(mockLogPiiAccess).toHaveBeenCalledWith(
        req,
        'pii.contact_reveal',
        'marketplace_profiles',
        validId,
        { viewerRole: 'public_user' },
      );
    });

    it('should return 404 when profile not found (consent gate or missing)', async () => {
      mockRevealContact.mockResolvedValue({ status: 'not_found' });

      const req = createAuthReq();
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.revealContact(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Profile not found or contact details not available');
    });

    it('should return 429 when rate limited (50/24h)', async () => {
      mockRevealContact.mockResolvedValue({ status: 'rate_limited', retryAfter: 3600 });

      const req = createAuthReq();
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.revealContact(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '3600');
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        code: 'REVEAL_LIMIT_EXCEEDED',
        message: 'Daily contact reveal limit reached (50 per 24 hours)',
        retryAfter: 3600,
      });
    });

    it('should return 400 for malformed UUID', async () => {
      const req = createAuthReq({ params: { id: 'not-a-uuid' } });
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.revealContact(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(mockRevealContact).not.toHaveBeenCalled();
    });

    it('should return ONLY firstName, lastName, phoneNumber in response (no NIN, dateOfBirth, respondentId)', async () => {
      mockRevealContact.mockResolvedValue({
        status: 'success',
        data: { firstName: 'Adebayo', lastName: 'Ogunlesi', phoneNumber: '+2348012345678' },
      });

      const req = createAuthReq();
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.revealContact(req, res, next);

      const responseData = res.json.mock.calls[0][0].data;
      expect(Object.keys(responseData).sort()).toEqual(['firstName', 'lastName', 'phoneNumber'].sort());
      expect(responseData).not.toHaveProperty('nin');
      expect(responseData).not.toHaveProperty('dateOfBirth');
      expect(responseData).not.toHaveProperty('respondentId');
    });

    it('should NOT fire audit log when reveal fails', async () => {
      mockRevealContact.mockResolvedValue({ status: 'not_found' });

      const req = createAuthReq();
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.revealContact(req, res, next);

      expect(mockLogPiiAccess).not.toHaveBeenCalled();
    });

    it('should call next on service error', async () => {
      mockRevealContact.mockRejectedValue(new Error('DB error'));

      const req = createAuthReq();
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.revealContact(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('requestEditToken', () => {
    it('should return 200 with generic message on success', async () => {
      mockRequestEditToken.mockResolvedValue({ status: 'success' });

      const req = { body: { phoneNumber: '+2348012345678' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.requestEditToken(req, res, next);

      expect(mockRequestEditToken).toHaveBeenCalledWith('+2348012345678');
      expect(res.json).toHaveBeenCalledWith({
        data: {
          message: 'If a marketplace profile exists for this phone number, an SMS with an edit link has been sent.',
        },
      });
    });

    it('should return 429 when rate limited', async () => {
      mockRequestEditToken.mockResolvedValue({ status: 'rate_limited' });

      const req = { body: { phoneNumber: '+2348012345678' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.requestEditToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many edit token requests. Please try again later.',
      });
    });

    it('should return 400 for missing phoneNumber', async () => {
      const req = { body: {} } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.requestEditToken(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should return 400 for phoneNumber shorter than 10 chars', async () => {
      const req = { body: { phoneNumber: '12345' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.requestEditToken(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('validateEditToken', () => {
    const validToken = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

    it('should return valid=true with profile data for valid token', async () => {
      mockValidateEditToken.mockResolvedValue({
        status: 'valid',
        profile: { bio: 'Expert plumber', portfolioUrl: 'https://example.com' },
      });

      const req = { params: { token: validToken } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.validateEditToken(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        data: { valid: true, bio: 'Expert plumber', portfolioUrl: 'https://example.com' },
      });
    });

    it('should return valid=false with reason expired', async () => {
      mockValidateEditToken.mockResolvedValue({ status: 'expired' });

      const req = { params: { token: validToken } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.validateEditToken(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        data: { valid: false, reason: 'expired' },
      });
    });

    it('should return valid=false with reason invalid', async () => {
      mockValidateEditToken.mockResolvedValue({ status: 'invalid' });

      const req = { params: { token: validToken } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.validateEditToken(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        data: { valid: false, reason: 'invalid' },
      });
    });

    it('should return valid=false for malformed token (not 32 hex chars)', async () => {
      const req = { params: { token: 'short' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.validateEditToken(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        data: { valid: false, reason: 'invalid' },
      });
      expect(mockValidateEditToken).not.toHaveBeenCalled();
    });
  });

  describe('applyProfileEdit', () => {
    const validToken = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

    it('should return 200 on successful edit', async () => {
      mockApplyProfileEdit.mockResolvedValue({ status: 'success' });

      const req = {
        body: { editToken: validToken, bio: 'Updated bio', portfolioUrl: 'https://example.com' },
      } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.applyProfileEdit(req, res, next);

      expect(mockApplyProfileEdit).toHaveBeenCalledWith(validToken, 'Updated bio', 'https://example.com');
      expect(res.json).toHaveBeenCalledWith({
        data: { message: 'Profile updated successfully' },
      });
    });

    it('should return 410 for expired token', async () => {
      mockApplyProfileEdit.mockResolvedValue({ status: 'expired' });

      const req = { body: { editToken: validToken, bio: 'Bio' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.applyProfileEdit(req, res, next);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        code: 'TOKEN_EXPIRED',
        message: 'This edit link has expired. Please request a new one.',
      });
    });

    it('should return 404 for consumed/invalid token', async () => {
      mockApplyProfileEdit.mockResolvedValue({ status: 'invalid' });

      const req = { body: { editToken: validToken } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.applyProfileEdit(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Invalid edit link.',
      });
    });

    it('should return 400 for bio > 150 characters', async () => {
      const req = {
        body: { editToken: validToken, bio: 'a'.repeat(151) },
      } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.applyProfileEdit(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should return 400 for invalid URL', async () => {
      const req = {
        body: { editToken: validToken, portfolioUrl: 'not-a-url' },
      } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.applyProfileEdit(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should return 400 for missing editToken', async () => {
      const req = { body: { bio: 'Some bio' } } as any;
      const res = createMockRes();
      const next = vi.fn();

      await MarketplaceController.applyProfileEdit(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
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

    it('edit token rate limit message matches 429 response spec', async () => {
      const { EDIT_TOKEN_RATE_LIMIT_MESSAGE } = await import('../../middleware/marketplace-rate-limit.js');
      expect(EDIT_TOKEN_RATE_LIMIT_MESSAGE).toEqual({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many edit token requests. Please try again later.',
      });
    });

    it('edit token rate limiter exports a middleware function', async () => {
      const { editTokenRequestRateLimit } = await import('../../middleware/marketplace-rate-limit.js');
      expect(typeof editTokenRequestRateLimit).toBe('function');
    });

    it('edit token use rate limit message matches 429 response spec', async () => {
      const { EDIT_TOKEN_USE_RATE_LIMIT_MESSAGE } = await import('../../middleware/marketplace-rate-limit.js');
      expect(EDIT_TOKEN_USE_RATE_LIMIT_MESSAGE).toEqual({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      });
    });

    it('edit token use rate limiter exports a middleware function', async () => {
      const { editTokenUseRateLimit } = await import('../../middleware/marketplace-rate-limit.js');
      expect(typeof editTokenUseRateLimit).toBe('function');
    });
  });
});

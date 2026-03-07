import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash, randomBytes } from 'crypto';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const { mockDb, mockRedis, mockSmsSend } = vi.hoisted(() => {
  const mockTx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };

  return {
    mockDb: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      transaction: vi.fn((cb: any) => cb(mockTx)),
      _tx: mockTx,
    },
    mockRedis: {
      get: vi.fn().mockResolvedValue(null),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    },
    mockSmsSend: vi.fn().mockResolvedValue({ success: true, messageId: 'mock-1' }),
  };
});

vi.mock('../../db/index.js', () => ({
  db: mockDb,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: any, val: any) => ({ col, val, type: 'eq' })),
  sql: vi.fn(),
}));

vi.mock('../../db/schema/marketplace.js', () => ({
  marketplaceProfiles: {
    id: 'id',
    respondentId: 'respondent_id',
    editToken: 'edit_token',
    editTokenExpiresAt: 'edit_token_expires_at',
    bio: 'bio',
    portfolioUrl: 'portfolio_url',
    updatedAt: 'updated_at',
  },
}));

vi.mock('../../db/schema/respondents.js', () => ({
  respondents: {
    id: 'id',
    nin: 'nin',
    phoneNumber: 'phone_number',
  },
}));

vi.mock('../sms.service.js', () => ({
  SMSService: {
    send: (...args: any[]) => mockSmsSend(...args),
  },
}));

vi.mock('ioredis', () => ({
  Redis: class {
    get(...args: any[]) { return mockRedis.get(...args); }
    incr(...args: any[]) { return mockRedis.incr(...args); }
    expire(...args: any[]) { return mockRedis.expire(...args); }
  },
}));

// ── Import SUT ─────────────────────────────────────────────────────────

import { MarketplaceEditService } from '../marketplace-edit.service.js';

// ── Helpers ────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const PROFILE_ID = '018e1234-5678-7000-8000-000000000001';
const RESPONDENT_ID = '018e9999-0000-7000-8000-000000000001';

// ── Tests ──────────────────────────────────────────────────────────────

describe('MarketplaceEditService', () => {
  beforeEach(() => {
    // Use clearAllMocks (not resetAllMocks) to preserve mock implementations
    // from vi.mock() factories — resetAllMocks clears .mockImplementation()
    // which breaks the Redis constructor mock.
    vi.clearAllMocks();
    // Re-set chaining returns and default values
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.limit.mockResolvedValue([]);
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb._tx.select.mockReturnThis();
    mockDb._tx.from.mockReturnThis();
    mockDb._tx.where.mockReturnThis();
    mockDb._tx.for.mockReturnThis();
    mockDb._tx.limit.mockResolvedValue([]);
    mockDb._tx.update.mockReturnThis();
    mockDb._tx.set.mockReturnThis();
    mockDb.transaction.mockImplementation((cb: any) => cb(mockDb._tx));
    mockRedis.get.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockSmsSend.mockResolvedValue({ success: true, messageId: 'mock-1' });
  });

  describe('requestEditToken', () => {
    it('should return success and send SMS when profile found', async () => {
      // First query: find respondent by phone
      let callCount = 0;
      mockDb.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ id: RESPONDENT_ID, nin: '12345678901' }]);
        if (callCount === 2) return Promise.resolve([{ id: PROFILE_ID }]);
        return Promise.resolve([]);
      });
      mockDb.where.mockReturnThis();

      const result = await MarketplaceEditService.requestEditToken('+2348012345678');

      expect(result.status).toBe('success');
      expect(mockSmsSend).toHaveBeenCalledWith(
        '+2348012345678',
        expect.stringContaining('marketplace/edit/'),
      );
    });

    it('should return success without SMS when phone not found (prevents enumeration)', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await MarketplaceEditService.requestEditToken('+2340000000000');

      expect(result.status).toBe('success');
      expect(mockSmsSend).not.toHaveBeenCalled();
    });

    it('should return success without SMS when no marketplace profile', async () => {
      let callCount = 0;
      mockDb.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ id: RESPONDENT_ID, nin: '12345678901' }]);
        return Promise.resolve([]); // No marketplace profile
      });

      const result = await MarketplaceEditService.requestEditToken('+2348012345678');

      expect(result.status).toBe('success');
      expect(mockSmsSend).not.toHaveBeenCalled();
    });

    it('should return rate_limited when NIN has 3+ requests in 24h', async () => {
      let callCount = 0;
      mockDb.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ id: RESPONDENT_ID, nin: '12345678901' }]);
        if (callCount === 2) return Promise.resolve([{ id: PROFILE_ID }]);
        return Promise.resolve([]);
      });
      // Atomic INCR-first: INCR returns 4 (exceeds limit of 3)
      mockRedis.incr.mockResolvedValue(4);

      const result = await MarketplaceEditService.requestEditToken('+2348012345678');

      expect(result.status).toBe('rate_limited');
      expect(mockSmsSend).not.toHaveBeenCalled();
    });

    it('should store hashed token (not plaintext) in database', async () => {
      let callCount = 0;
      mockDb.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ id: RESPONDENT_ID, nin: '12345678901' }]);
        if (callCount === 2) return Promise.resolve([{ id: PROFILE_ID }]);
        return Promise.resolve([]);
      });

      await MarketplaceEditService.requestEditToken('+2348012345678');

      // The set() call should contain a hashed token (64 hex chars), not the plaintext (32 hex chars)
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          editToken: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      );
    });

    it('should set Redis TTL on first rate limit check (INCR returns 1)', async () => {
      let callCount = 0;
      mockDb.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ id: RESPONDENT_ID, nin: '12345678901' }]);
        if (callCount === 2) return Promise.resolve([{ id: PROFILE_ID }]);
        return Promise.resolve([]);
      });
      // Atomic INCR-first: INCR returns 1 (first request) → sets TTL
      mockRedis.incr.mockResolvedValue(1);

      await MarketplaceEditService.requestEditToken('+2348012345678');

      expect(mockRedis.incr).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 86400);
    });

    it('should use respondent ID for rate limiting when NIN is null (H3 fix)', async () => {
      let callCount = 0;
      mockDb.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ id: RESPONDENT_ID, nin: null }]);
        if (callCount === 2) return Promise.resolve([{ id: PROFILE_ID }]);
        return Promise.resolve([]);
      });
      // INCR returns 4 → exceeds limit
      mockRedis.incr.mockResolvedValue(4);

      const result = await MarketplaceEditService.requestEditToken('+2348012345678');

      expect(result.status).toBe('rate_limited');
      expect(mockRedis.incr).toHaveBeenCalledWith(`rl:edit-token:rid:${RESPONDENT_ID}`);
    });
  });

  describe('validateEditToken', () => {
    it('should return valid with profile data for valid token', async () => {
      const token = randomBytes(16).toString('hex');
      const hashedToken = hashToken(token);

      mockDb.limit.mockResolvedValue([{
        editTokenExpiresAt: new Date(Date.now() + 86400000),
        bio: 'My bio',
        portfolioUrl: 'https://example.com',
      }]);

      const result = await MarketplaceEditService.validateEditToken(token);

      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        expect(result.profile.bio).toBe('My bio');
        expect(result.profile.portfolioUrl).toBe('https://example.com');
      }
    });

    it('should return expired for expired token', async () => {
      const token = randomBytes(16).toString('hex');

      mockDb.limit.mockResolvedValue([{
        editTokenExpiresAt: new Date(Date.now() - 86400000), // 1 day ago
        bio: null,
        portfolioUrl: null,
      }]);

      const result = await MarketplaceEditService.validateEditToken(token);

      expect(result.status).toBe('expired');
    });

    it('should return invalid for non-existent token', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await MarketplaceEditService.validateEditToken('nonexistenttoken1234567890abcdef');

      expect(result.status).toBe('invalid');
    });
  });

  describe('applyProfileEdit', () => {
    it('should update profile and consume token on success', async () => {
      const token = randomBytes(16).toString('hex');

      mockDb._tx.limit.mockResolvedValue([{
        id: PROFILE_ID,
        editTokenExpiresAt: new Date(Date.now() + 86400000),
      }]);
      mockDb._tx.where.mockReturnThis();

      const result = await MarketplaceEditService.applyProfileEdit(
        token,
        'Updated bio',
        'https://portfolio.com',
      );

      expect(result.status).toBe('success');
      expect(mockDb._tx.set).toHaveBeenCalledWith(
        expect.objectContaining({
          bio: 'Updated bio',
          portfolioUrl: 'https://portfolio.com',
          editToken: null,
          editTokenExpiresAt: null,
        }),
      );
    });

    it('should return expired for expired token', async () => {
      const token = randomBytes(16).toString('hex');

      mockDb._tx.limit.mockResolvedValue([{
        id: PROFILE_ID,
        editTokenExpiresAt: new Date(Date.now() - 86400000),
      }]);

      const result = await MarketplaceEditService.applyProfileEdit(token, 'Bio', null);

      expect(result.status).toBe('expired');
    });

    it('should return invalid for non-existent token (consumed or never existed)', async () => {
      mockDb._tx.limit.mockResolvedValue([]);

      const result = await MarketplaceEditService.applyProfileEdit(
        'consumedtokenabcdef1234567890ab',
        'Bio',
        null,
      );

      expect(result.status).toBe('invalid');
    });

    it('should use transaction with SELECT FOR UPDATE for TOCTOU safety', async () => {
      const token = randomBytes(16).toString('hex');
      mockDb._tx.limit.mockResolvedValue([{
        id: PROFILE_ID,
        editTokenExpiresAt: new Date(Date.now() + 86400000),
      }]);
      mockDb._tx.where.mockReturnThis();

      await MarketplaceEditService.applyProfileEdit(token, 'Bio', null);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockDb._tx.for).toHaveBeenCalledWith('update');
    });
  });
});

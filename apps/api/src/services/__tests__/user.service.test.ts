import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────
const { mockSelect, mockUpdate, mockWhere, mockFor, mockReturning, mockFrom } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockWhere: vi.fn(),
  mockFrom: vi.fn(),
  mockFor: vi.fn(),
  mockReturning: vi.fn(),
}));

const mockTx = {
  select: () => {
    mockSelect();
    return {
      from: () => {
        mockFrom();
        return {
          where: (condition: unknown) => {
            mockWhere(condition);
            return {
              for: () => {
                mockFor();
                return mockSelect._results ?? [];
              },
            };
          },
        };
      },
    };
  },
  update: () => {
    mockUpdate();
    return {
      set: () => ({
        where: () => ({
          returning: () => {
            mockReturning();
            return mockUpdate._results ?? [];
          },
        }),
      }),
    };
  },
};

vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn(),
    transaction: (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  users: { id: 'id', phone: 'phone', email: 'email', fullName: 'full_name', status: 'status', lgaId: 'lga_id', homeAddress: 'home_address', bankName: 'bank_name', accountNumber: 'account_number', accountName: 'account_name', nextOfKinName: 'next_of_kin_name', nextOfKinPhone: 'next_of_kin_phone', liveSelfieOriginalUrl: 'live_selfie_original_url', createdAt: 'created_at', roleId: 'role_id' },
  roles: { id: 'id', name: 'name' },
  lgas: { id: 'id', name: 'name' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  ne: vi.fn((a, b) => ({ type: 'ne', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

vi.mock('@oslsr/utils', () => ({
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

// ── Import SUT ───────────────────────────────────────────────────────
import { UserService } from '../user.service.js';

describe('UserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock results
    (mockSelect as any)._results = undefined;
    (mockUpdate as any)._results = undefined;
  });

  describe('updateProfile', () => {
    it('should update profile with partial data', async () => {
      const userId = 'user-123';
      const data = { fullName: 'New Name' };
      const updatedUser = { id: userId, email: 'test@test.com', fullName: 'New Name', phone: null, status: 'active' };

      // First select (FOR UPDATE) returns existing user
      (mockSelect as any)._results = [{ id: userId }];
      // Update returns updated user
      (mockUpdate as any)._results = [updatedUser];

      const result = await UserService.updateProfile(userId, data);

      expect(result).toEqual(updatedUser);
      expect(mockSelect).toHaveBeenCalled();
      expect(mockFor).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should throw 404 when user not found', async () => {
      (mockSelect as any)._results = []; // No user found

      await expect(UserService.updateProfile('nonexistent', { fullName: 'Test' }))
        .rejects.toThrow('User not found');
    });

    it('should throw 409 when phone is duplicate', async () => {
      const userId = 'user-123';
      const data = { phone: '08012345678' };

      // First select returns existing user
      (mockSelect as any)._results = [{ id: userId }];

      // Override the tx.select chain for the phone duplicate check
      // Need a counter to differentiate first and second select calls
      let selectCallCount = 0;
      mockTx.select = () => {
        selectCallCount++;
        mockSelect();
        return {
          from: () => {
            mockFrom();
            return {
              where: (condition: unknown) => {
                mockWhere(condition);
                if (selectCallCount === 1) {
                  // First call: FOR UPDATE — return existing user
                  return {
                    for: () => {
                      mockFor();
                      return [{ id: userId }];
                    },
                  };
                }
                // Second call: phone check — return a duplicate
                return [{ id: 'other-user' }];
              },
            };
          },
        };
      };

      await expect(UserService.updateProfile(userId, data))
        .rejects.toThrow('Phone number already in use');
    });

    it('should skip phone check when phone not in update data', async () => {
      const userId = 'user-123';
      const data = { homeAddress: '123 Test St' };
      const updatedUser = { id: userId, homeAddress: '123 Test St' };

      // Reset to fresh mock with correct chain
      let selectCallCount = 0;
      mockTx.select = () => {
        selectCallCount++;
        mockSelect();
        return {
          from: () => {
            mockFrom();
            return {
              where: () => ({
                for: () => {
                  mockFor();
                  return [{ id: userId }];
                },
              }),
            };
          },
        };
      };
      (mockUpdate as any)._results = [updatedUser];

      const result = await UserService.updateProfile(userId, data);

      expect(result).toEqual(updatedUser);
      // Only one select call (the FOR UPDATE), no phone check
      expect(selectCallCount).toBe(1);
    });
  });
});

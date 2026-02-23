/**
 * Staff Controller Tests
 * Story 2.5-3: Tests for staff management endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { StaffController } from '../staff.controller.js';
import { StaffService } from '../../services/staff.service.js';

// Mock StaffService
vi.mock('../../services/staff.service.js');

describe('StaffController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnThis();

    mockRes = {
      json: jsonMock,
      status: statusMock,
    };

    mockNext = vi.fn();

    mockReq = {
      query: {},
      params: {},
      body: {},
      user: { sub: 'actor-123', role: 'super_admin' },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('list', () => {
    it('returns paginated staff list with correct meta', async () => {
      const mockData = {
        data: [
          { id: 'u1', fullName: 'John Doe', email: 'john@example.com', status: 'active' },
          { id: 'u2', fullName: 'Jane Smith', email: 'jane@example.com', status: 'invited' },
        ],
        meta: { total: 25, page: 1, limit: 20, totalPages: 2 },
      };

      vi.mocked(StaffService.listUsers).mockResolvedValue(mockData);

      mockReq.query = { page: '1', limit: '20' };

      await StaffController.list(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.listUsers).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: undefined,
        roleId: undefined,
        lgaId: undefined,
        search: undefined,
      });
      expect(jsonMock).toHaveBeenCalledWith({
        ...mockData,
      });
    });

    it('filters by status correctly', async () => {
      const mockData = {
        data: [{ id: 'u1', fullName: 'John Doe', email: 'john@example.com', status: 'active' }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };

      vi.mocked(StaffService.listUsers).mockResolvedValue(mockData);

      mockReq.query = { status: 'active' };

      await StaffController.list(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' })
      );
    });

    it('filters by roleId correctly', async () => {
      const mockData = {
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      };

      vi.mocked(StaffService.listUsers).mockResolvedValue(mockData);

      mockReq.query = { roleId: 'role-123' };

      await StaffController.list(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ roleId: 'role-123' })
      );
    });

    it('filters by lgaId correctly', async () => {
      const mockData = {
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      };

      vi.mocked(StaffService.listUsers).mockResolvedValue(mockData);

      mockReq.query = { lgaId: 'lga-456' };

      await StaffController.list(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ lgaId: 'lga-456' })
      );
    });

    it('search by name returns partial matches', async () => {
      const mockData = {
        data: [{ id: 'u1', fullName: 'John Doe', email: 'john@example.com', status: 'active' }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };

      vi.mocked(StaffService.listUsers).mockResolvedValue(mockData);

      mockReq.query = { search: 'John' };

      await StaffController.list(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'John' })
      );
    });

    it('search by email returns partial matches', async () => {
      const mockData = {
        data: [{ id: 'u1', fullName: 'John Doe', email: 'john@example.com', status: 'active' }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };

      vi.mocked(StaffService.listUsers).mockResolvedValue(mockData);

      mockReq.query = { search: 'john@' };

      await StaffController.list(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'john@' })
      );
    });

    it('calls next on error', async () => {
      const error = new Error('Database error');
      vi.mocked(StaffService.listUsers).mockRejectedValue(error);

      await StaffController.list(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('updateRole', () => {
    it('updates role successfully', async () => {
      const mockUser = {
        id: 'user-123',
        fullName: 'John Doe',
        email: 'john@example.com',
        roleId: 'new-role-id',
        status: 'active',
      };

      vi.mocked(StaffService.updateRole).mockResolvedValue(mockUser as never);

      mockReq.params = { userId: 'user-123' };
      mockReq.body = { roleId: 'new-role-id' };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.updateRole).toHaveBeenCalledWith('user-123', 'new-role-id', 'actor-123');
      expect(jsonMock).toHaveBeenCalledWith({
        data: mockUser,
      });
    });

    it('returns 404 for non-existent user', async () => {
      const error = new Error('User not found');
      Object.assign(error, { code: 'USER_NOT_FOUND', statusCode: 404 });
      vi.mocked(StaffService.updateRole).mockRejectedValue(error);

      mockReq.params = { userId: 'non-existent' };
      mockReq.body = { roleId: 'some-role' };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('returns 404 for non-existent role', async () => {
      const error = new Error('Role not found');
      Object.assign(error, { code: 'ROLE_NOT_FOUND', statusCode: 404 });
      vi.mocked(StaffService.updateRole).mockRejectedValue(error);

      mockReq.params = { userId: 'user-123' };
      mockReq.body = { roleId: 'non-existent-role' };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('returns unchanged user if same role', async () => {
      const mockUser = {
        id: 'user-123',
        fullName: 'John Doe',
        email: 'john@example.com',
        roleId: 'same-role-id',
        status: 'active',
      };

      vi.mocked(StaffService.updateRole).mockResolvedValue(mockUser as never);

      mockReq.params = { userId: 'user-123' };
      mockReq.body = { roleId: 'same-role-id' };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        data: mockUser,
      });
    });

    it('returns 401 if not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.params = { userId: 'user-123' };
      mockReq.body = { roleId: 'new-role-id' };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 if roleId is missing', async () => {
      mockReq.params = { userId: 'user-123' };
      mockReq.body = {};

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('deactivate', () => {
    it('deactivates user successfully', async () => {
      const mockUser = {
        id: 'user-123',
        fullName: 'John Doe',
        email: 'john@example.com',
        status: 'deactivated',
      };

      vi.mocked(StaffService.deactivateUser).mockResolvedValue(mockUser as never);

      mockReq.params = { userId: 'user-123' };

      await StaffController.deactivate(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.deactivateUser).toHaveBeenCalledWith('user-123', 'actor-123');
      expect(jsonMock).toHaveBeenCalledWith({
        data: mockUser,
      });
    });

    it('returns 404 for non-existent user', async () => {
      const error = new Error('User not found');
      Object.assign(error, { code: 'USER_NOT_FOUND', statusCode: 404 });
      vi.mocked(StaffService.deactivateUser).mockRejectedValue(error);

      mockReq.params = { userId: 'non-existent' };

      await StaffController.deactivate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('returns 400 for already deactivated user', async () => {
      const error = new Error('User is already deactivated');
      Object.assign(error, { code: 'ALREADY_DEACTIVATED', statusCode: 400 });
      vi.mocked(StaffService.deactivateUser).mockRejectedValue(error);

      mockReq.params = { userId: 'deactivated-user' };

      await StaffController.deactivate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('returns 400 when trying to deactivate self', async () => {
      const error = new Error('Cannot deactivate your own account');
      Object.assign(error, { code: 'CANNOT_DEACTIVATE_SELF', statusCode: 400 });
      vi.mocked(StaffService.deactivateUser).mockRejectedValue(error);

      mockReq.params = { userId: 'actor-123' }; // Same as actor

      await StaffController.deactivate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('returns 401 if not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.params = { userId: 'user-123' };

      await StaffController.deactivate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('downloadIdCard', () => {
    let mockSend: ReturnType<typeof vi.fn>;
    let mockSet: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockSend = vi.fn();
      mockSet = vi.fn().mockReturnThis();
      mockRes.send = mockSend;
      mockRes.set = mockSet;
    });

    it('returns PDF blob for active user', async () => {
      const mockPdfBuffer = Buffer.from('mock-pdf-content');
      vi.mocked(StaffService.downloadIdCard).mockResolvedValue({
        buffer: mockPdfBuffer,
        fileName: 'oslrs-id-user-123.pdf',
      } as never);

      mockReq.params = { userId: 'user-123' };

      await StaffController.downloadIdCard(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.downloadIdCard).toHaveBeenCalledWith('user-123');
      expect(mockSet).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith(mockPdfBuffer);
    });

    it('returns 404 for non-existent user', async () => {
      const error = new Error('User not found');
      Object.assign(error, { code: 'USER_NOT_FOUND', statusCode: 404 });
      vi.mocked(StaffService.downloadIdCard).mockRejectedValue(error);

      mockReq.params = { userId: 'non-existent' };

      await StaffController.downloadIdCard(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('returns error if user has no selfie', async () => {
      const error = new Error('User does not have a verified ID photo');
      Object.assign(error, { code: 'NO_SELFIE', statusCode: 400 });
      vi.mocked(StaffService.downloadIdCard).mockRejectedValue(error);

      mockReq.params = { userId: 'user-no-selfie' };

      await StaffController.downloadIdCard(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});

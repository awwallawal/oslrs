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

// Valid UUIDs for test data
const ROLE_ID_A = '00000000-0000-0000-0000-000000000001';
const ROLE_ID_B = '00000000-0000-0000-0000-000000000002';
const ROLE_ID_C = '00000000-0000-0000-0000-000000000003';

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
        roleId: ROLE_ID_A,
        status: 'active',
      };

      vi.mocked(StaffService.updateRole).mockResolvedValue(mockUser as never);

      mockReq.params = { userId: 'user-123' };
      mockReq.body = { roleId: ROLE_ID_A };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.updateRole).toHaveBeenCalledWith('user-123', ROLE_ID_A, 'actor-123');
      expect(jsonMock).toHaveBeenCalledWith({
        data: mockUser,
      });
    });

    it('returns 404 for non-existent user', async () => {
      const error = new Error('User not found');
      Object.assign(error, { code: 'USER_NOT_FOUND', statusCode: 404 });
      vi.mocked(StaffService.updateRole).mockRejectedValue(error);

      mockReq.params = { userId: 'non-existent' };
      mockReq.body = { roleId: ROLE_ID_A };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('returns 404 for non-existent role', async () => {
      const error = new Error('Role not found');
      Object.assign(error, { code: 'ROLE_NOT_FOUND', statusCode: 404 });
      vi.mocked(StaffService.updateRole).mockRejectedValue(error);

      mockReq.params = { userId: 'user-123' };
      mockReq.body = { roleId: ROLE_ID_B };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('returns unchanged user if same role', async () => {
      const mockUser = {
        id: 'user-123',
        fullName: 'John Doe',
        email: 'john@example.com',
        roleId: ROLE_ID_A,
        status: 'active',
      };

      vi.mocked(StaffService.updateRole).mockResolvedValue(mockUser as never);

      mockReq.params = { userId: 'user-123' };
      mockReq.body = { roleId: ROLE_ID_A };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        data: mockUser,
      });
    });

    it('returns 401 if not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.params = { userId: 'user-123' };
      mockReq.body = { roleId: ROLE_ID_A };

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

    it('returns 400 if roleId is not a valid UUID', async () => {
      mockReq.params = { userId: 'user-123' };
      mockReq.body = { roleId: 'not-a-uuid' };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when trying to change role of last Super Admin', async () => {
      const error = new Error('Cannot change the role of the last Super Admin');
      Object.assign(error, { code: 'CANNOT_CHANGE_LAST_ADMIN_ROLE', statusCode: 400 });
      vi.mocked(StaffService.updateRole).mockRejectedValue(error);

      mockReq.params = { userId: 'last-admin' };
      mockReq.body = { roleId: ROLE_ID_B };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('changes Super Admin role successfully when 2+ admins exist', async () => {
      const mockUser = {
        id: 'admin-2',
        fullName: 'Second Admin',
        email: 'admin2@example.com',
        roleId: ROLE_ID_B,
        status: 'active',
      };

      vi.mocked(StaffService.updateRole).mockResolvedValue(mockUser as never);

      mockReq.params = { userId: 'admin-2' };
      mockReq.body = { roleId: ROLE_ID_B };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.updateRole).toHaveBeenCalledWith('admin-2', ROLE_ID_B, 'actor-123');
      expect(jsonMock).toHaveBeenCalledWith({ data: mockUser });
    });

    it('returns 400 when trying to change own role (self-role-change)', async () => {
      const error = new Error('Cannot change your own role');
      Object.assign(error, { code: 'CANNOT_CHANGE_OWN_ROLE', statusCode: 400 });
      vi.mocked(StaffService.updateRole).mockRejectedValue(error);

      mockReq.params = { userId: 'actor-123' }; // Same as actor
      mockReq.body = { roleId: ROLE_ID_B };

      await StaffController.updateRole(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
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

    it('returns 400 when trying to deactivate last Super Admin', async () => {
      const error = new Error('Cannot deactivate the last Super Admin account');
      Object.assign(error, { code: 'CANNOT_DEACTIVATE_LAST_ADMIN', statusCode: 400 });
      vi.mocked(StaffService.deactivateUser).mockRejectedValue(error);

      mockReq.params = { userId: 'admin-only' };

      await StaffController.deactivate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('deactivates Super Admin successfully when 2+ exist', async () => {
      const mockUser = {
        id: 'admin-2',
        fullName: 'Second Admin',
        email: 'admin2@example.com',
        status: 'deactivated',
      };

      vi.mocked(StaffService.deactivateUser).mockResolvedValue(mockUser as never);

      mockReq.params = { userId: 'admin-2' };

      await StaffController.deactivate(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.deactivateUser).toHaveBeenCalledWith('admin-2', 'actor-123');
      expect(jsonMock).toHaveBeenCalledWith({ data: mockUser });
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

  describe('createManual - Super Admin invitation flow', () => {
    it('creates staff with Super Admin role and returns 201 with invited status', async () => {
      const mockResult = {
        user: {
          id: 'new-admin-1',
          fullName: 'New Admin',
          email: 'newadmin@example.com',
          status: 'invited',
          roleId: ROLE_ID_C,
        },
        emailStatus: 'pending',
      };

      vi.mocked(StaffService.createManual).mockResolvedValue(mockResult as never);

      mockReq.body = {
        fullName: 'New Admin',
        email: 'newadmin@example.com',
        phone: '+2348012345678',
        roleId: ROLE_ID_C,
      };

      await StaffController.createManual(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.createManual).toHaveBeenCalledWith(
        { fullName: 'New Admin', email: 'newadmin@example.com', phone: '+2348012345678', roleId: ROLE_ID_C },
        'actor-123',
      );
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        data: {
          ...mockResult.user,
          emailStatus: 'pending',
        },
      });
    });

    it('returns created user with emailStatus indicating invitation was queued', async () => {
      const mockResult = {
        user: {
          id: 'new-admin-2',
          fullName: 'Another Admin',
          email: 'another@example.com',
          status: 'invited',
          roleId: ROLE_ID_C,
        },
        emailStatus: 'pending',
      };

      vi.mocked(StaffService.createManual).mockResolvedValue(mockResult as never);

      mockReq.body = {
        fullName: 'Another Admin',
        email: 'another@example.com',
        phone: '+2349087654321',
        roleId: ROLE_ID_C,
      };

      await StaffController.createManual(mockReq as Request, mockRes as Response, mockNext);

      const responseData = jsonMock.mock.calls[0][0];
      expect(responseData.data.status).toBe('invited');
      expect(responseData.data.emailStatus).toBe('pending');
    });

    it('returns 400 if required fields are missing', async () => {
      mockReq.body = { fullName: 'Test' }; // Missing email, phone, roleId

      await StaffController.createManual(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 if not authenticated for createManual', async () => {
      mockReq.user = undefined;
      mockReq.body = { fullName: 'Test', email: 'test@example.com', phone: '+234123', roleId: ROLE_ID_A };

      await StaffController.createManual(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('reactivate', () => {
    it('reactivates user successfully with default reOnboard=false', async () => {
      const mockUser = {
        id: 'user-123',
        fullName: 'John Doe',
        email: 'john@example.com',
        status: 'active',
      };

      vi.mocked(StaffService.reactivateUser).mockResolvedValue(mockUser as never);

      mockReq.params = { userId: 'user-123' };
      mockReq.body = {};

      await StaffController.reactivate(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.reactivateUser).toHaveBeenCalledWith('user-123', 'actor-123', false);
      expect(jsonMock).toHaveBeenCalledWith({ data: mockUser });
    });

    it('reactivates user with reOnboard=true', async () => {
      const mockUser = {
        id: 'user-123',
        fullName: 'John Doe',
        email: 'john@example.com',
        status: 'invited',
      };

      vi.mocked(StaffService.reactivateUser).mockResolvedValue(mockUser as never);

      mockReq.params = { userId: 'user-123' };
      mockReq.body = { reOnboard: true };

      await StaffController.reactivate(mockReq as Request, mockRes as Response, mockNext);

      expect(StaffService.reactivateUser).toHaveBeenCalledWith('user-123', 'actor-123', true);
      expect(jsonMock).toHaveBeenCalledWith({ data: mockUser });
    });

    it('returns 400 for invalid reOnboard type', async () => {
      mockReq.params = { userId: 'user-123' };
      mockReq.body = { reOnboard: 'not-a-boolean' };

      await StaffController.reactivate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('strips extra fields from body (mass assignment prevention)', async () => {
      const mockUser = {
        id: 'user-123',
        fullName: 'John Doe',
        email: 'john@example.com',
        status: 'active',
      };

      vi.mocked(StaffService.reactivateUser).mockResolvedValue(mockUser as never);

      mockReq.params = { userId: 'user-123' };
      mockReq.body = { reOnboard: false, role: 'super_admin', isAdmin: true };

      await StaffController.reactivate(mockReq as Request, mockRes as Response, mockNext);

      // Zod strips unknown fields — only reOnboard should reach the service
      expect(StaffService.reactivateUser).toHaveBeenCalledWith('user-123', 'actor-123', false);
    });

    it('returns 401 if not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.params = { userId: 'user-123' };
      mockReq.body = {};

      await StaffController.reactivate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('calls next on service error', async () => {
      const error = new Error('User not found');
      Object.assign(error, { code: 'USER_NOT_FOUND', statusCode: 404 });
      vi.mocked(StaffService.reactivateUser).mockRejectedValue(error);

      mockReq.params = { userId: 'non-existent' };
      mockReq.body = {};

      await StaffController.reactivate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
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

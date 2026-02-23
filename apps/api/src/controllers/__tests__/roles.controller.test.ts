/**
 * Roles Controller Tests
 * Story 2.5-3: Tests for roles endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { RolesController } from '../roles.controller.js';
import { db } from '../../db/index.js';

// Mock the database
vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      roles: {
        findMany: vi.fn(),
      },
    },
  },
}));

describe('RolesController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    jsonMock = vi.fn();

    mockRes = {
      json: jsonMock,
    };

    mockNext = vi.fn();
    mockReq = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('list', () => {
    it('returns list of all roles with id, name, description', async () => {
      const mockRoles = [
        { id: 'role-1', name: 'super_admin', description: 'System administrator' },
        { id: 'role-2', name: 'supervisor', description: 'Field supervisor' },
        { id: 'role-3', name: 'enumerator', description: 'Field worker' },
      ];

      vi.mocked(db.query.roles.findMany).mockResolvedValue(mockRoles);

      await RolesController.list(mockReq as Request, mockRes as Response, mockNext);

      expect(db.query.roles.findMany).toHaveBeenCalledWith({
        columns: {
          id: true,
          name: true,
          description: true,
        },
      });
      expect(jsonMock).toHaveBeenCalledWith({
        data: mockRoles,
      });
    });

    it('calls next on error', async () => {
      const error = new Error('Database error');
      vi.mocked(db.query.roles.findMany).mockRejectedValue(error);

      await RolesController.list(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});

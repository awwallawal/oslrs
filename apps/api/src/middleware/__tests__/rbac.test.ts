import { describe, it, expect, vi } from 'vitest';
import { authorize, requireLgaLock } from '../rbac.js';
import { UserRole, Lga } from '@oslsr/types';
import { AppError } from '@oslsr/utils';

describe('RBAC Middleware', () => {
  describe('authorize', () => {
    it('should call next() if user has an allowed role', () => {
      const req = { user: { role: UserRole.SUPER_ADMIN } } as any;
      const res = {} as any;
      const next = vi.fn();

      const middleware = authorize(UserRole.SUPER_ADMIN);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should call next with AppError if user has no role', () => {
      const req = {} as any;
      const res = {} as any;
      const next = vi.fn();

      const middleware = authorize(UserRole.SUPER_ADMIN);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].code).toBe('AUTH_REQUIRED');
    });

    it('should call next with AppError if user has insufficient permissions', () => {
      const req = { user: { role: UserRole.ENUMERATOR } } as any;
      const res = {} as any;
      const next = vi.fn();

      const middleware = authorize(UserRole.SUPER_ADMIN);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].code).toBe('FORBIDDEN');
    });
  });

  describe('requireLgaLock', () => {
    it('should call next() if user is not field staff', () => {
      const req = { user: { role: UserRole.SUPER_ADMIN } } as any;
      const res = {} as any;
      const next = vi.fn();

      const middleware = requireLgaLock();
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should allow field staff with matching LGA lock', () => {
      const req = { 
        user: { role: UserRole.ENUMERATOR, lgaId: Lga.IBADAN_NORTH },
        params: { lgaId: Lga.IBADAN_NORTH }
      } as any;
      const next = vi.fn();

      const middleware = requireLgaLock();
      middleware(req, {} as any, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should block field staff accessing different LGA', () => {
      const req = { 
        user: { role: UserRole.ENUMERATOR, lgaId: Lga.IBADAN_NORTH },
        params: { lgaId: Lga.IBADAN_NORTH_EAST }
      } as any;
      const next = vi.fn();

      const middleware = requireLgaLock();
      middleware(req, {} as any, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].code).toBe('LGA_ACCESS_DENIED');
    });

    it('should block field staff without an LGA assignment', () => {
      const req = { user: { role: UserRole.ENUMERATOR } } as any;
      const next = vi.fn();

      const middleware = requireLgaLock();
      middleware(req, {} as any, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].code).toBe('LGA_LOCK_REQUIRED');
    });
  });
});

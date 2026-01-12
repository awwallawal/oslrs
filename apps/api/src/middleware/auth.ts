import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { UserRole } from '@oslsr/types';
import jwt from 'jsonwebtoken';

// TODO: Replace with real JWT auth when Story 1.7 is implemented
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return next(new AppError('AUTH_REQUIRED', 'Authentication required', 401));
    }
    
    // MOCK AUTH for development until Story 1.7
    // Accepts 'Bearer superadmin'
    if (authHeader === 'Bearer superadmin') {
        (req as any).user = {
            id: 'mock-super-admin-id',
            role: UserRole.SUPER_ADMIN,
            email: 'admin@oslsr.gov.ng',
            fullName: 'Super Admin'
        };
        return next();
    }

    // Attempt real JWT verification for tests/other users
    try {
        const token = authHeader.replace('Bearer ', '');
        const secret = process.env.JWT_SECRET || 'test-secret';
        const decoded = jwt.verify(token, secret);
        (req as any).user = decoded;
        return next();
    } catch (error) {
        return next(new AppError('INVALID_TOKEN', 'Invalid token', 401));
    }
};

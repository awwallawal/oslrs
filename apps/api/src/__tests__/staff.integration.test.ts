import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../app.js';
import { StaffService } from '../services/staff.service.js';
import { importQueue } from '../queues/import.queue.js';

// Mock auth middleware to bypass JWT validation for unit tests
vi.mock('../middleware/auth.js', () => ({
    authenticate: vi.fn((req: any, res: any, next: any) => {
        // Check if Authorization header is present (simulates auth check)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Authentication required' });
        }
        // Set mock user for authorized requests
        req.user = {
            id: '018e5f2a-1234-7890-abcd-1234567890ab',
            email: 'admin@example.com',
            role: 'super_admin',
            lgaId: null,
        };
        next();
    }),
}));

// Mock StaffService
vi.mock('../services/staff.service.js', () => {
    return {
        StaffService: {
            createManual: vi.fn(),
            validateCsv: vi.fn(),
            processImportRow: vi.fn()
        }
    };
});

// Mock Queue
vi.mock('../queues/import.queue.js', () => ({
    importQueue: {
        add: vi.fn().mockResolvedValue({ id: 'job-123' }),
        getJob: vi.fn().mockResolvedValue({
            id: 'job-123',
            getState: async () => 'completed',
            progress: 100,
            returnvalue: { succeeded: 10 },
            failedReason: null
        })
    }
}));

const validUuid = '018e5f2a-1234-7890-abcd-1234567890ab';

describe('Staff API Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(importQueue.add).mockResolvedValue({ id: 'job-123' } as any);
        vi.mocked(importQueue.getJob).mockResolvedValue({
            id: 'job-123', 
            getState: async () => 'completed',
            progress: 100,
            returnvalue: { succeeded: 10 },
            failedReason: null
        } as any);
    });

    describe('POST /api/v1/staff/manual', () => {
        it('should create staff when authorized', async () => {
            const mockUser = { id: validUuid, email: 'test@example.com' };
            // Service returns { user, emailStatus } per Story 1-11 AC8
            vi.mocked(StaffService.createManual).mockResolvedValue({
                user: mockUser,
                emailStatus: 'sent',
            } as any);

            const res = await request(app)
                .post('/api/v1/staff/manual')
                .set('Authorization', 'Bearer superadmin')
                .send({
                    fullName: 'Test User',
                    email: 'test@example.com',
                    phone: '08012345678',
                    roleId: validUuid,
                    lgaId: validUuid
                });

            expect(res.status).toBe(201);
            // Controller spreads user and adds emailStatus
            expect(res.body.data).toEqual({ ...mockUser, emailStatus: 'sent' });
            expect(StaffService.createManual).toHaveBeenCalled();
        });

        it('should return 401 if unauthorized', async () => {
            const res = await request(app)
                .post('/api/v1/staff/manual')
                .send({});

            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/v1/staff/import', () => {
        it('should queue import job when CSV provided', async () => {
            vi.mocked(StaffService.validateCsv).mockResolvedValue([{ 
                full_name: 'Test', email: 't@e.com', phone: '123', role_name: 'Role' 
            }]);

            const res = await request(app)
                .post('/api/v1/staff/import')
                .set('Authorization', 'Bearer superadmin')
                .attach('file', Buffer.from('full_name,email\nTest,t@e.com'), 'staff.csv');

            expect(res.status).toBe(202);
            expect(res.body.data.jobId).toBe('job-123');
            expect(importQueue.add).toHaveBeenCalled();
        });

        it('should fail if no file', async () => {
             const res = await request(app)
                .post('/api/v1/staff/import')
                .set('Authorization', 'Bearer superadmin');
             expect(res.status).toBe(400);
        });
    });
});
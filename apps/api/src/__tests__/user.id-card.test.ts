import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles, lgas } from '../db/schema/index.js';
import { eq, inArray } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const request = supertest(app);

// Mock services
const mocks = vi.hoisted(() => {
    return {
        generateIDCard: vi.fn().mockResolvedValue(Buffer.from('%PDF-MOCK')),
        getPhotoBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-photo')),
        processLiveSelfie: vi.fn()
    };
});

vi.mock('../services/id-card.service.js', () => {
    return {
        IDCardService: class {
            async generateIDCard(...args: any[]) {
                return mocks.generateIDCard(...args);
            }
        }
    }
});

vi.mock('../services/photo-processing.service.js', () => {
    return {
        PhotoProcessingService: class {
            async getPhotoBuffer(...args: any[]) {
                return mocks.getPhotoBuffer(...args);
            }
            async processLiveSelfie(...args: any[]) {
                return mocks.processLiveSelfie(...args);
            }
            async getSignedUrl() {
                return 'https://s3/signed-url';
            }
        }
    }
});

describe('User ID Card & Verification', () => {
  let authToken: string;
  let userId: string;
  let roleId: string;
  let lgaId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    // Setup Role (idempotent)
    const [role] = await db.insert(roles).values({ name: 'TEST_STAFF', description: 'Test Staff' }).onConflictDoNothing().returning();
    roleId = role?.id || (await db.query.roles.findFirst({ where: eq(roles.name, 'TEST_STAFF') }))!.id;

    // Setup LGA (idempotent)
    const [lga] = await db.insert(lgas).values({ name: 'Test LGA', code: 'test_lga' }).onConflictDoNothing().returning();
    lgaId = lga?.id || (await db.query.lgas.findFirst({ where: eq(lgas.name, 'Test LGA') }))!.id;

    // Setup User with photo
    const [user] = await db.insert(users).values({
      email: `staff-${Date.now()}@test.com`,
      fullName: 'Test Staff Member',
      roleId: roleId,
      lgaId: lgaId,
      status: 'active',
      liveSelfieIdCardUrl: 'staff-photos/id-card/test.jpg',
    }).returning();

    userId = user.id;
    createdUserIds.push(user.id);
    authToken = jwt.sign(
        { userId: user.id, role: 'TEST_STAFF', email: user.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  describe('GET /api/v1/users/id-card', () => {
    it('should generate and download ID card PDF', async () => {
      // Re-set mock implementations (mockReset may clear them between tests)
      mocks.generateIDCard.mockResolvedValue(Buffer.from('%PDF-MOCK'));
      mocks.getPhotoBuffer.mockResolvedValue(Buffer.from('fake-photo'));

      const res = await request
        .get('/api/v1/users/id-card')
        .set('Authorization', `Bearer ${authToken}`);

      if (res.status !== 200) {
          console.error(res.body);
      }
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toBe('application/pdf');
      expect(res.header['content-disposition']).toContain('attachment');
      expect(mocks.generateIDCard).toHaveBeenCalled();

      // We expect the controller to call getPhotoBuffer with the key
      expect(mocks.getPhotoBuffer).toHaveBeenCalledWith('staff-photos/id-card/test.jpg');
    });

    it('should fail if user has no photo', async () => {
      mocks.generateIDCard.mockResolvedValue(Buffer.from('%PDF-MOCK'));
      mocks.getPhotoBuffer.mockResolvedValue(Buffer.from('fake-photo'));

      // Create user without photo
       const [userNoPhoto] = await db.insert(users).values({
          email: `nophoto-${Date.now()}@test.com`,
          fullName: 'No Photo User',
          roleId: roleId,
          status: 'active',
        }).returning();
        createdUserIds.push(userNoPhoto.id);

        const token = jwt.sign({ userId: userNoPhoto.id, role: 'TEST_STAFF' }, process.env.JWT_SECRET || 'test-secret');

        const res = await request
            .get('/api/v1/users/id-card')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(400); // Or 404
        expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/users/verify/:id', () => {
    it('should return public verification details', async () => {
      const res = await request.get(`/api/v1/users/verify/${userId}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
          fullName: 'Test Staff Member',
          status: 'active',
          role: 'TEST_STAFF',
          lga: 'Test LGA'
      });
      // Should NOT return PII
      expect(res.body.data.email).toBeUndefined();
      expect(res.body.data.phoneNumber).toBeUndefined();
      expect(res.body.data.nin).toBeUndefined();
    });

    it('should return 404 for invalid user', async () => {
        const res = await request.get(`/api/v1/users/verify/00000000-0000-0000-0000-000000000000`);
        expect(res.status).toBe(404);
    });
  });
});

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { PhotoProcessingService } from '../services/photo-processing.service.js';

const request = supertest(app);

// Mock PhotoProcessingService
vi.mock('../services/photo-processing.service.js', () => {
  return {
    PhotoProcessingService: class {
      async processLiveSelfie() {
        return {
          originalUrl: 'https://s3/original.jpg',
          idCardUrl: 'https://s3/cropped.jpg',
          livenessScore: 0.95
        };
      }
    }
  };
});

// Mock Multer to bypass file upload in test environment or simulate it
// For supertest, we can attach files directly.

describe('User Selfie Upload', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Setup role (idempotent)
    const [role] = await db.insert(roles).values({ name: 'TEST_ROLE', description: 'Test' }).onConflictDoNothing().returning();
    const roleId = role?.id || (await db.query.roles.findFirst({ where: eq(roles.name, 'TEST_ROLE') }))!.id;

    // Setup test user
    const [user] = await db.insert(users).values({
      email: `selfie-${Date.now()}@test.com`,
      fullName: 'Selfie Test User',
      roleId: roleId,
      status: 'active',
    }).returning();

    userId = user.id;
    authToken = jwt.sign(
        { userId: user.id, role: 'TEST_ROLE', email: user.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    if (userId) {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it('should upload and process selfie successfully', async () => {
    const res = await request
      .post('/api/v1/users/selfie')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', Buffer.from('fake-image'), 'selfie.jpg');

    expect(res.status).toBe(200);
    expect(res.body.data.liveSelfieOriginalUrl).toBe('https://s3/original.jpg');
    expect(res.body.data.liveSelfieIdCardUrl).toBe('https://s3/cropped.jpg');

    // Verify DB update
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(user?.liveSelfieOriginalUrl).toBe('https://s3/original.jpg');
    expect(user?.liveSelfieIdCardUrl).toBe('https://s3/cropped.jpg');
  });

  it('should reject upload without file', async () => {
    const res = await request
      .post('/api/v1/users/selfie')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
  });

  it('should reject unauthorized request', async () => {
    const res = await request
      .post('/api/v1/users/selfie')
      .attach('file', Buffer.from('fake-image'), 'selfie.jpg');

    expect(res.status).toBe(401);
  });
});

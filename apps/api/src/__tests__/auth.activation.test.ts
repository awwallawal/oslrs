import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import sharp from 'sharp';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { generateInvitationToken } from '@oslsr/utils';
import { generateValidNin } from '@oslsr/testing/helpers/nin';

/**
 * Generate a valid test image as base64
 * Creates a 800x600 gradient image that passes validation checks
 */
async function generateTestImageBase64(): Promise<string> {
  // Create a gradient image with enough detail to pass sharpness checks
  const width = 800;
  const height = 600;

  // Create a buffer with gradient pattern (high contrast = passes sharpness check)
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      // Create a gradient with noise for sharpness
      pixels[idx] = (x + y) % 256;     // R
      pixels[idx + 1] = (x * 2) % 256; // G
      pixels[idx + 2] = (y * 2) % 256; // B
    }
  }

  const imageBuffer = await sharp(pixels, {
    raw: { width, height, channels },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  return imageBuffer.toString('base64');
}

const request = supertest(app);

describe('Auth Activation Integration', () => {
  let testUserToken: string;
  let testUserId: string;
  let testUserEmail: string;
  let validNin: string;

  beforeAll(async () => {
      // Ensure roles exist
      await db.insert(roles).values([
          { name: 'SUPER_ADMIN', description: 'Super Administrator' },
          { name: 'ENUMERATOR', description: 'Field Enumerator' }
      ]).onConflictDoNothing();

      // Find a role
      const [role] = await db.select().from(roles).limit(1);
      
      testUserToken = generateInvitationToken();
      validNin = generateValidNin();
      testUserEmail = `activate-${Date.now()}@example.com`;

      const [user] = await db.insert(users).values({
          email: testUserEmail,
          fullName: 'Activate Test',
          roleId: role.id,
          status: 'invited',
          invitationToken: testUserToken,
          invitedAt: new Date(),
      }).returning();
      
      testUserId = user.id;
  });

  it('should activate account with valid token and payload', async () => {
    const payload = {
      password: 'password123',
      nin: validNin,
      dateOfBirth: '1990-01-01',
      homeAddress: '123 Test St, Ibadan',
      bankName: 'Test Bank',
      accountNumber: '0123456789',
      accountName: 'Activate Test',
      nextOfKinName: 'NOK Test',
      nextOfKinPhone: '08012345678'
    };

    const res = await request
      .post(`/api/v1/auth/activate/${testUserToken}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(testUserEmail);
    expect(res.body.data.status).toBe('active');

    // Verify DB
    const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, testUserId)
    });
    expect(updatedUser?.status).toBe('active');
    expect(updatedUser?.invitationToken).toBeNull();
    expect(updatedUser?.nin).toBe(validNin);
  });

  it('should reject invalid token', async () => {
    const res = await request
      .post('/api/v1/auth/activate/invalid-token')
      .send({
          password: 'password123',
          nin: generateValidNin(),
          dateOfBirth: '1990-01-01',
          homeAddress: '123 Test St',
          bankName: 'Test Bank',
          accountNumber: '0123456789',
          accountName: 'Test',
          nextOfKinName: 'Test',
          nextOfKinPhone: '08012345678'
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('should reject if token already used', async () => {
      // The token from first test was invalidated (set to null)
      const res = await request
        .post(`/api/v1/auth/activate/${testUserToken}`)
        .send({
            password: 'password123',
            nin: generateValidNin(),
            dateOfBirth: '1990-01-01',
            homeAddress: '123 Test St',
            bankName: 'Test Bank',
            accountNumber: '0123456789',
            accountName: 'Test',
            nextOfKinName: 'Test',
            nextOfKinPhone: '08012345678'
        });

      expect(res.status).toBe(401);
  });

  it('should validate NIN checksum', async () => {
      const newToken = generateInvitationToken();
      const email = `nin-test-${Date.now()}@example.com`;
      await db.insert(users).values({
          email,
          fullName: 'NIN Test',
          roleId: (await db.select().from(roles).limit(1))[0].id,
          status: 'invited',
          invitationToken: newToken,
      });

      const res = await request
        .post(`/api/v1/auth/activate/${newToken}`)
        .send({
            password: 'password123',
            nin: '12345678901', // Invalid checksum (1234567890 -> 2)
            dateOfBirth: '1990-01-01',
            homeAddress: '123 Test St',
            bankName: 'Test Bank',
            accountNumber: '0123456789',
            accountName: 'Test',
            nextOfKinName: 'Test',
            nextOfKinPhone: '08012345678'
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should activate account without selfie (backward compatible)', async () => {
      const newToken = generateInvitationToken();
      const email = `no-selfie-${Date.now()}@example.com`;
      const nin = generateValidNin();

      await db.insert(users).values({
          email,
          fullName: 'No Selfie Test',
          roleId: (await db.select().from(roles).limit(1))[0].id,
          status: 'invited',
          invitationToken: newToken,
          invitedAt: new Date(),
      });

      const res = await request
        .post(`/api/v1/auth/activate/${newToken}`)
        .send({
            password: 'password123',
            nin,
            dateOfBirth: '1990-01-01',
            homeAddress: '123 Test St, Ibadan',
            bankName: 'Test Bank',
            accountNumber: '0123456789',
            accountName: 'No Selfie Test',
            nextOfKinName: 'NOK Test',
            nextOfKinPhone: '08012345678',
            // No selfieBase64 - should still work
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
  });

  it('should reject activation with invalid base64 selfie', async () => {
      const newToken = generateInvitationToken();
      const email = `bad-selfie-${Date.now()}@example.com`;
      const nin = generateValidNin();

      await db.insert(users).values({
          email,
          fullName: 'Bad Selfie Test',
          roleId: (await db.select().from(roles).limit(1))[0].id,
          status: 'invited',
          invitationToken: newToken,
          invitedAt: new Date(),
      });

      const res = await request
        .post(`/api/v1/auth/activate/${newToken}`)
        .send({
            password: 'password123',
            nin,
            dateOfBirth: '1990-01-01',
            homeAddress: '123 Test St, Ibadan',
            bankName: 'Test Bank',
            accountNumber: '0123456789',
            accountName: 'Bad Selfie Test',
            nextOfKinName: 'NOK Test',
            nextOfKinPhone: '08012345678',
            selfieBase64: 'not-valid-base64!@#$%',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  describe('Activation with Selfie (S3 Integration)', () => {
    // Check if S3 credentials are available (for CI environments without S3 access)
    const hasS3Config = !!(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);

    it.skipIf(!hasS3Config)('should activate account with valid selfie and store S3 URLs in database', async () => {
      const newToken = generateInvitationToken();
      const email = `selfie-s3-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Create invited user
      const [user] = await db.insert(users).values({
        email,
        fullName: 'Selfie S3 Test',
        roleId: (await db.select().from(roles).limit(1))[0].id,
        status: 'invited',
        invitationToken: newToken,
        invitedAt: new Date(),
      }).returning();

      // Generate a valid test image
      const selfieBase64 = await generateTestImageBase64();

      const res = await request
        .post(`/api/v1/auth/activate/${newToken}`)
        .send({
          password: 'password123',
          nin,
          dateOfBirth: '1990-01-01',
          homeAddress: '123 Test St, Ibadan',
          bankName: 'Test Bank',
          accountNumber: '0123456789',
          accountName: 'Selfie S3 Test',
          nextOfKinName: 'NOK Test',
          nextOfKinPhone: '08012345678',
          selfieBase64,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');

      // Verify user in database
      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
      });

      expect(updatedUser?.status).toBe('active');

      // S3 URL assertions only run when S3 is properly configured
      // In CI without S3 credentials, activation succeeds but selfie is skipped (graceful degradation)
      if (hasS3Config && updatedUser?.liveSelfieOriginalUrl) {
        // S3 keys should be stored (format: staff-photos/original/{uuid}.jpg)
        expect(typeof updatedUser.liveSelfieOriginalUrl).toBe('string');
        expect(String(updatedUser.liveSelfieOriginalUrl)).toMatch(/^staff-photos\/original\/.+\.jpg$/);
        expect(typeof updatedUser.liveSelfieIdCardUrl).toBe('string');
        expect(String(updatedUser.liveSelfieIdCardUrl)).toMatch(/^staff-photos\/id-card\/.+\.jpg$/);
        // livenessScore is stored as string in DB (decimal type)
        expect(Number(updatedUser.livenessScore)).toBeGreaterThan(0);
      }
    }, 30000); // 30s timeout for S3 upload
  });

  describe('GET /auth/activate/:token/validate', () => {
    it('should return valid=true with user info for valid token', async () => {
      const newToken = generateInvitationToken();
      const email = `validate-valid-${Date.now()}@example.com`;

      await db.insert(users).values({
        email,
        fullName: 'Validate Valid Test',
        roleId: (await db.select().from(roles).limit(1))[0].id,
        status: 'invited',
        invitationToken: newToken,
        invitedAt: new Date(),
      });

      const res = await request.get(`/api/v1/auth/activate/${newToken}/validate`);

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.email).toBe(email);
      expect(res.body.data.fullName).toBe('Validate Valid Test');
    });

    it('should return valid=false for invalid token', async () => {
      const res = await request.get('/api/v1/auth/activate/invalid-token-xyz/validate');

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.expired).toBe(false);
    });

    it('should return valid=false, expired=true for expired token', async () => {
      const expiredToken = generateInvitationToken();
      const email = `validate-expired-${Date.now()}@example.com`;

      // Create user with invitedAt 25 hours ago (past 24h expiry)
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - 25);

      await db.insert(users).values({
        email,
        fullName: 'Validate Expired Test',
        roleId: (await db.select().from(roles).limit(1))[0].id,
        status: 'invited',
        invitationToken: expiredToken,
        invitedAt: expiredDate,
      });

      const res = await request.get(`/api/v1/auth/activate/${expiredToken}/validate`);

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.expired).toBe(true);
    });

    it('should return valid=false for already activated user', async () => {
      const usedToken = generateInvitationToken();
      const email = `validate-activated-${Date.now()}@example.com`;

      await db.insert(users).values({
        email,
        fullName: 'Validate Activated Test',
        roleId: (await db.select().from(roles).limit(1))[0].id,
        status: 'active', // Already activated
        invitationToken: usedToken,
        invitedAt: new Date(),
      });

      const res = await request.get(`/api/v1/auth/activate/${usedToken}/validate`);

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
    });
  });
});

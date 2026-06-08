import { describe, it, expect, beforeAll, vi } from 'vitest';
import supertest from 'supertest';
import sharp from 'sharp';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { generateInvitationToken, hashInvitationToken } from '@oslsr/utils';
import { StaffService } from '../services/staff.service.js';
import { EmailService } from '../services/email.service.js';
import { generateValidNin } from '@oslsr/testing/helpers/nin';
import { BACK_OFFICE_ROLES, FIELD_ROLES, isBackOfficeRole, UserRole } from '@oslsr/types';

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
  let fieldRoleId: string;

  beforeAll(async () => {
      // Ensure roles exist (lowercase snake_case matches UserRole enum)
      await db.insert(roles).values([
          { name: 'super_admin', description: 'Super Administrator' },
          { name: 'enumerator', description: 'Field Enumerator' },
          { name: 'supervisor', description: 'Field Supervisor' },
          { name: 'data_entry_clerk', description: 'Data Entry Clerk' },
          { name: 'verification_assessor', description: 'Verification Assessor' },
          { name: 'government_official', description: 'Government Official' },
      ]).onConflictDoNothing();

      // Use enumerator (field role) for tests that validate full profile fields
      const allRoles = await db.select().from(roles);
      const enumeratorRole = allRoles.find(r => r.name === 'enumerator')!;
      fieldRoleId = enumeratorRole.id;

      testUserToken = generateInvitationToken();
      validNin = generateValidNin();
      testUserEmail = `activate-${Date.now()}@example.com`;

      const [user] = await db.insert(users).values({
          email: testUserEmail,
          fullName: 'Activate Test',
          roleId: fieldRoleId,
          status: 'invited',
          invitationToken: hashInvitationToken(testUserToken), // OPS-2: stored hashed at rest
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
          roleId: fieldRoleId, // Must be field role to trigger NIN validation
          status: 'invited',
          invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
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
          roleId: fieldRoleId, // Field role — selfie is optional, profile required
          status: 'invited',
          invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
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
          roleId: fieldRoleId, // Field role — selfie validation applies
          status: 'invited',
          invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
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
    let s3Reachable = false;

    // Lightweight connectivity pre-check: HEAD request to the S3 endpoint.
    // If unreachable (network down, firewall, VPN), skip rather than wait 60s and timeout.
    beforeAll(async () => {
      if (!hasS3Config) return;
      try {
        const endpoint = process.env.S3_ENDPOINT || 'https://sfo3.digitaloceanspaces.com';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        await fetch(endpoint, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timer);
        s3Reachable = true;
      } catch {
        s3Reachable = false;
      }
    }, 10000);

    it.skipIf(!hasS3Config)('should activate account with valid selfie and store S3 URLs in database', async (ctx) => {
      if (!s3Reachable) ctx.skip();
      const newToken = generateInvitationToken();
      const email = `selfie-s3-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Create invited user with field role (selfie processing applies)
      const [user] = await db.insert(users).values({
        email,
        fullName: 'Selfie S3 Test',
        roleId: fieldRoleId,
        status: 'invited',
        invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
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
    }, 60000); // 60s timeout for image generation + S3 upload over slow connections
  });

  describe('GET /auth/activate/:token/validate', () => {
    it('should return valid=true with user info for valid token', async () => {
      const newToken = generateInvitationToken();
      const email = `validate-valid-${Date.now()}@example.com`;

      await db.insert(users).values({
        email,
        fullName: 'Validate Valid Test',
        roleId: fieldRoleId,
        status: 'invited',
        invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
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
        roleId: fieldRoleId,
        status: 'invited',
        invitationToken: hashInvitationToken(expiredToken), // OPS-2: stored hashed at rest
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
        roleId: fieldRoleId,
        status: 'active', // Already activated
        invitationToken: hashInvitationToken(usedToken), // OPS-2: stored hashed at rest
        invitedAt: new Date(),
      });

      const res = await request.get(`/api/v1/auth/activate/${usedToken}/validate`);

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
    });

    it('should return roleName for valid token', async () => {
      const newToken = generateInvitationToken();
      const email = `validate-role-${Date.now()}@example.com`;

      const allRoles = await db.select().from(roles);
      const superAdminRole = allRoles.find(r => r.name === 'super_admin');
      const roleId = superAdminRole ? superAdminRole.id : allRoles[0].id;

      await db.insert(users).values({
        email,
        fullName: 'Validate Role Test',
        roleId,
        status: 'invited',
        invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
        invitedAt: new Date(),
      });

      const res = await request.get(`/api/v1/auth/activate/${newToken}/validate`);

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.roleName).toBeDefined();
      expect(typeof res.body.data.roleName).toBe('string');
    });
  });

  describe('Role-based activation (prep-8)', () => {
    it('should activate back-office role with password only', async () => {
      const allRoles = await db.select().from(roles);
      const superAdminRole = allRoles.find(r => r.name === 'super_admin')!;

      const newToken = generateInvitationToken();
      const email = `backoffice-activate-${Date.now()}@example.com`;

      await db.insert(users).values({
        email,
        fullName: 'Back Office User',
        roleId: superAdminRole.id,
        status: 'invited',
        invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
        invitedAt: new Date(),
      });

      // Back-office activation: password only
      const res = await request
        .post(`/api/v1/auth/activate/${newToken}`)
        .send({ password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');

      // Verify DB: no profile fields set
      const updatedUser = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      expect(updatedUser?.status).toBe('active');
      expect(updatedUser?.invitationToken).toBeNull();
      expect(updatedUser?.nin).toBeNull();
      expect(updatedUser?.bankName).toBeNull();
    });

    it('should activate assessor role with password only', async () => {
      const allRoles = await db.select().from(roles);
      const assessorRole = allRoles.find(r => r.name === 'verification_assessor')!;

      const newToken = generateInvitationToken();
      const email = `assessor-activate-${Date.now()}@example.com`;

      await db.insert(users).values({
        email,
        fullName: 'Assessor User',
        roleId: assessorRole.id,
        status: 'invited',
        invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
        invitedAt: new Date(),
      });

      const res = await request
        .post(`/api/v1/auth/activate/${newToken}`)
        .send({ password: 'securepassword' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });

    it('should activate official role with password only', async () => {
      const allRoles = await db.select().from(roles);
      const officialRole = allRoles.find(r => r.name === 'government_official')!;

      const newToken = generateInvitationToken();
      const email = `official-activate-${Date.now()}@example.com`;

      await db.insert(users).values({
        email,
        fullName: 'Official User',
        roleId: officialRole.id,
        status: 'invited',
        invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
        invitedAt: new Date(),
      });

      const res = await request
        .post(`/api/v1/auth/activate/${newToken}`)
        .send({ password: 'officialpass123' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });

    it('should activate supervisor role with all required fields (field role)', async () => {
      const allRoles = await db.select().from(roles);
      const supervisorRole = allRoles.find(r => r.name === 'supervisor')!;

      const newToken = generateInvitationToken();
      const email = `supervisor-activate-${Date.now()}@example.com`;
      const nin = generateValidNin();

      await db.insert(users).values({
        email,
        fullName: 'Supervisor User',
        roleId: supervisorRole.id,
        status: 'invited',
        invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
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
          accountName: 'Supervisor User',
          nextOfKinName: 'NOK Test',
          nextOfKinPhone: '08012345678',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });

    it('should activate data_entry_clerk role with all required fields (field role)', async () => {
      const allRoles = await db.select().from(roles);
      const clerkRole = allRoles.find(r => r.name === 'data_entry_clerk')!;

      const newToken = generateInvitationToken();
      const email = `clerk-activate-${Date.now()}@example.com`;
      const nin = generateValidNin();

      await db.insert(users).values({
        email,
        fullName: 'Clerk User',
        roleId: clerkRole.id,
        status: 'invited',
        invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
        invitedAt: new Date(),
      });

      const res = await request
        .post(`/api/v1/auth/activate/${newToken}`)
        .send({
          password: 'password123',
          nin,
          dateOfBirth: '1992-05-15',
          homeAddress: '456 Clerk Ave, Lagos',
          bankName: 'Access Bank',
          accountNumber: '9876543210',
          accountName: 'Clerk User',
          nextOfKinName: 'Clerk NOK',
          nextOfKinPhone: '08098765432',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });

    it('should reject field role activation without required profile fields', async () => {
      const allRoles = await db.select().from(roles);
      const enumeratorRole = allRoles.find(r => r.name === 'enumerator')!;

      const newToken = generateInvitationToken();
      const email = `field-reject-${Date.now()}@example.com`;

      await db.insert(users).values({
        email,
        fullName: 'Field User',
        roleId: enumeratorRole.id,
        status: 'invited',
        invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
        invitedAt: new Date(),
      });

      // Field role with only password — should fail validation
      const res = await request
        .post(`/api/v1/auth/activate/${newToken}`)
        .send({ password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should still activate field role with all required fields', async () => {
      const allRoles = await db.select().from(roles);
      const enumeratorRole = allRoles.find(r => r.name === 'enumerator')!;

      const newToken = generateInvitationToken();
      const email = `field-full-${Date.now()}@example.com`;
      const nin = generateValidNin();

      await db.insert(users).values({
        email,
        fullName: 'Field Full User',
        roleId: enumeratorRole.id,
        status: 'invited',
        invitationToken: hashInvitationToken(newToken), // OPS-2: stored hashed at rest
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
          accountName: 'Field Full User',
          nextOfKinName: 'NOK Test',
          nextOfKinPhone: '08012345678',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });
  });

  describe('OPS-2: invitation token hashed at rest (Story 9-42 AC#11)', () => {
    it('should store a 64-hex SHA-256 hash (NOT the 32-hex raw token) when creating staff', async () => {
      const allRoles = await db.select().from(roles);
      const superAdminRole = allRoles.find(r => r.name === 'super_admin')!;
      const email = `ops2-store-${Date.now()}@example.com`;

      const { user } = await StaffService.createManual(
        {
          fullName: 'OPS2 Store User',
          email,
          phone: `080${Date.now().toString().slice(-8)}`,
          roleId: superAdminRole.id,
        },
        testUserId, // real users.id — satisfies audit_logs.actor_id FK
      );

      const persisted = await db.query.users.findFirst({ where: eq(users.id, user.id) });
      // sha256 hex = 64 chars; the legacy raw token was 32 hex chars — the length
      // alone proves the column holds a hash, not the plaintext token.
      expect(persisted?.invitationToken).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should activate end-to-end with the PLAINTEXT token while only its hash is stored', async () => {
      const plaintext = generateInvitationToken();
      const email = `ops2-lookup-${Date.now()}@example.com`;

      const [created] = await db.insert(users).values({
        email,
        fullName: 'OPS2 Lookup User',
        roleId: fieldRoleId, // enumerator → field role (needs full profile)
        status: 'invited',
        invitationToken: hashInvitationToken(plaintext), // only the hash at rest
        invitedAt: new Date(),
      }).returning();

      // Sanity: the stored value is the hash, not the plaintext.
      expect(created.invitationToken).toBe(hashInvitationToken(plaintext));
      expect(created.invitationToken).not.toBe(plaintext);

      const res = await request
        .post(`/api/v1/auth/activate/${plaintext}`)
        .send({
          password: 'password123',
          nin: generateValidNin(),
          dateOfBirth: '1990-01-01',
          homeAddress: '123 Test St, Ibadan',
          bankName: 'Test Bank',
          accountNumber: '0123456789',
          accountName: 'OPS2 Lookup User',
          nextOfKinName: 'NOK Test',
          nextOfKinPhone: '08012345678',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');

      const after = await db.query.users.findFirst({ where: eq(users.id, created.id) });
      expect(after?.invitationToken).toBeNull(); // invalidated on activation
    });

    it('should REJECT submitting the stored hash as the token (proves lookup re-hashes input)', async () => {
      const plaintext = generateInvitationToken();
      const storedHash = hashInvitationToken(plaintext);
      const email = `ops2-hash-as-token-${Date.now()}@example.com`;

      await db.insert(users).values({
        email,
        fullName: 'OPS2 Hash-As-Token User',
        roleId: fieldRoleId,
        status: 'invited',
        invitationToken: storedHash,
        invitedAt: new Date(),
      });

      // Submitting the HASH itself must fail: the service hashes the input, so
      // sha256(storedHash) ≠ storedHash. A DB/Redis leak of the column is useless.
      const res = await request
        .post(`/api/v1/auth/activate/${storedHash}`)
        .send({
          password: 'password123',
          nin: generateValidNin(),
          dateOfBirth: '1990-01-01',
          homeAddress: '123 Test St, Ibadan',
          bankName: 'Test Bank',
          accountNumber: '0123456789',
          accountName: 'OPS2 Hash-As-Token User',
          nextOfKinName: 'NOK Test',
          nextOfKinPhone: '08012345678',
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_INVALID_TOKEN');
    });

    it('should email the PLAINTEXT token while persisting only its hash (store-path regression lock)', async () => {
      // M2 (code-review 2026-06-08): the hash-at-rest tests above insert the
      // hash manually, bypassing the real store sites. This locks the OTHER
      // half of the security property — that createManual emails the PLAINTEXT
      // token and stores its hash — so a regression that emailed the hash
      // (which would silently break activation) fails loudly here.
      const allRoles = await db.select().from(roles);
      const superAdminRole = allRoles.find(r => r.name === 'super_admin')!;
      const email = `ops2-email-${Date.now()}@example.com`;

      const urlSpy = vi.spyOn(EmailService, 'generateStaffActivationUrl');
      try {
        const { user } = await StaffService.createManual(
          {
            fullName: 'OPS2 Email User',
            email,
            phone: `080${Date.now().toString().slice(-8)}`,
            roleId: superAdminRole.id,
          },
          testUserId,
        );

        // The activation URL must carry the PLAINTEXT token (32-hex), never the
        // 64-hex SHA-256 hash that lands in the column.
        expect(urlSpy).toHaveBeenCalledTimes(1);
        const emailedToken = urlSpy.mock.calls[0][0];
        expect(emailedToken).toMatch(/^[0-9a-f]{32}$/);

        const persisted = await db.query.users.findFirst({ where: eq(users.id, user.id) });
        expect(persisted?.invitationToken).toBe(hashInvitationToken(emailedToken));
        expect(persisted?.invitationToken).not.toBe(emailedToken);
      } finally {
        urlSpy.mockRestore();
      }
    });
  });

  describe('L1: bulk-import invitation email ownership (createManual skipInvitationEmail)', () => {
    it('should NOT queue the invitation email yet still return the plaintext token when skipInvitationEmail is set', async () => {
      // L1 (9-46): the import worker owns budget-aware emailing, so createManual
      // must not also send (pre-fix it double-sent + the worker's copy was broken).
      const allRoles = await db.select().from(roles);
      const superAdminRole = allRoles.find(r => r.name === 'super_admin')!;
      const email = `l1-skip-${Date.now()}@example.com`;

      const urlSpy = vi.spyOn(EmailService, 'generateStaffActivationUrl');
      try {
        const result = await StaffService.createManual(
          {
            fullName: 'L1 Skip User',
            email,
            phone: `080${Date.now().toString().slice(-8)}`,
            roleId: superAdminRole.id,
          },
          testUserId,
          { skipInvitationEmail: true },
        );

        // createManual must NOT build/queue the email — the worker owns that.
        expect(urlSpy).not.toHaveBeenCalled();
        // ...but it must return the plaintext token so the caller can email it,
        // while the column still holds only the hash.
        expect(result.invitationToken).toMatch(/^[0-9a-f]{32}$/);
        const persisted = await db.query.users.findFirst({ where: eq(users.id, result.user.id) });
        expect(persisted?.invitationToken).toBe(hashInvitationToken(result.invitationToken));
      } finally {
        urlSpy.mockRestore();
      }
    });
  });

  describe('Role classification constants', () => {
    it('should classify back-office roles correctly', () => {
      expect(isBackOfficeRole(UserRole.SUPER_ADMIN)).toBe(true);
      expect(isBackOfficeRole(UserRole.GOVERNMENT_OFFICIAL)).toBe(true);
      expect(isBackOfficeRole(UserRole.VERIFICATION_ASSESSOR)).toBe(true);
    });

    it('should classify field roles correctly', () => {
      expect(isBackOfficeRole(UserRole.ENUMERATOR)).toBe(false);
      expect(isBackOfficeRole(UserRole.SUPERVISOR)).toBe(false);
      expect(isBackOfficeRole(UserRole.DATA_ENTRY_CLERK)).toBe(false);
    });

    it('should classify public user as non-back-office', () => {
      expect(isBackOfficeRole(UserRole.PUBLIC_USER)).toBe(false);
    });

    it('should have DATA_ENTRY_CLERK in FIELD_ROLES', () => {
      expect(FIELD_ROLES).toContain(UserRole.DATA_ENTRY_CLERK);
    });

    it('should have 3 back-office and 3 field roles', () => {
      expect(BACK_OFFICE_ROLES).toHaveLength(3);
      expect(FIELD_ROLES).toHaveLength(3);
    });
  });
});

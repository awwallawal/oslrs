import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { generateInvitationToken } from '@oslsr/utils';
import { modulus11Generate } from '@oslsr/utils/src/validation';

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
      const seed = Math.floor(Math.random() * 1000000000).toString().padStart(10, '0');
      validNin = modulus11Generate(seed);
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
          nin: modulus11Generate('1111111111'),
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
            nin: modulus11Generate('2222222222'),
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
});

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { generateInvitationToken, verhoeffGenerate } from '@oslsr/utils';
import { eq } from 'drizzle-orm';

const request = supertest(app);

describe('Security: Authentication & Authorization', () => {
  let roleId: string;

  beforeAll(async () => {
    // Ensure role exists
    await db.insert(roles).values({
      name: 'TEST_ROLE',
      description: 'Test Role',
    }).onConflictDoNothing();
    const [role] = await db.select().from(roles).where(eq(roles.name, 'TEST_ROLE'));
    roleId = role.id;
  });

  describe('Token Expiry (Deterministic)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
    });

    afterAll(() => {
      vi.useRealTimers();
    });

    it('should reject activation token after 24 hours', async () => {
      // 1. Set time to "Start"
      const startTime = new Date('2025-01-01T10:00:00Z');
      vi.setSystemTime(startTime);

      // 2. Create invited user
      const token = generateInvitationToken();
      const email = `expiry-${Date.now()}-${Math.random()}@example.com`;
      
      await db.insert(users).values({
        email,
        fullName: 'Expiry Test',
        roleId,
        status: 'invited',
        invitationToken: token,
        invitedAt: new Date(), // Will use mocked time
      });

      // 3. Fast-forward 25 hours
      const futureTime = new Date('2025-01-02T11:00:00Z'); // +25h
      vi.setSystemTime(futureTime);

      // 4. Attempt activation
      const seed = Math.floor(Math.random() * 1000000000).toString().padStart(10, '0');
      const nin = verhoeffGenerate(seed);

      const res = await request.post(`/api/v1/auth/activate/${token}`).send({
        password: 'Password123!',
        nin,
        dateOfBirth: '1990-01-01',
        homeAddress: 'Test Address',
        bankName: 'Test Bank',
        accountNumber: '1234567890',
        accountName: 'Test Name',
        nextOfKinName: 'NOK',
        nextOfKinPhone: '08012345678'
      });

      // 5. Expect rejection
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_TOKEN_EXPIRED');
    });
  });

  describe('Auth Bypass', () => {
    it('should reject access to protected routes without token', async () => {
      const res = await request.get('/api/v1/users/id-card');
      expect(res.status).toBe(401);
    });

    it('should reject access with invalid token', async () => {
      const res = await request.get('/api/v1/users/id-card')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401); // Or 401 depending on middleware
    });
  });
});

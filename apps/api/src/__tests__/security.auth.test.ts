import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { INVITATION_EXPIRY_HOURS } from '../config/invitation.js';
import supertest from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { generateInvitationToken, hashInvitationToken } from '@oslsr/utils';
import { generateValidNin } from '@oslsr/testing/helpers/nin';
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

    /*
     * Expressed RELATIVE to INVITATION_EXPIRY_HOURS (2026-09-05). This used a fake
     * clock advanced to a LITERAL '2025-01-02T11:00:00Z  // +25h', which silently
     * stopped testing anything the moment the window moved 24h -> 48h: 25 hours was
     * then well inside it, so the token was valid and the assertion failed.
     *
     * Second site of the same defect in one change (the other was in
     * auth.activation.test.ts). Both were invisible until the real value moved —
     * which is precisely the argument for the shared constant: a hardcoded window in
     * a TEST is the same defect as one in the code, and it hides for longer.
     */
    it(`should reject activation token after ${INVITATION_EXPIRY_HOURS} hours`, async () => {
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
        invitationToken: hashInvitationToken(token), // OPS-2: stored hashed at rest
        invitedAt: new Date(), // Will use mocked time
      });

      // 3. Fast-forward past the window — derived, never a literal date.
      const futureTime = new Date(startTime.getTime() + (INVITATION_EXPIRY_HOURS + 1) * 60 * 60 * 1000);
      vi.setSystemTime(futureTime);

      // 4. Attempt activation (use helper with retry for Modulus 11 edge case)
      const nin = generateValidNin();

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

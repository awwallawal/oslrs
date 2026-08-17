import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles, lgas } from '../db/schema/index.js';
import { eq, inArray } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { purgeUsersWithAuditDrain } from './helpers/audit-safe-teardown.js'; // Story 13-59

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
    /*
     * ⛔ Story 13-59 — THIS TOKEN USED TO SAY `{ userId: user.id }`, AND THAT IS
     * WHY THE DEAD ENDPOINT STAYED GREEN.
     *
     * `TokenService.generateAccessToken` keys the principal under `sub`
     * (`packages/types/src/auth.ts`); no token production ever issues has a
     * `userId` claim. The controller read `.userId`, this fixture minted
     * `.userId`, and the two agreed with each other while disagreeing with
     * every real request — so `GET /users/id-card` returned 401 to every
     * authenticated caller in production and the suite reported success.
     *
     * [[pattern-test-that-passes-over-a-hole]] in its exact form: the test
     * constructed a world in which the wrong code was right. The fixture now
     * mirrors the real payload, which is the only version of this test that can
     * fail when the endpoint is broken.
     */
    authToken = jwt.sign(
        { sub: user.id, jti: `test-jti-${Date.now()}`, role: 'TEST_STAFF', email: user.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
    );
  });

  /*
   * Story 13-59 — the ID-card download now writes a `staff.id_card_downloaded`
   * audit row (AC7.2), so this teardown's bare `delete from users` started
   * hitting `audit_logs_actor_id_users_id_fk` (23503): the very row that proves
   * the download happened is a child of the user being deleted.
   *
   * `purgeUsersWithAuditDrain` is 13-30's shared helper for exactly this — it
   * takes the parent lock FIRST, which closes the window against a concurrent
   * fire-and-forget audit insert, rather than racing it with a delete-order
   * guess. Reused rather than re-solved.
   */
  afterAll(async () => {
    await purgeUsersWithAuditDrain(createdUserIds);
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

        // Production payload shape — see the note in beforeAll.
        const token = jwt.sign(
          { sub: userNoPhoto.id, jti: `test-jti-nophoto-${Date.now()}`, role: 'TEST_STAFF' },
          process.env.JWT_SECRET || 'test-secret',
        );

        const res = await request
            .get('/api/v1/users/id-card')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(400);
        /*
         * Story 13-59 AC5.3 — was `VALIDATION_ERROR`, now a specific code so the
         * first-login modal can distinguish "you have no photo yet" (offer
         * 13-60's retry) from "your request was malformed" (offer nothing)
         * without string-matching a human-readable message.
         */
        expect(res.body.code).toBe('ID_CARD_PHOTO_MISSING');
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

    // Story 9-43 AC#4 (F-020) — minimized payload + photo proxy.
    it('returns only the minimized field set (no internal id)', async () => {
      const res = await request.get(`/api/v1/users/verify/${userId}`);

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(
        ['fullName', 'status', 'role', 'lga', 'verifiedAt', 'photoUrl'].sort(),
      );
      // Internal UUID dropped (already in the request URL).
      expect(res.body.data.id).toBeUndefined();
    });

    it('proxies the photo through the API — no raw signed Spaces URL in the body', async () => {
      const res = await request.get(`/api/v1/users/verify/${userId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.photoUrl).toBe(`/api/v1/users/verify/${userId}/photo`);
      // The previously-leaked signed Spaces URL must NOT appear anywhere.
      expect(JSON.stringify(res.body.data)).not.toContain('signed-url');
      expect(JSON.stringify(res.body.data)).not.toContain('https://');
    });

    it('GET /verify/:id/photo streams the photo bytes', async () => {
      mocks.getPhotoBuffer.mockResolvedValue(Buffer.from('fake-photo'));

      const res = await request.get(`/api/v1/users/verify/${userId}/photo`);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('image/jpeg');
      expect(mocks.getPhotoBuffer).toHaveBeenCalledWith('staff-photos/id-card/test.jpg');
    });

    it('should return 404 for invalid user', async () => {
        const res = await request.get(`/api/v1/users/verify/00000000-0000-0000-0000-000000000000`);
        expect(res.status).toBe(404);
    });
  });
});

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { PhotoProcessingService } from '../services/photo-processing.service.js';

const request = supertest(app);

/**
 * Mock PhotoProcessingService.
 *
 * `processLiveSelfie` records the `source` option it was called with (Story
 * 13-60 AC6.2) so the tests below can assert the discriminator actually reaches
 * the service rather than being dropped between the multipart body and the call.
 */
const processLiveSelfieCalls: Array<{ source?: string } | undefined> = [];

vi.mock('../services/photo-processing.service.js', () => {
  return {
    PhotoProcessingService: class {
      async processLiveSelfie(_buffer: Buffer, opts?: { source?: string }) {
        processLiveSelfieCalls.push(opts);
        return {
          originalUrl: 'https://s3/original.jpg',
          idCardUrl: 'https://s3/cropped.jpg',
          sharpnessScore: 0.95
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
    // F-023 (Story 9-42): sign the token the way the app actually issues it —
    // the principal under `.sub` (+ a `jti`), NOT `.userId`. The prior fixture
    // used `{ userId }`, which masked the controller bug (`req.user.userId`).
    // With the real `.sub` shape, a regression to `.userId` in the controller
    // would surface here as a 401, regression-locking the always-401 bug.
    authToken = jwt.sign(
        { sub: user.id, jti: 'selfie-test-jti', role: 'TEST_ROLE', email: user.email },
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

    // Story 13-60 — a photo that arrives here is SAVED, and it came from a live
    // capture unless the client said otherwise. Asserting only the two URLs (as
    // this test used to) passes over exactly the hole the story closes.
    expect(user?.photoStatus).toBe('saved');
    expect(user?.photoSource).toBe('live_capture');
  });

  /**
   * Story 13-60 AC2 — the way back without an admin.
   *
   * A staff member whose photo FAILED at activation logs in and adds one here.
   * The failure state must be cleared, or the operator's pre-field-day screen
   * keeps reporting somebody who has already fixed it.
   */
  it('clears a prior failure when the person retries successfully', async () => {
    await db.update(users)
      .set({ photoStatus: 'failed', photoFailureReason: 'S3 upload failed', photoSource: 'live_capture' })
      .where(eq(users.id, userId));

    const res = await request
      .post('/api/v1/users/selfie')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', Buffer.from('fake-image'), 'selfie.jpg');

    expect(res.status).toBe(200);

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(user?.photoStatus).toBe('saved');
    expect(user?.photoFailureReason).toBeNull();
  });

  /**
   * Story 13-60 AC6.2 — ⛔ THE NON-NEGOTIABLE ONE.
   *
   * An uploaded passport photograph must NEVER be recorded as a live capture.
   * Storing it under a name that asserts "live" recreates, self-inflicted, the
   * exact defect this story fixes one column over (`liveness_score` holding a
   * sharpness ratio) — because here we know at write time which path we are on.
   */
  it('records an uploaded photo as an upload, never as a live capture', async () => {
    processLiveSelfieCalls.length = 0;

    const res = await request
      .post('/api/v1/users/selfie')
      .set('Authorization', `Bearer ${authToken}`)
      .field('source', 'upload')
      .attach('file', Buffer.from('fake-image'), 'passport.jpg');

    expect(res.status).toBe(200);
    expect(res.body.data.photoSource).toBe('upload');

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(user?.photoSource).toBe('upload');
    expect(user?.photoStatus).toBe('saved');

    // The discriminator must reach the SERVICE too — it governs the blur floor.
    expect(processLiveSelfieCalls.at(-1)).toEqual({ source: 'upload' });
  });

  /**
   * A `source` we do not recognise must fail CLOSED to the conservative value,
   * not be written through into the column. Same lesson as 13-61: an unknown
   * filter value that fails permissively is how bad data gets in quietly.
   */
  it('falls back to live_capture for an unrecognised source', async () => {
    const res = await request
      .post('/api/v1/users/selfie')
      .set('Authorization', `Bearer ${authToken}`)
      .field('source', 'definitely-not-a-source')
      .attach('file', Buffer.from('fake-image'), 'selfie.jpg');

    expect(res.status).toBe(200);

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(user?.photoSource).toBe('live_capture');
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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles, auditLogs } from '../db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { purgeUsersWithAuditDrain } from './helpers/audit-safe-teardown.js';
import { hashPassword } from '@oslsr/utils';

const request = supertest(app);

describe('User Profile Integration', () => {
  let userId: string;
  let otherUserId: string;
  let accessToken: string;
  const email = `profile-test-${Date.now()}@example.com`;
  const otherEmail = `profile-other-${Date.now()}@example.com`;
  const password = 'TestPass123!';
  // Dynamic phones to avoid `users_phone_unique` collisions when a prior test run
  // left residue in the test DB (e.g., killed mid-test before afterAll cleanup).
  // Derived from Date.now() like the email fixtures above; padded to E.164 NG length.
  const phone = `0801${String(Date.now() % 10_000_000).padStart(7, '0')}`;
  const otherPhone = `0809${String((Date.now() + 1) % 10_000_000).padStart(7, '0')}`;

  beforeAll(async () => {
    await db.insert(roles).values([
      { name: 'super_admin', description: 'Super Administrator' },
    ]).onConflictDoNothing();

    const role = await db.query.roles.findFirst({ where: eq(roles.name, 'super_admin') });
    const hashedPw = await hashPassword(password);

    const [user] = await db.insert(users).values({
      email,
      fullName: 'Profile Test User',
      phone,
      roleId: role!.id,
      status: 'active',
      passwordHash: hashedPw,
      homeAddress: '123 Old Street',
    }).returning();
    userId = user.id;

    // Create another user to test phone uniqueness
    const [otherUser] = await db.insert(users).values({
      email: otherEmail,
      fullName: 'Other User',
      phone: otherPhone,
      roleId: role!.id,
      status: 'active',
      passwordHash: hashedPw,
    }).returning();
    otherUserId = otherUser.id;

    // Login to get access token
    const loginRes = await request
      .post('/api/v1/auth/staff/login')
      .send({ email, password, captchaToken: 'test-captcha-bypass' });
    accessToken = loginRes.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
    // Story 13-30: the login (beforeAll) and profile-update tests fire
    // fire-and-forget `audit_logs.actor_id` writes for these users; drain them
    // to avoid the delete-order FK teardown race.
    await purgeUsersWithAuditDrain([userId, otherUserId]);
  });

  describe('GET /api/v1/users/profile', () => {
    it('should return full profile data', async () => {
      const res = await request
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(userId);
      expect(res.body.data.email).toBe(email);
      expect(res.body.data.fullName).toBe('Profile Test User');
      expect(res.body.data.phone).toBe(phone);
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.roleName).toBe('super_admin');
      expect(res.body.data).toHaveProperty('createdAt');
      expect(res.body.data).toHaveProperty('lgaName');
      expect(res.body.data).toHaveProperty('homeAddress');
      expect(res.body.data).toHaveProperty('bankName');
    });

    it('should reject without authentication', async () => {
      const res = await request.get('/api/v1/users/profile');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/users/profile', () => {
    it('should update profile with valid partial data', async () => {
      const res = await request
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: 'Updated Name', homeAddress: '456 New Street' });

      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe('Updated Name');
      expect(res.body.data.homeAddress).toBe('456 New Street');
    });

    it('should reject without authentication', async () => {
      const res = await request
        .patch('/api/v1/users/profile')
        .send({ fullName: 'Test' });

      expect(res.status).toBe(401);
    });

    it('should reject empty fullName', async () => {
      const res = await request
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: '' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid phone format', async () => {
      const res = await request
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone: '123' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid account number', async () => {
      const res = await request
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ accountNumber: '123' });

      expect(res.status).toBe(400);
    });

    it('should reject duplicate phone number', async () => {
      const res = await request
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone: otherPhone }); // Other user's phone

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DUPLICATE_PHONE');
    });

    it('should allow updating phone to own current phone', async () => {
      // First restore a known phone
      await request
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone });

      // Should succeed — same phone as current
      const res = await request
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone });

      expect(res.status).toBe(200);
    });

    it('should create audit log entry on profile update', async () => {
      // Update profile
      await request
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: 'Audit Test Name' });

      // The audit write is fire-and-forget. Poll for OUR row instead of
      // sleeping a fixed 500ms (too short on a loaded box, wasted time when
      // fast), and scope the query to `actorId = userId`: the previous version
      // took the globally-latest `user.profile_updated` row, so any other test
      // file updating a profile concurrently stole the assertion
      // (`logs[0].actorId` = someone else). Never assert on global rows you
      // don't own — cf. `test/registry-scoped-counts.ts`.
      const deadline = Date.now() + 10_000;
      let ours: typeof auditLogs.$inferSelect | undefined;
      while (!ours && Date.now() < deadline) {
        const logs = await db.query.auditLogs.findMany({
          where: and(eq(auditLogs.action, 'user.profile_updated'), eq(auditLogs.actorId, userId)),
          orderBy: (auditLogs, { desc }) => [desc(auditLogs.createdAt)],
          limit: 1,
        });
        ours = logs[0];
        if (!ours) await new Promise((r) => setTimeout(r, 100));
      }

      expect(ours, 'no user.profile_updated audit row was written for this actor').toBeTruthy();
      expect(ours!.actorId).toBe(userId);
      expect(ours!.targetResource).toBe('user');
    });

    /**
     * REGRESSION (2026-07-22) — STAGED RACE for the assertion above.
     *
     * The previous version of that test read the globally-latest
     * `user.profile_updated` row (`limit: 1`, no actor filter) and then asserted
     * `logs[0].actorId === userId`. That holds only while no other actor updates
     * a profile in the same window — an assumption about the whole shared test
     * DB, which any parallel test file can break (and did).
     *
     * Rather than argue about it, this test STAGES the race deterministically: a
     * second, real user updates their profile through the same endpoint AFTER
     * ours, so the globally-latest row provably belongs to the interloper. It
     * then asserts both halves — the unscoped read returns the OTHER actor (the
     * pre-fix assertion would fail here), and the actor-scoped read still finds
     * OUR row (the fix holds).
     */
    it('actor-scoped audit lookup survives a concurrent profile update by another user', async () => {
      // (1) Our update.
      await request
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: 'Race Ours' });

      const findLatestFor = async (actorId: string) =>
        (
          await db.query.auditLogs.findMany({
            where: and(eq(auditLogs.action, 'user.profile_updated'), eq(auditLogs.actorId, actorId)),
            orderBy: (auditLogs, { desc }) => [desc(auditLogs.createdAt)],
            limit: 1,
          })
        )[0];

      const waitFor = async (fn: () => Promise<unknown>, label: string) => {
        const deadline = Date.now() + 10_000;
        let v = await fn();
        while (!v && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 100));
          v = await fn();
        }
        expect(v, `timed out waiting for ${label}`).toBeTruthy();
        return v;
      };

      await waitFor(() => findLatestFor(userId), 'our audit row');

      // (2) The interloper: a DIFFERENT real user updates their profile after us,
      // through the same endpoint — a genuine concurrent actor, not a synthetic
      // row (which would corrupt the audit hash chain that other suites verify).
      const otherLogin = await request
        .post('/api/v1/auth/staff/login')
        .send({ email: otherEmail, password, captchaToken: 'test-captcha-bypass' });
      const otherToken = otherLogin.body.data.accessToken as string;
      await request
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ fullName: 'Race Interloper' });

      await waitFor(() => findLatestFor(otherUserId), "the interloper's audit row");

      // (3) The pre-fix read — globally latest, no actor filter — now belongs to
      // the OTHER user. This is exactly the state that reddened the old assertion.
      const globalLatest = await db.query.auditLogs.findMany({
        where: eq(auditLogs.action, 'user.profile_updated'),
        orderBy: (auditLogs, { desc }) => [desc(auditLogs.createdAt)],
        limit: 1,
      });
      expect(globalLatest[0]?.actorId).toBe(otherUserId);

      // (4) The fixed read is unaffected: it still resolves OUR row.
      const scoped = await findLatestFor(userId);
      expect(scoped!.actorId).toBe(userId);
      expect(scoped!.targetResource).toBe('user');
    }, 30_000);
  });
});

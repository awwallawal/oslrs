import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { purgeUsersWithAuditDrain } from './helpers/audit-safe-teardown.js';
import { hashPassword } from '@oslsr/utils';

/**
 * Integration test: Audit Routes Authorization (Story 6-1, Code Review M3)
 * Verifies that GET /api/v1/audit-logs/verify-chain enforces authentication
 * and Super Admin authorization at the route level.
 */
describe('Audit Routes - Authorization', () => {
  let enumeratorToken: string;
  let enumeratorUserId: string;

  beforeAll(async () => {
    // Ensure roles exist
    await db.insert(roles).values([
      { name: 'super_admin', description: 'Super Administrator' },
      { name: 'enumerator', description: 'Field Enumerator' },
    ]).onConflictDoNothing();

    const enumRole = await db.query.roles.findFirst({
      where: eq(roles.name, 'enumerator'),
    });

    // Create a non-super-admin user for 403 test
    const email = `audit-auth-test-${Date.now()}@example.com`;
    const password = 'TestPass123!';
    const hashed = await hashPassword(password);

    const [user] = await db.insert(users).values({
      email,
      fullName: 'Audit Auth Test User',
      roleId: enumRole!.id,
      status: 'active',
      passwordHash: hashed,
    }).returning();
    enumeratorUserId = user.id;

    // Log in to get a token (staff login endpoint)
    const loginRes = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email, password, captchaToken: 'test-captcha-bypass' });
    enumeratorToken = loginRes.body.data?.accessToken;
  });

  afterAll(async () => {
    // Story 13-30: the staff login in beforeAll fires a fire-and-forget
    // `audit_logs.actor_id` write for this user; drain it to avoid the
    // delete-order FK teardown race.
    await purgeUsersWithAuditDrain([enumeratorUserId]);
  });

  it('should return 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/audit-logs/verify-chain');
    expect(res.status).toBe(401);
  });

  it('should return 403 for non-Super-Admin user (enumerator)', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs/verify-chain')
      .set('Authorization', `Bearer ${enumeratorToken}`);
    expect(res.status).toBe(403);
  });
});

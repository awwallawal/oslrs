/**
 * Story 13-18 — server step-up re-auth route hygiene.
 *
 * Part 1 (AC3, the keystone): anti-drift assertions between the
 * SENSITIVE_ACTIONS inventory (middleware/sensitive-action.ts) and the LIVE
 * Express router stack. Both directions:
 *   - every inventory entry must resolve to a registered route whose
 *     middleware chain contains the declared fresh-reauth gate (a route
 *     rename that un-gates a sensitive action FAILS here), and
 *   - every registered route carrying a fresh-reauth gate must be
 *     inventoried (a gate added without documentation FAILS here).
 *
 * Part 2 (AC2 + AC4): integration tests against the real app + DB + Redis —
 * no-grace sessions get 403 AUTH_REAUTH_REQUIRED on every inventoried route,
 * POST /auth/reauth restores access, interactive password login grants the
 * 5-minute grace, magic-link login does NOT, logout clears it, and
 * passwordless accounts are exempt on the profile route.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js';
import { SENSITIVE_ACTIONS } from '../middleware/sensitive-action.js';
import { getRedisClient } from '../lib/redis.js';
import { db } from '../db/index.js';
import { users, roles, magicLinkTokens } from '../db/schema/index.js';
import { MagicLinkService } from '../services/magic-link.service.js';
import { eq } from 'drizzle-orm';
import { purgeUsersWithAuditDrain } from './helpers/audit-safe-teardown.js';
import { hashPassword } from '@oslsr/utils';
import { randomUUID } from 'node:crypto';

const request = supertest(app);

// ---------------------------------------------------------------------------
// Router-stack introspection (Express 4)
// ---------------------------------------------------------------------------

interface RegisteredRoute {
  method: string;
  path: string;
  middleware: string[];
}

interface RouterLayer {
  route?: {
    path: string | string[];
    methods: Record<string, boolean>;
    stack: Array<{ handle?: { name?: string }; name?: string }>;
  };
  name?: string;
  handle?: { stack?: RouterLayer[] };
  regexp?: RegExp & { fast_slash?: boolean };
}

/**
 * Decode the mount prefix from an Express string-mount regexp, e.g.
 * /^\/api\/v1\/?(?=\/|$)/i  →  '/api/v1'
 */
function decodeMountPath(regexp: RegExp & { fast_slash?: boolean }): string {
  if (regexp.fast_slash) return '';
  return regexp.source
    .replace('\\/?(?=\\/|$)', '')
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\\\//g, '/');
}

function collectRoutes(stack: RouterLayer[], prefix: string, out: RegisteredRoute[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      const methods = Object.entries(layer.route.methods)
        .filter(([, enabled]) => enabled)
        .map(([m]) => m.toUpperCase());
      const middleware = layer.route.stack.map(
        (l) => l.handle?.name || l.name || '<anonymous>',
      );
      for (const p of paths) {
        const full = `${prefix}${p === '/' ? '' : p}` || '/';
        for (const m of methods) {
          out.push({ method: m, path: full, middleware });
        }
      }
    } else if (layer.name === 'router' && layer.handle?.stack && layer.regexp) {
      collectRoutes(layer.handle.stack, prefix + decodeMountPath(layer.regexp), out);
    }
  }
}

function getRegisteredRoutes(): RegisteredRoute[] {
  const routerStack = (app as unknown as { _router: { stack: RouterLayer[] } })._router.stack;
  const out: RegisteredRoute[] = [];
  collectRoutes(routerStack, '', out);
  return out;
}

// Gate variants must follow the `requireFreshReAuth*` naming convention — the
// reverse-direction check matches by prefix (review L2), so a future variant
// is counted automatically instead of silently escaping the inventory check.
const isFreshReAuthGate = (name: string) => name.startsWith('requireFreshReAuth');

describe('13-18 AC3 — SENSITIVE_ACTIONS ↔ registered-route anti-drift', () => {
  const registered = getRegisteredRoutes();

  it('sanity: router introspection sees the app routes', () => {
    // If Express internals ever change shape, fail loudly here rather than
    // vacuously passing the assertions below on an empty route table.
    expect(registered.length).toBeGreaterThan(50);
    expect(
      registered.some((r) => r.method === 'PATCH' && r.path === '/api/v1/users/profile'),
    ).toBe(true);
  });

  it('every SENSITIVE_ACTIONS entry matches a registered route + method', () => {
    const misses = SENSITIVE_ACTIONS.filter(
      (a) => !registered.some((r) => r.method === a.method && r.path === a.path),
    );
    expect(misses, `phantom inventory entries (no such registered route): ${JSON.stringify(misses)}`).toEqual([]);
  });

  it('every SENSITIVE_ACTIONS entry has its declared fresh-reauth gate mounted on the route', () => {
    const ungated = SENSITIVE_ACTIONS.filter((a) => {
      const route = registered.find((r) => r.method === a.method && r.path === a.path);
      return !route || !route.middleware.includes(a.gate);
    });
    expect(ungated, `inventoried routes missing their gate: ${JSON.stringify(ungated)}`).toEqual([]);
  });

  it('every registered route carrying a fresh-reauth gate is in SENSITIVE_ACTIONS (no undocumented gates)', () => {
    const gatedRoutes = registered.filter((r) => r.middleware.some(isFreshReAuthGate));
    const undocumented = gatedRoutes.filter(
      (r) => !SENSITIVE_ACTIONS.some((a) => a.method === r.method && a.path === r.path),
    );
    expect(
      undocumented.map((r) => `${r.method} ${r.path}`),
      'gated routes missing from the SENSITIVE_ACTIONS inventory',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC2 + AC4 — end-to-end gating against the real app
// ---------------------------------------------------------------------------

describe('13-18 AC2/AC4 — step-up re-auth gating E2E', () => {
  const redis = getRedisClient();

  let adminId: string;
  let adminToken: string;
  const adminEmail = `reauth-admin-${Date.now()}@example.com`;
  const adminPassword = 'ReAuthTest123!';

  let logoutUserId: string;
  const logoutEmail = `reauth-logout-${Date.now()}@example.com`;

  // Review L3 — the AC4 grace test logs in its OWN user so no test in this
  // block depends on another test's marker mutations (order-independence).
  let graceUserId: string;
  const graceEmail = `reauth-grace-${Date.now()}@example.com`;

  let pwlessId: string;
  let pwlessToken: string;
  const pwlessEmail = `reauth-pwless-${Date.now()}@example.com`;

  const reAuthKey = (id: string) => `reauth:${id}`;

  beforeAll(async () => {
    await db.insert(roles).values([
      { name: 'super_admin', description: 'Super Administrator' },
      { name: 'public_user', description: 'Public User' },
    ]).onConflictDoNothing();

    const adminRole = await db.query.roles.findFirst({ where: eq(roles.name, 'super_admin') });
    const publicRole = await db.query.roles.findFirst({ where: eq(roles.name, 'public_user') });
    const hashedPw = await hashPassword(adminPassword);

    const [admin] = await db.insert(users).values({
      email: adminEmail,
      fullName: 'ReAuth Admin',
      roleId: adminRole!.id,
      status: 'active',
      passwordHash: hashedPw,
    }).returning();
    adminId = admin.id;

    const [logoutUser] = await db.insert(users).values({
      email: logoutEmail,
      fullName: 'ReAuth Logout User',
      roleId: adminRole!.id,
      status: 'active',
      passwordHash: hashedPw,
    }).returning();
    logoutUserId = logoutUser.id;

    const [graceUser] = await db.insert(users).values({
      email: graceEmail,
      fullName: 'ReAuth Grace User',
      roleId: adminRole!.id,
      status: 'active',
      passwordHash: hashedPw,
    }).returning();
    graceUserId = graceUser.id;

    const [pwless] = await db.insert(users).values({
      email: pwlessEmail,
      fullName: 'ReAuth Passwordless',
      roleId: publicRole!.id,
      status: 'active',
      passwordHash: null, // magic-link only (9-16/9-38 wizard-provisioned shape)
    }).returning();
    pwlessId = pwless.id;

    const loginRes = await request
      .post('/api/v1/auth/staff/login')
      .send({ email: adminEmail, password: adminPassword, captchaToken: 'test-captcha-bypass' });
    adminToken = loginRes.body.data.accessToken;
    expect(adminToken).toBeTruthy();
  }, 30000);

  afterAll(async () => {
    const userIds = [adminId, logoutUserId, graceUserId, pwlessId];
    // magic_link_tokens references users via `user_id ... ON DELETE cascade`,
    // and pre-redemption rows are email-keyed (user_id null) — so its delete
    // order relative to the users delete is irrelevant either way. Clean the
    // email-keyed rows up separately; cascade takes care of any user_id-linked ones.
    await db.delete(magicLinkTokens).where(eq(magicLinkTokens.email, pwlessEmail));
    // Story 13-30: the E2E body above performs real login / re-auth / logout as
    // these users, each firing a fire-and-forget `audit_logs.actor_id` write.
    // purgeUsersWithAuditDrain closes the delete-order FK race deterministically.
    await purgeUsersWithAuditDrain(userIds);
    for (const id of userIds.filter(Boolean)) {
      await redis.del(reAuthKey(id));
    }
  });

  it('AC4: interactive password login grants the 5-minute re-auth grace', async () => {
    // Own login + own user (review L3) — independent of other tests' markers.
    const loginRes = await request
      .post('/api/v1/auth/staff/login')
      .send({ email: graceEmail, password: adminPassword, captchaToken: 'test-captcha-bypass' });
    const graceToken = loginRes.body.data.accessToken;
    expect(graceToken).toBeTruthy();

    const marker = await redis.get(reAuthKey(graceUserId));
    expect(marker).toBeTruthy();

    // Grace makes the gated profile route pass with no explicit re-auth.
    const res = await request
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${graceToken}`)
      .send({ fullName: 'ReAuth Grace User Updated' });
    expect(res.status).toBe(200);
  });

  it('AC2: without a fresh re-auth marker, EVERY inventoried route returns 403 AUTH_REAUTH_REQUIRED', async () => {
    await redis.del(reAuthKey(adminId)); // simulate the grace window expiring

    for (const action of SENSITIVE_ACTIONS) {
      const concretePath = action.path
        .replace(':userId', randomUUID())
        .replace(':key', 'reauth.drift.test');

      const res = await request[action.method.toLowerCase() as 'post' | 'patch'](concretePath)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status, `${action.method} ${concretePath} → ${res.status} ${JSON.stringify(res.body)}`).toBe(403);
      expect(res.body.code, `${action.method} ${concretePath}`).toBe('AUTH_REAUTH_REQUIRED');
    }
  });

  it('AC2: POST /auth/reauth restores access to the gated route', async () => {
    await redis.del(reAuthKey(adminId)); // review L3 — own precondition, not the previous test's side effect

    const reauthRes = await request
      .post('/api/v1/auth/reauth')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: adminPassword });
    expect(reauthRes.status).toBe(200);
    expect(reauthRes.body.data.verified).toBe(true);

    const res = await request
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: 'ReAuth Admin Restored' });
    expect(res.status).toBe(200);
  });

  it('AC1/exemption: a passwordless magic-link account can edit its profile without (impossible) re-auth', async () => {
    const issued = await MagicLinkService.issueToken({ email: pwlessEmail, purpose: 'login' });
    const loginRes = await request
      .post('/api/v1/auth/magic/login')
      .send({ token: issued.tokenPlaintext, purpose: 'login' });
    expect(loginRes.status).toBe(200);
    pwlessToken = loginRes.body.data.accessToken;
    expect(pwlessToken).toBeTruthy();

    // AC4 ruling: magic-link login is NOT a password proof — no grace granted.
    const marker = await redis.get(reAuthKey(pwlessId));
    expect(marker).toBeNull();

    // ...and yet the profile route passes: passwordless accounts are exempt
    // (they cannot answer a password re-auth modal).
    const res = await request
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${pwlessToken}`)
      .send({ fullName: 'ReAuth Passwordless Updated' });
    expect(res.status).toBe(200);
  });

  it('AC4: logout clears the re-auth grace', async () => {
    const loginRes = await request
      .post('/api/v1/auth/staff/login')
      .send({ email: logoutEmail, password: adminPassword, captchaToken: 'test-captcha-bypass' });
    const token = loginRes.body.data.accessToken;
    expect(await redis.get(reAuthKey(logoutUserId))).toBeTruthy();

    const logoutRes = await request
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    expect(await redis.get(reAuthKey(logoutUserId))).toBeNull();
  });
});

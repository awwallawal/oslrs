import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../index.js';
import { roles, users, fraudThresholds, userBackupCodes } from '../../schema/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@oslsr/utils';
import { seedFraudThresholds, seedDevelopmentUsers, assertDevSeedDatabase } from '../index.js';
import { FRAUD_THRESHOLD_DEFAULTS } from '../fraud-thresholds.seed.js';

describe('seedFraudThresholds (integration)', () => {
  let roleMap: Map<string, string>;
  let testUserId: string;

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
      throw new Error('Refusing to run destructive seed integration tests outside test environment');
    }

    // Ensure super_admin role exists
    await db.insert(roles).values({
      name: 'super_admin',
      description: 'Super Administrator',
    }).onConflictDoNothing();

    const role = await db.query.roles.findFirst({
      where: eq(roles.name, 'super_admin'),
    });

    roleMap = new Map<string, string>();
    roleMap.set('super_admin', role!.id);

    // Create a test super_admin user for createdBy
    const passwordHash = await hashPassword('test-seed-password');
    const [testUser] = await db.insert(users).values({
      email: `seed-test-${Date.now()}@test.local`,
      passwordHash,
      fullName: 'Seed Test Admin',
      roleId: role!.id,
      status: 'active',
      isSeeded: true,
    }).returning();

    testUserId = testUser.id;

    // Clean ALL fraud thresholds — seed tests need a clean slate because the
    // idempotent guard in seedFraudThresholds checks for ANY active thresholds
    // globally, not just test-owned ones.
    await db.delete(fraudThresholds);
  });

  afterAll(async () => {
    // Clean up all fraud thresholds created during tests
    await db.delete(fraudThresholds);

    // Clean up test user
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it('should insert 27 records into an empty table', async () => {
    // Ensure clean state — clear ALL thresholds so idempotent guard doesn't skip
    await db.delete(fraudThresholds);

    await seedFraudThresholds(roleMap);

    // Query all active thresholds (seed picks whichever super_admin findFirst returns)
    const allThresholds = await db.select().from(fraudThresholds).where(
      eq(fraudThresholds.isActive, true)
    );
    expect(allThresholds).toHaveLength(FRAUD_THRESHOLD_DEFAULTS.length);
    expect(allThresholds).toHaveLength(27);

    // Verify all records have correct version and active status
    for (const threshold of allThresholds) {
      expect(threshold.version).toBe(1);
      expect(threshold.isActive).toBe(true);
      expect(threshold.effectiveUntil).toBeNull();
      expect(threshold.createdBy).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }

    // Verify per-category distribution (AC3: GPS:6, Speed:4, Straightline:5, Duplicate:4, Timing:4, Composite:4)
    const byCat = allThresholds.reduce<Record<string, number>>((acc, t) => {
      acc[t.ruleCategory] = (acc[t.ruleCategory] || 0) + 1;
      return acc;
    }, {});
    expect(byCat).toEqual({
      gps: 6,
      speed: 4,
      straightline: 5,
      duplicate: 4,
      timing: 4,
      composite: 4,
    });
  });

  it('should be idempotent — no duplicates on re-run', async () => {
    // Ensure thresholds exist from a prior seed
    const before = await db.select().from(fraudThresholds).where(
      eq(fraudThresholds.isActive, true)
    );
    if (before.length === 0) {
      await seedFraudThresholds(roleMap);
    }

    // Run again — should skip because active thresholds already exist
    await seedFraudThresholds(roleMap);

    const allThresholds = await db.select().from(fraudThresholds).where(
      eq(fraudThresholds.isActive, true)
    );
    expect(allThresholds).toHaveLength(27);
  });

  it('should preserve existing thresholds (not overwrite)', async () => {
    // Ensure thresholds exist from a prior seed
    const before = await db.select().from(fraudThresholds).where(
      eq(fraudThresholds.isActive, true)
    );
    if (before.length === 0) {
      await seedFraudThresholds(roleMap);
    }

    const originalIds = (await db.select({ id: fraudThresholds.id }).from(fraudThresholds).where(
      eq(fraudThresholds.isActive, true)
    )).map(t => t.id).sort();

    // Re-run seed
    await seedFraudThresholds(roleMap);

    const currentIds = (await db.select({ id: fraudThresholds.id }).from(fraudThresholds).where(
      eq(fraudThresholds.isActive, true)
    )).map(t => t.id).sort();

    expect(currentIds).toEqual(originalIds);
  });
});

/**
 * Story 13-36 — the dev seed must RE-CONVERGE drifted accounts, not skip them.
 *
 * Regression context: `seedDevelopmentUsers` was create-only, so a locally
 * MFA-enrolled `admin@dev.local` (drifted 2026-05-09) could never be healed by
 * `db:seed:dev`. Every admin-dependent Playwright test failed locally — login
 * stopping at `/auth/mfa-challenge`, or, once `mfa_enabled` was hand-flipped off,
 * a stale expired `mfa_grace_until` 403-ing every privileged route with
 * FORCE_MFA_ENROLLMENT — while CI stayed green on its fresh `test_db`. An E2E
 * signal you cannot reproduce locally is exactly the signal nobody trusts.
 *
 * roleMap deliberately carries ONLY `super_admin`, so just the dev super-admin
 * row is exercised and the other 8 dev users are skipped (role-not-found).
 * EXPECTED SIDE EFFECT: each `seedDevelopmentUsers()` call therefore logs 8
 * `ERROR: Role not found, skipping user` lines. That level is correct for real
 * usage — `main()` always seeds roles first, so a missing role IS a broken seed —
 * and the noise is an artefact of this narrow fixture, not a failure. Noted so
 * nobody chases it (review AI-13).
 *
 * ORDER-INDEPENDENCE (review AI-9): every test establishes its own precondition
 * via `givenSeededDevAdmin()` rather than inheriting the row a previous test
 * happened to leave behind. The originals chained (`before!.id` came from the
 * preceding test), so one failure cascaded into misleading downstream errors.
 */
describe('seedDevelopmentUsers convergence (integration)', () => {
  const DEV_ADMIN = 'admin@dev.local';
  let roleMap: Map<string, string>;
  /** Only tear the role down if THIS file introduced it — other suites share the DB. */
  let createdSuperAdminRole = false;

  async function getDevAdmin() {
    return db.query.users.findFirst({ where: eq(users.email, DEV_ADMIN) });
  }

  /** Precondition helper: a freshly-seeded dev admin, whatever ran before. */
  async function givenSeededDevAdmin() {
    await db.delete(users).where(eq(users.email, DEV_ADMIN));
    await seedDevelopmentUsers(roleMap, new Map());
    const admin = await getDevAdmin();
    expect(admin, 'precondition: dev admin should exist after seeding').toBeDefined();
    return admin!;
  }

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
      throw new Error('Refusing to run destructive seed integration tests outside test environment');
    }

    const existingRole = await db.query.roles.findFirst({ where: eq(roles.name, 'super_admin') });
    if (!existingRole) {
      await db.insert(roles).values({
        name: 'super_admin',
        description: 'Super Administrator',
      }).onConflictDoNothing();
      createdSuperAdminRole = true;
    }

    const role = await db.query.roles.findFirst({ where: eq(roles.name, 'super_admin') });
    roleMap = new Map<string, string>([['super_admin', role!.id]]);

    await db.delete(users).where(eq(users.email, DEV_ADMIN));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, DEV_ADMIN));
    if (createdSuperAdminRole) {
      await db.delete(roles).where(eq(roles.name, 'super_admin'));
    }
  });

  it('creates the dev super-admin in the CI-equivalent state when absent', async () => {
    await db.delete(users).where(eq(users.email, DEV_ADMIN));

    await seedDevelopmentUsers(roleMap, new Map());

    const admin = await getDevAdmin();
    expect(admin).toBeDefined();
    expect(admin!.isSeeded).toBe(true);
    expect(admin!.status).toBe('active');
    expect(admin!.mfaEnabled).toBe(false);
    // `mfa_grace_until IS NULL` is what makes the mfa-grace gate pass a
    // super_admin through (mfa-grace.ts:69) — the state CI seeds.
    expect(admin!.mfaGraceUntil).toBeNull();
  });

  it('re-converges an account that drifted exactly like the 2026-05-09 local admin', async () => {
    const before = await givenSeededDevAdmin();
    await db.update(users).set({
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
      mfaGraceUntil: new Date('2026-05-09T20:42:20Z'), // long expired
      mfaLockedUntil: new Date('2026-05-09T21:00:00Z'),
      status: 'suspended',
      failedLoginAttempts: 5,
      lockedUntil: new Date('2026-05-09T21:00:00Z'),
    }).where(eq(users.id, before.id));
    await db.insert(userBackupCodes).values({ userId: before.id, codeHash: 'stale-hash' });

    await seedDevelopmentUsers(roleMap, new Map());

    const after = await getDevAdmin();
    expect(after!.id).toBe(before.id); // converged in place, not recreated
    expect(after!.mfaEnabled).toBe(false);
    expect(after!.mfaSecret).toBeNull();
    expect(after!.mfaGraceUntil).toBeNull();
    expect(after!.mfaLockedUntil).toBeNull();
    expect(after!.status).toBe('active');
    expect(after!.failedLoginAttempts).toBe(0);
    expect(after!.lockedUntil).toBeNull();
    expect(after!.isSeeded).toBe(true);

    // Stale backup codes must not survive an MFA reset.
    const codes = await db.select().from(userBackupCodes).where(eq(userBackupCodes.userId, after!.id));
    expect(codes).toHaveLength(0);
  });

  it('never touches a NON-seeded account that owns a dev email', async () => {
    const target = await givenSeededDevAdmin();
    await db.update(users).set({
      isSeeded: false,
      mfaEnabled: true,
      mfaSecret: 'REALUSERSECRET',
      status: 'suspended',
    }).where(eq(users.id, target.id));

    await seedDevelopmentUsers(roleMap, new Map());

    const after = await getDevAdmin();
    expect(after!.isSeeded).toBe(false);
    expect(after!.mfaEnabled).toBe(true);       // MFA NOT stripped off a real account
    expect(after!.mfaSecret).toBe('REALUSERSECRET');
    expect(after!.status).toBe('suspended');
  });

  it('refuses to run under NODE_ENV=production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(seedDevelopmentUsers(roleMap, new Map())).rejects.toThrow(/production/i);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});

/**
 * Story 13-36 review (AI-8) — the convergence path is DESTRUCTIVE (known-password
 * reset, MFA stripped, backup codes deleted), so `NODE_ENV !== 'production'` is not
 * a sufficient gate on its own: `db:seed:dev` sets no NODE_ENV and inherits whatever
 * the root `.env` carries (playbook Pitfall #42), and Pitfall #29 is explicit that a
 * non-prod DB is not the same as a disposable one.
 *
 * Pure unit tests — no DB access, so they state the contract without touching rows.
 */
describe('assertDevSeedDatabase (dev-seed database gate)', () => {
  const allows = [
    'postgres://u:p@localhost:5432/test_db',      // CI
    'postgres://u:p@localhost:5432/app_test',     // local test DB
    'postgres://u:p@localhost:5432/oslsr_test',
    'postgres://u:p@localhost:5432/app_db',       // documented local dev DB
    'postgres://u:p@localhost:5432/app_dev',
  ];

  it.each(allows)('allows the disposable database %s', (url) => {
    expect(() => assertDevSeedDatabase(url, false)).not.toThrow();
  });

  it('refuses the production database name', () => {
    expect(() => assertDevSeedDatabase('postgres://u:p@localhost:5432/oslsr_db', false))
      .toThrow(/Refusing to run the DEVELOPMENT seed/i);
  });

  it('refuses a name that merely CONTAINS the letters t-e-s-t', () => {
    // Boundary matching — `latest` is not a test database.
    expect(() => assertDevSeedDatabase('postgres://u:p@localhost:5432/latest', false)).toThrow();
  });

  it('yields to an explicit ALLOW_DEV_SEED_DB override', () => {
    expect(() => assertDevSeedDatabase('postgres://u:p@localhost:5432/oslsr_db', true)).not.toThrow();
  });

  it('no-ops when DATABASE_URL is unset or unparseable (db/index.ts owns that case)', () => {
    expect(() => assertDevSeedDatabase(undefined, false)).not.toThrow();
    expect(() => assertDevSeedDatabase('not-a-url', false)).not.toThrow();
  });
});

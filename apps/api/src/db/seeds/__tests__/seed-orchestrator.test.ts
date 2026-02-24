import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../index.js';
import { roles, users, fraudThresholds } from '../../schema/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@oslsr/utils';
import { seedFraudThresholds } from '../index.js';
import { FRAUD_THRESHOLD_DEFAULTS } from '../fraud-thresholds.seed.js';

describe('seedFraudThresholds (integration)', () => {
  let roleMap: Map<string, string>;
  let testUserId: string;

  beforeAll(async () => {
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

    // Clean only test-owned fraud thresholds (safe for shared dev DBs)
    await db.delete(fraudThresholds).where(
      eq(fraudThresholds.createdBy, testUserId)
    );
  });

  afterAll(async () => {
    // Clean up all thresholds created by our test user
    if (testUserId) {
      await db.delete(fraudThresholds).where(
        eq(fraudThresholds.createdBy, testUserId)
      );

      // Clean up test user
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it('should insert 27 records into an empty table', async () => {
    // Ensure clean state for this test (scoped to test user)
    await db.delete(fraudThresholds).where(
      eq(fraudThresholds.createdBy, testUserId)
    );

    await seedFraudThresholds(roleMap);

    const allThresholds = await db.select().from(fraudThresholds).where(
      eq(fraudThresholds.createdBy, testUserId)
    );
    expect(allThresholds).toHaveLength(FRAUD_THRESHOLD_DEFAULTS.length);
    expect(allThresholds).toHaveLength(27);

    // Verify all records have correct version and active status
    for (const threshold of allThresholds) {
      expect(threshold.version).toBe(1);
      expect(threshold.isActive).toBe(true);
      expect(threshold.effectiveUntil).toBeNull();
      expect(threshold.createdBy).toBe(testUserId);
    }
  });

  it('should be idempotent — no duplicates on re-run', async () => {
    // Ensure thresholds exist from a prior seed
    const before = await db.select().from(fraudThresholds).where(
      eq(fraudThresholds.createdBy, testUserId)
    );
    if (before.length === 0) {
      await seedFraudThresholds(roleMap);
    }

    // Run again — should skip because active thresholds already exist
    await seedFraudThresholds(roleMap);

    const allThresholds = await db.select().from(fraudThresholds).where(
      eq(fraudThresholds.createdBy, testUserId)
    );
    expect(allThresholds).toHaveLength(27);
  });

  it('should preserve existing thresholds (not overwrite)', async () => {
    // Ensure thresholds exist from a prior seed
    const before = await db.select().from(fraudThresholds).where(
      eq(fraudThresholds.createdBy, testUserId)
    );
    if (before.length === 0) {
      await seedFraudThresholds(roleMap);
    }

    const originalIds = (await db.select({ id: fraudThresholds.id }).from(fraudThresholds).where(
      eq(fraudThresholds.createdBy, testUserId)
    )).map(t => t.id).sort();

    // Re-run seed
    await seedFraudThresholds(roleMap);

    const currentIds = (await db.select({ id: fraudThresholds.id }).from(fraudThresholds).where(
      eq(fraudThresholds.createdBy, testUserId)
    )).map(t => t.id).sort();

    expect(currentIds).toEqual(originalIds);
  });
});

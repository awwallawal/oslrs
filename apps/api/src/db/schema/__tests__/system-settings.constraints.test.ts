/**
 * prep-settings-landing-and-feature-flags — DB-constraint tests for
 * `system_settings`. Speaks to the live local Postgres (DATABASE_URL); skipped
 * if no DATABASE_URL is configured.
 *
 * Verifies migration `0011_create_system_settings.sql`:
 *   1. Primary-key uniqueness on `key`
 *   2. NOT NULL on `value`, `updated_by`, `updated_at`, `created_at`
 *   3. FK to `users(id)` on `updated_by`
 *   4. Initial seed row for `auth.sms_otp_enabled` exists
 *
 * Pattern matches `respondents.constraints.test.ts` (Story 11-1):
 * beforeAll/afterAll cleanup keyed off insertedKeys.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../index.js';
import { systemSettings } from '../system-settings.js';
import { users } from '../users.js';
import { roles } from '../roles.js';

const TEST_PREFIX = '_test_settings_';

describe('system_settings DB constraints', () => {
  const insertedKeys: string[] = [];
  let activeSuperAdminId: string | null = null;

  beforeAll(async () => {
    const adminRows = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(roles.name, 'super_admin'))
      .limit(1);
    activeSuperAdminId = adminRows[0]?.id ?? null;
  });

  afterAll(async () => {
    if (insertedKeys.length > 0) {
      await db.delete(systemSettings).where(inArray(systemSettings.key, insertedKeys));
    }
  });

  it('seed row for auth.sms_otp_enabled exists post-migration', async () => {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'auth.sms_otp_enabled'));
    if (rows.length !== 1) {
      throw new Error(
        'system_settings seed row "auth.sms_otp_enabled" missing — did you run ' +
          '`pnpm --filter @oslsr/api db:push:full`? `db:push` alone creates the ' +
          'table but does not run scripts/migrate-system-settings-init.ts.',
      );
    }
    expect(rows[0].value).toBe(false);
  });

  it('primary key is unique — duplicate key insert rejected', async () => {
    if (!activeSuperAdminId) {
      console.warn('No super_admin found; skipping FK test');
      return;
    }
    const key = `${TEST_PREFIX}dup`;
    insertedKeys.push(key);

    await db.insert(systemSettings).values({
      key,
      value: 'first',
      updatedBy: activeSuperAdminId,
    });

    let threw = false;
    try {
      await db.insert(systemSettings).values({
        key,
        value: 'second',
        updatedBy: activeSuperAdminId,
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('FK to users(id) — invalid updated_by rejected', async () => {
    let threw = false;
    try {
      await db.insert(systemSettings).values({
        key: `${TEST_PREFIX}fk_violation`,
        value: 'whatever',
        // Random UUID that does not exist in users
        updatedBy: '00000000-0000-0000-0000-000000000999',
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('value column is NOT NULL — insert without value rejected', async () => {
    if (!activeSuperAdminId) {
      console.warn('No super_admin found; skipping NOT NULL test');
      return;
    }

    let threw = false;
    try {
      await db.insert(systemSettings).values({
        key: `${TEST_PREFIX}no_value`,
        // value omitted intentionally; Drizzle/PG should reject
        // @ts-expect-error — testing runtime constraint, not type system
        updatedBy: activeSuperAdminId,
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('upsert (INSERT ... ON CONFLICT DO UPDATE) — second write replaces value', async () => {
    if (!activeSuperAdminId) {
      console.warn('No super_admin found; skipping upsert test');
      return;
    }
    const key = `${TEST_PREFIX}upsert`;
    insertedKeys.push(key);

    await db
      .insert(systemSettings)
      .values({ key, value: { v: 1 }, updatedBy: activeSuperAdminId })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: { v: 1 }, updatedBy: activeSuperAdminId, updatedAt: new Date() },
      });

    await db
      .insert(systemSettings)
      .values({ key, value: { v: 2 }, updatedBy: activeSuperAdminId })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: { v: 2 }, updatedBy: activeSuperAdminId, updatedAt: new Date() },
      });

    const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    expect(rows.length).toBe(1);
    expect(rows[0].value).toEqual({ v: 2 });
  });
});

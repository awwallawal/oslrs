/**
 * Story 9-38 (AC#1/#2/#5) — integration tests for
 * `AuthService.provisionPublicUserForWizard`.
 *
 * Real-DB (matches the auth.login integration style): exercises the actual
 * onConflictDoNothing + re-read idempotency path against Postgres.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AuthService } from '../auth.service.js';
import { db } from '../../db/index.js';
import { users, roles, auditLogs } from '../../db/schema/index.js';
import { eq, inArray, or, sql } from 'drizzle-orm';
import { hashPassword } from '@oslsr/utils';

describe('AuthService.provisionPublicUserForWizard (Story 9-38)', () => {
  const createdEmails: string[] = [];
  const stamp = Date.now();

  beforeAll(async () => {
    await db
      .insert(roles)
      .values([
        { name: 'public_user', description: 'Public User' },
        { name: 'enumerator', description: 'Field Enumerator' },
      ])
      .onConflictDoNothing();
  }, 30000);

  afterAll(async () => {
    if (createdEmails.length === 0) return;
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.email, createdEmails));
    const userIds = rows.map((r) => r.id);
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`DO $$ BEGIN ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`,
      );
      if (userIds.length > 0) {
        await tx
          .delete(auditLogs)
          .where(or(inArray(auditLogs.targetId, userIds), inArray(auditLogs.actorId, userIds)));
      }
      await tx.delete(users).where(inArray(users.email, createdEmails));
      await tx.execute(
        sql`DO $$ BEGIN ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`,
      );
    });
  }, 30000);

  it('creates a passwordless public_user (status active, authProvider email) and returns created=true', async () => {
    const email = `prov-new-${stamp}@example.com`;
    createdEmails.push(email);

    const result = await AuthService.provisionPublicUserForWizard({
      email,
      fullName: 'Ada Provision',
    });

    expect(result.created).toBe(true);
    expect(result.userId).toBeTruthy();

    const row = await db.query.users.findFirst({
      where: eq(users.email, email),
      with: { role: true },
    });
    expect(row).toBeTruthy();
    expect(row!.passwordHash).toBeNull();
    expect(row!.status).toBe('active');
    expect(row!.authProvider).toBe('email');
    expect(row!.fullName).toBe('Ada Provision');
    expect(row!.role.name).toBe('public_user');
  }, 30000);

  it('normalises the email (lowercased/trimmed) on create', async () => {
    const email = `prov-Case-${stamp}@Example.com`;
    createdEmails.push(email.toLowerCase().trim());

    const result = await AuthService.provisionPublicUserForWizard({
      email: `  ${email}  `,
      fullName: 'Case Test',
    });
    expect(result.created).toBe(true);

    const row = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase().trim()),
    });
    expect(row).toBeTruthy();
  }, 30000);

  it('is idempotent + no-clobber on an existing email (links, returns created=false)', async () => {
    const email = `prov-existing-${stamp}@example.com`;
    createdEmails.push(email);

    // Pre-seed an account with a PASSWORD, a custom name, and a NON-public role.
    const enumRole = await db.query.roles.findFirst({ where: eq(roles.name, 'enumerator') });
    const pwHash = await hashPassword('ExistingPass123!');
    const [existing] = await db
      .insert(users)
      .values({
        email,
        passwordHash: pwHash,
        fullName: 'Pre Existing',
        roleId: enumRole!.id,
        status: 'active',
      })
      .returning({ id: users.id });

    const result = await AuthService.provisionPublicUserForWizard({
      email,
      fullName: 'Should Not Overwrite',
    });

    // Links to the existing row; reports created=false.
    expect(result.created).toBe(false);
    expect(result.userId).toBe(existing.id);

    // No-clobber: password, name, status, and role are all untouched.
    const row = await db.query.users.findFirst({
      where: eq(users.email, email),
      with: { role: true },
    });
    expect(row!.passwordHash).toBe(pwHash);
    expect(row!.fullName).toBe('Pre Existing');
    expect(row!.role.name).toBe('enumerator');
  }, 30000);
});

/**
 * Database Seeding Entry Point
 * ADR-017: Database Seeding Strategy (Hybrid Approach)
 *
 * Commands:
 *   pnpm db:seed:dev        - Development seed with test users
 *   pnpm db:seed --admin-from-env  - Production seed (Super Admin from env)
 *   pnpm db:seed:clean      - Remove only seeded data
 *   pnpm db:reset           - Full reset (handled by drizzle)
 */

import { fileURLToPath } from 'node:url';
import { db, pool } from '../index.js';
import { roles, lgas, users, teamAssignments, productivityTargets, fraudThresholds } from '../schema/index.js';
import { eq, and, isNull } from 'drizzle-orm';
import { hashPassword } from '@oslsr/utils';
import { OYO_STATE_LGAS } from './lgas.seed.js';
import { USER_ROLES } from './roles.seed.js';
import { FRAUD_THRESHOLD_DEFAULTS } from './fraud-thresholds.seed.js';
import pino from 'pino';

const logger = pino({
  name: 'db-seed',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

/**
 * Seed all roles (required for both dev and prod)
 */
async function seedRoles(markAsSeeded = true): Promise<Map<string, string>> {
  logger.info('Seeding roles...');
  const roleMap = new Map<string, string>();

  for (const role of USER_ROLES) {
    // Check if role already exists
    const existing = await db.query.roles.findFirst({
      where: eq(roles.name, role.name),
    });

    if (existing) {
      logger.info({ role: role.name }, 'Role already exists, skipping');
      roleMap.set(role.name, existing.id);
      continue;
    }

    const [inserted] = await db
      .insert(roles)
      .values({
        name: role.name,
        description: role.description,
        isSeeded: markAsSeeded,
      })
      .returning();

    roleMap.set(role.name, inserted.id);
    logger.info({ role: role.name, id: inserted.id }, 'Role created');
  }

  logger.info({ count: USER_ROLES.length }, 'Roles seeding complete');
  return roleMap;
}

/**
 * Seed all 33 Oyo State LGAs (required for both dev and prod)
 */
async function seedLGAs(markAsSeeded = true): Promise<Map<string, string>> {
  logger.info('Seeding LGAs...');
  const lgaMap = new Map<string, string>();

  for (const lga of OYO_STATE_LGAS) {
    // Check if LGA already exists
    const existing = await db.query.lgas.findFirst({
      where: eq(lgas.code, lga.code),
    });

    if (existing) {
      logger.info({ lga: lga.name }, 'LGA already exists, skipping');
      lgaMap.set(lga.code, existing.id);
      continue;
    }

    const [inserted] = await db
      .insert(lgas)
      .values({
        name: lga.name,
        code: lga.code,
        isSeeded: markAsSeeded,
      })
      .returning();

    lgaMap.set(lga.code, inserted.id);
    logger.info({ lga: lga.name, code: lga.code, id: inserted.id }, 'LGA created');
  }

  logger.info({ count: OYO_STATE_LGAS.length }, 'LGAs seeding complete');
  return lgaMap;
}

/**
 * Development seed - creates test users with known passwords
 * DO NOT USE IN PRODUCTION
 */
async function seedDevelopmentUsers(
  roleMap: Map<string, string>,
  lgaMap: Map<string, string>
): Promise<void> {
  logger.info('Seeding development users...');

  const devUsers = [
    {
      email: 'admin@dev.local',
      password: 'admin123',
      fullName: 'Dev Admin',
      role: 'super_admin',
      lga: null,
    },
    {
      email: 'supervisor@dev.local',
      password: 'super123',
      fullName: 'Dev Supervisor',
      role: 'supervisor',
      lga: 'ibadan_north',
    },
    {
      email: 'enumerator@dev.local',
      password: 'enum123',
      fullName: 'Dev Enumerator',
      role: 'enumerator',
      lga: 'ibadan_north',
    },
    {
      email: 'enumerator2@dev.local',
      password: 'enum123',
      fullName: 'Dev Enumerator 2',
      role: 'enumerator',
      lga: 'ibadan_north',
    },
    {
      email: 'enumerator3@dev.local',
      password: 'enum123',
      fullName: 'Dev Enumerator 3',
      role: 'enumerator',
      lga: 'ibadan_north',
    },
    {
      email: 'clerk@dev.local',
      password: 'clerk123',
      fullName: 'Dev Data Entry Clerk',
      role: 'data_entry_clerk',
      lga: null,
    },
    {
      email: 'assessor@dev.local',
      password: 'assess123',
      fullName: 'Dev Verification Assessor',
      role: 'verification_assessor',
      lga: null,
    },
    {
      email: 'official@dev.local',
      password: 'official123',
      fullName: 'Dev Government Official',
      role: 'government_official',
      lga: null,
    },
    {
      email: 'public@dev.local',
      password: 'public123',
      fullName: 'Dev Public User',
      role: 'public_user',
      lga: null,
    },
  ];

  for (const user of devUsers) {
    // Check if user already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, user.email),
    });

    if (existing) {
      logger.info({ email: user.email }, 'User already exists, skipping');
      continue;
    }

    const roleId = roleMap.get(user.role);
    if (!roleId) {
      logger.error({ role: user.role }, 'Role not found, skipping user');
      continue;
    }

    const lgaId = user.lga ? lgaMap.get(user.lga) : null;

    const passwordHash = await hashPassword(user.password);

    await db.insert(users).values({
      email: user.email,
      passwordHash,
      fullName: user.fullName,
      roleId,
      lgaId,
      status: 'active',
      isSeeded: true,
    });

    logger.info(
      { email: user.email, role: user.role, password: user.password },
      'Dev user created'
    );
  }

  logger.info({ count: devUsers.length }, 'Development users seeding complete');
}

/**
 * Seed team assignments — links supervisor to enumerators in ibadan_north
 * Architecture: 1 Supervisor + 3 Enumerators per LGA
 */
async function seedTeamAssignments(): Promise<void> {
  logger.info('Seeding team assignments...');

  // Look up supervisor
  const supervisor = await db.query.users.findFirst({
    where: eq(users.email, 'supervisor@dev.local'),
  });

  if (!supervisor) {
    logger.warn('Supervisor dev user not found, skipping team assignments');
    return;
  }

  if (!supervisor.lgaId) {
    logger.warn({ email: supervisor.email }, 'Supervisor has no LGA, skipping team assignments');
    return;
  }

  const enumeratorEmails = [
    'enumerator@dev.local',
    'enumerator2@dev.local',
    'enumerator3@dev.local',
  ];

  for (const email of enumeratorEmails) {
    const enumerator = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!enumerator) {
      logger.warn({ email }, 'Enumerator not found, skipping');
      continue;
    }

    // Check if active assignment already exists
    const existing = await db.query.teamAssignments.findFirst({
      where: and(
        eq(teamAssignments.supervisorId, supervisor.id),
        eq(teamAssignments.enumeratorId, enumerator.id),
        isNull(teamAssignments.unassignedAt),
      ),
    });

    if (existing) {
      logger.info({ email }, 'Team assignment already exists, skipping');
      continue;
    }

    await db.insert(teamAssignments).values({
      supervisorId: supervisor.id,
      enumeratorId: enumerator.id,
      lgaId: supervisor.lgaId,
      isSeeded: true,
    });

    logger.info({ supervisor: supervisor.email, enumerator: email }, 'Team assignment created');
  }

  logger.info('Team assignments seeding complete');
}

/**
 * Seed system-wide default productivity target (Story 5.6a)
 * Inserts { lgaId: null, dailyTarget: 25 } if no active default exists.
 */
async function seedProductivityTargets(): Promise<void> {
  logger.info('Seeding productivity targets...');

  // Check if an active system-wide default already exists
  const existing = await db.query.productivityTargets.findFirst({
    where: and(
      isNull(productivityTargets.lgaId),
      isNull(productivityTargets.effectiveUntil),
    ),
  });

  if (existing) {
    logger.info({ dailyTarget: existing.dailyTarget }, 'System-wide productivity target already exists, skipping');
    return;
  }

  await db.insert(productivityTargets).values({
    lgaId: null,
    dailyTarget: 25,
  });

  logger.info({ dailyTarget: 25 }, 'System-wide default productivity target created');
}

/**
 * Seed default fraud thresholds (required for fraud detection system)
 * Idempotent: skips if active thresholds already exist (preserves manual config)
 * Requires a super_admin user for the createdBy audit column
 */
export async function seedFraudThresholds(roleMap: Map<string, string>): Promise<void> {
  logger.info('Seeding fraud thresholds...');

  // Idempotent guard: skip if ANY active thresholds exist (preserves manual config).
  // A simple existence check is safe because the batch insert below is atomic —
  // it either inserts all 27 records or none, so partial seed state cannot occur.
  const existing = await db.query.fraudThresholds.findFirst({
    where: eq(fraudThresholds.isActive, true),
  });

  if (existing) {
    logger.info('Active fraud thresholds already exist, skipping');
    return;
  }

  // Find a super_admin user for createdBy (NOT NULL column)
  const superAdminRoleId = roleMap.get('super_admin');
  if (!superAdminRoleId) {
    logger.warn('super_admin role not found, skipping fraud threshold seeding');
    return;
  }

  const adminUser = await db.query.users.findFirst({
    where: eq(users.roleId, superAdminRoleId),
  });

  if (!adminUser) {
    logger.warn('No super_admin user found, skipping fraud threshold seeding. Re-run seed after creating an admin user.');
    return;
  }

  await db.insert(fraudThresholds).values(
    FRAUD_THRESHOLD_DEFAULTS.map((threshold) => ({
      ruleKey: threshold.ruleKey,
      displayName: threshold.displayName,
      ruleCategory: threshold.ruleCategory,
      thresholdValue: threshold.thresholdValue,
      weight: threshold.weight,
      severityFloor: threshold.severityFloor,
      version: 1,
      isActive: true,
      effectiveUntil: null,
      createdBy: adminUser.id,
      notes: threshold.notes,
    }))
  );

  logger.info({ count: FRAUD_THRESHOLD_DEFAULTS.length }, 'Fraud thresholds seeding complete');
}

/**
 * Production seed - creates Super Admin from environment variables
 */
async function seedProductionAdmin(roleMap: Map<string, string>): Promise<void> {
  const adminEmail = process.env.SUPER_ADMIN_EMAIL;
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
  const adminName = process.env.SUPER_ADMIN_NAME || 'System Administrator';

  if (!adminEmail || !adminPassword) {
    throw new Error(
      'SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD environment variables are required for production seed'
    );
  }

  logger.info({ email: adminEmail }, 'Seeding production Super Admin...');

  // Check if admin already exists
  const existing = await db.query.users.findFirst({
    where: eq(users.email, adminEmail.toLowerCase()),
  });

  if (existing) {
    logger.info({ email: adminEmail }, 'Super Admin already exists, skipping');
    return;
  }

  const roleId = roleMap.get('super_admin');
  if (!roleId) {
    throw new Error('super_admin role not found. Run role seed first.');
  }

  const passwordHash = await hashPassword(adminPassword);

  await db.insert(users).values({
    email: adminEmail.toLowerCase(),
    passwordHash,
    fullName: adminName,
    roleId,
    status: 'active',
    isSeeded: false, // Production admin is NOT marked as seeded (real account)
  });

  logger.info({ email: adminEmail }, 'Production Super Admin created');
}

/**
 * Clean seeded data - removes all records with is_seeded = true
 */
async function cleanSeededData(): Promise<void> {
  logger.info('Cleaning seeded data...');

  // Delete in FK-safe order: team_assignments before users (no cascade)
  const deletedAssignments = await db.delete(teamAssignments).where(eq(teamAssignments.isSeeded, true)).returning();
  logger.info({ count: deletedAssignments.length }, 'Deleted seeded team assignments');

  const deletedUsers = await db.delete(users).where(eq(users.isSeeded, true)).returning();
  logger.info({ count: deletedUsers.length }, 'Deleted seeded users');

  // Note: LGAs and roles are typically not deleted as they may be referenced
  // Uncomment if you want to delete them too:
  // const deletedLgas = await db.delete(lgas).where(eq(lgas.isSeeded, true)).returning();
  // logger.info({ count: deletedLgas.length }, 'Deleted seeded LGAs');
  // const deletedRoles = await db.delete(roles).where(eq(roles.isSeeded, true)).returning();
  // logger.info({ count: deletedRoles.length }, 'Deleted seeded roles');

  logger.info('Seeded data cleanup complete');
}

/**
 * Main seed runner
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDev = args.includes('--dev') || args.includes('-d');
  const isAdminFromEnv = args.includes('--admin-from-env');
  const isClean = args.includes('--clean');

  try {
    if (isClean) {
      await cleanSeededData();
      return;
    }

    // Always seed roles and LGAs (required for system to function)
    // For production, we don't mark them as seeded (they're real data)
    const markAsSeeded = isDev;
    const roleMap = await seedRoles(markAsSeeded);
    const lgaMap = await seedLGAs(markAsSeeded);

    // Always seed productivity targets (required for productivity feature)
    await seedProductivityTargets();

    if (isDev) {
      // Development: seed test users with known passwords
      await seedDevelopmentUsers(roleMap, lgaMap);
      // prep-8: Seed team assignments (supervisor → enumerators)
      await seedTeamAssignments();
    } else if (isAdminFromEnv) {
      // Production: create Super Admin from environment variables
      await seedProductionAdmin(roleMap);
    }

    // Fraud thresholds — needs super_admin user for createdBy, so runs after user creation
    await seedFraudThresholds(roleMap);

    if (isDev) {
      logger.info('=== DEVELOPMENT SEED COMPLETE ===');
      logger.info('Test credentials:');
      logger.info('  admin@dev.local / admin123 (Super Admin)');
      logger.info('  supervisor@dev.local / super123 (Supervisor)');
      logger.info('  enumerator@dev.local / enum123 (Enumerator)');
      logger.info('  enumerator2@dev.local / enum123 (Enumerator 2)');
      logger.info('  enumerator3@dev.local / enum123 (Enumerator 3)');
      logger.info('  clerk@dev.local / clerk123 (Data Entry Clerk)');
      logger.info('  assessor@dev.local / assess123 (Verification Assessor)');
      logger.info('  official@dev.local / official123 (Government Official)');
      logger.info('  public@dev.local / public123 (Public User)');
    } else if (isAdminFromEnv) {
      logger.info('=== PRODUCTION SEED COMPLETE ===');
    } else {
      // Default: just seed roles and LGAs
      logger.info('=== BASE SEED COMPLETE ===');
      logger.info('Roles and LGAs seeded. Use --dev for test users or --admin-from-env for production admin.');
    }
  } catch (error) {
    logger.error({ error }, 'Seed failed');
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if executed directly (not when imported as a module by tests)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && process.argv[1].replace(/\\/g, '/') === __filename.replace(/\\/g, '/')) {
  main().catch((error) => {
    console.error('Seed error:', error);
    process.exit(1);
  });
}

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
import { roles, lgas, users, teamAssignments, productivityTargets, fraudThresholds, userBackupCodes } from '../schema/index.js';
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

/** A dev-seed account as declared in `seedDevelopmentUsers`. */
interface DevUserSpec {
  email: string;
  password: string;
  fullName: string;
  role: string;
  lga: string | null;
}

/**
 * Databases `seedDevelopmentUsers` is allowed to MUTATE. Fail-closed allow-list,
 * not a prod deny-list: we cannot enumerate every production database name, but we
 * can enumerate the handful that are disposable by construction.
 *   - boundary-matched `test` / `dev`  → test_db, app_test, oslsr_test, app_dev …
 *   - the literal `app_db`             → the documented local dev database
 * Boundary matching so `latest`/`greatest` don't qualify (same idiom as
 * apps/api/test/db-guard.ts, which cannot be imported here — `test/` is outside
 * the api tsconfig `include`).
 */
function looksLikeDisposableDb(dbName: string): boolean {
  return /(^|[^a-z])(test|dev)([^a-z]|$)/i.test(dbName) || dbName === 'app_db';
}

/**
 * Guard for the CONVERGENCE path (Story 13-36 review, AI-8).
 *
 * `seedDevelopmentUsers` stopped being create-only: it now resets `passwordHash` to
 * a known literal, strips the whole MFA block and DELETEs `user_backup_codes`. That
 * makes it a destructive script, and playbook **Pitfall #29** is explicit that a
 * destructive seed path needs more than an env-NAME guard — "a non-prod DB is not
 * the same as an empty-or-disposable DB", and `db:seed:dev` sets no NODE_ENV at all
 * (it inherits whatever the root `.env` happens to carry — the exact ambient-env
 * trap Pitfall #42 documents).
 *
 * No-ops when DATABASE_URL is unset or unparseable: `db/index.ts` owns that case.
 * All three CI callers use `test_db`, so CI is unaffected.
 */
export function assertDevSeedDatabase(databaseUrl: string | undefined, allowOverride: boolean): void {
  if (!databaseUrl) return;

  let dbName = '';
  try {
    dbName = new URL(databaseUrl).pathname.replace(/^\//, '');
  } catch {
    return;
  }

  if (!dbName || looksLikeDisposableDb(dbName) || allowOverride) return;

  throw new Error(
    `Refusing to run the DEVELOPMENT seed against database "${dbName}".\n` +
      `This seed MUTATES existing rows: it resets seeded accounts to known passwords, disables MFA ` +
      `and deletes their backup codes. That is safe on a disposable dev/test database and ` +
      `destructive anywhere else.\n` +
      `Expected a database whose name contains "test" or "dev" (e.g. app_test, test_db), or "app_db".\n` +
      `If you REALLY intend to seed "${dbName}", set ALLOW_DEV_SEED_DB=1.`,
  );
}

/**
 * THE dev-seed contract: every column the dev seed owns and therefore resets on
 * every `db:seed:dev` run. Single source of truth for both the write and the
 * drift report (see the call site).
 *
 * Deliberately NOT included — a dev row may legitimately accumulate these and the
 * seed has no business resetting them: email, isSeeded, createdAt, currentSessionId,
 * emailVerifiedAt, and everything the account owns elsewhere (submissions, audit
 * rows, team assignments — the latter are reconciled by `seedTeamAssignments`).
 */
function devSeedContract(
  user: DevUserSpec,
  roleId: string,
  lgaId: string | null,
  passwordHash: string,
) {
  return {
    passwordHash,
    fullName: user.fullName,
    roleId,
    lgaId,
    status: 'active',
    // A tripped password lockout blocks login exactly like MFA does.
    failedLoginAttempts: 0,
    lockedUntil: null,
    // The whole MFA block. `mfaGraceUntil: null` is the load-bearing one: the
    // mfa-grace gate lets a super_admin through only when it IS NULL
    // (mfa-grace.ts:69) — a stale EXPIRED grace 403s every privileged route with
    // FORCE_MFA_ENROLLMENT even though `mfaEnabled` is false.
    mfaEnabled: false,
    mfaSecret: null,
    mfaGraceUntil: null,
    mfaLockedUntil: null,
  } as const;
}

/**
 * Which contract fields the existing row violates — reported so a developer sees
 * WHY their local run was broken, instead of watching it silently "fix itself".
 *
 * `passwordHash` is excluded: bcrypt salts every hash differently, so it can
 * never compare equal. It is always re-applied, never reported.
 */
function driftFromContract(
  existing: typeof users.$inferSelect,
  contract: ReturnType<typeof devSeedContract>,
): string[] {
  const drift: string[] = [];

  for (const key of Object.keys(contract) as (keyof typeof contract)[]) {
    if (key === 'passwordHash') continue;

    const want: unknown = contract[key];
    const have: unknown = existing[key as keyof typeof existing];

    // `failed_login_attempts` is nullable with a 0 default — null means 0.
    if (typeof want === 'number' && (have ?? 0) === want) continue;
    // Every contract value is a primitive or null (the date-valued columns are all
    // reset to null), so a Date-vs-Date comparison is unreachable here — a `have`
    // that IS a Date always drifts against its null target, which is correct.
    if ((have ?? null) === (want ?? null)) continue;

    drift.push(key === 'status' ? `status=${String(have)}` : key);
  }

  return drift;
}

/**
 * Development seed - creates test users with known passwords, and RE-CONVERGES
 * existing ones to that documented state.
 * DO NOT USE IN PRODUCTION
 *
 * Story 13-36: this used to be create-only ("User already exists, skipping"), so
 * once a `@dev.local` account drifted, `db:seed:dev` could never heal it — the
 * command that is supposed to *establish* the dev contract silently declined to
 * *restore* it. That is how a local super-admin sat MFA-enrolled from 2026-05-09
 * onward, breaking every admin-dependent E2E test locally (login stops at
 * `/auth/mfa-challenge`) while CI stayed green on its fresh `test_db`. The E2E
 * suite is only a trustworthy signal if "green in CI" is reproducible locally.
 *
 * Seed-owned fields are declared ONCE in `devSeedContract` above (plus any
 * `user_backup_codes` rows, cleared alongside the MFA reset). Everything else a
 * dev row accumulated is untouched.
 *
 * Three guards, because this now MUTATES rows rather than only inserting:
 *   1. never runs when NODE_ENV=production;
 *   2. never runs against a database that isn't demonstrably disposable
 *      (`assertDevSeedDatabase` — an env-NAME guard alone is what playbook
 *      Pitfall #29 warns against, and `db:seed:dev` sets no NODE_ENV of its own);
 *   3. never touches a row that is not `isSeeded` — a real account that happens
 *      to share the email is reported and skipped, never downgraded.
 *
 * WHY ONLY THIS SEED CONVERGES (13-36 sweep of the orchestrator — the same
 * "create-only, can never heal drift" shape is present in the siblings and is
 * CORRECT there):
 *   - `seedRoles` / `seedLGAs` / `seedProductivityTargets` / `seedFraudThresholds`
 *     run on the PRODUCTION path too (main() calls them unconditionally; only
 *     dev-users and team-assignments are gated behind `--dev`). Converging them
 *     would let a seed run overwrite live reference data — e.g. LGA rows, whose
 *     canonical values were deliberately migrated in Story 13-16. `seedFraudThresholds`
 *     additionally documents "preserves manual config" as intent.
 *   - `seedTeamAssignments` is ALREADY convergent: it re-inserts whenever no
 *     ACTIVE (`unassigned_at IS NULL`) row exists, so an unassigned team heals on
 *     the next run. It depends on the supervisor having an LGA — which this
 *     function now restores, so the two compose.
 * The rule: converge where the blast radius is dev-only and seed-owned; stay
 * create-only where a run could touch real data.
 */
export async function seedDevelopmentUsers(
  roleMap: Map<string, string>,
  lgaMap: Map<string, string>
): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed development users with NODE_ENV=production — these are known-password accounts.',
    );
  }
  assertDevSeedDatabase(process.env.DATABASE_URL, process.env.ALLOW_DEV_SEED_DB === '1');

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

  let created = 0;
  let converged = 0;

  for (const user of devUsers) {
    // Check if user already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, user.email),
    });

    const roleId = roleMap.get(user.role);
    if (!roleId) {
      logger.error({ role: user.role }, 'Role not found, skipping user');
      continue;
    }

    // `?? null` matters: an unknown LGA code would otherwise make lgaId
    // `undefined`, which drizzle treats as "leave column alone" — silently
    // skipping the very field we are trying to converge.
    const lgaId = user.lga ? lgaMap.get(user.lga) ?? null : null;

    const passwordHash = await hashPassword(user.password);

    if (!existing) {
      await db.insert(users).values({
        email: user.email,
        passwordHash,
        fullName: user.fullName,
        roleId,
        lgaId,
        status: 'active',
        isSeeded: true,
      });

      created += 1;
      logger.info(
        { email: user.email, role: user.role, password: user.password },
        'Dev user created'
      );
      continue;
    }

    // Guard 2: only ever re-converge a row the seed itself owns.
    if (!existing.isSeeded) {
      logger.warn(
        { email: user.email },
        'A NON-seeded user owns this dev email — leaving it untouched (no password/MFA reset)',
      );
      continue;
    }

    // ONE declaration of the seed-owned state: both the reset below and the drift
    // report are derived from it. A second hand-maintained list would rot — add a
    // field to the reset, forget the report, and the log starts lying about a
    // heal it actually performed.
    const contract = devSeedContract(user, roleId, lgaId, passwordHash);
    const drift = driftFromContract(existing, contract);

    await db
      .update(users)
      .set({ ...contract, updatedAt: new Date() })
      .where(eq(users.id, existing.id));

    // FK is ON DELETE CASCADE, but the user row survives — clear the codes
    // explicitly so a reset account can't be re-entered with an old backup code.
    await db.delete(userBackupCodes).where(eq(userBackupCodes.userId, existing.id));

    converged += 1;
    if (drift.length > 0) {
      logger.warn(
        { email: user.email, drift },
        'Dev user had drifted from the seed contract — re-converged',
      );
    } else {
      logger.info({ email: user.email }, 'Dev user already matched the seed contract — refreshed');
    }
  }

  logger.info(
    { count: devUsers.length, created, converged },
    'Development users seeding complete'
  );
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

    // Gate the whole --dev run, not just the user step: seedRoles/seedLGAs/
    // seedProductivityTargets all WRITE before seedDevelopmentUsers is reached, so a
    // guard living only inside that function fires after the damage (review AI-8).
    // `seedDevelopmentUsers` keeps its own copy of the check because it is exported
    // and can be called without going through main().
    if (isDev) {
      assertDevSeedDatabase(process.env.DATABASE_URL, process.env.ALLOW_DEV_SEED_DB === '1');
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

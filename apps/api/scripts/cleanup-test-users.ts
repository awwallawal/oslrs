/**
 * Cleanup Test Users Script
 *
 * Run with: pnpm -F @oslsr/api exec tsx scripts/cleanup-test-users.ts
 *
 * This script removes test users created during test runs.
 * It also removes related data to avoid FK violations.
 */

import { db, pool } from '../src/db/index.js';
import { users, auditLogs, questionnaireForms } from '../src/db/schema/index.js';
import { or, like, sql, asc, inArray } from 'drizzle-orm';

const TEST_EMAIL_PATTERNS = [
  'perf-%@example.com',
  'nin-test-%@example.com',
  'activate-%@example.com',
  'expiry-%@example.com',
  'test-%@example.com',
  'bulk-%@example.com',
  'import-%@example.com',
];

async function main() {
  console.log('🔍 Searching for test users...\n');

  // Build OR conditions for all patterns
  const conditions = TEST_EMAIL_PATTERNS.map(pattern => like(users.email, pattern));

  const testUsers = await db
    .select({ id: users.id, email: users.email, isSeeded: users.isSeeded })
    .from(users)
    .where(or(...conditions))
    .orderBy(asc(users.email));

  if (testUsers.length === 0) {
    console.log('✨ No test users found. Database is clean!');
    await pool.end();
    return;
  }

  console.log(`Found ${testUsers.length} test user(s):\n`);

  // Group by pattern for summary
  const patternCounts: Record<string, number> = {};
  testUsers.forEach(u => {
    const pattern = TEST_EMAIL_PATTERNS.find(p => {
      const prefix = p.replace('%@example.com', '');
      return u.email.startsWith(prefix);
    }) || 'other';
    patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
  });

  console.log('Summary by pattern:');
  Object.entries(patternCounts).forEach(([pattern, count]) => {
    console.log(`  ${pattern}: ${count} users`);
  });

  const testUserIds = testUsers.map(u => u.id);

  // Delete related data first to avoid FK violations
  console.log(`\n🗑️  Deleting related data for test users...`);

  // 1. Delete audit logs
  const deletedActorLogs = await db
    .delete(auditLogs)
    .where(inArray(auditLogs.actorId, testUserIds))
    .returning();
  console.log(`   Deleted ${deletedActorLogs.length} audit logs (as actor)`);

  const deletedTargetLogs = await db
    .delete(auditLogs)
    .where(inArray(auditLogs.targetId, testUserIds))
    .returning();
  console.log(`   Deleted ${deletedTargetLogs.length} audit logs (as target)`);

  // 2. Delete questionnaire forms uploaded by test users
  const deletedForms = await db
    .delete(questionnaireForms)
    .where(inArray(questionnaireForms.uploadedBy, testUserIds))
    .returning();
  console.log(`   Deleted ${deletedForms.length} questionnaire forms`);

  console.log(`\n🗑️  Deleting ${testUsers.length} test user(s)...`);

  // Delete in batches
  const batchSize = 50;
  let deleted = 0;

  for (let i = 0; i < testUsers.length; i += batchSize) {
    const batch = testUsers.slice(i, i + batchSize);
    const ids = batch.map(u => u.id);

    try {
      await db.delete(users).where(inArray(users.id, ids));
      deleted += batch.length;
      console.log(`   Deleted ${deleted}/${testUsers.length}...`);
    } catch (err: any) {
      // Log specific errors but continue
      console.log(`   ⚠️  Error deleting batch: ${err.detail || err.message}`);
      // Try deleting one by one
      for (const id of ids) {
        try {
          await db.delete(users).where(inArray(users.id, [id]));
          deleted++;
        } catch {
          console.log(`      Skipped user with FK constraint`);
        }
      }
    }
  }

  console.log(`\n✅ Deleted ${deleted} test user(s)`);

  // Show remaining user count
  const remainingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(users);

  console.log(`\n📋 Remaining users in database: ${remainingCount[0].count}`);

  await pool.end();
  console.log('\n🎉 Cleanup complete!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

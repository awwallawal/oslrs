/**
 * Cleanup Duplicate/Test Roles Script
 *
 * Run with: pnpm -F @oslsr/api exec tsx scripts/cleanup-duplicate-roles.ts
 *
 * This script removes any roles that are not in the official seed list.
 * It also handles users assigned to invalid roles by either reassigning or deleting them.
 */

import { db, pool } from '../src/db/index.js';
import { roles, users } from '../src/db/schema/index.js';
import { notInArray, inArray, asc, eq } from 'drizzle-orm';

const VALID_ROLES = [
  'super_admin',
  'supervisor',
  'enumerator',
  'data_entry_clerk',
  'verification_assessor',
  'government_official',
  'public_user',
];

async function main() {
  console.log('🔍 Fetching all roles...\n');

  const allRoles = await db.select().from(roles).orderBy(asc(roles.name));

  console.log('Current roles in database:');
  allRoles.forEach(r => {
    const isValid = VALID_ROLES.includes(r.name);
    const status = isValid ? '✅' : '❌ (will be deleted)';
    console.log(`  ${status} ${r.name}`);
  });

  const invalidRoles = allRoles.filter(r => !VALID_ROLES.includes(r.name));

  if (invalidRoles.length === 0) {
    console.log('\n✨ No invalid roles found. Database is clean!');
    await pool.end();
    return;
  }

  const invalidRoleIds = invalidRoles.map(r => r.id);

  // Check for users assigned to invalid roles
  console.log('\n🔍 Checking for users with invalid roles...');
  const usersWithInvalidRoles = await db
    .select({ id: users.id, email: users.email, roleId: users.roleId, isSeeded: users.isSeeded })
    .from(users)
    .where(inArray(users.roleId, invalidRoleIds));

  if (usersWithInvalidRoles.length > 0) {
    console.log(`\n⚠️  Found ${usersWithInvalidRoles.length} user(s) with invalid roles:`);
    usersWithInvalidRoles.forEach(u => {
      const role = invalidRoles.find(r => r.id === u.roleId);
      console.log(`   - ${u.email} (role: ${role?.name}, seeded: ${u.isSeeded})`);
    });

    // Delete seeded/test users with invalid roles
    const seededUsers = usersWithInvalidRoles.filter(u => u.isSeeded);
    if (seededUsers.length > 0) {
      console.log(`\n🗑️  Deleting ${seededUsers.length} seeded/test user(s)...`);
      for (const user of seededUsers) {
        await db.delete(users).where(eq(users.id, user.id));
        console.log(`   - Deleted: ${user.email}`);
      }
    }

    // Check if there are non-seeded users left
    const nonSeededUsers = usersWithInvalidRoles.filter(u => !u.isSeeded);
    if (nonSeededUsers.length > 0) {
      // Get the valid enumerator role to reassign
      const enumeratorRole = allRoles.find(r => r.name === 'enumerator');
      if (enumeratorRole) {
        console.log(`\n🔄 Reassigning ${nonSeededUsers.length} non-seeded user(s) to 'enumerator' role...`);
        for (const user of nonSeededUsers) {
          await db.update(users).set({ roleId: enumeratorRole.id }).where(eq(users.id, user.id));
          console.log(`   - Reassigned: ${user.email}`);
        }
      }
    }
  }

  console.log(`\n🗑️  Deleting ${invalidRoles.length} invalid role(s)...`);

  const deleted = await db
    .delete(roles)
    .where(notInArray(roles.name, VALID_ROLES))
    .returning();

  console.log(`\n✅ Deleted ${deleted.length} role(s):`);
  deleted.forEach(r => console.log(`   - ${r.name}`));

  console.log('\n📋 Remaining valid roles:');
  const remaining = await db.select().from(roles).orderBy(asc(roles.name));
  remaining.forEach(r => console.log(`   ✅ ${r.name}`));

  await pool.end();
  console.log('\n🎉 Cleanup complete!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

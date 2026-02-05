/**
 * Cleanup Duplicate/Test Roles Script
 *
 * Run with: pnpm -F @oslsr/api exec tsx scripts/cleanup-duplicate-roles.ts
 *
 * This script removes any roles that are not in the official seed list.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { notInArray, asc } from 'drizzle-orm';
import 'dotenv/config';

// Define roles table schema inline to avoid import issues
const roles = pgTable('roles', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  isSeeded: boolean('is_seeded').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Create database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool, { schema: { roles } });

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

/**
 * Story 13-73 R4 (ruled "fix" by Awwal, 2026-09-24) — a test that needs a role
 * CREATES it, idempotently, instead of assuming a seed ran.
 *
 * ⛔ WHY. `db:push:full:force` — the recipe for `app_test` and exactly what CI's
 * `test-api` job runs — creates the schema and seeds NO roles. Five integration
 * files looked a role up by name and never inserted it, so on a freshly pushed
 * database they failed ("role enumerator missing from the test DB — run db:seed").
 * CI passed them only because some OTHER file happened to insert those roles first
 * — an ordering dependency that a pool or shard change turns into a random red.
 * Observed on 2026-09-24 against a freshly recreated database, all five RED.
 *
 * `ON CONFLICT (name) DO NOTHING`: a seeded database keeps its seeded rows exactly
 * as they are; only a missing role is created. `roles.id` has no database default
 * (drizzle's `$defaultFn`), hence the explicit `gen_random_uuid()`.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';

export async function ensureRoles(...names: string[]): Promise<void> {
  for (const name of names) {
    await db.execute(sql`
      INSERT INTO roles (id, name, description)
      VALUES (gen_random_uuid(), ${name}, ${`${name} (created by a test — ensureRoles)`})
      ON CONFLICT (name) DO NOTHING
    `);
  }
}

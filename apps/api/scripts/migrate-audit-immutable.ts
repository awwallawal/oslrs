/**
 * Migration script: Audit Logs Immutability
 * Story 6-1: Adds hash chain columns, backfills existing records, creates append-only trigger.
 *
 * Run AFTER db:push has added hash/previousHash columns to audit_logs.
 * Usage: pnpm --filter @oslsr/api tsx scripts/migrate-audit-immutable.ts
 *
 * This script is idempotent — safe to run multiple times.
 */

import pg from 'pg';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const GENESIS_HASH = createHash('sha256').update('OSLRS-AUDIT-GENESIS-2026').digest('hex');

/**
 * Canonical JSON stringification — must match AuditService.canonicalJsonStringify exactly.
 * Sorts keys at every nesting level for deterministic output across JSONB round-trips.
 */
function canonicalJsonStringify(value: unknown): string {
  if (value === null || value === undefined) return '{}';
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) {
        sorted[k] = val[k];
      }
      return sorted;
    }
    return val;
  });
}

function computeHash(
  id: string,
  action: string,
  actorId: string | null,
  createdAt: Date,
  details: unknown,
  previousHash: string,
): string {
  const payload = `${id}|${action}|${actorId ?? 'SYSTEM'}|${createdAt.toISOString()}|${canonicalJsonStringify(details)}|${previousHash}`;
  return createHash('sha256').update(payload).digest('hex');
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('Starting audit_logs immutability migration...');

    // Step 1: Check if columns exist
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'audit_logs' AND column_name IN ('hash', 'previous_hash')
    `);

    if (colCheck.rows.length < 2) {
      console.error('ERROR: hash and/or previous_hash columns not found. Run db:push first.');
      process.exit(1);
    }

    // Step 2: Drop existing triggers if present (idempotent)
    await pool.query(`DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs`);
    await pool.query(`DROP TRIGGER IF EXISTS trg_audit_logs_no_truncate ON audit_logs`);
    console.log('  Dropped existing triggers (if any)');

    // Step 3: Backfill existing records that have NULL hash
    const nullHashCount = await pool.query(`SELECT COUNT(*) as cnt FROM audit_logs WHERE hash IS NULL`);
    const count = parseInt(nullHashCount.rows[0].cnt, 10);

    if (count > 0) {
      console.log(`  Backfilling ${count} records with hash chain...`);

      // Fetch all records in order
      const records = await pool.query(`
        SELECT id, action, actor_id, created_at, details, hash, previous_hash
        FROM audit_logs
        ORDER BY created_at ASC, id ASC
      `);

      let prevHash = GENESIS_HASH;
      let backfilled = 0;

      for (const row of records.rows) {
        if (row.hash != null) {
          // Already has hash, use it as the previous for next record
          prevHash = row.hash;
          continue;
        }

        const hash = computeHash(
          row.id,
          row.action,
          row.actor_id,
          row.created_at,
          row.details,
          prevHash,
        );

        await pool.query(
          `UPDATE audit_logs SET hash = $1, previous_hash = $2 WHERE id = $3`,
          [hash, prevHash, row.id],
        );

        prevHash = hash;
        backfilled++;
      }

      console.log(`  Backfilled ${backfilled} records`);
    } else {
      console.log('  No records need backfilling');
    }

    // Step 3.5: Fix genesis record previous_hash for already-migrated databases (AC5)
    // AC5 requires genesis record to have previous_hash = GENESIS_HASH, not null
    const genesisFixResult = await pool.query(
      `UPDATE audit_logs SET previous_hash = $1 WHERE previous_hash IS NULL AND created_at = (SELECT MIN(created_at) FROM audit_logs)`,
      [GENESIS_HASH],
    );
    if (genesisFixResult.rowCount && genesisFixResult.rowCount > 0) {
      console.log(`  Fixed genesis record previous_hash (was null → GENESIS_HASH)`);
    }

    // Step 3.6: Enforce NOT NULL on hash column (AC5: "hash TEXT NOT NULL")
    await pool.query(`ALTER TABLE audit_logs ALTER COLUMN hash SET NOT NULL`);
    console.log('  Set hash column to NOT NULL');

    // Step 4: Create the append-only trigger function and trigger
    await pool.query(`
      CREATE OR REPLACE FUNCTION audit_logs_immutable()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs table is append-only: % operations are not permitted', TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('  Created immutable trigger function');

    await pool.query(`
      CREATE TRIGGER trg_audit_logs_immutable
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
    `);
    console.log('  Created append-only trigger (UPDATE/DELETE)');

    // Step 4b: TRUNCATE protection — row-level triggers do NOT fire on TRUNCATE
    await pool.query(`
      CREATE TRIGGER trg_audit_logs_no_truncate
      BEFORE TRUNCATE ON audit_logs
      FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();
    `);
    console.log('  Created TRUNCATE protection trigger');

    // Step 5: Create index on created_at for hash chain verification
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at ASC)
    `);
    console.log('  Created created_at index');

    console.log('Migration complete! audit_logs is now immutable with hash chain.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

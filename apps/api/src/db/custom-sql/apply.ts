/**
 * Apply custom SQL files (triggers, extensions, etc.) that Drizzle db:push cannot manage.
 *
 * Usage: pnpm --filter @oslsr/api db:custom
 * Run after db:push to apply triggers and other custom DDL.
 *
 * All .sql files use CREATE OR REPLACE / DROP IF EXISTS for idempotency.
 */

import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in environment variables');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const sqlDir = __dirname;
  const sqlFiles = readdirSync(sqlDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (sqlFiles.length === 0) {
    console.log('No .sql files found in custom-sql directory');
    await pool.end();
    return;
  }

  console.log(`Applying ${sqlFiles.length} custom SQL file(s)...`);

  for (const file of sqlFiles) {
    const filePath = path.join(sqlDir, file);
    const sql = readFileSync(filePath, 'utf-8');

    try {
      await pool.query(sql);
      console.log(`  ✓ ${file}`);
    } catch (err) {
      console.error(`  ✗ ${file}: ${(err as Error).message}`);
      await pool.end();
      process.exit(1);
    }
  }

  console.log('All custom SQL applied successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error('Failed to apply custom SQL:', err);
  process.exit(1);
});

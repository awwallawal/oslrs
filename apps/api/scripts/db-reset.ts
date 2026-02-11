/**
 * Non-interactive database reset script.
 *
 * This script:
 *   1. Drops all tables in the public schema (via raw SQL, no prompts)
 *   2. Runs `drizzle-kit migrate` to re-create schema from migration files
 *   3. Runs the dev seed script
 *
 * Usage:
 *   pnpm tsx scripts/db-reset.ts          # reset + seed with dev data
 *   pnpm tsx scripts/db-reset.ts --no-seed # reset without seeding
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(apiRoot, '../..');

dotenv.config({ path: path.resolve(projectRoot, '.env') });

const args = process.argv.slice(2);
const noSeed = args.includes('--no-seed');

if (!process.env.DATABASE_URL) {
  console.error('[db-reset] DATABASE_URL is not set in environment variables');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  console.error('[db-reset] REFUSED: Cannot run db:reset in production (NODE_ENV=production).');
  console.error('[db-reset] Use db:migrate for production schema changes.');
  process.exit(1);
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Step 1: Drop all tables in the public schema
    console.log('[db-reset] Dropping all tables in public schema...');
    await pool.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        -- Drop all tables
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
        -- Drop all custom types/enums
        FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typtype = 'e') LOOP
          EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
        END LOOP;
      END $$;
    `);
    console.log('[db-reset] All tables and enums dropped.');

    // Step 2: Run drizzle-kit migrate to re-create schema from migration files
    console.log('[db-reset] Running drizzle-kit migrate to re-create schema...');
    execSync('tsc && drizzle-kit migrate', {
      cwd: apiRoot,
      stdio: 'inherit',
      shell: true,
    });
    console.log('[db-reset] Schema re-created.');

    // Step 3: Seed dev data
    if (!noSeed) {
      console.log('[db-reset] Running dev seed...');
      execSync('pnpm tsx src/db/seeds/index.ts --dev', {
        cwd: apiRoot,
        stdio: 'inherit',
        shell: true,
      });
      console.log('[db-reset] Dev seed complete.');
    } else {
      console.log('[db-reset] Skipping seed (--no-seed flag).');
    }

    console.log('[db-reset] Database reset complete!');
  } catch (error) {
    console.error('[db-reset] Error:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in environment variables');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // max: 20 — sufficient for 200 staff users + background workers.
  // Postgres default is 100 max connections; 20 per pool leaves headroom.
  max: 20,
  // idleTimeoutMillis: 30000 — release idle connections after 30s to prevent exhaustion
  idleTimeoutMillis: 30000,
  // connectionTimeoutMillis: 2000 — fail fast on connection issues rather than hanging
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool, { schema });

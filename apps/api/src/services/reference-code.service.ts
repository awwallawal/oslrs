/**
 * Story 9-58 (Deliverable B) — reference-code generation with DB-uniqueness.
 *
 * The pure shape generator lives in `@oslsr/utils` (`generateReferenceCode`);
 * this service wraps it with the collision-retry loop against the
 * `respondents.reference_code` UNIQUE index so callers (the wizard sync path,
 * the async `findOrCreateRespondent` path, and the backfill runner) get a value
 * that is unique at insert time. The UNIQUE index remains the true backstop —
 * the loop just avoids relying on the rare 23505 retry for the common case.
 *
 * SERVER IS AUTHORITATIVE (9-58 review M2, operator-approved 2026-06-15): the
 * persisted reference code is ALWAYS minted server-side via `generateUnique`.
 * A client may mint a provisional code for instant/offline DISPLAY, but the
 * server never trusts it for the persisted value — there is deliberately no
 * "accept a client-supplied code" path here anymore.
 */
import { sql, type SQL } from 'drizzle-orm';
import { generateReferenceCode } from '@oslsr/utils';
import { db } from '../db/index.js';

/** Anything with a drizzle-style `.execute(sql)` — the root `db` or a `tx`. */
export interface SqlExecutor {
  execute(query: SQL): Promise<unknown>;
}

const MAX_ATTEMPTS = 8;

export class ReferenceCodeService {
  /**
   * Mint a reference code that does not yet exist in `respondents`.
   *
   * @param executor drizzle `db` (default) or a transaction handle.
   * @param year     4-digit namespace year (defaults to the current year).
   */
  static async generateUnique(
    executor: SqlExecutor = db,
    year: number = new Date().getFullYear(),
  ): Promise<string> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = generateReferenceCode(year);
      const result = (await executor.execute(
        sql`SELECT 1 FROM "respondents" WHERE "reference_code" = ${candidate} LIMIT 1`,
      )) as { rows?: unknown[] };
      if (!result.rows || result.rows.length === 0) {
        return candidate;
      }
    }
    throw new Error(
      `ReferenceCodeService: could not mint a unique reference code after ${MAX_ATTEMPTS} attempts`,
    );
  }
}

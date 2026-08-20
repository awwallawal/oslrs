import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  resolveRespondentContactEmail,
  listRespondentsWithoutEmail,
} from '../respondent-contact.service.js';

/**
 * Story 13-51 — REAL-DB smoke for the canonical contact resolver.
 *
 * ⛔ WHY THIS FILE HAD TO EXIST BEFORE THE FIX COULD BE CALLED DONE.
 *
 * `resolveRespondentContactEmail` had NEVER SUCCEEDED. Its `UNION ALL` branches carried bare
 * `ORDER BY ... LIMIT` without parentheses, which Postgres rejects with
 * `42601 syntax error at or near "UNION"` — so every call, for every respondent, since the
 * function was introduced (`9d33b94`), threw.
 *
 * It survived that long for one reason: **nothing ever executed it against a database.** All three
 * callers are hand-run operator scripts under `apps/api/scripts/`, which is outside tsconfig
 * (Pitfall #41 — "RUN scripts, don't trust tsc"), and a SQL syntax error is invisible to `tsc` in
 * any case. Mocked tests cannot see it either: a mocked `db.execute` never parses the statement.
 *
 * So the fix is only worth as much as this file. These tests hit a REAL Postgres. If the
 * parentheses are ever removed, the query fails to PARSE and every test here reds immediately —
 * which is precisely what did not happen for nine months.
 */
describe('resolveRespondentContactEmail — real-DB (13-51)', () => {
  const RID = '019e3b96-0000-7000-8000-00000000f001';
  const RID_NONE = '019e3b96-0000-7000-8000-00000000f002';

  beforeAll(async () => {
    await db.execute(sql`
      INSERT INTO respondents (id, first_name, last_name, phone_number, status, source, created_at, updated_at)
      VALUES
        (${RID}::uuid,      'Contact', 'Resolver', '+2348000000901', 'active', 'public', now(), now()),
        (${RID_NONE}::uuid, 'Nomail',  'Atall',    '+2348000000902', 'active', 'public', now(), now())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO magic_link_tokens (id, respondent_id, email, token_hash, purpose, expires_at, created_at)
      VALUES (gen_random_uuid(), ${RID}::uuid, '  Magic@Example.COM  ',
              'hash-13-51-contact', 'wizard_resume', now() + interval '1 day', now())
    `);
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM magic_link_tokens WHERE respondent_id IN (${RID}::uuid, ${RID_NONE}::uuid)`);
    await db.execute(sql`DELETE FROM respondents WHERE id IN (${RID}::uuid, ${RID_NONE}::uuid)`);
  });

  it('EXECUTES — the query parses, which is the whole point of this file', async () => {
    // Before 13-51 this line threw `42601 syntax error at or near "UNION"`. Every time.
    await expect(resolveRespondentContactEmail(RID)).resolves.not.toThrow();
  });

  it('resolves via magic_link_token when there is no submission, and TRIMS the stored value', async () => {
    const contact = await resolveRespondentContactEmail(RID);
    expect(contact).not.toBeNull();
    expect(contact!.source).toBe('magic_link_token');
    // The row is stored padded on purpose — the resolver must return something usable as a key.
    expect(contact!.email).toBe('Magic@Example.COM');
  });

  it('returns null — never throws — for a respondent with no email anywhere', async () => {
    // §2s: `null` is a real answer meaning "reach them another way", not a failure to swallow.
    // A destructive caller (nin:reconfirm) must be able to branch on it rather than crash.
    await expect(resolveRespondentContactEmail(RID_NONE)).resolves.toBeNull();
  });

  it('listRespondentsWithoutEmail is the inverse and also executes', async () => {
    const rows = await listRespondentsWithoutEmail();
    expect(Array.isArray(rows)).toBe(true);
    // The no-email respondent must appear; the one with a magic-link email must not.
    expect(rows.some((r) => r.phoneNumber === '+2348000000902')).toBe(true);
    expect(rows.some((r) => r.phoneNumber === '+2348000000901')).toBe(false);
  });
});

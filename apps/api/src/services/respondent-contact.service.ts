/**
 * THE canonical way to find a respondent's email address.
 *
 * WHY THIS EXISTS — the 9-26 blind spot bit three times in one day
 * ----------------------------------------------------------------
 * `submissions.raw_data->>'email'` looks like the obvious source and is WRONG on its own,
 * because **not every respondent has a submissions row**. That is not an edge case; it is the
 * documented Story 9-26 exception (the Story 9-28 absorbed cohort — 56 people at the time of
 * writing, and `prod-verify.yml` §5b gates the number).
 *
 * On 2026-08-05 that single assumption produced three separate defects in one session:
 *   1. `nin:reconfirm` skipped a person it could have reached, reporting "no contact email";
 *   2. the same script would have CLEARED his NIN before discovering it could not ask him for a
 *      new one — leaving him strictly worse off than before;
 *   3. measured across prod: **45 respondents are reachable ONLY via `magic_link_tokens`** and
 *      would have been silently unreachable to any caller that read submissions alone.
 *
 * `pending-nin.service.ts` had the right lookup all along. The problem was that the right lookup
 * lived in one place and every new caller re-derived a narrower one. So it lives here now, and
 * new code should call this rather than reach into a table.
 *
 * ORDER IS DELIBERATE, most-authoritative first:
 *   1. `submissions.raw_data.email` — what they typed on the registration itself
 *   2. `magic_link_tokens.email`    — what a wizard-issued token was sent to (the ONLY source
 *                                     for the absorbed cohort, who have no submission)
 *   3. `users.email`                — an account, if one was ever created
 *
 * Returns `null` when there is genuinely no address anywhere. **A null is a real answer, not a
 * failure** — some records are phone-only (measured: at least one, `+2347033406538`). Callers
 * must handle it as "reach this person another way", and MUST NOT perform a destructive step
 * (clearing a NIN, expiring a link) that depends on an email they cannot send.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

/**
 * Story 13-51 — the same runner shape `audit.service.ts` uses, so the priority SQL below can be
 * executed against either the pooled `db` or an open transaction. It exists because the
 * correction path (13-51 AC2.7/AC2.8) has to READ BACK the resolved address INSIDE the
 * transaction that just wrote it; a read on `db` would see the pre-commit world and the
 * read-back would be a lie that always passed.
 */
type DbTransaction = Parameters<Parameters<(typeof db)['transaction']>[0]>[0];
type Runner = typeof db | DbTransaction;

export type ContactEmailSource = 'submission' | 'magic_link_token' | 'user_account';

export interface RespondentContactEmail {
  email: string;
  source: ContactEmailSource;
}

/**
 * Resolve one respondent's contact email across all three sources.
 *
 * Single query with a deterministic priority so a respondent with several addresses always
 * resolves the same way — a lookup that returns different answers on different days is worse
 * than one that returns nothing.
 */
export async function resolveRespondentContactEmail(
  respondentId: string,
): Promise<RespondentContactEmail | null> {
  return resolveRespondentContactEmailWith(db, respondentId);
}

/**
 * Story 13-51 — the SAME resolution, run against a caller-supplied runner.
 *
 * ⚠️ There is exactly ONE copy of the priority SQL and it lives below. That is the entire point
 * of this file (see the header): every previous caller that re-derived a narrower lookup
 * produced a defect. A transaction-scoped variant that copied the query would reintroduce the
 * problem this module was created to end.
 */
export async function resolveRespondentContactEmailWith(
  runner: Runner,
  respondentId: string,
): Promise<RespondentContactEmail | null> {
  // ⛔ EACH UNION BRANCH IS PARENTHESISED, AND THAT IS NOT COSMETIC — 13-51, 2026-08-19.
  //
  // Postgres does not accept a bare `ORDER BY ... LIMIT` on a branch of a UNION: without the
  // parentheses it reads them as belonging to the whole union and errors `42601 syntax error at
  // or near "UNION"`. This query has carried that defect since it was introduced (9d33b94), so
  // THE CANONICAL RESOLVER HAS NEVER SUCCEEDED — every call threw, for every respondent.
  //
  // It went unseen because all three callers are hand-run operator scripts (`nin-reconfirm.ts`,
  // `_adoption-number-correction.ts`, and `sms-outreach-list.ts` for the sibling function), and
  // `apps/api/scripts/` is outside tsconfig — the repo's own Pitfall #41 rule, "RUN scripts,
  // don't trust tsc". A SQL syntax error is invisible to tsc in any case: it is only ever found
  // by executing the statement against a real database, which is why 13-51 found it the moment
  // AC2.7's read-back asserted on the resolver instead of on the tables it reads.
  const result = await runner.execute(sql`
    SELECT email, source FROM (
      (SELECT btrim(s.raw_data->>'email') AS email, 'submission' AS source, 1 AS rank
         FROM submissions s
        WHERE s.respondent_id = ${respondentId}
          AND btrim(coalesce(s.raw_data->>'email', '')) <> ''
        ORDER BY s.submitted_at DESC
        LIMIT 1)
      UNION ALL
      (SELECT btrim(m.email), 'magic_link_token', 2
         FROM magic_link_tokens m
        WHERE m.respondent_id = ${respondentId}
          AND btrim(coalesce(m.email, '')) <> ''
        ORDER BY m.created_at DESC
        LIMIT 1)
      UNION ALL
      (SELECT btrim(u.email), 'user_account', 3
         FROM users u
         JOIN respondents r ON r.user_id = u.id
        WHERE r.id = ${respondentId}
          AND btrim(coalesce(u.email, '')) <> ''
        LIMIT 1)
    ) candidates
    ORDER BY rank
    LIMIT 1
  `);

  const row = (result as unknown as { rows: Array<{ email: string; source: ContactEmailSource }> })
    .rows?.[0];
  return row ? { email: row.email, source: row.source } : null;
}

/**
 * Every respondent this system currently has NO email for — the SMS/phone list.
 *
 * Built from the same three sources, so it cannot disagree with
 * `resolveRespondentContactEmail`. A person here is not un-contactable, only un-emailable:
 * outreach has to go by phone, and any flow that assumes email must skip them rather than take a
 * destructive step it cannot follow through.
 */
export async function listRespondentsWithoutEmail(): Promise<
  Array<{ referenceCode: string | null; phoneNumber: string | null; status: string; name: string }>
> {
  const result = await db.execute(sql`
    SELECT r.reference_code, r.phone_number, r.status,
           btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')) AS name
      FROM respondents r
     WHERE r.status <> 'rolled_back'
       AND NOT EXISTS (SELECT 1 FROM submissions s
                        WHERE s.respondent_id = r.id
                          AND btrim(coalesce(s.raw_data->>'email', '')) <> '')
       AND NOT EXISTS (SELECT 1 FROM magic_link_tokens m
                        WHERE m.respondent_id = r.id
                          AND btrim(coalesce(m.email, '')) <> '')
       AND NOT EXISTS (SELECT 1 FROM users u
                        WHERE u.id = r.user_id
                          AND btrim(coalesce(u.email, '')) <> '')
     ORDER BY r.created_at
  `);
  return (
    result as unknown as {
      rows: Array<{
        reference_code: string | null;
        phone_number: string | null;
        status: string;
        name: string;
      }>;
    }
  ).rows.map((r) => ({
    referenceCode: r.reference_code,
    phoneNumber: r.phone_number,
    status: r.status,
    name: r.name,
  }));
}

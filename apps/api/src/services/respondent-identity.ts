/**
 * THE identity match for "is this person already in the register?" — one implementation.
 *
 * WHY IT LIVES HERE AND NOT IN A CALLER (13-49 R21)
 * ------------------------------------------------
 * R13/R17 put this check inside `findOrCreateRespondent`, which felt like the right place: it is
 * the ingestion pipeline every source funnels through. **The public wizard does not funnel through
 * it.** `registration.controller.ts` inserts into `respondents` DIRECTLY and states outright that
 * it bypasses `SubmissionProcessingService.processSubmission`. So a guard written to stop
 * self-registration duplicates never ran on the self-registration path, and the only evidence was
 * a counter reading zero — which looks identical to "nothing needed attaching".
 *
 * It cost a live duplicate to notice: `OSL-2026-Q09HFP` (2026-08-05, pending, no NIN) against
 * `OSL-2026-MGKS01` (2026-05-19, active, with NIN) — same phone, THREE shared name tokens, new
 * record created anyway.
 *
 * THE KEY: same phone AND ≥2 shared name tokens, in any order.
 * ------------------------------------------------------------
 * Exact `first_name`+`last_name` equality does not work here and was tried first: it caught **none**
 * of four real collisions, because people do not re-enter a name the way a form stored it.
 * Surname-first is a normal Nigerian convention and middle names come and go —
 * `Segun Adewale / Akingbade` vs `Akingbade / Segun Adewale` is the same person twice.
 *
 * Two tokens, not one: a parent and child can share a handset AND a surname, and merging two
 * different people is far worse than a duplicate. Validated read-only over the whole registry —
 * every duplicate-phone pair scored ≥2, and **no** pair of genuinely distinct people did.
 *
 * ⚠️ THE THRESHOLD IS ONLY VALID FOR SELF-REGISTRATION DATA — one person, one handset. Field
 * enumeration inverts it: an enumerator walks a compound and registers a whole household on ONE
 * phone, where a shared surname plus one shared given name is ordinary rather than suspicious.
 *
 * ✅ RESOLVED 2026-08-06 (13-4 AC1b), and it was NOT hypothetical — a RED test proved the live
 * code merged `Fatima Aisha Bello` into `Fatima Bello` on a shared phone. The CALLER now exempts
 * staff-captured sources: `submission-processing.service.ts` skips the attach for
 * `enumerator`/`clerk` while still running this query, so the counterfactual stays measurable
 * (`submission_processing.identity_match_exempted_staff_capture`).
 *
 * The exemption lives in the caller, not here, because this function answers only "does the
 * register already hold this person?" — whether that answer should MERGE anything depends on who
 * was in the room, which is the caller's knowledge.
 */
import { sql } from 'drizzle-orm';

/** Minimal shape shared by `db` and a drizzle transaction. */
export interface SqlExecutor {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
}

export interface IdentityCandidate {
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
}

export interface IdentityMatch {
  id: string;
  referenceCode: string | null;
  status: string;
}

/**
 * Find an existing respondent who is almost certainly this same person.
 *
 * Returns null when any identity field is missing — ALL THREE are required. A partial match is
 * where wrong-person merges come from, and the documented trade stands: better one duplicate than
 * two citizens collapsed into one record.
 *
 * `rolled_back` rows are excluded: they are soft-deleted and must not adopt new submissions.
 *
 * ⚠️ CALL THIS ONLY WHEN THE INCOMING SUBMISSION HAS NO NIN. A NIN-carrying row is deduped by
 * FR21's unique index and its own explicit checks; this is the fallback for the case those cannot
 * see, which is exactly the case that produced every duplicate this register has had.
 */
export async function findRespondentByIdentity(
  executor: SqlExecutor,
  candidate: IdentityCandidate,
): Promise<IdentityMatch | null> {
  const { firstName, lastName, phoneNumber } = candidate;
  if (!firstName || !lastName || !phoneNumber) return null;

  const fullName = `${firstName} ${lastName}`;
  const result = await executor.execute(sql`
    WITH incoming AS (
      SELECT ARRAY(
        SELECT t FROM unnest(string_to_array(lower(${fullName}), ' ')) AS t WHERE t <> ''
      ) AS tokens
    )
    SELECT r."id", r."reference_code", r."status"
    FROM "respondents" r, incoming i
    WHERE r."phone_number" = ${phoneNumber}
      AND r."status" <> 'rolled_back'
      AND (
        SELECT count(*) FROM (
          SELECT unnest(ARRAY(
            SELECT t FROM unnest(
              string_to_array(lower(coalesce(r."first_name",'') || ' ' || coalesce(r."last_name",'')), ' ')
            ) AS t WHERE t <> ''
          ))
          INTERSECT
          SELECT unnest(i.tokens)
        ) shared
      ) >= 2
    ORDER BY r."created_at" ASC
    LIMIT 1
  `);

  // Optional-chain the RESULT itself, not just `.rows`. A driver or a test double that returns
  // undefined must yield "no match", never a TypeError — this runs inside the public registration
  // transaction, and an exception here is a citizen turned away (see the fail-open note at the
  // call site).
  const row = (result as
    | { rows?: Array<{ id: string; reference_code: string | null; status: string }> }
    | undefined)?.rows?.[0];
  return row ? { id: row.id, referenceCode: row.reference_code, status: row.status } : null;
}

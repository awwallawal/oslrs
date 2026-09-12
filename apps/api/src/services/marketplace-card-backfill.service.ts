/**
 * Marketplace Card Field Backfill (Story 13-38 AC7 + AC8; Story 13-58)
 *
 * Re-derives the card fields that existing `marketplace_profiles` rows either
 * never had or got wrong, WITHOUT re-running the whole extraction worker.
 *
 * ⚠️ TWO OF THE THREE ARE ANSWER-DERIVED AND ONE IS NOT. `experience_level` and
 * `business_name` come from the respondent's answers; `association_name` comes from
 * `respondents.metadata` and has no dependence on answers at all. That is why the
 * vouch is computed ABOVE the answer-source guard in the loop below — see the
 * [AI-Review][High] note there. Adding a fourth field? Ask which side it is on
 * before putting it anywhere near `answers`.
 *
 *  1. `experience_level` — the pre-13-38 normaliser mapped against a canon no form
 *     ever emitted (`entry`/`1-3`/`4-7`/`8-15`/`15+`), so the questionnaire's real
 *     `less_1` and `over_10` answers normalised to NULL and `7_10` collapsed into
 *     `4-7` (`docs/questionnaire_schema.md:134-141`).
 *  2. `business_name` — a column that did not exist before this story, so every
 *     existing row has NULL even where the person volunteered a trading name.
 *
 * Answers are read from the respondent's LATEST submission `raw_data`, falling
 * back to `respondents.adopted_draft_answers` (Story 13-49 D2 rows were created
 * bare by 9-28 and carry their answers there, not in a submission) — otherwise
 * those rows would be silently skipped and the run would report a clean sweep it
 * never made.
 *
 * DRY-RUN IS THE DEFAULT. The dry-run count is the evidence the run actually fired
 * (docs/runbooks/backfill-operator-residuals.md); `apply: true` is the only path
 * that writes.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  normaliseAssociationName,
  normaliseBusinessName,
  normaliseMarketplaceExperienceLevel,
} from '@oslsr/types';

/** What one backfill run did (or, in dry-run, would do). */
export interface MarketplaceCardBackfillResult {
  /** True when nothing was written. */
  dryRun: boolean;
  /** marketplace_profiles rows examined. */
  scanned: number;
  /** Rows whose experience_level would change (includes NULL -> bucket). */
  experienceChanged: number;
  /** Rows that gain (or change) a business_name. */
  businessNameChanged: number;
  /**
   * Story 13-58 — rows that gain (or change) an association_name.
   *
   * The extraction worker is the go-forward write path, but it only fires on a
   * submission, so a respondent who ALREADY holds a profile never revisits it. On
   * prod that is the eleven people the AFAN import MATCHED: the vouch is on their
   * respondent row and their card has no badge. Without this the badge ships and
   * fires for nobody who exists today.
   */
  associationNameChanged: number;
  /** Rows needing at least one change — the write set. */
  needsUpdate: number;
  /** Rows actually written. ALWAYS 0 in dry-run. */
  updated: number;
  /** Rows whose answers came from respondents.adopted_draft_answers. */
  fromAdoptedAnswers: number;
  /** Rows with no answer source at all (no submission, no adopted answers). */
  noAnswerSource: number;
  /** Rows with a years_experience answer that cannot be bucketed without guessing. */
  unresolvedExperience: number;
  /**
   * [AI-Review][Medium] 2026-08-18 — rows whose business_name CONTAINS the
   * respondent's own first or last name ("Adekemi Fashion House"). Reported,
   * NEVER suppressed: whether a self-named signboard may publish on a card the
   * consent copy calls anonymous is Awwal's ruling, not a backfill's. Surfacing
   * it in the PREVIEW is what makes that ruling an informed one — see R7.
   */
  businessNameLikePersonName: number;
}

interface CandidateRow {
  id: string;
  experience_level: string | null;
  business_name: string | null;
  /** What the profile currently holds (Story 13-58). */
  association_name: string | null;
  /** What the respondent's metadata says — 13-67's write (Story 13-58). */
  respondent_association_name: string | null;
  raw_data: Record<string, unknown> | null;
  adopted_draft_answers: Record<string, unknown> | null;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Review M4 — does a trading name carry the person's own name? Substring match,
 * case-insensitive, on name parts of 3+ characters (shorter parts collide with
 * ordinary words). Detection only: nothing here changes what gets written.
 */
export function businessNameCarriesPersonName(
  businessName: string | null,
  firstName: string | null,
  lastName: string | null,
): boolean {
  if (!businessName) return false;
  const haystack = businessName.toLowerCase();
  return [firstName, lastName]
    .filter((part): part is string => typeof part === 'string' && part.trim().length >= 3)
    .some((part) => haystack.includes(part.trim().toLowerCase()));
}

/**
 * Recompute `experience_level` + `business_name` for marketplace profiles.
 *
 * @param options.apply       When true, writes the changes. Omitted/false = dry-run.
 * @param options.profileIds  Restrict the sweep to these marketplace_profiles ids.
 *   Omitted = every row (the operator's intent for the real run). Tests MUST pass
 *   it — see the scoping note below.
 */
export async function backfillMarketplaceCardFields(
  options: { apply?: boolean; profileIds?: string[] } = {},
): Promise<MarketplaceCardBackfillResult> {
  const apply = options.apply === true;

  // [AI-Review][Medium] 2026-08-18 — an UNSCOPED `apply: true` rewrites every
  // marketplace profile in whatever database it is pointed at. That is correct for
  // the operator's one-shot prod run, and a live grenade inside a test suite:
  // vitest runs test FILES in parallel, so an unscoped apply in one file mutates
  // rows another file seeded and is asserting on. Scoping is therefore a parameter,
  // not a convention — the real-DB smoke passes its own ids.
  //
  // Each id is its own bound parameter (`sql.join`), NOT an array binding: drizzle
  // spreads a JS array into one param per element, so `= ANY(${ids}::uuid[])`
  // reaches postgres as a lone uuid cast to uuid[] and throws 22P02 "malformed
  // array literal". The mocked unit test could not see that — the real-DB smoke
  // caught it on the first run.
  // ⚠️ [AI-Review][Medium] 2026-08-18 (re-review) — an EMPTY array is not "no
  // scope", it is "scope to nothing". The earlier `scopeIds && scopeIds.length > 0`
  // collapsed `[]` into the same branch as `undefined`, so a caller whose id list
  // computed empty (a filter that matched nothing, a seed that returned no rows)
  // silently got a FULL-TABLE sweep — with `apply: true`, the exact "live grenade"
  // the scoping parameter was added to prevent. Distinguish the two explicitly.
  const scopeIds = options.profileIds;
  if (scopeIds !== undefined && scopeIds.length === 0) {
    return {
      dryRun: !apply,
      scanned: 0,
      experienceChanged: 0,
      businessNameChanged: 0,
      associationNameChanged: 0,
      needsUpdate: 0,
      updated: 0,
      fromAdoptedAnswers: 0,
      noAnswerSource: 0,
      unresolvedExperience: 0,
      businessNameLikePersonName: 0,
    };
  }
  const scopeClause =
    scopeIds !== undefined
      ? sql`WHERE mp.id IN (${sql.join(scopeIds.map((id) => sql`${id}::uuid`), sql`, `)})`
      : sql``;

  const result = await db.execute(sql`
    SELECT
      mp.id,
      mp.experience_level,
      mp.business_name,
      mp.association_name,
      -- Story 13-58 — the vouch as 13-67 wrote it, on the RESPONDENT's own metadata.
      -- Deliberately NOT read from the batch table: the operator note stored there is
      -- prose ("...WhatsApp intake, 56 clean rows of 70"), not an accountable body's
      -- name. Nor from any source column -- AC4 keys on this name's presence alone.
      -- A test asserts the other tables by name, so this comment does not name them.
      r.metadata ->> 'association_name' AS respondent_association_name,
      (
        SELECT s.raw_data
        FROM submissions s
        WHERE s.respondent_id = mp.respondent_id
        ORDER BY s.submitted_at DESC, s.id DESC
        LIMIT 1
      ) AS raw_data,
      -- Story 13-49 AC4 keeps these answers INSIDE the metadata JSONB, not in a
      -- column of their own (respondents.ts:165 documents the field, :248 is the
      -- column). Reading r.adopted_draft_answers throws 42703 -- caught by the
      -- real-DB smoke, invisible to the mocked unit tests.
      r.metadata -> 'adopted_draft_answers' AS adopted_draft_answers,
      -- Read ONLY to count self-named signboards for the operator (see
      -- businessNameLikePersonName). Never written anywhere, never compared into a
      -- fallback -- AC8.2's no-person-name rule is unaffected.
      r.first_name,
      r.last_name
    FROM marketplace_profiles mp
    LEFT JOIN respondents r ON r.id = mp.respondent_id
    ${scopeClause}
    ORDER BY mp.id
  `);

  const rows = result.rows as unknown as CandidateRow[];

  const summary: MarketplaceCardBackfillResult = {
    dryRun: !apply,
    scanned: rows.length,
    experienceChanged: 0,
    businessNameChanged: 0,
    associationNameChanged: 0,
    needsUpdate: 0,
    updated: 0,
    fromAdoptedAnswers: 0,
    noAnswerSource: 0,
    unresolvedExperience: 0,
    businessNameLikePersonName: 0,
  };

  for (const row of rows) {
    // ⚠️ [AI-Review][High] 2026-09-08 — THE VOUCH IS COMPUTED BEFORE THE ANSWER
    // GUARD, and that ordering is load-bearing. It used to sit below, after
    // `if (!answers) { noAnswerSource++; continue; }` — so a profile whose
    // respondent has no submission `raw_data` AND no adopted answers had its
    // association name silently dropped, and was not even COUNTED: the operator's
    // dry-run printed `association_name add/fixed 0` and read as a clean sweep.
    // (Measured on a probe row: associationNameChanged 0, updated 0,
    // noAnswerSource 1, with 'AFAN' sitting on the respondent.)
    //
    // The category error is the coupling itself. `experience_level` and
    // `business_name` are DERIVED FROM ANSWERS, so no answers means nothing to
    // derive. The vouch is not: it is read from `r.metadata->>'association_name'`
    // and has no dependence on answers whatsoever. Rows with no answer source are
    // real — the counter exists because they are — and the import path wrote only
    // the respondent until Story 13-2 AC3.4 added the submission row
    // (`import.service.ts:555-573`), so batches predating that change are exactly
    // the population that carries a vouch and no answers.
    const nextAssociationName = normaliseAssociationName(row.respondent_association_name);
    // Story 13-58 — ADD or CORRECT, never subtract, for the third time in this file
    // and for the strongest reason of the three. An association's vouch is a claim a
    // NAMED body made about a person; this one-shot reads the respondent row and
    // nothing else, so a null here means "no name is recorded", never "the
    // association withdrew". Blanking it would delete a disclosure the card is
    // currently making, with no event anywhere recording why it went.
    const associationNameDiffers =
      nextAssociationName !== null && nextAssociationName !== row.association_name;

    const answers = row.raw_data ?? row.adopted_draft_answers ?? null;
    if (!answers) summary.noAnswerSource++;

    // The two 13-38 fields stay strictly answer-derived: when there is no answer
    // source there is nothing to compute for them, and every 13-38 counter below
    // behaves exactly as it did before this fix.
    let nextExperience: ReturnType<typeof normaliseMarketplaceExperienceLevel> = null;
    let nextBusinessName: string | null = null;

    if (answers) {
      if (!row.raw_data) summary.fromAdoptedAnswers++;

      // Same key precedence as the extraction worker's getExperienceRaw.
      const rawExperience =
        answers['years_experience'] ?? answers['experience'] ?? answers['exp_years'] ?? answers['experience_level'];
      nextExperience = normaliseMarketplaceExperienceLevel(
        rawExperience == null ? null : String(rawExperience),
      );
      if (rawExperience != null && String(rawExperience).trim() !== '' && nextExperience === null) {
        summary.unresolvedExperience++;
      }

      nextBusinessName = normaliseBusinessName(answers['business_name']);

      // Count self-named signboards on what this row WILL hold after the run, so the
      // PREVIEW answers "how many cards would publish a person's own name?" before
      // anyone writes. Detection only — the value itself is untouched either way.
      if (businessNameCarriesPersonName(nextBusinessName ?? row.business_name, row.first_name, row.last_name)) {
        summary.businessNameLikePersonName++;
      }
    }

    // ⚠️ [AI-Review][High] 2026-08-17 — the `!== null` half is LOAD-BEARING, not
    // defensive noise. Without it, any row whose current answer cannot be bucketed
    // (an old-canon-only label like `senior`; free text; or a latest submission
    // that simply omits `years_experience` while an earlier one had it) had its
    // VALID stored bucket overwritten with NULL — deleting a hero stat from a card
    // that rendered correctly before this "repair" ran. Every legacy value renders
    // fine via `experienceStatFor`'s legacy table, so there is nothing to gain by
    // nulling one and a real stat to lose. This backfill only ever ADDS or
    // CORRECTS; it never subtracts.
    const experienceDiffers = nextExperience !== null && nextExperience !== row.experience_level;
    // Same rule for the trading name, and the same reason: ADD or CORRECT only.
    //
    // ⚠️ [AI-Review][Medium] 2026-08-17 — this DIVERGES from the live extraction
    // worker, deliberately. The worker writes whatever the current answers say,
    // including null, so a resubmission that drops `business_name` retracts it
    // going forward — that is correct for the live path, which sees the whole
    // submission. This is a one-shot catch-up for rows written before the column
    // existed; it reads only the LATEST submission, so a null here means "this
    // submission has none", NOT "the person retracted it". Honouring that as a
    // retraction would delete names the live path legitimately stored from another
    // submission. (An earlier version of this comment blamed a "self-service edit
    // path" — no such path exists: `ProfileEditPayload` carries bio + portfolioUrl
    // only. The reason above is the real one.)
    const businessNameDiffers = nextBusinessName !== null && nextBusinessName !== row.business_name;

    if (experienceDiffers) summary.experienceChanged++;
    if (businessNameDiffers) summary.businessNameChanged++;
    if (associationNameDiffers) summary.associationNameChanged++;
    if (!experienceDiffers && !businessNameDiffers && !associationNameDiffers) continue;

    summary.needsUpdate++;
    if (!apply) continue;

    // ⚠️ BOTH columns are written per-field, never from the recomputed value
    // unconditionally. The guards above decide WHETHER to update the row; this
    // decides WHAT each column gets. Writing `${nextExperience}` here would blank
    // a valid stored bucket whenever the row was updated for the OTHER field —
    // the null-guard on `experienceDiffers` alone does not prevent that, because
    // a business_name-only update still carries an experience_level assignment.
    //
    // ⚠️ [AI-Review][High] 2026-08-18 — `updated_at` is deliberately NOT touched.
    // Default marketplace browse is `ORDER BY mp.updated_at DESC, mp.id DESC`
    // (marketplace.service.ts:158) and the pagination cursor is keyed on the same
    // column (:132). Stamping now() here would hoist every repaired row to the top
    // of the public marketplace in uuid order and sink every correct one — the
    // ordering visitors see would become "what the backfill happened to touch"
    // rather than "recently updated". `updated_at` means "this profile changed";
    // a data repair the worker should have done correctly in the first place is
    // not a profile change. The FTS trigger still refires (it is BEFORE INSERT OR
    // UPDATE), so search_vector stays consistent without the timestamp.
    await db.execute(sql`
      UPDATE marketplace_profiles
      SET
        experience_level = ${experienceDiffers ? nextExperience : row.experience_level},
        business_name = ${businessNameDiffers ? nextBusinessName : row.business_name},
        association_name = ${associationNameDiffers ? nextAssociationName : row.association_name}
      WHERE id = ${row.id}::uuid
    `);
    summary.updated++;
  }

  return summary;
}

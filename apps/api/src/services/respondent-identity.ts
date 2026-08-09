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
 *
 * 13-53 — AND THE SAME QUESTION HAS A SECOND DIRECTION, WHICH WAS THE SEAM
 * ------------------------------------------------------------------------
 * R21 shipped with the instruction "call this ONLY when the incoming submission has no NIN",
 * because a NIN-carrying row is deduped by FR21's unique index. That is true and it is not enough.
 * FR21 matches on NIN EQUALITY, and the record it needs to find **has no NIN to match against** —
 * so a person who registered without their NIN and came back with it fell between the two
 * mechanisms and got a second record. The journey is not an edge case: it is the one the whole
 * pending-NIN design asks people to take.
 *
 * It cost a live duplicate to notice, again, two hours apart and AFTER R21 deployed:
 * `OSL-2026-56C9PG` (no NIN, 15:22) and `OSL-2026-W1PS38` (NIN, 17:38) — same phone, two shared
 * name tokens, one person.
 *
 * So the finder now takes a DIRECTION (`requireNoNin`) rather than a prohibition, and the promote
 * lives here beside it. Both directions share ONE token key deliberately: a second copy of the
 * matching rule is how these two mechanisms grew a seam between them in the first place.
 */
import { sql } from 'drizzle-orm';
import { AppError, type GuardianData } from '@oslsr/utils';
import type { RespondentStatus } from '../db/schema/respondents.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from './audit.service.js';

/** Minimal shape shared by `db` and a drizzle transaction. */
export interface SqlExecutor {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
}

/**
 * 13-53 (review H1) — the ONLY statuses a NIN-arrival promote may target.
 *
 * The first cut excluded `rolled_back` and nothing else, which is far wider than the journey this
 * story is about and wider than every sibling promote: `tryRaceResolutionMerge`, the magic-link
 * `completeNin`, and `draft-adoption/promote-nin` all scope to `pending_nin_capture`.
 *
 * ⚠️ `imported_unverified` IS THE ONE THAT MATTERS, and it is not hypothetical. Those rows are
 * low-trust secondary-data imports deliberately held in an honest unverified stratum, and
 * `PIPELINE_EXCLUDED_STATUSES` keeps them out of fraud-detection / marketplace-extraction BY
 * STATUS. Promoting one to `active` would launder the stratum AND re-open that gate — and because
 * the finder orders `created_at ASC` and imported rows are the OLDEST in the register, an imported
 * row would be picked *in preference to* the legitimate pending row sitting right beside it.
 *
 * The three that remain are the NIN-lifecycle statuses, where `→ active` is the correct and
 * intended transition:
 *   • `pending_nin_capture` — the at-risk cohort this story exists for
 *   • `nin_unavailable`     — someone who said they had no NIN and has now found it
 *   • `active`              — a NIN-less active row (13-49 adoption, R21 attaches); already active,
 *                             so the status write is a no-op and only the NIN is filled
 *
 * A miss here is not a merge into the wrong row — it is a fall-through to a fresh insert, which is
 * the documented trade this whole file is built on: better one repairable duplicate than a record
 * that quietly changes what it claims to be.
 */
export const NIN_ARRIVAL_PROMOTABLE_STATUSES = [
  'pending_nin_capture',
  'nin_unavailable',
  'active',
] as const;

/**
 * ONE source of truth for the list, interpolated as a raw fragment in both the lookup and the
 * UPDATE. Compile-time constants chosen by this module — no user input goes near it. Two copies of
 * the list is how the two mechanisms in this story grew a seam in the first place.
 */
const promotableStatusList = sql.raw(
  NIN_ARRIVAL_PROMOTABLE_STATUSES.map((s) => `'${s}'`).join(', '),
);

/**
 * 13-55 — every route that may promote a respondent to `active`, as a closed union.
 *
 * WHY A UNION AND NOT `string`. 13-53 required that "the audit trail must still say WHICH route
 * promoted someone", and when this story measured the tree that requirement was ALREADY BREACHED:
 * the wizard controller and the queue service both wrote `nin_arrival_identity_match`, from two
 * different code paths, because a free-form string cannot stop a second caller reusing the first
 * caller's label. The type now can. Adding a route means adding a member here, which is the point
 * at which someone has to decide what it is called.
 *
 * ⚠️ These strings are QUERIED. `audit_logs.details->>'trigger'` is how a promote is attributed —
 * `reconcile-nin-promotion-audit.ts` and 13-44's digest both read it. Renaming a member orphans
 * every historical row carrying the old value, so a rename is a data decision, not a refactor.
 * `nin_arrival_wizard` is new in 13-55; the queue kept `nin_arrival_identity_match` precisely
 * because its rows already exist on prod.
 */
export type PromoteTrigger =
  /** Path 1 — the 9-12 magic-link ladder. Evidence: a single-use token we issued. */
  | 'magic_link_complete_nin'
  /** Path 2 — strict `lower(first)+lower(last)+phone` equality in the ingestion queue. */
  | 'race_resolution_merge'
  /** Path 3 — the public wizard, phone + >=2 name tokens (13-53). NEW NAME in 13-55. */
  | 'nin_arrival_wizard'
  /** Path 3b — the same fuzzy key on the queue path. KEEPS its name; prod rows exist. */
  | 'nin_arrival_identity_match'
  /** Path 4 — 13-49 AC14, a NIN recovered from the person's own abandoned draft. */
  | 'draft_adoption_ac14'
  /** Path 5 — 9-61, a signed-in respondent completing their own NIN from the dashboard. */
  | 'authenticated_dashboard_nin';

export interface IdentityCandidate {
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
}

export interface IdentityMatch {
  id: string;
  referenceCode: string | null;
  status: string;
  /**
   * 13-55 — present on a PROMOTE result, absent on a lookup result.
   *
   * The magic-link route echoes the promoted row's `source` back to the caller, and it used to get
   * it from its own `.returning({ id, source })`. Optional rather than required so
   * `findRespondentByIdentity` — which has no reason to select it — keeps the same return type.
   */
  source?: string;
}

export interface IdentityLookupOptions {
  /**
   * 13-53 (AC1.1/AC1.3) — restrict the search to respondents holding NO NIN.
   *
   * Set this when the INCOMING submission carries a NIN that matched nothing. Two rows that both
   * hold a NIN and differ are a genuine identity conflict for a human to resolve (13-49's
   * `same-person-different-NIN` class) — never a silent merge — so the only safe target of a
   * NIN-arrival promote is a row with nothing to contradict.
   *
   * ⚠️ It ALSO narrows the search to `NIN_ARRIVAL_PROMOTABLE_STATUSES` (review H1). The lookup and
   * the UPDATE must agree about what is promotable, or the finder hands back an
   * `imported_unverified` row the UPDATE will refuse — and, worse, hands it back INSTEAD of the
   * pending row beside it, because `LIMIT 1` with `created_at ASC` means the first eligible row is
   * the only one considered. Filtering here makes the oldest *eligible* row the answer.
   *
   * Left off (the R21 default) the search spans every non-`rolled_back` row, which is right for
   * the no-NIN direction: the incoming row has nothing to conflict WITH, and an ATTACH changes no
   * status, so it cannot launder a stratum the way a promote can.
   */
  requireNoNin?: boolean;
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
 * TWO CALLERS, TWO DIRECTIONS:
 *   • incoming row has NO NIN → call with no options; on a match, ATTACH (the incoming row knows
 *     less than the record we hold, so the existing row wins on every field).
 *   • incoming row HAS a NIN that matched nothing → call with `{ requireNoNin: true }`; on a
 *     match, PROMOTE via `promoteRespondentWithArrivingNin` (the incoming row adds the one thing
 *     the record was missing).
 *
 * ⚠️ A match is not by itself permission to merge. `submission-processing.service.ts` exempts
 * staff-captured sources in BOTH directions — an enumerator walking a compound registers a
 * household on one handset, where a shared surname plus one given name is ordinary (13-4 AC1b).
 */
export async function findRespondentByIdentity(
  executor: SqlExecutor,
  candidate: IdentityCandidate,
  options: IdentityLookupOptions = {},
): Promise<IdentityMatch | null> {
  const { firstName, lastName, phoneNumber } = candidate;
  if (!firstName || !lastName || !phoneNumber) return null;

  // Interpolated as a raw fragment, not a bound parameter — it is a compile-time constant chosen
  // by a boolean, so there is no user input anywhere near it.
  const ninlessOnly = options.requireNoNin
    ? sql`AND r."nin" IS NULL AND r."status" IN (${promotableStatusList})`
    : sql``;

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
      ${ninlessOnly}
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

/**
 * 13-53 (AC1.2) — a NIN arrived for someone we already hold without one. Fill it IN PLACE.
 *
 * "Attach and promote": the person keeps the record and the reference code they were already
 * given, and gains the NIN they came back to supply. Minting a second row would hand them a second
 * number for the same identity — the precise harm `56C9PG`/`W1PS38` demonstrates, where the code
 * in the citizen's hands since 15:22 stopped describing the record that now holds their NIN.
 *
 * THE `nin IS NULL` PREDICATE IS LOAD-BEARING, TWICE OVER (AC1.3):
 *   • It is the refusal, in SQL rather than in a caller's branch — a row that already holds a NIN
 *     cannot be overwritten even by a caller that passes the wrong id. Two different NINs are a
 *     conflict for a human, never a silent merge.
 *   • It makes the UPDATE its own concurrency control, exactly as `tryRaceResolutionMerge` does:
 *     two simultaneous arrivals cannot both win, and the loser sees zero rows and falls through to
 *     a fresh insert rather than clobbering the winner.
 *
 * …AND SO IS THE STATUS ALLOW-LIST (review H1). `NIN_ARRIVAL_PROMOTABLE_STATUSES` is enforced here
 * as well as in the lookup, for the same reason the `nin IS NULL` predicate is: a future caller
 * passing an id it found some other way must not be able to promote an `imported_unverified` row
 * into `active`. The lookup chooses; this refuses.
 *
 * `status` is promoted to `active` in the same statement: a row whose NIN has arrived is no longer
 * `pending_nin_capture`, and leaving it pending would keep the person in the reminder ladder they
 * just walked out of. (For an already-`active` row it is a no-op, which is why `active` is on the
 * allow-list at all — only the NIN is filled.)
 *
 * WHAT ELSE THE ARRIVING SUBMISSION IS ALLOWED TO CONTRIBUTE — ALL NULL-FILL, NEVER CLOBBER:
 *   • `guardian` (review H2) — folded into `metadata` by the SAME JSONB `||` merge
 *     `tryRaceResolutionMerge` uses. 9-55 M1 added it there precisely because a promote path was
 *     dropping an under-15's consent record; this path must not re-open that hole. The caller is
 *     still responsible for the `MINOR_GUARDIAN_CONSENT_CAPTURED` audit.
 *   • `fallbackReferenceCode` (review M1) — `COALESCE`d in. A promote performs no INSERT, so if
 *     the matched row's code is NULL the caller would otherwise echo a freshly minted code that
 *     was never written to any row. Handing someone a number that resolves to nothing is the exact
 *     harm `56C9PG` suffered, in a new costume.
 *   • `dateOfBirth` / `lgaId` (review L3) — `COALESCE`d in. Unlike the no-NIN ATTACH, this
 *     submission is a COMPLETE registration, so it can genuinely know things the held record does
 *     not. `COALESCE` means it can only fill blanks, never overwrite what the person told us
 *     first. A promoted record that keeps a NULL `lga_id` drops out of every LGA-joined analytic.
 *
 * Returns the promoted row (with its ORIGINAL reference code) or null when nothing was updated —
 * lost race, already promoted, or a row whose status this path may not touch.
 */
export async function promoteRespondentWithArrivingNin(
  executor: SqlExecutor,
  args: {
    respondentId: string;
    nin: string;
    guardian?: GuardianData | null;
    fallbackReferenceCode?: string | null;
    dateOfBirth?: string | null;
    lgaId?: string | null;
    /**
     * 13-55 — the status scope, as an INPUT rather than a policy baked into the module.
     *
     * Defaults to `NIN_ARRIVAL_PROMOTABLE_STATUSES`, which is what makes this parameter additive:
     * the 13-53 callers pass nothing and behave exactly as they did. The point of the parameter is
     * that a caller with STRONGER evidence is allowed to say so, and a caller with weaker evidence
     * is allowed to be narrower — 13-49 AC14 passes `['nin_unavailable']` alone, because a
     * months-old draft must not promote a row the 9-12 ladder is actively working.
     *
     * ⚠️ It is NOT one policy. Flattening these to a single list would either loosen the fuzzy
     * paths or tighten the token path, and the token path's width is what the 9-12 ladder runs on.
     *
     * ⚠️ TYPED `RespondentStatus[]`, NOT `string[]` (13-55 review M1). As `string[]` a typo was a
     * SILENT no-op: `'pending_nin_captur'` passes the runtime charset check below, interpolates
     * into valid SQL, matches no row, and the promote returns `null` — which every caller reads as
     * "already promoted". The magic-link route would have answered HTTP 200 `alreadyPromoted:true`
     * to a person whose NIN was never written. The compiler is the only thing that catches that
     * before it ships; the runtime check below is defence-in-depth for the raw interpolation, not
     * the primary guard.
     */
    allowedStatuses?: readonly RespondentStatus[];
    /**
     * 13-55 — caller-supplied metadata keys, folded by the SAME JSONB `||` merge as `guardian`.
     *
     * Exists so 13-49 AC14's provenance markers (`nin_promoted_by` / `nin_promoted_at` /
     * `nin_promoted_from_draft_id`) survive the move onto this implementation. They are the
     * rollback key for that programme, so losing them in a refactor would cost more than the
     * refactor saves.
     */
    metadata?: Record<string, unknown>;
  },
): Promise<IdentityMatch | null> {
  const {
    respondentId,
    nin,
    guardian,
    fallbackReferenceCode,
    dateOfBirth,
    lgaId,
    allowedStatuses,
    metadata,
  } = args;
  // Mirrors the finder's short-circuit: a missing field must never widen the write.
  if (!respondentId || !nin) return null;

  /**
   * 13-55 — the status list is interpolated RAW (it always was), so now that it can come from a
   * caller it is validated rather than trusted. `RespondentStatus` already makes a bad value a
   * COMPILE error (review M1); this is the second line, guarding the one thing the type cannot —
   * a value that reaches here through an `as` cast or an untyped boundary.
   *
   * Review M2 — `AppError`, never a raw `Error`: this runs inside a caller's `db.transaction`, and
   * a raw throw surfaces as an unclassified 500 with no code for the error handler to key on.
   */
  const statusFragment = allowedStatuses
    ? sql.raw(
        allowedStatuses
          .map((s) => {
            if (!/^[a-z_]+$/.test(s)) {
              throw new AppError(
                'PROMOTE_INVALID_STATUS_SCOPE',
                `Refusing to interpolate status '${s}' — statuses are compile-time enum members, ` +
                  `never user input`,
                500,
              );
            }
            return `'${s}'`;
          })
          .join(', '),
      )
    : promotableStatusList;

  // JSONB `||` preserves every sibling key (defer_reason_nin, reminder_state, adopted_by…) while
  // setting `guardian` — the same merge, and the same reasoning, as `tryRaceResolutionMerge`.
  // 13-55 folds any caller `metadata` into the SAME object, so there is still exactly one merge
  // and sibling keys survive both contributions.
  const metadataPatch: Record<string, unknown> | null =
    guardian || metadata ? { ...(metadata ?? {}), ...(guardian ? { guardian } : {}) } : null;
  const guardianSet = metadataPatch
    ? sql`,
        "metadata" = COALESCE("metadata", '{}'::jsonb) || ${JSON.stringify(metadataPatch)}::jsonb`
    : sql``;
  // Each of these is a NULL-FILL. `COALESCE(col, $n)` cannot overwrite a value the record already
  // holds, so none of them can turn a promote into a silent edit of someone's identity.
  const referenceCodeSet = fallbackReferenceCode
    ? sql`,
        "reference_code" = COALESCE("reference_code", ${fallbackReferenceCode})`
    : sql``;
  const dateOfBirthSet = dateOfBirth
    ? sql`,
        "date_of_birth" = COALESCE("date_of_birth", ${dateOfBirth})`
    : sql``;
  const lgaIdSet = lgaId
    ? sql`,
        "lga_id" = COALESCE("lga_id", ${lgaId})`
    : sql``;

  const result = await executor.execute(sql`
    UPDATE "respondents"
    SET "nin" = ${nin},
        "status" = 'active',
        "updated_at" = now()${guardianSet}${referenceCodeSet}${dateOfBirthSet}${lgaIdSet}
    WHERE "id" = ${respondentId}
      AND "nin" IS NULL
      AND "status" IN (${statusFragment})
    RETURNING "id", "reference_code", "status", "source"
  `);

  // Same defensive read as the finder — a driver or test double returning undefined must mean
  // "nothing promoted", never a TypeError inside a live registration transaction.
  const row = (result as
    | {
        rows?: Array<{
          id: string;
          reference_code: string | null;
          status: string;
          source?: string;
        }>;
      }
    | undefined)?.rows?.[0];
  return row
    ? {
        id: row.id,
        referenceCode: row.reference_code,
        status: row.status,
        source: row.source,
      }
    : null;
}

/**
 * 13-55 — THE SANCTIONED PROMOTE. Every route that flips a respondent to `active` comes here.
 *
 * WHY THIS EXISTS, when `promoteRespondentWithArrivingNin` above already does the write.
 * ---------------------------------------------------------------------------------------
 * When this story measured the tree there were FIVE promote implementations, not the three its
 * shell claimed, and they disagreed about things no caller had ever decided on purpose:
 *
 *   • THREE of six call sites wrote their audit with `AuditService.logAction`, which returns
 *     `void` and therefore cannot be awaited — so a promote could commit while its audit row was
 *     still in flight. That is not theoretical: the 13-49 AC14 batch wrote 10 promotions and 9
 *     audit rows for exactly this reason ([[pattern-void-helper-loses-last-batch-row]]).
 *     `tryRaceResolutionMerge` was worse — it had no transaction at all.
 *   • TWO of them wrote the SAME `trigger` from different code paths, so the audit trail could not
 *     answer "which route promoted this person?" — the one thing 13-53 said it must always answer.
 *   • ONE of them (`MeService.completeNinAuthenticated`) wrote a DIFFERENT ACTION entirely, so a
 *     respondent completing their NIN from their own dashboard was invisible to
 *     `reconcile-nin-promotion-audit.ts` and to 13-44's promote digest. A whole route promoted
 *     silently, and every monitor read zero and looked correct.
 *
 * None of those is a policy difference. They are five people solving the same problem on five
 * different days. THE POLICY DIFFERENCES ARE REAL and stay with the callers, as parameters:
 * `allowedStatuses` (a magic-link token is stronger evidence than a fuzzy name match and keeps a
 * wider scope) and the identity key (which is the caller's business entirely — this function is
 * handed an id it does not second-guess).
 *
 * THE AUDIT IS WRITTEN IN THE CALLER'S TRANSACTION, always. A promote that exists without its
 * evidentiary row is precisely what NDPA forensics cannot have, and making it structurally
 * impossible is worth more than any of the individual fixes.
 *
 * ⚠️ `promoteRespondentWithArrivingNin` remains exported ONLY because its 13 unit tests bind to it
 * directly and 13-55 AC2.1 forbids editing them. It is the SQL primitive, not an entry point —
 * production code must call THIS.
 *
 * ⚠️ REVIEW H1 — THAT SENTENCE WAS UNENFORCED WHEN IT WAS WRITTEN. It claimed
 * `respondent-promotion-census.test.ts` pinned it as a source-level assertion; the test did no such
 * thing, and the review proved it by adding a production file that called the primitive directly on
 * `db` — a real promote, no audit row — which left the census 9/9 GREEN. A comment saying "do not
 * call this" really has never stopped anyone, and neither had this one. The assertion now exists
 * (`AC1.4 — the primitive has no production callers`) and was RED-verified with the same canary.
 */
export async function promoteRespondentToActive(
  tx: SqlExecutor & Parameters<typeof AuditService.logActionTx>[0],
  args: {
    respondentId: string;
    nin: string;
    /** WHICH ROUTE. Typed as a closed union so a new caller cannot silently reuse an old label. */
    trigger: PromoteTrigger;
    actorId?: string | null;
    /** Review M1 — `RespondentStatus`, not `string`: a typo here must not be a silent no-op. */
    allowedStatuses?: readonly RespondentStatus[];
    guardian?: GuardianData | null;
    fallbackReferenceCode?: string | null;
    dateOfBirth?: string | null;
    lgaId?: string | null;
    metadata?: Record<string, unknown>;
    /** Route-specific audit context (tokenId, draftId, submissionUid, source…). */
    auditDetails?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  },
): Promise<IdentityMatch | null> {
  const { trigger, actorId, auditDetails, ipAddress, userAgent, ...promoteArgs } = args;

  const promoted = await promoteRespondentWithArrivingNin(tx, promoteArgs);

  // Nothing updated — lost race, already promoted, or a status this caller may not touch. No row
  // changed, so there is nothing to attest to; writing an audit row here would assert a promote
  // that did not happen.
  if (!promoted) return null;

  await AuditService.logActionTx(tx, {
    actorId: actorId ?? null,
    action: AUDIT_ACTIONS.PENDING_NIN_PROMOTED,
    targetResource: AUDIT_TARGETS.RESPONDENT,
    targetId: promoted.id,
    // `referenceCode` is read from the PROMOTED row, not from whatever the caller looked up
    // beforehand: `fallbackReferenceCode` may have filled a NULL during this very UPDATE, and an
    // audit row citing the pre-promote value would describe a record that no longer exists. The
    // caller cannot get this right before the write, so it is not asked to.
    details: { ...(auditDetails ?? {}), trigger, referenceCode: promoted.referenceCode },
    ipAddress,
    userAgent,
  });

  return promoted;
}

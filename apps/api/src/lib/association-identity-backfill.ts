/**
 * Story 13-67 AC3 — backfill the vouching body onto the two association batches
 * that predate the `association_name` column.
 *
 * ── Why this lives in `src/` and not in `scripts/` ───────────────────────────
 * `scripts/` is outside tsconfig: it is RUN, never type-checked (project pitfall
 * #41). This is a production data operation on 8,278 live rows, so the part that
 * builds the SQL and compares the counts belongs where `tsc` and vitest can both
 * see it. `scripts/_backfill-association-identity.ts` is the thin I/O wrapper.
 *
 * ── The one rule this file exists to enforce ─────────────────────────────────
 * ⛔ MERGE, NEVER REPLACE. `respondents.metadata` on these rows already carries
 * `normalisation_warnings` (the R2 identity-ambiguity flags), `imported_email`, and
 * `import_extra.full_name` — the verbatim source string that 13-2's R-A6 depends on
 * to recover the 5,301 NCARES rows whose name ORDER is unreliable. An
 * `UPDATE … SET metadata = '{"association_name":…}'` would destroy all of it
 * silently, and the loss would be undetectable afterwards because those flags are
 * the only record that the ambiguity ever existed.
 *
 * The write is `COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(...)`, which is
 * also idempotent: a second run produces the same document, so a re-run after a
 * partial failure is safe.
 */

import { createHash } from 'node:crypto';
import { asc, eq, gt, sql } from 'drizzle-orm';
import type { db as Database } from '../db/index.js';
import { respondents } from '../db/schema/respondents.js';
import { importBatches } from '../db/schema/import-batches.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from '../services/audit.service.js';
import type { IngestDisposition } from '../services/import/ingest-plan.js';

/** A db handle or a transaction handle — both satisfy the reads below. */
export type BackfillDb =
  | typeof Database
  | Parameters<Parameters<(typeof Database)['transaction']>[0]>[0];

export interface AssociationBatchIdentity {
  batchId: string;
  /** The name a badge will print. Short-form on purpose — see the ruling note. */
  associationName: string;
  /** Row count recorded in the story, from the 2026-09-05 prod measurement. */
  storyExpectedRows: number;
  /**
   * Story 13-67 R2 — respondents this batch MATCHED instead of inserting, from 13-2's
   * ledger (ASNAT 56/56 inserted, 0 matched; AFAN 8,222 inserted, **12 matched**).
   *
   * A matched row keeps its OWN `import_batch_id`, so phase 1's `WHERE import_batch_id
   * = …` cannot see it. These people were on the association's list and had already
   * registered themselves — the most active cohort in the batch.
   */
  storyExpectedMatchedRows: number;
}

/**
 * ⭐ AWWAL'S RULING, 2026-09-05. Do NOT re-derive these from the source sheets.
 *
 * The sheets name NCARES and L-PRES, which are PROGRAMME REGISTERS, not associations.
 * Reading a programme name as the vouching body would print a government scheme where
 * a guild name belongs, and the badge's entire premise is that an accountable BODY
 * vouched for this person.
 *
 * `source_description` on these two batches is an operator note, not a name: "Oyo
 * farming groups consolidated intake - 8,234 flag-free rows of 9,563 collected
 * (NCARES + …)" names no accountable body at all. That is why the ruling was needed,
 * and why nothing here may fall back to that column.
 */
export const ASSOCIATION_BATCH_IDENTITIES: readonly AssociationBatchIdentity[] = [
  {
    batchId: '01a071c8-709f-73a3-9e31-eb0e8cedf01a',
    associationName: 'ASNAT', // Association of Tilers, Oyo State — the tiler pilot
    storyExpectedRows: 56,
    storyExpectedMatchedRows: 0, // 56/56 inserted — nobody was already on the register
  },
  {
    batchId: '01a072ae-83e7-7e8f-902d-590f0c589c74',
    associationName: 'AFAN', // All Farmers Association of Nigeria — the farming intake
    storyExpectedRows: 8222,
    storyExpectedMatchedRows: 12, // 8,222 inserted / 12 matched — Awwal's ruling 2026-09-07
  },
];

export interface BackfillPrediction {
  batchId: string;
  associationName: string;
  /** Batch row found in `import_batches`? A missing batch is a HALT, not a zero. */
  batchExists: boolean;
  /** Respondents currently carrying this `import_batch_id` — the prediction. */
  predictedRows: number;
  storyExpectedRows: number;
  /** Rows that ALREADY carry the key (a re-run shows these; a first run shows 0). */
  alreadyTagged: number;
  /**
   * Code review L1 — rows whose `metadata` is present but is NOT a JSONB object.
   *
   * `COALESCE(metadata,'{}')` covers SQL NULL and nothing else. Postgres `||` on a
   * non-object jsonb does not error, it ARRAY-WRAPS both sides:
   *   `'null'::jsonb || jsonb_build_object('association_name','AFAN')`
   *     → `[null, {"association_name": "AFAN"}]`
   * That row's siblings become unreadable (`metadata -> 'x'` is null on an array),
   * `metadata ->> 'association_name'` stops matching so `alreadyTagged` never sees
   * it, and a re-run APPENDS a second element instead of being idempotent — the
   * exact silent sibling-loss this module exists to prevent, arriving through the
   * one shape COALESCE does not cover. Non-zero here is a HALT, not a warning.
   */
  nonObjectMetadataRows: number;
}

export interface BackfillOutcome extends BackfillPrediction {
  /** Rows the UPDATE actually touched. */
  updatedRows: number;
  /** predictedRows === updatedRows — the whole point of the exercise. */
  matchesPrediction: boolean;
}

/**
 * PREDICT — count what the write is about to touch, before touching it.
 *
 * [[pattern-predict-then-compare]]: "it moved" passes for any change, including a
 * wrong one. The number to beat is stated here, in advance, per batch. Note that
 * `storyExpectedRows` is a SEPARATE number from `predictedRows`: the first is what
 * the story recorded on 2026-09-05, the second is what the database says right now.
 * A divergence between them is information, not a failure — report it, do not
 * silently prefer either.
 */
export async function predictAssociationBackfill(dbh: BackfillDb): Promise<BackfillPrediction[]> {
  const out: BackfillPrediction[] = [];
  for (const identity of ASSOCIATION_BATCH_IDENTITIES) {
    const batch = await dbh
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(eq(importBatches.id, identity.batchId))
      .limit(1);

    const counts = await dbh
      .select({
        total: sql<number>`count(*)::int`,
        tagged: sql<number>`count(*) FILTER (WHERE ${respondents.metadata} ->> 'association_name' IS NOT NULL)::int`,
        // Code review L1 — the one metadata shape `COALESCE` does not cover.
        nonObject: sql<number>`count(*) FILTER (WHERE ${respondents.metadata} IS NOT NULL AND jsonb_typeof(${respondents.metadata}) <> 'object')::int`,
      })
      .from(respondents)
      .where(eq(respondents.importBatchId, identity.batchId));

    out.push({
      batchId: identity.batchId,
      associationName: identity.associationName,
      batchExists: batch.length > 0,
      predictedRows: counts[0]?.total ?? 0,
      storyExpectedRows: identity.storyExpectedRows,
      alreadyTagged: counts[0]?.tagged ?? 0,
      nonObjectMetadataRows: counts[0]?.nonObject ?? 0,
    });
  }
  return out;
}

/**
 * The JSONB merge, as one expression.
 *
 * Exported so a test can assert the SHAPE of the write and not only its effect — a
 * `SET metadata = <literal>` regression would still satisfy an effect-only test on a
 * row that happened to carry no other keys.
 */
export function associationMetadataMerge(name: string) {
  return sql`COALESCE(${respondents.metadata}, '{}'::jsonb) || jsonb_build_object('association_name', ${name}::text)`;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * PHASE 2 — Story 13-67 R2: the people the import MATCHED instead of inserting.
 *
 * ⭐ AWWAL'S RULING, 2026-09-07: **yes, the vouch attaches.** Someone who had already
 * registered themselves and whose phone or NIN matched a row on the association's list
 * was ON that list; the body vouched for them exactly as it vouched for the 8,222 it
 * inserted. The import's dedup is why they look different in the database — it says
 * nothing about the claim.
 *
 * ⛔ WHY THIS CANNOT REUSE PHASE 1'S PREDICATE. A matched row is never written by the
 * import: it keeps its own `import_batch_id` (usually none — these are `public`
 * self-registrations), so `WHERE import_batch_id = '01a072ae…'` cannot reach it. The
 * ONLY surviving link is the batch's own `failure_report.dispositions[]`, where each
 * match recorded `matchedRespondentIdHash = sha256(respondent.id)` — a one-way hash,
 * chosen deliberately so the report carries no PII cross-link.
 *
 * So resolution runs the hash FORWARD over candidate ids rather than trying to invert
 * it. At registry scale (8,662 rows today) that is a few hundred milliseconds of sha256
 * and no pgcrypto dependency; it is keyset-paginated so it stays linear as the register
 * grows.
 *
 * ⚠️ NOT every `matched` disposition carries a hash. Exactly one reason does not:
 * `nin_match_in_batch` (`ingest-plan.ts:195`) means "this SHEET row repeats a NIN from an
 * earlier SHEET row" — it points at no existing respondent at all. (A repeated PHONE is
 * not this case: `ingest-plan.ts:232` INSERTS it and flags `identityAmbiguous`, because a
 * shared handset may be a household rather than a duplicate person.) Counting
 * `category === 'matched'` as the target set would silently over-predict and then report a
 * mismatch nobody could explain, so the two counts are reported separately.
 * ══════════════════════════════════════════════════════════════════════════════ */

/** The dispositions a confirmed batch stores on itself. */
interface StoredFailureReport {
  dispositions?: IngestDisposition[];
}

export interface MatchedBackfillPrediction {
  batchId: string;
  associationName: string;
  batchExists: boolean;
  /** Every `category === 'matched'` disposition on the batch. */
  matchedDispositions: number;
  /** …of which these carry a `matchedRespondentIdHash` (a real, existing person). */
  matchedWithHash: number;
  /** …and these do NOT: a duplicate WITHIN the sheet, pointing at nobody. */
  inBatchDuplicates: number;
  /** Distinct hashes — two sheet rows can match the same person. */
  distinctHashes: number;
  /** Hashes that resolved to a live respondent id. */
  resolvedRespondentIds: string[];
  /** Hashes that resolved to NOBODY — a deleted or merged record. */
  unresolvedHashes: string[];
  /** Targets already carrying THIS association name (a re-run shows these). */
  alreadyTagged: number;
  /** Targets already carrying a DIFFERENT body name. Never overwritten. */
  conflictingNames: Array<{ respondentId: string; existing: string }>;
  /** Targets whose metadata is present but not an object — the array-wrap trap. */
  nonObjectMetadataRows: number;
  /** 13-2 ledger figure for this batch (ASNAT 0, AFAN 12). */
  storyExpectedMatchedRows: number;
}

export interface MatchedBackfillOutcome extends MatchedBackfillPrediction {
  updatedRows: number;
  matchesPrediction: boolean;
}

/**
 * Resolve `sha256(id)` back to respondent ids by hashing FORWARD over the register.
 *
 * Keyset pagination on the primary key: no OFFSET drift, constant memory, and it stops
 * as soon as every hash is accounted for.
 */
async function resolveHashesToRespondentIds(
  dbh: BackfillDb,
  hashes: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (hashes.size === 0) return found;

  const PAGE = 5000;
  let cursor: string | null = null;
  for (;;) {
    const page: Array<{ id: string }> =
      cursor === null
        ? await dbh.select({ id: respondents.id }).from(respondents).orderBy(asc(respondents.id)).limit(PAGE)
        : await dbh
            .select({ id: respondents.id })
            .from(respondents)
            .where(gt(respondents.id, cursor))
            .orderBy(asc(respondents.id))
            .limit(PAGE);

    if (page.length === 0) break;
    for (const row of page) {
      const digest = createHash('sha256').update(row.id).digest('hex');
      if (hashes.has(digest)) found.set(digest, row.id);
    }
    if (found.size === hashes.size || page.length < PAGE) break;
    cursor = page[page.length - 1]!.id;
  }
  return found;
}

/** PREDICT phase 2 — who the write would touch, and every reason it might refuse. */
export async function predictAssociationMatchedBackfill(
  dbh: BackfillDb,
): Promise<MatchedBackfillPrediction[]> {
  const out: MatchedBackfillPrediction[] = [];

  for (const identity of ASSOCIATION_BATCH_IDENTITIES) {
    const batchRows = await dbh
      .select({ id: importBatches.id, failureReport: importBatches.failureReport })
      .from(importBatches)
      .where(eq(importBatches.id, identity.batchId))
      .limit(1);
    const batch = batchRows[0];

    const dispositions =
      (batch?.failureReport as StoredFailureReport | null)?.dispositions ?? [];
    const matched = dispositions.filter((d) => d.category === 'matched');
    const withHash = matched.filter((d) => !!d.matchedRespondentIdHash);
    const hashes = new Set(withHash.map((d) => d.matchedRespondentIdHash as string));

    const resolved = batch
      ? await resolveHashesToRespondentIds(dbh, hashes)
      : new Map<string, string>();
    const respondentIds = [...new Set(resolved.values())];

    // The three no-override refusals all live in the targets' current metadata.
    let alreadyTagged = 0;
    let nonObjectMetadataRows = 0;
    const conflictingNames: Array<{ respondentId: string; existing: string }> = [];
    for (const respondentId of respondentIds) {
      const [row] = await dbh
        .select({
          existing: sql<string | null>`${respondents.metadata} ->> 'association_name'`,
          shape: sql<string | null>`jsonb_typeof(${respondents.metadata})`,
        })
        .from(respondents)
        .where(eq(respondents.id, respondentId));
      if (row?.shape && row.shape !== 'object') nonObjectMetadataRows += 1;
      if (row?.existing === identity.associationName) alreadyTagged += 1;
      else if (row?.existing) conflictingNames.push({ respondentId, existing: row.existing });
    }

    out.push({
      batchId: identity.batchId,
      associationName: identity.associationName,
      batchExists: !!batch,
      matchedDispositions: matched.length,
      matchedWithHash: withHash.length,
      inBatchDuplicates: matched.length - withHash.length,
      distinctHashes: hashes.size,
      resolvedRespondentIds: respondentIds,
      unresolvedHashes: [...hashes].filter((h) => !resolved.has(h)),
      alreadyTagged,
      conflictingNames,
      nonObjectMetadataRows,
      storyExpectedMatchedRows: identity.storyExpectedMatchedRows,
    });
  }

  return out;
}

/**
 * PREFLIGHT phase 2 — refuse before the first write, for the same reason phase 1 does.
 *
 * `acceptCountDrift` covers ONLY the ledger-count disagreement. The other three have no
 * override: a hash that resolves to nobody, another body name already on the record, and
 * a non-object metadata document are each a reason to stop and look — not a reason to
 * write 11 of 12 and call it done.
 */
export function preflightAssociationMatchedBackfill(
  predictions: readonly MatchedBackfillPrediction[],
  opts: { acceptCountDrift?: boolean } = {},
): void {
  for (const p of predictions) {
    if (!p.batchExists) {
      throw new Error(
        `Batch ${p.batchId} (${p.associationName}) does not exist in import_batches — refusing to write. ` +
          'Check DATABASE_URL points at the intended environment.',
      );
    }

    if (p.matchedWithHash !== p.storyExpectedMatchedRows && !opts.acceptCountDrift) {
      throw new Error(
        `Batch ${p.batchId} (${p.associationName}) reports ${p.matchedWithHash} matched respondent(s) with a ` +
          `resolvable hash, but the 13-2 ledger recorded ${p.storyExpectedMatchedRows} — refusing to write. ` +
          `(${p.inBatchDuplicates} further matched disposition(s) are in-sheet duplicates that point at no ` +
          'respondent, and are correctly excluded.) Reconcile, then re-run with --accept-count-drift.',
      );
    }

    if (p.unresolvedHashes.length > 0) {
      throw new Error(
        `Batch ${p.batchId} (${p.associationName}): ${p.unresolvedHashes.length} matched hash(es) resolve to no ` +
          'respondent — the record was deleted or merged since the import. Refusing to write a partial set; a ' +
          `silent 11-of-12 is the failure this check exists for. First unresolved: ${p.unresolvedHashes[0]}.`,
      );
    }

    if (p.conflictingNames.length > 0) {
      const first = p.conflictingNames[0] as { respondentId: string; existing: string };
      throw new Error(
        `Batch ${p.batchId} (${p.associationName}): respondent ${first.respondentId} already carries ` +
          `association_name "${first.existing}". Refusing to overwrite one accountable body claim with ` +
          `another (${p.conflictingNames.length} conflict(s)). That needs a ruling, not a flag.`,
      );
    }

    if (p.nonObjectMetadataRows > 0) {
      throw new Error(
        `Batch ${p.batchId} (${p.associationName}): ${p.nonObjectMetadataRows} target row(s) hold non-object ` +
          'metadata — the JSONB concat would ARRAY-WRAP the document. Refusing to write.',
      );
    }
  }
}

/**
 * APPLY phase 2 — attach the vouch to the people the import matched.
 *
 * Per-row transaction, each pairing the metadata merge with its OWN audit row: these are
 * LIVE self-registered citizens records being annotated with a third party claim, which
 * is a real intervention in someone registration and must leave a trace. `logActionTx`,
 * not the fire-and-forget `logAction`, because a detached hash-chain write can be lost to
 * the `process.exit` at the end of a script, and because the marker and its audit row
 * must commit together.
 *
 * ⭐ `association_vouched_by_batch_id` is written alongside the name, and phase 1 does
 * NOT write it. The asymmetry is the point: phase 1 rows are identifiable forever by
 * `import_batch_id`, and these are not. Without it there is no way to tell a matched
 * vouch from a hand-typed one, and no way to undo this run.
 */
export async function applyAssociationMatchedBackfill(
  dbh: typeof Database,
  opts: {
    onProgress?: (msg: string) => void;
    acceptCountDrift?: boolean;
    auditContext?: { ipAddress?: string; userAgent?: string };
  } = {},
): Promise<MatchedBackfillOutcome[]> {
  const log = opts.onProgress ?? (() => {});
  const predictions = await predictAssociationMatchedBackfill(dbh);
  preflightAssociationMatchedBackfill(predictions, { acceptCountDrift: opts.acceptCountDrift });
  const outcomes: MatchedBackfillOutcome[] = [];

  for (const p of predictions) {
    log(
      `${p.associationName}: ${p.resolvedRespondentIds.length} matched respondent(s) to vouch for ` +
        `(ledger recorded ${p.storyExpectedMatchedRows}; ${p.inBatchDuplicates} in-sheet duplicate(s) excluded)`,
    );

    let updatedRows = 0;
    for (const respondentId of p.resolvedRespondentIds) {
      await dbh.transaction(async (tx) => {
        const res = await tx
          .update(respondents)
          .set({
            metadata: sql`COALESCE(${respondents.metadata}, '{}'::jsonb) || jsonb_build_object('association_name', ${p.associationName}::text, 'association_vouched_by_batch_id', ${p.batchId}::text)`,
            updatedAt: new Date(),
          })
          .where(eq(respondents.id, respondentId));

        await AuditService.logActionTx(tx, {
          actorId: null,
          action: AUDIT_ACTIONS.OPERATOR_ASSOCIATION_VOUCH_ATTACHED,
          targetResource: AUDIT_TARGETS.RESPONDENT,
          targetId: respondentId,
          details: {
            story: '13-67 R2',
            associationName: p.associationName,
            vouchingBatchId: p.batchId,
            // WHY this person is in scope: the import MATCHED them instead of inserting
            // them, so nothing on their own row records the link.
            basis: 'matched_at_import_dedup',
            ruling: 'Awwal 2026-09-07',
          },
          ipAddress: opts.auditContext?.ipAddress,
          userAgent: opts.auditContext?.userAgent,
        });

        updatedRows += (res as unknown as { rowCount: number | null }).rowCount ?? 0;
      });
    }

    const outcome: MatchedBackfillOutcome = {
      ...p,
      updatedRows,
      matchesPrediction: updatedRows === p.resolvedRespondentIds.length,
    };
    log(
      `${p.associationName}: updated ${updatedRows} — ${
        outcome.matchesPrediction ? 'MATCHES prediction' : '⛔ DOES NOT MATCH prediction'
      }`,
    );
    outcomes.push(outcome);
  }

  return outcomes;
}

/**
 * PREFLIGHT — everything that must be true BEFORE any batch is written.
 *
 * ⭐ Code review H1. Run over ALL batches first, deliberately: each batch writes in
 * its own transaction, so validating inside the write loop would leave ASNAT applied
 * and AFAN refused — a half-done backfill nobody asked for. Fail before the first
 * write, or not at all.
 *
 * ⛔ The count check here is the ONLY falsifiable one in this module. `updatedRows`
 * vs `predictedRows` compares two reads of the IDENTICAL predicate seconds apart on a
 * closed batch, so it agrees for every possible database — including the wrong one.
 * The number that can actually fail is the story's 56 / 8,222, measured on prod on
 * 2026-09-05, and before this check it was compared only in the CLI's `--dry-run`
 * path, which `--apply` skips. A run against a partial restore therefore printed
 * "✅ Every batch updated exactly the predicted number of rows" and exited 0.
 * [[pattern-predict-then-compare]] — reproduce the WHOLE predicate, and let it fail.
 */
export function preflightAssociationBackfill(
  predictions: readonly BackfillPrediction[],
  opts: { acceptCountDrift?: boolean } = {},
): void {
  for (const p of predictions) {
    if (!p.batchExists) {
      // A batch id that resolves to nothing means this is pointed at the wrong
      // database (or the ruling's ids are wrong). Either way, writing is the mistake.
      throw new Error(
        `Batch ${p.batchId} (${p.associationName}) does not exist in import_batches — refusing to write. ` +
          'Check DATABASE_URL points at the intended environment.',
      );
    }

    if (p.nonObjectMetadataRows > 0) {
      // No flag overrides this one. There is no reading under which array-wrapping a
      // person's provenance is the intended outcome.
      throw new Error(
        `Batch ${p.batchId} (${p.associationName}) has ${p.nonObjectMetadataRows} respondent row(s) whose ` +
          'metadata is not a JSONB object — refusing to write. `metadata || jsonb_build_object(...)` would ' +
          'ARRAY-WRAP those documents and make every sibling key unreadable. Inspect with: ' +
          `SELECT id, jsonb_typeof(metadata) FROM respondents WHERE import_batch_id = '${p.batchId}' ` +
          "AND metadata IS NOT NULL AND jsonb_typeof(metadata) <> 'object';",
      );
    }

    if (p.predictedRows !== p.storyExpectedRows && !opts.acceptCountDrift) {
      throw new Error(
        `Batch ${p.batchId} (${p.associationName}) holds ${p.predictedRows} respondent rows, but the ruling of ` +
          `2026-09-05 measured ${p.storyExpectedRows} on prod — refusing to write. A database that disagrees ` +
          'with the measurement is either not prod or has moved since. Reconcile, then re-run with ' +
          '--accept-count-drift if the divergence is understood and intended.',
      );
    }
  }
}

/**
 * APPLY — write the batch column and merge the respondent copy, then COMPARE.
 *
 * Both writes for one batch happen in a single transaction: the batch column is the
 * source of truth and the respondent copy is its denormalisation, so a run that set
 * one without the other would leave the registry disagreeing with itself about who
 * vouched. Each batch gets its OWN transaction, so a failure on the 8,222-row batch
 * does not roll back the 56-row one that already verified.
 *
 * Every prediction is preflighted BEFORE the first write — see
 * `preflightAssociationBackfill`.
 */
export async function applyAssociationBackfill(
  dbh: typeof Database,
  opts: { onProgress?: (msg: string) => void; acceptCountDrift?: boolean } = {},
): Promise<BackfillOutcome[]> {
  const log = opts.onProgress ?? (() => {});
  const predictions = await predictAssociationBackfill(dbh);
  preflightAssociationBackfill(predictions, { acceptCountDrift: opts.acceptCountDrift });
  const outcomes: BackfillOutcome[] = [];

  for (const p of predictions) {
    log(
      `${p.associationName}: predicting ${p.predictedRows} respondent rows (story recorded ${p.storyExpectedRows})`,
    );

    const updatedRows = await dbh.transaction(async (tx) => {
      await tx
        .update(importBatches)
        .set({ associationName: p.associationName })
        .where(eq(importBatches.id, p.batchId));

      const res = await tx
        .update(respondents)
        .set({ metadata: associationMetadataMerge(p.associationName) })
        .where(eq(respondents.importBatchId, p.batchId));

      return (res as unknown as { rowCount: number | null }).rowCount ?? 0;
    });

    const outcome: BackfillOutcome = {
      ...p,
      updatedRows,
      matchesPrediction: updatedRows === p.predictedRows,
    };
    log(
      `${p.associationName}: updated ${updatedRows} — ${
        outcome.matchesPrediction ? 'MATCHES prediction' : '⛔ DOES NOT MATCH prediction'
      }`,
    );
    outcomes.push(outcome);
  }

  return outcomes;
}

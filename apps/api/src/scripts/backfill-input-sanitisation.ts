#!/usr/bin/env tsx
/**
 * Back-fill script for prep-input-sanitisation-layer.
 *
 * Walks the `respondents` table, runs the central normalisers on `phone_number`
 * and `date_of_birth`, and rewrites non-canonical values in place. Existing
 * `metadata.normalisation_warnings` are preserved and merged with any new
 * codes from this pass; rows that fail normalisation outright are flagged via
 * `metadata.backfill_failed = true` for super-admin review (see companion
 * report-backfill-failures.ts).
 *
 * Properties:
 *   - Idempotent — already-canonical rows are skipped (no UPDATE, no audit log).
 *   - Dry-run safe — `--dry-run` prints planned changes; nothing is written.
 *   - PII-safe audit trail — audit_logs.details holds SHA-256 hashes of
 *     old/new values (NOT plaintext); forensic recovery uses the pre-migration
 *     DB snapshot.
 *   - Bounded — page-size 500; `--limit N` caps total rows processed for
 *     incremental runs against large tables.
 *
 * Usage:
 *   pnpm --filter @oslsr/api tsx src/scripts/backfill-input-sanitisation.ts --dry-run
 *   pnpm --filter @oslsr/api tsx src/scripts/backfill-input-sanitisation.ts
 *   pnpm --filter @oslsr/api tsx src/scripts/backfill-input-sanitisation.ts --limit 1000
 */

import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { respondents } from '../db/schema/index.js';
import type { RespondentMetadata } from '../db/schema/respondents.js';
import { eq, sql } from 'drizzle-orm';
import { AuditService, AUDIT_ACTIONS } from '../services/audit.service.js';
import {
  normaliseNigerianPhone,
  normaliseDate,
} from '../lib/normalise/index.js';
import pino from 'pino';

const logger = pino({ name: 'backfill-input-sanitisation' });

interface BackfillArgs {
  dryRun: boolean;
  limit: number | null;
  pageSize: number;
}

export interface BackfillCandidate {
  id: string;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  metadata: RespondentMetadata | null;
}

export interface BackfillPlan {
  rowId: string;
  /** True if at least one field is non-canonical and needs UPDATE. */
  hasChanges: boolean;
  /** True if the row had a hard normalisation failure. */
  failed: boolean;
  newPhone: string | null;
  newDob: string | null;
  newMetadata: RespondentMetadata | null;
  /** Hash-only audit payload — never plaintext PII. */
  auditDetails: {
    fields: string[];
    hashes: Record<string, { old: string | null; new: string | null }>;
  };
}

function sha256(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  return createHash('sha256').update(String(value)).digest('hex');
}

const PHONE_CANONICAL_RE = /^\+234\d{10}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pure planner — given a candidate row, decide what to change. Exported so
 * unit tests exercise the logic without a real DB.
 */
export function planBackfill(row: BackfillCandidate): BackfillPlan {
  const newWarnings: string[] = [];
  let failed = false;
  let newPhone = row.phoneNumber;
  let newDob = row.dateOfBirth;
  const fields: string[] = [];
  const hashes: BackfillPlan['auditDetails']['hashes'] = {};

  // Phone
  if (row.phoneNumber && !PHONE_CANONICAL_RE.test(row.phoneNumber)) {
    const r = normaliseNigerianPhone(row.phoneNumber);
    if (r.value && PHONE_CANONICAL_RE.test(r.value)) {
      if (r.value !== row.phoneNumber) {
        newPhone = r.value;
        fields.push('phone_number');
        hashes.phone_number = { old: sha256(row.phoneNumber), new: sha256(r.value) };
      }
      for (const w of r.warnings) newWarnings.push(`phone_number:${w}`);
    } else {
      // Hard failure — could not canonicalise.
      failed = true;
      for (const w of r.warnings) newWarnings.push(`phone_number:${w}`);
    }
  }

  // Date of birth
  if (row.dateOfBirth && !ISO_DATE_RE.test(row.dateOfBirth)) {
    const r = normaliseDate(row.dateOfBirth, 'DMY');
    if (r.value) {
      const iso = r.value.toISOString().slice(0, 10);
      if (iso !== row.dateOfBirth) {
        newDob = iso;
        fields.push('date_of_birth');
        hashes.date_of_birth = { old: sha256(row.dateOfBirth), new: sha256(iso) };
      }
      for (const w of r.warnings) newWarnings.push(`date_of_birth:${w}`);
    } else {
      failed = true;
      for (const w of r.warnings) newWarnings.push(`date_of_birth:${w}`);
    }
  }

  const existingMeta = row.metadata ?? {};
  const mergedWarnings = mergeWarnings(
    existingMeta.normalisation_warnings ?? [],
    newWarnings,
  );

  let newMetadata: RespondentMetadata | null = null;
  const hasMetadataChange =
    failed !== Boolean(existingMeta.backfill_failed) ||
    mergedWarnings.length !== (existingMeta.normalisation_warnings?.length ?? 0);

  if (hasMetadataChange || failed || mergedWarnings.length > 0) {
    newMetadata = {
      ...existingMeta,
      ...(mergedWarnings.length > 0 ? { normalisation_warnings: mergedWarnings } : {}),
      ...(failed ? { backfill_failed: true as const } : {}),
    };
  }

  const hasChanges = fields.length > 0 || hasMetadataChange;

  return {
    rowId: row.id,
    hasChanges,
    failed,
    newPhone,
    newDob,
    newMetadata,
    auditDetails: { fields, hashes },
  };
}

function mergeWarnings(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of [...existing, ...incoming]) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

function parseArgs(argv: string[]): BackfillArgs {
  const dryRun = argv.includes('--dry-run');
  const limitIdx = argv.indexOf('--limit');
  const limit =
    limitIdx >= 0 && argv[limitIdx + 1] ? Number.parseInt(argv[limitIdx + 1], 10) : null;
  return { dryRun, limit: Number.isNaN(limit) ? null : limit, pageSize: 500 };
}

async function main(args: BackfillArgs): Promise<void> {
  logger.info({
    event: 'backfill.start',
    dryRun: args.dryRun,
    limit: args.limit,
    pageSize: args.pageSize,
  });

  let scanned = 0;
  let planned = 0;
  let written = 0;
  let failed = 0;

  // F6 (code-review 2026-05-02): keyset pagination by `id` (not OFFSET — OFFSET
  // gets quadratic at scale). Previous implementation read all rows in one
  // SELECT which would OOM if respondents grows past memory (the script was
  // claimed "bounded" with pageSize: 500 in args but never paginated). This
  // page loop honors args.pageSize + args.limit. Stops when a page returns
  // fewer rows than pageSize.
  let cursor: string | null = null;
  let pageNum = 0;

  outer: while (true) {
    pageNum++;
    const pageQuery = db
      .select({
        id: respondents.id,
        phoneNumber: respondents.phoneNumber,
        dateOfBirth: respondents.dateOfBirth,
        metadata: respondents.metadata,
      })
      .from(respondents)
      .orderBy(respondents.id)
      .limit(args.pageSize);

    // Cast through unknown to layer the optional .where conditional cleanly.
    const page: BackfillCandidate[] = cursor
      ? await pageQuery.where(sql`${respondents.id} > ${cursor}`)
      : await pageQuery;

    if (page.length === 0) break;
    logger.debug({ event: 'backfill.page', pageNum, rowsInPage: page.length });

    for (const row of page) {
      if (args.limit && scanned >= args.limit) break outer;
      scanned++;
      cursor = row.id;

      const plan = planBackfill(row);
      if (!plan.hasChanges) continue;
      planned++;
      if (plan.failed) failed++;

      if (args.dryRun) {
        logger.info({
          event: 'backfill.plan',
          rowId: plan.rowId,
          fields: plan.auditDetails.fields,
          failed: plan.failed,
        });
        continue;
      }

      await db
        .update(respondents)
        .set({
          phoneNumber: plan.newPhone,
          dateOfBirth: plan.newDob,
          metadata: plan.newMetadata,
          updatedAt: new Date(),
        })
        .where(eq(respondents.id, plan.rowId));

      // F7 (code-review 2026-05-02 — tracked, not fixed): audit-log inserts
      // here are sequential fire-and-forget. For low-thousands of rows the
      // contention with regular write traffic is negligible; if back-fill ever
      // runs against millions of rows, batch via a single INSERT … VALUES
      // (...) (...) (...) statement.
      AuditService.logAction({
        actorId: null,
        action: AUDIT_ACTIONS.RESPONDENT_BACKFILLED_NORMALISATION,
        targetResource: 'respondents',
        targetId: plan.rowId,
        details: {
          fields: plan.auditDetails.fields,
          hashes: plan.auditDetails.hashes,
          failed: plan.failed,
        },
      });

      written++;
    }

    if (page.length < args.pageSize) break;
  }

  logger.info({
    event: 'backfill.complete',
    scanned,
    planned,
    written,
    failed,
    dryRun: args.dryRun,
  });
}

// Allow direct CLI invocation; suppress on import (tests).
const isCli = process.argv[1]?.endsWith('backfill-input-sanitisation.ts')
  || process.argv[1]?.endsWith('backfill-input-sanitisation.js');
if (isCli) {
  main(parseArgs(process.argv.slice(2)))
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ event: 'backfill.error', err: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    });
}

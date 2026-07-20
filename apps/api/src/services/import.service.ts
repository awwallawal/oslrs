/**
 * Import Service (Story 11-2).
 *
 * The backbone for secondary-data ingestion: parse (PDF/CSV/XLSX) → dry-run
 * preview → transactional confirm with mandatory lawful basis → 14-day
 * rollback (soft-delete via status flip). Imported respondents land
 * `status = 'imported_unverified'` so they are excluded from fraud /
 * marketplace / verify pipelines by the existing status gate.
 *
 * Reuse contract: Story 13-2 (association importer) adds ONE `import-sources.ts`
 * config block + wires `imported_association` onto THIS service — it does not
 * fork the pipeline.
 *
 * Design notes:
 * - Dedup is on phone OR NIN (the indexed `respondents` columns) — the table
 *   has no email column, so AC#5's "email" match is not implementable; email is
 *   preserved as provenance in `metadata.imported_email`. Documented deviation.
 * - The confirm ingest batches its DB work (one existing-lookup query, one LGA
 *   load, chunked inserts) rather than per-row round-trips, so a 10K-row import
 *   commits well under the 60s target and never risks poisoning the transaction
 *   with a mid-batch constraint violation (intra-batch dups are resolved in
 *   memory by the pure `planIngest`).
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { generateReferenceCode } from '@oslsr/utils';
import { AppError } from '@oslsr/utils';
import pino from 'pino';
import { db } from '../db/index.js';
import { importBatches, importBatchDrafts, respondents, lgas } from '../db/schema/index.js';
import { importBatchStatusTypes } from '../db/schema/import-batches.js';
import type { ImportDraftParsedResult } from '../db/schema/import-batch-drafts.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
import { buildLgaLabelResolver } from './lga-canonical.service.js';
import { resolveColumnMapping, isImportableSource } from '../config/import-sources.js';
import { getParser } from './import/parsers/index.js';
import type { ColumnMapping, ParseFailure } from './import/parsers/types.js';
import { planIngest, type IngestDisposition } from './import/ingest-plan.js';

const logger = pino({ name: 'import-service' });

/** Transaction handle type (Drizzle). */
type DbTx = Parameters<Parameters<typeof db['transaction']>[0]>[0];

const DRY_RUN_TTL_MS = 60 * 60 * 1000; // 1 hour
const DRY_RUN_PARSE_TIMEOUT_MS = 30 * 1000; // AC#3 server-side parse cap
const ROLLBACK_WINDOW_DAYS = 14;
const PREVIEW_ROWS = 50;
const INSERT_CHUNK = 500;
const ROLLBACK_REASON_MIN = 20;

/**
 * Bound an async parse by wall-clock time (AC#3). Meaningfully caps the async
 * pdfjs path (it yields to the event loop between chunks); a purely synchronous
 * parser that never yields could still exceed the budget, but the intent —
 * refusing an operator upload that hangs the request — holds for the format
 * that motivated the requirement (large tabular PDFs).
 */
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Escape one CSV cell (RFC-4180: quote when it holds a comma/quote/newline). */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Lawful bases that additionally require a free-text note (per AC#4). */
const NOTE_REQUIRED_BASES = new Set(['ndpa_6_1_f', 'data_sharing_agreement']);

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function tokenSecret(): string {
  // No NEW required env var (SEC-3 crash-loop lesson): fall back to the always-
  // present JWT secret, then a dev-only constant. The draft id is an
  // unguessable uuidv7 stored server-side with single-use + owner binding, so
  // the HMAC is defence-in-depth, not the sole guard.
  return (
    process.env.IMPORT_DRY_RUN_SECRET ||
    process.env.JWT_SECRET ||
    'dev-insecure-import-dry-run-secret'
  );
}

function signDraft(draftId: string, fileHash: string): string {
  return createHmac('sha256', tokenSecret()).update(`${draftId}.${fileHash}`).digest('hex');
}

function makeDryRunToken(draftId: string, fileHash: string): string {
  return `${draftId}.${signDraft(draftId, fileHash)}`;
}

function verifyDryRunToken(token: string, draftId: string, fileHash: string): boolean {
  const [, mac] = token.split('.', 2);
  if (!mac) return false;
  const expected = signDraft(draftId, fileHash);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const VALID_PHONE = /^\+234\d{10}$/;
const VALID_NIN = /^\d{11}$/;

export interface DryRunParams {
  buffer: Buffer;
  originalFilename: string;
  source: string;
  parserUsed: string;
  columnMapping?: ColumnMapping | null;
  sourceDescription?: string | null;
  actorId: string;
}

export interface DryRunResult {
  dryRunToken: string;
  batchPreview: {
    source: string;
    parserUsed: string;
    fileHash: string;
    rowsParsed: number;
    rowsFailed: number;
  };
  rowsPreview: Array<{ rowIndex: number; canonical: Record<string, unknown>; warnings: string[] }>;
  failureReport: ImportDraftParsedResult['failures'];
  lawfulBasisRequired: true;
}

export interface ConfirmParams {
  dryRunToken: string;
  lawfulBasis: string;
  lawfulBasisNote?: string | null;
  actorId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ConfirmResult {
  batchId: string;
  rowsParsed: number;
  rowsInserted: number;
  rowsMatchedExisting: number;
  rowsSkipped: number;
  rowsFailed: number;
}

export class ImportService {
  /** Parse + preview a file WITHOUT writing respondents. Returns a confirm token. */
  static async dryRun(params: DryRunParams): Promise<DryRunResult> {
    const { buffer, originalFilename, source, parserUsed, columnMapping, sourceDescription, actorId } = params;

    if (!isImportableSource(source)) {
      throw new AppError('VALIDATION_ERROR', `Unknown or non-importable source: ${source}`, 400);
    }

    // Opportunistic retention prune (dry-run is the rate-limited entry point, so
    // this is cheap): drop drafts that are expired or already consumed. Their
    // `parsed_result` JSONB holds PII (names/emails/phones/NINs), so we do not
    // keep it past the draft's usefulness — the confirmed data now lives in
    // `respondents`; an unused draft past its TTL is dead PII. Best-effort:
    // a prune failure must never block a legitimate dry-run.
    await ImportService.pruneStaleDrafts().catch((err) => {
      logger.warn({ event: 'import.draft_prune_failed', error: String(err) });
    });

    let mapping: ColumnMapping;
    try {
      mapping = resolveColumnMapping(source, columnMapping);
    } catch (err) {
      throw new AppError('VALIDATION_ERROR', (err as Error).message, 400);
    }

    const parser = (() => {
      try {
        return getParser(parserUsed);
      } catch (err) {
        throw new AppError('VALIDATION_ERROR', (err as Error).message, 400);
      }
    })();

    const fileHash = sha256Hex(buffer);

    // Reject a file already committed as a batch (Architecture Rule 8).
    const existingBatch = await db
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(eq(importBatches.fileHash, fileHash))
      .limit(1);
    if (existingBatch.length > 0) {
      throw new AppError('DUPLICATE_FILE_HASH', 'This exact file has already been imported.', 409, {
        existingBatchId: existingBatch[0].id,
      });
    }

    let parseResult;
    try {
      parseResult = await withTimeout(
        parser({ buffer, columnMapping: mapping }),
        DRY_RUN_PARSE_TIMEOUT_MS,
        () =>
          new AppError(
            'PARSE_TIMEOUT',
            `Parsing exceeded the ${DRY_RUN_PARSE_TIMEOUT_MS / 1000}s limit. Split the file or use a CSV/XLSX export.`,
            408,
          ),
      );
    } catch (err) {
      if (err instanceof AppError) throw err; // preserve PARSE_TIMEOUT status/code
      throw new AppError('PARSE_ERROR', (err as Error).message, 422);
    }

    const parsedResult: ImportDraftParsedResult = {
      rows: parseResult.rows.map((r) => ({ rowIndex: r.rowIndex, canonical: r.canonical, raw: r.raw, warnings: r.warnings })),
      failures: parseResult.failures,
      stats: { rowsParsed: parseResult.rows.length, rowsFailed: parseResult.failures.length },
      detectedColumns: parseResult.detectedColumns,
    };

    const draftId = uuidv7();
    await db.insert(importBatchDrafts).values({
      id: draftId,
      fileHash,
      originalFilename,
      fileSizeBytes: buffer.length,
      source,
      parserUsed,
      sourceDescription: sourceDescription ?? null,
      columnMapping: mapping,
      parsedResult,
      expiresAt: new Date(Date.now() + DRY_RUN_TTL_MS),
      createdBy: actorId,
    });

    logger.info({
      event: 'import.dry_run',
      draftId,
      source,
      parserUsed,
      rowsParsed: parsedResult.stats.rowsParsed,
      rowsFailed: parsedResult.stats.rowsFailed,
    });

    return {
      dryRunToken: makeDryRunToken(draftId, fileHash),
      batchPreview: {
        source,
        parserUsed,
        fileHash,
        rowsParsed: parsedResult.stats.rowsParsed,
        rowsFailed: parsedResult.stats.rowsFailed,
      },
      rowsPreview: parseResult.rows.slice(0, PREVIEW_ROWS).map((r) => ({
        rowIndex: r.rowIndex,
        canonical: r.canonical,
        warnings: r.warnings,
      })),
      failureReport: parseResult.failures,
      lawfulBasisRequired: true,
    };
  }

  /** Commit a dry-run draft into `import_batches` + `respondents` transactionally. */
  static async confirm(params: ConfirmParams): Promise<ConfirmResult> {
    const { dryRunToken, lawfulBasis, lawfulBasisNote, actorId, ipAddress, userAgent } = params;

    if (!lawfulBasis || lawfulBasis.trim() === '') {
      throw new AppError('VALIDATION_ERROR', 'lawful_basis is required.', 400);
    }
    if (NOTE_REQUIRED_BASES.has(lawfulBasis) && (!lawfulBasisNote || lawfulBasisNote.trim() === '')) {
      throw new AppError('VALIDATION_ERROR', `lawful_basis_note is required for ${lawfulBasis}.`, 400);
    }

    const [draftId] = dryRunToken.split('.', 2);
    if (!draftId) {
      throw new AppError('DRY_RUN_TOKEN_INVALID', 'Malformed dry-run token.', 400);
    }

    return db.transaction(async (tx) => {
      const draftRows = await tx
        .select()
        .from(importBatchDrafts)
        .where(eq(importBatchDrafts.id, draftId))
        .limit(1)
        .for('update');
      const draft = draftRows[0];

      if (!draft) {
        throw new AppError('DRY_RUN_TOKEN_INVALID', 'Dry-run not found or already pruned.', 400);
      }
      if (!verifyDryRunToken(dryRunToken, draft.id, draft.fileHash)) {
        throw new AppError('DRY_RUN_TOKEN_INVALID', 'Dry-run token signature mismatch.', 401);
      }
      if (draft.createdBy !== actorId) {
        throw new AppError('FORBIDDEN', 'This dry-run belongs to another operator.', 403);
      }
      if (draft.usedAt) {
        throw new AppError('DRY_RUN_TOKEN_EXHAUSTED', 'This dry-run has already been confirmed.', 409);
      }
      if (draft.expiresAt.getTime() < Date.now()) {
        throw new AppError('DRY_RUN_TOKEN_EXPIRED', 'This dry-run has expired; re-upload the file.', 410);
      }

      // Re-check file-hash dedup (a batch may have committed since dry-run).
      const existingBatch = await tx
        .select({ id: importBatches.id })
        .from(importBatches)
        .where(eq(importBatches.fileHash, draft.fileHash))
        .limit(1);
      if (existingBatch.length > 0) {
        throw new AppError('DUPLICATE_FILE_HASH', 'This exact file has already been imported.', 409, {
          existingBatchId: existingBatch[0].id,
        });
      }

      const parsed = draft.parsedResult;
      const parsedRows = parsed.rows.map((r) => ({
        rowIndex: (r as { rowIndex: number }).rowIndex,
        canonical: (r as { canonical: Record<string, string> }).canonical,
        raw: (r as { raw: Record<string, string> }).raw,
        warnings: (r as { warnings: string[] }).warnings,
      }));

      // Batched existing-lookup: gather valid phones + NINs, one query.
      const phones = Array.from(
        new Set(parsedRows.map((r) => r.canonical.phoneNumber).filter((p): p is string => !!p && VALID_PHONE.test(p))),
      );
      const nins = Array.from(
        new Set(parsedRows.map((r) => r.canonical.nin).filter((n): n is string => !!n && VALID_NIN.test(n))),
      );

      const existingIdByPhone = new Map<string, string>();
      const existingIdByNin = new Map<string, string>();
      const lookupConds: SQL[] = [];
      if (phones.length) lookupConds.push(inArray(respondents.phoneNumber, phones));
      if (nins.length) lookupConds.push(inArray(respondents.nin, nins));
      if (lookupConds.length) {
        const existing = await tx
          .select({ id: respondents.id, phoneNumber: respondents.phoneNumber, nin: respondents.nin })
          .from(respondents)
          .where(lookupConds.length === 1 ? lookupConds[0] : or(...lookupConds));
        for (const e of existing) {
          if (e.phoneNumber && !existingIdByPhone.has(e.phoneNumber)) existingIdByPhone.set(e.phoneNumber, e.id);
          if (e.nin && !existingIdByNin.has(e.nin)) existingIdByNin.set(e.nin, e.id);
        }
      }

      // LGA resolution (33 rows — load once) via the ONE shared, robust
      // name→slug resolver (Story 11-2 code-review L1). Handles case /
      // hyphen / space / underscore / spelling variants; only genuinely
      // non-Oyo-LGA text falls through to null (+ raw preserved by planIngest).
      const lgaRows = await tx.select({ code: lgas.code, name: lgas.name }).from(lgas);
      const resolveLga = buildLgaLabelResolver(lgaRows);

      const hasConsentColumn = Object.values(draft.columnMapping as ColumnMapping).includes('consent');

      const plan = planIngest({
        rows: parsedRows,
        hasConsentColumn,
        existingIdByPhone,
        existingIdByNin,
        resolveLga,
      });

      const rowsInserted = plan.toInsert.length;
      const rowsMatchedExisting = plan.dispositions.filter((d) => d.category === 'matched').length;
      const rowsSkipped = plan.dispositions.filter((d) => d.category === 'skipped').length;
      const rowsFailed = parsed.stats.rowsFailed + plan.dispositions.filter((d) => d.category === 'failed').length;

      const batchId = uuidv7();
      const now = new Date();

      try {
        await tx.insert(importBatches).values({
          id: batchId,
          source: draft.source,
          sourceDescription: draft.sourceDescription,
          originalFilename: draft.originalFilename,
          fileHash: draft.fileHash,
          fileSizeBytes: draft.fileSizeBytes,
          parserUsed: draft.parserUsed,
          rowsParsed: parsed.stats.rowsParsed,
          rowsInserted,
          rowsMatchedExisting,
          rowsSkipped,
          rowsFailed,
          failureReport: { dispositions: plan.dispositions, parserFailures: parsed.failures },
          lawfulBasis,
          lawfulBasisNote: lawfulBasisNote ?? null,
          uploadedBy: actorId,
        });
      } catch (err) {
        // The non-locking dedup SELECT above leaves a race window: two drafts of
        // the SAME file confirmed concurrently both pass the pre-check, then the
        // UNIQUE(file_hash) constraint rejects the loser. Surface it as the same
        // clean 409 the pre-check would, not an opaque 500.
        if ((err as { code?: string }).code === '23505') {
          throw new AppError('DUPLICATE_FILE_HASH', 'This exact file has already been imported.', 409);
        }
        throw err;
      }

      // Mint unique reference codes (batched) + insert respondents in chunks.
      if (plan.toInsert.length > 0) {
        const codes = await ImportService.mintReferenceCodes(tx, plan.toInsert.length);
        const values = plan.toInsert.map((c, i) => {
          const meta = c.respondent.metadata;
          const hasMeta = Object.keys(meta).length > 0;
          return {
            firstName: c.respondent.firstName,
            lastName: c.respondent.lastName,
            phoneNumber: c.respondent.phoneNumber,
            nin: c.respondent.nin,
            lgaId: c.respondent.lgaId,
            dateOfBirth: c.respondent.dateOfBirth,
            consentMarketplace: c.respondent.consentMarketplace,
            source: draft.source as never,
            status: 'imported_unverified' as const,
            externalReferenceId: c.respondent.externalReferenceId,
            importBatchId: batchId,
            importedAt: now,
            referenceCode: codes[i],
            metadata: hasMeta ? meta : null,
          };
        });
        for (const part of chunk(values, INSERT_CHUNK)) {
          await tx.insert(respondents).values(part);
        }
      }

      // Single-use: mark the draft consumed.
      await tx.update(importBatchDrafts).set({ usedAt: now }).where(eq(importBatchDrafts.id, draft.id));

      await AuditService.logActionTx(tx, {
        actorId,
        action: AUDIT_ACTIONS.IMPORT_BATCH_CREATED,
        targetResource: 'import_batch',
        targetId: batchId,
        details: {
          source: draft.source,
          lawfulBasis,
          rowsParsed: parsed.stats.rowsParsed,
          rowsInserted,
          rowsMatchedExisting,
          rowsSkipped,
          rowsFailed,
        },
        ipAddress,
        userAgent,
      });

      logger.info({
        event: 'import.confirmed',
        batchId,
        source: draft.source,
        rowsInserted,
        rowsMatchedExisting,
        rowsSkipped,
        rowsFailed,
      });

      return {
        batchId,
        rowsParsed: parsed.stats.rowsParsed,
        rowsInserted,
        rowsMatchedExisting,
        rowsSkipped,
        rowsFailed,
      };
    });
  }

  /** Mint `n` reference codes unique against the registry + each other (batched). */
  private static async mintReferenceCodes(tx: DbTx, n: number): Promise<string[]> {
    const year = new Date().getFullYear();
    const codes = new Set<string>();
    let guard = 0;
    while (codes.size < n) {
      if (guard++ > 100) throw new Error('mintReferenceCodes: exhausted attempts');
      const need = n - codes.size;
      const candidates = Array.from(new Set(Array.from({ length: need }, () => generateReferenceCode(year)))).filter(
        (c) => !codes.has(c),
      );
      if (candidates.length === 0) continue;
      const taken = await tx
        .select({ rc: respondents.referenceCode })
        .from(respondents)
        .where(inArray(respondents.referenceCode, candidates));
      const takenSet = new Set(taken.map((t) => t.rc));
      for (const c of candidates) if (!takenSet.has(c)) codes.add(c);
    }
    return Array.from(codes).slice(0, n);
  }

  /** Roll back an active batch within 14 days — soft-delete via status flip. */
  static async rollback(params: {
    batchId: string;
    reason: string;
    actorId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ batchId: string; rowsAffected: number }> {
    const { batchId, reason, actorId, ipAddress, userAgent } = params;

    if (!reason || reason.trim().length < ROLLBACK_REASON_MIN) {
      throw new AppError('VALIDATION_ERROR', `A rollback reason of at least ${ROLLBACK_REASON_MIN} characters is required.`, 400);
    }

    return db.transaction(async (tx) => {
      const batchRows = await tx
        .select()
        .from(importBatches)
        .where(eq(importBatches.id, batchId))
        .limit(1)
        .for('update');
      const batch = batchRows[0];

      if (!batch) {
        throw new AppError('NOT_FOUND', 'Import batch not found.', 404);
      }
      if (batch.status !== 'active') {
        throw new AppError('ALREADY_ROLLED_BACK', 'This batch has already been rolled back.', 409);
      }
      const windowMs = ROLLBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      if (batch.uploadedAt.getTime() < Date.now() - windowMs) {
        throw new AppError(
          'ROLLBACK_WINDOW_EXPIRED',
          `The ${ROLLBACK_WINDOW_DAYS}-day rollback window for this batch has expired. Use per-record erasure instead.`,
          403,
        );
      }

      await tx.update(importBatches).set({ status: 'rolled_back' }).where(eq(importBatches.id, batchId));

      const affected = await tx
        .update(respondents)
        .set({ status: 'rolled_back', updatedAt: new Date() })
        .where(and(eq(respondents.importBatchId, batchId), sql`${respondents.status} <> 'rolled_back'`))
        .returning({ id: respondents.id });

      await AuditService.logActionTx(tx, {
        actorId,
        action: AUDIT_ACTIONS.IMPORT_BATCH_ROLLED_BACK,
        targetResource: 'import_batch',
        targetId: batchId,
        details: { batchId, reason, rowsAffected: affected.length },
        ipAddress,
        userAgent,
      });

      logger.info({ event: 'import.rolled_back', batchId, rowsAffected: affected.length });

      return { batchId, rowsAffected: affected.length };
    });
  }

  /** Paginated batch list with optional filters. */
  static async list(params: {
    page?: number;
    pageSize?: number;
    source?: string;
    status?: string;
    uploadedBy?: string;
  }): Promise<{ batches: (typeof importBatches.$inferSelect)[]; page: number; pageSize: number; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));

    const conds: SQL[] = [];
    if (params.source) conds.push(eq(importBatches.source, params.source));
    if (params.status) {
      if (!(importBatchStatusTypes as readonly string[]).includes(params.status)) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Invalid status filter '${params.status}'. Expected one of: ${importBatchStatusTypes.join(', ')}.`,
          400,
        );
      }
      conds.push(eq(importBatches.status, params.status as (typeof importBatchStatusTypes)[number]));
    }
    if (params.uploadedBy) conds.push(eq(importBatches.uploadedBy, params.uploadedBy));
    const where = conds.length ? (conds.length === 1 ? conds[0] : and(...conds)) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(importBatches)
        .where(where)
        .orderBy(desc(importBatches.uploadedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ n: sql<number>`count(*)::int` }).from(importBatches).where(where),
    ]);

    return { batches: rows, page, pageSize, total: totalRows[0]?.n ?? 0 };
  }

  /** Single batch detail. */
  static async get(id: string): Promise<typeof importBatches.$inferSelect> {
    const rows = await db.select().from(importBatches).where(eq(importBatches.id, id)).limit(1);
    if (rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Import batch not found.', 404);
    }
    return rows[0];
  }

  /**
   * Render a batch's failure report as CSV (AC#8 — "parser-failure report
   * download as CSV"). Flattens both the per-row ingest dispositions
   * (failed/skipped/matched) and the parser-level failures (unreadable rows)
   * into one sheet. Throws NOT_FOUND for an unknown batch.
   */
  static async getFailureReportCsv(id: string): Promise<{ filename: string; csv: string }> {
    const batch = await ImportService.get(id);
    const report = (batch.failureReport ?? {}) as {
      dispositions?: IngestDisposition[];
      parserFailures?: ParseFailure[];
    };

    const rows: string[][] = [['row_index', 'category', 'reason', 'matched_respondent_id_hash']];
    for (const d of report.dispositions ?? []) {
      rows.push([String(d.rowIndex), d.category, d.reason, d.matchedRespondentIdHash ?? '']);
    }
    for (const f of report.parserFailures ?? []) {
      rows.push([String(f.rowIndex), 'parse_failure', f.reason, '']);
    }

    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    return { filename: `import-batch-${id}-failures.csv`, csv };
  }

  /**
   * Delete drafts that are past their TTL or already consumed. Called
   * opportunistically at the start of every dry-run so PII-bearing
   * `parsed_result` payloads never linger past a draft's usefulness (NDPA data
   * minimisation). Returns the number of rows removed.
   */
  static async pruneStaleDrafts(): Promise<number> {
    const removed = await db
      .delete(importBatchDrafts)
      .where(or(lte(importBatchDrafts.expiresAt, new Date()), isNotNull(importBatchDrafts.usedAt)))
      .returning({ id: importBatchDrafts.id });
    if (removed.length > 0) {
      logger.info({ event: 'import.drafts_pruned', count: removed.length });
    }
    return removed.length;
  }
}

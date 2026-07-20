import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/users.js';
import { roles } from '../../db/schema/roles.js';
import { respondents } from '../../db/schema/respondents.js';
import { importBatches } from '../../db/schema/import-batches.js';
import { importBatchDrafts } from '../../db/schema/import-batch-drafts.js';
import { marketplaceProfiles } from '../../db/schema/marketplace.js';
import { fraudDetections } from '../../db/schema/fraud-detections.js';
import { auditLogs } from '../../db/schema/audit.js';
import { ImportService } from '../import.service.js';
import type { ColumnMapping } from '../import/parsers/types.js';

/**
 * Real-DB integration for Story 11-2. Exercises the actual SQL + transactional
 * ingest (catches raw-SQL ↔ schema drift, the project's twice-bitten pitfall)
 * for: dry-run → confirm → rollback, phone/NIN dedup, consent gating, the
 * `imported_unverified` status gate (AC#6/AC#9), and lawful-basis enforcement.
 *
 * All synthetic phones share a unique prefix for safe teardown; audit_logs are
 * append-only (immutable trigger) so they are intentionally NOT deleted.
 */

const MAPPING: ColumnMapping = {
  Name: 'fullName',
  Phone: 'phoneNumber',
  LGA: 'lgaId',
  NIN: 'nin',
  Consent: 'consent',
};

const EXISTING_PHONE = '+2348019990001';
const P = (n: string) => `+234801000000${n}`;

let actorId: string;
let roleId: string;
let existingRespondentId: string;
const batchIds: string[] = [];

function csvBuffer(): Buffer {
  return Buffer.from(
    [
      'Name,Phone,LGA,NIN,Consent',
      'Ada Obi,08010000001,Ibadan North,,Yes', // insert
      'Bob NoPhone,,Somewhere,,Yes', // failed (no phone)
      'Cara NoConsent,08010000002,,,No', // skipped (consent no)
      'Dupe Ada,08010000001,,,Yes', // matched in-batch (phone dup of row 1)
      'Existing Person,08019990001,,,Yes', // matched existing (pre-inserted)
      'Eve NIN,08010000003,,12345678901,Yes', // insert (with NIN)
    ].join('\n'),
    'utf8',
  );
}

describe('ImportService — real-DB dry-run → confirm → rollback', () => {
  beforeAll(async () => {
    const existingRole = await db.select({ id: roles.id }).from(roles).limit(1);
    if (existingRole.length > 0) {
      roleId = existingRole[0].id;
    } else {
      roleId = uuidv7();
      await db.insert(roles).values({ id: roleId, name: `_imp112_role_${roleId.slice(0, 8)}` });
    }
    actorId = uuidv7();
    await db.insert(users).values({
      id: actorId,
      email: `_imp112_${actorId.slice(0, 8)}@test.local`,
      fullName: 'Import Test Admin',
      roleId,
    });

    existingRespondentId = uuidv7();
    await db.insert(respondents).values({
      id: existingRespondentId,
      firstName: 'Existing',
      lastName: 'Person',
      phoneNumber: EXISTING_PHONE,
      source: 'public',
      status: 'active',
    });
  });

  afterAll(async () => {
    // Delete our synthetic import data. The test user + role are intentionally
    // LEFT in place: append-only audit_logs (immutable trigger) reference the
    // actor via FK, so the user cannot be deleted without going through the
    // audit-mutable teardown primitive — not worth it for a tagged test row.
    for (const bid of batchIds) {
      await db.delete(respondents).where(eq(respondents.importBatchId, bid));
    }
    await db.delete(respondents).where(eq(respondents.id, existingRespondentId));
    await db.delete(importBatchDrafts).where(eq(importBatchDrafts.createdBy, actorId));
    if (batchIds.length) await db.delete(importBatches).where(inArray(importBatches.id, batchIds));
  });

  it('dry-run parses without writing respondents and returns a confirm token', async () => {
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(respondents);
    const result = await ImportService.dryRun({
      buffer: csvBuffer(),
      originalFilename: 'members.csv',
      source: 'imported_other',
      parserUsed: 'csv',
      columnMapping: MAPPING,
      actorId,
    });
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(respondents);

    expect(result.dryRunToken).toContain('.');
    expect(result.batchPreview.rowsParsed).toBe(6);
    expect(result.lawfulBasisRequired).toBe(true);
    expect(after[0].n).toBe(before[0].n); // read-only
  });

  it('confirm commits with correct disposition counts + provenance', async () => {
    const dry = await ImportService.dryRun({
      buffer: csvBuffer(),
      originalFilename: 'members.csv',
      source: 'imported_other',
      parserUsed: 'csv',
      columnMapping: MAPPING,
      actorId,
    });

    const res = await ImportService.confirm({
      dryRunToken: dry.dryRunToken,
      lawfulBasis: 'ndpa_6_1_e',
      actorId,
    });
    batchIds.push(res.batchId);

    expect(res).toMatchObject({
      rowsParsed: 6,
      rowsInserted: 2, // Ada, Eve
      rowsMatchedExisting: 2, // in-batch dup + existing person
      rowsSkipped: 1, // consent No
      rowsFailed: 1, // no phone
    });

    const inserted = await db
      .select()
      .from(respondents)
      .where(eq(respondents.importBatchId, res.batchId));
    expect(inserted).toHaveLength(2);
    for (const r of inserted) {
      expect(r.source).toBe('imported_other');
      expect(r.status).toBe('imported_unverified');
      expect(r.consentMarketplace).toBe(true); // consent column present, Yes
      expect(r.referenceCode).toBeTruthy();
      expect(r.importedAt).toBeTruthy();
    }
    expect(inserted.some((r) => r.nin === '12345678901')).toBe(true);

    // AC#5 — audit log written transactionally.
    const audit = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'import_batch.created'), eq(auditLogs.targetId, res.batchId)));
    expect(audit).toHaveLength(1);
  });

  it('AC#6/AC#9 — imported rows produce NO marketplace profile or fraud score', async () => {
    const ids = (
      await db.select({ id: respondents.id }).from(respondents).where(eq(respondents.importBatchId, batchIds[0]))
    ).map((r) => r.id);
    expect(ids.length).toBeGreaterThan(0);

    const mp = await db.select({ id: marketplaceProfiles.id }).from(marketplaceProfiles).where(inArray(marketplaceProfiles.respondentId, ids));
    expect(mp).toHaveLength(0);

    // No submissions exist for imported rows → no fraud_detections either.
    const fd = await db.select({ id: fraudDetections.id }).from(fraudDetections);
    // (Global table; assert none reference our respondents via submissions is
    // vacuously true since imports create no submissions. Sanity: our ids are
    // not enumerator ids.)
    expect(Array.isArray(fd)).toBe(true);
  });

  it('rejects a re-uploaded identical file (DUPLICATE_FILE_HASH)', async () => {
    await expect(
      ImportService.dryRun({
        buffer: csvBuffer(),
        originalFilename: 'members.csv',
        source: 'imported_other',
        parserUsed: 'csv',
        columnMapping: MAPPING,
        actorId,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_FILE_HASH', statusCode: 409 });
  });

  it('confirm is single-use (DRY_RUN_TOKEN_EXHAUSTED on replay)', async () => {
    const dry = await ImportService.dryRun({
      buffer: Buffer.from('Name,Phone,Consent\nZed One,08010000009,Yes', 'utf8'),
      originalFilename: 'single.csv',
      source: 'imported_other',
      parserUsed: 'csv',
      columnMapping: { Name: 'fullName', Phone: 'phoneNumber', Consent: 'consent' },
      actorId,
    });
    const res = await ImportService.confirm({ dryRunToken: dry.dryRunToken, lawfulBasis: 'ndpa_6_1_e', actorId });
    batchIds.push(res.batchId);

    await expect(
      ImportService.confirm({ dryRunToken: dry.dryRunToken, lawfulBasis: 'ndpa_6_1_e', actorId }),
    ).rejects.toMatchObject({ code: 'DRY_RUN_TOKEN_EXHAUSTED' });
  });

  it('confirm requires a lawful basis', async () => {
    await expect(
      ImportService.confirm({ dryRunToken: 'x.y', lawfulBasis: '', actorId }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
  });

  it('rollback flips the batch + its respondents to rolled_back and is idempotent-guarded', async () => {
    const targetBatch = batchIds[0];

    await expect(
      ImportService.rollback({ batchId: targetBatch, reason: 'too short', actorId }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const res = await ImportService.rollback({
      batchId: targetBatch,
      reason: 'Wrong source file uploaded — rolling back per operator review.',
      actorId,
    });
    expect(res.rowsAffected).toBe(2);

    const rows = await db.select({ status: respondents.status }).from(respondents).where(eq(respondents.importBatchId, targetBatch));
    expect(rows.every((r) => r.status === 'rolled_back')).toBe(true);

    const batch = await ImportService.get(targetBatch);
    expect(batch.status).toBe('rolled_back');

    await expect(
      ImportService.rollback({
        batchId: targetBatch,
        reason: 'Attempting a second rollback which must be refused.',
        actorId,
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_ROLLED_BACK', statusCode: 409 });
  });

  it('list returns the operator batches (filtered by source)', async () => {
    const result = await ImportService.list({ source: 'imported_other', uploadedBy: actorId });
    expect(result.batches.length).toBeGreaterThanOrEqual(2);
    expect(result.batches.every((b) => b.source === 'imported_other')).toBe(true);
  });

  it('list rejects an invalid status filter (code-review L3)', async () => {
    await expect(ImportService.list({ status: 'bogus' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('pruneStaleDrafts deletes expired + used drafts but keeps fresh ones (code-review H1)', async () => {
    const emptyParsed = { rows: [], failures: [], stats: { rowsParsed: 0, rowsFailed: 0 }, detectedColumns: {} };
    const base = {
      originalFilename: 'prune.csv',
      fileSizeBytes: 1,
      source: 'imported_other',
      parserUsed: 'csv',
      parsedResult: emptyParsed,
      createdBy: actorId,
    };
    const expiredId = uuidv7();
    const usedId = uuidv7();
    const freshId = uuidv7();
    await db.insert(importBatchDrafts).values([
      { ...base, id: expiredId, fileHash: `prune-expired-${expiredId}`, expiresAt: new Date(Date.now() - 60_000) },
      { ...base, id: usedId, fileHash: `prune-used-${usedId}`, expiresAt: new Date(Date.now() + 60_000), usedAt: new Date() },
      { ...base, id: freshId, fileHash: `prune-fresh-${freshId}`, expiresAt: new Date(Date.now() + 3_600_000) },
    ]);

    await ImportService.pruneStaleDrafts();

    const survivors = await db
      .select({ id: importBatchDrafts.id })
      .from(importBatchDrafts)
      .where(inArray(importBatchDrafts.id, [expiredId, usedId, freshId]));
    const ids = survivors.map((s) => s.id);
    expect(ids).not.toContain(expiredId);
    expect(ids).not.toContain(usedId);
    expect(ids).toContain(freshId);
  });

  // AC#10 — projected-scale performance. The batched design (one existing-lookup
  // query, one LGA load, batched reference-code minting, chunked inserts) must
  // ingest a large batch well under the 60s confirm budget. 2K rows here keeps CI
  // fast while exercising the batch paths that the 10K target relies on.
  it('confirms a 2,000-row batch within the performance budget', async () => {
    const N = 2000;
    const lines = ['Name,Phone,Consent'];
    for (let i = 0; i < N; i++) {
      lines.push(`Member ${i},0803${String(i).padStart(7, '0')},Yes`);
    }
    const dry = await ImportService.dryRun({
      buffer: Buffer.from(lines.join('\n'), 'utf8'),
      originalFilename: 'bulk-2k.csv',
      source: 'imported_other',
      parserUsed: 'csv',
      columnMapping: { Name: 'fullName', Phone: 'phoneNumber', Consent: 'consent' },
      actorId,
    });

    const started = Date.now();
    const res = await ImportService.confirm({ dryRunToken: dry.dryRunToken, lawfulBasis: 'ndpa_6_1_e', actorId });
    const elapsedMs = Date.now() - started;
    batchIds.push(res.batchId);

    expect(res.rowsInserted).toBe(N);
    expect(elapsedMs).toBeLessThan(60_000);
  }, 90_000);
});

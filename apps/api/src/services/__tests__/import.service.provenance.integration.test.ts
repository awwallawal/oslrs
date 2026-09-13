/**
 * Story 13-2 R-A2 review P1/P2 — provenance and batch integrity, END TO END on a real DB.
 *
 * Real database on purpose: this is a JSONB column on two tables carried from a draft to
 * a batch, a read-only planning pass that must agree with the write, and a backfill that
 * must never overwrite. A mocked DB would pass over a column that was never written.
 *
 * Synthetic phones use the `+23480168…` block (distinct from the other import suites) so
 * dedup against the shared test registry cannot silently turn an insert into a match.
 * audit_logs are append-only, so the actor user is intentionally left in place.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/users.js';
import { roles } from '../../db/schema/roles.js';
import { respondents } from '../../db/schema/respondents.js';
import { submissions } from '../../db/schema/submissions.js';
import { importBatches } from '../../db/schema/import-batches.js';
import { importBatchDrafts } from '../../db/schema/import-batch-drafts.js';
import { ImportService } from '../import.service.js';
import {
  IMPORT_PROVENANCE_BACKFILL,
  predictProvenanceBackfill,
  applyProvenanceBackfill,
} from '../../lib/import-provenance-backfill.js';

const ASSOC_HEADER =
  'Surname,First name,Phone number,Gender (M/F),LGA (work/live),Town / Ward,Trade / primary skill,NIN (if to hand),Consent (Yes/No)';

let seq = 0;
const phone = () => `080168${String(++seq).padStart(5, '0')}`;

let actorId: string;
const batchIds: string[] = [];

/**
 * Four rows: two people sharing one handset, and a swapped-order name pair in one LGA.
 * Unique phones per call keep dedup honest and the file hash unique.
 */
function sheet(extraRows = 0): Buffer {
  const shared = phone();
  const rows = [
    `Adeyemi,Tunde,${shared},M,Ibadan North,Bodija,Tiler,,Yes`,
    `Okonkwo,Ngozi,${shared},F,Ibadan North,Bodija,Tiler,,Yes`,
    `Bakare,Tunde,${phone()},M,Ogbomosho North,Arada,Tiler,,Yes`,
    `Tunde,Bakare,${phone()},M,Ogbomosho North,Arada,Tiler,,Yes`,
  ];
  for (let i = 0; i < extraRows; i++) rows.push(`Extra${i},Member,${phone()},M,Ibadan North,Bodija,Tiler,,Yes`);
  return Buffer.from([ASSOC_HEADER, ...rows].join('\n'), 'utf8');
}

async function dryRun(provenanceStats?: unknown, buffer = sheet()) {
  return ImportService.dryRun({
    buffer,
    originalFilename: `ra2-p1-${seq}.csv`,
    source: 'imported_association',
    parserUsed: 'csv',
    provenanceStats,
    actorId,
  });
}

beforeAll(async () => {
  const [role] = await db.select({ id: roles.id }).from(roles).limit(1);
  const roleId = role?.id ?? uuidv7();
  if (!role) await db.insert(roles).values({ id: roleId, name: `_ra2p1_role_${roleId}` });
  actorId = uuidv7();
  await db.insert(users).values({ id: actorId, email: `_ra2p1_${actorId}@test.local`, fullName: 'RA2 P1 Admin', roleId });
});

afterAll(async () => {
  for (const bid of batchIds) {
    const ours = await db.select({ id: respondents.id }).from(respondents).where(eq(respondents.importBatchId, bid));
    if (ours.length) await db.delete(submissions).where(inArray(submissions.respondentId, ours.map((r) => r.id)));
    await db.delete(respondents).where(eq(respondents.importBatchId, bid));
    await db.delete(importBatches).where(eq(importBatches.id, bid));
  }
  await db.delete(importBatchDrafts).where(eq(importBatchDrafts.createdBy, actorId));
});

describe('P1 — provenance_stats through dry-run → confirm', () => {
  it('stores a reconciled record on the draft, then on the batch, and audits it', async () => {
    const stats = { rawRows: 6, mergedRows: 1, heldRows: 1, heldByReason: { lga_unresolved: 1 }, cleanRows: 4, declaredMembers: 4 };
    const dry = await dryRun(stats);
    expect(dry.provenanceStats).toEqual(stats);

    const confirmed = await ImportService.confirm({
      dryRunToken: dry.dryRunToken,
      lawfulBasis: 'ndpa_6_1_e',
      associationName: 'ASNAT',
      actorId,
    });
    batchIds.push(confirmed.batchId);

    expect(confirmed.provenanceStatsMissing).toBe(false);
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, confirmed.batchId));
    expect(batch.provenanceStats).toEqual(stats);

    const audit = (await db.execute(sql`
      SELECT details FROM audit_logs WHERE target_id = ${confirmed.batchId}::uuid AND action = 'import_batch.created'
    `)) as { rows: Array<{ details: { provenanceStats?: unknown } }> };
    expect(audit.rows[0]?.details.provenanceStats).toEqual(stats);
  });

  /** A record that does not add up is refused BEFORE a draft exists — nothing half-written. */
  it('refuses a record that does not reconcile, and writes no draft', async () => {
    /*
     * Counted by CREATION TIME, not by total: every dry-run opportunistically prunes used
     * drafts, so the actor's draft total moves for reasons unrelated to this refusal.
     */
    const startedAt = new Date();
    await expect(dryRun({ rawRows: 6, mergedRows: 0, heldRows: 1, cleanRows: 4 })).rejects.toMatchObject({
      code: 'PROVENANCE_MISMATCH',
    });
    await expect(dryRun({ cleanRows: 99 })).rejects.toMatchObject({ code: 'PROVENANCE_MISMATCH' });
    const created = (await db.execute(sql`
      SELECT count(*)::int AS n FROM import_batch_drafts
      WHERE created_by = ${actorId}::uuid AND created_at >= ${startedAt.toISOString()}::timestamptz
    `)) as { rows: Array<{ n: number }> };
    expect(created.rows[0].n).toBe(0);
  });

  it('refuses a malformed record with a validation error', async () => {
    await expect(dryRun({ rawRows: 'seventy' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
    await expect(dryRun({ rawRows: 4, respondentNames: ['x'] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('confirms an association batch without a record, but says so', async () => {
    const dry = await dryRun();
    expect(dry.provenanceStats).toBeNull();
    const confirmed = await ImportService.confirm({ dryRunToken: dry.dryRunToken, lawfulBasis: 'ndpa_6_1_e', associationName: 'ASNAT', actorId });
    batchIds.push(confirmed.batchId);
    expect(confirmed.provenanceStatsMissing).toBe(true);
    expect(confirmed.integrity.signals).toContain('provenance_missing');
  });
});

describe('P2 — the integrity reading: predicted, recorded, and on the batch detail', () => {
  it('predicts at dry-run exactly what confirm records', async () => {
    const stats = { declaredMembers: 3, rawRows: 4, cleanRows: 4 };
    const dry = await dryRun(stats);
    expect(dry.integrity.basis).toBe('predicted');

    const confirmed = await ImportService.confirm({ dryRunToken: dry.dryRunToken, lawfulBasis: 'ndpa_6_1_e', associationName: 'ASNAT', actorId });
    batchIds.push(confirmed.batchId);
    expect(confirmed.integrity.basis).toBe('recorded');

    const { basis: _p, ...predicted } = dry.integrity;
    const { basis: _r, ...recorded } = confirmed.integrity;
    expect(recorded).toEqual(predicted);

    // The fixture's own facts, so the equality above is not two empty readings agreeing.
    expect(recorded.inserted).toBe(4);
    expect(recorded.sharedPhoneRows).toBe(2);
    expect(recorded.sameNameRows).toBe(2);
    expect(recorded.declaredGap).toBe(1);
    expect(recorded.signals).toEqual(
      expect.arrayContaining(['received_exceeds_declared', 'shared_phone_rows_present', 'same_name_rows_present']),
    );
  });

  /** The detail endpoint recomputes over the rows now on the register — and must agree with confirm. */
  it('reads the same integrity back from the stored batch', async () => {
    const dry = await dryRun({ declaredMembers: 6 }, sheet(1));
    const confirmed = await ImportService.confirm({ dryRunToken: dry.dryRunToken, lawfulBasis: 'ndpa_6_1_e', associationName: 'ASNAT', actorId });
    batchIds.push(confirmed.batchId);

    const batch = await ImportService.get(confirmed.batchId);
    const detail = await ImportService.getIntegrity(batch);
    expect(detail).toEqual(confirmed.integrity);
    expect(detail.declaredGap).toBe(-1);
    expect(detail.signals).toContain('received_below_declared');
  });
});

describe('P1 backfill — the two prod batches, against look-alike rows', () => {
  const [asnat, afan] = IMPORT_PROVENANCE_BACKFILL;

  beforeAll(async () => {
    // The real prod ids and parsed counts, so the hardcoded records reconcile exactly as they will on prod.
    for (const [entry, rowsParsed] of [[asnat, 56], [afan, 8234]] as const) {
      await db.insert(importBatches).values({
        id: entry.batchId,
        source: 'imported_association',
        originalFilename: `${entry.label}.xlsx`,
        fileHash: `ra2-p1-backfill-${entry.batchId}`,
        fileSizeBytes: 1,
        parserUsed: 'xlsx',
        rowsParsed,
        rowsInserted: rowsParsed,
        lawfulBasis: 'ndpa_6_1_e',
        uploadedBy: actorId,
      });
      batchIds.push(entry.batchId);
    }
  });

  it('predicts a clean write for both, then writes each exactly once', async () => {
    const predicted = await predictProvenanceBackfill(db);
    expect(predicted.map((p) => [p.label, p.willWrite, p.problems])).toEqual([
      ['ASNAT tilers', true, []],
      ['AFAN farming', true, []],
    ]);

    const first = await applyProvenanceBackfill(db);
    expect(first.map((o) => o.written)).toEqual([true, true]);
    const [stored] = await db.select().from(importBatches).where(eq(importBatches.id, afan.batchId));
    expect(stored.provenanceStats).toEqual(afan.stats);

    // Idempotent: a second run writes nothing and reports why.
    const second = await applyProvenanceBackfill(db);
    expect(second.map((o) => [o.written, o.alreadyRecorded])).toEqual([[false, true], [false, true]]);
  });

  /** A batch whose live row count disagrees means this is not the database the figures describe. */
  it('refuses to write when the live batch does not reconcile', async () => {
    await db.update(importBatches).set({ provenanceStats: null, rowsParsed: 55 }).where(eq(importBatches.id, asnat.batchId));
    const predicted = await predictProvenanceBackfill(db);
    const p = predicted.find((x) => x.batchId === asnat.batchId)!;
    expect(p.willWrite).toBe(false);
    expect(p.problems[0]).toMatch(/cleanRows 56 ≠ data rows in the uploaded file 55/);

    const outcomes = await applyProvenanceBackfill(db);
    expect(outcomes.find((o) => o.batchId === asnat.batchId)?.written).toBe(false);
  });
});

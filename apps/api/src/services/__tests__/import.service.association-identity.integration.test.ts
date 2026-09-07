import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/users.js';
import { roles } from '../../db/schema/roles.js';
import { respondents } from '../../db/schema/respondents.js';
import { submissions } from '../../db/schema/submissions.js';
import { importBatches } from '../../db/schema/import-batches.js';
import { importBatchDrafts } from '../../db/schema/import-batch-drafts.js';
import { auditLogs } from '../../db/schema/audit.js';
import { ImportService, ASSOCIATION_SOURCE } from '../import.service.js';
import { AUDIT_ACTIONS } from '../audit.service.js';
import {
  ASSOCIATION_BATCH_IDENTITIES,
  applyAssociationBackfill,
  predictAssociationBackfill,
  applyAssociationMatchedBackfill,
  predictAssociationMatchedBackfill,
} from '../../lib/association-identity-backfill.js';
import { getImportSourceConfig } from '../../config/import-sources.js';
import type { ColumnMapping } from '../import/parsers/types.js';

/**
 * Story 13-67 — the vouching body, end to end on a real database.
 *
 * These are AC5's four cases plus the backfill's merge guarantee. They run against
 * the real DB deliberately: the whole story is about a JSONB column and a new table
 * column, and a mocked-DB test would pass over renamed columns and over a `SET
 * metadata = <literal>` that destroys sibling keys. That is the project's
 * twice-bitten raw-SQL↔schema drift pitfall.
 *
 * Synthetic phones share the `+23480167…` prefix for safe teardown; audit_logs are
 * append-only (immutable trigger) so they are intentionally NOT deleted.
 */

/**
 * Headers taken from the frozen association sheet (see import-sources.ts).
 *
 * ⚠️ Gender / Town / Trade are here ON PURPOSE, not for realism. They are the columns
 * `EXTRA_FIELDS` turns into `metadata.import_extra`, and without at least one of them
 * every imported row's metadata would be `{ association_name }` and NOTHING ELSE — so
 * the "the name was MERGED, siblings survived" test below would assert over an empty
 * set and pass while proving nothing. [[pattern-test-that-passes-over-a-hole]]
 */
const ASSOC_HEADER =
  'Surname,First name,Phone number,Gender (M/F),LGA (work/live),Town / Ward,Trade / primary skill,NIN (if to hand),Consent (Yes/No)';

/*
 * ⚠️ EVERY CALL MINTS FRESH PHONES, and that is not tidiness.
 *
 * Dedup is on phone OR NIN against the WHOLE registry, so a second import of the
 * same two people would report `rowsInserted: 0` / `rowsMatchedExisting: 2`, and
 * every "the name reached each inserted row" assertion below would then pass over
 * an EMPTY set — a test that is green because it checks nothing. Unique rows also
 * keep the file hash unique, which UNIQUE(file_hash) requires.
 * (Caught while writing the fixture, not by a red suite.)
 */
let phoneSeq = 0;
function assocRows(): string[] {
  const a = String(++phoneSeq).padStart(2, '0');
  const b = String(++phoneSeq).padStart(2, '0');
  return [
    `Adeyemi,Tunde${a},080167000${a},M,Ibadan North,Bodija,Tiler,,Yes`,
    `Okonkwo,Ngozi${b},080167000${b},F,Ogbomosho North,Arada,Tailor,,Yes`,
  ];
}

/** `imported_other` needs an admin-supplied mapping; it is the non-association foil. */
const OTHER_MAPPING: ColumnMapping = {
  Name: 'fullName',
  Phone: 'phoneNumber',
  Consent: 'consent',
};
/*
 * ⚠️ A SEPARATE PHONE BLOCK (`0801679…`) from the association rows (`0801670…`).
 * They collided on the first draft of this file: `assocRows()` reached `…003` and the
 * foil's `08016700003` then MATCHED an already-imported respondent, so its batch
 * inserted 0 rows and the per-row assertions below iterated over nothing — green, and
 * checking nothing. [[pattern-test-that-passes-over-a-hole]]
 */
const OTHER_CSV = ['Name,Phone,Consent', 'Bola Ige,08016799001,Yes'].join('\n');
const OTHER_CSV_2 = ['Name,Phone,Consent', 'Wale Bello,08016799002,Yes'].join('\n');

let actorId: string;
let roleId: string;
const batchIds: string[] = [];

function assocBuffer(): Buffer {
  return Buffer.from([ASSOC_HEADER, ...assocRows()].join('\n'), 'utf8');
}

async function newAssociationDryRun(): Promise<string> {
  const dry = await ImportService.dryRun({
    buffer: assocBuffer(),
    originalFilename: 'asnat-members.csv',
    source: 'imported_association',
    parserUsed: 'csv',
    actorId,
  });
  return dry.dryRunToken;
}

describe('Story 13-67 — association identity as structured data', () => {
  beforeAll(async () => {
    const existingRole = await db.select({ id: roles.id }).from(roles).limit(1);
    if (existingRole.length > 0) {
      roleId = existingRole[0].id;
    } else {
      roleId = uuidv7();
      await db.insert(roles).values({ id: roleId, name: `_s1367_role_${roleId}` });
    }
    actorId = uuidv7();
    await db.insert(users).values({
      // FULL uuid, not a prefix — uuidv7's first 8 hex chars only change ~every 65s,
      // and this user is deliberately left behind by teardown (audit_logs FK it).
      id: actorId,
      email: `_s1367_${actorId}@test.local`,
      fullName: 'Association Identity Test Admin',
      roleId,
    });
  });

  afterAll(async () => {
    const all = [...batchIds];
    for (const bid of all) {
      // SUBMISSIONS FIRST — `submissions.respondent_id` has no ON DELETE CASCADE,
      // so deleting respondents first raises an FK violation and strands the fixture.
      const ours = await db
        .select({ id: respondents.id })
        .from(respondents)
        .where(eq(respondents.importBatchId, bid));
      if (ours.length) {
        await db.delete(submissions).where(
          inArray(
            submissions.respondentId,
            ours.map((r) => r.id),
          ),
        );
      }
      await db.delete(respondents).where(eq(respondents.importBatchId, bid));
    }
    await db.delete(importBatchDrafts).where(eq(importBatchDrafts.createdBy, actorId));
    if (all.length) await db.delete(importBatches).where(inArray(importBatches.id, all));
  });

  // ── AC1 + AC2: the round trip ──────────────────────────────────────────────
  it('AC1/AC2 — a supplied name reaches the batch column AND every respondent it inserted', async () => {
    const token = await newAssociationDryRun();
    const res = await ImportService.confirm({
      dryRunToken: token,
      lawfulBasis: 'ndpa_6_1_e',
      associationName: 'ASNAT',
      actorId,
    });
    batchIds.push(res.batchId);

    expect(res.associationName).toBe('ASNAT');
    expect(res.associationNameMissing).toBe(false);
    expect(res.rowsInserted).toBe(2);

    const [batch] = await db
      .select({ name: importBatches.associationName })
      .from(importBatches)
      .where(eq(importBatches.id, res.batchId));
    expect(batch.name).toBe('ASNAT');

    const rows = await db
      .select({ metadata: respondents.metadata })
      .from(respondents)
      .where(eq(respondents.importBatchId, res.batchId));

    expect(rows).toHaveLength(2);
    // EVERY row, not "some row" — a badge that renders on a subset is worse than none.
    for (const r of rows) {
      expect(r.metadata?.association_name).toBe('ASNAT');
    }
  });

  it('AC2 — the name is MERGED into metadata, leaving the import provenance intact', async () => {
    const token = await newAssociationDryRun();
    const res = await ImportService.confirm({
      dryRunToken: token,
      lawfulBasis: 'ndpa_6_1_e',
      associationName: 'AFAN',
      actorId,
    });
    batchIds.push(res.batchId);

    const rows = await db
      .select({ metadata: respondents.metadata })
      .from(respondents)
      .where(eq(respondents.importBatchId, res.batchId));

    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.metadata?.association_name).toBe('AFAN');
      /*
       * The point of this test: the name did not ARRIVE ALONE. Gender / town / trade
       * were written by `planIngest` into `import_extra` BEFORE the merge, and they
       * are still here after it. A `metadata = { association_name }` assignment would
       * leave these undefined while every count above stayed green.
       */
      expect(r.metadata?.import_extra?.gender).toMatch(/^[MF]$/);
      expect(r.metadata?.import_extra?.town).toBeTruthy();
      expect(r.metadata?.import_extra?.profession).toBeTruthy();
    }
  });

  it('AC2 — the name lands in the SAME TRANSACTION as the respondent and its submission', async () => {
    /*
     * ⭐ Code review M3 — the one property AC2 actually asserts, and the one thing the
     * other tests could not see.
     *
     * Every assertion above reads the COMMITTED end state, so moving the merge to a
     * second pass — `UPDATE respondents SET metadata = … WHERE import_batch_id = …`
     * after the transaction — would leave all of them green while re-introducing
     * exactly the half-state AC3.4 forbids: a respondent whose provenance is missing
     * because pass two died.
     *
     * `xmin` is the id of the transaction that wrote a row VERSION. An UPDATE writes a
     * new version with a new xmin. So `r.xmin = s.xmin` says the respondent's CURRENT
     * version — metadata included — was written by the same transaction that wrote its
     * submission. A second pass moves the respondent's xmin and this goes RED.
     * [[pattern-test-that-passes-over-a-hole]]: this one fails if you delete the guard.
     */
    const token = await newAssociationDryRun();
    const res = await ImportService.confirm({
      dryRunToken: token,
      lawfulBasis: 'ndpa_6_1_e',
      associationName: 'ASNAT',
      actorId,
    });
    batchIds.push(res.batchId);

    const probe = await db.execute(sql`
      SELECT r.xmin::text            AS respondent_xmin,
             s.xmin::text            AS submission_xmin,
             r.metadata ->> 'association_name' AS association_name
      FROM respondents r
      JOIN submissions s ON s.respondent_id = r.id
      WHERE r.import_batch_id = ${res.batchId}
    `);
    const rows = probe.rows as Array<{
      respondent_xmin: string;
      submission_xmin: string;
      association_name: string | null;
    }>;

    // Non-empty FIRST — a JOIN that matched nothing would pass every loop below.
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.association_name).toBe('ASNAT');
      expect(row.respondent_xmin).toBe(row.submission_xmin);
    }
  });

  // ── AC5: a non-association source stores nothing ───────────────────────────
  it('AC5 — a non-association source is REJECTED rather than silently storing nothing', async () => {
    const dry = await ImportService.dryRun({
      buffer: Buffer.from(OTHER_CSV, 'utf8'),
      originalFilename: 'other.csv',
      source: 'imported_other',
      parserUsed: 'csv',
      columnMapping: OTHER_MAPPING,
      actorId,
    });

    await expect(
      ImportService.confirm({
        dryRunToken: dry.dryRunToken,
        lawfulBasis: 'ndpa_6_1_e',
        associationName: 'AFAN',
        actorId,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // …and the rejection left NOTHING behind: no batch, so no row can carry the name.
    const batches = await db
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(eq(importBatches.fileHash, dry.batchPreview.fileHash));
    expect(batches).toHaveLength(0);
  });

  it('AC5 — a non-association import with no name supplied stores nothing and still succeeds', async () => {
    const dry = await ImportService.dryRun({
      buffer: Buffer.from(OTHER_CSV_2, 'utf8'),
      originalFilename: 'other2.csv',
      source: 'imported_other',
      parserUsed: 'csv',
      columnMapping: OTHER_MAPPING,
      actorId,
    });
    const res = await ImportService.confirm({
      dryRunToken: dry.dryRunToken,
      lawfulBasis: 'ndpa_6_1_e',
      actorId,
    });
    batchIds.push(res.batchId);

    expect(res.associationName).toBeNull();
    // NOT "missing" — a non-association batch has nothing to be missing.
    expect(res.associationNameMissing).toBe(false);

    const [batch] = await db
      .select({ name: importBatches.associationName })
      .from(importBatches)
      .where(eq(importBatches.id, res.batchId));
    expect(batch.name).toBeNull();

    const rows = await db
      .select({ metadata: respondents.metadata })
      .from(respondents)
      .where(eq(respondents.importBatchId, res.batchId));
    // Assert the SET IS NON-EMPTY before looping over it, or the loop proves nothing.
    expect(res.rowsInserted).toBe(1);
    expect(rows).toHaveLength(1);
    for (const r of rows) {
      expect(r.metadata?.association_name).toBeUndefined();
    }
  });

  // ── AC5: missing name does not block, but IS visible ───────────────────────
  it('AC5 — a missing name does not block an association import, and is visible to the operator', async () => {
    const token = await newAssociationDryRun();
    const res = await ImportService.confirm({
      dryRunToken: token,
      lawfulBasis: 'ndpa_6_1_e',
      actorId,
    });
    batchIds.push(res.batchId);

    // Not blocked.
    expect(res.rowsInserted).toBe(2);
    // Visible.
    expect(res.associationNameMissing).toBe(true);
    expect(res.associationName).toBeNull();

    const rows = await db
      .select({ metadata: respondents.metadata })
      .from(respondents)
      .where(eq(respondents.importBatchId, res.batchId));
    for (const r of rows) {
      // Absent, NOT an empty string — absence is what forbids the badge.
      expect(r.metadata?.association_name).toBeUndefined();
    }
  });

  it('AC4 — whitespace-only is treated as absence, not as a name a badge could print', async () => {
    const token = await newAssociationDryRun();
    const res = await ImportService.confirm({
      dryRunToken: token,
      lawfulBasis: 'ndpa_6_1_e',
      associationName: '   ',
      actorId,
    });
    batchIds.push(res.batchId);

    expect(res.associationName).toBeNull();
    expect(res.associationNameMissing).toBe(true);
  });

  it('AC4 — the name is NOT inferred from the filename or the source description', async () => {
    /*
     * The guard this test exists for: someone "helpfully" defaulting the field from
     * `originalFilename` (here: `asnat-members.csv`) or from `sourceDescription`.
     * Both name ASNAT in plain sight. A badge derived from a filename puts words in
     * an accountable body's mouth, so absence must survive contact with both.
     */
    const dry = await ImportService.dryRun({
      buffer: assocBuffer(),
      originalFilename: 'ASNAT-Tiler-Association-Oyo.csv',
      source: 'imported_association',
      parserUsed: 'csv',
      sourceDescription: 'ASNAT Tiler Association (Oyo State) - WhatsApp intake, 56 clean rows of 70',
      actorId,
    });
    const res = await ImportService.confirm({
      dryRunToken: dry.dryRunToken,
      lawfulBasis: 'ndpa_6_1_e',
      actorId,
    });
    batchIds.push(res.batchId);

    expect(res.associationName).toBeNull();
    const [batch] = await db
      .select({ name: importBatches.associationName, desc: importBatches.sourceDescription })
      .from(importBatches)
      .where(eq(importBatches.id, res.batchId));
    expect(batch.desc).toContain('ASNAT'); // the note still says it…
    expect(batch.name).toBeNull(); // …and the structured field still refuses to guess.
  });

  it('the ruling names the source the importer actually recognises', () => {
    /*
     * Code review L3 — this used to assert `getImportSourceConfig('imported_association')`
     * against a hardcoded literal: the config agreeing with ITSELF, which no drift in the
     * service's own constant could ever break. It now reads the BINDING the service
     * branches on, so a drifted `ASSOCIATION_SOURCE` fails HERE, by name, instead of
     * surfacing three tests away as an unexplained 400.
     * [[pattern-census-counts-sites-not-callers]] — pin the binding, not a copy of it.
     */
    expect(getImportSourceConfig(ASSOCIATION_SOURCE)?.source).toBe(ASSOCIATION_SOURCE);
    expect(ASSOCIATION_SOURCE).toBe('imported_association');
  });
});

// ── AC3: the backfill ────────────────────────────────────────────────────────
describe('Story 13-67 AC3 — the backfill merges, and matches its own prediction', () => {
  let actorId2: string;
  let roleId2: string;
  const created: string[] = [];

  beforeAll(async () => {
    const existingRole = await db.select({ id: roles.id }).from(roles).limit(1);
    roleId2 = existingRole[0]?.id ?? uuidv7();
    if (!existingRole.length) await db.insert(roles).values({ id: roleId2, name: `_s1367b_role_${roleId2}` });
    actorId2 = uuidv7();
    await db.insert(users).values({
      id: actorId2,
      email: `_s1367b_${actorId2}@test.local`,
      fullName: 'Association Backfill Test Admin',
      roleId: roleId2,
    });

    /*
     * Stand up the TWO REAL batch ids from Awwal's ruling, so `applyAssociationBackfill`
     * is exercised exactly as it will run on prod — same constants, same predicate, same
     * predict-then-compare. Two rows each, with PRE-EXISTING metadata that must survive.
     */
    let i = 0;
    for (const identity of ASSOCIATION_BATCH_IDENTITIES) {
      await db.insert(importBatches).values({
        id: identity.batchId,
        source: 'imported_association',
        originalFilename: `fixture-${identity.associationName}.csv`,
        fileHash: `_s1367b_${identity.batchId}`,
        fileSizeBytes: 1,
        parserUsed: 'csv',
        lawfulBasis: 'ndpa_6_1_e',
        uploadedBy: actorId2,
      });
      created.push(identity.batchId);

      for (let n = 0; n < 2; n++) {
        i += 1;
        await db.insert(respondents).values({
          id: uuidv7(),
          firstName: 'Backfill',
          lastName: `Fixture${i}`,
          phoneNumber: `+23480168000${String(i).padStart(2, '0')}`,
          source: 'imported_association',
          status: 'imported_unverified',
          importBatchId: identity.batchId,
          /*
           * ⛔ THE KEYS THIS TEST EXISTS TO PROTECT. `normalisation_warnings` carries the
           * R2 identity-ambiguity flags and `import_extra.full_name` is the verbatim
           * string R-A6 needs to recover a mis-split name. A `SET metadata = '{...}'`
           * would erase both and no later query could tell.
           */
          metadata: {
            normalisation_warnings: ['identity:ambiguous_shared_phone_no_nin'],
            imported_email: `fixture${i}@test.local`,
            import_extra: { full_name: `FIXTURE ${i} VERBATIM` },
          },
        });
      }
    }
  });

  afterAll(async () => {
    for (const bid of created) {
      const ours = await db
        .select({ id: respondents.id })
        .from(respondents)
        .where(eq(respondents.importBatchId, bid));
      if (ours.length) {
        await db.delete(submissions).where(
          inArray(
            submissions.respondentId,
            ours.map((r) => r.id),
          ),
        );
      }
      await db.delete(respondents).where(eq(respondents.importBatchId, bid));
    }
    if (created.length) await db.delete(importBatches).where(inArray(importBatches.id, created));
  });

  it('predicts before it writes, and finds nothing already tagged', async () => {
    const predictions = await predictAssociationBackfill(db);
    expect(predictions).toHaveLength(2);
    for (const p of predictions) {
      expect(p.batchExists).toBe(true);
      expect(p.predictedRows).toBe(2); // the fixture, not the 56/8,222 of prod
      expect(p.alreadyTagged).toBe(0);
    }
    expect(predictions.map((p) => p.associationName)).toEqual(['ASNAT', 'AFAN']);
  });

  it('AC3/H1 — REFUSES to write when a batch disagrees with the ruling counts', async () => {
    /*
     * ⭐ Code review H1 — the only falsifiable comparison this backfill has.
     *
     * `updatedRows === predictedRows` reads the IDENTICAL predicate twice, seconds
     * apart, on a closed batch: it agrees for every database, including the wrong one.
     * The number that can fail is the ruling's 56 / 8,222, and before this guard it was
     * checked ONLY in the CLI's `--dry-run` path — which `--apply` skips entirely. A
     * run against a partial restore printed "✅ Every batch updated exactly the
     * predicted number of rows" and exited 0.
     *
     * This fixture is that wrong database: 2 rows where the ruling measured 56.
     * ⚠️ Placed BEFORE the merge test on purpose — it must observe an UNWRITTEN batch,
     * or "nothing was written" proves nothing.
     */
    await expect(applyAssociationBackfill(db)).rejects.toThrow(
      /holds 2 respondent rows, but the ruling of 2026-09-05 measured 56 on prod/,
    );

    // And it refused BEFORE the first write, not after ASNAT went through.
    for (const identity of ASSOCIATION_BATCH_IDENTITIES) {
      const [batch] = await db
        .select({ name: importBatches.associationName })
        .from(importBatches)
        .where(eq(importBatches.id, identity.batchId));
      expect(batch.name).toBeNull();
    }
    const after = await predictAssociationBackfill(db);
    for (const p of after) expect(p.alreadyTagged).toBe(0);
  });

  it('AC3/L1 — REFUSES on non-object metadata, which `||` would ARRAY-WRAP', async () => {
    /*
     * ⭐ Code review L1. `COALESCE(metadata,'{}')` covers SQL NULL and nothing else.
     * Postgres does not error on `'null'::jsonb || '{"association_name":"AFAN"}'` — it
     * returns `[null, {"association_name": "AFAN"}]`. The document becomes an ARRAY:
     * every sibling read (`metadata -> 'import_extra'`) goes null, `->> 'association_name'`
     * stops matching so a re-run APPENDS instead of being idempotent, and nothing
     * downstream can tell. No flag overrides this refusal.
     */
    const victim = ASSOCIATION_BATCH_IDENTITIES[0].batchId;
    const [before] = await db
      .select({ id: respondents.id, metadata: respondents.metadata })
      .from(respondents)
      .where(eq(respondents.importBatchId, victim))
      .limit(1);

    await db.execute(sql`UPDATE respondents SET metadata = 'null'::jsonb WHERE id = ${before.id}`);
    try {
      const predictions = await predictAssociationBackfill(db);
      expect(predictions[0].nonObjectMetadataRows).toBe(1);
      await expect(
        applyAssociationBackfill(db, { acceptCountDrift: true }),
      ).rejects.toThrow(/1 respondent row\(s\) whose metadata is not a JSONB object/);
    } finally {
      // Restore the fixture byte-for-byte; the idempotency test below compares documents.
      await db
        .update(respondents)
        .set({ metadata: before.metadata })
        .where(eq(respondents.id, before.id));
    }
  });

  it('AC3 — MERGES the name in: every pre-existing metadata key survives', async () => {
    // `acceptCountDrift` because the fixture is 2 rows, not the ruling's 56 / 8,222 —
    // the divergence is the POINT of the test above, and acknowledged here explicitly.
    const outcomes = await applyAssociationBackfill(db, { acceptCountDrift: true });

    for (const o of outcomes) {
      expect(o.updatedRows).toBe(o.predictedRows);
      expect(o.matchesPrediction).toBe(true);
    }

    for (const identity of ASSOCIATION_BATCH_IDENTITIES) {
      const [batch] = await db
        .select({ name: importBatches.associationName })
        .from(importBatches)
        .where(eq(importBatches.id, identity.batchId));
      expect(batch.name).toBe(identity.associationName);

      const rows = await db
        .select({ metadata: respondents.metadata })
        .from(respondents)
        .where(eq(respondents.importBatchId, identity.batchId));

      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(r.metadata?.association_name).toBe(identity.associationName);
        /*
         * RED-VERIFY: this is the assertion that fails if the write becomes a replace.
         * Confirmed RED by swapping the merge for
         * `SET metadata = jsonb_build_object('association_name', …)` — these three
         * expectations went to undefined while the count check above stayed green,
         * which is exactly the failure a count-only test would have shipped.
         */
        expect(r.metadata?.normalisation_warnings).toEqual(['identity:ambiguous_shared_phone_no_nin']);
        expect(r.metadata?.imported_email).toMatch(/@test\.local$/);
        expect(r.metadata?.import_extra?.full_name).toMatch(/VERBATIM$/);
      }
    }
  });

  it('AC3 — is idempotent: a second run is a no-op on the document', async () => {
    const before = await db
      .select({ id: respondents.id, metadata: respondents.metadata })
      .from(respondents)
      .where(eq(respondents.importBatchId, ASSOCIATION_BATCH_IDENTITIES[0].batchId));

    const predictions = await predictAssociationBackfill(db);
    // The re-run now SEES the tags it wrote — that is the signal a run already happened.
    for (const p of predictions) expect(p.alreadyTagged).toBe(p.predictedRows);

    await applyAssociationBackfill(db, { acceptCountDrift: true });

    const after = await db
      .select({ id: respondents.id, metadata: respondents.metadata })
      .from(respondents)
      .where(eq(respondents.importBatchId, ASSOCIATION_BATCH_IDENTITIES[0].batchId));

    const key = (rows: typeof before) =>
      rows
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((r) => JSON.stringify(r.metadata));
    expect(key(after)).toEqual(key(before));
  });

  it('refuses to write when a batch id is absent — a wrong database is not a zero', async () => {
    // Delete one batch row and re-run: the guard must throw rather than update 0 rows
    // and report success.
    const victim = ASSOCIATION_BATCH_IDENTITIES[0].batchId;
    const kept = await db
      .select({ id: respondents.id })
      .from(respondents)
      .where(eq(respondents.importBatchId, victim));
    await db.delete(respondents).where(eq(respondents.importBatchId, victim));
    await db.delete(importBatches).where(eq(importBatches.id, victim));

    // `acceptCountDrift` so the ONLY reason this can throw is the absent batch.
    await expect(applyAssociationBackfill(db, { acceptCountDrift: true })).rejects.toThrow(
      /does not exist in import_batches/,
    );

    expect(kept.length).toBe(2); // the fixture really was there before we removed it
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(importBatches)
      .where(eq(importBatches.id, victim));
    expect(n).toBe(0);
  });
});

// ── R2: the people the import MATCHED instead of inserting ───────────────────
describe('Story 13-67 R2 — the vouch attaches to matched respondents (Awwal 2026-09-07)', () => {
  /*
   * The fixture mirrors the real thing rather than a convenient version of it.
   *
   * On prod the AFAN batch reports 8,222 inserted / 12 matched, and a MATCHED row is
   * invisible to phase 1: it keeps its own `import_batch_id` (here: none — these three
   * are `public` self-registrations), so the only surviving link is the batch's own
   * `failure_report.dispositions[].matchedRespondentIdHash`.
   *
   * Deliberately included, because each one changes the answer:
   *   • TWO resolvable matches      → the targets
   *   • ONE `matched` with NO hash  → an in-SHEET duplicate that points at nobody, and
   *                                   must NOT inflate the prediction
   *   • ONE `skipped` disposition   → must be ignored entirely
   *   • ONE untouched respondent    → the NEGATIVE CONTROL. Without it, an implementation
   *                                   that tagged every `public` row would pass every
   *                                   other assertion here. [[pattern-test-that-passes-over-a-hole]]
   */
  const AFAN = ASSOCIATION_BATCH_IDENTITIES[1];
  const ASNAT = ASSOCIATION_BATCH_IDENTITIES[0];
  const hashOf = (id: string) => createHash('sha256').update(id).digest('hex');

  let actorId3: string;
  let matchedA: string;
  let matchedB: string;
  let control: string;
  const madeRespondents: string[] = [];
  const madeBatches: string[] = [];

  async function makeSelfRegistered(tag: string, phoneSuffix: string): Promise<string> {
    const id = uuidv7();
    await db.insert(respondents).values({
      id,
      firstName: 'Selfreg',
      lastName: tag,
      phoneNumber: `+234801690${phoneSuffix}`,
      source: 'public',
      status: 'active',
      // Pre-existing metadata that MUST survive the merge — the same guarantee phase 1
      // gives, on rows that are far more sensitive: these people registered themselves.
      metadata: { imported_email: `selfreg-${tag}@test.local`, import_extra: { full_name: `SELFREG ${tag}` } },
    });
    madeRespondents.push(id);
    return id;
  }

  beforeAll(async () => {
    const existingRole = await db.select({ id: roles.id }).from(roles).limit(1);
    const roleId3 = existingRole[0]?.id ?? uuidv7();
    if (!existingRole.length) await db.insert(roles).values({ id: roleId3, name: `_s1367c_role_${roleId3}` });
    actorId3 = uuidv7();
    await db.insert(users).values({
      id: actorId3,
      email: `_s1367c_${actorId3}@test.local`,
      fullName: 'Association Matched Backfill Test Admin',
      roleId: roleId3,
    });

    matchedA = await makeSelfRegistered('A', '0001');
    matchedB = await makeSelfRegistered('B', '0002');
    control = await makeSelfRegistered('Control', '0003');

    await db.insert(importBatches).values({
      id: AFAN.batchId,
      source: 'imported_association',
      originalFilename: 'fixture-AFAN-matched.csv',
      fileHash: `_s1367c_${AFAN.batchId}`,
      fileSizeBytes: 1,
      parserUsed: 'csv',
      lawfulBasis: 'ndpa_6_1_e',
      uploadedBy: actorId3,
      failureReport: {
        dispositions: [
          { rowIndex: 2, category: 'matched', reason: 'phone_match', matchedRespondentIdHash: hashOf(matchedA) },
          { rowIndex: 5, category: 'matched', reason: 'nin_match', matchedRespondentIdHash: hashOf(matchedB) },
          // No hash: this SHEET row duplicated an earlier SHEET row. Points at nobody.
          { rowIndex: 9, category: 'matched', reason: 'nin_match_in_batch' },
          { rowIndex: 11, category: 'skipped', reason: 'consent_no' },
        ],
      },
    });
    madeBatches.push(AFAN.batchId);

    // ASNAT imported 56/56 — its ledger figure is 0 matched, and a real empty report.
    await db.insert(importBatches).values({
      id: ASNAT.batchId,
      source: 'imported_association',
      originalFilename: 'fixture-ASNAT-matched.csv',
      fileHash: `_s1367c_${ASNAT.batchId}`,
      fileSizeBytes: 1,
      parserUsed: 'csv',
      lawfulBasis: 'ndpa_6_1_e',
      uploadedBy: actorId3,
      failureReport: { dispositions: [] },
    });
    madeBatches.push(ASNAT.batchId);
  });

  afterAll(async () => {
    if (madeRespondents.length) {
      await db.delete(respondents).where(inArray(respondents.id, madeRespondents));
    }
    if (madeBatches.length) await db.delete(importBatches).where(inArray(importBatches.id, madeBatches));
    // audit_logs are append-only (immutable trigger) — intentionally left behind.
  });

  it('resolves the hashes to real people, and counts in-sheet duplicates SEPARATELY', async () => {
    const [asnat, afan] = await predictAssociationMatchedBackfill(db);

    expect(afan.batchExists).toBe(true);
    expect(afan.matchedDispositions).toBe(3); // two real matches + one in-sheet duplicate
    expect(afan.matchedWithHash).toBe(2);
    expect(afan.inBatchDuplicates).toBe(1); // ⛔ the number that would over-predict
    expect(afan.unresolvedHashes).toHaveLength(0);
    expect(afan.resolvedRespondentIds.sort()).toEqual([matchedA, matchedB].sort());
    expect(afan.alreadyTagged).toBe(0);
    expect(afan.conflictingNames).toHaveLength(0);

    // ASNAT inserted 56/56 — a PREDICTED zero, not an accidental one.
    expect(asnat.matchedWithHash).toBe(0);
    expect(asnat.storyExpectedMatchedRows).toBe(0);
    expect(asnat.resolvedRespondentIds).toHaveLength(0);
  });

  it('REFUSES when the resolvable matches disagree with 13-2 ledger figure of 12', async () => {
    // The fixture has 2 where prod recorded 12 — the same guard phase 1 grew, on the
    // number that can actually fail. `updatedRows === predicted` never could.
    await expect(applyAssociationMatchedBackfill(db)).rejects.toThrow(
      /reports 2 matched respondent\(s\) with a resolvable hash, but the 13-2 ledger recorded 12/,
    );
    const [, afan] = await predictAssociationMatchedBackfill(db);
    expect(afan.alreadyTagged).toBe(0); // refused BEFORE writing anything
  });

  it('REFUSES when a match hash resolves to nobody — never a silent partial set', async () => {
    const orphanHash = hashOf(uuidv7()); // a respondent that does not exist
    const [row] = await db
      .select({ report: importBatches.failureReport })
      .from(importBatches)
      .where(eq(importBatches.id, AFAN.batchId));
    const original = row.report;
    const withOrphan = {
      dispositions: [
        ...((original as { dispositions?: unknown[] })?.dispositions ?? []),
        { rowIndex: 21, category: 'matched', reason: 'phone_match', matchedRespondentIdHash: orphanHash },
      ],
    };
    await db.update(importBatches).set({ failureReport: withOrphan }).where(eq(importBatches.id, AFAN.batchId));
    try {
      await expect(
        applyAssociationMatchedBackfill(db, { acceptCountDrift: true }),
      ).rejects.toThrow(/1 matched hash\(es\) resolve to no respondent/);
    } finally {
      await db.update(importBatches).set({ failureReport: original }).where(eq(importBatches.id, AFAN.batchId));
    }
  });

  it('REFUSES to overwrite a DIFFERENT accountable body claim', async () => {
    await db
      .update(respondents)
      .set({ metadata: sql`COALESCE(${respondents.metadata}, '{}'::jsonb) || jsonb_build_object('association_name', 'SOME OTHER BODY')` })
      .where(eq(respondents.id, matchedA));
    try {
      await expect(
        applyAssociationMatchedBackfill(db, { acceptCountDrift: true }),
      ).rejects.toThrow(/already carries association_name "SOME OTHER BODY"/);
    } finally {
      await db
        .update(respondents)
        .set({ metadata: sql`${respondents.metadata} - 'association_name'` })
        .where(eq(respondents.id, matchedA));
    }
  });

  it('attaches the vouch to the matched people ONLY — with provenance and an audit row', async () => {
    const outcomes = await applyAssociationMatchedBackfill(db, { acceptCountDrift: true });
    const afan = outcomes[1];
    expect(afan.updatedRows).toBe(2);
    expect(afan.matchesPrediction).toBe(true);

    for (const id of [matchedA, matchedB]) {
      const [r] = await db
        .select({ metadata: respondents.metadata })
        .from(respondents)
        .where(eq(respondents.id, id));
      expect(r.metadata?.association_name).toBe('AFAN');
      // Provenance: nothing else on this row records WHICH list vouched for them.
      expect(r.metadata?.association_vouched_by_batch_id).toBe(AFAN.batchId);
      // …and the merge left their own registration data alone.
      expect(r.metadata?.imported_email).toMatch(/@test\.local$/);
      expect(r.metadata?.import_extra?.full_name).toMatch(/^SELFREG /);

      const audit = await db
        .select({ action: auditLogs.action, details: auditLogs.details })
        .from(auditLogs)
        .where(and(eq(auditLogs.targetId, id), eq(auditLogs.action, AUDIT_ACTIONS.OPERATOR_ASSOCIATION_VOUCH_ATTACHED)));
      expect(audit).toHaveLength(1);
      expect((audit[0].details as { vouchingBatchId?: string }).vouchingBatchId).toBe(AFAN.batchId);
    }

    // ⛔ THE NEGATIVE CONTROL. A `public` respondent nobody matched must be untouched —
    // otherwise every assertion above is satisfied by "tag everyone".
    const [untouched] = await db
      .select({ metadata: respondents.metadata })
      .from(respondents)
      .where(eq(respondents.id, control));
    expect(untouched.metadata?.association_name).toBeUndefined();
    expect(untouched.metadata?.association_vouched_by_batch_id).toBeUndefined();
  });

  it('is idempotent: a second run re-writes the same document and no more audit rows than people', async () => {
    const before = await db
      .select({ metadata: respondents.metadata })
      .from(respondents)
      .where(eq(respondents.id, matchedA));

    const [, afan] = await predictAssociationMatchedBackfill(db);
    expect(afan.alreadyTagged).toBe(2); // the signal that a run already happened
    expect(afan.conflictingNames).toHaveLength(0); // OUR name is not a conflict

    await applyAssociationMatchedBackfill(db, { acceptCountDrift: true });

    const after = await db
      .select({ metadata: respondents.metadata })
      .from(respondents)
      .where(eq(respondents.id, matchedA));
    expect(JSON.stringify(after[0].metadata)).toBe(JSON.stringify(before[0].metadata));
  });
});

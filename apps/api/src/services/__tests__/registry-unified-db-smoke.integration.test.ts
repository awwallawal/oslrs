import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { submissions } from '../../db/schema/submissions.js';
import { respondents } from '../../db/schema/respondents.js';
import { getRegistryCountCore } from '../registry-totals.service.js';
import { ExportQueryService } from '../export-query.service.js';
import { PublicInsightsService } from '../public-insights.service.js';
import {
  REGISTRY_UNIFIED_SQL_TEXT,
  REGISTRY_UNIFIED_VIEW_NAME,
  getRegistryUnifiedRows,
  registryUnifiedViewExists,
} from '../registry-unified.js';

/**
 * Real-DB SMOKE for the Story 13-33 canonical unified read.
 *
 * Proves — against the REAL schema, not mocks — the convergence the story rests
 * on:
 *  • AC1/AC5 PARITY: the physical `registry_unified` VIEW, the inline canonical
 *    SQL, `getRegistryCountCore`, and the unified export all count the SAME
 *    distinct respondents (view ≡ inline ≡ count-core ≡ export). This is what
 *    makes "belt + suspenders" safe rather than a drift trap.
 *  • AC4 INCLUSION: submission-less respondents (data_lost / imported) still
 *    appear in the read (the "nothing is missing" guarantee) with `raw_data` null.
 *  • AC3 DENSITY BANDING: the density buckets are respondent-scoped and banded —
 *    an LGA with ≥10 shows the exact count; a 1–9 LGA is banded (present, count
 *    withheld); a 0 LGA is absent.
 *  • Raw-SQL ↔ schema drift guard (the project's twice-bitten pitfall).
 *
 * Global (no scope filter — the whole registry IS the read), so exact totals
 * aren't deterministic on a shared test DB. We capture a baseline, insert a known
 * synthetic split under unique tags/LGAs, and assert DELTAS + the per-LGA facts
 * for our OWN synthetic LGAs (which no real data touches). Integration suites run
 * serially (Pitfall #37), so deltas are stable.
 */

const TAG = '_registry_unified_smoke_';
const LGA_EXACT = 'zzz_smoke_exact'; // 10 respondents → exact count on the map
const LGA_BAND = 'zzz_smoke_band';   // 3 respondents → banded (present, withheld)
const LGA_SOLO = 'zzz_smoke_solo';   // 2 respondents (completed + data_lost) → banded

const exactIds = Array.from({ length: 10 }, () => uuidv7());
const bandIds = Array.from({ length: 3 }, () => uuidv7());
const completedId = uuidv7();
const dataLostId = uuidv7();
const completedSubId = uuidv7();

const allRespondentIds = [...exactIds, ...bandIds, completedId, dataLostId];
const INSERTED = allRespondentIds.length; // 15

let baseTotal = 0;
let baseAnswers = 0;

async function inlineCount(): Promise<number> {
  const r = await db.execute(sql`SELECT COUNT(*)::int AS n FROM (${sql.raw(REGISTRY_UNIFIED_SQL_TEXT)}) ru`);
  return Number((r.rows[0] as { n: number | string }).n);
}
async function viewCount(): Promise<number> {
  const r = await db.execute(sql`SELECT COUNT(*)::int AS n FROM ${sql.raw(REGISTRY_UNIFIED_VIEW_NAME)}`);
  return Number((r.rows[0] as { n: number | string }).n);
}

describe('registry-unified — real-DB smoke (view ≡ inline ≡ count-core ≡ export)', () => {
  beforeAll(async () => {
    // Create the view from the SAME canonical SQL the service composes — so the
    // test is self-sufficient even if the migrate-init runner hasn't run here.
    await db.execute(sql.raw(`DROP VIEW IF EXISTS "${REGISTRY_UNIFIED_VIEW_NAME}"`));
    await db.execute(sql.raw(`CREATE OR REPLACE VIEW "${REGISTRY_UNIFIED_VIEW_NAME}" AS ${REGISTRY_UNIFIED_SQL_TEXT}`));

    const base = await getRegistryCountCore();
    baseTotal = base.totalRespondents;
    baseAnswers = base.withAnswers;

    // 10 exact-LGA respondents, no submission (still counted; density = 10).
    for (const id of exactIds) {
      await db.insert(respondents).values({
        id, nin: null, firstName: 'Exact', lastName: 'Person',
        status: 'active', source: 'public', lgaId: LGA_EXACT, referenceCode: `${TAG}${id}`,
      });
    }
    // 3 band-LGA respondents, imported + submission-less (also AC4 inclusion).
    for (const id of bandIds) {
      await db.insert(respondents).values({
        id, nin: null, firstName: 'Band', lastName: 'Person',
        status: 'imported_unverified', source: 'imported_association',
        lgaId: LGA_BAND, referenceCode: `${TAG}${id}`,
      });
    }
    // 1 completed respondent (with answers) in the solo LGA.
    await db.insert(respondents).values({
      id: completedId, nin: null, firstName: 'Completed', lastName: 'Person',
      status: 'active', source: 'public', lgaId: LGA_SOLO, referenceCode: `${TAG}${completedId}`,
    });
    await db.insert(submissions).values({
      id: completedSubId, submissionUid: `${TAG}${completedSubId}`,
      questionnaireFormId: 'smoke-form', respondentId: completedId,
      rawData: { gender: 'male', dob: '1990-01-01', employment_status: 'yes' },
      submittedAt: new Date(), source: 'public',
    });
    // 1 data_lost respondent (metadata flag, no submission) in the solo LGA.
    await db.insert(respondents).values({
      id: dataLostId, nin: null, firstName: 'Lost', lastName: 'Person',
      status: 'active', source: 'public', lgaId: LGA_SOLO,
      referenceCode: `${TAG}${dataLostId}`, metadata: { questionnaire_data_lost: true },
    });
  });

  afterAll(async () => {
    await db.delete(submissions).where(inArray(submissions.id, [completedSubId]));
    await db.delete(respondents).where(inArray(respondents.id, allRespondentIds));
    // Leave the view in place (idempotent; other consumers may read it).
  });

  it('the physical view exists and is queryable', async () => {
    expect(await registryUnifiedViewExists()).toBe(true);
  });

  it('AC5 PARITY: view ≡ inline ≡ count-core ≡ export (same distinct respondents)', async () => {
    const core = await getRegistryCountCore();
    const inline = await inlineCount();
    const view = await viewCount();
    const exportData = await ExportQueryService.getUnifiedExportData({});

    // Deltas over baseline all equal the number we inserted.
    expect(core.totalRespondents - baseTotal).toBe(INSERTED);
    expect(core.withAnswers - baseAnswers).toBe(1); // only the completed row

    // Absolute cross-source agreement (all read the same shape).
    expect(inline).toBe(core.totalRespondents);
    expect(view).toBe(core.totalRespondents);
    expect(exportData.totalCount).toBe(core.totalRespondents);
  });

  it('AC4 INCLUSION: submission-less respondents (imported + data_lost) appear with raw_data null', async () => {
    const rows = await getRegistryUnifiedRows();
    const byId = new Map(rows.map((r) => [r.respondent_id, r]));

    const imported = byId.get(bandIds[0]);
    expect(imported, 'imported submission-less respondent must be in the unified read').toBeTruthy();
    expect(imported!.raw_data).toBeNull();
    expect(imported!.source).toBe('imported_association');

    const lost = byId.get(dataLostId);
    expect(lost, 'data_lost respondent must be in the unified read').toBeTruthy();
    expect(lost!.raw_data).toBeNull();

    // And the completed one carries answers (one row per respondent).
    expect(byId.get(completedId)!.raw_data).toMatchObject({ gender: 'male' });
  });

  it('AC3 DENSITY: respondent-scoped + banded (≥10 exact · 1–9 banded · 0 absent)', async () => {
    const insights = await PublicInsightsService.getPublicInsights();
    const density = insights.lgaDensity;

    const exact = density.find((b) => b.label === LGA_EXACT);
    expect(exact, 'exact LGA present').toBeTruthy();
    expect(exact!.count).toBe(10); // exact count shown (>= floor)
    expect(exact!.banded).toBe(false);

    const band = density.find((b) => b.label === LGA_BAND);
    expect(band, 'banded LGA present-but-withheld').toBeTruthy();
    expect(band!.banded).toBe(true);
    expect(band!.suppressed).toBe(true);
    expect(band!.count).toBeNull(); // exact small number withheld

    const solo = density.find((b) => b.label === LGA_SOLO);
    expect(solo!.banded).toBe(true); // 2 respondents → banded
    expect(solo!.count).toBeNull();
  });

  it('AC2: density counts ALL respondents per LGA (incl. submission-less) — equals COUNT(*) over the read', async () => {
    // The band LGA has 3 submission-less imported respondents; a submission-
    // anchored query would have shown 0. Prove the unified read counts 3.
    const r = await db.execute(
      sql`SELECT COUNT(*)::int AS n FROM (${sql.raw(REGISTRY_UNIFIED_SQL_TEXT)}) ru WHERE ru.lga_id = ${LGA_BAND}`,
    );
    expect(Number((r.rows[0] as { n: number }).n)).toBe(3);
  });
});

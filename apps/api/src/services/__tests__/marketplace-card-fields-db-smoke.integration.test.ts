import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { submissions } from '../../db/schema/submissions.js';
import { respondents } from '../../db/schema/respondents.js';
import { marketplaceProfiles } from '../../db/schema/marketplace.js';
import { MarketplaceService } from '../marketplace.service.js';
import { backfillMarketplaceCardFields } from '../marketplace-card-backfill.service.js';

/**
 * Real-DB SMOKE for the Story 13-38 card fields (AC7 experience bucket, AC8
 * business name).
 *
 * WHY THIS EXISTS: `searchProfiles` and the backfill are raw
 * `db.execute(sql\`…\`)` — NOT type-checked against the Drizzle schema — and their
 * unit tests mock `db.execute`, which returns whatever rows the mock was handed
 * REGARDLESS of the SQL. So a mocked test passes even if `mp.business_name` is
 * missing from the SELECT list, or the column was never pushed. That exact class of
 * hole shipped prod 500s before (the 2026-06-09 `users.role`→`role_id` analytics
 * break). This file is the only test in the story that fails if the column or the
 * projection is absent.
 *
 * Scoped, not global: it filters on a tag unique to this file, because vitest runs
 * test FILES in parallel and a global assertion would red for another writer's row.
 *
 * [AI-Review][Medium] 2026-08-18 — that scoping used to cover the READS only. Every
 * `backfillMarketplaceCardFields({ apply: true })` here ran UNSCOPED, rewriting
 * `experience_level` and `business_name` on every marketplace profile in the test
 * database — including rows seeded by whatever file happened to be running beside
 * it. It was green only because nothing else asserts on those rows yet. The backfill
 * now takes `profileIds`, and every call below passes this file's own ids.
 */

const TAG = `_mkt_card_smoke_${Date.now()}_`;
const PROFESSION = `${TAG}profession`;

const withBusinessRespondentId = uuidv7();
const noBusinessRespondentId = uuidv7();
const legacyBucketRespondentId = uuidv7();
/** Story 13-58 — a self-registered worker an association vouched for (the eleven). */
const vouchedRespondentId = uuidv7();

const withBusinessSubId = uuidv7();
const noBusinessSubId = uuidv7();
const legacyBucketSubId = uuidv7();
const vouchedSubId = uuidv7();

const withBusinessProfileId = uuidv7();
const noBusinessProfileId = uuidv7();
const legacyBucketProfileId = uuidv7();
const vouchedProfileId = uuidv7();

const ourRespondentIds = [withBusinessRespondentId, noBusinessRespondentId, legacyBucketRespondentId, vouchedRespondentId];
const ourProfileIds = [withBusinessProfileId, noBusinessProfileId, legacyBucketProfileId, vouchedProfileId];

const BUSINESS_NAME = 'Bola Motors & Sons Autoworks';

async function seedPerson(opts: {
  respondentId: string;
  submissionId: string;
  profileId: string;
  ref: string;
  rawData: Record<string, unknown>;
  experienceLevel: string | null;
  businessName: string | null;
  /** Story 13-58 — what the PROFILE starts with. */
  associationName?: string | null;
  /** Story 13-58 — the vouch on the RESPONDENT, as 13-67 writes it. */
  respondentMetadata?: Record<string, unknown> | null;
}) {
  await db.insert(respondents).values({
    id: opts.respondentId,
    nin: null,
    firstName: 'Adekemi',
    lastName: 'Ogunlade',
    status: 'active',
    // Story 13-58 — every person seeded here is `public`, INCLUDING the one an
    // association vouched for. That is not a shortcut: it is the shape of the eleven
    // people the AFAN import MATCHED, and a source-keyed badge passes every other
    // test in this file while rendering them nothing.
    source: 'public',
    referenceCode: opts.ref,
    consentMarketplace: true,
    metadata: opts.respondentMetadata ?? null,
  });
  await db.insert(submissions).values({
    id: opts.submissionId,
    submissionUid: `${TAG}${opts.submissionId}`,
    questionnaireFormId: 'smoke-form',
    respondentId: opts.respondentId,
    rawData: opts.rawData,
    submittedAt: new Date(),
    source: 'public',
  });
  await db.insert(marketplaceProfiles).values({
    id: opts.profileId,
    respondentId: opts.respondentId,
    profession: PROFESSION,
    skills: 'auto_mechanic',
    lgaId: null,
    lgaName: 'Ibadan North',
    experienceLevel: opts.experienceLevel,
    businessName: opts.businessName,
    associationName: opts.associationName ?? null,
    verifiedBadge: false,
    consentEnriched: false,
    bio: null,
  });
}

describe('Story 13-38 card fields — real-DB smoke (raw-SQL ↔ schema parity)', () => {
  beforeAll(async () => {
    // A — volunteered a trading name; experience already on the new canon.
    await seedPerson({
      respondentId: withBusinessRespondentId,
      submissionId: withBusinessSubId,
      profileId: withBusinessProfileId,
      ref: `${TAG}A`,
      rawData: { years_experience: 'over_10', business_name: `  ${BUSINESS_NAME}  ` },
      experienceLevel: 'over_10',
      businessName: BUSINESS_NAME,
    });

    // B — no trading name: the card must stay profession-led (AC8.1). The person's
    // NAME is deliberately present on the row and in raw_data; nothing may reach it.
    await seedPerson({
      respondentId: noBusinessRespondentId,
      submissionId: noBusinessSubId,
      profileId: noBusinessProfileId,
      ref: `${TAG}B`,
      rawData: { years_experience: '1_3', firstname: 'Adekemi', surname: 'Ogunlade' },
      experienceLevel: '1_3',
      businessName: null,
    });

    // C — a pre-13-38 row exactly as prod holds it: `over_10` was answered, the old
    // normaliser stored NULL, and business_name never existed. This is what the
    // backfill has to find.
    await seedPerson({
      respondentId: legacyBucketRespondentId,
      submissionId: legacyBucketSubId,
      profileId: legacyBucketProfileId,
      ref: `${TAG}C`,
      rawData: { years_experience: 'over_10', business_name: 'Iya Basira Foods' },
      experienceLevel: null,
      businessName: null,
    });

    // D (Story 13-58) — THE ELEVEN. A worker who registered themselves (source
    // `public`) and whom the AFAN import MATCHED rather than inserted; 13-67 wrote
    // the vouch onto their respondent metadata, and their marketplace profile
    // predates the column, so it starts NULL. This row is the whole reason AC4 was
    // corrected away from a source predicate.
    await seedPerson({
      respondentId: vouchedRespondentId,
      submissionId: vouchedSubId,
      profileId: vouchedProfileId,
      // NOT `${TAG}D` — a later test seeds its own person under that reference and
      // the unique index on reference_code reds the whole file.
      ref: `${TAG}VOUCH`,
      rawData: { years_experience: '4_6' },
      experienceLevel: '4_6',
      businessName: null,
      associationName: null,
      respondentMetadata: {
        association_name: 'AFAN',
        association_vouched_by_batch_id: '01a072ae-0000-7000-8000-000000000000',
      },
    });
  });

  afterAll(async () => {
    await db.delete(marketplaceProfiles).where(inArray(marketplaceProfiles.id, ourProfileIds));
    await db.delete(submissions).where(inArray(submissions.respondentId, ourRespondentIds));
    await db.delete(respondents).where(inArray(respondents.id, ourRespondentIds));
  });

  it('projects business_name out of the real search SQL (AC8)', async () => {
    const result = await MarketplaceService.searchProfiles({ profession: PROFESSION });

    const withBusiness = result.data.find((p) => p.id === withBusinessProfileId);
    expect(withBusiness).toBeDefined();
    expect(withBusiness!.businessName).toBe(BUSINESS_NAME);
  });

  it('returns businessName null for a worker who gave none — never their person name (AC8.2)', async () => {
    const result = await MarketplaceService.searchProfiles({ profession: PROFESSION });

    const noBusiness = result.data.find((p) => p.id === noBusinessProfileId);
    expect(noBusiness).toBeDefined();
    expect(noBusiness!.businessName).toBeNull();
    const serialised = JSON.stringify(noBusiness);
    expect(serialised).not.toContain('Adekemi');
    expect(serialised).not.toContain('Ogunlade');
  });

  it('carries the questionnaire bucket through the real SQL (AC7)', async () => {
    const result = await MarketplaceService.searchProfiles({ profession: PROFESSION });

    const withBusiness = result.data.find((p) => p.id === withBusinessProfileId);
    expect(withBusiness!.experienceLevel).toBe('over_10');
  });

  // [AI-Review][Medium] 2026-08-18 — the card LEADS with the trading name, so it is
  // the string an employer reads and then types into the search box. It has to be in
  // the tsvector, which means the trigger in custom-sql/marketplace-trigger.sql has
  // to have been re-applied — exactly the kind of "shipped the column, forgot the
  // index" gap a mocked test cannot see.
  it('finds a worker by their business name in full-text search (AC8)', async () => {
    const result = await MarketplaceService.searchProfiles({ q: 'Autoworks' });

    const hit = result.data.find((p) => p.id === withBusinessProfileId);
    expect(hit).toBeDefined();
    expect(hit!.businessName).toBe(BUSINESS_NAME);
  });

  // [AI-Review][Medium] 2026-08-18 — the page a card links to must not drop the
  // identity line the card led with.
  it('returns businessName from the profile-detail read too (AC8)', async () => {
    const detail = await MarketplaceService.getProfileById(withBusinessProfileId);
    expect(detail).not.toBeNull();
    expect(detail!.businessName).toBe(BUSINESS_NAME);

    // ...and null, never a person's name, for the worker who gave none.
    const none = await MarketplaceService.getProfileById(noBusinessProfileId);
    expect(none!.businessName).toBeNull();
    const serialised = JSON.stringify(none);
    expect(serialised).not.toContain('Adekemi');
    expect(serialised).not.toContain('Ogunlade');
  });

  it('backfill dry-run EXECUTES against the real schema and finds the NULL bucket', async () => {
    const preview = await backfillMarketplaceCardFields({ profileIds: ourProfileIds });

    expect(preview.dryRun).toBe(true);
    // Scoped, so these are EXACT now rather than ">= 3 of whatever else is here".
    // 4 since Story 13-58 added the vouched person (D) to the seed set.
    expect(preview.scanned).toBe(4);
    // 2 since Story 13-58: row C still needs its experience bucket, and row D needs
    // the vouch its profile predates. Broken out below rather than left as a bumped
    // total, so a future change that moves the number has to say which half moved.
    expect(preview.needsUpdate).toBe(2);
    expect(preview.experienceChanged).toBe(1);
    expect(preview.associationNameChanged).toBe(1);

    // Dry-run must not have touched row C.
    const [rowC] = await db
      .select({ experienceLevel: marketplaceProfiles.experienceLevel, businessName: marketplaceProfiles.businessName })
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.id, legacyBucketProfileId));
    expect(rowC.experienceLevel).toBeNull();
    expect(rowC.businessName).toBeNull();
  });

  it('backfill --apply repairs the legacy row and is then idempotent', async () => {
    await backfillMarketplaceCardFields({ apply: true, profileIds: ourProfileIds });

    const [rowC] = await db
      .select({ experienceLevel: marketplaceProfiles.experienceLevel, businessName: marketplaceProfiles.businessName })
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.id, legacyBucketProfileId));
    expect(rowC.experienceLevel).toBe('over_10');
    expect(rowC.businessName).toBe('Iya Basira Foods');

    // Row B had no trading name in its answers — it must still have none.
    const [rowB] = await db
      .select({ businessName: marketplaceProfiles.businessName })
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.id, noBusinessProfileId));
    expect(rowB.businessName).toBeNull();
  });

  // [AI-Review][High] 2026-08-17 — a business-name-only update must not drag the
  // experience_level down with it. This is the one assertion a mocked db.execute
  // CANNOT make: it sees the SQL text (which names the column either way), never
  // the value bound to it. Only reading the row back afterwards proves it.
  it('preserves a valid legacy experience_level through a business-name-only update', async () => {
    const respondentId = uuidv7();
    const submissionId = uuidv7();
    const profileId = uuidv7();

    await seedPerson({
      respondentId,
      submissionId,
      profileId,
      ref: `${TAG}D`,
      // No years_experience in the answers at all — but a valid bucket is stored,
      // and a trading name is waiting to be picked up.
      rawData: { business_name: 'Sunrise Welders' },
      experienceLevel: '8-15',
      businessName: null,
    });

    try {
      await backfillMarketplaceCardFields({ apply: true, profileIds: [profileId] });

      const [row] = await db
        .select({
          experienceLevel: marketplaceProfiles.experienceLevel,
          businessName: marketplaceProfiles.businessName,
        })
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.id, profileId));

      expect(row.businessName).toBe('Sunrise Welders');
      // The hero stat survives. Before the fix this read NULL.
      expect(row.experienceLevel).toBe('8-15');
    } finally {
      await db.delete(marketplaceProfiles).where(eq(marketplaceProfiles.id, profileId));
      await db.delete(submissions).where(eq(submissions.respondentId, respondentId));
      await db.delete(respondents).where(eq(respondents.id, respondentId));
    }
  });

  // [AI-Review][High] 2026-08-18 — default browse is `ORDER BY mp.updated_at DESC`
  // and the pagination cursor is keyed on it, so a repair that stamps the timestamp
  // silently re-ranks the whole public marketplace. Only a real DB can prove this:
  // a mocked db.execute sees the SQL text, and the old code's `updated_at = now()`
  // is server-side — no bound value to inspect.
  it('repairs a row WITHOUT bumping updated_at (public browse order is stable)', async () => {
    const respondentId = uuidv7();
    const submissionId = uuidv7();
    const profileId = uuidv7();

    await seedPerson({
      respondentId,
      submissionId,
      profileId,
      ref: `${TAG}E`,
      rawData: { years_experience: 'over_10', business_name: 'Ilupeju Ironworks' },
      experienceLevel: null,
      businessName: null,
    });

    try {
      const [before] = await db
        .select({ updatedAt: marketplaceProfiles.updatedAt })
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.id, profileId));

      const result = await backfillMarketplaceCardFields({ apply: true, profileIds: [profileId] });
      expect(result.updated).toBe(1);

      const [after] = await db
        .select({
          updatedAt: marketplaceProfiles.updatedAt,
          experienceLevel: marketplaceProfiles.experienceLevel,
          businessName: marketplaceProfiles.businessName,
        })
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.id, profileId));

      // The repair landed...
      expect(after.experienceLevel).toBe('over_10');
      expect(after.businessName).toBe('Ilupeju Ironworks');
      // ...and the row did NOT jump to the top of /marketplace.
      expect(after.updatedAt?.getTime()).toBe(before.updatedAt?.getTime());
    } finally {
      await db.delete(marketplaceProfiles).where(eq(marketplaceProfiles.id, profileId));
      await db.delete(submissions).where(eq(submissions.respondentId, respondentId));
      await db.delete(respondents).where(eq(respondents.id, respondentId));
    }
  });

  /**
   * Story 13-58 — the raw-SQL half of the badge.
   *
   * `searchProfiles` and `getProfileById` are `db.execute(sql\`…\`)` and are NOT
   * type-checked against the schema, so their mocked unit tests pass whether or not
   * `mp.association_name` is in the SELECT list or the column was ever pushed. These
   * are the only assertions in the story that fail if either is missing.
   */
  describe('association provenance (Story 13-58)', () => {
    it('projects association_name out of the real search SQL', async () => {
      await db
        .update(marketplaceProfiles)
        .set({ associationName: 'AFAN' })
        .where(eq(marketplaceProfiles.id, vouchedProfileId));

      const result = await MarketplaceService.searchProfiles({ profession: PROFESSION });

      const vouched = result.data.find((p) => p.id === vouchedProfileId);
      expect(vouched).toBeDefined();
      expect(vouched!.associationName).toBe('AFAN');
    });

    it('returns associationName null for a worker no association vouched for', async () => {
      const result = await MarketplaceService.searchProfiles({ profession: PROFESSION });

      const ordinary = result.data.find((p) => p.id === noBusinessProfileId);
      expect(ordinary).toBeDefined();
      expect(ordinary!.associationName).toBeNull();
    });

    it('projects association_name out of the real profile-detail SQL', async () => {
      await db
        .update(marketplaceProfiles)
        .set({ associationName: 'AFAN' })
        .where(eq(marketplaceProfiles.id, vouchedProfileId));

      const detail = await MarketplaceService.getProfileById(vouchedProfileId);

      expect(detail).not.toBeNull();
      expect(detail!.associationName).toBe('AFAN');
    });

    /**
     * The catch-up, end to end against a real row: the vouch is on the respondent's
     * metadata and the profile is NULL, which is precisely prod's state for the
     * eleven. If the backfill's `r.metadata ->> 'association_name'` were wrong (the
     * `adopted_draft_answers` bug in this same file's history was exactly that shape
     * — 42703, invisible to a mocked test), this reds.
     */
    it('backfills the vouch onto a profile that predates the column', async () => {
      await db
        .update(marketplaceProfiles)
        .set({ associationName: null })
        .where(eq(marketplaceProfiles.id, vouchedProfileId));

      const result = await backfillMarketplaceCardFields({
        apply: true,
        profileIds: [vouchedProfileId],
      });

      expect(result.associationNameChanged).toBe(1);

      const [row] = await db
        .select({ associationName: marketplaceProfiles.associationName })
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.id, vouchedProfileId));
      expect(row.associationName).toBe('AFAN');
    });

    /**
     * Story 13-58 R5 — the FTS half, end to end against the REAL trigger.
     *
     * Search matches `search_vector @@ plainto_tsquery` as a HARD WHERE filter, so
     * before this an employer who read "AFAN — confirmed member" on a card and typed
     * "AFAN" into the search box got ZERO rows. Only a real-DB test can prove this:
     * the trigger lives in `custom-sql/marketplace-trigger.sql` and the mocked unit
     * tests would pass whether or not it had ever been applied.
     *
     * ⚠️ The UPDATE below is also the mechanism: the trigger is BEFORE INSERT OR
     * UPDATE, so writing the name recomputes the vector. That is exactly why R5 was
     * closed BEFORE the R2 catch-up runs — R2's own writes will do this for the
     * real rows, and no recompute sweep is ever needed.
     */
    it('finds a vouched worker by the association name through real FTS', async () => {
      await db
        .update(marketplaceProfiles)
        .set({ associationName: 'AFAN' })
        .where(eq(marketplaceProfiles.id, vouchedProfileId));

      const result = await MarketplaceService.searchProfiles({ q: 'AFAN' });

      expect(result.data.map((p) => p.id)).toContain(vouchedProfileId);
    });

    /**
     * The discriminating twin: a worker no association vouched for must NOT surface
     * for that query. Without it, a trigger that dumped every column into the vector
     * would pass the test above.
     */
    it('does not return an unvouched worker for an association query', async () => {
      const result = await MarketplaceService.searchProfiles({ q: 'AFAN' });

      expect(result.data.map((p) => p.id)).not.toContain(noBusinessProfileId);
    });

    /** R5's precise half, against real SQL rather than a mocked query object. */
    it('filters to the association through the real search SQL', async () => {
      await db
        .update(marketplaceProfiles)
        .set({ associationName: 'AFAN' })
        .where(eq(marketplaceProfiles.id, vouchedProfileId));

      const result = await MarketplaceService.searchProfiles({
        profession: PROFESSION,
        association: 'afan',
      });

      const ids = result.data.map((p) => p.id);
      expect(ids).toContain(vouchedProfileId);
      expect(ids).not.toContain(noBusinessProfileId);
    });

    it('leaves a profile alone when its respondent carries no vouch', async () => {
      const result = await backfillMarketplaceCardFields({
        apply: true,
        profileIds: [noBusinessProfileId],
      });

      expect(result.associationNameChanged).toBe(0);

      const [row] = await db
        .select({ associationName: marketplaceProfiles.associationName })
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.id, noBusinessProfileId));
      expect(row.associationName).toBeNull();
    });
  });
});

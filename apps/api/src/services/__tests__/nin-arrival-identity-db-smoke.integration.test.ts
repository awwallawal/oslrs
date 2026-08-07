import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { respondents } from '../../db/schema/respondents.js';
import {
  findRespondentByIdentity,
  promoteRespondentWithArrivingNin,
} from '../respondent-identity.js';

/**
 * Story 13-53 — REAL-DB SMOKE for the NIN-arrival seam.
 *
 * WHY THIS FILE EXISTS AND WHY MOCKS CANNOT REPLACE IT
 * ----------------------------------------------------
 * The identity key is a token-set INTERSECT over `string_to_array(lower(...))`, and R21 shipped
 * with a note admitting as much: *"the SQL itself cannot be evaluated by a mock"*. It was verified
 * read-only against prod instead. Every unit test around it asserts the SHAPE of the query — that
 * it says `INTERSECT`, that it does not say `lower("first_name") =` — which is a test of how the
 * string was written, not of what Postgres does with it.
 *
 * So the one claim this story actually rests on — *a person who registers without a NIN and comes
 * back with it, entering their name the other way round, ends up with ONE record* — had no
 * executable proof anywhere. This file executes it, against the real schema, both directions.
 *
 * It is also the raw-SQL/schema-drift gate the project has been bitten by twice: `nin IS NULL` and
 * `RETURNING "reference_code"` are unchecked strings until Postgres plans them.
 *
 * Follows the project integration pattern: `beforeAll`/`afterAll` (never per-test hooks), synthetic
 * rows under captured ids, cleaned up by id. Phone numbers are unique per run so a concurrent test
 * file inserting respondents cannot collide with the token match.
 *
 * ⚠️ EVERY TEST OWNS ITS OWN ROW AND ITS OWN PHONE (review M3). The first cut shared one row
 * between the lookup tests and the promote test, so test 1 only passed because test 3 had not run
 * yet — order-coupling that vitest's sequential default hides and `--sequence.shuffle` or
 * `.concurrent` would turn red (or, worse, vacuous). A test whose truth depends on the file's
 * reading order is not pinning what it claims to pin.
 */

const RUN = Date.now().toString().slice(-7);
// Unique per run: the identity key is (phone + tokens), so a distinct phone isolates this file
// from anything else in the shared test DB.
// `chk_respondents_phone_number_e164` requires +234 followed by exactly 10 digits.
const PHONE = `+23480${RUN}1`;
const PHONE_HOUSEHOLD = `+23481${RUN}2`;
const PHONE_CONFLICT = `+23482${RUN}3`;
const PHONE_PROMOTE = `+23483${RUN}4`;
const PHONE_IMPORTED = `+23484${RUN}5`;

const firstVisitId = uuidv7();       // registered WITHOUT a NIN — read-only, never mutated
const householdId = uuidv7();        // a relative on a shared handset
const conflictId = uuidv7();         // already holds a DIFFERENT NIN
const promoteTargetId = uuidv7();    // the row the promote tests mutate — theirs alone
const importedId = uuidv7();         // an `imported_unverified` row: NIN-less, and OLDER
const createdIds = [firstVisitId, householdId, conflictId, promoteTargetId, importedId];

const ORIGINAL_CODE = `OSL-2026-T${RUN}A`;
const HOUSEHOLD_CODE = `OSL-2026-T${RUN}B`;
const CONFLICT_CODE = `OSL-2026-T${RUN}C`;
const PROMOTE_CODE = `OSL-2026-T${RUN}D`;

// 11 digits, format-only — the project deliberately runs no checksum gate (13-15).
const ARRIVING_NIN = `9${RUN}0${RUN}`.slice(0, 11);
const OTHER_NIN = `8${RUN}0${RUN}`.slice(0, 11);

beforeAll(async () => {
  await db.insert(respondents).values([
    {
      id: firstVisitId,
      nin: null,
      // The real pair: BASHIRU / YUSUFF TITILOPE on the first visit.
      firstName: 'Bashiru',
      lastName: 'Yusuff Titilope',
      phoneNumber: PHONE,
      status: 'pending_nin_capture',
      source: 'public',
      referenceCode: ORIGINAL_CODE,
      consentMarketplace: false,
      consentEnriched: false,
    },
    {
      id: householdId,
      nin: null,
      firstName: 'Fatima',
      lastName: 'Bello',
      phoneNumber: PHONE_HOUSEHOLD,
      status: 'pending_nin_capture',
      source: 'enumerator',
      referenceCode: HOUSEHOLD_CODE,
      consentMarketplace: false,
      consentEnriched: false,
    },
    {
      id: conflictId,
      nin: OTHER_NIN,
      firstName: 'Segun Adewale',
      lastName: 'Akingbade',
      phoneNumber: PHONE_CONFLICT,
      status: 'active',
      source: 'public',
      referenceCode: CONFLICT_CODE,
      consentMarketplace: false,
      consentEnriched: false,
    },
    {
      // The promote tests MUTATE this one, so it is theirs and nothing else reads it.
      // Deliberately NULL `reference_code` / `lga_id`: the fill-the-blanks behaviour (review
      // M1/L3) has nowhere to show itself on a row that already has them.
      id: promoteTargetId,
      nin: null,
      firstName: 'Bashiru',
      lastName: 'Yusuff Titilope',
      phoneNumber: PHONE_PROMOTE,
      status: 'pending_nin_capture',
      source: 'public',
      referenceCode: null,
      lgaId: null,
      consentMarketplace: false,
      consentEnriched: false,
    },
    {
      // Review H1 — a low-trust import: NIN-less, matching perfectly, and (crucially) OLDER than
      // any real row, so `ORDER BY created_at ASC LIMIT 1` would reach it FIRST.
      id: importedId,
      nin: null,
      firstName: 'Adewale',
      lastName: 'Okonkwo',
      phoneNumber: PHONE_IMPORTED,
      status: 'imported_unverified',
      source: 'imported_itf_supa',
      referenceCode: null,
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      consentMarketplace: false,
      consentEnriched: false,
    },
  ]);
});

afterAll(async () => {
  await db.delete(respondents).where(inArray(respondents.id, createdIds));
});

describe('13-53 — NIN-arrival identity match (real DB)', () => {
  /**
   * THE JOURNEY, EXECUTED. Registered as `Bashiru / Yusuff Titilope`; returns as
   * `Yusuff / Bashiru` — surname-first, one token dropped — carrying the NIN. Exact
   * first+last equality (what `tryRaceResolutionMerge` uses) misses this completely; the token
   * intersection scores 2 and finds them.
   */
  it('finds the NIN-less first visit despite a reordered, shortened name', async () => {
    const match = await findRespondentByIdentity(
      db,
      { firstName: 'Yusuff', lastName: 'Bashiru', phoneNumber: PHONE },
      { requireNoNin: true },
    );
    expect(match).toMatchObject({ id: firstVisitId, referenceCode: ORIGINAL_CODE });
  });

  /**
   * AC1.3, executed rather than asserted about. The conflict row holds a DIFFERENT NIN and shares
   * the phone and BOTH name tokens — it is the strongest possible match — and `requireNoNin` must
   * still refuse to return it. Without the predicate this is precisely the wrong-person merge the
   * whole design forbids.
   */
  it('will not return a row that already holds a different NIN, however strong the match', async () => {
    const withRestriction = await findRespondentByIdentity(
      db,
      { firstName: 'Segun Adewale', lastName: 'Akingbade', phoneNumber: PHONE_CONFLICT },
      { requireNoNin: true },
    );
    expect(withRestriction).toBeNull();

    // …and the restriction is doing the work: the SAME lookup without it finds the row, so the
    // null above cannot be explained by a query that matches nothing.
    const withoutRestriction = await findRespondentByIdentity(db, {
      firstName: 'Segun Adewale',
      lastName: 'Akingbade',
      phoneNumber: PHONE_CONFLICT,
    });
    expect(withoutRestriction).toMatchObject({ id: conflictId });
  });

  /**
   * AC1.2 — one record, one number, and now a NIN. The reference code returned by the UPDATE is
   * the one minted on the FIRST visit: that is the number in the citizen's hands, and it is what
   * `/check-registration` will resolve.
   */
  it('promotes in place: NIN filled, status active, and the blanks filled — never clobbered', async () => {
    const promoted = await promoteRespondentWithArrivingNin(db, {
      respondentId: promoteTargetId,
      nin: ARRIVING_NIN,
      // Review M1 — the row has NO reference code, so the promote must PERSIST this one. A promote
      // performs no insert; echoing a minted code that was never written hands the citizen a
      // number that resolves to nothing.
      fallbackReferenceCode: PROMOTE_CODE,
      // Review L3 — the row has no LGA; a full registration knows one. COALESCE fills the blank.
      lgaId: 'ibadan-north',
      // Review H2 — an under-15's consent must survive the promote, as it does on the merge path.
      guardian: {
        name: 'Amina Yusuff',
        relationship: 'mother',
        phone: '+2348012345678',
        consent: 'yes',
        isSupervisedApprentice: 'yes',
      },
    });
    expect(promoted).toMatchObject({ id: promoteTargetId, status: 'active' });
    // RETURNING must show the code the row now HOLDS, not a NULL the caller would fall back from.
    expect(promoted?.referenceCode).toBe(PROMOTE_CODE);

    // Read it back from the table rather than trusting RETURNING — this is the row the citizen has.
    const row = await db.query.respondents.findFirst({
      where: (r, { eq }) => eq(r.id, promoteTargetId),
      columns: { nin: true, status: true, referenceCode: true, lgaId: true, metadata: true },
    });
    expect(row).toMatchObject({
      nin: ARRIVING_NIN,
      status: 'active',
      referenceCode: PROMOTE_CODE,
      lgaId: 'ibadan-north',
    });
    // The JSONB merge landed, and the guardian is readable — 9-55's consent record, on the promote.
    expect(row?.metadata?.guardian).toMatchObject({ name: 'Amina Yusuff', relationship: 'mother' });

    // Still exactly ONE record on that phone. The duplicate is what the story is about.
    const onThatPhone = await db.execute(
      sql`SELECT count(*)::int AS n FROM respondents WHERE phone_number = ${PHONE_PROMOTE}`,
    );
    expect((onThatPhone as unknown as { rows: Array<{ n: number }> }).rows[0].n).toBe(1);
  });

  /**
   * The concurrency guard, executed — against the row seeded WITH a NIN, so this test depends on
   * nothing that ran before it (review M3). A second arrival must update nothing: not overwrite,
   * not throw. Same predicate that makes two simultaneous arrivals safe.
   */
  it('refuses to overwrite a NIN that is already there — returns null, changes nothing', async () => {
    const second = await promoteRespondentWithArrivingNin(db, {
      respondentId: conflictId,
      nin: ARRIVING_NIN,
      fallbackReferenceCode: 'OSL-2026-NEVER1',
    });
    expect(second).toBeNull();

    const row = await db.query.respondents.findFirst({
      where: (r, { eq }) => eq(r.id, conflictId),
      columns: { nin: true, referenceCode: true },
    });
    expect(row?.nin).toBe(OTHER_NIN);              // untouched
    expect(row?.referenceCode).toBe(CONFLICT_CODE); // and nothing else leaked through either
  });

  /**
   * ── Review H1 — THE STRATUM THAT MUST NOT BE LAUNDERED ────────────────────────────────────
   *
   * `imported_unverified` rows are low-trust secondary-data imports deliberately held out of the
   * fraud / marketplace pipelines BY STATUS (`PIPELINE_EXCLUDED_STATUSES`). Promoting one to
   * `active` would both relabel an unverified record as field-verified and re-open that gate.
   *
   * The seeded row is a perfect match AND the oldest row in the file, so under `ORDER BY
   * created_at ASC LIMIT 1` it is exactly what an unfiltered lookup would return first.
   */
  it('will not RETURN an imported_unverified row for a NIN arrival, however well it matches', async () => {
    const restricted = await findRespondentByIdentity(
      db,
      { firstName: 'Adewale', lastName: 'Okonkwo', phoneNumber: PHONE_IMPORTED },
      { requireNoNin: true },
    );
    expect(restricted).toBeNull();

    // …and the status filter is what did it: the SAME lookup without `requireNoNin` finds the row,
    // so the null above cannot be explained away as a query that matches nothing.
    const unrestricted = await findRespondentByIdentity(db, {
      firstName: 'Adewale',
      lastName: 'Okonkwo',
      phoneNumber: PHONE_IMPORTED,
    });
    expect(unrestricted).toMatchObject({ id: importedId });
  });

  it('will not PROMOTE an imported_unverified row even when handed its id directly', async () => {
    const promoted = await promoteRespondentWithArrivingNin(db, {
      respondentId: importedId,
      nin: ARRIVING_NIN,
    });
    expect(promoted).toBeNull();

    // The stratum is intact: still NIN-less, still unverified, still out of the pipelines.
    const row = await db.query.respondents.findFirst({
      where: (r, { eq }) => eq(r.id, importedId),
      columns: { nin: true, status: true },
    });
    expect(row).toMatchObject({ nin: null, status: 'imported_unverified' });
  });

  /**
   * 13-4 AC1b's household case, on real data. The exemption lives in the CALLER, so the lookup
   * itself still finds the relative — which is the point: the counterfactual stays measurable.
   * What must never happen is the caller acting on it for a staff-captured source, and that is
   * covered by the service unit tests. Pinned here so the LOOKUP's behaviour cannot drift out from
   * under that exemption.
   */
  it('still SEES a household member (the exemption is the caller\'s job, not the query\'s)', async () => {
    const match = await findRespondentByIdentity(
      db,
      { firstName: 'Fatima Aisha', lastName: 'Bello', phoneNumber: PHONE_HOUSEHOLD },
      { requireNoNin: true },
    );
    expect(match).toMatchObject({ id: householdId });
  });
});

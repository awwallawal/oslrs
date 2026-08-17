/**
 * Story 13-59 (AC7) — "prove they actually have it", against the real database.
 *
 * ## Why this one has to be an integration test
 *
 * AC7.1 is blunt about the risk the 2026-08-10 ruling created: *a closeable
 * modal that everyone dismisses has delivered nothing* —
 * [[pattern-ship-a-fix-that-never-fires]] in its purest form. The only thing
 * standing between "we offered it" and "they have it" is a row in `audit_logs`
 * and an operator screen that reads it back.
 *
 * That round trip crosses the hash chain, an advisory lock and a SQL predicate
 * with three role branches. Mocking any of it would test the mock. So: real
 * rows, real query, real teardown.
 *
 * ⚠️ Assertions name the PERSON and the ARTEFACT, never a count. "Two rows came
 * back" is a number consistent with both a working filter and a broken one
 * (§2aa), which is exactly how the staff-list citizen leak survived.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import { users, roles, auditLogs } from '../../db/schema/index.js';
import { StaffService } from '../staff.service.js';
import {
  recordArtefactDownload,
  getDownloadTimestamps,
  getStaffArtefactState,
} from '../staff-artefacts.service.js';
import { AUDIT_ACTIONS } from '../audit.service.js';

const tag = randomUUID().slice(0, 8);
const createdIds: string[] = [];

async function roleIdFor(name: string): Promise<string> {
  const row = await db.query.roles.findFirst({ where: eq(roles.name, name) });
  if (!row) throw new Error(`role ${name} missing from the test DB — run db:seed`);
  return row.id;
}

async function makeUser(
  fullName: string,
  roleName: string,
  hasPhoto = true,
  status: 'invited' | 'active' | 'deactivated' = 'active',
): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      email: `${fullName.toLowerCase().replace(/\s+/g, '-')}-${tag}@example.test`,
      fullName: `${fullName} ${tag}`,
      passwordHash: 'x'.repeat(20),
      roleId: await roleIdFor(roleName),
      status,
      liveSelfieIdCardUrl: hasPhoto ? `staff-photos/id-card/${tag}.jpg` : null,
    })
    .returning({ id: users.id });
  createdIds.push(row!.id);
  return row!.id;
}

let tookBoth: string;
let tookNothing: string;
let backOffice: string;
/** Review M2 — an enumerator who CANNOT be issued a card (13-60's swallow). */
let noPhoto: string;
/**
 * Review M2 — the ISOLATING case for the SQL half.
 *
 * A clerk owes ONLY the card. An enumerator with no photo still owes the
 * briefing, so they appear in `?missingArtefacts=true` either way and cannot
 * tell a working availability gate from a deleted one — an outcome consistent
 * with both proves neither (§2aa). A clerk with no photo owes nothing they can
 * act on, so they are the only subject whose presence or absence is decided
 * solely by the branch under test.
 */
let clerkNoPhoto: string;
/** Review M4 — invited but never activated, and deactivated. */
let neverActivated: string;
let deactivated: string;

beforeAll(async () => {
  tookBoth = await makeUser('Took Both', 'enumerator');
  tookNothing = await makeUser('Took Nothing', 'enumerator');
  backOffice = await makeUser('Back Office', 'government_official', false);
  noPhoto = await makeUser('No Photo', 'enumerator', false);
  clerkNoPhoto = await makeUser('Clerk No Photo', 'data_entry_clerk', false);
  neverActivated = await makeUser('Never Activated', 'enumerator', true, 'invited');
  deactivated = await makeUser('Deactivated', 'enumerator', true, 'deactivated');

  await recordArtefactDownload({ userId: tookBoth, kind: 'id_card' });
  await recordArtefactDownload({ userId: tookBoth, kind: 'briefing' });
});

afterAll(async () => {
  // Audit rows reference the user; clear them first or the delete 23503s.
  if (createdIds.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, createdIds));
    await db.delete(users).where(inArray(users.id, createdIds));
  }
});

describe('AC7.2 — the download is recorded in the existing audit vocabulary', () => {
  it('writes one row per artefact, keyed to the person, with no schema change', async () => {
    const rows = await db
      .select({ action: auditLogs.action, targetId: auditLogs.targetId, details: auditLogs.details })
      .from(auditLogs)
      .where(eq(auditLogs.actorId, tookBoth));

    const actions = rows.map((r) => r.action).sort();
    expect(actions).toEqual([
      AUDIT_ACTIONS.STAFF_BRIEFING_DOWNLOADED,
      AUDIT_ACTIONS.STAFF_ID_CARD_DOWNLOADED,
    ].sort());

    // The actor IS the subject — this is a self-service download, not an
    // administrator acting on someone.
    expect(rows.every((r) => r.targetId === tookBoth)).toBe(true);
  });

  it('reads the timestamps back for one user', async () => {
    const stamps = await getDownloadTimestamps(tookBoth);
    expect(stamps.id_card).toBeInstanceOf(Date);
    expect(stamps.briefing).toBeInstanceOf(Date);

    const none = await getDownloadTimestamps(tookNothing);
    expect(none.id_card).toBeNull();
    expect(none.briefing).toBeNull();
  });

  /**
   * AC7.2 says the download record must never cost anyone their file. A failing
   * audit write is logged and swallowed — proven here by writing against a user
   * id that does not exist, which violates the actor_id FK.
   */
  it('a failed audit write does not throw at the caller', async () => {
    await expect(
      recordArtefactDownload({ userId: randomUUID(), kind: 'id_card' }),
    ).resolves.toBeUndefined();
  });
});

describe('AC7.4 — promptRequired stops once the artefacts are taken', () => {
  it('is TRUE for an enumerator who has taken nothing', async () => {
    const state = await getStaffArtefactState({
      id: tookNothing,
      roleName: 'enumerator',
      hasIdCardPhoto: true,
    });

    expect(state.idCard.downloadedAt).toBeNull();
    expect(state.briefing.downloadedAt).toBeNull();
    expect(state.promptRequired).toBe(true);
  });

  it('is FALSE once both have been taken — an offer that ends', async () => {
    const state = await getStaffArtefactState({
      id: tookBoth,
      roleName: 'enumerator',
      hasIdCardPhoto: true,
    });

    expect(state.idCard.downloadedAt).not.toBeNull();
    expect(state.briefing.downloadedAt).not.toBeNull();
    expect(state.promptRequired).toBe(false);
  });

  /**
   * AC5.3 + 13-60 — an entitlement that CANNOT be served must not nag forever.
   * The card is still reported as applicable-but-unavailable so the modal can
   * show the retry link, but it does not by itself keep the prompt alive; the
   * outstanding briefing does.
   */
  it('a missing photo is reported as unavailable, not as an endless prompt', async () => {
    const state = await getStaffArtefactState({
      id: tookBoth,
      roleName: 'enumerator',
      hasIdCardPhoto: false,
    });

    expect(state.idCard.applicable).toBe(true);
    expect(state.idCard.available).toBe(false);
    expect(state.idCard.unavailableReason).toBe('photo_missing');
    expect(state.promptRequired).toBe(false); // briefing already taken
  });

  it('a back-office role is entitled to neither and is never prompted', async () => {
    const state = await getStaffArtefactState({
      id: backOffice,
      roleName: 'government_official',
      hasIdCardPhoto: false,
    });

    expect(state.idCard.applicable).toBe(false);
    expect(state.briefing.applicable).toBe(false);
    expect(state.promptRequired).toBe(false);
  });
});

describe('AC7.3 — the operator can see who is not ready to go out', () => {
  it('the staff list carries both download timestamps', async () => {
    const result = await StaffService.listUsers({ limit: 100, search: tag });

    const both = result.data.find((u) => u.id === tookBoth);
    const neither = result.data.find((u) => u.id === tookNothing);

    expect(both?.idCardDownloadedAt).toBeInstanceOf(Date);
    expect(both?.briefingDownloadedAt).toBeInstanceOf(Date);
    expect(neither?.idCardDownloadedAt).toBeNull();
    expect(neither?.briefingDownloadedAt).toBeNull();
  });

  it('?missingArtefacts=true names the person who has not taken theirs', async () => {
    const result = await StaffService.listUsers({
      limit: 100,
      search: tag,
      missingArtefacts: true,
    });
    const ids = result.data.map((u) => u.id);

    // Named, not counted.
    expect(ids).toContain(tookNothing);
    expect(ids).not.toContain(tookBoth);
    // ⚠️ The back-office user owes NOTHING. If they appeared here the operator
    // would learn to ignore the filter, which is the same as not having it.
    expect(ids).not.toContain(backOffice);
  });

  it('without the filter, everyone is still listed', async () => {
    const result = await StaffService.listUsers({ limit: 100, search: tag });
    const ids = result.data.map((u) => u.id);

    expect(ids).toContain(tookBoth);
    expect(ids).toContain(tookNothing);
    expect(ids).toContain(backOffice);
  });

  /**
   * ⭐ Review M2 — THE TWO SURFACES MUST AGREE, and this is where that is pinned.
   *
   * `noPhoto` is an enumerator whose photo never saved (13-60's swallow). They
   * CANNOT download a card, so `getStaffArtefactState` correctly stops prompting
   * them for it — but the operator's filter used to list them as owing one
   * forever, because its predicate asked `applicable` where the modal asked
   * `available`. The app had stopped asking while the operator was still being
   * told the person was unready, and nothing would have surfaced the
   * disagreement: both answers looked reasonable in isolation.
   *
   * The assertion is deliberately on ONE PERSON across BOTH surfaces, not on two
   * independent expectations that happen to be written next to each other.
   */
  it('M2 — a person the app stops prompting is a person the operator stops chasing', async () => {
    const state = await getStaffArtefactState({
      id: noPhoto,
      roleName: 'enumerator',
      hasIdCardPhoto: false,
    });

    // The app: the card is applicable but unavailable, so it is not chased…
    expect(state.idCard.applicable).toBe(true);
    expect(state.idCard.available).toBe(false);
    expect(state.idCard.unavailableReason).toBe('photo_missing');

    // …and the operator's row says the same thing about the same artefact.
    const listed = (await StaffService.listUsers({ limit: 100, search: tag })).data.find(
      (u) => u.id === noPhoto,
    );
    expect(listed?.artefactsOutstanding).not.toContain('id_card');

    // They ARE still chased for the briefing, which they can actually take —
    // this is a narrowing of the question, not an exemption from it.
    expect(state.promptRequired).toBe(true);
    expect(listed?.artefactsOutstanding).toContain('briefing');
  });

  /**
   * ⭐ M2, THE SQL HALF — and the reason this test exists separately.
   *
   * The test above asserts `artefactsOutstanding`, which is computed in
   * JavaScript by `outstandingFor()`. It never runs `?missingArtefacts=true`,
   * so it says NOTHING about the WHERE clause — and it proved it: deleting
   * `live_selfie_id_card_url IS NOT NULL` from the predicate left it green.
   * Caught by RED-verifying the fix rather than by reading it, which is the
   * third time in this story that a green test was defending nothing.
   *
   * The subject is a CLERK, deliberately. A clerk owes only the card, so with
   * no photo they owe nothing they can act on and must not appear. An
   * enumerator would appear via the briefing branch either way and could not
   * distinguish a working gate from a deleted one.
   */
  it('M2 (SQL) — a clerk who cannot be issued a card is not on the readiness list', async () => {
    const result = await StaffService.listUsers({
      limit: 100,
      search: tag,
      missingArtefacts: true,
    });
    const ids = result.data.map((u) => u.id);

    // Cannot download a card at all → belongs in 13-60's "No ID photo" column,
    // and nowhere else. Deleting the availability gate puts them back here.
    expect(ids).not.toContain(clerkNoPhoto);
    // The control: an enumerator with no photo IS still listed, because the
    // briefing is genuinely outstanding for them.
    expect(ids).toContain(noPhoto);
  });

  /**
   * Review M4 — the screen answers "who do I send out TOMORROW?".
   *
   * Without a status gate it also answered "everyone we ever invited and never
   * heard from, plus everyone we deactivated". An `invited` account has not
   * activated, cannot log in, and has no way to download anything; listing them
   * beside people who simply have not got round to it makes the operator scroll
   * past both.
   */
  it('M4 — never-activated and deactivated accounts stay off the readiness screen', async () => {
    const result = await StaffService.listUsers({
      limit: 100,
      search: tag,
      missingArtefacts: true,
    });
    const ids = result.data.map((u) => u.id);

    expect(ids).toContain(tookNothing); // active, owes both — the real signal
    expect(ids).not.toContain(neverActivated);
    expect(ids).not.toContain(deactivated);
  });

  /**
   * Review H3 — the verdict is the SERVER's, and the browser renders it.
   *
   * `StaffTable.tsx` used to re-derive "who owes what" from raw timestamps plus
   * its own copy of the role rules. It now reads these two fields, so they are
   * the contract and this is where the contract is pinned.
   */
  it('H3 — every row carries the server-computed verdict, not just timestamps', async () => {
    const result = await StaffService.listUsers({ limit: 100, search: tag });

    const both = result.data.find((u) => u.id === tookBoth);
    const neither = result.data.find((u) => u.id === tookNothing);
    const office = result.data.find((u) => u.id === backOffice);

    expect(both?.artefactsApplicable).toBe(true);
    expect(both?.artefactsOutstanding).toEqual([]);

    expect(neither?.artefactsApplicable).toBe(true);
    expect(neither?.artefactsOutstanding).toEqual(
      expect.arrayContaining(['id_card', 'briefing']),
    );

    // Back office owes nothing and must render as "n/a", not as "Taken".
    expect(office?.artefactsApplicable).toBe(false);
    expect(office?.artefactsOutstanding).toEqual([]);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import { users, roles } from '../../db/schema/index.js';
import { StaffService } from '../staff.service.js';

/**
 * The staff list must not contain citizens — 2026-08-09.
 *
 * Found on production by the operator, not by a test: the Staff Management page
 * listed `public_user` respondents by name, and the registry's "All Enumerators"
 * picker offered people who are not enumerators. One root cause, two symptoms:
 *
 *   1. `listUsers` had NO role predicate at all, so "the staff list" meant every
 *      row in `users` — on prod, 114 citizens beside 3 actual staff.
 *   2. The picker called `/staff?roleFilter=enumerator&pageSize=500`, and neither
 *      parameter exists. `staff.controller` reads
 *      `{ page, limit, status, roleId, lgaId, search }`, so BOTH were discarded
 *      in silence and the call returned the unfiltered table.
 *
 * ⚠️ A WRONG PARAMETER NAME FAILS PERMISSIVELY. It does not 404 or 400 — it
 * returns MORE than asked for. That is why this survived: every symptom looked
 * like a UI bug, and the endpoint was behaving exactly as written.
 *
 * ⚠️ THESE ASSERTIONS NAME THE CITIZEN, not a count. "Returns 3 rows" would pass
 * over the hole the moment the fixture count changed, and a count assertion is
 * what makes a leak look like a pagination quirk
 * ([[pattern-test-that-passes-over-a-hole]]).
 */

const tag = randomUUID().slice(0, 8);
const citizenEmail = `citizen-${tag}@example.test`;
const enumeratorEmail = `enum-${tag}@example.test`;
const adminEmail = `admin-${tag}@example.test`;
const createdIds: string[] = [];

async function roleIdFor(name: string): Promise<string> {
  const row = await db.query.roles.findFirst({ where: eq(roles.name, name) });
  if (!row) throw new Error(`role ${name} missing from the test DB — run db:seed`);
  return row.id;
}

async function makeUser(email: string, fullName: string, roleName: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      email,
      fullName,
      passwordHash: 'x'.repeat(20),
      roleId: await roleIdFor(roleName),
      status: 'active',
    })
    .returning({ id: users.id });
  createdIds.push(row!.id);
  return row!.id;
}

beforeAll(async () => {
  await makeUser(citizenEmail, `Citizen ${tag}`, 'public_user');
  await makeUser(enumeratorEmail, `Enumerator ${tag}`, 'enumerator');
  await makeUser(adminEmail, `Admin ${tag}`, 'super_admin');
});

afterAll(async () => {
  if (createdIds.length === 0) return;
  const deleted = await db
    .delete(users)
    .where(inArray(users.id, createdIds))
    .returning({ id: users.id });
  // A DELETE 0 is a failed teardown, not a clean one.
  expect(deleted.length).toBe(createdIds.length);
});

describe('StaffService.listUsers — citizens are not staff', () => {
  it('never returns a public_user, even with no filter at all', async () => {
    const result = await StaffService.listUsers({ limit: 100, search: tag });
    const emails = result.data.map((u) => u.email);

    // The whole point, named explicitly.
    expect(emails).not.toContain(citizenEmail);
    // ...and the staff who SHOULD be there still are, so this is an exclusion
    // and not an accidental empty result.
    expect(emails).toContain(enumeratorEmail);
    expect(emails).toContain(adminEmail);
  });

  it('filters by role NAME — the parameter the picker actually needs', async () => {
    const result = await StaffService.listUsers({ limit: 100, search: tag, role: 'enumerator' });
    const emails = result.data.map((u) => u.email);

    expect(emails).toEqual([enumeratorEmail]);
    // A role filter that returns the admin too is the `roleFilter` bug wearing a
    // different name.
    expect(emails).not.toContain(adminEmail);
    expect(emails).not.toContain(citizenEmail);
  });

  it('an unknown role name returns NOTHING rather than everything', async () => {
    const result = await StaffService.listUsers({ limit: 100, search: tag, role: 'not_a_role' });
    // ⚠️ This is the actual defect class, generalised: the old code answered an
    // unrecognised filter by ignoring it and returning the whole table. Failing
    // CLOSED on a filter nobody recognises is the property worth pinning.
    expect(result.data).toEqual([]);
  });

  it('the total count respects the exclusion too, not just the page', async () => {
    const all = await StaffService.listUsers({ limit: 100, search: tag });
    // meta.total drives the pager; if it counted citizens the UI would promise
    // rows that the filtered page can never show.
    expect(all.meta.total).toBe(all.data.length);
    expect(all.data.map((u) => u.email)).not.toContain(citizenEmail);
  });
});

/**
 * Story 13-60 AC3.1 + AC6.3 — the operator's pre-field-day question.
 *
 * "Who will I fail to print an ID card for?" — asked BEFORE somebody prints
 * twelve and discovers it at the printer, which is the situation the story was
 * raised from.
 *
 * ⚠️ Assertions name the PERSON, not a count, for the same reason as the suite
 * above: a count passes over the hole the moment a fixture changes.
 */
describe('StaffService.listUsers — ID-photo visibility (13-60 AC3)', () => {
  it('reports whether each person can actually be issued a card', async () => {
    const result = await StaffService.listUsers({ limit: 100, search: tag });
    const enumerator = result.data.find((u) => u.email === enumeratorEmail)!;

    // The fixture has no photo, so no card can be printed for them.
    expect(enumerator.hasPhoto).toBe(false);
  });

  it('narrows to exactly the staff who have no photo', async () => {
    // Give the admin a photo; the enumerator keeps none.
    await db
      .update(users)
      .set({
        liveSelfieIdCardUrl: 'staff-photos/id-card/fixture.jpg',
        photoStatus: 'saved',
        photoSource: 'upload',
      })
      .where(eq(users.email, adminEmail));

    const missing = await StaffService.listUsers({ limit: 100, search: tag, missingPhoto: true });
    const emails = missing.data.map((u) => u.email);

    expect(emails).toContain(enumeratorEmail);
    expect(emails).not.toContain(adminEmail);

    // AC6.3 — and for the one who HAS a photo, which path produced it is
    // visible. An upload recorded as a live capture is the one thing AC6.2
    // forbids, so the operator has to be able to see the difference.
    const all = await StaffService.listUsers({ limit: 100, search: tag });
    const admin = all.data.find((u) => u.email === adminEmail)!;
    expect(admin.hasPhoto).toBe(true);
    expect(admin.photoSource).toBe('upload');
  });

  it('surfaces WHY the photo is missing, so a failure is not read as a choice', async () => {
    await db
      .update(users)
      .set({ photoStatus: 'failed', photoFailureReason: 'S3 upload failed' })
      .where(eq(users.email, enumeratorEmail));

    const result = await StaffService.listUsers({ limit: 100, search: tag, missingPhoto: true });
    const enumerator = result.data.find((u) => u.email === enumeratorEmail)!;

    // ⚠️ THE DISTINCTION IS THE FEATURE. "No photo" alone cannot tell the
    // operator whether the system lost it or the person declined — and those
    // call for different actions.
    expect(enumerator.photoStatus).toBe('failed');
    expect(enumerator.photoStatus).not.toBe('skipped');
    expect(enumerator.photoFailureReason).toContain('S3 upload failed');
  });

  it('the missingPhoto total respects the filter, not just the page', async () => {
    const missing = await StaffService.listUsers({ limit: 100, search: tag, missingPhoto: true });
    expect(missing.meta.total).toBe(missing.data.length);
  });
});

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import { users, roles } from '../../db/schema/index.js';
import { StaffService } from '../staff.service.js';

/**
 * `StaffService.getDetail` — the Staff Management detail view (2026-09-17).
 *
 * Every field an enumerator fills in at activation (bank name, account number,
 * account name, NIN, date of birth, home address, next of kin) was collected,
 * stored, and displayed NOWHERE: the list shows name/email/role/LGA/status and
 * there was no detail route at all. An operator could not read the details
 * needed to pay somebody without querying the database directly.
 *
 * ⛔ THE LOAD-BEARING TEST HERE IS THE CITIZEN ONE.
 * `listUsers` excludes `public_user` as a SERVICE DEFAULT because in 2026-08 the
 * Staff Management page listed 114 citizens by name. A detail route is the
 * sharper version of that same mistake — it returns NIN, date of birth, home
 * address and bank details for ONE id — so without the guard, a staff endpoint
 * becomes a citizen-PII lookup that bypasses the list's protection entirely.
 * → [[pattern-census-counts-sites-not-callers]] applied to an authorisation
 * default: guarding the list is not guarding the data.
 */

const tag = randomUUID().slice(0, 8);
const createdIds: string[] = [];
let enumeratorId = '';
let citizenId = '';
const ACTOR = randomUUID();

async function roleIdFor(name: string): Promise<string> {
  const row = await db.query.roles.findFirst({ where: eq(roles.name, name) });
  if (!row) throw new Error(`role ${name} missing from the test DB — run db:seed`);
  return row.id;
}

async function makeUser(
  email: string,
  fullName: string,
  roleName: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      email,
      fullName,
      passwordHash: 'x'.repeat(20),
      roleId: await roleIdFor(roleName),
      status: 'active',
      ...extra,
    })
    .returning({ id: users.id });
  createdIds.push(row!.id);
  return row!.id;
}

beforeAll(async () => {
  enumeratorId = await makeUser(`enum-${tag}@example.test`, `Adeyemi Folake ${tag}`, 'enumerator', {
    phone: '+2348000000001',
    nin: '12345678901',
    homeAddress: '12 Test Street, Ibadan',
    bankName: 'First Bank of Nigeria Ltd',
    accountNumber: '3039299966',
    accountName: `Adeyemi Folake ${tag}`,
    nextOfKinName: 'Next Of Kin',
    nextOfKinPhone: '+2348000000002',
  });
  citizenId = await makeUser(`citizen-${tag}@example.test`, `Citizen ${tag}`, 'public_user', {
    nin: '99999999999',
    homeAddress: 'A citizen home address',
    bankName: 'Citizen Bank',
    accountNumber: '0000000000',
  });
});

afterAll(async () => {
  if (createdIds.length) await db.delete(users).where(inArray(users.id, createdIds));
});

describe('StaffService.getDetail', () => {
  it('returns the onboarding fields the payment flow needs', async () => {
    const d = await StaffService.getDetail(enumeratorId, ACTOR);

    expect(d.bankName).toBe('First Bank of Nigeria Ltd');
    expect(d.accountNumber).toBe('3039299966');
    expect(d.nin).toBe('12345678901');
    expect(d.homeAddress).toBe('12 Test Street, Ibadan');
    expect(d.nextOfKinName).toBe('Next Of Kin');
    expect(d.roleName).toBe('enumerator');
    // Nobody captured anything for this fixture; the field must still be present
    // rather than undefined, so the UI renders "0" and not a blank.
    expect(d.capturedCount).toBe(0);
  });

  // ⛔ THE REGRESSION. Delete the public_user guard in getDetail and this passes
  // — which is the whole point of asserting it.
  it('REFUSES a citizen (public_user) — a staff endpoint is not a citizen-PII lookup', async () => {
    await expect(StaffService.getDetail(citizenId, ACTOR)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('404s an unknown id without distinguishing it from a citizen', async () => {
    // Same code and status as the citizen case on purpose: a staff endpoint must
    // not confirm that some other user id exists.
    await expect(StaffService.getDetail(randomUUID(), ACTOR)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('account-name matching — the thing that makes a bank transfer bounce', () => {
  /**
   * Measured on production 2026-09-17: of 11 activated enumerators, FOUR have an
   * account name that differs from their full name — a dropped letter, a typo, a
   * partial, and an extra given name. A Nigerian bank rejects on mismatch, so the
   * operator needs to see it before a batch, not after a bounce.
   */
  it('accepts a reordered name — reordering is not a mismatch', async () => {
    const id = await makeUser(`reorder-${tag}@example.test`, 'Badmus Zainab Jumoke', 'enumerator', {
      accountName: 'Zainab Jumoke Badmus',
    });
    const d = await StaffService.getDetail(id, ACTOR);
    // ⚠️ If this ever flags, the warning becomes noise and the operator learns to
    // ignore it — which costs more than the four real mismatches it would catch.
    expect(d.accountNameMatchesFullName).toBe(true);
  });

  it('accepts a case difference', async () => {
    const id = await makeUser(`case-${tag}@example.test`, 'Ishola Adijat Olawumi', 'enumerator', {
      accountName: 'ISHOLA ADIJAT OLAWUMI',
    });
    expect((await StaffService.getDetail(id, ACTOR)).accountNameMatchesFullName).toBe(true);
  });

  it('FLAGS a dropped letter — the real production case', async () => {
    const id = await makeUser(`typo-${tag}@example.test`, 'Badmus Aliyat Tolani', 'enumerator', {
      accountName: 'Badmus Alia Tolani',
    });
    expect((await StaffService.getDetail(id, ACTOR)).accountNameMatchesFullName).toBe(false);
  });

  it('FLAGS a missing name part', async () => {
    const id = await makeUser(`partial-${tag}@example.test`, 'Atitebi Esther Opeyemi', 'enumerator', {
      accountName: 'Atitebi Esther',
    });
    expect((await StaffService.getDetail(id, ACTOR)).accountNameMatchesFullName).toBe(false);
  });

  it('returns null rather than false when there is no account name to compare', async () => {
    // Not yet activated is not the same as mismatched; the UI must not show a
    // red warning to somebody who simply has not filled the form in.
    const id = await makeUser(`noacct-${tag}@example.test`, 'No Account Yet', 'enumerator');
    expect((await StaffService.getDetail(id, ACTOR)).accountNameMatchesFullName).toBeNull();
  });
});

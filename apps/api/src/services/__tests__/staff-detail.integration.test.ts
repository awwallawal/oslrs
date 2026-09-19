import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import { users, roles, auditLogs } from '../../db/schema/index.js';
import { StaffService } from '../staff.service.js';
import { AUDIT_ACTIONS } from '../audit.service.js';
import { purgeUsersWithAuditDrain } from '../../__tests__/helpers/audit-safe-teardown.js';

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
// ⛔ THE ACTOR MUST BE A REAL USER ROW.
// Until 2026-09-19 this was a bare `randomUUID()` that was never inserted into
// `users`, so EVERY audit write in this file died on
// `audit_logs_actor_id_users_id_fk`. `AuditService.logAction` is fire-and-forget
// by design (the 9-26 lesson: audit must never sink a request), so it swallowed
// the failure and every test here stayed green while the audit trail — the whole
// compliance rationale for a PII detail view — was never written once.
let ACTOR = '';

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
  ACTOR = await makeUser(`actor-${tag}@example.test`, `Operator ${tag}`, 'super_admin');
  citizenId = await makeUser(`citizen-${tag}@example.test`, `Citizen ${tag}`, 'public_user', {
    nin: '99999999999',
    homeAddress: 'A citizen home address',
    bankName: 'Citizen Bank',
    accountNumber: '0000000000',
  });
});

afterAll(async () => {
  // Audit rows now REFERENCE these users (actor_id FK is NO ACTION) and `audit_logs`
  // is append-only behind a trigger, so a plain delete raises 23503. This is the
  // canonical teardown primitive (13-30/13-32) — it takes FOR UPDATE on the users
  // first to close the fire-and-forget insert race, then drains the audit rows under
  // an advisory lock. Do not hand-roll another one.
  if (createdIds.length) await purgeUsersWithAuditDrain(createdIds);
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

  /**
   * ⛔ THE AUDIT ROW IS THE FEATURE'S COMPLIANCE RATIONALE, and nothing asserted it
   * until 2026-09-19. The detail view returns bank details, NIN, date of birth and
   * next of kin in one payload, so the READ is audited, not just the writes —
   * "who looked at the bank details" is asked after a payment dispute, and the
   * answer has to already exist.
   *
   * ⛔ RED-VERIFY: delete the `AuditService.logAction({...})` call in
   * `StaffService.getDetail` and this test MUST fail. Before this test existed,
   * deleting it changed nothing — every other test in this file asserts the
   * RETURN VALUE, which is identical whether or not the trail was written.
   * → [[pattern-test-that-passes-over-a-hole]]
   */
  it('WRITES the audit row — a PII read has to be answerable afterwards', async () => {
    await StaffService.getDetail(enumeratorId, ACTOR);

    // logAction is fire-and-forget: it opens its own transaction and resolves
    // after getDetail has already returned. Poll rather than assert into the race.
    const deadline = Date.now() + 5000;
    let rows: Array<typeof auditLogs.$inferSelect> = [];
    for (;;) {
      rows = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.actorId, ACTOR),
            eq(auditLogs.action, AUDIT_ACTIONS.STAFF_DETAIL_VIEWED),
            eq(auditLogs.targetId, enumeratorId),
          ),
        );
      if (rows.length > 0 || Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(
      rows.length,
      'no staff.detail_viewed audit row was written — the PII read left no trail',
    ).toBeGreaterThan(0);
    expect(rows[0]!.targetResource).toBe('users');
    expect(rows[0]!.actorId).toBe(ACTOR);
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

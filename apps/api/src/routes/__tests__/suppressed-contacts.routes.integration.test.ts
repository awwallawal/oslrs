/**
 * Story 13-51 (AC1, AC2.5) — the operator route, against the REAL service and a REAL database.
 *
 * ⛔ WHY THIS FILE DOES NOT MOCK THE SERVICE, unlike the 9-11 route-test exemplar it otherwise
 * follows.
 *
 * AC2.5's RED-verify is: **delete the clash refusal inside `contact-correction.service.ts` and
 * assert the ROUTE test reds.** A route test with a mocked service cannot do that — it would stay
 * green with the refusal deleted, because it never reaches the code that refuses. It would prove
 * the mock. That is [[pattern-census-counts-sites-not-callers]]: 13-55 review H1 shipped a real
 * promote with zero audit rows past a 9/9-green census, because a bypass calls the primitive and
 * writes none of what you count.
 *
 * So: auth middleware is stubbed (this file is not testing the guard), and everything below it is
 * real. Delete the refusal in the service and `REFUSES a clashing address` here goes red.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

const ACTOR_ID = uuidv7();

vi.mock('../../middleware/auth.js', () => ({
  authenticate: vi.fn((req: express.Request & { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { sub: ACTOR_ID, role: 'super_admin' };
    next();
  }),
}));
vi.mock('../../middleware/rbac.js', () => ({
  authorize: () => vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

const { db } = await import('../../db/index.js');
const { respondents } = await import('../../db/schema/respondents.js');
const { submissions } = await import('../../db/schema/submissions.js');
const { magicLinkTokens } = await import('../../db/schema/magic-link-tokens.js');
const { users } = await import('../../db/schema/users.js');
const { roles } = await import('../../db/schema/roles.js');
const { emailSuppressions } = await import('../../db/schema/email-suppressions.js');
const routerModule = await import('../suppressed-contacts.routes.js');

const DOMAIN = '@scr.test';
const REF_PREFIX = 'SCR-13-51-';

const app = express();
app.use(express.json());
app.use('/admin/suppressed-contacts', routerModule.default);

async function cleanup() {
  await db.execute(sql`DELETE FROM email_suppressions WHERE email LIKE ${'%' + DOMAIN}`);
  await db.execute(sql`DELETE FROM audit_logs WHERE details->>'referenceCode' LIKE ${REF_PREFIX + '%'}`);
  await db.execute(sql`
    DELETE FROM submissions WHERE respondent_id IN (
      SELECT id FROM respondents WHERE reference_code LIKE ${REF_PREFIX + '%'})`);
  await db.execute(sql`
    DELETE FROM magic_link_tokens WHERE respondent_id IN (
      SELECT id FROM respondents WHERE reference_code LIKE ${REF_PREFIX + '%'})`);
  await db.execute(sql`DELETE FROM respondents WHERE reference_code LIKE ${REF_PREFIX + '%'}`);
  await db.execute(sql`DELETE FROM users WHERE email LIKE ${'%' + DOMAIN} OR id = ${ACTOR_ID}::uuid`);
}

/**
 * ⚠️ ORM, not raw SQL — several id/timestamp defaults on these tables are drizzle `$defaultFn`
 * values that live in JavaScript rather than the DDL, so a raw INSERT dies on a NOT NULL.
 */
async function seed(opts: {
  ref: string;
  status?: 'active' | 'pending_nin_capture';
  submissionEmail?: string;
  tokenEmail?: string;
}) {
  const id = uuidv7();
  await db.insert(respondents).values({
    id,
    referenceCode: opts.ref,
    firstName: 'Route',
    lastName: opts.ref,
    phoneNumber: '+2348111111111',
    status: opts.status ?? 'active',
  });
  if (opts.submissionEmail) {
    await db.insert(submissions).values({
      submissionUid: `uid-${opts.ref}`,
      questionnaireFormId: 'form-1',
      respondentId: id,
      rawData: { email: opts.submissionEmail },
      submittedAt: new Date(),
    });
  }
  if (opts.tokenEmail) {
    await db.insert(magicLinkTokens).values({
      tokenHash: `hash-${opts.ref}`,
      purpose: 'wizard_resume',
      email: opts.tokenEmail,
      respondentId: id,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
  }
  return id;
}

describe('suppressed-contacts routes (13-51) — real service, real DB', () => {
  beforeAll(async () => {
    await cleanup();
    const role = await db.select({ id: roles.id }).from(roles).limit(1);
    await db.insert(users).values({
      id: ACTOR_ID,
      email: `routeactor${DOMAIN}`,
      fullName: 'Route Actor',
      roleId: role[0]!.id,
      status: 'active',
    });
  });
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM email_suppressions WHERE email LIKE ${'%' + DOMAIN}`);
    await db.execute(sql`DELETE FROM audit_logs WHERE details->>'referenceCode' LIKE ${REF_PREFIX + '%'}`);
    await db.execute(sql`
      DELETE FROM submissions WHERE respondent_id IN (
        SELECT id FROM respondents WHERE reference_code LIKE ${REF_PREFIX + '%'})`);
    await db.execute(sql`
      DELETE FROM magic_link_tokens WHERE respondent_id IN (
        SELECT id FROM respondents WHERE reference_code LIKE ${REF_PREFIX + '%'})`);
    await db.execute(sql`DELETE FROM respondents WHERE reference_code LIKE ${REF_PREFIX + '%'}`);
  });
  afterAll(cleanup);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // AC1.5 RED-VERIFY — narrow the service's join to `submissions` and this reds.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  it('RED-VERIFY (AC1.5): a suppressed address reachable ONLY via magic_link_tokens still appears', async () => {
    const ref = `${REF_PREFIX}MLT`;
    const email = `mltonly${DOMAIN}`;
    await seed({ ref, tokenEmail: email, status: 'pending_nin_capture' });
    await db.insert(emailSuppressions).values({ email, reason: 'bounced' });

    const res = await request(app).get('/admin/suppressed-contacts');
    expect(res.status).toBe(200);

    const row = res.body.data.find((r: { email: string }) => r.email === email);
    expect(row).toBeDefined();
    expect(row.referenceCode).toBe(ref); // the person, not just the address
    expect(row.phoneNumber).toBe('+2348111111111'); // AC1.3 — the actual next step
    expect(row.midLadder).toBe(true); // AC1.1 — the urgent case
  });

  it('AC1.7: shows the HEALTHY TWIN when one exists', async () => {
    const ref = `${REF_PREFIX}TWIN`;
    const dead = `twindead${DOMAIN}`;
    const alive = `twinalive${DOMAIN}`;
    await seed({ ref, submissionEmail: dead, tokenEmail: alive });
    await db.insert(emailSuppressions).values({ email: dead, reason: 'bounced' });

    const res = await request(app).get('/admin/suppressed-contacts');
    const row = res.body.data.find((r: { email: string }) => r.email === dead);
    // Without this an operator "corrects" somebody who is already reachable elsewhere.
    expect(row.healthyTwin).toBe(alive);
  });

  it('AC1.2/AC1.4: the three buckets reach the wire', async () => {
    const artefact = `Wrapped Person <artefact${DOMAIN}>`;
    const typo = `person@gmail.co`;
    const dead = `dead${DOMAIN}`;
    await db.insert(emailSuppressions).values([
      { email: artefact, reason: 'bounced' },
      { email: typo, reason: 'bounced' },
      { email: dead, reason: 'bounced' },
    ]);

    const res = await request(app).get('/admin/suppressed-contacts');
    const byEmail = Object.fromEntries(res.body.data.map((r: { email: string; bucket: string }) => [r.email, r.bucket]));
    expect(byEmail[artefact]).toBe('provider_artefact');
    expect(byEmail[typo]).toBe('capture_typo');
    expect(byEmail[dead]).toBe('plausibly_dead');
    await db.execute(sql`DELETE FROM email_suppressions WHERE email IN (${artefact}, ${typo})`);
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // AC2.5 RED-VERIFY — THE EXTRACTION PROOF. Delete the clash refusal inside
  // contact-correction.service.ts and THIS test reds. If only the script's test reds, the
  // extraction did not happen.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  it('RED-VERIFY (AC2.5/AC2.3/AC2.8): REFUSES a clashing address through the ROUTE, and names the owner', async () => {
    const owner = `${REF_PREFIX}OWNER`;
    const taker = `${REF_PREFIX}TAKER`;
    const contested = `contested${DOMAIN}`;
    await seed({ ref: owner, submissionEmail: contested });
    const takerId = await seed({ ref: taker, submissionEmail: `taker${DOMAIN}` });

    const res = await request(app)
      .post('/admin/suppressed-contacts/correct')
      .send({ respondentId: takerId, to: contested, reason: 'operator believes this is the right address' });

    expect(res.status).toBe(409);
    expect(res.body.ownerReferenceCode).toBe(owner);
  });

  it('AC2.1/AC2.2: corrects + lifts in ONE action, and the audit row names the SESSION user', async () => {
    const ref = `${REF_PREFIX}FIX`;
    const stale = `fixstale${DOMAIN}`;
    const fixed = `fixfixed${DOMAIN}`;
    const id = await seed({ ref, submissionEmail: stale });
    await db.insert(emailSuppressions).values({ email: stale, reason: 'bounced' });

    const res = await request(app)
      .post('/admin/suppressed-contacts/correct')
      .send({ respondentId: id, to: fixed, reason: 'mistyped at capture' });

    expect(res.status).toBe(200);
    expect(res.body.data.resolvedAfter).toBe(fixed);

    const left = (await db.execute(
      sql`SELECT email FROM email_suppressions WHERE email = ${stale}`,
    )) as unknown as { rows: unknown[] };
    expect(left.rows).toHaveLength(0);

    // AC2.2 — "the script passes actorId: null; the UI must not." Assert the ROW, not a mock.
    const audit = (await db.execute(sql`
      SELECT actor_id FROM audit_logs WHERE details->>'referenceCode' = ${ref}`)) as unknown as {
      rows: Array<{ actor_id: string | null }>;
    };
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]!.actor_id).toBe(ACTOR_ID);
  });

  it('rejects a malformed request body before reaching the service', async () => {
    const res = await request(app).post('/admin/suppressed-contacts/correct').send({ to: 'x@y.com' });
    expect(res.status).toBe(400);
  });
});

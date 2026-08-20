/**
 * Story 13-51 (AC2) — the shared correction service, against a real database.
 *
 * ⚠️ REAL DB ON PURPOSE. Every defect this service exists to fix is a defect about WHICH TABLE
 * gets written, and a mocked db proves only that the mock was called. The 2026-08-06 script wrote
 * `submissions` + `wizard_drafts`, reported success, and left 45 people — the ones reachable only
 * through `magic_link_tokens` — exactly as unreachable as before. No unit test with a stubbed
 * database could ever have caught that.
 *
 * This file owns the `@cc.test` address keyspace and the `CC-13-51-*` reference codes so it can
 * run beside the other DB suites without clobbering them.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { roles } from '../../db/schema/roles.js';
import { db } from '../../db/index.js';
import { respondents } from '../../db/schema/respondents.js';
import { submissions } from '../../db/schema/submissions.js';
import { magicLinkTokens } from '../../db/schema/magic-link-tokens.js';
import { users } from '../../db/schema/users.js';
import { emailSuppressions } from '../../db/schema/email-suppressions.js';
import { campaignSends } from '../../db/schema/campaign-sends.js';
import {
  correctRespondentContactEmail,
  ContactAddressClashError,
  ContactCorrectionRefusedError,
  RespondentNotFoundError,
} from '../contact-correction.service.js';
import { resolveRespondentContactEmail } from '../respondent-contact.service.js';

const DOMAIN = '@cc.test';
const REF_PREFIX = 'CC-13-51-';

async function cleanup() {
  await db.execute(sql`DELETE FROM email_suppressions WHERE email LIKE ${'%' + DOMAIN}`);
  await db.execute(sql`DELETE FROM wizard_drafts WHERE email LIKE ${'%' + DOMAIN}`);
  await db.execute(sql`DELETE FROM campaign_sends WHERE email LIKE ${'%' + DOMAIN}`);
  await db.execute(sql`DELETE FROM audit_logs WHERE details->>'referenceCode' LIKE ${REF_PREFIX + '%'}`);
  await db.execute(sql`
    DELETE FROM submissions WHERE respondent_id IN (
      SELECT id FROM respondents WHERE reference_code LIKE ${REF_PREFIX + '%'})`);
  await db.execute(sql`
    DELETE FROM magic_link_tokens WHERE respondent_id IN (
      SELECT id FROM respondents WHERE reference_code LIKE ${REF_PREFIX + '%'})`);
  await db.execute(sql`DELETE FROM respondents WHERE reference_code LIKE ${REF_PREFIX + '%'}`);
  await db.execute(sql`DELETE FROM users WHERE email LIKE ${'%' + DOMAIN}`);
}

/**
 * ⚠️ SEEDED THROUGH THE ORM, NOT RAW SQL. Several id/timestamp defaults on these tables are
 * drizzle `$defaultFn` values that live in JavaScript, not in the DDL — a raw INSERT skips them
 * and dies on a NOT NULL. Going through the ORM also means the fixture cannot drift from the
 * schema the service reads.
 */
async function seedRespondent(opts: {
  ref: string;
  status?: 'active' | 'pending_nin_capture';
  submissionEmail?: string;
  tokenEmail?: string;
  userEmail?: string;
}): Promise<string> {
  const id = uuidv7();
  let userId: string | null = null;

  if (opts.userEmail) {
    userId = uuidv7();
    const role = await db.select({ id: roles.id }).from(roles).limit(1);
    await db.insert(users).values({
      id: userId,
      email: opts.userEmail,
      fullName: `Test ${opts.ref}`,
      roleId: role[0]!.id,
      status: 'active',
    });
  }

  await db.insert(respondents).values({
    id,
    referenceCode: opts.ref,
    firstName: 'Test',
    lastName: opts.ref,
    phoneNumber: '+2348000000000',
    status: opts.status ?? 'active',
    userId,
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

describe('contact-correction.service (13-51 AC2) — real DB', () => {
  beforeAll(cleanup);
  beforeEach(cleanup);
  afterAll(cleanup);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // RED-VERIFY (AC2.7) — the one the story names.
  // Narrow the service back to `submissions` + `wizard_drafts` (what the 2026-08-06 script did)
  // and this test reds: the resolver keeps returning the typo, and the correction that "succeeded"
  // wrote nothing the send path will ever read. [[pattern-ship-a-fix-that-never-fires]] inside the
  // fix for it.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  it('RED-VERIFY: corrects a respondent reachable ONLY via magic_link_tokens', async () => {
    const ref = `${REF_PREFIX}MLT`;
    const stale = `mltstale${DOMAIN}`;
    const fixed = `mltfixed${DOMAIN}`;
    const id = await seedRespondent({ ref, tokenEmail: stale });

    // Precondition: no submissions row at all. This is the 45-person population.
    const before = await resolveRespondentContactEmail(id);
    expect(before).toEqual({ email: stale, source: 'magic_link_token' });

    const result = await db.transaction((tx) =>
      correctRespondentContactEmail(tx, { respondentId: id, to: fixed, actorId: null, reason: 'test' }),
    );

    expect(result.sourcesTouched.magic_link_tokens).toBe(1);
    expect((await resolveRespondentContactEmail(id))?.email).toBe(fixed);
  });

  it('corrects the submission source too, and reports which sources it wrote', async () => {
    const ref = `${REF_PREFIX}SUB`;
    const stale = `substale${DOMAIN}`;
    const fixed = `subfixed${DOMAIN}`;
    const id = await seedRespondent({ ref, submissionEmail: stale, tokenEmail: stale });

    const result = await db.transaction((tx) =>
      correctRespondentContactEmail(tx, { respondentId: id, to: fixed, actorId: null, reason: 'test' }),
    );

    expect(result.sourcesTouched.submissions).toBe(1);
    expect(result.sourcesTouched.magic_link_tokens).toBe(1);
    expect(result.correctedFrom).toEqual([stale]);
    expect((await resolveRespondentContactEmail(id))?.email).toBe(fixed);
  });

  it('corrects users.email — the LOGIN IDENTITY the old script never touched', async () => {
    const ref = `${REF_PREFIX}USR`;
    const stale = `usrstale${DOMAIN}`;
    const fixed = `usrfixed${DOMAIN}`;
    const id = await seedRespondent({ ref, userEmail: stale });

    const result = await db.transaction((tx) =>
      correctRespondentContactEmail(tx, { respondentId: id, to: fixed, actorId: null, reason: 'test' }),
    );
    expect(result.sourcesTouched.users).toBe(1);
    expect((await resolveRespondentContactEmail(id))?.email).toBe(fixed);
  });

  it('lifts the suppression on the OLD address and any stale one on the NEW', async () => {
    const ref = `${REF_PREFIX}SUP`;
    const stale = `supstale${DOMAIN}`;
    const fixed = `supfixed${DOMAIN}`;
    const id = await seedRespondent({ ref, submissionEmail: stale });
    await db.insert(emailSuppressions).values([
      { email: stale, reason: 'bounced' },
      { email: fixed, reason: 'bounced' },
    ]);

    await db.transaction((tx) =>
      correctRespondentContactEmail(tx, { respondentId: id, to: fixed, actorId: null, reason: 'test' }),
    );

    const left = (await db.execute(
      sql`SELECT email FROM email_suppressions WHERE email IN (${stale}, ${fixed})`,
    )) as unknown as { rows: unknown[] };
    // Both must go: leaving the corrected address suppressed means the correction "succeeds" and
    // the very next blast still skips them.
    expect(left.rows).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // AC2.3 / AC2.8 — the refusal, and it NAMES the owner.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  it('REFUSES to hand an address to someone who is not its owner, and names the owner', async () => {
    const owner = `${REF_PREFIX}OWNER`;
    const taker = `${REF_PREFIX}TAKER`;
    const contested = `contested${DOMAIN}`;
    await seedRespondent({ ref: owner, submissionEmail: contested });
    const takerId = await seedRespondent({ ref: taker, submissionEmail: `taker${DOMAIN}` });

    const err = await db
      .transaction((tx) =>
        correctRespondentContactEmail(tx, { respondentId: takerId, to: contested, actorId: null, reason: 'test' }),
      )
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ContactAddressClashError);
    // "Address in use" gives an operator nothing to act on. The reference code does.
    expect((err as ContactAddressClashError).ownerReferenceCode).toBe(owner);
  });

  it('is IDEMPOTENT and RETROSPECTIVE — already-correct data still lands on the ledger', async () => {
    const ref = `${REF_PREFIX}RETRO`;
    const already = `retro${DOMAIN}`;
    const id = await seedRespondent({ ref, submissionEmail: already });

    const result = await db.transaction((tx) =>
      correctRespondentContactEmail(tx, { respondentId: id, to: already, actorId: null, reason: 'already fixed by hand' }),
    );
    // That is how the 2026-08-06 manual prod edit was brought back onto the ledger.
    expect(result.retrospective).toBe(true);
    expect(result.correctedFrom).toEqual([]);
  });

  it('writes an audit ROW carrying the actor — asserted on the row, never on a mock', async () => {
    const ref = `${REF_PREFIX}AUDIT`;
    const stale = `auditstale${DOMAIN}`;
    const fixed = `auditfixed${DOMAIN}`;
    const id = await seedRespondent({ ref, submissionEmail: stale });
    // A real user id so the FK holds — this is the actor the UI supplies (AC2.2).
    const role = await db.select({ id: roles.id }).from(roles).limit(1);
    const actorId = uuidv7();
    await db.insert(users).values({
      id: actorId,
      email: `operator${DOMAIN}`,
      fullName: 'Operator',
      roleId: role[0]!.id,
      status: 'active',
    });

    await db.transaction((tx) =>
      correctRespondentContactEmail(tx, { respondentId: id, to: fixed, actorId, reason: 'typo caused a bounce' }),
    );

    const rows = (await db.execute(sql`
      SELECT actor_id, action, target_resource, details FROM audit_logs
       WHERE details->>'referenceCode' = ${ref}`)) as unknown as {
      rows: Array<{ actor_id: string | null; action: string; target_resource: string; details: Record<string, unknown> }>;
    };
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.actor_id).toBe(actorId);
    expect(rows.rows[0]!.action).toBe('operator.respondent_email_corrected');
    expect(rows.rows[0]!.target_resource).toBe('respondent');
    expect(rows.rows[0]!.details.correctedTo).toBe(fixed);
  });

  it('refuses an implausible address and a missing reason before touching anything', async () => {
    const id = await seedRespondent({ ref: `${REF_PREFIX}GUARD`, submissionEmail: `guard${DOMAIN}` });
    await expect(
      db.transaction((tx) => correctRespondentContactEmail(tx, { respondentId: id, to: 'not-an-email', actorId: null, reason: 'x' })),
    ).rejects.toBeInstanceOf(ContactCorrectionRefusedError);
    await expect(
      db.transaction((tx) => correctRespondentContactEmail(tx, { respondentId: id, to: `ok${DOMAIN}`, actorId: null, reason: '  ' })),
    ).rejects.toBeInstanceOf(ContactCorrectionRefusedError);
  });

  it('refuses an unknown respondent', async () => {
    await expect(
      db.transaction((tx) =>
        correctRespondentContactEmail(tx, { respondentId: uuidv7(), to: `nobody${DOMAIN}`, actorId: null, reason: 'x' }),
      ),
    ).rejects.toBeInstanceOf(RespondentNotFoundError);
  });

  it('leaves campaign_sends alone — it is a send LEDGER, not a contact record', async () => {
    const ref = `${REF_PREFIX}LEDGER`;
    const stale = `ledgerstale${DOMAIN}`;
    const fixed = `ledgerfixed${DOMAIN}`;
    const id = await seedRespondent({ ref, submissionEmail: stale });
    await db.insert(campaignSends).values({ email: stale, campaignId: 'test-campaign' });

    await db.transaction((tx) =>
      correctRespondentContactEmail(tx, { respondentId: id, to: fixed, actorId: null, reason: 'test' }),
    );

    // The bounced message really did go to the typo. Rewriting that would be falsifying history.
    const ledger = (await db.execute(
      sql`SELECT email FROM campaign_sends WHERE email IN (${stale}, ${fixed})`,
    )) as unknown as { rows: Array<{ email: string }> };
    expect(ledger.rows.map((r) => r.email)).toEqual([stale]);
  });
});

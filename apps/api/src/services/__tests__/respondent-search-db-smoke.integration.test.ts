import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/users.js';
import { roles } from '../../db/schema/roles.js';
import { lgas } from '../../db/schema/lgas.js';
import { submissions } from '../../db/schema/submissions.js';
import { respondents } from '../../db/schema/respondents.js';
import { teamAssignments } from '../../db/schema/team-assignments.js';
import { magicLinkTokens } from '../../db/schema/magic-link-tokens.js';
import { RespondentService } from '../respondent.service.js';

/**
 * Story 9-56 — Support traceability: real-DB SMOKE for the widened registry
 * search predicate (resolve a registrant by Reference ID / email / phone) plus
 * the registration-status + magic-link-issued read fields.
 *
 * WHY THIS EXISTS (project memory — "Raw SQL schema drift"): listRespondents
 * builds its search predicate inside a `db.execute(sql\`…\`)` raw query that is
 * NOT type-checked against the Drizzle schema, and the unit tests mock
 * `db.execute`. A typo like `s.submision_uid` or `r.phone` would ship GREEN and
 * 500 only in production (cf. 9-51 my-stats, hotfix 9.6). Postgres validates
 * column references at PLAN time, so executing the real query against the live
 * schema is the regression gate for that whole class — here it ALSO asserts the
 * new branches resolve the correct registrant.
 *
 * Follows the project integration pattern (beforeAll/afterAll, captured-id
 * cleanup, never beforeEach/afterEach; conflict-safe shared role inserts). Hooks
 * are FILE-level so fixtures survive across both describe blocks.
 */

const TAG = '_9_56_search_';
const SUPER_ADMIN_ID = uuidv7();

// LGA (FK target for team_assignments.lga_id + users.lga_id)
const lgaId = uuidv7();
const lgaCode = `${TAG}lga`;

// Public registrant resolvable by Reference ID / email / phone (no enumerator)
const publicRespondentId = uuidv7();
const publicSubmissionId = uuidv7();
const REFERENCE_ID = `${TAG}${publicSubmissionId}`;
const SHARED_EMAIL = `${TAG}shared@example.com`;
const PUBLIC_PHONE = `+234900${Date.now().toString().slice(-7)}`;
const UNIQUE_FIRST_NAME = `${TAG}Ayinde`;
const UNIQUE_NIN = `99${Date.now().toString().slice(-9)}`;

// Supervisor + enumerator + an enumerator-sourced respondent sharing SHARED_EMAIL
const supervisorId = uuidv7();
const enumeratorId = uuidv7();
const enumRespondentId = uuidv7();
const enumSubmissionId = uuidv7();
const teamAssignmentId = uuidv7();
const magicTokenId = uuidv7();
// Real UUID — the registry query casts questionnaire_form_id::uuid (guarded by a
// regex, but Postgres may still evaluate the cast), so a non-UUID like
// 'smoke-form' throws 22P02 at PLAN time. Mirrors a real pinned-form id.
const formId = uuidv7();

beforeAll(async () => {
  await db.insert(lgas).values({ id: lgaId, name: `${TAG}lga`, code: lgaCode });

  // Shared reference data — conflict-safe, never deleted in cleanup.
  await db.insert(roles).values({ id: uuidv7(), name: 'supervisor', description: `${TAG}role` }).onConflictDoNothing();
  await db.insert(roles).values({ id: uuidv7(), name: 'enumerator', description: `${TAG}role` }).onConflictDoNothing();
  const [{ id: supervisorRoleId }] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'supervisor')).limit(1);
  const [{ id: enumeratorRoleId }] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'enumerator')).limit(1);

  await db.insert(users).values([
    { id: supervisorId, email: `${TAG}sup@example.com`, fullName: 'Smoke Supervisor', roleId: supervisorRoleId, lgaId, status: 'active' },
    { id: enumeratorId, email: `${TAG}enum@example.com`, fullName: 'Smoke Enumerator', roleId: enumeratorRoleId, lgaId, status: 'active' },
  ]);

  // Explicit team assignment → direct-assignment path (no LGA fallback).
  await db.insert(teamAssignments).values({ id: teamAssignmentId, supervisorId, enumeratorId, lgaId });

  // (1) PUBLIC registrant — enumerator_id NULL; resolvable by ref-id/email/phone/name/NIN.
  await db.insert(respondents).values({
    id: publicRespondentId,
    nin: UNIQUE_NIN,
    firstName: UNIQUE_FIRST_NAME,
    lastName: 'Public',
    phoneNumber: PUBLIC_PHONE,
    lgaId: lgaCode,
    status: 'pending_nin_capture',
    source: 'public',
    submitterId: null,
  });
  await db.insert(submissions).values({
    id: publicSubmissionId,
    submissionUid: REFERENCE_ID,
    questionnaireFormId: formId,
    submitterId: null,
    enumeratorId: null,
    respondentId: publicRespondentId,
    rawData: { email: SHARED_EMAIL, phone_number: PUBLIC_PHONE, first_name: UNIQUE_FIRST_NAME },
    submittedAt: new Date(),
    source: 'public',
    processed: true,
  });
  // Issued magic-link for the public registrant (AC4 — bound to respondent_id).
  await db.insert(magicLinkTokens).values({
    id: magicTokenId,
    tokenHash: `${TAG}hash`,
    purpose: 'pending_nin_complete',
    email: SHARED_EMAIL,
    respondentId: publicRespondentId,
    expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
  });

  // (2) ENUMERATOR-sourced registrant — SAME email; in the supervisor's team scope.
  await db.insert(respondents).values({
    id: enumRespondentId,
    nin: `88${Date.now().toString().slice(-9)}`,
    firstName: `${TAG}Bisi`,
    lastName: 'Team',
    phoneNumber: `+234901${Date.now().toString().slice(-7)}`,
    lgaId: lgaCode,
    status: 'active',
    source: 'enumerator',
    submitterId: enumeratorId,
  });
  await db.insert(submissions).values({
    id: enumSubmissionId,
    submissionUid: `${TAG}${enumSubmissionId}`,
    questionnaireFormId: formId,
    submitterId: enumeratorId,
    enumeratorId,
    respondentId: enumRespondentId,
    rawData: { email: SHARED_EMAIL, first_name: `${TAG}Bisi` },
    submittedAt: new Date(),
    source: 'enumerator',
    processed: true,
  });
});

afterAll(async () => {
  await db.delete(magicLinkTokens).where(eq(magicLinkTokens.id, magicTokenId));
  await db.delete(submissions).where(eq(submissions.id, publicSubmissionId));
  await db.delete(submissions).where(eq(submissions.id, enumSubmissionId));
  await db.delete(teamAssignments).where(eq(teamAssignments.id, teamAssignmentId));
  await db.delete(respondents).where(eq(respondents.id, publicRespondentId));
  await db.delete(respondents).where(eq(respondents.id, enumRespondentId));
  await db.delete(users).where(eq(users.id, supervisorId));
  await db.delete(users).where(eq(users.id, enumeratorId));
  await db.delete(lgas).where(eq(lgas.id, lgaId));
  // Shared roles intentionally NOT deleted (other parallel tests reference them).
});

describe('RespondentService.listRespondents — real-DB search smoke (Story 9-56)', () => {
  // AC7.1 — Reference ID (submission_uid) resolves to exactly one registrant.
  it('resolves a registrant by Reference ID (submission_uid)', async () => {
    const res = await RespondentService.listRespondents({ search: REFERENCE_ID }, 'super_admin', SUPER_ADMIN_ID);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe(publicRespondentId);
    // AC3 — plain-language registration status surfaced on the result.
    expect(res.data[0].registrationStatus).toBe('Pending NIN');
  });

  // AC7.2 — email (lives in submissions.raw_data->>'email', NOT a respondents column).
  it('resolves registrants by email (raw_data, case-insensitive)', async () => {
    const res = await RespondentService.listRespondents({ search: SHARED_EMAIL.toUpperCase() }, 'super_admin', SUPER_ADMIN_ID);
    const ids = res.data.map((r) => r.id);
    expect(ids).toContain(publicRespondentId);
    expect(ids).toContain(enumRespondentId);
  });

  // AC7.3 — phone (respondents.phone_number).
  it('resolves a registrant by phone number', async () => {
    const res = await RespondentService.listRespondents({ search: PUBLIC_PHONE }, 'super_admin', SUPER_ADMIN_ID);
    expect(res.data.map((r) => r.id)).toContain(publicRespondentId);
  });

  // AC7.4 — unknown Reference ID → clean empty no-match (not an error).
  it('returns a clean empty no-match for an unknown Reference ID', async () => {
    const res = await RespondentService.listRespondents({ search: `${TAG}does-not-exist-xyz` }, 'super_admin', SUPER_ADMIN_ID);
    expect(res.data).toHaveLength(0);
    expect(res.meta.pagination.totalItems).toBe(0);
  });

  // AC7.7 — existing name / NIN search not regressed.
  it('still resolves by name and by NIN (no regression)', async () => {
    const byName = await RespondentService.listRespondents({ search: UNIQUE_FIRST_NAME }, 'super_admin', SUPER_ADMIN_ID);
    expect(byName.data.map((r) => r.id)).toContain(publicRespondentId);

    const byNin = await RespondentService.listRespondents({ search: UNIQUE_NIN }, 'super_admin', SUPER_ADMIN_ID);
    expect(byNin.data.map((r) => r.id)).toContain(publicRespondentId);
  });

  // AC5.2 + AC7.5 — supervisor: redacted PII + team-scope; the SAME email must NOT
  // leak the out-of-team public registrant (no PII-search side-channel).
  it('supervisor email search is team-scoped + PII-redacted (no out-of-scope leak)', async () => {
    const res = await RespondentService.listRespondents({ search: SHARED_EMAIL }, 'supervisor', supervisorId);
    const ids = res.data.map((r) => r.id);
    expect(ids).toContain(enumRespondentId); // in team scope
    expect(ids).not.toContain(publicRespondentId); // out of scope — not leaked
    const row = res.data.find((r) => r.id === enumRespondentId)!;
    expect(row.firstName).toBeNull();
    expect(row.lastName).toBeNull();
    expect(row.nin).toBeNull();
    expect(row.phoneNumber).toBeNull();
  });

  // AC1.2 / AC7.7 — DISTINCT ON (r.id): a registrant with multiple matching
  // submissions resolves to exactly one row.
  it('dedups to one row per registrant under DISTINCT ON', async () => {
    const extraUid = `${TAG}extra_${uuidv7()}`;
    await db.insert(submissions).values({
      id: uuidv7(),
      submissionUid: extraUid,
      questionnaireFormId: formId,
      respondentId: publicRespondentId,
      enumeratorId: null,
      rawData: { email: SHARED_EMAIL },
      submittedAt: new Date(),
      source: 'public',
      processed: true,
    });
    try {
      const res = await RespondentService.listRespondents({ search: SHARED_EMAIL }, 'super_admin', SUPER_ADMIN_ID);
      expect(res.data.filter((r) => r.id === publicRespondentId)).toHaveLength(1);
    } finally {
      await db.delete(submissions).where(eq(submissions.submissionUid, extraUid));
    }
  });
});

// AC3 + AC4 — getRespondentDetail surfaces registrationStatus + magicLinkIssuedAt.
describe('RespondentService.getRespondentDetail — status + magic-link (Story 9-56)', () => {
  it('returns plain-language status + the magic-link issuance timestamp', async () => {
    const detail = await RespondentService.getRespondentDetail(publicRespondentId, 'super_admin', SUPER_ADMIN_ID);
    expect(detail.registrationStatus).toBe('Pending NIN');
    expect(detail.magicLinkIssuedAt).not.toBeNull();
    expect(() => new Date(detail.magicLinkIssuedAt!).toISOString()).not.toThrow();
  });

  it('reports magicLinkIssuedAt = null when no link was ever issued', async () => {
    // enumRespondent shares SHARED_EMAIL with the public registrant's token, but
    // that token is BOUND to a different respondent_id, so it must NOT be
    // mis-attributed here (only respondent_id-bound or unbound-email tokens count).
    const detail = await RespondentService.getRespondentDetail(enumRespondentId, 'super_admin', SUPER_ADMIN_ID);
    expect(detail.magicLinkIssuedAt).toBeNull();
    expect(detail.registrationStatus).toBe('Active');
  });
});

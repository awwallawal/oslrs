/**
 * Story 13-55 Residual R1 + R3 — THE PROMOTE'S GUARDS, EXERCISED FROM THE CALLERS (real DB).
 *
 * ── What R1 said, and what measuring it actually found ──────────────────────
 * 13-55's AC2.2 RED-verify deleted the promote's `nin IS NULL` predicate and reported that paths 1
 * (magic link) and 2 (race-resolution merge) stayed GREEN — recorded as a coverage gap. The code
 * review re-opened it and found the two paths are NOT in the same position, which changes what can
 * honestly be closed here:
 *
 *   • PATH 1 — the guard is REACHABLE. `completeNin`'s only NIN pre-check is the FR21 collision
 *     lookup, and that searches for the INCOMING nin on OTHER rows. A row that is still
 *     `pending_nin_capture` and already holds a DIFFERENT nin passes every pre-check and arrives at
 *     the UPDATE, where `nin IS NULL` is the only thing standing between a stale magic link and an
 *     overwritten national identity number. That is a real journey and it is tested below.
 *
 *   • PATH 2 — the guard is UNREACHABLE FROM THIS CALLER, BY CONSTRUCTION, and no test can change
 *     that. `tryRaceResolutionMerge` selects its candidate with `WHERE status = 'pending_nin_capture'
 *     AND "nin" IS NULL … FOR UPDATE`, so the promote's re-assertion of the same two conditions can
 *     only fire against a row that changed between the lock and the write — which the lock prevents.
 *     The predicate is correct and must stay (it is the general-case race guard, and this caller is
 *     not the only one), but a caller-level test that REDs when it is deleted CANNOT EXIST here.
 *     **RED-verify was right and the residual's framing was wrong**: path 2 is not under-tested, it
 *     is double-guarded. What IS worth proving from the caller is the wiring and the audit row, and
 *     that is what the path-2 test below does — it makes no claim to cover the predicate.
 *
 * ── R3, the other half ──────────────────────────────────────────────────────
 * 13-55 rebuilt path 2 from one `UPDATE … WHERE id = (SELECT … LIMIT 1)` into a locked SELECT plus
 * the shared promote inside a transaction, and recorded that race-safety was "unchanged-or-stronger
 * BY CONSTRUCTION but not proven under real concurrency by any test". `by construction` is the
 * phrase this project has learned to distrust. The last test drives two real connections at one
 * pending row and asserts the property that matters: **a row cannot be promoted twice.**
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, and, inArray } from 'drizzle-orm';
import type { Request, Response } from 'express';

import { db } from '../../db/index.js';
import { respondents, auditLogs, magicLinkTokens } from '../../db/schema/index.js';
import { AUDIT_ACTIONS } from '../audit.service.js';
import { MagicLinkService } from '../magic-link.service.js';
import { SubmissionProcessingService } from '../submission-processing.service.js';
import { RegistrationController } from '../../controllers/registration.controller.js';

/** Random, never a clock slice — the 13-54 M3 lesson: a recycling namespace fails as a mystery. */
function digits(count: number): string {
  let out = '';
  while (out.length < count) out += randomUUID().replace(/\D/g, '');
  return out.slice(0, count);
}
/** `chk_respondents_phone_number_e164` — +234 then exactly 10 digits. */
const phone = (): string => `+2348${digits(9)}`;
/** 11 digits, format-only: the project deliberately runs no checksum gate (13-15). */
const nin = (): string => digits(11);

const createdRespondents = new Set<string>();
const createdEmails = new Set<string>();

async function makePending(args: {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  nin?: string;
}): Promise<string> {
  const [row] = await db
    .insert(respondents)
    .values({
      firstName: args.firstName,
      lastName: args.lastName,
      phoneNumber: args.phoneNumber,
      nin: args.nin ?? null,
      lgaId: 'lga-egbeda',
      source: 'public',
      status: 'pending_nin_capture',
      referenceCode: `OSL-2026-J${digits(5)}`,
    })
    .returning({ id: respondents.id });
  createdRespondents.add(row.id);
  return row.id;
}

/** Promote audit rows for one respondent. The assertion surface — never a mock call count. */
async function promoteAudits(respondentId: string) {
  return db
    .select({ id: auditLogs.id, details: auditLogs.details })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.targetId, respondentId),
        eq(auditLogs.action, AUDIT_ACTIONS.PENDING_NIN_PROMOTED),
      ),
    );
}

async function readRow(id: string) {
  return db.query.respondents.findFirst({
    where: eq(respondents.id, id),
    columns: { status: true, nin: true, referenceCode: true },
  });
}

/**
 * A minimal Express double. `completeNin` is a static controller, so driving it directly exercises
 * the REAL transaction, the REAL shared promote and the REAL audit write — everything except the
 * router. It reads only `body`, `ip` and `get('user-agent')`, and writes only `status().json()`.
 */
function drive(body: unknown) {
  let statusCode = 0;
  let payload: Record<string, unknown> | undefined;
  let failure: unknown;
  const req = {
    body,
    ip: '203.0.113.7',
    get: (h: string) => (h.toLowerCase() === 'user-agent' ? 'vitest/13-55-R1' : undefined),
  } as unknown as Request;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: Record<string, unknown>) {
      payload = data;
      return this;
    },
  } as unknown as Response;
  const next = (err: unknown) => {
    failure = err;
  };
  return {
    req,
    res,
    next,
    // The controller answers `{ status, data: {...} }` — unwrap `data`, which is where
    // `alreadyPromoted` lives. Reading the envelope instead silently yields `undefined`, which an
    // `expect(...).toBe(false)` would have reported as a promote failure that never happened.
    result: () => ({
      statusCode,
      failure,
      body: payload,
      data: payload?.data as Record<string, unknown> | undefined,
    }),
  };
}

async function issueLink(respondentId: string): Promise<string> {
  const email = `promote-journey-${digits(9)}@example.com`;
  createdEmails.add(email);
  const { tokenPlaintext } = await MagicLinkService.issueToken({
    email,
    purpose: 'pending_nin_complete',
    respondentId,
  });
  return tokenPlaintext;
}

beforeEach(() => {
  // Integration suite: real DB, no mocks to reset. Declared so the file's intent is unambiguous.
});

afterAll(async () => {
  if (createdEmails.size) {
    await db.delete(magicLinkTokens).where(inArray(magicLinkTokens.email, [...createdEmails]));
  }
  if (createdRespondents.size) {
    const ids = [...createdRespondents];
    await db.delete(auditLogs).where(inArray(auditLogs.targetId, ids));
    const deleted = await db
      .delete(respondents)
      .where(inArray(respondents.id, ids))
      .returning({ id: respondents.id });
    // A DELETE 0 is a failed teardown, not a clean one (13-54 Task 5.5).
    expect(deleted.length).toBe(ids.length);
  }
});

describe('R1 — path 1 (magic link) at CALLER level', () => {
  it('promotes the held row and writes its audit row in the same transaction', async () => {
    const respondentId = await makePending({
      firstName: 'Adebayo',
      lastName: 'Ogunlesi',
      phoneNumber: phone(),
    });
    const token = await issueLink(respondentId);
    const arriving = nin();

    const d = drive({ token, nin: arriving });
    await RegistrationController.completeNin(d.req, d.res, d.next);
    const { statusCode, data, failure } = d.result();

    expect(failure).toBeUndefined();
    expect(statusCode).toBe(200);
    expect(data?.alreadyPromoted).toBe(false);
    expect(data?.respondentId).toBe(respondentId);

    const row = await readRow(respondentId);
    expect(row?.status).toBe('active');
    expect(row?.nin).toBe(arriving);

    // AC3.1 — the audit is no longer a post-commit `logAction` that could simply never land.
    const audits = await promoteAudits(respondentId);
    expect(audits).toHaveLength(1);
    expect((audits[0].details as Record<string, unknown>).trigger).toBe('magic_link_complete_nin');
  });

  /**
   * ⚠️ THE ONE R1 EXISTS FOR. Delete `AND "nin" IS NULL` from the shared promote and THIS test reds
   * — verified by doing exactly that: the UPDATE then matches on status alone, the stale link
   * overwrites a national identity number, and `alreadyPromoted` comes back false.
   *
   * The state is reachable because `completeNin`'s FR21 pre-check searches for the INCOMING nin on
   * OTHER rows; a row still `pending_nin_capture` that already holds a DIFFERENT nin is invisible to
   * it. That combination is the unwritten invariant path 1 relied on and never checked.
   */
  it('refuses to overwrite a NIN the row already holds, and burns no promote', async () => {
    const held = nin();
    const respondentId = await makePending({
      firstName: 'Folake',
      lastName: 'Adeyemi',
      phoneNumber: phone(),
      nin: held,
    });
    const token = await issueLink(respondentId);

    const d = drive({ token, nin: nin() });
    await RegistrationController.completeNin(d.req, d.res, d.next);
    const { statusCode, data, failure } = d.result();

    expect(failure).toBeUndefined();
    // The caller's honest answer: nothing was promoted, and it says so.
    expect(statusCode).toBe(200);
    expect(data?.alreadyPromoted).toBe(true);

    const row = await readRow(respondentId);
    expect(row?.nin).toBe(held);
    expect(row?.status).toBe('pending_nin_capture');
    expect(await promoteAudits(respondentId)).toHaveLength(0);
  });
});

describe('R1 — path 2 (race-resolution merge) at CALLER level', () => {
  /**
   * ⚠️ SCOPE, STATED SO IT IS NOT MISREAD AS MORE THAN IT IS. This proves the WIRING and the AUDIT.
   * It does NOT cover the promote's `nin IS NULL` / status predicate and cannot: the caller's own
   * locked SELECT filters on both before the promote is ever called (see this file's header).
   */
  it('fills the NIN in place, keeps the original reference code, and attributes the route', async () => {
    const phoneNumber = phone();
    const respondentId = await makePending({
      firstName: 'Chidinma',
      lastName: 'Okafor',
      phoneNumber,
    });
    const original = (await readRow(respondentId))?.referenceCode;
    const arriving = nin();

    const merged = await SubmissionProcessingService.findOrCreateRespondent(
      {
        nin: arriving,
        firstName: 'Chidinma',
        lastName: 'Okafor',
        phoneNumber,
        consentMarketplace: false,
        consentEnriched: false,
      },
      'public',
      undefined,
    );
    createdRespondents.add(merged.id);

    // Merged, not duplicated — and the person keeps the code they have been holding.
    expect(merged.id).toBe(respondentId);
    const row = await readRow(respondentId);
    expect(row?.status).toBe('active');
    expect(row?.nin).toBe(arriving);
    expect(row?.referenceCode).toBe(original);

    const audits = await promoteAudits(respondentId);
    expect(audits).toHaveLength(1);
    expect((audits[0].details as Record<string, unknown>).trigger).toBe('race_resolution_merge');
  });
});

describe('R3 — path 2 under real concurrency', () => {
  /**
   * 13-55 turned one atomic statement into a locked SELECT + a promote in a transaction and called
   * the result "unchanged-or-stronger BY CONSTRUCTION". This drives it instead.
   *
   * Two NIN-bearing submissions for the SAME pending person arrive at once carrying DIFFERENT NINs.
   * Exactly one may win the held row; the loser must fall through to a fresh insert (the documented
   * trade — better one repairable duplicate than a wrong-person merge). The property that would
   * matter on a bad day, and the one a lost `FOR UPDATE` would break, is that the row is promoted
   * ONCE: two promote audit rows for one respondent would mean two NINs were written to one person.
   */
  it('promotes the held row exactly once when two NINs arrive together', async () => {
    const phoneNumber = phone();
    const respondentId = await makePending({
      firstName: 'Ibrahim',
      lastName: 'Danjuma',
      phoneNumber,
    });

    const submit = (arriving: string) =>
      SubmissionProcessingService.findOrCreateRespondent(
        {
          nin: arriving,
          firstName: 'Ibrahim',
          lastName: 'Danjuma',
          phoneNumber,
          consentMarketplace: false,
          consentEnriched: false,
        },
        'public',
        undefined,
      );

    const outcomes = await Promise.allSettled([submit(nin()), submit(nin())]);
    for (const o of outcomes) {
      if (o.status === 'fulfilled') createdRespondents.add(o.value.id);
    }

    // THE INVARIANT: one promote, never two. A row cannot receive two different NINs.
    expect(await promoteAudits(respondentId)).toHaveLength(1);

    const row = await readRow(respondentId);
    expect(row?.status).toBe('active');
    expect(row?.nin).not.toBeNull();

    // Exactly one of the two submissions merged into the held row; whichever lost either created a
    // separate record or was rejected. Both are acceptable losers — double-promotion is not.
    const merges = outcomes.filter((o) => o.status === 'fulfilled' && o.value.id === respondentId);
    expect(merges).toHaveLength(1);
  });
});

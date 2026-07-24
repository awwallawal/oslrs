import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray, like, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../src/db/index.js';
import {
  campaignSends,
  magicLinkTokens,
  respondents,
  submissions,
  wizardDrafts,
} from '../../src/db/schema/index.js';
import { recordCampaignSend } from '../../src/services/campaign-contact.service.js';

import {
  selectCohort as selectThankYouRaw,
  selectSendCohort as selectThankYouSend,
  type Args as ThankYouArgs,
} from '../_thankyou-referral-blast.js';
import {
  selectCohort as selectCohortARaw,
  selectSendCohort as selectCohortASend,
  type Args as CohortAArgs,
} from '../_cohort-a-supplemental-survey-blast.js';
import {
  selectCohort as selectReengagementRaw,
  selectSendCohort as selectReengagementSend,
  type Args as ReengagementArgs,
} from '../_reengagement-email-blast.js';

/**
 * Story 13-24 (AC6) — **THE REGRESSION TEST THE STORY IS ABOUT.**
 *
 * "13-24 says dedupe is mandatory" and "dedupe FIRES on real data" are different artifacts. This
 * file proves the second, against the REAL cohort SQL of all three blast scripts (the exact
 * `selectSendCohort` each `main()` calls), for every double-send scenario the 2026-07-23
 * send-ownership triangulation found (`docs/handoff-2026-07-23-send-ownership-triangulation.md` §1):
 *
 *   1. welcome↔blast     — the welcome backfill contacted an address, then a blast selects it.
 *   2. blast re-run      — the same blast fired twice inside the gap window.
 *   3. auto-send↔blast   — the 13-12 evergreen auto-send thanked a completer, then the thank-you
 *                          blast selects them anyway (the marker was WRITTEN but never READ).
 *
 * REVERT-TO-RED, by construction: every assertion is a PAIR — the address is present in the RAW
 * cohort (`selectCohort`, unchanged behaviour) and ABSENT from the SEND cohort (`selectSendCohort`
 * = raw + `filterMarketingCohort`). Delete the filter and the second half of each pair fails, which
 * is exactly the [[pattern-ship-a-fix-that-never-fires]] guard the story demands. A control row
 * that was never contacted must survive BOTH, so a filter that simply empties the cohort also
 * fails.
 *
 * PARALLEL-SAFE ISOLATION: this file owns the `@dedupe.test` address keyspace; every read and the
 * teardown are scoped to rows it created.
 */

const DOMAIN = '@dedupe.test';
const SCOPE = `%${DOMAIN}`;

// Addresses under test. One "contacted" + one "control" per blast, so an over-broad filter is
// caught as loudly as a missing one.
const TY_CONTACTED = `ty-contacted${DOMAIN}`;
const TY_CONTROL = `ty-control${DOMAIN}`;
const TY_AUTOSENT = `ty-autosent${DOMAIN}`;
const A_CONTACTED = `a-contacted${DOMAIN}`;
const A_CONTROL = `a-control${DOMAIN}`;
const B_CONTACTED = `b-contacted${DOMAIN}`;
const B_CONTROL = `b-control${DOMAIN}`;

const respondentIds: string[] = [];

function args<T extends { dryRun: boolean }>(): T {
  return {
    dryRun: true,
    confirmLive: false,
    confirmResendPro: false,
    ratePerMinute: 10,
    since: null,
    lgaId: null,
    maxRecipients: null,
  } as unknown as T;
}

/** A respondent + its magic-link email; optionally a submission (= "completed end-to-end"). */
async function seedRespondent(opts: {
  email: string;
  completed: boolean;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const id = uuidv7();
  respondentIds.push(id);
  await db.insert(respondents).values({
    id,
    firstName: 'Dedupe',
    lastName: 'Fixture',
    source: 'public',
    status: 'active',
    ...(opts.metadata ? { metadata: opts.metadata as never } : {}),
  });
  await db.insert(magicLinkTokens).values({
    tokenHash: `hash-${id}`,
    purpose: 'wizard_resume',
    email: opts.email,
    respondentId: id,
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  });
  if (opts.completed) {
    await db.insert(submissions).values({
      submissionUid: `sub-${id}`,
      questionnaireFormId: 'dedupe-test-form',
      respondentId: id,
      submittedAt: new Date(),
      source: 'public',
    });
  }
  return id;
}

async function seedDraft(email: string): Promise<void> {
  await db.insert(wizardDrafts).values({
    email,
    currentStep: 3,
    formData: { email } as never,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
}

async function cleanup() {
  await db.delete(campaignSends).where(like(campaignSends.email, SCOPE));
  await db.delete(wizardDrafts).where(like(wizardDrafts.email, SCOPE));
  if (respondentIds.length > 0) {
    await db.delete(submissions).where(inArray(submissions.respondentId, respondentIds));
    await db.delete(magicLinkTokens).where(like(magicLinkTokens.email, SCOPE));
    await db.delete(respondents).where(inArray(respondents.id, respondentIds));
  }
}

// L1 (review 2026-07-24) — this file hard-asserts gapDays===5, so neutralise any ambient
// MARKETING_CONTACT_GAP_DAYS override (a dev shell / CI value would otherwise cause a false RED).
const ORIGINAL_GAP_ENV = process.env.MARKETING_CONTACT_GAP_DAYS;

// Integration tests against a real DB use beforeAll/afterAll, not per-test hooks (project pattern).
beforeAll(async () => {
  delete process.env.MARKETING_CONTACT_GAP_DAYS;
  await cleanup();

  // Cohort C (thank-you/referral): completers.
  await seedRespondent({ email: TY_CONTACTED, completed: true });
  await seedRespondent({ email: TY_CONTROL, completed: true });
  // Scenario 3 — already thanked by the 13-12 evergreen AUTO-SEND (marker only; this row predates
  // the campaign_sends ledger, exactly like the prod rows stamped before 13-24 shipped).
  await seedRespondent({
    email: TY_AUTOSENT,
    completed: true,
    metadata: { thankyou_referral_sent_at: new Date().toISOString() },
  });

  // Cohort A (supplemental survey): registered but NO submission.
  await seedRespondent({ email: A_CONTACTED, completed: false });
  await seedRespondent({ email: A_CONTROL, completed: false });

  // Cohort B (re-engagement): wizard_drafts with NO respondent row at all — the case that proves
  // the ledger must be EMAIL-keyed (a respondents.metadata marker could never reach these people).
  await seedDraft(B_CONTACTED);
  await seedDraft(B_CONTROL);

  // Scenarios 1 + 2 — the contact ledger: the welcome backfill / a prior blast run reached these
  // addresses one day ago, inside the 5-day MARKETING_CONTACT_GAP_DAYS window.
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await recordCampaignSend({
    email: TY_CONTACTED,
    campaignId: 'thankyou-referral-auto',
    category: 'thankyou-referral',
    sentAt: oneDayAgo,
  });
  await recordCampaignSend({
    email: A_CONTACTED,
    campaignId: 'cohort_a_supplemental_survey',
    category: 'supplemental-survey',
    sentAt: oneDayAgo,
  });
  await recordCampaignSend({
    email: B_CONTACTED,
    campaignId: 'reengagement-2026-07',
    category: 'reengagement-blast',
    sentAt: oneDayAgo,
  });
}, 60_000);

afterAll(async () => {
  await cleanup();
  if (ORIGINAL_GAP_ENV === undefined) delete process.env.MARKETING_CONTACT_GAP_DAYS;
  else process.env.MARKETING_CONTACT_GAP_DAYS = ORIGINAL_GAP_ENV;
});

describe('13-24 AC6 — recently-contacted addresses are EXCLUDED from every blast cohort', () => {
  it('Cohort C (thank-you/referral): a contacted address is in the RAW cohort but NOT in the SEND cohort', async () => {
    const raw = await selectThankYouRaw(args<ThankYouArgs>());
    const send = await selectThankYouSend(args<ThankYouArgs>());

    // RAW still selects them — proving the exclusion is the FILTER's doing, not a cohort-SQL
    // accident, and that reverting the filter re-admits them (revert-to-RED).
    expect(raw.map((r) => r.email)).toContain(TY_CONTACTED);
    expect(send.cohort.map((r) => r.email)).not.toContain(TY_CONTACTED);

    // The control was never contacted — it must survive, so "the filter emptied everything" fails.
    expect(send.cohort.map((r) => r.email)).toContain(TY_CONTROL);
    expect(send.recentlyContactedEmails).toContain(TY_CONTACTED);
    expect(send.gapDays).toBe(5);
  });

  it('Cohort A (supplemental survey): same pair — excluded from SEND, still present in RAW', async () => {
    const raw = await selectCohortARaw(args<CohortAArgs>());
    const send = await selectCohortASend(args<CohortAArgs>());

    expect(raw.map((r) => r.email)).toContain(A_CONTACTED);
    expect(send.cohort.map((r) => r.email)).not.toContain(A_CONTACTED);
    expect(send.cohort.map((r) => r.email)).toContain(A_CONTROL);
  });

  it('Cohort B (re-engagement drafts, NO respondent row): excluded from SEND, still present in RAW', async () => {
    const raw = await selectReengagementRaw(args<ReengagementArgs>());
    const send = await selectReengagementSend(args<ReengagementArgs>());

    expect(raw.map((r) => r.email)).toContain(B_CONTACTED);
    expect(send.cohort.map((r) => r.email)).not.toContain(B_CONTACTED);
    expect(send.cohort.map((r) => r.email)).toContain(B_CONTROL);
  });
});

describe('13-24 AC3c — the auto-send↔blast race is closed at the source', () => {
  it('a completer already thanked by the 13-12 auto-send is NOT in the thank-you blast cohort', async () => {
    // This one is excluded by the cohort SQL itself (`metadata->>thankyou_referral_sent_at IS NULL`),
    // which covers HISTORIC auto-sends that predate the ledger — so it is absent from RAW too.
    const raw = await selectThankYouRaw(args<ThankYouArgs>());
    const send = await selectThankYouSend(args<ThankYouArgs>());
    expect(raw.map((r) => r.email)).not.toContain(TY_AUTOSENT);
    expect(send.cohort.map((r) => r.email)).not.toContain(TY_AUTOSENT);

    // Guard the guard: the marker really is set on the fixture, so the assertion above cannot pass
    // for the wrong reason (e.g. the row failing to seed at all).
    const marked = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM respondents r
      INNER JOIN magic_link_tokens mlt ON mlt.respondent_id = r.id
      WHERE mlt.email = ${TY_AUTOSENT}
        AND r.metadata->>'thankyou_referral_sent_at' IS NOT NULL
    `);
    expect((marked.rows[0] as { n: number }).n).toBe(1);
  });
});

describe('13-24 AC6 — scenario 2: a blast re-run inside the window sends to nobody twice', () => {
  it('re-recording a contact for the control address removes it from the next cohort too', async () => {
    const before = await selectThankYouSend(args<ThankYouArgs>());
    expect(before.cohort.map((r) => r.email)).toContain(TY_CONTROL);

    // Simulate the first live run having just sent to the control address (the chokepoint writes
    // exactly this row on every successful marketing send).
    await recordCampaignSend({
      email: TY_CONTROL,
      campaignId: 'thankyou-referral-2026-07',
      category: 'thankyou-referral',
    });

    const after = await selectThankYouSend(args<ThankYouArgs>());
    expect(after.cohort.map((r) => r.email)).not.toContain(TY_CONTROL);
    expect(after.recentlyContactedSkipped).toBeGreaterThanOrEqual(before.recentlyContactedSkipped + 1);
  });
});

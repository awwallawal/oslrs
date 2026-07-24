import { and, gte, inArray } from 'drizzle-orm';
import pino from 'pino';
import { db } from '../db/index.js';
import { campaignSends, type CampaignSendChannel } from '../db/schema/index.js';
import { toCanonicalEmail } from '../lib/canonical-email.js';
import { getSuppressedEmails } from './email-events.service.js';

const logger = pino({ name: 'campaign-contact' });

/**
 * Story 13-24 (AC3/AC6) — the SHARED, INHERITED marketing-cohort guard.
 *
 * Two rules, one place, consulted by every marketing send:
 *   1. **Suppression** (13-9/13-13) — never mail a bounced / complained / unsubscribed address.
 *   2. **Recent contact** (13-24, NEW) — never mail an address this programme already contacted
 *      inside the gap window, whoever contacted it (welcome auto-send, welcome backfill, or any of
 *      the three blast scripts).
 *
 * Rule 2 is the launch-safety fix. Before it, `_thankyou-referral-blast.ts` WROTE
 * `metadata.thankyou_referral_sent_at` (:361) but never READ it, so an auto-welcomed completer
 * stayed in the blast cohort; and nothing at all connected the welcome backfill to the blasts, or a
 * blast to its own re-run. See `docs/handoff-2026-07-23-send-ownership-triangulation.md` §1.
 *
 * DESIGN: exactly the shape the codebase already trusts — the blasts inherit this the same way they
 * already inherit `getSuppressedEmails()`. `filterMarketingCohort()` is the ONE call each cohort
 * builder makes; a future SMS blast (9-27 Part B, deferred) gets both rules for free by calling it.
 */

/**
 * AC6 — the gap as DATA, not operator discipline. An operator cannot skip a filter that lives in
 * the cohort builder; they *could* skip a runbook step. 5 days is the resolved decision
 * (Awwal 2026-07-23) from the story's 3-vs-5 open question: long enough that a welcome and a blast
 * never read as one burst, short enough not to stall the launch sequence.
 *
 * Overridable via `MARKETING_CONTACT_GAP_DAYS` for an operator who must deliberately shorten or
 * lengthen a window — an invalid or absent value falls back to 5 (never to 0, which would silently
 * disable the guard).
 */
export const MARKETING_CONTACT_GAP_DAYS = 5;

export function resolveGapDays(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) return override;
  const raw = process.env.MARKETING_CONTACT_GAP_DAYS;
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    logger.warn({
      event: 'campaign_contact.invalid_gap_env',
      value: raw,
      fallbackDays: MARKETING_CONTACT_GAP_DAYS,
      note: 'MARKETING_CONTACT_GAP_DAYS must be a positive number — ignoring',
    });
  }
  return MARKETING_CONTACT_GAP_DAYS;
}

export function gapCutoff(gapDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - gapDays * 24 * 60 * 60 * 1000);
}

/**
 * AC3a — record a marketing contact. Called from the ONE send chokepoint
 * (`EmailService.dispatch`, marketing categories only) after a confirmed provider send, so no
 * initiator can forget to write it.
 *
 * FAIL-SOFT: a ledger-write failure must never change send behaviour or fail a caller (parity with
 * the NotificationMeter). It IS logged loudly — a persistent failure degrades the dedupe, which the
 * 13-42 ops digest can watch.
 */
export async function recordCampaignSend(args: {
  email: string;
  campaignId?: string | null;
  category?: string | null;
  channel?: CampaignSendChannel;
  messageId?: string | null;
  sentAt?: Date;
}): Promise<void> {
  const email = toCanonicalEmail(args.email);
  if (!email) return;
  try {
    await db.insert(campaignSends).values({
      email,
      campaignId: args.campaignId ?? null,
      category: args.category ?? null,
      channel: args.channel ?? 'email',
      messageId: args.messageId ?? null,
      ...(args.sentAt ? { sentAt: args.sentAt } : {}),
    });
  } catch (err) {
    logger.error({
      event: 'campaign_contact.record_failed',
      campaignId: args.campaignId ?? null,
      error: err instanceof Error ? err.message : String(err),
      note: 'contact ledger write failed — dedupe for this address is degraded',
    });
  }
}

/**
 * AC3a/AC6 — the read: which of `emails` were contacted within the gap window. Scoped to the
 * cohort's own addresses (never loads the whole ledger), mirroring the 13-9 M2 review fix.
 */
export async function getRecentlyContactedEmails(
  emails: string[],
  gapDays?: number,
  now: Date = new Date(),
): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const cutoff = gapCutoff(resolveGapDays(gapDays), now);
  const lowered = [...new Set(emails.map(toCanonicalEmail))].filter(Boolean);
  if (lowered.length === 0) return new Set();
  const rows = await db
    .select({ email: campaignSends.email })
    .from(campaignSends)
    .where(and(inArray(campaignSends.email, lowered), gte(campaignSends.sentAt, cutoff)));
  return new Set(rows.map((r) => r.email));
}

export interface MarketingCohortFilterResult<T> {
  /** The addresses that may be sent to — at most ONE row per canonical address (see below). */
  cohort: T[];
  suppressedSkipped: number;
  recentlyContactedSkipped: number;
  /**
   * Story 13-24 (review M2) — rows dropped because an EARLIER row in this same cohort already
   * carried the same canonical address. The ledger dedupes ACROSS runs (it is read once at
   * cohort-build and written per-send), so it cannot stop the same inbox appearing twice WITHIN one
   * run — e.g. two `respondents` rows sharing an email (`duplicate-registration` is a real category;
   * `DISTINCT ON (r.id)` collapses per-respondent, not per-email). Keeping the whole cohort would
   * send two copies in a single blast, the exact double-contact AC3 forbids.
   */
  duplicatesSkipped: number;
  /** Masked-free canonical addresses dropped for recent contact — surfaced in dry-run output. */
  recentlyContactedEmails: string[];
  gapDays: number;
  cutoff: Date;
}

/**
 * AC3b — **THE inherited cohort filter. Every marketing cohort builder calls this and only this.**
 *
 * Applies suppression AND the recent-contact gap in one pass so a caller cannot accidentally
 * inherit one and miss the other. Returns counts (not just the survivors) so each script's
 * dry-run can report honestly WHY a recipient dropped out — AC5(iii) counts-honesty: the dry-run
 * output is the source of truth for cohort size, not a stale snapshot in a doc.
 *
 * @param rows      the raw cohort (any shape)
 * @param getEmail  how to read the destination address off a row
 */
export async function filterMarketingCohort<T>(
  rows: T[],
  getEmail: (row: T) => string,
  options: { gapDays?: number; now?: Date } = {},
): Promise<MarketingCohortFilterResult<T>> {
  const gapDays = resolveGapDays(options.gapDays);
  const now = options.now ?? new Date();
  const cutoff = gapCutoff(gapDays, now);

  if (rows.length === 0) {
    return {
      cohort: [],
      suppressedSkipped: 0,
      recentlyContactedSkipped: 0,
      duplicatesSkipped: 0,
      recentlyContactedEmails: [],
      gapDays,
      cutoff,
    };
  }

  const emails = rows.map(getEmail);

  // 1. Suppression (13-9 / 13-13) — unchanged semantics, now inherited from here.
  const suppressed = await getSuppressedEmails(emails);
  const afterSuppression = rows.filter((r) => !suppressed.has(toCanonicalEmail(getEmail(r))));
  const suppressedSkipped = rows.length - afterSuppression.length;

  // 2. Recent contact (13-24) — closes welcome↔blast, auto-send↔blast, and blast-re-run.
  const recent = await getRecentlyContactedEmails(
    afterSuppression.map(getEmail),
    gapDays,
    now,
  );
  const afterRecent = afterSuppression.filter((r) => !recent.has(toCanonicalEmail(getEmail(r))));
  const recentlyContactedEmails = afterSuppression
    .map((r) => toCanonicalEmail(getEmail(r)))
    .filter((e) => recent.has(e));
  const recentlyContactedSkipped = afterSuppression.length - afterRecent.length;

  // 3. Intra-run de-dupe (13-24 review M2) — keep the FIRST row per canonical address. The ledger
  // guards ACROSS runs; this guards WITHIN one run, so a cohort that lists the same inbox twice
  // (two respondent rows sharing an email) still sends exactly once. Order-preserving.
  const seen = new Set<string>();
  const cohort = afterRecent.filter((r) => {
    const email = toCanonicalEmail(getEmail(r));
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });
  const duplicatesSkipped = afterRecent.length - cohort.length;

  if (recentlyContactedSkipped > 0 || duplicatesSkipped > 0) {
    logger.info({
      event: 'campaign_contact.recently_contacted_excluded',
      skipped: recentlyContactedSkipped,
      duplicatesSkipped,
      gapDays,
      cutoff: cutoff.toISOString(),
    });
  }

  return {
    cohort,
    suppressedSkipped,
    recentlyContactedSkipped,
    duplicatesSkipped,
    recentlyContactedEmails,
    gapDays,
    cutoff,
  };
}

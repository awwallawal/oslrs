import { and, gte, inArray, sql } from 'drizzle-orm';
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
  /**
   * Story 13-46 (review A3 / finding H3) — OPTIONAL narrowing to specific categories.
   *
   * Omitted (the default, and what all four blast/backfill scripts use) = ANY marketing contact,
   * i.e. 13-24's original cross-campaign semantics, unchanged.
   *
   * Supplied = "was this address contacted by THESE campaigns". The registration auto thank-you
   * passes its own category, because the broad read was suppressing a genuine thank-you for anyone
   * a *different* campaign had touched inside the window — permanently, since nothing re-drives it.
   * Cross-campaign suppression is right for a blast (two campaigns in a week is double-contact);
   * it is wrong for a receipt the person's own action just triggered.
   */
  options: { categories?: string[] } = {},
): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const cutoff = gapCutoff(resolveGapDays(gapDays), now);
  const lowered = [...new Set(emails.map(toCanonicalEmail))].filter(Boolean);
  if (lowered.length === 0) return new Set();
  const predicates = [inArray(campaignSends.email, lowered), gte(campaignSends.sentAt, cutoff)];
  if (options.categories?.length) {
    predicates.push(inArray(campaignSends.category, options.categories));
  }
  const rows = await db
    .select({ email: campaignSends.email })
    .from(campaignSends)
    .where(and(...predicates));
  return new Set(rows.map((r) => r.email));
}

/**
 * Story 13-50 AC5 — THE PRE-BLAST PHANTOM SWEEP.
 *
 * Any cohort assembled from `wizard_drafts` inherits AC4's phantoms: `wizard_drafts` is keyed on
 * email and the wizard autosaves mid-typing, so a half-entered address gets its own row and
 * becomes **a person who never existed**. Four of them were invited in D4 on 2026-08-06, at
 * addresses that cannot receive mail, and all four belonged to people ALREADY in the register.
 *
 * AC4 closes the producer going forward. This closes the stock, and it closes it at the SHARED
 * filter rather than in each blast script — same reason the magic-link audit moved into
 * `issueToken`: a per-script check is a census of sites, and the next script simply doesn't have
 * one ([[pattern-census-counts-sites-not-callers]]).
 *
 * ⚠️ EXCLUDED, NOT REPORTED (AC5.1). A report nobody reads is not a guard.
 * ⚠️ AND LOGGED (AC5.2). A silent filter reads as "everyone was contacted" — the failure mode of
 * [[pattern-test-that-passes-over-a-hole]] applied to operations rather than to tests.
 */
export interface PhantomSweepResult<T> {
  cohort: T[];
  phantomPrefixSkipped: number;
  alreadyRegisteredSkipped: number;
  /** Canonical addresses dropped as mid-typing prefixes — printed by the dry-run. */
  droppedPhantomEmails: string[];
  /** Canonical addresses dropped because their owner is already in the register. */
  droppedRegisteredEmails: string[];
}

/**
 * The detector, as the story wrote it: *a draft email that is a strict PREFIX of another draft
 * email = abandoned mid-typing.* (`yusuffasiat@gmail.co` is a strict prefix of
 * `yusuffasiat@gmail.com`.)
 *
 * PURE — the DB reads are the caller's job ({@link loadPhantomSweepContext}) so the rule itself is
 * testable without fixtures, and so a zero here can be told apart from a query that returned
 * nothing.
 *
 * `registeredEmails` is applied ONLY by campaigns that INVITE PEOPLE TO REGISTER. It must never
 * be applied blanket-wide: `_cohort-a-supplemental-survey-blast.ts` and
 * `_backfill-registration-autosends.ts` deliberately target people who ARE registered, and a
 * shared "drop the registered" rule would silently empty both.
 */
export function sweepPhantomDrafts<T>(
  rows: T[],
  getEmail: (row: T) => string,
  ctx: { allDraftEmails: Iterable<string>; registeredEmails: Iterable<string> },
): PhantomSweepResult<T> {
  const drafts = [...ctx.allDraftEmails].map(toCanonicalEmail);
  const registered = new Set([...ctx.registeredEmails].map(toCanonicalEmail));

  const droppedPhantomEmails: string[] = [];
  const droppedRegisteredEmails: string[] = [];

  const cohort = rows.filter((row) => {
    const email = toCanonicalEmail(getEmail(row));
    // A strict prefix of some OTHER draft address — the longer one is the real address.
    if (drafts.some((other) => other !== email && other.startsWith(email))) {
      droppedPhantomEmails.push(email);
      return false;
    }
    if (registered.has(email)) {
      droppedRegisteredEmails.push(email);
      return false;
    }
    return true;
  });

  return {
    cohort,
    phantomPrefixSkipped: droppedPhantomEmails.length,
    alreadyRegisteredSkipped: droppedRegisteredEmails.length,
    droppedPhantomEmails,
    droppedRegisteredEmails,
  };
}

/**
 * Load what {@link sweepPhantomDrafts} needs: every draft address (to find prefixes against) and
 * the subset of `candidateEmails` whose owner is already in the register.
 *
 * ⚠️ ALL draft emails, not just the cohort's. The phantom is the SHORT address; the address that
 * proves it is a phantom is the LONG one, which may well not be in this cohort — it belongs to
 * somebody who finished typing and is therefore no longer an abandoned draft. Restricting the
 * comparison set to the cohort would make the detector find nothing and report success.
 */
export async function loadPhantomSweepContext(
  candidateEmails: string[],
): Promise<{ allDraftEmails: string[]; registeredEmails: string[] }> {
  const canonical = [...new Set(candidateEmails.map(toCanonicalEmail))].filter(Boolean);
  if (canonical.length === 0) return { allDraftEmails: [], registeredEmails: [] };

  const draftRows = (await db.execute(
    sql`SELECT lower(email) AS email FROM "wizard_drafts" WHERE email IS NOT NULL`,
  )) as unknown as { rows: Array<{ email: string }> };

  // "Already registered" = has a respondent row reachable from the address on their submission,
  // which is the same resolution `/check-registration` uses. `rolled_back` rows are soft-deleted
  // and must not count as registered.
  /**
   * ⚠️ `IN (sql.join(...))`, NOT `= ANY(${canonical})`.
   *
   * The `ANY` spelling was written first and threw `malformed array literal` on the FIRST real
   * execution against Postgres: drizzle binds a JS array as ONE parameter, so `= ANY($1)` hands
   * `ANY` a scalar string. Every unit test passed — they exercise the pure `sweepPhantomDrafts`,
   * not the loader — and it was `blast-cohort-dedupe.integration.test.ts` that caught it. Left
   * unfixed it would have thrown on every draft-derived blast, i.e. on the next jingle-week send.
   * `sql.join` emits one bound placeholder per address, which is what the neighbouring
   * `inArray()` calls in this file already do.
   */
  const registeredRows = (await db.execute(sql`
    SELECT DISTINCT lower(s.raw_data->>'email') AS email
    FROM "respondents" r
    JOIN "submissions" s ON s.respondent_id = r.id
    WHERE r."status" <> 'rolled_back'
      AND lower(s.raw_data->>'email') IN (${sql.join(
        canonical.map((e) => sql`${e}`),
        sql`, `,
      )})
  `)) as unknown as { rows: Array<{ email: string | null }> };

  return {
    allDraftEmails: draftRows.rows.map((r) => r.email).filter(Boolean),
    registeredEmails: registeredRows.rows.map((r) => r.email).filter((e): e is string => !!e),
  };
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
  /**
   * Story 13-50 AC5 — 0 unless `draftCohortSweep` was requested. Reported separately from
   * `duplicatesSkipped` because they are different failures: a duplicate is one inbox listed
   * twice; a phantom is an inbox that does not exist.
   */
  phantomPrefixSkipped: number;
  alreadyRegisteredSkipped: number;
  droppedPhantomEmails: string[];
  droppedRegisteredEmails: string[];
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
  options: {
    gapDays?: number;
    now?: Date;
    /**
     * Story 13-50 AC5 — opt-in, and opt-in ON PURPOSE.
     *
     * Set this for a cohort assembled from `wizard_drafts` whose purpose is to INVITE PEOPLE TO
     * REGISTER (`_draft-adoption-programme` D4 invites, `_reengagement-email-blast`,
     * `_recover-abandoned-wizard-drafts`).
     *
     * ⛔ DO NOT set it on `_cohort-a-supplemental-survey-blast` or
     * `_backfill-registration-autosends`: those deliberately target people who ARE registered, so
     * the already-registered exclusion would empty their cohorts entirely and the run would report
     * a clean zero. Defaulting this to `true` would have been a silent, total outage of two live
     * campaigns dressed up as a data-hygiene fix.
     */
    draftCohortSweep?: boolean;
  } = {},
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
      phantomPrefixSkipped: 0,
      alreadyRegisteredSkipped: 0,
      droppedPhantomEmails: [],
      droppedRegisteredEmails: [],
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
  const deduped = afterRecent.filter((r) => {
    const email = toCanonicalEmail(getEmail(r));
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });
  const duplicatesSkipped = afterRecent.length - deduped.length;

  // 4. Story 13-50 AC5 — phantom sweep, for draft-derived invite cohorts only.
  let cohort = deduped;
  let phantomPrefixSkipped = 0;
  let alreadyRegisteredSkipped = 0;
  let droppedPhantomEmails: string[] = [];
  let droppedRegisteredEmails: string[] = [];
  if (options.draftCohortSweep) {
    const ctx = await loadPhantomSweepContext(deduped.map(getEmail));
    const swept = sweepPhantomDrafts(deduped, getEmail, ctx);
    cohort = swept.cohort;
    phantomPrefixSkipped = swept.phantomPrefixSkipped;
    alreadyRegisteredSkipped = swept.alreadyRegisteredSkipped;
    droppedPhantomEmails = swept.droppedPhantomEmails;
    droppedRegisteredEmails = swept.droppedRegisteredEmails;

    // AC5.2 — LOG THE EXCLUSIONS. A silent filter reads as "everyone was contacted".
    // Emitted even at zero: "the sweep ran and found nothing" and "the sweep never ran" must not
    // look the same in the log, which is exactly how an empty result gets read as a negative one.
    logger.info({
      event: 'campaign_contact.phantom_sweep',
      considered: deduped.length,
      phantomPrefixSkipped,
      alreadyRegisteredSkipped,
      remaining: cohort.length,
      droppedPhantomEmails,
      droppedRegisteredEmails,
    });
  }

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
    phantomPrefixSkipped,
    alreadyRegisteredSkipped,
    droppedPhantomEmails,
    droppedRegisteredEmails,
  };
}

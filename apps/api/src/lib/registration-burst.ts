/**
 * Story 13-46 (AC3) — GLOBAL REGISTRATION-BURST BREAKER: it ALERTS, it does not BLOCK.
 *
 * ⚠️ READ THIS BEFORE CHANGING ANYTHING HERE. "Circuit breaker" normally means "stop serving".
 * This one deliberately does not. During a campaign a burst is the SUCCESS signal — the whole
 * point of paying for a radio jingle is that a lot of people register at once — and a control that
 * swallows the spike destroys the measurement it should produce. Nothing in this module can reject
 * a request; the only output is a finding to page on.
 *
 * COMPOSES WITH 9-52, DOES NOT DUPLICATE IT. `cf-watch.ts` watches the Cloudflare EDGE for
 * bot-vs-viral classification (requests-up WHILE page-views-flat, threats, error ratio). It is
 * structurally blind to application-layer 429s: a jingle that converts is requests-UP *and*
 * page-views-UP, which is deliberately NOT a trigger there — while every rate-limited listener
 * silently takes a 429 that never reaches the edge signals. This watches the application WRITE
 * path, reuses the same per-kind cooldown + dispatch discipline, and pages the same channel.
 *
 * STRUCTURE: the evaluator and the message formatter are PURE (no I/O), and the orchestration is
 * dependency-injected — the same shape as `cf-watch.ts`, and for the same reason: the cooldown and
 * degradation paths have to be unit-testable rather than buried in the request path. The Redis and
 * Express wiring lives in `middleware/registration-burst.ts`.
 *
 * (The story's Project Structure note suggests lib/ + a `scripts/` runner. That convention exists
 * because `apps/api/tsconfig.json` sets `rootDir: ./src`, so `scripts/` is neither type-checked nor
 * unit-tested. This breaker's runner is IN-REQUEST rather than a cron, so both halves live under
 * `src/` — which satisfies the reason the convention exists.)
 */

export interface BurstCounts {
  /** Wizard submits that REACHED the controller in the rolling window (all IPs, one bucket). */
  submits: number;
  /**
   * Requests refused with HTTP 429 by a SUBMIT limiter in the window (per-IP or per-email).
   *
   * ⚠️ Story 13-46 (review A12 / finding L2) — kept SEPARATE from draft refusals. A submit refusal
   * turns away a finished registration; an autosave refusal loses a draft. Different events,
   * different remedies, and autosaves run at 20-60× the per-session volume of submits, so one
   * shared threshold derived from submit refusals would either false-page on drafts or miss a
   * submit wall.
   */
  blocked429: number;
  /** Requests refused with HTTP 429 by a DRAFT limiter in the window (autosave / hydration). */
  blocked429Draft: number;
  /** Registration auto thank-you sends that actually dispatched in the window. */
  autoSends: number;
  /**
   * Story 13-65 (AC5) — `email-notification` WAITING depth at evaluation time, or `null` when the
   * queue could not be read.
   *
   * ⚠️ THIS FIELD EXISTS TO MAKE A NEW BLIND SPOT LEGIBLE, NOT TO TRIGGER ANYTHING. 13-65 moved the
   * registration sends onto the queue, so `autoSends` is now counted when the WORKER sends, on a
   * minute-resolution bucket — not when the registration arrives. Under a backlog it therefore LAGS
   * `submits` in the same window. Before 13-65 those two numbers moved together, so "300 submits, 40
   * auto-sends" meant something had STOPPED; it now usually means something is QUEUED. The depth is
   * what tells the two apart.
   *
   * ⛔ It is NOT a threshold and NOT a second breaker: `evaluateBurst` never reads it. 13-46 owns the
   * breaker — one alert, one set of thresholds, one cooldown.
   */
  emailQueueWaiting: number | null;
  /**
   * Story 13-65 (review B12 / finding L12) — is the email queue PAUSED?
   *
   * A deep queue that is paused reads identically to one that is draining, and the two remedies are
   * opposite: resume it, versus wait. `null` when the stats read failed.
   */
  emailQueuePaused: boolean | null;
}

export interface MarketingHeadroomView {
  dailyUsed: number;
  dailyRemaining: number;
  dailyCap: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  monthlyCap: number;
}

export type BurstKind = 'registration_burst' | 'registration_turnaway' | 'draft_turnaway';
export type BurstSeverity = 'warning' | 'critical';

export interface BurstFinding {
  kind: BurstKind;
  severity: BurstSeverity;
  counts: BurstCounts;
}

/**
 * Single source of truth for the thresholds — referenced by the watcher AND its tests.
 *
 * DERIVATION — MEASURED ON PROD 2026-08-21 (AC7). Baseline volume is effectively zero: 1-8
 * submissions/day over the trailing 14 days, and the busiest registration day in the register's
 * entire history is **168 submissions (2026-08-04)** — an average of ~0.6 per 5-minute window even
 * on that day. So a threshold in the tens is already "unlike anything this system has ever seen",
 * and 60/5min would NOT have paged on the busiest real day.
 *
 *   submitsPerWindow = 60 over a 5-minute window = 12/min = ~720/hour sustained.
 *
 * FAILS TOWARD: paging on a merely-good jingle minute. That direction is CHEAP here precisely
 * because the breaker never blocks — the cost of a false page is one Telegram message the operator
 * wanted anyway ("did the jingle work?"), bounded further by the cooldown. The opposite direction
 * (threshold too high) means the operator learns about a flood late, which is the expensive one.
 *
 *   blocked429PerWindow = 10.
 *
 * ⚠️ THIS IS THE SIGNAL NOTHING ELSE HAS. 36 blocks across 5 IPs went unnoticed until a registrant
 * emailed to say he could not finish — the only trace was a `logger.warn` nobody was asked to read.
 * Measured 2026-08-21: since the 2026-08-07 hotfix the IP limiter has fired **zero** times in 13
 * days, and the per-email limiter twice — both at `attempts=4`, i.e. ONE retry over the limit of 3,
 * which is what a real person making a second attempt looks like. At that rate this threshold
 * cannot false-page on organic traffic.
 * 10 refusals in 5 minutes is already a wall; a handful is one bot hitting its own limit, which is
 * the control working and must not page.
 *
 * REOPEN TRIGGER: sustained legitimate traffic above 12 submits/min (i.e. the register growing by
 * >700/hour becomes normal), or a page firing on a day with no campaign running.
 */
export const BURST_THRESHOLDS = {
  windowMinutes: 5,
  submitsPerWindow: 60,
  blocked429PerWindow: 10,
  /**
   * Draft refusals get their OWN, higher ceiling (review A12 / L2). A single wizard session makes
   * 20-60 debounced autosaves, so a handful of draft 429s is one client hitting its own limit,
   * while 60 in five minutes is a wall that is losing people's half-finished registrations.
   * Measured 2026-08-21: this event has fired ZERO times on prod in the full retained window.
   */
  blocked429DraftPerWindow: 60,
} as const;

export type BurstThresholds = typeof BURST_THRESHOLDS;

/** A value at ≥ 2× its trigger threshold escalates warning → critical (mirrors `cf-watch.ts`). */
function severityFor(value: number, threshold: number): BurstSeverity {
  return value >= threshold * 2 ? 'critical' : 'warning';
}

/**
 * PURE + total. Turns a window's counts into at most one finding.
 *
 * The 429 wall is checked FIRST and reported as its own kind: a turn-away is a worse thing to be
 * told about late than a burst, because a burst is people arriving and a turn-away is people being
 * refused. If both are true the turn-away is the headline.
 */
export function evaluateBurst(
  counts: BurstCounts,
  t: BurstThresholds = BURST_THRESHOLDS,
): BurstFinding | null {
  // Submit refusals first: a turned-away SUBMIT is the worst of the three things this can report.
  if (counts.blocked429 >= t.blocked429PerWindow) {
    return {
      kind: 'registration_turnaway',
      severity: severityFor(counts.blocked429, t.blocked429PerWindow),
      counts,
    };
  }
  // Draft refusals against their own, higher threshold (review A12 / L2).
  if (counts.blocked429Draft >= t.blocked429DraftPerWindow) {
    return {
      kind: 'draft_turnaway',
      severity: severityFor(counts.blocked429Draft, t.blocked429DraftPerWindow),
      counts,
    };
  }
  if (counts.submits >= t.submitsPerWindow) {
    return {
      kind: 'registration_burst',
      severity: severityFor(counts.submits, t.submitsPerWindow),
      counts,
    };
  }
  return null;
}

const n = (v: number): string => v.toLocaleString('en-US');

/**
 * PURE. ONE message carrying all four numbers AC3 asks for: submits, 429s, auto-sends, and the
 * marketing cap headroom from AC1 — so the operator sees the size of the burst and the amount of
 * sending budget left to absorb it without opening a second surface.
 */
export function formatBurstAlert(
  finding: BurstFinding,
  headroom: MarketingHeadroomView | null,
  t: BurstThresholds = BURST_THRESHOLDS,
): string {
  const sev = finding.severity === 'critical' ? '🔴 CRITICAL' : '🟡 WARNING';
  const title =
    finding.kind === 'registration_turnaway'
      ? '⚠️ Registration SUBMITS are being REFUSED (429 wall)'
      : finding.kind === 'draft_turnaway'
        ? '⚠️ Wizard AUTOSAVES are being refused — drafts are being lost'
        : '📈 Registration burst';

  const lines = [
    `${sev} · ${title}`,
    '',
    `Window: last ${t.windowMinutes} min (all IPs)`,
    `Submits: ${n(finding.counts.submits)}`,
    `Refused — submits (429): ${n(finding.counts.blocked429)}`,
    `Refused — autosaves (429): ${n(finding.counts.blocked429Draft)}`,
    `Auto thank-you sends: ${n(finding.counts.autoSends)}`,
    finding.counts.emailQueueWaiting === null
      ? 'Email queue waiting: unavailable (queue read failed)'
      : `Email queue waiting: ${n(finding.counts.emailQueueWaiting)}` +
        (finding.counts.emailQueuePaused
          ? ' — ⛔ QUEUE IS PAUSED: nothing is draining and citizen mail is parked. Resume it.'
          : ''),
    '',
    // Story 13-65 (AC5) — the caveat lives in the MESSAGE, not only in a comment. A reader who sees
    // only the counts will misdiagnose a backlog as a stoppage.
    'ℹ️ Auto thank-you sends are counted when the QUEUE sends them, not when the registration ' +
      'arrives. Under a backlog this number LAGS the submits in the same window — a gap between ' +
      'them plus a non-zero queue depth means QUEUED, not stopped.',
  ];

  if (headroom) {
    lines.push(
      '',
      `Marketing cap headroom: ${n(headroom.dailyRemaining)} left today ` +
        `(${n(headroom.dailyUsed)}/${n(headroom.dailyCap)}), ` +
        `${n(headroom.monthlyRemaining)} left this month ` +
        `(${n(headroom.monthlyUsed)}/${n(headroom.monthlyCap)}).`,
    );
  } else {
    lines.push('', 'Marketing cap headroom: unavailable (meter read failed).');
  }

  lines.push(
    '',
    finding.kind === 'registration_turnaway'
      ? 'Listeners are hitting a rate limit on SUBMIT. Registrations that reached the app HAVE been ' +
        'served; the refused ones were not. Check the limiter ceilings before the next jingle slot.'
      : finding.kind === 'draft_turnaway'
        ? 'Autosaves are being refused, so half-finished registrations are being LOST SILENTLY — a ' +
          'lost draft looks like someone who simply did not finish, and nobody reports it. Raise ' +
          'the draft limiter ceilings; nothing here has turned away a completed registration.'
        : 'Nothing has been blocked — the app is still serving every registration. This is the ' +
        'success signal, sent so you can watch capacity, not so you can throttle it.',
  );

  return lines.join('\n');
}

// ── Orchestration — dependency-injected so cooldown + degradation are unit-testable ──

export interface BurstWatchDeps {
  /** Sum the rolling window's counters. */
  readWindow: () => Promise<BurstCounts>;
  /** AC1's marketing headroom, for the alert body. */
  readHeadroom: () => Promise<MarketingHeadroomView>;
  /** Returns true iff we WON the per-kind cooldown slot (not currently suppressed). */
  winCooldown: (kind: string) => Promise<boolean>;
  /** Dispatch one message (self-gated via `isAlertSendEnabled` at the real impl). */
  dispatch: (message: string) => Promise<boolean>;
  logger: { info: (o: object) => void; warn: (o: object) => void };
}

export interface BurstWatchResult {
  status: 'evaluated' | 'read_failed';
  finding: BurstFinding | null;
  dispatched: number;
  suppressed: number;
}

/**
 * Run one evaluation pass. NEVER THROWS — every failure degrades to a logged no-op and returns a
 * structured result, because this runs on the registration request path and an observability
 * failure must never be able to affect a citizen's registration.
 */
export async function runBurstWatch(deps: BurstWatchDeps): Promise<BurstWatchResult> {
  let counts: BurstCounts;
  try {
    counts = await deps.readWindow();
  } catch (err) {
    deps.logger.warn({
      event: 'registration_burst.read_failed',
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: 'read_failed', finding: null, dispatched: 0, suppressed: 0 };
  }

  const finding = evaluateBurst(counts);
  if (!finding) return { status: 'evaluated', finding: null, dispatched: 0, suppressed: 0 };

  if (!(await safeCooldown(deps, finding.kind))) {
    deps.logger.info({ event: 'registration_burst.cooldown_suppressed', kind: finding.kind });
    return { status: 'evaluated', finding, dispatched: 0, suppressed: 1 };
  }

  // The headroom is an ANNEX to the alert, not a precondition for it: a meter read failure must
  // not swallow the page it was only meant to annotate.
  let headroom: MarketingHeadroomView | null = null;
  try {
    headroom = await deps.readHeadroom();
  } catch (err) {
    deps.logger.warn({
      event: 'registration_burst.headroom_read_failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await deps.dispatch(formatBurstAlert(finding, headroom));
  } catch (err) {
    deps.logger.warn({
      event: 'registration_burst.dispatch_failed',
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: 'evaluated', finding, dispatched: 0, suppressed: 0 };
  }

  deps.logger.info({
    event: 'registration_burst.alerted',
    kind: finding.kind,
    severity: finding.severity,
    ...finding.counts,
  });
  return { status: 'evaluated', finding, dispatched: 1, suppressed: 0 };
}

/** Fail-OPEN: a cooldown read error lets the page through (loud-on-failure, mirrors 9-52). */
async function safeCooldown(deps: BurstWatchDeps, kind: string): Promise<boolean> {
  try {
    return await deps.winCooldown(kind);
  } catch {
    return true;
  }
}

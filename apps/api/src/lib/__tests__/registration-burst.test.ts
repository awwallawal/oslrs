import { describe, it, expect, vi } from 'vitest';
import {
  BURST_THRESHOLDS,
  evaluateBurst,
  formatBurstAlert,
  runBurstWatch,
  type BurstCounts,
} from '../registration-burst.js';

/**
 * Story 13-46 (AC3) — the global registration-burst breaker.
 *
 * ⚠️ THE DEFINING PROPERTY IS THAT IT NEVER BLOCKS. During a campaign a burst is the SUCCESS
 * signal — Awwal wants to know the jingle worked — and a control that swallows it destroys the
 * measurement it exists to produce. This evaluator can only ever return a finding to page on;
 * nothing here can reject a request.
 */
const counts = (over: Partial<BurstCounts> = {}): BurstCounts => ({
  submits: 0,
  blocked429: 0,
  blocked429Draft: 0,
  autoSends: 0,
  // Story 13-65 (AC5) — queue depth is reported, never a trigger.
  emailQueueWaiting: 0,
  ...over,
});

const headroom = {
  dailyUsed: 12,
  dailyRemaining: 1_988,
  dailyCap: 2_000,
  monthlyUsed: 40,
  monthlyRemaining: 19_960,
  monthlyCap: 20_000,
};

describe('evaluateBurst (pure)', () => {
  it('returns NO finding on ordinary volume', () => {
    expect(evaluateBurst(counts({ submits: 3 }))).toBeNull();
  });

  it('returns NO finding one below the threshold (the quiet direction)', () => {
    expect(evaluateBurst(counts({ submits: BURST_THRESHOLDS.submitsPerWindow - 1 }))).toBeNull();
  });

  it('returns a finding AT the threshold', () => {
    const finding = evaluateBurst(counts({ submits: BURST_THRESHOLDS.submitsPerWindow }));

    expect(finding).not.toBeNull();
    expect(finding!.kind).toBe('registration_burst');
    expect(finding!.counts.submits).toBe(BURST_THRESHOLDS.submitsPerWindow);
  });

  it('escalates to critical at 2x the threshold (severity is meaningful)', () => {
    const warn = evaluateBurst(counts({ submits: BURST_THRESHOLDS.submitsPerWindow }));
    const crit = evaluateBurst(counts({ submits: BURST_THRESHOLDS.submitsPerWindow * 2 }));

    expect(warn!.severity).toBe('warning');
    expect(crit!.severity).toBe('critical');
  });

  it('fires on a 429 WALL even when submits are ordinary — the turn-away is the whole point', () => {
    // 9-52's edge watch is blind to application-layer 429s (its signals are requests / page-views /
    // threats). If listeners are being refused, that must page even though throughput looks calm.
    const finding = evaluateBurst(
      counts({ submits: 2, blocked429: BURST_THRESHOLDS.blocked429PerWindow }),
    );

    expect(finding).not.toBeNull();
    expect(finding!.kind).toBe('registration_turnaway');
  });

  it('does NOT fire on a handful of 429s (a bot hitting its own limit is not an incident)', () => {
    expect(
      evaluateBurst(counts({ submits: 2, blocked429: BURST_THRESHOLDS.blocked429PerWindow - 1 })),
    ).toBeNull();
  });
});

describe('formatBurstAlert (pure)', () => {
  it('states submits, 429s, auto-sends AND the marketing cap headroom in ONE message', () => {
    const finding = evaluateBurst(
      counts({ submits: 120, blocked429: 4, autoSends: 118 }),
    )!;

    const msg = formatBurstAlert(finding, headroom);

    expect(msg).toContain('120'); // submits in window
    expect(msg).toContain('4'); // submit 429s in window
    expect(msg).toContain('118'); // auto-sends in window
    expect(msg).toContain('1,988'); // remaining marketing headroom, AC1
    expect(msg).toMatch(/not been blocked|still serving/i); // says it did NOT block
  });
});

describe('runBurstWatch (orchestration)', () => {
  const deps = (over: Partial<Parameters<typeof runBurstWatch>[0]> = {}) => ({
    readWindow: vi.fn().mockResolvedValue(counts({ submits: 500, autoSends: 400 })),
    readHeadroom: vi.fn().mockResolvedValue(headroom),
    winCooldown: vi.fn().mockResolvedValue(true),
    dispatch: vi.fn().mockResolvedValue(true),
    logger: { info: vi.fn(), warn: vi.fn() },
    ...over,
  });

  it('dispatches ONE page when the threshold is crossed', async () => {
    const d = deps();
    const result = await runBurstWatch(d);

    expect(result.dispatched).toBe(1);
    expect(d.dispatch).toHaveBeenCalledTimes(1);
  });

  it('dispatches NOTHING on ordinary volume', async () => {
    const d = deps({ readWindow: vi.fn().mockResolvedValue(counts({ submits: 1 })) });
    const result = await runBurstWatch(d);

    expect(result.dispatched).toBe(0);
    expect(d.dispatch).not.toHaveBeenCalled();
  });

  it('SUPPRESSES a repeat page while the cooldown holds — a burst must not flood Telegram', async () => {
    const d = deps({ winCooldown: vi.fn().mockResolvedValue(false) });
    const result = await runBurstWatch(d);

    expect(result.suppressed).toBe(1);
    expect(d.dispatch).not.toHaveBeenCalled();
  });

  it('NEVER THROWS when the counter read fails — the request path must not care', async () => {
    const d = deps({ readWindow: vi.fn().mockRejectedValue(new Error('redis down')) });

    await expect(runBurstWatch(d)).resolves.toMatchObject({ dispatched: 0, status: 'read_failed' });
  });

  it('NEVER THROWS when the dispatch itself fails', async () => {
    const d = deps({ dispatch: vi.fn().mockRejectedValue(new Error('telegram 500')) });

    await expect(runBurstWatch(d)).resolves.toMatchObject({ dispatched: 0 });
  });

  it('still pages when the headroom read fails — the burst matters more than the annex', async () => {
    const d = deps({ readHeadroom: vi.fn().mockRejectedValue(new Error('redis down')) });
    const result = await runBurstWatch(d);

    expect(result.dispatched).toBe(1);
  });
});

describe('draft refusals are their OWN signal (13-46 review A12 / finding L2)', () => {
  /* A single wizard session makes 20-60 debounced autosaves, so draft refusals run at a completely
   * different scale from submit refusals. Sharing one threshold would either false-page on drafts
   * or miss a submit wall. These four tests pin the separation in both directions. */

  it('does NOT fire on draft refusals at the SUBMIT threshold — that volume is normal for autosaves', () => {
    expect(evaluateBurst(counts({ blocked429Draft: BURST_THRESHOLDS.blocked429PerWindow }))).toBeNull();
  });

  it('FIRES its own kind once draft refusals cross the draft threshold', () => {
    const finding = evaluateBurst(
      counts({ blocked429Draft: BURST_THRESHOLDS.blocked429DraftPerWindow }),
    );

    expect(finding).not.toBeNull();
    expect(finding!.kind).toBe('draft_turnaway');
  });

  it('does NOT fire one below the draft threshold (the quiet direction)', () => {
    expect(
      evaluateBurst(counts({ blocked429Draft: BURST_THRESHOLDS.blocked429DraftPerWindow - 1 })),
    ).toBeNull();
  });

  it('a SUBMIT wall outranks a draft wall — the worse event is the headline', () => {
    const finding = evaluateBurst(
      counts({
        blocked429: BURST_THRESHOLDS.blocked429PerWindow,
        blocked429Draft: BURST_THRESHOLDS.blocked429DraftPerWindow,
      }),
    );

    expect(finding!.kind).toBe('registration_turnaway');
  });

  it('the message reports the two refusal counts SEPARATELY and says which was lost', () => {
    const finding = evaluateBurst(counts({ blocked429Draft: 99 }))!;

    const msg = formatBurstAlert(finding, headroom);

    expect(msg).toContain('99');
    expect(msg).toMatch(/autosave/i);
    expect(msg).toMatch(/lost/i); // a lost draft looks like someone who didn't finish
  });
});


/**
 * Story 13-65 (AC5) — the email-queue depth composes with 13-46's breaker; it does not duplicate it.
 *
 * ⛔ NO SECOND ALERT, NO SECOND THRESHOLD, NO SECOND COOLDOWN. 13-46 owns the breaker. These tests
 * pin BOTH halves of that: the depth appears in the one existing message, and it can never on its
 * own cause (or suppress) a finding.
 */
describe('email queue depth in the burst alert (Story 13-65 AC5)', () => {
  it('is NOT a trigger — a huge backlog on quiet traffic produces NO finding', () => {
    // If this ever fails, a second breaker has been introduced by accident.
    expect(evaluateBurst(counts({ submits: 2, emailQueueWaiting: 100_000 }))).toBeNull();
  });

  it('does NOT suppress a finding either — a burst still pages with an empty queue', () => {
    const finding = evaluateBurst(
      counts({ submits: BURST_THRESHOLDS.submitsPerWindow, emailQueueWaiting: 0 }),
    );
    expect(finding).not.toBeNull();
    expect(finding!.kind).toBe('registration_burst');
  });

  it('reports the waiting depth in the SINGLE existing message', () => {
    const finding = evaluateBurst(
      counts({ submits: BURST_THRESHOLDS.submitsPerWindow, autoSends: 4, emailQueueWaiting: 137 }),
    );
    const msg = formatBurstAlert(finding!, null);
    expect(msg).toContain('Email queue waiting: 137');
  });

  it('says so when the queue could not be read, rather than printing a misleading 0', () => {
    const finding = evaluateBurst(
      counts({ submits: BURST_THRESHOLDS.submitsPerWindow, emailQueueWaiting: null }),
    );
    const msg = formatBurstAlert(finding!, null);
    expect(msg).toContain('Email queue waiting: unavailable');
    expect(msg).not.toContain('Email queue waiting: 0');
  });

  it('🔴 NAMES THE NEW BLIND SPOT IN THE MESSAGE TEXT, not only in a comment', () => {
    /**
     * 13-65 moved the registration sends onto the queue, so `recordRegistrationAutoSend()` now fires
     * at WORKER time on a minute-resolution bucket. Under a backlog the auto-send count LAGS the
     * submit count in the same window. Before this story those two numbers moved together, so
     * "300 submits, 40 auto-sends" meant something had STOPPED — it now usually means QUEUED. A
     * reader who sees only the counts will misdiagnose it, and a comment in the source is not
     * something the operator reading a Telegram message at 6am can see.
     */
    const finding = evaluateBurst(
      counts({ submits: 300, autoSends: 40, emailQueueWaiting: 260 }),
    );
    const msg = formatBurstAlert(finding!, null);
    expect(msg).toMatch(/counted when the QUEUE sends them/i);
    expect(msg).toMatch(/LAGS/);
    expect(msg).toMatch(/QUEUED, not stopped/i);
  });

  it('still carries every number 13-46 AC3 asked for, in ONE message', () => {
    const finding = evaluateBurst(
      counts({ submits: 300, blocked429: 4, blocked429Draft: 7, autoSends: 40, emailQueueWaiting: 260 }),
    );
    const msg = formatBurstAlert(finding!, headroom);
    expect(msg).toContain('Submits: 300');
    expect(msg).toContain('Refused — submits (429): 4');
    expect(msg).toContain('Refused — autosaves (429): 7');
    expect(msg).toContain('Auto thank-you sends: 40');
    expect(msg).toContain('Email queue waiting: 260');
    expect(msg).toContain('Marketing cap headroom');
  });
});

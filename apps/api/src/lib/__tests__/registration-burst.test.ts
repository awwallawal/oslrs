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

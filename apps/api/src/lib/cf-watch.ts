/**
 * Story 9-52 — Cloudflare traffic-watch evaluator + orchestration.
 *
 * `evaluateCfWatch` is a PURE function (AC#1 — no I/O) that turns a CloudflareDashboardSummary
 * (from cloudflare-analytics.ts) into zero or more structured findings. `runCfTrafficWatch` is the
 * dependency-injected orchestration (degradation + cooldown + dispatch) the cron script wires up —
 * extracted here so AC#4 (cooldown) and AC#5 (degradation) are unit-testable, not buried in a script.
 *
 * The discriminator (why not a naive "requests > X"): a real viral spike ALSO raises requests —
 * but bots don't run the RUM page-view beacon. So the key signal pairs requests-UP with
 * page-views-FLAT. Free-plan zone data is daily-granularity, so this is a day-over-day
 * early-warning TREND signal, not real-time DDoS detection (Cloudflare handles that layer).
 */
import type { CloudflareDashboardSummary } from './cloudflare-analytics.js';

/** Single source of truth for the watch thresholds (AC#2) — referenced by the watcher AND its tests. */
export const CF_WATCH_THRESHOLDS = {
  /** Latest-day edge requests ≥ this × the trailing-day baseline → spike candidate. */
  requestsSpikeMultiplier: 3,
  /** ...WHILE window human page-views stay below this floor (bots don't run the RUM beacon). */
  pageViewFloor: 50,
  /** Ignore spikes on a tiny baseline (noise) — baseline must be ≥ this many requests/day. */
  minBaselineRequests: 200,
  /** Need ≥ this many days of byDay data to compute a trailing baseline. */
  minDaysForBaseline: 3,
  /** Latest-day WAF threats ≥ this → threats spike (baseline ~16–21/day, 2026-06 data). */
  threatsPerDay: 150,
  /** 4xx+5xx share of responses ≥ this % → error-ratio flood (scanning). */
  errorRatioPct: 30,
  /** Ignore error-ratio on a tiny status sample. */
  minStatusSamples: 100,
} as const;

export type CfWatchThresholds = typeof CF_WATCH_THRESHOLDS;

export type CfWatchKind = 'requests_spike_low_pageviews' | 'threats_spike' | 'error_ratio';
export type CfWatchSeverity = 'warning' | 'critical';

export interface CfWatchFinding {
  kind: CfWatchKind;
  severity: CfWatchSeverity;
  detail: string;
}

/** L3 — severity is meaningful: a value at ≥ 2× its trigger threshold escalates warning → critical. */
function severityFor(value: number, threshold: number): CfWatchSeverity {
  return value >= threshold * 2 ? 'critical' : 'warning';
}

/**
 * Evaluate a Cloudflare summary against thresholds → findings. PURE + total: a null/empty summary
 * (degradation — CF token unset or fetch failed) yields [] (AC#5 at the evaluator level).
 */
export function evaluateCfWatch(
  summary: CloudflareDashboardSummary | null,
  t: CfWatchThresholds = CF_WATCH_THRESHOLDS,
): CfWatchFinding[] {
  const findings: CfWatchFinding[] = [];
  const zone = summary?.zone;
  if (!zone) return findings;

  const byDay = zone.byDay ?? [];

  // 1) requests_spike_low_pageviews — latest day ≥ N× trailing baseline WHILE page-views below floor.
  // L2: baseline is a simple mean — adequate for a daily trend signal; a single spiky prior day can
  // inflate it (masking a real spike), which is the safe direction (fewer false pages).
  if (byDay.length >= t.minDaysForBaseline) {
    const latest = byDay[byDay.length - 1];
    const prior = byDay.slice(0, -1);
    const baseline = prior.reduce((s, d) => s + d.requests, 0) / prior.length;
    const pageViews = summary?.rum?.pageViews ?? zone.pageViews ?? 0;
    const trigger = baseline * t.requestsSpikeMultiplier;
    if (baseline >= t.minBaselineRequests && latest.requests >= trigger && pageViews < t.pageViewFloor) {
      const x = (latest.requests / baseline).toFixed(1);
      findings.push({
        kind: 'requests_spike_low_pageviews',
        severity: severityFor(latest.requests, trigger),
        detail: `Edge requests on ${latest.date} = ${latest.requests} (${x}× the ${Math.round(baseline)}/day baseline) while page-views = ${pageViews} (< ${t.pageViewFloor}). Looks bot-driven, not viral — consider Bot Fight Mode / a WAF rule.`,
      });
    }
  }

  // 2) threats_spike — latest-DAY WAF threats ≥ threshold. M2: per-day ONLY (never the window total
  // zone.threats, which would be a unit mismatch against a per-day threshold → false positive).
  if (byDay.length > 0) {
    const latestThreats = byDay[byDay.length - 1].threats;
    if (latestThreats >= t.threatsPerDay) {
      findings.push({
        kind: 'threats_spike',
        severity: severityFor(latestThreats, t.threatsPerDay),
        detail: `WAF threats spiked to ${latestThreats} (≥ ${t.threatsPerDay}/day). Probe/scan activity — check WAF events + consider a rule.`,
      });
    }
  }

  // 3) error_ratio — 4xx+5xx share of responses ≥ threshold (scanning floods 401/403/404).
  // L1: this is WINDOW-level (the lib exposes no per-day status breakdown), so it's less sensitive
  // than the per-day spike signals — a single bad day is diluted across the window. Documented limit.
  const totalStatus = zone.status.reduce((sum, s) => sum + s.count, 0);
  if (totalStatus >= t.minStatusSamples) {
    const errors = zone.status.filter((s) => s.code >= 400).reduce((sum, s) => sum + s.count, 0);
    const ratioPct = (errors / totalStatus) * 100;
    if (ratioPct >= t.errorRatioPct) {
      findings.push({
        kind: 'error_ratio',
        severity: severityFor(ratioPct, t.errorRatioPct),
        detail: `4xx+5xx responses = ${ratioPct.toFixed(0)}% of ${totalStatus} (≥ ${t.errorRatioPct}%). Looks like scanning — check top status codes + paths.`,
      });
    }
  }

  return findings;
}

/** Compose the Telegram message for a finding (AC#2.2 — severity + kind + numbers + suggested action). */
export function formatCfWatchMessage(finding: CfWatchFinding): string {
  const label: Record<CfWatchKind, string> = {
    requests_spike_low_pageviews: '🤖 Edge request spike (page-views flat)',
    threats_spike: '🛡️ WAF threats spike',
    error_ratio: '⚠️ High 4xx/5xx ratio',
  };
  const sev = finding.severity === 'critical' ? '🔴 CRITICAL' : '🟡 WARNING';
  return `${sev} · ${label[finding.kind]}\n\n${finding.detail}`;
}

// ── Orchestration (AC#3/#4/#5) — dependency-injected so the script logic is unit-testable (M1) ──

export interface CfWatchDeps {
  hasToken: () => boolean;
  fetchSummary: () => Promise<CloudflareDashboardSummary | null>;
  /** Returns true iff we WON the per-kind cooldown slot (not currently suppressed). */
  winCooldown: (kind: string) => Promise<boolean>;
  /** Dispatch one message (self-gated via isAlertSendEnabled at the real impl). */
  dispatch: (message: string) => Promise<boolean>;
  dryRun: boolean;
  logger: { info: (o: object) => void; warn: (o: object) => void };
}

export interface CfWatchRunResult {
  status: 'skipped_no_token' | 'fetch_failed' | 'evaluated';
  findingCount: number;
  dispatched: number;
  suppressed: number;
  findings: CfWatchFinding[];
}

/**
 * Run one watch pass: degrade gracefully (AC#5), evaluate, then per-finding cooldown + dispatch
 * (AC#3/#4). Never throws — returns a structured result. The cron script provides real deps.
 */
export async function runCfTrafficWatch(deps: CfWatchDeps): Promise<CfWatchRunResult> {
  const empty = (status: CfWatchRunResult['status']): CfWatchRunResult => ({
    status,
    findingCount: 0,
    dispatched: 0,
    suppressed: 0,
    findings: [],
  });

  if (!deps.hasToken()) {
    deps.logger.info({ event: 'cf_watch.skipped', reason: 'CLOUDFLARE_API_TOKEN unset' });
    return empty('skipped_no_token');
  }

  let summary: CloudflareDashboardSummary | null;
  try {
    summary = await deps.fetchSummary();
  } catch (err) {
    deps.logger.warn({ event: 'cf_watch.fetch_failed', error: err instanceof Error ? err.message : String(err) });
    return empty('fetch_failed');
  }

  const findings = evaluateCfWatch(summary);
  deps.logger.info({
    event: 'cf_watch.evaluated',
    findingCount: findings.length,
    kinds: findings.map((f) => f.kind),
    dryRun: deps.dryRun,
  });

  let dispatched = 0;
  let suppressed = 0;
  for (const finding of findings) {
    if (deps.dryRun) continue;
    if (!(await deps.winCooldown(finding.kind))) {
      suppressed++;
      deps.logger.info({ event: 'cf_watch.cooldown_suppressed', kind: finding.kind });
      continue;
    }
    const sent = await deps.dispatch(formatCfWatchMessage(finding));
    dispatched++;
    deps.logger.info({ event: 'cf_watch.dispatched', kind: finding.kind, telegramSent: sent });
  }

  return { status: 'evaluated', findingCount: findings.length, dispatched, suppressed, findings };
}

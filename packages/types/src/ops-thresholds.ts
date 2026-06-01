/**
 * Operations Dashboard — canonical thresholds + shared DTO types (Story 9-19).
 *
 * This module is the SINGLE SOURCE OF TRUTH for the threshold tiers that drive
 * status colour-coding on every Operations Dashboard surface:
 *
 *   - the `pnpm dashboard` CLI            (apps/api/scripts/dashboard.ts)
 *   - the Super Admin UI                  (apps/web/.../OperationsDashboardPage)
 *   - the morning/evening Telegram digest (apps/api/.../ops-digest.worker.ts)
 *
 * Story 9-19 AC#B1: both the CLI and the UI import `OPS_THRESHOLDS` from here so
 * the two surfaces can never drift. The compile-time/runtime test in
 * `apps/api/scripts/__tests__/dashboard.test.ts` asserts the CLI's re-exported
 * `T` is referentially the same object as this constant.
 *
 * Pure module — no Node or browser dependencies — so it is safe to import from
 * both the API package and the React bundle.
 */

/** Threshold tiers. Each metric has a yellow (warn) and red (critical) edge. */
export const OPS_THRESHOLDS = {
  step4StallPctYellow: 30,
  step4StallPctRed: 50,
  diskUsedPctYellow: 60,
  diskUsedPctRed: 80,
  ramUsedPctYellow: 70,
  ramUsedPctRed: 85,
  cpuLoad1mYellow: 0.5,
  cpuLoad1mRed: 0.8,
  resendDailyPctYellow: 50, // % of free-tier 100/day
  resendDailyPctRed: 80,
  pm2RestartPer24hYellow: 2,
  pm2RestartPer24hRed: 5,
  queueFailedYellow: 1,
  queueFailedRed: 5,
  httpErrorsPer1hYellow: 5,
  httpErrorsPer1hRed: 25,
} as const;

export type OpsThresholds = typeof OPS_THRESHOLDS;

/**
 * Resend free-tier daily send ceiling. Single source of truth shared by the
 * service (recommendation thresholds), the CLI/UI percentage display, and the
 * Telegram digest so a tier change updates every surface at once.
 */
export const RESEND_FREE_TIER_DAILY = 100;

/** Status tiers, lowest → highest severity. */
export type OpsStatusLevel = 'green' | 'yellow' | 'red';

/**
 * Map a numeric metric to a status level given its yellow/red edges.
 *
 * `inverse=true` flips the comparison so that LOWER values are worse (e.g. a
 * "headroom" metric where 5% free is critical and 80% free is healthy). This
 * mirrors the CLI's `statusIcon` semantics exactly so the dot colour is
 * identical on every surface.
 */
export function opsStatusLevel(
  value: number,
  yellowAt: number,
  redAt: number,
  inverse = false,
): OpsStatusLevel {
  const v = inverse ? -value : value;
  const y = inverse ? -yellowAt : yellowAt;
  const r = inverse ? -redAt : redAt;
  if (v >= r) return 'red';
  if (v >= y) return 'yellow';
  return 'green';
}

// ─── Shared snapshot DTOs (returned by the API, consumed by the React page) ──

export interface OpsSystemHealth {
  pm2Uptime: string;
  pm2RestartCount: number;
  pm2Memory: string;
  pm2CpuPct: number;
  osUptime: string;
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
  ramUsedMb: number;
  ramTotalMb: number;
  ramUsedPct: number;
  diskUsedGb: number;
  diskTotalGb: number;
  diskUsedPct: number;
}

export interface OpsFunnelStep {
  step: number;
  drafts: number;
}

export interface OpsAuditAction {
  action: string;
  events: number;
}

export interface OpsTrafficSnapshot {
  totalRespondents: number;
  respondentsActive: number;
  respondentsPending: number;
  totalDrafts: number;
  draftsLast24h: number;
  funnel: OpsFunnelStep[];
  step4StallPct: number;
  magicLinksIssued: number;
  magicLinksConsumed: number;
  topAuditActions: OpsAuditAction[];
}

export interface OpsResendRecentSend {
  when: string;
  to: string;
  subject: string;
  event: string;
}

export interface OpsResendStatus {
  recentCount: number;
  delivered: number;
  bounced: number;
  complained: number;
  todayCount: number;
  last5: OpsResendRecentSend[];
  /**
   * True when the Resend list API returned a full page (counts are a LOWER
   * BOUND — there may be more sends than we could fetch). Surfaced as "100+" in
   * the UI/digest so blast-day undercounts aren't mistaken for the real total.
   */
  truncated?: boolean;
}

export interface OpsQueueFailedSample {
  id: string | undefined;
  name: string;
  reason: string;
}

export interface OpsQueueHealth {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  failedSamples: OpsQueueFailedSample[];
}

/** A single metric→action recommendation. `red` is critical, `yellow` is advisory. */
export type OpsRecommendationSeverity = 'red' | 'yellow';

export interface OpsRecommendation {
  severity: OpsRecommendationSeverity;
  /** Human-readable, plain-text (no ANSI). CLI adds colour; UI adds colour. */
  text: string;
  /** Stable key so the UI can list-render without index keys. */
  key: string;
}

export interface OpsDashboardSnapshot {
  /** ISO 8601 timestamp of when this snapshot was gathered. */
  generatedAt: string;
  system: OpsSystemHealth | null;
  traffic: OpsTrafficSnapshot | null;
  resend: OpsResendStatus | null;
  queue: OpsQueueHealth | null;
  recommendations: OpsRecommendation[];
}

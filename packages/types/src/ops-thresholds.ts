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
import type { MonitoredExpiry } from './monitoring.js'; // Story 9-50
import { getEmailTierLimits } from './email.js';

export const OPS_THRESHOLDS = {
  step4StallPctYellow: 30,
  step4StallPctRed: 50,
  diskUsedPctYellow: 60,
  diskUsedPctRed: 80,
  ramUsedPctYellow: 70,
  ramUsedPctRed: 85,
  cpuLoad1mYellow: 0.5,
  cpuLoad1mRed: 0.8,
  // % of the MONTHLY quota of the ACTIVE tier. Monthly is the only real ceiling
  // on Pro — there is no daily cap to alarm against.
  resendMonthlyPctYellow: 70,
  resendMonthlyPctRed: 90,
  /**
   * Daily volume ladder — Awwal's, 2026-08-05, and deliberately EARLIER than the
   * arithmetic would suggest.
   *
   * The sustainable rate is ~1,666/day (50k ÷ 30). A first cut alarmed at 1× and 3×
   * that, but 3× is useless for triage: at 5,000/day the month is gone in ten days
   * and you find out on day one of ten. 500 is "an unusual day, go look"; 1,500 sits
   * just under the sustainable rate, so it fires while there is still a month left
   * to protect.
   *
   * This matters more from here on: the enumerator pathway puts field registrations
   * into the same email channel, so daily volume grows with fieldwork rather than
   * with blasts.
   */
  resendDailyYellow: 500,
  resendDailyRed: 1500,
  pm2RestartPer24hYellow: 2,
  pm2RestartPer24hRed: 5,
  queueFailedYellow: 1,
  queueFailedRed: 5,
  httpErrorsPer1hYellow: 5,
  httpErrorsPer1hRed: 25,
} as const;

export type OpsThresholds = typeof OPS_THRESHOLDS;

/**
 * ⚠️ THESE WERE ONE CONSTANT UNTIL 2026-08-05, AND THAT WAS THE BUG.
 *
 * `RESEND_FREE_TIER_DAILY = 100` was used as BOTH the Resend list-API page size and
 * the quota denominator. `todayCount` was filtered out of that single page, so it
 * could never exceed 100 **by construction** — the digest read `100+/100` identically
 * whether we had sent 101 emails or 10,000, pinning itself at its own red threshold
 * on every busy day.
 *
 * It was also the wrong ceiling: the account is on **Pro**, so the alarm fired at
 * 0.2% of capacity and its remediation text recommended buying the plan we already
 * pay for.
 *
 * Keep these apart forever. One is an API mechanic; the other is a billing fact.
 */

/** Resend's list endpoint returns at most 100 rows/page. An API mechanic. */
export const RESEND_LIST_PAGE_SIZE = 100;

/**
 * Monthly ceiling for the ACTIVE tier — derived, never hardcoded.
 * The tier table lives in `./email.js` and is the single source of truth.
 */
export const RESEND_MONTHLY_QUOTA = getEmailTierLimits().monthlyLimit;

/**
 * Daily cap for the ACTIVE tier — `Infinity` on Pro/Scale, 100 on free.
 * A finite value here means the tier really does cut off daily.
 */
export const RESEND_DAILY_LIMIT = getEmailTierLimits().dailyLimit;

export const RESEND_DAILY_SUSTAINABLE = Math.floor(RESEND_MONTHLY_QUOTA / 30);

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
  /** Story 9-63 (AC3) — internal per-category email/SMS usage from the meter. */
  notificationUsage?: NotificationUsage | null;
  /** Story 9-50 — TLS cert / domain / declared expiry countdowns. */
  expiries?: MonitoredExpiry[];
  recommendations: OpsRecommendation[];
}

// ─── Story 9-63 (AC3) — internal NotificationMeter usage (the source of truth) ──

/** One category's send count for a period. */
export interface NotificationCategoryCount {
  category: string;
  count: number;
}

/** Per-channel usage bucketed by category, plus the negative-delivery totals. */
export interface NotificationChannelUsage {
  /** Total positive sends across all categories in the period. */
  total: number;
  /** Per-category breakdown, sorted descending by count. */
  byCategory: NotificationCategoryCount[];
  /** Delivery-webhook reconciliation tallies (excluded from `total`). */
  bounced: number;
  complained: number;
}

/**
 * Internal notification usage read from the NotificationMeter Redis counters
 * (NOT the Resend list API — that caps at 100 rows and is a lower bound). This
 * is the authoritative volume source for the ops dashboard + abuse detection.
 */
export interface NotificationUsage {
  /** YYYY-MM-DD the `today` window covers (UTC). */
  date: string;
  /** YYYY-MM the `month` window covers (UTC). */
  month: string;
  today: {
    email: NotificationChannelUsage;
    sms: NotificationChannelUsage;
  };
  thisMonth: {
    email: NotificationChannelUsage;
    sms: NotificationChannelUsage;
  };
}

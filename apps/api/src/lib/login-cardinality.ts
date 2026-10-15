/**
 * Story 13-68 R2b (built 2026-10-15) — DISTINCT-IDENTIFIER CARDINALITY MONITOR for password login.
 *
 * The signal: one IP trying MANY DIFFERENT emails, mostly failing — a credential spray or an
 * account-enumeration run. The per-email burst limiter cannot see it (every email is a fresh
 * bucket) and strict (60 failures / IP / hour) refuses it only after the damage budget is spent.
 * This is detection, not a limiter: it refuses nothing, it pages the operator.
 *
 * Rule (PRD NFR4.4.e, 13-68 R2b): MORE THAN 20 distinct emails from one IP in one clock hour, with
 * MORE THAN 80 % of that IP's attempts failing → one Telegram alert per IP per hour.
 *
 * This file is the pure decision logic plus the storage contract; the Redis + Express wiring is in
 * `middleware/login-cardinality-watch.ts`.
 *
 * ⚠️ FIXED HOUR BUCKETS, NOT A ROLLING WINDOW. A spray split evenly across an hour boundary needs
 * 21 distinct emails on one side of it to fire. Accepted: strict (60 failures / IP / hour) already
 * caps what fits in one bucket, and the alert exists to tell a human, not to be exact.
 *
 * ⚠️ NO EMAIL IS STORED. Distinct emails are counted with a Redis HyperLogLog, which keeps no
 * members; the alert carries the IP and the counts only.
 */

export const LOGIN_CARDINALITY = {
  /** Fires when distinct emails EXCEED this (so 21 is the first count that fires). */
  distinctEmails: 20,
  /** Fires when failures / attempts EXCEEDS this. */
  failureRatio: 0.8,
  /** Bucket TTL: two hours, so the current bucket never expires mid-read. */
  bucketTtlSeconds: 2 * 60 * 60,
} as const;

export type LoginOutcome = 'success' | 'failure' | 'ignore';

export interface CardinalityCounts {
  distinctEmails: number;
  failures: number;
  successes: number;
}

/**
 * Classify a FINISHED login response. Only answers the controller gave count:
 *   • 2xx → success
 *   • 401 (bad credentials / unknown user), 403 (suspended / not activated), 423 and a 429 that NO
 *     limiter stamped (the account lock) → failure
 *   • anything stamped `rateLimitRefusedBy` (a limiter's 429), a captcha 400, a 5xx → ignore
 */
export function classifyLoginResponse(status: number, refusedBy: unknown): LoginOutcome {
  if (refusedBy) return 'ignore';
  if (status >= 200 && status < 300) return 'success';
  if (status === 401 || status === 403 || status === 423 || status === 429) return 'failure';
  return 'ignore';
}

export function shouldAlert(c: CardinalityCounts): boolean {
  const attempts = c.failures + c.successes;
  if (attempts === 0) return false;
  return c.distinctEmails > LOGIN_CARDINALITY.distinctEmails && c.failures / attempts > LOGIN_CARDINALITY.failureRatio;
}

/** `YYYY-MM-DDTHH` in UTC — the bucket a moment belongs to. */
export function hourBucket(now: Date): string {
  return now.toISOString().slice(0, 13);
}

export function normaliseLoginEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.length > 0 ? e : null;
}

export function formatCardinalityAlert(ip: string, hour: string, c: CardinalityCounts, drill = false): string {
  const attempts = c.failures + c.successes;
  const pct = attempts === 0 ? 0 : Math.round((c.failures / attempts) * 100);
  return [
    `${drill ? '[DRILL] ' : ''}🔐 OSLRS login spray suspected`,
    `IP ${ip} tried ${c.distinctEmails} distinct emails in the hour ${hour}:00 UTC`,
    `${c.failures} failed / ${attempts} attempts (${pct}%)`,
    `Threshold: >${LOGIN_CARDINALITY.distinctEmails} emails and >${LOGIN_CARDINALITY.failureRatio * 100}% failures. ` +
      'Check the reverse DNS: an opera-mini.net / carrier CGNAT address is a crowd, a single host is not.',
  ].join('\n');
}

/** Storage contract, so the decision path is testable without Redis. */
export interface CardinalityStore {
  /** Record one attempt in the IP's hour bucket and return the bucket's counts after it. */
  record(ip: string, hour: string, email: string, outcome: 'success' | 'failure'): Promise<CardinalityCounts>;
  /** True exactly once per IP per hour: the caller that wins may send the alert. */
  claimAlert(ip: string, hour: string): Promise<boolean>;
}

export interface ObserveDeps {
  store: CardinalityStore;
  send: (text: string) => Promise<boolean>;
  now?: () => Date;
  /** Prefixes the alert with [DRILL]; used only by the prod demonstration script. */
  drill?: boolean;
}

/**
 * Record one classified attempt and alert if the bucket just crossed the rule. Returns whether an
 * alert was dispatched (the send's own answer), so a caller can prove the path end to end.
 */
export async function observeLoginOutcome(
  deps: ObserveDeps,
  attempt: { ip: string; email: string; outcome: 'success' | 'failure' },
): Promise<{ counts: CardinalityCounts; alerted: boolean }> {
  const hour = hourBucket((deps.now ?? (() => new Date()))());
  const counts = await deps.store.record(attempt.ip, hour, attempt.email, attempt.outcome);
  if (!shouldAlert(counts)) return { counts, alerted: false };
  if (!(await deps.store.claimAlert(attempt.ip, hour))) return { counts, alerted: false };
  const alerted = await deps.send(formatCardinalityAlert(attempt.ip, hour, counts, deps.drill));
  return { counts, alerted };
}

/** Exact in-memory store (a Set where Redis uses a HyperLogLog). Tests only. */
export function createMemoryCardinalityStore(): CardinalityStore {
  const buckets = new Map<string, { emails: Set<string>; failures: number; successes: number; alerted: boolean }>();
  const get = (ip: string, hour: string) => {
    const k = `${ip}|${hour}`;
    let b = buckets.get(k);
    if (!b) {
      b = { emails: new Set(), failures: 0, successes: 0, alerted: false };
      buckets.set(k, b);
    }
    return b;
  };
  return {
    async record(ip, hour, email, outcome) {
      const b = get(ip, hour);
      b.emails.add(email);
      if (outcome === 'failure') b.failures += 1;
      else b.successes += 1;
      return { distinctEmails: b.emails.size, failures: b.failures, successes: b.successes };
    },
    async claimAlert(ip, hour) {
      const b = get(ip, hour);
      if (b.alerted) return false;
      b.alerted = true;
      return true;
    },
  };
}

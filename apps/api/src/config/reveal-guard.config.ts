/**
 * Reveal Guard Configuration — Story 9-41 (F-007 remediation).
 *
 * Central, env-configurable thresholds for the marketplace contact-reveal
 * accountability controls. Calibration is PRODUCT-OWNED (Dev Notes): the
 * per-profile cap is anomaly-shaped (low false-positive, no "normal volume"
 * guess needed); the global breaker threshold is riskier, which is exactly why
 * AC#4 degrades to step-up / human-review rather than hard-blocking.
 *
 * All values are read from env with safe defaults so a misconfigured deploy
 * fails toward the documented anomaly-shaped defaults, never toward "off".
 */

export type RevealVerificationLevel = 'captcha' | 'otp' | 'mfa';

/** Ordinal rank of a verification rung — higher means stronger proof. */
export const REVEAL_RUNG_RANK: Record<RevealVerificationLevel, number> = {
  captcha: 0,
  otp: 1,
  mfa: 2,
};

export interface RevealGuardConfig {
  /** Rolling window (seconds) all volume checks are measured over. */
  windowSeconds: number;
  /**
   * AC#2 — a single profile revealed by more than this many DISTINCT viewers
   * within the window is blocked for further NEW viewers. Anomaly-shape:
   * a candidate contacted by >~3-5 distinct viewers in a short window is
   * anomalous regardless of normal employer volume.
   */
  perProfileMaxViewers: number;
  /**
   * AC#4 — aggregate reveal volume across ALL viewers in the window. Above
   * this, the breaker DEGRADES (require step-up) rather than hard-blocking.
   * Set well above expected legitimate aggregate, well below corpus-drain.
   */
  globalBreakerMax: number;
  /** AC#5 — per-viewer window volume at/above which phone-OTP is required. */
  frictionOtpThreshold: number;
  /** AC#5 — per-viewer window volume at/above which MFA/step-up is required. */
  frictionMfaThreshold: number;
  /**
   * AC#6 — per-viewer window volume at/above which a purpose declaration +
   * ToS acceptance is required before the reveal proceeds.
   */
  purposeThreshold: number;
  /**
   * AC#3 — device-fingerprint budget. A single device fingerprint shared
   * across multiple viewer accounts aggregates toward this cap (raises the
   * cost of lazy fan-out). Defaults to the per-user reveal limit.
   */
  deviceMaxReveals: number;
}

const DEFAULTS: RevealGuardConfig = {
  windowSeconds: 86_400, // 24h
  perProfileMaxViewers: 5,
  globalBreakerMax: 2_000,
  frictionOtpThreshold: 20,
  frictionMfaThreshold: 40,
  purposeThreshold: 20,
  deviceMaxReveals: 50,
};

/**
 * Parse a positive integer env var, falling back to `fallback` when unset,
 * empty, non-numeric, or non-positive. Never throws — a bad value degrades to
 * the documented default rather than disabling the control.
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

/**
 * Resolve the live reveal-guard configuration from the environment. Read at
 * call time (not module-load) so tests can stub env per-case.
 */
export function getRevealGuardConfig(): RevealGuardConfig {
  return {
    windowSeconds: envInt('REVEAL_GUARD_WINDOW_SECONDS', DEFAULTS.windowSeconds),
    perProfileMaxViewers: envInt('REVEAL_PER_PROFILE_MAX_VIEWERS', DEFAULTS.perProfileMaxViewers),
    globalBreakerMax: envInt('REVEAL_GLOBAL_BREAKER_MAX', DEFAULTS.globalBreakerMax),
    frictionOtpThreshold: envInt('REVEAL_FRICTION_OTP_THRESHOLD', DEFAULTS.frictionOtpThreshold),
    frictionMfaThreshold: envInt('REVEAL_FRICTION_MFA_THRESHOLD', DEFAULTS.frictionMfaThreshold),
    purposeThreshold: envInt('REVEAL_PURPOSE_THRESHOLD', DEFAULTS.purposeThreshold),
    deviceMaxReveals: envInt('REVEAL_DEVICE_MAX_REVEALS', DEFAULTS.deviceMaxReveals),
  };
}

/**
 * The HIGHEST verification rung a viewer can actually SATISFY, given the auth
 * affordances they own. This is the load-bearing fix for the F-007 review:
 *
 *   - MFA (TOTP) is enrolment-gated and, in this system, only super_admins
 *     enrol (Story 9-13). A public marketplace viewer can NEVER satisfy the
 *     'mfa' rung — so forcing it on them turns AC#4's "degrade" into a hard,
 *     unrecoverable block (the exact opposite of the AC).
 *   - OTP needs a phone on file.
 *   - CAPTCHA is the baseline every reveal already meets.
 *
 * `selectRequiredRung` caps its demand at this ceiling so the breaker / friction
 * always DEGRADES to the strongest rung the viewer can clear, never to an
 * unsatisfiable one. When even the ceiling is 'captcha' (no phone, no MFA), the
 * breaker still escalates to a human via an alert — it just can't wall the user.
 */
export function reachableCeiling(opts: { mfaEnrolled?: boolean; hasPhone?: boolean }): RevealVerificationLevel {
  if (opts.mfaEnrolled) return 'mfa';
  if (opts.hasPhone) return 'otp';
  return 'captcha';
}

/**
 * AC#5 + AC#4 — select the verification rung a reveal must satisfy.
 *
 * Progressive friction by per-viewer window volume:
 *   volume < otpThreshold            → 'captcha' (frictionless, always satisfied)
 *   otpThreshold <= volume < mfa     → 'otp'
 *   volume >= mfaThreshold           → 'mfa'
 *
 * The global circuit-breaker (AC#4) overrides to the HIGHEST rung regardless of
 * the individual viewer's volume — a fan-out of low-volume throwaway accounts is
 * exactly what per-account friction alone misses.
 *
 * The result is then CAPPED at `ceiling` — the strongest rung the viewer can
 * actually satisfy (see `reachableCeiling`). This guarantees AC#4 "degrade,
 * never hard-block": a public viewer who cannot enrol MFA is asked for OTP (or,
 * with no phone, nothing) rather than handed an impossible 'mfa' demand.
 *
 * Pure function — no I/O — so it is trivially unit-testable.
 */
export function selectRequiredRung(
  viewerWindowVolume: number,
  breakerTripped: boolean,
  config: RevealGuardConfig = getRevealGuardConfig(),
  ceiling: RevealVerificationLevel = 'mfa',
): RevealVerificationLevel {
  let desired: RevealVerificationLevel;
  if (breakerTripped) desired = 'mfa';
  else if (viewerWindowVolume >= config.frictionMfaThreshold) desired = 'mfa';
  else if (viewerWindowVolume >= config.frictionOtpThreshold) desired = 'otp';
  else desired = 'captcha';

  // Cap at the strongest rung the viewer can actually clear.
  return REVEAL_RUNG_RANK[desired] <= REVEAL_RUNG_RANK[ceiling] ? desired : ceiling;
}

/**
 * Whether `provided` proof satisfies the `required` rung (rank-monotonic:
 * a stronger proof always satisfies a weaker requirement). 'captcha' is the
 * baseline every reveal already meets via the verifyCaptcha middleware.
 */
export function rungSatisfied(
  required: RevealVerificationLevel,
  provided: RevealVerificationLevel,
): boolean {
  return REVEAL_RUNG_RANK[provided] >= REVEAL_RUNG_RANK[required];
}

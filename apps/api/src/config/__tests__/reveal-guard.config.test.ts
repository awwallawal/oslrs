import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getRevealGuardConfig,
  selectRequiredRung,
  reachableCeiling,
  rungSatisfied,
  REVEAL_RUNG_RANK,
} from '../reveal-guard.config.js';

describe('reveal-guard.config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getRevealGuardConfig — defaults', () => {
    it('returns anomaly-shaped defaults when env is unset', () => {
      const cfg = getRevealGuardConfig();
      expect(cfg.windowSeconds).toBe(86_400);
      expect(cfg.perProfileMaxViewers).toBe(5);
      expect(cfg.globalBreakerMax).toBe(2_000);
      expect(cfg.frictionOtpThreshold).toBe(20);
      expect(cfg.frictionMfaThreshold).toBe(40);
      expect(cfg.purposeThreshold).toBe(20);
      expect(cfg.deviceMaxReveals).toBe(50);
    });

    it('reads overrides from env', () => {
      vi.stubEnv('REVEAL_PER_PROFILE_MAX_VIEWERS', '3');
      vi.stubEnv('REVEAL_GLOBAL_BREAKER_MAX', '500');
      vi.stubEnv('REVEAL_FRICTION_OTP_THRESHOLD', '10');
      expect(getRevealGuardConfig().perProfileMaxViewers).toBe(3);
      expect(getRevealGuardConfig().globalBreakerMax).toBe(500);
      expect(getRevealGuardConfig().frictionOtpThreshold).toBe(10);
    });

    it('falls back to default for non-numeric / non-positive / empty env', () => {
      vi.stubEnv('REVEAL_PER_PROFILE_MAX_VIEWERS', 'abc');
      expect(getRevealGuardConfig().perProfileMaxViewers).toBe(5);
      vi.stubEnv('REVEAL_PER_PROFILE_MAX_VIEWERS', '0');
      expect(getRevealGuardConfig().perProfileMaxViewers).toBe(5);
      vi.stubEnv('REVEAL_PER_PROFILE_MAX_VIEWERS', '-2');
      expect(getRevealGuardConfig().perProfileMaxViewers).toBe(5);
      vi.stubEnv('REVEAL_PER_PROFILE_MAX_VIEWERS', '');
      expect(getRevealGuardConfig().perProfileMaxViewers).toBe(5);
    });

    it('floors fractional values', () => {
      vi.stubEnv('REVEAL_FRICTION_OTP_THRESHOLD', '12.9');
      expect(getRevealGuardConfig().frictionOtpThreshold).toBe(12);
    });
  });

  describe('selectRequiredRung — AC#5 progressive friction', () => {
    const cfg = getRevealGuardConfig(); // defaults: otp=20, mfa=40

    it('captcha below the OTP threshold', () => {
      expect(selectRequiredRung(0, false, cfg)).toBe('captcha');
      expect(selectRequiredRung(19, false, cfg)).toBe('captcha');
    });

    it('otp from the OTP threshold up to the MFA threshold', () => {
      expect(selectRequiredRung(20, false, cfg)).toBe('otp');
      expect(selectRequiredRung(39, false, cfg)).toBe('otp');
    });

    it('mfa at/above the MFA threshold', () => {
      expect(selectRequiredRung(40, false, cfg)).toBe('mfa');
      expect(selectRequiredRung(1000, false, cfg)).toBe('mfa');
    });

    it('AC#4 — global breaker forces the highest rung regardless of viewer volume', () => {
      expect(selectRequiredRung(0, true, cfg)).toBe('mfa');
      expect(selectRequiredRung(5, true, cfg)).toBe('mfa');
    });

    // H1 — the demanded rung is capped at what the viewer can actually satisfy.
    it('H1 — caps the demand at the reachable ceiling (non-MFA viewer never asked for MFA)', () => {
      // Breaker would want 'mfa', but an OTP-ceiling viewer is asked for 'otp'.
      expect(selectRequiredRung(0, true, cfg, 'otp')).toBe('otp');
      // MFA friction band, but phone-less/non-MFA viewer (captcha ceiling) → captcha.
      expect(selectRequiredRung(40, false, cfg, 'captcha')).toBe('captcha');
      // Below the cap the normal selection still applies.
      expect(selectRequiredRung(20, false, cfg, 'mfa')).toBe('otp');
      expect(selectRequiredRung(0, false, cfg, 'otp')).toBe('captcha');
    });
  });

  describe('reachableCeiling — H1 strongest satisfiable rung', () => {
    it('mfa when enrolled', () => {
      expect(reachableCeiling({ mfaEnrolled: true, hasPhone: true })).toBe('mfa');
      expect(reachableCeiling({ mfaEnrolled: true, hasPhone: false })).toBe('mfa');
    });
    it('otp when a phone is on file but no MFA', () => {
      expect(reachableCeiling({ mfaEnrolled: false, hasPhone: true })).toBe('otp');
    });
    it('captcha when neither MFA nor phone (degrade, do not block)', () => {
      expect(reachableCeiling({ mfaEnrolled: false, hasPhone: false })).toBe('captcha');
      expect(reachableCeiling({})).toBe('captcha');
    });
  });

  describe('rungSatisfied — rank monotonic', () => {
    it('captcha baseline is satisfied by any proof', () => {
      expect(rungSatisfied('captcha', 'captcha')).toBe(true);
      expect(rungSatisfied('captcha', 'otp')).toBe(true);
      expect(rungSatisfied('captcha', 'mfa')).toBe(true);
    });

    it('stronger proof satisfies weaker requirement', () => {
      expect(rungSatisfied('otp', 'mfa')).toBe(true);
      expect(rungSatisfied('otp', 'otp')).toBe(true);
    });

    it('weaker proof does NOT satisfy stronger requirement', () => {
      expect(rungSatisfied('otp', 'captcha')).toBe(false);
      expect(rungSatisfied('mfa', 'captcha')).toBe(false);
      expect(rungSatisfied('mfa', 'otp')).toBe(false);
    });

    it('rank ordering is captcha < otp < mfa', () => {
      expect(REVEAL_RUNG_RANK.captcha).toBeLessThan(REVEAL_RUNG_RANK.otp);
      expect(REVEAL_RUNG_RANK.otp).toBeLessThan(REVEAL_RUNG_RANK.mfa);
    });
  });
});

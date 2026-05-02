/**
 * MFA Challenge Page (login step-2) — Story 9-13 AC#9.
 *
 * Reached only via `useLogin` after staff/login returns `requiresMfa: true`.
 * Reads challenge token + remember-me + redirectTo from router state. Direct
 * navigation (refresh / deep-link) → bounce back to /staff/login.
 *
 * The page stays UNAUTHENTICATED — the JWT is only issued by `/auth/login/mfa`
 * (or `/auth/login/mfa-backup`) on a successful code submission.
 */
import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../../auth/context/AuthContext';
import { loginMfa, loginMfaBackup, MfaApiError } from '../../../auth/api/mfa.api';
import { HCaptcha } from '../../../auth/components/HCaptcha';

interface ChallengeState {
  mfaChallengeToken?: string;
  expiresIn?: number;
  rememberMe?: boolean;
  redirectTo?: string;
}

export default function MfaChallengePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { completeStaffLoginAfterMfa } = useAuth();

  const state = (location.state ?? {}) as ChallengeState;
  const challengeToken = state.mfaChallengeToken;
  const rememberMe = state.rememberMe ?? false;
  const redirectTo = state.redirectTo ?? '/dashboard';

  const [mode, setMode] = useState<'totp' | 'backup'>('totp');
  const [code, setCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  // Bounce if user reached this page without a challenge token (e.g. deep-link, refresh).
  useEffect(() => {
    if (!challengeToken) {
      navigate('/staff/login', { replace: true });
    }
  }, [challengeToken, navigate]);

  if (!challengeToken) return null;

  const expectedLength = mode === 'totp' ? 6 : 10;
  const codeRegex = mode === 'totp' ? /^\d{6}$/ : /^\d{10}$/;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!codeRegex.test(code)) {
      setError(mode === 'totp' ? 'Code must be 6 digits.' : 'Backup code must be 10 digits.');
      return;
    }
    if (!captchaToken) {
      setError('Please complete the CAPTCHA.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const fn = mode === 'totp' ? loginMfa : loginMfaBackup;
      const response = await fn({ mfaChallengeToken: challengeToken, code, captchaToken });
      await completeStaffLoginAfterMfa(response, rememberMe);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      // F15 (code-review 2026-05-02): captcha tokens are single-use server-side.
      // For RETRY-ELIGIBLE error paths the user will resubmit, so the previous
      // captcha is now stale and would fail next time → "wrong code → captcha
      // stale → captcha-fail → retry" loop. Pre-emptively reset captcha on those
      // paths only. Skip reset on terminal-or-redirect paths (LOCKED_OUT,
      // CHALLENGE_INVALID) where retrying immediately is not possible.
      let shouldResetCaptcha = false;

      if (err instanceof MfaApiError) {
        if (err.code === 'MFA_INVALID_CODE') {
          setError('Code did not match. Wait for the next code — your authenticator may be a few seconds off.');
          shouldResetCaptcha = true;
        } else if (err.code === 'MFA_INVALID_BACKUP_CODE') {
          setError('Invalid backup code. Each code can only be used once.');
          shouldResetCaptcha = true;
        } else if (err.code === 'MFA_BACKUP_RACE_LOST') {
          // F17 (code-review 2026-05-02): distinct error for the rare race-loser
          // path where two simultaneous backup-code redemptions both bcrypt-match
          // the same row. Operator should pick a different backup code.
          setError('That backup code was just consumed by another sign-in. Please use a different backup code.');
          shouldResetCaptcha = true;
        } else if (err.code === 'MFA_REPLAY_REJECTED') {
          setError('That code was already used. Wait for the next one.');
          shouldResetCaptcha = true;
        } else if (err.code === 'MFA_LOCKED_OUT') {
          const lockedUntilIso = (err.details as { lockedUntil?: string } | undefined)?.lockedUntil;
          if (lockedUntilIso) setLockedUntil(new Date(lockedUntilIso));
          setError('Too many failed attempts. Account locked for 15 minutes.');
          // No reset — user cannot retry for 15 min.
        } else if (err.code === 'MFA_CHALLENGE_INVALID') {
          setError('Your login session expired. Please log in again.');
          setTimeout(() => navigate('/staff/login', { replace: true }), 1500);
          // No reset — user is being redirected to /staff/login.
        } else if (err.code === 'AUTH_CAPTCHA_FAILED') {
          setError('CAPTCHA verification failed. Please try again.');
          shouldResetCaptcha = true;
        } else {
          setError(err.message);
          shouldResetCaptcha = true;
        }
      } else {
        setError('Sign-in failed. Please try again.');
        shouldResetCaptcha = true;
      }

      if (shouldResetCaptcha) {
        setCaptchaToken('');
        setCaptchaReset((v) => !v);
      }
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Two-factor authentication</h1>
        <p className="text-gray-600 mt-2">
          Enter the {mode === 'totp' ? '6-digit code from your authenticator app' : '10-digit backup code'}.
        </p>
      </header>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border-l-4 border-red-500 text-red-900 text-sm rounded">
          {error}
          {lockedUntil && (
            <p className="mt-1">
              Try again after <strong>{lockedUntil.toLocaleTimeString()}</strong>.
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={expectedLength}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder={mode === 'totp' ? '000000' : '0000000000'}
          className="w-full text-center text-2xl tracking-widest font-mono border-2 rounded-md py-3 focus:border-primary-600 focus:outline-none"
          aria-label={mode === 'totp' ? 'One-time code' : 'Backup code'}
        />

        <HCaptcha
          onVerify={setCaptchaToken}
          onExpire={() => setCaptchaToken('')}
          reset={captchaReset}
        />

        <button
          type="submit"
          disabled={loading || code.length !== expectedLength}
          className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-medium px-4 py-3 rounded-md"
        >
          {loading ? 'Verifying…' : 'Verify and sign in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-center text-gray-600">
        {mode === 'totp' ? (
          <button
            type="button"
            onClick={() => {
              setMode('backup');
              setCode('');
              setError(null);
            }}
            className="text-primary-700 underline"
          >
            Use a backup code instead
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode('totp');
              setCode('');
              setError(null);
            }}
            className="text-primary-700 underline"
          >
            Use authenticator code instead
          </button>
        )}
      </p>

      <p className="mt-2 text-xs text-center text-gray-500">
        Lost your authenticator and have no backup codes?{' '}
        <Link to="/support" className="text-primary-700 underline">
          Contact support
        </Link>{' '}
        — recovery requires the second super_admin.
      </p>
    </div>
  );
}

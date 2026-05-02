/**
 * MFA Enrollment Wizard — Story 9-13 AC#9.
 *
 * 4-step linear wizard:
 *   1. Generate (POST /auth/mfa/enroll → secret + QR + backup codes)
 *   2. Scan QR with authenticator
 *   3. Enter test code (POST /auth/mfa/verify → flips mfa_enabled = true)
 *   4. Show backup codes ONCE + checkbox + Confirm
 *
 * The enroll endpoint requires a fresh re-auth window. If `403 AUTH_REAUTH_REQUIRED`
 * is returned, we surface the existing `ReAuthModal` flow and retry on success.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/context/AuthContext';
import {
  enrollMfa,
  verifyMfa,
  MfaApiError,
  type EnrollResponse,
} from '../../../auth/api/mfa.api';
import { QrCodeDisplay } from '../components/QrCodeDisplay';
import { BackupCodesDisplay } from '../components/BackupCodesDisplay';

type Step = 'intro' | 'reauth' | 'qr' | 'test' | 'codes' | 'done';

export default function MfaEnrollmentPage() {
  const navigate = useNavigate();
  const { user, accessToken, reAuthenticate } = useAuth();
  const [step, setStep] = useState<Step>('intro');
  const [enrollment, setEnrollment] = useState<EnrollResponse | null>(null);
  const [code, setCode] = useState('');
  const [reAuthPassword, setReAuthPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!user || !accessToken) {
    return null; // ProtectedRoute should have already redirected.
  }

  const handleEnroll = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await enrollMfa(accessToken);
      setEnrollment(result);
      setStep('qr');
    } catch (err) {
      if (err instanceof MfaApiError && err.code === 'AUTH_REAUTH_REQUIRED') {
        setStep('reauth');
      } else {
        setError(err instanceof Error ? err.message : 'Enrollment failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!reAuthPassword) {
      setError('Please enter your password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const ok = await reAuthenticate(reAuthPassword);
      if (ok) {
        setReAuthPassword('');
        await handleEnroll();
      } else {
        setError('Incorrect password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Code must be 6 digits.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await verifyMfa(code, accessToken);
      setStep('codes');
    } catch (err) {
      if (err instanceof MfaApiError) {
        if (err.code === 'MFA_INVALID_CODE') {
          setError('Code did not match. Wait for the next code and try again — your authenticator may be a few seconds off.');
        } else if (err.code === 'MFA_LOCKED_OUT') {
          setError('Too many failed attempts. Wait 15 minutes and try again.');
        } else if (err.code === 'MFA_REPLAY_REJECTED') {
          setError('That code was already used. Wait for the next one.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Verification failed.');
      }
    } finally {
      setLoading(false);
      setCode('');
    }
  };

  const handleConfirm = () => {
    setStep('done');
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Multi-factor authentication</h1>
        <p className="text-gray-600 mt-1">
          Add a second factor (authenticator app) to your account. Required for
          super_admin accounts that touch every respondent record.
        </p>
      </header>

      {/*
        Step indicator shows the 4 USER-VISIBLE wizard steps. The `reauth`
        sub-state (when the enroll endpoint returns 403 AUTH_REAUTH_REQUIRED)
        is intentionally NOT a separate step — it's a transient password-prompt
        that bridges 'intro' → 'qr' without changing the wizard's logical
        progress. Marking 'intro' as still-active during reauth keeps the
        progress bar honest. F16 (code-review 2026-05-02) — preserves UX intent.
      */}
      <ol className="flex gap-2 mb-6 text-sm">
        {(['intro', 'qr', 'test', 'codes'] as const).map((s, i) => {
          const active = step === s || (step === 'reauth' && s === 'intro');
          const completed =
            (step === 'qr' && i < 1) ||
            (step === 'test' && i < 2) ||
            (step === 'codes' && i < 3) ||
            step === 'done';
          return (
            <li
              key={s}
              className={`flex-1 text-center px-2 py-2 rounded ${
                active
                  ? 'bg-primary-100 text-primary-900 font-semibold'
                  : completed
                  ? 'bg-green-100 text-green-900'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              <span className="block text-xs">Step {i + 1}</span>
              <span>
                {s === 'intro' && 'Start'}
                {s === 'qr' && 'Scan'}
                {s === 'test' && 'Test'}
                {s === 'codes' && 'Backup'}
              </span>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border-l-4 border-red-500 text-red-900 text-sm rounded">
          {error}
        </div>
      )}

      {step === 'intro' && (
        <div className="space-y-4">
          <p className="text-gray-700">
            You will need an authenticator app installed on your phone. Free options:
          </p>
          <ul className="list-disc pl-6 text-gray-700">
            <li>Google Authenticator</li>
            <li>Authy</li>
            <li>1Password / Bitwarden (if you already use them)</li>
            <li>Microsoft Authenticator</li>
          </ul>
          <button
            type="button"
            onClick={handleEnroll}
            disabled={loading}
            className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-medium px-4 py-3 rounded-md"
          >
            {loading ? 'Generating…' : 'Begin enrollment'}
          </button>
        </div>
      )}

      {step === 'reauth' && (
        <form onSubmit={handleReAuth} className="space-y-4">
          <p className="text-gray-700">
            For your security, please re-enter your password to continue with MFA enrollment.
          </p>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={reAuthPassword}
            onChange={(e) => setReAuthPassword(e.target.value)}
            placeholder="Your password"
            className="w-full border-2 rounded-md py-3 px-3 focus:border-primary-600 focus:outline-none"
            aria-label="Password"
          />
          <button
            type="submit"
            disabled={loading || !reAuthPassword}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-medium px-4 py-3 rounded-md"
          >
            {loading ? 'Verifying…' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('intro');
              setReAuthPassword('');
              setError(null);
            }}
            className="w-full text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
        </form>
      )}

      {step === 'qr' && enrollment && (
        <div className="space-y-4">
          <QrCodeDisplay
            qrCodeDataUri={enrollment.qrCodeDataUri}
            secret={enrollment.secret}
            email={user.email}
          />
          <button
            type="button"
            onClick={() => setStep('test')}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium px-4 py-3 rounded-md"
          >
            I&rsquo;ve added it to my authenticator
          </button>
        </div>
      )}

      {step === 'test' && (
        <div className="space-y-4">
          <p className="text-gray-700">
            Enter the 6-digit code from your authenticator app to confirm setup.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full text-center text-2xl tracking-widest font-mono border-2 rounded-md py-3 focus:border-primary-600 focus:outline-none"
            aria-label="One-time code"
          />
          <button
            type="button"
            onClick={handleVerify}
            disabled={loading || code.length !== 6}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-medium px-4 py-3 rounded-md"
          >
            {loading ? 'Verifying…' : 'Verify code'}
          </button>
        </div>
      )}

      {step === 'codes' && enrollment && (
        <BackupCodesDisplay codes={enrollment.backupCodes} onConfirm={handleConfirm} />
      )}

      {step === 'done' && (
        <div className="space-y-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 text-green-700 rounded-full text-3xl">
            ✓
          </div>
          <h2 className="text-xl font-bold text-gray-900">MFA enrolled</h2>
          <p className="text-gray-700">
            From now on, you&rsquo;ll be asked for a code from your authenticator
            app every time you log in.
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/super-admin', { replace: true })}
            className="bg-primary-600 hover:bg-primary-700 text-white font-medium px-4 py-3 rounded-md"
          >
            Back to dashboard
          </button>
        </div>
      )}

      {step !== 'done' && (
        <p className="mt-8 text-xs text-gray-500">
          Need help recovering MFA later? See the runbook section <em>3.6 Lost
          authenticator device</em>. Or contact{' '}
          <Link to="/support" className="text-primary-700 underline">
            support
          </Link>
          .
        </p>
      )}

    </div>
  );
}

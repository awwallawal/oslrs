import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { HCaptcha } from '../../auth/components/HCaptcha';
import { ApiError } from '../../../lib/api-client';
import { requestRegistrationStatus } from '../api/registration-status.api';

/**
 * Story 9-58 (Deliverable A) — public "am I registered?" check.
 *
 * Privacy-first: a single free-text identifier (email / phone / reference code)
 * + hCaptcha. On submit the backend returns a CONSTANT neutral response and
 * delivers the actual status + a magic-link to the registrant's own channel —
 * nothing about registration status is ever shown on-screen (no enumeration
 * oracle). Rendered inside <PublicLayout /> by the route.
 */
export default function CheckRegistrationPage() {
  const [identifier, setIdentifier] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setCaptchaError(null);

      if (identifier.trim().length < 3) {
        setError('Enter your email, phone, or reference code.');
        return;
      }
      if (!captchaToken) {
        setCaptchaError('Please complete the CAPTCHA verification.');
        return;
      }

      setStatus('submitting');
      try {
        await requestRegistrationStatus({ identifier: identifier.trim(), captchaToken });
        // Neutral result — same regardless of whether a match exists.
        setStatus('done');
      } catch (err) {
        // Reset the (single-use) captcha token for a retry.
        setCaptchaToken('');
        setCaptchaReset((r) => !r);
        setStatus('idle');
        if (err instanceof ApiError && err.code === 'AUTH_CAPTCHA_FAILED') {
          setCaptchaError('CAPTCHA verification failed. Please try again.');
        } else if (err instanceof ApiError && err.status === 429) {
          setError('Too many requests. Please try again in a little while.');
        } else {
          setError('Something went wrong. Please try again in a moment.');
        }
      }
    },
    [identifier, captchaToken],
  );

  if (status === 'done') {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div
          className="rounded-lg border border-neutral-200 bg-white p-6 text-center"
          data-testid="check-registration-result"
        >
          <div className="text-5xl" aria-hidden="true">
            ✓
          </div>
          <h1 className="mt-4 text-xl font-semibold text-neutral-900">Check your messages</h1>
          <p className="mt-2 text-sm text-neutral-700">
            If you're in our registry, we've sent your status and a secure link to your registered
            email or phone. Please check it.
          </p>
          <p className="mt-4 text-xs text-neutral-500">
            Didn't get anything? Make sure you entered the same email, phone, or reference code you
            registered with, then{' '}
            <button
              type="button"
              className="text-primary-600 underline"
              onClick={() => {
                setStatus('idle');
                setIdentifier('');
              }}
            >
              try again
            </button>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-neutral-900">Check your registration status</h1>
      <p className="mt-2 text-sm text-neutral-700">
        Enter the email, phone number, or reference code you registered with. For your privacy, we
        won't show your status here — we'll send it, with a secure link, to your registered email or
        phone.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" data-testid="check-registration-form">
        <div>
          <label htmlFor="identifier" className="block text-sm font-medium text-neutral-800">
            Email, phone, or reference code
          </label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="off"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="e.g. you@example.com, 080…, or OSL-2026-7F3K9Q"
            className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            data-testid="check-registration-input"
          />
          {error && (
            <p className="mt-1 text-sm text-error-600" data-testid="check-registration-error">
              {error}
            </p>
          )}
        </div>

        <HCaptcha
          onVerify={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken('')}
          error={captchaError ?? undefined}
          reset={captchaReset}
        />

        <button
          type="submit"
          disabled={status === 'submitting'}
          className={`min-h-[44px] w-full rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
            status === 'submitting' ? 'cursor-not-allowed opacity-50' : ''
          }`}
          data-testid="check-registration-submit"
        >
          {status === 'submitting' ? 'Sending…' : 'Send my status'}
        </button>
      </form>

      <p className="mt-6 text-xs text-neutral-500">
        Haven't registered yet?{' '}
        <Link to="/register" className="text-primary-600 underline">
          Register here
        </Link>
        .
      </p>
    </div>
  );
}

import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '../../../lib/api-client';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { NinHelpHint } from '../components/NinHelpHint';
import { TrustBadgesRow } from '../components/TrustBadgesRow';
import { completeNin, deferReminder } from '../api/wizard.api';

/**
 * Story 9-12 Task 7 / AC#9 — pending-NIN return-to-complete view.
 *
 * Reached via the `pending_nin_complete` magic-link emailed to the respondent
 * at submit time and at the T+2/+7/+14d reminder cadence. The page is
 * deliberately narrow: NinHelpHint banner + NIN input + Save + a
 * "remind me later" affordance. No full wizard re-mount.
 *
 * The magic-link token IS the auth credential; there's no JWT layer because
 * pending-NIN respondents have no account by definition. Single-use of the
 * token is enforced server-side on the success path of `complete-nin`. The
 * `defer-reminder` endpoint never consumes the token, so the user can defer
 * multiple times against the same email.
 */

const NIN_REGEX = /^\d{11}$/;

export default function CompleteNinPage() {
  useDocumentTitle('Complete your NIN | Oyo State Skills Registry');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [nin, setNin] = useState('');
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'deferring'>('idle');
  const [error, setError] = useState<{
    code: string;
    message: string;
    firstRegisteredAt?: string;
    firstRegisteredVia?: string;
  } | null>(null);
  const [deferred, setDeferred] = useState(false);

  const isSaving = submitState === 'saving';
  const isDeferring = submitState === 'deferring';
  const ninValid = NIN_REGEX.test(nin);

  const handleSave = useCallback(async () => {
    if (!token) {
      setError({ code: 'TOKEN_MISSING', message: 'This link is missing its token. Please open the link from your email again.' });
      return;
    }
    if (!ninValid) {
      setError({ code: 'NIN_FORMAT', message: 'NIN must be 11 digits.' });
      return;
    }
    setSubmitState('saving');
    setError(null);
    try {
      await completeNin({ token, nin });
      navigate('/register/complete?source=pending_nin', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const details = (err.details ?? {}) as {
          firstRegisteredAt?: string;
          firstRegisteredVia?: string;
        };
        setError({
          code: err.code ?? 'COMPLETE_NIN_FAILED',
          message: err.message,
          firstRegisteredAt: details.firstRegisteredAt,
          firstRegisteredVia: details.firstRegisteredVia,
        });
      } else {
        setError({
          code: 'NETWORK',
          message: 'We could not save your NIN just now. Please try again in a moment.',
        });
      }
    } finally {
      setSubmitState('idle');
    }
  }, [token, nin, ninValid, navigate]);

  const handleDefer = useCallback(async () => {
    if (!token) {
      setError({ code: 'TOKEN_MISSING', message: 'This link is missing its token. Please open the link from your email again.' });
      return;
    }
    setSubmitState('deferring');
    setError(null);
    try {
      await deferReminder({ token });
      setDeferred(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ code: err.code ?? 'DEFER_FAILED', message: err.message });
      } else {
        setError({
          code: 'NETWORK',
          message: 'We could not reschedule your reminder just now. Please try again in a moment.',
        });
      }
    } finally {
      setSubmitState('idle');
    }
  }, [token]);

  const isDuplicateNin = error?.code === 'NIN_DUPLICATE';

  return (
    <ErrorBoundary
      fallbackProps={{
        title: 'Registration Error',
        description: 'Unable to load this page. Please try again.',
      }}
    >
      <div className="min-h-screen bg-neutral-50 flex flex-col">
        {/* Back to Homepage */}
        <div className="p-4 sm:p-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-neutral-600 hover:text-primary-600 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-md px-2 py-1 -ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Homepage
          </Link>
        </div>

        {/* Logo */}
        <div className="flex justify-center pb-4 sm:pb-6">
          <Link
            to="/"
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-lg p-2"
            aria-label="OSLSR Home"
          >
            <img
              src="/images/oyo-coat-of-arms.png"
              alt="Oyo State Labour & Skills Registry"
              className="h-[60px] w-auto"
            />
          </Link>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-2 sm:px-6">
          <div className="mx-auto w-full max-w-xl">
            <div
              className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
              data-testid="complete-nin-card"
            >
              <h1 className="text-2xl font-semibold text-neutral-900">
                Add your NIN
              </h1>
              <p className="mt-2 text-sm text-neutral-700">
                Enter your 11-digit National Identification Number to complete
                your registration. Your earlier answers are already saved.
              </p>

              {/* NIN help banner */}
              <div className="mt-5">
                <NinHelpHint variant="banner" id="complete-nin-help" />
              </div>

              {/* NIN input */}
              <div className="mt-5">
                <label
                  htmlFor="complete-nin-input"
                  className="block text-sm font-medium text-neutral-900"
                >
                  National Identification Number
                </label>
                <input
                  id="complete-nin-input"
                  inputMode="numeric"
                  pattern="\d{11}"
                  maxLength={11}
                  autoComplete="off"
                  aria-describedby="complete-nin-help"
                  aria-invalid={!!error && error.code !== 'NIN_DUPLICATE' && !ninValid}
                  value={nin}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D+/g, '').slice(0, 11);
                    setNin(next);
                    if (error && error.code !== 'NIN_DUPLICATE') setError(null);
                  }}
                  className="mt-2 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-base text-neutral-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
                  disabled={isSaving || isDeferring}
                  data-testid="complete-nin-input"
                />
                {error && error.code !== 'NIN_DUPLICATE' && (
                  <p
                    role="alert"
                    className="mt-2 text-sm text-error-700"
                    data-testid="complete-nin-error"
                  >
                    {error.message}
                  </p>
                )}
              </div>

              {/* Duplicate-NIN block (Task 7.4 / FR21) */}
              {isDuplicateNin && (
                <div
                  role="alert"
                  className="mt-5 rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-800"
                  data-testid="complete-nin-duplicate"
                >
                  <p className="font-medium">This NIN is already registered.</p>
                  {error.firstRegisteredAt && (
                    <p className="mt-1">
                      First registered{' '}
                      {new Date(error.firstRegisteredAt).toLocaleDateString()}
                      {error.firstRegisteredVia ? ` via ${error.firstRegisteredVia}` : ''}.
                    </p>
                  )}
                  <p className="mt-2">
                    If you think this is a mistake, please contact support. They
                    can help reconcile the duplicate.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setNin('');
                      }}
                      className="text-sm font-medium text-error-700 hover:text-error-900 underline"
                      data-testid="complete-nin-duplicate-back"
                    >
                      Try a different NIN
                    </button>
                    <Link
                      to="/support/contact"
                      className="text-sm font-medium text-error-700 hover:text-error-900 underline"
                      data-testid="complete-nin-duplicate-support"
                    >
                      Contact support
                    </Link>
                  </div>
                </div>
              )}

              {/* Defer confirmation */}
              {deferred && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mt-5 rounded-lg border border-info-200 bg-info-50 p-4 text-sm text-info-800"
                  data-testid="complete-nin-deferred"
                >
                  Got it. We'll remind you in 7 days. You can come back to this
                  page any time to add your NIN.
                </div>
              )}

              {/* Action row */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handleDefer}
                  disabled={isSaving || isDeferring || deferred}
                  className="text-sm font-medium text-neutral-600 hover:text-primary-700 underline disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="complete-nin-defer"
                >
                  {isDeferring ? 'Saving…' : "I still don't have my NIN. Remind me later."}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || isDeferring || !ninValid || isDuplicateNin}
                  className="inline-flex items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="complete-nin-save"
                >
                  {isSaving ? 'Saving…' : 'Save NIN'}
                </button>
              </div>

              {!token && (
                <p
                  role="alert"
                  className="mt-4 text-xs text-error-700"
                  data-testid="complete-nin-token-missing"
                >
                  This link is missing its token. Please open the link from your
                  email again.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Trust badges footer */}
        <footer className="border-t border-neutral-200 bg-white px-4 py-4 sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <TrustBadgesRow />
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

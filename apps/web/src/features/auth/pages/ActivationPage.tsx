import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { ActivationWizard } from '../components/activation-wizard/ActivationWizard';
import {
  PasswordStep,
  PersonalInfoStep,
  BankDetailsStep,
  NextOfKinStep,
  SelfieStep,
} from '../components/activation-wizard/steps';
import { WIZARD_STEPS } from '../components/activation-wizard/useActivationWizard';
import type { StepRenderProps } from '../components/activation-wizard/ActivationWizard';
import { validateActivationToken, type ActivationResponse } from '../api/auth.api';

type PageState = 'loading' | 'valid' | 'invalid' | 'expired' | 'error' | 'activated';

type PhotoOutcome = ActivationResponse['photo'];

interface TokenInfo {
  fullName?: string;
  email?: string;
  roleName?: string;
}

/**
 * Render the appropriate step component based on current wizard step
 */
function renderStep(props: StepRenderProps) {
  switch (props.step) {
    case WIZARD_STEPS.PASSWORD:
      return <PasswordStep {...props} />;
    case WIZARD_STEPS.PERSONAL_INFO:
      return <PersonalInfoStep {...props} />;
    case WIZARD_STEPS.BANK_DETAILS:
      return <BankDetailsStep {...props} />;
    case WIZARD_STEPS.NEXT_OF_KIN:
      return <NextOfKinStep {...props} />;
    case WIZARD_STEPS.SELFIE:
      return <SelfieStep {...props} />;
    default:
      return null;
  }
}

export default function ActivationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  // If no token, show invalid state immediately; otherwise start loading
  const [pageState, setPageState] = useState<PageState>(() =>
    token ? 'loading' : 'invalid'
  );
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [photoOutcome, setPhotoOutcome] = useState<PhotoOutcome | null>(null);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setPageState('invalid');
      return;
    }

    let cancelled = false;
    const tokenValue = token; // Capture for closure

    async function validate() {
      try {
        const result = await validateActivationToken(tokenValue!);
        if (cancelled) return;

        if (result.valid) {
          setTokenInfo({
            fullName: result.fullName,
            email: result.email,
            roleName: result.roleName,
          });
          setPageState('valid');
        } else if (result.expired) {
          setPageState('expired');
        } else {
          setPageState('invalid');
        }
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to validate activation link'
        );
        setPageState('error');
      }
    }

    validate();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Track redirect timeout for cleanup
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up redirect timer on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const handleSuccess = (data: unknown) => {
    // Story 13-60 AC1.1 — carry the photo outcome onto the completion screen.
    // The API has always known whether the photo saved; it was discarded here,
    // one frame before the only screen that could have said so.
    const photo = (data as ActivationResponse | undefined)?.photo;
    setPhotoOutcome(photo ?? null);
    setPageState('activated');

    /*
     * ⚠️ Story 13-60 — do NOT auto-redirect when the photo failed. The message
     * telling them their ID-card photo did not save is the only notice they
     * will ever get, and a 5-second timer pulling it off screen mid-sentence
     * would reproduce the silence this story exists to end. They leave by
     * choosing to.
     */
    if (photo?.status === 'failed') return;
    // Auto-redirect after 5 seconds.
    //
    // ⚠️ /staff/login, NOT /login (fixed 2026-08-09, found by the enumerator
    // invite dry run). Activation is STAFF-ONLY — auth.service `activateAccount`
    // is reached only from a staff invitation token. `/login` is the CITIZEN
    // page: it posts to `/auth/public/login`, which hard-rejects a staff user
    // (`auth.service.ts` — `if (user.role.name !== UserRole.PUBLIC_USER) throw`).
    // So this line delivered every newly-activated enumerator, clerk, assessor
    // and admin to a door that refuses their credentials, on their first ever
    // login, with nothing on screen to say where to go instead.
    redirectTimerRef.current = setTimeout(() => {
      navigate('/staff/login');
    }, 5000);
  };

  const handleError = (_error: Error) => {
    // Errors are handled by the wizard internally
    // This callback is for logging or analytics if needed in production
    // Error details available via _error.message
  };

  // Loading state
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-neutral-600">Validating your activation link...</p>
        </div>
      </div>
    );
  }

  // Invalid token state
  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center">
          <div className="w-16 h-16 bg-error-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-error-600" />
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Invalid Activation Link</h1>
          <p className="text-neutral-600 mb-6">
            This activation link is invalid or the account has already been activated.
          </p>
          <div className="space-y-3">
            <Link
              to="/staff/login"
              className="block w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
            >
              Go to Login
            </Link>
            <Link
              to="/support/contact"
              className="block text-sm text-primary-600 hover:text-primary-700"
            >
              Need help? Contact Support
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Expired token state
  if (pageState === 'expired') {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center">
          <div className="w-16 h-16 bg-warning-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-warning-600" />
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Activation Link Expired</h1>
          <p className="text-neutral-600 mb-6">
            This activation link has expired. Please contact your administrator to request a new invitation.
          </p>
          <div className="space-y-3">
            <Link
              to="/staff/login"
              className="block w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
            >
              Go to Login
            </Link>
            <Link
              to="/support/contact"
              className="block text-sm text-primary-600 hover:text-primary-700"
            >
              Contact Support for New Invitation
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center">
          <div className="w-16 h-16 bg-error-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-error-600" />
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Something Went Wrong</h1>
          <p className="text-neutral-600 mb-6">
            {errorMessage || 'We encountered an error while validating your activation link. Please try again.'}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="block w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
            >
              Try Again
            </button>
            <Link
              to="/support/contact"
              className="block text-sm text-primary-600 hover:text-primary-700"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Activated state (success)
  if (pageState === 'activated') {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-neutral-200 p-8 text-center">
          <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-success-600" />
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Account Activated!</h1>
          <p className="text-neutral-600 mb-6">
            Your profile has been completed successfully. You can now log in to your account.
          </p>

          {/*
            * Story 13-60 AC1.1 — the photo half of the outcome, stated plainly.
            * Your account working and your ID CARD existing are two different
            * things, and before this the second one failed in total silence.
            */}
          {photoOutcome?.status === 'failed' && (
            <div
              role="alert"
              className="mb-6 text-left p-4 bg-warning-100 border border-warning-600 rounded-lg"
            >
              <div className="flex gap-2 items-start">
                <AlertCircle className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-medium text-neutral-900">Your photo did not save</p>
                  <p className="text-sm text-neutral-700">
                    Your account is active, but we could not store your photo, so your staff
                    ID card cannot be printed yet. Nothing else is missing.
                  </p>
                  {/*
                    * ⚠️ NAME THE AFFORDANCE THAT EXISTS. This line used to read
                    * "add your photo from Profile › Photo" — there is no Photo
                    * section on the profile page, and the only route that adds
                    * a photo (`/profile-completion`) is reached from the
                    * dashboard banner. Sending someone to look for a screen
                    * that is not there is the same failure as telling them
                    * nothing, one step later.
                    */}
                  <p className="text-sm text-neutral-700">
                    <strong>You do not need a new invitation.</strong> Log in and your dashboard
                    will show an <span className="font-medium">&ldquo;Add your photo&rdquo;</span>{' '}
                    prompt — it takes under a minute.
                  </p>
                </div>
              </div>
            </div>
          )}

          {photoOutcome?.status === 'skipped' && (
            <div className="mb-6 text-left p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
              <p className="text-sm text-neutral-600">
                You skipped the photo step, so your staff ID card cannot be printed yet. You can
                add a photo any time after logging in — no new invitation needed.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <Link
              to="/staff/login"
              className="block w-full px-4 py-2 bg-success-600 hover:bg-success-700 text-white rounded-lg font-medium transition-colors"
            >
              Log In Now
            </Link>
            {photoOutcome?.status !== 'failed' && (
              <p className="text-sm text-neutral-500">
                Redirecting to login in 5 seconds...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Valid token - show the wizard
  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4 sm:px-6 lg:px-8">
      {/* Welcome message with user info if available */}
      {tokenInfo?.fullName && (
        <div className="max-w-2xl mx-auto mb-6 text-center">
          <p className="text-neutral-600">
            Welcome, <span className="font-medium text-neutral-900">{tokenInfo.fullName}</span>
          </p>
        </div>
      )}

      <ActivationWizard
        token={token!}
        roleName={tokenInfo?.roleName}
        onSuccess={handleSuccess}
        onError={handleError}
        renderStep={renderStep}
      />
    </div>
  );
}

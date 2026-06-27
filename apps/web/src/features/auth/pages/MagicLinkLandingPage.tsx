import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../../lib/api-client';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { useAuth } from '../context/AuthContext';
import {
  peekMagicLink,
  loginByMagicLink,
  isMagicLinkMfaRequired,
  type MagicLinkPeekResult,
  type MagicLinkPurpose,
} from '../api/magic-link.api';

/**
 * Story 9-12 MR-8 (2026-05-11 session 8) — Magic-link landing page.
 *
 * Email magic-link URLs land at `${APP_URL}/auth/magic?token=…&purpose=…`.
 * Without this page, a click from email hit the frontend's catch-all 404
 * (the matching backend route at `/api/v1/auth/magic` is the peek endpoint
 * but the email URL points at the frontend host).
 *
 * Flow:
 *   1. On mount, peek the token (idempotent — prefetcher-safe).
 *   2. Render a "Continue as user@example.com" confirmation card with copy
 *      tailored to the token's purpose.
 *   3. On Continue, route to the destination handler that owns the actual
 *      consume step:
 *        - `wizard_resume`        → `/register?token=…` (wizard hydrates draft)
 *        - `pending_nin_complete` → `/register/complete-nin?token=…` (CompleteNinPage)
 *        - `login`                → not yet wired (JWT issuance is deferred);
 *                                   render an informational notice and link to /login.
 *
 * Note: this page does NOT call `POST /auth/magic/consume`. The destination
 * page owns the consume step (FR21 dedupe before consume for complete-nin;
 * draft hydration for wizard resume). This decoupling keeps single-use
 * semantics honest — the token is consumed only when the user actually
 * completes the downstream work, not when they click through the landing.
 */

const PURPOSE_COPY: Record<MagicLinkPurpose, { title: string; body: string; cta: string }> = {
  wizard_resume: {
    title: 'Resume your registration',
    body:
      'You started registering for the Oyo State Skills Registry and saved your progress. Continue right where you left off.',
    cta: 'Continue registration',
  },
  pending_nin_complete: {
    title: 'Add your NIN to complete registration',
    body:
      'Your registration was saved as pending because you didn\'t have your NIN to hand. Add it now and we\'ll finalise your record.',
    cta: 'Add my NIN',
  },
  login: {
    title: 'Continue signing in',
    body: 'Click Continue to sign in on this device.',
    cta: 'Continue to sign-in',
  },
  supplemental_survey: {
    title: 'Complete your skills profile',
    body:
      'Thank you for registering with the Oyo State Skills Registry. Your registration details are already saved — we just need a few minutes of your skills information to match you with the right training programs and opportunities.',
    cta: 'Complete my skills profile',
  },
};

function isMagicLinkPurpose(v: string | null): v is MagicLinkPurpose {
  return (
    v === 'wizard_resume' ||
    v === 'pending_nin_complete' ||
    v === 'login' ||
    v === 'supplemental_survey'
  );
}

export default function MagicLinkLandingPage() {
  useDocumentTitle('Continue with magic link | Oyo State Skills Registry');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get('token') ?? '';
  const purposeRaw = searchParams.get('purpose');
  const purpose: MagicLinkPurpose | null = isMagicLinkPurpose(purposeRaw) ? purposeRaw : null;

  const { loginWithMagicLink } = useAuth();

  const [peeked, setPeeked] = useState<MagicLinkPeekResult | null>(null);
  const [peekError, setPeekError] = useState<{ code: string; message: string } | null>(null);
  const [isPeekingDone, setIsPeekingDone] = useState(false);

  // Story 9-16 — login-branch confirm flow state.
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [loginError, setLoginError] = useState<{ code: string; message: string } | null>(null);

  const handleLoginConfirm = async () => {
    setIsSigningIn(true);
    setLoginError(null);
    try {
      const result = await loginByMagicLink({ token, rememberMe: false });
      if (isMagicLinkMfaRequired(result)) {
        // MFA-enrolled account — hand off to the Story 9-13 challenge page.
        navigate('/auth/mfa-challenge', {
          replace: true,
          state: {
            mfaChallengeToken: result.mfaChallengeToken,
            expiresIn: result.expiresIn,
            rememberMe: false,
            redirectTo: '/dashboard',
          },
        });
        return;
      }
      await loginWithMagicLink(result, false);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setIsSigningIn(false);
      if (err instanceof ApiError) {
        setLoginError({ code: err.code ?? 'MAGIC_LINK_INVALID', message: err.message });
      } else {
        setLoginError({
          code: 'NETWORK_ERROR',
          message: 'Could not sign you in. Please try again in a moment.',
        });
      }
    }
  };

  useEffect(() => {
    if (!token || !purpose) {
      setIsPeekingDone(true);
      return;
    }
    let cancelled = false;
    peekMagicLink({ token, purpose })
      .then((result) => {
        if (cancelled) return;
        setPeeked(result);
        setIsPeekingDone(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setPeekError({
            code: err.code ?? 'MAGIC_LINK_INVALID',
            message: err.message,
          });
        } else {
          setPeekError({
            code: 'NETWORK_ERROR',
            message: 'Could not validate this link. Please try again in a moment.',
          });
        }
        setIsPeekingDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, purpose]);

  if (!token || !purpose) {
    return (
      <CenteredCard testId="magic-link-missing-params">
        <h1 className="text-xl font-semibold text-neutral-900">Link incomplete</h1>
        <p className="mt-3 text-sm text-neutral-700">
          This link is missing required information. Try copying it from your email again, or
          request a new one.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/login"
            className="rounded-md bg-primary-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-primary-700"
          >
            Go to sign-in
          </Link>
          <Link
            to="/register"
            className="rounded-md border border-neutral-300 px-4 py-2 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Start a new registration
          </Link>
        </div>
      </CenteredCard>
    );
  }

  if (!isPeekingDone) {
    return (
      <CenteredCard testId="magic-link-loading">
        <div className="space-y-4">
          <div className="h-6 w-1/2 animate-pulse rounded bg-neutral-100" />
          <div className="h-20 animate-pulse rounded bg-neutral-100" />
        </div>
      </CenteredCard>
    );
  }

  if (peekError) {
    const friendly = friendlyErrorCopy(peekError.code);
    return (
      <CenteredCard testId="magic-link-error">
        <h1 className="text-xl font-semibold text-neutral-900">{friendly.title}</h1>
        <p className="mt-3 text-sm text-neutral-700">{friendly.body}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/login"
            className="rounded-md bg-primary-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-primary-700"
          >
            Request a new link
          </Link>
          <Link
            to="/register"
            className="rounded-md border border-neutral-300 px-4 py-2 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Start a new registration
          </Link>
        </div>
      </CenteredCard>
    );
  }

  // Story 9-16 — Login purpose: confirm + sign in. On Confirm we consume the
  // token at POST /auth/magic/login, mount the session, and route to the
  // dashboard (or to the MFA challenge page when the account is enrolled).
  if (purpose === 'login') {
    if (loginError) {
      const friendly = loginFriendlyErrorCopy(loginError.code);
      return (
        <CenteredCard testId="magic-link-login-error">
          <h1 className="text-xl font-semibold text-neutral-900">{friendly.title}</h1>
          <p className="mt-3 text-sm text-neutral-700">{friendly.body}</p>
          <div className="mt-6 flex flex-col gap-2">
            {friendly.registerCta ? (
              <Link
                to="/register"
                className="rounded-md bg-primary-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-primary-700"
                data-testid="magic-link-login-register-cta"
              >
                Register
              </Link>
            ) : null}
            <Link
              to="/login"
              className={
                friendly.registerCta
                  ? 'rounded-md border border-neutral-300 px-4 py-2 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50'
                  : 'rounded-md bg-primary-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-primary-700'
              }
            >
              Go to sign-in
            </Link>
            {friendly.showSupport ? (
              <Link
                to="/support"
                className="rounded-md border border-neutral-300 px-4 py-2 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Contact support
              </Link>
            ) : null}
          </div>
        </CenteredCard>
      );
    }

    return (
      <CenteredCard testId="magic-link-login-confirm">
        <h1 className="text-xl font-semibold text-neutral-900">{PURPOSE_COPY.login.title}</h1>
        <p className="mt-3 text-sm text-neutral-700">{PURPOSE_COPY.login.body}</p>
        {peeked?.email ? (
          <p className="mt-2 text-xs text-neutral-500" data-testid="magic-link-login-email">
            Signing in as <span className="font-mono">{peeked.email}</span>.
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleLoginConfirm}
          disabled={isSigningIn}
          data-testid="magic-link-confirm-button"
          className="mt-6 w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {isSigningIn ? 'Signing in…' : PURPOSE_COPY.login.cta}
        </button>
        <p className="mt-3 text-center text-xs text-neutral-500">
          If you didn't request this link, you can safely close this tab.
        </p>
      </CenteredCard>
    );
  }

  // At this point TS has narrowed `purpose` to exclude 'login' (the
  // early-return above handles it), so the switch below has 3 cases.
  const copy = PURPOSE_COPY[purpose];
  const handleContinue = () => {
    // Story 13-9 (AC1) — forward campaign attribution (utm/?ref) from the magic-link through the
    // /auth/magic hop to the wizard, so the wizard's 13-1 parseUtm captures it → extras.utm →
    // raw_data.campaign_source at submit. Without this forward, the hop drops the params and a
    // blast conversion can't be attributed (the one-way door). Bounded to the 13-1 allow-list.
    const utm = new URLSearchParams();
    for (const k of ['utm_campaign', 'utm_source', 'utm_medium', 'ref']) {
      const v = searchParams.get(k);
      if (v) utm.set(k, v);
    }
    const utmSuffix = utm.toString() ? `&${utm.toString()}` : '';
    let destination: string;
    switch (purpose) {
      case 'wizard_resume':
        destination = `/register?token=${encodeURIComponent(token)}${utmSuffix}`;
        break;
      case 'supplemental_survey':
        destination = `/register/supplemental?token=${encodeURIComponent(token)}${utmSuffix}`;
        break;
      case 'pending_nin_complete':
        destination = `/register/complete-nin?token=${encodeURIComponent(token)}${utmSuffix}`;
        break;
      default: {
        // M7 fix — exhaustive switch on the narrowed MagicLinkPurpose union;
        // if a new variant is added to the type without updating this switch,
        // TS errors at compile time. Replaces the previous default-fall-
        // through that silently routed unknowns to /register/complete-nin.
        const _exhaustive: never = purpose;
        void _exhaustive;
        destination = '/login';
        break;
      }
    }
    navigate(destination, { replace: true });
  };

  return (
    <CenteredCard testId="magic-link-confirm">
      <h1 className="text-xl font-semibold text-neutral-900">{copy.title}</h1>
      <p className="mt-3 text-sm text-neutral-700">{copy.body}</p>
      {peeked?.email ? (
        <p className="mt-2 text-xs text-neutral-500" data-testid="magic-link-confirm-email">
          Continuing as <span className="font-mono">{peeked.email}</span>.
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleContinue}
        data-testid="magic-link-confirm-button"
        className="mt-6 w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
      >
        {copy.cta}
      </button>
      <p className="mt-3 text-center text-xs text-neutral-500">
        If you didn't request this link, you can safely close this tab.
      </p>
    </CenteredCard>
  );
}

function friendlyErrorCopy(code: string): { title: string; body: string } {
  switch (code) {
    case 'MAGIC_LINK_EXPIRED':
      return {
        title: 'This link has expired',
        body: 'For your security, magic links expire after a short period. Please request a new one.',
      };
    case 'MAGIC_LINK_ALREADY_USED':
      return {
        title: 'This link has already been used',
        body:
          'Magic links can only be used once. If you need to continue, please request a fresh link.',
      };
    case 'NETWORK_ERROR':
      return {
        title: 'We couldn\'t reach our servers',
        body: 'Please check your connection and try again in a moment.',
      };
    default:
      return {
        title: 'This link is invalid',
        body:
          'The link may have been mistyped, or it was generated by a different system. Try copying it from your email again, or request a new one.',
      };
  }
}

/**
 * Story 9-16 — login-branch error copy. Adds the account-state codes the
 * `/auth/magic/login` endpoint can surface on top of the MAGIC_LINK_* codes
 * the consume step shares with the other purposes.
 */
function loginFriendlyErrorCopy(
  code: string,
): { title: string; body: string; showSupport: boolean; registerCta?: boolean } {
  switch (code) {
    case 'AUTH_INVALID_CREDENTIALS':
      // Story 9-38 (AC#9) — the dominant real case here is someone who NEVER
      // registered typing their email at /login → "send me a sign-in link"
      // (the request endpoint emails a link unconditionally for
      // anti-enumeration). The old "old address" copy mis-served them; guide
      // them to register instead. Still correct post-9-38: wizard registrants
      // now have accounts, but a genuinely-unregistered visitor still lands here.
      return {
        title: "Let's get you registered first",
        body:
          "We couldn't find an account for that email. If you haven't registered yet, start here.",
        showSupport: false,
        registerCta: true,
      };
    case 'AUTH_ACCOUNT_LOCKED':
      return {
        title: 'Your account is temporarily locked',
        body:
          'Too many recent sign-in attempts. Please wait a little while and try again, or contact support if you need help.',
        showSupport: true,
      };
    case 'AUTH_ACCOUNT_SUSPENDED':
      return {
        title: 'Your account is suspended',
        body: 'This account has been suspended. Please contact support for assistance.',
        showSupport: true,
      };
    default: {
      // MAGIC_LINK_* + NETWORK_ERROR reuse the shared peek-error copy.
      const base = friendlyErrorCopy(code);
      return { ...base, showSupport: false };
    }
  }
}

function CenteredCard({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-16">
      <div
        className="mx-auto max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  );
}

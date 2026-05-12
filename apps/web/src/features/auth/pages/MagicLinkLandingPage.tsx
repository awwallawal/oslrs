import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../../lib/api-client';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import {
  peekMagicLink,
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
    title: 'Magic-link sign-in',
    body: '',
    cta: '',
  },
};

function isMagicLinkPurpose(v: string | null): v is MagicLinkPurpose {
  return v === 'wizard_resume' || v === 'pending_nin_complete' || v === 'login';
}

export default function MagicLinkLandingPage() {
  useDocumentTitle('Continue with magic link | Oyo State Skills Registry');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get('token') ?? '';
  const purposeRaw = searchParams.get('purpose');
  const purpose: MagicLinkPurpose | null = isMagicLinkPurpose(purposeRaw) ? purposeRaw : null;

  const [peeked, setPeeked] = useState<MagicLinkPeekResult | null>(null);
  const [peekError, setPeekError] = useState<{ code: string; message: string } | null>(null);
  const [isPeekingDone, setIsPeekingDone] = useState(false);

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

  // Login purpose: JWT issuance for magic-link login is deferred (see story
  // Review Follow-ups MR-8). Show informational notice + path to /login.
  if (purpose === 'login') {
    return (
      <CenteredCard testId="magic-link-login-deferred">
        <h1 className="text-xl font-semibold text-neutral-900">Magic-link sign-in coming soon</h1>
        <p className="mt-3 text-sm text-neutral-700">
          Magic-link sign-in is not yet available. For now, please sign in with your email and
          password.
        </p>
        {peeked?.email ? (
          <p className="mt-2 text-xs text-neutral-500" data-testid="magic-link-login-email">
            Link is valid for <span className="font-mono">{peeked.email}</span>.
          </p>
        ) : null}
        <Link
          to="/login"
          className="mt-6 block rounded-md bg-primary-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-primary-700"
        >
          Go to sign-in
        </Link>
      </CenteredCard>
    );
  }

  const copy = PURPOSE_COPY[purpose];
  const handleContinue = () => {
    const destination =
      purpose === 'wizard_resume'
        ? `/register?token=${encodeURIComponent(token)}`
        : `/register/complete-nin?token=${encodeURIComponent(token)}`;
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

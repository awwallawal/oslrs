import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { TrustBadgesRow } from '../components/TrustBadgesRow';

/**
 * Story 9-12 Task 7.3 / AC#9 — registration-complete confirmation screen.
 *
 * Reached after a successful pending-NIN promotion via the
 * `/register/complete-nin` page (or, in future, from any other deferred-flow
 * close-out). Civic framing: thanks the respondent for joining the registry
 * and gestures toward the next-step affordances (sign in, search the
 * marketplace, learn more) without mandating any of them.
 *
 * Distinct from the in-wizard `CompletionScreen` (rendered inline at the end
 * of the 5-step wizard) — that one ships in the same DOM tree as the wizard
 * because of magic-link login flow continuity. This standalone page exists
 * for the post-magic-link-redemption case where there is no wizard mounted.
 */

export default function RegistrationCompletePage() {
  useDocumentTitle('Registration complete — Oyo State Skills Registry');
  const [searchParams] = useSearchParams();
  const source = searchParams.get('source');

  const headline =
    source === 'pending_nin'
      ? 'Your registration is now complete'
      : 'Registration complete';

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
              className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 text-center"
              data-testid="registration-complete-card"
            >
              <CheckCircle2
                className="mx-auto h-16 w-16 text-success-600"
                aria-hidden="true"
              />
              <h1
                className="mt-4 text-2xl font-semibold text-neutral-900"
                data-testid="registration-complete-headline"
              >
                {headline}
              </h1>
              <p className="mt-3 text-sm text-neutral-700">
                Thank you for joining the Oyo State Skills Registry. Your
                contribution helps the State plan training, jobs, and skills
                programmes that match the people who actually live and work
                here.
              </p>

              <div className="mt-6 space-y-3 text-sm">
                <p className="text-neutral-700">
                  Watch your email for a one-click sign-in link. From your
                  account you can update your details, list yourself in the
                  public marketplace, and apply for opportunities as they open.
                </p>
              </div>

              <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
                <Link
                  to="/marketplace"
                  className="inline-flex items-center justify-center rounded-md border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                  data-testid="registration-complete-marketplace"
                >
                  Explore the marketplace
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                  data-testid="registration-complete-signin"
                >
                  Sign in
                </Link>
              </div>
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

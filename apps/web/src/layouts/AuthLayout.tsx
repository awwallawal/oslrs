import { Outlet, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ErrorBoundary } from '../components/ErrorBoundary';

/**
 * AuthLayout - Minimal layout for authentication pages.
 *
 * Features per AC3 and ADR-016:
 * - Minimal chrome: "Back to Homepage" link top-left only
 * - Centered content card with Oyo State logo (60px height)
 * - NO header/footer navigation (focused auth experience)
 * - Consistent background (neutral-50)
 * - Wrapped in ErrorBoundary with appropriate fallback
 *
 * Used for: /login, /register, /forgot-password, /reset-password/:token,
 *           /verify-email/:token, /staff/login, /resend-verification
 */
function AuthLayout() {
  return (
    <ErrorBoundary
      fallbackProps={{
        title: 'Authentication Error',
        description: 'Unable to load authentication page. Please try again.',
      }}
    >
      <div className="min-h-screen bg-neutral-50 flex flex-col">
        {/* Back to Homepage link */}
        <div className="p-4 sm:p-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-neutral-600 hover:text-primary-600 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-md px-2 py-1 -ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Homepage
          </Link>
        </div>

        {/* Centered content area */}
        <div className="flex-1 flex items-center justify-center px-4 pb-12">
          <div className="w-full max-w-md">
            {/* Logo */}
            <div className="flex justify-center mb-8">
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

            {/* Auth card content */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 sm:p-8">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export { AuthLayout };

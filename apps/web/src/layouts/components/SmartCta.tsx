import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/context/AuthContext';
import { cn } from '../../lib/utils';

interface SmartCtaProps {
  /** Additional class names for the outer wrapper (e.g., mobile full-width) */
  className?: string;
  /**
   * Stack the doors vertically and stretch them full-width. Used by the mobile
   * drawer (MobileNav); the desktop header leaves this false for an inline row.
   */
  stacked?: boolean;
}

/**
 * SmartCta - Auth-aware CTA for header and mobile nav.
 *
 * - Logged out (Story 9-39 AC1): shows BOTH "Sign in" → /login (the public
 *   magic-link-primary sign-in) AND "Register" → /register. Before 9-39 the
 *   logged-out state only ever offered "Register", leaving returning users with
 *   no discoverable way back in.
 * - Logged in (unchanged, verified Story 1.5-8 AC5): "Dashboard" → /dashboard,
 *   plus a lightweight "Signed in as …" affordance (AC5) so a browsing logged-in
 *   user has an unmistakable signal.
 * - Loading: skeleton to prevent a flash of the wrong button.
 */
function SmartCta({ className, stacked = false }: SmartCtaProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  const primaryStyles =
    'px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-colors';
  const secondaryStyles =
    'px-4 py-2 bg-white text-primary-700 text-sm font-medium rounded-lg border border-primary-300 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-colors';

  const wrapperStyles = stacked
    ? 'flex flex-col gap-2'
    : 'flex items-center gap-2';
  // Stacked (mobile drawer) doors stretch full-width + center their label.
  const doorStyles = stacked ? 'w-full text-center' : '';

  // Show skeleton during auth check to prevent flash
  if (isLoading) {
    return (
      <div
        className={cn('h-9 w-24 bg-neutral-200 animate-pulse rounded-lg', className)}
        aria-label="Loading..."
        role="status"
      />
    );
  }

  if (isAuthenticated) {
    return (
      <div
        className={cn(
          stacked ? 'flex flex-col gap-2' : 'flex items-center gap-3',
          className,
        )}
      >
        {user && (
          <span
            className={cn(
              'text-sm text-neutral-600 truncate',
              stacked ? 'text-center' : 'max-w-[12rem]',
            )}
            data-testid="smartcta-signed-in-as"
          >
            Signed in as{' '}
            <span className="font-medium text-neutral-800">
              {user.fullName || user.email}
            </span>
          </span>
        )}
        <Link to="/dashboard" className={cn(primaryStyles, doorStyles)}>
          Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className={cn(wrapperStyles, className)}>
      <Link
        to="/login"
        className={cn(secondaryStyles, doorStyles)}
        data-testid="smartcta-signin"
      >
        Sign in
      </Link>
      <Link
        to="/register"
        className={cn(primaryStyles, doorStyles)}
        data-testid="smartcta-register"
      >
        Register
      </Link>
    </div>
  );
}

export { SmartCta };

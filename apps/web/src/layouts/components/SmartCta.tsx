import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/context/AuthContext';
import { cn } from '../../lib/utils';

interface SmartCtaProps {
  /** Additional class names for custom styling (e.g., mobile full-width) */
  className?: string;
}

/**
 * SmartCta - Auth-aware CTA button for header and mobile nav.
 *
 * Per Story 1.5-8 AC5:
 * - Not logged in: Shows "Register" → /register
 * - Logged in: Shows "Dashboard" → /dashboard
 * - Uses loading skeleton to prevent flash of wrong button
 */
function SmartCta({ className }: SmartCtaProps) {
  const { isAuthenticated, isLoading } = useAuth();

  const baseStyles = 'px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-colors';

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
      <Link
        to="/dashboard"
        className={cn(baseStyles, className)}
      >
        Dashboard
      </Link>
    );
  }

  return (
    <Link
      to="/register"
      className={cn(baseStyles, className)}
    >
      Register
    </Link>
  );
}

export { SmartCta };

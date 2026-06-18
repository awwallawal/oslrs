import { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Story 9-60: route-scoped error boundary.
 *
 * Lives INSIDE BrowserRouter so it can key off the current path. A render error
 * caught after a navigation (e.g. the post-login white screen from the
 * in-memory-token ordering race) self-heals when the user navigates to a new
 * route — the `resetKey={pathname}` change resets the boundary and re-attempts
 * render — instead of blanking the app until a hard refresh.
 *
 * The top-level <ErrorBoundary> in App() (outside the router, so it cannot read
 * useLocation) remains the last-resort catch-all for errors above the router.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary
      resetKey={pathname}
      fallbackProps={{
        title: 'Page Error',
        description: 'Something went wrong on this page. Try again, or use the navigation to continue.',
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

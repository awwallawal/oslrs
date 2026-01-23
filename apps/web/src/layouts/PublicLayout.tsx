import { Outlet } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkipLink } from './components/SkipLink';
import { Header } from './components/Header';
import { Footer } from './components/Footer';

/**
 * PublicLayout - Layout wrapper for public-facing pages.
 *
 * Features per AC2 and ADR-016:
 * - ErrorBoundary wrapper with appropriate fallback
 * - SkipLink for accessibility ("Skip to main content")
 * - Header with logo, navigation, and mobile hamburger
 * - Main content area with <Outlet />
 * - Footer with 3-column layout
 *
 * Used for: /, /about/*, /participate/*, /support/*, /terms, /marketplace
 */
function PublicLayout() {
  return (
    <ErrorBoundary
      fallbackProps={{
        title: 'Page Error',
        description: 'This page encountered an error. Please try again.',
      }}
    >
      <div className="min-h-screen flex flex-col bg-neutral-50">
        <SkipLink />
        <Header />
        <main id="main-content" className="flex-1" tabIndex={-1}>
          <Outlet />
        </main>
        <Footer />
      </div>
    </ErrorBoundary>
  );
}

export { PublicLayout };

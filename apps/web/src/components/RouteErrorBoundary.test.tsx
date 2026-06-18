// @vitest-environment jsdom
/**
 * Story 9-60: route-scoped error boundary tests.
 *
 * Proves the post-login white-screen fix: a render error caught on one route
 * self-heals when the user navigates to a new route (resetKey={pathname}
 * change), instead of blanking until a hard refresh.
 */
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { RouteErrorBoundary } from './RouteErrorBoundary';

expect.extend(matchers);

// A child that throws only on the /bad path.
function ConditionalThrow() {
  const { pathname } = useLocation();
  if (pathname === '/bad') {
    throw new Error('boom on /bad');
  }
  return <div>safe content</div>;
}

// Nav control rendered OUTSIDE the boundary so the fallback can't unmount it.
function GoToGood() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/good')}>go-good</button>;
}

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught render errors to console.error; silence the noise.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the fallback when a child throws', () => {
    render(
      <MemoryRouter initialEntries={['/bad']}>
        <RouteErrorBoundary>
          <ConditionalThrow />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('Page Error')).toBeInTheDocument();
    expect(screen.queryByText('safe content')).not.toBeInTheDocument();
  });

  it('self-heals when the route changes (resetKey={pathname})', () => {
    render(
      <MemoryRouter initialEntries={['/bad']}>
        <GoToGood />
        <RouteErrorBoundary>
          <ConditionalThrow />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    // Starts blanked on /bad.
    expect(screen.getByText('Page Error')).toBeInTheDocument();

    // Navigating to a new route changes the resetKey → boundary resets.
    fireEvent.click(screen.getByText('go-good'));

    expect(screen.queryByText('Page Error')).not.toBeInTheDocument();
    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('renders children normally when nothing throws', () => {
    render(
      <MemoryRouter initialEntries={['/good']}>
        <RouteErrorBoundary>
          <ConditionalThrow />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('safe content')).toBeInTheDocument();
    expect(screen.queryByText('Page Error')).not.toBeInTheDocument();
  });
});

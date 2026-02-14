// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ErrorBoundary } from '../ErrorBoundary';
import { ErrorFallback } from '../ErrorFallback';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

// Component that throws an error
function ThrowingComponent({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
}

// Suppress console.error during tests (expected behavior)
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('catches errors in child components', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('displays fallback UI when error is caught', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Please refresh the page or try again.')).toBeInTheDocument();
  });

  it('shows "Try Again" button that resets the boundary', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Click try again
    const tryAgainButton = screen.getByRole('button', { name: /try again/i });
    expect(tryAgainButton).toBeInTheDocument();

    // After clicking, it will re-render and throw again
    // In real usage, the underlying issue would be fixed first
    fireEvent.click(tryAgainButton);

    // Error boundary is reset, but component throws again
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows "Go Home" link by default', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    const homeLink = screen.getByRole('link', { name: /go home/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('can hide "Go Home" link via fallbackProps', () => {
    render(
      <ErrorBoundary fallbackProps={{ showHomeLink: false }}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.queryByRole('link', { name: /go home/i })).not.toBeInTheDocument();
  });

  it('calls onError callback when error is caught', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it('calls onReset callback when error boundary is reset', () => {
    const onReset = vi.fn();

    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('supports custom fallback component', () => {
    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('supports custom fallback render function', () => {
    render(
      <ErrorBoundary
        fallback={({ error, resetError }) => (
          <div>
            <span>Error: {error.message}</span>
            <button onClick={resetError}>Reset</button>
          </div>
        )}
      >
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Error: Test error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });

  it('resets when resetKey changes', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="key1">
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Change resetKey - boundary should reset
    rerender(
      <ErrorBoundary resetKey="key2">
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    );

    // Now showing content instead of error
    expect(screen.getByText('No error')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('accepts custom title and description via fallbackProps', () => {
    render(
      <ErrorBoundary
        fallbackProps={{
          title: 'Camera Error',
          description: 'Unable to access camera.',
        }}
      >
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Camera Error')).toBeInTheDocument();
    expect(screen.getByText('Unable to access camera.')).toBeInTheDocument();
  });

  it('logs error with component stack trace', () => {
    const consoleSpy = vi.spyOn(console, 'error');

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      '[ErrorBoundary] Caught error:',
      expect.any(Error)
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '[ErrorBoundary] Component stack:',
      expect.any(String)
    );
  });
});

describe('ErrorFallback', () => {
  it('renders with default props', () => {
    render(<ErrorFallback />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Please refresh the page or try again.')).toBeInTheDocument();
  });

  it('shows Try Again button when resetError is provided', () => {
    const resetError = vi.fn();
    render(<ErrorFallback resetError={resetError} />);

    const button = screen.getByRole('button', { name: /try again/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(resetError).toHaveBeenCalledTimes(1);
  });

  it('does not show Try Again button when resetError is not provided', () => {
    render(<ErrorFallback />);

    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('shows Go Home link by default', () => {
    render(<ErrorFallback />);

    const link = screen.getByRole('link', { name: /go home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });

  it('can hide Go Home link', () => {
    render(<ErrorFallback showHomeLink={false} />);

    expect(screen.queryByRole('link', { name: /go home/i })).not.toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<ErrorFallback />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });
});

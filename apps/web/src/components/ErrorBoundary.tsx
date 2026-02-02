import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorFallback, type ErrorFallbackProps } from './ErrorFallback';
import { logger } from '../lib/logger';

interface ErrorBoundaryProps {
  /**
   * Child components to wrap
   */
  children: ReactNode;
  /**
   * Custom fallback component or render function
   */
  fallback?: ReactNode | ((props: { error: Error; resetError: () => void }) => ReactNode);
  /**
   * Props to pass to the default ErrorFallback component
   */
  fallbackProps?: Omit<ErrorFallbackProps, 'error' | 'resetError'>;
  /**
   * Called when an error is caught
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /**
   * Called when the error boundary is reset
   */
  onReset?: () => void;
  /**
   * Key to use for resetting the error boundary (change to reset)
   */
  resetKey?: string | number;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary - Catches JavaScript errors in child components.
 *
 * React class component that implements componentDidCatch and
 * getDerivedStateFromError for proper error handling.
 *
 * Features:
 * - Page-level and feature-level protection
 * - Reset via button click or resetKey change
 * - Custom fallback UI support
 * - Error logging with component stack trace
 *
 * @example
 * // Page-level protection
 * <ErrorBoundary>
 *   <Routes>
 *     <Route path="/" element={<Home />} />
 *   </Routes>
 * </ErrorBoundary>
 *
 * // Feature-level protection with custom fallback
 * <ErrorBoundary
 *   fallbackProps={{
 *     title: "Camera Error",
 *     description: "Unable to access camera."
 *   }}
 * >
 *   <LiveSelfieCapture />
 * </ErrorBoundary>
 *
 * // With reset key (resets when key changes)
 * <ErrorBoundary resetKey={userId}>
 *   <UserProfile userId={userId} />
 * </ErrorBoundary>
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  /**
   * Update state when an error occurs during rendering
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  /**
   * Log error information for debugging
   * Note: Does NOT catch errors in event handlers (expected React behavior)
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error with component stack trace (only in development)
    logger.error('[ErrorBoundary] Caught error:', error);
    logger.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  /**
   * Reset error boundary when resetKey changes
   */
  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetError();
    }
  }

  /**
   * Reset the error boundary to try rendering children again
   */
  resetError = (): void => {
    this.props.onReset?.();
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    const { children, fallback, fallbackProps } = this.props;
    const { hasError, error } = this.state;

    if (hasError && error) {
      // Custom fallback render function
      if (typeof fallback === 'function') {
        return fallback({ error, resetError: this.resetError });
      }

      // Custom fallback component
      if (fallback) {
        return fallback;
      }

      // Default ErrorFallback component
      return (
        <ErrorFallback
          error={error}
          resetError={this.resetError}
          {...fallbackProps}
        />
      );
    }

    return children;
  }
}

export { ErrorBoundary };
export type { ErrorBoundaryProps, ErrorBoundaryState };

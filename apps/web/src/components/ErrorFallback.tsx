import { cn } from '../lib/utils';

interface ErrorFallbackProps {
  /**
   * Error that was caught (optional for display)
   */
  error?: Error;
  /**
   * Callback to reset the error boundary
   */
  resetError?: () => void;
  /**
   * Title to display
   * @default "Something went wrong"
   */
  title?: string;
  /**
   * Description message
   * @default "Please refresh the page or try again."
   */
  description?: string;
  /**
   * Show "Go Home" link
   * @default true
   */
  showHomeLink?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * ErrorFallback - User-friendly error display component.
 *
 * Used by ErrorBoundary to display a fallback UI when a component crashes.
 * Follows Oyo State branding with primary color accent.
 *
 * @example
 * // Basic usage
 * <ErrorFallback resetError={() => setHasError(false)} />
 *
 * // Custom message
 * <ErrorFallback
 *   title="Camera Error"
 *   description="Unable to access camera. Please check permissions."
 *   resetError={handleRetry}
 * />
 */
function ErrorFallback({
  error,
  resetError,
  title = 'Something went wrong',
  description = 'Please refresh the page or try again.',
  showHomeLink = true,
  className,
}: ErrorFallbackProps) {
  return (
    <div
      className={cn(
        'flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-sm',
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      {/* Error Icon */}
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error-100">
        <svg
          className="h-6 w-6 text-error-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      {/* Title */}
      <h2 className="mb-2 text-lg font-semibold text-neutral-900">
        {title}
      </h2>

      {/* Description */}
      <p className="mb-6 max-w-sm text-sm text-neutral-600">
        {description}
      </p>

      {/* Error details in development */}
      {error && import.meta.env.DEV && (
        <details className="mb-4 w-full max-w-md text-left">
          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700">
            Error Details
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-neutral-100 p-2 text-xs text-neutral-700">
            {error.message}
          </pre>
        </details>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {resetError && (
          <button
            type="button"
            onClick={resetError}
            className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            Try Again
          </button>
        )}

        {showHomeLink && (
          <a
            href="/"
            className="inline-flex items-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            Go Home
          </a>
        )}
      </div>
    </div>
  );
}

export { ErrorFallback };
export type { ErrorFallbackProps };

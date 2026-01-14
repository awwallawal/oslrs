import { toast as sonnerToast, type ExternalToast } from 'sonner';

/**
 * Toast options for the useToast hook.
 */
interface ToastOptions extends ExternalToast {
  /**
   * Toast message
   */
  message: string;
  /**
   * Optional description
   */
  description?: string;
}

/**
 * Toast configuration for the application.
 * Follows PRD requirements for auto-dismiss timing.
 */
const TOAST_CONFIG = {
  /** Success toast auto-dismiss time (ms) */
  SUCCESS_DURATION: 3000,
  /** Error toast auto-dismiss time (ms) */
  ERROR_DURATION: 5000,
  /** Warning toast auto-dismiss time (ms) */
  WARNING_DURATION: 4000,
  /** Info toast auto-dismiss time (ms) */
  INFO_DURATION: 3000,
  /** Maximum visible toasts at once */
  MAX_VISIBLE: 3,
} as const;

/**
 * useToast - Custom hook for toast notifications.
 *
 * Wraps Sonner toast library with consistent API and styling.
 * Implements PRD requirements:
 * - Success: green icon, auto-dismiss 3s
 * - Error: red icon, auto-dismiss 5s
 * - Manual dismiss option available
 *
 * @example
 * const toast = useToast();
 *
 * // Success toast
 * toast.success({ message: 'Profile saved successfully' });
 *
 * // Error toast
 * toast.error({ message: 'Failed to save profile', description: 'Please try again' });
 *
 * // With custom options
 * toast.success({
 *   message: 'Download complete',
 *   duration: 5000,
 *   onDismiss: () => console.log('Dismissed')
 * });
 */
function useToast() {
  /**
   * Show a success toast
   */
  const success = ({ message, description, ...options }: ToastOptions) => {
    return sonnerToast.success(message, {
      description,
      duration: TOAST_CONFIG.SUCCESS_DURATION,
      ...options,
    });
  };

  /**
   * Show an error toast
   */
  const error = ({ message, description, ...options }: ToastOptions) => {
    return sonnerToast.error(message, {
      description,
      duration: TOAST_CONFIG.ERROR_DURATION,
      ...options,
    });
  };

  /**
   * Show a warning toast
   */
  const warning = ({ message, description, ...options }: ToastOptions) => {
    return sonnerToast.warning(message, {
      description,
      duration: TOAST_CONFIG.WARNING_DURATION,
      ...options,
    });
  };

  /**
   * Show an info toast
   */
  const info = ({ message, description, ...options }: ToastOptions) => {
    return sonnerToast.info(message, {
      description,
      duration: TOAST_CONFIG.INFO_DURATION,
      ...options,
    });
  };

  /**
   * Show a loading toast (useful for async operations)
   */
  const loading = ({ message, description, ...options }: ToastOptions) => {
    return sonnerToast.loading(message, {
      description,
      ...options,
    });
  };

  /**
   * Dismiss a specific toast by ID
   */
  const dismiss = (toastId?: string | number) => {
    sonnerToast.dismiss(toastId);
  };

  /**
   * Promise-based toast for async operations
   * Shows loading → success/error automatically
   */
  const promise = <T>(
    promise: Promise<T>,
    options: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    }
  ) => {
    return sonnerToast.promise(promise, options);
  };

  return {
    success,
    error,
    warning,
    info,
    loading,
    dismiss,
    promise,
  };
}

export { useToast, TOAST_CONFIG };
export type { ToastOptions };

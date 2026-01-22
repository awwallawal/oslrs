import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

interface UseReAuthReturn {
  password: string;
  error: string | null;
  isLoading: boolean;
  isOpen: boolean;
  pendingAction: string | null;
  setPassword: (password: string) => void;
  open: (action: string) => void;
  close: () => void;
  submit: () => Promise<boolean>;
  reset: () => void;
}

/**
 * Hook for handling re-authentication for sensitive actions
 * Used when a "Remember Me" session attempts to perform sensitive actions
 */
export function useReAuth(): UseReAuthReturn {
  const { reAuthenticate, requiresReAuth, reAuthAction } = useAuth();

  const [password, setPasswordState] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Open re-auth modal
  const open = useCallback((action: string) => {
    setIsOpen(true);
    setPendingAction(action);
    setPasswordState(''); // Use state setter directly for stability
    setError(null);
  }, []);

  // Close re-auth modal
  const close = useCallback(() => {
    setIsOpen(false);
    setPendingAction(null);
    setPasswordState('');
    setError(null);
  }, []);

  // Set password
  const setPassword = useCallback((value: string) => {
    setPasswordState(value);
    setError(null);
  }, []);

  // Submit re-authentication
  const submit = useCallback(async (): Promise<boolean> => {
    if (!password) {
      setError('Password is required');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const success = await reAuthenticate(password);

      if (success) {
        close();
        return true;
      } else {
        setError('Incorrect password. Please try again.');
        setPasswordState('');
        return false;
      }
    } catch {
      setError('Re-authentication failed. Please try again.');
      setPasswordState('');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [password, reAuthenticate, close]);

  // Reset state
  const reset = useCallback(() => {
    setIsOpen(false);
    setPendingAction(null);
    setPasswordState('');
    setError(null);
    setIsLoading(false);
  }, []);

  // Auto-open when re-auth is required from context
  if (requiresReAuth && !isOpen && reAuthAction) {
    setIsOpen(true);
    setPendingAction(reAuthAction);
  }

  return {
    password,
    error,
    isLoading,
    isOpen: isOpen || requiresReAuth,
    pendingAction: pendingAction || reAuthAction,
    setPassword,
    open,
    close,
    submit,
    reset,
  };
}

/**
 * Higher-order function to wrap API calls that might require re-authentication
 * Returns a function that will trigger re-auth flow if needed
 */
export function withReAuth<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  actionDescription: string,
  onReAuthRequired: (action: string) => void
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    try {
      return await fn(...args);
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'AUTH_REAUTH_REQUIRED') {
        onReAuthRequired(actionDescription);
        throw error;
      }
      throw error;
    }
  };
}

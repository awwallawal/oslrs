import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { verifyGoogleToken } from '../api/google-auth.api';
import { AuthApiError } from '../api/auth.api';
import type { CredentialResponse } from '@react-oauth/google';

interface UseGoogleAuthOptions {
  /** Where to redirect after successful auth. Defaults to '/dashboard' */
  redirectTo?: string;
  /** Called on error with the error message */
  onError?: (message: string, code?: string) => void;
}

interface UseGoogleAuthReturn {
  handleGoogleSuccess: (credentialResponse: CredentialResponse) => void;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for handling Google OAuth login/registration flow.
 * Works with the GoogleLogin component from @react-oauth/google.
 */
export function useGoogleAuth(options: UseGoogleAuthOptions = {}): UseGoogleAuthReturn {
  const { redirectTo = '/dashboard', onError } = options;
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSuccess = useCallback(async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse.credential;
    if (!idToken) {
      const message = 'Google sign-in failed. No credentials received.';
      setError(message);
      onError?.(message);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await verifyGoogleToken(idToken);

      // Use the AuthContext to set the authenticated state
      loginWithGoogle(response);

      // Redirect to dashboard or profile completion
      navigate(redirectTo, { replace: true });
    } catch (err) {
      let message = 'Google sign-in failed. Please try again or use email registration.';
      let code: string | undefined;

      if (err instanceof AuthApiError) {
        code = err.code;
        if (err.code === 'AUTH_EMAIL_ONLY') {
          message = 'This email is already registered with email/password. Please use email login.';
        } else if (err.code === 'AUTH_ACCOUNT_SUSPENDED') {
          message = 'Your account has been suspended. Please contact support.';
        } else if (err.code === 'AUTH_RATE_LIMIT_EXCEEDED') {
          message = 'Too many attempts. Please try again later.';
        }
      }

      setError(message);
      onError?.(message, code);
    } finally {
      setIsLoading(false);
    }
  }, [navigate, redirectTo, loginWithGoogle, onError]);

  return { handleGoogleSuccess, isLoading, error };
}

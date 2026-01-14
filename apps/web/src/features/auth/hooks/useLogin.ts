import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginRequestSchema } from '@oslsr/types';
import { useAuth } from '../context/AuthContext';
import { AuthApiError } from '../api/auth.api';

interface LoginFormData {
  email: string;
  password: string;
  captchaToken: string;
  rememberMe: boolean;
}

interface FieldErrors {
  email?: string;
  password?: string;
  captchaToken?: string;
}

interface UseLoginOptions {
  type: 'staff' | 'public';
  redirectTo?: string;
}

interface UseLoginReturn {
  formData: LoginFormData;
  errors: FieldErrors;
  apiError: string | null;
  isLoading: boolean;
  isRateLimited: boolean;
  rateLimitReset: number | null;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  setCaptchaToken: (token: string) => void;
  setRememberMe: (value: boolean) => void;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  resetCaptcha: () => void;
  clearErrors: () => void;
}

export function useLogin({ type, redirectTo = '/' }: UseLoginOptions): UseLoginReturn {
  const navigate = useNavigate();
  const { loginStaff, loginPublic, isLoading, error: authError, clearError } = useAuth();

  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
    captchaToken: '',
    rememberMe: false,
  });

  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitReset, setRateLimitReset] = useState<number | null>(null);

  // Update form fields
  const setEmail = useCallback((email: string) => {
    setFormData(prev => ({ ...prev, email }));
    setErrors(prev => ({ ...prev, email: undefined }));
    setApiError(null);
  }, []);

  const setPassword = useCallback((password: string) => {
    setFormData(prev => ({ ...prev, password }));
    setErrors(prev => ({ ...prev, password: undefined }));
    setApiError(null);
  }, []);

  const setCaptchaToken = useCallback((captchaToken: string) => {
    setFormData(prev => ({ ...prev, captchaToken }));
    setErrors(prev => ({ ...prev, captchaToken: undefined }));
    setApiError(null);
  }, []);

  const setRememberMe = useCallback((rememberMe: boolean) => {
    setFormData(prev => ({ ...prev, rememberMe }));
  }, []);

  // Reset CAPTCHA (when verification fails or expires)
  const resetCaptcha = useCallback(() => {
    setFormData(prev => ({ ...prev, captchaToken: '' }));
    setErrors(prev => ({ ...prev, captchaToken: undefined }));
  }, []);

  // Clear all errors
  const clearErrors = useCallback(() => {
    setErrors({});
    setApiError(null);
    clearError();
  }, [clearError]);

  // Handle form submission
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // Reset rate limit state
    setIsRateLimited(false);
    setRateLimitReset(null);

    // Validate form data
    const validation = loginRequestSchema.safeParse(formData);

    if (!validation.success) {
      const fieldErrors: FieldErrors = {};
      validation.error.errors.forEach((err) => {
        const field = err.path[0] as keyof FieldErrors;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    try {
      const loginFn = type === 'staff' ? loginStaff : loginPublic;
      await loginFn(validation.data);

      // Navigate to redirect URL on success
      navigate(redirectTo, { replace: true });
    } catch (error) {
      // Handle specific error codes
      if (error instanceof AuthApiError) {
        switch (error.code) {
          case 'AUTH_RATE_LIMIT_EXCEEDED':
          case 'AUTH_ACCOUNT_LOCKED':
            setIsRateLimited(true);
            // Parse retry-after from error details if available
            if (error.details?.retryAfter) {
              setRateLimitReset(error.details.retryAfter as number);
            }
            setApiError(error.message);
            break;

          case 'AUTH_CAPTCHA_FAILED':
            setErrors({ captchaToken: 'CAPTCHA verification failed. Please try again.' });
            resetCaptcha();
            break;

          case 'AUTH_INVALID_CREDENTIALS':
            setApiError('Invalid email or password. Please check your credentials.');
            // Clear password but keep email for retry
            setFormData(prev => ({ ...prev, password: '' }));
            resetCaptcha();
            break;

          case 'AUTH_ACCOUNT_SUSPENDED':
            setApiError('Your account has been suspended. Please contact support.');
            break;

          default:
            setApiError(error.message);
        }
      } else {
        setApiError('An unexpected error occurred. Please try again.');
      }
    }
  }, [formData, type, loginStaff, loginPublic, navigate, redirectTo, resetCaptcha]);

  return {
    formData,
    errors,
    apiError: apiError || authError,
    isLoading,
    isRateLimited,
    rateLimitReset,
    setEmail,
    setPassword,
    setCaptchaToken,
    setRememberMe,
    handleSubmit,
    resetCaptcha,
    clearErrors,
  };
}

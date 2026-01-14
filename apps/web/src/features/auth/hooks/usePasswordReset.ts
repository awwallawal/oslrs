import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
} from '@oslsr/types';
import * as authApi from '../api/auth.api';
import { AuthApiError } from '../api/auth.api';

// ===========================================
// useForgotPassword Hook
// ===========================================

interface ForgotPasswordFormData {
  email: string;
  captchaToken: string;
}

interface ForgotPasswordErrors {
  email?: string;
  captchaToken?: string;
}

interface UseForgotPasswordReturn {
  formData: ForgotPasswordFormData;
  errors: ForgotPasswordErrors;
  apiError: string | null;
  isLoading: boolean;
  isSuccess: boolean;
  isRateLimited: boolean;
  setEmail: (email: string) => void;
  setCaptchaToken: (token: string) => void;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  resetCaptcha: () => void;
  reset: () => void;
}

export function useForgotPassword(): UseForgotPasswordReturn {
  const [formData, setFormData] = useState<ForgotPasswordFormData>({
    email: '',
    captchaToken: '',
  });

  const [errors, setErrors] = useState<ForgotPasswordErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);

  const setEmail = useCallback((email: string) => {
    setFormData(prev => ({ ...prev, email }));
    setErrors(prev => ({ ...prev, email: undefined }));
    setApiError(null);
  }, []);

  const setCaptchaToken = useCallback((captchaToken: string) => {
    setFormData(prev => ({ ...prev, captchaToken }));
    setErrors(prev => ({ ...prev, captchaToken: undefined }));
    setApiError(null);
  }, []);

  const resetCaptcha = useCallback(() => {
    setFormData(prev => ({ ...prev, captchaToken: '' }));
    setErrors(prev => ({ ...prev, captchaToken: undefined }));
  }, []);

  const reset = useCallback(() => {
    setFormData({ email: '', captchaToken: '' });
    setErrors({});
    setApiError(null);
    setIsLoading(false);
    setIsSuccess(false);
    setIsRateLimited(false);
  }, []);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // Validate form data
    const validation = forgotPasswordRequestSchema.safeParse(formData);

    if (!validation.success) {
      const fieldErrors: ForgotPasswordErrors = {};
      validation.error.errors.forEach((err) => {
        const field = err.path[0] as keyof ForgotPasswordErrors;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    setApiError(null);
    setIsRateLimited(false);

    try {
      await authApi.forgotPassword(validation.data);
      setIsSuccess(true);
    } catch (error) {
      if (error instanceof AuthApiError) {
        switch (error.code) {
          case 'AUTH_RESET_RATE_LIMITED':
            setIsRateLimited(true);
            setApiError('Too many password reset requests. Please try again later.');
            break;

          case 'AUTH_CAPTCHA_FAILED':
            setErrors({ captchaToken: 'CAPTCHA verification failed. Please try again.' });
            resetCaptcha();
            break;

          default:
            setApiError(error.message);
        }
      } else {
        setApiError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [formData, resetCaptcha]);

  return {
    formData,
    errors,
    apiError,
    isLoading,
    isSuccess,
    isRateLimited,
    setEmail,
    setCaptchaToken,
    handleSubmit,
    resetCaptcha,
    reset,
  };
}

// ===========================================
// useResetPassword Hook
// ===========================================

interface ResetPasswordFormData {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

interface ResetPasswordErrors {
  token?: string;
  newPassword?: string;
  confirmPassword?: string;
}

interface UseResetPasswordOptions {
  token: string;
  redirectTo?: string;
}

interface UseResetPasswordReturn {
  formData: ResetPasswordFormData;
  errors: ResetPasswordErrors;
  apiError: string | null;
  isLoading: boolean;
  isValidating: boolean;
  isValidToken: boolean | null;
  isSuccess: boolean;
  setNewPassword: (password: string) => void;
  setConfirmPassword: (password: string) => void;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
}

export function useResetPassword({ token, redirectTo = '/login' }: UseResetPasswordOptions): UseResetPasswordReturn {
  const navigate = useNavigate();

  const [formData, setFormData] = useState<ResetPasswordFormData>({
    token,
    newPassword: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<ResetPasswordErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setIsValidToken(false);
        setIsValidating(false);
        return;
      }

      try {
        const result = await authApi.validateResetToken(token);
        setIsValidToken(result.valid);
      } catch (error) {
        setIsValidToken(false);
        if (error instanceof AuthApiError) {
          switch (error.code) {
            case 'AUTH_RESET_TOKEN_EXPIRED':
              setApiError('This password reset link has expired. Please request a new one.');
              break;
            case 'AUTH_RESET_TOKEN_INVALID':
              setApiError('This password reset link is invalid or has already been used.');
              break;
            default:
              setApiError(error.message);
          }
        } else {
          setApiError('Unable to validate reset link. Please try again.');
        }
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const setNewPassword = useCallback((newPassword: string) => {
    setFormData(prev => ({ ...prev, newPassword }));
    setErrors(prev => ({ ...prev, newPassword: undefined }));
    setApiError(null);
  }, []);

  const setConfirmPassword = useCallback((confirmPassword: string) => {
    setFormData(prev => ({ ...prev, confirmPassword }));
    setErrors(prev => ({ ...prev, confirmPassword: undefined }));
    setApiError(null);
  }, []);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // Validate form data
    const validation = resetPasswordRequestSchema.safeParse(formData);

    if (!validation.success) {
      const fieldErrors: ResetPasswordErrors = {};
      validation.error.errors.forEach((err) => {
        const field = err.path[0] as keyof ResetPasswordErrors;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    setApiError(null);

    try {
      await authApi.resetPassword({
        token: validation.data.token,
        newPassword: validation.data.newPassword,
      });

      setIsSuccess(true);

      // Redirect to login after brief delay
      setTimeout(() => {
        navigate(redirectTo, { replace: true });
      }, 2000);
    } catch (error) {
      if (error instanceof AuthApiError) {
        switch (error.code) {
          case 'AUTH_RESET_TOKEN_EXPIRED':
            setApiError('This password reset link has expired. Please request a new one.');
            setIsValidToken(false);
            break;
          case 'AUTH_RESET_TOKEN_INVALID':
            setApiError('This password reset link is invalid or has already been used.');
            setIsValidToken(false);
            break;
          default:
            setApiError(error.message);
        }
      } else {
        setApiError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [formData, navigate, redirectTo]);

  return {
    formData,
    errors,
    apiError,
    isLoading,
    isValidating,
    isValidToken,
    isSuccess,
    setNewPassword,
    setConfirmPassword,
    handleSubmit,
  };
}

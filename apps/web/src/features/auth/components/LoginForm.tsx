import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { HCaptcha } from './HCaptcha';
import { useLogin } from '../hooks/useLogin';

interface LoginFormProps {
  type: 'staff' | 'public';
  redirectTo?: string;
}

/**
 * Login form component with email, password, CAPTCHA, and Remember Me
 *
 * Supports both staff and public user login flows.
 * Implements rate limiting feedback and error handling.
 */
export function LoginForm({ type, redirectTo }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(false);

  const {
    formData,
    errors,
    apiError,
    isLoading,
    isRateLimited,
    rateLimitReset,
    setEmail,
    setPassword,
    setCaptchaToken,
    setRememberMe,
    handleSubmit,
    resetCaptcha,
  } = useLogin({ type, redirectTo });

  // Handle CAPTCHA verification
  const handleCaptchaVerify = (token: string) => {
    setCaptchaToken(token);
  };

  // Handle CAPTCHA expiration
  const handleCaptchaExpire = () => {
    resetCaptcha();
    setCaptchaReset(prev => !prev);
  };

  // Format remaining time for rate limit
  const formatRateLimitTime = (seconds: number): string => {
    if (seconds > 60) {
      const minutes = Math.ceil(seconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    return `${seconds} seconds`;
  };

  const isStaff = type === 'staff';
  const title = isStaff ? 'Staff Login' : 'Login';
  const subtitle = isStaff
    ? 'Access the OSLSR administrative portal'
    : 'Access your OSLSR account';

  return (
    <div className="w-full max-w-md">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-h1 text-primary-700 font-brand mb-2">OSLSR</h1>
        <h2 className="text-xl font-semibold text-neutral-900 mb-1">{title}</h2>
        <p className="text-neutral-600">{subtitle}</p>
      </div>

      {/* Error Alert */}
      {apiError && (
        <div className="mb-6 p-4 bg-error-100 border border-error-600/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-error-600 font-medium">Login Failed</p>
            <p className="text-error-600/80 text-sm">{apiError}</p>
            {isRateLimited && rateLimitReset && (
              <p className="text-error-600/80 text-sm mt-1">
                Please try again in {formatRateLimitTime(rateLimitReset)}.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email Field */}
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-neutral-700"
          >
            Email Address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading || isRateLimited}
            className={`
              w-full px-4 py-3 rounded-lg border transition-colors
              ${errors.email
                ? 'border-error-600 focus:ring-error-600 focus:border-error-600'
                : 'border-neutral-300 focus:ring-primary-500 focus:border-primary-500'
              }
              disabled:bg-neutral-100 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2
            `}
            placeholder="you@example.com"
          />
          {errors.email && (
            <p className="text-error-600 text-sm">{errors.email}</p>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-neutral-700"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={formData.password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading || isRateLimited}
              className={`
                w-full px-4 py-3 pr-12 rounded-lg border transition-colors
                ${errors.password
                  ? 'border-error-600 focus:ring-error-600 focus:border-error-600'
                  : 'border-neutral-300 focus:ring-primary-500 focus:border-primary-500'
                }
                disabled:bg-neutral-100 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2
              `}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoading || isRateLimited}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700 disabled:cursor-not-allowed"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-error-600 text-sm">{errors.password}</p>
          )}
        </div>

        {/* Remember Me & Forgot Password */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isLoading || isRateLimited}
              className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-neutral-700">Remember me</span>
          </label>
          <Link
            to="/forgot-password"
            className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {/* CAPTCHA */}
        <div className="py-2">
          <HCaptcha
            onVerify={handleCaptchaVerify}
            onExpire={handleCaptchaExpire}
            error={errors.captchaToken}
            reset={captchaReset}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || isRateLimited || !formData.captchaToken}
          className={`
            w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors
            flex items-center justify-center gap-2
            ${isLoading || isRateLimited || !formData.captchaToken
              ? 'bg-neutral-400 cursor-not-allowed'
              : 'bg-primary-600 hover:bg-primary-700 active:bg-primary-800'
            }
          `}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </button>

        {/* Remember Me Info */}
        <p className="text-xs text-neutral-500 text-center">
          {formData.rememberMe
            ? 'Your session will last 30 days. You may need to re-enter your password for sensitive actions.'
            : 'Your session will expire after 8 hours of inactivity.'
          }
        </p>
      </form>

      {/* Login Type Toggle */}
      {!isStaff ? (
        <p className="mt-6 text-center text-sm text-neutral-600">
          Staff member?{' '}
          <Link
            to="/staff/login"
            className="text-primary-600 hover:text-primary-700 font-medium hover:underline"
          >
            Login here
          </Link>
        </p>
      ) : (
        <p className="mt-6 text-center text-sm text-neutral-600">
          <Link
            to="/login"
            className="text-primary-600 hover:text-primary-700 font-medium hover:underline"
          >
            Back to public login
          </Link>
        </p>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, AlertCircle, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { HCaptcha } from '../components/HCaptcha';
import { useForgotPassword } from '../hooks/usePasswordReset';

/**
 * Forgot Password page
 *
 * Allows users to request a password reset link via email.
 * Shows success message without revealing if email exists (security).
 */
export default function ForgotPasswordPage() {
  const [captchaReset, setCaptchaReset] = useState(false);

  const {
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
  } = useForgotPassword();

  // Handle CAPTCHA verification
  const handleCaptchaVerify = (token: string) => {
    setCaptchaToken(token);
  };

  // Handle CAPTCHA expiration
  const handleCaptchaExpire = () => {
    resetCaptcha();
    setCaptchaReset(prev => !prev);
  };

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col">
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <div className="mx-auto w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-8 h-8 text-success-600" />
            </div>
            <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
              Check Your Email
            </h1>
            <p className="text-neutral-600 mb-6">
              If an account exists for <span className="font-medium">{formData.email}</span>,
              you will receive a password reset link shortly.
            </p>
            <p className="text-sm text-neutral-500 mb-8">
              The link will expire in 1 hour. Check your spam folder if you don't see the email.
            </p>
            <div className="space-y-3">
              <Link
                to="/login"
                className="block w-full py-3 px-4 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors"
              >
                Return to Login
              </Link>
              <button
                onClick={reset}
                className="block w-full py-3 px-4 text-primary-600 hover:text-primary-700 font-medium hover:underline"
              >
                Try a different email
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Back Link */}
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-primary-600" />
            </div>
            <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
              Forgot Password?
            </h1>
            <p className="text-neutral-600">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {/* Error Alert */}
          {apiError && (
            <div className="mb-6 p-4 bg-error-100 border border-error-600/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-error-600 font-medium">Error</p>
                <p className="text-error-600/80 text-sm">{apiError}</p>
              </div>
            </div>
          )}

          {/* Form */}
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
                    ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
                    : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
                  }
                  disabled:bg-neutral-100 disabled:cursor-not-allowed
                  focus:outline-none focus-visible:ring-2
                `}
                placeholder="you@example.com"
              />
              {errors.email && (
                <p className="text-error-600 text-sm">{errors.email}</p>
              )}
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
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </form>
        </div>
      </main>

      <footer className="py-4 text-center text-sm text-neutral-500">
        <p>&copy; {new Date().getFullYear()} Oyo State Labour & Skills Registry</p>
      </footer>
    </div>
  );
}

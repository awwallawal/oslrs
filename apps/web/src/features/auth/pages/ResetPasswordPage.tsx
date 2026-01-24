import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { useResetPassword } from '../hooks/usePasswordReset';
import { SkeletonForm } from '../../../components/skeletons';
import { PasswordRequirements } from '../components/PasswordRequirements';

/**
 * Reset Password page
 *
 * Allows users to set a new password using a reset token.
 * Validates token on load and shows appropriate feedback.
 */
export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
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
  } = useResetPassword({ token: token || '', redirectTo: '/login' });

  // Loading state while validating token
  if (isValidating) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-4" />
            <p className="text-neutral-600">Validating reset link...</p>
          </div>
          <SkeletonForm fields={2} />
        </div>
      </div>
    );
  }

  // Invalid or expired token
  if (isValidToken === false) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col">
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <div className="mx-auto w-16 h-16 bg-error-100 rounded-full flex items-center justify-center mb-6">
              <XCircle className="w-8 h-8 text-error-600" />
            </div>
            <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
              Invalid or Expired Link
            </h1>
            <p className="text-neutral-600 mb-2">
              {apiError || 'This password reset link is invalid or has expired.'}
            </p>
            <p className="text-sm text-neutral-500 mb-8">
              Password reset links are valid for 1 hour and can only be used once.
            </p>
            <div className="space-y-3">
              <Link
                to="/forgot-password"
                className="block w-full py-3 px-4 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors"
              >
                Request New Reset Link
              </Link>
              <Link
                to="/login"
                className="block w-full py-3 px-4 text-primary-600 hover:text-primary-700 font-medium hover:underline"
              >
                Return to Login
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

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
              Password Reset Successful
            </h1>
            <p className="text-neutral-600 mb-6">
              Your password has been updated successfully.
              You will be redirected to the login page shortly.
            </p>
            <Link
              to="/login"
              className="block w-full py-3 px-4 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors"
            >
              Continue to Login
            </Link>
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
              <Lock className="w-8 h-8 text-primary-600" />
            </div>
            <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
              Reset Your Password
            </h1>
            <p className="text-neutral-600">
              Create a new secure password for your account.
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
            {/* New Password Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-neutral-700"
              >
                New Password
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={formData.newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isLoading}
                  className={`
                    w-full px-4 py-3 pr-12 rounded-lg border transition-colors
                    ${errors.newPassword
                      ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
                      : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
                    }
                    disabled:bg-neutral-100 disabled:cursor-not-allowed
                    focus:outline-none focus-visible:ring-2
                  `}
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
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
              {errors.newPassword && (
                <p className="text-error-600 text-sm">{errors.newPassword}</p>
              )}

              {/* Password Requirements - Always visible */}
              <PasswordRequirements
                password={formData.newPassword}
                showAlways={true}
                className="mt-3"
              />
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-neutral-700"
              >
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  className={`
                    w-full px-4 py-3 pr-12 rounded-lg border transition-colors
                    ${errors.confirmPassword
                      ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
                      : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
                    }
                    disabled:bg-neutral-100 disabled:cursor-not-allowed
                    focus:outline-none focus-visible:ring-2
                  `}
                  placeholder="Confirm new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700 disabled:cursor-not-allowed"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-error-600 text-sm">{errors.confirmPassword}</p>
              )}
              {formData.confirmPassword && !errors.confirmPassword && formData.newPassword === formData.confirmPassword && (
                <p className="text-success-600 text-sm flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  Passwords match
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`
                w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors
                flex items-center justify-center gap-2
                ${isLoading
                  ? 'bg-neutral-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700 active:bg-primary-800'
                }
              `}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset Password'
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

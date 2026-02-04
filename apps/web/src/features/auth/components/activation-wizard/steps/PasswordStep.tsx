import { useState } from 'react';
import { Eye, EyeOff, CheckCircle } from 'lucide-react';
import { cn } from '../../../../../lib/utils';
import { PasswordRequirements } from '../../PasswordRequirements';
import type { StepRenderProps } from '../ActivationWizard';

/**
 * Step 1: Password
 *
 * Collects password and confirm password with real-time validation.
 * Reuses existing PasswordRequirements component for strength feedback.
 */
export function PasswordStep({
  formData,
  updateFormData,
  errors,
  isSubmitting,
}: StepRenderProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordsMatch =
    formData.password.length > 0 &&
    formData.confirmPassword.length > 0 &&
    formData.password === formData.confirmPassword;

  return (
    <div className="space-y-5">
      {/* Step Description */}
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-neutral-900">
          Create Your Password
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Choose a strong password to secure your account.
        </p>
      </div>

      {/* Password Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-neutral-700"
        >
          Password <span className="text-error-500">*</span>
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={formData.password}
            onChange={(e) => updateFormData({ password: e.target.value })}
            disabled={isSubmitting}
            className={cn(
              'w-full px-4 py-3 pr-12 rounded-lg border transition-colors',
              'focus:outline-none focus-visible:ring-2',
              'disabled:bg-neutral-100 disabled:cursor-not-allowed',
              errors.password
                ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
                : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
            )}
            placeholder="Enter your password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={isSubmitting}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700 disabled:cursor-not-allowed"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Eye className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
        {errors.password && (
          <p id="password-error" className="text-error-600 text-sm">
            {errors.password}
          </p>
        )}

        {/* Password Requirements */}
        <PasswordRequirements
          password={formData.password}
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
          Confirm Password <span className="text-error-500">*</span>
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={(e) => updateFormData({ confirmPassword: e.target.value })}
            disabled={isSubmitting}
            className={cn(
              'w-full px-4 py-3 pr-12 rounded-lg border transition-colors',
              'focus:outline-none focus-visible:ring-2',
              'disabled:bg-neutral-100 disabled:cursor-not-allowed',
              errors.confirmPassword
                ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
                : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
            )}
            placeholder="Confirm your password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={
              errors.confirmPassword ? 'confirmPassword-error' : undefined
            }
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            disabled={isSubmitting}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700 disabled:cursor-not-allowed"
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
          >
            {showConfirmPassword ? (
              <EyeOff className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Eye className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
        {errors.confirmPassword && (
          <p id="confirmPassword-error" className="text-error-600 text-sm">
            {errors.confirmPassword}
          </p>
        )}
        {passwordsMatch && !errors.confirmPassword && (
          <p className="text-success-600 text-sm flex items-center gap-1">
            <CheckCircle className="w-4 h-4" aria-hidden="true" />
            Passwords match
          </p>
        )}
      </div>
    </div>
  );
}

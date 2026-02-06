import { useMemo } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { modulus11Check } from '@oslsr/utils/src/validation';
import { cn } from '../../../../../lib/utils';
import type { StepRenderProps } from '../ActivationWizard';

/**
 * Step 2: Personal Info
 *
 * Collects NIN, Date of Birth, and Home Address.
 * NIN requires 11 digits with valid Modulus 11 checksum (validated by schema).
 */
export function PersonalInfoStep({
  formData,
  updateFormData,
  errors,
  isSubmitting,
}: StepRenderProps) {
  // Real-time NIN checksum validation (only when 11 digits entered)
  const ninStatus = useMemo(() => {
    if (formData.nin.length < 11) return 'incomplete';
    return modulus11Check(formData.nin) ? 'valid' : 'invalid';
  }, [formData.nin]);

  // Calculate reasonable date bounds for DOB
  // Workforce age: 15-70 years
  const { maxDate, minDate } = useMemo(() => {
    const now = new Date();
    return {
      maxDate: new Date(now.getFullYear() - 15, now.getMonth(), now.getDate())
        .toISOString()
        .split('T')[0],
      minDate: new Date(now.getFullYear() - 70, now.getMonth(), now.getDate())
        .toISOString()
        .split('T')[0],
    };
  }, []);

  // Real-time DOB age validation
  const dobStatus = useMemo(() => {
    if (!formData.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(formData.dateOfBirth)) return 'empty';
    const date = new Date(formData.dateOfBirth);
    if (isNaN(date.getTime())) return 'invalid';
    const now = new Date();
    const age = now.getFullYear() - date.getFullYear() -
      (now < new Date(now.getFullYear(), date.getMonth(), date.getDate()) ? 1 : 0);
    if (age < 15) return 'too-young';
    if (age > 70) return 'too-old';
    return 'valid';
  }, [formData.dateOfBirth]);

  return (
    <div className="space-y-5">
      {/* Step Description */}
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-neutral-900">
          Personal Information
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Provide your identification and contact details.
        </p>
      </div>

      {/* NIN Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="nin"
          className="block text-sm font-medium text-neutral-700"
        >
          National Identification Number (NIN) <span className="text-error-500">*</span>
        </label>
        <input
          id="nin"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={11}
          autoComplete="off"
          value={formData.nin}
          onChange={(e) => {
            // Only allow digits
            const value = e.target.value.replace(/\D/g, '');
            updateFormData({ nin: value });
          }}
          disabled={isSubmitting}
          className={cn(
            'w-full px-4 py-3 rounded-lg border transition-colors',
            'focus:outline-none focus-visible:ring-2',
            'disabled:bg-neutral-100 disabled:cursor-not-allowed',
            errors.nin || ninStatus === 'invalid'
              ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
              : ninStatus === 'valid'
                ? 'border-success-500 focus-visible:ring-success-500 focus:border-success-500'
                : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
          )}
          placeholder="Enter your 11-digit NIN"
          aria-invalid={!!errors.nin}
          aria-describedby={errors.nin ? 'nin-error' : 'nin-hint'}
        />
        {errors.nin ? (
          <p id="nin-error" className="text-error-600 text-sm">
            {errors.nin}
          </p>
        ) : ninStatus === 'valid' ? (
          <p id="nin-hint" className="flex items-center gap-1 text-success-600 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Valid NIN
          </p>
        ) : ninStatus === 'invalid' ? (
          <p id="nin-hint" className="flex items-center gap-1 text-error-600 text-sm">
            <XCircle className="w-4 h-4" />
            Invalid NIN — please check for typos
          </p>
        ) : (
          <p id="nin-hint" className="text-neutral-500 text-xs">
            Your 11-digit National Identification Number from NIMC
          </p>
        )}
        {/* Character count indicator */}
        <div className="text-right">
          <span
            className={cn(
              'text-xs',
              ninStatus === 'valid' ? 'text-success-600' :
              ninStatus === 'invalid' ? 'text-error-600' :
              'text-neutral-400'
            )}
          >
            {formData.nin.length}/11 digits
          </span>
        </div>
      </div>

      {/* Date of Birth Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="dateOfBirth"
          className="block text-sm font-medium text-neutral-700"
        >
          Date of Birth <span className="text-error-500">*</span>
        </label>
        <input
          id="dateOfBirth"
          type="date"
          min={minDate}
          max={maxDate}
          value={formData.dateOfBirth}
          onChange={(e) => updateFormData({ dateOfBirth: e.target.value })}
          disabled={isSubmitting}
          className={cn(
            'w-full px-4 py-3 rounded-lg border transition-colors',
            'focus:outline-none focus-visible:ring-2',
            'disabled:bg-neutral-100 disabled:cursor-not-allowed',
            errors.dateOfBirth || dobStatus === 'too-young' || dobStatus === 'too-old' || dobStatus === 'invalid'
              ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
              : dobStatus === 'valid'
                ? 'border-success-500 focus-visible:ring-success-500 focus:border-success-500'
                : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
          )}
          aria-invalid={!!errors.dateOfBirth || dobStatus === 'too-young' || dobStatus === 'too-old'}
          aria-describedby={errors.dateOfBirth ? 'dob-error' : 'dob-hint'}
        />
        {errors.dateOfBirth ? (
          <p id="dob-error" className="text-error-600 text-sm">
            {errors.dateOfBirth}
          </p>
        ) : dobStatus === 'valid' ? (
          <p id="dob-hint" className="flex items-center gap-1 text-success-600 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Valid date of birth
          </p>
        ) : dobStatus === 'too-young' ? (
          <p id="dob-hint" className="flex items-center gap-1 text-error-600 text-sm">
            <XCircle className="w-4 h-4" />
            Must be at least 15 years old
          </p>
        ) : dobStatus === 'too-old' ? (
          <p id="dob-hint" className="flex items-center gap-1 text-error-600 text-sm">
            <XCircle className="w-4 h-4" />
            Age cannot exceed 70 years
          </p>
        ) : dobStatus === 'invalid' ? (
          <p id="dob-hint" className="flex items-center gap-1 text-error-600 text-sm">
            <XCircle className="w-4 h-4" />
            Invalid date
          </p>
        ) : (
          <p id="dob-hint" className="text-neutral-500 text-xs">
            You must be between 15 and 70 years old
          </p>
        )}
      </div>

      {/* Home Address Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="homeAddress"
          className="block text-sm font-medium text-neutral-700"
        >
          Home Address <span className="text-error-500">*</span>
        </label>
        <textarea
          id="homeAddress"
          rows={3}
          value={formData.homeAddress}
          onChange={(e) => updateFormData({ homeAddress: e.target.value })}
          disabled={isSubmitting}
          className={cn(
            'w-full px-4 py-3 rounded-lg border transition-colors resize-none',
            'focus:outline-none focus-visible:ring-2',
            'disabled:bg-neutral-100 disabled:cursor-not-allowed',
            errors.homeAddress
              ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
              : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
          )}
          placeholder="Enter your full residential address"
          aria-invalid={!!errors.homeAddress}
          aria-describedby={errors.homeAddress ? 'address-error' : 'address-hint'}
        />
        {errors.homeAddress ? (
          <p id="address-error" className="text-error-600 text-sm">
            {errors.homeAddress}
          </p>
        ) : (
          <p id="address-hint" className="text-neutral-500 text-xs">
            Include street, city, and state
          </p>
        )}
      </div>
    </div>
  );
}

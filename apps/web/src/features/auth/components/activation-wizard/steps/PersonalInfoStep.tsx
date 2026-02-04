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
  // Calculate reasonable date bounds for DOB
  // Minimum age: 18 years, Maximum age: 100 years
  const today = new Date();
  const maxDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
    .toISOString()
    .split('T')[0];
  const minDate = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate())
    .toISOString()
    .split('T')[0];

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
            errors.nin
              ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
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
              formData.nin.length === 11 ? 'text-success-600' : 'text-neutral-400'
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
            errors.dateOfBirth
              ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
              : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
          )}
          aria-invalid={!!errors.dateOfBirth}
          aria-describedby={errors.dateOfBirth ? 'dob-error' : undefined}
        />
        {errors.dateOfBirth && (
          <p id="dob-error" className="text-error-600 text-sm">
            {errors.dateOfBirth}
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

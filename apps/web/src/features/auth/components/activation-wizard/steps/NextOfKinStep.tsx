import { cn } from '../../../../../lib/utils';
import type { StepRenderProps } from '../ActivationWizard';

/**
 * Step 4: Next of Kin
 *
 * Collects emergency contact information.
 * Phone must be at least 10 characters (Nigerian format).
 */
export function NextOfKinStep({
  formData,
  updateFormData,
  errors,
  isSubmitting,
}: StepRenderProps) {
  /**
   * Format phone number as user types
   * Allows digits, spaces, hyphens, and leading +
   */
  const handlePhoneChange = (value: string) => {
    // Allow only digits, spaces, hyphens, parentheses, and leading +
    const formatted = value.replace(/[^\d\s\-+()]/g, '');
    updateFormData({ nextOfKinPhone: formatted });
  };

  return (
    <div className="space-y-5">
      {/* Step Description */}
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-neutral-900">
          Next of Kin
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Provide emergency contact information.
        </p>
      </div>

      {/* Next of Kin Name Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="nextOfKinName"
          className="block text-sm font-medium text-neutral-700"
        >
          Next of Kin Full Name <span className="text-error-500">*</span>
        </label>
        <input
          id="nextOfKinName"
          type="text"
          autoComplete="off"
          value={formData.nextOfKinName}
          onChange={(e) => updateFormData({ nextOfKinName: e.target.value })}
          disabled={isSubmitting}
          className={cn(
            'w-full px-4 py-3 rounded-lg border transition-colors',
            'focus:outline-none focus-visible:ring-2',
            'disabled:bg-neutral-100 disabled:cursor-not-allowed',
            errors.nextOfKinName
              ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
              : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
          )}
          placeholder="Enter full name of next of kin"
          aria-invalid={!!errors.nextOfKinName}
          aria-describedby={errors.nextOfKinName ? 'nextOfKinName-error' : 'nextOfKinName-hint'}
        />
        {errors.nextOfKinName ? (
          <p id="nextOfKinName-error" className="text-error-600 text-sm">
            {errors.nextOfKinName}
          </p>
        ) : (
          <p id="nextOfKinName-hint" className="text-neutral-500 text-xs">
            Full name of a family member or trusted person
          </p>
        )}
      </div>

      {/* Next of Kin Phone Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="nextOfKinPhone"
          className="block text-sm font-medium text-neutral-700"
        >
          Next of Kin Phone Number <span className="text-error-500">*</span>
        </label>
        <input
          id="nextOfKinPhone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={formData.nextOfKinPhone}
          onChange={(e) => handlePhoneChange(e.target.value)}
          disabled={isSubmitting}
          className={cn(
            'w-full px-4 py-3 rounded-lg border transition-colors',
            'focus:outline-none focus-visible:ring-2',
            'disabled:bg-neutral-100 disabled:cursor-not-allowed',
            errors.nextOfKinPhone
              ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
              : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
          )}
          placeholder="e.g., 08012345678 or +234 801 234 5678"
          aria-invalid={!!errors.nextOfKinPhone}
          aria-describedby={errors.nextOfKinPhone ? 'nextOfKinPhone-error' : 'nextOfKinPhone-hint'}
        />
        {errors.nextOfKinPhone ? (
          <p id="nextOfKinPhone-error" className="text-error-600 text-sm">
            {errors.nextOfKinPhone}
          </p>
        ) : (
          <p id="nextOfKinPhone-hint" className="text-neutral-500 text-xs">
            Nigerian phone number (e.g., 08012345678 or +234 801 234 5678)
          </p>
        )}
        {/* Character count indicator */}
        <div className="text-right">
          <span
            className={cn(
              'text-xs',
              formData.nextOfKinPhone.replace(/\D/g, '').length >= 10
                ? 'text-success-600'
                : 'text-neutral-400'
            )}
          >
            {formData.nextOfKinPhone.replace(/\D/g, '').length} digits
            {formData.nextOfKinPhone.replace(/\D/g, '').length < 10 && ' (min 10)'}
          </span>
        </div>
      </div>

      {/* Relationship Field (Optional enhancement) */}
      <div className="space-y-1.5">
        <label
          htmlFor="nextOfKinRelationship"
          className="block text-sm font-medium text-neutral-700"
        >
          Relationship <span className="text-neutral-400 text-xs">(optional)</span>
        </label>
        <select
          id="nextOfKinRelationship"
          disabled={isSubmitting}
          className={cn(
            'w-full px-4 py-3 rounded-lg border transition-colors',
            'focus:outline-none focus-visible:ring-2',
            'disabled:bg-neutral-100 disabled:cursor-not-allowed',
            'bg-white',
            'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
          )}
        >
          <option value="">Select relationship (optional)</option>
          <option value="spouse">Spouse</option>
          <option value="parent">Parent</option>
          <option value="sibling">Sibling</option>
          <option value="child">Child</option>
          <option value="relative">Other Relative</option>
          <option value="friend">Friend</option>
          <option value="colleague">Colleague</option>
          <option value="other">Other</option>
        </select>
        <p className="text-neutral-500 text-xs">
          How is this person related to you?
        </p>
      </div>

      {/* Info note */}
      <div className="mt-4 p-3 bg-primary-50 border border-primary-200 rounded-lg">
        <p className="text-sm text-primary-700">
          This information will only be used in case of emergency. Please ensure the contact details are accurate and up-to-date.
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { WizardNavigation } from '../components/WizardNavigation';
import type { WizardDraftData } from '../api/wizard.api';

/**
 * Story 9-12 AC#1 — Step 1: Basic Info.
 *
 * Fields:
 *   - fullName (required, 2-200 chars, letters/spaces/hyphen/apostrophe)
 *   - dateOfBirth (native date input; mobile fallback to year/month/day dropdowns)
 *   - gender (radio: male / female / prefer_not_to_say)
 *
 * Auto-focus on Full Name (AC#1 Step 1 contract).
 */

export interface StepProps {
  formData: WizardDraftData;
  mergeFields: (patch: Partial<WizardDraftData>) => void;
  onContinue: () => void;
  onBack?: () => void;
}

const FULL_NAME_PATTERN = /^[a-zA-Z\s\-']{2,200}$/;

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export function Step1BasicInfo({ formData, mergeFields, onContinue, onBack }: StepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const el = document.getElementById('wizard-full-name');
    if (el) el.focus();
  }, []);

  function validate(): boolean {
    const next: Record<string, string> = {};
    const fullName = (formData.fullName ?? '').trim();
    const dob = formData.dateOfBirth ?? '';
    const gender = formData.gender ?? '';

    if (!fullName) next.fullName = 'Full name is required.';
    else if (!FULL_NAME_PATTERN.test(fullName))
      next.fullName = 'Use letters, spaces, hyphens or apostrophes only.';

    if (!dob) next.dateOfBirth = 'Date of birth is required.';
    else {
      const parsed = new Date(dob);
      if (Number.isNaN(parsed.getTime())) next.dateOfBirth = 'Enter a valid date.';
      else {
        const now = new Date();
        const age = (now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        if (age < 16) next.dateOfBirth = 'You must be at least 16 years old.';
        if (age > 120) next.dateOfBirth = 'Please double-check your date of birth.';
      }
    }

    if (!gender) next.gender = 'Select an option (or "Prefer not to say").';

    setErrors(next);
    setTouched({ fullName: true, dateOfBirth: true, gender: true });
    return Object.keys(next).length === 0;
  }

  function handleContinue() {
    if (validate()) onContinue();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleContinue();
      }}
      noValidate
      data-testid="step1-basic-info"
    >
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">Tell us about yourself</h2>
        <p className="mt-1 text-sm text-neutral-600">
          A few basics so we know who we're registering.
        </p>
      </header>

      <div className="space-y-5">
        {/* Full Name */}
        <div className="space-y-1.5">
          <label htmlFor="wizard-full-name" className="block text-sm font-medium text-neutral-700">
            Full Name
          </label>
          <input
            id="wizard-full-name"
            name="fullName"
            type="text"
            autoComplete="name"
            value={formData.fullName ?? ''}
            onChange={(e) => mergeFields({ fullName: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
            aria-invalid={!!(touched.fullName && errors.fullName)}
            aria-describedby={errors.fullName ? 'wizard-full-name-error' : undefined}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            placeholder="Enter your full name"
            data-testid="wizard-full-name"
          />
          {touched.fullName && errors.fullName && (
            <p id="wizard-full-name-error" className="text-sm text-error-600">
              {errors.fullName}
            </p>
          )}
        </div>

        {/* Date of Birth */}
        <div className="space-y-1.5">
          <label htmlFor="wizard-dob" className="block text-sm font-medium text-neutral-700">
            Date of Birth
          </label>
          <input
            id="wizard-dob"
            name="dateOfBirth"
            type="date"
            value={formData.dateOfBirth ?? ''}
            onChange={(e) => mergeFields({ dateOfBirth: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, dateOfBirth: true }))}
            aria-invalid={!!(touched.dateOfBirth && errors.dateOfBirth)}
            aria-describedby={errors.dateOfBirth ? 'wizard-dob-error' : undefined}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            data-testid="wizard-dob"
          />
          {touched.dateOfBirth && errors.dateOfBirth && (
            <p id="wizard-dob-error" className="text-sm text-error-600">
              {errors.dateOfBirth}
            </p>
          )}
        </div>

        {/* Gender */}
        <fieldset className="space-y-2" data-testid="wizard-gender-group">
          <legend className="block text-sm font-medium text-neutral-700">Gender</legend>
          <div className="space-y-2">
            {GENDER_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="gender"
                  value={opt.value}
                  checked={formData.gender === opt.value}
                  onChange={() => mergeFields({ gender: opt.value })}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-neutral-800">{opt.label}</span>
              </label>
            ))}
          </div>
          {touched.gender && errors.gender && (
            <p className="text-sm text-error-600">{errors.gender}</p>
          )}
        </fieldset>
      </div>

      <WizardNavigation onBack={onBack} onContinue={handleContinue} />
    </form>
  );
}

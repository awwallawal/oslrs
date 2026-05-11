import { WizardNavigation } from '../components/WizardNavigation';
import type { WizardDraftData } from '../api/wizard.api';

/**
 * Story 9-12 Dev Notes — Step 5 State A: NIN captured via questionnaire.
 *
 * The questionnaire renderer collected a valid NIN (modulus-11 OK + dedupe
 * pass). Wizard shows a masked confirmation, plus the auth-choice radios. On
 * submit, `respondent.status='active'` is derived in the wizard parent.
 */

export interface StateAProps {
  formData: WizardDraftData;
  ninFromQuestionnaire: string;
  authChoice: 'magic-link' | 'password' | 'skip';
  onAuthChoiceChange: (choice: 'magic-link' | 'password' | 'skip') => void;
  onSubmit: () => void;
  onBack?: () => void;
  isSubmitting?: boolean;
  submitError?: string | null;
}

function maskNin(nin: string): string {
  if (nin.length !== 11) return nin;
  return `${nin.slice(0, 4)}***${nin.slice(-4)}`;
}

export function Step5NinCaptured({
  ninFromQuestionnaire,
  authChoice,
  onAuthChoiceChange,
  onSubmit,
  onBack,
  isSubmitting,
  submitError,
}: StateAProps) {
  return (
    <div data-testid="step5-state-a">
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">Almost done</h2>
        <p className="mt-1 text-sm text-neutral-600">
          One last step — pick how you'd like to sign in if you come back later.
        </p>
      </header>

      <div
        className="mb-6 rounded-lg border border-success-200 bg-success-50 p-4"
        data-testid="step5-nin-captured-card"
      >
        <p className="text-sm font-medium text-success-800">
          ✓ NIN captured:{' '}
          <span className="font-mono">{maskNin(ninFromQuestionnaire)}</span>
        </p>
        <p className="mt-1 text-sm text-success-700">
          We've already validated your NIN in the previous step.
        </p>
      </div>

      <AuthChoiceFieldset
        value={authChoice}
        onChange={onAuthChoiceChange}
      />

      {submitError && (
        <p role="alert" className="mt-4 text-sm text-error-600">
          {submitError}
        </p>
      )}

      <WizardNavigation
        onBack={onBack}
        onContinue={onSubmit}
        continueLabel="Submit Registration"
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

export function AuthChoiceFieldset({
  value,
  onChange,
}: {
  value: 'magic-link' | 'password' | 'skip';
  onChange: (choice: 'magic-link' | 'password' | 'skip') => void;
}) {
  const options: Array<{
    value: 'magic-link' | 'password' | 'skip';
    title: string;
    description: string;
    testId: string;
  }> = [
    {
      value: 'magic-link',
      title: 'Email me a sign-in link (recommended)',
      description:
        'We email you a one-time link whenever you want to come back. No password to remember.',
      testId: 'auth-choice-magic-link',
    },
    {
      value: 'password',
      title: 'Set a password',
      description:
        'Choose a password now. (Coming soon — we\'ll fall back to email sign-in for now.)',
      testId: 'auth-choice-password',
    },
    {
      value: 'skip',
      title: 'Skip for now',
      description:
        "We'll save your registration and email you a sign-in link anytime you want to come back.",
      testId: 'auth-choice-skip',
    },
  ];

  return (
    <fieldset className="space-y-3" data-testid="auth-choice-group">
      <legend className="text-sm font-medium text-neutral-700">How would you like to sign in?</legend>
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
              value === opt.value
                ? 'border-primary-600 bg-primary-50'
                : 'border-neutral-200 hover:bg-neutral-50'
            }`}
            data-testid={opt.testId}
          >
            <input
              type="radio"
              name="authChoice"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <p className="font-medium text-neutral-900">{opt.title}</p>
              <p className="text-neutral-600">{opt.description}</p>
            </div>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

import { WizardNavigation } from '../components/WizardNavigation';
import { AuthChoiceFieldset } from './Step5NinCaptured';

/**
 * Story 9-12 Dev Notes — Step 5 State B: pending NIN via inline toggle.
 *
 * The user clicked "I don't have my NIN now" inside the Step-4 questionnaire.
 * Wizard renders the AC#4 consequence-preview card + auth-choice radios.
 * Submit button label flips to "Save as Pending". On submit:
 *   - `respondent.status='pending_nin_capture'`
 *   - A `pending_nin_complete` magic-link is auto-issued so reminders can
 *     reference it (backend wires this in `RegistrationController.submitWizard`).
 */

export interface StateBProps {
  authChoice: 'magic-link' | 'password' | 'skip';
  onAuthChoiceChange: (choice: 'magic-link' | 'password' | 'skip') => void;
  onSubmit: () => void;
  onBack?: () => void;
  /**
   * Undo the pending-NIN choice. Wizard restores Step 5 to A or C based on
   * whether the questionnaire captured a NIN. Without this, a user who
   * clicked "I don't have my NIN now" inside Step 4 (or whose draft
   * persisted a stale `pendingNinToggle=true` from a prior session) has no
   * in-wizard path to recover and must restart the registration.
   */
  onUndoPending?: () => void;
  isSubmitting?: boolean;
  submitError?: string | null;
}

const CONSEQUENCE_COPY =
  "Your registration will be saved as pending. We'll email you to complete it. We'll also remind you in 2 days, 7 days, and 14 days.";

export function Step5PendingNin({
  authChoice,
  onAuthChoiceChange,
  onSubmit,
  onBack,
  onUndoPending,
  isSubmitting,
  submitError,
}: StateBProps) {
  return (
    <div data-testid="step5-state-b">
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">Saving as pending</h2>
        <p className="mt-1 text-sm text-neutral-600">
          You can add your NIN later. We'll email you a one-click link to finish.
        </p>
      </header>

      {onUndoPending && (
        <div
          className="mb-4 flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3"
          data-testid="step5-undo-pending-banner"
        >
          <div className="flex-1 text-sm text-neutral-700">
            <strong className="font-semibold">Have your NIN now?</strong>{' '}
            You can switch back and enter it instead of saving as pending.
          </div>
          <button
            type="button"
            onClick={onUndoPending}
            className="rounded-md border border-primary-600 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            data-testid="step5-undo-pending-button"
          >
            Enter NIN now
          </button>
        </div>
      )}

      <div
        className="mb-6 rounded-md border-l-4 border-info-600 bg-info-50 p-4 text-sm text-info-800"
        data-testid="step5-pending-consequence"
      >
        {CONSEQUENCE_COPY}
      </div>

      <AuthChoiceFieldset value={authChoice} onChange={onAuthChoiceChange} />

      {submitError && (
        <p role="alert" className="mt-4 text-sm text-error-600">
          {submitError}
        </p>
      )}

      <WizardNavigation
        onBack={onBack}
        onContinue={onSubmit}
        continueLabel="Save as Pending"
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

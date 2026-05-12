import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { modulus11Check } from '@oslsr/utils/src/validation';
import { WizardNavigation } from '../components/WizardNavigation';
import { NinHelpHint } from '../components/NinHelpHint';
import { PendingNinToggle } from '../components/PendingNinToggle';
import { AuthChoiceFieldset } from './Step5NinCaptured';
import type { WizardDraftData } from '../api/wizard.api';

/**
 * Story 9-12 Dev Notes — Step 5 State C: form had NO NIN question.
 *
 * Falls back to the original AC#1 Step 5 + AC#4 spec verbatim:
 *   - NIN input with `NinHelpHint` inline + *346# USSD reminder
 *   - `<button role="switch">` pending-NIN toggle (AC#4 — flips Submit label
 *     "Submit Registration" → "Save as Pending" + reveals consequence-preview
 *     card)
 *   - Auth-choice radios (magic-link / password / skip)
 *
 * On submit:
 *   - Toggle OFF + valid NIN → `respondent.status='active'`, FR21 dedupe
 *     applies at submission time.
 *   - Toggle ON → `respondent.status='pending_nin_capture'`; NIN value
 *     retained on the draft but excluded from the submitWizard call.
 */

export interface StateCProps {
  formData: WizardDraftData;
  ninValue: string;
  pendingToggle: boolean;
  onNinChange: (nin: string) => void;
  onPendingToggleChange: (pressed: boolean) => void;
  authChoice: 'magic-link' | 'password' | 'skip';
  onAuthChoiceChange: (choice: 'magic-link' | 'password' | 'skip') => void;
  onSubmit: () => void;
  onBack?: () => void;
  isSubmitting?: boolean;
  submitError?: string | null;
}

export function Step5NinInput({
  ninValue,
  pendingToggle,
  onNinChange,
  onPendingToggleChange,
  authChoice,
  onAuthChoiceChange,
  onSubmit,
  onBack,
  isSubmitting,
  submitError,
}: StateCProps) {
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!touched) return;
    if (pendingToggle) {
      setError(null);
      return;
    }
    if (!ninValue) {
      setError('NIN is required (or enable "I don\'t have my NIN with me right now").');
      return;
    }
    if (!/^\d{11}$/.test(ninValue)) {
      setError('NIN must be 11 digits.');
      return;
    }
    if (!modulus11Check(ninValue)) {
      setError('NIN failed the Modulus 11 checksum. Please double-check.');
      return;
    }
    setError(null);
  }, [ninValue, pendingToggle, touched]);

  function handleSubmitClick() {
    setTouched(true);
    if (!pendingToggle) {
      if (!ninValue) {
        setError('NIN is required (or enable "I don\'t have my NIN with me right now").');
        return;
      }
      if (!/^\d{11}$/.test(ninValue)) {
        setError('NIN must be 11 digits.');
        return;
      }
      if (!modulus11Check(ninValue)) {
        setError('NIN failed the Modulus 11 checksum. Please double-check.');
        return;
      }
    }
    setError(null);
    onSubmit();
  }

  const ninStatus: 'incomplete' | 'valid' | 'invalid' = !ninValue
    ? 'incomplete'
    : ninValue.length < 11
      ? 'incomplete'
      : modulus11Check(ninValue)
        ? 'valid'
        : 'invalid';

  return (
    <div data-testid="step5-state-c">
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">Your NIN</h2>
        <p className="mt-1 text-sm text-neutral-600">
          We use your National Identification Number to keep the registry free of duplicates and to
          verify your identity at job placement time.
        </p>
      </header>

      <div className="space-y-1.5">
        <label htmlFor="wizard-nin" className="block text-sm font-medium text-neutral-700">
          National Identification Number (NIN)
        </label>
        <input
          id="wizard-nin"
          name="nin"
          type="text"
          inputMode="numeric"
          maxLength={11}
          value={ninValue}
          onChange={(e) => onNinChange(e.target.value.replace(/\D/g, '').slice(0, 11))}
          onBlur={() => setTouched(true)}
          disabled={pendingToggle}
          aria-describedby="wizard-nin-help"
          aria-invalid={touched && !!error}
          placeholder="11-digit NIN"
          className={`w-full rounded-lg border px-4 py-3 font-mono transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:bg-neutral-100 disabled:opacity-60 ${
            ninStatus === 'invalid'
              ? 'border-error-600 focus:border-error-600'
              : ninStatus === 'valid'
                ? 'border-success-500 focus:border-success-500'
                : 'border-neutral-300 focus:border-primary-500'
          }`}
          data-testid="wizard-nin-input"
        />
        {ninStatus === 'valid' && !pendingToggle && (
          <p className="flex items-center gap-1 text-sm text-success-600" data-testid="wizard-nin-valid">
            <CheckCircle2 className="h-4 w-4" />
            NIN format looks good. We do a final check when you submit.
          </p>
        )}
        {ninStatus === 'invalid' && !pendingToggle && (
          <p className="flex items-center gap-1 text-sm text-error-600" data-testid="wizard-nin-invalid">
            <XCircle className="h-4 w-4" />
            NIN failed the Modulus 11 checksum. Please double-check it.
          </p>
        )}
        <NinHelpHint
          id="wizard-nin-help"
          variant="inline"
          onPendingNinClick={() => onPendingToggleChange(true)}
          hidePendingLink={pendingToggle}
        />
      </div>

      <div className="mt-6">
        <PendingNinToggle
          pressed={pendingToggle}
          onChange={onPendingToggleChange}
        />
      </div>

      <div className="mt-8">
        <AuthChoiceFieldset value={authChoice} onChange={onAuthChoiceChange} />
      </div>

      {touched && error && !pendingToggle && (
        <p role="alert" className="mt-4 text-sm text-error-600" data-testid="step5-nin-error">
          {error}
        </p>
      )}
      {submitError && (
        <p role="alert" className="mt-4 text-sm text-error-600">
          {submitError}
        </p>
      )}

      <WizardNavigation
        onBack={onBack}
        onContinue={handleSubmitClick}
        continueLabel={pendingToggle ? 'Save as Pending' : 'Submit Registration'}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { modulus11Check } from '@oslsr/utils/src/validation';
import { WizardNavigation } from '../components/WizardNavigation';
import { NinHelpHint } from '../components/NinHelpHint';
import { PendingNinToggle } from '../components/PendingNinToggle';
import { useNinCheck } from '../../forms/hooks/useNinCheck';
import type { WizardDraftData } from '../api/wizard.api';

/**
 * Story 9-12 Step 1 + Story 9-18 Part A (AC#A1-A5) + Part F (AC#F1).
 *
 * Step 1 is now the single canonical identity-capture point:
 *   - NIN first (Modulus-11 + live duplicate check + pending-NIN toggle) — the
 *     State A/B/C Step-5 dispatcher is retired; NIN lives here, once.
 *   - Given name + Family name as two explicit fields (Yoruba/Nigerian
 *     surname-first safe) — replaces the lossy single "Full Name" parse.
 *   - Date of birth + gender (unchanged).
 *
 * Continue is gated (AC#A3): disabled until the NIN gate (checksum-valid &
 * non-duplicate, OR pending-NIN chosen) AND name/DOB/gender all pass. A visible
 * validation summary explains what's outstanding (wired to the button's
 * aria-describedby).
 */

export interface StepProps {
  formData: WizardDraftData;
  mergeFields: (patch: Partial<WizardDraftData>) => void;
  onContinue: () => void;
  onBack?: () => void;
}

// AI-Review M2: Unicode-aware so Yoruba/Nigerian diacritics (Ọláwálé, Ṣadé,
// Olúwaséun) pass — correct Nigerian names are the entire point of Part F.
// \p{L} letters + \p{M} combining marks, plus space/hyphen/apostrophe; 2-80 chars.
const NAME_PATTERN = /^[\p{L}\p{M}\s\-']{2,80}$/u;

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

type FieldErrors = Partial<Record<'givenName' | 'familyName' | 'dateOfBirth' | 'gender', string>>;

function computeFieldErrors(formData: WizardDraftData): FieldErrors {
  const next: FieldErrors = {};
  const given = (formData.givenName ?? '').trim();
  const family = (formData.familyName ?? '').trim();
  const dob = formData.dateOfBirth ?? '';
  const gender = formData.gender ?? '';

  if (!given) next.givenName = 'Given name is required.';
  else if (!NAME_PATTERN.test(given))
    next.givenName = 'Use letters, spaces, hyphens or apostrophes only.';

  // AI-Review M3: family name is OPTIONAL (mononym-inclusive). Validate only
  // when provided; a non-blocking nudge (see render) encourages adding it.
  if (family && !NAME_PATTERN.test(family))
    next.familyName = 'Use letters, spaces, hyphens or apostrophes only.';

  if (!dob) next.dateOfBirth = 'Date of birth is required.';
  else {
    const parsed = new Date(dob);
    if (Number.isNaN(parsed.getTime())) next.dateOfBirth = 'Enter a valid date.';
    // AI-Review (decision 2026-06-10): the minor age-gate (floor 15) + ILO
    // apprenticeship carve-out + guardian-consent capture is deferred to its own
    // story (forms-engine fidelity — runtime age compute + group-relevance
    // migration — see Dev Notes "Forms-engine fidelity & minor age-gate"). Until
    // then Step 1 only sanity-checks the date; it does NOT impose an
    // employment-age block (that would wrongly bar 15-yo apprentices before the
    // guardian path exists, and prod has no age gate today anyway).
    else if (parsed.getTime() > Date.now()) next.dateOfBirth = 'Date of birth cannot be in the future.';
    else if ((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24 * 365.25) > 120)
      next.dateOfBirth = 'Please double-check your date of birth.';
  }

  if (!gender) next.gender = 'Select an option (or "Prefer not to say").';

  return next;
}

export function Step1BasicInfo({ formData, mergeFields, onContinue, onBack }: StepProps) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const { checkNin, reset: resetNinCheck, isChecking, isDuplicate, duplicateInfo } = useNinCheck();

  const nin = formData.nin ?? '';
  const pending = formData.pendingNinToggle === true;

  // AC#A1 — NIN status machine mirrors the retired Step5NinInput.
  const ninStatus: 'incomplete' | 'valid' | 'invalid' =
    !nin || nin.length < 11 ? 'incomplete' : modulus11Check(nin) ? 'valid' : 'invalid';

  // Auto-focus the NIN field (it's the first field now).
  useEffect(() => {
    document.getElementById('wizard-step1-nin')?.focus();
  }, []);

  // AC#A2 — live duplicate check once the NIN is checksum-valid. The hook
  // debounces (~500ms) and only calls the (rate-limited, unauthenticated)
  // /forms/check-nin endpoint for checksum-valid 11-digit input.
  useEffect(() => {
    if (pending) {
      resetNinCheck();
      return;
    }
    if (ninStatus === 'valid') checkNin(nin);
    else resetNinCheck();
  }, [nin, ninStatus, pending, checkNin, resetNinCheck]);

  // AC#A2 — duplicate-block message (mirrors FormRenderer's derivation).
  const ninDuplicateError = useMemo(() => {
    if (pending || !isDuplicate || !duplicateInfo) return undefined;
    const { reason, registeredAt } = duplicateInfo;
    if (reason === 'staff') {
      return 'This NIN belongs to a registered staff member. Please contact support if this is a mistake.';
    }
    const date = registeredAt ? new Date(registeredAt).toLocaleDateString() : 'an earlier date';
    return `This NIN is already registered (since ${date}). If you think this is a mistake, please contact support.`;
  }, [pending, isDuplicate, duplicateInfo]);

  const fieldErrors = useMemo(() => computeFieldErrors(formData), [formData]);

  // AC#A3 — Continue gate: NIN valid/non-duplicate OR pending, AND every field valid.
  // AI-Review L5 (WON'T-FIX, deliberate): we do NOT additionally gate on
  // !isChecking. Doing so would disable Continue on EVERY valid NIN until the
  // network check returns — friction for every registrant on slow mobile
  // networks — to prevent a sub-second race that the backend submit already
  // rejects authoritatively. The duplicate block still disables Continue the
  // moment isDuplicate resolves.
  const ninGateOk = pending || (ninStatus === 'valid' && !isDuplicate);
  const allValid = ninGateOk && Object.keys(fieldErrors).length === 0;

  // Reasons surfaced in the validation summary when Continue is disabled.
  const outstanding: string[] = [];
  if (!ninGateOk) {
    outstanding.push(
      ninDuplicateError
        ? 'Use a different NIN, or choose "I don\'t have my NIN now".'
        : 'Enter your 11-digit NIN, or choose "I don\'t have my NIN now".',
    );
  }
  if (fieldErrors.givenName) outstanding.push('Enter your given name.');
  if (fieldErrors.familyName) outstanding.push('Check your family name (letters only).');
  if (fieldErrors.dateOfBirth) outstanding.push('Enter a valid date of birth.');
  if (fieldErrors.gender) outstanding.push('Choose a gender option.');

  // AI-Review L6: surface whichever NIN status message is live to the input's
  // aria-describedby so screen-reader users hear it (not just the help hint).
  const ninMsgId = ninDuplicateError
    ? 'wizard-step1-nin-duplicate'
    : !pending && ninStatus === 'invalid'
      ? 'wizard-step1-nin-invalid'
      : !pending && ninStatus === 'valid' && isChecking
        ? 'wizard-step1-nin-checking'
        : undefined;
  const ninDescribedBy = ['wizard-step1-nin-help', ninMsgId].filter(Boolean).join(' ');

  function handleContinue() {
    setTouched({ nin: true, givenName: true, familyName: true, dateOfBirth: true, gender: true });
    if (allValid) onContinue();
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
          We start with your NIN and name so we can keep the registry duplicate-free.
        </p>
      </header>

      <div className="space-y-5">
        {/* NIN (first field) */}
        <div className="space-y-1.5">
          <label htmlFor="wizard-step1-nin" className="block text-sm font-medium text-neutral-700">
            National Identification Number (NIN)
          </label>
          <input
            id="wizard-step1-nin"
            name="nin"
            type="text"
            inputMode="numeric"
            maxLength={11}
            value={nin}
            onChange={(e) => mergeFields({ nin: e.target.value.replace(/\D/g, '').slice(0, 11) })}
            onBlur={() => setTouched((t) => ({ ...t, nin: true }))}
            disabled={pending}
            aria-describedby={ninDescribedBy}
            aria-invalid={!pending && (ninStatus === 'invalid' || !!ninDuplicateError)}
            placeholder="11-digit NIN"
            className={`w-full rounded-lg border px-4 py-3 font-mono transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:bg-neutral-100 disabled:opacity-60 ${
              !pending && (ninStatus === 'invalid' || ninDuplicateError)
                ? 'border-error-600 focus:border-error-600'
                : !pending && ninStatus === 'valid' && !isChecking
                  ? 'border-success-500 focus:border-success-500'
                  : 'border-neutral-300 focus:border-primary-500'
            }`}
            data-testid="wizard-step1-nin-input"
          />
          {!pending && isChecking && (
            <p id="wizard-step1-nin-checking" className="text-sm text-neutral-500" data-testid="wizard-step1-nin-checking">
              Checking NIN availability…
            </p>
          )}
          {!pending && ninStatus === 'valid' && !isChecking && !ninDuplicateError && (
            <p className="flex items-center gap-1 text-sm text-success-600" data-testid="wizard-step1-nin-valid">
              <CheckCircle2 className="h-4 w-4" />
              NIN format looks good. We do a final check when you submit.
            </p>
          )}
          {!pending && ninStatus === 'invalid' && (
            <p
              id="wizard-step1-nin-invalid"
              role="alert"
              className="flex items-center gap-1 text-sm text-error-600"
              data-testid="wizard-step1-nin-invalid"
            >
              <XCircle className="h-4 w-4" />
              NIN failed the Modulus 11 checksum. Please double-check it.
            </p>
          )}
          {ninDuplicateError && (
            <p
              id="wizard-step1-nin-duplicate"
              role="alert"
              className="flex items-center gap-1 text-sm text-error-600"
              data-testid="wizard-step1-nin-duplicate"
            >
              <XCircle className="h-4 w-4" />
              {ninDuplicateError}
            </p>
          )}
          <NinHelpHint
            id="wizard-step1-nin-help"
            variant="inline"
            onPendingNinClick={() => mergeFields({ pendingNinToggle: true })}
            hidePendingLink={pending}
          />
        </div>

        {/* Pending-NIN toggle (reveals the consequence-preview card when pressed). */}
        <PendingNinToggle
          pressed={pending}
          onChange={(pressed) => mergeFields({ pendingNinToggle: pressed })}
        />

        {/* Given + Family name (AC#F1 — surname-first safe). */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="wizard-given-name" className="block text-sm font-medium text-neutral-700">
              Given name (first / personal name)
            </label>
            <input
              id="wizard-given-name"
              name="givenName"
              type="text"
              autoComplete="given-name"
              value={formData.givenName ?? ''}
              onChange={(e) => mergeFields({ givenName: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, givenName: true }))}
              aria-invalid={!!(touched.givenName && fieldErrors.givenName)}
              aria-describedby={fieldErrors.givenName ? 'wizard-given-name-error' : undefined}
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              placeholder="e.g. Adeyinka"
              data-testid="wizard-step1-given-name"
            />
            {touched.givenName && fieldErrors.givenName && (
              <p id="wizard-given-name-error" className="text-sm text-error-600">
                {fieldErrors.givenName}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="wizard-family-name" className="block text-sm font-medium text-neutral-700">
              Family name (surname)
            </label>
            <input
              id="wizard-family-name"
              name="familyName"
              type="text"
              autoComplete="family-name"
              value={formData.familyName ?? ''}
              onChange={(e) => mergeFields({ familyName: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, familyName: true }))}
              aria-invalid={!!(touched.familyName && fieldErrors.familyName)}
              aria-describedby={fieldErrors.familyName ? 'wizard-family-name-error' : undefined}
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              placeholder="e.g. Adewale"
              data-testid="wizard-step1-family-name"
            />
            {touched.familyName && fieldErrors.familyName && (
              <p id="wizard-family-name-error" className="text-sm text-error-600">
                {fieldErrors.familyName}
              </p>
            )}
          </div>
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
            aria-invalid={!!(touched.dateOfBirth && fieldErrors.dateOfBirth)}
            aria-describedby={fieldErrors.dateOfBirth ? 'wizard-dob-error' : undefined}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            data-testid="wizard-dob"
          />
          {touched.dateOfBirth && fieldErrors.dateOfBirth && (
            <p id="wizard-dob-error" className="text-sm text-error-600">
              {fieldErrors.dateOfBirth}
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
          {touched.gender && fieldErrors.gender && (
            <p className="text-sm text-error-600">{fieldErrors.gender}</p>
          )}
        </fieldset>
      </div>

      {/* AC#A3 — visible validation summary (referenced by the disabled Continue button). */}
      {!allValid && (
        <div
          id="step1-validation-summary"
          className="mt-5 rounded-md border-l-4 border-warning-500 bg-warning-50 p-3 text-sm text-warning-800"
          data-testid="step1-validation-summary"
        >
          <p className="font-medium">Before you continue:</p>
          <ul className="ml-4 list-disc">
            {outstanding.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      <WizardNavigation
        onBack={onBack}
        onContinue={handleContinue}
        isContinueDisabled={!allValid}
        continueDescribedBy="step1-validation-summary"
      />
    </form>
  );
}

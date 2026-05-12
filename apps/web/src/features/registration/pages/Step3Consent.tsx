import { useState } from 'react';
import { WizardNavigation } from '../components/WizardNavigation';
import type { WizardDraftData } from '../api/wizard.api';

/**
 * Story 9-12 AC#1 — Step 3: Two-stage NDPA Consent.
 *
 * FR2 contract:
 *   - Stage 1 — Marketplace inclusion (required to proceed). Yes/no radios.
 *   - Stage 2 — Enriched contact share (only revealed when Stage 1 = Yes).
 *               Defaults to No; an explicit choice is required before continue.
 *
 * The wizard owns the radio state (controlled by parent's mergeFields). The
 * step's local responsibility is validation + the progressive-disclosure
 * pattern between the two stages.
 */

export interface StepProps {
  formData: WizardDraftData;
  mergeFields: (patch: Partial<WizardDraftData>) => void;
  onContinue: () => void;
  onBack?: () => void;
}

export function Step3Consent({ formData, mergeFields, onContinue, onBack }: StepProps) {
  const [error, setError] = useState<string | null>(null);

  const marketplace = formData.consentMarketplace;
  const enriched = formData.consentEnriched;

  const isMarketplaceSet = typeof marketplace === 'boolean';
  const stage2Visible = marketplace === true;
  const isEnrichedSet = typeof enriched === 'boolean';

  function handleContinue() {
    if (!isMarketplaceSet) {
      setError('Please pick an option for marketplace inclusion.');
      return;
    }
    if (stage2Visible && !isEnrichedSet) {
      setError('Please pick an option for enriched contact sharing.');
      return;
    }
    setError(null);
    onContinue();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleContinue();
      }}
      noValidate
      data-testid="step3-consent"
    >
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">Consent &amp; Privacy</h2>
        <p className="mt-1 text-sm text-neutral-600">
          The Oyo State Government uses your information to operate the Skills Registry under the
          Nigerian Data Protection Act (NDPA, 2023). You can change your choices later by
          contacting support.
        </p>
      </header>

      <section
        className="space-y-3 rounded-lg border border-neutral-200 p-4"
        data-testid="consent-stage-1"
      >
        <h3 className="text-base font-semibold text-neutral-900">Marketplace inclusion</h3>
        <p className="text-sm text-neutral-700">
          Should we include your registered occupation in the public Marketplace so employers and
          training providers can find you? This decision can be reversed later.
        </p>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="radio"
              name="consentMarketplace"
              checked={marketplace === true}
              onChange={() => mergeFields({ consentMarketplace: true })}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500"
              data-testid="consent-marketplace-yes"
            />
            <span className="text-neutral-800">
              Yes, include me in the Marketplace
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="radio"
              name="consentMarketplace"
              checked={marketplace === false}
              onChange={() =>
                mergeFields({ consentMarketplace: false, consentEnriched: false })
              }
              className="h-4 w-4 text-primary-600 focus:ring-primary-500"
              data-testid="consent-marketplace-no"
            />
            <span className="text-neutral-800">
              No, keep my profile out of the Marketplace
            </span>
          </label>
        </div>
      </section>

      {stage2Visible && (
        <section
          className="mt-4 space-y-3 rounded-lg border border-info-200 bg-info-50/40 p-4"
          data-testid="consent-stage-2"
        >
          <h3 className="text-base font-semibold text-neutral-900">
            Enriched contact sharing (optional)
          </h3>
          <p className="text-sm text-neutral-700">
            Marketplace contacts (employers / trainers) can request your phone number through a
            reveal flow. Enriched sharing lets approved contacts see your phone immediately. They
            still see a full audit trail of who looked at your details.
          </p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="radio"
                name="consentEnriched"
                checked={enriched === true}
                onChange={() => mergeFields({ consentEnriched: true })}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                data-testid="consent-enriched-yes"
              />
              <span className="text-neutral-800">
                Yes, share my contact details with approved contacts
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="radio"
                name="consentEnriched"
                checked={enriched === false}
                onChange={() => mergeFields({ consentEnriched: false })}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                data-testid="consent-enriched-no"
              />
              <span className="text-neutral-800">
                No, only reveal my contact through the reveal flow
              </span>
            </label>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-error-600" data-testid="consent-error">
          {error}
        </p>
      )}

      <WizardNavigation onBack={onBack} onContinue={handleContinue} />
    </form>
  );
}

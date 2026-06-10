import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { WizardNavigation } from '../components/WizardNavigation';
import { fetchPublicLgas, derivePendingNin, type WizardDraftData } from '../api/wizard.api';

/**
 * Story 9-18 Part C (AC#C1) — Step 5 is now a Review-and-Save summary.
 *
 * Replaces the State A/B/C `Step5NinAndAuth` dispatcher entirely. No NIN input
 * (captured at Step 1), no auth-choice (retired per AC#C3 — magic-link is the
 * universal default). Just a confidence-building summary of everything the user
 * entered, an Edit link per row that jumps back to the owning step, and a single
 * Save button whose label flips for the pending-NIN path.
 */

export interface Step5ReviewAndSaveProps {
  formData: WizardDraftData;
  /** Jump back to a step to edit a field (wizard's goToStep). */
  onGoToStep: (stepIndex: number) => void;
  onSubmit: () => void;
  onBack?: () => void;
  isSubmitting?: boolean;
  submitError?: string | null;
}

// Edit-link target steps (0-indexed) per field group (AC#C1).
const STEP_IDENTITY = 0; // name / DOB / gender / NIN
const STEP_CONTACT = 1; // phone / email / LGA
const STEP_CONSENT = 2; // consent flags

const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  prefer_not_to_say: 'Prefer not to say',
};

/** Display NIN as XXXXX-XXXXX-X (AC#C1). */
function formatNin(nin: string): string {
  if (!/^\d{11}$/.test(nin)) return nin;
  return `${nin.slice(0, 5)}-${nin.slice(5, 10)}-${nin.slice(10)}`;
}

function formatName(fd: WizardDraftData): string {
  const given = (fd.givenName ?? '').trim();
  const family = (fd.familyName ?? '').trim();
  return [given, family].filter(Boolean).join(' ') || '—';
}

function ConsentChip({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <span className="inline-flex items-center rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
      ✓ Allowed
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
      Declined
    </span>
  );
}

export function Step5ReviewAndSave({
  formData,
  onGoToStep,
  onSubmit,
  onBack,
  isSubmitting,
  submitError,
}: Step5ReviewAndSaveProps) {
  const lgaQuery = useQuery({
    queryKey: ['wizard', 'lgas', 'public'],
    queryFn: fetchPublicLgas,
    staleTime: 24 * 60 * 60 * 1000,
  });
  // AI-Review L8: show a loading state instead of the raw `lga-egbeda` id slug
  // while the public-LGA query is in flight.
  const lgaName = lgaQuery.isLoading
    ? 'Loading…'
    : (lgaQuery.data ?? []).find((l) => l.id === formData.lgaId)?.name ?? formData.lgaId ?? '—';

  // AI-Review M1: same derivation as the submit — label/badge can't drift.
  const pending = derivePendingNin(formData);

  return (
    <div data-testid="step5-review-and-save">
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">Review your registration</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Please check everything is correct. Use Edit to change anything, then Save.
        </p>
      </header>

      <dl className="divide-y divide-neutral-200 rounded-lg border border-neutral-200" data-testid="step5-summary">
        <SummaryRow
          label="Name"
          editStep={STEP_IDENTITY}
          onGoToStep={onGoToStep}
          testId="step5-name"
        >
          {formatName(formData)}
        </SummaryRow>

        <SummaryRow
          label="Date of birth"
          editStep={STEP_IDENTITY}
          onGoToStep={onGoToStep}
          testId="step5-dob"
        >
          {formData.dateOfBirth || '—'}
        </SummaryRow>

        <SummaryRow
          label="Gender"
          editStep={STEP_IDENTITY}
          onGoToStep={onGoToStep}
          testId="step5-gender"
        >
          {formData.gender ? GENDER_LABELS[formData.gender] ?? formData.gender : '—'}
        </SummaryRow>

        <SummaryRow label="NIN" editStep={STEP_IDENTITY} onGoToStep={onGoToStep} testId="step5-nin">
          {pending ? (
            <span
              className="inline-flex items-center rounded-full bg-info-50 px-2 py-0.5 text-xs font-medium text-info-800"
              data-testid="step5-nin-pending"
            >
              📌 Pending, we'll email you
            </span>
          ) : formData.nin ? (
            <span className="font-mono">{formatNin(formData.nin)}</span>
          ) : (
            '—'
          )}
        </SummaryRow>

        <SummaryRow label="Phone" editStep={STEP_CONTACT} onGoToStep={onGoToStep} testId="step5-phone">
          <span className="font-mono">{formData.phone || '—'}</span>
        </SummaryRow>

        <SummaryRow label="Email" editStep={STEP_CONTACT} onGoToStep={onGoToStep} testId="step5-email">
          {formData.email || '—'}
        </SummaryRow>

        <SummaryRow label="LGA" editStep={STEP_CONTACT} onGoToStep={onGoToStep} testId="step5-lga">
          {lgaName}
        </SummaryRow>

        <SummaryRow
          label="Marketplace consent"
          editStep={STEP_CONSENT}
          onGoToStep={onGoToStep}
          testId="step5-consent-marketplace"
        >
          <ConsentChip allowed={formData.consentMarketplace === true} />
        </SummaryRow>

        <SummaryRow
          label="Enriched-data consent"
          editStep={STEP_CONSENT}
          onGoToStep={onGoToStep}
          testId="step5-consent-enriched"
        >
          <ConsentChip allowed={formData.consentEnriched === true} />
        </SummaryRow>
      </dl>

      {submitError && (
        <p role="alert" className="mt-4 text-sm text-error-600" data-testid="step5-submit-error">
          {submitError}
        </p>
      )}

      <WizardNavigation
        onBack={onBack}
        onContinue={onSubmit}
        continueLabel={pending ? 'Save as Pending' : 'Save Registration'}
        continueTestId="wizard-save-button"
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

function SummaryRow({
  label,
  children,
  editStep,
  onGoToStep,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  editStep: number;
  onGoToStep: (stepIndex: number) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-neutral-900" data-testid={testId}>
          {children}
        </dd>
      </div>
      <button
        type="button"
        onClick={() => onGoToStep(editStep)}
        className="inline-flex flex-shrink-0 items-center gap-1 rounded text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        data-testid={`${testId}-edit`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Edit</span>
        <span className="sr-only"> {label}</span>
      </button>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { WizardLayout } from '../../../layouts/WizardLayout';
import { useWizardDraft } from '../hooks/useWizardDraft';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { ApiError } from '../../../lib/api-client';
import {
  submitWizard,
  requestMagicLink,
  derivePendingNin,
  type WizardDraftData,
} from '../api/wizard.api';
import { Step1BasicInfo } from './Step1BasicInfo';
import { Step2ContactLga } from './Step2ContactLga';
import { Step3Consent } from './Step3Consent';
import { Step4Questionnaire } from './Step4Questionnaire';
import { Step5ReviewAndSave } from './Step5ReviewAndSave';

/**
 * Story 9-12 Task 4.3 + Task 5 — public registration wizard.
 *
 * Single page that renders 5 steps inside the WizardLayout chrome. Each step
 * is responsible for its own validation + Continue/Back navigation; the
 * wizard page owns step index, URL routing (`/register?step=N`), draft
 * persistence, and the final submit.
 *
 * Cross-device resume: when a `?token=<wizard_resume>` query param is
 * present, `useWizardDraft` hydrates from the server-side draft and the
 * wizard jumps to the saved step.
 */

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'contact', label: 'Contact' },
  { id: 'consent', label: 'Consent' },
  { id: 'survey', label: 'Survey' },
  { id: 'review', label: 'Review' },
] as const;

export default function WizardPage() {
  useDocumentTitle('Register | Oyo State Skills Registry');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const resumeToken = searchParams.get('token') ?? undefined;
  const stepFromUrl = parseStep(searchParams.get('step'));

  const draft = useWizardDraft({ token: resumeToken });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completionData, setCompletionData] = useState<{
    respondentId: string;
    pendingNin: boolean;
  } | null>(null);

  // Sync URL ↔ wizard state.
  //
  // FIX 2026-05-12 — the two effects below previously raced each other into an
  // infinite render loop on every Continue click. Root cause: Effect 1's deps
  // included the unstable `draft` object (re-created every render by the
  // useWizardDraft hook), so Effect 1 fired on every render and reverted state
  // back to the stale URL value while Effect 2 tried to push the URL forward.
  // They fought to a stalemate, re-rendering continuously without reaching
  // equilibrium.
  //
  // The fix narrows Effect 1's deps so it only runs on genuine URL changes
  // and uses a `lastSyncSource` ref to suppress the OPPOSITE-direction sync
  // on the immediate next render. Without this ref, a deep-link like
  // `/register?step=2` would race: Effect 1 schedules `state ← 2`, while
  // Effect 2 (still seeing closure-captured state=0) schedules `URL ← 0`,
  // and on the next render the directions flip back, looping forever.
  //
  // `hasReconciledInitialUrl` protects token-resume: useWizardDraft may have
  // set currentStepIndex from a server-side draft before this effect first
  // runs. Skipping the URL→state sync on that single render (only when a
  // resume token is in scope) lets the saved server step survive.
  const hasReconciledInitialUrl = useRef(false);
  const lastSyncSource = useRef<'url' | 'state' | null>(null);

  // URL → state (back/forward + explicit `?step=N` deep-links).
  useEffect(() => {
    if (!draft.isHydrated) return;
    if (!hasReconciledInitialUrl.current) {
      hasReconciledInitialUrl.current = true;
      if (resumeToken) return;
    }
    if (stepFromUrl == null) return;
    if (stepFromUrl === draft.currentStepIndex) return;
    // Mark this sync as URL→state so the state→URL effect that fires after
    // our `setCurrentStepIndex` lands knows to step aside on the next tick.
    lastSyncSource.current = 'url';
    // Clamp to a step the user has actually reached.
    draft.setCurrentStepIndex(Math.min(stepFromUrl, STEPS.length - 1));
    // Deliberately omit `draft` from deps — it's a fresh object every render
    // (useWizardDraft return). Reading `draft.currentStepIndex` + `.setCurrentStepIndex`
    // via closure is the correct sync semantic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.isHydrated, stepFromUrl]);

  // State → URL (Continue / Back button clicks).
  useEffect(() => {
    if (!draft.isHydrated) return;
    // If the previous tick was a URL→state sync, the URL is already the
    // intended truth — don't overwrite it with our just-updated state.
    // Reset the flag so subsequent ticks are handled normally.
    if (lastSyncSource.current === 'url') {
      lastSyncSource.current = null;
      return;
    }
    const desired = String(draft.currentStepIndex);
    if (searchParams.get('step') === desired) return;
    lastSyncSource.current = 'state';
    const next = new URLSearchParams(searchParams);
    next.set('step', desired);
    setSearchParams(next, { replace: true });
    // Same rationale — `searchParams` + `setSearchParams` are read via
    // closure; their identities change on every URL update but we only
    // want this effect firing when the SOURCE-OF-TRUTH state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.currentStepIndex, draft.isHydrated]);

  const goToStep = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, STEPS.length - 1));
      draft.setCurrentStepIndex(clamped);
    },
    [draft],
  );

  const handleContinue = useCallback(() => {
    goToStep(draft.currentStepIndex + 1);
  }, [draft.currentStepIndex, goToStep]);

  const handleBack = useCallback(() => {
    if (draft.currentStepIndex === 0) {
      navigate('/');
      return;
    }
    goToStep(draft.currentStepIndex - 1);
  }, [draft.currentStepIndex, goToStep, navigate]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const fd = draft.formData;
    // Story 9-18 Part C: NIN is captured canonically at Step 1 — read it directly
    // (the Step-5 dispatcher + questionnaire-NIN extraction are retired). Pending
    // is derived via the shared helper so the Step-5 label/badge can't drift from
    // this submit decision (AI-Review M1).
    const pending = derivePendingNin(fd);
    const nin = pending ? undefined : fd.nin;

    if (!fd.givenName || !fd.email || !fd.phone || !fd.lgaId) {
      setSubmitError('Some required fields are missing. Please go back and complete them.');
      setIsSubmitting(false);
      return;
    }
    if (typeof fd.consentMarketplace !== 'boolean') {
      setSubmitError('Please complete the consent step before submitting.');
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await submitWizard({
        givenName: fd.givenName,
        familyName: fd.familyName?.trim() || undefined,
        dateOfBirth: fd.dateOfBirth,
        gender: fd.gender,
        phone: fd.phone,
        email: fd.email,
        lgaId: fd.lgaId,
        consentMarketplace: fd.consentMarketplace,
        consentEnriched: fd.consentEnriched ?? false,
        nin,
        pendingNin: pending,
        questionnaireResponses: fd.questionnaireResponses,
        authChoice: fd.authChoice ?? 'magic-link',
      });

      // Best-effort: kick off the login magic-link for active respondents.
      // Pending-NIN respondents already get the pending_nin_complete link from
      // the submitWizard backend.
      if (!pending && (fd.authChoice ?? 'magic-link') !== 'password') {
        try {
          await requestMagicLink({ email: fd.email, purpose: 'login' });
        } catch {
          // Best-effort — never block the success screen.
        }
      }

      setCompletionData({ respondentId: result.respondentId, pendingNin: pending });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'NIN_DUPLICATE') {
          setSubmitError(
            'That NIN is already registered. If you think this is a mistake, please contact support.',
          );
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError('We could not submit your registration. Please try again in a moment.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [draft.formData, isSubmitting]);

  // Loading skeleton while hydrating from a magic-link token.
  if (!draft.isHydrated) {
    return (
      <WizardLayout steps={[...STEPS]} currentStepIndex={0}>
        <div className="space-y-4" data-testid="wizard-hydrating">
          <div className="h-6 w-1/2 animate-pulse rounded bg-neutral-100" />
          <div className="h-24 animate-pulse rounded bg-neutral-100" />
        </div>
      </WizardLayout>
    );
  }

  if (completionData) {
    return (
      <WizardLayout steps={[...STEPS]} currentStepIndex={STEPS.length - 1}>
        <CompletionScreen
          email={draft.formData.email ?? ''}
          respondentId={completionData.respondentId}
          pendingNin={completionData.pendingNin}
        />
      </WizardLayout>
    );
  }

  return (
    <WizardLayout
      steps={[...STEPS]}
      currentStepIndex={draft.currentStepIndex}
      onStepClick={(idx) => goToStep(idx)}
      footerSlot={
        draft.isSaving ? (
          <p className="text-xs text-neutral-500" data-testid="wizard-autosave-status">
            Saving your progress…
          </p>
        ) : draft.saveError ? (
          <p className="text-xs text-warning-700" data-testid="wizard-autosave-error">
            Couldn't save your progress just now. We'll keep retrying.
          </p>
        ) : null
      }
    >
      {renderStep({
        index: draft.currentStepIndex,
        formData: draft.formData,
        mergeFields: draft.mergeFields,
        onContinue: handleContinue,
        onBack: handleBack,
        onGoToStep: goToStep,
        onSubmit: handleSubmit,
        isSubmitting,
        submitError,
      })}
    </WizardLayout>
  );
}

function renderStep(props: {
  index: number;
  formData: WizardDraftData;
  mergeFields: (patch: Partial<WizardDraftData>) => void;
  onContinue: () => void;
  onBack: () => void;
  onGoToStep: (stepIndex: number) => void;
  onSubmit: () => Promise<void> | void;
  isSubmitting: boolean;
  submitError: string | null;
}) {
  switch (props.index) {
    case 0:
      return (
        <Step1BasicInfo
          formData={props.formData}
          mergeFields={props.mergeFields}
          onContinue={props.onContinue}
          onBack={props.onBack}
        />
      );
    case 1:
      return (
        <Step2ContactLga
          formData={props.formData}
          mergeFields={props.mergeFields}
          onContinue={props.onContinue}
          onBack={props.onBack}
        />
      );
    case 2:
      return (
        <Step3Consent
          formData={props.formData}
          mergeFields={props.mergeFields}
          onContinue={props.onContinue}
          onBack={props.onBack}
        />
      );
    case 3:
      return (
        <Step4Questionnaire
          formData={props.formData}
          mergeFields={props.mergeFields}
          onContinue={props.onContinue}
          onBack={props.onBack}
        />
      );
    case 4:
      return (
        <Step5ReviewAndSave
          formData={props.formData}
          onGoToStep={props.onGoToStep}
          onSubmit={() => {
            props.onSubmit();
          }}
          onBack={props.onBack}
          isSubmitting={props.isSubmitting}
          submitError={props.submitError}
        />
      );
    default:
      return null;
  }
}

function CompletionScreen({
  email,
  respondentId,
  pendingNin,
}: {
  email: string;
  respondentId: string;
  pendingNin: boolean;
}) {
  return (
    <div className="space-y-4 text-center" data-testid="wizard-complete">
      <div className="text-6xl" aria-hidden="true">
        ✓
      </div>
      <h2 className="text-xl font-semibold text-neutral-900">
        {pendingNin ? 'Saved as pending' : 'Registration complete'}
      </h2>
      <p className="text-sm text-neutral-700">
        {pendingNin ? (
          <>
            We've saved your registration for <span className="font-mono">{email}</span>. Watch your
            email for a one-click link to add your NIN whenever you're ready. We'll also remind
            you in 2 days, 7 days, and 14 days.
          </>
        ) : (
          <>
            Thank you for joining the Oyo State Skills Registry. We've emailed a one-click link to{' '}
            <span className="font-mono">{email}</span> so you can view, edit, or withdraw your
            registration anytime.
          </>
        )}
      </p>
      <p className="text-xs text-neutral-500" data-testid="wizard-complete-id">
        Reference ID: <span className="font-mono">{respondentId}</span>
      </p>
    </div>
  );
}

function parseStep(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(Math.floor(n), STEPS.length - 1));
}

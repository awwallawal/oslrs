import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { WizardLayout } from '../../../layouts/WizardLayout';
import { useWizardDraft } from '../hooks/useWizardDraft';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { ApiError } from '../../../lib/api-client';
import {
  submitWizard,
  requestMagicLink,
  derivePendingNin,
  fetchPublicActiveForm,
  type WizardDraftData,
  type FlattenedForm,
} from '../api/wizard.api';
import { getVisibleQuestions } from '../../forms/utils/skipLogic';
import { Step1BasicInfo } from './Step1BasicInfo';
import { Step2ContactLga } from './Step2ContactLga';
import { Step3Consent } from './Step3Consent';
import { Step4Questionnaire } from './Step4Questionnaire';
import { Step5ReviewAndSave } from './Step5ReviewAndSave';

/**
 * Story 9-12 Task 4.3 + Task 5 — public registration wizard.
 * Story 9-18 Part E (AC#E1/E3) — dynamic, section-as-step structure.
 *
 * The wizard is N steps: three fixed head steps (Basics / Contact / Consent),
 * one step per questionnaire SECTION of the pinned public form (each rendered
 * by `Step4Questionnaire` with a `sectionIndex`), and a final Review step. When
 * no public form is configured the section steps simply don't exist (the survey
 * is skipped). Each step owns its validation + Continue/Back; the wizard page
 * owns the step list, URL routing (`/register?step=N`), draft persistence, the
 * empty-section auto-skip (AC#E5), and the final submit.
 *
 * Cross-device resume: when a `?token=<wizard_resume>` query param is present,
 * `useWizardDraft` hydrates from the server-side draft and the wizard jumps to
 * the saved step.
 */

const HEAD_STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'contact', label: 'Contact' },
  { id: 'consent', label: 'Consent' },
] as const;

interface WizardStepDef {
  id: string;
  label: string;
  /** Present only for section steps — the ordinal passed to FormRenderer. */
  sectionIndex?: number;
  sectionId?: string;
  sectionTitle?: string;
}

/** Build the dynamic step list from the pinned form's sections (AC#E1/E3). */
function buildSteps(form: FlattenedForm | null): WizardStepDef[] {
  const sections: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const q of form?.questions ?? []) {
    if (!seen.has(q.sectionId)) {
      seen.add(q.sectionId);
      sections.push({ id: q.sectionId, title: q.sectionTitle });
    }
  }
  return [
    ...HEAD_STEPS.map((s) => ({ id: s.id, label: s.label })),
    ...sections.map((s, i) => ({
      id: `section-${s.id}`,
      label: s.title,
      sectionIndex: i,
      sectionId: s.id,
      sectionTitle: s.title,
    })),
    { id: 'review', label: 'Review' },
  ];
}

export default function WizardPage() {
  useDocumentTitle('Register | Oyo State Skills Registry');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const resumeToken = searchParams.get('token') ?? undefined;

  const draft = useWizardDraft({ token: resumeToken });

  // Story 9-18 Part E — fetch the pinned form here (shared query key with the
  // section steps, so TanStack fetches it once) to derive the dynamic step list.
  const formQuery = useQuery({
    queryKey: ['wizard', 'public-active-form'],
    queryFn: fetchPublicActiveForm,
    staleTime: 5 * 60 * 1000,
  });
  const form = formQuery.data ?? null;
  // Settled = the form query RESOLVED to a value: a form, or null on 404
  // ("no form configured" → survey legitimately skipped). A non-404 fetch ERROR
  // is deliberately NOT settled — it's surfaced as an explicit retry state below
  // (AI-Review M1), so a transient network failure never silently produces a
  // survey-less wizard. Gating on a stable step list also avoids the 4→N flash.
  const formSettled = formQuery.isSuccess;
  const steps = useMemo(() => buildSteps(form), [form]);

  const stepFromUrl = useMemo(() => {
    const raw = searchParams.get('step');
    if (raw === null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(Math.floor(n), steps.length - 1));
  }, [searchParams, steps.length]);

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
  //
  // Story 9-18 Part E — both effects also gate on `formSettled` so they act
  // against the final (stable) step list, never the transient pre-load one.
  const hasReconciledInitialUrl = useRef(false);
  const lastSyncSource = useRef<'url' | 'state' | null>(null);

  // URL → state (back/forward + explicit `?step=N` deep-links).
  useEffect(() => {
    if (!draft.isHydrated || !formSettled) return;
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
    draft.setCurrentStepIndex(Math.min(stepFromUrl, steps.length - 1));
    // Deliberately omit `draft` from deps — it's a fresh object every render
    // (useWizardDraft return). Reading `draft.currentStepIndex` + `.setCurrentStepIndex`
    // via closure is the correct sync semantic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.isHydrated, formSettled, stepFromUrl]);

  // State → URL (Continue / Back button clicks).
  useEffect(() => {
    if (!draft.isHydrated || !formSettled) return;
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
  }, [draft.currentStepIndex, draft.isHydrated, formSettled]);

  const goToStep = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, steps.length - 1));
      draft.setCurrentStepIndex(clamped);
    },
    [draft, steps.length],
  );

  // Story 9-18 AC#E5 — a section step whose questions are ALL hidden by
  // `showWhen` (given the current answers) is auto-skipped during Continue/Back.
  // Head + Review steps have no `sectionId` and are never skippable.
  const isStepSkippable = useCallback(
    (idx: number): boolean => {
      const step = steps[idx];
      if (!step?.sectionId || !form) return false;
      const sectionQuestions = form.questions.filter((q) => q.sectionId === step.sectionId);
      const responses = draft.formData.questionnaireResponses ?? {};
      return getVisibleQuestions(sectionQuestions, responses, form.sectionShowWhen).length === 0;
    },
    [steps, form, draft.formData.questionnaireResponses],
  );

  const handleContinue = useCallback(() => {
    let next = draft.currentStepIndex + 1;
    // Never skip the final Review step (steps.length - 1).
    while (next < steps.length - 1 && isStepSkippable(next)) next += 1;
    goToStep(next);
  }, [draft.currentStepIndex, steps.length, isStepSkippable, goToStep]);

  const handleBack = useCallback(() => {
    if (draft.currentStepIndex === 0) {
      navigate('/');
      return;
    }
    let prev = draft.currentStepIndex - 1;
    while (prev > 0 && isStepSkippable(prev)) prev -= 1;
    goToStep(prev);
  }, [draft.currentStepIndex, isStepSkippable, goToStep, navigate]);

  // Step list for the indicator, annotated with which section steps are
  // currently auto-skipped (AC#E5 — greyed in the breadcrumb variant).
  const indicatorSteps = useMemo(
    () => steps.map((s, i) => ({ id: s.id, label: s.label, skipped: isStepSkippable(i) })),
    [steps, isStepSkippable],
  );

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

  // AI-Review M1 — the pinned survey failed to load (a non-404 fetch error).
  // Surface it with a retry instead of silently dropping every section step and
  // letting the user submit with an empty questionnaire. A 404 ("no form
  // configured") is NOT an error — it resolves to null and the survey is skipped.
  if (formQuery.isError) {
    return (
      <WizardLayout steps={steps} currentStepIndex={0}>
        <div role="alert" className="space-y-3 text-center" data-testid="wizard-form-error">
          <p className="text-sm text-neutral-700">
            We couldn&apos;t load the registration survey. Please check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => formQuery.refetch()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            data-testid="wizard-form-error-retry"
          >
            Retry
          </button>
        </div>
      </WizardLayout>
    );
  }

  // Loading skeleton while hydrating from a magic-link token OR loading the form
  // (so the step list is stable before first paint).
  if (!draft.isHydrated || !formSettled) {
    return (
      <WizardLayout steps={steps} currentStepIndex={0}>
        <div className="space-y-4" data-testid="wizard-hydrating">
          <div className="h-6 w-1/2 animate-pulse rounded bg-neutral-100" />
          <div className="h-24 animate-pulse rounded bg-neutral-100" />
        </div>
      </WizardLayout>
    );
  }

  if (completionData) {
    return (
      <WizardLayout steps={steps} currentStepIndex={steps.length - 1}>
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
      steps={indicatorSteps}
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
        steps,
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
  steps: WizardStepDef[];
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
  const step = props.steps[props.index];
  if (!step) return null;

  switch (step.id) {
    case 'basics':
      return (
        <Step1BasicInfo
          formData={props.formData}
          mergeFields={props.mergeFields}
          onContinue={props.onContinue}
          onBack={props.onBack}
        />
      );
    case 'contact':
      return (
        <Step2ContactLga
          formData={props.formData}
          mergeFields={props.mergeFields}
          onContinue={props.onContinue}
          onBack={props.onBack}
        />
      );
    case 'consent':
      return (
        <Step3Consent
          formData={props.formData}
          mergeFields={props.mergeFields}
          onContinue={props.onContinue}
          onBack={props.onBack}
        />
      );
    case 'review':
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
      // Section step (AC#E1) — `key` forces a fresh FormRenderer positioned at
      // this section's first question on every section transition.
      return (
        <Step4Questionnaire
          key={step.id}
          formData={props.formData}
          mergeFields={props.mergeFields}
          onContinue={props.onContinue}
          onBack={props.onBack}
          sectionIndex={step.sectionIndex}
          sectionTitle={step.sectionTitle}
        />
      );
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
            email for a one-click link to add your NIN whenever you're ready.
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

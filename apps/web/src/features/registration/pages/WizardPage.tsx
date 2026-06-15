import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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
import { deriveReviewCompleteness } from '../lib/review-completeness';
import {
  parseStepParam,
  clampToReached,
  advanceStep,
  retreatStep,
} from '../lib/wizard-navigation';
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
  // Story 9-57 — the draft's step setter is a STABLE callback (hook change);
  // destructure it so the write-only persistence effect can depend on a plain
  // identifier (no `draft`-object dep churn, no eslint-disable).
  const { setCurrentStepIndex: persistStepToDraft } = draft;

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

  // Story 9-57 — the URL (`?step=N`) is the SINGLE source of truth for the
  // current step. `stepFromUrl` is the parsed + range-clamped value (or null
  // when absent); the rendered step is derived from it below.
  const stepFromUrl = useMemo(
    () => parseStepParam(searchParams.get('step'), steps.length),
    [searchParams, steps.length],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completionData, setCompletionData] = useState<{
    submissionUid: string;
    referenceCode: string;
    pendingNin: boolean;
  } | null>(null);

  // Story 9-54 AC6.1 — the furthest step the user has LEGITIMATELY reached (via
  // Continue or a resumed server draft). A deep-link / resume `?step=N` beyond
  // this is clamped back so the questionnaire can't be skipped to land on
  // Review. It only ever rises, and it rises ONLY from (a) Continue advancing
  // by one and (b) the server-saved resume step — never directly from the URL,
  // so a crafted `?step=99` can't inflate it.
  const [maxReachedStepIndex, setMaxReachedStepIndex] = useState(0);
  useEffect(() => {
    if (!draft.isHydrated) return;
    // Resume hydration: the server-saved step is a legitimately-reached step.
    setMaxReachedStepIndex((m) => (draft.currentStepIndex > m ? draft.currentStepIndex : m));
  }, [draft.isHydrated, draft.currentStepIndex]);

  // Story 9-57 (AI-Review H1) — the furthest-reached ceiling, computed
  // SYNCHRONOUSLY. `maxReachedStepIndex` is bumped by the effect above, which
  // lags draft hydration by one commit; on the hydration render its closure
  // value is still 0. Folding the hydrated draft step in here means the render
  // clamp + the over-reach correction never read a stale 0 on a `?token` resume
  // — which previously clamped an explicit `?step` resume down to step 0 when
  // the form query happened to settle before the draft hydrated.
  const effectiveMaxReached = Math.max(
    maxReachedStepIndex,
    draft.isHydrated ? draft.currentStepIndex : 0,
  );

  // Story 9-57 — the RENDERED current step, derived purely from the URL and
  // clamped to the furthest-reached step. This is the only navigation source;
  // there is no reverse effect that writes it back, so the 2026-05-12
  // URL↔state doom-loop is structurally impossible.
  const currentStepIndex = clampToReached(stepFromUrl, effectiveMaxReached);

  // Helper — write a step to the URL for USER navigation (Continue / Back /
  // indicator jumps), preserving other params (e.g. `?token`). This PUSHES a
  // history entry so browser back/forward moves between visited steps (AC4.3).
  // System-initiated URL corrections (the one-time seed + the over-reach clamp
  // below) use `replace` instead, so they never spam the history stack.
  const navigateToStep = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, steps.length - 1));
      const next = new URLSearchParams(searchParams);
      next.set('step', String(clamped));
      setSearchParams(next);
    },
    [searchParams, setSearchParams, steps.length],
  );

  // Story 9-57 AC3 — one-time URL seed. On first settled render, if the URL has
  // no `?step`, write one: the saved draft step for a `?token` resume, else 0.
  // An explicit `?step` always wins (we never overwrite it). Guarded by a ref so
  // it runs exactly once and can never loop.
  const hasSeededUrl = useRef(false);
  useEffect(() => {
    if (!draft.isHydrated || !formSettled) return;
    if (hasSeededUrl.current) return;
    hasSeededUrl.current = true;
    if (searchParams.get('step') !== null) return; // explicit ?step wins (AC3.2)
    const seed = resumeToken
      ? Math.max(0, Math.min(draft.currentStepIndex, steps.length - 1))
      : 0;
    const next = new URLSearchParams(searchParams);
    next.set('step', String(seed));
    setSearchParams(next, { replace: true });
  }, [
    draft.isHydrated,
    draft.currentStepIndex,
    formSettled,
    resumeToken,
    searchParams,
    setSearchParams,
    steps.length,
  ]);

  // Story 9-57 AC4.1 — self-correct an over-reaching URL. When `?step` points
  // beyond the furthest-reached step, rewrite it down to the clamp so the stale
  // (skip-ahead) value can't be re-shared or re-trigger a jump. One-directional
  // (only ever corrects DOWN to a fixed point) — not a two-way binding.
  useEffect(() => {
    if (!draft.isHydrated || !formSettled) return;
    if (stepFromUrl == null) return;
    if (stepFromUrl <= effectiveMaxReached) return;
    const next = new URLSearchParams(searchParams);
    next.set('step', String(effectiveMaxReached));
    setSearchParams(next, { replace: true });
  }, [draft.isHydrated, formSettled, stepFromUrl, effectiveMaxReached, searchParams, setSearchParams]);

  // Story 9-57 AC2 — write-only draft persistence. Mirror the URL-derived step
  // into the draft store so autosave/resume persist the right `currentStep`.
  // This NEVER feeds back into render/navigation (render reads the URL-derived
  // `currentStepIndex`, not `draft.currentStepIndex`), so there is no loop.
  // `draft.setCurrentStepIndex` is a stable callback (Story 9-57 hook change).
  useEffect(() => {
    if (!draft.isHydrated || !formSettled) return;
    // Only mirror once the URL carries an explicit `?step` (post-seed). Before
    // the seed lands, `currentStepIndex` defaults to 0 — mirroring it then would
    // clobber a `?token` resume's saved step back to 0 before the seed restores it.
    if (stepFromUrl == null) return;
    if (draft.currentStepIndex !== currentStepIndex) {
      persistStepToDraft(currentStepIndex);
    }
  }, [
    currentStepIndex,
    stepFromUrl,
    draft.currentStepIndex,
    draft.isHydrated,
    persistStepToDraft,
    formSettled,
  ]);

  const goToStep = useCallback(
    (idx: number) => {
      navigateToStep(idx);
    },
    [navigateToStep],
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
    const next = advanceStep(currentStepIndex, steps.length, isStepSkippable);
    // Story 9-57 — Continue is the only forward path, so bump the furthest-
    // reached ceiling here (batched with the URL change) — otherwise the derived
    // step would be clamped straight back. `next` is one step (plus auto-skips)
    // beyond the already-clamped current step, so a crafted URL can't inflate it.
    setMaxReachedStepIndex((m) => (next > m ? next : m));
    navigateToStep(next);
  }, [currentStepIndex, steps.length, isStepSkippable, navigateToStep]);

  const handleBack = useCallback(() => {
    if (currentStepIndex === 0) {
      navigate('/');
      return;
    }
    const prev = retreatStep(currentStepIndex, isStepSkippable);
    navigateToStep(prev);
  }, [currentStepIndex, isStepSkippable, navigateToStep, navigate]);

  // Step list for the indicator, annotated with which section steps are
  // currently auto-skipped (AC#E5 — greyed in the breadcrumb variant).
  const indicatorSteps = useMemo(
    () => steps.map((s, i) => ({ id: s.id, label: s.label, skipped: isStepSkippable(i) })),
    [steps, isStepSkippable],
  );

  // Story 9-54 AC6.2 — Step-5 completeness guard. Reuses the SAME shared rule
  // the server enforces (AC5) so Submit is disabled until every required +
  // relevant questionnaire answer is present; the server gate stays authoritative.
  const reviewCompleteness = useMemo(
    () => deriveReviewCompleteness(form, draft.formData, steps),
    [form, draft.formData, steps],
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
    // Story 9-54 AC6.2 — defence-in-depth: block submit if the questionnaire is
    // incomplete (the server AC5 gate is the authority, but fail fast in the UI).
    if (!reviewCompleteness.complete) {
      setSubmitError('Please answer all required survey questions before saving.');
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

      setCompletionData({
        submissionUid: result.submissionUid,
        referenceCode: result.referenceCode,
        pendingNin: pending,
      });
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
  }, [draft.formData, isSubmitting, reviewCompleteness]);

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
          referenceCode={completionData.referenceCode}
          pendingNin={completionData.pendingNin}
        />
      </WizardLayout>
    );
  }

  return (
    <WizardLayout
      steps={indicatorSteps}
      currentStepIndex={currentStepIndex}
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
        index: currentStepIndex,
        formData: draft.formData,
        mergeFields: draft.mergeFields,
        onContinue: handleContinue,
        onBack: handleBack,
        onGoToStep: goToStep,
        onSubmit: handleSubmit,
        isSubmitting,
        submitError,
        reviewCompleteness,
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
  reviewCompleteness: { complete: boolean; missing: string[]; missingStepIndex: number | null };
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
          incompleteQuestionnaire={!props.reviewCompleteness.complete}
          missingStepIndex={props.reviewCompleteness.missingStepIndex}
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
  referenceCode,
  pendingNin,
}: {
  email: string;
  referenceCode: string;
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
      {/* Story 9-58 — human-friendly application reference (replaces the raw
          submissions UUID on-screen). Quotable, readable, and accepted by the
          public status check + support search. */}
      <div className="rounded-lg bg-neutral-50 px-4 py-3" data-testid="wizard-complete-id">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Your application reference</p>
        <p
          className="font-mono text-lg font-semibold text-neutral-900 select-all"
          title="Quote this reference if you contact support"
        >
          {referenceCode}
        </p>
      </div>
      <p className="text-xs text-neutral-500">
        Lost this reference later?{' '}
        <Link to="/check-registration" className="text-primary-600 underline">
          Check your status here
        </Link>
        .
      </p>
    </div>
  );
}

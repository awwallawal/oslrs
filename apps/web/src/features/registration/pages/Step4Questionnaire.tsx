import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WizardNavigation } from '../components/WizardNavigation';
import { FormRenderer } from '../../forms/components/FormRenderer';
import { fetchPublicActiveForm, type WizardDraftData } from '../api/wizard.api';
import { NIN_QUESTION_NAMES } from '../lib/nin-question-names';

/**
 * Story 9-12 AC#1 Step 4 + Task 5.4 — Questionnaire injection (Option B).
 *
 * Fetches the form pinned by the `wizard.public_form_id` setting via
 * `GET /api/v1/forms/public-active` and mounts it through the decomposed
 * `<FormRenderer>` (Task 5.4.3).
 *
 * Side effects performed on mount once the schema lands:
 *   - Stamp `formHasNinQuestion` into the wizard draft (Task 4.6 + Step 5
 *     dispatcher Dev Notes — schema introspection).
 *   - Stamp `questionnaireFormId` + `questionnaireFormVersionId` into the
 *     wizard draft (Task 5.4.5 form-version locking).
 *
 * Inline pending-NIN link in `FormRenderer` (NIN question only) calls the
 * parent `onPendingNinTriggered` so the wizard can flip
 * `pendingNinToggle=true`, clear the questionnaire NIN response, and
 * advance the renderer to the next visible question.
 *
 * Empty-state: when `/forms/public-active` returns 404
 * (PUBLIC_FORM_NOT_CONFIGURED), the step renders a "Survey not yet
 * available — your registration will save without questionnaire responses"
 * message and exposes a Skip button that calls `onContinue` directly.
 */

export interface Step4Props {
  formData: WizardDraftData;
  mergeFields: (patch: Partial<WizardDraftData>) => void;
  onContinue: () => void;
  onBack?: () => void;
  /** Wizard-level handler: flip pendingNinToggle, clear NIN response, advance. */
  onPendingNinTriggered: () => void;
}

export function Step4Questionnaire({
  formData,
  mergeFields,
  onContinue,
  onBack,
  onPendingNinTriggered,
}: Step4Props) {
  const formQuery = useQuery({
    queryKey: ['wizard', 'public-active-form'],
    queryFn: fetchPublicActiveForm,
    staleTime: 5 * 60 * 1000,
  });

  const navApi = useRef<{ goNext: () => Promise<boolean>; goBack: () => void } | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const form = formQuery.data ?? null;

  // Schema introspection (Task 4.6 + Dev Notes — state-aware dispatcher).
  // Stamp form-version + NIN-question presence into the wizard draft.
  const stampedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!form) return;
    const stampKey = `${form.formId}@${form.version}`;
    if (stampedRef.current === stampKey) return;
    stampedRef.current = stampKey;

    const formHasNinQuestion = form.questions.some((q) =>
      (NIN_QUESTION_NAMES as readonly string[]).includes(q.name),
    );
    mergeFields({
      formHasNinQuestion,
      questionnaireFormId: form.formId,
      questionnaireFormVersionId: form.version,
    });
  }, [form, mergeFields]);

  const initialResponses = useMemo(
    () => formData.questionnaireResponses ?? {},
    [formData.questionnaireResponses],
  );

  if (formQuery.isLoading) {
    return (
      <div className="space-y-4" data-testid="step4-loading">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">Questionnaire</h2>
          <p className="text-sm text-neutral-600">Loading the survey…</p>
        </header>
        <div className="h-32 animate-pulse rounded-lg bg-neutral-100" aria-hidden="true" />
        <WizardNavigation onBack={onBack} onContinue={onContinue} isContinueDisabled />
      </div>
    );
  }

  // Empty-state: no public form configured (404) OR no form returned.
  if (!form) {
    return (
      <div className="space-y-4" data-testid="step4-empty">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">Survey not yet available</h2>
          <p className="mt-1 text-sm text-neutral-600">
            We don't have a questionnaire set up at the moment. Your registration will save without
            survey responses — you can come back later to complete it.
          </p>
        </header>
        <WizardNavigation
          onBack={onBack}
          onContinue={onContinue}
          continueLabel="Skip to NIN step"
        />
      </div>
    );
  }

  function handleAnswer(_questionName: string, _value: unknown, allAnswers: Record<string, unknown>) {
    mergeFields({ questionnaireResponses: allAnswers });
  }

  function handleComplete(allAnswers: Record<string, unknown>) {
    mergeFields({ questionnaireResponses: allAnswers });
    onContinue();
  }

  async function handleContinueClick() {
    if (!navApi.current) return;
    setIsAdvancing(true);
    try {
      await navApi.current.goNext();
    } finally {
      setIsAdvancing(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="step4-questionnaire">
      <header>
        <h2 className="text-xl font-semibold text-neutral-900">{form.title}</h2>
        <p className="mt-1 text-sm text-neutral-600">
          One question at a time. We auto-save as you go — you can come back later if you need to.
        </p>
      </header>

      <FormRenderer
        formSchema={form}
        initialResponses={initialResponses}
        onAnswer={handleAnswer}
        onComplete={handleComplete}
        onPendingNinClick={onPendingNinTriggered}
        hideNavigation
        onNavReady={(api) => {
          navApi.current = api;
        }}
      />

      <WizardNavigation
        onBack={onBack}
        onContinue={handleContinueClick}
        isSubmitting={isAdvancing}
      />
    </div>
  );
}

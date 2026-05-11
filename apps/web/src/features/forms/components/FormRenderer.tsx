import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Controller, useForm, type ResolverOptions } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { QuestionRenderer } from './QuestionRenderer';
import { ProgressBar } from './ProgressBar';
import { useNinCheck } from '../hooks/useNinCheck';
import {
  getVisibleQuestions,
  getNextVisibleIndex,
  getPrevVisibleIndex,
} from '../utils/skipLogic';
import { getCachedDynamicFormSchema, validateQuestionValue } from '../utils/formSchema';
import { NIN_QUESTION_NAMES } from '../../registration/lib/nin-question-names';
import type { FlattenedForm } from '../api/form.api';

/**
 * Story 9-12 Task 5.4.3 — reusable form renderer extracted from
 * `FormFillerPage`. The page becomes a thin route-mount wrapper; the wizard's
 * Step 4 mounts this component directly without the route chrome.
 *
 * Responsibilities preserved verbatim from `FormFillerPage`:
 *   - Skip-logic-aware one-question-per-screen navigation
 *   - Real-time NIN duplicate check (`useNinCheck`) — only when the visible
 *     question is NIN. State-aware Step 5 dispatcher consumes the dedupe-OK
 *     result via the `onAnswer` callback (Dev Notes: State A trigger).
 *   - react-hook-form validation against the dynamically generated Zod schema
 *
 * Net-new for the wizard:
 *   - `onPendingNinClick` callback fires when the inline pending-NIN link is
 *     activated on the NIN question. Step 4 parent dispatches into wizard
 *     state: `pendingNinToggle=true` + `questionnaireResponses.nin=null` +
 *     advance to next visible question (Dev Notes — State B trigger).
 *   - `onAnswer` fires on every value change so the wizard can stream into
 *     server-side draft autosave.
 *   - `onComplete` fires when the form runs out of visible questions
 *     (replaces the page-internal "Completion screen" — wizard owns its own).
 */

export interface FormRendererProps {
  formSchema: FlattenedForm;
  initialResponses?: Record<string, unknown>;
  initialIndex?: number;
  /** Fires on every answer change. Includes the question name + the full
   *  accumulated answer map for skip-logic correctness. */
  onAnswer?: (questionName: string, value: unknown, allAnswers: Record<string, unknown>) => void;
  /** Fires when navigation reaches the end of the visible question chain. */
  onComplete?: (allAnswers: Record<string, unknown>) => void;
  /** Wizard-only: invoked when the inline "I don't have my NIN now" link
   *  fires on the NIN question (Story 9-12 Task 6.1.x). Parent should set
   *  pendingNinToggle=true and advance past the NIN question programmatically. */
  onPendingNinClick?: () => void;
  /** Disable inputs (preview mode passes true). */
  disabled?: boolean;
  /** Hide the page-internal navigation buttons — wizard provides its own. */
  hideNavigation?: boolean;
  /** Optional ref-callback exposing programmatic navigation. */
  onNavReady?: (api: { goNext: () => Promise<boolean>; goBack: () => void }) => void;
}

export function FormRenderer({
  formSchema,
  initialResponses,
  initialIndex = 0,
  onAnswer,
  onComplete,
  onPendingNinClick,
  disabled = false,
  hideNavigation = false,
  onNavReady,
}: FormRendererProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);

  const ninCheck = useNinCheck();

  const resolver = useCallback(
    (values: Record<string, unknown>, context: unknown, options: ResolverOptions<Record<string, unknown>>) => {
      const visible = getVisibleQuestions(formSchema.questions, values, formSchema.sectionShowWhen);
      return zodResolver(getCachedDynamicFormSchema(visible))(values, context, options);
    },
    [formSchema],
  );

  const {
    control,
    trigger,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    resolver,
    mode: 'onChange',
    defaultValues: initialResponses ?? {},
    shouldUnregister: false,
  });

  const allAnswersRef = useRef<Record<string, unknown>>({ ...(initialResponses ?? {}) });
  const [formData, setFormData] = useState<Record<string, unknown>>({ ...(initialResponses ?? {}) });

  // Re-hydrate when caller passes fresh responses (e.g. wizard resume).
  const seedKeyRef = useRef<string>('');
  useEffect(() => {
    const seedKey = JSON.stringify(initialResponses ?? {});
    if (seedKey === seedKeyRef.current) return;
    seedKeyRef.current = seedKey;
    reset(initialResponses ?? {});
    allAnswersRef.current = { ...(initialResponses ?? {}) };
    setFormData({ ...(initialResponses ?? {}) });
  }, [initialResponses, reset]);

  const visibleQuestions = useMemo(
    () => getVisibleQuestions(formSchema.questions, formData, formSchema.sectionShowWhen),
    [formSchema, formData],
  );

  const currentQuestion = formSchema.questions[currentIndex] ?? null;
  const isCurrentNin = currentQuestion
    ? (NIN_QUESTION_NAMES as readonly string[]).includes(currentQuestion.name)
    : false;

  const visibleIndex = useMemo(() => {
    if (!currentQuestion) return 0;
    return visibleQuestions.findIndex((q) => q.id === currentQuestion.id);
  }, [visibleQuestions, currentQuestion]);

  const sections = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; title: string }[] = [];
    for (const q of formSchema.questions) {
      if (!seen.has(q.sectionId)) {
        seen.add(q.sectionId);
        result.push({ id: q.sectionId, title: q.sectionTitle });
      }
    }
    return result;
  }, [formSchema]);

  const handleNinBlur = useCallback(() => {
    if (!isCurrentNin || disabled) return;
    const value = String(formData[currentQuestion?.name ?? ''] ?? '');
    if (value && value.length === 11) {
      ninCheck.checkNin(value);
    } else {
      ninCheck.reset();
    }
  }, [isCurrentNin, disabled, formData, currentQuestion, ninCheck]);

  const ninDuplicateError = useMemo(() => {
    if (!isCurrentNin || !ninCheck.isDuplicate || !ninCheck.duplicateInfo) return undefined;
    const { reason, registeredAt } = ninCheck.duplicateInfo;
    if (reason === 'staff') {
      return 'This NIN belongs to a registered staff member. This form cannot be submitted for a duplicate NIN.';
    }
    const date = registeredAt ? new Date(registeredAt).toLocaleDateString() : 'unknown date';
    return `This NIN is already registered (since ${date}). This form cannot be submitted for a duplicate NIN.`;
  }, [isCurrentNin, ninCheck.isDuplicate, ninCheck.duplicateInfo]);

  const currentFieldError = currentQuestion
    ? (errors[currentQuestion.name]?.message as string | undefined)
    : undefined;
  const displayError = ninDuplicateError ?? currentFieldError;

  const goNext = useCallback(async (): Promise<boolean> => {
    if (!currentQuestion) return false;
    if (ninDuplicateError && !disabled) return false;

    if (!disabled) {
      const localError = validateQuestionValue(currentQuestion, formData[currentQuestion.name]);
      if (localError) {
        setError(currentQuestion.name, { type: 'manual', message: localError });
        return false;
      }
      const valid = await trigger(currentQuestion.name);
      if (!valid) return false;
    }

    const nextIdx = disabled
      ? (currentIndex + 1 < formSchema.questions.length ? currentIndex + 1 : -1)
      : getNextVisibleIndex(formSchema.questions, currentIndex, formData, formSchema.sectionShowWhen);

    if (nextIdx === -1) {
      onComplete?.(formData);
      return true;
    }

    setSlideDirection('left');
    setTimeout(() => {
      setCurrentIndex(nextIdx);
      clearErrors(currentQuestion.name);
      setSlideDirection(null);
    }, 50);
    return true;
  }, [
    currentQuestion,
    currentIndex,
    formData,
    formSchema,
    disabled,
    ninDuplicateError,
    trigger,
    setError,
    clearErrors,
    onComplete,
  ]);

  const goBack = useCallback(() => {
    const prevIdx = disabled
      ? (currentIndex > 0 ? currentIndex - 1 : -1)
      : getPrevVisibleIndex(formSchema.questions, currentIndex, formData, formSchema.sectionShowWhen);
    if (prevIdx === -1) return;

    setSlideDirection('right');
    setTimeout(() => {
      setCurrentIndex(prevIdx);
      if (currentQuestion) clearErrors(currentQuestion.name);
      setSlideDirection(null);
    }, 50);
  }, [currentIndex, currentQuestion, formData, formSchema, disabled, clearErrors]);

  // Expose imperative API once on mount (and on goNext/goBack identity change).
  useEffect(() => {
    onNavReady?.({ goNext, goBack });
  }, [goNext, goBack, onNavReady]);

  const hasNextQuestion = useMemo(() => {
    if (disabled) return currentIndex + 1 < formSchema.questions.length;
    return getNextVisibleIndex(formSchema.questions, currentIndex, formData, formSchema.sectionShowWhen) !== -1;
  }, [formSchema, currentIndex, formData, disabled]);

  if (!currentQuestion) {
    return (
      <div className="text-center text-neutral-600" data-testid="form-renderer-empty">
        No questions available.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="form-renderer">
      <ProgressBar
        currentIndex={visibleIndex >= 0 ? visibleIndex : 0}
        totalVisible={visibleQuestions.length}
        sections={sections}
        currentSectionId={currentQuestion.sectionId}
      />

      <div
        className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${slideDirection === 'left' ? '-translate-x-2 opacity-95' : ''}
          ${slideDirection === 'right' ? 'translate-x-2 opacity-95' : ''}`}
        data-testid="question-card"
        onBlur={isCurrentNin ? handleNinBlur : undefined}
      >
        <Controller
          name={currentQuestion.name}
          control={control}
          render={({ field }) => (
            <QuestionRenderer
              question={currentQuestion}
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                allAnswersRef.current[currentQuestion.name] = value;
                const next = { ...allAnswersRef.current };
                setFormData(next);
                clearErrors(currentQuestion.name);
                if (isCurrentNin) ninCheck.reset();
                onAnswer?.(currentQuestion.name, value, next);
              }}
              error={displayError}
              disabled={disabled}
            />
          )}
        />
        {isCurrentNin && ninCheck.isChecking && (
          <p className="text-sm text-gray-500 mt-2" data-testid="nin-checking">
            Checking NIN availability...
          </p>
        )}
        {isCurrentNin && onPendingNinClick && !disabled && (
          <button
            type="button"
            onClick={onPendingNinClick}
            className="mt-3 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded"
            data-testid="form-renderer-pending-nin-link"
          >
            I don't have my NIN now
          </button>
        )}
      </div>

      {!hideNavigation && (
        <div className="flex flex-col-reverse md:flex-row gap-3">
          {visibleIndex > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="min-h-[48px] md:min-h-[48px] px-6 py-3 bg-white border border-gray-200 text-gray-500 rounded-lg font-medium hover:bg-gray-50 transition-colors md:flex-1"
              data-testid="back-btn"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={goNext}
            disabled={!!displayError || ninCheck.isChecking}
            className={`min-h-[56px] md:min-h-[48px] px-6 py-3 bg-[#9C1E23] text-white rounded-lg font-medium
              hover:bg-[#7A171B] transition-colors flex-1
              ${displayError || ninCheck.isChecking ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid="continue-btn"
          >
            {!hasNextQuestion ? 'Complete' : 'Continue'}
          </button>
        </div>
      )}
    </div>
  );
}

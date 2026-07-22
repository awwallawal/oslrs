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
import { NIN_QUESTION_NAMES } from '../../registration/lib/wizard-provided-field-names';
import { geopointQuestionNames, hasGeopointQuestion } from '../utils/geopoint-suppression';
import { withCalculatedFields } from '@oslsr/utils/src/xlsform-calculate';
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
  /**
   * Story 9-18 AC#B3 — Pattern C wizard field dedup. Question names in this set
   * are filtered out of the user-visible flow (iteration + skip-logic +
   * progress count) because the wizard already collected the answer and
   * auto-filled it into `initialResponses`. The questions remain in the schema
   * (form-version locking unchanged) and their pre-filled values still flow
   * through to `onComplete`/`onAnswer`. Optional — non-wizard consumers omit it
   * and behave unchanged.
   */
  hideQuestionNames?: ReadonlySet<string>;
  /**
   * Story 9-18 Part E (AC#E2) — render ONLY the section at this ordinal index
   * (sections ordered by first appearance in `questions`). Questions outside the
   * section are scoped out of the user-visible flow; their answers still flow
   * through to `onComplete`, and cross-section `showWhen` still resolves against
   * the cumulative `initialResponses`. Omit (undefined) for all-sections mode
   * (clerk-data-entry / form-filler) — behaviour unchanged.
   */
  sectionIndex?: number;
  /** Optional ref-callback exposing programmatic navigation. */
  onNavReady?: (api: { goNext: () => Promise<boolean>; goBack: () => void }) => void;
  /**
   * Story 13-34 AC2 — defensive public-context guard. When true, any question of
   * type `geopoint` is scoped OUT of the user-visible flow (never rendered, never
   * CLIENT-validated, excluded from the progress count) — belt-and-suspenders so
   * a future form re-upload that re-introduces GPS can never surface a
   * `navigator.geolocation` permission prompt on the public respondent path
   * (where captured coordinates are discarded anyway). The public wizard
   * (Step4Questionnaire) and the Cohort-A supplemental survey opt in; the
   * clerk/enumerator/form-filler contexts omit it, so field GPS still renders.
   *
   * Client-side suppression alone is NOT sufficient for a REQUIRED geopoint —
   * hiding it would make the authoritative server gate reject the submission
   * (422 INCOMPLETE_SUBMISSION) naming a field the user cannot see. The
   * co-required pieces: `WizardPage.isStepSkippable` +
   * `deriveReviewCompleteness` (both union the same names via
   * `utils/geopoint-suppression`) and the server's
   * `CompletenessOptions.excludeGeopoint` on the public submit paths.
   */
  suppressGeopoint?: boolean;
}

/** Ordered distinct section ids (by first appearance). */
function orderedSectionIds(questions: FlattenedForm['questions']): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const q of questions) {
    if (!seen.has(q.sectionId)) {
      seen.add(q.sectionId);
      ordered.push(q.sectionId);
    }
  }
  return ordered;
}

/**
 * Story 9-18 Part E (AC#E2) — section scoping is implemented as a hide-set union:
 * every question outside the target section is added to `hideQuestionNames`, so
 * the existing skip-logic / iteration / snap / empty-state paths handle
 * section-at-a-time rendering with no special-casing. Returns `hideQuestionNames`
 * unchanged when `sectionIndex` is undefined (all-sections mode).
 */
function buildEffectiveHidden(
  questions: FlattenedForm['questions'],
  hideQuestionNames: ReadonlySet<string> | undefined,
  sectionIndex: number | undefined,
  suppressGeopoint: boolean,
): ReadonlySet<string> | undefined {
  // Story 13-34 AC2 — public-context geopoint suppression is expressed as a
  // hide-set union (same machinery as wizard-prefill dedup + section scoping):
  // every geopoint question is added to the hidden set, so the existing
  // skip-logic / iteration / snap / empty-state / validation-exclusion paths
  // guarantee it never renders and never gates navigation. The name derivation
  // lives in `utils/geopoint-suppression` because the wizard's skip + Review
  // completeness gates MUST union the identical set (13-29 lesson).
  const geopointToHide = suppressGeopoint && hasGeopointQuestion(questions);

  // Fast path: nothing to add — return the caller's set verbatim (back-compat).
  if (sectionIndex == null && !geopointToHide) return hideQuestionNames;

  const set = new Set(hideQuestionNames ?? []);
  if (geopointToHide) {
    for (const name of geopointQuestionNames(questions)) set.add(name);
  }
  if (sectionIndex != null) {
    const targetSectionId = orderedSectionIds(questions)[sectionIndex];
    for (const q of questions) {
      if (q.sectionId !== targetSectionId) set.add(q.name);
    }
  }
  return set;
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
  hideQuestionNames,
  sectionIndex,
  onNavReady,
  suppressGeopoint = false,
}: FormRendererProps) {
  // AI-Review L4: start on the first non-hidden question so a leading
  // wizard-prefilled (or out-of-section, AC#E2) question never paints for a frame
  // before the snap effect (below) moves off it. When nothing is hidden the
  // behaviour is identical to the old `useState(initialIndex)`.
  const [currentIndex, setCurrentIndex] = useState(() => {
    const eff = buildEffectiveHidden(formSchema.questions, hideQuestionNames, sectionIndex, suppressGeopoint);
    if (!eff?.size) return initialIndex;
    // Story 9-54 AC1 — evaluate computed fields into the seed answer map so a
    // section gated on a calculated field (e.g. ${age}) resolves at mount.
    const seedEval = withCalculatedFields(initialResponses ?? {}, formSchema.calculations, new Date());
    const first = getNextVisibleIndex(
      formSchema.questions,
      initialIndex - 1,
      seedEval,
      formSchema.sectionShowWhen,
      eff,
    );
    return first === -1 ? initialIndex : first;
  });
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);

  const ninCheck = useNinCheck();

  // Story 9-18 AC#B3 + AC#E2 — the set of question names scoped OUT of the
  // user-visible flow: wizard-prefilled fields ∪ (when sectionIndex is set) every
  // question outside the active section.
  const effectiveHidden = useMemo(
    () => buildEffectiveHidden(formSchema.questions, hideQuestionNames, sectionIndex, suppressGeopoint),
    [formSchema, hideQuestionNames, sectionIndex, suppressGeopoint],
  );

  const resolver = useCallback(
    (values: Record<string, unknown>, context: unknown, options: ResolverOptions<Record<string, unknown>>) => {
      // Story 9-18 AC#B3: hidden (wizard-prefilled) questions are excluded from
      // validation too — their values are already valid and the user can't reach
      // them to fix anything, so they must never gate navigation.
      const visible = getVisibleQuestions(formSchema.questions, values, formSchema.sectionShowWhen, effectiveHidden);
      return zodResolver(getCachedDynamicFormSchema(visible))(values, context, options);
    },
    [formSchema, effectiveHidden],
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

  // Story 9-54 AC1 — answer map augmented with computed (calculate) fields.
  // Skip-logic evaluates against THIS so section/question showWhen referencing
  // a computed field (e.g. ${age} >= 15) resolves; raw `formData` still holds
  // the actual user answers for validation, onChange, and submission.
  const evalData = useMemo(
    () => withCalculatedFields(formData, formSchema.calculations, new Date()),
    [formData, formSchema.calculations],
  );

  const visibleQuestions = useMemo(
    () => getVisibleQuestions(formSchema.questions, evalData, formSchema.sectionShowWhen, effectiveHidden),
    [formSchema, evalData, effectiveHidden],
  );

  // Story 9-18 AC#B3: never rest on a hidden (wizard-prefilled) question. The
  // hide set can populate AFTER mount (Step 4 computes it post-render), so snap
  // forward — or back if none forward — whenever the current index lands on one.
  useEffect(() => {
    const cur = formSchema.questions[currentIndex];
    if (!cur || !effectiveHidden?.has(cur.name)) return;
    const fwd = getNextVisibleIndex(formSchema.questions, currentIndex, evalData, formSchema.sectionShowWhen, effectiveHidden);
    if (fwd !== -1) {
      setCurrentIndex(fwd);
      return;
    }
    const back = getPrevVisibleIndex(formSchema.questions, currentIndex, evalData, formSchema.sectionShowWhen, effectiveHidden);
    if (back !== -1) setCurrentIndex(back);
  }, [currentIndex, formSchema, evalData, effectiveHidden]);

  const currentQuestion = formSchema.questions[currentIndex] ?? null;
  const isCurrentNin = currentQuestion
    ? NIN_QUESTION_NAMES.includes(currentQuestion.name)
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

  // AI-Review L3 (13-34) — preview (`disabled`) navigation deliberately ignores
  // skip-logic so a previewer walks EVERY question, but it must still honour the
  // hide-set: a suppressed/prefilled question isn't "not applicable right now",
  // it is unreachable. Step over hidden names instead of landing on one and
  // relying on the snap effect to bounce away (which flashed the question).
  // Identical to the old `currentIndex ± 1` when nothing is hidden.
  const stepIgnoringSkipLogic = useCallback(
    (from: number, dir: 1 | -1): number => {
      for (let i = from + dir; i >= 0 && i < formSchema.questions.length; i += dir) {
        if (!effectiveHidden?.has(formSchema.questions[i].name)) return i;
      }
      return -1;
    },
    [formSchema, effectiveHidden],
  );

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
      ? stepIgnoringSkipLogic(currentIndex, 1)
      : getNextVisibleIndex(formSchema.questions, currentIndex, evalData, formSchema.sectionShowWhen, effectiveHidden);

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
    evalData,
    formSchema,
    disabled,
    ninDuplicateError,
    effectiveHidden,
    stepIgnoringSkipLogic,
    trigger,
    setError,
    clearErrors,
    onComplete,
  ]);

  const goBack = useCallback(() => {
    const prevIdx = disabled
      ? stepIgnoringSkipLogic(currentIndex, -1)
      : getPrevVisibleIndex(formSchema.questions, currentIndex, evalData, formSchema.sectionShowWhen, effectiveHidden);
    if (prevIdx === -1) return;

    setSlideDirection('right');
    setTimeout(() => {
      setCurrentIndex(prevIdx);
      if (currentQuestion) clearErrors(currentQuestion.name);
      setSlideDirection(null);
    }, 50);
  }, [currentIndex, currentQuestion, evalData, formSchema, disabled, effectiveHidden, stepIgnoringSkipLogic, clearErrors]);

  // Expose imperative API once on mount (and on goNext/goBack identity change).
  useEffect(() => {
    onNavReady?.({ goNext, goBack });
  }, [goNext, goBack, onNavReady]);

  const hasNextQuestion = useMemo(() => {
    if (disabled) return stepIgnoringSkipLogic(currentIndex, 1) !== -1;
    return getNextVisibleIndex(formSchema.questions, currentIndex, evalData, formSchema.sectionShowWhen, effectiveHidden) !== -1;
  }, [formSchema, currentIndex, evalData, disabled, effectiveHidden, stepIgnoringSkipLogic]);

  // AI-Review M3: also guard the degenerate case where EVERY question is hidden
  // (e.g. a form composed entirely of wizard-provided fields). The snap effect
  // can't find a forward/back visible index, so `currentQuestion` would otherwise
  // remain a hidden, pre-filled question and paint it. The wizard still completes
  // via the imperative goNext API (which returns -1 → onComplete).
  if (!currentQuestion || visibleQuestions.length === 0) {
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

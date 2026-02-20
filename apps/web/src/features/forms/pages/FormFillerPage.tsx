import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Controller, useForm, useWatch, type ResolverOptions } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFormSchema, useFormPreview } from '../hooks/useForms';
import { useDraftPersistence } from '../hooks/useDraftPersistence';
import { QuestionRenderer } from '../components/QuestionRenderer';
import { ProgressBar } from '../components/ProgressBar';
import { PreviewBanner } from '../components/PreviewBanner';
import {
  getVisibleQuestions,
  getNextVisibleIndex,
  getPrevVisibleIndex,
} from '../utils/skipLogic';
import { getCachedDynamicFormSchema, validateQuestionValue } from '../utils/formSchema';
import { SkeletonCard, SkeletonText } from '../../../components/skeletons';
import { useAuth } from '../../auth';
import { useNinCheck } from '../hooks/useNinCheck';

const NIN_QUESTION_NAMES = ['nin', 'national_id'];

interface FormFillerPageProps {
  mode?: 'fill' | 'preview';
}

export default function FormFillerPage({ mode = 'fill' }: FormFillerPageProps) {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPublicUser = user?.role === 'public_user';
  const renderQuery = useFormSchema(mode === 'fill' ? (formId ?? '') : '');
  const previewQuery = useFormPreview(mode === 'preview' ? (formId ?? '') : '');
  const { data: form, isLoading, error: fetchError } = mode === 'preview' ? previewQuery : renderQuery;

  // currentIndex tracks position in the FULL form.questions array (not the visible subset)
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  // Track form start time for speed-run fraud detection (Story 4.3)
  const formStartedAtRef = useRef<number>(Date.now());

  const isPreview = mode === 'preview';
  const ninCheck = useNinCheck();

  const resolver = useCallback(
    (values: Record<string, unknown>, context: unknown, options: ResolverOptions<Record<string, unknown>>) => {
      if (!form) {
        return { values, errors: {} };
      }
      const visible = getVisibleQuestions(form.questions, values, form.sectionShowWhen);
      return zodResolver(getCachedDynamicFormSchema(visible))(values, context, options);
    },
    [form]
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
    defaultValues: {},
  });

  const watchedFormData = useWatch({ control }) as Record<string, unknown> | undefined;
  const formData = useMemo<Record<string, unknown>>(
    () => watchedFormData ?? {},
    [watchedFormData]
  );

  // Draft persistence (disabled in preview mode)
  const draft = useDraftPersistence({
    formId: formId ?? '',
    formVersion: form?.version ?? '1.0.0',
    formData,
    currentIndex,
    enabled: !isPreview && !!formId,
    formStartedAt: formStartedAtRef.current,
  });

  // Resume from existing draft on first load
  useEffect(() => {
    if (!draftLoaded && draft.resumeData && !draft.loading) {
      reset(draft.resumeData.formData);
      setCurrentIndex(draft.resumeData.questionPosition);
      setDraftLoaded(true);
    } else if (!draft.loading && !draft.resumeData) {
      setDraftLoaded(true);
    }
  }, [draft.resumeData, draft.loading, draftLoaded, reset]);

  const visibleQuestions = useMemo(() => {
    if (!form) return [];
    return getVisibleQuestions(form.questions, formData, form.sectionShowWhen);
  }, [form, formData]);

  // Current question from the FULL array
  const currentQuestion = form?.questions[currentIndex] ?? null;
  const isCurrentNin = currentQuestion ? NIN_QUESTION_NAMES.includes(currentQuestion.name) : false;

  // Visible index for progress display
  const visibleIndex = useMemo(() => {
    if (!currentQuestion) return 0;
    return visibleQuestions.findIndex((q) => q.id === currentQuestion.id);
  }, [visibleQuestions, currentQuestion]);

  // Deduplicate sections in order they appear
  const sections = useMemo(() => {
    if (!form) return [];
    const seen = new Set<string>();
    const result: { id: string; title: string }[] = [];
    for (const q of form.questions) {
      if (!seen.has(q.sectionId)) {
        seen.add(q.sectionId);
        result.push({ id: q.sectionId, title: q.sectionTitle });
      }
    }
    return result;
  }, [form]);

  const handleNinBlur = useCallback(() => {
    if (!isCurrentNin || isPreview) return;
    const value = String(formData[currentQuestion?.name ?? ''] ?? '');
    if (value && value.length === 11) {
      ninCheck.checkNin(value);
    } else {
      ninCheck.reset();
    }
  }, [isCurrentNin, isPreview, formData, currentQuestion, ninCheck]);

  // Build display error: NIN duplicate takes priority over validation error
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

  const handleContinue = useCallback(async () => {
    if (!currentQuestion || !form) return;

    // Block continue if NIN duplicate detected
    if (ninDuplicateError && !isPreview) return;

    // Validate current question before advancing.
    if (!isPreview) {
      const localError = validateQuestionValue(currentQuestion, formData[currentQuestion.name]);
      if (localError) {
        setError(currentQuestion.name, {
          type: 'manual',
          message: localError,
        });
        return;
      }

      const valid = await trigger(currentQuestion.name);
      if (!valid) return;
    }

    if (
      currentIndex === 0 &&
      currentQuestion.name === 'consent_marketplace' &&
      formData[currentQuestion.name] !== 'yes' &&
      !isPreview
    ) {
      setError(currentQuestion.name, {
        type: 'manual',
        message: 'Marketplace consent is required to continue',
      });
      return;
    }

    // Use full-array index for navigation
    const nextIdx = getNextVisibleIndex(form.questions, currentIndex, formData, form.sectionShowWhen);
    if (nextIdx === -1) {
      // End of form — complete draft
      if (!isPreview) {
        await draft.completeDraft();
      }
      setCompleted(true);
      return;
    }

    setSlideDirection('left');
    setTimeout(() => {
      setCurrentIndex(nextIdx);
      clearErrors(currentQuestion.name);
      setSlideDirection(null);
    }, 50);
  }, [currentQuestion, currentIndex, formData, form, isPreview, draft, ninDuplicateError, trigger, setError, clearErrors]);

  const handleBack = useCallback(() => {
    if (!form) return;

    // Use full-array index for navigation
    const prevIdx = getPrevVisibleIndex(form.questions, currentIndex, formData, form.sectionShowWhen);
    if (prevIdx === -1) return;

    setSlideDirection('right');
    setTimeout(() => {
      setCurrentIndex(prevIdx);
      if (currentQuestion) {
        clearErrors(currentQuestion.name);
      }
      setSlideDirection(null);
    }, 50);
  }, [currentIndex, currentQuestion, formData, form, clearErrors]);

  // Determine if there's a next visible question (for button label)
  const hasNextQuestion = useMemo(() => {
    if (!form) return false;
    return getNextVisibleIndex(form.questions, currentIndex, formData, form.sectionShowWhen) !== -1;
  }, [form, currentIndex, formData]);

  // Loading state
  if (isLoading || (!draftLoaded && !isPreview)) {
    return (
      <div className="max-w-[600px] mx-auto p-6 space-y-4">
        <SkeletonText width="60%" />
        <SkeletonCard />
        <SkeletonText width="100%" />
      </div>
    );
  }

  // Error state
  if (fetchError || !form) {
    return (
      <div className="max-w-[600px] mx-auto p-6 text-center">
        <p className="text-red-600" data-testid="form-error">
          {fetchError?.message || 'Form not found'}
        </p>
      </div>
    );
  }

  // Completion screen
  if (completed) {
    return (
      <div className="max-w-[400px] mx-auto p-6 text-center space-y-4" data-testid="completion-screen">
        {isPreview ? (
          <>
            <div className="text-6xl animate-bounce">✓</div>
            <h2 className="text-xl font-semibold text-gray-900">Preview Complete</h2>
            <p className="text-gray-600">You've reached the end of this form preview.</p>
            <button
              onClick={() => navigate(-1)}
              className="px-6 py-3 bg-[#9C1E23] text-white rounded-lg font-medium hover:bg-[#7A171B] transition-colors"
              data-testid="exit-preview-btn"
            >
              Exit Preview
            </button>
          </>
        ) : (
          <>
            <div className="text-6xl animate-scale-in">
              ✓
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Survey saved!</h2>
            {isPublicUser ? (
              <>
                <p className="text-gray-600" data-testid="civic-message">
                  Thank you for contributing to the Oyo State Labour Registry
                </p>
                <p className="text-sm text-gray-500">
                  It will be uploaded when connected.
                </p>
                <div className="flex flex-col gap-3 pt-2">
                  <button
                    onClick={() => navigate('/dashboard/public')}
                    className="px-6 py-3 bg-[#9C1E23] text-white rounded-lg font-medium hover:bg-[#7A171B] transition-colors"
                    data-testid="back-to-dashboard-btn"
                  >
                    Back to Dashboard
                  </button>
                  <button
                    onClick={() => navigate('/dashboard/public/surveys')}
                    className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                    data-testid="view-all-surveys-btn"
                  >
                    View All Surveys
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-600">
                  It will be uploaded when connected.
                </p>
                <button
                  onClick={() => navigate(-1)}
                  className="px-6 py-3 bg-[#9C1E23] text-white rounded-lg font-medium hover:bg-[#7A171B] transition-colors"
                  data-testid="back-to-surveys-btn"
                >
                  Back to Surveys
                </button>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // No visible questions
  if (!currentQuestion) {
    return (
      <div className="max-w-[600px] mx-auto p-6 text-center">
        <p className="text-gray-600">No questions available.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {isPreview && <PreviewBanner />}

      <div className="max-w-[600px] mx-auto p-4 md:p-6 space-y-6">
        {/* Progress — uses visible index for display */}
        <ProgressBar
          currentIndex={visibleIndex >= 0 ? visibleIndex : 0}
          totalVisible={visibleQuestions.length}
          sections={sections}
          currentSectionId={currentQuestion.sectionId}
        />

        {/* Question Card */}
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
                  clearErrors(currentQuestion.name);
                  if (isCurrentNin) {
                    ninCheck.reset();
                  }
                }}
                error={displayError}
                disabled={isPreview}
              />
            )}
          />
          {isCurrentNin && ninCheck.isChecking && (
            <p className="text-sm text-gray-500 mt-2" data-testid="nin-checking">Checking NIN availability...</p>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex flex-col-reverse md:flex-row gap-3">
          {visibleIndex > 0 && (
            <button
              onClick={handleBack}
              className="min-h-[48px] md:min-h-[48px] px-6 py-3 bg-white border border-gray-200 text-gray-500 rounded-lg font-medium hover:bg-gray-50 transition-colors md:flex-1"
              data-testid="back-btn"
            >
              Back
            </button>
          )}
          <button
            onClick={handleContinue}
            disabled={!!displayError || ninCheck.isChecking}
            className={`min-h-[56px] md:min-h-[48px] px-6 py-3 bg-[#9C1E23] text-white rounded-lg font-medium
              hover:bg-[#7A171B] transition-colors flex-1
              ${displayError || ninCheck.isChecking ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid="continue-btn"
          >
            {!hasNextQuestion
              ? isPreview
                ? 'Finish Preview'
                : 'Complete Survey'
              : 'Continue'}
          </button>
        </div>
      </div>

    </div>
  );
}

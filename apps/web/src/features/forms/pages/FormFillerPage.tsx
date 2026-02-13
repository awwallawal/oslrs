import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import type { FlattenedQuestion } from '../api/form.api';
import type { ValidationRule } from '@oslsr/types';
import { modulus11Check } from '@oslsr/utils/src/validation';
import { SkeletonCard, SkeletonText } from '../../../components/skeletons';
import { useAuth } from '../../auth';

interface FormFillerPageProps {
  mode?: 'fill' | 'preview';
}

function validateQuestion(
  question: FlattenedQuestion,
  value: unknown
): string | undefined {
  if (question.required) {
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
      return 'This field is required';
    }
  }

  if (!question.validation || value == null || value === '') return undefined;

  for (const rule of question.validation) {
    const error = checkRule(rule, value, question);
    if (error) return error;
  }
  return undefined;
}

function checkRule(
  rule: ValidationRule,
  value: unknown,
  _question: FlattenedQuestion
): string | undefined {
  const strVal = String(value);
  const numVal = Number(value);

  switch (rule.type) {
    case 'minLength':
      if (strVal.length < Number(rule.value)) return rule.message;
      break;
    case 'maxLength':
      if (strVal.length > Number(rule.value)) return rule.message;
      break;
    case 'min':
      if (isNaN(numVal) || numVal < Number(rule.value)) return rule.message;
      break;
    case 'max':
      if (isNaN(numVal) || numVal > Number(rule.value)) return rule.message;
      break;
    case 'regex':
      if (!new RegExp(String(rule.value)).test(strVal)) return rule.message;
      break;
    case 'modulus11':
      if (!modulus11Check(strVal)) return rule.message;
      break;
  }
  return undefined;
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
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [validationError, setValidationError] = useState<string | undefined>();
  const [completed, setCompleted] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);

  const isPreview = mode === 'preview';

  // Draft persistence (disabled in preview mode)
  const draft = useDraftPersistence({
    formId: formId ?? '',
    formVersion: form?.version ?? '1.0.0',
    formData,
    currentIndex,
    enabled: !isPreview && !!formId,
  });

  // Resume from existing draft on first load
  useEffect(() => {
    if (!draftLoaded && draft.resumeData && !draft.loading) {
      setFormData(draft.resumeData.formData);
      setCurrentIndex(draft.resumeData.questionPosition);
      setDraftLoaded(true);
    } else if (!draft.loading && !draft.resumeData) {
      setDraftLoaded(true);
    }
  }, [draft.resumeData, draft.loading, draftLoaded]);

  const visibleQuestions = useMemo(() => {
    if (!form) return [];
    return getVisibleQuestions(form.questions, formData, form.sectionShowWhen);
  }, [form, formData]);

  // Current question from the FULL array
  const currentQuestion = form?.questions[currentIndex] ?? null;

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

  const handleChange = useCallback(
    (value: unknown) => {
      if (isPreview || !currentQuestion) return;
      setFormData((prev) => ({
        ...prev,
        [currentQuestion.name]: value,
      }));
      setValidationError(undefined);
    },
    [currentQuestion, isPreview]
  );

  const handleContinue = useCallback(async () => {
    if (!currentQuestion || !form) return;

    // Validate current question before advancing
    const error = validateQuestion(currentQuestion, formData[currentQuestion.name]);
    if (error && !isPreview) {
      setValidationError(error);
      return;
    }

    // Check if marketplace consent is first question and was declined
    if (
      currentIndex === 0 &&
      currentQuestion.name === 'consent_marketplace' &&
      formData[currentQuestion.name] !== 'yes' &&
      !isPreview
    ) {
      setValidationError('Marketplace consent is required to continue');
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
      setValidationError(undefined);
      setSlideDirection(null);
    }, 50);
  }, [currentQuestion, currentIndex, formData, form, isPreview, draft]);

  const handleBack = useCallback(() => {
    if (!form) return;

    // Use full-array index for navigation
    const prevIdx = getPrevVisibleIndex(form.questions, currentIndex, formData, form.sectionShowWhen);
    if (prevIdx === -1) return;

    setSlideDirection('right');
    setTimeout(() => {
      setCurrentIndex(prevIdx);
      setValidationError(undefined);
      setSlideDirection(null);
    }, 50);
  }, [currentIndex, formData, form]);

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
        >
          <QuestionRenderer
            question={currentQuestion}
            value={formData[currentQuestion.name]}
            onChange={handleChange}
            error={validationError}
            disabled={isPreview}
          />
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
            disabled={!!validationError}
            className={`min-h-[56px] md:min-h-[48px] px-6 py-3 bg-[#9C1E23] text-white rounded-lg font-medium
              hover:bg-[#7A171B] transition-colors flex-1
              ${validationError ? 'opacity-50 cursor-not-allowed' : ''}`}
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

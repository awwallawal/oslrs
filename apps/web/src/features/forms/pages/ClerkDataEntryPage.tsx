/**
 * Clerk Data Entry Page - Keyboard-optimized all-fields form
 *
 * Story 3.6: AC3.6.1 (all-fields layout), AC3.6.2 (Tab/Shift+Tab),
 * AC3.6.3 (Enter-to-advance), AC3.6.4 (Ctrl+Enter submit),
 * AC3.6.5 (auto-reset), AC3.6.6 (session tracking),
 * AC3.6.7 (Ctrl+S save draft), AC3.6.8 (validation & Ctrl+E error jump)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Controller, useForm, useWatch, type ResolverOptions } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useFormSchema } from '../hooks/useForms';
import { useDraftPersistence } from '../hooks/useDraftPersistence';
import { getVisibleQuestions } from '../utils/skipLogic';
import { QuestionRenderer } from '../components/QuestionRenderer';
import type { FlattenedQuestion } from '../api/form.api';
import { Card, CardContent } from '../../../components/ui/card';
import { SkeletonForm } from '../../../components/skeletons';
import { useToast } from '../../../hooks/useToast';
import { useNinCheck } from '../hooks/useNinCheck';
import { getCachedDynamicFormSchema } from '../utils/formSchema';

const NIN_QUESTION_NAMES = ['nin', 'national_id'];

interface Section {
  id: string;
  title: string;
  questions: FlattenedQuestion[];
}

function isEmptyValue(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

export default function ClerkDataEntryPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  // Form schema
  const { data: form, isLoading, error: fetchError } = useFormSchema(formId ?? '');
  const formStartRef = useRef(Date.now());
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

  // Session tracking (persisted to sessionStorage)
  const [session, setSession] = useState(() => {
    const stored = sessionStorage.getItem('clerk-session');
    if (stored) {
      try {
        return JSON.parse(stored) as { count: number; totalTimeMs: number };
      } catch {
        // fall through
      }
    }
    return { count: 0, totalTimeMs: 0 };
  });
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Draft persistence
  const draft = useDraftPersistence({
    formId: formId ?? '',
    formVersion: form?.version ?? '',
    formData,
    currentIndex: 0,
    enabled: !!formId && !!form,
  });

  // Resume from existing draft if available
  useEffect(() => {
    if (draft.resumeData && Object.keys(draft.resumeData.formData).length > 0) {
      reset(draft.resumeData.formData as Record<string, unknown>);
    }
  }, [draft.resumeData, reset]);

  // Skip logic: get visible questions
  const allQuestions = useMemo(() => form?.questions ?? [], [form?.questions]);
  const visibleQuestions = useMemo(
    () => getVisibleQuestions(allQuestions, formData, form?.sectionShowWhen),
    [allQuestions, formData, form?.sectionShowWhen]
  );

  // Group visible questions by section
  const sections: Section[] = useMemo(() => {
    const sectionMap = new Map<string, Section>();
    for (const q of visibleQuestions) {
      if (!sectionMap.has(q.sectionId)) {
        sectionMap.set(q.sectionId, {
          id: q.sectionId,
          title: q.sectionTitle,
          questions: [],
        });
      }
      sectionMap.get(q.sectionId)!.questions.push(q);
    }
    return Array.from(sectionMap.values());
  }, [visibleQuestions]);

  // NIN duplicate error message
  const ninDuplicateError = useMemo(() => {
    if (!ninCheck.isDuplicate || !ninCheck.duplicateInfo) return undefined;
    const { reason, registeredAt } = ninCheck.duplicateInfo;
    if (reason === 'staff') {
      return 'This NIN belongs to a registered staff member. This form cannot be submitted for a duplicate NIN.';
    }
    const date = registeredAt ? new Date(registeredAt).toLocaleDateString() : 'unknown date';
    return `This NIN is already registered (since ${date}). This form cannot be submitted for a duplicate NIN.`;
  }, [ninCheck.isDuplicate, ninCheck.duplicateInfo]);

  // Find the NIN question name in this form (if any)
  const ninQuestionName = useMemo(() => {
    return allQuestions.find((q) => NIN_QUESTION_NAMES.includes(q.name))?.name;
  }, [allQuestions]);

  const validationErrors = useMemo(() => {
    const nextErrors: Record<string, string> = {};
    for (const q of visibleQuestions) {
      const fieldError = errors[q.name]?.message as string | undefined;
      const fieldValue = formData[q.name];
      const isStaleRequiredError =
        fieldError === 'This field is required' && !isEmptyValue(fieldValue);

      if (fieldError && !isStaleRequiredError) {
        nextErrors[q.name] = fieldError;
      }
    }
    return nextErrors;
  }, [visibleQuestions, errors, formData]);

  // Merge NIN duplicate error into displayed validation errors
  const displayErrors = useMemo(() => {
    if (!ninDuplicateError || !ninQuestionName) return validationErrors;
    return { ...validationErrors, [ninQuestionName]: ninDuplicateError };
  }, [validationErrors, ninDuplicateError, ninQuestionName]);

  // Error count for header badge
  const errorCount = Object.keys(displayErrors).length;

  // Auto-focus first input on mount
  useEffect(() => {
    if (!isLoading && form && !draft.loading) {
      const timer = setTimeout(() => {
        const firstInput = document.querySelector<HTMLElement>(
          '[data-clerk-form] input:not([type=hidden]), [data-clerk-form] select, [data-clerk-form] textarea'
        );
        firstInput?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isLoading, form, draft.loading]);

  const handleFieldBlur = useCallback(
    async (questionName: string) => {
      await trigger(questionName);

      if (ninQuestionName && questionName === ninQuestionName) {
        const value = String(formData[questionName] ?? '');
        if (value && value.length === 11) {
          ninCheck.checkNin(value);
        } else {
          ninCheck.reset();
        }
      }
    },
    [trigger, ninQuestionName, formData, ninCheck]
  );

  // Submit handler
  const handleSubmit = useCallback(async () => {
    // Block submit if NIN duplicate detected
    if (ninCheck.isDuplicate) return;

    const fieldNames = visibleQuestions
      .filter((q) => q.type !== 'note')
      .map((q) => q.name);

    const isValid = await trigger(fieldNames);
    if (!isValid) {
      // Focus first error field
      setTimeout(() => {
        const firstError = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        if (firstError) {
          firstError.focus();
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return;
    }

    try {
      await draft.completeDraft();
    } catch {
      toast.error({ message: 'Failed to save submission. Please try again.' });
      return;
    }

    // Post-submit: session tracking + toast
    const elapsed = Date.now() - formStartRef.current;
    const cur = sessionRef.current;
    const newSession = {
      count: cur.count + 1,
      totalTimeMs: cur.totalTimeMs + elapsed,
    };
    setSession(newSession);
    sessionStorage.setItem('clerk-session', JSON.stringify(newSession));

    toast.success({ message: `Form completed in ${Math.round(elapsed / 1000)}s` });

    if (newSession.count % 10 === 0) {
      const avg = Math.round(newSession.totalTimeMs / newSession.count / 1000);
      setTimeout(() => {
        toast.info({ message: `${newSession.count} forms complete! Average: ${avg}s` });
      }, 500);
    }

    navigate('/dashboard/clerk/surveys');
  }, [trigger, visibleQuestions, draft, toast, ninCheck, navigate]);

  // Ctrl+S save draft
  const handleSaveDraft = useCallback(async () => {
    try {
      await draft.saveDraft();
      toast.success({ message: 'Draft saved' });
    } catch {
      toast.error({ message: 'Failed to save draft. Please try again.' });
    }
  }, [draft, toast]);

  // Ctrl+E jump to first error
  const jumpToFirstError = useCallback(() => {
    const firstError = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (firstError) {
      firstError.focus();
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl+Enter -> submit (blocked when NIN duplicate exists)
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (ninCheck.isDuplicate) return;
        handleSubmit();
        return;
      }

      // Ctrl+S -> save draft
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSaveDraft();
        return;
      }

      // Ctrl+E -> jump to first error
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        jumpToFirstError();
        return;
      }

      // Enter on text/number/date input -> advance to next input
      if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
        const target = e.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        const type = target.getAttribute('type');
        // Only advance on single-line inputs (not textarea, not select, not checkbox/radio)
        if (tagName === 'input' && type !== 'checkbox' && type !== 'radio') {
          e.preventDefault();
          const formContainer = document.querySelector('[data-clerk-form]');
          if (!formContainer) return;
          const inputs = Array.from(
            formContainer.querySelectorAll<HTMLElement>(
              'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
            )
          ).filter((el) => el.tabIndex !== -1);
          const idx = inputs.indexOf(target);
          if (idx >= 0 && idx < inputs.length - 1) {
            inputs[idx + 1].focus();
          }
        }
      }
    },
    [handleSubmit, handleSaveDraft, jumpToFirstError, ninCheck.isDuplicate]
  );

  // Prevent browser default Ctrl+S
  useEffect(() => {
    const preventBrowserSave = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', preventBrowserSave);
    return () => document.removeEventListener('keydown', preventBrowserSave);
  }, []);

  // Loading state
  if (isLoading || draft.loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="h-8 w-2/5 bg-neutral-200 rounded animate-pulse" />
        <div className="mt-4 space-y-4">
          <SkeletonForm fields={3} />
          <SkeletonForm fields={2} />
        </div>
      </div>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
            <p className="text-red-600 font-medium">Failed to load form</p>
            <p className="text-sm text-neutral-500 mt-1">{fetchError.message}</p>
            <button
              onClick={() => navigate('/dashboard/clerk/surveys')}
              className="mt-4 text-sm text-primary-600 hover:underline"
            >
              Back to surveys
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!form) return null;

  const avgTime = session.count > 0
    ? Math.round(session.totalTimeMs / session.count / 1000)
    : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back navigation */}
      <button
        onClick={() => navigate('/dashboard/clerk/surveys')}
        className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to surveys
      </button>

      {/* Form title */}
      <h1 className="text-2xl font-brand font-semibold text-neutral-900 mb-1">
        {form.title}
      </h1>

      {/* Session stats header (AC3.6.6) */}
      <div className="flex items-center gap-4 text-sm text-neutral-600 mb-4" data-testid="session-header" aria-live="polite">
        <span>Forms completed: <strong>{session.count}</strong></span>
        {session.count > 0 && (
          <span>Avg: <strong>{avgTime}s</strong></span>
        )}
      </div>

      {/* Keyboard shortcuts bar */}
      <div
        className="flex flex-wrap gap-3 text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-2 mb-6"
        data-testid="shortcuts-bar"
      >
        <span><kbd className="px-1 py-0.5 bg-white border border-neutral-300 rounded font-mono">Tab</kbd> Next field</span>
        <span><kbd className="px-1 py-0.5 bg-white border border-neutral-300 rounded font-mono">Enter</kbd> Next field</span>
        <span><kbd className="px-1 py-0.5 bg-white border border-neutral-300 rounded font-mono">Ctrl+Enter</kbd> Submit</span>
        <span><kbd className="px-1 py-0.5 bg-white border border-neutral-300 rounded font-mono">Ctrl+S</kbd> Save draft</span>
        <span><kbd className="px-1 py-0.5 bg-white border border-neutral-300 rounded font-mono">Ctrl+E</kbd> Jump to error</span>
      </div>

      {/* Error count badge */}
      {errorCount > 0 && (
        <div
          className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-4"
          data-testid="error-count-badge"
        >
          <AlertCircle className="w-4 h-4" />
          <span>{errorCount} {errorCount === 1 ? 'error' : 'errors'}</span>
        </div>
      )}

      {/* All-fields form */}
      <form
        onKeyDown={handleKeyDown}
        onSubmit={(e) => e.preventDefault()}
        data-clerk-form
        className="space-y-8"
      >
        {sections.map((section) => (
          <fieldset key={section.id} className="border border-neutral-200 rounded-lg p-4">
            <legend className="text-sm font-semibold text-neutral-700 px-2">
              {section.title}
            </legend>
            <div className="space-y-4 mt-2">
              {section.questions.map((question) => {
                const isNinField = NIN_QUESTION_NAMES.includes(question.name);
                return (
                  <div
                    key={question.id}
                    onBlur={(e) => {
                      // Only validate when focus leaves this question entirely
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        void handleFieldBlur(question.name);
                      }
                    }}
                  >
                    <Controller
                      name={question.name}
                      control={control}
                      render={({ field }) => (
                        <QuestionRenderer
                          question={question}
                          value={field.value}
                          onChange={(value) => {
                            field.onChange(value);
                            clearErrors(question.name);
                            if (ninQuestionName && question.name === ninQuestionName) {
                              ninCheck.reset();
                            }
                          }}
                          error={displayErrors[question.name]}
                        />
                      )}
                    />
                    {isNinField && ninCheck.isChecking && (
                      <p className="text-sm text-gray-500 mt-1" data-testid="nin-checking">Checking NIN availability...</p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}

        {/* Submit button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={ninCheck.isDuplicate || ninCheck.isChecking}
          className={`w-full min-h-[48px] px-6 py-3 bg-[#9C1E23] text-white rounded-lg font-medium hover:bg-[#7A171B] transition-colors ${
            ninCheck.isDuplicate || ninCheck.isChecking ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          data-testid="submit-btn"
        >
          Submit Form
        </button>
      </form>
    </div>
  );
}

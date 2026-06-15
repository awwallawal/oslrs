/**
 * Clerk Data Entry Page - Keyboard-optimized all-fields form
 *
 * Story 3.6: AC3.6.1 (all-fields layout), AC3.6.2 (Tab/Shift+Tab),
 * AC3.6.3 (Enter-to-advance), AC3.6.4 (Ctrl+Enter submit),
 * AC3.6.5 (auto-reset), AC3.6.6 (session tracking),
 * AC3.6.7 (Ctrl+S save draft), AC3.6.8 (validation & Ctrl+E error jump)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Controller, useForm, type ResolverOptions } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { generateReferenceCode } from '@oslsr/utils';
import { useFormSchema } from '../hooks/useForms';
import { syncManager } from '../../../services/sync-manager';
import { db as offlineDb } from '../../../lib/offline-db';
import { useDraftPersistence } from '../hooks/useDraftPersistence';
import { getVisibleQuestions } from '../utils/skipLogic';
import { QuestionRenderer } from '../components/QuestionRenderer';
import { PendingNinPrompt } from '../components/PendingNinPrompt';
import type { FlattenedQuestion } from '../api/form.api';
import { Card, CardContent } from '../../../components/ui/card';
import { SkeletonForm } from '../../../components/skeletons';
import { useToast } from '../../../hooks/useToast';
import { useNinCheck } from '../hooks/useNinCheck';
import { getCachedDynamicFormSchema } from '../utils/formSchema';
import { NinHelpHint } from '../../registration/components/NinHelpHint';
import { NIN_QUESTION_NAMES } from '../../registration/lib/wizard-provided-field-names';

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
    shouldUnregister: false,
  });

  // Accumulate all answers across question navigation.
  const allAnswersRef = useRef<Record<string, unknown>>({});
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  // Story 9-12 Task 13 — pending-NIN prompt visibility.
  const [pendingNinPromptOpen, setPendingNinPromptOpen] = useState(false);
  const pendingNin = formData._pendingNin === true;

  // Story 9-58 — the human-friendly reference code for THIS entry. Minted
  // client-side when the form is ready (so it's instant + offline-safe), stamped
  // into the answers (`_referenceCode`) so it persists with the submission, and
  // shown in a blocking modal at submit so the clerk can write it on the paper
  // form before moving on.
  // The minted code is PROVISIONAL/display-only (review M1/M2 — SERVER is
  // authoritative). The clerk submit is online (awaits completeDraft + sync), so
  // we reconcile to the API-echoed canonical code (persisted on the queue row by
  // the sync manager) and flip `referenceConfirmed` once read back. If offline,
  // the provisional stays labelled.
  const [referenceCode, setReferenceCode] = useState<string>('');
  const [referenceConfirmed, setReferenceConfirmed] = useState(false);
  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyUnavailable, setCopyUnavailable] = useState(false);
  // M5 — auto-focus + focus-trap targets for the blocking reference modal.
  const referenceDoneRef = useRef<HTMLButtonElement>(null);
  const referenceModalRef = useRef<HTMLDivElement>(null);

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

  // Resume from existing draft + ensure a reference code for THIS entry.
  // Runs once when the form is ready (guarded by allAnswersRef._referenceCode):
  // reuses a resumed draft's code for continuity, otherwise mints a fresh one.
  useEffect(() => {
    if (isLoading || !form || draft.loading) return;
    if (allAnswersRef.current._referenceCode) return; // already initialized this entry
    const resumed = (draft.resumeData?.formData ?? {}) as Record<string, unknown>;
    const existingCode =
      typeof resumed._referenceCode === 'string' && resumed._referenceCode ? resumed._referenceCode : null;
    const code = existingCode ?? generateReferenceCode(new Date().getFullYear());
    if (Object.keys(resumed).length > 0) {
      const merged = { ...resumed, _referenceCode: code };
      reset(merged);
      allAnswersRef.current = { ...merged };
      setFormData({ ...merged });
    } else {
      allAnswersRef.current._referenceCode = code;
      setFormData({ ...allAnswersRef.current });
    }
    setReferenceCode(code);
  }, [isLoading, form, draft.loading, draft.resumeData, reset]);

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

  /**
   * Story 9-12 Task 13 — pending-NIN confirm.
   *
   * Stamps `_pendingNin: true` (+ optional `_deferReasonNin`) into the
   * submission rawData and clears any partially-typed NIN. Backend reads the
   * flag at `submission-processing.service.ts:359` and routes the row to the
   * `pending_nin_capture` status path (Task 3.1 removed the NIN-required
   * throw). NIN validation is skipped at submit time when the flag is set.
   */
  const handlePendingNinConfirm = useCallback(
    (reason?: string) => {
      if (!ninQuestionName) return;
      const next = { ...allAnswersRef.current };
      next._pendingNin = true;
      if (reason) next._deferReasonNin = reason;
      next[ninQuestionName] = null;
      allAnswersRef.current = next;
      setFormData({ ...next });
      ninCheck.reset();
      clearErrors(ninQuestionName);
      setPendingNinPromptOpen(false);
    },
    [ninQuestionName, ninCheck, clearErrors],
  );

  /** Clears the pending-NIN flag if the operator decides to capture it after all. */
  const handlePendingNinUndo = useCallback(() => {
    const next = { ...allAnswersRef.current };
    delete next._pendingNin;
    delete next._deferReasonNin;
    allAnswersRef.current = next;
    setFormData({ ...next });
  }, []);

  // Story 9-58 (review M1) — read the SERVER-authoritative reference code the
  // API echoed (persisted on the submission-queue row by the sync manager) and
  // reconcile the provisional modal display to it. Polls briefly because
  // syncNow is fire-and-forget. No-op offline; the provisional stays labelled.
  const reconcileReferenceCode = useCallback(async (submissionId: string | null) => {
    if (!submissionId) return;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const item = await offlineDb.submissionQueue.get(submissionId);
        if (item?.status === 'synced' && item.referenceCode) {
          setReferenceCode(item.referenceCode);
          setReferenceConfirmed(true);
          return;
        }
      } catch {
        // Dexie read failure — keep the provisional; non-critical.
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }, []);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    // Block submit if NIN duplicate detected
    if (ninCheck.isDuplicate) return;

    const fieldNames = visibleQuestions
      .filter((q) => q.type !== 'note')
      // Skip NIN validation when the operator marked the row as pending-NIN.
      .filter((q) => !(pendingNin && NIN_QUESTION_NAMES.includes(q.name)))
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
      // Trigger upload immediately if online (don't await — fire-and-forget),
      // then reconcile the provisional reference to the SERVER's canonical code
      // once the queue row reports 'synced' (review M1).
      const submissionId = draft.draftId;
      syncManager
        .syncNow()
        .then(() => reconcileReferenceCode(submissionId))
        .catch(() => {});
    } catch {
      toast.error({ message: 'Failed to save submission. Please try again.' });
      return;
    }

    // Post-submit: session tracking, then surface the reference code in a
    // blocking modal so the clerk can write it on the paper form (Story 9-58).
    // Navigation to the surveys list happens only after they acknowledge.
    const elapsed = Date.now() - formStartRef.current;
    const cur = sessionRef.current;
    const newSession = {
      count: cur.count + 1,
      totalTimeMs: cur.totalTimeMs + elapsed,
    };
    setSession(newSession);
    sessionStorage.setItem('clerk-session', JSON.stringify(newSession));

    if (newSession.count % 10 === 0) {
      const avg = Math.round(newSession.totalTimeMs / newSession.count / 1000);
      toast.info({ message: `${newSession.count} forms complete! Average: ${avg}s` });
    }

    setCopied(false);
    setCopyUnavailable(false);
    setShowReferenceModal(true);
  }, [trigger, visibleQuestions, draft, toast, ninCheck, pendingNin, reconcileReferenceCode]);

  // Story 9-58 — clerk acknowledges the reference (after writing it on the form),
  // then returns to the surveys list ready for the next entry (the page unmounts,
  // so the next form remounts with a fresh code).
  const handleReferenceAcknowledge = useCallback(() => {
    setShowReferenceModal(false);
    navigate('/dashboard/clerk/surveys');
  }, [navigate]);

  // Story 9-58 (review M5) — a11y for the blocking reference modal: auto-focus
  // the "Done — next entry" button on open and trap Tab focus within the dialog.
  // NO Escape / backdrop dismissal is wired (intentional — the clerk must not
  // lose the code by an accidental dismissal), so a Tab-cycle trap is what keeps
  // keyboard focus from escaping to the (inert) page behind the modal.
  useEffect(() => {
    if (!showReferenceModal) return;
    referenceDoneRef.current?.focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const modal = referenceModalRef.current;
      if (!modal) return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !modal.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !modal.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [showReferenceModal]);

  // Story 9-58 (review L4) — clipboard API is unavailable in insecure contexts
  // (plain-HTTP field tablets). Fall back to the legacy select-text +
  // execCommand('copy') path; if that also fails, surface a visible
  // "copy unavailable — write it down" hint instead of a silent no-op.
  const handleCopyReference = useCallback(() => {
    setCopyUnavailable(false);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(referenceCode).then(
        () => setCopied(true),
        () => fallbackCopy(),
      );
      return;
    }
    fallbackCopy();

    function fallbackCopy() {
      try {
        const el = document.createElement('textarea');
        el.value = referenceCode;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(el);
        if (ok) {
          setCopied(true);
        } else {
          setCopyUnavailable(true);
        }
      } catch {
        setCopyUnavailable(true);
      }
    }
  }, [referenceCode]);

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
                            allAnswersRef.current[question.name] = value;
                            setFormData({ ...allAnswersRef.current });
                            clearErrors(question.name);
                            if (ninQuestionName && question.name === ninQuestionName) {
                              ninCheck.reset();
                            }
                          }}
                          error={displayErrors[question.name]}
                          disabled={isNinField && pendingNin}
                        />
                      )}
                    />
                    {isNinField && ninCheck.isChecking && (
                      <p className="text-sm text-gray-500 mt-1" data-testid="nin-checking">Checking NIN availability...</p>
                    )}

                    {/* Story 9-12 Task 13 — pending-NIN toggle for clerk surface */}
                    {isNinField && (
                      <div className="mt-2" data-testid="nin-pending-toggle-area">
                        {pendingNin ? (
                          <div
                            role="status"
                            aria-live="polite"
                            className="flex items-center justify-between rounded-md border border-info-200 bg-info-50 px-3 py-2 text-sm text-info-800"
                            data-testid="nin-pending-active-banner"
                          >
                            <span>
                              Saved as <strong>pending-NIN</strong>
                              {typeof formData._deferReasonNin === 'string' && formData._deferReasonNin
                                ? ` — reason: "${formData._deferReasonNin}"`
                                : ''}
                            </span>
                            <button
                              type="button"
                              onClick={handlePendingNinUndo}
                              className="text-xs font-medium text-info-700 hover:text-info-900 underline"
                              data-testid="nin-pending-undo"
                            >
                              Undo
                            </button>
                          </div>
                        ) : (
                          <>
                            <NinHelpHint
                              variant="inline"
                              onPendingNinClick={() => setPendingNinPromptOpen(true)}
                              hidePendingLink={pendingNinPromptOpen}
                            />
                            <PendingNinPrompt
                              open={pendingNinPromptOpen}
                              onConfirm={handlePendingNinConfirm}
                              onCancel={() => setPendingNinPromptOpen(false)}
                            />
                          </>
                        )}
                      </div>
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

      {/* Story 9-58 — blocking reference modal: clerk writes the code on the
          paper form, then returns to the surveys list for the next entry. */}
      {showReferenceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clerk-reference-title"
          data-testid="clerk-reference-modal"
        >
          <div ref={referenceModalRef} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="text-center text-4xl" aria-hidden="true">✓</div>
            <h2 id="clerk-reference-title" className="mt-2 text-center text-lg font-semibold text-neutral-900">
              Saved
            </h2>
            <p className="mt-1 text-center text-sm text-neutral-600">
              Write this application reference on the paper form before continuing.
            </p>
            <div className="mt-4 rounded-lg bg-neutral-50 px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Application reference</p>
              <p
                className="font-mono text-2xl font-semibold tracking-wide text-neutral-900 select-all"
                data-testid="clerk-reference-code"
              >
                {referenceCode}
              </p>
              {!referenceConfirmed && (
                <p className="mt-1 text-xs text-amber-600" data-testid="clerk-reference-provisional">
                  Provisional reference — confirmed once this syncs. The respondent can
                  always retrieve it via their email/phone at /check-registration.
                </p>
              )}
            </div>
            {copyUnavailable && (
              <p className="mt-3 text-center text-xs text-amber-600" data-testid="clerk-reference-copy-unavailable">
                Copy unavailable on this device — please write the reference down.
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleCopyReference}
                className="flex-1 min-h-[44px] rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                data-testid="clerk-reference-copy"
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
              <button
                ref={referenceDoneRef}
                type="button"
                onClick={handleReferenceAcknowledge}
                className="flex-1 min-h-[44px] rounded-lg bg-[#9C1E23] px-4 py-2 text-sm font-semibold text-white hover:bg-[#7A171B]"
                data-testid="clerk-reference-done"
              >
                Done — next entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

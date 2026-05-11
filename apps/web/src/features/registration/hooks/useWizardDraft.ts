import { useEffect, useRef, useState, useCallback } from 'react';
import {
  saveWizardDraft,
  fetchWizardDraft,
  type WizardDraftData,
} from '../api/wizard.api';

/**
 * Story 9-12 Task 4.4 — server-side wizard draft persistence.
 *
 * Behaviour:
 *   - Hydrates on mount when either an `email` (same-session resume) or a
 *     `wizard_resume` magic-link `token` is supplied.
 *   - Auto-saves debounced 2s on every formData change, merging client + server
 *     state by way of the backend's UPSERT.
 *   - Only persists once the email is known (Step 2 always sets it before the
 *     debounce fires). Until then, draft state is held in-memory only.
 *
 * IndexedDB local cache (Task 4.4 second leg) deferred to follow-up — the
 * surface area is small, the field count is bounded, and server-side is the
 * canonical source of truth for cross-device resume per AC#9. Add later only
 * if perf observation requires.
 */

interface UseWizardDraftOptions {
  /** Magic-link wizard_resume token from query string (cross-device hydration). */
  token?: string;
}

export interface UseWizardDraftResult {
  formData: WizardDraftData;
  setField: <K extends keyof WizardDraftData>(key: K, value: WizardDraftData[K]) => void;
  /** Merge several fields at once (used by step submit handlers). */
  mergeFields: (patch: Partial<WizardDraftData>) => void;
  currentStepIndex: number;
  setCurrentStepIndex: (idx: number) => void;
  isHydrated: boolean;
  isSaving: boolean;
  saveError: string | null;
}

const SAVE_DEBOUNCE_MS = 2000;

export function useWizardDraft(options: UseWizardDraftOptions = {}): UseWizardDraftResult {
  const { token } = options;

  const [formData, setFormData] = useState<WizardDraftData>({});
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<{ formData: string; step: number } | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Initial hydrate — only when a token is supplied (cross-device resume).
  // Email-keyed same-session hydration is intentionally NOT triggered here
  // because email isn't known until the user types it on Step 2.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setIsHydrated(true);
      return;
    }
    fetchWizardDraft({ token })
      .then((draft) => {
        if (cancelled) return;
        if (draft) {
          setFormData(draft.formData ?? {});
          // currentStep is 1-indexed on the server; we store 0-indexed locally.
          setCurrentStepIndex(Math.max(0, draft.currentStep - 1));
          lastSavedRef.current = {
            formData: JSON.stringify(draft.formData ?? {}),
            step: draft.currentStep,
          };
        }
        setIsHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const scheduleSave = useCallback(
    (latestFormData: WizardDraftData, latestStepIndex: number) => {
      const email = latestFormData.email?.trim();
      if (!email) return; // Wait until Step 2 sets it.

      const serialized = JSON.stringify(latestFormData);
      const serverStep = latestStepIndex + 1;
      if (
        lastSavedRef.current &&
        lastSavedRef.current.formData === serialized &&
        lastSavedRef.current.step === serverStep
      ) {
        return; // Nothing to do.
      }

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setIsSaving(true);
        setSaveError(null);
        try {
          await saveWizardDraft({
            email,
            currentStep: serverStep,
            formData: latestFormData,
          });
          lastSavedRef.current = { formData: serialized, step: serverStep };
        } catch (err) {
          setSaveError(err instanceof Error ? err.message : 'Failed to save draft');
        } finally {
          if (isMountedRef.current) setIsSaving(false);
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [],
  );

  const setField = useCallback<UseWizardDraftResult['setField']>(
    (key, value) => {
      setFormData((prev) => {
        const next = { ...prev, [key]: value };
        scheduleSave(next, currentStepIndex);
        return next;
      });
    },
    [scheduleSave, currentStepIndex],
  );

  const mergeFields = useCallback(
    (patch: Partial<WizardDraftData>) => {
      setFormData((prev) => {
        const next = { ...prev, ...patch };
        scheduleSave(next, currentStepIndex);
        return next;
      });
    },
    [scheduleSave, currentStepIndex],
  );

  const setStepWithSave = useCallback(
    (idx: number) => {
      setCurrentStepIndex(idx);
      scheduleSave(formData, idx);
    },
    [formData, scheduleSave],
  );

  return {
    formData,
    setField,
    mergeFields,
    currentStepIndex,
    setCurrentStepIndex: setStepWithSave,
    isHydrated,
    isSaving,
    saveError,
  };
}

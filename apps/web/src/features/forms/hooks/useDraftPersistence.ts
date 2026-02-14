import { useState, useEffect, useRef, useCallback } from 'react';
import { db, type Draft, type SubmissionQueueItem } from '../../../lib/offline-db';
import { uuidv7 } from 'uuidv7';

interface UseDraftPersistenceOptions {
  formId: string;
  formVersion: string;
  formData: Record<string, unknown>;
  currentIndex: number;
  enabled: boolean; // false in preview mode
}

interface UseDraftPersistenceReturn {
  draftId: string | null;
  resumeData: { formData: Record<string, unknown>; questionPosition: number } | null;
  saveDraft: () => Promise<void>;
  completeDraft: () => Promise<void>;
  resetForNewEntry: () => void;
  loading: boolean;
}

export function useDraftPersistence({
  formId,
  formVersion,
  formData,
  currentIndex,
  enabled,
}: UseDraftPersistenceOptions): UseDraftPersistenceReturn {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [resumeData, setResumeData] = useState<{
    formData: Record<string, unknown>;
    questionPosition: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Internal ref to track draftId synchronously inside effects/callbacks
  const draftIdRef = useRef<string | null>(null);

  // Load existing draft on mount
  useEffect(() => {
    if (!enabled || !formId) {
      setLoading(false);
      return;
    }

    async function loadDraft() {
      try {
        const existingDraft = await db.drafts
          .where({ formId, status: 'in-progress' })
          .first();

        if (existingDraft) {
          draftIdRef.current = existingDraft.id;
          setDraftId(existingDraft.id);
          setResumeData({
            formData: existingDraft.responses,
            questionPosition: existingDraft.questionPosition,
          });
        }
      } finally {
        setLoading(false);
      }
    }

    loadDraft();
  }, [formId, enabled]);

  // Auto-save on formData change (debounced 500ms)
  useEffect(() => {
    if (!enabled || !formId) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      const now = new Date().toISOString();

      if (draftIdRef.current) {
        // Update existing draft
        await db.drafts.update(draftIdRef.current, {
          responses: formData,
          questionPosition: currentIndex,
          updatedAt: now,
        });
      } else {
        // Create new draft
        const id = uuidv7();
        const draft: Draft = {
          id,
          formId,
          formVersion,
          responses: formData,
          questionPosition: currentIndex,
          status: 'in-progress',
          createdAt: now,
          updatedAt: now,
        };
        await db.drafts.add(draft);
        draftIdRef.current = id;
        setDraftId(id);
      }
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [formData, currentIndex, formId, formVersion, enabled]);

  const saveDraft = useCallback(async () => {
    if (!enabled) return;
    const now = new Date().toISOString();

    if (draftIdRef.current) {
      await db.drafts.update(draftIdRef.current, {
        responses: formData,
        questionPosition: currentIndex,
        updatedAt: now,
      });
    } else {
      // Create draft on first explicit save if auto-save hasn't fired yet
      const id = uuidv7();
      const newDraft: Draft = {
        id,
        formId,
        formVersion,
        responses: formData,
        questionPosition: currentIndex,
        status: 'in-progress',
        createdAt: now,
        updatedAt: now,
      };
      await db.drafts.add(newDraft);
      draftIdRef.current = id;
      setDraftId(id);
    }
  }, [formData, currentIndex, formId, formVersion, enabled]);

  const completeDraft = useCallback(async () => {
    if (!enabled) return;
    const now = new Date().toISOString();

    // Create draft if auto-save hasn't fired yet (e.g., fast Ctrl+Enter)
    if (!draftIdRef.current) {
      const id = uuidv7();
      const newDraft: Draft = {
        id,
        formId,
        formVersion,
        responses: formData,
        questionPosition: currentIndex,
        status: 'in-progress',
        createdAt: now,
        updatedAt: now,
      };
      await db.drafts.add(newDraft);
      draftIdRef.current = id;
      setDraftId(id);
    }

    // Update draft status
    await db.drafts.update(draftIdRef.current, {
      status: 'completed',
      updatedAt: now,
    });

    // Add to submission queue with enriched payload
    const enrichedPayload: Record<string, unknown> = {
      responses: formData,
      formVersion,
      submittedAt: now,
    };
    // Include GPS if available in form data
    if (formData.gps_latitude != null) {
      enrichedPayload.gpsLatitude = formData.gps_latitude;
    }
    if (formData.gps_longitude != null) {
      enrichedPayload.gpsLongitude = formData.gps_longitude;
    }

    const queueItem: SubmissionQueueItem = {
      id: draftIdRef.current,
      formId,
      payload: enrichedPayload,
      status: 'pending',
      retryCount: 0,
      lastAttempt: null,
      createdAt: now,
      error: null,
    };
    await db.submissionQueue.add(queueItem);
  }, [formId, formVersion, formData, currentIndex, enabled]);

  const resetForNewEntry = useCallback(() => {
    draftIdRef.current = null;
    setDraftId(null);
    setResumeData(null);
  }, []);

  return {
    draftId,
    resumeData,
    loading,
    saveDraft,
    completeDraft,
    resetForNewEntry,
  };
}

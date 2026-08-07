import { useState, useEffect, useRef, useCallback } from 'react';
import { db, type Draft, type SubmissionQueueItem } from '../../../lib/offline-db';
import { useAuth } from '../../auth/context/AuthContext';
import { uuidv7 } from 'uuidv7';

interface UseDraftPersistenceOptions {
  formId: string;
  formVersion: string;
  formData: Record<string, unknown>;
  currentIndex: number;
  enabled: boolean; // false in preview mode
  /** Form start timestamp (ms) for computing completionTimeSeconds (Story 4.3) */
  formStartedAt?: number;
}

interface UseDraftPersistenceReturn {
  draftId: string | null;
  resumeData: { formData: Record<string, unknown>; questionPosition: number } | null;
  saveDraft: () => Promise<void>;
  completeDraft: () => Promise<void>;
  /** 13-4 AC4.3 — abandon an interview: deletes the draft, submits nothing. */
  discardDraft: () => Promise<void>;
  resetForNewEntry: () => void;
  loading: boolean;
}

export function useDraftPersistence({
  formId,
  formVersion,
  formData,
  currentIndex,
  enabled,
  formStartedAt,
}: UseDraftPersistenceOptions): UseDraftPersistenceReturn {
  const { user } = useAuth();
  const userId = user?.id;
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
    if (!enabled || !formId || !userId) {
      setLoading(false);
      return;
    }

    async function loadDraft() {
      try {
        const existingDraft = await db.drafts
          .where({ userId, formId, status: 'in-progress' })
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
  }, [formId, enabled, userId]);

  // Auto-save on formData change (debounced 500ms)
  useEffect(() => {
    if (!enabled || !formId || !userId) return;

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
        // Don't create a draft until the user has actually entered data
        if (Object.keys(formData).length === 0) return;

        // Create new draft
        const id = uuidv7();
        const draft: Draft = {
          id,
          formId,
          formVersion,
          responses: formData,
          questionPosition: currentIndex,
          status: 'in-progress',
          userId,
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
  }, [formData, currentIndex, formId, formVersion, enabled, userId]);

  const saveDraft = useCallback(async () => {
    if (!enabled || !userId) return;
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
        userId,
        createdAt: now,
        updatedAt: now,
      };
      await db.drafts.add(newDraft);
      draftIdRef.current = id;
      setDraftId(id);
    }
  }, [formData, currentIndex, formId, formVersion, enabled, userId]);

  const completeDraft = useCallback(async () => {
    if (!enabled || !userId) return;
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
        userId,
        createdAt: now,
        updatedAt: now,
      };
      await db.drafts.add(newDraft);
      draftIdRef.current = id;
      setDraftId(id);
    }

    // Add to submission queue with enriched payload (FIRST — most critical operation)
    const enrichedPayload: Record<string, unknown> = {
      responses: formData,
      formVersion,
      submittedAt: now,
    };
    // Include GPS if available in form data.
    // GeopointInput stores as { latitude, longitude, accuracy } under the question name (e.g. gps_location).
    // Also support flat gps_latitude/gps_longitude keys for backwards compatibility.
    const gpsObj = formData.gps_location as { latitude?: number; longitude?: number } | undefined;
    if (gpsObj && typeof gpsObj === 'object' && gpsObj.latitude != null) {
      enrichedPayload.gpsLatitude = gpsObj.latitude;
    } else if (formData.gps_latitude != null) {
      enrichedPayload.gpsLatitude = formData.gps_latitude;
    }
    if (gpsObj && typeof gpsObj === 'object' && gpsObj.longitude != null) {
      enrichedPayload.gpsLongitude = gpsObj.longitude;
    } else if (formData.gps_longitude != null) {
      enrichedPayload.gpsLongitude = formData.gps_longitude;
    }
    // Story 4.3: Include completion time for speed-run fraud detection
    if (formStartedAt) {
      enrichedPayload.completionTimeSeconds = Math.round((Date.now() - formStartedAt) / 1000);
    }

    const queueItem: SubmissionQueueItem = {
      id: draftIdRef.current,
      formId,
      payload: enrichedPayload,
      status: 'pending',
      retryCount: 0,
      lastAttempt: null,
      userId,
      createdAt: now,
      error: null,
    };
    await db.submissionQueue.add(queueItem);

    // Mark draft as completed (belt-and-suspenders — if delete fails, draft won't show as 'in-progress')
    // Ordered AFTER queue add so a crash between queue add and status update
    // leaves draft visible ('in-progress') rather than silently losing data
    await db.drafts.update(draftIdRef.current, {
      status: 'completed',
      updatedAt: now,
    });

    // Delete draft from IndexedDB — queue item has all data needed for sync.
    // Wrapped in try/catch: if delete fails, submission is already queued successfully.
    try {
      await db.drafts.delete(draftIdRef.current);
    } catch {
      // Best-effort cleanup — draft is 'completed' so useFormDrafts() won't show it
    }
  }, [formId, formVersion, formData, currentIndex, enabled, userId, formStartedAt]);

  /**
   * 13-4 AC4.3 — abandon an interview that ended mid-way.
   *
   * The field reality this exists for: the respondent declines partway, it turns out to be the
   * wrong person, or a name was mis-keyed early and the whole entry is wrong. Before this, the only
   * exits were finishing a form nobody wanted or leaving a half-filled draft behind — and that
   * draft then blocked the next respondent, because the surface resumes rather than starts fresh.
   *
   * ⚠️ DELETES THE DRAFT ROW ENTIRELY — including its provisional `_referenceCode`. Leaving the
   * code behind is how the NEXT respondent would inherit someone else's number.
   *
   * ⚠️ CREATES NO SUBMISSION AND NO QUEUE ROW. An abandoned interview is not a registration; it
   * must leave nothing for the sync manager to find. That is the whole difference between this and
   * `completeDraft`.
   *
   * Irreversible by design: the answers are gone. The caller confirms with the operator first.
   */
  const discardDraft = useCallback(async () => {
    const id = draftIdRef.current;
    draftIdRef.current = null;
    setDraftId(null);
    setResumeData(null);
    if (!id) return;
    try {
      await db.drafts.delete(id);
    } catch {
      // Best-effort: the in-memory state is already cleared, so the operator can carry on with
      // the next respondent regardless. A stranded row is recoverable; a blocked enumerator is not.
    }
  }, []);

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
    discardDraft,
    resetForNewEntry,
  };
}

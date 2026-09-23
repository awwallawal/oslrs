import { useState, useEffect, useRef, useCallback } from 'react';
import { db, type Draft, type SubmissionQueueItem } from '../../../lib/offline-db';
import { useAuth } from '../../auth/context/AuthContext';
import { uuidv7 } from 'uuidv7';
import { isCapturedPosition, type CapturedPosition } from '../lib/geo-capture';

/**
 * Story 13-71 Task 1.1 — WHERE THE GEOPOINT ANSWER IS, WITHOUT NAMING IT.
 *
 * ⛔ THIS REPLACES A HARDCODED `formData.gps_location`. The literal question name
 * was baked in here while the comment above it said "e.g. gps_location", which is
 * exactly the shape of a thing that works until a form is authored with a
 * different name and then silently stops carrying coordinates — with no error,
 * because an absent key and an unanswered question look identical downstream.
 * Auto-capture (AC1) writes under THE SCHEMA'S OWN question name, so the two had
 * to be reconciled; the hardcode is fixed rather than asserted against.
 *
 * The caller passes the name it read off the schema. The shape scan below is the
 * fallback for callers that have no schema to hand (`ClerkDataEntryPage`) and for
 * drafts resumed from before this story: a geopoint is the only answer type that
 * is an object with two finite numeric coordinates, so finding one by shape is
 * unambiguous. Metadata keys are skipped — `_gpsOpenCapture` holds the open-time
 * position (AC2) and must never be mistaken for the answer.
 */
function findCapturedPosition(
  data: Record<string, unknown>,
  preferredName?: string,
): CapturedPosition | undefined {
  if (preferredName) {
    const preferred = data[preferredName];
    if (isCapturedPosition(preferred)) return preferred;
  }
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('_')) continue;
    if (isCapturedPosition(value)) return value;
  }
  return undefined;
}

interface UseDraftPersistenceOptions {
  formId: string;
  formVersion: string;
  formData: Record<string, unknown>;
  currentIndex: number;
  enabled: boolean; // false in preview mode
  /** Form start timestamp (ms) for computing completionTimeSeconds (Story 4.3) */
  formStartedAt?: number;
  /**
   * Story 13-71 Task 1.1 — the geopoint question's name AS THE SCHEMA GIVES IT.
   * Optional: callers without a resolved schema fall back to shape detection.
   */
  geopointQuestionName?: string;
}

interface UseDraftPersistenceReturn {
  draftId: string | null;
  resumeData: {
    formData: Record<string, unknown>;
    questionPosition: number;
    /**
     * Story 13-71 (review R7) — TRUE when this draft is a rejected submission
     * reopened via `SyncManager.restoreToDraft`, not a fresh interview. The page
     * uses it to suppress auto-capture: the interview already happened elsewhere,
     * and taking a position now would record where the operator is standing today.
     */
    restored: boolean;
  } | null;
  saveDraft: () => Promise<void>;
  /**
   * Story 13-71 AC2 — takes the answers to submit, so a caller that has JUST
   * mutated them (the submit-time position refresh) is not at the mercy of a
   * `useCallback` that still closes over the previous render's `formData`.
   * Omitted, it behaves exactly as before. [[pattern-a-fix-stale-at-the-edge]]
   */
  completeDraft: (overrideFormData?: Record<string, unknown>) => Promise<void>;
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
  geopointQuestionName,
}: UseDraftPersistenceOptions): UseDraftPersistenceReturn {
  const { user } = useAuth();
  const userId = user?.id;
  const [draftId, setDraftId] = useState<string | null>(null);
  const [resumeData, setResumeData] = useState<{
    formData: Record<string, unknown>;
    questionPosition: number;
    restored: boolean;
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
            // Review R7 — set only by restoreToDraft; undefined on every ordinary draft.
            restored: existingDraft.restoredAt != null,
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

  const completeDraft = useCallback(async (overrideFormData?: Record<string, unknown>) => {
    if (!enabled || !userId) return;
    const now = new Date().toISOString();

    /*
     * Story 13-71 AC2 — the answers THIS submit should carry.
     *
     * ⛔ The submit-time position refresh mutates the answers microseconds before
     * calling this, and `formData` here is a render-scoped closure variable: a
     * `setFormData` followed by an immediate `await completeDraft()` queues the
     * PREVIOUS render's answers and the refreshed coordinate is silently lost.
     * The caller passes its own authoritative accumulator instead.
     */
    const answers = overrideFormData ?? formData;

    // Create draft if auto-save hasn't fired yet (e.g., fast Ctrl+Enter)
    if (!draftIdRef.current) {
      const id = uuidv7();
      const newDraft: Draft = {
        id,
        formId,
        formVersion,
        responses: answers,
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
      responses: answers,
      formVersion,
      submittedAt: now,
    };
    // Include GPS if available in form data.
    // GeopointInput stores as { latitude, longitude, accuracy } under the question
    // name, which Story 13-71 Task 1.1 now resolves FROM THE SCHEMA rather than
    // from a hardcoded literal. Flat gps_latitude/gps_longitude keys are still
    // supported for backwards compatibility.
    const gpsObj = findCapturedPosition(answers, geopointQuestionName);
    if (gpsObj) {
      enrichedPayload.gpsLatitude = gpsObj.latitude;
      enrichedPayload.gpsLongitude = gpsObj.longitude;
      // Story 13-71 AC5 — accuracy has been captured and DISPLAYED by
      // GeopointInput since it was written, and thrown away at exactly this line.
      if (typeof gpsObj.accuracy === 'number' && Number.isFinite(gpsObj.accuracy)) {
        enrichedPayload.gpsAccuracy = gpsObj.accuracy;
      }
    } else {
      if (answers.gps_latitude != null) enrichedPayload.gpsLatitude = answers.gps_latitude;
      if (answers.gps_longitude != null) enrichedPayload.gpsLongitude = answers.gps_longitude;
    }
    /*
     * Story 13-71 AC4/AC6 — the DERIVED reason, lifted out of the answers and onto
     * the envelope.
     *
     * ⛔ Only when there is no position. A row holding both a coordinate and a
     * reason not to have one is incoherent, and it is reachable: the auto-capture
     * can fail at open (stamping the reason) and the enumerator can then tap the
     * manual button and succeed. The position wins, and the stale reason is dropped
     * rather than counted against that enumerator in the weekly ops read.
     */
    if (enrichedPayload.gpsLatitude == null && typeof answers._gpsUnavailableReason === 'string') {
      enrichedPayload.gpsUnavailableReason = answers._gpsUnavailableReason;
    } else if (enrichedPayload.gpsLatitude != null && answers._gpsUnavailableReason != null) {
      /*
       * ⛔ ADVERSARIAL REVIEW R8 — THE GUARD WAS ON THE ENVELOPE AND THE COLUMN IS
       * FED FROM THE ANSWERS.
       *
       * Suppressing `enrichedPayload.gpsUnavailableReason` above is not enough on
       * its own: `responses` (set to `answers` at the top of this payload) still
       * carried `_gpsUnavailableReason`, the API spreads `responses` straight into
       * `rawData`, and the ingestion worker writes `rawData._gpsUnavailableReason`
       * into the column. So the row could hold a real position AND a reason not to
       * have one — the incoherent state the suppression exists to prevent — with
       * the test that certified the guard asserting only the half that worked.
       * [[pattern-test-that-passes-over-a-hole]]
       *
       * The server now strips these keys too. Both ends, deliberately: this one
       * keeps the QUEUED payload and the saved draft coherent on the device, which
       * matters because an offline row can sit there for days and be read back by
       * `restoreToDraft` long before any server sees it.
       */
      const withoutStaleReason = { ...answers };
      delete withoutStaleReason._gpsUnavailableReason;
      enrichedPayload.responses = withoutStaleReason;
    }
    // Story 13-71 (ultra review U2) — stamped by every build that can satisfy the
    // requirement, so the server can tell this payload from one an old bundle made.
    enrichedPayload.geopointRequirementAware = true;
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
    /*
     * ⛔ ULTRA REVIEW U6 — THIS MUST BE SAFE TO CALL TWICE, BECAUSE THE UI NOW OFFERS
     * EXACTLY THAT.
     *
     * R9 gave the escape hatch a retry affordance ("try again — the survey has not
     * been submitted yet") on the assumption that a failed `completeDraft` left
     * nothing behind. It did not. `submissionQueue.add` is the FIRST write, and the
     * `drafts.update` that followed was UNGUARDED — so a rejection on the update
     * (quota, an eviction between the two writes) left the queue row COMMITTED while
     * the UI told the enumerator nothing had been submitted.
     *
     * ⭐ THE COST OF THAT IS A REAL CITIZEN REGISTERED TWICE. The enumerator retries;
     * the retry dies on the queue's duplicate primary key, so it keeps failing; they
     * give up and re-enter the interview from scratch, and the first queue row syncs
     * anyway. Two submissions, two respondents, one person — in a registry whose
     * whole purpose is one row per citizen.
     *
     * Two changes make the retry honest:
     *   1. the queue write is IDEMPOTENT — an existing row for this draft id is
     *      overwritten with the fresh payload rather than colliding, because the
     *      second attempt carries the same interview and a newer position; and
     *   2. everything after it is best-effort. Once the submission is queued the
     *      interview is SAFE, and a failure to tidy the draft must not be reported
     *      as a failure to submit — that is what sent the enumerator round the loop.
     */
    await db.submissionQueue.put(queueItem);

    try {
      // Mark draft as completed (belt-and-suspenders — if delete fails, draft won't
      // show as 'in-progress'). Ordered AFTER the queue write so a crash between the
      // two leaves the draft visible rather than silently losing data.
      await db.drafts.update(draftIdRef.current, {
        status: 'completed',
        updatedAt: now,
      });
      // Delete draft from IndexedDB — the queue item has all data needed for sync.
      await db.drafts.delete(draftIdRef.current);
    } catch {
      // Best-effort cleanup ONLY. The submission is already queued; a stranded
      // draft row is recoverable and a lost interview is not.
    }
  }, [formId, formVersion, formData, currentIndex, enabled, userId, formStartedAt, geopointQuestionName]);

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

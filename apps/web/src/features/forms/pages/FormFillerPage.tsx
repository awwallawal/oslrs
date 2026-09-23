import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { CompletionRipple } from '../../../components/CompletionRipple';
import { useParams, useNavigate } from 'react-router-dom';
import { Controller, useForm, type ResolverOptions } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFormSchema, useFormPreview } from '../hooks/useForms';
import { useDraftPersistence } from '../hooks/useDraftPersistence';
import { QuestionRenderer } from '../components/QuestionRenderer';
import { ProgressBar } from '../components/ProgressBar';
import { PreviewBanner } from '../components/PreviewBanner';
import { PendingNinPrompt } from '../components/PendingNinPrompt';
// 13-4 (2026-08-06): every skipLogic call here MUST pass `calculations`. `age` is DERIVED
// from `dob`, and it gates both Labour Force Participation and the under-15 guardian-consent
// section. Without it BOTH gates read NaN and BOTH sections silently vanish.
import {
  getVisibleQuestions,
  getNextVisibleIndex,
  getPrevVisibleIndex,
} from '../utils/skipLogic';
import { getCachedDynamicFormSchema, validateQuestionValue } from '../utils/formSchema';
import { SkeletonCard, SkeletonText } from '../../../components/skeletons';
import { useAuth } from '../../auth';
import { useNinCheck } from '../hooks/useNinCheck';
import { syncManager } from '../../../services/sync-manager';
import { db as offlineDb } from '../../../lib/offline-db';
// Deep import (NOT the `@oslsr/utils` barrel) so the browser bundle does not pull
// in server-only `crypto.ts` (bcrypt + node:crypto) — vite can't bundle that.
import { generateReferenceCode } from '@oslsr/utils/src/reference-code';
import { NinHelpHint } from '../../registration/components/NinHelpHint';
import { NIN_QUESTION_NAMES } from '../../registration/lib/wizard-provided-field-names';
import type { GpsUnavailableReason } from '@oslsr/types';
import {
  capturePosition,
  isCapturedPosition,
  permissionAllowsSilentRefresh,
  OPEN_CAPTURE_OPTIONS,
  SUBMIT_REFRESH_OPTIONS,
} from '../lib/geo-capture';

/**
 * Story 13-71 AC2 — where the OPEN-TIME position is kept once the submit-time
 * refresh has replaced the answer.
 *
 * A form opened at the door and submitted twenty minutes later records where the
 * interview STARTED. For base-mapping the submit-time fix is the truer one, so it
 * becomes the answer — but holding both makes "filled in one place, submitted in
 * another" VISIBLE rather than invisible, which is worth more than either alone.
 *
 * The `_` prefix is load-bearing twice over: `calculateFieldMatchRatio` skips
 * metadata keys, so this cannot bias the duplicate heuristic AC12 is fixing; and
 * `findCapturedPosition` skips them, so it can never be mistaken for the answer.
 */
const OPEN_CAPTURE_KEY = '_gpsOpenCapture';
/** Story 13-71 AC4 — the derived reason, carried in the answers so it survives a draft. */
const UNAVAILABLE_REASON_KEY = '_gpsUnavailableReason';

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
      const visible = getVisibleQuestions(form.questions, values, form.sectionShowWhen, undefined, {
        calculations: form.calculations,
      });
      return zodResolver(getCachedDynamicFormSchema(visible))(values, context, options);
    },
    [form]
  );

  const {
    control,
    trigger,
    reset,
    setError,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    resolver,
    mode: 'onChange',
    defaultValues: {},
    shouldUnregister: false,
  });

  // Accumulate all answers across question navigation.
  // react-hook-form drops values when Controllers unmount (even with shouldUnregister:false),
  // so we maintain our own persistent store keyed by question name.
  const allAnswersRef = useRef<Record<string, unknown>>({});
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  // Story 9-12 Task 13 — pending-NIN prompt visibility (open per-NIN-question).
  const [pendingNinPromptOpen, setPendingNinPromptOpen] = useState(false);

  // Story 9-58 (AC5.2) — the human-friendly reference code. The client mints a
  // PROVISIONAL code for instant/offline display (display-only — review M1/M2);
  // the SERVER is authoritative. Once the entry syncs we read the canonical
  // code the API echoed (persisted to the local submission queue by the sync
  // manager) and reconcile to it. `referenceConfirmed` flips true on that
  // read-back so the UI can drop the "provisional" label.
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [referenceConfirmed, setReferenceConfirmed] = useState(false);

  /**
   * Story 13-71 AC1 — the geopoint question this form serves, found BY TYPE.
   *
   * ⛔ By type and never by name: the name is the form author's, and the whole of
   * Task 1.1 is that a hardcoded `gps_location` works right up until it does not.
   * `null` here is also AC3's fence — a form serving no geopoint question has
   * nothing to auto-capture and nothing to require.
   */
  const geopointQuestion = useMemo(
    () => form?.questions.find((q) => q.type === 'geopoint') ?? null,
    [form],
  );

  /**
   * Story 13-71 AC3/AC7 — derived from the AUTHENTICATED ROLE, never the route.
   * `/survey/:formId` and `/surveys/:formId` are both reachable by more than one
   * role, and `ClerkDataEntryPage` renders the same `QuestionRenderer`; keying on
   * the URL would put the field requirement on a clerk transcribing paper forms,
   * whose office coordinates would poison the base map this story exists to enable.
   */
  const isEnumerator = user?.role === 'enumerator';

  /** Story 13-71 AC4 — the browser's own verdict on the last failed attempt. */
  const [gpsUnavailableReason, setGpsUnavailableReason] = useState<GpsUnavailableReason | null>(null);
  /** AC3 — set when a submit was blocked for having neither coordinates nor a reason. */
  const [gpsBlocked, setGpsBlocked] = useState(false);
  /** Review R9 — the escape-hatch submit itself failed to write. */
  const [gpsSubmitError, setGpsSubmitError] = useState(false);

  // Draft persistence (disabled in preview mode)
  const draft = useDraftPersistence({
    formId: formId ?? '',
    formVersion: form?.version ?? '1.0.0',
    formData,
    currentIndex,
    enabled: !isPreview && !!formId,
    formStartedAt: formStartedAtRef.current,
    // Task 1.1 — the SCHEMA'S name, replacing the hardcoded literal in the hook.
    geopointQuestionName: geopointQuestion?.name,
  });

  // Resume from existing draft on first load
  useEffect(() => {
    if (!draftLoaded && draft.resumeData && !draft.loading) {
      reset(draft.resumeData.formData);
      // Restore accumulated answers from draft
      allAnswersRef.current = { ...draft.resumeData.formData };
      setFormData({ ...draft.resumeData.formData });
      setCurrentIndex(draft.resumeData.questionPosition);
      // Review R7 — recorded BEFORE `setDraftLoaded`, because that flag is what
      // releases the auto-capture effect below and the effect must see this first.
      restoredDraftRef.current = draft.resumeData.restored;
      setDraftLoaded(true);
    } else if (!draft.loading && !draft.resumeData) {
      setDraftLoaded(true);
    }
  }, [draft.resumeData, draft.loading, draftLoaded, reset]);

  // Story 9-58 (AC5.2) — mint the human-friendly reference code client-side once
  // the form is ready (instant + offline-safe), stamp it into the answers
  // (`_referenceCode`) so it persists with the submission, and show it on the
  // completion screen so the enumerator can read it back to the respondent.
  // Reuses a resumed draft's code for continuity.
  useEffect(() => {
    if (!draftLoaded || isPreview || referenceCode) return;
    const existing =
      typeof allAnswersRef.current._referenceCode === 'string' ? allAnswersRef.current._referenceCode : '';
    const code = existing || generateReferenceCode(new Date().getFullYear());
    allAnswersRef.current._referenceCode = code;
    setFormData({ ...allAnswersRef.current });
    setReferenceCode(code);
  }, [draftLoaded, isPreview, referenceCode]);

  // Story 9-58 (review M1) — after a sync, read the SERVER-authoritative
  // reference code the API echoed (the sync manager persists it onto the
  // submission-queue row) and reconcile the provisional display to it. Polls a
  // few times because syncNow is fire-and-forget. No-op offline (the row never
  // reaches 'synced'); the provisional stays labelled until a later session.
  const reconcileReferenceCode = useCallback(async (submissionId: string | null) => {
    if (!submissionId) return;
    /*
     * 13-4 AC4.4 — poll with BACKOFF for ~2 minutes, not 3 seconds.
     *
     * This used to try 6 times at 500ms and then stop. On a slow field connection the sync
     * routinely outlives 3 seconds, so it gave up and left the screen showing an unconfirmed
     * state permanently — with no further attempt and nothing to tell the operator that the
     * number had, by then, actually been issued. Waiting longer costs nothing: the loop is idle
     * between polls and the screen is already showing an honest "not issued yet".
     */
    const delays = [500, 500, 1000, 1000, 2000, 3000, 5000, 8000, 13000, 21000, 34000, 55000];
    for (const delay of delays) {
      try {
        const item = await offlineDb.submissionQueue.get(submissionId);
        if (item?.status === 'synced' && item.referenceCode) {
          setReferenceCode(item.referenceCode);
          setReferenceConfirmed(true);
          return;
        }
        // A permanently rejected row will never produce a code — stop rather than poll for two
        // minutes at something that cannot arrive (13-4 AC4.2 classification).
        if (item?.permanentFailure) return;
      } catch {
        // Dexie read failure — non-critical; the screen already says "not issued yet".
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }, []);

  /**
   * Story 13-71 AC1 — TAKE THE POSITION ON OPEN. This is the whole story in one
   * effect.
   *
   * ⭐ WHY: measured 2026-09-18 against prod, only 4 of 36 trial-window enumerator
   * submissions carried coordinates, from 3 of 10 enumerators — and the
   * client-to-column chain was SOUND (5 captures = 5 raw_data keys = 5 columns).
   * Nothing was being dropped; the button simply was not being pressed.
   * `gps_location` is the only question in the master form's `General` section, so
   * it is its own first screen, and "Next" on an untouched capture button has
   * always been a complete, valid submission. Nine of ten enumerators did exactly
   * that. So the fix is the TAP, not the plumbing.
   *
   * ⛔ NOTHING WAITS ON THIS. No await, no loading gate, no early return in the
   * render path — the first question is on screen while the browser is still
   * deciding. Blocking here would trade a coverage problem for a usability one.
   *
   * Runs ONCE per mounted form (`autoCaptureStartedRef`), never in preview, and
   * never over a position resumed from a draft.
   */
  const autoCaptureStartedRef = useRef(false);
  /** Review R7 — this draft is a REOPENED rejected submission, not a fresh interview. */
  const restoredDraftRef = useRef(false);
  useEffect(() => {
    if (isPreview || !draftLoaded || !geopointQuestion) return;
    if (autoCaptureStartedRef.current) return;
    autoCaptureStartedRef.current = true;

    // A resumed draft already holds a capture — re-taking it would overwrite where
    // the interview actually started with where the enumerator is now.
    if (isCapturedPosition(allAnswersRef.current[geopointQuestion.name])) return;

    /*
     * ⛔ ADVERSARIAL REVIEW R7 — A REOPENED SUBMISSION MUST NOT ACQUIRE A POSITION.
     *
     * `restoreToDraft` puts a REJECTED submission back into drafts under a button
     * that promises "nothing is lost". That interview already happened — somewhere
     * else, possibly days ago — so capturing now would file WHERE THE OPERATOR IS
     * STANDING TODAY as the place the work was done. On deploy day that is the
     * office, at the end of the round, and it is indistinguishable from a genuine
     * field capture in AC10's coverage read.
     *
     * ⭐ A FALSE COORDINATE IS WORSE THAN AN ABSENT ONE. The absent one is visible
     * as absent and is exactly what AC4's vocabulary exists to record, so the
     * honest `other` is stamped instead and the submission goes through.
     */
    if (restoredDraftRef.current) {
      if (typeof allAnswersRef.current[UNAVAILABLE_REASON_KEY] !== 'string') {
        allAnswersRef.current[UNAVAILABLE_REASON_KEY] = 'other';
        setFormData({ ...allAnswersRef.current });
      }
      return;
    }

    let cancelled = false;
    void capturePosition(OPEN_CAPTURE_OPTIONS).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        allAnswersRef.current[geopointQuestion.name] = result.position;
        allAnswersRef.current[OPEN_CAPTURE_KEY] = result.position;
        delete allAnswersRef.current[UNAVAILABLE_REASON_KEY];
        setFormData({ ...allAnswersRef.current });
        /*
         * ⛔ AND INTO REACT-HOOK-FORM, NOT ONLY INTO OUR OWN ACCUMULATOR.
         *
         * `QuestionRenderer` is mounted inside a `Controller` and renders
         * `field.value`, so a position written only to `allAnswersRef`/`formData`
         * reaches the payload but NEVER APPEARS ON SCREEN. The enumerator would
         * see an untouched "Capture GPS Location" button over a survey that
         * already holds a position — and would tap it, which is the behaviour
         * this story exists to remove. Task 3.2 requires an auto-captured value
         * to display exactly as a tapped one; this line is that requirement.
         */
        setValue(geopointQuestion.name, result.position, { shouldValidate: false });
        setGpsUnavailableReason(null);
      } else {
        // ⭐ A REFUSAL IS NOW A RECORDED FACT. Before this, "did not tap" and
        // "tapped and was refused" were the same absent value — which is the
        // difference between a field problem and a phone problem (AC4).
        setGpsUnavailableReason(result.reason);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isPreview, draftLoaded, geopointQuestion, setValue]);

  /**
   * Story 13-71 AC2 — refresh the position at submit WHEN IT IS FREE TO DO SO.
   *
   * Returns the answers to submit, because the caller must not read `formData`
   * back out of a stale render closure [[pattern-a-fix-stale-at-the-edge]].
   *
   * Three ways this is a no-op, all deliberate: no geopoint question, no open-time
   * position to improve on, or a browser that would have to PROMPT. The last is
   * the important one — an OS permission dialog on top of a "Complete Survey" tap
   * is the one thing this must never produce. See `permissionAllowsSilentRefresh`
   * for why its absence is treated as "attempt" rather than "skip" (iOS Safari).
   */
  const refreshPositionForSubmit = useCallback(async (): Promise<Record<string, unknown>> => {
    if (!geopointQuestion) return allAnswersRef.current;

    const openTime = allAnswersRef.current[geopointQuestion.name];
    if (!isCapturedPosition(openTime)) return allAnswersRef.current;

    if (!(await permissionAllowsSilentRefresh())) return allAnswersRef.current;

    const result = await capturePosition(SUBMIT_REFRESH_OPTIONS);
    // A failed refresh costs nothing: the open-time position stands and the
    // submission proceeds. This is an improvement, never a precondition.
    if (!result.ok) return allAnswersRef.current;

    // Retain where the interview STARTED under its own key before overwriting.
    if (!isCapturedPosition(allAnswersRef.current[OPEN_CAPTURE_KEY])) {
      allAnswersRef.current[OPEN_CAPTURE_KEY] = openTime;
    }
    allAnswersRef.current[geopointQuestion.name] = result.position;
    setFormData({ ...allAnswersRef.current });
    // Same reasoning as the open-time capture: keep the rendered field in step,
    // or a "Back" from the completion screen would show the stale coordinate.
    setValue(geopointQuestion.name, result.position, { shouldValidate: false });
    return allAnswersRef.current;
  }, [geopointQuestion, setValue]);

  /**
   * Story 13-71 AC3 — may this submission go, on the ENUMERATOR path?
   *
   * ⛔ The first condition is the fence and not an optimisation: two live
   * submissions reference forms that serve no geopoint question (one on Public
   * Core, one on a form row that no longer exists). A requirement nobody can
   * satisfy is not a requirement, it is a lockout.
   */
  const geopointRequirementUnmet = useCallback((answers: Record<string, unknown>): boolean => {
    if (isPreview || !isEnumerator || !geopointQuestion) return false;
    if (isCapturedPosition(answers[geopointQuestion.name])) return false;
    return typeof answers[UNAVAILABLE_REASON_KEY] !== 'string';
  }, [isPreview, isEnumerator, geopointQuestion]);

  const visibleQuestions = useMemo(() => {
    if (!form) return [];
    // Preview mode: show ALL questions (inputs are disabled, so skip logic can't be triggered)
    if (isPreview) return form.questions;
    return getVisibleQuestions(form.questions, formData, form.sectionShowWhen, undefined, {
      calculations: form.calculations,
    });
  }, [form, formData, isPreview]);

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
    const nextIdx = isPreview
      ? (currentIndex + 1 < form.questions.length ? currentIndex + 1 : -1)
      : getNextVisibleIndex(form.questions, currentIndex, formData, form.sectionShowWhen, undefined, {
          calculations: form.calculations,
        });
    if (nextIdx === -1) {
      // End of form — complete draft and trigger sync
      if (!isPreview) {
        // Story 13-71 AC2 — one last position while the enumerator is still at
        // the interview. `answers` is returned rather than read back from state.
        const answers = await refreshPositionForSubmit();

        // Story 13-71 AC3 — client half of the requirement. The server enforces
        // the same rule independently (`requireGeopoint`); this exists so the
        // enumerator finds out at the door rather than after a 422 in a sync log.
        if (geopointRequirementUnmet(answers)) {
          setGpsBlocked(true);
          return;
        }

        await draft.completeDraft(answers);
        // Trigger upload immediately if online (don't await — fire-and-forget),
        // then reconcile the provisional reference to the server's canonical
        // code once the queue row reports 'synced' (review M1).
        syncManager
          .syncNow()
          .then(() => reconcileReferenceCode(draft.draftId))
          .catch(() => {});
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
  }, [currentQuestion, currentIndex, formData, form, isPreview, draft, ninDuplicateError, trigger, setError, clearErrors, reconcileReferenceCode, refreshPositionForSubmit, geopointRequirementUnmet]);

  /**
   * Story 9-12 Task 13 — pending-NIN confirm.
   *
   * Stamps `_pendingNin: true` (+ optional `_deferReasonNin`) into the
   * submission rawData and skips past the NIN question. Backend reads the
   * flag at `submission-processing.service.ts:359` and routes the row to the
   * `pending_nin_capture` status path (Task 3.1 removed the NIN-required
   * throw). Validation for the NIN question is bypassed because the field
   * value is cleared and the `_pendingNin` flag explicitly opts out of NIN
   * collection for this submission.
   */
  const handlePendingNinConfirm = useCallback(
    async (reason?: string) => {
      if (!form || !currentQuestion || isPreview) return;

      const next = { ...allAnswersRef.current };
      next._pendingNin = true;
      if (reason) next._deferReasonNin = reason;
      // Clear any partially-typed NIN so it's not part of the payload.
      next[currentQuestion.name] = null;
      allAnswersRef.current = next;
      setFormData({ ...next });
      ninCheck.reset();
      setPendingNinPromptOpen(false);
      clearErrors(currentQuestion.name);

      const nextIdx = getNextVisibleIndex(
        form.questions,
        currentIndex,
        next,
        form.sectionShowWhen,
        undefined,
        { calculations: form.calculations },
      );
      if (nextIdx === -1) {
        // NIN was the final visible question — complete + sync.
        // Story 13-71 AC3 — this is a SECOND path to submission, and a gate on
        // only one of two exits is not a gate.
        const answers = await refreshPositionForSubmit();
        if (geopointRequirementUnmet(answers)) {
          setGpsBlocked(true);
          return;
        }
        try {
          await draft.completeDraft(answers);
          syncManager
            .syncNow()
            .then(() => reconcileReferenceCode(draft.draftId))
            .catch(() => {});
        } catch {
          // completion errors surface through draft hook; swallow here.
        }
        setCompleted(true);
        return;
      }
      setSlideDirection('left');
      setTimeout(() => {
        setCurrentIndex(nextIdx);
        setSlideDirection(null);
      }, 50);
    },
    [form, currentQuestion, currentIndex, isPreview, ninCheck, clearErrors, draft, reconcileReferenceCode, refreshPositionForSubmit, geopointRequirementUnmet],
  );

  /**
   * Story 13-71 AC4 — THE ONE ACTION a blocked submit offers.
   *
   * ⛔ NOT A DROPDOWN. The enumerator confirms a fact they know ("I could not
   * capture a location"); they do not diagnose a cause. The cause is DERIVED from
   * the browser's own `GeolocationPositionError.code`, which it already knows and
   * which no one in a doorway is in a position to second-guess. A list whose first
   * item excuses the requirement becomes the fast way out of it — and a fast way
   * out is how this story's predecessor measured 4 of 36.
   *
   * `other` is the honest fallback for "there was no attempt on record": a reason
   * we cannot derive is still better than an absent value that means nothing.
   */
  const handleGpsUnavailableConfirm = useCallback(async () => {
    allAnswersRef.current[UNAVAILABLE_REASON_KEY] = gpsUnavailableReason ?? 'other';
    setFormData({ ...allAnswersRef.current });

    /*
     * ⛔ ADVERSARIAL REVIEW R9 — THE PANEL IS CLEARED ONLY ONCE THE SUBMIT HAS
     * ACTUALLY HAPPENED, AND THE AWAIT IS GUARDED.
     *
     * This previously ran `setGpsBlocked(false)` BEFORE an unguarded
     * `await completeDraft(...)`, with `setCompleted(true)` after it. If the draft
     * write rejected — IndexedDB quota, private browsing, a locked database — the
     * amber panel had already gone, no completion screen rendered, and nothing
     * reported a failure. The enumerator was left on the last question with the
     * only submit path they had just removed, and the interview would have to be
     * re-entered from scratch.
     *
     * The sibling exit (the pending-NIN path above) already wrapped the identical
     * call; this one did not, and it is the path a FIELD PHONE takes — the devices
     * with the least storage and the most aggressive eviction.
     */
    try {
      await draft.completeDraft(allAnswersRef.current);
    } catch {
      // Keep the panel up so the action is still available, and surface the
      // failure rather than showing a completion screen for a submission that was
      // never queued.
      setGpsBlocked(true);
      setGpsSubmitError(true);
      return;
    }

    setGpsBlocked(false);
    setGpsSubmitError(false);
    syncManager
      .syncNow()
      .then(() => reconcileReferenceCode(draft.draftId))
      .catch(() => {});
    setCompleted(true);
  }, [gpsUnavailableReason, draft, reconcileReferenceCode]);

  const handleBack = useCallback(() => {
    if (!form) return;

    // Use full-array index for navigation
    const prevIdx = isPreview
      ? (currentIndex > 0 ? currentIndex - 1 : -1)
      : getPrevVisibleIndex(form.questions, currentIndex, formData, form.sectionShowWhen, undefined, {
          calculations: form.calculations,
        });
    if (prevIdx === -1) return;

    setSlideDirection('right');
    setTimeout(() => {
      setCurrentIndex(prevIdx);
      if (currentQuestion) {
        clearErrors(currentQuestion.name);
      }
      setSlideDirection(null);
    }, 50);
  }, [currentIndex, currentQuestion, formData, form, isPreview, clearErrors]);

  // Determine if there's a next visible question (for button label)
  const hasNextQuestion = useMemo(() => {
    if (!form) return false;
    if (isPreview) return currentIndex + 1 < form.questions.length;
    return (
      getNextVisibleIndex(form.questions, currentIndex, formData, form.sectionShowWhen, undefined, {
        calculations: form.calculations,
      }) !== -1
    );
  }, [form, currentIndex, formData, isPreview]);

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
      <div className="relative max-w-[400px] mx-auto p-6 text-center space-y-4" data-testid="completion-screen">
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
            {/*
              A quiet outward ripple behind the checkmark — "recorded", not "celebrated". The
              PUBLIC wizard gets confetti; this surface deliberately does not. An enumerator
              completes 20-40 of these a day in front of a respondent who may have just disclosed
              unemployment or a disability, and celebration there is noise at best. See
              CompletionRipple for the full reasoning.
            */}
            <CompletionRipple />
            <div className="text-6xl animate-scale-in">
              ✓
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Survey saved!</h2>
            {/* Story 9-58 (AC5.2 + review M1) — application reference for the
                field officer to read back. The client mints a PROVISIONAL code
                for instant display; once the entry syncs we reconcile to the
                SERVER-authoritative code and drop the provisional label. */}
            <div className="rounded-lg bg-gray-50 px-4 py-3" data-testid="completion-reference">
              <p className="text-xs uppercase tracking-wide text-gray-500">Application reference</p>
              {/*
                13-4 AC4.4 (2026-08-07) — SHOW THE CODE ONLY WHEN THE SERVER HAS CONFIRMED IT.
                Previously the provisional code was rendered here in full, with an amber caveat
                underneath. That was not a small presentation flaw: `form.controller.ts:172` mints
                server-side and OVERWRITES `_referenceCode` on EVERY submission, unconditionally.
                So the provisional value is not "usually right", or "right when sync succeeds" —
                it is GUARANTEED never to be the code we store.

                Demonstrated in the 13-4 prod smoke: the enumerator was shown OSL-2026-DVJ0QW; the
                register holds OSL-2026-RGDANN; DVJ0QW exists in zero rows. An enumerator reads
                that number aloud to the person in front of them, and it will never match anything
                — discovered at a counter weeks later, with no way to prove what they were told.

                A caveat in small amber type under a large mono number does not stop that: the
                number IS the answer to "what is my registration number?", and the enumerator has
                already said it. So we no longer print a number that cannot be true. Offline, the
                honest answer is "not yet" — and `/check-registration` (named in the copy below)
                retrieves it by phone or email once it syncs.
              */}
              {referenceCode && referenceConfirmed ? (
                <p
                  className="font-mono text-lg font-semibold text-gray-900 select-all"
                  data-testid="completion-reference-code"
                >
                  {referenceCode}
                </p>
              ) : (
                <p className="text-sm text-gray-500" data-testid="completion-reference-pending">
                  Not issued yet — this entry has not finished uploading.{' '}
                  <strong>Do not give a reference number to the respondent yet.</strong> Once it
                  uploads, the number appears here, and they can always retrieve it by phone or
                  email at /check-registration.
                </p>
              )}
            </div>
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
                  // Accumulate answer for skip logic across questions
                  allAnswersRef.current[currentQuestion.name] = value;
                  // Story 13-71 Task 3.2 — a MANUAL capture (or a recapture) has to
                  // put the auto-capture's verdict away with it. Otherwise an
                  // enumerator who was refused at open, then tapped the button and
                  // succeeded, would still be offered the escape hatch — and a
                  // stale reason would ride along beside a real position.
                  if (
                    geopointQuestion &&
                    currentQuestion.name === geopointQuestion.name &&
                    isCapturedPosition(value)
                  ) {
                    delete allAnswersRef.current[UNAVAILABLE_REASON_KEY];
                    setGpsUnavailableReason(null);
                    setGpsBlocked(false);
                  }
                  setFormData({ ...allAnswersRef.current });
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

          {/* Story 9-12 Task 13 — NIN help + pending toggle */}
          {isCurrentNin && !isPreview && (
            <div className="mt-3" data-testid="nin-pending-toggle-area">
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
            </div>
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

        {/*
          Story 13-71 AC3/AC4 — the blocked submit, and the ONE action it offers.

          It appears only after a submit was actually refused, never as a standing
          warning: a banner shown before anyone has tried to do anything is noise
          an enumerator learns to scroll past in a week.
        */}
        {gpsBlocked && (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3"
            role="alert"
            data-testid="gps-required-block"
          >
            <p className="text-sm font-medium text-amber-900">
              This survey needs a location before it can be submitted.
            </p>
            <p className="text-sm text-amber-800">
              Go back to the location question and tap “Capture GPS Location”. If your
              phone will not give one, confirm below and the survey will record why.
            </p>
            {/*
              Review R9 — the escape hatch's own write failed. Saying so is the whole
              point: the alternative was a vanished panel and no completion screen,
              which reads to an enumerator as "it worked" and loses the interview.
            */}
            {gpsSubmitError && (
              <p className="text-sm font-medium text-error-700" data-testid="gps-submit-error">
                That did not save. Check your phone has storage free and try again — the
                survey has not been submitted yet.
              </p>
            )}
            <button
              type="button"
              onClick={handleGpsUnavailableConfirm}
              className="min-h-[48px] w-full px-4 py-3 bg-white border border-amber-300 text-amber-900 rounded-lg font-medium hover:bg-amber-100 transition-colors"
              data-testid="gps-unavailable-btn"
            >
              I could not capture a location
            </button>
          </div>
        )}
        {/*
          13-4 AC4.3 — abandon an interview that ended mid-way. Available at EVERY step, not just
          the first: a respondent can decline at any point, and "you must finish a form nobody wants"
          is not a real option in front of a person who has withdrawn consent.

          Deliberately understated styling — this destroys data and must never be a mis-tap next to
          Continue. It sits BELOW the navigation, not beside it.
        */}
        {!isPreview && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={async () => {
                const who = [allAnswersRef.current.firstname, allAnswersRef.current.surname]
                  .filter((v) => typeof v === 'string' && v)
                  .join(' ')
                  .trim();
                if (
                  !window.confirm(
                    'Discard this interview' +
                      (who ? ' with ' + who : '') +
                      '? Every answer entered so far is deleted and cannot be recovered. ' +
                      'Nothing is submitted and no registration number is issued. ' +
                      'Use this when the respondent has declined to continue.',
                  )
                ) {
                  return;
                }
                await draft.discardDraft();
                // Reset the in-memory form too, or the next respondent inherits these answers.
                reset({});
                allAnswersRef.current = {};
                setFormData({});
                setCurrentIndex(0);
                setReferenceCode(null);
                setReferenceConfirmed(false);
                // /dashboard/enumerator, NOT /enumerator — the enumerator routes are nested under
                // `dashboard` (App.tsx:1062). The bare path would have dropped the operator on the
                // 404 page immediately after discarding, which is the worst possible moment for it.
                // Caught by the navigate-target drift guard, not by review.
                navigate('/dashboard/enumerator');
              }}
              className="text-sm text-gray-500 underline underline-offset-2 hover:text-error-600 transition-colors"
              data-testid="discard-interview-btn"
            >
              Discard this interview
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

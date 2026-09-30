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
  classifyBlockFailure,
  geolocationPermissionState,
  notePermissionStateAfterSuccess,
  readPromptDismissals,
  recordPromptDismissal,
  isCapturedPosition,
  isRetryableCaptureFailure,
  permissionAllowsSilentRefresh,
  OPEN_CAPTURE_OPTIONS,
  OPEN_CAPTURE_WATCHDOG_MS,
  SUBMIT_REFRESH_OPTIONS,
  type CapturedPosition,
  type GeolocationPermissionProbe,
} from '../lib/geo-capture';
import { gpsRemediation } from '../lib/gps-remediation';
import { GpsRemediationCopy } from '../components/GpsRemediationCopy';

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
  /**
   * Story 13-75 AC6 — in-banner capture attempts that have FAILED since the block
   * last appeared. A retryable reason keeps the waiver hidden until this is > 0.
   * Cleared by `handleBack` alongside `gpsBlocked` (AC8).
   */
  const [gpsBlockFailedAttempts, setGpsBlockFailedAttempts] = useState(0);
  /** Story 13-75 AC1 — an in-banner capture is in flight; its button is disabled. */
  const [gpsBlockCapturing, setGpsBlockCapturing] = useState(false);
  /** The authoritative half of that guard — state lags a same-tick double tap (U8). */
  const gpsBlockCaptureInFlightRef = useRef(false);
  /**
   * Story 13-76 AC1 — the site permission as the browser reported it just after the
   * LAST failure, probed only for code 1. `null` until the probe answers, which
   * `classifyBlockFailure` reads as settled: unknown is never the hopeful case.
   */
  const [gpsPermissionState, setGpsPermissionState] = useState<GeolocationPermissionProbe | null>(null);
  /**
   * Story 13-76 AC4 — code-1 failures seen while the permission still read `prompt`,
   * i.e. dismissals. NOT cleared by Back: Chrome's hardening of repeated dismissals
   * is a fact about the browser, not about a panel — and, since review L3, not
   * about this survey either: seeded from the tab's count (`readPromptDismissals`).
   */
  const [gpsPromptDismissals, setGpsPromptDismissals] = useState(readPromptDismissals);
  /**
   * 13-76 review L2 — a code-1 failure whose permission probe has not answered. Its
   * copy is WITHHELD meanwhile: showing the settled reading first put settings
   * surgery in front of a dismissal and made a `role="alert"` announce twice. The
   * waiver is not withheld — the settled reading still governs it (unknown is
   * never the hopeful case), and the probe is bounded, so the copy always arrives.
   */
  const [gpsPermissionProbing, setGpsPermissionProbing] = useState(false);
  /** Disowns a permission probe that a newer failure or a fix has overtaken. */
  const gpsPermissionProbeRef = useRef(0);
  /**
   * Bumped by `handleBack`. An in-banner capture that resolves after the
   * enumerator has navigated away belongs to a submit they WITHDREW, so it may
   * commit its position but must not auto-retry the submit (AC3) from under them.
   */
  const gpsBlockEpochRef = useRef(0);
  /**
   * ⛔ 13-75 REVIEW H1 — THE INTERVIEW THIS PAGE HELD IS GONE: discarded, or the
   * page unmounted. The epoch above disowns an attempt for BACK, which keeps a late
   * fix; this disowns it for good. Without it, a fix landing while "Discard this
   * interview" was confirming queued the whole declined interview under a NEW draft
   * id (`discardDraft` nulls the id before its first await), and one landing after
   * unmount queued a bare position.
   *
   * Set false in the effect body, not only initialised false: StrictMode's
   * mount → cleanup → mount keeps the ref, so a cleanup-only flag would latch true
   * in development and disable the auto-retry there — U9's shape.
   */
  const interviewEndedRef = useRef(false);
  useEffect(() => {
    interviewEndedRef.current = false;
    return () => {
      interviewEndedRef.current = true;
    };
  }, []);

  /**
   * ⛔ STORY 13-75 AC2 — ONE WAY TO COMMIT A POSITION.
   *
   * There were three sites and they did not agree: the open-time auto-capture and
   * the manual button both deleted the stale `_gpsUnavailableReason`, while the
   * submit-time refresh wrote the position and cleared neither the reason key nor
   * `gpsBlocked`. This story adds a FOURTH (the in-banner button), and adding a
   * fourth by copy-paste is exactly how U5 and U10 happened in this component. So
   * every site calls this, and a fifth added later inherits the whole write.
   *
   * ⚠️ The refresh divergence was NOT a reachable defect (story 13-75, Completion
   * Notes): the refresh runs only when a position is already held, and every
   * write that stores a position already deleted the reason — so at that site the
   * extra clears are no-ops and routing it here changes no observable behaviour.
   * The point of collapsing it is the NEXT site, not that one.
   *
   * Site-specific extras stay at the call site: only the open-time capture and the
   * refresh touch `_gpsOpenCapture`, because only they know where the interview
   * started.
   */
  const commitGeopoint = useCallback(
    (position: CapturedPosition) => {
      if (!geopointQuestion) return;
      allAnswersRef.current[geopointQuestion.name] = position;
      delete allAnswersRef.current[UNAVAILABLE_REASON_KEY];
      setFormData({ ...allAnswersRef.current });
      /*
       * ⛔ AND INTO REACT-HOOK-FORM, NOT ONLY INTO OUR OWN ACCUMULATOR.
       *
       * `QuestionRenderer` is mounted inside a `Controller` and renders
       * `field.value`, so a position written only to `allAnswersRef`/`formData`
       * reaches the payload but NEVER APPEARS ON SCREEN. The enumerator would see
       * an untouched "Capture GPS Location" button over a survey that already
       * holds a position — and would tap it, which is the behaviour 13-71 exists
       * to remove. 13-71 Task 3.2 requires an auto-captured value to display
       * exactly as a tapped one; this line is that requirement. It is equally why
       * a "Back" after an in-banner capture shows the new fix and not a blank.
       */
      setValue(geopointQuestion.name, position, { shouldValidate: false });
      setGpsUnavailableReason(null);
      // 13-76 — a probe still out describes a failure this fix just replaced.
      gpsPermissionProbeRef.current += 1;
      setGpsPermissionState(null);
      setGpsPermissionProbing(false);
      /*
       * ⛔ 13-76 R5(a) — every success is also EVIDENCE about the browser. A site that
       * just gave a position cannot honestly read `prompt`; if it does (Safari, as
       * reported), its `prompt` is marked unreliable for the tab, and a later code 1
       * is read as settled instead of as a dismissal it cannot be. This is the one
       * success write, so every success path — open-time, silent refresh, in-banner,
       * the question's own button — gathers it. Fire-and-forget: never a gate.
       */
      void notePermissionStateAfterSuccess();
      /*
       * ⛔ ULTRA REVIEW U13 — AND RETIRE THE PANEL THE FIX JUST ANSWERED.
       *
       * The open-time capture can resolve AFTER a submit was already refused for
       * having no position. Without this the amber panel goes on demanding a
       * location for a survey that now HAS one, and its waiver files a reason
       * saying the phone could not do the thing it just did.
       */
      setGpsBlocked(false);
      setGpsSubmitError(false);
    },
    [geopointQuestion, setValue],
  );

  /**
   * ⛔ STORY 13-76 AC1 — ONE WAY TO RECORD A FAILED CAPTURE, and for code 1 it asks
   * the browser which KIND of `permission_denied` it was.
   *
   * A dismissed prompt reports code 1 identically to a deliberate block, and only
   * `navigator.permissions` can tell them apart. So every failure site calls this
   * (open-time, silent retry, in-banner, a late in-banner after Back, and the
   * location question's own button) — five sites, the count at which 13-75 AC2
   * collapsed the SUCCESS writes into `commitGeopoint` for the same reason.
   *
   * ⛔ The REASON is still what gets filed: this adds nothing to the vocabulary.
   * What it adds is a UI fact — the permission state — that the amber block alone
   * reads (`classifyBlockFailure`). The latch and AC11's silent retry keep reading
   * `isRetryableCaptureFailure(reason)`, for which code 1 is still settled.
   *
   * The state is cleared synchronously, so between a failure and its probe the
   * page is in the SETTLED reading — a stale `prompt` from an earlier failure can
   * never make a newer block look dismissed. Its COPY is withheld until the probe
   * answers (review L2), so that settled reading governs the waiver only.
   */
  const recordCaptureFailure = useCallback((reason: GpsUnavailableReason) => {
    setGpsUnavailableReason(reason);
    setGpsPermissionState(null);
    const probe = ++gpsPermissionProbeRef.current;
    setGpsPermissionProbing(reason === 'permission_denied');
    if (reason !== 'permission_denied') return;
    void geolocationPermissionState().then((state) => {
      if (probe !== gpsPermissionProbeRef.current || interviewEndedRef.current) return;
      // Review L3 — counted for the tab, so a new survey inherits it.
      if (state === 'prompt') setGpsPromptDismissals(recordPromptDismissal());
      setGpsPermissionState(state);
      setGpsPermissionProbing(false);
    });
  }, []);

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
  /**
   * ⛔ ULTRA REVIEW U9 — A ONCE-GUARD THAT LATCHED BEFORE THE WORK HAPPENED.
   *
   * This was a single `autoCaptureStartedRef`, set to `true` the instant the effect
   * ran and never reset, while the cleanup set `cancelled = true`. `React.StrictMode`
   * IS enabled (`main.tsx:7`), so in development every effect is mount → cleanup →
   * mount: run 1 latched the ref and was then cancelled, and run 2 returned at the
   * guard. **Auto-capture never worked in development at all** — and the tests could
   * not see it, because RTL does not render under StrictMode.
   *
   * In production the same shape is a real, if rarer, loss: any remount inside the
   * 10-second capture window (a background refetch resolving) cancelled the attempt
   * permanently.
   *
   * TWO refs, because "an attempt is running" and "an attempt has finished" are
   * different facts and only the second may block a retry.
   */
  const autoCaptureDoneRef = useRef(false);
  const autoCaptureInFlightRef = useRef(false);
  /** Review R7 — this draft is a REOPENED rejected submission, not a fresh interview. */
  const restoredDraftRef = useRef(false);
  useEffect(() => {
    if (isPreview || !draftLoaded || !geopointQuestion) return;

    /*
     * ⛔ ULTRA REVIEW U1 + U14 — THE ENUMERATOR PATH, AND ONLY THE ENUMERATOR PATH.
     *
     * There was no role gate here at all, and `mode="fill"` is mounted on TWO
     * routes: `/dashboard/enumerator/survey/:formId` and, at `App.tsx:1435`,
     * `/dashboard/public/surveys/:formId` — "Story 3.5: Public User Form Filler".
     * So a member of the public opening a survey that happens to serve a geopoint
     * question was SILENTLY GEOLOCATED, and the coordinates were filed with
     * `source='public'` — the very channel 13-34 deliberately stripped the geopoint
     * from. That is a privacy exposure first and a data defect second: those rows
     * also enter AC10's coverage read as if they were field captures.
     *
     * U14 is the same hole one branch further down: the restored-draft path stamped
     * `_gpsUnavailableReason: 'other'` with no role check either, putting desk work
     * into the one column AC6 exists to GROUP BY.
     *
     * ⭐ THE GATE IS AC7's OWN REASONING, APPLIED WHERE IT WAS MISSING. AC7 exempts
     * the clerk because "office coordinates filed as field captures would poison the
     * base map this story exists to enable". That argument is about WHO IS HOLDING
     * THE PHONE, not about who is required to carry a position — so it applies to
     * capture, not merely to enforcement. Capturing for a clerk and then not
     * requiring it was the worst of both: the poisoned coordinate without the
     * coverage. Now the two agree, and `isEnumerator` is the single fact that
     * decides both.
     */
    if (!isEnumerator) return;

    if (autoCaptureDoneRef.current || autoCaptureInFlightRef.current) return;

    // A resumed draft already holds a capture — re-taking it would overwrite where
    // the interview actually started with where the enumerator is now.
    if (isCapturedPosition(allAnswersRef.current[geopointQuestion.name])) {
      autoCaptureDoneRef.current = true;
      return;
    }

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
      autoCaptureDoneRef.current = true;
      if (typeof allAnswersRef.current[UNAVAILABLE_REASON_KEY] !== 'string') {
        allAnswersRef.current[UNAVAILABLE_REASON_KEY] = 'other';
        setFormData({ ...allAnswersRef.current });
      }
      return;
    }

    autoCaptureInFlightRef.current = true;
    let cancelled = false;
    void capturePosition(OPEN_CAPTURE_OPTIONS, OPEN_CAPTURE_WATCHDOG_MS).then((result) => {
      // Released BEFORE the cancellation check, so a StrictMode remount (or any
      // remount) can start a fresh attempt instead of being locked out by an
      // attempt that was thrown away.
      autoCaptureInFlightRef.current = false;
      if (cancelled) return;
      /*
       * ⛔ FIELD DEFECT 2026-09-26 — THE ONCE-GUARD LATCHED ON "WE STOPPED WAITING".
       *
       * This was an unconditional `autoCaptureDoneRef.current = true` before the
       * `result.ok` check, so ANY outcome retired auto-capture for the rest of the
       * survey. Paired with a watchdog that was racing the permission prompt, a
       * slow tap on "Allow" meant the position was never taken and the enumerator
       * had to press the button the briefing says they will not need.
       *
       * ⭐ NOT EVERY FAILURE IS A FACT ABOUT THE WORLD. `permission_denied` and
       * `unsupported` are settled answers — the phone will not give a position and
       * asking again changes nothing, so latch and let AC4 record the reason.
       * `timeout` and `position_unavailable` are the OPPOSITE: they mean we did not
       * get one YET, indoors or mid-prompt, and a later attempt may well succeed.
       * Latching those converts a transient miss into a permanent absence — and
       * AC10 then counts it as a coverage failure the phone never actually had.
       */
      if (!isRetryableCaptureFailure(result)) autoCaptureDoneRef.current = true;
      if (result.ok) {
        allAnswersRef.current[OPEN_CAPTURE_KEY] = result.position;
        // 13-75 AC2 — the shared write: answer, reason key, RHF value (13-71 Task
        // 3.2) and retiring the panel a slow fix just answered (U13).
        commitGeopoint(result.position);
      } else {
        // ⭐ A REFUSAL IS NOW A RECORDED FACT. Before this, "did not tap" and
        // "tapped and was refused" were the same absent value — which is the
        // difference between a field problem and a phone problem (AC4).
        recordCaptureFailure(result.reason);
      }
    });

    return () => {
      cancelled = true;
      /*
       * ⛔ AND RELEASED HERE, WHICH IS THE HALF THAT ACTUALLY CLOSES U9.
       *
       * Releasing only in the `.then` was not enough, and the test said so: an
       * effect re-run while a capture is IN FLIGHT hit the in-flight guard and
       * returned, the cleanup cancelled attempt 1, and attempt 1 then resolved into
       * a `cancelled` early-return. Nothing was in flight, nothing was done, and
       * nothing would ever run again — the capture was lost exactly as U9 describes
       * for a background refetch landing inside the 10-second window.
       *
       * Cleanup runs BEFORE the next effect, so releasing here lets that next run
       * start a fresh attempt. It is also what makes the StrictMode
       * mount → cleanup → mount pair work: the second mount captures for real.
       */
      autoCaptureInFlightRef.current = false;
    };
  }, [isPreview, draftLoaded, geopointQuestion, isEnumerator, commitGeopoint, recordCaptureFailure]);

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
  /*
   * ⛔ ULTRA REVIEW U13 — EVERY RETURN IS A SNAPSHOT, NOT THE LIVE OBJECT.
   *
   * This returned `allAnswersRef.current` ITSELF on all four paths, and that object
   * is still being mutated by the open-time capture's `.then` and by every
   * `onChange`. The submit path then awaits `completeDraft(answers)`, which awaits
   * IndexedDB — so a capture landing in that window could add a position to the
   * very object being written, producing a queued row holding BOTH a coordinate and
   * a reason not to have one. That is the exact incoherent state R8 exists to
   * prevent, arriving through aliasing instead of through logic.
   *
   * A shallow copy is enough: the mutations at issue are top-level key writes.
   */
  const snapshotAnswers = useCallback(
    (): Record<string, unknown> => ({ ...allAnswersRef.current }),
    [],
  );

  /**
   * ⛔ 13-75 AC11 (review) — THE SILENT WAIT IS VISIBLE, AND BACK IS OFF DURING IT.
   *
   * Both captures below take up to ~10 s (the 5 s deadline + watchdog grace), and
   * `submitting` only rises later, inside `finishSubmission`. So this window had a
   * dead-looking Complete button AND a live Back — and a Back pressed during a
   * refresh still went on to submit the survey from whatever question it landed
   * on (U10's shape, predating 13-75; AC11 would have added a second such wait).
   */
  const [locating, setLocating] = useState(false);

  const refreshPositionForSubmit = useCallback(async (): Promise<Record<string, unknown>> => {
    if (!geopointQuestion) return snapshotAnswers();

    const openTime = allAnswersRef.current[geopointQuestion.name];
    if (!isCapturedPosition(openTime)) {
      /*
       * ⛔ STORY 13-75 AC11 (ruled by Awwal 2026-09-27) — A RETRYABLE MISS GETS ONE
       * SILENT RETRY BEFORE ANY REFUSAL.
       *
       * `timeout` / `position_unavailable` mean "no fix YET", and the enumerator
       * cannot read their way out of that: the phone needs another go. Until this,
       * a retryable open-time miss got none unless a human tapped a button — which
       * is how capture 01a0e199 became a waiver. AC7's hint serves the reasons a
       * PERSON must fix; this serves the one the PHONE fixes, and it closes R4.
       *
       * No prompt can appear: a browser returns codes 2/3 only AFTER the site
       * permission was granted, and `permissionAllowsSilentRefresh` fences the one
       * exception (our own 120 s watchdog firing while a prompt sat unanswered).
       *
       * Fenced exactly as capture itself is:
       *   • enumerators only — a clerk's office position must never be filed as a
       *     field capture (13-71 AC7);
       *   • never on a REOPENED submission — a false coordinate is worse than an
       *     absent one (13-71 R7);
       *   • only on a SETTLED retryable reason — `null` includes "the open-time
       *     capture is still running", and two captures at once is a race.
       *   • ⛔ 13-76 AC5 — NOT on a dismissed prompt, although the block treats one as
       *     retryable. This reads `isRetryableCaptureFailure`, never
       *     `classifyBlockFailure`: re-asking a dismissed prompt here would put the
       *     OS dialog on top of "Complete Survey". Its retry is the in-banner TAP.
       * ONE attempt, no timers: a loop is how U9/U13 happened here.
       */
      const reason = gpsUnavailableReason;
      if (
        isPreview ||
        !isEnumerator ||
        restoredDraftRef.current ||
        reason === null ||
        !isRetryableCaptureFailure({ ok: false, reason })
      ) {
        return snapshotAnswers();
      }
      setLocating(true);
      try {
        if (!(await permissionAllowsSilentRefresh())) return snapshotAnswers();
        const retry = await capturePosition(SUBMIT_REFRESH_OPTIONS);
        // Review H1 — the interview was discarded while we waited.
        if (interviewEndedRef.current) return snapshotAnswers();
        // A success is the fix; a failure is the newest verdict (AC9) and the
        // amber block that follows describes IT.
        if (retry.ok) commitGeopoint(retry.position);
        else recordCaptureFailure(retry.reason);
        return snapshotAnswers();
      } finally {
        setLocating(false);
      }
    }

    if (!(await permissionAllowsSilentRefresh())) return snapshotAnswers();

    setLocating(true);
    let result;
    try {
      result = await capturePosition(SUBMIT_REFRESH_OPTIONS);
    } finally {
      setLocating(false);
    }
    // A failed refresh costs nothing: the open-time position stands and the
    // submission proceeds. This is an improvement, never a precondition.
    if (!result.ok) return snapshotAnswers();

    // Retain where the interview STARTED under its own key before overwriting.
    if (!isCapturedPosition(allAnswersRef.current[OPEN_CAPTURE_KEY])) {
      allAnswersRef.current[OPEN_CAPTURE_KEY] = openTime;
    }
    // 13-75 AC2 — the shared write. Keeps the rendered field in step, or a "Back"
    // from the completion screen would show the stale coordinate. Its reason and
    // panel clears are no-ops HERE (a position was already held, so neither can be
    // set) — see `commitGeopoint`.
    commitGeopoint(result.position);
    return snapshotAnswers();
  }, [geopointQuestion, commitGeopoint, recordCaptureFailure, snapshotAnswers, gpsUnavailableReason, isPreview, isEnumerator]);

  /**
   * ⛔ ULTRA REVIEW U4 + U5 + U8 — ONE WAY TO FINISH A SURVEY.
   *
   * There were three exits and they disagreed three different ways:
   *   • the PRIMARY one (essentially all the traffic) had **no try/catch at all** —
   *     a rejected `completeDraft` threw out of the onClick handler, so
   *     `setCompleted(true)` never ran and the enumerator got no completion screen,
   *     no error, and nothing logged (U5);
   *   • the pending-NIN one SWALLOWED the rejection and then ran
   *     `setCompleted(true)` OUTSIDE the try — affirmatively reporting "Survey
   *     saved!" for an interview that was never queued, under a comment claiming
   *     errors "surface through the draft hook", which exposes no error state at
   *     all (U4);
   *   • the escape hatch was correct, because R9 had already fixed it there.
   *
   * ⭐ THE ARGUMENT FOR ONE HELPER IS THE DIVERGENCE ITSELF. R9 fixed the instance
   * it found and two siblings kept the defect — the same instance-not-class shape
   * this story has now hit three times. With one path there is one place to be
   * right, and a fourth exit added later inherits it.
   *
   * It also carries U8's re-entrancy guard. AC2 put ~5 s of blocking await in front
   * of the queue write with nothing disabled, so a second tap on an unresponsive
   * button started a SECOND submission: two drafts, two queue rows, one interview —
   * and AC12, in this same story, would then score that as duplicate fraud against
   * an enumerator who did nothing wrong.
   */
  const submitInFlightRef = useRef(false);
  /**
   * ⛔ 13-75 REVIEW M1 — AND NEVER AGAIN ONCE IT HAS SUCCEEDED.
   *
   * `submitInFlightRef` only stops two submits that OVERLAP. The in-banner capture
   * made a sequential second one reachable: the open-time fix lands while an
   * in-banner attempt is out, the panel retires, the enumerator taps Complete
   * Survey and finishes — and the in-banner success then called this again from
   * the completion screen, rewriting the queued row with a different position.
   * Completion is terminal for this page (nothing resets `completed`), so this is.
   */
  const submittedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const finishSubmission = useCallback(
    async (answers: Record<string, unknown>): Promise<void> => {
      if (submitInFlightRef.current || submittedRef.current || interviewEndedRef.current) return;
      submitInFlightRef.current = true;
      setSubmitting(true);
      try {
        await draft.completeDraft(answers);
        submittedRef.current = true;
      } catch {
        // ⛔ NEVER a completion screen for a submission that was not queued.
        setGpsSubmitError(true);
        return;
      } finally {
        submitInFlightRef.current = false;
        setSubmitting(false);
      }

      setGpsBlocked(false);
      setGpsSubmitError(false);
      syncManager
        .syncNow()
        .then(() => reconcileReferenceCode(draft.draftId))
        .catch(() => {});
      setCompleted(true);
    },
    [draft, reconcileReferenceCode],
  );

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

        // U5 — one path, which handles its own failure and only then reports success.
        await finishSubmission(answers);
        return;
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
  }, [currentQuestion, currentIndex, formData, form, isPreview, ninDuplicateError, trigger, setError, clearErrors, refreshPositionForSubmit, geopointRequirementUnmet, finishSubmission]);

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
        /*
         * ⛔ ULTRA REVIEW U4 — THIS SWALLOWED THE FAILURE AND THEN CLAIMED SUCCESS.
         *
         * `setCompleted(true)` sat OUTSIDE the try, so an IndexedDB rejection —
         * quota, private browsing, a locked database, which is a FIELD PHONE's
         * normal weather — produced the "Survey saved!" screen for an interview
         * that had been queued nowhere. The comment said errors "surface through
         * the draft hook"; the hook exposes no error state whatsoever.
         */
        await finishSubmission(answers);
        return;
      }
      setSlideDirection('left');
      setTimeout(() => {
        setCurrentIndex(nextIdx);
        setSlideDirection(null);
      }, 50);
    },
    [form, currentQuestion, currentIndex, isPreview, ninCheck, clearErrors, refreshPositionForSubmit, geopointRequirementUnmet, finishSubmission],
  );

  /**
   * Story 13-71 AC4 — the WAIVER on a blocked submit. (Since 13-75 it is no longer
   * the only action: the capture button above it is the primary one, AC1/AC6.)
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
    // R9's semantics are preserved exactly — the panel is retired only once the
    // write has succeeded — but the implementation is now the shared one (U4/U5),
    // so this exit cannot drift away from its siblings again.
    // U13 — a SNAPSHOT, never the live accumulator.
    await finishSubmission({ ...allAnswersRef.current });
  }, [gpsUnavailableReason, finishSubmission]);

  /**
   * ⛔ STORY 13-75 AC1/AC3 — THE BLOCK OFFERS THE FIX, NOT ONLY THE EXIT.
   *
   * Field observation 2026-09-27: the first human ever to reach the amber panel did
   * not complete the interview at it, and the recorded reason was `timeout` — the
   * RETRYABLE class. The panel's only instruction was "go back to the location
   * question", which is the one action that dismisses the panel (U10). The
   * enumerator was told to do the thing that removes the guidance.
   *
   * Same options and the same generous watchdog as the open-time capture: a
   * permission prompt may be in front of the enumerator, and U3's bound must not
   * race a human (field defect 2026-09-26). The button shows it is working.
   *
   * RULED by Awwal 2026-09-27: a successful capture here RETRIES THE SUBMIT. The
   * enumerator already tapped "Complete Survey" and GPS was the sole blocker, so
   * recovery is one tap. A failed retry reports through `finishSubmission`'s own
   * catch (`submit-error-block`) and never reaches `setCompleted(true)`.
   */
  const handleGpsBlockCapture = useCallback(async () => {
    if (gpsBlockCaptureInFlightRef.current) return;
    gpsBlockCaptureInFlightRef.current = true;
    const epoch = gpsBlockEpochRef.current;
    setGpsBlockCapturing(true);

    const result = await capturePosition(OPEN_CAPTURE_OPTIONS, OPEN_CAPTURE_WATCHDOG_MS);

    // Review H1 — discarded or unmounted: nothing of this interview may be written.
    if (interviewEndedRef.current) return;

    if (epoch !== gpsBlockEpochRef.current) {
      /*
       * The enumerator pressed Back while this was in flight — they withdrew the
       * submit, and `handleBack` already released the guard and the spinner. A
       * real position is still a real position (U13's reasoning), so it is kept;
       * but submitting the survey from whatever question they are now on would be
       * the panel following them around again, which is U10.
       *
       * Review L1 — and a late FAILURE is kept too, as the verdict it is (AC9). It
       * was dropped while a late success was kept, so the next panel described,
       * and gated the waiver on, a reason that was no longer the last one seen.
       * It does not count as an attempt: Back reset the count, and this attempt
       * belongs to the panel they left.
       */
      if (result.ok) commitGeopoint(result.position);
      else recordCaptureFailure(result.reason);
      return;
    }
    gpsBlockCaptureInFlightRef.current = false;
    setGpsBlockCapturing(false);

    if (!result.ok) {
      // AC9 — the freshest verdict is the one the waiver files and the copy reads.
      // 13-76 — and for code 1 the probe says whether this was a second dismissal.
      recordCaptureFailure(result.reason);
      // AC6 — one failed attempt is what releases the waiver on a retryable reason.
      setGpsBlockFailedAttempts((n) => n + 1);
      return;
    }

    // AC10 — the whole position, accuracy included, through the one write (AC2).
    commitGeopoint(result.position);
    await finishSubmission(snapshotAnswers());
  }, [commitGeopoint, recordCaptureFailure, finishSubmission, snapshotAnswers]);

  const handleBack = useCallback(() => {
    if (!form) return;

    // Use full-array index for navigation
    const prevIdx = isPreview
      ? (currentIndex > 0 ? currentIndex - 1 : -1)
      : getPrevVisibleIndex(form.questions, currentIndex, formData, form.sectionShowWhen, undefined, {
          calculations: form.calculations,
        });
    if (prevIdx === -1) return;

    /*
     * ⛔ ULTRA REVIEW U10 — THE AMBER PANEL FOLLOWED THE ENUMERATOR EVERYWHERE.
     *
     * `gpsBlocked` was set on a refused submit and cleared only on success or on a
     * manual capture. Nothing cleared it on navigation — so the panel, and its
     * one-tap button that submits the WHOLE survey with a reason and no further
     * validation, rendered under every question the enumerator moved to. Its own
     * text says "Go back to the location question", which is precisely the action
     * that used to leave it on screen. A mis-tap three questions from the end
     * filed the interview.
     */
    setGpsBlocked(false);
    setGpsSubmitError(false);
    /*
     * Story 13-75 AC8 — and every piece of state the in-banner capture added, on
     * the same path. A stale attempt count would reveal the waiver on the NEXT
     * refusal without anyone having tried; a stale in-flight latch would leave the
     * next panel's capture button dead. Bumping the epoch disowns an attempt that
     * is still out, so it cannot auto-submit from under the enumerator (AC3).
     */
    setGpsBlockFailedAttempts(0);
    setGpsBlockCapturing(false);
    gpsBlockCaptureInFlightRef.current = false;
    gpsBlockEpochRef.current += 1;

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

  /*
   * ⛔ STORY 13-76 AC8 — WHICH CONSUMERS OF RETRYABILITY CHANGED, AND WHICH MUST NOT.
   *
   *   • open-time LATCH (`autoCaptureDoneRef`)      — UNCHANGED: `isRetryableCaptureFailure`.
   *     Code 1 still latches; un-latching it re-runs capture for a blocked site (U9).
   *   • AC11 SILENT retry (`refreshPositionForSubmit`) — UNCHANGED: `isRetryableCaptureFailure`,
   *     then `permissionAllowsSilentRefresh`, which is false for `prompt`. A dismissed
   *     prompt gets NO silent capture — its retry is the human tap (AC5).
   *   • this WAIVER GATE and the COPY (block + location question) — CHANGED:
   *     `classifyBlockFailure`, which alone reads the permission state.
   */
  // `null` is "no attempt on record": unknown, so the waiver is not withheld.
  const blockFailureKind =
    gpsUnavailableReason === null
      ? null
      : classifyBlockFailure(gpsUnavailableReason, gpsPermissionState, gpsPromptDismissals);
  const blockPromptDismissed = blockFailureKind === 'dismissed';
  // Story 13-75 AC4 — the block's guidance, keyed on the CURRENT reason (AC9).
  const blockRemediation = gpsRemediation(gpsUnavailableReason, { promptDismissed: blockPromptDismissed });
  // Story 13-75 AC6, widened by 13-76 AC3 — a dismissed prompt is retryable HERE.
  const blockReasonRetryable = blockFailureKind === 'retryable' || blockFailureKind === 'dismissed';
  const waiverAvailable = !blockReasonRetryable || gpsBlockFailedAttempts > 0;

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
                  // 13-75 AC2 — through the shared write, which also clears
                  // `gpsSubmitError`: this site used to leave it standing.
                  if (
                    geopointQuestion &&
                    currentQuestion.name === geopointQuestion.name &&
                    isCapturedPosition(value)
                  ) {
                    commitGeopoint(value);
                  }
                  setFormData({ ...allAnswersRef.current });
                  clearErrors(currentQuestion.name);
                  if (isCurrentNin) {
                    ninCheck.reset();
                  }
                }}
                error={displayError}
                disabled={isPreview}
                /*
                 * U15 — a MANUAL capture's failure is the freshest evidence there is,
                 * and it must override whatever the open-time attempt concluded. The
                 * escape hatch files this value, so filing the stale one mislabels
                 * the enumerator's problem.
                 */
                onCaptureError={recordCaptureFailure}
                /*
                 * 13-75 AC7 — a failed open-time capture is explained ON the
                 * location question, mid-interview, where fixing it is free. Help
                 * text on the question it concerns, not a standing banner.
                 */
                captureFailureReason={gpsUnavailableReason}
                /* 13-76 AC2 — the same dismissed/settled reading the block uses. */
                captureFailurePromptDismissed={blockPromptDismissed}
                /* 13-76 review L2 — and the same withholding while the probe is out. */
                captureFailureCopyPending={gpsPermissionProbing}
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
              // 13-75 AC11 — no Back while a silent capture decides whether this submits.
              disabled={locating}
              className="min-h-[48px] md:min-h-[48px] px-6 py-3 bg-white border border-gray-200 text-gray-500 rounded-lg font-medium hover:bg-gray-50 transition-colors md:flex-1 disabled:opacity-50"
              data-testid="back-btn"
            >
              Back
            </button>
          )}
          {/*
            ⛔ ULTRA REVIEW U8 — THE BUTTON NOW SAYS SOMETHING IS HAPPENING, AND STOPS
            ACCEPTING TAPS WHILE IT IS.

            AC2 put a permission check plus a position fix — up to ~5 s — in front of
            the queue write, with no spinner, no disabled state and no re-entrancy
            guard. On a slow phone that is an unresponsive button, and an unresponsive
            button gets tapped again: two drafts, two queue rows, ONE interview. ⭐ And
            AC12, in this same story, would then score that pair as duplicate fraud
            against an enumerator who did exactly what the UI invited.

            `finishSubmission` carries the authoritative guard; this is the half the
            person can see.
          */}
          <button
            onClick={handleContinue}
            disabled={!!displayError || ninCheck.isChecking || submitting || locating}
            className={`min-h-[56px] md:min-h-[48px] px-6 py-3 bg-[#9C1E23] text-white rounded-lg font-medium
              hover:bg-[#7A171B] transition-colors flex-1
              ${displayError || ninCheck.isChecking || submitting || locating ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid="continue-btn"
          >
            {locating
              ? 'Getting location…'
              : submitting
              ? 'Saving…'
              : !hasNextQuestion
                ? isPreview
                  ? 'Finish Preview'
                  : 'Complete Survey'
                : 'Continue'}
          </button>
        </div>

        {/*
          Story 13-71 AC3/AC4 — the blocked submit. 13-75 gave it the fix (a live
          capture button) and demoted the waiver that used to be its only action.

          ⛔ 13-75 AC7 — STILL submit-triggered. It appears only after a submit was actually refused, never as a standing
          warning: a banner shown before anyone has tried to do anything is noise
          an enumerator learns to scroll past in a week.
        */}
        {/*
          ⛔ ULTRA REVIEW U5 — THE FAILURE NOTICE LIVED INSIDE THE AMBER PANEL.
          `gps-submit-error` was nested under `gpsBlocked`, so it could only ever be
          seen on the escape-hatch path. A failed write on the PRIMARY exit — the one
          carrying essentially all the traffic — had nowhere to be reported at all.
          It is now its own panel, shown whenever a submit failed and the amber block
          is not already carrying the message.
        */}
        {gpsSubmitError && !gpsBlocked && (
          <div
            className="rounded-lg border border-error-200 bg-error-50 p-4"
            role="alert"
            data-testid="submit-error-block"
          >
            <p className="text-sm font-medium text-error-700">
              That did not save. Check your phone has storage free and tap
              “Complete Survey” again — the survey has not been submitted yet.
            </p>
          </div>
        )}

        {gpsBlocked && (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3"
            role="alert"
            data-testid="gps-required-block"
          >
            <p className="text-sm font-medium text-amber-900">
              This survey needs a location before it can be submitted.
            </p>
            {/*
              Story 13-75 AC4/AC5 — what to fix, for the reason the phone ACTUALLY
              gave, from the same source the location question reads (Task 3.1).
              Re-renders on a failed in-banner attempt, so it always describes the
              last thing that happened (AC9). "Go back to the location question" is
              gone: it was the one action that dismissed this panel (U10).
            */}
            <div data-testid="gps-block-remediation" className="space-y-1">
              {/* 13-76 review L2 — no copy until the probe says which code 1 this is. */}
              {!gpsPermissionProbing && (
                <GpsRemediationCopy remediation={blockRemediation} className="text-sm text-amber-800" />
              )}
            </div>
            {/* AC1 — the fix, in place, as the primary action. */}
            <button
              type="button"
              onClick={handleGpsBlockCapture}
              disabled={gpsBlockCapturing || submitting}
              className={`min-h-[48px] w-full px-4 py-3 bg-[#9C1E23] text-white rounded-lg font-medium
                hover:bg-[#7A171B] transition-colors
                ${gpsBlockCapturing || submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-testid="gps-block-capture-btn"
            >
              {gpsBlockCapturing ? 'Capturing location...' : '📍 Capture GPS Location'}
            </button>
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
            {/*
              ⛔ Story 13-75 AC6 — THE WAIVER IS DEMOTED, AND GATED BY RETRYABILITY.

              Understated on the discard-interview precedent below: it files the
              interview without a location, so it must never read as a peer of the
              capture button. On a retryable reason (`classifyBlockFailure`: a
              `timeout`/`position_unavailable`, or since 13-76 a FIRST dismissed
              prompt) it appears only once an in-banner attempt has failed — the
              field case waived a `timeout` without a retry ever being offered, and
              Awwal's read waived a dismissal the same way. On a settled or unknown
              reason it is there at once: forcing attempts that cannot succeed is
              cruelty, not rigour.

              R-b: no reason hides it forever. Every attempt settles (the watchdog
              bounds it) and a failed one reveals it.
            */}
            {waiverAvailable ? (
              <div className="pt-1 text-center space-y-1">
                <p className="text-xs text-amber-800">
                  If your phone will not give one, confirm and the survey will record why.
                </p>
                <button
                  type="button"
                  onClick={handleGpsUnavailableConfirm}
                  disabled={gpsBlockCapturing || submitting}
                  className="min-h-[44px] px-2 text-sm text-gray-600 underline underline-offset-2 hover:text-amber-900 transition-colors disabled:opacity-50"
                  data-testid="gps-unavailable-btn"
                >
                  I could not capture a location
                </button>
              </div>
            ) : (
              <p className="text-xs text-amber-800 text-center" data-testid="gps-waiver-pending">
                {/*
                  13-76 review L6 — a dismissal never FELT like a failure (they tapped
                  past a dialog), so "if it fails again" explains nothing to them.
                */}
                {blockPromptDismissed
                  ? 'If Allow does not work, an option to submit without a location will appear here.'
                  : 'If it fails again, an option to submit without a location will appear here.'}
              </p>
            )}
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
                // 13-75 review H1 — BEFORE the first await: a capture resuming inside
                // it must find the interview already gone, not queue it.
                interviewEndedRef.current = true;
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

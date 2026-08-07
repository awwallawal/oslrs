import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CompletionConfetti } from '../../../components/CompletionConfetti';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WizardLayout } from '../../../layouts/WizardLayout';
import { useWizardDraft } from '../hooks/useWizardDraft';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { useToast } from '../../../hooks/useToast';
import { ApiError } from '../../../lib/api-client';
import {
  submitWizard,
  requestMagicLink,
  derivePendingNin,
  fetchPublicActiveForm,
  fetchEditableRegistration,
  editRegistration,
  type WizardDraftData,
  type FlattenedForm,
} from '../api/wizard.api';
import { isSectionStepSkippable } from '../lib/section-relevance';
import { computePrefill, buildWizardIdentitySignature } from '../lib/wizard-prefill';
import { unionGeopointNames } from '../../forms/utils/geopoint-suppression';
import { deriveReviewCompleteness } from '../lib/review-completeness';
import { parseUtm, ATTRIBUTION_ENABLED, toCampaignSourcePayload } from '../lib/attribution'; // Story 13-1
import {
  parseStepParam,
  clampToReached,
  advanceStep,
  retreatStep,
} from '../lib/wizard-navigation';
import { Step1BasicInfo } from './Step1BasicInfo';
import { Step2ContactLga } from './Step2ContactLga';
import { Step3Consent } from './Step3Consent';
import { Step4Questionnaire } from './Step4Questionnaire';
import { Step5ReviewAndSave } from './Step5ReviewAndSave';

/**
 * Story 9-12 Task 4.3 + Task 5 — public registration wizard.
 * Story 9-18 Part E (AC#E1/E3) — dynamic, section-as-step structure.
 *
 * The wizard is N steps: three fixed head steps (Basics / Contact / Consent),
 * one step per questionnaire SECTION of the pinned public form (each rendered
 * by `Step4Questionnaire` with a `sectionIndex`), and a final Review step. When
 * no public form is configured the section steps simply don't exist (the survey
 * is skipped). Each step owns its validation + Continue/Back; the wizard page
 * owns the step list, URL routing (`/register?step=N`), draft persistence, the
 * empty-section auto-skip (AC#E5), and the final submit.
 *
 * Cross-device resume: when a `?token=<wizard_resume>` query param is present,
 * `useWizardDraft` hydrates from the server-side draft and the wizard jumps to
 * the saved step.
 */

const HEAD_STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'contact', label: 'Contact' },
  { id: 'consent', label: 'Consent' },
] as const;

interface WizardStepDef {
  id: string;
  label: string;
  /** Present only for section steps — the ordinal passed to FormRenderer. */
  sectionIndex?: number;
  sectionId?: string;
  sectionTitle?: string;
}

/** Build the dynamic step list from the pinned form's sections (AC#E1/E3). */
function buildSteps(form: FlattenedForm | null): WizardStepDef[] {
  const sections: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const q of form?.questions ?? []) {
    if (!seen.has(q.sectionId)) {
      seen.add(q.sectionId);
      sections.push({ id: q.sectionId, title: q.sectionTitle });
    }
  }
  return [
    ...HEAD_STEPS.map((s) => ({ id: s.id, label: s.label })),
    ...sections.map((s, i) => ({
      id: `section-${s.id}`,
      label: s.title,
      sectionIndex: i,
      sectionId: s.id,
      sectionTitle: s.title,
    })),
    { id: 'review', label: 'Review' },
  ];
}

export default function WizardPage({ authenticated = false }: { authenticated?: boolean } = {}) {
  useDocumentTitle(
    authenticated
      ? 'Manage your registration | Oyo State Skills Registry'
      : 'Register | Oyo State Skills Registry',
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const resumeToken = searchParams.get('token') ?? undefined;

  // Story 9-61 — authenticated edit mode disables the email-keyed draft autosave
  // (the user edits an existing respondent via PUT /me/registration/wizard).
  const draft = useWizardDraft({ token: resumeToken, disableAutosave: authenticated });
  // Story 9-57 — the draft's step setter is a STABLE callback (hook change);
  // destructure it so the write-only persistence effect can depend on a plain
  // identifier (no `draft`-object dep churn, no eslint-disable).
  const { setCurrentStepIndex: persistStepToDraft } = draft;

  // Story 9-18 Part E — fetch the pinned form here (shared query key with the
  // section steps, so TanStack fetches it once) to derive the dynamic step list.
  const formQuery = useQuery({
    queryKey: ['wizard', 'public-active-form'],
    queryFn: fetchPublicActiveForm,
    staleTime: 5 * 60 * 1000,
  });
  const form = formQuery.data ?? null;
  // Settled = the form query RESOLVED to a value: a form, or null on 404
  // ("no form configured" → survey legitimately skipped). A non-404 fetch ERROR
  // is deliberately NOT settled — it's surfaced as an explicit retry state below
  // (AI-Review M1), so a transient network failure never silently produces a
  // survey-less wizard. Gating on a stable step list also avoids the 4→N flash.
  const formSettled = formQuery.isSuccess;
  const steps = useMemo(() => buildSteps(form), [form]);

  // Story 9-57 — the URL (`?step=N`) is the SINGLE source of truth for the
  // current step. `stepFromUrl` is the parsed + range-clamped value (or null
  // when absent); the rendered step is derived from it below.
  const stepFromUrl = useMemo(
    () => parseStepParam(searchParams.get('step'), steps.length),
    [searchParams, steps.length],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Story 9-61 — the respondent's established NIN (captured from the edit seed);
  // drives Step 1's read-only NIN lock in authenticated edit mode.
  const [ownNin, setOwnNin] = useState<string | undefined>(undefined);
  const [completionData, setCompletionData] = useState<{
    submissionUid: string;
    referenceCode: string;
    pendingNin: boolean;
  } | null>(null);

  // Story 9-54 AC6.1 — the furthest step the user has LEGITIMATELY reached (via
  // Continue or a resumed server draft). A deep-link / resume `?step=N` beyond
  // this is clamped back so the questionnaire can't be skipped to land on
  // Review. It only ever rises, and it rises ONLY from (a) Continue advancing
  // by one and (b) the server-saved resume step — never directly from the URL,
  // so a crafted `?step=99` can't inflate it.
  const [maxReachedStepIndex, setMaxReachedStepIndex] = useState(0);
  useEffect(() => {
    if (!draft.isHydrated) return;
    // Resume hydration: the server-saved step is a legitimately-reached step.
    setMaxReachedStepIndex((m) => (draft.currentStepIndex > m ? draft.currentStepIndex : m));
  }, [draft.isHydrated, draft.currentStepIndex]);

  // Story 9-61 (AC#1/#5) — authenticated edit/resume mode. Seed the form ONCE
  // from the session read-model (`GET /me/registration`). Gated on
  // `authenticated`, so the public registration flow is untouched.
  // Story 13-1 (AC1/AC6.2) — capture acquisition UTM/?ref ONCE on entry into the draft's
  // forward-compat extras slot. Held in-memory until the (email-keyed) draft first autosaves,
  // so a resumed draft keeps its first-seen UTM (AC1.3). Best-effort — never blocks the wizard.
  const utmCapturedRef = useRef(false);
  useEffect(() => {
    if (!ATTRIBUTION_ENABLED || utmCapturedRef.current || !draft.isHydrated) return;
    utmCapturedRef.current = true;
    if (draft.formData.extras?.utm) return; // resumed draft already carries UTM — don't clobber
    const utm = parseUtm(searchParams);
    if (utm) draft.mergeFields({ extras: { ...(draft.formData.extras ?? {}), utm } });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on hydration; mergeFields is stable
  }, [draft.isHydrated]);

  const hasSeededAuth = useRef(false);
  useEffect(() => {
    if (!authenticated || hasSeededAuth.current) return;
    hasSeededAuth.current = true;
    fetchEditableRegistration()
      .then((res) => {
        const wd = res.wizardData;
        if (!wd) return;
        draft.mergeFields({
          givenName: wd.givenName,
          familyName: wd.familyName,
          dateOfBirth: wd.dateOfBirth,
          gender: wd.gender,
          phone: wd.phone,
          email: wd.email,
          lgaId: wd.lgaId,
          nin: wd.nin,
          pendingNinToggle: wd.pendingNin,
          consentMarketplace: wd.consentMarketplace,
          consentEnriched: wd.consentEnriched,
          questionnaireResponses: wd.questionnaireResponses,
        });
        setOwnNin(wd.nin ?? undefined);
      })
      .catch(() => {
        // Non-fatal — the user can still fill the wizard; submit surfaces errors.
      });
  }, [authenticated, draft]);

  // Edit mode opens with the full registration already present, so every step is
  // legitimately reachable (no skip-ahead-to-Review risk — the data exists).
  useEffect(() => {
    if (authenticated && formSettled && steps.length > 0) {
      setMaxReachedStepIndex(steps.length - 1);
    }
  }, [authenticated, formSettled, steps.length]);

  // Story 9-57 (AI-Review H1) — the furthest-reached ceiling, computed
  // SYNCHRONOUSLY. `maxReachedStepIndex` is bumped by the effect above, which
  // lags draft hydration by one commit; on the hydration render its closure
  // value is still 0. Folding the hydrated draft step in here means the render
  // clamp + the over-reach correction never read a stale 0 on a `?token` resume
  // — which previously clamped an explicit `?step` resume down to step 0 when
  // the form query happened to settle before the draft hydrated.
  const effectiveMaxReached = Math.max(
    maxReachedStepIndex,
    draft.isHydrated ? draft.currentStepIndex : 0,
  );

  // Story 9-57 — the RENDERED current step, derived purely from the URL and
  // clamped to the furthest-reached step. This is the only navigation source;
  // there is no reverse effect that writes it back, so the 2026-05-12
  // URL↔state doom-loop is structurally impossible.
  const currentStepIndex = clampToReached(stepFromUrl, effectiveMaxReached);

  // Helper — write a step to the URL for USER navigation (Continue / Back /
  // indicator jumps), preserving other params (e.g. `?token`). This PUSHES a
  // history entry so browser back/forward moves between visited steps (AC4.3).
  // System-initiated URL corrections (the one-time seed + the over-reach clamp
  // below) use `replace` instead, so they never spam the history stack.
  const navigateToStep = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, steps.length - 1));
      const next = new URLSearchParams(searchParams);
      next.set('step', String(clamped));
      setSearchParams(next);
    },
    [searchParams, setSearchParams, steps.length],
  );

  // Story 9-57 AC3 — one-time URL seed. On first settled render, if the URL has
  // no `?step`, write one: the saved draft step for a `?token` resume, else 0.
  // An explicit `?step` always wins (we never overwrite it). Guarded by a ref so
  // it runs exactly once and can never loop.
  const hasSeededUrl = useRef(false);
  useEffect(() => {
    if (!draft.isHydrated || !formSettled) return;
    if (hasSeededUrl.current) return;
    hasSeededUrl.current = true;
    if (searchParams.get('step') !== null) return; // explicit ?step wins (AC3.2)
    const seed = resumeToken
      ? Math.max(0, Math.min(draft.currentStepIndex, steps.length - 1))
      : 0;
    const next = new URLSearchParams(searchParams);
    next.set('step', String(seed));
    setSearchParams(next, { replace: true });
  }, [
    draft.isHydrated,
    draft.currentStepIndex,
    formSettled,
    resumeToken,
    searchParams,
    setSearchParams,
    steps.length,
  ]);

  // Story 9-57 AC4.1 — self-correct an over-reaching URL. When `?step` points
  // beyond the furthest-reached step, rewrite it down to the clamp so the stale
  // (skip-ahead) value can't be re-shared or re-trigger a jump. One-directional
  // (only ever corrects DOWN to a fixed point) — not a two-way binding.
  useEffect(() => {
    if (!draft.isHydrated || !formSettled) return;
    if (stepFromUrl == null) return;
    if (stepFromUrl <= effectiveMaxReached) return;
    const next = new URLSearchParams(searchParams);
    next.set('step', String(effectiveMaxReached));
    setSearchParams(next, { replace: true });
  }, [draft.isHydrated, formSettled, stepFromUrl, effectiveMaxReached, searchParams, setSearchParams]);

  // Story 9-57 AC2 — write-only draft persistence. Mirror the URL-derived step
  // into the draft store so autosave/resume persist the right `currentStep`.
  // This NEVER feeds back into render/navigation (render reads the URL-derived
  // `currentStepIndex`, not `draft.currentStepIndex`), so there is no loop.
  // `draft.setCurrentStepIndex` is a stable callback (Story 9-57 hook change).
  useEffect(() => {
    if (!draft.isHydrated || !formSettled) return;
    // Only mirror once the URL carries an explicit `?step` (post-seed). Before
    // the seed lands, `currentStepIndex` defaults to 0 — mirroring it then would
    // clobber a `?token` resume's saved step back to 0 before the seed restores it.
    if (stepFromUrl == null) return;
    if (draft.currentStepIndex !== currentStepIndex) {
      persistStepToDraft(currentStepIndex);
    }
  }, [
    currentStepIndex,
    stepFromUrl,
    draft.currentStepIndex,
    draft.isHydrated,
    persistStepToDraft,
    formSettled,
  ]);

  const goToStep = useCallback(
    (idx: number) => {
      navigateToStep(idx);
    },
    [navigateToStep],
  );

  // Story 9-18 AC#E5 — a section step whose questions are ALL hidden by
  // `showWhen` (given the current answers) is auto-skipped during Continue/Back.
  // Head + Review steps have no `sectionId` and are never skippable.
  // Story 13-29 — visibility is evaluated against the calculated-field-augmented
  // answer map (via `isSectionStepSkippable`), so a section gated on a computed
  // field (e.g. `grp_labor` / `${age} >= 15`) resolves the SAME way it does at
  // Review. This kills the two-pass "go back and fill survey" loop where a calc-
  // gated section was skipped here (raw responses, no `age`) but demanded at
  // Review (calc-augmented). The under-15 skip still holds — `age < 15` → hidden.
  // Story 13-34 (AI-Review H2) — the public wizard mounts FormRenderer with
  // `suppressGeopoint`, so geopoint questions are unreachable HERE too. They must
  // union into the same hide-set the skip decision uses; otherwise a section left
  // with only a geopoint is NOT auto-skipped and strands the user on "No questions
  // available" — the exact dead-end 13-29 fixed for prefilled-only sections.
  // Story 13-35 (code-review H1) — DERIVE the prefilled hide-set here instead of
  // reading `draft.formData.prefilledQuestionNames`. That field is stamped by
  // `Step4Questionnaire`'s effect, i.e. by the very step this skip is meant to
  // avoid: on a FIRST forward pass it is still empty, so an all-prefilled section
  // read as "has visible questions", the wizard navigated into it, and
  // FormRenderer painted "No questions available" — the 13-29 dead-end, alive
  // again through the bootstrap door. `computePrefill` is a pure function of
  // (form, draft identity), so it resolves the same on the first pass as on the
  // tenth — exactly like `unionGeopointNames` already does for geopoints.
  // The stamped names are still unioned in, so a RESUMED draft whose form has
  // since changed keeps hiding whatever Step 4 previously auto-filled.
  const identitySig = buildWizardIdentitySignature(draft.formData);
  const unreachableQuestionNames = useMemo(() => {
    const hidden = computePrefill(form, draft.formData).hideNames;
    for (const name of draft.formData.prefilledQuestionNames ?? []) hidden.add(name);
    return unionGeopointNames(form?.questions ?? [], hidden) ?? new Set<string>();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identitySig captures the only draft inputs computePrefill reads; memoising on the whole formData would churn this Set (and isStepSkippable/indicatorSteps) on every keystroke
  }, [form, identitySig, draft.formData.prefilledQuestionNames]);

  // Story 13-35 (code-review, follow-up) — the prefill VALUES, derived at the
  // point of use rather than read back from the stamp `Step4Questionnaire`
  // writes. Now that an all-prefilled section is correctly SKIPPED, that step may
  // never mount — and it is the only writer of the prefill into
  // `questionnaireResponses`. Two things would then break:
  //   1. Submit HARD-BLOCKS. `deriveReviewCompleteness` excludes only pending-NIN
  //      and geopoint names, so a required identity question that was never
  //      stamped reads as MISSING → "Please answer all required survey questions"
  //      pointing at a section that renders nothing.
  //   2. `raw_data` loses the identity keys 13-33 analytics reads
  //      (`raw_data->>'gender'` etc.) — the load-bearing dedup plumbing.
  // Deriving here makes the gate, the skip predicate and the submit payload all
  // immune to whether Step 4 ever rendered. Step 4 still stamps as before; this
  // is the same value computed from the same pure function, not a second writer.
  const effectiveFormData = useMemo(
    () => ({
      ...draft.formData,
      questionnaireResponses: {
        ...(draft.formData.questionnaireResponses ?? {}),
        ...computePrefill(form, draft.formData).prefillValues,
      },
    }),
    [form, draft.formData],
  );

  const isStepSkippable = useCallback(
    (idx: number): boolean =>
      isSectionStepSkippable(
        form,
        steps[idx]?.sectionId,
        // Prefill-augmented (see `effectiveFormData`): a section gated on a
        // CALCULATED field derived from a prefilled answer (e.g. `${age}` from a
        // prefilled dob) must resolve the same here as it does at Review.
        effectiveFormData.questionnaireResponses,
        undefined, // default clock (call-time now) — matches the Review completeness gate
        // Story 13-29 (AI-Review L1) — exclude wizard-prefilled (hidden) questions
        // so a section made up entirely of them auto-skips instead of stranding the
        // user on FormRenderer's "No questions available" screen. Story 13-34 adds
        // suppressed geopoint questions to the same set.
        unreachableQuestionNames,
      ),
    [steps, form, effectiveFormData.questionnaireResponses, unreachableQuestionNames],
  );

  // Story 13-35 (code-review, follow-up) — LANDING-step correction.
  // `isStepSkippable` is otherwise consulted only by Continue/Back, so it cannot
  // help a user who ARRIVES on a skippable step instead of navigating into one:
  // a resumed draft whose saved `currentStep` points at an all-prefilled section
  // — exactly what pre-fix drafts recorded, since the old bug DID land users
  // there — would still paint "No questions available". Correcting forward here
  // makes the AC2 invariant absolute: the user can never sit on a step with
  // nothing to answer, however they arrived (resume, deep link, indicator jump).
  //
  // Cannot loop: `advanceStep` only ever returns a NON-skippable index and stops
  // at Review (which has no sectionId and is never skippable), so this settles in
  // one hop. `replace` keeps a system correction out of the history stack — the
  // same convention as the seed and over-reach effects above. Bumping the ceiling
  // mirrors `handleContinue` and is safe under Story 9-54 AC6.1: it only ever
  // moves past steps that have nothing to answer, so a crafted `?step` still
  // can't inflate `maxReached`.
  useEffect(() => {
    if (!draft.isHydrated || !formSettled) return;
    if (stepFromUrl == null) return; // wait for the one-time URL seed
    if (!isStepSkippable(currentStepIndex)) return;
    const next = advanceStep(currentStepIndex, steps.length, isStepSkippable);
    if (next === currentStepIndex) return;
    setMaxReachedStepIndex((m) => (next > m ? next : m));
    const params = new URLSearchParams(searchParams);
    params.set('step', String(next));
    setSearchParams(params, { replace: true });
  }, [
    draft.isHydrated,
    formSettled,
    stepFromUrl,
    currentStepIndex,
    isStepSkippable,
    steps.length,
    searchParams,
    setSearchParams,
  ]);

  const handleContinue = useCallback(() => {
    const next = advanceStep(currentStepIndex, steps.length, isStepSkippable);
    // Story 9-57 — Continue is the only forward path, so bump the furthest-
    // reached ceiling here (batched with the URL change) — otherwise the derived
    // step would be clamped straight back. `next` is one step (plus auto-skips)
    // beyond the already-clamped current step, so a crafted URL can't inflate it.
    setMaxReachedStepIndex((m) => (next > m ? next : m));
    navigateToStep(next);
  }, [currentStepIndex, steps.length, isStepSkippable, navigateToStep]);

  const handleBack = useCallback(() => {
    if (currentStepIndex === 0) {
      // Story 9-61 — in authenticated edit mode, "back" returns to the dashboard.
      navigate(authenticated ? '/dashboard/public' : '/');
      return;
    }
    const prev = retreatStep(currentStepIndex, isStepSkippable);
    navigateToStep(prev);
  }, [currentStepIndex, isStepSkippable, navigateToStep, navigate, authenticated]);

  // Step list for the indicator, annotated with which section steps are
  // currently auto-skipped (AC#E5 — greyed in the breadcrumb variant).
  const indicatorSteps = useMemo(
    () => steps.map((s, i) => ({ id: s.id, label: s.label, skipped: isStepSkippable(i) })),
    [steps, isStepSkippable],
  );

  // Story 9-54 AC6.2 — Step-5 completeness guard. Reuses the SAME shared rule
  // the server enforces (AC5) so Submit is disabled until every required +
  // relevant questionnaire answer is present; the server gate stays authoritative.
  const reviewCompleteness = useMemo(
    // Prefill-augmented (see `effectiveFormData`) — otherwise a skipped
    // all-prefilled section leaves its required questions looking unanswered and
    // Submit hard-blocks on a step that renders nothing.
    () => deriveReviewCompleteness(form, effectiveFormData, steps),
    [form, effectiveFormData, steps],
  );

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const fd = draft.formData;
    // Story 9-18 Part C: NIN is captured canonically at Step 1 — read it directly
    // (the Step-5 dispatcher + questionnaire-NIN extraction are retired). Pending
    // is derived via the shared helper so the Step-5 label/badge can't drift from
    // this submit decision (AI-Review M1).
    const pending = derivePendingNin(fd);
    const nin = pending ? undefined : fd.nin;

    if (!fd.givenName || !fd.email || !fd.phone || !fd.lgaId) {
      setSubmitError('Some required fields are missing. Please go back and complete them.');
      setIsSubmitting(false);
      return;
    }
    if (typeof fd.consentMarketplace !== 'boolean') {
      setSubmitError('Please complete the consent step before submitting.');
      setIsSubmitting(false);
      return;
    }
    // Story 9-54 AC6.2 — defence-in-depth: block submit if the questionnaire is
    // incomplete (the server AC5 gate is the authority, but fail fast in the UI).
    if (!reviewCompleteness.complete) {
      setSubmitError('Please answer all required survey questions before saving.');
      setIsSubmitting(false);
      return;
    }

    const payload = {
      givenName: fd.givenName,
      familyName: fd.familyName?.trim() || undefined,
      dateOfBirth: fd.dateOfBirth,
      gender: fd.gender,
      phone: fd.phone,
      email: fd.email,
      lgaId: fd.lgaId,
      consentMarketplace: fd.consentMarketplace,
      consentEnriched: fd.consentEnriched ?? false,
      nin,
      pendingNin: pending,
      // Prefill-augmented (see `effectiveFormData`) — a skipped all-prefilled
      // section means Step 4 never stamped these, and `raw_data` is what 13-33
      // analytics reads. Same values, derived instead of read back.
      questionnaireResponses: effectiveFormData.questionnaireResponses,
      // Story 13-23 (AC2) — bind the submission to the form the wizard actually
      // rendered. `form.formId` is the questionnaire_forms row PK UUID (Story
      // 9-33), read from the top-level form query — the authoritative "which
      // form did we render" value, present whenever a public form is configured
      // and immune to the draft-autosave race that dropped the stamp server-side.
      // Omitted (undefined) when no public form is pinned (Step 4 was empty).
      questionnaireFormId: form?.formId,
      // Story 13-1 attribution, carried in the PAYLOAD (2026-07-30) — the same
      // treatment `questionnaireFormId` got directly above, and for the same
      // reason: the wizard draft is debounced best-effort and must never be the
      // sole carrier. Sole-sourcing it meant the acquisition answer, chosen on
      // THIS screen with Submit directly beneath it, was lost by anyone who
      // clicked inside the 2s debounce — and lost outright while the draft-step
      // cap was rejecting every autosave past step 5. Server precedence is
      // payload → draft. Undefined when nothing was captured, so the key is
      // omitted rather than sent hollow.
      campaignSource: toCampaignSourcePayload(effectiveFormData.extras),
      authChoice: fd.authChoice ?? ('magic-link' as const),
    };

    try {
      // Story 9-61 — authenticated edit goes through the in-session validated
      // path (PUT /me/registration/wizard) and returns to the dashboard, instead
      // of the public submit + success screen.
      if (authenticated) {
        await editRegistration(payload);
        // Story 9-61 review M1 — bust the cached `me` read-models so the dashboard
        // reflects the edit immediately (the queryClient default staleTime is 5min,
        // so without this the user lands back on stale pre-edit state — e.g. a
        // just-completed NIN still showing "add your NIN").
        await queryClient.invalidateQueries({ queryKey: ['me'] });
        // 9-61 review L1 — explicit success feedback (the edit redirects to the
        // dashboard instead of the public success screen, so confirm it landed).
        toast.success({ message: 'Your registration has been updated.' });
        navigate('/dashboard/public');
        return;
      }

      const result = await submitWizard(payload);

      // Best-effort: kick off the login magic-link for active respondents.
      // Pending-NIN respondents already get the pending_nin_complete link from
      // the submitWizard backend.
      if (!pending && (fd.authChoice ?? 'magic-link') !== 'password') {
        try {
          await requestMagicLink({ email: fd.email, purpose: 'login' });
        } catch {
          // Best-effort — never block the success screen.
        }
      }

      setCompletionData({
        submissionUid: result.submissionUid,
        referenceCode: result.referenceCode,
        pendingNin: pending,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'NIN_DUPLICATE') {
          setSubmitError(
            'That NIN is already registered. If you think this is a mistake, please contact support.',
          );
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError('We could not submit your registration. Please try again in a moment.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    draft.formData,
    effectiveFormData.questionnaireResponses,
    // 2026-07-30 — MUST be a dependency. `handleSubmit` reads `.extras` to build
    // `campaignSource`; omitting it lets the callback close over a stale value and
    // submit attribution the user has since changed. That is the same stale-read
    // class this story exists to fix, so it is not an exhaustive-deps formality.
    effectiveFormData.extras,
    form,
    isSubmitting,
    reviewCompleteness,
    authenticated,
    navigate,
    queryClient,
    toast,
  ]);

  // AI-Review M1 — the pinned survey failed to load (a non-404 fetch error).
  // Surface it with a retry instead of silently dropping every section step and
  // letting the user submit with an empty questionnaire. A 404 ("no form
  // configured") is NOT an error — it resolves to null and the survey is skipped.
  if (formQuery.isError) {
    return (
      <WizardLayout steps={steps} currentStepIndex={0}>
        <div role="alert" className="space-y-3 text-center" data-testid="wizard-form-error">
          <p className="text-sm text-neutral-700">
            We couldn&apos;t load the registration survey. Please check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => formQuery.refetch()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            data-testid="wizard-form-error-retry"
          >
            Retry
          </button>
        </div>
      </WizardLayout>
    );
  }

  // Loading skeleton while hydrating from a magic-link token OR loading the form
  // (so the step list is stable before first paint).
  if (!draft.isHydrated || !formSettled) {
    return (
      <WizardLayout steps={steps} currentStepIndex={0}>
        <div className="space-y-4" data-testid="wizard-hydrating">
          <div className="h-6 w-1/2 animate-pulse rounded bg-neutral-100" />
          <div className="h-24 animate-pulse rounded bg-neutral-100" />
        </div>
      </WizardLayout>
    );
  }

  if (completionData) {
    return (
      <WizardLayout steps={steps} currentStepIndex={steps.length - 1}>
        <CompletionScreen
          email={draft.formData.email ?? ''}
          referenceCode={completionData.referenceCode}
          pendingNin={completionData.pendingNin}
        />
      </WizardLayout>
    );
  }

  return (
    <WizardLayout
      steps={indicatorSteps}
      currentStepIndex={currentStepIndex}
      onStepClick={(idx) => goToStep(idx)}
      footerSlot={
        draft.isSaving ? (
          <p className="text-xs text-neutral-500" data-testid="wizard-autosave-status">
            Saving your progress…
          </p>
        ) : draft.saveError ? (
          // 2026-07-30 — the previous copy read "We'll keep retrying", which was
          // FALSE: `scheduleSave` only fires on the next formData change, so a
          // user who stops typing is never retried. Combined with `text-xs` in a
          // footer, a wizard that had stopped saving entirely (the draft-step cap
          // rejected every autosave past step 5 for a week) looked completely
          // normal. Say the true thing, and say it where it cannot be missed.
          <p
            role="alert"
            className="rounded-md border border-warning-300 bg-warning-50 px-3 py-2 text-sm font-medium text-warning-800"
            data-testid="wizard-autosave-error"
          >
            ⚠️ Your progress isn&apos;t being saved. You can keep going, but don&apos;t close this
            tab — finish and submit in this session.
          </p>
        ) : null
      }
    >
      {renderStep({
        steps,
        index: currentStepIndex,
        formData: draft.formData,
        mergeFields: draft.mergeFields,
        onContinue: handleContinue,
        onBack: handleBack,
        onGoToStep: goToStep,
        onSubmit: handleSubmit,
        isSubmitting,
        submitError,
        reviewCompleteness,
        editMode: authenticated,
        ownNin,
      })}
    </WizardLayout>
  );
}

function renderStep(props: {
  steps: WizardStepDef[];
  index: number;
  formData: WizardDraftData;
  mergeFields: (patch: Partial<WizardDraftData>) => void;
  onContinue: () => void;
  onBack: () => void;
  onGoToStep: (stepIndex: number) => void;
  onSubmit: () => Promise<void> | void;
  isSubmitting: boolean;
  submitError: string | null;
  reviewCompleteness: { complete: boolean; missing: string[]; missingStepIndex: number | null };
  editMode: boolean;
  ownNin?: string;
}) {
  const step = props.steps[props.index];
  if (!step) return null;

  switch (step.id) {
    case 'basics':
      return (
        <Step1BasicInfo
          formData={props.formData}
          mergeFields={props.mergeFields}
          onContinue={props.onContinue}
          onBack={props.onBack}
          editMode={props.editMode}
          ownNin={props.ownNin}
        />
      );
    case 'contact':
      return (
        <Step2ContactLga
          formData={props.formData}
          mergeFields={props.mergeFields}
          onContinue={props.onContinue}
          onBack={props.onBack}
        />
      );
    case 'consent':
      return (
        <Step3Consent
          formData={props.formData}
          mergeFields={props.mergeFields}
          onContinue={props.onContinue}
          onBack={props.onBack}
        />
      );
    case 'review':
      return (
        <Step5ReviewAndSave
          formData={props.formData}
          mergeFields={props.mergeFields}
          onGoToStep={props.onGoToStep}
          onSubmit={() => {
            props.onSubmit();
          }}
          onBack={props.onBack}
          isSubmitting={props.isSubmitting}
          submitError={props.submitError}
          incompleteQuestionnaire={!props.reviewCompleteness.complete}
          missingStepIndex={props.reviewCompleteness.missingStepIndex}
        />
      );
    default:
      // Section step (AC#E1) — `key` forces a fresh FormRenderer positioned at
      // this section's first question on every section transition.
      return (
        <Step4Questionnaire
          key={step.id}
          formData={props.formData}
          mergeFields={props.mergeFields}
          onContinue={props.onContinue}
          onBack={props.onBack}
          sectionIndex={step.sectionIndex}
          sectionTitle={step.sectionTitle}
        />
      );
  }
}

function CompletionScreen({
  email,
  referenceCode,
  pendingNin,
}: {
  email: string;
  referenceCode: string;
  pendingNin: boolean;
}) {
  return (
    <div className="space-y-4 text-center" data-testid="wizard-complete">
      {/*
        ⚠️ THE CONFETTI BELONGS HERE, NOT ON RegistrationCompletePage.
        I put it there first and it never fired, because the wizard NEVER NAVIGATES to that route —
        it renders this inline CompletionScreen instead. Third instance today of the same trap: two
        implementations of one concept, and the change landed on the one the traffic does not take
        (FormRenderer vs FormFillerPage for calculated fields; skipLogic callers; now this).
        **Before wiring anything to a "completion screen", check which one the user actually
        reaches.**
      */}
      <CompletionConfetti />
      <div className="text-6xl" aria-hidden="true">
        ✓
      </div>
      <h2 className="text-xl font-semibold text-neutral-900">
        {pendingNin ? 'Saved as pending' : 'Registration complete'}
      </h2>
      <p className="text-sm text-neutral-700">
        {pendingNin ? (
          <>
            We've saved your registration for <span className="font-mono">{email}</span>. Watch your
            email for a one-click link to add your NIN whenever you're ready.
          </>
        ) : (
          <>
            Thank you for joining the Oyo State Skills Registry. We've emailed a one-click link to{' '}
            <span className="font-mono">{email}</span> so you can view, edit, or withdraw your
            registration anytime.
          </>
        )}
      </p>
      {/* Story 9-58 — human-friendly application reference (replaces the raw
          submissions UUID on-screen). Quotable, readable, and accepted by the
          public status check + support search. */}
      <div className="rounded-lg bg-neutral-50 px-4 py-3" data-testid="wizard-complete-id">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Your application reference</p>
        <p
          className="font-mono text-lg font-semibold text-neutral-900 select-all"
          title="Quote this reference if you contact support"
        >
          {referenceCode}
        </p>
      </div>
      <p className="text-xs text-neutral-500">
        Lost this reference later?{' '}
        <Link to="/check-registration" className="text-primary-600 underline">
          Check your status here
        </Link>
        .
      </p>
    </div>
  );
}

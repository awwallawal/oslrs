import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WizardNavigation } from '../components/WizardNavigation';
import { FormRenderer } from '../../forms/components/FormRenderer';
import { fetchPublicActiveForm, type WizardDraftData, type FlattenedForm } from '../api/wizard.api';
import {
  findWizardFieldForQuestionName,
  type WizardProvidedFieldKey,
} from '../lib/wizard-provided-field-names';

/**
 * Story 9-12 AC#1 Step 4 + Task 5.4 — Questionnaire injection (Option B).
 * Story 9-18 Part B (AC#B4/B5/B7) — Pattern C wizard field dedup.
 *
 * Fetches the form pinned by the `wizard.public_form_id` setting via
 * `GET /api/v1/forms/public-active` and mounts it through the decomposed
 * `<FormRenderer>` (Task 5.4.3).
 *
 * Side effects performed on mount once the schema lands:
 *   - Stamp `formHasNinQuestion` into the wizard draft (schema introspection).
 *   - Stamp `questionnaireFormId` + `questionnaireFormVersionId` into the draft
 *     (Task 5.4.5 form-version locking).
 *   - Story 9-18 AC#B4: auto-fill every questionnaire question that asks for a
 *     wizard-collected identity field (name / phone / email / DOB / NIN) from
 *     the value the user already provided, and stamp the list of those question
 *     names into `prefilledQuestionNames` so they can be hidden from the
 *     renderer (AC#B3) and named in the banner (AC#B5).
 *
 * NIN handling: NIN is captured earlier in the wizard (Step 1 after Part A) and
 * never re-asked here — the questionnaire NIN question is auto-filled + hidden
 * via the same Pattern C path as every other identity field. The old inline
 * "I don't have my NIN now" link is therefore NOT wired in the wizard context
 * (AC#B7: `onPendingNinClick` is left undefined); it remains for the
 * clerk-data-entry / form-filler contexts where NIN IS asked directly.
 *
 * Empty-state: when `/forms/public-active` returns 404
 * (PUBLIC_FORM_NOT_CONFIGURED), the step renders a "Survey not yet available"
 * message and exposes a Skip button that calls `onContinue` directly.
 */

export interface Step4Props {
  formData: WizardDraftData;
  mergeFields: (patch: Partial<WizardDraftData>) => void;
  onContinue: () => void;
  onBack?: () => void;
}

/** wizard field key -> the `WizardDraftData` field that holds its value. */
const WIZARD_KEY_TO_FORMDATA_FIELD: Record<WizardProvidedFieldKey, string> = {
  fullName: 'fullName',
  givenName: 'givenName',
  familyName: 'familyName',
  phone: 'phone',
  email: 'email',
  dob: 'dateOfBirth',
  nin: 'nin',
};

/** Human-readable banner label per wizard field key (AC#B5). */
const BANNER_LABELS: Record<WizardProvidedFieldKey, string> = {
  fullName: 'Name',
  givenName: 'Name',
  familyName: 'Name',
  phone: 'Phone',
  email: 'Email',
  dob: 'Date of Birth',
  nin: 'NIN',
};

/** Stable banner display order; Name collapses to a single entry. */
const BANNER_ORDER: WizardProvidedFieldKey[] = [
  'fullName',
  'givenName',
  'familyName',
  'phone',
  'email',
  'dob',
  'nin',
];

interface PrefillResult {
  /** Question names to hide from the renderer (auto-filled OR pending-NIN). */
  hideNames: Set<string>;
  /** Question name -> wizard value to auto-fill into questionnaireResponses. */
  prefillValues: Record<string, unknown>;
  /** Wizard field keys that contributed a value (drives the banner). */
  prefilledKeys: Set<WizardProvidedFieldKey>;
}

/**
 * AC#B4 — introspect the form schema against the wizard's collected identity
 * fields. A question is a "prefill" when its name matches a wizard field alias
 * AND the wizard holds a non-empty value for that field. The pending-NIN edge
 * case hides the NIN question without a value (no NIN to write yet).
 */
function computePrefill(form: FlattenedForm | null, formData: WizardDraftData): PrefillResult {
  const hideNames = new Set<string>();
  const prefillValues: Record<string, unknown> = {};
  const prefilledKeys = new Set<WizardProvidedFieldKey>();
  if (!form) return { hideNames, prefillValues, prefilledKeys };

  const fdRecord = formData as Record<string, unknown>;
  for (const q of form.questions) {
    const key = findWizardFieldForQuestionName(q.name);
    if (!key) continue;

    // Pending-NIN edge case (AC#B4): hide the NIN question but do NOT auto-fill
    // — there is no NIN value. Banner omits NIN (not added to prefilledKeys).
    if (key === 'nin' && formData.pendingNinToggle === true) {
      hideNames.add(q.name);
      continue;
    }

    const value = fdRecord[WIZARD_KEY_TO_FORMDATA_FIELD[key]];
    if (value === undefined || value === null || value === '') continue;

    hideNames.add(q.name);
    prefillValues[q.name] = value;
    prefilledKeys.add(key);
  }

  return { hideNames, prefillValues, prefilledKeys };
}

/** AC#B5 — Oxford-comma join: [], "A", "A and B", "A, B, and C". */
function joinLabels(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function buildBannerCopy(prefilledKeys: Set<WizardProvidedFieldKey>): string {
  const labels: string[] = [];
  for (const key of BANNER_ORDER) {
    if (!prefilledKeys.has(key)) continue;
    const label = BANNER_LABELS[key];
    if (!labels.includes(label)) labels.push(label); // collapse Name x3 -> one
  }
  return `We've pre-filled ${joinLabels(labels)} from your earlier answers. Click Back to edit anything.`;
}

export function Step4Questionnaire({
  formData,
  mergeFields,
  onContinue,
  onBack,
}: Step4Props) {
  const formQuery = useQuery({
    queryKey: ['wizard', 'public-active-form'],
    queryFn: fetchPublicActiveForm,
    staleTime: 5 * 60 * 1000,
  });

  const navApi = useRef<{ goNext: () => Promise<boolean>; goBack: () => void } | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const form = formQuery.data ?? null;

  // Identity signature: recompute the prefill only when an identity value (not a
  // questionnaire answer) changes, so the hide-set passed to FormRenderer keeps a
  // stable identity across question-to-question navigation.
  const fdRecord = formData as Record<string, unknown>;
  // AI-Review M2: derive the signature from WIZARD_KEY_TO_FORMDATA_FIELD (which
  // TypeScript forces to hold every wizard-field key) instead of a third
  // hand-maintained field list. Adding a wizard field now extends the signature
  // automatically — no silently-stale prefill when someone forgets this array.
  const identitySig = JSON.stringify([
    ...Object.values(WIZARD_KEY_TO_FORMDATA_FIELD).map((field) => fdRecord[field]),
    formData.pendingNinToggle,
  ]);
  const prefill = useMemo(
    () => computePrefill(form, formData),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identitySig captures the only inputs computePrefill reads
    [form, identitySig],
  );

  // Schema introspection + auto-fill (Task 4.6 + Story 9-18 AC#B4). Idempotent:
  // writes only when the merged responses, the hidden-name list, or the form
  // version actually change — so it re-syncs if an identity value is edited but
  // never loops against the per-answer mergeFields from FormRenderer.
  const stampedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!form) return;
    const stampKey = `${form.formId}@${form.version}`;
    const existing = formData.questionnaireResponses ?? {};
    // AI-Review H1: purge stale auto-fills. Every wizard-field question name is
    // owned by this effect (hidden + auto-filled; the user can never reach it),
    // so any name we previously stamped that no longer carries a current prefill
    // value must be removed. Without this, a NIN auto-filled while the toggle was
    // off would survive in questionnaireResponses after the user switched to
    // pending-NIN — and get submitted.
    const merged: Record<string, unknown> = { ...existing };
    for (const name of formData.prefilledQuestionNames ?? []) {
      if (!(name in prefill.prefillValues)) delete merged[name];
    }
    Object.assign(merged, prefill.prefillValues);
    const namesArr = [...prefill.hideNames];

    const responsesChanged = JSON.stringify(merged) !== JSON.stringify(existing);
    const namesChanged =
      JSON.stringify(namesArr) !== JSON.stringify(formData.prefilledQuestionNames ?? []);
    const versionChanged = stampedRef.current !== stampKey;
    if (!responsesChanged && !namesChanged && !versionChanged) return;

    stampedRef.current = stampKey;
    const formHasNinQuestion = form.questions.some(
      (q) => findWizardFieldForQuestionName(q.name) === 'nin',
    );
    mergeFields({
      formHasNinQuestion,
      questionnaireFormId: form.formId,
      questionnaireFormVersionId: form.version,
      prefilledQuestionNames: namesArr,
      questionnaireResponses: merged,
    });
  }, [form, formData, prefill, mergeFields]);

  const initialResponses = useMemo(
    () => formData.questionnaireResponses ?? {},
    [formData.questionnaireResponses],
  );

  if (formQuery.isLoading) {
    return (
      <div className="space-y-4" data-testid="step4-loading">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">Questionnaire</h2>
          <p className="text-sm text-neutral-600">Loading the survey…</p>
        </header>
        <div className="h-32 animate-pulse rounded-lg bg-neutral-100" aria-hidden="true" />
        <WizardNavigation onBack={onBack} onContinue={onContinue} isContinueDisabled />
      </div>
    );
  }

  // Empty-state: no public form configured (404) OR no form returned.
  if (!form) {
    return (
      <div className="space-y-4" data-testid="step4-empty">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">Survey not yet available</h2>
          <p className="mt-1 text-sm text-neutral-600">
            We don't have a questionnaire set up at the moment. Your registration will save without
            survey responses. You can come back later to complete it.
          </p>
        </header>
        <WizardNavigation
          onBack={onBack}
          onContinue={onContinue}
          continueLabel="Skip to NIN step"
        />
      </div>
    );
  }

  function handleAnswer(_questionName: string, _value: unknown, allAnswers: Record<string, unknown>) {
    mergeFields({ questionnaireResponses: allAnswers });
  }

  function handleComplete(allAnswers: Record<string, unknown>) {
    mergeFields({ questionnaireResponses: allAnswers });
    onContinue();
  }

  async function handleContinueClick() {
    if (!navApi.current) return;
    setIsAdvancing(true);
    try {
      await navApi.current.goNext();
    } finally {
      setIsAdvancing(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="step4-questionnaire">
      <header>
        <h2 className="text-xl font-semibold text-neutral-900">{form.title}</h2>
        <p className="mt-1 text-sm text-neutral-600">
          One question at a time. We auto-save as you go, so you can come back later if you need to.
        </p>
      </header>

      {prefill.prefilledKeys.size > 0 && (
        <aside
          role="status"
          aria-live="polite"
          data-testid="step4-prefilled-banner"
          className="rounded-md border-l-4 border-info-600 bg-info-50 p-3 text-sm text-info-800"
        >
          {buildBannerCopy(prefill.prefilledKeys)}
        </aside>
      )}

      <FormRenderer
        formSchema={form}
        initialResponses={initialResponses}
        onAnswer={handleAnswer}
        onComplete={handleComplete}
        // AC#B7: the inline pending-NIN link is NOT wired in the wizard context
        // (NIN is captured at Step 1 and never re-asked here).
        onPendingNinClick={undefined}
        hideQuestionNames={prefill.hideNames}
        hideNavigation
        onNavReady={(api) => {
          navApi.current = api;
        }}
      />

      <WizardNavigation
        onBack={onBack}
        onContinue={handleContinueClick}
        isSubmitting={isAdvancing}
      />
    </div>
  );
}

import { Step5NinCaptured } from './Step5NinCaptured';
import { Step5PendingNin } from './Step5PendingNin';
import { Step5NinInput } from './Step5NinInput';
import { NIN_QUESTION_NAMES } from '../lib/nin-question-names';
import type { WizardDraftData } from '../api/wizard.api';

/**
 * Story 9-12 Dev Notes — Step 5 state-aware dispatcher.
 *
 * Three states derived from `formData`:
 *   - A — questionnaire collected a valid NIN: show confirmation + auth choices.
 *   - B — user clicked the inline "I don't have my NIN now" link in Step 4:
 *         show pending-NIN consequence preview + auth choices.
 *   - C — form had no NIN question at all: fall back to the original AC#1/#4
 *         spec — NIN input + NinHelpHint inline + PendingNinToggle + auth.
 *
 * State derivation is intentionally synchronous (no async work) — the wizard
 * draft is the single source of truth.
 */

export interface Step5Props {
  formData: WizardDraftData;
  mergeFields: (patch: Partial<WizardDraftData>) => void;
  onSubmit: () => void;
  onBack?: () => void;
  isSubmitting?: boolean;
  submitError?: string | null;
}

export type Step5State = 'A' | 'B' | 'C';

export function deriveStep5State(formData: WizardDraftData): Step5State {
  const formHasNin = formData.formHasNinQuestion ?? false;
  const pending = formData.pendingNinToggle === true;
  const questionnaireNin = readQuestionnaireNin(formData.questionnaireResponses);

  if (formHasNin) {
    if (pending) return 'B';
    if (questionnaireNin) return 'A';
    // Form has a NIN question but neither was answered nor pending-toggled —
    // shouldn't happen if Step 4 validation is sound, but fall through to C
    // so the user has a recovery surface (wizard owns NIN input).
    return 'C';
  }
  // Form does not have a NIN question — wizard owns NIN input.
  return 'C';
}

function readQuestionnaireNin(
  responses: Record<string, unknown> | undefined,
): string | null {
  if (!responses) return null;
  for (const key of NIN_QUESTION_NAMES) {
    const value = responses[key];
    if (typeof value === 'string' && /^\d{11}$/.test(value)) {
      return value;
    }
  }
  return null;
}

export function Step5NinAndAuth({
  formData,
  mergeFields,
  onSubmit,
  onBack,
  isSubmitting,
  submitError,
}: Step5Props) {
  const state = deriveStep5State(formData);
  const authChoice = formData.authChoice ?? 'magic-link';
  const onAuthChoiceChange = (choice: 'magic-link' | 'password' | 'skip') =>
    mergeFields({ authChoice: choice });

  if (state === 'A') {
    const nin = readQuestionnaireNin(formData.questionnaireResponses) ?? '';
    return (
      <Step5NinCaptured
        formData={formData}
        ninFromQuestionnaire={nin}
        authChoice={authChoice}
        onAuthChoiceChange={onAuthChoiceChange}
        onSubmit={onSubmit}
        onBack={onBack}
        isSubmitting={isSubmitting}
        submitError={submitError}
      />
    );
  }

  if (state === 'B') {
    return (
      <Step5PendingNin
        authChoice={authChoice}
        onAuthChoiceChange={onAuthChoiceChange}
        onSubmit={onSubmit}
        onBack={onBack}
        isSubmitting={isSubmitting}
        submitError={submitError}
      />
    );
  }

  // State C — wizard owns NIN input.
  return (
    <Step5NinInput
      formData={formData}
      ninValue={formData.nin ?? ''}
      pendingToggle={formData.pendingNinToggle === true}
      onNinChange={(nin) => mergeFields({ nin })}
      onPendingToggleChange={(pressed) =>
        mergeFields({
          pendingNinToggle: pressed,
          // Clear stored NIN when toggling ON so the wizard doesn't accidentally
          // ship a stale value, but RETAIN it in formData.nin (caller can read
          // back if user toggles OFF). State C contract preserves the value.
        })
      }
      authChoice={authChoice}
      onAuthChoiceChange={onAuthChoiceChange}
      onSubmit={onSubmit}
      onBack={onBack}
      isSubmitting={isSubmitting}
      submitError={submitError}
    />
  );
}

// @vitest-environment jsdom

/**
 * Story 13-29 (AC2) — wizard-level regression for the calculated-field section
 * reactivity fix (the Dry-run #2 "go back and fill survey" two-pass loop).
 *
 * The unit tests in `lib/__tests__/section-relevance.test.ts` pin the pure
 * skippability logic; THIS test guards the end-to-end WIRING that actually broke
 * in production: an answer that feeds a calculated gate must reach the wizard
 * draft (via `mergeFields`) and cause the very next section's auto-skip decision
 * to re-evaluate — in the SAME forward pass, with no bounce-back at Review.
 *
 * Faithful to the real flow, `dob` is flushed to the draft on a SEPARATE event
 * (mirroring FormRenderer's per-answer `onAnswer`) BEFORE Continue is clicked
 * (mirroring `handleComplete`), so the closure timing matches production.
 *
 * Head steps (Step1-3) + Review are stubbed; the real WizardLayout drives the
 * dynamic step list. Step4 is a section-aware probe that can flush an adult/child
 * `dob` into the draft and then advance.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WizardDraftData } from '../../api/wizard.api';

expect.extend(matchers);
afterEach(cleanup);

const { mockFetchWizardDraft, mockFetchPublicActiveForm } = vi.hoisted(() => ({
  mockFetchWizardDraft: vi.fn(),
  mockFetchPublicActiveForm: vi.fn(),
}));

vi.mock('../../api/wizard.api', () => ({
  submitWizard: vi.fn(),
  requestMagicLink: vi.fn(),
  saveWizardDraft: vi.fn(),
  fetchWizardDraft: mockFetchWizardDraft,
  fetchPublicLgas: vi.fn().mockResolvedValue([]),
  fetchPublicActiveForm: mockFetchPublicActiveForm,
  derivePendingNin: (fd: { pendingNinToggle?: boolean; nin?: string }) =>
    fd.pendingNinToggle === true || !fd.nin,
}));

vi.mock('../Step1BasicInfo', () => ({
  Step1BasicInfo: ({ onContinue }: { onContinue: () => void }) => (
    <button data-testid="Step1BasicInfo-continue" onClick={onContinue}>Continue</button>
  ),
}));
vi.mock('../Step2ContactLga', () => ({
  Step2ContactLga: ({ onContinue }: { onContinue: () => void }) => (
    <button data-testid="Step2ContactLga-continue" onClick={onContinue}>Continue</button>
  ),
}));
vi.mock('../Step3Consent', () => ({
  Step3Consent: ({ onContinue }: { onContinue: () => void }) => (
    <button data-testid="Step3Consent-continue" onClick={onContinue}>Continue</button>
  ),
}));
vi.mock('../Step5ReviewAndSave', () => ({
  Step5ReviewAndSave: () => <div data-testid="review-stub">Review</div>,
}));

// Section-aware Step4 probe. `set-dob-*` flushes an adult/child birth date into
// `questionnaireResponses` on its OWN click (mirrors FormRenderer.onAnswer);
// `section-continue` advances (mirrors handleComplete → wizard onContinue).
vi.mock('../Step4Questionnaire', () => ({
  Step4Questionnaire: ({
    sectionTitle,
    formData,
    mergeFields,
    onContinue,
  }: {
    sectionTitle?: string;
    formData: WizardDraftData;
    mergeFields: (patch: Partial<WizardDraftData>) => void;
    onContinue: () => void;
  }) => (
    <div data-testid="section-stub" data-section={sectionTitle}>
      <button
        data-testid="set-dob-adult"
        onClick={() =>
          mergeFields({
            questionnaireResponses: { ...(formData.questionnaireResponses ?? {}), dob: '1990-05-01' },
          })
        }
      >
        set adult dob
      </button>
      <button
        data-testid="set-dob-child"
        onClick={() =>
          mergeFields({
            questionnaireResponses: { ...(formData.questionnaireResponses ?? {}), dob: '2015-05-01' },
          })
        }
      >
        set child dob
      </button>
      <button data-testid="section-continue" onClick={onContinue}>Continue</button>
    </div>
  ),
}));

import WizardPage from '../WizardPage';

// grp_demo holds dob (ungated); grp_labor is gated on the CALCULATED age (${age} >= 15).
const CALC_GATED_FORM = {
  formId: 'f-labor',
  title: 'Public Core',
  version: '1.0.0',
  questions: [
    { id: 'q-dob', type: 'date', name: 'dob', label: 'Date of birth', required: true, sectionId: 'grp_demo', sectionTitle: 'About you' },
    { id: 'q-occ', type: 'text', name: 'main_occupation', label: 'Main occupation', required: true, sectionId: 'grp_labor', sectionTitle: 'Your work' },
  ],
  choiceLists: {},
  sectionShowWhen: {
    grp_labor: { field: 'age', operator: 'greater_or_equal', value: 15 },
  },
  calculations: [{ name: 'age', expression: 'int((today() - ${dob}) div 365.25)' }],
};

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<WizardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function advanceToFirstSection() {
  await userEvent.click(await screen.findByTestId('Step1BasicInfo-continue'));
  await userEvent.click(await screen.findByTestId('Step2ContactLga-continue'));
  await userEvent.click(await screen.findByTestId('Step3Consent-continue'));
  const section = await screen.findByTestId('section-stub');
  expect(section).toHaveAttribute('data-section', 'About you'); // grp_demo, not skipped
  return section;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchWizardDraft.mockResolvedValue(null);
  mockFetchPublicActiveForm.mockResolvedValue(CALC_GATED_FORM);
});

describe('WizardPage — calc-gated section reactivity (Story 13-29 AC2/AC4)', () => {
  it('adult: answering dob makes grp_labor appear in the SAME forward pass (no bounce to Review)', async () => {
    renderWizard();
    await advanceToFirstSection();

    // dob answered (adult) → flushed to the draft — a separate event from Continue.
    await userEvent.click(screen.getByTestId('set-dob-adult'));
    // Continue from grp_demo: the calc-gated grp_labor must NOT be auto-skipped.
    await userEvent.click(screen.getByTestId('section-continue'));

    await waitFor(() =>
      expect(screen.getByTestId('section-stub')).toHaveAttribute('data-section', 'Your work'),
    );
    // Crucially: we did NOT skip straight to Review (the pre-fix loop).
    expect(screen.queryByTestId('review-stub')).not.toBeInTheDocument();
  });

  it('under-15: grp_labor is still legitimately skipped, landing on Review (AC4)', async () => {
    renderWizard();
    await advanceToFirstSection();

    await userEvent.click(screen.getByTestId('set-dob-child'));
    await userEvent.click(screen.getByTestId('section-continue'));

    // age < 15 → grp_labor hidden → skipped → straight to Review, no occupation ask.
    expect(await screen.findByTestId('review-stub')).toBeInTheDocument();
  });
});

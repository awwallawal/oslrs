// @vitest-environment jsdom

/**
 * Story 9-18 Part E — section-as-step integration. Verifies WizardPage derives
 * one step per form section (E1/E3), shows the section title (E6), and
 * auto-skips a section whose questions are all hidden by showWhen (E5).
 *
 * Head steps (Step1-3) + Review are stubbed; the real WizardLayout +
 * WizardStepIndicator render so we can assert the dynamic step count. Step4 is
 * stubbed as a section-aware probe (exposes its sectionTitle + a Continue).
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
    <div data-testid="Step1BasicInfo-stub">
      <button data-testid="Step1BasicInfo-continue" onClick={onContinue}>Continue</button>
    </div>
  ),
}));
vi.mock('../Step2ContactLga', () => ({
  Step2ContactLga: ({ onContinue }: { onContinue: () => void }) => (
    <div data-testid="Step2ContactLga-stub">
      <button data-testid="Step2ContactLga-continue" onClick={onContinue}>Continue</button>
    </div>
  ),
}));
vi.mock('../Step3Consent', () => ({
  Step3Consent: ({ onContinue }: { onContinue: () => void }) => (
    <div data-testid="Step3Consent-stub">
      <button data-testid="Step3Consent-continue" onClick={onContinue}>Continue</button>
    </div>
  ),
}));
vi.mock('../Step5ReviewAndSave', () => ({
  Step5ReviewAndSave: () => <div data-testid="review-stub">Review</div>,
}));
// Section-aware Step4 probe.
vi.mock('../Step4Questionnaire', () => ({
  Step4Questionnaire: ({ sectionTitle, onContinue }: { sectionTitle?: string; onContinue: () => void }) => (
    <div data-testid="section-stub" data-section={sectionTitle}>
      <button data-testid="section-continue" onClick={onContinue}>
        Continue
      </button>
    </div>
  ),
}));

import WizardPage from '../WizardPage';

// Section A always-visible; Section B gated off (showWhen never true) → empty → skipped.
const TWO_SECTION_FORM = {
  formId: 'f1',
  title: 'Survey',
  version: '1.0.0',
  questions: [
    { id: 'qa', type: 'text', name: 'alpha_q', label: 'Alpha Q', required: false, sectionId: 'sA', sectionTitle: 'Alpha' },
    {
      id: 'qb',
      type: 'text',
      name: 'beta_q',
      label: 'Beta Q',
      required: false,
      sectionId: 'sB',
      sectionTitle: 'Beta',
      showWhen: { field: 'gate', operator: 'equals', value: 'yes' },
    },
  ],
  choiceLists: {},
  sectionShowWhen: {},
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

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchWizardDraft.mockResolvedValue(null);
  mockFetchPublicActiveForm.mockResolvedValue(TWO_SECTION_FORM);
});

describe('WizardPage section-as-step (Story 9-18 Part E)', () => {
  it('builds one step per section (E1/E3) and renders the section title (E6)', async () => {
    renderWizard();
    await screen.findByTestId('Step1BasicInfo-stub');

    await userEvent.click(screen.getByTestId('Step1BasicInfo-continue'));
    await userEvent.click(await screen.findByTestId('Step2ContactLga-continue'));
    await userEvent.click(await screen.findByTestId('Step3Consent-continue'));

    // Now on the first section step (Alpha) — step 4 of 6.
    const section = await screen.findByTestId('section-stub');
    expect(section).toHaveAttribute('data-section', 'Alpha');
    expect(screen.getByText(/Step 4 of 6/)).toBeInTheDocument();
  });

  it('greys the empty (showWhen-gated) Beta section in the indicator (E5)', async () => {
    renderWizard();
    await screen.findByTestId('Step1BasicInfo-stub');
    await userEvent.click(screen.getByTestId('Step1BasicInfo-continue'));
    await userEvent.click(await screen.findByTestId('Step2ContactLga-continue'));
    await userEvent.click(await screen.findByTestId('Step3Consent-continue'));
    await screen.findByTestId('section-stub');

    // Section B (index 4) has no visible questions → marked skipped.
    expect(screen.getByTestId('wizard-step-4')).toHaveAttribute('data-skipped', 'true');
  });

  it('auto-skips the empty Beta section on Continue, landing on Review (E5)', async () => {
    renderWizard();
    await screen.findByTestId('Step1BasicInfo-stub');
    await userEvent.click(screen.getByTestId('Step1BasicInfo-continue'));
    await userEvent.click(await screen.findByTestId('Step2ContactLga-continue'));
    await userEvent.click(await screen.findByTestId('Step3Consent-continue'));
    await screen.findByTestId('section-stub'); // Alpha

    // Continue from Alpha → Beta is empty → skipped → Review.
    await userEvent.click(screen.getByTestId('section-continue'));
    expect(await screen.findByTestId('review-stub')).toBeInTheDocument();
  });

  it('surfaces a retry on form-load failure instead of silently dropping the survey (AI-Review M1)', async () => {
    mockFetchPublicActiveForm.mockReset();
    mockFetchPublicActiveForm.mockRejectedValue(new Error('network down'));
    renderWizard();

    expect(await screen.findByTestId('wizard-form-error')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-form-error-retry')).toBeInTheDocument();
    // Critically: the user is NOT silently dropped into a survey-less wizard.
    expect(screen.queryByTestId('Step1BasicInfo-stub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-stub')).not.toBeInTheDocument();
  });

  it('recovers and renders the wizard when Retry succeeds (AI-Review M1)', async () => {
    mockFetchPublicActiveForm.mockReset();
    mockFetchPublicActiveForm
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(TWO_SECTION_FORM);
    renderWizard();

    await userEvent.click(await screen.findByTestId('wizard-form-error-retry'));
    expect(await screen.findByTestId('Step1BasicInfo-stub')).toBeInTheDocument();
  });
});

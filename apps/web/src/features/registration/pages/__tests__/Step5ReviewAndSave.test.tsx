// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Step5ReviewAndSave } from '../Step5ReviewAndSave';
import { fetchPublicLgas, type WizardDraftData } from '../../api/wizard.api';

expect.extend(matchers);
afterEach(cleanup);

vi.mock('../../api/wizard.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/wizard.api')>();
  return { ...actual, fetchPublicLgas: vi.fn() };
});
const mockedLgas = vi.mocked(fetchPublicLgas);

function fullState(overrides: Partial<WizardDraftData> = {}): WizardDraftData {
  return {
    givenName: 'Kayode',
    familyName: 'Olowu',
    dateOfBirth: '1990-01-01',
    gender: 'male',
    nin: '12345678919',
    phone: '+2348012345678',
    email: 'kayode@example.com',
    lgaId: 'lga-egbeda',
    consentMarketplace: true,
    consentEnriched: false,
    ...overrides,
  };
}

function renderStep5(formData: WizardDraftData, mergeFields = vi.fn()) {
  const onGoToStep = vi.fn();
  const onSubmit = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Step5ReviewAndSave formData={formData} mergeFields={mergeFields} onGoToStep={onGoToStep} onSubmit={onSubmit} onBack={vi.fn()} />
    </QueryClientProvider>,
  );
  return { onGoToStep, onSubmit, mergeFields };
}

describe('Step5ReviewAndSave (Story 9-18 Part C AC#C1/D2)', () => {
  beforeEach(() => {
    mockedLgas.mockReset();
    // Story 13-16 — formData.lgaId now holds the SLUG (lga.code); id is the row UUID.
    mockedLgas.mockResolvedValue([
      { id: '018e5f2a-1234-7890-abcd-1234567890ab', name: 'Egbeda', code: 'lga-egbeda' },
    ]);
  });

  it('lists every summary field', async () => {
    renderStep5(fullState());
    expect(screen.getByTestId('step5-name')).toHaveTextContent('Kayode Olowu');
    expect(screen.getByTestId('step5-dob')).toHaveTextContent('1990-01-01');
    expect(screen.getByTestId('step5-gender')).toHaveTextContent('Male');
    expect(screen.getByTestId('step5-nin')).toHaveTextContent('12345-67891-9');
    expect(screen.getByTestId('step5-phone')).toHaveTextContent('+2348012345678');
    expect(screen.getByTestId('step5-email')).toHaveTextContent('kayode@example.com');
    expect(screen.getByTestId('step5-consent-marketplace')).toHaveTextContent('Allowed');
    expect(screen.getByTestId('step5-consent-enriched')).toHaveTextContent('Declined');
    // LGA name resolves from the public LGA query.
    expect(await screen.findByText('Egbeda')).toBeInTheDocument();
  });

  it('shows the formatted NIN when present', () => {
    renderStep5(fullState());
    expect(screen.getByTestId('step5-nin')).toHaveTextContent('12345-67891-9');
    expect(screen.queryByTestId('step5-nin-pending')).not.toBeInTheDocument();
  });

  it('shows a Pending badge instead of the NIN when pending-NIN is on', () => {
    renderStep5(fullState({ nin: '', pendingNinToggle: true }));
    expect(screen.getByTestId('step5-nin-pending')).toBeInTheDocument();
    expect(screen.getByTestId('step5-nin')).toHaveTextContent(/Pending/);
  });

  it('labels the Save button "Save Registration" by default', () => {
    renderStep5(fullState());
    expect(screen.getByTestId('wizard-save-button')).toHaveTextContent('Save Registration');
  });

  it('labels the Save button "Save as Pending" when pending-NIN is on', () => {
    renderStep5(fullState({ nin: '', pendingNinToggle: true }));
    expect(screen.getByTestId('wizard-save-button')).toHaveTextContent('Save as Pending');
  });

  it('Edit links jump to the owning step', () => {
    const { onGoToStep } = renderStep5(fullState());
    fireEvent.click(screen.getByTestId('step5-name-edit'));
    expect(onGoToStep).toHaveBeenCalledWith(0); // identity
    fireEvent.click(screen.getByTestId('step5-phone-edit'));
    expect(onGoToStep).toHaveBeenCalledWith(1); // contact
    fireEvent.click(screen.getByTestId('step5-consent-marketplace-edit'));
    expect(onGoToStep).toHaveBeenCalledWith(2); // consent
  });

  it('invokes onSubmit when Save is clicked', () => {
    const { onSubmit } = renderStep5(fullState());
    fireEvent.click(screen.getByTestId('wizard-save-button'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('renders no auth-choice control (auth-choice retired per AC#C3)', () => {
    renderStep5(fullState());
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('treats an empty NIN with no toggle as pending — label/badge match the submit (AI-Review M1)', () => {
    // A resumed pre-9-18 draft can have no NIN and no pendingNinToggle; the
    // submit derives pending via `!nin`, so the badge + label must agree.
    renderStep5(fullState({ nin: '', pendingNinToggle: undefined }));
    expect(screen.getByTestId('step5-nin-pending')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-save-button')).toHaveTextContent('Save as Pending');
  });

  it('renders a mononym (given name only) without a trailing space', () => {
    renderStep5(fullState({ familyName: '' }));
    expect(screen.getByTestId('step5-name')).toHaveTextContent('Kayode');
  });
});

describe('Step5ReviewAndSave incomplete-questionnaire guard (Story 9-54 AC6.2)', () => {
  beforeEach(() => {
    mockedLgas.mockReset();
    // Story 13-16 — slug-first lookup parity with the main describe block.
    mockedLgas.mockResolvedValue([
      { id: '018e5f2a-1234-7890-abcd-1234567890ab', name: 'Egbeda', code: 'lga-egbeda' },
    ]);
  });

  function renderGuarded(incomplete: boolean, missingStepIndex: number | null) {
    const onGoToStep = vi.fn();
    const onSubmit = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Step5ReviewAndSave
          formData={fullState()}
          mergeFields={vi.fn()}
          onGoToStep={onGoToStep}
          onSubmit={onSubmit}
          onBack={vi.fn()}
          incompleteQuestionnaire={incomplete}
          missingStepIndex={missingStepIndex}
        />
      </QueryClientProvider>,
    );
    return { onGoToStep, onSubmit };
  }

  it('disables Save and shows the notice when the questionnaire is incomplete', () => {
    const { onSubmit } = renderGuarded(true, 3);
    expect(screen.getByTestId('step5-incomplete-notice')).toBeInTheDocument();
    const save = screen.getByTestId('wizard-save-button');
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('jumps back to the offending step via the notice link', () => {
    const { onGoToStep } = renderGuarded(true, 3);
    fireEvent.click(screen.getByTestId('step5-incomplete-goto'));
    expect(onGoToStep).toHaveBeenCalledWith(3);
  });

  it('enables Save and hides the notice when complete', () => {
    const { onSubmit } = renderGuarded(false, null);
    expect(screen.queryByTestId('step5-incomplete-notice')).not.toBeInTheDocument();
    const save = screen.getByTestId('wizard-save-button');
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe('Step5ReviewAndSave — campaign attribution question (Story 13-1 AC2)', () => {
  it('renders the optional "How did you hear about us?" select', () => {
    renderStep5(fullState());
    expect(screen.getByTestId('attribution-channel-select')).toBeInTheDocument();
    expect(screen.getByText(/how did you hear about us/i)).toBeInTheDocument();
  });

  it('writes the chosen channel into extras.acquisition via mergeFields', () => {
    const { mergeFields } = renderStep5(fullState());
    fireEvent.change(screen.getByTestId('attribution-channel-select'), { target: { value: 'Radio' } });
    expect(mergeFields).toHaveBeenCalledWith(
      expect.objectContaining({ extras: expect.objectContaining({ acquisition: { channel: 'Radio' } }) }),
    );
  });

  it('NEVER blocks submit — Save stays enabled regardless of the answer (AC2.2)', () => {
    renderStep5(fullState());
    expect(screen.getByTestId('wizard-save-button')).not.toBeDisabled();
  });
});

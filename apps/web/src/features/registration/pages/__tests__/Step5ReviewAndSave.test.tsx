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

function renderStep5(formData: WizardDraftData) {
  const onGoToStep = vi.fn();
  const onSubmit = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Step5ReviewAndSave formData={formData} onGoToStep={onGoToStep} onSubmit={onSubmit} onBack={vi.fn()} />
    </QueryClientProvider>,
  );
  return { onGoToStep, onSubmit };
}

describe('Step5ReviewAndSave (Story 9-18 Part C AC#C1/D2)', () => {
  beforeEach(() => {
    mockedLgas.mockReset();
    mockedLgas.mockResolvedValue([{ id: 'lga-egbeda', name: 'Egbeda', code: 'EGB' }]);
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

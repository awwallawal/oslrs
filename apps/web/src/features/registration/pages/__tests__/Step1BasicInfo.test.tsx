// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Step1BasicInfo } from '../Step1BasicInfo';
import type { WizardDraftData } from '../../api/wizard.api';

expect.extend(matchers);
afterEach(cleanup);

vi.mock('../../../forms/api/nin-check.api', () => ({
  checkNinAvailability: vi.fn().mockResolvedValue({ available: true }),
}));
import { checkNinAvailability } from '../../../forms/api/nin-check.api';
const mockedCheckNin = vi.mocked(checkNinAvailability);

/**
 * Story 9-18 Part A (AC#D1) + Part F (AC#F6) — Step 1 NIN-first + name split.
 */

const VALID_NIN = '12345678919'; // passes Modulus 11
const INVALID_NIN = '12345678910'; // 11 digits, wrong check digit

// A fully-valid Step-1 state minus whatever a test wants to omit/override.
function validState(overrides: Partial<WizardDraftData> = {}): WizardDraftData {
  return {
    nin: VALID_NIN,
    givenName: 'Kayode',
    familyName: 'Olowu',
    dateOfBirth: '1990-01-01',
    gender: 'male',
    ...overrides,
  };
}

function renderStep(formData: WizardDraftData = {}) {
  const mergeFields = vi.fn();
  const onContinue = vi.fn();
  const onBack = vi.fn();
  render(
    <Step1BasicInfo
      formData={formData}
      mergeFields={mergeFields}
      onContinue={onContinue}
      onBack={onBack}
    />,
  );
  return { mergeFields, onContinue, onBack };
}

describe('Step1BasicInfo (9-18 Part A + F)', () => {
  it('renders NIN, given name, family name, DOB and gender fields', () => {
    renderStep();
    expect(screen.getByTestId('wizard-step1-nin-input')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-step1-given-name')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-step1-family-name')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-dob')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-gender-group')).toBeInTheDocument();
  });

  it('disables Continue and shows a validation summary when the step is empty', () => {
    renderStep();
    expect(screen.getByTestId('wizard-nav-continue')).toBeDisabled();
    expect(screen.getByTestId('step1-validation-summary')).toBeInTheDocument();
  });

  it('enables Continue once NIN is checksum-valid and all fields are filled', () => {
    renderStep(validState());
    expect(screen.getByTestId('wizard-nav-continue')).not.toBeDisabled();
    expect(screen.queryByTestId('step1-validation-summary')).not.toBeInTheDocument();
  });

  it('shows the Modulus-11 failure and keeps Continue disabled for an invalid NIN', () => {
    renderStep(validState({ nin: INVALID_NIN }));
    expect(screen.getByTestId('wizard-step1-nin-invalid')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-nav-continue')).toBeDisabled();
  });

  it('disables the NIN input, shows the consequence card and allows Continue when pending-NIN is on', () => {
    renderStep(validState({ nin: '', pendingNinToggle: true }));
    expect(screen.getByTestId('wizard-step1-nin-input')).toBeDisabled();
    expect(screen.getByTestId('pending-nin-consequence')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-nav-continue')).not.toBeDisabled();
  });

  it('flips pending-NIN on when the NinHelpHint inline link is clicked', () => {
    const { mergeFields } = renderStep(validState({ nin: '' }));
    fireEvent.click(screen.getByTestId('nin-help-hint-pending-link'));
    expect(mergeFields).toHaveBeenCalledWith({ pendingNinToggle: true });
  });

  it('renders the duplicate-NIN block and keeps Continue disabled', async () => {
    mockedCheckNin.mockResolvedValueOnce({
      available: false,
      reason: 'respondent',
      registeredAt: '2026-05-01T00:00:00Z',
    });
    renderStep(validState());
    // Debounced (~500ms) check → duplicate block appears.
    expect(await screen.findByTestId('wizard-step1-nin-duplicate', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByTestId('wizard-nav-continue')).toBeDisabled();
  });

  it('calls mergeFields with givenName / familyName on change', () => {
    const { mergeFields } = renderStep();
    fireEvent.change(screen.getByTestId('wizard-step1-given-name'), { target: { value: 'Ada' } });
    expect(mergeFields).toHaveBeenCalledWith({ givenName: 'Ada' });
    fireEvent.change(screen.getByTestId('wizard-step1-family-name'), { target: { value: 'Okafor' } });
    expect(mergeFields).toHaveBeenCalledWith({ familyName: 'Okafor' });
  });

  it('advances when everything is valid', () => {
    const { onContinue } = renderStep(validState());
    fireEvent.click(screen.getByTestId('wizard-nav-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('allows a mononym (given name only) and shows a family-name nudge (AI-Review M3)', () => {
    renderStep(validState({ familyName: '' }));
    expect(screen.getByTestId('wizard-nav-continue')).not.toBeDisabled();
    expect(screen.getByTestId('wizard-family-name-nudge')).toBeInTheDocument();
    // No blocking "required" error for the empty surname.
    expect(screen.queryByText('Family name is required.')).not.toBeInTheDocument();
  });

  it('accepts Yoruba names with diacritics (AI-Review M2)', () => {
    const { onContinue } = renderStep(validState({ givenName: 'Ọláwálé', familyName: 'Ṣadé' }));
    expect(screen.getByTestId('wizard-nav-continue')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('wizard-nav-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('does NOT block an under-15 registrant (age-gate deferred to the forms-engine story)', () => {
    // A 13-year-old: the proper minor age-gate + guardian-consent path is a
    // separate pipelined story; Step 1 must not impose an exclusionary block now.
    const { onContinue } = renderStep(validState({ dateOfBirth: '2013-01-01' }));
    expect(screen.getByTestId('wizard-nav-continue')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('wizard-nav-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('rejects a future date of birth', () => {
    renderStep(validState({ dateOfBirth: '2999-01-01' }));
    fireEvent.submit(screen.getByTestId('step1-basic-info'));
    expect(screen.getByText('Date of birth cannot be in the future.')).toBeInTheDocument();
  });

  it('does not advance and surfaces a given-name error when the given name is missing', () => {
    const { onContinue } = renderStep(validState({ givenName: '' }));
    // Continue is disabled, so submit the form to trigger validation display.
    fireEvent.submit(screen.getByTestId('step1-basic-info'));
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText('Given name is required.')).toBeInTheDocument();
  });
});

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

// Story 13-15: NIN validation is FORMAT-ONLY (^\d{11}$) — no checksum exists
// for real NINs, so ANY 11-digit string is valid.
const VALID_NIN = '12345678919';
const NON_MOD11_NIN = '12345678910'; // 11 digits; fails the RETIRED Mod-11 — must be treated as valid
const SHORT_NIN = '123456789'; // <11 digits — incomplete

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

function renderStep(
  formData: WizardDraftData = {},
  extra: Partial<{ editMode: boolean; ownNin: string }> = {},
) {
  const mergeFields = vi.fn();
  const onContinue = vi.fn();
  const onBack = vi.fn();
  render(
    <Step1BasicInfo
      formData={formData}
      mergeFields={mergeFields}
      onContinue={onContinue}
      onBack={onBack}
      editMode={extra.editMode}
      ownNin={extra.ownNin}
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

  it('enables Continue once NIN is 11 digits and all fields are filled', () => {
    renderStep(validState());
    expect(screen.getByTestId('wizard-nav-continue')).not.toBeDisabled();
    expect(screen.queryByTestId('step1-validation-summary')).not.toBeInTheDocument();
  });

  it('Story 13-15 — accepts a well-formed NIN that fails Mod-11 (AC3: no red invalid state, Continue enabled)', () => {
    renderStep(validState({ nin: NON_MOD11_NIN }));
    // No checksum-failure alert exists any more (format-only validation).
    expect(screen.queryByTestId('wizard-step1-nin-invalid')).not.toBeInTheDocument();
    expect(screen.getByTestId('wizard-nav-continue')).not.toBeDisabled();
  });

  it('Story 13-15 — runs the duplicate check for a NIN that fails Mod-11 (AC4)', async () => {
    mockedCheckNin.mockResolvedValueOnce({ available: true });
    renderStep(validState({ nin: NON_MOD11_NIN }));
    // Debounced (~500ms) — the availability check must fire for ANY ^\d{11}$.
    expect(await screen.findByTestId('wizard-step1-nin-valid', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(mockedCheckNin).toHaveBeenCalledWith(NON_MOD11_NIN);
  });

  it('keeps Continue disabled while the NIN is incomplete (<11 digits)', () => {
    renderStep(validState({ nin: SHORT_NIN }));
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

  it('Story 9-61 — in edit mode with an established NIN, locks the NIN read-only, skips the duplicate check, and does NOT block Continue', () => {
    // The user's own NIN is "already registered" — but editing must not dead-end.
    mockedCheckNin.mockResolvedValue({
      available: false,
      reason: 'respondent',
      registeredAt: '2026-05-01T00:00:00Z',
    });
    renderStep(validState(), { editMode: true, ownNin: VALID_NIN });

    expect(screen.getByTestId('wizard-step1-nin-input')).toHaveAttribute('readonly');
    expect(screen.getByTestId('wizard-step1-nin-locked')).toBeInTheDocument();
    // No duplicate block; the pending-NIN escape is hidden; Continue is enabled.
    expect(screen.queryByTestId('wizard-step1-nin-duplicate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nin-help-hint-pending-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('wizard-nav-continue')).not.toBeDisabled();
    // The duplicate-check endpoint is never hit in locked mode.
    expect(mockedCheckNin).not.toHaveBeenCalled();
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

  it('allows a mononym (given name only) — family name still functionally optional', () => {
    // The "— optional" label + nudge were removed (we don't advertise optionality
    // to respondents — surname is meant for internal use), but the field stays
    // functionally optional so mononym users aren't blocked.
    renderStep(validState({ familyName: '' }));
    expect(screen.getByTestId('wizard-nav-continue')).not.toBeDisabled();
    expect(screen.queryByTestId('wizard-family-name-nudge')).not.toBeInTheDocument();
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

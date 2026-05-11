import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Step1BasicInfo } from '../Step1BasicInfo';
import type { WizardDraftData } from '../../api/wizard.api';

expect.extend(matchers);

/**
 * Story 9-12 Task 4.5 / Step 1 — validation + advance happy path.
 */

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

describe('Step1BasicInfo', () => {
  it('renders the fullName, dateOfBirth and gender fields', () => {
    renderStep();
    expect(screen.getByTestId('wizard-full-name')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-dob')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-gender-group')).toBeInTheDocument();
  });

  it('blocks Continue when fullName is empty and surfaces an inline error', () => {
    const { onContinue } = renderStep();
    fireEvent.click(screen.getByTestId('wizard-nav-continue'));
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText('Full name is required.')).toBeInTheDocument();
  });

  it('blocks Continue when fullName contains invalid characters', () => {
    const { onContinue } = renderStep({
      fullName: 'Ade 123',
      dateOfBirth: '2000-01-01',
      gender: 'male',
    });
    fireEvent.click(screen.getByTestId('wizard-nav-continue'));
    expect(onContinue).not.toHaveBeenCalled();
    expect(
      screen.getByText('Use letters, spaces, hyphens or apostrophes only.'),
    ).toBeInTheDocument();
  });

  it('blocks Continue when the date of birth is missing', () => {
    const { onContinue } = renderStep({
      fullName: 'Ade Bola',
      gender: 'male',
    });
    fireEvent.click(screen.getByTestId('wizard-nav-continue'));
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText('Date of birth is required.')).toBeInTheDocument();
  });

  it('blocks Continue when the user is under 16', () => {
    const tooYoung = new Date();
    tooYoung.setFullYear(tooYoung.getFullYear() - 14);
    const { onContinue } = renderStep({
      fullName: 'Ade Bola',
      dateOfBirth: tooYoung.toISOString().slice(0, 10),
      gender: 'male',
    });
    fireEvent.click(screen.getByTestId('wizard-nav-continue'));
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText('You must be at least 16 years old.')).toBeInTheDocument();
  });

  it('advances when all fields are valid', () => {
    const valid = new Date();
    valid.setFullYear(valid.getFullYear() - 30);
    const { onContinue } = renderStep({
      fullName: "O'Brien Smith",
      dateOfBirth: valid.toISOString().slice(0, 10),
      gender: 'female',
    });
    fireEvent.click(screen.getByTestId('wizard-nav-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('calls mergeFields when fullName changes', () => {
    const { mergeFields } = renderStep();
    fireEvent.change(screen.getByTestId('wizard-full-name'), { target: { value: 'Ade' } });
    expect(mergeFields).toHaveBeenCalledWith({ fullName: 'Ade' });
  });
});

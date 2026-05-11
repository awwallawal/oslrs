import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WizardStepIndicator, type WizardStep } from '../WizardStepIndicator';

expect.extend(matchers);

/**
 * Story 9-12 AC#2 + Task 4.5 — WizardStepIndicator tests.
 */

const STEPS: WizardStep[] = [
  { id: '1', label: 'Basics' },
  { id: '2', label: 'Contact' },
  { id: '3', label: 'Consent' },
  { id: '4', label: 'Survey' },
  { id: '5', label: 'NIN' },
];

describe('WizardStepIndicator', () => {
  it('renders both desktop and mobile views in the DOM', () => {
    render(<WizardStepIndicator steps={STEPS} currentStepIndex={2} />);
    expect(screen.getByTestId('wizard-step-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-step-indicator-mobile')).toHaveTextContent(
      /Step 3 of 5/,
    );
    expect(screen.getByTestId('wizard-step-indicator-mobile')).toHaveTextContent('Consent');
  });

  it('marks the current step with aria-current="step"', () => {
    render(<WizardStepIndicator steps={STEPS} currentStepIndex={1} />);
    expect(screen.getByTestId('wizard-step-1')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('wizard-step-0')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('wizard-step-2')).not.toHaveAttribute('aria-current');
  });

  it('completed step button is enabled and invokes onStepClick', () => {
    const onStepClick = vi.fn();
    render(
      <WizardStepIndicator
        steps={STEPS}
        currentStepIndex={3}
        onStepClick={onStepClick}
      />,
    );
    const completedButton = screen.getByTestId('wizard-step-button-1');
    expect(completedButton).not.toBeDisabled();
    fireEvent.click(completedButton);
    expect(onStepClick).toHaveBeenCalledWith(1);
  });

  it('future step buttons are disabled', () => {
    render(<WizardStepIndicator steps={STEPS} currentStepIndex={1} />);
    expect(screen.getByTestId('wizard-step-button-3')).toBeDisabled();
    expect(screen.getByTestId('wizard-step-button-4')).toBeDisabled();
  });

  it('clamps an out-of-range currentStepIndex to the nearest valid bound', () => {
    render(<WizardStepIndicator steps={STEPS} currentStepIndex={99} />);
    // index 99 → safeIndex = STEPS.length - 1 = 4 (label "NIN").
    expect(screen.getByTestId('wizard-step-indicator-mobile')).toHaveTextContent('NIN');
    expect(screen.getByTestId('wizard-step-4')).toHaveAttribute('aria-current', 'step');
  });

  it('exposes a navigation landmark labelled "Registration progress"', () => {
    render(<WizardStepIndicator steps={STEPS} currentStepIndex={0} />);
    expect(screen.getByLabelText('Registration progress')).toBeInTheDocument();
  });
});

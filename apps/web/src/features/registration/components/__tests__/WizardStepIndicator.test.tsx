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
  it('renders the breadcrumb + compact line for a small step count', () => {
    render(<WizardStepIndicator steps={STEPS} currentStepIndex={2} />);
    expect(screen.getByTestId('wizard-step-indicator')).toHaveAttribute('data-variant', 'breadcrumb');
    expect(screen.getByText(/Step 3 of 5/)).toBeInTheDocument();
    expect(screen.getByTestId('wizard-step-current-label')).toHaveTextContent('Consent');
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
    expect(screen.getByTestId('wizard-step-current-label')).toHaveTextContent('NIN');
    expect(screen.getByTestId('wizard-step-4')).toHaveAttribute('aria-current', 'step');
  });

  it('exposes a navigation landmark labelled "Registration progress"', () => {
    render(<WizardStepIndicator steps={STEPS} currentStepIndex={0} />);
    expect(screen.getByLabelText('Registration progress')).toBeInTheDocument();
  });

  // Story 9-18 Part E (AC#E1) — the breadcrumb can't fit a many-step wizard.
  it('switches to the compact variant for a many-step wizard (>6)', () => {
    const many: WizardStep[] = Array.from({ length: 11 }, (_, i) => ({
      id: String(i),
      label: `Step ${i}`,
    }));
    render(<WizardStepIndicator steps={many} currentStepIndex={5} />);
    expect(screen.getByTestId('wizard-step-indicator')).toHaveAttribute('data-variant', 'compact');
    expect(screen.getByText(/Step 6 of 11/)).toBeInTheDocument();
    // No per-step breadcrumb circles in compact mode.
    expect(screen.queryByTestId('wizard-step-button-0')).not.toBeInTheDocument();
  });

  // Story 9-18 Part E (AC#E5) — auto-skipped section steps render greyed + inert.
  it('greys out and disables a skipped step in the breadcrumb', () => {
    const onStepClick = vi.fn();
    const withSkipped: WizardStep[] = [
      { id: '1', label: 'Basics' },
      { id: '2', label: 'Contact' },
      { id: '3', label: 'Skipped', skipped: true },
      { id: '4', label: 'Review' },
    ];
    render(
      <WizardStepIndicator steps={withSkipped} currentStepIndex={3} onStepClick={onStepClick} />,
    );
    expect(screen.getByTestId('wizard-step-2')).toHaveAttribute('data-skipped', 'true');
    const skippedBtn = screen.getByTestId('wizard-step-button-2');
    expect(skippedBtn).toBeDisabled();
    fireEvent.click(skippedBtn);
    expect(onStepClick).not.toHaveBeenCalled();
  });
});

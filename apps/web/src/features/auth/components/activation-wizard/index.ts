/**
 * Activation Wizard Components
 *
 * Multi-step wizard for staff account activation with selfie capture.
 */

// Hook
export {
  useActivationWizard,
  WIZARD_STEPS,
  STEP_LABELS,
  TOTAL_STEPS,
  type WizardStep,
  type WizardFormData,
  type StepValidationResult,
  type ActivationWizardState,
  type ActivationWizardActions,
  type UseActivationWizardReturn,
  type UseActivationWizardOptions,
} from './useActivationWizard';

// Components
export { WizardProgressBar } from './WizardProgressBar';
export { WizardNavigation } from './WizardNavigation';
export { ActivationWizard, ActivationWizardUI, type StepRenderProps } from './ActivationWizard';

// Step Components
export { PasswordStep, PersonalInfoStep, BankDetailsStep, NextOfKinStep, SelfieStep } from './steps';

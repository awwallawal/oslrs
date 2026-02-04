import { ReactNode } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { WizardProgressBar } from './WizardProgressBar';
import { WizardNavigation } from './WizardNavigation';
import {
  useActivationWizard,
  WIZARD_STEPS,
  type WizardStep,
  type UseActivationWizardOptions,
} from './useActivationWizard';

interface ActivationWizardProps extends UseActivationWizardOptions {
  /** Render function for each step */
  renderStep: (props: StepRenderProps) => ReactNode;
  /** Optional className for the container */
  className?: string;
}

export interface StepRenderProps {
  step: WizardStep;
  formData: ReturnType<typeof useActivationWizard>['formData'];
  updateFormData: ReturnType<typeof useActivationWizard>['updateFormData'];
  errors: Record<string, string>;
  isSubmitting: boolean;
}

/**
 * Main container component for the activation wizard
 * Manages state and renders progress bar, step content, and navigation
 */
export function ActivationWizard({
  token,
  onSuccess,
  onError,
  apiBaseUrl,
  renderStep,
  className,
}: ActivationWizardProps) {
  const wizard = useActivationWizard({ token, onSuccess, onError, apiBaseUrl });

  const handleStepClick = (step: WizardStep) => {
    wizard.goToStep(step);
  };

  const handleNext = () => {
    wizard.nextStep();
  };

  const handleBack = () => {
    wizard.prevStep();
  };

  const handleSubmit = async () => {
    await wizard.submitAll();
  };

  return (
    <div className={cn('w-full max-w-2xl mx-auto', className)}>
      {/* Card container */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-200 bg-neutral-50">
          <h1 className="text-xl font-semibold text-neutral-900">
            Complete Your Profile
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Please fill in the required information to activate your account.
          </p>
        </div>

        {/* Progress bar */}
        <div className="px-6 py-4 border-b border-neutral-100">
          <WizardProgressBar
            currentStep={wizard.currentStep}
            completedSteps={wizard.completedSteps}
            onStepClick={handleStepClick}
          />
        </div>

        {/* Error alert */}
        {wizard.submitError && (
          <div className="mx-6 mt-4">
            <div className="flex items-start gap-3 p-4 bg-error-50 border border-error-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-error-800">
                  {wizard.submitError}
                </p>
              </div>
              <button
                type="button"
                onClick={wizard.clearError}
                className="text-error-500 hover:text-error-700 transition-colors"
                aria-label="Dismiss error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step content */}
        <div className="px-6 py-6">
          {renderStep({
            step: wizard.currentStep,
            formData: wizard.formData,
            updateFormData: wizard.updateFormData,
            errors: wizard.currentStepErrors,
            isSubmitting: wizard.isSubmitting,
          })}
        </div>

        {/* Navigation */}
        <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50">
          <WizardNavigation
            isFirstStep={wizard.isFirstStep}
            isLastStep={wizard.isLastStep}
            isCurrentStepValid={wizard.isCurrentStepValid}
            isSubmitting={wizard.isSubmitting}
            onBack={handleBack}
            onNext={handleNext}
            onSubmit={handleSubmit}
          />
        </div>
      </div>

      {/* Help text */}
      <p className="mt-4 text-center text-sm text-neutral-500">
        Need help?{' '}
        <a
          href="mailto:support@oslsr.gov.ng"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          Contact Support
        </a>
      </p>
    </div>
  );
}

/**
 * Standalone version that doesn't use the hook internally
 * Useful when you want to manage state externally
 */
interface ActivationWizardUIProps {
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
  formData: ReturnType<typeof useActivationWizard>['formData'];
  updateFormData: ReturnType<typeof useActivationWizard>['updateFormData'];
  currentStepErrors: Record<string, string>;
  submitError: string | null;
  isFirstStep: boolean;
  isLastStep: boolean;
  isCurrentStepValid: boolean;
  isSubmitting: boolean;
  onStepClick: (step: WizardStep) => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onClearError: () => void;
  renderStep: (props: StepRenderProps) => ReactNode;
  className?: string;
}

export function ActivationWizardUI({
  currentStep,
  completedSteps,
  formData,
  updateFormData,
  currentStepErrors,
  submitError,
  isFirstStep,
  isLastStep,
  isCurrentStepValid,
  isSubmitting,
  onStepClick,
  onBack,
  onNext,
  onSubmit,
  onClearError,
  renderStep,
  className,
}: ActivationWizardUIProps) {
  return (
    <div className={cn('w-full max-w-2xl mx-auto', className)}>
      {/* Card container */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-200 bg-neutral-50">
          <h1 className="text-xl font-semibold text-neutral-900">
            Complete Your Profile
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Please fill in the required information to activate your account.
          </p>
        </div>

        {/* Progress bar */}
        <div className="px-6 py-4 border-b border-neutral-100">
          <WizardProgressBar
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={onStepClick}
          />
        </div>

        {/* Error alert */}
        {submitError && (
          <div className="mx-6 mt-4">
            <div className="flex items-start gap-3 p-4 bg-error-50 border border-error-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-error-800">
                  {submitError}
                </p>
              </div>
              <button
                type="button"
                onClick={onClearError}
                className="text-error-500 hover:text-error-700 transition-colors"
                aria-label="Dismiss error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step content */}
        <div className="px-6 py-6">
          {renderStep({
            step: currentStep,
            formData,
            updateFormData,
            errors: currentStepErrors,
            isSubmitting,
          })}
        </div>

        {/* Navigation */}
        <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50">
          <WizardNavigation
            isFirstStep={isFirstStep}
            isLastStep={isLastStep}
            isCurrentStepValid={isCurrentStepValid}
            isSubmitting={isSubmitting}
            onBack={onBack}
            onNext={onNext}
            onSubmit={onSubmit}
          />
        </div>
      </div>

      {/* Help text */}
      <p className="mt-4 text-center text-sm text-neutral-500">
        Need help?{' '}
        <a
          href="mailto:support@oslsr.gov.ng"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          Contact Support
        </a>
      </p>
    </div>
  );
}

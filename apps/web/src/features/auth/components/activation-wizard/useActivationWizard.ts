import { useState, useCallback, useMemo } from 'react';
import { z } from 'zod';
import { activationWithSelfieSchema, ninSchema } from '@oslsr/types';

/**
 * Wizard step definitions
 */
export const WIZARD_STEPS = {
  PASSWORD: 1,
  PERSONAL_INFO: 2,
  BANK_DETAILS: 3,
  NEXT_OF_KIN: 4,
  SELFIE: 5,
} as const;

export const TOTAL_STEPS = 5;

export type WizardStep = (typeof WIZARD_STEPS)[keyof typeof WIZARD_STEPS];

/**
 * Step labels for UI display
 */
export const STEP_LABELS: Record<WizardStep, string> = {
  [WIZARD_STEPS.PASSWORD]: 'Password',
  [WIZARD_STEPS.PERSONAL_INFO]: 'Personal Info',
  [WIZARD_STEPS.BANK_DETAILS]: 'Bank Details',
  [WIZARD_STEPS.NEXT_OF_KIN]: 'Next of Kin',
  [WIZARD_STEPS.SELFIE]: 'Photo',
};

/**
 * Form data structure matching ActivationWithSelfiePayload
 */
export interface WizardFormData {
  // Step 1: Password
  password: string;
  confirmPassword: string;
  // Step 2: Personal Info
  nin: string;
  dateOfBirth: string;
  homeAddress: string;
  // Step 3: Bank Details
  bankName: string;
  accountNumber: string;
  accountName: string;
  // Step 4: Next of Kin
  nextOfKinName: string;
  nextOfKinPhone: string;
  // Step 5: Selfie
  selfieBase64?: string;
}

/**
 * Initial empty form data
 */
const INITIAL_FORM_DATA: WizardFormData = {
  password: '',
  confirmPassword: '',
  nin: '',
  dateOfBirth: '',
  homeAddress: '',
  bankName: '',
  accountNumber: '',
  accountName: '',
  nextOfKinName: '',
  nextOfKinPhone: '',
  selfieBase64: undefined,
};

/**
 * Per-step validation schemas
 */
const stepSchemas = {
  [WIZARD_STEPS.PASSWORD]: z.object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),

  [WIZARD_STEPS.PERSONAL_INFO]: z.object({
    nin: ninSchema,
    dateOfBirth: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .refine((val) => {
        const date = new Date(val);
        if (isNaN(date.getTime())) return false;
        const today = new Date();
        const age = today.getFullYear() - date.getFullYear() -
          (today < new Date(today.getFullYear(), date.getMonth(), date.getDate()) ? 1 : 0);
        return age >= 15 && age <= 70;
      }, 'Age must be between 15 and 70 years'),
    homeAddress: z.string().min(5, 'Home address is too short'),
  }),

  [WIZARD_STEPS.BANK_DETAILS]: z.object({
    bankName: z.string().min(2, 'Bank name is required'),
    accountNumber: z.string().length(10, 'Account number must be 10 digits').regex(/^\d+$/, 'Account number must contain only digits'),
    accountName: z.string().min(2, 'Account name is required'),
  }),

  [WIZARD_STEPS.NEXT_OF_KIN]: z.object({
    nextOfKinName: z.string().min(2, 'Next of kin name is required'),
    nextOfKinPhone: z.string().min(10, 'Phone number must be at least 10 characters'),
  }),

  [WIZARD_STEPS.SELFIE]: z.object({
    selfieBase64: z.string().optional(),
  }),
};

/**
 * Validation result for a step
 */
export interface StepValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * State returned by the useActivationWizard hook
 */
export interface ActivationWizardState {
  // Current step (1-5)
  currentStep: WizardStep;
  // Total number of steps
  totalSteps: number;
  // Accumulated form data across all steps
  formData: WizardFormData;
  // Whether we're on the first step
  isFirstStep: boolean;
  // Whether we're on the last step
  isLastStep: boolean;
  // Whether the current step is valid
  isCurrentStepValid: boolean;
  // Validation errors for current step
  currentStepErrors: Record<string, string>;
  // Whether the wizard is currently submitting
  isSubmitting: boolean;
  // Global error message (from API)
  submitError: string | null;
  // All completed steps
  completedSteps: Set<WizardStep>;
}

/**
 * Actions returned by the useActivationWizard hook
 */
export interface ActivationWizardActions {
  // Navigate to next step (validates current step first)
  nextStep: () => boolean;
  // Navigate to previous step
  prevStep: () => void;
  // Jump to a specific step (only if accessible)
  goToStep: (step: WizardStep) => void;
  // Update form data for current step
  updateFormData: (data: Partial<WizardFormData>) => void;
  // Validate a specific step
  validateStep: (step: WizardStep) => StepValidationResult;
  // Validate current step
  validateCurrentStep: () => StepValidationResult;
  // Submit all data to the API
  submitAll: () => Promise<boolean>;
  // Reset the wizard
  reset: () => void;
  // Clear submit error
  clearError: () => void;
}

export type UseActivationWizardReturn = ActivationWizardState & ActivationWizardActions;

/**
 * Options for the useActivationWizard hook
 */
export interface UseActivationWizardOptions {
  token: string;
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
  apiBaseUrl?: string;
}

/**
 * Hook for managing multi-step activation wizard state
 */
export function useActivationWizard(options: UseActivationWizardOptions): UseActivationWizardReturn {
  const { token, onSuccess, onError, apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1' } = options;

  // State
  const [currentStep, setCurrentStep] = useState<WizardStep>(WIZARD_STEPS.PASSWORD);
  const [formData, setFormData] = useState<WizardFormData>(INITIAL_FORM_DATA);
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStep>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Derived state
  const isFirstStep = currentStep === WIZARD_STEPS.PASSWORD;
  const isLastStep = currentStep === WIZARD_STEPS.SELFIE;
  const totalSteps = TOTAL_STEPS;

  /**
   * Validate a specific step
   */
  const validateStep = useCallback((step: WizardStep): StepValidationResult => {
    const schema = stepSchemas[step];
    const stepData = getStepData(formData, step);
    const result = schema.safeParse(stepData);

    if (result.success) {
      return { isValid: true, errors: {} };
    }

    const errors: Record<string, string> = {};
    result.error.errors.forEach((err) => {
      const path = err.path.join('.');
      errors[path] = err.message;
    });

    return { isValid: false, errors };
  }, [formData]);

  /**
   * Validate current step
   */
  const validateCurrentStep = useCallback((): StepValidationResult => {
    return validateStep(currentStep);
  }, [currentStep, validateStep]);

  // Current step validation state (memoized)
  const currentStepValidation = useMemo(() => validateCurrentStep(), [validateCurrentStep]);
  const isCurrentStepValid = currentStepValidation.isValid;
  const currentStepErrors = currentStepValidation.errors;

  /**
   * Navigate to next step
   */
  const nextStep = useCallback((): boolean => {
    const validation = validateCurrentStep();
    if (!validation.isValid) {
      return false;
    }

    // Mark current step as completed
    setCompletedSteps((prev) => new Set(prev).add(currentStep));

    if (currentStep < WIZARD_STEPS.SELFIE) {
      setCurrentStep((prev) => (prev + 1) as WizardStep);
    }

    return true;
  }, [currentStep, validateCurrentStep]);

  /**
   * Navigate to previous step
   */
  const prevStep = useCallback((): void => {
    if (currentStep > WIZARD_STEPS.PASSWORD) {
      setCurrentStep((prev) => (prev - 1) as WizardStep);
    }
  }, [currentStep]);

  /**
   * Jump to a specific step
   */
  const goToStep = useCallback((step: WizardStep): void => {
    // Can only go to completed steps or the next incomplete step
    const canNavigate = completedSteps.has(step) ||
      step === currentStep ||
      (step === currentStep + 1 && isCurrentStepValid);

    if (canNavigate && step >= WIZARD_STEPS.PASSWORD && step <= WIZARD_STEPS.SELFIE) {
      setCurrentStep(step);
    }
  }, [currentStep, completedSteps, isCurrentStepValid]);

  /**
   * Update form data
   */
  const updateFormData = useCallback((data: Partial<WizardFormData>): void => {
    setFormData((prev) => ({ ...prev, ...data }));
    // Clear submit error when form data changes
    if (submitError) {
      setSubmitError(null);
    }
  }, [submitError]);

  /**
   * Submit all data to the API
   */
  const submitAll = useCallback(async (): Promise<boolean> => {
    // Validate all steps first
    for (let step: number = WIZARD_STEPS.PASSWORD; step <= WIZARD_STEPS.SELFIE; step++) {
      const validation = validateStep(step as WizardStep);
      if (!validation.isValid && step !== WIZARD_STEPS.SELFIE) {
        // Selfie is optional, other steps are required
        setCurrentStep(step as WizardStep);
        return false;
      }
    }

    // Validate the full schema (confirmPassword excluded from API submission)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmPassword, ...submissionData } = formData;
    const fullValidation = activationWithSelfieSchema.safeParse(submissionData);

    if (!fullValidation.success) {
      setSubmitError('Please review your information and try again.');
      return false;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/auth/activate/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData),
      });

      const result = await response.json();

      if (!response.ok) {
        let message = 'Activation failed. Please try again.';
        if (result.code === 'AUTH_INVALID_TOKEN') message = 'This activation link is invalid or has expired.';
        if (result.code === 'AUTH_ALREADY_ACTIVATED') message = 'This account has already been activated.';
        if (result.code === 'AUTH_TOKEN_EXPIRED') message = 'This activation link has expired. Please request a new invitation.';
        if (result.code === 'PROFILE_NIN_DUPLICATE') message = 'This NIN is already associated with another account.';
        if (result.code === 'VALIDATION_ERROR') message = result.message || 'Invalid data provided.';

        setSubmitError(message);
        onError?.(new Error(message));
        return false;
      }

      onSuccess?.(result.data);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setSubmitError(message);
      onError?.(err instanceof Error ? err : new Error(message));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, token, apiBaseUrl, onSuccess, onError, validateStep]);

  /**
   * Reset the wizard
   */
  const reset = useCallback((): void => {
    setCurrentStep(WIZARD_STEPS.PASSWORD);
    setFormData(INITIAL_FORM_DATA);
    setCompletedSteps(new Set());
    setIsSubmitting(false);
    setSubmitError(null);
  }, []);

  /**
   * Clear submit error
   */
  const clearError = useCallback((): void => {
    setSubmitError(null);
  }, []);

  return {
    // State
    currentStep,
    totalSteps,
    formData,
    isFirstStep,
    isLastStep,
    isCurrentStepValid,
    currentStepErrors,
    isSubmitting,
    submitError,
    completedSteps,
    // Actions
    nextStep,
    prevStep,
    goToStep,
    updateFormData,
    validateStep,
    validateCurrentStep,
    submitAll,
    reset,
    clearError,
  };
}

/**
 * Helper to extract step-specific data from form data
 */
function getStepData(formData: WizardFormData, step: WizardStep): Partial<WizardFormData> {
  switch (step) {
    case WIZARD_STEPS.PASSWORD:
      return {
        password: formData.password,
        confirmPassword: formData.confirmPassword,
      };
    case WIZARD_STEPS.PERSONAL_INFO:
      return {
        nin: formData.nin,
        dateOfBirth: formData.dateOfBirth,
        homeAddress: formData.homeAddress,
      };
    case WIZARD_STEPS.BANK_DETAILS:
      return {
        bankName: formData.bankName,
        accountNumber: formData.accountNumber,
        accountName: formData.accountName,
      };
    case WIZARD_STEPS.NEXT_OF_KIN:
      return {
        nextOfKinName: formData.nextOfKinName,
        nextOfKinPhone: formData.nextOfKinPhone,
      };
    case WIZARD_STEPS.SELFIE:
      return {
        selfieBase64: formData.selfieBase64,
      };
    default:
      return {};
  }
}

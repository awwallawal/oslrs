import { useState, useCallback, useMemo } from 'react';
import { z } from 'zod';
import { activationWithSelfieSchema, backOfficeActivationSchema, ninSchema, isBackOfficeRole } from '@oslsr/types';
import { activateAccount, AuthApiError } from '../../api/auth.api';

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

export const FIELD_ROLE_TOTAL_STEPS = 5;

export type WizardStep = (typeof WIZARD_STEPS)[keyof typeof WIZARD_STEPS];

/**
 * All steps in order
 */
const ALL_STEPS: WizardStep[] = [
  WIZARD_STEPS.PASSWORD,
  WIZARD_STEPS.PERSONAL_INFO,
  WIZARD_STEPS.BANK_DETAILS,
  WIZARD_STEPS.NEXT_OF_KIN,
  WIZARD_STEPS.SELFIE,
];

/**
 * Back-office roles only see the password step
 */
const BACK_OFFICE_STEPS: WizardStep[] = [WIZARD_STEPS.PASSWORD];

/**
 * Get the filtered steps for a given role
 */
export function getStepsForRole(roleName?: string): WizardStep[] {
  if (roleName && isBackOfficeRole(roleName)) {
    return BACK_OFFICE_STEPS;
  }
  return ALL_STEPS;
}

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
  // Current step
  currentStep: WizardStep;
  // Total number of active steps
  totalSteps: number;
  // Steps visible for this role
  activeSteps: WizardStep[];
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
  roleName?: string;
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for managing multi-step activation wizard state
 */
export function useActivationWizard(options: UseActivationWizardOptions): UseActivationWizardReturn {
  const { token, roleName, onSuccess, onError } = options;

  // Compute filtered steps based on role
  const activeSteps = useMemo(() => getStepsForRole(roleName), [roleName]);
  const isBackOffice = activeSteps.length === 1;

  // State
  const [currentStep, setCurrentStep] = useState<WizardStep>(WIZARD_STEPS.PASSWORD);
  const [formData, setFormData] = useState<WizardFormData>(INITIAL_FORM_DATA);
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStep>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Derived state
  const firstStep = activeSteps[0];
  const lastStep = activeSteps[activeSteps.length - 1];
  const isFirstStep = currentStep === firstStep;
  const isLastStep = currentStep === lastStep;
  const totalSteps = activeSteps.length;

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

    const currentIndex = activeSteps.indexOf(currentStep);
    if (currentIndex < activeSteps.length - 1) {
      setCurrentStep(activeSteps[currentIndex + 1]);
    }

    return true;
  }, [currentStep, validateCurrentStep, activeSteps]);

  /**
   * Navigate to previous step
   */
  const prevStep = useCallback((): void => {
    const currentIndex = activeSteps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(activeSteps[currentIndex - 1]);
    }
  }, [currentStep, activeSteps]);

  /**
   * Jump to a specific step
   */
  const goToStep = useCallback((step: WizardStep): void => {
    // Can only go to steps in the active set
    if (!activeSteps.includes(step)) return;

    const canNavigate = completedSteps.has(step) ||
      step === currentStep ||
      (activeSteps.indexOf(step) === activeSteps.indexOf(currentStep) + 1 && isCurrentStepValid);

    if (canNavigate) {
      setCurrentStep(step);
    }
  }, [currentStep, completedSteps, isCurrentStepValid, activeSteps]);

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
    // Validate only active steps
    for (const step of activeSteps) {
      const validation = validateStep(step);
      if (!validation.isValid && step !== WIZARD_STEPS.SELFIE) {
        // Selfie is optional, other active steps are required
        setCurrentStep(step);
        return false;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmPassword, ...submissionData } = formData;

    // Use appropriate schema based on role
    const schema = isBackOffice ? backOfficeActivationSchema : activationWithSelfieSchema;
    const dataToValidate = isBackOffice ? { password: submissionData.password } : submissionData;
    const fullValidation = schema.safeParse(dataToValidate);

    if (!fullValidation.success) {
      setSubmitError('Please review your information and try again.');
      return false;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // For back-office, only send password; for field roles, send full data
      const payload = isBackOffice ? { password: submissionData.password } : submissionData;
      const result = await activateAccount(token, payload as typeof submissionData);

      onSuccess?.(result);
      return true;
    } catch (err: unknown) {
      let message = 'Activation failed. Please try again.';

      if (err instanceof AuthApiError) {
        if (err.code === 'AUTH_INVALID_TOKEN') message = 'This activation link is invalid or has expired.';
        else if (err.code === 'AUTH_ALREADY_ACTIVATED') message = 'This account has already been activated.';
        else if (err.code === 'AUTH_TOKEN_EXPIRED') message = 'This activation link has expired. Please request a new invitation.';
        else if (err.code === 'PROFILE_NIN_DUPLICATE') message = 'This NIN is already associated with another account.';
        else if (err.code === 'VALIDATION_ERROR') message = err.message || 'Invalid data provided.';
        else message = err.message;
      } else if (err instanceof Error) {
        message = err.message;
      }

      setSubmitError(message);
      onError?.(err instanceof Error ? err : new Error(message));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, token, onSuccess, onError, validateStep, activeSteps, isBackOffice]);

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
    activeSteps,
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

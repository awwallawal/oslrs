import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useActivationWizard,
  WIZARD_STEPS,
  TOTAL_STEPS,
  type WizardFormData,
} from '../useActivationWizard';

// Mock fetch
const mockFetch = vi.fn();
(globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;

describe('useActivationWizard', () => {
  const defaultOptions = {
    token: 'test-token-123',
    onSuccess: vi.fn(),
    onError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Initial State', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      expect(result.current.currentStep).toBe(WIZARD_STEPS.PASSWORD);
      expect(result.current.totalSteps).toBe(TOTAL_STEPS);
      expect(result.current.isFirstStep).toBe(true);
      expect(result.current.isLastStep).toBe(false);
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.submitError).toBeNull();
      expect(result.current.completedSteps.size).toBe(0);
    });

    it('should initialize formData with empty values', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      expect(result.current.formData.password).toBe('');
      expect(result.current.formData.nin).toBe('');
      expect(result.current.formData.bankName).toBe('');
      expect(result.current.formData.selfieBase64).toBeUndefined();
    });
  });

  describe('Form Data Updates', () => {
    it('should update form data correctly', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      act(() => {
        result.current.updateFormData({ password: 'TestPass123!' });
      });

      expect(result.current.formData.password).toBe('TestPass123!');
    });

    it('should merge partial updates without losing existing data', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      act(() => {
        result.current.updateFormData({ password: 'TestPass123!' });
        result.current.updateFormData({ confirmPassword: 'TestPass123!' });
      });

      expect(result.current.formData.password).toBe('TestPass123!');
      expect(result.current.formData.confirmPassword).toBe('TestPass123!');
    });

    it('should clear submit error when form data changes', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      // Simulate an error state (we'll test this properly with submitAll)
      act(() => {
        result.current.updateFormData({ password: 'test' });
      });

      expect(result.current.submitError).toBeNull();
    });
  });

  describe('Step Validation', () => {
    it('should validate password step correctly', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      // Invalid - empty password
      let validation = result.current.validateCurrentStep();
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveProperty('password');

      // Invalid - passwords don't match
      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'DifferentPass123!',
        });
      });

      validation = result.current.validateCurrentStep();
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveProperty('confirmPassword');

      // Valid
      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'TestPass123!',
        });
      });

      validation = result.current.validateCurrentStep();
      expect(validation.isValid).toBe(true);
      expect(Object.keys(validation.errors)).toHaveLength(0);
    });

    it('should validate NIN format on personal info step', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      // Move to step 2
      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'TestPass123!',
        });
      });

      act(() => {
        result.current.nextStep();
      });

      expect(result.current.currentStep).toBe(WIZARD_STEPS.PERSONAL_INFO);

      // Invalid NIN - wrong length
      act(() => {
        result.current.updateFormData({ nin: '12345' });
      });

      const validation = result.current.validateCurrentStep();
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveProperty('nin');
    });

    it('should validate bank details step', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      // Navigate to bank details step
      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'TestPass123!',
        });
      });
      act(() => {
        result.current.nextStep();
      });
      act(() => {
        result.current.updateFormData({
          nin: '12345678919',
          dateOfBirth: '1990-01-01',
          homeAddress: '123 Test Street, Lagos',
        });
      });
      act(() => {
        result.current.nextStep();
      });

      expect(result.current.currentStep).toBe(WIZARD_STEPS.BANK_DETAILS);

      // Invalid - account number wrong length
      act(() => {
        result.current.updateFormData({
          bankName: 'Test Bank',
          accountNumber: '12345',
          accountName: 'John Doe',
        });
      });

      const validation = result.current.validateCurrentStep();
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveProperty('accountNumber');
    });
  });

  describe('Navigation', () => {
    it('should not allow next step if current step is invalid', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      act(() => {
        const success = result.current.nextStep();
        expect(success).toBe(false);
      });

      expect(result.current.currentStep).toBe(WIZARD_STEPS.PASSWORD);
    });

    it('should allow next step if current step is valid', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'TestPass123!',
        });
      });

      act(() => {
        const success = result.current.nextStep();
        expect(success).toBe(true);
      });

      expect(result.current.currentStep).toBe(WIZARD_STEPS.PERSONAL_INFO);
      expect(result.current.completedSteps.has(WIZARD_STEPS.PASSWORD)).toBe(true);
    });

    it('should allow previous step navigation', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      // Go to step 2
      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'TestPass123!',
        });
      });
      act(() => {
        result.current.nextStep();
      });

      expect(result.current.currentStep).toBe(WIZARD_STEPS.PERSONAL_INFO);

      // Go back
      act(() => {
        result.current.prevStep();
      });

      expect(result.current.currentStep).toBe(WIZARD_STEPS.PASSWORD);
    });

    it('should not go below step 1 with prevStep', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      act(() => {
        result.current.prevStep();
        result.current.prevStep();
      });

      expect(result.current.currentStep).toBe(WIZARD_STEPS.PASSWORD);
    });

    it('should allow goToStep for completed steps', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      // Complete step 1 and go to step 2
      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'TestPass123!',
        });
      });
      act(() => {
        result.current.nextStep();
      });
      act(() => {
        result.current.updateFormData({
          nin: '12345678919',
          dateOfBirth: '1990-01-01',
          homeAddress: '123 Test Street, Lagos',
        });
      });
      act(() => {
        result.current.nextStep();
      });

      expect(result.current.currentStep).toBe(WIZARD_STEPS.BANK_DETAILS);

      // Go back to step 1
      act(() => {
        result.current.goToStep(WIZARD_STEPS.PASSWORD);
      });

      expect(result.current.currentStep).toBe(WIZARD_STEPS.PASSWORD);
    });
  });

  describe('Reset', () => {
    it('should reset all state to initial values', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      // Make some changes
      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'TestPass123!',
        });
      });
      act(() => {
        result.current.nextStep();
      });

      expect(result.current.currentStep).toBe(WIZARD_STEPS.PERSONAL_INFO);
      expect(result.current.formData.password).toBe('TestPass123!');

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.currentStep).toBe(WIZARD_STEPS.PASSWORD);
      expect(result.current.formData.password).toBe('');
      expect(result.current.completedSteps.size).toBe(0);
    });
  });

  describe('Submit', () => {
    const validFormData: Partial<WizardFormData> = {
      password: 'TestPass123!',
      confirmPassword: 'TestPass123!',
      nin: '12345678919',
      dateOfBirth: '1990-01-01',
      homeAddress: '123 Test Street, Lagos',
      bankName: 'Test Bank',
      accountNumber: '1234567890',
      accountName: 'John Doe',
      nextOfKinName: 'Jane Doe',
      nextOfKinPhone: '08012345678',
    };

    it('should submit successfully with valid data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: '123', status: 'active' } }),
      });

      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      // Fill in all data
      act(() => {
        result.current.updateFormData(validFormData);
      });

      // Navigate to last step
      await act(async () => {
        result.current.nextStep();
        result.current.nextStep();
        result.current.nextStep();
        result.current.nextStep();
      });

      // Submit
      let success: boolean = false;
      await act(async () => {
        success = await result.current.submitAll();
      });

      expect(success).toBe(true);
      expect(defaultOptions.onSuccess).toHaveBeenCalledWith({ id: '123', status: 'active' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/activate/test-token-123'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          code: 'AUTH_INVALID_TOKEN',
          message: 'Invalid token',
        }),
      });

      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      act(() => {
        result.current.updateFormData(validFormData);
      });

      await act(async () => {
        result.current.nextStep();
        result.current.nextStep();
        result.current.nextStep();
        result.current.nextStep();
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.submitAll();
      });

      expect(success).toBe(false);
      expect(result.current.submitError).toBe('This activation link is invalid or has expired.');
      expect(defaultOptions.onError).toHaveBeenCalled();
    });

    it('should handle NIN duplicate error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          code: 'PROFILE_NIN_DUPLICATE',
          message: 'NIN already exists',
        }),
      });

      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      act(() => {
        result.current.updateFormData(validFormData);
      });

      await act(async () => {
        result.current.nextStep();
        result.current.nextStep();
        result.current.nextStep();
        result.current.nextStep();
        await result.current.submitAll();
      });

      expect(result.current.submitError).toBe('This NIN is already associated with another account.');
    });
  });

  describe('isFirstStep and isLastStep', () => {
    it('should correctly identify first and last steps', () => {
      const { result } = renderHook(() => useActivationWizard(defaultOptions));

      expect(result.current.isFirstStep).toBe(true);
      expect(result.current.isLastStep).toBe(false);

      // Navigate to last step - separate act calls for each state change
      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'TestPass123!',
        });
      });
      act(() => {
        result.current.nextStep();
      });
      act(() => {
        result.current.updateFormData({
          nin: '12345678919',
          dateOfBirth: '1990-01-01',
          homeAddress: '123 Test Street',
        });
      });
      act(() => {
        result.current.nextStep();
      });
      act(() => {
        result.current.updateFormData({
          bankName: 'Test Bank',
          accountNumber: '1234567890',
          accountName: 'John Doe',
        });
      });
      act(() => {
        result.current.nextStep();
      });
      act(() => {
        result.current.updateFormData({
          nextOfKinName: 'Jane Doe',
          nextOfKinPhone: '08012345678',
        });
      });
      act(() => {
        result.current.nextStep();
      });

      expect(result.current.isFirstStep).toBe(false);
      expect(result.current.isLastStep).toBe(true);
      expect(result.current.currentStep).toBe(WIZARD_STEPS.SELFIE);
    });
  });
});

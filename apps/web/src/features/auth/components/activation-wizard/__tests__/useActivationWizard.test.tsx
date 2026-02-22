import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
  useActivationWizard,
  WIZARD_STEPS,
  FIELD_ROLE_TOTAL_STEPS,
  getStepsForRole,
  type WizardFormData,
} from '../useActivationWizard';

afterEach(() => {
  cleanup();
});

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
      expect(result.current.totalSteps).toBe(FIELD_ROLE_TOTAL_STEPS);
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

  describe('getStepsForRole', () => {
    it('should return all steps for field roles', () => {
      expect(getStepsForRole('enumerator')).toHaveLength(5);
      expect(getStepsForRole('supervisor')).toHaveLength(5);
      expect(getStepsForRole('data_entry_clerk')).toHaveLength(5);
    });

    it('should return password-only step for back-office roles', () => {
      const superAdminSteps = getStepsForRole('super_admin');
      expect(superAdminSteps).toHaveLength(1);
      expect(superAdminSteps[0]).toBe(WIZARD_STEPS.PASSWORD);

      const officialSteps = getStepsForRole('government_official');
      expect(officialSteps).toHaveLength(1);
      expect(officialSteps[0]).toBe(WIZARD_STEPS.PASSWORD);

      const assessorSteps = getStepsForRole('verification_assessor');
      expect(assessorSteps).toHaveLength(1);
      expect(assessorSteps[0]).toBe(WIZARD_STEPS.PASSWORD);
    });

    it('should return all steps when roleName is undefined', () => {
      expect(getStepsForRole(undefined)).toHaveLength(5);
      expect(getStepsForRole()).toHaveLength(5);
    });
  });

  describe('Role-Based Wizard (Back-Office)', () => {
    const backOfficeOptions = {
      token: 'test-token-123',
      roleName: 'super_admin',
      onSuccess: vi.fn(),
      onError: vi.fn(),
    };

    it('should initialize with 1 step for back-office roles', () => {
      const { result } = renderHook(() => useActivationWizard(backOfficeOptions));

      expect(result.current.totalSteps).toBe(1);
      expect(result.current.activeSteps).toHaveLength(1);
      expect(result.current.activeSteps[0]).toBe(WIZARD_STEPS.PASSWORD);
      expect(result.current.isFirstStep).toBe(true);
      expect(result.current.isLastStep).toBe(true);
    });

    it('should have isFirstStep and isLastStep both true on password step', () => {
      const { result } = renderHook(() => useActivationWizard(backOfficeOptions));

      expect(result.current.currentStep).toBe(WIZARD_STEPS.PASSWORD);
      expect(result.current.isFirstStep).toBe(true);
      expect(result.current.isLastStep).toBe(true);
    });

    it('should not navigate past the single step', () => {
      const { result } = renderHook(() => useActivationWizard(backOfficeOptions));

      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'TestPass123!',
        });
      });

      act(() => {
        result.current.nextStep();
      });

      // Should still be on password step (no next step to go to)
      expect(result.current.currentStep).toBe(WIZARD_STEPS.PASSWORD);
    });

    it('should submit with password only for back-office roles', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: '123', status: 'active' } }),
      });

      const { result } = renderHook(() => useActivationWizard(backOfficeOptions));

      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'TestPass123!',
        });
      });

      let success = false;
      await act(async () => {
        success = await result.current.submitAll();
      });

      expect(success).toBe(true);
      expect(backOfficeOptions.onSuccess).toHaveBeenCalledWith({ id: '123', status: 'active' });

      // Verify the API was called with password only (no profile fields)
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body).toHaveProperty('password', 'TestPass123!');
      expect(body).not.toHaveProperty('nin');
      expect(body).not.toHaveProperty('bankName');
      expect(body).not.toHaveProperty('nextOfKinName');
    });

    it('should handle API errors on back-office submit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          code: 'AUTH_ALREADY_ACTIVATED',
          message: 'Already activated',
        }),
      });

      const opts = { ...backOfficeOptions, onSuccess: vi.fn(), onError: vi.fn() };
      const { result } = renderHook(() => useActivationWizard(opts));

      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'TestPass123!',
        });
      });

      let success = true;
      await act(async () => {
        success = await result.current.submitAll();
      });

      expect(success).toBe(false);
      expect(result.current.submitError).toBe('This account has already been activated.');
      expect(opts.onError).toHaveBeenCalled();
    });
  });

  describe('Role-Based Wizard (Field Role)', () => {
    const fieldOptions = {
      token: 'test-token-123',
      roleName: 'enumerator',
      onSuccess: vi.fn(),
      onError: vi.fn(),
    };

    it('should initialize with 5 steps for field roles', () => {
      const { result } = renderHook(() => useActivationWizard(fieldOptions));

      expect(result.current.totalSteps).toBe(5);
      expect(result.current.activeSteps).toHaveLength(5);
      expect(result.current.activeSteps).toEqual([
        WIZARD_STEPS.PASSWORD,
        WIZARD_STEPS.PERSONAL_INFO,
        WIZARD_STEPS.BANK_DETAILS,
        WIZARD_STEPS.NEXT_OF_KIN,
        WIZARD_STEPS.SELFIE,
      ]);
    });

    it('should navigate through all 5 steps for field roles', () => {
      const { result } = renderHook(() => useActivationWizard(fieldOptions));

      // Step 1: Password
      expect(result.current.currentStep).toBe(WIZARD_STEPS.PASSWORD);
      expect(result.current.isFirstStep).toBe(true);
      expect(result.current.isLastStep).toBe(false);

      act(() => {
        result.current.updateFormData({
          password: 'TestPass123!',
          confirmPassword: 'TestPass123!',
        });
      });
      act(() => {
        result.current.nextStep();
      });

      // Step 2: Personal Info
      expect(result.current.currentStep).toBe(WIZARD_STEPS.PERSONAL_INFO);
      expect(result.current.isFirstStep).toBe(false);
      expect(result.current.isLastStep).toBe(false);

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

      // Step 3: Bank Details
      expect(result.current.currentStep).toBe(WIZARD_STEPS.BANK_DETAILS);

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

      // Step 4: Next of Kin
      expect(result.current.currentStep).toBe(WIZARD_STEPS.NEXT_OF_KIN);

      act(() => {
        result.current.updateFormData({
          nextOfKinName: 'Jane Doe',
          nextOfKinPhone: '08012345678',
        });
      });
      act(() => {
        result.current.nextStep();
      });

      // Step 5: Selfie (last step)
      expect(result.current.currentStep).toBe(WIZARD_STEPS.SELFIE);
      expect(result.current.isFirstStep).toBe(false);
      expect(result.current.isLastStep).toBe(true);
    });

    it('should submit full profile data for field roles', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: '456', status: 'active' } }),
      });

      const opts = { ...fieldOptions, onSuccess: vi.fn(), onError: vi.fn() };
      const { result } = renderHook(() => useActivationWizard(opts));

      act(() => {
        result.current.updateFormData({
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
        });
      });

      // Navigate to last step
      await act(async () => {
        result.current.nextStep();
        result.current.nextStep();
        result.current.nextStep();
        result.current.nextStep();
      });

      let success = false;
      await act(async () => {
        success = await result.current.submitAll();
      });

      expect(success).toBe(true);
      expect(opts.onSuccess).toHaveBeenCalledWith({ id: '456', status: 'active' });

      // Verify the API was called with full profile data
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body).toHaveProperty('password', 'TestPass123!');
      expect(body).toHaveProperty('nin', '12345678919');
      expect(body).toHaveProperty('bankName', 'Test Bank');
      expect(body).toHaveProperty('nextOfKinName', 'Jane Doe');
      expect(body).not.toHaveProperty('confirmPassword');
    });
  });
});

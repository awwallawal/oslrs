import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivationWizard } from '../ActivationWizard';

// Mock fetch for API calls
const mockFetch = vi.fn();
(globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;

describe('ActivationWizard Component (role-based rendering)', () => {
  const renderStep = vi.fn(() => <div data-testid="step-content">Step Content</div>);

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Back-office role (1-step flow)', () => {
    it('should show "Set Your Password" header for back-office roles', () => {
      render(
        <ActivationWizard
          token="test-token"
          roleName="super_admin"
          renderStep={renderStep}
        />
      );

      expect(screen.getByText('Set Your Password')).toBeDefined();
      expect(screen.getByText('Set a password to activate your account.')).toBeDefined();
      expect(screen.queryByText('Complete Your Profile')).toBeNull();
    });

    it('should hide progress bar for back-office roles', () => {
      const { container } = render(
        <ActivationWizard
          token="test-token"
          roleName="super_admin"
          renderStep={renderStep}
        />
      );

      // Progress bar should not be rendered for single-step wizard
      expect(container.querySelector('[role="progressbar"]')).toBeNull();
      // Step labels should not appear
      expect(screen.queryByText('Personal Info')).toBeNull();
      expect(screen.queryByText('Bank Details')).toBeNull();
      expect(screen.queryByText('Next of Kin')).toBeNull();
    });

    it('should render for government_official role', () => {
      render(
        <ActivationWizard
          token="test-token"
          roleName="government_official"
          renderStep={renderStep}
        />
      );

      expect(screen.getByText('Set Your Password')).toBeDefined();
    });

    it('should render for verification_assessor role', () => {
      render(
        <ActivationWizard
          token="test-token"
          roleName="verification_assessor"
          renderStep={renderStep}
        />
      );

      expect(screen.getByText('Set Your Password')).toBeDefined();
    });
  });

  describe('Field role (5-step flow)', () => {
    it('should show "Complete Your Profile" header for field roles', () => {
      render(
        <ActivationWizard
          token="test-token"
          roleName="enumerator"
          renderStep={renderStep}
        />
      );

      expect(screen.getByText('Complete Your Profile')).toBeDefined();
      expect(screen.getByText('Please fill in the required information to activate your account.')).toBeDefined();
      expect(screen.queryByText('Set Your Password')).toBeNull();
    });

    it('should show progress bar for field roles', () => {
      render(
        <ActivationWizard
          token="test-token"
          roleName="enumerator"
          renderStep={renderStep}
        />
      );

      // Step labels should be visible in the progress bar
      expect(screen.getAllByText('Password').length).toBeGreaterThan(0);
    });

    it('should show "Complete Your Profile" when roleName is undefined (default)', () => {
      render(
        <ActivationWizard
          token="test-token"
          renderStep={renderStep}
        />
      );

      expect(screen.getByText('Complete Your Profile')).toBeDefined();
    });
  });

  describe('Step rendering', () => {
    it('should call renderStep with correct props', () => {
      render(
        <ActivationWizard
          token="test-token"
          roleName="super_admin"
          renderStep={renderStep}
        />
      );

      expect(renderStep).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 1, // WIZARD_STEPS.PASSWORD
          formData: expect.any(Object),
          updateFormData: expect.any(Function),
          errors: expect.any(Object),
          isSubmitting: false,
        })
      );
    });

    it('should render step content', () => {
      render(
        <ActivationWizard
          token="test-token"
          roleName="super_admin"
          renderStep={renderStep}
        />
      );

      expect(screen.getByTestId('step-content')).toBeDefined();
    });
  });
});

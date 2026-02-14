// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PasswordStep } from '../PasswordStep';
import type { StepRenderProps } from '../../ActivationWizard';
import { WIZARD_STEPS } from '../../useActivationWizard';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

const createMockProps = (overrides?: Partial<StepRenderProps>): StepRenderProps => ({
  step: WIZARD_STEPS.PASSWORD,
  formData: {
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
  },
  updateFormData: vi.fn(),
  errors: {},
  isSubmitting: false,
  ...overrides,
});

describe('PasswordStep', () => {
  it('renders password and confirm password fields', () => {
    render(<PasswordStep {...createMockProps()} />);

    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it('renders step title and description', () => {
    render(<PasswordStep {...createMockProps()} />);

    expect(screen.getByText('Create Your Password')).toBeInTheDocument();
    expect(screen.getByText(/choose a strong password/i)).toBeInTheDocument();
  });

  it('renders password requirements component', () => {
    render(<PasswordStep {...createMockProps()} />);

    expect(screen.getByText('Password Requirements')).toBeInTheDocument();
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it('calls updateFormData when password is typed', () => {
    const updateFormData = vi.fn();
    render(<PasswordStep {...createMockProps({ updateFormData })} />);

    const passwordInput = screen.getByLabelText(/^password/i);
    fireEvent.change(passwordInput, { target: { value: 'Test123!' } });

    expect(updateFormData).toHaveBeenCalledWith({ password: 'Test123!' });
  });

  it('calls updateFormData when confirm password is typed', () => {
    const updateFormData = vi.fn();
    render(<PasswordStep {...createMockProps({ updateFormData })} />);

    const confirmInput = screen.getByLabelText(/confirm password/i);
    fireEvent.change(confirmInput, { target: { value: 'Test123!' } });

    expect(updateFormData).toHaveBeenCalledWith({ confirmPassword: 'Test123!' });
  });

  it('toggles password visibility when eye icon is clicked', () => {
    render(<PasswordStep {...createMockProps()} />);

    const passwordInput = screen.getByLabelText(/^password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    // There are two show password buttons (one for each field), get the first one
    const toggleButtons = screen.getAllByLabelText('Show password');
    fireEvent.click(toggleButtons[0]);

    expect(passwordInput).toHaveAttribute('type', 'text');
  });

  it('displays password error when provided', () => {
    render(
      <PasswordStep
        {...createMockProps({
          errors: { password: 'Password must be at least 8 characters' },
        })}
      />
    );

    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
  });

  it('displays confirm password error when provided', () => {
    render(
      <PasswordStep
        {...createMockProps({
          errors: { confirmPassword: 'Passwords do not match' },
        })}
      />
    );

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  });

  it('shows "Passwords match" message when passwords match', () => {
    render(
      <PasswordStep
        {...createMockProps({
          formData: {
            password: 'Test123!',
            confirmPassword: 'Test123!',
            nin: '',
            dateOfBirth: '',
            homeAddress: '',
            bankName: '',
            accountNumber: '',
            accountName: '',
            nextOfKinName: '',
            nextOfKinPhone: '',
            selfieBase64: undefined,
          },
        })}
      />
    );

    expect(screen.getByText('Passwords match')).toBeInTheDocument();
  });

  it('does not show "Passwords match" when there is a confirmPassword error', () => {
    render(
      <PasswordStep
        {...createMockProps({
          formData: {
            password: 'Test123!',
            confirmPassword: 'Test123!',
            nin: '',
            dateOfBirth: '',
            homeAddress: '',
            bankName: '',
            accountNumber: '',
            accountName: '',
            nextOfKinName: '',
            nextOfKinPhone: '',
            selfieBase64: undefined,
          },
          errors: { confirmPassword: 'Passwords do not match' },
        })}
      />
    );

    expect(screen.queryByText('Passwords match')).not.toBeInTheDocument();
  });

  it('disables inputs when isSubmitting is true', () => {
    render(<PasswordStep {...createMockProps({ isSubmitting: true })} />);

    expect(screen.getByLabelText(/^password/i)).toBeDisabled();
    expect(screen.getByLabelText(/confirm password/i)).toBeDisabled();
  });

  it('applies error styling to password input when error exists', () => {
    render(
      <PasswordStep
        {...createMockProps({
          errors: { password: 'Password is required' },
        })}
      />
    );

    const passwordInput = screen.getByLabelText(/^password/i);
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders required field indicators', () => {
    render(<PasswordStep {...createMockProps()} />);

    // Check for asterisks indicating required fields
    const labels = screen.getAllByText('*');
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });
});

// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PersonalInfoStep } from '../PersonalInfoStep';
import type { StepRenderProps } from '../../ActivationWizard';
import { WIZARD_STEPS } from '../../useActivationWizard';

expect.extend(matchers);

const createMockProps = (overrides?: Partial<StepRenderProps>): StepRenderProps => ({
  step: WIZARD_STEPS.PERSONAL_INFO,
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

describe('PersonalInfoStep', () => {
  it('renders NIN, date of birth, and home address fields', () => {
    render(<PersonalInfoStep {...createMockProps()} />);

    expect(screen.getByLabelText(/national identification number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/home address/i)).toBeInTheDocument();
  });

  it('renders step title and description', () => {
    render(<PersonalInfoStep {...createMockProps()} />);

    expect(screen.getByText('Personal Information')).toBeInTheDocument();
    expect(screen.getByText(/provide your identification/i)).toBeInTheDocument();
  });

  it('calls updateFormData when NIN is typed', () => {
    const updateFormData = vi.fn();
    render(<PersonalInfoStep {...createMockProps({ updateFormData })} />);

    const ninInput = screen.getByLabelText(/national identification number/i);
    fireEvent.change(ninInput, { target: { value: '12345678901' } });

    expect(updateFormData).toHaveBeenCalledWith({ nin: '12345678901' });
  });

  it('only allows digits in NIN field', () => {
    const updateFormData = vi.fn();
    render(<PersonalInfoStep {...createMockProps({ updateFormData })} />);

    const ninInput = screen.getByLabelText(/national identification number/i);
    fireEvent.change(ninInput, { target: { value: '123abc456def' } });

    // Should strip non-digits
    expect(updateFormData).toHaveBeenCalledWith({ nin: '123456' });
  });

  it('calls updateFormData when date of birth is selected', () => {
    const updateFormData = vi.fn();
    render(<PersonalInfoStep {...createMockProps({ updateFormData })} />);

    const dobInput = screen.getByLabelText(/date of birth/i);
    fireEvent.change(dobInput, { target: { value: '1990-05-15' } });

    expect(updateFormData).toHaveBeenCalledWith({ dateOfBirth: '1990-05-15' });
  });

  it('calls updateFormData when home address is typed', () => {
    const updateFormData = vi.fn();
    render(<PersonalInfoStep {...createMockProps({ updateFormData })} />);

    const addressInput = screen.getByLabelText(/home address/i);
    fireEvent.change(addressInput, { target: { value: '123 Main Street, Ibadan' } });

    expect(updateFormData).toHaveBeenCalledWith({ homeAddress: '123 Main Street, Ibadan' });
  });

  it('displays NIN error when provided', () => {
    render(
      <PersonalInfoStep
        {...createMockProps({
          errors: { nin: 'NIN must be exactly 11 digits' },
        })}
      />
    );

    expect(screen.getByText('NIN must be exactly 11 digits')).toBeInTheDocument();
  });

  it('displays date of birth error when provided', () => {
    render(
      <PersonalInfoStep
        {...createMockProps({
          errors: { dateOfBirth: 'Date must be in YYYY-MM-DD format' },
        })}
      />
    );

    expect(screen.getByText('Date must be in YYYY-MM-DD format')).toBeInTheDocument();
  });

  it('displays home address error when provided', () => {
    render(
      <PersonalInfoStep
        {...createMockProps({
          errors: { homeAddress: 'Home address is too short' },
        })}
      />
    );

    expect(screen.getByText('Home address is too short')).toBeInTheDocument();
  });

  it('disables all inputs when isSubmitting is true', () => {
    render(<PersonalInfoStep {...createMockProps({ isSubmitting: true })} />);

    expect(screen.getByLabelText(/national identification number/i)).toBeDisabled();
    expect(screen.getByLabelText(/date of birth/i)).toBeDisabled();
    expect(screen.getByLabelText(/home address/i)).toBeDisabled();
  });

  it('shows NIN digit counter', () => {
    render(
      <PersonalInfoStep
        {...createMockProps({
          formData: {
            password: '',
            confirmPassword: '',
            nin: '12345',
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

    expect(screen.getByText('5/11 digits')).toBeInTheDocument();
  });

  it('shows success color when NIN is 11 digits', () => {
    render(
      <PersonalInfoStep
        {...createMockProps({
          formData: {
            password: '',
            confirmPassword: '',
            nin: '12345678901',
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

    const counter = screen.getByText('11/11 digits');
    expect(counter).toHaveClass('text-success-600');
  });

  it('applies error styling to NIN input when error exists', () => {
    render(
      <PersonalInfoStep
        {...createMockProps({
          errors: { nin: 'Invalid NIN' },
        })}
      />
    );

    const ninInput = screen.getByLabelText(/national identification number/i);
    expect(ninInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders NIN hint when no error', () => {
    render(<PersonalInfoStep {...createMockProps()} />);

    expect(screen.getByText(/your 11-digit national identification number/i)).toBeInTheDocument();
  });

  it('renders address hint when no error', () => {
    render(<PersonalInfoStep {...createMockProps()} />);

    expect(screen.getByText(/include street, city, and state/i)).toBeInTheDocument();
  });

  it('renders required field indicators', () => {
    render(<PersonalInfoStep {...createMockProps()} />);

    // Check for asterisks indicating required fields
    const asterisks = screen.getAllByText('*');
    expect(asterisks.length).toBeGreaterThanOrEqual(3);
  });

  it('sets proper min/max dates for date of birth', () => {
    render(<PersonalInfoStep {...createMockProps()} />);

    const dobInput = screen.getByLabelText(/date of birth/i);

    // Should have min and max attributes set
    expect(dobInput).toHaveAttribute('min');
    expect(dobInput).toHaveAttribute('max');
  });
});

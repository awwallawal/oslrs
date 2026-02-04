// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextOfKinStep } from '../NextOfKinStep';
import type { StepRenderProps } from '../../ActivationWizard';
import { WIZARD_STEPS } from '../../useActivationWizard';

expect.extend(matchers);

const createMockProps = (overrides?: Partial<StepRenderProps>): StepRenderProps => ({
  step: WIZARD_STEPS.NEXT_OF_KIN,
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

describe('NextOfKinStep', () => {
  it('renders next of kin name and phone fields', () => {
    render(<NextOfKinStep {...createMockProps()} />);

    expect(screen.getByLabelText(/next of kin full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/next of kin phone number/i)).toBeInTheDocument();
  });

  it('renders step title and description', () => {
    render(<NextOfKinStep {...createMockProps()} />);

    expect(screen.getByText('Next of Kin')).toBeInTheDocument();
    expect(screen.getByText(/provide emergency contact information/i)).toBeInTheDocument();
  });

  it('renders relationship dropdown (optional)', () => {
    render(<NextOfKinStep {...createMockProps()} />);

    expect(screen.getByLabelText(/relationship/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /spouse/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /parent/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /sibling/i })).toBeInTheDocument();
  });

  it('calls updateFormData when name is typed', () => {
    const updateFormData = vi.fn();
    render(<NextOfKinStep {...createMockProps({ updateFormData })} />);

    const nameInput = screen.getByLabelText(/next of kin full name/i);
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });

    expect(updateFormData).toHaveBeenCalledWith({ nextOfKinName: 'Jane Doe' });
  });

  it('calls updateFormData when phone is typed', () => {
    const updateFormData = vi.fn();
    render(<NextOfKinStep {...createMockProps({ updateFormData })} />);

    const phoneInput = screen.getByLabelText(/next of kin phone number/i);
    fireEvent.change(phoneInput, { target: { value: '08012345678' } });

    expect(updateFormData).toHaveBeenCalledWith({ nextOfKinPhone: '08012345678' });
  });

  it('allows formatted phone numbers with spaces and hyphens', () => {
    const updateFormData = vi.fn();
    render(<NextOfKinStep {...createMockProps({ updateFormData })} />);

    const phoneInput = screen.getByLabelText(/next of kin phone number/i);
    fireEvent.change(phoneInput, { target: { value: '+234 801-234-5678' } });

    expect(updateFormData).toHaveBeenCalledWith({ nextOfKinPhone: '+234 801-234-5678' });
  });

  it('strips invalid characters from phone number', () => {
    const updateFormData = vi.fn();
    render(<NextOfKinStep {...createMockProps({ updateFormData })} />);

    const phoneInput = screen.getByLabelText(/next of kin phone number/i);
    fireEvent.change(phoneInput, { target: { value: '0801abc2345xyz' } });

    // Should strip letters
    expect(updateFormData).toHaveBeenCalledWith({ nextOfKinPhone: '08012345' });
  });

  it('displays next of kin name error when provided', () => {
    render(
      <NextOfKinStep
        {...createMockProps({
          errors: { nextOfKinName: 'Next of kin name is required' },
        })}
      />
    );

    expect(screen.getByText('Next of kin name is required')).toBeInTheDocument();
  });

  it('displays phone error when provided', () => {
    render(
      <NextOfKinStep
        {...createMockProps({
          errors: { nextOfKinPhone: 'Phone number must be at least 10 characters' },
        })}
      />
    );

    expect(screen.getByText('Phone number must be at least 10 characters')).toBeInTheDocument();
  });

  it('disables all inputs when isSubmitting is true', () => {
    render(<NextOfKinStep {...createMockProps({ isSubmitting: true })} />);

    expect(screen.getByLabelText(/next of kin full name/i)).toBeDisabled();
    expect(screen.getByLabelText(/next of kin phone number/i)).toBeDisabled();
    expect(screen.getByLabelText(/relationship/i)).toBeDisabled();
  });

  it('shows digit counter for phone number', () => {
    render(
      <NextOfKinStep
        {...createMockProps({
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
            nextOfKinPhone: '08012',
            selfieBase64: undefined,
          },
        })}
      />
    );

    expect(screen.getByText(/5 digits/i)).toBeInTheDocument();
    expect(screen.getByText(/min 10/i)).toBeInTheDocument();
  });

  it('shows success color when phone has 10+ digits', () => {
    render(
      <NextOfKinStep
        {...createMockProps({
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
            nextOfKinPhone: '08012345678',
            selfieBase64: undefined,
          },
        })}
      />
    );

    const counter = screen.getByText(/11 digits/i);
    expect(counter).toHaveClass('text-success-600');
  });

  it('renders info note about emergency contact', () => {
    render(<NextOfKinStep {...createMockProps()} />);

    expect(screen.getByText(/this information will only be used in case of emergency/i)).toBeInTheDocument();
  });

  it('renders hint text for name field when no error', () => {
    render(<NextOfKinStep {...createMockProps()} />);

    expect(screen.getByText(/full name of a family member or trusted person/i)).toBeInTheDocument();
  });

  it('renders hint text for phone field when no error', () => {
    render(<NextOfKinStep {...createMockProps()} />);

    expect(screen.getByText(/nigerian phone number/i)).toBeInTheDocument();
  });

  it('applies error styling to name input when error exists', () => {
    render(
      <NextOfKinStep
        {...createMockProps({
          errors: { nextOfKinName: 'Name is required' },
        })}
      />
    );

    const nameInput = screen.getByLabelText(/next of kin full name/i);
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('applies error styling to phone input when error exists', () => {
    render(
      <NextOfKinStep
        {...createMockProps({
          errors: { nextOfKinPhone: 'Phone is required' },
        })}
      />
    );

    const phoneInput = screen.getByLabelText(/next of kin phone number/i);
    expect(phoneInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders required field indicators', () => {
    render(<NextOfKinStep {...createMockProps()} />);

    // Check for asterisks indicating required fields (name and phone are required)
    const asterisks = screen.getAllByText('*');
    expect(asterisks.length).toBeGreaterThanOrEqual(2);
  });
});

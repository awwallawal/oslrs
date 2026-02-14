// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BankDetailsStep } from '../BankDetailsStep';
import type { StepRenderProps } from '../../ActivationWizard';
import { WIZARD_STEPS } from '../../useActivationWizard';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

const createMockProps = (overrides?: Partial<StepRenderProps>): StepRenderProps => ({
  step: WIZARD_STEPS.BANK_DETAILS,
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

describe('BankDetailsStep', () => {
  it('renders bank name, account number, and account name fields', () => {
    render(<BankDetailsStep {...createMockProps()} />);

    expect(screen.getByLabelText(/bank name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/account name/i)).toBeInTheDocument();
  });

  it('renders step title and description', () => {
    render(<BankDetailsStep {...createMockProps()} />);

    expect(screen.getByText('Bank Details')).toBeInTheDocument();
    expect(screen.getByText(/provide your bank account information/i)).toBeInTheDocument();
  });

  it('renders bank dropdown with Nigerian banks organized by category', () => {
    render(<BankDetailsStep {...createMockProps()} />);

    const bankSelect = screen.getByLabelText(/bank name/i);
    expect(bankSelect).toBeInTheDocument();

    // Check for some common banks (now with full official names)
    expect(screen.getByRole('option', { name: '-- Select your bank --' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Access Bank Plc' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Zenith Bank Plc' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Guaranty Trust Bank (GTBank) Plc' })).toBeInTheDocument();

    // Check for "Other" option
    expect(screen.getByRole('option', { name: 'Other (type bank name)' })).toBeInTheDocument();
  });

  it('calls updateFormData when bank is selected', () => {
    const updateFormData = vi.fn();
    render(<BankDetailsStep {...createMockProps({ updateFormData })} />);

    const bankSelect = screen.getByLabelText(/bank name/i);
    fireEvent.change(bankSelect, { target: { value: 'Access Bank Plc' } });

    expect(updateFormData).toHaveBeenCalledWith({ bankName: 'Access Bank Plc' });
  });

  it('shows search input for filtering banks', () => {
    render(<BankDetailsStep {...createMockProps()} />);

    expect(screen.getByPlaceholderText(/type to search banks/i)).toBeInTheDocument();
  });

  it('shows "Other" text input when Other option is selected', () => {
    const updateFormData = vi.fn();
    render(<BankDetailsStep {...createMockProps({ updateFormData })} />);

    const bankSelect = screen.getByLabelText(/bank name/i);
    fireEvent.change(bankSelect, { target: { value: '__OTHER__' } });

    // Should clear the bank name and show custom input
    expect(updateFormData).toHaveBeenCalledWith({ bankName: '' });
  });

  it('calls updateFormData when account number is typed', () => {
    const updateFormData = vi.fn();
    render(<BankDetailsStep {...createMockProps({ updateFormData })} />);

    const accountInput = screen.getByLabelText(/account number/i);
    fireEvent.change(accountInput, { target: { value: '0123456789' } });

    expect(updateFormData).toHaveBeenCalledWith({ accountNumber: '0123456789' });
  });

  it('only allows digits in account number field', () => {
    const updateFormData = vi.fn();
    render(<BankDetailsStep {...createMockProps({ updateFormData })} />);

    const accountInput = screen.getByLabelText(/account number/i);
    fireEvent.change(accountInput, { target: { value: '01234abc56' } });

    // Should strip non-digits
    expect(updateFormData).toHaveBeenCalledWith({ accountNumber: '0123456' });
  });

  it('calls updateFormData when account name is typed', () => {
    const updateFormData = vi.fn();
    render(<BankDetailsStep {...createMockProps({ updateFormData })} />);

    const nameInput = screen.getByLabelText(/account name/i);
    fireEvent.change(nameInput, { target: { value: 'John Doe' } });

    expect(updateFormData).toHaveBeenCalledWith({ accountName: 'John Doe' });
  });

  it('displays bank name error when provided', () => {
    render(
      <BankDetailsStep
        {...createMockProps({
          errors: { bankName: 'Bank name is required' },
        })}
      />
    );

    expect(screen.getByText('Bank name is required')).toBeInTheDocument();
  });

  it('displays account number error when provided', () => {
    render(
      <BankDetailsStep
        {...createMockProps({
          errors: { accountNumber: 'Account number must be 10 digits' },
        })}
      />
    );

    expect(screen.getByText('Account number must be 10 digits')).toBeInTheDocument();
  });

  it('displays account name error when provided', () => {
    render(
      <BankDetailsStep
        {...createMockProps({
          errors: { accountName: 'Account name is required' },
        })}
      />
    );

    expect(screen.getByText('Account name is required')).toBeInTheDocument();
  });

  it('disables all inputs when isSubmitting is true', () => {
    render(<BankDetailsStep {...createMockProps({ isSubmitting: true })} />);

    expect(screen.getByLabelText(/bank name/i)).toBeDisabled();
    expect(screen.getByLabelText(/account number/i)).toBeDisabled();
    expect(screen.getByLabelText(/account name/i)).toBeDisabled();
  });

  it('shows account number digit counter', () => {
    render(
      <BankDetailsStep
        {...createMockProps({
          formData: {
            password: '',
            confirmPassword: '',
            nin: '',
            dateOfBirth: '',
            homeAddress: '',
            bankName: '',
            accountNumber: '01234',
            accountName: '',
            nextOfKinName: '',
            nextOfKinPhone: '',
            selfieBase64: undefined,
          },
        })}
      />
    );

    expect(screen.getByText('5/10 digits')).toBeInTheDocument();
  });

  it('shows success color when account number is 10 digits', () => {
    render(
      <BankDetailsStep
        {...createMockProps({
          formData: {
            password: '',
            confirmPassword: '',
            nin: '',
            dateOfBirth: '',
            homeAddress: '',
            bankName: '',
            accountNumber: '0123456789',
            accountName: '',
            nextOfKinName: '',
            nextOfKinPhone: '',
            selfieBase64: undefined,
          },
        })}
      />
    );

    const counter = screen.getByText('10/10 digits');
    expect(counter).toHaveClass('text-success-600');
  });

  it('renders info note about bank details', () => {
    render(<BankDetailsStep {...createMockProps()} />);

    expect(screen.getByText(/please ensure your bank details are correct/i)).toBeInTheDocument();
  });

  it('renders account number hint when no error', () => {
    render(<BankDetailsStep {...createMockProps()} />);

    expect(screen.getByText(/your 10-digit bank account number/i)).toBeInTheDocument();
  });

  it('renders account name hint when no error', () => {
    render(<BankDetailsStep {...createMockProps()} />);

    expect(screen.getByText(/name as it appears on your bank account/i)).toBeInTheDocument();
  });

  it('applies error styling to account number input when error exists', () => {
    render(
      <BankDetailsStep
        {...createMockProps({
          errors: { accountNumber: 'Invalid account number' },
        })}
      />
    );

    const accountInput = screen.getByLabelText(/account number/i);
    expect(accountInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders required field indicators', () => {
    render(<BankDetailsStep {...createMockProps()} />);

    // Check for asterisks indicating required fields
    const asterisks = screen.getAllByText('*');
    expect(asterisks.length).toBeGreaterThanOrEqual(3);
  });
});

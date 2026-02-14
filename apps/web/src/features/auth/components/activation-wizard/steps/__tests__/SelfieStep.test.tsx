// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SelfieStep } from '../SelfieStep';
import type { StepRenderProps } from '../../ActivationWizard';
import { WIZARD_STEPS } from '../../useActivationWizard';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

// Mock the LiveSelfieCapture component
vi.mock('../../../../../onboarding/components/LiveSelfieCapture', () => ({
  default: ({ onCapture }: { onCapture: (file: File) => void }) => (
    <div data-testid="mock-live-selfie-capture">
      <button
        onClick={() => {
          const mockFile = new File(['test'], 'selfie.jpg', { type: 'image/jpeg' });
          onCapture(mockFile);
        }}
      >
        Mock Capture
      </button>
    </div>
  ),
}));

const createMockProps = (overrides?: Partial<StepRenderProps>): StepRenderProps => ({
  step: WIZARD_STEPS.SELFIE,
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

describe('SelfieStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders step title and description', () => {
    render(<SelfieStep {...createMockProps()} />);

    expect(screen.getByText('Photo Verification')).toBeInTheDocument();
    expect(screen.getByText(/take a selfie for your staff id card/i)).toBeInTheDocument();
  });

  it('shows idle state with start camera button initially', () => {
    render(<SelfieStep {...createMockProps()} />);

    expect(screen.getByText('Ready to take your photo?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
  });

  it('shows captured state when selfieBase64 is already set', () => {
    render(
      <SelfieStep
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
            nextOfKinPhone: '',
            selfieBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
          },
        })}
      />
    );

    expect(screen.getByText('Photo Captured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retake photo/i })).toBeInTheDocument();
    expect(screen.getByAltText('Captured selfie')).toBeInTheDocument();
  });

  it('switches to capturing state when start camera is clicked', async () => {
    render(<SelfieStep {...createMockProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /start camera/i }));

    await waitFor(() => {
      expect(screen.getByTestId('mock-live-selfie-capture')).toBeInTheDocument();
    });
  });

  it('shows skipped state when skip is clicked', () => {
    const updateFormData = vi.fn();
    render(<SelfieStep {...createMockProps({ updateFormData })} />);

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    expect(screen.getByText('Photo Skipped')).toBeInTheDocument();
    expect(screen.getByText(/you can add your photo later/i)).toBeInTheDocument();
    expect(updateFormData).toHaveBeenCalledWith({ selfieBase64: undefined });
  });

  it('shows take photo button in skipped state to go back', () => {
    render(<SelfieStep {...createMockProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    expect(screen.getByRole('button', { name: /take photo instead/i })).toBeInTheDocument();
  });

  it('can switch from skipped to capturing state', async () => {
    render(<SelfieStep {...createMockProps()} />);

    // Skip first
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(screen.getByText('Photo Skipped')).toBeInTheDocument();

    // Then decide to take photo
    fireEvent.click(screen.getByRole('button', { name: /take photo instead/i }));

    await waitFor(() => {
      expect(screen.getByTestId('mock-live-selfie-capture')).toBeInTheDocument();
    });
  });

  it('disables buttons when isSubmitting is true', () => {
    render(<SelfieStep {...createMockProps({ isSubmitting: true })} />);

    expect(screen.getByRole('button', { name: /start camera/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeDisabled();
  });

  it('renders photo tips info note', () => {
    render(<SelfieStep {...createMockProps()} />);

    expect(screen.getByText(/tips for a good photo/i)).toBeInTheDocument();
    expect(screen.getByText(/face the camera directly/i)).toBeInTheDocument();
  });

  it('displays error message when errors.selfieBase64 is provided', () => {
    render(
      <SelfieStep
        {...createMockProps({
          errors: { selfieBase64: 'Photo is required' },
        })}
      />
    );

    expect(screen.getByText('Photo is required')).toBeInTheDocument();
  });

  it('shows success message in captured state', () => {
    render(
      <SelfieStep
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
            nextOfKinPhone: '',
            selfieBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
          },
        })}
      />
    );

    expect(screen.getByText(/your photo is ready/i)).toBeInTheDocument();
  });

  it('shows skip link while capturing', async () => {
    render(<SelfieStep {...createMockProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /start camera/i }));

    await waitFor(() => {
      expect(screen.getByText(/skip and complete later/i)).toBeInTheDocument();
    });
  });

  it('shows camera permission instructions while capturing', async () => {
    render(<SelfieStep {...createMockProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /start camera/i }));

    await waitFor(() => {
      expect(screen.getByText(/camera not working/i)).toBeInTheDocument();
    });
  });

  it('allows retaking photo from captured state', async () => {
    const updateFormData = vi.fn();
    render(
      <SelfieStep
        {...createMockProps({
          updateFormData,
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
            selfieBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
          },
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /retake photo/i }));

    expect(updateFormData).toHaveBeenCalledWith({ selfieBase64: undefined });
  });
});

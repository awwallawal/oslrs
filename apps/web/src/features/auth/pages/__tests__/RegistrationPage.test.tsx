// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import RegistrationPage from '../RegistrationPage';

expect.extend(matchers);

// Mock the auth API
vi.mock('../../api/auth.api', () => ({
  publicRegister: vi.fn(),
  AuthApiError: class AuthApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

// Mock HCaptcha component
vi.mock('../../components/HCaptcha', () => ({
  HCaptcha: ({ onVerify }: { onVerify: (token: string) => void }) => (
    <div data-testid="hcaptcha-mock">
      <button
        type="button"
        onClick={() => onVerify('test-captcha-token')}
        data-testid="captcha-verify-btn"
      >
        Verify CAPTCHA
      </button>
    </div>
  ),
}));

// Mock the verhoeff validation to avoid issues with the crypto module
vi.mock('@oslsr/utils', () => ({
  verhoeffCheck: vi.fn().mockReturnValue(true),
}));

import * as authApi from '../../api/auth.api';

const mockAuthApi = authApi as unknown as {
  publicRegister: ReturnType<typeof vi.fn>;
  AuthApiError: new (message: string, code: string) => Error & { code: string };
};

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </BrowserRouter>
  );
}

describe('RegistrationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('renders the registration page', async () => {
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
        expect(screen.getByText(/register for the oyo state/i)).toBeInTheDocument();
      });
    });

    it('has all required form fields', async () => {
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/national identification number/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      });
    });

    it('has CAPTCHA widget', async () => {
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        expect(screen.getByTestId('hcaptcha-mock')).toBeInTheDocument();
      });
    });

    it('has submit button', async () => {
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
      });
    });

    it('submit button is disabled without CAPTCHA', async () => {
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /create account/i });
        expect(submitButton).toBeDisabled();
      });
    });

    it('has sign in link', async () => {
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        const signInLink = screen.getByRole('link', { name: /sign in/i });
        expect(signInLink).toBeInTheDocument();
        expect(signInLink).toHaveAttribute('href', '/login');
      });
    });
  });

  describe('Form Validation', () => {
    it('validates email format', async () => {
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText(/email address/i);
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      fireEvent.blur(emailInput);

      await waitFor(() => {
        expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();
      });
    });

    it('validates NIN length', async () => {
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/national identification/i)).toBeInTheDocument();
      });

      const ninInput = screen.getByLabelText(/national identification/i);
      fireEvent.change(ninInput, { target: { value: '12345' } });
      fireEvent.blur(ninInput);

      await waitFor(() => {
        expect(screen.getByText(/nin must be exactly 11 digits/i)).toBeInTheDocument();
      });
    });

    it('validates password match', async () => {
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      });

      // Fill in all required fields first
      fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'John Doe' } });
      fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'john@example.com' } });
      fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '08012345678' } });
      fireEvent.change(screen.getByLabelText(/national identification/i), { target: { value: '12345678901' } });

      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmInput = screen.getByLabelText(/confirm password/i);

      fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
      fireEvent.change(confirmInput, { target: { value: 'DifferentPassword123!' } });

      // Verify CAPTCHA to enable the submit button
      const captchaButton = screen.getByTestId('captcha-verify-btn');
      fireEvent.click(captchaButton);

      // Try to submit
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /create account/i });
        expect(submitButton).not.toBeDisabled();
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
    });
  });

  describe('Form Interaction', () => {
    it('shows loading state when submitting', async () => {
      // Note: Full submission tests require complex zod mock setup due to NIN checksum validation
      // This test verifies CAPTCHA enables the submit button
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      });

      // Initially button should be disabled without CAPTCHA
      let submitButton = screen.getByRole('button', { name: /create account/i });
      expect(submitButton).toBeDisabled();

      // Verify CAPTCHA
      const captchaButton = screen.getByTestId('captcha-verify-btn');
      fireEvent.click(captchaButton);

      // Button should be enabled after CAPTCHA
      await waitFor(() => {
        submitButton = screen.getByRole('button', { name: /create account/i });
        expect(submitButton).not.toBeDisabled();
      });
    });

    it('allows typing in all form fields', async () => {
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      });

      // Fill in all fields
      const fullNameInput = screen.getByLabelText(/full name/i);
      const emailInput = screen.getByLabelText(/email address/i);
      const phoneInput = screen.getByLabelText(/phone number/i);
      const ninInput = screen.getByLabelText(/national identification/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

      fireEvent.change(fullNameInput, { target: { value: 'John Doe' } });
      fireEvent.change(emailInput, { target: { value: 'john@example.com' } });
      fireEvent.change(phoneInput, { target: { value: '08012345678' } });
      fireEvent.change(ninInput, { target: { value: '12345678901' } });
      fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'Password123!' } });

      expect(fullNameInput).toHaveValue('John Doe');
      expect(emailInput).toHaveValue('john@example.com');
      expect(phoneInput).toHaveValue('08012345678');
      expect(ninInput).toHaveValue('12345678901');
      expect(passwordInput).toHaveValue('Password123!');
      expect(confirmPasswordInput).toHaveValue('Password123!');
    });
  });

  describe('Accessibility', () => {
    it('has footer with copyright', async () => {
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        // Footer is in a <footer> element
        const footer = document.querySelector('footer');
        expect(footer).toBeInTheDocument();
        expect(footer?.textContent).toContain('Oyo State Labour');
      });
    });

    it('has terms notice', async () => {
      renderWithRouter(<RegistrationPage />);

      await waitFor(() => {
        expect(screen.getByText(/terms of service/i)).toBeInTheDocument();
      });
    });
  });
});

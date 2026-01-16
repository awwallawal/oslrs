// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import ResendVerificationPage from '../ResendVerificationPage';

expect.extend(matchers);

// Mock the auth API
vi.mock('../../api/auth.api', () => ({
  resendVerificationEmail: vi.fn(),
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

import * as authApi from '../../api/auth.api';

const mockAuthApi = authApi as {
  resendVerificationEmail: ReturnType<typeof vi.fn>;
  AuthApiError: typeof Error;
};

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  );
}

describe('ResendVerificationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('renders the resend verification page', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByText(/resend verification email/i)).toBeInTheDocument();
        expect(screen.getByText(/enter your email to receive a new verification link/i)).toBeInTheDocument();
      });
    });

    it('has email input field', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      });
    });

    it('has CAPTCHA widget', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByTestId('hcaptcha-mock')).toBeInTheDocument();
      });
    });

    it('has submit button', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /send verification email/i })).toBeInTheDocument();
      });
    });

    it('submit button is disabled without CAPTCHA', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /send verification email/i });
        expect(submitButton).toBeDisabled();
      });
    });

    it('has back to login link', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        const backLink = screen.getByRole('link', { name: /back to login/i });
        expect(backLink).toBeInTheDocument();
        expect(backLink).toHaveAttribute('href', '/login');
      });
    });

    it('has info box about verification', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByText(/need a new verification link/i)).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    it('validates email format', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('you@example.com');
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      fireEvent.blur(emailInput);

      await waitFor(() => {
        expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();
      });
    });

    it('validates email is required', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('you@example.com');
      fireEvent.focus(emailInput);
      fireEvent.blur(emailInput);

      await waitFor(() => {
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      });
    });
  });

  describe('Form Interaction', () => {
    it('allows typing in email field', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('you@example.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      expect(emailInput).toHaveValue('test@example.com');
    });

    it('enables submit after CAPTCHA verification', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      });

      // Fill email
      const emailInput = screen.getByPlaceholderText('you@example.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      // Verify CAPTCHA
      const captchaButton = screen.getByTestId('captcha-verify-btn');
      fireEvent.click(captchaButton);

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /send verification email/i });
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  describe('Form Submission', () => {
    it('shows success message after successful submission', async () => {
      mockAuthApi.resendVerificationEmail.mockResolvedValueOnce({
        message: 'Verification email sent',
      });

      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      });

      // Fill email
      const emailInput = screen.getByPlaceholderText('you@example.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      // Verify CAPTCHA
      const captchaButton = screen.getByTestId('captcha-verify-btn');
      fireEvent.click(captchaButton);

      // Submit form
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /send verification email/i });
        expect(submitButton).not.toBeDisabled();
      });

      const submitButton = screen.getByRole('button', { name: /send verification email/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/email sent/i)).toBeInTheDocument();
      });
    });

    it('shows success message with submitted email', async () => {
      mockAuthApi.resendVerificationEmail.mockResolvedValueOnce({
        message: 'Verification email sent',
      });

      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      });

      // Fill email
      const emailInput = screen.getByPlaceholderText('you@example.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      // Verify CAPTCHA
      const captchaButton = screen.getByTestId('captcha-verify-btn');
      fireEvent.click(captchaButton);

      // Submit form
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /send verification email/i });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
      });
    });

    it('shows rate limit error', async () => {
      const error = new mockAuthApi.AuthApiError('Too many requests', 'RATE_LIMIT_EXCEEDED');
      mockAuthApi.resendVerificationEmail.mockRejectedValueOnce(error);

      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      });

      // Fill email
      const emailInput = screen.getByPlaceholderText('you@example.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      // Verify CAPTCHA
      const captchaButton = screen.getByTestId('captcha-verify-btn');
      fireEvent.click(captchaButton);

      // Submit form
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /send verification email/i });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has branding header', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByText('OSLSR')).toBeInTheDocument();
      });
    });

    it('has footer with copyright', async () => {
      renderWithRouter(<ResendVerificationPage />);

      await waitFor(() => {
        expect(screen.getByText(/oyo state labour/i)).toBeInTheDocument();
      });
    });
  });
});

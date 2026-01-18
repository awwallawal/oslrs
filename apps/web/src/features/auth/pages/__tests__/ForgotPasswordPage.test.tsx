// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import ForgotPasswordPage from '../ForgotPasswordPage';

expect.extend(matchers);

// Mock the auth API
vi.mock('../../api/auth.api', () => ({
  forgotPassword: vi.fn(),
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

const mockAuthApi = authApi as unknown as {
  forgotPassword: ReturnType<typeof vi.fn>;
  AuthApiError: new (message: string, code: string) => Error & { code: string };
};

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </BrowserRouter>
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('renders the forgot password page', async () => {
      renderWithRouter(<ForgotPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Forgot Password?')).toBeInTheDocument();
        expect(screen.getByText(/enter your email address/i)).toBeInTheDocument();
      });
    });

    it('has email input field', async () => {
      renderWithRouter(<ForgotPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      });
    });

    it('has CAPTCHA widget', async () => {
      renderWithRouter(<ForgotPasswordPage />);

      await waitFor(() => {
        expect(screen.getByTestId('hcaptcha-mock')).toBeInTheDocument();
      });
    });

    it('has submit button', async () => {
      renderWithRouter(<ForgotPasswordPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
      });
    });

    it('submit button is disabled without CAPTCHA', async () => {
      renderWithRouter(<ForgotPasswordPage />);

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /send reset link/i });
        expect(submitButton).toBeDisabled();
      });
    });

    it('has back to login link', async () => {
      renderWithRouter(<ForgotPasswordPage />);

      await waitFor(() => {
        const backLink = screen.getByRole('link', { name: /back to login/i });
        expect(backLink).toBeInTheDocument();
        expect(backLink).toHaveAttribute('href', '/login');
      });
    });
  });

  describe('Form Interaction', () => {
    it('allows typing in email field', async () => {
      renderWithRouter(<ForgotPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('you@example.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      expect(emailInput).toHaveValue('test@example.com');
    });

    it('enables submit after CAPTCHA verification', async () => {
      renderWithRouter(<ForgotPasswordPage />);

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
        const submitButton = screen.getByRole('button', { name: /send reset link/i });
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  describe('Form Submission', () => {
    it('shows success message after successful submission', async () => {
      mockAuthApi.forgotPassword.mockResolvedValueOnce({
        message: 'Password reset link sent',
      });

      renderWithRouter(<ForgotPasswordPage />);

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
        const submitButton = screen.getByRole('button', { name: /send reset link/i });
        expect(submitButton).not.toBeDisabled();
      });

      const submitButton = screen.getByRole('button', { name: /send reset link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/check your email/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has footer with copyright', async () => {
      renderWithRouter(<ForgotPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText(/oyo state labour/i)).toBeInTheDocument();
      });
    });
  });
});

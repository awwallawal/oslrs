// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import { LoginForm } from '../LoginForm';
import { AuthProvider } from '../../context/AuthContext';

expect.extend(matchers);

// Mock the auth API
vi.mock('../../api/auth.api', () => ({
  staffLogin: vi.fn(),
  publicLogin: vi.fn(),
  logout: vi.fn(),
  refreshToken: vi.fn().mockRejectedValue(new Error('No session')),
  getCurrentUser: vi.fn(),
  AuthApiError: class AuthApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

// Mock HCaptcha component
vi.mock('../HCaptcha', () => ({
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

// Wrapper component with providers
function renderWithProviders(ui: React.ReactElement) {
  return render(
    <BrowserRouter>
      <AuthProvider>
        {ui}
      </AuthProvider>
    </BrowserRouter>
  );
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Staff Login', () => {
    it('renders staff login form correctly', async () => {
      renderWithProviders(<LoginForm type="staff" />);

      await waitFor(() => {
        expect(screen.getByText('Staff Login')).toBeInTheDocument();
        expect(screen.getByText('Access the OSLSR administrative portal')).toBeInTheDocument();
      });
    });

    it('has email input', async () => {
      renderWithProviders(<LoginForm type="staff" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      });
    });

    it('has password input', async () => {
      renderWithProviders(<LoginForm type="staff" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
      });
    });
  });

  describe('Public Login', () => {
    it('renders public login form correctly', async () => {
      renderWithProviders(<LoginForm type="public" />);

      await waitFor(() => {
        expect(screen.getByText('Login')).toBeInTheDocument();
        expect(screen.getByText('Access your OSLSR account')).toBeInTheDocument();
      });
    });
  });

  describe('Form Interaction', () => {
    it('allows typing in email field', async () => {
      renderWithProviders(<LoginForm type="staff" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText('you@example.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      expect(emailInput).toHaveValue('test@example.com');
    });

    it('allows typing in password field', async () => {
      renderWithProviders(<LoginForm type="staff" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText('Enter your password');
      fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

      expect(passwordInput).toHaveValue('testpassword');
    });

    it('has Remember Me checkbox', async () => {
      renderWithProviders(<LoginForm type="staff" />);

      await waitFor(() => {
        expect(screen.getByText(/remember me/i)).toBeInTheDocument();
      });
    });
  });

  describe('CAPTCHA Protection', () => {
    it('renders CAPTCHA widget', async () => {
      renderWithProviders(<LoginForm type="staff" />);

      await waitFor(() => {
        expect(screen.getByTestId('hcaptcha-mock')).toBeInTheDocument();
      });
    });

    it('has Sign In button', async () => {
      renderWithProviders(<LoginForm type="staff" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      });
    });

    it('submit button is disabled initially', async () => {
      renderWithProviders(<LoginForm type="staff" />);

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /sign in/i });
        expect(submitButton).toBeDisabled();
      });
    });

    it('submit button enabled after CAPTCHA', async () => {
      renderWithProviders(<LoginForm type="staff" />);

      await waitFor(() => {
        expect(screen.getByTestId('captcha-verify-btn')).toBeInTheDocument();
      });

      const captchaButton = screen.getByTestId('captcha-verify-btn');
      fireEvent.click(captchaButton);

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /sign in/i });
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  describe('Navigation Links', () => {
    it('has link to forgot password page', async () => {
      renderWithProviders(<LoginForm type="staff" />);

      await waitFor(() => {
        const forgotPasswordLink = screen.getByRole('link', { name: /forgot password/i });
        expect(forgotPasswordLink).toHaveAttribute('href', '/forgot-password');
      });
    });
  });
});

// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import LoginPage from '../LoginPage';
import { AuthProvider } from '../../context/AuthContext';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

// Mock the auth API - refreshToken resolves immediately to skip loading state
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

// Mock Google OAuth
vi.mock('@react-oauth/google', () => ({
  GoogleLogin: () => <div data-testid="google-login-mock">Google Sign-In</div>,
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock Google auth API
vi.mock('../../api/google-auth.api', () => ({
  verifyGoogleToken: vi.fn(),
}));

// Mock HCaptcha component - needs to match the import path from LoginForm
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

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        {ui}
      </AuthProvider>
    </BrowserRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the login page title', async () => {
    renderWithProviders(<LoginPage />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });

  it('renders the login page subtitle', async () => {
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('Access your OSLSR account')).toBeInTheDocument();
    });
  });

  it('has OSLSR branding', async () => {
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('OSLSR')).toBeInTheDocument();
    });
  });

  it('has email input after loading', async () => {
    renderWithProviders(<LoginPage />);

    // Wait for loading to complete and form to be interactive
    await waitFor(() => {
      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    });
  });

  it('has password input after loading', async () => {
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    });
  });

  it('has Remember Me text', async () => {
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText(/remember me/i)).toBeInTheDocument();
    });
  });

  it('has forgot password link', async () => {
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      const forgotPasswordLink = screen.getByRole('link', { name: /forgot password/i });
      expect(forgotPasswordLink).toHaveAttribute('href', '/forgot-password');
    });
  });

  it('renders CAPTCHA widget', async () => {
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByTestId('hcaptcha-mock')).toBeInTheDocument();
    });
  });

  it('has footer with copyright', async () => {
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText(/oyo state labour/i)).toBeInTheDocument();
    });
  });
});

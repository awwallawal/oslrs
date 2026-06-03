// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

// Story 9-16 — stub the magic-link request fetcher used by the entry-point.
const { mockRequestLoginMagicLink } = vi.hoisted(() => ({
  mockRequestLoginMagicLink: vi.fn(),
}));
vi.mock('../../api/magic-link.api', () => ({
  requestLoginMagicLink: (...args: unknown[]) => mockRequestLoginMagicLink(...args),
}));

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

// Story 9-12 Task 10.1 — Google OAuth retired; mocks no longer needed.

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

  // Story 9-12 Task 8 — cutover messaging.
  it('shows the "New here?" cutover banner with a link to /register on public login', async () => {
    renderWithProviders(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByTestId('login-page-cutover-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('login-page-cutover-link')).toHaveAttribute('href', '/register');
    expect(screen.getByTestId('login-page-existing-user-header')).toHaveTextContent(
      /already registered/i,
    );
  });

  it('does NOT show the cutover banner on staff login', async () => {
    renderWithProviders(<LoginPage type="staff" />);
    await waitFor(() => {
      expect(screen.getByText('Staff Login')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('login-page-cutover-banner')).toBeNull();
    expect(screen.queryByTestId('login-page-existing-user-header')).toBeNull();
  });

  // Story 9-16 — magic-link sign-in entry-point (public-only).
  it('renders the "Send me a sign-in link" entry-point on public login', async () => {
    renderWithProviders(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByTestId('magic-link-entry-point')).toBeInTheDocument();
    });
    expect(screen.getByTestId('magic-link-reveal-button')).toHaveTextContent(/send me a sign-in link/i);
  });

  it('does NOT render the magic-link entry-point on staff login', async () => {
    renderWithProviders(<LoginPage type="staff" />);
    await waitFor(() => {
      expect(screen.getByText('Staff Login')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('magic-link-entry-point')).toBeNull();
  });

  it('submits a login-purpose magic-link request and shows the generic confirmation', async () => {
    mockRequestLoginMagicLink.mockResolvedValueOnce(undefined);
    renderWithProviders(<LoginPage />);
    await waitFor(() => expect(screen.getByTestId('magic-link-reveal-button')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('magic-link-reveal-button'));
    await userEvent.type(screen.getByTestId('magic-link-email-input'), 'returning@example.com');
    await userEvent.click(screen.getByTestId('magic-link-submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('magic-link-sent-message')).toBeInTheDocument();
    });
    expect(mockRequestLoginMagicLink).toHaveBeenCalledWith({ email: 'returning@example.com' });
    expect(screen.getByTestId('magic-link-sent-message')).toHaveTextContent(/if your account exists/i);
  });
});

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

  it('renders the public sign-in heading', async () => {
    renderWithProviders(<LoginPage />);

    // Wait for loading to complete (Story 9-39 — heading lives on the page now,
    // not inside the collapsed password form).
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
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

  it('leads with the magic-link email input (primary action)', async () => {
    renderWithProviders(<LoginPage />);

    // Wait for loading to complete; the magic-link email field is visible by
    // default (Story 9-39 AC#2 — no reveal needed).
    await waitFor(() => {
      expect(screen.getByTestId('magic-link-email-input')).toBeInTheDocument();
    });
  });

  // Story 9-39 AC#2/#3 — the password form (and its Remember-Me / Forgot-password
  // / CAPTCHA) is demoted behind the "I already set a password" disclosure.
  it('hides the password form by default; reveals it via the disclosure', async () => {
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByTestId('password-signin-reveal')).toBeInTheDocument();
    });
    // Collapsed by default.
    expect(screen.queryByPlaceholderText('Enter your password')).toBeNull();
    expect(screen.queryByText(/remember me/i)).toBeNull();
    expect(screen.queryByTestId('hcaptcha-mock')).toBeNull();

    await userEvent.click(screen.getByTestId('password-signin-reveal'));

    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.getByText(/remember me/i)).toBeInTheDocument();
    expect(screen.getByTestId('hcaptcha-mock')).toBeInTheDocument();
  });

  // Story 9-39 review M1/L1 — the embedded password form must NOT duplicate the
  // page-level OSLSR branding/heading. Before the `embedded` prop, opening the
  // disclosure rendered LoginForm's own <h1>OSLSR</h1> + "Login" heading on top
  // of the page's, producing two <h1>s and a conflicting heading.
  it('does not duplicate the OSLSR branding/heading when the password form is revealed', async () => {
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByTestId('password-signin-reveal')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId('password-signin-reveal'));

    // Password form is shown…
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    // …but the page still has exactly ONE OSLSR brand mark and ONE "Sign in"
    // heading — no second <h1> or "Login" heading from the embedded LoginForm.
    expect(screen.getAllByText('OSLSR')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Login' })).toBeNull();
  });

  // Story 9-39 AC#3 — "Forgot password" is OUT of the default public view
  // (passwordless accounts have nothing to reset); it lives in the disclosure.
  it('keeps "Forgot password" out of the default view, available in the disclosure', async () => {
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByTestId('password-signin-reveal')).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /forgot password/i })).toBeNull();

    await userEvent.click(screen.getByTestId('password-signin-reveal'));

    const forgotPasswordLink = screen.getByRole('link', { name: /forgot password/i });
    expect(forgotPasswordLink).toHaveAttribute('href', '/forgot-password');
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

  // Story 9-16 + 9-39 AC#2 — magic-link entry-point is the PRIMARY public action.
  it('renders the magic-link sign-in entry-point as the primary public action', async () => {
    renderWithProviders(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByTestId('magic-link-entry-point')).toBeInTheDocument();
    });
    // Email field + submit are visible by default — no reveal step (9-39 AC#2).
    expect(screen.getByTestId('magic-link-email-input')).toBeInTheDocument();
    expect(screen.getByTestId('magic-link-submit-button')).toHaveTextContent(/email me a sign-in link/i);
  });

  it('does NOT render the magic-link entry-point on staff login', async () => {
    renderWithProviders(<LoginPage type="staff" />);
    await waitFor(() => {
      expect(screen.getByText('Staff Login')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('magic-link-entry-point')).toBeNull();
  });

  // Story 9-39 — staff login is UNCHANGED: password form + forgot-password inline,
  // no magic-link, no password disclosure.
  it('keeps staff login on the inline password form with Forgot password', async () => {
    renderWithProviders(<LoginPage type="staff" />);
    await waitFor(() => {
      expect(screen.getByText('Staff Login')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.queryByTestId('password-signin-reveal')).toBeNull();
  });

  it('submits a login-purpose magic-link request and shows the generic confirmation', async () => {
    mockRequestLoginMagicLink.mockResolvedValueOnce(undefined);
    renderWithProviders(<LoginPage />);
    await waitFor(() => expect(screen.getByTestId('magic-link-email-input')).toBeInTheDocument());

    await userEvent.type(screen.getByTestId('magic-link-email-input'), 'returning@example.com');
    await userEvent.click(screen.getByTestId('magic-link-submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('magic-link-sent-message')).toBeInTheDocument();
    });
    expect(mockRequestLoginMagicLink).toHaveBeenCalledWith({ email: 'returning@example.com' });
    expect(screen.getByTestId('magic-link-sent-message')).toHaveTextContent(/if your account exists/i);
  });
});

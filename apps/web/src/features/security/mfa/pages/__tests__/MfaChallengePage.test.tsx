// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MfaChallengePage from '../MfaChallengePage';

expect.extend(matchers);

// F19 (code-review 2026-05-02): RTL doesn't auto-cleanup in this project's
// vitest config, so each render() must be unmounted between tests or DOM
// accumulates and getByLabelText/getByRole find multiple elements. Pattern
// matches `apps/web/src/features/about/__tests__/AboutLandingPage.test.tsx:10`.
afterEach(() => {
  cleanup();
});

const completeStaffLoginAfterMfaMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../../auth/context/AuthContext', () => ({
  useAuth: () => ({
    completeStaffLoginAfterMfa: completeStaffLoginAfterMfaMock,
    user: null,
    accessToken: null,
  }),
}));

const loginMfaMock = vi.fn();
const loginMfaBackupMock = vi.fn();

vi.mock('../../../../auth/api/mfa.api', () => ({
  loginMfa: (...args: unknown[]) => loginMfaMock(...args),
  loginMfaBackup: (...args: unknown[]) => loginMfaBackupMock(...args),
  MfaApiError: class MfaApiError extends Error {
    code: string;
    status: number;
    details?: Record<string, unknown>;
    constructor(message: string, code: string, status: number, details?: Record<string, unknown>) {
      super(message);
      this.code = code;
      this.status = status;
      this.details = details;
    }
  },
}));

// hCaptcha stub: auto-verify so tests don't need to render the iframe
vi.mock('../../../../auth/components/HCaptcha', () => ({
  HCaptcha: ({ onVerify }: { onVerify: (t: string) => void }) => {
    onVerify('test-captcha-bypass');
    return <div data-testid="hcaptcha-stub" />;
  },
}));

function renderWith(state?: { mfaChallengeToken?: string; rememberMe?: boolean; redirectTo?: string }) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/auth/mfa-challenge',
          state: state ?? null,
        },
      ]}
    >
      <Routes>
        <Route path="/auth/mfa-challenge" element={<MfaChallengePage />} />
        <Route path="/staff/login" element={<div data-testid="staff-login">Staff Login</div>} />
        <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('MfaChallengePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /staff/login when no challenge token in router state', async () => {
    renderWith();
    await waitFor(() => {
      expect(screen.getByTestId('staff-login')).toBeInTheDocument();
    });
  });

  it('renders TOTP entry by default with the 6-digit input', () => {
    renderWith({ mfaChallengeToken: 'tok-1', rememberMe: false, redirectTo: '/dashboard' });
    expect(screen.getByLabelText(/one-time code/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
  });

  it('toggles into backup-code mode and exposes the 10-digit input', () => {
    renderWith({ mfaChallengeToken: 'tok-2', rememberMe: false, redirectTo: '/dashboard' });
    fireEvent.click(screen.getByRole('button', { name: /use a backup code/i }));
    expect(screen.getByLabelText(/backup code/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0000000000')).toBeInTheDocument();
  });

  it('submits TOTP code, completes staff login, and navigates to redirectTo', async () => {
    loginMfaMock.mockResolvedValue({
      accessToken: 'access-jwt',
      user: { id: 'u1', email: 'a@b.com', fullName: 'Alice', role: 'super_admin', status: 'active' },
      expiresIn: 900,
    });
    renderWith({ mfaChallengeToken: 'tok-3', rememberMe: true, redirectTo: '/dashboard' });

    fireEvent.change(screen.getByLabelText(/one-time code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and sign in/i }));

    await waitFor(() => {
      expect(loginMfaMock).toHaveBeenCalledWith({
        mfaChallengeToken: 'tok-3',
        code: '123456',
        captchaToken: 'test-captcha-bypass',
      });
      expect(completeStaffLoginAfterMfaMock).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'access-jwt' }),
        true,
      );
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });
  });

  it('shows lockout message on MFA_LOCKED_OUT response', async () => {
    const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { MfaApiError } = await import('../../../../auth/api/mfa.api');
    loginMfaMock.mockRejectedValue(
      new MfaApiError('Too many failed attempts.', 'MFA_LOCKED_OUT', 429, { lockedUntil: lockUntil }),
    );

    renderWith({ mfaChallengeToken: 'tok-4', rememberMe: false, redirectTo: '/dashboard' });
    fireEvent.change(screen.getByLabelText(/one-time code/i), { target: { value: '999999' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/too many failed attempts/i)).toBeInTheDocument();
      expect(screen.getByText(/try again after/i)).toBeInTheDocument();
    });
  });
});

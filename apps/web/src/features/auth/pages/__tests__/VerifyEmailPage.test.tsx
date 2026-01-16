// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import VerifyEmailPage from '../VerifyEmailPage';

expect.extend(matchers);

// Mock the auth API
vi.mock('../../api/auth.api', () => ({
  verifyEmail: vi.fn(),
  AuthApiError: class AuthApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

import * as authApi from '../../api/auth.api';

const mockAuthApi = authApi as {
  verifyEmail: ReturnType<typeof vi.fn>;
  AuthApiError: typeof Error;
};

// Generate a valid 64-character token for testing
const validToken = 'a'.repeat(64);

// Custom render that sets up the route properly with MemoryRouter
function renderPage(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/verify-email/${token}`]}>
      <Routes>
        <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading state while verifying', async () => {
      mockAuthApi.verifyEmail.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderPage(validToken);

      await waitFor(() => {
        expect(screen.getByText(/verifying your email/i)).toBeInTheDocument();
      });
    });
  });

  describe('Success State', () => {
    it('shows success message after successful verification', async () => {
      mockAuthApi.verifyEmail.mockResolvedValueOnce({
        message: 'Email verified successfully',
        success: true,
      });

      renderPage(validToken);

      await waitFor(() => {
        expect(screen.getByText(/email verified/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/successfully verified/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go to login/i })).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error for invalid token', async () => {
      // Short token is invalid
      renderPage('shorttoken');

      await waitFor(() => {
        expect(screen.getByText(/verification failed/i)).toBeInTheDocument();
        expect(screen.getByText(/invalid verification link/i)).toBeInTheDocument();
      });
    });

    it('shows error when API returns invalid token error', async () => {
      const error = new mockAuthApi.AuthApiError('Token invalid', 'VERIFICATION_TOKEN_INVALID');
      mockAuthApi.verifyEmail.mockRejectedValueOnce(error);

      renderPage(validToken);

      await waitFor(() => {
        expect(screen.getByText(/verification failed/i)).toBeInTheDocument();
      });
    });

    it('has resend verification link on error', async () => {
      const error = new mockAuthApi.AuthApiError('Token invalid', 'VERIFICATION_TOKEN_INVALID');
      mockAuthApi.verifyEmail.mockRejectedValueOnce(error);

      renderPage(validToken);

      await waitFor(() => {
        expect(screen.getByText(/verification failed/i)).toBeInTheDocument();
      });

      const resendLink = screen.getByRole('link', { name: /request new verification link/i });
      expect(resendLink).toBeInTheDocument();
      expect(resendLink).toHaveAttribute('href', '/resend-verification');
    });
  });

  describe('Expired Token', () => {
    it('shows expired message for expired token', async () => {
      const error = new mockAuthApi.AuthApiError('Token expired', 'VERIFICATION_TOKEN_EXPIRED');
      mockAuthApi.verifyEmail.mockRejectedValueOnce(error);

      renderPage(validToken);

      await waitFor(() => {
        expect(screen.getByText(/link expired/i)).toBeInTheDocument();
      });
    });

    it('has resend link for expired token', async () => {
      const error = new mockAuthApi.AuthApiError('Token expired', 'VERIFICATION_TOKEN_EXPIRED');
      mockAuthApi.verifyEmail.mockRejectedValueOnce(error);

      renderPage(validToken);

      await waitFor(() => {
        expect(screen.getByText(/link expired/i)).toBeInTheDocument();
      });

      const resendLink = screen.getByRole('link', { name: /request new verification link/i });
      expect(resendLink).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has branding header', async () => {
      mockAuthApi.verifyEmail.mockResolvedValueOnce({
        message: 'Email verified',
        success: true,
      });

      renderPage(validToken);

      await waitFor(() => {
        expect(screen.getByText('OSLSR')).toBeInTheDocument();
      });
    });

    it('has footer with copyright', async () => {
      mockAuthApi.verifyEmail.mockResolvedValueOnce({
        message: 'Email verified',
        success: true,
      });

      renderPage(validToken);

      await waitFor(() => {
        expect(screen.getByText(/oyo state labour/i)).toBeInTheDocument();
      });
    });
  });
});

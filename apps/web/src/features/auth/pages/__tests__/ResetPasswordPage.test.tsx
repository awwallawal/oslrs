// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import ResetPasswordPage from '../ResetPasswordPage';

expect.extend(matchers);

// Mock the auth API
vi.mock('../../api/auth.api', () => ({
  validateResetToken: vi.fn(),
  resetPassword: vi.fn(),
  AuthApiError: class AuthApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

import * as authApi from '../../api/auth.api';

const mockAuthApi = authApi as unknown as {
  validateResetToken: ReturnType<typeof vi.fn>;
  resetPassword: ReturnType<typeof vi.fn>;
  AuthApiError: new (message: string, code: string) => Error & { code: string };
};

function renderWithRouter(token = 'test-token') {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[`/reset-password/${token}`]}>
      <Routes>
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/forgot-password" element={<div>Forgot Password Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Validation', () => {
    it('shows loading state while validating token', () => {
      mockAuthApi.validateResetToken.mockImplementation(
        () => new Promise(() => {}) // Never resolves - stays loading
      );

      renderWithRouter();

      expect(screen.getByText(/validating reset link/i)).toBeInTheDocument();
    });

    it('shows form when token is valid', async () => {
      mockAuthApi.validateResetToken.mockResolvedValueOnce({ valid: true });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Reset Your Password')).toBeInTheDocument();
      });
    });

    it('shows error when token is invalid', async () => {
      const { AuthApiError } = mockAuthApi;
      mockAuthApi.validateResetToken.mockRejectedValueOnce(
        new AuthApiError('Invalid token', 'AUTH_RESET_TOKEN_INVALID')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/invalid or expired link/i)).toBeInTheDocument();
      });
    });

    it('shows link to request new reset when token is invalid', async () => {
      const { AuthApiError } = mockAuthApi;
      mockAuthApi.validateResetToken.mockRejectedValueOnce(
        new AuthApiError('Invalid token', 'AUTH_RESET_TOKEN_INVALID')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /request new reset link/i })).toBeInTheDocument();
      });
    });
  });

  describe('Form Interaction', () => {
    beforeEach(() => {
      mockAuthApi.validateResetToken.mockResolvedValue({ valid: true });
    });

    it('has password input fields', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter new password')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Confirm new password')).toBeInTheDocument();
      });
    });

    it('allows typing in password fields', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter new password')).toBeInTheDocument();
      });

      const newPasswordInput = screen.getByPlaceholderText('Enter new password');
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm new password');

      fireEvent.change(newPasswordInput, { target: { value: 'NewPass123!' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'NewPass123!' } });

      expect(newPasswordInput).toHaveValue('NewPass123!');
      expect(confirmPasswordInput).toHaveValue('NewPass123!');
    });
  });

  describe('Password Requirements', () => {
    beforeEach(() => {
      mockAuthApi.validateResetToken.mockResolvedValue({ valid: true });
    });

    it('displays password requirements', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Reset Your Password')).toBeInTheDocument();
      });

      // Password requirements component should be visible
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('has back to login link when form is shown', async () => {
      mockAuthApi.validateResetToken.mockResolvedValue({ valid: true });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /back to login/i })).toBeInTheDocument();
      });
    });
  });
});

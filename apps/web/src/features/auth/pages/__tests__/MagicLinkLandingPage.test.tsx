// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

expect.extend(matchers);

const { mockPeekMagicLink } = vi.hoisted(() => ({
  mockPeekMagicLink: vi.fn(),
}));

vi.mock('../../api/magic-link.api', () => ({
  peekMagicLink: (...args: unknown[]) => mockPeekMagicLink(...args),
}));

import MagicLinkLandingPage from '../MagicLinkLandingPage';
import { ApiError } from '../../../../lib/api-client';

interface RenderOptions {
  token?: string | null;
  purpose?: string | null;
}

function renderAt({ token, purpose }: RenderOptions = {}) {
  const params = new URLSearchParams();
  if (token != null) params.set('token', token);
  if (purpose != null) params.set('purpose', purpose);
  const path = `/auth/magic${params.toString() ? `?${params.toString()}` : ''}`;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/magic" element={<MagicLinkLandingPage />} />
        <Route
          path="/register"
          element={<div data-testid="redirected-register">register</div>}
        />
        <Route
          path="/register/complete-nin"
          element={<div data-testid="redirected-complete-nin">complete-nin</div>}
        />
        <Route path="/login" element={<div data-testid="redirected-login">login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MagicLinkLandingPage (Story 9-12 MR-8)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Missing or malformed URL params', () => {
    it('renders the incomplete-link card when token is absent', () => {
      renderAt({ purpose: 'wizard_resume' });
      expect(screen.getByTestId('magic-link-missing-params')).toBeInTheDocument();
      expect(screen.getByText(/Link incomplete/i)).toBeInTheDocument();
      expect(mockPeekMagicLink).not.toHaveBeenCalled();
    });

    it('renders the incomplete-link card when purpose is absent', () => {
      renderAt({ token: 'tok-1' });
      expect(screen.getByTestId('magic-link-missing-params')).toBeInTheDocument();
      expect(mockPeekMagicLink).not.toHaveBeenCalled();
    });

    it('renders the incomplete-link card when purpose is unknown', () => {
      renderAt({ token: 'tok-1', purpose: 'definitely-not-a-purpose' });
      expect(screen.getByTestId('magic-link-missing-params')).toBeInTheDocument();
      expect(mockPeekMagicLink).not.toHaveBeenCalled();
    });
  });

  describe('Peek succeeds (wizard_resume)', () => {
    it('renders the confirmation card with email + per-purpose copy', async () => {
      mockPeekMagicLink.mockResolvedValueOnce({
        tokenId: 'tid-1',
        purpose: 'wizard_resume',
        email: 'awwal@example.com',
        userId: null,
        respondentId: null,
        requiresConsume: true,
      });

      renderAt({ token: 'good-token', purpose: 'wizard_resume' });

      await waitFor(() => {
        expect(screen.getByTestId('magic-link-confirm')).toBeInTheDocument();
      });
      expect(screen.getByText(/Resume your registration/i)).toBeInTheDocument();
      expect(screen.getByTestId('magic-link-confirm-email')).toHaveTextContent(
        'awwal@example.com',
      );
      expect(screen.getByTestId('magic-link-confirm-button')).toHaveTextContent(
        'Continue registration',
      );
    });

    it('routes to /register?token=… on Continue (no consume call from landing page)', async () => {
      mockPeekMagicLink.mockResolvedValueOnce({
        tokenId: 'tid-2',
        purpose: 'wizard_resume',
        email: 'awwal@example.com',
        userId: null,
        respondentId: null,
        requiresConsume: true,
      });

      renderAt({ token: 'tok-wizard', purpose: 'wizard_resume' });
      await waitFor(() => expect(screen.getByTestId('magic-link-confirm-button')).toBeInTheDocument());

      await userEvent.click(screen.getByTestId('magic-link-confirm-button'));

      await waitFor(() => {
        expect(screen.getByTestId('redirected-register')).toBeInTheDocument();
      });
    });
  });

  describe('Peek succeeds (pending_nin_complete)', () => {
    it('renders the pending-NIN-specific copy', async () => {
      mockPeekMagicLink.mockResolvedValueOnce({
        tokenId: 'tid-3',
        purpose: 'pending_nin_complete',
        email: 'pending@example.com',
        userId: null,
        respondentId: 'resp-1',
        requiresConsume: true,
      });

      renderAt({ token: 'tok-pending', purpose: 'pending_nin_complete' });

      await waitFor(() => {
        expect(screen.getByTestId('magic-link-confirm')).toBeInTheDocument();
      });
      expect(screen.getByText(/Add your NIN to complete registration/i)).toBeInTheDocument();
      expect(screen.getByTestId('magic-link-confirm-button')).toHaveTextContent('Add my NIN');
    });

    it('routes to /register/complete-nin?token=… on Continue', async () => {
      mockPeekMagicLink.mockResolvedValueOnce({
        tokenId: 'tid-4',
        purpose: 'pending_nin_complete',
        email: 'pending@example.com',
        userId: null,
        respondentId: 'resp-1',
        requiresConsume: true,
      });

      renderAt({ token: 'tok-pending', purpose: 'pending_nin_complete' });
      await waitFor(() => expect(screen.getByTestId('magic-link-confirm-button')).toBeInTheDocument());

      await userEvent.click(screen.getByTestId('magic-link-confirm-button'));

      await waitFor(() => {
        expect(screen.getByTestId('redirected-complete-nin')).toBeInTheDocument();
      });
    });
  });

  describe('Peek succeeds (login purpose — deferred)', () => {
    it('renders the deferred-login notice (NOT the confirm CTA)', async () => {
      mockPeekMagicLink.mockResolvedValueOnce({
        tokenId: 'tid-5',
        purpose: 'login',
        email: 'existing@example.com',
        userId: 'user-1',
        respondentId: null,
        requiresConsume: true,
      });

      renderAt({ token: 'tok-login', purpose: 'login' });

      await waitFor(() => {
        expect(screen.getByTestId('magic-link-login-deferred')).toBeInTheDocument();
      });
      expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
      expect(screen.getByTestId('magic-link-login-email')).toHaveTextContent(
        'existing@example.com',
      );
      expect(screen.queryByTestId('magic-link-confirm-button')).not.toBeInTheDocument();
    });
  });

  describe('Peek fails', () => {
    it('renders the expired-link error UI', async () => {
      mockPeekMagicLink.mockRejectedValueOnce(
        new ApiError('This magic link has expired', 400, 'MAGIC_LINK_EXPIRED'),
      );

      renderAt({ token: 'expired', purpose: 'wizard_resume' });

      await waitFor(() => expect(screen.getByTestId('magic-link-error')).toBeInTheDocument());
      expect(screen.getByText(/This link has expired/i)).toBeInTheDocument();
    });

    it('renders the already-used error UI', async () => {
      mockPeekMagicLink.mockRejectedValueOnce(
        new ApiError('This magic link has already been used', 400, 'MAGIC_LINK_ALREADY_USED'),
      );

      renderAt({ token: 'used', purpose: 'pending_nin_complete' });

      await waitFor(() => expect(screen.getByTestId('magic-link-error')).toBeInTheDocument());
      expect(screen.getByText(/already been used/i)).toBeInTheDocument();
    });

    it('renders the invalid error UI for unknown tokens', async () => {
      mockPeekMagicLink.mockRejectedValueOnce(
        new ApiError('Invalid or unknown magic-link token', 400, 'MAGIC_LINK_INVALID'),
      );

      renderAt({ token: 'unknown', purpose: 'wizard_resume' });

      await waitFor(() => expect(screen.getByTestId('magic-link-error')).toBeInTheDocument());
      expect(screen.getByText(/This link is invalid/i)).toBeInTheDocument();
    });

    it('falls back to the network-error copy for non-ApiError failures', async () => {
      mockPeekMagicLink.mockRejectedValueOnce(new Error('boom'));

      renderAt({ token: 'tok', purpose: 'wizard_resume' });

      await waitFor(() => expect(screen.getByTestId('magic-link-error')).toBeInTheDocument());
      expect(screen.getByText(/couldn't reach our servers/i)).toBeInTheDocument();
    });
  });
});

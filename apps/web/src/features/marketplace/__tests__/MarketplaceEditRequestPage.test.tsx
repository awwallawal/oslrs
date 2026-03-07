// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

expect.extend(matchers);

// ── Mock state ──────────────────────────────────────────────────────────────

const mockRequestEditToken = vi.fn();

// ── Mock modules ────────────────────────────────────────────────────────────

vi.mock('../api/marketplace.api', () => ({
  requestEditToken: (...args: any[]) => mockRequestEditToken(...args),
}));

vi.mock('../../auth/components/HCaptcha', () => ({
  HCaptcha: ({ onVerify, onExpire, onError }: any) => (
    <div data-testid="hcaptcha-mock">
      <button data-testid="captcha-solve" onClick={() => onVerify('test-captcha-token')}>Solve</button>
      <button data-testid="captcha-expire" onClick={() => onExpire?.()}>Expire</button>
      <button data-testid="captcha-error" onClick={() => onError?.('captcha-error')}>Error</button>
    </div>
  ),
}));

vi.mock('../../../lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// ── Import SUT ──────────────────────────────────────────────────────────────

import MarketplaceEditRequestPage from '../pages/MarketplaceEditRequestPage';
import { ApiError } from '../../../lib/api-client';

// ── Helpers ─────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/marketplace/edit-request']}>
      <MarketplaceEditRequestPage />
    </MemoryRouter>,
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MarketplaceEditRequestPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestEditToken.mockResolvedValue({ message: 'success' });
  });

  afterEach(cleanup);

  it('should render phone input and submit button', () => {
    renderPage();

    expect(screen.getByTestId('phone-input')).toBeInTheDocument();
    expect(screen.getByTestId('submit-button')).toBeInTheDocument();
    expect(screen.getByText('Edit Your Marketplace Profile')).toBeInTheDocument();
  });

  it('should disable submit button when phone number is too short', () => {
    renderPage();

    const input = screen.getByTestId('phone-input');
    fireEvent.change(input, { target: { value: '12345' } });

    expect(screen.getByTestId('submit-button')).toBeDisabled();
  });

  it('should enable submit button when phone number is valid', () => {
    renderPage();

    const input = screen.getByTestId('phone-input');
    fireEvent.change(input, { target: { value: '+2348012345678' } });

    expect(screen.getByTestId('submit-button')).not.toBeDisabled();
  });

  it('should show CAPTCHA after submit click', () => {
    renderPage();

    const input = screen.getByTestId('phone-input');
    fireEvent.change(input, { target: { value: '+2348012345678' } });
    fireEvent.click(screen.getByTestId('submit-button'));

    expect(screen.getByTestId('captcha-widget')).toBeInTheDocument();
  });

  it('should send POST request after CAPTCHA solve', async () => {
    renderPage();

    const input = screen.getByTestId('phone-input');
    fireEvent.change(input, { target: { value: '+2348012345678' } });
    fireEvent.click(screen.getByTestId('submit-button'));
    fireEvent.click(screen.getByTestId('captcha-solve'));

    await waitFor(() => {
      expect(mockRequestEditToken).toHaveBeenCalledWith('+2348012345678', 'test-captcha-token');
    });
  });

  it('should show success message after successful submit', async () => {
    renderPage();

    const input = screen.getByTestId('phone-input');
    fireEvent.change(input, { target: { value: '+2348012345678' } });
    fireEvent.click(screen.getByTestId('submit-button'));
    fireEvent.click(screen.getByTestId('captcha-solve'));

    await waitFor(() => {
      expect(screen.getByTestId('success-message')).toBeInTheDocument();
    });
  });

  it('should show rate limit message on 429 error', async () => {
    mockRequestEditToken.mockRejectedValue(new ApiError('Rate limited', 429));

    renderPage();

    const input = screen.getByTestId('phone-input');
    fireEvent.change(input, { target: { value: '+2348012345678' } });
    fireEvent.click(screen.getByTestId('submit-button'));
    fireEvent.click(screen.getByTestId('captcha-solve'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
      expect(screen.getByText('Too many requests. Please try again later.')).toBeInTheDocument();
    });
  });

  it('should show generic error on non-429 failure', async () => {
    mockRequestEditToken.mockRejectedValue(new Error('Network error'));

    renderPage();

    const input = screen.getByTestId('phone-input');
    fireEvent.change(input, { target: { value: '+2348012345678' } });
    fireEvent.click(screen.getByTestId('submit-button'));
    fireEvent.click(screen.getByTestId('captcha-solve'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });
  });

  it('should strip spaces from phone number before sending', async () => {
    renderPage();

    const input = screen.getByTestId('phone-input');
    fireEvent.change(input, { target: { value: '+234 801 234 5678' } });
    fireEvent.click(screen.getByTestId('submit-button'));
    fireEvent.click(screen.getByTestId('captcha-solve'));

    await waitFor(() => {
      expect(mockRequestEditToken).toHaveBeenCalledWith('+2348012345678', 'test-captcha-token');
    });
  });
});

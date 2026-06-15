import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../../../lib/api-client';

expect.extend(matchers);

const mockRequest = vi.fn();

// Mock the public api client (path relative to THIS test file).
vi.mock('../../api/registration-status.api', () => ({
  requestRegistrationStatus: (...args: unknown[]) => mockRequest(...args),
}));

// Stub the hCaptcha widget — render a button that "verifies" with a token,
// mirroring the real component's onVerify contract (no iframe in jsdom).
// `reset` is surfaced as a data attribute so error-branch tests can assert the
// component toggled the captcha reset (the page flips `captchaReset` on failure).
vi.mock('../../../auth/components/HCaptcha', () => ({
  HCaptcha: ({
    onVerify,
    error,
    reset,
  }: {
    onVerify: (t: string) => void;
    error?: string;
    reset?: boolean;
  }) => (
    <div data-testid="mock-captcha-wrapper" data-reset={String(reset)}>
      <button type="button" onClick={() => onVerify('captcha-token')} data-testid="mock-captcha">
        verify captcha
      </button>
      {error && <span data-testid="mock-captcha-error">{error}</span>}
    </div>
  ),
}));

const { default: CheckRegistrationPage } = await import('../CheckRegistrationPage');

function renderPage() {
  return render(
    <MemoryRouter>
      <CheckRegistrationPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequest.mockResolvedValue(undefined);
});

describe('CheckRegistrationPage (Story 9-58)', () => {
  it('renders the single-input form + captcha + submit', () => {
    renderPage();
    expect(screen.getByTestId('check-registration-input')).toBeInTheDocument();
    expect(screen.getByTestId('mock-captcha')).toBeInTheDocument();
    expect(screen.getByTestId('check-registration-submit')).toBeInTheDocument();
  });

  it('submits the identifier + captcha token and shows the neutral result', async () => {
    renderPage();
    fireEvent.change(screen.getByTestId('check-registration-input'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.click(screen.getByTestId('mock-captcha'));
    fireEvent.click(screen.getByTestId('check-registration-submit'));

    await waitFor(() => expect(screen.getByTestId('check-registration-result')).toBeInTheDocument());
    expect(mockRequest).toHaveBeenCalledWith({
      identifier: 'jane@example.com',
      captchaToken: 'captcha-token',
    });
    // The result is neutral — never reveals status / existence.
    expect(screen.getByTestId('check-registration-result').textContent).toMatch(/if you're in our registry/i);
  });

  it('requires the captcha before calling the API', async () => {
    renderPage();
    fireEvent.change(screen.getByTestId('check-registration-input'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.click(screen.getByTestId('check-registration-submit'));

    await waitFor(() => expect(screen.getByTestId('mock-captcha-error')).toBeInTheDocument());
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('validates a too-short identifier client-side', async () => {
    renderPage();
    fireEvent.change(screen.getByTestId('check-registration-input'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByTestId('mock-captcha'));
    fireEvent.click(screen.getByTestId('check-registration-submit'));

    await waitFor(() => expect(screen.getByTestId('check-registration-error')).toBeInTheDocument());
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('renders the rate-limit message and resets the captcha on a 429', async () => {
    mockRequest.mockRejectedValueOnce(new ApiError('Too many requests', 429, 'RATE_LIMITED'));
    renderPage();

    // Captcha starts un-reset.
    expect(screen.getByTestId('mock-captcha-wrapper')).toHaveAttribute('data-reset', 'false');

    fireEvent.change(screen.getByTestId('check-registration-input'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.click(screen.getByTestId('mock-captcha'));
    fireEvent.click(screen.getByTestId('check-registration-submit'));

    // The API WAS called (this is a server-side rejection, not a client guard).
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));

    // Rate-limit-specific copy renders…
    const errorEl = await screen.findByTestId('check-registration-error');
    expect(errorEl.textContent).toMatch(/too many requests/i);
    // …and we stayed on the form (never advanced to the neutral done screen).
    expect(screen.queryByTestId('check-registration-result')).not.toBeInTheDocument();
    // …and the single-use captcha token was reset for the retry.
    expect(screen.getByTestId('mock-captcha-wrapper')).toHaveAttribute('data-reset', 'true');
  });

  it('renders a generic error and resets the captcha on an unexpected failure', async () => {
    mockRequest.mockRejectedValueOnce(new ApiError('Server exploded', 500, 'INTERNAL'));
    renderPage();

    fireEvent.change(screen.getByTestId('check-registration-input'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.click(screen.getByTestId('mock-captcha'));
    fireEvent.click(screen.getByTestId('check-registration-submit'));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));

    const errorEl = await screen.findByTestId('check-registration-error');
    expect(errorEl.textContent).toMatch(/something went wrong/i);
    expect(screen.queryByTestId('check-registration-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-captcha-wrapper')).toHaveAttribute('data-reset', 'true');
  });

  it('"try again" on the done screen returns to the input form', async () => {
    renderPage();
    fireEvent.change(screen.getByTestId('check-registration-input'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.click(screen.getByTestId('mock-captcha'));
    fireEvent.click(screen.getByTestId('check-registration-submit'));

    // Land on the neutral done screen.
    await waitFor(() =>
      expect(screen.getByTestId('check-registration-result')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('check-registration-form')).not.toBeInTheDocument();

    // Click the "try again" reset button.
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // Back on the input form, and the result screen is gone.
    await waitFor(() =>
      expect(screen.getByTestId('check-registration-form')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('check-registration-result')).not.toBeInTheDocument();
    // The identifier field was cleared by the reset handler.
    expect(screen.getByTestId('check-registration-input')).toHaveValue('');
  });
});

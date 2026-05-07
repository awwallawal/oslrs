// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

expect.extend(matchers);

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: vi.fn(),
}));

vi.mock('../../../lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import SettingsLandingPage from '../pages/SettingsLandingPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettingsLandingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sampleSetting = {
  key: 'auth.sms_otp_enabled',
  value: false,
  description: 'When true, SMS OTP becomes available for public-user auth.',
  updatedBy: '00000000-0000-0000-0000-000000000001',
  updatedAt: '2026-05-06T00:00:00.000Z',
  createdAt: '2026-05-06T00:00:00.000Z',
};

describe('SettingsLandingPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows skeleton during initial load', () => {
    mockApiClient.mockImplementation(() => new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByTestId('settings-loading')).toBeInTheDocument();
  });

  it('renders all 3 v1 cards on success', async () => {
    mockApiClient.mockResolvedValueOnce({ settings: [sampleSetting] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('setting-card-sms-otp')).toBeInTheDocument();
    });
    expect(screen.getByTestId('setting-card-fraud-thresholds')).toBeInTheDocument();
    expect(screen.getByTestId('setting-card-mfa')).toBeInTheDocument();
    expect(screen.getByTestId('settings-footer-note')).toHaveTextContent('More settings coming soon');
  });

  it('renders SMS OTP toggle in OFF state when value is false', async () => {
    mockApiClient.mockResolvedValueOnce({ settings: [sampleSetting] });
    renderPage();
    const toggle = await screen.findByTestId('sms-otp-toggle');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('renders SMS OTP toggle in ON state when value is true', async () => {
    mockApiClient.mockResolvedValueOnce({
      settings: [{ ...sampleSetting, value: true }],
    });
    renderPage();
    const toggle = await screen.findByTestId('sms-otp-toggle');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('shows audit metadata under the SMS OTP toggle', async () => {
    mockApiClient.mockResolvedValueOnce({ settings: [sampleSetting] });
    renderPage();
    await screen.findByTestId('setting-card-sms-otp');
    expect(screen.getByText(/Last changed by/)).toBeInTheDocument();
    expect(
      screen.getByText(/00000000-0000-0000-0000-000000000001/),
    ).toBeInTheDocument();
  });

  it('shows error banner with retry on failed list call', async () => {
    mockApiClient.mockRejectedValueOnce(new Error('Network down'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('settings-error')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('flips the SMS OTP toggle and calls PATCH endpoint', async () => {
    mockApiClient
      .mockResolvedValueOnce({ settings: [sampleSetting] }) // initial GET
      .mockResolvedValueOnce(null) // PATCH 204
      .mockResolvedValueOnce({ settings: [{ ...sampleSetting, value: true }] }); // refetch

    renderPage();
    const toggle = await screen.findByTestId('sms-otp-toggle');
    await userEvent.click(toggle);

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalledWith(
        '/admin/settings/auth.sms_otp_enabled',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ value: true }),
        }),
      );
    });
  });

  it('Fraud Thresholds card links to existing page (URL preserved)', async () => {
    mockApiClient.mockResolvedValueOnce({ settings: [sampleSetting] });
    renderPage();
    const card = await screen.findByTestId('setting-card-fraud-thresholds');
    const link = card.closest('a');
    expect(link).toHaveAttribute('href', '/dashboard/super-admin/settings/fraud-thresholds');
  });

  it('MFA Settings card links to Story 9-13 page', async () => {
    mockApiClient.mockResolvedValueOnce({ settings: [sampleSetting] });
    renderPage();
    const card = await screen.findByTestId('setting-card-mfa');
    const link = card.closest('a');
    expect(link).toHaveAttribute('href', '/dashboard/super-admin/security/mfa');
  });
});

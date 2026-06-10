// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('renders the v1 control + link cards on success', async () => {
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

  // ── Story 9-17: Public Wizard Form read-only mirror card ────────────────
  const wizardSetting = {
    key: 'wizard.public_form_id',
    value: 'form-uuid-123',
    description: 'UUID of the public-wizard form.',
    updatedBy: '00000000-0000-0000-0000-000000000002',
    updatedAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-05-11T00:00:00.000Z',
  };

  const pinnedForm = {
    id: 'form-uuid-123',
    formId: 'reg-form',
    title: 'Skills Registration',
    version: '3.0',
    status: 'published',
    uploadedAt: '2026-05-20T00:00:00.000Z',
  };

  /** Resolve the settings list + (when a form is pinned) the form detail call. */
  function mockSettingsAndForm(settings: unknown[], form?: unknown) {
    mockApiClient.mockImplementation((path: unknown) => {
      if (typeof path === 'string' && path.startsWith('/questionnaires/')) {
        return Promise.resolve({ data: form });
      }
      return Promise.resolve({ settings });
    });
  }

  it('renders the Public Wizard Form mirror card', async () => {
    mockSettingsAndForm([sampleSetting]);
    renderPage();
    expect(
      await screen.findByTestId('settings-public-wizard-form-card'),
    ).toBeInTheDocument();
  });

  it('shows the pinned form title + version when a form is pinned', async () => {
    mockSettingsAndForm([sampleSetting, wizardSetting], pinnedForm);
    renderPage();
    const card = await screen.findByTestId('settings-public-wizard-form-card');
    await waitFor(() => {
      expect(card).toHaveTextContent('Skills Registration');
    });
    expect(card).toHaveTextContent('v3.0');
  });

  it('shows "None" when no form is pinned', async () => {
    mockSettingsAndForm([sampleSetting]);
    renderPage();
    const card = await screen.findByTestId('settings-public-wizard-form-card');
    expect(card).toHaveTextContent(/None — no form is active for the public wizard/);
  });

  it('Public Wizard Form card links to the Questionnaire Management page', async () => {
    mockSettingsAndForm([sampleSetting]);
    renderPage();
    const card = await screen.findByTestId('settings-public-wizard-form-card');
    const link = within(card).getByRole('link', { name: /Manage in Questionnaires/i });
    expect(link).toHaveAttribute('href', '/dashboard/super-admin/questionnaires');
  });

  it('mirror card is read-only — no Pin / Unpin affordances', async () => {
    mockSettingsAndForm([sampleSetting, wizardSetting], pinnedForm);
    renderPage();
    const card = await screen.findByTestId('settings-public-wizard-form-card');
    expect(within(card).queryByTestId('qm-pin-button')).not.toBeInTheDocument();
    expect(within(card).queryByTestId('qm-unpin-button')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /pin/i })).not.toBeInTheDocument();
  });

  // Story 9-17 code-review (2026-06-10) L1: cover the two PublicWizardFormCard
  // branches the original AC#A8 tests missed — unresolved-id fallback + loading.
  it('falls back to the raw pinned id when the form no longer resolves', async () => {
    // Pinned id is set, but the form fetch resolves with no form (archived/deleted).
    mockSettingsAndForm([sampleSetting, wizardSetting]); // no form arg → { data: undefined }
    renderPage();
    const card = await screen.findByTestId('settings-public-wizard-form-card');
    await waitFor(() => {
      expect(card).toHaveTextContent('form-uuid-123');
    });
  });

  it('shows a loading hint while the pinned form is being fetched', async () => {
    mockApiClient.mockImplementation((path: unknown) => {
      if (typeof path === 'string' && path.startsWith('/questionnaires/')) {
        return new Promise(() => {}); // form fetch never resolves
      }
      return Promise.resolve({ settings: [sampleSetting, wizardSetting] });
    });
    renderPage();
    const card = await screen.findByTestId('settings-public-wizard-form-card');
    await waitFor(() => {
      expect(card).toHaveTextContent(/Loading pinned form/);
    });
  });
});

// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { OpsDashboardSnapshot } from '@oslsr/types';

expect.extend(matchers);

const { mockApiClient } = vi.hoisted(() => ({ mockApiClient: vi.fn() }));

vi.mock('../../../../lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

import OperationsDashboardPage from '../OperationsDashboardPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OperationsDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function snapshot(overrides?: Partial<OpsDashboardSnapshot>): OpsDashboardSnapshot {
  return {
    generatedAt: '2026-06-01T08:00:00.000Z',
    system: {
      pm2Uptime: '2d 3h', pm2RestartCount: 0, pm2Memory: '300 MB', pm2CpuPct: 4,
      osUptime: '2d', loadAvg1m: 0.2, loadAvg5m: 0.2, loadAvg15m: 0.2,
      ramUsedMb: 800, ramTotalMb: 2000, ramUsedPct: 40,
      diskUsedGb: 10, diskTotalGb: 50, diskUsedPct: 20,
    },
    traffic: {
      totalRespondents: 20, respondentsActive: 12, respondentsPending: 3,
      totalDrafts: 100, draftsLast24h: 5,
      funnel: [{ step: 1, drafts: 20 }, { step: 4, drafts: 63 }],
      step4StallPct: 63, magicLinksIssued: 40, magicLinksConsumed: 30, topAuditActions: [],
    },
    resend: { recentCount: 10, delivered: 9, bounced: 0, complained: 0, todayCount: 5, last5: [] },
    queue: { waiting: 0, active: 0, completed: 10, failed: 0, delayed: 0, failedSamples: [] },
    notificationUsage: {
      date: '2026-06-22',
      month: '2026-06',
      today: {
        email: { total: 42, byCategory: [{ category: 'magiclink-login', count: 30 }], bounced: 1, complained: 0 },
        sms: { total: 3, byCategory: [], bounced: 0, complained: 0 },
      },
      thisMonth: {
        email: { total: 900, byCategory: [], bounced: 0, complained: 0 },
        sms: { total: 10, byCategory: [], bounced: 0, complained: 0 },
      },
    },
    recommendations: [{ severity: 'red', key: 'step4-stall', text: 'Step-4 stall 63% — Story 9-17 is critical-path.' }],
    ...overrides,
  };
}

describe('OperationsDashboardPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows skeleton during initial load', () => {
    mockApiClient.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('ops-loading')).toBeInTheDocument();
  });

  it('renders all 6 cards on success', async () => {
    mockApiClient.mockResolvedValueOnce({ data: snapshot() });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('ops-card-system')).toBeInTheDocument());
    expect(screen.getByTestId('ops-card-adoption')).toBeInTheDocument();
    expect(screen.getByTestId('ops-card-email')).toBeInTheDocument();
    expect(screen.getByTestId('ops-card-queue')).toBeInTheDocument();
    expect(screen.getByTestId('ops-card-notification-usage')).toBeInTheDocument();
    expect(screen.getByTestId('ops-card-recommendations')).toBeInTheDocument();
  });

  it('renders the notification usage card with email + sms totals (AC3)', async () => {
    mockApiClient.mockResolvedValueOnce({ data: snapshot() });
    renderPage();
    const card = await screen.findByTestId('ops-card-notification-usage');
    expect(card).toHaveTextContent('42 sent');
    expect(card).toHaveTextContent('magiclink-login');
    expect(card).toHaveTextContent('1 bounced');
  });

  it('shows a yellow notification dot when there are bounces/complaints', async () => {
    mockApiClient.mockResolvedValueOnce({ data: snapshot() });
    renderPage();
    const dot = await screen.findByTestId('ops-notification-dot');
    expect(dot).toHaveAttribute('data-level', 'yellow');
  });

  it('renders the notification section-unavailable placeholder when usage is null', async () => {
    mockApiClient.mockResolvedValueOnce({ data: snapshot({ notificationUsage: null }) });
    renderPage();
    expect(await screen.findByTestId('ops-notification-unavailable')).toBeInTheDocument();
  });

  it('colours the adoption status dot red for a 63% Step-4 stall', async () => {
    mockApiClient.mockResolvedValueOnce({ data: snapshot() });
    renderPage();
    const dot = await screen.findByTestId('ops-adoption-dot');
    expect(dot).toHaveAttribute('data-level', 'red');
  });

  it('renders the red recommendation with severity binding', async () => {
    mockApiClient.mockResolvedValueOnce({ data: snapshot() });
    renderPage();
    const rec = await screen.findByTestId('ops-rec-step4-stall');
    expect(rec).toHaveAttribute('data-severity', 'red');
    expect(rec).toHaveTextContent('9-17');
  });

  it('shows the healthy note when there are no recommendations', async () => {
    mockApiClient.mockResolvedValueOnce({ data: snapshot({ recommendations: [] }) });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('ops-recs-healthy')).toBeInTheDocument());
  });

  it('renders a section-unavailable placeholder when a section is null', async () => {
    mockApiClient.mockResolvedValueOnce({ data: snapshot({ system: null }) });
    renderPage();
    expect(await screen.findByTestId('ops-system-unavailable')).toBeInTheDocument();
  });

  it('shows the error banner on a failed fetch', async () => {
    mockApiClient.mockRejectedValueOnce(new Error('Network down'));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('ops-error')).toBeInTheDocument());
  });

  it('manual refresh calls the forced (cache-bypass) endpoint', async () => {
    mockApiClient.mockResolvedValue({ data: snapshot() });
    renderPage();
    await screen.findByTestId('ops-card-system');

    await userEvent.click(screen.getByTestId('ops-refresh-button'));

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalledWith('/admin/operations/dashboard?force=1');
    });
  });
});

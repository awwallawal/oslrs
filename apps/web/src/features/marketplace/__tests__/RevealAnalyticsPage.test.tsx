// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

expect.extend(matchers);

// ── Hoisted mocks ──────────────────────────────────────────────────────

const {
  mockGetRevealStats, mockGetTopViewers, mockGetTopProfiles, mockGetSuspiciousDevices,
} = vi.hoisted(() => ({
  mockGetRevealStats: vi.fn(),
  mockGetTopViewers: vi.fn(),
  mockGetTopProfiles: vi.fn(),
  mockGetSuspiciousDevices: vi.fn(),
}));

vi.mock('../api/reveal-analytics.api', () => ({
  getRevealStats: (...args: any[]) => mockGetRevealStats(...args),
  getTopViewers: (...args: any[]) => mockGetTopViewers(...args),
  getTopProfiles: (...args: any[]) => mockGetTopProfiles(...args),
  getSuspiciousDevices: (...args: any[]) => mockGetSuspiciousDevices(...args),
}));

// ── Import SUT ─────────────────────────────────────────────────────────

import RevealAnalyticsPage from '../pages/RevealAnalyticsPage';

// ── Helpers ────────────────────────────────────────────────────────────

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RevealAnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sampleStats = {
  total24h: 12,
  total7d: 85,
  total30d: 340,
  uniqueViewers24h: 8,
  uniqueProfiles24h: 15,
};

const sampleViewers = [
  { viewerId: '018e1234-5678-7000-8000-000000000001', revealCount: 10, distinctProfiles: 5, lastRevealAt: '2026-03-07T10:00:00Z' },
];

const sampleProfiles = [
  { profileId: '018e5678-1234-7000-8000-000000000001', revealCount: 8, distinctViewers: 6, lastRevealAt: '2026-03-07T09:00:00Z' },
];

const sampleDevices = [
  { deviceFingerprint: 'fp_abc123def456', accountCount: 3, totalReveals: 15, lastSeenAt: '2026-03-07T08:00:00Z' },
];

// ── Tests ──────────────────────────────────────────────────────────────

describe('RevealAnalyticsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetRevealStats.mockResolvedValue(sampleStats);
    mockGetTopViewers.mockResolvedValue(sampleViewers);
    mockGetTopProfiles.mockResolvedValue(sampleProfiles);
    mockGetSuspiciousDevices.mockResolvedValue(sampleDevices);
  });

  it('renders page title', async () => {
    renderPage();
    expect(await screen.findByText('Contact Reveal Analytics')).toBeInTheDocument();
  });

  it('renders stat cards with correct values', async () => {
    renderPage();

    const stat24h = await screen.findByTestId('stat-24h');
    expect(within(stat24h).getByText('12')).toBeInTheDocument();
    expect(within(stat24h).getByText('Reveals (24h)')).toBeInTheDocument();

    const stat7d = screen.getByTestId('stat-7d');
    expect(within(stat7d).getByText('85')).toBeInTheDocument();

    const stat30d = screen.getByTestId('stat-30d');
    expect(within(stat30d).getByText('340')).toBeInTheDocument();

    const statViewers = screen.getByTestId('stat-viewers');
    expect(within(statViewers).getByText('8')).toBeInTheDocument();

    const statProfiles = screen.getByTestId('stat-profiles');
    expect(within(statProfiles).getByText('15')).toBeInTheDocument();
  });

  it('renders top viewers table', async () => {
    renderPage();

    const table = await screen.findByTestId('top-viewers-table');
    expect(table).toBeInTheDocument();
    expect(within(table).getByText('10')).toBeInTheDocument();
    expect(within(table).getByText('5')).toBeInTheDocument();
  });

  it('renders top profiles table', async () => {
    renderPage();

    const table = await screen.findByTestId('top-profiles-table');
    expect(table).toBeInTheDocument();
    expect(within(table).getByText('8')).toBeInTheDocument();
    expect(within(table).getByText('6')).toBeInTheDocument();
  });

  it('renders suspicious devices section', async () => {
    renderPage();

    const grid = await screen.findByTestId('suspicious-devices-grid');
    expect(grid).toBeInTheDocument();

    const card = within(grid).getByTestId('suspicious-device-card');
    expect(within(card).getByText('3')).toBeInTheDocument();
    expect(within(card).getByText('15')).toBeInTheDocument();
  });

  it('renders empty states when no data', async () => {
    mockGetTopViewers.mockResolvedValue([]);
    mockGetTopProfiles.mockResolvedValue([]);
    mockGetSuspiciousDevices.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByTestId('viewers-empty')).toBeInTheDocument();
    expect(screen.getByTestId('profiles-empty')).toBeInTheDocument();
    expect(screen.getByTestId('devices-empty')).toBeInTheDocument();
  });

  it('renders loading skeletons during fetch', () => {
    // Make queries never resolve
    mockGetRevealStats.mockReturnValue(new Promise(() => {}));
    mockGetTopViewers.mockReturnValue(new Promise(() => {}));
    mockGetTopProfiles.mockReturnValue(new Promise(() => {}));
    mockGetSuspiciousDevices.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('stats-skeleton')).toBeInTheDocument();
  });

  it('renders period selector', async () => {
    renderPage();

    const selector = await screen.findByTestId('period-selector');
    expect(selector).toBeInTheDocument();
  });

  it('highlights 3+ account suspicious devices in red', async () => {
    renderPage();

    const card = await screen.findByTestId('suspicious-device-card');
    expect(card.className).toContain('border-l-red-500');
    expect(card.className).toContain('bg-red-50');
  });

  it('highlights 2-account suspicious devices in amber', async () => {
    mockGetSuspiciousDevices.mockResolvedValue([
      { deviceFingerprint: 'fp_amber', accountCount: 2, totalReveals: 5, lastSeenAt: '2026-03-07T08:00:00Z' },
    ]);

    renderPage();

    const card = await screen.findByTestId('suspicious-device-card');
    expect(card.className).toContain('border-l-amber-500');
    expect(card.className).toContain('bg-amber-50');
  });
});

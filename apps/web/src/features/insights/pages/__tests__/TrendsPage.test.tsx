// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { PublicTrendsData } from '@oslsr/types';

expect.extend(matchers);
afterEach(() => cleanup());

const mockTrends = vi.hoisted(() => ({
  data: null as PublicTrendsData | null,
  isLoading: true,
  error: null as Error | null,
  refetch: vi.fn(),
}));

const mockInsightsForMethodology = vi.hoisted(() => ({
  data: { totalRegistered: 5000, lastUpdated: '2026-03-13T10:00:00.000Z' } as any,
}));

vi.mock('../../hooks/usePublicInsights', () => ({
  usePublicTrends: () => mockTrends,
  usePublicInsights: () => mockInsightsForMethodology,
}));

vi.mock('../../../../hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

// Mock recharts — don't render children to avoid SVG-in-div warnings
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="chart-container">{children}</div>,
  AreaChart: () => <div data-testid="area-chart" />,
  Area: () => null,
  BarChart: () => <div data-testid="bar-chart" />,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

import TrendsPage from '../TrendsPage';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TrendsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TrendsPage', () => {
  it('shows loading skeletons when loading', () => {
    mockTrends.isLoading = true;
    mockTrends.data = null;
    mockTrends.error = null;
    renderPage();
    expect(document.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });

  it('renders chart when data loads', () => {
    mockTrends.isLoading = false;
    mockTrends.data = {
      dailyRegistrations: [
        { date: '2026-03-01', count: 25 },
        { date: '2026-03-02', count: 30 },
      ],
      employmentByWeek: [],
      totalDays: 2,
      lastUpdated: '2026-03-13T10:00:00.000Z',
    };
    mockTrends.error = null;
    renderPage();
    expect(screen.getByText('Registration Trends')).toBeInTheDocument();
    expect(screen.getByText(/cumulative registrations/i)).toBeInTheDocument();
  });

  it('handles suppressed days without errors', () => {
    mockTrends.isLoading = false;
    mockTrends.data = {
      dailyRegistrations: [
        { date: '2026-03-01', count: 20 },
        { date: '2026-03-02', count: null },
        { date: '2026-03-03', count: 15 },
      ],
      employmentByWeek: [],
      totalDays: 3,
      lastUpdated: '2026-03-13T10:00:00.000Z',
    };
    mockTrends.error = null;
    renderPage();
    expect(screen.getByText('Registration Trends')).toBeInTheDocument();
  });

  it('shows error state with retry', () => {
    mockTrends.isLoading = false;
    mockTrends.data = null;
    mockTrends.error = new Error('Connection failed');
    renderPage();
    expect(screen.getByText(/unable to load trends/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders employment breakdown chart when data available', () => {
    mockTrends.isLoading = false;
    mockTrends.data = {
      dailyRegistrations: [
        { date: '2026-03-01', count: 25 },
      ],
      employmentByWeek: [
        { week: '2026-03-03', employed: 15, unemployedSeeking: 5, temporarilyAbsent: null, other: null },
      ],
      totalDays: 1,
      lastUpdated: '2026-03-13T10:00:00.000Z',
    };
    mockTrends.error = null;
    renderPage();
    expect(screen.getByText('Employment Type Breakdown')).toBeInTheDocument();
    expect(screen.getByText(/weekly breakdown/i)).toBeInTheDocument();
  });

  it('renders methodology note (AC#6: any public insights page)', () => {
    mockTrends.isLoading = false;
    mockTrends.data = {
      dailyRegistrations: [{ date: '2026-03-01', count: 25 }],
      employmentByWeek: [],
      totalDays: 1,
      lastUpdated: '2026-03-13T10:00:00.000Z',
    };
    mockTrends.error = null;
    renderPage();
    expect(screen.getByText(/methodology/i)).toBeInTheDocument();
    expect(screen.getByText(/data refreshed hourly/i)).toBeInTheDocument();
  });
});

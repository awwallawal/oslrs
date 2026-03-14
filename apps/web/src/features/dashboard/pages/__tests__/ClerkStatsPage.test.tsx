// @vitest-environment jsdom
/**
 * ClerkStatsPage Tests
 *
 * Story 8.3: Field Team Analytics — Clerk personal stats page
 * Replaces Story 2.5-6 placeholder tests with real implementation tests.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);
afterEach(() => cleanup());

// ── Hoisted mocks ─────────────────────────────────────────────────
const mockPersonalStats = vi.hoisted(() => ({
  data: null as any,
  isLoading: true,
  error: null as any,
}));

vi.mock('../../hooks/useAnalytics', () => ({
  usePersonalStats: () => mockPersonalStats,
  useActivationStatus: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: ({ children }: any) => <div>{children}</div>,
  Cell: () => <div />,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  CartesianGrid: () => <div />,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => <div />,
  ComposedChart: ({ children }: any) => <div>{children}</div>,
}));

import ClerkStatsPage from '../ClerkStatsPage';

function resetMocks() {
  mockPersonalStats.data = null;
  mockPersonalStats.isLoading = true;
  mockPersonalStats.error = null;
}

beforeEach(() => resetMocks());

describe('ClerkStatsPage', () => {
  it('renders page heading', () => {
    render(<ClerkStatsPage />);
    expect(screen.getByText('My Stats')).toBeInTheDocument();
    expect(screen.getByText('Track your data entry productivity and quality')).toBeInTheDocument();
  });

  it('renders tabs for performance and quality', () => {
    render(<ClerkStatsPage />);
    expect(screen.getByText('My Performance')).toBeInTheDocument();
    expect(screen.getByText('My Data Quality')).toBeInTheDocument();
  });

  it('shows summary cards when data is loaded', () => {
    mockPersonalStats.data = {
      dailyTrend: [],
      cumulativeCount: 42,
      avgCompletionTimeSec: 300,
      teamAvgCompletionTimeSec: 350,
      gpsRate: null,
      ninRate: 0.8,
      skipRate: 0.05,
      fraudFlagRate: 0.01,
      teamAvgFraudRate: 0.03,
      respondentDiversity: { genderSplit: [], ageSpread: [] },
      topSkillsCollected: [],
      compositeQualityScore: 78,
    };
    mockPersonalStats.isLoading = false;

    render(<ClerkStatsPage />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText('5m')).toBeInTheDocument();
  });

  it('handles null quality score gracefully', () => {
    mockPersonalStats.data = {
      dailyTrend: [],
      cumulativeCount: 0,
      avgCompletionTimeSec: null,
      teamAvgCompletionTimeSec: null,
      gpsRate: null,
      ninRate: null,
      skipRate: null,
      fraudFlagRate: null,
      teamAvgFraudRate: null,
      respondentDiversity: { genderSplit: [], ageSpread: [] },
      topSkillsCollected: [],
      compositeQualityScore: null,
    };
    mockPersonalStats.isLoading = false;

    render(<ClerkStatsPage />);
    // em dashes for null values
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});

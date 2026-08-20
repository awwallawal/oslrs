// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { DemographicStats } from '@oslsr/types';

expect.extend(matchers);
afterEach(() => cleanup());

vi.mock('../../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: any) => <div>{children}</div>,
  Cell: () => <div />,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  CartesianGrid: () => <div />,
}));

import { DemographicCharts } from '../DemographicCharts';

const mockData: DemographicStats = {
  genderDistribution: [
    { label: 'male', count: 60, percentage: 60 },
    { label: 'female', count: 40, percentage: 40 },
  ],
  ageDistribution: [{ label: '20-24', count: 30, percentage: 30 }],
  educationDistribution: [{ label: 'sss', count: 50, percentage: 50 }],
  maritalDistribution: [{ label: 'married', count: 60, percentage: 60 }],
  disabilityPrevalence: [{ label: 'no', count: 90, percentage: 90 }],
  lgaDistribution: [{ label: 'Ibadan North', count: 40, percentage: 40 }],
  consentMarketplace: [{ label: 'yes', count: 70, percentage: 70 }],
  consentEnriched: [{ label: 'yes', count: 55, percentage: 55 }],
};

describe('DemographicCharts', () => {
  it('renders charts with data', () => {
    render(<DemographicCharts data={mockData} isLoading={false} error={null} />);
    expect(screen.getByTestId('demographic-charts')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<DemographicCharts data={mockData} isLoading={true} error={null} />);
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  it('renders suppressed buckets with suppression indicator', () => {
    const suppressedData: DemographicStats = {
      ...mockData,
      disabilityPrevalence: [
        { label: 'no', count: 90, percentage: 90 },
        { label: 'yes', count: null, percentage: null, suppressed: true },
      ],
      consentMarketplace: [
        { label: 'yes', count: 70, percentage: 70 },
        { label: 'no', count: null, percentage: null, suppressed: true },
      ],
    };
    render(<DemographicCharts data={suppressedData} isLoading={false} error={null} />);
    // DisabilityStatCard and ConsentStatCard both render "Insufficient data"
    // when any bucket is suppressed
    const suppressedElements = screen.getAllByText('Insufficient data');
    expect(suppressedElements.length).toBeGreaterThanOrEqual(1);
  });

  // ── Story 12-5 AC4/AC6.3 — per-chart denominators ─────────────────────
  describe('N per chart', () => {
    it('gives every chart its own N, not one shared house number', () => {
      render(<DemographicCharts data={mockData} isLoading={false} error={null} />);
      const ns = screen.getAllByTestId('chart-n').map((el) => el.textContent);

      // Gender 60+40=100, age 30, education 50, marital 60, LGA 40,
      // disability 90, and the two consent cards 70 / 55.
      expect(ns).toContain('N = 100');
      expect(ns).toContain('N = 30');
      expect(ns).toContain('N = 50');
      // The point of AC4.2: these differ from each other on purpose.
      expect(new Set(ns).size).toBeGreaterThan(1);
    });

    it('excludes suppressed buckets from the N it prints', () => {
      const withSuppressed: DemographicStats = {
        ...mockData,
        ageDistribution: [
          { label: '20-24', count: 30, percentage: 30 },
          // Withheld (<5): its count is not shown, so it cannot be counted.
          { label: '25-29', count: null, percentage: null, suppressed: true },
        ],
      };
      render(<DemographicCharts data={withSuppressed} isLoading={false} error={null} />);
      const ns = screen.getAllByTestId('chart-n').map((el) => el.textContent);
      expect(ns).toContain('N = 30');
    });
  });
});

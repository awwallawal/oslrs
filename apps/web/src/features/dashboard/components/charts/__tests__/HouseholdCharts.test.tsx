// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { HouseholdStats } from '@oslsr/types';

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

import { HouseholdCharts } from '../HouseholdCharts';

const mockData: HouseholdStats = {
  householdSizeDistribution: [{ label: '4-6', count: 25, percentage: 50 }],
  dependencyRatio: 0.45,
  headOfHouseholdByGender: [{ label: 'male', count: 30, percentage: 60 }],
  housingDistribution: [{ label: 'rented', count: 20, percentage: 40 }],
  businessOwnershipRate: 30,
  businessRegistrationRate: 53.3,
  apprenticeTotal: 12,
  // Story 12-5 AC4 — four statistics, four DIFFERENT bases. 50 households gave
  // a size, 40 were asked about a business, 12 of those own one, 35 gave an
  // apprentice count. Collapsing them to one number would misweight three.
  denominators: {
    dependencyRatio: 50,
    businessOwnership: 40,
    businessRegistration: 12,
    apprenticeTotal: 35,
  },
};

describe('HouseholdCharts', () => {
  it('renders charts with data', () => {
    render(<HouseholdCharts data={mockData} isLoading={false} error={null} />);
    expect(screen.getByTestId('household-charts')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<HouseholdCharts data={mockData} isLoading={true} error={null} />);
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  // ── Story 12-5 AC4.1 (review R11) — the last four cards without a base ──

  it('gives each household ratio the base it was actually computed over', () => {
    render(<HouseholdCharts data={mockData} isLoading={false} error={null} />);
    const ns = screen.getAllByTestId('chart-n').map((el) => el.textContent);
    // The four stat cards...
    expect(ns).toContain('N = 50');  // dependency ratio — households giving a size
    expect(ns).toContain('N = 40');  // ownership rate — those ASKED about a business
    expect(ns).toContain('N = 12');  // registration rate — the owners among them
    expect(ns).toContain('N = 35');  // apprentice total — those giving a count
  });

  it('omits the base for a statistic it is not showing', () => {
    // A denominator under a suppressed figure is noise: there is no number on
    // screen for it to be the base of.
    const suppressed: HouseholdStats = {
      ...mockData,
      businessOwnershipRate: null,
      denominators: { ...mockData.denominators, businessOwnership: null },
    };
    render(<HouseholdCharts data={suppressed} isLoading={false} error={null} />);
    const ns = screen.getAllByTestId('chart-n').map((el) => el.textContent);
    expect(ns).not.toContain('N = 40');
    expect(ns).toContain('N = 50');
  });

  it('renders suppressed stat cards with "Insufficient data" indicator', () => {
    const suppressedData: HouseholdStats = {
      ...mockData,
      businessOwnershipRate: null,
      apprenticeTotal: null,
    };
    render(<HouseholdCharts data={suppressedData} isLoading={false} error={null} />);
    // NullStatCard renders "Insufficient data" as subtitle for null values
    const insufficientTexts = screen.getAllByText('Insufficient data');
    expect(insufficientTexts.length).toBeGreaterThanOrEqual(2);
  });
});

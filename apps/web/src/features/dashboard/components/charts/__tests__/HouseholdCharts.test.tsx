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

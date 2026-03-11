// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { EmploymentStats } from '@oslsr/types';

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

import { EmploymentCharts } from '../EmploymentCharts';

const mockData: EmploymentStats = {
  workStatusBreakdown: [{ label: 'employed', count: 80, percentage: 80 }],
  employmentTypeBreakdown: [{ label: 'wage_public', count: 30, percentage: 30 }],
  formalInformalRatio: [
    { label: 'formal', count: 40, percentage: 40 },
    { label: 'informal', count: 60, percentage: 60 },
  ],
  experienceDistribution: [{ label: '5-10', count: 25, percentage: 25 }],
  hoursWorked: [{ label: '35-44', count: 50, percentage: 50 }],
  incomeDistribution: [{ label: '50k-100k', count: 35, percentage: 35 }],
  incomeByLga: [{ label: 'Ibadan North', count: 20, percentage: 20 }],
};

describe('EmploymentCharts', () => {
  it('renders charts with data', () => {
    render(<EmploymentCharts data={mockData} isLoading={false} error={null} />);
    expect(screen.getByTestId('employment-charts')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<EmploymentCharts data={mockData} isLoading={true} error={null} />);
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  it('renders suppressed buckets with suppression indicator', () => {
    const suppressedData: EmploymentStats = {
      ...mockData,
      formalInformalRatio: [
        { label: 'formal', count: 40, percentage: 40 },
        { label: 'informal', count: null, percentage: null, suppressed: true },
      ],
    };
    render(<EmploymentCharts data={suppressedData} isLoading={false} error={null} />);
    // FormalInformalCard renders SUPPRESSED_LABEL ("< 5") for suppressed buckets
    expect(screen.getByText('< 5')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);
afterEach(() => cleanup());

vi.mock('../../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  CartesianGrid: () => <div />,
  defs: ({ children }: any) => <div>{children}</div>,
  linearGradient: ({ children }: any) => <div>{children}</div>,
  stop: () => <div />,
}));

import { TrendsCharts } from '../TrendsCharts';

const mockData = [
  { date: '2026-03-01', count: 10 },
  { date: '2026-03-02', count: 15 },
  { date: '2026-03-03', count: 8 },
];

describe('TrendsCharts', () => {
  it('renders chart with data', () => {
    render(<TrendsCharts data={mockData} isLoading={false} error={null} />);
    expect(screen.getByTestId('trends-charts')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<TrendsCharts data={[]} isLoading={true} error={null} />);
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });
});

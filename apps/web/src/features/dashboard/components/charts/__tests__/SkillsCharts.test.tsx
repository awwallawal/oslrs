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
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  CartesianGrid: () => <div />,
}));

import { SkillsCharts } from '../SkillsCharts';

const mockData = [
  { skill: 'welding', count: 30, percentage: 30 },
  { skill: 'carpentry', count: 20, percentage: 20 },
  { skill: 'tailoring', count: 15, percentage: 15 },
];

describe('SkillsCharts', () => {
  it('renders chart with data', () => {
    render(<SkillsCharts data={mockData} isLoading={false} error={null} />);
    expect(screen.getByTestId('skills-charts')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<SkillsCharts data={[]} isLoading={true} error={null} />);
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });
});

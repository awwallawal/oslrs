// @vitest-environment jsdom
/**
 * LgaBreakdownChart Tests
 *
 * Story 5.1 AC3: Test all LGAs render, bars sorted descending by count,
 * maroon gradient colors, tooltip, empty state, responsive container.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div aria-label="Loading card" />,
}));

// Mock Recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children, data }: any) => (
    <div data-testid="bar-chart" data-length={data?.length}>
      {children}
    </div>
  ),
  Bar: ({ children }: any) => <div data-testid="lga-bar">{children}</div>,
  Cell: ({ fill }: any) => <div data-testid="lga-cell" data-fill={fill} />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
}));

import { LgaBreakdownChart } from '../LgaBreakdownChart';

afterEach(() => {
  cleanup();
});

const sampleData = [
  { lgaCode: 'ibadan-north', lgaName: 'Ibadan North', count: 50 },
  { lgaCode: 'ibadan-south-east', lgaName: 'Ibadan South East', count: 30 },
  { lgaCode: 'ogbomosho-north', lgaName: 'Ogbomosho North', count: 0 },
];

const allLgaData = Array.from({ length: 33 }, (_, i) => ({
  lgaCode: `lga-${i + 1}`,
  lgaName: `LGA ${i + 1}`,
  count: 33 - i,
}));

describe('LgaBreakdownChart', () => {
  it('renders chart container with data', () => {
    render(<LgaBreakdownChart data={sampleData} isLoading={false} error={null} />);
    expect(screen.getByTestId('lga-breakdown-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('passes all 33 LGAs to chart', () => {
    render(<LgaBreakdownChart data={allLgaData} isLoading={false} error={null} />);
    const chart = screen.getByTestId('bar-chart');
    expect(chart).toHaveAttribute('data-length', '33');
  });

  it('renders cells with maroon gradient fill', () => {
    render(<LgaBreakdownChart data={sampleData} isLoading={false} error={null} />);
    const cells = screen.getAllByTestId('lga-cell');
    expect(cells.length).toBe(3);
    // Each cell should have a fill attribute starting with rgb(
    cells.forEach((cell) => {
      const fill = cell.getAttribute('data-fill');
      expect(fill).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    });
  });

  it('highest count gets darkest color', () => {
    render(<LgaBreakdownChart data={sampleData} isLoading={false} error={null} />);
    const cells = screen.getAllByTestId('lga-cell');
    // First item has count 50 (max = 50, intensity = 1.0)
    // → rgb(156, 30, 35) which is the darkest maroon
    const fillFirst = cells[0].getAttribute('data-fill');
    expect(fillFirst).toBe('rgb(156, 30, 35)');
  });

  it('zero count gets lightest color', () => {
    render(<LgaBreakdownChart data={sampleData} isLoading={false} error={null} />);
    const cells = screen.getAllByTestId('lga-cell');
    // Third item has count 0 (intensity = 0)
    // → rgb(232, 161, 163) which is the lightest maroon
    const fillLast = cells[2].getAttribute('data-fill');
    expect(fillLast).toBe('rgb(232, 161, 163)');
  });

  it('renders empty state when no data', () => {
    render(<LgaBreakdownChart data={[]} isLoading={false} error={null} />);
    expect(screen.getByTestId('lga-empty')).toHaveTextContent('No LGA data available yet');
  });

  it('renders skeleton when loading', () => {
    render(<LgaBreakdownChart data={[]} isLoading={true} error={null} />);
    expect(screen.getByLabelText('Loading card')).toBeInTheDocument();
  });

  it('renders error message on error', () => {
    render(
      <LgaBreakdownChart data={[]} isLoading={false} error={new Error('fail')} />
    );
    expect(screen.getByTestId('lga-error')).toHaveTextContent('Unable to load LGA data');
  });

  it('renders responsive container', () => {
    render(<LgaBreakdownChart data={sampleData} isLoading={false} error={null} />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });
});

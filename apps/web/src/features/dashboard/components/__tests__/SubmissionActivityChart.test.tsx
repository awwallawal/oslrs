// @vitest-environment jsdom
/**
 * SubmissionActivityChart Tests
 * Story prep-2: toggle buttons, summary strip, loading/error/empty states
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

// Mock recharts — jsdom can't render SVG
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  ReferenceLine: () => <div />,
  Cell: () => <div />,
  CartesianGrid: () => <div />,
}));

import { SubmissionActivityChart } from '../SubmissionActivityChart';

afterEach(() => {
  cleanup();
});

const sampleData = [
  { date: '2026-02-13', count: 10 },
  { date: '2026-02-14', count: 20 },
  { date: '2026-02-15', count: 30 },
];

describe('SubmissionActivityChart', () => {
  it('renders chart with data', () => {
    render(
      <SubmissionActivityChart
        data={sampleData}
        target={25}
        days={7}
        onDaysChange={() => {}}
        isLoading={false}
        error={null}
        roleLabel="Submissions"
      />,
    );
    expect(screen.getByTestId('submission-activity-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders summary strip with correct values', () => {
    render(
      <SubmissionActivityChart
        data={sampleData}
        target={25}
        days={7}
        onDaysChange={() => {}}
        isLoading={false}
        error={null}
        roleLabel="Submissions"
      />,
    );
    const strip = screen.getByTestId('summary-strip');
    expect(strip).toHaveTextContent('Avg 20/day');
    expect(strip).toHaveTextContent('Best 30');
    expect(strip).toHaveTextContent('Total 60');
  });

  it('calls onDaysChange when toggle clicked', () => {
    const onDaysChange = vi.fn();
    render(
      <SubmissionActivityChart
        data={sampleData}
        target={25}
        days={7}
        onDaysChange={onDaysChange}
        isLoading={false}
        error={null}
        roleLabel="Submissions"
      />,
    );
    fireEvent.click(screen.getByTestId('toggle-30d'));
    expect(onDaysChange).toHaveBeenCalledWith(30);
  });

  it('highlights active toggle chip', () => {
    render(
      <SubmissionActivityChart
        data={sampleData}
        target={25}
        days={7}
        onDaysChange={() => {}}
        isLoading={false}
        error={null}
        roleLabel="Submissions"
      />,
    );
    expect(screen.getByTestId('toggle-7d').className).toContain('bg-[#9C1E23]');
    expect(screen.getByTestId('toggle-30d').className).not.toContain('bg-[#9C1E23]');
  });

  it('shows empty state when no data', () => {
    render(
      <SubmissionActivityChart
        data={[]}
        target={25}
        days={7}
        onDaysChange={() => {}}
        isLoading={false}
        error={null}
        roleLabel="Submissions"
      />,
    );
    expect(screen.getByTestId('chart-empty')).toHaveTextContent('No submission data');
  });

  it('renders skeleton when loading', () => {
    render(
      <SubmissionActivityChart
        data={[]}
        target={25}
        days={7}
        onDaysChange={() => {}}
        isLoading={true}
        error={null}
        roleLabel="Submissions"
      />,
    );
    expect(screen.queryByTestId('submission-activity-chart')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading card')).toBeInTheDocument();
  });

  it('renders nothing on error', () => {
    const { container } = render(
      <SubmissionActivityChart
        data={[]}
        target={25}
        days={7}
        onDaysChange={() => {}}
        isLoading={false}
        error={new Error('fail')}
        roleLabel="Submissions"
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('accepts and applies className prop', () => {
    render(
      <SubmissionActivityChart
        data={sampleData}
        target={25}
        days={7}
        onDaysChange={() => {}}
        isLoading={false}
        error={null}
        roleLabel="Submissions"
        className="h-full col-span-full"
      />,
    );
    const card = screen.getByTestId('submission-activity-chart');
    expect(card).toHaveClass('h-full');
  });

  it('applies className to skeleton during loading', () => {
    render(
      <SubmissionActivityChart
        data={[]}
        target={25}
        days={7}
        onDaysChange={() => {}}
        isLoading={true}
        error={null}
        roleLabel="Submissions"
        className="h-full col-span-full"
      />,
    );
    const skeleton = screen.getByLabelText('Loading card');
    expect(skeleton).toHaveClass('h-full');
  });
});

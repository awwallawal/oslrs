// @vitest-environment jsdom
/**
 * SkillsDistributionChart Tests
 *
 * Story 5.1 AC2: Test chart renders with skill segments, legend displays
 * percentages, tooltip shows counts, empty state message, maroon palette.
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
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children, data }: any) => (
    <div data-testid="pie-element" data-segments={data?.length}>
      {children}
    </div>
  ),
  Cell: ({ fill }: any) => <div data-testid="skill-cell" data-fill={fill} />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: ({ formatter }: any) => {
    // Render legend items to test percentage display
    return (
      <div data-testid="legend">
        {formatter ? <span>{formatter('test', {})}</span> : null}
      </div>
    );
  },
}));

import { SkillsDistributionChart } from '../SkillsDistributionChart';

afterEach(() => {
  cleanup();
});

const sampleSkills = [
  { skill: 'Carpentry', count: 45 },
  { skill: 'Tailoring', count: 30 },
  { skill: 'Plumbing', count: 15 },
  { skill: 'Welding', count: 10 },
];

describe('SkillsDistributionChart', () => {
  it('renders chart container with data', () => {
    render(<SkillsDistributionChart data={sampleSkills} isLoading={false} error={null} />);
    expect(screen.getByTestId('skills-distribution-chart')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('renders correct number of pie segments', () => {
    render(<SkillsDistributionChart data={sampleSkills} isLoading={false} error={null} />);
    const pie = screen.getByTestId('pie-element');
    expect(pie).toHaveAttribute('data-segments', '4');
  });

  it('renders cells with maroon palette colors', () => {
    render(<SkillsDistributionChart data={sampleSkills} isLoading={false} error={null} />);
    const cells = screen.getAllByTestId('skill-cell');
    expect(cells.length).toBe(4);
    // First cell should use primary maroon
    expect(cells[0]).toHaveAttribute('data-fill', '#9C1E23');
    // Second cell should use next color in palette
    expect(cells[1]).toHaveAttribute('data-fill', '#B4383D');
  });

  it('renders legend', () => {
    render(<SkillsDistributionChart data={sampleSkills} isLoading={false} error={null} />);
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('renders tooltip component', () => {
    render(<SkillsDistributionChart data={sampleSkills} isLoading={false} error={null} />);
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<SkillsDistributionChart data={[]} isLoading={false} error={null} />);
    expect(screen.getByTestId('skills-empty')).toHaveTextContent('No skill data available yet');
  });

  it('renders skeleton when loading', () => {
    render(<SkillsDistributionChart data={[]} isLoading={true} error={null} />);
    expect(screen.getByLabelText('Loading card')).toBeInTheDocument();
  });

  it('renders error message on error', () => {
    render(
      <SkillsDistributionChart data={[]} isLoading={false} error={new Error('fail')} />
    );
    expect(screen.getByTestId('skills-error')).toHaveTextContent('Unable to load skills data');
  });

  it('renders responsive container', () => {
    render(<SkillsDistributionChart data={sampleSkills} isLoading={false} error={null} />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('renders Direction 08 section header styling', () => {
    render(<SkillsDistributionChart data={sampleSkills} isLoading={false} error={null} />);
    const title = screen.getByText('Skills Distribution');
    const headerDiv = title.closest('div[class*="border-l-4"]');
    expect(headerDiv).toHaveClass('border-[#9C1E23]');
  });
});

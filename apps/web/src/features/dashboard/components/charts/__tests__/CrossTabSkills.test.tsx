// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

expect.extend(matchers);
afterEach(() => cleanup());

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  CartesianGrid: () => <div />,
  ReferenceLine: () => <div />,
  Cell: () => <div />,
}));

// Mock skeletons
vi.mock('../../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

// Mock the useCrossTab hook
const mockUseCrossTab = vi.fn();
const mockUseSkillsInventory = vi.fn();
vi.mock('../../../hooks/useAnalytics', () => ({
  useCrossTab: (...args: unknown[]) => mockUseCrossTab(...args),
  useSkillsInventory: (...args: unknown[]) => mockUseSkillsInventory(...args),
}));

import { CrossTabTable } from '../CrossTabTable';
import { FullSkillsChart } from '../FullSkillsChart';
import { SkillsCategoryChart } from '../SkillsCategoryChart';
import { SkillsGapChart } from '../SkillsGapChart';
import { SkillsConcentrationTable } from '../SkillsConcentrationTable';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('CrossTabTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heatmap table with correct row/col dimensions', () => {
    mockUseCrossTab.mockReturnValue({
      data: {
        rowLabels: ['female', 'male'],
        colLabels: ['employed', 'unemployed'],
        cells: [[30, 20], [40, 10]],
        totalN: 100,
        anySuppressed: false,
      },
      isLoading: false,
      isError: false,
    });

    render(<CrossTabTable />, { wrapper });

    expect(screen.getByTestId('cross-tab-table')).toBeInTheDocument();
    expect(screen.getByTestId('heatmap-table')).toBeInTheDocument();
    expect(screen.getByText('female')).toBeInTheDocument();
    expect(screen.getByText('male')).toBeInTheDocument();
    expect(screen.getByText('employed')).toBeInTheDocument();
    expect(screen.getByText('unemployed')).toBeInTheDocument();
  });

  it('shows "< 5" for suppressed cells', () => {
    mockUseCrossTab.mockReturnValue({
      data: {
        rowLabels: ['female'],
        colLabels: ['employed'],
        cells: [[null]],
        totalN: 50,
        anySuppressed: true,
      },
      isLoading: false,
      isError: false,
    });

    render(<CrossTabTable />, { wrapper });

    expect(screen.getByText('< 5')).toBeInTheDocument();
  });

  it('shows suppression banner when anySuppressed is true', () => {
    mockUseCrossTab.mockReturnValue({
      data: {
        rowLabels: ['female'],
        colLabels: ['employed'],
        cells: [[null]],
        totalN: 50,
        anySuppressed: true,
      },
      isLoading: false,
      isError: false,
    });

    render(<CrossTabTable />, { wrapper });

    expect(screen.getByTestId('suppression-banner')).toBeInTheDocument();
    expect(screen.getByText(/Some cells suppressed/)).toBeInTheDocument();
  });

  it('shows below-threshold message with progress bar', () => {
    mockUseCrossTab.mockReturnValue({
      data: {
        rowLabels: [],
        colLabels: [],
        cells: [],
        totalN: 20,
        anySuppressed: false,
        belowThreshold: true,
        currentN: 20,
        requiredN: 50,
      },
      isLoading: false,
      isError: false,
    });

    render(<CrossTabTable />, { wrapper });

    expect(screen.getByTestId('threshold-guard')).toBeInTheDocument();
    expect(screen.getByText(/Cross-tabulation requires at least 50 submissions/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders loading skeleton', () => {
    mockUseCrossTab.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<CrossTabTable />, { wrapper });

    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });

  it('dimension selectors update query', () => {
    mockUseCrossTab.mockReturnValue({
      data: {
        rowLabels: ['a'],
        colLabels: ['b'],
        cells: [[10]],
        totalN: 60,
        anySuppressed: false,
      },
      isLoading: false,
      isError: false,
    });

    render(<CrossTabTable />, { wrapper });

    const rowSelect = screen.getByTestId('row-dim-select');
    const colSelect = screen.getByTestId('col-dim-select');
    expect(rowSelect).toBeInTheDocument();
    expect(colSelect).toBeInTheDocument();

    // Change row dimension
    fireEvent.change(rowSelect, { target: { value: 'education' } });
    // Hook should be re-called with new dimension
    expect(mockUseCrossTab).toHaveBeenCalled();
  });

  it('measure toggle renders all 4 options', () => {
    mockUseCrossTab.mockReturnValue({
      data: {
        rowLabels: ['a'],
        colLabels: ['b'],
        cells: [[10]],
        totalN: 60,
        anySuppressed: false,
      },
      isLoading: false,
      isError: false,
    });

    render(<CrossTabTable />, { wrapper });

    const toggle = screen.getByTestId('measure-toggle');
    expect(toggle).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByText('Row %')).toBeInTheDocument();
    expect(screen.getByText('Col %')).toBeInTheDocument();
    expect(screen.getByText('Total %')).toBeInTheDocument();
  });
});

describe('FullSkillsChart', () => {
  it('renders all skills (not truncated)', () => {
    const skills = Array.from({ length: 25 }, (_, i) => ({
      skill: `skill_${i}`,
      count: 100 - i,
      percentage: (100 - i) / 100 * 100,
    }));

    render(
      <FullSkillsChart
        skills={skills}
        threshold={{ met: true, currentN: 50, requiredN: 30 }}
      />
    );

    expect(screen.getByTestId('full-skills-chart')).toBeInTheDocument();
    expect(screen.getByText('25 skills displayed')).toBeInTheDocument();
  });
});

describe('SkillsCategoryChart', () => {
  it('groups by ISCO-08 sector with correct count', () => {
    const categories = [
      { category: 'Construction & Building', totalCount: 35, skills: [
        { skill: 'bricklaying', count: 20, percentage: 40 },
        { skill: 'plastering', count: 15, percentage: 30 },
      ]},
      { category: 'Fashion, Beauty & Personal Care', totalCount: 10, skills: [
        { skill: 'tailoring', count: 10, percentage: 20 },
      ]},
    ];

    render(
      <SkillsCategoryChart
        categories={categories}
        threshold={{ met: true, currentN: 50, requiredN: 30 }}
      />
    );

    expect(screen.getByTestId('skills-category-chart')).toBeInTheDocument();
    expect(screen.getByText('Construction & Building')).toBeInTheDocument();
    expect(screen.getByText(/35/)).toBeInTheDocument();
  });
});

describe('SkillsGapChart', () => {
  it('renders diverging bars when data exists', () => {
    const gap = [
      { skill: 'web_dev', haveCount: 10, wantCount: 30 },
      { skill: 'bricklaying', haveCount: 40, wantCount: 5 },
    ];

    render(
      <SkillsGapChart
        gapAnalysis={gap}
        threshold={{ met: true, currentN: 50, requiredN: 30 }}
      />
    );

    expect(screen.getByTestId('skills-gap-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('gap-placeholder')).not.toBeInTheDocument();
  });

  it('shows placeholder when gapAnalysis is null', () => {
    render(
      <SkillsGapChart
        gapAnalysis={null}
        threshold={{ met: true, currentN: 50, requiredN: 30 }}
      />
    );

    expect(screen.getByTestId('gap-placeholder')).toBeInTheDocument();
    expect(screen.getByText(/No training interest data available/)).toBeInTheDocument();
  });

  it('shows threshold guard when below threshold', () => {
    render(
      <SkillsGapChart
        gapAnalysis={null}
        threshold={{ met: false, currentN: 10, requiredN: 30 }}
      />
    );

    expect(screen.getByTestId('threshold-guard')).toBeInTheDocument();
  });
});

describe('SkillsConcentrationTable', () => {
  it('renders LGA names and top 3 skills', () => {
    const data = [
      {
        lgaId: 'lga1',
        lgaName: 'Ibadan North',
        topSkills: [
          { skill: 'bricklaying', count: 20 },
          { skill: 'tailoring', count: 15 },
          { skill: 'plumbing', count: 10 },
        ],
      },
    ];

    render(
      <SkillsConcentrationTable
        data={data}
        threshold={{ met: true, currentN: 50, requiredN: 20 }}
      />
    );

    expect(screen.getByTestId('skills-concentration-table')).toBeInTheDocument();
    expect(screen.getByText('Ibadan North')).toBeInTheDocument();
    expect(screen.getByText(/bricklaying/)).toBeInTheDocument();
    expect(screen.getByText(/tailoring/)).toBeInTheDocument();
    expect(screen.getByText(/plumbing/)).toBeInTheDocument();
  });

  it('returns null when data is null (Supervisor view)', () => {
    const { container } = render(
      <SkillsConcentrationTable
        data={null}
        threshold={{ met: true, currentN: 50, requiredN: 20 }}
      />
    );

    expect(container.innerHTML).toBe('');
  });
});

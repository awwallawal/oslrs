// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

expect.extend(matchers);
afterEach(() => cleanup());

// ── Mock recharts ────────────────────────────────────────────────────────
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: ({ children }: any) => <div>{children}</div>,
  Cell: () => <div />,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  CartesianGrid: () => <div />,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => <div />,
  ReferenceLine: () => <div />,
  ComposedChart: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../../../../../components/skeletons', () => ({
  SkeletonCard: ({ className }: any) => <div data-testid="skeleton-card" className={className} />,
}));

vi.mock('lucide-react', () => ({
  ArrowDown: () => <span data-testid="arrow-down" />,
  ArrowUp: () => <span data-testid="arrow-up" />,
  Minus: () => <span data-testid="minus" />,
}));

// ── Imports ──────────────────────────────────────────────────────────────
import TeamQualityCharts from '../TeamQualityCharts';
import DataQualityScorecard from '../DataQualityScorecard';
import PersonalTrendChart from '../PersonalTrendChart';
import CompletionTimeComparison from '../CompletionTimeComparison';
import PersonalSkillsChart from '../PersonalSkillsChart';
import RespondentDiversityChart from '../RespondentDiversityChart';
import TeamCompletionTimeChart from '../TeamCompletionTimeChart';
import DayOfWeekChart from '../DayOfWeekChart';
import HourOfDayChart from '../HourOfDayChart';
import FieldCoverageMap from '../FieldCoverageMap';

// ── Test Data ────────────────────────────────────────────────────────────

const teamQualityData = {
  enumerators: [
    {
      enumeratorId: '1',
      name: 'John Doe',
      submissionCount: 50,
      avgCompletionTimeSec: 300,
      gpsRate: 0.9,
      ninRate: 0.8,
      skipRate: 0.1,
      fraudFlagRate: 0.02,
      status: 'active' as const,
    },
  ],
  teamAverages: {
    avgCompletionTime: 350,
    gpsRate: 0.85,
    ninRate: 0.75,
    skipRate: 0.12,
    fraudRate: 0.03,
  },
  submissionsByDay: [{ date: '2026-03-01', count: 10 }],
  dayOfWeekPattern: [],
  hourOfDayPattern: [],
};

const personalStatsData = {
  dailyTrend: [],
  cumulativeCount: 42,
  avgCompletionTimeSec: 300,
  teamAvgCompletionTimeSec: 350,
  gpsRate: 0.9,
  ninRate: 0.8,
  skipRate: 0.05,
  fraudFlagRate: 0.01,
  teamAvgFraudRate: 0.03,
  respondentDiversity: { genderSplit: [], ageSpread: [] },
  topSkillsCollected: [],
  compositeQualityScore: 78,
};

// ═════════════════════════════════════════════════════════════════════════
// 1. TeamQualityCharts
// ═════════════════════════════════════════════════════════════════════════
describe('TeamQualityCharts', () => {
  it('renders loading skeletons when isLoading=true', () => {
    render(<TeamQualityCharts data={undefined} isLoading={true} error={null} />);
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  it('renders error state with retry button when error exists', () => {
    const onRetry = vi.fn();
    render(<TeamQualityCharts data={undefined} isLoading={false} error={new Error('fail')} onRetry={onRetry} />);
    expect(screen.getByText('Failed to load team quality data')).toBeInTheDocument();
    const retryBtn = screen.getByText('Retry');
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders enumerator metrics when data provided', () => {
    render(<TeamQualityCharts data={teamQualityData} isLoading={false} error={null} />);
    expect(screen.getByText('Submissions by Enumerator')).toBeInTheDocument();
    expect(screen.getByText('Quality Rates by Enumerator')).toBeInTheDocument();
    expect(screen.getByText('Team Submissions')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument(); // total submissions
    expect(screen.getByText('GPS Coverage')).toBeInTheDocument();
    expect(screen.getByText('NIN Capture')).toBeInTheDocument();
    expect(screen.getByText('Fraud Rate')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 2. DataQualityScorecard
// ═════════════════════════════════════════════════════════════════════════
describe('DataQualityScorecard', () => {
  it('renders loading skeleton when isLoading=true', () => {
    render(<DataQualityScorecard data={undefined} isLoading={true} error={null} />);
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });

  it('renders scorecard with quality metrics and compositeQualityScore', () => {
    render(<DataQualityScorecard data={personalStatsData} isLoading={false} error={null} />);
    expect(screen.getByText('Data Quality Score')).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument(); // compositeQualityScore
    expect(screen.getByText('out of 100')).toBeInTheDocument();
    expect(screen.getByText('GPS Capture')).toBeInTheDocument();
    expect(screen.getByText('NIN Capture')).toBeInTheDocument();
    expect(screen.getByText('Skip Rate')).toBeInTheDocument();
    expect(screen.getByText('Fraud Rate')).toBeInTheDocument();
  });

  it('renders without GPS Capture metric when isClerk=true', () => {
    render(<DataQualityScorecard data={personalStatsData} isClerk={true} isLoading={false} error={null} />);
    expect(screen.getByText('Data Quality Score')).toBeInTheDocument();
    expect(screen.queryByText('GPS Capture')).not.toBeInTheDocument();
    expect(screen.getByText('NIN Capture')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 3. PersonalTrendChart
// ═════════════════════════════════════════════════════════════════════════
describe('PersonalTrendChart', () => {
  it('renders loading skeleton when isLoading=true', () => {
    render(<PersonalTrendChart data={undefined} isLoading={true} error={null} />);
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });

  it('renders chart with data', () => {
    const data = [
      { date: '2026-03-01', count: 5 },
      { date: '2026-03-02', count: 8 },
    ];
    render(<PersonalTrendChart data={data} isLoading={false} error={null} />);
    expect(screen.getByText('Daily Submissions')).toBeInTheDocument();
  });

  it('renders error message when error exists', () => {
    render(<PersonalTrendChart data={undefined} isLoading={false} error={new Error('oops')} />);
    expect(screen.getByText('Failed to load trend data')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 4. CompletionTimeComparison
// ═════════════════════════════════════════════════════════════════════════
describe('CompletionTimeComparison', () => {
  it('renders loading skeleton when isLoading=true', () => {
    render(<CompletionTimeComparison avgTimeSec={null} teamAvgTimeSec={null} isLoading={true} error={null} />);
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });

  it('shows You vs Team comparison with data', () => {
    render(<CompletionTimeComparison avgTimeSec={300} teamAvgTimeSec={400} isLoading={false} error={null} />);
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('vs')).toBeInTheDocument();
    expect(screen.getByText('5m 0s')).toBeInTheDocument(); // 300s
    expect(screen.getByText('6m 40s')).toBeInTheDocument(); // 400s
    expect(screen.getByText('Faster than team avg')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<CompletionTimeComparison avgTimeSec={null} teamAvgTimeSec={null} isLoading={false} error={new Error('fail')} />);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 5. PersonalSkillsChart
// ═════════════════════════════════════════════════════════════════════════
describe('PersonalSkillsChart', () => {
  it('renders loading skeleton when isLoading=true', () => {
    render(<PersonalSkillsChart data={undefined} isLoading={true} error={null} />);
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });

  it('renders bar chart with skills data', () => {
    const data = [{ skill: 'Welding', count: 15, percentage: 30 }];
    render(<PersonalSkillsChart data={data} isLoading={false} error={null} />);
    expect(screen.getByText('Top Skills Collected')).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<PersonalSkillsChart data={[]} isLoading={false} error={null} />);
    expect(screen.getByText('No skills data yet')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 6. RespondentDiversityChart
// ═════════════════════════════════════════════════════════════════════════
describe('RespondentDiversityChart', () => {
  it('renders loading skeletons when isLoading=true', () => {
    render(<RespondentDiversityChart isLoading={true} error={null} />);
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  it('renders charts with gender and age data', () => {
    const genderSplit = [{ label: 'Male', count: 30, percentage: 60 }];
    const ageSpread = [{ label: '18-25', count: 20, percentage: 40 }];
    render(<RespondentDiversityChart genderSplit={genderSplit} ageSpread={ageSpread} isLoading={false} error={null} />);
    expect(screen.getByText('Gender Split')).toBeInTheDocument();
    expect(screen.getByText('Age Distribution')).toBeInTheDocument();
  });

  it('renders error state when error exists', () => {
    render(<RespondentDiversityChart isLoading={false} error={new Error('fail')} />);
    expect(screen.getByText('Failed to load diversity data')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 7. TeamCompletionTimeChart
// ═════════════════════════════════════════════════════════════════════════
describe('TeamCompletionTimeChart', () => {
  it('renders loading skeleton when isLoading=true', () => {
    render(<TeamCompletionTimeChart enumerators={undefined} teamAvgTime={null} isLoading={true} error={null} />);
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });

  it('renders bar chart when enumerators provided', () => {
    render(
      <TeamCompletionTimeChart
        enumerators={teamQualityData.enumerators}
        teamAvgTime={350}
        isLoading={false}
        error={null}
      />,
    );
    expect(screen.getByText('Avg Completion Time per Enumerator')).toBeInTheDocument();
  });

  it('renders empty state when no enumerators', () => {
    render(<TeamCompletionTimeChart enumerators={[]} teamAvgTime={null} isLoading={false} error={null} />);
    expect(screen.getByText('No completion time data')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 8. DayOfWeekChart
// ═════════════════════════════════════════════════════════════════════════
describe('DayOfWeekChart', () => {
  it('renders loading skeleton when isLoading=true', () => {
    render(<DayOfWeekChart data={undefined} isLoading={true} error={null} />);
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });

  it('renders chart with day-of-week data', () => {
    const data = [{ label: 'Mon', count: 10, percentage: 14 }];
    render(<DayOfWeekChart data={data} isLoading={false} error={null} />);
    expect(screen.getByText('Submissions by Day of Week')).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<DayOfWeekChart data={[]} isLoading={false} error={null} />);
    expect(screen.getByText('No day-of-week data')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 9. HourOfDayChart
// ═════════════════════════════════════════════════════════════════════════
describe('HourOfDayChart', () => {
  it('renders loading skeleton when isLoading=true', () => {
    render(<HourOfDayChart data={undefined} isLoading={true} error={null} />);
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });

  it('renders chart with hourly data', () => {
    const data = [{ label: '09', count: 20, percentage: 8 }];
    render(<HourOfDayChart data={data} isLoading={false} error={null} />);
    expect(screen.getByText('Submissions by Hour (WAT)')).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<HourOfDayChart data={[]} isLoading={false} error={null} />);
    expect(screen.getByText('No hourly data')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 10. FieldCoverageMap
// ═════════════════════════════════════════════════════════════════════════
describe('FieldCoverageMap', () => {
  it('renders loading skeleton when isLoading=true', () => {
    render(<FieldCoverageMap isLoading={true} error={null} />);
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });

  it('renders placeholder when loaded', () => {
    render(<FieldCoverageMap isLoading={false} error={null} />);
    expect(screen.getByText('Field Coverage Map')).toBeInTheDocument();
    expect(screen.getByText('GPS Coverage Map')).toBeInTheDocument();
    expect(screen.getByText(/Navigate to Team Progress/)).toBeInTheDocument();
  });

  it('renders error state when error exists', () => {
    render(<FieldCoverageMap isLoading={false} error={new Error('fail')} />);
    expect(screen.getByText('Failed to load GPS coverage data')).toBeInTheDocument();
  });
});

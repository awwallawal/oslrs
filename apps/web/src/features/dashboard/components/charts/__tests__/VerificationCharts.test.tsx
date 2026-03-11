// @vitest-environment jsdom
/**
 * Verification Pipeline Chart Component Tests
 * Story 8.4: 14 tests — 2 per component (data render + loading state)
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

expect.extend(matchers);
import type {
  VerificationFunnel,
  FraudTypeBreakdown,
  ReviewThroughput,
  TopFlaggedEnumerator,
  BacklogTrend,
  RejectionReasonFrequency,
} from '@oslsr/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Mock ChartExportButton to avoid csv-export dependency
vi.mock('../ChartExportButton', () => ({
  ChartExportButton: ({ filename }: { filename: string }) => <button data-testid={`export-${filename}`}>Export</button>,
}));

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  Area: () => <div data-testid="area" />,
  Line: () => <div data-testid="line" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ReferenceLine: () => null,
  Cell: () => null,
}));

import VerificationFunnelChart from '../VerificationFunnelChart';
import FraudTypeBreakdownChart from '../FraudTypeBreakdownChart';
import ReviewThroughputChart from '../ReviewThroughputChart';
import TopFlaggedEnumeratorsTable from '../TopFlaggedEnumeratorsTable';
import BacklogTrendChart from '../BacklogTrendChart';
import RejectionReasonsChart from '../RejectionReasonsChart';
import PipelineStatCards from '../PipelineStatCards';

function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const mockFunnel: VerificationFunnel = {
  totalSubmissions: 100, totalFlagged: 30, totalReviewed: 20, totalApproved: 15, totalRejected: 5,
};

const mockBreakdown: FraudTypeBreakdown = {
  gpsCluster: 10, speedRun: 8, straightLining: 5, duplicateResponse: 3, offHours: 2,
};

const mockThroughput: ReviewThroughput[] = [
  { date: '2026-03-10', reviewedCount: 5, approvedCount: 3, rejectedCount: 2 },
];

const mockEnumerators: TopFlaggedEnumerator[] = [
  { enumeratorId: 'e1', name: 'Adamu Bello', flagCount: 15, criticalCount: 3, highCount: 5, approvalRate: 0.6 },
];

const mockBacklog: BacklogTrend[] = [
  { date: '2026-03-10', pendingCount: 12, highCriticalCount: 4 },
];

const mockReasons: RejectionReasonFrequency[] = [
  { reason: 'confirmed_fraud', count: 15, percentage: 50 },
];

describe('VerificationFunnelChart', () => {
  it('renders with data', () => {
    wrap(<VerificationFunnelChart data={mockFunnel} isLoading={false} error={null} />);
    expect(screen.getByText('Verification Funnel')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    wrap(<VerificationFunnelChart isLoading={true} error={null} />);
    expect(screen.queryByText('Verification Funnel')).not.toBeInTheDocument();
  });
});

describe('FraudTypeBreakdownChart', () => {
  it('renders with data', () => {
    wrap(<FraudTypeBreakdownChart data={mockBreakdown} isLoading={false} error={null} />);
    expect(screen.getByText('Fraud Type Breakdown')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    wrap(<FraudTypeBreakdownChart isLoading={true} error={null} />);
    expect(screen.queryByText('Fraud Type Breakdown')).not.toBeInTheDocument();
  });
});

describe('ReviewThroughputChart', () => {
  it('renders with data', () => {
    wrap(<ReviewThroughputChart data={mockThroughput} isLoading={false} error={null} />);
    expect(screen.getByText('Review Throughput')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    wrap(<ReviewThroughputChart isLoading={true} error={null} />);
    expect(screen.queryByText('Review Throughput')).not.toBeInTheDocument();
  });
});

describe('TopFlaggedEnumeratorsTable', () => {
  it('renders with data including row details', () => {
    wrap(<TopFlaggedEnumeratorsTable data={mockEnumerators} isLoading={false} error={null} />);
    expect(screen.getByText('Top Flagged Enumerators')).toBeInTheDocument();
    expect(screen.getByText('Adamu Bello')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    wrap(<TopFlaggedEnumeratorsTable isLoading={true} error={null} />);
    expect(screen.queryByText('Top Flagged Enumerators')).not.toBeInTheDocument();
  });
});

describe('BacklogTrendChart', () => {
  it('renders with data', () => {
    wrap(<BacklogTrendChart data={mockBacklog} isLoading={false} error={null} />);
    expect(screen.getByText('Backlog Trend')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    wrap(<BacklogTrendChart isLoading={true} error={null} />);
    expect(screen.queryByText('Backlog Trend')).not.toBeInTheDocument();
  });
});

describe('RejectionReasonsChart', () => {
  it('renders with data', () => {
    wrap(<RejectionReasonsChart data={mockReasons} isLoading={false} error={null} />);
    expect(screen.getByText('Resolution Reasons')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    wrap(<RejectionReasonsChart isLoading={true} error={null} />);
    expect(screen.queryByText('Resolution Reasons')).not.toBeInTheDocument();
  });
});

describe('PipelineStatCards', () => {
  it('renders with data', () => {
    wrap(
      <PipelineStatCards
        avgReviewTimeMinutes={30}
        medianTimeToResolutionDays={2.5}
        completenessRate={95}
        consistencyRate={85}
        isLoading={false}
        error={null}
      />,
    );
    expect(screen.getByText('Avg Review Time')).toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('2.5d')).toBeInTheDocument();
    expect(screen.getByText('95.0%')).toBeInTheDocument();
    expect(screen.getByText('85.0%')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    wrap(
      <PipelineStatCards
        avgReviewTimeMinutes={null}
        medianTimeToResolutionDays={null}
        completenessRate={0}
        consistencyRate={0}
        isLoading={true}
        error={null}
      />,
    );
    expect(screen.queryByText('Avg Review Time')).not.toBeInTheDocument();
  });
});

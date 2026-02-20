// @vitest-environment jsdom
/**
 * EvidencePanel Tests
 * Story 4.4 AC4.4.3: Accordion expand/collapse, heuristic sections, zero-score collapsed.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

vi.mock('../../../../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../GpsClusterMap', () => ({
  GpsClusterMap: () => <div data-testid="gps-cluster-map" />,
}));

import { EvidencePanel } from '../EvidencePanel';
import type { FraudDetectionDetail } from '../../api/fraud.api';

const baseDetection: FraudDetectionDetail = {
  id: 'det-1',
  submissionId: 'sub-1',
  enumeratorId: 'enum-1',
  computedAt: '2026-02-20T10:00:00Z',
  configSnapshotVersion: 1,
  gpsScore: 18,
  speedScore: 20,
  straightlineScore: 0,
  duplicateScore: 0,
  timingScore: 5,
  totalScore: 43,
  severity: 'medium',
  gpsDetails: {
    clusterCount: 3,
    clusterMembers: [],
    accuracy: 12.5,
    teleportationFlag: true,
    teleportationSpeed: 150,
    duplicateCoords: false,
  },
  speedDetails: {
    completionTimeSeconds: 45,
    medianTimeSeconds: 300,
    ratio: 0.15,
    tier: 'superspeceder',
    historicalCount: 20,
  },
  straightlineDetails: null,
  duplicateDetails: null,
  timingDetails: {
    submissionHour: 23,
    isWeekend: true,
    localTime: '2026-02-20T23:00:00Z',
    isOffHours: true,
  },
  resolution: null,
  resolutionNotes: null,
  reviewedAt: null,
  reviewedBy: null,
  gpsLatitude: 7.3775,
  gpsLongitude: 3.947,
  submittedAt: '2026-02-20T09:00:00Z',
  enumeratorName: 'Adewale Johnson',
  enumeratorLgaId: 'lga-ib-north',
  formName: 'OSLSR Survey',
};

afterEach(() => {
  cleanup();
});

describe('EvidencePanel', () => {
  it('renders summary section with enumerator name, form, score, and severity', () => {
    render(<EvidencePanel detection={baseDetection} onReview={vi.fn()} />);
    expect(screen.getByText('Adewale Johnson')).toBeInTheDocument();
    expect(screen.getByText(/OSLSR Survey/)).toBeInTheDocument();
    expect(screen.getByText('43.0')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('renders config version', () => {
    render(<EvidencePanel detection={baseDetection} onReview={vi.fn()} />);
    expect(screen.getByText('Config v1')).toBeInTheDocument();
  });

  it('renders all 5 heuristic sections', () => {
    render(<EvidencePanel detection={baseDetection} onReview={vi.fn()} />);
    expect(screen.getByText('GPS Analysis')).toBeInTheDocument();
    expect(screen.getByText('Speed Analysis')).toBeInTheDocument();
    expect(screen.getByText('Straight-lining Analysis')).toBeInTheDocument();
    expect(screen.getByText('Duplicate Analysis')).toBeInTheDocument();
    expect(screen.getByText('Timing Analysis')).toBeInTheDocument();
  });

  it('shows score/maxWeight for each section', () => {
    render(<EvidencePanel detection={baseDetection} onReview={vi.fn()} />);
    expect(screen.getByText('18.0/25')).toBeInTheDocument(); // GPS
    expect(screen.getByText('20.0/25')).toBeInTheDocument(); // Speed
    // Both Straightline (0/20) and Duplicate (0/20) have the same display
    const zeroScores = screen.getAllByText('0.0/20');
    expect(zeroScores).toHaveLength(2);
    expect(screen.getByText('5.0/10')).toBeInTheDocument();  // Timing
  });

  it('expands sections with non-zero score by default', () => {
    render(<EvidencePanel detection={baseDetection} onReview={vi.fn()} />);
    // GPS section (score=18) should show details
    expect(screen.getByText('Cluster Members:')).toBeInTheDocument();
    // Speed section (score=20) should show details
    expect(screen.getByText('Completion Time:')).toBeInTheDocument();
    // Timing section (score=5) should show details
    expect(screen.getByText('Submission Hour:')).toBeInTheDocument();
  });

  it('collapses sections with zero score by default', () => {
    render(<EvidencePanel detection={baseDetection} onReview={vi.fn()} />);
    // Straightline (score=0) should be collapsed — no detail content visible
    expect(screen.queryByText('Flagged batteries:')).not.toBeInTheDocument();
    // Duplicate (score=0) should be collapsed
    expect(screen.queryByText('Match Type:')).not.toBeInTheDocument();
  });

  it('toggles section on click', () => {
    render(<EvidencePanel detection={baseDetection} onReview={vi.fn()} />);
    // Straightline is collapsed (score=0). Click to expand.
    const straightlineButton = screen.getByText('Straight-lining Analysis').closest('button')!;
    fireEvent.click(straightlineButton);
    expect(screen.getByText(/No straightline data available/)).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(straightlineButton);
    expect(screen.queryByText(/No straightline data available/)).not.toBeInTheDocument();
  });

  it('shows GPS details with teleportation flag', () => {
    render(<EvidencePanel detection={baseDetection} onReview={vi.fn()} />);
    expect(screen.getByText(/Yes \(150 km\/h\)/)).toBeInTheDocument();
    expect(screen.getByText('12.5m')).toBeInTheDocument();
  });

  it('shows speed details with tier', () => {
    render(<EvidencePanel detection={baseDetection} onReview={vi.fn()} />);
    expect(screen.getByText('45s')).toBeInTheDocument();
    expect(screen.getByText('300s')).toBeInTheDocument();
    expect(screen.getByText('superspeceder')).toBeInTheDocument();
  });

  it('shows timing details', () => {
    render(<EvidencePanel detection={baseDetection} onReview={vi.fn()} />);
    expect(screen.getByText('23:00')).toBeInTheDocument();
  });

  it('renders Review button and calls onReview', () => {
    const onReview = vi.fn();
    render(<EvidencePanel detection={baseDetection} onReview={onReview} />);
    const reviewButton = screen.getByText('Review This Detection');
    fireEvent.click(reviewButton);
    expect(onReview).toHaveBeenCalledTimes(1);
  });
});

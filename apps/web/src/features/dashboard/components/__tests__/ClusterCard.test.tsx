// @vitest-environment jsdom
/**
 * ClusterCard Tests
 * Story 4.5 AC4.5.1: Cluster card rendering with location, count, time, severity, enumerators.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { ClusterCard } from '../ClusterCard';
import type { FraudClusterSummary } from '../../api/fraud.api';

afterEach(() => {
  cleanup();
});

const sampleCluster: FraudClusterSummary = {
  clusterId: 'cluster-001',
  center: { lat: 7.3775, lng: 3.9470 },
  radiusMeters: 50,
  detectionCount: 15,
  detectionIds: ['det-1', 'det-2', 'det-3'],
  timeRange: {
    earliest: '2026-02-15T10:30:00Z',
    latest: '2026-02-15T11:45:00Z',
  },
  severityRange: { min: 'medium', max: 'high' },
  enumerators: [
    { id: 'enum-1', name: 'Adewale Johnson' },
    { id: 'enum-2', name: 'Fatima Adebayo' },
  ],
  totalScoreAvg: 62.5,
  members: [
    {
      id: 'det-1', submissionId: 'sub-1', enumeratorId: 'enum-1',
      enumeratorName: 'Adewale Johnson', computedAt: '2026-02-15T10:30:00Z',
      submittedAt: '2026-02-15T10:00:00Z', totalScore: 65, severity: 'high',
      resolution: null, gpsLatitude: 7.3776, gpsLongitude: 3.9471,
    },
    {
      id: 'det-2', submissionId: 'sub-2', enumeratorId: 'enum-2',
      enumeratorName: 'Fatima Adebayo', computedAt: '2026-02-15T10:45:00Z',
      submittedAt: '2026-02-15T10:15:00Z', totalScore: 58, severity: 'medium',
      resolution: null, gpsLatitude: 7.3774, gpsLongitude: 3.9469,
    },
  ],
};

describe('ClusterCard', () => {
  it('renders detection count badge', () => {
    render(<ClusterCard cluster={sampleCluster} onViewCluster={vi.fn()} />);
    expect(screen.getByText('15 alerts')).toBeInTheDocument();
  });

  it('renders GPS coordinates', () => {
    render(<ClusterCard cluster={sampleCluster} onViewCluster={vi.fn()} />);
    expect(screen.getByText('7.3775, 3.9470')).toBeInTheDocument();
  });

  it('renders enumerator names', () => {
    render(<ClusterCard cluster={sampleCluster} onViewCluster={vi.fn()} />);
    expect(screen.getByText('Adewale Johnson, Fatima Adebayo')).toBeInTheDocument();
  });

  it('renders average score', () => {
    render(<ClusterCard cluster={sampleCluster} onViewCluster={vi.fn()} />);
    expect(screen.getByText('62.5')).toBeInTheDocument();
  });

  it('renders View Cluster button', () => {
    render(<ClusterCard cluster={sampleCluster} onViewCluster={vi.fn()} />);
    expect(screen.getByText('View Cluster')).toBeInTheDocument();
  });

  it('calls onViewCluster with cluster data when View Cluster is clicked', () => {
    const onViewCluster = vi.fn();
    render(<ClusterCard cluster={sampleCluster} onViewCluster={onViewCluster} />);
    fireEvent.click(screen.getByText('View Cluster'));
    expect(onViewCluster).toHaveBeenCalledWith(sampleCluster);
  });

  it('has data-testid with cluster ID', () => {
    render(<ClusterCard cluster={sampleCluster} onViewCluster={vi.fn()} />);
    expect(screen.getByTestId('cluster-card-cluster-001')).toBeInTheDocument();
  });

  it('renders severity range with min and max when different', () => {
    render(<ClusterCard cluster={sampleCluster} onViewCluster={vi.fn()} />);
    // Should show both severity badges separated by "to"
    expect(screen.getByText('to')).toBeInTheDocument();
  });

  it('renders single severity when min equals max', () => {
    const singleSeverity = { ...sampleCluster, severityRange: { min: 'high', max: 'high' } };
    render(<ClusterCard cluster={singleSeverity} onViewCluster={vi.fn()} />);
    expect(screen.queryByText('to')).not.toBeInTheDocument();
  });
});

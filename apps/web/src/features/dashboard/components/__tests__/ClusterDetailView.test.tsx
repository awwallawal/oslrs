// @vitest-environment jsdom
/**
 * ClusterDetailView Tests
 * Story 4.5 AC4.5.5: Map + submission list, individual GPS points, interactive markers.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

// Mock react-leaflet — jsdom doesn't support canvas/Leaflet
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, 'aria-label': ariaLabel }: { children: React.ReactNode; 'aria-label'?: string }) => (
    <div data-testid="map-container" aria-label={ariaLabel}>{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children, eventHandlers }: { children: React.ReactNode; eventHandlers?: { click?: () => void } }) => (
    <div data-testid="map-marker" onClick={eventHandlers?.click}>{children}</div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="map-popup">{children}</div>,
  Circle: () => <div data-testid="cluster-circle" />,
}));

vi.mock('../leaflet-icons', () => ({
  DefaultIcon: {},
  HighlightedIcon: {},
}));

import { ClusterDetailView } from '../ClusterDetailView';
import type { FraudClusterSummary } from '../../api/fraud.api';

afterEach(() => {
  cleanup();
});

const sampleCluster: FraudClusterSummary = {
  clusterId: 'cluster-001',
  center: { lat: 7.3775, lng: 3.9470 },
  radiusMeters: 50,
  detectionCount: 3,
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
      id: 'det-1',
      submissionId: 'sub-1',
      enumeratorId: 'enum-1',
      enumeratorName: 'Adewale Johnson',
      computedAt: '2026-02-15T10:30:00Z',
      submittedAt: '2026-02-15T10:00:00Z',
      totalScore: 65,
      severity: 'high',
      resolution: null,
      gpsLatitude: 7.3776,
      gpsLongitude: 3.9471,
    },
    {
      id: 'det-2',
      submissionId: 'sub-2',
      enumeratorId: 'enum-2',
      enumeratorName: 'Fatima Adebayo',
      computedAt: '2026-02-15T10:45:00Z',
      submittedAt: '2026-02-15T10:15:00Z',
      totalScore: 58,
      severity: 'medium',
      resolution: null,
      gpsLatitude: 7.3774,
      gpsLongitude: 3.9469,
    },
    {
      id: 'det-3',
      submissionId: 'sub-3',
      enumeratorId: 'enum-1',
      enumeratorName: 'Adewale Johnson',
      computedAt: '2026-02-15T11:00:00Z',
      submittedAt: '2026-02-15T10:30:00Z',
      totalScore: 64.5,
      severity: 'high',
      resolution: null,
      gpsLatitude: 7.3777,
      gpsLongitude: 3.9472,
    },
  ],
};

describe('ClusterDetailView', () => {
  const defaultProps = {
    cluster: sampleCluster,
    selectedIds: new Set(['det-1', 'det-2', 'det-3']),
    onToggle: vi.fn(),
    onBack: vi.fn(),
  };

  it('renders the cluster detail view container', () => {
    render(<ClusterDetailView {...defaultProps} />);
    expect(screen.getByTestId('cluster-detail-view')).toBeInTheDocument();
  });

  it('renders back button that calls onBack when clicked', () => {
    const onBack = vi.fn();
    render(<ClusterDetailView {...defaultProps} onBack={onBack} />);
    fireEvent.click(screen.getByTestId('cluster-back-button'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders cluster alert count in header', () => {
    render(<ClusterDetailView {...defaultProps} />);
    expect(screen.getByText(/3 alerts/)).toBeInTheDocument();
  });

  it('renders map container with Leaflet', () => {
    render(<ClusterDetailView {...defaultProps} />);
    expect(screen.getByTestId('cluster-map')).toBeInTheDocument();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders a marker for each cluster member', () => {
    render(<ClusterDetailView {...defaultProps} />);
    const markers = screen.getAllByTestId('map-marker');
    expect(markers).toHaveLength(3);
  });

  it('renders cluster radius circle overlay', () => {
    render(<ClusterDetailView {...defaultProps} />);
    expect(screen.getByTestId('cluster-circle')).toBeInTheDocument();
  });

  it('renders submission list with all cluster members', () => {
    render(<ClusterDetailView {...defaultProps} />);
    // Adewale Johnson appears in both map popups and submission list (det-1 and det-3)
    const awElements = screen.getAllByText('Adewale Johnson');
    expect(awElements.length).toBeGreaterThanOrEqual(2);
    const faElements = screen.getAllByText('Fatima Adebayo');
    expect(faElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders checkboxes for each member row', () => {
    render(<ClusterDetailView {...defaultProps} />);
    expect(screen.getByTestId('cluster-checkbox-det-1')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-checkbox-det-2')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-checkbox-det-3')).toBeInTheDocument();
  });

  it('calls onToggle when checkbox is clicked', () => {
    const onToggle = vi.fn();
    render(<ClusterDetailView {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('cluster-checkbox-det-1'));
    expect(onToggle).toHaveBeenCalledWith('det-1');
  });

  it('highlights list row when clicked', () => {
    render(<ClusterDetailView {...defaultProps} />);
    const row = screen.getByTestId('cluster-row-det-1');
    fireEvent.click(row);
    expect(row.className).toContain('bg-amber-50');
  });

  it('renders scores in submission list', () => {
    render(<ClusterDetailView {...defaultProps} />);
    expect(screen.getByText('65.0')).toBeInTheDocument();
    expect(screen.getByText('58.0')).toBeInTheDocument();
    expect(screen.getByText('64.5')).toBeInTheDocument();
  });

  it('renders submission list table with correct role and aria-label', () => {
    render(<ClusterDetailView {...defaultProps} />);
    expect(screen.getByRole('table', { name: 'Cluster submissions' })).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
/**
 * TeamGpsMap Tests
 *
 * Story 4.1 AC4.1.3: GPS Map View of Latest Submissions
 * Tests computeCenter logic and component rendering.
 * Leaflet is mocked since jsdom can't render canvas/WebGL.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);

// Mock react-leaflet (jsdom can't render real Leaflet)
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, 'aria-label': ariaLabel }: { children: React.ReactNode; 'aria-label'?: string }) => (
    <div data-testid="mock-map" aria-label={ariaLabel}>{children}</div>
  ),
  TileLayer: () => <div data-testid="mock-tile-layer" />,
  Marker: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-marker">{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-popup">{children}</div>,
}));

// Mock leaflet
vi.mock('leaflet', () => ({
  default: {
    icon: vi.fn(() => ({})),
    Marker: { prototype: { options: {} } },
  },
}));

// Mock leaflet CSS import
vi.mock('leaflet/dist/leaflet.css', () => ({}));

import { computeCenter, TeamGpsMap } from '../TeamGpsMap';
import type { GpsPoint } from '../../api/supervisor.api';

describe('computeCenter', () => {
  it('returns Ibadan default for empty points', () => {
    const center = computeCenter([]);
    expect(center).toEqual([7.3775, 3.947]);
  });

  it('returns single point coordinates when one point', () => {
    const points: GpsPoint[] = [
      { enumeratorId: 'e1', enumeratorName: 'Alice', latitude: 8.0, longitude: 4.0, submittedAt: '2026-02-18T09:00:00Z' },
    ];
    const center = computeCenter(points);
    expect(center).toEqual([8.0, 4.0]);
  });

  it('returns average coordinates for multiple points', () => {
    const points: GpsPoint[] = [
      { enumeratorId: 'e1', enumeratorName: 'Alice', latitude: 7.0, longitude: 3.0, submittedAt: '2026-02-18T09:00:00Z' },
      { enumeratorId: 'e2', enumeratorName: 'Bob', latitude: 9.0, longitude: 5.0, submittedAt: '2026-02-18T08:00:00Z' },
    ];
    const center = computeCenter(points);
    expect(center).toEqual([8.0, 4.0]);
  });
});

describe('TeamGpsMap', () => {
  const samplePoints: GpsPoint[] = [
    { enumeratorId: 'e1', enumeratorName: 'Alice Enumerator', latitude: 7.3775, longitude: 3.947, submittedAt: '2026-02-18T09:00:00Z' },
    { enumeratorId: 'e2', enumeratorName: 'Bob Enumerator', latitude: 7.38, longitude: 3.95, submittedAt: '2026-02-18T08:00:00Z' },
  ];

  it('renders map container with accessible label', () => {
    render(<TeamGpsMap points={samplePoints} />);
    expect(screen.getByTestId('gps-map-container')).toBeInTheDocument();
    expect(screen.getByLabelText('Enumerator submission locations map')).toBeInTheDocument();
  });

  it('renders a marker for each GPS point', () => {
    render(<TeamGpsMap points={samplePoints} />);
    const markers = screen.getAllByTestId('mock-marker');
    expect(markers).toHaveLength(2);
  });

  it('renders enumerator names in popups', () => {
    render(<TeamGpsMap points={samplePoints} />);
    expect(screen.getByText('Alice Enumerator')).toBeInTheDocument();
    expect(screen.getByText('Bob Enumerator')).toBeInTheDocument();
  });

  it('renders tile layer for OpenStreetMap', () => {
    render(<TeamGpsMap points={samplePoints} />);
    expect(screen.getByTestId('mock-tile-layer')).toBeInTheDocument();
  });
});

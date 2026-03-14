// @vitest-environment jsdom
/**
 * LgaChoroplethMap Tests
 * Story 8.8 AC#1: Choropleth map rendering, tooltip, click, highlight, suppression.
 * Leaflet is mocked since jsdom can't render real Leaflet.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);

// Track style/tooltip/event calls per feature
const mockStyles = new Map<string, Record<string, unknown>>();
const mockTooltips = new Map<string, string>();
const mockClickHandlers = new Map<string, (e: unknown) => void>();

// Mock react-leaflet
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, 'aria-label': ariaLabel }: { children: React.ReactNode; 'aria-label'?: string }) => (
    <div data-testid="mock-map" aria-label={ariaLabel}>{children}</div>
  ),
  TileLayer: () => <div data-testid="mock-tile-layer" />,
  GeoJSON: ({ data, style, onEachFeature }: {
    data: { features: { properties: { lgaName: string; lgaCode: string } }[] };
    style?: (feature: unknown) => Record<string, unknown>;
    onEachFeature?: (feature: unknown, layer: unknown) => void;
  }) => {
    mockStyles.clear();
    mockTooltips.clear();
    mockClickHandlers.clear();
    return (
      <div data-testid="mock-geojson">
        {data.features.map((f: { properties: { lgaName: string; lgaCode: string } }) => {
          const featureStyle = style ? style(f) : {};
          mockStyles.set(f.properties.lgaName, featureStyle);

          if (onEachFeature) {
            const mockLayer = {
              bindTooltip: (content: string) => { mockTooltips.set(f.properties.lgaName, content); },
              on: (event: string, handler: (e: unknown) => void) => {
                if (event === 'click') mockClickHandlers.set(f.properties.lgaName, handler);
              },
              setStyle: vi.fn(),
            };
            onEachFeature(f, mockLayer);
          }

          return (
            <div
              key={f.properties.lgaCode}
              data-testid={`lga-feature-${f.properties.lgaCode}`}
              data-fill-color={String(featureStyle.fillColor ?? '')}
              data-lga-name={f.properties.lgaName}
            >
              {f.properties.lgaName}
            </div>
          );
        })}
      </div>
    );
  },
}));

vi.mock('leaflet', () => ({
  default: {
    icon: vi.fn(() => ({})),
    Marker: { prototype: { options: {} } },
  },
}));
vi.mock('leaflet/dist/leaflet.css', () => ({}));

const mockGeoJson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { lgaName: 'Ibadan North', lgaCode: 'ibadan_north' }, geometry: { type: 'Polygon', coordinates: [[[3.9, 7.4], [3.9, 7.5], [4.0, 7.5], [4.0, 7.4], [3.9, 7.4]]] } },
    { type: 'Feature', properties: { lgaName: 'Akinyele', lgaCode: 'akinyele' }, geometry: { type: 'Polygon', coordinates: [[[3.9, 7.5], [3.9, 7.6], [4.0, 7.6], [4.0, 7.5], [3.9, 7.5]]] } },
    { type: 'Feature', properties: { lgaName: 'Ido', lgaCode: 'ido' }, geometry: { type: 'Polygon', coordinates: [[[3.7, 7.3], [3.7, 7.4], [3.8, 7.4], [3.8, 7.3], [3.7, 7.3]]] } },
  ],
};

import { LgaChoroplethMap, _resetGeoJsonCache } from '../LgaChoroplethMap';

beforeEach(() => {
  vi.clearAllMocks();
  _resetGeoJsonCache();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockGeoJson),
  });
});

describe('LgaChoroplethMap', () => {
  const sampleData = [
    { lgaName: 'Ibadan North', value: 100 },
    { lgaName: 'Akinyele', value: 50 },
  ];

  it('renders MapContainer with GeoJSON features', async () => {
    render(<LgaChoroplethMap data={sampleData} />);
    await vi.waitFor(() => {
      expect(screen.getByTestId('mock-geojson')).toBeInTheDocument();
    });
    expect(screen.getByTestId('lga-choropleth-map')).toBeInTheDocument();
    expect(screen.getByLabelText('LGA choropleth map')).toBeInTheDocument();
    expect(screen.getByTestId('lga-feature-ibadan_north')).toBeInTheDocument();
    expect(screen.getByTestId('lga-feature-akinyele')).toBeInTheDocument();
    expect(screen.getByTestId('lga-feature-ido')).toBeInTheDocument();
  });

  it('tooltip shows LGA name and count on hover', async () => {
    render(<LgaChoroplethMap data={sampleData} />);
    await vi.waitFor(() => {
      expect(screen.getByTestId('mock-geojson')).toBeInTheDocument();
    });
    expect(mockTooltips.get('Ibadan North')).toContain('Ibadan North');
    expect(mockTooltips.get('Ibadan North')).toContain('100');
    expect(mockTooltips.get('Akinyele')).toContain('50');
  });

  it('suppressed LGAs show "Insufficient data"', async () => {
    const dataWithLow = [
      { lgaName: 'Ibadan North', value: 100 },
      { lgaName: 'Akinyele', value: 3 },
    ];
    render(<LgaChoroplethMap data={dataWithLow} suppressionMinN={10} />);
    await vi.waitFor(() => {
      expect(screen.getByTestId('mock-geojson')).toBeInTheDocument();
    });
    expect(mockTooltips.get('Akinyele')).toContain('Insufficient data');
    expect(mockTooltips.get('Ibadan North')).not.toContain('Insufficient data');
  });

  it('onLgaClick fires with correct lgaCode', async () => {
    const onClick = vi.fn();
    render(<LgaChoroplethMap data={sampleData} onLgaClick={onClick} />);
    await vi.waitFor(() => {
      expect(screen.getByTestId('mock-geojson')).toBeInTheDocument();
    });
    const handler = mockClickHandlers.get('Ibadan North');
    expect(handler).toBeDefined();
    handler!({});
    expect(onClick).toHaveBeenCalledWith('ibadan_north');
  });

  it('highlightLgaName greys out non-target LGAs', async () => {
    render(<LgaChoroplethMap data={sampleData} highlightLgaName="Ibadan North" />);
    await vi.waitFor(() => {
      expect(screen.getByTestId('mock-geojson')).toBeInTheDocument();
    });
    const akinyeleStyle = mockStyles.get('Akinyele');
    expect(akinyeleStyle?.fillColor).toBe('#E5E7EB');
    const ibadanStyle = mockStyles.get('Ibadan North');
    expect(ibadanStyle?.fillColor).not.toBe('#E5E7EB');
  });
});

/**
 * LGA Choropleth Map Component
 * Story 8.8 AC#1, AC#2, AC#3: Interactive Leaflet choropleth of Oyo State's 33 LGAs.
 * Color intensity proportional to registration count per LGA.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MapContainer, GeoJSON, TileLayer } from 'react-leaflet';
import type { Layer, LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LgaChoroplethMapProps {
  /**
   * Array of LGA data — `lgaName` must match the GeoJSON feature `lgaName`.
   * Story 13-33 AC3: a datum may carry `banded: true` (present but below the
   * public k-anon floor) — it renders in the lightest "present" shade with NO
   * exact number, distinct from an absent LGA (not in the array → blank).
   */
  data: { lgaName: string; value: number; banded?: boolean }[];
  /** Color gradient [min, max]. Default: ['#FEE2E2', '#9C1E23'] (light pink → brand maroon) */
  colorScale?: [string, string];
  /** Fires on LGA click with the LGA code (slug). Omit to disable click. */
  onLgaClick?: (lgaCode: string) => void;
  /** When set, this LGA renders in full color and all others are greyed out (Supervisor view) */
  highlightLgaName?: string;
  /**
   * Legacy blank-suppression for INTERNAL dashboards: LGAs with value < this show
   * "Insufficient data" (grey). Default 0 (off). Story 13-33: the PUBLIC map no
   * longer passes this — banded disclosure comes pre-computed from the backend via
   * the datum `banded` flag (the single suppression authority). A `banded` datum
   * always takes precedence over this legacy threshold.
   */
  suppressionMinN?: number;
  className?: string;
}

interface GeoJsonFeature {
  type: 'Feature';
  properties: { lgaName: string; lgaCode: string };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}

interface GeoJsonCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

// Module-scope cache — avoids re-fetching on re-render
let cachedGeoJson: GeoJsonCollection | null = null;
let fetchPromise: Promise<GeoJsonCollection> | null = null;

function loadGeoJson(): Promise<GeoJsonCollection> {
  if (cachedGeoJson) return Promise.resolve(cachedGeoJson);
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch('/geo/oyo-lgas.geojson')
    .then(r => {
      if (!r.ok) throw new Error(`GeoJSON fetch failed: ${r.status}`);
      return r.json();
    })
    .then((data: GeoJsonCollection) => {
      cachedGeoJson = data;
      return data;
    })
    .catch((err) => {
      fetchPromise = null; // allow retry on next render
      throw err;
    });
  return fetchPromise;
}

/** @internal Test-only: reset module-scope cache */
export function _resetGeoJsonCache() {
  cachedGeoJson = null;
  fetchPromise = null;
}

/** Parse hex to [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Interpolate between two hex colors */
function interpolateColor(min: string, max: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(min);
  const [r2, g2, b2] = hexToRgb(max);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

const GREY = '#E5E7EB';
const OYO_CENTER: [number, number] = [7.85, 3.75];

export function LgaChoroplethMap({
  data,
  colorScale = ['#FEE2E2', '#9C1E23'],
  onLgaClick,
  highlightLgaName,
  suppressionMinN = 0,
  className,
}: LgaChoroplethMapProps) {
  const [geoJson, setGeoJson] = useState<GeoJsonCollection | null>(cachedGeoJson);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (!geoJson) {
      loadGeoJson().then(setGeoJson);
    }
  }, [geoJson]);

  // Build lookup: lgaName → datum (memoized to stabilize useCallback deps).
  const dataMap = useMemo(() => new Map(data.map(d => [d.lgaName, d])), [data]);
  // Colour scale spans only EXACT (non-banded) present values.
  const values = useMemo(() => data.filter(d => !d.banded && d.value > 0).map(d => d.value), [data]);
  const minVal = values.length > 0 ? Math.min(...values) : 0;
  const maxVal = values.length > 0 ? Math.max(...values) : 1;
  // Stable key for GeoJSON re-mount when data changes
  const dataKey = useMemo(() => data.map(d => `${d.lgaName}:${d.value}:${d.banded ? 'b' : ''}`).join(','), [data]);

  const getStyle = useCallback((feature: GeoJsonFeature) => {
    const lgaName = feature.properties.lgaName;
    const datum = dataMap.get(lgaName);

    // Supervisor view: grey out non-highlighted LGAs
    if (highlightLgaName && lgaName !== highlightLgaName) {
      return { fillColor: GREY, fillOpacity: 0.5, weight: 1, color: '#9CA3AF', opacity: 0.6 };
    }

    // Absent (not in data) → blank. Legacy internal suppression (value < minN,
    // non-banded) → blank too.
    const isLegacySuppressed = datum != null && !datum.banded && suppressionMinN > 0 && datum.value < suppressionMinN;
    if (datum == null || isLegacySuppressed) {
      return { fillColor: GREY, fillOpacity: 0.4, weight: 1, color: '#9CA3AF', opacity: 0.6 };
    }

    // Banded (present, <k-anon floor): lightest "present" shade, no graduation.
    if (datum.banded) {
      return { fillColor: colorScale[0], fillOpacity: 0.65, weight: 1, color: '#fff', opacity: 0.8 };
    }

    const t = maxVal > minVal ? (datum.value - minVal) / (maxVal - minVal) : 0.5;
    const fillColor = interpolateColor(colorScale[0], colorScale[1], t);
    return { fillColor, fillOpacity: 0.75, weight: 1, color: '#fff', opacity: 0.8 };
  }, [dataMap, minVal, maxVal, highlightLgaName, suppressionMinN, colorScale]);

  const onEachFeature = useCallback((feature: GeoJsonFeature, layer: Layer) => {
    const lgaName = feature.properties.lgaName;
    const datum = dataMap.get(lgaName);
    const isLegacySuppressed = datum != null && !datum.banded && suppressionMinN > 0 && datum.value < suppressionMinN;

    // Tooltip: banded → "fewer than N" (no exact number); exact → the count;
    // absent/legacy-suppressed → "Insufficient data".
    let tooltipContent: string;
    if (datum != null && datum.banded) {
      tooltipContent = `<strong>${lgaName}</strong><br/>Fewer than 10 registrations`;
    } else if (datum == null || isLegacySuppressed) {
      tooltipContent = `<strong>${lgaName}</strong><br/>Insufficient data`;
    } else {
      tooltipContent = `<strong>${lgaName}</strong><br/>${datum.value.toLocaleString()} registrations`;
    }
    layer.bindTooltip(tooltipContent);

    // Click handler
    if (onLgaClick) {
      layer.on('click', (_e: LeafletMouseEvent) => {
        onLgaClick(feature.properties.lgaCode);
      });
    }

    // Hover effects
    layer.on('mouseover', () => {
      (layer as L.Path).setStyle({ weight: 2, color: '#1F2937', opacity: 1 });
    });
    layer.on('mouseout', () => {
      if (geoJsonRef.current) geoJsonRef.current.resetStyle(layer as L.Path);
    });
  }, [dataMap, suppressionMinN, onLgaClick]);

  if (!geoJson) {
    return (
      <div className={`flex items-center justify-center bg-neutral-50 rounded-lg min-h-[400px] ${className ?? ''}`}>
        <div className="animate-pulse text-neutral-400 text-sm">Loading map...</div>
      </div>
    );
  }

  return (
    <div className={className} data-testid="lga-choropleth-map">
      <MapContainer
        center={OYO_CENTER}
        zoom={8}
        scrollWheelZoom={false}
        className="h-full w-full rounded-lg"
        style={{ minHeight: '400px' }}
        aria-label="LGA choropleth map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GeoJSON
          key={dataKey}
          ref={(ref) => { geoJsonRef.current = ref; }}
          data={geoJson as GeoJSON.FeatureCollection}
          style={(feature) => getStyle(feature as unknown as GeoJsonFeature)}
          onEachFeature={(feature, layer) => onEachFeature(feature as unknown as GeoJsonFeature, layer)}
        />
      </MapContainer>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-2 text-xs text-neutral-500" data-testid="choropleth-legend">
        <span>{minVal.toLocaleString()}</span>
        <div
          className="h-3 flex-1 rounded"
          style={{ background: `linear-gradient(to right, ${colorScale[0]}, ${colorScale[1]})` }}
        />
        <span>{maxVal.toLocaleString()}</span>
        <span className="ml-2 inline-block w-4 h-3 rounded" style={{ background: GREY }} />
        <span>No data</span>
      </div>
    </div>
  );
}
